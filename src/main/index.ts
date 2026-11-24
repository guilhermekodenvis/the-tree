// Processo principal: cria a janela e liga os serviços.
import { app, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'node:path'
import { TITLEBAR_HEIGHT, windowChrome } from '../shared/theme'
import { registerIpc } from './ipc'

function chrome() {
  return nativeTheme.shouldUseDarkColors ? windowChrome.dark : windowChrome.light
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
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
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
