// Adaptador do Gemini CLI.
// TODO: rodar o CLI `gemini` como processo filho e traduzir a saída.
import type { AgentAdapter } from './adapter'

export const geminiAdapter: AgentAdapter = {
  id: 'gemini',

  async start(_sessionId, _cwd, _emit) {
    throw new Error('gemini: start ainda não implementado')
  },

  async send(_sessionId, _message) {
    throw new Error('gemini: send ainda não implementado')
  },

  async respond(_sessionId, _requestId, _allow) {
    throw new Error('gemini: respond ainda não implementado')
  },

  async stop(_sessionId) {
    throw new Error('gemini: stop ainda não implementado')
  }
}
