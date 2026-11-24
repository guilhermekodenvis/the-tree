// Adaptador do gemini. Ainda não implementado.
import type { AgentAdapter } from './adapter'

const notYet = (): never => {
  throw new Error('gemini: ainda não implementado')
}

export const geminiAdapter: AgentAdapter = {
  id: 'gemini',
  start: async () => notYet(),
  send: async () => notYet(),
  respond: async () => notYet(),
  interrupt: async () => notYet(),
  stop: async () => notYet()
}
