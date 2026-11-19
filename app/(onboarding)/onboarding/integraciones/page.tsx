import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { mpConnectConfigured } from '@/lib/mercadopago'
import { googleConfigured } from '@/lib/google-calendar'
import { getBusinessIntegrationStatus } from '@/lib/business-secrets'
import { resolveVertical } from '@/lib/verticals'
import { IntegracionesClient } from './integraciones-client'

// Paso 5 (opcional) del onboarding: «Conectá tus integraciones». Se llega desde «Finalizar» del
// wizard, con el negocio ya creado. La ruta existe para cualquier dueño con negocio y simplemente no
// se linkea desde el panel (D-04, opción A del research: sin columna ni migración).
//
// Aislamiento por tenant (T-q8v-03): el negocio se resuelve por `owner_id` de la sesión; no se lee
// `searchParams` ni ningún id del cliente. El estado conectado sale de la base, no del `?mp=`/`?google=`
// de la URL (T-q8v-05). Al cliente cruzan sólo booleanos y la clave del rubro (T-q8v-04).
export default async function IntegracionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, vertical, type, mp_user_id, mp_connection_status')
    .eq('owner_id', user.id)
    .single()
  if (!business) redirect('/onboarding')

  // Integración no configurada por entorno → su tarjeta se oculta, como en el panel. Ninguna
  // configurada → el paso no tiene nada que ofrecer y se va directo al panel (A2).
  const mpEnabled = mpConnectConfigured()
  const googleEnabled = googleConfigured()
  if (!mpEnabled && !googleEnabled) redirect('/dashboard')

  // MP: la MISMA regla que el panel (`settings-client.tsx`), no el `.mercadopago` del status, que
  // también cuenta un Access Token pegado a mano.
  const mpConnected = !!business.mp_user_id && business.mp_connection_status !== 'error'
  // Google: helper de PRESENCIA (service role, devuelve booleanos y descarta el valor del secreto),
  // con el business.id resuelto arriba por owner_id. Nunca el helper que devuelve los valores.
  const googleConnected = (await getBusinessIntegrationStatus(business.id)).google

  return (
    <IntegracionesClient
      vertical={resolveVertical(business).key}
      mpEnabled={mpEnabled}
      mpConnected={mpConnected}
      googleEnabled={googleEnabled}
      googleConnected={googleConnected}
    />
  )
}
