---
phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
plan: "06"
subsystem: panel-nav
status: complete
gap_closure: true
gap_ids: [G-04-6]
tags: [scroll, suspense, next-16, tabs, finanzas, negocio, configuracion, sonda-cdp, gap-closure]

requires:
  - phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
    provides: "04-05: la UAT del dueño en producción (obs-1) y el diagnóstico de .planning/debug/finanzas-primer-toque-scroll.md"
provides:
  - "Finanzas, Negocio y Configuración con un <Suspense> cuyo fallback es un div vacío con la clase del contenedor raíz y aria-busy: el primer toque de un tab ya no mueve la página tras una entrada blanda (G-04-6)"
  - "La sonda g04-scroll-y-recarga.mjs con modo tras-el-fix, clasificador puro clasificarToque (recorte_por_alto) y modos sin navegador --autotest / --reclasificar"
  - "## (h) en .planning/debug/tabs-en-la-url-medida.md: rojo 1/5, verde finanzas 4/5, el control del instrumento, verde 5/5 y cierre (h)"
  - "deferred-items.md: /clients sin medir, IN-02 y data-scroll-behavior (status: open)"
affects: [04-07, 04-08, "/gsd-verify-work 4 --ws panel-nav (marca MOB-08/MOB-09)"]

actuals:
  tokens: 9050
  tasks: 2
  commits: 11
plan_head_before: daedd2f7342ca9804dd637b5b8a3f522cce63aac

tech-stack:
  added: []
  patterns:
    - "Un Suspense de página que puede mostrarse en una navegación blanda necesita un NODO en el fallback (div vacío con la clase del contenedor): sin elemento, el handler de scroll de Next 16.2.7 deja pendiente el scroll de la navegación y el próximo cambio de estado del router lo ejecuta"
    - "Un clasificador de sonda que cambia se publica como función pura con un control sin navegador (--autotest con los números medidos y --reclasificar sobre los logs guardados) ANTES de volver a medir"

key-files:
  created:
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-06-SUMMARY.md
  modified:
    - .planning/debug/probes/g04-scroll-y-recarga.mjs
    - test/panel-tabs.test.ts
    - "app/(dashboard)/finances/page.tsx"
    - "app/(dashboard)/negocio/page.tsx"
    - "app/(dashboard)/settings/page.tsx"
    - .planning/debug/tabs-en-la-url-medida.md
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md

key-decisions:
  - "El fallback del Suspense de Finanzas/Negocio/Configuración es un div VACÍO con la clase del contenedor raíz del cliente y aria-busy=true: cero píxel nuevo, alto 0, y el handler de scroll de Next lo consume al montar"
  - "P-1 decidido por el dueño («A + control»): llevo_al_inicio no cuenta como salto un recorte_por_alto (cero escrituras de scroll de la página en el toque Y alto_despues - innerHeight < y_antes); ningún esperado cambió"
  - "El control del instrumento corregido (autotest 5/5; RED reclasificado 0/11 toques cambian, Negocio 187->0 con escritura sigue siendo salto) se anotó en (h) antes de la corrida verde"

patterns-established:
  - "Corrección de instrumento con control: función pura + --autotest con números medidos + --reclasificar de los logs viejos, commiteado y anotado antes de re-medir"

requirements-completed: []

duration: "ejecutor 1: tasks 1 y 2 hasta la corrida 4/5 (23:16 → 23:27); continuación: 23:30 → 23:45 hora de Argentina (2026-11-17)"
completed: 2026-11-17
---

# Phase 4 Plan 06: El primer toque de un tab no mueve la página (G-04-6) Summary

**El `<Suspense>` de Finanzas, Negocio y Configuración pasa de `fallback={null}` a un `div` vacío con la clase de su contenedor y `aria-busy`, el handler de scroll de Next consume el scroll de la entrada blanda al montar, y la sonda en Chrome real pasa de RED 1/5 a 4/5 (Finanzas) y a 5/5 (las tres páginas), con el instrumento corregido por decisión del dueño y controlado antes de re-medir.**

## Performance

- **Duración:** el primer ejecutor hizo los tasks 1 y 2 hasta la corrida 4/5 (23:16 → 23:27 hora de Argentina, 2026-11-17) y paró en el checkpoint de decisión; esta continuación, 23:30 → 23:45. Turno de pantalla libre en las cuatro corridas (sin espera).
- **Tasks:** 2 de 2 (task 1 tracer, task 2 TDD)
- **Archivos:** 7 modificados (3 páginas, 1 test, la sonda, el registro, lo diferido)

## Las corridas de la sonda (`g04-scroll-y-recarga.mjs`, modo `tras-el-fix`, por el turno)

Entorno de las cuatro: pila local de forjo-app arriba (`/rest/v1/` 200, sin `supabase start`), sin `next dev` de forjo-app vivo; la sonda levantó el suyo en el 3031 (`/login 200` al primer intento) y lo cerró (3031 y 9335 libres al salir). El `next dev` de forjo-landing en el 3000 no se tocó. `Chrome/157.0.8103.52`, node `v24.15.0`, `next.config.ts` con sha1 `8ceb99ae…` (sin tocar).

| corrida | páginas | veredicto |
|---|---|---|
| RED (`rojo-04-06`) | las tres sin tocar | `coinciden con lo esperado tras el fix: 1` (sólo `F-directa-movil`; los cuatro blandos con `scrollTop=0` + `scrollIntoView()` desde `handlePotentialScroll`) |
| verde de Finanzas (`verde-finanzas-04-06`, `0777339`) | Finanzas arreglada | `4` (los cuatro `F-*` OK; Negocio FALLA = control positivo) |
| tres páginas, instrumento viejo (`verde-04-06`, `7a193a4`) | las tres | `4`: Negocio sin NINGUNA escritura pero `salto_toque1: si` por el recorte 1389 → 844 px → checkpoint de decisión |
| **final (`verde-04-06`, `3c25616` + `7a193a4`)** | las tres, instrumento corregido | **`5`**, rc 0; Negocio: Cobros 187 → 0 con cero escrituras, `recorte_por_alto: si` |

Líneas literales en `## (h)`: `rojo (h)` 1/5, `verde finanzas (h)` 4/5, `verde (h)` 5/5, y `cierre (h): el primer toque no mueve la pagina`.

## Los pasos de test (TDD)

- Task 1, RED: `test/panel-tabs.test.ts`, el caso de la página de Finanzas («la página: Suspense, el negocio por owner_id y SIN searchParams…») exigiendo el fallback con nodo → `1 failed | 52 passed (53)`, por aserción. GREEN con `0777339`: 53/53.
- Task 2, RED: el caso (e) por página → `1 failed | 52 passed (53)`, sólo (e) (Negocio primero; Configuración igual). GREEN con `7a193a4`: 53/53; las ocho suites de historial 630/630.
- `gsd-tools check tdd-red-evidence` da `INVALID_RED (zero_tests_discovered)` con vitest (sólo entiende TAP de node:test): no es un rojo real ni una ausencia de rojo; el RED se verificó a mano con la salida de vitest citada arriba.

## Los gates del plan (re-corridos al cerrar)

- Task 1 gate 1: panel-tabs rc 0, 53 casos; fallback con nodo en Finanzas = 1, nulo = 0, frase falsa = 0, `owner_id` = 1; `esperado_tras_el_fix` 13, `esperado_si_HA` 13; `node --check` y eslint 0; el primer commit del plan sobre sonda+página no toca la página; nada bloqueado desde `974a131`; `next.config.ts` sha1 `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`. Verde.
- Task 1 gates 2 y 3: corrida 4/5 (del primer ejecutor) y las líneas `rojo (h)` / `verde finanzas (h)` presentes. Verde.
- Task 2 gate 1: 8 suites rc 0, 8 archivos, 630 casos; fallback con nodo en Negocio+Configuración = 2, nulo 0, frase falsa 0, `getBusinessSecrets(business.id)` = 2; eslint 0; `/clients`, `settings-client.tsx`, `app/layout.tsx`, `app/globals.css` sin cambios desde `974a131`; código fuera del plan: vacío. Verde.
- Task 2 gate 2 (sonda): rc 0, OK 5, FALLA 0, errores del instrumento 0, veredicto 5/5, cabecera con Negocio y Configuración arreglados = 2. Verde.
- Task 2 gate 3: `verde (h)` 1, `cierre (h)` 1, rojo/verde finanzas 1/1, diferidos clientes/IN-02/data-scroll-behavior 1/1/1, `status: open` 7, nada sin commitear. Verde.
- Extra: `./node_modules/.bin/tsc --noEmit` rc 0.

## Commits

| # | hash | asunto |
|---|---|---|
| 1 | `c7a1a78` | test(04-06): modo tras-el-fix de la sonda del scroll |
| 2 | `5dba97a` | test(04-06): la pagina de Finanzas exige un fallback con nodo |
| 3 | `0777339` | fix(04-06): el boundary de Finanzas tiene un nodo mientras suspende |
| 4 | `81a3077` | docs(04-06): (h) el RED 1/5 y el verde de Finanzas 4/5 del primer toque de un tab |
| 5 | `2e941fe` | test(04-06): (e) exige el fallback con nodo en las tres paginas |
| 6 | `7a193a4` | fix(04-06): negocio y configuracion con el boundary con nodo |
| 7 | `5de0e25` | docs(04-06): corrida de las tres paginas 4/5 (Negocio sin escrituras, recorte por alto) y lo diferido |
| 8 | `3c25616` | test(04-06): la sonda descuenta el recorte por alto en llevo_al_inicio (P-1) |
| 9 | `9afe20b` | docs(04-06): (h) la decision del dueno y el control del instrumento corregido |
| 10 | `834417e` | test(04-06): --reclasificar distingue un log ya clasificado de uno viejo |
| 11 | `f361f06` | docs(04-06): (h) verde 5/5 de las tres paginas y cierre del primer toque |

## Deviations from Plan

### Desvío decidido por el dueño

**1. [P-1 — instrumento] `llevo_al_inicio` descuenta el recorte por alto (decisión «A + control» del dueño)**
- **Encontrado en:** task 2, segundo gate (corrida de las tres páginas con el instrumento viejo: 4/5).
- **Qué pasó:** con el arreglo, `N-negocio-borde-movil` ya no tenía NINGUNA escritura de scroll en el primer toque (`next_toque1: no`; el contenedor pasó de `hijos=0` a `hijos=1`), pero `salto_toque1` midió `si`: al mostrar Cobros (sin cuenta de MP en local) el documento bajó de 1389 a 844 px (= viewport) y el navegador recortó `scrollY` de 187 a 0 sin escritura de nadie. El clasificador no distinguía ese recorte de un scroll de Next. El ejecutor anterior paró sin tocar esperados.
- **Arreglo:** `clasificarToque` (función pura): es `recorte_por_alto` —y no salto— sólo si en el toque no hubo ninguna escritura de scroll de la página Y `alto_despues - innerHeight < y_antes`; se imprime aparte como dato informativo. La línea `despues:` ahora trae su `viewport`. Ningún `esperado_tras_el_fix` ni `esperado_si_HA` cambió (el diff de `3c25616` no toca ninguna de esas líneas).
- **Control (anotado en `## (h)` antes de re-medir, `9afe20b`):** `--autotest` 5/5 con los números medidos (RED de Negocio con escritura ⇒ `si`; verde de Negocio sin escritura, alto 1389 → 844, innerHeight 844 ⇒ `no` + `recorte_por_alto: si`; sin escritura y sin recorte, máximo 545 ≥ 187 ⇒ `si`; RED de F-blanda ⇒ `si`; F-directa ⇒ `no`). `--reclasificar` de los logs guardados: RED 11 toques, 0 cambian (los cuatro FALLA siguen FALLA, Negocio 187 → 0 con escritura sigue `si`, F-directa sigue OK ⇒ 1/5 reproducido); verde de Finanzas 0/11; verde de las tres con el instrumento viejo 1/11 (sólo Negocio toque 1). Cero errores del parser en los 33 toques.
- **Archivos:** `.planning/debug/probes/g04-scroll-y-recarga.mjs`, `.planning/debug/tabs-en-la-url-medida.md`.
- **Commits:** `3c25616`, `9afe20b`.

### Auto-fixed Issues

**2. [Rule 1 - Bug] El auto-chequeo de `--reclasificar` sólo entendía logs viejos**
- **Encontrado en:** el control posterior a la corrida final (re-clasificar el log 5/5).
- **Problema:** el chequeo del parser comparaba el criterio crudo recalculado contra el `llevo_al_inicio` impreso; en un log posterior a `3c25616` lo impreso ya es el valor clasificado, y daba un falso `ERROR DEL PARSER` en Negocio toque 1.
- **Arreglo:** si el log trae el `viewport` de después (formato nuevo), compara contra el valor clasificado; si no, contra el crudo. Sólo el modo auxiliar sin navegador; la medición y los esperados no cambian. Re-corrido sobre los cuatro logs: cero errores.
- **Commit:** `834417e`.

## Lo diferido (en `deferred-items.md`, `status: open`)

1. `/clients` tiene el mismo boundary sin nodo desde v0.30, sin medir (decisión del dueño, opción B): no se tocó.
2. IN-02: `router.refresh()` en `/negocio?tab=integraciones` puede llevar la página arriba (mecanismo distinto: un `scrollRef` nuevo por la clave de la página); el fallback con nodo no lo cubre.
3. `html { scroll-behavior: smooth }` sin `data-scroll-behavior`: la FORMA animada del salto, no su causa.

## Notas para el 04-07 / 04-08

- `recorte_por_alto: si` aparece también, informativo, en toques de Finanzas en móvil que bajan 37/55 px: el viewport emulado crece de 844 a 881/899 (la barra emulada) y el máximo de scroll se achica. Ya daban salto `no`; no es un defecto ni un cambio de veredicto.
- `next.config.ts` sin tocar; `validator.ts` no se truncó en esta continuación; turno libre en todas las corridas.
- MOB-08 y MOB-09 NO se marcaron (se marcan en `/gsd-verify-work 4 --ws panel-nav`). STATE/ROADMAP/REQUIREMENTS sin tocar (los lleva el orquestador). Nada subido.

## Known Stubs

Ninguno: el fallback vacío es intencional (cero píxel nuevo, el arreglo es que exista el nodo).

## Self-Check: PASSED

- Archivos: las tres páginas, `test/panel-tabs.test.ts`, la sonda, el registro y `deferred-items.md` existen y están commiteados (`git status` limpio salvo `.claude/settings.json` y `.verification-ledger.json`, sin trackear a propósito).
- Commits: los 11 hashes de la tabla existen en `git log` (`git rev-list --count daedd2f..f361f06` = 11).
- Gates: los tres del task 1 y los tres del task 2 re-corridos en verde; `tsc --noEmit` rc 0.
