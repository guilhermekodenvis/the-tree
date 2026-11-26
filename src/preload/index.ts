// Ponte segura entre a interface e o processo principal.
// A interface não acessa o Node diretamente; só o que for exposto aqui em window.api.
import { contextBridge, ipcRenderer } from 'electron'
import type { AccountId, AgentEvent, FilesChanged, TreeApi } from '../shared/types'

/** Escuta um canal de avisos do processo principal; devolve a função para parar. */
function listen<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_e: unknown, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: TreeApi = {
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    pick: (groupId) => ipcRenderer.invoke('projects:pick', groupId),
    add: (path, groupId) => ipcRenderer.invoke('projects:add', path, groupId ?? null),
    remove: (id) => ipcRenderer.invoke('projects:remove', id),
    rename: (id, name) => ipcRenderer.invoke('projects:rename', id, name),
    move: (id, groupId) => ipcRenderer.invoke('projects:move', id, groupId)
  },
  groups: {
    create: (name) => ipcRenderer.invoke('groups:create', name),
    rename: (id, name) => ipcRenderer.invoke('groups:rename', id, name),
    remove: (id) => ipcRenderer.invoke('groups:remove', id),
    reorder: (ids) => ipcRenderer.invoke('groups:reorder', ids)
  },
  files: {
    list: (projectId, dir) => ipcRenderer.invoke('files:list', projectId, dir),
    read: (projectId, path) => ipcRenderer.invoke('files:read', projectId, path),
    write: (projectId, path, content) =>
      ipcRenderer.invoke('files:write', projectId, path, content),
    watch: (projectId) => ipcRenderer.invoke('files:watch', projectId),
    unwatch: (projectId) => ipcRenderer.invoke('files:unwatch', projectId),
    onChanged: (listener) => listen<FilesChanged>('files:changed', listener),
    readMarkdown: (projectId, path, base) => ipcRenderer.invoke('files:readMarkdown', projectId, path, base)
  },
  settings: {
    geminiKey: {
      has: () => ipcRenderer.invoke('settings:geminiKey:has'),
      set: (key) => ipcRenderer.invoke('settings:geminiKey:set', key),
      remove: () => ipcRenderer.invoke('settings:geminiKey:remove')
    }
  },
  skills: {
    listGlobal: () => ipcRenderer.invoke('skills:listGlobal'),
    listProject: (projectId) => ipcRenderer.invoke('skills:listProject', projectId),
    available: (projectId) => ipcRenderer.invoke('skills:available', projectId),
    pick: (kind, projectId) => ipcRenderer.invoke('skills:pick', kind, projectId),
    add: (path, projectId) => ipcRenderer.invoke('skills:add', path, projectId),
    remove: (id) => ipcRenderer.invoke('skills:remove', id),
    importToProject: (projectId, skillId) =>
      ipcRenderer.invoke('skills:importToProject', projectId, skillId),
    removeFromProject: (projectId, skillId) =>
      ipcRenderer.invoke('skills:removeFromProject', projectId, skillId)
  },
  system: {
    showInFolder: (path) => ipcRenderer.invoke('system:showInFolder', path)
  },
  attachments: {
    save: (name, bytes) => ipcRenderer.invoke('attachments:save', name, bytes),
    pick: () => ipcRenderer.invoke('attachments:pick')
  },
  accounts: {
    status: () => ipcRenderer.invoke('accounts:status'),
    login: (id) => ipcRenderer.invoke('accounts:login', id),
    logout: (id) => ipcRenderer.invoke('accounts:logout', id),
    onLoginLink: (listener) =>
      listen<{ id: AccountId; url: string }>('accounts:loginLink', listener)
  },
  connectors: {
    list: () => ipcRenderer.invoke('connectors:list'),
    save: (input) => ipcRenderer.invoke('connectors:save', input),
    remove: (id) => ipcRenderer.invoke('connectors:remove', id),
    test: (id) => ipcRenderer.invoke('connectors:test', id)
  },
  automations: {
    list: (projectId) => ipcRenderer.invoke('automations:list', projectId),
    unseen: (projectId) => ipcRenderer.invoke('automations:unseen', projectId),
    create: (projectId, name) => ipcRenderer.invoke('automations:create', projectId, name),
    save: (automation) => ipcRenderer.invoke('automations:save', automation),
    remove: (id) => ipcRenderer.invoke('automations:remove', id),
    run: (id) => ipcRenderer.invoke('automations:run', id),
    runs: (id) => ipcRenderer.invoke('automations:runs', id),
    getRun: (id, runId) => ipcRenderer.invoke('automations:getRun', id, runId),
    markSeen: (id, runId) => ipcRenderer.invoke('automations:markSeen', id, runId),
    cancel: (id, runId) => ipcRenderer.invoke('automations:cancel', id, runId),
    decide: (id, runId, approve) => ipcRenderer.invoke('automations:decide', id, runId, approve),
    onChanged: (listener) => listen<string>('automations:changed', listener),
    onOpen: (listener) =>
      listen<{ projectId: string; automationId: string; runId: string }>('automations:open', listener)
  },
  conversations: {
    list: (projectId) => ipcRenderer.invoke('conversations:list', projectId),
    items: (projectId, id) => ipcRenderer.invoke('conversations:items', projectId, id),
    create: (projectId, agent) => ipcRenderer.invoke('conversations:create', projectId, agent),
    rename: (projectId, id, name) => ipcRenderer.invoke('conversations:rename', projectId, id, name),
    remove: (projectId, id) => ipcRenderer.invoke('conversations:remove', projectId, id),
    reorder: (projectId, ids) => ipcRenderer.invoke('conversations:reorder', projectId, ids),
    setBypass: (projectId, conversationId, on) =>
      ipcRenderer.invoke('conversations:setBypass', projectId, conversationId, on),
    setSettings: (projectId, conversationId, settings) =>
      ipcRenderer.invoke('conversations:setSettings', projectId, conversationId, settings),
    removeAll: (projectId) => ipcRenderer.invoke('conversations:removeAll', projectId)
  },
  agents: {
    start: (projectId, conversationId) =>
      ipcRenderer.invoke('agents:start', projectId, conversationId),
    send: (sessionId, message, skills, attachments) =>
      ipcRenderer.invoke('agents:send', sessionId, message, skills ?? [], attachments ?? []),
    respond: (sessionId, requestId, allow) =>
      ipcRenderer.invoke('agents:respond', sessionId, requestId, allow),
    interrupt: (sessionId) => ipcRenderer.invoke('agents:interrupt', sessionId),
    stop: (sessionId) => ipcRenderer.invoke('agents:stop', sessionId),
    onEvent: (listener) => listen<AgentEvent>('agents:event', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
