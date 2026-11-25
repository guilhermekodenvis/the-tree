// Motor das automações: agenda, enfileira e roda os fluxos.
//
// - Cada automação tem a sua fila: se um disparo chega com outra execução ainda
//   rodando (ou esperando aprovação), ele espera a vez.
// - Os passos rodam em ordem; "se" escolhe um caminho, loops repetem o corpo.
//   Qualquer erro para tudo e avisa.
// - A aprovação humana pausa a execução e grava onde parou. Ela continua mesmo
//   que o app seja fechado e aberto de novo, e expira em 2 dias.
// - O agendador confere os horários a cada 30 s e ao voltar da suspensão. Horário
//   perdido (app fechado, PC desligado) roda ao voltar, se a automação pedir.
import { powerMonitor } from 'electron'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import { agentInfo, resolveSettings } from '../../shared/agents'
import {
  APPROVAL_TTL,
  ATTENTION,
  EMAIL_LIMIT,
  flowProblems,
  nextOccurrence,
  RUN_STATUS_LABELS,
  type AgentStep,
  type Automation,
  type AutomationRun,
  type AutomationSummary,
  type Frame,
  type NodeRecord,
  type RunSummary,
  type Step,
  type Trigger
} from '../../shared/automation'
import type { ChatItem } from '../../shared/types'
import * as connectors from '../connectors/store'
import * as projects from '../projects/store'
import { withSkills } from '../skills/prompt'
import * as skills from '../skills/store'
import { runAgentOnce } from './agent-run'
import { coerce, evaluate, render, show } from './js'
import * as store from './store'

/** Atraso a partir do qual um disparo conta como "perdido". */
const LATE_MS = 2 * 60 * 1000
const TICK_MS = 30 * 1000

export interface EngineHooks {
  /** Algo mudou nas automações ou execuções deste projeto. */
  changed(projectId: string): void
  /** Aviso do Windows; clicar leva para a execução. */
  notify(title: string, body: string, target: { projectId: string; automationId: string; runId: string }): void
}

/** Pausa para aprovação: guarda onde parou. */
class Pause {
  constructor(readonly position: Frame[]) {}
}

interface Ctx {
  run: AutomationRun
  cwd: string
  vars: Record<string, unknown>
  emails: number
  signal: AbortSignal
  /** Posição atual (uma moldura por nível de aninhamento). */
  position: Frame[]
  /** Voltas dos loops em andamento. */
  iteration: number[]
}

const sameIteration = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((n, i) => n === b[i])

function summary(run: AutomationRun): RunSummary {
  const { id, automationId, trigger, status, createdAt, startedAt, endedAt, seen, error } = run
  return { id, automationId, trigger, status, createdAt, startedAt, endedAt, seen, error }
}

export class AutomationEngine {
  /** Execuções rodando agora, com o controle para cancelar. */
  private live = new Map<string, AbortController>()
  /** Automações com a fila sendo processada (evita começar duas de uma vez). */
  private busy = new Set<string>()
  private timer: NodeJS.Timeout | null = null
  private lastBroadcast = new Map<string, number>()

  constructor(private hooks: EngineHooks) {}

  // ---- Início e fim -----------------------------------------------------------

  async init(): Promise<void> {
    // Execuções que estavam rodando quando o app fechou não têm como continuar.
    for (const automation of await store.loadAutomations()) {
      for (const run of (await store.loadRuns(automation.id)).values()) {
        if (run.status === 'running') {
          this.finishNodes(run, 'O app foi fechado durante a execução.')
          Object.assign(run, {
            status: 'failed',
            endedAt: Date.now(),
            seen: false,
            error: 'O app foi fechado durante a execução.'
          })
          await store.saveRun(run)
        }
      }
      void this.processQueue(automation.id)
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    powerMonitor.on('resume', () => void this.tick())
    powerMonitor.on('unlock-screen', () => void this.tick())
    await this.tick()
  }

  /** Ao sair do app: interrompe o que está rodando. */
  async stopAll(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    for (const controller of this.live.values()) controller.abort('shutdown')
    // Dá um instante para as execuções gravarem o estado.
    const deadline = Date.now() + 3000
    while (this.live.size > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
  }

  // ---- Automações -------------------------------------------------------------

  async list(projectId: string): Promise<AutomationSummary[]> {
    const all = (await store.loadAutomations()).filter((a) => a.projectId === projectId)
    return Promise.all(all.map((a) => this.summarize(a)))
  }

  private async summarize(automation: Automation): Promise<AutomationSummary> {
    const runs = [...(await store.loadRuns(automation.id)).values()]
    const active = runs
      .filter((r) => r.status === 'running' || r.status === 'waiting' || r.status === 'queued')
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    return {
      automation,
      nextRunAt: this.nextRun(automation),
      active: active ? { runId: active.id, status: active.status } : null,
      unseen: runs.filter((r) => !r.seen && ATTENTION.includes(r.status)).length
    }
  }

  private nextRun(automation: Automation): number | null {
    if (!automation.enabled) return null
    const from = Math.max(automation.armedAt, automation.lastFireAt ?? 0)
    return nextOccurrence(automation.trigger, from)?.getTime() ?? null
  }

  /** Execuções que pedem atenção e ainda não foram vistas, no projeto. */
  async unseen(projectId: string): Promise<number> {
    return (await this.list(projectId)).reduce((sum, s) => sum + s.unseen, 0)
  }

  async create(projectId: string, name?: string): Promise<Automation> {
    if (!(await projects.get(projectId))) throw new Error('Este projeto não existe mais.')
    const all = await store.loadAutomations()
    const used = new Set(all.filter((a) => a.projectId === projectId).map((a) => a.name))
    let clean = name?.trim().slice(0, 80)
    if (!clean) {
      let n = 1
      clean = 'Nova automação'
      while (used.has(clean)) clean = `Nova automação ${++n}`
    }
    const now = Date.now()
    const automation: Automation = {
      id: randomUUID(),
      projectId,
      name: clean,
      enabled: true,
      trigger: { kind: 'manual' },
      whenMissed: 'run',
      steps: [],
      createdAt: now,
      updatedAt: now,
      armedAt: now,
      lastFireAt: null
    }
    await store.saveAutomations([...all, automation])
    this.hooks.changed(projectId)
    return automation
  }

  /** Grava as mudanças feitas na tela (nome, gatilho, passos...). */
  async save(input: Automation): Promise<AutomationSummary> {
    const all = await store.loadAutomations()
    const current = all.find((a) => a.id === input.id)
    if (!current) throw new Error('Esta automação não existe mais.')
    const name = String(input.name ?? '').trim().slice(0, 80)
    if (!name) throw new Error('O nome não pode ficar vazio.')
    const trigger = cleanTrigger(input.trigger)
    const enabled = input.enabled !== false
    // Mudou o horário ou religou: o horário passa a valer a partir de agora
    // (não dispara na hora por um horário que já tinha passado).
    const rearm = enabled !== current.enabled || JSON.stringify(trigger) !== JSON.stringify(current.trigger)
    const next: Automation = {
      ...current,
      name,
      enabled,
      trigger,
      whenMissed: input.whenMissed === 'skip' ? 'skip' : 'run',
      steps: Array.isArray(input.steps) ? input.steps : current.steps,
      updatedAt: Date.now(),
      armedAt: rearm ? Date.now() : current.armedAt,
      lastFireAt: rearm ? null : current.lastFireAt
    }
    await store.saveAutomations(all.map((a) => (a.id === next.id ? next : a)))
    this.hooks.changed(next.projectId)
    return this.summarize(next)
  }

  async remove(id: string): Promise<void> {
    const all = await store.loadAutomations()
    const automation = all.find((a) => a.id === id)
    if (!automation) return
    for (const run of (await store.loadRuns(id)).values()) this.live.get(run.id)?.abort('cancel')
    await store.saveAutomations(all.filter((a) => a.id !== id))
    await store.removeRuns(id)
    this.hooks.changed(automation.projectId)
  }

  /** Ao remover um projeto: some com as automações dele. */
  async removeProject(projectId: string): Promise<void> {
    for (const a of (await store.loadAutomations()).filter((x) => x.projectId === projectId)) {
      await this.remove(a.id)
    }
  }

  // ---- Execuções --------------------------------------------------------------

  async runs(automationId: string): Promise<RunSummary[]> {
    return [...(await store.loadRuns(automationId)).values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(summary)
  }

  async getRun(automationId: string, runId: string): Promise<AutomationRun> {
    const run = (await store.loadRuns(automationId)).get(runId)
    if (!run) throw new Error('Esta execução não existe mais.')
    return run
  }

  async markSeen(automationId: string, runId: string): Promise<void> {
    const run = await this.getRun(automationId, runId)
    if (run.seen) return
    run.seen = true
    await store.saveRun(run)
    this.hooks.changed(run.projectId)
  }

  /** "Rodar agora". Devolve o id da execução (que pode ficar na fila). */
  async runNow(automationId: string): Promise<string> {
    return this.enqueue(automationId, 'manual')
  }

  async cancel(automationId: string, runId: string): Promise<void> {
    const run = await this.getRun(automationId, runId)
    const controller = this.live.get(runId)
    if (controller) {
      controller.abort('cancel')
      return
    }
    if (run.status === 'queued' || run.status === 'waiting') {
      this.finishNodes(run, 'Execução cancelada.')
      Object.assign(run, { status: 'cancelled', endedAt: Date.now(), approval: null, resume: null })
      await store.saveRun(run)
      this.hooks.changed(run.projectId)
      void this.processQueue(automationId)
    }
  }

  /** Resposta à aprovação humana: aprova (continua) ou recusa (encerra). */
  async decide(automationId: string, runId: string, approve: boolean): Promise<void> {
    const run = await this.getRun(automationId, runId)
    if (run.status !== 'waiting' || !run.approval || !run.resume) {
      throw new Error('Esta execução não está mais esperando aprovação.')
    }
    const record = [...run.nodes].reverse().find((n) => n.stepId === run.approval?.stepId && n.status === 'waiting')
    run.seen = true
    if (!approve) {
      if (record) Object.assign(record, { status: 'failed', endedAt: Date.now(), error: 'Você recusou.' })
      // Loops em volta da aprovação também param aqui.
      this.finishNodes(run, 'Você recusou.')
      Object.assign(run, { status: 'rejected', endedAt: Date.now(), approval: null, resume: null })
      await store.saveRun(run)
      this.hooks.changed(run.projectId)
      void this.processQueue(automationId)
      return
    }
    if (record) Object.assign(record, { status: 'succeeded', endedAt: Date.now(), output: 'Aprovado' })
    const resume = run.resume
    run.approval = null
    void this.execute(run, resume.position, resume.emails)
  }

  private async enqueue(automationId: string, trigger: AutomationRun['trigger']): Promise<string> {
    const automation = (await store.loadAutomations()).find((a) => a.id === automationId)
    if (!automation) throw new Error('Esta automação não existe mais.')
    const run: AutomationRun = {
      id: randomUUID(),
      automationId,
      projectId: automation.projectId,
      automationName: automation.name,
      trigger,
      status: 'queued',
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null,
      seen: trigger === 'manual',
      error: null,
      steps: structuredClone(automation.steps),
      nodes: [],
      result: null,
      vars: {},
      approval: null,
      resume: null
    }
    await store.saveRun(run)
    this.hooks.changed(run.projectId)
    void this.processQueue(automationId)
    return run.id
  }

  /** Começa a próxima da fila, se nenhuma estiver rodando ou esperando. */
  private async processQueue(automationId: string): Promise<void> {
    if (this.busy.has(automationId)) return
    this.busy.add(automationId)
    try {
      const runs = [...(await store.loadRuns(automationId)).values()]
      if (runs.some((r) => r.status === 'running' || r.status === 'waiting')) return
      const next = runs.filter((r) => r.status === 'queued').sort((a, b) => a.createdAt - b.createdAt)[0]
      if (next) void this.execute(next, null, 0)
    } finally {
      this.busy.delete(automationId)
    }
  }

  /** Roda (ou continua, com `resume`) uma execução até o fim ou até uma pausa. */
  private async execute(run: AutomationRun, resume: Frame[] | null, emails: number): Promise<void> {
    const controller = new AbortController()
    this.live.set(run.id, controller)
    // Antes de qualquer await: a fila já vê esta execução como "rodando".
    run.status = 'running'
    run.startedAt ??= Date.now()
    run.resume = null
    const project = await projects.get(run.projectId)
    if (!resume) {
      run.vars = {
        agora: new Date().toLocaleString('pt-BR'),
        execucao: { id: run.id, gatilho: run.trigger, automacao: run.automationName }
      }
    }
    await this.persist(run)

    const ctx: Ctx = {
      run,
      cwd: project?.path ?? '',
      vars: run.vars,
      emails,
      signal: controller.signal,
      position: [],
      iteration: []
    }

    try {
      if (!project) throw new Error('O projeto desta automação não existe mais.')
      if (!resume) {
        const problems = flowProblems(run.steps)
        if (run.steps.length === 0) throw new Error('A automação não tem passos.')
        if (problems.length > 0) {
          throw new Error(`Passo "${problems[0].step.name}": ${problems[0].problems[0]}`)
        }
      }
      await this.runSteps(ctx, run.steps, resume)
      run.status = 'succeeded'
    } catch (err) {
      if (err instanceof Pause) {
        run.status = 'waiting'
        run.resume = { position: err.position, emails: ctx.emails }
        run.seen = false
      } else if (controller.signal.aborted) {
        const shutdown = controller.signal.reason === 'shutdown'
        const message = shutdown ? 'O app foi fechado durante a execução.' : 'Execução cancelada.'
        this.finishNodes(run, message)
        run.status = shutdown ? 'failed' : 'cancelled'
        run.error = shutdown ? message : null
        run.seen = !shutdown
      } else {
        const message = err instanceof Error ? err.message : String(err)
        this.finishNodes(run, message)
        run.status = 'failed'
        run.error = message
        run.seen = false
      }
    } finally {
      this.live.delete(run.id)
    }

    run.vars = ctx.vars
    if (run.status !== 'waiting') run.endedAt = Date.now()
    await this.persist(run)
    this.announce(run)
    void this.processQueue(run.automationId)
  }

  /** Avisos do Windows ao terminar mal ou ao pedir aprovação. */
  private announce(run: AutomationRun): void {
    const target = { projectId: run.projectId, automationId: run.automationId, runId: run.id }
    if (run.status === 'failed') {
      this.hooks.notify(`Automação falhou: ${run.automationName}`, run.error ?? 'Veja o histórico.', target)
    } else if (run.status === 'waiting' && run.approval) {
      this.hooks.notify(`Aprovação pendente: ${run.automationName}`, run.approval.message.slice(0, 200), target)
    } else if (run.status === 'succeeded' && run.trigger !== 'manual') {
      this.hooks.notify(`Automação concluída: ${run.automationName}`, RUN_STATUS_LABELS.succeeded, target)
    }
  }

  /** Passos que ficaram "rodando" quando a execução parou viram falha. */
  private finishNodes(run: AutomationRun, message: string): void {
    for (const node of run.nodes) {
      if (node.status === 'running' || node.status === 'waiting') {
        Object.assign(node, { status: 'failed', endedAt: Date.now(), error: node.error ?? message })
      }
    }
  }

  private async persist(run: AutomationRun): Promise<void> {
    await store.saveRun(run)
    this.hooks.changed(run.projectId)
  }

  /** Avisa a tela no máximo uma vez por segundo (conversa do agente ao vivo). */
  private progress(run: AutomationRun): void {
    const last = this.lastBroadcast.get(run.id) ?? 0
    if (Date.now() - last < 1000) return
    this.lastBroadcast.set(run.id, Date.now())
    this.hooks.changed(run.projectId)
  }

  // ---- Passos -----------------------------------------------------------------

  private async runSteps(ctx: Ctx, steps: Step[], resume: Frame[] | null): Promise<void> {
    const start = resume ? resume[0].index : 0
    for (let i = start; i < steps.length; i++) {
      const here = resume && i === start ? resume : null
      ctx.position.push({ index: i })
      try {
        await this.runStep(ctx, steps[i], here)
      } finally {
        ctx.position.pop()
      }
    }
  }

  private record(ctx: Ctx, step: Step, input: string | null): NodeRecord {
    const node: NodeRecord = {
      stepId: step.id,
      iteration: [...ctx.iteration],
      status: 'running',
      startedAt: Date.now(),
      endedAt: null,
      input,
      output: null,
      error: null
    }
    ctx.run.nodes.push(node)
    return node
  }

  private existing(ctx: Ctx, step: Step): NodeRecord | undefined {
    return [...ctx.run.nodes]
      .reverse()
      .find((n) => n.stepId === step.id && sameIteration(n.iteration, ctx.iteration))
  }

  private async done(ctx: Ctx, node: NodeRecord, output: unknown): Promise<void> {
    Object.assign(node, { status: 'succeeded', endedAt: Date.now(), output })
    await this.persist(ctx.run)
  }

  private async runStep(ctx: Ctx, step: Step, resume: Frame[] | null): Promise<void> {
    if (ctx.signal.aborted) throw new Error('Execução cancelada.')
    const frame = ctx.position[ctx.position.length - 1]

    // Continuando depois da aprovação: o passo de aprovação já foi resolvido.
    if (step.kind === 'approval' && resume && resume.length === 1) return

    let node = resume ? this.existing(ctx, step) : undefined
    try {
      switch (step.kind) {
        case 'approval': {
          const message = render(step.message, ctx.vars)
          node = this.record(ctx, step, message)
          node.status = 'waiting'
          ctx.run.approval = { stepId: step.id, message, expiresAt: Date.now() + APPROVAL_TTL }
          throw new Pause(ctx.position.map((f) => ({ ...f })))
        }

        case 'if': {
          let branch = resume?.[0].branch
          if (!branch) {
            const value = evaluate(step.condition, ctx.vars)
            branch = value ? 'then' : 'else'
            node = this.record(ctx, step, step.condition)
            node.branch = branch
            await this.done(ctx, node, Boolean(value))
          }
          frame.branch = branch
          await this.runSteps(ctx, step[branch], resume && resume.length > 1 ? resume.slice(1) : null)
          return
        }

        case 'loop': {
          const source = step.mode === 'each' ? step.list : step.count
          const value = evaluate(source, ctx.vars)
          let total: number
          let items: unknown[] = []
          if (step.mode === 'each') {
            if (!Array.isArray(value)) throw new Error(`"${source}" não é uma lista: ${show(value).slice(0, 120)}`)
            items = value
            total = items.length
          } else {
            total = Number(value)
            if (!Number.isInteger(total) || total < 0) throw new Error(`"${source}" não é um número inteiro de vezes.`)
            if (total > 10_000) throw new Error('Um loop pode repetir no máximo 10.000 vezes.')
          }
          if (!node) node = this.record(ctx, step, source)
          node.status = 'running'
          node.output = `${total} ${total === 1 ? 'volta' : 'voltas'}`
          await this.persist(ctx.run)
          const first = resume?.[0].iteration ?? 0
          for (let it = first; it < total; it++) {
            if (step.mode === 'each') ctx.vars[step.item] = items[it]
            ctx.vars[step.index] = it
            frame.iteration = it
            ctx.iteration.push(it)
            try {
              const inner = resume && it === first && resume.length > 1 ? resume.slice(1) : null
              await this.runSteps(ctx, step.body, inner)
            } finally {
              ctx.iteration.pop()
            }
          }
          await this.done(ctx, node, node.output)
          return
        }

        case 'set': {
          node = this.record(ctx, step, step.code)
          const value = coerce(evaluate(step.code, ctx.vars), step.type, `A variável "${step.variable}"`)
          ctx.vars[step.variable] = value
          await this.done(ctx, node, value)
          return
        }

        case 'agent':
          await this.runAgent(ctx, step)
          return

        case 'email': {
          const to = render(step.to, ctx.vars)
            .split(/[,;\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
          const subject = render(step.subject, ctx.vars)
          const text = render(step.body, ctx.vars)
          node = this.record(ctx, step, `Para: ${to.join(', ')}\nAssunto: ${subject}\n\n${text}`)
          if (to.length === 0) throw new Error('Nenhum destinatário.')
          const invalid = to.find((addr) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr))
          if (invalid) throw new Error(`Endereço inválido: ${invalid}`)
          if (ctx.emails + to.length > EMAIL_LIMIT) {
            throw new Error(`Limite de ${EMAIL_LIMIT} e-mails por execução atingido (já enviados: ${ctx.emails}).`)
          }
          await connectors.send(step.connectorId ?? '', { to, subject, text })
          ctx.emails += to.length
          await this.done(ctx, node, `Enviado para ${to.join(', ')}`)
          return
        }

        case 'result': {
          node = this.record(ctx, step, step.value)
          let value: unknown
          if (step.type === 'list') {
            value = evaluate(step.value, ctx.vars)
            if (!Array.isArray(value)) throw new Error(`O resultado deveria ser uma lista: ${show(value).slice(0, 120)}`)
          } else {
            value = render(step.value, ctx.vars).trim()
            if (step.type === 'file' && !isAbsolute(String(value))) value = join(ctx.cwd, String(value))
          }
          ctx.run.result = { type: step.type, value }
          await this.done(ctx, node, value)
          return
        }
      }
    } catch (err) {
      if (err instanceof Pause) throw err
      if (node && node.status !== 'failed') {
        Object.assign(node, {
          status: 'failed',
          endedAt: Date.now(),
          error: err instanceof Error ? err.message : String(err)
        })
      }
      throw err
    }
  }

  private async runAgent(ctx: Ctx, step: AgentStep): Promise<void> {
    const display = render(step.prompt, ctx.vars)
    const node = this.record(ctx, step, display)
    await this.persist(ctx.run)

    const chosen = await skills.contents(ctx.run.projectId, step.skills)
    const format = FORMAT_HINT[step.output.variable ? step.output.type : 'text']
    const prompt = withSkills(display + format, chosen)
    const name = agentInfo(step.agent)?.name ?? step.agent

    try {
      const { text, items } = await runAgentOnce({
        agent: step.agent,
        cwd: ctx.cwd,
        settings: resolveSettings(step.agent, { model: step.model, effort: step.effort }),
        prompt,
        display,
        signal: ctx.signal,
        onProgress: (transcript) => {
          node.transcript = transcript
          this.progress(ctx.run)
        }
      })
      node.transcript = items
      let value: unknown = text
      if (step.output.variable) {
        value = parseOutput(text, step.output.type, `A resposta do ${name}`)
        ctx.vars[step.output.variable] = value
      }
      await this.done(ctx, node, value)
    } catch (err) {
      const items = (err as { items?: ChatItem[] }).items
      if (items) node.transcript = items
      throw err
    }
  }

  // ---- Agendador --------------------------------------------------------------

  private async tick(): Promise<void> {
    const now = Date.now()
    const all = await store.loadAutomations()
    let changed = false
    for (const automation of all) {
      // Aprovações que passaram do prazo.
      for (const run of (await store.loadRuns(automation.id)).values()) {
        if (run.status === 'waiting' && run.approval && run.approval.expiresAt <= now) {
          this.finishNodes(run, 'A aprovação expirou (2 dias sem resposta).')
          Object.assign(run, {
            status: 'expired',
            endedAt: now,
            seen: false,
            approval: null,
            resume: null,
            error: 'A aprovação expirou (2 dias sem resposta).'
          })
          await this.persist(run)
          this.hooks.notify(`Aprovação expirou: ${run.automationName}`, 'A execução foi encerrada.', {
            projectId: run.projectId,
            automationId: run.automationId,
            runId: run.id
          })
          void this.processQueue(automation.id)
        }
      }

      if (!automation.enabled) continue
      const due = this.nextRun(automation)
      if (due === null || due > now) continue
      automation.lastFireAt = now
      changed = true
      const late = now - due > LATE_MS
      if (!late) void this.enqueue(automation.id, 'schedule')
      else if (automation.whenMissed === 'run') void this.enqueue(automation.id, 'missed')
    }
    if (changed) await store.saveAutomations([...all])
  }
}

const FORMAT_HINT: Record<string, string> = {
  text: '',
  number:
    '\n\nFormato da resposta: termine com um bloco ```json contendo só um número. Esse bloco será lido por um programa.',
  boolean:
    '\n\nFormato da resposta: termine com um bloco ```json contendo só true ou false. Esse bloco será lido por um programa.',
  list: '\n\nFormato da resposta: termine com um bloco ```json contendo só uma lista (array JSON). Esse bloco será lido por um programa.',
  object:
    '\n\nFormato da resposta: termine com um bloco ```json contendo só um objeto JSON. Esse bloco será lido por um programa.'
}

/** Lê a resposta do agente no tipo pedido (o último bloco ```json, se houver). */
function parseOutput(text: string, type: string, what: string): unknown {
  if (type === 'text') return text.trim()
  const blocks = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)]
  const candidate = blocks.length > 0 ? blocks[blocks.length - 1][1] : text
  let value: unknown
  try {
    value = JSON.parse(candidate.trim())
  } catch {
    if (type === 'number' || type === 'boolean') value = candidate.trim()
    else throw new Error(`${what} não trouxe um JSON válido no formato pedido.`)
  }
  return coerce(value, type, what)
}

/** Gatilho só com campos válidos. */
function cleanTrigger(trigger: Trigger): Trigger {
  const time = /^\d{1,2}:\d{2}$/.test((trigger as { time?: string }).time ?? '')
    ? (trigger as { time: string }).time
    : '09:00'
  switch (trigger?.kind) {
    case 'once':
      return { kind: 'once', date: /^\d{4}-\d{2}-\d{2}$/.test(trigger.date) ? trigger.date : '', time }
    case 'daily':
      return { kind: 'daily', time }
    case 'weekly':
      return {
        kind: 'weekly',
        days: [...new Set((trigger.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))],
        time
      }
    case 'monthly':
      return { kind: 'monthly', day: Math.min(31, Math.max(1, Math.round(Number(trigger.day) || 1))), time }
    default:
      return { kind: 'manual' }
  }
}
