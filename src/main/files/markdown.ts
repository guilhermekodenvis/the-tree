// Leitura de arquivos Markdown (.md, .mdx) citados nas conversas, para o leitor
// ao lado do chat. Diferente do resto do app, o arquivo pode estar fora da pasta
// do projeto (os agentes às vezes escrevem numa pasta vizinha), mas só arquivos
// Markdown são aceitos, e só para leitura.
import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import * as projects from '../projects/store'

const MAX_BYTES = 2 * 1024 * 1024
export const MARKDOWN_EXT = /\.(md|mdx|markdown)$/i

export interface MarkdownFile {
  /** Caminho completo do arquivo. */
  path: string
  content: string
}

/**
 * Converte o que veio no link para um caminho do disco:
 * "file:///C:/x.md", "/C:/x.md", "C:\x.md", "x.md#L10", "docs/x.md" (relativo).
 */
function normalize(raw: string): string {
  let path = raw.trim()
  try {
    path = decodeURI(path)
  } catch {
    // Sem codificação de URL: usa como veio.
  }
  path = path.replace(/^file:\/\/\/?/i, '')
  // Âncora ou linha no fim ("#L10", ":12") não fazem parte do nome.
  path = path.replace(/#.*$/, '').replace(/:(\d+)(:\d+)?$/, '')
  // "/C:/..." (estilo URL) vira "C:/...".
  if (/^\/[A-Za-z]:[\\/]/.test(path)) path = path.slice(1)
  return path
}

/**
 * Lê um arquivo Markdown. Caminho relativo é resolvido a partir de `base` (o
 * arquivo que está aberto no leitor) ou, sem ele, da pasta do projeto.
 */
export async function readMarkdown(
  projectId: string,
  raw: string,
  base?: string
): Promise<MarkdownFile> {
  const path = normalize(raw)
  if (!MARKDOWN_EXT.test(path)) throw new Error('O leitor abre só arquivos .md e .mdx.')

  let full = path
  if (!isAbsolute(path)) {
    const project = await projects.get(projectId)
    const from = base ? dirname(base) : project?.path
    if (!from) throw new Error('Não sei a partir de onde procurar este arquivo.')
    full = resolve(from, path)
  }

  const info = await stat(full).catch(() => null)
  if (!info?.isFile()) throw new Error(`Arquivo não encontrado: ${full}`)
  if (info.size > MAX_BYTES)
    throw new Error('O arquivo é grande demais para o leitor (mais de 2 MB).')
  return { path: full, content: await readFile(full, 'utf8') }
}
