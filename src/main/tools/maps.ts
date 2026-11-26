// Ferramentas do conector Google Maps: pesquisa de lugares pela Places API (New).
//
// Os nomes dos campos devolvidos (place_id, rating, rating_count, phone_number,
// reviews) seguem o que as skills já esperam de uma ferramenta `places_search`.
// Cada pesquisa é cobrada pelo Google na conta da chave (há crédito mensal grátis).
import { mapsKey } from './state'

const BASE = 'https://places.googleapis.com/v1'

const PLACE_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'rating',
  'userRatingCount',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'businessStatus',
  'primaryTypeDisplayName'
]

interface PlaceReview {
  rating?: number
  text?: { text?: string; languageCode?: string }
  originalText?: { text?: string; languageCode?: string }
  authorAttribution?: { displayName?: string }
  relativePublishTimeDescription?: string
  publishTime?: string
}

interface Place {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  rating?: number
  userRatingCount?: number
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  googleMapsUri?: string
  businessStatus?: string
  primaryTypeDisplayName?: { text?: string }
  reviews?: PlaceReview[]
  regularOpeningHours?: { weekdayDescriptions?: string[] }
}

/** Formato enxuto para o agente: só o que interessa, com nomes estáveis. */
function simplify(place: Place) {
  return {
    place_id: place.id,
    name: place.displayName?.text ?? null,
    address: place.formattedAddress ?? null,
    category: place.primaryTypeDisplayName?.text ?? null,
    rating: place.rating ?? null,
    rating_count: place.userRatingCount ?? 0,
    // Sem espaços, para dar para conferir o começo (+351 9...) e montar links wa.me.
    phone_number: place.internationalPhoneNumber?.replace(/\s+/g, '') ?? null,
    phone_local: place.nationalPhoneNumber ?? null,
    website: place.websiteUri ?? null,
    maps_url: place.googleMapsUri ?? null,
    business_status: place.businessStatus ?? null,
    ...(place.regularOpeningHours?.weekdayDescriptions
      ? { opening_hours: place.regularOpeningHours.weekdayDescriptions }
      : {}),
    ...(place.reviews
      ? {
          reviews: place.reviews.map((r) => ({
            author: r.authorAttribution?.displayName ?? null,
            rating: r.rating ?? null,
            when: r.relativePublishTimeDescription ?? r.publishTime ?? null,
            language: r.originalText?.languageCode ?? r.text?.languageCode ?? null,
            text: r.originalText?.text ?? r.text?.text ?? ''
          }))
        }
      : {})
  }
}

/** Erros do Google em português, com o que fazer. */
async function failure(response: Response): Promise<Error> {
  let reason = ''
  let message = ''
  try {
    const body = (await response.json()) as {
      error?: { message?: string; status?: string; details?: { reason?: string }[] }
    }
    message = body.error?.message ?? ''
    reason = body.error?.details?.find((d) => d.reason)?.reason ?? body.error?.status ?? ''
  } catch {
    // Resposta sem JSON: fica a mensagem genérica.
  }
  if (reason === 'API_KEY_INVALID' || /api key not valid/i.test(message)) {
    return new Error(
      'A chave do Google Maps não é válida. Confira a chave no conector Google Maps.'
    )
  }
  if (reason === 'SERVICE_DISABLED' || /has not been used|is disabled/i.test(message)) {
    return new Error(
      'A "Places API (New)" não está ativada no projeto do Google Cloud desta chave. Ative em console.cloud.google.com e tente de novo.'
    )
  }
  if (/billing/i.test(message)) {
    return new Error('O projeto do Google Cloud desta chave está sem faturamento ativado.')
  }
  if (response.status === 429) {
    return new Error('O Google limitou as pesquisas por agora. Espere um pouco e tente de novo.')
  }
  return new Error(`O Google Maps recusou a pesquisa (${response.status}): ${message || reason}`)
}

async function key(): Promise<string> {
  const value = await mapsKey()
  if (!value)
    throw new Error('O conector Google Maps está sem chave. Conecte de novo em Conectores.')
  return value
}

export interface SearchInput {
  query: string
  maxResults?: number
  includeReviews?: boolean
  language?: string
  region?: string
}

/** Uma pesquisa de texto ("costureira Braga"), até 60 resultados (3 páginas). */
export async function searchText(input: SearchInput) {
  const apiKey = await key()
  const max = Math.min(Math.max(Math.round(input.maxResults ?? 20), 1), 60)
  const fields = [...PLACE_FIELDS, ...(input.includeReviews === false ? [] : ['reviews'])]
  const mask = [...fields.map((f) => `places.${f}`), 'nextPageToken'].join(',')
  const places: Place[] = []
  let pageToken: string | undefined

  while (places.length < max) {
    const response = await fetch(`${BASE}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': mask
      },
      body: JSON.stringify({
        textQuery: input.query,
        pageSize: Math.min(20, max - places.length),
        languageCode: input.language || 'pt',
        ...(input.region ? { regionCode: input.region } : {}),
        ...(pageToken ? { pageToken } : {})
      }),
      signal: AbortSignal.timeout(30_000)
    })
    if (!response.ok) throw await failure(response)
    const body = (await response.json()) as { places?: Place[]; nextPageToken?: string }
    places.push(...(body.places ?? []))
    pageToken = body.nextPageToken
    if (!pageToken || !body.places?.length) break
  }
  return { query: input.query, count: places.length, places: places.map(simplify) }
}

/** Detalhes de um lugar pelo place_id (inclui avaliações e horário). */
export async function details(placeId: string, language?: string) {
  const apiKey = await key()
  const fields = [...PLACE_FIELDS, 'reviews', 'regularOpeningHours'].join(',')
  const url = `${BASE}/places/${encodeURIComponent(placeId)}?languageCode=${encodeURIComponent(language || 'pt')}`
  const response = await fetch(url, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fields },
    signal: AbortSignal.timeout(30_000)
  })
  if (!response.ok) throw await failure(response)
  return simplify((await response.json()) as Place)
}

/** Teste do conector: uma pesquisa pequena, sem avaliações (a mais barata). */
export async function test(): Promise<string> {
  const result = await searchText({
    query: 'Torre de Belém, Lisboa',
    maxResults: 1,
    includeReviews: false
  })
  const first = result.places[0]
  return first
    ? `A chave funciona: a pesquisa de teste encontrou "${first.name}".`
    : 'A chave funciona, mas a pesquisa de teste não trouxe resultados.'
}
