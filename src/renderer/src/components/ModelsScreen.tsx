// Tela "Modelos de IA" do menu lateral: as contas do Claude e do ChatGPT que os
// agentes usam. Não há login próprio do The Tree: é o login do Claude Code e do
// Codex deste computador (o mesmo dos CLIs). Conectar abre o login oficial no
// navegador; remover sai da conta, também fora do app.
//
// O Gemini não aparece aqui (decisão do dono); a chave dele continua na aba Agentes.
import { useCallback, useEffect, useState } from 'react'
import type { AccountStatus } from '../../../shared/types'
import { messageOf } from '../lib/errors'
import { ConnectionsPage, type AddedItem, type NewItem } from './connections/ConnectionsPage'
import { Button } from './ui/Button'

type ModelId = 'claude' | 'codex'

const MODELS: { id: ModelId; name: string; tool: string; description: string }[] = [
  {
    id: 'claude',
    name: 'Claude',
    tool: 'Claude Code',
    description: 'Conta do Claude Code, usada nas conversas e automações com o Claude.'
  },
  {
    id: 'codex',
    name: 'ChatGPT',
    tool: 'Codex',
    description: 'Conta do Codex, usada nas conversas e automações com o ChatGPT.'
  }
]

export function ModelsScreen() {
  const [accounts, setAccounts] = useState<AccountStatus[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setAccounts(await window.api.accounts.status())
  }, [])

  useEffect(() => {
    refresh().catch((err) => setError(messageOf(err)))
  }, [refresh])

  const connected = (id: ModelId): AccountStatus | undefined =>
    accounts?.find((a) => a.id === id && a.connected)

  const added: AddedItem[] = MODELS.filter((m) => connected(m.id)).map((m) => ({
    key: m.id,
    logo: m.id,
    name: m.name,
    detail: connected(m.id)?.detail ?? 'Conectado',
    view: m.id,
    removeWarning: `Isso sai da conta do ${m.name} neste computador inteiro, também fora do The Tree.`,
    remove: async () => {
      await window.api.accounts.logout(m.id)
    }
  }))

  // Conta que não deu para conferir (o CLI não respondeu) não é oferecida como
  // "nova": o aviso no topo explica, em vez de parecer desconectada.
  const unchecked = (accounts ?? []).filter(
    (a) => a.error && MODELS.some((m) => m.id === a.id)
  ) as (AccountStatus & { id: ModelId })[]
  const checkError =
    unchecked.length > 0
      ? unchecked.map((a) => `${MODELS.find((m) => m.id === a.id)?.name}: ${a.error}`).join(' ')
      : null

  const available: NewItem[] = MODELS.filter(
    (m) => !connected(m.id) && !unchecked.some((a) => a.id === m.id)
  ).map((m) => ({
    key: m.id,
    logo: m.id,
    name: m.name,
    description: m.description,
    view: m.id
  }))

  return (
    <ConnectionsPage
      title="Modelos de IA"
      caption="As contas do Claude e do ChatGPT que os agentes do The Tree usam."
      addLabel="Adicionar modelo"
      addedTab="Modelos adicionados"
      newTab="Novos modelos"
      emptyIcon="sparkle"
      emptyTitle="Nenhum modelo conectado"
      emptyText="Conecte o Claude ou o ChatGPT para conversar com os agentes."
      nothingNew="O Claude e o ChatGPT já estão conectados."
      loading={accounts === null && !error}
      loadError={error ?? checkError}
      added={added}
      available={available}
      refresh={refresh}
      renderView={(view, context) => {
        const model = MODELS.find((m) => m.id === view) ?? MODELS[0]
        return {
          title: `Conectar ${model.name}`,
          body: (
            <AccountLogin
              id={model.id}
              name={model.name}
              tool={model.tool}
              onDone={() => context.done()}
              onCancel={context.cancel}
            />
          )
        }
      }}
    />
  )
}

/** Login oficial do Claude ou do ChatGPT, feito no navegador. */
function AccountLogin({
  id,
  name,
  tool,
  onDone,
  onCancel
}: {
  id: ModelId
  name: string
  tool: string
  onDone(): void
  onCancel(): void
}) {
  const [state, setState] = useState<'idle' | 'waiting' | 'error'>('idle')
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        O The Tree usa a conta do {tool} deste computador. Ao continuar, o login oficial do {name}{' '}
        abre no navegador; depois de entrar, volte aqui.
      </p>
      <p className="text-caption">
        A conta vale para o computador inteiro: o {tool} fora do The Tree passa a usar a mesma.
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
