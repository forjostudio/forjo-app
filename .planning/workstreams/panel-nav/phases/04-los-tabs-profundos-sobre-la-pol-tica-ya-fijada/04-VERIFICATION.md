---
phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
verified: 2026-11-17T21:10:00Z
status: human_needed
score: 5/5 criterios de éxito del ROADMAP verificados (más D-01..D-10 honrados)
covered_files:
  - ".planning/workstreams/panel-nav/REQUIREMENTS.md"
  - ".planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-01-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-01-SUMMARY.md"
  - ".planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-02-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-02-SUMMARY.md"
  - ".planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-03-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-03-SUMMARY.md"
  - ".planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-04-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-04-SUMMARY.md"
  - ".planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-05-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-05-SUMMARY.md"
  - "app/(dashboard)/agenda/agenda-client.tsx"
  - "app/(dashboard)/finances/finances-client.tsx"
  - "app/(dashboard)/finances/page.tsx"
  - "app/(dashboard)/negocio/page.tsx"
  - "app/(dashboard)/settings/page.tsx"
  - "app/(dashboard)/settings/settings-client.tsx"
  - "components/dashboard/unsaved-changes-guard.tsx"
  - "lib/panel-branch.ts"
  - "lib/panel-history.test.ts"
  - "lib/panel-history.ts"
  - "lib/panel-tabs.ts"
  - "lib/unsaved-changes.test.ts"
  - "test/panel-branch.test.ts"
  - "test/panel-history-clients.test.ts"
  - "test/panel-tabs.test.ts"
covered_digest: "v1:sha256:56d213cf7a39fc9e3b63782735c4e8242f95b2ba3bdfedefadb38a0595de692e"
behavior_unverified: 0
overrides_applied: 0
gaps: []
deferred: []
behavior_unverified_items: []
coincidental_reliance_items: []
advisory:
  - finding: "obs-1 / WR-01: el primer toque de un tab de Finanzas (Ventas o Egresos) hace scroll al inicio de la página; causa plausible rastreada en Next 16.2.7 (el <Suspense fallback={null}> nuevo de las tres páginas), NO medida"
    category: other
    reason: "Visto por el dueño en Android, escritorio y con el código desplegado (974a131). No contradice ningún criterio literal del ROADMAP; es una regresión de sensación introducida por la fase. Decisión del dueño pendiente (ver Human Verification)."
    evidence_status: "causa derivada del código, sin medición CDP"
  - finding: "WR-02: el handler del tab decide con el `from` del último render y no con la URL real; un doble toque antes del commit puede empujar entradas duplicadas o hacer un segundo back()"
    category: other
    reason: "Leído y confirmado en el código (settings-client.tsx:1035, finances-client.tsx:~277). Ventana de milisegundos; sin test rojo ni medición."
    evidence_status: "derivación del código confirmada por lectura, sin reproducción"
  - finding: "WR-03: vueltaDeOAuth (`!== null`) y el efecto del OAuth (`!mp && !google`) no coinciden; con ?mp= vacío o ?tab=integraciones&mp=… los tabs de Negocio quedan clavados en Integraciones"
    category: other
    reason: "Confirmado por lectura (settings-client.tsx:1013 vs :1113). Ningún callback emite esas URLs (mercadopago/callback y google/callback mandan sólo ?mp=|?google= sin tab), así que sólo se llega pegando la URL."
    evidence_status: "confirmado por lectura, alcance acotado a URLs pegadas"
  - finding: "WR-04: B1 (consume-view-then-navigate) podría perder su segundo paso si la marca frjView sobrevive a una recarga (history.back entre documentos no dispara popstate)"
    category: architectural
    reason: "Derivación del revisor, 'a medir'; la UAT 7.1-7.4 y 8.4 (sin recarga) pasaron."
    evidence_status: "none provided"
---

# Phase 4: Los tabs profundos sobre la política ya fijada — Informe de verificación

**Objetivo de la fase:** que los tabs de `/negocio`, `/settings` y `/finances` vivan en la URL consumiendo el helper con la política ya definitiva, sin alterar `/servicios`, `/equipo` y `/consultorios` (mismo `settings-client.tsx`) y sin que el retorno del OAuth de MercadoPago/Google aterrice en un tab que el dueño no pidió.
**Verificado:** 2026-11-17
**Estado:** `human_needed` (todos los criterios cumplidos; queda una decisión del dueño sobre obs-1 y unas pocas ramas sin medir)
**Re-verificación:** No — verificación inicial.

## Cómo se verificó

- Se leyó el código real (no los SUMMARY): `lib/panel-tabs.ts`, los tres clientes, las cinco páginas tocadas, `applyPanelView`/`panelTabCause` en `lib/panel-history.ts`, y el diff `85c99ae^..HEAD`.
- Corrí yo: `./node_modules/.bin/tsc --noEmit` (rc 0, cero errores) y `./node_modules/.bin/vitest run --project pure` (**77 archivos, 1804 pasan + 3 expected-fail**, igual al piso 77/1804 del plan 04-05). Corrí el barrido crudo del criterio 5 y el diff de lo bloqueado.
- **No** corrí ninguna sonda ni navegador (necesitan el turno de pantalla y ya están registradas en `.planning/debug/tabs-en-la-url-medida.md` §(g)); las tomo como evidencia grabada y las cruzo con la UAT del dueño en producción (`04-UAT.md`, commit desplegado `974a131`: 30 filas, 28 ✅, 2 ⚠, 0 ❌), que es evidencia humana ya recolectada y no se vuelve a pedir.

## Cumplimiento del objetivo

### Verdades observables (criterios del ROADMAP, leídos literalmente)

| # | Verdad | Estado | Evidencia |
|---|--------|--------|-----------|
| 1 | Los tabs de `/negocio` y `/settings` son destinos: cambiar de tab cambia la URL, el atrás vuelve al tab **por defecto** (precisión D-01 del 2026-11-17), pegar/recargar abre ese tab, agotado el default el atrás respeta la Phase 3 (Más / Inicio), tab ausente o inválido cae al default sin pantalla vacía | ✓ VERIFICADO | **Código:** `tabValue` se deriva de `resolveTab` sobre `searchParams` (settings-client.tsx:1014-1042), sin `useState` de tab al lado; `resolveTab` usa `Map` (no objeto literal) y cae al default con `slug: null` para ausente/vacío/otro grupo/clave del prototipo (`lib/panel-tabs.ts:106-114`). `panelTabCause`: default→otro = `user-open` (push), otro→otro = `user-switch` (replace), →default = `user-close` (consume si es nuestra) (`panel-history.ts:165-174`). Reconciliación `?tab=` inválido → URL limpia con `replace` (settings-client.tsx:1054-1092). **Comportamiento:** sonda grabada `R-T-negocio-por-mas`, `R-T-negocio-datos-consume`, `R-T-config-por-url` en OK (§(c), §(g): 12/12 R-T); la pura (corrida por mí) cubre la decisión y el simulador de pila. **Humano en producción:** UAT 1.1, 1.2, 1.4, 2.1, 3.1, 3.3, 3.4, 8.1, 8.3, 8.4 ✅ (Android Chrome e iPhone Safari). |
| 2 | T-1: `/servicios`, `/equipo`, `/consultorios` no ganan tab, ni cambian default, ni `TabsList` nueva, y su `onTabChange` sigue `undefined` | ✓ VERIFICADO | `git diff --name-only 85c99ae^ HEAD` sobre `app/(dashboard)/servicios|equipo|consultorios` = **0 archivos**. En `settings-client.tsx` el esqueleto de las dos líneas se conserva: `isSection ? SECTION_TAB[view]` y `isSection ? undefined` (L1042-1043; antes L1001-1002 con la misma rama). Mismos dos `<TabsList>` que antes (L2512 `isNegocio`, L2522 `!isSection`). `grupoDeTabs`/`tabResuelto` son `null` en secciones y el efecto de reconciliación sale con `grupoDeTabs === null` (L1065). Sonda `R-T-secciones-sin-tab` OK. **Humano, ruta por ruta:** UAT 5.1 (`/servicios`), 5.2 (`/equipo`), 5.3 (`/consultorios`) ✅. |
| 3 | T-2: `/negocio?mp=connected` muestra el toast y aterriza en **Integraciones**; la limpieza ya no pisa el tab; igual para `?google=` en Negocio y en Agenda y las ramas de error | ✓ VERIFICADO (con un residuo sin medir, ver abajo) | **Código:** el `replaceState` crudo desapareció; el efecto hace `applyPanelView({cause:'programmatic', param:'tab', to:'integraciones', drop:['mp','google']})` (settings-client.tsx:1127), con toast diferido a la próxima tarea (L1120-1126); en Agenda `applyPanelView({cause:'stale', param:'google', ...})` (agenda-client.tsx:303 del diff). `vueltaDeOAuth` fuerza Integraciones desde el primer frame (L1013, L1042). **Backend:** los callbacks emiten `/negocio?mp=connected|error` y `?google=connected|error` (app/api/*/callback/route.ts). Sondas `R-T-negocio-oauth-mp`, `R-T-negocio-oauth-google-error`, `R-T-agenda-google` OK. **Humano en producción (OAuth real):** UAT 4.2 ✅ (conectó MercadoPago de verdad en un negocio de prueba: `/negocio?tab=integraciones`, toast una vez, tarjeta «Conectado»), 4.3 ✅ (Google desde Integraciones), 4.4 ✅ (Google desde Agenda). 4.1 y 8.5 (cancelar en MP) ⚠ no corribles, ver Human Verification. |
| 4 | Finanzas: Turnos·Ventas·Egresos en la URL; «Nueva venta» sólo en Ventas, «Nuevo egreso» sólo en Egresos, también entrando directo y con el atrás | ✓ VERIFICADO | `txTab = tabResuelto.value` derivado de la URL (finances-client.tsx:218); las dos líneas del botón siguen leyendo `txTab` (L1095-1096), así que el botón sale del tab resuelto por construcción. `onValueChange={alElegirTab}` (L1088). Sondas `R-T-finanzas-por-mas`, `-desde-inicio`, `-invalido`, `-url-pegada` OK. **Humano:** UAT 1.3, 2.1, 3.2, 8.2 ✅ (el dueño verificó el botón con atrás y con recarga en Egresos). Nota: obs-1 (scroll) es un defecto aparte, ver más abajo. |
| 5 | Cero dialecto nuevo y cero regresión: `grep -rE 'pushState|replaceState|history\.back'` sobre los tres clientes = 0; el atrás sigue cerrando overlays; el aviso de cambios sin guardar de Agenda intacto; `npm run build` sin `useSearchParams` sin `<Suspense>` | ✓ VERIFICADO | **Corrí el grep crudo** sobre `settings-client.tsx`, `finances-client.tsx` y `agenda-client.tsx`: **rc 1, cero hits**. Los tres importan `applyPanelView` de `@/lib/panel-history`. Las tres páginas (`negocio`, `settings`, `finances`) envuelven el cliente en `<Suspense>`; build registrado rc 0, 64/64, cero avisos de Suspense (§(g)). Lo bloqueado (`lib/overlay-history.ts`, `lib/dirty-history.ts`, `scripts/con-turno.mjs`, `next.config.ts`, `app/api`, `package.json`, `supabase`) sin diff desde `85c99ae^`. Phase 3 intacta: sonda 46/47 con la única FALLA declarada `R-G3-10-primer-toque-atras-pronto`, la misma tupla que en 03-17 y 04-04. **Humano:** UAT 6.1 (diálogo y atrás), 6.2 (aviso de Agenda), 6.3 (aviso de salida de Inicio) ✅. |

**Puntaje:** 5/5 criterios verificados, 0 FALLADOS, 0 presentes-sin-comportamiento.

### Decisiones del dueño (CONTEXT D-01..D-10) — honradas

| Decisión | Evidencia |
|----------|-----------|
| D-01 un nivel de tabs (atrás → default) | `panelTabCause` + `R-T-negocio-por-mas`; UAT 1.1/1.2 |
| D-02 tocar el default consume | `user-close`; `R-T-negocio-datos-consume`; UAT 1.4 |
| D-03 URL pegada no fabrica un default debajo | `applyPanelView`: un `replace` ya no fabrica la marca (panel-history.ts:991-993); `R-T-finanzas-url-pegada`; UAT 3.1 («me sacó del sistema» = esperado), 3.4 corregida por el dueño, 8.3 |
| D-04 botón de alta sigue al tab de la URL | finances-client.tsx:218, 1095-1096; UAT 1.3/3.2 |
| D-05 `?tab=` con labels sin tildes | `lib/panel-tabs.ts:66-94`; valores internos sin renombrar (los `TabsTrigger` siguen con `business`, `appearance`, etc.) |
| D-06 default = URL limpia | `slug: null` para el default, incluido `?tab=datos` explícito (se sanea) |
| D-07 inválido / otro grupo → default y URL saneada con `replace` | `resolveTab` + efecto de reconciliación; `R-T-finanzas-invalido`, `R-T-config-por-url`; UAT 3.3 |
| D-08 tocar la sección activa vuelve al default consumiendo | sin cableado nuevo (`consumeOwnedPanelEntry` en el sidebar); `R-T-sidebar-seccion-activa`; UAT 2.3 |
| D-09 / D-10 OAuth como `replace` del helper | ver criterio 3 |
| B1 del dueño (`04-DECISION-COMPOSICION.md`) | séptimo miembro `consume-view-then-navigate` presente en `panel-history.ts`, `panel-branch.ts` y `unsaved-changes-guard.tsx` (3/3/2 ocurrencias) y 8 en `test/panel-branch.test.ts`; sondas `R-B1-inicio/-turnos/-mas/-ficha` OK; UAT 7.1-7.4 y 8.4 ✅ |

### Residuos declarados (no son regresiones ni gaps)

- **C-5** (escritorio, sidebar: `Inicio → Negocio → Cobros → Finanzas`, el atrás cae en Negocio). Visto por el dueño en UAT 2.2(b) y aceptado. Declarado en cuatro lugares con fecha 2026-11-17.
- **`R-G3-10-primer-toque-atras-pronto`**: costo del camino 1 de la Phase 3, 46/47 en la sonda completa.
- **D-03**: la URL pegada no fabrica el default debajo.

### Artefactos requeridos

| Artefacto | Esperado | Estado | Detalle |
|-----------|----------|--------|---------|
| `lib/panel-tabs.ts` | lista cerrada por grupo, `resolveTab`, `tabSlug` | ✓ VERIFICADO | 132 líneas, sustantivo, importado por settings-client y finances-client |
| `lib/panel-history.ts` | `panelTabCause`, `applyPanelView` que no fabrica la marca en `replace` ajeno, `drop` | ✓ VERIFICADO | sustantivo, cableado en los tres clientes |
| `settings-client.tsx` | tab de Negocio/Config derivado de la URL; OAuth por el helper; T-1 intacto | ✓ VERIFICADO | ver criterios 1-3 |
| `finances-client.tsx` | tab derivado de la URL; botón de alta sigue al tab | ✓ VERIFICADO | criterio 4 |
| `agenda-client.tsx` | limpieza de `?google=` por el helper | ✓ VERIFICADO | criterio 3/5 |
| `negocio|settings|finances/page.tsx` | `<Suspense>` alrededor del cliente | ✓ VERIFICADO | presente (ver obs-1/WR-01 sobre su `fallback={null}`) |
| `panel-branch.ts` + `unsaved-changes-guard.tsx` | B1 | ✓ VERIFICADO | 7º miembro cableado y declarado en el guard |

### Verificación de enlaces clave

| Desde | Hacia | Vía | Estado |
|-------|-------|-----|--------|
| `settings-client.tsx` `<Tabs onValueChange>` | `applyPanelView` | `alElegirTab` → `panelTabCause` + `tabSlug` | ✓ CABLEADO |
| `finances-client.tsx` `<Tabs onValueChange>` | `applyPanelView` | `alElegirTab` | ✓ CABLEADO |
| URL `?tab=` | tab mostrado / botón de alta | `useSearchParams` → `resolveTab` → `txTab`/`tabValue` | ✓ CABLEADO (flujo de datos real desde la URL, sin segunda fuente de verdad) |
| efecto OAuth | URL `?tab=integraciones` sin `mp`/`google` | `applyPanelView({drop})` | ✓ CABLEADO |
| Agenda `?google=` | URL limpia | `applyPanelView({cause:'stale'})` | ✓ CABLEADO |
| `<Tabs>` de secciones sueltas | `undefined` | `isSection ? undefined` | ✓ INTACTO (T-1) |

### Cobertura de requisitos

| Requisito | Plan(es) | Descripción | Estado | Evidencia |
|-----------|----------|-------------|--------|-----------|
| MOB-08 | 04-01, 04-02, 04-03, 04-04, 04-05 | Tabs de `/negocio` y `/settings` en la URL (precisado a «tab por defecto», D-01), compartibles y recargables | ✓ SATISFECHO | criterios 1, 2, 3, 5; UAT 1.1, 1.2, 1.4, 2.x, 3.x, 4.2-4.4, 5.x, 7.x, 8.x |
| MOB-09 | 04-01, 04-03, 04-05 | Ídem `/finances`, y el botón de alta sigue al tab visible | ✓ SATISFECHO | criterio 4; UAT 1.3, 2.1, 3.2, 8.2 |

Huérfanos: ninguno. `REQUIREMENTS.md` mapea únicamente MOB-08 y MOB-09 a la Phase 4 y ambos IDs aparecen en el frontmatter de los planes. **MOB-08 y MOB-09 siguen sin marcar** (`[ ]` / «Pending»): las marca `/gsd-verify-work 4 --ws panel-nav`, no esta verificación.

### Anti-patrones

Barrido de `TBD|FIXME|XXX` sobre los archivos de la fase: **cero**. Sin stubs: los valores derivados de la URL fluyen a lo que se muestra; no hay estado de tab hardcodeado ni vacío. El único `fallback={null}` es el de los tres `<Suspense>` y es el origen plausible de obs-1 (ver advisory).

### Revisión de código (04-REVIEW.md: 0 blocker, 4 warning, 3 info)

Ningún hallazgo contradice un criterio literal, así que ninguno se convierte en gap. Se registran como seguimientos:

- **WR-01 (obs-1)**: causa plausible del scroll al primer toque en Finanzas; sin medir. Ver Human Verification 1.
- **WR-02**: confirmado por lectura (el `from` sale del render, no de la URL). Seguimiento recomendado, bajo riesgo práctico; fix de una línea propuesto en el review.
- **WR-03**: confirmado por lectura; sólo alcanzable pegando la URL (ningún callback emite `tab`). El comentario de settings-client.tsx:1106-1107 («la query queda hasta el próximo toque») describe mal lo que pasa.
- **WR-04**: sin medir; B1 después de una recarga con tab abierto. Medir o declarar residuo.
- IN-01/02/03: higiene (dialecto `vistaArriba` duplicado, `router.refresh()` sobre `?tab=integraciones`, `param:'google'` con causa `stale`).

El gate `test/panel-tabs.test.ts:400` fija literalmente `<Suspense fallback={null}>`; si se arregla obs-1 por esa vía, hay que ajustar ese gate y el caso (e).

## Human Verification Required

La evidencia humana ya recolectada (UAT del dueño en producción) no se repite. Lo que sigue genuinamente sin cerrar:

### 1. Decisión sobre obs-1 (scroll al inicio en el primer toque de un tab de Finanzas)

**Qué hacer:** decidir si obs-1 se acepta como residuo, se manda a un quick, o se abre un plan de cierre de gaps (04-06). Mi evaluación: **no rompe ningún criterio literal** (no es routing ni afecta botón de alta/atrás/URL), pero es un defecto visible introducido por la fase (antes de la fase el primer toque no escribía historial; ahora dispara `ACTION_RESTORE`), reproducible en Android Chrome, escritorio y (según el dueño) sólo en Finanzas.
**Esperado si se arregla:** el primer toque en Ventas o Egresos, ya scrolleado hasta los tabs, no mueve `scrollY`.
**Por qué humano:** es una decisión de alcance/prioridad del dueño, y la causa (WR-01: `<Suspense fallback={null}>` que deja pendiente el scroll de la navegación de entrada) está derivada del código de Next pero **sin medir**; confirmarla pide una medición CDP bajo `node scripts/con-turno.mjs`, que esta verificación no corre. Las predicciones del review para confirmarla: no pasa tras recarga dura de `/finances`; no pasa al volver a entrar con el chunk ya cargado; pasa también en Negocio si se scrollea de modo que el `h1` quede fuera de pantalla.

### 2. (Menor) La rama de error del OAuth de MercadoPago contra el MP real

**Qué hacer:** cancelar en MercadoPago y volver con `?mp=error` (UAT 4.1 y 8.5, no corribles porque MP acepta directo con el reconocimiento facial).
**Esperado:** toast de error una vez y `/negocio?tab=integraciones` sin `mp`.
**Por qué humano / riesgo:** el retorno real con error no se pudo producir. La rama comparte el código con `?google=error` (medido por sonda en OK) y el redirect de error del callback existe (`app/api/mercadopago/callback/route.ts:17`), así que el riesgo es bajo; se deja constancia y no bloquea. Puede aceptarse como no corrible.

## Resumen de brechas

No hay gaps contra el ROADMAP: los cinco criterios están cumplidos con evidencia de código, de gates que corrí (tsc 0 errores, pura 77/1804, grep del criterio 5 vacío, lo bloqueado sin diff), de sondas grabadas y de la UAT del dueño en producción (28 ✅, 0 ❌). El estado es `human_needed` y no `passed` por una sola razón: obs-1 es un defecto visible, atribuible a la fase, con causa plausible pero sin medir, que el dueño tiene que decidir (corregir ahora, quick posterior o aceptar). WR-02, WR-03 y WR-04 quedan como seguimientos advisory. Si el dueño acepta obs-1 como residuo o lo manda a un quick, la fase queda lista para marcar MOB-08 y MOB-09.

---

_Verificado: 2026-11-17_
_Verificador: Claude (gsd-verifier)_
