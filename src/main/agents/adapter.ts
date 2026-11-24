// Interface comum aos três agentes. Cada CLI (Claude Code, Codex, Gemini)
// ganha um adaptador que traduz a sua saída para AgentEvent.
import type { AgentEvent, AgentId } from '../../shared/types'

export interface AgentAdapter {
  readonly id: AgentId

  /** Inicia o CLI na pasta do projeto. */
  start(sessionId: string, cwd: string, emit: (event: AgentEvent) => void): Promise<void>

  /** Envia uma mensagem do usuário para a sessão. */
  send(sessionId: string, message: string): Promise<void>

  /** Encerra o processo da sessão. */
  stop(sessionId: string): Promise<void>
}
