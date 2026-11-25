// Estrutura da janela: barra de título, menu lateral e a tela atual.
// As medidas e cores vêm de design/tokens.css.
//
// Em Projetos, os projetos abertos ficam em abas, como num navegador. Cada
// projeto aberto continua montado mesmo fora da frente, para a árvore de
// arquivos, o arquivo aberto e a conversa estarem como você deixou ao voltar.
import { useCallback, useEffect, useState } from 'react'
import type { Project } from '../../shared/types'
import { useConversations } from './hooks/useConversations'
import { useOpenProjects } from './hooks/useOpenProjects'
import { useProjects } from './hooks/useProjects'
import { NavMenu, type Section } from './components/NavMenu'
import { ProjectScreen } from './components/ProjectScreen'
import { ProjectsScreen } from './components/ProjectsScreen'
import { ProjectTabs } from './components/ProjectTabs'
import { SkillsScreen } from './components/SkillsScreen'
import { ConnectorsScreen } from './components/ConnectorsScreen'
import type { OpenRunTarget } from './components/automations/AutomationsTab'
import { Button } from './components/ui/Button'
import { Icon } from './components/ui/Icon'

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
  const tabs = useOpenProjects()
  const [section, setSection] = useState<Section>('projects')
  /** Tela de escolher projeto aberta (pelo + ou por "Selecionar projeto"). */
  const [picking, setPicking] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  /** Execução a abrir (clique num aviso do Windows), por projeto. */
  const [openRun, setOpenRun] = useState<(OpenRunTarget & { projectId: string }) | null>(null)
  const clearOpenRun = useCallback(() => setOpenRun(null), [])

  // Clique num aviso de automação: abre o projeto na aba Automações, na execução.
  const { openProject: openTab, setTab } = tabs
  useEffect(
    () =>
      window.api.automations.onOpen((target) => {
        setSection('projects')
        setPicking(false)
        openTab(target.projectId)
        setTab(target.projectId, 'automations')
        setOpenRun(target)
      }),
    [openTab, setTab]
  )

  // Projeto removido (ou que sumiu da lista): a aba dele fecha.
  const { keepOnly } = tabs
  useEffect(() => {
    if (projects.loaded) keepOnly(projects.projects.map((p) => p.id))
  }, [projects.loaded, projects.projects, keepOnly])

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

  const openProject = (project: Project): void => {
    tabs.openProject(project.id)
    setPicking(false)
  }

  // Remover um projeto também encerra e apaga as conversas dele.
  const removeProject = async (project: Project): Promise<void> => {
    await conversations.removeAll(project.id)
    await projects.remove(project)
    tabs.close(project.id)
  }

  const openProjects = tabs.open
    .map((id) => projects.projects.find((p) => p.id === id))
    .filter((p): p is Project => p !== undefined)
  const inProjects = section === 'projects'
  const showPicker = inProjects && picking
  const showEmpty = inProjects && !picking && projects.loaded && openProjects.length === 0

  return (
    <div className={`app ${collapsed ? 'app--nav-collapsed' : ''}`}>
      <header className="titlebar">
        <Icon name="tree" className="icon titlebar__logo" />
        The Tree
      </header>
      <NavMenu
        active={section}
        collapsed={collapsed}
        onToggle={toggleNav}
        onNavigate={(next) => {
          setSection(next)
          setPicking(false)
        }}
      />
      <div className="workspace">
        {inProjects && openProjects.length > 0 && (
          <ProjectTabs
            projects={openProjects}
            active={tabs.active}
            picking={picking}
            onSelect={(project) => {
              tabs.activate(project.id)
              setPicking(false)
            }}
            onClose={(project) => tabs.close(project.id)}
            onAdd={() => setPicking(true)}
          />
        )}

        {section === 'skills' && <SkillsScreen />}
        {section === 'connectors' && <ConnectorsScreen />}

        {showPicker && (
          <ProjectsScreen state={projects} onOpen={openProject} onRemove={removeProject} />
        )}

        {showEmpty && (
          <div className="empty-state">
            <Icon name="folders" className="empty-state__icon" />
            <p className="empty-state__title">Nenhum projeto aberto</p>
            <p>Abra um projeto para ver os arquivos, conversar com os agentes e usar skills.</p>
            <Button
              variant="accent"
              icon="folders"
              className="empty-state__action"
              onClick={() => setPicking(true)}
            >
              Selecionar projeto
            </Button>
          </div>
        )}

        {openProjects.map((project) => (
          <ProjectScreen
            key={project.id}
            project={project}
            hidden={!inProjects || picking || project.id !== tabs.active}
            tab={tabs.tabOf(project.id)}
            conversations={conversations}
            onTabChange={(tab) => tabs.setTab(project.id, tab)}
            openRun={openRun?.projectId === project.id ? openRun : null}
            onRunOpened={clearOpenRun}
          />
        ))}
      </div>
    </div>
  )
}
