// Aba "Arquivos": árvore de arquivos do projeto e visualizador.
import { useState } from 'react'
import type { Project } from '../../../shared/types'
import { useWatchProject } from '../lib/fileEvents'
import { FileTree } from './FileTree'
import { FileViewer } from './FileViewer'
import { IconButton } from './ui/Button'

export function FilesTab({ project }: { project: Project }) {
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [treeVersion, setTreeVersion] = useState(0)
  useWatchProject(project.id)

  return (
    <div className="split">
      <nav className="split__side" aria-label="Arquivos do projeto">
        <div className="split__side-header">
          <span>Arquivos</span>
          <IconButton
            icon="refresh"
            label="Atualizar árvore de arquivos"
            onClick={() => setTreeVersion((v) => v + 1)}
          />
        </div>
        <FileTree key={treeVersion} projectId={project.id} selected={openFile} onOpen={setOpenFile} />
      </nav>
      <section className="split__main">
        <FileViewer projectId={project.id} path={openFile} />
      </section>
    </div>
  )
}
