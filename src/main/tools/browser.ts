// Ferramentas do conector Navegador: um navegador invisível do próprio The Tree
// (o Chromium do Electron) que o agente usa para abrir sites, ler o conteúdo,
// procurar chats de atendimento e tirar prints.
//
// Isolado do resto: sessão própria só na memória (sem cookies nem logins seus),
// sem Node, sem downloads, sem pop-ups e sem pedidos de permissão (câmera,
// localização...). Cada pedido abre uma janela nova e a fecha no fim.
import { app, BrowserWindow, session, type Session } from 'electron'

const PARTITION = 'the-tree-browser'
const LOAD_TIMEOUT_MS = 45_000
const MAX_OPEN = 3
const MAX_TEXT = 15_000

let configured: Session | null = null

function browserSession(): Session {
  if (configured) return configured
  const s = session.fromPartition(PARTITION)
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  s.setPermissionCheckHandler(() => false)
  s.on('will-download', (event) => event.preventDefault())
  // Sem "Electron" e "the-tree" no agente do navegador: alguns sites bloqueiam.
  s.setUserAgent(app.userAgentFallback.replace(/\s(Electron|the-tree)\/\S+/gi, ''))
  configured = s
  return s
}

// Poucas janelas ao mesmo tempo: cada uma é um Chromium inteiro.
let open = 0
const waiting: (() => void)[] = []

async function acquire(): Promise<void> {
  if (open < MAX_OPEN) {
    open++
    return
  }
  await new Promise<void>((resolve) => waiting.push(resolve))
}

function release(): void {
  const next = waiting.shift()
  if (next) next()
  else open--
}

function normalizeUrl(raw: string): string {
  const text = raw.trim()
  if (!text) throw new Error('Informe o endereço do site.')
  const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('O navegador só abre endereços http e https.')
  }
  return url.toString()
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Abre a página numa janela invisível, espera carregar (mais `waitMs` para os
 * widgets que chegam depois) e entrega a janela para `use`.
 */
async function withPage<T>(
  rawUrl: string,
  waitMs: number,
  use: (win: BrowserWindow, load: { status: number | null; error: string | null }) => Promise<T>
): Promise<T> {
  const url = normalizeUrl(rawUrl)
  await acquire()
  const win = new BrowserWindow({
    show: false,
    width: 1366,
    height: 900,
    webPreferences: {
      session: browserSession(),
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      javascript: true
    }
  })
  win.webContents.setAudioMuted(true)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const load = { status: null as number | null, error: null as string | null }
  win.webContents.on('did-navigate', (_event, _url, code) => {
    load.status = code
  })

  try {
    try {
      await Promise.race([
        win.loadURL(url),
        sleep(LOAD_TIMEOUT_MS).then(() => {
          throw new Error('TIMEOUT')
        })
      ])
    } catch (err) {
      const message = (err as Error).message ?? String(err)
      // Redirecionamentos às vezes "abortam" a primeira carga, mas a página abre.
      const loaded = win.webContents.getURL() && win.webContents.getURL() !== 'about:blank'
      if (message === 'TIMEOUT') {
        load.error = loaded ? null : 'O site não terminou de carregar em 45 segundos.'
      } else if (!/ERR_ABORTED/.test(message) || !loaded) {
        const code = message.match(/ERR_[A-Z_]+/)?.[0]
        load.error = code ? `O site não abriu (${code}).` : `O site não abriu: ${message}`
      }
    }
    if (!load.error) await sleep(waitMs)
    return await use(win, load)
  } finally {
    win.destroy()
    release()
  }
}

/** Roda na página: lê o texto, os links e os sinais de chat de atendimento. */
const INSPECT = `(() => {
  const vendors = {
    tidio: /tidio/i, intercom: /intercom/i, crisp: /crisp\\.chat|\\$crisp/i, drift: /drift/i,
    zendesk: /zendesk|zopim|zdassets/i, tawk: /tawk\\.to/i, livechat: /livechat(inc)?\\.com/i,
    botpress: /botpress/i, voiceflow: /voiceflow/i, landbot: /landbot/i, manychat: /manychat/i,
    chatbase: /chatbase/i, smartsupp: /smartsupp/i, hubspot_chat: /hs-scripts|hubspot.*conversations|usemessages/i,
    freshchat: /freshchat|freshworks/i, jivo: /jivo/i, olark: /olark/i, userlike: /userlike/i,
    chatwoot: /chatwoot/i, typebot: /typebot/i, dialogflow: /dialogflow/i, botsonic: /botsonic|writesonic/i,
    tiledesk: /tiledesk/i, gohighlevel: /leadconnector|msgsndr/i, kommo: /kommo/i, respond_io: /respond\\.io/i,
    wati: /wati\\.io/i, callbell: /callbell/i, wix_chat: /wixapps.*chat|wix-chat/i, openai: /openai|chatgpt|gpt-/i
  }
  const where = (u) => { try { const x = new URL(u, location.href); return x.hostname + x.pathname } catch (e) { return '' } }
  const scripts = [...document.scripts].map((s) => where(s.src)).filter(Boolean)
  const inline = [...document.scripts].filter((s) => !s.src).map((s) => s.textContent.slice(0, 4000)).join(' ')
  const iframes = [...document.querySelectorAll('iframe')].map((f) => where(f.src) || f.title || '')
  const found = Object.entries(vendors)
    .filter(([, re]) => scripts.some((s) => re.test(s)) || iframes.some((f) => re.test(f)) || re.test(inline))
    .map(([name]) => name)
  const globals = ['Intercom', 'drift', '$crisp', 'tidioChatApi', 'Tawk_API', 'zE', 'zEmbed',
    'HubSpotConversations', 'LiveChatWidget', 'voiceflow', 'botpressWebChat', 'chatbase',
    'smartsupp', 'fcWidget', 'jivo_api', 'olark', '$chatwoot', 'Typebot', 'LC_API']
    .filter((k) => { try { return window[k] !== undefined } catch (e) { return false } })
  const describe = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
    (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 3).join('.') : '')
  const elements = [...document.querySelectorAll('[id*=chat i],[class*=chat i],[id*=bot i],chat-widget')]
    .slice(0, 8).map(describe)
  const links = [...document.querySelectorAll('a[href]')]
    .map((a) => ({ text: (a.innerText || a.title || '').trim().slice(0, 80), href: a.href }))
    .filter((l) => /^(https?|mailto|tel):/i.test(l.href))
  const seen = new Set()
  const uniqueLinks = links.filter((l) => !seen.has(l.href) && seen.add(l.href)).slice(0, 80)
  const meta = document.querySelector('meta[name="description"]')
  return {
    final_url: location.href,
    title: document.title,
    description: meta ? meta.getAttribute('content') : null,
    text: (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n'),
    links: uniqueLinks,
    whatsapp_links: links.map((l) => l.href).filter((h) => /wa\\.me|whatsapp/i.test(h)).slice(0, 5),
    chat: {
      ai_or_live_chat_vendors: found,
      chat_globals: globals,
      chat_elements: elements,
      chat_scripts: scripts
        .filter((s) => /chat|bot|widget|messag/i.test(s) || Object.values(vendors).some((re) => re.test(s)))
        .slice(0, 10),
      chat_iframes: iframes.filter((f) => /chat|bot|widget|messag/i.test(f)).slice(0, 5)
    }
  }
})()`

export interface OpenInput {
  url: string
  /** Espera extra depois de carregar, em segundos (padrão 4, máximo 20). */
  wait?: number
  /** Corpo de uma função async rodada na página; o `return` volta para o agente. */
  script?: string
}

/** Abre o site e devolve texto, links e sinais de chat (e o resultado de `script`). */
export async function openPage(input: OpenInput) {
  const waitMs = Math.min(Math.max(Number(input.wait ?? 4), 0), 20) * 1000
  return withPage(input.url, waitMs, async (win, load) => {
    if (load.error) return { requested_url: input.url, http_status: load.status, error: load.error }
    const page = (await win.webContents.executeJavaScript(INSPECT, true)) as {
      text: string
      [key: string]: unknown
    }
    const truncated = page.text.length > MAX_TEXT
    let scriptResult: unknown
    if (input.script?.trim()) {
      try {
        scriptResult = await win.webContents.executeJavaScript(
          `(async () => {\n${input.script}\n})()`,
          true
        )
      } catch (err) {
        scriptResult = { error: (err as Error).message ?? String(err) }
      }
    }
    return {
      requested_url: input.url,
      http_status: load.status,
      ...page,
      text: page.text.slice(0, MAX_TEXT),
      ...(truncated ? { text_truncated: true } : {}),
      ...(input.script?.trim() ? { script_result: scriptResult ?? null } : {})
    }
  })
}

/** Print da parte visível da página, em JPEG (para o agente "ver" o site). */
export async function screenshot(input: { url: string; wait?: number; fullPage?: boolean }) {
  const waitMs = Math.min(Math.max(Number(input.wait ?? 4), 0), 20) * 1000
  return withPage(input.url, waitMs, async (win, load) => {
    if (load.error) return { error: load.error, image: null }
    if (input.fullPage) {
      const height = (await win.webContents.executeJavaScript(
        'Math.min(document.documentElement.scrollHeight, 6000)',
        true
      )) as number
      if (height > 900) {
        win.setContentSize(1366, height)
        await sleep(800)
      }
    }
    const image = await win.webContents.capturePage()
    const size = image.getSize()
    const resized = size.width > 1280 ? image.resize({ width: 1280 }) : image
    return {
      error: null,
      title: win.webContents.getTitle(),
      final_url: win.webContents.getURL(),
      image: resized.toJPEG(70).toString('base64')
    }
  })
}

/** Teste do conector: abre uma página simples e confere se leu o título. */
export async function test(): Promise<string> {
  const page = await openPage({ url: 'https://example.com', wait: 0 })
  if ('error' in page && page.error) throw new Error(String(page.error))
  return `O navegador funciona: abriu example.com e leu o título "${(page as { title?: string }).title ?? ''}".`
}
