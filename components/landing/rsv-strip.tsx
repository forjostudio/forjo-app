import Image from 'next/image'
import { rsvData } from '@/lib/landing/schema'
import { Kicker } from '@/components/landing/_premium'

// ── Galería RSV — strip de confianza ARRIBA de la reserva (RSC) ───────────────────────
// Por qué RSC sin 'use client': header + fila de fotos estática, sin estado ni
// interactividad (el scroll horizontal es NATIVO, swipe/wheel, sin flechas). Marcarlo
// client arrastraría el árbol al bundle sin ganancia (RESEARCH Anti-Pattern).
//
// INVARIANTE CAJA NEGRA (RSV-02 / MOTION-04 / Pitfall 4/8 de v0.10): este bloque es
// HERMANO del widget de reserva, va ANTES de él dentro de <section id="reservar">, y
// NUNCA lo envuelve. El motivo: cualquier ancestro del widget con
// transform/overflow/filter/perspective/position:fixed|sticky crea un containing block
// que rompe el position:fixed de vaul (drawers), sonner (toasts) y react-day-picker
// (popover del calendario). Por eso:
//   - El `overflow-x: auto` vive en el PROPIO <div> del strip (confinado), separado del
//     widget por el margen inferior strip→widget. No sube a la <section> ni a ningún
//     ancestro del widget.
//   - No se aplica transform/filter/perspective/position acá.
//
// Empty-state (RSV-01 / D-03c): sin fotos (o data roto → {} por el .catch({}) de rsvData),
// retorna null → <section id="reservar"> queda con SOLO el widget, byte-idéntico a hoy.
// Se oculta TODO el bloque (incluido el header), para no dejar un título huérfano sobre
// el widget (UI-SPEC §Empty-state, D-03c).

export function RsvStrip({ data }: { data: unknown }) {
  // Parse fail-safe: espejo de gallery. Data roto → {} (el .catch({}) de rsvData en schema.ts)
  // → sin `images` → empty-state (null) abajo.
  const d = rsvData.parse(data ?? {})

  // Empty-state (RSV-01, D-03c): sin fotos, ocultar el bloque entero. `#reservar` queda
  // byte-idéntico a hoy (solo el widget). Se guarda contra images ausente o vacío.
  const images = d.images ?? []
  if (images.length === 0) return null

  // Título opcional (fallback = ninguno, UI-SPEC §Copy: sin string hardcodeado impuesto).
  const hasHead = Boolean(d.header)

  return (
    // Bloque RSV: HERMANO del widget (va ANTES). Sin motion (data-motion/frj-reveal/frj-parallax):
    // pertenece a la caja negra del booking, que NUNCA se anima (MOTION-04). Sin overflow/transform acá.
    <div className="pb-[clamp(24px,4cqw,40px)]">
      {/* Head editorial (mismo par que las demás secciones): Kicker opcional + <h2> + intro
          opcional. <h2> respeta la jerarquía (el <h1> es exclusivo del hero, D7-02). Solo se
          renderiza si el config trae header (sin fallback impuesto). Padding lateral fluido. */}
      {hasHead && (
        <div className="mb-[clamp(28px,5cqw,64px)] flex flex-col gap-[0.9em] px-[clamp(20px,5cqw,64px)]">
          <Kicker>Reservá</Kicker>
          <h2 className="frj-display text-[clamp(30px,6.4cqw,80px)]">{d.header}</h2>
          {d.intro && (
            <p className="max-w-[60ch] text-[clamp(15px,1.6cqw,18px)] leading-[1.5] text-[color:var(--frj-muted,inherit)]">
              {d.intro}
            </p>
          )}
        </div>
      )}

      {/* Strip horizontal: el overflow-x:auto vive en ESTE div (confinado, RSV-02 / Pitfall 3),
          NUNCA en <section id="reservar"> ni en un ancestro del widget. Scroll nativo por
          swipe/wheel, sin flechas. gap 8px; padding lateral fluido para alinear con el head y
          dejar peek de la 3ª foto en mobile. */}
      <div
        className="flex gap-[8px] overflow-x-auto px-[clamp(20px,5cqw,64px)]"
        // Fotos de ambiente decorativas: no es una lista interactiva navegable con teclado
        // (sin lightbox, igual que gallery). No agregamos controles focuseables.
        aria-hidden="true"
      >
        {images.map((src, i) => (
          <div
            key={`${src}-${i}`}
            // Tile: alto fijo 128px mobile / 168px ≥768px, aspect-ratio 4/3 (ancho derivado →
            // ≈171px mobile / ≈224px desktop). El aspect-ratio + alto fijo RESERVAN el espacio
            // (CLS-safe, sin salto de layout). shrink-0 evita que el flex las comprima.
            // El placeholder mientras carga = --frj-surface-2 (espejo de gallery). El
            // overflow-hidden es de la TILE, nunca ancestro del booking.
            className="relative h-[128px] shrink-0 overflow-hidden rounded-[8px] bg-[color:var(--frj-surface-2)] aspect-[4/3] md:h-[168px]"
          >
            <Image
              src={src}
              alt=""
              fill
              // El strip está DEBAJO de todas las editoriales (lejos del fold) → lazy en TODAS.
              // Nunca es LCP: sin priority/preload.
              loading="lazy"
              sizes="(min-width: 768px) 224px, 171px"
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
