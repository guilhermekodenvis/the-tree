// Logos dos serviços que aparecem em Conectores, desenhadas aqui (sem imagens de
// fora). As cores vêm dos tokens --color-brand-* do design system.
import { useId } from 'react'

export type LogoName = 'claude' | 'codex' | 'gemini' | 'gmail' | 'smtp' | 'maps' | 'browser'

export function Logo({ name, size = 32 }: { name: LogoName; size?: number }) {
  const gradient = useId()
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true }

  switch (name) {
    case 'claude': {
      // Estrela de raios da Anthropic.
      const rays = [9.5, 8, 9.5, 7.5, 9.5, 8.5, 9.5, 7.5, 9, 8]
      return (
        <svg {...common}>
          <g stroke="var(--color-brand-claude)" strokeWidth="2.2" strokeLinecap="round">
            {rays.map((length, i) => {
              const angle = (i * 36 * Math.PI) / 180
              return (
                <line
                  key={i}
                  x1={12 + Math.cos(angle) * 2}
                  y1={12 + Math.sin(angle) * 2}
                  x2={12 + Math.cos(angle) * length}
                  y2={12 + Math.sin(angle) * length}
                />
              )
            })}
          </g>
        </svg>
      )
    }
    case 'codex':
      // Nó de seis pétalas da OpenAI.
      return (
        <svg {...common}>
          <g fill="none" stroke="var(--color-brand-openai)" strokeWidth="1.5">
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <rect
                key={deg}
                x="9.6"
                y="2.6"
                width="4.8"
                height="11"
                rx="2.4"
                transform={`rotate(${deg} 12 12)`}
              />
            ))}
          </g>
        </svg>
      )
    case 'gemini':
      // Brilho de quatro pontas, em degradê.
      return (
        <svg {...common}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--color-brand-gemini-start)" />
              <stop offset="0.55" stopColor="var(--color-brand-gemini-middle)" />
              <stop offset="1" stopColor="var(--color-brand-gemini-end)" />
            </linearGradient>
          </defs>
          <path
            fill={`url(#${gradient})`}
            d="M12 1.5c.5 5.6 4.9 10 10.5 10.5-5.6.5-10 4.9-10.5 10.5C11.5 16.9 7.1 12.5 1.5 12 7.1 11.5 11.5 7.1 12 1.5Z"
          />
        </svg>
      )
    case 'gmail':
      // Envelope "M" colorido do Gmail.
      return (
        <svg {...common}>
          <path fill="var(--color-brand-google-blue)" d="M2 19V8.4l4 3V20H3a1 1 0 0 1-1-1Z" />
          <path fill="var(--color-brand-google-green)" d="M18 20v-8.6l4-3V19a1 1 0 0 1-1 1h-3Z" />
          <path fill="var(--color-brand-google-red)" d="M6 11.4V6.5l6 4.5 6-4.5v4.9L12 15.9Z" />
          <path
            fill="var(--color-brand-google-red-dark)"
            d="M2 8.4V6.6c0-1.7 1.9-2.6 3.2-1.6L6 5.6v5.8Z"
          />
          <path
            fill="var(--color-brand-google-yellow)"
            d="M22 8.4V6.6c0-1.7-1.9-2.6-3.2-1.6L18 5.6v5.8Z"
          />
        </svg>
      )
    case 'maps':
      // Alfinete do Google Maps, com as cores do Google.
      return (
        <svg {...common}>
          <path
            fill="var(--color-brand-google-green)"
            d="M12 1.5a7.5 7.5 0 0 0-7.5 7.5c0 2 .8 3.8 2 5.2L12 8.7Z"
          />
          <path fill="var(--color-brand-google-blue)" d="M12 1.5a7.5 7.5 0 0 1 5.6 12.5L12 8.7Z" />
          <path
            fill="var(--color-brand-google-yellow)"
            d="M6.5 14.2c1.7 2 3.6 3.9 4.6 6.4.3.8 1.5.8 1.8 0 1-2.5 2.9-4.4 4.7-6.6L12 8.7Z"
          />
          <circle cx="12" cy="9" r="2.7" fill="var(--color-brand-google-red)" />
        </svg>
      )
    case 'browser':
      // Globo: o navegador do próprio The Tree.
      return (
        <svg {...common}>
          <g fill="none" stroke="var(--color-accent)" strokeWidth="1.6">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.5 3.6 5.5 3.6 9s-1.1 6.5-3.6 9c-2.5-2.5-3.6-5.5-3.6-9S9.5 5.5 12 3Z" />
          </g>
        </svg>
      )
    case 'smtp':
      return (
        <svg {...common}>
          <g
            fill="none"
            stroke="var(--color-text-secondary)"
            strokeWidth="1.6"
            strokeLinejoin="round"
          >
            <rect x="3" y="5.5" width="18" height="13" rx="2" />
            <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
          </g>
        </svg>
      )
  }
}
