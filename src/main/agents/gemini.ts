// Adaptador do Gemini CLI, via ACP (Agent Client Protocol), o protocolo aberto
// usado por editores como o Zed. O Gemini CLI vem instalado com o app
// (@google/gemini-cli) e roda na pasta do projeto, com o login guardado em ~/.gemini.
//
// Segurança: o Gemini roda no modo de aprovação padrão. Ele lê os arquivos
// livremente, e cada edição ou comando vira um pedido de autorização na interface.
//
// Login: se ainda não houver login, o adaptador pede "Entrar com Google", que abre o
// navegador do sistema para você entrar com a sua conta. Nada de senha passa pelo app.
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type {
  InitializeResponse,
  NewSessionResponse,
  PermissionOption,
  PromptResponse,
  RequestPermissionRequest,
  SessionNotification,
  ToolCallContent,
  ToolKind
} from '@agentclientprotocol/sdk'
import type { AgentEvent } from '../../shared/types'
import type { AgentAdapter } from './adapter'
import { clip, shortPath } from './describe'
import { JsonRpcProcess, RpcError, type IncomingNotification, type IncomingRequest, type RequestId } from './rpc'

type Emit = (event: AgentEvent) => void

/** Código do ACP para "é preciso fazer login antes". */
const AUTH_REQUIRED = -32000
const GOOGLE_LOGIN = 'oauth-personal'

interface Live {
  rpc: JsonRpcProcess
  emit: Emit
  cwd: string
  acpSessionId: string
  /** Pedidos de autorização em aberto: id na interface → pedido no Gemini e opções. */
  pending: Map<string, { rpcId: RequestId; options: PermissionOption[] }>
  /** Bloco de texto atual; muda quando o Gemini usa uma ferramenta no meio da resposta. */
  textKey: string | null
  /** Linhas de ferramenta já mostradas, para atualizar quando terminam. */
  tools: Map<string, { name: string; detail: string }>
  /** Enquanto retoma uma conversa, o Gemini repete o histórico; isso não vai para a tela. */
  replaying: boolean
  interrupted: boolean
  stopped: boolean
}

const live = new Map<string, Live>()

const KIND_NAME: Partial<Record<ToolKind, string>> = {
  read: 'Ler',
  edit: 'Editar',
  delete: 'Apagar',
  move: 'Mover',
  search: 'Buscar',
  execute: 'Comando',
  fetch: 'Web',
  think: 'Pensar'
}

const REQUEST_TITLE: Partial<Record<ToolKind, string>> = {
  edit: 'O Gemini quer editar um arquivo',
  delete: 'O Gemini quer apagar um arquivo',
  move: 'O Gemini quer mover um arquivo',
  execute: 'O Gemini quer rodar um comando',
  fetch: 'O Gemini quer acessar a web'
}

/** Acha o Gemini CLI instalado junto com o app. */
function locateGemini(): string {
  const pkg = createRequire(__filename).resolve('@google/gemini-cli/package.json')
  return join(dirname(pkg), 'bundle', 'gemini.js')
}

/** Inicia o Gemini CLI usando o próprio Node embutido no Electron. */
function spawnGemini(cwd: string, handlers: ConstructorParameters<typeof JsonRpcProcess>[1]): JsonRpcProcess {
  return new JsonRpcProcess(
    {
      name: 'Gemini',
      command: process.execPath,
      args: [locateGemini(), '--acp'],
      cwd,
      // Faz o executável do Electron se comportar como Node puro.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      jsonrpc: true
    },
    handlers
  )
}

/** Texto do pedido de autorização: o que a ferramenta vai fazer, com o conteúdo alterado. */
function describeRequest(request: RequestPermissionRequest, cwd: string): string {
  const call = request.toolCall
  const parts: string[] = []
  if (call.title) parts.push(call.title)
  for (const content of (call.content ?? []) as ToolCallContent[]) {
    if (content.type === 'diff') {
      const path = shortPath(content.path, cwd)
      parts.push(
        content.oldText
          ? `${path}\n\nTrocar:\n${content.oldText}\n\nPor:\n${content.newText}`
          : `${path}\n\n${content.newText}`
      )
    } else if (content.type === 'content' && content.content.type === 'text') {
      parts.push(content.content.text)
    }
  }
  if (parts.length === 0 && call.rawInput) parts.push(JSON.stringify(call.rawInput, null, 2))
  return clip(parts.join('\n\n'), 4000)
}

function toolLine(kind: ToolKind | null | undefined, title: string, locations: { path: string }[] | null | undefined, cwd: string) {
  const name = (kind && KIND_NAME[kind]) || 'Ferramenta'
  const path = locations?.[0]?.path
  return { name, detail: path && kind !== 'execute' ? shortPath(path, cwd) : title }
}

function handleUpdate(sessionId: string, session: Live, notification: SessionNotification): void {
  if (session.replaying) return
  const { emit, cwd } = session
  const update = notification.update

  switch (update.sessionUpdate) {
    case 'agent_message_chunk': {
      if (update.content.type !== 'text') return
      session.textKey ??= randomUUID()
      emit({ type: 'text', sessionId, key: session.textKey, text: update.content.text })
      return
    }
    case 'tool_call': {
      // Depois de uma ferramenta, o texto seguinte vira um bloco novo.
      session.textKey = null
      const line = toolLine(update.kind, update.title, update.locations, cwd)
      session.tools.set(update.toolCallId, line)
      emit({ type: 'tool', sessionId, id: update.toolCallId, ...line })
      return
    }
    case 'tool_call_update': {
      const line = session.tools.get(update.toolCallId)
      if (line && update.status === 'failed') {
        emit({ type: 'tool', sessionId, id: update.toolCallId, name: line.name, detail: `${line.detail} (falhou)` })
      }
      return
    }
  }
}

function handleRequest(sessionId: string, session: Live, request: IncomingRequest): void {
  if (request.method !== 'session/request_permission') {
    // O app não oferece leitura de arquivo, terminal nem formulários ao Gemini:
    // ele faz isso sozinho. Qualquer outro pedido é recusado para não travar.
    session.rpc.reject(request.id, 'Não suportado pelo The Tree.')
    return
  }
  const params = request.params as unknown as RequestPermissionRequest
  const requestId = String(request.id)
  session.pending.set(requestId, { rpcId: request.id, options: params.options })
  session.emit({
    type: 'permission',
    sessionId,
    requestId,
    title: (params.toolCall.kind && REQUEST_TITLE[params.toolCall.kind]) || 'O Gemini quer usar uma ferramenta',
    detail: describeRequest(params, session.cwd)
  })
  session.emit({ type: 'status', sessionId, status: 'waiting' })
}

/** Escolhe a opção de "permitir só desta vez" ou "negar só desta vez". */
function pickOption(options: PermissionOption[], allow: boolean): string | null {
  const preferred = allow ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always']
  for (const kind of preferred) {
    const option = options.find((o) => o.kind === kind)
    if (option) return option.optionId
  }
  return null
}

function cancelPending(sessionId: string, session: Live): void {
  for (const [requestId, { rpcId }] of session.pending) {
    session.rpc.respond(rpcId, { outcome: { outcome: 'cancelled' } })
    session.emit({ type: 'permission-cancelled', sessionId, requestId })
  }
  session.pending.clear()
}

function sessionOf(sessionId: string): Live {
  const session = live.get(sessionId)
  if (!session) throw new Error('Esta conversa com o Gemini não está mais ativa.')
  return session
}

/** Cria a sessão; se faltar login, abre o login do Google e tenta de novo. */
async function withLogin<T>(rpc: JsonRpcProcess, init: InitializeResponse, attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt()
  } catch (err) {
    const canLogin = init.authMethods?.some((m) => m.id === GOOGLE_LOGIN)
    if (!(err instanceof RpcError) || err.code !== AUTH_REQUIRED || !canLogin) throw err
    // Abre o navegador com a página de login do Google e espera você concluir.
    await rpc.request('authenticate', { methodId: GOOGLE_LOGIN })
    return attempt()
  }
}

export const geminiAdapter: AgentAdapter = {
  id: 'gemini',

  async start(sessionId, cwd, emit, resumeId) {
    let session: Live | null = null

    const rpc = spawnGemini(cwd, {
      onRequest: (request) => {
        if (session) handleRequest(sessionId, session, request)
        else rpc.reject(request.id, 'Sessão ainda não iniciada.')
      },
      onNotification: (note: IncomingNotification) => {
        if (session && note.method === 'session/update') {
          handleUpdate(sessionId, session, note.params as unknown as SessionNotification)
        }
      },
      onExit: (expected, detail) => {
        live.delete(sessionId)
        if (expected || session?.stopped || !session) return
        emit({ type: 'error', sessionId, message: detail })
        emit({ type: 'status', sessionId, status: 'error' })
      }
    })

    try {
      const init = await rpc.request<InitializeResponse>('initialize', {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: 'the-tree', title: 'The Tree', version: '0.0.1' }
      })

      // A sessão existe antes de retomar, para que os avisos do histórico sejam reconhecidos (e ignorados).
      const draft: Live = {
        rpc,
        emit,
        cwd,
        acpSessionId: resumeId ?? '',
        pending: new Map(),
        textKey: null,
        tools: new Map(),
        replaying: false,
        interrupted: false,
        stopped: false
      }

      let resumed = false
      if (resumeId && init.agentCapabilities?.loadSession) {
        session = { ...draft, replaying: true }
        try {
          await withLogin(rpc, init, () =>
            rpc.request('session/load', { sessionId: resumeId, cwd, mcpServers: [] })
          )
          resumed = true
        } catch {
          emit({
            type: 'note',
            sessionId,
            message: 'Não foi possível retomar a conversa anterior no Gemini; ele começou uma nova.'
          })
        }
        session.replaying = false
      }

      if (!resumed) {
        const created = await withLogin(rpc, init, () =>
          rpc.request<NewSessionResponse>('session/new', { cwd, mcpServers: [] })
        )
        session = { ...(session ?? draft), acpSessionId: created.sessionId, replaying: false }
      }

      const ready = session as Live
      live.set(sessionId, ready)
      emit({ type: 'resume-id', sessionId, resumeId: ready.acpSessionId })
    } catch (err) {
      rpc.close()
      const text = err instanceof Error ? err.message : String(err)
      throw new Error(`Não foi possível iniciar o Gemini: ${text}`)
    }
  },

  async send(sessionId, message) {
    const session = sessionOf(sessionId)
    session.textKey = null
    session.interrupted = false
    session.emit({ type: 'status', sessionId, status: 'running' })

    // O pedido só responde quando o turno inteiro termina; não precisa esperar aqui.
    session.rpc
      .request<PromptResponse>('session/prompt', {
        sessionId: session.acpSessionId,
        prompt: [{ type: 'text', text: message }]
      })
      .then((result) => {
        if (result.stopReason === 'cancelled' || session.interrupted) {
          session.emit({ type: 'note', sessionId, message: 'Resposta interrompida.' })
        } else if (result.stopReason === 'refusal') {
          session.emit({ type: 'error', sessionId, message: 'O Gemini recusou este pedido.' })
        } else if (result.stopReason !== 'end_turn') {
          session.emit({ type: 'note', sessionId, message: `A resposta parou antes do fim (${result.stopReason}).` })
        }
      })
      .catch((err) => {
        if (session.stopped) return
        session.emit({ type: 'error', sessionId, message: err instanceof Error ? err.message : String(err) })
      })
      .finally(() => {
        if (!session.stopped) session.emit({ type: 'status', sessionId, status: 'idle' })
      })
  },

  async respond(sessionId, requestId, allow) {
    const session = sessionOf(sessionId)
    const pending = session.pending.get(requestId)
    if (!pending) throw new Error('Este pedido de autorização não está mais pendente.')
    session.pending.delete(requestId)
    const optionId = pickOption(pending.options, allow)
    session.rpc.respond(
      pending.rpcId,
      optionId ? { outcome: { outcome: 'selected', optionId } } : { outcome: { outcome: 'cancelled' } }
    )
    session.emit({ type: 'status', sessionId, status: 'running' })
  },

  async interrupt(sessionId) {
    const session = sessionOf(sessionId)
    session.interrupted = true
    session.rpc.notify('session/cancel', { sessionId: session.acpSessionId })
    cancelPending(sessionId, session)
  },

  async stop(sessionId) {
    const session = live.get(sessionId)
    if (!session) return
    session.stopped = true
    live.delete(sessionId)
    session.rpc.close()
  }
}
