// Histórico de execuções de uma automação: a lista à esquerda e, ao escolher uma,
// o quadro com a cor de cada passo (concluído, falhou, aguardando, não rodou) e o
// que entrou e saiu de cada um. Abrir uma execução a marca como vista.
import { useEffect, useMemo, useState } from 'react'
import {
  RUN_STATUS_LABELS,
  ATTENTION,
  formatDateTime,
  locate,
  type AutomationRun,
  type NodeRecord,
  type NodeStatus,
  type RunResult,
  type RunSummary
} from '../../../../shared/automation'
import { useRun } from '../../hooks/useAutomations'
import { messageOf } from '../../lib/errors'
import { ChatItemView } from '../ChatView'
import { Button, IconButton } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { FlowCanvas, STEP_ICONS, TRIGGER_ID } from './FlowCanvas'

const TRIGGER_LABEL: Record<AutomationRun['trigger'], string> = {
  manual: 'Rodada manualmente',
  schedule: 'Pelo horário',
  missed: 'Horário perdido, rodada ao voltar'
}

function duration(run: { startedAt: number | null; endedAt: number | null }): string {
  if (!run.startedAt) return ''
  const ms = (run.endedAt ?? Date.now()) - run.startedAt
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`
}

export function RunsView({
  projectId,
  automationId,
  runs,
  selected,
  onSelect
}: {
  projectId: string
  automationId: string
  runs: RunSummary[] | null
  selected: string | null
  onSelect(runId: string | null): void
}) {
  const run = useRun(projectId, automationId, selected)

  // Abrir uma execução que pedia atenção tira a bolinha.
  useEffect(() => {
    if (run && !run.seen) void window.api.automations.markSeen(automationId, run.id)
  }, [run, automationId])

  return (
    <div className="runs">
      <ul className="runs__list" aria-label="Execuções">
        {runs?.length === 0 && <p className="group-empty">Nenhuma execução ainda. Use "Rodar agora" para testar.</p>}
        {(runs ?? []).map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className={`run-item ${r.id === selected ? 'run-item--selected' : ''}`}
              onClick={() => onSelect(r.id)}
            >
              <span className={`run-dot run-dot--${r.status}`} />
              <span className="card__body">
                <span className="run-item__title">{RUN_STATUS_LABELS[r.status]}</span>
                <span className="text-caption truncate">
                  {formatDateTime(r.createdAt)}
                  {r.startedAt ? ` · ${duration(r)}` : ''}
                </span>
              </span>
              {!r.seen && ATTENTION.includes(r.status) && <span className="badge-dot" aria-label="Não vista" />}
            </button>
          </li>
        ))}
      </ul>

      <section className="runs__detail">
        {!selected || !run ? (
          <div className="empty-state">
            <Icon name="clock" className="empty-state__icon" />
            <p className="empty-state__title">Escolha uma execução</p>
            <p>Veja o que cada passo recebeu e entregou.</p>
          </div>
        ) : (
          <RunDetail key={run.id} run={run} />
        )}
      </section>
    </div>
  )
}

/** Situação de um passo na execução (somando as voltas dos loops). */
function statusOf(nodes: NodeRecord[], stepId: string): NodeStatus | null {
  const mine = nodes.filter((n) => n.stepId === stepId)
  if (mine.length === 0) return null
  for (const s of ['failed', 'waiting', 'running', 'succeeded'] as NodeStatus[]) {
    if (mine.some((n) => n.status === s)) return s
  }
  return mine[0].status
}

function RunDetail({ run }: { run: AutomationRun }) {
  const [node, setNode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const active = run.status === 'running' || run.status === 'queued' || run.status === 'waiting'

  const act = async (action: () => Promise<void>): Promise<void> => {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(messageOf(err))
    }
  }

  return (
    <div className="run-detail">
      <header className="run-detail__header">
        <span className={`run-chip run-chip--${run.status}`}>{RUN_STATUS_LABELS[run.status]}</span>
        <span className="text-caption">
          {TRIGGER_LABEL[run.trigger]} · {formatDateTime(run.createdAt)}
          {run.startedAt ? ` · ${duration(run)}` : ''}
        </span>
        <span className="step-panel__spacer" />
        {active && (
          <Button icon="stop" onClick={() => void act(() => window.api.automations.cancel(run.automationId, run.id))}>
            Cancelar
          </Button>
        )}
      </header>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {run.status === 'waiting' && run.approval && (
        <div className="approval">
          <div className="approval__title">
            <Icon name="approve" />
            Aprovação pendente
          </div>
          <p className="approval__message">{run.approval.message}</p>
          <p className="text-caption">Expira em {formatDateTime(run.approval.expiresAt)}.</p>
          <div className="permission__actions">
            <Button
              variant="accent"
              icon="check"
              onClick={() => void act(() => window.api.automations.decide(run.automationId, run.id, true))}
            >
              Aprovar e continuar
            </Button>
            <Button onClick={() => void act(() => window.api.automations.decide(run.automationId, run.id, false))}>
              Recusar
            </Button>
          </div>
        </div>
      )}

      {run.error && (
        <p className="notice" role="alert">
          {run.error}
        </p>
      )}

      {run.result && <ResultView result={run.result} />}

      <div className="run-detail__flow">
        <FlowCanvas
          steps={run.steps}
          trigger={{ title: TRIGGER_LABEL[run.trigger], subtitle: formatDateTime(run.createdAt) }}
          mode="run"
          selected={node}
          onSelect={(id) => setNode(id === TRIGGER_ID ? null : id)}
          statusOf={(stepId) => statusOf(run.nodes, stepId)}
          viewKey={`run:${run.id}`}
        />
        {node && <NodeRecords run={run} stepId={node} onClose={() => setNode(null)} />}
      </div>
    </div>
  )
}

function ResultView({ result }: { result: RunResult }) {
  const value = result.value
  return (
    <div className="run-result">
      <div className="run-result__title">
        <Icon name="flag" />
        Resultado
      </div>
      {result.type === 'list' && Array.isArray(value) ? (
        <ul className="run-result__list">
          {value.map((item, i) => (
            <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
          ))}
        </ul>
      ) : result.type === 'link' ? (
        <a className="link" href={String(value)} target="_blank" rel="noreferrer">
          {String(value)}
        </a>
      ) : result.type === 'file' ? (
        <div className="run-result__file">
          <span className="text-mono truncate">{String(value)}</span>
          <Button icon="folder" onClick={() => void window.api.system.showInFolder(String(value))}>
            Mostrar na pasta
          </Button>
        </div>
      ) : (
        <p className="run-result__text">{String(value)}</p>
      )}
    </div>
  )
}

const pretty = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2)

function NodeRecords({ run, stepId, onClose }: { run: AutomationRun; stepId: string; onClose(): void }) {
  const records = useMemo(() => run.nodes.filter((n) => n.stepId === stepId), [run.nodes, stepId])
  const [index, setIndex] = useState(0)
  useEffect(() => setIndex(records.length > 0 ? records.length - 1 : 0), [stepId, records.length])
  const step = locate(run.steps, stepId)?.step
  const record = records[Math.min(index, records.length - 1)]

  return (
    <aside className="step-panel" aria-label="Detalhes do passo">
      <header className="step-panel__header">
        <span className="step-panel__icon">{step && <Icon name={STEP_ICONS[step.kind]} />}</span>
        <span className="step-panel__kind truncate">{step?.name ?? 'Passo'}</span>
        <IconButton icon="dismiss" label="Fechar painel" onClick={onClose} />
      </header>
      <div className="step-panel__body">
        {records.length === 0 ? (
          <p className="step-panel__note">Este passo não rodou nesta execução.</p>
        ) : (
          <>
            {records.length > 1 && (
              <div className="iterations" role="tablist" aria-label="Voltas do loop">
                {records.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    className={`iteration iteration--${r.status} ${i === index ? 'iteration--active' : ''}`}
                    onClick={() => setIndex(i)}
                  >
                    {r.iteration.map((n) => n + 1).join('.')}
                  </button>
                ))}
              </div>
            )}
            {record && (
              <>
                <p className="text-caption">
                  {record.status === 'succeeded' && 'Concluído'}
                  {record.status === 'failed' && 'Falhou'}
                  {record.status === 'running' && 'Rodando…'}
                  {record.status === 'waiting' && 'Aguardando você'}
                  {record.status === 'skipped' && 'Pulado'}
                  {record.endedAt ? ` em ${duration({ startedAt: record.startedAt, endedAt: record.endedAt })}` : ''}
                  {record.branch ? ` · seguiu por "${record.branch === 'then' ? 'Sim' : 'Não'}"` : ''}
                </p>
                {record.error && (
                  <p className="notice" role="alert">
                    {record.error}
                  </p>
                )}
                {record.input !== null && (
                  <div className="form-field">
                    <span className="form-field__label">Entrada</span>
                    <pre className="record-box">{record.input}</pre>
                  </div>
                )}
                {record.output !== null && record.output !== undefined && (
                  <div className="form-field">
                    <span className="form-field__label">Saída</span>
                    <pre className="record-box">{pretty(record.output)}</pre>
                  </div>
                )}
                {record.transcript && (
                  <div className="form-field">
                    <span className="form-field__label">Conversa do agente</span>
                    <div className="record-chat">
                      {record.transcript.slice(1).map((item) => (
                        <ChatItemView key={`${item.kind}-${item.id}`} item={item} onRespond={() => undefined} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
