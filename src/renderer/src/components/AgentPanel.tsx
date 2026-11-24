// Lado direito da área de trabalho: escolha do agente e a conversa do projeto ativo.
import { useEffect } from 'react'
import type { AgentId, Project } from '../../../shared/types'
import type { AgentsState } from '../hooks/useAgents'
import { ChatView } from './ChatView'
import { Button } from './ui/Button'

export const AGENTS: { id: AgentId; name: string; tool: string; available: boolean }[] = [
  { id: 'claude', name: 'Claude', tool: 'Claude Code', available: true },
  { id: 'codex', name: 'ChatGPT', tool: 'Codex', available: true },
  { id: 'gemini', name: 'Gemini', tool: 'Gemini CLI', available: false }
]

interface Props {
  project: Project | null
  agents: AgentsState
}

export function AgentPanel({ project, agents }: Props) {
  const projectId = project?.id ?? null

  // Ao abrir um projeto, traz a conversa salva dele (se houver).
  useEffect(() => {
    if (projectId) agents.load(projectId)
  }, [projectId, agents.load])

  if (!project) {
    return (
      <aside className="pane">
        <header className="pane__header">
          <h2 className="text-subtitle">Agentes</h2>
          <p className="text-caption">Selecione um projeto para conversar.</p>
        </header>
      </aside>
    )
  }

  const chat = agents.chatOf(project.id)
  const starting = agents.isStarting(project.id)
  const startError = agents.startErrorOf(project.id)

  if (chat) {
    const agent = AGENTS.find((a) => a.id === chat.agent)
    return (
      <aside className="pane pane--flush">
        <ChatView
          chat={chat}
          agentName={agent?.name ?? chat.agent}
          starting={starting}
          startError={startError}
          onSend={(text) => agents.send(project.id, text)}
          onRespond={(requestId, allow) => agents.respond(project.id, requestId, allow)}
          onInterrupt={() => agents.interrupt(project.id)}
          onForget={() => agents.forget(project.id)}
        />
      </aside>
    )
  }

  const loading = agents.isLoading(project.id)

  return (
    <aside className="pane">
      <header className="pane__header">
        <h2 className="text-subtitle">Agentes</h2>
        <p className="text-caption">Para {project.name}</p>
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
              <Button disabled={loading || starting} onClick={() => agents.start(project.id, agent.id)}>
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
