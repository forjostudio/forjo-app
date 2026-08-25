import type { SupabaseClient } from '@supabase/supabase-js'
import type { TimeBlockService } from '@/lib/types'
import { isServiceAllowedAt, type BlockWindow } from '@/lib/time-block-services'

// ── Core rol-agnóstico de creación de turno ──────────────────────────────────────────
// Única fuente de verdad de la cadena de validación + insert de un turno. Extraído de
// app/api/booking/create/route.ts para que lo consuman DOS callers distintos sin duplicar:
//   - el booking PÚBLICO (service role, tenant por slug) → app/api/booking/create/route.ts
//   - el alta MANUAL autenticada (anon + RLS, tenant por owner_id) → Plan 02
// Por eso el core NO crea su propio cliente Supabase: lo recibe por parámetro y es agnóstico
// al rol. Tampoco manda mails, ni hace reCAPTCHA, ni lee secretos (eso es específico de cada
// caller). El core re-valida TODA entidad (service/professional/location) por business_id —
// nunca confía en lo que llega del cliente — y traduce el choque de constraint a slot_taken.

// Mismo sentinela que el índice 011 / el endpoint de disponibilidad: el bucket "sin profesional"
// se representa con este UUID cero para que coalesce(professional_id, sentinel) agrupe igual.
const SENTINEL = '00000000-0000-0000-0000-000000000000'

// Phase 9 ("cualquiera"): UUID centinela MÁGICO — DISTINTO del SENTINEL cero de "sin profesional".
// Cuando el caller pide autoAssign, el core pasa este UUID como p_professional_id y el RPC
// book_slot_atomic (migr. 058) elige, bajo el advisory lock, un profesional capaz+libre; nunca se
// inserta este valor (el RPC inserta el pro REAL elegido). No confundir con SENTINEL.
const ANY_PROFESSIONAL = '00000000-0000-0000-0000-000000000001'

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Business ya resuelto por el caller (por slug en el público, por owner_id en el manual).
// Solo se necesita el id (tenant) y el buffer entre turnos.
type BusinessForBooking = { id: string; buffer_minutes: number | null }

export type CreateAppointmentInput = {
  // admin (público) | server/anon (manual) — rol-agnóstico: el core lo usa tal cual lo recibe.
  supabase: SupabaseClient
  business: BusinessForBooking
  serviceId: string
  professionalId: string | null // 'none'/null → bucket SENTINEL
  locationId: string | null
  date: string // 'yyyy-MM-dd'
  time: string // 'HH:mm'
  // El cliente ya fue resuelto/creado por el caller (el core NO inserta la fila de clients):
  // el público inserta siempre uno nuevo, el manual deduplica. El core solo copia los campos.
  clientId: string | null
  clientName: string
  clientPhone: string | null
  clientEmail: string | null
  notes: string | null
  // En Phase 1 el alta manual SIEMPRE pasa requireDeposit=false → status='confirmed', expires=null.
  // El público lo deja como hoy (seña ⇒ pending_payment + expires_at). MANUAL-04 diferido a v2:
  // no se agrega el branch de seña al manual.
  requireDeposit?: boolean
  depositExpiryHours?: number
  // Phase 9: "cualquiera" — el caller NO elige profesional y el RPC (migr. 058) asigna uno capaz +
  // libre bajo el advisory lock (reparto de carga). Aditivo: los 4 callers actuales no lo setean →
  // comportamiento byte-idéntico. Con autoAssign se saltea la resolución de professionalId y los
  // re-checks JS (solo UX, no computables sin bucket concreto) — la autoridad es el RPC.
  autoAssign?: boolean
  // Phase 18 (D-04, migr. 071): aplica la regla de LA AGENDA POR SERVICIO en el camino del ACEPTA —
  // rechaza el turno si el horario pedido cae en una franja (`time_blocks`) que declaró NO dar este
  // servicio. Lo enciende UN SOLO caller: `app/api/booking/create/route.ts` (el booking PÚBLICO), la
  // única superficie donde el pedido llega de alguien no confiable.
  //
  // Con el flag en su default NO se ejecuta ni una query nueva y el camino queda BYTE-IDÉNTICO al de
  // hoy — que es exactamente lo que necesitan los otros DOS llamadores del core, cuyas exenciones son
  // deliberadas y no olvidos: el alta manual del dueño (`app/api/appointments/create/route.ts`) no
  // valida horario a propósito (cargar una excepción fuera de franja en la propia agenda es legítimo,
  // y es justo lo que un dueño hace) y la generación de abonos (`lib/abono-generation.ts`) documenta
  // en su cabecera por qué dejó de gatear por franjas (gatearla la volvía MÁS restrictiva que poner
  // el mismo turno a mano).
  //
  // ⚠ POR QUÉ EL DEFAULT ES APAGADO, y no al revés: si mañana aparece un caller nuevo y nadie se
  // acuerda de tocar este flag, hereda el comportamiento de HOY en vez de romperse. El fail-safe
  // apunta al lado seguro — el mismo criterio de `requireDeposit`/`autoAssign`, sus dos hermanos.
  enforceServiceWindow?: boolean
}

export type CreateAppointmentResult =
  | {
      ok: true
      appointmentId: string
      cancelToken: string
      status: 'confirmed' | 'pending_payment'
      serviceName: string
      durationMinutes: number
      // ids de holds vencidos que el core liberó (cancelled). El core NO manda mails: devuelve
      // los ids para que el caller público dispare sus mails de hold-vencido en su propio after().
      cancelledHoldIds: string[]
    }
  | {
      ok: false
      // 'simultaneous_space_conflict' (migr. 064, gap 3 del code-review 2): el servicio es un RECURSO
      // SIMULTÁNEO de cupo > 1 y su agenda tiene un ESPACIO físico mapeado (agenda_spaces). Es una
      // contradicción de configuración, no "ocupado": el espacio es 1-a-la-vez por definición
      // (appointment_spaces_no_overlap), así que un cupo ≥ 2 sobre él nunca puede materializarse.
      // Código PROPIO a propósito: antes esta combinación devolvía slot_taken (23P01 del 2º turno) y
      // era indistinguible de un horario realmente ocupado. El panel ya no ofrece el modo para esos
      // servicios (settings-client.tsx), así que en la práctica solo lo puede ver una configuración
      // vieja o una request forzada por API.
      // 'any_professional_unsupported' (T-12-11, secure-phase de Phase 12; ampliado a TODO cupo > 1
      // por el code-review de Phase 15, CR-02): se pidió "Cualquiera" (autoAssign) sobre un servicio
      // de CUPO COMPARTIDO (clase grupal o recurso simultáneo, los dos con `capacity >= 2`). D-13
      // declara la combinación NO soportada: la asignación automática del RPC (058) marca "ocupado" a
      // cualquier agenda con un solape, así que no sabe usar el 2º lugar. Código PROPIO: NO se colapsa
      // en slot_taken (haría indistinguible un combo no soportado de un horario realmente ocupado) ni
      // en invalid_service (el servicio es válido; lo que no se soporta es la VÍA de asignación).
      // 'service_not_scheduled' (Phase 18, D-04 / migr. 071 — sólo alcanzable con enforceServiceWindow,
      // o sea sólo por el booking PÚBLICO): el horario pedido cae en una franja de la agenda que
      // declaró NO dar este servicio (la peluquería que corta de 9 a 13 y hace color de 14 a 18, y
      // llega un POST pidiendo color a las 10). Es 400 y NO 409: no hay conflicto de horario —el slot
      // puede estar perfectamente libre—, es una request no soportada por la configuración de la
      // agenda, mismo razonamiento que `any_professional_unsupported`. Y tiene código PROPIO en vez de
      // colapsar en `invalid_service` porque el servicio ES válido y está activo: lo que no es válido
      // es el par servicio↔franja. Colapsarlos haría indistinguible "este servicio no existe / no es
      // de este negocio" de "este servicio no se da a esta hora", que son dos mensajes distintos para
      // el público (la copy al cliente es AGENDA-07, Phase 20).
      error: 'invalid_service' | 'invalid_professional' | 'any_professional_unsupported' | 'service_not_scheduled' | 'slot_taken' | 'slot_full' | 'simultaneous_space_conflict' | 'insert_failed'
      status: 400 | 409 | 500
    }

export async function createAppointmentCore(input: CreateAppointmentInput): Promise<CreateAppointmentResult> {
  const {
    supabase,
    business,
    serviceId,
    professionalId,
    locationId,
    date,
    time,
    clientId,
    clientName,
    clientPhone,
    clientEmail,
    notes,
    requireDeposit = false,
    depositExpiryHours = 1,
    autoAssign = false,
    enforceServiceWindow = false,
  } = input

  // Anti-tampering de tenant: el servicio debe ser de ESTE negocio y estar activo. De acá
  // sale la duración real (no se confía en nada del cliente) y —desde la migr. 062— el MODO de
  // cupo del servicio (`capacity_mode`/`capacity`), que decide si un solape es conflicto o no.
  const { data: service } = await supabase
    .from('services')
    .select('id, name, active, duration_minutes, location_id, capacity_mode, capacity')
    .eq('id', serviceId)
    .eq('business_id', business.id)
    .single()
  if (!service || service.active === false) {
    return { ok: false, error: 'invalid_service', status: 400 }
  }

  // ── T-12-11: "Cualquiera" + CUPO > 1 = combo NO soportado, rechazado ACÁ (server) ────────────────
  // D-13 difiere la combinación: la asignación automática del RPC (058) considera "ocupada" a toda
  // agenda con cualquier turno solapado, así que nunca ofrecería el 2º lugar de un servicio de cupo
  // compartido — el pedido termina en un slot_taken espurio (falla cerrado, pero degrada la
  // disponibilidad).
  //
  // (code-review de Phase 15, CR-02) EL CRITERIO ES EL CUPO, NO EL MODO. El gate se escribió mirando
  // `capacity_mode === 'simultaneous_resource'` porque hasta la migr. 068 un `group_class` REAL era
  // inalcanzable (el número salía de `time_blocks.capacity`, que valía 1 en el 100 % de producción).
  // Desde la 068 el dueño declara una clase grupal de cupo N con dos clicks, y el problema es
  // IDÉNTICO: reproducido contra el Postgres local con 2 profesionales comodín y un grupal de cupo 3,
  // tres inscripciones "Cualquiera" dieron OK (proA) + OK (proB) + slot_taken — o sea la clase se
  // llenó a los 2 de 3 lugares Y las dos inscripciones quedaron en agendas DISTINTAS (no es una
  // clase: son dos clases de una persona). Soportar el combo exige hacer capacity-aware la selección
  // de candidatos del RPC; hasta entonces el rechazo explícito es estrictamente mejor.
  //
  // OJO al que venga después: el selector público YA oculta la tarjeta "Cualquiera" para estos
  // servicios (`app/[slug]/booking-client.tsx`, D-13). Eso es UX, NO un control de seguridad — los
  // endpoints públicos son alcanzables directo y un POST con `anyProfessional:true` forjado se saltea
  // la UI entera. ESTE chequeo es el control real: NO lo borres por "redundante con el front".
  //
  // Va ANTES de la rama autoAssign (y del resto del trabajo) para no gastar queries en una request
  // que ya está rechazada. 400 (request no soportada), no 409: no hay conflicto de horario.
  if (autoAssign && Number(service.capacity) > 1) {
    return { ok: false, error: 'any_professional_unsupported', status: 400 }
  }

  // ── LA AGENDA POR SERVICIO en el camino del ACEPTA (Phase 18, D-04 / migr. 071) ──────────────────
  // La disponibilidad decide qué se OFRECE; ESTO decide qué se ACEPTA. Desde el Plan 18-03 el
  // endpoint de disponibilidad ya no ofrece los horarios de una franja que declaró no dar el servicio
  // pedido — pero eso es la grilla, y la grilla la arma el cliente.
  //
  // OJO al que venga después: el selector público es UX, NO un control. Los endpoints públicos son
  // alcanzables directo y un POST con el `serviceId` y la hora forjados se saltea la UI entera; sin
  // este chequeo se reserva cerámica en el horario de corte y el dueño se entera cuando llega el
  // cliente. Un control que vive sólo donde el cliente coopera ya demostró en este repo que no
  // alcanza (es la misma lección de `any_professional_unsupported`, unas líneas más arriba). NO lo
  // borres por "redundante con el front".
  //
  // Vive en el CORE y no en el route handler por una razón concreta: acá el servicio ya está
  // RE-VALIDADO por `business_id` unas líneas más arriba, así que la regla se evalúa sobre
  // `service.id` —el id que la base confirmó de ESTE negocio— y nunca sobre el `serviceId` crudo que
  // llegó del cliente. Es el anti-tampering de tenant que este repo exige para toda entidad
  // referenciada.
  //
  // ⚠ LA REGLA ES ANGOSTA A PROPÓSITO (AGENDA-04). Sólo rechaza cuando ALGUNA franja contiene el
  // horario pedido Y NINGUNA de esas da el servicio. Si el horario no cae en NINGUNA franja, se
  // ACEPTA: hoy tampoco se valida la ventana, y validarla acá rompería los días con horario ESPECIAL
  // que EXTIENDEN la jornada, que viven en `schedule_exceptions` y no en `time_blocks`. Esta fase
  // agrega UN SOLO eje de rechazo —el del mapeo franja↔servicio—, no una validación general de
  // horario.
  //
  // Gateado ENTERO por el flag (ver su documentación en el tipo): con el flag apagado no corre ni una
  // query nueva y el camino del alta manual y del motor de abonos queda byte-idéntico. Va ACÁ —después
  // del gate de "Cualquiera" y ANTES de resolver el profesional— para cubrir por igual el camino con
  // profesional elegido y el de asignación automática (los dos son públicos) sin gastar queries en una
  // request que ya está rechazada por otro motivo.
  //
  // La regla del comodín NO se reimplementa (AGENDA-02): sale de `isServiceAllowedAt`, la fuente
  // ÚNICA que también consumen la disponibilidad y el panel de la Phase 19 — tres capas que TIENEN
  // que interpretarla idéntico o derivan. Con la puente vacía el helper acepta todo por la regla del
  // comodín, no por un atajo: el día de la migración todos los negocios tienen 0 filas ⇒ toda franja
  // sirve para todo servicio ⇒ nada cambia (D-02, la cero regresión es por construcción).
  if (enforceServiceWindow) {
    // Mismo `dow` que `EXTRACT(dow)` de la DB y que el endpoint de disponibilidad: 'yyyy-MM-dd'
    // parseado como medianoche UTC + getUTCDay() (0=domingo..6=sábado). Si las dos superficies
    // derivaran el día distinto, una ofrecería lo que la otra rechaza.
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
    const startMin = timeToMinutes(time)
    // ── FAIL-CLOSED del backstop (CR-02, code review de la Phase 18) ────────────────────────────
    // Este bloque decide un RECHAZO, así que todo lo que le impida decidir tiene que rechazar, no
    // aceptar. Antes hacía lo contrario y por eso era bypasseable: un `date`/`time` que JavaScript
    // no parsea —pero Postgres sí, como `'2031-3-3'` o `'10:00 AM'`— dejaba `dow`/`startMin` en NaN;
    // `.eq('day_of_week', NaN)` hacía que PostgREST devolviera `22P02`, ese error se descartaba
    // (solo se desestructuraba `data`), `dayBlocks` quedaba vacío ⇒ ninguna franja contenía el
    // horario ⇒ la regla angosta ACEPTABA. El rechazo se salteaba cambiando dos caracteres del body.
    //
    // Se cierran los dos agujeros: (a) NaN en el día o la hora derivados, (b) error en cualquiera de
    // las dos queries. En los dos casos el estado del mapeo es DESCONOCIDO, y sobre desconocido este
    // backstop no puede afirmar que el servicio se da a esa hora.
    //
    // Redundante a propósito con el guard de forma del route handler público: ese cubre al endpoint
    // de hoy, este cubre a cualquier caller que encienda el flag mañana. El costo de la redundancia
    // son dos comparaciones; el costo de no tenerla ya se midió.
    if (Number.isNaN(dow) || Number.isNaN(startMin)) {
      return { ok: false, error: 'service_not_scheduled', status: 400 }
    }
    const { data: dayBlocks, error: dayBlocksErr } = await supabase
      .from('time_blocks')
      .select('id, start_time, end_time')
      .eq('business_id', business.id)
      .eq('day_of_week', dow)
    // Aislamiento por tenant EXPLÍCITO aunque el cliente pueda ser service-role (bypassa RLS): el
    // helper es puro y NO filtra por negocio (contrato D-16, el caller acota antes de llamar).
    const { data: bridgeRows, error: bridgeErr } = await supabase
      .from('time_block_services')
      .select('business_id, time_block_id, service_id')
      .eq('business_id', business.id)
    if (dayBlocksErr || bridgeErr) {
      console.error('[booking-core/service-window] query error:', dayBlocksErr ?? bridgeErr)
      return { ok: false, error: 'service_not_scheduled', status: 400 }
    }
    const allowed = isServiceAllowedAt(
      service.id as string, // el id RE-VALIDADO por business_id, nunca el serviceId del cliente
      startMin,
      (dayBlocks || []) as BlockWindow[],
      (bridgeRows || []) as TimeBlockService[],
    )
    if (!allowed) {
      return { ok: false, error: 'service_not_scheduled', status: 400 }
    }
  }

  // El profesional (si se eligió) también debe ser del negocio.
  // Phase 9 ("cualquiera", autoAssign): NO hay professionalId específico → se pasa el UUID mágico
  // ANY_PROFESSIONAL al RPC (que elige el pro bajo el lock). Se saltea toda la resolución/anti-tampering
  // de professionalId: el cliente NO manda ninguna lista de profesionales, solo el boolean (D-06).
  let proId: string | null = null
  if (autoAssign) {
    proId = ANY_PROFESSIONAL
  } else if (professionalId && professionalId !== 'none') {
    const { data: pro } = await supabase
      .from('professionals')
      .select('id')
      .eq('id', professionalId)
      .eq('business_id', business.id)
      .single()
    if (!pro) return { ok: false, error: 'invalid_professional', status: 400 }
    proId = pro.id
  }

  // cancelledHoldIds: solo el flujo NO-autoAssign libera holds vencidos per-bucket (bloque gateado
  // abajo). Con autoAssign no hay bucket concreto → queda vacío (la query de candidatos del RPC ya
  // contempla expires_at). Se declara acá para estar disponible en el return en ambos caminos.
  let cancelledHoldIds: string[] = []

  // ── Re-checks JS (SOLO UX, la autoridad es el RPC) — gateados por autoAssign ──────────────
  // Phase 9: con autoAssign NO hay un bucket concreto (el RPC elige el profesional bajo el lock), así
  // que estos re-checks (solape por bucket, espacio compartido, capacity-aware, liberación de holds)
  // NO son computables acá y se saltean por completo: el RPC book_slot_atomic (migr. 058) es la
  // autoridad y su query de candidatos ya contempla libertad + holds vigentes (expires_at). Con el
  // flag falsy el flujo queda BYTE-IDÉNTICO al de hoy (los 4 callers actuales no setean autoAssign).
  if (!autoAssign) {
    // Re-check de disponibilidad por SOLAPAMIENTO (rango [inicio, fin), consistente con la
    // exclusion constraint 013), no solo inicio exacto. Bucket por coalesce(sentinel).
    const bucket = proId ?? SENTINEL
    const nowMs = Date.now()
    const buffer = Number(business.buffer_minutes) || 0
    const reqStart = timeToMinutes(time)
    const reqEnd = reqStart + Number(service.duration_minutes || 30)
    const { data: clashes } = await supabase
      .from('appointments')
      // service_id (code-review CR-02): el re-check del recurso simultáneo tiene que distinguir un
      // solape del PROPIO servicio (legal hasta el cupo) de uno de OTRO servicio (doble-booking).
      .select('id, status, expires_at, professional_id, time, duration_minutes, service_id')
      .eq('business_id', business.id)
      .eq('date', date)
      .in('status', ['confirmed', 'pending_payment'])

    // Cupo del slot. Desde la migr. 068 el número del cupo es del SERVICIO en los TRES modos
    // (individual / group_class / simultaneous_resource), así que sale de la MISMA fila que ya se
    // resolvió y re-validó por `business_id` unas líneas más arriba — no de la plantilla semanal.
    // El bloque de agenda (`time_blocks`) sigue definiendo el DÍA y la VENTANA en que la agenda
    // recibe turnos, pero ya NO decide el cupo: `book_slot_atomic` dejó de consultar esa columna.
    // Esta lectura es el espejo de UX del RPC, que sigue siendo la AUTORIDAD atómica del cupo: acá
    // solo se decide el rechazo TEMPRANO, para no entrar al RPC a buscar un slot_taken seguro.
    const slotCapacity = Number(service.capacity) || 1

    // Buffer (descanso entre turnos): ensancha cada turno ocupado para exigir un hueco mínimo.
    const overlaps = (a: { time: string; duration_minutes: number | null }) => {
      const aStart = timeToMinutes(a.time)
      const aEnd = aStart + Number(a.duration_minutes || 30)
      return reqStart < aEnd + buffer && reqEnd > aStart - buffer
    }
    const sameBucket = (clashes || []).filter(a => (a.professional_id ?? SENTINEL) === bucket && overlaps(a))

    // ── Re-check de ESPACIO compartido (ESPACIO-02, solo UX) ─────────────────────────────
    // Rechazo TEMPRANO si un espacio físico (cancha, sala) que esta agenda ocupa ya está tomado por
    // una agenda hermana en un horario solapado. NO es la autoridad: la garantía atómica vive en el
    // RPC del Plan 01 (book_slot_atomic — advisory lock por espacio + EXISTS anti-solape cross-bucket).
    // Esto solo evita entrar al RPC para devolver un slot_taken más rápido y con mejor UX. Mismo estilo
    // de query que el re-check de bucket, bucketización byte-idéntica con SENTINEL (Pitfall 1).
    // Si la agenda no tiene espacios mapeados → skip total: ninguna query extra, camino cupos/individual
    // byte-idéntico al de hoy. El bloqueo de espacio es independiente de la capacity (un espacio físico
    // NO se comparte como un cupo — Pitfall 5): por eso este chequeo va aparte del `taken && slotCapacity`.
    const { data: mySpaces } = await supabase
      .from('agenda_spaces')
      .select('space_id')
      .eq('business_id', business.id)
      .eq('professional_id', bucket)
    if (mySpaces && mySpaces.length > 0) {
      const { data: siblings } = await supabase
        .from('agenda_spaces')
        .select('professional_id')
        .eq('business_id', business.id)
        .in('space_id', mySpaces.map(s => s.space_id))
        .neq('professional_id', bucket)
      const siblingBuckets = new Set((siblings || []).map(s => s.professional_id as string))
      // ¿Algún clash YA traído (mismo date) cae en una agenda hermana, solapa en
      // tiempo y está "ocupado de verdad" (confirmed o hold no vencido)? → rechazo temprano.
      const spaceClash = (clashes || []).some(a =>
        siblingBuckets.has(a.professional_id ?? SENTINEL) &&
        overlaps(a) &&
        (a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at as string).getTime() > nowMs)
      )
      // Reusa slot_taken (NO se agrega space_taken): el público solo sabe "ocupado" (D-06).
      if (spaceClash) return { ok: false, error: 'slot_taken', status: 409 }
    }

    // ¿Ocupado de verdad? confirmed, o pending_payment cuya seña NO venció (o aún sin setear).
    const isAlive = (a: { status: string; expires_at: string | null }) =>
      a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at as string).getTime() > nowMs
    const taken = sameBucket.some(isAlive)
    // Phase 12 (LANDMINE, CUPO-02): un servicio `simultaneous_resource` (migr. 062) cuenta su cupo
    // por SOLAPE de intervalos contra `services.capacity` (2 camillas = 2 turnos escalonados en
    // paralelo), NO por hora de inicio exacta. Lo que lo distingue es el EJE DE CONTEO, no de dónde
    // sale el número: desde la migr. 068 los TRES modos leen `services.capacity`. Sin esta rama, el
    // early-return de abajo cortaría el 2º turno SOLAPADO (que arranca a otra hora, así que no
    // comparte el slot exacto) con slot_taken y el recurso NUNCA se llenaría — rechazaría en el 2º,
    // no en cupo+1. Es el mismo razonamiento con el que el GRUPAL ya se exceptúa: un solape "consigo
    // mismo" hasta el cupo NO es conflicto, y la autoridad del cupo es el RPC. Para `individual`
    // (el DEFAULT desde la 068, incluidas canchas) y para `group_class` esto es false.
    const isSimultaneousResource = service.capacity_mode === 'simultaneous_resource'
    // Code-review CR-02: el bypass NO puede ser CIEGO. Lo legal es solaparse con el PROPIO servicio
    // (hasta el cupo, que decide el RPC); un solape con OTRO servicio de la MISMA agenda sigue siendo
    // doble-booking. Y para el modo simultáneo con cupo > 1 la fila nace `is_group = true`, o sea
    // FUERA del EXCLUDE gist 013 (migr. 041: `... AND NOT is_group`), así que la base tampoco lo
    // frenaría sola: el gate autoritativo vive en el RPC (migr. 063) y esto es su espejo de UX.
    // Bloquear el cruce es el default fail-closed; que el dueño pueda habilitarlo por servicio es un
    // follow-up planificado, deliberadamente fuera de alcance.
    //
    // (migr. 068) Consecuencia NUEVA del cupo por servicio: `is_group ⟺ capacity_mode <> 'individual'`
    // — o sea que QUÉ FILAS QUEDAN FUERA del EXCLUDE 013 ya no se DEDUCE del bloque de agenda (donde
    // un bloque de cupo 3 volvía grupales a TODAS las filas del negocio, de cualquier servicio), sino
    // que lo DECLARA el propio servicio. Un servicio individual vuelve a estar DENTRO del gist.
    const takenByOtherService = sameBucket.some(a => isAlive(a) && a.service_id !== service.id)

    // ── (migr. 069, CR-01) Espejo de UX del gate cross-servicio de la rama NO simultánea ─────────
    // Un servicio de cupo > 1 nace `is_group = true` ⇒ FUERA del EXCLUDE gist 013, así que la base
    // sola no frena que una CLASE GRUPAL se monte encima de un turno de otro servicio de la misma
    // agenda: eso lo decide el gate espejo del RPC (autoridad), y esto es su reflejo temprano.
    // Sin esta rama el early-return de abajo no aplicaba nunca para un grupal (`taken && cap <= 1` es
    // false con cupo >= 2) y el rechazo llegaba recién del RPC.
    //
    // EL RECORTE ES EL MISMO QUE EL DEL RPC (D-07), y por eso NO alcanza con `takenByOtherService`:
    // dos servicios GRUPALES DISTINTOS de cupo >= 2 PUEDEN coexistir solapados en la misma agenda —es
    // lo que "cupo N" significa—, así que rechazar por "hay otro servicio" cortaría un caso LEGAL (el
    // que asierta `no-drift — dos servicios que DECLARAN cupo >= 2`). Lo que bloquea es un turno de un
    // servicio que NO es un grupal declarado: individual (cupo 1), recurso simultáneo, o una fila sin
    // servicio. Se resuelve con UNA query extra y SOLO cuando hace falta (servicio de cupo > 1 con
    // turnos de otro servicio pisando el intervalo); el camino individual queda byte-idéntico.
    const otherLive = sameBucket.filter(a => isAlive(a) && a.service_id !== service.id)
    let takenByNonSharedService = false
    if (slotCapacity > 1 && otherLive.length > 0) {
      const otherIds = [...new Set(otherLive.map(a => a.service_id).filter(Boolean))] as string[]
      // Filtro por business_id EXPLÍCITO aunque los ids salgan de turnos ya acotados al tenant: es la
      // misma regla que el resto del core (nunca una query de servicios sin su tenant).
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
      takenByNonSharedService = otherLive.some(a => !a.service_id || !sharedOk.has(a.service_id as string))
    }
    // Re-check JS capacity-aware (Pitfall 5 / A5): el rechazo temprano `slot_taken` por SOLAPAMIENTO
    // solo aplica a servicios de cupo 1, donde es el anti-doble-booking de duración variable de v0.9 (un
    // turno de 60' que pisa parcialmente a otro de 30' — el RPC NO lo cubre, solo cuenta el slot exacto).
    // En servicios GRUPALES (capacity > 1) NO rechazamos acá: todos los inscriptos comparten el MISMO slot
    // exacto (D-03, duración fija) y un solape "consigo mismos" no es conflicto — la autoridad del cupo
    // es el RPC (advisory lock + count vs capacity → slot_full). Rechazar acá bloquearía falsamente al
    // 2º+ inscripto de la clase.
    //
    // La EXPRESIÓN no cambió con la migr. 068, solo de dónde sale su número, y la equivalencia se
    // conserva en los dos bordes: un servicio INDIVIDUAL da cupo 1 ⇒ esto es literalmente el
    // `taken && 1 <= 1` de siempre (byte-idéntico); un GRUPAL de cupo >= 2 no corta temprano, igual
    // que hoy no cortaba con un bloque de cupo > 1.
    // (migr. 069) La rama de cupo > 1 deja de ser "nunca rechaza": rechaza cuando la agenda ya está
    // ocupada por un servicio que NO comparte cupo (ver arriba). Cupo 1 queda BYTE-IDÉNTICO.
    const rejectEarly = isSimultaneousResource
      ? takenByOtherService
      : (slotCapacity <= 1 ? taken : takenByNonSharedService)
    if (rejectEarly) {
      return { ok: false, error: 'slot_taken', status: 409 }
    }

    // Liberar "holds" vencidos que se solapan (pending_payment con seña expirada): la
    // disponibilidad ya los muestra libres, pero las constraints los siguen contando hasta que
    // el cron los cancele. Sin esto el slot se ve libre pero el insert choca. Los cancelamos
    // acá mismo (consistente con cancel-expired), filtrando por business_id (tenant). El core
    // NO manda mails: devuelve los ids cancelados en cancelledHoldIds y el caller decide qué hacer.
    const expiredHoldIds = sameBucket
      .filter(a => a.status === 'pending_payment' && a.expires_at != null && new Date(a.expires_at as string).getTime() <= nowMs)
      .map(a => a.id)
    if (expiredHoldIds.length > 0) {
      const { data: cancelledHolds } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .in('id', expiredHoldIds)
        .eq('business_id', business.id)
        .select('id')
      cancelledHoldIds = (cancelledHolds || []).map(h => h.id as string)
    }
  }

  const initialStatus: 'confirmed' | 'pending_payment' = requireDeposit ? 'pending_payment' : 'confirmed'
  // pending_payment SIEMPRE con expires_at: si la reserva se abandona antes de iniciar el
  // pago, el cron la libera. payment/create lo reescribe con su propia ventana. Sin esto, un
  // hold sin expires_at quedaría ocupando el slot para siempre (el cron solo cancela vencidos).
  const expiryHours = Number(depositExpiryHours) || 1
  const expiresAt = requireDeposit
    ? new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString()
    : null

  // Consultorio: solo aceptamos un location_id que sea de ESTE negocio (aislamiento por tenant).
  let validLocationId: string | null = null
  if (locationId) {
    const { data: loc } = await supabase
      .from('locations')
      .select('id')
      .eq('id', locationId)
      .eq('business_id', business.id)
      .maybeSingle()
    validLocationId = loc ? locationId : null
  }
  // Fallback al consultorio del servicio (ya validado como del negocio por el select de arriba):
  // si el cliente no mandó consultorio o no era válido, manda el del servicio.
  if (!validLocationId && service.location_id) {
    validLocationId = service.location_id as string
  }

  // Alta del turno vía book_slot_atomic (migración 041). REEMPLAZA el INSERT autocommit directo:
  // el .insert() del client JS es su propia transacción, y entre el re-check de arriba y el insert
  // hay una ventana de carrera (TOCTOU) que dos requests concurrentes del mismo slot podían cruzar →
  // sobrecupo. El RPC encapsula advisory-lock + count vs capacity + INSERT con seat en UNA transacción
  // server-side: serializa SOLO las reservas que pelean este mismo slot+bucket y asigna el asiento
  // atómicamente. La garantía real del cupo vive acá (DB), no en el re-check JS (que es solo UX).
  // El anti-tampering de tenant (service/professional/location por business_id) ya corrió ARRIBA; el
  // RPC recibe ids ya validados y re-impone el filtro por p_business_id internamente (SECURITY DEFINER).
  const { data: appt, error: rpcErr } = await supabase
    .rpc('book_slot_atomic', {
      p_business_id: business.id,
      p_professional_id: proId,
      p_service_id: service.id,
      p_location_id: validLocationId,
      p_date: date,
      p_time: time,
      p_duration: Number(service.duration_minutes || 30),
      p_client_id: clientId,
      p_client_name: clientName,
      p_client_phone: clientPhone,
      p_client_email: clientEmail,
      p_notes: notes,
      p_status: initialStatus,
      p_expires_at: expiresAt,
    })
    .single()

  if (rpcErr || !appt) {
    // (a0) RAISE 'simultaneous_space_conflict' (ERRCODE P0001 — migr. 064, gap 3): recurso simultáneo
    //      con cupo > 1 sobre una agenda con espacio físico mapeado. Se chequea PRIMERO y se mapea a
    //      su propio código (409) para NO colapsarlo en slot_taken: no es un horario ocupado, es una
    //      configuración imposible (el espacio es 1-a-la-vez por definición, migr. 042). Antes de la
    //      064 esto se manifestaba como un 23P01 en el 2º turno mientras availability publicaba el
    //      horario como libre — el rechazo explícito es estrictamente mejor que esa mentira.
    if (rpcErr?.message?.includes('simultaneous_space_conflict')) {
      return { ok: false, error: 'simultaneous_space_conflict', status: 409 }
    }
    // (a) RAISE 'slot_full' (ERRCODE P0001 — cupo grupal lleno) llega en `message` → slot_full (409).
    if (rpcErr?.message?.includes('slot_full')) {
      return { ok: false, error: 'slot_full', status: 409 }
    }
    // (a2) RAISE 'slot_taken' (ERRCODE P0001 — solape de espacio físico cross-bucket, migración 042)
    //      llega en `message` (no por SQLSTATE de constraint) → slot_taken (409). Reusa el código
    //      existente, no agrega space_taken (D-06: el público solo sabe "ocupado").
    if (rpcErr?.message?.includes('slot_taken')) {
      return { ok: false, error: 'slot_taken', status: 409 }
    }
    // (b) 23505 = índice único de seat (cupo 1: 2ª reserva del slot, doble-booking clásico);
    //     23P01 = exclusion constraint 013 (solape de duración variable, cupo 1) → slot_taken (409).
    if (rpcErr?.code === '23505' || rpcErr?.code === '23P01') {
      return { ok: false, error: 'slot_taken', status: 409 }
    }
    console.error('[booking-core] rpc error:', rpcErr?.message)
    return { ok: false, error: 'insert_failed', status: 500 }
  }
  const apptRow = appt as { id: string; cancel_token: string }

  return {
    ok: true,
    appointmentId: apptRow.id,
    cancelToken: apptRow.cancel_token,
    status: initialStatus,
    serviceName: (service.name as string) || '',
    durationMinutes: Number(service.duration_minutes || 30),
    cancelledHoldIds,
  }
}
