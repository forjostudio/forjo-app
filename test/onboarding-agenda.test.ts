import { afterEach, describe, it, expect } from 'vitest'
import {
  buildOnboardingAgendaPayload,
  canMapServicesInVertical,
  esServicioVigente,
  franjaServiceIdsVigentes,
  MIN_SERVICE_MINUTES,
  newServiceId,
  servicesWithoutCoverage,
  shouldMapServices,
  toNumberOr,
  type OnboardingDayDraft,
} from '@/lib/onboarding-agenda'
import { isBlockWildcard } from '@/lib/time-block-services'

// ── El traductor del estado del wizard al payload del RPC (AGENDA-08, Phase 21) — suite pura ────
//
// QUÉ SE ROMPE SI ESTE ARCHIVO SE PONE ROJO: el negocio de clases sale del alta diciendo que los
// martes da un servicio DISTINTO del que quiso decir, o persistiendo un mapeo que la última pantalla
// no le mostró. Ninguno de los dos casos produce un error: producen un dato plausible y equivocado,
// que después el booking público le muestra a un cliente como si fuera la verdad del negocio.
//
// Sin DB y sin navegador: `lib/onboarding-agenda.ts` es un módulo puro, así que no hay nada que
// doblar. Los ids de los servicios son uuids LITERALES y no `randomUUID()`, para que cuando un caso
// falle el diff diga qué servicio se cruzó con cuál.
//
// ⚠ El caso del mapeo necesita DOS servicios: con uno solo la suite pasaría aunque el traductor
// correlacionara por posición en vez de por id (Pitfall 1).

const svcA = '11111111-1111-4111-8111-111111111111'
const svcB = '22222222-2222-4222-8222-222222222222'
/** Un servicio que el dueño borró en el paso 2 y cuyo id sobrevivió en el estado del bloque. */
const svcBorrado = '33333333-3333-4333-8333-333333333333'

/** Los SIETE días del wizard, con bloques sólo en los que se pasan. El índice ES el day_of_week. */
function week(byDay: Record<number, { start_time: string; end_time: string; service_ids: string[] }[]>): OnboardingDayDraft[] {
  return Array.from({ length: 7 }, (_, d) => {
    const blocks = byDay[d] ?? []
    return { enabled: blocks.length > 0, blocks }
  })
}

function block(over: Partial<{ start_time: string; end_time: string; service_ids: string[] }> = {}) {
  return { start_time: '09:00', end_time: '13:00', service_ids: [], ...over }
}

describe('buildOnboardingAgendaPayload: el estado del alta → el payload de save_agenda_blocks', () => {
  it('mapea cada franja a SU servicio, no al de al lado (dos servicios, Pitfall 1)', () => {
    const days = week({
      1: [block({ service_ids: [svcA] })],
      2: [block({ service_ids: [svcB] })],
    })

    const payload = buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [svcA, svcB] })

    expect(payload).toHaveLength(2)
    expect(payload.find(b => b.day_of_week === 1)!.service_ids).toEqual([svcA])
    expect(payload.find(b => b.day_of_week === 2)!.service_ids).toEqual([svcB])
  })

  it('con el toggle APAGADO todas las franjas viajan en comodín, aunque el estado tenga mapeo (D-10)', () => {
    const days = week({
      1: [block({ service_ids: [svcA] })],
      2: [block({ service_ids: [svcA, svcB] })],
    })

    const payload = buildOnboardingAgendaPayload(days, { mapServices: false, liveServiceIds: [svcA, svcB] })

    // Los bloques NO desaparecen: lo que se apaga es el mapeo, no los horarios.
    expect(payload).toHaveLength(2)
    expect(payload.every(b => b.service_ids.length === 0)).toBe(true)
  })

  it('descarta el id de un servicio que ya no está vigente y conserva los que sí (Pitfall 7)', () => {
    const days = week({
      1: [block({ service_ids: [svcBorrado, svcA] })],
    })

    const payload = buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [svcA, svcB] })

    expect(payload).toHaveLength(1)
    expect(payload[0].service_ids).toEqual([svcA])
  })

  it('un día cerrado no aporta bloques y NO corre la numeración de los demás', () => {
    const days = week({
      1: [block({ service_ids: [svcA] })],
      3: [block({ service_ids: [svcB] })],
    })
    days[2] = { enabled: false, blocks: [block({ service_ids: [svcA] })] } // martes cerrado, con basura adentro

    const payload = buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [svcA, svcB] })

    expect(payload.map(b => b.day_of_week)).toEqual([1, 3])
    // El miércoles sigue siendo 3: si el traductor numerara por posición en la salida, daría 2.
    expect(payload[1].service_ids).toEqual([svcB])
  })

  it('el mismo id repetido en un bloque viaja una sola vez (dedupe heredado, sin evadirlo)', () => {
    const days = week({
      1: [block({ service_ids: [svcA, svcA, svcB] })],
    })

    const payload = buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [svcA, svcB] })

    expect(payload[0].service_ids).toEqual([svcA, svcB])
  })

  it('toda franja del alta viaja sin id (⇒ INSERT), sin etiqueta y sin consultorio', () => {
    const days = week({
      1: [block(), block({ start_time: '15:00', end_time: '19:00' })],
    })

    const payload = buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [] })

    expect(payload).toHaveLength(2)
    for (const b of payload) {
      expect(b.id).toBeNull()
      expect(b.label).toBeNull()
      expect(b.location_id).toBeNull()
    }
  })
})

// ── El aviso de D-07: qué servicios no cubre NINGUNA franja (Plan 21-02) ────────────────────────
//
// QUÉ SE ROMPE SI ESTE BLOQUE SE PONE ROJO: el dueño termina el alta creyendo que su catálogo está
// reservable y el cliente se encuentra con "Sin horarios disponibles" en la página pública. O, peor,
// el aviso se pone a mentir: con los 7 días cerrados —que es UN click— diría que TODO el catálogo se
// quedó sin horario, y un aviso que grita cuando no pasa nada es un aviso que el dueño aprende a
// ignorar. Ese caso (el de cero franjas) es el discriminante de la suite: apoyado en la función cruda
// `isServiceScheduled` en vez de en `hasScheduleCoverage`, es el único que se pone rojo.

/** Un servicio del paso 2 tal como lo tiene el wizard: id estable (D-09) y el nombre que escribió el dueño. */
function svc(id: string, name: string) {
  return { id, name }
}

describe('servicesWithoutCoverage: los servicios que ninguna franja del alta cubre (D-07)', () => {
  it('con cada servicio declarado en alguna franja, no avisa nada', () => {
    const days = week({
      1: [block({ service_ids: [svcA] })],
      2: [block({ service_ids: [svcB] })],
    })

    expect(servicesWithoutCoverage([svc(svcA, 'Cerámica'), svc(svcB, 'Yoga')], days)).toEqual([])
  })

  it('nombra SOLO al servicio que ninguna franja declara', () => {
    const days = week({
      1: [block({ service_ids: [svcA] })],
      2: [block({ service_ids: [svcA] })],
    })

    const sinCobertura = servicesWithoutCoverage([svc(svcA, 'Cerámica'), svc(svcB, 'Yoga')], days)

    expect(sinCobertura.map(s => s.name)).toEqual(['Yoga'])
  })

  it('con los SIETE días cerrados no avisa de nada (la guarda del negocio sin franjas, CR-01)', () => {
    const days = week({}) // cero franjas abiertas: la pregunta no tiene sujeto

    // Apoyado en `isServiceScheduled` en vez de en `hasScheduleCoverage`, acá saldrían los DOS
    // servicios y el dueño vería su catálogo entero marcado como sin horario.
    expect(servicesWithoutCoverage([svc(svcA, 'Cerámica'), svc(svcB, 'Yoga')], days)).toEqual([])
  })

  it('una sola franja comodín alcanza para cubrir todo el catálogo (D-01)', () => {
    const days = week({
      1: [block({ service_ids: [svcA] })],
      2: [block()], // comodín: no declara ningún servicio ⇒ sirve para todos
    })

    expect(servicesWithoutCoverage([svc(svcA, 'Cerámica'), svc(svcB, 'Yoga')], days)).toEqual([])
  })

  it('ignora las filas de servicio sin nombre: el dueño no puede recibir un aviso de una fila que ni cargó', () => {
    const days = week({
      1: [block({ service_ids: [svcA] })],
    })

    const sinCobertura = servicesWithoutCoverage(
      [svc(svcA, 'Cerámica'), svc(svcB, '  '), svc(svcBorrado, 'Yoga')],
      days,
    )

    expect(sinCobertura.map(s => s.id)).toEqual([svcBorrado])
  })

  it('un día cerrado no aporta sus franjas, pero un día abierto entre cerrados sí', () => {
    const days = week({ 3: [block({ service_ids: [svcA] })] })
    // Lunes cerrado con basura adentro: declara svcB, pero como el día está cerrado no cuenta.
    days[1] = { enabled: false, blocks: [block({ service_ids: [svcB] })] }

    const sinCobertura = servicesWithoutCoverage([svc(svcA, 'Cerámica'), svc(svcB, 'Yoga')], days)

    // svcA está cubierto por el miércoles (abierto, en el medio de días cerrados); svcB no, porque su
    // única franja está en un día cerrado.
    expect(sinCobertura.map(s => s.name)).toEqual(['Yoga'])
  })
})

// ── CR-01: los TRES bordes tienen que decir lo MISMO sobre la misma franja ──────────────────────
//
// QUÉ SE ROMPE SI ESTE BLOQUE SE PONE ROJO: el estudio que declaró "los martes de 15 a 16 sólo
// cerámica" sale del alta con esa franja abierta a TODO su catálogo, mientras el aviso de la última
// pantalla le afirmaba lo contrario y la línea de chips no le mostraba ni una cosa ni la otra. Es el
// modo de falla más caro de la fase —dato plausible, permisivo y equivocado, sin un solo error en
// pantalla— y es alcanzable con una navegación hacia atrás y un select-all + delete sobre el nombre
// de un servicio que ya estaba mapeado.
//
// El disparador: `removeService` limpia el estado cuando el servicio se BORRA, pero nada lo limpia
// cuando se le VACÍA el nombre — y el nombre es exactamente sobre lo que los otros dos bordes
// filtraban, cada uno por su cuenta.
//
// El borde de los chips se chequea sobre el valor que el call site le PASA al componente
// (`franjaServiceIdsVigentes(...)`) y se lo hace pasar por `isBlockWildcard`, que es la MISMA
// función a la que `components/agenda/block-services-line.tsx:64` delega para decidir si pinta el
// chip "Cualquier servicio". No se renderiza JSX (el runner es `environment: 'node'`), pero la
// entrada del componente y la regla que aplica sobre ella son las de producción.
const DRAFT = '__draft__'
function pintaComodin(serviceIds: string[]): boolean {
  return isBlockWildcard(DRAFT, serviceIds.map(id => ({ business_id: '', time_block_id: DRAFT, service_id: id })))
}

describe('CR-01: un servicio al que se le vació el nombre y quedó mapeado', () => {
  /** El estado real: svcA con nombre, svcB con el nombre borrado y todavía mapeado al lunes. */
  function estadoDelWizard() {
    const services = [svc(svcA, 'Yoga'), svc(svcB, '')]
    const days = week({ 1: [block({ service_ids: [svcB] })] })
    return { services, days }
  }

  it('los tres bordes coinciden: la franja es COMODÍN para los chips, para el aviso y para la base', () => {
    const { services, days } = estadoDelWizard()
    const vigentes = new Set(services.filter(esServicioVigente).map(s => s.id))

    // 1. Lo que ve el dueño: la franja no declara nada vigente ⇒ chip "Cualquier servicio".
    const idsDeLaFranja = franjaServiceIdsVigentes(days[1].blocks[0].service_ids, vigentes)
    expect(idsDeLaFranja).toEqual([])
    expect(pintaComodin(idsDeLaFranja)).toBe(true)

    // 2. Lo que se guarda: `[]` ES el comodín (D-01). Coincide con lo que la pantalla mostró.
    const payload = buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [...vigentes] })
    expect(payload).toHaveLength(1)
    expect(payload[0].service_ids).toEqual([])

    // 3. Lo que dice el aviso: una franja comodín cubre TODO el catálogo ⇒ no hay nada que avisar.
    //    Antes del fix acá salía ['Yoga'] — el aviso afirmaba lo contrario de lo que se persistía.
    expect(servicesWithoutCoverage(services, days)).toEqual([])
  })

  it('la franja sin nombre vacío sigue restringida: el fix no convierte todo en comodín', () => {
    // El control del caso de arriba. Si `franjaServiceIdsVigentes` o el aviso filtraran de más, este
    // caso se pondría rojo y el fix estaría comprando la coincidencia a costa de perder el mapeo.
    const services = [svc(svcA, 'Yoga'), svc(svcB, 'Cerámica')]
    const days = week({ 1: [block({ service_ids: [svcB] })] })
    const vigentes = new Set(services.filter(esServicioVigente).map(s => s.id))

    const idsDeLaFranja = franjaServiceIdsVigentes(days[1].blocks[0].service_ids, vigentes)
    expect(idsDeLaFranja).toEqual([svcB])
    expect(pintaComodin(idsDeLaFranja)).toBe(false)
    expect(buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [...vigentes] })[0].service_ids).toEqual([svcB])
    // Y acá el aviso SÍ tiene algo que decir: la única franja da cerámica, así que yoga se queda sin.
    expect(servicesWithoutCoverage(services, days).map(s => s.name)).toEqual(['Yoga'])
  })

  it('la franja que sólo declaraba al servicio sin nombre deja de tapar al resto del catálogo', () => {
    // Dos franjas: el lunes declara al fantasma (⇒ comodín ⇒ cubre todo), el martes declara yoga.
    // Con el criterio viejo el lunes contaba como restringido-a-nada y el aviso denunciaba cerámica.
    const services = [svc(svcA, 'Yoga'), svc(svcB, ''), svc(svcBorrado, 'Cerámica')]
    const days = week({
      1: [block({ service_ids: [svcB] })],
      2: [block({ service_ids: [svcA] })],
    })

    expect(servicesWithoutCoverage(services, days)).toEqual([])
  })
})

// ── WR-05: el gate que decide QUÉ SE PERSISTE, con su tabla de verdad completa ──────────────────
//
// QUÉ SE ROMPE SI ESTE BLOQUE SE PONE ROJO: según qué término se invierta, o bien el negocio sale del
// alta con el mapeo que configuró tirado a la basura (se persiste comodín cuando no correspondía), o
// bien —el caro— el payload referencia ids de servicios que el INSERT nunca llegó a escribir, la FK
// compuesta `tbs_service_same_tenant` rebota con 23503 y el RPC todo-o-nada revierte TAMBIÉN las
// franjas: el negocio termina el alta sin un solo horario.
//
// La expresión vivía suelta adentro del submit, o sea adentro de un client component que este runner
// no renderiza: se le podía invertir cualquiera de los tres términos y las 15 aserciones de arriba
// seguían verdes. Las OCHO filas se enumeran a mano y no se derivan de la implementación — derivarlas
// de `shouldMapServices` haría un test que se pone de acuerdo consigo mismo pase lo que pase.
describe('shouldMapServices: el gate de las TRES condiciones (WR-05)', () => {
  const filas: { vertical: string; perFranja: boolean; servicesFailed: boolean; esperado: boolean }[] = [
    // El ÚNICO caso que persiste el mapeo: rubro que lo admite + toggle en Sí + servicios guardados.
    { vertical: 'belleza', perFranja: true, servicesFailed: false, esperado: true },
    // El toggle apagado manda, aunque haya mapeo cargado en el estado (D-10).
    { vertical: 'belleza', perFranja: false, servicesFailed: false, esperado: false },
    // Servicios fallados ⇒ NUNCA se mapea: los ids que el payload nombraría no existen en la base.
    { vertical: 'belleza', perFranja: true, servicesFailed: true, esperado: false },
    { vertical: 'belleza', perFranja: false, servicesFailed: true, esperado: false },
    // Canchas: el rubro no admite el eje (D-03), pase lo que pase con los otros dos.
    { vertical: 'canchas', perFranja: true, servicesFailed: false, esperado: false },
    { vertical: 'canchas', perFranja: false, servicesFailed: false, esperado: false },
    { vertical: 'canchas', perFranja: true, servicesFailed: true, esperado: false },
    { vertical: 'canchas', perFranja: false, servicesFailed: true, esperado: false },
  ]

  for (const { vertical, perFranja, servicesFailed, esperado } of filas) {
    it(`vertical=${vertical} perFranja=${perFranja} servicesFailed=${servicesFailed} ⇒ ${esperado}`, () => {
      expect(shouldMapServices({ vertical, perFranja, servicesFailed })).toBe(esperado)
    })
  }

  it('el gate y el payload son la MISMA decisión: con los servicios fallados no viaja ningún mapeo', () => {
    // El gate no se testea en el aire: se lo enchufa al traductor tal como lo hace `handleFinish`.
    // Si `!servicesFailed` se invirtiera, acá saldría [svcA] y el RPC se llevaría puestas las franjas.
    const days = week({ 1: [block({ service_ids: [svcA] })] })
    const mapServices = shouldMapServices({ vertical: 'belleza', perFranja: true, servicesFailed: true })
    const payload = buildOnboardingAgendaPayload(days, { mapServices, liveServiceIds: [svcA] })

    expect(payload).toHaveLength(1) // la franja SÍ se crea: lo que se cae es el mapeo, no el horario
    expect(payload[0].service_ids).toEqual([])
  })

  it('canMapServicesInVertical: sólo canchas queda afuera; el resto de los rubros entra', () => {
    // Sin este caso, cambiar el literal a otro rubro dejaría la tabla de arriba verde salvo 4 filas
    // que no distinguirían "canchas" de "cualquier rubro que no sea belleza".
    expect(canMapServicesInVertical('canchas')).toBe(false)
    for (const v of ['belleza', 'salud', 'general', '']) {
      expect(canMapServicesInVertical(v)).toBe(true)
    }
  })
})

// ── WR-02: el id del servicio tiene que salir TAMBIÉN fuera de un contexto seguro ───────────────
//
// QUÉ SE ROMPE SI ESTE BLOQUE SE PONE ROJO: la pantalla del alta queda EN BLANCO en `http://`.
// `Crypto.randomUUID` es `[SecureContext]`: en un origen no-https el método no existe, y la llamada
// corre en el inicializador lazy de un `useState` —primer render, sin error boundary arriba—, así
// que el `TypeError` se lleva puesta la página entera. `https://` en producción anda; el que no anda
// es `http://192.168.x.x:3000`, que es como este proyecto hace la UAT desde el celular, o sea
// justamente el dispositivo donde la UAT encuentra los bugs.
//
// Las TRES ramas se ejercitan de verdad, no se leen: `globalThis.crypto` se reemplaza por un doble
// sin `randomUUID` (el caso real de la LAN) y por uno sin nada (la última red). Restaurar en
// `afterEach` es obligatorio: dejar el doble puesto contaminaría cualquier test posterior del mismo
// worker.
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newServiceId: el uuid del paso 2 sin contexto seguro (WR-02)', () => {
  const realCrypto = globalThis.crypto

  function fakeCrypto(value: unknown) {
    Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true })
  }

  afterEach(() => {
    fakeCrypto(realCrypto)
  })

  it('con randomUUID disponible (https) usa randomUUID', () => {
    expect(newServiceId()).toMatch(V4)
    expect(typeof globalThis.crypto.randomUUID).toBe('function')
  })

  it('SIN randomUUID (http:// en la LAN) NO tira y devuelve un uuid v4 válido', () => {
    // El doble es el `Crypto` real de un origen inseguro: `getRandomValues` sí, `randomUUID` no.
    fakeCrypto({ getRandomValues: (b: Uint8Array) => realCrypto.getRandomValues(b) })

    expect(() => newServiceId()).not.toThrow()
    const id = newServiceId()
    expect(id).toMatch(V4)
    // Dos llamadas seguidas no pueden devolver el mismo id: son dos filas distintas del paso 2, y
    // dos ids iguales harían que el mapeo de una franja apuntara al servicio equivocado.
    expect(new Set(Array.from({ length: 200 }, () => newServiceId())).size).toBe(200)
  })

  it('sin crypto en absoluto tampoco tira (la última red)', () => {
    fakeCrypto(undefined)

    expect(() => newServiceId()).not.toThrow()
    expect(newServiceId()).toMatch(V4)
    expect(new Set(Array.from({ length: 200 }, () => newServiceId())).size).toBe(200)
  })
})

// ── WR-03: un campo numérico vaciado no puede llevarse puesto el catálogo entero ────────────────
//
// QUÉ SE ROMPE SI ESTE BLOQUE SE PONE ROJO: el dueño borra el "30" del campo Min. para reescribirlo,
// `parseInt('')` da NaN, `JSON.stringify` lo serializa como `null`, y `services.duration_minutes` es
// NOT NULL ⇒ 23502. Como el insert de servicios es UNA sola sentencia multi-fila, no se pierde esa
// fila: se pierde el catálogo COMPLETO. Y desde esta fase, con él, el mapeo franja↔servicio, porque
// `falloServicios` degrada la agenda a comodín. Nada lo atajaba: `validateServicePrice` sólo mira
// `< 0` y `NaN < 0` es false.
//
// La aserción es sobre el JSON, no sobre el número: `NaN !== NaN` hace que un `toEqual` distraído
// pase, y lo que rompe la base es la SERIALIZACIÓN, que es lo que se chequea.
describe('toNumberOr: el valor de un input numérico vaciado (WR-03)', () => {
  it('el campo vacío cae al default en vez de dar NaN', () => {
    expect(toNumberOr('', 30)).toBe(30)
    expect(toNumberOr('   ', 30)).toBe(30)
    expect(toNumberOr('', 0)).toBe(0)
    // La trampa que esto cierra: Number('') es 0, no NaN. La version "obvia" del fix dejaba
    // pasar un servicio de 0 minutos en vez de un NaN — el mismo bug con otro disfraz.
    expect(Number('')).toBe(0)
    // Esto es lo que hacía `parseInt`/`parseFloat` y lo que ya no puede pasar.
    expect(Number.isNaN(parseInt(''))).toBe(true)
  })

  it('texto basura y no-finitos también caen al default', () => {
    for (const v of ['', '   ', 'abc', '1e999', '-1e999']) {
      expect(Number.isFinite(toNumberOr(v, 30))).toBe(true)
    }
  })

  it('los valores legítimos pasan intactos, decimales incluidos', () => {
    expect(toNumberOr('45', 30)).toBe(45)
    expect(toNumberOr('0', 30)).toBe(0)
    expect(toNumberOr('1500.5', 0)).toBe(1500.5)
    expect(toNumberOr('-100', 0)).toBe(-100) // el precio negativo lo sigue atajando validateServicePrice
  })

  it('la fila que viaja al insert nunca serializa null en una columna NOT NULL', () => {
    const fila = {
      id: svcA,
      name: 'Yoga',
      duration_minutes: toNumberOr('', 30),
      price: toNumberOr('', 0),
      business_id: 'biz',
    }
    const serializada = JSON.parse(JSON.stringify(fila))
    expect(serializada.duration_minutes).toBe(30)
    expect(serializada.price).toBe(0)
    // El contraejemplo: así se veía la fila con parseInt, y así llegaba a un NOT NULL ⇒ 23502.
    expect(JSON.parse(JSON.stringify({ duration_minutes: parseInt('') })).duration_minutes).toBeNull()
  })

  it('MIN_SERVICE_MINUTES es el piso que usa la validación inline de duración', () => {
    expect(MIN_SERVICE_MINUTES).toBeGreaterThan(0)
  })
})
