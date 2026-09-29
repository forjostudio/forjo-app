# Phase 1: El detalle de cliente, con la regla de historial que lo gobierna — Research

**Researched:** 2026-09-29
**Domain:** Routing del App Router de Next 16.2.7 · Native History API · estado-en-URL en un panel autenticado
**Confidence:** HIGH (todo lo load-bearing salió de leer `node_modules/next/dist/` y el código del repo esta sesión; lo no verificable está marcado **NO VERIFICADO**)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-03 — El detalle vive en la QUERY, no en un segmento de ruta.** Decidido por el dueño el
2026-09-29. La forma es `/clients?<param>=<id>` sobre la **misma** ruta, usando la Native History API
que Next 16 integra al router. **No** se crea `/clients/[id]`. Motivos registrados: (1) el criterio 1
sale gratis porque nada se desmonta; (2) no se abre el oracle cross-tenant (el detalle se resuelve
contra la lista ya filtrada por `business_id`, `clients-client.tsx:499`); (3) está oficialmente
soportado (`04-linking-and-navigating.md:341-345`).

⚠ **Lo que esta decisión NO autoriza:** no habilita meter cualquier estado de UI en la query. NAV-05
sigue mandando: hay **un** helper que decide `push` / `replace` / consumir, y todo pasa por ahí.

Heredadas:
- **D-01 — Historia honesta.** Rutas/URLs reales; **cero** intercepción de `popstate`, cero entradas
  falsas, cero reescritura de historial.
- **D-02 — Alcance.** Detalle de cliente + tabs profundos. Los tabs son la **Phase 2**.
- **T-3** — el `activeLoc` de Agenda queda afuera, pero el helper de NAV-05 tiene que **poder**
  expresar su caso `replace` aunque esta fase no lo cablee.
- **T-6** — React `<Activity>` **no** está activo (`cacheComponents` no está en `next.config.ts`).

Restricciones no negociables:
- **Cero cambio visual** (criterio 5). El "Volver" de mobile ya existe (`clients-client.tsx:1204-1206`)
  y el split de desktop (`lg:w-80` + detalle, `clients-client.tsx:586-591`) queda idéntico. Si se
  toca, el gate de UI se reabre y hay que pasar por `/gsd-ui-phase`.
- **Cero migraciones.** La próxima libre sigue siendo la **080**.
- **Cero paquetes nuevos.**
- **No tocar** `lib/overlay-history.ts` ni el guard de cambios sin guardar. NAV-06 exige **no
  empeorarlos**, no rediseñarlos. La guarda probada es **mirar el marcador de `history.state` antes de
  cualquier `back()`** — se reusa ese patrón, no se inventa otro.
- Piso de suite/typecheck: `npx vitest run` ≥ **1392 passed / 98 archivos**; typecheck con
  `./node_modules/.bin/tsc --noEmit` (⚠ **nunca `npx tsc`**). Dos canarios de reloj fallan a propósito
  fuera de `[01:00, 23:30]` AR.

### Claude's Discretion

No hay sección `## Claude's Discretion` en CONTEXT.md. Lo que el CONTEXT deja explícitamente abierto y
esta investigación cubre: **el nombre del parámetro de query, la forma interna del helper, dónde vive,
y qué primitiva usa cada caso.**

### Deferred Ideas (OUT OF SCOPE)

Tabs de `/negocio`, `/settings`, `/finances` (Phase 2) · `activeLoc` de Agenda (T-3) · toggle
`mobileView` de `/web` (D-02) · interceptar `popstate` / entradas falsas / reescribir historial (D-01)
· tocar `lib/overlay-history.ts` o el guard de cambios sin guardar · cambiar el layout master-detail,
breadcrumb o header nuevo · migraciones · rehacer el menú hamburguesa.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descripción | Qué de esta investigación lo habilita |
|----|-------------|----------------------------------------|
| NAV-01 | El detalle es una ruta propia; el back vuelve al listado con búsqueda y filtros como estaban | §Q1 (el build no rompe) + §Q2 (pushState no re-renderiza el server ni desmonta) + §Q4 (evidencia de que los 5 `useState` sobreviven) |
| NAV-02 | La URL del detalle se recarga y se comparte; id inexistente o de otro negocio no filtra nada | §Q1 (`useSearchParams` disponible ya en el render inicial del server en ruta dinámica) + §Q6 (la regla de "id que no resuelve" es la MISMA que sanea la URL) + §Security |
| NAV-05 | Un helper compartido decide push / replace / none / consumir | §Q5 (dónde vive, qué forma, cómo se testea puro) + §Q6 (los dos casos `replace` reales) |
| NAV-06 | No rompe el arreglo de Bug A ni la guarda de cambios sin guardar | §Q3 (patrón de convivencia con `overlay-history`, con las 3 colisiones medidas) |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md)

Directivas accionables que el plan tiene que cumplir:

1. **`AGENTS.md`: "This is NOT the Next.js you know"** — leer `node_modules/next/dist/docs/` antes de
   escribir código. Todo hecho de Next en este documento está citado con archivo:línea.
2. **Aislamiento por tenant no negociable** — toda query que toque datos de un negocio va con
   `.eq('business_id', business.id)`. Un id que viene de la URL **no es autorización**.
3. **Middleware = `proxy.ts`**, no `middleware.ts` (`proxy.ts:37`).
4. **Imports con alias `@/`** (`tsconfig.json`), nunca rutas relativas profundas.
5. **`Edit`, nunca `Write`** sobre archivos existentes salvo cambio >80%.
6. **Comentarios densos en español** explicando el *porqué* de lo no obvio (el molde exacto es el
   cabezal de `lib/overlay-history.ts:1-48`).
7. **Respuestas de API** `{ ok: boolean }` + códigos snake_case — no aplica a esta fase (no hay API).
8. **Errores de UI** con `toast` de `sonner`.
9. **Cero paquetes nuevos** (constraint transversal del ROADMAP y del CONTEXT).
10. **Windows + PowerShell** para los comandos locales.

## Summary

La decisión D-03 (el detalle en la query, con la Native History API) es **correcta y está sostenida por
el código instalado**, no sólo por el doc. Verifiqué el parche de `window.history.pushState` de Next en
`node_modules/next/dist/client/components/app-router.js:252-263` y todo el camino que dispara: copia
`__NA`/`__PRIVATE_NEXTJS_INTERNALS_TREE` al state nuevo, y —si le pasás una `url`— despacha
`ACTION_RESTORE`, que actualiza `canonicalUrl`, del que sale el valor de `SearchParamsContext`
(`app-router.js:114-125` y `:429-431`). Del otro lado, `restoreReducer` corre con
`FreshnessPolicy.HistoryTraversal` (`restore-reducer.js:43`), que en el switch de
`ppr-navigations.js:131-146` resuelve `shouldRefreshDynamicData = false` ⇒ el `CacheNode` de la página
se **reusa** (`ppr-navigations.js:159-164`, `needsDynamicRequest = false`) ⇒ **no hay request al
server, no se re-ejecuta `ClientsPage`, y `ClientsClient` no se desmonta**. Y
`completeTraverseNavigation` devuelve `focusAndScrollRef: state.focusAndScrollRef`
(`segment-cache/navigation.js:415`) ⇒ **no hay scroll-to-top**. Eso contesta las preguntas 2 y 4 con
evidencia de runtime, no de doc.

El riesgo de build (pregunta 1) es **menor de lo que teme el roadmap, y el repo ya tiene el
precedente**: el fallo del build sólo ocurre cuando la página es **prerenderizada**
(`use-search-params.md:179`), y el mecanismo es un `BailoutToCSRError` que `useDynamicSearchParams`
tira **sólo** en los work-unit stores `prerender-legacy` / `prerender-ppr`
(`dynamic-rendering.js:586-596`); con `type: 'request'` la función hace `return` a secas
(`dynamic-rendering.js:619-620`). `/clients` **no está** en la lista de rutas prerenderizadas del
último build real del repo (`.next/prerender-manifest.json`), porque `page.tsx:6` llama
`createClient()` → `await cookies()` (`lib/supabase/server.ts:5`). Además `components/dashboard/plan-banner.tsx:22`
ya usa `useSearchParams()` **dentro del layout del panel** y ya está envuelto en `<Suspense>`
(`app/(dashboard)/layout.tsx:60-62`): hay precedente de repo, con la mitigación barata ya escrita.

El riesgo real de la fase **no** es el build ni `pushState`: es el **riesgo (c)**. Midiendo el código
encontré **tres** situaciones de competencia con `lib/overlay-history.ts`, y una de ellas (el borrado de
cliente) **no está anotada en el ROADMAP ni en el CONTEXT**. Las tres se resuelven con una sola regla:
*el detalle nunca escucha `popstate` (deriva de `useSearchParams`) y nunca escribe historial en el
mismo commit en que un overlay lo está consumiendo.* Eso obliga a que el helper exprese **cuatro**
decisiones, no tres: `push`, `replace`, `none` y `consume` — y que `consume` tenga su fallback a
`replace` cuando la entrada de arriba no es nuestra (caso "el usuario entró pegando la URL").

**Primary recommendation:** helper puro nuevo en `lib/panel-history.ts` (+ `lib/panel-history.test.ts`,
`environment: 'node'`), consumido por `clients-client.tsx`; **abrir** un cliente = `pushState` con
marcador propio (`frjView`) y `?c=<id>`; **cerrar** por "Volver" = `back()` guardado por el marcador,
con fallback a `replaceState` si la entrada no es nuestra; **fusionar** y **borrar** = nunca `push`,
nunca `back()`; y una regla de **saneo** (`replace`) cuando el `c` de la URL no resuelve a ningún
cliente de la lista — que es la misma regla que cierra NAV-02.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Decidir push/replace/none/consume | Browser / Client (módulo puro en `lib/`) | — | Es una decisión sobre el historial del navegador; no hay nada que el server pueda aportar. Puro ⇒ testeable en `environment: 'node'`. |
| Escribir la entrada de historial | Browser / Client (`window.history` parcheado por Next) | — | `app-router.js:234-235` parchea `pushState`/`replaceState` en un efecto del `Router`; sólo existe en el cliente. |
| Leer el id seleccionado de la URL | Browser / Client (`useSearchParams`) | Frontend Server (SSR inicial) | En ruta dinámica el valor ya está en el render inicial del server (`use-search-params.md:186`) ⇒ cero flash. |
| Resolver el cliente por id | Browser / Client (`clients.find` sobre la lista ya filtrada) | — | `clients-client.tsx:499`. Mantenerlo acá es lo que cierra el oracle cross-tenant (riesgo (b)). |
| Autorizar qué clientes existen | API / Backend (Server Component) | Database (RLS) | `page.tsx:10-32`: `owner_id` → `business` → `.eq('business_id', business.id)` en las 3 queries. **La URL nunca amplía este conjunto.** |
| Cerrar overlays con el back | Browser / Client (`lib/overlay-history.ts`) | — | Ya existe y **no se toca**. El detalle convive, no comparte mecanismo. |

## Las 6 preguntas, con evidencia

### Q1 — `useSearchParams` y el build

**Respuesta corta:** `npm run build` **no** debería fallar, y la razón es verificable en el código, no
sólo en el doc. Igual: **envolver en `<Suspense>` cuesta 3 líneas, ya es el patrón del repo y elimina
el riesgo entero** — hacerlo.

**La regla, del doc:**

> "During production builds, a **static page** that calls `useSearchParams` from a Client Component
> must be wrapped in a `Suspense` boundary, otherwise the build fails with the *Missing Suspense
> boundary with useSearchParams* error."
> — `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md:179`
> [CITED]

> "In development, routes are rendered on-demand, so `useSearchParams` doesn't suspend and things may
> appear to work without `Suspense`." — `use-search-params.md:178` [CITED]

> "If a route is dynamically rendered, `useSearchParams` will be available on the server during the
> initial server render of the Client Component." — `use-search-params.md:186` [CITED]

**El mecanismo, del runtime instalado** (esto es lo que convierte el "no debería" en "no puede"):

- `node_modules/next/dist/client/components/navigation.js:94` —
  `const useDynamicSearchParams = typeof window === 'undefined' ? require('../../server/app-render/dynamic-rendering').useDynamicSearchParams : undefined;`
  y `:97` — `useDynamicSearchParams?.('useSearchParams()');`
  [VERIFIED: node_modules/next/dist/client/components/navigation.js:94,97]
- `node_modules/next/dist/server/app-render/dynamic-rendering.js:566` define `useDynamicSearchParams`.
  En el `switch(workUnitStore.type)`:
  - `case 'prerender-legacy': case 'prerender-ppr':` → `throw ... new BailoutToCSRError(expression) ... value: "E394"` (líneas 586-596).
  - **`case 'request': return;`** (líneas 619-620). [VERIFIED: node_modules/next/dist/server/app-render/dynamic-rendering.js:586-596,619-620]

  O sea: **en un render por request no hay bailout posible.** El error de build es estrictamente una
  condición de prerender.

**¿Es `/clients` dinámica? Sí, y está medido en el build real del repo:**

- `app/(dashboard)/clients/page.tsx:6` → `const supabase = await createClient()`;
  `lib/supabase/server.ts:5` → `const cookieStore = await cookies()`.
  [VERIFIED: app/(dashboard)/clients/page.tsx:6 · lib/supabase/server.ts:5]
- El layout hace lo mismo antes: `app/(dashboard)/layout.tsx:21` → `const supabase = await createClient()`.
  [VERIFIED: app/(dashboard)/layout.tsx:21]
- `.next/prerender-manifest.json` del último build de producción del repo (BUILD_ID del 2026-09-28)
  lista como rutas prerenderizadas **exactamente** estas, y `/clients` **no está**:
  `'/_global-error'`, `'/_not-found'`, `'/apple-icon.png'`, `'/favicon.ico'`, `'/forgot-password'`,
  `'/icon.png'`, `'/login'`, `'/onboarding'`, `'/register'`, `'/reset-password'`, `'/robots.txt'`,
  `'/suspendido'`; `dynamicRoutes: []`.
  [VERIFIED: .next/prerender-manifest.json — leído esta sesión vía `require()`]
- `.next/server/app-paths-manifest.json` mapea `/(dashboard)/clients/page -> app/(dashboard)/clients/page.js`
  y **no hay ningún `.html` prerenderizado** bajo `.next/server/app/(dashboard)/`.
  [VERIFIED: .next/server/app-paths-manifest.json]

**"¿Cambia la respuesta que `page.tsx` sea un Server Component async con cookies?" — Sí: es
exactamente lo que la hace segura.** No es un detalle incidental: es la causa. El que lee `cookies()`
es el que fuerza el render dinámico de toda la ruta, y con la ruta dinámica el hook no suspende ni
bailoutea.

**El precedente que el ROADMAP no vio:** `components/dashboard/plan-banner.tsx:4` importa
`useSearchParams` y `:22` lo llama; ese componente se renderiza en **el layout del panel**, o sea en
todas las pantallas incluida `/clients` — `app/(dashboard)/layout.tsx:61`. Y ya viene envuelto:

```tsx
// app/(dashboard)/layout.tsx:60-62
<Suspense fallback={null}>
  <PlanBanner planStatus={planStatus} daysLeft={daysLeft} />
</Suspense>
```
[VERIFIED: app/(dashboard)/layout.tsx:60-62 · components/dashboard/plan-banner.tsx:4,22]

⚠ Ojo con la lectura fácil: **que el build pase hoy no prueba que un `useSearchParams` sin `Suspense`
pasaría**, porque el único que hay está envuelto. Lo que prueba el build es lo otro: que el panel ya
convive con el hook y con la mitigación. La prueba de que *sin* `Suspense` tampoco rompe es la del
runtime (`case 'request': return`) + el manifest, no la del build.

**Recomendación operativa:** poner `useSearchParams` en `ClientsClient` y envolver `<ClientsClient>`
en `<Suspense fallback={null}>` dentro de `app/(dashboard)/clients/page.tsx`, copiando
`layout.tsx:60-62`. Costo: cero (en ruta dinámica el fallback nunca se renderiza —
`use-search-params.md:186`), beneficio: el gate de build de la fase deja de depender de que nadie
vuelva estática la ruta en el futuro. `npm run build` sigue siendo criterio de la fase.

### Q2 — Native History API vs `router.push`

**Respuesta corta:** `pushState` re-renderiza el árbol cliente que lee `useSearchParams`, **no** vuelve
al server, **no** desmonta nada y **no** toca el scroll. `router.push` hace un request RSC y puede
remontar la página. Para estado-en-query sobre la misma ruta, `pushState` es la primitiva correcta, y
`router.push(..., {scroll:false})` es la equivocada.

**Qué pasa exactamente al llamar `window.history.pushState(null, '', '?c=<id>')`:**

1. El `pushState` que se ejecuta **no es el nativo**: `app-router.js:234` guarda el original y `:252`
   lo reemplaza. [VERIFIED: node_modules/next/dist/client/components/app-router.js:234,252]
2. El parche, textual:
   ```js
   // app-router.js:252-263
   window.history.pushState = function pushState(data, _unused, url) {
       if (data?.__NA || data?._N) {
           return originalPushState(data, _unused, url);
       }
       data = copyNextJsInternalHistoryState(data);
       if (url) {
           applyUrlFromHistoryPushReplace(url);
       }
       return originalPushState(data, _unused, url);
   };
   ```
   [VERIFIED: node_modules/next/dist/client/components/app-router.js:252-263]
3. `applyUrlFromHistoryPushReplace` despacha `ACTION_RESTORE` con la URL nueva dentro de un
   `startTransition` (`app-router.js:237-247`).
4. `ACTION_RESTORE` → `restoreReducer` → `completeTraverseNavigation`, que setea
   `canonicalUrl: createHrefFromUrl(url)` (`segment-cache/navigation.js:404-407`).
5. `canonicalUrl` es la **única** dependencia del memo que produce los search params, y ese valor es el
   del `SearchParamsContext`:
   ```js
   // app-router.js:116-125
   const { searchParams, pathname } = useMemo(()=>{
       const url = new URL(canonicalUrl, ...);
       return { searchParams: url.searchParams, ... };
   }, [ canonicalUrl ]);
   ```
   y `app-router.js:429-431` — `<SearchParamsContext.Provider value={searchParams}>`.
   [VERIFIED: node_modules/next/dist/client/components/app-router.js:116-125,429-431]
   `useSearchParams` sólo lee ese contexto (`navigation.js:96-99`).
   ⇒ **Sí, el componente que usa `useSearchParams` se re-renderiza.**

**¿Vuelve al server? NO.** Cadena verificada:

- `restore-reducer.js:43` llama `startPPRNavigation(..., FreshnessPolicy.HistoryTraversal, null, null, ..., false, accumulation)`.
  [VERIFIED: node_modules/next/dist/client/components/router-reducer/reducers/restore-reducer.js:43]
- `FreshnessPolicy.HistoryTraversal === 2` (`ppr-navigations.js:51-59`, textual:
  `FreshnessPolicy[FreshnessPolicy["HistoryTraversal"] = 2] = "HistoryTraversal";`).
  [VERIFIED: node_modules/next/dist/client/components/router-reducer/ppr-navigations.js:51-59]
- El switch que decide si hay que refrescar datos dinámicos manda `0, 2, 1, 5` a
  `shouldRefreshDynamicData = false` (`ppr-navigations.js:131-146`). El `2` es HistoryTraversal.
  [VERIFIED: node_modules/next/dist/client/components/router-reducer/ppr-navigations.js:131-146]
- Con eso, `ppr-navigations.js:159-164`:
  ```js
  if (oldCacheNode !== undefined && !shouldRefreshDynamicData &&
      !(isLeafSegment && isSamePageNavigation)) {
      const dropPrefetchRsc = false;
      newCacheNode = reuseSharedCacheNode(dropPrefetchRsc, oldCacheNode);
      needsDynamicRequest = false;
  }
  ```
  `isSamePageNavigation` llega en `false` desde el restore. ⇒ **se reusa el CacheNode existente y no se
  pide nada al server.** [VERIFIED: node_modules/next/dist/client/components/router-reducer/ppr-navigations.js:159-164]

Traducción práctica: `ClientsPage` **no** se vuelve a ejecutar (no hay segundo `auth.getUser()` ni las
3 queries de `page.tsx:18-32`), y `ClientsClient` **no** se desmonta.

**¿Se pierde el scroll? NO.**

```js
// segment-cache/navigation.js:404-425 (completeTraverseNavigation)
focusAndScrollRef: state.focusAndScrollRef,
```
[VERIFIED: node_modules/next/dist/client/components/segment-cache/navigation.js:415] — el restore
**arrastra** el ref de scroll anterior en vez de crear un target nuevo, así que no hay scroll-to-top.
Esto importa de verdad acá: el listado de clientes tiene su propio scroll interno (`listRef`,
`scrollToLetter`, `clients-client.tsx:576-580`) y el layout es `overflow-hidden`
(`clients-client.tsx:586`).

**Contraste con `router.push` (la primitiva que NO hay que usar):**

- Doc: "`router.push(href, { scroll, transitionTypes })`: Perform a client-side navigation … **Adds a
  new entry** into the browser's history stack" / "`router.replace(...)` … **without adding a new
  entry**" — `use-router.md:44-45`. "By default, Next.js will scroll to the top of the page when
  navigating to a new route. You can disable this behavior by passing `scroll: false`" —
  `use-router.md:119`. [CITED]
- Runtime: una navegación real entra por `navigate()` → `navigateToKnownRoute` /
  `navigateToUnknownRoute`, y esta última hace
  `const promiseForDynamicServerResponse = fetchServerResponse(url, {...})`
  (`segment-cache/navigation.js:208`). [VERIFIED: node_modules/next/dist/client/components/segment-cache/navigation.js:208]
  Como `/clients` es dinámica (no prerenderizable, ver Q1) no hay prefetch estático que la salve: un
  `router.push('/clients?c=<id>')` **sí** pega al server y re-ejecuta `ClientsPage`.
- Y el segment key de una página **incluye los search params** en la respuesta dinámica:
  `createSegmentFromRouteTree` arma `PAGE_SEGMENT_KEY + '?' + stringifiedQuery`
  (`ppr-navigations.js:396-418`), así que `/clients` y `/clients?c=X` son **segmentos distintos** para
  el router. [VERIFIED: node_modules/next/dist/client/components/router-reducer/ppr-navigations.js:396-418]

**El criterio, en una línea:**

| Si el cambio… | Primitiva | Por qué |
|---|---|---|
| es **estado de UI** sobre la **misma** página (nuestro caso: qué cliente está abierto) | `window.history.pushState` / `replaceState` | Cero round-trip, cero remonte, cero scroll. `04-linking-and-navigating.md:341-345` lo bendice: "pushState and replaceState calls integrate into the Next.js Router, allowing you to sync with usePathname and useSearchParams". |
| es **otra pantalla** (otro `page.tsx`) | `<Link>` / `router.push` | Hay datos nuevos que traer del server; el segmento cambia de verdad. |
| es limpiar una query de un redirect externo (OAuth) | `replaceState` | Ya es el patrón del repo: `settings-client.tsx:1021`, `agenda-client.tsx:290`. |

⚠ `router.push(..., {scroll:false})` **no** es un sustituto: apaga el scroll pero no el request ni el
cambio de segmento. Esa es la trampa exacta que el criterio de arriba evita.

### Q3 — Convivencia con `lib/overlay-history.ts` (riesgo (c))

Leí el módulo entero (378 líneas). Lo que sigue es el patrón de convivencia, no una tranquilización:
hay **tres** puntos de contacto y uno de ellos es un bug real si se implementa de la forma obvia.

**Lo que `overlay-history` hace hoy:** empuja `{ frjOverlay: id }` con un hash (`#modal`, `#modal-2`, …)
al abrir (`overlay-history.ts:318-328`), y al cerrar hace `history.back()` **sólo si** la entrada de
arriba lleva su marca (`overlay-history.ts:331-334` y `:370-376`, guarda `isOverlayHistoryEntry`). Su
listener de `popstate` **sólo existe mientras el overlay está abierto** (`overlay-history.ts:338-339`:
`if (!participates || !open) return`). Los 4 overlays de Clientes son `<Dialog>` controlados con
`onOpenChange`, así que los 4 participan: `clients-client.tsx:807` (borrar), `:823` (fusionar),
`:853` (nuevo cliente), `:900` (importar CSV); el wiring está en `components/ui/dialog.tsx:27-44`.
[VERIFIED: lib/overlay-history.ts:318-334,338-339,370-376 · components/ui/dialog.tsx:27-44 · app/(dashboard)/clients/clients-client.tsx:807,823,853,900]

**(1) ¿Pueden competir por la misma entrada? Sí — pero sólo si el detalle también escucha `popstate` o
llama `back()`.**

La regla que lo cierra: **el detalle NO escucha `popstate`.** Deriva su estado de `useSearchParams`, y
del back se encarga el propio router de Next (`app-router.js:284-300`, `onPopState` →
`dispatchTraverseAction`). Esto además es literalmente D-01 ("cero intercepción de `popstate`"): la
decisión de producto y la solución técnica coinciden.

Con eso, el caso "detalle abierto + overlay encima" es correcto por construcción:
stack `[/clients] [?c=id] [?c=id#modal]` → back → el browser popea la 3ª → el `onPop` del overlay lee
`window.history.state` y ve la marca del detalle (no la suya) ⇒ `popstateAction({topIsOurs:false})` →
`'dismiss'` → cierra el overlay (`overlay-history.ts:341-351`); el detalle, en paralelo, ve que `c`
sigue en la URL y **no hace nada**. Un solo back, un solo efecto. ✅

**(2) ¿Alcanza el marcador `frjOverlay`? Sí para distinguir, y NO hay que reusarlo.**

`isOverlayHistoryEntry` exige `state.frjOverlay === id` (`overlay-history.ts:110-117`) — un id de
instancia monotónico (`overlay-history.ts:259-265`). Si el detalle usa una clave **distinta** (p. ej.
`frjView`), ninguna de las dos funciones se confunde: el `back()` de limpieza de un overlay nunca va a
reconocer la entrada del detalle, y viceversa.

Y las marcas **no se contaminan entre entradas**: `copyNextJsInternalHistoryState` copia al state nuevo
**únicamente** `__NA` y `__PRIVATE_NEXTJS_INTERNALS_TREE` (`app-router.js:84-95`) — nada de nuestras
claves. [VERIFIED: node_modules/next/dist/client/components/app-router.js:84-95]

**(3) `__NA`: qué hace, y la trampa nueva que agrega el detalle.**

- Por qué es obligatorio: el `onPopState` de Next hace **`window.location.reload()`** si la entrada a la
  que se vuelve no lleva `__NA`:
  ```js
  // app-router.js:284-292
  const onPopState = (event)=>{
      if (!event.state) { return; }
      if (!event.state.__NA) { window.location.reload(); return; }
      ...
  ```
  [VERIFIED: node_modules/next/dist/client/components/app-router.js:284-292] — confirma palabra por
  palabra el comentario de `overlay-history.ts:83-92`.
- Quién lo pone: el parche (`copyNextJsInternalHistoryState`) **y además** `HistoryUpdater`, que en un
  `useInsertionEffect` reescribe la entrada actual en **cada** cambio de estado del router:
  ```js
  // app-router.js:46-67
  const historyState = {
      ...pushRef.preserveCustomHistoryState ? window.history.state : {},
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: appHistoryState
  };
  ... window.history.replaceState(historyState, '', canonicalUrl);
  ```
  [VERIFIED: node_modules/next/dist/client/components/app-router.js:38-71]
  Como el restore setea `preserveCustomHistoryState: true`
  (`segment-cache/navigation.js:413`), **nuestro marcador sobrevive** a ese `replaceState`. En cambio
  una navegación normal lo pone en `false` (`segment-cache/navigation.js:271` y `:382`) ⇒ una
  navegación de verdad **limpia** las marcas, que es lo deseable.
  [VERIFIED: node_modules/next/dist/client/components/segment-cache/navigation.js:271,382,413]
- ⚠ **LA TRAMPA NUEVA (la que hay que escribir en el plan):** si el helper empuja el state haciendo
  `{...window.history.state, frjView: ...}` —que es la forma "cuidadosa" que uno escribiría—, ese
  objeto **ya trae `__NA`**, y el parche toma la rama temprana
  `if (data?.__NA || data?._N) return originalPushState(...)` (`app-router.js:253-255`): **no se
  despacha `ACTION_RESTORE`, así que `useSearchParams` NO se actualiza** y el detalle no abre. Falla en
  silencio: no hay error, no hay warning, la URL cambia y la UI no. El state que se empuja tiene que
  ser un objeto **fresco** (`{ frjView: <id> }`), exactamente como hace `overlayHistoryState`
  (`overlay-history.ts:93-95`). [VERIFIED: node_modules/next/dist/client/components/app-router.js:253-255]

**(4) ⚠ La colisión que el ROADMAP y el CONTEXT no anotan: el borrado de cliente.**

`deleteClient()` (`clients-client.tsx:519-531`) cierra **dos cosas a la vez**, en el mismo lote de
estado:
```ts
// clients-client.tsx:526-529
setSelectedId(null)
setConfirmDelete(false)
```
[VERIFIED: app/(dashboard)/clients/clients-client.tsx:519-531]

Con el detalle en la URL, ese lote pide *simultáneamente*: "cerrá el overlay" (→ `overlay-history`
hace `history.back()`) y "cerrá el detalle" (→ el helper querría tocar historial). Las dos cosas
apuntan a entradas distintas del stack, pero:

- `history.back()` es **asincrónico**: `window.history.state` **no** cambia en el mismo tick. Cualquier
  guarda que el helper lea justo después está leyendo estado **viejo**.
- La entrada **actual** en ese momento es la del overlay (`?c=id#modal`), **no** la del detalle. Un
  `replaceState` del helper reescribiría la entrada del **overlay**, le borraría el hash y (si empuja
  state fresco) le borraría el `frjOverlay` ⇒ el `isOverlayHistoryEntry` del overlay daría `false` ⇒
  **el overlay NO haría su `back()`** ⇒ la entrada `?c=id` queda huérfana ⇒ el usuario aprieta atrás y
  cae en la ficha de **un cliente recién borrado**. Es el mismo síntoma que el roadmap le teme a la
  fusión (`:570`), por un camino distinto y no anotado.

**El patrón de convivencia (regla única, derivada de lo anterior):**

> **El detalle nunca escribe historial en el mismo commit en que un overlay lo está consumiendo.**
> En el borrado, la decisión del helper es `none`: se deja que el `back()` del overlay aterrice solo, y
> la URL queda momentáneamente con un `c` que ya no resuelve. Ese estado lo limpia la **regla de saneo**
> (ver Q6), que corre en un render posterior —cuando el `popstate` ya asentó— y es un `replace`, no un
> `back()`.

Corolarios que el plan tiene que respetar:
- Nunca más de **una** mutación de historial por gesto del usuario en esta pantalla.
- `back()` sólo desde el camino que el **usuario** disparó ("Volver"), donde no hay overlay abierto.
- Toda guarda previa a un `back()` mira `window.history.state` con el marcador propio — mismo molde que
  `isOverlayHistoryEntry` (`overlay-history.ts:110-117`) y `shouldConsumeHistoryEntry`
  (`lib/landing/lightbox.ts:130-137`).

### Q4 — ¿Sobreviven búsqueda y filtros al back?

**Sí. Verificado leyendo el código, en tres pasos.**

1. **Dónde viven los 4 estados** (el quinto, `selectedId`, es el que se muda a la URL):
   ```ts
   // clients-client.tsx:220-224
   const [selectedId, setSelectedId] = useState<string | null>(null)
   const [search, setSearch] = useState('')
   const [filter, setFilter] = useState<FilterKey>('all')
   const [filterPro, setFilterPro] = useState('all')
   const [filterInsurance, setFilterInsurance] = useState('all')
   ```
   [VERIFIED: app/(dashboard)/clients/clients-client.tsx:220-224]
   Los cuatro son `useState` **de `ClientsClient`**, el componente raíz del archivo. Sobreviven si y
   sólo si `ClientsClient` no se desmonta.

2. **`ClientsClient` no se desmonta con `pushState`**: cadena de Q2 —
   `ACTION_RESTORE` → `FreshnessPolicy.HistoryTraversal` → `shouldRefreshDynamicData=false` →
   `reuseSharedCacheNode` / `needsDynamicRequest=false` (`ppr-navigations.js:131-146,159-164`). Se reusa
   el mismo `CacheNode`, o sea el **mismo elemento RSC ya renderizado**: React reconcilia sin remontar.

3. **Tampoco se desmonta con el back**: el back entra por `onPopState` de Next
   (`app-router.js:284-300`) → `dispatchTraverseAction` → el mismo camino de restore. Idéntico
   tratamiento.

Lo único que sí se remonta —y ya se remonta hoy— es el sub-panel del detalle:
`<ClientDetail key={selected.id} …>` (`clients-client.tsx:790`), documentado en
`clients-client.tsx:1100-1104` ("Se monta con `key={client.id}` … React lo REMONTA y los `useState`
vuelven a su valor inicial"). O sea: el formulario de edición del detalle se resetea al cambiar de
cliente, hoy y después. **Sin cambio de comportamiento.**
[VERIFIED: app/(dashboard)/clients/clients-client.tsx:790,1100-1104]

**Los caminos donde SÍ se pierde (decilo en el plan, no los escondas):**

| Camino | ¿Se pierde? | Evidencia |
|---|---|---|
| Abrir un cliente (`pushState`) y volver con back | **No** | Q2 + este punto |
| Recargar con F5 en `?c=<id>` | **Sí** (todo el estado local) | Es un boot nuevo; NAV-02 sólo pide que se abra ese cliente, no que se restaure el filtro |
| Click en "Clientes" del sidebar estando en `?c=<id>` | **Sí** — es un `<Link>` ⇒ navegación real ⇒ segmento distinto (`ppr-navigations.js:396-418`) ⇒ remonte | Comportamiento de hoy; no es regresión |
| Volver a `/clients` desde otra sección | **Sí** | Igual que hoy (T-6: sin `<Activity>` las páginas se desmontan) |

⚠ Un matiz que conviene medir en la UAT: el criterio 1 del roadmap se recorre entrando **desde
Finanzas por el menú hamburguesa**. En ese recorrido `/clients` se monta fresco, el dueño tipea la
búsqueda, abre un cliente y vuelve. El back en cuestión es el `pushState` → ✅. Pero si además apretás
back otra vez, salís a Finanzas y al volver el filtro **ya no está** — y eso es correcto y está fuera
de alcance (D-01 + T-6).

### Q5 — Dónde vive el helper de NAV-05 y qué forma tiene

**Dónde:** `lib/panel-history.ts` + `lib/panel-history.test.ts`.

- `lib/` es el molde establecido para "la decisión pura, separada de la mecánica de React":
  `lib/unsaved-changes.ts:1-12` lo dice textual ("el runner corre con `environment: 'node'` … Lo único
  que SÍ se puede cubrir es el 'qué se decide' — y por eso se extrae acá"), y lo mismo
  `lib/landing/lightbox.ts:13-16` y `lib/overlay-history.ts:11-16`.
  [VERIFIED: lib/unsaved-changes.ts:1-12 · lib/landing/lightbox.ts:13-16 · lib/overlay-history.ts:11-16]
- El prefijo `panel-` ya existe en el repo con ese significado (`lib/panel-draft.ts`).
  [VERIFIED: lib/panel-draft.ts existe]
- **Sin directiva `'use client'`**, igual que `lib/overlay-history.ts:45-48`: el consumidor
  (`clients-client.tsx`) ya la declara, y marcar el módulo como frontera arrastraría sus funciones puras
  adentro sin necesidad.
- `vitest.config.mts:48` — `environment: 'node'`; el proyecto `pure` incluye por defecto todo lo
  co-ubicado en `lib/` (`vitest.config.mts:40-52`), así que el archivo nuevo entra solo, sin tocar
  config. [VERIFIED: vitest.config.mts:40-52]

**Qué forma tiene (contrato propuesto — todo puro, sin `window`, sin React, sin imports):**

```ts
// lib/panel-history.ts  — SOLO decisiones; la mecánica vive en el componente.

/** Qué hacerle al historial. `consume` = deshacer NUESTRA entrada (un back guardado). */
export type PanelHistoryAction = 'push' | 'replace' | 'none' | 'consume'

/** Por qué cambia la vista. Es lo que decide la acción; el plan NO debe decidirlo en el call site. */
export type PanelViewCause =
  | 'user-open'      // el usuario eligió un destino (abrir un cliente) → push
  | 'user-close'     // el usuario pidió volver ("Volver") → consume
  | 'programmatic'   // la app re-apunta la vista sola (fusión de duplicados) → replace
  | 'filter'         // un filtro, no una subsección (activeLoc de Agenda, T-3) → replace
  | 'stale'          // el valor de la URL no resuelve a nada → replace (saneo)
  | 'concurrent'     // un overlay está consumiendo su entrada en este mismo commit → none

export function panelHistoryAction(input: {
  cause: PanelViewCause
  from: string | null
  to: string | null
  /** ¿La entrada de arriba del stack la empujamos nosotros? (guarda de la cicatriz 2) */
  holding: boolean
}): PanelHistoryAction

/** ¿La entrada de arriba lleva NUESTRA marca? Molde: isOverlayHistoryEntry / shouldConsumeHistoryEntry. */
export function isPanelViewEntry(state: unknown, key: string): boolean

/** El state fresco a empujar. NUNCA spreadear history.state (ver Q3 §3). */
export function panelViewState(value: string): { frjView: string }

/** El id efectivo + si hay que sanear la URL. Es la regla de NAV-02 y la del post-borrado a la vez. */
export function resolveViewParam(input: {
  param: string | null
  exists: boolean
}): { selected: string | null; sanitize: boolean }
```

**Las reglas que el test tiene que fijar** (todas expresables sin DOM):

| Caso | Entrada | Salida esperada |
|---|---|---|
| Abrir un cliente | `cause:'user-open', from:null, to:'abc', holding:false` | `'push'` |
| Cambiar de cliente A→B | `cause:'user-open', from:'a', to:'b', holding:true` | `'push'` (B es un destino propio) |
| Volver, siendo dueños de la entrada | `cause:'user-close', to:null, holding:true` | `'consume'` |
| Volver, **sin** ser dueños (el usuario entró pegando la URL) | `cause:'user-close', to:null, holding:false` | `'replace'` ⚠ **nunca `consume`**: un `back()` acá saca al usuario del sitio (cicatriz 2 de `overlay-history.ts:22-24`) |
| Fusión de duplicados | `cause:'programmatic', from:'dup', to:'keep'` | `'replace'` |
| Borrado con el diálogo cerrándose | `cause:'concurrent'` | `'none'` |
| Filtro (T-3, `activeLoc`) | `cause:'filter', from:'loc1', to:'loc2'` | `'replace'` |
| URL con un id que no resuelve | `resolveViewParam({param:'xxx', exists:false})` | `{selected:null, sanitize:true}` |
| URL sin param | `resolveViewParam({param:null, exists:false})` | `{selected:null, sanitize:false}` |
| Sin cambio real (`from === to`) | cualquier `cause` | `'none'` (evita la cicatriz 1: empujar la misma URL colapsa la entrada — `overlay-history.ts:19-21`) |

**Por qué `cause` y no un booleano:** el criterio 4 exige que exista **una sola forma**. Si la firma
fuera `push: boolean`, cada call site volvería a decidir la política y la Phase 2 tendría que
re-decidirla para los tabs — que es exactamente el "dos dialectos" que el Overview del roadmap quiere
evitar. Con `cause`, el call site declara **qué pasó** y el helper decide **qué se hace**. Es la misma
forma de `decideNavigation({dirty, href, currentPath})` (`lib/unsaved-changes.ts:31-36`): el componente
describe la situación, el módulo decide.

**Test:** `lib/panel-history.test.ts`, molde `lib/unsaved-changes.test.ts:1-30` (`import { describe, it,
expect } from 'vitest'`, import por alias `@/lib/...`, un `it` en español por regla, con el *porqué* en
comentario). Cero jsdom, cero paquetes.

### Q6 — El caso `replace` real de esta fase

**El que el roadmap nombra (`clients-client.tsx:570`) es real, y es el más benigno de los dos.**

```ts
// clients-client.tsx:561-575 (mergeGroup)
const sorted = [...group].sort((a, b) => a.created_at < b.created_at ? -1 : 1)
const keep = sorted[0], toDelete = sorted.slice(1)
...
setClients(prev => prev.filter(c => !toDelete.find(d => d.id === c.id)))
...
if (selectedId && toDelete.find(d => d.id === selectedId)) setSelectedId(keep.id)   // :570
toast.success(`Fusionados ${group.length} → ${keep.name}`)
```
[VERIFIED: app/(dashboard)/clients/clients-client.tsx:561-575]

Flujo verificado: el botón "Fusionar" vive **dentro** del `<Dialog open={mergeModal}>`
(`clients-client.tsx:823` … `:841-843`), y `mergeGroup` **no cierra el modal** — no hay
`setMergeModal(false)` en toda la función. ⇒ **no hay overlay consumiendo entrada en ese commit** ⇒ el
`replace` es seguro tal cual. [VERIFIED: app/(dashboard)/clients/clients-client.tsx:823,841-843,561-575]

**Si empujara:** el back llevaría a `?c=<id-borrado>`; `clients.find(c => c.id === selectedId)`
(`clients-client.tsx:499`) devolvería `undefined` ⇒ `selected = null` ⇒ el detalle se cerraría solo con
la URL mintiendo. No crashea (gracias a `:499`), pero es exactamente el síntoma que el roadmap describe.
**Se expresa como:** `panelHistoryAction({ cause: 'programmatic', from: selectedId, to: keep.id, … })` → `'replace'`.

**⚠ El segundo caso, que el roadmap NO nombra: el borrado.** `deleteClient()`
(`clients-client.tsx:519-531`) hace `setSelectedId(null)` (`:527`) y `setConfirmDelete(false)` (`:528`)
en el mismo lote, con el `<Dialog open={confirmDelete}>` (`:807`) participando de `overlay-history`.
Análisis completo en **Q3 §4**. **Se expresa como:** `cause: 'concurrent'` → `'none'`, y la limpieza de
la URL la hace después la regla de saneo (`resolveViewParam(...).sanitize === true` → un `replace`).

**Por qué la regla de saneo es la pieza que cierra dos requisitos con una sola línea:** el estado "hay
un `c` en la URL que no resuelve a ningún cliente de la lista" es **el mismo** en los tres casos:
(a) post-borrado, (b) id inexistente pegado a mano, (c) id **de otro negocio**. En los tres el
resultado observable es idéntico —vuelta al listado, sin diferencia entre "no existe" y "no es tuyo"—
porque la resolución nunca consulta la base: se hace contra `clients`, que ya vino filtrada por
`.eq('business_id', business.id)` (`page.tsx:21`). Eso es NAV-02 y el cierre del riesgo (b), gratis.
[VERIFIED: app/(dashboard)/clients/page.tsx:18-32 · app/(dashboard)/clients/clients-client.tsx:499]

## Standard Stack

### Core

| Librería | Versión | Propósito | Por qué es el estándar |
|---|---|---|---|
| `next` (App Router) | `16.2.7` | `useSearchParams`, `<Suspense>`, parche de `window.history` | Ya instalado; verificado en `node_modules/next/package.json` |
| `react` / `react-dom` | `19.2.4` | `useState`, `useEffect`, `useMemo` | Ya instalado |
| `vitest` | (instalado) | Tests puros del helper, `environment: 'node'` | `vitest.config.mts:48` |

### Supporting

Ninguna. **Cero dependencias nuevas** — constraint del CONTEXT y del ROADMAP.

### Alternatives Considered

| En vez de | Se podría usar | Trade-off |
|---|---|---|
| `window.history.pushState` | `router.push('/clients?c=…', {scroll:false})` | Request RSC + cambio de segment key ⇒ remonte ⇒ pierde búsqueda y filtros ⇒ **falla el criterio 1** (Q2) |
| Query param | Ruta hija `/clients/[id]` + listado izado a `layout` | Parte un archivo de 1408 líneas y abre el oracle cross-tenant. **Descartado por D-03** — no reabrir |
| `<Suspense>` en `page.tsx` | Nada (confiar en que la ruta es dinámica) | Funciona hoy (Q1) pero deja el build atado a que nadie vuelva estática la ruta. El `<Suspense>` cuesta 3 líneas y ya es el patrón del repo (`layout.tsx:60-62`) |
| Helper nuevo | Reusar `lib/overlay-history.ts` | El CONTEXT lo prohíbe explícitamente ("No tocar"). Y son modelos distintos: el overlay **intercepta** `popstate`, el detalle **deriva** de la URL |

**Installation:** ninguna.

## Package Legitimacy Audit

**No aplica.** Esta fase no instala ningún paquete externo (constraint "cero paquetes nuevos" del
CONTEXT y del ROADMAP). Todo el trabajo usa `next`, `react` y `vitest` ya presentes en
`package.json`. No hay verdictos `SLOP` ni `SUS` que reportar porque no hay candidatos.

## Architecture Patterns

### Diagrama del flujo

```
 ── ABRIR ─────────────────────────────────────────────────────────────────────
 click en la lista                (clients-client.tsx:723)
   └─> panelHistoryAction({cause:'user-open', …}) ──> 'push'
         └─> window.history.pushState({frjView:id}, '', '?c=<id>')   [state FRESCO]
               └─ parche de Next (app-router.js:252-263)
                    ├─ copyNextJsInternalHistoryState → agrega __NA + __TREE
                    └─ applyUrlFromHistoryPushReplace(url)
                         └─ startTransition(ACTION_RESTORE)
                              └─ restoreReducer (HistoryTraversal)
                                   ├─ reusa el CacheNode  → SIN request al server
                                   ├─ canonicalUrl = '/clients?c=<id>'
                                   └─ focusAndScrollRef intacto → SIN scroll-to-top
                                        └─ SearchParamsContext cambia
                                             └─ ClientsClient re-renderiza
                                                  (search/filter/filterPro/filterInsurance INTACTOS)

 ── BACK DEL USUARIO ──────────────────────────────────────────────────────────
 popstate del browser
   ├─> onPopState de Next (app-router.js:284-300) → dispatchTraverseAction → URL sin ?c
   │      └─ ClientsClient ve param=null → detalle cerrado, listado como estaba
   └─> onPop de overlay-history — SÓLO si hay un overlay abierto (overlay-history.ts:338-339)
          (el detalle NO tiene listener: D-01)

 ── CERRAR POR "VOLVER" ───────────────────────────────────────────────────────
 clients-client.tsx:1205 (onBack)
   └─> holding? ── sí ──> 'consume' → guard isPanelViewEntry → history.back()
                └─ no ──> 'replace'  (el usuario entró pegando la URL: back lo sacaría del sitio)

 ── FUSIONAR / BORRAR ─────────────────────────────────────────────────────────
 mergeGroup   (:570) → cause:'programmatic' → 'replace'   (el modal NO se cierra: seguro)
 deleteClient (:527) → cause:'concurrent'   → 'none'      (el Dialog está consumiendo SU entrada)
        └─ después, en un render posterior: resolveViewParam(...).sanitize → 'replace'
```

### Estructura de archivos tocados

```
lib/
├── panel-history.ts        # NUEVO — decisiones puras (push|replace|none|consume) + marcador
├── panel-history.test.ts   # NUEVO — vitest, environment 'node', molde unsaved-changes.test.ts
├── overlay-history.ts      # NO SE TOCA (CONTEXT)
└── unsaved-changes.ts      # NO SE TOCA (CONTEXT)

app/(dashboard)/clients/
├── page.tsx                # Edit mínimo: <Suspense fallback={null}> alrededor de <ClientsClient>
└── clients-client.tsx      # Edit: selectedId pasa a derivarse de useSearchParams;
                            #       los 5 call sites (723, 797, 527, 570, + saneo) usan el helper
```

### Pattern 1: escribir la query sin volver al server

```tsx
// Fuente: node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:351-372
'use client'
import { useSearchParams } from 'next/navigation'

export default function SortProducts() {
  const searchParams = useSearchParams()

  function updateSorting(sortOrder: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', sortOrder)
    window.history.pushState(null, '', `?${params.toString()}`)
  }
  ...
}
```

Adaptación para esta fase (la diferencia que importa: **state fresco con marcador**, no `null`, para
poder guardar el `back()` de cierre; ver Q3 §3):

```ts
const params = new URLSearchParams(searchParams.toString())
params.set('c', id)
window.history.pushState(panelViewState(id), '', `?${params.toString()}`)
//                        ^ { frjView: id } — objeto NUEVO, jamás {...window.history.state, …}
```

### Pattern 2: la guarda antes de cualquier `back()`

```ts
// Fuente: lib/overlay-history.ts:110-117 (y su gemelo lib/landing/lightbox.ts:130-137)
export function isOverlayHistoryEntry(state: unknown, id: number): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'frjOverlay' in state &&
    (state as { frjOverlay?: unknown }).frjOverlay === id
  )
}
```
El helper nuevo replica esta forma exacta con la clave `frjView`. Narrowing manual, sin `any`
(`tsconfig` con `strict: true`): `history.state` es `unknown` de verdad.

### Anti-patterns a evitar

- **Interceptar `popstate` desde el detalle.** Rompe D-01 y colisiona con el listener de
  `overlay-history`. El detalle deriva de `useSearchParams`, punto.
- **Empujar el state spreadeando `window.history.state`.** El `__NA` heredado hace que el parche de
  Next tome la rama temprana y **no** sincronice `useSearchParams` (`app-router.js:253-255`). Falla en
  silencio.
- **Empujar la misma URL dos veces.** El router colapsa la entrada y el back se lleva la página
  (cicatriz 1, `overlay-history.ts:19-21`). De ahí la regla `from === to ⇒ 'none'`.
- **Dos mutaciones de historial en el mismo commit.** `history.back()` es asincrónico:
  `window.history.state` queda viejo y la segunda guarda decide mal (Q3 §4).
- **Guardar una referencia al `pushState` original.** Constraint transversal del ROADMAP; además
  perdería el `__NA` y el siguiente back haría `window.location.reload()` (`app-router.js:288-292`).
- **Leer el cliente por id contra la base.** Abriría el oracle de existencia cross-tenant (riesgo (b)).
  Se resuelve contra `clients` (ya filtrada), `clients-client.tsx:499`.
- **`router.push` para el detalle.** Ver Q2.

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|---|---|---|---|
| Sincronizar la URL con el estado de UI | Un estado paralelo + listener de `popstate` | `window.history.pushState` + `useSearchParams` | Next ya parchea `pushState` para despachar `ACTION_RESTORE` y mantener `__NA` (`app-router.js:252-263`, `:84-95`). Hacerlo a mano pierde `__NA` ⇒ reload en el back |
| Detectar si la entrada de arriba es nuestra | Un contador de profundidad | Marcador en `history.state` + narrowing manual | Ya probado tres veces en el repo: `overlay-history.ts:110-117`, `lightbox.ts:130-137`, `photo-lightbox.tsx:118` |
| Cerrar overlays con el back | Cualquier cosa nueva | `lib/overlay-history.ts` tal cual | Ya funciona y el CONTEXT prohíbe tocarlo |
| Evitar el salto al tope al cambiar la query | `scrollRestoration` a mano | `pushState` (no toca `focusAndScrollRef`) | `segment-cache/navigation.js:415` |
| Bloquear la navegación con cambios sin guardar | Interceptar `popstate` | `onNavigate` del `<Link>` — ya implementado | `unsaved-changes-guard.tsx:11-25` documenta que Next 16 **no** expone API de bloqueo para `popstate` |

**Key insight:** todo lo difícil de este dominio es *el orden de los efectos sobre una pila
asincrónica*. Cada vez que el repo lo intentó a mano pagó el mismo bug (las "tres cicatrices",
`overlay-history.ts:18-27`). La forma que funciona es siempre la misma: **decisión pura + una sola
mutación + guarda por marcador.**

## Runtime State Inventory

No aplica: esta fase no es un rename/refactor/migración de datos. Cero migraciones, cero datos
tocados, cero strings persistidos. Para constancia, las cinco categorías:

| Categoría | Encontrado | Acción |
|---|---|---|
| Stored data | **Ninguno** — verificado: el `selectedId` vive en `useState` (`clients-client.tsx:220`), nunca se persiste | — |
| Live service config | **Ninguno** — verificado: no hay webhook, cron ni workflow que dependa de la URL de `/clients` | — |
| OS-registered state | **Ninguno** — `vercel.json` sólo declara el cron a `/api/cron/cancel-expired` | — |
| Secrets/env vars | **Ninguno** — la fase no lee ninguna env var | — |
| Build artifacts | **Ninguno** de dominio. Nota operativa: `.next/` del 2026-09-28 queda obsoleto tras el cambio; `npm run build` lo regenera | — |

## Common Pitfalls

### Pitfall 1 — El `pushState` que no sincroniza

**Qué sale mal:** la URL cambia pero la UI no reacciona; `useSearchParams` sigue devolviendo el valor
viejo.
**Por qué pasa:** el objeto de state que se empujó ya traía `__NA` (típicamente por spreadear
`window.history.state`), y el parche toma la rama `if (data?.__NA || data?._N) return originalPushState(...)`
(`app-router.js:253-255`), que **no** despacha `ACTION_RESTORE`.
**Cómo evitarlo:** empujar siempre un objeto literal fresco (`{ frjView: id }`), molde
`overlayHistoryState` (`overlay-history.ts:93-95`).
**Señal temprana:** la URL en la barra cambia, el detalle no abre, y **no hay ningún error en consola**.

### Pitfall 2 — El back que recarga la página entera

**Qué sale mal:** apretar atrás produce un full reload en vez de una transición.
**Por qué pasa:** se escribió una entrada sin `__NA` (usando una referencia guardada al `pushState`
original, o `history.replaceState` crudo antes de que el efecto del `Router` haya parcheado). El
`onPopState` de Next hace `window.location.reload()` si `!event.state.__NA` (`app-router.js:288-292`).
**Cómo evitarlo:** usar siempre `window.history.pushState` tal como está en ese momento.
**Señal temprana:** un flash blanco al apretar atrás, y el estado local perdido.

### Pitfall 3 — La misma URL empujada dos veces

**Qué sale mal:** hay que apretar atrás dos veces, o el primer atrás saca al usuario de la página.
**Por qué pasa:** empujar una URL idéntica hace que el router colapse la entrada — cicatriz 1,
documentada en `overlay-history.ts:19-21` y `lightbox.ts:21-28`, con un bug real de producción detrás.
**Cómo evitarlo:** la regla `from === to ⇒ 'none'` en el helper, cubierta por test.
**Señal temprana:** en DevTools → Application → History, la cantidad de entradas no crece al abrir un
cliente.

### Pitfall 4 — Dos mutaciones de historial en el mismo commit (el borrado)

**Qué sale mal:** después de borrar, el atrás lleva a la ficha de un cliente que ya no existe.
**Por qué pasa:** `deleteClient` cierra el diálogo y el detalle a la vez (`clients-client.tsx:526-529`);
el `back()` del overlay es asincrónico, así que cualquier guarda posterior lee `history.state` viejo, y
un `replaceState` en ese instante reescribiría la entrada **del overlay**, no la del detalle.
**Cómo evitarlo:** `cause: 'concurrent'` → `'none'` + regla de saneo posterior (Q3 §4, Q6).
**Señal temprana:** borrar un cliente y apretar atrás muestra una ficha vacía o el detalle de un
fantasma.

### Pitfall 5 — Suponer que `npm run build` avisa

**Qué sale mal:** se confía en que si el `<Suspense>` faltara, el build lo diría. Y sí lo diría… pero
sólo si la ruta fuera estática. Como `/clients` es dinámica, **un `useSearchParams` mal ubicado no
rompe el build** — el problema aparecería recién el día que alguien haga estática la ruta.
**Cómo evitarlo:** poner el `<Suspense>` igual (`layout.tsx:60-62` como molde) y no tratar el build
verde como prueba de corrección del hook.

### Pitfall 6 — `npx tsc` sale 0 falsamente

**Cómo evitarlo:** `./node_modules/.bin/tsc --noEmit`. Constraint del CONTEXT y memoria
`worktree-nodemodules-y-npx-tsc-traps`.

### Pitfall 7 — Dos canarios de reloj

Fuera de `[01:00, 23:30]` hora AR, dos tests fallan a propósito. No es una regresión de esta fase
(CONTEXT).

## Code Examples

### Leer el id de la URL (ruta dinámica ⇒ disponible ya en el render inicial del server)

```tsx
// Fuente: node_modules/next/dist/docs/.../use-search-params.md:190-206
'use client'
import { useSearchParams } from 'next/navigation'

export default function SearchBar() {
  const searchParams = useSearchParams()
  const search = searchParams.get('search')
  // This will be logged on the server during the initial render
  // and on the client on subsequent navigations.
  return <>Search: {search}</>
}
```

### Reemplazar sin dejar entrada (el caso `replace`)

```tsx
// Fuente: node_modules/next/dist/docs/.../04-linking-and-navigating.md:401-421
'use client'
import { usePathname } from 'next/navigation'

export function LocaleSwitcher() {
  const pathname = usePathname()
  function switchLocale(locale: string) {
    const newPath = `/${locale}${pathname}`
    window.history.replaceState(null, '', newPath)
  }
  ...
}
```

### El `<Suspense>` tal como el repo ya lo escribe

```tsx
// Fuente: app/(dashboard)/layout.tsx:60-62
<Suspense fallback={null}>
  <PlanBanner planStatus={planStatus} daysLeft={daysLeft} />
</Suspense>
```

## State of the Art

| Enfoque viejo | Enfoque actual | Cuándo cambió | Impacto |
|---|---|---|---|
| `export const dynamic = 'force-dynamic'` para forzar render dinámico | `connection()` | Next 16 | `use-search-params.md:262`: "Prefer using `connection()` instead, as it semantically ties dynamic rendering to the incoming request". **No hace falta acá**: `cookies()` ya lo fuerza |
| Izar estado a un layout compartido para que sobreviva la navegación | `<Activity>` | Next 16 + `cacheComponents: true` | **No disponible** (T-6). `next.config.ts:29-44` sólo declara `images` y `allowedDevOrigins` |
| `middleware.ts` | `proxy.ts` | Next 16 | Ya aplicado (`proxy.ts:37`) |

**Deprecado / a no usar:**
- `router.push` para cambiar sólo la query en la misma ruta → usar la Native History API.
- Guardar una referencia al `pushState` original → rompe `__NA`.

## Contradicciones y correcciones al ROADMAP / CONTEXT

Esto es lo que más importa. Cinco puntos, ordenados por impacto.

### C-1 (alto) — Falta un caso `replace`: el **borrado**, y es peor que la fusión

El Overview del ROADMAP dice que el detalle "es el único que ejerce los tres casos del helper", y nombra
como `replace` sólo `clients-client.tsx:570` (fusión). Medido, hay **dos**: `deleteClient()`
(`clients-client.tsx:519-531`) también re-apunta la vista (`setSelectedId(null)` en `:527`) — y a
diferencia de la fusión, lo hace **mientras un `<Dialog>` está consumiendo su propia entrada de
historial** (`:528` cierra el diálogo de `:807`, que participa de `overlay-history` vía
`components/ui/dialog.tsx:33-37`). Ese caso **no se resuelve con `replace`**: exige una cuarta decisión
(`none`) más una regla de saneo posterior. Detalle en Q3 §4 y Q6. **Consecuencia para el plan:** el
helper tiene 4 acciones (`push` | `replace` | `none` | `consume`), no 3 + consumo, y el criterio 3 debería
mencionar también el borrado, no sólo la fusión.

### C-2 (medio) — T-5 no es exacto: el panel **ya tiene** un `useSearchParams`, y ya tiene su `Suspense`

T-5 dice "el panel hoy tiene **cero** `useSearchParams` (el único del repo está en `plan-banner.tsx`)…
No hay patrón previo de estado-en-URL que copiar en el panel". Pero `PlanBanner` se renderiza **dentro
del layout del panel** (`app/(dashboard)/layout.tsx:61`), o sea que corre en `/clients` y en las otras
13 rutas. Y ya está envuelto en `<Suspense fallback={null}>` (`layout.tsx:60-62`). **Sí hay patrón que
copiar, y es de este repo.** Esto no cambia la decisión, la abarata: el plan no inventa nada.

### C-3 (medio) — El criterio 3 menciona una "✕" que no existe

Criterio 3: *"cerrar el detalle por el 'Volver' de mobile (…) o por la ✕"*. Medido: el **único**
afordance de cierre del detalle es el "Volver" `lg:hidden` (`clients-client.tsx:1205`), cableado desde
`:797`. No hay botón ✕ en `ClientDetail` (`clients-client.tsx:1105-1126` es toda su firma de props:
`onBack`, `onRequestDelete`, `onMarkStatus`, `onDeleteAppt`, `onPatchClient`). En **desktop no hay
forma de cerrar el detalle**: el split lo deja siempre visible (`:586-591`). **Consecuencia:** el
criterio 3 sólo es observable en mobile; si el plan agrega una ✕ para "cumplirlo", eso es **cambio
visual** y reabre el gate de UI (criterio 5). No agregarla.

### C-4 (medio) — Falta un `replaceState` crudo en el inventario: Agenda

T-2 nombra `settings-client.tsx:1021` como el `replaceState` crudo del panel. Hay **otro**:
`app/(dashboard)/agenda/agenda-client.tsx:290` — `window.history.replaceState(null, '', '/agenda')`,
en el efecto que limpia `?google=connected|error` (`agenda-client.tsx:285-291`). Es el gemelo exacto de
T-2 para el OAuth de Google. **Consecuencia:** el criterio 5 de la **Phase 2** (grep de `pushState|
replaceState|history.back` acotado a `settings-client.tsx` y `finances-client.tsx`) **dejaría este
fuera**, y quedaría un dialecto crudo vivo justo en la pantalla del T-3. No es trabajo de la Phase 1,
pero conviene anotarlo ahora en el ROADMAP para que la Phase 2 lo absorba.

### C-5 (bajo) — El riesgo de build está sobreestimado (y mal atribuido)

El ROADMAP dice: *"las 14 páginas del panel llaman `createClient()` → `cookies()` ⇒ son dinámicas ⇒ el
fallo de build no debería aparecer. 'No debería' no es 'no aparece'"*. La cautela es sana, pero la
evidencia disponible es más fuerte que "no debería": el bailout es un `throw` que existe **sólo** en los
work-unit stores de prerender (`dynamic-rendering.js:586-596`) y `case 'request': return;`
(`:619-620`); y `/clients` **no está** en `.next/prerender-manifest.json`. **`npm run build` sigue
siendo criterio de la fase** (barato, y cubre el caso de que alguien vuelva estática la ruta), pero no
debería ser tratado como el riesgo dominante de la Phase 1. **El riesgo dominante es el (c)**, y
concretamente el C-1 de arriba.

### Nota de forma (no contradicción) — la `<Suspense>` recomendada toca `page.tsx`

El ROADMAP no menciona tocar `app/(dashboard)/clients/page.tsx`. La recomendación de Q1 agrega ahí un
`<Suspense fallback={null}>` de 3 líneas. Es cero cambio visual (en ruta dinámica el fallback no se
renderiza) y cero cambio de datos, pero es un archivo más en el diff: que el plan lo declare.

## Assumptions Log

| # | Claim | Sección | Riesgo si está mal |
|---|---|---|---|
| A1 | El nombre de parámetro sugerido (`c`) es libre y no colisiona con nada existente en `/clients`. Verifiqué que `plan-banner.tsx` usa `subscription`, `agenda-client.tsx` usa `google` y `settings-client.tsx` usa `mp` — pero **no** audité los 14 archivos del panel exhaustivamente | Q5, Pattern 1 | Bajo: una colisión se ve al instante en la UAT. El plan puede elegir `cliente` o `sel` si prefiere |
| A2 | React corre los efectos de los hijos antes que los del padre, por lo que el efecto de `useOverlayHistory` del `<Dialog>` corre antes que cualquier efecto de `ClientsClient`. Es conocimiento de React, **no lo verifiqué en el runtime instalado** esta sesión | Q3 §4 | Medio: si el orden fuera el inverso, la colisión del borrado cambiaría de forma (pero **no** desaparecería — el `back()` seguiría siendo asincrónico, que es el argumento que sostiene la conclusión) |
| A3 | Que el listado no se desmonte implica que el scroll interno de `listRef` (`clients-client.tsx:576-580`) se conserva | Q2, Q4 | Bajo: si el nodo DOM persiste, `scrollTop` persiste. **NO VERIFICADO** empíricamente en navegador |
| A4 | El piso de suite (≥1392 passed / 98 archivos) sigue vigente. Lo tomé del CONTEXT; **no corrí `npx vitest run`** esta sesión | Restricciones | Bajo: el plan lo re-mide antes de empezar |
| A5 | `.next/prerender-manifest.json` corresponde a un `npm run build` exitoso del código actual de `/clients`. El `BUILD_ID` es del 2026-09-28 y desde entonces hubo commits (`d39b92d` es sólo docs; `50ee659`/`ed4d986` tocaron overlays). **No corrí el build** esta sesión | Q1 | Bajo: la conclusión de Q1 se sostiene igual por el runtime (`case 'request': return`), que no depende del manifest |

## Open Questions

1. **¿Cambiar de cliente A→B debe empujar entrada o reemplazarla?**
   - Lo que sabemos: el roadmap sólo dice que "abrir un cliente es un destino" (⇒ `push`).
   - Lo que no está claro: con `push`, revisar 10 fichas seguidas deja 10 entradas y salir de Clientes
     requiere 10 backs. Con `replace` A→B, un solo back sale — pero el back deja de "volver a la ficha
     anterior".
   - Recomendación: **`push`** (coherente con "es un destino" y con cómo se comportan las apps nativas),
     y dejar la decisión asentada en el helper con su test, para que no se re-discuta en la Phase 2.

2. **¿El saneo de la URL debe correr en `useEffect` o en el render?**
   - Lo que sabemos: la regla de decisión es pura y testeable; su *disparo* no.
   - Lo que no está claro: un `replaceState` en un efecto que depende de `searchParams` puede
     re-disparar el efecto (el `replaceState` cambia `canonicalUrl` → cambia el contexto). Hace falta
     un guard de idempotencia, molde `holdingRef` (`overlay-history.ts:298`).
   - Recomendación: efecto + guard, y que el test cubra "saneo pedido dos veces = una sola escritura".

3. **¿Qué pasa con el back cuando el detalle está abierto y la guarda de cambios sin guardar está
   activa?** Hoy Agenda es la única pantalla con `useUnsavedChanges`
   (`unsaved-changes-guard.tsx:30-32`), y Clientes **no** la usa — así que en esta fase no hay
   interacción. **NO VERIFICADO** para el futuro en que Clientes la adopte; queda fuera de alcance.

4. **UAT en celular real.** El milestone **es** el comportamiento del botón atrás. `auto_advance` está
   en `true` en `.planning/config.json` (workflow) pero el workstream lo pisa a `false`
   (`.planning/workstreams/panel-nav/config.json`), así que el checkpoint humano **no** se
   auto-aprueba. Verificado. Igual: sin abrir el navegador no hay evidencia de nada.

## Environment Availability

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|---|---|---|---|---|
| `next` | Todo | ✓ | `16.2.7` (verificado en `node_modules/next/package.json`) | — |
| `vitest` | Tests del helper | ✓ | `vitest.config.mts` presente + 15 `*.test.ts` en `lib/` | — |
| `tsc` | Typecheck | ✓ | `./node_modules/.bin/tsc` | ⚠ nunca `npx tsc` |
| Navegador real en celular | UAT de NAV-01 | ✗ (no automatizable acá) | — | **Sin fallback**: es checkpoint humano |
| Supabase local | Reproducir el listado con datos | No verificado esta sesión | — | `supabase db reset` + `supabase/seed.sql` (memoria `local-test-business-seed`) |

**Missing dependencies with no fallback:** el celular real para la UAT. Es exactamente lo que el
ROADMAP ya exige.

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`.

### Categorías ASVS aplicables

| Categoría ASVS | Aplica | Control estándar |
|---|---|---|
| V2 Authentication | no (indirecto) | Sin cambios: `supabase.auth.getUser()` en `page.tsx:7` y `layout.tsx:22`; `updateSession` en `proxy.ts:58` |
| V3 Session Management | no | Sin cambios |
| V4 Access Control | **sí** | El id llega por la URL. El control es que **la resolución no consulta la base**: `clients.find(c => c.id === selectedId)` sobre la lista ya filtrada por `.eq('business_id', business.id)` (`page.tsx:21`, `clients-client.tsx:499`) |
| V5 Input Validation | **sí** | El `c` de la query es un string arbitrario del cliente. Sólo se usa para comparar por igualdad contra ids ya autorizados — nunca para armar una query ni para elegir qué leer |
| V6 Cryptography | no | La fase no toca criptografía |

### Patrones de amenaza para este stack

| Patrón | STRIDE | Mitigación estándar |
|---|---|---|
| Enumeración de ids (oracle de existencia cross-tenant) | Information Disclosure | **Resolver contra la lista, no contra la base.** Un id inexistente y uno de otro negocio producen el mismo resultado observable (listado), porque ninguno matchea. Es el cierre del riesgo (b) del ROADMAP, garantizado por D-03 |
| IDOR vía parámetro de URL | Elevation of Privilege | El `business_id` nunca sale de la URL: sale de `owner_id` (`page.tsx:10-16`). La URL no puede ampliar el conjunto de clientes visibles |
| Fuga de un id de cliente por la URL (historial, logs de proxy, screenshot) | Information Disclosure | Riesgo **aceptado**: el panel es privado y `noindex` (`lib/noindex.ts`, `layout.tsx:18`). Un UUID de cliente en la URL del dueño no es un secreto para el dueño. ⚠ **A anotar en `secure-phase`**: la URL con `?c=<uuid>` puede quedar en historial compartido si el dueño presta el dispositivo |
| XSS vía el valor de la query | Tampering | No hay: el valor nunca se renderiza; sólo se compara. React escapa por defecto |

**Nada de esto cambia el esquema, las policies ni el service role.** Cero migraciones.

## Sources

### Primary (HIGH confidence) — leídos esta sesión

- `node_modules/next/dist/client/components/app-router.js` — `copyNextJsInternalHistoryState` (:84-95),
  `HistoryUpdater` (:38-71), memo de `searchParams` (:116-125), parche de `pushState`/`replaceState`
  (:234-279), `onPopState` (:284-300), `SearchParamsContext.Provider` (:429-431)
- `node_modules/next/dist/client/components/router-reducer/reducers/restore-reducer.js:15-53`
- `node_modules/next/dist/client/components/router-reducer/ppr-navigations.js` — enum `FreshnessPolicy`
  (:51-59), `startPPRNavigation` (:71-80), switch de refresco (:131-146), reuso de CacheNode (:159-164),
  `createSegmentFromRouteTree` (:396-418)
- `node_modules/next/dist/client/components/segment-cache/navigation.js` — `navigateToKnownRoute`
  (:109-155), `fetchServerResponse` (:208), `preserveCustomHistoryState` (:271, :382, :413),
  `completeSoftNavigation` (:288-…), `completeTraverseNavigation` (:404-425)
- `node_modules/next/dist/client/components/navigation.js:94-99` — `useSearchParams` / `useDynamicSearchParams`
- `node_modules/next/dist/server/app-render/dynamic-rendering.js:566-624` — `useDynamicSearchParams`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md` — :82-86,
  :176-182, :184-186, :260-274
- `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` — :341-345,
  :351-372, :397-421
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` — :44-45, :117-119
- `.next/prerender-manifest.json`, `.next/server/app-paths-manifest.json` (build del 2026-09-28)
- Repo: `lib/overlay-history.ts` (completo), `lib/unsaved-changes.ts`, `lib/unsaved-changes.test.ts`,
  `lib/landing/lightbox.ts:1-137`, `components/ui/dialog.tsx`, `components/ui/drawer.tsx`,
  `components/dashboard/unsaved-changes-guard.tsx:1-40`, `components/dashboard/plan-banner.tsx:1-40`,
  `app/(dashboard)/layout.tsx`, `app/(dashboard)/clients/page.tsx`,
  `app/(dashboard)/clients/clients-client.tsx` (secciones :190-270, :480-620, :718-730, :788-852,
  :1100-1215), `app/(dashboard)/agenda/agenda-client.tsx:280-296`, `lib/supabase/server.ts`,
  `proxy.ts`, `next.config.ts`, `vitest.config.mts`, `.planning/config.json`,
  `.planning/workstreams/panel-nav/config.json`

### Secondary (MEDIUM confidence)

Ninguna. No se usó búsqueda web: los proveedores están desactivados en `.planning/config.json`
(`brave_search`, `exa_search`, `firecrawl`, `tavily_search`, `ref_search`, `perplexity`, `jina` — todos
`false`), y el dominio de esta fase es enteramente in-repo + `node_modules`.

### Tertiary (LOW confidence)

Ninguna.

## Metadata

**Confidence breakdown:**

- **Q1 (build):** HIGH — mecanismo leído en el runtime (`case 'request': return`) + manifest del build
  real. Residual: no corrí `npm run build` esta sesión (A5).
- **Q2 (pushState vs router.push):** HIGH — cadena completa leída en `app-router.js` +
  `restore-reducer.js` + `ppr-navigations.js` + `segment-cache/navigation.js`.
- **Q3 (convivencia):** HIGH para el mecanismo (`__NA`, marcadores, `HistoryUpdater`); MEDIUM para el
  orden exacto de efectos en la colisión del borrado (A2) — pero la conclusión no depende de él.
- **Q4 (filtros):** HIGH — los 5 `useState` citados con línea + la prueba de que el componente no se
  desmonta. Residual: scroll interno no verificado en navegador (A3).
- **Q5 (helper):** HIGH para el molde y el emplazamiento (3 precedentes en `lib/`); la forma exacta de
  la firma es una **propuesta**, no un hecho.
- **Q6 (`replace`):** HIGH — los dos call sites leídos, y el flujo del modal de fusión verificado.
- **Standard stack:** HIGH — cero paquetes nuevos.
- **Contradicciones:** HIGH — las cinco están citadas con archivo:línea.

**Research date:** 2026-09-29
**Valid until:** 2026-10-29 (30 días). Se invalida antes si se sube la versión de Next o si se activa
`cacheComponents` en `next.config.ts` (cambiaría T-6 y el camino de `prerender-client`).
