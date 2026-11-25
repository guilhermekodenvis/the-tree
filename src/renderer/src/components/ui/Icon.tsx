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
  | 'menu'
  | 'back'
  | 'rename'
  | 'delete'
  | 'grip'
  | 'chat'
  | 'folders'
  | 'move'
  | 'up'
  | 'down'
  | 'skill'
  | 'clock'
  | 'variable'
  | 'branch'
  | 'loop'
  | 'mail'
  | 'approve'
  | 'flag'
  | 'play'
  | 'plug'
  | 'check'
  | 'zoomIn'
  | 'zoomOut'
  | 'fit'

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
  menu: <path d="M2.75 4.25h10.5M2.75 8h10.5M2.75 11.75h10.5" />,
  back: <path d="M13.25 8H2.75M6.75 4 2.75 8l4 4" />,
  rename: (
    <path d="M10.75 2.75a1.41 1.41 0 0 1 2 2L5.5 12l-2.75.75L3.5 10l7.25-7.25ZM9.5 4l2.5 2.5" />
  ),
  delete: (
    <path d="M2.75 4.25h10.5M6.25 4.25v-1c0-.55.45-1 1-1h1.5c.55 0 1 .45 1 1v1M4 4.25l.6 8.6c.05.78.7 1.4 1.5 1.4h3.8c.8 0 1.45-.62 1.5-1.4l.6-8.6M6.75 7v4.5M9.25 7v4.5" />
  ),
  grip: (
    <path d="M6 3.75h.01M10 3.75h.01M6 8h.01M10 8h.01M6 12.25h.01M10 12.25h.01" strokeWidth="2" />
  ),
  chat: (
    <path d="M2.75 4.25c0-.83.67-1.5 1.5-1.5h7.5c.83 0 1.5.67 1.5 1.5v5.5c0 .83-.67 1.5-1.5 1.5H7.5l-3 2.5v-2.5h-.25c-.83 0-1.5-.67-1.5-1.5v-5.5Z" />
  ),
  folders: (
    <path d="M3.75 5.25v-1c0-.83.67-1.5 1.5-1.5h1.9l1.35 1.25h3.25c.83 0 1.5.67 1.5 1.5v4.25c0 .83-.67 1.5-1.5 1.5M1.75 6.75c0-.83.67-1.5 1.5-1.5h1.9L6.5 6.5h3.25c.83 0 1.5.67 1.5 1.5v4.25c0 .83-.67 1.5-1.5 1.5h-6.5c-.83 0-1.5-.67-1.5-1.5v-5.5Z" />
  ),
  move: (
    <path d="M7 13.25H3.25c-.83 0-1.5-.67-1.5-1.5v-7.5c0-.83.67-1.5 1.5-1.5h2.9c.4 0 .78.16 1.06.44l.85.85c.1.1.22.15.36.15h4.33c.83 0 1.5.67 1.5 1.5V8M9.5 11.5h4.5M12 9.5l2 2-2 2" />
  ),
  up: <path d="M8 13.25V2.75M3.75 7 8 2.75 12.25 7" />,
  down: <path d="M8 2.75v10.5M3.75 9 8 13.25 12.25 9" />,
  skill: <path d="M9.25 1.75 3.75 9h4l-1 5.25L12.25 7h-4l1-5.25Z" />,
  clock: <path d="M8 13.75A5.75 5.75 0 1 0 8 2.25a5.75 5.75 0 0 0 0 11.5ZM8 4.75V8l2.25 1.5" />,
  variable: <path d="M4.5 2.75c-1 0-1.5.5-1.5 1.5v2c0 .8-.4 1.5-1.25 1.75.85.25 1.25.95 1.25 1.75v2c0 1 .5 1.5 1.5 1.5M11.5 2.75c1 0 1.5.5 1.5 1.5v2c0 .8.4 1.5 1.25 1.75-.85.25-1.25.95-1.25 1.75v2c0 1-.5 1.5-1.5 1.5M6.25 6l3.5 4m0-4-3.5 4" />,
  branch: <path d="M4.5 2.75v4.5c0 1.1.9 2 2 2h3c1.1 0 2 .9 2 2v1.5M4.5 7.25v6M11.5 2.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM11.5 5.25v6" />,
  loop: <path d="M12.75 6.5A5 5 0 0 0 3.6 5.25M3.25 9.5a5 5 0 0 0 9.15 1.25M3.25 2.75v2.75H6M12.75 13.25V10.5H10" />,
  mail: <path d="M2.75 4.25c0-.55.45-1 1-1h8.5c.55 0 1 .45 1 1v7.5c0 .55-.45 1-1 1h-8.5c-.55 0-1-.45-1-1v-7.5ZM3 4l5 4.25L13 4" />,
  approve: <path d="M8 13.75A5.75 5.75 0 1 0 8 2.25a5.75 5.75 0 0 0 0 11.5ZM5.5 8.25l1.75 1.75 3.25-3.5" />,
  flag: <path d="M3.75 14.25V2.75M3.75 3.25h7.5l-1.5 2.75 1.5 2.75h-7.5" />,
  play: <path d="M4.75 2.9v10.2c0 .4.45.65.8.43l7.9-5.1a.5.5 0 0 0 0-.85l-7.9-5.1a.5.5 0 0 0-.8.42Z" />,
  plug: <path d="M5.75 1.75v3M10.25 1.75v3M3.75 4.75h8.5v2.5a4.25 4.25 0 0 1-8.5 0v-2.5ZM8 11.5v2.75" />,
  check: <path d="m3 8.5 3.25 3.25L13 4.75" />,
  zoomIn: <path d="M7 12.25A5.25 5.25 0 1 0 7 1.75a5.25 5.25 0 0 0 0 10.5ZM14.25 14.25 10.75 10.75M7 4.75v4.5M4.75 7h4.5" />,
  zoomOut: <path d="M7 12.25A5.25 5.25 0 1 0 7 1.75a5.25 5.25 0 0 0 0 10.5ZM14.25 14.25 10.75 10.75M4.75 7h4.5" />,
  fit: <path d="M2.75 5.75v-3h3M10.25 2.75h3v3M13.25 10.25v3h-3M5.75 13.25h-3v-3" />,
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
