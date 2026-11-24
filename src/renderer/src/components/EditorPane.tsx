// Coluna central: árvore de arquivos e editor.
// TODO: árvore de arquivos (window.api.files.list) e editor Monaco (read/write).
import type { Project } from '../../../shared/types'

interface Props {
  project: Project | null
}

export function EditorPane({ project }: Props) {
  return (
    <main className="pane editor">
      <h2>{project ? project.name : 'Editor'}</h2>
      <p className="empty">
        {project ? project.path : 'Selecione um projeto para ver os arquivos.'}
      </p>
    </main>
  )
}
