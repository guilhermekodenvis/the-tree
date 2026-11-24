// Leitura e escrita de arquivos para o editor da interface.
// TODO: restringir os caminhos às pastas dos projetos cadastrados antes de usar de verdade.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FileEntry } from '../../shared/types'

export async function list(dir: string): Promise<FileEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.map((entry) => ({
    name: entry.name,
    path: join(dir, entry.name),
    isDirectory: entry.isDirectory()
  }))
}

export async function read(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

export async function write(path: string, content: string): Promise<void> {
  await writeFile(path, content, 'utf8')
}
