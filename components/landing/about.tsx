import Image from 'next/image'
import { aboutData } from '@/lib/landing/schema'
import { shouldHideAbout } from '@/lib/landing/derive'
import { Kicker, GhostIndex } from '@/components/landing/_premium'

// ── Sección About (RSC) ─────────────────────────────────────────────────────────────
// Por qué RSC sin 'use client': contenido editorial puro, sin estado propio.
// aboutData (07-01) lleva `.catch({})` → data malformado → {}. Empty-state (D7-08):
// sin body NI imagen → la sección se oculta entera (return null).
//
// LIGHTBOX (260711-iww): el portrait AHORA SE AMPLÍA (<button>, no <div>) — visor de 1 solo
// ítem (el controlador oculta las flechas cuando images.length === 1). La sección SIGUE SIENDO
// RSC: el botón NO lleva onClick, solo emite los data-attributes del contrato
// (lib/landing/lightbox.ts); el click lo captura por delegación el controlador <PhotoLightbox/>.
//
// Restyle F8.1 (D81-08, mock 04-screen.png): layout editorial 2-col (lead display + portrait
// aspect 4/5 con tag overlay primary), número fantasma decorativo. SIN imagen degrada con
// elegancia (solo la columna editorial; NUNCA bloque vacío). El <h2> es el lead display con
// la última palabra realzada en <em> itálica primary (vocabulario del mock). Cero hex.

// Realce editorial: parte el título en "todo menos la última palabra" + "última palabra".
// La última palabra se pinta en <em> itálica primary (el "construir" del mock) — realce
// determinista que no depende de contenido específico y mantiene la semántica del <h2>.
function splitLead(title: string): { head: string; tail: string } {
  const trimmed = title.trimEnd()
  const idx = trimmed.lastIndexOf(' ')
  if (idx === -1) return { head: '', tail: trimmed }
  return { head: trimmed.slice(0, idx + 1), tail: trimmed.slice(idx + 1) }
}

export function About({ data, index }: { data: unknown; index?: number | string }) {
  // Parse fail-safe: si el data está roto, devuelve {} y caemos en los fallbacks.
  const d = aboutData.parse(data ?? {})
  // shouldHideAbout(data): oculta si no hay cuerpo ni imagen.
  if (shouldHideAbout(d)) return null

  const title = d.title ?? 'Sobre nosotros'
  const { head, tail } = splitLead(title)

  return (
    // frj-reveal: reveal de entrada editorial (subtle/premium), 100% CSS. Anti-trap: visible por
    // defecto fuera de @supports+no-preference (globals.css).
    <section className="frj-reveal relative px-[clamp(20px,5cqw,64px)] py-[clamp(56px,11cqw,150px)]">
      {/* Número fantasma secuencial (lo deriva el renderer del orden real). aria-hidden vive en GhostIndex. */}
      {index != null && <GhostIndex n={index} />}

      <div className="grid grid-cols-1 items-center gap-[clamp(28px,5cqw,56px)] md:grid-cols-[1.25fr_0.9fr] md:gap-[clamp(48px,7cqw,96px)]">
        {/* Columna editorial: kicker + lead (h2 display con realce primary) + body muted. */}
        <div>
          <Kicker>Sobre nosotros</Kicker>

          {/* ÚNICO heading de la sección: <h2> (sin saltos de nivel, WCAG AA). El realce
              <em> es solo presentación; el texto completo del título queda legible. */}
          <h2 className="frj-display mt-[0.7em] text-[clamp(22px,4.2cqw,46px)] font-bold leading-[1.12] [letter-spacing:-0.025em]">
            {head}
            {tail && (
              <em className="italic font-semibold text-primary [letter-spacing:-0.03em]">
                {tail}
              </em>
            )}
          </h2>

          {d.body && (
            <p className="mt-[1.1em] max-w-[46ch] whitespace-pre-line text-[clamp(14px,1.7cqw,18px)] leading-[1.6] text-muted-foreground">
              {d.body}
            </p>
          )}
        </div>

        {/* Portrait aspect 4/5 con tag overlay primary (solo si hay imagen). En mobile
            va segundo (stack natural). SIN imagen: la columna no se renderiza y el lead
            ocupa todo el ancho — degrada con elegancia, nunca un bloque vacío. */}
        {d.image && (
          // frj-zoom: scale-in 1.08->1 SOLO premium; lift: hover brightness+translateY SOLO premium.
          // NO cambia sizes/loading del <Image> (no diferimos la carga). El overflow-hidden es de
          // esta tile (.frj-zoom lo refuerza en premium), no ancestro del booking.
          // p-0 + cursor-pointer + focus-visible: ver gallery.tsx (mismo tratamiento del <button>).
          <button
            type="button"
            // Contrato del lightbox (fuente de verdad: lib/landing/lightbox.ts). Grupo "about":
            // una sola foto → visor de 1 ítem, sin flechas.
            data-frj-lightbox="about"
            data-frj-src={d.image}
            aria-label="Ampliar foto"
            className="frj-zoom lift relative aspect-[4/5] w-full cursor-pointer overflow-hidden rounded-[2px] p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            <Image
              src={d.image}
              alt=""
              fill
              sizes="(min-width: 768px) 40vw, 100vw"
              className="object-cover"
            />
            {/* Tag overlay: contenido NO interactivo dentro del botón (sin handler propio) →
                no anida un interactivo dentro de otro. */}
            <span className="absolute bottom-0 left-0 bg-primary px-3 py-2 font-[family-name:var(--frj-font-mono)] text-[10px] uppercase tracking-[0.18em] text-[color:var(--frj-on-primary)]">
              Conocé el espacio
            </span>
          </button>
        )}
      </div>
    </section>
  )
}
