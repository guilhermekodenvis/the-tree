// Servidor de ferramentas do The Tree, no protocolo MCP (o padrão que o Claude
// Code e o Codex usam para ferramentas de fora).
//
// Roda dentro do app, só em 127.0.0.1, num endereço com um código aleatório que
// muda a cada abertura. Cada agente recebe o endereço ao iniciar (claude.ts e
// codex.ts) e passa a ver as ferramentas dos conectores ligados: Google Maps e
// Navegador. A lista é montada a cada pedido, então ligar ou desligar um conector
// vale para as conversas que começarem depois.
//
// Implementa só o necessário do MCP por HTTP (initialize, tools/list, tools/call),
// respondendo em JSON, sem sessão.
import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ToolConnectorId } from '../../shared/types'
import * as browser from './browser'
import * as maps from './maps'
import { isConnected, TOOL_CONNECTORS } from './state'

/** Nome do servidor visto pelos agentes (as ferramentas viram mcp__the-tree__...). */
export const TOOL_SERVER_NAME = 'the-tree'

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }

interface ToolDef {
  connector: ToolConnectorId
  name: string
  description: string
  inputSchema: Record<string, unknown>
  run(args: Record<string, unknown>): Promise<Content[]>
}

const json = (value: unknown): Content[] => [{ type: 'text', text: JSON.stringify(value, null, 1) }]
const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const TOOLS: ToolDef[] = [
  {
    connector: 'maps',
    name: 'places_search',
    description:
      'Pesquisa negócios e lugares no Google Maps (Places API). Aceita várias consultas de uma vez ' +
      '(ex.: "costureira Braga"). Para cada lugar devolve place_id, name, address, category, rating, ' +
      'rating_count, phone_number (formato internacional sem espaços, ex.: +351912345678), website, ' +
      'maps_url, business_status e até 5 avaliações (reviews) com autor, nota, idioma e texto. ' +
      'Cada consulta é cobrada pelo Google; não repita consultas iguais.',
    inputSchema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 10,
          description: 'Consultas de texto, até 10 (ex.: ["mudanças Porto", "estofador Braga"]).'
        },
        max_results_per_query: {
          type: 'integer',
          minimum: 1,
          maximum: 60,
          description: 'Resultados por consulta (padrão 20, máximo 60).'
        },
        include_reviews: {
          type: 'boolean',
          description: 'Trazer as avaliações (padrão: sim). Sem elas a pesquisa custa menos.'
        },
        language: { type: 'string', description: 'Idioma dos resultados (padrão "pt").' },
        region: { type: 'string', description: 'Código do país, ex.: "PT" ou "BR".' }
      },
      required: ['queries']
    },
    async run(args) {
      const raw = Array.isArray(args.queries) ? args.queries : [args.query]
      const queries = raw
        .map(str)
        .filter((q): q is string => !!q)
        .slice(0, 10)
      if (queries.length === 0) throw new Error('Informe ao menos uma consulta em "queries".')
      const results = await Promise.allSettled(
        queries.map((query) =>
          maps.searchText({
            query,
            maxResults:
              typeof args.max_results_per_query === 'number' ? args.max_results_per_query : 20,
            includeReviews: args.include_reviews !== false,
            language: str(args.language),
            region: str(args.region)
          })
        )
      )
      // Se todas falharam pelo mesmo motivo (chave, faturamento), vira erro do pedido.
      if (results.every((r) => r.status === 'rejected')) {
        throw (results[0] as PromiseRejectedResult).reason
      }
      return json(
        results.map((r, i) =>
          r.status === 'fulfilled'
            ? r.value
            : { query: queries[i], error: (r.reason as Error).message ?? String(r.reason) }
        )
      )
    }
  },
  {
    connector: 'maps',
    name: 'place_details',
    description:
      'Detalhes de um lugar do Google Maps pelo place_id: os mesmos campos de places_search, ' +
      'mais horário de funcionamento e as avaliações.',
    inputSchema: {
      type: 'object',
      properties: {
        place_id: { type: 'string', description: 'O place_id devolvido por places_search.' },
        language: { type: 'string', description: 'Idioma (padrão "pt").' }
      },
      required: ['place_id']
    },
    async run(args) {
      const id = str(args.place_id)
      if (!id) throw new Error('Informe o place_id.')
      return json(await maps.details(id, str(args.language)))
    }
  },
  {
    connector: 'browser',
    name: 'browser_open',
    description:
      'Abre um site num navegador de verdade (Chromium, sem login nenhum), espera carregar e ' +
      'devolve: final_url, http_status, title, description, o texto visível (text), os links, os ' +
      'links de WhatsApp e, em "chat", os sinais de chat de atendimento encontrados: fornecedores ' +
      'conhecidos de chat ao vivo ou com IA (ai_or_live_chat_vendors: tidio, intercom, ' +
      'gohighlevel, chatbase...), variáveis globais desses widgets, elementos e scripts com "chat" ' +
      'ou "bot" no nome. Se o site não abrir, devolve "error" (ex.: domínio inexistente, site fora ' +
      'do ar). Opcional: "script", corpo de uma função async rodada na página depois de carregar; ' +
      'o valor do `return` volta em script_result.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Endereço do site (com ou sem https://).' },
        wait: {
          type: 'number',
          minimum: 0,
          maximum: 20,
          description:
            'Segundos de espera depois de carregar, para widgets que chegam depois (padrão 4).'
        },
        script: {
          type: 'string',
          description:
            'JavaScript opcional: corpo de uma função async (pode usar await). Use return para devolver um valor que vire JSON.'
        }
      },
      required: ['url']
    },
    async run(args) {
      const url = str(args.url)
      if (!url) throw new Error('Informe o endereço em "url".')
      return json(
        await browser.openPage({
          url,
          wait: typeof args.wait === 'number' ? args.wait : undefined,
          script: typeof args.script === 'string' ? args.script : undefined
        })
      )
    }
  },
  {
    connector: 'browser',
    name: 'browser_screenshot',
    description:
      'Abre um site e devolve um print (imagem) da página, para você ver como ele aparece. ' +
      'Use full_page para a página inteira (até 6000 px de altura).',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Endereço do site.' },
        wait: { type: 'number', minimum: 0, maximum: 20, description: 'Espera extra em segundos.' },
        full_page: { type: 'boolean', description: 'Página inteira em vez da parte visível.' }
      },
      required: ['url']
    },
    async run(args) {
      const url = str(args.url)
      if (!url) throw new Error('Informe o endereço em "url".')
      const shot = await browser.screenshot({
        url,
        wait: typeof args.wait === 'number' ? args.wait : undefined,
        fullPage: args.full_page === true
      })
      if (!shot.image) throw new Error(shot.error ?? 'Não foi possível tirar o print.')
      return [
        { type: 'image', data: shot.image, mimeType: 'image/jpeg' },
        { type: 'text', text: JSON.stringify({ title: shot.title, final_url: shot.final_url }) }
      ]
    }
  }
]

async function activeTools(): Promise<ToolDef[]> {
  const on = new Set<ToolConnectorId>()
  for (const id of TOOL_CONNECTORS) if (await isConnected(id)) on.add(id)
  return TOOLS.filter((tool) => on.has(tool.connector))
}

interface RpcMessage {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

const INSTRUCTIONS =
  'Ferramentas dos conectores ligados no The Tree: Google Maps (places_search, place_details) ' +
  'e Navegador (browser_open, browser_screenshot). Se uma ferramenta pedida por uma skill não ' +
  'estiver na lista, o conector dela está desligado: avise em vez de inventar dados.'

async function handle(message: RpcMessage): Promise<unknown | null> {
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: message.id ?? null, result })
  const fail = (code: number, text: string) => ({
    jsonrpc: '2.0',
    id: message.id ?? null,
    error: { code, message: text }
  })
  // Avisos (sem id) não têm resposta.
  if (message.id === undefined || message.id === null) return null

  switch (message.method) {
    case 'initialize':
      return reply({
        protocolVersion:
          typeof message.params?.protocolVersion === 'string'
            ? message.params.protocolVersion
            : '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: TOOL_SERVER_NAME, title: 'The Tree', version: app.getVersion() },
        instructions: INSTRUCTIONS
      })
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({
        tools: (await activeTools()).map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema
        }))
      })
    case 'tools/call': {
      const name = String(message.params?.name ?? '')
      const tool = (await activeTools()).find((t) => t.name === name)
      if (!tool) {
        return reply({
          content: [
            {
              type: 'text',
              text: `A ferramenta ${name} não está disponível: o conector dela está desligado no The Tree.`
            }
          ],
          isError: true
        })
      }
      try {
        const args = (message.params?.arguments ?? {}) as Record<string, unknown>
        return reply({ content: await tool.run(args) })
      } catch (err) {
        return reply({
          content: [{ type: 'text', text: (err as Error).message ?? String(err) }],
          isError: true
        })
      }
    }
    default:
      return fail(-32601, `Método não suportado: ${message.method}`)
  }
}

let server: Server | null = null
let base: string | null = null
let starting: Promise<string> | null = null

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 1_000_000) {
        reject(new Error('Pedido grande demais.'))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function start(): Promise<string> {
  if (base) return Promise.resolve(base)
  if (starting) return starting
  const token = randomBytes(24).toString('hex')
  const path = `/mcp/${token}`

  starting = new Promise<string>((resolve, reject) => {
    const srv = createServer((req, res) => void serve(req, res))
    let port = 0

    async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
      // Só agentes deste computador: nada de páginas da web (Origin) nem outro
      // endereço (proteção contra DNS rebinding), e só com o código do caminho.
      if (req.url !== path || req.headers.origin || req.headers.host !== `127.0.0.1:${port}`) {
        res.writeHead(404).end()
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' }).end()
        return
      }
      try {
        const parsed = JSON.parse(await readBody(req)) as RpcMessage | RpcMessage[]
        const batch = Array.isArray(parsed)
        const replies = (await Promise.all((batch ? parsed : [parsed]).map(handle))).filter(
          (r) => r !== null
        )
        if (replies.length === 0) {
          res.writeHead(202).end()
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(batch ? replies : replies[0]))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: (err as Error).message }
          })
        )
      }
    }

    srv.on('error', (err) => {
      starting = null
      reject(err)
    })
    srv.listen(0, '127.0.0.1', () => {
      port = (srv.address() as AddressInfo).port
      server = srv
      base = `http://127.0.0.1:${port}${path}`
      resolve(base)
    })
  })
  return starting
}

/**
 * Endereço do servidor para passar a um agente que está iniciando, ou null se
 * nenhum conector de ferramenta estiver ligado (aí o agente nem fica sabendo).
 */
export async function toolServerUrl(): Promise<string | null> {
  if ((await activeTools()).length === 0) return null
  return start()
}

export function stopToolServer(): void {
  server?.close()
  server = null
  base = null
  starting = null
}
