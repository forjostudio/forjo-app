import Image from 'next/image'
import { cn } from '@/lib/utils'
import { galleryData } from '@/lib/landing/schema'
import { shouldHideGallery } from '@/lib/landing/derive'
import { Kicker, GhostIndex } from '@/components/landing/_premium'

// ── Sección Gallery (RSC) ───────────────────────────────────────────────────────────
// Por qué RSC sin 'use client': grid de imágenes estático, sin estado ni interactividad.
// galleryData (07-01) lleva `.catch({})` → data malformado → {}.
// Empty-state (D7-08): sin imágenes → la sección se oculta entera (return null).
//
// Restyle F8.1 → polish OA7 (mockup aprobado): grid editorial full-bleed de filas PAREJAS
// (grid-auto-rows) con backfill nativo de huecos (grid-auto-flow:dense) y fotos a DOBLE ANCHO
// (.wide). La altura de cada celda la fija .frj-gallery-grid (grid-auto-rows), no un aspect
// por tile; la imagen `fill` + object-cover llena la celda. CLS-safe (la fila reserva su alto).
// Tiles NO interactivos (sin lightbox, igual que F7). Cero hex: solo tokens / utilidades.

// ── Doble ancho determinista (placeholder hasta que el editor lo setee) ───────────────
// isWide(i): replica el ritmo del mockup (una foto ancha cada 4, en la 3ª posición del ciclo).
// Es DETERMINISTA ⇒ SSR/CSR idénticos ⇒ cero CLS. Follow-up: cuando el editor CMS permita
// marcar "foto ancha", este placeholder se reemplaza por el flag del config.
function isWide(i: number): boolean {
  return i % 4 === 2
}

export function Gallery({ data, index }: { data: unknown; index?: number | string }) {
  // Parse fail-safe: si el data está roto, devuelve {} y no hay imágenes → se oculta.
  const d = galleryData.parse(data ?? {})
  // shouldHideGallery(data): oculta si no hay imágenes.
  if (shouldHideGallery(d)) return null

  // shouldHideGallery garantiza images.length > 0 acá; el ?? [] es sólo para el narrowing de TS.
  const images = d.images ?? []

  return (
    // frj-reveal: reveal de entrada editorial (subtle/premium), 100% CSS. Anti-trap: visible por
    // defecto fuera de @supports+no-preference (globals.css).
    <section className="frj-reveal relative py-[clamp(56px,11cqw,150px)]">
      {/* Número fantasma secuencial (lo deriva el renderer del orden real). aria-hidden vive en GhostIndex. */}
      {index != null && <GhostIndex n={index} />}

      {/* Head con padding lateral (el grid es full-bleed; sólo el head respeta el gutter). */}
      <div className="mb-[clamp(28px,5cqw,64px)] flex flex-col gap-[0.9em] px-[clamp(20px,5cqw,64px)]">
        <Kicker>Galería</Kicker>
        <h2 className="frj-display text-[clamp(30px,6.4cqw,80px)]">
          {d.title ?? 'Galería'}
        </h2>
      </div>

      {/* Grid editorial full-bleed: .frj-gallery-grid aporta columns (2 mobile / 3 ≥768px),
          grid-auto-rows, grid-auto-flow:dense y gap (globals.css). frj-stagger queda como SCOPE
          del stagger del controlador JS (90ms/item por índice de hermano .frj-reveal). */}
      <div className="frj-gallery-grid frj-stagger px-[6px]">
        {images.map((src, i) => (
          <div
            key={`${src}-${i}`}
            // frj-reveal: entrada escalonada (el controlador IO le pone el transition-delay por
            // índice dentro del .frj-stagger). frj-zoom: scale-in 1.08->1 SOLO premium. lift: hover
            // brightness+translateY SOLO premium. Sin clases de aspect: el alto lo fija
            // grid-auto-rows y la imagen `fill` llena la celda. .wide (doble ancho) por índice
            // determinista. El overflow-hidden es de la tile, nunca ancestro del booking.
            className={cn(
              'frj-reveal frj-zoom lift relative overflow-hidden bg-[color:var(--frj-surface-2)]',
              isWide(i) && 'wide',
            )}
          >
            <Image
              src={src}
              alt=""
              fill
              // Las primeras tiles pueden estar above-the-fold → no lazy; el resto lazy (CLS-safe).
              loading={i < 2 ? undefined : 'lazy'}
              sizes="(min-width: 768px) 33vw, 50vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </section>
  )
}
