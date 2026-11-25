// Automações: fluxos de passos que rodam sozinhos (num horário) ou pelo botão
// "Rodar agora". Este arquivo é o contrato entre o processo principal (que roda) e
// a interface (que edita e mostra o histórico), mais as regras que os dois lados
// precisam aplicar igual: próxima execução, variáveis visíveis em cada passo e
// validação.
import type { AgentId, ChatItem } from './types'

// ---- Fluxo -------------------------------------------------------------------

/** Tipo do valor de uma variável. Define o que o autocompletar oferece. */
export type VarType = 'text' | 'number' | 'boolean' | 'list' | 'object'

export const VAR_TYPES: { id: VarType; label: string }[] = [
  { id: 'text', label: 'Texto' },
  { id: 'number', label: 'Número' },
  { id: 'boolean', label: 'Sim/não' },
  { id: 'list', label: 'Lista' },
  { id: 'object', label: 'Objeto' }
]

/** Quando a automação dispara. Horários seguem o relógio do Windows. */
export type Trigger =
  | { kind: 'manual' }
  /** `date` no formato AAAA-MM-DD. */
  | { kind: 'once'; date: string; time: string }
  | { kind: 'daily'; time: string }
  /** `days`: 0 = domingo ... 6 = sábado. */
  | { kind: 'weekly'; days: number[]; time: string }
  /** Dia 29, 30 ou 31 em mês mais curto vale como o último dia do mês. */
  | { kind: 'monthly'; day: number; time: string }

interface StepBase {
  id: string
  /** Nome mostrado no quadro. */
  name: string
}

export interface AgentStep extends StepBase {
  kind: 'agent'
  agent: AgentId
  model: string | null
  effort: string | null
  /** Skills (ids) que o agente segue neste passo. */
  skills: string[]
  /** Pedido ao agente; aceita {{expressão}}. */
  prompt: string
  /** Onde guardar a resposta. Variável vazia = resposta não é guardada. */
  output: { variable: string; type: VarType }
}

export interface SetStep extends StepBase {
  kind: 'set'
  variable: string
  type: VarType
  /** JavaScript: uma expressão, ou um bloco com `return`. */
  code: string
}

export interface IfStep extends StepBase {
  kind: 'if'
  /** JavaScript que resulta em verdadeiro ou falso. */
  condition: string
  then: Step[]
  else: Step[]
}

export interface LoopStep extends StepBase {
  kind: 'loop'
  mode: 'each' | 'times'
  /** JavaScript que resulta na lista percorrida (modo "para cada"). */
  list: string
  /** JavaScript que resulta no número de repetições (modo "repetir"). */
  count: string
  /** Nome da variável com o item da vez (modo "para cada"). */
  item: string
  /** Nome da variável com a posição da vez, começando em 0. */
  index: string
  body: Step[]
}

export interface EmailStep extends StepBase {
  kind: 'email'
  connectorId: string | null
  /** Destinatários separados por vírgula; aceita {{expressão}}. */
  to: string
  subject: string
  body: string
}

export interface ApprovalStep extends StepBase {
  kind: 'approval'
  /** O que você vê ao aprovar; aceita {{expressão}}. */
  message: string
}

export type ResultType = 'text' | 'list' | 'link' | 'file'

export const RESULT_TYPES: { id: ResultType; label: string }[] = [
  { id: 'text', label: 'Texto' },
  { id: 'list', label: 'Lista' },
  { id: 'link', label: 'Link' },
  { id: 'file', label: 'Arquivo' }
]

export interface ResultStep extends StepBase {
  kind: 'result'
  type: ResultType
  /** Lista: JavaScript que resulta na lista. Demais: texto com {{expressão}}. */
  value: string
}

export type Step =
  | AgentStep
  | SetStep
  | IfStep
  | LoopStep
  | EmailStep
  | ApprovalStep
  | ResultStep

export type StepKind = Step['kind']

export const STEP_LABELS: Record<StepKind, string> = {
  agent: 'Agente',
  set: 'Variável',
  if: 'Se / senão',
  loop: 'Loop',
  email: 'Enviar e-mail',
  approval: 'Aprovação humana',
  result: 'Resultado final'
}

export interface Automation {
  id: string
  projectId: string
  name: string
  /** Desligada: o horário não dispara (o "Rodar agora" continua valendo). */
  enabled: boolean
  trigger: Trigger
  /** Se o app estava fechado (ou o PC desligado) na hora: roda ao voltar ou pula. */
  whenMissed: 'run' | 'skip'
  steps: Step[]
  createdAt: number
  updatedAt: number
  /** A partir de quando o horário vale (ao criar, ligar ou trocar o gatilho). */
  armedAt: number
  /** Última vez que o horário disparou. */
  lastFireAt: number | null
}

/** Automação como aparece na lista, com o que a tela precisa saber dela. */
export interface AutomationSummary {
  automation: Automation
  /** Próximo disparo pelo horário; null = manual, desligada ou sem próxima data. */
  nextRunAt: number | null
  /** Execução em andamento, aguardando aprovação ou na fila (a mais recente). */
  active: { runId: string; status: RunStatus } | null
  /** Execuções que falharam ou aguardam você e ainda não foram vistas. */
  unseen: number
}

// ---- Execuções ----------------------------------------------------------------

export type RunStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'rejected'
  | 'expired'
  | 'cancelled'

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: 'Na fila',
  running: 'Rodando',
  waiting: 'Aguardando aprovação',
  succeeded: 'Concluída',
  failed: 'Falhou',
  rejected: 'Recusada',
  expired: 'Aprovação expirou',
  cancelled: 'Cancelada'
}

/** Estados que pedem a sua atenção (geram a bolinha até você ver). */
export const ATTENTION: RunStatus[] = ['failed', 'waiting', 'expired']

export type NodeStatus = 'running' | 'succeeded' | 'failed' | 'waiting' | 'skipped'

/** O que aconteceu num passo. Dentro de loops há um registro por volta. */
export interface NodeRecord {
  stepId: string
  /** Voltas dos loops em que o passo está (vazio fora de loops). */
  iteration: number[]
  status: NodeStatus
  startedAt: number
  endedAt: number | null
  /** O que o passo recebeu já com as {{variáveis}} trocadas (pedido, e-mail...). */
  input: string | null
  /** O que o passo entregou. */
  output: unknown
  error: string | null
  /** Caminho escolhido (passo "se"). */
  branch?: 'then' | 'else'
  /** Conversa do agente (passo "agente"). */
  transcript?: ChatItem[]
}

export interface RunResult {
  type: ResultType
  value: unknown
}

/** Posição num fluxo, para retomar depois de uma aprovação. */
export interface Frame {
  index: number
  iteration?: number
  branch?: 'then' | 'else'
}

export interface AutomationRun {
  id: string
  automationId: string
  projectId: string
  automationName: string
  /** manual = "Rodar agora"; missed = horário perdido, rodado ao voltar. */
  trigger: 'manual' | 'schedule' | 'missed'
  status: RunStatus
  createdAt: number
  startedAt: number | null
  endedAt: number | null
  /** Você já abriu esta execução. */
  seen: boolean
  error: string | null
  /** Cópia do fluxo no momento da execução (o histórico não muda se você editar). */
  steps: Step[]
  nodes: NodeRecord[]
  result: RunResult | null
  /** Variáveis no fim (ou no ponto em que parou). */
  vars: Record<string, unknown>
  /** Aprovação pendente. */
  approval: { stepId: string; message: string; expiresAt: number } | null
  /** Onde parou, para continuar depois da aprovação. Uso interno. */
  resume: { position: Frame[]; emails: number } | null
}

/** Execução na lista do histórico, sem os detalhes. */
export type RunSummary = Pick<
  AutomationRun,
  'id' | 'automationId' | 'trigger' | 'status' | 'createdAt' | 'startedAt' | 'endedAt' | 'seen' | 'error'
>

// ---- Conectores ---------------------------------------------------------------

export type SmtpSecurity = 'starttls' | 'ssl'

export interface Connector {
  id: string
  kind: 'smtp'
  name: string
  host: string
  port: number
  security: SmtpSecurity
  /** Usuário do servidor; no Gmail, o seu endereço. */
  user: string
  /** Nome de quem envia, mostrado ao destinatário. */
  fromName: string
  /** A senha está guardada (ela nunca volta para a tela). */
  hasPassword: boolean
}

/** Dados para criar ou alterar um conector. Sem `password`, a senha salva continua. */
export interface ConnectorInput {
  id?: string
  name: string
  host: string
  port: number
  security: SmtpSecurity
  user: string
  fromName: string
  password?: string
}

export const GMAIL_PRESET: Omit<ConnectorInput, 'user' | 'fromName'> = {
  name: 'Gmail',
  host: 'smtp.gmail.com',
  port: 587,
  security: 'starttls'
}

/** Máximo de e-mails (destinatários somados) que uma execução pode enviar. */
export const EMAIL_LIMIT = 20

/** Tempo que uma aprovação espera por você antes de expirar. */
export const APPROVAL_TTL = 2 * 24 * 60 * 60 * 1000

// ---- Regras compartilhadas ---------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, '0')

function parseTime(time: string): [number, number] | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  return h < 24 && m < 60 ? [h, m] : null
}

function at(base: Date, hm: [number, number]): Date {
  const d = new Date(base)
  d.setHours(hm[0], hm[1], 0, 0)
  return d
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Primeiro disparo do gatilho depois de `after` (null = não há). */
export function nextOccurrence(trigger: Trigger, after: number): Date | null {
  if (trigger.kind === 'manual') return null
  const hm = parseTime(trigger.time)
  if (!hm) return null
  const from = new Date(after)

  switch (trigger.kind) {
    case 'once': {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trigger.date)
      if (!match) return null
      const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hm[0], hm[1])
      return d.getTime() > after ? d : null
    }
    case 'daily': {
      const d = at(from, hm)
      if (d.getTime() <= after) d.setDate(d.getDate() + 1)
      return d
    }
    case 'weekly': {
      if (trigger.days.length === 0) return null
      for (let i = 0; i < 8; i++) {
        const d = at(from, hm)
        d.setDate(d.getDate() + i)
        if (trigger.days.includes(d.getDay()) && d.getTime() > after) return d
      }
      return null
    }
    case 'monthly': {
      for (let i = 0; i < 14; i++) {
        const year = from.getFullYear()
        const month = from.getMonth() + i
        const day = Math.min(Math.max(1, trigger.day), daysInMonth(year, month))
        const d = new Date(year, month, day, hm[0], hm[1])
        if (d.getTime() > after) return d
      }
      return null
    }
  }
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const WEEKDAY_NAMES = WEEKDAYS

/** Descrição curta do gatilho, ex.: "Todo dia às 04:00". */
export function describeTrigger(trigger: Trigger): string {
  switch (trigger.kind) {
    case 'manual':
      return 'Só manual (botão "Rodar agora")'
    case 'once': {
      const [y, m, d] = trigger.date.split('-')
      return `Uma vez, em ${d}/${m}/${y} às ${trigger.time}`
    }
    case 'daily':
      return `Todo dia às ${trigger.time}`
    case 'weekly':
      return trigger.days.length === 0
        ? 'Toda semana (escolha os dias)'
        : `Toda semana (${[...trigger.days].sort().map((d) => WEEKDAYS[d]).join(', ')}) às ${trigger.time}`
    case 'monthly':
      return `Todo dia ${trigger.day} do mês às ${trigger.time}`
  }
}

/** "05/12 às 10:00" (com o ano se não for o atual). */
export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  const year = d.getFullYear() === new Date().getFullYear() ? '' : `/${d.getFullYear()}`
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}${year} às ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Hoje no formato AAAA-MM-DD (para o campo de data). */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Variáveis que todo fluxo já tem. */
export const BUILTIN_VARS: VarInfo[] = [
  { name: 'agora', type: 'text', detail: 'Data e hora do início da execução' },
  { name: 'execucao', type: 'object', detail: 'Dados da execução (id, gatilho)' }
]

export interface VarInfo {
  name: string
  type: VarType | 'any'
  detail: string
}

/** Variável criada pelo passo (null se ele não cria nenhuma). */
function definedBy(step: Step): VarInfo | null {
  if (step.kind === 'agent' && step.output.variable) {
    return { name: step.output.variable, type: step.output.type, detail: `Resposta de "${step.name}"` }
  }
  if (step.kind === 'set' && step.variable) {
    return { name: step.variable, type: step.type, detail: `Definida em "${step.name}"` }
  }
  return null
}

/** Visita todos os passos, em profundidade. */
export function walk(steps: Step[], visit: (step: Step) => void): void {
  for (const step of steps) {
    visit(step)
    if (step.kind === 'if') {
      walk(step.then, visit)
      walk(step.else, visit)
    } else if (step.kind === 'loop') {
      walk(step.body, visit)
    }
  }
}

/**
 * Variáveis que um passo enxerga: as de sempre, as criadas antes dele no caminho
 * (inclusive dentro de "se" e loops anteriores) e o item/posição dos loops em que
 * ele está. `stepId` null = fim do fluxo.
 */
export function scopeAt(steps: Step[], stepId: string | null): VarInfo[] {
  const found = new Map<string, VarInfo>(BUILTIN_VARS.map((v) => [v.name, v]))
  const add = (info: VarInfo | null): void => {
    if (info) found.set(info.name, info)
  }

  // Devolve true quando achou o passo (para de coletar ali).
  const visit = (list: Step[]): boolean => {
    for (const step of list) {
      if (step.id === stepId) return true
      if (step.kind === 'if') {
        const before = new Map(found)
        if (visit(step.then) || (restore(before), visit(step.else))) return true
        // Depois de um "se", vale o que qualquer caminho pode ter criado.
        collect(step.then)
        collect(step.else)
      } else if (step.kind === 'loop') {
        const before = new Map(found)
        add(loopItem(step))
        add({ name: step.index, type: 'number', detail: `Posição da vez em "${step.name}"` })
        if (visit(step.body)) return true
        restore(before)
        collect(step.body)
      }
      add(definedBy(step))
    }
    return false
  }
  const restore = (snapshot: Map<string, VarInfo>): void => {
    found.clear()
    for (const [k, v] of snapshot) found.set(k, v)
  }
  const collect = (list: Step[]): void => walk(list, (s) => add(definedBy(s)))

  visit(steps)
  return [...found.values()].filter((v) => v.name)
}

function loopItem(step: LoopStep): VarInfo | null {
  if (step.mode !== 'each' || !step.item) return null
  return { name: step.item, type: 'any', detail: `Item da vez em "${step.name}"` }
}

const IDENTIFIER = /^[A-Za-z_$À-ɏ][\w$À-ɏ]*$/
const RESERVED = new Set(
  'break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static await undefined'.split(
    ' '
  )
)

/** Erro no nome de uma variável, ou null se está bom. */
export function variableError(name: string): string | null {
  if (!name) return 'Dê um nome à variável.'
  if (!IDENTIFIER.test(name)) return 'Use só letras, números e _ (sem espaço; não comece com número).'
  if (RESERVED.has(name)) return `"${name}" é uma palavra reservada do JavaScript.`
  if (BUILTIN_VARS.some((v) => v.name === name)) return `"${name}" já existe em todo fluxo.`
  return null
}

/** Problemas de configuração de um passo (vazio = pronto para rodar). */
export function stepProblems(step: Step): string[] {
  const problems: string[] = []
  const need = (value: string, message: string): void => {
    if (!value.trim()) problems.push(message)
  }
  switch (step.kind) {
    case 'agent':
      need(step.prompt, 'Escreva o pedido ao agente.')
      if (step.output.variable) {
        const err = variableError(step.output.variable)
        if (err) problems.push(err)
      }
      break
    case 'set': {
      const err = variableError(step.variable)
      if (err) problems.push(err)
      need(step.code, 'Escreva o valor (JavaScript).')
      break
    }
    case 'if':
      need(step.condition, 'Escreva a condição (JavaScript).')
      break
    case 'loop': {
      if (step.mode === 'each') {
        need(step.list, 'Diga qual lista percorrer.')
        const err = variableError(step.item)
        if (err) problems.push(`Item: ${err}`)
      } else {
        need(step.count, 'Diga quantas vezes repetir.')
      }
      const err = variableError(step.index)
      if (err) problems.push(`Posição: ${err}`)
      break
    }
    case 'email':
      if (!step.connectorId) problems.push('Escolha o conector de e-mail.')
      need(step.to, 'Diga para quem enviar.')
      need(step.subject, 'Escreva o assunto.')
      break
    case 'approval':
      need(step.message, 'Escreva o que você vai aprovar.')
      break
    case 'result':
      need(step.value, 'Diga o que a execução devolve.')
      break
  }
  return problems
}

/** Problemas do fluxo inteiro, com o passo de cada um. */
export function flowProblems(steps: Step[]): { step: Step; problems: string[] }[] {
  const out: { step: Step; problems: string[] }[] = []
  walk(steps, (step) => {
    const problems = stepProblems(step)
    if (problems.length > 0) out.push({ step, problems })
  })
  return out
}

/** Acha um passo e a lista onde ele está. */
export function locate(
  steps: Step[],
  stepId: string
): { list: Step[]; index: number; step: Step } | null {
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]
    if (step.id === stepId) return { list: steps, index, step }
    const children =
      step.kind === 'if' ? [step.then, step.else] : step.kind === 'loop' ? [step.body] : []
    for (const child of children) {
      const found = locate(child, stepId)
      if (found) return found
    }
  }
  return null
}
