---
phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos"
plan: "15"
subsystem: panel-nav / sentinel de salida (MOB-05) + guard de cambios sin guardar (MOB-06)
status: complete
outcome: "parado por diseño en P-4 después del task 2 — la medición es el entregable; los arreglos pasan al 03-16"
stop_resolution: "el dueño decidió el 2026-10-30 (03-UAT-2.md § «Los veredictos del 03-15 — decisión del dueño»): G3-5 → que el aviso se quede al soltar las teclas del atajo; G3-7 → arreglarlo. Los dos van en el plan 03-16; G3-6 y G3-8 quedan descartados con su número"
stop_rule: "P-4 — veredicto G3-5: otro (la firma de CR-01 no encaja: el keyup re-empuja #salir, pero el segundo atrás SALE salteando /dashboard)"
tags: [code-review, g3-5, g3-6, g3-7, g3-8, wr-05, canal-de-diagnostico, cdp, intervencion-de-historial]
requires: ["03-14"]
provides:
  - "WR-05 entregado: el canal de diagnóstico graba sólo con NODE_ENV development/test (panelExitDiagEnabled, gate como primera sentencia de recordExitDiag)"
  - "los cuatro gaps del code review MEDIDOS en la app real, con su línea de veredicto en (h): G3-5 otro, G3-6 descartado, G3-7 confirmado, G3-8 descartado"
  - "la sonda de la app con once recorridos R-G3-* y los instrumentos sonda-tecla, sonda-router, la precondición forzada de G3-6 y el manejo del beforeunload"
affects: ["la re-planificación del 03-15 (o un 03-16): qué hacer con G3-5 (pregunta nueva sobre la premisa del camino 1) y el arreglo de G3-7, confirmado y sin escribir", "la verificación de la fase 3 (MOB-04/05/06 siguen sin marcar)"]
tech-stack:
  added: []
  patterns:
    - "gate de entorno PURO (recibe el valor) leído con process.env.NODE_ENV literal en cada llamada, probado de los dos lados con vi.stubEnv"
    - "el orden de eventos de teclado COMPUESTO por CDP alrededor del atrás de la interfaz (Alt+flecha por CDP no navega), afirmado por un registro de cada keydown/keyup"
    - "precondición FORZADA de una medición viviendo sólo en el script de la sonda (apagada por omisión, nombrada en su registro), nunca en la app"
key-files:
  created:
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-15-SUMMARY.md
  modified:
    - lib/panel-branch.ts
    - test/panel-branch.test.ts
    - .planning/debug/probes/panel-exit-en-la-app.mjs
    - .planning/debug/la-absorcion-que-no-absorbe-medida.md
key-decisions:
  - "WR-05 (decisión del dueño, aplicada tal cual): el canal de diagnóstico graba SÓLO en desarrollo y en test; en producción no graba aunque alguien cree el arreglo global; sin bandera pública que lo reabra"
  - "G3-5 es OTRO, medido: el keyup posterior al popstate SÍ baja el aviso y re-empuja #salir con isActive=true, pero el segundo atrás SALE del panel salteando /dashboard (entradas_salteadas=1). No es el botón muerto de CR-01: el aviso se va al soltar y la salida pasa sin aviso visible. Pregunta nueva sobre la premisa del camino 1 (isActive verdadero no alcanza si la activación llegó ANTES del retroceso)"
  - "G3-6 es DESCARTADO, medido: los dos caminos reales llegan con el sentinel de cambios y dan OK; aun forzando su ausencia, el router.replace pedido desde adentro del popstate del colapso SÍ escribe /appointments (CR-02 no se reproduce en este camino)"
  - "G3-7 es CONFIRMADO, medido en los tres recorridos con la firma entera de WR-02 (toque -> armado none por la regla 0 -> retroceso ignore -> armado pendiente -> el atrás sale sin aviso); y el primer toque que abre el diálogo ya declina por la regla 0"
  - "G3-8 es DESCARTADO, medido: el rebote a /login es navegación blanda (el estado de módulo sobrevive) pero el login siempre aterriza en /dashboard y el primer commit descarta el pedido; ninguna marca miente"
  - "P-4 aplicado: con un 'otro' el plan termina después del task 2; ningún arreglo de gap se escribió (tampoco el de G3-7, confirmado)"
requirements-completed: []
duration: 40min
completed: 2026-10-30
plan_head_before: 4549356cc127e3dea5684ab34c8be025e6f3bae6
estimate:
  tokens: 130000
  tasks: 6
actuals:
  # chars/4 sobre las líneas agregadas del diff 4549356..HEAD (4 archivos, +1107/-7)
  tokens: 17790
  # tasks 1 y 2 completos; 3, 4, 5 y 6 no se ejecutaron (P-4)
  tasks: 2
  # MEDIDO: git rev-list --count 4549356..HEAD al escribir este SUMMARY (sin contar el commit de cierre)
  commits: 3
coverage:
  - deliverable: "WR-05: el canal de diagnóstico sólo en desarrollo"
    verification: { kind: test, ref: "test/panel-branch.test.ts — describe panelExitDiagEnabled (8 casos, 2 con vi.stubEnv); vitest pure 400/400 (RED 7 fallados / 393)", status: pass }
    human_judgment: false
  - deliverable: "en desarrollo el canal sigue grabando igual (las sondas lo usan)"
    verification: { kind: probe, ref: "panel-exit-en-la-app.mjs dev interfaz R-1.3-con-toque,R-3.1,R-login-con-activacion — 3/3 OK, rc 0, 4 registros de armado impresos", status: pass }
    human_judgment: false
  - deliverable: "los cuatro gaps medidos en la app real con su veredicto"
    verification: { kind: probe, ref: "panel-exit-en-la-app.mjs dev interfaz (once R-G3-*) — 6 OK + 5 FALLA, controles de escritorio en OK, 0 fallos del instrumento; gate de coherencia de (h) verde", status: pass }
    human_judgment: false
  - deliverable: "no-regresión de la sonda modificada y de la suite"
    verification: { kind: command, ref: "los doce de antes 12/12 OK rc 0; npx vitest run 110 archivos, 2002 pasados + 4 xfail + 1 salteado; tsc --noEmit sin error TS; eslint rc 0", status: pass }
    human_judgment: false
---

# Phase 3 Plan 15: Los gaps del code review, medidos — Summary

**El canal de diagnóstico quedó sólo en desarrollo (WR-05) y los cuatro gaps del code review se midieron
en la app real: `G3-7` confirmado, `G3-6` y `G3-8` descartados, y `G3-5` dio `otro` —el atrás de teclado
sí sale del panel, pero el aviso se va al soltar—, así que el plan PARÓ en P-4 sin escribir ningún arreglo
de gap.**

## Performance

- **Duración:** ~40 min (01:20 a 02:00, hora local del 2026-10-30)
- **Tasks:** 2 de 6 completos (1 y 2); 3 a 6 no ejecutados por P-4
- **Archivos tocados:** 4

## El estado del plan: PARADO en P-4 (no es un checkpoint del dueño)

La regla P-4 del plan, escrita antes de medir: *«cualquier veredicto `otro` ⇒ el plan termina acá con
`(h)` escrito y el reporte: una medición que no encaja en ninguna firma escrita es una pregunta nueva, no
un arreglo»*. `veredicto G3-5: otro` ⇒ los tasks 3 (arreglos de `G3-5`/`G3-7`/`G3-8`), 4 (`G3-6`), 5
(no-regresión completa y documentos de la UAT) y 6 (el checkpoint del dueño) **no se ejecutaron**.
**`G3-7` está confirmado y SIN arreglar** a propósito: lo decide el dueño al re-planificar. El WR-05 del
task 1 quedó entregado antes de medir, como el plan lo dispuso, y la parada no lo toca.

## Los cuatro veredictos y el número que decidió cada uno

| Gap | Veredicto | El número que lo decidió |
|-----|-----------|--------------------------|
| `G3-5` (CR-01) | **otro** | Los dos de teclado en `FALLA`: el keyup posterior al `popstate` da `toque drop-and-arm` con `activacion:true` y un `armado arm` (re-empuja `#salir`), **pero** `segundo_atras_ruta="(afuera)"` con `entradas_salteadas=1`: el segundo atrás SALE salteando `/dashboard`. La firma de CR-01 exige «el segundo atrás que no sale». Controles `OK`. |
| `G3-6` (CR-02) | **descartado** | Regla 6: los dos caminos reales `con-sentinel` en `OK`; el forzado `sin-sentinel` también `OK`: `replace_del_router="n=1 desde_un_commit=no"` (llamado desde `segundoPaso`, adentro del `popstate`) **y** `escritura_de_appointments="si"`. |
| `G3-7` (WR-02) | **confirmado** | Los tres en `FALLA` con la firma entera: `toque arm` → `armado none regla-0-foreignOwnsTop` → `retroceso ignore` → `armado pendiente` → atrás `(afuera)` sin aviso. Ninguno falla sin ella. |
| `G3-8` (WR-04) | **descartado** | `OK`: `documento_nuevo_en_el_rebote="no"` (el estado de módulo sobrevivió) pero el login aterriza en `/dashboard#salir` y la marca no miente en ninguna foto (`marca_falsa_al_volver="no"`). |

**El hallazgo de `G3-5`, para el dueño:** no es el «botón muerto» de CR-01. Con Alt+flecha el aviso
aparece, **se va al soltar las teclas** y el hash vuelve; el segundo atrás **sale** sin aviso visible
porque Chrome saltea `/dashboard`. La diferencia con la tecla `KeyA` apretada con el aviso visible (que sí
absorbe) es dónde cae el keydown: en el atajo cae sobre la entrada `#salir` ANTES del retroceso, y sobre
`/dashboard` no llega ninguna activación nueva (un keyup no la da) aunque `isActive` siga verdadero. Es
una pregunta nueva sobre la premisa del camino 1, que la calibración `C-activacion` no cubría. Todo está en
`.planning/debug/la-absorcion-que-no-absorbe-medida.md` § `(h)`.

## Task Commits

1. **Task 1 — WR-05, el canal sólo en desarrollo** (TDD)
   - RED `ddf96f9` `test(03-15)`: el describe de `panelExitDiagEnabled`
   - GREEN `68cf232` `feat(03-15)`: `panelExitDiagEnabled` + el gate de `recordExitDiag`
2. **Task 2 — medir antes de arreglar** `2ed78db` `test(03-15)`: la sonda con once recorridos y la sección `(h)`

**Plan metadata:** el commit `docs(03-15)` de este SUMMARY + STATE + ROADMAP.

## El RED, anotado a mano (el verbo `check tdd-red-evidence` no parsea vitest en este repo)

Task 1, `npx vitest run --project pure test/panel-branch.test.ts lib/panel-history.test.ts
test/panel-nav-chrome.test.ts` → **rc 1**, **7 fallados / 393 pasados (400)**. Los fallados (todos en
`panelExitDiagEnabled — el canal de diagnóstico SÓLO en desarrollo (plan 03-15, WR-05)`):

- `` `development` ⇒ habilita: es lo que pone `next dev`, contra el que corren las dos sondas ``
- `` `test` ⇒ habilita: es lo que pone vitest, así que la suite sigue viendo el canal igual que hoy ``
- `` `production` ⇒ NO habilita: el build de producción no graba nada ``
- `ausente o vacío ⇒ NO habilita: falla CERRADO`
- `` igualdad EXACTA, sin normalizar: `Production` y `development ` (con espacio) NO habilitan ``
- `` con NODE_ENV en `production` y el canal ABIERTO como arreglo: no graba, devuelve falso y el arreglo queda igual ``
- `auditoría: el gate es la PRIMERA sentencia de recordExitDiag, antes del global; …`

El octavo (`restaurado y con NODE_ENV en development…`) pasaba ya en el RED: es el lado de desarrollo, que
el código de antes cumplía; lo que lo vuelve contrapuesto es el sexto. GREEN: 400/400.

## Las corridas de la sonda de la app (todas por `scripts/con-turno.mjs`, contra el `next dev` del dueño, puerto 80, pid 13260)

- **Task 1 (la prueba en desarrollo):** `R-1.3-con-toque`, `R-3.1`, `R-login-con-activacion` → **3/3 `OK`**,
  rc 0, 4 registros `armado` impresos (el canal sigue grabando en `next dev`).
- **Task 2, los once nuevos** — dos corridas pararon en P-1 por el INSTRUMENTO (`DOMStorage` sin frame del
  origen; el login a 390 px) y se arreglaron en la sonda; una corrida suelta de `R-G3-8-rebote` validó el
  segundo arreglo. **La que vale (01:50-01:52):**
  - `OK` `R-G3-5-escritorio-control`, `R-G3-5-tecla-tras-el-aviso`, `R-G3-6-con-sentinel`,
    `R-G3-6-camino-real`, `R-G3-6-sin-sentinel`, `R-G3-8-rebote`
  - `FALLA` `R-G3-5-teclado-flecha-primero`, `R-G3-5-teclado-alt-primero`, `R-G3-7-autoabierto-x`,
    `R-G3-7-autoabierto-fondo`, `R-G3-7-primer-toque`
- **Task 2, los doce de antes con la sonda modificada (terminada 01:57):** **12/12 `OK`**, rc 0.
- Tracers (tasks 3 y 4) y las dos del task 5: **no corrieron** (P-4).

**La estática** (`panel-back-stack.mjs`): no se corrió en este plan (es del task 5) y no se tocó.

**La suite completa** (01:58-02:00, dentro de la ventana de los canarios de reloj): `npx vitest run` →
**110 archivos, 2002 pasados + 4 expected-fail + 1 salteado**, rc 0 (1994 de base + los 8 del gate del
canal). `./node_modules/.bin/tsc --noEmit`: cero `error TS`. `eslint` sobre lo tocado: rc 0.

**Recargas en caliente:** editar `lib/panel-branch.ts` en el task 1 disparó una recarga en caliente del
`next dev` del dueño (no se lo reinició ni se lo mató). La sonda y el veredicto no tocan la app.

## Lo bloqueado, intacto

`next.config.ts` con la huella `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`; `lib/overlay-history.ts`,
`lib/dirty-history.ts`, `lib/panel-history.ts`, `scripts/con-turno.mjs` y
`components/dashboard/panel-bottom-nav.tsx` sin cambios; el guard de cambios sin guardar y sus tests sin
tocar (`G3-6` no confirmado). El único cambio de producción es el gate del canal (task 1); el canal sigue
en 5 call sites.

## Files Created/Modified

- `lib/panel-branch.ts` — `panelExitDiagEnabled` y el gate de `recordExitDiag`; el encabezado del canal pasa a «SÓLO EN DESARROLLO»
- `test/panel-branch.test.ts` — el describe de `panelExitDiagEnabled` (8 casos) y la cabecera del bloque del canal
- `.planning/debug/probes/panel-exit-en-la-app.mjs` — instrumentos, primitivas y los once recorridos `R-G3-*`
- `.planning/debug/la-absorcion-que-no-absorbe-medida.md` — la sección `## (h)` con los números y las cuatro líneas de veredicto

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueante, P-1 del instrumento] `DOMStorage.setDOMStorageItem` sin frame del origen**
- **Found during:** Task 2 (primera corrida)
- **Issue:** con la página de afuera (`data:`) de turno, CDP tira «Frame not found for the given storage id» y `R-G3-7-autoabierto-fondo` no podía preparar `forjo_intended_plan`
- **Fix:** el `localStorage` se prepara parado en `public/file.svg` (un documento estático del mismo origen), afirmando el valor
- **Files modified:** `.planning/debug/probes/panel-exit-en-la-app.mjs`
- **Commit:** `2ed78db`

**2. [Rule 3 - Bloqueante, P-1 del instrumento] el login del rebote a 390 px**
- **Found during:** Task 2 (segunda corrida)
- **Issue:** en mobile el formulario de login vive en una hoja; `R-G3-8-rebote` no salía de `/login` en 60 s
- **Fix:** el envío va con el ancho de escritorio por omisión (como `loguearse` y `R-login-con-activacion`) y vuelve al de celular en un `finally`
- **Files modified:** `.planning/debug/probes/panel-exit-en-la-app.mjs`
- **Commit:** `2ed78db`

**Total deviations:** 2, las dos en el instrumento (P-1), ningún `esperado` cambiado. **Impact:** ninguno sobre la app.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno nuevo. El T-03-104 (canal en producción) queda mitigado por el task 1. El residuo declarado del
plan sigue igual: el reemplazo de `process.env.NODE_ENV` en el bundle de producción es un hecho de Next
(sus docs), no se midió con un build para no mover el entorno del `next dev` del dueño.

## Next

**Re-planificar con el dueño.** Las preguntas que deja la parada:

1. **`G3-5`:** el atrás de teclado en escritorio no atrapa al dueño, pero el aviso no se queda al soltar
   las teclas y la salida es sin aviso visible. ¿Se busca que el aviso se quede (lo que el arreglo
   `panelExitKeyStep` del plan haría con el aviso; el segundo atrás saldría igual) o se declara como costo
   del escritorio? Y la premisa del camino 1 en esta secuencia (activación ANTES de un retroceso) queda
   para el 4.3 del dueño con el atajo real.
2. **`G3-7`:** confirmado; su arreglo (`panelExitForeignRetry` + el reintento desde el efecto del armado)
   está escrito en el plan y no se aplicó por P-4. ¿Se ejecuta en un plan nuevo?

MOB-04, MOB-05 y MOB-06 siguen **SIN marcar**; `requirements.mark-complete` no se corrió.

## Self-Check: PASSED

- FOUND: `lib/panel-branch.ts`, `test/panel-branch.test.ts`, `.planning/debug/probes/panel-exit-en-la-app.mjs`, `.planning/debug/la-absorcion-que-no-absorbe-medida.md`
- FOUND commits: `ddf96f9`, `68cf232`, `2ed78db`
