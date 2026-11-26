// Caixa de mensagem da conversa. Digitar "/" abre o menu de skills: a escolhida
// vira uma etiqueta acima do texto e vai junto com a próxima mensagem.
// Anexos: colar uma imagem (Ctrl+V), arrastar arquivos para a caixa ou usar o clipe.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Attachment, Skill } from '../../../shared/types'
import { messageOf } from '../lib/errors'
import { AttachmentList } from './AttachmentList'
import { Button, IconButton } from './ui/Button'
import { Icon } from './ui/Icon'

interface Props {
  agentName: string
  /** Agente trabalhando ou iniciando: não dá para enviar agora. */
  busy: boolean
  /** Mostra "Parar" no lugar de "Enviar". */
  canInterrupt: boolean
  /** Skills que esta conversa pode usar (globais e as deste projeto). */
  loadSkills(): Promise<Skill[]>
  onSend(text: string, skills: Skill[], attachments: Attachment[]): void
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

export function Composer({
  agentName,
  busy,
  canInterrupt,
  loadSkills,
  onSend,
  onInterrupt
}: Props) {
  const [draft, setDraft] = useState('')
  const [picked, setPicked] = useState<Skill[]>([])
  const [menu, setMenu] = useState<SlashMenu | null>(null)
  const [options, setOptions] = useState<Skill[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const caretRef = useRef<number | null>(null)
  const [files, setFiles] = useState<Attachment[]>([])
  const [saving, setSaving] = useState(0)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const canSend =
    (draft.trim() !== '' || picked.length > 0 || files.length > 0) && !busy && saving === 0

  /** Guarda arquivos vindos da área de transferência ou arrastados. */
  const addFiles = async (list: File[]): Promise<void> => {
    if (list.length === 0) return
    setFileError(null)
    setSaving((n) => n + list.length)
    for (const file of list) {
      try {
        // Print colado vem sem nome: ganha um com data e hora.
        const name = file.name || `print-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
        const saved = await window.api.attachments.save(
          name,
          new Uint8Array(await file.arrayBuffer())
        )
        setFiles((current) => [...current, saved])
      } catch (err) {
        setFileError(messageOf(err))
      } finally {
        setSaving((n) => n - 1)
      }
    }
  }

  const pickFiles = async (): Promise<void> => {
    setFileError(null)
    try {
      const chosen = await window.api.attachments.pick()
      setFiles((current) => [...current, ...chosen])
    } catch (err) {
      setFileError(messageOf(err))
    }
  }
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
    document
      .querySelector('.skill-menu [aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
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
    onSend(draft.trim(), picked, files)
    setDraft('')
    setPicked([])
    setFiles([])
    setFileError(null)
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
    <div
      className={`chat__composer ${dragging ? 'chat__composer--drop' : ''}`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length === 0) return
        event.preventDefault()
        setDragging(false)
        void addFiles([...event.dataTransfer.files])
      }}
    >
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

      {(files.length > 0 || saving > 0) && (
        <div className="composer__files">
          <AttachmentList
            attachments={files}
            onRemove={(file) => setFiles((current) => current.filter((f) => f.path !== file.path))}
          />
          {saving > 0 && <span className="text-caption">Anexando…</span>}
        </div>
      )}
      {fileError && (
        <p className="notice composer__error" role="alert">
          {fileError}
        </p>
      )}

      <textarea
        ref={fieldRef}
        className="field"
        rows={3}
        value={draft}
        placeholder={`Mensagem para o ${agentName} (digite / para usar uma skill; cole ou arraste arquivos)`}
        aria-label={`Mensagem para o ${agentName}`}
        aria-expanded={menu !== null}
        aria-autocomplete="list"
        onChange={(event) => {
          setDraft(event.target.value)
          updateMenu(event.target.value, event.target.selectionStart)
        }}
        onKeyDown={onKeyDown}
        onPaste={(event) => {
          // Print ou arquivo copiado: vira anexo. Texto colado segue normal.
          const pasted = [...event.clipboardData.files]
          if (pasted.length === 0) return
          event.preventDefault()
          void addFiles(pasted)
        }}
        onClick={(event) => updateMenu(draft, event.currentTarget.selectionStart)}
        onBlur={() => setMenu(null)}
      />
      <div className="composer__actions">
        <IconButton icon="attach" label="Anexar arquivos" onClick={() => void pickFiles()} />
        <span className="step-panel__spacer" />
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
    </div>
  )
}
