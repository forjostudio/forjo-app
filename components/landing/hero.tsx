import Image from 'next/image'
import { heroData } from '@/lib/landing/schema'
import type { PublicBusiness } from '@/lib/types'

// ── Sección Hero (RSC) ────────────────────────────────────────────────────────────
// Por qué RSC sin 'use client': es render puro de marca, sin estado ni interactividad
// propia (el CTA es un ancla nativa #reservar que funciona sin JS, D7-11).
// INVARIANTE (D7-09): el Hero NUNCA se oculta y NUNCA retorna null. Es el ÚNICO <h1>
// de la página (h1 "de marca", D7-02). Si el config no trae headline, cae al nombre
// del negocio. heroData (07-01) lleva `.catch({})`: data malformado → {} → fallbacks.

export function Hero({ data, business }: { data: unknown; business: PublicBusiness }) {
  // Parse fail-safe: si el data está roto, devuelve {} y usamos los fallbacks.
  const d = heroData.parse(data ?? {})
  // Fallback de marca: sin headline, el nombre del negocio sostiene el único h1.
  const headline = d.headline ?? business.name
  const ctaLabel = d.cta_label ?? 'Reservar turno'

  // El color del texto depende del fondo para mantener contraste AA en ambos casos:
  // con imagen el texto va sobre el scrim oscuro (bg-foreground/50) → texto claro
  // (text-background); sin imagen va sobre bg-secondary (claro) → texto oscuro
  // (text-foreground). Ambos son tokens (sin hex), re-skineables en Phase 8.
  const textClass = d.image ? 'text-background' : 'text-foreground'
  const subheadClass = d.image ? 'text-background/90' : 'text-muted-foreground'

  return (
    <section className="relative flex min-h-[70vh] items-end md:min-h-[80vh]">
      {d.image ? (
        <>
          {/* Imagen de fondo full-bleed (next/image, remotePatterns ya configurado en 07-01). */}
          <Image
            src={d.image}
            alt=""
            fill
            priority
            sizes="100vw"
            className="absolute inset-0 size-full object-cover"
          />
          {/* Scrim sobre la imagen para garantizar contraste AA (>=4.5:1) sin depender
              del contenido de la imagen subida (D7-03). Decorativo → aria-hidden. */}
          <div className="absolute inset-0 bg-foreground/50" aria-hidden="true" />
        </>
      ) : (
        // Sin imagen: fondo sólido sobre token (fallback theme-ready, sin hex).
        <div className="absolute inset-0 bg-secondary" aria-hidden="true" />
      )}

      <div className="relative z-10 w-full max-w-2xl px-4 py-12 md:px-6">
        <h1 className={`font-[family-name:var(--font-heading)] text-4xl font-bold leading-[1.1] md:text-6xl ${textClass}`}>
          {headline}
        </h1>
        {d.subhead && (
          <p className={`mt-4 max-w-prose text-base leading-relaxed md:text-lg ${subheadClass}`}>
            {d.subhead}
          </p>
        )}
        <a
          href="#reservar"
          className="mt-8 inline-flex min-h-11 items-center rounded-lg bg-primary px-6 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {ctaLabel}
        </a>
      </div>
    </section>
  )
}
