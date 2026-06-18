// ── LandingRenderer (RSC dispatcher) ─────────────────────────────────────────────
// Server Component SIN 'use client': marcarlo client arrastraría todo el árbol de
// secciones al bundle y mataría el beneficio RSC (RESEARCH Anti-Pattern). Un RSC puede
// renderizar <BookingClient/> ('use client') directo, pasándole props serializables
// (Next 16 docs: server-and-client-components).
//
// Compone las 7 secciones fijas + booking por order/enabled. La fuente de orden e
// inyección de booking es orderedSections (derive.ts): filtra enabled=false, ordena por
// order asc y GARANTIZA que booking esté presente aunque el config la omita (D7-05).
// Cada sección decide su PROPIO empty-state (retorna null si está vacía, 07-02/03); el
// renderer no centraliza esa lógica.

import { BookingClient } from '@/app/[slug]/booking-client'
import { orderedSections } from '@/lib/landing/derive'
import { Hero } from '@/components/landing/hero'
import { About } from '@/components/landing/about'
import { Services } from '@/components/landing/services'
import { Gallery } from '@/components/landing/gallery'
import { Location } from '@/components/landing/location'
import { Hours } from '@/components/landing/hours'
import { Cta } from '@/components/landing/cta'
import type { LandingConfig } from '@/lib/landing/schema'
import type { PublicBusiness, Service, Professional, TimeBlock, Location as LocationType } from '@/lib/types'

// Shapes acotados que page.tsx ya fetchea desde vistas públicas (skill RLS regla #4):
// exceptions y locations llegan con SOLO las columnas no sensibles, idénticos a los
// Props congelados de BookingClient. Location/Hours leen únicamente id/name/address de
// `locations`, así que el cast a LocationType[] (abajo) es seguro.
type ExceptionLite = { date: string; closed: boolean; start_time: string | null; end_time: string | null; location_id: string | null }
type LocationLite = { id: string; name: string; address: string | null; phone: string | null }

interface Props {
  config: LandingConfig
  business: PublicBusiness
  services: Service[]
  professionals: Professional[]
  timeBlocks: TimeBlock[]
  exceptions: ExceptionLite[]
  locations: LocationLite[]
}

export function LandingRenderer({ config, business, services, professionals, timeBlocks, exceptions, locations }: Props) {
  // orderedSections: orden + filtro enabled + inyección de booking al final (D7-05).
  const sections = orderedSections(config.sections)

  return (
    <main>
      {sections.map((s, i) => {
        // switch (NO Record map): cada sección recibe props heterogéneas y el switch da
        // type-narrowing limpio sobre s.type. Las secciones del config traen `s.data`
        // (unknown, parseado fail-safe dentro de cada componente); la booking inyectada no.
        switch (s.type) {
          case 'hero':
            // Hero nunca se oculta (D7-09): siempre cae en business.name como fallback.
            return <Hero key={i} data={s.data} business={business} />
          case 'about':
            return <About key={i} data={s.data} />
          case 'services':
            // Lista derivada de la tabla services (D7-06); el data solo aporta título.
            return <Services key={i} data={s.data} services={services} />
          case 'gallery':
            return <Gallery key={i} data={s.data} />
          case 'location':
            // locations llega acotado (id/name/address/phone); Location solo lee esos campos.
            return <Location key={i} data={s.data} locations={locations as unknown as LocationType[]} />
          case 'hours':
            // Hours deriva de time_blocks (NO de business_hours); locations solo para agrupar multi-sede.
            return <Hours key={i} data={s.data} timeBlocks={timeBlocks} locations={locations as unknown as LocationType[]} />
          case 'cta':
            return <Cta key={i} data={s.data} business={business} />
          case 'booking':
            // CAJA NEGRA (Pitfall 2 / Blocker Pitfall 4/8): BookingClient se envuelve SOLO en
            // <section id="reservar">. PROHIBIDO transform/overflow-hidden/position:fixed|sticky/
            // filter/perspective/altura-fija alrededor — cualquiera crea un containing block que
            // rompe el position:fixed de vaul (drawers), sonner (toasts) y react-day-picker
            // (popover del calendario). Props pasados VERBATIM: contrato congelado (SC#2, LAND-02).
            return (
              <section id="reservar" key={i}>
                <BookingClient
                  business={business}
                  services={services}
                  professionals={professionals}
                  timeBlocks={timeBlocks}
                  exceptions={exceptions}
                  locations={locations}
                />
              </section>
            )
          default:
            // forward-compat: un type desconocido nunca rompe el render (cero 500, T-07-14/16).
            return null
        }
      })}
    </main>
  )
}
