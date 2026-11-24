// Botão padrão do design system. As variantes mapeiam para classes de components.css.
import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'accent'
  icon?: IconName
}

export function Button({ variant = 'default', icon, children, className = '', ...rest }: Props) {
  const classes = ['btn', variant === 'accent' ? 'btn--accent' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  /** Texto lido por leitores de tela e mostrado como dica. */
  label: string
  danger?: boolean
}

export function IconButton({ icon, label, danger, className = '', ...rest }: IconButtonProps) {
  const classes = ['btn', 'btn--icon', danger ? 'btn--danger' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  )
}
