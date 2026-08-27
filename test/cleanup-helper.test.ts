import { describe, it, expect } from 'vitest'
import { cleanupOrThrow, cleanupAllOrThrow, type CleanupOp, type CleanupResult } from './helpers/cleanup'

// ── Cobertura del helper de teardown (ION-02) ────────────────────────────────────────────────────
// Este archivo es PURO: no toca la base. Las operaciones de limpieza se simulan con thenables falsos,
// que además son la forma REAL del builder de PostgREST — `admin.from(t).delete().eq(...)` no dispara
// la request al construirse, sino al await. Por eso el helper puede recibir un mapa de operaciones ya
// armado y ejecutarlas él.
//
// ⚠ Va en el PRIMER NIVEL de test/, no dentro de test/helpers/: el clasificador de suite-split.ts solo
// mira el primer nivel, así que una suite anidada se le escapa (y su guard falla, que es el punto).

type CleanupError = NonNullable<CleanupResult['error']>

// Error con la forma de un PostgrestError (message + code son lo que el helper reporta).
function pgError(message: string, code: string): CleanupError {
  return { name: 'PostgrestError', message, code, details: '', hint: '' } as CleanupError
}

// Thenable falso: registra en `orden` el momento en que se lo AWAITEA (no el de construcción), así se
// puede asertar que el helper ejecutó todas las operaciones y en qué secuencia.
function fakeOp(label: string, error: CleanupError | null, orden: string[]): CleanupOp {
  return {
    then<A, B>(
      onfulfilled?: ((value: CleanupResult) => A | PromiseLike<A>) | null,
      onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
    ): PromiseLike<A | B> {
      orden.push(label)
      return Promise.resolve({ error } as CleanupResult).then(onfulfilled, onrejected)
    },
  }
}

describe('cleanupOrThrow — una sola limpieza', () => {
  it('1 — resuelve sin tirar cuando la operación vuelve sin error', async () => {
    const orden: string[] = []
    await expect(cleanupOrThrow('borrar turnos', fakeOp('turnos', null, orden))).resolves.toBeUndefined()
    expect(orden).toEqual(['turnos'])
  })

  it('2 — tira nombrando la limpieza, el motivo y el módulo cuando la operación vuelve con error', async () => {
    const orden: string[] = []
    const op = fakeOp('turnos', pgError('boom', '42501'), orden)

    // El mensaje es lo ÚNICO que el desarrollador va a leer cuando esto explote: tiene que decir qué
    // limpieza falló y por qué, en vez de dejar que la contaminación aparezca como un assert numérico
    // desconcertante en el test siguiente.
    await expect(cleanupOrThrow('borrar turnos', op)).rejects.toThrow(/borrar turnos/)
    await expect(cleanupOrThrow('borrar turnos', fakeOp('turnos', pgError('boom', '42501'), orden))).rejects.toThrow(
      /boom/
    )
    await expect(cleanupOrThrow('borrar turnos', fakeOp('turnos', pgError('boom', '42501'), orden))).rejects.toThrow(
      /\[test\/cleanup\]/
    )
  })
})

describe('cleanupAllOrThrow — varias limpiezas en un solo hook', () => {
  it('3 — si la PRIMERA falla, igual ejecuta las 3 y tira UNA sola vez nombrando la que falló', async () => {
    const orden: string[] = []

    // D-04: cortar en el primer error dejaría las limpiezas siguientes sin correr y la contaminación
    // sería PEOR que la de hoy. Por eso el plural corre todas y recién al final tira.
    const promesa = cleanupAllOrThrow({
      'appointments del tenant principal': fakeOp('a', pgError('permiso denegado', '42501'), orden),
      'schedule_exceptions del tenant principal': fakeOp('b', null, orden),
      'appointments del otro tenant': fakeOp('c', null, orden),
    })

    await expect(promesa).rejects.toThrow(/appointments del tenant principal/)
    expect(orden).toEqual(['a', 'b', 'c'])
  })

  it('4 — con las 3 sanas resuelve y las ejecuta en orden de declaración', async () => {
    const orden: string[] = []

    await expect(
      cleanupAllOrThrow({
        primera: fakeOp('a', null, orden),
        segunda: fakeOp('b', null, orden),
        tercera: fakeOp('c', null, orden),
      })
    ).resolves.toBeUndefined()

    expect(orden).toEqual(['a', 'b', 'c'])
  })

  it('5 — con varias fallidas, el error las nombra a TODAS (no solo a la primera)', async () => {
    const orden: string[] = []

    const promesa = cleanupAllOrThrow({
      'appointments del tenant principal': fakeOp('a', pgError('boom A', '42501'), orden),
      'schedule_exceptions del tenant principal': fakeOp('b', null, orden),
      'appointments del otro tenant': fakeOp('c', pgError('boom C', '23503'), orden),
    })

    const err = await promesa.catch((e: unknown) => e as Error)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain('appointments del tenant principal')
    expect(err.message).toContain('appointments del otro tenant')
    expect(err.message).toContain('boom A')
    expect(err.message).toContain('boom C')
    // La que salió bien NO aparece: el mensaje reporta fallas, no ruido.
    expect(err.message).not.toContain('schedule_exceptions')
    expect(orden).toEqual(['a', 'b', 'c'])
  })
})
