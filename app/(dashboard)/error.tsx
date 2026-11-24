'use client'

import { useEffect } from 'react'
import { PanelErrorDeCarga } from '@/components/dashboard/panel-error-de-carga'

// Boundary de las pantallas del panel (quick 261124-neg).
//
// QUÉ ATRAPA: los throws de las páginas de `app/(dashboard)/**` —en particular
// `LecturaDelNegocioFallida`, que lanza `negocioDelPanel` cuando la lectura del negocio falla—. Como
// las páginas se renderizan DENTRO del layout, el aviso aparece con el sidebar y la barra del panel.
//
// QUÉ NO ATRAPA: el propio `app/(dashboard)/layout.tsx`. Según la doc de `error.js` de Next 16, el
// boundary de un segmento no envuelve al layout de ese mismo segmento; por eso el layout no lanza y
// muestra el mismo aviso inline.
//
// POR QUÉ `unstable_retry` y no `reset`: `reset` sólo limpia el estado del boundary y no vuelve a pedir
// los Server Components; `unstable_retry` hace `router.refresh()` + `reset()` en una transición
// (verificado en `node_modules/next/dist/client/components/error-boundary.js` de la versión instalada).
//
// Nunca se muestra `error.message` en pantalla: en producción Next ya lo cambia por un genérico con
// digest, y en desarrollo filtraría detalles. Se loguea el digest para cruzarlo con el log del server.
export default function PanelError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[panel/error]', error.digest ?? error.message)
  }, [error])

  return (
    <div className="flex justify-center py-10">
      <PanelErrorDeCarga titulo="No pudimos cargar esta pantalla" reintentar={unstable_retry} />
    </div>
  )
}
