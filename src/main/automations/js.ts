// JavaScript das automações: condições, valores de variáveis, listas dos loops e
// as {{expressões}} dentro dos textos.
//
// O código roda num contexto separado do app (node:vm), só com as variáveis do
// fluxo, e com limite de tempo: um laço infinito vira erro do passo, não trava o
// app. Não é uma prisão de segurança, mas o código é seu; o objetivo é que um
// engano não derrube nada.
import vm from 'node:vm'

/** Tempo máximo de um trecho de código. */
const TIMEOUT_MS = 2000

/** Copia um valor para fora do contexto (sem protótipos de lá, sem funções). */
function plain(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === 'function') throw new Error('O código devolveu uma função, não um valor.')
  return JSON.parse(JSON.stringify(value) ?? 'null')
}

function compile(code: string): vm.Script {
  const source = code.trim()
  // Primeiro como expressão ("palavras.length > 3"); se não der, como bloco com return.
  try {
    return new vm.Script(`(${source}\n)`, { filename: 'automação.js' })
  } catch {
    try {
      return new vm.Script(`(() => {\n${source}\n})()`, { filename: 'automação.js' })
    } catch (err) {
      throw new Error(`Código com erro de sintaxe: ${(err as Error).message}`)
    }
  }
}

/** Roda o código com as variáveis do fluxo e devolve o resultado. */
export function evaluate(code: string, vars: Record<string, unknown>): unknown {
  const script = compile(code)
  const context = vm.createContext(JSON.parse(JSON.stringify(vars)) as Record<string, unknown>)
  try {
    return plain(script.runInContext(context, { timeout: TIMEOUT_MS }))
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      throw new Error(`O código passou de ${TIMEOUT_MS / 1000} s (laço infinito?).`)
    }
    throw new Error(`Erro no código "${code.trim().slice(0, 80)}": ${e.message ?? String(err)}`)
  }
}

/** Como um valor aparece dentro de um texto. */
export function show(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

/** Troca cada {{expressão}} do texto pelo valor dela. */
export function render(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{([\s\S]+?)\}\}/g, (_match, expr: string) => show(evaluate(expr, vars)))
}

/** Confere (e ajusta) o valor para o tipo declarado da variável. */
export function coerce(value: unknown, type: string, what: string): unknown {
  switch (type) {
    case 'text':
      return show(value)
    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'))
      if (!Number.isFinite(n)) throw new Error(`${what} deveria ser um número, mas veio: ${show(value).slice(0, 120)}`)
      return n
    }
    case 'boolean':
      if (typeof value === 'boolean') return value
      if (/^(true|sim|yes)$/i.test(String(value).trim())) return true
      if (/^(false|não|nao|no)$/i.test(String(value).trim())) return false
      throw new Error(`${what} deveria ser sim/não, mas veio: ${show(value).slice(0, 120)}`)
    case 'list':
      if (!Array.isArray(value)) throw new Error(`${what} deveria ser uma lista, mas veio: ${show(value).slice(0, 120)}`)
      return value
    case 'object':
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${what} deveria ser um objeto, mas veio: ${show(value).slice(0, 120)}`)
      }
      return value
    default:
      return value
  }
}
