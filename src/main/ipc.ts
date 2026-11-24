// Liga cada chamada da interface (window.api.*) ao serviço correspondente.
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { AgentId, AgentSettings } from '../shared/types'
import * as projects from './projects/store'
import * as files from './files/service'
import * as watcher from './files/watcher'
import * as skills from './skills/store'
import { AgentManager } from './agents/manager'
import { hasSecret, removeSecret, setSecret } from './secrets'

/** Envia um aviso para todas as janelas abertas. */
function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

export function registerIpc(): AgentManager {
  const agents = new AgentManager((event) => broadcast('agents:event', event))

  ipcMain.handle('projects:list', () => projects.list())
  ipcMain.handle('projects:add', (_e, path: string, groupId: string | null) =>
    projects.add(path, groupId ?? null)
  )
  ipcMain.handle('projects:remove', async (_e, id: string) => {
    await projects.remove(id)
    await skills.removeProject(id)
  })
  ipcMain.handle('projects:rename', (_e, id: string, name: string) =>
    projects.renameProject(id, name)
  )
  ipcMain.handle('projects:move', (_e, id: string, groupId: string | null) =>
    projects.moveProject(id, groupId ?? null)
  )
  ipcMain.handle('groups:create', (_e, name?: string) => projects.createGroup(name))
  ipcMain.handle('groups:rename', (_e, id: string, name: string) => projects.renameGroup(id, name))
  ipcMain.handle('groups:remove', (_e, id: string) => projects.removeGroup(id))
  ipcMain.handle('groups:reorder', (_e, ids: string[]) => projects.reorderGroups(ids))
  ipcMain.handle('projects:pick', async (event, groupId: string | null) => {
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
    return projects.add(result.filePaths[0], groupId ?? null)
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

  ipcMain.handle('skills:listGlobal', () => skills.listGlobal())
  ipcMain.handle('skills:listProject', (_e, projectId: string) => skills.listProject(projectId))
  ipcMain.handle('skills:available', (_e, projectId: string) => skills.available(projectId))
  ipcMain.handle('skills:pick', async (event, kind: 'folder' | 'file', projectId: string | null) => {
    if (projectId !== null && !(await projects.get(projectId))) {
      throw new Error('Este projeto não existe mais.')
    }
    const options: Electron.OpenDialogOptions =
      kind === 'file'
        ? {
            title: 'Adicionar skill (arquivo)',
            buttonLabel: 'Adicionar',
            properties: ['openFile'],
            filters: [{ name: 'Instruções da skill', extensions: ['md', 'markdown', 'txt'] }]
          }
        : {
            title: 'Adicionar skill (pasta com SKILL.md)',
            buttonLabel: 'Adicionar',
            properties: ['openDirectory']
          }
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return []
    return skills.add(result.filePaths[0], projectId ?? null)
  })
  ipcMain.handle('skills:add', async (_e, path: string, projectId: string | null) => {
    if (projectId !== null && !(await projects.get(projectId))) {
      throw new Error('Este projeto não existe mais.')
    }
    return skills.add(path, projectId ?? null)
  })
  ipcMain.handle('skills:remove', (_e, id: string) => skills.remove(id))
  ipcMain.handle('skills:importToProject', (_e, projectId: string, skillId: string) =>
    skills.importToProject(projectId, skillId)
  )
  ipcMain.handle('skills:removeFromProject', (_e, projectId: string, skillId: string) =>
    skills.removeFromProject(projectId, skillId)
  )

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
  ipcMain.handle('conversations:setBypass', (_e, projectId: string, id: string, on: boolean) =>
    agents.setBypass(projectId, id, on === true)
  )
  ipcMain.handle(
    'conversations:setSettings',
    (_e, projectId: string, id: string, settings: Partial<AgentSettings>) =>
      agents.setSettings(projectId, id, {
        ...(typeof settings?.model === 'string' ? { model: settings.model } : {}),
        ...(typeof settings?.effort === 'string' ? { effort: settings.effort } : {})
      })
  )
  ipcMain.handle('conversations:removeAll', (_e, projectId: string) => agents.removeAll(projectId))

  ipcMain.handle('agents:start', (_e, projectId: string, conversationId: string) =>
    agents.start(projectId, conversationId)
  )
  ipcMain.handle('agents:send', (_e, sessionId: string, message: string, skillIds: unknown) =>
    agents.send(
      sessionId,
      message,
      Array.isArray(skillIds) ? skillIds.filter((id): id is string => typeof id === 'string') : []
    )
  )
  ipcMain.handle('agents:respond', (_e, sessionId: string, requestId: string, allow: boolean) =>
    agents.respond(sessionId, requestId, allow)
  )
  ipcMain.handle('agents:interrupt', (_e, sessionId: string) => agents.interrupt(sessionId))
  ipcMain.handle('agents:stop', (_e, sessionId: string) => agents.stop(sessionId))

  return agents
}
