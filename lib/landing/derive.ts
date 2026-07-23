import type { LandingConfig } from '@/lib/landing/schema'
import type { Service, TimeBlock, Location } from '@/lib/types'

// ── Lógica pura de decisión de la landing (Phase 7) ──────────────────────────────
// Por qué este módulo: las secciones RSC no son unit-testeables fácil (no hay React
// Testing Library en el repo; environment 'node'). La estrategia Nyquist es EXTRAER la
// lógica de decisión (orden de secciones, agrupado de Hours, predicados de empty-state)
// a funciones PURAS y testear esas; el render visual va por UAT manual.
// Reglas duras: SIN React, SIN Supabase, SIN admin client (Information Disclosure) — solo
// consume tipos públicos (Service/TimeBlock/Location/LandingConfig). Named exports, igual
// que lib/plan-limits.ts.

// La booking inyectada no trae `data`; se marca con order:Infinity para quedar al final.
type Section = LandingConfig['sections'][number]
type RenderableSection = Section | { type: 'booking'; enabled: true; order: number }

// ── orderedSections (LAND-01, D7-05) ─────────────────────────────────────────────
// Filtra enabled=false (D7-07), ordena por order asc, y GARANTIZA booking presente:
// si no quedó ninguna booking habilitada, la inyecta al final (order:Infinity). Booking
// es core y nunca se omite — aunque el config la traiga deshabilitada o no la traiga.
export function orderedSections(sections: LandingConfig['sections']): RenderableSection[] {
  const ordered = [...sections]
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order)
  const hasBooking = ordered.some((s) => s.type === 'booking')
  return hasBooking
    ? ordered
    : [...ordered, { type: 'booking' as const, enabled: true, order: Infinity }]
}

// ── Hours: agrupado de time_blocks por día (LAND-04, D7-06) ───────────────────────
// Deriva de `time_blocks` (NO de business_hours: esa tabla no se lee en ningún path
// público y puede estar vacía/desincronizada; time_blocks es la fuente real y ya está
// fetcheada en page.tsx). Formato "HH:MM–HH:MM" usando el guion largo U+2013.
// Múltiples bloques del mismo día se acumulan en el orden recibido.

// Etiquetas indexadas por day_of_week (0=Domingo … 6=Sábado), como devuelve Postgres.
export const DIAS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const

// Orden de render: arranca el lunes y deja el domingo al final (convención AR).
export const HOURS_RENDER_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

export function groupHoursByDay(timeBlocks: TimeBlock[]): Map<number, string[]> {
  const byDay = new Map<number, string[]>()
  for (const b of timeBlocks) {
    // "HH:MM" desde "HH:MM:SS" → slice(0,5). Guion largo U+2013 entre inicio y fin.
    const range = `${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}`
    byDay.set(b.day_of_week, [...(byDay.get(b.day_of_week) ?? []), range])
  }
  return byDay
}

// ── Predicados de empty-state (LAND-05, D7-08) ────────────────────────────────────
// Devuelven true si la sección debe OCULTARSE (return null en el componente). Hero y
// Booking NO tienen predicado: nunca se ocultan (D7-09).

// About: se oculta si no hay cuerpo ni imagen.
export function shouldHideAbout(data: { body?: string; image?: string }): boolean {
  return !data.body && !data.image
}

// Services: deriva de la tabla services (D7-06); se oculta si no hay servicios activos.
export function shouldHideServices(services: Service[]): boolean {
  return services.length === 0
}

// Gallery: se oculta si no hay imágenes.
export function shouldHideGallery(data: { images?: string[] }): boolean {
  return !data.images?.length
}

// Hours: deriva de time_blocks; se oculta si no hay ninguno.
export function shouldHideHours(timeBlocks: TimeBlock[]): boolean {
  return timeBlocks.length === 0
}

// Location: se oculta si NINGUNA sede aporta contenido visible. Cuenta como contenido:
// un map_url del config, o al menos una location con dirección Y show_address activo.
export function shouldHideLocation(
  data: { map_url?: string; show_address?: boolean },
  locations: Location[],
  // Fallback a la dirección del negocio (single-location: la dirección vive en businesses.address,
  // no en una fila de locations). Mismo patrón que la página de confirmación de turno.
  businessAddress?: string | null,
): boolean {
  if (data.map_url) return false
  const hasVisibleAddress =
    !!data.show_address && (locations.some((l) => !!l.address) || !!businessAddress?.trim())
  return !hasVisibleAddress
}

// CTA: se oculta si no hay headline propio ni WhatsApp del negocio (sin nada que mostrar).
export function shouldHideCta(
  data: { headline?: string },
  business: { whatsapp?: string | null },
): boolean {
  return !data.headline && !business.whatsapp
}
