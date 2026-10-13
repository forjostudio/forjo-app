# Phase 3: La política de atrás, de un nivel a dos — Research

**Researched:** 2026-10-13
**Domain:** `window.history` + App Router de Next 16.2.7 · tres módulos propios que ya escriben en la misma pila
**Confidence:** **HIGH** en los hechos de código y de plataforma (todo leído este sesión, con archivo:línea) · **MEDIUM** en las consecuencias observables de la política nueva (derivadas del código, **no medidas en un navegador**) · ver `## Assumptions Log`

> **Cómo leer las etiquetas.** `[VERIFIED: archivo:líneas]` = abrí el archivo con `Read`/`sed` **en esta sesión** y la cita de abajo es **verbatim**. `[CITED: doc]` = sale de un artefacto del repo o de `node_modules/next/dist/docs/`. `[ASSUMED]` = razonamiento mío sobre el código, **no medido**. En este repo un supuesto disfrazado de hecho ya costó caro (memoria `medir-antes-de-aceptar-un-fix-propuesto`, cinco fixes confiados que se cayeron al medirlos), así que todo lo que no verifiqué está marcado y listado al final.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: MOB-05 SE IMPLEMENTA**, con el aviso efímero. El primer atrás en Inicio no sale y avisa; el
segundo sale. — *Reversibility:* reversible.
- El dueño eligió esto sabiendo el costo medido: **dos toques de atrás siempre** para salir del panel
  desde Inicio, y que la condición que lo haría natural —una app instalada— **no existe**.
- ⚠ **Su forma NO se discute acá: ya está cerrada por el UI-SPEC de la Phase 2 (§13 y O-3).** No es un
  toast de `sonner`: es un **elemento propio del componente de la barra**, anclado 8px arriba de ella.
- ⚠ **La regla que la Phase 3 tiene que respetar, del propio §13:** la **duración visible** del aviso y
  la **ventana lógica** en la que el segundo atrás sale son el **MISMO valor**, exportado desde **un
  solo lugar** (constante única, `PANEL_EXIT_HINT_MS = 2000`).

**D-02: Más se APILA sobre lo que haya abierto.** `Inicio → Turnos → Más → atrás` cae en **Turnos**. —
*Reversibility:* costly.
- ⚠ **Consecuencia que hay que escribir en el requisito:** en ese recorrido la pila tiene **tres**
  escalones. "Dos niveles" es la profundidad de **Más y sus secciones**, **no un techo de la pila**.
  **El planner tiene que precisar esa frase** de MOB-04 y del criterio 1.

**D-03: tocar Más estando DENTRO de su rama SUBE un nivel, no apila.** Pila final
`Inicio → Más → Configuración`. — *Reversibility:* reversible.
- **No inventa un concepto nuevo:** es la misma regla de NAV-08 / `consumeOwnedPanelEntry`.
- ⚠ **No confundir con `replace`:** dejaría `/mas` encima de `/mas` ⇒ dos entradas idénticas ⇒ atrás
  muerto (cicatriz 1).

**D-04: la fase NO agrega ningún affordance visible.** Ni Más iluminado, ni "volver a Más", ni
breadcrumb. — *Reversibility:* reversible.

### Claude's Discretion

- **Cómo** se expresan los dos niveles: rama nueva sobre rutas en `panelNavMode` vs. marca en
  `history.state`. El camino (iii) —Más como hoja de `overlay-history`— **ya está descartado**.
  ⚠ Si se elige la marca, rige **H-4**: sobrevive al atrás pero la borra la siguiente navegación
  blanda ⇒ re-verificarla en el punto de uso.
- El orden de evaluación y cómo colapsar la pila al volver a un destino de la barra (criterio 2).
- La forma de los tests puros nuevos, en el molde que `lib/panel-history.ts` ya documenta
  (`environment: 'node'`, sin jsdom ni paquetes nuevos).

### Deferred Ideas (OUT OF SCOPE)

- **Mostrar que estás dentro de la rama de Más** (Más iluminado, "volver a Más", breadcrumb) — difirió
  D-04; si la UAT muestra que el dueño se pierde, vuelve por `/gsd-ui-phase`.
- **PWA / `manifest`** — hoy gatear por `display-mode: standalone` daría siempre false (M-8, T-10).
- **Forzar que el atrás nunca cruce de sección al entrar directo a una ruta** — aceptado en v0.30.
- **Extender `useUnsavedChanges` a pantallas nuevas.**
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descripción | Qué de esta investigación lo habilita |
|---|---|---|
| **MOB-04** | El atrás tiene **dos niveles**: desde una sección abierta por Más vuelve a **Más**, y desde Más vuelve a **Inicio**. Desde una sección de la barra vuelve a **Inicio**. | §A-1 (las dos ramas de ruta que lo resuelven sin tocar ningún componente) · §A-2 (la marca que D-03 y el criterio 2 necesitan) · §A-3 (el colapso) |
| **MOB-05** | En **Inicio**, el atrás pide confirmación antes de salir del panel. | §A-4 (qué del ciclo sentinel de `dirty-history` es reusable y qué no) · §A-4.3 (la trampa del sentinel que deja un atrás muerto al salir de Inicio) · §A-4.4 (el gate de viewport, que es una decisión abierta) |
| **MOB-06** | Nada de esto rompe lo verificado en celular: overlays, selectores, calendario y el aviso de cambios sin guardar. | §A-5 (convivencia de marcas y la regla 0) · §A-7 (el orden guard-primero y lo que hay que extender en `leaveNavigationPlan`) · §C (pitfalls) |
</phase_requirements>

---

## Summary

La fase se parte en **dos mitades de dificultad muy distinta**, y conviene que el plan las separe
desde el primer día.

**La mitad fácil (MOB-04 "hacia abajo") son dos ramas en una función pura y cero cambios en
componentes.** Hoy `panelNavMode` tiene exactamente cuatro líneas de regla, y `/mas` cae en la cuarta
(`sección → sección ⇒ replace`), que es literalmente por qué hoy `Más → sección → atrás` cae en Inicio
salteando Más. Agregar `to === '/mas' ⇒ push` (D-02) y `from === '/mas' ⇒ push` (MOB-04 nivel 1) cambia
el comportamiento de la barra y de la pantalla Más **sin tocar una línea de `panel-bottom-nav.tsx` ni
de `mas-client.tsx`**, porque los dos ya consumen la función en su `<Link replace={…}>`. Y el desktop
no se entera **por construcción**, sin ningún chequeo de viewport: el inventario de `buildNavGroups`
no contiene `/mas` (13 `href` leídos uno por uno), así que en el sidebar `from` y `to` nunca valen
`/mas`.

**La mitad difícil (D-03 y el criterio 2) NO es expresable con `(from, to)` y el caso que lo decide es
concreto:** `from = '/finances'`, `to = '/mas'` significa dos cosas opuestas según **qué hay debajo** —
si el dueño llegó por Más hay que **subir** (un `history.back()`), y si entró **directo** a `/finances`
(URL pegada, F5, rebote del proxy post-login) ese mismo `back()` **lo expulsa del sitio**: es la
cicatriz 2, ya sufrida tres veces en este repo. El par de rutas no distingue los dos casos, así que
hace falta **una marca nueva en `history.state`** que diga qué ruta quedó debajo. No es "rutas **vs**
marca": es **rutas para la decisión y marca para el hecho**, exactamente la forma que `panelHistoryAction`
ya tiene (recibe `holding` y `foreignOwnsTop` como booleanos y el ejecutor los lee de `window`).

**Y el colapso del criterio 2 ya tiene implementación de referencia en producción, que es el hallazgo
que más trabajo ahorra:** `leaveNavigationPlan` (`lib/unsaved-changes.ts:83-87`) + el provider del guard
(`components/dashboard/unsaved-changes-guard.tsx:162-220`) corren **consume-then-replace** encadenado
por el `popstate` del consumo, con un listener `{ once: true }` enganchado **en el click y no en un
efecto**, y con la navegación diferida a un commit de React en vez de ejecutada dentro del evento. Las
tres cosas están ahí porque las tres fallaron medidas. El criterio 2 es ese mismo plan con otro
disparador.

**Primary recommendation:** extender `panelNavMode` con dos ramas de ruta (D-02 y MOB-04 nivel 1) y
agregar **una decisión pura nueva** —no un segundo dialecto— que reciba `from`, `to` y un booleano
`masDebajo` leído de una **marca nueva** (`frjUnder`, el nombre lo elige el planner) que cada
navegación del panel escribe **después** del commit con un `replaceState` **sin URL** (no dispara
`ACTION_RESTORE`, no cuesta render). El colapso y el "subir un nivel" se ejecutan con el molde
`consume-then-*` de `leaveNavigationPlan`, extendido con los modos nuevos, y MOB-05 con el ciclo
sentinel de `dirty-history` reducido a "absorber una vez y **no** re-empujar durante la ventana".
Todas las degradaciones caen del lado seguro: **si la marca no está, se empuja o se reemplaza; nunca
se hace `back()` a ciegas.**

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Decidir push / replace / subir / colapsar | **Browser — función pura en `lib/`** | — | `vitest.config.mts` corre `environment: 'node'` ⇒ lo único testeable es el "qué se decide" `[VERIFIED: vitest.config.mts:47-48]` |
| Leer y escribir la marca de la entrada | **Browser — ejecutor en `lib/`** | — | El gate estático de la Phase 2 prohíbe `pushState`/`replaceState`/`history.back` en los tres componentes nuevos `[VERIFIED: test/panel-nav-chrome.test.ts:260-263]` |
| Absorber el `popstate` (MOB-05) | **Browser — hook en `lib/`** | — | El atrás no se cancela, se absorbe (H-5); y el hook no puede vivir en el componente por el mismo gate |
| Dibujar el aviso efímero | **Browser — componente de la barra** | — | §13 del UI-SPEC: elemento propio de la barra, mismo contexto de apilado |
| Sesión / tenant | API / DB | — | **Esta fase no toca ninguno de los dos.** Cero queries, cero policies, cero migraciones (próxima libre sigue siendo la **080**) |

---

## Project Constraints (from CLAUDE.md / AGENTS.md / .claude/CLAUDE.md)

Directivas accionables que el plan **no puede** contradecir:

1. **"This is NOT the Next.js you know."** Next **16.2.7**: leer `node_modules/next/dist/docs/` o los
   fuentes instalados antes de asumir comportamiento. Middleware = `proxy.ts`. *(Cumplido: todos los
   hechos de plataforma de abajo salen de los fuentes instalados, con línea.)*
2. **Aislamiento por tenant no negociable.** No aplica como riesgo nuevo acá (cero queries), pero sí
   como invariante de lectura: `/mas` resuelve el negocio por `owner_id` en el server
   `[VERIFIED: app/(dashboard)/mas/page.tsx:24-28]`.
3. **Dev env Windows + PowerShell.** Los comandos del plan en sintaxis PowerShell.
4. **No reescribir archivos completos** (regla global del dueño): `Edit` parcial, no `Write`, sobre
   `lib/panel-history.ts`, `lib/unsaved-changes.ts` y los tres componentes.
5. **Validar antes de declarar hecho.** Y acá con un agravante del ROADMAP: el modo de falla de esta
   fase es **silencioso** ⇒ la UAT en celular real es el único criterio que vale.
6. **GSD Workflow Enforcement:** nada de ediciones directas fuera del workflow.
7. **Sin paquetes nuevos y sin jsdom** (restricción transversal del ROADMAP).

---

## Hechos de plataforma verificados contra lo instalado (Next 16.2.7)

Todo esto lo leí este sesión. **H-4 del ROADMAP es correcto pero incompleto**, y la parte que le
faltaba es justo la que hace viable el camino de la marca.

| # | Hecho | Evidencia |
|---|---|---|
| **P-1** | `usePathname()` devuelve **sólo el pathname**: ni query ni hash. El memo es literal `pathname: … url.pathname`. ⇒ un hash sentinel en `/dashboard` **no** altera `panelNavMode({ from: pathname, … })`. | `[VERIFIED: node_modules/next/dist/client/components/app-router.js:116-121]` — verbatim: `pathname: (0, _hasbasepath.hasBasePath)(url.pathname) ? (0, _removebasepath.removeBasePath)(url.pathname) : url.pathname` |
| **P-2** | En cada commit del router, `HistoryUpdater` escribe el state así: `{ ...pushRef.preserveCustomHistoryState ? window.history.state : {}, __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: appHistoryState }`. El spread condicional **es** el mecanismo de H-4. | `[VERIFIED: app-router.js:51-58]` — verbatim línea 52: `...pushRef.preserveCustomHistoryState ? window.history.state : {},` |
| **P-3** | `completeSoftNavigation` (Link / `router.push` / `router.replace`) setea `preserveCustomHistoryState: false`; `completeTraverseNavigation` (back/forward) lo setea en `true`, con el comentario de que es a propósito. | `[VERIFIED: node_modules/next/dist/client/components/segment-cache/navigation.js:382 y :411-413]` — verbatim: `// Ensures that the custom history state that was set is preserved when applying this update.` seguido de `preserveCustomHistoryState: true` |
| **P-4** | **La precisión que H-4 no dice, y cambia el diseño.** En una navegación blanda `push` el router hace `pushState` de una entrada **nueva** con state limpio y **no toca la de abajo** ⇒ *la marca de la entrada inferior sobrevive*. En una navegación blanda **`replace`** hace `replaceState` sobre la entrada **actual** ⇒ *ahí sí borra la marca*. El `else` también se toma cuando `pendingPush` es true pero la URL destino es idéntica a la actual: eso es la cicatriz 1 en el fuente. | `[VERIFIED: app-router.js:61-67]` — verbatim: `if (pushRef.pendingPush && (0, _createhreffromurl.createHrefFromUrl)(new URL(window.location.href)) !== canonicalUrl) { … window.history.pushState(historyState, '', canonicalUrl); } else { window.history.replaceState(historyState, '', canonicalUrl); }` |
| **P-5** | **Nuestras propias escrituras SÍ preservan la marca.** El `pushState`/`replaceState` parcheado despacha `ACTION_RESTORE`, y `restoreReducer` termina en `completeTraverseNavigation` ⇒ `preserveCustomHistoryState: true` ⇒ el `replaceState` siguiente de `HistoryUpdater` **conserva** nuestras claves. Esto es lo que mantiene vivos `frjView`, `frjOverlay` y `frjDirty` en producción. | `[VERIFIED: node_modules/next/dist/client/components/router-reducer/reducers/restore-reducer.js:52]` — verbatim: `return (0, _navigation.completeTraverseNavigation)(state, restoredUrl, renderedSearch, task.node, task.route, restoredNextUrl);` |
| **P-6** | **Un `replaceState` SIN URL no despacha nada.** El parche sólo sincroniza el router `if (url)`. ⇒ se puede **marcar la entrada actual sin cambiar la URL, sin render y sin riesgo de desincronizar** `usePathname`. Y el parche igual copia `__NA` y el árbol adentro del objeto. | `[VERIFIED: app-router.js:268-279]` — verbatim: `data = copyNextJsInternalHistoryState(data); if (url) { applyUrlFromHistoryPushReplace(url); } return originalReplaceState(data, _unused, url);` · y `[VERIFIED: app-router.js:84-95]`: `const __NA = currentState?.__NA; if (__NA) { data.__NA = __NA; }` |
| **P-7** | Si un `popstate` llega a una entrada **sin** `__NA`, Next **recarga la página entera**. ⇒ toda escritura propia tiene que pasar por el método parcheado (nunca por una referencia al original). | `[VERIFIED: app-router.js:288-292]` — verbatim: `if (!event.state.__NA) { window.location.reload(); return; }` |
| **P-8** | En el **primer** render (hidratación) el estado inicial del router lleva `preserveCustomHistoryState: true` ⇒ una marca que ya estuviera en la entrada **sobrevive al F5**. | `[VERIFIED: node_modules/next/dist/client/components/router-reducer/create-initial-router-state.js:129]` — verbatim: `preserveCustomHistoryState: true` |
| **P-9** | H-5 confirmado y ya medido en este repo: el `popstate` del atrás del usuario llega `cancelable: false`, la Navigation API tampoco lo cancela, y **el ciclo sentinel completo (S1–S4) se midió funcionando**, incluida la guarda contra el `back()` sobre entrada ajena. S5 (Alt+Left) quedó **no verificado**. | `[CITED: .planning/debug/interceptar-atras-aviso-sin-guardar.md]` — verbatim: `"MEDIDO: el ciclo sentinel completo (S1-S4) funciona, incluida la guarda contra el back() sobre entrada ajena."` y `"S5 (Alt+Left por CDP): NO VERIFICADO — headless no enruta la tecla a historial."` |
| **P-10** | `viewportFit`/`interactiveWidget` ya están declarados y acotados al route group; esta fase **no los toca**. | `[VERIFIED: app/(dashboard)/layout.tsx:36-39]` — verbatim: `export const viewport: Viewport = { viewportFit: 'cover', interactiveWidget: 'resizes-visual', }` |

> **Conclusión sobre H-4, para que el plan no la re-suponga:** la marca **sí** es un idioma viable.
> Sobrevive al atrás (P-3), sobrevive a nuestras propias escrituras (P-5), sobrevive al F5 (P-8), y se
> puede escribir gratis sin tocar la URL (P-6). Lo único que la borra es un **`replace` blando sobre la
> entrada donde vive** (P-4). Por eso la regla operativa sigue siendo la del ROADMAP —**re-verificar en
> el punto de uso**— pero la conclusión práctica es la opuesta a "la marca es frágil": es **frágil en
> un caso identificable y enumerable**, y ese caso se enumera en §C-3.

---

## El código que esta fase redefine — inventario con líneas

### `lib/panel-history.ts` (557 líneas)

| Símbolo | Línea | Qué es |
|---|---|---|
| `panelHistoryAction` | 77 | La decisión de 6 causas, con la **regla 0** (`if (foreignOwnsTop) return 'none'`) primero |
| `panelViewState` / `panelViewEntryParam` | 166 / 187 | La marca `{ frjView: string \| null }` y su lectura |
| `isOverlayOwnedEntry` / `isDirtyGuardOwnedEntry` / `isForeignOwnedEntry` | 212 / 237 / 256 | Los predicados de la regla 0 |
| `PANEL_ROOT` | 290 | **verbatim:** `export const PANEL_ROOT = '/dashboard'` |
| `PanelNavMode` | 293 | **verbatim:** `export type PanelNavMode = 'push' \| 'replace'` |
| `panelNavMode` | 336 | **El cuerpo entero son 4 líneas** (ver abajo) |
| `applyPanelView` | 478 | El único lugar del panel que escribe historial por causa |
| `consumeOwnedPanelEntry` | 551 | El molde de "subir un nivel" de NAV-08 |

**El cuerpo de `panelNavMode`, verbatim** `[VERIFIED: lib/panel-history.ts:345-348]`:

```ts
  if (from === to) return 'replace'
  if (from === root) return 'push'
  if (to === root) return 'push'
  return 'replace'
```

**El cuerpo de `consumeOwnedPanelEntry`, verbatim** `[VERIFIED: lib/panel-history.ts:551-557]`:

```ts
export function consumeOwnedPanelEntry(): boolean {
  const actual: unknown = window.history.state
  if (isForeignOwnedEntry(actual)) return false
  if (panelViewEntryParam(actual) === null) return false
  window.history.back()
  return true
}
```

### Los consumidores, y el orden que ya respetan

Los **tres** tienen el mismo par de líneas, verbatim:

```tsx
replace={panelNavMode({ from: pathname, to: destino.href }) === 'replace'}
onNavigate={(e) => {
  if (requestNavigation(destino.href)) { e.preventDefault(); return }
  if (active && consumeOwnedPanelEntry()) e.preventDefault()
}}
```
`[VERIFIED: components/dashboard/panel-bottom-nav.tsx:106,114-117]` · el equivalente en
`[VERIFIED: app/(dashboard)/mas/mas-client.tsx:206,213-215]` · y en
`[VERIFIED: components/dashboard/sidebar.tsx:95,103-105]`

### Las tres marcas, verbatim (son los literales que nadie puede reusar)

| Módulo | Clave del state | Hash | Línea |
|---|---|---|---|
| `lib/panel-history.ts` | `frjView: string \| null` | — (query, no hash) | `[VERIFIED: lib/panel-history.ts:163,166-168]` |
| `lib/overlay-history.ts` | `frjOverlay: number` | **verbatim:** `export const OVERLAY_HASH_BASE = '#modal'` | `[VERIFIED: lib/overlay-history.ts:77,88]` |
| `lib/dirty-history.ts` | `frjDirty: number` | **verbatim:** `export const DIRTY_HASH_BASE = '#sin-guardar'` | `[VERIFIED: lib/dirty-history.ts:89,92]` |

### El inventario del menú de desktop — la enumeración que cierra el criterio 6

`buildNavGroups` declara **13 entradas** y sus `href` son, verbatim
`[VERIFIED: components/dashboard/nav-groups.ts:71-91]`:

`'/dashboard'` · `'/appointments'` · `'/agenda'` · `'/abonos'` · `'/negocio'` · `'/web'` ·
`'/servicios'` · `'/equipo'` · `'/consultorios'` · `'/clients'` (dos veces: `clients` y `patients`) ·
`'/finances'` · `'/settings'`

Más el único link extra del footer del sidebar: `'/ayuda'`
`[VERIFIED: components/dashboard/sidebar.tsx:146]`.

**Ninguno es `/mas`.** El único lugar del código de producción que menciona `/mas` es la barra
(`[VERIFIED: components/dashboard/panel-bottom-nav.tsx:60]` — verbatim:
`{ href: '/mas', icon: MoreHorizontal, label: 'Más' },`) y el mapa de títulos del header
(`[VERIFIED: components/dashboard/panel-top-bar.tsx:77]` — verbatim: `'/mas': 'Más',`).

### Los cuatro destinos de la barra, verbatim

`[VERIFIED: app/(dashboard)/mas/mas-client.tsx:59]`:
`const EN_LA_BARRA = new Set(['/dashboard', '/appointments', '/agenda', '/clients'])`

⇒ **Las secciones que en mobile sólo se alcanzan por Más son:** `/abonos`, `/negocio`, `/web`,
`/servicios`, `/equipo`, `/consultorios`, `/finances`, `/settings`, `/ayuda`.

### Baseline verde, medido hoy

```
npx vitest run lib/panel-history.test.ts test/panel-history-sidebar.test.ts \
  test/panel-history-clients.test.ts test/overlay-history.test.ts test/dirty-history.test.ts \
  test/panel-nav-chrome.test.ts test/panel-nav-groups.test.ts lib/unsaved-changes.test.ts
→ Test Files 8 passed (8) · Tests 274 passed (274)
./node_modules/.bin/tsc --noEmit → RC=0
```
`[VERIFIED: ejecutado en esta sesión]`

---

## A. Las ocho incógnitas, cerradas

### A-1 · Cómo expresar los dos niveles: la mitad que SÍ sale con rutas

**Hallazgo:** MOB-04 "hacia abajo" y D-02 son **dos ramas de ruta y cero cambios en componentes.**

Hoy, con `/mas` siendo una ruta más, la regla lo mete en su cuarta línea:

| Recorrido | `panelNavMode` hoy | Pila resultante | Atrás cae en |
|---|---|---|---|
| `/dashboard → /mas` | `push` (rama 2) | `[/dashboard, /mas]` | `/dashboard` ✓ ya cumple MOB-04 nivel 2 |
| `/mas → /finances` | **`replace`** (rama 4) | `[/dashboard, /finances]` | `/dashboard` ✗ **es el bug de MOB-04** |
| `/appointments → /mas` | **`replace`** (rama 4) | `[/dashboard, /mas]` | `/dashboard` ✗ **es el bug de D-02** |

Las dos ramas nuevas, en este orden (las tres primeras de hoy se quedan **intactas y primero**):

```ts
if (from === to) return 'replace'    // rama 1 — cicatriz 1. NO se mueve de primera.
if (from === root) return 'push'     // rama 2
if (to === root) return 'push'       // rama 3
if (to === mas) return 'push'        // NUEVA — D-02: Más apila sobre lo que haya
if (from === mas) return 'push'      // NUEVA — MOB-04 nivel 1: la sección queda sobre Más
return 'replace'                     // rama 4 — sección → sección sigue reemplazando
```

**Por qué `to === mas` va antes que `from === mas`:** son mutuamente excluyentes salvo
`from === to === mas`, que ya lo atajó la rama 1. El orden entre ellas da igual **hoy**; escribirlo
explícito evita que mañana alguien agregue una tercera rama en el medio y cambie el significado.
`[ASSUMED — derivado de leer las 4 ramas, no medido en navegador]`

**Por qué `mas` tiene que ser un parámetro con default, igual que `root`:** la firma actual ya expone
`root?: string` y hay un test que lo ejercita explícitamente
(`[VERIFIED: lib/panel-history.test.ts:482-483]` — verbatim:
`expect(panelNavMode({ from: '/a', to: '/b', root: '/a' })).toBe('push')`). Un literal `'/mas'`
escondido en la regla rompería ese molde y haría intesteable la rama.

**El impacto en la suite existente es cero, y está medido:** `/mas` no aparece en ninguna aserción de
`panelNavMode` — el bloque de 13 rutas del invariante usa la lista `RUTAS` que no lo incluye
(`[VERIFIED: lib/panel-history.test.ts:513-517]`). Las dos ramas nuevas no pueden poner rojo nada de
lo que hay.

**Lo que NO sale con rutas — y éste es el caso que decide (riesgo (a) del ROADMAP):**

> `from = '/finances'`, `to = '/mas'` tiene **dos** respuestas correctas y opuestas:
> - si la pila es `[/dashboard, /mas, /finances]` ⇒ **subir** (un `back()`): pila `[/dashboard, /mas]`;
> - si la pila es `[/finances]` (URL pegada, F5, rebote del proxy post-login) ⇒ ese mismo `back()`
>   **saca al dueño del sitio**. Es la **cicatriz 2** que los tres módulos documentan.
>
> El par `(from, to)` es **idéntico** en los dos. Ninguna rama de ruta puede distinguirlos.
> Y el caso de entrada directa **no es hipotético**: está declarado y aceptado en v0.30 con su propio
> test (`[VERIFIED: lib/panel-history.test.ts:525-527]` — verbatim: `expect(atras(['/clients'])).toBeNull()`).

**Recomendación: híbrido, no disyunción.**

- **La decisión** sigue siendo **pura y sobre rutas**, en `lib/panel-history.ts`, y recibe el hecho
  como un booleano: `panelBranchMode({ from, to, mas, root, masDebajo })`. Es exactamente la firma que
  `panelHistoryAction` ya tiene (`holding`, `foreignOwnsTop` como parámetros; el ejecutor los lee de
  `window` — `[VERIFIED: lib/panel-history.ts:479-487]`).
- **El hecho** (`masDebajo`) sale de **una marca nueva** en `history.state`. Ver §A-2.
- **La degradación es segura por diseño:** sin marca, `masDebajo === false` ⇒ la decisión cae en
  `push`/`replace` y **nunca** en un `back()`. El peor caso de una marca perdida es "la pila queda un
  escalón más larga", no una expulsión.

---

### A-2 · La marca: qué guarda, cuándo se escribe y por qué sobrevive

**Qué guarda.** La respuesta mínima a "¿qué hay debajo?" es **la ruta de la entrada inferior**, no un
booleano. Un booleano `vineDeMas` alcanza para D-03 pero **no** para el caso degenerado del criterio 2
(§A-3.2). Propuesta: `{ frjUnder: string }` — "la entrada de abajo es esta ruta". El nombre es del
planner; lo que **no** es negociable es que la clave sea **nueva**: ni `frjView`, ni `frjOverlay`, ni
`frjDirty`. El docblock de `dirty-history` lo dice en mayúsculas y explica el modo de falla: *"Reusar
cualquiera de las dos es el peor error posible acá: el otro módulo reconocería ESTA entrada como propia
y haría su `back()` sobre ella ⇒ doble consumo ⇒ el dueño fuera del sitio"*
`[VERIFIED: lib/dirty-history.ts:43-47]`.

**Cuándo se escribe — y por qué no puede ser en `onNavigate`.** La entrada de la sección la crea **el
router**, con state limpio (P-2, P-4). El `onNavigate` corre **antes** de esa entrada: lo que se
escribiera ahí marcaría la entrada **vieja** (la de `/mas`), que es inútil porque no se puede leer el
state de una entrada que no es la de arriba. ⇒ la marca se escribe **después del commit**, en un
efecto que observa `usePathname()`:

```
prevPathRef = '/mas'  →  pathname = '/finances'
panelNavMode({ from: '/mas', to: '/finances' }) === 'push'
⇒ history.replaceState({ frjUnder: '/mas' })      // SIN url (P-6)
```

Tres propiedades que esto gana, todas verificadas arriba:
1. **No cuesta un render ni desincroniza el router:** sin `url`, el parche no despacha `ACTION_RESTORE`
   (P-6).
2. **No pierde `__NA`:** el parche lo copia desde la entrada actual (P-6/`copyNextJsInternalHistoryState`),
   así que el `popstate` no recarga la página (P-7).
3. **Sobrevive** al atrás (P-3), a nuestras propias escrituras (P-5) y al F5 (P-8).

**Ordenamiento con `HistoryUpdater`:** `HistoryUpdater` escribe en un `useInsertionEffect`
`[VERIFIED: app-router.js:39]`, que corre **antes** de los efectos pasivos ⇒ un `useEffect` nuestro
marca **después** de que el router escribió, y no se lo pisa.
`[ASSUMED — el orden insertion-antes-de-passive es semántica de React que no verifiqué contra su doc en esta sesión; es el primer candidato a medir con una sonda]`

**Dónde vive el efecto, y el candado que lo obliga.** **No** puede vivir en `panel-bottom-nav.tsx`:
el gate estático de la Phase 2 exige **cero** coincidencias de
`pushState|replaceState|history\.back|history\.forward|history\.go` en los tres componentes nuevos
`[VERIFIED: test/panel-nav-chrome.test.ts:260-263]` — verbatim:
`expect(cuenta(archivo.fuente, /pushState|replaceState|history\.back|history\.forward|history\.go/g)).toBe(0)`.
⇒ el efecto va en un **hook en `lib/`**, consumido desde la barra. Y **no** en `lib/panel-history.ts`:
ese módulo evita a propósito importar React para no arrastrarlo a su suite
`[VERIFIED: lib/panel-history.ts:225-231]`. El molde correcto es el de `lib/dirty-history.ts`:
decisiones puras + un hook en el mismo archivo, sin `'use client'`
`[VERIFIED: lib/dirty-history.ts:70-74]`. ⇒ **archivo nuevo**, p. ej. `lib/panel-branch.ts`, con las
decisiones puras importadas de `panel-history.ts`.

**Dónde se monta.** La barra está en el layout del route group
`[VERIFIED: app/(dashboard)/layout.tsx:86]`, y los layouts no se re-montan entre navegaciones del
grupo ⇒ un `useRef` con el pathname anterior **sobrevive** a los cambios de sección. Es el único lugar
del panel donde ese ref existe gratis.

**Alternativa que descarto, con motivo:** un **espejo de la pila en memoria de módulo**. Sirve, pero
(a) no sobrevive al F5 (la marca sí, P-8), (b) deriva en silencio ante un `forward`, un hash, o las
entradas que empujan `overlay-history` y `dirty-history`, y (c) obligaría a `panel-history` a escuchar
`popstate`, que su encabezado prohíbe explícitamente: *"NO escucha `popstate` y NO reescribe historial
ajeno (D-01, 'historia honesta')"* `[VERIFIED: lib/panel-history.ts:27-29]`.

---

### A-3 · El colapso del criterio 2 — y la colisión con D-02 que hay que declarar

#### A-3.1 · El mecanismo: ya existe en producción

El criterio 2 pide que, estando en una sección abierta por Más, tocar un destino **de la barra** deje
la pila sin `/mas` debajo. Con la pila `[/dashboard, /mas, /finances]` y destino `/clients`:

| Intento | Resultado | Veredicto |
|---|---|---|
| `replace` (rama 4 de hoy) | `[/dashboard, /mas, /clients]` | ✗ el atrás cae en **Más** |
| `push` | `[/dashboard, /mas, /finances, /clients]` | ✗ peor |
| **consumir `/finances` y recién entonces `replace`** | `[/dashboard, /clients]` | ✓ el atrás cae en **Inicio** |

**Esa tercera forma es exactamente `leaveNavigationPlan`**, que existe por el mismo problema (el
sentinel de cambios sin guardar arriba de la pila) y cuyas tres variantes **están medidas con
`Page.getNavigationHistory`** `[CITED: lib/unsaved-changes.ts:54-67]`. El contrato, verbatim
`[VERIFIED: lib/unsaved-changes.ts:79-87]`:

```ts
export type LeaveNavMode = 'push' | 'replace'
export type LeaveNavPlan = LeaveNavMode | 'consume-then-push' | 'consume-then-replace'

export function leaveNavigationPlan(input: {
  holdsSentinel: boolean
  sectionMode: LeaveNavMode
}): LeaveNavPlan {
  if (!input.holdsSentinel) return input.sectionMode
  return input.sectionMode === 'replace' ? 'consume-then-replace' : 'consume-then-push'
}
```

Y **la mecánica del encadenamiento también está escrita, con las tres lecciones medidas adentro**
`[VERIFIED: components/dashboard/unsaved-changes-guard.tsx:162-220]`:

1. El plan se decide **re-verificando la marca en el momento del click**, no al abrir el diálogo
   (línea 167: `holdsSentinel: isDirtyOwnedEntry(window.history.state),`).
2. El listener del segundo paso se engancha **en el gesto y con `{ once: true }`**, no en un efecto
   (línea 190: `window.addEventListener('popstate', completarSalida, { once: true })`), porque *"el
   `back()` del consumo es una navegación same-route y puede hacer que la pantalla vuelva a montar
   limpia… Un listener que dependa de un efecto… se pierde el `popstate`"*.
3. **No se navega dentro del `popstate`**: se deja pedido en estado y lo ejecuta un efecto (línea 211:
   `setLeaveNow({ href: target.href, mode: target.mode })`), porque *"Dentro del `popstate` el router
   de Next está procesando SU traverse… un `router.replace` pedido ahí mismo se llama, no escribe NADA
   y el dueño se queda"*.

⇒ **El plan no inventa mecanismo. Reusa este, con otro disparador.** Es la respuesta directa a
"¿`consumeOwnedPanelEntry` sirve tal cual?": **no** (ver A-3.3), pero `leaveNavigationPlan` + este
provider **sí** son el molde, y encima ya están testeados
(`[VERIFIED: lib/unsaved-changes.test.ts:51-68]`).

#### A-3.2 · La colisión D-02 × criterio 2 que el plan tiene que declarar

**Esto es lo que más me preocupa del criterio 2, y no está dicho en ningún artefacto.** D-02 autoriza
pilas de tres escalones. Tomemos `Inicio → Turnos → Más → Finanzas` ⇒ `[/dashboard, /appointments, /mas, /finances]`:

| Destino tocado en la barra | consume-then-replace deja | Atrás cae en | Veredicto |
|---|---|---|---|
| `/clients` | `[/dashboard, /appointments, /clients]` | `/appointments` | **No cae en Más** ✓ pero **no cae en Inicio**: la pila tiene dos niveles, no uno |
| **`/appointments`** | `[/dashboard, /appointments, /appointments]` | `/appointments` | ✗✗ **dos entradas idénticas adyacentes = cicatriz 1 = atrás muerto** |

Las dos filas son consecuencias **de D-02**, que es una decisión cerrada del dueño, así que lo que hay
que ajustar es **la frase del criterio**, no la decisión — y el propio CONTEXT ya lo anticipa
(*"'Dos niveles' es la profundidad de Más y sus secciones, no un techo de la pila: el planner tiene
que precisar esa frase"*).

**Mi recomendación de redacción para el requisito:** el invariante verificable no es *"la pila queda
en un nivel"* sino **"después de tocar un destino de la barra, `/mas` NO queda inmediatamente debajo,
y no hay dos entradas idénticas adyacentes"**. En la pila de dos escalones (el caso normal) ese
invariante produce literalmente el criterio 2 tal como está escrito; en la de tres produce "el atrás
devuelve a la sección de la barra desde la que se abrió Más", que es **el mismo principio con el que
el dueño resolvió D-02** (*"el atrás deshace el último movimiento"*).

**Y la segunda fila obliga a una rama más:** si el destino coincide con la ruta que quedaría debajo, el
plan correcto es **consumir dos veces y no navegar** (el dueño ya está volviendo ahí), o equivalente.
Detectarlo requiere leer `frjUnder` **de la entrada de `/mas`** después del primer consumo — que es
exactamente por qué §A-2 recomienda que la marca guarde **la ruta** y no un booleano, y por qué la
marca se escribe en **toda** navegación del panel que empuje, no sólo en las que salen de Más.
`[ASSUMED — la cadena de dos hops es derivación mía sobre el código; NO está medida y es la candidata #1 a una sonda CDP antes de codearla]`

#### A-3.3 · `consumeOwnedPanelEntry` NO sirve tal cual (respuesta a la incógnita 2)

Su segunda guarda es `if (panelViewEntryParam(actual) === null) return false`
`[VERIFIED: lib/panel-history.ts:554]`, y `panelViewEntryParam` sólo devuelve no-nulo cuando el state
trae `frjView` **como string** `[VERIFIED: lib/panel-history.ts:187-191]`. La entrada de una sección la
empujó el **router**, con state `{__NA, tree}` (P-2) ⇒ **devuelve `false` siempre**. No es un bug: es
que pregunta otra cosa ("¿tengo una **subsección** mía arriba?", NAV-08).

**Recomendación: función hermana, no extensión.** Motivos:
- El gate estático de la Phase 2 **exige el literal** `consumeOwnedPanelEntry` dentro del `onNavigate`
  de los tres menús, y en ese orden `[VERIFIED: test/panel-nav-chrome.test.ts:217-236]`. Cambiarle la
  semántica a esa función cambia NAV-08 en los tres a la vez, sin que ningún gate lo vea.
- Las dos preguntas son distintas y conviven en el mismo `onNavigate`: NAV-08 es `from === to`, D-03
  es `from ∈ rama-de-Más ∧ to === '/mas'`. **Son mutuamente excluyentes** (`from === to === '/mas'`
  lo atrapa la rama 1), así que no compiten.
- La hermana **repite las dos guardas** (`isForeignOwnedEntry` primero, marca propia después). No es
  duplicación evitable: es la cicatriz 2 escrita en cada punto de `back()`, que es la disciplina que
  los tres módulos declaran.

**Y qué pasa si hay un overlay abierto en ese momento** (la última parte de la incógnita 2): la
primera guarda devuelve `false` porque `isForeignOwnedEntry` reconoce `frjOverlay`
`[VERIFIED: lib/panel-history.ts:212-219,256-258]` ⇒ **se abstiene y navega con `panelNavMode`**, que
con la rama nueva da `push`. La pila queda `[/dashboard, /mas, /finances, #modal, /mas]` y el atrás cae
en la entrada del overlay. Es **el límite ya documentado** de `panelNavMode` para este caso
(*"si un overlay empujó su entrada… el `replace` cae sobre la entrada DEL OVERLAY"*,
`[VERIFIED: lib/panel-history.ts:317-324]`), no un defecto nuevo, y la salida es la correcta: abstenerse
es siempre mejor que un `back()` sobre entrada ajena.

---

### A-4 · MOB-05 y el ciclo sentinel: qué se reusa y qué no

#### A-4.1 · Lo reusable y lo específico

| Pieza de `lib/dirty-history.ts` | ¿Reusable para MOB-05? | Por qué |
|---|---|---|
| **El concepto**: empujar una entrada propia y dejar que el atrás la consuma | **Sí, entero.** Es H-5/P-9: el atrás no se cancela, se absorbe | `[VERIFIED: lib/dirty-history.ts:16-22]` |
| **El hash distinto como condición de existencia** de la entrada (cicatriz 1) | **Sí** — y con los dos criterios de elección del texto: no puede ser `#modal*` (lo interpreta `overlay-history`) ni coincidir con el `id` de ningún elemento (el browser scrollearía) | `[VERIFIED: lib/dirty-history.ts:81-89]` |
| `nextDirtyHash` (profundidad `#x`, `#x-2`, `#x-3`) | **No hace falta.** Existe porque el sentinel de dirty se re-empuja estando sobre uno. El de MOB-05 es **uno solo por visita a Inicio** | `[VERIFIED: lib/dirty-history.ts:148-164]` |
| `holdingRef` — un solo dueño por entrada | **Sí, obligatorio.** Es el candado de las dos fallas simétricas (doble empuje ⇒ dos backs; doble consumo ⇒ un `back()` de más) | `[VERIFIED: lib/dirty-history.ts:171-184]` |
| `isDirtyHistoryEntry(state, id)` — re-verificar **antes de cada** `back()` | **Sí, el patrón**; la función no (es de otra marca) | `[VERIFIED: lib/dirty-history.ts:107-127]` |
| `dirtyPopstateAction` con reglas **en orden** y `topIsOurs` primero (anidado LIFO con overlays) | **Sí, el molde.** La regla `topIsOurs` es la que hace que un modal abierto encima gane el atrás sin coordinación entre módulos | `[VERIFIED: lib/dirty-history.ts:219-251]` |
| `participates` — **no armar nada si nadie va a avisar** | **Sí, y es crítico.** El docblock: *"un sentinel que absorbe el atrás y después no muestra ningún diálogo convierte el gesto en un botón MUERTO, que es peor que el bug"* | `[VERIFIED: lib/dirty-history.ts:178-182]` |
| `dirtyLeavePlan` / `leaving` (continuación de dos pasos) | **No.** En MOB-05 el segundo atrás **no** lo completa la app: el sentinel ya no está y el gesto sale solo | `[VERIFIED: lib/dirty-history.ts:253-268]` |
| `dirty` como **diff contra lo guardado y no latch por gesto** (NAV-09) | **No aplica** — MOB-05 no tiene estado de pantalla | `[VERIFIED: lib/dirty-history.ts:287-289]` |

#### A-4.2 · Dónde vive el estado del "primer atrás ya absorbido" y cómo se resetea

**El estado NO es un booleano aparte: es la ausencia del sentinel.** La forma más chica y la que menos
puede desincronizarse:

```
llegada a Inicio (y nadie más dueño de la entrada de arriba)  →  push sentinel   [holding = true]
popstate con topIsOurs === false y holding === true           →  holding = false; mostrar aviso
                                                                  (⚠ NO re-empujar)
pasaron PANEL_EXIT_HINT_MS                                     →  ocultar aviso; re-push sentinel
segundo atrás DENTRO de la ventana                             →  no hay sentinel ⇒ sale de verdad ✓
```

Con eso, la regla de la **constante única** del UI-SPEC §13 se cumple **estructuralmente**: hay un solo
`setTimeout(PANEL_EXIT_HINT_MS)` que hace **las dos** cosas (ocultar el aviso y re-armar el sentinel).
No hay dos números que puedan desincronizarse porque **no hay dos efectos**. La regla, verbatim del
contrato: *"La duración visible del aviso y la ventana lógica en la que el segundo atrás sale son el
MISMO valor, exportado desde UN solo lugar (constante única, p. ej. `PANEL_EXIT_HINT_MS = 2000`)"*
`[VERIFIED: .planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-UI-SPEC.md:838-841]`.

**Dónde exportarla:** en `lib/panel-history.ts` (o en el módulo nuevo), **no** en el componente: el
componente la necesita para la condición de render y el hook para el timer, y si la define el
componente el hook tendría que importarla desde `components/`, invirtiendo la dependencia.

**Y el aviso tiene que poder dibujarse** antes de decidir que participamos (`participates`): si el
componente del aviso no está montado —o está en un árbol oculto— el sentinel absorbe y el gesto queda
muerto. Es la lección de `participates`, aplicada a este caso.

#### A-4.3 · ⚠ La trampa que encontré y que no está en ningún artefacto: el sentinel deja un atrás muerto al salir de Inicio

Con el sentinel vivo, estando en Inicio la pila es `[/dashboard, /dashboard#<hash>]`. Tocar un destino
de la barra: `panelNavMode({ from: '/dashboard', to: '/appointments' })` = `push` (rama 2) ⇒

```
[/dashboard, /dashboard#salir, /appointments]
atrás → /dashboard#salir  (se ve Inicio ✓)
atrás → /dashboard        (se ve Inicio otra vez ⇒ NADA VISIBLE PASÓ)
```

Eso es **la "entrada basura" que v0.30 prohíbe explícitamente** y que el criterio 2 vuelve a prohibir
(*"en ningún recorrido hace falta apretar atrás dos veces para que pase algo visible"*).

**La salida es limpia y encaja con el molde:** cuando la entrada de arriba es **nuestro sentinel de
salida**, la navegación que sale de Inicio tiene que ser `replace` (cae **sobre** el sentinel y lo
borra) en vez de `push`. Pila resultante: `[/dashboard, /appointments]` ✓ — y el atrás cae en Inicio,
que es MOB-04. Es **la misma lección que `leaveNavigationPlan` ya aprendió** con el sentinel de dirty
(*"el modo de sección NO se puede aplicar tal cual: cae sobre la entrada EQUIVOCADA"*,
`[VERIFIED: lib/unsaved-changes.ts:52-54]`), así que la decisión pura nueva tiene que recibir **también**
`holdsExitSentinel: boolean`, re-leído de `window.history.state` en el momento del click.

⚠ **Corolario que el plan no puede olvidar:** con el sentinel, `panelNavMode` deja de alcanzar **por sí
sola** para los links de la barra. Hay que decidir si:
- **(α)** la barra pasa a consumir una decisión nueva que envuelve a `panelNavMode` (recomendado: un
  solo punto, igual que `leaveNavigationPlan` envuelve a `panelNavMode` hoy), o
- **(β)** se consume el sentinel antes de navegar — que es `back()` + navegación, **medido como roto**
  en el mismo tick y por lo tanto obligaría al encadenamiento por `popstate` **en cada navegación que
  sale de Inicio**, que es el camino caro.

#### A-4.4 · ⚠ El gate de viewport de MOB-05 es una decisión ABIERTA, y tiene un modo de falla feo

`PanelBottomNav` se oculta en desktop **por CSS** (`lg:hidden`, `[VERIFIED: components/dashboard/panel-bottom-nav.tsx:90]`),
no por condición de render ⇒ **se monta y sus efectos corren también en desktop**. Si el hook de MOB-05
vive ahí sin gate:

- En desktop, `/dashboard` también empujaría el sentinel ⇒ **el atrás del panel pasaría a costar dos
  toques en desktop**, violando **MOB-07** ("en desktop no cambia nada") y el criterio 6.
- Y si se "arregla" ocultando **sólo el aviso** con `lg:hidden`, queda el peor resultado posible: el
  atrás **absorbido sin aviso visible** = el botón muerto que el propio `dirty-history` declara peor
  que el bug.

⇒ **MOB-05 necesita un gate real sobre el mecanismo**, no sobre el pixel. El repo ya tiene el molde
copiado en cuatro lugares: un `useMediaQuery` con `useSyncExternalStore` + `matchMedia`, SSR-safe
(`[VERIFIED: components/dashboard/nuevo-abono-form.tsx:40-50]` · ídem
`app/(dashboard)/agenda/agenda-client.tsx:158-170`, `app/(dashboard)/abonos/abonos-client.tsx:115-124`,
`components/dashboard/nuevo-turno-form.tsx:39-41`).

**Esto NO contradice el criterio 6**, y conviene decirlo explícito en el plan para que el
plan-checker no lo lea como una violación: el criterio 6 habla de **la política de dos niveles**
(que sí se expresa sobre rutas y marca, y cae en las mismas ramas por construcción). MOB-05 es **otra
cosa**: un affordance de la barra, que en desktop **no existe** —su `bottom` se calcula con
`var(--panel-nav-h)` `[VERIFIED: 02-UI-SPEC.md:830]`, un token que a ≥1024px no reserva nada
(`lg:pb-0`, `[VERIFIED: app/(dashboard)/layout.tsx:131]`)—. **Es decisión del dueño/planner**: gatear
MOB-05 a mobile (recomendado) o aceptarlo en desktop. Ver `## Open Questions` #1.

---

### A-5 · La convivencia de las marcas (riesgo (c)) y qué cambia en `isForeignOwnedEntry`

El predicado de hoy, verbatim `[VERIFIED: lib/panel-history.ts:256-258]`:

```ts
export function isForeignOwnedEntry(state: unknown): boolean {
  return isOverlayOwnedEntry(state) || isDirtyGuardOwnedEntry(state)
}
```

**La respuesta tiene que distinguir las DOS marcas nuevas, porque van a lados opuestos.** Esto es el
error más fácil de cometer en toda la fase:

| Marca nueva | ¿Va a `isForeignOwnedEntry`? | Por qué |
|---|---|---|
| **`frjUnder`** (la de la rama, §A-2) | **NO.** | Es una marca **nuestra**, del mismo módulo, y conviene que conviva con `frjView` en entradas distintas. Si se agregara, la **regla 0** (`if (foreignOwnsTop) return 'none'`, `[VERIFIED: lib/panel-history.ts:90]`) haría que `applyPanelView` **se abstenga de escribir sobre cualquier entrada marcada** ⇒ el detalle de cliente (`?c=`) dejaría de empujar en `/clients`. Sería una regresión de v0.30, silenciosa. |
| **El sentinel de salida de MOB-05** | **SÍ.** | Es una entrada **absorbente**: `applyPanelView` escribiéndole encima le borraría la marca, su dueño no la reconocería, no la consumiría, y quedaría basura + un atrás muerto. Es exactamente el argumento con el que se agregó `isDirtyGuardOwnedEntry` `[VERIFIED: lib/panel-history.ts:231-236]`. |

**Hacia el otro lado — y esto cierra el criterio 5 por construcción:** `overlay-history` y
`dirty-history` **nunca** hacen `back()` sobre una entrada que no lleve **su propia** marca con **su
propio id** (`isOverlayHistoryEntry(state, id)` / `isDirtyHistoryEntry(state, id)`,
`[VERIFIED: lib/overlay-history.ts:117]` · `[VERIFIED: lib/dirty-history.ts:120-127]`). ⇒ **la ignoran,
no le pegan.** El plan **no tiene que tocar esos dos archivos** — y la Phase 2 ya dejó el precedente de
que no tocarlos es parte del contrato.

⚠ **El candado contra la deriva de literales ya existe y hay que sumarle las claves nuevas:** los
literales `frjOverlay` y `frjDirty` están **duplicados a propósito** en `panel-history.ts`, y lo que
impide que deriven es un test que **lee los dos archivos** y exige que el literal siga siendo el mismo
`[VERIFIED: lib/panel-history.ts:205-211,225-231]`. La clave nueva del sentinel necesita el mismo
tratamiento.

---

### A-6 · Criterio 6 — desktop no se entera, por construcción

Tres hechos, los tres verificados, y ningún chequeo de viewport en el medio de la política:

1. **El sidebar nunca produce `from` ni `to` iguales a `/mas`.** Sus destinos posibles son los 13
   `href` de `buildNavGroups` más `/ayuda`, enumerados verbatim arriba
   `[VERIFIED: components/dashboard/nav-groups.ts:71-91 + components/dashboard/sidebar.tsx:146]`.
   ⇒ las dos ramas nuevas **nunca se activan** y el sidebar cae en las cuatro de siempre.
2. **La marca `frjUnder` sólo se escribe cuando el pathname anterior fue `/mas`.** En desktop nada
   navega a `/mas` ⇒ nunca se escribe ⇒ `masDebajo` siempre `false` ⇒ `push`/`replace`, o sea lo de hoy.
3. **El pathname es el mismo valor en los dos** (`usePathname()`, P-1). La decisión es la misma función
   para los dos, lo que cambia es sólo el dato de entrada.

**Dos bordes que conviene declarar en el plan, no descubrir:**

- **`/mas` no está oculta en desktop.** `mas-client.tsx` no tiene ningún `lg:hidden` ni `lg:flex`
  (barrido sobre el archivo: cero coincidencias de los dos patrones, esta sesión), y la página la
  renderiza sin condición `[VERIFIED: app/(dashboard)/mas/page.tsx:32]`. ⇒ un desktop que **pegue**
  `/mas` ve la lista, y desde ahí la política de dos niveles **sí** se aplicaría. No es un bug: es
  coherente (si Más es un lugar, su atrás es el mismo en todas partes), pero hay que escribirlo.
- **La verificación del criterio 6 es un recorrido del sidebar en desktop**, no un test: el test puro
  no puede distinguir "desktop" de "mobile" porque la política **no tiene** esa variable — que es
  justamente lo que el criterio pide.

---

### A-7 · El orden de evaluación (T-5) — y la pieza que hay que extender y nadie mencionó

**La respuesta corta: el orden NO se altera.** El `onNavigate` pasa de dos pasos a tres, y el guard
sigue primero:

```
1º  requestNavigation(destino)            → si bloquea: preventDefault + return    (T-5, intacto)
2º  NAV-08: from === to y hay subsección  → consumeOwnedPanelEntry + preventDefault  (intacto)
3º  NUEVO: subir (D-03) o colapsar (crit. 2) → consume-then-* + preventDefault
```

El paso 3 **nunca** compite con el 2: el 2 requiere `from === to` y el 3 requiere `from ≠ to`.
Y el gate estático que exige `requestNavigation` **antes** de `consumeOwnedPanelEntry` en los tres
componentes `[VERIFIED: test/panel-nav-chrome.test.ts:216-226]` sigue pasando si el paso 3 se agrega
**después**. ⚠ Pero el **otro** caso del mismo gate —
`expect(nav).toMatch(/consumeOwnedPanelEntry\(\)\)\s*e\.preventDefault\(\)/)`
`[VERIFIED: test/panel-nav-chrome.test.ts:233]` — es un regex sobre la forma exacta del `onNavigate`:
si el paso 3 se escribe en el medio o la línea del paso 2 se reformatea, **se pone rojo**. Es un
candado deliberado, no un estorbo: tiene que actualizarse **en el mismo commit y a conciencia**.

> ⚠ **Y la pieza que no está en ningún artefacto de la fase: `leaveNavigationPlan` tiene que aprender
> los modos nuevos.** Cuando la pantalla está sucia, el paso 1 **se queda con el gesto** y la
> navegación la ejecuta `confirmLeave`, que decide con
> `leaveNavigationPlan({ holdsSentinel, sectionMode: panelNavMode({ from: pathname, to: … }) })`
> `[VERIFIED: components/dashboard/unsaved-changes-guard.tsx:162-168]`. Si esa llamada sigue usando
> `panelNavMode` **a secas**, "Salir sin guardar" aterriza con la política **vieja** — que es
> literalmente el defecto que el criterio 4 del ROADMAP prohíbe y que el quick `261006-iey` ya tuvo que
> arreglar una vez.
>
> **Y el caso está vivo, no es teórico:** las dos únicas pantallas con `useUnsavedChanges` son
> `/agenda` (destino de la barra) y **`/web` (sección de la rama de Más)**
> `[VERIFIED: app/(dashboard)/agenda/agenda-client.tsx:418 y app/(dashboard)/web/web-client.tsx:216]`.
> ⇒ *editar la web, tocar Más, "Salir sin guardar"* es un recorrido real que hoy caería mal.
> **Tiene que ser un ítem explícito de la UAT.**

---

### A-8 · Qué se puede testear puro, y qué NO

#### Lo que SÍ, con el molde que ya está escrito

La joya reusable es **el simulador de pila** que ya vive en la suite
`[VERIFIED: lib/panel-history.test.ts:489-497]`, verbatim:

```ts
function navegar(pila: string[], to: string): string[] {
  const from = pila[pila.length - 1]
  return panelNavMode({ from, to }) === 'push' ? [...pila, to] : [...pila.slice(0, -1), to]
}
function atras(pila: string[]): string | null {
  return pila.length > 1 ? pila[pila.length - 2] : null
}
```

Extendido con los modos nuevos (`'up'` ⇒ `pila.slice(0, -1)`; `'collapse'` ⇒ `[...pila.slice(0, -2), to]`),
**toda la política es testeable sin jsdom**:

| Caso | Aserción | Requisito |
|---|---|---|
| `Inicio → Más → Finanzas` | pila `['/dashboard','/mas','/finances']` y `atras` = `'/mas'`, y el siguiente `'/dashboard'` | MOB-04 criterio 1 |
| `Inicio → Turnos → Más → atrás` | `atras` = `'/appointments'` | D-02 |
| `Inicio → Más → Finanzas → Más` | pila `['/dashboard','/mas']` | D-03 |
| `Inicio → Más → Finanzas → Clientes` | pila `['/dashboard','/clients']`, `atras` = Inicio | criterio 2 |
| **Entrada directa**: pila `['/finances']` + tocar Más | **nunca** `'up'` (sin marca ⇒ `masDebajo: false`) | cicatriz 2 |
| **Invariante barrido**: las **9** secciones de la rama de Más × los **4** destinos de la barra | `'/mas'` nunca queda inmediatamente debajo del destino, y nunca hay dos entradas idénticas adyacentes | criterio 2 reformulado (§A-3.2) |
| La colisión de §A-3.2 (destino = ruta de abajo) | el plan resuelto **no** deja `[…, X, X]` | cicatriz 1 |
| Desktop por construcción | para los 13 `href` del sidebar, `panelNavMode` devuelve **lo mismo que hoy** | criterio 6 |
| Las decisiones de MOB-05 (`pushSentinel` / `absorb` / `exit` / `rearm`) como función pura con reglas **en orden**, molde `dirtyPopstateAction` | el segundo atrás dentro de la ventana **sale**; el ciclo repetido 3 veces sigue funcionando | MOB-05 criterio 3 |
| `isForeignOwnedEntry` reconoce el sentinel de salida y **NO** reconoce `frjUnder` | las dos aserciones, explícitas y contrapuestas | criterio 5 / §A-5 |
| Los literales de las marcas nuevas, leídos del archivo | candado anti-deriva, molde `panel-history.ts:205-211` | criterio 5 |
| **Cableado**: el `onNavigate` de los tres componentes, por región recortada | molde `panel-nav-chrome.test.ts` | criterio 5 |

⚠ **La lección de v0.30 que aplica literal:** *"La politica y el CABLEADO necesitan candados separados:
`lib/panel-history.test.ts` queda verde con el replace borrado del sidebar (medido)"*
`[CITED: .planning/workstreams/panel-nav/STATE.md:82]`. ⇒ los casos de política **no sustituyen** a los
de cableado.

#### Lo que NO se puede testear así — y el ROADMAP ya lo dijo

**Nada de lo que de verdad puede romper esta fase lo ve un test puro.** El simulador modela
`panelNavMode` aplicado a un array; **no** modela el navegador. Fuera de alcance de vitest, por
construcción:

- Que el `replaceState` de la marca corra **después** del `pushState` del router (el orden de efectos,
  §A-2 — hoy `[ASSUMED]`).
- Que la marca **sobreviva** de verdad al atrás y al F5 en Chrome Android y en Safari iOS. Lo leído es
  el fuente de Next (P-3/P-5/P-8); **lo medido en el repo fue Chrome 153 desktop headless**, y el
  propio diagnóstico declara el hueco: *"NO VERIFICADO en Safari/iOS ni en Chrome Android reales"*
  `[CITED: .planning/debug/interceptar-atras-aviso-sin-guardar.md]`.
- Que el encadenamiento `consume-then-*` del criterio 2 aterrice donde dice. Las tres variantes del
  caso de dirty **se midieron con `Page.getNavigationHistory`**; el caso nuevo **no**.
- Que el atrás del celular real emita `popstate` con el teclado arriba — ya declarado no medible
  `[VERIFIED: lib/overlay-history.ts:283-287]`.
- Que el aviso de MOB-05 se vea donde tiene que verse y que el segundo atrás salga dentro de los
  2000ms.

⇒ **El plan tiene que tratar la UAT en celular real como el entregable principal**, no como el último
checkbox. El workstream tiene `auto_advance: false` `[VERIFIED: .planning/workstreams/panel-nav/config.json]`,
así que el checkpoint humano **no** se auto-aprueba — y la memoria `auto-advance-saltea-uat-visual`
existe porque esa trampa ya se pagó. Para el criterio 2, **medir la pila real por CDP**
(`Page.getNavigationHistory`) antes de aceptar el fix: es el método con el que v0.30 diagnosticó NAV-08
y el que la memoria `medir-antes-de-aceptar-un-fix-propuesto` reclama.

---

## Standard Stack

### Core — **cero dependencias nuevas**

| Pieza | Versión | Para qué | Por qué es la estándar acá |
|---|---|---|---|
| `window.history` (`pushState`/`replaceState`/`back`) | plataforma | Toda la política | Las dos primitivas que `lib/panel-history.ts` ya envuelve; están soportadas e integradas al router (H-6) |
| `next` | **16.2.7** | `usePathname`, `<Link replace onNavigate>`, `useRouter` | `[VERIFIED: package.json]` — ya instalado |
| `react` | **19.2.4** | `useRef`, `useEffect`, `useSyncExternalStore` | ya instalado |
| `vitest` | **4.1.9** (`environment: 'node'`) | Los tests puros | `[VERIFIED: salida de npx vitest run, esta sesión]` |

### Supporting — moldes internos, no librerías

| Molde | Dónde | Cuándo usarlo |
|---|---|---|
| Decisión pura + ejecutor que lee `window` | `lib/panel-history.ts:77,478` | Toda regla nueva |
| `consume-then-*` encadenado por `popstate` | `lib/unsaved-changes.ts:83` + `unsaved-changes-guard.tsx:162-220` | El colapso del criterio 2 |
| Ciclo sentinel (absorber el atrás) | `lib/dirty-history.ts` entero | MOB-05 |
| `useMediaQuery` con `useSyncExternalStore` | `components/dashboard/nuevo-abono-form.tsx:40-50` | El gate de MOB-05 (si se decide mobile-only) |
| Candado anti-deriva de literales leyendo el archivo | `lib/panel-history.ts:205-211` | Las claves de las marcas nuevas |
| Simulador de pila en el test | `lib/panel-history.test.ts:489-497` | Los casos de política |

### Alternatives Considered

| En vez de | Se podría | Trade-off |
|---|---|---|
| Marca en `history.state` | Espejo de la pila en memoria de módulo | Más simple de escribir, pero no sobrevive al F5 (la marca sí, P-8), deriva en silencio con `forward` y con las entradas de los otros dos módulos, y obliga a `panel-history` a escuchar `popstate` (prohibido en su encabezado) |
| `consume-then-replace` | `history.go(-2)` + `push` | Un solo `popstate` igual, pero asume que Inicio está exactamente dos abajo: si el dueño entró directo, **sale del sitio** (cicatriz 2 × 2). `back()` de a uno, con la marca verificada, es acotable |
| Sentinel sólo en Inicio (MOB-05) | Sentinel en **cada** sección de la rama de Más, para que todo sea `replace` y nadie encadene nada | Elimina el encadenamiento, pero mete un hash visible (`/finances#…`) en 9 pantallas, choca con el cálculo de profundidad de `overlay-history` y con el sentinel de `dirty-history`, y convierte el atrás en una navegación blanda escrita por nosotros — "historia honesta" al revés. **Descartado** |
| Decisión nueva aparte | Meter todo adentro de `panelNavMode` | `panelNavMode` devuelve `PanelNavMode = 'push' \| 'replace'` y lo consumen **tres** `<Link replace={…}>` más `leaveNavigationPlan`: ampliar su unión rompe los cuatro call sites a la vez. **Mejor una función nueva que la envuelva**, como ya hace `leaveNavigationPlan` |

**Installation:** ninguna. El milestone prohíbe paquetes nuevos y esta fase no necesita ninguno.

---

## Package Legitimacy Audit

**No aplica: esta fase instala CERO paquetes.** La restricción transversal del ROADMAP es explícita
(*"Sin paquetes nuevos y sin jsdom"*) y todas las piezas recomendadas son de la plataforma, de Next/React
ya instalados, o moldes internos del repo. No hay ningún nombre de paquete que verificar contra un
registry, y por lo tanto **ningún `checkpoint:human-verify` de instalación** que el planner tenga que
insertar.

---

## Architecture Patterns

### Diagrama — el embudo de escritura de la pila

```
GESTO DEL DUEÑO
│
├─ toca un destino (barra / Más / sidebar)
│   │
│   └─► onNavigate  ── EL ORDEN ES CONTRATO ─────────────────────────────────┐
│         1. requestNavigation(destino)                                      │
│            └─ sucio ──► provider del guard ──► diálogo                     │
│                            └─ "Salir sin guardar" ──► leaveNavigationPlan ─┤ (⚠ A-7:
│                                                        (+ modos nuevos)    │  tiene que
│         2. from === to  ──► consumeOwnedPanelEntry()  (NAV-08)             │  aprender la
│         3. decisión NUEVA ({from, to, masDebajo, holdsExitSentinel})       │  política nueva)
│              ├─ 'push' / 'replace' ──► <Link replace={…}> (el router)      │
│              ├─ 'up'       ──► back() guardado        (D-03)               │
│              └─ 'collapse' ──► back() ─popstate─► router.replace (crit. 2) │
│                                                                            │
└─ aprieta ATRÁS (no cancelable: SE ABSORBE)                                 │
     │                                                                       │
     ├─ overlay dueño de la entrada de arriba ──► cierra el overlay          │
     ├─ sentinel de cambios sin guardar       ──► pide confirmación          │
     ├─ sentinel de SALIDA (MOB-05, nuevo)    ──► aviso efímero, no sale     │
     └─ ninguno                               ──► el router hace su traverse │
                                                                             │
ESTADO DE LA PILA (una sola fuente)  ◄───────────────────────────────────────┘
  entrada: { __NA, tree }                    ← el router (P-2)
         + { frjView }      panel-history    ← subsecciones
         + { frjOverlay }   overlay-history  ← 39 overlays, #modal
         + { frjDirty }     dirty-history    ← #sin-guardar
         + { frjUnder }     NUEVA            ← "qué ruta quedó debajo"  (NO va a isForeignOwnedEntry)
         + { frjExit? }     NUEVA            ← sentinel de salida       (SÍ va a isForeignOwnedEntry)
```

### Estructura de archivos propuesta

```
lib/
├── panel-history.ts        # EDIT  · panelNavMode (+2 ramas) · decisión nueva pura ·
│                           #        la marca frjUnder + su lectura · PANEL_EXIT_HINT_MS ·
│                           #        isForeignOwnedEntry reconoce el sentinel de salida
├── panel-history.test.ts   # EDIT  · los casos de política + el simulador extendido
├── panel-branch.ts         # NUEVO · el hook que marca la entrada post-commit y el ciclo
│                           #        sentinel de MOB-05 (React vive acá, no en panel-history)
├── unsaved-changes.ts      # EDIT  · leaveNavigationPlan aprende los modos nuevos  ⚠ A-7
├── overlay-history.ts      # SIN TOCAR
└── dirty-history.ts        # SIN TOCAR

components/dashboard/
├── panel-bottom-nav.tsx    # EDIT  · consume el hook y la decisión nueva; dibuja el aviso §13.
│                           #        ⚠ CERO pushState/replaceState/history.* (gate de la Phase 2)
├── sidebar.tsx             # SIN TOCAR si la decisión nueva cae en las ramas de hoy (criterio 6)
└── unsaved-changes-guard.tsx # EDIT · pasa los modos nuevos a leaveNavigationPlan

app/(dashboard)/mas/mas-client.tsx  # SIN TOCAR — ya consume panelNavMode con from = pathname
```

### Pattern 1 — La decisión pura recibe los hechos, nunca los lee

**Qué:** la función de política no toca `window`; recibe booleanos. El ejecutor los lee y re-verifica.
**Cuándo:** siempre, en los tres módulos.
**Ejemplo (el molde que ya existe):**

```ts
// Source: lib/panel-history.ts:479-487 (verbatim)
const actual: unknown = window.history.state
const action = panelHistoryAction({
  cause,
  from,
  to,
  holding: isPanelViewEntry(actual, param),
  foreignOwnsTop: isForeignOwnedEntry(actual),
})
```

### Pattern 2 — Re-verificar la marca **en cada** punto de `back()`

**Qué:** nunca "ya la chequeé arriba".
**Por qué:** H-4/P-4. Y en este repo no es hipotético: Agenda tiene un `replaceState(null, '', '/agenda')`
crudo para limpiar el `?google=` que **borra cualquier marca** de la entrada actual
`[CITED: .planning/debug/interceptar-atras-aviso-sin-guardar.md — "COLISION CONCRETA #1"]`.
**Ejemplo:**

```ts
// Source: lib/dirty-history.ts:413-421 (verbatim, el desmontaje)
return () => {
  if (dirtyUnmountAction({ holding: holdingRef.current }) === 'none') return
  holdingRef.current = false
  // La guarda de la cicatriz 2, otra vez y no "ya la chequeé arriba"
  if (isDirtyHistoryEntry(window.history.state, id)) window.history.back()
}
```

### Pattern 3 — Marcar la entrada sin tocar la URL

**Qué:** `replaceState` **sin** tercer argumento ⇒ no despacha `ACTION_RESTORE`, no cambia la URL, y el
parche de Next igual copia `__NA` + el árbol (P-6).
**Cuándo:** para escribir `frjUnder` después del commit del router.
**Esqueleto** `[ASSUMED — es mi propuesta, derivada de P-2/P-4/P-6; NO existe en el repo y hay que medirla]`:

```ts
// En el hook de lib/panel-branch.ts, consumido por la barra.
// ⚠ OBJETO LITERAL FRESCO, nunca propagando window.history.state: propagarlo arrastra __NA y el
// parche toma su rama temprana (app-router.js:254-256) sin sincronizar el router.
// ⚠ SIN tercer argumento: con url, el parche despacha ACTION_RESTORE (app-router.js:275-277).
useEffect(() => {
  const anterior = prevPathRef.current
  prevPathRef.current = pathname
  if (anterior === null || anterior === pathname) return
  if (panelNavMode({ from: anterior, to: pathname }) !== 'push') return   // replace ⇒ no hay nada debajo nuevo
  if (isForeignOwnedEntry(window.history.state)) return                   // regla 0: no escribir sobre entrada ajena
  window.history.replaceState(panelUnderState(anterior))
}, [pathname])
```

### Pattern 4 — `consume-then-*`: dos pasos, encadenados por el `popstate`, navegando desde un commit

**Qué:** `back()` es **asíncrono**; el segundo paso sale del `popstate` del primero, y **no se navega
dentro del evento**.
**Ejemplo (producción):**

```ts
// Source: components/dashboard/unsaved-changes-guard.tsx:190 y :211 (verbatim)
window.addEventListener('popstate', completarSalida, { once: true })
// …
setLeaveNow({ href: target.href, mode: target.mode })   // y un useEffect ejecuta router.replace/push
```

### Anti-patrones a evitar

- **`replace` para "subir a Más"** ⇒ `/mas` sobre `/mas` = atrás muerto. Prohibido por D-03.
- **`back()` + navegación en el mismo tick** ⇒ medido roto dos veces en este repo
  `[VERIFIED: lib/panel-history.ts:544-547]` y `[VERIFIED: lib/unsaved-changes.ts:69-74]`.
- **Reusar `frjView`/`frjOverlay`/`frjDirty`** ⇒ doble consumo ⇒ el dueño fuera del sitio.
- **Propagar `window.history.state` al escribir** ⇒ arrastra `__NA`, el parche toma su rama temprana y
  **la URL cambia sin que el router se entere, sin un error en consola**
  `[VERIFIED: lib/panel-history.ts:150-158]`.
- **`pushState`/`replaceState`/`history.back` dentro de `panel-bottom-nav.tsx`, `mas-client.tsx` o
  `panel-top-bar.tsx`** ⇒ pone rojo el gate de la Phase 2 `[VERIFIED: test/panel-nav-chrome.test.ts:260-263]`.
- **Ocultar sólo el aviso en desktop** y dejar la absorción viva ⇒ atrás muerto (§A-4.4).
- **Dos constantes para la ventana de MOB-05** ⇒ el bug invisible que §13 prohíbe.
- **Chequeo de viewport dentro de la política de dos niveles** ⇒ viola el criterio 6.

---

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|---|---|---|---|
| Absorber el atrás | Un interceptor de `popstate` propio desde cero | El ciclo sentinel de `lib/dirty-history.ts` (S1–S4 medidos) | El atrás no se cancela (P-9) y las cuatro reglas en orden ya están escritas y probadas |
| Consumir una entrada y navegar | `back()` + `router.push` | `leaveNavigationPlan` + el molde del provider | `back()` es asíncrono; las tres variantes están medidas con CDP |
| Saber si una entrada es nuestra | Comparar URLs o contar `history.length` | La marca en `history.state` + su predicado | `history.length` no distingue dueños y las URLs se repiten |
| Detectar mobile | `window.innerWidth` en un efecto con `setState` | El `useMediaQuery` con `useSyncExternalStore` del repo | SSR-safe y sin setState-in-effect; está copiado en 4 lugares |
| Avisar algo abajo de la pantalla | Un segundo `<Toaster>` de `sonner` | El elemento propio de la barra (§13) | Ya se descartó midiendo: `position` no es responsiva y el `<Toaster>` es global |
| Reservar el alto de la barra | Padding nuevo en alguna pantalla | El `<main>` del layout, que ya lo hace en un solo lugar | `[VERIFIED: app/(dashboard)/layout.tsx:131]` |

**Key insight:** en este dominio una solución propia **no falla con una excepción**: deja un atrás
muerto o expulsa al dueño del sitio, y eso no lo ve `tsc`, ni la suite, ni el build. Los tres módulos
existentes son el resultado acumulado de ~9 bugs encontrados en celular real; cada atajo que los evite
vuelve a pagar uno de ellos.

---

## Common Pitfalls

### C-1 · El gate estático de la Phase 2 prohíbe escribir historial en la barra
**Qué sale mal:** el plan pone el `replaceState` de la marca o el `pushState` del sentinel dentro de
`panel-bottom-nav.tsx` y el candado se pone rojo.
**Por qué pasa:** es un gate deliberado, con `expect(…).toBe(0)` sobre cinco patrones
`[VERIFIED: test/panel-nav-chrome.test.ts:260-263]`.
**Cómo evitarlo:** todo el toqueteo de historial en un hook de `lib/`.
**Señal temprana:** `npx vitest run test/panel-nav-chrome.test.ts` rojo en el bloque 4.

### C-2 · El regex del gate del `onNavigate` se rompe con un reformateo
**Qué sale mal:** se agrega el paso 3 y el `toMatch(/consumeOwnedPanelEntry\(\)\)\s*e\.preventDefault\(\)/)`
se pone rojo aunque el código esté bien.
**Cómo evitarlo:** actualizar el candado en el mismo commit, **a conciencia**, declarando la forma nueva.
**Señal temprana:** bloque 3 de `panel-nav-chrome.test.ts`.

### C-3 · Quién borra `frjUnder` — la lista completa, enumerada
**Qué sale mal:** D-03 degrada a `push` sin que nada avise y la UAT lo lee como "no funciona".
**Por qué pasa (P-4):** sólo un **`replace` blando sobre la entrada donde vive** la borra. En el panel
eso es:
1. el `<Link replace>` de los tres menús cuando `panelNavMode` da `replace` (sección → sección);
2. `applyPanelView` con las causas `'programmatic'`, `'filter'` y `'stale'` sin `holding`
   `[VERIFIED: lib/panel-history.ts:120-137]` — ⚠ y la Phase 4 va a cablear los tabs justamente con
   `replace`;
3. el `window.history.replaceState(null, '', '/agenda')` crudo del `?google=` de Agenda
   `[CITED: debug/interceptar-atras-aviso-sin-guardar.md — "COLISION CONCRETA #1"]`.
**Cómo evitarlo:** (a) la degradación es **segura** (`masDebajo: false` ⇒ `push`, nunca `back()`), y
(b) si se la quiere evitar, `applyPanelView` puede **preservar explícitamente** la clave propia al
armar su state (es nuestra, no es `__NA`, así que no reintroduce la trampa de la rama temprana).
**Decidirlo en el plan, no descubrirlo.**

### C-4 · "Salir sin guardar" con la política vieja
Ver §A-7. **Caso vivo:** `/web`. **Señal temprana:** ninguna automática ⇒ ítem de UAT.

### C-5 · El sentinel de MOB-05 deja un atrás muerto al salir de Inicio
Ver §A-4.3. **Señal temprana:** ninguna automática ⇒ caso de test puro + CDP.

### C-6 · El sentinel de MOB-05 corre en desktop
Ver §A-4.4. **Señal temprana:** probar el atrás en el dashboard de desktop; si cuesta dos toques, está.

### C-7 · El teclado se come el atrás y gasta el presupuesto del aviso
**Qué sale mal:** el dueño aprieta atrás para bajar el teclado, el sentinel de salida lo absorbe y
aparece "Tocá atrás otra vez para salir" sin que haya querido salir.
**Por qué pasa:** es el bug que el quick `261005-x91` ya arregló para los overlays.
**Cómo evitarlo:** reusar `softKeyboardGuardsBack` / `isSoftKeyboardInset`, que son **puros y
exportados** `[VERIFIED: lib/overlay-history.ts:310,324,350]`, y **re-empujar** el sentinel en vez de
consumirlo (la acción `'absorb'` de `popstateAction`, `[VERIFIED: lib/overlay-history.ts:264-273]`).
**Atenuante medido:** Inicio no tiene campos de texto (barrido de `<input|<Input|<textarea|<Textarea`
sobre `app/(dashboard)/dashboard/`: cero coincidencias, esta sesión) ⇒ **es improbable, no imposible**
(el teclado puede venir de otra pantalla y la gracia es de 300ms). ⚠ Decidir explícitamente si se
gatea o no, y escribirlo.

### C-8 · Las trampas de entorno ya medidas (no redescubrir)
1. **`npx tsc` da FALSO VERDE** (resuelve a `tsc@2.0.4`) ⇒ `./node_modules/.bin/tsc --noEmit`.
   *(Hoy: `RC=0`.)*
2. **`eslint` tarda minutos** ⇒ background o timeout ≥ 300s.
3. **Flake del runner en Windows:** `Worker forks emitted error` con rc 1 y **0 casos fallados** ⇒
   re-correr igual.
4. **Canarios de reloj:** dos tests fallan a propósito fuera de `[01:00, 23:30]` AR. Medirlo con
   `node -e 'console.log(new Date().toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires"}))'`
   (en Git Bash `TZ=` no se honra).
5. **Un gate que termina en `| tail -N` NUNCA falla** ⇒ capturar `RC=$?` antes del pipe.
6. **Un regex `<Tag[^>]*?>` se corta en el `>` de una arrow function** ⇒ matchear hasta `/>` o
   balancear llaves.
7. **Medir antes de aceptar.** Cinco casos registrados de un fix confiado que se cayó al medirlo.
8. ⚠ **No levantar Supabase ni el dev server** (restricción de esta sesión): las suites que tocan la
   base van a fallar y **eso es esperado**.

---

## Code Examples

### El cuerpo propuesto de la regla de rutas

```ts
// Source: extensión de lib/panel-history.ts:336-349 (las 4 líneas de hoy, verbatim, + 2)
/** La ruta de la pantalla Más. Parámetro con default, igual que `root`: la rama tiene que ser testeable. */
export const PANEL_MORE = '/mas'

export function panelNavMode({
  from,
  to,
  root = PANEL_ROOT,
  more = PANEL_MORE,
}: { from: string; to: string; root?: string; more?: string }): PanelNavMode {
  if (from === to) return 'replace'   // rama 1 — cicatriz 1. NO se mueve de primera.
  if (from === root) return 'push'    // rama 2 — el dashboard queda debajo
  if (to === root) return 'push'      // rama 3 — reemplazar dejaría /dashboard sobre /dashboard
  if (to === more) return 'push'      // NUEVA (D-02) — Más apila sobre lo que haya abierto
  if (from === more) return 'push'    // NUEVA (MOB-04) — la sección queda ENCIMA de Más
  return 'replace'                    // rama 4 — sección → sección sigue reemplazando
}
```
`[ASSUMED — es mi propuesta. Las 4 primeras líneas son verbatim del repo; las 2 nuevas no están medidas en navegador.]`

### La decisión nueva, con los hechos como parámetros

```ts
// Source: molde de panelHistoryAction (lib/panel-history.ts:77-141) y de
// leaveNavigationPlan (lib/unsaved-changes.ts:83-87). Esqueleto, no código final.
export type PanelBranchPlan = PanelNavMode | 'up' | 'collapse-then-replace'

/**
 * Reglas EN ORDEN. `masDebajo` y `holdsExitSentinel` los lee el EJECUTOR de window.history.state,
 * re-verificados en el momento del click (H-4 / P-4): esta función no toca window.
 */
export function panelBranchPlan({
  from, to, root = PANEL_ROOT, more = PANEL_MORE, masDebajo, holdsExitSentinel,
}: {
  from: string; to: string; root?: string; more?: string
  masDebajo: boolean; holdsExitSentinel: boolean
}): PanelBranchPlan {
  const modo = panelNavMode({ from, to, root, more })

  // 0. Sin marca NO se retrocede nunca: es la cicatriz 2 (entrada directa, F5, post-login).
  if (!masDebajo) {
    // Y el sentinel de salida de Inicio hay que PISARLO, no dejarlo debajo (§A-4.3).
    return holdsExitSentinel && modo === 'push' ? 'replace' : modo
  }
  // 1. D-03 — tocar Más estando dentro de su rama SUBE. Nunca `replace` (dejaría /mas sobre /mas).
  if (to === more) return 'up'
  // 2. Criterio 2 — un destino de la barra no puede quedar con /mas inmediatamente debajo.
  //    ⚠ FALTA la rama de §A-3.2: si el destino coincide con la ruta que quedaría debajo,
  //    `collapse-then-replace` produce dos entradas idénticas. El plan tiene que resolverla.
  return 'collapse-then-replace'
}
```
`[ASSUMED — esqueleto mío; la rama de §A-3.2 está deliberadamente sin resolver para que el plan la decida con una medición.]`

### MOB-05 — las decisiones puras, con el molde de `dirtyPopstateAction`

```ts
// Source: molde verbatim de lib/dirty-history.ts:236-251 (reglas EN ORDEN, topIsOurs primero)
/** La ÚNICA constante: duración visible del aviso == ventana lógica del segundo atrás (UI-SPEC §13). */
export const PANEL_EXIT_HINT_MS = 2000

export type ExitPopstateAction = 'hint' | 'absorb-keyboard' | 'ignore'

export function exitPopstateAction({
  topIsOurs, participates, holding, keyboardGuard,
}: { topIsOurs: boolean; participates: boolean; holding: boolean; keyboardGuard: boolean }): ExitPopstateAction {
  if (topIsOurs) return 'ignore'            // 0. un overlay de arriba se comió el back (LIFO)
  if (!participates) return 'ignore'        // 1. nadie va a dibujar el aviso ⇒ no absorber (botón muerto)
  if (!holding) return 'ignore'             // 2. una escritura ajena nos pisó el sentinel
  if (keyboardGuard) return 'absorb-keyboard' // 3. el back era del teclado (C-7) ⇒ re-empujar, no gastar el aviso
  return 'hint'
}
```
`[ASSUMED — esqueleto mío sobre un molde verbatim del repo.]`

---

## Runtime State Inventory

Esta fase no renombra nada, pero **sí redefine una regla cuyo estado vive fuera de los archivos**, así
que la pregunta canónica aplica: *después de que todos los archivos estén actualizados, ¿qué estado
runtime sigue teniendo la forma vieja?*

| Categoría | Qué encontré | Acción requerida |
|---|---|---|
| **Estado del navegador (la pila y `history.state`)** | Es **el** estado runtime de esta fase. Las sesiones abiertas de un dueño conservan entradas **sin** la marca nueva hasta que navegue otra vez. | **Ninguna migración**: la ausencia de marca degrada a `push`/`replace` (seguro por diseño, §A-1). ⚠ Pero la **UAT tiene que arrancar con una pestaña nueva**: con la pila vieja los recorridos no reproducen lo que el plan dice. |
| **Datos almacenados** | **Nada.** Cero tablas, cero columnas, cero policies. La próxima migración libre sigue siendo la **080** `[CITED: REQUIREMENTS.md:123-126]`. | ninguna |
| **Config de servicios vivos** | **Nada.** Esta fase no toca Supabase, MercadoPago, Google Calendar, Resend ni el cron de Vercel. | ninguna |
| **Estado registrado en el SO** | **Nada.** Sin tareas, sin pm2, sin crons nuevos. | ninguna |
| **Secretos / env vars** | **Nada.** Ninguna clave nueva, ninguna renombrada. Verificado: lo único que la fase exporta es una constante de código (`PANEL_EXIT_HINT_MS`), no un valor de entorno. | ninguna |
| **Artefactos de build** | `.next/types/routes.d.ts` ya lista `"/mas"` `[VERIFIED: .next/types/routes.d.ts:4,82]` ⇒ el tipado de rutas no cambia. **Pero el service worker no existe** y el bundle del cliente sí: un dueño con la pestaña vieja abierta corre el código viejo hasta recargar. | ⚠ **Ítem de UAT:** recargar antes de probar. |

---

## Security Domain

`security_enforcement: true`, ASVS nivel 1 `[VERIFIED: .planning/config.json]`.

### Categorías ASVS aplicables

| Categoría | ¿Aplica? | Control estándar |
|---|---|---|
| V2 Authentication | **no** — la fase no toca auth; la sesión la resuelve el layout por `owner_id` | — |
| V3 Session Management | **parcialmente, y es el único riesgo real:** un `back()` sobre una entrada ajena **expulsa al dueño del sitio** y, en una pantalla con cambios sin guardar, es **pérdida de trabajo silenciosa** | La marca propia re-verificada **antes de cada** `back()` + la **regla 0** (`isForeignOwnedEntry`) |
| V4 Access Control | **no** — el gating por rubro lo preserva `buildNavGroups` y la fase no toca el inventario | — |
| V5 Input Validation | **no hay input nuevo.** ⚠ Matiz: `frjUnder` guarda una **ruta** que sale de `usePathname()` (valor del router, no del usuario) y se usa **sólo** para comparar, nunca para navegar hacia ella ni para elegir qué se lee | Comparación contra la lista cerrada de rutas del panel; **nunca** `router.push(marca)` |
| V6 Cryptography | **no** | — |

### Patrones de amenaza para este stack

| Patrón | STRIDE | Mitigación estándar |
|---|---|---|
| `back()` sobre entrada ajena ⇒ expulsión del sitio (cicatriz 2, sufrida 3 veces) | DoS / pérdida de datos | Dos guardas independientes antes de cada `back()`: marca propia presente **y** `isForeignOwnedEntry` falso |
| Dos dueños por entrada ⇒ se descuadra el conteo de backs | Tampering | `holdingRef`: un solo dueño por entrada |
| Marca de historial manipulada a mano (DevTools) ⇒ un `back()` indebido | Tampering | **El peor caso es que el propio dueño se saque de su pestaña.** No hay escalada: la marca no decide qué se lee ni qué se muestra, y el tenant lo resuelve el server por `owner_id` |
| Un hash propio que coincida con el `id` de un elemento ⇒ scroll inesperado | — (UX) | El criterio que `dirty-history` ya documenta: barrer el panel por ese `id` antes de elegir el texto `[VERIFIED: lib/dirty-history.ts:84-87]` |

**Veredicto:** riesgo **bajo** en términos de datos (cero queries, cero policies, cero tenant cruzado),
**medio** en términos de pérdida de trabajo del dueño — exactamente lo que el ROADMAP ya anticipó. Lo
que un `/gsd-secure-phase` tiene que mirar acá son los **puntos de `back()`** y sus guardas, uno por uno.

---

## Assumptions Log

| # | Claim | Sección | Riesgo si está mal |
|---|---|---|---|
| **A1** | El `useEffect` que marca la entrada corre **después** del `useInsertionEffect` de `HistoryUpdater`, así que el router no pisa la marca | A-2 | La marca nunca se escribe ⇒ D-03 y el criterio 2 degradan a `push` **en silencio**. **Es la candidata #1 a medir con una sonda** antes de codear |
| **A2** | Un `replaceState` **sin** URL no provoca ningún commit del router y por lo tanto nada que pueda borrar la marca | A-2 / Pattern 3 | Idem A1. El **camino de código** está verificado (P-6: el `if (url)`); lo no verificado es que no haya otro commit en vuelo |
| **A3** | `history.state` sobrevive a un F5 (y P-8 lo preserva en la hidratación) | A-2 | La marca se pierde al recargar ⇒ degradación segura, no rotura |
| **A4** | Las dos ramas nuevas de `panelNavMode` producen las pilas de la tabla de A-1 en un navegador real | A-1 | **Es MOB-04 entero.** Se mide con `Page.getNavigationHistory` por CDP, el método que v0.30 ya usó |
| **A5** | `consume-then-replace` deja `[/dashboard, /clients]` en el caso normal del criterio 2 | A-3.1 | El criterio 2 no se cumple. El **mecanismo** está medido para el caso de dirty; **este disparador no** |
| **A6** | La cadena de dos hops de marca resuelve la colisión de §A-3.2 (destino = ruta de abajo) | A-3.2 | Dos entradas idénticas ⇒ atrás muerto ⇒ exactamente lo que el criterio 2 prohíbe. **Medir antes de codear** |
| **A7** | El `replace` sobre el sentinel de salida (A-4.3) deja la pila en un nivel sin dejar basura | A-4.3 | MOB-05 introduce un atrás muerto en cada salida de Inicio |
| **A8** | Marcar la entrada con una clave propia y conservarla en `applyPanelView` no reintroduce la trampa de la rama temprana del parche (porque la clave no es `__NA`/`_N`) | C-3 | La URL cambiaría sin que el router se entere, **sin error en consola** — el modo de falla más caro del repo |
| **A9** | El orden de los dos listeners de `popstate` (el de Next y el nuestro) es indiferente | A-3.1 | Ya declarado como no medido en el diagnóstico de v0.30: *"NO MEDIDO: el orden de los dos listeners de popstate… se razono que es indiferente"* |
| **A10** | Inicio no tiene campos de texto ⇒ C-7 es improbable | C-7 | El aviso de MOB-05 aparecería por un gesto de teclado. El barrido dio cero, pero es un barrido (absencia), no una prueba |
| **A11** | Todo lo medido en este repo sobre `popstate` fue **Chrome 153 desktop headless**; **Safari/iOS y Chrome Android reales están declarados no verificados** | A-8 | Es el hueco que la UAT en celular real existe para tapar. **No es un supuesto que se pueda cerrar leyendo código** |

**Ninguno de estos once se puede cerrar con `tsc`, con la suite ni con el build.** Los que más pesan
—A1, A4, A5, A6, A7— se cierran con **una sonda CDP** (`Page.getNavigationHistory`) antes de dar la
fase por hecha, y **A11 sólo con el teléfono del dueño**.

---

## Open Questions

1. **¿MOB-05 se gatea a mobile o vale también en desktop?** *(§A-4.4 — la única que necesita una
   decisión del dueño, no del planner)*
   - **Lo que sabemos:** la barra se oculta por CSS, así que el hook corre en los dos; el aviso se
     ancla a `var(--panel-nav-h)`, que en desktop no reserva nada; MOB-07 dice "en desktop no cambia
     nada"; y dejar la absorción sin aviso es un **atrás muerto**, el peor resultado posible.
   - **Lo que falta:** la decisión.
   - **Recomendación:** **gatear a mobile** con el `useMediaQuery` que el repo ya tiene en cuatro
     lugares, y escribir en el plan que el gate es de **MOB-05**, no de la política de dos niveles
     (el criterio 6 habla de la política). Reversible y aditivo en los dos sentidos.

2. **La colisión de §A-3.2: ¿cómo se resuelve "tocar el destino que ya está debajo"?**
   - **Lo que sabemos:** `collapse-then-replace` produce `[…, X, X]` = atrás muerto; la solución
     correcta es consumir dos veces y no navegar; detectarlo requiere `frjUnder` **también** en la
     entrada de `/mas`.
   - **Lo que falta:** medir que los dos hops encadenados por `popstate` aterricen donde dicen.
   - **Recomendación:** que la **wave 1** del plan sea una **sonda CDP** que mida estas pilas antes de
     escribir la política. Es barato y es literalmente lo que la memoria
     `medir-antes-de-aceptar-un-fix-propuesto` reclama.

3. **¿`applyPanelView` preserva `frjUnder` o se acepta la degradación?** *(C-3)*
   - **Lo que sabemos:** las tres causas de `replace` la borran, y la Phase 4 va a cablear los tabs con
     `replace`. La degradación es segura (nunca un `back()` a ciegas).
   - **Recomendación:** **aceptar la degradación en esta fase** y declararla; preservar la clave es una
     línea, pero toca el ejecutor que v0.30 dejó auditado con un gate de código y abre la pregunta de
     A8. Si la Phase 4 la necesita, entra ahí con su propia medición.

4. **La redacción de MOB-04 y del criterio 1.** El CONTEXT ya ordena precisarla (D-02 permite tres
   escalones). **Recomendación:** adoptar el invariante de §A-3.2 (*"`/mas` no queda inmediatamente
   debajo, y no hay dos entradas idénticas adyacentes"*), que es verificable y no contradice a D-02.

5. **¿El aviso de MOB-05 se dibuja mientras hay un overlay abierto?** §13 dice que no puede coexistir
   porque el atrás cierra el overlay primero `[VERIFIED: 02-UI-SPEC.md:834]`. Con la regla 0 y
   `topIsOurs` eso se cumple **por construcción**, pero conviene que sea un **caso de test puro**
   explícito y no una nota.

---

## Sources

### Primary (HIGH confidence — leídos este sesión, con línea)

- `lib/panel-history.ts` (557 líneas, entero) — `panelNavMode`, `panelHistoryAction`,
  `consumeOwnedPanelEntry`, `isForeignOwnedEntry`, `applyPanelView`, `PANEL_ROOT`
- `lib/dirty-history.ts` (422 líneas, entero) — el ciclo sentinel de referencia
- `lib/overlay-history.ts` — exports, `popstateAction`, `softKeyboardGuardsBack`, los dos umbrales
- `lib/unsaved-changes.ts:35-87` — `decideNavigation`, `leaveNavigationPlan` y su docblock medido
- `components/dashboard/unsaved-changes-guard.tsx:100-220` — la mecánica del encadenamiento
- `components/dashboard/panel-bottom-nav.tsx` (166 líneas, entero)
- `app/(dashboard)/mas/mas-client.tsx:1-140` + el cableado por grep · `app/(dashboard)/mas/page.tsx`
- `components/dashboard/sidebar.tsx` (cableado + breakpoints) · `components/dashboard/nav-groups.ts:43-91`
- `app/(dashboard)/layout.tsx` (entero) · `app/layout.tsx:60-85` (el `<Toaster>`)
- `lib/panel-history.test.ts:440-529` · `test/panel-nav-chrome.test.ts:200-290` · `lib/unsaved-changes.test.ts:51-68`
- `vitest.config.mts` · `.planning/config.json` · `.planning/workstreams/panel-nav/config.json`
- **Next 16.2.7 instalado:** `client/components/app-router.js:39-95,116-121,228-304` ·
  `client/components/segment-cache/navigation.js:271,370-413` ·
  `client/components/router-reducer/reducers/restore-reducer.js` ·
  `client/components/router-reducer/create-initial-router-state.js:129` ·
  `client/components/router-reducer/create-href-from-url.js` ·
  `dist/docs/01-app/03-api-reference/04-functions/use-pathname.md`
- **Ejecutado:** `./node_modules/.bin/tsc --noEmit` → `RC=0` · `npx vitest run` sobre las 8 suites de
  historial → 274/274

### Secondary (MEDIUM confidence — artefactos del repo)

- `.planning/workstreams/panel-nav/ROADMAP.md` §"Phase 3" (riesgos (a)–(d), H-1..H-6, M-1..M-10)
- `.planning/workstreams/panel-nav/REQUIREMENTS.md` (MOB-04/05/06, T-4/T-5/T-7/T-10)
- `.../phases/03-…/03-CONTEXT.md` (D-01..D-04)
- `.../phases/02-la-barra-inferior-y-m-s/02-UI-SPEC.md` **§13** (el aviso, la constante única) y
  `02-UAT.md:245-250` (los dos recorridos que no son bugs)
- `.planning/debug/interceptar-atras-aviso-sin-guardar.md` (H-5, S1–S4, las dos colisiones concretas,
  y los huecos declarados: Safari/iOS, Chrome Android, Alt+Left)
- `.planning/workstreams/panel-nav/STATE.md` (las 29 decisiones de las Phases 1 y 2)

### Tertiary (LOW confidence)

- Ninguna. **No hice ninguna búsqueda web para esta fase**: todo lo que decide el plan vive en este
  repo o en los fuentes instalados de Next, y una fuente externa sobre "history API" sería más débil
  que lo que ya está medido acá.

---

## Metadata

**Confidence breakdown:**

| Área | Nivel | Motivo |
|---|---|---|
| Stack (cero paquetes nuevos) | **HIGH** | No hay nada que instalar; todo leído del repo |
| Hechos de plataforma (P-1..P-10) | **HIGH** | Fuentes de Next 16.2.7 instalados, con línea y verbatim |
| Inventario del código que se redefine | **HIGH** | Archivos abiertos esta sesión; valores discretos citados verbatim |
| La mitad "rutas" de la política (A-1) | **HIGH** en el código, **MEDIUM** en el resultado observable | Las 4 ramas son verbatim; las pilas son derivación (A4) |
| La mitad "marca" (A-2) | **MEDIUM** | El camino de código está verificado; el orden de efectos es A1 |
| El colapso (A-3) | **MEDIUM** | El **mecanismo** está medido en producción; **este disparador** no, y la colisión de A-3.2 está abierta |
| MOB-05 (A-4) | **MEDIUM** | El ciclo sentinel está medido (S1–S4); la variante de Inicio, la trampa C-5 y el gate de viewport son nuevos |
| Pitfalls | **HIGH** | Cada uno con su archivo:línea o con su quick/memoria |
| Qué NO se puede testear (A-8) | **HIGH** | Es el propio criterio del ROADMAP, confirmado leyendo la suite |

**Research date:** 2026-10-13
**Valid until:** **30 días** para los hechos del repo; **hasta el próximo bump de `next`** para P-1..P-8
(son líneas de `node_modules/next/dist/client/`: un `npm update` las mueve y hay que re-verificarlas,
no re-suponerlas).
