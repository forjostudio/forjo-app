import { createAdminClient } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'

const MP_API = 'https://api.mercadopago.com'

export async function POST(request: NextRequest) {
  try {
    const { appointmentId, businessSlug } = await request.json()
    if (!appointmentId || !businessSlug) {
      return Response.json({ ok: false, error: 'Faltan datos' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: business } = await supabase
      .from('businesses')
      .select('*')
      .eq('slug', businessSlug)
      .single()

    if (!business) {
      return Response.json({ ok: false, error: 'Negocio no encontrado' }, { status: 404 })
    }
    if (!business.mp_access_token) {
      return Response.json({ ok: false, error: 'El negocio no tiene MercadoPago configurado' }, { status: 400 })
    }

    const { data: appt } = await supabase
      .from('appointments')
      .select('*, services(name, price)')
      .eq('id', appointmentId)
      .single()

    if (!appt) {
      return Response.json({ ok: false, error: 'Turno no encontrado' }, { status: 404 })
    }

    const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
    const amount = Number(business.deposit_amount)
    if (!amount || amount <= 0) {
      return Response.json({ ok: false, error: 'El monto de la seña no es válido' }, { status: 400 })
    }
    const expiryHours = Number(business.deposit_expiry_hours) || 1
    const serviceName = (appt.services as { name?: string } | null)?.name || 'Servicio'
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000)
    const descriptor = business.name
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .substring(0, 22) || 'FORJO'

    const mpRes = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${business.mp_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{
          title: `Seña — ${serviceName} · ${business.name}`,
          quantity: 1,
          unit_price: amount,
          currency_id: 'ARS',
        }],
        payer: {
          name: appt.client_name,
          email: appt.client_email || 'cliente@forjo.studio',
        },
        back_urls: {
          success: `${BASE_URL}/${businessSlug}/pago/exitoso`,
          failure: `${BASE_URL}/${businessSlug}/pago/fallido`,
          pending: `${BASE_URL}/${businessSlug}/pago/pendiente`,
        },
        auto_return: 'approved',
        notification_url: `${BASE_URL}/api/payment/webhook/${businessSlug}`,
        external_reference: String(appointmentId),
        statement_descriptor: descriptor,
        expires: true,
        expiration_date_to: expiresAt.toISOString(),
      }),
    })

    const preference = await mpRes.json()

    if (!preference.init_point) {
      console.error('MP preference error:', JSON.stringify(preference))
      return Response.json({ ok: false, error: 'Error al crear el pago en MercadoPago' }, { status: 500 })
    }

    await supabase
      .from('appointments')
      .update({ expires_at: expiresAt.toISOString(), deposit_amount: amount })
      .eq('id', appointmentId)

    return Response.json({ ok: true, url: preference.init_point })
  } catch (e: unknown) {
    console.error('Payment create error:', e)
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
