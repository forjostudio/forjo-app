'use client'

import { useState, useTransition } from 'react'
import { setMaintenance } from '@/app/(crm)/admin/_maintenance-actions'

/** Toggle del modo mantenimiento global (kill switch). Prende/apaga la app para
 *  los negocios sin tocar Vercel ni redeploy — se aplica en el próximo request. */
export function MaintenanceToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function toggle() {
    setErr(null)
    const next = !on
    start(async () => {
      try {
        await setMaintenance(next)
        setOn(next)
      } catch {
        setErr('No se pudo aplicar. Probá de nuevo.')
      }
    })
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
            on ? 'bg-red-500/15 text-red-500' : 'bg-emerald-500/15 text-emerald-600'
          }`}
        >
          {on ? 'Fuera de línea' : 'Online'}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={`rounded-md px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${
            on ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {pending ? 'Aplicando…' : on ? 'Reactivar app' : 'Poner en mantenimiento'}
        </button>
        {err && <span className="text-sm text-red-500">{err}</span>}
      </div>
    </div>
  )
}
