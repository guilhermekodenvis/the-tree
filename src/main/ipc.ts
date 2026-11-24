// Liga cada chamada da interface (window.api.*) ao serviço correspondente.
import { ipcMain, type BrowserWindow } from 'electron'
import type { AgentId } from '../shared/types'
import * as projects from './projects/store'
import * as files from './files/service'
import { AgentManager } from './agents/manager'

export function registerIpc(win: BrowserWindow): void {
  // Eventos dos agentes sobem para a interface por este canal.
  const agents = new AgentManager((event) => win.webContents.send('agents:event', event))

  ipcMain.handle('projects:list', () => projects.list())
  ipcMain.handle('projects:add', (_e, path: string) => projects.add(path))
  ipcMain.handle('projects:remove', (_e, id: string) => projects.remove(id))

  ipcMain.handle('files:list', (_e, dir: string) => files.list(dir))
  ipcMain.handle('files:read', (_e, path: string) => files.read(path))
  ipcMain.handle('files:write', (_e, path: string, content: string) => files.write(path, content))

  ipcMain.handle('agents:start', (_e, projectId: string, agent: AgentId) =>
    agents.start(projectId, agent)
  )
  ipcMain.handle('agents:send', (_e, sessionId: string, message: string) =>
    agents.send(sessionId, message)
  )
  ipcMain.handle('agents:stop', (_e, sessionId: string) => agents.stop(sessionId))
}
