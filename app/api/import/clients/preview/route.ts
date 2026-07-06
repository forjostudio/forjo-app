import { createClient } from '@/lib/supabase/server'
import { parseCsv, classifyRows } from '@/lib/clients-import'

// Preview del import CSV de clientes (DATA-03) — route handler AUTENTICADO del dueño.
// Runtime Node por defecto (NO Edge: usa Supabase + parseo de archivo). El proxy Edge solo refresca
// la sesión sobre /api/*.
//
// Invariantes de seguridad (D-01/D-03/D-04 + skill supabase-multitenant-rls):
//   • Cliente anon+RLS (@/lib/supabase/server), NUNCA admin/service-role: el aislamiento por tenant
//     lo garantizan RLS + el filtro explícito por business_id (defensa en profundidad).
//   • business_id se resuelve por owner_id de la SESIÓN (auth.getUser()), NUNCA del CSV ni del body.
//   • NADA se escribe acá (SC-1): preview solo parsea + valida + deduplica + cuenta. Cero
//     .insert()/.update()/.delete(). El confirm re-recibe el MISMO archivo y RE-PARSEA (no confía
//     en esta preview — la preview no es autoritativa).
//   • Guards de tamaño/extensión/header/filas ANTES de parsear/tocar la DB (D-04): rechazar temprano
//     un archivo hostil (T-03-05/T-03-06).

// Guard de tamaño ANTES de leer/parsear (D-04). Vercel corta el request a 4.5MB con 413 igual, y el
// proxy.ts bufferea /api/* con 10MB (trunca en silencio) — el cap de 2MB queda holgado bajo ambos.
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB (D-04)
const MAX_ROWS = 2000 // T-03-06: expansión por filas → 400 too_many_rows antes de dedup/insert

export async function POST(request: Request) {
  // Cliente anon+RLS con las cookies de la sesión del dueño. NO admin.
  const supabase = await createClient()

  // Auth gate: sin sesión autenticada → 401. El proxy ya refresca la sesión sobre /api/*.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // Tenant = ACTOR: el negocio se resuelve por owner_id de la sesión, NUNCA por un id del CSV/body.
  // type/vertical alimentan el gate de obra social aguas abajo (classifyRows/buildClientInsert).
  const { data: business } = await supabase
    .from('businesses')
    .select('id, type, vertical')
    .eq('owner_id', user.id)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // Upload multipart: no se confía en el shape del cliente (T-03-09).
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

  // Guards ANTES de leer/parsear (D-04): tamaño (T-03-05) + extensión (T-03-08).
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: 'file_too_large' }, { status: 413 })
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return Response.json({ ok: false, error: 'invalid_file_type' }, { status: 400 })
  }

  // Parseo RFC4180 + BOM + validación del header rígido (round-trip con el export — T-03-08).
  const text = await file.text()
  const { validHeader, rows } = parseCsv(text)
  if (!validHeader) {
    return Response.json({ ok: false, error: 'invalid_header' }, { status: 400 })
  }

  // Guard de filas (D-04) ANTES de dedup/clasificar (T-03-06).
  if (rows.length > MAX_ROWS) {
    return Response.json({ ok: false, error: 'too_many_rows' }, { status: 400 })
  }

  // Existentes para el dedup, filtrados por tenant (business_id de la sesión).
  const { data: existing, error: existingErr } = await supabase
    .from('clients')
    .select('email, phone')
    .eq('business_id', business.id)
  if (existingErr) {
    console.error('[import/preview] existing query error:', existingErr.message)
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }

  // Clasificación pura (validación + dedup) — NO escribe (SC-1).
  const { importables, errores, duplicadas, total } = classifyRows({
    rows,
    existing: existing ?? [],
    business,
  })

  return Response.json({
    ok: true,
    preview: {
      total,
      importables: importables.length,
      duplicadas,
      errores,
    },
  })
}
