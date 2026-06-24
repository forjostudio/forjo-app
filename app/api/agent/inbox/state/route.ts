import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeArWhatsApp } from '@/lib/whatsapp'
import { agentAuthOk } from '@/lib/agent-auth'
import type { NextRequest } from 'next/server'

// ── Estado de atención para el polling del bot (Phase 6, Plan 01, D-03) ───────────────────────────
// El bot consulta este endpoint por slug+phone para saber si debe PAUSAR: si handled_by='human', un
// operador tomó la conversación y el bot pasa a Modo Humano. Mismo auth fail-closed que el ingest (el
// bot solo tiene el token compartido, sin sesión). Espejo de booking/availability: service-role por
// slug, force-dynamic, searchParams síncrono.
export const dynamic = 'force-dynamic'

// Auth FAIL-CLOSED compartido con el ingest (lib/agent-auth.ts): secreto ausente → 401, comparación
// constant-time (WR-02 / IN-03).

export async function GET(request: NextRequest) {
  if (!agentAuthOk(request)) return new Response('Unauthorized', { status: 401 })

  const slug = request.nextUrl.searchParams.get('slug') || ''
  const phone = request.nextUrl.searchParams.get('phone') || ''
  if (!slug || !phone) return Response.json({ ok: false, error: 'missing_params' }, { status: 400 })

  const supabase = createAdminClient()

  // slug → business_id (tenant del slug validado, no del query arbitrario).
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('slug', slug)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // Teléfono normalizado para matchear el contact_phone (se guarda normalizado en el ingest).
  const normalizedPhone = normalizeArWhatsApp(phone) ?? phone

  // El índice único es (business_id, channel, contact_phone): incluimos channel para que el lookup
  // matchee la tupla completa y .maybeSingle() siga siendo total cuando se agregue un 2do canal (mail
  // diferido). Sin channel, dos filas podrían compartir (business_id, contact_phone) y maybeSingle()
  // lanzaría, rompiendo la pausa del bot (fail-open) (WR-04).
  const { data: convo } = await supabase
    .from('conversations')
    .select('handled_by')
    .eq('business_id', business.id)
    .eq('channel', 'whatsapp')
    .eq('contact_phone', normalizedPhone)
    .maybeSingle()

  // Sin conversación todavía → handled_by null (el bot sigue en Modo IA; no hay nada que pausar).
  return Response.json(
    { ok: true, handled_by: convo?.handled_by ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
