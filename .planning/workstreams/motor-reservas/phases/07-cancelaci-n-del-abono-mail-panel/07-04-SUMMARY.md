---
phase: 07-cancelaci-n-del-abono-mail-panel
plan: 04
subsystem: api+panel
tags: [abonos, multi-tenant, supabase, next16, email, ux]

# Dependency graph
requires:
  - plan: 07-01
    provides: "lib/abono-cancel.ts — cancelAbonoSeries / selectFutureOccurrences / summarizeOccurrences / todayISOInAR"
  - plan: 07-02
    provides: "lib/email.ts — sendAbonoCancelledEmail"
provides:
  - "POST /api/abonos/cancel — baja de serie autenticada desde el panel (sesión del dueño, anon+RLS)"
  - "AbonoRow.cancel_token / AbonoRow.cancelled_at en el payload del dashboard (D-17/D-25)"
  - "futureTurnoCounts / lastFutureDates — preview de la baja por serie, derivado sin queries nuevas"
  - "UI de /abonos: filtro Activos/Archivados, botón Dar de baja con confirmación, Copiar link de baja"
affects: [verificación de fase, secure-phase (T-07-20..27), UAT del panel de abonos]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route handler de mutación destructiva autenticada: anon+RLS + tenant por owner_id + re-validación de la entidad por id + business_id (molde de app/api/abonos/create)"
    - "Endpoint como cáscara de autorización + mail: todo el efecto de dominio delegado en el motor compartido, cero query propia"
    - "Preview de UI calculado en el server con los MISMOS helpers puros que ejecuta el efecto (imposible que diverjan)"
    - "ConfirmDialog nivel simple (sin type-to-confirm) para acción destructiva rutinaria del negocio"

key-files:
  created:
    - app/api/abonos/cancel/route.ts
  modified:
    - app/(dashboard)/abonos/page.tsx
    - app/(dashboard)/abonos/abonos-client.tsx

key-decisions:
  - "El endpoint no distingue 'no existe' de 'es de otro negocio': los dos devuelven el mismo 404 (D-22/D-23)"
  - "El toast de éxito informa el conteo que devolvió el SERVIDOR, no el del preview: la autoridad del efecto real es el motor de baja"
  - "El detalle se cierra antes de abrir la confirmación (no se anidan modales); el ConfirmDialog ya resuelve el anti doble-submit"
  - "Se agregó cancelled_at al select (no estaba en la letra del plan) porque el detalle de una serie cancelada muestra la fecha de baja"
  - "Fallback del portapapeles: si navigator.clipboard no está (contexto no seguro) el link se muestra en el toast para copiarlo a mano"

requirements-completed: [ABONO-05]

# Metrics
duration: ~55min
completed: 2026-07-21
status: complete
---

# Phase 7 Plan 04: Baja del abono desde el panel Summary

**`POST /api/abonos/cancel` (sesión del dueño, anon+RLS, tenant por `owner_id`) que delega toda la baja en `cancelAbonoSeries`, más la UX de `/abonos`: filtro Activos/Archivados, confirmación con el conteo real de turnos futuros y botón para copiar el link de baja del cliente.**

## Performance

- **Duration:** ~55 min (incluye una interrupción por watchdog de infraestructura, sin pérdida de trabajo)
- **Tasks:** 3
- **Files:** 3 (1 creado, 2 modificados)

## Accomplishments

- **Vía del dueño sin una sola línea de lógica de baja propia (D-07/D-24).** El route handler resuelve autorización + datos del mail y llama al motor compartido. Verificado por grep negativo: `from('appointments')` = 0 en el endpoint. Las dos vías (mail del cliente y panel) corren el mismo código, así que el efecto sobre los turnos es idéntico por construcción.
- **Anti-tampering antes de tocar nada (D-23).** El `abonoId` del body se re-lee acotado por `id + business_id` con `.maybeSingle()`; un abono ajeno y uno inexistente devuelven el mismo 404. Esa misma lectura provee los datos del mail (cliente / servicio / día / hora) sin un segundo viaje a la base.
- **Sin service role en la ruta de baja.** `createAdminClient` = 0 en el archivo; la única lectura con service role es `getBusinessSecrets(businessId)` **dentro del `after()`**, acotada al negocio ya resuelto, igual que en `abonos/create`.
- **Idempotencia respetada en el borde HTTP (D-05).** `alreadyCancelled: true` responde 200 con `cancelledCount: 0` y **no** manda mail. Un solo `sendAbonoCancelledEmail` por baja efectiva (D-14/D-15), en `after()`; cero `sendAbonoCancelledAdminNotification` (D-13: el dueño no se avisa a sí mismo).
- **El preview no puede mentir.** `futureTurnoCounts` / `lastFutureDates` se derivan en `page.tsx` con `selectFutureOccurrences` + `summarizeOccurrences` — los mismos helpers puros que ejecuta la baja — sobre el set de `appointments` que la página **ya** traía. Cero queries nuevas (`git diff -U0` no agrega ninguna línea con `supabase.from(`).
- **La vista principal quedó de series vivas (D-20).** El memo pasó de "todo menos cancelled" a filtro por tab: Activos = `active`; Archivados = `cancelled` + `completed`, con el conteo en cada píldora. Es un **cambio de comportamiento deliberado**: antes los `completed` vivían en la lista principal.
- **Suite completa verde:** 683 passed | 1 skipped (53 archivos), `tsc --noEmit` y `eslint "app/(dashboard)/abonos"` en 0.

## Task Commits

1. **Task 1: POST /api/abonos/cancel** — `c430d86` (feat)
2. **Task 2: page.tsx — cancel_token + preview de turnos futuros** — `633b453` (feat)
3. **Task 3: abonos-client.tsx — filtro, confirmación y copiar link** — `f755570` (feat)

## Files Created/Modified

- `app/api/abonos/cancel/route.ts` (153 líneas, nuevo) — Endpoint autenticado. Cabecera doctrinal en español: baja de la SERIE (no del turno suelto), sesión del dueño y prohibición del service role salvo la excepción acotada del `after()`, motor compartido con la vía del mail (D-07), y la regla de las 24h que **no** aplica (D-06). Respuestas: `{ ok: true, alreadyCancelled, cancelledCount, lastDate }` | `{ ok: false, error: 'unauthorized' | 'bad_request' | 'missing_fields' | 'not_found' | 'cancel_failed' }`.
- `app/(dashboard)/abonos/page.tsx` — `cancel_token` + `cancelled_at` al select con la nota de D-25 (por qué el token puede salir por acá y por ninguna otra superficie); agrupación de `apptRows` por serie y derivación de `futureTurnoCounts` / `lastFutureDates` con un corte `todayISOInAR()` calculado una sola vez para toda la página.
- `app/(dashboard)/abonos/abonos-client.tsx` — `cancel_token` / `cancelled_at` en `AbonoRow`; props nuevas; `ABONO_TABS` + estado del filtro + píldoras con `cn(...)` (molde de `clients-client.tsx`); estado vacío propio para Archivados; `copyCancelLink` con fallback; `confirmCancel` contra el endpoint; bloque de acciones al final del detalle separado por borde superior; `ConfirmDialog` `risk="alto"` + `destructive` sin palabra a tipear.

## Decisions Made

| Decisión | Por qué |
|---|---|
| `cancelled_at` agregado al select (no estaba en la letra del plan) | La Task 3 pide mostrar la fecha de baja en el detalle de una serie ya cancelada. Sin la columna en el payload no había forma de renderizarla. Es una columna no secreta de la misma fila, en la misma query ya acotada por `business_id`. |
| `not_found` del motor → 404 (no 500) | El motor puede devolver `not_found` por una carrera entre la re-lectura y el update. Es la misma respuesta genérica que ya dio la re-validación: no se revela nada nuevo. |
| Toast de éxito con el conteo del servidor | Entre la carga de la página y la confirmación pudo cambiar algo; el preview es orientativo y el efecto real lo dicta el motor. |
| Fallback del portapapeles vía `toast.error(..., { description: url })` | El repo no tiene ningún uso previo de la Clipboard API (07-PATTERNS §"No Analog Found"). Mostrar el link en la descripción del toast es accionable (se puede seleccionar) y no rompe la vista en contextos no seguros. |
| `aria-pressed` en las píldoras del filtro | El molde de `clients-client.tsx` no lo trae; se agregó porque son botones con estado seleccionado. No cambia el patrón visual. |

## Deviations from Plan

### Auto-fixed / ajustes menores

**1. [Rule 3 - Bloqueante] `cancelled_at` agregado al select de `page.tsx`**
- **Encontrado en:** Task 3 (lo pide el copy de la serie cancelada), resuelto en el archivo de la Task 2.
- **Fix:** `cancelled_at` sumado al `.select(...)` de `abonos` y al tipo `AbonoRow`.
- **Commits:** `633b453` / `f755570`.

**2. Redacción de comentarios ajustada para no romper greps de aceptación**
- Dos comentarios contenían literalmente los patrones que los criterios verifican en negativo/exacto (`cancelAbonoSeries (` y `confirmWord`). Se reformularon sin cambiar el sentido. Los criterios ahora dan 1 y 0 respectivamente.

**3. Orden de verificación de las Tasks 2 y 3**
- `page.tsx` (Task 2) pasa props que `abonos-client.tsx` (Task 3) recién declara, así que la Task 2 **aislada** no typecheckea. Se implementaron las dos, se corrió `tsc` sobre el estado combinado (exit 0) y recién ahí se commitearon por separado, en el orden del plan. Es una dependencia intrínseca del plan, no una desviación de diseño.

### Nota sobre un criterio de aceptación (falso positivo, sin acción)

`grep -cE "status:\s*'active'" abonos-client.tsx` da **1**, no 0. El match es la línea **preexistente** del tipo `AbonoRow`: `status: 'active' | 'cancelled' | 'completed'` — una declaración de tipo, no una escritura. **No hay ninguna rama que reactive un abono** (D-04): el único `fetch` mutante del archivo es el POST a `/api/abonos/cancel`, y `from('abonos')` / `from('appointments')` = 0 en el cliente. El criterio es un proxy que matchea una línea que este plan no introdujo ni tocó.

## Issues Encountered

- **El worktree no trae `node_modules` ni los `.env*`** (gitignored). Se resolvió igual que 07-01/07-03: **junction de Windows** `node_modules` → `C:\Users\franc\Desktop\Forjo Studio\forjo-app\node_modules` (creada con `New-Item -ItemType Junction`; `mklink /J` vía git bash genera una ruta rota por la traducción de paths) + copia de `.env.local`, `.env.development.local` y `.env.test.local`. **Todos son artefactos ignorados por git — `git status --porcelain` quedó limpio — pero el orquestador puede borrar la junction antes de remover el worktree.**
- **Interrupción por watchdog de infraestructura** (600 s sin progreso) durante la Task 3. No hubo pérdida: el commit de la Task 1 ya estaba hecho y los dos archivos modificados seguían en el working tree. Se retomó desde el punto exacto.
- **Sin flakiness de la suite esta vez:** corriendo `--no-file-parallelism` los 3 tests de Phase 6 que 07-01 reportó como intermitentes pasaron (683/683). Confirma el diagnóstico de contención sobre el Supabase local, no de regresión.

## User Setup Required

None — esta fase no agrega migración ni variables de entorno nuevas. Las columnas `abonos.cancel_token` y `abonos.cancelled_at` existen desde la migr. 054.

## Cobertura del threat model

| Threat | Estado |
|---|---|
| T-07-20 (spoofing del endpoint) | Mitigado: `createClient()` anon+RLS + `auth.getUser()` → 401; `createAdminClient` = 0 en la ruta. |
| T-07-21 (tampering del `abonoId`) | Mitigado: re-lectura por `id + business_id` con `.maybeSingle()` antes de tocar nada; 404 indistinguible. |
| T-07-22 (cancelación masiva desde el panel) | Mitigado: `from('appointments')` = 0 en el endpoint; todo pasa por el motor compartido (doble scoping probado en 07-01). |
| T-07-23 (`cancel_token` en el payload) | Mitigado: el token sólo se selecciona en `app/(dashboard)/abonos/page.tsx` (negocio por `owner_id`, queries por `business_id`, RLS owner-only). No se agregó a ninguna vista pública ni endpoint anónimo. |
| T-07-24 (portapapeles) | Aceptado por diseño (D-17): el owner copia deliberadamente el link de su propia serie; mismo secreto que ya viaja en el mail de alta. |
| T-07-25 (baja destructiva por error) | Mitigado: `ConfirmDialog` `risk="alto"` + `destructive` con el conteo real y la fecha del último turno; la autorización real es server-side. |
| T-07-26 (reactivación) | Mitigado: ningún botón, endpoint ni rama escribe estado activo sobre un abono (ver la nota del falso positivo del grep). |
| T-07-27 (avalancha de mails) | Mitigado: un solo `sendAbonoCancelledEmail` por baja efectiva; la rama idempotente no manda mail. |
| T-07-SC (supply chain) | N/A: el plan no instaló ningún paquete. |

## Threat Flags

Ninguna superficie nueva fuera del `<threat_model>` del plan.

## Next Phase Readiness

- **ABONO-05 cubierto end-to-end**: criterios 2 y 4 del ROADMAP §Phase 7 (baja desde el panel + consistencia mail↔panel garantizada por el motor compartido).
- **Pendiente de UAT visual** (no automatizable acá): flujo del detalle → confirmación → refresh a Archivados en desktop y mobile, y llegada real del mail de baja al cliente (Resend no está configurado en local — mismo pendiente que arrastra v0.22).
- **Sin blockers.**

## Self-Check: PASSED

- `app/api/abonos/cancel/route.ts` — FOUND
- `app/(dashboard)/abonos/page.tsx` — FOUND
- `app/(dashboard)/abonos/abonos-client.tsx` — FOUND
- Commit `c430d86` — FOUND
- Commit `633b453` — FOUND
- Commit `f755570` — FOUND
- `npx tsc --noEmit` — exit 0
- `npx eslint "app/(dashboard)/abonos"` — exit 0
- `npx vitest run --no-file-parallelism` — 53 files / 683 passed | 1 skipped
- `git status --porcelain app/cancelar app/api/cancel supabase/migrations app/abono app/api/abonos/create "app/api/abonos/cancel/[token]"` — vacío (D-10 y los archivos de 07-03 intactos)
- `git diff --name-only 69cea6c HEAD` — exactamente los 3 archivos del plan
- Greps Task 1: POST 1 / createAdminClient 0 / eq-business 1 / motor 1 / appointments 0 / mail-cliente 1 / mail-dueño 0
- Greps Task 2: cancel_token 2 / selectFutureOccurrences 3 / summarizeOccurrences 3 / lastTurnoDates 3 / eq-business 6 / queries nuevas 0
- Greps Task 3: cancel_token 3 / ConfirmDialog 1 / confirmWord 0 / endpoint 1 / escrituras directas 0 / archivados 6

---
*Phase: 07-cancelaci-n-del-abono-mail-panel*
*Completed: 2026-07-21*
