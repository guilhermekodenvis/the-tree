// Centro da área de trabalho: árvore de arquivos do projeto e visualizador.
import { useState } from 'react'
import type { Project } from '../../../shared/types'
import { Button, IconButton } from './ui/Button'
import { Icon } from './ui/Icon'
import { FileTree } from './FileTree'
import { FileViewer } from './FileViewer'
import { useWatchProject } from '../lib/fileEvents'

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

  // A chave faz a árvore e o arquivo aberto recomeçarem ao trocar de projeto.
  return <Explorer key={project.id} project={project} />
}

function Explorer({ project }: { project: Project }) {
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [treeVersion, setTreeVersion] = useState(0)
  useWatchProject(project.id)

  return (
    <main className="pane pane--flush">
      <header className="pane__header pane__header--bar">
        <h1 className="text-subtitle truncate">{project.name}</h1>
        <p className="text-caption text-mono truncate" title={project.path}>
          {project.path}
        </p>
      </header>
      <div className="explorer">
        <nav className="explorer__tree" aria-label="Arquivos do projeto">
          <div className="explorer__tree-header">
            <span>Arquivos</span>
            <IconButton
              icon="refresh"
              label="Atualizar árvore de arquivos"
              onClick={() => setTreeVersion((v) => v + 1)}
            />
          </div>
          <FileTree
            key={treeVersion}
            projectId={project.id}
            selected={openFile}
            onOpen={setOpenFile}
          />
        </nav>
        <section className="explorer__viewer">
          <FileViewer projectId={project.id} path={openFile} />
        </section>
      </div>
    </main>
  )
}
