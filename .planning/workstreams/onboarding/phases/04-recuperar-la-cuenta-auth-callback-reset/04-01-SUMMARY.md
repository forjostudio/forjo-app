---
phase: 04-recuperar-la-cuenta-auth-callback-reset
plan: 01
subsystem: auth
tags: [supabase, gotrue, verifyOtp, next16, route-handler, vitest, open-redirect]

# Dependency graph
requires:
  - phase: none
    provides: "Wave 1 — no depende de otros planes de la fase (depends_on: [])"
provides:
  - "Ruta /auth/callback: canje de token_hash → sesión en cookies, para recovery y signup"
  - "lib/auth/callback.ts: parseCallbackParams + resolveDestination + INVALID_LINK_DEST (puros)"
  - "Allowlist cerrada de `type` y tabla de destinos en un solo lugar importable"
  - "Punto de extensión aislado (paso 2 del handler) para el `oauth` de Phase 5"
affects: [04-02, 04-03, 04-04, 04-05, 04-06, phase-5-oauth, phase-6-mails]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Módulo puro en lib/ + route handler fino: la lógica testeable sin red, el canje en el handler"
    - "Retorno discriminado { ok: true, ... } | { ok: false } para helpers de validación"
    - "Tabla de destinos server-side en vez de parámetro de retorno (anti open redirect)"

key-files:
  created:
    - lib/auth/callback.ts
    - lib/auth/callback.test.ts
    - app/auth/callback/route.ts
  modified: []

key-decisions:
  - "token_hash + verifyOtp en vez de code + exchangeCodeForSession: @supabase/ssr fuerza PKCE y el webview in-app de Gmail no tiene el code_verifier (H-03)"
  - "303 explícito en los redirects: el default 307 preserva el método y acá el navegador debe hacer GET (verificado en los docs de Next 16)"
  - "La fase no acepta parámetro de retorno (`next`/`redirect_to`): la defensa contra open redirect es no tener superficie, no sanitizar (T-04-01)"
  - "ALLOWED_TYPES se valida en runtime porque EmailOtpType incluye (string & {}): el tipo no filtra nada"
  - "Los comentarios no pueden nombrar literalmente los tokens que los grep gates prohíben, aunque sean prosa explicativa"

patterns-established:
  - "Pattern 1: allowlist + tabla de destinos puras en lib/, consumidas por el route handler y por los tests"
  - "Pattern 2: closure fail() con un único destino de error para todos los caminos de fallo (D-18)"
  - "Pattern 3: logging de auth con solo error.message, nunca request.url ni el token (T-04-02)"

requirements-completed: [AUTH-02, AUTH-06]

# Metrics
duration: 8min
completed: 2026-07-17
status: complete
---

# Phase 4 Plan 01: `/auth/callback` + módulo puro Summary

**Ruta `/auth/callback` que canjea el `token_hash` del mail por sesión vía `verifyOtp` y rutea `recovery` → `/reset-password` y `signup` → `/onboarding`, con la validación y la tabla de destinos aisladas en un módulo puro cubierto por 8 tests sin red ni credenciales.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-17T00:55:00Z
- **Completed:** 2026-07-17T01:03:00Z
- **Tasks:** 3
- **Files modified:** 3 (todos nuevos)

## Accomplishments

- **`/auth/callback` existe y estrena los dos flujos de mail de la fase** (`recovery` y `signup`). El paso 2 (canje) quedó aislado y comentado como único punto de extensión: la Phase 5 suma la rama `code` → `exchangeCodeForSession` sin tocar los pasos 1, 3 ni 4 (D-13).
- **La superficie de open redirect no existe** (T-04-01): no hay parámetro de retorno; el destino se deriva server-side de `DESTINATIONS` por `type` y cae en `INVALID_LINK_DEST` ante cualquier input desconocido. Cubierto por test con los 3 bypasses clásicos de `startsWith('/')` + `javascript:`.
- **El token nunca se filtra** (T-04-02): la respuesta es un 303 a URL limpia, con `Referrer-Policy: no-referrer`, y el logging es solo `error.message`. El callback nunca renderiza HTML.
- **8 tests puros verdes en 262ms sin credenciales** (H-06), verificado corriendo con las env vars de Supabase vaciadas. Suite completa: 513 passed / 49 skipped, sin regresiones.

## Task Commits

1. **Task 1 (RED): test que falla para el parse del callback** — `8a3ab5f` (test)
2. **Task 1 (GREEN): módulo puro `lib/auth/callback.ts`** — `ba83092` (feat)
3. **Task 2: reformular la regla H-06 sin los tokens del gate** — `b7e4e6a` (test)
4. **Task 3: route handler `app/auth/callback/route.ts`** — `83398bd` (feat)

_Task 1 era `tdd="true"` y su `<behavior>` se cubre con el mismo archivo que entrega la Task 2 (`lib/auth/callback.test.ts`). Para respetar la secuencia de gates RED → GREEN sin duplicar el archivo, el test se escribió primero (RED, falla porque el módulo no existe), después el módulo (GREEN), y la Task 2 quedó como la verificación de sus criterios propios + el ajuste del comentario. Gate compliance: `test(8a3ab5f)` → `feat(ba83092)`._

## Files Created/Modified

- `lib/auth/callback.ts` — Módulo puro: `parseCallbackParams` (valida `token_hash` + allowlist de `type` en runtime), `resolveDestination` (tabla de destinos, nunca refleja input), `INVALID_LINK_DEST`, tipo `ParsedCallback`. Sin Supabase, sin `next/headers`, sin red; el único import es type-only.
- `lib/auth/callback.test.ts` — 8 tests puros: allowlist (`oauth`/`magiclink`/`email_change`/`invite`/`../../etc` rechazados), `token_hash` ausente/vacío, `type` ausente, mapeo de destinos, y anti open redirect.
- `app/auth/callback/route.ts` — `GET` en 4 pasos (parse → canjear → resolver destino → redirect + scrub), con closure `fail()`, cliente anon + cookies, 303 y `Referrer-Policy: no-referrer`.

## Decisions Made

- **`token_hash` + `verifyOtp`, no PKCE** (Claude's Discretion del CONTEXT, resuelto por el RESEARCH H-03): `@supabase/ssr` fuerza `flowType: 'pkce'` y `exchangeCodeForSession` exige el `code_verifier` del navegador que inició el flujo — que en un webview in-app de Gmail no existe. `verifyOtp` no depende del navegador de origen.
- **`303` explícito, verificado contra los docs locales de Next 16** en vez de asumirlo (AGENTS.md): `redirect.md:212-214` confirma que 307 preserva el método. Acá el navegador debe hacer GET del destino.
- **`ALLOWED_TYPES` es un `Set` de runtime, no un tipo**: `EmailOtpType` incluye `(string & {})`, así que TypeScript acepta cualquier string. La validación tiene que existir en runtime o no existe.
- **`app/auth/callback/` fuera de todo route group**: `(auth)` no aporta URL y el callback necesita el path literal (H-04).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Los comentarios explicativos rompían dos grep gates de acceptance criteria**

- **Found during:** Task 2 (`lib/auth/callback.test.ts`) y Task 3 (`app/auth/callback/route.ts`)
- **Issue:** El plan pide comentar *por qué* está prohibido usar `skipIf`/`test/env`/`hasSupabaseCreds` (H-06) y por qué está prohibido el service role (T-04-04). Al escribir esas explicaciones, los tokens prohibidos quedaron en el archivo como **prosa** — y los criterios de aceptación son greps mecánicos (`grep -c "skipIf\|test/env\|hasSupabaseCreds" == 0` y `grep -c "supabase/admin" == 0`) que no distinguen prosa de uso. Los dos daban 1 en vez de 0. El plan tiene un `planner-discipline-allow: supabase/admin`, pero eso exime al PLAN, no al código: un verificador que re-corra el grep sobre el archivo lo marca igual.
- **Fix:** Reformular ambos comentarios para preservar la regla y el contra-ejemplo sin los literales ("skipear condicionalmente el describe según haya credenciales" / "el cliente de service role"). Ninguna lógica cambió.
- **Files modified:** `lib/auth/callback.test.ts`, `app/auth/callback/route.ts`
- **Verification:** Los dos greps dan 0; `npx vitest run lib/auth/callback.test.ts` 8/8; `npx tsc --noEmit` y `npx eslint` exit 0.
- **Committed in:** `b7e4e6a` (test file) y `83398bd` (route handler, corregido antes del commit)

---

**Total deviations:** 1 auto-fixed (1 bug de criterio de aceptación)
**Impact on plan:** Sin scope creep. La intención del plan (documentar la prohibición en el código) se conserva intacta; solo cambió la redacción para que la verificación mecánica sea limpia. Vale como señal para el planner: **los acceptance criteria basados en grep chocan con los comentarios que el mismo plan pide escribir.**

## Issues Encountered

- **`node_modules` no existe en el worktree.** `find node_modules/next/dist/docs` falló al principio. No es un problema: la resolución de módulos de Node sube hasta `forjo-app/node_modules`, que es por qué `tsc`/`vitest`/`eslint` corren bien. Los docs de Next 16 se leyeron desde el repo principal (read-only). Vale anotarlo para futuros agentes en worktree que quieran leer `node_modules/` con path relativo.

## User Setup Required

None en este plan. **Pero la fase sí tiene un checkpoint humano pendiente en `04-06`**: la allowlist de Redirect URLs + Site URL en el Dashboard de Supabase (D-20) y el `href` de los 2 templates de mail con `{{ .TokenHash }}` (H-02). Sin eso, `/auth/callback` no recibe los parámetros que espera y el parse falla — que es exactamente el caso que el `console.error` del paso 1 loguea distinto del paso 2, para que el diagnóstico sea obvio.

## Next Phase Readiness

- **Listo para los planes 04-02..04-05:** `INVALID_LINK_DEST` es el destino de error que `/forgot-password` tiene que saber leer (`?error=invalid_link`, D-18), y `/reset-password` ya tiene quien le deje la sesión en cookies antes de que se cargue (D-03).
- **Listo para Phase 5:** el paso 2 del handler es el único punto de extensión y está comentado como tal. La allowlist tiene `'oauth'` marcado en dos lugares (`ALLOWED_TYPES` y la fila comentada de `DESTINATIONS`), y el test lo asierta como rechazado hoy — o sea que el día que Phase 5 lo sume, el test rojo es el recordatorio de que la allowlist cambia a propósito.
- **No verificado acá (por diseño):** el flujo end-to-end contra GoTrue real. Requiere el template del mail (H-02) y el entorno local levantado — se cubre en el UAT del plan `04-06`.
- **`/gsd:secure-phase` sigue siendo obligatorio** para esta fase. T-04-06 (los logs de acceso de Vercel guardan el path con el `token_hash`) quedó **aceptado** como riesgo residual y hay que documentarlo ahí, no ignorarlo.

## Self-Check: PASSED

- Archivos: los 3 creados existen en disco (`lib/auth/callback.ts`, `lib/auth/callback.test.ts`, `app/auth/callback/route.ts`).
- Commits: los 4 de tarea existen en el log (`8a3ab5f`, `ba83092`, `b7e4e6a`, `83398bd`).
- Árbol limpio, sin archivos sin trackear ni borrados accidentales.
- Gates TDD: `test(8a3ab5f)` → `feat(ba83092)`, en ese orden. RED verificado fallando antes del GREEN.
- Verificación del plan: `npx vitest run lib/auth/callback.test.ts` 8/8 · `npx tsc --noEmit` exit 0 · `npx eslint app/auth/callback/route.ts lib/auth/callback.ts` exit 0 · suite completa 513 passed / 49 skipped.

## Known Stubs

None — no hay valores hardcodeados ni placeholders. La fila `oauth` de `DESTINATIONS` está comentada a propósito (D-13: Phase 5 la agrega) y el test asierta que hoy se rechaza, así que no es un stub silencioso.

## Threat Flags

None — el plan no introduce superficie de seguridad fuera del `<threat_model>`. Sin endpoints nuevos más allá del callback planificado, sin cambios de schema, sin rutas de auth no contempladas.

---
*Phase: 04-recuperar-la-cuenta-auth-callback-reset*
*Completed: 2026-07-17*
