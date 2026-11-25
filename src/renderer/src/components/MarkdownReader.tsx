// Leitor de arquivos .md/.mdx ao lado da conversa: mostra o texto formatado
// (títulos, listas, tabelas), não o código cru. O cabeçalho "---" do arquivo vira
// uma lista de campos; em MDX, imports, exports e as tags de componentes somem e
// fica o texto de dentro delas.
import { useCallback, useEffect, useState } from 'react'
import { messageOf } from '../lib/errors'
import { Markdown } from './Markdown'
import { IconButton } from './ui/Button'
import { Icon } from './ui/Icon'

interface Props {
  projectId: string
  /** Caminho como veio do link (pode ser relativo). */
  path: string
  /** Arquivo de onde o link saiu (para caminhos relativos). */
  base?: string
  canGoBack: boolean
  onBack(): void
  /** Link para outro .md/.mdx dentro do arquivo aberto. */
  onNavigate(path: string, base: string): void
  onClose(): void
}

interface Parsed {
  meta: [string, string][]
  body: string
}

/** Separa o cabeçalho "---" (campos simples) do texto. */
function parse(content: string, mdx: boolean): Parsed {
  let body = content.replace(/^﻿/, '')
  const meta: [string, string][] = []
  const front = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(body)
  if (front) {
    body = body.slice(front[0].length)
    for (const line of front[1].split(/\r?\n/)) {
      const field = /^([\w-]+):\s*(.*)$/.exec(line)
      if (field && field[2]) meta.push([field[1], field[2].replace(/^(['"])(.*)\1$/, '$2')])
    }
  }
  if (mdx) body = cleanMdx(body)
  return { meta, body }
}

/** Tira o que é código do MDX e deixa o texto. Blocos de código (```) ficam intactos. */
function cleanMdx(body: string): string {
  let inFence = false
  return body
    .split(/\r?\n/)
    .filter((line) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
      if (inFence) return true
      if (/^\s*(import|export)\s/.test(line)) return false
      // Linha que é só uma tag de componente: <Aviso tipo="x">, </Aviso>, <Imagem ... />.
      if (/^\s*<\/?[A-Z][\w.]*(\s[^>]*)?\/?>\s*$/.test(line)) return false
      return true
    })
    .join('\n')
}

export function MarkdownReader({
  projectId,
  path,
  base,
  canGoBack,
  onBack,
  onNavigate,
  onClose
}: Props) {
  const [file, setFile] = useState<{ path: string; parsed: Parsed } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.files.readMarkdown(projectId, path, base)
      setFile({ path: result.path, parsed: parse(result.content, /\.mdx$/i.test(result.path)) })
    } catch (err) {
      setFile(null)
      setError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }, [projectId, path, base])

  useEffect(() => {
    void load()
  }, [load])

  const name = (file?.path ?? path).split(/[\\/]/).pop()

  return (
    <aside className="reader" aria-label={`Leitor: ${name}`}>
      <header className="reader__header">
        {canGoBack && (
          <IconButton icon="back" label="Voltar ao arquivo anterior" onClick={onBack} />
        )}
        <Icon name="document" />
        <div className="card__body">
          <div className="reader__name truncate" title={name}>
            {name}
          </div>
          <div className="text-caption text-mono truncate" title={file?.path ?? path}>
            {file?.path ?? path}
          </div>
        </div>
        <IconButton icon="refresh" label="Recarregar" onClick={() => void load()} />
        {file && (
          <IconButton
            icon="folder"
            label="Mostrar na pasta"
            onClick={() => void window.api.system.showInFolder(file.path)}
          />
        )}
        <IconButton icon="dismiss" label="Fechar leitor" onClick={onClose} />
      </header>

      <div className="reader__body">
        {error ? (
          <p className="notice" role="alert">
            {error}
          </p>
        ) : !file ? (
          loading && <p className="text-caption">Abrindo…</p>
        ) : (
          <>
            {file.parsed.meta.length > 0 && (
              <dl className="reader__meta">
                {file.parsed.meta.map(([key, value]) => (
                  <div key={key} className="reader__meta-row">
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <Markdown text={file.parsed.body} onOpenFile={(next) => onNavigate(next, file.path)} />
          </>
        )}
      </div>
    </aside>
  )
}
