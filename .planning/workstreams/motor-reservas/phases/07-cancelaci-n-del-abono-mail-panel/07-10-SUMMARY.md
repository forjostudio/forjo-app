---
phase: 07-cancelaci-n-del-abono-mail-panel
plan: 10
subsystem: dashboard
tags: [abonos, multi-tenant, rsc, postgrest, next16, panel]

# Dependency graph
requires:
  - phase: 07-cancelaci-n-del-abono-mail-panel
    provides: "motor compartido de baja (lib/abono-cancel.ts: selectFutureOccurrences / summarizeOccurrences / todayISOInAR) — Plan 07-01 + 07-06"
provides:
  - "GET /api/abonos/cancel-link/[id]: el link de baja de UNA serie del propio negocio, resuelto on-demand con la sesión del dueño (WR-07)"
  - "Payload de /abonos sin ninguna credencial de baja: el token no viaja al browser en ningún render"
  - "Agregados por serie exactos (count: 'exact') y preview acotado por fecha en la base (WR-06)"
affects: [07-11, 07-12, secure-phase-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Credencial on-demand: un secreto que la UI necesita SOLO ante una acción explícita se pide por endpoint en ese momento, nunca se pre-carga en el payload del listado"
    - "El endpoint devuelve la URL ya armada y no el secreto crudo: el cliente no reconstruye la ruta pública y el token no queda como valor independiente en el estado del browser"
    - "Agregado exacto sin traer filas: select(col, { count: 'exact' }) + order desc + limit(1) da el conteo total y el máximo en un solo viaje"

key-files:
  created:
    - app/api/abonos/cancel-link/[id]/route.ts
  modified:
    - app/(dashboard)/abonos/page.tsx
    - app/(dashboard)/abonos/abonos-client.tsx

key-decisions:
  - "La ruta es cancel-link/[id] y NO [id]/cancel-link: evita un segmento dinámico hermano de los estáticos cancel/ y create/ que ya cuelgan de app/api/abonos/"
  - "Una sola query por serie con count: 'exact' + limit(1) en vez de dos (head:true para contar + otra para el máximo): PostgREST devuelve el count exacto independiente del limit"
  - "El endpoint devuelve { ok, url } y no { ok, token }: el cliente no arma la ruta pública y el secreto no queda suelto en el estado del browser"
  - "Ante fallo del endpoint NO se escribe nada al portapapeles: es preferible que el dueño reintente a que pegue en el WhatsApp de su cliente lo que hubiera copiado antes"

patterns-established:
  - "Todo endpoint del panel resuelve el tenant por owner_id de la sesión y re-lee la entidad por id + business_id; inexistente y ajeno devuelven el MISMO 404 genérico (D-22/D-23)"

requirements-completed: [ABONO-04, ABONO-05]

# Metrics
duration: 20min
completed: 2026-07-21
status: complete
---

# Phase 7 Plan 10: WR-07 + WR-06 sobre la superficie del panel Summary

**La credencial de baja dejó de repartirse en cada render de `/abonos` — ahora sale de un endpoint autenticado, una serie por vez y solo cuando el dueño la pide — y el número que el `ConfirmDialog` muestra antes de una baja irreversible ya no puede subestimar el alcance por un recorte silencioso de PostgREST.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3
- **Files created:** 1
- **Files modified:** 2

## Accomplishments

- **WR-07 cerrado.** El `cancel_token` de **todas** las series del negocio — activas y archivadas — viajaba en el payload RSC de `/abonos` en cada carga, aunque el dueño no abriera un solo detalle: quedaba en el HTML serializado, en la caché del navegador, en el bfcache y en cualquier captura de DOM (session replay, reporte de errores, screenshot de soporte, impersonación). Como el token no rota ni vence (D-09), esa fuga era permanente. Ahora la columna no está en el select, el tipo `AbonoRow` no la declara y el link lo resuelve `GET /api/abonos/cancel-link/[id]` recién al tocar el botón. D-17 (mandar el link por WhatsApp al cliente sin mail) sigue cubierto exactamente igual desde el punto de vista del dueño.
- **WR-06 cerrado en sus dos mitades.** (a) *Preview*: la query de `appointments` que alimenta el `ConfirmDialog` pasó de traer **todos** los turnos de abono de toda la historia del negocio, sin filtro de fecha ni límite, a estar acotada en la base con `.gte('date', cutoff)`. El set futuro tiene techo real (ventana ≤ 52 semanas por el CHECK de la migración 055); el histórico crecía sin techo y el tope de filas de PostgREST podía recortarlo sin avisar. (b) *Agregados históricos*: `turnoCounts` y `lastTurnoDates` (D-09′) ya no se derivan de filas en memoria — salen de una query por serie con `count: 'exact'` + `order desc` + `limit(1)`, que trae el conteo exacto **y** el máximo `date` de un solo viaje y sin traer una fila de más.
- **Endpoint nuevo con el molde de autorización del panel.** Sesión obligatoria (401 sin `auth.getUser()`), negocio por `owner_id` del actor, serie por `id` + `business_id`, RLS owner-only como segunda capa, y el mismo 404 genérico para "no existe" y "es de otro negocio". Devuelve un solo campo (`url`) y no tiene ninguna escritura.
- **Cero cambio de comportamiento** en la UI de baja (D-18/D-19), el filtro Activos/Archivados (D-20), el manejo de `completed` (D-21) ni ninguna vía que reactive una serie `cancelled` (D-04). No se agregó superficie visual: el botón ya existía, solo cambió de dónde saca la URL.

## Task Commits

1. **Task 1 — endpoint autenticado del link de baja** — `bbf783a` (feat)
2. **Task 2 — `page.tsx`: token fuera del payload + queries acotadas y exactas** — `2856984` (fix)
3. **Task 3 — `abonos-client.tsx`: el link se pide al servidor al tocar el botón** — `d17d1e0` (feat)

## Files Created/Modified

- **`app/api/abonos/cancel-link/[id]/route.ts`** (nuevo, 72 líneas) — `GET` con `params` awaiteado (Next 16). Cabecera doctrinal que enuncia para qué existe (D-17), por qué es on-demand y no parte del listado (WR-07 + D-09), por qué la ruta cuelga de un segmento estático propio, y por qué el service role está prohibido acá. Corre con `createClient()` de `@/lib/supabase/server` (anon + RLS).
- **`app/(dashboard)/abonos/page.tsx`** — sale `cancel_token` del select de `abonos` y se reescribe el comentario que lo justificaba; el `cutoff` se calcula **antes** del `Promise.all` (una sola llamada a `todayISOInAR()`) y se usa para acotar la query de `appointments`; `turnoCounts`/`lastTurnoDates` pasan a un `Promise.all` de queries por serie con `count: 'exact'`; `rowsByAbono` queda dedicado al preview. Las cuatro props (`turnoCounts`, `lastTurnoDates`, `futureTurnoCounts`, `lastFutureDates`) mantienen nombre y tipo.
- **`app/(dashboard)/abonos/abonos-client.tsx`** (+35 / −18) — `AbonoRow` pierde el campo del token; `copyCancelLink` hace `fetch` al endpoint, valida `res.ok && data.ok && url` y recién ahí escribe al portapapeles; estado `copyingLink` que deshabilita el botón y cambia el label a "Copiando..." durante el viaje (mismo criterio que `savingWindow`).

## Decisions Made

- **Ruta `cancel-link/[id]` en vez de `[id]/cancel-link`** (el review sugería la segunda). La forma del review introduce un segmento dinámico `[id]` hermano de los estáticos `cancel/` y `create/` bajo `app/api/abonos/`. Next resuelve estático antes que dinámico, así que funcionaría, pero deja una ambigüedad estructural sobre una superficie de API viva a cambio de nada.
- **Una query por serie y no dos** (el review sugería `head: true`). `select('date', { count: 'exact' })` + `order('date', desc)` + `limit(1)` devuelve el `count` exacto de todas las filas que matchean — el `limit` no lo afecta — y la única fila trae el máximo. Dos cosas, un viaje.
- **El endpoint devuelve la URL armada, no el token.** El cliente no tiene por qué reconstruir la ruta pública, y así el secreto no queda como valor independiente en el estado del browser. La base y el fallback (`NEXT_PUBLIC_APP_URL` → `https://gestion.forjo.studio`) son los mismos que usa `app/api/abonos/create` para el link del mail de alta: una sola forma de URL en el repo.
- **Ante un fallo del endpoint no se escribe nada al portapapeles.** Copiar "lo de antes" y que el dueño lo pegue en el WhatsApp de su cliente es peor que un toast de error y un reintento.
- **Se agregó un cuarto `not_found`** en el endpoint: si la fila existe pero la columna del token viniera vacía o no-string, se responde el mismo 404 en vez de devolver una URL rota. El plan pedía ≥ 3; hay 4.

## Deviations from Plan

**Ninguna.** El plan se ejecutó exactamente como estaba escrito. Los comandos `<automated>` se corrieron con los binarios locales (`./node_modules/.bin/tsc`, `./node_modules/.bin/eslint`) en vez de `npx`, siguiendo la instrucción del orquestador de modo secuencial — `npx tsc` resuelve un paquete equivocado del registry que siempre sale 0 (falso verde). Es un cambio de invocación, no de verificación.

## Prohibiciones verificadas

| Prohibición | Verificación |
|---|---|
| El endpoint NO usa service role | `grep -c createAdminClient` = 0; `grep -c "from '@/lib/supabase/server'"` = 1 |
| El endpoint NO devuelve nada más que el link | 2 selects (`businesses.id` + `abonos.cancel_token`), respuesta con un solo campo |
| El endpoint no escribe | `grep -cE "\.update\(\|\.insert\(\|\.delete\(\|\.upsert\("` = 0 |
| No cambia la UI de baja / filtro / `completed` | `ConfirmDialog` = 5 matches, `ABONO_TABS` = 2, diff de `abonos-client.tsx` = 35 add / 18 del (< 60) |
| Ninguna rama reactiva un abono `cancelled` | no se tocó ninguna escritura de estado |
| No se agrega superficie visual nueva | el botón ya existía; solo cambia el origen de la URL y el label durante el fetch |
| No se modifican `07-01..07-05-PLAN.md` | `git diff --name-only` de la tanda = 3 archivos de código |
| Cero dependencias nuevas (T-07-SC) | `package.json` / `package-lock.json` fuera del diff |

## Verification

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | 0 errores |
| `./node_modules/.bin/eslint` sobre los 3 archivos | 0 |
| `npm run build` | ✓ Compiled successfully in 14.2s — `/api/abonos/cancel-link/[id]` registrada como ƒ (dynamic) |
| `./node_modules/.bin/vitest run --no-file-parallelism` | **707 passed / 1 skipped / 0 failed**, 54 archivos (baseline 07-06 = 694 / 53) |
| Criterios de aceptación Task 1 | 8/8 |
| Criterios de aceptación Task 2 | 7/7 (`.from('` = 8 ≤ `business_id` = 7 + 1) |
| Criterios de aceptación Task 3 | 6/6 |

**Pendiente de verificación manual** (paso 4 y 5 del bloque `<verification>` del plan, requieren `npm run dev` + sesión de prueba):

1. Ver el **fuente** de `/abonos` (no el DOM inspeccionado) y confirmar que el token de baja no aparece en el payload RSC.
2. Sin sesión, `GET /api/abonos/cancel-link/<uuid>` → 401. Con sesión y un id de otro negocio → 404.

Los tres gates automáticos que cubren lo mismo desde el código (grep del select, del tipo y de los filtros de tenant) están verdes.

## Deuda anotada

- **Escala del agregado por serie (T-07-49, disposición `accept`).** El render de `/abonos` dispara ahora una query por serie, todas en paralelo. Es más barato que traer todas las filas históricas de turnos del negocio, que es lo que hacía antes, y el número de series por negocio es chico. **Si un negocio llegara a tener cientos de series**, la evolución natural es una **vista agregada** (o una RPC que devuelva `abono_id, count, max(date)` en un solo viaje) en vez de N queries. No se resuelve acá: no hay ningún tenant cerca de ese volumen y una vista nueva es superficie de migración + RLS que esta fase no necesita.

## Threat Flags

Ninguno. Las superficies que este plan toca ya estaban en el `<threat_model>` del plan (T-07-44..T-07-49): el endpoint nuevo es la única superficie de red agregada y su modelo de autorización está enunciado ahí.

## User Setup Required

None — sin migración, sin variable de entorno nueva, sin configuración externa.

## Next Phase Readiness

- **07-11** puede seguir con la unificación de `DAY_LABELS` / `toISODate`: este plan no tocó ninguno de los archivos de esa lista.
- **07-12** debe comparar la suite contra **707 passed / 1 skipped**.
- **secure-phase**: T-07-44..T-07-48 quedan cubiertos por código + criterios verificados; T-07-49 sigue en `accept` con la deuda anotada arriba.
- Sin bloqueantes.

## Self-Check: PASSED

- Archivos verificados en disco: `app/api/abonos/cancel-link/[id]/route.ts`, `app/(dashboard)/abonos/page.tsx`, `app/(dashboard)/abonos/abonos-client.tsx` — los 3 presentes.
- Commits verificados en `git log`: `bbf783a`, `2856984`, `d17d1e0` — los 3 presentes.
- `git diff --diff-filter=D --name-only 90377d7..HEAD` sin resultados: ningún archivo borrado en la tanda.
- `git status --short` limpio tras cada commit; `node_modules`, `package.json` y `package-lock.json` intactos.

---
*Phase: 07-cancelaci-n-del-abono-mail-panel*
*Completed: 2026-07-21*
