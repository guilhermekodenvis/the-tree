// Barra de abas dos projetos abertos, no estilo das abas de um navegador.
// Clique para trocar de projeto, × (ou clique com o botão do meio) para fechar,
// e + para abrir outro projeto.
import type { Project } from '../../../shared/types'
import { IconButton } from './ui/Button'
import { Icon } from './ui/Icon'

interface Props {
  projects: Project[]
  /** Aba na frente; null quando a tela de projetos está aberta pelo +. */
  active: string | null
  /** A tela de escolher projeto está aberta. */
  picking: boolean
  onSelect(project: Project): void
  onClose(project: Project): void
  onAdd(): void
}

export function ProjectTabs({ projects, active, picking, onSelect, onClose, onAdd }: Props) {
  return (
    <div className="project-tabs">
      <div className="project-tabs__list" role="tablist" aria-label="Projetos abertos">
        {projects.map((project) => {
          const selected = !picking && project.id === active
          return (
            <div
              key={project.id}
              className={`project-tab ${selected ? 'project-tab--active' : ''}`}
              title={`${project.name}\n${project.path}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                className="project-tab__open"
                onClick={() => onSelect(project)}
                onAuxClick={(event) => {
                  if (event.button === 1) onClose(project)
                }}
              >
                <Icon name="folder" />
                <span className="truncate">{project.name}</span>
              </button>
              <button
                type="button"
                className="project-tab__close"
                aria-label={`Fechar ${project.name}`}
                onClick={() => onClose(project)}
              >
                <Icon name="dismiss" />
              </button>
            </div>
          )
        })}
        {/* Logo depois da última aba, como o + de um navegador. */}
        <IconButton
          icon="add"
          label="Abrir outro projeto"
          aria-pressed={picking}
          className={`project-tabs__add ${picking ? 'project-tabs__add--active' : ''}`}
          onClick={onAdd}
        />
      </div>
    </div>
  )
}
