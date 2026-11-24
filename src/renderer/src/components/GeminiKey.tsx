// Configuração da chave de API do Gemini.
// A chave é digitada aqui e vai direto para o processo principal, que a guarda
// criptografada. A interface nunca a recebe de volta: só sabe se ela existe.
import { useCallback, useEffect, useState } from 'react'
import { messageOf } from '../lib/errors'
import { Button } from './ui/Button'

const AI_STUDIO_URL = 'https://aistudio.google.com/apikey'

export interface GeminiKeyState {
  /** null enquanto ainda não se sabe. */
  configured: boolean | null
  refresh(): void
}

export function useGeminiKey(): GeminiKeyState {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const refresh = useCallback(() => {
    window.api.settings.geminiKey
      .has()
      .then(setConfigured)
      .catch(() => setConfigured(false))
  }, [])
  useEffect(refresh, [refresh])
  return { configured, refresh }
}

interface FormProps {
  configured: boolean
  onDone(): void
}

export function GeminiKeyForm({ configured, onDone }: FormProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      await window.api.settings.geminiKey.set(value)
      setValue('')
      onDone()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    try {
      await window.api.settings.geminiKey.remove()
      onDone()
    } catch (err) {
      setError(messageOf(err))
    }
  }

  return (
    <form
      className="key-form"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <label className="key-form__label" htmlFor="gemini-key">
        Chave de API do Gemini
      </label>
      <input
        id="gemini-key"
        className="field"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder="Cole aqui a chave do Google AI Studio"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <p className="text-caption">
        Crie a chave em{' '}
        <a href={AI_STUDIO_URL} target="_blank" rel="noreferrer" className="link">
          aistudio.google.com/apikey
        </a>
        . Ela fica guardada criptografada neste computador e só é usada para falar com o Gemini.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="key-form__actions">
        <Button variant="accent" type="submit" disabled={!value.trim() || saving}>
          {configured ? 'Trocar chave' : 'Salvar chave'}
        </Button>
        <Button onClick={onDone}>Cancelar</Button>
        {configured && (
          <Button className="key-form__remove" onClick={() => void remove()}>
            Remover chave
          </Button>
        )}
      </div>
    </form>
  )
}
