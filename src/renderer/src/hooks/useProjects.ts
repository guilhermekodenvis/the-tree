// Estado dos projetos na interface: lista, projeto ativo e as ações de adicionar/remover.
import { useCallback, useEffect, useState } from 'react'
import type { Project } from '../../../shared/types'

export interface ProjectsState {
  projects: Project[]
  active: Project | null
  error: string | null
  select(project: Project): void
  /** Abre o seletor de pastas do Windows e cadastra a pasta escolhida. */
  add(): Promise<void>
  remove(project: Project): Promise<void>
}

function messageOf(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  // O Electron prefixa erros vindos do processo principal; mostramos só a parte útil.
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function useProjects(): ProjectsState {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.projects
      .list()
      .then(setProjects)
      .catch((err) => setError(messageOf(err)))
  }, [])

  const add = useCallback(async () => {
    setError(null)
    try {
      const project = await window.api.projects.pick()
      if (!project) return // usuário cancelou o seletor
      setProjects(await window.api.projects.list())
      setActiveId(project.id)
    } catch (err) {
      setError(messageOf(err))
    }
  }, [])

  const remove = useCallback(async (project: Project) => {
    setError(null)
    try {
      await window.api.projects.remove(project.id)
      setProjects(await window.api.projects.list())
      setActiveId((current) => (current === project.id ? null : current))
    } catch (err) {
      setError(messageOf(err))
    }
  }, [])

  return {
    projects,
    active: projects.find((p) => p.id === activeId) ?? null,
    error,
    select: (project) => setActiveId(project.id),
    add,
    remove
  }
}
