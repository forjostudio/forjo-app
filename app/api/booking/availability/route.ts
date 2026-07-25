import { createAdminClient } from '@/lib/supabase/admin'
import { professionalsForService } from '@/lib/staff-services'
import type { Professional, ProfessionalService } from '@/lib/types'
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
  // Phase 10 ("Cualquiera"): la agregación across-staff se gatea con `any=1` + `serviceId`. El camino
  // específico/omitido (sin `any`) NO lee estos params y queda byte-idéntico (DISP-02/D-08). Canchas
  // nunca manda `any=1` (D-09).
  const any = searchParams.get('any') === '1'
  const serviceIdParam = searchParams.get('serviceId') || ''
  if (!slug || !date) {
    return Response.json({ ok: false, error: 'missing_params' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // buffer_minutes se suma al select para la rama `any` (freeness con descanso entre turnos); el camino
  // específico NO lo usa → su respuesta no cambia (traer una columna extra no toca `busy`/`full`).
  const { data: business } = await supabase
    .from('businesses')
    .select('id, buffer_minutes')
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

  // ── RAMA "Cualquiera" (Phase 10, DISP-01/03, D-06): agregación de disponibilidad across-staff ──────
  // Gateada por `any=1` + `serviceId`. Retorna ANTES de tocar el bucketing específico de abajo, así que
  // el camino de hoy (professionalId concreto / omitido) queda BYTE-IDÉNTICO (DISP-02/D-08).
  //
  // Por qué una rama y no reusar el bucket: "sin preferencia" cae al bucket SENTINEL (turnos con
  // professional_id NULL); en multi-staff los turnos están bucketeados por cada pro real → SENTINEL
  // estaría vacío y "Cualquiera" mostraría todo libre (Pitfall 1). La agregación real es la UNIÓN de
  // disponibilidad de los capaces (un slot libre si AL MENOS UNO lo tiene libre), no un bucket.
  //
  // Por qué se devuelve en `full` y NO concatenando `busy`: el client aplica `busy` como solape
  // (bloquea si CUALQUIER entrada solapa) → concatenar los `busy` de todos los pros daría la
  // INTERSECCIÓN ("bloqueado si algún pro ocupado"), lo OPUESTO a la unión DISP-01. Por eso la unión se
  // computa server-side a nivel de start-time: un start-time va a `full` (oculto) sólo si NINGÚN capaz
  // lo tiene libre. `full` ya es booleano-por-slot → no filtra nada nuevo (D-06): jamás counts, jamás
  // per-pro, jamás qué agenda bloqueó.
  if (any && serviceIdParam) {
    // 1. Duración del servicio, re-validada por business_id (anti-tampering aunque sea read: nunca
    //    confiar en un serviceId ajeno). Sin service de este negocio → invalid_service (400).
    const { data: svc } = await supabase
      .from('services')
      .select('duration_minutes')
      .eq('id', serviceIdParam)
      .eq('business_id', business.id)
      .single()
    if (!svc) return Response.json({ ok: false, error: 'invalid_service' }, { status: 400 })
    const dur = Number(svc.duration_minutes) || 30
    const buffer = Number(business.buffer_minutes) || 0

    // 2. Profesionales CAPACES, espejando EXACTO el criterio de candidatos del RPC 058 (058:88-130):
    //    active=true AND service_id IS NULL (excluir canchas — Pitfall 6) AND capacidad por comodín.
    //    La regla del comodín (0 filas = capaz de todo) la resuelve `professionalsForService`
    //    (lib/staff-services.ts) — fuente ÚNICA, NO reimplementar la regla acá. NO se filtra por sede:
    //    el front no manda location y esta rama no la recibe (divergencia aceptada, RESEARCH A3);
    //    el RPC sí filtra por sede y es la autoridad → un slot puntual raro puede caer en slot_taken.
    const { data: prosRaw } = await supabase
      .from('professionals')
      .select('id')
      .eq('business_id', business.id)
      .eq('active', true)
      .is('service_id', null)
    const { data: bridgeRaw } = await supabase
      .from('professional_services')
      .select('business_id, professional_id, service_id')
      .eq('business_id', business.id)
    const capaces = professionalsForService(
      serviceIdParam,
      (prosRaw || []) as unknown as Professional[],
      (bridgeRaw || []) as unknown as ProfessionalService[],
    )
    // Sin capaces (no debería pasar si el front gatea con ≥2, pero es superficie anónima): todo oculto.
    // Igual el create está respaldado por el RPC (RAISE slot_taken → 409) si alguien fuerza la request.

    // 3. Turnos vivos del negocio+fecha (ya traídos), bucketeados por professional_id REAL (no SENTINEL).
    const nowMsAny = Date.now()
    const liveAll = (appts || []).filter(
      a => a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at as string).getTime() > nowMsAny,
    )
    const liveByPro = new Map<string, typeof liveAll>()
    for (const a of liveAll) {
      const key = (a.professional_id as string | null) ?? SENTINEL
      const arr = liveByPro.get(key)
      if (arr) arr.push(a)
      else liveByPro.set(key, [a])
    }

    // Espacio compartido (ESPACIO-02): computado POR-PRO. Un capaz cuyo espacio físico ya está ocupado
    // por una agenda hermana en un horario solapado NO cuenta como libre. Se resuelve el mapa de
    // espacios del negocio en UNA query y se derivan las agendas hermanas de cada capaz en memoria.
    const { data: allSpaces } = await supabase
      .from('agenda_spaces')
      .select('professional_id, space_id')
      .eq('business_id', business.id)
    const spacesByPro = new Map<string, Set<string>>()
    const prosBySpace = new Map<string, Set<string>>()
    for (const s of allSpaces || []) {
      const pid = s.professional_id as string
      const sid = s.space_id as string
      ;(spacesByPro.get(pid) ?? spacesByPro.set(pid, new Set()).get(pid)!).add(sid)
      ;(prosBySpace.get(sid) ?? prosBySpace.set(sid, new Set()).get(sid)!).add(pid)
    }
    // Para cada capaz: el set de professional_id de las agendas HERMANAS (comparten ≥1 espacio), sin sí mismo.
    const siblingsByPro = new Map<string, Set<string>>()
    for (const pro of capaces) {
      const mySpaces = spacesByPro.get(pro.id)
      if (!mySpaces || mySpaces.size === 0) continue
      const sibs = new Set<string>()
      for (const sid of mySpaces) {
        for (const other of prosBySpace.get(sid) || []) {
          if (other !== pro.id) sibs.add(other)
        }
      }
      if (sibs.size > 0) siblingsByPro.set(pro.id, sibs)
    }

    // Solape con buffer (mismo criterio que el re-check del core, booking-core.ts:165-169): un turno
    // ocupa [inicio - buffer, fin + buffer). `a.time` viene como 'HH:MM:SS'; toMin tolera los segundos.
    const overlaps = (a: { time: string; duration_minutes: number | null }, t: number) => {
      const aStart = toMin(a.time)
      const aEnd = aStart + Number(a.duration_minutes || 30)
      return t < aEnd + buffer && t + dur > aStart - buffer
    }
    const minToHHMM = (t: number) =>
      `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`

    // 4. Enumerar la grilla semanal del `dow` a paso = duración (misma fórmula que el client:
    //    for (t = open; t + dur <= close; t += dur) sobre los bloques del día). Para cada start-time,
    //    un capaz está LIBRE si: (individual, cap<=1) ningún turno vivo suyo solapa [t,t+dur) con
    //    buffer; (grupal, cap>1) su conteo en el slot exacto < capacity; Y su espacio no está bloqueado
    //    por una hermana. El slot es agregado-disponible si AL MENOS UN capaz está libre; si NINGUNO,
    //    va a `full` (en 'HH:MM'). (Caveat RESEARCH: horarios especiales que EXTIENDEN el día quedan
    //    respaldados por el RPC — devuelve slot_taken si no hay capaz libre; aceptable.)
    const startSet = new Set<string>()
    for (const b of capBlocks || []) {
      const open = toMin(b.start_time)
      const close = toMin(b.end_time)
      for (let t = open; t + dur <= close; t += dur) startSet.add(minToHHMM(t))
    }
    const fullAny: string[] = []
    for (const hhmm of startSet) {
      const t = toMin(hhmm)
      const cap = capacityFor(hhmm)
      const someoneFree = capaces.some(pro => {
        const proAppts = liveByPro.get(pro.id) || []
        if (cap <= 1) {
          // Individual: cualquier solape (duración variable) con buffer bloquea al pro.
          if (proAppts.some(a => overlaps(a, t))) return false
        } else {
          // Grupal (cupo): sólo bloquea si el pro ya llenó el slot EXACTO (count >= capacity), igual
          // que `full` del camino de hoy. Un solape parcial NO cuenta (D-03, varios comparten el slot).
          const countExact = proAppts.filter(a => (a.time as string).slice(0, 5) === hhmm).length
          if (countExact >= cap) return false
        }
        // Espacio compartido: 1-a-la-vez, independiente de la capacity. Si una hermana ocupa el espacio
        // en un horario solapado, el pro no está libre (se mira sobre TODOS los turnos vivos del negocio).
        const sibs = siblingsByPro.get(pro.id)
        if (sibs && liveAll.some(a => sibs.has((a.professional_id as string | null) ?? SENTINEL) && overlaps(a, t))) {
          return false
        }
        return true
      })
      if (!someoneFree) fullAny.push(hhmm)
    }

    // D-06 (LOCKED): `busy` SIEMPRE vacío en esta rama; la unión colapsa a booleano-por-slot en `full`.
    return Response.json({ ok: true, busy: [], full: fullAny }, { headers: { 'Cache-Control': 'no-store' } })
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
