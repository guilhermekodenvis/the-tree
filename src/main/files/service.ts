// Leitura e escrita de arquivos para a interface.
// Todo caminho é relativo à pasta de um projeto cadastrado, e é conferido antes de
// qualquer acesso: a interface não consegue ler nem gravar fora dos projetos.
import { open, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { FileContent, FileEntry } from '../../shared/types'
import * as projects from '../projects/store'

/** Acima disso o arquivo não é carregado no visualizador. */
const MAX_TEXT_BYTES = 1024 * 1024

/** Pastas que nunca aparecem na árvore. */
const HIDDEN = new Set(['.git'])

function assertInside(root: string, target: string): void {
  const rel = relative(root, target)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('Caminho fora da pasta do projeto')
  }
}

/**
 * Converte um caminho relativo do projeto em caminho absoluto, garantindo que
 * ele fica dentro do projeto mesmo depois de resolver atalhos (symlinks).
 */
async function locate(
  projectId: string,
  relPath: string,
  mustExist = true
): Promise<{ root: string; target: string }> {
  const project = await projects.get(projectId)
  if (!project) throw new Error(`Projeto não encontrado: ${projectId}`)

  const root = await realpath(project.path)
  const target = resolve(root, relPath)
  assertInside(root, target)

  // Um atalho dentro do projeto pode apontar para fora; confere o destino real.
  // Para um arquivo que ainda vai ser criado, confere a pasta onde ele vai ficar.
  const real = await realpath(mustExist ? target : dirname(target))
  assertInside(root, real)

  return { root, target }
}

export async function list(projectId: string, dir: string): Promise<FileEntry[]> {
  const { root, target } = await locate(projectId, dir)
  const entries = await readdir(target, { withFileTypes: true })

  return entries
    .filter((entry) => !HIDDEN.has(entry.name))
    .map((entry) => ({
      name: entry.name,
      path: relative(root, join(target, entry.name)).split(sep).join('/'),
      isDirectory: entry.isDirectory()
    }))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })
}

export async function read(projectId: string, path: string): Promise<FileContent> {
  const { target } = await locate(projectId, path).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Este arquivo não existe mais.')
    throw err
  })
  const info = await stat(target)
  if (!info.isFile()) throw new Error('Não é um arquivo')
  if (info.size > MAX_TEXT_BYTES) return { kind: 'too-large', size: info.size }

  // Um byte nulo no começo é o sinal usual de arquivo binário (imagem, executável).
  const handle = await open(target, 'r')
  try {
    const sample = Buffer.alloc(Math.min(info.size, 8192))
    await handle.read(sample, 0, sample.length, 0)
    if (sample.includes(0)) return { kind: 'binary', size: info.size }
  } finally {
    await handle.close()
  }

  return { kind: 'text', content: await readFile(target, 'utf8') }
}

export async function write(projectId: string, path: string, content: string): Promise<void> {
  const { target } = await locate(projectId, path, false)
  await writeFile(target, content, 'utf8')
}
