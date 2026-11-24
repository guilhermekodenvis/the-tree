// Os agentes que o The Tree conhece, com os modelos e níveis de esforço que dá
// para escolher em cada conversa. Usado pelo processo principal (nomes padrão,
// validação, o que mandar ao agente) e pela interface (menus e rótulos).
import type { AgentId, AgentSettings } from './types'

export interface Choice {
  /** Valor enviado ao agente. */
  id: string
  /** Rótulo mostrado na interface. */
  label: string
}

export interface AgentInfo {
  id: AgentId
  /** Nome curto mostrado na interface. */
  name: string
  /** Ferramenta que roda por baixo. */
  tool: string
  /** Modelos que dá para escolher; vazio = o agente usa um modelo fixo. */
  models: Choice[]
  /** Níveis de esforço (quanto o modelo pensa antes de responder). */
  efforts: Choice[]
  /** O que uma conversa nova usa. */
  defaults: AgentSettings
}

export const AGENTS: AgentInfo[] = [
  {
    id: 'claude',
    name: 'Claude',
    tool: 'Claude Code',
    models: [
      { id: 'claude-opus-5-5', label: 'Opus 5.5' },
      { id: 'claude-fable-5-2', label: 'Fable 5.2' },
      { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' }
    ],
    efforts: [
      { id: 'low', label: 'Baixo' },
      { id: 'medium', label: 'Médio' },
      { id: 'high', label: 'Alto' },
      { id: 'xhigh', label: 'Extra' }
    ],
    defaults: { model: 'claude-opus-5-5', effort: 'high' }
  },
  {
    id: 'codex',
    name: 'ChatGPT',
    tool: 'Codex',
    models: [
      { id: 'gpt-6.2-sol', label: '6.2 Sol' },
      { id: 'gpt-6.2-astra', label: '6.2 Astra' }
    ],
    efforts: [
      { id: 'low', label: 'Baixo' },
      { id: 'medium', label: 'Médio' },
      { id: 'high', label: 'Elevado' },
      { id: 'xhigh', label: 'Muito elevado' }
    ],
    defaults: { model: 'gpt-6.2-sol', effort: 'medium' }
  },
  {
    id: 'gemini',
    name: 'Gemini',
    tool: 'Gemini CLI',
    models: [],
    efforts: [],
    defaults: { model: null, effort: null }
  }
]

export function agentInfo(id: AgentId): AgentInfo | undefined {
  return AGENTS.find((agent) => agent.id === id)
}

export function agentName(id: AgentId): string {
  return agentInfo(id)?.name ?? id
}

/**
 * Modelo e esforço válidos para o agente: o que foi salvo, se ainda existir na
 * lista, ou o padrão do agente.
 */
export function resolveSettings(
  agent: AgentId,
  saved: Partial<AgentSettings> | undefined
): AgentSettings {
  const info = agentInfo(agent)
  if (!info) return { model: null, effort: null }
  const known = (list: Choice[], value: string | null | undefined): value is string =>
    typeof value === 'string' && list.some((c) => c.id === value)
  return {
    model: known(info.models, saved?.model) ? saved.model : info.defaults.model,
    effort: known(info.efforts, saved?.effort) ? saved.effort : info.defaults.effort
  }
}
