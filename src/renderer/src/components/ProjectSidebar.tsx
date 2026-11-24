// Barra lateral: lista simplificada dos projetos, com adicionar e remover.
// TODO: indicador de status por projeto (agente rodando, aguardando, erro).
import type { ProjectsState } from '../hooks/useProjects'
import { IconButton } from './ui/Button'
import { Icon } from './ui/Icon'

interface Props {
  state: ProjectsState
}

export function ProjectSidebar({ state }: Props) {
  const { projects, active, error, select, add, remove } = state

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span>Projetos</span>
        <IconButton icon="add" label="Adicionar projeto" onClick={add} />
      </div>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {projects.length === 0 ? (
        <p className="text-caption" style={{ padding: 'var(--space-2) var(--space-3)' }}>
          Nenhum projeto ainda. Use o + para adicionar uma pasta.
        </p>
      ) : (
        <ul className="sidebar__list">
          {projects.map((project) => (
            <li
              key={project.id}
              className={`nav-item ${project.id === active?.id ? 'nav-item--selected' : ''}`}
              onClick={() => select(project)}
            >
              <Icon name="folder" />
              <div className="nav-item__body">
                <div className="truncate">{project.name}</div>
                <div className="text-caption truncate" title={project.path}>
                  {project.path}
                </div>
              </div>
              <IconButton
                icon="dismiss"
                label={`Remover ${project.name} da lista`}
                danger
                className="nav-item__action"
                onClick={(event) => {
                  event.stopPropagation()
                  remove(project)
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
