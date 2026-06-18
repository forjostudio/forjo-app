'use client'

// ExtendTrialDialog (ADM-04 / D-07) — extender el trial de un negocio.
//
// Riesgo BAJO → confirmación SIMPLE (NO el type-to-confirm del ConfirmDialog). Se compone sobre el
// MISMO Dialog base de @base-ui/react vía @/components/ui/dialog (focus trap / Escape / portal /
// outside-click ya resueltos — no se hand-roll). El loading replica la mecánica del ConfirmDialog:
// spinner + "Confirmando…", no cerrable mientras corre.
//
// D-07: presets +7/+14/+30 días O una fecha exacta (react-day-picker). Elegir uno deselecciona el
// otro. La fecha resultante se previsualiza con `resolveTrialEndsAt` (lib/crm-metrics, misma función
// que la action usa server-side → la preview coincide con lo que se persiste, fin del día AR).

import * as React from 'react'
import { toast } from 'sonner'
import { Loader2Icon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { resolveTrialEndsAt } from '@/lib/crm-metrics'
import { extendTrial, grantTrial } from '@/app/(crm)/admin/_actions'

type Preset = '7' | '14' | '30'

const PRESETS: { value: Preset; label: string }[] = [
  { value: '7', label: '+7 días' },
  { value: '14', label: '+14 días' },
  { value: '30', label: '+30 días' },
]

// Formato "Nuevo fin de trial: 23 jun 2026" (zona AR, fin del día).
const AR_TZ = 'America/Argentina/Buenos_Aires'
const dateFmt = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: AR_TZ,
})

export interface ExtendTrialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  businessId: string
  /** trial_ends_at actual (ISO) o null — solo para contexto/preview de "actual". */
  currentTrialEndsAt: string | null
  /**
   * 'extend' (default): suma desde el fin de trial vigente (extiende) → llama extendTrial.
   * 'grant': pone el negocio EN trial (status→trial) con un trial fresco desde hoy → llama grantTrial.
   */
  mode?: 'extend' | 'grant'
}

export function ExtendTrialDialog({ open, onOpenChange, businessId, currentTrialEndsAt, mode = 'extend' }: ExtendTrialDialogProps) {
  const isGrant = mode === 'grant'
  const [preset, setPreset] = React.useState<Preset | null>(null)
  const [exactDate, setExactDate] = React.useState<Date | undefined>(undefined)
  const [loading, setLoading] = React.useState(false)
  const loadingRef = React.useRef(false)

  // Reset al cerrar (salvo durante loading: el dialog no se cierra mientras corre la action).
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (loadingRef.current) return
      if (!next) {
        setPreset(null)
        setExactDate(undefined)
      }
      onOpenChange(next)
    },
    [onOpenChange]
  )

  // Elegir preset deselecciona la fecha exacta y viceversa (D-07: una sola fuente).
  function pickPreset(p: Preset) {
    setPreset(p)
    setExactDate(undefined)
  }
  function pickDate(d: Date | undefined) {
    setExactDate(d)
    setPreset(null)
  }

  const hasChoice = preset !== null || exactDate !== undefined

  // Preview de la nueva fecha — misma función que la action (coincide al persistir).
  const previewIso = React.useMemo(() => {
    try {
      // 'extend' previsualiza/persiste sumando desde el fin vigente; 'grant' arranca fresco (hoy).
      const base = isGrant ? null : currentTrialEndsAt
      if (preset) return resolveTrialEndsAt({ preset }, new Date(), base)
      if (exactDate) {
        const day = `${exactDate.getFullYear()}-${String(exactDate.getMonth() + 1).padStart(2, '0')}-${String(exactDate.getDate()).padStart(2, '0')}`
        return resolveTrialEndsAt({ exactDate: day })
      }
    } catch {
      return null
    }
    return null
  }, [preset, exactDate, isGrant, currentTrialEndsAt])

  async function handleConfirm() {
    if (!hasChoice || loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const action = isGrant ? grantTrial : extendTrial
      if (preset) {
        await action({ businessId, preset })
      } else if (exactDate) {
        const day = `${exactDate.getFullYear()}-${String(exactDate.getMonth() + 1).padStart(2, '0')}-${String(exactDate.getDate()).padStart(2, '0')}`
        await action({ businessId, exactDate: `${day}T12:00:00.000Z` })
      }
      toast.success('Listo. La acción quedó registrada en auditoría.')
      loadingRef.current = false
      setLoading(false)
      setPreset(null)
      setExactDate(undefined)
      onOpenChange(false)
    } catch (err) {
      console.error('[extend-trial] extendTrial falló:', err instanceof Error ? err.message : err)
      toast.error('No se pudo completar la acción. Probá de nuevo o revisá tu conexión.')
      loadingRef.current = false
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!loading} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isGrant ? 'Poner en trial' : 'Extender trial'}</DialogTitle>
          <DialogDescription>
            {isGrant
              ? 'Activá un trial para este negocio (pasa a estado trial). Elegí cuántos días dura o una fecha de fin.'
              : 'Elegí cuántos días sumar o una fecha exacta de fin de trial.'}
          </DialogDescription>
        </DialogHeader>

        {/* Presets (toggle-group, active amarillo) */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Días a sumar">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              disabled={loading}
              aria-pressed={preset === p.value}
              onClick={() => pickPreset(p.value)}
              className={cn(
                'inline-flex h-11 items-center rounded-md border px-4 text-sm transition-colors',
                'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60',
                preset === p.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-secondary text-foreground hover:bg-muted'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* O una fecha exacta */}
        <div className="flex flex-col gap-1.5">
          <span className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground">
            O una fecha exacta
          </span>
          <div className="rounded-lg border border-border bg-card">
            <Calendar
              mode="single"
              selected={exactDate}
              onSelect={pickDate}
              disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
            />
          </div>
        </div>

        {/* Preview del nuevo fin de trial */}
        <p className="text-sm text-muted-foreground">
          {previewIso ? (
            <>
              Nuevo fin de trial:{' '}
              <span className="font-[family-name:var(--font-geist-mono)] text-foreground">
                {dateFmt.format(new Date(previewIso))}
              </span>
            </>
          ) : currentTrialEndsAt ? (
            <>
              Fin de trial actual:{' '}
              <span className="font-[family-name:var(--font-geist-mono)]">
                {dateFmt.format(new Date(currentTrialEndsAt))}
              </span>
            </>
          ) : (
            'Elegí un preset o una fecha para previsualizar el nuevo fin de trial.'
          )}
        </p>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={loading} />}>Cancelar</DialogClose>
          <Button type="button" onClick={handleConfirm} disabled={!hasChoice || loading}>
            {loading ? (
              <>
                <Loader2Icon className="animate-spin" />
                Confirmando…
              </>
            ) : isGrant ? (
              'Poner en trial'
            ) : (
              'Extender trial'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
