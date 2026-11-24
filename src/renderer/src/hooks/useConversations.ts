// Estado das conversas com agentes, de todos os projetos. Fica no topo do app
// para que cada conversa continue viva (e recebendo eventos) enquanto você
// navega entre telas e abas.
//
// Uma conversa só inicia o processo do agente na primeira mensagem. Depois de
// fechar o app, ela fica "adormecida": ao enviar uma mensagem, o agente é iniciado
// de novo e retoma de onde parou.
import { useCallback, useEffect, useRef, useState } from 'react'
import { addUserMessage, applyEvent, setPermission } from '../../../shared/chat'
import type {
  AgentId,
  AgentSettings,
  ChatItem,
  Conversation,
  SessionStatus,
  Skill
} from '../../../shared/types'
import { messageOf } from '../lib/errors'

export interface Chat {
  /** Sessão ativa no processo principal; null enquanto o agente não está rodando. */
  sessionId: string | null
  status: SessionStatus
  items: ChatItem[]
  /** O histórico salvo já foi carregado. */
  loaded: boolean
}

export interface ConversationsState {
  /** Conversas do projeto na ordem escolhida; null enquanto carrega. */
  listOf(projectId: string): Conversation[] | null
  loadList(projectId: string): void
  selectedOf(projectId: string): string | null
  select(projectId: string, conversationId: string): void
  create(projectId: string, agent: AgentId): Promise<void>
  rename(projectId: string, conversationId: string, name: string): Promise<void>
  remove(projectId: string, conversationId: string): Promise<void>
  /** Move a conversa para a posição `toIndex` da lista. */
  move(projectId: string, conversationId: string, toIndex: number): Promise<void>
  /** Liga ou desliga a aprovação automática dos pedidos de autorização. */
  setBypass(projectId: string, conversationId: string, on: boolean): Promise<void>
  /** Troca o modelo e/ou o esforço da conversa. */
  setSettings(projectId: string, conversationId: string, settings: Partial<AgentSettings>): Promise<void>
  /** Apaga todas as conversas do projeto (ao remover o projeto). */
  removeAll(projectId: string): Promise<void>

  chatOf(conversationId: string): Chat | null
  loadChat(projectId: string, conversationId: string): void
  isStarting(conversationId: string): boolean
  errorOf(conversationId: string): string | null
  /** Erro em ações da lista (criar, renomear, excluir...). */
  listError: string | null
  /** `skills`: skills escolhidas com "/" para esta mensagem. */
  send(projectId: string, conversationId: string, text: string, skills?: Skill[]): Promise<void>
  respond(conversationId: string, requestId: string, allow: boolean): Promise<void>
  interrupt(conversationId: string): Promise<void>
}

type ById<T> = Record<string, T>

const without = <T>(map: ById<T>, key: string): ById<T> => {
  const { [key]: _removed, ...rest } = map
  return rest
}

const emptyChat = (): Chat => ({ sessionId: null, status: 'idle', items: [], loaded: false })

export function useConversations(): ConversationsState {
  const [lists, setLists] = useState<ById<Conversation[]>>({})
  const [selected, setSelected] = useState<ById<string>>({})
  const [chats, setChats] = useState<ById<Chat>>({})
  const [starting, setStarting] = useState<ById<true>>({})
  const [errors, setErrors] = useState<ById<string>>({})
  const [listError, setListError] = useState<string | null>(null)

  // Cópias sempre atuais, para as ações não dependerem de um estado antigo.
  const chatsRef = useRef(chats)
  chatsRef.current = chats
  const listsRef = useRef(lists)
  listsRef.current = lists
  const requestedLists = useRef(new Set<string>())
  const requestedChats = useRef(new Set<string>())

  const updateChat = useCallback((conversationId: string, change: (chat: Chat) => Chat) => {
    setChats((prev) => ({ ...prev, [conversationId]: change(prev[conversationId] ?? emptyChat()) }))
  }, [])

  const addError = useCallback(
    (conversationId: string, err: unknown) => {
      updateChat(conversationId, (chat) => ({
        ...chat,
        items: applyEvent(chat.items, { type: 'error', sessionId: '', message: messageOf(err) })
      }))
    },
    [updateChat]
  )

  // Eventos dos agentes chegam pelo id da sessão; acha a conversa dona dela.
  useEffect(() => {
    return window.api.agents.onEvent((event) => {
      setChats((prev) => {
        const id = Object.keys(prev).find((key) => prev[key].sessionId === event.sessionId)
        if (!id) return prev
        const chat = prev[id]
        const status = event.type === 'status' ? event.status : chat.status
        return { ...prev, [id]: { ...chat, status, items: applyEvent(chat.items, event) } }
      })
    })
  }, [])

  const refreshList = useCallback(async (projectId: string) => {
    const list = await window.api.conversations.list(projectId)
    setLists((prev) => ({ ...prev, [projectId]: list }))
    return list
  }, [])

  const loadList = useCallback(
    (projectId: string) => {
      if (requestedLists.current.has(projectId)) return
      requestedLists.current.add(projectId)
      refreshList(projectId)
        .then((list) => {
          // Sem conversa escolhida, abre a primeira.
          setSelected((prev) => (prev[projectId] || !list[0] ? prev : { ...prev, [projectId]: list[0].id }))
        })
        .catch((err) => setListError(messageOf(err)))
    },
    [refreshList]
  )

  const loadChat = useCallback((projectId: string, conversationId: string) => {
    if (requestedChats.current.has(conversationId)) return
    requestedChats.current.add(conversationId)
    window.api.conversations
      .items(projectId, conversationId)
      .then((items) => {
        setChats((prev) => {
          const current = prev[conversationId]
          // Se a conversa já começou nesta sessão do app, o que está na tela vale mais.
          if (current?.loaded) return prev
          return { ...prev, [conversationId]: { ...(current ?? emptyChat()), items, loaded: true } }
        })
      })
      .catch(() => updateChat(conversationId, (chat) => ({ ...chat, loaded: true })))
  }, [updateChat])

  /** Ações da lista: mostram o erro no topo da lista se falharem. */
  const guarded = useCallback(async (action: () => Promise<void>) => {
    setListError(null)
    try {
      await action()
    } catch (err) {
      setListError(messageOf(err))
    }
  }, [])

  const create = useCallback(
    (projectId: string, agent: AgentId) =>
      guarded(async () => {
        const conversation = await window.api.conversations.create(projectId, agent)
        requestedChats.current.add(conversation.id)
        setChats((prev) => ({ ...prev, [conversation.id]: { ...emptyChat(), loaded: true } }))
        setLists((prev) => ({ ...prev, [projectId]: [...(prev[projectId] ?? []), conversation] }))
        setSelected((prev) => ({ ...prev, [projectId]: conversation.id }))
      }),
    [guarded]
  )

  const rename = useCallback(
    (projectId: string, conversationId: string, name: string) =>
      guarded(async () => {
        await window.api.conversations.rename(projectId, conversationId, name)
        await refreshList(projectId)
      }),
    [guarded, refreshList]
  )

  const remove = useCallback(
    (projectId: string, conversationId: string) =>
      guarded(async () => {
        await window.api.conversations.remove(projectId, conversationId)
        const list = await refreshList(projectId)
        setChats((prev) => without(prev, conversationId))
        setSelected((prev) =>
          prev[projectId] === conversationId
            ? list[0]
              ? { ...prev, [projectId]: list[0].id }
              : without(prev, projectId)
            : prev
        )
      }),
    [guarded, refreshList]
  )

  const move = useCallback(
    (projectId: string, conversationId: string, toIndex: number) =>
      guarded(async () => {
        const list = listsRef.current[projectId] ?? []
        const from = list.findIndex((c) => c.id === conversationId)
        if (from === -1 || from === toIndex) return
        const next = [...list]
        const [moved] = next.splice(from, 1)
        next.splice(toIndex, 0, moved)
        // Mostra a nova ordem na hora; o disco é gravado em seguida.
        setLists((prev) => ({ ...prev, [projectId]: next }))
        await window.api.conversations.reorder(projectId, next.map((c) => c.id))
      }),
    [guarded]
  )

  const setBypass = useCallback(
    (projectId: string, conversationId: string, on: boolean) =>
      guarded(async () => {
        const mark = (value: boolean) =>
          setLists((prev) => ({
            ...prev,
            [projectId]: (prev[projectId] ?? []).map((c) =>
              c.id === conversationId ? { ...c, bypass: value } : c
            )
          }))
        // O interruptor muda na hora; volta se a gravação falhar.
        mark(on)
        try {
          await window.api.conversations.setBypass(projectId, conversationId, on)
        } catch (err) {
          mark(!on)
          throw err
        }
      }),
    [guarded]
  )

  const setSettings = useCallback(
    (projectId: string, conversationId: string, change: Partial<AgentSettings>) =>
      guarded(async () => {
        const mark = (settings: (current: AgentSettings) => AgentSettings) =>
          setLists((prev) => ({
            ...prev,
            [projectId]: (prev[projectId] ?? []).map((c) =>
              c.id === conversationId ? { ...c, settings: settings(c.settings) } : c
            )
          }))
        const before = listsRef.current[projectId]?.find((c) => c.id === conversationId)?.settings
        // O seletor muda na hora; depois vale o que o processo principal confirmou.
        mark((current) => ({ ...current, ...change }))
        try {
          const saved = await window.api.conversations.setSettings(projectId, conversationId, change)
          mark(() => saved)
        } catch (err) {
          if (before) mark(() => before)
          throw err
        }
      }),
    [guarded]
  )

  const removeAll = useCallback(async (projectId: string) => {
    const ids = (listsRef.current[projectId] ?? []).map((c) => c.id)
    await window.api.conversations.removeAll(projectId).catch(() => undefined)
    setLists((prev) => without(prev, projectId))
    setSelected((prev) => without(prev, projectId))
    setChats((prev) => ids.reduce((acc, id) => without(acc, id), prev))
    requestedLists.current.delete(projectId)
  }, [])

  /** Inicia o agente da conversa. Devolve o id da sessão, ou null se falhou. */
  const launch = useCallback(
    async (projectId: string, conversationId: string): Promise<string | null> => {
      setErrors((prev) => without(prev, conversationId))
      setStarting((prev) => ({ ...prev, [conversationId]: true }))
      try {
        const session = await window.api.agents.start(projectId, conversationId)
        return session.id
      } catch (err) {
        setErrors((prev) => ({ ...prev, [conversationId]: messageOf(err) }))
        return null
      } finally {
        setStarting((prev) => without(prev, conversationId))
      }
    },
    []
  )

  const send = useCallback(
    async (projectId: string, conversationId: string, text: string, skills: Skill[] = []) => {
      const chat = chatsRef.current[conversationId] ?? emptyChat()
      updateChat(conversationId, (current) => ({
        ...current,
        loaded: true,
        items: addUserMessage(
          current.items,
          text,
          skills.map((s) => s.name)
        )
      }))

      let sessionId = chat.sessionId
      // Agente parado (conversa nova, adormecida ou que caiu): inicia e retoma o histórico.
      if (!sessionId || chat.status === 'error') {
        updateChat(conversationId, (current) => ({ ...current, status: 'running' }))
        sessionId = await launch(projectId, conversationId)
        if (!sessionId) {
          updateChat(conversationId, (current) => ({ ...current, status: 'idle' }))
          return
        }
        const id = sessionId
        updateChat(conversationId, (current) => ({ ...current, sessionId: id }))
      }

      try {
        await window.api.agents.send(
          sessionId,
          text,
          skills.map((s) => s.id)
        )
      } catch (err) {
        addError(conversationId, err)
      }
    },
    [updateChat, launch, addError]
  )

  const respond = useCallback(
    async (conversationId: string, requestId: string, allow: boolean) => {
      const sessionId = chatsRef.current[conversationId]?.sessionId
      if (!sessionId) return
      try {
        await window.api.agents.respond(sessionId, requestId, allow)
        updateChat(conversationId, (chat) => ({
          ...chat,
          items: setPermission(chat.items, requestId, allow ? 'allowed' : 'denied')
        }))
      } catch (err) {
        addError(conversationId, err)
      }
    },
    [updateChat, addError]
  )

  const interrupt = useCallback(
    async (conversationId: string) => {
      const sessionId = chatsRef.current[conversationId]?.sessionId
      if (!sessionId) return
      try {
        await window.api.agents.interrupt(sessionId)
      } catch (err) {
        addError(conversationId, err)
      }
    },
    [addError]
  )

  return {
    listOf: (projectId) => lists[projectId] ?? null,
    loadList,
    selectedOf: (projectId) => selected[projectId] ?? null,
    select: (projectId, conversationId) =>
      setSelected((prev) => ({ ...prev, [projectId]: conversationId })),
    create,
    rename,
    remove,
    move,
    setBypass,
    setSettings,
    removeAll,
    chatOf: (conversationId) => chats[conversationId] ?? null,
    loadChat,
    isStarting: (conversationId) => conversationId in starting,
    errorOf: (conversationId) => errors[conversationId] ?? null,
    listError,
    send,
    respond,
    interrupt
  }
}
