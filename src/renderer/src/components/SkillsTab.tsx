// Aba "Skills" do projeto: as skills locais (só deste projeto) e as globais trazidas para ele.
import { useEffect, useRef, useState } from 'react'
import type { Project, Skill } from '../../../shared/types'
import { useProjectSkills } from '../hooks/useSkills'
import { SkillList } from './SkillList'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'

export function SkillsTab({ project }: { project: Project }) {
  const state = useProjectSkills(project.id)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="skills-tab">
      <header className="screen__header">
        <p className="text-caption">
          Digite / na conversa para usar uma skill. Aparecem as deste projeto e as globais; as locais
          de outros projetos não.
        </p>
        <div className="screen__actions">
          <div className="popover-anchor">
            <Button
              icon="skill"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              Skill global
            </Button>
            {menuOpen && (
              <GlobalMenu
                skills={state.importable}
                onPick={(skill) => {
                  setMenuOpen(false)
                  void state.importGlobal(skill)
                }}
                onClose={() => setMenuOpen(false)}
              />
            )}
          </div>
          <Button icon="document" onClick={() => void state.pick('file')}>
            Arquivo
          </Button>
          <Button variant="accent" icon="folder" onClick={() => void state.pick('folder')}>
            Pasta
          </Button>
        </div>
      </header>

      {state.error && (
        <p className="notice" role="alert">
          {state.error}
        </p>
      )}

      {state.loaded && (
        <>
          <section className="skills-tab__section">
            <h2 className="skills-tab__title">Deste projeto</h2>
            <SkillList
              skills={state.own}
              empty="Nenhuma skill local. Adicione uma pasta ou um arquivo: ela só aparece neste projeto."
              removeLabel="Remover do projeto"
              confirmText={() => 'Tirar esta skill do projeto? O arquivo no disco fica.'}
              onRemove={(skill) => void state.remove(skill)}
            />
          </section>
          <section className="skills-tab__section">
            <h2 className="skills-tab__title">Globais neste projeto</h2>
            <SkillList
              skills={state.imported}
              empty='Nenhuma skill global trazida para cá. Use "Skill global" para escolher uma do menu Skills.'
              removeLabel="Tirar do projeto"
              confirmText={() =>
                'Tirar esta skill global do projeto? Ela continua no menu Skills e ainda pode ser usada com /.'
              }
              onRemove={(skill) => void state.unimport(skill)}
            />
          </section>
        </>
      )}
    </div>
  )
}

/** Menu com as skills globais que ainda não estão no projeto. */
function GlobalMenu({
  skills,
  onPick,
  onClose
}: {
  skills: Skill[]
  onPick(skill: Skill): void
  onClose(): void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    const onPointer = (event: PointerEvent): void => {
      if (!ref.current?.parentElement?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector('button')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="popover popover--wide" role="menu" ref={ref}>
      <p className="popover__title">Trazer skill global</p>
      {skills.length === 0 && (
        <p className="popover__hint">
          Nenhuma skill global disponível. Adicione pelo menu Skills, na barra lateral.
        </p>
      )}
      {skills.map((skill) => (
        <button
          key={skill.id}
          type="button"
          role="menuitem"
          className="popover__item"
          onClick={() => onPick(skill)}
        >
          <Icon name="skill" />
          <span className="card__body">
            <span className="popover__item-name truncate">{skill.name}</span>
            {skill.description && (
              <span className="text-caption truncate">{skill.description}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
