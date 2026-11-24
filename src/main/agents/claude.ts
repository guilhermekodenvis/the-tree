// Adaptador do Claude Code, via Claude Agent SDK.
// O SDK inicia o Claude Code como processo filho, na pasta do projeto, e usa o
// login e as configurações do Claude Code já existentes nesta máquina (~/.claude).
//
// Cada sessão é um processo de vida longa: as mensagens do usuário entram por uma
// fila e as respostas saem como um fluxo de eventos, traduzidos para AgentEvent.
import { randomUUID } from 'node:crypto'
import type { CanUseTool, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent } from '../../shared/types'
import type { AgentAdapter } from './adapter'

type Emit = (event: AgentEvent) => void

/** Fila de mensagens do usuário que o SDK consome como um iterador assíncrono. */
class MessageQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = []
  private waiting: ((result: IteratorResult<SDKUserMessage>) => void) | null = null
  private closed = false

  push(item: SDKUserMessage): void {
    if (this.closed) return
    if (this.waiting) {
      this.waiting({ value: item, done: false })
      this.waiting = null
    } else {
      this.items.push(item)
    }
  }

  close(): void {
    this.closed = true
    this.waiting?.({ value: undefined, done: true })
    this.waiting = null
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const item = this.items.shift()
        if (item) return Promise.resolve({ value: item, done: false })
        if (this.closed) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => (this.waiting = resolve))
      }
    }
  }
}

interface Live {
  queue: MessageQueue
  query: Query
  emit: Emit
  /** Pedidos de autorização aguardando resposta do usuário. */
  pending: Map<string, (allow: boolean) => void>
  stopped: boolean
}

const live = new Map<string, Live>()

/** Erros que o Claude Code reporta e o que o usuário pode fazer a respeito. */
const ERROR_HELP: Record<string, string> = {
  authentication_failed:
    'O Claude Code não está autenticado nesta máquina. Rode "claude auth login" num terminal, encerre esta conversa e inicie outra.',
  billing_error: 'O Claude Code reportou um problema de cobrança na sua conta.',
  rate_limit: 'Você atingiu o limite de uso do Claude no momento. Tente de novo mais tarde.',
  overloaded: 'O serviço do Claude está sobrecarregado. Tente de novo em instantes.'
}

/** Resumo curto do que a ferramenta vai fazer, para mostrar na conversa. */
function describe(input: Record<string, unknown>): string {
  for (const field of ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description']) {
    const value = input[field]
    if (typeof value === 'string' && value) return value
  }
  const json = JSON.stringify(input)
  return json.length > 300 ? `${json.slice(0, 300)}…` : json
}

/** Traduz uma mensagem do SDK em eventos da interface. */
function translate(sessionId: string, state: { messageId: string }, message: SDKMessage, emit: Emit): void {
  // Mensagens de subagentes ficam de fora: a conversa mostra só o agente principal.
  if ('parent_tool_use_id' in message && message.parent_tool_use_id) return

  switch (message.type) {
    case 'stream_event': {
      // O texto chega em pedaços; a chave junta os pedaços de um mesmo bloco.
      const event = message.event
      if (event.type === 'message_start') state.messageId = event.message.id
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        emit({
          type: 'text',
          sessionId,
          key: `${state.messageId}:${event.index}`,
          text: event.delta.text
        })
      }
      break
    }
    case 'assistant': {
      // O texto já veio pelos pedaços acima; daqui saem os usos de ferramenta e erros.
      for (const block of message.message.content) {
        if (block.type === 'tool_use') {
          emit({
            type: 'tool',
            sessionId,
            id: block.id,
            name: block.name,
            detail: describe(block.input as Record<string, unknown>)
          })
        }
      }
      if (message.error) {
        emit({
          type: 'error',
          sessionId,
          message: ERROR_HELP[message.error] ?? `O Claude Code reportou um erro: ${message.error}`
        })
      }
      break
    }
    case 'result': {
      if (message.subtype !== 'success') {
        const reason = message.errors.join('; ') || message.subtype
        emit({ type: 'error', sessionId, message: `O turno terminou com erro: ${reason}` })
      }
      emit({ type: 'status', sessionId, status: 'idle' })
      break
    }
  }
}

async function consume(sessionId: string, session: Live): Promise<void> {
  const state = { messageId: '' }
  try {
    for await (const message of session.query) {
      translate(sessionId, state, message, session.emit)
    }
    // O processo terminou sem ninguém pedir: avisa, senão a conversa fica muda.
    if (!session.stopped) {
      session.emit({ type: 'error', sessionId, message: 'O Claude Code encerrou a sessão.' })
      session.emit({ type: 'status', sessionId, status: 'error' })
    }
  } catch (err) {
    if (session.stopped) return
    const text = err instanceof Error ? err.message : String(err)
    session.emit({ type: 'error', sessionId, message: text })
    session.emit({ type: 'status', sessionId, status: 'error' })
  } finally {
    live.delete(sessionId)
  }
}

function sessionOf(sessionId: string): Live {
  const session = live.get(sessionId)
  if (!session) throw new Error('Esta conversa com o Claude não está mais ativa.')
  return session
}

export const claudeAdapter: AgentAdapter = {
  id: 'claude',

  async start(sessionId, cwd, emit) {
    // O SDK é um módulo ESM; o import dinâmico funciona a partir do processo principal.
    const { query } = await import('@anthropic-ai/claude-agent-sdk')

    const queue = new MessageQueue()
    const pending = new Map<string, (allow: boolean) => void>()

    // Chamado pelo Claude Code antes de qualquer ação que exige autorização
    // (editar arquivo, rodar comando). A decisão é sempre do usuário, na interface.
    const canUseTool: CanUseTool = (toolName, input, options) =>
      new Promise((resolve) => {
        const requestId = randomUUID()
        const finish = (allow: boolean): void => {
          pending.delete(requestId)
          options.signal.removeEventListener('abort', onAbort)
          emit({ type: 'status', sessionId, status: 'running' })
          resolve(
            allow
              ? { behavior: 'allow', updatedInput: input }
              : { behavior: 'deny', message: 'O usuário negou esta ação.' }
          )
        }
        const onAbort = (): void => {
          pending.delete(requestId)
          emit({ type: 'permission-cancelled', sessionId, requestId })
          resolve({ behavior: 'deny', message: 'O pedido foi cancelado.' })
        }

        options.signal.addEventListener('abort', onAbort, { once: true })
        pending.set(requestId, finish)
        emit({
          type: 'permission',
          sessionId,
          requestId,
          title: options.title ?? `O Claude quer usar ${options.displayName ?? toolName}`,
          detail: describe(input)
        })
        emit({ type: 'status', sessionId, status: 'waiting' })
      })

    const session: Live = {
      queue,
      pending,
      emit,
      stopped: false,
      query: query({
        prompt: queue,
        options: {
          cwd,
          canUseTool,
          // 'default' mantém as aprovações manuais: nada que altere o projeto roda
          // sem passar por canUseTool (salvo regras que você já liberou no Claude Code).
          permissionMode: 'default',
          includePartialMessages: true
        }
      })
    }

    live.set(sessionId, session)
    void consume(sessionId, session)
  },

  async send(sessionId, message) {
    const session = sessionOf(sessionId)
    session.queue.push({
      type: 'user',
      message: { role: 'user', content: message },
      parent_tool_use_id: null
    })
    session.emit({ type: 'status', sessionId, status: 'running' })
  },

  async respond(sessionId, requestId, allow) {
    const resolve = sessionOf(sessionId).pending.get(requestId)
    if (!resolve) throw new Error('Este pedido de autorização não está mais pendente.')
    resolve(allow)
  },

  async stop(sessionId) {
    const session = live.get(sessionId)
    if (!session) return
    session.stopped = true
    session.queue.close()
    session.query.close()
    live.delete(sessionId)
  }
}
