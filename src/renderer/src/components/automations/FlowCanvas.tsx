// Quadro do fluxo, no estilo de um canvas: arraste o fundo para mover, use a
// roda do mouse para rolar e Ctrl + roda (ou os botões) para o zoom.
// Os passos não se arrastam: o layout é automático, de cima para baixo. Um "se"
// abre dois caminhos lado a lado; um loop é uma caixa em volta dos passos dele.
// No modo de edição, o + entre dois passos insere um passo novo ali.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { agentInfo } from '../../../../shared/agents'
import {
  RESULT_TYPES,
  STEP_LABELS,
  stepProblems,
  type NodeStatus,
  type Step,
  type StepKind
} from '../../../../shared/automation'
import { IconButton } from '../ui/Button'
import { Icon, type IconName } from '../ui/Icon'
import type { Container, Slot } from './flow'

export const TRIGGER_ID = '__trigger'

export const STEP_ICONS: Record<StepKind, IconName> = {
  agent: 'chat',
  set: 'variable',
  if: 'branch',
  loop: 'loop',
  email: 'mail',
  approval: 'approve',
  result: 'flag'
}

const INSERTABLE: StepKind[] = ['agent', 'set', 'if', 'loop', 'email', 'approval', 'result']

interface Props {
  steps: Step[]
  trigger: { title: string; subtitle: string }
  mode: 'edit' | 'run'
  selected: string | null
  onSelect(id: string | null): void
  onInsert?(slot: Slot, kind: StepKind): void
  /** Modo histórico: como cada passo terminou (null = não chegou a rodar). */
  statusOf?(stepId: string): NodeStatus | null
  /** Lembra a posição e o zoom por automação. */
  viewKey: string
}

interface View {
  x: number
  y: number
  k: number
}

const MIN_ZOOM = 0.3
const MAX_ZOOM = 2
const views = new Map<string, View>()
const clamp = (k: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))

const short = (text: string, max = 70): string => {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

/** Linha de resumo do passo, mostrada no cartão. */
function summaryOf(step: Step): string {
  switch (step.kind) {
    case 'agent': {
      const info = agentInfo(step.agent)
      const model = info?.models.find((c) => c.id === step.model)?.label
      const out = step.output.variable ? ` → ${step.output.variable}` : ''
      return `${info?.name ?? step.agent}${model ? ` · ${model}` : ''}${out}`
    }
    case 'set':
      return step.code ? `${step.variable} = ${short(step.code, 50)}` : step.variable
    case 'if':
      return step.condition ? short(step.condition) : 'Sem condição'
    case 'loop':
      return step.mode === 'each'
        ? `Para cada ${step.item} em ${short(step.list, 40) || '…'}`
        : `Repetir ${short(step.count, 30) || '…'} vezes`
    case 'email':
      return step.to ? `Para ${short(step.to, 50)}` : 'Sem destinatário'
    case 'approval':
      return step.message ? short(step.message) : 'Sem mensagem'
    case 'result':
      return `${RESULT_TYPES.find((t) => t.id === step.type)?.label}: ${short(step.value, 50) || '…'}`
  }
}

export function FlowCanvas(props: Props) {
  const { steps, trigger, mode, selected, onSelect, onInsert, statusOf, viewKey } = props
  const canvas = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(() => views.get(viewKey) ?? { x: 0, y: 32, k: 1 })
  const [menu, setMenu] = useState<{ slot: Slot; left: number; top: number } | null>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  useEffect(() => {
    views.set(viewKey, view)
  }, [viewKey, view])

  /** Centraliza o fluxo; com `fit`, também ajusta o zoom para caber inteiro. */
  const center = useCallback((fit: boolean) => {
    const c = canvas.current
    const w = world.current
    if (!c || !w) return
    const k = fit ? clamp(Math.min(1, (c.clientWidth - 64) / w.offsetWidth, (c.clientHeight - 64) / w.offsetHeight)) : 1
    setView({ k, x: (c.clientWidth - w.offsetWidth * k) / 2, y: 32 })
  }, [])

  // Primeira vez nesta automação: fluxo centralizado no topo.
  useLayoutEffect(() => {
    if (!views.has(viewKey)) center(false)
  }, [viewKey, center])

  // Roda do mouse: rola; com Ctrl (ou pinça no touchpad), zoom no ponto do cursor.
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      setMenu(null)
      if (event.ctrlKey) {
        const rect = c.getBoundingClientRect()
        const px = event.clientX - rect.left
        const py = event.clientY - rect.top
        setView((v) => {
          const k = clamp(v.k * Math.exp(-event.deltaY * 0.002))
          return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }
        })
      } else {
        const dx = event.shiftKey ? event.deltaY : event.deltaX
        const dy = event.shiftKey ? 0 : event.deltaY
        setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
      }
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (factor: number): void => {
    const c = canvas.current
    if (!c) return
    const px = c.clientWidth / 2
    const py = c.clientHeight / 2
    setView((v) => {
      const k = clamp(v.k * factor)
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }
    })
  }

  const openMenu = (slot: Slot, button: HTMLElement): void => {
    const c = canvas.current
    if (!c) return
    const rect = button.getBoundingClientRect()
    const base = c.getBoundingClientRect()
    setMenu({ slot, left: rect.left - base.left + rect.width / 2, top: rect.bottom - base.top + 4 })
  }

  const link = (container: Container, index: number): ReactNode => (
    <div className="flow-link" key={`link-${container?.stepId ?? 'root'}-${container?.branch ?? ''}-${index}`}>
      {mode === 'edit' && onInsert && (
        <button
          type="button"
          className="flow-link__add"
          aria-label="Inserir passo aqui"
          title="Inserir passo aqui"
          onClick={(event) => openMenu({ container, index }, event.currentTarget)}
        >
          <Icon name="add" />
        </button>
      )}
    </div>
  )

  const node = (step: Step): ReactNode => {
    const status = statusOf?.(step.id) ?? null
    const problems = mode === 'edit' ? stepProblems(step) : []
    const classes = [
      'flow-node',
      `flow-node--${step.kind}`,
      selected === step.id ? 'flow-node--selected' : '',
      mode === 'run' ? (status ? `flow-node--${status}` : 'flow-node--idle') : ''
    ]
    return (
      <button
        type="button"
        className={classes.filter(Boolean).join(' ')}
        onClick={() => onSelect(step.id)}
        title={problems.length > 0 ? problems.join('\n') : undefined}
      >
        <span className="flow-node__icon">
          <Icon name={STEP_ICONS[step.kind]} />
        </span>
        <span className="flow-node__body">
          <span className="flow-node__kind">{STEP_LABELS[step.kind]}</span>
          <span className="flow-node__name truncate">{step.name}</span>
          <span className="flow-node__summary truncate">{summaryOf(step)}</span>
        </span>
        {problems.length > 0 && <span className="flow-node__problem" aria-label="Falta configurar" />}
        {status && <StatusMark status={status} />}
      </button>
    )
  }

  const sequence = (list: Step[], container: Container): ReactNode => (
    <div className="flow-seq">
      {link(container, 0)}
      {list.map((step, index) => (
        <div className="flow-item" key={step.id}>
          {step.kind === 'if' ? (
            <div className="flow-if">
              {node(step)}
              <div className="flow-branches">
                {(['then', 'else'] as const).map((branch) => (
                  <div className="flow-branch" key={branch}>
                    <span className={`flow-branch__label flow-branch__label--${branch}`}>
                      {branch === 'then' ? 'Sim' : 'Não'}
                    </span>
                    {sequence(step[branch], { stepId: step.id, branch })}
                  </div>
                ))}
              </div>
            </div>
          ) : step.kind === 'loop' ? (
            <div className="flow-loop">
              {node(step)}
              {sequence(step.body, { stepId: step.id, branch: 'body' })}
              <span className="flow-loop__repeat">
                <Icon name="loop" />
                repete
              </span>
            </div>
          ) : (
            node(step)
          )}
          {link(container, index + 1)}
        </div>
      ))}
    </div>
  )

  return (
    <div
      className={`flow-canvas ${drag.current?.moved ? 'flow-canvas--dragging' : ''}`}
      ref={canvas}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest('button, .flow-menu')) return
        setMenu(null)
        drag.current = { x: event.clientX, y: event.clientY, moved: false }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const d = drag.current
        if (!d) return
        const dx = event.clientX - d.x
        const dy = event.clientY - d.y
        if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return
        d.moved = true
        d.x = event.clientX
        d.y = event.clientY
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
      }}
      onPointerUp={() => {
        // Clique no fundo (sem arrastar) tira a seleção.
        if (drag.current && !drag.current.moved) onSelect(null)
        drag.current = null
      }}
    >
      <div
        className="flow-world"
        ref={world}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        <button
          type="button"
          className={`flow-node flow-node--trigger ${selected === TRIGGER_ID ? 'flow-node--selected' : ''}`}
          onClick={() => onSelect(TRIGGER_ID)}
        >
          <span className="flow-node__icon">
            <Icon name="clock" />
          </span>
          <span className="flow-node__body">
            <span className="flow-node__kind">Gatilho</span>
            <span className="flow-node__name truncate">{trigger.title}</span>
            <span className="flow-node__summary truncate">{trigger.subtitle}</span>
          </span>
        </button>
        {sequence(steps, null)}
        <span className="flow-end">Fim</span>
      </div>

      {menu && (
        <div className="flow-menu popover" role="menu" style={{ left: menu.left, top: menu.top }}>
          <p className="popover__title">Inserir passo</p>
          {INSERTABLE.map((kind) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              className="popover__item"
              onClick={() => {
                onInsert?.(menu.slot, kind)
                setMenu(null)
              }}
            >
              <Icon name={STEP_ICONS[kind]} />
              {STEP_LABELS[kind]}
            </button>
          ))}
        </div>
      )}

      <div className="flow-zoom" role="toolbar" aria-label="Zoom do quadro">
        <IconButton icon="zoomOut" label="Diminuir zoom" onClick={() => zoomBy(1 / 1.2)} />
        <button type="button" className="flow-zoom__value" title="Voltar para 100%" onClick={() => center(false)}>
          {Math.round(view.k * 100)}%
        </button>
        <IconButton icon="zoomIn" label="Aumentar zoom" onClick={() => zoomBy(1.2)} />
        <IconButton icon="fit" label="Ajustar à tela" onClick={() => center(true)} />
      </div>
    </div>
  )
}

const STATUS_TEXT: Record<NodeStatus, string> = {
  running: 'Rodando',
  succeeded: 'Concluído',
  failed: 'Falhou',
  waiting: 'Aguardando você',
  skipped: 'Pulado'
}

function StatusMark({ status }: { status: NodeStatus }) {
  const icon: IconName = status === 'succeeded' ? 'check' : status === 'failed' ? 'dismiss' : status === 'waiting' ? 'approve' : 'refresh'
  return (
    <span className={`flow-node__status flow-node__status--${status}`} title={STATUS_TEXT[status]}>
      <Icon name={icon} />
    </span>
  )
}
