// Chats rápidos: conversas fora de qualquer projeto, para tirar uma dúvida ou fazer
// uma tarefa rápida. A lista fica no menu lateral; a conversa abre na área de
// trabalho. Por baixo, são conversas do "projeto" interno QUICK_PROJECT_ID, então
// têm o mesmo chat das conversas de projeto (modelo, bypass, skills globais, anexos).
import { useEffect, useRef, useState } from 'react'
import { AGENTS, agentName } from '../../../shared/agents'
import { QUICK_PROJECT_ID, type AgentId, type Conversation } from '../../../shared/types'
import type { ConversationsState } from '../hooks/useConversations'
import { ChatView } from './ChatView'
import { Button, IconButton } from './ui/Button'
import { Icon } from './ui/Icon'

/** Nome automático ("Claude 2"): é trocado pela primeira mensagem. */
const DEFAULT_NAME = /^(Claude|ChatGPT|Gemini)( \d+)?$/

interface ListProps {
  state: ConversationsState
  /** A área de trabalho está mostrando um chat rápido. */
  active: boolean
  collapsed: boolean
  onOpen(): void
}

/** Seção "Chats rápidos" do menu lateral. */
export function QuickChatList({ state, active, collapsed, onOpen }: ListProps) {
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  useEffect(() => state.loadList(QUICK_PROJECT_ID), [state.loadList])

  const list = state.listOf(QUICK_PROJECT_ID) ?? []
  const selected = state.selectedOf(QUICK_PROJECT_ID)

  const create = async (agent: AgentId): Promise<void> => {
    setMenu(false)
    await state.create(QUICK_PROJECT_ID, agent)
    onOpen()
  }

  return (
    <div className="quick">
      <hr className="nav__divider" />
      <div className="quick__header">
        <span className="quick__label">Chats rápidos</span>
        <div className="popover-anchor">
          <IconButton
            icon="add"
            label="Novo chat rápido"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((open) => !open)}
          />
          {menu && (
            <AgentMenu onPick={(agent) => void create(agent)} onClose={() => setMenu(false)} />
          )}
        </div>
      </div>
      <ul className="quick__list">
        {list.map((conversation) => (
          <QuickItem
            key={conversation.id}
            conversation={conversation}
            selected={active && conversation.id === selected}
            collapsed={collapsed}
            renaming={renaming === conversation.id}
            confirming={confirming === conversation.id}
            onOpen={() => {
              state.select(QUICK_PROJECT_ID, conversation.id)
              onOpen()
            }}
            onRename={() => setRenaming(conversation.id)}
            onRenamed={(name) => {
              setRenaming(null)
              if (name && name !== conversation.name) {
                void state.rename(QUICK_PROJECT_ID, conversation.id, name)
              }
            }}
            onAskRemove={() => setConfirming(conversation.id)}
            onRemove={(remove) => {
              setConfirming(null)
              if (remove) void state.remove(QUICK_PROJECT_ID, conversation.id)
            }}
          />
        ))}
      </ul>
    </div>
  )
}

function QuickItem(props: {
  conversation: Conversation
  selected: boolean
  collapsed: boolean
  renaming: boolean
  confirming: boolean
  onOpen(): void
  onRename(): void
  onRenamed(name: string): void
  onAskRemove(): void
  onRemove(remove: boolean): void
}) {
  const { conversation, selected, collapsed, renaming, confirming } = props

  if (confirming) {
    return (
      <li className="quick-item quick-item--confirm">
        <span className="text-caption truncate">Excluir "{conversation.name}"?</span>
        <Button variant="accent" onClick={() => props.onRemove(true)}>
          Excluir
        </Button>
        <Button onClick={() => props.onRemove(false)}>Não</Button>
      </li>
    )
  }

  return (
    <li className={`quick-item ${selected ? 'quick-item--active' : ''}`}>
      {renaming ? (
        <input
          className="field quick-item__input"
          defaultValue={conversation.name}
          maxLength={80}
          autoFocus
          aria-label="Nome do chat"
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => props.onRenamed(e.currentTarget.value.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') props.onRenamed('')
          }}
        />
      ) : (
        <>
          <button
            type="button"
            className="nav-link quick-item__open"
            aria-current={selected ? 'page' : undefined}
            title={
              collapsed
                ? conversation.name
                : `${conversation.name} · ${agentName(conversation.agent)}`
            }
            onClick={props.onOpen}
            onDoubleClick={props.onRename}
          >
            <span className={`dot dot--${conversation.agent}`} />
            <span className="nav-link__label truncate">{conversation.name}</span>
          </button>
          {!collapsed && (
            <span className="quick-item__tools">
              <IconButton icon="rename" label="Renomear" onClick={props.onRename} />
              <IconButton icon="delete" label="Excluir chat" danger onClick={props.onAskRemove} />
            </span>
          )}
        </>
      )}
    </li>
  )
}

function AgentMenu({ onPick, onClose }: { onPick(agent: AgentId): void; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onPointer = (event: PointerEvent): void => {
      if (!ref.current?.parentElement?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector('button')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="popover quick__menu" role="menu" ref={ref}>
      <p className="popover__title">Novo chat rápido com</p>
      {AGENTS.map((agent) => (
        <button
          key={agent.id}
          type="button"
          role="menuitem"
          className="popover__item"
          onClick={() => onPick(agent.id)}
        >
          <span className={`dot dot--${agent.id}`} />
          <span className="card__body">
            <span className="popover__item-name">{agent.name}</span>
            <span className="text-caption">{agent.tool}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

/** Área de trabalho de um chat rápido. */
export function QuickChatScreen({ state }: { state: ConversationsState }) {
  const list = state.listOf(QUICK_PROJECT_ID)
  const selected = state.selectedOf(QUICK_PROJECT_ID)
  const conversation = list?.find((c) => c.id === selected) ?? null

  useEffect(() => {
    if (conversation) state.loadChat(QUICK_PROJECT_ID, conversation.id)
  }, [conversation?.id, state.loadChat])

  if (!conversation) {
    return (
      <div className="empty-state">
        <Icon name="chat" className="empty-state__icon" />
        <p className="empty-state__title">Nenhum chat rápido aberto</p>
        <p>Converse fora dos projetos, para tirar uma dúvida ou fazer uma tarefa rápida.</p>
        <div className="screen__actions empty-state__action">
          {AGENTS.map((agent) => (
            <Button
              key={agent.id}
              icon="add"
              onClick={() => void state.create(QUICK_PROJECT_ID, agent.id)}
            >
              {agent.name}
            </Button>
          ))}
        </div>
      </div>
    )
  }

  const chat = state.chatOf(conversation.id) ?? {
    sessionId: null,
    status: 'idle' as const,
    items: [],
    loaded: false
  }

  return (
    <ChatView
      key={conversation.id}
      projectId={QUICK_PROJECT_ID}
      chat={chat}
      title={conversation.name}
      visible
      agent={conversation.agent}
      agentName={agentName(conversation.agent)}
      starting={state.isStarting(conversation.id)}
      startError={state.errorOf(conversation.id)}
      settings={conversation.settings}
      onSettingsChange={(change) =>
        void state.setSettings(QUICK_PROJECT_ID, conversation.id, change)
      }
      bypass={conversation.bypass}
      onBypassChange={(on) => void state.setBypass(QUICK_PROJECT_ID, conversation.id, on)}
      loadSkills={() => window.api.skills.available(QUICK_PROJECT_ID)}
      onSend={(text, skills, attachments) => {
        // Primeira mensagem dá nome ao chat (a lista fica legível).
        if (chat.items.length === 0 && DEFAULT_NAME.test(conversation.name) && text.trim()) {
          const name = text.trim().replace(/\s+/g, ' ')
          void state.rename(
            QUICK_PROJECT_ID,
            conversation.id,
            name.length > 40 ? `${name.slice(0, 40)}…` : name
          )
        }
        void state.send(QUICK_PROJECT_ID, conversation.id, text, skills, attachments)
      }}
      onRespond={(requestId, allow) => void state.respond(conversation.id, requestId, allow)}
      onInterrupt={() => void state.interrupt(conversation.id)}
    />
  )
}
