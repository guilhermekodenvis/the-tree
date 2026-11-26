// Quais conectores de ferramenta estão ligados (Google Maps, Navegador).
// O estado fica em tool-connectors.json; a chave do Google Maps fica criptografada
// no cofre (secrets.ts) e nunca volta para a interface.
import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ToolConnectorId, ToolConnectorStatus } from '../../shared/types'
import { getSecret, hasSecret, removeSecret, setSecret } from '../secrets'

type Stored = Partial<Record<ToolConnectorId, boolean>>

export const TOOL_CONNECTORS: ToolConnectorId[] = ['maps', 'browser']
const MAPS_KEY = 'connector:google-maps' as const

let cache: Stored | null = null

function storeFile(): string {
  return join(app.getPath('userData'), 'tool-connectors.json')
}

async function load(): Promise<Stored> {
  if (cache) return cache
  try {
    const parsed = JSON.parse(await readFile(storeFile(), 'utf8')) as unknown
    cache = parsed && typeof parsed === 'object' ? (parsed as Stored) : {}
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    cache = {}
  }
  return cache
}

async function save(next: Stored): Promise<void> {
  const file = storeFile()
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  await writeFile(temp, JSON.stringify(next, null, 2), 'utf8')
  await rename(temp, file)
  cache = next
}

// Uma alteração por vez: duas ao mesmo tempo leriam o mesmo estado e a segunda
// gravação apagaria a primeira.
let queue: Promise<unknown> = Promise.resolve()

function update(change: (current: Stored) => Stored): Promise<void> {
  const run = queue.then(async () => save(change(await load())))
  queue = run.catch(() => undefined)
  return run
}

export async function isConnected(id: ToolConnectorId): Promise<boolean> {
  return (await load())[id] === true
}

export async function status(id: ToolConnectorId): Promise<ToolConnectorStatus> {
  const connected = await isConnected(id)
  if (id === 'maps') {
    return { id, connected, detail: connected ? 'Chave de API salva' : null }
  }
  return { id, connected, detail: connected ? 'Navegador do The Tree' : null }
}

export async function statusAll(): Promise<ToolConnectorStatus[]> {
  return Promise.all(TOOL_CONNECTORS.map(status))
}

/** Liga o conector. O Google Maps só liga com uma chave (nova ou já salva). */
export async function connect(id: ToolConnectorId, key?: string): Promise<void> {
  if (id === 'maps') {
    const clean = (key ?? '').trim()
    if (clean) await setSecret(MAPS_KEY, clean)
    else if (!(await hasSecret(MAPS_KEY))) throw new Error('Cole a chave de API do Google Maps.')
  }
  await update((current) => ({ ...current, [id]: true }))
}

export async function disconnect(id: ToolConnectorId): Promise<void> {
  await update((current) => {
    const next = { ...current }
    delete next[id]
    return next
  })
  if (id === 'maps') await removeSecret(MAPS_KEY)
}

/** A chave do Google Maps, lida só na hora de pesquisar. */
export async function mapsKey(): Promise<string | null> {
  return getSecret(MAPS_KEY)
}
