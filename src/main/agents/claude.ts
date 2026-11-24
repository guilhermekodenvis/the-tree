// Adaptador do Claude Code.
// TODO: decidir entre o Claude Agent SDK (em processo) ou o CLI `claude` como processo filho.
import type { AgentAdapter } from './adapter'

export const claudeAdapter: AgentAdapter = {
  id: 'claude',

  async start(_sessionId, _cwd, _emit) {
    throw new Error('claude: start ainda não implementado')
  },

  async send(_sessionId, _message) {
    throw new Error('claude: send ainda não implementado')
  },

  async stop(_sessionId) {
    throw new Error('claude: stop ainda não implementado')
  }
}
