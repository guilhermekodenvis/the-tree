// Liga cada chamada da interface (window.api.*) ao serviço correspondente.
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { AgentId } from '../shared/types'
import * as projects from './projects/store'
import * as files from './files/service'
import * as watcher from './files/watcher'
import { AgentManager } from './agents/manager'
import { hasSecret, removeSecret, setSecret } from './secrets'

/** Envia um aviso para todas as janelas abertas. */
function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

export function registerIpc(): AgentManager {
  const agents = new AgentManager((event) => broadcast('agents:event', event))

  ipcMain.handle('projects:list', () => projects.list())
  ipcMain.handle('projects:add', (_e, path: string) => projects.add(path))
  ipcMain.handle('projects:remove', (_e, id: string) => projects.remove(id))
  ipcMain.handle('projects:pick', async (event) => {
    const options: Electron.OpenDialogOptions = {
      title: 'Adicionar projeto',
      buttonLabel: 'Adicionar',
      properties: ['openDirectory']
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return projects.add(result.filePaths[0])
  })

  ipcMain.handle('files:list', (_e, projectId: string, dir: string) => files.list(projectId, dir))
  ipcMain.handle('files:read', (_e, projectId: string, path: string) =>
    files.read(projectId, path)
  )
  ipcMain.handle('files:write', (_e, projectId: string, path: string, content: string) =>
    files.write(projectId, path, content)
  )
  ipcMain.handle('files:watch', (_e, projectId: string) =>
    watcher.watch(projectId, (change) => broadcast('files:changed', change))
  )
  ipcMain.handle('files:unwatch', (_e, projectId: string) => watcher.unwatch(projectId))

  ipcMain.handle('settings:geminiKey:has', () => hasSecret('gemini-api-key'))
  ipcMain.handle('settings:geminiKey:set', (_e, key: unknown) => {
    const value = typeof key === 'string' ? key.trim() : ''
    if (!value || /\s/.test(value)) throw new Error('A chave parece inválida: cole só a chave, sem espaços.')
    return setSecret('gemini-api-key', value)
  })
  ipcMain.handle('settings:geminiKey:remove', () => removeSecret('gemini-api-key'))

  ipcMain.handle('conversations:list', (_e, projectId: string) => agents.list(projectId))
  ipcMain.handle('conversations:items', (_e, projectId: string, id: string) =>
    agents.items(projectId, id)
  )
  ipcMain.handle('conversations:create', (_e, projectId: string, agent: AgentId) =>
    agents.create(projectId, agent)
  )
  ipcMain.handle('conversations:rename', (_e, projectId: string, id: string, name: string) =>
    agents.rename(projectId, id, name)
  )
  ipcMain.handle('conversations:remove', (_e, projectId: string, id: string) =>
    agents.remove(projectId, id)
  )
  ipcMain.handle('conversations:reorder', (_e, projectId: string, ids: string[]) =>
    agents.reorder(projectId, ids)
  )
  ipcMain.handle('conversations:removeAll', (_e, projectId: string) => agents.removeAll(projectId))

  ipcMain.handle('agents:start', (_e, projectId: string, conversationId: string) =>
    agents.start(projectId, conversationId)
  )
  ipcMain.handle('agents:send', (_e, sessionId: string, message: string) =>
    agents.send(sessionId, message)
  )
  ipcMain.handle('agents:respond', (_e, sessionId: string, requestId: string, allow: boolean) =>
    agents.respond(sessionId, requestId, allow)
  )
  ipcMain.handle('agents:interrupt', (_e, sessionId: string) => agents.interrupt(sessionId))
  ipcMain.handle('agents:stop', (_e, sessionId: string) => agents.stop(sessionId))

  return agents
}
