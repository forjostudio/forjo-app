---
phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos"
plan: "16"
subsystem: panel-nav / sentinel de salida (MOB-05) + el overlay de Inicio (MOB-06)
status: halted
outcome: "tasks 1-3 completos y verdes; PARADO en el task 4 (checkpoint:human-verify, gate=blocking-human), pendiente del dueño: el 4.3 y el 4.2 en el escritorio, el 3.3 y el 1.5 en Android"
checkpoint_pending: "task 4 — el dueño corre el 4.3 (atrás de teclado real), el 4.2 (click de siempre), el 3.3 (cerrar con la X el diálogo del plan) y el 1.5 (toque a la barra) y los anota en 03-UAT-2.md con fecha y motor"
tags: [g3-5, g3-7, teclado, atajo-de-atras, overlay, reintento, intervencion-de-historial, cdp]
requires: ["03-15"]
provides:
  - "G3-5 arreglado por la decisión del dueño: panelExitKeyStep + panelExitKeyId; soltar el atajo de atrás no es un toque, el aviso se queda y el segundo atrás sale con el aviso a la vista"
  - "G3-7 arreglado: panelExitForeignRetry + reintentoTrasAjenaRef + reintentoDelArmado; cerrar con la X o el fondo el diálogo del plan abierto antes del armado re-arma desde el efecto del armado"
  - "la no-regresión completa con los dos arreglos: 12/12 + 11/11 en la app, estática 18/18, suite 2030"
  - "el 4.3 y el 3.3 en el guion de la ronda 3; la sección «Los arreglos del 03-16» en 03-UAT-2.md"
affects: ["la verificación de la fase 3 (MOB-04/05/06 siguen sin marcar: se marcan en /gsd-verify-work 3 --ws panel-nav)", "el cierre de la fase 3 (la alternativa del recorrido 1.4 sigue pendiente)"]
tech-stack:
  added: []
  patterns:
    - "un conjunto de teclas apretadas DESDE EL ÚLTIMO popstate (oyente keydown en captura) para distinguir el keyup de la combinación que disparó el atrás de una pulsación nueva"
    - "el contrafáctico de una decisión pura bloqueada (la misma función con un hecho apagado) para preguntar ¿declinó SÓLO por esto?, sin un segundo dialecto de su orden"
    - "un reintento pedido desde un popstate y ejecutado por el efecto de React (un estado en sus dependencias), con la activación leída en el commit"
key-files:
  created:
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-16-SUMMARY.md
  modified:
    - lib/panel-branch.ts
    - test/panel-branch.test.ts
    - .planning/debug/la-absorcion-que-no-absorbe-medida.md
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-2.md
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-GUION-3.md
key-decisions:
  - "G3-5 se arregló por la DECISIÓN del dueño del 2026-10-30 (que el aviso se quede), no por un veredicto: la línea medida `veredicto G3-5: otro` de (h) quedó como estaba. Un keyup cuenta como toque sólo si su keydown llegó después del último popstate; la identidad de la tecla es KeyboardEvent.code (o key si viene vacío) en un solo lugar"
  - "G3-7 se arregló con el contrafáctico de panelExitArmAction (foreignOwnsTop en falso) y el empuje desde el efecto del armado, nunca desde el popstate; la intervención de historial declarada como riesgo (P-8) NO apareció: entradas_salteadas=0 en los tres recorridos"
  - "La sonda NO se tocó (ningún esperado cambiado: iguales a 993fbc5) y las reglas bloqueadas quedaron con sus números (7/4, 6/5, 6/2, 4, 6, 1/2; back 2, push 1, canal 5, armado 4, cero tiempo, cero ancho)"
requirements-completed: []
duration: 31min
completed: 2026-10-30
plan_head_before: d9d13ff252d09f74d1263f5890b70f62cead0569
estimate:
  tokens: 95000
  tasks: 4
actuals:
  # chars/4 sobre las líneas agregadas del diff d9d13ff..HEAD (5 archivos, +772/-1), sin este SUMMARY
  tokens: 13600
  # tasks 1, 2 y 3 completos; el 4 es el checkpoint bloqueante del dueño
  tasks: 3
  # MEDIDO: git rev-list --count d9d13ff..HEAD al escribir este SUMMARY (sin contar el commit de cierre)
  commits: 7
coverage:
  - deliverable: "G3-5: soltar el atajo de atrás no es un toque (panelExitKeyStep, panelExitKeyId y su cableado)"
    verification: { kind: test, ref: "test/panel-branch.test.ts — describes panelExitKeyStep (9), panelExitKeyId (3) y el cableado de G3-5 (4); vitest pure 416/416 (RED 16 fallados / 400)", status: pass }
    human_judgment: false
  - deliverable: "G3-5 en la app real: el aviso se queda al soltar y el segundo atrás sale con el aviso a la vista"
    verification: { kind: probe, ref: "panel-exit-en-la-app.mjs dev interfaz — los cuatro R-G3-5 + seis de regresión 10/10 OK, rc 0; aviso_tras_soltar=si, hash_antes=(ninguno), entradas_salteadas=0 en los dos de teclado", status: pass }
    human_judgment: false
  - deliverable: "G3-5 con el atajo REAL del navegador (Alt+flecha, Cmd+[, botón lateral del mouse)"
    human_judgment: true
    rationale: "la sonda compone el orden de los eventos de teclado por CDP alrededor del atrás de la interfaz; el acelerador real del navegador y macOS no se pueden disparar así — es el 4.3 del dueño, PENDIENTE"
  - deliverable: "G3-7: el reintento tras cerrar un diálogo de Inicio (panelExitForeignRetry y su cableado)"
    verification: { kind: test, ref: "test/panel-branch.test.ts — describes panelExitForeignRetry (8) y el cableado del reintento de G3-7 (4); vitest pure 428/428 (RED 12 fallados / 416)", status: pass }
    human_judgment: false
  - deliverable: "G3-7 en la app real: cerrar con la X o el fondo el diálogo del plan deja #salir y el atrás siguiente avisa"
    verification: { kind: probe, ref: "panel-exit-en-la-app.mjs dev interfaz — los tres R-G3-7 + R-lateral + regresión 10/10 OK, rc 0; hash_tras_cerrar=#salir, entradas_salteadas=0, sin la firma de P-8", status: pass }
    human_judgment: false
  - deliverable: "G3-7 en el teléfono (Android) y el toque a la barra sin cambios"
    human_judgment: true
    rationale: "todo lo medido es Chrome de escritorio headless; el 3.3 y el 1.5 en Android son del dueño, PENDIENTES"
  - deliverable: "la no-regresión completa"
    verification: { kind: command, ref: "los doce de antes 12/12 OK; los once R-G3-* 11/11 OK; panel-back-stack.mjs 18/18; npx vitest run 110 archivos, 2030 pasados + 4 xfail + 1 salteado; tsc --noEmit sin error TS; eslint rc 0; next.config.ts 8ceb99ae", status: pass }
    human_judgment: false
---

# Phase 3 Plan 16: G3-5 y G3-7, arreglados por decisión del dueño — Summary

**En escritorio, soltar las teclas del atajo de atrás ya no baja el aviso (un keyup cuenta como toque sólo si
su tecla bajó después del último atrás), y cerrar con la X o el fondo el diálogo del plan de Inicio vuelve a
armar el aviso desde el efecto del armado. Los dos quedaron medidos en verde en la app real, sin la
intervención de historial que se temía para `G3-7`. El plan PARÓ en su checkpoint bloqueante: falta que el
dueño corra el 4.3, el 4.2, el 3.3 y el 1.5.**

## Performance

- **Duración:** ~31 min (07:47 a 08:18, hora local del 2026-10-30)
- **Tasks:** 3 de 4 completos; el 4 es el checkpoint `blocking-human`, **pendiente**
- **Archivos tocados:** 5

## Cómo quedó cada gap

```text
cierre G3-5: arreglado
cierre G3-7: arreglado
```

| Gap | Cierre | El número que lo decidió |
|-----|--------|--------------------------|
| `G3-5` | **arreglado** (decisión del dueño; el veredicto medido sigue en `otro`) | Los dos recorridos de teclado pasaron de `FALLA` a `OK`: `aviso_tras_soltar` no → **si**, `toques_que_bajan_el_aviso` 1 → **0**, `hash_tras_soltar` `#salir` → **""**, y el segundo atrás con `hash_antes=(ninguno)`, `entradas_salteadas=0`, `ruta_despues=(afuera)` (antes `#salir` y 1). Los dos controles en `OK`. |
| `G3-7` | **arreglado** | Los tres recorridos pasaron de `FALLA` a `OK`: `hash_tras_cerrar` "" → **`#salir`**, el atrás siguiente **absorbido** con el aviso visible, `entradas_salteadas=0`. La secuencia: `retroceso ignore` → `armado pendiente` → `armado arm` (el del efecto). `R-lateral` en `OK`. |
| `G3-6`, `G3-8` | descartados en el 03-15 | sin tocar (los cuatro archivos del guard y la limpieza del estado de módulo, iguales a `993fbc5`) |

**Ninguna regla de PARAR aplicó.** P-1 (cero fallos del instrumento en las cuatro corridas), P-2, P-3, P-5,
P-6 (los dos controles de `G3-5` y `R-lateral` en `OK`), P-7 y **P-8** (ningún `R-G3-7` con `hash_tras_cerrar`
en `#salir` y el atrás siguiente salteando: el atrás siguiente absorbió en los tres).

## Task Commits

1. **Task 1 — `G3-5` de punta a punta** (tracer, TDD)
   - RED `1ac48d8` `test(03-16)`: los casos de `panelExitKeyStep`, `panelExitKeyId` y la auditoría del cableado
   - GREEN `d9e7962` `feat(03-16)`: las dos decisiones puras y el cableado
   - Cierre `cf61e1e` `docs(03-16)`: `### El cierre (plan 03-16)` en `(h)` con `cierre G3-5: arreglado`
2. **Task 2 — `G3-7`** (TDD)
   - RED `2ff59b3` `test(03-16)`: los casos de `panelExitForeignRetry` y la auditoría del reintento
   - GREEN `7722984` `feat(03-16)`: la decisión pura, la referencia, el estado y las dependencias del efecto
   - Cierre `7ed4b44` `docs(03-16)`: el tracer en `(h)` con `cierre G3-7: arreglado`
3. **Task 3 — la no-regresión y los documentos** `974fa77` `docs(03-16)`: la línea `no-regresion (plan 03-16)`
   en `(h)`, la sección «Los arreglos del 03-16» en `03-UAT-2.md`, la actualización, el 4.3 y el 3.3 del guion
4. **Task 4 — el checkpoint del dueño:** **pendiente** (sin commit).

## El RED, anotado a mano (el verbo `check tdd-red-evidence` no parsea vitest en este repo)

**Task 1**, `npx vitest run --project pure test/panel-branch.test.ts lib/panel-history.test.ts
test/panel-nav-chrome.test.ts` → **rc 1**, **16 fallados / 400 pasados (416)**:

- `panelExitKeyStep — …` (9): la trampa con la FLECHA soltada primero; la trampa con ALT soltada primero; Cmd+[
  en macOS; el contrapuesto del camino 1; una tecla común SIN retroceso de por medio; la tecla MANTENIDA; el
  borde `empty`; pureza; el borde `encoding`, la identidad
- `panelExitKeyId — …` (3): con `code` ⇒ `code`; con `code` VACÍO ⇒ `key`; sin normalizar
- `el cableado de G3-5 — …` (4): el oyente `keydown` en captura en el mismo efecto; el retroceso corta la
  combinación como PRIMERA sentencia; en el toque, el orden paso → Enter → `esToque` → canal y decisión; un solo
  dialecto de la tecla, ningún call site nuevo del canal y las dos decisiones puras

Los doce primeros fallan con `TypeError: … is not a function` (las funciones no existían); las cuatro
auditorías, en la aserción de fuente. GREEN: **416/416**.

**Task 2**, el mismo comando → **rc 1**, **12 fallados / 416 pasados (428)**:

- `panelExitForeignRetry — …` (8): regla 4 (pide); regla 1 (sin activación); regla 2 (ya `arm`); regla 3 (sin
  ajena); regla 5 (el contrafáctico también declina); de punta a punta sobre la decisión bloqueada; su
  contrapuesto con el AVISO ABIERTO; pureza
- `el cableado del reintento de G3-7 — …` (4): el contrafáctico en `armarSentinel` después de la decisión; el
  toque apaga la referencia antes de decidir; la rama `ignore` lee y apaga antes de su armado sin empuje y
  pide el reintento; las dependencias del efecto del armado

GREEN: **428/428**.

## Las corridas de la sonda de la app (todas por `scripts/con-turno.mjs`, contra el `next dev` del dueño, puerto 80, pid 13260)

- **Tracer del task 1** (07:51-07:57): `R-G3-5-escritorio-control`, `R-G3-5-teclado-flecha-primero`,
  `R-G3-5-teclado-alt-primero`, `R-G3-5-tecla-tras-el-aviso`, `R-1.1`, `R-3.1`, `R-1.4`, `R-lateral`,
  `R-barra-con-aviso`, `R-barra-pendiente` → **10/10 `OK`**, rc 0. La tupla del segundo atrás de los dos de
  teclado, idéntica en los dos órdenes:
  `tupla: hash_antes=(ninguno) es_nuestro=no estado_antes={} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no`
  (con `aviso_tras_soltar: medido="si"` tras 2500 ms quietos: el aviso estaba a la vista antes del segundo atrás).
- **Tracer del task 2** (07:59-08:04): los tres `R-G3-7`, `R-lateral`, `R-1.1`, `R-3.1`, `R-1.4`,
  `R-barra-con-aviso`, `R-barra-pendiente`, `R-G3-5-tecla-tras-el-aviso` → **10/10 `OK`**, rc 0, sin la firma
  de P-8.
- **Task 3, los doce de antes** (08:06-08:11): **12/12 `OK`**, rc 0.
- **Task 3, los once `R-G3-*`** (08:11-08:13): **11/11 `OK`**, rc 0 (`G3-5` 4/4, `G3-6` 3/3, `G3-7` 3/3, `G3-8` 1/1).

Las líneas `OK` de cada corrida están pegadas en el `### El cierre (plan 03-16)` de la sección `(h)` de
`.planning/debug/la-absorcion-que-no-absorbe-medida.md`.

**La estática** (`panel-back-stack.mjs`, por el turno, sin tocar desde `993fbc5`): **18/18**, rc 0.

**La suite completa** (`npx vitest run`, 08:14:08-08:15:10 hora local, adentro de la ventana [01:00, 23:30] de
los canarios de reloj): **110 archivos, 2030 pasados + 4 expected-fail + 1 salteado**, rc 0 (2002 de base +
16 de `G3-5` + 12 de `G3-7`). `./node_modules/.bin/tsc --noEmit`: cero `error TS`. `eslint` sobre
`lib/panel-branch.ts`, `test/panel-branch.test.ts` y la sonda: rc 0.

**Recargas en caliente:** editar `lib/panel-branch.ts` en los tasks 1 y 2 disparó recargas en caliente del
`next dev` del dueño (no se lo reinició ni se lo mató; ninguna pila de Supabase se tocó).

## Lo bloqueado, intacto

`next.config.ts` con la huella `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`; `lib/overlay-history.ts`,
`lib/dirty-history.ts`, `lib/panel-history.ts`, `scripts/con-turno.mjs`,
`components/dashboard/panel-bottom-nav.tsx` y los cuatro archivos de `G3-6` sin cambios desde `993fbc5`. Por
recorte: `panelExitArmAction` 7 `none`, `panelExitPopAction` 4 `ignore`, `panelNavMode` 6/5,
`panelBranchPlan` 6/2, `branchCarryMark` 4, `panelExitTouchAction` 6, `panelExitUnmountAction` 1/2;
`history.back()` en 2, un `pushState`, el canal en 5, `armarSentinel({` en 4, cero tiempo, cero ancho; la
limpieza de `G3-8` y la decisión de WR-05 iguales a `993fbc5`. Ningún `esperado` de la sonda cambió.

## Files Created/Modified

- `lib/panel-branch.ts` — `panelExitKeyStep`, `panelExitKeyId`, los tipos `PanelExitKeyEvent`/`PanelExitKeyStepResult`, `SIN_TECLAS`, `teclasRef`, el oyente `alApretar`; `panelExitForeignRetry`, `reintentoTrasAjenaRef`, `reintentoDelArmado` y la dependencia nueva del efecto del armado
- `test/panel-branch.test.ts` — 28 casos nuevos (16 de `G3-5`, 12 de `G3-7`)
- `.planning/debug/la-absorcion-que-no-absorbe-medida.md` — `### El cierre (plan 03-16)` al final de `(h)`
- `03-UAT-2.md` — `## Los arreglos del 03-16 — G3-5 y G3-7 (2026-10-30)`, sin filas de recibo
- `03-UAT-GUION-3.md` — la actualización del 2026-10-30, el `### 4.3` y el `### 3.3`

## Deviations from Plan

None - plan executed exactly as written. (Los gates de la sonda se corrieron en segundo plano con un script
de la scratchpad que repite el comando del gate tal cual y escribe el log en una ruta fija en vez de en un
`mktemp`; la lógica de cada gate no cambió.)

## Known Stubs

Ninguno.

## Threat Flags

Ninguno nuevo. Los oyentes nuevos (`keydown` en captura) no leen ni graban nada más que la identidad de la
tecla en una referencia de la instancia; el canal de diagnóstico sigue en 5 call sites y sólo en desarrollo.

## El checkpoint bloqueante — PENDIENTE

El task 4 (`checkpoint:human-verify`, `gate="blocking-human"`) **no se auto-aprueba**. Lo que se entregó y
espera la verificación del dueño:

- **4.3** (escritorio, nuevo): el atrás de teclado REAL — Alt+flecha izquierda (Cmd+[ en Mac, el botón lateral
  del mouse si tiene). El aviso aparece, se queda al soltar en cualquier orden, el mismo gesto otra vez sale; con
  el aviso visible, una letra lo baja, vuelve el hash y el atrás siguiente avisa.
- **4.2** (escritorio): el click de siempre, como en la re-prueba del 03-14.
- **3.3** (Android, nuevo): recién entrado a Inicio, abrir el diálogo del plan con el botón del banner, cerrarlo
  con la X (o tocando afuera) y apretar atrás ⇒ avisa y no sale; el segundo sale. Sin banner: no corrible.
- **1.5** (Android): tocar Clientes con el aviso visible, y recién entrado sin tocar nada, como dice el guion.

Se anota en `03-UAT-2.md`, en una sección nueva con fecha y motor, una fila por recorrido. MOB-04, MOB-05 y
MOB-06 siguen **SIN marcar**; `requirements.mark-complete` no se corrió.

## Next

Esperar la respuesta del dueño al checkpoint. Con todo ✅: completar este plan (SUMMARY a `complete`, la casilla
del ROADMAP) y seguir con el cierre de la fase (`/gsd-verify-work 3 --ws panel-nav`, que marca MOB-04/05/06; la
alternativa del recorrido 1.4 sigue pendiente). Con un ❌: el fallo entra como gap nuevo, sin interpretarlo ni
arreglarlo en el momento.

## Self-Check: PASSED

- FOUND: `lib/panel-branch.ts`, `test/panel-branch.test.ts`, `.planning/debug/la-absorcion-que-no-absorbe-medida.md`, `03-UAT-2.md`, `03-UAT-GUION-3.md`
- FOUND commits: `1ac48d8`, `d9e7962`, `cf61e1e`, `2ff59b3`, `7722984`, `7ed4b44`, `974fa77`
