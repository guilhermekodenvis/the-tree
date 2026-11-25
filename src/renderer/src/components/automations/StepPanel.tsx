// Painel lateral que configura o passo escolhido no quadro (ou o gatilho).
import { useEffect, useState, type ReactNode } from 'react'
import { AGENTS, agentInfo, resolveSettings } from '../../../../shared/agents'
import {
  RESULT_TYPES,
  STEP_LABELS,
  VAR_TYPES,
  WEEKDAY_NAMES,
  describeTrigger,
  formatDateTime,
  stepProblems,
  todayISO,
  type Automation,
  type Connector,
  type Step,
  type Trigger,
  type VarInfo,
  type VarType
} from '../../../../shared/automation'
import type { AgentId, Skill } from '../../../../shared/types'
import { IconButton } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { CodeField } from './CodeField'
import { STEP_ICONS } from './FlowCanvas'

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="form-field">
      <span className="form-field__label">{label}</span>
      {children}
      {hint && <span className="form-field__hint">{hint}</span>}
    </div>
  )
}

function Panel({
  icon,
  kind,
  onClose,
  children,
  footer
}: {
  icon: Parameters<typeof Icon>[0]['name']
  kind: string
  onClose(): void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <aside className="step-panel" aria-label={`Configurar ${kind}`}>
      <header className="step-panel__header">
        <span className="step-panel__icon">
          <Icon name={icon} />
        </span>
        <span className="step-panel__kind">{kind}</span>
        <IconButton icon="dismiss" label="Fechar painel" onClick={onClose} />
      </header>
      <div className="step-panel__body">{children}</div>
      {footer && <footer className="step-panel__footer">{footer}</footer>}
    </aside>
  )
}

// ---- Gatilho ------------------------------------------------------------------

export function TriggerPanel({
  automation,
  nextRunAt,
  onChange,
  onClose
}: {
  automation: Automation
  nextRunAt: number | null
  onChange(change: Partial<Automation>): void
  onClose(): void
}) {
  const { trigger } = automation
  const time = 'time' in trigger ? trigger.time : '09:00'
  const setTrigger = (next: Trigger): void => onChange({ trigger: next })

  const changeKind = (kind: Trigger['kind']): void => {
    switch (kind) {
      case 'manual':
        return setTrigger({ kind })
      case 'once':
        return setTrigger({ kind, date: todayISO(), time })
      case 'daily':
        return setTrigger({ kind, time })
      case 'weekly':
        return setTrigger({ kind, days: [1, 2, 3, 4, 5], time })
      case 'monthly':
        return setTrigger({ kind, day: 5, time })
    }
  }

  return (
    <Panel icon="clock" kind="Gatilho" onClose={onClose}>
      <Field label="Quando rodar">
        <select
          className="field"
          value={trigger.kind}
          onChange={(e) => changeKind(e.target.value as Trigger['kind'])}
        >
          <option value="manual">Só manual (botão "Rodar agora")</option>
          <option value="once">Uma vez, numa data</option>
          <option value="daily">Todo dia</option>
          <option value="weekly">Toda semana</option>
          <option value="monthly">Todo mês</option>
        </select>
      </Field>

      {trigger.kind === 'once' && (
        <Field label="Data">
          <input
            className="field"
            type="date"
            value={trigger.date}
            onChange={(e) => setTrigger({ ...trigger, date: e.target.value })}
          />
        </Field>
      )}

      {trigger.kind === 'weekly' && (
        <Field label="Dias da semana">
          <div className="weekdays">
            {WEEKDAY_NAMES.map((name, day) => {
              const on = trigger.days.includes(day)
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  className={`weekday ${on ? 'weekday--on' : ''}`}
                  onClick={() =>
                    setTrigger({
                      ...trigger,
                      days: on ? trigger.days.filter((d) => d !== day) : [...trigger.days, day]
                    })
                  }
                >
                  {name}
                </button>
              )
            })}
          </div>
        </Field>
      )}

      {trigger.kind === 'monthly' && (
        <Field label="Dia do mês" hint="Em meses mais curtos, 29, 30 e 31 viram o último dia.">
          <input
            className="field"
            type="number"
            min={1}
            max={31}
            value={trigger.day}
            onChange={(e) => setTrigger({ ...trigger, day: Number(e.target.value) })}
          />
        </Field>
      )}

      {trigger.kind !== 'manual' && (
        <>
          <Field label="Horário" hint="Segue o relógio do Windows.">
            <input
              className="field"
              type="time"
              value={time}
              onChange={(e) => setTrigger({ ...trigger, time: e.target.value })}
            />
          </Field>
          <Field
            label="Se o app estiver fechado na hora"
            hint="Vale também para o computador desligado ou dormindo."
          >
            <select
              className="field"
              value={automation.whenMissed}
              onChange={(e) => onChange({ whenMissed: e.target.value as 'run' | 'skip' })}
            >
              <option value="run">Rodar assim que o app abrir</option>
              <option value="skip">Pular esse horário</option>
            </select>
          </Field>
        </>
      )}

      <p className="step-panel__note">
        {describeTrigger(trigger)}.{' '}
        {trigger.kind === 'manual'
          ? ''
          : !automation.enabled
            ? 'A automação está desligada: o horário não dispara.'
            : nextRunAt
              ? `Próxima execução: ${formatDateTime(nextRunAt)}.`
              : 'Não há próxima execução.'}
      </p>
    </Panel>
  )
}

// ---- Passos -------------------------------------------------------------------

interface StepPanelProps {
  step: Step
  projectId: string
  vars: VarInfo[]
  canMoveUp: boolean
  canMoveDown: boolean
  onChange(step: Step): void
  onMove(delta: -1 | 1): void
  onRemove(): void
  onClose(): void
}

export function StepPanel(props: StepPanelProps) {
  const { step, projectId, vars, onChange, onClose } = props
  const [confirming, setConfirming] = useState(false)
  useEffect(() => setConfirming(false), [step.id])
  const problems = stepProblems(step)

  const footer = confirming ? (
    <div className="step-panel__confirm">
      <span className="text-caption">
        Apagar "{step.name}"{step.kind === 'if' || step.kind === 'loop' ? ' e os passos dentro dele' : ''}?
      </span>
      <button type="button" className="btn btn--accent" onClick={props.onRemove}>
        Apagar
      </button>
      <button type="button" className="btn" onClick={() => setConfirming(false)}>
        Cancelar
      </button>
    </div>
  ) : (
    <>
      <IconButton icon="up" label="Subir" disabled={!props.canMoveUp} onClick={() => props.onMove(-1)} />
      <IconButton icon="down" label="Descer" disabled={!props.canMoveDown} onClick={() => props.onMove(1)} />
      <span className="step-panel__spacer" />
      <IconButton icon="delete" label="Apagar passo" danger onClick={() => setConfirming(true)} />
    </>
  )

  return (
    <Panel icon={STEP_ICONS[step.kind]} kind={STEP_LABELS[step.kind]} onClose={onClose} footer={footer}>
      <Field label="Nome do passo">
        <input
          className="field"
          value={step.name}
          maxLength={80}
          onChange={(e) => onChange({ ...step, name: e.target.value })}
        />
      </Field>
      <StepFields step={step} projectId={projectId} vars={vars} onChange={onChange} />
      {problems.length > 0 && (
        <ul className="step-panel__problems" aria-label="Falta configurar">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

const JS_HINT = 'JavaScript. Uma expressão, ou várias linhas terminando com return.'

function StepFields({
  step,
  projectId,
  vars,
  onChange
}: {
  step: Step
  projectId: string
  vars: VarInfo[]
  onChange(step: Step): void
}) {
  switch (step.kind) {
    case 'agent':
      return <AgentFields step={step} projectId={projectId} vars={vars} onChange={onChange} />

    case 'set':
      return (
        <>
          <VariableFields
            name={step.variable}
            type={step.type}
            onChange={(variable, type) => onChange({ ...step, variable, type })}
          />
          <Field label="Valor" hint={JS_HINT}>
            <CodeField
              key={step.id}
              label="Valor"
              mode="js"
              vars={vars}
              value={step.code}
              placeholder={'ex.: palavras.filter(p => p.volume > 1000)'}
              onChange={(code) => onChange({ ...step, code })}
            />
          </Field>
        </>
      )

    case 'if':
      return (
        <Field label="Condição" hint={`${JS_HINT} Verdadeiro segue por "Sim"; falso, por "Não".`}>
          <CodeField
            key={step.id}
            label="Condição"
            mode="js"
            vars={vars}
            value={step.condition}
            placeholder={'ex.: palavras.length > 0'}
            onChange={(condition) => onChange({ ...step, condition })}
          />
        </Field>
      )

    case 'loop':
      return (
        <>
          <Field label="Tipo de loop">
            <select
              className="field"
              value={step.mode}
              onChange={(e) => onChange({ ...step, mode: e.target.value as 'each' | 'times' })}
            >
              <option value="each">Para cada item de uma lista</option>
              <option value="times">Repetir um número de vezes</option>
            </select>
          </Field>
          {step.mode === 'each' ? (
            <>
              <Field label="Lista" hint="JavaScript que resulta numa lista.">
                <CodeField
                  key={`${step.id}-list`}
                  label="Lista"
                  mode="js"
                  lines={1}
                  vars={vars}
                  value={step.list}
                  placeholder="ex.: palavras"
                  onChange={(list) => onChange({ ...step, list })}
                />
              </Field>
              <Field label="Nome do item da vez">
                <input
                  className="field text-mono"
                  value={step.item}
                  onChange={(e) => onChange({ ...step, item: e.target.value.trim() })}
                />
              </Field>
            </>
          ) : (
            <Field label="Quantas vezes" hint="Número ou JavaScript (máximo 10.000).">
              <CodeField
                key={`${step.id}-count`}
                label="Quantas vezes"
                mode="js"
                lines={1}
                vars={vars}
                value={step.count}
                onChange={(count) => onChange({ ...step, count })}
              />
            </Field>
          )}
          <Field label="Nome da posição da vez" hint="Começa em 0. Serve de contador.">
            <input
              className="field text-mono"
              value={step.index}
              onChange={(e) => onChange({ ...step, index: e.target.value.trim() })}
            />
          </Field>
        </>
      )

    case 'email':
      return <EmailFields step={step} vars={vars} onChange={onChange} />

    case 'approval':
      return (
        <Field
          label="O que você vai aprovar"
          hint="A execução para aqui até você aprovar ou recusar (expira em 2 dias)."
        >
          <CodeField
            key={step.id}
            label="Mensagem da aprovação"
            mode="template"
            vars={vars}
            value={step.message}
            placeholder={'ex.: Publicar o artigo "{{titulo}}"?'}
            onChange={(message) => onChange({ ...step, message })}
          />
        </Field>
      )

    case 'result':
      return (
        <>
          <Field label="Tipo do resultado">
            <select
              className="field"
              value={step.type}
              onChange={(e) => onChange({ ...step, type: e.target.value as typeof step.type })}
            >
              {RESULT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Valor"
            hint={
              step.type === 'list'
                ? 'JavaScript que resulta numa lista.'
                : step.type === 'file'
                  ? 'Caminho do arquivo; relativo à pasta do projeto ou completo. Aceita {{variável}}.'
                  : 'Texto; use {{variável}} para pôr valores.'
            }
          >
            <CodeField
              key={`${step.id}-${step.type === 'list' ? 'js' : 'template'}`}
              label="Valor do resultado"
              mode={step.type === 'list' ? 'js' : 'template'}
              vars={vars}
              value={step.value}
              onChange={(value) => onChange({ ...step, value })}
            />
          </Field>
        </>
      )
  }
}

function VariableFields({
  name,
  type,
  optional,
  onChange
}: {
  name: string
  type: VarType
  optional?: boolean
  onChange(name: string, type: VarType): void
}) {
  return (
    <div className="form-row">
      <Field label={optional ? 'Guardar em (variável)' : 'Variável'} hint={optional ? 'Vazio = não guarda.' : undefined}>
        <input
          className="field text-mono"
          value={name}
          placeholder="ex.: palavras"
          onChange={(e) => onChange(e.target.value.trim(), type)}
        />
      </Field>
      <Field label="Tipo">
        <select
          className="field"
          value={type}
          onChange={(e) => onChange(name, e.target.value as VarType)}
        >
          {VAR_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  )
}

function AgentFields({
  step,
  projectId,
  vars,
  onChange
}: {
  step: Extract<Step, { kind: 'agent' }>
  projectId: string
  vars: VarInfo[]
  onChange(step: Step): void
}) {
  const [skills, setSkills] = useState<Skill[] | null>(null)
  useEffect(() => {
    window.api.skills.available(projectId).then(setSkills, () => setSkills([]))
  }, [projectId])
  const info = agentInfo(step.agent)

  return (
    <>
      <div className="form-row">
        <Field label="Agente">
          <select
            className="field"
            value={step.agent}
            onChange={(e) => {
              const agent = e.target.value as AgentId
              const settings = resolveSettings(agent, {})
              onChange({ ...step, agent, model: settings.model, effort: settings.effort })
            }}
          >
            {AGENTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        {info && info.models.length > 0 && (
          <Field label="Modelo">
            <select className="field" value={step.model ?? ''} onChange={(e) => onChange({ ...step, model: e.target.value })}>
              {info.models.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {info && info.efforts.length > 0 && (
          <Field label="Esforço">
            <select className="field" value={step.effort ?? ''} onChange={(e) => onChange({ ...step, effort: e.target.value })}>
              {info.efforts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field
        label="Pedido"
        hint="Use {{variável}} para pôr valores de passos anteriores. O agente roda na pasta do projeto e sem pedir autorização."
      >
        <CodeField
          key={step.id}
          label="Pedido ao agente"
          mode="template"
          lines={6}
          vars={vars}
          value={step.prompt}
          placeholder={'ex.: Pesquise 10 termos de alto volume sobre {{tema}}.'}
          onChange={(prompt) => onChange({ ...step, prompt })}
        />
      </Field>

      <Field label="Skills" hint={skills?.length === 0 ? 'Nenhuma skill neste projeto nem global.' : undefined}>
        <div className="check-list">
          {(skills ?? []).map((skill) => {
            const on = step.skills.includes(skill.id)
            return (
              <label key={skill.id} className="check" title={skill.description}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    onChange({
                      ...step,
                      skills: on ? step.skills.filter((id) => id !== skill.id) : [...step.skills, skill.id]
                    })
                  }
                />
                <span className="truncate">{skill.name}</span>
                <span className="badge">{skill.projectId === null ? 'Global' : 'Projeto'}</span>
              </label>
            )
          })}
        </div>
      </Field>

      <VariableFields
        optional
        name={step.output.variable}
        type={step.output.type}
        onChange={(variable, type) => onChange({ ...step, output: { variable, type } })}
      />
      {step.output.variable && step.output.type !== 'text' && (
        <p className="step-panel__note">
          O agente é instruído a terminar a resposta com um bloco JSON do tipo escolhido; se não vier, o passo falha.
        </p>
      )}
    </>
  )
}

function EmailFields({
  step,
  vars,
  onChange
}: {
  step: Extract<Step, { kind: 'email' }>
  vars: VarInfo[]
  onChange(step: Step): void
}) {
  const [connectors, setConnectors] = useState<Connector[] | null>(null)
  useEffect(() => {
    window.api.connectors.list().then(setConnectors, () => setConnectors([]))
  }, [])

  return (
    <>
      <Field
        label="Enviar pelo conector"
        hint={connectors?.length === 0 ? 'Nenhum conector ainda: crie um em Conectores, no menu lateral.' : undefined}
      >
        <select
          className="field"
          value={step.connectorId ?? ''}
          onChange={(e) => onChange({ ...step, connectorId: e.target.value || null })}
        >
          <option value="">Escolha…</option>
          {(connectors ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.user})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Para" hint="Separe vários endereços por vírgula. Máximo de 20 e-mails por execução.">
        <CodeField key={`${step.id}-to`} label="Para" mode="template" lines={1} vars={vars} value={step.to} onChange={(to) => onChange({ ...step, to })} />
      </Field>
      <Field label="Assunto">
        <CodeField
          key={`${step.id}-subject`}
          label="Assunto"
          mode="template"
          lines={1}
          vars={vars}
          value={step.subject}
          onChange={(subject) => onChange({ ...step, subject })}
        />
      </Field>
      <Field label="Mensagem">
        <CodeField
          key={`${step.id}-body`}
          label="Mensagem"
          mode="template"
          lines={6}
          vars={vars}
          value={step.body}
          onChange={(body) => onChange({ ...step, body })}
        />
      </Field>
    </>
  )
}
