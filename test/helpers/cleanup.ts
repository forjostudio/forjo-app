import type { PostgrestError } from '@supabase/supabase-js'

// ── Teardown que falla FUERTE, con nombre y motivo (ION-02) ──────────────────────────────────────
//
// EL PROBLEMA. Un `await admin.from('appointments').delete().eq(...)` dentro de un afterEach descarta
// el resultado. Si PostgREST rechaza la request (pool saturado, permiso, FK), la limpieza NO ocurre y
// NADIE se entera: el test siguiente arranca con las filas del anterior y falla con un assert numérico
// (“expected 5, got 10”) en un lugar que no tiene nada que ver con la causa. Es la cadena causal exacta
// del flake que motivó este cambio.
//
// ESTO NO INVENTA UN PATRÓN NUEVO. Es la MISMA regla que ya aplican `purgeAbonos` y todos los `seed*`
// de test/helpers/booking-fixtures.ts (`if (x.error) throw new Error('...falló: ' + msg)`), extraída a
// un helper para poder ponerla en UNA línea dentro de los hooks de limpieza.
//
// ALCANCE DELIBERADO: SOLO teardown (D-03). Un `delete()` dentro del cuerpo de un `it(...)` ya está
// cubierto por los asserts de ESE test — si falla, falla ahí, en su archivo. El de teardown es el único
// cuya falla es a la vez invisible Y se filtra al test SIGUIENTE.

/** Lo único que a la limpieza le importa de la respuesta de PostgREST. */
export interface CleanupResult {
  error: PostgrestError | null
}

/**
 * Una operación de limpieza pendiente de ejecutar.
 *
 * Es un `PromiseLike`, no una `Promise`, a propósito: el builder de PostgREST
 * (`admin.from(t).delete().eq(...)`) es LAZY — construirlo no dispara el request, se dispara recién al
 * await. Gracias a eso se puede armar el mapa entero de operaciones y dejar que el helper las ejecute
 * en el orden que él decide.
 */
export type CleanupOp = PromiseLike<CleanupResult>

const PREFIJO = '[test/cleanup]'

// El motivo incluye `message` y, cuando existe, el `code` de Postgres (23503, 42501, …), que es lo que
// permite distinguir “se cayó la conexión” de “una FK lo impide”.
// T-ion-02: acá NUNCA va la service-role key ni el contenido de las filas. El label lo escribe el
// desarrollador y describe la TABLA y el tenant, no los datos.
function motivo(error: PostgrestError): string {
  return error.code ? `${error.message} (code ${error.code})` : error.message
}

/**
 * Ejecuta UNA limpieza y, si vuelve con error, tira un Error que nombra qué limpieza falló y por qué.
 *
 * @param label descripción en español de la limpieza (tabla + tenant), p. ej. `'appointments del tenant
 *   principal'`. Es lo único que el desarrollador va a leer cuando esto explote: que sea específico.
 */
export async function cleanupOrThrow(label: string, op: CleanupOp): Promise<void> {
  const { error } = await op
  if (error) throw new Error(`${PREFIJO} limpieza fallida: ${label} — ${motivo(error)}`)
}

/**
 * Ejecuta VARIAS limpiezas en el orden en que fueron declaradas, corriéndolas TODAS aunque alguna
 * falle, y recién al final tira una sola vez nombrando a todas las que fallaron.
 *
 * Por qué no corta en la primera (D-04): un hook que limpia 3 tablas y aborta en la primera dejaría las
 * otras 2 sin limpiar, o sea CONTAMINARÍA MÁS que el comportamiento actual. La única forma de que el
 * teardown falle fuerte sin empeorar el estado es completarlo igual y reportar después.
 *
 * @param ops mapa `label → operación`. Las claves son los labels que aparecerán en el mensaje de error.
 */
export async function cleanupAllOrThrow(ops: Record<string, CleanupOp>): Promise<void> {
  const fallidas: string[] = []

  for (const [label, op] of Object.entries(ops)) {
    // try/catch además del chequeo de `error`: si la request se cae a nivel red, el await REJECTA en vez
    // de devolver `{ error }`, y si eso escapara acá las limpiezas siguientes tampoco correrían.
    try {
      const { error } = await op
      if (error) fallidas.push(`${label}: ${motivo(error)}`)
    } catch (e) {
      fallidas.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (fallidas.length > 0) {
    throw new Error(
      `${PREFIJO} limpieza fallida (${fallidas.length} de ${Object.keys(ops).length}):\n` +
        fallidas.map((f) => `  - ${f}`).join('\n')
    )
  }
}
