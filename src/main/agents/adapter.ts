// Interface comum aos agentes. Cada um (Claude Code, Codex, Gemini) ganha um
// adaptador que traduz a sua saída para AgentEvent.
import type { AgentEvent, AgentId } from '../../shared/types'

export interface AgentAdapter {
  readonly id: AgentId

  /**
   * Inicia o agente na pasta do projeto. Com `resumeId`, retoma a conversa
   * anterior (o id vem de um evento 'resume-id' emitido antes).
   */
  start(
    sessionId: string,
    cwd: string,
    emit: (event: AgentEvent) => void,
    resumeId?: string
  ): Promise<void>

  /** Envia uma mensagem do usuário para a sessão. */
  send(sessionId: string, message: string): Promise<void>

  /** Responde a um pedido de autorização feito pelo agente. */
  respond(sessionId: string, requestId: string, allow: boolean): Promise<void>

  /** Interrompe a resposta em andamento, mantendo a sessão aberta. */
  interrupt(sessionId: string): Promise<void>

  /** Encerra o processo da sessão. */
  stop(sessionId: string): Promise<void>
}
