// Os agentes que o The Tree conhece. Usado pelo processo principal (nomes padrão
// das conversas) e pela interface (menus e rótulos).
import type { AgentId } from './types'

export interface AgentInfo {
  id: AgentId
  /** Nome curto mostrado na interface. */
  name: string
  /** Ferramenta que roda por baixo. */
  tool: string
}

export const AGENTS: AgentInfo[] = [
  { id: 'claude', name: 'Claude', tool: 'Claude Code' },
  { id: 'codex', name: 'ChatGPT', tool: 'Codex' },
  { id: 'gemini', name: 'Gemini', tool: 'Gemini CLI' }
]

export function agentName(id: AgentId): string {
  return AGENTS.find((agent) => agent.id === id)?.name ?? id
}
