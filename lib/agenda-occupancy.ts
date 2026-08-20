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
// 3. **El `service_id` es parte de la clave del grupo (D-10).** El cupo es del SERVICIO, así que dos
//    clases distintas a la misma hora en agendas distintas no se pueden fusionar: el contador
//    mentiría y, peor, mostraría en la agenda de un servicio a los inscriptos de otro (T-17-18).
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
      /** `date | HH:MM | service_id` — la identidad del slot, y también la key de React. */
      key: string
      date: string
      time: string
      serviceId: string
      serviceName: string | null
      /** TODOS los miembros del slot, ocupen o no lugar: el roster los muestra igual. */
      appts: A[]
      /** Miembros que ocupan lugar (`occupiesSeat`). */
      occupied: number
      capacity: number
      /** Miembros `pending_payment` con el hold todavía vivo. */
      pendingDeposit: number
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
 */
export function buildDayEntries<A extends OccupancyAppt, S extends OccupancyService>(
  dayAppts: readonly A[],
  serviceById: ReadonlyMap<string, S>,
  nowMs: number
): DayEntry<A>[] {
  const entries: DayEntry<A>[] = []
  // key del slot → índice de su entrada en `entries`, para sumar miembros sin recorrer de nuevo.
  const groupAt = new Map<string, number>()

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
    const key = `${a.date}|${time}|${a.service_id}`
    let at = groupAt.get(key)
    if (at === undefined) {
      at = entries.length
      groupAt.set(key, at)
      entries.push({
        kind: 'group',
        key,
        date: a.date,
        time,
        serviceId: a.service_id,
        serviceName: svc.name ?? null,
        appts: [],
        occupied: 0,
        capacity: capacityOf(svc),
        pendingDeposit: 0,
      })
    }

    const entry = entries[at]
    if (entry.kind !== 'group') continue // inalcanzable: `groupAt` solo indexa grupos
    entry.appts.push(a)
    if (occupiesSeat(a, nowMs)) {
      entry.occupied += 1
      if (a.status === 'pending_payment') entry.pendingDeposit += 1
    }
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
