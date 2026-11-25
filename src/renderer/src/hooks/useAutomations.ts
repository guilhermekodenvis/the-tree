// Automações de um projeto e as execuções de uma automação, sempre atualizadas:
// o processo principal avisa (automations:changed) a cada mudança.
import { useCallback, useEffect, useState } from 'react'
import type { AutomationRun, AutomationSummary, RunSummary } from '../../../shared/automation'
import { messageOf } from '../lib/errors'

/** Roda `refresh` agora e a cada aviso de mudança no projeto. */
function useLive(projectId: string, refresh: () => Promise<void>): void {
  useEffect(() => {
    void refresh()
    return window.api.automations.onChanged((changed) => {
      if (changed === projectId) void refresh()
    })
  }, [projectId, refresh])
}

export function useAutomationList(projectId: string) {
  const [list, setList] = useState<AutomationSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setList(await window.api.automations.list(projectId))
    } catch (err) {
      setError(messageOf(err))
    }
  }, [projectId])
  useLive(projectId, refresh)

  return { list, error, setError, refresh }
}

/** Quantas execuções do projeto pedem atenção e não foram vistas (bolinha na aba). */
export function useUnseenAutomations(projectId: string): number {
  const [count, setCount] = useState(0)
  const refresh = useCallback(async () => {
    setCount(await window.api.automations.unseen(projectId).catch(() => 0))
  }, [projectId])
  useLive(projectId, refresh)
  return count
}

export function useRuns(projectId: string, automationId: string) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null)
  const refresh = useCallback(async () => {
    setRuns(await window.api.automations.runs(automationId).catch(() => []))
  }, [automationId])
  useLive(projectId, refresh)
  return runs
}

export function useRun(projectId: string, automationId: string, runId: string | null) {
  const [run, setRun] = useState<AutomationRun | null>(null)
  const refresh = useCallback(async () => {
    if (!runId) {
      setRun(null)
      return
    }
    setRun(await window.api.automations.getRun(automationId, runId).catch(() => null))
  }, [automationId, runId])
  useLive(projectId, refresh)
  return run
}
