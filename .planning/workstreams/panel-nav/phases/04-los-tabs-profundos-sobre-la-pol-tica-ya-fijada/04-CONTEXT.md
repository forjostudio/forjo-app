# Phase 4: Los tabs profundos sobre la política ya fijada - Context

**Gathered:** 2026-11-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Los tres grupos de tabs que hoy viven en `useState` y se comen el atrás pasan a vivir en la **URL**,
consumiendo el helper de historial con la política **ya fijada** por la Phase 3:

- `/negocio` — Datos · Cobros · Integraciones · Notificaciones/Mail (`settings-client.tsx`, `view === 'negocio'`)
- `/settings` — Apariencia · Seguridad · Suscripción (`settings-client.tsx`, `view === 'config'`)
- `/finances` — Turnos · Ventas · Egresos (`finances-client.tsx`), con el botón de alta siguiendo al tab

Sin mover nada en `/servicios`, `/equipo` y `/consultorios` (las otras tres rutas del mismo
`settings-client.tsx`, T-1) y sin que el retorno del OAuth de MercadoPago / Google aterrice en un tab que
el dueño no pidió (T-2). Es **routing**, no arquitectura de información: cero pixel nuevo, cero
componente nuevo, cero migraciones. Requisitos: **MOB-08**, **MOB-09**.

</domain>

<decisions>
## Implementation Decisions

### Cómo se apilan los tabs (la composición con los dos niveles)

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

### Los nombres en la URL

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

### Tocar la sección estando en un tab

- **D-08 — Tocar la sección ACTIVA estando en un tab no-default te lleva al tab por defecto consumiendo la
  entrada del tab** (análogo de NAV-08: tocar el destino activo «sigue cerrando la subsección abierta»).
  Vale para el sidebar de desktop (p. ej. «Finanzas» estando en `?tab=ventas`) y para cualquier punto de
  entrada que apunte a la misma ruta. Entrar a la sección desde **otro** lugar (Más, la barra, el sidebar
  desde otra sección) la abre en el tab por defecto, porque la URL de esos links es la limpia (D-06).
  *(Recomendación tomada por delegación del dueño.)*

### El retorno del OAuth (T-2)

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### El alcance y los criterios
- `.planning/workstreams/panel-nav/ROADMAP.md` § «Phase 4: Los tabs profundos sobre la política ya fijada» — goal, los 5 criterios, fuera de alcance, riesgo (T-1 principal, T-2 silencioso) y verificación (las 5 rutas a mano, por Más y por la barra; OAuth real en staging/prod)
- `.planning/workstreams/panel-nav/REQUIREMENTS.md` — MOB-08, MOB-09 y las trampas T-1..T-7; la enmienda de MOB-07 (D-05 de la Phase 3: sin chequeo de viewport, desktop recibe el mismo comportamiento)

### La política ya fijada (Phase 3) que los tabs no pueden romper
- `.planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-CONTEXT.md` — D-01..D-05 de la Phase 3 (dos niveles, D-02 Más apila, sin viewport)
- `.planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-DECISION-UAT-3.md` — el «camino 1» y sus costos declarados (el aviso de salida de Inicio)
- `.planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-VERIFICATION.md` — qué quedó verificado y cómo (regresión contra esto)
- `.planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-SECURITY.md` — el registro de amenazas de la política (self-DoS por `back()` sobre entrada ajena, etc.)
- `.planning/debug/pila-de-dos-niveles-medida.md` — las pilas medidas por CDP (E-1..E-18): el método de medición a repetir para tab → sección → Más → Inicio

### El mecanismo de v0.30 que se reusa
- `lib/panel-history.ts` — `PanelHistoryAction` (`push|replace|none|consume`), `PanelViewCause` (incl. `filter`, `stale`), `panelHistoryAction`, `panelViewState`, `resolveViewParam`, `applyPanelView`, `panelNavMode`, `panelBranchPlan`, `isForeignOwnedEntry`, `consumeOwnedPanelEntry`
- `app/(dashboard)/clients/clients-client.tsx` (~L661-L767) — el único consumidor actual de `resolveViewParam`/`applyPanelView` (`?c=`): el patrón a copiar
- `lib/panel-branch.ts` — el ejecutor de rama y el sentinel de salida (convive con la entrada del tab)

### Reglas del repo que aplican
- `AGENTS.md` / `CLAUDE.md` — Next 16 (leer `node_modules/next/dist/docs/` antes de asumir; `useSearchParams` + `<Suspense>`), el turno de pantalla (`node scripts/con-turno.mjs`) para toda sonda/browser
- Intocables heredados: `lib/overlay-history.ts`, `lib/dirty-history.ts`, `scripts/con-turno.mjs`, `next.config.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveViewParam` + `applyPanelView` (`lib/panel-history.ts:742`, `:841`): ya resuelven «la URL dice X pero la pantalla muestra Y» y sanean con causa `stale`; base natural para D-07.
- `PanelViewCause = 'filter'` ya existe para «no es un destino, reemplaza» (el `activeLoc` de Agenda, fuera de alcance).
- `<Suspense>` en `app/(dashboard)/layout.tsx:138` (envuelve `plan-banner.tsx`): el patrón del repo para `useSearchParams`.

### Established Patterns
- `settings-client.tsx:992-1002`: `SECTION_TAB` + `isSection`/`isNegocio` + dos `useState` (`configTab` default `'appearance'`, `negocioTab` default `'business'`) → `tabValue`/`onTabChange`. En las secciones (`servicios`/`equipo`/`consultorios`) `onTabChange` es `undefined` y el tab sale de `SECTION_TAB[view]`: **eso no se toca** (T-1, criterio 2).
- `settings-client.tsx:1008-1023`: el efecto del OAuth (`?mp=`, `?google=`) — `setNegocioTab('integraciones')` y después `window.history.replaceState(null, '', '/negocio')` (T-2).
- `agenda-client.tsx:285-291`: `?google=` → toast + `window.history.replaceState(null, '', '/agenda')`.
- `finances-client.tsx:200`: `const [txTab, setTxTab] = useState('appointments')`; `:1007` `<Tabs value={txTab} onValueChange={setTxTab}>`; `:1014-1015` los botones de alta por `txTab`.
- Comentarios densos en español explicando el porqué; funciones puras con tests en vitest `environment: 'node'`; gates de región que recortan la función por firma (ver la memoria del repo sobre gates que miden cero).

### Integration Points
- `components/dashboard/sidebar.tsx`, `components/dashboard/panel-bottom-nav.tsx`, `app/(dashboard)/mas/mas-client.tsx`: los puntos de entrada a las secciones (D-08) — consumen `panelNavMode`/`panelBranchPlan`.
- `components/dashboard/unsaved-changes-guard.tsx`: sólo Agenda y `/web` tienen `useUnsavedChanges`; los tabs no lo extienden (fuera de alcance).

</code_context>

<specifics>
## Specific Ideas

- Profundidad máxima esperada del atrás: **tab no-default → tab por defecto → (Más | Inicio) → Inicio**. El criterio 1 exige recorrerla entrando a la sección **por Más y por la barra**.
- El OAuth real sólo vuelve en staging/prod (en local MP no vuelve): la verificación de T-2 es en producción, como el 3.4 de la Phase 3.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Siguen fuera, ya declarados en el ROADMAP: el `activeLoc` de Agenda, reorganizar/renombrar tabs, extender `useUnsavedChanges`, el toggle `mobileView` de `/web`. Y la deuda de la Phase 3: los 30 `DialogContent` sin alto máximo, la X de 28px, el eslint de `plan-modal.tsx:33`.)

</deferred>

---

*Phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada*
*Context gathered: 2026-11-17*
