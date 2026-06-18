import { ctaData } from '@/lib/landing/schema'
import { shouldHideCta } from '@/lib/landing/derive'
import type { PublicBusiness } from '@/lib/types'

// ── Sección CTA (RSC) ───────────────────────────────────────────────────────────────
// Banda de cierre de la landing (theme-ready: bg-secondary, sin hex). RSC sin 'use client':
// dos anclas nativas (WhatsApp externo + #reservar interno) que funcionan sin JS (D7-11).
// `business.whatsapp` YA viene normalizado a formato wa.me en el repo (lib/types.ts líneas
// 18-19 / lib/whatsapp): se reusa directo, NO se construye la URL a mano (T-07-11).
// ctaData (07-01) lleva `.catch({})` → data malformado → {}.
// Empty-state (D7-08): sin headline NI whatsapp → la sección se oculta entera (return null).

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
    <section className="bg-secondary px-4 py-16 text-center md:px-6">
      <h2 className="mx-auto max-w-prose font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight md:text-3xl">
        {d.headline ?? '¿Listo para reservar?'}
      </h2>

      <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
        {/* Primario: WhatsApp (sólo si el negocio tiene whatsapp). URL ya normalizada a wa.me;
            link externo → target _blank + rel noopener (T-07-11). */}
        {business.whatsapp && (
          <a
            href={business.whatsapp}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-6 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Escribinos por WhatsApp
          </a>
        )}
        {/* Secundario: ancla a #reservar, outline subordinado visualmente al primario (UI-SPEC). */}
        <a
          href="#reservar"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary px-6 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Reservar turno
        </a>
      </div>
    </section>
  )
}
