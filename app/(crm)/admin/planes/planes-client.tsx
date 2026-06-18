'use client'

// Editor de precios (client) — ADM-05. Banner truthful (D-04) + grid de 3 PlanPriceCard con las
// keys REALES basic/studio/pro (Básico/Estudio/Pro), su price_ars real, su conteo de activos y sus
// features read-only. La card `pro` lleva "MÁS ELEGIDO". NO hay bloque de precios de add-ons (v2,
// ADDON-PAY-01). Cada card edita su precio vía ConfirmDialog "CONFIRMAR" → updatePlanPrice (el
// cableado vive dentro de PlanPriceCard).
//
// Copy del banner: VERBATIM del UI-SPEC §"Planes warning banner" (truthful D-04) — NO el del mock
// ("impacta la facturación de todos los negocios del plan"): editar un precio NO altera las
// suscripciones activas sin aviso.

import { AlertTriangle } from 'lucide-react'
import { PlanPriceCard, type PlanKey } from '@/components/crm/plan-price-card'

export type PlanCardData = {
  planKey: PlanKey
  name: string
  priceArs: number
  activeCount: number
  features: readonly string[]
}

export function PlanesClient({ cards }: { cards: PlanCardData[] }) {
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Planes y precios</h1>

      {/* Banner warning truthful (D-04) */}
      <div
        role="note"
        className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm text-foreground"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Editar un precio impacta la facturación de planes futuros, no altera las suscripciones activas sin aviso.
          Cada cambio pide confirmación y queda en auditoría.
        </p>
      </div>

      {/* Grid de 3 cards reales */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <PlanPriceCard
            key={c.planKey}
            planKey={c.planKey}
            name={c.name}
            priceArs={c.priceArs}
            activeCount={c.activeCount}
            features={c.features}
          />
        ))}
      </div>
    </div>
  )
}
