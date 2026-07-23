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
//
// Polish F8.1 (fidelidad mock 04/05):
//  1) Numeración SECUENCIAL de los números fantasma derivada del orden real (no hardcode):
//     about/services/gallery/location+hours numeran 01,02,03,04… SIN saltos. Hero, booking y
//     cta NO llevan número (igual que el mock). El número se calcula sólo para las secciones
//     numeradas VISIBLES (las que se ocultan no consumen un número → cero gaps).
//  2) location + hours se COMBINAN en UNA sección 2-col (mock `.frj-loc`) con UN solo número
//     fantasma cuando AMBAS están visibles. Si sólo una está visible, va full-width como hoy.

import type { CSSProperties, ReactNode } from 'react'
import { BookingClient } from '@/app/[slug]/booking-client'
import {
  orderedSections,
  shouldHideAbout,
  shouldHideServices,
  shouldHideGallery,
} from '@/lib/landing/derive'
import { Hero } from '@/components/landing/hero'
import { About } from '@/components/landing/about'
import { Services } from '@/components/landing/services'
import { Gallery } from '@/components/landing/gallery'
import { RsvStrip } from '@/components/landing/rsv-strip'
import { Location, LocationInner, isLocationVisible } from '@/components/landing/location'
import { Hours, HoursInner, isHoursVisible } from '@/components/landing/hours'
import { GhostIndex } from '@/components/landing/_premium'
import { Cta } from '@/components/landing/cta'
import { LandingMotion } from '@/components/landing/landing-motion'
import { PhotoLightbox } from '@/components/landing/photo-lightbox'
import { WhatsappFloat } from '@/components/landing/whatsapp-float'
import { aboutData, galleryData } from '@/lib/landing/schema'
import { normalizeMotion, resolveLandingTheme } from '@/lib/landing/theme'
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
  // Booking ya resuelto por vertical en page.tsx (D-05): si viene, reemplaza al BookingClient
  // por defecto dentro de la caja negra <section id="reservar"> (p.ej. CanchasBookingClient para
  // el vertical canchas). Así el renderer NO conoce el modelo canchas ni agrega queries: es un
  // slot ReactNode opaco. Si es undefined, cae en el BookingClient de siempre (otros verticales).
  bookingSlot?: ReactNode
}

// Tipos numerados (los que llevan número fantasma en el mock). hero/booking/cta NO numeran.
// location+hours combinadas cuentan como UNA unidad numerada.
type RenderableSection = ReturnType<typeof orderedSections>[number]

// Wrapper de reveal para las secciones editoriales que renderizan su <section> internamente pero
// cuyo componente NO recibió la clase (services/location/hours/cta). RSC puro: un <div
// class="frj-reveal"> hijo de .frj-site. NUNCA envuelve la sección booking (esa rama del switch no
// pasa por acá). El controlador <LandingMotion/> le agrega .shown al entrar en viewport.
//
// ⚠ DEBE vivir en el SCOPE DEL MÓDULO, no adentro de LandingRenderer. Definido adentro, cada
// render creaba un componente con IDENTIDAD NUEVA → React desmontaba y REMONTABA esos 4 subárboles
// en cada render → los nodos nuevos nacían sin la clase `.shown` (que el controlador agrega
// IMPERATIVAMENTE, fuera del conocimiento de React) y, como el IntersectionObserver es one-shot y
// ya los había dejado de observar, quedaban en opacity:0 PARA SIEMPRE. En la web pública no se
// notaba (el renderer es RSC y corre una sola vez), pero en el preview del CMS —que re-renderiza
// con cada tecla— servicios/ubicación/horarios/CTA desaparecían apenas tocabas algo.
const Reveal = ({ children }: { children: ReactNode }) => (
  <div className="frj-reveal">{children}</div>
)

export function LandingRenderer({ config, business, services, professionals, timeBlocks, exceptions, locations, bookingSlot }: Props) {
  // orderedSections: orden + filtro enabled + inyección de booking al final (D7-05).
  const sections = orderedSections(config.sections)

  // Nivel de motion resuelto (F12, MOTION-01). normalizeMotion degrada defensivamente:
  // ausente/inválido/'none' → 'none' (estático, byte-idéntico a hoy — D-04). El valor se
  // emite como data-motion en <main class="frj-site"> (abajo) y se pasa como prop al
  // controlador <LandingMotion/>. Las CLASES .frj-reveal / .frj-zoom / .lift se aplican SOLO a
  // las editoriales; el case 'booking' NUNCA las recibe (caja negra, MOTION-04 / T-OA7-01).
  const motionLevel = normalizeMotion(config.motion)

  // Tema resuelto del landing (preset/overrides del config, con fallback a los valores del negocio
  // para un config recién sembrado). Se emite como data-* en el <main> de abajo.
  const t = resolveLandingTheme(config.theme, {
    theme: business.theme,
    palette: business.palette,
    font: business.font,
  })


  // Lookup del `data` por tipo (para evaluar visibilidad de los empty-states sin re-iterar).
  const dataOf = (type: string): unknown => {
    const found = sections.find((s) => s.type === type)
    return found && 'data' in found ? found.data : undefined
  }

  // Visibilidad de location/hours para decidir el combinado (predicados puros, sin React/Supabase).
  const locVisible =
    sections.some((s) => s.type === 'location') &&
    isLocationVisible(dataOf('location'), locations as unknown as LocationType[], business.address)
  const hrsVisible =
    sections.some((s) => s.type === 'hours') && isHoursVisible(timeBlocks)
  const combine = locVisible && hrsVisible

  // ── Numeración secuencial (sin saltos) ───────────────────────────────────────────
  // Un contador que sólo avanza por unidad numerada VISIBLE, en el orden real de render.
  // location+hours (combinadas o no) comparten/consumen la numeración como en el mock.
  let counter = 0
  // Para combinar: el número de la unidad location+hours se asigna a la PRIMERA de las dos
  // que aparece en el orden; la segunda se saltea (no renderiza nada).
  const firstOfPair: 'location' | 'hours' | null = combine
    ? (sections.find((s) => s.type === 'location' || s.type === 'hours')?.type as
        | 'location'
        | 'hours'
        | undefined) ?? null
    : null

  // Calcula el número de una sección numerada VISIBLE (o undefined si no debe llevar número).
  function nextIndexFor(s: RenderableSection): number | undefined {
    switch (s.type) {
      case 'about':
        if (shouldHideAbout(aboutData.parse(('data' in s ? s.data : undefined) ?? {}))) return undefined
        return ++counter
      case 'services':
        if (shouldHideServices(services)) return undefined
        return ++counter
      case 'gallery':
        if (shouldHideGallery(galleryData.parse(('data' in s ? s.data : undefined) ?? {}))) return undefined
        return ++counter
      case 'location':
        if (combine) return s.type === firstOfPair ? ++counter : undefined
        return locVisible ? ++counter : undefined
      case 'hours':
        if (combine) return s.type === firstOfPair ? ++counter : undefined
        return hrsVisible ? ++counter : undefined
      default:
        return undefined // hero, cta, booking: sin número
    }
  }

  // Sección combinada location+hours (mock `.frj-loc`): UNA <section>, UN número fantasma,
  // grid 2-col (info/mapa | horarios), stack en mobile. CERO impacto sobre booking.
  function CombinedLocationHours({ index }: { index: number | undefined }) {
    return (
      // frj-reveal: editorial → reveal de entrada (subtle/premium). Sin parallax (no hay foto).
      <section className="frj-reveal relative px-[clamp(20px,5cqw,64px)] py-[clamp(56px,11cqw,150px)]">
        {index != null && <GhostIndex n={index} />}
        <div className="grid grid-cols-1 items-start gap-[clamp(40px,7cqw,80px)] md:grid-cols-2">
          <div>
            <LocationInner data={dataOf('location')} locations={locations as unknown as LocationType[]} businessAddress={business.address} />
          </div>
          <div>
            <HoursInner
              data={dataOf('hours')}
              timeBlocks={timeBlocks}
              locations={locations as unknown as LocationType[]}
            />
          </div>
        </div>
      </section>
    )
  }

  // .frj-site: scope de los tokens premium de F8.1-01 (--frj-*, fuente mono, container
  // query). REGLA DURA D81-01: esta clase NO declara transform/overflow/filter/position
  // fixed|sticky en globals.css — solo `container-type: inline-size` (que NO crea
  // containing block para position:fixed). Por eso es seguro como ancestro de
  // <section id="reservar">: NO rompe el position:fixed de vaul/sonner/react-day-picker.
  // El overflow:hidden del campo decorativo del hero/cta vive en .frj-noisefield (su
  // propio contenedor), NO acá. switch / orderedSections / props de BookingClient: VERBATIM.
  return (
    <main
      // EL LANDING DECLARA SU PROPIO CONTEXTO VISUAL, no lo hereda.
      // Antes el <main> no traía theme/palette/font/modo y los tomaba del ancestro. Eso rompía en
      // los DOS lados:
      //   - en el preview del CMS heredaba el theme del PANEL (un landing forjo dentro de un panel
      //     modern salía con la Jakarta del panel, y el fondo del panel), o sea que la vista previa
      //     mentía;
      //   - en la web pública heredaba la clase .dark que next-themes le pone a <html> según lo que
      //     el VISITANTE tenga guardado → la misma página se veía clara u oscura según quién entrara.
      // Declarando los tokens acá, el subárbol resuelve contra ESTE elemento y no contra <html>.
      // `data-theme` va SIEMPRE, incluido 'forjo': omitirlo (como hace PaletteScript en <html>) acá
      // significaría heredar el theme de arriba, no caer al default — de ahí el selector
      // [data-theme='forjo'] que se agregó en globals.css.
      // Ojo (limitación conocida): los overlays del booking que se portean a document.body
      // (vaul/sonner) quedan FUERA de este árbol y siguen el tema de la app, no el del landing.
      className={t.mode === 'dark' ? 'frj-site dark' : 'frj-site'}
      data-motion={motionLevel}
      data-theme={t.theme}
      data-palette={t.palette}
      data-font={t.font !== 'auto' ? t.font : undefined}
      style={t.primary ? ({ ['--primary']: t.primary } as CSSProperties) : undefined}
    >
      {/* Controlador de motion (IntersectionObserver): observa los .frj-reveal del markup y les
          agrega .shown al entrar al viewport. Es el ÚNICO client component del árbol; no renderiza
          DOM (retorna null). Con level='none' no toca nada (estático). NUNCA observa el widget de
          booking: solo nodos .frj-reveal, que por markup nunca son su ancestro (T-OA7-01). */}
      <LandingMotion level={motionLevel} />
      {/* Controlador del visor de fotos (galería / strip RSV / about). Mismo patrón que
          LandingMotion: client component único, montado una vez, que captura los clicks de las
          fotos POR DELEGACIÓN sobre el markup del server → las 3 secciones siguen siendo RSC.
          CAJA NEGRA: no renderiza DOM inline — el overlay se portalea a document.body con
          createPortal, así que JAMÁS envuelve al widget de reserva ni crea containing block que
          rompa el position:fixed de vaul/sonner/react-day-picker (D-07). */}
      <PhotoLightbox />
      {sections.map((s, i) => {
        const index = nextIndexFor(s)
        // switch (NO Record map): cada sección recibe props heterogéneas y el switch da
        // type-narrowing limpio sobre s.type. Las secciones del config traen `s.data`
        // (unknown, parseado fail-safe dentro de cada componente); la booking inyectada no.
        switch (s.type) {
          case 'hero':
            // Hero nunca se oculta (D7-09): siempre cae en business.name como fallback.
            return <Hero key={i} data={s.data} business={business} />
          case 'about':
            return <About key={i} data={s.data} index={index} />
          case 'services':
            // Lista derivada de la tabla services (D7-06); el data solo aporta título.
            // Reveal editorial vía wrapper (el componente rinde su propia <section>).
            return (
              <Reveal key={i}>
                <Services data={s.data} services={services} index={index} />
              </Reveal>
            )
          case 'gallery':
            // Gallery lleva frj-reveal/frj-zoom/lift en sus propias tiles (tiene fotos).
            return <Gallery key={i} data={s.data} index={index} />
          case 'location':
            // Combinada con hours → la PRIMERA del par rinde el bloque 2-col; la segunda nada.
            if (combine) {
              return s.type === firstOfPair ? <CombinedLocationHours key={i} index={index} /> : null
            }
            // Sola: full-width como hoy (respeta shouldHide). locations llega acotado. Reveal wrapper.
            return (
              <Reveal key={i}>
                <Location data={s.data} locations={locations as unknown as LocationType[]} businessAddress={business.address} index={index} />
              </Reveal>
            )
          case 'hours':
            if (combine) {
              return s.type === firstOfPair ? <CombinedLocationHours key={i} index={index} /> : null
            }
            // Sola: full-width. Hours deriva de time_blocks; locations solo para multi-sede. Reveal wrapper.
            return (
              <Reveal key={i}>
                <Hours data={s.data} timeBlocks={timeBlocks} locations={locations as unknown as LocationType[]} index={index} />
              </Reveal>
            )
          case 'cta':
            // Editorial → reveal de entrada. Wrapper (Cta rinde su propia sección/bookend).
            return (
              <Reveal key={i}>
                <Cta data={s.data} business={business} />
              </Reveal>
            )
          case 'booking':
            // CAJA NEGRA (Pitfall 2 / Blocker Pitfall 4/8): el booking se envuelve SOLO en
            // <section id="reservar">. PROHIBIDO transform/overflow-hidden/position:fixed|sticky/
            // filter/perspective/altura-fija alrededor — cualquiera crea un containing block que
            // rompe el position:fixed de vaul (drawers), sonner (toasts) y react-day-picker
            // (popover del calendario). D-05: si page.tsx pasó un `bookingSlot` ya resuelto por
            // vertical (CanchasBookingClient), lo renderizamos dentro de la MISMA caja negra sin
            // envoltorios nuevos; si no, el BookingClient de siempre (props VERBATIM, SC#2/LAND-02).
            return (
              <section id="reservar" key={i}>
                {/* Galería RSV (RSV-01): header + strip horizontal de fotos de confianza,
                    HERMANO del widget y renderizado ANTES (D-03). Su data sale del campo
                    DEDICADO del config (D-03b): `dataOf('booking')` devuelve el `data` colgado
                    de la sección booking del config, que RsvStrip parsea fail-safe con
                    rsvData.parse (sin fotos/roto → null → #reservar byte-idéntico a hoy). NO
                    envuelve al widget: su overflow-x vive confinado en su propio div, y el
                    booking NO recibe motion/overflow/transform (caja negra, RSV-02/MOTION-04).
                    Las props de BookingClient quedan VERBATIM. */}
                <RsvStrip data={dataOf('booking')} />
                {bookingSlot ?? (
                  <BookingClient
                    business={business}
                    services={services}
                    professionals={professionals}
                    timeBlocks={timeBlocks}
                    exceptions={exceptions}
                    locations={locations}
                  />
                )}
              </section>
            )
          default:
            // forward-compat: un type desconocido nunca rompe el render (cero 500, T-07-14/16).
            return null
        }
      })}

      {/* Botón flotante de WhatsApp. Va como ÚLTIMO hijo del landing por diseño: es un contenedor
          sticky de altura 0, y solo desde el final del flujo queda pegado al borde inferior del
          scrollport (ver whatsapp-float.tsx). No se configura: si el negocio declaró WhatsApp, el
          botón existe. Fuera de #reservar → el widget de reserva sigue siendo caja negra. */}
      <WhatsappFloat whatsapp={business.whatsapp} />
    </main>
  )
}
