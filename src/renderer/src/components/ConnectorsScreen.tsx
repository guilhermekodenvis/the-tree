// Tela "Conectores" do menu lateral: serviços de fora que o The Tree e os agentes
// usam. (As contas do Claude e do ChatGPT ficam em "Modelos de IA".)
//
// - Gmail (e outros SMTP antigos): envio de e-mails nos passos das automações;
//   pode haver vários.
// - Google Maps: pesquisa de lugares (Places API) para os agentes; chave de API.
// - Navegador: navegador invisível do The Tree para os agentes abrirem sites.
//
// Google Maps e Navegador viram ferramentas dos agentes (Claude e ChatGPT) em
// qualquer conversa, chat rápido ou automação que começar depois de ligar.
import { useCallback, useEffect, useState } from 'react'
import { GMAIL_PRESET, type Connector, type ConnectorInput } from '../../../shared/automation'
import type { ToolConnectorId, ToolConnectorStatus } from '../../../shared/types'
import { messageOf } from '../lib/errors'
import { ConnectionsPage, type AddedItem, type NewItem } from './connections/ConnectionsPage'
import { Button } from './ui/Button'

const TOOLS: Record<ToolConnectorId, { name: string; description: string }> = {
  maps: {
    name: 'Google Maps',
    description:
      'Os agentes pesquisam negócios no Google Maps: nota, avaliações, telefone e site. Usa uma chave de API sua.'
  },
  browser: {
    name: 'Navegador',
    description:
      'Os agentes abrem sites num navegador invisível do The Tree, sem as suas contas: leem o conteúdo, procuram chats e tiram prints.'
  }
}

export function ConnectorsScreen() {
  const [smtp, setSmtp] = useState<Connector[] | null>(null)
  const [tools, setTools] = useState<ToolConnectorStatus[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [s, t] = await Promise.all([window.api.connectors.list(), window.api.connectors.tools()])
    setSmtp(s)
    setTools(t)
  }, [])

  useEffect(() => {
    refresh().catch((err) => setError(messageOf(err)))
  }, [refresh])

  const added: AddedItem[] = [
    ...(smtp ?? []).map((c): AddedItem => ({
      key: c.id,
      logo: c.host === GMAIL_PRESET.host ? 'gmail' : 'smtp',
      name: c.name,
      detail: c.hasPassword ? c.user : `${c.user} · sem senha salva`,
      view: `smtp:${c.id}`,
      removeWarning: 'Os passos de e-mail que usam este conector vão falhar.',
      remove: () => window.api.connectors.remove(c.id),
      actions: [
        {
          icon: 'send',
          label: 'Enviar e-mail de teste',
          disabled: !c.hasPassword,
          run: async () => {
            const to = await window.api.connectors.test(c.id)
            return `E-mail de teste enviado para ${to}. Confira a caixa de entrada.`
          }
        }
      ]
    })),
    ...(tools ?? [])
      .filter((t) => t.connected)
      .map((t): AddedItem => ({
        key: t.id,
        logo: t.id,
        name: TOOLS[t.id].name,
        detail: t.detail ?? 'Conectado',
        view: t.id,
        removeWarning:
          t.id === 'maps'
            ? 'A chave será apagada deste computador e os agentes deixam de pesquisar no Google Maps.'
            : 'Os agentes deixam de abrir sites pelo navegador do The Tree.',
        remove: async () => {
          await window.api.connectors.disconnectTool(t.id)
        },
        actions: [
          { icon: 'play', label: 'Testar', run: () => window.api.connectors.testTool(t.id) }
        ]
      }))
  ]

  const available: NewItem[] = [
    {
      key: 'gmail',
      logo: 'gmail',
      name: 'Gmail',
      description: 'Envia e-mails nos passos das automações. Pode conectar mais de uma conta.',
      view: 'smtp:new'
    },
    ...(tools ?? [])
      .filter((t) => !t.connected)
      .map((t): NewItem => ({ key: t.id, logo: t.id, ...TOOLS[t.id], view: t.id }))
  ]

  return (
    <ConnectionsPage
      title="Conectores"
      caption="Serviços que o The Tree e os agentes usam: e-mail, Google Maps e navegador."
      addLabel="Adicionar conector"
      addedTab="Conectores adicionados"
      newTab="Novos conectores"
      emptyIcon="plug"
      emptyTitle="Nenhum conector ainda"
      emptyText="Conecte o Gmail, o Google Maps ou o Navegador."
      nothingNew="Todos os conectores já estão ligados."
      loading={(smtp === null || tools === null) && !error}
      loadError={error}
      added={added}
      available={available}
      refresh={refresh}
      renderView={(view, context) => {
        if (view === 'maps') {
          return {
            title: context.editing ? 'Google Maps' : 'Conectar Google Maps',
            body: (
              <MapsForm editing={context.editing} onDone={context.done} onCancel={context.cancel} />
            )
          }
        }
        if (view === 'browser') {
          return {
            title: context.editing ? 'Navegador' : 'Conectar Navegador',
            body: (
              <BrowserForm
                editing={context.editing}
                onDone={context.done}
                onCancel={context.cancel}
              />
            )
          }
        }
        const editing = (smtp ?? []).find((c) => `smtp:${c.id}` === view) ?? null
        return {
          title: editing ? `Editar ${editing.name}` : 'Conectar Gmail',
          body: (
            <SmtpForm editing={editing} onSaved={() => context.done()} onCancel={context.cancel} />
          )
        }
      }}
    />
  )
}

/** Chave da Places API. Ao salvar, faz uma pesquisa de teste. */
function MapsForm({
  editing,
  onDone,
  onCancel
}: {
  editing: boolean
  onDone(message?: string): void
  onCancel(): void
}) {
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      await window.api.connectors.connectTool('maps', key)
      setKey('')
      onDone(await window.api.connectors.testTool('maps'))
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
      <p className="text-caption">Para criar a chave, no Google Cloud:</p>
      <ol className="text-caption steps-list">
        <li>
          Abra{' '}
          <a
            className="link"
            href="https://console.cloud.google.com/apis/library/places.googleapis.com"
            target="_blank"
            rel="noreferrer"
          >
            a página da Places API (New)
          </a>
          , escolha ou crie um projeto e clique em <strong>Ativar</strong>.
        </li>
        <li>Ative o faturamento do projeto (o Google dá um crédito mensal gratuito).</li>
        <li>
          Em{' '}
          <a
            className="link"
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noreferrer"
          >
            Credenciais
          </a>
          , clique em <strong>Criar credenciais → Chave de API</strong> e copie a chave.
        </li>
      </ol>
      <label className="key-form__label" htmlFor="maps-key">
        Chave de API do Google Maps
      </label>
      <input
        id="maps-key"
        className="field"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={editing ? 'Deixe em branco para manter a chave salva' : 'Cole aqui a chave'}
        value={key}
        onChange={(event) => setKey(event.target.value)}
      />
      <p className="text-caption">
        A chave fica criptografada neste computador. Cada pesquisa dos agentes é cobrada pelo Google
        na sua conta.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="key-form__actions">
        <Button variant="accent" type="submit" disabled={saving || (!editing && !key.trim())}>
          {saving ? 'Testando…' : editing ? 'Salvar e testar' : 'Conectar e testar'}
        </Button>
        <Button onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  )
}

/** O Navegador não tem configuração: liga e faz um teste abrindo uma página. */
function BrowserForm({
  editing,
  onDone,
  onCancel
}: {
  editing: boolean
  onDone(message?: string): void
  onCancel(): void
}) {
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const connect = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      await window.api.connectors.connectTool('browser')
      onDone(await window.api.connectors.testTool('browser'))
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="key-form">
      <p>
        Os agentes ganham um navegador próprio do The Tree, invisível, para abrir sites: ler o
        conteúdo, ver se o site está no ar, procurar chats de atendimento e tirar prints.
      </p>
      <p className="text-caption">
        Ele não usa o seu Chrome nem as suas contas: não tem cookies, logins nem downloads, e é
        apagado a cada site aberto.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="key-form__actions">
        <Button variant="accent" disabled={saving} onClick={() => void connect()}>
          {saving ? 'Testando…' : editing ? 'Testar de novo' : 'Conectar e testar'}
        </Button>
        <Button onClick={onCancel}>{editing ? 'Fechar' : 'Cancelar'}</Button>
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
