// Guarda as sessões abertas, encaminha cada chamada ao adaptador certo e mantém
// o histórico de cada conversa. Um projeto pode ter várias conversas, e cada uma
// pode ter um agente rodando ao mesmo tempo: é assim que dá para usar Claude e
// ChatGPT em paralelo.
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveSettings } from '../../shared/agents'
import { addUserMessage, applyEvent, setPermission } from '../../shared/chat'
import { QUICK_PROJECT_ID } from '../../shared/types'
import type {
  AgentEvent,
  Attachment,
  AgentId,
  AgentSession,
  AgentSettings,
  ChatItem,
  Conversation,
  ConversationRecord
} from '../../shared/types'
import type { AgentAdapter } from './adapter'
import { claudeAdapter } from './claude'
import { codexAdapter } from './codex'
import { geminiAdapter } from './gemini'
import * as history from './history'
import * as projects from '../projects/store'
import { withSkills } from '../skills/prompt'
import * as skillStore from '../skills/store'
import { isAttachment } from '../attachments/store'

/** Pasta onde os agentes dos chats rápidos trabalham (não há projeto). */
async function quickFolder(): Promise<string> {
  const dir = join(app.getPath('userData'), 'quick-chats')
  await mkdir(dir, { recursive: true })
  return dir
}

/** Pasta de trabalho da conversa: a do projeto, ou a dos chats rápidos. */
async function workFolder(projectId: string): Promise<string> {
  if (projectId === QUICK_PROJECT_ID) return quickFolder()
  const project = await projects.get(projectId)
  if (!project) throw new Error(`Projeto não encontrado: ${projectId}`)
  return project.path
}

/** Lista os anexos no fim da mensagem, para o agente poder abrir pelo caminho. */
function withAttachments(message: string, attachments: Attachment[]): string {
  if (attachments.length === 0) return message
  const lines = attachments.map(
    (a) => `- ${a.path}${a.kind === 'image' ? ' (imagem, também enviada junto)' : ''}`
  )
  const header = 'Arquivos anexados pelo usuário (abra pelo caminho se precisar):'
  return [message, '', header, ...lines].join('\n')
}

export const adapters: Record<AgentId, AgentAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  gemini: geminiAdapter
}

function summary(projectId: string, record: ConversationRecord): Conversation {
  return {
    id: record.id,
    projectId,
    agent: record.agent,
    name: record.name,
    bypass: record.bypass === true,
    settings: resolveSettings(record.agent, record.settings)
  }
}

export class AgentManager {
  private sessions = new Map<string, AgentSession>()

  constructor(private emit: (event: AgentEvent) => void) {}

  // ---- Conversas ------------------------------------------------------------

  async list(projectId: string): Promise<Conversation[]> {
    return (await history.load(projectId)).conversations.map((c) => summary(projectId, c))
  }

  items(projectId: string, conversationId: string): Promise<ChatItem[]> {
    return history.items(projectId, conversationId)
  }

  async create(projectId: string, agent: AgentId): Promise<Conversation> {
    if (!adapters[agent]) throw new Error(`Agente desconhecido: ${agent}`)
    return summary(projectId, await history.create(projectId, agent))
  }

  rename(projectId: string, conversationId: string, name: string): Promise<void> {
    return history.renameConversation(projectId, conversationId, name)
  }

  async remove(projectId: string, conversationId: string): Promise<void> {
    await this.stopWhere((s) => s.conversationId === conversationId)
    await history.remove(projectId, conversationId)
  }

  reorder(projectId: string, ids: string[]): Promise<void> {
    return history.reorder(projectId, ids)
  }

  async setBypass(projectId: string, conversationId: string, on: boolean): Promise<void> {
    await history.setBypass(projectId, conversationId, on)
    if (!on) return
    // Pedidos que já estavam na tela esperando você também são aprovados.
    const session = [...this.sessions.values()].find((s) => s.conversationId === conversationId)
    const pending = history
      .cached(projectId, conversationId)
      ?.items.filter((item) => item.kind === 'permission' && item.state === 'pending')
    if (!session || !pending) return
    for (const item of pending) this.autoApprove(session, item.id)
  }

  async setSettings(
    projectId: string,
    conversationId: string,
    change: Partial<AgentSettings>
  ): Promise<AgentSettings> {
    const record = await history.get(projectId, conversationId)
    // Valores fora da lista do agente caem no padrão; nada desconhecido chega ao agente.
    const settings = resolveSettings(record.agent, {
      ...resolveSettings(record.agent, record.settings),
      ...change
    })
    await history.setSettings(projectId, conversationId, settings)
    const session = [...this.sessions.values()].find((s) => s.conversationId === conversationId)
    if (session) await adapters[session.agent].configure(session.id, settings)
    return settings
  }

  /** Encerra e apaga todas as conversas do projeto. */
  async removeAll(projectId: string): Promise<void> {
    await this.stopWhere((s) => s.projectId === projectId)
    await history.removeProject(projectId)
  }

  // ---- Sessões --------------------------------------------------------------

  async start(projectId: string, conversationId: string): Promise<AgentSession> {
    const cwd = await workFolder(projectId)
    const record = await history.get(projectId, conversationId)

    // Um agente por conversa: iniciar de novo substitui o anterior.
    await this.stopWhere((s) => s.conversationId === conversationId)

    const session: AgentSession = {
      id: randomUUID(),
      projectId,
      conversationId,
      agent: record.agent,
      status: 'idle'
    }
    this.sessions.set(session.id, session)

    const emit = (event: AgentEvent): void => {
      history.update(projectId, conversationId, (current) =>
        event.type === 'resume-id'
          ? { ...current, resumeId: event.resumeId }
          : { ...current, items: applyEvent(current.items, event) }
      )
      this.emit(event)
      // Bypass ligado: aprova na hora. Fica para depois do evento para o adaptador
      // já ter registrado o pedido e a tela já ter o cartão para marcar.
      if (event.type === 'permission' && history.cached(projectId, conversationId)?.bypass) {
        setImmediate(() => this.autoApprove(session, event.requestId))
      }
    }

    try {
      await adapters[record.agent].start(
        session.id,
        cwd,
        emit,
        record.resumeId,
        resolveSettings(record.agent, record.settings)
      )
    } catch (err) {
      this.sessions.delete(session.id)
      throw err
    }
    return session
  }

  /**
   * Envia a mensagem. Com skills, o texto delas vai junto para o agente; o
   * histórico guarda só a sua mensagem e os nomes das skills.
   */
  async send(
    sessionId: string,
    message: string,
    skillIds: string[] = [],
    attachments: Attachment[] = []
  ): Promise<void> {
    const session = this.sessionOf(sessionId)
    // Só anexos guardados pelo app; um caminho qualquer vindo da tela é recusado.
    if (attachments.some((a) => !isAttachment(a.path))) {
      throw new Error('Um dos anexos não foi encontrado. Anexe o arquivo de novo.')
    }
    // Lê as skills antes de gravar: se uma sumiu do disco, nada é enviado.
    const skills = await skillStore.contents(session.projectId, skillIds)
    history.update(session.projectId, session.conversationId, (c) => ({
      ...c,
      items: addUserMessage(
        c.items,
        message,
        skills.map((s) => s.name),
        attachments
      )
    }))
    const images = attachments
      .filter((a) => a.kind === 'image')
      .map((a) => ({ path: a.path, mime: a.mime }))
    await adapters[session.agent].send(
      sessionId,
      withAttachments(withSkills(message, skills), attachments),
      images
    )
  }

  async respond(sessionId: string, requestId: string, allow: boolean): Promise<void> {
    const session = this.sessionOf(sessionId)
    await adapters[session.agent].respond(sessionId, requestId, allow)
    history.update(session.projectId, session.conversationId, (c) => ({
      ...c,
      items: setPermission(c.items, requestId, allow ? 'allowed' : 'denied')
    }))
  }

  async interrupt(sessionId: string): Promise<void> {
    const session = this.sessionOf(sessionId)
    await adapters[session.agent].interrupt(sessionId)
  }

  async stop(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    this.sessions.delete(sessionId)
    await adapters[session.agent].stop(sessionId)
  }

  async stopAll(): Promise<void> {
    await this.stopWhere(() => true)
    await history.flush()
  }

  private async stopWhere(match: (session: AgentSession) => boolean): Promise<void> {
    const ids = [...this.sessions.values()].filter(match).map((s) => s.id)
    await Promise.allSettled(ids.map((id) => this.stop(id)))
  }

  /** Aprova um pedido sem perguntar e avisa a tela, que mostra o pedido como "aprovado (bypass)". */
  private autoApprove(session: AgentSession, requestId: string): void {
    if (!this.sessions.has(session.id)) return
    adapters[session.agent]
      .respond(session.id, requestId, true)
      .then(() => {
        const resolved: AgentEvent = {
          type: 'permission-resolved',
          sessionId: session.id,
          requestId,
          state: 'auto'
        }
        history.update(session.projectId, session.conversationId, (c) => ({
          ...c,
          items: applyEvent(c.items, resolved)
        }))
        this.emit(resolved)
        this.emit({ type: 'status', sessionId: session.id, status: 'running' })
      })
      // Pedido que já foi respondido ou cancelado: nada a fazer.
      .catch(() => undefined)
  }

  private sessionOf(sessionId: string): AgentSession {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Esta conversa não está mais ativa.')
    return session
  }
}
