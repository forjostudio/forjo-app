'use client'

// PlanPriceCard (ADM-05) — card de plan con editor de precio (ARS) bajo doble confirmación.
//
// El editor reusa el MISMO patrón de type-to-confirm del ConfirmDialog escalonado de Phase 1
// (confirmWord="CONFIRMAR"): reusa sus helpers PUROS exportados (`computeConfirmState` +
// `buildSubmitGuard` + `confirmButtonClass`) y el Dialog base de @/components/ui/dialog. NO se
// hand-roll el gating ni el anti doble-submit. La razón de no usar el componente <ConfirmDialog>
// directo es que necesitamos un input de MONTO en el cuerpo del dialog (el ConfirmDialog no expone
// un slot de children); el contrato de confirmación (palabra exacta, loading no cerrable, toast de
// error, no-cerrar-en-fallo) es idéntico porque reusa las mismas funciones puras.
//
// Precios en ARS desde plan_prices (NUNCA el price_usd de plans.ts). Las features son read-only de
// lib/plans.ts. La card `pro` lleva el pill "MÁS ELEGIDO" + borde de acento (atado a la key real,
// no al "Equipo" del mock).

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Loader2Icon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { RiskBadge } from '@/components/crm/risk-badge'
import { computeConfirmState, buildSubmitGuard, confirmButtonClass } from '@/components/crm/confirm-dialog'
import { updatePlanPrice } from '@/app/(crm)/admin/_actions'

export type PlanKey = 'basic' | 'studio' | 'pro'

const CONFIRM_WORD = 'CONFIRMAR'

const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

export interface PlanPriceCardProps {
  planKey: PlanKey
  name: string
  priceArs: number
  activeCount: number
  features: readonly string[]
}

export function PlanPriceCard({ planKey, name, priceArs, activeCount, features }: PlanPriceCardProps) {
  const [open, setOpen] = React.useState(false)
  const [amount, setAmount] = React.useState(String(priceArs))
  const [typed, setTyped] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const loadingRef = React.useRef(false)

  const isPro = planKey === 'pro'

  // Monto válido: entero >= 0.
  const parsedAmount = Number(amount)
  const amountOk = Number.isInteger(parsedAmount) && parsedAmount >= 0 && amount.trim().length > 0

  const state = computeConfirmState({ confirmWord: CONFIRM_WORD, typed, reason: '', loading })
  const canConfirm = state.canConfirm && amountOk

  const handleOpenChange = React.useCallback((next: boolean) => {
    if (loadingRef.current) return
    if (next) {
      setAmount(String(priceArs)) // re-sembrar con el precio actual al abrir
      setTyped('')
    }
    setOpen(next)
  }, [priceArs])

  const submit = React.useCallback(
    () =>
      buildSubmitGuard({
        getLoading: () => loadingRef.current,
        setLoading: (v) => {
          loadingRef.current = v
          setLoading(v)
        },
        onConfirm: async () => {
          await updatePlanPrice({ planKey, priceArs: parsedAmount })
        },
      })(),
    [planKey, parsedAmount]
  )

  async function handleConfirm() {
    if (!canConfirm) return
    try {
      await submit()
      toast.success('Precio actualizado. Aplica a cobros futuros.')
      setTyped('')
      setOpen(false)
    } catch (err) {
      console.error('[plan-price-card] updatePlanPrice falló:', err instanceof Error ? err.message : err)
      toast.error('No se pudo completar la acción. Probá de nuevo o revisá tu conexión.')
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-xl border bg-card p-5',
        isPro ? 'border-primary ring-1 ring-primary/40' : 'border-border ring-1 ring-foreground/10'
      )}
    >
      {/* Encabezado: nombre + pill MÁS ELEGIDO (solo pro) */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-[family-name:var(--font-heading)] text-base font-bold tracking-[-0.02em]">{name}</h2>
        {isPro && (
          <span className="inline-flex h-5 items-center rounded-4xl bg-primary px-2 font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-primary-foreground">
            Más elegido
          </span>
        )}
      </div>

      <p className="font-[family-name:var(--font-geist-mono)] text-xs text-muted-foreground">
        {activeCount} {activeCount === 1 ? 'negocio activo' : 'negocios activos'}
      </p>

      {/* Precio display ARS */}
      <p className="flex items-baseline gap-1.5">
        <span className="font-[family-name:var(--font-heading)] text-4xl font-bold tracking-[-0.02em] tabular-nums">
          {arsFormatter.format(priceArs)}
        </span>
        <span className="font-[family-name:var(--font-geist-mono)] text-xs text-muted-foreground">/mes</span>
      </p>

      {/* Features read-only (lib/plans.ts) */}
      <ul className="flex flex-col gap-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-foreground">
            <Check className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--crm-success)' }} aria-hidden="true" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Button type="button" className="mt-auto w-full" onClick={() => handleOpenChange(true)}>
        Editar precio
      </Button>

      {/* Editor de precio: type-to-confirm "CONFIRMAR" + input de monto */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent showCloseButton={!loading}>
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>Editar precio del plan</DialogTitle>
              <RiskBadge risk="medio" />
            </div>
            <DialogDescription>
              Editar el precio no altera suscripciones activas sin aviso. Escribí CONFIRMAR.
            </DialogDescription>
          </DialogHeader>

          {/* Input de monto (mono, ARS, numérico) */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`price-${planKey}`}
              className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground"
            >
              Nuevo precio · {name} (ARS / mes)
            </label>
            <Input
              id={`price-${planKey}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={amount}
              disabled={loading}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!amountOk && amount.trim().length > 0 ? true : undefined}
              className={cn('font-mono', !amountOk && amount.trim().length > 0 && 'border-[var(--crm-danger)]')}
            />
            {!amountOk && amount.trim().length > 0 && (
              <p className="font-mono text-xs text-[var(--crm-danger)]">Ingresá un monto entero en ARS (≥ 0).</p>
            )}
          </div>

          {/* Type-to-confirm CONFIRMAR */}
          <div className="flex flex-col gap-1.5">
            <Input
              value={typed}
              disabled={loading}
              onChange={(e) => setTyped(e.target.value)}
              aria-invalid={state.wordMismatch || undefined}
              className={cn('font-mono', state.wordMismatch && 'border-[var(--crm-danger)]')}
              placeholder={CONFIRM_WORD}
            />
            {state.wordHelper && (
              <p className="font-mono text-xs text-[var(--crm-danger)]">{state.wordHelper}</p>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={loading} />}>Cancelar</DialogClose>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              aria-disabled={!canConfirm}
              className={confirmButtonClass(false)}
            >
              {loading ? (
                <>
                  <Loader2Icon className="animate-spin" />
                  Confirmando…
                </>
              ) : (
                'Confirmar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
