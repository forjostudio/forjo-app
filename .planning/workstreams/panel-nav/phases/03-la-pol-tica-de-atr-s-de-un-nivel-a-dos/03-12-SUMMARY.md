---
phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos"
plan: "12"
subsystem: panel-nav / sentinel de salida (MOB-05)
status: complete
tags: [medicion, cdp, sentinel, intervencion-de-historial, diagnostico]
requires: ["03-11"]
provides:
  - "canal de diagnostico inerte del sentinel de salida (recordExitDiag)"
  - "sonda de la app real por CDP con el atras de la INTERFAZ del navegador"
  - "veredicto de G3-2 / G3-3 en .planning/debug/la-absorcion-que-no-absorbe-medida.md"
affects: ["03-13"]
tech-stack:
  added: []
  patterns:
    - "canal de diagnostico abierto desde afuera (Page.addScriptToEvaluateOnNewDocument) y espejado por Runtime.addBinding"
    - "atras de la interfaz por chrome.tabs.goBack desde una extension de prueba cargada con Extensions.loadUnpacked por la tuberia de CDP"
key-files:
  created:
    - .planning/debug/probes/panel-exit-en-la-app.mjs
    - .planning/debug/la-absorcion-que-no-absorbe-medida.md
  modified:
    - lib/panel-branch.ts
    - test/panel-branch.test.ts
    - .planning/debug/pila-de-dos-niveles-medida.md
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-2.md
    - .planning/WINDOWS.md
key-decisions:
  - "G3-2 y G3-3 son UNA causa y no es la referencia: la intervencion de historial de Chrome saltea la entrada de Inicio porque el sentinel se empuja sin activacion del usuario (al montar y desde el temporizador); holding=true en los dos"
  - "La recarga del 1.3 tiene DOS causas: la misma intervencion y un defecto de logica (la septima regla declina sin acreditar con el frjExit de una instancia muerta) — para esta segunda se elige la opcion (A)"
  - "El doble montaje del servidor de desarrollo queda DESCARTADO: cero popstate sin gesto y un armado al montar con el modo estricto activo y apagado"
  - "Ninguna de las cuatro opciones del plan (A-D) toca la causa de G3-2/G3-3: cuando se arma el sentinel es una decision del dueno (armar tras un toque, o aceptar el limite) y el 03-13 no se puede planear sin ella"
requirements-completed: [MOB-04, MOB-05, MOB-06]
duration: 60min
completed: 2026-10-28
plan_head_before: 6b61a24eee2ce44772c4a3de40cace3abd1468b8
actuals:
  tokens: 28800
  tasks: 3
  commits: 5
coverage:
  - deliverable: "canal de diagnostico inerte, total y acotado (recordExitDiag + 2 call sites)"
    verification: { kind: test, ref: "test/panel-branch.test.ts — recordExitDiag (8 casos); vitest pure 296/296", status: pass }
    human_judgment: false
  - deliverable: "las dos decisiones puras, el temporizador y la constante unica intactos"
    verification: { kind: gate, ref: "gates del task 1: 7 none / 4 ignore / 0 instrumento adentro; 1 setTimeout / 2 PANEL_EXIT_HINT_MS", status: pass }
    human_judgment: false
  - deliverable: "sonda de la app real (3 recorridos, piso del tiempo, afirmacion de llegada)"
    verification: { kind: probe, ref: ".planning/debug/probes/panel-exit-en-la-app.mjs — 4 corridas; los dos gates nuevos probados en rojo", status: pass }
    human_judgment: false
  - deliverable: "veredicto con causa nombrada, una-o-dos, doble montaje y decision con 4 opciones"
    verification: { kind: gate, ref: "gate del task 3 (398 lineas, 4 opciones, A11, item 20, PANEL_EXIT_HINT_MS)", status: pass }
    human_judgment: false
  - deliverable: "que Chrome de Android y Safari de iOS se comporten como Chrome de escritorio (A11)"
    human_judgment: true
    rationale: "El instrumento es Chrome de escritorio; los dos motores reales solo se cierran con el telefono del dueno"
  - deliverable: "eleccion entre armar tras un toque o aceptar el limite para G3-2/G3-3"
    human_judgment: true
    rationale: "Cambia lo que MOB-05 promete: es decision de producto del dueno (regla 4)"
---

# Phase 3 Plan 12: la absorción que no absorbe — medida Summary

**`G3-2` y `G3-3` no son la divergencia entre la referencia y la URL. Son una sola causa: la intervención de historial de Chrome saltea la entrada de Inicio porque el sentinel se empuja sin activación del usuario. Lo midió la app real por CDP con el atrás de la interfaz del navegador; el doble montaje quedó descartado y la recarga suma un defecto de lógica aparte.**

## Performance

- **Duration:** ~60 min (2026-10-28T19:59Z → 20:59Z)
- **Tasks:** 3/3
- **Files:** 2 creados, 5 modificados (`next.config.ts` mutado dos veces y restaurado por huella: no está en ningún commit)

## La causa, con sus números

| Corrida (mismo servidor, misma sesión) | R-1.3-nueva | R-1.3-recarga | R-3.1 |
|---|---|---|---|
| atrás de la **interfaz** · estricto activo | FALLA: sale del sitio | FALLA 0/3: sale del sitio | FALLA: el 2º atrás sale |
| navegación a la **entrada** anterior · estricto activo | OK | FALLA 0/3: `holding=false`, ignore | OK |
| **interfaz** · estricto apagado | FALLA: sale del sitio | FALLA 0/3: sale del sitio | FALLA: el 2º atrás sale |
| **entrada** · estricto apagado | OK | FALLA 1/3 (dos `id` coincidieron por azar) | OK |

- **`G3-3` (1.3 pestaña nueva):** armado `accion=arm regla=ninguna-ARMA vivo_despues=true`. El atrás de la interfaz da `entradas_salteadas=1 ruta_despues=(afuera)` y **ningún** `popstate` llega al documento. Con el gesto `entrada`: `accion=hint holding=true`. Única diferencia: si el gesto respeta la intervención.
- **`G3-2` (3.1):** el primer atrás avisa; a los `2903 ms` (medidos dentro de la página) el temporizador re-arma (`arm`); el segundo atrás de la interfaz saltea Inicio (`entradas_salteadas=1`). Con `entrada`, avisa.
- **¿Una causa o dos?** `G3-2` y `G3-3`: **una**. La recarga: **dos**. La de la recarga es la misma intervención más el sospechoso que el plan nombró: `frjExit` preservado ≠ `id` nuevo (pares medidos `1→21`, `21→1`, `1→5`, `1→157`, `1→43`, `37→108`, ...; coinciden `1→1` por azar) ⇒ la séptima declina sin acreditar ⇒ `regla-4-holding-false` ⇒ ignore.
- **Doble montaje: DESCARTADO.** `popstates_sin_gesto=0`, `armados_al_entrar=1` en las cuatro corridas.
- **El ítem 20 de la ronda 1, ponderado:** la causa medida no depende de `branchCarryMark`; existe desde el plan `03-03`. Es consistente con el ítem 20 y con `G-5`, pero esas rondas no se re-midieron.

## La opción de diseño, y por qué el 03-13 no puede arrancar todavía

- **(A)** (acreditar en el armado cuando la séptima declina) queda **elegida, pero sólo para el defecto de lógica de la recarga**. No agrega número, temporizador ni fuente: cambia quién escribe la única referencia.
- **(B), (C) y (D)** descartadas (segunda fuente / imposible / el bug de E-13 B), y además **ninguna toca `G3-2`/`G3-3`**: ahí no llega ningún `popstate`.
- **Para `G3-2` y `G3-3` hay que cambiar *cuándo* se arma el sentinel**, y eso le toca decidirlo al dueño: (1) armar recién con un toque del dueño en Inicio, con el costo de que entrar y apretar atrás sin tocar nada salga sin aviso, o (2) aceptar el límite y declararlo. **El plan `03-13`, tal como está escrito, arreglaría el problema equivocado.**

## Tareas

| # | Tarea | Commit | Archivos |
|---|---|---|---|
| 1 | Instrumento de punta a punta (tracer, TDD) | `df701fb` (RED), `033275e` (GREEN), `3319b78` (sonda) | `test/panel-branch.test.ts`, `lib/panel-branch.ts`, `panel-exit-en-la-app.mjs` |
| 2 | Los otros dos recorridos + doble montaje resuelto | `a2edbfc` | `panel-exit-en-la-app.mjs` (y `next.config.ts` mutado/restaurado, fuera de los commits) |
| 3 | El veredicto y la decisión | `987d454` | veredicto, `pila-de-dos-niveles-medida.md`, `03-UAT-2.md`, `WINDOWS.md` |

## TDD Gate Compliance

- **RED** (`df701fb`): `npx vitest run --project pure test/panel-branch.test.ts lib/panel-history.test.ts` → **7 fallados / 289 pasados / 296, rc 1**. Los tres criterios se verificaron a mano (`gsd_run check tdd-red-evidence` no parsea vitest): (1) rc ≠ 0; (2) fallan los casos nombrados del canal (`INERTE…`, `ACOTADO…`, `TOTAL…`, `se graba DESPUÉS…`); (3) son fallas sobre el comportamiento planeado (`PB.recordExitDiag is not a function` por el namespace, que **no** es un rojo del loader; `expected +0 to be 3` en la auditoría de fuente). El octavo caso (*cero menciones adentro de las decisiones puras*) pasa desde el principio a propósito: es el candado que no puede romperse después.
- **GREEN** (`033275e`): 296/296, rc 0.
- **REFACTOR:** ninguno; no hacía falta.
- ⚡ Tracer verificado de punta a punta (la sonda corrió `R-1.3-nueva`, rc 0) antes de expandir.

## Los rojos probados (todos con la restauración verificada por huella)

- **Instrumento:** el gate contaba `recordExitDiag`=**0** antes del task 1 (auditoría de fuente: `expected +0 to be 3`); después **3**.
- **Piso del tiempo transcurrido:** `MARGEN_MS = -1500` ⇒ `transcurrido=509 ms`, `R-3.1` FALLA en `transcurrido_supera_la_ventana`, rc 1. Restaurado: huella `425e4e0f…` igual.
- **Afirmación de llegada:** credencial rota ⇒ rc 1, *"no se pudo llegar a Inicio: ruta=/login contenedor_del_aviso=false"*, **cero** recorridos medidos. Restaurado: misma huella.
- **Documentos:** el veredicto no existía y el registro tenía 18 entradas; ahora existe (398 líneas) y el registro tiene **19** (por el CLI, JSON parsea, 10 filas de la tabla 10-19).

## `next.config.ts`

Huella antes `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`, después `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`. Las cuatro entradas de `allowedDevOrigins` están, `reactStrictMode` no aparece en el archivo y `git status` lo da limpio. Ningún commit del plan lo toca. ⚠ El servidor del dueño se reinició **cuatro** veces (una por cada mutación y cada restauración). Después del **primer** reinicio sirvió `/login` con **404** durante unos dos minutos y se recuperó solo en el siguiente; terminó en `/login` 200 con el pid 13260.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Next 16 no deja levantar un segundo `next dev` sobre el mismo directorio**
- **Found during:** Task 1 (la primera corrida de la sonda)
- **Issue:** el dueño tenía un `next dev` vivo en el **puerto 80** (pid 14456, desde el 2026-10-26). El orquestador sólo había revisado el 3000. Next toma un candado en `.next/dev/lock` y el segundo sale con *"Another next dev server is already running"*.
- **Fix:** si el candado apunta a un proceso vivo que responde, la sonda mide contra **ese** servidor y no lo levanta ni lo mata. Si no hay ninguno, levanta el suyo en el 3031 como pedía el plan. Además es exactamente el entorno donde el dueño midió.
- **Files:** `.planning/debug/probes/panel-exit-en-la-app.mjs` · **Commit:** `3319b78`

**2. [Rule 1 - Bug del instrumento] En mobile el formulario de login vive en una hoja**
- **Fix:** el ancho del teléfono se emula **después** del login · **Commit:** `3319b78`

**3. [Rule 1 - Bug del instrumento] Un toque de la barra se asentaba antes de que la ruta llegara (la primera compilación de la sección)**
- **Fix:** `tocarEnLaBarra` espera la ruta y recién después se asienta · **Commit:** `a2edbfc`

**4. [Rule 2 - Corrección de la medición] El gesto de atrás que el plan daba por "real" no lo era**
- **Found during:** Task 1/2 (calibración)
- **Issue:** ninguno de los gestos de CDP del molde (`navigateToHistoryEntry`, el botón atrás del mouse, `history.back()`) respeta la intervención de historial del navegador. Por eso la sonda estática dio 18/18 cuatro veces mientras el teléfono fallaba.
- **Fix:** gesto `interfaz` (por defecto): `chrome.tabs.goBack` desde una extensión de prueba que la sonda escribe en un directorio temporal y carga con `Extensions.loadUnpacked` por la tubería de CDP. Calibrado: sin activación saltea, con activación no. El gesto `entrada` se conserva para medir la lógica sola. Cero paquetes nuevos.
- **Commit:** `a2edbfc`

**5. [Alcance] `R-3.1` arranca por el camino del 1.2 (con toques reales) y no por la entrada directa.** Para interrogar el **re-armado**, el primer atrás tiene que avisar, y desde la entrada directa ese primer atrás es el 1.3.

**Total:** 5. Impacto: el instrumento mide lo que el teléfono mide. La medición **refuta la premisa central del plan** para `G3-2`/`G3-3`, y eso es un resultado: queda escrito, no se lo forzó a encajar.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: test-only-surface | .planning/debug/probes/panel-exit-en-la-app.mjs | La sonda lanza Chrome con `--enable-unsafe-extension-debugging` y `--remote-debugging-pipe`, en un perfil temporal y desechable, y carga una extensión de prueba escrita en otro directorio temporal (se borran los dos al salir). No toca la app ni producción. |

## Hallazgo lateral (medido, NO arreglado)

Si el dueño toca un destino de la barra estando en Inicio armado, el `popstate` del consumo llega con `holding=false` (T-03-29) y el **cuarto momento de reintento** vuelve a armar antes de que la navegación diferida empuje el destino. La pila queda `[(afuera), /dashboard, /dashboard#salir, /clients]`: es el sentinel enterrado de E-9, que reaparece por el reintento del 03-07. Hoy no se ve, pero el 03-13 tiene que tenerlo en cuenta.

## Verificación del plan

- Sonda estática: **18/18**, rc 0 (por el turno).
- Sonda de la app: **3** recorridos con su tupla y la regla nombrada, **0** fallos de llegada (rc 1 esperado: mide, no arregla).
- `npx vitest run`: **110 archivos, 1957 pasados, 4 expected-fail, 1 salteado, rc 0** (20:56 hora AR, dentro de la ventana de los canarios).
- `tsc --noEmit`: 0 errores. eslint sobre los tres archivos tocados: rc 0.
- Constante única: 1 temporizador, 2 usos. Decisiones puras: 7 / 4 / 0 instrumento adentro. Retrocesos: 2.
- Archivos intocables sin tocar. MOB-04/05/06 **SIN marcar**; `requirements.mark-complete` **no** se corrió. Los puertos 3031 y 9335 quedaron libres; el 3000 nunca se usó.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- FOUND: `.planning/debug/probes/panel-exit-en-la-app.mjs`, `.planning/debug/la-absorcion-que-no-absorbe-medida.md`
- FOUND commits: `df701fb`, `033275e`, `3319b78`, `a2edbfc`, `987d454`
