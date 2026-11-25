// Ícone do The Tree na bandeja do Windows (ao lado do relógio).
// Fechar a janela só a esconde: o app continua rodando para as automações
// dispararem no horário. "Sair", no menu do ícone, encerra de verdade.
import { app, Menu, nativeImage, Tray } from 'electron'
import trayIcon from '../../resources/tray@2x.png?asset'

let tray: Tray | null = null

/** Argumento usado quando o Windows abre o app ao ligar: começa escondido. */
export const HIDDEN_ARG = '--hidden'

/** O app instalado abre junto com o Windows (no modo de desenvolvimento não se aplica). */
function startsWithWindows(): boolean {
  return app.getLoginItemSettings({ args: [HIDDEN_ARG] }).openAtLogin
}

function setStartsWithWindows(on: boolean): void {
  app.setLoginItemSettings({ openAtLogin: on, args: [HIDDEN_ARG] })
}

/**
 * Na primeira vez que o app instalado roda, liga o "iniciar com o Windows":
 * as automações dependem do app aberto. Dá para desligar no menu do ícone.
 * Devolve true quando ligou (para gravar que já foi feito).
 */
export function ensureStartWithWindows(firstRun: boolean): boolean {
  if (!app.isPackaged || !firstRun) return false
  setStartsWithWindows(true)
  return true
}

export function createTray(handlers: { show(): void; quit(): void }): Tray {
  const image = nativeImage.createFromPath(trayIcon).resize({ width: 16, height: 16, quality: 'best' })
  tray = new Tray(image)
  tray.setToolTip('The Tree')

  const build = (): Menu =>
    Menu.buildFromTemplate([
      { label: 'Abrir The Tree', click: handlers.show },
      { type: 'separator' },
      app.isPackaged
        ? {
            label: 'Iniciar com o Windows',
            type: 'checkbox',
            checked: startsWithWindows(),
            click: (item) => setStartsWithWindows(item.checked)
          }
        : { label: 'Iniciar com o Windows (só no app instalado)', enabled: false },
      { type: 'separator' },
      { label: 'Sair do The Tree', click: handlers.quit }
    ])

  tray.on('click', handlers.show)
  // Monta o menu na hora de abrir, para o "Iniciar com o Windows" estar atualizado.
  tray.on('right-click', () => tray?.popUpContextMenu(build()))
  return tray
}
