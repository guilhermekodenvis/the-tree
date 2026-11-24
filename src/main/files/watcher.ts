// Observa a pasta de um projeto e avisa a interface quando algo muda no disco
// (por exemplo, quando um agente cria ou edita um arquivo).
// Os avisos são agrupados: uma rajada de mudanças vira um aviso só.
import { watch as fsWatch, type FSWatcher } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { sep } from 'node:path'
import type { FilesChanged } from '../../shared/types'
import * as projects from '../projects/store'

const DEBOUNCE_MS = 250
/** Acima disso, em vez de listar, pede para recarregar tudo. */
const MAX_LISTED = 500
/** Mudanças aqui dentro não interessam à árvore de arquivos. */
const IGNORED = ['.git']

interface Watched {
  watcher: FSWatcher
  refs: number
  timer: NodeJS.Timeout | null
  dirs: Set<string>
  paths: Set<string>
  all: boolean
}

const watched = new Map<string, Watched>()

function parentOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

export async function watch(
  projectId: string,
  notify: (change: FilesChanged) => void
): Promise<void> {
  const current = watched.get(projectId)
  if (current) {
    current.refs++
    return
  }

  const project = await projects.get(projectId)
  if (!project) throw new Error(`Projeto não encontrado: ${projectId}`)
  const root = await realpath(project.path)

  const flush = (): void => {
    const entry = watched.get(projectId)
    if (!entry) return
    entry.timer = null
    notify({ projectId, dirs: [...entry.dirs], paths: [...entry.paths], all: entry.all })
    entry.dirs.clear()
    entry.paths.clear()
    entry.all = false
  }

  // No Windows e no macOS, `recursive` usa o aviso nativo do sistema e cobre todas as subpastas.
  const watcher = fsWatch(root, { recursive: true }, (_type, filename) => {
    const entry = watched.get(projectId)
    if (!entry) return
    if (!filename) {
      entry.all = true
    } else {
      const path = filename.toString().split(sep).join('/')
      if (IGNORED.some((name) => path === name || path.startsWith(`${name}/`))) return
      if (entry.paths.size >= MAX_LISTED) entry.all = true
      else {
        entry.paths.add(path)
        entry.dirs.add(parentOf(path))
      }
    }
    entry.timer ??= setTimeout(flush, DEBOUNCE_MS)
  })

  // Se a pasta some ou fica inacessível, para de observar sem derrubar o app.
  watcher.on('error', () => stopWatching(projectId))

  watched.set(projectId, {
    watcher,
    refs: 1,
    timer: null,
    dirs: new Set(),
    paths: new Set(),
    all: false
  })
}

function stopWatching(projectId: string): void {
  const entry = watched.get(projectId)
  if (!entry) return
  if (entry.timer) clearTimeout(entry.timer)
  entry.watcher.close()
  watched.delete(projectId)
}

export function unwatch(projectId: string): void {
  const entry = watched.get(projectId)
  if (!entry) return
  entry.refs--
  if (entry.refs <= 0) stopWatching(projectId)
}

export function unwatchAll(): void {
  for (const projectId of [...watched.keys()]) stopWatching(projectId)
}
