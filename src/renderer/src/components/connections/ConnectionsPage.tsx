// Molde das telas "Modelos de IA" e "Conectores", que funcionam do mesmo jeito:
// cartões com o que já está conectado (editar, excluir e ações extras) e um botão
// "Adicionar" que abre uma janela com as abas "...adicionados" e "Novos...".
//
// Cada tela diz o que está conectado, o que dá para conectar e desenha os
// formulários (renderView); este molde cuida de cartões, janela, abas,
// confirmação de remoção e mensagens.
import { useEffect, useState, type ReactNode } from 'react'
import type { IconName } from '../ui/Icon'
import { messageOf } from '../../lib/errors'
import { Button, IconButton } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Logo, type LogoName } from '../ui/Logo'
import { Tabs } from '../ui/Tabs'

/** Ação extra de um cartão (ex.: enviar e-mail de teste). Devolve o aviso a mostrar. */
export interface ItemAction {
  icon: IconName
  label: string
  disabled?: boolean
  run(): Promise<string | void>
}

/** Algo já conectado. `view` é o formulário de edição. */
export interface AddedItem {
  key: string
  logo: LogoName
  name: string
  detail: string
  view: string
  removeWarning: string
  remove(): Promise<void>
  actions?: ItemAction[]
}

/** Algo que dá para conectar. `view` é o formulário de conexão. */
export interface NewItem {
  key: string
  logo: LogoName
  name: string
  description: string
  view: string
}

export interface ViewContext {
  /** Salvou: volta para a lista de adicionados e atualiza. */
  done(message?: string): void
  /** Voltar para a lista sem salvar. */
  cancel(): void
  /** true quando o formulário abriu de um item já conectado. */
  editing: boolean
}

interface Props {
  title: string
  caption: string
  /** Ex.: "Adicionar conector". */
  addLabel: string
  /** Nomes das abas da janela. */
  addedTab: string
  newTab: string
  emptyIcon: IconName
  emptyTitle: string
  emptyText: string
  /** Mostrado na aba "Novos" quando não sobra nada para conectar. */
  nothingNew: string
  loading: boolean
  /** Erro ao carregar (vem da tela). */
  loadError: string | null
  added: AddedItem[]
  available: NewItem[]
  refresh(): Promise<void>
  /** Título e conteúdo de cada formulário. */
  renderView(view: string, context: ViewContext): { title: string; body: ReactNode }
}

type Modal = { tab: 'added' | 'new'; view: string | null; editing: boolean }

export function ConnectionsPage(props: Props) {
  const { added, available } = props
  const [modal, setModal] = useState<Modal | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const run = async (key: string, action: () => Promise<string | void>): Promise<void> => {
    setError(null)
    setNotice(null)
    setBusy(key)
    try {
      const message = await action()
      if (message) setNotice(message)
      await props.refresh()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  const remove = (item: AddedItem): Promise<void> =>
    run(`remove:${item.key}`, async () => {
      setConfirming(null)
      await item.remove()
    })

  const edit = (item: AddedItem): void => {
    setConfirming(null)
    setModal({ tab: 'added', view: item.view, editing: true })
  }

  const close = (): void => {
    setModal(null)
    setConfirming(null)
    void props.refresh()
  }

  const shownError = error ?? props.loadError

  return (
    <main className="screen">
      <header className="screen__header">
        <div>
          <h1 className="text-title">{props.title}</h1>
          <p className="text-caption">{props.caption}</p>
        </div>
        <Button
          variant="accent"
          icon="add"
          onClick={() => setModal({ tab: 'new', view: null, editing: false })}
        >
          {props.addLabel}
        </Button>
      </header>

      {shownError && (
        <p className="notice" role="alert">
          {shownError}
        </p>
      )}
      {notice && <p className="success-note">{notice}</p>}

      {props.loading ? (
        <p className="text-caption">Conferindo…</p>
      ) : added.length === 0 ? (
        <div className="empty-state">
          <Icon name={props.emptyIcon} className="empty-state__icon" />
          <p className="empty-state__title">{props.emptyTitle}</p>
          <p>{props.emptyText}</p>
        </div>
      ) : (
        <ul className="connector-grid">
          {added.map((item) => (
            <li key={item.key} className="connector-card">
              <Logo name={item.logo} size={36} />
              <div className="card__body">
                <div className="connector-card__name truncate">{item.name}</div>
                <div className="text-caption truncate" title={item.detail}>
                  {item.detail}
                </div>
              </div>
              {confirming === item.key ? (
                <div className="connector-card__confirm">
                  <span className="text-caption">{item.removeWarning}</span>
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
                  {item.actions?.map((action) => (
                    <IconButton
                      key={action.label}
                      icon={action.icon}
                      label={action.label}
                      disabled={busy !== null || action.disabled}
                      onClick={() => void run(`${action.label}:${item.key}`, action.run)}
                    />
                  ))}
                  <IconButton icon="rename" label="Editar" onClick={() => edit(item)} />
                  <IconButton
                    icon="delete"
                    label="Excluir"
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
        <ConnectionsModal
          {...props}
          modal={modal}
          busy={busy}
          confirming={confirming}
          setModal={setModal}
          onEdit={edit}
          onAskRemove={(item) => setConfirming(item.key)}
          onCancelRemove={() => setConfirming(null)}
          onRemove={(item) => void remove(item)}
          onDone={(message) => {
            setModal({ tab: 'added', view: null, editing: false })
            setNotice(message ?? null)
            void props.refresh()
          }}
          onClose={close}
        />
      )}
    </main>
  )
}

function ConnectionsModal(
  props: Props & {
    modal: Modal
    busy: string | null
    confirming: string | null
    setModal(modal: Modal): void
    onEdit(item: AddedItem): void
    onAskRemove(item: AddedItem): void
    onCancelRemove(): void
    onRemove(item: AddedItem): void
    onDone(message?: string): void
    onClose(): void
  }
) {
  const { modal, added, available } = props

  // Esc fecha a janela.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [props.onClose])

  const back = (): void => props.setModal({ ...modal, view: null, editing: false })
  const view =
    modal.view === null
      ? null
      : props.renderView(modal.view, {
          done: props.onDone,
          cancel: back,
          editing: modal.editing
        })

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) props.onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={props.title}>
        <header className="modal__header">
          {view && <IconButton icon="back" label="Voltar para a lista" onClick={back} />}
          <h2 className="modal__title">{view ? view.title : props.title}</h2>
          <IconButton icon="dismiss" label="Fechar" onClick={props.onClose} />
        </header>

        {view ? (
          <div className="modal__body">{view.body}</div>
        ) : props.loading ? (
          <p className="modal__body text-caption">Conferindo…</p>
        ) : (
          <>
            <div className="modal__tabs">
              <Tabs
                label={props.title}
                active={modal.tab}
                onChange={(tab) => props.setModal({ tab, view: null, editing: false })}
                tabs={[
                  { id: 'added', label: `${props.addedTab} (${added.length})` },
                  { id: 'new', label: props.newTab }
                ]}
              />
            </div>
            <ul className="modal__body connector-list">
              {modal.tab === 'added' && added.length === 0 && (
                <p className="text-caption">Nada adicionado ainda.</p>
              )}
              {modal.tab === 'added' &&
                added.map((item) => (
                  <li key={item.key} className="connector-row">
                    <Logo name={item.logo} />
                    <div className="card__body">
                      <div className="connector-card__name">{item.name}</div>
                      <div className="text-caption truncate">{item.detail}</div>
                      {props.confirming === item.key && (
                        <div className="connector-row__confirm">
                          <span className="text-caption">{item.removeWarning}</span>
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
              {modal.tab === 'new' &&
                available.map((item) => (
                  <li key={item.key} className="connector-row">
                    <Logo name={item.logo} />
                    <div className="card__body">
                      <div className="connector-card__name">{item.name}</div>
                      <div className="text-caption">{item.description}</div>
                    </div>
                    <span className="connector-status">Não conectado</span>
                    <div className="connector-row__actions">
                      <Button
                        variant="accent"
                        onClick={() =>
                          props.setModal({ tab: 'new', view: item.view, editing: false })
                        }
                      >
                        Conectar
                      </Button>
                    </div>
                  </li>
                ))}
              {modal.tab === 'new' && available.length === 0 && (
                <p className="text-caption">{props.nothingNew}</p>
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
