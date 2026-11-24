// Lista de projetos do usuário.
// TODO: persistir em disco (ex.: JSON em app.getPath('userData')). Por ora fica só em memória.
import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { Project } from '../../shared/types'

const projects = new Map<string, Project>()

export async function list(): Promise<Project[]> {
  return [...projects.values()]
}

export async function get(id: string): Promise<Project | undefined> {
  return projects.get(id)
}

export async function add(path: string): Promise<Project> {
  const project: Project = { id: randomUUID(), name: basename(path), path }
  projects.set(project.id, project)
  return project
}

export async function remove(id: string): Promise<void> {
  projects.delete(id)
}
