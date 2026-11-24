// Tela "Skills" do menu lateral: skills globais, que valem em todos os projetos.
import { useGlobalSkills } from '../hooks/useSkills'
import { SkillList } from './SkillList'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'

export function SkillsScreen() {
  const state = useGlobalSkills()

  return (
    <main className="screen">
      <header className="screen__header">
        <div>
          <h1 className="text-title">Skills</h1>
          <p className="text-caption">
            Skills globais podem ser usadas em qualquer projeto: digite / na conversa para escolher
            uma.
          </p>
        </div>
        <div className="screen__actions">
          <Button icon="document" onClick={() => void state.pick('file')}>
            Adicionar arquivo
          </Button>
          <Button variant="accent" icon="folder" onClick={() => void state.pick('folder')}>
            Adicionar pasta
          </Button>
        </div>
      </header>

      {state.error && (
        <p className="notice" role="alert">
          {state.error}
        </p>
      )}

      {state.loaded && state.skills.length === 0 ? (
        <div className="empty-state">
          <Icon name="skill" className="empty-state__icon" />
          <p className="empty-state__title">Nenhuma skill global ainda</p>
          <p>
            Adicione uma pasta com SKILL.md, uma pasta com várias skills (como a .claude\skills do seu
            usuário) ou um arquivo .md com instruções.
          </p>
        </div>
      ) : (
        <SkillList
          skills={state.skills}
          empty=""
          removeLabel="Remover do app"
          confirmText={() =>
            'Tirar esta skill do app? Ela também sai dos projetos que a usam. O arquivo no disco fica.'
          }
          onRemove={(skill) => void state.remove(skill)}
        />
      )}
    </main>
  )
}
