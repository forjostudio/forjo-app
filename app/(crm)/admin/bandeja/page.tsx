import { createClient } from '@/lib/supabase/server'
import { BandejaClient, type ConversationRow } from './bandeja-client'

/**
 * Bandeja del operador (COMMS-01/COMMS-02, UI-SPEC §"Bandeja", mock crm-design/07-bandeja.png).
 *
 * Lee `conversations` (+ `messages` y el nombre del negocio) con la SESIÓN del operador
 * (`createClient()` → anon key + cookies), NUNCA con el cliente service-role. La garantía de
 * aislamiento es la RLS MIXTA de la migración 038: dos policies permissive de SELECT que Postgres
 * OR-ea — owner (su business_id) O admin (app_metadata.is_admin === 'true'). El override admin vive
 * en la policy, NO en el cliente. Leer con el cliente service-role (admin) bypassaría la RLS y
 * expondría las conversaciones de TODOS los tenants sin pasar por el gate (Pitfall 1, threat T-06-05,
 * documentado igual en auditoria/page.tsx) — por eso se evita explícitamente en lectura.
 *
 * Defensa en profundidad: el layout `(crm)` ya redirige a un no-admin antes de este render; aun si
 * llegara, la RLS no le devolvería filas.
 *
 * Scope: en v1 las filas las escribe el bot externo vía /api/agent/inbox (06-01). Hasta que sincronice
 * datos reales, la bandeja muestra el empty state honesto (no un crash) — lo cubre el cliente.
 */
export default async function BandejaPage() {
  const supabase = await createClient()

  // SELECT explícito (sin comodín) de las conversaciones + el nombre del negocio asociado (join
  // embebido, mismo session client → la RLS de businesses ya gatea). Orden por última actividad desc.
  const { data: convData, error: convError } = await supabase
    .from('conversations')
    .select('id, business_id, contact_name, contact_phone, handled_by, unread_count, last_message_at, businesses(name)')
    .order('last_message_at', { ascending: false })
    .limit(100)

  if (convError) {
    console.error('[crm/bandeja] read error:', convError.message)
  }

  const convRows = convData ?? []

  // Mensajes de las conversaciones cargadas (mismo session client → RLS mixta de 038). SELECT explícito
  // sin comodín, ordenado por sent_at asc para renderizar el thread cronológico. Limitado al universo de
  // conversaciones ya leídas (`.in('conversation_id', ids)`) para no traer mensajes de hilos fuera de vista.
  const convIds = convRows.map((c) => c.id)
  let msgData:
    | {
        id: string
        conversation_id: string
        direction: string
        sender: string
        body: string
        sent_at: string
      }[]
    | null = null
  let msgError: { message: string } | null = null
  if (convIds.length > 0) {
    const res = await supabase
      .from('messages')
      .select('id, conversation_id, direction, sender, body, sent_at')
      .in('conversation_id', convIds)
      .order('sent_at', { ascending: true })
      .limit(500)
    msgData = res.data
    msgError = res.error
    if (msgError) {
      console.error('[crm/bandeja] messages read error:', msgError.message)
    }
  }

  // Normalizar las filas a snake_case (convención del proyecto) + derivar business_name del join y el
  // preview del último mensaje por conversación. El join embebido de Supabase devuelve `businesses` como
  // objeto (o null); se aplana a `business_name`.
  const messagesByConv = new Map<string, ConversationRow['messages']>()
  for (const m of msgData ?? []) {
    const list = messagesByConv.get(m.conversation_id) ?? []
    list.push({
      id: m.id,
      direction: m.direction === 'outbound' ? 'outbound' : 'inbound',
      sender: m.sender === 'ai' ? 'ai' : m.sender === 'human' ? 'human' : 'contact',
      body: m.body,
      sent_at: m.sent_at,
    })
    messagesByConv.set(m.conversation_id, list)
  }

  const rows: ConversationRow[] = convRows.map((c) => {
    // `businesses` del join embebido: objeto { name } o null (Supabase lo tipa como relación).
    const biz = c.businesses as { name: string | null } | { name: string | null }[] | null
    const businessName = Array.isArray(biz) ? biz[0]?.name ?? null : biz?.name ?? null
    const messages = messagesByConv.get(c.id) ?? []
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
    return {
      id: c.id,
      business_id: c.business_id,
      contact_name: c.contact_name,
      contact_phone: c.contact_phone,
      handled_by: c.handled_by === 'human' ? 'human' : c.handled_by === 'unassigned' ? 'unassigned' : 'ai',
      unread_count: c.unread_count ?? 0,
      last_message_at: c.last_message_at,
      business_name: businessName,
      last_message_preview: lastMessage?.body ?? null,
      messages,
    }
  })

  return <BandejaClient rows={rows} loadError={Boolean(convError || msgError)} />
}
