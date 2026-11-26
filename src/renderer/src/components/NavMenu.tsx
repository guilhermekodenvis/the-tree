// Menu lateral do app, no estilo do painel de navegação do Windows 11.
// Recolhido, mostra só os ícones; o estado fica lembrado entre aberturas do app.
import type { ReactNode } from 'react'
import { Icon, type IconName } from './ui/Icon'
import { IconButton } from './ui/Button'

/** 'quick': um chat rápido aberto (a lista fica abaixo dos itens do menu). */
export type Section = 'projects' | 'skills' | 'connectors' | 'quick'

const ITEMS: { id: Exclude<Section, 'quick'>; label: string; icon: IconName }[] = [
  { id: 'projects', label: 'Projetos', icon: 'folders' },
  { id: 'skills', label: 'Skills', icon: 'skill' },
  { id: 'connectors', label: 'Conectores', icon: 'plug' }
]

interface Props {
  active: Section
  collapsed: boolean
  onToggle(): void
  onNavigate(section: Section): void
  /** Conteúdo abaixo dos itens (a seção "Chats rápidos"). */
  children?: ReactNode
}

export function NavMenu({ active, collapsed, onToggle, onNavigate, children }: Props) {
  return (
    <nav className={`nav ${collapsed ? 'nav--collapsed' : ''}`} aria-label="Menu principal">
      <IconButton
        icon="menu"
        label={collapsed ? 'Abrir menu' : 'Recolher menu'}
        aria-expanded={!collapsed}
        className="nav__toggle"
        onClick={onToggle}
      />
      <ul className="nav__list">
        {ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`nav-link ${item.id === active ? 'nav-link--active' : ''}`}
              aria-current={item.id === active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={item.icon} />
              <span className="nav-link__label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {children}
    </nav>
  )
}
