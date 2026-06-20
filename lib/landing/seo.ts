import { heroData } from '@/lib/landing/schema'
import { groupHoursByDay } from '@/lib/landing/derive'
import type { VerticalKey } from '@/lib/verticals'
import type { Business, Location, TimeBlock } from '@/lib/types'

// ── Lógica pura de SEO/metadata de la landing (Phase 9) ──────────────────────────
// Por qué este módulo: igual que derive.ts/theme.ts, casi todo el trabajo de SEO es
// MAPEO PURO (negocio + config → objetos Metadata/JSON-LD). Extraerlo acá deja las
// superficies RSC de la Wave 2 finas (generateMetadata en layout.tsx, el <script
// ld+json> en page.tsx) y verifica la lógica con `npm test`, no con UAT manual.
// Reglas duras (idénticas a derive.ts): SIN React, SIN Supabase/admin client — solo
// consume tipos públicos (Business/Location/TimeBlock/VerticalKey) y los parsers
// fail-safe de schema.ts. Named exports.
//
// Fail-safe por construcción (SEO-05, D9-06): los helpers NUNCA tiran. El config se
// parsea con `heroData` (lleva `.catch({})`), y cada campo opcional del JSON-LD se
// OMITE si no hay dato (nunca se setea null/undefined en el objeto). Config
// null/inválido/legacy → caen todos los fallbacks, jamás una excepción.

// ── verticalToSchemaType (SEO-03, D9-02) ─────────────────────────────────────────
// Mapea el vertical del negocio al @type de schema.org. Un Record cerrado por los 3
// verticales conocidos + `?? 'LocalBusiness'` cubre cualquier valor fuera del set
// (vertical desconocido/legacy) sin tirar. LocalBusiness es el supertipo seguro.
const SCHEMA_TYPE_BY_VERTICAL: Record<VerticalKey, string> = {
  salud: 'MedicalClinic',
  belleza: 'BeautySalon',
  general: 'LocalBusiness',
}

export function verticalToSchemaType(vertical: VerticalKey): string {
  return SCHEMA_TYPE_BY_VERTICAL[vertical] ?? 'LocalBusiness'
}

// ── buildMetadataParts (SEO-01, D9-03) ───────────────────────────────────────────
// Deriva { title, description } por-negocio. El hero (headline/subhead) sale del
// landing_config; si no hay config/hero o está roto, caen los fallbacks por nombre y
// por vertical. Devuelve siempre strings válidos basados en el nombre del negocio.

// Caps de longitud recomendados para SERP/OG. ~60 para title, ~155-160 para description.
const TITLE_CAP = 60
const DESCRIPTION_CAP = 160

// Recorte por caracteres sin dependencias. Si excede el cap, corta en el último
// espacio antes del límite (para no partir una palabra a la mitad de forma fea) y
// agrega elipsis. Solo agrega elipsis cuando realmente recortó.
function truncate(text: string, cap: number): string {
  if (text.length <= cap) return text
  // Reservamos 1 char para la elipsis '…'.
  const slice = text.slice(0, cap - 1)
  const lastSpace = slice.lastIndexOf(' ')
  // Si hay un espacio razonablemente cerca del final, cortamos ahí; si no (una sola
  // palabra larguísima), cortamos duro. Evita dejar un fragmento minúsculo.
  const base = lastSpace > cap * 0.6 ? slice.slice(0, lastSpace) : slice
  return `${base.trimEnd()}…`
}

// Template-por-vertical para la description cuando el hero no trae subhead. Record
// local (no se importa resolveVertical): la elección de copy por rubro es presentación
// pura de este módulo, no la resolución del vertical en sí. Forward-safe vía el fallback.
const DESCRIPTION_TEMPLATE_BY_VERTICAL: Record<VerticalKey, (name: string) => string> = {
  salud: (name) => `Reservá tu turno online en ${name}.`,
  belleza: (name) => `Reservá tu turno online en ${name}.`,
  general: (name) => `Reservá tu turno online en ${name}.`,
}

// Localiza la sección hero del config y parsea SU data con heroData (.catch({}) →
// nunca tira). Acepta cualquier shape: si no hay sección hero / el config es
// null/inválido/legacy → devuelve {} y todos los fallbacks aplican.
function parseHero(landingConfig: unknown): { headline?: string; subhead?: string } {
  if (!landingConfig || typeof landingConfig !== 'object') return {}
  const sections = (landingConfig as { sections?: unknown }).sections
  if (!Array.isArray(sections)) return {}
  const hero = sections.find(
    (s) => s && typeof s === 'object' && (s as { type?: unknown }).type === 'hero',
  ) as { data?: unknown } | undefined
  // heroData lleva .catch({}): data malformado → {} sin lanzar (mismo patrón que F7).
  return heroData.parse(hero?.data)
}

export function buildMetadataParts({
  business,
  landingConfig,
}: {
  business: { name: string; vertical?: string | null; type?: string | null }
  landingConfig: unknown
}): { title: string; description: string } {
  const name = business.name
  const hero = parseHero(landingConfig)

  // title: con headline → "{name} — {headline}"; sin headline → "{name} — Reservar turno".
  const rawTitle = hero.headline ? `${name} — ${hero.headline}` : `${name} — Reservar turno`
  const title = truncate(rawTitle, TITLE_CAP)

  // description: subhead si hay; si no, template-por-vertical (que siempre incluye el name).
  // El vertical se resuelve barato: si el valor guardado no es una key conocida, cae a 'general'.
  const verticalKey: VerticalKey =
    business.vertical === 'salud' || business.vertical === 'belleza' || business.vertical === 'general'
      ? business.vertical
      : 'general'
  const rawDescription =
    hero.subhead ?? DESCRIPTION_TEMPLATE_BY_VERTICAL[verticalKey](name)
  const description = truncate(rawDescription, DESCRIPTION_CAP)

  return { title, description }
}

// ── buildJsonLd (SEO-03, D9-02) ──────────────────────────────────────────────────
// Devuelve un objeto LocalBusiness TIPADO (o null si no hay name). Por qué objeto y no
// concatenación de strings (T-09-01): serializar con JSON.stringify en la superficie
// (09-02) escapa el contenido y evita inyección; este módulo NO produce el string.
// Cada campo opcional se OMITE si no hay dato — nunca se setea null/undefined.

// Nombres de día de schema.org, indexados por day_of_week de Postgres (0=Sunday … 6=Saturday),
// mismo índice que usa groupHoursByDay (que en derive.ts mapea a etiquetas en español).
const SCHEMA_DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

interface PostalAddress {
  '@type': 'PostalAddress'
  streetAddress: string
}

interface OpeningHoursSpec {
  '@type': 'OpeningHoursSpecification'
  dayOfWeek: string
  opens: string
  closes: string
}

interface JsonLdLocalBusiness {
  '@context': 'https://schema.org'
  '@type': string
  name: string
  url: string
  address?: PostalAddress
  telephone?: string
  openingHoursSpecification?: OpeningHoursSpec[]
}

// business.whatsapp viene normalizado a wa.me (ver lib/whatsapp). schema.org `telephone`
// espera un número, NO una URL → strippeamos el prefijo https://wa.me/ y dejamos el número.
function whatsappToPhone(whatsapp: string | null | undefined): string | undefined {
  if (!whatsapp) return undefined
  const stripped = whatsapp.replace(/^https?:\/\/wa\.me\//, '').trim()
  return stripped || undefined
}

export function buildJsonLd({
  business,
  locations,
  timeBlocks,
  vertical,
  url,
}: {
  business: { name?: string | null; whatsapp?: string | null }
  locations: Location[]
  timeBlocks: TimeBlock[]
  vertical: VerticalKey
  url: string
}): JsonLdLocalBusiness | null {
  const name = business?.name
  // Sin name no emitimos script vacío: devolvemos null y la superficie no renderiza nada.
  if (!name) return null

  const jsonLd: JsonLdLocalBusiness = {
    '@context': 'https://schema.org',
    '@type': verticalToSchemaType(vertical),
    name,
    url,
  }

  // address: primera location con address. Se OMITE el campo si ninguna tiene.
  const locWithAddress = (locations ?? []).find((l) => !!l?.address)
  if (locWithAddress?.address) {
    jsonLd.address = { '@type': 'PostalAddress', streetAddress: locWithAddress.address }
  }

  // telephone: primera location.phone no vacía; fallback a business.whatsapp (sin prefijo
  // wa.me). Se OMITE si no hay ninguno (decisión del orquestador: location.phone con fallback).
  const locPhone = (locations ?? []).find((l) => !!l?.phone)?.phone ?? undefined
  const telephone = locPhone || whatsappToPhone(business?.whatsapp)
  if (telephone) jsonLd.telephone = telephone

  // openingHoursSpecification: derivado de timeBlocks reusando groupHoursByDay (derive.ts),
  // NO se duplica el agrupado. Cada rango "HH:MM–HH:MM" se parte por el guion largo U+2013
  // (mismo separador que produce groupHoursByDay) en opens/closes. Se OMITE el campo entero
  // si no hay timeBlocks (Map vacío → array vacío → no se setea).
  const byDay = groupHoursByDay(timeBlocks ?? [])
  const specs: OpeningHoursSpec[] = []
  for (const [day, ranges] of byDay) {
    const dayName = SCHEMA_DAY_NAMES[day]
    if (!dayName) continue
    for (const range of ranges) {
      const [opens, closes] = range.split('–')
      if (!opens || !closes) continue
      specs.push({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: dayName,
        opens,
        closes,
      })
    }
  }
  if (specs.length > 0) jsonLd.openingHoursSpecification = specs

  return jsonLd
}
