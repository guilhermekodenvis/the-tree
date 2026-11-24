// Coluna direita: conversas com os agentes do projeto ativo.
// TODO: iniciar sessão (window.api.agents.start), caixa de mensagem e fluxo de eventos (onEvent).
import type { AgentId, Project } from '../../../shared/types'

const AGENTS: { id: AgentId; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'ChatGPT (Codex)' },
  { id: 'gemini', label: 'Gemini' }
]

interface Props {
  project: Project | null
}

export function AgentPanel({ project }: Props) {
  return (
    <aside className="pane agents">
      <h2>Agentes</h2>
      <ul>
        {AGENTS.map((agent) => (
          <li key={agent.id}>
            <button disabled={!project}>{agent.label}</button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
