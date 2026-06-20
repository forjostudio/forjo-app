import { ExternalLink } from 'lucide-react'
import { locationData } from '@/lib/landing/schema'
import { shouldHideLocation } from '@/lib/landing/derive'
import { Kicker, GhostIndex } from '@/components/landing/_premium'
import type { Location as LocationType } from '@/lib/types'

// ── Sección Location (RSC) ──────────────────────────────────────────────────────────
// Itera locations[] (D7-06), pasadas por props desde page.tsx (vistas acotadas — skill RLS).
// map_url y show_address vienen del CONFIG, no de PublicBusiness (Assumption A2). locationData
// (07-01) lleva `.catch({})` → fail-safe. El mapa se ENLAZA (<a target=_blank rel=noopener>),
// NO se embebe en iframe (CLS/coste de terceros). React escapa el contenido y no ejecuta
// javascript: desde un href estatico (T-081-05).
// Empty-state (D7-08): sin map_url y sin address-visible → la sección se oculta (return null).
//
// Restyle F8.1 (D81-05, mock 05-screen.png + `.frj-loc`/`.frj-map`/`.frj-info-row`): layout
// editorial 2-col (info-rows | mapa). Direcciones como INFO-ROWS (label mono uppercase + value).
// MAPA DE FALLBACK PREMIUM: en vez de un bloque vacío, un campo decorativo (gradiente sutil de
// --primary sobre --frj-surface + grid-lines hairline --frj-hair + pin de acento --primary),
// con aspect-ratio reservado (CLS-safe) y aria-hidden en lo decorativo. Si hay map_url, el enlace
// "Ver en el mapa" se superpone. Cero hex: solo tokens.
//
// Polish F8.1 (fidelidad mock): heading editorial "Cerca tuyo." (kicker "Dónde estamos") — no
// repite la palabra entre kicker y heading. Cuando va combinada con Hours en 2-col (mock 04),
// el renderer la rinde en variant="column": SOLO el bloque interno, SIN su propia <section> ni
// número fantasma (eso lo aporta el wrapper combinado). Sola → variant="full" (como hoy).

// Predicado público para que el renderer decida combinar location+hours sin duplicar lógica.
export function isLocationVisible(data: unknown, locations: LocationType[]): boolean {
  return !shouldHideLocation(locationData.parse(data ?? {}), locations)
}

// Bloque interno (head + 2-col info/mapa). Sin <section> ni padding de sección: reutilizable
// tanto en full-width como dentro del wrapper combinado.
function LocationInner({
  data,
  locations,
}: {
  data: unknown
  locations: LocationType[]
}) {
  const d = locationData.parse(data ?? {})
  // Dirección visible solo si el config lo habilita (show_address) y la sede tiene address.
  const showAddress = !!d.show_address
  const visibleLocations = showAddress ? locations.filter((l) => !!l.address) : []
  const multi = visibleLocations.length > 1

  return (
    <>
      {/* Heading editorial "Cerca tuyo." con kicker "Dónde estamos" (mock): sin repetir palabra. */}
      <div className="mb-[clamp(24px,4cqw,48px)] flex flex-col gap-[0.9em]">
        <Kicker>Dónde estamos</Kicker>
        <h2 className="frj-display text-[clamp(26px,5cqw,60px)]">
          {d.title ?? 'Cerca tuyo.'}
        </h2>
      </div>

      {/* 2-col editorial (mock `.frj-loc` 1.1fr/0.9fr): info-rows | mapa. Stack en mobile. */}
      <div className="grid grid-cols-1 items-start gap-[clamp(24px,4cqw,48px)] md:grid-cols-[1.1fr_0.9fr] md:gap-[clamp(40px,6cqw,80px)]">
        {/* Columna de info-rows (label mono uppercase + value), separadas por hairline. */}
        <div>
          {visibleLocations.map((loc) => (
            <div
              key={loc.id}
              className="flex gap-[14px] border-b border-[color:var(--frj-hair)] py-[clamp(14px,2cqw,20px)] first:border-t"
            >
              <span className="min-w-[88px] flex-shrink-0 pt-[2px] font-[family-name:var(--frj-font-mono)] text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {multi ? loc.name : 'Dirección'}
              </span>
              <span className="text-[clamp(14px,1.7cqw,18px)] leading-[1.45]">
                {loc.address}
              </span>
            </div>
          ))}
        </div>

        {/* MAPA DE FALLBACK PREMIUM (D81-05): campo decorativo con gradiente + grid-lines + pin.
            aspect 16/11 reservado (CLS-safe). Decorativo → aria-hidden. Si hay map_url, enlace
            seguro superpuesto. NUNCA un bloque vacío. */}
        <div className="relative aspect-[16/11] w-full overflow-hidden rounded-[2px] border border-border bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_10%,var(--frj-surface))_0%,var(--frj-surface)_60%)]">
          {/* Grid-lines hairline (espejo de `.frj-map .grid-lines` del mock). */}
          <div
            className="absolute inset-0 bg-[linear-gradient(var(--frj-hair)_1px,transparent_1px),linear-gradient(90deg,var(--frj-hair)_1px,transparent_1px)] bg-[length:36px_36px]"
            aria-hidden="true"
          />
          {/* Pin de acento (gota --primary con halo). Decorativo. */}
          <div
            className="absolute left-1/2 top-[46%] h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rotate-[-45deg] rounded-[50%_50%_50%_0] bg-primary shadow-[0_0_0_6px_color-mix(in_oklab,var(--primary)_22%,transparent)]"
            aria-hidden="true"
          />
          {/* Enlace seguro al mapa real (solo si hay map_url). Sobre el campo, touch >=44px. */}
          {d.map_url && (
            <a
              href={d.map_url}
              target="_blank"
              rel="noopener"
              className="absolute bottom-3 right-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-[color:var(--frj-surface)] px-5 text-sm font-semibold transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Ver en el mapa
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </>
  )
}

// Export del bloque interno para el wrapper combinado (renderer).
export { LocationInner }

export function Location({
  data,
  locations,
  index,
}: {
  data: unknown
  locations: LocationType[]
  index?: number | string
}) {
  const d = locationData.parse(data ?? {})
  // shouldHideLocation(data, locations): oculta si no hay map_url NI address visible.
  if (shouldHideLocation(d, locations)) return null

  // Full-width (sola): su propia <section> + número fantasma secuencial (del renderer).
  return (
    <section className="relative px-[clamp(20px,5cqw,64px)] py-[clamp(56px,11cqw,150px)]">
      {index != null && <GhostIndex n={index} />}
      <LocationInner data={data} locations={locations} />
    </section>
  )
}
