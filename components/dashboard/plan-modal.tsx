'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription-plans'
import { getPlanLimits } from '@/lib/plans'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

export function PlanModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)

  async function selectPlan(plan: string) {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Elegí tu plan</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          {Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => {
            const limits = getPlanLimits(key)
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
                  <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> {limits.max_professionals} profesional{limits.max_professionals > 1 ? 'es' : ''}</li>
                  <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> {limits.max_locations} sucursal{limits.max_locations > 1 ? 'es' : ''}</li>
                  {limits.features.map(f => (
                    <li key={f} className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> {f}</li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={isRec ? 'default' : 'outline'}
                  disabled={loadingPlan !== null}
                  onClick={() => selectPlan(key)}
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
