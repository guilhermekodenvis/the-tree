// Faixa no topo quando uma versão nova do The Tree já foi baixada: pergunta se pode
// reiniciar agora. "Depois" esconde a faixa; a versão nova entra quando o app fechar.
import { useEffect, useState } from 'react'
import type { UpdateState } from '../../../shared/types'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'

export function UpdateBanner() {
  const [state, setState] = useState<UpdateState | null>(null)
  const [later, setLater] = useState<string | null>(null)

  useEffect(() => {
    void window.api.updates.state().then(setState)
    return window.api.updates.onChange(setState)
  }, [])

  if (state?.status !== 'ready' || !state.version || later === state.version) return null

  return (
    <div className="update-banner" role="status">
      <Icon name="refresh" />
      <span className="update-banner__text">
        A versão {state.version} do The Tree está pronta. Reinicie para usar (a conversa e as
        abas continuam).
      </span>
      <Button variant="accent" onClick={() => void window.api.updates.install()}>
        Reiniciar agora
      </Button>
      <Button onClick={() => setLater(state.version)}>Depois</Button>
    </div>
  )
}
