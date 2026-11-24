// Conversa com um agente que roda como processo filho e troca mensagens JSON,
// uma por linha, pelo stdin/stdout (JSON-RPC). Usado pelo Codex (app-server) e
// pelo Gemini (protocolo ACP).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'

export type RequestId = string | number

/** Pedido que o agente faz ao The Tree (ex.: autorização) e que espera resposta. */
export interface IncomingRequest {
  id: RequestId
  method: string
  params: Record<string, unknown>
}

/** Aviso do agente que não espera resposta (texto chegando, turno terminou...). */
export interface IncomingNotification {
  method: string
  params: Record<string, unknown>
}

export interface RpcHandlers {
  onRequest(request: IncomingRequest): void
  onNotification(notification: IncomingNotification): void
  /** O processo terminou. `expected` indica que foi pedido (close()). */
  onExit(expected: boolean, detail: string): void
}

export interface RpcProcessOptions {
  /** Nome do agente, usado nas mensagens de erro. */
  name: string
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  /** Inclui "jsonrpc": "2.0" em cada mensagem (exigido pelo ACP; o Codex dispensa). */
  jsonrpc: boolean
}

/** Erro devolvido pelo agente, com o código do protocolo. */
export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined
  ) {
    super(message)
  }
}

/** Encerra o processo e tudo o que ele iniciou (no Windows, kill() não leva os filhos). */
function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.pid === undefined) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  } else {
    child.kill('SIGTERM')
  }
}

export class JsonRpcProcess {
  private child: ChildProcess
  private nextId = 1
  private waiting = new Map<RequestId, { resolve(v: unknown): void; reject(e: Error): void }>()
  private closing = false
  private finished = false
  private stderrTail = ''

  constructor(
    private options: RpcProcessOptions,
    private handlers: RpcHandlers
  ) {
    this.child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    createInterface({ input: this.child.stdout! }).on('line', (line) => this.receive(line))
    // Guarda o fim do stderr só para explicar uma eventual queda do processo.
    this.child.stderr!.on('data', (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString()).slice(-2000)
    })
    this.child.on('error', (err) =>
      this.finish(`Não foi possível iniciar o ${options.name}: ${err.message}`)
    )
    this.child.on('exit', (code) => this.finish(`O ${options.name} encerrou (código ${code}).`))
  }

  /** Envia um pedido e espera a resposta. */
  request<T>(method: string, params: unknown): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.waiting.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.write({ id, method, params })
    })
  }

  notify(method: string, params?: unknown): void {
    this.write(params === undefined ? { method } : { method, params })
  }

  /** Responde a um pedido feito pelo agente. */
  respond(id: RequestId, result: unknown): void {
    this.write({ id, result })
  }

  /** Recusa um pedido do agente que o The Tree não sabe atender. */
  reject(id: RequestId, message: string): void {
    this.write({ id, error: { code: -32601, message } })
  }

  close(): void {
    this.closing = true
    killTree(this.child)
  }

  private write(message: Record<string, unknown>): void {
    const payload = this.options.jsonrpc ? { jsonrpc: '2.0', ...message } : message
    if (this.child.stdin?.writable) this.child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private receive(line: string): void {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(line)
    } catch {
      return // linha que não é JSON (ex.: um log perdido): ignora
    }

    const { id, method } = message as { id?: RequestId; method?: string }
    const params = (message.params ?? {}) as Record<string, unknown>
    if (id !== undefined && id !== null && method === undefined) {
      const pending = this.waiting.get(id)
      if (!pending) return
      this.waiting.delete(id)
      const error = message.error as { message?: string; code?: number } | undefined
      if (error) pending.reject(new RpcError(error.message ?? `Erro do ${this.options.name}`, error.code))
      else pending.resolve(message.result)
    } else if (id !== undefined && id !== null && method) {
      this.handlers.onRequest({ id, method, params })
    } else if (method) {
      this.handlers.onNotification({ method, params })
    }
  }

  private finish(detail: string): void {
    // 'error' e 'exit' podem chegar os dois; só o primeiro conta.
    if (this.finished) return
    this.finished = true
    for (const pending of this.waiting.values()) pending.reject(new Error(detail))
    this.waiting.clear()
    const tail = this.stderrTail.trim().split('\n').slice(-3).join('\n')
    this.handlers.onExit(this.closing, tail && !this.closing ? `${detail}\n${tail}` : detail)
  }
}
