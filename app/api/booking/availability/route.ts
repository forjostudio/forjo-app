import { createAdminClient } from '@/lib/supabase/admin'
import { professionalsForService } from '@/lib/staff-services'
import { startTimesNotOffered, type BlockWindow } from '@/lib/time-block-services'
import type { Professional, ProfessionalService, TimeBlockService } from '@/lib/types'
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
  // Phase 10 ("Cualquiera"): la agregación across-staff se gatea con `any=1` + `serviceId`. Canchas
  // nunca manda `any=1` (D-09).
  // (Phase 15 / migr. 068) `serviceId` ya NO es exclusivo de la agregación ni del recurso simultáneo:
  // el camino ESPECÍFICO también lo manda, porque el cupo pasó a ser del servicio y sin saber cuál es
  // el endpoint no puede decidir lleno/libre. Sin `serviceId` se cae al fallback de cupo 1 (el camino
  // más restrictivo), que es lo que corresponde a canchas y a los clientes viejos.
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

  // ── Servicio consultado: UNA sola resolución, izada (Phase 15 / migr. 068) ────────────────────
  // Antes había DOS consultas casi idénticas a `services` (una en la rama "Cualquiera", otra en la
  // del recurso simultáneo). Se unifican acá porque desde la 068 el cupo es del SERVICIO en los tres
  // modos, así que TODO el endpoint —no solo esas dos ramas— necesita la fila.
  // Se conserva EXACTO lo que las dos hacían: anti-tampering aunque sea un read (`business_id`, un
  // serviceId de otro negocio simplemente no resuelve) y `invalid_service` con 400.
  let svc: { duration_minutes: number | null; capacity_mode: string | null; capacity: number | null } | null = null
  if (serviceIdParam) {
    const { data: svcRow } = await supabase
      .from('services')
      .select('duration_minutes, capacity_mode, capacity')
      .eq('id', serviceIdParam)
      .eq('business_id', business.id)
      .single()
    if (!svcRow) return Response.json({ ok: false, error: 'invalid_service' }, { status: 400 })
    svc = svcRow
  }

  // Cupo del slot: CONSTANTE por request, no función del horario. Desde la migr. 068 el número lo
  // declara el SERVICIO en los tres modos (individual / group_class / simultaneous_resource) y
  // `book_slot_atomic` dejó de consultar `time_blocks.capacity` — este valor es el espejo de lectura
  // del mismo número que decide el motor.
  // FALLBACK 1 cuando no llegó `serviceId`: es el camino MÁS RESTRICTIVO (todo solape bloquea) y es
  // exactamente lo que corresponde a los dos callers que no lo mandan — canchas (cuyo servicio es de
  // cupo fijo 1, así que el resultado es byte-idéntico) y cualquier cliente viejo. Fallar hacia el
  // lado restrictivo es DELIBERADO: sobre-ofrecer un horario produce un rechazo en el `create`
  // (el público reserva y recibe un error), sub-ofrecerlo solo esconde un slot.
  const slotCapacity = Number(svc?.capacity) || 1

  // Turnos que ocupan slots: confirmed + pending_payment (consistente con el índice 011).
  // `service_id` se suma para la rama de RECURSO SIMULTÁNEO (Phase 12): ahí el cupo se cuenta por
  // solape entre turnos del MISMO servicio. Es aditivo — NUNCA se serializa en la respuesta (el
  // público sigue recibiendo solo time/status/expires_at/duration_minutes).
  const { data: appts, error } = await supabase
    .from('appointments')
    .select('time, status, expires_at, professional_id, duration_minutes, service_id')
    .eq('business_id', business.id)
    .eq('date', date)
    .in('status', ['confirmed', 'pending_payment'])

  if (error) {
    console.error('[booking/availability] error:', error.message)
    return Response.json({ ok: false, error: 'query_failed' }, { status: 500 })
  }

  // Bloques del día (plantilla semanal): definen la VENTANA en que la agenda recibe turnos y de ahí
  // se enumera la grilla de start-times. Se resuelven por day_of_week de la `date` consultada, con la
  // MISMA convención de dow que EXTRACT(dow) de la DB: new Date('yyyy-MM-dd') parsea a medianoche UTC
  // → getUTCDay() (0=domingo..6=sábado) coincide con la DB.
  // ⚠ `capacity` YA NO SE TRAE (migr. 068): el cupo es del servicio y se resolvió arriba. Quitar la
  // columna del select es lo que garantiza que nadie la vuelva a leer por costumbre.
  // (migr. 071 / AGENDA-03) `id` SÍ se trae: es la clave con la que se cruza cada franja contra la
  // puente `time_block_services` para saber qué servicios se dan en ella. Sin el id no hay con qué
  // cruzar. Es aditivo — el id NUNCA se serializa en la respuesta (el público sigue recibiendo
  // exactamente `{ ok, busy, full }`).
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
  const { data: capBlocks, error: capBlocksErr } = await supabase
    .from('time_blocks')
    .select('id, start_time, end_time')
    .eq('business_id', business.id)
    .eq('day_of_week', dow)
  // ── WR-01 (auditoría de la Phase 18): degradar está bien; degradar MUDO no ──────────────────────
  // Acá el fail-safe correcto es el OPUESTO al del `create`: este endpoint sólo decide qué se OFRECE,
  // así que ante un error de query conviene ofrecer de más (el backstop del `create` es la autoridad
  // y rechaza lo que no corresponda) antes que apagarle la agenda a todo el mundo. Lo que NO es
  // aceptable es que se apague la feature sin dejar rastro: un `date` malformado (este endpoint no
  // tiene el guard de forma que sí tiene el `create`), un schema cache viejo o un permiso mal puesto
  // dejaban al dueño viendo su configuración guardada mientras el público seguía viendo todo, y sin
  // una sola línea de log con la que darse cuenta. Mismo patrón que la query de `appointments` de
  // este archivo.
  if (capBlocksErr) {
    console.error('[booking/availability] error leyendo time_blocks:', capBlocksErr.message)
  }

  const toMin = (t: string) => {
    const [h, m] = t.split(':')
    return Number(h) * 60 + Number(m)
  }

  // ── LA AGENDA POR SERVICIO en el read-path (Phase 18, AGENDA-03 / migr. 071) ────────────────────
  // Los horarios que hay que DEJAR DE OFRECER porque las franjas que los generan no dan el servicio
  // pedido. El peluquero que corta de 9 a 13 y hace color de 14 a 18 ya podía declararlo en el
  // modelo; acá es donde el público deja de ver color a las 10.
  //
  // ⚠ LA INTUICIÓN APUNTA AL LADO EQUIVOCADO. Este endpoint NO devuelve la grilla de horarios:
  // devuelve `busy` (ocupados) y `full` (la lista de horarios a OCULTAR); la grilla la arma el
  // cliente. Por eso *filtrar* los bloques —quedarse con los que dan el servicio— produciría MENOS
  // horarios ocultos, o sea que se ofrecerían MÁS: la regla al revés, y en silencio. La operación
  // correcta es SUMAR a `full`, y es una RESTA DE CONJUNTOS (un horario que también produce una
  // franja que SÍ da el servicio no se oculta, aunque otra franja solapada no lo dé).
  //
  // La regla del comodín NO se reimplementa acá (AGENDA-02): vive en `lib/time-block-services.ts`,
  // fuente ÚNICA que también consumen el backstop del `create` y el panel de la Phase 19 — tres
  // capas que TIENEN que interpretarla idéntico o derivan. Mismo criterio (y mismo molde de uso) que
  // `professionalsForService` unas líneas más abajo.
  //
  // Se calcula UNA VEZ acá arriba, antes de las ramas, porque las TRES lo necesitan igual y una de
  // ellas ("Cualquiera") retorna temprano. Una sola lectura de la puente por request.
  //
  // Dos fail-safes, los dos deliberados:
  //   - SIN `serviceId` no se lee la puente ni se oculta nada (AGENDA-04): canchas —que nunca lo
  //     manda— y cualquier cliente viejo reciben una respuesta byte-idéntica a la de hoy.
  //   - Con la puente VACÍA el helper devuelve `[]` por la regla del comodín, no por un atajo: el día
  //     de la migración TODOS los negocios tienen 0 filas ⇒ toda franja es comodín ⇒ nada cambia
  //     (D-02, la cero regresión es por construcción).
  //
  // Caveat CONOCIDO y aceptado (el mismo que ya carga este archivo para el eje del cupo): los
  // horarios ESPECIALES que EXTIENDEN la jornada viven en `schedule_exceptions`, no en `time_blocks`,
  // así que no generan candidatos acá y no se pueden ocultar por esta vía. Quién respalda ese caso es
  // el backstop del `create` (Plan 18-04) — y ahí, a propósito, un horario que no cae en NINGUNA
  // franja se ACEPTA (D-04): esta fase no introduce validación general de ventana.
  let notOffered: string[] = []
  if (svc && serviceIdParam) {
    // Aislamiento por tenant EXPLÍCITO aunque el cliente sea service-role (bypassa RLS): mismo
    // criterio que la lectura de `professional_services` de abajo. El `serviceIdParam` ya viene
    // re-validado por la resolución izada (un servicio de otro negocio cortó con invalid_service 400
    // antes de llegar acá), así que no se puede leer el mapeo de un tenant ajeno por ninguna de las
    // dos puntas.
    const { data: tbsRaw, error: tbsErr } = await supabase
      .from('time_block_services')
      .select('business_id, time_block_id, service_id')
      .eq('business_id', business.id)
    // WR-01: si esta lectura falla, `tbsRaw` queda vacío y la regla del comodín devuelve `[]` — o sea
    // la feature se apaga y el público vuelve a ver todos los horarios. Es la degradación deseada
    // (ver el bloque de arriba), pero tiene que quedar registrada: es exactamente el síntoma de la
    // 071 aplicada sin `NOTIFY pgrst, 'reload schema'`, y sin este log es indistinguible de "todavía
    // no configuró nada".
    if (tbsErr) {
      console.error('[booking/availability] error leyendo time_block_services:', tbsErr.message)
    }
    notOffered = startTimesNotOffered(
      serviceIdParam,
      (capBlocks || []) as BlockWindow[],
      (tbsRaw || []) as TimeBlockService[],
      Number(svc.duration_minutes) || 30,
    )
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
  if (any && svc) {
    // 1. Duración del servicio, de la fila ya re-validada por business_id arriba (anti-tampering
    //    aunque sea read: nunca confiar en un serviceId ajeno). Sin service de este negocio la
    //    resolución izada YA cortó con invalid_service (400), ANTES de cualquier agregación.
    // T-12-11: el combo "Cualquiera" + CUPO > 1 no está soportado (D-13) y el write-path lo rechaza con
    // este mismo código (lib/booking-core.ts). El read-path TIENE que coincidir: servir acá la grilla
    // agregada sería ofrecerle al público horarios que después mueren en el create. El gate de UI del
    // selector es UX, no un control — este endpoint es anónimo y alcanzable directo, así que el rechazo
    // vive acá. Se corta ANTES de la agregación across-staff; el camino específico / canchas / sin
    // `any` no pasa por este bloque y queda byte-idéntico.
    //
    // (code-review de Phase 15, CR-02) El criterio pasa a ser el CUPO y no el MODO: desde la migr. 068
    // una CLASE GRUPAL de cupo >= 2 es declarable y tiene el MISMO problema que el recurso simultáneo
    // (la selección de candidatos del RPC no es capacity-aware). Peor todavía en este endpoint: la rama
    // `any` de abajo, para cap > 1, sólo cuenta ocupación en la hora de inicio EXACTA por profesional e
    // IGNORA los solapes, mientras el RPC excluye al pro por CUALQUIER solape ⇒ el read-path ofrecía lo
    // que el write-path no puede dar.
    if (Number(svc.capacity) > 1) {
      return Response.json({ ok: false, error: 'any_professional_unsupported' }, { status: 400 })
    }
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
      // (migr. 068) El cupo es del SERVICIO consultado, así que es el MISMO para todos los
      // start-times: la bifurcación de abajo se conserva tal cual, solo dejó de ser por horario.
      const cap = slotCapacity
      const someoneFree = capaces.some(pro => {
        const proAppts = liveByPro.get(pro.id) || []
        if (cap <= 1) {
          // Individual: cualquier solape (duración variable) con buffer bloquea al pro.
          if (proAppts.some(a => overlaps(a, t))) return false
        } else {
          // ⚠ (code-review de Phase 15, CR-02) RAMA HOY INALCANZABLE: el gate de arriba corta con 400
          // TODO servicio de cupo > 1, así que `cap` acá siempre es 1. Se conserva —sin "arreglarla"—
          // porque su lógica es justamente la que NO sirve: cuenta la hora de inicio EXACTA e ignora
          // los solapes, mientras el RPC excluye al profesional por CUALQUIER solape. Si alguna vez se
          // SOPORTA "Cualquiera" con cupo compartido, esto no se reactiva: hay que hacer capacity-aware
          // la selección de candidatos del RPC y recién ahí espejarla acá.
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
    // (AGENDA-03) `notOffered` se SUMA sin mutar `fullAny`: los horarios de las franjas que no dan el
    // servicio quedan indistinguibles de los llenos — mismo booleano, sin decir POR QUÉ (T-18-11).
    return Response.json({ ok: true, busy: [], full: fullAny.concat(notOffered) }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // ── RAMA "RECURSO SIMULTÁNEO" (Phase 12, CUPO-02/D-12): el grid se vuelve OVERLAP-AWARE ─────────
  // Un servicio `simultaneous_resource` (migr. 062) cuenta su cupo por SOLAPE de intervalos entre
  // turnos del MISMO service_id (2 camillas ⇒ 2 turnos escalonados en paralelo), NO por hora de
  // inicio exacta. Si el read-path no lo refleja, el público ve libre un horario que el RPC después
  // rechaza con slot_full — por eso el grid espeja el gate del RPC (062:309-322): mismo conjunto
  // (business_id + service_id + date + estados que ocupan) y mismo criterio de solape. Divergencia
  // aceptada y ya conocida: acá el solape usa el buffer del negocio (UX) y el RPC usa `tsrange` sin
  // buffer — la AUTORIDAD es el RPC (un slot límite raro cae en slot_full al reservar).
  // Gateada por `serviceId`: si no llega (canchas — que nunca lo manda — o clientes viejos) o el
  // servicio NO es simultáneo (`individual` / `group_class`), se cae al camino de siempre.
  // Nota: si `any=1` venía con serviceId, la rama "Cualquiera" ya retornó arriba (D-13: el selector
  // no ofrece "Cualquiera" en simultáneo).
  // El anti-tampering ya corrió en la resolución IZADA (un serviceId de otro negocio no resuelve →
  // invalid_service 400): acá se consume esa fila, no se vuelve a consultar.
  if (svc) {
    if (svc.capacity_mode === 'simultaneous_resource') {
      const dur = Number(svc.duration_minutes) || 30
      const cap = slotCapacity
      const buffer = Number(business.buffer_minutes) || 0
      const nowMsSim = Date.now()
      // Agenda consultada. El `professionalId` que el client SÍ manda no se puede descartar: el motor
      // (migr. 063) rechaza montar un turno simultáneo sobre un turno de OTRO servicio de la MISMA
      // agenda, así que el read-path tiene que reflejarlo o el público ve libre lo que después falla
      // — o, peor, se reserva mal (code-review CR-04).
      const bucketSim = professionalId && professionalId !== 'none' ? professionalId : SENTINEL
      // Turnos VIVOS del negocio+fecha (holds vencidos NO ocupan — mismo descarte que el resto del
      // endpoint y que el gate del RPC).
      const liveSim = (appts || []).filter(
        a => a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at as string).getTime() > nowMsSim,
      )
      // (a) Carril del SERVICIO: cross-bucket, mismo service_id. El gate de cupo del RPC no bucketea
      //     por profesional — los N lugares son del SERVICIO (D-03/D-04).
      const liveSvc = liveSim.filter(a => a.service_id === serviceIdParam)
      // (b1) Ocupación REAL de la agenda consultada por OTROS servicios: cada uno de esos turnos
      //      bloquea el horario (el cupo del recurso es contra SÍ MISMO, nunca licencia para pisar
      //      un turno ajeno). Los del PROPIO servicio quedan afuera a propósito: son el carril (a).
      const liveBucketOther = liveSim.filter(
        a => (a.professional_id ?? SENTINEL) === bucketSim && a.service_id !== serviceIdParam,
      )
      // (b2) Bloqueo por ESPACIO compartido (invariante endurecida en v0.12): si la agenda comparte
      //      un espacio físico con otra, un turno solapado de la hermana ocupa el espacio y bloquea
      //      este slot, sea cual sea el modo de cupo. Mismo par de queries que el camino de siempre
      //      (service-role, filtrado por business_id: spaces/agenda_spaces no tienen read anon).
      const { data: simMySpaces } = await supabase
        .from('agenda_spaces')
        .select('space_id')
        .eq('business_id', business.id)
        .eq('professional_id', bucketSim)
      let liveSiblings: typeof liveSim = []
      if (simMySpaces && simMySpaces.length > 0) {
        const { data: simSib } = await supabase
          .from('agenda_spaces')
          .select('professional_id')
          .eq('business_id', business.id)
          .in('space_id', simMySpaces.map(s => s.space_id))
          .neq('professional_id', bucketSim)
        const simSiblingBuckets = new Set((simSib || []).map(s => s.professional_id as string))
        liveSiblings = liveSim.filter(a => simSiblingBuckets.has(a.professional_id ?? SENTINEL))
      }
      // (064, gap 3) Coherencia con el write-path: un recurso simultáneo de cupo > 1 sobre una agenda
      // con espacio físico mapeado es una configuración IMPOSIBLE — el RPC la rechaza de entrada con
      // `simultaneous_space_conflict` (el espacio es 1-a-la-vez por definición, migr. 042). Si el
      // read-path siguiera publicando esos horarios como libres, el público reservaría y recibiría un
      // rechazo en TODOS los slots: se ocultan enteros. No filtra nada nuevo (D-06): es el mismo
      // booleano por slot que ya usa `full`, sin decir POR QUÉ. El panel ya impide crear esta
      // combinación (settings-client.tsx); esto cubre a las configuraciones viejas.
      const simSpaceBlocked = cap > 1 && !!simMySpaces && simMySpaces.length > 0
      const overlaps = (a: { time: string; duration_minutes: number | null }, t: number) => {
        const aStart = toMin(a.time)
        const aEnd = aStart + Number(a.duration_minutes || 30)
        return t < aEnd + buffer && t + dur > aStart - buffer
      }
      const minToHHMM = (t: number) =>
        `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
      // Grilla del día a paso = duración (misma fórmula que el client y que la rama `any`). Caveat
      // conocido: los horarios especiales que EXTIENDEN el día no están en `time_blocks`, así que
      // esos start-times no se evalúan acá — quedan respaldados por el RPC (slot_full).
      const startSet = new Set<string>()
      for (const b of capBlocks || []) {
        const open = toMin(b.start_time)
        const close = toMin(b.end_time)
        for (let t = open; t + dur <= close; t += dur) startSet.add(minToHHMM(t))
      }
      // `full` = UNIÓN de las condiciones de bloqueo: (a) el carril del servicio ya tiene `cap` turnos
      // que pisan el intervalo, (b1) la agenda está ocupada por otro servicio, (b2) el espacio
      // compartido está tomado por una agenda hermana, (c) la config es imposible (064, gap 3).
      const fullSim: string[] = []
      for (const hhmm of startSet) {
        const t = toMin(hhmm)
        let n = 0
        for (const a of liveSvc) if (overlaps(a, t)) n++
        const laneFull = n >= cap
        const bucketBusy = liveBucketOther.some(a => overlaps(a, t))
        const spaceBusy = liveSiblings.some(a => overlaps(a, t))
        if (simSpaceBlocked || laneFull || bucketBusy || spaceBusy) fullSim.push(hhmm)
      }
      // D-06/D-12 (no-leak): la ocupación colapsa a un BOOLEANO por slot en `full`; jamás el conteo,
      // los lugares restantes ni `capacity` (que queda server-side). Tampoco se filtra POR QUÉ está
      // bloqueado (cupo lleno / agenda ocupada / espacio tomado): las tres condiciones se unifican en
      // el mismo booleano. `busy` va SIEMPRE vacío: los solapes del propio servicio son LEGALES hasta
      // el cupo y el client trata cada entrada de `busy` como conflicto por solapamiento — mandarlos
      // ahí borraría el 2º lugar del recurso. El contrato `{ ok, busy, full }` no cambia.
      // (AGENDA-03) Igual que en la rama "Cualquiera": `notOffered` se concatena sin mutar `fullSim`,
      // y se unifica en el MISMO booleano por slot que ya mezcla cupo lleno / agenda ocupada / espacio
      // tomado. Una condición de bloqueo más, cero motivo filtrado.
      return Response.json({ ok: true, busy: [], full: fullSim.concat(notOffered) }, { headers: { 'Cache-Control': 'no-store' } })
    }
    // `individual` / `group_class`: siguen de largo al camino de siempre (byte-idéntico).
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

  // `busy` SOLO refleja ocupación de servicios INDIVIDUALES (capacity 1): ahí un turno que solapa
  // (incluso de duración variable) bloquea el horario — es el anti-doble-booking de v0.9 que el
  // client aplica como `conflict`. Con un servicio GRUPAL (capacity > 1) la ocupación NO va a `busy`:
  // varios turnos en el MISMO horario son ESPERADOS (D-03, duración fija) y NO son conflicto; la
  // ÚNICA condición de bloqueo del grupo es `full` (count >= capacity). Sin este filtro, el
  // `conflict` por solapamiento del client borraría un slot grupal con 1/N ocupado ANTES de que
  // `full` aplique → el público no podría reservar el 2º+ lugar de una clase (bug de cupos).
  // (migr. 068) Es la MISMA regla, evaluada UNA vez: el cupo lo declara el servicio consultado, así
  // que ya no se decide turno por turno según su horario.
  const busy = (slotCapacity <= 1 ? live : [])
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
  // (migr. 068) El umbral es el cupo del SERVICIO consultado — el mismo número que usa el RPC —,
  // no el del bloque de agenda que cubre ese horario.
  const countByTime = new Map<string, number>()
  for (const a of live) countByTime.set(a.time, (countByTime.get(a.time) ?? 0) + 1)
  const full = [...countByTime.entries()]
    .filter(([, n]) => n >= slotCapacity)
    // `a.time` viene de Postgres como 'HH:MM:SS'; el client arma los slots con minutesToTime → 'HH:MM'
    // y compara con `full.includes(time)` (igualdad de string). Sin normalizar, '09:00' nunca matchea
    // '09:00:00' y el slot LLENO seguiría ofreciéndose. `busy` no sufría esto porque se compara por
    // minutos (timeToMinutes tolera los segundos); `full` es comparación literal, así que va en 'HH:MM'.
    .map(([time]) => time.slice(0, 5))

  // ── (migr. 069, CR-01 + CR-03) Coherencia read/write para los servicios de CUPO > 1 ────────────
  // Con cupo > 1 la ocupación NO va a `busy` (varios turnos en el mismo horario son ESPERADOS), así
  // que este camino no tenía CÓMO reflejar dos rechazos del write-path que la migr. 069 hizo
  // alcanzables para una CLASE GRUPAL — y un read-path que ofrece lo que el create rechaza es
  // exactamente la mentira que la 064 vino a eliminar en el modo simultáneo:
  //   (i)  (CR-01) la agenda ya tiene un turno vivo de OTRO servicio que NO comparte cupo (individual,
  //        recurso simultáneo, o una fila sin servicio) que PISA el intervalo ⇒ el RPC responde
  //        slot_taken. Dos servicios GRUPALES declarados (cupo >= 2) NO bloquean: es el caso legal de
  //        D-07 y el que hace reservable el 2º/3er lugar de una clase.
  //   (ii) (CR-03) la agenda tiene un ESPACIO físico mapeado ⇒ cupo >= 2 sobre un espacio 1-a-la-vez
  //        es una configuración IMPOSIBLE y el RPC la rechaza SIEMPRE (simultaneous_space_conflict):
  //        se ocultan TODOS los horarios, no algunos.
  // Va a `full` (booleano por slot) y NO a `busy`: mandarlo a `busy` haría que el client lo trate como
  // conflicto por solapamiento y borraría también los lugares libres de la propia clase. D-06 (no-leak)
  // intacto: `full` no dice POR QUÉ el slot está bloqueado ni cuántos lugares quedan, y el contrato
  // sigue siendo `{ ok, busy, full }`. Es el mismo molde que la rama simultánea (`liveBucketOther` +
  // `simSpaceBlocked`), acá aplicado al eje de conteo por hora de inicio.
  if (slotCapacity > 1) {
    const durShared = Number(svc?.duration_minutes) || 30
    const bufferShared = Number(business.buffer_minutes) || 0
    const spaceBlocked = !!mySpaces && mySpaces.length > 0
    const otherLive = live.filter(a => a.service_id !== serviceIdParam)
    let blockingOther = otherLive
    if (!spaceBlocked && otherLive.length > 0) {
      // Modos de los OTROS servicios presentes en la agenda: sólo un `group_class` de cupo >= 2 tiene
      // permiso de coexistir (mismo recorte D-07 que el RPC y que el re-check del core). business_id
      // EXPLÍCITO aunque los ids vengan de turnos ya acotados al tenant.
      const otherIds = [...new Set(otherLive.map(a => a.service_id).filter(Boolean))] as string[]
      const { data: otherSvcs } = await supabase
        .from('services')
        .select('id, capacity_mode, capacity')
        .in('id', otherIds)
        .eq('business_id', business.id)
      const sharedOk = new Set(
        (otherSvcs || [])
          .filter(s => s.capacity_mode === 'group_class' && Number(s.capacity) >= 2)
          .map(s => s.id as string),
      )
      blockingOther = otherLive.filter(a => !a.service_id || !sharedOk.has(a.service_id as string))
    }
    if (spaceBlocked || blockingOther.length > 0) {
      // Grilla del día a paso = duración (misma fórmula que el client y que las otras dos ramas).
      const minToHHMM = (t: number) =>
        `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
      const overlapsShared = (a: { time: string; duration_minutes: number | null }, t: number) => {
        const aStart = toMin(a.time)
        const aEnd = aStart + Number(a.duration_minutes || 30)
        return t < aEnd + bufferShared && t + durShared > aStart - bufferShared
      }
      const alreadyFull = new Set(full)
      for (const b of capBlocks || []) {
        const open = toMin(b.start_time)
        const close = toMin(b.end_time)
        for (let t = open; t + durShared <= close; t += durShared) {
          const hhmm = minToHHMM(t)
          if (alreadyFull.has(hhmm)) continue
          if (spaceBlocked || blockingOther.some(a => overlapsShared(a, t))) {
            alreadyFull.add(hhmm)
            full.push(hhmm)
          }
        }
      }
    }
  }

  // (AGENDA-03) Última de las TRES salidas exitosas. Acá `full` YA viene mutado por el bloque de
  // espacio compartido de arriba (hace `full.push`), así que se concatena igual que en las otras dos:
  // `notOffered` se suma sin mutar, y el contrato `{ ok, busy, full }` no cambia de forma.
  return Response.json({ ok: true, busy, full: full.concat(notOffered) }, { headers: { 'Cache-Control': 'no-store' } })
}
