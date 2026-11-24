// Conversa com um agente: histórico, pedidos de autorização e caixa de mensagem.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ChatItem, SessionStatus } from '../../../shared/types'
import type { Chat } from '../hooks/useAgents'
import { Markdown } from './Markdown'
import { Button, IconButton } from './ui/Button'

interface Props {
  chat: Chat
  agentName: string
  starting: boolean
  startError: string | null
  onSend(text: string): void
  onRespond(requestId: string, allow: boolean): void
  onInterrupt(): void
  onForget(): void
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: 'Pronto',
  running: 'Trabalhando…',
  waiting: 'Aguardando você',
  error: 'O agente parou. Envie uma mensagem para reiniciar.'
}

/** Distância do fim (em px) abaixo da qual a conversa segue rolando sozinha. */
const STICKY_SCROLL = 80

export function ChatView(props: Props) {
  const { chat, agentName, starting, startError, onSend, onRespond, onInterrupt, onForget } = props
  const [draft, setDraft] = useState('')
  const [confirmingForget, setConfirmingForget] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  // Segue o fim da conversa conforme chegam mensagens, a não ser que você
  // tenha rolado para cima para reler algo.
  useEffect(() => {
    const list = listRef.current
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight
  }, [chat.items])

  const busy = starting || chat.status === 'running' || chat.status === 'waiting'
  const canSend = draft.trim() !== '' && !busy

  const status = starting
    ? 'Iniciando…'
    : chat.sessionId === null && chat.status === 'idle'
      ? 'Conversa salva. Envie uma mensagem para continuar.'
      : STATUS_LABEL[chat.status]

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
        <span className={`dot dot--${chat.agent}`} />
        <div className="card__body">
          <div className="chat__title">{agentName}</div>
          <div className="text-caption truncate" role="status" title={status}>
            {status}
          </div>
        </div>
        {confirmingForget ? (
          <div className="chat__confirm">
            <span className="text-caption">Apagar esta conversa?</span>
            <Button variant="accent" onClick={onForget}>
              Apagar
            </Button>
            <Button onClick={() => setConfirmingForget(false)}>Cancelar</Button>
          </div>
        ) : (
          <IconButton
            icon="compose"
            label="Nova conversa (apaga esta)"
            onClick={() => setConfirmingForget(true)}
          />
        )}
      </header>

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
            Peça algo sobre este projeto. O {agentName} lê os arquivos livremente e pede a sua
            autorização antes de alterar algo ou rodar comandos.
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
