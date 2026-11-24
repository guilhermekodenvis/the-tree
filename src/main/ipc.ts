// Liga cada chamada da interface (window.api.*) ao serviço correspondente.
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { AgentId } from '../shared/types'
import * as projects from './projects/store'
import * as files from './files/service'
import { AgentManager } from './agents/manager'

export function registerIpc(): void {
  // Eventos dos agentes sobem para todas as janelas abertas por este canal.
  const agents = new AgentManager((event) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('agents:event', event)
  })

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

  ipcMain.handle('agents:start', (_e, projectId: string, agent: AgentId) =>
    agents.start(projectId, agent)
  )
  ipcMain.handle('agents:send', (_e, sessionId: string, message: string) =>
    agents.send(sessionId, message)
  )
  ipcMain.handle('agents:stop', (_e, sessionId: string) => agents.stop(sessionId))
}
