import { createClient } from '@/lib/supabase/server'
import { negocioDelDueno } from '@/lib/negocio-del-dueno'
import { classifyRows } from '@/lib/clients-import'
import { parseClientsFile, IMPORT_MAX_ROWS } from '@/lib/clients-xlsx'

// Preview del import de clientes (archivo .xlsx o .csv) (DATA-03) — route handler AUTENTICADO del dueño.
// Runtime Node (NO Edge: usa Supabase + la librería de planillas, que necesita APIs de Node). El proxy
// Edge solo refresca la sesión sobre /api/*.
//
// Invariantes de seguridad (D-01/D-03/D-04 + skill supabase-multitenant-rls):
//   • Cliente anon+RLS (@/lib/supabase/server), NUNCA admin/service-role: el aislamiento por tenant
//     lo garantizan RLS + el filtro explícito por business_id (defensa en profundidad).
//   • business_id se resuelve por owner_id de la SESIÓN (auth.getUser()), NUNCA del archivo ni del body.
//   • NADA se escribe acá (SC-1): preview solo parsea + valida + deduplica + cuenta. Cero
//     .insert()/.update()/.delete(). El confirm re-recibe el MISMO archivo y RE-PARSEA (no confía
//     en esta preview — la preview no es autoritativa).
//   • Guards ANTES de tocar la DB, en este orden: tamaño (antes de leer un byte) → tipo por CONTENIDO
//     + ZIP-bomba → filas → header (D-04): rechazar temprano un archivo hostil (T-03-05/T-03-06). El
//     tipo lo decide la firma del archivo, no la extensión (T-03-08, quick 261124-ine).

// Guard de tamaño ANTES de leer/parsear (D-04). Vercel corta el request a 4.5MB con 413 igual, y el
// proxy.ts bufferea /api/* con 10MB (trunca en silencio) — el cap de 2MB queda holgado bajo ambos.
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB (D-04)
const MAX_ROWS = IMPORT_MAX_ROWS // T-03-06: una sola fuente con confirm → 400 too_many_rows antes de dedup/insert

// La librería de planillas usa APIs de Node (streams, Buffer): este handler no puede ir a Edge.
// 'nodejs' ya es el default; se declara para que nadie lo mueva sin ver esto.
export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
  // Cliente anon+RLS con las cookies de la sesión del dueño. NO admin.
  const supabase = await createClient()

  // Auth gate: sin sesión autenticada → 401. El proxy ya refresca la sesión sobre /api/*.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // Tenant = ACTOR: el negocio se resuelve por owner_id de la sesión, NUNCA por un id del CSV/body.
  // type/vertical alimentan el gate de obra social aguas abajo (classifyRows/buildClientInsert).
  // negocioDelDueno (quick 261124-ubl) en vez del single de PostgREST: con dos negocios del mismo
  // dueño el single daba error y la ruta respondía como si no tuviera negocio. Elige siempre el más
  // viejo, el mismo que muestra el panel. «Falló la lectura» no es «no tenés negocio».
  const negocio = await negocioDelDueno(supabase, user.id, 'id, type, vertical')
  if (!negocio.ok) {
    if (negocio.reason === 'sin-negocio') return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
    return Response.json({ ok: false, error: 'read_failed' }, { status: 500 })
  }
  const business = negocio.business

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

  // Guard de tamaño ANTES de leer un solo byte (D-04, T-03-05).
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: 'file_too_large' }, { status: 413 })
  }

  // Tipo por contenido (.xlsx = firma ZIP, .csv = texto; la extensión es solo lista permitida) +
  // pre-chequeo del ZIP-bomba + cap de filas, y después el header rígido (T-03-08, quick 261124-ine).
  const parsed = await parseClientsFile({ name: file.name, bytes: await file.arrayBuffer(), maxRows: MAX_ROWS })
  if (!parsed.ok) {
    return Response.json({ ok: false, error: parsed.error }, { status: 400 })
  }
  const { validHeader, rows } = parsed
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
      filas: importables, // datos de las filas VÁLIDAS para la tabla de preview (SC-1). Solo display;
      // el confirm RE-PARSEA (no confía en esto). Son datos del propio dueño (sin cruce de tenant).
    },
  })
  } catch (e) {
    // Cualquier throw inesperado (formData/parseo/query) se loguea y devuelve JSON 500 — NO un HTML de
    // error — para que la UI muestre un código y no un genérico ciego (diagnóstico del path multipart).
    console.error('[import/preview] error inesperado:', e instanceof Error ? e.message : e)
    return Response.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
