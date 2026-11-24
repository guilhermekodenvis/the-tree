// Layout de três colunas: projetos | editor | agentes.
import { useState } from 'react'
import type { Project } from '../../shared/types'
import { ProjectSidebar } from './components/ProjectSidebar'
import { EditorPane } from './components/EditorPane'
import { AgentPanel } from './components/AgentPanel'

export function App() {
  const [activeProject, setActiveProject] = useState<Project | null>(null)

  return (
    <div className="layout">
      <ProjectSidebar active={activeProject} onSelect={setActiveProject} />
      <EditorPane project={activeProject} />
      <AgentPanel project={activeProject} />
    </div>
  )
}
