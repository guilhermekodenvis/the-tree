// Estrutura da janela: barra de título, barra lateral de projetos e área de trabalho
// (editor + agentes). As medidas e cores vêm de design/tokens.css.
import { useProjects } from './hooks/useProjects'
import { ProjectSidebar } from './components/ProjectSidebar'
import { EditorPane } from './components/EditorPane'
import { AgentPanel } from './components/AgentPanel'
import { Icon } from './components/ui/Icon'

export function App() {
  const state = useProjects()

  return (
    <div className="app">
      <header className="titlebar">
        <Icon name="tree" className="icon titlebar__logo" />
        The Tree
      </header>
      <ProjectSidebar state={state} />
      <div className="workspace">
        <EditorPane project={state.active} hasProjects={state.projects.length > 0} onAdd={state.add} />
        <AgentPanel project={state.active} />
      </div>
    </div>
  )
}
