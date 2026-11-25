// Segredos do app: a chave de API do Gemini e as senhas dos conectores.
// Ficam criptografados com o cofre do sistema (no Windows, DPAPI, ligado à sua conta
// de usuário) em <dados do app>/secrets.json. Nunca são enviados para a interface:
// ela só consegue saber se a chave existe, gravar uma nova ou apagar.
import { app, safeStorage } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type SecretName = 'gemini-api-key' | `connector:${string}`

type Stored = Partial<Record<string, string>>

function file(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

async function readAll(): Promise<Stored> {
  try {
    return JSON.parse(await readFile(file(), 'utf8')) as Stored
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
}

async function writeAll(data: Stored): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  const temp = `${file()}.tmp`
  await writeFile(temp, JSON.stringify(data), 'utf8')
  await rename(temp, file())
}

export async function hasSecret(name: SecretName): Promise<boolean> {
  return Boolean((await readAll())[name])
}

export async function getSecret(name: SecretName): Promise<string | null> {
  const encrypted = (await readAll())[name]
  if (!encrypted) return null
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
}

export async function setSecret(name: SecretName, value: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O cofre do sistema não está disponível; a chave não foi salva.')
  }
  const data = await readAll()
  data[name] = safeStorage.encryptString(value).toString('base64')
  await writeAll(data)
}

export async function removeSecret(name: SecretName): Promise<void> {
  const data = await readAll()
  delete data[name]
  await writeAll(data)
}
