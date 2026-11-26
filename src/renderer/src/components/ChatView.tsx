// Conversa com um agente: histórico, pedidos de autorização e caixa de mensagem.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { agentInfo, type Choice } from '../../../shared/agents'
import type {
  AgentId,
  AgentSettings,
  Attachment,
  ChatItem,
  SessionStatus,
  Skill
} from '../../../shared/types'
import type { Chat } from '../hooks/useConversations'
import { AttachmentList } from './AttachmentList'
import { Composer } from './Composer'
import { Markdown } from './Markdown'
import { MarkdownReader } from './MarkdownReader'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'

interface Props {
  /** Projeto da conversa (caminhos relativos nos links partem dele). */
  projectId: string
  chat: Chat
  title: string
  /**
   * A conversa está na frente. Escondida (aba de outro projeto), a lista não
   * tem altura e não dá para rolar; ao voltar, ela vai para o fim.
   */
  visible: boolean
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
  /** Skills que a conversa pode usar no menu "/". */
  loadSkills(): Promise<Skill[]>
  onSend(text: string, skills: Skill[], attachments: Attachment[]): void
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
    projectId,
    chat,
    title,
    visible,
    agent,
    agentName,
    starting,
    startError,
    banner,
    settings,
    onSettingsChange,
    bypass,
    onBypassChange,
    loadSkills,
    onSend,
    onRespond,
    onInterrupt
  } = props
  const listRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  // Segue o fim da conversa conforme chegam mensagens, a não ser que você
  // tenha rolado para cima para reler algo. Também ao voltar para a aba do projeto.
  useEffect(() => {
    const list = listRef.current
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight
  }, [chat.items, visible])

  // A conversa pode carregar numa aba de projeto escondida (sem altura) ou a
  // janela pode mudar de tamanho: quando a lista ganha tamanho, volta para o fim.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) list.scrollTop = list.scrollHeight
    })
    observer.observe(list)
    return () => observer.disconnect()
  }, [])

  const info = agentInfo(agent)
  const busy = starting || chat.status === 'running' || chat.status === 'waiting'
  const status = statusText(chat, starting)

  // Leitor de .md/.mdx à direita. Pilha: seguir um link dentro do arquivo empilha,
  // "voltar" desempilha; abrir pela conversa começa de novo.
  const [reader, setReader] = useState<{ path: string; base?: string }[]>([])
  const openFile = useCallback((path: string) => setReader([{ path }]), [])
  const current = reader[reader.length - 1]

  return (
    <div className="chat-layout">
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
            <ChatItemView
              key={`${item.kind}-${item.id}`}
              item={item}
              onRespond={onRespond}
              onOpenFile={openFile}
            />
          ))}
          {startError && (
            <p className="notice" role="alert">
              {startError}
            </p>
          )}
        </div>

        <Composer
          agentName={agentName}
          busy={busy}
          canInterrupt={busy && !starting}
          loadSkills={loadSkills}
          onSend={(text, skills, attachments) => {
            stickToBottom.current = true
            onSend(text, skills, attachments)
          }}
          onInterrupt={onInterrupt}
        />
      </div>
      {current && (
        <MarkdownReader
          key={`${current.base ?? ''}|${current.path}`}
          projectId={projectId}
          path={current.path}
          base={current.base}
          canGoBack={reader.length > 1}
          onBack={() => setReader((stack) => stack.slice(0, -1))}
          onNavigate={(path, base) => setReader((stack) => [...stack, { path, base }])}
          onClose={() => setReader([])}
        />
      )}
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

/** Um item da conversa (também usado no histórico das automações). */
export function ChatItemView({
  item,
  onRespond,
  onOpenFile
}: {
  item: ChatItem
  onRespond(requestId: string, allow: boolean): void
  /** Abre um .md/.mdx citado na resposta no leitor ao lado. */
  onOpenFile?(path: string): void
}) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="bubble bubble--user">
          {item.skills && item.skills.length > 0 && (
            <div className="chip-row">
              {item.skills.map((name) => (
                <span key={name} className="chip chip--static">
                  <Icon name="skill" />
                  {name}
                </span>
              ))}
            </div>
          )}
          {item.attachments && item.attachments.length > 0 && (
            <AttachmentList attachments={item.attachments} />
          )}
          {item.text}
        </div>
      )
    case 'assistant':
      return <Markdown text={item.text} onOpenFile={onOpenFile} />
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

