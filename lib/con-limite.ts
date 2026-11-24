// ── Límite de tiempo para awaits que no tienen tope (quick 261124-iu8) ─────────────────────────────
//
// POR QUÉ EXISTE: el alta del onboarding quedaba en «Guardando...» para siempre cuando un refresh de
// token no volvía (debug `onboarding-guardando-colgado`). Ninguna capa de abajo tiene timeout: auth-js
// 2.106.2 encola cada operación detrás de su lock en-proceso SIN tope, el `getSession()` que
// `fetchWithAuth` hace antes de cada insert/rpc/storage espera detrás de ese mismo lock, y los fetch de
// supabase-js tampoco tienen timeout. La opción `db.timeout` de supabase-js no alcanza: corre DESPUÉS
// de esperar el lock y no cubre `getUser()`.
//
// `Promise.race` NO cancela nada: la tarea vencida sigue corriendo y puede resolver más tarde. Por eso
// cada tarea recibe un `AbortSignal` que se aborta al vencer: quien la escribe tiene que cortar por
// `signal.aborted` después de cada await y pasárselo a cada query (`.abortSignal(signal)`).
//
// Sin imports de React ni de Supabase: se testea puro (lib/con-limite.test.ts).

export class LimiteVencido extends Error {
  readonly ms: number
  constructor(ms: number) {
    super(`Se venció el límite de ${ms} ms`)
    this.name = 'LimiteVencido'
    this.ms = ms
  }
}

/**
 * Corre `tarea` con un tope de `ms`. Si termina antes, resuelve/rechaza con lo suyo y limpia el timer.
 * Al vencer aborta el signal de la tarea (reason = `LimiteVencido`) y rechaza con `LimiteVencido`; lo
 * que la tarea haga después se ignora (incluido un rechazo tardío: queda manejado acá adentro).
 * Con `ms <= 0` rechaza sin llamar a la tarea. Acepta thenables (los builders de PostgREST lo son).
 */
export function conLimite<T>(ms: number, tarea: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  if (!(ms > 0)) return Promise.reject(new LimiteVencido(ms))
  const control = new AbortController()
  return new Promise<T>((resolve, reject) => {
    let terminado = false
    const timer = setTimeout(() => {
      if (terminado) return
      terminado = true
      const vencido = new LimiteVencido(ms)
      control.abort(vencido)
      reject(vencido)
    }, ms)
    const cerrar = () => {
      if (terminado) return false
      terminado = true
      clearTimeout(timer)
      return true
    }
    let enCurso: PromiseLike<T>
    try {
      enCurso = tarea(control.signal)
    } catch (e) {
      if (cerrar()) reject(e)
      return
    }
    Promise.resolve(enCurso).then(
      (v) => { if (cerrar()) resolve(v) },
      (e) => { if (cerrar()) reject(e) },
    )
  })
}

/**
 * Plazo COMPARTIDO con tope por paso: cada tarea corre con `min(pasoMs, lo que queda del total)`.
 * Un paso trabado no le come el tiempo a los demás (vence a `pasoMs`), y si todo está trabado (el lock
 * de auth entero) la suma igual no pasa de `totalMs`. Pasado el total, rechaza sin llamar a la tarea.
 */
export function crearPlazo(totalMs: number, pasoMs: number, reloj: () => number = () => Date.now()) {
  const fin = reloj() + totalMs
  return <T>(tarea: (signal: AbortSignal) => PromiseLike<T>): Promise<T> =>
    conLimite(Math.min(pasoMs, fin - reloj()), tarea)
}

/**
 * Para `.catch(aRespuestaFallida)` en los sitios que desestructuran `{ error }` de una respuesta de
 * PostgREST: un vencimiento (o cualquier rechazo) cae en la MISMA rama de error de siempre, con un
 * `code` que se puede loguear.
 */
export function aRespuestaFallida(e: unknown): { data: null; error: { code: 'limite_vencido' | 'rechazo'; message: string } } {
  if (e instanceof LimiteVencido) return { data: null, error: { code: 'limite_vencido', message: e.message } }
  return { data: null, error: { code: 'rechazo', message: e instanceof Error ? e.message : String(e) } }
}
