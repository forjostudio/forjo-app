---
phase: quick-261118-kat
plan: "01"
subsystem: panel-history
tags: [history, popstate, pageshow, bfcache, b1, nav-08, vitest, cdp]
status: complete

requires:
  - phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
    provides: "la guarda de consumo en vuelo del 04-07 (G-04-7), B1 del 04-04, el review ronda 2 (R2-WR-01, IN-03) y AR-04-05/AR-04-06 con vencimiento"
provides:
  - "la guarda de consumo en vuelo compartida con consumeOwnedPanelEntry (una sola memoria, chequeo de identidad del state)"
  - "el back() que tira suelta la guarda (try/catch que relanza)"
  - "salida defensiva por pageshow con persisted"
  - "simulador fiel al DOM con despacho de pageshow y drenaje de la guarda entre casos"
  - "los candados C-retroceso-unico, C-pageshow-tab y C-pageshow-menu"
affects: [panel-nav, MOB-08, MOB-09, R2-IN-04, UAT corta con obs-G1]

actuals:
  tokens: 21400
  tasks: 3
  commits: 5
plan_head_before: 5f36c460c8476278a487246dbacdf2b7bcd750e4

tech-stack:
  added: []
  patterns:
    - "bloque de encendido de la guarda duplicado a propósito y vigilado por un candado anti-deriva (C-retroceso-unico)"
    - "chequeo de identidad de history.state para soltar la guarda cuando el oyente de B1 corre antes que el de la guarda"

key-files:
  created:
    - .planning/workstreams/panel-nav/quick/261118-kat-r2-wr-01-la-guarda-de-consumo-en-vuelo-s/261118-kat-SUMMARY.md
  modified:
    - lib/panel-history.ts
    - test/panel-tabs.test.ts
    - test/panel-branch.test.ts
    - lib/panel-history.test.ts
    - .planning/debug/probes/g04-scroll-y-recarga.mjs
    - .planning/debug/tabs-en-la-url-medida.md
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-SECURITY.md

key-decisions:
  - "Caso 1 (bfcache) no reprodujo en Chrome 157; el dueño eligió A: soltar la guarda en pageshow con persisted como mitigación defensiva, verificada sólo en el simulador"
  - "Casos 2 y 3 reprodujeron y se arreglaron con el diseño del plan (F2 try/catch, F3 guarda compartida con estadoDelConsumo); lib/panel-branch.ts intacto"

patterns-established:
  - "Toda memoria de módulo que sobrevive al caso se drena en el afterEach con el window del caso todavía puesto"

requirements-completed: []

duration: "~73 min (task 1 desde 13b378b 15:23; task 3 cerrado 16:36, más la espera del turno del task 1)"
completed: 2026-11-18
---

# Phase quick-261118-kat Plan 01: R2-WR-01, la guarda de consumo en vuelo Summary

**La guarda de consumo en vuelo ahora se comparte con `consumeOwnedPanelEntry` por identidad del state, un `back()` que tira la suelta con un `try`/`catch` que relanza, y un `pageshow` persistido la suelta como mitigación defensiva; medido rojo antes y verde después, sin regresar B1.**

## Los tres casos

| Caso | Medido (código de antes) | Veredicto | Qué se hizo |
|------|--------------------------|-----------|-------------|
| 1 — bfcache sin `popstate` | K1-bfcache-cruce en Chrome 157: cruzó de documento, pero ningún documento entró a la bfcache (`Circumstantial/BroadcastChannelOnMessage`); B volvió como documento nuevo y el tab respondió | no-reproduce | Mitigación defensiva por decisión del dueño (A): `soltarAlVolverDeLaCache` en `pageshow` con `persisted`. Verificada sólo en el simulador (`C-pageshow-tab`, `C-pageshow-menu`) |
| 2 — un `back()` que tira | K2-a: `oyentes: 1`, `siguiente: 'none'`, URL en `?tab=ventas` | reproduce | F2: `try` alrededor del oyente y el retroceso; el `catch` llama a `soltarConsumo()` y relanza el mismo error |
| 3a — tab y después menú/B1 | K3a-nav08: 2 retrocesos, `/dashboard`; K3a-b1: 3 retrocesos, `/afuera` | reproduce | F3: guarda compartida; con un consumo en vuelo desde la misma entrada, `consumeOwnedPanelEntry` devuelve `true` sin retroceder |
| 3b — menú/B1 y después tab | K3b-nav08: el tab volvía a consumir (2 retrocesos); K3b-b1: 3 retrocesos, `/afuera` | reproduce | F3: el menú enciende la guarda con el mismo bloque que la rama `consume`, y el tab da `none` |

Decisión del dueño (checkpoint del task 2, 2026-11-18): **A**. Queda registrada en `(l)` como `decision caso 1 (dueno, 2026-11-18): A`.

## Commits

| Task | Commit | Asunto |
|------|--------|--------|
| 1 | `13b378b` | test(quick-261118-kat): R2-WR-01 — los tres casos de la guarda medidos antes de arreglar (simulador fiel, K2/K3/NR y K1) |
| 1 | `52dbfec` | docs(quick-261118-kat): R2-WR-01 medido antes de arreglar — veredictos de los tres casos en (l) |
| 3 | `9e4df17` | test(quick-261118-kat): R2-WR-01 — los candados del arreglo, antes del arreglo |
| 3 | `87868c4` | fix(quick-261118-kat): R2-WR-01 — el back que tira suelta la guarda, la guarda se comparte con consumeOwnedPanelEntry y pageshow |
| 3 | `8761f07` | docs(quick-261118-kat): R2-WR-01 cerrado — (l), deferred-items y 04-SECURITY con lo medido |

Nada se pusheó: sale con obs-G1, y la UAT corta en el teléfono queda para ese push.

## El entorno

- Task 1: 2026-11-18, simulador 15:24 y K1 ~15:45 (tras ~22 min de turno detrás de `forjo-tiendas`). Pila local de Supabase arriba (API 200, ninguna escritura), `next dev` propio en el 3031 levantado y cerrado por la sonda, forjo-landing en el 3000 sin tocar, Chrome 157.0.8103.52, node v24.15.0.
- Task 3: 2026-11-18 ~16:05-16:36. Turno libre al empezar. Sin `next dev` de forjo-app vivo (sí los de erp-forjo-studio y forjo-tiendas, sin tocar), así que el build no chocó (P-7 no aplicó).

## Los números

**Candados antes del arreglo** (`9e4df17`): `panel-tabs` `Tests 7 failed | 90 passed (97)`. Los 7 rojos: los 5 K y `C-retroceso-unico` (`expected -1 to be greater than -1`) y `C-pageshow-tab` (`{ tras: 'none', oyentes: 1 }`). `C-pageshow-menu` en verde, como estaba previsto. Los 85 casos viejos, verdes.

**Gate 1 del task 3** (rc 0): banderas F1=1 F2=1 F3=1, decisión coherente, un solo `fix`, los candados antes del `fix`, 0 líneas quitadas de `panel-tabs` desde KC, bloque K y G-04-7 idénticos, `panel-branch.test.ts` sólo con la línea declarada quitada (QB=0, NB1=1), `panel-history.test.ts` sólo en el preludio (QH=0), `pageshow` coherente, `consumeOwnedPanelEntry` coherente (un retroceso, chequeo antes de la guarda ajena), guarda llana presente, no exportada, sin temporizadores, frases viejas 0/0/0, intocables sin cambios, `next.config.ts` `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`, `tsc` sin errores, eslint rc 0, pura 77 archivos / 1857 casos, 8 suites 683, `panel-tabs` 97, build rc 0 sin avisos de Suspense.

**Gate 2 del task 3** (rc 0, por el turno): app `recorridos medidos: 47 · coinciden con lo esperado: 46 · no coinciden: 1` con R-T 12/12 y R-B1 4/4 en `OK`, y la única FALLA la declarada `R-G3-10-primer-toque-atras-pronto`. Estática 18/18. Scroll `verde-r2wr01 · tras-el-fix` 8/8 con `paneles con alto minimo: 3`. K1 no se volvió a correr: el gate lo corre sólo si el caso 1 reprodujo.

**Gate 3 del task 3** (rc 0, con este SUMMARY escrito): la última línea de `(l)` es el `cierre (l)` que corresponde, 0 líneas quitadas de la medida, en `deferred-items` 3 quitadas (las tres `status: open`) y quedan 8 abiertas, las 3 entradas del quick resueltas, AR-04-05/AR-04-06/T-04-40 al día, audit trail 1, `threats_open: 0` y `verified`, 0 otras líneas de SECURITY cambiadas, 2 commits `docs`, nada sin commitear, `requirements-completed: []` y el `fix` en ninguna rama remota.

## Logs

- Candados en rojo: `C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/e3541fb4-9838-45ba-8edf-fb689e438b9e/scratchpad/kat-candados-rojo.txt`
- Gate 1: `C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/e3541fb4-9838-45ba-8edf-fb689e438b9e/scratchpad/kat-t3-gate1.txt`
- Gate 2 (resumen): `C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/e3541fb4-9838-45ba-8edf-fb689e438b9e/scratchpad/kat-t3-gate2.txt`
- Gate 2 (completos): `C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/e3541fb4-9838-45ba-8edf-fb689e438b9e/scratchpad/kat-t3-logs/app.txt`, `.../kat-t3-logs/estatica.txt`, `.../kat-t3-logs/scroll.txt`
- K1 del task 1: `C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/e3541fb4-9838-45ba-8edf-fb689e438b9e/scratchpad/kat-k1-medicion.txt`

## Deviations from Plan

1. **[Declarado por el ejecutor del task 1] Corrida preliminar de vitest antes del commit `test`.** Hubo una corrida con los 9 casos escritos antes de `13b378b`. Ningún esperado cambió entre esa corrida y el commit, y la corrida que juzga es la del gate 1 del task 1, posterior.
2. **[Aviso, sin efecto en el gate] La sonda de la app devolvió rc 127 y no 1.** Las corridas anteriores daban rc 1 por la FALLA declarada. La salida está completa (47 recorridos, el resumen y `turno de pantalla: soltado.`), y la estática y el scroll, que pasan por el mismo envoltorio, dieron rc 0. El gate no juzga ese código. No se investigó: el origen está en la herramienta del turno (`D:/herramientas/turno-pantalla`), que no vive en este repo y no se edita.
3. **Drenaje en `test/panel-branch.test.ts`:** filtra los oyentes por `fn.name === 'soltarConsumo'`, igual que la aserción declarada, que filtra por nombre. Depende del nombre de la función, que es estable en el código fuente porque los tests no corren minificados. Es lo que pedía el plan.

Fuera de eso, el plan se ejecutó como estaba escrito. No se tocó ninguna aserción vieja salvo la declarada del B1.

## Residuos declarados (sin medir)

- El caso 1 en la app: con el panel fuera de la bfcache en Chrome 157, la salida por `pageshow` sólo la fija el simulador.
- Safari de iOS, Chrome de Android reales y la pestaña descartada y restaurada.
- Un retroceso que el navegador ignora en silencio (sin tirar y sin recorrer) deja la guarda encendida hasta el próximo recorrido o una recarga. Está declarado en el docblock.
- El build de producción no se corre en local: el entorno de producción apunta a la base de producción.
- R2-IN-04 sigue abierto y fuera de alcance.
- La UAT en el teléfono va con obs-G1, después del push.

## Registro

- `(l)` termina en `cierre (l): la guarda de consumo en vuelo · caso 1=mitigado · caso 2=mitigado · caso 3=mitigado`.
- `deferred-items.md`: las tres entradas del quick están `resolved (quick 261118-kat, cerrado por mitigación; …)`, cada una con su `**Cierre:**`. Quedan 8 `status: open`.
- `04-SECURITY.md`: AR-04-05 y AR-04-06 cerrados por mitigación con el número. T-04-40 quedó `closed (mitigado, quick 261118-kat)` y T-04-39 con el residuo cerrado. Tiene una fila nueva en el audit trail y la línea del vencimiento cumplido. `threats_open: 0` y `status: verified` no cambiaron.

## Self-Check: PASSED

- Commits `13b378b`, `52dbfec`, `9e4df17`, `87868c4` y `8761f07` presentes en `git log`.
- Archivos modificados presentes. `lib/panel-branch.ts` y los intocables, sin cambios (gate 1).
