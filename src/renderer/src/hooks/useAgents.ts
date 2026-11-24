// Estado das conversas com agentes. Fica no topo do app para que cada conversa
// continue viva (e recebendo eventos) enquanto você navega por outros projetos.
import { useCallback, useEffect, useState } from 'react'
import type { AgentEvent, AgentId, AgentSession, SessionStatus } from '../../../shared/types'
import { messageOf } from '../lib/errors'

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; detail: string }
  | {
      kind: 'permission'
      id: string
      title: string
      detail: string
      state: 'pending' | 'allowed' | 'denied' | 'cancelled'
    }
  | { kind: 'error'; id: string; text: string }

export interface Chat {
  session: AgentSession
  status: SessionStatus
  items: ChatItem[]
}

/** Uma conversa por projeto, indexada pelo id do projeto. */
type Chats = Record<string, Chat>

export interface AgentsState {
  chatOf(projectId: string): Chat | null
  /** Erro ao tentar iniciar uma conversa neste projeto, se houve. */
  startErrorOf(projectId: string): string | null
  /** Verdadeiro enquanto a conversa deste projeto está sendo iniciada (leva alguns segundos). */
  isStarting(projectId: string): boolean
  start(projectId: string, agent: AgentId): Promise<void>
  send(projectId: string, text: string): Promise<void>
  respond(projectId: string, requestId: string, allow: boolean): Promise<void>
  close(projectId: string): Promise<void>
}

let localId = 0
const nextId = (): string => `local-${++localId}`

function applyEvent(chat: Chat, event: AgentEvent): Chat {
  switch (event.type) {
    case 'text': {
      const last = chat.items.at(-1)
      // Pedaços do mesmo bloco de texto se juntam no último balão.
      if (last?.kind === 'assistant' && last.id === event.key) {
        const merged = { ...last, text: last.text + event.text }
        return { ...chat, items: [...chat.items.slice(0, -1), merged] }
      }
      return { ...chat, items: [...chat.items, { kind: 'assistant', id: event.key, text: event.text }] }
    }
    case 'tool':
      return {
        ...chat,
        items: [...chat.items, { kind: 'tool', id: event.id, name: event.name, detail: event.detail }]
      }
    case 'permission':
      return {
        ...chat,
        items: [
          ...chat.items,
          {
            kind: 'permission',
            id: event.requestId,
            title: event.title,
            detail: event.detail,
            state: 'pending'
          }
        ]
      }
    case 'permission-cancelled':
      return setPermission(chat, event.requestId, 'cancelled')
    case 'status':
      return { ...chat, status: event.status }
    case 'error':
      return { ...chat, items: [...chat.items, { kind: 'error', id: nextId(), text: event.message }] }
  }
}

function setPermission(
  chat: Chat,
  requestId: string,
  state: 'allowed' | 'denied' | 'cancelled'
): Chat {
  return {
    ...chat,
    items: chat.items.map((item) =>
      item.kind === 'permission' && item.id === requestId ? { ...item, state } : item
    )
  }
}

export function useAgents(): AgentsState {
  const [chats, setChats] = useState<Chats>({})
  const [startErrors, setStartErrors] = useState<Record<string, string>>({})
  const [starting, setStarting] = useState<Record<string, true>>({})

  /** Atualiza a conversa de um projeto, se ela ainda existir. */
  const update = useCallback((projectId: string, change: (chat: Chat) => Chat) => {
    setChats((prev) => (prev[projectId] ? { ...prev, [projectId]: change(prev[projectId]) } : prev))
  }, [])

  useEffect(() => {
    return window.api.agents.onEvent((event) => {
      setChats((prev) => {
        const projectId = Object.keys(prev).find((id) => prev[id].session.id === event.sessionId)
        if (!projectId) return prev
        return { ...prev, [projectId]: applyEvent(prev[projectId], event) }
      })
    })
  }, [])

  const addError = useCallback(
    (projectId: string, err: unknown) => {
      update(projectId, (chat) => ({
        ...chat,
        items: [...chat.items, { kind: 'error', id: nextId(), text: messageOf(err) }]
      }))
    },
    [update]
  )

  const start = useCallback(async (projectId: string, agent: AgentId) => {
    setStartErrors(({ [projectId]: _cleared, ...rest }) => rest)
    setStarting((prev) => ({ ...prev, [projectId]: true }))
    try {
      const session = await window.api.agents.start(projectId, agent)
      setChats((prev) => ({ ...prev, [projectId]: { session, status: 'idle', items: [] } }))
    } catch (err) {
      setStartErrors((prev) => ({ ...prev, [projectId]: messageOf(err) }))
    } finally {
      setStarting(({ [projectId]: _done, ...rest }) => rest)
    }
  }, [])

  const send = useCallback(
    async (projectId: string, text: string) => {
      const chat = chats[projectId]
      if (!chat) return
      update(projectId, (current) => ({
        ...current,
        items: [...current.items, { kind: 'user', id: nextId(), text }]
      }))
      try {
        await window.api.agents.send(chat.session.id, text)
      } catch (err) {
        addError(projectId, err)
      }
    },
    [chats, update, addError]
  )

  const respond = useCallback(
    async (projectId: string, requestId: string, allow: boolean) => {
      const chat = chats[projectId]
      if (!chat) return
      try {
        await window.api.agents.respond(chat.session.id, requestId, allow)
        update(projectId, (current) => setPermission(current, requestId, allow ? 'allowed' : 'denied'))
      } catch (err) {
        addError(projectId, err)
      }
    },
    [chats, update, addError]
  )

  const close = useCallback(
    async (projectId: string) => {
      const chat = chats[projectId]
      if (!chat) return
      setChats(({ [projectId]: _closed, ...rest }) => rest)
      // Encerrar é "melhor esforço": a conversa já saiu da tela de qualquer forma.
      await window.api.agents.stop(chat.session.id).catch(() => undefined)
    },
    [chats]
  )

  return {
    chatOf: (projectId) => chats[projectId] ?? null,
    startErrorOf: (projectId) => startErrors[projectId] ?? null,
    isStarting: (projectId) => projectId in starting,
    start,
    send,
    respond,
    close
  }
}
