import Image from 'next/image'
import { aboutData } from '@/lib/landing/schema'
import { shouldHideAbout } from '@/lib/landing/derive'

// ── Sección About (RSC) ─────────────────────────────────────────────────────────────
// Por qué RSC sin 'use client': contenido editorial puro, sin estado ni interactividad.
// Layout editorial 2-col en desktop (imagen + texto), stack en mobile con la imagen primero
// (o solo texto si no hay imagen). aboutData (07-01) lleva `.catch({})` → data malformado → {}.
// Empty-state (D7-08): sin body NI imagen → la sección se oculta entera (return null).

export function About({ data }: { data: unknown }) {
  // Parse fail-safe: si el data está roto, devuelve {} y caemos en los fallbacks.
  const d = aboutData.parse(data ?? {})
  // shouldHideAbout(data): oculta si no hay cuerpo ni imagen.
  if (shouldHideAbout(d)) return null

  return (
    <section className="px-4 py-12 md:px-6 md:py-16">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2 md:items-center md:gap-12">
        {/* Imagen (si existe): primero en mobile, columna izquierda en desktop. Aspect-ratio
            explícito + next/image (width/height implícitos por aspect) para evitar CLS.
            aspect-[3/2] en mobile, retrato editorial aspect-[4/5] en desktop (UI-SPEC §About). */}
        {d.image && (
          <div className="relative aspect-[3/2] overflow-hidden rounded-md md:aspect-[4/5]">
            <Image
              src={d.image}
              alt=""
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        )}

        {/* Texto: cuerpo capado a 65ch para respetar la medida de línea óptima (45–75ch). */}
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight md:text-3xl">
            {d.title ?? 'Sobre nosotros'}
          </h2>
          {d.body && (
            <p className="mt-4 max-w-[65ch] whitespace-pre-line text-base leading-relaxed text-muted-foreground md:text-lg">
              {d.body}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
