'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription-plans'
import { PLANS } from '@/lib/plans'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

// Un solo paso: "Elegir" lleva directo al link del plan de MP, donde el dueño paga con la cuenta
// que quiera. Ya no se pide el email de Mercado Pago (ver app/api/subscription/create), así que el
// modal no tiene nada que perder al cerrarse y no lleva la guarda de borrador.
export function PlanModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)

  function handleClose(v: boolean) {
    if (!v) setLoadingPlan(null)
    onOpenChange(v)
  }

  async function startCheckout(plan: string) {
    setLoadingPlan(plan)
    try {
      const res = await fetch('/api/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.ok && data.init_point) {
        window.location.href = data.init_point
      } else {
        toast.error(data.error || 'Error al iniciar la suscripción')
        setLoadingPlan(null)
      }
    } catch {
      toast.error('Error de conexión')
      setLoadingPlan(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Elegí tu plan</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          {Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => {
            // El modal es superficie de VENTA → muestra el límite REAL del plan desde PLANS, no
            // getPlanLimits (que con NEXT_PUBLIC_PLANS_UNLIMITED=true en prod devolvía 99 agendas).
            const limits = PLANS[key as keyof typeof PLANS] ?? PLANS.basic
            const isRec = plan.recommended
            return (
              <div
                key={key}
                className={cn(
                  'rounded-xl border p-4 flex flex-col',
                  isRec ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border'
                )}
              >
                {isRec && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Recomendado</span>
                )}
                <p className="font-bold text-lg">{plan.name}</p>
                <p className="text-2xl font-bold mt-1">
                  ${plan.price_ars.toLocaleString('es-AR')}
                  <span className="text-sm font-normal text-muted-foreground">/mes</span>
                </p>
                <ul className="text-xs text-muted-foreground space-y-1.5 mt-3 mb-4 flex-1">
                  <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> {limits.max_agendas} profesional{limits.max_agendas > 1 ? 'es' : ''}</li>
                  <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> Sucursales ilimitadas</li>
                  {limits.features.map(f => (
                    <li key={f} className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> {f}</li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={isRec ? 'default' : 'outline'}
                  onClick={() => startCheckout(key)}
                  disabled={loadingPlan !== null}
                >
                  {loadingPlan === key ? 'Redirigiendo...' : 'Elegir'}
                </Button>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Pagás de forma segura con MercadoPago · Podés cancelar cuando quieras
        </p>
      </DialogContent>
    </Dialog>
  )
}
