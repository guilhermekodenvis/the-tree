// Mostra texto em Markdown (negrito, listas, código, tabelas...).
// HTML escrito dentro do texto não é interpretado. Links da web abrem no
// navegador do sistema; links e caminhos para arquivos .md/.mdx abrem no leitor
// do app (quando quem usa o componente passa `onOpenFile`).
import { memo, useMemo, type ReactNode } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Caminho de arquivo Markdown (não um endereço da web). */
export function isMarkdownPath(href: string | undefined | null): boolean {
  if (!href) return false
  if (/^(https?|mailto|tel):/i.test(href)) return false
  const path = href.replace(/#.*$/, '').replace(/:(\d+)(:\d+)?$/, '')
  return /\.(md|mdx|markdown)$/i.test(path)
}

// Caminhos .md/.mdx escritos soltos no texto: "C:\pasta\a.mdx" ou "docs/guia.md".
const PATH_IN_TEXT =
  /([A-Za-z]:[\\/][^\s<>"'`()[\]]+?\.(?:mdx?|markdown)|(?:\.{1,2}\/)?[\w.-]+(?:\/[\w.-]+)+\.(?:mdx?|markdown))(?![\w])/g

interface MdNode {
  type: string
  value?: string
  url?: string
  children?: MdNode[]
}

/** Transforma caminhos .md/.mdx soltos no texto em links (fora de links e código). */
function remarkFileLinks() {
  const visit = (node: MdNode): void => {
    if (!node.children || node.type === 'link' || node.type === 'linkReference') return
    const next: MdNode[] = []
    for (const child of node.children) {
      if (child.type !== 'text' || !child.value) {
        visit(child)
        next.push(child)
        continue
      }
      let last = 0
      for (const match of child.value.matchAll(PATH_IN_TEXT)) {
        const start = match.index ?? 0
        if (start > last) next.push({ type: 'text', value: child.value.slice(last, start) })
        next.push({ type: 'link', url: match[0], children: [{ type: 'text', value: match[0] }] })
        last = start + match[0].length
      }
      if (last < child.value.length) next.push({ type: 'text', value: child.value.slice(last) })
    }
    node.children = next
  }
  return (tree: MdNode) => visit(tree)
}

const plugins = [remarkGfm, remarkFileLinks]

/** Forma comparável de um título ou âncora: "Fatura e recibo" e "#fatura-e-recibo" batem. */
const slug = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Rola até o título do próprio texto que corresponde à âncora (#secao). */
function scrollToAnchor(from: HTMLElement, anchor: string): void {
  const target = slug(decodeURIComponent(anchor))
  const root = from.closest('.markdown')
  const headings = [...(root?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? [])]
  const match =
    headings.find((h) => slug(h.textContent ?? '') === target) ??
    headings.find((h) => slug(h.textContent ?? '').startsWith(target))
  match?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Mantém caminhos de arquivo (o padrão descartaria "C:\..." como protocolo desconhecido). */
const urlTransform = (url: string): string => (isMarkdownPath(url) ? url : defaultUrlTransform(url))

interface Props {
  text: string
  /** Abre um arquivo .md/.mdx no leitor. Sem isso, esses links não fazem nada. */
  onOpenFile?(path: string): void
}

export const Markdown = memo(function Markdown({ text, onOpenFile }: Props) {
  const components = useMemo<Components>(() => {
    const fileLink = (path: string, children: ReactNode): ReactNode => (
      <a
        href={path}
        className="file-link"
        title={onOpenFile ? `Abrir no leitor: ${path}` : path}
        onClick={(event) => {
          event.preventDefault()
          onOpenFile?.(path)
        }}
      >
        {children}
      </a>
    )
    return {
      a: ({ href, children }) =>
        href && isMarkdownPath(href) ? (
          fileLink(href, children)
        ) : href?.startsWith('#') ? (
          // Âncora para uma seção do próprio texto: rola até ela.
          <a
            href={href}
            onClick={(event) => {
              event.preventDefault()
              scrollToAnchor(event.currentTarget, href.slice(1))
            }}
          >
            {children}
          </a>
        ) : (
          <a href={href} target="_blank" rel="noreferrer" title={href}>
            {children}
          </a>
        ),
      // `caminho/arquivo.md` em código também abre no leitor.
      code: ({ className, children }) => {
        const content = String(children)
        if (!className && isMarkdownPath(content.trim()) && !content.includes('\n')) {
          return fileLink(content.trim(), <code>{content}</code>)
        }
        return <code className={className}>{children}</code>
      },
      // Imagem com caminho local não carrega aqui: mostra só a descrição.
      img: ({ src, alt }) =>
        typeof src === 'string' && /^https?:/i.test(src) ? (
          <img src={src} alt={alt ?? ''} />
        ) : (
          <span className="markdown__image-missing">[imagem: {alt || src}]</span>
        )
    }
  }, [onOpenFile])

  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={plugins} components={components} urlTransform={urlTransform}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
