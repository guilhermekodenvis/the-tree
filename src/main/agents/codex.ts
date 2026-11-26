// Adaptador do Codex (ChatGPT), via `codex app-server`.
// Usa o login do Codex já existente nesta máquina (~/.codex) e roda na pasta do projeto.
//
// Segurança: o Codex roda num sandbox somente leitura. Ele lê os arquivos livremente,
// mas qualquer escrita ou comando que precise de mais do que leitura vira um pedido
// de autorização na interface ('on-request'). Mesmo que o modelo não peça, o sandbox
// bloqueia a escrita.
import type { AgentEvent, AgentSettings } from '../../shared/types'
import type { AgentAdapter, ImageInput } from './adapter'
import { connectCodex } from './codex-rpc'
import type {
  IncomingNotification as ServerNotification,
  IncomingRequest as ServerRequest,
  JsonRpcProcess,
  RequestId
} from './rpc'
import { clip, shortPath } from './describe'

type Emit = (event: AgentEvent) => void

const APPROVAL_POLICY = 'on-request'
const SANDBOX = 'read-only'

interface Live {
  rpc: JsonRpcProcess
  emit: Emit
  cwd: string
  threadId: string
  /** Turno em andamento, necessário para interromper. */
  turnId: string | null
  /** Pedidos de autorização em aberto: id na interface → id do pedido no Codex. */
  pending: Map<string, RequestId>
  /** Mensagens que já chegaram em pedaços (para não repetir o texto no final). */
  streamed: Set<string>
  /** Alterações de arquivo anunciadas, para mostrar no pedido de autorização. */
  changes: Map<string, string>
  /** Um erro deste turno já foi mostrado; evita mostrar o mesmo erro duas vezes. */
  turnFailedShown: boolean
  stopped: boolean
  /** Modelo e esforço, enviados em cada turno (o Codex aceita trocar a cada mensagem). */
  settings: AgentSettings
}

const live = new Map<string, Live>()

interface CodexItem {
  type: string
  id: string
  text?: string
  command?: string
  status?: string
  commandActions?: { type: string; path?: string | null; query?: string | null }[]
  changes?: { path: string; kind: { type: string }; diff: string }[]
  server?: string
  tool?: string
  query?: string
}

/** Tira o "powershell.exe -Command" do começo, para mostrar só o comando em si. */
export function simplifyCommand(command: string): string {
  const match = command.match(
    /^"?[^"]*?(?:powershell|pwsh|cmd)(?:\.exe)?"?\s+(?:-Command|\/c)\s+([\s\S]*)$/i
  )
  if (!match) return command
  const inner = match[1].trim()
  const quoted = inner.match(/^(["'])([\s\S]*)\1$/)
  return quoted ? quoted[2] : inner
}

const STATUS_SUFFIX: Record<string, string> = {
  failed: ' (falhou)',
  declined: ' (negado)'
}

/** Linha que aparece na conversa para cada ação do Codex. */
function describeItem(item: CodexItem, cwd: string): { name: string; detail: string } | null {
  const suffix = STATUS_SUFFIX[item.status ?? ''] ?? ''
  switch (item.type) {
    case 'commandExecution': {
      const action = item.commandActions?.length === 1 ? item.commandActions[0] : null
      if (action?.type === 'read' && action.path) {
        return { name: 'Ler', detail: shortPath(action.path, cwd) + suffix }
      }
      if (action?.type === 'listFiles') {
        return {
          name: 'Listar',
          detail: (action.path ? shortPath(action.path, cwd) : '.') + suffix
        }
      }
      if (action?.type === 'search') {
        return { name: 'Buscar', detail: (action.query ?? '') + suffix }
      }
      return { name: 'Comando', detail: simplifyCommand(item.command ?? '') + suffix }
    }
    case 'fileChange':
      return {
        name: 'Alterar',
        detail: (item.changes ?? []).map((c) => shortPath(c.path, cwd)).join(', ') + suffix
      }
    case 'mcpToolCall':
      return { name: item.server ?? 'MCP', detail: (item.tool ?? '') + suffix }
    case 'webSearch':
      return { name: 'Pesquisa', detail: item.query ?? '' }
    default:
      return null
  }
}

/** Texto do pedido de autorização de alteração de arquivos: caminhos e o que muda. */
function describeChanges(item: CodexItem, cwd: string): string {
  const verbs: Record<string, string> = { add: 'Criar', delete: 'Apagar', update: 'Alterar' }
  const parts = (item.changes ?? []).map(
    (change) =>
      `${verbs[change.kind.type] ?? 'Alterar'}: ${shortPath(change.path, cwd)}\n${change.diff}`
  )
  return clip(parts.join('\n\n'), 4000)
}

function askPermission(
  sessionId: string,
  session: Live,
  request: ServerRequest,
  title: string,
  detail: string
): void {
  const requestId = String(request.id)
  session.pending.set(requestId, request.id)
  session.emit({ type: 'permission', sessionId, requestId, title, detail })
  session.emit({ type: 'status', sessionId, status: 'waiting' })
}

function handleRequest(sessionId: string, session: Live, request: ServerRequest): void {
  const params = request.params
  const reason = typeof params.reason === 'string' && params.reason ? `${params.reason}\n\n` : ''

  switch (request.method) {
    case 'item/commandExecution/requestApproval': {
      const command = simplifyCommand(String(params.command ?? ''))
      askPermission(
        sessionId,
        session,
        request,
        'O ChatGPT quer rodar um comando',
        clip(reason + command, 4000)
      )
      return
    }
    case 'item/fileChange/requestApproval': {
      const changes =
        session.changes.get(String(params.itemId)) ?? 'Alteração de arquivos no projeto.'
      askPermission(
        sessionId,
        session,
        request,
        'O ChatGPT quer alterar arquivos',
        clip(reason + changes, 4000)
      )
      return
    }
    default:
      // Pedidos que o The Tree ainda não sabe mostrar (perguntas, permissões extras...):
      // recusa, para o Codex não ficar esperando para sempre.
      session.rpc.reject(request.id, 'Não suportado pelo The Tree.')
      session.emit({
        type: 'note',
        sessionId,
        message: `O ChatGPT fez um pedido que o The Tree ainda não suporta (${request.method}); foi recusado.`
      })
  }
}

function handleNotification(sessionId: string, session: Live, note: ServerNotification): void {
  const { emit, cwd } = session
  const params = note.params

  switch (note.method) {
    case 'turn/started': {
      session.turnId = (params.turn as { id: string }).id
      session.turnFailedShown = false
      emit({ type: 'status', sessionId, status: 'running' })
      return
    }
    case 'item/agentMessage/delta': {
      const itemId = String(params.itemId)
      session.streamed.add(itemId)
      emit({ type: 'text', sessionId, key: itemId, text: String(params.delta ?? '') })
      return
    }
    case 'item/started':
    case 'item/completed': {
      const item = params.item as CodexItem
      if (item.type === 'agentMessage') {
        // Mensagem que veio inteira, sem pedaços: mostra de uma vez ao terminar.
        if (note.method === 'item/completed' && !session.streamed.has(item.id) && item.text) {
          emit({ type: 'text', sessionId, key: item.id, text: item.text })
        }
        return
      }
      if (item.type === 'fileChange' && item.changes) {
        session.changes.set(item.id, describeChanges(item, cwd))
      }
      const line = describeItem(item, cwd)
      if (line) emit({ type: 'tool', sessionId, id: item.id, ...line })
      return
    }
    case 'serverRequest/resolved': {
      // O pedido deixou de valer sem resposta nossa (ex.: o turno foi interrompido).
      const requestId = String(params.requestId)
      if (session.pending.delete(requestId)) {
        emit({ type: 'permission-cancelled', sessionId, requestId })
      }
      return
    }
    case 'error': {
      if (params.willRetry) return
      const error = params.error as { message?: string } | undefined
      session.turnFailedShown = true
      emit({ type: 'error', sessionId, message: error?.message ?? 'O Codex reportou um erro.' })
      return
    }
    case 'turn/completed': {
      const turn = params.turn as { status: string; error: { message?: string } | null }
      if (turn.status === 'interrupted') {
        emit({ type: 'note', sessionId, message: 'Resposta interrompida.' })
      } else if (turn.status === 'failed' && !session.turnFailedShown) {
        emit({
          type: 'error',
          sessionId,
          message: `O turno terminou com erro: ${turn.error?.message ?? 'motivo desconhecido'}`
        })
      }
      session.turnId = null
      emit({ type: 'status', sessionId, status: 'idle' })
      return
    }
  }
}

function sessionOf(sessionId: string): Live {
  const session = live.get(sessionId)
  if (!session) throw new Error('Esta conversa com o ChatGPT não está mais ativa.')
  return session
}

export const codexAdapter: AgentAdapter = {
  id: 'codex',

  async start(sessionId, cwd, emit, resumeId, settings) {
    // A sessão só existe depois do aperto de mão; avisos que chegarem antes esperam na fila.
    let session: Live | null = null
    const early: (() => void)[] = []

    const rpc = connectCodex(cwd, {
      onRequest: (request) => {
        const run = (): void => {
          if (session) handleRequest(sessionId, session, request)
        }
        if (session) run()
        else early.push(run)
      },
      onNotification: (note) => {
        const run = (): void => {
          if (session) handleNotification(sessionId, session, note)
        }
        if (session) run()
        else early.push(run)
      },
      onExit: (expected, detail) => {
        live.delete(sessionId)
        if (expected || session?.stopped || !session) return
        emit({ type: 'error', sessionId, message: detail })
        emit({ type: 'status', sessionId, status: 'error' })
      }
    })

    try {
      await rpc.request('initialize', {
        clientInfo: { name: 'the-tree', title: 'The Tree', version: '0.0.1' },
        capabilities: null
      })
      rpc.notify('initialized')

      const options = { cwd, approvalPolicy: APPROVAL_POLICY, sandbox: SANDBOX }
      const result = resumeId
        ? await rpc.request<{ thread: { id: string } }>('thread/resume', {
            threadId: resumeId,
            ...options,
            excludeTurns: true
          })
        : await rpc.request<{ thread: { id: string } }>('thread/start', options)

      session = {
        rpc,
        emit,
        cwd,
        threadId: result.thread.id,
        turnId: null,
        pending: new Map(),
        streamed: new Set(),
        changes: new Map(),
        turnFailedShown: false,
        stopped: false,
        settings
      }
      live.set(sessionId, session)
      emit({ type: 'resume-id', sessionId, resumeId: result.thread.id })
      for (const run of early) run()
    } catch (err) {
      rpc.close()
      const text = err instanceof Error ? err.message : String(err)
      throw new Error(`Não foi possível iniciar o ChatGPT (Codex): ${text}`)
    }
  },

  async send(sessionId, message, images: ImageInput[] = []) {
    const session = sessionOf(sessionId)
    session.emit({ type: 'status', sessionId, status: 'running' })
    const result = await session.rpc.request<{ turn: { id: string } }>('turn/start', {
      threadId: session.threadId,
      // Imagens vão pelo caminho da cópia guardada; o Codex lê o arquivo.
      input: [
        { type: 'text', text: message, text_elements: [] },
        ...images.map((image) => ({ type: 'localImage', path: image.path }))
      ],
      ...(session.settings.model ? { model: session.settings.model } : {}),
      ...(session.settings.effort ? { effort: session.settings.effort } : {})
    })
    session.turnId = result.turn.id
  },

  async configure(sessionId, settings) {
    sessionOf(sessionId).settings = settings
  },

  async respond(sessionId, requestId, allow) {
    const session = sessionOf(sessionId)
    const rpcId = session.pending.get(requestId)
    if (rpcId === undefined) throw new Error('Este pedido de autorização não está mais pendente.')
    session.pending.delete(requestId)
    session.rpc.respond(rpcId, { decision: allow ? 'accept' : 'decline' })
    session.emit({ type: 'status', sessionId, status: 'running' })
  },

  async interrupt(sessionId) {
    const session = sessionOf(sessionId)
    if (!session.turnId) return
    await session.rpc.request('turn/interrupt', {
      threadId: session.threadId,
      turnId: session.turnId
    })
  },

  async stop(sessionId) {
    const session = live.get(sessionId)
    if (!session) return
    session.stopped = true
    live.delete(sessionId)
    session.rpc.close()
  }
}
