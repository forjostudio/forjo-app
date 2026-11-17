# Phase 4: Los tabs profundos sobre la política ya fijada - Research

**Researched:** 2026-11-17
**Domain:** historial del navegador en el App Router de Next 16.2.7 (subsecciones en la query, `useSearchParams`, `pushState`/`replaceState` nativos) compuesto con la política de dos niveles de la Phase 3
**Confidence:** HIGH en el mecanismo y en el radio de T-1/T-2 (todo leído en el código de esta sesión); **MEDIUM** en la composición con la Phase 3 (derivada del código y **sin medir** en una pila real)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Cómo se apilan los tabs (la composición con los dos niveles)

- **D-01 — Un nivel de tabs: el atrás desde cualquier tab vuelve al tab POR DEFECTO, y el siguiente sale
  de la sección según la Phase 3.** Salir del tab por defecto hacia otro **empuja** una entrada; cambiar
  entre dos tabs no-default **reemplaza**. Así `Datos → Cobros → Integraciones → Cobros → atrás` cae en
  **Datos**, y un atrás más sale de `/negocio` a donde mande la Phase 3 (Más si se entró por Más, Inicio
  si se entró por la barra/Inicio). Es la misma lógica que sección→sección en la Phase 3 (`replace`, la
  pila no crece — la lección de `G2-1`). Elegido por el dueño el 2026-11-17 contra «cada tab empuja»
  (acumula un atrás por cada ida y vuelta) y «sin historial».
  ⚠ **Precisa el criterio 1 del ROADMAP:** donde dice «el atrás vuelve al tab anterior» pasa a ser «al
  tab **por defecto**». El planner deja la enmienda fechada en el ROADMAP y en MOB-08 (mismo formato que
  los «PRECISADO» de la Phase 3), no la reinterpreta en silencio.
- **D-02 — Tocar a mano el tab por defecto desde otro tab CONSUME la entrada del tab** (equivale a un
  atrás guardado, `consume`): el próximo atrás ya sale de la sección. Nunca deja `Datos` arriba de
  `Datos` (la «entrada basura» que la Phase 3 prohíbe). Mismo criterio que sección→Inicio en la Phase 3
  (un retroceso, no un push).
- **D-03 — Entrar directo a un tab por URL** (pegada, recargada, link compartido: `/negocio?tab=cobros`)
  **no fabrica** una entrada del tab por defecto por debajo: el atrás sale de la sección. Mismo criterio
  que la Phase 3 con «no se empuja un Inicio falso». *(Decidido por consistencia con lo ya hecho; el dueño
  delegó en las recomendaciones.)*
- **D-04 — Finanzas usa la misma regla** (default `turnos`): el botón «Nueva venta» / «Nuevo egreso» sale
  del tab **resuelto de la URL**, así que entrar directo y volver con el atrás lo mantienen coherente
  (criterio 4).

#### Los nombres en la URL

- **D-05 — El parámetro es `?tab=` y su valor es el label en español, en minúsculas y sin tildes:**
  `datos · cobros · integraciones · notificaciones` (Negocio) · `apariencia · seguridad · suscripcion`
  (Configuración) · `turnos · ventas · egresos` (Finanzas). Un mapa chico traduce al valor interno de hoy
  (`business`, `appearance`, `appointments`, `sales`, `expenses`, …); **no se renombra** ningún valor de
  `TabsTrigger`/`TabsContent` (sería tocar contenido, fuera de alcance).
- **D-06 — El tab por defecto es la URL LIMPIA** (`/negocio`, `/settings`, `/finances`, sin `?tab=`). Sólo
  los otros tabs llevan el parámetro. Los links del sidebar y de Más no cambian y una URL vieja guardada
  abre lo mismo. Un `?tab=datos` explícito abre Datos igual (y puede sanearse a la URL limpia con
  `replace`, a criterio del planner).
- **D-07 — Valor ausente, vacío, inválido o de otro grupo** (p. ej. `?tab=ventas` en `/negocio`) **cae al
  tab por defecto sin pantalla vacía** y la URL se sanea con `replace` (causa `stale`). El valor se
  valida contra la **lista cerrada** del grupo de esa ruta; nunca se usa para decidir qué se **lee**
  (seguridad, ver canonical refs).

#### Tocar la sección estando en un tab

- **D-08 — Tocar la sección ACTIVA estando en un tab no-default te lleva al tab por defecto consumiendo la
  entrada del tab** (análogo de NAV-08: tocar el destino activo «sigue cerrando la subsección abierta»).
  Vale para el sidebar de desktop (p. ej. «Finanzas» estando en `?tab=ventas`) y para cualquier punto de
  entrada que apunte a la misma ruta. Entrar a la sección desde **otro** lugar (Más, la barra, el sidebar
  desde otra sección) la abre en el tab por defecto, porque la URL de esos links es la limpia (D-06).
  *(Recomendación tomada por delegación del dueño.)*

#### El retorno del OAuth (T-2)

- **D-09 — `?mp=` / `?google=` en `/negocio`:** el toast se muestra igual y la URL queda en
  `/negocio?tab=integraciones` con **`replace`** (no agrega entrada). El orden actual —forzar el tab y
  **después** `replaceState(null, '', '/negocio')`— es exactamente el que borraría el tab y además pisaría
  el `state` de la entrada: deja de existir como escritura cruda y pasa a ser una decisión `replace` del
  helper. Mismo criterio para las ramas de error.
- **D-10 — `?google=` en `/agenda`:** su `replaceState(null, '', '/agenda')` crudo (T-7 de v0.30) también
  pasa por el helper como `replace`. Agenda **no** gana tabs: sólo se limpia la query.

### Claude's Discretion

- Cómo se expresa la regla de D-01/D-02 en el helper: reusar `panelHistoryAction`/`applyPanelView`/
  `resolveViewParam` con causas existentes o sumar una función pura nueva (p. ej. `panelTabAction`), con
  tests en vitest `node` como el resto. Requisito duro: **un solo dialecto** (criterio 5) y la decisión
  testeada como función pura.
- La marca de la entrada del tab (reusar `frjView` con `param: 'tab'` o una clave propia) y cómo convive
  con la regla 0 de la Phase 3 (`isForeignOwnedEntry`), `frjUnder` y el sentinel de salida. Restricción:
  una marca nueva es **nueva**, nunca se reusa una de otro dueño.
- Si `?tab=datos` explícito se sanea a la URL limpia o se deja.
- El `<Suspense>` para `useSearchParams` (patrón de `plan-banner.tsx` en el layout del dashboard) o leer
  `window.location` como hace hoy el efecto del OAuth — lo que no rompa `npm run build`.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. (Siguen fuera, ya declarados en el ROADMAP: el `activeLoc` de Agenda, reorganizar/renombrar tabs, extender `useUnsavedChanges`, el toggle `mobileView` de `/web`. Y la deuda de la Phase 3: los 30 `DialogContent` sin alto máximo, la X de 28px, el eslint de `plan-modal.tsx:33`.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MOB-08 | (ex NAV-03) Los tabs de `/negocio` y `/settings` viven en la URL: el atrás vuelve al tab anterior *(PRECISADO por D-01: al tab por defecto)* y el tab se puede compartir y recargar. | §Patrón 1 (el tab por defecto = `null` = URL limpia, que hace calzar la maquinaria de `?c=`), §Patrón 2 (causa `'user-switch'` + `panelTabCause`), §Patrón 3 (la marca que un `replace` NO debe fabricar — **obligatorio**), §Patrón 4 (OAuth con `drop`), §T-1, §Composición con la Phase 3 |
| MOB-09 | (ex NAV-04) Ídem los de `/finances`, y el botón de alta sigue correspondiendo al tab visible. | §Patrón 1 aplicado a Finanzas (`txTab` pasa a ser derivado de la URL; las dos líneas de alta no cambian de forma), §Patrón 5 (`useSearchParams` sin flash) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Directivas accionables de `./CLAUDE.md` → `./AGENTS.md`, `./.claude/CLAUDE.md` y el CLAUDE.md global, con la misma autoridad que las decisiones bloqueadas:

- **Next 16.2.7, no el Next conocido:** leer `node_modules/next/dist/docs/` antes de asumir. El middleware es `proxy.ts`.
- **Turno de pantalla:** todo comando que levante un navegador o un servidor para probar va envuelto en `node scripts/con-turno.mjs <comando>` (sondas CDP incluidas). Quedan afuera: `npm test`/vitest `node`, build, lint, typecheck. Una espera del turno **no es un cuelgue**.
- **Intocables:** `lib/overlay-history.ts`, `lib/dirty-history.ts`, `scripts/con-turno.mjs`, `next.config.ts`.
- **Aislamiento por tenant no negociable:** toda query filtra por `business_id` resuelto por `owner_id`; el service role sólo en server.
- **Errores/logging/comentarios:** comentarios densos **en español** explicando el porqué; `console.error('[modulo/accion] ...')`; funciones con >2 params relacionados reciben **un objeto**; helpers de validación devuelven objetos discriminados.
- **Alias `@/*`** siempre; Server Components por defecto; `*-client.tsx` para la interactividad.
- **Cero paquetes nuevos** (flaggear cualquier dependencia antes de agregarla) — esta fase no necesita ninguna.
- **Edit, no Write** para archivos existentes; cambiar sólo lo necesario (global §3). Validar antes de declarar hecho (global §5).
- **Presentar la mejor alternativa, no la más rápida** (global §14): la decisión de composición de abajo se presenta con sus dos caminos.
- **Dev env Windows/PowerShell**; usar `./node_modules/.bin/tsc --noEmit` (nunca `npx tsc`, que sale 0 siempre — memoria del repo).
- **Vercel Hobby:** cero crons nuevos (no aplica). **Migraciones: cero** (próxima libre 080 según REQUIREMENTS; no aplica).
- **GSD:** los cambios al repo pasan por `/gsd-execute-phase`; nada de ops git en otra terminal durante la ejecución.

## Summary

El mecanismo ya existe y está probado: `/clients?c=` (v0.30) es una subsección en la query gobernada por `lib/panel-history.ts`, y **un tab es estructuralmente lo mismo** si se adopta una sola equivalencia: **el tab por defecto es `null`** (D-06: la URL limpia). Con eso, abrir un tab desde el default es `user-open` (empuja), volver al default es `user-close` (consume si la entrada es nuestra, reemplaza si no — D-02 y D-03 salen solos), y un valor inválido/vacío/de otro grupo/`?tab=datos` explícito es `stale` vía `resolveViewParam` (D-07 y el saneo de D-06 salen solos). Lo único que **no** expresa el contrato de hoy es "entre dos no-default **reemplaza**" (D-01): `user-open` empuja siempre (decisión ① de v0.30 para A→B en clientes). Hace falta **una causa nueva** (`'user-switch'` → `replace`) y una función pura `panelTabCause({ from, to })` que elija la causa — así la política sigue en el módulo y no en el call site, y el `switch` exhaustivo obliga a decidirla en un solo lugar.

Hay **un defecto obligatorio de corregir** en el ejecutor, que hoy está latente y los tabs lo vuelven frecuente: `applyPanelView` escribe la marca de propiedad (`frjView: param`) en **todo** `replace` con valor no nulo, aunque la entrada **no** la haya empujado este módulo. Con tabs eso convierte en "nuestra" la entrada de una URL pegada (D-03) o del retorno del OAuth (D-09), y el siguiente toque a Datos (o a la sección activa en el sidebar, D-08) hace un `history.back()` sobre una entrada ajena: **expulsa al dueño del sitio** o es un toque muerto en una pestaña nueva. La regla correcta, hermana de la que la Phase 3 ya escribió para la rama: **un `replace` no cambia quién empujó la entrada** ⇒ la marca se escribe sólo en `push` o si ya estaba (`holding`). De paso cierra el mismo hueco latente en la fusión de clientes con URL pegada.

El riesgo que el plan **tiene que** traer como decisión es la **composición con la Phase 3**: con la entrada de un tab arriba, el gesto de la barra lee `window.history.state` **de la entrada del tab** (que nace sin `frjUnder`), así que `masDebajo` y `raizDebajo` dan **falso** y los tres gestos de la barra desde un tab caen en la regla de rutas: `Más → Negocio → Cobros → Inicio` **empuja** (vuelve el síntoma de `G2-1`: pila que crece y aviso de salida que no se arma), `→ Turnos` deja `/negocio` y `/mas` debajo, `→ Más` apila en vez de subir. Es **degradación segura** (nunca expulsión) y el mismo hueco ya existe —sin declarar— para la ficha `?c=`, pero los tabs lo vuelven el caso común. Ningún escenario de los 18 medidos (`E-1..E-18`) tiene una subsección arriba.

**Primary recommendation:** tabs = `?tab=` con el default en `null`, sobre `applyPanelView` + causa nueva `'user-switch'` + `panelTabCause`, con la marca corregida para `replace`; leer la URL con `useSearchParams` (rutas dinámicas ⇒ sin flash y sin romper el build) envuelto en `<Suspense>` en las tres páginas con tabs; OAuth como `replace` del helper con un parámetro nuevo `drop`. Y **antes de planificar**, poner frente al dueño la decisión de composición (Opción A declarar vs. Opción B1 cerrar el hueco en la barra), con la recomendación **B1**.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Leer el tab de la URL y resolverlo contra la lista cerrada | Browser / Client (`*-client.tsx` + función pura en `lib/`) | Frontend Server (SSR: `useSearchParams` ya resuelve en el render dinámico) | El tab decide qué se **muestra**; la lista es fija por ruta. La resolución es pura y testeable en `node` |
| Decidir push/replace/consume/none | `lib/panel-history.ts` (puro) | — | NAV-05: una sola política; el call site declara qué pasó |
| Escribir el historial | `lib/panel-history.ts` (`applyPanelView`, único escritor de vistas) | — | Criterio 5: cero escrituras crudas en las pantallas |
| Componer con los dos niveles (gestos de la barra con una subsección arriba) | `lib/panel-branch.ts` (`usePanelBranch`) | `lib/panel-history.ts` (`panelBranchPlan`) | Es el único lugar que lee los hechos de la pila en el momento del gesto |
| Tocar la sección activa (D-08) | `components/dashboard/sidebar.tsx` (ya cableado: `active && consumeOwnedPanelEntry()`) | — | NAV-08 es genérico por la marca: hereda los tabs sin tocar nada |
| Leer secretos / datos del negocio | Frontend Server (`page.tsx`: `owner_id` → `business.id` → `getBusinessSecrets`) | Database (RLS) | Ocurre **antes** de cualquier tab; el tab nunca entra al server |
| Retorno del OAuth (`?mp=`, `?google=`) | API (`app/api/*/callback/route.ts`: lista cerrada de destinos) | Browser (toast + `replace` del helper) | El backend no cambia; sólo cambia la limpieza en el cliente |

## Standard Stack

### Core (todo ya instalado; esta fase no agrega nada)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.7 | `useSearchParams`, el parche de `pushState`/`replaceState` que sincroniza el router | Es el stack del repo [VERIFIED: CLAUDE.md del proyecto] |
| `@base-ui/react` (Tabs vía `components/ui/tabs.tsx`) | ^1.5.0 | `Tabs` controlado (`value` + `onValueChange(value, eventDetails)`) | Ya es el componente de los tres grupos [VERIFIED: node_modules/@base-ui/react/tabs/root/TabsRoot.d.ts:41-59] |
| `vitest` | 4.1.9 | Suites puras `environment: 'node'` | Runner del repo [VERIFIED: corrida de esta sesión, `RUN v4.1.9`] |
| `lib/panel-history.ts` | (propio) | La política y el ejecutor | NAV-05 |
| `lib/panel-branch.ts` | (propio) | Ejecutor de la rama + sentinel + hook de la barra | Phase 3 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pushState`/`replaceState` nativos (vía helper) | `router.push('/negocio?tab=cobros')` o `<Link href="?tab=">` | ❌ Es una **navegación**: la página dinámica se re-renderiza en el server (re-lee `getBusinessSecrets`, nuevas props `initial*` ⇒ riesgo de pisar borradores), y el router escribe su state con `preserveCustomHistoryState: false` (borra marcas). El nativo despacha `ACTION_RESTORE` sin fetch [CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md:278-280] [VERIFIED: node_modules/next/dist/client/components/app-router.js:237-249] |
| `useSearchParams` | `searchParams` prop de la página pasado como `initialTab` | La prop **no** se actualiza tras un `pushState` nativo (no hay navegación al server), así que igual haría falta leer la URL en el cliente: dos fuentes de verdad |
| `useSearchParams` | `window.location` en un efecto | Flash del tab por defecto en recarga/entrada directa y riesgo de mismatch de hidratación |
| Marca `frjView` con `param: 'tab'` | Una clave nueva (`frjTab`) | Una clave nueva **no** la reconoce `consumeOwnedPanelEntry` (D-08 dejaría de salir gratis) ni `isPanelViewEntry`; `frjView` **ya** es la marca de "subsección del panel" y su docblock anticipa los tabs [VERIFIED: lib/panel-history.ts:160-163, 1004-1006]. No es "reusar la marca de otro dueño": es el mismo dueño (`panel-history`) |

**Installation:** ninguna.

## Package Legitimacy Audit

No aplica: la fase **no instala paquetes** (todo lo de arriba ya está en el repo). Verificado contra el alcance del ROADMAP ("cero componente nuevo") y la regla del perfil del dev ("flaggear cualquier dependencia nueva").

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Lo que el código dice HOY (evidencia, con las líneas leídas en esta sesión)

### El contrato del helper

`PanelViewCause` [VERIFIED: lib/panel-history.ts:51-63]:
```ts
export type PanelViewCause =
  | 'user-open'
  | 'user-close'
  | 'programmatic'
  | 'filter'
  | 'stale'
  | 'concurrent'
```
Política por causa [VERIFIED: lib/panel-history.ts:112-139]: `case 'user-open': return 'push'` · `case 'user-close': return holding ? 'consume' : 'replace'` · `case 'programmatic': return 'replace'` · `case 'filter': return 'replace'` · `case 'stale': return holding ? 'consume' : 'replace'` · `default: { const _exhaustivo: never = cause ...}`. Antes del `switch`: `if (foreignOwnsTop) return 'none'` (regla 0), `if (cause === 'concurrent') return 'none'`, `if (from === to) return 'none'` [VERIFIED: lib/panel-history.ts:100, 106, 110].

La marca [VERIFIED: lib/panel-history.ts:166-168]:
```ts
export function panelViewState(param: string, value: string | null): PanelViewState {
  return { frjView: value === null ? null : param }
}
```
El ejecutor [VERIFIED: lib/panel-history.ts:852-878] — **el punto del defecto**:
```ts
  const actual: unknown = window.history.state
  const action = panelHistoryAction({
    cause, from, to,
    holding: isPanelViewEntry(actual, param),
    foreignOwnsTop: isForeignOwnedEntry(actual),
  })
  if (action === 'none') return action
  if (action === 'consume') { window.history.back(); return action }
  const url = panelViewUrl({ pathname: window.location.pathname, search: window.location.search, param, value: to })
  const next = panelViewState(param, to)
  if (action === 'push') window.history.pushState(next, '', url)
  else window.history.replaceState(next, '', url)
```
(formato compactado acá; el archivo tiene una propiedad por línea). `panelViewUrl` preserva los params ajenos: `if (value === null) sp.delete(param) else sp.set(param, value)` [VERIFIED: lib/panel-history.ts:380-384].

NAV-08, genérico por la marca [VERIFIED: lib/panel-history.ts:1025-1031]:
```ts
export function consumeOwnedPanelEntry(): boolean {
  const actual: unknown = window.history.state
  if (isForeignOwnedEntry(actual)) return false
  if (panelViewEntryParam(actual) === null) return false
  window.history.back()
  return true
}
```
Regla 0 [VERIFIED: lib/panel-history.ts:356-358]: `return isOverlayOwnedEntry(state) || isDirtyGuardOwnedEntry(state) || isExitSentinelOwnedEntry(state)` — `frjView` y `frjUnder` **no** están, a propósito.

### El parche de Next que hace funcionar todo esto (y la trampa)

[VERIFIED: node_modules/next/dist/client/components/app-router.js:84-96] `copyNextJsInternalHistoryState(data)`: `if (data == null) data = {};` y le copia `__NA` y `__PRIVATE_NEXTJS_INTERNALS_TREE` del state actual. ⇒ `replaceState(null, '', url)` **borra toda clave propia** (`frjView`, `frjUnder`) y deja sólo los internos.
[VERIFIED: app-router.js:252-279] `if (data?.__NA || data?._N) { return originalPushState(data, _unused, url); }` ⇒ propagar el state actual (`{...history.state, x}`) arrastra `__NA`, salta la rama temprana y **no** despacha `ACTION_RESTORE`: `useSearchParams` no se entera (la trampa ya documentada en `lib/panel-history.ts:151-158`).
[VERIFIED: node_modules/next/dist/client/components/segment-cache/navigation.js:404-414] el traverse (atrás/adelante) usa `preserveCustomHistoryState: true`, y el `HistoryUpdater` re-escribe `...pushRef.preserveCustomHistoryState ? window.history.state : {}` [VERIFIED: app-router.js:51-57] ⇒ **las marcas sobreviven al atrás y al `ACTION_RESTORE`**; las navegaciones blandas (`<Link>`/`router.*`) usan `false` [VERIFIED: navigation.js:271, 382] ⇒ las borran.
[CITED: node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:341-345] "`pushState` and `replaceState` calls integrate into the Next.js Router, allowing you to sync with `usePathname` and `useSearchParams`." — re-confirmado.

### Los tres grupos de tabs

`settings-client.tsx` [VERIFIED: app/(dashboard)/settings/settings-client.tsx:992-1002]:
```ts
  const SECTION_TAB: Record<string, string> = { negocio: 'business', servicios: 'services', equipo: 'professionals', consultorios: 'locations' }
  const isSection = view !== 'config'
  const isNegocio = view === 'negocio'
  const [configTab, setConfigTab] = useState('appearance')
  ...
  const [negocioTab, setNegocioTab] = useState('business')
  ...
  const tabValue = isNegocio ? negocioTab : isSection ? SECTION_TAB[view] : configTab
  const onTabChange = isNegocio ? setNegocioTab : isSection ? undefined : setConfigTab
```
Triggers [VERIFIED: settings-client.tsx:2406-2409]: `value="business"` (Datos), `value="cobros"` (Cobros), `value="integraciones"` (Integraciones), `value="notificaciones"` (Notificaciones/Mail). [VERIFIED: settings-client.tsx:2416-2418]: `value="appearance"` (Apariencia), `value="seguridad"` (Seguridad), `value="suscripcion"` (Suscripción). El `<Tabs value={tabValue} onValueChange={onTabChange}>` es **uno solo** para las cinco vistas [VERIFIED: settings-client.tsx:2398]. Tipo de vista [VERIFIED: settings-client.tsx:921]: `type SettingsView = 'config' | 'negocio' | 'servicios' | 'equipo' | 'consultorios'`; default `view = 'config'` [VERIFIED: settings-client.tsx:985].

`finances-client.tsx` [VERIFIED: app/(dashboard)/finances/finances-client.tsx:200]: `const [txTab, setTxTab] = useState('appointments')`; [VERIFIED: :1007] `<Tabs value={txTab} onValueChange={setTxTab}>`; triggers [VERIFIED: :1010-1012] `value="appointments"`, `value="sales"`, `value="expenses"`; alta [VERIFIED: :1014-1015] `{txTab === 'sales' && <Button ... onClick={openNewSale}>...Nueva venta</Button>}` / `{txTab === 'expenses' && ... Nuevo egreso ...}`. `txTab` **no** se usa en ningún otro lado del archivo (grep de esta sesión: sólo L200, 1007, 1014, 1015) y el archivo no importa `next/navigation`.

### Quién renderiza `SettingsClient` (T-1)

Grep de esta sesión: **cinco** páginas. Las tres secciones pasan `view` literal y **no** tocan tabs: `app/(dashboard)/consultorios/page.tsx:23` `view="consultorios"`, `app/(dashboard)/equipo/page.tsx:42` `view="equipo"`, `app/(dashboard)/servicios/page.tsx:49` `view="servicios"`. Las dos con tabs: `app/(dashboard)/negocio/page.tsx:34` `view="negocio"` y `app/(dashboard)/settings/page.tsx` (sin `view` ⇒ `'config'`). Las cinco son **dinámicas**: todas arrancan con `const supabase = await createClient()` + `supabase.auth.getUser()` (cookies) [VERIFIED: leído en las cinco páginas]. Ninguna recibe `searchParams` hoy.

### El OAuth (T-2) — los emisores y los consumidores

- MP: `app/api/mercadopago/callback/route.ts:17` `NextResponse.redirect(\`${base}/negocio?mp=error\`)`, `:74` `NextResponse.redirect(\`${base}/negocio?mp=connected\`)`; `app/api/mercadopago/connect/route.ts:9` `if (!mpConnectConfigured()) return NextResponse.redirect(\`${base}/negocio?mp=error\`)` [VERIFIED: grep + lectura].
- Google: `app/api/google/connect/route.ts:12-13` `const from = new URL(request.url).searchParams.get('from') === 'negocio' ? 'negocio' : 'agenda'` / `const returnPath = from === 'negocio' ? '/negocio' : '/agenda'`; `app/api/google/callback/route.ts:15` `const returnPath = request.cookies.get('g_oauth_from')?.value === 'negocio' ? '/negocio' : '/agenda'`, `:18` `...${returnPath}?google=error`, `:52` `...${returnPath}?google=connected` [VERIFIED].
- El cliente arranca el OAuth con navegación **de documento**: `onClick={() => { window.location.href = '/api/mercadopago/connect' }}` [VERIFIED: settings-client.tsx:3841, 3848] y `'/api/google/connect?from=negocio'` [VERIFIED: :3908] ⇒ **el retorno es siempre un documento nuevo** (redirect 307 desde el proveedor externo): en esa entrada no hay ninguna marca nuestra, así que el `replaceState(null, …)` de hoy no borra nada propio — el daño real de hoy es **sólo** que borra el tab de la URL (T-2) y que es un segundo dialecto (criterio 5).
- Consumidor en Negocio [VERIFIED: settings-client.tsx:1008-1021]: lee `window.location.search`, toast por `mp`/`google`, `setNegocioTab('integraciones')`, `window.history.replaceState(null, '', '/negocio')`, deps `[isNegocio]`.
- Consumidor en Agenda [VERIFIED: app/(dashboard)/agenda/agenda-client.tsx:284-290]: `const g = new URLSearchParams(window.location.search).get('google')` … `window.history.replaceState(null, '', '/agenda')`, deps `[]`.
- Barrido del criterio 5 hoy (grep crudo de esta sesión sobre los tres archivos): **2** hits, ambos código (`settings-client.tsx:1020`, `agenda-client.tsx:290`). **Cero** comentarios con esos literales en los tres archivos.

### Los tres menús y D-08

Barra [VERIFIED: components/dashboard/panel-bottom-nav.tsx:74-79]: `{ href: '/dashboard' ... }`, `{ href: '/appointments' ... }`, `{ href: '/agenda' ... }`, `{ href: '/clients' ... }`, `{ href: '/mas' ... }` ⇒ **ninguna** de las tres rutas con tabs está en la barra: en mobile se entra a ellas **sólo por Más** (o URL directa / retorno del OAuth). Orden contrato [VERIFIED: panel-bottom-nav.tsx:192-196]:
```tsx
onNavigate={(e) => {
  if (requestNavigation(destino.href)) { e.preventDefault(); return }
  if (active && consumeOwnedPanelEntry()) e.preventDefault()
  else if (handleNavigate(destino.href)) e.preventDefault()
}}
```
Sidebar [VERIFIED: components/dashboard/sidebar.tsx:85, 103-106]: `const active = pathname === item.href` y `if (active && consumeOwnedPanelEntry()) e.preventDefault()`; **no** usa `usePanelBranch` (sólo `panelNavMode` para `replace`). Más [VERIFIED: app/(dashboard)/mas/mas-client.tsx:212-215]: mismo par (guard + `pathname === item.href && consumeOwnedPanelEntry()`).
⇒ **D-08 sale gratis en el sidebar** (único lugar donde se puede "tocar la sección activa" estando en un tab): `usePathname()` ignora la query, así que `/finances?tab=ventas` deja activo `/finances`, y `consumeOwnedPanelEntry` consume cualquier `frjView` string. Si la entrada **no** es nuestra (URL pegada), el `<Link>` hace `replace` a la ruta limpia (rama 1 de `panelNavMode`, que "LIMPIA la query" [VERIFIED: lib/panel-history.ts:425-428]) ⇒ también cae en el default. **Cero cableado nuevo para D-08**, *siempre que* se corrija la marca del `replace` (Patrón 3); sin esa corrección D-08 es el camino más corto a la expulsión.

### La barra lee los hechos DE LA ENTRADA DE ARRIBA

[VERIFIED: lib/panel-branch.ts:1931-1953] `handleNavigate` lee `const estado: unknown = window.history.state` **una vez** y deriva `holdsExitSentinel: isPanelExitEntry(estado, id)`, `masDebajo: panelUnderRoute(estado) === more`, `raizDebajo: panelUnderRoute(estado) === root`. El efecto de marcado corre con deps `[pathname, id, more]` [VERIFIED: lib/panel-branch.ts:1575-1600] ⇒ **un cambio de tab no lo dispara** (el pathname no cambia) y la entrada de la sección conserva su `frjUnder` (un `pushState` no toca la entrada de abajo; el traverse preserva el state). El oyente de `popstate` anota el aterrizaje [VERIFIED: :1559-1565]; el dato rancio de un atrás de tab (`/negocio`) se descarta en la próxima corrida del efecto y no puede coincidir con la ruta siguiente (la próxima ruta es, por construcción, otra).

## Architecture Patterns

### System Architecture Diagram

```
 toque en un TabsTrigger ──► onValueChange(value, {reason})
                                  │  reason !== 'none' ⇒ ignorar (defensa: nunca un push sin activación)
                                  ▼
                     valor interno ──► slug de URL (default ⇒ null)          [lib/panel-tabs.ts, puro]
                                  │
                                  ▼
          panelTabCause({from: slug actual, to: slug nuevo})                   [lib/panel-history.ts, puro]
            from=null → 'user-open' · to=null → 'user-close' · si no → 'user-switch'
                                  │
                                  ▼
          applyPanelView({cause, param:'tab', from, to})  ── lee history.state ─► holding / foreignOwnsTop
                                  │                                             (regla 0: overlay/guard/sentinel ⇒ none)
                 ┌────────────────┼─────────────────┬──────────────┐
               push            replace           consume          none
       (marca frjView:'tab') (marca SÓLO si holding) history.back()
                 └────────────────┴─────────────────┘
                                  ▼
              parche de Next ─► ACTION_RESTORE (sin fetch) ─► useSearchParams cambia
                                  ▼
   render: searchParams.get('tab') ─► resolveTab(grupo) ─► value del <Tabs> (+ botón de alta en Finanzas)
                                  │
                       ¿URL ≠ lo mostrado? (inválido, ?tab=datos, ?mp=/?google=)
                                  ▼
               efecto de reconciliación (molde de clients) ─► applyPanelView 'stale'|'programmatic'
                                                                (replace; OAuth con drop:['mp','google'])

 atrás del navegador ──► traverse de Next (preserva frjView/frjUnder) ──► useSearchParams ──► mismo render
 gesto de la barra/sidebar con un tab arriba ──► lee history.state = ENTRADA DEL TAB (sin frjUnder)  ⚠ ver Composición
```

### Recommended Project Structure

```
lib/
├── panel-history.ts      # + causa 'user-switch', + panelTabCause, + drop en panelViewUrl/applyPanelView,
│                         #   + la marca del replace corregida (Patrón 3). UN solo ejecutor.
├── panel-tabs.ts         # NUEVO, puro: los tres grupos (slug↔valor, default) + resolveTab. Sin React, sin window.
└── panel-history.test.ts # + casos (o una suite nueva test/panel-tabs.test.ts para el cableado estático)
app/(dashboard)/
├── settings/settings-client.tsx   # SÓLO L992-1021 (+ import) y L2398
├── negocio/page.tsx               # + <Suspense fallback={null}>
├── settings/page.tsx              # + <Suspense fallback={null}>
├── finances/finances-client.tsx   # L200, L1007 (+ import). L1014-1015 SIN CAMBIO de forma
├── finances/page.tsx              # + <Suspense fallback={null}>
└── agenda/agenda-client.tsx       # SÓLO L284-290 (+ import)
# servicios/equipo/consultorios page.tsx: CERO diff (son dinámicas; ver Patrón 5)
```

`lib/panel-tabs.ts` separado (y no adentro de `panel-history.ts`) porque los grupos son **configuración de pantalla**, no política de historial: `panel-history.ts` "NO decide qué se muestra" [VERIFIED: lib/panel-history.ts:31]. La política sigue en un solo módulo.

### Patrón 1: el tab por defecto ES `null` (y por eso la maquinaria de `?c=` calza)

**What:** el valor de URL de un tab es `null` para el default (URL limpia, D-06) y el slug para los demás. Con esa equivalencia:

| Transición (slug) | Causa | Acción (holding) | Acción (no holding) | Decisión cubierta |
|---|---|---|---|---|
| `null → 'cobros'` | `user-open` | push | push | D-01 (salir del default empuja) |
| `'cobros' → 'integraciones'` | `user-switch` (NUEVA) | replace (marca se conserva) | replace (sin marca) | D-01 (entre no-default reemplaza) |
| `'cobros' → null` | `user-close` | **consume** | replace | D-02 (consume) / D-03 (URL pegada: no hay default debajo ⇒ replace) |
| URL `'ventas'` en `/negocio`, `''`, `'datos'`, `'constructor'` | `stale` (vía `resolveViewParam`) | consume | replace | D-07 / saneo de D-06 |
| `?mp=`/`?google=` en `/negocio` sin `tab` | `programmatic` → `'integraciones'` + `drop` | replace | replace (sin marca) | D-09 |
| `x → x` | — | none | none | regla 2 (cicatriz 1) |

**Recomendación sobre `?tab=datos` (discreción):** **sanearlo** a la URL limpia. Sale gratis: `resolveViewParam({ param: 'datos', resolvedTo: null })` devuelve `{ reconcile: true, cause: 'stale', to: null }` [VERIFIED: lib/panel-history.ts:751-765], y deja **una** URL canónica por tab (lo que hace honesto el "compartir").

### Patrón 2: `'user-switch'` + `panelTabCause` (por qué no alcanzan las causas de hoy)

- `user-open` empuja **siempre** y no se puede cambiar: es la decisión ① de v0.30 para A→B en clientes [VERIFIED: lib/panel-history.ts:113-116].
- `programmatic` reemplaza, pero su semántica es "la app re-apunta la vista sola" [VERIFIED: :56-57, 121-124]; usarla para un toque del usuario es el segundo dialecto disfrazado.
- Elegir la causa en el call site según `from === null` sería política en la pantalla. Por eso `panelTabCause` vive en el módulo y la pantalla sólo declara *"el usuario eligió el tab X estando en el Y"*.

```ts
// lib/panel-history.ts — PROPUESTA [ASSUMED: nombres nuevos, a fijar en el plan]
export type PanelViewCause =
  | 'user-open' | 'user-close' | 'user-switch' | 'programmatic' | 'filter' | 'stale' | 'concurrent'

// en el switch de panelHistoryAction:
    // Un hermano del mismo nivel no es un destino nuevo: reemplaza, así la pila no crece (D-01, la
    // lección de G2-1). Es el análogo exacto de sección→sección en panelNavMode (rama 6).
    case 'user-switch':
      return 'replace'

/** Qué pasó, para un grupo de subsecciones de UN nivel cuyo default es `null` (la URL limpia). */
export function panelTabCause({ from, to }: { from: string | null; to: string | null }): PanelViewCause {
  if (from === null) return 'user-open'   // salir del default empuja (D-01)
  if (to === null) return 'user-close'    // volver al default consume si es nuestra (D-02)
  return 'user-switch'                    // entre dos no-default reemplaza (D-01)
}
```
`from === to` (incluido `null === null`) lo ataja la regla 2 antes del `switch` [VERIFIED: lib/panel-history.ts:110], así que `panelTabCause` no necesita ese caso. ⚠ Agregar la causa **rompe la compilación** de todo `switch` exhaustivo sobre `PanelViewCause` hasta decidirla — es el candado buscado [VERIFIED: lib/panel-history.ts:134-139]. Grep de esta sesión: el único `switch` sobre la causa está en `panelHistoryAction`.

### Patrón 3 (OBLIGATORIO): un `replace` no cambia quién empujó la entrada

**What goes wrong hoy, paso a paso:** `/negocio?tab=cobros` pegada (entrada E0, state del router, sin `frjView`) → toca Integraciones (`user-switch` → `replace`) → `applyPanelView` escribe `panelViewState('tab','integraciones')` = `{ frjView: 'tab' }` sobre E0 → E0 ahora "es nuestra" → toca Datos (`user-close`, `holding: true`) → `consume` → `history.back()` sobre E0: sale del sitio (o, en una pestaña nueva sin historia, no hace nada y la pantalla se queda en Integraciones: toque muerto). Idéntico con el retorno del OAuth (D-09) y con el toque a "Negocio" en el sidebar (D-08, `consumeOwnedPanelEntry`). Es la cicatriz 2 del propio módulo [VERIFIED: lib/panel-history.ts:22-23].

**Fix (una línea en el ejecutor, misma frontera de la Phase 3 para `frjUnder`: "un `replace` NO CAMBIA lo que quedó debajo" [VERIFIED: lib/panel-branch.ts:234-237]):**
```ts
// lib/panel-history.ts, applyPanelView — PROPUESTA [ASSUMED: forma exacta a fijar en el plan]
  const holding = isPanelViewEntry(actual, param)
  // ...decisión igual que hoy, pero con `holding` ya izado...
  // ⚠ UN REEMPLAZO NO CAMBIA QUIÉN EMPUJÓ LA ENTRADA. Sólo un push crea una entrada nuestra; un
  // replace conserva la propiedad que ya tenía (holding) y NUNCA la fabrica sobre una entrada ajena
  // (URL pegada, retorno del OAuth): fabricarla hace que el próximo consumo retroceda fuera del sitio.
  const next = panelViewState(param, action === 'push' || holding ? to : null)
```
Efecto lateral, a declarar: cierra el mismo hueco latente de `/clients` (fusión `programmatic` sobre una `?c=` pegada → "Volver" consumía una entrada ajena). La docblock de `applyPanelUnder` ya anticipa que tocar el ejecutor "si la Phase 4 lo necesita para los tabs, entra ahí con su propia medición" [VERIFIED: lib/panel-history.ts:970-973]. El objeto sigue siendo **literal fresco** (no se toca la trampa de `__NA`).

### Patrón 4: OAuth como `replace` del helper, con `drop`

`panelViewUrl` preserva los params ajenos (correcto para `?c=`), así que no puede expresar "poné `tab` y sacá `mp`". **Propuesta:** un parámetro opcional `drop?: readonly string[]` en `panelViewUrl` y en `applyPanelView` (default vacío ⇒ clientes sin cambio).
```ts
// settings-client.tsx, el efecto de hoy (L1008-1021) — PROPUESTA [ASSUMED: firma de drop]
useEffect(() => {
  if (!isNegocio) return
  // Se lee de `location` y no del render a propósito: en modo estricto el efecto corre dos veces y la
  // segunda ya ve la URL limpia (la escritura es síncrona sobre `location`), así que el toast sale UNA vez.
  const params = new URLSearchParams(window.location.search)
  const mp = params.get('mp')
  const google = params.get('google')
  if (!mp && !google) return
  if (mp === 'connected') toast.success('MercadoPago conectado')
  else if (mp === 'error') toast.error('No se pudo conectar con MercadoPago')
  if (google === 'connected') toast.success('Google Calendar conectado')
  else if (google === 'error') toast.error('No se pudo conectar con Google Calendar')
  applyPanelView({ cause: 'programmatic', param: 'tab', from: params.get('tab'), to: 'integraciones', drop: ['mp', 'google'] })
}, [isNegocio])
```
Y el render ya muestra Integraciones **desde el primer frame** (sin flash de Datos) porque la resolución del grupo Negocio considera la vuelta del OAuth (Patrón 5). Agenda (D-10) **no necesita `drop`**: `applyPanelView({ cause: 'stale', param: 'google', from: g, to: null })` → `holding` falso → `replace` a `/agenda` borrando sólo `google` y preservando cualquier otro param (hoy el literal `'/agenda'` los pisaría todos), con state `{ frjView: null }`.
⚠ **Un solo escritor por desajuste:** el efecto de reconciliación genérico del tab (molde de clients) tiene que **saltearse** mientras haya `mp`/`google` en la URL, o los dos efectos escriben en el mismo commit. Alternativa equivalente: que la resolución devuelva también el `drop` y la reconciliación sea el único escritor (el toast queda en un efecto de sólo lectura declarado **antes**). El plan elige una; la primera es el diff más chico.

### Patrón 5: leer la URL con `useSearchParams`, sin flash y sin romper el build

- **Las cinco páginas son dinámicas** (cookies vía `createClient()`), y en una ruta dinámica `useSearchParams` "will be available on the server during the initial server render" [CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md:186] ⇒ el HTML inicial ya trae el tab correcto: **sin flash del default en recarga/entrada directa y sin mismatch de hidratación**. El error de build "Missing Suspense boundary with useSearchParams" es sólo para páginas **estáticas** [CITED: use-search-params.md:178-180].
- **Recomendación:** `<Suspense fallback={null}>` en `negocio/page.tsx`, `settings/page.tsx` y `finances/page.tsx`, copiando `app/(dashboard)/clients/page.tsx:35-49` y su gate (h) [VERIFIED: test/panel-history-clients.test.ts:207-221] — protege el día que alguien vuelva estática una ruta. **No** tocar `servicios`/`equipo`/`consultorios/page.tsx`: llaman al hook (es incondicional en `SettingsClient`) pero son dinámicas por el mismo motivo, y así T-1 queda con **diff cero** en las tres. Dejarlo escrito en un comentario de `SettingsClient` y en un gate que afirme que las tres siguen llamando a `createClient()`.
- `window.location` en un efecto queda **descartado** para el valor del tab (flash + dos fuentes de verdad). Se mantiene sólo para la lectura one-shot del OAuth (Patrón 4).

### Patrón 6: el cambio en `settings-client.tsx` es CONTENIDO a L992-1021 y L2398

```ts
// PROPUESTA [ASSUMED: nombres de lib/panel-tabs.ts]
const searchParams = useSearchParams()
const grupo = isNegocio ? TABS_NEGOCIO : isSection ? null : TABS_CONFIG
const tabEnLaUrl = searchParams.get(TAB_PARAM)
const vueltaDeOAuth = isNegocio && (searchParams.get('mp') !== null || searchParams.get('google') !== null)
const resuelto = grupo === null ? null : resolveTab({ grupo, param: tabEnLaUrl })
// T-1: la rama de las secciones queda TEXTUALMENTE como hoy (SECTION_TAB[view] y onTabChange undefined).
const tabValue = grupo === null ? SECTION_TAB[view] : vueltaDeOAuth ? 'integraciones' : resuelto!.value
const onTabChange = grupo === null ? undefined : (value: unknown, detalles: { reason: string }) => {
  if (detalles.reason !== 'none') return          // nunca un push que no venga de un toque/tecla
  const to = tabSlug({ grupo, value })            // default ⇒ null
  applyPanelView({ cause: panelTabCause({ from: resuelto!.slug, to }), param: TAB_PARAM, from: resuelto!.slug, to })
}
```
Más el efecto de reconciliación copiado de `clients-client.tsx:684-724` (con `sanitizeAction` + `reconciledMemo` + ref) gateado por `grupo !== null && !vueltaDeOAuth`. Se borran `configTab`/`setConfigTab`/`negocioTab`/`setNegocioTab` (gate: no sobrevive ninguna segunda fuente de verdad, molde del caso (g) de `test/panel-history-clients.test.ts:195-205`). `SECTION_TAB` no se toca.

Finanzas es lo mismo con `grupo = TABS_FINANZAS` y `txTab` = `resuelto.value`: las líneas 1014-1015 **no cambian de forma** (siguen leyendo `txTab`), y por eso el criterio 4 sale por construcción: el botón sigue al valor resuelto de la URL en entrada directa y en el atrás.

### Patrón 7: `lib/panel-tabs.ts` — la lista cerrada (D-05/D-07)

```ts
// PROPUESTA [ASSUMED: forma]. Slugs de D-05 (CONTEXT) → valores internos VERIFICADOS arriba.
export const TAB_PARAM = 'tab'
export type PanelTabGroup = { porDefecto: string; slugs: ReadonlyMap<string, string> } // slug → valor
export const TABS_NEGOCIO: PanelTabGroup = { porDefecto: 'business',
  slugs: new Map([['datos', 'business'], ['cobros', 'cobros'], ['integraciones', 'integraciones'], ['notificaciones', 'notificaciones']]) }
export const TABS_CONFIG: PanelTabGroup = { porDefecto: 'appearance',
  slugs: new Map([['apariencia', 'appearance'], ['seguridad', 'seguridad'], ['suscripcion', 'suscripcion']]) }
export const TABS_FINANZAS: PanelTabGroup = { porDefecto: 'appointments',
  slugs: new Map([['turnos', 'appointments'], ['ventas', 'sales'], ['egresos', 'expenses']]) }
```
`resolveTab` devuelve `{ value, slug }` con `slug = null` para el default; un `?tab=datos` resuelve `value: 'business', slug: null` y por eso `resolveViewParam` lo sanea. ⚠ **`Map` (o `Object.hasOwn`), nunca un objeto literal indexado**: `?tab=constructor` o `?tab=__proto__` sobre `{…}[param]` devuelve una propiedad de `Object.prototype` (truthy) ⇒ el `<Tabs>` recibe una función como `value` ⇒ **pantalla vacía**, justo lo que D-07 prohíbe.

### Anti-Patterns to Avoid

- **`router.push`/`<Link>` para cambiar de tab:** re-render en el server de una página que lee secretos, props nuevas, marcas borradas (ver Alternatives).
- **`{ ...window.history.state, frjView }`:** rama temprana del parche, `useSearchParams` no se entera, cero errores [VERIFIED: app-router.js:255].
- **Escribir historial desde el efecto del render con causa `user-open`:** sería un push sin activación ⇒ Chrome lo saltea en el atrás (memoria del repo, plan 03-12). La única fuente de `push` es el handler del toque.
- **Mantener el `useState` "por las dudas" al lado de la URL:** dos fuentes de verdad, el atrás vuelve a mentir.
- **Reusar `frjUnder`/`frjOverlay`/`frjDirty`/`frjExit` para el tab**, o meter `frjView` en `isForeignOwnedEntry`: la regla 0 dejaría de escribir sobre cualquier subsección.
- **Copiar el `frjUnder` de la sección en la entrada del tab "para que la barra lo vea":** miente (lo que queda debajo del tab es la sección, no Más), y `up`/colapso retrocederían a la sección y abortarían su segundo paso (`branchSecondStep` exige estar parado en Más [VERIFIED: lib/panel-branch.ts:105]).

## ⚠ La composición con la Phase 3 — el riesgo que el plan tiene que decidir

**Todas las pilas de esta sección están DERIVADAS DEL CÓDIGO, no medidas** (ningún escenario `E-1..E-18` tiene una subsección arriba [VERIFIED: .planning/debug/pila-de-dos-niveles-medida.md, índice de secciones]). Notación: `{U:x}` = `frjUnder: x`, `{V}` = `frjView: 'tab'`.

| # | Recorrido (mobile, se entra por Más) | Sin tab (Phase 3, verificado) | Con la entrada del tab arriba (derivado) | ¿Regresión? |
|---|---|---|---|---|
| C-1 | `Más → Negocio → Cobros → atrás → atrás → atrás` | — | `[/dashboard,/mas,/negocio{U:/mas},/negocio?tab=cobros{V}]` → Datos → Más → Inicio | ✅ criterio 1 se cumple tal cual |
| C-2 | `… → Cobros → toca Inicio` (barra) | colapso + doble consumo ⇒ `[/dashboard]`, aviso de salida se arma | `masDebajo`/`raizDebajo` **falsos** (la entrada de arriba es la del tab) ⇒ `panelNavMode` = `push` ⇒ `[…,/negocio?tab=cobros,/dashboard{U:/negocio}]`; la séptima regla del armado (`algoNuestroDebajo`) **no arma** el aviso | ❌ **vuelve el síntoma de `G2-1`** |
| C-3 | `… → Cobros → toca Turnos` | colapso ⇒ `[/dashboard,/appointments]` | `replace` cae sobre la entrada del tab ⇒ `[/dashboard,/mas,/negocio{U:/mas},/appointments]`: atrás → Negocio → Más → Inicio | ❌ dos escalones de más |
| C-4 | `… → Cobros → toca Más` | `up` ⇒ vuelve a Más | `push` ⇒ `[…,/negocio?tab=cobros,/mas]` | ❌ apila en vez de subir |
| C-5 | desktop: `Inicio → Negocio (sidebar) → Cobros → Finanzas (sidebar)` | `replace` ⇒ `[/dashboard,/finances]` | `[/dashboard,/negocio{U:/dashboard},/finances]`: atrás desde Finanzas cae en **Negocio** | ❌ rompe el invariante de NAV-07 ("el atrás cae en el dashboard") |
| C-6 | desktop: `… → Cobros → Inicio (sidebar)` | `push` (residuo de escritorio ya declarado) | `push` | igual que hoy |

**Las tres son degradación segura** (la pila queda más larga, **nunca** una expulsión: sin el hecho la regla 0 de `panelBranchPlan` no retrocede [VERIFIED: lib/panel-history.ts:701-702]). **Y el hueco ya existe hoy para la ficha de clientes** (`Inicio → Clientes → ficha A → toca Inicio` ⇒ `push` con la ficha debajo), sin declarar en ningún documento (grep de esta sesión sobre `.planning/`). Los tabs lo vuelven el caso **común**: en mobile se llega a estas tres secciones *sólo* por Más, y desde ahí el siguiente toque natural es la barra.

### Opción A — aceptar y declarar (cero cambios en los módulos de la Phase 3)
Costo: C-2..C-5 quedan como están, declarados con fecha (molde de "EL RESIDUO DEL CAMINO DEL GUARD" y del "RESIDUO DE ESCRITORIO" del documento de debug). Riesgo de regresión: **nulo** en lo ya verificado. Costo de UX: el dueño vuelve a ver, por otro camino, exactamente lo que reportó en `G2-1` ("la guarda de salir no está") y lo que pidió en julio (NAV-07).

### Opción B1 — cerrar el hueco en la barra (RECOMENDADA), declarar el de escritorio
Un **séptimo miembro** de `PanelBranchPlan`, p. ej. `'consume-view-then-navigate'` [ASSUMED: nombre], producido cuando hay una subsección **nuestra** arriba (`panelViewEntryParam(estado) !== null && !isForeignOwnedEntry(estado)`) y el destino es **otra** ruta (el caso `from === to` sigue siendo de NAV-08, que va antes en el `onNavigate` — mutuamente excluyentes por construcción, igual que hoy). Ejecutor: el **mismo molde** que `consume-exit-then-navigate` [VERIFIED: lib/panel-branch.ts:367-389] — listener `popstate` de disparo único enganchado en el gesto + `consumeOwnedPanelEntry()`; en el segundo paso, **re-leer** el estado (ahora la entrada de la sección, con su `frjUnder`) y **re-decidir** `panelBranchPlan` con los hechos reales; `push`/`replace` ⇒ navegación pedida en estado y ejecutada desde un commit (lección 3), con la propagación de la marca por el canal existente si es `replace` (cumple "SÓLO LLENA ESTE CANAL QUIEN *LEYÓ* LA ENTRADA DE ABAJO" [VERIFIED: lib/panel-branch.ts:159]); `up`/colapso ⇒ retroceso desde el evento (precedente medido en E-5 para el segundo consumo; **el tercero encadenado no está medido**). Toca: `panelBranchPlan` (un hecho nuevo **sin default**, como los otros tres), `runBranchNavigation`, `handleNavigate`, el `switch` exhaustivo del guard (`components/dashboard/unsaved-changes-guard.tsx:241-261`, que lo deriva a `runBranchNavigation`), los candados estáticos del orden del `onNavigate` (`test/panel-nav-chrome.test.ts:251-262`) y la suite `test/panel-branch.test.ts`. **Cierra también el hueco de la ficha `?c=`.** C-5 (escritorio) queda **declarado**: el sidebar no tiene el hook, y dárselo arrastra la regla `-1c` a escritorio (cambia MOB-07).

### Opción B2 — B1 + el sidebar
Lo mismo cableado también en el sidebar. No recomendada en esta fase: obliga a una segunda instancia de `usePanelBranch` o a un contexto nuevo, y reabre la enmienda de MOB-07.

**Recomendación:** **B1**, como **plan propio en una ola posterior** a los tabs (los tabs funcionan y pasan el criterio 1 sin ella — C-1), con sus escenarios nuevos en la sonda **antes** de escribir el ejecutor y la UAT en teléfono. ⚠ **Es una decisión del dueño, no técnica:** amplía la fase sobre código que costó tres rondas de UAT. El planner la trae como `checkpoint:decision` antes de comprometer el plan; si el dueño elige A, el residuo se escribe en los cuatro lugares que la Phase 3 usó (docblock, debug doc, precisión del requisito, `.planning/WINDOWS.md`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Decidir push/replace/consume del tab | Un `if` en el handler de cada pantalla | `panelHistoryAction` + `panelTabCause` | Criterio 5 / NAV-05: un solo dialecto, testeado puro |
| Escribir el historial | `window.history.*` en la pantalla | `applyPanelView` | Regla 0, idempotencia, objeto fresco, cicatriz 1 — todo ya está adentro |
| Sanear un `?tab=` inválido | Un efecto ad hoc | `resolveViewParam` + `sanitizeAction` + `reconciledMemo` (molde `clients-client.tsx:684-724`) | Modo estricto, reintento tras overlay, forward a una URL ya saneada (W-2) |
| Tocar la sección activa con un tab abierto (D-08) | Lógica nueva en el sidebar | `consumeOwnedPanelEntry` ya cableado | Genérico por la marca [VERIFIED: lib/panel-history.ts:1004-1006] |
| Leer la query | `window.location` + `useState` | `useSearchParams` | Sin flash en rutas dinámicas; se sincroniza con el parche de Next |
| Esperar el `popstate` de un retroceso | Un `setTimeout` | Listener de disparo único enganchado en el gesto | Lecciones 2 y 3 de `lib/panel-branch.ts:21-38` |

**Key insight:** todo lo difícil del historial ya está resuelto y medido en este repo; la fase **no** inventa mecanismo — mapea tres pantallas al contrato existente y corrige el único punto del ejecutor que el contrato nuevo vuelve peligroso.

## Common Pitfalls

### Pitfall 1: la marca fabricada en un `replace` ⇒ expulsión
**What goes wrong:** URL pegada / OAuth + cambio de tab + Datos (o la sección en el sidebar) ⇒ `history.back()` sobre entrada ajena. **How to avoid:** Patrón 3. **Warning signs:** en la UAT, entrar por URL a `?tab=cobros`, tocar Integraciones y después Datos: si la URL no queda en `/negocio` y la pantalla en Datos, está vivo. En pestaña nueva, el síntoma es un toque que no hace nada.

### Pitfall 2: el barrido crudo del criterio 5 cuenta comentarios
**What goes wrong:** el grep del ROADMAP (`grep -rE 'pushState|replaceState|history\.back'`) es **crudo**: un comentario nuevo que explique "por qué ya no hay un `replaceState` acá" lo pone en rojo con el código correcto. Hoy los tres archivos tienen **cero** comentarios con esos literales. **How to avoid:** los comentarios nuevos en esos tres archivos dicen "la escritura cruda del historial", nunca el nombre del método; y el gate de vitest usa `sinComentarios` (molde `test/panel-history-clients.test.ts:44-49, 180-193`) **además** del grep crudo.

### Pitfall 3: gates de región que miden cero (memoria del repo)
**What goes wrong:** el `recorte()` de las suites arranca en el marcador y balancea **desde la primera llave** [VERIFIED: test/panel-history-clients.test.ts:65-79]. Con `'export function panelTabCause('` como marcador, esa llave es la del **parámetro-objeto** ⇒ la región es sólo la firma ⇒ un gate `= 0` da verde midiendo nada (misma clase que el `sed '/^export function X/,/^}/'` medido el 2026-10-13). **How to avoid:** marcador **después** de la firma (p. ej. `'): PanelViewCause {'`) o cortar hasta `'\n}\n'`; cada gate afirma región no vacía **y** que contiene un literal que sólo está en el cuerpo; correr la mutación (borrar la línea que el gate protege ⇒ tiene que ponerse rojo).

### Pitfall 4: un push sin activación (intervención de historial de Chrome)
**What goes wrong:** una entrada empujada sin activación es salteable por el atrás de la interfaz (medido en plan 03-12). **How to avoid:** `push` sólo desde `onValueChange` con `reason === 'none'` (click/Enter/Space; `activateOnFocus` es `false` por defecto [VERIFIED: node_modules/@base-ui/react/tabs/list/TabsList.d.ts:13-18]). Los cambios automáticos (`'initial'|'disabled'|'missing'`) son de raíces **no controladas** [CITED: TabsRoot.d.ts:41-58], pero se filtran igual. El saneo y el OAuth son `replace` (no agregan entrada). **Warning signs:** cualquier `applyPanelView(... 'user-open' ...)` fuera de un handler de evento.

### Pitfall 5: modo estricto y efectos dobles
**What goes wrong:** en dev el efecto corre, se limpia y corre otra vez. **How to avoid:** el saneo usa `sanitizeAction`/`reconciledMemo` (ya diseñados para eso [VERIFIED: lib/panel-history.ts:768-816]); el efecto del OAuth lee `window.location` (síncrono tras el `replace`) ⇒ la segunda corrida sale temprano y el toast no se duplica. Si se lee del `searchParams` del render, el toast sale dos veces en dev.

### Pitfall 6: la trampa del `__NA`
**What goes wrong:** `{ ...history.state, frjView }` ⇒ URL cambia, `useSearchParams` no, cero errores. **How to avoid:** sólo `panelViewState` (literal fresco); el gate (a) de `test/panel-history-clients.test.ts:243-254` ya lo cubre en el helper.

### Pitfall 7: T-1 por un cambio "inocente" en el par `tabValue`/`onTabChange`
**What goes wrong:** cambiar la forma del ternario mueve las cinco rutas. **How to avoid:** la rama `isSection` (sin grupo) queda **textualmente** `SECTION_TAB[view]` / `undefined`; un gate estático lo afirma; verificación a mano ruta por ruta (criterio 2). No se agrega ninguna `TabsList` (las dos existentes ya están gateadas por `isNegocio` y `!isSection` [VERIFIED: settings-client.tsx:2404, 2414]).

### Pitfall 8: dos escritores en el retorno del OAuth
**What goes wrong:** el efecto del OAuth y la reconciliación genérica escriben en el mismo commit (uno conserva `mp`, el otro lo borra). **How to avoid:** Patrón 4 (la reconciliación se saltea con `mp`/`google` presentes) y un caso de test que afirme el gate.

### Pitfall 9: la composición con la barra (C-2..C-5)
Ver la sección de composición. **Warning signs:** en la UAT, `Más → Negocio → Cobros → Inicio` y mirar la barra de direcciones: sin `#salir` el aviso no está armado (el observable de la Phase 3 [VERIFIED: lib/panel-branch.ts:472-478]).

## Code Examples

### El call site del cambio de tab (Finanzas)
```tsx
// finances-client.tsx — PROPUESTA [ASSUMED: nombres de lib/panel-tabs.ts]
const searchParams = useSearchParams()
const resuelto = resolveTab({ grupo: TABS_FINANZAS, param: searchParams.get(TAB_PARAM) })
const txTab = resuelto.value   // L1014-1015 siguen leyendo `txTab` sin cambios (criterio 4)
...
<Tabs value={txTab} onValueChange={(value: unknown, detalles: { reason: string }) => {
  if (detalles.reason !== 'none') return
  const to = tabSlug({ grupo: TABS_FINANZAS, value })
  applyPanelView({ cause: panelTabCause({ from: resuelto.slug, to }), param: TAB_PARAM, from: resuelto.slug, to })
}}>
```

### Agenda (D-10), sin API nueva
```ts
// agenda-client.tsx L284-290 — la limpieza deja de ser cruda
const g = new URLSearchParams(window.location.search).get('google')
if (!g) return
if (g === 'connected') toast.success('Google Calendar conectado')
else if (g === 'error') toast.error('No se pudo conectar con Google Calendar')
applyPanelView({ cause: 'stale', param: 'google', from: g, to: null })
```

### La página con Suspense (molde verificado)
```tsx
// app/(dashboard)/negocio/page.tsx — copia de app/(dashboard)/clients/page.tsx:42-49
return (
  <Suspense fallback={null}>
    <SettingsClient /* …props de hoy sin cambios… */ view="negocio" />
  </Suspense>
)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tabs en `useState` (se comen el atrás) | Tabs en `?tab=`, decisión en `lib/panel-history.ts` | esta fase | El atrás, la recarga y el link compartido funcionan |
| `replaceState(null, '', ruta)` crudo tras OAuth | `applyPanelView` `replace` con `drop` | esta fase | Una sola forma; el tab sobrevive; params ajenos preservados |
| `frjView` escrito en todo `replace` con valor | `frjView` sólo en `push` o si `holding` | esta fase | Cierra la expulsión latente (clientes) y la frecuente (tabs) |

**Deprecated/outdated:** `export const dynamic = 'force-dynamic'` como forma de forzar dinámico; Next 16 recomienda `connection()` [CITED: use-search-params.md:262]. No aplica acá (las páginas ya son dinámicas por cookies) y no hay que agregarlo.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Las pilas C-1..C-6 son las que produce la app real (derivadas leyendo `handleNavigate`, `panelBranchPlan` y el parche de Next) | Composición | Si difieren, la decisión A/B1 se toma sobre un problema mal descrito ⇒ **medirlas con la sonda antes del checkpoint** |
| A2 | Los nombres `'user-switch'`, `panelTabCause`, `drop`, `lib/panel-tabs.ts`, `resolveTab`, `tabSlug`, `TABS_*`, `TAB_PARAM`, `'consume-view-then-navigate'` | Patrones | Ninguno (son propuestas; el plan los fija) |
| A3 | Un `replaceState` no está sujeto a la intervención de historial de Chrome (no agrega entrada) | Pitfall 4 | Bajo; el saneo y el OAuth no agregan entradas en ningún caso |
| A4 | Base UI controlado nunca emite `onValueChange` con `reason` distinto de `'none'` | Pitfall 4 | Ninguno: el filtro defensivo lo cubre igual |
| A5 | Safari/iOS y Chrome Android se comportan como Chrome de escritorio para `pushState`/`back()` de subsecciones (A11 heredado de la Phase 3) | Validación | Sólo la UAT en teléfono lo cierra |
| A6 | La restauración de scroll al volver de un tab con el atrás no molesta (el traverse conserva `focusAndScrollRef` [VERIFIED: navigation.js:415]) | UAT | Cosmético; mirarlo en la UAT |
| A7 | El dueño prefiere B1 a A (o acepta el costo de ampliar la fase) | Composición | Es la decisión del checkpoint |

## Open Questions

1. **Composición: A, B1 o B2** — Lo que sabemos: el hueco existe y es seguro; lo que no: si el dueño acepta ampliar la fase. Recomendación: medir C-2..C-5 con la sonda, `checkpoint:decision` con B1 recomendada.
2. **Texto de la enmienda de D-01** — el planner escribe el "PRECISADO 2026-11-17" en el criterio 1 del ROADMAP y en MOB-08 (y, si sale B1, una precisión en MOB-04). Recomendación: mismo formato que los de la Phase 3.
3. **¿Se declara el arreglo latente de `/clients` (fusión sobre `?c=` pegada)?** Sí: es un cambio de comportamiento del ejecutor auditado; va en el SUMMARY y en el docblock de `applyPanelView`, con su caso de test.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | vitest, sondas CDP | ✓ | v24.15.0 | — |
| vitest | suites puras | ✓ | 4.1.9 | — |
| `./node_modules/.bin/tsc` | typecheck | ✓ | (del repo) | — (nunca `npx tsc`) |
| `scripts/con-turno.mjs` + `D:/herramientas/turno-pantalla` | toda sonda CDP / browser | ✓ | instalado | se saltea solo con aviso fuera de Windows/CI |
| Chrome headless (sondas) | `panel-back-stack.mjs`, `panel-exit-en-la-app.mjs` | ✓ (usado en la Phase 3; Chrome/155) | — | — |
| OAuth real de MercadoPago | criterio 3 | ✗ en local ("en local MP no vuelve") | — | verificar en staging/prod (como el 3.4 de la Phase 3) |

**Missing dependencies with no fallback:** ninguna para construir; el criterio 3 sólo se cierra en staging/prod.

## Validation Architecture

> `workflow.nyquist_validation` está en `false` en `.planning/config.json`; la sección se incluye porque el orquestador la pidió explícitamente.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.9, `environment: 'node'`, proyecto `pure` (sin DOM, sin paquetes nuevos) |
| Config file | `vitest.config.mts` (proyectos `pure`/`db`; todo archivo nuevo cae en `pure` solo) |
| Quick run command | `./node_modules/.bin/vitest run --project pure lib/panel-history.test.ts test/panel-branch.test.ts test/panel-history-clients.test.ts test/panel-history-sidebar.test.ts test/panel-nav-chrome.test.ts` (baseline de esta sesión: **7 archivos / 550 tests verdes** contando `dirty-history` y `overlay-history`, 1.16 s) |
| Full suite command | `./node_modules/.bin/vitest run --project pure` + `./node_modules/.bin/tsc --noEmit` + `npm run lint` + `npm run build` |
| Sondas | `node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs` (pila, página estática) y `.../panel-exit-en-la-app.mjs` (app real, único gesto que respeta la intervención: `chrome.tabs.goBack`) |

⚠ Canarios de reloj de la suite (memoria del repo): dos tests fallan a propósito fuera de [01:00, 23:30] AR — mirar el reloj antes de culpar al cambio (no están en las suites de historial).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MOB-08 | `panelTabCause` (3 ramas) + `'user-switch'` → `replace` + exhaustividad | unit puro | `vitest run --project pure lib/panel-history.test.ts` | ✅ (casos nuevos) |
| MOB-08 | La marca del `replace`: push marca; replace con holding conserva; replace sin holding **no** fabrica (con `vi.stubGlobal('window', …)`, molde `lib/panel-history.test.ts:994-998`) | unit con `window` stub | idem | ✅ (casos nuevos) |
| MOB-08 | `panelViewUrl`/`applyPanelView` con `drop` (borra `mp` y `google`, preserva el resto, nunca deja `?` colgando) | unit | idem | ✅ |
| MOB-08/09 | `resolveTab` por grupo: válido, default explícito (`datos`→slug null), vacío, de otro grupo (`ventas` en Negocio), mayúsculas, `constructor`/`__proto__` | unit | `vitest run --project pure test/panel-tabs.test.ts` | ❌ Wave 0 |
| MOB-08 | Simulador de pila (molde `lib/panel-history.test.ts:562` "el invariante, simulado sobre la pila"): `Datos→Cobros→Integraciones→Cobros→atrás` ⇒ Datos; D-02 (Datos consume); D-03 (URL pegada: atrás sale); OAuth + Datos ⇒ **no** consume | unit (simulación) | idem | ❌ Wave 0 |
| MOB-08 | Gates estáticos (con `sinComentarios` + `recorte` con marcador seguro): cero escritura cruda en los 3 archivos; no sobreviven `setConfigTab`/`setNegocioTab`/`setTxTab`; rama de secciones textual (`SECTION_TAB[view]`, `undefined`); Suspense en las 3 páginas con tabs; las 3 páginas de sección siguen llamando a `createClient()` y no cambian `view=`; el handler filtra `reason`; ningún `router.push`/`router.replace` con `tab` | estático | `vitest run --project pure test/panel-tabs-cableado.test.ts` | ❌ Wave 0 |
| MOB-08 | OAuth: el efecto llama a `applyPanelView` con `'integraciones'` y `drop`; Agenda con `'stale'` y `param: 'google'` | estático | idem | ❌ Wave 0 |
| MOB-08/09 | Pilas reales de C-1..C-6 (+ entrada directa, OAuth simulado) **antes** del checkpoint de composición | sonda CDP | `node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs` (escenarios nuevos `E-19+`) | ❌ (escenarios nuevos) |
| MOB-08 | Retorno real del OAuth (`?mp=connected`/`?mp=error`/`?google=connected`) | manual | staging/prod | manual-only (MP no vuelve en local) |
| MOB-08/09 | Las 5 rutas + Finanzas, por Más y por el sidebar, con atrás y URL pegada; overlays de esas pantallas; aviso de Agenda | manual (UAT teléfono + desktop) | — | manual-only (A5/A11) |

**Mutaciones obligatorias** (cada una tiene que poner algo en rojo; si no, el gate mide cero): (1) volver a `panelViewState(param, to)` sin `holding` ⇒ rojo el caso "replace sin holding no fabrica"; (2) `case 'user-switch': return 'push'` ⇒ rojo el simulador D-01; (3) quitar `drop` del OAuth ⇒ rojo el gate del efecto; (4) reintroducir un `useState` de tab ⇒ rojo el caso de segunda fuente de verdad; (5) cambiar `isSection ? undefined` ⇒ rojo el gate de T-1.

### Sampling Rate
- **Per task commit:** quick run de arriba + `./node_modules/.bin/tsc --noEmit`.
- **Per wave merge:** suite `pure` completa + lint.
- **Phase gate:** suite verde + `npm run build` + sonda por el turno + UAT en teléfono real (el pipeline verde no es evidencia en este workstream: tres rondas de UAT lo probaron).

### Wave 0 Gaps
- [ ] `test/panel-tabs.test.ts` — `resolveTab`/`tabSlug` y el simulador de pila de tabs
- [ ] `test/panel-tabs-cableado.test.ts` — gates estáticos de las tres pantallas, las cinco páginas y Agenda
- [ ] Escenarios nuevos en `.planning/debug/probes/panel-back-stack.mjs` para C-1..C-6 (esperado escrito **antes** de medir, molde de la Phase 3)

## Security Domain

`security_enforcement: true`, ASVS nivel 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (sin cambios) | `supabase.auth.getUser()` en cada `page.tsx` |
| V3 Session Management | no | — |
| V4 Access Control | sí (sin cambios) | `business` por `.eq('owner_id', user.id)` **antes** de cualquier render [VERIFIED: negocio/page.tsx:13, settings/page.tsx:12-16, finances/page.tsx:10-14]; `getBusinessSecrets(business.id)` server-side [VERIFIED: negocio/page.tsx:21, settings/page.tsx:23]. El tab **nunca** llega al server (no se agrega `searchParams` a ninguna página) ⇒ no puede elegir qué se lee |
| V5 Input Validation | **sí** | `?tab=` validado contra la **lista cerrada** del grupo con `Map`/`Object.hasOwn` (no `obj[param]`); cualquier otro valor ⇒ default + `replace` (D-07). El valor sólo se **compara**, nunca se renderiza ni se interpola en HTML/URL de navegación |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prototype-key en el mapa de tabs (`?tab=__proto__`/`constructor`) ⇒ pantalla vacía | Denial of Service (self) | `Map`/`Object.hasOwn`, caso de test |
| `history.back()` sobre entrada ajena por marca fabricada ⇒ expulsión / atrás muerto | Denial of Service (self), Tampering del historial | Patrón 3 + doble guarda de `consumeOwnedPanelEntry` (ya existe) |
| Escribir sobre la entrada de otro dueño (overlay/guard/sentinel) | Tampering | Regla 0 de `applyPanelView` (ya existe; los tabs la heredan) |
| Open redirect por el retorno del OAuth | Spoofing | Sin cambios: el backend elige el destino de una lista cerrada (`'negocio'|'agenda'`) [VERIFIED: google/connect/route.ts:12-13, google/callback/route.ts:15]; el cliente sólo limpia la query |
| Tab como oracle cross-tenant | Information Disclosure | No aplica: Finanzas carga las tres listas por `businessId` del dueño y el tab sólo elige cuál se muestra; Negocio/Config reciben los secretos ya resueltos |

## Sources

### Primary (HIGH confidence — leídos en esta sesión)
- `lib/panel-history.ts` (1067 líneas, completo) — contrato, ejecutor, regla 0, NAV-08, rama
- `lib/panel-branch.ts` L1-520 y L1300-1987 — `branchCarryMark`, `runBranchNavigation`, `usePanelBranch`/`handleNavigate`, efecto de marcado
- `app/(dashboard)/settings/settings-client.tsx` L1-40, 915-1029, 2380-2424, 3836-3850; `finances-client.tsx` L195-205, 1000-1030; `agenda-client.tsx` L270-300; `clients-client.tsx` L630-775; las 5 `page.tsx` de `SettingsClient`, `finances/page.tsx`, `clients/page.tsx`
- `components/dashboard/panel-bottom-nav.tsx`, `sidebar.tsx`, `app/(dashboard)/mas/mas-client.tsx`, `unsaved-changes-guard.tsx` (cableado)
- `app/api/mercadopago/{callback,connect}/route.ts`, `app/api/google/{callback,connect}/route.ts`
- `node_modules/next/dist/client/components/app-router.js` L44-96, 230-320; `segment-cache/navigation.js` L395-420
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`; `01-app/01-getting-started/04-linking-and-navigating.md` L320-360
- `node_modules/@base-ui/react/tabs/{root/TabsRoot,list/TabsList}.d.ts`
- `test/panel-history-clients.test.ts`, `test/panel-branch.test.ts` (cabecera), `lib/panel-history.test.ts` (índice), corrida de vitest (550/550)
- `.planning/debug/pila-de-dos-niveles-medida.md` (índice E-1..E-18, método, límites), ROADMAP §Phase 4, REQUIREMENTS (MOB-07/08/09), 04-CONTEXT

### Secondary (MEDIUM)
- Memorias del repo: gates de región que miden cero; intervención de historial de Chrome y gestos CDP

### Tertiary (LOW)
- Ninguna fuente web: todo el dominio es código propio + Next instalado

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no hay stack nuevo; todo verificado en el código instalado
- Architecture (mapeo de tabs al helper, marca del `replace`, OAuth, T-1): HIGH — leído y razonado sobre las líneas citadas
- Composición con la Phase 3: MEDIUM — derivada del código; **no medida** (A1)
- Pitfalls: HIGH — cada uno con su línea o su medición previa del repo

**Research date:** 2026-11-17
**Valid until:** mientras `lib/panel-history.ts`, `lib/panel-branch.ts` y Next 16.2.7 no cambien (estable; revalidar si se toca cualquiera de los dos módulos)
