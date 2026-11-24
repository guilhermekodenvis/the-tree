// Skills globais (menu Skills) e skills de um projeto (aba Skills do projeto).
import { useCallback, useEffect, useState } from 'react'
import type { Skill } from '../../../shared/types'
import { messageOf } from '../lib/errors'

export type PickKind = 'folder' | 'file'

interface Common {
  loaded: boolean
  error: string | null
  /** Abre o seletor do Windows e adiciona a skill escolhida. */
  pick(kind: PickKind): Promise<void>
  /** Tira a skill do app (o arquivo fica no disco). */
  remove(skill: Skill): Promise<void>
}

/** Roda uma ação, recarrega e guarda o erro (se houver) para mostrar no topo. */
function useRunner(refresh: () => Promise<void>) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    refresh()
      .catch((err) => setError(messageOf(err)))
      .finally(() => setLoaded(true))
  }, [refresh])

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setError(null)
      try {
        await action()
      } catch (err) {
        setError(messageOf(err))
      }
      await refresh().catch(() => undefined)
    },
    [refresh]
  )
  return { loaded, error, run }
}

export interface GlobalSkillsState extends Common {
  skills: Skill[]
}

export function useGlobalSkills(): GlobalSkillsState {
  const [skills, setSkills] = useState<Skill[]>([])
  const refresh = useCallback(async () => setSkills(await window.api.skills.listGlobal()), [])
  const { loaded, error, run } = useRunner(refresh)

  return {
    skills,
    loaded,
    error,
    pick: (kind) => run(() => window.api.skills.pick(kind, null)),
    remove: (skill) => run(() => window.api.skills.remove(skill.id))
  }
}

export interface ProjectSkillsState extends Common {
  /** Locais, só deste projeto. */
  own: Skill[]
  /** Globais trazidas para o projeto. */
  imported: Skill[]
  /** Globais que ainda não foram trazidas (para o menu "Skill global"). */
  importable: Skill[]
  importGlobal(skill: Skill): Promise<void>
  /** Tira uma global do projeto; ela continua no menu Skills. */
  unimport(skill: Skill): Promise<void>
}

export function useProjectSkills(projectId: string): ProjectSkillsState {
  const [own, setOwn] = useState<Skill[]>([])
  const [imported, setImported] = useState<Skill[]>([])
  const [globals, setGlobals] = useState<Skill[]>([])

  const refresh = useCallback(async () => {
    const [mine, all] = await Promise.all([
      window.api.skills.listProject(projectId),
      window.api.skills.listGlobal()
    ])
    setOwn(mine.own)
    setImported(mine.imported)
    setGlobals(all)
  }, [projectId])
  const { loaded, error, run } = useRunner(refresh)

  const importedIds = new Set(imported.map((s) => s.id))

  return {
    own,
    imported,
    importable: globals.filter((s) => !importedIds.has(s.id)),
    loaded,
    error,
    pick: (kind) => run(() => window.api.skills.pick(kind, projectId)),
    remove: (skill) => run(() => window.api.skills.remove(skill.id)),
    importGlobal: (skill) => run(() => window.api.skills.importToProject(projectId, skill.id)),
    unimport: (skill) => run(() => window.api.skills.removeFromProject(projectId, skill.id))
  }
}
