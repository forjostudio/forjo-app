import { MapPin, ExternalLink } from 'lucide-react'
import { locationData } from '@/lib/landing/schema'
import { shouldHideLocation } from '@/lib/landing/derive'
import type { Location as LocationType } from '@/lib/types'

// ── Sección Location (RSC) ──────────────────────────────────────────────────────────
// Itera locations[] (D7-06), pasadas por props desde page.tsx (vistas acotadas — skill RLS).
// map_url y show_address vienen del CONFIG, no de PublicBusiness (Assumption A2: el select de
// public_businesses no trae maps_url). locationData (07-01) lleva `.catch({})` → fail-safe.
// El mapa se enlaza (<a target=_blank rel=noopener>), NO se embebe en iframe, para evitar
// el CLS/coste de terceros (UI-SPEC). React escapa el contenido y no ejecuta javascript:
// desde un href estatico (T-07-05/T-07-07).
// Empty-state (D7-08): sin map_url y sin address-visible → la sección se oculta (return null).

export function Location({
  data,
  locations,
}: {
  data: unknown
  locations: LocationType[]
}) {
  const d = locationData.parse(data ?? {})
  // shouldHideLocation(data, locations): oculta si no hay map_url NI address visible.
  if (shouldHideLocation(d, locations)) return null

  return (
    <section className="px-4 py-12 md:px-6 md:py-16">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight md:text-3xl">
          {d.title ?? 'Dónde estamos'}
        </h2>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {locations.map((loc) => {
            // Dirección visible solo si el config lo habilita (show_address).
            const showAddress = !!d.show_address && !!loc.address
            // Si esta sede no aporta nada visible, no renderizamos su bloque.
            if (!showAddress) return null
            return (
              <div
                key={loc.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                {locations.length > 1 && (
                  <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold">
                    {loc.name}
                  </h3>
                )}
                <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{loc.address}</span>
                </p>
              </div>
            )
          })}
        </div>

        {d.map_url && (
          <a
            href={d.map_url}
            target="_blank"
            rel="noopener"
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-6 text-sm font-semibold transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Ver en el mapa
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </section>
  )
}
