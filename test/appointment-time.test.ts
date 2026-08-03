import { describe, it, expect } from 'vitest'
import { nowInAR, isPastAppointment } from '@/lib/appointment-time'

// ── Tests PUROS del corte pasado/próximo de un turno (hora AR) ────────────────────
// Sin Supabase ni creds: el helper no toca la base, así que no van bajo
// `describe.skipIf(!hasSupabaseCreds)`. Mismo estilo que test/appointment-service.test.ts.
//
// Lo que se protege acá: que un turno de HOY a una hora ya pasada caiga en "Pasados" y NO en
// "Próximos" (bug del tab de /turnos, que comparaba solo la fecha), y que ningún turno pueda
// quedar afuera de los dos tabs por el corte.

describe('nowInAR', () => {
  it('devuelve la pared-reloj argentina (UTC-3), no la UTC', () => {
    // 2026-08-03T02:30:00Z = 2026-08-02 23:30 en Buenos Aires → el día AR es el 2, no el 3.
    expect(nowInAR(new Date('2026-08-03T02:30:00Z'))).toEqual({ date: '2026-08-02', time: '23:30:00' })
  })

  it('padea mes, día y hora a dos dígitos', () => {
    expect(nowInAR(new Date('2026-01-05T12:04:07Z'))).toEqual({ date: '2026-01-05', time: '09:04:07' })
  })

  it('cruza el cambio de día hacia atrás (00:30 UTC = 21:30 AR del día anterior)', () => {
    expect(nowInAR(new Date('2026-03-01T00:30:00Z'))).toEqual({ date: '2026-02-28', time: '21:30:00' })
  })
})

describe('isPastAppointment', () => {
  const now = { date: '2026-08-03', time: '13:00:00' }

  it('un turno de un día anterior ya pasó', () => {
    expect(isPastAppointment({ date: '2026-08-02', time: '23:59:00' }, now)).toBe(true)
  })

  it('un turno de un día posterior no pasó', () => {
    expect(isPastAppointment({ date: '2026-08-04', time: '00:01:00' }, now)).toBe(false)
  })

  it('HOY a una hora ya pasada cuenta como pasado (el bug: antes quedaba en "Próximos")', () => {
    expect(isPastAppointment({ date: '2026-08-03', time: '11:30:00' }, now)).toBe(true)
  })

  it('HOY a una hora futura NO cuenta como pasado', () => {
    expect(isPastAppointment({ date: '2026-08-03', time: '14:00:00' }, now)).toBe(false)
  })

  it('el turno de la hora exacta todavía no pasó (límite estricto)', () => {
    expect(isPastAppointment({ date: '2026-08-03', time: '13:00:00' }, now)).toBe(false)
  })

  it("acepta 'HH:mm' además de 'HH:mm:ss' (no compara '13:00' contra '13:00:00' como strings crudos)", () => {
    expect(isPastAppointment({ date: '2026-08-03', time: '13:00' }, now)).toBe(false)
    expect(isPastAppointment({ date: '2026-08-03', time: '12:59' }, now)).toBe(true)
  })

  it('sin hora (null / vacío) se trata como fin del día: hoy sigue siendo próximo', () => {
    expect(isPastAppointment({ date: '2026-08-03', time: null }, now)).toBe(false)
    expect(isPastAppointment({ date: '2026-08-03', time: '' }, now)).toBe(false)
    expect(isPastAppointment({ date: '2026-08-03' }, now)).toBe(false)
    // …pero si el día ya pasó, pasó igual (la fecha decide sola).
    expect(isPastAppointment({ date: '2026-08-02', time: null }, now)).toBe(true)
  })

  it('particiona: ningún turno queda afuera de los dos tabs por el corte', () => {
    const turnos = [
      { date: '2026-08-02', time: '10:00:00' },
      { date: '2026-08-03', time: '09:00:00' },
      { date: '2026-08-03', time: '13:00:00' },
      { date: '2026-08-03', time: '18:00:00' },
      { date: '2026-08-04', time: '08:00:00' },
      { date: '2026-08-03', time: null as string | null },
    ]
    // "pasados" = past, "próximos" (sin cancelados) = !past → la unión es el total y no se solapan.
    const pasados = turnos.filter(t => isPastAppointment(t, now))
    const proximos = turnos.filter(t => !isPastAppointment(t, now))
    expect(pasados.length + proximos.length).toBe(turnos.length)
    expect(pasados.filter(t => proximos.includes(t))).toEqual([])
  })
})

// ── IN-02: `hhmmss` con fracciones de segundo y con basura ────────────────────────────────────
// `hhmmss` (lib/appointment-time.ts:32) NO se exporta, así que se ejercita a través de
// `isPastAppointment`, que es su único consumidor.
//
// La normalización es `pad2(Number(s) || 0)`. Eso rompe en dos formas, las dos VERIFICADAS llamando
// a la función antes de escribir estos casos:
//
//   1. Fracción de segundo con la parte entera de UN dígito: `'00.5'` → `Number` = 0.5 → `String` =
//      `'0.5'`, que ya tiene 3 caracteres, así que `padStart(2,'0')` es un no-op. Sale `'13:00:0.5'`,
//      un string que YA NO es comparable lexicográficamente con `'13:00:00'` (el `.` vale menos que
//      cualquier dígito, y el `9` de `'9.5'` vale más que el `1` de `'10'`). La comparación se rompe
//      en las DOS direcciones, no solo en una.
//   2. Cualquier componente no numérico colapsa a `0` en silencio: `'ab:cd'` → `'00:00:00'`, o sea
//      medianoche. Un dato ilegible se convierte en "ya pasó" sin que nadie se entere.
//
// Con los datos de HOY no es alcanzable (los slots son minutos enteros y `time` viene de Postgres),
// pero el helper se presenta como la fuente ÚNICA de verdad del corte pasado/próximo.
//
// Los casos rotos van con `it.fails()`: documentan la expectativa CORRECTA, pasan mientras el bug
// exista y se rompen ruidosamente el día que alguien arregle el código sin actualizar el test.
describe('isPastAppointment: fracciones de segundo y basura (IN-02)', () => {
  it('una fracción de segundo con parte entera de 2 dígitos SÍ normaliza bien (acota el daño)', () => {
    // '59.999' ya tiene 2 dígitos antes del punto, así que el padStart no cambia nada y el orden
    // lexicográfico se mantiene. El bug es específico de los segundos 0-9 con fracción.
    expect(isPastAppointment({ date: '2026-08-03', time: '13:00:59.999' }, { date: '2026-08-03', time: '13:01:00' })).toBe(true)
    // Y una fracción NULA (`.0`) tampoco rompe: Number('00.0') = 0 → pad2 → '00'.
    expect(isPastAppointment({ date: '2026-08-03', time: '13:00:00.0' }, { date: '2026-08-03', time: '13:00:00' })).toBe(false)
  })

  // IN-02 (a). '13:00:00.5' es medio segundo DESPUÉS de las 13:00:00 → todavía no pasó. La
  // normalización produce '13:00:0.5', que ordena ANTES de '13:00:00' (el '.' vale menos que el '0'),
  // así que el turno se marca como pasado. CORRECTO: false.
  it.fails('IN-02: un turno 0.5s DESPUÉS de ahora NO debería contar como pasado', () => {
    expect(isPastAppointment({ date: '2026-08-03', time: '13:00:00.5' }, { date: '2026-08-03', time: '13:00:00' })).toBe(false)
  })

  // IN-02 (b). El mismo defecto en la dirección contraria: '13:00:09.5' → '13:00:9.5', y '9' > '1',
  // así que ordena DESPUÉS de '13:00:10' aunque 09.5 < 10. El turno ya pasó y queda en "Próximos".
  // CORRECTO: true.
  it.fails('IN-02: un turno 0.5s ANTES de ahora SÍ debería contar como pasado', () => {
    expect(isPastAppointment({ date: '2026-08-03', time: '13:00:09.5' }, { date: '2026-08-03', time: '13:00:10' })).toBe(true)
  })

  // IN-02 (c). Una hora ilegible se coerce a '00:00:00' (medianoche) y el turno cae en "Pasados" para
  // cualquier `now` del día. CORRECTO: tratarla como el helper ya trata a una hora AUSENTE — fin del
  // día, o sea NO pasada. Esa asimetría es la que el propio módulo documenta ("el turno tiene que caer
  // siempre de UN lado del corte"), y hundir un dato roto en "Pasados" lo esconde en vez de mostrarlo.
  it.fails('IN-02: una hora no numérica no debería colapsar a medianoche en silencio', () => {
    expect(isPastAppointment({ date: '2026-08-03', time: 'ab:cd' }, { date: '2026-08-03', time: '13:00:00' })).toBe(false)
  })
})
