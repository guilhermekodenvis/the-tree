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

/** Uma conversa de um agente dentro de um projeto, com um processo ativo. */
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
  /** O agente usou uma ferramenta (ler arquivo, rodar comando...). O mesmo id atualiza a linha. */
  | { type: 'tool'; sessionId: string; id: string; name: string; detail: string }
  /** O agente pede autorização para uma ação; responda com agents.respond. */
  | { type: 'permission'; sessionId: string; requestId: string; title: string; detail: string }
  /** Um pedido de autorização deixou de valer sem resposta (ex.: o turno foi cancelado). */
  | { type: 'permission-cancelled'; sessionId: string; requestId: string }
  /** Aviso neutro na conversa (ex.: "Resposta interrompida."). */
  | { type: 'note'; sessionId: string; message: string }
  | { type: 'status'; sessionId: string; status: SessionStatus }
  | { type: 'error'; sessionId: string; message: string }
  /** Identificador que o agente usa para retomar esta conversa depois. Não aparece na tela. */
  | { type: 'resume-id'; sessionId: string; resumeId: string }

export type PermissionState = 'pending' | 'allowed' | 'denied' | 'cancelled'

/** Um item da conversa como aparece na tela (e como fica salvo no histórico). */
export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; detail: string }
  | { kind: 'permission'; id: string; title: string; detail: string; state: PermissionState }
  | { kind: 'note'; id: string; text: string }
  | { kind: 'error'; id: string; text: string }

/** Conversa salva de um projeto. Há no máximo uma por projeto. */
export interface ChatRecord {
  agent: AgentId
  items: ChatItem[]
  /** Usado para o agente retomar a conversa com a memória do que já foi dito. */
  resumeId?: string
  updatedAt: number
}

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

/** Mudanças no disco dentro de um projeto observado. Caminhos relativos ao projeto. */
export interface FilesChanged {
  projectId: string
  /** Pastas cujo conteúdo mudou ('' é a raiz). */
  dirs: string[]
  /** Arquivos ou pastas que foram criados, alterados ou apagados. */
  paths: string[]
  /** Verdadeiro quando houve mudanças demais para listar: recarregue tudo. */
  all: boolean
}

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
    /** Passa a avisar (onChanged) sobre mudanças no disco deste projeto. */
    watch(projectId: string): Promise<void>
    unwatch(projectId: string): Promise<void>
    onChanged(listener: (change: FilesChanged) => void): () => void
  }
  agents: {
    /** Conversa salva do projeto, se houver. Não inicia nenhum processo. */
    history(projectId: string): Promise<ChatRecord | null>
    /**
     * Inicia o agente no projeto. Com `resume`, continua a conversa salva
     * (se for do mesmo agente); sem, começa uma nova.
     */
    start(projectId: string, agent: AgentId, resume: boolean): Promise<AgentSession>
    send(sessionId: string, message: string): Promise<void>
    /** Responde a um pedido de autorização (evento 'permission'). */
    respond(sessionId: string, requestId: string, allow: boolean): Promise<void>
    /** Interrompe a resposta em andamento; a conversa continua aberta. */
    interrupt(sessionId: string): Promise<void>
    stop(sessionId: string): Promise<void>
    /** Encerra a conversa do projeto e apaga o histórico salvo. */
    forget(projectId: string): Promise<void>
    /** Devolve uma função para cancelar a escuta. */
    onEvent(listener: (event: AgentEvent) => void): () => void
  }
}
