// Conversa com um agente: histórico, pedidos de autorização e caixa de mensagem.
// TODO: renderizar Markdown nas respostas (hoje o texto aparece como veio).
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { SessionStatus } from '../../../shared/types'
import type { Chat, ChatItem } from '../hooks/useAgents'
import { Button, IconButton } from './ui/Button'

interface Props {
  chat: Chat
  agentName: string
  onSend(text: string): void
  onRespond(requestId: string, allow: boolean): void
  onClose(): void
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: 'Pronto',
  running: 'Trabalhando…',
  waiting: 'Aguardando você',
  error: 'Erro'
}

export function ChatView({ chat, agentName, onSend, onRespond, onClose }: Props) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // Mantém o fim da conversa à vista conforme chegam mensagens.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [chat.items])

  const busy = chat.status === 'running' || chat.status === 'waiting'
  const ended = chat.status === 'error'
  const canSend = draft.trim() !== '' && !busy && !ended

  const submit = (): void => {
    if (!canSend) return
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
        <span className={`dot dot--${chat.session.agent}`} />
        <div className="card__body">
          <div className="chat__title">{agentName}</div>
          <div className="text-caption" role="status">
            {STATUS_LABEL[chat.status]}
          </div>
        </div>
        <IconButton icon="dismiss" label="Encerrar conversa" onClick={onClose} />
      </header>

      <div className="chat__messages" ref={listRef}>
        {chat.items.length === 0 && (
          <p className="text-caption">
            Peça algo sobre este projeto. O {agentName} lê os arquivos livremente e pede a sua
            autorização antes de alterar algo ou rodar comandos.
          </p>
        )}
        {chat.items.map((item) => (
          <Item key={`${item.kind}-${item.id}`} item={item} onRespond={onRespond} />
        ))}
      </div>

      <div className="chat__composer">
        <textarea
          className="field"
          rows={3}
          value={draft}
          disabled={ended}
          placeholder={ended ? 'Esta conversa terminou.' : `Mensagem para o ${agentName}`}
          aria-label={`Mensagem para o ${agentName}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <Button variant="accent" icon="send" disabled={!canSend} onClick={submit}>
          Enviar
        </Button>
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
      return <div className="bubble">{item.text}</div>
    case 'tool':
      return (
        <div className="tool-line" title={item.detail}>
          <span className="tool-line__name">{item.name}</span>
          <span className="text-mono truncate">{item.detail}</span>
        </div>
      )
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
