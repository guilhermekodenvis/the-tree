// Adaptador do Codex (ChatGPT).
// TODO: decidir entre o SDK do Codex ou o CLI `codex` como processo filho.
import type { AgentAdapter } from './adapter'

export const codexAdapter: AgentAdapter = {
  id: 'codex',

  async start(_sessionId, _cwd, _emit) {
    throw new Error('codex: start ainda não implementado')
  },

  async send(_sessionId, _message) {
    throw new Error('codex: send ainda não implementado')
  },

  async respond(_sessionId, _requestId, _allow) {
    throw new Error('codex: respond ainda não implementado')
  },

  async stop(_sessionId) {
    throw new Error('codex: stop ainda não implementado')
  }
}
