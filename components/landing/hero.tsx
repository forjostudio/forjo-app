import Image from 'next/image'
import { heroData } from '@/lib/landing/schema'
import { PillButton, NoiseField } from '@/components/landing/_premium'
import type { PublicBusiness } from '@/lib/types'

// ── Sección Hero (RSC) ────────────────────────────────────────────────────────────
// Por qué RSC sin 'use client': es render puro de marca, sin estado ni interactividad
// propia (el CTA es un ancla nativa #reservar que funciona sin JS, D7-11).
// INVARIANTE (D7-09): el Hero NUNCA se oculta y NUNCA retorna null. Es el ÚNICO <h1>
// de la página (h1 "de marca", D7-02). Si el config no trae headline, cae al nombre
// del negocio. heroData (07-01) lleva `.catch({})`: data malformado → {} → fallbacks.
//
// Restyle F8.1 (D81-05, mock hero-fullscreen.png / 02-screen.png): full-bleed editorial.
// CON foto → imagen + scrim doble-gradiente que garantiza contraste AA del texto claro
// independientemente de la imagen subida (D7-03). SIN foto → NoiseField (campo radial
// primary→primary-deep + anillos constructivistas + grano): el entregable estrella, NUNCA
// un bloque plano. Vocabulario del mock: kicker mono con dot, display gigante, pill con
// flecha, scroll cue vertical. Cero hex: solo tokens (--frj-* / shadcn) y utilidades.

export function Hero({ data, business }: { data: unknown; business: PublicBusiness }) {
  // Parse fail-safe: si el data está roto, devuelve {} y usamos los fallbacks.
  const d = heroData.parse(data ?? {})
  // Fallback de marca: sin headline, el nombre del negocio sostiene el único h1.
  const headline = d.headline ?? business.name
  const ctaLabel = d.cta_label ?? 'Reservar turno'
  const hasImage = Boolean(d.image)

  return (
    <section
      className="relative flex w-full flex-col justify-end overflow-hidden"
      // hero full-screen: 100svh (llena el viewport como el mock hero-fullscreen; svh evita el
      // salto de la barra de URL en mobile y que asome la sección de abajo). El overflow:hidden
      // queda EN ESTA <section> (campo decorativo del hero), NO en el ancestro .frj-site del
      // booking — no afecta a <section id="reservar"> (D81-01).
      style={{ minHeight: '100svh' }}
    >
      {hasImage ? (
        <>
          {/* Imagen full-bleed (next/image, remotePatterns ya configurado en 07-01). */}
          <Image
            src={d.image!}
            alt=""
            fill
            priority
            sizes="100vw"
            className="absolute inset-0 -z-10 size-full object-cover"
          />
          {/* Scrim doble-gradiente (sutil arriba + denso abajo) que ancla el texto claro
              al fondo y garantiza >=4.5:1 sin depender del contenido de la imagen (D7-03).
              Negro de scrim = utilidad Tailwind (no hex hardcodeado). Decorativo. */}
          <div
            className="absolute inset-0 -z-10 bg-gradient-to-b from-black/25 via-black/0 to-black/0"
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/35 to-black/0"
            aria-hidden="true"
          />
        </>
      ) : (
        // Sin foto: campo de color radial + anillos + grano (NUNCA un bloque plano, D81-05).
        // NoiseField es absolute inset-0 con overflow propio; aria-hidden + pointer-events:none.
        <NoiseField className="-z-10" />
      )}

      {/* Topbar: marca izq + CTA der, ANCLADO arriba de todo (mock `.frj-nav`:
          position:absolute; top:0). Antes era un flex sibling y el justify-end de la
          <section> lo empujaba al medio/fondo; ahora vive fuera del flujo, pegado al top,
          mientras el bloque editorial sigue anclado abajo. */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-[clamp(20px,5cqw,64px)] pt-[clamp(18px,3cqw,34px)]">
        <span
          className={`font-[family-name:var(--font-heading)] text-xl font-extrabold tracking-tight ${
            hasImage ? 'text-white' : 'text-[color:var(--frj-on-primary)]'
          }`}
        >
          {business.name}
        </span>
        <a
          href="#reservar"
          className={`hidden font-[family-name:var(--frj-font-mono)] text-[11px] uppercase tracking-[0.28em] transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:inline ${
            hasImage ? 'text-white/85' : 'text-[color:var(--frj-on-primary)]/80'
          }`}
        >
          Reservar turno
        </a>
      </div>

      {/* Bloque editorial anclado al fondo (display gigante + sub + pill). */}
      <div
        className={`relative z-10 flex w-full flex-col px-[clamp(20px,5cqw,64px)] pb-[clamp(28px,6cqw,72px)] pt-[clamp(40px,8cqw,96px)] ${
          hasImage ? 'text-white' : 'text-[color:var(--frj-on-primary)]'
        }`}
      >
        {/* ÚNICO <h1> de la página (D7-02/D7-09): nunca se oculta, fallback a business.name.
            Sin kicker arriba (se quitó el eyebrow de rubro: muy genérico). Display más chico
            que antes (clamp menor) para acercar la escala al nombre del negocio del topbar. */}
        <h1 className="frj-display mb-[0.5em] text-[clamp(34px,9.5cqw,108px)]">
          {headline}
        </h1>

        {d.subhead && (
          <p className="mb-[1.5em] max-w-[30ch] text-[clamp(15px,2cqw,22px)] font-normal leading-[1.45] opacity-90">
            {d.subhead}
          </p>
        )}

        <div className="flex flex-wrap gap-[0.7em]">
          <PillButton href="#reservar" variant={hasImage ? 'on-photo' : 'primary'}>
            {ctaLabel}
          </PillButton>
          {/* Secundario del mock: scrollea a la sección Servicios (#servicios). Outline claro
              (ghost-photo) para contraste sobre el hero oscuro/foto. */}
          <PillButton href="#servicios" variant="ghost-photo">
            Ver servicios
          </PillButton>
        </div>
      </div>

      {/* Scroll cue vertical mono (decorativo). aria-hidden: no aporta semántica. */}
      <span
        className={`pointer-events-none absolute bottom-[clamp(28px,6cqw,72px)] right-[clamp(20px,5cqw,64px)] z-10 hidden font-[family-name:var(--frj-font-mono)] text-[10px] uppercase tracking-[0.2em] opacity-70 [writing-mode:vertical-rl] md:inline ${
          hasImage ? 'text-white' : 'text-[color:var(--frj-on-primary)]'
        }`}
        aria-hidden="true"
      >
        Scroll ↓
      </span>
    </section>
  )
}
