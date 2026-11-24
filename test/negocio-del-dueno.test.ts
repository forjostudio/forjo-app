import { describe, it, expect, expectTypeOf, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Quick 261124-neg: «falló la lectura del negocio» no es «no tiene negocio» ─────────────────────
//
// EL BUG. El layout del panel, `/` y las 14 pantallas leían el negocio con
// `.eq('owner_id', user.id).single()` y, si no volvía `data`, mandaban a `/onboarding`. `.single()`
// devuelve error en TRES casos distintos y el código sólo miraba `data`:
//   1. 0 filas (el dueño de verdad no tiene negocio) → el único que corresponde al wizard.
//   2. 2+ filas (`owner_id` no es unique) → el dueño no entraba NUNCA: loop panel → wizard →
//      `ya-existia` → integraciones → panel.
//   3. un error de red o de PostgREST → un corte momentáneo mandaba al dueño a rehacer el wizard, que
//      no verifica si ya hay negocio: la puerta a un segundo negocio.
//
// Lo que este test congela:
// - `negocioDelDueno` separa los tres casos con un discriminado y nunca expone el mensaje del error.
// - La consulta exacta: `from('businesses')` → `select(<columnas>)` → `eq('owner_id', <sesión>)` →
//   `order('created_at', asc)` → `limit(1)` → `maybeSingle()`, en ese orden y SIN `single`. El fake
//   resuelve también `single`, así que una regresión a `.single()` se ve en el registro de llamadas.
// - `negocioDelPanel`: 0 filas → wizard; error → lanza `LecturaDelNegocioFallida` sin llamar a
//   `redirect` (lo atrapa `app/(dashboard)/error.tsx`); 1 fila → la fila.
// - El tipado de cada pantalla no cambia (`'*'` sigue siendo `any`, `'id'` sigue siendo `{ id: any }`).
//   Lo verifica `tsc`; en runtime `expectTypeOf` no hace nada.
// - El tracer de /finances: error → `LecturaDelNegocioFallida`, nunca el wizard.
//
// Carril `pure`: Supabase, `next/navigation` y el cliente de Finanzas van mockeados.
const h = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('next/navigation', () => ({ redirect: h.redirect }))
vi.mock('@/lib/supabase/server', () => ({ createClient: h.createClientMock }))
vi.mock('@/app/(dashboard)/finances/finances-client', () => ({ FinancesClient: () => null }))

import { negocioDelDueno, negocioDelPanel, LecturaDelNegocioFallida } from '@/lib/negocio-del-dueno'
import FinancesPage from '@/app/(dashboard)/finances/page'
import { FinancesClient } from '@/app/(dashboard)/finances/finances-client'

type Respuesta = { data: unknown; error: { code?: string; message: string } | null }

/**
 * Cliente de sesión falso: registra cada llamada del query builder en `llamadas` y resuelve
 * `maybeSingle` Y `single` con la misma respuesta configurada (así la regresión se ve en el registro,
 * no en un `undefined is not a function`).
 */
function fakeSupabase(respuesta: Respuesta) {
  const llamadas: unknown[][] = []
  const builder = {
    select: (cols: string) => {
      llamadas.push(['select', cols])
      return builder
    },
    eq: (col: string, val: unknown) => {
      llamadas.push(['eq', col, val])
      return builder
    },
    order: (col: string, opts: unknown) => {
      llamadas.push(['order', col, opts])
      return builder
    },
    limit: (n: number) => {
      llamadas.push(['limit', n])
      return builder
    },
    maybeSingle: async () => {
      llamadas.push(['maybeSingle'])
      return respuesta
    },
    single: async () => {
      llamadas.push(['single'])
      return respuesta
    },
  }
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (tabla: string) => {
      llamadas.push(['from', tabla])
      return builder
    },
  }
  return { client, llamadas, sb: client as unknown as SupabaseClient }
}

const NEGOCIO = { id: 'biz-1', name: 'Barbería' }
const SIN_FILAS: Respuesta = { data: null, error: null }

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('negocioDelDueno: separa 0 filas, 1 fila y error', () => {
  it('1 fila → { ok: true, business }', async () => {
    const { sb } = fakeSupabase({ data: NEGOCIO, error: null })
    expect(await negocioDelDueno(sb, 'user-1', '*')).toEqual({ ok: true, business: NEGOCIO })
  })

  it('0 filas → sin-negocio, sin loguear', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sb } = fakeSupabase(SIN_FILAS)
    expect(await negocioDelDueno(sb, 'user-1', '*')).toEqual({ ok: false, reason: 'sin-negocio' })
    expect(log).not.toHaveBeenCalled()
  })

  it.each([
    ['error de red', { message: 'fetch failed' }, 'fetch failed'],
    ['error de PostgREST', { code: 'PGRST301', message: 'x' }, 'PGRST301'],
  ])('%s → error, logueando sólo code ?? message y sin exponerlo', async (_label, error, logueado) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sb } = fakeSupabase({ data: null, error })
    const r = await negocioDelDueno(sb, 'user-1', '*')
    expect(r).toEqual({ ok: false, reason: 'error' })
    expect(JSON.stringify(r)).not.toContain(error.message)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain('[negocio-del-dueno]')
    expect(log.mock.calls[0][1]).toBe(logueado)
  })

  it('pide el más viejo del dueño de la sesión con maybeSingle, nunca single (D-01, T-neg-02)', async () => {
    const { sb, llamadas } = fakeSupabase({ data: NEGOCIO, error: null })
    await negocioDelDueno(sb, 'user-1', 'id, vertical')
    expect(llamadas).toEqual([
      ['from', 'businesses'],
      ['select', 'id, vertical'],
      ['eq', 'owner_id', 'user-1'],
      ['order', 'created_at', { ascending: true }],
      ['limit', 1],
      ['maybeSingle'],
    ])
    expect(llamadas.some((l) => l[0] === 'single')).toBe(false)
  })
})

describe('negocioDelPanel: la política de las pantallas del panel', () => {
  it('0 filas → /onboarding (D-02)', async () => {
    const { sb } = fakeSupabase(SIN_FILAS)
    await expect(negocioDelPanel(sb, 'user-1', '*')).rejects.toThrow('REDIRECT:/onboarding')
  })

  it('error → LecturaDelNegocioFallida, sin pasar por redirect (D-03)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sb } = fakeSupabase({ data: null, error: { message: 'fetch failed' } })
    await expect(negocioDelPanel(sb, 'user-1', '*')).rejects.toBeInstanceOf(LecturaDelNegocioFallida)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('el error lanzado no lleva el mensaje de Supabase (T-neg-01)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sb } = fakeSupabase({ data: null, error: { message: 'secreto-de-postgrest' } })
    const e = await negocioDelPanel(sb, 'user-1', '*').catch((x: unknown) => x)
    expect(e).toBeInstanceOf(LecturaDelNegocioFallida)
    expect((e as Error).name).toBe('LecturaDelNegocioFallida')
    expect((e as Error).message).not.toContain('secreto-de-postgrest')
  })

  it('1 fila → la fila', async () => {
    const { sb } = fakeSupabase({ data: NEGOCIO, error: null })
    expect(await negocioDelPanel(sb, 'user-1', '*')).toEqual(NEGOCIO)
  })

  it('conserva el tipado de cada pantalla (DC-4, verificado por tsc)', async () => {
    const { sb } = fakeSupabase({ data: { id: 'biz-1', vertical: 'general', type: null }, error: null })

    const todo = await negocioDelPanel(sb, 'user-1', '*')
    expectTypeOf(todo).toBeAny()

    const r = await negocioDelPanel(sb, 'user-1', 'id')
    expectTypeOf(r).not.toBeAny()
    expectTypeOf<keyof typeof r>().toEqualTypeOf<'id'>()
    expectTypeOf(r.id).toBeAny()

    const tres = await negocioDelPanel(sb, 'user-1', 'id, vertical, type')
    expectTypeOf<keyof typeof tres>().toEqualTypeOf<'id' | 'vertical' | 'type'>()
    expectTypeOf(tres.vertical).toBeAny()
  })
})

describe('tracer /finances: un error de lectura nunca manda al wizard', () => {
  it('error → LecturaDelNegocioFallida (nunca /onboarding)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeSupabase({ data: null, error: { message: 'fetch failed' } })
    h.createClientMock.mockResolvedValue(client)
    await expect(FinancesPage()).rejects.toBeInstanceOf(LecturaDelNegocioFallida)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('0 filas → /onboarding', async () => {
    const { client } = fakeSupabase(SIN_FILAS)
    h.createClientMock.mockResolvedValue(client)
    await expect(FinancesPage()).rejects.toThrow('REDIRECT:/onboarding')
  })

  it('con negocio → FinancesClient con el businessId del dueño', async () => {
    const { client } = fakeSupabase({ data: { id: 'biz-1' }, error: null })
    h.createClientMock.mockResolvedValue(client)
    const el = (await FinancesPage()) as { props: { children: { type: unknown; props: Record<string, unknown> } } }
    expect(el.props.children.type).toBe(FinancesClient)
    expect(el.props.children.props).toMatchObject({ businessId: 'biz-1' })
  })
})
