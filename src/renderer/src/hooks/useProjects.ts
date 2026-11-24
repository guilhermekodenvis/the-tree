// Projetos e grupos de projetos, com as ações de organizar a tela de projetos.
import { useCallback, useEffect, useState } from 'react'
import type { Project, ProjectGroup } from '../../../shared/types'
import { messageOf } from '../lib/errors'

export interface ProjectsState {
  projects: Project[]
  groups: ProjectGroup[]
  /** A lista já foi lida do disco. */
  loaded: boolean
  error: string | null
  /**
   * Abre o seletor de pastas do Windows e põe o projeto no grupo (null = "Sem grupo").
   * Devolve o projeto, ou null se cancelou.
   */
  add(groupId: string | null): Promise<Project | null>
  remove(project: Project): Promise<void>
  rename(project: Project, name: string): Promise<void>
  move(project: Project, groupId: string | null): Promise<void>
  /** Cria um grupo com nome padrão e devolve o id dele (null se falhou). */
  createGroup(): Promise<string | null>
  renameGroup(group: ProjectGroup, name: string): Promise<void>
  removeGroup(group: ProjectGroup): Promise<void>
  /** Sobe (-1) ou desce (+1) o grupo uma posição. */
  moveGroup(group: ProjectGroup, step: number): Promise<void>
}

export function useProjects(): ProjectsState {
  const [projects, setProjects] = useState<Project[]>([])
  const [groups, setGroups] = useState<ProjectGroup[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const data = await window.api.projects.list()
    setProjects(data.projects)
    setGroups(data.groups)
  }, [])

  useEffect(() => {
    refresh()
      .catch((err) => setError(messageOf(err)))
      .finally(() => setLoaded(true))
  }, [refresh])

  /** Roda a ação, recarrega a lista e mostra o erro no topo da tela se falhar. */
  const run = useCallback(
    async <T>(action: () => Promise<T>, fallback: T): Promise<T> => {
      setError(null)
      try {
        const result = await action()
        await refresh()
        return result
      } catch (err) {
        setError(messageOf(err))
        await refresh().catch(() => undefined)
        return fallback
      }
    },
    [refresh]
  )

  return {
    projects,
    groups,
    loaded,
    error,
    add: (groupId) => run(() => window.api.projects.pick(groupId), null),
    remove: (project) => run(() => window.api.projects.remove(project.id), undefined),
    rename: (project, name) => run(() => window.api.projects.rename(project.id, name), undefined),
    move: (project, groupId) => run(() => window.api.projects.move(project.id, groupId), undefined),
    createGroup: () => run(async () => (await window.api.groups.create()).id, null),
    renameGroup: (group, name) => run(() => window.api.groups.rename(group.id, name), undefined),
    removeGroup: (group) => run(() => window.api.groups.remove(group.id), undefined),
    moveGroup: (group, step) =>
      run(async () => {
        const ids = groups.map((g) => g.id)
        const from = ids.indexOf(group.id)
        const to = from + step
        if (from === -1 || to < 0 || to >= ids.length) return
        ids.splice(from, 1)
        ids.splice(to, 0, group.id)
        await window.api.groups.reorder(ids)
      }, undefined)
  }
}
