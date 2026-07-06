import { createClient } from '@/lib/supabase/server'

// Export CSV de clientes (DATA-01) — route handler AUTENTICADO del dueño.
//
// Por qué así (aislamiento por tenant, igual que appointments/create):
//   • Cliente anon + RLS (@/lib/supabase/server), NUNCA admin/service-role: el service role
//     queda prohibido en un endpoint que devuelve datos crudos al browser. RLS + el filtro
//     explícito por business_id son la defensa en profundidad.
//   • El business_id se re-deriva de la SESIÓN (owner_id de auth.getUser()), NUNCA de un
//     querystring: el actor solo puede exportar SU propio negocio (T-02-10/T-02-11).
//   • Se exportan TODAS las filas del negocio (no la página visible en el cliente).
//
// Formato del archivo (D-03/D-04):
//   • Response CRUDO text/csv (no Response.json) con Content-Disposition attachment.
//   • BOM UTF-8 al inicio — emitido con la secuencia de escape TS (backslash-uFEFF), NUNCA el glifo
//     invisible pegado — para que Excel-AR muestre bien los acentos.
//   • Escaping RFC4180 (esc): cada campo entre comillas dobles, comilla interna duplicada;
//     filas separadas por \r\n (CRLF). Cubre comas/comillas/saltos.
//   • CSV formula injection (OWASP): las comillas de RFC4180 NO alcanzan (Excel las quita al
//     parsear y evalúa =... igual). Los campos que arrancan con = + - @ (o tab/CR) se prefijan
//     con ' para neutralizar la fórmula. Importa porque el CSV incluye datos de origen no
//     confiable (ej. nombre del cliente cargado en una reserva pública).
//   • Header = CONTRATO DE ROUND-TRIP con la Fase 3 (import CSV): orden estable
//     nombre,telefono,email,origen,notas,obra_social,nro_obra_social. NO cambiar el orden
//     ni los nombres sin coordinar con la Fase 3.
//
// CSV hand-authored: NO se agrega dependencia de CSV (guardrail UI-SPEC Registry Safety).

export async function GET() {
  // Cliente anon+RLS con las cookies de la sesión del dueño. NO admin.
  const supabase = await createClient()

  // Auth gate (T-02-10): sin sesión → 401.
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

  // TODAS las filas del negocio (no la página visible), filtradas por business_id de la sesión.
  const { data: clients } = await supabase
    .from('clients')
    .select('name, phone, email, origin, notes, insurance_name, insurance_number')
    .eq('business_id', business.id)
    .order('name', { ascending: true })

  // Escaping RFC4180 + defensa CSV formula injection (OWASP): si el campo arranca con = + - @
  // (o tab/CR), prefijar con ' para que Excel/Sheets no lo evalúe como fórmula; luego RFC4180
  // (comillas dobles, comilla interna duplicada). Ver cabecera (T-02-13, endurecido post-secure).
  const esc = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
    return `"${safe.replace(/"/g, '""')}"`
  }

  // Header = contrato de round-trip con la Fase 3 (orden estable).
  const headers = ['nombre', 'telefono', 'email', 'origen', 'notas', 'obra_social', 'nro_obra_social']

  const rows = (clients ?? []).map((c) =>
    [
      c.name ?? '',
      c.phone ?? '',
      c.email ?? '',
      c.origin ?? '',
      c.notes ?? '',
      c.insurance_name ?? '',
      c.insurance_number ?? '',
    ]
      .map((v) => esc(String(v)))
      .join(',')
  )

  const csv = [headers.map(esc).join(','), ...rows].join('\r\n')

  const fecha = new Date().toISOString().slice(0, 10)

  // Response crudo con BOM U+FEFF delante del string (secuencia de escape, no glifo pegado).
  return new Response('\uFEFF' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="clientes-${business.slug}-${fecha}.csv"`,
    },
  })
}
