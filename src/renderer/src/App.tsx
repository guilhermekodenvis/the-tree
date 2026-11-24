// Estrutura da janela: barra de título, menu lateral e a tela atual.
// As medidas e cores vêm de design/tokens.css.
import { useState } from 'react'
import type { Project } from '../../shared/types'
import { useConversations } from './hooks/useConversations'
import { useProjects } from './hooks/useProjects'
import { NavMenu } from './components/NavMenu'
import { ProjectScreen, type ProjectTab } from './components/ProjectScreen'
import { ProjectsScreen } from './components/ProjectsScreen'
import { Icon } from './components/ui/Icon'

type View = { screen: 'projects' } | { screen: 'project'; projectId: string; tab: ProjectTab }

const NAV_KEY = 'the-tree:nav-collapsed'

/** Preferência de menu recolhido, lembrada neste computador. */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_KEY) === '1'
  } catch {
    return false
  }
}

export function App() {
  const projects = useProjects()
  const conversations = useConversations()
  const [view, setView] = useState<View>({ screen: 'projects' })
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggleNav = (): void => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(NAV_KEY, value ? '0' : '1')
      } catch {
        // Sem armazenamento local: a preferência só não é lembrada.
      }
      return !value
    })
  }

  const openProject = (project: Project): void =>
    setView({ screen: 'project', projectId: project.id, tab: 'files' })

  // Remover um projeto também encerra e apaga as conversas dele.
  const removeProject = async (project: Project): Promise<void> => {
    await conversations.removeAll(project.id)
    await projects.remove(project)
  }

  const current =
    view.screen === 'project' ? projects.projects.find((p) => p.id === view.projectId) : undefined

  return (
    <div className={`app ${collapsed ? 'app--nav-collapsed' : ''}`}>
      <header className="titlebar">
        <Icon name="tree" className="icon titlebar__logo" />
        The Tree
      </header>
      <NavMenu
        active="projects"
        collapsed={collapsed}
        onToggle={toggleNav}
        onNavigate={() => setView({ screen: 'projects' })}
      />
      <div className="workspace">
        {view.screen === 'project' && current ? (
          <ProjectScreen
            key={current.id}
            project={current}
            tab={view.tab}
            conversations={conversations}
            onTabChange={(tab) => setView({ ...view, tab })}
            onBack={() => setView({ screen: 'projects' })}
          />
        ) : (
          <ProjectsScreen state={projects} onOpen={openProject} onRemove={removeProject} />
        )}
      </div>
    </div>
  )
}
