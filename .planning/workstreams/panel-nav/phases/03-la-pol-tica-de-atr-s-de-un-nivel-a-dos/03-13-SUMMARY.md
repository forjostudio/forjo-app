---
phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos"
plan: "13"
subsystem: panel-nav / sentinel de salida (MOB-05)
status: complete
tags: [sentinel, activacion-del-usuario, intervencion-de-historial, camino-1, opcion-a, cdp]
requires: ["03-12"]
provides:
  - "el sentinel de salida se empuja SOLO con activacion del usuario (camino 1 del dueno, 2026-10-28)"
  - "el aviso de salida no vence: lo levanta el atras absorbido y lo baja el toque, cero temporizadores"
  - "la recarga del 1.3 acredita sobre la marca de una instancia muerta (opcion A, otro dueno corregido)"
  - "sonda de la app real con la calibracion del navegador y once recorridos con el atras de la interfaz"
affects: ["03-14 o la ronda nueva si la ronda 3 falla", "cierre de la fase 3"]
tech-stack:
  added: []
  patterns:
    - "navigator.userActivation.isActive leido UNA vez por gesto como el hecho puedeEmpujar, sin valor por omision"
    - "oyente de click/keyup en la burbuja de window: defaultPrevented dice si un link se llevo el gesto"
    - "acreditacion que ASIGNA (re-deriva en los dos sentidos) en vez de encender"
key-files:
  created:
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-13-SUMMARY.md
  modified:
    - lib/panel-branch.ts
    - test/panel-branch.test.ts
    - test/panel-nav-chrome.test.ts
    - .planning/debug/probes/panel-exit-en-la-app.mjs
    - .planning/debug/la-absorcion-que-no-absorbe-medida.md
    - .planning/workstreams/panel-nav/REQUIREMENTS.md
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-2.md
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-GUION-3.md
    - .planning/WINDOWS.md
key-decisions:
  - "El sentinel se empuja SOLO con activacion del usuario: armarSentinel recibe puedeEmpujar sin default; efecto y toque lo leen con panelExitActivationNow; los dos reintentos del popstate lo pasan en falso; sin activacion el armado queda pendiente y no empuja"
  - "El aviso no vence: se borraron PANEL_EXIT_HINT_MS y su temporizador; un lugar lo levanta (el atras absorbido) y uno lo baja (alTocar, que re-arma con la activacion leida); el hook devuelve hintVisible && pathname === root"
  - "Un toque que un link se lleva (defaultPrevented) baja el aviso y NO arma: empujar y navegar en el mismo gesto entierra el sentinel o lo pisa el replace del router"
  - "Otro dueno para la acreditacion de (A) es ajena Y sin marca de salida: isForeignOwnedEntry a secas reconoce el frjExit de cualquier id y rechazaria justo la entrada de la recarga"
  - "La calibracion dio la rama (b): un empuje a los 7 s de un click real NO quedo salteable con isActive en falso, asi que el gate es mas estricto que el navegador (la direccion segura)"
requirements-completed: [MOB-04, MOB-05, MOB-06]
duration: 47min
completed: 2026-10-29
plan_head_before: 4a31ee88c5b7f569c6983d782fefac487d11946e
actuals:
  tokens: 39700
  tasks: 4
  commits: 7
coverage:
  - deliverable: "panelExitActivationNow y panelExitTouchAction, puras, con sus reglas en orden"
    verification: { kind: test, ref: "test/panel-branch.test.ts — 4 + 8 casos; vitest pure 382/382", status: pass }
    human_judgment: false
  - deliverable: "el empuje SOLO con activacion: un empuje guardado por puedeEmpujar, cero empujes desde un popstate, cero literales verdaderos"
    verification: { kind: gate, ref: "gates del task 2 (16 + 12 contadores de igualdad) y la guarda anulada en rojo (1 fallado, huella 7480966d igual)", status: pass }
    human_judgment: false
  - deliverable: "el aviso que no vence: cero tiempo en el ciclo, un escritor que levanta y uno que baja"
    verification: { kind: gate, ref: "tiempo=0, ventana=0, setHintVisible true/false 1/1; R-3.1 con transcurrido=10915 ms y el piso probado en rojo (1007 ms)", status: pass }
    human_judgment: false
  - deliverable: "panelExitStillHolding (opcion A) cableada por asignacion en la rama none"
    verification: { kind: test, ref: "10 casos incl. la instancia MUERTA y el par de composicion; la asignacion revertida en rojo (1 fallado, huella 88ec2e82 igual)", status: pass }
    human_judgment: false
  - deliverable: "las decisiones puras, la politica de la pila, branchCarryMark y la barra intactas"
    verification: { kind: gate, ref: "7 none / 4 ignore; panelNavMode 6/5; panelBranchPlan 6/2; branchCarryMark 4; ancho 0; intocables limpios", status: pass }
    human_judgment: false
  - deliverable: "la sonda de la app real: calibracion + once recorridos con el atras de la interfaz"
    verification: { kind: probe, ref: ".planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz — 11/11 OK, rc 0", status: pass }
    human_judgment: false
  - deliverable: "no-regresion de la sonda estatica"
    verification: { kind: probe, ref: ".planning/debug/probes/panel-back-stack.mjs — 18/18, E-17 y E-18 en OK, sin modificar", status: pass }
    human_judgment: false
  - deliverable: "los documentos con la promesa nueva de MOB-05 y el costo declarado antes de la ronda"
    verification: { kind: gate, ref: "los dos gates del task 4 (11 + 14 contadores); WINDOWS.md 20/20/20", status: pass }
    human_judgment: false
  - deliverable: "que el aviso funcione en Android Chrome y en iPhone Safari (A11) con las expectativas nuevas: ronda 3 desde el principio"
    human_judgment: true
    rationale: "Todo lo medido es Chrome de escritorio headless; el toque de la sonda llego siempre como click de mouse (la forma del dedo no produjo click). Solo el telefono del dueno en los dos motores cierra A1, A2 y A11 y marca MOB-04/05/06. Checkpoint blocking-human PENDIENTE DE LA PERSONA"
  - deliverable: "si la consecuencia del 1.4 (llegar a Inicio con el atras sale sin aviso) se acepta o se cambia por mostrar el aviso al volver"
    human_judgment: true
    rationale: "Decision de producto del dueno: el plan la declara como costo y deja la alternativa escrita, sin construirla"
---

# Phase 3 Plan 13: el sentinel se empuja sólo con un toque del dueño Summary

**El sentinel de salida ahora se empuja sólo con activación del usuario, y el aviso se queda hasta el próximo toque, que lo baja y re-arma. La recarga del 1.3 acredita sobre la marca de una instancia muerta (opción A, con *otro dueño* corregido contra el código). Lo midió la app real con el atrás de la interfaz: once recorridos en verde, con la calibración del navegador primero. La ronda 3 en los dos teléfonos queda PENDIENTE DE LA PERSONA.**

## Performance

- **Duration:** ~47 min (2026-10-29T12:23Z → 13:10Z)
- **Tasks:** 4/5. El task 5 es el checkpoint `blocking-human` y **no se ejecutó**: queda PENDIENTE DE LA PERSONA
- **Files:** 9 modificados (1555 inserciones, 238 borrados); `next.config.ts` sin tocar, huella `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578` antes y después y fuera de todo commit

## La calibración del navegador (task 1, antes de tocar producción)

`C-activacion` corrió sobre `/login`, antes del login, con Chrome/155 de escritorio y el gesto `interfaz`. Se midió en tres corridas con los mismos resultados:

| Fila | Qué | Resultado |
|---|---|---|
| 1 | click real y empuje a los **2-4 ms** | **no salteada** (`entradas_salteadas=0`, `isActive=true` al empujar) |
| 2 | click real y empuje a los **7010-7017 ms** | **no salteada**, con `isActive=false` y `hasBeenActive=true` al empujar |
| 3 | empuje **sin** activación y un click real **después** | **no salteada**: una activación posterior **cura** la entrada |
| 4 | `isActive` adentro del `pointerdown` de un toque emulado / del `click` real | `false` / `true` |

**Rama que aplicó: (b).** La fila 1 dio "no salteada", así que la premisa vale y el plan sigue. La fila 2 dio "no salteada" con `isActive` en falso: el gate queda **más estricto** que el navegador, que parece mirar la activación pegajosa. Deja el armado pendiente donde un empuje habría servido, que es la dirección segura, y está declarado en MOB-05 y en la entrada 20. La fila 4 confirma con números por qué no se arma en `pointerdown`.

## El rojo del tracer contra el código de hoy (task 1)

`node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz` salió con **rc 1**:

- `FALLA R-1.3-sin-toque`: `hash_al_entrar="#salir"` (esperado `""`) y `accion_del_armado="arm"` (esperado `pendiente`). `absorbido="no"` y `ruta_despues="(afuera)"` ya coincidían. Es el empuje sin activación al montar, con un hash que miente.
- `OK  R-1.3-con-toque`: pasó **contra el código de antes del arreglo**. Es la fila 3 de la calibración: el toque curó el empuje sin activación del montaje. Lo que el arreglo cambia ahí es que **sin** toque ya no queda un hash que mienta.

## Los rojos de la suite, anotados a mano (TDD)

- **Task 2 (RED, commit `c5c9f3c`):** `npx vitest run --project pure` sobre los tres archivos dio rc **1**: **26 fallados**, 346 pasados (372). Hubo 14 `AssertionError` del cableado y las auditorías, por ejemplo `expected 2 to be +0` (la constante seguía en el módulo), `expected 3 to be 4` (el canal sin su tercer call site) y `expected '... if (paradoSobreElNuestro) ...' to contain 'puedeEmpujar'` (el empuje sin guarda). Los otros 12 fueron `TypeError: panelExitActivationNow / panelExitTouchAction is not a function`: el comportamiento planeado todavía no existía y se afirma por namespace.
- **Task 3 (RED, commit `117c537`):** rc **1**, **9 fallados** de 382: 8 `TypeError: panelExitStillHolding is not a function` y 1 `AssertionError: expected +0 to be 1`, la asignación de la rama `none`. La contracara (*con la acreditación vieja se ignora*) **pasa a propósito**: fija el comportamiento viejo.

## El mapa de los gates viejos a sus reemplazos (task 2)

| Gate viejo | Reemplazo |
|---|---|
| `test/panel-branch.test.ts` *la constante existe y vale 2000* | *la constante de la ventana NO existe*: `'PANEL_EXIT_HINT_MS' in PB` en falso y 0 menciones en el módulo |
| *2 usos de la constante, 1 temporizador* | *CERO tiempo en el ciclo* (0 `setTimeout\|setInterval\|requestAnimationFrame\|clearTimeout`) **más** el nuevo *UN lugar levanta y UN lugar lo baja* (por región: retroceso y toque) |
| *cero gate de viewport* | queda tal cual |
| *G-5: al menos 4 llamadas sin argumentos al armado* | **4** `armarSentinel({` y las **2** del retroceso con `puedeEmpujar: false` |
| *la rama de ignorar re-arma; 3 llamadas en el manejador* | ignorar re-arma **sin poder empujar**; el manejador tiene 2 llamadas, 0 `pushState` y 0 lecturas de la activación |
| *G-6: entre el aviso y el temporizador no hay re-armado* | *G-6 sin temporizador*: desde `setHintVisible(true)` hasta el final, 0 re-armados y 0 empujes |
| *al expirar la ventana se oculta y se re-arma* | *el TOQUE baja el aviso y re-arma*: decisión → canal → bajar → armar con la activación leída. Se conserva `panelExitArmAction` todo en falso ⇒ `arm` |
| *un solo temporizador, la constante en 2* | *el ÚNICO empuje vive en un `if (` que nombra `puedeEmpujar`*, 0 literales verdaderos, y el efecto lee la activación (lo de tiempo lo cubre *cero tiempo en el ciclo*) |
| *el canal: 1 declaración + 2 call sites; temporizador 1, constante 2* | 1 + **3** call sites (el del toque, después de su decisión); temporizador **0**, constante **0** |
| `test/panel-nav-chrome.test.ts` *la ventana no se re-declara en el componente* | *el componente no trae tiempo, y el módulo del ciclo tampoco* |

Suman además 4 auditorías del cableado: la firma sin valor por omisión, los oyentes en el mismo efecto con `Enter` y la barra espaciadora, el aviso derivado de la raíz, y las dos decisiones puras. `.planning/WINDOWS.md` no tenía una entrada de la constante, así que no hubo nada que reemplazar.

## Los rojos probados (todos con la restauración verificada por huella)

| Gate | Mutación | Resultado | Huella antes = después |
|---|---|---|---|
| La guarda del empuje (task 2) | el `if (` del empuje pasa a preguntar por `true` | rc 1, **1 fallado** (*el ÚNICO empuje ... nombra el hecho*) | `7480966d9639ca76d511f3f15c93b5fc15fb0bb5` |
| La acreditación de (A) (task 3) | la rama `none` vuelve a `if (paradoSobreElNuestro) sentinelVivoRef.current = true` | rc 1, **1 fallado** (*el cableado: la rama none ASIGNA*) | `88ec2e8272c8e83fb1360878ce6a526b2d596128` |
| El piso del tiempo de `R-3.1` (task 3) | `MARGEN_MS = -9000`, la sonda corrida sólo con `R-3.1` | rc 1, `FALLA R-3.1` sólo en `transcurrido_supera_la_espera` (`transcurrido=1007 ms`), 1 recorrido corrido | `338c1ef792fdf1448b13e621792df9e730345d3f` |

⚠ **Las dos pruebas en rojo sobre `lib/panel-branch.ts` (tasks 2 y 3) dispararon recargas en caliente de segundos en el `next dev` del dueño** (pid 13260, puerto 80). Se corrieron con el dueño avisado de no usar el servidor desde el teléfono, y sus respaldos fueron a un directorio temporal (`mktemp -d`), nunca a la raíz del repo. La mutación de la sonda no dispara recarga porque vive en `.planning/`.

## La sonda de la app con el gesto `interfaz` (el gate del arreglo)

Corrida contra el `next dev` del dueño (pid 13260, puerto 80) con `node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz`: **rc 0, 11/11 en `OK`**, llegada afirmada, el toque afirmado por `sonda-click`.

| Recorrido | Lo medido |
|---|---|
| `C-activacion` | fila 1 no salteada; `isActive` en el click `true` |
| `R-1.3-sin-toque` | sin hash al entrar, armado `pendiente`, no absorbido, `(afuera)`: el costo declarado |
| `R-1.3-con-toque` | toque ⇒ `toque arm` ⇒ `armado arm` ⇒ `#salir` ⇒ atrás `hint`, aviso visible |
| `R-1.3-recarga-logica` | 3/3 `none` con `vivo_despues=true` (en esa corrida los `id` coincidieron, `1→1`, por la cuarta) |
| `R-1.3-recarga-gesto` | (i) sin tocar y (ii) con un toque: 3/3 absorbidos cada una |
| `R-1.1` | Turnos, Clientes, Agenda, Inicio ⇒ `/dashboard#salir`, primer atrás absorbido, segundo `(afuera)` |
| `R-3.1` | A: el aviso sigue a la espera corta (sin hash) y a la larga, `transcurrido=10915 ms`, con el aviso el atrás sale `(afuera)`. B: el toque baja el aviso, el hash vuelve y el atrás vuelve a avisar |
| `R-1.4` | A: con el atrás ⇒ `/dashboard` sin hash, armado `pendiente`, sin aviso, el atrás siguiente `(afuera)`. B: con un toque, `#salir` y absorbido |
| `R-barra-con-aviso` | toque `drop` (`gestoTomado=true, hintOpen=true`), `/clients`, sin aviso, pila `(afuera),/dashboard,/clients`, sin `#salir` |
| `R-barra-pendiente` | toque `none` (gesto tomado), la misma pila, sin `#salir` |
| `R-lateral` | `#salir` armado tocando ⇒ tocar Clientes ⇒ retroceso del consumo `ignore` ⇒ armado `pendiente`; pila `(afuera),/dashboard,/clients` |

**La séptima regla, medida en la app** con una corrida extra de los dos recorridos de recarga (rc 0, los dos en `OK`). Pares preservado→nuevo: `1→25` (`septima-urlYaLlevaNuestroHash(E-13)`, `vivo_despues=true`), `1→59`, `59→301` y `301→1`, todos absorbidos. Así (A) quedó medida también en la app y no sólo en la suite.

**`R-1.3-recarga-gesto`: no aplicó ninguna de sus tres ramas.** (i) no salió salteada, así que no hay costo de recarga que declarar, y ningún `esperado` se cambió.

## La sonda estática (no-regresión)

`node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs`: **rc 0, 18/18 en `OK`**, `E-17` y `E-18` incluidos, la sonda **sin modificar**.

## La suite completa

`npx vitest run`: **rc 0 · 110 archivos · 1984 pasados · 4 expected-fail · 1 salteado** (1989). Corrió a las 10:01 hora de Argentina, adentro de la ventana de los canarios de reloj. La base era 1957; este plan suma **27** casos, por encima del piso de 1979. El task 2 sumó 17 (los 12 del behavior más 5 auditorías) y el task 3 sumó 10. `./node_modules/.bin/tsc --noEmit`: sin `error TS`. `./node_modules/.bin/eslint` sobre los archivos tocados: rc 0.

## Tareas

| Task | Nombre | Commit(s) | Archivos |
|---|---|---|---|
| 1 | El instrumento: la calibración y el arnés del toque | `df9b5db` | `.planning/debug/probes/panel-exit-en-la-app.mjs` |
| 2 | El sentinel sólo con activación (tracer) | `c5c9f3c` (test), `e9cfb6b` (feat) | `lib/panel-branch.ts`, `test/panel-branch.test.ts`, `test/panel-nav-chrome.test.ts` |
| 3 | La recarga por (A) y la cobertura de la sonda | `117c537` (test), `4e05799` (feat), `62563c4` (test, sonda) | `lib/panel-branch.ts`, `test/panel-branch.test.ts`, la sonda |
| 4 | Los documentos | `433e41c` | `REQUIREMENTS.md`, el veredicto, `03-UAT-2.md`, `03-UAT-GUION-3.md`, `WINDOWS.md` |
| 5 | La ronda 3 en los dos motores | — | **PENDIENTE DE LA PERSONA** (checkpoint `blocking-human`, no ejecutado) |

⚡ Tracer verificado de punta a punta antes de expandir: después del GREEN del task 2, la sonda con `interfaz` dio `C-activacion`, `R-1.3-sin-toque` y `R-1.3-con-toque` en `OK`.

## TDD Gate Compliance

`gsd_run check tdd-red-evidence` no parsea la salida de vitest en este repo, así que el RED se verificó a mano contra los tres criterios del verbo:

- **Task 2:** el commit `test(03-13)` `c5c9f3c` va **antes** del `feat(03-13)` `e9cfb6b`. RED: rc 1 (salida distinta de cero), los casos objetivo nombrados fallan (26), y las fallas son aserciones sobre el comportamiento planeado o `TypeError` por la función planeada que todavía no existía. No hubo error de sintaxis ni cero tests descubiertos. GREEN: 372/372. REFACTOR: sin cambios, sin commit.
- **Task 3:** el commit `test(03-13)` `117c537` va antes del `feat(03-13)` `4e05799`. RED: rc 1, 9 fallados con nombre (8 `TypeError` de la función planeada y 1 aserción del cableado). GREEN: 382/382. REFACTOR: sin cambios.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] La sonda tomó por muerto el servidor del dueño justo después del recargado en caliente**
- **Found during:** Task 2 (la corrida del tracer después de la mutación en rojo)
- **Issue:** `servidorExistente` pregunta por el puerto del candado con `fetch('/')` y 1,5 s de tope. Después de las dos recargas en caliente de la mutación, ese primer pedido compiló más lento. La sonda intentó levantar su propio servidor en el 3031, Next lo rechazó por el candado y la corrida salió con rc 1 sin medir nada. El servidor del dueño estaba vivo (`/login` respondió 200 en 0,96 s).
- **Fix:** en el task 2 se calentó `/` y se volvió a correr, sin tocar la sonda, porque el plan dice que ese task no la toca. En el task 3, `puertoLibre` recibió un tope y el chequeo del servidor existente espera hasta 60 s.
- **Files modified:** `.planning/debug/probes/panel-exit-en-la-app.mjs`
- **Verification:** las cuatro corridas posteriores detectaron el servidor existente en el primer intento
- **Commit:** `62563c4`

**2. [Rule 1 - Bug] Las entradas de la pila de la sonda no se normalizaban**
- **Found during:** Task 3
- **Issue:** Chrome guarda la URL **sin** el puerto 80, así que `e.url.startsWith(ORIGEN)` con `ORIGEN=http://127.0.0.1:80` fallaba y la pila se imprimía con la URL entera. La comparación exacta `[(afuera), /dashboard, /clients]` de los recorridos de la barra no podía coincidir.
- **Fix:** normalizar cada entrada a ruta+hash cuando el host es `127.0.0.1`
- **Files modified:** la sonda · **Commit:** `62563c4`

**3. [Rule 1 - Bug, cosmético] `R-1.3-con-toque` imprimía como "armado al entrar" el `arm` del toque**
- **Fix:** se toma el último armado **antes** del toque · **Commit:** `62563c4`

### Notas que no son desviaciones

- **El toque de la sonda llegó siempre como click de mouse** (`forma del toque=raton`): en Chrome headless `Input.synthesizeTapGesture` con `gestureSourceType: 'touch'` no produjo ningún `click` en 1 s, así que la sonda usó el respaldo que el plan declara y lo imprimió. La forma del dedo **no** quedó medida en la app; la mide el teléfono.
- **Una corrida extra, fuera del plan:** los dos recorridos de recarga corridos solos para observar la séptima regla, porque en la corrida del gate todos los `id` coincidieron. Sólo suma evidencia.

**Total deviations:** 3 auto-fixed (1 bloqueante del instrumento, 2 bugs del instrumento). **Impact:** ninguno sobre producción. Los tres arreglos viven en la sonda y la hacen medir lo que dice.

## Threat Flags

Ninguna superficie nueva fuera del `<threat_model>`. El oyente de `click`/`keyup` sobre `window` es T-03-76 y el registro `toque` del canal es T-03-87, los dos ya registrados.

## Known Stubs

Ninguno.

## La pregunta abierta para el dueño (NO implementada)

**Recorrido 1.4.** Llegar a Inicio con el atrás del navegador no es un toque, así que sin tocar nada el atrás siguiente **sale sin aviso**. Está declarado como costo, y es una consecuencia de la regla que la decisión no listaba. La alternativa queda escrita para que el dueño la elija: **mostrar el aviso al volver a Inicio con el atrás cuando no se puede armar**. **No se construyó.**

## Estado del checkpoint bloqueante (task 5)

**PENDIENTE DE LA PERSONA.** El dueño re-corre la ronda 3 **desde el principio** en **Android Chrome y iPhone Safari**, con pestaña nueva por recorrido: los diez de Android de los bloques 1 a 3 (incluidos 1.4 y 1.5), los dos de escritorio del bloque 4 y los 21 de iPhone del bloque 6. Anota en `03-UAT-2.md` con fecha y motor. Hoy el recibo automático da rojo, como el plan lo diseñó: secciones=18 (≥19), filas `4.1`/`4.2`=0, encabezado de iPhone=0, filas de ítems=4 (≥19), `1.4`/`1.5`=0, `1.3`=1 (≥2). MOB-04, MOB-05 y MOB-06 siguen **SIN marcar**, y `requirements.mark-complete` **no** se corrió.

## Self-Check: PASSED

- `03-13-SUMMARY.md` existe.
- Los 7 commits del plan están en el log (`git log --oneline --grep="03-13"`).
- Gates re-corridos y verdes: los 3 del task 1, los 7 del task 2 (incluidos el rojo de la guarda y la sonda), los 8 del task 3 (incluidos los dos rojos, la sonda 11/11, la estática 18/18 y la suite completa) y los 2 del task 4.
- `next.config.ts` con huella `8ceb99ae…` y fuera de todo commit.
- El servidor del dueño (pid 13260) sigue escuchando en el 80; el 9335 y el 3031 están libres, sin Chrome ni node de la sonda vivos; el turno de pantalla está `LIBRE`.
