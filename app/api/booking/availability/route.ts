import { createAdminClient } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'

// Disponibilidad SIEMPRE fresca: nunca cachear (ni framework ni CDN ni browser). Un turno
// recién tomado tiene que verse ocupado en la próxima consulta.
export const dynamic = 'force-dynamic'

// Sentinela para el "sin profesional": debe coincidir con el COALESCE del índice 011 para
// que la disponibilidad y la constraint hablen el mismo idioma (cada profesional —y el "sin
// preferencia"— tiene su propia agenda).
const SENTINEL = '00000000-0000-0000-0000-000000000000'

// Disponibilidad pública de un negocio para una fecha (y profesional). El anon NO puede leer
// appointments (RLS), así que la disponibilidad la sirve este endpoint con service role,
// devolviendo solo time/status/expires_at/duration_minutes (la duración hace falta para el
// cálculo de solapamiento; NO es dato del cliente) — NUNCA nombre/teléfono/email del cliente.
// Lookup por slug → aislamiento por tenant.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug') || ''
  const date = searchParams.get('date') || ''
  const professionalId = searchParams.get('professionalId') // ausente/'none' = sin preferencia
  if (!slug || !date) {
    return Response.json({ ok: false, error: 'missing_params' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('slug', slug)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // Turnos que ocupan slots: confirmed + pending_payment (consistente con el índice 011).
  const { data: appts, error } = await supabase
    .from('appointments')
    .select('time, status, expires_at, professional_id, duration_minutes')
    .eq('business_id', business.id)
    .eq('date', date)
    .in('status', ['confirmed', 'pending_payment'])

  if (error) {
    console.error('[booking/availability] error:', error.message)
    return Response.json({ ok: false, error: 'query_failed' }, { status: 500 })
  }

  // Capacity por slot: vive en la plantilla semanal (time_blocks), no en el turno. Se resuelve
  // por slot vía day_of_week (de la `date` consultada) + ventana [start_time, end_time). MISMA
  // convención de dow que EXTRACT(dow) de la DB y que book_slot_atomic: new Date('yyyy-MM-dd')
  // parsea a medianoche UTC → getUTCDay() (0=domingo..6=sábado) coincide con la DB.
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
  const { data: capBlocks } = await supabase
    .from('time_blocks')
    .select('start_time, end_time, capacity')
    .eq('business_id', business.id)
    .eq('day_of_week', dow)

  // capacityFor(time): MAX de la capacity de los bloques cuya ventana cubre el slot (consistente
  // con el COALESCE(MAX(tb.capacity), 1) del RPC). Sin bloque que lo cubra → 1 (individual).
  const toMin = (t: string) => {
    const [h, m] = t.split(':')
    return Number(h) * 60 + Number(m)
  }
  const capacityFor = (time: string) => {
    const tMin = toMin(time)
    let cap = 0
    for (const b of capBlocks || []) {
      if (toMin(b.start_time) <= tMin && tMin < toMin(b.end_time)) {
        cap = Math.max(cap, Number(b.capacity) || 1)
      }
    }
    return cap || 1
  }

  // Filtramos por bucket de profesional (coalesce sentinel) y descartamos pending_payment
  // vencidos (seña expirada libera el slot; el cron además los pasa a cancelled). No se
  // expone professional_id en la respuesta.
  const bucket = professionalId && professionalId !== 'none' ? professionalId : SENTINEL
  const nowMs = Date.now()
  const live = (appts || [])
    .filter(a => (a.professional_id ?? SENTINEL) === bucket)
    .filter(a => a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at as string).getTime() > nowMs)

  // ── Bloqueo acoplado por ESPACIO compartido (ESPACIO-02, read-path) ──────────────────
  // Si la agenda consultada comparte ≥1 espacio físico (cancha, sala) con otra agenda del MISMO
  // negocio, un turno de esa agenda hermana que solapa en tiempo bloquea este slot: el espacio
  // físico no se puede usar dos veces a la vez. El READ tiene que reflejarlo o el público vería
  // el slot libre y recibiría un rechazo confuso al reservar (la autoridad atómica es el RPC del
  // Plan 01; esto es el espejo de lectura). spaces/agenda_spaces NO tienen read anon (D-06): se
  // resuelven con el service-role ya creado (`supabase`), filtrando por business_id (tenant).
  //
  // Bidireccional: cae solo de la simetría del set de espacios. Si consulto la F11 ({A,B,C}), su
  // hermana B ({B}) entra; si consulto B, la F11 entra (ambas comparten B).
  const { data: mySpaces } = await supabase
    .from('agenda_spaces')
    .select('space_id')
    .eq('business_id', business.id)
    .eq('professional_id', bucket)
  let siblingBusy: { time: string; status: string; expires_at: string | null; duration_minutes: number | null }[] = []
  if (mySpaces && mySpaces.length > 0) {
    // Agendas hermanas: comparten ≥1 espacio con la consultada (excluye la propia agenda).
    const { data: sib } = await supabase
      .from('agenda_spaces')
      .select('professional_id')
      .eq('business_id', business.id)
      .in('space_id', mySpaces.map(s => s.space_id))
      .neq('professional_id', bucket)
    const siblingBuckets = new Set((sib || []).map(s => s.professional_id as string))
    // De los `appts` del negocio ya traídos (sin filtrar por bucket), tomar los que caen en una
    // agenda hermana y siguen vivos (mismo descarte de holds vencidos que `live`). El bloqueo de
    // espacio es un solape 1-a-la-vez (ocupás el espacio físico o no), INDEPENDIENTE de la capacity
    // de la agenda hermana: por eso va a `busy`, NUNCA a `full` (Pitfall 5 — `full` queda reservado
    // para count >= capacity del propio bucket, que es "cupo lleno", no "espacio ocupado").
    siblingBusy = (appts || [])
      .filter(a => siblingBuckets.has(a.professional_id ?? SENTINEL))
      .filter(a => a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at as string).getTime() > nowMs)
      .map(a => ({ time: a.time, status: a.status, expires_at: a.expires_at, duration_minutes: a.duration_minutes }))
  }
  // Una agenda SIN espacios mapeados → siblingBusy = [] (skip total): disponibilidad byte-idéntica
  // a la de antes (cupos/individual intactos).

  // `busy` SOLO refleja ocupación de slots INDIVIDUALES (capacity 1): ahí un turno que solapa
  // (incluso de duración variable) bloquea el horario — es el anti-doble-booking de v0.9 que el
  // client aplica como `conflict`. En slots GRUPALES (capacity > 1) la ocupación NO va a `busy`:
  // varios turnos en el MISMO horario son ESPERADOS (D-03, duración fija) y NO son conflicto; la
  // ÚNICA condición de bloqueo del grupo es `full` (count >= capacity). Sin este filtro, el
  // `conflict` por solapamiento del client borraría un slot grupal con 1/N ocupado ANTES de que
  // `full` aplique → el público no podría reservar el 2º+ lugar de una clase (bug de cupos).
  const busy = live
    .filter(a => capacityFor(a.time) <= 1)
    .map(a => ({ time: a.time, status: a.status, expires_at: a.expires_at, duration_minutes: a.duration_minutes }))
    // Mergear el bloqueo por espacio compartido (solape 1-a-la-vez). Va en `busy` y NUNCA en `full`:
    // el client lo trata como `conflict` (horario no disponible), igual que un slot individual ocupado.
    // D-06 (LOCKED): la respuesta NO cambia de forma — sigue `{ ok, busy, full }` con las mismas claves.
    // El público no puede inferir QUÉ agenda hermana bloqueó ni cuántos espacios hay (cada entrada de
    // siblingBusy expone solo time/status/expires_at/duration_minutes, idéntico a una entrada normal).
    .concat(siblingBusy)

  // Ocupación por slot vs capacity → `full` (solo la lista de horarios llenos). MISMO bucket y
  // mismo descarte de holds vencidos que `busy`. D-06 (LOCKED): el público SOLO recibe libre/lleno;
  // NUNCA el conteo de ocupantes, ni los lugares restantes, ni una entrada por inscripto que
  // permita inferirlos. Por eso el conteo por horario colapsa a un booleano por slot
  // (count >= capacity) y jamás se serializa. Para capacity=1, `full` y `busy` coinciden.
  const countByTime = new Map<string, number>()
  for (const a of live) countByTime.set(a.time, (countByTime.get(a.time) ?? 0) + 1)
  const full = [...countByTime.entries()]
    .filter(([time, n]) => n >= capacityFor(time))
    // `a.time` viene de Postgres como 'HH:MM:SS'; el client arma los slots con minutesToTime → 'HH:MM'
    // y compara con `full.includes(time)` (igualdad de string). Sin normalizar, '09:00' nunca matchea
    // '09:00:00' y el slot LLENO seguiría ofreciéndose. `busy` no sufría esto porque se compara por
    // minutos (timeToMinutes tolera los segundos); `full` es comparación literal, así que va en 'HH:MM'.
    .map(([time]) => time.slice(0, 5))

  return Response.json({ ok: true, busy, full }, { headers: { 'Cache-Control': 'no-store' } })
}
