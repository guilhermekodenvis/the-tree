// Histórico das conversas, um arquivo JSON por projeto em <dados do app>/chats.
// (No Windows: %APPDATA%\the-tree\chats.) As gravações são agrupadas para não
// escrever no disco a cada pedaço de texto que chega.
import { app } from 'electron'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { settleSaved } from '../../shared/chat'
import type { ChatRecord } from '../../shared/types'

const SAVE_DELAY_MS = 500

const cache = new Map<string, ChatRecord | null>()
const timers = new Map<string, NodeJS.Timeout>()

function fileOf(projectId: string): string {
  // O id é um UUID gerado pelo app; a checagem impede um caminho estranho de escapar da pasta.
  if (!/^[\w-]+$/.test(projectId)) throw new Error(`Id de projeto inválido: ${projectId}`)
  return join(app.getPath('userData'), 'chats', `${projectId}.json`)
}

export async function load(projectId: string): Promise<ChatRecord | null> {
  if (cache.has(projectId)) return cache.get(projectId) ?? null
  let record: ChatRecord | null = null
  try {
    const parsed = JSON.parse(await readFile(fileOf(projectId), 'utf8')) as ChatRecord
    record = { ...parsed, items: settleSaved(parsed.items ?? []) }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  cache.set(projectId, record)
  return record
}

async function write(projectId: string): Promise<void> {
  const record = cache.get(projectId)
  if (!record) return
  const file = fileOf(projectId)
  await mkdir(join(file, '..'), { recursive: true })
  const temp = `${file}.tmp`
  await writeFile(temp, JSON.stringify(record), 'utf8')
  await rename(temp, file)
}

/**
 * Conversa já carregada na memória, sem esperar o disco. As atualizações durante
 * uma sessão usam isto: com uma leitura assíncrona no meio, duas atualizações
 * seguidas partiriam da mesma versão e uma apagaria a outra.
 */
export function cached(projectId: string): ChatRecord | null | undefined {
  return cache.get(projectId)
}

/** Guarda a conversa; a escrita em disco acontece logo depois, agrupada. */
export function save(projectId: string, record: ChatRecord): void {
  cache.set(projectId, { ...record, updatedAt: Date.now() })
  if (timers.has(projectId)) return
  timers.set(
    projectId,
    setTimeout(() => {
      timers.delete(projectId)
      write(projectId).catch((err) => console.error('Falha ao salvar conversa:', err))
    }, SAVE_DELAY_MS)
  )
}

export async function remove(projectId: string): Promise<void> {
  clearTimeout(timers.get(projectId))
  timers.delete(projectId)
  cache.set(projectId, null)
  await rm(fileOf(projectId), { force: true })
}

/** Grava já tudo o que estiver pendente (usado ao fechar o app). */
export async function flush(): Promise<void> {
  const pending = [...timers.keys()]
  for (const id of pending) clearTimeout(timers.get(id))
  timers.clear()
  await Promise.allSettled(pending.map((id) => write(id)))
}
