'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription-plans'
import { getPlanLimits } from '@/lib/plans'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

export function PlanModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  function handleClose(v: boolean) {
    if (!v) {
      setSelectedPlan(null)
      setEmail('')
      setEmailError('')
      setLoadingPlan(null)
    }
    onOpenChange(v)
  }

  async function startCheckout() {
    if (!selectedPlan) return
    const value = email.trim()
    if (!EMAIL_RE.test(value)) {
      setEmailError('Ingresá un email válido')
      return
    }
    setLoadingPlan(selectedPlan)
    try {
      const res = await fetch('/api/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan, payer_email: value }),
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
          <DialogTitle>{selectedPlan ? 'Confirmá tu pago' : 'Elegí tu plan'}</DialogTitle>
        </DialogHeader>

        {!selectedPlan && (
        <>
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
                  onClick={() => setSelectedPlan(key)}
                >
                  Elegir
                </Button>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Pagás de forma segura con MercadoPago · Podés cancelar cuando quieras
        </p>
        </>
        )}

        {selectedPlan && (
          <div className="mt-2 space-y-4">
            <p className="text-sm text-muted-foreground">
              Plan{' '}
              <span className="font-semibold text-foreground">
                {SUBSCRIPTION_PLANS[selectedPlan as keyof typeof SUBSCRIPTION_PLANS].name}
              </span>{' '}
              · ${SUBSCRIPTION_PLANS[selectedPlan as keyof typeof SUBSCRIPTION_PLANS].price_ars.toLocaleString('es-AR')}/mes
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="mp-email">Email de tu cuenta de MercadoPago</Label>
              <Input
                id="mp-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="tucuenta@email.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError('') }}
                onBlur={() => { if (email && !EMAIL_RE.test(email.trim())) setEmailError('Ingresá un email válido') }}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? 'mp-email-error' : 'mp-email-help'}
                disabled={loadingPlan !== null}
              />
              {emailError ? (
                <p id="mp-email-error" className="text-xs text-red-500">{emailError}</p>
              ) : (
                <p id="mp-email-help" className="text-xs text-muted-foreground">
                  Usá el email con el que iniciás sesión en MercadoPago. Debe coincidir con la cuenta con la que vas a pagar.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setSelectedPlan(null); setEmailError('') }}
                disabled={loadingPlan !== null}
              >
                Volver
              </Button>
              <Button
                className="flex-1"
                onClick={startCheckout}
                disabled={loadingPlan !== null || !email.trim()}
              >
                {loadingPlan ? 'Redirigiendo...' : 'Continuar al pago'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
