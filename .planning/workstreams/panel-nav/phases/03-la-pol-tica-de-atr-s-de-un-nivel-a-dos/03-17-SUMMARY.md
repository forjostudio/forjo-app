---
phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos"
plan: "17"
subsystem: panel-nav / el modal de planes de Inicio (MOB-06) + el sentinel de salida (MOB-05)
status: complete
outcome: "tasks 1-4 completos; G3-9 arreglado y medido (RED → GREEN) y verificado por el dueño en el teléfono en producción el 2026-11-16 (3.4 ✅ «Todo bien», deploy f8fa76f); G3-10 medido (veredicto otro) y declarado costo del camino 1; R-login-con-activacion retirado de la no-regresión (f75e739)"
checkpoint_resolution: "task 4 (checkpoint:human-verify, blocking-human) APROBADO por el dueño el 2026-11-16 en producción (gestion.forjo.studio, deploy f8fa76f, CI run 43967813776): 3.4 ✅ «Todo bien» — ver 03-UAT-2.md § «Re-prueba tras el 03-17»"
stop_rule: "checkpoint:human-verify gate=blocking-human (task 4) — nunca se auto-aprueba. Historia: la primera ejecución paró en P-1 en la no-regresión (R-login-con-activacion NO REPRODUCE LAS CONDICIONES desde f75e739); la continuación aplicó las dos decisiones del dueño del 2026-11-16 y terminó el task 3"
tags: [g3-9, g3-10, plan-modal, scroll-por-caller, svh, intervencion-de-historial, cdp, no-regresion]
requires: ["03-16"]
provides:
  - "G3-9 arreglado en components/dashboard/plan-modal.tsx con el patrón de scroll por caller (tope 100svh-2rem, tres filas, la lista como única fila con scroll); medido RED → GREEN a 360x640, 375x667 y 390x844"
  - "G3-10 medido en la app real: veredicto G3-10: otro (con la activación viva el reintento de G3-7 empuja #salir y Chrome lo saltea: entradas_salteadas=1)"
  - "la sonda de la app con medirElModalDelPlan, cerrarConElAtras y seis recorridos nuevos (R-G3-9 ×3, R-G3-10 ×3) antes de R-G3-8-rebote"
  - "la auditoría de sólo lectura de los diálogos: 33 call sites, 3 con alto máximo, 30 sin"
  - "G3-10 declarado costo del camino 1 (decisión del dueño del 2026-11-16) en 03-DECISION-UAT-3.md y en el 3.3 y el 3.4 del guion, con el veredicto otro intacto"
  - "R-login-con-activacion retirado de la no-regresión (marcado obsoleto en la sonda, código y esperado intactos); el conjunto de antes pasa a once"
  - "la sección del 03-17 en 03-UAT-2.md, la actualización del 2026-11-16 y el ### 3.4 en el guion"
affects: ["el checkpoint bloqueante del 3.4 (el dueño, en el teléfono, en producción, después del push del orquestador)", "la verificación de la fase 3 (MOB-04/05/06 siguen sin marcar)"]
tech-stack:
  added: []
  patterns:
    - "medir la geometría de un overlay contra el viewport emulado con elementFromPoint en el centro del control (tocable = adentro de la pantalla Y el punto cae en él), no sólo el rectángulo"
    - "el scroll medido con un gesto real (dedo de CDP y, si no se movió, la rueda), nunca con scrollTop asignado; el contenedor marcado con un data-attribute para releerlo"
    - "la activación del usuario AFIRMADA en el instrumento antes del gesto que se mide (navigator.userActivation.isActive), con guarda que tira si no es la que el recorrido necesita"
key-files:
  created:
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-17-SUMMARY.md
  modified:
    - components/dashboard/plan-modal.tsx
    - .planning/debug/probes/panel-exit-en-la-app.mjs
    - .planning/debug/la-absorcion-que-no-absorbe-medida.md
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-2.md
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-GUION-3.md
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-DECISION-UAT-3.md
key-decisions:
  - "G3-9 se arregló por la decisión del dueño del 2026-11-16 con el patrón de «Editar servicio» y «Mover», en un solo archivo (plan-modal.tsx); components/ui/dialog.tsx (33 call sites) byte-idéntico. svh y no dvh: el viewport más chico, ≤ dvh en cualquier estado de la barra"
  - "El control a 390x844 dio x_visible_al_abrir=no ANTES del arreglo (dispara P-1). Un diagnóstico descartable midió que el clickReal de los R-G3-7 sobre la X cae en <html> en y=-23 (afuera de la pantalla, fuera del popup) y el diálogo se cierra por click afuera: el «hecho medido» de que los R-G3-7 tocaban la X era falso, el instrumento nuevo mide bien, P-9 no aplica. Se siguió con el arreglo, documentado como desviación"
  - "G3-10 es OTRO, medido: tarde (el caso del dueño) y atras-y-toque dan lo esperado (costo del camino 1 y su contrapuesto); pronto NO: con la activación viva el reintento arma (#salir) y el atrás siguiente saltea una entrada y sale (la firma de la intervención de historial, P-8 del 03-16). P-10: ningún arreglo, ningún costo declarado; la pregunta va al dueño"
  - "La no-regresión se detuvo en P-1: R-login-con-activacion no puede reproducir su condición desde f75e739 (login con recarga completa); no es atribuible al modal (no es P-5, no se revirtió nada) y no se puede arreglar el instrumento sin cambiar la premisa del recorrido. El plan para sin tocar más: el task 3 y el checkpoint quedan para la continuación"
  - "Decisión del dueño (2026-11-16): R-login-con-activacion se RETIRA de la no-regresión con su motivo escrito (f75e739: el login con window.location.assign; G3-4 ya no puede pasar por ese camino y el aterrizaje es la entrada directa del 1.3). Se marca obsoleto en la sonda (código y esperado intactos), los doce de antes pasan a once y sólo cambia el gate que contaba doce. panelExitUnmountAction del 03-14 se queda"
  - "Decisión del dueño (2026-11-16): G3-10 se DECLARA costo del camino 1 con lo medido (opción (a) de P-10), aunque el veredicto fue otro; el veredicto queda intacto y debajo va la línea de la decisión. Ningún cambio en la lógica del aviso ni en lib/overlay-history.ts"
requirements-completed: []
duration: 39min
completed: 2026-11-16
plan_head_before: 6862596d3c607650ea9ef3b75ed6107b0d3d7df6
estimate:
  tokens: 85000
  tasks: 4
actuals:
  # chars/4 sobre las líneas agregadas: 13140 de la primera ejecución (6862596..ea1cdcd, 3 archivos) + 4605 de la
  # continuación (9f0c647~1..23cfb6f, 5 archivos, 18418 caracteres agregados), sin los SUMMARY ni STATE/ROADMAP
  tokens: 17745
  # los 4 tasks completos; el 4 (checkpoint bloqueante) aprobado por el dueño el 2026-11-16
  tasks: 4
  # MEDIDO: git rev-list --count 6862596..HEAD al escribir este SUMMARY (sin contar el commit de cierre)
  commits: 10
coverage:
  - deliverable: "G3-9: el modal de planes con alto máximo de la pantalla y la lista con scroll adentro (plan-modal.tsx)"
    verification: { kind: probe, ref: "panel-exit-en-la-app.mjs dev interfaz — R-G3-9-modal-360x640/375x667/390x844: RED 3 FALLA (popup 934,3 px corrido, X fuera) → GREEN 3 OK (popup 608/635/812 px desde top=16, X tocable, último Elegir y pie a la vista, el atrás tras la X avisa); re-medido igual en la corrida de los 17", status: pass }
    human_judgment: false
  - deliverable: "G3-9 en el teléfono real del dueño, con la barra de URL y el tamaño de fuente del sistema"
    human_judgment: true
    rationale: "headless no tiene barras (svh = dvh = innerHeight) y el dedo sintético de CDP no movió la lista (lo movió la rueda); es el 3.4 del dueño en producción: APROBADO el 2026-11-16 («Todo bien», deploy f8fa76f)"
  - deliverable: "G3-10 medido: cerrar el diálogo del plan con el atrás de la interfaz"
    verification: { kind: probe, ref: "R-G3-10-primer-toque-atras-tarde OK, -pronto FALLA (entradas_salteadas=1), -atras-y-toque OK; reproducido igual en la corrida de los 17; veredicto G3-10: otro en (i)", status: pass }
    human_judgment: true
    rationale: "el veredicto fue otro (P-10); el dueño decidió el 2026-11-16 la opción (a): declararlo costo del camino 1 (03-DECISION-UAT-3.md, guion 3.3 y 3.4)"
  - deliverable: "La no-regresión completa con el modal arreglado"
    verification: { kind: probe, ref: "once de antes 11/11 (R-login-con-activacion retirado por decisión del dueño, f75e739); 17 R-G3-* como deben; estática 18/18; npm test 110 archivos 2031 pasados rc 0 (re-corrida tras un worker de Vitest caído); tsc y eslint limpios", status: pass }
    human_judgment: false
---

# Phase 3 Plan 17: El modal de planes (G3-9) y el cierre con el atrás (G3-10) Summary

**El modal de planes ahora entra en la pantalla del celular —tope `100svh-2rem`, tres filas y la lista como
única fila con scroll, medido RED → GREEN a 360x640, 375x667 y 390x844— y cerrar el diálogo con el atrás quedó
medido con `veredicto G3-10: otro` y, por decisión del dueño, declarado costo del camino 1; `R-login-con-activacion`
salió de la no-regresión (desde `f75e739` el login hace recarga completa) y el resto quedó verde. El plan espera en
el checkpoint bloqueante: el 3.4 del dueño, en el teléfono y en producción.**

## Performance

- **Duración:** ~39 min en total: 27 min de la primera ejecución (16:20 → 16:47 hora local, 2026-11-16) y ~12 min
  de trabajo en la continuación (18:57 → 19:10, sin contar la espera del turno)
- **Tasks:** 4 de 4 completos; el 4 (el checkpoint bloqueante) aprobado por el dueño el 2026-11-16 en producción
- **Archivos modificados:** 6 (`components/dashboard/plan-modal.tsx`, la sonda de la app, el registro de veredictos,
  `03-UAT-2.md`, `03-UAT-GUION-3.md`, `03-DECISION-UAT-3.md`)

## El entorno

- **Supabase local:** estaba caído (`api=000`). `supabase start` desde el repo (CLI 2.107.0), sin `stop`, `db
  reset` ni `docker stop/rm`. ⚠ El arranque **reusó el volumen** `supabase_db_forjo-app` que ya existía, así que
  no fue un seed limpio: la fila de `negocio-prueba` ya daba `trial|true` antes de la receta. Igual se aplicó la
  receta (una transacción con `set local request.jwt.claims = '{"role":"service_role"}'` y el `update`), con
  `UPDATE 1`, y el SELECT dio `trial|true`. Primer gate verde.
- **Contenedores antes:** sólo los nueve de `erp-forjo-studio` (las de `forjo-consultorios` no estaban
  corriendo). **Después:** los mismos nueve de `erp-forjo-studio` más los de `forjo-app`. Nada de otra pila se
  tocó.
- **El servidor:** el `next dev` del dueño seguía muerto; cada corrida de la sonda levantó su `next dev` en el
  3031 con el modo estricto ACTIVO y lo mató al salir (`puerto 3031 libre al salir: si` en todas). Chrome
  `157.0.8103.52`, node `v24.15.0`.

## Cómo quedó cada hallazgo

| Hallazgo | Línea en `(i)` | El número que lo decide |
|----------|----------------|-------------------------|
| `G3-9` | `cierre G3-9: arreglado` | RED: el popup medía 934,3 px a los tres altos, corrido hacia arriba (`top` -147,1 / -133,6 / -45,1), X fuera, sin scroll. GREEN: popup 608 / 635 / 812 px desde `top=16`, X en `y=24..52` tocable, la lista scrollea con la rueda (0 → 314 / 287 / 110) hasta el último «Elegir», el pie a la vista, y el atrás tras la X **avisa** (`entradas_salteadas=0`) |
| `G3-10` | `veredicto G3-10: otro` | `pronto`: con la activación viva (531 ms) el reintento arma `#salir` y el atrás siguiente **saltea una entrada** y sale (`entradas_salteadas=1`). `tarde` (7522 ms, sin activación) y `atras-y-toque` dan lo esperado |
| `G3-10`, la decisión | `decision del dueno sobre G3-10 (2026-11-16): costo del camino 1` | la opción (a) de P-10: declarado en `03-DECISION-UAT-3.md` y en el 3.3 y el 3.4 del guion, con las dos causas medidas y el mismo resultado visible |
| La no-regresión (primera ejecución) | `parada (plan 03-17): P-1 …` | doce de antes **11/12**: `R-login-con-activacion` 3/3 intentos `pendiente` a 637-846 ms del click |
| La no-regresión (continuación) | `no-regresion (plan 03-17): …` | once de antes **11/11** con `R-login-con-activacion` retirado; los 17 `R-G3-*` como deben; estática 18/18; suite 110 archivos, 2031 pasados |

**La auditoría** (sólo lectura): `auditoria de dialogos: 33 call sites, 3 con alto maximo en el popup, 30 sin`.
El candidato más obvio es «Importar clientes» (`clients-client.tsx:1290`, ~190 líneas de contenido), después
«Nueva venta» (`finances-client.tsx:1102`). La X compartida es `icon-sm` (28 px < 44 px): observación, no tocada.

## Task Commits

1. **Task 1 — G3-9 (tracer):**
   - `a5a95bb` `test(03-17)`: `medirElModalDelPlan` y los tres `R-G3-9`, sus `esperado` antes de medir
   - `fa70f25` `fix(03-17)`: el modal con el patrón de scroll por caller
   - `0bd3b55` `docs(03-17)`: `(i)` con el RED, el control, el GREEN, la auditoría y `cierre G3-9: arreglado`
2. **Task 2 — G3-10 medido:**
   - `afcba67` `test(03-17)`: la rama `como: 'atras'`, `cerrarConElAtras` y los tres `R-G3-10`
   - `cd63fec` `docs(03-17)`: `(i)` con lo medido, `veredicto G3-10: otro` y lo que la medición NO cierra
3. **Task 3 — parado en P-1, y terminado en la continuación con las decisiones del dueño:**
   - `ea1cdcd` `docs(03-17)`: `(i)` con la no-regresión detenida, la causa en git y la línea `parada (plan 03-17): …`
   - `42bd65c`, `766249f` `docs(03-17)`: el SUMMARY de la parada, STATE y ROADMAP
   - `9f0c647` `test(03-17)`: `R-login-con-activacion` marcado `obsoleto` (fuera del conjunto por omisión, código y
     `esperado` intactos, `QUE_CIERRA` con el motivo), antes de la corrida que vale
   - `23cfb6f` `docs(03-17)`: `(i)` con la decisión sobre `G3-10` y la no-regresión retomada; la viñeta de `G3-10`
     en `03-DECISION-UAT-3.md`; la sección del 03-17 en `03-UAT-2.md`; la actualización, la nota del 3.3, el `### 3.4`
     y la nota del 1.6 en el guion
4. **Task 4 — checkpoint bloqueante:** sin commit; espera el 3.4 del dueño en producción

## Las corridas de la sonda de la app (todas por `scripts/con-turno.mjs`, `next dev` propio en el 3031)

| Corrida | Hora | Resultado |
|---------|------|-----------|
| RED del task 1 (3 `R-G3-7` + 3 `R-G3-9`, el modal sin tocar) | 16:23-16:25 | rc 1 · `R-G3-7` 3/3 OK · `R-G3-9` 3/3 FALLA, los tres con `x_visible_al_abrir: medido="no"` (incluido el control) |
| Diagnóstico descartable (copia de la sonda en el scratchpad, no commiteada) | 16:27 | el `clickReal` de los `R-G3-7` sobre la X a 390x844: `pointerdown`/`mousedown`/`pointerup`/`click` en `html[]`, `enLaX=false`, `enElPopup=false`, `elementFromPoint=null`; el diálogo se cierra por click afuera |
| GREEN del task 1 (los mismos seis, con el arreglo) | 16:28-16:29 | rc 0 · 6/6 OK · scroll por gesto real en los tres altos (`forma=rueda`) |
| Task 2 (3 `R-G3-7` + 3 `R-G3-10`) | 16:33-16:34 | rc 1 · `R-G3-7` 3/3 OK · `R-G3-10`: tarde OK, pronto FALLA, atras-y-toque OK · activación afirmada en los tres · cero fallos del instrumento |
| Task 3, los doce de antes | 16:35-16:40 | rc 1 · **11/12** · `R-login-con-activacion` FALLA por `NO REPRODUCE LAS CONDICIONES` |
| Task 3, los diecisiete `R-G3-*` | 16:40-16:43 | rc 1 (el esperado) · 17 reportados · los once del 03-16 11/11 · `R-G3-9` 3/3 · `R-G3-10` iguales a lo pegado · cero fallos del instrumento |
| Continuación, los once de antes (sin `R-login-con-activacion`) | 18:58-19:04 | rc 0 · **11/11 OK** · cero `FALLA` · cero fallos del instrumento · 3031 y 9335 libres al salir |

Los diecisiete `R-G3-*` no se re-corrieron en la continuación: el retiro no toca su camino (corren por selección
explícita) y vale la corrida de 16:40-16:43.

**La estática** (`panel-back-stack.mjs`): 18/18, rc 0 (en la primera ejecución y otra vez en la continuación). **La
suite pura** (task 1, 16:29): 76 archivos, 1724 pasados + 3 expected-fail, rc 0. **La suite completa** (`npm
test`, con la pila local arriba, adentro de la ventana de los canarios): 16:44:09-16:45:35, 110 archivos, **2031**
pasados + 4 expected-fail + 1 salteado, rc 0; en la continuación, la primera corrida (19:05-19:06) dio rc 1 con
109/110 archivos y `Errors 1 error` desde `ChildProcess._handle.onexit` (un worker de Vitest que murió, ningún
test en rojo), y la re-corrida única (19:07-19:08) dio **110 archivos, 2031 pasados** + 4 expected-fail + 1
salteado, rc 0. `tsc --noEmit` sin `error TS` en las dos.

## Lo bloqueado, intacto

`lib/panel-branch.ts`, `lib/panel-history.ts`, `lib/overlay-history.ts`, `lib/dirty-history.ts`,
`scripts/con-turno.mjs`, `components/ui/dialog.tsx`, `components/dashboard/plan-banner.tsx`,
`components/dashboard/panel-bottom-nav.tsx`, `app/(dashboard)/settings/settings-client.tsx` y la sonda estática:
sin cambios desde `f7adc9d` (medido por `git diff --name-only` en los gates del task 1 y del task 3). La única
fuente de la app cambiada es `components/dashboard/plan-modal.tsx`. `next.config.ts` con la huella
`8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`. Ninguna línea `esperado` de `f7adc9d` ni de los commits
`test(03-17)` se perdió. Nada subido (`HEAD` no está en `origin/main`). MOB-04/05/06 sin marcar;
`requirements.mark-complete` sin correr.

**Deuda preexistente, no tocada:** `components/dashboard/plan-modal.tsx` tiene en `f7adc9d` un error de eslint,
`react-hooks/immutability` sobre `window.location.href = data.init_point` (L33, el redireccionamiento al checkout
de MercadoPago). Sigue siendo el único problema del archivo; es el flujo de cobro, fuera de este plan.

## Deviations from Plan

### 1. [P-1 evaluada — el «hecho medido» del control era falso] El control 390x844 dio `no` antes del arreglo

- **Encontrado en:** task 1, paso 2 (el RED).
- **Qué pasó:** el plan esperaba la X tocable a 390x844 con el modal sin tocar («ahí los `R-G3-7` ya tocaron la
  X»), y P-1 dice que un `no` ahí contradice un hecho medido. El RED dio `no`: el popup mide 934,3 px y a
  844 px de alto queda con `top=-45,1`, la X en `y=-37..-9`.
- **Qué se hizo:** en vez de tocar el instrumento o la `esperado`, se midió el «hecho»: un recorrido de
  diagnóstico en una copia descartable de la sonda (scratchpad, no commiteada) mostró que el `clickReal` de los
  `R-G3-7` apunta a `y=-23,1` y los cuatro eventos del click llegan a `<html>`, fuera de la X y del popup; el
  diálogo se cierra por click afuera (el mismo oyente del toque, por eso `G3-7` sigue valiendo). El instrumento
  nuevo mide bien; P-9 no aplica (los dos altos cortos dan `no`). Se siguió con el arreglo; con él, el click de
  los `R-G3-7` cae en la X de verdad.
- **Archivos:** ninguno extra (el diagnóstico no se commiteó). **Commit del registro:** `0bd3b55`.

### 2. [Entorno] `supabase start` reusó el volumen existente

- El plan esperaba `trial|false` en un `start` limpio; el volumen `supabase_db_forjo-app` ya existía y la fila
  daba `trial|true`. La receta de `has_web_custom` se aplicó igual (idempotente) y el SELECT la afirmó. Sin
  efecto en lo medido (los tres `R-G3-6` pasaron).

### 3. [Instrumento] El dedo sintético no movió la lista

- `Input.synthesizeScrollGesture` con `gestureSourceType: 'touch'` no movió el contenedor en este Chrome headless
  (sin emulación táctil, sin error de CDP); el respaldo de la rueda sí, en los tres altos (`forma=rueda`). Es el
  camino que el plan prevé; el dedo real queda para el 3.4.

### 4. [PARADA] La no-regresión detenida por P-1 (`R-login-con-activacion`)

- **Encontrado en:** task 3, primer gate (los doce de antes).
- **Qué pasó:** `R-login-con-activacion` tiró `NO REPRODUCE LAS CONDICIONES DEL TELEFONO` en sus tres intentos
  (846/637/702 ms del click al primer armado, los tres `pendiente`: el panel monta sin la activación del click).
- **Causa, medida en git:** `f75e739` (upstream, 2026-10-28; entró con el merge `643e99e`, después de la
  no-regresión del 03-16) cambió el login de `router.push('/dashboard')` a `window.location.assign('/dashboard')`:
  documento nuevo, la activación del click no pasa. Ni `f75e739` ni `5c08719` son ancestros de `993fbc5`.
- **Por qué para el plan:** no es atribuible al modal (no es P-5, nada que revertir); no se puede arreglar el
  instrumento sin cambiar la premisa del recorrido; la regla del task 3 dice «si no, PARAR y reportar sin tocar
  más». Se completó la medición (los 17, la estática, la suite) para que el reporte quede entero, se deshicieron
  las ediciones del guion que el task 3 había empezado (sin commitear) y se anotó la parada en `(i)`.

### 5. [Decisión del dueño, 2026-11-16] `R-login-con-activacion` retirado de la no-regresión

- **Qué decidió:** retirarlo con el motivo escrito. `f75e739` (2026-10-28, mergeado en `643e99e`) cambió el login
  a `window.location.assign('/dashboard')`: el panel nace en un documento nuevo, la activación del click no pasa,
  el recorrido no puede reproducir su condición y `G3-4` (el doble montaje de Strict Mode tras un `router.push`
  del lado del cliente) ya no puede pasar por ese camino. El aterrizaje es hoy la entrada directa a Inicio, que
  cubren `R-1.3-sin-toque` y `R-1.3-con-toque`.
- **Qué se hizo:** en la sonda el recorrido queda con su código y su `esperado` intactos, marcado `obsoleto` (no
  corre por omisión; nombrado, corre e imprime que está retirado) y su `QUE_CIERRA` dice OBSOLETO con el puntero a
  `f75e739` (commit `9f0c647`). Los doce de antes pasan a once y el único gate cambiado es el que contaba doce
  (ahora once, misma forma). Ningún otro `esperado` tocado; `panelExitUnmountAction` del 03-14 se queda. Anotado en
  `(i)`, en `03-UAT-2.md` y en el 1.6 del guion.
- **Verificado:** los once de antes 11/11 con rc 0. El filtro por omisión (sin selección) se verificó leyendo el
  código, no corriendo la sonda entera: una corrida sin selección mide todos los recorridos y no la pide ningún
  gate.

### 6. [Decisión del dueño, 2026-11-16] `G3-10` declarado costo del camino 1 con veredicto `otro`

- La rama `costo-camino-1` del plan sólo se escribía con ese veredicto; el dueño eligió la opción (a) de P-10 y
  se escribió igual, diciendo que el veredicto medido fue `otro`: la viñeta fechada en `## El costo, declarado`
  de `03-DECISION-UAT-3.md` (aditiva, 0 líneas quitadas), la nota en el 3.3 y en el 3.4 del guion, y en `(i)` la
  línea `decision del dueno sobre G3-10 (2026-11-16): costo del camino 1` debajo de `veredicto G3-10: otro`
  (intacta). En `03-UAT-2.md` van la pregunta de P-10 y la respuesta del dueño. Ningún cambio en la lógica del
  aviso, `lib/panel-branch.ts` ni `lib/overlay-history.ts`.

### 7. [Instrumento] Un worker de Vitest caído en la primera corrida de la suite de la continuación

- `Errors 1 error` desde `ChildProcess._handle.onexit`, 109/110 archivos, 2026 pasados, ningún test en `FAIL`;
  re-corrida una vez (lo que manda el gate para un rojo visto una vez): 110/110, 2031 pasados, rc 0. No se sabe qué
  archivo cargaba ese worker (la salida guardada era sólo la cola).

**Total deviations:** 4 auto-resueltas (1 evaluación de P-1 con medición, 1 de entorno, 2 de instrumento) + 1
parada + 2 decisiones del dueño aplicadas en la continuación. **Impact:** `G3-9` arreglado y medido; `G3-10`
medido y declarado costo del camino 1; la no-regresión verde con once recorridos de antes; sólo falta el 3.4 del
dueño.

## Known Stubs

Ninguno: el arreglo no introduce datos vacíos ni textos provisorios (sólo clases de layout).

## Threat Flags

Ninguno nuevo. El arreglo es de layout en un componente cliente; la sonda sólo lee y escribe en la base local.

## La parada — lo que necesitaba una decisión (RESUELTO el 2026-11-16)

Las dos preguntas las contestó el dueño el 2026-11-16: (1) → la opción (a), retirar el recorrido con su motivo
(desviación 5); (2) → la opción (a), declarar `G3-10` costo del camino 1 con lo medido (desviación 6). Lo que
sigue es el texto de la parada, como quedó.

1. **`R-login-con-activacion`** (uno de los doce de antes) ya no puede reproducir su condición desde `f75e739`.
   Opciones: (a) declararlo obsoleto por el cambio upstream y sacarlo de la lista de los doce (la `esperado` no
   se toca: se retira el recorrido, con su motivo); (b) re-plantearlo para el login con recarga completa (otro
   recorrido, otra premisa: el panel arranca sin activación); (c) medir antes qué pasa hoy en producción tras
   loguearse (por lectura: el aviso queda `pendiente` hasta el primer toque, y el `G3-4` del 03-14 ya no tiene
   con qué dispararse). Cualquiera de las tres es una decisión de plan, no del ejecutor.
2. **`G3-10`, `veredicto G3-10: otro` (P-10):** la pregunta para el dueño, con tres opciones: (a) declararlo costo
   del camino 1 igual, con lo medido; (b) planificar un arreglo —tocaría la lógica del aviso o
   `lib/overlay-history.ts` (intocable)—, con su costo; (c) diferirlo.
3. **Después:** el task 3 (la sección del 03-17 en `03-UAT-2.md` con la pregunta de `G3-10`, la actualización y
   el `### 3.4` del guion; con `otro`, `03-DECISION-UAT-3.md` no se toca) y el checkpoint bloqueante del 3.4 en
   el teléfono, en producción, después de que el orquestador suba `main`.

## El checkpoint — APROBADO el 2026-11-16 (task 4, `gate="blocking-human"`)

**Resolución:** el orquestador subió `main` (`984e0b6..f8fa76f`), la CI dio verde (run 43967813776) y el deploy de
Vercel terminó; el dueño corrió el 3.4 en el Android, en producción: **✅ «Todo bien»**. Anotado en `03-UAT-2.md`
§ «Re-prueba tras el 03-17». Lo que sigue es el texto del checkpoint tal como quedó al pararse:

El plan espera acá con todo commiteado y nada subido (`HEAD` no está en `origin/main`). El **orquestador** sube
`main` (CI + deploy de Vercel a `gestion.forjo.studio`), espera la CI verde y el deploy listo, y recién entonces le
presenta al dueño el **3.4** del guion: en el teléfono (el mismo Android del 3.3), en producción, en Inicio,
«Activar plan» → se ven «Elegí tu plan» y la X, la lista llega con el dedo al «Elegir» de Pro, el pie se ve,
cerrado con la X el atrás avisa y el segundo sale. ⚠ No tocar «Elegir» (checkout real de MercadoPago). Por
`G3-10` no hay nada que correr: es un costo declarado. El recibo (una sección nueva de `03-UAT-2.md` con fecha,
motor, commit desplegado y una fila `| 3.4`) hoy no puede quedar verde con lo que está en disco: 0 filas del 3.4 y
28 secciones (pide ≥ 29).

## Next

El dueño corre el 3.4 en producción y lo anota en `03-UAT-2.md`. Si pasa, el cierre de la fase:
`/gsd-verify-work 3 --ws panel-nav` (que marca MOB-04/05/06; la alternativa del recorrido 1.4 sigue pendiente para
ese cierre). Si falla, entra como gap nuevo, sin interpretarlo ni arreglarlo en el momento.

## Self-Check: PASSED

- Archivos: `components/dashboard/plan-modal.tsx`, la sonda, el registro, `03-UAT-2.md`, `03-UAT-GUION-3.md` y
  `03-DECISION-UAT-3.md` existen y tienen lo descripto.
- Commits: `a5a95bb`, `fa70f25`, `0bd3b55`, `afcba67`, `cd63fec`, `ea1cdcd`, `42bd65c`, `766249f`, `9f0c647`,
  `23cfb6f` en la historia.
