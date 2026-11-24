// Mostra o conteúdo de um arquivo, somente leitura.
// TODO: trocar por um editor (Monaco) com realce de sintaxe e gravação.
import { useEffect, useRef, useState } from 'react'
import type { FileContent } from '../../../shared/types'
import { messageOf } from '../lib/errors'
import { useFileChanges } from '../lib/fileEvents'
import { Icon } from './ui/Icon'

interface Props {
  projectId: string
  /** Caminho relativo ao projeto, ou null se nenhum arquivo foi aberto. */
  path: string | null
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; file: FileContent }
  | { status: 'error'; message: string }

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function FileViewer({ projectId, path }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const shownPath = useRef<string | null>(null)

  // Se o arquivo aberto muda no disco (ex.: um agente o editou), mostra a versão nova.
  useFileChanges(
    projectId,
    (change) => path !== null && change.paths.includes(path),
    () => setVersion((v) => v + 1)
  )

  useEffect(() => {
    if (path === null) return
    let stale = false
    // Só mostra "Carregando…" ao trocar de arquivo; ao recarregar o mesmo, troca direto.
    if (shownPath.current !== path) setState({ status: 'loading' })
    shownPath.current = path
    window.api.files
      .read(projectId, path)
      .then((file) => !stale && setState({ status: 'ready', file }))
      .catch((err) => !stale && setState({ status: 'error', message: messageOf(err) }))
    return () => {
      stale = true
    }
  }, [projectId, path, version])

  if (path === null) {
    return (
      <div className="empty-state">
        <Icon name="document" className="empty-state__icon" />
        <p className="empty-state__title">Nenhum arquivo aberto</p>
        <p>Escolha um arquivo na árvore ao lado.</p>
      </div>
    )
  }

  return (
    <>
      <div className="viewer__bar text-caption text-mono truncate" title={path}>
        {path}
      </div>
      {state.status === 'loading' && <div className="empty-state">Carregando…</div>}
      {state.status === 'error' && (
        <div className="empty-state">
          <p className="notice" role="alert">
            {state.message}
          </p>
        </div>
      )}
      {state.status === 'ready' && <Content file={state.file} />}
    </>
  )
}

function Content({ file }: { file: FileContent }) {
  if (file.kind === 'text') {
    if (file.content === '') return <div className="empty-state">Arquivo vazio.</div>
    return <pre className="code-view">{file.content}</pre>
  }

  return (
    <div className="empty-state">
      <p className="empty-state__title">
        {file.kind === 'binary' ? 'Arquivo binário' : 'Arquivo grande demais'}
      </p>
      <p>
        {file.kind === 'binary'
          ? `Não é texto, então não dá para mostrar aqui (${formatSize(file.size)}).`
          : `Tem ${formatSize(file.size)}; o visualizador abre até 1 MB.`}
      </p>
    </div>
  )
}
