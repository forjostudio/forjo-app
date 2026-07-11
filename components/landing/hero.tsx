import Image from 'next/image'
import type { CSSProperties } from 'react'
import { heroData } from '@/lib/landing/schema'
import { Kicker, PillButton, NoiseField } from '@/components/landing/_premium'
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

  // Ajustes de presentación del CMS (schema los acota; ausentes = el look de hoy).
  // scaleStyle devuelve `undefined` cuando la escala es 100 → NO se emite estilo inline y el
  // markup de las landings existentes queda byte-idéntico (el clamp() de la clase sigue mandando).
  // Cuando hay escala, se multiplica el MISMO clamp() responsive en vez de pisarlo con px fijos.
  const imageOpacity = d.image_opacity ?? 100
  const scaleStyle = (pct: number | undefined, clamp: string): CSSProperties | undefined =>
    pct === undefined || pct === 100 ? undefined : { fontSize: `calc(${clamp} * ${pct / 100})` }

  return (
    <section
      // frj-reveal: reveal de entrada (subtle/premium). El motion es 100% CSS (globals.css);
      // fuera de @supports+no-preference el estado base es visible (anti-trap). El overflow-hidden
      // vive en ESTA <section> (campo decorativo del hero), NUNCA en .frj-site (D81-01).
      //
      // `isolate` + fondo negro (solo con foto) resuelven juntos el "velo blanco":
      //  - isolate crea el CONTEXTO DE APILADO acá. Sin él, la capa de la foto (-z-10) escapa al
      //    contexto raíz y termina detrás de cualquier fondo opaco de un ancestro (le pasaba al
      //    preview del CMS: la foto no se veía). Con isolate, el -z-10 queda encerrado en el hero.
      //  - el negro es lo que hay DEBAJO de la foto, así que al bajar `image_opacity` la foto se
      //    funde a NEGRO y no al --background del tema (que en claro es blanco y la lavaba).
      //    Ojo al orden de pintado: el fondo del elemento se pinta ANTES que sus descendientes de
      //    z-index negativo — pero solo si el elemento es contexto de apilado. De ahí que `isolate`
      //    sea requisito de esto, no un extra.
      // Sin foto no se pinta negro: ahí manda el NoiseField (campo de color), que no debe taparse.
      className={`frj-reveal relative isolate flex w-full flex-col justify-end overflow-hidden ${
        hasImage ? 'bg-black' : ''
      }`}
      // hero full-screen: 100svh (llena el viewport como el mock hero-fullscreen; svh evita el
      // salto de la barra de URL en mobile y que asome la sección de abajo). El overflow:hidden
      // queda EN ESTA <section> (campo decorativo del hero), NO en el ancestro .frj-site del
      // booking — no afecta a <section id="reservar"> (D81-01).
      style={{ minHeight: '100svh' }}
    >
      {hasImage ? (
        <>
          {/* Capa de imagen con scale-in (frj-zoom: la foto entra en 1.08 y va a 1 al revelarse,
              SOLO premium). El overflow-hidden lo aporta .frj-zoom en premium; el <img> sigue
              siendo el LCP, arriba del fold, con preload (no se difiere la carga). Fuera de premium
              el wrapper queda estático (sin transform). */}
          {/* La opacidad va en ESTA capa (la de la foto), no en la <section>: así el texto, el
              scrim y el topbar quedan a opacidad plena y solo la foto se funde hacia el
              --background de la página. Bajarla NO compromete el contraste AA del texto: el scrim
              sigue aplicándose encima (D7-03). 100 = sin estilo inline (idéntico a hoy). */}
          <div
            className="frj-zoom absolute inset-0 -z-10"
            style={imageOpacity === 100 ? undefined : { opacity: imageOpacity / 100 }}
          >
            {/* Imagen full-bleed (next/image, remotePatterns ya configurado en 07-01).
                preload=true: Next 16 reemplaza el viejo prop de carga priorizada (deprecado)
                por `preload`, que inserta el <link rel=preload> en el <head> — mismo efecto LCP. */}
            <Image
              src={d.image!}
              alt=""
              fill
              preload
              sizes="100vw"
              className="size-full object-cover"
            />
          </div>
          {/* Scrim del hero. Arriba: gradiente negro sutil (contraste del topbar sobre foto clara,
              utilidad Tailwind). Abajo: .frj-hero-scrim bottom-heavy que funde la foto hacia el
              token --background (mockup aprobado) — reemplaza el viejo gradiente negro denso para
              que el hero se integre con la sección de abajo. Ambos decorativos. */}
          <div
            className="absolute inset-0 -z-10 bg-gradient-to-b from-black/25 via-black/0 to-black/0"
            aria-hidden="true"
          />
          <div
            className="frj-hero-scrim pointer-events-none absolute inset-0 -z-10"
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

      {/* Bloque editorial anclado al fondo (display gigante + sub + pill).
          frj-hero-onphoto (solo con foto): sombra de texto en dos capas para que el título no se
          lea "pegado" sobre la imagen. Ver globals.css. */}
      <div
        className={`relative z-10 flex w-full flex-col px-[clamp(20px,5cqw,64px)] pb-[clamp(28px,6cqw,72px)] pt-[clamp(40px,8cqw,96px)] ${
          hasImage ? 'frj-hero-onphoto text-white' : 'text-[color:var(--frj-on-primary)]'
        }`}
      >
        {/* Kicker editorial = ciudad/zona del negocio (config-driven, d.kicker). Reemplaza al
            rubro genérico que se quitó. Color sin caer en el trap de capas de Tailwind v4: clase
            sin-@layer (.frj-kicker-on-photo sobre foto / .frj-kicker-on-primary sobre color). */}
        {d.kicker && (
          <Kicker
            className={`mb-[0.7em] ${hasImage ? 'frj-kicker-on-photo' : 'frj-kicker-on-primary'}`}
            // El clamp base del kicker vive en .frj-kicker (globals.css); lo repetimos acá SOLO
            // para multiplicarlo. Si cambia allá, cambiar acá.
            style={scaleStyle(d.kicker_scale, 'clamp(10px, 1.15cqw, 13px)')}
          >
            {d.kicker}
          </Kicker>
        )}

        {/* ÚNICO <h1> de la página (D7-02/D7-09): nunca se oculta, fallback a business.name.
            Display más chico que antes (clamp menor) para acercar la escala al nombre del topbar. */}
        <h1
          className="frj-display mb-[0.5em] text-[clamp(34px,9.5cqw,108px)]"
          style={scaleStyle(d.headline_scale, 'clamp(34px, 9.5cqw, 108px)')}
        >
          {headline}
        </h1>

        {d.subhead && (
          <p
            className="mb-[1.5em] max-w-[30ch] text-[clamp(15px,2cqw,22px)] font-normal leading-[1.45] opacity-90"
            style={scaleStyle(d.subhead_scale, 'clamp(15px, 2cqw, 22px)')}
          >
            {d.subhead}
          </p>
        )}

        <div className="flex flex-wrap gap-[0.7em]">
          <PillButton href="#reservar" variant={hasImage ? 'on-photo' : 'primary'}>
            {ctaLabel}
          </PillButton>
          {/* Secundario del mock: scrollea a #servicios. Sobre FOTO el outline claro se perdía
              (pedido del usuario), así que ahí suma .frj-btn-photo-outline (velo oscuro + frosting
              + borde sólido). Sobre el campo de color plano queda el ghost-photo liviano. */}
          <PillButton
            href="#servicios"
            variant="ghost-photo"
            className={hasImage ? 'frj-btn-photo-outline' : undefined}
          >
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
