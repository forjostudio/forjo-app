import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { LimiteVencido } from '@/lib/con-limite'
import {
  AltaSinConfirmar,
  altaDelNegocio,
  esAltaSinConfirmar,
  pasosDeConfiguracion,
  type ConfiguracionExistente,
} from '@/lib/onboarding-alta'

// ── Tests PUROS del alta idempotente del negocio (quick 261124-iu8) ──────────────────────────────
// `altaDelNegocio` decide, bajo un solo límite de tiempo, si crear, retomar o no escribir nada. Acá
// se prueba con fakes (sin Supabase ni red) que NUNCA arma un segundo negocio del mismo dueño, que
// falla cerrado cuando no puede leer, y que un intento vencido queda inerte aunque lo de abajo
// resuelva más tarde (Promise.race no cancela nada).

const DUENO = 'uid-dueno'
const SLUG = 'mi-negocio'
const NADA: ConfiguracionExistente = { serviceIds: [], profesionales: false, horarios: false }

type Fila = { id: string; slug: string }

function fakes(over: Partial<{
  usuario: () => PromiseLike<string | null>
  negocios: (ownerId: string, signal: AbortSignal) => PromiseLike<{ data: Fila[] | null; error: unknown; status?: number }>
  config: (businessId: string, signal: AbortSignal) => PromiseLike<ConfiguracionExistente>
  insert: (ownerId: string, signal: AbortSignal) => PromiseLike<{ data: Fila | null; error: unknown; status?: number }>
}> = {}) {
  const obtenerUsuarioId = vi.fn(over.usuario ?? (async () => DUENO))
  const buscarNegociosDelDueno = vi.fn(over.negocios ?? (async () => ({ data: [] as Fila[], error: null, status: 200 })))
  const leerConfiguracion = vi.fn(over.config ?? (async () => NADA))
  const insertarNegocio = vi.fn(over.insert ?? (async () => ({ data: { id: 'b-nuevo', slug: SLUG }, error: null, status: 201 })))
  return { obtenerUsuarioId, buscarNegociosDelDueno, leerConfiguracion, insertarNegocio }
}

const correr = (f: ReturnType<typeof fakes>, limiteMs = 20_000) =>
  altaDelNegocio<Fila>({ limiteMs, slug: SLUG, ...f })

/** Promesa controlable desde afuera, que además registra el signal que recibió. */
function diferida<T>() {
  let resolver!: (v: T) => void
  const promesa = new Promise<T>((ok) => { resolver = ok })
  return { promesa, resolver }
}

function seguir<T>(p: Promise<T>) {
  const estado: { s: 'pendiente' | 'resuelta' | 'rechazada'; v?: T; e?: unknown } = { s: 'pendiente' }
  p.then((v) => { estado.s = 'resuelta'; estado.v = v }, (e) => { estado.s = 'rechazada'; estado.e = e })
  return estado
}

describe('altaDelNegocio: crear, retomar o no escribir', () => {
  it('sin negocios del dueño: inserta con el ownerId de la sesión y devuelve creado', async () => {
    const f = fakes()
    const r = await correr(f)
    expect(r).toEqual({ tipo: 'creado', negocio: { id: 'b-nuevo', slug: SLUG } })
    expect(f.buscarNegociosDelDueno).toHaveBeenCalledWith(DUENO, expect.any(AbortSignal))
    expect(f.insertarNegocio).toHaveBeenCalledWith(DUENO, expect.any(AbortSignal))
    expect(f.leerConfiguracion).not.toHaveBeenCalled()
  })

  it('con un negocio de OTRO slug: ya-existia, sin insertar ni leer configuración', async () => {
    const f = fakes({ negocios: async () => ({ data: [{ id: 'b-otro', slug: 'otro-slug' }], error: null, status: 200 }) })
    await expect(correr(f)).resolves.toEqual({ tipo: 'ya-existia' })
    expect(f.insertarNegocio).not.toHaveBeenCalled()
    expect(f.leerConfiguracion).not.toHaveBeenCalled()
  })

  it('con un negocio del MISMO slug (aunque haya otros): retomado con lo que ya tiene, sin insertar', async () => {
    const yaTiene: ConfiguracionExistente = { serviceIds: ['s1'], profesionales: true, horarios: false }
    const f = fakes({
      negocios: async () => ({ data: [{ id: 'b-otro', slug: 'otro' }, { id: 'b-mio', slug: SLUG }], error: null, status: 200 }),
      config: async () => yaTiene,
    })
    await expect(correr(f)).resolves.toEqual({ tipo: 'retomado', negocio: { id: 'b-mio', slug: SLUG }, yaTiene })
    expect(f.leerConfiguracion).toHaveBeenCalledWith('b-mio', expect.any(AbortSignal))
    expect(f.insertarNegocio).not.toHaveBeenCalled()
  })

  it('si leer la configuración tira, el intento falla con ese error (sin retomado ni escritura)', async () => {
    const boom = new Error('no pude leer')
    const f = fakes({
      negocios: async () => ({ data: [{ id: 'b-mio', slug: SLUG }], error: null, status: 200 }),
      config: async () => { throw boom },
    })
    await expect(correr(f)).rejects.toBe(boom)
    expect(f.insertarNegocio).not.toHaveBeenCalled()
  })

  it('usuario null: No autenticado, sin buscar ni insertar', async () => {
    const f = fakes({ usuario: async () => null })
    await expect(correr(f)).rejects.toThrow('No autenticado')
    expect(f.buscarNegociosDelDueno).not.toHaveBeenCalled()
    expect(f.insertarNegocio).not.toHaveBeenCalled()
  })

  it('búsqueda con error del server: rechaza con ESE error y NO inserta (fail-closed)', async () => {
    const errBusqueda = { code: '42501', message: 'rls' }
    const f = fakes({ negocios: async () => ({ data: null, error: errBusqueda, status: 403 }) })
    await expect(correr(f)).rejects.toBe(errBusqueda)
    expect(f.insertarNegocio).not.toHaveBeenCalled()
  })

  it('búsqueda que falla SIN respuesta HTTP (status 0 o sin status): AltaSinConfirmar y NO inserta', async () => {
    for (const status of [0, undefined]) {
      const f = fakes({ negocios: async () => ({ data: null, error: { message: 'TypeError: Failed to fetch' }, status }) })
      await expect(correr(f)).rejects.toBeInstanceOf(AltaSinConfirmar)
      expect(f.insertarNegocio).not.toHaveBeenCalled()
    }
  })

  it('insert con error y status HTTP (23505): rechaza con ESE error, no AltaSinConfirmar', async () => {
    const dup = { code: '23505', message: 'duplicate key' }
    const f = fakes({ insert: async () => ({ data: null, error: dup, status: 409 }) })
    const e = await correr(f).catch((x) => x)
    expect(e).toBe(dup)
    expect(esAltaSinConfirmar(e)).toBe(false)
  })

  it('insert que falla SIN respuesta HTTP (status 0 o sin status): AltaSinConfirmar', async () => {
    for (const status of [0, undefined]) {
      const f = fakes({ insert: async () => ({ data: null, error: { message: 'TypeError: Failed to fetch' }, status }) })
      const e = await correr(f).catch((x) => x)
      expect(e).toBeInstanceOf(AltaSinConfirmar)
      expect((e as Error).name).toBe('AltaSinConfirmar')
      expect(esAltaSinConfirmar(e)).toBe(true)
    }
  })

  it('insert sin error pero sin data: rechaza (no hay negocio que devolver)', async () => {
    const f = fakes({ insert: async () => ({ data: null, error: null, status: 201 }) })
    await expect(correr(f)).rejects.toThrow()
  })
})

describe('altaDelNegocio: el intento vencido queda inerte (DC-4)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('obtenerUsuarioId colgado: LimiteVencido a limiteMs; si después resuelve, ni busca ni inserta', async () => {
    const usuario = diferida<string | null>()
    const f = fakes({ usuario: () => usuario.promesa })
    const e = seguir(correr(f, 20_000))
    await vi.advanceTimersByTimeAsync(19_999)
    expect(e.s).toBe('pendiente')
    await vi.advanceTimersByTimeAsync(1)
    expect(e.e).toBeInstanceOf(LimiteVencido)
    expect(esAltaSinConfirmar(e.e)).toBe(true)
    usuario.resolver(DUENO)
    await vi.advanceTimersByTimeAsync(100)
    expect(f.buscarNegociosDelDueno).not.toHaveBeenCalled()
    expect(f.insertarNegocio).not.toHaveBeenCalled()
  })

  it('búsqueda colgada: LimiteVencido, su signal abortado, y si después vuelve vacía NO inserta', async () => {
    const busqueda = diferida<{ data: Fila[] | null; error: unknown; status?: number }>()
    let signalBusqueda: AbortSignal | null = null
    const f = fakes({ negocios: (_o, s) => { signalBusqueda = s; return busqueda.promesa } })
    const e = seguir(correr(f, 20_000))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(e.e).toBeInstanceOf(LimiteVencido)
    expect(signalBusqueda!.aborted).toBe(true)
    busqueda.resolver({ data: [], error: null, status: 200 })
    await vi.advanceTimersByTimeAsync(100)
    expect(f.insertarNegocio).not.toHaveBeenCalled()
  })

  it('leer configuración colgada: LimiteVencido (sin retomado)', async () => {
    const f = fakes({
      negocios: async () => ({ data: [{ id: 'b-mio', slug: SLUG }], error: null, status: 200 }),
      config: () => new Promise<ConfiguracionExistente>(() => {}),
    })
    const e = seguir(correr(f, 20_000))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(e.e).toBeInstanceOf(LimiteVencido)
    expect(f.insertarNegocio).not.toHaveBeenCalled()
  })

  it('insert colgado: LimiteVencido y el signal del insert quedó abortado', async () => {
    let signalInsert: AbortSignal | null = null
    const f = fakes({ insert: (_o, s) => { signalInsert = s; return new Promise(() => {}) } })
    const e = seguir(correr(f, 20_000))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(e.e).toBeInstanceOf(LimiteVencido)
    expect(signalInsert!.aborted).toBe(true)
  })
})

describe('esAltaSinConfirmar', () => {
  it('true para LimiteVencido y AltaSinConfirmar; false para cualquier otro', () => {
    expect(esAltaSinConfirmar(new LimiteVencido(1))).toBe(true)
    expect(esAltaSinConfirmar(new AltaSinConfirmar({ message: 'x' }))).toBe(true)
    expect(esAltaSinConfirmar(new Error('No autenticado'))).toBe(false)
    expect(esAltaSinConfirmar({ code: '23505' })).toBe(false)
    expect(esAltaSinConfirmar(null)).toBe(false)
  })
})

describe('pasosDeConfiguracion (DC-3: retomar sin duplicar)', () => {
  const WIZARD = ['s1', 's2']

  it('creado: los tres pasos y los ids del wizard', () => {
    expect(pasosDeConfiguracion({ tipo: 'creado' }, WIZARD)).toEqual({ servicios: true, profesionales: true, horarios: true, idsVigentes: WIZARD })
  })

  it('retomado sin nada: los tres pasos', () => {
    expect(pasosDeConfiguracion({ tipo: 'retomado', yaTiene: NADA }, WIZARD)).toEqual({ servicios: true, profesionales: true, horarios: true, idsVigentes: WIZARD })
  })

  it('retomado con servicios, profesionales y franjas: no aplica nada', () => {
    const r = pasosDeConfiguracion({ tipo: 'retomado', yaTiene: { serviceIds: ['s1', 's2'], profesionales: true, horarios: true } }, WIZARD)
    expect(r).toMatchObject({ servicios: false, profesionales: false, horarios: false })
  })

  it('retomado con sólo servicios: saltea servicios y el mapeo apunta sólo a ids que ya existen', () => {
    const r = pasosDeConfiguracion({ tipo: 'retomado', yaTiene: { serviceIds: ['s1', 'x9'], profesionales: false, horarios: false } }, WIZARD)
    expect(r).toEqual({ servicios: false, profesionales: true, horarios: true, idsVigentes: ['s1'] })
  })
})
