// Projetos abertos em abas, como num navegador: quais estão abertos, em que
// ordem, qual está na frente e em que seção (Arquivos, Agentes, Skills) cada um
// ficou. Tudo é lembrado neste computador entre aberturas do app.
import { useCallback, useEffect, useState } from 'react'
import type { ProjectTab } from '../components/ProjectScreen'

const KEY = 'the-tree:open-projects'

interface OpenState {
  /** Ids dos projetos abertos, na ordem das abas. */
  open: string[]
  active: string | null
  /** Seção escolhida em cada projeto aberto. */
  tabs: Record<string, ProjectTab>
}

const EMPTY: OpenState = { open: [], active: null, tabs: {} }

function read(): OpenState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<OpenState> | null
    if (!saved || !Array.isArray(saved.open)) return EMPTY
    const open = saved.open.filter((id): id is string => typeof id === 'string')
    return {
      open,
      active: saved.active && open.includes(saved.active) ? saved.active : (open[0] ?? null),
      tabs: saved.tabs && typeof saved.tabs === 'object' ? saved.tabs : {}
    }
  } catch {
    return EMPTY
  }
}

export interface OpenProjectsState {
  open: string[]
  active: string | null
  tabOf(projectId: string): ProjectTab
  /** Abre o projeto numa aba (ou só traz para a frente, se já estiver aberto). */
  openProject(projectId: string): void
  activate(projectId: string): void
  /** Fecha a aba; a vizinha da direita (ou da esquerda) vem para a frente. */
  close(projectId: string): void
  setTab(projectId: string, tab: ProjectTab): void
  /** Fecha as abas de projetos que não existem mais. */
  keepOnly(projectIds: string[]): void
}

export function useOpenProjects(): OpenProjectsState {
  const [state, setState] = useState<OpenState>(read)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // Sem armazenamento local: as abas só não são lembradas.
    }
  }, [state])

  const close = useCallback((projectId: string) => {
    setState((prev) => {
      const index = prev.open.indexOf(projectId)
      if (index === -1) return prev
      const open = prev.open.filter((id) => id !== projectId)
      const { [projectId]: _removed, ...tabs } = prev.tabs
      const active =
        prev.active === projectId ? (open[index] ?? open[index - 1] ?? null) : prev.active
      return { open, active, tabs }
    })
  }, [])

  const keepOnly = useCallback((projectIds: string[]) => {
    setState((prev) => {
      const valid = new Set(projectIds)
      if (prev.open.every((id) => valid.has(id))) return prev
      const open = prev.open.filter((id) => valid.has(id))
      const active = prev.active && valid.has(prev.active) ? prev.active : (open[0] ?? null)
      return { ...prev, open, active }
    })
  }, [])

  const openProject = useCallback(
    (projectId: string) =>
      setState((prev) => ({
        ...prev,
        open: prev.open.includes(projectId) ? prev.open : [...prev.open, projectId],
        active: projectId
      })),
    []
  )

  const setTab = useCallback(
    (projectId: string, tab: ProjectTab) =>
      setState((prev) => ({ ...prev, tabs: { ...prev.tabs, [projectId]: tab } })),
    []
  )

  return {
    open: state.open,
    active: state.active,
    tabOf: (projectId) => state.tabs[projectId] ?? 'files',
    openProject,
    activate: (projectId) => setState((prev) => ({ ...prev, active: projectId })),
    close,
    setTab,
    keepOnly
  }
}
