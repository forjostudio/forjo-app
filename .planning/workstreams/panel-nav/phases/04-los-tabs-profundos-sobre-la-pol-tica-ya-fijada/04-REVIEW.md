---
phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
reviewed: 2026-11-17T20:44:17Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - app/(dashboard)/agenda/agenda-client.tsx
  - app/(dashboard)/finances/finances-client.tsx
  - app/(dashboard)/finances/page.tsx
  - app/(dashboard)/negocio/page.tsx
  - app/(dashboard)/settings/page.tsx
  - app/(dashboard)/settings/settings-client.tsx
  - components/dashboard/unsaved-changes-guard.tsx
  - lib/panel-branch.ts
  - lib/panel-history.ts
  - lib/panel-tabs.ts
  - lib/panel-history.test.ts
  - lib/unsaved-changes.test.ts
  - test/panel-branch.test.ts
  - test/panel-history-clients.test.ts
  - test/panel-tabs.test.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-11-17T20:44:17Z
**Depth:** standard (diff `85c99ae^..HEAD`; de `settings-client.tsx` sólo las regiones cambiadas y lo que tocan)
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Revisé la migración de los tres grupos de tabs a `?tab=`, el retorno del OAuth (D-09/D-10), la regla
`-1d` / `consume-view-then-navigate` (B1) y el cambio de `applyPanelView` («un reemplazo no fabrica la
propiedad»). La política pura (`panelTabCause`, `resolveTab`, `tabSlug`, la regla `-1d`) está bien y la
cubren sus tests. El aislamiento por tenant no se toca: el valor de `?tab=` sólo elige qué
`TabsContent` se muestra y ninguna página lee `searchParams`. No encontré ningún BLOCKER.

Los defectos están en la frontera con el runtime, no en la política:

1. **obs-1 tiene una causa plausible y rastreada en el código de Next** (WR-01): el
   `<Suspense fallback={null}>` nuevo de `finances/page.tsx` deja sin consumir el scroll pendiente de la
   navegación que entra a la página. La primera actualización de estado del router, que es el
   `ACTION_RESTORE` del primer toque de tab, lo ejecuta.
2. Los handlers de tab toman el `from` del render y no de la URL real (WR-02). Si se toca dos veces
   antes de que la transición termine, se empujan entradas duplicadas.
3. El predicado `vueltaDeOAuth` y el efecto del OAuth no coinciden (WR-03). En dos URLs los tabs de
   Negocio quedan clavados en Integraciones, y el «borde aceptado» del comentario describe mal lo que
   pasa.
4. Con una marca `frjView` que sobrevive a una recarga, B1 retrocede a un documento distinto y pierde
   su segundo paso (WR-04; hay que medirlo).

Los residuos que el dueño ya aceptó (C-5, `R-G3-10`, D-03 y la deuda vieja de eslint) no se reportan.
Ninguno de los hallazgos los empeora.

## Warnings

### WR-01: obs-1. El `<Suspense fallback={null}>` deja pendiente el scroll de la navegación de entrada, y el primer toque de tab lo dispara

**File:** `app/(dashboard)/finances/page.tsx:26` (y lo mismo en `app/(dashboard)/negocio/page.tsx:31` y `app/(dashboard)/settings/page.tsx:44`)

**Issue:** Encontré una causa plausible para obs-1, rastreada en el código de Next 16.2.7 que tiene
el repo. No la medí.

- `InnerScrollAndFocusHandlerOld` (`node_modules/next/dist/client/components/layout-router.js:126-197`)
  aplica el scroll de una navegación **una sola vez**: pone `scrollRef.current = false` (L162) recién
  cuando encuentra un nodo del DOM. Si `findDOMNode(this)` no devuelve un `Element` (L142-144), **sale sin
  consumir** («It'll be handled higher-up») y el ref queda en `current: true`.
- En una navegación blanda a `/finances` (sidebar, Más, la barra), los cache nodes nuevos (`finances`
  y `__PAGE__`) reciben un `scrollRef: { current: true }` compartido (`ppr-navigations.js:311-322`,
  `accumulateScrollRef`).
- **Lo que agrega la fase:** el `<Suspense fallback={null}>` de `page.tsx` es un boundary **nuevo**.
  React muestra el fallback de un boundary que se monta por primera vez aunque esté adentro de una
  transición. La referencia al módulo cliente de `FinancesClient` es un lazy de Flight. Si su chunk
  todavía no se cargó (primera visita de la sesión), el lazy suspende **en ese boundary** y la página
  hace commit con `null`. El handler corre su `componentDidMount` sin DOM debajo, no consume el ref, y
  el ref del nivel `finances` (que comparte el mismo objeto) tampoco encuentra nodo. Antes de la fase no
  había boundary dentro de la página: la suspensión subía por encima del handler, la transición
  retenía la UI vieja y el handler se montaba con el DOM ya presente, así que consumía el ref.
- Cuando el chunk llega, el subárbol se resuelve **sin** re-renderizar el handler (es un componente de
  clase más arriba), así que el ref sigue pendiente. `reuseSharedCacheNode` lo arrastra
  (`ppr-navigations.js:517-519`).
- **El primer toque de tab** llama a `pushState` (`applyPanelView`). El parche de Next despacha
  `ACTION_RESTORE` (`app-router.js:237-262`), el layout-router se re-renderiza, corre
  `componentDidUpdate` y luego `handlePotentialScroll`. Como el ref sigue en `true` y el `div` de
  arriba de Finanzas está fuera del viewport, ejecuta `htmlElement.scrollTop = 0` (L181) y recién
  ahí lo consume. Por eso **los toques siguientes no scrollean**.
- **Por qué Negocio y Configuración no lo muestran:** el mecanismo es el mismo (también tienen el
  boundary nuevo), pero su `TabsList` está arriba de todo (`settings-client.tsx:2511-2527`). Al tocar un
  tab el borde superior del contenido ya está en el viewport y `topOfElementInViewport` sale antes
  (L174). En Finanzas los tabs están debajo de los KPIs y los gráficos (`finances-client.tsx:1088`), así
  que para tocarlos hay que haber scrolleado.
- **Predicciones para confirmarla:** (a) entrando con una **recarga dura** de `/finances` no pasa,
  porque la hidratación no asigna `scrollRef` (`create-initial-router-state.js:132`); (b) volviendo a
  entrar a Finanzas en la misma sesión (con el chunk ya cargado) no pasa; (c) en Negocio pasa si
  primero se scrollea hacia abajo de forma que el `h1` quede fuera de pantalla y recién después se
  toca un tab.

Ojo: el gate `test/panel-tabs.test.ts:400` (`expect(pagina).toContain('<Suspense fallback={null}>')`)
y el caso (e) de la L530 fijan **literalmente** la causa probable.

**Fix:** que el boundary tenga un nodo del DOM mientras suspende, así el handler consume el scroll en
el montaje, como antes de la fase. Por ejemplo, en las tres páginas:
```tsx
<Suspense fallback={<div className="space-y-6 max-w-5xl" aria-busy="true" />}>
  <FinancesClient businessId={business.id} />
</Suspense>
```
La alternativa es sacar el `<Suspense>` de `finances/page.tsx`. La ruta es dinámica por `cookies()`, así
que `useSearchParams` no lo exige en el build. Cualquiera de las dos obliga a ajustar el gate de la
L400 y el caso (e). Antes de cerrar, hay que medirlo con CDP (bajo el turno de pantalla): entrar
por el sidebar en una sesión nueva, scrollear hasta los tabs y registrar `scrollY` antes y después del
primer toque, con y sin el fix. `/clients` tiene el mismo patrón desde v0.30 (latente, fuera de
alcance).

### WR-02: el handler del tab decide con el `from` del render y no con la URL real. Un doble toque empuja entradas duplicadas

**File:** `app/(dashboard)/finances/finances-client.tsx:275-281`, `app/(dashboard)/settings/settings-client.tsx:1029-1036`

**Issue:** `alElegirTab` pasa `from: tabResuelto.slug`, que sale de `useSearchParams()` en el
**último render que hizo commit**. Pero el tab no cambia hasta que se procesa el `ACTION_RESTORE`, y el
parche lo despacha adentro de `startTransition` (`app-router.js:240`). `window.location` cambia
síncrono, `searchParams` no. Mientras tanto el `<Tabs>` controlado sigue con el valor viejo, así que
Base UI vuelve a llamar a `onValueChange` (`TabsList.js:79-83` sólo compara contra el `value` del
prop). Lo que sale:

- **Doble toque en Ventas** (lo normal en mobile cuando la UI no responde enseguida, y Finanzas
  re-renderiza gráficos de recharts): el primer toque hace `push` de `?tab=ventas`. El segundo ve todavía
  `from: null`, causa `user-open`, `from !== to`, y hace **otro `push`** de `?tab=ventas`. Queda Ventas
  arriba de Ventas, que es la «entrada basura» que D-02 y la Phase 3 prohíben, y el atrás necesita dos
  toques. La regla 2 («tocar el tab activo no escribe nada») sólo vale si el render está al día.
- **Ventas y Egresos rápido:** dos `push` en vez de `push` más `replace`. El atrás desde Egresos cae en
  Ventas, no en Turnos (viola D-01).
- **Doble toque en Turnos desde un tab propio:** si el segundo toque llega antes de que el navegador
  procese el primer `back()`, `holding` sigue en `true` y se hace un **segundo `back()`**, que saca al
  dueño de la sección o del sitio si `/finances` era la primera entrada. La ventana es corta (de
  milisegundos) y el patrón ya existía en el «Volver» de clientes, pero acá el gesto es un toque de tab
  y el doble toque es más común.

**Fix:** que el `from` salga de la URL real en el momento del toque, que es lo único que `pushState`
actualiza síncrono:
```ts
function alElegirTab(value: unknown, detalles: { reason: string }): void {
  if (detalles.reason !== 'none') return
  const destino = tabSlug({ grupo: TABS_FINANZAS, value })
  if (!destino.ok) return
  // La URL de AHORA, no la del último commit: entre un toque y el commit del restore pueden pasar
  // cientos de ms y un segundo toque decidiría sobre un `from` viejo.
  const from = resolveTab({ grupo: TABS_FINANZAS, param: new URLSearchParams(window.location.search).get(TAB_PARAM) }).slug
  const to = destino.slug
  applyPanelView({ cause: panelTabCause({ from, to }), param: TAB_PARAM, from, to })
}
```
(Lo mismo en settings con `grupoDeTabs`.) Para el doble `back()`, alcanza con una guarda chica: una
ref «consumo en vuelo» que se limpia en el próximo `popstate`. Conviene agregar al simulador de pila
de `test/panel-tabs.test.ts` un caso de «dos toques antes del commit» que hoy daría rojo.

### WR-03: con `?mp=`/`?google=` que el efecto del OAuth no limpia, los tabs de Negocio quedan muertos, clavados en Integraciones

**File:** `app/(dashboard)/settings/settings-client.tsx:1013`, `:1042`, `:1106-1113`, `:1127`

**Issue:** En el render, `vueltaDeOAuth` vale `true` con `searchParams.get('mp') !== null` (L1013) y,
mientras lo vale, fuerza `tabValue = 'integraciones'` (L1042) y **apaga** la reconciliación (L1066).
Sólo el efecto del OAuth puede limpiar esos params, pero tiene otros criterios y corre **una sola vez**
(deps `[isNegocio]`):

- **`/negocio?mp=` o `?google=` vacíos:** el render los ve (`'' !== null`), pero el efecto sale en
  `if (!mp && !google) return` (L1113) porque `''` es falsy. Nunca se limpian.
- **`/negocio?tab=integraciones&mp=connected`:** el efecto llama a `applyPanelView` con
  `from === to === 'integraciones'`, la regla 2 devuelve `'none` y **no escribe nada**, así que
  `mp` queda en la URL.

En los dos casos, cualquier toque de tab escribe la URL (`alElegirTab` no pasa `drop`, así que `mp`
sobrevive), pero la pantalla sigue en Integraciones porque `vueltaDeOAuth` sigue en `true`. **Los
cuatro tabs quedan muertos** y además se van apilando entradas (`?mp=…&tab=cobros` con `push`, etc.).
El comentario de la L1106 («la query queda hasta el próximo toque») **no describe lo que pasa**: el
próximo toque no la limpia. Hoy ningún callback emite esas URLs (los `redirect` de
`app/api/mercadopago/callback/route.ts` y `app/api/google/callback/route.ts` mandan `?mp=connected|error`
sin `tab`), así que sólo se llega pegando o guardando la URL. Pero el residuo es peor que el declarado.

**Fix:** un solo predicado para los dos lados, y que el efecto limpie aunque la vista ya sea la pedida:
```ts
// render
const mpParam = searchParams.get('mp'), googleParam = searchParams.get('google')
const vueltaDeOAuth = isNegocio && (!!mpParam || !!googleParam)
// efecto: si from === 'integraciones', igual hay que borrar mp/google
const desde = params.get(TAB_PARAM)
applyPanelView({
  cause: 'programmatic', param: TAB_PARAM,
  from: desde === 'integraciones' ? null : desde,   // fuerza la escritura del drop
  to: 'integraciones', drop: ['mp', 'google'],
})
```
(Otra opción es que `alElegirTab` pase también `drop: ['mp', 'google']` cuando `isNegocio`, así el primer
toque sana la URL.) Si se elige la primera opción, hay que verificar que `from: null` no cambie la
decisión: `programmatic` reemplaza siempre, así que es seguro. Y corregir el comentario de la L1106.

### WR-04: B1 (`consume-view-then-navigate`) pierde su segundo paso si la marca `frjView` sobrevivió a una recarga

**File:** `lib/panel-branch.ts:405-422`, `:2028-2051`; `lib/panel-history.ts:1146-1152`

**Issue:** `history.state` sobrevive a una recarga, así que una entrada `/negocio?tab=cobros` empujada
por nosotros sigue marcada `{ frjView: 'tab' }` después de F5. Pero en Chrome la entrada de abajo
(`/negocio`) pertenece al documento **anterior** a la recarga, porque la recarga le asigna otra
secuencia de documento a la entrada actual. Entonces el `history.back()` de `consumeOwnedPanelEntry`
es un recorrido **entre documentos**: carga `/negocio` de cero y **no** dispara `popstate` en este
documento. En el gesto de la barra (recargar con un tab abierto y después tocar Inicio, Turnos o
Más), `vistaArriba` da `true` y B1 consume. El listener `once` de `segundoPaso` muere con el documento
y `decidirDesdeElAterrizaje` no corre nunca: **el dueño tocó Inicio y termina en Negocio/Datos**, con
una recarga completa en el medio. Con D-02 (tocar el tab por defecto) el destino sí es el correcto,
pero también con una recarga completa. Es la misma familia de riesgo que el `up` y el colapso de la
Phase 3 (también son un retroceso más `popstate`), pero B1 lo extiende a todos los gestos de la barra
con un tab abierto. Es una derivación: no lo medí.

**Fix:** primero medirlo con CDP: recargar en `/negocio?tab=cobros` (entrado por un toque), tocar
Inicio en la barra y registrar la URL final y si hubo un `load`. Si se confirma, hay dos caminos:
(a) agregar a la marca un identificador del documento (por ejemplo, `frjDoc` con un valor generado una
vez por carga de módulo) y que `panelViewEntryParam`/`isPanelViewEntry` sólo reconozcan como propias
las entradas de **este** documento (una marca de otro documento cuenta como ajena: `replace` en vez de
`consume`); o (b) declararlo como residuo, con fecha, en el mismo lugar que C-5.

## Info

### IN-01: el cuarto hecho (`vistaArriba`) está escrito dos veces, en contra del propio «un dialecto»

**File:** `components/dashboard/unsaved-changes-guard.tsx:219`, `lib/panel-branch.ts:1528`

**Issue:** El comentario del guard dice «con la MISMA expresión que la barra: un dialecto», pero la
expresión está **copiada**, no compartida. `branchStackFacts` existe justamente para que la forma de los
hechos viva en un solo lugar (su docblock lo dice). Si mañana cambia la forma en uno de los dos lugares,
el gate no lo ve.
**Fix:** exportar un predicado `isOwnedViewEntry(estado)` desde `lib/panel-history.ts` (o reusar
`branchStackFacts` para los cuatro hechos en el guard) y usarlo en los dos lugares.

### IN-02: `router.refresh()` sobre `?tab=integraciones` probablemente re-aplica el scroll a arriba

**File:** `app/(dashboard)/settings/settings-client.tsx:2341`, `:2354`

**Issue:** Después del `pushState`, el árbol del router sigue con la clave `__PAGE__` (el restore usa
el árbol viejo, `restore-reducer.js:26`). Un `router.refresh()` (desconectar MP o Google, que se hace
justamente desde Integraciones) trae del server `__PAGE__?{"tab":"integraciones"}`. `matchSegment` da
distinto, se llama a `createCacheNodeOnNavigation` y `accumulateScrollRef` (freshness `RefreshAll`
= 3) asigna un `scrollRef` nuevo: el mismo scroll a arriba de WR-01, después de desconectar. No
re-monta el cliente, porque el `stateKey` no lleva la búsqueda (`layout-router.js:488`). Es una
derivación sin medir y de bajo impacto, porque Integraciones está cerca del borde de arriba.
**Fix:** medirlo junto con WR-01. Si aparece, es aceptable o se puede resolver con un `refresh`
seguido de la restauración del `scrollY`.

### IN-03: Agenda usa `applyPanelView` con `param: 'google'` y la causa `stale`, fuera de la semántica de «vista»

**File:** `app/(dashboard)/agenda/agenda-client.tsx:303`

**Issue:** `google` no es una subsección y la causa `stale` («el valor no resuelve a nada») se estira
para cubrir «limpiar un param de retorno». Funciona: `holding` nunca es `true` para `'google'`, así que
siempre reemplaza. Pero es un uso que el tipo no expresa. Si mañana alguien empuja
`{ frjView: 'google' }`, este saneo pasaría a **consumir**, es decir, un `back()`.
**Fix:** no sirve reusar `applyPanelView` con `drop` y `from === to`, porque la regla 2 lo convierte
en `'none'`. Lo limpio es un helper explícito, `applyPanelQueryCleanup({ drop })`, que siempre
reemplace y aplique la regla 0. Si no, al menos un comentario que fije que `'google'` nunca se marca.

---

_Reviewed: 2026-11-17T20:44:17Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
