import { servicesData } from '@/lib/landing/schema'
import { shouldHideServices } from '@/lib/landing/derive'
import { Kicker, GhostIndex, PillButton } from '@/components/landing/_premium'
import type { Service } from '@/lib/types'

// ── Sección Services (RSC) ──────────────────────────────────────────────────────────
// La LISTA de servicios SIEMPRE deriva de la tabla `services` (D7-06), pasada por props
// desde page.tsx (vistas acotadas — skill RLS). El config `data` solo aporta título/subtítulo.
// Empty-state (D7-08): sin servicios → la sección se oculta entera (return null).
//
// Restyle F8.1 (D81-08, mock 05-screen.png): lista editorial (NO el grid de cards plano de
// F7). Cada item: número mono primary + nombre display (con duración·descripción small muted)
// + precio mono, separados por hairline. Items NO interactivos (el CTA de la página es el
// booking). Headings: <h2> de sección (kicker + display) y <h3> por servicio, sin saltos.
// Cero hex; tokens / --frj-*; mobile-first 375px.

export function Services({
  data,
  services,
  index,
}: {
  data: unknown
  services: Service[]
  index?: number | string
}) {
  const d = servicesData.parse(data ?? {})
  if (shouldHideServices(services)) return null

  return (
    <section
      id="servicios"
      // Anchor-land prolijo (pedido del usuario): al navegar a #servicios el encabezado y los
      // primeros ítems deben quedar pegados al tope del viewport. scroll-mt-0 ancla el box-top
      // de la section al borde superior; el pt es CHICO (no el py uniforme) para no dejar aire
      // muerto arriba y que se vea más sección de entrada. El pb conserva el ritmo inferior.
      className="relative scroll-mt-0 px-[clamp(20px,5cqw,64px)] pb-[clamp(56px,11cqw,150px)] pt-[clamp(20px,3cqw,44px)]"
    >
      {/* Número fantasma secuencial (lo deriva el renderer del orden real). aria-hidden vive en GhostIndex. */}
      {index != null && <GhostIndex n={index} />}

      <div className="mb-[clamp(28px,5cqw,64px)] flex flex-col gap-[0.9em]">
        <Kicker>Servicios</Kicker>
        <h2 className="frj-display text-[clamp(30px,6.4cqw,80px)]">
          {d.title ?? 'Servicios'}
        </h2>
        {d.subtitle && (
          <p className="max-w-[46ch] text-[clamp(14px,1.7cqw,18px)] leading-[1.6] text-muted-foreground">
            {d.subtitle}
          </p>
        )}
      </div>

      {/* Lista editorial: hairline arriba + border-bottom por item (el .frj-srv-list del mock). */}
      <ul className="border-t border-border">
        {services.map((service, i) => (
          <li
            key={service.id}
            className="grid grid-cols-[auto_1fr_auto] items-baseline gap-[clamp(14px,3cqw,40px)] border-b border-border py-[clamp(20px,3.4cqw,40px)] transition-transform duration-200 hover:translate-x-[clamp(6px,1.5cqw,18px)] motion-reduce:transition-none motion-reduce:hover:translate-x-0"
          >
            {/* Número mono primary (01/02/03…), padded a 2 dígitos. Decorativo. */}
            <span
              className="font-[family-name:var(--frj-font-mono)] text-[clamp(11px,1.3cqw,14px)] tracking-[0.12em] text-primary"
              aria-hidden="true"
            >
              {String(i + 1).padStart(2, '0')}
            </span>

            {/* Nombre display + small muted (duración · descripción). */}
            <div>
              <h3 className="frj-display text-[clamp(22px,3.8cqw,44px)] font-bold leading-none [letter-spacing:-0.03em]">
                {service.name}
              </h3>
              <small className="mt-[0.55em] block max-w-[48ch] text-[clamp(13px,1.5cqw,16px)] font-normal leading-normal tracking-normal text-muted-foreground">
                {service.duration_minutes} min
                {service.description ? ` · ${service.description}` : ''}
              </small>
            </div>

            {/* Precio mono a la derecha (toLocaleString es-AR como hoy). */}
            <span className="whitespace-nowrap font-[family-name:var(--frj-font-mono)] text-[clamp(13px,1.6cqw,18px)] text-foreground">
              ${Number(service.price).toLocaleString('es-AR')}
            </span>
          </li>
        ))}
      </ul>

      {/* Cierre del flujo ver-servicios → reservar (pedido del usuario, fidelidad con el mock):
          pill primario del template que ancla a la sección de booking. */}
      <div className="mt-[clamp(28px,5cqw,56px)] flex">
        <PillButton href="#reservar" variant="primary">
          Reservar turno
        </PillButton>
      </div>
    </section>
  )
}
