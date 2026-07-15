import Link from 'next/link'
import { Globe, Check } from 'lucide-react'
import { UPGRADE_URL } from '@/lib/plans'

// ── WebUpsell: superficie de VENTA del add-on "Web a medida" (Phase 17, D-02) ──────────────────────
//
// Server Component estático (sin estado, sin 'use client'). Se renderiza en /web cuando el negocio de
// la sesión NO tiene el add-on (has_web_custom = false): en vez de un 404, el dueño ve qué es la web a
// medida y UN solo CTA dominante para activarla. Es SOLO UX de la superficie de LECTURA — no relaja las
// 3 Server Actions (siguen devolviendo not_entitled). El CTA reusa UPGRADE_URL (lib/plans.ts), cero
// constante nueva (D-02), mismo patrón externo (<a target="_blank" rel="noopener noreferrer">) que
// plan-banner.tsx. El link secundario al público /{slug} queda subordinado para no competir con el CTA.
// Solo tokens del design system (Bauhaus dark); touch targets ≥44px; focus visible; contraste WCAG AA.

export function WebUpsell({ slug }: { slug: string }) {
  const features = [
    'Diseño propio con tu logo y tus colores',
    'Reservas online integradas',
    'La editás vos desde el panel',
  ]

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Globe className="h-7 w-7" aria-hidden="true" />
        </div>

        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-black tracking-tight text-foreground">
          Web a medida
        </h1>

        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Una página web propia para tu negocio, con tu marca y las reservas online ya integradas. La
          editás vos desde el panel, sin depender de nadie.
        </p>

        <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left text-sm text-foreground">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <a
          href={UPGRADE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex min-h-[44px] w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Activar
        </a>

        <Link
          href={`/${slug}`}
          className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-md px-2 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Ver mi página actual
        </Link>
      </div>
    </div>
  )
}
