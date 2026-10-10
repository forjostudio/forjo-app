'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription-plans'
import { PLANS } from '@/lib/plans'
// La guarda del descarte accidental y su copy, del módulo que ya comparten Ajustes, Finanzas,
// Clientes, Canchas y las dos altas (quick 261009-tzd).
// La pista es la de las ALTAS y no la de Ajustes: acá no hay ningún botón "Guardar" —el flujo
// termina en "Continuar al pago"—, y mandar al dueño a apretar un botón que no está en pantalla es
// peor que no avisar (es la razón por la que `UNSAVED_NEW_HINT` existe).
import {
  UNSAVED_CHANGES_MESSAGE,
  UNSAVED_CHANGES_TOAST_ID,
  UNSAVED_NEW_ANNOUNCE,
  UNSAVED_NEW_HINT,
  guardDraftOnDismiss,
} from '@/lib/panel-draft'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

export function PlanModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  // ⚠ EL MAIL VIENE PRECARGADO, y por eso el "sucio" NO puede ser "el campo tiene algo"
  // (quick 261009-tzd). El efecto de abajo rellena el mail de la cuenta, así que un `!!email` a secas
  // marcaría sucio un modal que el dueño NUNCA tocó y lo dejaría ENCERRADO en un diálogo que ya no
  // cierra con un toque afuera — el modo de falla grave de esta guarda (code-review WR-09 de la
  // Phase 23). Lo que se compara es contra el valor con el que el campo NACIÓ.
  const [emailBaseline, setEmailBaseline] = useState('')
  // El aviso del cierre bloqueado, TAMBIÉN adentro del popup: la región aria-live del toast vive fuera
  // del portal y el modal la marca `inert` (code-review WR-08; el porqué largo, en `lib/panel-draft.ts`).
  const [dismissBlocked, setDismissBlocked] = useState(false)

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  // Prefill with the logged-in user's email when the modal opens. Stays editable —
  // some clients pay with a MercadoPago account under a different email. Only fills
  // when the field is empty so we never overwrite what the user is typing.
  useEffect(() => {
    if (!open) return
    let active = true
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const accountEmail = data.user?.email
      if (active && accountEmail) {
        setEmail((prev) => prev || accountEmail)
        // La línea base se mueve con el prefill, y con el MISMO `prev ||` que el campo: si el dueño
        // alcanzó a tipear antes de que resolviera el getUser, el campo conserva lo tipeado y la
        // línea base queda en el mail de la cuenta ⇒ el borrador queda sucio, que es lo correcto.
        setEmailBaseline((prev) => prev || accountEmail)
      }
    })
    return () => { active = false }
  }, [open])

  // El cierre DELIBERADO: resetea y cierra. Lo usan la ✕ del diálogo (vía la guarda, que la deja
  // pasar) y el cierre que pide el padre.
  function handleClose(v: boolean) {
    if (!v) {
      setSelectedPlan(null)
      setEmail('')
      setEmailBaseline('')
      setEmailError('')
      setLoadingPlan(null)
      // El único lugar donde se apaga el aviso: una región viva que nace con el texto ya puesto no
      // anuncia nada, así que reabrir con el aviso viejo colgado sería un anuncio perdido.
      setDismissBlocked(false)
    }
    onOpenChange(v)
  }

  /**
   * ¿Hay algo que perder? (quick 261009-tzd)
   *
   * Dos cosas: el plan elegido (que es el paso 2 del flujo) y el mail tipeado, medido contra el que
   * el prefill puso. Con el modal recién abierto —ningún plan elegido y el mail tal como vino— esto
   * da `false` y el toque afuera cierra igual que siempre.
   */
  function isPlanDirty() {
    return !!selectedPlan || email.trim() !== emailBaseline.trim()
  }

  function noticeDismissBlocked() {
    toast.warning(UNSAVED_CHANGES_MESSAGE, { id: UNSAVED_CHANGES_TOAST_ID, description: UNSAVED_NEW_HINT })
    setDismissBlocked(true)
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
    // El cierre accidental (toque afuera · Escape · atrás del celular) pasa por la guarda; la ✕ del
    // DialogContent es la salida deliberada y descarta siempre (quick 261009-tzd).
    <Dialog open={open} onOpenChange={guardDraftOnDismiss(isPlanDirty, () => handleClose(false), noticeDismissBlocked)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{selectedPlan ? 'Confirmá tu pago' : 'Elegí tu plan'}</DialogTitle>
        </DialogHeader>
        {/* `sr-only` es `position: absolute`: no reclama espacio ni mueve nada del layout. */}
        <p role="status" aria-live="assertive" className="sr-only">{dismissBlocked ? UNSAVED_NEW_ANNOUNCE : ''}</p>

        {!selectedPlan && (
        <>
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
                  <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> {limits.max_agendas} agenda{limits.max_agendas > 1 ? 's' : ''}</li>
                  <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> Sucursales ilimitadas</li>
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
