---
phase: 04-recuperar-la-cuenta-auth-callback-reset
plan: 02
subsystem: auth-edge-routing
tags: [proxy, edge, middleware, auth, routing, regression-test]
status: complete

requires:
  - "proxy.ts (MAINT_EXEMPT, KNOWN_PREFIXES)"
  - "lib/supabase/middleware.ts (isAuthRoute, isDashboardRoute)"
provides:
  - "lib/auth/route-lists.ts — las 4 listas del Edge como predicados puros e importables"
  - "isMaintExempt / isKnownRoute / isAuthRoute / isDashboardRoute"
  - "/auth exento de mantenimiento (D-21)"
  - "/auth, /forgot-password, /reset-password pasan por updateSession (D-22)"
  - "test/proxy-auth-routes.test.ts — guardia permanente de D-06 / Pitfall 5"
affects:
  - "04-01 (/auth/callback): su ruta ya está exenta de mantenimiento y refresca cookie"
  - "Phase 5 (OAuth): hereda el callback ya ruteado en el Edge"

tech-stack:
  added: []
  patterns:
    - "Módulo lib/ puro (sin Next ni Supabase) para volver asertable la config de ruteo del Edge"
    - "Test puro sin credenciales (H-06), primer test del repo sobre configuración de ruteo"

key-files:
  created:
    - lib/auth/route-lists.ts
    - test/proxy-auth-routes.test.ts
  modified:
    - proxy.ts
    - lib/supabase/middleware.ts

decisions:
  - "Extracción a módulo lib/ puro (PATTERNS opción b) en vez de exportar desde proxy.ts (arrastraría env vars de Supabase al test, prohibido por H-06) o readFileSync (sin precedente en el repo)"
  - "Se extraen los 4 predicados, no solo los 2 de proxy.ts: el valor del test está en asertar qué rutas NO se agregan, y esas dos listas son justo donde el error es invisible"
  - "Se conserva la diferencia de matcheo entre las dos familias de predicados (=== p || startsWith(p+'/') vs startsWith(p) pelado): la extracción es behavior-preserving, no es el momento de unificar semánticas"

metrics:
  duration: ~13 min
  tasks: 3
  files: 4
  tests: 516 passed | 49 skipped (11 nuevos)
  completed: 2026-07-17
---

# Phase 4 Plan 02: Listas de ruteo del Edge + guardia de regresión — Summary

Las 3 rutas nuevas de recuperación entraron **exactamente en las listas del Edge donde van y en ninguna otra**, y esa configuración —hasta hoy inasertable— quedó cubierta por un test puro que falla si alguien vuelve a caer en la trampa.

## Qué se hizo

**Task 1 — `lib/auth/route-lists.ts` (commit `22d83eb`).** Las 4 listas del Edge se extrajeron a un módulo puro (sin imports de Next ni de Supabase, verificado: 0 matches de `next/server|@supabase|@/lib/supabase` fuera de comentarios). Con los dos cambios de la fase: `'/auth'` sumado a `MAINT_EXEMPT` (D-21) y `'/auth'` + `'/forgot-password'` + `'/reset-password'` sumados a `KNOWN_PREFIXES` (D-22). `AUTH_ROUTE_PREFIXES` y `DASHBOARD_ROUTE_PREFIXES` quedaron **intactas a propósito**, cada una con un comentario en mayúsculas que explica qué se rompe al tocarlas.

**Task 2 — recableo (commit `3ecd90a`).** `proxy.ts` y `lib/supabase/middleware.ts` consumen los predicados importados. El `git diff` de `middleware.ts` quedó acotado a imports + las líneas 31-42; los dos bloques de redirect (44-54) están idénticos, como exigía el criterio de aceptación.

**Task 3 — `test/proxy-auth-routes.test.ts` (commit `79c4d69`).** 11 tests en 4 `describe`, uno por lista. Sin red, sin credenciales, sin salteo condicional (H-06: grep de `skipIf|test/env|hasSupabaseCreds` == 0; solo 2 imports).

## Prueba de mutación del guardia (exigida por el plan)

Agregando temporalmente `'/forgot-password'` a `AUTH_ROUTE_PREFIXES`:

```
FAIL test/proxy-auth-routes.test.ts > isAuthRoute — LA lista que no hay que tocar (D-06)
     > NO matchea /forgot-password ni /reset-password
AssertionError: expected true to be false
Tests  1 failed | 10 passed (11)
```

Falla **exactamente la aserción de D-06** y ninguna otra. Revertido el cambio: 11/11 verde y `git diff lib/auth/route-lists.ts` limpio. **El guardia sirve.**

## Verificación

| Check | Resultado |
|-------|-----------|
| `npx vitest run test/proxy-auth-routes.test.ts` | 11 passed |
| `npm test` (suite completa) | 516 passed \| 49 skipped — +11 vs. baseline de 505; los 49 skips son las suites pre-existentes que piden creds de Supabase |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint proxy.ts lib/supabase/middleware.ts lib/auth/route-lists.ts` | exit 0 |
| Módulo puro (grep de imports prohibidos) | 0 |
| Prueba de mutación | falla la aserción correcta y revierte limpio |

## Success criteria

- [x] `/auth` exento de mantenimiento; `/forgot-password` y `/reset-password` **no** lo están (D-21)
- [x] Las 3 rutas nuevas refrescan sesión vía `updateSession` (D-22)
- [x] `isAuthRoute` e `isDashboardRoute` matchean exactamente las mismas rutas que antes, con un test que lo garantiza para siempre (D-06 / Pitfall 5)

## Amenazas del threat model

| Threat ID | Estado | Evidencia |
|-----------|--------|-----------|
| T-04-07 (DoS: link vs. kill switch) | mitigado | `isMaintExempt('/auth/callback') === true` en el test |
| T-04-08 (pérdida de disponibilidad de la cuenta, D-06) | mitigado | `isAuthRoute('/forgot-password') === false`, con prueba de mutación que demuestra que el guardia dispara |
| T-04-09 (fuga de credenciales al booking público) | mitigado | `isKnownRoute('/mi-negocio') === false` asertado explícitamente como load-bearing |
| T-04-10 (sesión stale) | mitigado | las 3 rutas en `KNOWN_PREFIXES` + test |
| T-04-11 (la extracción cambia comportamiento sin querer) | mitigado | diff de `middleware.ts` acotado a imports + 31-42; semánticas de matcheo conservadas tal cual; suite completa verde |

## Deviations from Plan

Ninguna funcional — el plan se ejecutó como estaba escrito.

Un solo ajuste de redacción durante la Task 3: el comentario de cabecera del test mencionaba literalmente las palabras `skipIf` y `test/env.ts` al explicar por qué el test *no* las usa, lo que hacía que el grep del criterio de aceptación devolviera 1 en vez de 0. Se reescribió el comentario para decir lo mismo sin los tokens literales. No cambia comportamiento: el test nunca usó ni `skipIf` ni el helper de entorno.

## Notas para las fases siguientes

- Las 4 listas ahora tienen **un solo lugar** (`lib/auth/route-lists.ts`) y un guardia automático. Cualquier ruta nueva de auth (Phase 5/OAuth) se suma ahí y el test obliga a decidir explícitamente en cuáles listas va y en cuáles no.
- La diferencia de matcheo entre las dos familias de predicados (`=== p || startsWith(p+'/')` vs `startsWith(p)` pelado) quedó **documentada y preservada**, no unificada. Unificarla es un cambio de comportamiento con su propio riesgo — candidata a idea diferida, no se hizo de paso acá.

## Self-Check: PASSED

- FOUND: `lib/auth/route-lists.ts`
- FOUND: `test/proxy-auth-routes.test.ts`
- FOUND: commit `22d83eb`, `3ecd90a`, `79c4d69`
