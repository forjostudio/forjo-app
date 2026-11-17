---
phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
plan: "04"
subsystem: ui
status: complete
tags: [history, tabs, composicion, b1, panel-branch, cdp]

requires:
  - phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
    provides: "04-03: la composición medida (como-se-derivo) y la decisión B1 del dueño"
provides:
  - "el séptimo miembro consume-view-then-navigate del plan de la rama, con el hecho vistaArriba (sin default) y la regla -1d en panelBranchPlan (aditiva)"
  - "la rama del ejecutor con reDecidir (opcional: sin él se niega) y el segundo paso decidirDesdeElAterrizaje en el hook de la barra"
  - "branchStackFacts: los cuatro hechos de la pila computados en UN lugar para el gesto y el segundo paso"
  - "el guard de cambios sin guardar declara el miembro y degrada a la regla de rutas"
  - "R-B1-inicio, R-B1-turnos, R-B1-mas, R-B1-ficha en la sonda de la app, con control, RED → GREEN"
  - "R-C-2, R-C-3, R-C-4 y R-C-ficha retirados (obsoleto) con su esperado intacto"
  - "MOB-04 PRECISADO el 2026-11-17 (decisión B1); ## Implementado en 04-DECISION-COMPOSICION.md"
affects: [04-05 (UAT del dueño en el teléfono), la sonda de la app, MOB-04, MOB-08]

actuals:
  tokens: 25800
  tasks: 2
  commits: 6
plan_head_before: 13c245ababbbc2578803e153a6e089708196f385

tech-stack:
  added: []
  patterns:
    - "Un miembro de rama de dos pasos que RE-DECIDE con la misma política en el aterrizaje del consumo, en vez de llevar una decisión precomputada"
    - "Los hechos de la pila en una función pura (branchStackFacts) cuando el mismo consumidor decide en dos momentos"

key-files:
  created:
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-04-SUMMARY.md
  modified:
    - lib/panel-history.ts
    - lib/panel-branch.ts
    - components/dashboard/unsaved-changes-guard.tsx
    - lib/panel-history.test.ts
    - test/panel-branch.test.ts
    - lib/unsaved-changes.test.ts
    - .planning/debug/probes/panel-exit-en-la-app.mjs
    - .planning/debug/tabs-en-la-url-medida.md
    - .planning/workstreams/panel-nav/REQUIREMENTS.md
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-DECISION-COMPOSICION.md

key-decisions:
  - "B1 implementado como un séptimo miembro consume-view-then-navigate con regla -1d (entre la -1b y la -1c); el segundo paso re-decide con panelBranchPlan sobre la pila real, sin una segunda política"
  - "Los cuatro hechos de la pila se extrajeron a branchStackFacts para que el gesto y el segundo paso los computen con UNA forma (lo exige el candado de G2-1 de la Phase 3)"
  - "R-G3-10-primer-toque-atras-pronto sigue en FALLA en la corrida completa: es el costo del camino 1 declarado el 2026-11-16, re-medido idéntico con el código de antes de B1; no es regresión"

patterns-established:
  - "Ante una FALLA de la Phase 3 en la no-regresión, se re-mide ESE recorrido con el código de antes del arreglo (archivos puestos y restaurados con git checkout -- <archivo>) antes de llamarla regresión"

requirements-completed: []

duration: 64 min
completed: 2026-11-17
---

# Phase 4 Plan 04: B1 en la barra — con un tab o una ficha abiertos, el gesto termina igual que sin ellos Summary

**Un séptimo miembro `consume-view-then-navigate` en el plan de la rama: con una subsección propia arriba (tab `?tab=` o ficha `?c=`), el gesto de la barra la consume por `consumeOwnedPanelEntry` y, desde el `popstate`, re-decide con `panelBranchPlan` sobre la pila real; medido con control en la app real, incluido el retroceso triple tab → sección → Más → Inicio.**

## Performance

- **Duración:** 64 min (2026-11-17, 10:25 → 11:29 hora local), incluidas tres esperas del turno de pantalla
- **Tasks:** 2 de 2
- **Archivos:** 10 modificados (3 de código de la app, 3 de tests, la sonda, 3 documentos)

## La medición (task 1)

| Recorrido | Control (sin la subsección) | Variante — RED (`f8fdb12`) | Variante — GREEN (`b13f0a1`) |
|---|---|---|---|
| `R-B1-inicio` `Más → Negocio → [Cobros] → Inicio` | `[/dashboard]`, aviso `si` | `[/dashboard, /mas, /negocio, /negocio?tab=cobros, /dashboard]`, aviso `no` | `[/dashboard]`, aviso `si` |
| `R-B1-turnos` `… → [Cobros] → Turnos` | `[/dashboard, /appointments]` | `[/dashboard, /mas, /negocio, /appointments]` | `[/dashboard, /appointments]` |
| `R-B1-mas` `… → [Cobros] → Más` | `[/dashboard, /mas]` | `[…, /negocio?tab=cobros, /mas]` | `[/dashboard, /mas]` |
| `R-B1-ficha` `Inicio → Clientes → [ficha] → Inicio` | `[/dashboard]`, aviso `si` | `[/dashboard, /clients, /clients?c=*, /dashboard]`, aviso `no` | `[/dashboard]`, aviso `si` |

**El retroceso triple, pila cruda de la variante de `R-B1-inicio`:** antes del toque
`[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=4`; tras UN toque en Inicio
`url=/dashboard#salir estado={"frjExit":1} cruda=[(afuera), /dashboard, /dashboard#salir] actual=2`. No
perdió ningún paso y el sentinel de salida se armó sobre la entrada original de Inicio, igual que el control.
P-B1-3 no aplicó.

Gates del task 1: (1) precondición `decision=[B1] · composicion medida=[como-se-derivo]` rc 0; (2) suites
rc 0, pura rc 0, MB1/MB2 rojas, árbol limpio, 0 temporizadores en el ejecutor, `panelNavMode`
byte-idéntica, nada fuera del plan desde el 04-03, 0 errores TS, eslint rc 0 → rc 0; (3) los cuatro
`R-B1-*` en `OK`, rc 0; (4) `(f)` en su lugar, RED 4, GREEN 4, `cierre (f)` 1, sonda antes del arreglo,
0 `esperado` perdidos → rc 0.

## Las mutaciones

- **MB1:** borrar `if (vistaArriba && from !== to) return 'consume-view-then-navigate'` de `lib/panel-history.ts` ⇒ `lib/panel-history.test.ts` ROJA.
- **MB2:** `vistaArriba: panelViewEntryParam(estado) !== null && !isForeignOwnedEntry(estado)` → `vistaArriba: false` en `lib/panel-branch.ts` ⇒ `test/panel-branch.test.ts` ROJA.
- Las dos restauradas con la huella verificada.

## Los candados de la Phase 3 actualizados a propósito (con su línea fechada)

| Candado | Antes | Ahora |
|---|---|---|
| `lib/panel-history.test.ts` «el tipo del plan tiene SEIS miembros» | 6 | 7 (renombrado a SIETE) |
| `lib/panel-history.test.ts` «NO hay miembro nuevo… sigue siendo de SEIS» (G2-1) | 6 | 7 (renombrado: G2-1 no agregó miembro; el séptimo es de B1) |
| `test/panel-branch.test.ts` «el `switch` del guard sigue en SEIS casos» | 6 `case` | 7 |
| `test/panel-branch.test.ts` «`panelNavMode` y `panelBranchPlan` quedan INTACTAS» | 6 `if` | 7 (los otros contadores iguales) |
| `test/panel-branch.test.ts` «G3-1 — … ni un miembro nuevo» (región del tipo) | 4 propios | 5 |
| `lib/unsaved-changes.test.ts` «EXHAUSTIVIDAD: para los SEIS planes» | 6 | 7 |

Ningún otro candado de la Phase 3 se tocó; `vistaArriba: false` se agregó a las 44 llamadas existentes de
`panelBranchPlan` en los tests (el hecho va sin default, como los otros tres).

## La no-regresión (task 2)

- Entorno: `negocio-prueba` en `trial|true` (consultado; no hizo falta la receta del 03-17).
- **Sonda de la app sin selección:** 47 medidos, **46 en `OK`**; los cinco retirados no corren. La única
  `FALLA`: `R-G3-10-primer-toque-atras-pronto` (`atras_siguiente: sale`, esperado `avisa`).
- **Sonda estática:** 18/18. **Pura:** 77 archivos / 1804 + 3 expected-fail. **Historial:** 630/630.
- `no-regresion (plan 04-04): sonda de la app 46/47 en OK, estatica 18/18, suites verdes` en `(f)`.

## Task Commits

1. **Task 1: B1 de punta a punta** — `f8fdb12` (test: los `R-B1-*` con control), `5366056` (test: casos en rojo y cuentas), `b13f0a1` (fix: el arreglo), `d0b06ca` (docs: `(f)`)
2. **Task 2: la no-regresión** — `ae032a9` (test: `R-C-*` retirados), `49137c7` (docs: no-regresión, MOB-04 precisado, `## Implementado`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueante del instrumento] Las mutaciones del segundo gate por archivo, no por argv**
- **Found during:** Task 1, paso 4
- **Issue:** el `mutar` del gate pasa los literales por argv a `node -e`; desde Git Bash a Windows se truncan y pierden comillas (lo anotado en los planes anteriores).
- **Fix:** el mismo gate, con un único cambio de transporte: `mutar.cjs` lee los dos literales de archivos (misma semántica: sale 3 si el literal falta, reemplaza todas). Resultado: MB1 y MB2 rojas, rc 0.
- **Files modified:** ninguno del repo (vive en el scratchpad).

**2. [Rule 3 - Bloqueante] `lib/unsaved-changes.test.ts` fuera de la lista del plan**
- **Found during:** Task 1, paso 2
- **Issue:** su `TODOS_LOS_PLANES: Record<PanelBranchPlan, true>` deja de compilar con el miembro nuevo, y su caso de exhaustividad cuenta 6 planes.
- **Fix:** el miembro en el mapa y la cuenta 6 → 7 con línea fechada (es un candado de la cuenta de miembros, la categoría que el plan permite actualizar).
- **Commits:** `5366056`, `b13f0a1`.

**3. [Rule 1 - Candado de la Phase 3] `branchStackFacts` para no duplicar la forma de los hechos**
- **Found during:** Task 1, paso 3
- **Issue:** el segundo paso re-computa los hechos; escritos en línea, `raizDebajo: panelUnderRoute(estado) === root` aparecía dos veces y el candado de G2-1 («la MISMA forma, y UNA vez cada uno») se puso rojo.
- **Fix:** los cuatro hechos en una función pura `branchStackFacts({ estado, id, root, more })` (tipo de retorno inferido, para que cada nombre aparezca una vez); el gesto y el segundo paso la llaman sobre SU estado, leído una vez por momento. El candado de G2-1 quedó verde sin tocarlo; el caso nuevo del hook (escrito en `5366056`) se ajustó en el mismo `fix` para auditar la función y su uso en el gesto.
- **Commit:** `b13f0a1`.

**4. [Rule 2 - Correctitud] La degradación del segundo paso**
- **Found during:** Task 1, paso 3
- **Issue:** el `<Link>` ya fue prevenido en el gesto; si en el segundo paso el ejecutor se negara, el gesto quedaría muerto.
- **Fix:** `decidirDesdeElAterrizaje` degrada a la regla de rutas (`panelNavMode`) con la propagación de la marca, como el guard. En la práctica es inalcanzable (los consumos re-leen el mismo estado en el mismo tick).
- **Commit:** `b13f0a1`.

**5. [Rule 3 - Conflicto entre el texto del plan y su gate] Las entradas de `QUE_CIERRA` de los `R-C-*`**
- **Found during:** Task 2, paso 1
- **Issue:** el plan pide el prefijo `OBSOLETO (…)` en la entrada de `QUE_CIERRA`, pero esas cuatro líneas llevan la palabra `esperado` y el gate exige que toda línea con `esperado` del `test(04-03)` siga EXACTA.
- **Fix:** las líneas quedan tal cual con un comentario `// OBSOLETO desde el 2026-11-17 …` encima (el recorrido sí lleva su `obsoleto`, que es lo que lo saltea).
- **Commit:** `ae032a9`.

### Gate no satisfecho tal cual, sin regla de PARAR

**6. El primer gate del task 2 da rc 1 por una `FALLA` preexistente y declarada**
- El gate exige `FALLA=0` y medidos = coinciden. La corrida completa da 46/47: `R-G3-10-primer-toque-atras-pronto` es el costo del camino 1 que el dueño declaró el 2026-11-16 con su `esperado` intacto a propósito (`veredicto G3-10: otro`), así que da `FALLA` en toda corrida completa desde el 03-17.
- **Medido con control:** el mismo recorrido con los tres archivos de la app de `5366056` (antes del arreglo) puestos en el árbol y restaurados con `git checkout -- <archivo>` da la MISMA `FALLA` con la misma tupla (`entradas_salteadas=1`, `ruta_despues=(afuera)`). Ese camino (Inicio con un overlay) no pasa por nada que B1 tocó. Por eso **P-B1-2 no aplicó**: nada se puso rojo con el arreglo. El resto del gate (4 `R-C-*` retirados, estática 18/18, pura verde) cumple.

---

**Total deviations:** 5 resueltas en el momento + 1 gate con una FALLA preexistente, medida con control. **Impact:** ninguno sobre el alcance de B1; el gate de no-regresión del plan no contemplaba la FALLA declarada de G3-10.

## Issues Encountered

- Tres esperas del turno de pantalla (el ERP corría Playwright); ninguna corrida se cortó.
- Ningún `next dev` de este repo estaba vivo: cada corrida levantó el suyo en el 3031 y lo cerró (puerto libre al salir). El de forjo-landing en el 3000 no se tocó. Durante las corridas de pantalla no se editó código de la app (las mutaciones corrieron después).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: sin superficie nueva fuera del `<threat_model>` del plan. T-04-23 (retroceso sobre entrada ajena) cubierto por `consumeOwnedPanelEntry` y los casos «nunca sobre una entrada ajena»; T-04-25 (gesto muerto) por el oyente antes del consumo y la degradación del segundo paso.

## Para el 04-05 (lo que el dueño tiene que mirar en el teléfono)

- Con Cobros abierto en Negocio (entrando por Más), tocar **Inicio**: tiene que caer en Inicio con `#salir` en la barra de direcciones, y el primer atrás tiene que mostrar el aviso de salida (no volver a Cobros).
- Lo mismo tocando **Turnos** (el atrás desde Turnos va directo a Inicio) y **Más** (vuelve a Más; el atrás va a Inicio).
- Con la ficha de un cliente abierta, tocar **Inicio**: Inicio con `#salir`, el atrás avisa (no reabre la ficha).
- Que nada de lo anterior se sienta lento: son hasta tres retrocesos encadenados (tab → sección → Más → Inicio), medidos sólo en Chrome de escritorio.
- Pendiente: Chrome de Android y Safari de iOS; C-5 sigue declarado (escritorio).

## Next Phase Readiness

Listo para el 04-05. MOB-08 sigue sin marcar y su supuesto `unclassified` sigue declarado; MOB-04 sigue `Complete` con su precisión nueva. Nada se subió.

## Self-Check: PASSED

- FOUND: `lib/panel-history.ts` con `consume-view-then-navigate` y la regla `-1d`; `lib/panel-branch.ts` con `reDecidir`, `decidirDesdeElAterrizaje` y `branchStackFacts`; el `case` en `components/dashboard/unsaved-changes-guard.tsx`
- FOUND commits: `f8fdb12`, `5366056`, `b13f0a1`, `d0b06ca`, `ae032a9`, `49137c7` (`git rev-list --count 13c245a..HEAD` = 6 antes de este SUMMARY)
- STATE.md, state.json, la tabla de progreso y los checkboxes del ROADMAP y la trazabilidad de REQUIREMENTS: sin cambios en este plan
