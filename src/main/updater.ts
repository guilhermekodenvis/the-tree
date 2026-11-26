// Atualização automática do app instalado.
//
// Cada push na main gera, no GitHub Actions, um instalador com versão nova e o
// publica numa Release do repositório (ver .github/workflows/release.yml). Aqui o
// app confere se há versão nova ao abrir e a cada hora (ele fica dias aberto na
// bandeja), baixa em segundo plano e pergunta se pode reiniciar. Se você não
// reiniciar, a versão nova é instalada sozinha quando o app fechar.
//
// No modo de desenvolvimento (npm run dev) nada disso roda.
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/types'

const CHECK_EVERY_MS = 60 * 60 * 1000

let state: UpdateState = { current: app.getVersion(), status: 'idle', version: null, error: null }
let notify: (state: UpdateState) => void = () => undefined

function set(change: Partial<UpdateState>): void {
  state = { ...state, ...change }
  notify(state)
}

export function updateState(): UpdateState {
  return state
}

/** Liga o atualizador. `onChange` avisa a tela; `onReady` mostra o aviso do Windows. */
export function startUpdater(hooks: {
  onChange(state: UpdateState): void
  onReady(version: string): void
}): void {
  notify = hooks.onChange
  if (!app.isPackaged) {
    set({ status: 'dev' })
    return
  }

  autoUpdater.autoDownload = true
  // Sem reiniciar na hora, a atualização entra quando o app fechar.
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }))
  autoUpdater.on('update-not-available', () => set({ status: 'latest' }))
  autoUpdater.on('update-available', (info) => set({ status: 'downloading', version: info.version }))
  autoUpdater.on('update-downloaded', (info) => {
    set({ status: 'ready', version: info.version })
    hooks.onReady(info.version)
  })
  autoUpdater.on('error', (err) => {
    // Sem internet ou GitHub fora do ar: tenta de novo na próxima conferência.
    set({ status: 'error', error: err?.message ?? String(err) })
  })

  void checkNow()
  setInterval(() => void checkNow(), CHECK_EVERY_MS)
}

/** Confere agora (também pelo menu do ícone da bandeja). */
export async function checkNow(): Promise<void> {
  if (!app.isPackaged || state.status === 'downloading' || state.status === 'ready') return
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    set({ status: 'error', error: (err as Error).message })
  }
}

/** Fecha e instala a versão baixada; o app abre de novo sozinho. */
export function installNow(): void {
  if (state.status !== 'ready') return
  autoUpdater.quitAndInstall(true, true)
}
