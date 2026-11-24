// Cores da moldura da janela (barra de título e botões do Windows).
// O processo principal não lê CSS, então estes valores espelham
// --color-bg-base e --size-titlebar de src/renderer/src/design/tokens.css.

export const TITLEBAR_HEIGHT = 40

export const windowChrome = {
  light: { background: '#f3f3f3', symbol: '#1b1b1b' },
  dark: { background: '#202020', symbol: '#ffffff' }
} as const
