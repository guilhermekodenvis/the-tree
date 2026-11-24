// Ícones do app, desenhados em linha (sem biblioteca externa).
// Para trocar um ícone, mude o desenho aqui; o tamanho e a cor vêm do design system.
import type { ReactNode } from 'react'

export type IconName = 'folder' | 'add' | 'dismiss' | 'tree'

const paths: Record<IconName, ReactNode> = {
  folder: (
    <path d="M1.75 4.25c0-.83.67-1.5 1.5-1.5h2.9c.4 0 .78.16 1.06.44l.85.85c.1.1.22.15.36.15h4.33c.83 0 1.5.67 1.5 1.5v6.06c0 .83-.67 1.5-1.5 1.5h-9.5c-.83 0-1.5-.67-1.5-1.5v-7.5Z" />
  ),
  add: <path d="M8 2.75v10.5M2.75 8h10.5" />,
  dismiss: <path d="m3.5 3.5 9 9m0-9-9 9" />,
  tree: (
    <>
      <path d="M8 14.25V8.5M8 11 5.25 8.75M8 9.75l2.5-2" />
      <path d="M8 1.75c2.35 0 4.25 1.7 4.25 3.9 0 2.1-1.9 3.85-4.25 3.85S3.75 7.75 3.75 5.65c0-2.2 1.9-3.9 4.25-3.9Z" />
    </>
  )
}

interface Props {
  name: IconName
  className?: string
}

export function Icon({ name, className = 'icon' }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
