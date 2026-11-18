---
phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
plan: "08"
subsystem: ui
tags: [historial, tabs, panel-nav, re-uat, produccion, deploy, no-regresion]
gap_closure: true
gap_ids: [G-04-6, G-04-7, G-04-8]

requires:
  - phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
    provides: "04-06 (boundary con nodo, cierre (h)) y 04-07 (toqueDeTab, guarda del consumo, vueltaDeOAuthPendiente, cierre (i))"
provides:
  - "## (j) en .planning/debug/tabs-en-la-url-medida.md: la no-regresión del cierre de gaps en una tanda, con la línea literal `no-regresion (plan 04-08): …`"
  - "04-UAT-GAPS.md: el guion de la re-UAT (ocho recorridos G6.1–G8.2) y la hoja del dueño, anotada: 8/8 ✅ en producción sobre c3da6d0, «aprobado»"
  - "Los arreglos de G-04-6/7/8 desplegados en gestion.forjo.studio (push 974a131..c3da6d0, CI y Vercel en success)"
affects: [/gsd-verify-work 4 --ws panel-nav, MOB-08, MOB-09]

plan_head_before: 83fc45c2394313f1eea325b6961a1e08a18e9ec6
actuals:
  tokens: 9000
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Cierre de fase en tres llaves: todo lo automático en verde en una tanda → push sólo con autorización escrita del dueño → re-UAT en el teléfono y en producción como único criterio que cierra"

key-files:
  created:
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-UAT-GAPS.md
  modified:
    - .planning/debug/tabs-en-la-url-medida.md
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md

key-decisions:
  - "La completa (`npm test` con el carril `db`) se programó para arrancar a las 01:01 AR: la tanda empezó a las 00:08, fuera de la ventana de los canarios de reloj; el árbol no cambió entre las dos partes"
  - "obs-G1 (el recorte del scroll con 0 ventas) no es un fallo del G6: el dueño lo deja para un /gsd-quick aparte (alto mínimo de los tabs de Finanzas = alto de la pantalla)"
  - "MOB-08/MOB-09 y el cierre de G-04-6/7/8 NO se marcan acá: se marcan en /gsd-verify-work 4 --ws panel-nav con lo anotado en 04-UAT-GAPS.md"

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "El primer toque de un tab de Finanzas no mueve la página (G-04-6)"
    requirement: "MOB-08"
    verification:
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs <5 recorridos> cierre-04-08 tras-el-fix (5/5)"
        status: pass
      - kind: manual
        ref: "04-UAT-GAPS.md G6.1, G6.2 (Android Chrome), G6.3, G6.4 (Escritorio Chrome) en producción sobre c3da6d0"
        status: pass
    human_judgment: true
  - id: D2
    description: "Un doble toque no apila ni saca de la sección, incluido el doble «Volver» de clientes (G-04-7)"
    requirement: "MOB-08"
    verification:
      - kind: e2e
        ref: "panel-exit-en-la-app.mjs dev interfaz: 12 R-T-* y 4 R-B1-* en OK"
        status: pass
      - kind: manual
        ref: "04-UAT-GAPS.md G7.1, G7.2 (Android Chrome) en producción sobre c3da6d0"
        status: pass
    human_judgment: true
  - id: D3
    description: "Las URLs de vuelta del OAuth pegadas no traban los tabs de Negocio (G-04-8)"
    requirement: "MOB-09"
    verification:
      - kind: e2e
        ref: "panel-exit-en-la-app.mjs R-T-negocio-oauth-mp, R-T-negocio-oauth-google-error"
        status: pass
      - kind: manual
        ref: "04-UAT-GAPS.md G8.1, G8.2 (Android Chrome + Escritorio Chrome) en producción sobre c3da6d0"
        status: pass
    human_judgment: true

duration: ~13h (dominado por las esperas del turno, la ventana de los canarios y los dos checkpoints del dueño)
completed: 2026-11-18
status: complete
---

# Phase 4 Plan 08: La no-regresión en una tanda, el push autorizado y la re-UAT en producción Summary

**Todo lo automático del cierre de gaps quedó en verde en una sola tanda (scroll 5/5, app 46/47 con sólo la FALLA declarada de G3-10, estática 18/18, pura 77/1844, completa 111/2151, build 64/64). El push a `main` salió con la autorización del dueño y con la CI y Vercel en success sobre `c3da6d0`. El dueño corrió los ocho recorridos de `04-UAT-GAPS.md` en producción, en Android Chrome y Escritorio Chrome: 8/8 ✅, «aprobado».**

## Performance

- **Duration:** ~13 h de reloj, casi todo esperando: el turno, la ventana de los canarios (la completa arrancó a las 01:01) y los dos checkpoints del dueño (el push y la re-UAT).
- **Started:** 2026-11-18 00:08 AR (primera sonda)
- **Completed:** 2026-11-18 (aprobación del dueño, después del deploy de las 12:28:25Z)
- **Tasks:** 3/3
- **Files modified:** 3 (todos de `.planning/`; nada de código de la app)

## Accomplishments

- **La no-regresión en una tanda (task 1):** quedó en `## (j)` del registro con la línea literal
  `no-regresion (plan 04-08): sonda del scroll 5/5, sonda de la app 46/47 en OK, estatica 18/18, pura 77/1844, completa 111/2151, tsc limpio, build ok, criterio 5 en cero`.
- **El guion de la re-UAT (task 1):** `04-UAT-GAPS.md` nació con los ocho recorridos, cada uno con «Pasa si» y «Falla si»: G6.1–G6.4 (primer toque de Finanzas), G7.1–G7.2 (doble toque y doble «Volver») y G8.1–G8.2 (las URLs del OAuth pegadas). La hoja quedó sin filas y con fecha, motores y commit vacíos.
- **El deploy (task 2):** se subió con la autorización del dueño y sin `--force`. CI y Vercel terminaron en success sobre el commit subido.
- **La re-UAT (task 3):** el dueño la corrió en producción sobre `c3da6d0` y dio 8/8 ✅. El orquestador transcribió las filas con las palabras del dueño y el recibo automático da verde.

## Task Commits

1. **Task 1: la no-regresión, `## (j)` y el guion:** `c3da6d0` docs(04-08): (j) la no-regresion del cierre en una tanda y el guion de la re-UAT
2. **Task 2: el push a main.** No lleva commit propio. Se subió `974a131..c3da6d0` (36 commits: los de documentación que esperaban desde `974a131` más los del cierre 04-06/04-07/04-08).
3. **Task 3: la re-UAT en producción:** `573531c` test(04-08): la re-UAT de los gaps en produccion (c3da6d0): 8/8 OK, aprobado. Este commit es del orquestador, que transcribió al dueño. El ejecutor no escribió ninguna fila.

**Plan metadata:** el commit de este SUMMARY (más `deferred-items.md`).

## El entorno (task 1, paso 0)

- 2026-11-18, hora de Argentina. La pila local de forjo-app estaba arriba: no hizo falta `supabase start` y no se paró ni se reseteó ninguna pila. `negocio-prueba` en `trial|true`.
- No había un `next dev` de forjo-app vivo (sin `.next/dev/lock`). Cada sonda levantó el suyo en el 3031 y lo cerró al salir. El de forjo-landing en el 3000 no se tocó.
- El turno estaba libre y no hubo espera. Chrome 157.0.8103.52, node v24.15.0, gesto `interfaz`, modo estricto activo. `validator.ts` entero.
- `main` estaba al día con `origin/main` antes del checkpoint del push.

## Gates (números medidos)

| Corrida | Hora (AR) | Resultado |
|---|---|---|
| Sonda del scroll (`g04-scroll-y-recarga.mjs … cierre-04-08 tras-el-fix`) | 00:08:21 → 00:10:18 | rc 0 · 5/5 `OK` · `coinciden con lo esperado tras el fix: 5` |
| Sonda de la app (`panel-exit-en-la-app.mjs dev interfaz`) | 00:10:18 → 00:22:35 | 47 medidos, 46 coinciden; los 12 `R-T-*` y los 4 `R-B1-*` en `OK`. Única `FALLA`: `R-G3-10-primer-toque-atras-pronto`, la declarada (el costo del camino 1 del 2026-11-16), con la misma tupla que en `(g)` |
| Sonda estática (`panel-back-stack.mjs`) | 00:22:35 → 00:22:42 | rc 0 · 18/18 |
| Pura (`vitest run --project pure`) | 00:22:58 | rc 0 · 77 archivos / 1844 passed + 3 expected fail (piso 77/1844) |
| `tsc --noEmit` | 00:23:11 | rc 0, cero `error TS` |
| eslint | — | settings `immutability=6,purity=2,set-state-in-effect=2`, finanzas `set-state-in-effect=1` (la deuda medida, sin cambios); el resto rc 0 |
| `npm run build` | 00:23:21 → 00:24:10 | rc 0 · 64/64 páginas · cero avisos de `useSearchParams` sin `<Suspense>` · P-7 no aplicó |
| Completa (`npm test`, con el carril `db`) | 01:01:11 → 01:03:29 | rc 0 · 111 archivos / 2151 passed + 4 expected fail + 1 skipped (piso 111/2151) |
| Criterio 5 crudo | — | vacío |
| Lo bloqueado desde `974a131` / fuera del cierre | — | vacío / vacío · huella de `next.config.ts` = `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578` |
| Recibo del task 3 (gate `<automated>`, 2026-11-18) | — | `recorridos sin fila=[] · fecha=1 · motores=1 · commit desplegado=[c3da6d0] existe=0 y esta en origin/main=0` → **rc 0** |

## El push (task 2)

- Antes de presentar el checkpoint: `git rev-list --count main..origin/main` = 0 y el árbol de fuentes limpio. El dueño vio la lista `origin/main..main` y la línea `no-regresion (plan 04-08): …`.
- Lo autorizó en el checkpoint. Se subió `974a131..c3da6d0` sin `--force`.
- **CI:** el run 44304086090 sobre `c3da6d0` terminó en `success`.
- **Vercel:** commit status `success` y deployment Production a las 2026-11-18T12:28:25Z.
- `origin/main` = `c3da6d0` en ese momento. Después quedó local, sin subir, sólo `573531c` (docs).

## La re-UAT (task 3), anotada por el dueño

`fecha: 2026-11-18` · `motores: Android Chrome · Escritorio Chrome` · `commit desplegado: c3da6d0`

| Recorrido | Motor | Resultado |
|---|---|---|
| G6.1 | Android Chrome | ✅ «Anda bien» (con obs-G1) |
| G6.2 | Android Chrome | ✅ «pasa» |
| G6.3 | Escritorio Chrome | ✅ «pasa» |
| G6.4 | Escritorio Chrome | ✅ «pasa» |
| G7.1 | Android Chrome | ✅ «pasa» |
| G7.2 | Android Chrome | ✅ «pasa» |
| G8.1 | Android Chrome + Escritorio Chrome | ✅ «pasa, hice las dos con los dos motores» |
| G8.2 | Android Chrome + Escritorio Chrome | ✅ «pasa, hice las dos con los dos motores» |

Respuesta literal del dueño al checkpoint: **«aprobado»**. MOB-08/MOB-09 y el cierre de G-04-6/7/8 se marcan en `/gsd-verify-work 4 --ws panel-nav`, no acá.

## Follow-up: obs-G1 (fuera del «pasa si»)

En el G6.1, con 0 ventas cargadas, el tab Ventas deja la página más corta que el `scrollY` de ese momento y el navegador recorta el scroll. Al dueño eso le parece un salto. No es un scroll de la app: es el mismo `recorte_por_alto` que la sonda mide en Negocio → Cobros (`## (h)`). El dueño decidió resolverlo después, en un **`/gsd-quick` separado**: alto mínimo del contenedor de los tabs de Finanzas igual al alto de la pantalla (CSS). Quedó anotado en `deferred-items.md` de la fase.

## Files Created/Modified

- `.planning/debug/tabs-en-la-url-medida.md`: `## (j)` con el entorno, cada corrida con su hora, la FALLA declarada y la línea literal `no-regresion (plan 04-08): …`.
- `04-UAT-GAPS.md` (nuevo): el guion de los ocho recorridos y la hoja del dueño. El ejecutor la dejó vacía y el orquestador la anotó con las palabras del dueño (`573531c`).
- `deferred-items.md` (fase 4): el follow-up obs-G1.

## Decisions Made

- La completa se corrió a las 01:01 AR para quedar dentro de la ventana de los canarios de reloj. Todo lo que no depende de la hora corrió a las 00:08. El árbol no cambió entre las dos partes.
- obs-G1 se registra como mejora de UX diferida y no como fallo del G6. Es decisión del dueño.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug del gate, no de la app] El candado de `04-UAT.md` del segundo gate del task 1 tenía mal la base**
- **Found during:** Task 1, segundo `<automated>`
- **Issue:** el gate compara `git diff --name-only 974a131 HEAD -- 04-UAT.md` contra vacío. Las filas del dueño en `04-UAT.md` entraron en `7917c5d` (plan 04-05), que es posterior a `974a131`, así que ese diff nunca puede dar vacío aunque este plan no toque el archivo.
- **Fix:** la comprobación equivalente sobre la base correcta del plan, `git diff --name-only 83fc45c HEAD -- 04-UAT.md`, dio vacío. La verificó también el orquestador. El gate no se reescribió y `04-UAT.md` no se tocó.
- **Files modified:** ninguno
- **Commit:** —

**2. [Alcance] `deferred-items.md` no figura en `files_modified` del plan**
- **Found during:** Task 3 (con la respuesta del dueño)
- **Issue:** el follow-up obs-G1 tiene que quedar en algún registro de lo que está fuera de alcance.
- **Fix:** se agregó la entrada a `deferred-items.md` de la fase, que es lo que el protocolo del ejecutor usa para eso. El plan no lo prohíbe: sólo prohíbe STATE/state.json/ROADMAP/REQUIREMENTS/04-UAT.md. No se tocó código.
- **Files modified:** `deferred-items.md`
- **Commit:** el de este SUMMARY

Ninguna otra. No hubo P-7 ni P-8, no se instaló nada y no se tocó ningún intocable.

## Issues Encountered

None. No hubo `ChunkLoadError`, re-corrida, «Worker exited unexpectedly» ni espera del turno.

## Known Stubs

None.

## Threat Flags

None. No hay superficie nueva. T-04-44 (push) y T-04-45 (recibo de la re-UAT) se mitigaron como dice el `<threat_model>`: checkpoint con la lista delante y hoja nacida vacía. T-04-46 también: los G8 fueron URLs pegadas y no se conectó ni desconectó ninguna cuenta.

## User Setup Required

None.

## Next Phase Readiness

- Siguiente: `/gsd-verify-work 4 --ws panel-nav`, que con `04-UAT-GAPS.md` (8/8 ✅) cierra G-04-6/7/8 y marca MOB-08/MOB-09.
- Sin pushear: `573531c` y el commit de este SUMMARY (docs, sin efecto en producción).
- Diferidos abiertos de la fase: los de `deferred-items.md`, con obs-G1 sumado.
- STATE/ROADMAP/REQUIREMENTS/`04-UAT.md` sin tocar por este ejecutor.

## Self-Check: PASSED

- Archivos: `04-UAT-GAPS.md`, `.planning/debug/tabs-en-la-url-medida.md` (con `## (j)` y la línea `no-regresion (plan 04-08): …`) y `deferred-items.md` existen.
- Commits: `c3da6d0` y `573531c` están en `git log`. `git rev-list --count 83fc45c..HEAD` = 2 antes de este SUMMARY.
- `c3da6d0` está en `origin/main` (`git merge-base --is-ancestor` rc 0).
- El recibo del task 3 dio rc 0.

---
*Phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada*
*Completed: 2026-11-18*
