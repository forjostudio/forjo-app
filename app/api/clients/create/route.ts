import { createClient } from '@/lib/supabase/server'
import { validateClientBody, buildClientInsert } from '@/lib/clients-create'

// Alta MANUAL de cliente desde el dashboard (autenticada). Molde de app/api/appointments/create:
// corre con la SESIÓN DEL DUEÑO → cliente anon+RLS (lib/supabase/server) y el negocio se resuelve por
// owner_id, NUNCA por un business_id que venga del cliente. El service role queda PROHIBIDO acá: el
// aislamiento por tenant lo garantizan RLS + el filtro por business_id resuelto por owner_id (defensa
// en profundidad, per skill supabase-multitenant-rls).
//
// Contrato (CLIENT-01 / D-02): valida nombre + al menos un contacto (teléfono o email), fija
// origin='manual' server-side (el cliente no lo elige; el CHECK de migr. 049 refuerza), y solo
// persiste obra social (insurance_*) si el vertical del negocio es salud. A diferencia del alta de
// turno, NO hay dedupe: el alta manual crea un cliente nuevo directo (D-02).
export async function POST(request: Request) {
  // Cliente anon+RLS con las cookies de la sesión del dueño. NO admin.
  const supabase = await createClient()

  // Auth gate (T-02-04): sin sesión autenticada → 401. El proxy ya refresca la sesión sobre /api/*.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // Tenant = ACTOR: el negocio se resuelve por owner_id de la sesión, nunca por un id del body
  // (T-02-05). Traemos type/vertical para que resolveVertical decida el gate de obra social.
  const { data: business } = await supabase
    .from('businesses')
    .select('id, type, vertical')
    .eq('owner_id', user.id)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // Parseo defensivo del body: no se confía en el shape del cliente (T-02-09).
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }
  const body = (raw ?? {}) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null
  const insurance_name = typeof body.insurance_name === 'string' && body.insurance_name.trim() ? body.insurance_name.trim() : null
  const insurance_number = typeof body.insurance_number === 'string' && body.insurance_number.trim() ? body.insurance_number.trim() : null

  // Validación (D-02): nombre no vacío + al menos uno de teléfono/email.
  const invalid = validateClientBody({ name, phone, email })
  if (invalid) return Response.json({ ok: false, error: invalid }, { status: 400 })

  // Insert (anon+RLS). business_id = business.id (de la sesión, NO del body). origin='manual' fijo.
  // insurance_* solo si el vertical es salud (gate dentro de buildClientInsert).
  const payload = buildClientInsert(business, { name, phone, email, notes, insurance_name, insurance_number })
  const { data: created, error: insertErr } = await supabase.from('clients').insert(payload).select('*').single()
  if (insertErr || !created) {
    console.error('[clients/create] insert error:', insertErr?.message ?? insertErr)
    return Response.json({ ok: false, error: 'insert_failed' }, { status: 500 })
  }

  // Fila completa para el prepend optimista en el cliente.
  return Response.json({ ok: true, client: created })
}
