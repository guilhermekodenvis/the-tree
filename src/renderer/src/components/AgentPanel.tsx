// Lado direito da área de trabalho: escolha do agente e a conversa do projeto ativo.
import type { AgentId, Project } from '../../../shared/types'
import type { AgentsState } from '../hooks/useAgents'
import { ChatView } from './ChatView'
import { Button } from './ui/Button'

const AGENTS: { id: AgentId; name: string; tool: string; available: boolean }[] = [
  { id: 'claude', name: 'Claude', tool: 'Claude Code', available: true },
  { id: 'codex', name: 'ChatGPT', tool: 'Codex CLI', available: false },
  { id: 'gemini', name: 'Gemini', tool: 'Gemini CLI', available: false }
]

interface Props {
  project: Project | null
  agents: AgentsState
}

export function AgentPanel({ project, agents }: Props) {
  const chat = project ? agents.chatOf(project.id) : null

  if (project && chat) {
    const agent = AGENTS.find((a) => a.id === chat.session.agent)
    return (
      <aside className="pane pane--flush">
        <ChatView
          chat={chat}
          agentName={agent?.name ?? chat.session.agent}
          onSend={(text) => agents.send(project.id, text)}
          onRespond={(requestId, allow) => agents.respond(project.id, requestId, allow)}
          onClose={() => agents.close(project.id)}
        />
      </aside>
    )
  }

  const startError = project ? agents.startErrorOf(project.id) : null
  const starting = project ? agents.isStarting(project.id) : false

  return (
    <aside className="pane">
      <header className="pane__header">
        <h2 className="text-subtitle">Agentes</h2>
        <p className="text-caption">
          {project ? `Para ${project.name}` : 'Selecione um projeto para conversar.'}
        </p>
      </header>
      {startError && (
        <p className="notice" role="alert">
          {startError}
        </p>
      )}
      <ul className="stack">
        {AGENTS.map((agent) => (
          <li key={agent.id} className="card">
            <span className={`dot dot--${agent.id}`} />
            <div className="card__body">
              <div>{agent.name}</div>
              <div className="text-caption">{agent.tool}</div>
            </div>
            {agent.available ? (
              <Button
                disabled={!project || starting}
                onClick={() => project && agents.start(project.id, agent.id)}
              >
                {starting ? 'Iniciando…' : 'Conversar'}
              </Button>
            ) : (
              <span className="badge">Em breve</span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}
