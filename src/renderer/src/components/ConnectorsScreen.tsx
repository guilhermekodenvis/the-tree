// Tela "Conectores" do menu lateral: ligações com serviços de fora usadas pelas
// automações. Por enquanto, e-mail por SMTP (com o Gmail pronto).
// A senha é digitada aqui e vai direto para o cofre do Windows; ela nunca volta
// para a tela (só aparece "senha salva").
import { useCallback, useEffect, useState } from 'react'
import { GMAIL_PRESET, type Connector, type ConnectorInput } from '../../../shared/automation'
import { messageOf } from '../lib/errors'
import { Button, IconButton } from './ui/Button'
import { Icon } from './ui/Icon'

type Draft = ConnectorInput & { password: string }

const blank: Draft = {
  name: 'E-mail (SMTP)',
  host: '',
  port: 587,
  security: 'starttls',
  user: '',
  fromName: '',
  password: ''
}

export function ConnectorsScreen() {
  const [list, setList] = useState<Connector[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setList(await window.api.connectors.list())
  }, [])
  useEffect(() => {
    refresh().catch((err) => setError(messageOf(err)))
  }, [refresh])

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setError(null)
    setNotice(null)
    setBusy(key)
    try {
      await action()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  const save = (): Promise<void> =>
    run('save', async () => {
      if (!draft) return
      const { password, ...rest } = draft
      await window.api.connectors.save(password ? { ...rest, password } : rest)
      setDraft(null)
      await refresh()
    })

  const isGmail = draft?.host === GMAIL_PRESET.host

  return (
    <main className="screen">
      <header className="screen__header">
        <div>
          <h1 className="text-title">Conectores</h1>
          <p className="text-caption">
            Ligações do The Tree com serviços de fora, usadas pelos passos das automações.
          </p>
        </div>
        {!draft && (
          <div className="screen__actions">
            <Button icon="mail" onClick={() => setDraft({ ...blank })}>
              Outro SMTP
            </Button>
            <Button variant="accent" icon="add" onClick={() => setDraft({ ...blank, ...GMAIL_PRESET, password: '' })}>
              Conectar Gmail
            </Button>
          </div>
        )}
      </header>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="success-note">{notice}</p>}

      {draft && (
        <form
          className="card card--stacked connector-form"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <h2 className="skills-tab__title">{draft.id ? 'Editar conector' : isGmail ? 'Conectar Gmail' : 'Novo conector SMTP'}</h2>
          {isGmail && !draft.id && (
            <p className="text-caption">
              O Gmail pede uma <strong>senha de app</strong> (não a sua senha normal). Ela exige a verificação em duas
              etapas ligada. Gere em{' '}
              <a className="link" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
                myaccount.google.com/apppasswords
              </a>{' '}
              e cole abaixo.
            </p>
          )}
          <div className="form-grid">
            <label className="form-field">
              <span className="form-field__label">Nome do conector</span>
              <input className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
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
              <input className="field" value={draft.fromName} onChange={(e) => setDraft({ ...draft, fromName: e.target.value })} />
            </label>
            <label className="form-field">
              <span className="form-field__label">{isGmail ? 'Senha de app' : 'Senha'}</span>
              <input
                className="field"
                type="password"
                autoComplete="new-password"
                value={draft.password}
                placeholder={draft.id ? 'Deixe em branco para manter a senha salva' : ''}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              />
            </label>
            {!isGmail && (
              <>
                <label className="form-field">
                  <span className="form-field__label">Servidor SMTP</span>
                  <input className="field" value={draft.host} placeholder="smtp.exemplo.com" onChange={(e) => setDraft({ ...draft, host: e.target.value })} />
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
                      onChange={(e) => setDraft({ ...draft, security: e.target.value as Draft['security'] })}
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
          <div className="key-form__actions">
            <Button type="submit" variant="accent" disabled={busy === 'save'}>
              {busy === 'save' ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button onClick={() => setDraft(null)}>Cancelar</Button>
          </div>
        </form>
      )}

      {list && list.length === 0 && !draft ? (
        <div className="empty-state">
          <Icon name="plug" className="empty-state__icon" />
          <p className="empty-state__title">Nenhum conector ainda</p>
          <p>Conecte o seu Gmail para as automações enviarem e-mails.</p>
        </div>
      ) : (
        <ul className="skill-list">
          {(list ?? []).map((c) => (
            <li key={c.id} className="skill-card">
              <span className="skill-card__icon">
                <Icon name="mail" />
              </span>
              <div className="card__body">
                <div className="skill-card__name truncate">{c.name}</div>
                <p className="skill-card__description">
                  {c.user} · {c.host}:{c.port}
                </p>
                {!c.hasPassword && <p className="skill-card__missing">Sem senha salva: edite e cole a senha.</p>}
                {confirming === c.id && (
                  <div className="skill-card__confirm">
                    <span className="text-caption">Apagar este conector? Passos de e-mail que o usam vão falhar.</span>
                    <Button
                      variant="accent"
                      onClick={() =>
                        void run(c.id, async () => {
                          setConfirming(null)
                          await window.api.connectors.remove(c.id)
                          await refresh()
                        })
                      }
                    >
                      Apagar
                    </Button>
                    <Button onClick={() => setConfirming(null)}>Cancelar</Button>
                  </div>
                )}
              </div>
              <Button
                icon="send"
                disabled={busy === `test:${c.id}` || !c.hasPassword}
                onClick={() =>
                  void run(`test:${c.id}`, async () => {
                    const to = await window.api.connectors.test(c.id)
                    setNotice(`E-mail de teste enviado para ${to}. Confira a caixa de entrada.`)
                  })
                }
              >
                {busy === `test:${c.id}` ? 'Enviando…' : 'Testar'}
              </Button>
              <IconButton
                icon="rename"
                label="Editar"
                onClick={() =>
                  setDraft({
                    id: c.id,
                    name: c.name,
                    host: c.host,
                    port: c.port,
                    security: c.security,
                    user: c.user,
                    fromName: c.fromName,
                    password: ''
                  })
                }
              />
              <IconButton icon="delete" label="Apagar" danger onClick={() => setConfirming(c.id)} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
