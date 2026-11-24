// Lista de projetos do usuário, guardada em projects.json na pasta de dados do app
// (no Windows: %APPDATA%\the-tree). Remover um projeto só o tira da lista;
// a pasta no disco nunca é tocada.
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { Project } from '../../shared/types'

let cache: Project[] | null = null

function storeFile(): string {
  return join(app.getPath('userData'), 'projects.json')
}

async function load(): Promise<Project[]> {
  if (cache) return cache
  try {
    const parsed: unknown = JSON.parse(await readFile(storeFile(), 'utf8'))
    cache = Array.isArray(parsed) ? (parsed as Project[]) : []
  } catch (err) {
    // Arquivo ainda não existe na primeira execução. Qualquer outro erro sobe,
    // para não sobrescrever uma lista que não conseguimos ler.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    cache = []
  }
  return cache
}

async function save(projects: Project[]): Promise<void> {
  const file = storeFile()
  await mkdir(dirname(file), { recursive: true })
  // Escreve num temporário e renomeia, para nunca deixar o arquivo pela metade.
  const temp = `${file}.tmp`
  await writeFile(temp, JSON.stringify(projects, null, 2), 'utf8')
  await rename(temp, file)
  cache = projects
}

function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

export async function list(): Promise<Project[]> {
  return [...(await load())]
}

export async function get(id: string): Promise<Project | undefined> {
  return (await load()).find((project) => project.id === id)
}

export async function add(path: string): Promise<Project> {
  const fullPath = resolve(path)
  const info = await stat(fullPath).catch(() => null)
  if (!info?.isDirectory()) throw new Error(`Não é uma pasta: ${fullPath}`)

  const projects = await load()
  // Adicionar a mesma pasta duas vezes devolve o projeto que já existe.
  const existing = projects.find((project) => samePath(project.path, fullPath))
  if (existing) return existing

  const project: Project = {
    id: randomUUID(),
    name: basename(fullPath) || fullPath,
    path: fullPath
  }
  await save([...projects, project])
  return project
}

export async function remove(id: string): Promise<void> {
  const projects = await load()
  await save(projects.filter((project) => project.id !== id))
}
