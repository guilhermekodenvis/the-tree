// Distribui os avisos de mudança no disco para os componentes interessados
// (cada pasta aberta na árvore e o arquivo aberto no visualizador).
import { useEffect, useRef } from 'react'
import type { FilesChanged } from '../../../shared/types'

/**
 * Chama `onChange` quando algo muda no projeto e `matches` reconhece a mudança
 * como relevante para quem está ouvindo.
 */
export function useFileChanges(
  projectId: string,
  matches: (change: FilesChanged) => boolean,
  onChange: () => void
): void {
  // Guarda sempre a versão mais nova das funções (elas dependem de props que mudam).
  const latest = useRef({ matches, onChange })
  latest.current = { matches, onChange }

  useEffect(() => {
    return window.api.files.onChanged((change) => {
      if (change.projectId !== projectId) return
      if (change.all || latest.current.matches(change)) latest.current.onChange()
    })
  }, [projectId])
}

/** Liga a observação do disco enquanto o componente estiver na tela. */
export function useWatchProject(projectId: string): void {
  useEffect(() => {
    void window.api.files.watch(projectId).catch(() => undefined)
    return () => void window.api.files.unwatch(projectId).catch(() => undefined)
  }, [projectId])
}
