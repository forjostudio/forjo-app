import Image from 'next/image'
import { galleryData } from '@/lib/landing/schema'
import { shouldHideGallery } from '@/lib/landing/derive'

// ── Sección Gallery (RSC) ───────────────────────────────────────────────────────────
// Por qué RSC sin 'use client': grid de imágenes estático, sin estado ni interactividad.
// Grid responsive NO masonry (D7-03): cada tile reserva su espacio con aspect-square +
// width/height implícitos (next/image fill sobre contenedor con ratio) → CERO CLS.
// Sin lightbox en el MVP (UI-SPEC FLAG): un lightbox sería un contrato de modal con
// focus-trap/escape, diferido a F8. Tiles NO interactivos.
// galleryData (07-01) lleva `.catch({})` → data malformado → {}.
// Empty-state (D7-08): sin imágenes → la sección se oculta entera (return null).

export function Gallery({ data }: { data: unknown }) {
  // Parse fail-safe: si el data está roto, devuelve {} y no hay imágenes → se oculta.
  const d = galleryData.parse(data ?? {})
  // shouldHideGallery(data): oculta si no hay imágenes.
  if (shouldHideGallery(d)) return null

  // shouldHideGallery garantiza images.length > 0 acá; el ?? [] es sólo para el narrowing de TS.
  const images = d.images ?? []

  return (
    <section className="px-4 py-12 md:px-6 md:py-16">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight md:text-3xl">
          {d.title ?? 'Galería'}
        </h2>
        {/* Grid responsive, NO masonry (CLS-safe): 2 col mobile, 3 tablet, 4 desktop. */}
        <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {images.map((src, i) => (
            // Contenedor con aspect-square reserva el espacio antes de cargar → sin CLS.
            <div
              key={`${src}-${i}`}
              className="relative aspect-square overflow-hidden rounded-md bg-secondary"
            >
              <Image
                src={src}
                alt=""
                fill
                // Las primeras 4 tiles pueden estar above-the-fold → no lazy; el resto lazy.
                loading={i < 4 ? undefined : 'lazy'}
                sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
