// Adaptador do codex. Ainda não implementado.
import type { AgentAdapter } from './adapter'

const notYet = (): never => {
  throw new Error('codex: ainda não implementado')
}

export const codexAdapter: AgentAdapter = {
  id: 'codex',
  start: async () => notYet(),
  send: async () => notYet(),
  respond: async () => notYet(),
  interrupt: async () => notYet(),
  stop: async () => notYet()
}
