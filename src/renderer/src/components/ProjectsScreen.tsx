// Tela de projetos: projetos organizados em grupos, cada um com seus cards.
// Grupos e projetos podem ser renomeados; projetos mudam de grupo arrastando o
// card ou pelo menu "Mover para".
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import type { Project, ProjectGroup } from '../../../shared/types'
import type { ProjectsState } from '../hooks/useProjects'
import { Button, IconButton } from './ui/Button'
import { Icon } from './ui/Icon'

interface Props {
  state: ProjectsState
  onOpen(project: Project): void
  /** Remove o projeto da lista (e apaga as conversas dele). */
  onRemove(project: Project): Promise<void>
}

const COLLAPSED_KEY = 'the-tree:groups-collapsed'

/** Grupos recolhidos, lembrados neste computador. */
function readCollapsed(): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]')
    return new Set(Array.isArray(ids) ? ids.map(String) : [])
  } catch {
    return new Set()
  }
}

/** Chave da área de soltar: id do grupo, ou '' para "Sem grupo". */
const zoneOf = (groupId: string | null): string => groupId ?? ''

export function ProjectsScreen({ state, onOpen, onRemove }: Props) {
  const { projects, groups, loaded, error } = state
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null)
  const [dragging, setDragging] = useState<Project | null>(null)
  const [dropZone, setDropZone] = useState<string | null>(null)

  const add = async (groupId: string | null): Promise<void> => {
    const project = await state.add(groupId)
    if (project) onOpen(project)
  }

  const createGroup = async (): Promise<void> => {
    const id = await state.createGroup()
    if (id) setRenamingGroup(id)
  }

  const toggleGroup = (id: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
      } catch {
        // Sem armazenamento local: só não é lembrado.
      }
      return next
    })
  }

  /** Props de uma área que aceita cards arrastados. */
  const dropProps = (groupId: string | null) => ({
    onDragOver: (event: DragEvent) => {
      if (!dragging) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      setDropZone(zoneOf(groupId))
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropZone(null)
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      if (dragging && dragging.groupId !== groupId) void state.move(dragging, groupId)
      setDragging(null)
      setDropZone(null)
    }
  })

  const cardsOf = (groupId: string | null) => projects.filter((p) => p.groupId === groupId)

  const renderCards = (groupId: string | null) => {
    const cards = cardsOf(groupId)
    if (cards.length === 0) {
      return (
        <p className="group-empty">
          {dragging ? 'Solte o projeto aqui.' : 'Arraste projetos para cá ou use o + do grupo.'}
        </p>
      )
    }
    return (
      <ul className="project-grid">
        {cards.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            groups={groups}
            dragging={dragging?.id === project.id}
            onOpen={() => onOpen(project)}
            onRename={(name) => state.rename(project, name)}
            onMove={(target) => state.move(project, target)}
            onRemove={() => onRemove(project)}
            onDragStart={() => setDragging(project)}
            onDragEnd={() => {
              setDragging(null)
              setDropZone(null)
            }}
          />
        ))}
      </ul>
    )
  }

  const empty = loaded && projects.length === 0 && groups.length === 0
  const ungrouped = cardsOf(null)

  return (
    <main className="screen">
      <header className="screen__header">
        <div>
          <h1 className="text-title">Projetos</h1>
          <p className="text-caption">
            Cada projeto é uma pasta do seu computador onde os agentes trabalham.
          </p>
        </div>
        <div className="screen__actions">
          <Button icon="folders" onClick={() => void createGroup()}>
            Novo grupo
          </Button>
          <Button variant="accent" icon="add" onClick={() => void add(null)}>
            Adicionar projeto
          </Button>
        </div>
      </header>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {empty ? (
        <div className="empty-state">
          <Icon name="folders" className="empty-state__icon" />
          <p className="empty-state__title">Nenhum projeto ainda</p>
          <p>Adicione uma pasta para começar. Depois, organize os projetos em grupos.</p>
        </div>
      ) : (
        <>
          {groups.map((group, index) => (
            <GroupSection
              key={group.id}
              group={group}
              count={cardsOf(group.id).length}
              collapsed={collapsed.has(group.id)}
              renaming={renamingGroup === group.id}
              dropActive={dropZone === zoneOf(group.id)}
              dropProps={dropProps(group.id)}
              isFirst={index === 0}
              isLast={index === groups.length - 1}
              onToggle={() => toggleGroup(group.id)}
              onStartRename={() => setRenamingGroup(group.id)}
              onRename={(name) => {
                setRenamingGroup(null)
                if (name !== group.name) void state.renameGroup(group, name)
              }}
              onCancelRename={() => setRenamingGroup(null)}
              onAdd={() => void add(group.id)}
              onMoveBy={(step) => void state.moveGroup(group, step)}
              onRemove={() => void state.removeGroup(group)}
            >
              {renderCards(group.id)}
            </GroupSection>
          ))}

          {/* Sem grupos, a tela fica como uma lista simples, sem título de seção. */}
          {groups.length === 0 ? (
            renderCards(null)
          ) : (
            (ungrouped.length > 0 || dragging) && (
              <section
                className={`group ${dropZone === '' ? 'group--drop' : ''}`}
                aria-label="Sem grupo"
                {...dropProps(null)}
              >
                <div className="group__header">
                  <span className="group__title group__title--plain">Sem grupo</span>
                  <span className="text-caption">{ungrouped.length}</span>
                </div>
                {renderCards(null)}
              </section>
            )
          )}
        </>
      )}
    </main>
  )
}

// ---- Grupo ----------------------------------------------------------------------

interface GroupProps {
  group: ProjectGroup
  count: number
  collapsed: boolean
  renaming: boolean
  dropActive: boolean
  dropProps: {
    onDragOver(event: DragEvent): void
    onDragLeave(event: DragEvent): void
    onDrop(event: DragEvent): void
  }
  isFirst: boolean
  isLast: boolean
  children: ReactNode
  onToggle(): void
  onStartRename(): void
  onRename(name: string): void
  onCancelRename(): void
  onAdd(): void
  onMoveBy(step: number): void
  onRemove(): void
}

function GroupSection(props: GroupProps) {
  const { group, count, collapsed, renaming } = props
  const [confirming, setConfirming] = useState(false)

  const classes = ['group', props.dropActive ? 'group--drop' : ''].filter(Boolean).join(' ')

  return (
    <section className={classes} aria-label={group.name} {...props.dropProps}>
      <div className="group__header">
        {renaming ? (
          <NameInput
            value={group.name}
            label="Nome do grupo"
            className="group__input"
            onDone={props.onRename}
            onCancel={props.onCancelRename}
          />
        ) : (
          <button
            type="button"
            className="group__title"
            aria-expanded={!collapsed}
            title="Clique para recolher ou abrir. F2 renomeia."
            onClick={props.onToggle}
            onDoubleClick={props.onStartRename}
            onKeyDown={(event) => {
              if (event.key === 'F2') props.onStartRename()
            }}
          >
            <Icon
              name="chevron"
              className={`icon group__chevron ${collapsed ? '' : 'group__chevron--open'}`}
            />
            <span className="truncate">{group.name}</span>
          </button>
        )}
        <span className="text-caption">{count}</span>

        {confirming ? (
          <span className="group__confirm">
            <span className="text-caption">
              Excluir o grupo? Os projetos dele vão para &quot;Sem grupo&quot;.
            </span>
            <Button variant="accent" onClick={props.onRemove}>
              Excluir
            </Button>
            <Button onClick={() => setConfirming(false)}>Cancelar</Button>
          </span>
        ) : (
          <span className="group__actions">
            <IconButton icon="add" label={`Adicionar projeto a ${group.name}`} onClick={props.onAdd} />
            <IconButton icon="rename" label={`Renomear ${group.name}`} onClick={props.onStartRename} />
            <IconButton
              icon="up"
              label="Subir grupo"
              disabled={props.isFirst}
              onClick={() => props.onMoveBy(-1)}
            />
            <IconButton
              icon="down"
              label="Descer grupo"
              disabled={props.isLast}
              onClick={() => props.onMoveBy(1)}
            />
            <IconButton
              icon="delete"
              label={`Excluir o grupo ${group.name}`}
              danger
              onClick={() => setConfirming(true)}
            />
          </span>
        )}
      </div>
      {!collapsed && props.children}
    </section>
  )
}

// ---- Card de projeto --------------------------------------------------------------

interface CardProps {
  project: Project
  groups: ProjectGroup[]
  dragging: boolean
  onOpen(): void
  onRename(name: string): Promise<void>
  onMove(groupId: string | null): Promise<void>
  onRemove(): Promise<void>
  onDragStart(): void
  onDragEnd(): void
}

function ProjectCard(props: CardProps) {
  const { project, groups } = props
  const [mode, setMode] = useState<'view' | 'rename' | 'confirm'>('view')
  const [menuOpen, setMenuOpen] = useState(false)

  if (mode === 'confirm') {
    return (
      <li className="project-card project-card--confirm">
        <p className="project-card__name truncate">Remover {project.name}?</p>
        <p className="text-caption">
          As conversas deste projeto serão apagadas. A pasta no disco não é alterada.
        </p>
        <div className="project-card__actions">
          <Button variant="accent" onClick={() => void props.onRemove()}>
            Remover
          </Button>
          <Button onClick={() => setMode('view')}>Cancelar</Button>
        </div>
      </li>
    )
  }

  if (mode === 'rename') {
    return (
      <li className="project-card project-card--rename">
        <span className="project-card__icon">
          <Icon name="folder" />
        </span>
        <NameInput
          value={project.name}
          label="Nome do projeto"
          className="project-card__input"
          onDone={(name) => {
            setMode('view')
            if (name !== project.name) void props.onRename(name)
          }}
          onCancel={() => setMode('view')}
        />
        <span className="text-caption text-mono truncate" title={project.path}>
          {project.path}
        </span>
      </li>
    )
  }

  const classes = [
    'project-card',
    props.dragging ? 'project-card--dragging' : '',
    menuOpen ? 'project-card--menu' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li
      className={classes}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        props.onDragStart()
      }}
      onDragEnd={props.onDragEnd}
    >
      <button
        type="button"
        className="project-card__open"
        onClick={props.onOpen}
        onKeyDown={(event) => {
          if (event.key === 'F2') setMode('rename')
        }}
        title={`${project.path}\nArraste para outro grupo. F2 renomeia.`}
      >
        <span className="project-card__icon">
          <Icon name="folder" />
        </span>
        <span className="project-card__name truncate">{project.name}</span>
        <span className="text-caption text-mono truncate">{project.path}</span>
      </button>
      <span className="project-card__tools">
        <IconButton icon="rename" label={`Renomear ${project.name}`} onClick={() => setMode('rename')} />
        <span className="popover-anchor">
          <IconButton
            icon="move"
            label="Mover para outro grupo"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          />
          {menuOpen && (
            <MoveMenu
              current={project.groupId}
              groups={groups}
              onPick={(groupId) => {
                setMenuOpen(false)
                if (groupId !== project.groupId) void props.onMove(groupId)
              }}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </span>
        <IconButton
          icon="delete"
          label={`Remover ${project.name} da lista`}
          danger
          onClick={() => setMode('confirm')}
        />
      </span>
    </li>
  )
}

function MoveMenu({
  current,
  groups,
  onPick,
  onClose
}: {
  current: string | null
  groups: ProjectGroup[]
  onPick(groupId: string | null): void
  onClose(): void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    const onPointer = (event: PointerEvent): void => {
      if (!ref.current?.parentElement?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector('button')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const options: { id: string | null; name: string }[] = [
    ...groups.map((g) => ({ id: g.id, name: g.name })),
    { id: null, name: 'Sem grupo' }
  ]

  return (
    <div className="popover" role="menu" ref={ref}>
      <p className="popover__title">Mover para</p>
      {groups.length === 0 && (
        <p className="popover__hint">Crie um grupo pelo botão &quot;Novo grupo&quot;.</p>
      )}
      {options.map((option) => (
        <button
          key={option.id ?? ''}
          type="button"
          role="menuitemradio"
          aria-checked={option.id === current}
          className="popover__item"
          onClick={() => onPick(option.id)}
        >
          <Icon name={option.id === null ? 'folder' : 'folders'} />
          <span className="truncate">{option.name}</span>
          {option.id === current && <span className="text-caption popover__check">atual</span>}
        </button>
      ))}
    </div>
  )
}

// ---- Campo de nome ----------------------------------------------------------------

/** Campo de renomear: Enter ou sair do campo grava, Esc cancela. */
function NameInput({
  value,
  label,
  className,
  onDone,
  onCancel
}: {
  value: string
  label: string
  className: string
  onDone(name: string): void
  onCancel(): void
}) {
  const [name, setName] = useState(value)
  const input = useRef<HTMLInputElement>(null)
  const finished = useRef(false)

  useEffect(() => input.current?.select(), [])

  const finish = (save: boolean): void => {
    if (finished.current) return
    finished.current = true
    const clean = name.trim()
    if (save && clean) onDone(clean)
    else onCancel()
  }

  return (
    <input
      ref={input}
      className={`field ${className}`}
      value={name}
      maxLength={80}
      aria-label={label}
      onChange={(event) => setName(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') finish(true)
        if (event.key === 'Escape') finish(false)
      }}
    />
  )
}
