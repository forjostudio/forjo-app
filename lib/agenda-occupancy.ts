// ── Ocupación y agrupamiento por slot de la agenda (POLISH-09, D-10/D-11/D-12) ────────────────
//
// Módulo PURO: cero imports. Ni React, ni Next, ni Supabase, ni `date-fns`. Recibe datos y devuelve
// datos, y por eso se puede testear sin DB y sin navegador (test/agenda-occupancy.test.ts) — que es
// justamente lo que faltaba: la ocupación se calculaba adentro de un `useMemo` de un componente que
// el runner de este repo no puede renderizar (`environment: 'node'`).
//
// Tres cosas que este módulo decide y que conviene leer antes de tocarlo:
//
// 1. **De dónde sale el cupo: de `services.capacity`.** Es la fuente del MOTOR desde la migración
//    068. La columna de cupo de los bloques de horario se conserva en la base, pero **dejó de
//    decidir**: `book_slot_atomic` no la mira. Este módulo tampoco la conoce ni la recibe — no hay
//    parámetro por donde entre. Queda escrito acá porque la grilla del panel la estuvo leyendo
//    hasta esta fase, y lo que evita que alguien la vuelva a enchufar "porque estaba a mano" es que
//    esté dicho, no que no esté a mano.
//
// 2. **El modo se LEE, no se deduce.** `capacity_mode === 'group_class'`, nunca `capacity > 1`.
//    Deducir el modo del número es la misma clase de error que el review de la 069 propuso en la
//    base y que se descartó midiéndolo: un servicio simultáneo de cupo 3 y una clase grupal de cupo
//    3 son el mismo número y comportamientos opuestos. `isSimultaneous` ya lo hacía bien en la
//    grilla; acá se aplica el mismo criterio a los tres modos.
//
// 3. **AGRUPAR PARA MOSTRAR ≠ EL EJE CON EL QUE SE CUENTA (code-review CR-01).** Es la distinción
//    central de este módulo y la más fácil de volver a perder:
//
//    · **Se AGRUPA por `date | HH:MM | bucket | service_id`.** El `service_id` está en la clave del
//      grupo (D-10) porque dos clases distintas a la misma hora no se pueden fusionar en una fila:
//      el roster de una mostraría a los inscriptos de la otra (T-17-18). El `bucket` está en la
//      clave porque la MISMA clase dictada por dos profesionales son DOS clases, cada una con su
//      lista.
//
//    · **Se CUENTA por `date | HH:MM | bucket`, SIN `service_id`** — el eje LITERAL del motor.
//      `book_slot_atomic` (rama individual + group_class) hace:
//
//        SELECT count(*) INTO v_occupied FROM appointments a
//         WHERE a.business_id = p_business_id
//           AND COALESCE(a.professional_id, '000…000'::uuid) = v_bucket   -- POR AGENDA
//           AND a.date = p_date AND a.time = p_time                       -- SIN service_id
//           AND a.status IN ('confirmed','pending_payment');
//
//      y compara ese número contra `services.capacity` DEL SERVICIO que se está reservando. El
//      índice único `appointments_no_double_booking` es del mismo eje (business, bucket, date, time,
//      seat) y tampoco lleva `service_id`.
//
//    CONSECUENCIA BUSCADA, y sí, es fea: dos servicios grupales distintos en la MISMA agenda y hora
//    salen como DOS filas (agrupamiento) que muestran el MISMO ocupado (conteo), cada una contra su
//    propio cupo — `Yoga 8/6` y `Pilates 8/4`. El motor computa 8 para ese bucket y rechaza las dos
//    con `slot_full`; el panel ahora dice lo mismo. Se descartó a propósito la alternativa "contar
//    por agenda pero mostrar el número partido por servicio": inventa una atribución que la base no
//    tiene, y así es como se vuelve a tener dos verdades. POLISH-09 existe precisamente para que el
//    panel deje de mostrar un número que el motor ignora.
//
// ⚠ Consecuencia conocida y ACEPTADA (D-12, T-17-21): el caller le pasa el mapa de servicios
// ACTIVOS (la página de agenda filtra por activo). Un turno de una clase grupal cuyo servicio fue
// DESACTIVADO no resuelve y cae, por D-12, en el tratamiento individual: chip suelto, sin contador
// y sin roster. Es el comportamiento literal de D-12 y NO se corrige acá ampliando la consulta del
// server — eso es un cambio de data flow fuera del alcance de esta fase. Se reabre si un dueño
// reporta que desactivar un servicio le rompe la lectura de una clase todavía viva.

/** Estados que OCUPAN un lugar del cupo (mismo WHERE de los constraints 011/013). */
export const OCCUPYING_STATUSES = ['confirmed', 'pending_payment']

/**
 * Sentinel de "agenda sin profesional". Literal byte-idéntico al del `COALESCE` del motor
 * (`book_slot_atomic`) y al del índice único 011 / EXCLUDE 013. NO cambiarlo por otro placeholder:
 * el único valor de tener este módulo es que su bucket sea EL MISMO que el de la base.
 */
export const AGENDA_SENTINEL = '00000000-0000-0000-0000-000000000000'

/**
 * Forma MÍNIMA de turno que necesita este módulo. Estructural a propósito: `AgendaAppt` (y
 * cualquier fila con estos campos) la satisface sin castear ni adaptar.
 */
export type OccupancyAppt = {
  id: string
  date: string
  time: string
  status: string
  duration_minutes?: number | null
  /** Vencimiento de la seña de un `pending_payment`. Null ⇒ el hold no vence. */
  expires_at?: string | null
  service_id?: string | null
  /**
   * Agenda del turno. Null ⇒ agenda sin profesional (el sentinel del motor). Es el eje con el que
   * `book_slot_atomic` cuenta los lugares, así que sin este campo el panel NO puede contar como el
   * motor (code-review CR-01). El `select` del server tiene que traerlo.
   */
  professional_id?: string | null
}

/** Bucket de agenda: `COALESCE(professional_id, sentinel)`, byte-idéntico al del motor. */
export function bucketOf(appt: OccupancyAppt): string {
  return appt.professional_id ?? AGENDA_SENTINEL
}

/** Forma mínima de servicio: el cupo y el modo, que es todo lo que decide la ocupación. */
export type OccupancyService = {
  name?: string | null
  capacity?: number | null
  capacity_mode?: string | null
}

/**
 * Una entrada de la columna del día: o un turno suelto, o un slot grupal colapsado.
 *
 * Unión discriminada por `kind` y GENÉRICA en el tipo del turno: la columna que la consume conserva
 * el tipo concreto (`client_name`, `abono_id`, el join del nombre del servicio) sin un solo casteo.
 */
export type DayEntry<A> =
  | { kind: 'appt'; appt: A }
  | {
      kind: 'group'
      /** `date | HH:MM | bucket | service_id` — la identidad de la fila, y la key de React. */
      key: string
      date: string
      time: string
      /** Agenda de la fila: `professional_id` crudo (null = agenda sin profesional). */
      professionalId: string | null
      serviceId: string
      serviceName: string | null
      /** Miembros DE ESTA FILA (esta agenda, este servicio), ocupen o no lugar: el roster los muestra igual. */
      appts: A[]
      /**
       * Lugares tomados EN LA AGENDA a esta hora — el eje del motor, sin `service_id`. Puede ser
       * MAYOR que `appts.length` cuando otro servicio comparte agenda y hora: el motor cuenta esos
       * lugares igual y por eso el panel también.
       */
      occupied: number
      /** Cupo del SERVICIO de esta fila (`services.capacity`), que es contra lo que compara el motor. */
      capacity: number
      /** Lugares tomados en la agenda por un `pending_payment` con el hold vivo (mismo eje que `occupied`). */
      pendingDeposit: number
      /**
       * Hay OTRA fila del mismo servicio y hora en OTRA agenda. Sin esto, dos filas idénticas a la
       * misma hora son indistinguibles en la columna del día; con esto la fila puede rotular su
       * agenda SOLO cuando hace falta (y no tocar el layout del caso de siempre).
       */
      agendaAmbiguous: boolean
    }

/** Minutos desde 'HH:MM[:SS]'. */
export function timeToMin(t: string): number {
  const [h, m] = t.split(':')
  return Number(h) * 60 + Number(m)
}

/**
 * Cupo del servicio, con piso 1.
 *
 * Servicio ausente, `capacity` nula o 0 ⇒ 1. El piso es fail-safe en la dirección correcta:
 * sub-ofrecer esconde un lugar que existe, sobre-ofrecer MIENTE sobre uno que no.
 */
export function capacityOf(svc: OccupancyService | null | undefined): number {
  return Math.max(1, Number(svc?.capacity) || 1)
}

/**
 * ¿Este turno ocupa un lugar del cupo, ahora (`nowMs`)?
 *
 * Dos condiciones: estado que ocupa Y hold vivo. Un `pending_payment` con la seña VENCIDA no ocupa
 * lugar — el motor lo descarta en el gate del RPC (migr. 063) y `availability` tampoco lo cuenta.
 * Sin esta guarda el panel avisa "lleno" sobre horarios que en realidad siguen reservables
 * (precedente CR-01). `nowMs` entra por parámetro y NUNCA se lee el reloj adentro: es lo que vuelve
 * determinista el caso del hold vencido en los tests.
 */
export function occupiesSeat(appt: OccupancyAppt, nowMs: number): boolean {
  if (!OCCUPYING_STATUSES.includes(appt.status)) return false
  if (appt.status === 'confirmed') return true
  if (appt.expires_at == null) return true
  return new Date(appt.expires_at).getTime() > nowMs
}

/**
 * Arma las entradas de la columna de un día: los turnos de una clase grupal se colapsan en UNA
 * entrada por slot; todo lo demás sale como turno suelto, EN SU LUGAR.
 *
 * El grupo aparece en la posición de su PRIMER miembro y los siguientes se suman a él sin crear otra
 * entrada, así la columna se sigue leyendo como una línea de tiempo con grupos y chips mezclados
 * cronológicamente (el orden de `dayAppts` manda; este módulo no reordena nada).
 *
 * Un grupo cuyos miembros son TODOS no-ocupantes existe igual, con `occupied: 0`: colapsar no puede
 * hacer desaparecer algo que hoy se ve en pantalla.
 *
 * Tres pasadas, y el orden importa:
 *   1. Ocupación POR AGENDA-HORA (el eje del motor, sin `service_id`) sobre TODOS los turnos del día.
 *   2. Filas, agrupadas por agenda + hora + servicio, que LEEN el número de la pasada 1.
 *   3. Marca de ambigüedad: dos filas del mismo servicio y hora en agendas distintas.
 */
export function buildDayEntries<A extends OccupancyAppt, S extends OccupancyService>(
  dayAppts: readonly A[],
  serviceById: ReadonlyMap<string, S>,
  nowMs: number
): DayEntry<A>[] {
  // ── Pasada 1: lugares tomados por AGENDA-HORA, el eje literal del motor ──────────────────────
  // Se cuentan TODOS los turnos del bucket a esa hora, sin mirar servicio ni modo: eso es
  // exactamente lo que hace el `count(*)` de `book_slot_atomic` (no filtra por `service_id`, y el
  // índice único 011 tampoco). Un turno individual y una clase grupal en la misma agenda a la misma
  // hora ya no pueden crearse (el gate espejo de la 069 los rechaza), pero si una fila vieja quedó
  // así el motor la cuenta igual ⇒ el panel tiene que contarla igual.
  //
  // Única diferencia con el `count` del RPC, y es DELIBERADA: acá se aplica `occupiesSeat`, o sea la
  // guarda de hold vivo. El RPC no la necesita porque el core libera los holds vencidos ANTES de
  // llamarlo; el panel lee la tabla tal como está entre cron y cron, así que sin la guarda avisaría
  // "lleno" sobre horarios que `availability` —que sí filtra por `expires_at`— sigue vendiendo.
  const seatsByBucketSlot = new Map<string, { occupied: number; pendingDeposit: number }>()
  for (const a of dayAppts) {
    if (!occupiesSeat(a, nowMs)) continue
    const bucketSlot = `${a.date}|${a.time.slice(0, 5)}|${bucketOf(a)}`
    const acc = seatsByBucketSlot.get(bucketSlot) || { occupied: 0, pendingDeposit: 0 }
    acc.occupied += 1
    if (a.status === 'pending_payment') acc.pendingDeposit += 1
    seatsByBucketSlot.set(bucketSlot, acc)
  }

  const entries: DayEntry<A>[] = []
  // key de la fila → índice de su entrada en `entries`, para sumar miembros sin recorrer de nuevo.
  const groupAt = new Map<string, number>()

  // ── Pasada 2: una fila por agenda + hora + servicio ──────────────────────────────────────────
  for (const a of dayAppts) {
    const svc = a.service_id ? serviceById.get(a.service_id) : undefined
    // D-12: sin `service_id`, o con un servicio que no resuelve (desactivado / borrado), no hay modo
    // ni cupo que leer ⇒ individual. No se inventa un número ni se abre una lista que no
    // corresponde a ninguna clase.
    if (!a.service_id || !svc || svc.capacity_mode !== 'group_class') {
      entries.push({ kind: 'appt', appt: a })
      continue
    }

    const time = a.time.slice(0, 5)
    const bucket = bucketOf(a)
    const key = `${a.date}|${time}|${bucket}|${a.service_id}`
    let at = groupAt.get(key)
    if (at === undefined) {
      const seats = seatsByBucketSlot.get(`${a.date}|${time}|${bucket}`)
      at = entries.length
      groupAt.set(key, at)
      entries.push({
        kind: 'group',
        key,
        date: a.date,
        time,
        professionalId: a.professional_id ?? null,
        serviceId: a.service_id,
        serviceName: svc.name ?? null,
        appts: [],
        // El contador NO se acumula miembro a miembro: sale entero de la pasada 1, que es la única
        // que mira el eje del motor. Sumarlo acá lo volvería a atar al servicio de la fila.
        occupied: seats?.occupied ?? 0,
        capacity: capacityOf(svc),
        pendingDeposit: seats?.pendingDeposit ?? 0,
        agendaAmbiguous: false,
      })
    }

    const entry = entries[at]
    if (entry.kind !== 'group') continue // inalcanzable: `groupAt` solo indexa grupos
    entry.appts.push(a)
  }

  // ── Pasada 3: ¿esta fila comparte servicio y hora con otra agenda? ───────────────────────────
  const bucketsBySlotService = new Map<string, Set<string>>()
  for (const e of entries) {
    if (e.kind !== 'group') continue
    const slotService = `${e.date}|${e.time}|${e.serviceId}`
    const set = bucketsBySlotService.get(slotService) || new Set<string>()
    set.add(e.professionalId ?? AGENDA_SENTINEL)
    bucketsBySlotService.set(slotService, set)
  }
  for (const e of entries) {
    if (e.kind !== 'group') continue
    e.agendaAmbiguous = (bucketsBySlotService.get(`${e.date}|${e.time}|${e.serviceId}`)?.size ?? 1) > 1
  }

  return entries
}

/**
 * Ocupación por SOLAPE del recurso simultáneo (CUPO-01). Movida tal cual desde la grilla: la lógica
 * está validada en producción desde la Phase 12 y este módulo la hace testeable, no la rediseña.
 *
 * Para un servicio `simultaneous_resource` el cupo NO se cuenta por hora de inicio exacta (eso es el
 * modelo grupal) sino por INTERSECCIÓN de intervalos contra los turnos del MISMO `service_id` — el
 * mismo conjunto que gatea el RPC (062). Devuelve turno → {ocupados, cupo} SOLO para los turnos cuyo
 * intervalo YA alcanzó el cupo; un `group_class` nunca entra a este mapa.
 */
export function computeOverlapFull<A extends OccupancyAppt, S extends OccupancyService>(
  appts: readonly A[],
  serviceById: ReadonlyMap<string, S>,
  nowMs: number
): Map<string, { count: number; capacity: number }> {
  const full = new Map<string, { count: number; capacity: number }>()
  // Carriles independientes por servicio y día: un servicio simultáneo solo compite contra sí mismo.
  const lanes = new Map<string, A[]>()

  for (const a of appts) {
    if (!a.service_id || !occupiesSeat(a, nowMs)) continue
    if (serviceById.get(a.service_id)?.capacity_mode !== 'simultaneous_resource') continue
    const key = `${a.service_id}|${a.date}`
    const arr = lanes.get(key) || []
    arr.push(a)
    lanes.set(key, arr)
  }

  for (const [key, list] of lanes) {
    const capacity = capacityOf(serviceById.get(key.slice(0, key.indexOf('|'))))
    for (const a of list) {
      const aStart = timeToMin(a.time)
      // Duración faltante → 30, igual que el COALESCE del RPC. Sin buffer: el gate del motor compara
      // los intervalos crudos.
      const aEnd = aStart + (a.duration_minutes ?? 30)
      const count = list.filter(b => {
        const bStart = timeToMin(b.time)
        return bStart < aEnd && aStart < bStart + (b.duration_minutes ?? 30)
      }).length
      if (count >= capacity) full.set(a.id, { count, capacity })
    }
  }

  return full
}
