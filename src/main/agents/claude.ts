// Adaptador do Claude Code, via Claude Agent SDK.
// O SDK inicia o Claude Code como processo filho, na pasta do projeto, e usa o
// login e as configurações do Claude Code já existentes nesta máquina (~/.claude).
//
// Cada sessão é um processo de vida longa: as mensagens do usuário entram por uma
// fila e as respostas saem como um fluxo de eventos, traduzidos para AgentEvent.
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type {
  CanUseTool,
  EffortLevel,
  Query,
  SDKMessage,
  SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent, AgentSettings } from '../../shared/types'
import { attachmentsDir } from '../attachments/store'
import type { AgentAdapter, ImageInput } from './adapter'
import { clip, shortPath, treeToolLabel } from './describe'
import { TOOL_SERVER_NAME, toolServerUrl } from '../tools/server'

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
  cwd: string
  /** Pedidos de autorização aguardando resposta do usuário. */
  pending: Map<string, (allow: boolean) => void>
  /** Id da última mensagem do Claude, para agrupar os pedaços de texto. */
  messageId: string
  resumeId: string | null
  /** O usuário pediu para parar: o fim do turno não deve aparecer como erro. */
  interrupted: boolean
  stopped: boolean
}

const live = new Map<string, Live>()

/** Erros que o Claude Code reporta e o que o usuário pode fazer a respeito. */
const ERROR_HELP: Record<string, string> = {
  authentication_failed:
    'O Claude Code não está autenticado nesta máquina. Rode "claude auth login" num terminal e envie a mensagem de novo.',
  billing_error: 'O Claude Code reportou um problema de cobrança na sua conta.',
  rate_limit: 'Você atingiu o limite de uso do Claude no momento. Tente de novo mais tarde.',
  overloaded: 'O serviço do Claude está sobrecarregado. Tente de novo em instantes.'
}

const PATH_FIELDS = new Set(['file_path', 'path', 'notebook_path'])

/** Resumo de uma linha do que a ferramenta vai fazer, para mostrar na conversa. */
function describe(input: Record<string, unknown>, cwd: string): string {
  if (Array.isArray(input.queries)) return input.queries.join(' · ')
  for (const field of ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description']) {
    const value = input[field]
    if (typeof value === 'string' && value) {
      return PATH_FIELDS.has(field) ? shortPath(value, cwd) : value
    }
  }
  return clip(JSON.stringify(input), 300)
}

/** Títulos em português para os pedidos de autorização mais comuns. */
const REQUEST_TITLE: Record<string, string> = {
  Write: 'O Claude quer criar ou sobrescrever um arquivo',
  Edit: 'O Claude quer editar um arquivo',
  NotebookEdit: 'O Claude quer editar um notebook',
  Bash: 'O Claude quer rodar um comando',
  PowerShell: 'O Claude quer rodar um comando',
  WebFetch: 'O Claude quer acessar uma página da web',
  WebSearch: 'O Claude quer pesquisar na web'
}

/**
 * Descrição completa de um pedido de autorização: além do alvo, mostra o que
 * será gravado ou trocado, para a decisão não ser feita às cegas.
 */
function describeRequest(toolName: string, input: Record<string, unknown>, cwd: string): string {
  const text = (field: string): string | null =>
    typeof input[field] === 'string' ? (input[field] as string) : null
  const path = text('file_path')

  if (toolName === 'Write' && path !== null) {
    return clip(`${shortPath(path, cwd)}\n\n${text('content') ?? ''}`, 4000)
  }
  if (toolName === 'Edit' && path !== null) {
    const before = text('old_string') ?? ''
    const after = text('new_string') ?? ''
    return clip(`${shortPath(path, cwd)}\n\nTrocar:\n${before}\n\nPor:\n${after}`, 4000)
  }
  return clip(describe(input, cwd), 4000)
}

/** Traduz uma mensagem do SDK em eventos da interface. */
function translate(sessionId: string, session: Live, message: SDKMessage): void {
  const { emit } = session

  // Guarda o id da conversa do Claude Code, para retomá-la depois de fechar o app.
  if ('session_id' in message && message.session_id && message.session_id !== session.resumeId) {
    session.resumeId = message.session_id
    emit({ type: 'resume-id', sessionId, resumeId: message.session_id })
  }

  // Mensagens de subagentes ficam de fora: a conversa mostra só o agente principal.
  if ('parent_tool_use_id' in message && message.parent_tool_use_id) return

  switch (message.type) {
    case 'stream_event': {
      // O texto chega em pedaços; a chave junta os pedaços de um mesmo bloco.
      const event = message.event
      if (event.type === 'message_start') session.messageId = event.message.id
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        emit({
          type: 'text',
          sessionId,
          key: `${session.messageId}:${event.index}`,
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
            name: treeToolLabel(block.name) ?? block.name,
            detail: describe(block.input as Record<string, unknown>, session.cwd)
          })
        }
      }
      if (message.error && !session.interrupted) {
        emit({
          type: 'error',
          sessionId,
          message: ERROR_HELP[message.error] ?? `O Claude Code reportou um erro: ${message.error}`
        })
      }
      break
    }
    case 'result': {
      if (session.interrupted) {
        emit({ type: 'note', sessionId, message: 'Resposta interrompida.' })
      } else if (message.subtype !== 'success') {
        const reason = message.errors.join('; ') || message.subtype
        emit({ type: 'error', sessionId, message: `O turno terminou com erro: ${reason}` })
      }
      session.interrupted = false
      emit({ type: 'status', sessionId, status: 'idle' })
      break
    }
  }
}

async function consume(sessionId: string, session: Live): Promise<void> {
  try {
    for await (const message of session.query) translate(sessionId, session, message)
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

  async start(sessionId, cwd, emit, resumeId, settings) {
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
          title:
            options.title ??
            REQUEST_TITLE[toolName] ??
            `O Claude quer usar ${options.displayName ?? toolName}`,
          detail: describeRequest(toolName, input, cwd)
        })
        emit({ type: 'status', sessionId, status: 'waiting' })
      })

    // Ferramentas dos conectores ligados (Google Maps, Navegador), liberadas sem
    // pedir autorização: o usuário já escolheu ligá-las.
    const tools = await toolServerUrl()

    const session: Live = {
      queue,
      pending,
      emit,
      cwd,
      messageId: '',
      resumeId: resumeId ?? null,
      interrupted: false,
      stopped: false,
      query: query({
        prompt: queue,
        options: {
          cwd,
          canUseTool,
          // Retoma a conversa anterior (o Claude Code guarda o histórico em ~/.claude).
          resume: resumeId,
          // 'default' mantém as aprovações manuais: nada que altere o projeto roda
          // sem passar por canUseTool (salvo regras que você já liberou no Claude Code).
          permissionMode: 'default',
          // Anexos ficam fora do projeto: a pasta deles é liberada para leitura,
          // assim abrir um anexo não vira pedido de autorização.
          additionalDirectories: [attachmentsDir()],
          includePartialMessages: true,
          ...(tools
            ? {
                mcpServers: { [TOOL_SERVER_NAME]: { type: 'http' as const, url: tools } },
                allowedTools: [`mcp__${TOOL_SERVER_NAME}`]
              }
            : {}),
          // Modelo e esforço escolhidos na conversa (ver shared/agents.ts).
          ...(settings.model ? { model: settings.model } : {}),
          ...(settings.effort ? { effort: settings.effort as EffortLevel } : {})
        }
      })
    }

    live.set(sessionId, session)
    void consume(sessionId, session)
  },

  async send(sessionId, message, images: ImageInput[] = []) {
    const session = sessionOf(sessionId)
    // Com imagens, a mensagem vira blocos: as imagens (para o Claude ver) e o texto.
    const content =
      images.length === 0
        ? message
        : [
            ...(await Promise.all(
              images.map(async (image) => ({
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: image.mime as 'image/png',
                  data: (await readFile(image.path)).toString('base64')
                }
              }))
            )),
            { type: 'text' as const, text: message }
          ]
    session.queue.push({
      type: 'user',
      message: { role: 'user', content },
      parent_tool_use_id: null
    })
    session.emit({ type: 'status', sessionId, status: 'running' })
  },

  async configure(sessionId, settings: AgentSettings) {
    const { query } = sessionOf(sessionId)
    // O SDK troca os dois sem reiniciar o Claude Code; vale para a próxima mensagem.
    if (settings.model) await query.setModel(settings.model)
    if (settings.effort) {
      await query.applyFlagSettings({ effortLevel: settings.effort as EffortLevel })
    }
  },

  async respond(sessionId, requestId, allow) {
    const resolve = sessionOf(sessionId).pending.get(requestId)
    if (!resolve) throw new Error('Este pedido de autorização não está mais pendente.')
    resolve(allow)
  },

  async interrupt(sessionId) {
    const session = sessionOf(sessionId)
    session.interrupted = true
    await session.query.interrupt()
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
