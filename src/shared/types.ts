// Tipos compartilhados entre o processo principal e a interface.
// Este arquivo é o "contrato" do app: mudar aqui muda os dois lados.

export type AgentId = 'claude' | 'codex' | 'gemini'

export interface Project {
  id: string
  name: string
  /** Pasta do projeto no disco. */
  path: string
}

export type SessionStatus = 'idle' | 'running' | 'waiting' | 'error'

/** Uma conversa de um agente dentro de um projeto. */
export interface AgentSession {
  id: string
  projectId: string
  agent: AgentId
  status: SessionStatus
}

/** O que um agente emite enquanto trabalha. */
export type AgentEvent =
  | { type: 'text'; sessionId: string; text: string }
  | { type: 'status'; sessionId: string; status: SessionStatus }
  | { type: 'file-changed'; sessionId: string; path: string }

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
}

/** API que a interface enxerga em `window.api` (implementada no preload). */
export interface TreeApi {
  projects: {
    list(): Promise<Project[]>
    add(path: string): Promise<Project>
    remove(id: string): Promise<void>
  }
  files: {
    list(dir: string): Promise<FileEntry[]>
    read(path: string): Promise<string>
    write(path: string, content: string): Promise<void>
  }
  agents: {
    start(projectId: string, agent: AgentId): Promise<AgentSession>
    send(sessionId: string, message: string): Promise<void>
    stop(sessionId: string): Promise<void>
    /** Devolve uma função para cancelar a escuta. */
    onEvent(listener: (event: AgentEvent) => void): () => void
  }
}
