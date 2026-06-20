import Link from 'next/link'
import { Eye } from 'lucide-react'

import { StatusBadge } from '@/components/crm/status-badge'

/**
 * ImpersonationBanner — banner fijo de la vista de impersonación read-only (D-12, IMP-03).
 *
 * Presentacional puro (calca el estilo de componente de status-badge.tsx: sin estado, sin cliente
 * browser, sin mutación). Recibe TODO por props.
 *
 * IMPORTANTE (RESEARCH §3): el banner es FEEDBACK, NO la garantía read-only. La garantía real es
 * server-side por construcción — el árbol /ver no expone NINGÚN write path (ni server action de
 * mutación ni cliente browser). El read-only del mock original era no-op visual (pointerEvents);
 * acá el banner solo le dice al operador "estás viendo como X, solo lectura" para evitar confusión.
 *
 * "Salir de la vista" = un <Link> que NAVEGA a otra parte del CRM (D-04: salir = navegar, NO apaga
 * ningún estado global; no hay flag/cookie de "modo impersonación" que desactivar).
 *
 * El estado del negocio (incl. "Suspendido", D-11) se refleja con StatusBadge.
 */
export function ImpersonationBanner({
  businessName,
  planStatus,
}: {
  businessName: string
  planStatus: string | null
}) {
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[color-mix(in_oklch,var(--crm-accent,#f4c543),black_12%)] bg-[var(--crm-accent,#f4c543)] px-4 py-2.5 text-[#1a1714] sm:px-6"
    >
      <Eye className="size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 text-sm font-medium">
        Estás viendo como <span className="font-semibold">{businessName}</span> · solo lectura
      </p>

      {planStatus && <StatusBadge planStatus={planStatus} />}

      <Link
        href="/admin/negocios"
        className="ml-auto inline-flex h-8 shrink-0 items-center rounded-md bg-[#1a1714] px-3 text-xs font-semibold text-[var(--crm-accent,#f4c543)] transition-colors hover:bg-[#1a1714]/85 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#1a1714]/40"
      >
        Salir de la vista
      </Link>
    </div>
  )
}
