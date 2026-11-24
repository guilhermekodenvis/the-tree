// Árvore de arquivos do projeto. Cada pasta só carrega o conteúdo quando é aberta;
// cada pasta aberta se recarrega sozinha quando o conteúdo dela muda no disco.
import { useEffect, useState, type CSSProperties } from 'react'
import type { FileEntry } from '../../../shared/types'
import { messageOf } from '../lib/errors'
import { useFileChanges } from '../lib/fileEvents'
import { Icon } from './ui/Icon'

interface TreeProps {
  projectId: string
  /** Caminho do arquivo aberto no visualizador. */
  selected: string | null
  onOpen(path: string): void
}

export function FileTree(props: TreeProps) {
  return (
    <ul className="tree" role="tree">
      <Directory {...props} path="" depth={0} />
    </ul>
  )
}

interface DirectoryProps extends TreeProps {
  path: string
  depth: number
}

const indent = (depth: number): CSSProperties => ({ '--depth': depth }) as CSSProperties

function Directory({ projectId, path, depth, selected, onOpen }: DirectoryProps) {
  const [entries, setEntries] = useState<FileEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  // Recarrega esta pasta quando algo dentro dela muda no disco.
  useFileChanges(
    projectId,
    (change) => change.dirs.includes(path),
    () => setVersion((v) => v + 1)
  )

  useEffect(() => {
    let stale = false
    window.api.files
      .list(projectId, path)
      .then((result) => {
        if (stale) return
        setEntries(result)
        setError(null)
      })
      .catch((err) => !stale && setError(messageOf(err)))
    return () => {
      stale = true
    }
  }, [projectId, path, version])

  if (error) return <Note depth={depth} text={error} danger />
  if (!entries) return <Note depth={depth} text="Carregando…" />
  if (entries.length === 0) return <Note depth={depth} text="Pasta vazia" />

  return (
    <>
      {entries.map((entry) =>
        entry.isDirectory ? (
          <Folder
            key={entry.path}
            entry={entry}
            projectId={projectId}
            depth={depth}
            selected={selected}
            onOpen={onOpen}
          />
        ) : (
          <li key={entry.path} role="none">
            <button
              type="button"
              role="treeitem"
              aria-selected={entry.path === selected}
              className={`tree-item ${entry.path === selected ? 'tree-item--selected' : ''}`}
              style={indent(depth)}
              title={entry.path}
              onClick={() => onOpen(entry.path)}
            >
              <span className="tree-item__chevron" />
              <Icon name="document" />
              <span className="truncate">{entry.name}</span>
            </button>
          </li>
        )
      )}
    </>
  )
}

interface FolderProps extends TreeProps {
  entry: FileEntry
  depth: number
}

function Folder({ entry, projectId, depth, selected, onOpen }: FolderProps) {
  const [open, setOpen] = useState(false)

  return (
    <li role="none">
      <button
        type="button"
        role="treeitem"
        aria-expanded={open}
        className="tree-item"
        style={indent(depth)}
        title={entry.path}
        onClick={() => setOpen(!open)}
      >
        <Icon
          name="chevron"
          className={`icon tree-item__chevron ${open ? 'tree-item__chevron--open' : ''}`}
        />
        <Icon name="folder" />
        <span className="truncate">{entry.name}</span>
      </button>
      {open && (
        <ul role="group">
          <Directory
            projectId={projectId}
            path={entry.path}
            depth={depth + 1}
            selected={selected}
            onOpen={onOpen}
          />
        </ul>
      )}
    </li>
  )
}

function Note({ depth, text, danger }: { depth: number; text: string; danger?: boolean }) {
  return (
    <li className={`tree-note ${danger ? 'tree-note--danger' : ''}`} style={indent(depth)}>
      {text}
    </li>
  )
}
