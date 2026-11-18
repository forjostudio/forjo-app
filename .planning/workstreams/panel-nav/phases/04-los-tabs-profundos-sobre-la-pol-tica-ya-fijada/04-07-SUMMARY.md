---
phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
plan: "07"
subsystem: ui
tags: [historial, tabs, panel-nav, next16, base-ui, oauth, vitest]
gap_closure: true
gap_ids: [G-04-7, G-04-8]

requires:
  - phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
    provides: "04-06: las tres páginas con el boundary con nodo; cierre (h) en el registro"
provides:
  - "toqueDeTab({ grupo, value, search }) en lib/panel-tabs.ts: el toque decide con la URL del momento del toque, compartido por las dos pantallas y el simulador"
  - "La guarda del consumo en vuelo en applyPanelView (consumoEnVuelo + soltarConsumo, popstate de disparo único)"
  - "vueltaDeOAuthPendiente({ query }) por presencia, usado por el render y la guarda del efecto del OAuth de Negocio"
  - "cleansQuery en la regla 2 de panelHistoryAction: una limpieza con la vista igual reemplaza"
  - "montarHistoria con popstate y backAsincrono/procesar() en test/panel-tabs.test.ts"
affects: [04-08, panel-nav, re-UAT de la fase 4]

plan_head_before: d289ce69a6365e1cdb65e98778eeb0698b93a835
actuals:
  tokens: 10500
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - "Helper puro compartido entre el handler de la pantalla y el espejo del test, atado por un candado que lee el cuerpo del espejo"
    - "Guarda de módulo encendida antes del retroceso y soltada por un popstate de disparo único (sin estado nuevo en la pila)"

key-files:
  created: []
  modified:
    - lib/panel-tabs.ts
    - lib/panel-history.ts
    - app/(dashboard)/finances/finances-client.tsx
    - app/(dashboard)/settings/settings-client.tsx
    - test/panel-tabs.test.ts
    - lib/panel-history.test.ts
    - .planning/debug/tabs-en-la-url-medida.md
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md

key-decisions:
  - "applyPanelView calcula cleansQuery sólo cuando hay drop: sin drop no lee window.location antes de decidir (los stubs viejos sin location no se rompen y la decisión es la de siempre)"
  - "En los casos de pila con consumo, el test captura los valores, llama a procesar() y recién después afirma: el popstate se despacha aunque una aserción falle, y la guarda no se filtra a los casos siguientes"
  - "El caso del popstate ajeno afirma también la cantidad de oyentes vivos (1 tras el consumo, 0 tras el ajeno): sin eso el caso daba verde antes del arreglo"

patterns-established:
  - "Los símbolos nuevos de lib/panel-tabs.ts se piden por namespace (PT) en la suite: un símbolo ausente da rojo en su caso"

requirements-completed: []

coverage:
  - id: D1
    description: "Un doble toque rápido en un tab no duplica entradas ni consume dos veces (G-04-7)"
    requirement: "MOB-08"
    verification:
      - kind: unit
        ref: "test/panel-tabs.test.ts#G-04-7 — un toque decide con la URL de ahora, y un consumo en vuelo no se repite"
        status: pass
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz <12 R-T-* y 4 R-B1-*> (16/16)"
        status: pass
    human_judgment: true
    rationale: "La ventana real del doble toque (el commit de la transición) no se mide por CDP; la re-UAT del 04-08 la recorre en el teléfono"
  - id: D2
    description: "Ninguna forma de la URL de vuelta del OAuth traba los tabs de Negocio (G-04-8)"
    requirement: "MOB-08"
    verification:
      - kind: unit
        ref: "test/panel-tabs.test.ts#G-04-8: <las cinco URLs trabadas y los dos controles>"
        status: pass
      - kind: unit
        ref: "lib/panel-history.test.ts#regla 2 con cleansQuery"
        status: pass
      - kind: e2e
        ref: "panel-exit-en-la-app.mjs R-T-negocio-oauth-mp, R-T-negocio-oauth-google-error"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-11-18
status: complete
---

# Phase 4 Plan 07: Un toque, una decisión, y la vuelta del OAuth que no traba Summary

**El toque de un tab decide con la URL de ahora por `toqueDeTab` (compartido con el simulador), `applyPanelView` no repite un consumo hasta que llega su `popstate`, y la vuelta del OAuth de Negocio usa un solo predicado por presencia con una limpieza que reemplaza aunque el tab ya sea Integraciones.**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-11-18T02:44:41Z
- **Completed:** 2026-11-18T03:05:38Z
- **Tasks:** 3/3
- **Files modified:** 8

## Accomplishments

- **G-04-7 cerrado:** los dos `alElegirTab` (Finanzas y Negocio/Configuración) le piden `from`/`to` a `toqueDeTab({ grupo, value, search: window.location.search })`; el `tocar` de la suite llama al mismo helper (candado del espejo). La guarda `consumoEnVuelo` (no exportada) en `applyPanelView` devuelve `none` mientras el retroceso de un consumo no llegó; la rama `consume` la enciende y engancha `soltarConsumo` como `popstate` de disparo único ANTES del retroceso. E3 (doble toque al default) ahora es `consume`, `none`, un retroceso, la URL en `/finances`.
- **G-04-8 cerrado:** `vueltaDeOAuthPendiente({ query })` (presencia de `mp`/`google`, vacío incluido) lo usan el render (lo que se muestra y el corte de la reconciliación) y la guarda del efecto del OAuth. La regla 2 de `panelHistoryAction` gana `cleansQuery`: con `from === to` y algo que `drop` borra de la URL de ahora, `replace` (reglas 0 y 1 primero). Las cinco URLs trabadas quedan en `/negocio?tab=integraciones` limpia, sin entradas nuevas ni retrocesos, y Datos responde. El comentario del «borde aceptado» quedó reescrito.
- **Sin regresión en la app real:** los doce `R-T-*` y los cuatro `R-B1-*` en `OK` (16/16); la suite pura completa verde.

## Task Commits

1. **Task 1 (tracer): G-04-7**
   - `1ed8ee3` test(04-07): el doble toque, rojo
   - `43c2198` fix(04-07): un toque decide con la url de ahora y no consume dos veces
   - `28513ae` docs(04-07): (i) el rojo y el verde del doble toque (G-04-7)
2. **Task 2: G-04-8**
   - `c06850e` test(04-07): la vuelta del oauth que traba, roja
   - `6202bdd` fix(04-07): un solo criterio para la vuelta del oauth y una limpieza que escribe
   - `0e037c4` docs(04-07): (i) el rojo y el verde de la vuelta del oauth (G-04-8)
3. **Task 3: sin regresión, registro y diferido**
   - `c7bd8ec` docs(04-07): (i) verde 16/16 en la app, cierre y la guarda no extendida

Secuencia test/fix del plan: `tftf` (cada RED antes de su arreglo).

## Los RED, con sus rojos

**RED de G-04-7 (`1ed8ee3`):** `test/panel-tabs.test.ts` → 12 rojos, 55 verdes (53 de antes + E1, E2 y E4, que ya pasaban porque el `tocar` viejo leía la URL). Verificado a mano: cada rojo cae en su aserción (`'consume'` donde va `'none'`, `'replace'` donde va `'none'`, `0` oyentes donde va `1`, cuerpos sin `toqueDeTab(`, guarda ausente) o, en los cinco casos puros de `toqueDeTab`, en `toqueDeTab is not a function` dentro de SU caso (import por namespace). Ninguno es de carga del archivo. Nombres:
(f) del handler · toqueDeTab existe · toqueDeTab ×5 (URL limpia, `?tab=ventas`, `?tab=constructor`, valor ajeno, Datos desde Cobros) · E3 doble toque al default · empuje durante el consumo · popstate AJENO · candado del espejo · candado de la guarda.

**RED de G-04-8 (`c06850e`):** 24 rojos y 232 verdes en `test/panel-tabs.test.ts` + `lib/panel-history.test.ts`; todo lo del task 1 siguió verde. Rojos: regla 2 con `cleansQuery` ×6 causas + `null === null` (`'none'` donde va `'replace'`) · las siete URLs (el ayudante pide el predicado inexistente; los dos controles también caen por eso) · el caso sin espejo (`'none'` donde va `'replace'`) · (g) (el render con su `get('mp') !== null`) · existencia + 7 casos del predicado (`vueltaDeOAuthPendiente is not a function`).

Los dos `rojo (i) …` están con todos los nombres en `## (i)` de `.planning/debug/tabs-en-la-url-medida.md`.

**Nota de herramienta:** `gsd-tools check tdd-red-evidence` no aplica con vitest (sólo lee TAP de `node:test`, da `INVALID_RED (zero_tests_discovered)`); el RED se verificó a mano como arriba. En los RED `tsc` quedaba rojo a propósito (propiedad/símbolos todavía inexistentes); limpio en cada GREEN.

## Gates (números medidos)

| Gate | Resultado |
|---|---|
| Task 1, gate 1 | rc 0 · 8 suites 8/644 (piso 639) · panel-tabs 67 (piso 62) · TS vacío · criterio 5 crudo vacío · eslint settings `immutability=6,purity=2,set-state-in-effect=2`, finanzas `set-state-in-effect=1`, lib+test rc 0 · regla 0 con tres dueños 1 · bloqueado desde 974a131 vacío · fuera del cierre vacío · primer commit `test(04-07): el doble toque, rojo` |
| Task 1, gate 2 | rc 0 · `(i)` después de `(h)` · `rojo (i) G-04-7` con 12 casos · fix(04-07) presente · sin commitear vacío |
| Task 2, gate 1 | rc 0 · 8 suites 8/670 (piso 645) · panel-tabs 84 (piso 66) · panel-history 172 (piso 171) · TS vacío · criterio 5 vacío · deuda eslint igual · predicado exportado 1 · llamada del efecto con drop 1 · esqueleto T-1 1 · bloqueado/fuera vacíos · secuencia `tftf` |
| Task 2, gate 2 | rc 0 · `rojo (i) G-04-8` con 24 casos · el de G-04-7 sigue · sin commitear vacío |
| Task 3, gate 1 (por el turno, en segundo plano) | rc 0 · sonda de la app medidos 16, coinciden 16, R-T en OK 12, R-B1 en OK 4, FALLA 0 · pura 77 archivos / 1844 passed + 3 expected fail (piso 77/1820) |
| Task 3, gate 2 | rc 0 · `verde (i)` 16/16 · `cierre (i) … · pura 77/1844` · rojos 1/1 · `cierre (h)` intacto · diferido de la guarda y el «Volver» nombrados · sin commitear vacío |

**La sonda de la app** (2026-11-17 23:58 → 2026-11-18 00:04 AR): turno libre sin espera; Supabase local 200 (sin `supabase start`); next dev propio en 3031 (200 al primer intento), cerrado al salir; 3031 y 9335 libres después; forjo-landing en el 3000 sin tocar; Chrome 157.0.8103.52, node v24.15.0, modo estricto activo. Sin `ChunkLoadError` ni re-corrida.

## Files Created/Modified

- `lib/panel-tabs.ts` — `toqueDeTab` y `vueltaDeOAuthPendiente`, puros, con docblock del porqué.
- `lib/panel-history.ts` — `consumoEnVuelo`/`soltarConsumo` y la guarda en `applyPanelView`; `cleansQuery` en `panelHistoryAction` (regla 2) y su cálculo en el ejecutor; encabezado «QUÉ NO HACE» enmendado con el único `popstate` que escucha.
- `app/(dashboard)/finances/finances-client.tsx` — `alElegirTab` por `toqueDeTab`; `tabSlug` sale del import.
- `app/(dashboard)/settings/settings-client.tsx` — `alElegirTab` por `toqueDeTab` (guarda de entrada en `grupoDeTabs === null`); render y efecto del OAuth por `vueltaDeOAuthPendiente`; comentario corregido. Esqueleto de T-1 intacto.
- `test/panel-tabs.test.ts` — `montarHistoria` con `popstate`/`backAsincrono`/`procesar()`/`popstate()`; `tocar` por `toqueDeTab`; `volverDelOAuth`; describes de G-04-7 y G-04-8; (f) y (g) extendidos; candados del espejo y de la guarda.
- `lib/panel-history.test.ts` — la regla 2 con `cleansQuery` (un `it` por causa + regla 0 + null/null).
- `.planning/debug/tabs-en-la-url-medida.md` — `## (i)` con `rojo (i) G-04-7`, `rojo (i) G-04-8`, `verde (i)`, `cierre (i)`.
- `deferred-items.md` (fase 4) — la guarda no extendida a `consumeOwnedPanelEntry`.

## Decisions Made

- `cleansQuery` se calcula sólo si hay `drop`: sin `drop` el ejecutor no lee la query antes de decidir (la decisión queda idéntica a la de antes y los stubs sin `location` de otras suites no se rompen).
- Los casos de pila con consumo capturan valores, despachan el `popstate` (`procesar()`) y recién después afirman: una aserción fallida no deja la guarda encendida para los casos siguientes.
- El caso del `popstate` ajeno afirma también los oyentes vivos (1 → 0): sin eso habría dado verde antes del arreglo y no habría contado entre los rojos nombrados, como pedía el plan.

## Deviations from Plan

**Conteos de `it`:** respetada la regla de UN `it` por caso nombrado. panel-tabs pasó de 53 a 67 (task 1: +14) y a 84 (task 2: +17, incluido el contrapuesto «sin nada que borrar» del caso sin espejo, que el `<behavior>` describe y ya era verde en el RED); panel-history de 163 a 172 (+9). Todos por encima de sus pisos.

Ninguna otra: plan ejecutado como estaba escrito. Sin auto-fixes, sin tocar intocables, sin dependencias nuevas.

## Issues Encountered

None. `validator.ts` no se truncó; no hubo `ChunkLoadError`; vitest no tiró «Worker exited unexpectedly». La pura no incluye los canarios de reloj (carril `db`), así que la hora (fuera de [01:00, 23:30]) no la afectó.

## Known Stubs

None.

## Threat Flags

None: la superficie nueva (un oyente `popstate` que sólo apaga una memoria de módulo) está en el `<threat_model>` (T-04-39/T-04-40).

## User Setup Required

None.

## Next Phase Readiness (avisos para el 04-08)

- Pisos para el 04-08: pura **77/1844** (+3 expected fail); 8 suites de historial **670**; panel-tabs **84**; panel-history **172**.
- La re-UAT tiene que recorrer en el teléfono: el doble toque rápido en Ventas/Turnos (la ventana real no se midió por CDP), una URL pegada `/negocio?mp=` o `/negocio?tab=integraciones&mp=connected` (los tabs responden) y el «Volver» de clientes (hereda la guarda por construcción, sin sonda directa).
- Diferido abierto: la guarda NO cubre `consumeOwnedPanelEntry` (menú NAV-08, primer paso de B1); caso cruzado tab-consumido + barra/sidebar antes del recorrido, sin medir. IN-03 (Agenda) sigue diferido.
- MOB-08/MOB-09 sin marcar; STATE/ROADMAP/REQUIREMENTS sin tocar; nada pusheado.

## Self-Check: PASSED

- Archivos: `lib/panel-tabs.ts`, `lib/panel-history.ts`, las dos pantallas, las dos suites, el registro y `deferred-items.md` existen y están commiteados.
- Commits: `1ed8ee3`, `43c2198`, `28513ae`, `c06850e`, `6202bdd`, `0e037c4`, `c7bd8ec` presentes en `git log` (7 = `git rev-list --count d289ce6..HEAD` antes de este SUMMARY).

---
*Phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada*
*Completed: 2026-11-18*
