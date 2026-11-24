// Caixa de mensagem da conversa. Digitar "/" abre o menu de skills: a escolhida
// vira uma etiqueta acima do texto e vai junto com a próxima mensagem.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Skill } from '../../../shared/types'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'

interface Props {
  agentName: string
  /** Agente trabalhando ou iniciando: não dá para enviar agora. */
  busy: boolean
  /** Mostra "Parar" no lugar de "Enviar". */
  canInterrupt: boolean
  /** Skills que esta conversa pode usar (globais e as deste projeto). */
  loadSkills(): Promise<Skill[]>
  onSend(text: string, skills: Skill[]): void
  onInterrupt(): void
}

/** "/" no começo ou depois de um espaço, seguido do que já foi digitado do nome. */
const SLASH = /(^|\s)\/([^\s/]*)$/

interface SlashMenu {
  /** Posição da "/" no texto. */
  start: number
  query: string
}

function matches(skill: Skill, query: string): boolean {
  const q = query.toLowerCase()
  return skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q)
}

export function Composer({ agentName, busy, canInterrupt, loadSkills, onSend, onInterrupt }: Props) {
  const [draft, setDraft] = useState('')
  const [picked, setPicked] = useState<Skill[]>([])
  const [menu, setMenu] = useState<SlashMenu | null>(null)
  const [options, setOptions] = useState<Skill[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const caretRef = useRef<number | null>(null)

  const canSend = (draft.trim() !== '' || picked.length > 0) && !busy
  const pickedIds = new Set(picked.map((s) => s.id))
  const filtered = menu
    ? (options ?? []).filter((s) => !pickedIds.has(s.id) && matches(s, menu.query))
    : []

  // Depois de escolher uma skill, o cursor volta para onde estava a "/".
  useEffect(() => {
    const field = fieldRef.current
    if (field && caretRef.current !== null) {
      field.focus()
      field.setSelectionRange(caretRef.current, caretRef.current)
      caretRef.current = null
    }
  }, [draft])

  // Item ativo sempre visível ao navegar com as setas.
  useEffect(() => {
    document.querySelector('.skill-menu [aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  /** Abre, atualiza ou fecha o menu conforme o texto antes do cursor. */
  const updateMenu = (value: string, caret: number): void => {
    const match = SLASH.exec(value.slice(0, caret))
    if (!match) {
      setMenu(null)
      return
    }
    const query = match[2]
    if (!menu) {
      // Lista nova a cada abertura: pega skills adicionadas nesse meio tempo.
      setActive(0)
      setLoadError(null)
      loadSkills()
        .then(setOptions)
        .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
    } else if (query !== menu.query) {
      setActive(0)
    }
    setMenu({ start: caret - query.length - 1, query })
  }

  const choose = (skill: Skill): void => {
    if (!menu) return
    const end = menu.start + 1 + menu.query.length
    caretRef.current = menu.start
    setDraft(draft.slice(0, menu.start) + draft.slice(end))
    setPicked((list) => [...list, skill])
    setMenu(null)
  }

  const submit = (): void => {
    if (!canSend) return
    onSend(draft.trim(), picked)
    setDraft('')
    setPicked([])
    setMenu(null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (menu) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenu(null)
        return
      }
      if (filtered.length > 0) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const step = event.key === 'ArrowDown' ? 1 : -1
          setActive((i) => (i + step + filtered.length) % filtered.length)
          return
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault()
          choose(filtered[Math.min(active, filtered.length - 1)])
          return
        }
      }
    }
    // Backspace com o campo vazio tira a última skill escolhida.
    if (event.key === 'Backspace' && draft === '' && picked.length > 0) {
      setPicked((list) => list.slice(0, -1))
      return
    }
    // Enter envia; Shift+Enter quebra a linha.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="chat__composer">
      {menu && (
        <div className="skill-menu" role="listbox" aria-label="Skills">
          <p className="popover__title">Skills</p>
          {loadError && <p className="popover__hint">{loadError}</p>}
          {!loadError && options === null && <p className="popover__hint">Carregando…</p>}
          {options !== null && options.length === 0 && (
            <p className="popover__hint">
              Nenhuma skill ainda. Adicione na aba Skills do projeto ou no menu Skills.
            </p>
          )}
          {options !== null && options.length > 0 && filtered.length === 0 && (
            <p className="popover__hint">Nenhuma skill com &quot;{menu.query}&quot;.</p>
          )}
          {filtered.map((skill, index) => (
            <button
              key={skill.id}
              type="button"
              role="option"
              aria-selected={index === active}
              className="popover__item skill-menu__item"
              // mousedown: escolhe antes de o campo perder o foco.
              onMouseDown={(event) => {
                event.preventDefault()
                choose(skill)
              }}
              onMouseEnter={() => setActive(index)}
            >
              <Icon name="skill" />
              <span className="card__body">
                <span className="popover__item-name truncate">{skill.name}</span>
                {skill.description && (
                  <span className="text-caption truncate">{skill.description}</span>
                )}
              </span>
              <span className="badge">{skill.projectId === null ? 'Global' : 'Projeto'}</span>
            </button>
          ))}
        </div>
      )}

      {picked.length > 0 && (
        <div className="chip-row" aria-label="Skills desta mensagem">
          {picked.map((skill) => (
            <span key={skill.id} className="chip" title={skill.description || skill.name}>
              <Icon name="skill" />
              {skill.name}
              <button
                type="button"
                className="chip__remove"
                aria-label={`Tirar a skill ${skill.name}`}
                onClick={() => setPicked((list) => list.filter((s) => s.id !== skill.id))}
              >
                <Icon name="dismiss" />
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        ref={fieldRef}
        className="field"
        rows={3}
        value={draft}
        placeholder={`Mensagem para o ${agentName} (digite / para usar uma skill)`}
        aria-label={`Mensagem para o ${agentName}`}
        aria-expanded={menu !== null}
        aria-autocomplete="list"
        onChange={(event) => {
          setDraft(event.target.value)
          updateMenu(event.target.value, event.target.selectionStart)
        }}
        onKeyDown={onKeyDown}
        onClick={(event) => updateMenu(draft, event.currentTarget.selectionStart)}
        onBlur={() => setMenu(null)}
      />
      {canInterrupt ? (
        <Button icon="stop" onClick={onInterrupt}>
          Parar
        </Button>
      ) : (
        <Button variant="accent" icon="send" disabled={!canSend} onClick={submit}>
          Enviar
        </Button>
      )}
    </div>
  )
}
