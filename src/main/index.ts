// Processo principal: cria a janela e liga os serviços.
import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { TITLEBAR_HEIGHT, windowChrome } from '../shared/theme'
import { registerIpc } from './ipc'
import { unwatchAll } from './files/watcher'

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

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
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

  // Em desenvolvimento o electron-vite serve a interface por URL; em produção é um arquivo.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  const agents = registerIpc()
  createWindow()

  // Ao sair, encerra os agentes e grava o histórico antes de fechar de vez.
  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    unwatchAll()
    agents.stopAll().finally(() => app.quit())
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
