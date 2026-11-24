import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { negocioDelPanel } from '@/lib/negocio-del-dueno'
import { FinancesClient } from './finances-client'

export default async function FinancesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const business = await negocioDelPanel(supabase, user.id, 'id')

  // `FinancesClient` lee el tab de la query (`?tab=`, Phase 4) con `useSearchParams`, que obliga a un
  // boundary de Suspense. El fallback SÍ se dibuja: en una entrada blanda (Más, la tarjeta de Inicio, el
  // sidebar) con el chunk del cliente todavía sin cargar en el documento, el boundary muestra su fallback
  // mientras llega —310 a 1724 ms medidos—. Por eso el fallback es un nodo y no nada: el handler de scroll
  // de Next necesita un elemento del DOM para consumir el scroll de la navegación en el montaje; sin nodo
  // lo deja pendiente y el primer cambio de tab lo ejecuta, y la página salta arriba con los tabs debajo
  // del pliegue (G-04-6, `.planning/debug/finanzas-primer-toque-scroll.md`). Con un div vacío con la clase
  // del contenedor raíz de `FinancesClient` (alto cero: no agrega ningún píxel) lo consume al montar, como
  // antes de la fase. La query NO llega acá: el negocio sale del dueño de la sesión y el tab sólo elige
  // qué lista se muestra en el cliente.
  return (
    <Suspense fallback={<div className="space-y-6 max-w-5xl" aria-busy="true" />}>
      <FinancesClient businessId={business.id} />
    </Suspense>
  )
}
