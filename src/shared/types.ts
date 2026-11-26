// Tipos compartilhados entre o processo principal e a interface.
import type {
  Automation,
  AutomationRun,
  AutomationSummary,
  Connector,
  ConnectorInput,
  RunSummary
} from './automation'

// Este arquivo é o "contrato" do app: mudar aqui muda os dois lados.

export type AgentId = 'claude' | 'codex' | 'gemini'

/**
 * "Projeto" interno dos chats rápidos (menu lateral): conversas fora de qualquer
 * projeto, para tirar dúvidas ou tarefas rápidas. Não aparece na lista de projetos.
 */
export const QUICK_PROJECT_ID = '__quick'

/** Arquivo anexado a uma mensagem (copiado para a pasta de anexos do app). */
export interface Attachment {
  name: string
  /** Caminho completo da cópia guardada pelo app. */
  path: string
  mime: string
  size: number
  /** 'image': o agente recebe a imagem em si; 'file': recebe o caminho para ler. */
  kind: 'image' | 'file'
  /** Endereço para a tela mostrar a miniatura (tree-attachment://...). */
  url: string
}

/** Situação da atualização automática do app. */
export interface UpdateState {
  /** Versão instalada agora. */
  current: string
  /**
   * 'dev': modo de desenvolvimento (não atualiza); 'latest': já é a mais nova;
   * 'downloading': baixando `version`; 'ready': `version` baixada, falta reiniciar.
   */
  status: 'dev' | 'idle' | 'checking' | 'latest' | 'downloading' | 'ready' | 'error'
  version: string | null
  error: string | null
}

/** Conta de um agente, mostrada como conector. */
export type AccountId = 'claude' | 'codex' | 'gemini'

export interface AccountStatus {
  id: AccountId
  connected: boolean
  /** Ex.: e-mail e plano da conta, ou "Chave de API salva". */
  detail: string | null
  /** Não foi possível conferir (ex.: o CLI não respondeu). */
  error?: string
}

/**
 * Conectores que viram ferramentas dos agentes (Claude e ChatGPT): ligados, aparecem
 * para o agente em qualquer conversa, chat rápido ou automação.
 */
export type ToolConnectorId = 'maps' | 'browser'

export interface ToolConnectorStatus {
  id: ToolConnectorId
  connected: boolean
  /** Ex.: "Chave de API salva". */
  detail: string | null
}

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

/**
 * Skill: instruções que o agente segue para fazer um tipo de tarefa. É uma pasta
 * com SKILL.md ou um arquivo .md solto; o app só guarda onde ela está.
 */
export interface Skill {
  id: string
  /** Do cabeçalho do SKILL.md (name); sem ele, o nome da pasta ou do arquivo. */
  name: string
  description: string
  /** Pasta da skill (com SKILL.md) ou o arquivo .md. */
  path: string
  /** null = global (vale em todos os projetos); senão, o projeto dono. */
  projectId: string | null
  /** O arquivo não está mais no disco. */
  missing: boolean
}

/** Skills da aba Skills de um projeto. */
export interface ProjectSkills {
  /** Locais: só deste projeto. */
  own: Skill[]
  /** Globais que você trouxe para este projeto. */
  imported: Skill[]
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
  /** `skills`: nomes das skills usadas nesta mensagem. */
  | { kind: 'user'; id: string; text: string; skills?: string[]; attachments?: Attachment[] }
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
    /**
     * Lê um arquivo .md/.mdx citado numa conversa (pode estar fora do projeto).
     * Caminho relativo vale a partir de `base` (arquivo aberto) ou do projeto.
     */
    readMarkdown(
      projectId: string,
      path: string,
      base?: string
    ): Promise<{ path: string; content: string }>
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
  skills: {
    /** Skills globais, por nome. */
    listGlobal(): Promise<Skill[]>
    /** Skills locais e globais importadas do projeto. */
    listProject(projectId: string): Promise<ProjectSkills>
    /** O que uma conversa do projeto pode usar: locais, importadas e as demais globais. */
    available(projectId: string): Promise<Skill[]>
    /**
     * Abre o seletor do Windows (pasta ou arquivo) e adiciona o que foi escolhido,
     * como global (projectId null) ou local do projeto. Devolve [] se cancelar.
     * Uma pasta com várias subpastas de skill adiciona todas.
     */
    pick(kind: 'folder' | 'file', projectId: string | null): Promise<Skill[]>
    /** Adiciona a partir de um caminho já conhecido (mesmas regras do pick). */
    add(path: string, projectId: string | null): Promise<Skill[]>
    /** Tira a skill do app; o arquivo no disco não é apagado. */
    remove(id: string): Promise<void>
    /** Traz uma skill global para a aba Skills do projeto. */
    importToProject(projectId: string, skillId: string): Promise<void>
    removeFromProject(projectId: string, skillId: string): Promise<void>
  }
  system: {
    /** Abre a pasta do arquivo no Explorer, com ele selecionado. */
    showInFolder(path: string): Promise<void>
  }
  updates: {
    state(): Promise<UpdateState>
    /** Confere agora se há versão nova. */
    check(): Promise<void>
    /** Reinicia o app instalando a versão baixada. */
    install(): Promise<void>
    onChange(listener: (state: UpdateState) => void): () => void
  }
  attachments: {
    /** Guarda uma imagem colada ou um arquivo arrastado. */
    save(name: string, bytes: Uint8Array): Promise<Attachment>
    /** Abre o seletor do Windows; devolve [] se cancelar. */
    pick(): Promise<Attachment[]>
  }
  accounts: {
    /** Situação das contas do Claude, do ChatGPT e do Gemini. */
    status(): Promise<AccountStatus[]>
    /** Login oficial no navegador (Claude e ChatGPT). Termina quando o login acaba. */
    login(id: AccountId): Promise<AccountStatus>
    /** Sai da conta. No Claude e no ChatGPT, vale para o computador inteiro. */
    logout(id: AccountId): Promise<AccountStatus>
    /** Link do login, para o caso de o navegador não abrir sozinho. */
    onLoginLink(listener: (link: { id: AccountId; url: string }) => void): () => void
  }
  connectors: {
    list(): Promise<Connector[]>
    /** Cria (sem id) ou altera. Sem senha, a senha salva continua. */
    save(input: ConnectorInput): Promise<Connector>
    remove(id: string): Promise<void>
    /** Envia um e-mail de teste para o próprio endereço; devolve o endereço. */
    test(id: string): Promise<string>
    /** Situação do Google Maps e do Navegador. */
    tools(): Promise<ToolConnectorStatus[]>
    /** Liga um conector de ferramenta. O Google Maps exige a chave na primeira vez. */
    connectTool(id: ToolConnectorId, key?: string): Promise<ToolConnectorStatus>
    disconnectTool(id: ToolConnectorId): Promise<ToolConnectorStatus>
    /** Faz um uso de teste; devolve o que deu certo, em português. */
    testTool(id: ToolConnectorId): Promise<string>
  }
  automations: {
    list(projectId: string): Promise<AutomationSummary[]>
    /** Execuções que falharam ou aguardam você e ainda não foram vistas. */
    unseen(projectId: string): Promise<number>
    create(projectId: string, name?: string): Promise<Automation>
    save(automation: Automation): Promise<AutomationSummary>
    remove(id: string): Promise<void>
    /** "Rodar agora": devolve o id da execução (pode ficar na fila). */
    run(id: string): Promise<string>
    runs(id: string): Promise<RunSummary[]>
    getRun(id: string, runId: string): Promise<AutomationRun>
    markSeen(id: string, runId: string): Promise<void>
    cancel(id: string, runId: string): Promise<void>
    /** Aprova (continua) ou recusa (encerra) uma execução esperando aprovação. */
    decide(id: string, runId: string, approve: boolean): Promise<void>
    /** Algo mudou nas automações do projeto (devolve a função para parar de ouvir). */
    onChanged(listener: (projectId: string) => void): () => void
    /** Clique num aviso do Windows: abrir esta execução. */
    onOpen(
      listener: (target: { projectId: string; automationId: string; runId: string }) => void
    ): () => void
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
    /**
     * `skills`: ids das skills que o agente deve seguir nesta mensagem.
     * `attachments`: anexos já guardados pelo app (attachments.save/pick).
     */
    send(
      sessionId: string,
      message: string,
      skills?: string[],
      attachments?: Attachment[]
    ): Promise<void>
    /** Responde a um pedido de autorização (evento 'permission'). */
    respond(sessionId: string, requestId: string, allow: boolean): Promise<void>
    /** Interrompe a resposta em andamento; a conversa continua aberta. */
    interrupt(sessionId: string): Promise<void>
    stop(sessionId: string): Promise<void>
    /** Devolve uma função para cancelar a escuta. */
    onEvent(listener: (event: AgentEvent) => void): () => void
  }
}
