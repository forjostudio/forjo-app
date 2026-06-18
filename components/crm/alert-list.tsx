import Link from 'next/link'
import { CheckCircle2, CreditCard, Clock, ChevronRight } from 'lucide-react'
import type { Alert } from '@/lib/crm-metrics'

/**
 * AlertList — lista de alertas urgentes del dashboard del operador (UI-SPEC §"AlertList",
 * ALERT-01, D-12). Ocupa la chrome de Card del mock; reemplaza visualmente el bloque
 * "Próximas actividades" del mock (que es Phase 6).
 *
 * Cada alerta es una FILA CLICKEABLE → /admin/negocios/{businessId} (toda la fila es el
 * affordance: Link wrap, cursor-pointer, hover bg-secondary, focus-visible ring amarillo, ≥44px).
 *
 * Solo 2 tipos de alerta (D-10): `pago_fallido` (dot rojo) y `trial_por_vencer` (dot amarillo).
 * El caption del trial usa `diasRestantes` cuando el RSC lo provee (0 → "vence hoy"); si no,
 * un caption genérico — nunca se inventa un número.
 *
 * Empty state: heading "Todo en orden" + body del copy lockeado del UI-SPEC.
 */

// La alerta puede venir enriquecida con los días restantes del trial (derivados en vivo en el RSC).
export type AlertItem = Alert & { diasRestantes?: number }

function trialCaption(dias: number | undefined): string {
  if (dias == null) return 'Trial por vencer'
  if (dias <= 0) return 'Trial vence hoy'
  if (dias === 1) return 'Trial vence en 1 día'
  return `Trial vence en ${dias} días`
}

export function AlertList({ alerts }: { alerts: AlertItem[] }) {
  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold font-[family-name:var(--font-heading)] tracking-[-0.02em]">
          Alertas
        </h2>
        <p className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground">
          Requieren acción
        </p>
      </div>

      {alerts.length === 0 ? (
        <div className="mt-4 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center">
          <div
            className="flex size-10 items-center justify-center rounded-lg bg-secondary"
            aria-hidden="true"
            style={{ color: 'var(--crm-success)' }}
          >
            <CheckCircle2 className="size-5" />
          </div>
          <h3 className="text-base font-bold font-[family-name:var(--font-heading)] tracking-[-0.02em]">
            Todo en orden
          </h3>
          <p className="max-w-md text-sm text-muted-foreground">
            No hay negocios con pagos fallidos ni trials por vencer en los próximos 7 días.
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-1">
          {alerts.map((a) => {
            const esPagoFallido = a.tipo === 'pago_fallido'
            const Icon = esPagoFallido ? CreditCard : Clock
            const caption = esPagoFallido ? 'Pago fallido' : trialCaption(a.diasRestantes)
            return (
              <li key={`${a.tipo}-${a.businessId}`}>
                <Link
                  href={`/admin/negocios/${a.businessId}`}
                  className="group/alert flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {/* Dot de estado: rojo pago_fallido / amarillo trial_por_vencer. */}
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: esPagoFallido ? 'var(--crm-danger)' : 'var(--primary)' }}
                  />
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"
                    aria-hidden="true"
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{a.name}</span>
                    <span className="block font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground">
                      {caption}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/alert:text-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
