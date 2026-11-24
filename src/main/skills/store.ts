// Skills do usuário, guardadas em skills.json na pasta de dados do app.
//
// Uma skill é uma pasta com SKILL.md (o formato do Claude Code) ou um arquivo .md
// solto. O app só guarda onde ela está: o conteúdo é lido do disco na hora de usar,
// então editar o arquivo vale na próxima mensagem. Remover uma skill do app nunca
// apaga nada do disco.
//
// Skill global (projectId null) pode ser usada em qualquer projeto e "importada"
// para a aba Skills de um projeto. Skill local pertence a um projeto só e nunca
// aparece nos outros.
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import type { ProjectSkills, Skill } from '../../shared/types'

interface StoredSkill {
  id: string
  path: string
  projectId: string | null
}

interface SkillsData {
  skills: StoredSkill[]
  /** Skills globais importadas por projeto, na ordem em que foram importadas. */
  imports: Record<string, string[]>
}

/** Conteúdo pronto para mandar ao agente. */
export interface SkillContent {
  name: string
  /** Arquivo com as instruções (SKILL.md ou o .md solto). */
  file: string
  /** Pasta onde ficam os arquivos auxiliares da skill. */
  dir: string
  body: string
}

const SKILL_FILE = 'SKILL.md'
/** Limite do texto da skill enviado ao agente, para não estourar o contexto. */
const MAX_BODY = 200_000

let cache: SkillsData | null = null

function storeFile(): string {
  return join(app.getPath('userData'), 'skills.json')
}

async function load(): Promise<SkillsData> {
  if (cache) return cache
  try {
    const parsed = JSON.parse(await readFile(storeFile(), 'utf8')) as Partial<SkillsData>
    cache = {
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      imports: parsed.imports && typeof parsed.imports === 'object' ? parsed.imports : {}
    }
  } catch (err) {
    // Arquivo ainda não existe na primeira vez. Outro erro sobe, para não
    // sobrescrever uma lista que não conseguimos ler.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    cache = { skills: [], imports: {} }
  }
  return cache
}

async function save(data: SkillsData): Promise<void> {
  const file = storeFile()
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  await writeFile(temp, JSON.stringify(data, null, 2), 'utf8')
  await rename(temp, file)
  cache = data
}

function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** Arquivo de instruções: SKILL.md dentro da pasta, ou o próprio arquivo. */
function instructionsOf(path: string): string {
  return /\.(md|markdown|txt)$/i.test(path) ? path : join(path, SKILL_FILE)
}

/** Lê o cabeçalho `---` do Markdown (name, description). Aceita valores em várias linhas. */
function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!match) return { meta: {}, body: text }
  const meta: Record<string, string> = {}
  const lines = match[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const field = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i])
    if (!field) continue
    let value = field[2].trim()
    // "description: >" ou "|": o texto vem nas linhas recuadas seguintes.
    if (value === '' || /^[>|][+-]?$/.test(value)) {
      const parts: string[] = []
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push(lines[++i].trim())
      value = parts.join(' ')
    }
    meta[field[1]] = value.replace(/^(['"])(.*)\1$/, '$2')
  }
  return { meta, body: text.slice(match[0].length) }
}

/** Nome sem extensão de um arquivo solto; nome da pasta para SKILL.md. */
function fallbackName(path: string): string {
  const file = instructionsOf(path)
  return file === path ? basename(path, extname(path)) : basename(path)
}

async function describe(stored: StoredSkill): Promise<Skill> {
  const base = { id: stored.id, path: stored.path, projectId: stored.projectId }
  try {
    const { meta } = parseFrontmatter(await readFile(instructionsOf(stored.path), 'utf8'))
    return {
      ...base,
      name: meta.name || fallbackName(stored.path),
      description: meta.description ?? '',
      missing: false
    }
  } catch {
    return { ...base, name: fallbackName(stored.path), description: '', missing: true }
  }
}

const byName = (a: Skill, b: Skill): number => a.name.localeCompare(b.name, 'pt-BR')

export async function listGlobal(): Promise<Skill[]> {
  const data = await load()
  const skills = await Promise.all(data.skills.filter((s) => s.projectId === null).map(describe))
  return skills.sort(byName)
}

export async function listProject(projectId: string): Promise<ProjectSkills> {
  const data = await load()
  const own = await Promise.all(data.skills.filter((s) => s.projectId === projectId).map(describe))
  const globals = new Map(data.skills.filter((s) => s.projectId === null).map((s) => [s.id, s]))
  const imported = await Promise.all(
    (data.imports[projectId] ?? []).flatMap((id) => {
      const stored = globals.get(id)
      return stored ? [describe(stored)] : []
    })
  )
  return { own: own.sort(byName), imported: imported.sort(byName) }
}

/**
 * Skills que uma conversa do projeto pode usar: as do projeto, as globais
 * importadas e depois as demais globais. Nunca as locais de outro projeto.
 */
export async function available(projectId: string): Promise<Skill[]> {
  const { own, imported } = await listProject(projectId)
  const seen = new Set(imported.map((s) => s.id))
  const others = (await listGlobal()).filter((s) => !seen.has(s.id))
  return [...own, ...imported, ...others].filter((s) => !s.missing)
}

/** Pastas com SKILL.md dentro da pasta escolhida (ela mesma, ou as subpastas diretas). */
async function skillFolders(dir: string): Promise<string[]> {
  if (await isFile(join(dir, SKILL_FILE))) return [dir]
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const found: string[] = []
  for (const entry of entries) {
    if (entry.isDirectory() && (await isFile(join(dir, entry.name, SKILL_FILE)))) {
      found.push(join(dir, entry.name))
    }
  }
  return found
}

async function isFile(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isFile() === true
}

/**
 * Adiciona skills a partir de um caminho escolhido pelo usuário.
 * - Pasta com SKILL.md: uma skill.
 * - Pasta cujas subpastas têm SKILL.md (ex.: ~/.claude/skills): uma skill por subpasta.
 * - Arquivo .md: uma skill; um SKILL.md vale pela pasta dele (com os arquivos auxiliares).
 * Adicionar o mesmo caminho de novo no mesmo lugar devolve a skill que já existe.
 */
export async function add(path: string, projectId: string | null): Promise<Skill[]> {
  const full = resolve(path)
  const info = await stat(full).catch(() => null)
  if (!info) throw new Error(`Não encontrei: ${full}`)

  let paths: string[]
  if (info.isDirectory()) {
    paths = await skillFolders(full)
    if (paths.length === 0) {
      throw new Error(`A pasta não tem um ${SKILL_FILE} (nem subpastas com um): ${full}`)
    }
  } else {
    if (!/\.(md|markdown|txt)$/i.test(full)) {
      throw new Error('Escolha um arquivo de texto com as instruções da skill (.md).')
    }
    paths = [basename(full).toUpperCase() === SKILL_FILE.toUpperCase() ? dirname(full) : full]
  }

  const data = await load()
  const result: StoredSkill[] = []
  const added: StoredSkill[] = []
  for (const p of paths) {
    const existing = [...data.skills, ...added].find(
      (s) => s.projectId === projectId && samePath(s.path, p)
    )
    if (existing) {
      result.push(existing)
      continue
    }
    const stored: StoredSkill = { id: randomUUID(), path: p, projectId }
    added.push(stored)
    result.push(stored)
  }
  if (added.length > 0) await save({ ...data, skills: [...data.skills, ...added] })
  return Promise.all(result.map(describe))
}

/** Tira a skill do app (o arquivo no disco fica). Uma global sai de todos os projetos. */
export async function remove(id: string): Promise<void> {
  const data = await load()
  const imports = Object.fromEntries(
    Object.entries(data.imports).map(([project, ids]) => [project, ids.filter((i) => i !== id)])
  )
  await save({ skills: data.skills.filter((s) => s.id !== id), imports })
}

export async function importToProject(projectId: string, skillId: string): Promise<void> {
  const data = await load()
  if (!data.skills.some((s) => s.id === skillId && s.projectId === null)) {
    throw new Error('Esta skill global não existe mais.')
  }
  const current = data.imports[projectId] ?? []
  if (current.includes(skillId)) return
  await save({ ...data, imports: { ...data.imports, [projectId]: [...current, skillId] } })
}

export async function removeFromProject(projectId: string, skillId: string): Promise<void> {
  const data = await load()
  const current = data.imports[projectId] ?? []
  await save({
    ...data,
    imports: { ...data.imports, [projectId]: current.filter((id) => id !== skillId) }
  })
}

/** Ao remover um projeto: some com as skills locais e as importações dele. */
export async function removeProject(projectId: string): Promise<void> {
  const data = await load()
  const { [projectId]: _removed, ...imports } = data.imports
  await save({ skills: data.skills.filter((s) => s.projectId !== projectId), imports })
}

/**
 * Lê as skills escolhidas para uma mensagem. Só aceita globais e locais do
 * próprio projeto: uma skill de outro projeto é recusada.
 */
export async function contents(projectId: string, ids: string[]): Promise<SkillContent[]> {
  const data = await load()
  const result: SkillContent[] = []
  for (const id of ids) {
    const stored = data.skills.find((s) => s.id === id)
    if (!stored || (stored.projectId !== null && stored.projectId !== projectId)) {
      throw new Error('Esta skill não está disponível neste projeto.')
    }
    const file = instructionsOf(stored.path)
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch {
      throw new Error(`Não consegui ler a skill em ${file}. Ela foi movida ou apagada?`)
    }
    const { meta, body } = parseFrontmatter(text)
    result.push({
      name: meta.name || fallbackName(stored.path),
      file,
      dir: file === stored.path ? dirname(file) : stored.path,
      body: body.trim().slice(0, MAX_BODY)
    })
  }
  return result
}
