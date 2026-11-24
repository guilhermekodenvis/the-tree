// Guarda as sessões abertas, encaminha cada chamada ao adaptador certo e mantém
// o histórico salvo de cada conversa. Várias sessões podem rodar em paralelo
// (uma por projeto): é assim que dá para usar Claude e ChatGPT ao mesmo tempo.
import { randomUUID } from 'node:crypto'
import { addUserMessage, applyEvent, setPermission } from '../../shared/chat'
import type { AgentEvent, AgentId, AgentSession, ChatRecord } from '../../shared/types'
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

export class AgentManager {
  private sessions = new Map<string, AgentSession>()

  constructor(private emit: (event: AgentEvent) => void) {}

  history(projectId: string): Promise<ChatRecord | null> {
    return history.load(projectId)
  }

  async start(projectId: string, agent: AgentId, resume: boolean): Promise<AgentSession> {
    const project = await projects.get(projectId)
    if (!project) throw new Error(`Projeto não encontrado: ${projectId}`)

    // Uma conversa por projeto: iniciar de novo substitui a anterior.
    await this.stopProject(projectId)

    const saved = resume ? await history.load(projectId) : null
    const record: ChatRecord =
      saved && saved.agent === agent ? saved : { agent, items: [], updatedAt: Date.now() }

    const session: AgentSession = { id: randomUUID(), projectId, agent, status: 'idle' }
    this.sessions.set(session.id, session)

    const emit = (event: AgentEvent): void => {
      this.record(projectId, event)
      this.emit(event)
    }

    // Grava antes de iniciar: os primeiros eventos do agente já atualizam este registro.
    history.save(projectId, record)
    try {
      await adapters[agent].start(session.id, project.path, emit, record.resumeId)
    } catch (err) {
      this.sessions.delete(session.id)
      throw err
    }
    return session
  }

  async send(sessionId: string, message: string): Promise<void> {
    const session = this.sessionOf(sessionId)
    this.update(session.projectId, (record) => ({
      ...record,
      items: addUserMessage(record.items, message)
    }))
    await adapters[session.agent].send(sessionId, message)
  }

  async respond(sessionId: string, requestId: string, allow: boolean): Promise<void> {
    const session = this.sessionOf(sessionId)
    await adapters[session.agent].respond(sessionId, requestId, allow)
    this.update(session.projectId, (record) => ({
      ...record,
      items: setPermission(record.items, requestId, allow ? 'allowed' : 'denied')
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

  /** Encerra a conversa do projeto e apaga o histórico. */
  async forget(projectId: string): Promise<void> {
    await this.stopProject(projectId)
    await history.remove(projectId)
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled([...this.sessions.keys()].map((id) => this.stop(id)))
    await history.flush()
  }

  private async stopProject(projectId: string): Promise<void> {
    const ids = [...this.sessions.values()].filter((s) => s.projectId === projectId).map((s) => s.id)
    await Promise.allSettled(ids.map((id) => this.stop(id)))
  }

  /** Aplica um evento ao histórico salvo do projeto. */
  private record(projectId: string, event: AgentEvent): void {
    this.update(projectId, (record) =>
      event.type === 'resume-id'
        ? { ...record, resumeId: event.resumeId }
        : { ...record, items: applyEvent(record.items, event) }
    )
  }

  /**
   * Altera o histórico do projeto de forma síncrona. A conversa já está na memória
   * desde start(); sem espera no meio, eventos seguidos nunca se sobrescrevem.
   */
  private update(projectId: string, change: (record: ChatRecord) => ChatRecord): void {
    const record = history.cached(projectId)
    if (record) history.save(projectId, change(record))
  }

  private sessionOf(sessionId: string): AgentSession {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Esta conversa não está mais ativa.')
    return session
  }
}
