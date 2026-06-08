import { createAdminClient } from '@/lib/supabase/admin'
import { verifyRecaptcha } from '@/lib/recaptcha'

// Mismo sentinela que el índice 011 / el endpoint de disponibilidad.
const SENTINEL = '00000000-0000-0000-0000-000000000000'

// Creación de un turno PÚBLICO server-side. Reemplaza el insert directo con anon key.
// Cierra de una: reCAPTCHA fail-closed (no bypasseable desde el cliente), validación de que
// service/professional sean del negocio (anti-tampering de tenant), re-check de disponibilidad
// y, como respaldo atómico ante la carrera, captura del 23505 del índice anti doble-booking.
// service role server-only; el negocio se resuelve por slug → aislamiento por tenant.
export async function POST(request: Request) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }
  const body = (raw ?? {}) as Record<string, unknown>
  const slug = typeof body.slug === 'string' ? body.slug : ''
  const serviceId = typeof body.serviceId === 'string' ? body.serviceId : ''
  const professionalId = typeof body.professionalId === 'string' ? body.professionalId : null
  const date = typeof body.date === 'string' ? body.date : ''
  const time = typeof body.time === 'string' ? body.time : ''
  const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : ''
  const clientPhone = typeof body.clientPhone === 'string' && body.clientPhone.trim() ? body.clientPhone.trim() : null
  const clientEmail = typeof body.clientEmail === 'string' && body.clientEmail.trim() ? body.clientEmail.trim() : null
  const recaptchaToken = typeof body.recaptchaToken === 'string' ? body.recaptchaToken : ''

  if (!slug || !serviceId || !date || !time || !clientName) {
    return Response.json({ ok: false, error: 'missing_fields' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Negocio por slug (tenant).
  const { data: business } = await supabase
    .from('businesses')
    .select('id, require_deposit, deposit_amount')
    .eq('slug', slug)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  const requireDeposit = Boolean(business.require_deposit) && Number(business.deposit_amount) > 0

  // reCAPTCHA fail-closed, salvo flujo con seña (ahí el gate es el pago, igual que hoy).
  if (!requireDeposit) {
    const rc = await verifyRecaptcha({ token: recaptchaToken, slug })
    if (!rc.ok) {
      return Response.json({ ok: false, error: 'recaptcha_failed', reason: rc.reason }, { status: 403 })
    }
  }

  // Anti-tampering de tenant: el servicio debe ser de ESTE negocio y estar activo. De acá
  // sale la duración real (no se confía en nada del cliente).
  const { data: service } = await supabase
    .from('services')
    .select('id, active')
    .eq('id', serviceId)
    .eq('business_id', business.id)
    .single()
  if (!service || service.active === false) {
    return Response.json({ ok: false, error: 'invalid_service' }, { status: 400 })
  }

  // El profesional (si se eligió) también debe ser del negocio.
  let proId: string | null = null
  if (professionalId && professionalId !== 'none') {
    const { data: pro } = await supabase
      .from('professionals')
      .select('id')
      .eq('id', professionalId)
      .eq('business_id', business.id)
      .single()
    if (!pro) return Response.json({ ok: false, error: 'invalid_professional' }, { status: 400 })
    proId = pro.id
  }

  // Re-check de disponibilidad (exact-start, consistente con el índice 011). Bucket de
  // profesional por coalesce(sentinel). pending_payment vencido NO ocupa.
  const bucket = proId ?? SENTINEL
  const nowMs = Date.now()
  const { data: clashes } = await supabase
    .from('appointments')
    .select('status, expires_at, professional_id')
    .eq('business_id', business.id)
    .eq('date', date)
    .eq('time', time)
    .in('status', ['confirmed', 'pending_payment'])

  const taken = (clashes || [])
    .filter(a => (a.professional_id ?? SENTINEL) === bucket)
    .some(a => a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at as string).getTime() > nowMs)
  if (taken) {
    return Response.json({ ok: false, error: 'slot_taken' }, { status: 409 })
  }

  const initialStatus = requireDeposit ? 'pending_payment' : 'confirmed'

  const { data: client } = await supabase
    .from('clients')
    .insert({ business_id: business.id, name: clientName, phone: clientPhone, email: clientEmail })
    .select('id')
    .single()

  // Insert del turno. El índice 011 es el respaldo ATÓMICO: si dos requests pasan el re-check
  // en la misma carrera, Postgres rechaza el segundo con 23505 y lo traducimos a slot_taken.
  const { data: appt, error: insertErr } = await supabase
    .from('appointments')
    .insert({
      business_id: business.id,
      client_id: client?.id || null,
      client_name: clientName,
      client_phone: clientPhone,
      client_email: clientEmail,
      service_id: service.id,
      professional_id: proId,
      date,
      time,
      status: initialStatus,
    })
    .select('id')
    .single()

  if (insertErr || !appt) {
    if (insertErr?.code === '23505') {
      return Response.json({ ok: false, error: 'slot_taken' }, { status: 409 })
    }
    console.error('[booking/create] insert error:', insertErr?.message)
    return Response.json({ ok: false, error: 'insert_failed' }, { status: 500 })
  }

  return Response.json({ ok: true, appointmentId: appt.id, requiresPayment: requireDeposit })
}
