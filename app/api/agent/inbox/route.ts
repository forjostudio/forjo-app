import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeArWhatsApp } from '@/lib/whatsapp'
import { inboundSchema, matchEntity } from '@/lib/conversations'
import type { NextRequest } from 'next/server'

// ── Ingest del bot de WhatsApp (Phase 6, Plan 01, D-05) ───────────────────────────────────────────
// El bot externo (whatsapp-ai-agent-kit, otro repo, VPS) POSTea cada mensaje acá. Es el ESPEJO del
// webhook de pago: el caller es input NO confiable (solo posee el token compartido, sin sesión
// Supabase), así que:
//   1) auth FAIL-CLOSED sobre FORJO_AGENT_TOKEN (secreto ausente → 401, NUNCA fail-open).
//   2) parseo defensivo + validación zod del body (no confiar en el shape del bot).
//   3) el tenant SALE DEL SLUG validado, NUNCA del body (anti-tampering, CLAUDE.md).
//   4) escritura con service-role + upsert idempotente (reintento del bot no duplica).
// Escribe SÍNCRONO (sin after()): el bot quiere que el 200 signifique "persistido" para su loop de
// reintento/idempotencia.
export const dynamic = 'force-dynamic'

// Auth FAIL-CLOSED: lee FORJO_AGENT_TOKEN; si no está seteado → false → 401 (igual que
// verifyMPSignature del webhook de pago, SIN rama `if (secret)` que abriría el endpoint en dev).
// El token es server-only (NO NEXT_PUBLIC_), igual que la service-role key.
function authOk(request: NextRequest): boolean {
  const expected = process.env.FORJO_AGENT_TOKEN
  if (!expected) return false // sin secreto configurado → rechazo (fail-closed)
  const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return Boolean(got) && got === expected
}

export async function POST(request: NextRequest) {
  // 1. Auth PRIMERO, antes de tocar el body (un POST forjado recibe 401 sin escribir nada).
  if (!authOk(request)) return new Response('Unauthorized', { status: 401 })

  // 2. Parseo defensivo del body.
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }

  // 3. Validación zod (no confiar en el shape del bot).
  const parsed = inboundSchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json({ ok: false, error: 'missing_fields' }, { status: 400 })
  }
  const msg = parsed.data

  const supabase = createAdminClient()

  // 4. slug → business_id (anti-tampering de tenant: el tenant NUNCA sale del body, sale del slug
  //    validado). Si el slug no existe → 404 (no se escribe nada).
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('slug', msg.slug)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // 5. Teléfono normalizado (mismo formato al guardar y al matchear). Si no se puede normalizar,
  //    usamos el crudo (igual hay que persistir el mensaje; el match solo no encuentra lead).
  const normalizedPhone = normalizeArWhatsApp(msg.contact.phone) ?? msg.contact.phone

  // 6. Asociación a un lead del pipeline por phone/email (best-effort, lead_id nullable). Leemos solo
  //    los leads con phone/email para el match en memoria (la lib es pura y testeada).
  const { data: leads } = await supabase.from('leads').select('id, whatsapp, email')
  const leadId = matchEntity({
    phone: normalizedPhone,
    email: msg.contact.email ?? null,
    leads: leads ?? [],
  })

  const sentAt = msg.sent_at ?? new Date().toISOString()

  // 7. Upsert conversation por (business_id, channel, contact_phone) → idempotente, sin race (NO
  //    check-then-insert). last_message_at se refresca con cada mensaje.
  const { data: convo, error: convoErr } = await supabase
    .from('conversations')
    .upsert(
      {
        business_id: business.id,
        channel: 'whatsapp',
        contact_phone: normalizedPhone,
        contact_name: msg.contact.name ?? null,
        lead_id: leadId,
        last_message_at: sentAt,
      },
      { onConflict: 'business_id,channel,contact_phone' },
    )
    .select('id')
    .single()
  if (convoErr || !convo) {
    console.error('[agent/inbox] conversation upsert error:', convoErr?.message)
    return Response.json({ ok: false, error: 'insert_failed' }, { status: 500 })
  }

  // 8. Upsert message idempotente por external_id (reintento del bot → ignoreDuplicates, no duplica).
  //    business_id denormalizado (copiado del business validado) para que la RLS sea byte-idéntica a
  //    conversations (Pitfall 2).
  const { error: msgErr } = await supabase.from('messages').upsert(
    {
      conversation_id: convo.id,
      business_id: business.id,
      external_id: msg.external_id,
      direction: msg.direction,
      sender: msg.sender,
      body: msg.body,
      sent_at: sentAt,
    },
    { onConflict: 'external_id', ignoreDuplicates: true },
  )
  if (msgErr) {
    console.error('[agent/inbox] message upsert error:', msgErr.message)
    return Response.json({ ok: false, error: 'insert_failed' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
