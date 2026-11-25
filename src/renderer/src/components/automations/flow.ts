// Operações de edição do fluxo na tela: criar, inserir, alterar, mover e apagar
// passos. Sempre devolvem uma cópia nova (o estado do React não é alterado no lugar).
import { agentInfo } from '../../../../shared/agents'
import {
  STEP_LABELS,
  walk,
  type Step,
  type StepKind
} from '../../../../shared/automation'

/** Lista onde um passo pode entrar: a raiz, um caminho de um "se" ou o corpo de um loop. */
export type Container = null | { stepId: string; branch: 'then' | 'else' | 'body' }

export interface Slot {
  container: Container
  index: number
}

function listOf(steps: Step[], container: Container): Step[] | null {
  if (container === null) return steps
  let found: Step[] | null = null
  walk(steps, (step) => {
    if (step.id !== container.stepId) return
    if (step.kind === 'if' && (container.branch === 'then' || container.branch === 'else')) {
      found = step[container.branch]
    } else if (step.kind === 'loop' && container.branch === 'body') {
      found = step.body
    }
  })
  return found
}

/** Nome livre, ex.: "Agente 2". */
function uniqueName(steps: Step[], base: string): string {
  const used = new Set<string>()
  walk(steps, (s) => used.add(s.name))
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

/** Nome de variável livre, ex.: "resposta2". */
function uniqueVar(steps: Step[], base: string): string {
  const used = new Set<string>()
  walk(steps, (s) => {
    if (s.kind === 'agent') used.add(s.output.variable)
    if (s.kind === 'set') used.add(s.variable)
    if (s.kind === 'loop') {
      used.add(s.item)
      used.add(s.index)
    }
  })
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}${n}`)) n++
  return `${base}${n}`
}

export function newStep(kind: StepKind, all: Step[]): Step {
  const id = crypto.randomUUID()
  const name = uniqueName(all, STEP_LABELS[kind])
  switch (kind) {
    case 'agent': {
      const info = agentInfo('claude')
      return {
        id,
        kind,
        name,
        agent: 'claude',
        model: info?.defaults.model ?? null,
        effort: info?.defaults.effort ?? null,
        skills: [],
        prompt: '',
        output: { variable: uniqueVar(all, 'resposta'), type: 'text' }
      }
    }
    case 'set':
      return { id, kind, name, variable: uniqueVar(all, 'valor'), type: 'text', code: '' }
    case 'if':
      return { id, kind, name, condition: '', then: [], else: [] }
    case 'loop':
      return {
        id,
        kind,
        name,
        mode: 'each',
        list: '',
        count: '3',
        item: uniqueVar(all, 'item'),
        index: uniqueVar(all, 'indice'),
        body: []
      }
    case 'email':
      return { id, kind, name, connectorId: null, to: '', subject: '', body: '' }
    case 'approval':
      return { id, kind, name, message: '' }
    case 'result':
      return { id, kind, name, type: 'text', value: '' }
  }
}

export function insertStep(steps: Step[], slot: Slot, step: Step): Step[] {
  const copy = structuredClone(steps)
  listOf(copy, slot.container)?.splice(slot.index, 0, step)
  return copy
}

export function replaceStep(steps: Step[], next: Step): Step[] {
  const copy = structuredClone(steps)
  const visit = (list: Step[]): boolean => {
    const index = list.findIndex((s) => s.id === next.id)
    if (index !== -1) {
      // Mantém os passos de dentro (o painel só altera os campos do próprio passo).
      const current = list[index]
      if (current.kind === 'if' && next.kind === 'if') list[index] = { ...next, then: current.then, else: current.else }
      else if (current.kind === 'loop' && next.kind === 'loop') list[index] = { ...next, body: current.body }
      else list[index] = next
      return true
    }
    return list.some((s) =>
      s.kind === 'if' ? visit(s.then) || visit(s.else) : s.kind === 'loop' ? visit(s.body) : false
    )
  }
  visit(copy)
  return copy
}

export function removeStep(steps: Step[], stepId: string): Step[] {
  const strip = (list: Step[]): Step[] =>
    list
      .filter((s) => s.id !== stepId)
      .map((s) =>
        s.kind === 'if'
          ? { ...s, then: strip(s.then), else: strip(s.else) }
          : s.kind === 'loop'
            ? { ...s, body: strip(s.body) }
            : s
      )
  return strip(steps)
}

/** Sobe (-1) ou desce (+1) o passo dentro da lista em que ele está. */
export function moveStep(steps: Step[], stepId: string, delta: -1 | 1): Step[] {
  const copy = structuredClone(steps)
  const visit = (list: Step[]): boolean => {
    const index = list.findIndex((s) => s.id === stepId)
    if (index !== -1) {
      const to = index + delta
      if (to < 0 || to >= list.length) return true
      const [moved] = list.splice(index, 1)
      list.splice(to, 0, moved)
      return true
    }
    return list.some((s) =>
      s.kind === 'if' ? visit(s.then) || visit(s.else) : s.kind === 'loop' ? visit(s.body) : false
    )
  }
  visit(copy)
  return copy
}

/** Posição do passo na lista dele (para habilitar subir/descer). */
export function positionOf(steps: Step[], stepId: string): { index: number; total: number } | null {
  let result: { index: number; total: number } | null = null
  const visit = (list: Step[]): void => {
    const index = list.findIndex((s) => s.id === stepId)
    if (index !== -1) result = { index, total: list.length }
    for (const s of list) {
      if (s.kind === 'if') {
        visit(s.then)
        visit(s.else)
      } else if (s.kind === 'loop') visit(s.body)
    }
  }
  visit(steps)
  return result
}
