// Ponte segura entre a interface e o processo principal.
// A interface não acessa o Node diretamente; só o que for exposto aqui em window.api.
import { contextBridge, ipcRenderer } from 'electron'
import type { AgentEvent, FilesChanged, TreeApi } from '../shared/types'

/** Escuta um canal de avisos do processo principal; devolve a função para parar. */
function listen<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_e: unknown, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: TreeApi = {
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    pick: () => ipcRenderer.invoke('projects:pick'),
    add: (path) => ipcRenderer.invoke('projects:add', path),
    remove: (id) => ipcRenderer.invoke('projects:remove', id)
  },
  files: {
    list: (projectId, dir) => ipcRenderer.invoke('files:list', projectId, dir),
    read: (projectId, path) => ipcRenderer.invoke('files:read', projectId, path),
    write: (projectId, path, content) =>
      ipcRenderer.invoke('files:write', projectId, path, content),
    watch: (projectId) => ipcRenderer.invoke('files:watch', projectId),
    unwatch: (projectId) => ipcRenderer.invoke('files:unwatch', projectId),
    onChanged: (listener) => listen<FilesChanged>('files:changed', listener)
  },
  settings: {
    geminiKey: {
      has: () => ipcRenderer.invoke('settings:geminiKey:has'),
      set: (key) => ipcRenderer.invoke('settings:geminiKey:set', key),
      remove: () => ipcRenderer.invoke('settings:geminiKey:remove')
    }
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
    removeAll: (projectId) => ipcRenderer.invoke('conversations:removeAll', projectId)
  },
  agents: {
    start: (projectId, conversationId) =>
      ipcRenderer.invoke('agents:start', projectId, conversationId),
    send: (sessionId, message) => ipcRenderer.invoke('agents:send', sessionId, message),
    respond: (sessionId, requestId, allow) =>
      ipcRenderer.invoke('agents:respond', sessionId, requestId, allow),
    interrupt: (sessionId) => ipcRenderer.invoke('agents:interrupt', sessionId),
    stop: (sessionId) => ipcRenderer.invoke('agents:stop', sessionId),
    onEvent: (listener) => listen<AgentEvent>('agents:event', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
