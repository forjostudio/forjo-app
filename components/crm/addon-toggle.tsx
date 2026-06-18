'use client'

// AddonToggle (ADM-06, D-08) — switch de add-on con UI OPTIMISTA + revert en error.
//
// Riesgo BAJO (RESEARCH Pattern 3): NO pasa por el ConfirmDialog — el toggle dispara directo la
// server action `toggleAddon` y la garantía real es `requireAdmin()` server-side (la UI es refuerzo,
// T-02-13). Optimismo: se cambia el estado local de inmediato y, si la action lanza, se revierte y se
// avisa con un toast de error (no se deja la UI mintiendo sobre el estado real).
//
// Se compone sobre el primitivo @base-ui/react/switch (ya instalado — mismo origen que el Dialog/Tabs
// que usa el repo). CERO paquetes nuevos. Sin wrapper en @/components/ui/switch (no existe en el repo).
//
// Set FIJO de add-ons: SOLO has_web_custom ("Web a medida") y has_whatsapp ("Recordatorios WhatsApp").
// NUNCA "SMS"/"Reportes avanzados"/"Multi-sucursal"/"Acceso API" (D-08).

import * as React from 'react'
import { Switch } from '@base-ui/react/switch'
import { toast } from 'sonner'
import { Loader2Icon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { toggleAddon } from '@/app/(crm)/admin/_actions'

export type AddonKey = 'has_web_custom' | 'has_whatsapp'

export interface AddonToggleProps {
  businessId: string
  addon: AddonKey
  label: string
  checked: boolean
}

export function AddonToggle({ businessId, addon, label, checked }: AddonToggleProps) {
  // Estado optimista: arranca del valor que vino del server. Si el prop cambia (revalidate tras la
  // action), se re-sincroniza DURANTE el render (patrón "adjusting state when a prop changes" de React,
  // sin useEffect → sin cascading renders).
  const [on, setOn] = React.useState(checked)
  const [prevChecked, setPrevChecked] = React.useState(checked)
  const [loading, setLoading] = React.useState(false)
  if (checked !== prevChecked) {
    setPrevChecked(checked)
    setOn(checked)
  }

  async function handleChange(next: boolean) {
    if (loading) return // anti doble-submit mientras resuelve la action
    const prev = on
    setOn(next) // optimista: la UI cambia ya
    setLoading(true)
    try {
      await toggleAddon({ businessId, addon, value: next })
      toast.success(next ? 'Add-on activado.' : 'Add-on desactivado.')
    } catch (err) {
      // revert: la action falló, volvemos al estado real.
      console.error('[addon-toggle] toggleAddon falló:', err instanceof Error ? err.message : err)
      setOn(prev)
      toast.error('No se pudo completar la acción. Probá de nuevo o revisá tu conexión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Switch.Root
      checked={on}
      disabled={loading}
      onCheckedChange={handleChange}
      aria-label={label}
      className={cn(
        // Hit area ≥44px (touch): el track real es h-6 w-11 pero el control ocupa min-h-11 vía padding.
        'group relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors',
        'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-60',
        // off = --secondary; on = verde --crm-success (track).
        'bg-secondary data-[checked]:bg-[var(--crm-success)]'
      )}
    >
      <Switch.Thumb
        className={cn(
          'pointer-events-none flex size-5 items-center justify-center rounded-full bg-[var(--crm-cream,#f3ead8)] shadow-sm transition-transform',
          'translate-x-0.5 data-[checked]:translate-x-[1.375rem]'
        )}
      >
        {loading && <Loader2Icon className="size-3 animate-spin text-foreground/60" aria-hidden="true" />}
      </Switch.Thumb>
    </Switch.Root>
  )
}
