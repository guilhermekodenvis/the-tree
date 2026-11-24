// Guarda as sessões abertas, encaminha cada chamada ao adaptador certo e mantém
// o histórico de cada conversa. Um projeto pode ter várias conversas, e cada uma
// pode ter um agente rodando ao mesmo tempo: é assim que dá para usar Claude e
// ChatGPT em paralelo.
import { randomUUID } from 'node:crypto'
import { addUserMessage, applyEvent, setPermission } from '../../shared/chat'
import type { AgentEvent, AgentId, AgentSession, ChatItem, Conversation, ConversationRecord } from '../../shared/types'
import type { AgentAdapter } from './adapter'
import { claudeAdapter } from './claude'
import { codexAdapter } from './codex'
import { geminiAdapter } from './gemini'
import * as history from './history'
import * as projects from '../projects/store'

const adapters: Record<AgentId, AgentAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  gemini: geminiAdapter
}

function summary(projectId: string, record: ConversationRecord): Conversation {
  return { id: record.id, projectId, agent: record.agent, name: record.name }
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

  /** Encerra e apaga todas as conversas do projeto. */
  async removeAll(projectId: string): Promise<void> {
    await this.stopWhere((s) => s.projectId === projectId)
    await history.removeProject(projectId)
  }

  // ---- Sessões --------------------------------------------------------------

  async start(projectId: string, conversationId: string): Promise<AgentSession> {
    const project = await projects.get(projectId)
    if (!project) throw new Error(`Projeto não encontrado: ${projectId}`)
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
    }

    try {
      await adapters[record.agent].start(session.id, project.path, emit, record.resumeId)
    } catch (err) {
      this.sessions.delete(session.id)
      throw err
    }
    return session
  }

  async send(sessionId: string, message: string): Promise<void> {
    const session = this.sessionOf(sessionId)
    history.update(session.projectId, session.conversationId, (c) => ({
      ...c,
      items: addUserMessage(c.items, message)
    }))
    await adapters[session.agent].send(sessionId, message)
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

  private sessionOf(sessionId: string): AgentSession {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Esta conversa não está mais ativa.')
    return session
  }
}
