// Onde as automações e as execuções ficam no disco (pasta de dados do app):
// - automations.json: todas as automações, de todos os projetos;
// - automation-runs/<automação>/<execução>.json: uma execução por arquivo.
// Só as últimas MAX_RUNS execuções de cada automação são guardadas.
import { app } from 'electron'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Automation, AutomationRun } from '../../shared/automation'

const MAX_RUNS = 100

let automations: Automation[] | null = null
/** Execuções já lidas, por automação. */
const runs = new Map<string, Map<string, AutomationRun>>()

const root = (): string => app.getPath('userData')
const automationsFile = (): string => join(root(), 'automations.json')
const runsDir = (automationId: string): string => join(root(), 'automation-runs', automationId)

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  await writeFile(temp, JSON.stringify(data), 'utf8')
  await rename(temp, file)
}

export async function loadAutomations(): Promise<Automation[]> {
  if (automations) return automations
  try {
    const parsed = JSON.parse(await readFile(automationsFile(), 'utf8')) as unknown
    automations = Array.isArray(parsed) ? (parsed as Automation[]) : []
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    automations = []
  }
  return automations
}

export async function saveAutomations(list: Automation[]): Promise<void> {
  await writeJson(automationsFile(), list)
  automations = list
}

export async function loadRuns(automationId: string): Promise<Map<string, AutomationRun>> {
  const cached = runs.get(automationId)
  if (cached) return cached
  const map = new Map<string, AutomationRun>()
  const names = await readdir(runsDir(automationId)).catch(() => [] as string[])
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    try {
      const run = JSON.parse(await readFile(join(runsDir(automationId), name), 'utf8')) as AutomationRun
      map.set(run.id, run)
    } catch {
      // Arquivo pela metade (app fechado no meio da gravação): ignora.
    }
  }
  runs.set(automationId, map)
  return map
}

/** Grava uma execução (e apaga as mais antigas além do limite). */
export async function saveRun(run: AutomationRun): Promise<void> {
  const map = await loadRuns(run.automationId)
  map.set(run.id, run)
  await writeJson(join(runsDir(run.automationId), `${run.id}.json`), run)
  if (map.size > MAX_RUNS) {
    const old = [...map.values()]
      .filter((r) => r.status !== 'running' && r.status !== 'waiting' && r.status !== 'queued')
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, map.size - MAX_RUNS)
    for (const r of old) {
      map.delete(r.id)
      await rm(join(runsDir(run.automationId), `${r.id}.json`), { force: true })
    }
  }
}

/** Apaga todas as execuções de uma automação. */
export async function removeRuns(automationId: string): Promise<void> {
  runs.delete(automationId)
  await rm(runsDir(automationId), { recursive: true, force: true })
}
