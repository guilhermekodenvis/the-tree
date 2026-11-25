// Conectores: ligações do app com serviços de fora (por enquanto, e-mail por SMTP).
// Os dados ficam em connectors.json; a senha fica criptografada no cofre do
// Windows (secrets.ts) e nunca volta para a interface.
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import nodemailer from 'nodemailer'
import type { Connector, ConnectorInput } from '../../shared/automation'
import { getSecret, hasSecret, removeSecret, setSecret } from '../secrets'

type Stored = Omit<Connector, 'hasPassword'>

let cache: Stored[] | null = null

function storeFile(): string {
  return join(app.getPath('userData'), 'connectors.json')
}

const secretOf = (id: string) => `connector:${id}` as const

async function load(): Promise<Stored[]> {
  if (cache) return cache
  try {
    const parsed = JSON.parse(await readFile(storeFile(), 'utf8')) as unknown
    cache = Array.isArray(parsed) ? (parsed as Stored[]) : []
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    cache = []
  }
  return cache
}

async function save(list: Stored[]): Promise<void> {
  const file = storeFile()
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  await writeFile(temp, JSON.stringify(list, null, 2), 'utf8')
  await rename(temp, file)
  cache = list
}

async function withPassword(c: Stored): Promise<Connector> {
  return { ...c, hasPassword: await hasSecret(secretOf(c.id)) }
}

export async function list(): Promise<Connector[]> {
  return Promise.all((await load()).map(withPassword))
}

function clean(input: ConnectorInput): Omit<Stored, 'id' | 'kind'> {
  const text = (value: unknown, max = 200): string => String(value ?? '').trim().slice(0, max)
  const name = text(input.name, 80)
  const host = text(input.host)
  const user = text(input.user)
  const port = Number(input.port)
  if (!name) throw new Error('Dê um nome ao conector.')
  if (!host) throw new Error('Informe o servidor SMTP.')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('A porta precisa ser um número entre 1 e 65535.')
  if (!user) throw new Error('Informe o usuário (no Gmail, o seu endereço de e-mail).')
  return {
    name,
    host,
    port,
    security: input.security === 'ssl' ? 'ssl' : 'starttls',
    user,
    fromName: text(input.fromName, 80)
  }
}

/** Cria (sem id) ou altera um conector. A senha só muda se vier preenchida. */
export async function upsert(input: ConnectorInput): Promise<Connector> {
  const data = clean(input)
  const all = await load()
  const password = typeof input.password === 'string' ? input.password.replace(/\s+/g, '') : ''
  let stored: Stored
  if (input.id) {
    const current = all.find((c) => c.id === input.id)
    if (!current) throw new Error('Este conector não existe mais.')
    stored = { ...current, ...data }
    await save(all.map((c) => (c.id === stored.id ? stored : c)))
  } else {
    if (!password) throw new Error('Cole a senha (no Gmail, a senha de app).')
    stored = { id: randomUUID(), kind: 'smtp', ...data }
    await save([...all, stored])
  }
  if (password) await setSecret(secretOf(stored.id), password)
  return withPassword(stored)
}

export async function remove(id: string): Promise<void> {
  await save((await load()).filter((c) => c.id !== id))
  await removeSecret(secretOf(id))
}

export async function get(id: string): Promise<Connector | null> {
  const found = (await load()).find((c) => c.id === id)
  return found ? withPassword(found) : null
}

const isLocal = (host: string): boolean => ['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase())

export interface Mail {
  to: string[]
  subject: string
  text: string
}

/** Envia um e-mail pelo conector. A senha só é lida aqui, na hora de enviar. */
export async function send(id: string, mail: Mail): Promise<void> {
  const connector = (await load()).find((c) => c.id === id)
  if (!connector) throw new Error('O conector de e-mail deste passo não existe mais.')
  const password = await getSecret(secretOf(id))
  if (!password) throw new Error(`O conector "${connector.name}" está sem senha.`)
  const transport = nodemailer.createTransport({
    host: connector.host,
    port: connector.port,
    secure: connector.security === 'ssl',
    // Servidor no próprio computador (ex.: ferramenta de teste de e-mail) pode não ter TLS.
    requireTLS: connector.security === 'starttls' && !isLocal(connector.host),
    auth: { user: connector.user, pass: password },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000
  })
  try {
    await transport.sendMail({
      from: connector.fromName ? { name: connector.fromName, address: connector.user } : connector.user,
      to: mail.to,
      subject: mail.subject,
      text: mail.text
    })
  } catch (err) {
    throw new Error(explain(err, connector.name))
  } finally {
    transport.close()
  }
}

/** Mensagens do servidor em português, com o que fazer. */
function explain(err: unknown, name: string): string {
  const e = err as { code?: string; responseCode?: number; message?: string }
  if (e.code === 'EAUTH' || e.responseCode === 535) {
    return `O servidor recusou o login do conector "${name}". No Gmail, use uma senha de app (não a sua senha normal).`
  }
  if (e.code === 'ETIMEDOUT' || e.code === 'ECONNECTION' || e.code === 'ESOCKET') {
    return `Não consegui conectar ao servidor do conector "${name}". Confira servidor, porta e segurança.`
  }
  return `Falha ao enviar pelo conector "${name}": ${e.message ?? String(err)}`
}

/** Envia um e-mail de teste para o próprio endereço do conector. */
export async function test(id: string): Promise<string> {
  const connector = (await load()).find((c) => c.id === id)
  if (!connector) throw new Error('Este conector não existe mais.')
  await send(id, {
    to: [connector.user],
    subject: 'The Tree: teste do conector',
    text: `O conector "${connector.name}" está funcionando. Este e-mail foi enviado pelo The Tree.`
  })
  return connector.user
}
