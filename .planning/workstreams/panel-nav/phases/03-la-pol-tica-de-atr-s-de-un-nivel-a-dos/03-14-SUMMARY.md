---
phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos"
plan: "14"
subsystem: panel-nav / sentinel de salida (MOB-05)
status: complete
checkpoint_resolution: "task 4 (checkpoint:human-verify, blocking-human) APROBADO por el dueño el 2026-10-29 — «Todo perfecto»: 1.6 ✅, 3.2 ✅, 4.1 ✅, 4.2 ✅; registrado en 03-UAT-2.md § «Re-prueba tras el 03-14 — 2026-10-29» (commit 11842d5)"
tags: [sentinel, g3-4, login, modo-estricto, doble-montaje, microtask, cdp]
requires: ["03-13"]
provides:
  - "G3-4 medido en la app real (veredicto H1: el doble montaje del modo estricto) y arreglado por esa causa"
  - "panelExitUnmountAction: la limpieza del desmontaje difiere el consumo del sentinel a un microtask y conserva el sentinel en un remontaje"
  - "la sonda de la app con R-login-con-activacion (guarda de llegada) y el instrumento de la historia con pila de JS: 12/12"
  - "el recorrido 1.6 (entrar por el login) en el guion de la ronda 3"
affects: ["la verificación de la fase 3 (MOB-04/05/06, con el teléfono)", "cierre de la fase 3 (si recordExitDiag sigue en producción; la alternativa del 1.4)"]
tech-stack:
  added: []
  patterns:
    - "consumo diferido a queueMicrotask en la limpieza de un efecto, con el hecho de 'sigo montada' leído adentro del microtask (sobrevive al doble montaje de desarrollo sin temporizadores)"
    - "History.prototype envuelto por CDP al nacer el documento para atribuir cada pushState/replaceState/back a su pila de JS (arriba y base)"
key-files:
  created:
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-14-SUMMARY.md
  modified:
    - lib/panel-branch.ts
    - test/panel-branch.test.ts
    - .planning/debug/probes/panel-exit-en-la-app.mjs
    - .planning/debug/la-absorcion-que-no-absorbe-medida.md
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-GUION-3.md
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-2.md
key-decisions:
  - "G3-4 es H1, medido: el back() que encendió el aviso sale de la limpieza del desmontaje del panel, con commitDoubleInvokeEffectsInDEV en la base de la pila; arm->none con el mismo id; ningún replaceState entre el empuje y el popstate (H2 no se cumple)"
  - "El 'doble montaje descartado' del 03-12 vale para la hidratación (entrar directo, recargar) y NO para el montaje en el cliente después de router.push: la precisión quedó escrita en (g)"
  - "El arreglo vive sólo en la limpieza del desmontaje: queueMicrotask + panelExitUnmountAction({ sigueMontada, nuestroArriba }) con la marca re-leída en el instante; nunca un temporizador; el login no se tocó"
requirements-completed: [MOB-04, MOB-05, MOB-06]
duration: 25min
completed: 2026-10-29
plan_head_before: be363ec3e062488ecb9c1182ac00ba28152b404b
actuals:
  tokens: 13600
  tasks: 4
  # MEDIDO: git rev-list --count be363ec..HEAD = 10 al escribir este cierre (HEAD 11842d5), sin contar el
  # commit de cierre. 2 de esos 10 NO son del plan: 76f98f3 y e6915d1 (el /gsd-fast del autoscroll de /web,
  # entró entre el checkpoint y el cierre). Del plan: 8 (5 de los tasks 1-3 + 3 de documentos/estado).
  commits: 10
coverage:
  - deliverable: "G3-4 reproducido en la app real con la activación vigente y la causa nombrada (veredicto H1)"
    verification: { kind: probe, ref: ".planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz — 11 OK + R-login-con-activacion FALLA (llegada si, popstate 1, aviso si, hash vacío), rc 1 esperado", status: pass }
    human_judgment: false
  - deliverable: "panelExitUnmountAction pura y el desmontaje diferido a un microtask"
    verification: { kind: test, ref: "test/panel-branch.test.ts — 4 casos + 6 auditorías; vitest pure 392/392 (RED 10 fallados / 382)", status: pass }
    human_judgment: false
  - deliverable: "las reglas bloqueadas y la política de la pila intactas"
    verification: { kind: gate, ref: "7 none / 4 ignore; panelNavMode 6/5; panelBranchPlan 6/2; branchCarryMark 4; history.back 2; pushState 1; tiempo 0; ancho 0; intocables y login limpios", status: pass }
    human_judgment: false
  - deliverable: "el aterrizaje del login sin aviso, sin popstate y con #salir, de punta a punta"
    verification: { kind: probe, ref: "panel-exit-en-la-app.mjs dev interfaz — 12/12 OK, rc 0; desmontaje keep después del remontaje", status: pass }
    human_judgment: false
  - deliverable: "no-regresión: estática, suite completa, tsc, eslint"
    verification: { kind: command, ref: "panel-back-stack.mjs 18/18; npx vitest run 110 archivos, 1994 pasados + 4 xfail + 1 salteado; tsc --noEmit 0 errores; eslint rc 0", status: pass }
    human_judgment: false
  - deliverable: "el login aterriza bien en el teléfono (1.6), el overlay del 3.2 y el bloque 4 de escritorio"
    verification: { kind: human, ref: "03-UAT-2.md § «Re-prueba tras el 03-14 — 2026-10-29» — respuesta del dueño «Todo perfecto»: 1.6 ✅, 3.2 ✅, 4.1 ✅ (residuo ya aceptado), 4.2 ✅ (commit 11842d5)", status: pass }
    human_judgment: true
    rationale: "Todo lo medido es Chrome de escritorio headless contra el next dev del dueño. Sólo el teléfono y el escritorio del dueño cierran el 1.6, el 3.2 y el bloque 4. Checkpoint blocking-human APROBADO por la persona el 2026-10-29 (reporte en bloque, sin fila por fila ni motor nombrado)"
---

# Phase 3 Plan 14: el aterrizaje del login (G3-4) — medido como doble montaje del modo estricto y arreglado difiriendo el consumo del desmontaje a un microtask Summary

**Loguearse por el formulario ya no enciende el aviso solo ni se lleva el hash: la limpieza del desmontaje
dejaba de retroceder sobre el sentinel recién empujado en el remontaje del modo estricto. Medido 12/12 en la
app real con el atrás de la interfaz, y aprobado por el dueño en el teléfono y el escritorio («Todo perfecto»).**

- **Inicio:** 2026-10-29T21:03:41Z · **Corte en el checkpoint:** 2026-10-29T21:28Z · **Duración:** ~25 min
  (de ejecución; la espera del dueño no cuenta)
- **Tasks:** 4 de 4 (el 4 es `checkpoint:human-verify` con `gate="blocking-human"`: **aprobado** el 2026-10-29)
- **Archivos:** 6 modificados (1 de producción: `lib/panel-branch.ts`)

## Accomplishments

### Task 1 — Medir antes de arreglar (commit `e1c2edf`)

- La sonda suma `R-login-con-activacion` (último), `enviarElLogin` (extraída de `loguearse` sin cambio de
  comportamiento), `INTENTOS_DEL_LOGIN = 3`, `VENTANA_DEL_ATERRIZAJE_MS = 4000` y el instrumento
  `SCRIPT_DE_LA_HISTORIA` (con la pila de JS de cada llamada: los 16 marcos de arriba y los 8 de la base).
- **Los intentos del aterrizaje:** corrida completa `intento 1: ms del click al primer armado=673
  acciones=[arm,none] ids=[1,1] · VALE`; corrida aislada previa: 791 ms, `[arm,none]`, `[1,1]`. La guarda de
  llegada se cumplió al primer intento en las dos.
- **El rojo (corrida completa, 18:08-18:13 hora local, rc 1):** los once de antes en `OK`;
  `R-login-con-activacion` en `FALLA` con `llegada_con_activacion="si"`, `popstates_al_aterrizar=1`,
  `aviso_al_aterrizar="si"`, `hash_al_aterrizar=""`, `atras_tras_un_toque_absorbido="si"`.
- **El veredicto, `veredicto: H1`**, con los números: `arm` (+673 ms) y `none` por la regla 4 (+677 ms) con
  el mismo `id=1`; un `back` (+676 ms) cuya pila sale del efecto del desmontaje de `usePanelBranch` por
  `commitHookEffectListUnmount` → `disconnectPassiveEffect`, con `recursivelyTraverseAndDoubleInvokeEffectsInDEV`
  y `commitDoubleInvokeEffectsInDEV` en la base (92 marcos); `popstate` (+710 ms); `hint` con `holding=true`
  e `id=1` (+744 ms). El único `replaceState` entre el empuje y el `popstate` conserva `#salir`: **H2 no se
  cumple**. Contraste de la misma corrida: `R-1.3-sin-toque` con `armados_al_entrar=1 (pendiente)`,
  `popstates_sin_gesto=0`. La precisión de alcance del *descartado* del `03-12` quedó en `(g)`.
- **Reglas de PARAR:** ninguna aplicó (P-1: armó al primer intento; P-2: el síntoma se reprodujo entero; P-3:
  el veredicto encaja y ninguna regla bloqueada resultó mal; P-4: el `id` y la pila coinciden).

### Task 2 — El arreglo por la causa medida (tracer; commits `4ae77dd` RED, `1200308` GREEN, `4c9ac4b` sonda)

- **Rama aplicada: H1.** `panelExitUnmountAction` pura (con `PanelExitUnmountAction`), `montadaRef`, y la
  limpieza del desmontaje con **un** `queueMicrotask` que lee en ese instante `history.state`, la marca y
  `montadaRef`, decide, graba un registro `desmontaje` y retrocede sólo con `consume`. El `tipo` del canal suma
  `'desmontaje'`. El login no se tocó.
- **RED, anotado a mano** (`npx vitest run --project pure test/panel-branch.test.ts lib/panel-history.test.ts
  test/panel-nav-chrome.test.ts`): **rc 1**, `10 failed | 382 passed (392)`. Los fallados:
  - `recordExitDiag … > se graba DESPUÉS de computar la acción, en los CUATRO call sites …` (`expected 4 to be 5`)
  - `panelExitUnmountAction … > regla 1 — la instancia SIGUE montada … ⇒ keep …` (`TypeError: panelExitUnmountAction is not a function`)
  - `panelExitUnmountAction … > regla 1, contrapuesto adyacente — sigue montada SIN nuestra entrada arriba ⇒ keep` (ídem)
  - `panelExitUnmountAction … > regla 2 — desmontaje REAL con nuestra entrada arriba ⇒ consume …` (ídem)
  - `panelExitUnmountAction … > regla 3 — desmontaje real con la entrada del ROUTER arriba ⇒ keep …` (ídem)
  - `panelExitUnmountAction … > la decisión es PURA …` (`expected -1 to be greater than 0`)
  - `el cableado del desmontaje (G3-4) … > difiere el consumo a UN microtask …` (`expected 239 to be greater than 300`)
  - `… > retrocede SÓLO con consume, y conserva la guarda …` (falta `if (accion === 'consume') window.history.back()`)
  - `… > la instancia sabe si sigue montada …` (falta `const montadaRef = useRef(false)`)
  - `… > el canal suma \`desmontaje\` …` (falta la unión con `'desmontaje'`)
  Todos son aserciones sobre el comportamiento planeado: ningún error de carga ni de sintaxis.
- **GREEN:** la misma suite 392/392 (382 + 10); `tsc --noEmit` 0 errores.
- **Gates del task:** reglas bloqueadas 7 · 4 · 6/5 · 6/2 · 4, `history.back()` 2, `pushState` 1, tiempo 0,
  ancho 0, intocables limpios; rama H1: orden de líneas `microtask(7) < estado(8), marca(9) <= decisión(10) <
  retroceso(24)`, `montadaRef` 1/1, canal 5, `tipo` con `desmontaje`, decisión pura (11 líneas, 0 impuras, 1
  `consume`, 2 `keep`), login sin tocar.
- **Tracer feedback gate (auto):** `R-login-con-activacion` sola en `OK` (3414 ms del click al armado, justo
  después de la recarga en caliente; `desmontaje keep sigue_montada=true` después del `none`). ⚡ Tracer
  verificado de punta a punta — se expandió.
- **La sonda de la app después (corrida completa 18:18-18:24, rc 0): 12/12 en `OK`.** El aterrizaje: `arm`
  +1133 ms, `none` +1138 ms, `desmontaje keep` +1140 ms (**después** del remontaje: P-5 no aplica), cero
  `popstate`, sin aviso, `/dashboard#salir`, y el atrás tras un toque absorbido.
- **La estática** (`panel-back-stack.mjs`, sin tocar): 18/18, rc 0.
- **La suite completa** (corrida a las 18:25 hora local, adentro de la ventana de los canarios de reloj): 110
  archivos, **1994 pasados + 4 expected-fail + 1 salteado**, 0 fallados (no apareció el test inestable del
  piso). `eslint` de los cinco archivos de la verificación: rc 0. `next.config.ts`: huella
  `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`, sin tocar.
- ⚠ **Editar `lib/panel-branch.ts` disparó una recarga en caliente en el `next dev` del dueño (puerto 80)**;
  la sonda midió contra él y nunca lo reinició.

### Task 3 — Los documentos (commit `1c8d911`)

- `03-UAT-GUION-3.md`: la actualización del 2026-10-29 (no se re-corre la ronda, con el motivo medido) y el
  recorrido **1.6** en el bloque 1.
- `03-UAT-2.md`: la sección `G3-4 — MEDIDO y ARREGLADO, SIN VERIFICAR EN EL TELEFONO`, sin filas de recibo.
  Gate: 22 secciones, 0 filas 1.6/4.1/4.2, 1 fila 3.2, MOB-04/05/06 sin marcar.

### Task 4 — El checkpoint del dueño: APROBADO (2026-10-29)

`checkpoint:human-verify`, `gate="blocking-human"`: el 1.6, el 3.2 y el bloque 4. Al cortar, el recibo
automático estaba en **rojo** contra el disco (secciones 22, filas 1.6/4.1/4.2 en 0, 3.2 en 1), como se diseñó.

**La respuesta del dueño: «Todo perfecto».** Reportado en bloque, sin fila por fila ni motor nombrado, y
anotado así —sin agregarle detalle que no dio— en `03-UAT-2.md`, sección **«Re-prueba tras el 03-14 —
2026-10-29»** (commit `11842d5`):

| Recorrido | Resultado |
|-----------|-----------|
| 1.6 — entrar por el login | ✅ |
| 3.2 — el atrás cierra el overlay sin navegar | ✅ |
| 4.1 — escritorio, `/web` con cambios → Inicio por el sidebar → «Salir sin guardar» | ✅ (residuo ya aceptado) |
| 4.2 — escritorio, lo mismo sin cambios | ✅ |

Con eso la ronda 3 queda cerrada en Android (bloques 1-3 + 1.6), iPhone (bloque 6) y escritorio (bloque 4).

**En la misma pasada, fuera del alcance de este plan:** el autoscroll al entrar a `/web` (mismo mecanismo que
`G3-4` —el flag de montaje de los widgets de reserva contra la re-ejecución de efectos del modo estricto— en
otro componente) se arregló aparte como `/gsd-fast` (commit `76f98f3`, registrado en Quick Tasks del STATE en
`e6915d1`). No es parte del 03-14 y este cierre no lo toca.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Instrumento] La base de la pila en `sonda-historia`**
- **Found during:** Task 1 (la corrida aislada antes de la completa).
- **Issue:** con los 16 marcos de arriba la pila del `back` mostraba `disconnectPassiveEffect`, que React usa
  tanto para el doble montaje como para ocultar un árbol: no alcanzaba para separar H1 de otro desmontaje.
- **Fix:** el instrumento sube `Error.stackTraceLimit` adentro del envoltorio (y lo restaura) y graba además
  los 8 marcos de la base (`base`, `marcos`); la firma H1 impresa busca los nombres del modo estricto en la
  base. Y la firma H2 se acotó al `replaceState` que aterriza **entre** el empuje y el `popstate` (el de
  después es la reacción del router, no la causa).
- **Files modified:** `.planning/debug/probes/panel-exit-en-la-app.mjs` · **Commit:** `e1c2edf`

**2. [Secuencia] El tercer gate del task 1 lista `test/` como tocado**
- El RED del task 2 (`test/panel-branch.test.ts`) se redactó mientras corría la sonda del task 1 y estaba sin
  commitear cuando corrió ese gate; el commit del task 1 (`e1c2edf`) **no** lo incluye y el veredicto ya
  estaba escrito antes de cualquier código de producción. El resto del gate pasó (sección `(g)` 1, una línea
  `veredicto: H1`, 580 líneas, eslint rc 0, huella de `next.config.ts` igual).

**Total deviations:** 1 auto-fixed (instrumento) + 1 de secuencia documentada. **Impact:** ninguno sobre
producción; el instrumento quedó más preciso.

## Observaciones laterales (sin tocar)

- El `router.push('/dashboard')` + `router.refresh()` del login se commitea como un **reemplazo** de la entrada
  de `/login` (no un empuje): la pila queda `[(afuera), /dashboard, …]`. No es causa de `G3-4` y el login está
  fuera de la rama H1.
- El doble montaje es sólo de desarrollo: el defecto vivía en el entorno donde el dueño prueba con el teléfono
  (su `next dev`). En producción la limpieza sólo corre en un desmontaje real, y ahí decide igual que antes.

## Known Stubs

Ninguno.

## Issues Encountered

Ninguno. MOB-04, MOB-05 y MOB-06 siguen **SIN marcar** y `requirements.mark-complete` no se corrió (el campo
`requirements-completed` copia el del plan por contrato de la plantilla; no es una marca).

## Next

La fase 3 queda con **14/14 planes ejecutados** y lista para su cierre: security gate (`/gsd-secure-phase 3
--ws panel-nav`), code review y verificación. **`/gsd-verify-work 3 --ws panel-nav`** es el paso que marca
MOB-04, MOB-05 y MOB-06 después de los gates; este plan no los marca.

## Self-Check: PASSED

- Archivos: los 6 modificados existen; este SUMMARY existe.
- Commits: `e1c2edf`, `4ae77dd`, `1200308`, `4c9ac4b`, `1c8d911`, `1f2ab3a`, `1e7729a` y el registro del
  checkpoint `11842d5` en `git log`.
- La aprobación del dueño está en disco: `03-UAT-2.md`, sección «Re-prueba tras el 03-14 — 2026-10-29».
