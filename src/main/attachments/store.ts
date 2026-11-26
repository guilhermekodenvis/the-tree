// Anexos do chat: imagens coladas (Ctrl+V), arquivos escolhidos ou arrastados.
// Cada anexo é copiado para <dados do app>/attachments, para continuar existindo
// mesmo que o original mude ou seja apagado, e para o agente poder lê-lo pelo
// caminho. A tela vê as miniaturas pelo endereço tree-attachment://, que só serve
// arquivos desta pasta.
import { app, net, protocol } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Attachment } from '../../shared/types'

/** Maior arquivo aceito como anexo. */
const MAX_BYTES = 25 * 1024 * 1024
export const ATTACHMENT_SCHEME = 'tree-attachment'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json'
}

/** Imagens que os agentes conseguem "ver" (não só ler pelo caminho). */
const VIEWABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export function attachmentsDir(): string {
  return join(app.getPath('userData'), 'attachments')
}

function describe(path: string, name: string, size: number): Attachment {
  const mime = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
  const parts = relative(attachmentsDir(), path).split(sep).map(encodeURIComponent)
  return {
    name,
    path,
    mime,
    size,
    kind: VIEWABLE.has(mime) ? 'image' : 'file',
    url: `${ATTACHMENT_SCHEME}://file/${parts.join('/')}`
  }
}

/** Nome seguro para o disco, mantendo a extensão. */
function safeName(name: string): string {
  const clean = basename(name)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .slice(-120)
  return clean || 'anexo'
}

/** Pasta própria de cada anexo (evita colisão de nomes iguais). */
async function slot(name: string): Promise<string> {
  const dir = join(attachmentsDir(), randomUUID())
  await mkdir(dir, { recursive: true })
  return join(dir, safeName(name))
}

/** Guarda bytes recebidos da tela (imagem colada, arquivo arrastado). */
export async function saveBytes(name: string, bytes: Uint8Array): Promise<Attachment> {
  if (bytes.byteLength > MAX_BYTES) throw new Error(`"${name}" passa de 25 MB.`)
  const target = await slot(name)
  await writeFile(target, bytes)
  return describe(target, safeName(name), bytes.byteLength)
}

/** Copia arquivos escolhidos no seletor do Windows. */
export async function copyFiles(paths: string[]): Promise<Attachment[]> {
  const result: Attachment[] = []
  for (const source of paths) {
    const info = await stat(source)
    if (!info.isFile()) continue
    if (info.size > MAX_BYTES) throw new Error(`"${basename(source)}" passa de 25 MB.`)
    const target = await slot(basename(source))
    await copyFile(source, target)
    result.push(describe(target, safeName(basename(source)), info.size))
  }
  return result
}

/** Confere que o caminho é de um anexo guardado pelo app (e não um arquivo qualquer). */
export function isAttachment(path: string): boolean {
  const rel = relative(attachmentsDir(), resolve(path))
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !rel.includes(`:`)
}

/** Antes do app ficar pronto: o endereço tree-attachment:// é tratado como seguro. */
export function registerAttachmentScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ATTACHMENT_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true }
    }
  ])
}

/** Serve as miniaturas: tree-attachment://file/<pasta>/<arquivo>, só desta pasta. */
export function serveAttachments(): void {
  protocol.handle(ATTACHMENT_SCHEME, (request) => {
    const { pathname } = new URL(request.url)
    const target = resolve(attachmentsDir(), decodeURIComponent(pathname).replace(/^\/+/, ''))
    if (!isAttachment(target)) return new Response('Não encontrado', { status: 404 })
    return net.fetch(pathToFileURL(target).toString())
  })
}
