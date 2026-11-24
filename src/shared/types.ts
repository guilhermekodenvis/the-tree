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
  /** Pedaço de texto da resposta. Pedaços com a mesma `key` formam um mesmo bloco. */
  | { type: 'text'; sessionId: string; key: string; text: string }
  /** O agente começou a usar uma ferramenta (ler arquivo, rodar comando...). */
  | { type: 'tool'; sessionId: string; id: string; name: string; detail: string }
  /** O agente pede autorização para uma ação; responda com agents.respond. */
  | { type: 'permission'; sessionId: string; requestId: string; title: string; detail: string }
  /** Um pedido de autorização deixou de valer sem resposta (ex.: o turno foi cancelado). */
  | { type: 'permission-cancelled'; sessionId: string; requestId: string }
  | { type: 'status'; sessionId: string; status: SessionStatus }
  | { type: 'error'; sessionId: string; message: string }

export interface FileEntry {
  name: string
  /** Caminho relativo à pasta do projeto, com "/" como separador. */
  path: string
  isDirectory: boolean
}

/** Resultado de abrir um arquivo: só texto de tamanho razoável é carregado. */
export type FileContent =
  | { kind: 'text'; content: string }
  | { kind: 'binary'; size: number }
  | { kind: 'too-large'; size: number }

/** API que a interface enxerga em `window.api` (implementada no preload). */
export interface TreeApi {
  projects: {
    list(): Promise<Project[]>
    /** Abre o seletor de pastas do sistema. Devolve null se o usuário cancelar. */
    pick(): Promise<Project | null>
    add(path: string): Promise<Project>
    remove(id: string): Promise<void>
  }
  files: {
    // Os caminhos são sempre relativos à pasta do projeto ('' é a raiz).
    list(projectId: string, dir: string): Promise<FileEntry[]>
    read(projectId: string, path: string): Promise<FileContent>
    write(projectId: string, path: string, content: string): Promise<void>
  }
  agents: {
    start(projectId: string, agent: AgentId): Promise<AgentSession>
    send(sessionId: string, message: string): Promise<void>
    /** Responde a um pedido de autorização (evento 'permission'). */
    respond(sessionId: string, requestId: string, allow: boolean): Promise<void>
    stop(sessionId: string): Promise<void>
    /** Devolve uma função para cancelar a escuta. */
    onEvent(listener: (event: AgentEvent) => void): () => void
  }
}
