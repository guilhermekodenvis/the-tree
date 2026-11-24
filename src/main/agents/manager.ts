// Guarda as sessões abertas e encaminha cada chamada ao adaptador certo.
// É aqui que "usar Claude e ChatGPT ao mesmo tempo" acontece: várias sessões vivas em paralelo.
import { randomUUID } from 'node:crypto'
import type { AgentEvent, AgentId, AgentSession } from '../../shared/types'
import type { AgentAdapter } from './adapter'
import { claudeAdapter } from './claude'
import { codexAdapter } from './codex'
import { geminiAdapter } from './gemini'
import * as projects from '../projects/store'

const adapters: Record<AgentId, AgentAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  gemini: geminiAdapter
}

export class AgentManager {
  private sessions = new Map<string, AgentSession>()

  constructor(private emit: (event: AgentEvent) => void) {}

  async start(projectId: string, agent: AgentId): Promise<AgentSession> {
    const project = await projects.get(projectId)
    if (!project) throw new Error(`Projeto não encontrado: ${projectId}`)

    const session: AgentSession = { id: randomUUID(), projectId, agent, status: 'idle' }
    await adapters[agent].start(session.id, project.path, this.emit)
    this.sessions.set(session.id, session)
    return session
  }

  async send(sessionId: string, message: string): Promise<void> {
    await this.adapterOf(sessionId).send(sessionId, message)
  }

  async stop(sessionId: string): Promise<void> {
    await this.adapterOf(sessionId).stop(sessionId)
    this.sessions.delete(sessionId)
  }

  private adapterOf(sessionId: string): AgentAdapter {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Sessão não encontrada: ${sessionId}`)
    return adapters[session.agent]
  }
}
