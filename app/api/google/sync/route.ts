import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEventStatuses } from '@/lib/google-calendar'
import { sendBusinessCancelEmail } from '@/lib/email'

// Sincronización inversa Google Calendar → panel: si el dueño borró o canceló el evento de un
// turno en su calendario, cancelamos ese turno en el panel (y avisamos al cliente). Solo
// turnos futuros activos con google_event_id. Lo dispara el botón "Sincronizar" en Agenda.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, slug, primary_color, logo_url, whatsapp, resend_api_key, resend_from, google_refresh_token')
    .eq('owner_id', user.id)
    .single()
  if (!business?.google_refresh_token) {
    return NextResponse.json({ ok: false, error: 'not_connected' }, { status: 400 })
  }

  const admin = createAdminClient()
  const todayStr = new Date().toISOString().slice(0, 10)
  const { data: appts } = await admin
    .from('appointments')
    .select('id, date, time, client_name, client_email, google_event_id, deposit_paid, deposit_amount, services(name)')
    .eq('business_id', business.id)
    .not('google_event_id', 'is', null)
    .in('status', ['confirmed', 'pending_payment'])
    .gte('date', todayStr)

  const list = appts || []
  if (list.length === 0) return NextResponse.json({ ok: true, cancelled: 0 })

  const statuses = await getEventStatuses(business.google_refresh_token, list.map(a => a.google_event_id as string))

  let cancelled = 0
  for (const a of list) {
    const st = statuses[a.google_event_id as string]
    // Solo actuamos ante señal clara de que el evento ya no está; null = no se pudo verificar.
    if (st !== 'deleted' && st !== 'cancelled') continue

    const { data: updated } = await admin
      .from('appointments')
      .update({ status: 'cancelled', google_event_id: null })
      .eq('id', a.id)
      .eq('business_id', business.id)
      .in('status', ['confirmed', 'pending_payment'])
      .select('id')
    if (!updated || updated.length === 0) continue
    cancelled++

    // Aviso al cliente: el negocio canceló el turno (lo borró de su agenda). Best-effort.
    if (a.client_email) {
      try {
        await sendBusinessCancelEmail({
          to: a.client_email,
          clientName: a.client_name,
          service: (a.services as { name?: string } | null)?.name || '',
          date: a.date,
          time: a.time,
          businessName: business.name || '',
          businessSlug: business.slug || '',
          primaryColor: business.primary_color,
          logoUrl: business.logo_url,
          whatsapp: business.whatsapp,
          depositPaid: a.deposit_paid as boolean,
          depositAmount: Number(a.deposit_amount || 0),
          resendApiKey: business.resend_api_key,
          resendFrom: business.resend_from,
        })
      } catch (e) {
        console.error(`[google/sync] email cancelación FALLÓ (turno ${a.id}):`, e instanceof Error ? e.message : e)
      }
    }
  }

  return NextResponse.json({ ok: true, cancelled })
}
