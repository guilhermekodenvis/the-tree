// Ponte segura entre a interface e o processo principal.
// A interface não acessa o Node diretamente; só o que for exposto aqui em window.api.
import { contextBridge, ipcRenderer } from 'electron'
import type { AgentEvent, TreeApi } from '../shared/types'

const api: TreeApi = {
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    add: (path) => ipcRenderer.invoke('projects:add', path),
    remove: (id) => ipcRenderer.invoke('projects:remove', id)
  },
  files: {
    list: (dir) => ipcRenderer.invoke('files:list', dir),
    read: (path) => ipcRenderer.invoke('files:read', path),
    write: (path, content) => ipcRenderer.invoke('files:write', path, content)
  },
  agents: {
    start: (projectId, agent) => ipcRenderer.invoke('agents:start', projectId, agent),
    send: (sessionId, message) => ipcRenderer.invoke('agents:send', sessionId, message),
    stop: (sessionId) => ipcRenderer.invoke('agents:stop', sessionId),
    onEvent: (listener) => {
      const handler = (_e: unknown, event: AgentEvent): void => listener(event)
      ipcRenderer.on('agents:event', handler)
      return () => ipcRenderer.removeListener('agents:event', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
