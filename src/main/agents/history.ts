// Conversas de cada projeto, num arquivo JSON por projeto em <dados do app>/chats.
// O arquivo guarda as conversas na ordem escolhida, com nome, agente e histórico.
// As gravações são agrupadas para não escrever no disco a cada pedaço de texto.
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { agentName } from '../../shared/agents'
import { settleSaved } from '../../shared/chat'
import type { AgentId, AgentSettings, ChatItem, ConversationRecord } from '../../shared/types'

const SAVE_DELAY_MS = 500

interface ProjectChats {
  conversations: ConversationRecord[]
}

const cache = new Map<string, ProjectChats>()
const timers = new Map<string, NodeJS.Timeout>()

function fileOf(projectId: string): string {
  // O id é um UUID gerado pelo app; a checagem impede um caminho estranho de escapar da pasta.
  if (!/^[\w-]+$/.test(projectId)) throw new Error(`Id de projeto inválido: ${projectId}`)
  return join(app.getPath('userData'), 'chats', `${projectId}.json`)
}

/**
 * Formato antigo (uma conversa por projeto: { agent, items, resumeId }) vira uma
 * lista com essa conversa só, para nada salvo antes se perder.
 */
function migrate(parsed: unknown): ProjectChats {
  const data = parsed as Partial<ProjectChats> & Partial<ConversationRecord>
  if (Array.isArray(data.conversations)) return { conversations: data.conversations }
  if (data.agent && Array.isArray(data.items)) {
    const now = Date.now()
    return {
      conversations: [
        {
          id: randomUUID(),
          agent: data.agent,
          name: agentName(data.agent),
          items: data.items,
          resumeId: data.resumeId,
          createdAt: data.updatedAt ?? now,
          updatedAt: data.updatedAt ?? now
        }
      ]
    }
  }
  return { conversations: [] }
}

export async function load(projectId: string): Promise<ProjectChats> {
  const cached = cache.get(projectId)
  if (cached) return cached
  let data: ProjectChats = { conversations: [] }
  let migrated = false
  try {
    const parsed = JSON.parse(await readFile(fileOf(projectId), 'utf8'))
    migrated = !Array.isArray((parsed as Partial<ProjectChats>).conversations)
    data = migrate(parsed)
    // Pedidos de autorização que ficaram sem resposta já não valem: o processo acabou.
    data.conversations = data.conversations.map((c) => ({ ...c, items: settleSaved(c.items) }))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  cache.set(projectId, data)
  // Grava logo no formato novo, para a conversa convertida manter o mesmo id.
  if (migrated) scheduleSave(projectId)
  return data
}

async function write(projectId: string): Promise<void> {
  const data = cache.get(projectId)
  if (!data) return
  const file = fileOf(projectId)
  await mkdir(join(file, '..'), { recursive: true })
  const temp = `${file}.tmp`
  await writeFile(temp, JSON.stringify(data), 'utf8')
  await rename(temp, file)
}

function scheduleSave(projectId: string): void {
  if (timers.has(projectId)) return
  timers.set(
    projectId,
    setTimeout(() => {
      timers.delete(projectId)
      write(projectId).catch((err) => console.error('Falha ao salvar conversas:', err))
    }, SAVE_DELAY_MS)
  )
}

function setConversations(projectId: string, conversations: ConversationRecord[]): void {
  cache.set(projectId, { conversations })
  scheduleSave(projectId)
}

/**
 * Conversa já carregada na memória, sem esperar o disco. As atualizações durante
 * uma sessão usam isto: com uma leitura assíncrona no meio, duas atualizações
 * seguidas partiriam da mesma versão e uma apagaria a outra.
 */
export function cached(projectId: string, conversationId: string): ConversationRecord | undefined {
  return cache.get(projectId)?.conversations.find((c) => c.id === conversationId)
}

export async function get(projectId: string, conversationId: string): Promise<ConversationRecord> {
  const found = (await load(projectId)).conversations.find((c) => c.id === conversationId)
  if (!found) throw new Error('Esta conversa não existe mais.')
  return found
}

export async function items(projectId: string, conversationId: string): Promise<ChatItem[]> {
  return (await get(projectId, conversationId)).items
}

export async function create(projectId: string, agent: AgentId): Promise<ConversationRecord> {
  const { conversations } = await load(projectId)
  // Nome padrão numerado por agente: "Claude 1", "Claude 2"...
  const base = agentName(agent)
  const used = new Set(conversations.map((c) => c.name))
  let n = conversations.filter((c) => c.agent === agent).length + 1
  while (used.has(`${base} ${n}`)) n++

  const now = Date.now()
  const record: ConversationRecord = {
    id: randomUUID(),
    agent,
    name: `${base} ${n}`,
    items: [],
    createdAt: now,
    updatedAt: now
  }
  setConversations(projectId, [...conversations, record])
  return record
}

/** Altera uma conversa já carregada, de forma síncrona (ver `cached`). */
export function update(
  projectId: string,
  conversationId: string,
  change: (record: ConversationRecord) => ConversationRecord
): void {
  const data = cache.get(projectId)
  if (!data) return
  setConversations(
    projectId,
    data.conversations.map((c) =>
      c.id === conversationId ? { ...change(c), updatedAt: Date.now() } : c
    )
  )
}

export async function renameConversation(
  projectId: string,
  conversationId: string,
  name: string
): Promise<void> {
  const clean = name.trim().slice(0, 80)
  if (!clean) throw new Error('O nome não pode ficar vazio.')
  await get(projectId, conversationId)
  update(projectId, conversationId, (c) => ({ ...c, name: clean }))
}

export async function setBypass(
  projectId: string,
  conversationId: string,
  on: boolean
): Promise<void> {
  await get(projectId, conversationId)
  update(projectId, conversationId, (c) => ({ ...c, bypass: on }))
}

export async function setSettings(
  projectId: string,
  conversationId: string,
  settings: AgentSettings
): Promise<void> {
  await get(projectId, conversationId)
  update(projectId, conversationId, (c) => ({ ...c, settings }))
}

export async function remove(projectId: string, conversationId: string): Promise<void> {
  const { conversations } = await load(projectId)
  setConversations(
    projectId,
    conversations.filter((c) => c.id !== conversationId)
  )
}

export async function reorder(projectId: string, ids: string[]): Promise<void> {
  const { conversations } = await load(projectId)
  const position = new Map(ids.map((id, index) => [id, index]))
  // Conversas que não vieram na lista (não deveria acontecer) vão para o fim.
  const sorted = [...conversations].sort(
    (a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity)
  )
  setConversations(projectId, sorted)
}

/** Apaga o arquivo do projeto inteiro. */
export async function removeProject(projectId: string): Promise<void> {
  clearTimeout(timers.get(projectId))
  timers.delete(projectId)
  cache.delete(projectId)
  await rm(fileOf(projectId), { force: true })
}

/** Grava já tudo o que estiver pendente (usado ao fechar o app). */
export async function flush(): Promise<void> {
  const pending = [...timers.keys()]
  for (const id of pending) clearTimeout(timers.get(id))
  timers.clear()
  await Promise.allSettled(pending.map((id) => write(id)))
}
