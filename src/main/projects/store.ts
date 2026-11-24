// Projetos e grupos de projetos do usuário, guardados em projects.json na pasta
// de dados do app (no Windows: %APPDATA%\the-tree). Remover um projeto só o tira
// da lista; a pasta no disco nunca é tocada. O nome do projeto começa igual ao da
// pasta, mas pode ser trocado sem mexer na pasta.
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { Project, ProjectGroup, ProjectsData } from '../../shared/types'

const MAX_NAME = 80

let cache: ProjectsData | null = null

function storeFile(): string {
  return join(app.getPath('userData'), 'projects.json')
}

/** O formato antigo era só a lista de projetos, sem grupos. */
function migrate(parsed: unknown): ProjectsData {
  if (Array.isArray(parsed)) {
    return { projects: (parsed as Project[]).map((p) => ({ ...p, groupId: null })), groups: [] }
  }
  const data = parsed as Partial<ProjectsData>
  const groups = Array.isArray(data.groups) ? data.groups : []
  const ids = new Set(groups.map((g) => g.id))
  const projects = (Array.isArray(data.projects) ? data.projects : []).map((p) => ({
    ...p,
    // Grupo que não existe mais: o projeto volta para "Sem grupo".
    groupId: p.groupId && ids.has(p.groupId) ? p.groupId : null
  }))
  return { projects, groups }
}

async function load(): Promise<ProjectsData> {
  if (cache) return cache
  try {
    cache = migrate(JSON.parse(await readFile(storeFile(), 'utf8')))
  } catch (err) {
    // Arquivo ainda não existe na primeira execução. Qualquer outro erro sobe,
    // para não sobrescrever uma lista que não conseguimos ler.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    cache = { projects: [], groups: [] }
  }
  return cache
}

async function save(data: ProjectsData): Promise<void> {
  const file = storeFile()
  await mkdir(dirname(file), { recursive: true })
  // Escreve num temporário e renomeia, para nunca deixar o arquivo pela metade.
  const temp = `${file}.tmp`
  await writeFile(temp, JSON.stringify(data, null, 2), 'utf8')
  await rename(temp, file)
  cache = data
}

function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function cleanName(name: string): string {
  const clean = String(name ?? '').trim().slice(0, MAX_NAME)
  if (!clean) throw new Error('O nome não pode ficar vazio.')
  return clean
}

export async function list(): Promise<ProjectsData> {
  const data = await load()
  return { projects: [...data.projects], groups: [...data.groups] }
}

export async function get(id: string): Promise<Project | undefined> {
  return (await load()).projects.find((project) => project.id === id)
}

export async function add(path: string, groupId: string | null = null): Promise<Project> {
  const fullPath = resolve(path)
  const info = await stat(fullPath).catch(() => null)
  if (!info?.isDirectory()) throw new Error(`Não é uma pasta: ${fullPath}`)

  const data = await load()
  // Adicionar a mesma pasta duas vezes devolve o projeto que já existe.
  const existing = data.projects.find((project) => samePath(project.path, fullPath))
  if (existing) return existing

  const group = groupId && data.groups.some((g) => g.id === groupId) ? groupId : null
  const project: Project = {
    id: randomUUID(),
    name: basename(fullPath) || fullPath,
    path: fullPath,
    groupId: group
  }
  await save({ ...data, projects: [...data.projects, project] })
  return project
}

export async function remove(id: string): Promise<void> {
  const data = await load()
  await save({ ...data, projects: data.projects.filter((project) => project.id !== id) })
}

export async function renameProject(id: string, name: string): Promise<void> {
  const clean = cleanName(name)
  const data = await load()
  if (!data.projects.some((p) => p.id === id)) throw new Error('Este projeto não existe mais.')
  await save({
    ...data,
    projects: data.projects.map((p) => (p.id === id ? { ...p, name: clean } : p))
  })
}

/** Põe o projeto num grupo (null = "Sem grupo"), no fim da lista do grupo. */
export async function moveProject(id: string, groupId: string | null): Promise<void> {
  const data = await load()
  const project = data.projects.find((p) => p.id === id)
  if (!project) throw new Error('Este projeto não existe mais.')
  if (groupId !== null && !data.groups.some((g) => g.id === groupId)) {
    throw new Error('Este grupo não existe mais.')
  }
  if (project.groupId === groupId) return
  await save({
    ...data,
    projects: [...data.projects.filter((p) => p.id !== id), { ...project, groupId }]
  })
}

export async function createGroup(name?: string): Promise<ProjectGroup> {
  const data = await load()
  let clean = name?.trim().slice(0, MAX_NAME)
  if (!clean) {
    // Nome padrão numerado: "Novo grupo", "Novo grupo 2"...
    const used = new Set(data.groups.map((g) => g.name))
    let n = 1
    clean = 'Novo grupo'
    while (used.has(clean)) clean = `Novo grupo ${++n}`
  }
  const group: ProjectGroup = { id: randomUUID(), name: clean }
  await save({ ...data, groups: [...data.groups, group] })
  return group
}

export async function renameGroup(id: string, name: string): Promise<void> {
  const clean = cleanName(name)
  const data = await load()
  if (!data.groups.some((g) => g.id === id)) throw new Error('Este grupo não existe mais.')
  await save({ ...data, groups: data.groups.map((g) => (g.id === id ? { ...g, name: clean } : g)) })
}

/** Apaga o grupo; os projetos dele continuam, em "Sem grupo". */
export async function removeGroup(id: string): Promise<void> {
  const data = await load()
  await save({
    groups: data.groups.filter((g) => g.id !== id),
    projects: data.projects.map((p) => (p.groupId === id ? { ...p, groupId: null } : p))
  })
}

/** Grava a nova ordem dos grupos; `ids` traz todos os grupos na ordem desejada. */
export async function reorderGroups(ids: string[]): Promise<void> {
  const data = await load()
  const position = new Map(ids.map((id, index) => [id, index]))
  const groups = [...data.groups].sort(
    (a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity)
  )
  await save({ ...data, groups })
}
