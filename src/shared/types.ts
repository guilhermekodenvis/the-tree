// Tipos compartilhados entre o processo principal e a interface.
// Este arquivo é o "contrato" do app: mudar aqui muda os dois lados.

export type AgentId = 'claude' | 'codex' | 'gemini'

export interface Project {
  id: string
  /** Nome mostrado no app. Começa igual ao da pasta, mas pode ser trocado. */
  name: string
  /** Pasta do projeto no disco. */
  path: string
  /** Grupo do projeto; null = "Sem grupo". */
  groupId: string | null
}

/** Grupo de projetos, só para organizar a tela de projetos. */
export interface ProjectGroup {
  id: string
  name: string
}

/** Projetos e grupos, cada lista na ordem escolhida. */
export interface ProjectsData {
  projects: Project[]
  groups: ProjectGroup[]
}

export type SessionStatus = 'idle' | 'running' | 'waiting' | 'error'

/** Processo ativo de um agente, atendendo uma conversa. */
export interface AgentSession {
  id: string
  projectId: string
  conversationId: string
  agent: AgentId
  status: SessionStatus
}

/** Uma conversa com um agente, dentro de um projeto. Um projeto pode ter várias. */
export interface Conversation {
  id: string
  projectId: string
  agent: AgentId
  name: string
  /** Bypass: os pedidos de autorização são aprovados sozinhos, sem perguntar. */
  bypass: boolean
  /** Modelo e esforço escolhidos (já com os padrões do agente aplicados). */
  settings: AgentSettings
}

/** Modelo e nível de esforço de uma conversa. null = o agente não oferece a escolha. */
export interface AgentSettings {
  model: string | null
  effort: string | null
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
  /** Um pedido de autorização foi respondido sem você (bypass ligado). */
  | { type: 'permission-resolved'; sessionId: string; requestId: string; state: PermissionState }
  /** Aviso neutro na conversa (ex.: "Resposta interrompida."). */
  | { type: 'note'; sessionId: string; message: string }
  | { type: 'status'; sessionId: string; status: SessionStatus }
  | { type: 'error'; sessionId: string; message: string }
  /** Identificador que o agente usa para retomar esta conversa depois. Não aparece na tela. */
  | { type: 'resume-id'; sessionId: string; resumeId: string }

/** 'auto': aprovado sozinho porque o bypass da conversa estava ligado. */
export type PermissionState = 'pending' | 'allowed' | 'denied' | 'cancelled' | 'auto'

/** Um item da conversa como aparece na tela (e como fica salvo no histórico). */
export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; detail: string }
  | { kind: 'permission'; id: string; title: string; detail: string; state: PermissionState }
  | { kind: 'note'; id: string; text: string }
  | { kind: 'error'; id: string; text: string }

/** Conversa como fica salva no disco. */
export interface ConversationRecord {
  id: string
  agent: AgentId
  name: string
  items: ChatItem[]
  /** Usado para o agente retomar a conversa com a memória do que já foi dito. */
  resumeId?: string
  /** Bypass ligado (ver Conversation.bypass). Ausente em conversas antigas = desligado. */
  bypass?: boolean
  /** Modelo e esforço escolhidos. Ausente em conversas antigas = padrão do agente. */
  settings?: Partial<AgentSettings>
  createdAt: number
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
    list(): Promise<ProjectsData>
    /**
     * Abre o seletor de pastas do sistema e adiciona a pasta escolhida ao grupo
     * indicado (null = "Sem grupo"). Devolve null se o usuário cancelar.
     */
    pick(groupId: string | null): Promise<Project | null>
    add(path: string, groupId?: string | null): Promise<Project>
    remove(id: string): Promise<void>
    /** Troca o nome mostrado no app; a pasta no disco não muda. */
    rename(id: string, name: string): Promise<void>
    /** Põe o projeto em outro grupo (null = "Sem grupo"). */
    move(id: string, groupId: string | null): Promise<void>
  }
  groups: {
    /** Sem nome, cria "Novo grupo" (numerado se já existir). */
    create(name?: string): Promise<ProjectGroup>
    rename(id: string, name: string): Promise<void>
    /** Apaga o grupo; os projetos dele vão para "Sem grupo". */
    remove(id: string): Promise<void>
    reorder(ids: string[]): Promise<void>
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
  settings: {
    /**
     * Chave de API do Gemini. A interface nunca recebe a chave de volta:
     * só pergunta se existe, grava uma nova ou apaga.
     */
    geminiKey: {
      has(): Promise<boolean>
      set(key: string): Promise<void>
      remove(): Promise<void>
    }
  }
  conversations: {
    /** Conversas do projeto, na ordem escolhida. Não inicia nenhum processo. */
    list(projectId: string): Promise<Conversation[]>
    /** Itens já trocados numa conversa (histórico salvo). */
    items(projectId: string, conversationId: string): Promise<ChatItem[]>
    /** Cria uma conversa vazia; o agente só é iniciado na primeira mensagem. */
    create(projectId: string, agent: AgentId): Promise<Conversation>
    rename(projectId: string, conversationId: string, name: string): Promise<void>
    /** Encerra o agente da conversa (se estiver rodando) e apaga o histórico dela. */
    remove(projectId: string, conversationId: string): Promise<void>
    /** Grava a nova ordem; `ids` traz as conversas do projeto na ordem desejada. */
    reorder(projectId: string, ids: string[]): Promise<void>
    /**
     * Liga ou desliga o bypass da conversa. Ao ligar, pedidos que já estavam
     * esperando resposta também são aprovados.
     */
    setBypass(projectId: string, conversationId: string, on: boolean): Promise<void>
    /**
     * Troca o modelo e/ou o esforço da conversa. Com o agente rodando, vale a
     * partir da próxima mensagem. Devolve o que ficou valendo.
     */
    setSettings(
      projectId: string,
      conversationId: string,
      settings: Partial<AgentSettings>
    ): Promise<AgentSettings>
    /** Encerra e apaga todas as conversas do projeto (usado ao remover o projeto). */
    removeAll(projectId: string): Promise<void>
  }
  agents: {
    /** Inicia o agente de uma conversa, retomando o que já foi dito nela. */
    start(projectId: string, conversationId: string): Promise<AgentSession>
    send(sessionId: string, message: string): Promise<void>
    /** Responde a um pedido de autorização (evento 'permission'). */
    respond(sessionId: string, requestId: string, allow: boolean): Promise<void>
    /** Interrompe a resposta em andamento; a conversa continua aberta. */
    interrupt(sessionId: string): Promise<void>
    stop(sessionId: string): Promise<void>
    /** Devolve uma função para cancelar a escuta. */
    onEvent(listener: (event: AgentEvent) => void): () => void
  }
}
