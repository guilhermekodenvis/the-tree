// Lado direito da área de trabalho: os agentes disponíveis para o projeto ativo.
// TODO: iniciar sessão (window.api.agents.start), caixa de mensagem e fluxo de eventos (onEvent).
import type { AgentId, Project } from '../../../shared/types'

const AGENTS: { id: AgentId; name: string; tool: string }[] = [
  { id: 'claude', name: 'Claude', tool: 'Claude Code' },
  { id: 'codex', name: 'ChatGPT', tool: 'Codex CLI' },
  { id: 'gemini', name: 'Gemini', tool: 'Gemini CLI' }
]

interface Props {
  project: Project | null
}

export function AgentPanel({ project }: Props) {
  return (
    <aside className="pane">
      <header className="pane__header">
        <h2 className="text-subtitle">Agentes</h2>
        <p className="text-caption">
          {project ? `Para ${project.name}` : 'Selecione um projeto para conversar.'}
        </p>
      </header>
      <ul className="stack">
        {AGENTS.map((agent) => (
          <li key={agent.id} className="card">
            <span className={`dot dot--${agent.id}`} />
            <div className="card__body">
              <div>{agent.name}</div>
              <div className="text-caption">{agent.tool}</div>
            </div>
            <span className="badge">Em breve</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
