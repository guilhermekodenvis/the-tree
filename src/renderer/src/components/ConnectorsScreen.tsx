// Tela "Conectores" do menu lateral: as ligações do The Tree com serviços de fora.
//
// - Claude e ChatGPT: o login do Claude Code e do Codex neste computador (o mesmo dos
//   CLIs). Conectar abre o login oficial no navegador; remover sai da conta, também
//   fora do app.
// - Gemini: chave de API guardada criptografada.
// - Gmail (e outros SMTP antigos): envio de e-mails nas automações; pode haver vários.
//
// A tela mostra os conectores adicionados em cartões. "Adicionar conector" abre uma
// janela com as abas "Conectores adicionados" e "Novos conectores".
import { useCallback, useEffect, useState } from 'react'
import { GMAIL_PRESET, type Connector, type ConnectorInput } from '../../../shared/automation'
import type { AccountId, AccountStatus } from '../../../shared/types'
import { messageOf } from '../lib/errors'
import { GeminiKeyForm } from './GeminiKey'
import { Button, IconButton } from './ui/Button'
import { Icon } from './ui/Icon'
import { Logo, type LogoName } from './ui/Logo'
import { Tabs } from './ui/Tabs'

interface CatalogItem {
  id: AccountId | 'gmail'
  name: string
  description: string
}

/** Conectores disponíveis no app (por enquanto, só estes). */
const CATALOG: CatalogItem[] = [
  {
    id: 'claude',
    name: 'Claude',
    description: 'Conta do Claude Code, usada nas conversas com o Claude.'
  },
  {
    id: 'codex',
    name: 'ChatGPT',
    description: 'Conta do Codex, usada nas conversas com o ChatGPT.'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Chave de API do Google AI Studio, usada pelo Gemini.'
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Envia e-mails nos passos das automações. Pode conectar mais de uma conta.'
  }
]

const ACCOUNT_NAMES: Record<AccountId, string> = {
  claude: 'Claude',
  codex: 'ChatGPT',
  gemini: 'Gemini'
}

/** Um conector adicionado: conta de agente ou conector de e-mail. */
type Added =
  | { kind: 'account'; key: string; id: AccountId; name: string; detail: string }
  | { kind: 'smtp'; key: string; connector: Connector; name: string; detail: string }

/** O que a janela está mostrando além das abas. */
type View =
  | { screen: 'list' }
  | { screen: 'gmail'; editing: Connector | null }
  | { screen: 'gemini' }
  | { screen: 'login'; id: 'claude' | 'codex' }

function logoOf(item: Added | CatalogItem): LogoName {
  if ('kind' in item) {
    if (item.kind === 'account') return item.id
    return item.connector.host === GMAIL_PRESET.host ? 'gmail' : 'smtp'
  }
  return item.id
}

/** Texto do aviso antes de remover. */
function removeWarning(item: Added): string {
  if (item.kind === 'smtp') return 'Os passos de e-mail que usam este conector vão falhar.'
  if (item.id === 'gemini') return 'A chave do Gemini será apagada deste computador.'
  return `Isso sai da conta do ${item.name} neste computador inteiro, também fora do The Tree.`
}

export function ConnectorsScreen() {
  const [accounts, setAccounts] = useState<AccountStatus[] | null>(null)
  const [smtp, setSmtp] = useState<Connector[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ tab: 'added' | 'new'; view: View } | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [a, s] = await Promise.all([window.api.accounts.status(), window.api.connectors.list()])
    setAccounts(a)
    setSmtp(s)
  }, [])

  useEffect(() => {
    refresh().catch((err) => setError(messageOf(err)))
  }, [refresh])

  const added: Added[] = [
    ...(accounts ?? [])
      .filter((a) => a.connected)
      .map((a): Added => ({
        kind: 'account',
        key: a.id,
        id: a.id,
        name: ACCOUNT_NAMES[a.id],
        detail: a.detail ?? 'Conectado'
      })),
    ...(smtp ?? []).map((c): Added => ({
      kind: 'smtp',
      key: c.id,
      connector: c,
      name: c.name,
      detail: c.hasPassword ? c.user : `${c.user} · sem senha salva`
    }))
  ]
  const connected = (id: AccountId): boolean =>
    accounts?.find((a) => a.id === id)?.connected === true
  const available = CATALOG.filter(
    (item) => item.id === 'gmail' || !connected(item.id as AccountId)
  )

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setError(null)
    setNotice(null)
    setBusy(key)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  /** Abrir a edição (cartão ou aba "adicionados"). */
  const edit = (item: Added): void => {
    setConfirming(null)
    const view: View =
      item.kind === 'smtp'
        ? { screen: 'gmail', editing: item.connector }
        : item.id === 'gemini'
          ? { screen: 'gemini' }
          : { screen: 'login', id: item.id }
    setModal({ tab: 'added', view })
  }

  const connect = (item: CatalogItem): void => {
    const view: View =
      item.id === 'gmail'
        ? { screen: 'gmail', editing: null }
        : item.id === 'gemini'
          ? { screen: 'gemini' }
          : { screen: 'login', id: item.id }
    setModal({ tab: 'new', view })
  }

  const remove = (item: Added): Promise<void> =>
    run(`remove:${item.key}`, async () => {
      setConfirming(null)
      if (item.kind === 'smtp') await window.api.connectors.remove(item.connector.id)
      else await window.api.accounts.logout(item.id)
    })

  const test = (connector: Connector): Promise<void> =>
    run(`test:${connector.id}`, async () => {
      const to = await window.api.connectors.test(connector.id)
      setNotice(`E-mail de teste enviado para ${to}. Confira a caixa de entrada.`)
    })

  return (
    <main className="screen">
      <header className="screen__header">
        <div>
          <h1 className="text-title">Conectores</h1>
          <p className="text-caption">
            Contas e serviços que o The Tree usa: os agentes e o envio de e-mails das automações.
          </p>
        </div>
        <Button
          variant="accent"
          icon="add"
          onClick={() => setModal({ tab: 'new', view: { screen: 'list' } })}
        >
          Adicionar conector
        </Button>
      </header>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="success-note">{notice}</p>}

      {accounts === null || smtp === null ? (
        <p className="text-caption">Conferindo os conectores…</p>
      ) : added.length === 0 ? (
        <div className="empty-state">
          <Icon name="plug" className="empty-state__icon" />
          <p className="empty-state__title">Nenhum conector ainda</p>
          <p>Conecte o Claude, o ChatGPT, o Gemini ou o Gmail.</p>
        </div>
      ) : (
        <ul className="connector-grid">
          {added.map((item) => (
            <li key={item.key} className="connector-card">
              <Logo name={logoOf(item)} size={36} />
              <div className="card__body">
                <div className="connector-card__name truncate">{item.name}</div>
                <div className="text-caption truncate" title={item.detail}>
                  {item.detail}
                </div>
              </div>
              {confirming === item.key ? (
                <div className="connector-card__confirm">
                  <span className="text-caption">{removeWarning(item)}</span>
                  <div className="key-form__actions">
                    <Button
                      variant="accent"
                      disabled={busy !== null}
                      onClick={() => void remove(item)}
                    >
                      Excluir
                    </Button>
                    <Button onClick={() => setConfirming(null)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="connector-card__tools">
                  {item.kind === 'smtp' && (
                    <IconButton
                      icon="send"
                      label="Enviar e-mail de teste"
                      disabled={busy !== null || !item.connector.hasPassword}
                      onClick={() => void test(item.connector)}
                    />
                  )}
                  <IconButton icon="rename" label="Editar conector" onClick={() => edit(item)} />
                  <IconButton
                    icon="delete"
                    label="Excluir conector"
                    danger
                    onClick={() => setConfirming(item.key)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <ConnectorsModal
          tab={modal.tab}
          view={modal.view}
          added={added}
          available={available}
          busy={busy}
          confirming={confirming}
          onTab={(tab) => setModal({ tab, view: { screen: 'list' } })}
          onView={(view) => setModal({ ...modal, view })}
          onEdit={edit}
          onConnect={connect}
          onAskRemove={(item) => setConfirming(item.key)}
          onCancelRemove={() => setConfirming(null)}
          onRemove={(item) => void remove(item)}
          onSaved={() => {
            setModal({ tab: 'added', view: { screen: 'list' } })
            void refresh()
          }}
          onClose={() => {
            setModal(null)
            setConfirming(null)
            void refresh()
          }}
        />
      )}
    </main>
  )
}

function ConnectorsModal(props: {
  tab: 'added' | 'new'
  view: View
  added: Added[]
  available: CatalogItem[]
  busy: string | null
  confirming: string | null
  onTab(tab: 'added' | 'new'): void
  onView(view: View): void
  onEdit(item: Added): void
  onConnect(item: CatalogItem): void
  onAskRemove(item: Added): void
  onCancelRemove(): void
  onRemove(item: Added): void
  onSaved(): void
  onClose(): void
}) {
  const { tab, view, added, available } = props

  // Esc fecha a janela.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [props.onClose])

  const back = (): void => props.onView({ screen: 'list' })

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) props.onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Conectores">
        <header className="modal__header">
          {view.screen !== 'list' && (
            <IconButton icon="back" label="Voltar para a lista" onClick={back} />
          )}
          <h2 className="modal__title">
            {view.screen === 'list'
              ? 'Conectores'
              : view.screen === 'gmail'
                ? view.editing
                  ? `Editar ${view.editing.name}`
                  : 'Conectar Gmail'
                : view.screen === 'gemini'
                  ? 'Chave do Gemini'
                  : `Conectar ${ACCOUNT_NAMES[view.id]}`}
          </h2>
          <IconButton icon="dismiss" label="Fechar" onClick={props.onClose} />
        </header>

        {view.screen === 'list' && (
          <>
            <div className="modal__tabs">
              <Tabs
                label="Conectores"
                active={tab}
                onChange={props.onTab}
                tabs={[
                  { id: 'added', label: `Conectores adicionados (${added.length})` },
                  { id: 'new', label: 'Novos conectores' }
                ]}
              />
            </div>
            <ul className="modal__body connector-list">
              {tab === 'added' && added.length === 0 && (
                <p className="text-caption">Nenhum conector adicionado ainda.</p>
              )}
              {tab === 'added' &&
                added.map((item) => (
                  <li key={item.key} className="connector-row">
                    <Logo name={logoOf(item)} />
                    <div className="card__body">
                      <div className="connector-card__name">{item.name}</div>
                      <div className="text-caption truncate">{item.detail}</div>
                      {props.confirming === item.key && (
                        <div className="connector-row__confirm">
                          <span className="text-caption">{removeWarning(item)}</span>
                          <div className="key-form__actions">
                            <Button
                              variant="accent"
                              disabled={props.busy !== null}
                              onClick={() => props.onRemove(item)}
                            >
                              Remover conexão
                            </Button>
                            <Button onClick={props.onCancelRemove}>Cancelar</Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="connector-status connector-status--on">Conectado</span>
                    {props.confirming !== item.key && (
                      <div className="connector-row__actions">
                        <Button onClick={() => props.onEdit(item)}>Editar conexão</Button>
                        <Button onClick={() => props.onAskRemove(item)}>Remover conexão</Button>
                      </div>
                    )}
                  </li>
                ))}
              {tab === 'new' &&
                available.map((item) => (
                  <li key={item.id} className="connector-row">
                    <Logo name={logoOf(item)} />
                    <div className="card__body">
                      <div className="connector-card__name">{item.name}</div>
                      <div className="text-caption">{item.description}</div>
                    </div>
                    <span className="connector-status">Não conectado</span>
                    <div className="connector-row__actions">
                      <Button variant="accent" onClick={() => props.onConnect(item)}>
                        Conectar
                      </Button>
                    </div>
                  </li>
                ))}
              {tab === 'new' && available.length === 1 && (
                <p className="text-caption">Claude, ChatGPT e Gemini já estão conectados.</p>
              )}
            </ul>
          </>
        )}

        {view.screen === 'gmail' && (
          <div className="modal__body">
            <SmtpForm editing={view.editing} onSaved={props.onSaved} onCancel={back} />
          </div>
        )}

        {view.screen === 'gemini' && (
          <div className="modal__body">
            <GeminiKeyForm
              configured={added.some((a) => a.kind === 'account' && a.id === 'gemini')}
              onDone={props.onSaved}
            />
          </div>
        )}

        {view.screen === 'login' && (
          <div className="modal__body">
            <AccountLogin id={view.id} onDone={props.onSaved} onCancel={back} />
          </div>
        )}
      </div>
    </div>
  )
}

/** Login oficial do Claude ou do ChatGPT, feito no navegador. */
function AccountLogin({
  id,
  onDone,
  onCancel
}: {
  id: 'claude' | 'codex'
  onDone(): void
  onCancel(): void
}) {
  const [state, setState] = useState<'idle' | 'waiting' | 'error'>('idle')
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const name = ACCOUNT_NAMES[id]

  useEffect(
    () =>
      window.api.accounts.onLoginLink((event) => {
        if (event.id === id) setLink(event.url)
      }),
    [id]
  )

  const start = async (): Promise<void> => {
    setState('waiting')
    setError(null)
    setLink(null)
    try {
      const status = await window.api.accounts.login(id)
      if (!status.connected) throw new Error('O login não foi concluído. Tente de novo.')
      onDone()
    } catch (err) {
      setState('error')
      setError(messageOf(err))
    }
  }

  return (
    <div className="key-form">
      <p>
        O The Tree usa a conta do {id === 'claude' ? 'Claude Code' : 'Codex'} deste computador. Ao
        continuar, o login oficial do {name} abre no navegador; depois de entrar, volte aqui.
      </p>
      <p className="text-caption">
        A conta vale para o computador inteiro: o {id === 'claude' ? 'Claude Code' : 'Codex'} fora
        do The Tree passa a usar a mesma.
      </p>
      {state === 'waiting' && (
        <p className="text-caption">
          Aguardando você terminar o login no navegador…
          {link && (
            <>
              {' '}
              Se ele não abriu,{' '}
              <a className="link" href={link} target="_blank" rel="noreferrer">
                abra o login por aqui
              </a>
              .
            </>
          )}
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="key-form__actions">
        <Button variant="accent" disabled={state === 'waiting'} onClick={() => void start()}>
          {state === 'waiting' ? 'Entrando…' : `Entrar no ${name}`}
        </Button>
        <Button onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}

type Draft = ConnectorInput & { password: string }

/** Formulário do Gmail (ou de um SMTP antigo, ao editar). */
function SmtpForm({
  editing,
  onSaved,
  onCancel
}: {
  editing: Connector | null
  onSaved(): void
  onCancel(): void
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    editing
      ? { ...editing, password: '' }
      : { ...GMAIL_PRESET, user: '', fromName: '', password: '' }
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const isGmail = draft.host === GMAIL_PRESET.host

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const { password, ...rest } = draft
      await window.api.connectors.save(password ? { ...rest, password } : rest)
      onSaved()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="key-form"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      {isGmail && !editing && (
        <p className="text-caption">
          O Gmail pede uma <strong>senha de app</strong> (não a sua senha normal). Ela exige a
          verificação em duas etapas ligada. Gere em{' '}
          <a
            className="link"
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noreferrer"
          >
            myaccount.google.com/apppasswords
          </a>{' '}
          e cole abaixo.
        </p>
      )}
      <div className="form-grid">
        <label className="form-field">
          <span className="form-field__label">Nome do conector</span>
          <input
            className="field"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span className="form-field__label">{isGmail ? 'Seu endereço Gmail' : 'Usuário'}</span>
          <input
            className="field"
            type={isGmail ? 'email' : 'text'}
            autoComplete="off"
            value={draft.user}
            placeholder={isGmail ? 'voce@gmail.com' : ''}
            onChange={(e) => setDraft({ ...draft, user: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span className="form-field__label">Nome de quem envia (opcional)</span>
          <input
            className="field"
            value={draft.fromName}
            onChange={(e) => setDraft({ ...draft, fromName: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span className="form-field__label">{isGmail ? 'Senha de app' : 'Senha'}</span>
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            value={draft.password}
            placeholder={editing ? 'Deixe em branco para manter a senha salva' : ''}
            onChange={(e) => setDraft({ ...draft, password: e.target.value })}
          />
        </label>
        {!isGmail && (
          <>
            <label className="form-field">
              <span className="form-field__label">Servidor SMTP</span>
              <input
                className="field"
                value={draft.host}
                onChange={(e) => setDraft({ ...draft, host: e.target.value })}
              />
            </label>
            <div className="form-row">
              <label className="form-field">
                <span className="form-field__label">Porta</span>
                <input
                  className="field"
                  type="number"
                  value={draft.port}
                  onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) })}
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">Segurança</span>
                <select
                  className="field"
                  value={draft.security}
                  onChange={(e) =>
                    setDraft({ ...draft, security: e.target.value as Draft['security'] })
                  }
                >
                  <option value="starttls">STARTTLS (porta 587)</option>
                  <option value="ssl">SSL/TLS (porta 465)</option>
                </select>
              </label>
            </div>
          </>
        )}
      </div>
      <p className="text-caption">
        A senha fica criptografada no cofre do Windows e só é usada na hora de enviar.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="key-form__actions">
        <Button type="submit" variant="accent" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}
