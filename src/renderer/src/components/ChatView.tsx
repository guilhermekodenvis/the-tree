// Conversa com um agente: histórico, pedidos de autorização e caixa de mensagem.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { agentInfo, type Choice } from '../../../shared/agents'
import type { AgentId, AgentSettings, ChatItem, SessionStatus } from '../../../shared/types'
import type { Chat } from '../hooks/useConversations'
import { Markdown } from './Markdown'
import { Button } from './ui/Button'

interface Props {
  chat: Chat
  title: string
  agent: AgentId
  agentName: string
  starting: boolean
  startError: string | null
  /** Aviso opcional no topo da conversa (ex.: falta a chave do Gemini). */
  banner?: ReactNode
  /** Modelo e esforço da conversa. */
  settings: AgentSettings
  onSettingsChange(change: Partial<AgentSettings>): void
  /** Bypass ligado: os pedidos de autorização são aprovados sozinhos. */
  bypass: boolean
  onBypassChange(on: boolean): void
  onSend(text: string): void
  onRespond(requestId: string, allow: boolean): void
  onInterrupt(): void
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: 'Pronto',
  running: 'Trabalhando…',
  waiting: 'Aguardando você',
  error: 'O agente parou. Envie uma mensagem para reiniciar.'
}

/** Distância do fim (em px) abaixo da qual a conversa segue rolando sozinha. */
const STICKY_SCROLL = 80

function statusText(chat: Chat, starting: boolean): string {
  if (starting) return 'Iniciando…'
  if (chat.sessionId === null && chat.status === 'idle') {
    return chat.items.length === 0
      ? 'Envie uma mensagem para começar.'
      : 'Conversa salva. Envie uma mensagem para continuar.'
  }
  return STATUS_LABEL[chat.status]
}

export function ChatView(props: Props) {
  const {
    chat,
    title,
    agent,
    agentName,
    starting,
    startError,
    banner,
    settings,
    onSettingsChange,
    bypass,
    onBypassChange,
    onSend,
    onRespond,
    onInterrupt
  } = props
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  // Segue o fim da conversa conforme chegam mensagens, a não ser que você
  // tenha rolado para cima para reler algo.
  useEffect(() => {
    const list = listRef.current
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight
  }, [chat.items])

  const info = agentInfo(agent)
  const busy = starting || chat.status === 'running' || chat.status === 'waiting'
  const canSend = draft.trim() !== '' && !busy
  const status = statusText(chat, starting)

  const submit = (): void => {
    if (!canSend) return
    stickToBottom.current = true
    onSend(draft.trim())
    setDraft('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter envia; Shift+Enter quebra a linha.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="chat">
      <header className="chat__header">
        <span className={`dot dot--${agent}`} />
        <div className="card__body">
          <div className="chat__title truncate">{title}</div>
          <div className="text-caption truncate" role="status" title={status}>
            {agentName} · {status}
          </div>
        </div>
        <ChoiceSelect
          label="Modelo"
          choices={info?.models ?? []}
          value={settings.model}
          onChange={(model) => onSettingsChange({ model })}
        />
        <ChoiceSelect
          label="Esforço"
          choices={info?.efforts ?? []}
          value={settings.effort}
          onChange={(effort) => onSettingsChange({ effort })}
        />
        <button
          type="button"
          role="switch"
          aria-checked={bypass}
          className="switch"
          title={
            bypass
              ? `Bypass ligado: o ${agentName} altera arquivos e roda comandos sem perguntar.`
              : `Ligue para o ${agentName} agir sem pedir autorização a cada passo.`
          }
          onClick={() => onBypassChange(!bypass)}
        >
          Bypass
          <span className="switch__track">
            <span className="switch__thumb" />
          </span>
        </button>
      </header>

      {banner}

      <div
        className="chat__messages"
        ref={listRef}
        onScroll={(event) => {
          const list = event.currentTarget
          stickToBottom.current =
            list.scrollHeight - list.scrollTop - list.clientHeight < STICKY_SCROLL
        }}
      >
        {chat.items.length === 0 && (
          <p className="text-caption">
            {bypass
              ? `Peça algo sobre este projeto. Com o bypass ligado, o ${agentName} altera arquivos e roda comandos sem perguntar.`
              : `Peça algo sobre este projeto. O ${agentName} lê os arquivos livremente e pede a sua autorização antes de alterar algo ou rodar comandos.`}
          </p>
        )}
        {chat.items.map((item) => (
          <Item key={`${item.kind}-${item.id}`} item={item} onRespond={onRespond} />
        ))}
        {startError && (
          <p className="notice" role="alert">
            {startError}
          </p>
        )}
      </div>

      <div className="chat__composer">
        <textarea
          className="field"
          rows={3}
          value={draft}
          placeholder={`Mensagem para o ${agentName}`}
          aria-label={`Mensagem para o ${agentName}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {busy && !starting ? (
          <Button icon="stop" onClick={onInterrupt}>
            Parar
          </Button>
        ) : (
          <Button variant="accent" icon="send" disabled={!canSend} onClick={submit}>
            Enviar
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Seletor de modelo ou de esforço. Some quando o agente não oferece a escolha.
 * Pode ser trocado a qualquer momento; vale a partir da próxima mensagem.
 */
function ChoiceSelect({
  label,
  choices,
  value,
  onChange
}: {
  label: string
  choices: Choice[]
  value: string | null
  onChange(value: string): void
}) {
  if (choices.length === 0 || value === null) return null
  return (
    <label className="select" title={`${label}: vale a partir da próxima mensagem`}>
      <span className="select__label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Item({
  item,
  onRespond
}: {
  item: ChatItem
  onRespond(requestId: string, allow: boolean): void
}) {
  switch (item.kind) {
    case 'user':
      return <div className="bubble bubble--user">{item.text}</div>
    case 'assistant':
      return <Markdown text={item.text} />
    case 'tool':
      return (
        <div className="tool-line" title={item.detail}>
          <span className="tool-line__name">{item.name}</span>
          <span className="text-mono truncate">{item.detail}</span>
        </div>
      )
    case 'note':
      return <p className="chat__note">{item.text}</p>
    case 'error':
      return (
        <p className="notice" role="alert">
          {item.text}
        </p>
      )
    case 'permission':
      if (item.state === 'auto') {
        return (
          <div className="tool-line tool-line--auto" title={item.detail}>
            <span className="tool-line__name">Bypass</span>
            <span className="truncate">
              {item.title} · <span className="text-mono">{item.detail.split('\n')[0]}</span>
            </span>
          </div>
        )
      }
      return (
        <div className="permission">
          <div className="permission__title">{item.title}</div>
          <pre className="permission__detail">{item.detail}</pre>
          {item.state === 'pending' ? (
            <div className="permission__actions">
              <Button variant="accent" onClick={() => onRespond(item.id, true)}>
                Permitir
              </Button>
              <Button onClick={() => onRespond(item.id, false)}>Negar</Button>
            </div>
          ) : (
            <div className="text-caption">
              {item.state === 'allowed' && 'Você permitiu.'}
              {item.state === 'denied' && 'Você negou.'}
              {item.state === 'cancelled' && 'Pedido cancelado.'}
            </div>
          )}
        </div>
      )
  }
}
