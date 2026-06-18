import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * StatusBadge — badge de estado de un negocio (UI-SPEC §"StatusBadge", ADM-01/02).
 *
 * Calca el patrón cva LOCAL de `components/crm/risk-badge.tsx`: NO edita el
 * `components/ui/badge.tsx` compartido. El hue de cada estado lo lleva el dot inline
 * (style con la var de color), igual que RiskBadge para el rojo --crm-danger.
 *
 * Un SOLO rojo en todo el CRM (--crm-danger), NUNCA --destructive (brief §12):
 * tanto "Suspendido" como "Churn" usan --crm-danger; churn va con dot muted para
 * distinguirse del suspendido (que es el estado distintivo y NUNCA se oculta — Pitfall 4).
 *
 * Variantes por plan_status:
 *   - active            → "Activo"      verde  --crm-success
 *   - trial             → "Trial"       azul   --crm-info
 *   - suspended         → "Suspendido"  rojo   --crm-danger (distintivo)
 *   - cancelled|expired → "Churn"       rojo   --crm-danger (dot muted)
 */

type StatusKey = 'active' | 'trial' | 'suspended' | 'churn'

const statusBadgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-4xl border px-2 py-0.5 text-xs whitespace-nowrap',
  {
    variants: {
      status: {
        active: 'border-border bg-secondary text-foreground',
        trial: 'border-border bg-secondary text-foreground',
        suspended: 'border-border bg-secondary text-foreground',
        churn: 'border-border bg-secondary text-muted-foreground',
      },
    },
    defaultVariants: {
      status: 'active',
    },
  }
)

// Mapa plan_status → {key de variante, label, color del dot}. cancelled/expired → churn.
const STATUS_MAP: Record<string, { key: StatusKey; label: string; dot: string }> = {
  active: { key: 'active', label: 'Activo', dot: 'var(--crm-success)' },
  trial: { key: 'trial', label: 'Trial', dot: 'var(--crm-info)' },
  suspended: { key: 'suspended', label: 'Suspendido', dot: 'var(--crm-danger)' },
  cancelled: { key: 'churn', label: 'Churn', dot: 'var(--crm-danger)' },
  expired: { key: 'churn', label: 'Churn', dot: 'var(--crm-danger)' },
}

// Estado desconocido: pill neutro con el código crudo (no se inventa copy).
function resolveStatus(planStatus: string): { key: StatusKey; label: string; dot: string } {
  return STATUS_MAP[planStatus] ?? { key: 'churn', label: planStatus, dot: 'var(--muted-foreground)' }
}

export function StatusBadge({
  planStatus,
  className,
  ...props
}: { planStatus: string } & Omit<React.ComponentProps<'span'>, 'children'> &
  VariantProps<typeof statusBadgeVariants>) {
  const { key, label, dot } = resolveStatus(planStatus)
  // El dot churn va con opacidad menor para diferenciarlo del suspendido (mismo rojo, distinto énfasis).
  const isChurn = key === 'churn' && (planStatus === 'cancelled' || planStatus === 'expired')
  return (
    <span className={cn(statusBadgeVariants({ status: key }), className)} {...props}>
      <span
        aria-hidden="true"
        className={cn('size-1.5 shrink-0 rounded-full', isChurn && 'opacity-60')}
        style={{ backgroundColor: dot }}
      />
      {label}
    </span>
  )
}

export { statusBadgeVariants }
