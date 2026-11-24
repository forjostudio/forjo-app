'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

// Aviso del panel cuando no se pudo leer el negocio del dueño (quick 261124-neg). Espeja la tarjeta de
// `app/suspendido/page.tsx`. Nunca muestra el detalle del error: sólo texto fijo.
//
// Dos caminos para «Reintentar», porque el aviso vive en dos lugares:
// - Dentro de `app/(dashboard)/error.tsx` (las pantallas lanzan): llega `reintentar = unstable_retry`,
//   que en Next 16.2 es `router.refresh()` + `reset()` del boundary en una transición.
// - En el layout del panel, que NO está envuelto por ese boundary (el `error.js` de un segmento no
//   envuelve al layout del mismo segmento): no hay boundary que resetear, así que basta con
//   `router.refresh()` para que el layout vuelva a leer el negocio.
export function PanelErrorDeCarga({ titulo, reintentar }: { titulo: string; reintentar?: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onReintentar() {
    startTransition(() => {
      if (reintentar) reintentar()
      else router.refresh()
    })
  }

  return (
    <section
      role="alert"
      className="w-full max-w-md rounded-xl border border-border bg-card p-6 sm:p-8 text-center"
    >
      <h1 className="text-xl font-semibold text-foreground">{titulo}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Puede ser un problema de conexión momentáneo. Probá de nuevo en unos segundos.
      </p>
      <Button className="mt-6 h-11 w-full" onClick={onReintentar} disabled={isPending}>
        {isPending ? 'Reintentando…' : 'Reintentar'}
      </Button>
    </section>
  )
}
