---
phase: 07-cancelaci-n-del-abono-mail-panel
plan: 03
subsystem: api
tags: [next16, supabase, service-role, multi-tenant, abonos, email, superficie-publica]

# Dependency graph
requires:
  - phase: 07-cancelaci-n-del-abono-mail-panel
    provides: "lib/abono-cancel.ts (cancelAbonoSeries + previewAbonoCancellation, Plan 01) y los dos templates de mail de baja de lib/email.ts (Plan 02)"
  - phase: 06-modelo-del-abono-alta-manual-generaci-n-forward
    provides: "abonos.cancel_token / status / cancelled_at (migr. 054), sendAbonoConfirmation con el hueco cancelUrl"
provides:
  - "POST /api/abonos/cancel/[token] — baja pública de la serie completa resuelta por cancel_token"
  - "app/abono/cancelar/[token]/ — página pública con branding del tenant y aviso previo (conteo + último turno)"
  - "cancelUrl del mail de alta apuntando a la ruta nueva (D-16 cerrado)"
affects: [ABONO-04, criterio 1 del ROADMAP §Phase 7, mail de alta del abono]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Superficie pública anónima: el token es la ÚNICA autorización y de la fila que resuelve sale el tenant; ningún dato de la request participa del aislamiento"
    - "Ruta NUEVA en vez de branching sobre un flujo vivo en producción (D-10): el cancel de turno suelto queda literalmente sin abrir"
    - "Preview y efecto salen del MISMO motor (previewAbonoCancellation / cancelAbonoSeries): el número que ve el cliente no puede divergir del resultado"
    - "Mails con await (no after()) en la vía pública: en serverless el fetch a Resend se corta al hacer return"

key-files:
  created:
    - app/api/abonos/cancel/[token]/route.ts
    - app/abono/cancelar/[token]/page.tsx
    - app/abono/cancelar/[token]/abono-cancel-client.tsx
  modified:
    - app/api/abonos/create/route.ts

key-decisions:
  - "El handler no ejecuta NINGUNA query sobre appointments: toda la baja se delega en cancelAbonoSeries (grep = 0), así el doble scoping abono_id + business_id vive en un solo lugar auditado"
  - "El 404 genérico cubre las tres formas de fallo (token inexistente, uuid mal formado que rompe el casteo en Postgres, serie de otro tenant): se usa maybeSingle() y se ignora el error, sólo se mira data"
  - "Doble corte de idempotencia: el gate barato por status ANTES de llamar al motor (evita el UPDATE en el caso común) y la rama alreadyCancelled del motor DESPUÉS (cubre la carrera). Ninguno de los dos manda mails"
  - "El preview se saltea cuando la serie ya está cancelada: no hay nada que contar y evita una query inútil en la pantalla informativa"
  - "Sin cancel_token el alta manda cancelUrl: undefined en vez de una URL rota — el template ya degrada sin botón"

patterns-established:
  - "Página pública tenant-branded de acción destructiva: page.tsx server (resuelve + calcula el preview) + *-client.tsx (máquina de estados) + PaletteScript con palette/theme/font"
  - "Máquina de estados recortada por decisión de dominio: 'active' | 'cancelled' | 'done', sin los estados temporales del cancel de turno suelto"

requirements-completed: [ABONO-04]

# Metrics
duration: ~35min
completed: 2026-07-21
status: complete
---

# Phase 7 Plan 03: Vía del cliente — link del mail y página pública de baja Summary

**La serie completa se da de baja desde el mail: ruta nueva `/abono/cancelar/[token]` + `POST /api/abonos/cancel/[token]`, con el token como única autorización, aviso previo calculado por el mismo motor que ejecuta la baja, y cero bytes tocados del cancel de turno suelto vivo en producción.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-21
- **Tasks:** 3
- **Files modified:** 4 (3 creados + 1 modificado)

## Accomplishments

- **El criterio 1 del ROADMAP §Phase 7 queda cerrado de punta a punta.** El mail de alta lleva el link (D-16), el link abre una página con el branding del negocio, y confirmar da de baja la SERIE entera — no un turno suelto.
- **La ruta nueva no toca nada vivo (D-10, T-07-16).** `app/cancelar/[token]/` y `app/api/cancel/[token]/route.ts` no se abrieron ni para editar: `git status --porcelain` sobre ambos directorios queda vacío en los tres commits. Tampoco se agregó ningún prefijo a `lib/auth/route-lists.ts` ni se tocó `proxy.ts` (T-07-17): la ruta hereda exactamente el mismo tratamiento de Edge que `/cancelar/[token]`.
- **Cero lógica de baja duplicada (D-07/D-24).** El handler no ejecuta ninguna query sobre `appointments` — verificado por grep, da 0. Todo el efecto sale de `cancelAbonoSeries`, con el `businessId` tomado SIEMPRE de la fila que resolvió el token.
- **Aviso previo real, no decorativo (D-03/D-11).** El conteo y la fecha del último turno los calcula `previewAbonoCancellation` server-side, el mismo módulo que después ejecuta la baja: el número que ve el cliente antes de apretar y el efecto que se aplica no pueden divergir.
- **Suite completa verde:** `npx vitest run --no-file-parallelism` → 53 archivos / 683 passed | 1 skipped, sin regresiones. Los 3 fallos intermitentes que el Plan 01 dejó registrados en `deferred-items.md` **no aparecen corriendo en serie**, lo que confirma que eran contención sobre el Supabase local y no un problema de código.

## Task Commits

1. **Task 1: POST /api/abonos/cancel/[token] — baja pública por token** — `9ec9cb9` (feat)
2. **Task 2: página pública /abono/cancelar/[token] — preview + confirmación** — `3e344bf` (feat)
3. **Task 3: D-16 — cancelUrl del mail de alta** — `3925b3f` (feat)

## Files Created/Modified

- `app/api/abonos/cancel/[token]/route.ts` (169 líneas, NUEVO) — Endpoint público. Cabecera doctrinal en español (autorización por token, por qué la regla de 24 h no rige, por qué un solo mail, por qué es ruta nueva, por qué el token no se rota, por qué no hay gcal). Secuencia: `await params` → 400 sin token → resolución por `cancel_token` con service role y join de branding + cliente + servicio → 404 genérico → gate `cancelled` → `cancelAbonoSeries` → mails con `await` → `{ ok: true, cancelledCount, lastDate }`.
- `app/abono/cancelar/[token]/page.tsx` (109 líneas, NUEVO) — Server Component. Resuelve la serie por token (trae siempre `theme/palette/font` para `PaletteScript`), pantalla genérica de link inválido, `initialState` de dos valores, `dayLabel` derivado de `day_of_week`, preview server-side y render con el accent del negocio.
- `app/abono/cancelar/[token]/abono-cancel-client.tsx` (160 líneas, NUEVO) — `'use client'`. `fmtDate` local con `DAYS`/`MONTHS` (sin date-fns en la superficie pública), máquina `active | cancelled | done`, `fetch` POST al endpoint con mapeo por `reason`, bloque de detalle D-11 y las tres vistas. Clases y estilos inline copiados literalmente del analog.
- `app/api/abonos/create/route.ts` (+11 líneas) — Sólo el bloque del mail: `cancelToken` capturado en un const junto a `abonoId` antes del `after()`, base de URL con fallback y sin barra final duplicada, `cancelUrl` pasado a `sendAbonoConfirmation`.

## Decisions Made

Todas dentro de la letra del plan y de la Claude's Discretion del CONTEXT:

- **Doble corte de idempotencia, no uno.** El plan pide el gate por `status === 'cancelled'` en el paso (4) y el manejo de `alreadyCancelled` en el (6). Se implementaron los dos y **cumplen roles distintos**: el gate barato evita el `UPDATE` en el caso común (el cliente que vuelve a abrir el mail), y la rama del motor cubre la carrera real entre dos requests simultáneas. Los dos devuelven el mismo `{ ok: false, reason: 'already_cancelled' }` y ninguno manda mails.
- **`maybeSingle()` en vez del `single()` del analog.** Con `single()` una fila ausente devuelve error y además el uuid mal formado revienta el casteo; `maybeSingle()` deja `data` nula en los dos casos y hace que ambos caigan en el MISMO 404 sin ramas extra. Es lo que pedía explícitamente el paso (2) del plan.
- **El preview no se calcula si la serie ya está cancelada.** No hay nada que contar y la pantalla informativa no muestra números: se pasa `{ count: 0, lastDate: null }` sin ir a la base.
- **`dayLabel` se degrada a `''` si `day_of_week` cayera fuera de 0..6** (imposible por el CHECK de la migr. 054, pero el índice está guardado). Se descartó el fallback `'los días'`: "todos los días" sería una frase *falsa* en un mail, y una fila de detalle ausente es preferible a una mentira.
- **La línea del conteo cambia de tiempo verbal según la vista:** "N turnos futuros" antes de confirmar, "N turnos que tenías reservados" después. El bloque de detalle es el mismo componente en las tres vistas y el copy en pasado evita que la pantalla de éxito parezca seguir ofreciendo la acción.
- **El `service` puede llegar vacío y la fila simplemente no se renderiza** (mismo contrato que aceptan los templates del Plan 02).

## Deviations from Plan

None — el plan se ejecutó tal cual está escrito.

Un único ajuste de redacción, sin impacto funcional (mismo caso que ya resolvió el Plan 01): el comentario que documenta la máquina de estados del client contenía el literal `'too_late'` al enumerar los estados que NO existen, lo que hacía que el grep negativo del acceptance criterion diera 1. Se reformuló a "no existe ni el estado de turno pasado ni el de plazo vencido", manteniendo la explicación intacta. El criterio ahora da 0.

**Nota de hook (no es una desviación):** el hook `impeccable` marca `side-tab` sobre el bloque de detalle con `border-l-4` del client component. Se deja **sin cambiar**: es una copia literal de `app/cancelar/[token]/cancel-client.tsx:85`, vivo en producción, y el plan exige explícitamente "mantener las clases y los estilos inline del analog tal cual para que el branding por tenant se vea idéntico al cancel de turno". No se agregó ninguna supresión inline — esa decisión es del usuario. Es la misma llamada que hizo el Plan 02 sobre los templates de mail.

## Issues Encountered

- **El worktree no trae `node_modules` ni los `.env*`** (gitignored). Se creó una junction de `node_modules` al repo principal (vía PowerShell — `mklink` desde Git Bash mangleaba el target con un backslash de más) y se copiaron `.env.local` + `.env.test.local` para poder correr `tsc`, `eslint` y la suite. Los tres son artefactos ignorados por git: `git status` quedó limpio.
- **Los 3 fallos intermitentes registrados por el Plan 01 no se reprodujeron.** Corriendo con `--no-file-parallelism` la suite entera pasa (683/683). Refuerza el diagnóstico de contención sobre el Supabase local; no se tocó nada al respecto (SCOPE BOUNDARY).

## User Setup Required

Ninguno. Sin migración nueva (`git status --porcelain supabase/migrations` vacío) y sin variables de entorno nuevas: `NEXT_PUBLIC_APP_URL` ya se usa en todo el módulo de mails y tiene fallback a `https://gestion.forjo.studio`.

## Cobertura del threat model

| Threat | Estado |
|---|---|
| T-07-12 (spoofing del token) | Mitigado: la comparación la hace Postgres con `.eq('cancel_token', token)` sobre la columna uuid; no hay ningún `===` en JS contra el secreto, así que no existe canal de temporización. |
| T-07-13 (enumeración) | Mitigado: `maybeSingle()` + `if (!abono)` hacen que token inexistente, uuid mal formado y serie ajena devuelvan el MISMO `{ ok:false, reason:'not_found' }` 404; la página muestra la misma pantalla genérica. |
| T-07-14 (cross-tenant) | Mitigado: el `businessId` que recibe el motor sale de `abono.business_id` de la fila resuelta por el token; el handler no acepta ningún identificador por request y no ejecuta ninguna query sobre `appointments` (grep = 0). |
| T-07-15 (re-POST como amplificador de mails) | Mitigado: gate por `status` + rama `alreadyCancelled` del motor; ninguna de las dos ramas llega al bloque de mails. |
| T-07-16 (tampering sobre el cancel de turno vivo) | Mitigado y verificado: `git status --porcelain app/cancelar app/api/cancel` vacío. |
| T-07-17 (listas de ruteo del Edge) | Mitigado y verificado: `git status --porcelain lib/auth/route-lists.ts proxy.ts` vacío. |
| T-07-18 (contenido de la página) | Mitigado: se renderizan nombre del cliente, servicio, día/hora y el resumen numérico de la propia serie. Ni `business_id`, ni `abono_id`, ni datos de otros clientes cruzan al browser. |
| T-07-19 (baja sin rastro) | Mitigado: `sendAbonoCancelledAdminNotification` a `businesses.notification_email` y la serie queda `cancelled` con `cancelled_at` (lo escribe el motor). |
| T-07-SC (supply chain) | N/A: este plan no instaló ningún paquete. |

## Threat Flags

Ninguna. Las dos superficies nuevas (endpoint público + página pública) ya estaban en el `<threat_model>` del plan; no se introdujo ningún endpoint, path de auth, acceso a archivos ni cambio de esquema fuera de él.

## Next Phase Readiness

- **Plan 04 (vía panel) no depende de nada de acá** y corre en paralelo: sus archivos (`app/api/abonos/cancel/route.ts`, `app/(dashboard)/abonos/*`) no fueron tocados por este plan.
- **Para el UAT:** el flujo end-to-end del cliente requiere un abono con `client_email` cargado. La URL de baja es `${NEXT_PUBLIC_APP_URL}/abono/cancelar/<abonos.cancel_token>`; el token se puede sacar a mano de la fila para probar sin esperar el mail.
- **Sin blockers.**

## Self-Check: PASSED

- `app/api/abonos/cancel/[token]/route.ts` — FOUND
- `app/abono/cancelar/[token]/page.tsx` — FOUND
- `app/abono/cancelar/[token]/abono-cancel-client.tsx` — FOUND
- Commit `9ec9cb9` — FOUND
- Commit `3e344bf` — FOUND
- Commit `3925b3f` — FOUND
- `npx tsc --noEmit` — exit 0
- `npx eslint "app/abono/cancelar/[token]"` y `npx eslint "app/api/abonos/cancel/[token]"` — exit 0
- `npx vitest run test/abono-create.test.ts` — 13/13 passed
- `npx vitest run --no-file-parallelism` — 53 files / 683 passed | 1 skipped
- `git status --porcelain app/cancelar app/api/cancel lib/auth/route-lists.ts proxy.ts supabase/migrations` — vacío
- `git status --porcelain app/(dashboard)/abonos STATE.md ROADMAP.md` — vacío (sin invadir el Plan 04 ni los artefactos del orquestador)
- Greps Task 1 — POST 1 / cancelAbonoSeries 1 / `from('appointments')` 0 / sendAbonoCancelledEmail 1 / sendAbonoCancelledAdminNotification 1
- Greps Task 2 — PaletteScript 1 / previewAbonoCancellation 1 / `/api/abonos/cancel/` 1 / `too_late` 0
- Greps Task 3 — `abono/cancelar` 2 / `cancelUrl` 3; diff acotado a los hunks 266 y 290 (ambos dentro del bloque del mail, muy por debajo de `generateAbonoOccurrences`)
- Deleciones de archivos en los 3 commits — ninguna

---
*Phase: 07-cancelaci-n-del-abono-mail-panel*
*Completed: 2026-07-21*
