// Estado das conversas com agentes. Fica no topo do app para que cada conversa
// continue viva (e recebendo eventos) enquanto você navega por outros projetos.
//
// Uma conversa pode estar "adormecida": carregada do histórico, sem processo rodando.
// Ao enviar uma mensagem nela, o agente é iniciado de novo e retoma de onde parou.
import { useCallback, useEffect, useRef, useState } from 'react'
import { addUserMessage, applyEvent, setPermission } from '../../../shared/chat'
import type { AgentId, ChatItem, SessionStatus } from '../../../shared/types'
import { messageOf } from '../lib/errors'

export interface Chat {
  agent: AgentId
  /** Sessão ativa no processo principal; null enquanto a conversa está adormecida. */
  sessionId: string | null
  status: SessionStatus
  items: ChatItem[]
}

export interface AgentsState {
  chatOf(projectId: string): Chat | null
  /** Carrega a conversa salva do projeto, se ainda não foi carregada. */
  load(projectId: string): void
  /** Verdadeiro enquanto a conversa salva deste projeto ainda está sendo lida. */
  isLoading(projectId: string): boolean
  /** Erro ao tentar iniciar uma conversa neste projeto, se houve. */
  startErrorOf(projectId: string): string | null
  /** Verdadeiro enquanto o agente está sendo iniciado (leva alguns segundos). */
  isStarting(projectId: string): boolean
  start(projectId: string, agent: AgentId): Promise<void>
  send(projectId: string, text: string): Promise<void>
  respond(projectId: string, requestId: string, allow: boolean): Promise<void>
  interrupt(projectId: string): Promise<void>
  /** Apaga a conversa do projeto (e o histórico) e volta à escolha do agente. */
  forget(projectId: string): Promise<void>
}

type ByProject<T> = Record<string, T>

const without = <T>(map: ByProject<T>, key: string): ByProject<T> => {
  const { [key]: _removed, ...rest } = map
  return rest
}

export function useAgents(): AgentsState {
  const [chats, setChats] = useState<ByProject<Chat>>({})
  const [loaded, setLoaded] = useState<ByProject<'loading' | 'done'>>({})
  const [starting, setStarting] = useState<ByProject<true>>({})
  const [startErrors, setStartErrors] = useState<ByProject<string>>({})

  // Cópia sempre atual das conversas, para as ações não dependerem de um estado antigo.
  const chatsRef = useRef(chats)
  chatsRef.current = chats

  const update = useCallback((projectId: string, change: (chat: Chat) => Chat) => {
    setChats((prev) => (prev[projectId] ? { ...prev, [projectId]: change(prev[projectId]) } : prev))
  }, [])

  const addError = useCallback(
    (projectId: string, err: unknown) => {
      update(projectId, (chat) => ({
        ...chat,
        items: applyEvent(chat.items, { type: 'error', sessionId: '', message: messageOf(err) })
      }))
    },
    [update]
  )

  useEffect(() => {
    return window.api.agents.onEvent((event) => {
      setChats((prev) => {
        const projectId = Object.keys(prev).find((id) => prev[id].sessionId === event.sessionId)
        if (!projectId) return prev
        const chat = prev[projectId]
        const status = event.type === 'status' ? event.status : chat.status
        return { ...prev, [projectId]: { ...chat, status, items: applyEvent(chat.items, event) } }
      })
    })
  }, [])

  const requested = useRef(new Set<string>())

  const load = useCallback((projectId: string) => {
    if (requested.current.has(projectId)) return
    requested.current.add(projectId)
    setLoaded((prev) => ({ ...prev, [projectId]: 'loading' }))
    window.api.agents
        .history(projectId)
        .then((record) => {
          if (record) {
            setChats((current) =>
              current[projectId]
                ? current
                : {
                    ...current,
                    [projectId]: {
                      agent: record.agent,
                      sessionId: null,
                      status: 'idle',
                      items: record.items
                    }
                  }
            )
          }
        })
        .catch(() => undefined) // sem histórico legível, começa do zero
        .finally(() => setLoaded((current) => ({ ...current, [projectId]: 'done' })))
  }, [])

  /** Inicia o processo do agente. Devolve o id da sessão, ou null se falhou. */
  const launch = useCallback(
    async (projectId: string, agent: AgentId, resume: boolean): Promise<string | null> => {
      setStartErrors((prev) => without(prev, projectId))
      setStarting((prev) => ({ ...prev, [projectId]: true }))
      try {
        const session = await window.api.agents.start(projectId, agent, resume)
        return session.id
      } catch (err) {
        setStartErrors((prev) => ({ ...prev, [projectId]: messageOf(err) }))
        return null
      } finally {
        setStarting((prev) => without(prev, projectId))
      }
    },
    []
  )

  const start = useCallback(
    async (projectId: string, agent: AgentId) => {
      const sessionId = await launch(projectId, agent, false)
      if (!sessionId) return
      setChats((prev) => ({ ...prev, [projectId]: { agent, sessionId, status: 'idle', items: [] } }))
    },
    [launch]
  )

  const send = useCallback(
    async (projectId: string, text: string) => {
      const chat = chatsRef.current[projectId]
      if (!chat) return
      update(projectId, (current) => ({ ...current, items: addUserMessage(current.items, text) }))

      let sessionId = chat.sessionId
      // Conversa adormecida (ou cujo processo caiu): inicia de novo, retomando o histórico.
      if (!sessionId || chat.status === 'error') {
        update(projectId, (current) => ({ ...current, status: 'running' }))
        sessionId = await launch(projectId, chat.agent, true)
        if (!sessionId) {
          // O motivo aparece no fim da conversa (startError).
          update(projectId, (current) => ({ ...current, status: 'idle' }))
          return
        }
        const id = sessionId
        update(projectId, (current) => ({ ...current, sessionId: id }))
      }

      try {
        await window.api.agents.send(sessionId, text)
      } catch (err) {
        addError(projectId, err)
      }
    },
    [update, launch, addError]
  )

  const respond = useCallback(
    async (projectId: string, requestId: string, allow: boolean) => {
      const sessionId = chatsRef.current[projectId]?.sessionId
      if (!sessionId) return
      try {
        await window.api.agents.respond(sessionId, requestId, allow)
        update(projectId, (chat) => ({
          ...chat,
          items: setPermission(chat.items, requestId, allow ? 'allowed' : 'denied')
        }))
      } catch (err) {
        addError(projectId, err)
      }
    },
    [update, addError]
  )

  const interrupt = useCallback(
    async (projectId: string) => {
      const sessionId = chatsRef.current[projectId]?.sessionId
      if (!sessionId) return
      try {
        await window.api.agents.interrupt(sessionId)
      } catch (err) {
        addError(projectId, err)
      }
    },
    [addError]
  )

  const forget = useCallback(async (projectId: string) => {
    setChats((prev) => without(prev, projectId))
    setStartErrors((prev) => without(prev, projectId))
    await window.api.agents.forget(projectId).catch(() => undefined)
  }, [])

  return {
    chatOf: (projectId) => chats[projectId] ?? null,
    load,
    isLoading: (projectId) => loaded[projectId] !== 'done',
    startErrorOf: (projectId) => startErrors[projectId] ?? null,
    isStarting: (projectId) => projectId in starting,
    start,
    send,
    respond,
    interrupt,
    forget
  }
}
