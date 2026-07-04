'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ConfirmDialog, confirmButtonClass } from '@/components/crm/confirm-dialog'
import { setMaintenance } from '@/app/(crm)/admin/_maintenance-actions'

/** Toggle del modo mantenimiento global (kill switch). Prende/apaga la app para
 *  los negocios sin tocar Vercel ni redeploy — se aplica en el próximo request.
 *  Riesgo alto (baja toda la app) → confirma con ConfirmDialog en ambos casos. */
export function MaintenanceToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = React.useState(initial)
  const [open, setOpen] = React.useState(false)
  const next = !on // el estado al que se va a cambiar

  // onConfirm: si lanza, el ConfirmDialog queda abierto y muestra el toast de error.
  async function onConfirm() {
    await setMaintenance(next)
    setOn(next)
    toast.success(next ? 'App puesta en mantenimiento.' : 'App reactivada.')
  }

  return (
    <div className="rounded-xl border border-border p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Modo mantenimiento</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {on
              ? 'La app está FUERA DE LÍNEA para los negocios. El panel super-admin y los webhooks (/api) siguen activos.'
              : 'La app está online. La podés bajar para todos los negocios sin tocar Vercel; se aplica al instante.'}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            on
              ? 'bg-[var(--crm-danger)]/15 text-[var(--crm-danger)]'
              : 'bg-[var(--crm-success)]/15 text-[var(--crm-success)]'
          }`}
        >
          {on ? 'Fuera de línea' : 'Online'}
        </span>
      </div>

      <div className="mt-4">
        <Button type="button" onClick={() => setOpen(true)} className={confirmButtonClass(next)}>
          {on ? 'Reactivar app' : 'Poner en mantenimiento'}
        </Button>
      </div>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={next ? 'Poner la app en mantenimiento' : 'Reactivar la app'}
        description={
          next
            ? 'Todos los negocios van a ver la página de mantenimiento y no van a poder entrar hasta que la reactives. Los webhooks (/api) y este panel siguen funcionando.'
            : 'Los negocios van a volver a tener acceso normal a la app.'
        }
        risk={next ? 'alto' : 'medio'}
        destructive={next}
        confirmLabel={next ? 'Poner en mantenimiento' : 'Reactivar'}
        onConfirm={onConfirm}
      />
    </div>
  )
}
