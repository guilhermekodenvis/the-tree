// Contas dos agentes, mostradas como conectores: Claude (Claude Code), ChatGPT
// (Codex) e Gemini. O The Tree não guarda login de Claude nem de ChatGPT: ele usa o
// login que já existe neste computador (~/.claude e ~/.codex), o mesmo dos CLIs.
// Por isso, entrar ou sair por aqui vale também fora do app.
// O Gemini usa a chave de API guardada no cofre (secrets.ts).
import { shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AccountId, AccountStatus } from '../../shared/types'
import { connectCodex } from '../agents/codex-rpc'
import type { IncomingNotification } from '../agents/rpc'
import { hasSecret, removeSecret } from '../secrets'

/** Tempo máximo esperando você terminar o login no navegador. */
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000

// ---- Claude (CLI do Claude Code que vem com o Agent SDK) ------------------------

/**
 * Acha o executável do Claude que vem com o Agent SDK (pacote da plataforma, ao lado
 * do SDK). O SDK não expõe o package.json, então parte do arquivo principal dele.
 */
function claudeExe(): string {
  const sdkDir = dirname(createRequire(__filename).resolve('@anthropic-ai/claude-agent-sdk'))
  const pkg = `claude-agent-sdk-${process.platform}-${process.arch}`
  const file = process.platform === 'win32' ? 'claude.exe' : 'claude'
  const candidates = [
    join(dirname(sdkDir), pkg, file),
    join(sdkDir, 'node_modules', '@anthropic-ai', pkg, file)
  ]
  const found = candidates.find((path) => existsSync(path))
  if (!found) throw new Error('Não encontrei o Claude Code que vem com o app.')
  return found
}

/** Roda o CLI do Claude e devolve a saída; `onOutput` recebe cada pedaço (para achar links). */
function runClaude(
  args: string[],
  timeoutMs: number,
  onOutput?: (text: string) => void
): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    // Uma chave no ambiente faria o CLI ignorar o login da assinatura.
    delete env.ANTHROPIC_API_KEY
    // Fora do login, a entrada do CLI fica fechada: aberta, ele espera por ela e o
    // status passa de uns 3 s para 10 a 30 s (às vezes estourando o tempo).
    const child = spawn(claudeExe(), args, {
      env,
      windowsHide: true,
      stdio: [onOutput ? 'pipe' : 'ignore', 'pipe', 'pipe']
    })
    let out = ''
    const take = (chunk: Buffer): void => {
      const text = chunk.toString()
      out += text
      onOutput?.(text)
    }
    child.stdout?.on('data', take)
    child.stderr?.on('data', take)
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('O Claude demorou demais para responder.'))
    }, timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, out })
    })
  })
}

/**
 * Leitura rápida do login do Claude Code pelos arquivos dele: `claude auth status`
 * leva de 15 s a mais de 1 min fora de um terminal. Só confere se o login existe
 * (nenhum token é lido para fora daqui). Devolve null se não der para saber (aí
 * pergunta ao CLI).
 */
async function claudeStatusFromFiles(): Promise<AccountStatus | null> {
  try {
    const home = homedir()
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(home, '.claude')
    const credentials = JSON.parse(
      await readFile(join(configDir, '.credentials.json'), 'utf8')
    ) as { claudeAiOauth?: { refreshToken?: string; subscriptionType?: string } }
    const oauth = credentials.claudeAiOauth
    if (!oauth?.refreshToken) return { id: 'claude', connected: false, detail: null }
    const config = JSON.parse(
      await readFile(join(process.env.CLAUDE_CONFIG_DIR || home, '.claude.json'), 'utf8')
    ) as { oauthAccount?: { emailAddress?: string } }
    return {
      id: 'claude',
      connected: true,
      detail:
        [
          config.oauthAccount?.emailAddress,
          oauth.subscriptionType && `plano ${oauth.subscriptionType}`
        ]
          .filter(Boolean)
          .join(' · ') || 'Conectado'
    }
  } catch {
    return null
  }
}

async function claudeStatus(): Promise<AccountStatus> {
  const fast = await claudeStatusFromFiles()
  if (fast) return fast
  try {
    const { out } = await runClaude(['auth', 'status', '--json'], 90_000)
    const data = JSON.parse(out.slice(out.indexOf('{'))) as {
      loggedIn?: boolean
      email?: string
      subscriptionType?: string
    }
    return {
      id: 'claude',
      connected: data.loggedIn === true,
      detail: data.loggedIn
        ? [data.email, data.subscriptionType && `plano ${data.subscriptionType}`]
            .filter(Boolean)
            .join(' · ')
        : null
    }
  } catch (err) {
    return { id: 'claude', connected: false, detail: null, error: (err as Error).message }
  }
}

// ---- ChatGPT (Codex app-server) -----------------------------------------------

/** Abre um Codex temporário só para falar de conta, e fecha no fim. */
async function withCodex<T>(
  work: (
    request: <R>(method: string, params?: unknown) => Promise<R>,
    onNotification: (listener: (n: IncomingNotification) => void) => void
  ) => Promise<T>
): Promise<T> {
  let listener: ((n: IncomingNotification) => void) | null = null
  const rpc = connectCodex(tmpdir(), {
    onRequest: () => undefined,
    onNotification: (n) => listener?.(n),
    onExit: () => undefined
  })
  try {
    await rpc.request('initialize', {
      clientInfo: { name: 'the-tree', title: 'The Tree', version: '0.0.1' },
      capabilities: null
    })
    rpc.notify('initialized')
    return await work(
      (method, params) => rpc.request(method, params),
      (l) => (listener = l)
    )
  } finally {
    rpc.close()
  }
}

interface CodexAccount {
  account: { type: string; email?: string | null; planType?: string } | null
}

async function codexStatus(): Promise<AccountStatus> {
  try {
    const { account } = await withCodex((request) => request<CodexAccount>('account/read', {}))
    return {
      id: 'codex',
      connected: account !== null,
      detail: account
        ? account.type === 'chatgpt'
          ? [account.email, account.planType && `plano ${account.planType}`]
              .filter(Boolean)
              .join(' · ')
          : 'Chave de API da OpenAI'
        : null
    }
  } catch (err) {
    return { id: 'codex', connected: false, detail: null, error: (err as Error).message }
  }
}

// ---- Gemini (chave guardada pelo app) -------------------------------------------

async function geminiStatus(): Promise<AccountStatus> {
  const has = await hasSecret('gemini-api-key')
  return { id: 'gemini', connected: has, detail: has ? 'Chave de API salva' : null }
}

// ---- Ações --------------------------------------------------------------------

export async function status(): Promise<AccountStatus[]> {
  return Promise.all([claudeStatus(), codexStatus(), geminiStatus()])
}

/**
 * Entra na conta pelo login oficial, no navegador. Termina quando o login acaba
 * (ou depois de 10 minutos). `onLink` recebe o link, caso o navegador não abra.
 * O Gemini não entra por aqui: a chave é colada na tela.
 */
export async function login(id: AccountId, onLink: (url: string) => void): Promise<AccountStatus> {
  if (id === 'claude') {
    let sent = false
    await runClaude(['auth', 'login', '--claudeai'], LOGIN_TIMEOUT_MS, (text) => {
      const url = /https:\/\/\S+/.exec(text)?.[0]
      if (url && !sent) {
        sent = true
        onLink(url)
      }
    })
    return claudeStatus()
  }
  if (id === 'codex') {
    await withCodex(async (request, onNotification) => {
      const done = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('O login não terminou a tempo.')),
          LOGIN_TIMEOUT_MS
        )
        onNotification((n) => {
          if (n.method !== 'account/login/completed') return
          clearTimeout(timer)
          const params = n.params as { success?: boolean; error?: string | null }
          if (params.success) resolve()
          else reject(new Error(params.error || 'O login não foi concluído.'))
        })
      })
      const started = await request<{ type: string; authUrl?: string }>('account/login/start', {
        type: 'chatgpt'
      })
      if (started.authUrl) {
        onLink(started.authUrl)
        void shell.openExternal(started.authUrl)
      }
      await done
    })
    return codexStatus()
  }
  throw new Error('O Gemini se conecta com a chave de API.')
}

/** Sai da conta (no Claude e no ChatGPT, vale para o computador inteiro). */
export async function logout(id: AccountId): Promise<AccountStatus> {
  if (id === 'claude') {
    await runClaude(['auth', 'logout'], 30_000)
    return claudeStatus()
  }
  if (id === 'codex') {
    await withCodex((request) => request('account/logout', {}))
    return codexStatus()
  }
  await removeSecret('gemini-api-key')
  return geminiStatus()
}
