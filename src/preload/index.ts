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
  agents: {
    history: (projectId) => ipcRenderer.invoke('agents:history', projectId),
    start: (projectId, agent, resume) =>
      ipcRenderer.invoke('agents:start', projectId, agent, resume),
    send: (sessionId, message) => ipcRenderer.invoke('agents:send', sessionId, message),
    respond: (sessionId, requestId, allow) =>
      ipcRenderer.invoke('agents:respond', sessionId, requestId, allow),
    interrupt: (sessionId) => ipcRenderer.invoke('agents:interrupt', sessionId),
    stop: (sessionId) => ipcRenderer.invoke('agents:stop', sessionId),
    forget: (projectId) => ipcRenderer.invoke('agents:forget', projectId),
    onEvent: (listener) => listen<AgentEvent>('agents:event', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
