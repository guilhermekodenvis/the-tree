// Inicia o `codex app-server`: um processo do Codex que conversa por JSON, uma
// mensagem por linha. É o mesmo protocolo que a extensão do Codex para editores
// usa, e o único modo do Codex que pede autorização antes de agir.
//
// A referência completa do protocolo sai de:
//   node_modules/.bin/codex app-server generate-ts --out <pasta>
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, join } from 'node:path'
import { JsonRpcProcess, type RpcHandlers } from './rpc'

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

export function connectCodex(cwd: string, handlers: RpcHandlers): JsonRpcProcess {
  const { bin, pathDirs } = locateCodex()
  const env = { ...process.env }
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  env[pathKey] = [...pathDirs, env[pathKey] ?? ''].join(delimiter)

  return new JsonRpcProcess(
    { name: 'Codex', command: bin, args: ['app-server'], cwd, env, jsonrpc: false },
    handlers
  )
}
