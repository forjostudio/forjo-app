import { Clock } from 'lucide-react'
import { servicesData } from '@/lib/landing/schema'
import { shouldHideServices } from '@/lib/landing/derive'
import type { Service } from '@/lib/types'

// ── Sección Services (RSC) ──────────────────────────────────────────────────────────
// La LISTA de servicios SIEMPRE deriva de la tabla `services` (D7-06), pasada por props
// desde page.tsx (vistas acotadas — skill RLS). El config `data` solo aporta título/subtítulo.
// Empty-state (D7-08): sin servicios → la sección se oculta entera (return null).
// Cards NO interactivas: el CTA de la página es el booking, no cada card. Reusa el patrón
// visual de booking-client (líneas 380-401) pero como <div> en vez de <button>.

export function Services({ data, services }: { data: unknown; services: Service[] }) {
  const d = servicesData.parse(data ?? {})
  if (shouldHideServices(services)) return null

  return (
    <section className="px-4 py-12 md:px-6 md:py-16">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight md:text-3xl">
          {d.title ?? 'Servicios'}
        </h2>
        {d.subtitle && (
          <p className="mt-2 max-w-prose text-base leading-relaxed text-muted-foreground md:text-lg">
            {d.subtitle}
          </p>
        )}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <div
              key={service.id}
              className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
            >
              <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold">
                {service.name}
              </h3>
              {service.description && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {service.description}
                </p>
              )}
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {service.duration_minutes} min
              </div>
              <p className="mt-2 font-[family-name:var(--font-heading)] text-xl font-bold">
                ${Number(service.price).toLocaleString('es-AR')}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
