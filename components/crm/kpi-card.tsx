import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * KpiCard — card de KPI del dashboard del operador (UI-SPEC §"KpiCard", ADM-07).
 *
 * Reusa la chrome de Card (bg-card, rounded-xl, ring-1 ring-foreground/10). El valor real
 * computado va en display (text-4xl, heading 700). El slot sparkline top-right queda VACÍO/plano:
 * en v1 no hay histórico (D-03) → NUNCA una tendencia fabricada ni un delta "vs mes anterior".
 *
 * La card "Pagos fallidos" lleva una regla fina de acento superior en --crm-danger (tone='danger').
 * El único rojo del CRM es --crm-danger, nunca --destructive (brief §12).
 *
 * Props:
 *   - label : etiqueta mono uppercase (MRR / NEGOCIOS ACTIVOS / …)
 *   - value : valor ya formateado para mostrar (string limpio, sin overlap)
 *   - tone  : hue del slot decorativo + énfasis del valor
 *   - sub?  : línea secundaria solo si es derivable en vivo (sin deltas fabricados)
 *   - href? : si está, toda la card navega (p.ej. a una vista filtrada del directorio)
 */

type KpiTone = 'accent' | 'info' | 'success' | 'danger' | 'neutral'

// Color del hue por tone (slot decorativo + énfasis del valor donde aplica).
const TONE_COLOR: Record<KpiTone, string | null> = {
  accent: 'var(--primary)',
  info: 'var(--crm-info)',
  success: 'var(--crm-success)',
  danger: 'var(--crm-danger)',
  neutral: null,
}

function KpiInner({ label, value, tone, sub }: { label: string; value: string; tone: KpiTone; sub?: string }) {
  const hue = TONE_COLOR[tone]
  return (
    <>
      {/* Regla de acento superior — solo en la card de Pagos fallidos (tone danger). */}
      {tone === 'danger' && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl"
          style={{ backgroundColor: 'var(--crm-danger)' }}
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <p className="font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {/* Slot sparkline VACÍO/plano (D-03): línea decorativa estática, jamás una tendencia. */}
        {hue && (
          <span
            aria-hidden="true"
            className="mt-1 h-px w-10 shrink-0 rounded-full opacity-40"
            style={{ backgroundColor: hue }}
          />
        )}
      </div>

      <p
        className="mt-3 font-[family-name:var(--font-heading)] text-4xl leading-[1.1] font-bold tracking-[-0.02em] tabular-nums"
        style={tone === 'accent' ? { color: 'var(--primary)' } : undefined}
      >
        {value}
      </p>

      {sub && <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>}
    </>
  )
}

export function KpiCard({
  label,
  value,
  tone = 'neutral',
  sub,
  href,
}: {
  label: string
  value: string
  tone?: KpiTone
  sub?: string
  href?: string
}) {
  const surface = 'relative block rounded-xl bg-card p-5 ring-1 ring-foreground/10'

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          surface,
          'transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
        )}
      >
        <KpiInner label={label} value={value} tone={tone} sub={sub} />
      </Link>
    )
  }

  return (
    <div className={surface}>
      <KpiInner label={label} value={value} tone={tone} sub={sub} />
    </div>
  )
}
