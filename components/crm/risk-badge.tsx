import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * RiskBadge — badge de nivel de riesgo del CRM (UI-SPEC §"Badge — Riesgo").
 *
 * NO edita el `components/ui/badge.tsx` compartido: define sus propias variantes con un cva
 * local (`riskBadgeVariants`). Las variantes de dominio peligro referencian `--crm-danger`
 * (el ÚNICO rojo del CRM), NUNCA el token `--destructive` (brief §12, prohibición del plan).
 *
 * Variantes:
 *   - alto  → pill oscuro (bg-secondary), text-foreground, dot rojo (--crm-danger) a la izquierda.
 *   - medio → pill amarillo relleno (bg-primary, text-primary-foreground ink), sin dot.
 *   - bajo  → pill oscuro, text-muted-foreground, dot neutro/muted a la izquierda.
 */

export type RiskLevel = 'alto' | 'medio' | 'bajo'

const riskBadgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-4xl border px-2 py-0.5 text-xs whitespace-nowrap',
  {
    variants: {
      risk: {
        alto: 'border-border bg-secondary text-foreground',
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
      {/* Dot indicador: rojo --crm-danger en alto, neutro en bajo, ninguno en medio (el
          relleno amarillo ya marca el nivel). */}
      {risk === 'alto' && (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: 'var(--crm-danger)' }}
        />
      )}
      {risk === 'bajo' && (
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
      )}
      {RISK_LABEL[risk]}
    </span>
  )
}

export { riskBadgeVariants }
