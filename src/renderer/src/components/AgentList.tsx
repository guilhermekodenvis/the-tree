// Lista de agentes (conversas) do projeto, na lateral da aba "Agentes".
// Cada item pode ser renomeado, excluído e arrastado para outra posição.
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { AGENTS } from '../../../shared/agents'
import type { AgentId, Conversation } from '../../../shared/types'
import { Button, IconButton } from './ui/Button'
import { Icon } from './ui/Icon'

interface Props {
  conversations: Conversation[]
  selected: string | null
  busy: (conversationId: string) => boolean
  error: string | null
  onSelect(id: string): void
  onCreate(agent: AgentId): void
  onRename(id: string, name: string): void
  onRemove(id: string): void
  onMove(id: string, toIndex: number): void
  onManageGeminiKey(): void
}

export function AgentList(props: Props) {
  const { conversations, selected, error, onCreate, onMove, onManageGeminiKey } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const onDrop = (event: DragEvent): void => {
    event.preventDefault()
    if (dragging !== null && dropIndex !== null) {
      const from = conversations.findIndex((c) => c.id === dragging)
      // Ao descer um item, a posição final é uma a menos (ele sai de cima).
      onMove(dragging, dropIndex > from ? dropIndex - 1 : dropIndex)
    }
    setDragging(null)
    setDropIndex(null)
  }

  return (
    <nav className="split__side" aria-label="Agentes do projeto">
      <div className="split__side-header">
        <span>Agentes</span>
        <div className="popover-anchor">
          <IconButton
            icon="add"
            label="Novo agente"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          />
          {menuOpen && (
            <NewAgentMenu
              onPick={(agent) => {
                setMenuOpen(false)
                onCreate(agent)
              }}
              onManageGeminiKey={() => {
                setMenuOpen(false)
                onManageGeminiKey()
              }}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {conversations.length === 0 ? (
        <p className="tree-note">Nenhum agente ainda. Use o + para criar.</p>
      ) : (
        <ul
          className="agent-list"
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropIndex(null)
          }}
        >
          {conversations.map((conversation, index) => (
            <AgentItem
              key={conversation.id}
              conversation={conversation}
              selected={conversation.id === selected}
              busy={props.busy(conversation.id)}
              dragging={dragging === conversation.id}
              dropBefore={dropIndex === index}
              dropAfter={dropIndex === conversations.length && index === conversations.length - 1}
              onSelect={() => props.onSelect(conversation.id)}
              onRename={(name) => props.onRename(conversation.id, name)}
              onRemove={() => props.onRemove(conversation.id)}
              onDragStart={() => setDragging(conversation.id)}
              onDragEnd={() => {
                setDragging(null)
                setDropIndex(null)
              }}
              onDragOverHalf={(after) => setDropIndex(after ? index + 1 : index)}
              onMoveBy={(step) => {
                const target = index + step
                if (target >= 0 && target < conversations.length) onMove(conversation.id, target)
              }}
            />
          ))}
        </ul>
      )}
    </nav>
  )
}

interface ItemProps {
  conversation: Conversation
  selected: boolean
  busy: boolean
  dragging: boolean
  dropBefore: boolean
  dropAfter: boolean
  onSelect(): void
  onRename(name: string): void
  onRemove(): void
  onDragStart(): void
  onDragEnd(): void
  /** O cursor está sobre a metade de cima (false) ou de baixo (true) do item. */
  onDragOverHalf(after: boolean): void
  /** Move uma posição para cima (-1) ou para baixo (+1), pelo teclado. */
  onMoveBy(step: number): void
}

function AgentItem(props: ItemProps) {
  const { conversation, selected, busy } = props
  const [mode, setMode] = useState<'view' | 'rename' | 'confirm'>('view')
  const [name, setName] = useState(conversation.name)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode === 'rename') input.current?.select()
  }, [mode])

  const finishRename = (): void => {
    const clean = name.trim()
    if (clean && clean !== conversation.name) props.onRename(clean)
    else setName(conversation.name)
    setMode('view')
  }

  const classes = [
    'agent-item',
    selected ? 'agent-item--selected' : '',
    props.dragging ? 'agent-item--dragging' : '',
    props.dropBefore ? 'agent-item--drop-before' : '',
    props.dropAfter ? 'agent-item--drop-after' : ''
  ]
    .filter(Boolean)
    .join(' ')

  if (mode === 'confirm') {
    return (
      <li className={`${classes} agent-item--confirm`}>
        <span className="truncate">Excluir {conversation.name}?</span>
        <span className="text-caption">O histórico desta conversa será apagado.</span>
        <div className="agent-item__confirm-actions">
          <Button variant="accent" onClick={props.onRemove}>
            Excluir
          </Button>
          <Button onClick={() => setMode('view')}>Cancelar</Button>
        </div>
      </li>
    )
  }

  if (mode === 'rename') {
    return (
      <li className={classes}>
        <span className={`dot dot--${conversation.agent}`} />
        <input
          ref={input}
          className="field agent-item__input"
          value={name}
          maxLength={80}
          aria-label="Nome do agente"
          onChange={(event) => setName(event.target.value)}
          onBlur={finishRename}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') finishRename()
            if (event.key === 'Escape') {
              setName(conversation.name)
              setMode('view')
            }
          }}
        />
      </li>
    )
  }

  return (
    <li
      className={classes}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        props.onDragStart()
      }}
      onDragEnd={props.onDragEnd}
      onDragOver={(event) => {
        event.preventDefault()
        const box = event.currentTarget.getBoundingClientRect()
        props.onDragOverHalf(event.clientY > box.top + box.height / 2)
      }}
    >
      <span className="agent-item__grip" aria-hidden="true">
        <Icon name="grip" />
      </span>
      <button
        type="button"
        className="agent-item__open"
        aria-current={selected ? 'true' : undefined}
        title="Arraste para reordenar. Alt+↑/↓ também move."
        onClick={props.onSelect}
        onDoubleClick={() => setMode('rename')}
        onKeyDown={(event) => {
          if (event.altKey && event.key === 'ArrowUp') {
            event.preventDefault()
            props.onMoveBy(-1)
          }
          if (event.altKey && event.key === 'ArrowDown') {
            event.preventDefault()
            props.onMoveBy(1)
          }
          if (event.key === 'F2') setMode('rename')
        }}
      >
        <span className={`dot dot--${conversation.agent} ${busy ? 'dot--busy' : ''}`} />
        <span className="truncate">{conversation.name}</span>
      </button>
      <span className="agent-item__actions">
        <IconButton icon="rename" label={`Renomear ${conversation.name}`} onClick={() => setMode('rename')} />
        <IconButton icon="delete" label={`Excluir ${conversation.name}`} danger onClick={() => setMode('confirm')} />
      </span>
    </li>
  )
}

function NewAgentMenu({
  onPick,
  onManageGeminiKey,
  onClose
}: {
  onPick(agent: AgentId): void
  onManageGeminiKey(): void
  onClose(): void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora ou apertar Esc.
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
    <div className="popover" role="menu" ref={ref}>
      <p className="popover__title">Novo agente</p>
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
      <hr className="popover__divider" />
      <button type="button" role="menuitem" className="popover__item" onClick={onManageGeminiKey}>
        <span className="text-caption">Chave do Gemini…</span>
      </button>
    </div>
  )
}
