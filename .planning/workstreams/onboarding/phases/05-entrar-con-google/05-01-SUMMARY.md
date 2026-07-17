---
phase: 05-entrar-con-google
plan: 01
subsystem: auth
tags: [oauth, google, supabase, pkce, exchangeCodeForSession, next16, callback]

# Dependency graph
requires:
  - phase: 04-recuperar-la-cuenta-auth-callback-reset
    provides: "Callback endurecido /auth/callback (parse→verifyOtp→resolveDestination→redirect), módulo puro lib/auth/callback.ts, mitigaciones T-04-01/-02/-04"
provides:
  - "Rama OAuth en /auth/callback: detecta ?code= y lo canjea con exchangeCodeForSession, con destino /dashboard derivado server-side"
  - "Rama de error OAuth propia (?error= de Google o fallo del canje) → /login?error=oauth, sin reusar el error de recuperación de contraseña"
  - "DESTINATIONS.oauth = '/dashboard' en el módulo puro; oauth NO en ALLOWED_TYPES (ruteo por presencia de code, no por type)"
affects: [05-02-boton-google, 05-03-uat-linking, secure-phase-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ruteo del callback por presencia de parámetro (code/error) antes del parse de token_hash; el path de mail queda como else implícito"
    - "Error OAuth con ruta propia (/login?error=oauth) en vez de reusar el error opaco del flujo de mail"

key-files:
  created: []
  modified:
    - lib/auth/callback.ts
    - lib/auth/callback.test.ts
    - app/auth/callback/route.ts

key-decisions:
  - "oauth NO se agrega a ALLOWED_TYPES (corrección del research vs. D-07 original): OAuth vuelve con ?code= y sin type; meterlo dejaría pasar un type=oauth fabricado a verifyOtp"
  - "DESTINATIONS.oauth = '/dashboard' (no /onboarding): el layout de (dashboard) rutea al nuevo (→onboarding) y al recurrente (→dashboard) con un solo destino (AUTH-04, D-09)"
  - "El fallo/cancelación de OAuth cae en /login?error=oauth, nunca en el fail() de /forgot-password?error=invalid_link (D-05/D-08)"

patterns-established:
  - "Branch OAuth al principio del GET, antes del parse; verifyOtp del mail intacto"
  - "Canje con el cliente anon+cookies de @/lib/supabase/server, nunca service role (T-05-05)"

requirements-completed: [AUTH-03, AUTH-04, AUTH-05]

# Metrics
duration: 12min
completed: 2026-07-17
status: complete
---

# Phase 5 Plan 01: Rama OAuth del callback endurecido Summary

**El /auth/callback de Phase 4 ahora detecta el retorno de Google por ?code=, lo canjea con exchangeCodeForSession y manda a /dashboard; un fallo o una cancelación caen en /login?error=oauth, con el path de mail intacto.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-17T16:08:00Z
- **Completed:** 2026-07-17T16:16:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Rama OAuth agregada al GET de `/auth/callback`: ruteo por presencia de `code`/`error`, canje con el cliente anon+cookies existente, destino `/dashboard` derivado server-side de la tabla (T-05-02), URL limpia con `303` + `Referrer-Policy: no-referrer` (T-05-04).
- Rama de error OAuth propia que cubre tanto el fallo del canje como el `?error=` de Google (cancelación del consent) → `/login?error=oauth`, sin reusar el `fail()` de recuperación de contraseña (D-05/D-08).
- `DESTINATIONS.oauth = '/dashboard'` activado en el módulo puro; `oauth` queda fuera de `ALLOWED_TYPES` a propósito y para siempre (corrección post-research de D-07), con test de regresión y comentarios actualizados.

## Task Commits

Cada task se commiteó atómicamente:

1. **Task 1: módulo puro + test (DESTINATIONS.oauth y corrección del comentario de ALLOWED_TYPES)** - `90ba8c0` (feat)
2. **Task 2: rama OAuth del route (code→exchangeCodeForSession + error propio)** - `d7c38cc` (feat)

## Files Created/Modified
- `lib/auth/callback.ts` - Fila `oauth: '/dashboard'` activada en `DESTINATIONS`; comentario de `ALLOWED_TYPES` reescrito (oauth NO entra al Set; ruteo por presencia de code).
- `lib/auth/callback.test.ts` - Aserción `resolveDestination('oauth') === '/dashboard'`; comentario del rechazo de `type=oauth` actualizado a guardia de regresión permanente.
- `app/auth/callback/route.ts` - Rama OAuth al principio del GET (error branch + code→exchangeCodeForSession), comentarios de cabecera y del paso 2 actualizados. Path de mail (verifyOtp) sin cambios.

## Decisions Made
- **oauth fuera de ALLOWED_TYPES:** el research corrigió la sub-cláusula de D-07. OAuth vuelve con `?code=` y sin `type`, así que `parseCallbackParams` no participa; agregar `oauth` al Set dejaría pasar un `token_hash=x&type=oauth` fabricado a `verifyOtp`. El Set sigue siendo exactamente `['recovery', 'signup']`.
- **Destino /dashboard, no /onboarding:** un solo destino sirve al usuario nuevo (el layout de `(dashboard)` lo rebota a `/onboarding` si no tiene negocio) y al recurrente. Apuntar directo a `/onboarding` rompería al recurrente.
- **Ruta de error OAuth propia:** reusar `fail()` mandaría un fallo de Google a un mensaje de recuperación de contraseña — el error opaco que D-05 prohíbe.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npm run build` compila y pasa TypeScript ("Compiled successfully", "Finished TypeScript"), pero falla en el prerender estático de `/onboarding` con `@supabase/ssr: Your project's URL and API key are required`. Es la limitación ambiental documentada: `.env.local` (gitignored) no viaja al worktree, así que no hay claves de Supabase para el prerender. La página `/onboarding` es ajena a este plan y el fallo es de entorno, no de código. La verificación real se hizo con `npx tsc --noEmit` (exit 0), `npx eslint app/auth/callback/route.ts` (exit 0) y `npx vitest run lib/auth/callback.test.ts` (8/8 verde), más todas las aserciones grep del plan. Fuera de scope (SCOPE BOUNDARY): no se tocó.

## User Setup Required
None en este plan — el provider Google en el Dashboard de Supabase + los redirect URIs en Google Cloud son el checkpoint humano del plan `05-03`, no de este.

## Next Phase Readiness
- La pieza server-side está lista: en cuanto el botón del plan `05-02` mande al usuario a `/auth/callback?code=...`, el canje y el ruteo funcionan.
- El canje real contra GoTrue, el auto-link de identidad y el destino final dependen de red + credenciales + el provider habilitado; se verifican en el UAT del plan `05-03` (H-06).
- Correr `/gsd:secure-phase 05` al cerrar la fase: comparte superficie con Phase 4 (T-04-01/-02/-04 sobre la rama OAuth + el nuevo threat del error opaco).

## Self-Check: PASSED

---
*Phase: 05-entrar-con-google*
*Completed: 2026-07-17*
