import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { LimiteVencido, conLimite, crearPlazo, aRespuestaFallida } from '@/lib/con-limite'

// ── Tests PUROS del límite de tiempo (quick 261124-iu8) ──────────────────────────────────────────
// `conLimite` existe porque ninguna capa de abajo tiene tope: el lock de auth-js 2.106.2 encola sin
// timeout y los fetch de supabase-js tampoco tienen. Acá se prueba con timers falsos que el límite
// vence cuando tiene que vencer, que avisa a la tarea (signal abortado) y que no deja timers ni
// rechazos sueltos.

/** Una tarea que no termina nunca, salvo que la resuelvan/rechacen desde afuera. */
function colgada<T>() {
  let resolver!: (v: T) => void
  let rechazar!: (e: unknown) => void
  let signal: AbortSignal | null = null
  const tarea = (s: AbortSignal) => {
    signal = s
    return new Promise<T>((ok, fail) => { resolver = ok; rechazar = fail })
  }
  return { tarea, resolver: (v: T) => resolver(v), rechazar: (e: unknown) => rechazar(e), signal: () => signal }
}

/** Estado de una promesa sin esperarla: 'pendiente' | 'resuelta' | 'rechazada'. */
function seguir<T>(p: Promise<T>) {
  const estado: { s: 'pendiente' | 'resuelta' | 'rechazada'; v?: T; e?: unknown } = { s: 'pendiente' }
  p.then((v) => { estado.s = 'resuelta'; estado.v = v }, (e) => { estado.s = 'rechazada'; estado.e = e })
  return estado
}

describe('conLimite', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('una tarea que termina antes del límite devuelve su valor y no deja timers', async () => {
    const v = await conLimite(1000, async () => 42)
    expect(v).toBe(42)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('acepta un thenable (como los builders de PostgREST)', async () => {
    const thenable = { then: (ok: (v: string) => void) => ok('fila') }
    await expect(conLimite(1000, () => thenable as PromiseLike<string>)).resolves.toBe('fila')
  })

  it('una tarea colgada sigue pendiente a ms - 1 y vence a ms con LimiteVencido; el signal queda abortado', async () => {
    const c = colgada<number>()
    const e = seguir(conLimite(1000, c.tarea))
    await vi.advanceTimersByTimeAsync(999)
    expect(e.s).toBe('pendiente')
    expect(c.signal()?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(e.s).toBe('rechazada')
    expect(e.e).toBeInstanceOf(LimiteVencido)
    expect((e.e as LimiteVencido).ms).toBe(1000)
    expect((e.e as Error).name).toBe('LimiteVencido')
    expect(c.signal()?.aborted).toBe(true)
    expect(c.signal()?.reason).toBeInstanceOf(LimiteVencido)
  })

  it('una tarea que rechaza antes del límite propaga SU error y limpia el timer', async () => {
    const propio = new Error('propio')
    await expect(conLimite(1000, async () => { throw propio })).rejects.toBe(propio)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('una tarea que tira sincrónico también rechaza (y no deja timers)', async () => {
    const propio = new Error('sincronico')
    await expect(conLimite(1000, () => { throw propio })).rejects.toBe(propio)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('una tarea que rechaza DESPUÉS del vencimiento no produce un rechazo sin manejar', async () => {
    const c = colgada<number>()
    const e = seguir(conLimite(100, c.tarea))
    await vi.advanceTimersByTimeAsync(100)
    expect(e.e).toBeInstanceOf(LimiteVencido)
    // Si este rechazo tardío quedara sin manejar, vitest marcaría la corrida como error.
    c.rechazar(new Error('tarde'))
    c.resolver(1)
    await vi.advanceTimersByTimeAsync(10)
    expect(e.e).toBeInstanceOf(LimiteVencido)
  })

  it('con ms <= 0 rechaza con LimiteVencido sin llamar a la tarea', async () => {
    const tarea = vi.fn(async () => 1)
    await expect(conLimite(0, tarea)).rejects.toBeInstanceOf(LimiteVencido)
    await expect(conLimite(-5, tarea)).rejects.toBeInstanceOf(LimiteVencido)
    expect(tarea).not.toHaveBeenCalled()
  })
})

describe('crearPlazo', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('tope por paso dentro de un total compartido', async () => {
    const enPlazo = crearPlazo(20_000, 10_000)

    // Paso 1 colgado: vence a los 10 s (el tope del paso), no a los 20.
    const p1 = seguir(enPlazo(colgada<number>().tarea))
    await vi.advanceTimersByTimeAsync(9_999)
    expect(p1.s).toBe('pendiente')
    await vi.advanceTimersByTimeAsync(1)
    expect(p1.e).toBeInstanceOf(LimiteVencido)
    expect((p1.e as LimiteVencido).ms).toBe(10_000)

    // Paso 2 corre bien con lo que queda.
    await expect(enPlazo(async () => 'ok')).resolves.toBe('ok')

    // Pasan 3 s más; el paso 3 colgado vence en lo restante (7 s), así el total no pasa de 20 s.
    await vi.advanceTimersByTimeAsync(3_000)
    const p3 = seguir(enPlazo(colgada<number>().tarea))
    await vi.advanceTimersByTimeAsync(6_999)
    expect(p3.s).toBe('pendiente')
    await vi.advanceTimersByTimeAsync(1)
    expect(p3.e).toBeInstanceOf(LimiteVencido)
    expect((p3.e as LimiteVencido).ms).toBe(7_000)

    // Pasado el total, el próximo rechaza de inmediato sin llamar a la tarea.
    const tarea = vi.fn(async () => 1)
    await expect(enPlazo(tarea)).rejects.toBeInstanceOf(LimiteVencido)
    expect(tarea).not.toHaveBeenCalled()
  })

  it('el reloj se puede inyectar', async () => {
    let ahora = 1_000
    const enPlazo = crearPlazo(500, 400, () => ahora)
    ahora = 1_450
    const c = colgada<number>()
    const e = seguir(enPlazo(c.tarea))
    await vi.advanceTimersByTimeAsync(49)
    expect(e.s).toBe('pendiente')
    await vi.advanceTimersByTimeAsync(1)
    expect((e.e as LimiteVencido).ms).toBe(50)
  })
})

describe('aRespuestaFallida', () => {
  it('un LimiteVencido da code limite_vencido', () => {
    const r = aRespuestaFallida(new LimiteVencido(10_000))
    expect(r.data).toBeNull()
    expect(r.error.code).toBe('limite_vencido')
    expect(typeof r.error.message).toBe('string')
  })

  it('cualquier otro rechazo da code rechazo', () => {
    expect(aRespuestaFallida(new Error('red')).error).toEqual({ code: 'rechazo', message: 'red' })
    expect(aRespuestaFallida('cadena').error.code).toBe('rechazo')
  })
})
