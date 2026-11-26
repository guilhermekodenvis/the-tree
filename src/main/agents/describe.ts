// Textos curtos que descrevem o que um agente está fazendo, para a conversa.
import { isAbsolute, relative } from 'node:path'

/** Caminho relativo ao projeto quando o arquivo está dentro dele; senão, o caminho inteiro. */
export function shortPath(path: string, cwd: string): string {
  const rel = relative(cwd, path)
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : path
}

/** Corta textos longos, avisando o tamanho original. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n… (cortado: ${text.length} caracteres no total)`
}

/** Nomes, na conversa, das ferramentas dos conectores do The Tree (tools/server.ts). */
const TREE_TOOLS: Record<string, string> = {
  places_search: 'Google Maps',
  place_details: 'Google Maps',
  browser_open: 'Navegador',
  browser_screenshot: 'Navegador'
}

/** "mcp__the-tree__places_search" (Claude) ou "places_search" (Codex) vira "Google Maps". */
export function treeToolLabel(name: string): string | null {
  const short = name.replace(/^mcp__the-tree__/, '')
  return short !== name || name in TREE_TOOLS ? (TREE_TOOLS[short] ?? null) : null
}
