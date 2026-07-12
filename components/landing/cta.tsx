import { ctaData } from '@/lib/landing/schema'
import { shouldHideCta } from '@/lib/landing/derive'
import { Kicker, PillButton, NoiseField } from '@/components/landing/_premium'
import type { PublicBusiness } from '@/lib/types'
import type { RingSpec } from '@/components/landing/_premium'

// ── Sección CTA (RSC) ───────────────────────────────────────────────────────────────
// Banda de cierre de la landing. RSC sin 'use client': dos anclas nativas (WhatsApp externo +
// #reservar interno) que funcionan sin JS (D7-11). `business.whatsapp` YA viene normalizado a
// formato wa.me en el repo (lib/types.ts líneas 18-19 / lib/whatsapp): se reusa directo, NO se
// construye la URL a mano (T-081-05). ctaData (07-01) lleva `.catch({})` → data malformado → {}.
// Empty-state (D7-08): sin headline NI whatsapp → la sección se oculta entera (return null).
//
// Restyle F8.1 (D81-08, mock 09-screen.png + `.frj-cta`): BOOKEND DE COLOR full-bleed — campo
// radial primary→primary-deep + grano (NoiseField, la misma primitiva del hero-sin-foto) como
// fondo, texto en --frj-on-primary, display gigante centrado (max ~24ch) y pills (WhatsApp
// externo + #reservar). Cierra la landing con el mismo peso visual con que abre el hero. Cero
// hex: solo tokens. mobile-first; touch >=44px y focus-visible:ring vienen del PillButton.

// Anillos del cierre (mock `.frj-cta`): simétricos hacia abajo, anclados al borde inferior
// para el efecto "bookend" (espejo del hero, que los lleva en la esquina). Strings CSS → SSR-safe.
const CTA_RINGS: RingSpec[] = [
  { size: '70%', left: '-18%', bottom: '-30%' },
  { size: '70%', right: '-18%', bottom: '-30%' },
  { size: '120%', left: '50%', bottom: '-70%' },
]

export function Cta({
  data,
  business,
}: {
  data: unknown
  business: PublicBusiness
}) {
  // Parse fail-safe: si el data está roto, devuelve {} y usamos el fallback de headline.
  const d = ctaData.parse(data ?? {})
  // shouldHideCta(data, business): oculta si no hay headline propio ni WhatsApp del negocio.
  if (shouldHideCta(d, business)) return null

  return (
    <section className="relative overflow-hidden px-[clamp(20px,5cqw,64px)] py-[clamp(64px,12cqw,160px)] text-center text-[color:var(--frj-on-primary)]">
      {/* Campo de color radial + anillos + grano (bookend). Decorativo (aria-hidden en NoiseField). */}
      <NoiseField rings={CTA_RINGS} className="-z-0" />

      {/* Inner editorial: kicker mono opcional + display gigante + pills, centrado (max 24ch). */}
      <div className="relative z-10 mx-auto flex max-w-[24ch] flex-col items-center gap-[1.1em]">
        {/* Eyebrow legible sobre el campo de color (mock). El override por utilidad NO ganaba:
            .frj-kicker pinta muted (oscuro sobre naranja) y es CSS sin @layer, que en Tailwind v4
            le gana a las utilidades layered. Se usa la clase modificadora .frj-kicker-on-primary
            (también sin @layer, definida después → gana por orden). Texto+punto en on-primary. */}
        <Kicker className="frj-kicker-on-primary">
          Reservá tu turno
        </Kicker>

        <h2 className="frj-display text-[clamp(34px,8.5cqw,104px)]">
          {d.headline ?? '¿Listo para reservar?'}
        </h2>

        <div className="flex flex-wrap justify-center gap-[0.7em]">
          {/* Primario: WhatsApp (sólo si el negocio tiene whatsapp). URL ya normalizada a wa.me;
              link externo → target _blank + rel noopener (T-081-05). on-photo = claro sobre el campo. */}
          {business.whatsapp && (
            <PillButton href={business.whatsapp} variant="on-photo" external>
              Escribinos por WhatsApp
            </PillButton>
          )}
          {/* Secundario: ancla a #reservar. Outline en on-primary → subordinado al primario
              sólido sin perder contraste sobre el campo de color (cero hex, solo tokens). */}
          <PillButton
            href="#reservar"
            variant="on-photo"
            className="[&]:border-[color:var(--frj-on-primary)]/40 [&]:bg-transparent [&]:text-[color:var(--frj-on-primary)] [&_.frj-btn-circ]:bg-[color:color-mix(in_oklab,var(--frj-on-primary)_22%,transparent)]"
          >
            {d.primary_label ?? 'Reservar turno'}
          </PillButton>

          {/* Botones extra del dueño (Instagram, la carta, cómo llegar…). Externos SIEMPRE:
              target _blank + rel noopener. El protocolo ya viene acotado a http/https por el
              schema (safeLinkUrl) — un href javascript: sería XSS y ni siquiera llega hasta acá.
              Mismo estilo outline que el ancla: el CTA tiene UN objetivo (reservar) y estos son
              subordinados; si compitieran visualmente, matarían la conversión. */}
          {d.links?.map((l) => (
            <PillButton
              key={`${l.label}-${l.url}`}
              href={l.url}
              variant="on-photo"
              external
              className="[&]:border-[color:var(--frj-on-primary)]/40 [&]:bg-transparent [&]:text-[color:var(--frj-on-primary)] [&_.frj-btn-circ]:bg-[color:color-mix(in_oklab,var(--frj-on-primary)_22%,transparent)]"
            >
              {l.label}
            </PillButton>
          ))}
        </div>
      </div>
    </section>
  )
}
