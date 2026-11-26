// Processo principal: cria a janela e liga os serviços.
//
// Fechar a janela não encerra o app: ele fica na bandeja do Windows para as
// automações dispararem no horário. Só "Sair", no menu do ícone, encerra.
import { app, BrowserWindow, nativeTheme, Notification, shell } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { TITLEBAR_HEIGHT, windowChrome } from '../shared/theme'
import appIcon from '../../resources/icon.png?asset'
import { registerIpc } from './ipc'
import { unwatchAll } from './files/watcher'
import { createTray, ensureStartWithWindows, HIDDEN_ARG } from './tray'
import { registerAttachmentScheme, serveAttachments } from './attachments/store'
import { startUpdater } from './updater'

// Precisa acontecer antes de o app ficar pronto (miniaturas dos anexos).
registerAttachmentScheme()

let mainWindow: BrowserWindow | null = null
let quitting = false

/** Estado do app entre aberturas. */
interface AppState {
  /** O app instalado já ligou o "iniciar com o Windows" uma vez (o modo dev não conta). */
  startupConfigured?: boolean
  trayHintShown?: boolean
}
const stateFile = (): string => join(app.getPath('userData'), 'app-state.json')
async function readState(): Promise<AppState> {
  try {
    return JSON.parse(await readFile(stateFile(), 'utf8')) as AppState
  } catch {
    return {}
  }
}
async function writeState(state: AppState): Promise<void> {
  await writeFile(stateFile(), JSON.stringify(state), 'utf8').catch(() => undefined)
}

/** Mostra a janela (criando de novo se preciso) e a traz para a frente. */
function showWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow(true)
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  return mainWindow
}

function chrome() {
  return nativeTheme.shouldUseDarkColors ? windowChrome.dark : windowChrome.light
}

/** Abre links da web no navegador do sistema; qualquer outro endereço é ignorado. */
function openExternal(url: string): void {
  try {
    const { protocol } = new URL(url)
    if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(url)
  } catch {
    // Endereço inválido: não faz nada.
  }
}

function createWindow(visible: boolean): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    icon: appIcon,
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 600,
    title: 'The Tree',
    backgroundColor: chrome().background,
    // Sem a barra de título padrão: a interface desenha a sua e o Windows
    // sobrepõe só os botões de minimizar, maximizar e fechar.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: chrome().background,
      symbolColor: chrome().symbol,
      height: TITLEBAR_HEIGHT
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Acompanha a troca de tema claro/escuro do Windows com o app aberto.
  const syncChrome = (): void => {
    if (win.isDestroyed()) return
    win.setBackgroundColor(chrome().background)
    win.setTitleBarOverlay({ color: chrome().background, symbolColor: chrome().symbol })
  }
  nativeTheme.on('updated', syncChrome)
  win.on('closed', () => nativeTheme.off('updated', syncChrome))

  // Links nas respostas dos agentes nunca abrem dentro do app: vão para o navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url === win.webContents.getURL()) return
    event.preventDefault()
    openExternal(url)
  })

  if (visible) win.once('ready-to-show', () => win.show())

  // Fechar esconde: o app segue na bandeja. Na primeira vez, avisa onde ele ficou.
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win.hide()
    void readState().then((state) => {
      if (state.trayHintShown || !Notification.isSupported()) return
      new Notification({
        title: 'O The Tree continua rodando',
        body: 'Ele fica na bandeja, ao lado do relógio, para as automações rodarem no horário. Para encerrar, clique com o botão direito no ícone e escolha Sair.',
        icon: appIcon
      }).show()
      void writeState({ ...state, trayHintShown: true })
    })
  })

  // Em desenvolvimento o electron-vite serve a interface por URL; em produção é um arquivo.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// Só uma instância por vez: duas gravariam a lista de projetos, o histórico e as
// chaves nos mesmos arquivos ao mesmo tempo. Abrir de novo só traz a janela à frente.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  app.whenReady().then(() => void start())
}

async function start(): Promise<void> {
  app.setAppUserModelId('com.thetree.app')
  serveAttachments()
  const { agents, engine } = registerIpc({
    notify(title, body, target) {
      if (!Notification.isSupported()) return
      const note = new Notification({ title, body, icon: appIcon })
      // Clicar no aviso abre a execução na aba Automações do projeto.
      note.on('click', () => showWindow().webContents.send('automations:open', target))
      note.show()
    }
  })

  // Primeira abertura do app instalado: liga o "iniciar com o Windows" (dá para
  // desligar depois no menu do ícone, e a escolha é respeitada).
  const state = await readState()
  if (ensureStartWithWindows(!state.startupConfigured)) {
    await writeState({ ...state, startupConfigured: true })
  }

  // Aberto pelo Windows ao ligar: começa escondido, só na bandeja.
  mainWindow = createWindow(!process.argv.includes(HIDDEN_ARG))
  createTray({ show: () => void showWindow(), quit: () => app.quit() })
  await engine.init()

  // Versão nova publicada no GitHub: baixa sozinha e pergunta se pode reiniciar.
  startUpdater({
    onChange: (state) => {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('updates:changed', state)
    },
    onReady: (version) => {
      if (!Notification.isSupported()) return
      const note = new Notification({
        title: `Atualização ${version} pronta`,
        body: 'Reinicie o The Tree para usar a versão nova (ou ela entra quando o app fechar).',
        icon: appIcon
      })
      note.on('click', () => void showWindow())
      note.show()
    }
  })

  // Ao sair, encerra agentes e automações e grava o histórico antes de fechar de vez.
  let stopping = false
  app.on('before-quit', (event) => {
    quitting = true
    if (stopping) return
    stopping = true
    event.preventDefault()
    unwatchAll()
    Promise.allSettled([engine.stopAll(), agents.stopAll()]).finally(() => app.quit())
  })

  app.on('activate', () => showWindow())
}

// Sem janelas abertas o app continua na bandeja (as automações seguem valendo).
app.on('window-all-closed', () => undefined)
