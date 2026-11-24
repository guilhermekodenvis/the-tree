// Abas no estilo do Windows 11 (SelectorBar): texto com um traço de destaque
// embaixo da aba ativa. Use com o painel correspondente logo abaixo.
import type { KeyboardEvent } from 'react'
import { Icon, type IconName } from './Icon'

export interface TabItem<T extends string> {
  id: T
  label: string
  icon?: IconName
}

interface Props<T extends string> {
  tabs: TabItem<T>[]
  active: T
  onChange(id: T): void
  label: string
}

export function Tabs<T extends string>({ tabs, active, onChange, label }: Props<T>) {
  // Setas esquerda/direita trocam de aba, como nas abas do Windows.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    const index = tabs.findIndex((tab) => tab.id === active)
    const step = event.key === 'ArrowRight' ? 1 : -1
    const next = tabs[(index + step + tabs.length) % tabs.length]
    onChange(next.id)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus()
  }

  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab={tab.id}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`tab ${selected ? 'tab--active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.icon && <Icon name={tab.icon} />}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
