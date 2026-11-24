// Lista de skills em cartões, usada no menu Skills e na aba Skills do projeto.
import { useState } from 'react'
import type { Skill } from '../../../shared/types'
import { Button, IconButton } from './ui/Button'
import { Icon } from './ui/Icon'

interface Props {
  skills: Skill[]
  /** Texto quando a lista está vazia. */
  empty: string
  /** Rótulo da ação de tirar (ex.: "Remover do app", "Tirar do projeto"). */
  removeLabel: string
  /** Pergunta de confirmação antes de tirar. */
  confirmText(skill: Skill): string
  onRemove(skill: Skill): void
}

export function SkillList({ skills, empty, removeLabel, confirmText, onRemove }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null)

  if (skills.length === 0) return <p className="group-empty">{empty}</p>

  return (
    <ul className="skill-list">
      {skills.map((skill) => (
        <li key={skill.id} className="skill-card">
          <span className="skill-card__icon">
            <Icon name="skill" />
          </span>
          <div className="card__body">
            <div className="skill-card__name truncate">{skill.name}</div>
            {skill.missing ? (
              <p className="skill-card__missing">
                Não encontrei o arquivo da skill. Ela foi movida ou apagada?
              </p>
            ) : (
              skill.description && <p className="skill-card__description">{skill.description}</p>
            )}
            <p className="text-caption text-mono truncate" title={skill.path}>
              {skill.path}
            </p>
            {confirming === skill.id && (
              <div className="skill-card__confirm">
                <span className="text-caption">{confirmText(skill)}</span>
                <Button
                  variant="accent"
                  onClick={() => {
                    setConfirming(null)
                    onRemove(skill)
                  }}
                >
                  {removeLabel}
                </Button>
                <Button onClick={() => setConfirming(null)}>Cancelar</Button>
              </div>
            )}
          </div>
          <IconButton
            icon="delete"
            label={removeLabel}
            danger
            className="skill-card__remove"
            onClick={() => setConfirming(skill.id)}
          />
        </li>
      ))}
    </ul>
  )
}
