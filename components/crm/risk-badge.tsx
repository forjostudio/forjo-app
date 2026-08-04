import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * RiskBadge — badge de nivel de riesgo del CRM (UI-SPEC §"Badge — Riesgo").
 *
 * NO edita el `components/ui/badge.tsx` compartido: define sus propias variantes con un cva
 * local (`riskBadgeVariants`). El relleno de peligro referencia el par `--danger` /
 * `--danger-foreground`, la superficie de peligro del shell activo: dentro del shell del CRM
 * resuelve al rojo propio del CRM (el ÚNICO del brief §12) y en el dashboard a `--destructive`.
 * INVARIANTE (D-07, lección del gap 13-05 #1): un componente compartido resuelve el peligro por esa
 * indirección y NUNCA nombra el token de un shell puntual — este badge se renderiza en los dos (lo
 * monta el ConfirmDialog, reusado en Ajustes desde 13-03) y con el token del CRM directo se perdía
 * fuera de él. Molde: `confirmButtonClass()` en `components/crm/confirm-dialog.tsx`.
 *
 * Variantes:
 *   - alto  → pill relleno de peligro (--danger + --danger-foreground), sin dot: el relleno ya marca
 *             el nivel (D-05). Antes era un pill oscuro con dot rojo y pesaba menos que `medio`.
 *   - medio → pill amarillo relleno (bg-primary, text-primary-foreground ink), sin dot.
 *   - bajo  → pill oscuro, text-muted-foreground, dot neutro/muted a la izquierda.
 *
 * El cambio de `alto` aplica en los DOS shells desde este único componente, sin variantes por scope:
 * el CRM cambia de aspecto a propósito (D-06). El badge no es interactivo → no lleva hover.
 */

export type RiskLevel = 'alto' | 'medio' | 'bajo'

const riskBadgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-4xl border px-2 py-0.5 text-xs whitespace-nowrap',
  {
    variants: {
      risk: {
        alto: 'border-transparent bg-[var(--danger)] text-[var(--danger-foreground)]',
        medio: 'border-transparent bg-primary text-primary-foreground',
        bajo: 'border-border bg-secondary text-muted-foreground',
      },
    },
    defaultVariants: {
      risk: 'bajo',
    },
  }
)

const RISK_LABEL: Record<RiskLevel, string> = {
  alto: 'Alto',
  medio: 'Medio',
  bajo: 'Bajo',
}

export function RiskBadge({
  risk,
  className,
  ...props
}: { risk: RiskLevel } & Omit<React.ComponentProps<'span'>, 'children'> &
  VariantProps<typeof riskBadgeVariants>) {
  return (
    <span className={cn(riskBadgeVariants({ risk }), className)} {...props}>
      {/* Dot indicador: solo en bajo. Ni alto ni medio lo llevan — los dos son pills rellenos y el
          relleno ya marca el nivel (D-05). */}
      {risk === 'bajo' && (
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
      )}
      {RISK_LABEL[risk]}
    </span>
  )
}

export { riskBadgeVariants }
