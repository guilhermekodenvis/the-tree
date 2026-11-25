// Campo de código das automações (CodeMirror), em dois modos:
// - 'js': JavaScript puro (condições, valores, listas dos loops);
// - 'template': texto livre em que {{expressão}} vira o valor da variável.
// O autocompletar sugere as variáveis que o passo enxerga e, depois de um ponto,
// os métodos do tipo da variável (lista: find, findIndex...; texto: includes...).
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type Completion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  keymap,
  MatchDecorator,
  placeholder as placeholderExt,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { useEffect, useRef } from 'react'
import type { VarInfo, VarType } from '../../../../shared/automation'

interface Props {
  value: string
  onChange(value: string): void
  mode: 'js' | 'template'
  /** Variáveis que este passo enxerga. */
  vars: VarInfo[]
  placeholder?: string
  /** Altura mínima, em linhas. */
  lines?: number
  label: string
}

type Kind = VarType | 'any'

const m = (label: string, detail: string, type = 'method'): Completion => ({ label, detail, type })

const LIST_METHODS: Completion[] = [
  m('length', 'quantidade de itens', 'property'),
  m('find', '(item => condição) primeiro item que passa'),
  m('findIndex', '(item => condição) posição do primeiro que passa'),
  m('filter', '(item => condição) só os que passam'),
  m('map', '(item => novo valor) transforma cada item'),
  m('some', '(item => condição) algum passa?'),
  m('every', '(item => condição) todos passam?'),
  m('includes', '(valor) contém?'),
  m('indexOf', '(valor) posição do valor'),
  m('join', '(separador) junta em texto'),
  m('slice', '(início, fim) pedaço da lista'),
  m('at', '(posição) item; -1 = último'),
  m('reduce', '((total, item) => ..., inicial) acumula'),
  m('sort', '((a, b) => ...) ordena'),
  m('concat', '(outra lista) junta listas'),
  m('flat', '() achata listas de listas')
]

const TEXT_METHODS: Completion[] = [
  m('length', 'quantidade de caracteres', 'property'),
  m('includes', '(trecho) contém?'),
  m('startsWith', '(trecho) começa com?'),
  m('endsWith', '(trecho) termina com?'),
  m('toLowerCase', '() minúsculas'),
  m('toUpperCase', '() maiúsculas'),
  m('trim', '() tira espaços das pontas'),
  m('split', '(separador) quebra em lista'),
  m('replace', '(de, para) troca o primeiro'),
  m('replaceAll', '(de, para) troca todos'),
  m('slice', '(início, fim) pedaço do texto'),
  m('indexOf', '(trecho) posição'),
  m('padStart', '(tamanho, preenchimento) completa à esquerda'),
  m('match', '(/regex/) procura padrão')
]

const NUMBER_METHODS: Completion[] = [
  m('toFixed', '(casas) texto com casas decimais'),
  m('toString', '() vira texto')
]

const GLOBALS: Completion[] = [
  m('JSON.stringify', '(valor) vira texto JSON', 'function'),
  m('JSON.parse', '(texto) lê JSON', 'function'),
  m('Math.round', '(n) arredonda', 'function'),
  m('Math.max', '(a, b, ...) maior', 'function'),
  m('Math.min', '(a, b, ...) menor', 'function'),
  m('Number', '(valor) vira número', 'function'),
  m('String', '(valor) vira texto', 'function'),
  m('Array.isArray', '(valor) é lista?', 'function'),
  m('Object.keys', '(objeto) nomes dos campos', 'function'),
  m('new Date()', 'data e hora atuais', 'function'),
  m('return', 'devolve o valor (em blocos de várias linhas)', 'keyword'),
  m('const', 'cria uma variável local', 'keyword'),
  m('true', 'verdadeiro', 'keyword'),
  m('false', 'falso', 'keyword'),
  m('null', 'vazio', 'keyword')
]

function methodsOf(kind: Kind): Completion[] {
  switch (kind) {
    case 'list':
      return LIST_METHODS
    case 'text':
      return TEXT_METHODS
    case 'number':
      return NUMBER_METHODS
    case 'boolean':
    case 'object':
      return []
    case 'any': {
      // Tipo desconhecido (ex.: item de um loop): oferece os de lista e de texto.
      const seen = new Set<string>()
      return [...LIST_METHODS, ...TEXT_METHODS].filter((c) => !seen.has(c.label) && seen.add(c.label))
    }
  }
}

const TYPE_LABEL: Record<Kind, string> = {
  text: 'texto',
  number: 'número',
  boolean: 'sim/não',
  list: 'lista',
  object: 'objeto',
  any: 'qualquer'
}

function completer(mode: Props['mode'], getVars: () => VarInfo[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    if (mode === 'template') {
      // No texto, só sugere dentro de {{ }}.
      const before = ctx.state.sliceDoc(Math.max(0, ctx.pos - 500), ctx.pos)
      if (before.lastIndexOf('{{') <= before.lastIndexOf('}}')) return null
    }
    const vars = getVars()

    // Depois de um ponto: métodos do tipo da variável.
    const member = ctx.matchBefore(/[A-Za-z_$À-ɏ][\w$À-ɏ]*(?:\.[\w$À-ɏ]+)*\.[\w$]*$/)
    if (member) {
      const parts = member.text.split('.')
      const prefix = parts[parts.length - 1]
      const base = vars.find((v) => v.name === parts[0])
      // Um nível (palavras.) usa o tipo da variável; mais fundo, o tipo é desconhecido.
      const kind: Kind = base && parts.length === 2 ? base.type : 'any'
      const options = methodsOf(kind)
      if (options.length === 0) return null
      return { from: ctx.pos - prefix.length, options, validFor: /^[\w$]*$/ }
    }

    const word = ctx.matchBefore(/[A-Za-z_$À-ɏ][\w$À-ɏ]*$/)
    if (!word && !ctx.explicit) return null
    const options: Completion[] = [
      ...vars.map((v) => ({
        label: v.name,
        detail: TYPE_LABEL[v.type],
        info: v.detail,
        type: 'variable',
        boost: 10
      })),
      ...(mode === 'js' ? GLOBALS : GLOBALS.filter((g) => g.type === 'function'))
    ]
    return { from: word ? word.from : ctx.pos, options, validFor: /^[\w$À-ɏ]*$/ }
  }
}

/** Cores pelo design system (tokens), não pelas cores padrão do CodeMirror. */
const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: 'var(--color-accent)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--color-agent-codex)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--color-agent-claude)' },
  { tag: tags.comment, color: 'var(--color-text-tertiary)', fontStyle: 'italic' },
  { tag: [tags.propertyName, tags.function(tags.variableName)], color: 'var(--color-agent-gemini)' }
])

/** Destaca {{expressões}} nos textos. */
const templateMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    private decorator = new MatchDecorator({
      regexp: /\{\{[\s\S]*?\}\}/g,
      decoration: Decoration.mark({ class: 'cm-template-var' })
    })
    constructor(view: EditorView) {
      this.decorations = this.decorator.createDeco(view)
    }
    update(update: ViewUpdate): void {
      this.decorations = this.decorator.updateDeco(update, this.decorations)
    }
  },
  { decorations: (v) => v.decorations }
)

export function CodeField({ value, onChange, mode, vars, placeholder, lines = 3, label }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // As funções do editor leem sempre o valor mais novo destas referências.
  const varsRef = useRef(vars)
  varsRef.current = vars
  const changeRef = useRef(onChange)
  changeRef.current = onChange

  useEffect(() => {
    if (!host.current) return
    const extensions: Extension[] = [
      history(),
      closeBrackets(),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap]),
      autocompletion({ override: [completer(mode, () => varsRef.current)], activateOnTyping: true }),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) changeRef.current(update.state.doc.toString())
      }),
      EditorView.contentAttributes.of({ 'aria-label': label }),
      EditorView.theme({ '.cm-content': { minHeight: `calc(${lines} * var(--leading-code))` } })
    ]
    if (placeholder) extensions.push(placeholderExt(placeholder))
    if (mode === 'js') extensions.push(javascript(), syntaxHighlighting(highlight))
    else extensions.push(templateMarks)

    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({ doc: value, extensions })
    })
    return () => {
      view.current?.destroy()
      view.current = null
    }
    // O editor é criado uma vez por campo; o valor externo é sincronizado abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Valor trocado de fora (ex.: outro passo escolhido): atualiza sem perder o editor.
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  return <div className={`code-field code-field--${mode}`} ref={host} />
}
