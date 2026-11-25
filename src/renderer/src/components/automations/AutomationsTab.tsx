// Aba "Automações" do projeto: lista à esquerda; à direita, a automação escolhida
// com o quadro do fluxo (edição) e o histórico de execuções. Mudanças são salvas
// sozinhas, meio segundo depois da última edição.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ATTENTION,
  describeTrigger,
  flowProblems,
  formatDateTime,
  RUN_STATUS_LABELS,
  scopeAt,
  type Automation,
  type AutomationSummary
} from '../../../../shared/automation'
import type { Project } from '../../../../shared/types'
import { useAutomationList, useRuns } from '../../hooks/useAutomations'
import { messageOf } from '../../lib/errors'
import { Button, IconButton } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Tabs } from '../ui/Tabs'
import { FlowCanvas, TRIGGER_ID } from './FlowCanvas'
import { insertStep, moveStep, newStep, positionOf, removeStep, replaceStep } from './flow'
import { RunsView } from './RunsView'
import { StepPanel, TriggerPanel } from './StepPanel'

/** Pedido para abrir uma execução (ex.: clique num aviso do Windows). */
export interface OpenRunTarget {
  automationId: string
  runId: string
}

interface Props {
  project: Project
  openTarget: OpenRunTarget | null
  onOpened(): void
}

function statusLine(s: AutomationSummary): string {
  if (s.active) return RUN_STATUS_LABELS[s.active.status]
  if (s.automation.trigger.kind === 'manual') return 'Manual'
  if (!s.automation.enabled) return 'Desligada'
  return s.nextRunAt ? `Próxima: ${formatDateTime(s.nextRunAt)}` : 'Sem próxima execução'
}

export function AutomationsTab({ project, openTarget, onOpened }: Props) {
  const { list, error, setError, refresh } = useAutomationList(project.id)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<'flow' | 'runs'>('flow')
  const [run, setRun] = useState<string | null>(null)

  // Sem escolha, abre a primeira da lista.
  useEffect(() => {
    if (list && list.length > 0 && !list.some((s) => s.automation.id === selected)) {
      setSelected(list[0].automation.id)
    }
  }, [list, selected])

  // Clique num aviso: abre a automação já na execução.
  useEffect(() => {
    if (!openTarget) return
    setSelected(openTarget.automationId)
    setView('runs')
    setRun(openTarget.runId)
    onOpened()
  }, [openTarget, onOpened])

  const create = async (): Promise<void> => {
    setError(null)
    try {
      const automation = await window.api.automations.create(project.id)
      // A lista precisa já ter a nova antes de escolhê-la (senão volta para a primeira).
      await refresh()
      setSelected(automation.id)
      setView('flow')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  const current = list?.find((s) => s.automation.id === selected) ?? null

  return (
    <div className="split">
      <aside className="split__side">
        <div className="split__side-header">
          Automações
          <IconButton icon="add" label="Nova automação" onClick={() => void create()} />
        </div>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {list?.length === 0 && <p className="tree-note">Nenhuma automação ainda. Use o + para criar.</p>}
        <ul className="agent-list">
          {(list ?? []).map((s) => (
            <li key={s.automation.id}>
              <button
                type="button"
                className={`agent-item automation-item ${s.automation.id === selected ? 'agent-item--selected' : ''}`}
                onClick={() => {
                  setSelected(s.automation.id)
                  setRun(null)
                }}
              >
                <Icon name={s.active?.status === 'running' ? 'refresh' : 'flag'} />
                <span className="card__body">
                  <span className="truncate">{s.automation.name}</span>
                  <span className="text-caption truncate">{statusLine(s)}</span>
                </span>
                {s.unseen > 0 && <span className="badge-dot" aria-label="Execução não vista" />}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="split__main">
        {current ? (
          <AutomationView
            key={current.automation.id}
            summary={current}
            projectId={project.id}
            view={view}
            onViewChange={setView}
            run={run}
            onRunChange={setRun}
            onRemoved={() => setSelected(null)}
          />
        ) : (
          <div className="empty-state">
            <Icon name="flag" className="empty-state__icon" />
            <p className="empty-state__title">Nenhuma automação escolhida</p>
            <p>Uma automação é uma sequência de passos (agentes, condições, loops, e-mails) que roda sozinha.</p>
            <Button variant="accent" icon="add" className="empty-state__action" onClick={() => void create()}>
              Nova automação
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

function AutomationView({
  summary,
  projectId,
  view,
  onViewChange,
  run,
  onRunChange,
  onRemoved
}: {
  summary: AutomationSummary
  projectId: string
  view: 'flow' | 'runs'
  onViewChange(view: 'flow' | 'runs'): void
  run: string | null
  onRunChange(runId: string | null): void
  onRemoved(): void
}) {
  // Rascunho local: a tela responde na hora; o disco é gravado logo depois.
  const [draft, setDraft] = useState<Automation>(summary.automation)
  const [nextRunAt, setNextRunAt] = useState(summary.nextRunAt)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const saveTimer = useRef<number | null>(null)
  const pending = useRef<Automation | null>(null)
  const runs = useRuns(projectId, summary.automation.id)

  useEffect(() => setNextRunAt(summary.nextRunAt), [summary.nextRunAt])

  const flush = async (): Promise<void> => {
    const next = pending.current
    if (!next) return
    pending.current = null
    try {
      const saved = await window.api.automations.save(next)
      setNextRunAt(saved.nextRunAt)
    } catch (err) {
      setError(messageOf(err))
    }
  }

  // Grava o que estiver pendente ao trocar de automação ou sair da aba.
  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      void flush()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const update = (change: Partial<Automation>): void => {
    setError(null)
    setDraft((current) => {
      const next = { ...current, ...change }
      pending.current = next
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => void flush(), 500)
      return next
    })
  }

  const runNow = async (): Promise<void> => {
    setError(null)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    await flush()
    try {
      const runId = await window.api.automations.run(draft.id)
      onRunChange(runId)
      onViewChange('runs')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  const remove = async (): Promise<void> => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    pending.current = null
    try {
      await window.api.automations.remove(draft.id)
      onRemoved()
    } catch (err) {
      setError(messageOf(err))
    }
  }

  const problems = useMemo(() => flowProblems(draft.steps), [draft.steps])
  const unseen = (runs ?? []).some((r) => !r.seen && ATTENTION.includes(r.status))
  const step = selected && selected !== TRIGGER_ID ? findStep(draft, selected) : null
  const position = step ? positionOf(draft.steps, step.id) : null

  return (
    <div className="automation">
      <header className="automation__header">
        <div className="card__body">
          <input
            className="automation__name"
            value={draft.name}
            maxLength={80}
            aria-label="Nome da automação"
            onChange={(e) => update({ name: e.target.value })}
            onBlur={() => {
              if (!draft.name.trim()) update({ name: summary.automation.name })
            }}
          />
          <p className="text-caption truncate">
            {describeTrigger(draft.trigger)}
            {draft.trigger.kind !== 'manual' && draft.enabled && nextRunAt
              ? ` · próxima: ${formatDateTime(nextRunAt)}`
              : ''}
          </p>
        </div>
        {draft.trigger.kind !== 'manual' && (
          <button
            type="button"
            role="switch"
            aria-checked={draft.enabled}
            className="switch switch--accent"
            title={draft.enabled ? 'Ligada: dispara no horário.' : 'Desligada: o horário não dispara.'}
            onClick={() => update({ enabled: !draft.enabled })}
          >
            Ligada
            <span className="switch__track">
              <span className="switch__thumb" />
            </span>
          </button>
        )}
        <Button
          variant="accent"
          icon="play"
          disabled={draft.steps.length === 0}
          title={problems.length > 0 ? 'Há passos por configurar; a execução vai falhar neles.' : undefined}
          onClick={() => void runNow()}
        >
          Rodar agora
        </Button>
        {confirmRemove ? (
          <span className="automation__confirm">
            <span className="text-caption">Apagar a automação e o histórico?</span>
            <Button variant="accent" onClick={() => void remove()}>
              Apagar
            </Button>
            <Button onClick={() => setConfirmRemove(false)}>Cancelar</Button>
          </span>
        ) : (
          <IconButton icon="delete" label="Apagar automação" danger onClick={() => setConfirmRemove(true)} />
        )}
      </header>

      <div className="automation__tabs">
        <Tabs
          label="Seções da automação"
          active={view}
          onChange={onViewChange}
          tabs={[
            { id: 'flow', label: 'Fluxo', icon: 'branch' },
            { id: 'runs', label: 'Execuções', icon: 'clock', badge: unseen }
          ]}
        />
        {view === 'flow' && problems.length > 0 && (
          <span className="automation__problems">
            {problems.length === 1 ? '1 passo por configurar' : `${problems.length} passos por configurar`}
          </span>
        )}
      </div>

      {error && (
        <p className="notice automation__notice" role="alert">
          {error}
        </p>
      )}

      {view === 'flow' ? (
        <div className="automation__body">
          <FlowCanvas
            steps={draft.steps}
            trigger={{
              title: draft.trigger.kind === 'manual' ? 'Manual' : describeTrigger(draft.trigger),
              subtitle:
                draft.trigger.kind === 'manual'
                  ? 'Botão "Rodar agora"'
                  : !draft.enabled
                    ? 'Desligada'
                    : nextRunAt
                      ? `Próxima: ${formatDateTime(nextRunAt)}`
                      : 'Sem próxima execução'
            }}
            mode="edit"
            selected={selected}
            onSelect={setSelected}
            onInsert={(slot, kind) => {
              const created = newStep(kind, draft.steps)
              update({ steps: insertStep(draft.steps, slot, created) })
              setSelected(created.id)
            }}
            viewKey={`edit:${draft.id}`}
          />
          {selected === TRIGGER_ID && (
            <TriggerPanel
              automation={draft}
              nextRunAt={nextRunAt}
              onChange={update}
              onClose={() => setSelected(null)}
            />
          )}
          {step && (
            <StepPanel
              step={step}
              projectId={projectId}
              vars={scopeAt(draft.steps, step.id)}
              canMoveUp={(position?.index ?? 0) > 0}
              canMoveDown={!!position && position.index < position.total - 1}
              onChange={(next) => update({ steps: replaceStep(draft.steps, next) })}
              onMove={(delta) => update({ steps: moveStep(draft.steps, step.id, delta) })}
              onRemove={() => {
                update({ steps: removeStep(draft.steps, step.id) })
                setSelected(null)
              }}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      ) : (
        <RunsView
          projectId={projectId}
          automationId={draft.id}
          runs={runs}
          selected={run ?? runs?.[0]?.id ?? null}
          onSelect={onRunChange}
        />
      )}
    </div>
  )
}

function findStep(automation: Automation, id: string) {
  let found = null as Automation['steps'][number] | null
  const visit = (list: Automation['steps']): void => {
    for (const s of list) {
      if (s.id === id) found = s
      if (s.kind === 'if') {
        visit(s.then)
        visit(s.else)
      } else if (s.kind === 'loop') visit(s.body)
    }
  }
  visit(automation.steps)
  return found
}
