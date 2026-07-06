import { createClient } from '@/lib/supabase/server'

// Export CSV de finanzas (DATA-02) — route handler AUTENTICADO del dueño.
//
// Export-ONLY: la Fase 3 importa clientes, NO finanzas. No hay contrato de round-trip acá;
// el header es legible para el dueño/contador. Header (D-03): fecha,tipo,concepto,monto
// (tipo in turno|venta|egreso).
//
// Aislamiento por tenant (idéntico a export/clients):
//   • Cliente anon + RLS (@/lib/supabase/server), NUNCA admin/service-role.
//   • business_id re-derivado de la SESIÓN (owner_id), NUNCA de un querystring (T-02-11).
//   • Las tres queries filtran por .eq('business_id', business.id).
//
// El CSV combina TRES fuentes del modelo de movimientos (espejando finances-client.tsx):
//   • Turnos  (tipo='turno')  → appointments (neq cancelled) + services(name, price).
//   • Ventas  (tipo='venta')  → manual_sales; monto = amount * quantity (mismo cálculo que
//     finances-client: cada venta puede tener cantidad).
//   • Egresos (tipo='egreso') → expenses (category / amount / expense_date).
//
// NO se incluye fixed_expenses: son plantillas recurrentes (name / amount / frequency), NO
// movimientos fechados. Meterlas obligaría a inventar fechas y rompería la coherencia del CSV
// de movimientos (que es un registro de hechos fechados). Quedan fuera a propósito.
//
// Formato (D-04): Response CRUDO text/csv, BOM U+FEFF (secuencia de escape TS, no glifo pegado),
// escaping RFC4180, filas \r\n. CSV hand-authored, sin dependencia nueva.

export async function GET() {
  const supabase = await createClient()

  // Auth gate (T-02-10): sin sesión → 401.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // Tenant = ACTOR (owner_id), NUNCA querystring (T-02-11).
  const { data: business } = await supabase
    .from('businesses')
    .select('id, slug')
    .eq('owner_id', user.id)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // Las tres fuentes, todas acotadas por business_id de la sesión (defensa en profundidad).
  const [apptRes, salesRes, expRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('date, services(name, price)')
      .eq('business_id', business.id)
      .neq('status', 'cancelled'),
    supabase
      .from('manual_sales')
      .select('sale_date, description, amount, quantity')
      .eq('business_id', business.id),
    supabase
      .from('expenses')
      .select('expense_date, category, amount')
      .eq('business_id', business.id),
  ])

  type Movimiento = { fecha: string; tipo: string; concepto: string; monto: number }
  const movimientos: Movimiento[] = []

  // Turnos: concepto = nombre del servicio, monto = precio del servicio (0 si no hay).
  for (const a of apptRes.data ?? []) {
    const svc = a.services as { name?: string | null; price?: number | null } | null
    movimientos.push({
      fecha: a.date ?? '',
      tipo: 'turno',
      concepto: svc?.name ?? '—',
      monto: Number(svc?.price ?? 0),
    })
  }

  // Ventas: monto = amount * quantity (mismo cálculo que finances-client).
  for (const s of salesRes.data ?? []) {
    movimientos.push({
      fecha: s.sale_date ?? '',
      tipo: 'venta',
      concepto: s.description ?? '',
      monto: Number(s.amount) * Number(s.quantity),
    })
  }

  // Egresos: concepto = categoría, monto = amount.
  for (const e of expRes.data ?? []) {
    movimientos.push({
      fecha: e.expense_date ?? '',
      tipo: 'egreso',
      concepto: e.category ?? '',
      monto: Number(e.amount),
    })
  }

  // Orden por fecha descendente (coherente con la vista de finanzas).
  movimientos.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))

  // Escaping RFC4180: campo entre comillas dobles, comilla interna duplicada.
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`

  const headers = ['fecha', 'tipo', 'concepto', 'monto']
  const rows = movimientos.map((m) =>
    [m.fecha, m.tipo, m.concepto, String(m.monto)].map((v) => esc(String(v))).join(',')
  )

  const csv = [headers.map(esc).join(','), ...rows].join('\r\n')

  const fecha = new Date().toISOString().slice(0, 10)

  // Response crudo con BOM U+FEFF delante del string (secuencia de escape, no glifo pegado).
  return new Response('\uFEFF' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="finanzas-${business.slug}-${fecha}.csv"`,
    },
  })
}
