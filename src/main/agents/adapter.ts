// Interface comum aos agentes. Cada um (Claude Code, Codex, Gemini) ganha um
// adaptador que traduz a sua saída para AgentEvent.
import type { AgentEvent, AgentId, AgentSettings } from '../../shared/types'

/** Imagem anexada: caminho da cópia guardada e o tipo (image/png...). */
export interface ImageInput {
  path: string
  mime: string
}

export interface AgentAdapter {
  readonly id: AgentId

  /**
   * Inicia o agente na pasta do projeto. Com `resumeId`, retoma a conversa
   * anterior (o id vem de um evento 'resume-id' emitido antes). `settings` traz o
   * modelo e o esforço escolhidos na conversa.
   */
  start(
    sessionId: string,
    cwd: string,
    emit: (event: AgentEvent) => void,
    resumeId: string | undefined,
    settings: AgentSettings
  ): Promise<void>

  /** Troca o modelo e o esforço da sessão aberta; vale a partir da próxima mensagem. */
  configure(sessionId: string, settings: AgentSettings): Promise<void>

  /**
   * Envia uma mensagem do usuário para a sessão. `images` são anexos de imagem
   * que o agente deve "ver" (os caminhos de todos os anexos já vêm no texto).
   */
  send(sessionId: string, message: string, images?: ImageInput[]): Promise<void>

  /** Responde a um pedido de autorização feito pelo agente. */
  respond(sessionId: string, requestId: string, allow: boolean): Promise<void>

  /** Interrompe a resposta em andamento, mantendo a sessão aberta. */
  interrupt(sessionId: string): Promise<void>

  /** Encerra o processo da sessão. */
  stop(sessionId: string): Promise<void>
}
