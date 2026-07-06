import { createClient } from '@/lib/supabase/server'
import { parseCsv, classifyRows } from '@/lib/clients-import'
import { buildClientInsert } from '@/lib/clients-create'

// Confirm del import CSV de clientes (DATA-03) — route handler AUTENTICADO del dueño.
// Runtime Node por defecto (NO Edge: usa Supabase + parseo de archivo).
//
// Invariantes de seguridad (D-03/D-04 + skill supabase-multitenant-rls):
//   • RE-recibe el MISMO archivo por multipart y RE-PARSEA (stateless — Pitfall 2: Vercel Hobby es
//     efímero, sin stash server-side). NO confía en la preview del cliente: re-valida + re-deduplica
//     el archivo crudo (T-03-07). La preview no es autoritativa.
//   • origin='importado' se FUERZA server-side vía buildClientInsert(business, fila, 'importado')
//     (Pitfall 5); el CSV/body NUNCA aporta business_id ni origin (T-03-04/T-03-08).
//   • Insert anon+RLS (@/lib/supabase/server), NUNCA admin/service-role (T-03-10): RLS `with check`
//     como red final + business_id en cada payload = defensa en profundidad.
//   • Mismos guards de tamaño/extensión/header/filas que preview, ANTES de tocar la DB.

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB (D-04)
const MAX_ROWS = 2000 // T-03-06

export async function POST(request: Request) {
  // Cliente anon+RLS con las cookies de la sesión del dueño. NO admin.
  const supabase = await createClient()

  // Auth gate: sin sesión → 401.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // Tenant = ACTOR: negocio por owner_id de la sesión, nunca por un id del CSV/body.
  const { data: business } = await supabase
    .from('businesses')
    .select('id, type, vertical')
    .eq('owner_id', user.id)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // Upload multipart (mismo molde que preview).
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: 'missing_file' }, { status: 400 })
  }

  // Guards ANTES de leer/parsear (D-04).
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: 'file_too_large' }, { status: 413 })
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return Response.json({ ok: false, error: 'invalid_file_type' }, { status: 400 })
  }

  // RE-PARSEO autoritativo (D-03): no se confía en lo que el cliente "vio" en la preview.
  const text = await file.text()
  const { validHeader, rows } = parseCsv(text)
  if (!validHeader) {
    return Response.json({ ok: false, error: 'invalid_header' }, { status: 400 })
  }
  if (rows.length > MAX_ROWS) {
    return Response.json({ ok: false, error: 'too_many_rows' }, { status: 400 })
  }

  // Existentes para el dedup, filtrados por tenant.
  const { data: existing, error: existingErr } = await supabase
    .from('clients')
    .select('email, phone')
    .eq('business_id', business.id)
  if (existingErr) {
    console.error('[import/confirm] existing query error:', existingErr.message)
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }

  // Misma clasificación que preview (mismo lib/clients-import → no diverge).
  const { importables, errores, duplicadas } = classifyRows({
    rows,
    existing: existing ?? [],
    business,
  })

  // Contadores del resumen (SC-4). fallidos arranca con los errores de validación por fila.
  let importados = 0
  let fallidos = errores.length
  const omitidos = duplicadas

  if (importables.length > 0) {
    // Payload del insert: origin='importado' forzado server-side (3er arg). business_id lo pone
    // buildClientInsert desde la sesión; el gate de obra social por vertical también lo maneja.
    const payload = importables.map((f) =>
      buildClientInsert(
        business,
        {
          name: f.nombre,
          phone: f.telefono,
          email: f.email,
          notes: f.notas,
          insurance_name: f.obra_social,
          insurance_number: f.nro_obra_social,
        },
        'importado',
      ),
    )

    // Batch insert anon+RLS: un solo .insert() para ≤2000 filas. RLS `with check` = red final.
    const { data: inserted, error: insertErr } = await supabase
      .from('clients')
      .insert(payload)
      .select('id')

    // inserted es null cuando hay error (tipos de Supabase); se resuelve el conteo antes de ramificar.
    const insertedCount = inserted?.length ?? 0
    if (insertErr) {
      // Fallo del batch: se cuenta en `fallidos`, no se rompe el response (T-03-09). Un fallo total
      // e inesperado (sin filas insertadas) → 500 insert_failed.
      console.error('[import/confirm] insert error:', insertErr.message)
      if (insertedCount === 0) {
        return Response.json({ ok: false, error: 'insert_failed' }, { status: 500 })
      }
    }
    importados = insertedCount
    // Cualquier fila importable que la DB no devolvió (parcial/rechazada) se cuenta como fallida.
    fallidos += payload.length - insertedCount
  }

  return Response.json({
    ok: true,
    resumen: { importados, omitidos, fallidos },
  })
}
