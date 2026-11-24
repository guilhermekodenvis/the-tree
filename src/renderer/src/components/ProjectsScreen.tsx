// Tela de projetos: botão de adicionar e um card por projeto.
import { useState } from 'react'
import type { Project } from '../../../shared/types'
import type { ProjectsState } from '../hooks/useProjects'
import { Button, IconButton } from './ui/Button'
import { Icon } from './ui/Icon'

interface Props {
  state: ProjectsState
  onOpen(project: Project): void
  /** Remove o projeto da lista (e apaga as conversas dele). */
  onRemove(project: Project): Promise<void>
}

export function ProjectsScreen({ state, onOpen, onRemove }: Props) {
  const { projects, loaded, error } = state

  const add = async (): Promise<void> => {
    const project = await state.add()
    if (project) onOpen(project)
  }

  return (
    <main className="screen">
      <header className="screen__header">
        <div>
          <h1 className="text-title">Projetos</h1>
          <p className="text-caption">
            Cada projeto é uma pasta do seu computador onde os agentes trabalham.
          </p>
        </div>
        <Button variant="accent" icon="add" onClick={() => void add()}>
          Adicionar projeto
        </Button>
      </header>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {loaded && projects.length === 0 ? (
        <div className="empty-state">
          <Icon name="folders" className="empty-state__icon" />
          <p className="empty-state__title">Nenhum projeto ainda</p>
          <p>Adicione uma pasta para começar.</p>
        </div>
      ) : (
        <ul className="project-grid">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => onOpen(project)}
              onRemove={() => onRemove(project)}
            />
          ))}
        </ul>
      )}
    </main>
  )
}

function ProjectCard({
  project,
  onOpen,
  onRemove
}: {
  project: Project
  onOpen(): void
  onRemove(): Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <li className="project-card project-card--confirm">
        <p className="project-card__name truncate">Remover {project.name}?</p>
        <p className="text-caption">
          As conversas deste projeto serão apagadas. A pasta no disco não é alterada.
        </p>
        <div className="project-card__actions">
          <Button variant="accent" onClick={() => void onRemove()}>
            Remover
          </Button>
          <Button onClick={() => setConfirming(false)}>Cancelar</Button>
        </div>
      </li>
    )
  }

  return (
    <li className="project-card">
      <button type="button" className="project-card__open" onClick={onOpen} title={project.path}>
        <span className="project-card__icon">
          <Icon name="folder" />
        </span>
        <span className="project-card__name truncate">{project.name}</span>
        <span className="text-caption text-mono truncate">{project.path}</span>
      </button>
      <IconButton
        icon="delete"
        label={`Remover ${project.name} da lista`}
        danger
        className="project-card__remove"
        onClick={() => setConfirming(true)}
      />
    </li>
  )
}
