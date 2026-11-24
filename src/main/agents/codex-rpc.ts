// Conexão com o `codex app-server`: um processo do Codex que conversa por JSON,
// uma mensagem por linha, no stdin/stdout. É o mesmo protocolo que a extensão
// do Codex para editores usa, e o único modo do Codex que pede autorização antes de agir.
//
// Os formatos abaixo cobrem só o que o The Tree usa. A referência completa sai de:
//   node_modules/.bin/codex app-server generate-ts --out <pasta>
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'

export type RequestId = string | number

/** Pedido que o Codex faz ao The Tree (ex.: autorização) e que espera resposta. */
export interface ServerRequest {
  id: RequestId
  method: string
  params: Record<string, unknown>
}

/** Aviso do Codex que não espera resposta (texto chegando, turno terminou...). */
export interface ServerNotification {
  method: string
  params: Record<string, unknown>
}

interface Handlers {
  onRequest(request: ServerRequest): void
  onNotification(notification: ServerNotification): void
  /** O processo terminou. `expected` indica que foi pedido (close()). */
  onExit(expected: boolean, detail: string): void
}

const TARGETS: Record<string, { triple: string; pkg: string }> = {
  'win32-x64': { triple: 'x86_64-pc-windows-msvc', pkg: '@openai/codex-win32-x64' },
  'win32-arm64': { triple: 'aarch64-pc-windows-msvc', pkg: '@openai/codex-win32-arm64' },
  'darwin-x64': { triple: 'x86_64-apple-darwin', pkg: '@openai/codex-darwin-x64' },
  'darwin-arm64': { triple: 'aarch64-apple-darwin', pkg: '@openai/codex-darwin-arm64' },
  'linux-x64': { triple: 'x86_64-unknown-linux-musl', pkg: '@openai/codex-linux-x64' },
  'linux-arm64': { triple: 'aarch64-unknown-linux-musl', pkg: '@openai/codex-linux-arm64' }
}

/** Acha o executável do Codex instalado junto com o app (pacote @openai/codex). */
function locateCodex(): { bin: string; pathDirs: string[] } {
  const target = TARGETS[`${process.platform}-${process.arch}`]
  if (!target) throw new Error(`O Codex não tem versão para ${process.platform}/${process.arch}.`)

  const req = createRequire(__filename)
  const codexPkg = req.resolve('@openai/codex/package.json')
  const platformPkg = createRequire(codexPkg).resolve(`${target.pkg}/package.json`)
  const root = join(dirname(platformPkg), 'vendor', target.triple)
  const bin = join(root, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex')
  if (!existsSync(bin)) throw new Error(`Executável do Codex não encontrado em ${bin}`)

  // Ferramentas que o Codex espera achar no PATH (ex.: rg para buscas).
  const extra = join(root, 'codex-path')
  return { bin, pathDirs: existsSync(extra) ? [extra] : [] }
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

export class CodexConnection {
  private child: ChildProcess
  private nextId = 1
  private waiting = new Map<RequestId, { resolve(v: unknown): void; reject(e: Error): void }>()
  private closing = false
  private finished = false
  private stderrTail = ''

  constructor(cwd: string, private handlers: Handlers) {
    const { bin, pathDirs } = locateCodex()
    const env = { ...process.env }
    const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
    env[pathKey] = [...pathDirs, env[pathKey] ?? ''].join(delimiter)

    this.child = spawn(bin, ['app-server'], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    createInterface({ input: this.child.stdout! }).on('line', (line) => this.receive(line))
    // Guarda o fim do stderr só para explicar uma eventual queda do processo.
    this.child.stderr!.on('data', (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString()).slice(-2000)
    })
    this.child.on('error', (err) => this.finish(`Não foi possível iniciar o Codex: ${err.message}`))
    this.child.on('exit', (code) => this.finish(`O Codex encerrou (código ${code}).`))
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

  /** Responde a um pedido feito pelo Codex. */
  respond(id: RequestId, result: unknown): void {
    this.write({ id, result })
  }

  /** Recusa um pedido do Codex que o The Tree não sabe atender. */
  reject(id: RequestId, message: string): void {
    this.write({ id, error: { code: -32601, message } })
  }

  close(): void {
    this.closing = true
    killTree(this.child)
  }

  private write(message: unknown): void {
    if (this.child.stdin?.writable) this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private receive(line: string): void {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(line)
    } catch {
      return // linha que não é JSON (não deveria acontecer): ignora
    }

    const { id, method } = message as { id?: RequestId; method?: string }
    if (id !== undefined && method === undefined) {
      const pending = this.waiting.get(id)
      if (!pending) return
      this.waiting.delete(id)
      const error = message.error as { message?: string } | undefined
      if (error) pending.reject(new Error(error.message ?? 'Erro do Codex'))
      else pending.resolve(message.result)
    } else if (id !== undefined && method) {
      this.handlers.onRequest({ id, method, params: (message.params ?? {}) as Record<string, unknown> })
    } else if (method) {
      this.handlers.onNotification({ method, params: (message.params ?? {}) as Record<string, unknown> })
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
