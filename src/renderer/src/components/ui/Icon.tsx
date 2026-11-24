// Ícones do app, desenhados em linha (sem biblioteca externa).
// Para trocar um ícone, mude o desenho aqui; o tamanho e a cor vêm do design system.
import type { ReactNode } from 'react'

export type IconName =
  | 'folder'
  | 'document'
  | 'chevron'
  | 'refresh'
  | 'send'
  | 'stop'
  | 'compose'
  | 'add'
  | 'dismiss'
  | 'tree'

const paths: Record<IconName, ReactNode> = {
  folder: (
    <path d="M1.75 4.25c0-.83.67-1.5 1.5-1.5h2.9c.4 0 .78.16 1.06.44l.85.85c.1.1.22.15.36.15h4.33c.83 0 1.5.67 1.5 1.5v6.06c0 .83-.67 1.5-1.5 1.5h-9.5c-.83 0-1.5-.67-1.5-1.5v-7.5Z" />
  ),
  document: (
    <path d="M9.25 1.75h-4.5c-.83 0-1.5.67-1.5 1.5v9.5c0 .83.67 1.5 1.5 1.5h6.5c.83 0 1.5-.67 1.5-1.5v-7.5l-3.5-3.5Zm0 0v2.5c0 .55.45 1 1 1h2.5" />
  ),
  chevron: <path d="m6 3.75 4.25 4.25L6 12.25" />,
  refresh: <path d="M13.25 8a5.25 5.25 0 1 1-1.54-3.71M13.25 2.5v2.75H10.5" />,
  send: <path d="M2.25 2.5 14 8 2.25 13.5 4 8 2.25 2.5ZM4 8h5" />,
  stop: <rect x="4" y="4" width="8" height="8" rx="1.5" />,
  compose: (
    <path d="M7.25 2.75h-3.5c-.83 0-1.5.67-1.5 1.5v8c0 .83.67 1.5 1.5 1.5h8c.83 0 1.5-.67 1.5-1.5v-3.5M12 2.25a1.24 1.24 0 0 1 1.75 1.75L8.5 9.25l-2.5.75.75-2.5L12 2.25Z" />
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
