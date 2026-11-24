// Centro da área de trabalho: árvore de arquivos e editor.
// TODO: árvore de arquivos (window.api.files.list) e editor Monaco (read/write).
import type { Project } from '../../../shared/types'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'

interface Props {
  project: Project | null
  hasProjects: boolean
  onAdd(): void
}

export function EditorPane({ project, hasProjects, onAdd }: Props) {
  if (!project) {
    return (
      <main className="pane">
        <div className="empty-state">
          <Icon name="folder" className="empty-state__icon" />
          <p className="empty-state__title">
            {hasProjects ? 'Nenhum projeto selecionado' : 'Comece adicionando um projeto'}
          </p>
          <p>
            {hasProjects
              ? 'Escolha um projeto na lista ao lado.'
              : 'Um projeto é uma pasta do seu computador onde os agentes vão trabalhar.'}
          </p>
          {!hasProjects && (
            <Button variant="accent" icon="add" className="empty-state__action" onClick={onAdd}>
              Adicionar projeto
            </Button>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="pane">
      <header className="pane__header">
        <h1 className="text-subtitle truncate">{project.name}</h1>
        <p className="text-caption text-mono truncate" title={project.path}>
          {project.path}
        </p>
      </header>
      <div className="empty-state">
        <p>Os arquivos deste projeto vão aparecer aqui.</p>
      </div>
    </main>
  )
}
