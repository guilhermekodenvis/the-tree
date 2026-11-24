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
