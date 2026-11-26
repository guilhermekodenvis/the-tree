// Aba "Agentes": lista de conversas do projeto à esquerda e a conversa escolhida à direita.
import { useEffect, useState } from 'react'
import { agentName } from '../../../shared/agents'
import type { Project } from '../../../shared/types'
import type { ConversationsState } from '../hooks/useConversations'
import { AgentList } from './AgentList'
import { ChatView } from './ChatView'
import { GeminiKeyForm, useGeminiKey } from './GeminiKey'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'

interface Props {
  project: Project
  conversations: ConversationsState
  /** A aba do projeto está na frente (ver ChatView.visible). */
  visible: boolean
}

export function AgentsTab({ project, conversations: state, visible }: Props) {
  const geminiKey = useGeminiKey()
  const [editingKey, setEditingKey] = useState(false)

  useEffect(() => state.loadList(project.id), [project.id, state.loadList])

  const list = state.listOf(project.id)
  const selectedId = state.selectedOf(project.id)
  const conversation = list?.find((c) => c.id === selectedId) ?? null

  useEffect(() => {
    if (conversation) state.loadChat(project.id, conversation.id)
  }, [project.id, conversation?.id, state.loadChat])

  const busy = (id: string): boolean => {
    const chat = state.chatOf(id)
    return state.isStarting(id) || chat?.status === 'running' || chat?.status === 'waiting'
  }

  return (
    <div className="split">
      <AgentList
        conversations={list ?? []}
        selected={selectedId}
        busy={busy}
        error={state.listError}
        onSelect={(id) => {
          setEditingKey(false)
          state.select(project.id, id)
        }}
        onCreate={(agent) => {
          setEditingKey(false)
          void state.create(project.id, agent)
        }}
        onRename={(id, name) => void state.rename(project.id, id, name)}
        onRemove={(id) => void state.remove(project.id, id)}
        onMove={(id, toIndex) => void state.move(project.id, id, toIndex)}
        onManageGeminiKey={() => setEditingKey(true)}
      />

      <section className="split__main">
        {editingKey ? (
          <div className="split__center">
            <div className="card card--stacked key-card">
              <GeminiKeyForm
                configured={geminiKey.configured === true}
                onDone={() => {
                  setEditingKey(false)
                  geminiKey.refresh()
                }}
              />
            </div>
          </div>
        ) : !conversation ? (
          <div className="empty-state">
            <Icon name="chat" className="empty-state__icon" />
            <p className="empty-state__title">
              {list && list.length > 0 ? 'Escolha um agente na lista' : 'Nenhum agente neste projeto'}
            </p>
            <p>
              Cada agente é uma conversa separada com o Claude, o ChatGPT ou o Gemini. Crie quantos
              quiser pelo + da lista.
            </p>
          </div>
        ) : (
          <ChatView
            key={conversation.id}
            projectId={project.id}
            chat={state.chatOf(conversation.id) ?? { sessionId: null, status: 'idle', items: [], loaded: false }}
            title={conversation.name}
            visible={visible}
            agent={conversation.agent}
            agentName={agentName(conversation.agent)}
            starting={state.isStarting(conversation.id)}
            startError={state.errorOf(conversation.id)}
            banner={
              conversation.agent === 'gemini' && geminiKey.configured === false ? (
                <div className="chat__banner">
                  <span>O Gemini precisa de uma chave de API para conversar.</span>
                  <Button variant="accent" onClick={() => setEditingKey(true)}>
                    Configurar chave
                  </Button>
                </div>
              ) : undefined
            }
            settings={conversation.settings}
            onSettingsChange={(change) => void state.setSettings(project.id, conversation.id, change)}
            bypass={conversation.bypass}
            onBypassChange={(on) => void state.setBypass(project.id, conversation.id, on)}
            loadSkills={() => window.api.skills.available(project.id)}
            onSend={(text, skills, attachments) =>
              void state.send(project.id, conversation.id, text, skills, attachments)
            }
            onRespond={(requestId, allow) => void state.respond(conversation.id, requestId, allow)}
            onInterrupt={() => void state.interrupt(conversation.id)}
          />
        )}
      </section>
    </div>
  )
}
