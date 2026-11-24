// Coluna esquerda: lista simplificada dos projetos em andamento.
// TODO: botão "adicionar projeto" (seletor de pasta) e indicador de status por projeto.
import { useEffect, useState } from 'react'
import type { Project } from '../../../shared/types'

interface Props {
  active: Project | null
  onSelect(project: Project): void
}

export function ProjectSidebar({ active, onSelect }: Props) {
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    window.api.projects.list().then(setProjects)
  }, [])

  return (
    <aside className="pane sidebar">
      <h2>Projetos</h2>
      {projects.length === 0 && <p className="empty">Nenhum projeto ainda.</p>}
      <ul>
        {projects.map((project) => (
          <li
            key={project.id}
            className={project.id === active?.id ? 'active' : ''}
            onClick={() => onSelect(project)}
          >
            {project.name}
          </li>
        ))}
      </ul>
    </aside>
  )
}
