import { createClient } from '@/lib/supabase/server'
import { buildClientsWorkbook } from '@/lib/clients-xlsx'
import { XLSX_CONTENT_TYPE, workbookToBytes } from '@/lib/xlsx-style'

// Export de clientes en Excel (DATA-01) y plantilla de import — route handler AUTENTICADO del dueño.
//
// Lo que sigue igual (aislamiento por tenant, igual que appointments/create):
//   • Cliente anon + RLS (@/lib/supabase/server), NUNCA admin/service-role: el service role
//     queda prohibido en un endpoint que devuelve datos crudos al browser. RLS + el filtro
//     explícito por business_id son la defensa en profundidad.
//   • El business_id se re-deriva de la SESIÓN (owner_id de auth.getUser()), NUNCA de un
//     querystring: el actor solo puede exportar SU propio negocio (T-02-10/T-02-11).
//   • Se exportan TODAS las filas del negocio (no la página visible en el cliente).
//
// Lo que cambió (quick 261124-ine):
//   • Sale un .xlsx (hoja Clientes, encabezado de marca, fila congelada, autofiltro) en vez de un CSV
//     que Excel-AR abría colapsado en una columna.
//   • Cada valor va como celda de TEXTO: Excel no la evalúa aunque empiece con `=`, así que ya no hace
//     falta el prefijo `'` anti-fórmula (los nombres pueden venir de reservas públicas, no confiables).
//   • Los títulos son legibles (Nombre, Teléfono, … Nro. obra social); el import los reconoce con
//     canonicalHeader, así el archivo exportado vuelve a entrar sin tocarlo.
//   • `?plantilla=1` baja la plantilla de import (mismo builder, 0 filas + hoja Instrucciones) detrás
//     del MISMO gate de sesión. El querystring no aporta tenant: solo elige qué archivo armar.

// La librería de planillas usa APIs de Node (streams, Buffer): el route handler no puede ir a Edge.
// 'nodejs' ya es el default; se declara para que nadie lo mueva sin ver esto.
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const plantilla = new URL(request.url).searchParams.get('plantilla') === '1'

  // Cliente anon+RLS con las cookies de la sesión del dueño. NO admin.
  const supabase = await createClient()

  // Auth gate (T-02-10): sin sesión → 401. También para la plantilla (D-03).
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // Tenant = ACTOR: el negocio se resuelve por owner_id de la sesión, NUNCA por un id del
  // cliente / querystring (T-02-11).
  const { data: business } = await supabase
    .from('businesses')
    .select('id, slug')
    .eq('owner_id', user.id)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  if (plantilla) {
    // La plantilla no lee ningún cliente.
    const bytes = await workbookToBytes(buildClientsWorkbook([], { plantilla: true }))
    return xlsxResponse(bytes, 'plantilla-clientes.xlsx')
  }

  // TODAS las filas del negocio (no la página visible), filtradas por business_id de la sesión.
  const { data: clients } = await supabase
    .from('clients')
    .select('name, phone, email, origin, notes, insurance_name, insurance_number')
    .eq('business_id', business.id)
    .order('name', { ascending: true })

  const fecha = new Date().toISOString().slice(0, 10)
  const bytes = await workbookToBytes(buildClientsWorkbook(clients ?? []))
  return xlsxResponse(bytes, `clientes-${business.slug}-${fecha}.xlsx`)
}

// no-store: son datos personales; que ninguna caché intermedia se quede con una copia (T-q-07).
function xlsxResponse(bytes: Uint8Array<ArrayBuffer>, filename: string): Response {
  return new Response(bytes, {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
