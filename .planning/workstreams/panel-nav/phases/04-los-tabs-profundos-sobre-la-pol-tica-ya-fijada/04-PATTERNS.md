# Phase 4: Los tabs profundos sobre la política ya fijada - Pattern Map

**Mapped:** 2026-11-17
**Files analyzed:** 14 (9 modificados, 2 tests nuevos, 1 lib nueva, 1 sonda, docs)
**Analogs found:** 13 / 14 (el único sin analog directo es `lib/panel-tabs.ts` como forma; su contenido sale de RESEARCH §Patrón 7)

Todos los analogs nombrados abajo son source **trackeado** en git (sin mirrors).

## File Classification

| Archivo nuevo/modificado | Rol | Data flow | Analog más cercano | Calidad |
|---|---|---|---|---|
| `lib/panel-history.ts` (causa `'user-switch'`, `panelTabCause`, `drop`, marca del `replace`) | utility (política pura + ejecutor) | event-driven (historial) | sí mismo: `panelHistoryAction` L77-140, `applyPanelView` L841-878, `panelViewUrl` L380-384 | exact |
| `lib/panel-tabs.ts` (NUEVO: grupos + `resolveTab`/`tabSlug`) | utility pura (config) | transform | `resolveViewParam` (`lib/panel-history.ts:742-765`) para la forma de retorno | partial |
| `app/(dashboard)/settings/settings-client.tsx` (L992-1021, L2398) | component client | event-driven (URL↔vista) | `app/(dashboard)/clients/clients-client.tsx:658-723` (`?c=`) | exact |
| `app/(dashboard)/finances/finances-client.tsx` (L200, L1007) | component client | event-driven | `clients-client.tsx:658-723` | exact |
| `app/(dashboard)/agenda/agenda-client.tsx` (L284-291) | component client | event-driven (limpieza de query) | `clients-client.tsx` (`applyPanelView` con causa) | role-match |
| `app/(dashboard)/negocio/page.tsx`, `settings/page.tsx`, `finances/page.tsx` | page (server) | request-response | `app/(dashboard)/clients/page.tsx:35-50` | exact |
| `servicios/`, `equipo/`, `consultorios/page.tsx` | — | — | **CERO diff** (T-1) | n/a |
| `lib/panel-history.test.ts` (casos nuevos) | test unit puro | — | `lib/panel-history.test.ts:562-600` (simulador de pila) y `:985-1001` (stub de `window`) | exact |
| `test/panel-tabs.test.ts` (NUEVO) | test unit puro | — | `lib/panel-history.test.ts:562-600` | exact |
| `test/panel-tabs-cableado.test.ts` (NUEVO, gates estáticos) | test estático | — | `test/panel-history-clients.test.ts:44-79, 180-254` | exact |
| (B1 opcional) `lib/panel-history.ts` `PanelBranchPlan` + `panelBranchPlan` | utility pura | event-driven | `'consume-exit-then-navigate'` (`lib/panel-history.ts:522-527, 689`) | exact |
| (B1) `lib/panel-branch.ts` `runBranchNavigation` | executor | event-driven (2 pasos) | `lib/panel-branch.ts:367-389` | exact |
| (B1) `components/dashboard/unsaved-changes-guard.tsx:241-261` | component | event-driven | su propio `switch` exhaustivo | exact |
| (B1) `test/panel-nav-chrome.test.ts`, `test/panel-branch.test.ts` | test estático/puro | — | `test/panel-nav-chrome.test.ts:251-262` | exact |
| `.planning/debug/probes/panel-back-stack.mjs` (escenarios E-19+) | sonda CDP | — | sí mismo (E-1..E-18) | exact |

## Pattern Assignments

### `lib/panel-history.ts` — causa nueva `'user-switch'` (utility, event-driven)

**Analog:** el propio `PanelViewCause` (L51-63) y el `switch` de `panelHistoryAction` (L112-139). Cada miembro lleva docblock de una línea; el `switch` termina en el candado de exhaustividad:

```ts
    case 'filter':
      return 'replace'
    // ⚠ El saneo CONSUME cuando la entrada es nuestra, no reemplaza. ...
    case 'stale':
      return holding ? 'consume' : 'replace'
    default: {
      // Agregar una causa en la Phase 2 sin decidir su acción NO COMPILA. ...
      const _exhaustivo: never = cause
      return _exhaustivo
    }
```
Las reglas previas al `switch` (L100 `if (foreignOwnsTop) return 'none'`, L106 `concurrent`, L110 `if (from === to) return 'none'`) ya cubren `null → null` y el tab igual: `panelTabCause` no las duplica. Firma de objeto desestructurado con tipos inline (molde L77-89).

### `lib/panel-history.ts` — `applyPanelView`: marca del `replace` + `drop`

**Analog:** L841-878 (hoy):
```ts
export function applyPanelView({ cause, param, from, to }: { cause: PanelViewCause; param: string; from: string | null; to: string | null }): PanelHistoryAction {
  const actual: unknown = window.history.state
  const action = panelHistoryAction({ cause, from, to,
    holding: isPanelViewEntry(actual, param),
    foreignOwnsTop: isForeignOwnedEntry(actual) })
  if (action === 'none') return action
  if (action === 'consume') { window.history.back(); return action }
  const url = panelViewUrl({ pathname: window.location.pathname, search: window.location.search, param, value: to })
  const next = panelViewState(param, to)          // ← punto del defecto (Patrón 3)
  if (action === 'push') window.history.pushState(next, '', url)
  else window.history.replaceState(next, '', url)
  return action
}
```
(compactado; el archivo tiene una propiedad por línea.) Cambio: izar `holding` y `panelViewState(param, action === 'push' || holding ? to : null)`; agregar `drop?: readonly string[]` pasado a `panelViewUrl` (que hoy hace `sp.delete(param)` / `sp.set(param, value)` en L380-384). Mantener **dos llamadas literales separadas** (el docblock L830-833 lo exige para el gate) y el state como **literal fresco** (nunca `...history.state`).

### `lib/panel-tabs.ts` (NUEVO, utility pura, transform)

**Analog de forma de retorno:** `resolveViewParam` (`lib/panel-history.ts:742-765`) — objeto desestructurado de entrada, objeto discriminado de salida, normaliza `''` a `null`:
```ts
  const pedido = param === null || param === '' ? null : param
  if (pedido === resolvedTo) {
    if (param !== null && pedido === null) {
      return { selected: null, reconcile: true, cause: 'stale', to: null }
    }
    ...
```
Contenido (grupos, `Map`, `TAB_PARAM`) = RESEARCH §Patrón 7. Sin React, sin `window` (el módulo de historial "NO decide qué se muestra", `lib/panel-history.ts:31`). Usar `Map`/`Object.hasOwn`, nunca `obj[param]` (`?tab=__proto__`).

### `app/(dashboard)/settings/settings-client.tsx` y `finances-client.tsx` (component, event-driven)

**Analog:** `app/(dashboard)/clients/clients-client.tsx`

**Imports** (L3-4 + bloque `@/lib/panel-history`):
```ts
import { useState, useMemo, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
```
(`const searchParams = useSearchParams()` en L276.)

**Derivar la vista de la URL** (L658-667):
```ts
  const viewParam = searchParams.get(VIEW_PARAM)
  ...
  const view = resolveViewParam({ param: viewParam, resolvedTo: resolved?.id ?? null })
  // Mismo nombre y mismo tipo que antes, para que el resto del archivo no se entere del cambio.
  const selectedId = view.selected
  ...
  const { reconcile: debeReconciliar, cause: causaReconciliacion, to: destinoReconciliacion } = view
```
→ En Finanzas, `const txTab = resuelto.value` conserva el nombre para que L1014-1015 no cambien de forma (criterio 4).

**Efecto de reconciliación (único escritor del desajuste)** (L689-723):
```ts
  useEffect(() => {
    if (hayOverlayAbierto) return
    const enLaUrl = searchParams.get(VIEW_PARAM)
    let escribio = false
    if (
      sanitizeAction({ reconcile: debeReconciliar, param: enLaUrl, lastApplied: reconciliadoRef.current }) === 'apply' &&
      causaReconciliacion !== null
    ) {
      escribio = applyPanelView({ cause: causaReconciliacion, param: VIEW_PARAM, from: enLaUrl, to: destinoReconciliacion }) !== 'none'
    }
    reconciliadoRef.current = reconciledMemo({ reconcile: debeReconciliar, applied: escribio, param: enLaUrl, previous: reconciliadoRef.current })
  }, [searchParams, hayOverlayAbierto, debeReconciliar, causaReconciliacion, destinoReconciliacion])
```
con `const reconciliadoRef = useRef<string | null>(null)` (L676). En settings: gate `grupo !== null && !vueltaDeOAuth` en lugar de `hayOverlayAbierto` (Pitfall 8: un solo escritor).

**Lo que se reemplaza en settings** (L992-1002, hoy):
```ts
  const SECTION_TAB: Record<string, string> = { negocio: 'business', servicios: 'services', equipo: 'professionals', consultorios: 'locations' }
  const isSection = view !== 'config'
  const isNegocio = view === 'negocio'
  const [configTab, setConfigTab] = useState('appearance')
  const [negocioTab, setNegocioTab] = useState('business')
  const tabValue = isNegocio ? negocioTab : isSection ? SECTION_TAB[view] : configTab
  const onTabChange = isNegocio ? setNegocioTab : isSection ? undefined : setConfigTab
```
`SECTION_TAB`, `isSection`, `isNegocio` quedan; la rama de secciones queda **textual** (`SECTION_TAB[view]` / `undefined`, T-1). Se borran los dos `useState` (molde del gate (g) de clients). `<Tabs value={tabValue} onValueChange={onTabChange}>` (L2398) y las dos `TabsList` gateadas por `isNegocio`/`!isSection` (L2404, L2414) no cambian. Valores internos de triggers sin renombrar.

**Finanzas hoy:** L200 `const [txTab, setTxTab] = useState('appointments')`; L1007 `<Tabs value={txTab} onValueChange={setTxTab}>`; L1014-1015 botones de alta por `txTab` (sin cambio). El handler nuevo filtra `detalles.reason !== 'none'` antes de `applyPanelView({ cause: panelTabCause(...) ... })` (Pitfall 4: push sólo con activación).

**Efecto OAuth a convertir** (settings L1008-1021, hoy):
```ts
  useEffect(() => {
    if (!isNegocio) return
    const params = new URLSearchParams(window.location.search)
    ...toasts...
    setNegocioTab('integraciones')
    window.history.replaceState(null, '', '/negocio')
  }, [isNegocio])
```
→ mismo cuerpo, cambia sólo el final por `applyPanelView({ cause: 'programmatic', param: 'tab', from: params.get('tab'), to: 'integraciones', drop: ['mp', 'google'] })`. Se sigue leyendo `window.location` (no `searchParams`) para que modo estricto no duplique el toast. Comentarios nuevos sin los literales de los métodos de historial (Pitfall 2).

### `app/(dashboard)/agenda/agenda-client.tsx` L284-291 (D-10)

Hoy:
```ts
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get('google')
    if (!g) return
    if (g === 'connected') toast.success('Google Calendar conectado')
    else if (g === 'error') toast.error('No se pudo conectar con Google Calendar')
    window.history.replaceState(null, '', '/agenda')
  }, [])
```
→ última línea pasa a `applyPanelView({ cause: 'stale', param: 'google', from: g, to: null })` (sin `drop`; preserva otros params). Agregar el import de `@/lib/panel-history`.

### `negocio/page.tsx`, `settings/page.tsx`, `finances/page.tsx` (page, request-response)

**Analog:** `app/(dashboard)/clients/page.tsx:35-50`:
```tsx
  // `ClientsClient` lee el cliente abierto de la query (`?c=<id>`) con `useSearchParams`, que obliga a
  // un boundary de Suspense. Acá el fallback NUNCA se renderiza —esta ruta es dinámica porque el
  // `createClient()` de arriba usa `cookies()`...
  return (
    <Suspense fallback={null}>
      <ClientsClient ... />
    </Suspense>
  )
```
Y `import { Suspense } from 'react'`. Patrón madre: `app/(dashboard)/layout.tsx:138-140` (`<Suspense fallback={null}><PlanBanner .../></Suspense>`). Hoy `negocio/page.tsx:25-37` retorna `<SettingsClient ... view="negocio" />` sin envoltorio. Auth/tenant intacto: `createClient()` → `getUser()` → `redirect('/login')` → `businesses ... .eq('owner_id', user.id)` (`negocio/page.tsx:9-14`). No agregar `searchParams` a ninguna página.

### `test/panel-tabs.test.ts` y casos nuevos en `lib/panel-history.test.ts` (test unit puro)

**Simulador de pila** — `lib/panel-history.test.ts:562-583`:
```ts
describe('panelNavMode — el invariante, simulado sobre la pila del navegador', () => {
  function navegar(pila: string[], to: string): string[] {
    const from = pila[pila.length - 1]
    return panelNavMode({ from, to }) === 'push' ? [...pila, to] : [...pila.slice(0, -1), to]
  }
  function atras(pila: string[]): string | null {
    return pila.length > 1 ? pila[pila.length - 2] : null
  }
```
Copiar para `Datos→Cobros→Integraciones→Cobros→atrás ⇒ Datos`, D-02, D-03, OAuth+Datos no consume (sumar rama `consume` = pop).

**Ejecutor con `window` stub** — `lib/panel-history.test.ts:991-1000`:
```ts
    const pushState = vi.fn()
    vi.stubGlobal('window', {
      history: { state: { frjUnder: MAS }, replaceState: vi.fn(), pushState, back: vi.fn() },
      location: { pathname: '/clients', search: '' },
    })
    expect(PH.applyPanelView({ cause: 'user-open', param: 'c', from: null, to: 'abc' })).toBe('push')
```
Para: replace sin holding escribe `{ frjView: null }`; replace con holding conserva; `drop` borra `mp`/`google`.

### `test/panel-tabs-cableado.test.ts` (NUEVO, gates estáticos)

**Analog:** `test/panel-history-clients.test.ts`
- `sinComentarios` (L44-49) y `recorte` (L65-79, balancea **desde la primera llave** ⇒ marcador después de la firma con parámetro-objeto, Pitfall 3; devuelve `''` si no encuentra y cada `it` afirma no vacío).
- (f) L180-193 cero escrituras crudas (`readdirSync` + `HISTORIAL_CRUDO`) — aplicar a los 3 archivos cliente.
- (g) L195-205 ninguna segunda fuente de verdad — para `setConfigTab`/`setNegocioTab`/`setTxTab`.
- (h) L207-221 `<Suspense` antes del componente y `</Suspense>` después — para las 3 páginas con tabs.
- (a) L243-254 el helper nunca propaga `...history.state` (ya existe; mantener verde).
- Nuevos: rama de secciones textual (`SECTION_TAB[view]`, `isSection ? undefined`); las 3 páginas de sección siguen con `createClient()` y su `view=` literal; OAuth con `drop`; Agenda con `'stale'` y `param: 'google'`. Correr las 5 mutaciones de RESEARCH §Validation.

## Shared Patterns

### Un solo escritor de historial
**Fuente:** `lib/panel-history.ts:841-878` (`applyPanelView`). **Aplica a:** settings, finances, agenda. Cero `window.history.*` en pantallas; el call site declara la causa, el módulo decide.

### Reconciliación idempotente
**Fuente:** `sanitizeAction` + `reconciledMemo` (`lib/panel-history.ts:776-816`) + ref, molde `clients-client.tsx:689-723`. **Aplica a:** settings (Negocio/Config) y finances.

### NAV-08 / D-08 sin cableado nuevo
**Fuente:** `consumeOwnedPanelEntry` (`lib/panel-history.ts:1025-1031`), ya en `sidebar.tsx:103-106`, `panel-bottom-nav.tsx:192-196`, `mas-client.tsx:212-215`. Funciona para tabs sólo si se corrige la marca del `replace`.

### Comentarios y errores
Comentarios densos en español explicando el porqué; nunca nombrar los métodos crudos de historial en los 3 archivos de pantalla (el barrido del ROADMAP es crudo).

### (B1, opcional, tras `checkpoint:decision`) miembro de rama en dos pasos
**Fuente:** `lib/panel-history.ts:522-527` (unión `PanelBranchPlan`), `:689` (regla que lo produce, hechos explícitos y sin default) y el ejecutor `lib/panel-branch.ts:367-389`:
```ts
  if (plan === 'consume-exit-then-navigate') {
    if (exitId === undefined) return false
    const modo = panelNavMode({ from: root, to, root, more })
    const segundoPaso = () => { navigate(to, modo) }
    window.addEventListener('popstate', segundoPaso, { once: true })
    if (consumeOwnedExitSentinel({ id: exitId })) return true
    window.removeEventListener('popstate', segundoPaso)
    return false
  }
```
Para `'consume-view-then-navigate'`: mismo molde con `consumeOwnedPanelEntry()`, pero el segundo paso **re-lee** `history.state` y re-decide `panelBranchPlan`. Declararlo también en el `switch` exhaustivo de `components/dashboard/unsaved-changes-guard.tsx:256-261` (grupo `up`/`collapse-then-replace`/`consume-exit-then-navigate`/`none` que deriva a `runBranchNavigation`) y en el candado de orden `test/panel-nav-chrome.test.ts:251-262` (`requestNavigation` < `consumeOwnedPanelEntry` < `handleNavigate`).

## No Analog Found

| Archivo | Rol | Data flow | Motivo |
|---|---|---|---|
| `lib/panel-tabs.ts` (los mapas de grupos) | utility config | transform | No hay otro registro de tabs por ruta; usar RESEARCH §Patrón 7 (con `Map`) |

## Metadata

**Ámbito de búsqueda:** `lib/`, `app/(dashboard)/{clients,settings,finances,agenda,negocio}/`, `components/dashboard/`, `test/`
**Archivos escaneados:** ~14
**Fecha:** 2026-11-17
