import { createClient } from '@/lib/supabase/server'
import { negocioDelDueno } from '@/lib/negocio-del-dueno'
import { apptServiceName, apptServicePrice } from '@/lib/appointment-service'
import { buildFinancesWorkbook } from '@/lib/finances-xlsx'
import { XLSX_CONTENT_TYPE, workbookToBytes } from '@/lib/xlsx-style'

// Export de finanzas en Excel (DATA-02) — route handler AUTENTICADO del dueño.
//
// Export-ONLY: el import es de clientes, NO de finanzas. No hay contrato de round-trip acá; el archivo
// es para que lo lea el dueño o su contador.
//
// Aislamiento por tenant (idéntico a export/clients):
//   • Cliente anon + RLS (@/lib/supabase/server), NUNCA admin/service-role.
//   • business_id re-derivado de la SESIÓN (owner_id), NUNCA de un querystring (T-02-11).
//   • Las tres queries filtran por .eq('business_id', business.id).
//
// Formato (quick 261124-ine): un libro .xlsx de cuatro hojas — Resumen (totales calculados), Turnos,
// Ventas y Egresos — armado por lib/finances-xlsx.ts. Las TRES fuentes son las de siempre (espejando
// finances-client.tsx):
//   • Turnos  → appointments (neq cancelled) con el snapshot del servicio (nombre y precio).
//   • Ventas  → manual_sales; total = amount * quantity (cada venta puede tener cantidad).
//   • Egresos → expenses (category / amount / expense_date).
// Por qué fixed_expenses NO entra: ver la cabecera de lib/finances-xlsx.ts.

// La librería de planillas usa APIs de Node (streams, Buffer): el route handler no puede ir a Edge.
// 'nodejs' ya es el default; se declara para que nadie lo mueva sin ver esto.
export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()

  // Auth gate (T-02-10): sin sesión → 401.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // Tenant = ACTOR (owner_id), NUNCA querystring (T-02-11).
  // negocioDelDueno (quick 261124-ubl) en vez del single de PostgREST: con dos negocios del mismo
  // dueño el single daba error y la ruta respondía como si no tuviera negocio. Elige siempre el más
  // viejo, el mismo que muestra el panel. «Falló la lectura» no es «no tenés negocio».
  const negocio = await negocioDelDueno(supabase, user.id, 'id, slug')
  if (!negocio.ok) {
    if (negocio.reason === 'sin-negocio') return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
    return Response.json({ ok: false, error: 'read_failed' }, { status: 500 })
  }
  const business = negocio.business

  // Las tres fuentes, todas acotadas por business_id de la sesión (defensa en profundidad).
  const [apptRes, salesRes, expRes] = await Promise.all([
    supabase
      .from('appointments')
      // Select ACOTADO: pide el snapshot del servicio (migr. 065) además del join. Sin él, un turno
      // de un servicio ya borrado saldría en el Excel como "—" y $0, contradiciendo HIST-03.
      .select('date, service_name, service_price, services(name, price)')
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

  // Turnos: el helper resuelve snapshot → join (D-05), así que un servicio borrado conserva su
  // nombre y su precio (0 si no hay).
  const turnos = (apptRes.data ?? []).map((a) => ({
    fecha: a.date ?? '',
    servicio: apptServiceName(a),
    monto: apptServicePrice(a),
  }))

  // Ventas: el total (precio unitario × cantidad) lo calcula el builder, igual que finances-client.
  const ventas = (salesRes.data ?? []).map((v) => ({
    fecha: v.sale_date ?? '',
    descripcion: v.description ?? '',
    cantidad: Number(v.quantity),
    precioUnitario: Number(v.amount),
  }))

  // Egresos: concepto = categoría, monto = amount.
  const egresos = (expRes.data ?? []).map((e) => ({
    fecha: e.expense_date ?? '',
    categoria: e.category ?? '',
    monto: Number(e.amount),
  }))

  const fecha = new Date().toISOString().slice(0, 10)
  const bytes = await workbookToBytes(buildFinancesWorkbook({ turnos, ventas, egresos }))

  // no-store: datos del negocio; que ninguna caché intermedia se quede con una copia (T-q-07).
  return new Response(bytes, {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="finanzas-${business.slug}-${fecha}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
