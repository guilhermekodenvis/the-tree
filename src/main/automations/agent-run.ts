// Conversa temporária de um passo "agente": abre o agente na pasta do projeto,
// manda um pedido, espera a resposta terminar e encerra. Não aparece na aba
// Agentes; a conversa fica guardada só no histórico da execução.
//
// Automação roda sem ninguém olhando, então todo pedido de autorização é
// aprovado sozinho (bypass sempre ligado).
import { randomUUID } from 'node:crypto'
import { addUserMessage, applyEvent } from '../../shared/chat'
import type { AgentEvent, AgentId, AgentSettings, ChatItem } from '../../shared/types'
import { adapters } from '../agents/manager'

/** Tempo máximo de uma resposta antes de o passo falhar. */
const TURN_TIMEOUT_MS = 60 * 60 * 1000

export interface AgentRunInput {
  agent: AgentId
  cwd: string
  settings: AgentSettings
  /** O que vai para o agente (com skills e instruções de formato). */
  prompt: string
  /** O que aparece como "sua mensagem" no histórico. */
  display: string
  signal: AbortSignal
  /** Avisado a cada mudança da conversa (para o histórico ao vivo). */
  onProgress(items: ChatItem[]): void
}

export interface AgentRunOutput {
  /** Último bloco de texto da resposta. */
  text: string
  items: ChatItem[]
}

export async function runAgentOnce(input: AgentRunInput): Promise<AgentRunOutput> {
  const adapter = adapters[input.agent]
  if (!adapter) throw new Error(`Agente desconhecido: ${input.agent}`)
  const sessionId = randomUUID()
  let items = addUserMessage([], input.display)
  const errors: string[] = []
  let sent = false

  let finish: (ok: boolean) => void = () => undefined
  const done = new Promise<boolean>((resolve) => (finish = resolve))

  const emit = (event: AgentEvent): void => {
    items = applyEvent(items, event)
    input.onProgress(items)
    if (event.type === 'error') errors.push(event.message)
    if (event.type === 'permission') {
      setImmediate(() => {
        adapter
          .respond(sessionId, event.requestId, true)
          .then(() => {
            items = applyEvent(items, {
              type: 'permission-resolved',
              sessionId,
              requestId: event.requestId,
              state: 'auto'
            })
            input.onProgress(items)
          })
          .catch(() => undefined)
      })
    }
    if (event.type === 'status' && sent) {
      if (event.status === 'idle') finish(true)
      if (event.status === 'error') finish(false)
    }
  }

  const onAbort = (): void => finish(false)
  input.signal.addEventListener('abort', onAbort)
  const timer = setTimeout(() => {
    errors.push(`O agente passou de ${TURN_TIMEOUT_MS / 60000} minutos sem terminar.`)
    finish(false)
  }, TURN_TIMEOUT_MS)

  try {
    await adapter.start(sessionId, input.cwd, emit, undefined, input.settings)
    sent = true
    await adapter.send(sessionId, input.prompt)
    const ok = await done
    if (input.signal.aborted) throw new Error('Execução cancelada.')
    if (!ok || errors.length > 0) throw new Error(errors.join(' ') || 'O agente parou sem responder.')
    const last = [...items].reverse().find((item) => item.kind === 'assistant')
    if (!last || last.kind !== 'assistant' || !last.text.trim()) {
      throw new Error('O agente terminou sem escrever uma resposta.')
    }
    return { text: last.text, items }
  } catch (err) {
    // Guarda a conversa até onde foi, para o histórico mostrar onde parou.
    ;(err as { items?: ChatItem[] }).items = items
    throw err
  } finally {
    clearTimeout(timer)
    input.signal.removeEventListener('abort', onAbort)
    await adapter.stop(sessionId).catch(() => undefined)
  }
}
