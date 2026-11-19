---
phase: quick-261118-pjd
plan: "01"
subsystem: ui
tags: [historial, panel-nav, B1, guarda-de-consumo, pageshow, vitest]
status: complete

requires:
  - phase: quick-261118-kat
    provides: "la guarda de consumo en vuelo compartida (87868c4) y su code review (261118-kat-REVIEW.md)"
provides:
  - "un solo segundo paso de B1 pendiente (segundoPasoB1Pendiente): el último toque gana"
  - "try/catch que desengancha y relanza en las tres ramas de dos pasos de runBranchNavigation"
  - "pageshow sin disparo único; criterio de llegada state Y URL (urlDelConsumo, WR-01 opción A)"
  - "consumeOwnedBranchEntry comparte la guarda (UP-doble) con su candado C-retroceso-unico-rama"
affects: [panel-nav, MOB-08, MOB-09, push conjunto obs-G1 + R2-WR-01]

actuals:
  tokens: 17900
  tasks: 3
  commits: 6
plan_head_before: 73ff6cc

tech-stack:
  added: []
  patterns:
    - "tres copias a propósito del bloque de encendido de la guarda, vigiladas por candados de fuente"
    - "segundo paso pendiente único por memoria de módulo no exportada"

key-files:
  created: []
  modified:
    - lib/panel-branch.ts
    - lib/panel-history.ts
    - app/(dashboard)/finances/finances-client.tsx
    - test/panel-tabs.test.ts
    - test/panel-branch.test.ts
    - lib/panel-history.test.ts
    - .planning/debug/tabs-en-la-url-medida.md
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-SECURITY.md

key-decisions:
  - "CR-01: un solo segundo paso de B1 pendiente, el nuevo reemplaza al anterior (dueño, 2026-11-18)"
  - "WR-01: opción A — el recorrido llegó sólo si cambiaron el state Y la URL (dueño, 2026-11-18)"
  - "UP-doble: consumeOwnedBranchEntry comparte la misma guarda (dueño, 2026-11-18: medirlo y arreglarlo si da rojo)"

requirements-completed: []

duration: ~45min (task 3)
completed: 2026-11-19
---

# Quick 261118-pjd: CR-01 del review de R2-WR-01 — un solo segundo paso de B1, el try de la rama, el criterio de llegada state+URL y la guarda compartida en `up`

**Los cinco hallazgos medidos reprodujeron y quedaron arreglados con sus esperados commiteados antes del `fix`: el doble toque a Inicio ya no saca al dueño del sitio, un `back()` que tira no deja segundos pasos colgados, y un reemplazo de Next en la ventana ya no suelta la guarda.**

## Entorno

- Task 1: 2026-11-18 ~20:40 AR, node `v24.15.0`, HEAD `73ff6cc` → medición en `ba97254`.
- Task 3: 2026-11-19 ~00:45 AR, mismo node; HEAD al arreglar `4ae9a12`.

## Commits

| Hash | Asunto |
|---|---|
| `ba97254` | test: los casos medidos antes de arreglar (14 + 4, contador de pageshow, drenaje por despacho) |
| `4ae9a12` | docs: veredictos en (m) |
| `341e12d` | test: el instrumento de la opción A de WR-01, neutral antes del arreglo |
| `54a5e08` | test: UP-doble — el candado de la guarda compartida, antes del arreglo |
| `5d7ee5f` | fix: un solo segundo paso de B1 / try de la rama / pageshow sin once / criterio de llegada / guarda en consumeOwnedBranchEntry |
| `dda5af8` | docs: (m), deferred-items y 04-SECURITY con lo medido |

## Hallazgos: medido, veredicto, qué se hizo

| Caso | Antes (rojo) | Después | Veredicto | Qué se hizo |
|---|---|---|---|---|
| CR-01 `CR-b1-doble` | 3 retrocesos, `/afuera` | 2, `/dashboard` | reproduce → arreglado | `segundoPasoB1Pendiente` en `runBranchNavigation` |
| CR-01 `CR-b1-doble-fichas` | 4, `/afuera` | 3, `/dashboard` | idem | idem |
| CR-01 `CR-b1-silencio` | 4, `/afuera` | 2, `/dashboard` | idem | idem + docblock WR-04 |
| CR-01 `CR-b1-reemplazo-unidad` | primero no desenganchado | desenganchado | idem | idem |
| WR-02 `K2-c-b1` | 2, `/dashboard`, 1 oyente | 1, `/finances`, 0 | reproduce → arreglado | `try`/`catch (e)`/`throw e` en las 3 ramas |
| WR-02 `K2-c-b1-unidad`/`exit`/`colapso` | segundo paso enganchado | desenganchado | idem | idem |
| WR-01 `W1-menu` | 2, `/dashboard` | 1, `/finances` | reproduce → arreglado (A) | `urlDelConsumo`; chequeo state O URL |
| WR-01 `W1-b1` | 3, `/afuera` | 2, `/dashboard` | idem | idem |
| IN-01 `C-pageshow-no-persistido` | guarda sin salida por bfcache | viva tras no persistido, suelta tras persistido | reproduce → arreglado | `pageshow` sin `once` |
| UP `UP-doble` | 2, `/afuera` | 1, `/dashboard` | reproduce → arreglado | guarda compartida en `consumeOwnedBranchEntry` |
| `C-retroceso-unico-rama` | rojo (`expected -1 to be greater than -1`) | verde | candado nuevo | commit `test` antes del `fix` |

Verdes desde el principio (no-regresión): `NR-menu-y-barra`, `UP-control`, `P0-*`, el candado de orden de B1.
Docblocks: WR-04, WR-01, IN-01, la guarda compartida, el encabezado del módulo; IN-02 sólo el comentario de obs-G1.

## Mutaciones (WR-03), revertidas con Edit y sin commitear

- M1 (sin el condicional de `persisted`): rojo `C-pageshow-no-persistido` (1 failed | 111 passed).
- M2 (sin sacar el oyente de `pageshow`): rojo `P0-normal` + `P0-catch-*`, `P0-pageshow`, `C-pageshow-no-persistido` y 5 de NAV-08 (10 failed | 274 passed).
- Logs: `C:\Users\franc\AppData\Local\Temp\tmp.JP4cU02P7t\m1.txt` y `m2.txt`. `git diff --quiet HEAD -- lib/panel-history.ts` = 0 después de cada una.

## Gates

- **Gate 1 (estático/suites/build):** `tsc` limpio; eslint rc 0 en los 5 archivos, `finances-client.tsx` sólo la deuda `467:21`; pura 77 archivos / 1876 casos, 0 fallas; 8 suites 702; `panel-tabs` 112; políticas byte-idénticas; `panel-branch.ts` sólo en `runBranchNavigation` y su memoria; 3 `catch (e)`/3 `throw e`; cero temporizadores. **Rojo en dos ítems, declarados abajo** (conteo de `pageshow` y build dentro del gate). Log: `C:\Users\franc\AppData\Local\Temp\claude\19a1c3eef8049c86\e3541fb4-9838-45ba-8edf-fb689e438b9e\scratchpad\pjd-t3-gate1b.txt`.
- **Build suelto:** `rc=0` dos veces (`pjd-build3.txt`, `pjd-build4.txt` en el mismo scratchpad), 64/64 páginas, 0 avisos de Suspense.
- **Gate 2 (por el turno):** rc 0. App 47 medidos, 46 coinciden, única FALLA la declarada `R-G3-10-primer-toque-atras-pronto`; R-T 12/12; R-B1 4/4 con el retroceso triple; estática 18/18; scroll 8/8 con `paneles con alto minimo: 3`. Logs: `C:\Users\franc\AppData\Local\Temp\tmp.4jcriXdRPu\` (`app.txt`, `estatica.txt`, `scroll.txt`).

## Deviations from Plan

1. **[Gate del plan] El conteo de `pageshow` sin `once` da 3 y el gate exige 2.** El plan contó un bloque de encendido por función con dos funciones; con FUP, `consumeOwnedBranchEntry` lleva el tercer bloque, que `C-retroceso-unico-rama` exige idéntico a los otros dos. Con `once` hay 0. Es un error del conteo del gate con FUP (debería ser 2 + FUP), no del código. No se tocó el código para satisfacerlo.
2. **[Rule 3 - Entorno] `.next/dev/types/routes.d.ts` corrupto** (basura después del final, del 2026-11-18 16:29) hacía caer el `tsc` del build. Sin `next dev` de forjo-app vivo, los tres archivos de `.next/dev/types/` se movieron al scratchpad (`apartado-next-dev-types/`); `next dev` los regenera. Además hubo dos builds con errores transitorios de `next/font/google` y un worker caído (`3221226505`) durante la re-corrida del gate, con suites de otros proyectos corriendo en la máquina: P-7, entorno.
3. **Ediciones declaradas de pruebas:** el stub de NAV-08 con `location` (opción A, commit `test` neutral: mismos 12 rojos de (m)) y las tres aserciones de `test/panel-branch.test.ts` (up y colapso), que dieron rojo con el `fix` por los oyentes de la guarda y pasan a contar los que no son de la guarda, con la misma cantidad. Ningún esperado cambió.

## Residuos

Teléfono real (UAT corta después del push conjunto), Safari de iOS y Android reales, el `HistoryUpdater` real en la ventana (y el borde de A: un reemplazo que cambie la URL suelta la guarda antes de tiempo, como antes), el doble toque sobre el COLAPSO (cubierto por lectura, sin medir) y R2-IN-04.

**No se pusheó.** SUMMARY, STATE y PLAN quedan para el orquestador.

## Self-Check: PASSED

- Commits `ba97254`, `4ae9a12`, `341e12d`, `54a5e08`, `5d7ee5f`, `dda5af8` presentes en `git log`.
- Archivos modificados presentes; `(m)` termina en `cierre (m): CR-01=arreglado · WR-02=arreglado · WR-01=arreglado · IN-01=arreglado · UP=arreglado`.
