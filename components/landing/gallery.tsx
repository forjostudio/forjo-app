import Image from 'next/image'
import { galleryData } from '@/lib/landing/schema'
import { shouldHideGallery } from '@/lib/landing/derive'
import { Kicker, GhostIndex } from '@/components/landing/_premium'

// ── Sección Gallery (RSC) ───────────────────────────────────────────────────────────
// Por qué RSC sin 'use client': grid de imágenes estático, sin estado ni interactividad.
// galleryData (07-01) lleva `.catch({})` → data malformado → {}.
// Empty-state (D7-08): sin imágenes → la sección se oculta entera (return null).
//
// Restyle F8.1 (D81-08, mock 04-screen.png + `.frj-grid`): grid editorial FULL-BLEED (no el
// grid uniforme plano de F7). Las celdas varían su aspect-ratio de forma DETERMINISTA por
// índice (alta 3/4, ancha span-2 16/9, cuadrada 1/1, y en desktop una destacada span 2x2),
// igual que el mock. CLS-safe: cada celda reserva su espacio con aspect-ratio + next/image
// `fill` (no masonry, sin saltos de layout). Tiles NO interactivos (sin lightbox, igual que F7).
// Cero hex: solo tokens / utilidades.

// ── Patrón editorial determinista (espejo del mock) ──────────────────────────────────
// Cada celda recibe su forma según la posición en un ciclo de 6, replicando la composición
// asimétrica del mock. Determinista ⇒ SSR/CSR idénticos ⇒ cero CLS. Las clases controlan
// span (grid-column/row) y aspect-ratio; el contenedor reserva el espacio antes de cargar.
//   feat  → destacada: span 2 col × 2 row en desktop (1/1)
//   wide  → ancha: span 2 col (16/9)
//   tall  → alta: 3/4
//   sq    → cuadrada: 1/1
const SHAPES = [
  // pos 0: destacada (en mobile cae a cuadrada simple vía el reset de span en <lg)
  'sq lg:col-span-2 lg:row-span-2 lg:aspect-square',
  'sq',
  'col-span-2 aspect-video', // wide (16/9)
  'aspect-[3/4]', // tall
  'sq',
  'col-span-2 aspect-video', // wide
] as const

function shapeFor(i: number): string {
  return SHAPES[i % SHAPES.length]
}

export function Gallery({ data, index }: { data: unknown; index?: number | string }) {
  // Parse fail-safe: si el data está roto, devuelve {} y no hay imágenes → se oculta.
  const d = galleryData.parse(data ?? {})
  // shouldHideGallery(data): oculta si no hay imágenes.
  if (shouldHideGallery(d)) return null

  // shouldHideGallery garantiza images.length > 0 acá; el ?? [] es sólo para el narrowing de TS.
  const images = d.images ?? []

  return (
    <section className="relative py-[clamp(56px,11cqw,150px)]">
      {/* Número fantasma secuencial (lo deriva el renderer del orden real). aria-hidden vive en GhostIndex. */}
      {index != null && <GhostIndex n={index} />}

      {/* Head con padding lateral (el grid es full-bleed; sólo el head respeta el gutter). */}
      <div className="mb-[clamp(28px,5cqw,64px)] flex flex-col gap-[0.9em] px-[clamp(20px,5cqw,64px)]">
        <Kicker>Galería</Kicker>
        <h2 className="frj-display text-[clamp(30px,6.4cqw,80px)]">
          {d.title ?? 'Galería'}
        </h2>
      </div>

      {/* Grid editorial full-bleed: 2 col mobile, 4 col desktop, gap fino (mock `.frj-grid`).
          Cada celda lleva aspect-ratio reservado → CLS-safe sin masonry. */}
      <div className="grid grid-cols-2 gap-[6px] px-[6px] lg:grid-cols-4">
        {images.map((src, i) => (
          <div
            key={`${src}-${i}`}
            className={`relative overflow-hidden bg-[color:var(--frj-surface-2)] ${shapeFor(i)}`}
          >
            <Image
              src={src}
              alt=""
              fill
              // Las primeras tiles pueden estar above-the-fold → no lazy; el resto lazy (CLS-safe).
              loading={i < 2 ? undefined : 'lazy'}
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </section>
  )
}
