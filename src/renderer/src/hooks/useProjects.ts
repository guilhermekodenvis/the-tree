// Lista de projetos e as ações de adicionar e remover.
import { useCallback, useEffect, useState } from 'react'
import type { Project } from '../../../shared/types'
import { messageOf } from '../lib/errors'

export interface ProjectsState {
  projects: Project[]
  /** A lista já foi lida do disco. */
  loaded: boolean
  error: string | null
  /** Abre o seletor de pastas do Windows. Devolve o projeto, ou null se cancelou. */
  add(): Promise<Project | null>
  remove(project: Project): Promise<void>
}

export function useProjects(): ProjectsState {
  const [projects, setProjects] = useState<Project[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.projects
      .list()
      .then(setProjects)
      .catch((err) => setError(messageOf(err)))
      .finally(() => setLoaded(true))
  }, [])

  const add = useCallback(async () => {
    setError(null)
    try {
      const project = await window.api.projects.pick()
      if (project) setProjects(await window.api.projects.list())
      return project
    } catch (err) {
      setError(messageOf(err))
      return null
    }
  }, [])

  const remove = useCallback(async (project: Project) => {
    setError(null)
    try {
      await window.api.projects.remove(project.id)
      setProjects(await window.api.projects.list())
    } catch (err) {
      setError(messageOf(err))
    }
  }, [])

  return { projects, loaded, error, add, remove }
}
