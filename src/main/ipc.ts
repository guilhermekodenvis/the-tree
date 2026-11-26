// Liga cada chamada da interface (window.api.*) ao serviço correspondente.
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { Automation, ConnectorInput } from '../shared/automation'
import type { AccountId, AgentId, AgentSettings, Attachment } from '../shared/types'
import * as projects from './projects/store'
import * as files from './files/service'
import * as watcher from './files/watcher'
import { readMarkdown } from './files/markdown'
import * as skills from './skills/store'
import { AgentManager } from './agents/manager'
import { AutomationEngine, type EngineHooks } from './automations/engine'
import * as connectors from './connectors/store'
import * as accounts from './accounts/service'
import * as attachments from './attachments/store'
import { hasSecret, removeSecret, setSecret } from './secrets'

/** Envia um aviso para todas as janelas abertas. */
function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

export function registerIpc(hooks: Pick<EngineHooks, 'notify'>): {
  agents: AgentManager
  engine: AutomationEngine
} {
  const agents = new AgentManager((event) => broadcast('agents:event', event))
  const engine = new AutomationEngine({
    notify: hooks.notify,
    changed: (projectId) => broadcast('automations:changed', projectId)
  })

  ipcMain.handle('projects:list', () => projects.list())
  ipcMain.handle('projects:add', (_e, path: string, groupId: string | null) =>
    projects.add(path, groupId ?? null)
  )
  ipcMain.handle('projects:remove', async (_e, id: string) => {
    await projects.remove(id)
    await skills.removeProject(id)
    await engine.removeProject(id)
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
  ipcMain.handle('files:read', (_e, projectId: string, path: string) => files.read(projectId, path))
  ipcMain.handle('files:write', (_e, projectId: string, path: string, content: string) =>
    files.write(projectId, path, content)
  )
  ipcMain.handle('files:watch', (_e, projectId: string) =>
    watcher.watch(projectId, (change) => broadcast('files:changed', change))
  )
  ipcMain.handle('files:readMarkdown', (_e, projectId: string, path: string, base?: string) =>
    readMarkdown(projectId, String(path ?? ''), typeof base === 'string' ? base : undefined)
  )
  ipcMain.handle('files:unwatch', (_e, projectId: string) => watcher.unwatch(projectId))

  ipcMain.handle('settings:geminiKey:has', () => hasSecret('gemini-api-key'))
  ipcMain.handle('settings:geminiKey:set', (_e, key: unknown) => {
    const value = typeof key === 'string' ? key.trim() : ''
    if (!value || /\s/.test(value))
      throw new Error('A chave parece inválida: cole só a chave, sem espaços.')
    return setSecret('gemini-api-key', value)
  })
  ipcMain.handle('settings:geminiKey:remove', () => removeSecret('gemini-api-key'))

  ipcMain.handle('skills:listGlobal', () => skills.listGlobal())
  ipcMain.handle('skills:listProject', (_e, projectId: string) => skills.listProject(projectId))
  ipcMain.handle('skills:available', (_e, projectId: string) => skills.available(projectId))
  ipcMain.handle(
    'skills:pick',
    async (event, kind: 'folder' | 'file', projectId: string | null) => {
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
    }
  )
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

  ipcMain.handle('system:showInFolder', (_e, path: string) => {
    if (typeof path === 'string' && path) shell.showItemInFolder(path)
  })

  ipcMain.handle('connectors:list', () => connectors.list())
  ipcMain.handle('connectors:save', (_e, input: ConnectorInput) => connectors.upsert(input))
  ipcMain.handle('connectors:remove', (_e, id: string) => connectors.remove(id))
  ipcMain.handle('connectors:test', (_e, id: string) => connectors.test(id))

  ipcMain.handle('automations:list', (_e, projectId: string) => engine.list(projectId))
  ipcMain.handle('automations:unseen', (_e, projectId: string) => engine.unseen(projectId))
  ipcMain.handle('automations:create', (_e, projectId: string, name?: string) =>
    engine.create(projectId, name)
  )
  ipcMain.handle('automations:save', (_e, automation: Automation) => engine.save(automation))
  ipcMain.handle('automations:remove', (_e, id: string) => engine.remove(id))
  ipcMain.handle('automations:run', (_e, id: string) => engine.runNow(id))
  ipcMain.handle('automations:runs', (_e, id: string) => engine.runs(id))
  ipcMain.handle('automations:getRun', (_e, id: string, runId: string) => engine.getRun(id, runId))
  ipcMain.handle('automations:markSeen', (_e, id: string, runId: string) =>
    engine.markSeen(id, runId)
  )
  ipcMain.handle('automations:cancel', (_e, id: string, runId: string) => engine.cancel(id, runId))
  ipcMain.handle('automations:decide', (_e, id: string, runId: string, approve: boolean) =>
    engine.decide(id, runId, approve === true)
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
  ipcMain.handle(
    'agents:send',
    (_e, sessionId: string, message: string, skillIds: unknown, files: unknown) =>
      agents.send(
        sessionId,
        message,
        Array.isArray(skillIds)
          ? skillIds.filter((id): id is string => typeof id === 'string')
          : [],
        Array.isArray(files)
          ? files.filter((f): f is Attachment => typeof f?.path === 'string')
          : []
      )
  )

  ipcMain.handle('attachments:save', (_e, name: string, bytes: Uint8Array) =>
    attachments.saveBytes(String(name ?? 'anexo'), bytes)
  )
  ipcMain.handle('attachments:pick', async (event) => {
    const options: Electron.OpenDialogOptions = {
      title: 'Anexar arquivos',
      buttonLabel: 'Anexar',
      properties: ['openFile', 'multiSelections']
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? [] : attachments.copyFiles(result.filePaths)
  })

  const ACCOUNTS: AccountId[] = ['claude', 'codex', 'gemini']
  const accountId = (id: unknown): AccountId => {
    if (!ACCOUNTS.includes(id as AccountId)) throw new Error('Conector desconhecido.')
    return id as AccountId
  }
  ipcMain.handle('accounts:status', () => accounts.status())
  ipcMain.handle('accounts:login', (_e, id: unknown) => {
    const which = accountId(id)
    return accounts.login(which, (url) => broadcast('accounts:loginLink', { id: which, url }))
  })
  ipcMain.handle('accounts:logout', (_e, id: unknown) => accounts.logout(accountId(id)))
  ipcMain.handle('agents:respond', (_e, sessionId: string, requestId: string, allow: boolean) =>
    agents.respond(sessionId, requestId, allow)
  )
  ipcMain.handle('agents:interrupt', (_e, sessionId: string) => agents.interrupt(sessionId))
  ipcMain.handle('agents:stop', (_e, sessionId: string) => agents.stop(sessionId))

  return { agents, engine }
}
