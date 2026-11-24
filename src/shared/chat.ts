// Regras de como os eventos dos agentes viram itens da conversa.
// Usadas pela interface (para mostrar) e pelo processo principal (para salvar o histórico),
// assim os dois lados sempre concordam sobre o que a conversa contém.
import type { AgentEvent, ChatItem, PermissionState } from './types'

const newId = (): string => crypto.randomUUID()

export function addUserMessage(items: ChatItem[], text: string, skills: string[] = []): ChatItem[] {
  return [...items, { kind: 'user', id: newId(), text, ...(skills.length > 0 ? { skills } : {}) }]
}

export function setPermission(
  items: ChatItem[],
  requestId: string,
  state: PermissionState
): ChatItem[] {
  return items.map((item) =>
    item.kind === 'permission' && item.id === requestId ? { ...item, state } : item
  )
}

/** Aplica um evento à lista de itens. Eventos que não aparecem na tela devolvem a mesma lista. */
export function applyEvent(items: ChatItem[], event: AgentEvent): ChatItem[] {
  switch (event.type) {
    case 'text': {
      const last = items.at(-1)
      // Pedaços do mesmo bloco de texto se juntam no último balão.
      if (last?.kind === 'assistant' && last.id === event.key) {
        return [...items.slice(0, -1), { ...last, text: last.text + event.text }]
      }
      return [...items, { kind: 'assistant', id: event.key, text: event.text }]
    }
    case 'tool': {
      // O mesmo id de novo atualiza a linha (ex.: comando que terminou).
      const index = items.findIndex((item) => item.kind === 'tool' && item.id === event.id)
      const tool: ChatItem = { kind: 'tool', id: event.id, name: event.name, detail: event.detail }
      if (index === -1) return [...items, tool]
      return items.map((item, i) => (i === index ? tool : item))
    }
    case 'permission':
      return [
        ...items,
        {
          kind: 'permission',
          id: event.requestId,
          title: event.title,
          detail: event.detail,
          state: 'pending'
        }
      ]
    case 'permission-cancelled':
      return setPermission(items, event.requestId, 'cancelled')
    case 'permission-resolved':
      return setPermission(items, event.requestId, event.state)
    case 'note':
      return [...items, { kind: 'note', id: newId(), text: event.message }]
    case 'error':
      return [...items, { kind: 'error', id: newId(), text: event.message }]
    case 'status':
    case 'resume-id':
      return items
  }
}

/**
 * Ao carregar uma conversa salva, pedidos que ficaram sem resposta já não valem:
 * o processo que os fez não existe mais.
 */
export function settleSaved(items: ChatItem[]): ChatItem[] {
  return items.map((item) =>
    item.kind === 'permission' && item.state === 'pending' ? { ...item, state: 'cancelled' } : item
  )
}
