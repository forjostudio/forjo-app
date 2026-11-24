import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement, type ReactElement } from 'react'

// ── Quick 261124-neg: adónde va el dueño cuando la lectura del negocio falla ──────────────────────
//
// El layout del panel y `/` decidían «no tiene negocio» a partir de un `.single()` que también falla
// con 2+ filas y con errores de red, y en los tres casos mandaban al wizard. Lo que este test congela:
//
// Layout (`app/(dashboard)/layout.tsx`):
// - sin sesión → `/login`; 0 filas → `/onboarding` (como siempre).
// - error de lectura → NO redirige NI lanza: devuelve el aviso «No pudimos cargar tu panel» SIN los
//   `children`. No lanza porque el `error.tsx` del route group no envuelve al layout de su mismo
//   segmento (doc de error.js de Next 16): un throw acá terminaría en la pantalla genérica de Next,
//   en inglés y sin «Reintentar» del panel.
// - `suspended` → `/suspendido`, chequeado DESPUÉS de resolver el negocio (el orden no cambia).
// - negocio activo → el árbol del panel con los `children` adentro.
//
// `/` (`app/page.tsx`):
// - 1 fila → `/dashboard`; 0 filas → `/onboarding`; error → `/dashboard`, NUNCA al wizard (el layout
//   vuelve a leer y decide); sin sesión → `/login`.
//
// Carril `pure`: Supabase, `next/navigation` y todos los componentes del chrome van mockeados. Los
// elementos no se renderizan: sólo se inspecciona el árbol que devuelve el server component.
const h = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
  PanelErrorDeCarga: function PanelErrorDeCargaCentinela() {
    return null
  },
  nada: () => null,
}))

vi.mock('next/navigation', () => ({ redirect: h.redirect }))
vi.mock('@/lib/supabase/server', () => ({ createClient: h.createClientMock }))
vi.mock('@/components/dashboard/sidebar', () => ({ Sidebar: h.nada }))
vi.mock('@/components/dashboard/panel-bottom-nav', () => ({ PanelBottomNav: h.nada }))
vi.mock('@/components/dashboard/panel-top-bar', () => ({ PanelTopBar: h.nada }))
vi.mock('@/components/dashboard/plan-banner', () => ({ PlanBanner: h.nada }))
vi.mock('@/components/dashboard/test-mode-banner', () => ({ TestModeBanner: h.nada }))
vi.mock('@/components/dashboard/mp-connection-banner', () => ({ MpConnectionBanner: h.nada }))
vi.mock('@/components/dashboard/unsaved-changes-guard', () => ({ UnsavedChangesProvider: h.nada }))
vi.mock('@/lib/use-terminology', () => ({ VerticalProvider: h.nada }))
vi.mock('@/components/palette-script', () => ({ PaletteScript: h.nada }))
vi.mock('@/components/theme-sync', () => ({ ThemeSync: h.nada }))
vi.mock('@/lib/verticals', () => ({ resolveVertical: () => ({ key: 'general' }) }))
vi.mock('@/components/dashboard/panel-error-de-carga', () => ({ PanelErrorDeCarga: h.PanelErrorDeCarga }))

import DashboardLayout from '@/app/(dashboard)/layout'
import Home from '@/app/page'

type Respuesta = { data: unknown; error: { code?: string; message: string } | null }

/** Cliente de sesión falso con un builder encadenable que resuelve `maybeSingle` y `single` igual. */
function fakeSupabase(respuesta: Respuesta, user: { id: string } | null = { id: 'user-1' }) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'limit']) builder[m] = () => builder
  builder.maybeSingle = async () => respuesta
  builder.single = async () => respuesta
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from: () => builder,
  }
}

const CHILDREN = createElement('span', { id: 'children-centinela' })
const ACTIVO = { id: 'biz-1', plan_status: 'active', trial_ends_at: null, palette: null, theme: null, font: null }

/** Recorre el árbol devuelto (sin renderizarlo) buscando un nodo que cumpla `pred`. */
function buscar(nodo: unknown, pred: (n: ReactElement) => boolean): ReactElement | null {
  if (Array.isArray(nodo)) {
    for (const n of nodo) {
      const r = buscar(n, pred)
      if (r) return r
    }
    return null
  }
  if (!nodo || typeof nodo !== 'object' || !('props' in nodo)) return null
  const el = nodo as ReactElement<{ children?: unknown }>
  if (pred(el)) return el
  return buscar(el.props.children, pred)
}

async function destino(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn()
    return null
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec(e instanceof Error ? e.message : '')
    if (!m) throw e
    return m[1]
  }
}

const layout = () => DashboardLayout({ children: CHILDREN })

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('layout del panel: destinos según la lectura del negocio', () => {
  it('sin sesión → /login', async () => {
    h.createClientMock.mockResolvedValue(fakeSupabase({ data: ACTIVO, error: null }, null))
    expect(await destino(layout)).toBe('/login')
  })

  it('0 filas → /onboarding', async () => {
    h.createClientMock.mockResolvedValue(fakeSupabase({ data: null, error: null }))
    expect(await destino(layout)).toBe('/onboarding')
  })

  it('error de lectura → aviso inline «No pudimos cargar tu panel», sin children, sin redirigir (DC-1)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.createClientMock.mockResolvedValue(fakeSupabase({ data: null, error: { message: 'fetch failed' } }))
    const arbol = await layout()
    expect(h.redirect).not.toHaveBeenCalled()
    const aviso = buscar(arbol, (n) => n.type === h.PanelErrorDeCarga)
    expect(aviso, 'el layout no devolvió el aviso del panel').not.toBeNull()
    expect(aviso!.props).toMatchObject({ titulo: 'No pudimos cargar tu panel' })
    expect(buscar(arbol, (n) => n === CHILDREN)).toBeNull()
  })

  it('negocio suspendido → /suspendido (chequeado después del negocio)', async () => {
    h.createClientMock.mockResolvedValue(fakeSupabase({ data: { ...ACTIVO, plan_status: 'suspended' }, error: null }))
    expect(await destino(layout)).toBe('/suspendido')
  })

  it('negocio activo → el árbol del panel con los children adentro', async () => {
    h.createClientMock.mockResolvedValue(fakeSupabase({ data: ACTIVO, error: null }))
    const arbol = await layout()
    expect(buscar(arbol, (n) => n === CHILDREN)).not.toBeNull()
    expect(buscar(arbol, (n) => n.type === h.PanelErrorDeCarga)).toBeNull()
  })
})

describe('/: nunca manda al wizard por un error de lectura (DC-3)', () => {
  it('1 fila → /dashboard', async () => {
    h.createClientMock.mockResolvedValue(fakeSupabase({ data: { id: 'biz-1' }, error: null }))
    expect(await destino(Home)).toBe('/dashboard')
  })

  it('0 filas → /onboarding', async () => {
    h.createClientMock.mockResolvedValue(fakeSupabase({ data: null, error: null }))
    expect(await destino(Home)).toBe('/onboarding')
  })

  it('error → /dashboard, nunca /onboarding', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.createClientMock.mockResolvedValue(fakeSupabase({ data: null, error: { message: 'fetch failed' } }))
    expect(await destino(Home)).toBe('/dashboard')
  })

  it('sin sesión → /login', async () => {
    h.createClientMock.mockResolvedValue(fakeSupabase({ data: null, error: null }, null))
    expect(await destino(Home)).toBe('/login')
  })
})
