// Tela de um projeto: nome, caminho e as abas Arquivos, Agentes e Skills.
import type { Project } from '../../../shared/types'
import type { ConversationsState } from '../hooks/useConversations'
import { AgentsTab } from './AgentsTab'
import { FilesTab } from './FilesTab'
import { SkillsTab } from './SkillsTab'
import { Tabs } from './ui/Tabs'
import { Icon } from './ui/Icon'

export type ProjectTab = 'files' | 'agents' | 'skills'

interface Props {
  project: Project
  tab: ProjectTab
  conversations: ConversationsState
  onTabChange(tab: ProjectTab): void
  onBack(): void
}

export function ProjectScreen({ project, tab, conversations, onTabChange, onBack }: Props) {
  return (
    <main className="screen screen--flush">
      <header className="project-header">
        <button type="button" className="link breadcrumb" onClick={onBack}>
          <Icon name="back" />
          Projetos
        </button>
        <h1 className="text-subtitle truncate">{project.name}</h1>
        <p className="text-caption text-mono truncate" title={project.path}>
          {project.path}
        </p>
        <Tabs
          label="Seções do projeto"
          active={tab}
          onChange={onTabChange}
          tabs={[
            { id: 'files', label: 'Arquivos', icon: 'document' },
            { id: 'agents', label: 'Agentes', icon: 'chat' },
            { id: 'skills', label: 'Skills', icon: 'skill' }
          ]}
        />
      </header>
      <div className="project-body" role="tabpanel">
        {tab === 'files' && <FilesTab project={project} />}
        {tab === 'agents' && <AgentsTab project={project} conversations={conversations} />}
        {tab === 'skills' && <SkillsTab project={project} />}
      </div>
    </main>
  )
}
