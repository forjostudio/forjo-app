---
phase: 02-aviso-de-reconexi-n-en-el-dashboard
plan: 01
subsystem: ui
tags: [mercadopago, oauth, dashboard, react, tailwind, next]

# Dependency graph
requires:
  - phase: 01-detecci-n-y-estado-de-conexi-n-ca-da
    provides: "columna businesses.mp_connection_status + lógica server-only que la escribe ('error' al caer, limpia al reconectar) y el campo en interface Business"
provides:
  - "Card de MercadoPago con tres estados (sano limpio / caído ámbar / desconectado) leyendo mp_connection_status"
  - "Aviso ámbar de reconexión en la card con copy locked + botón Reconectar (reusa el OAuth existente)"
  - "Banner global del dashboard (MpConnectionBanner) persistente para conexión MP caída, montado en el layout"
  - "Logo de MercadoPago inline (SVG decorativo) en la card y el botón Conectar"
  - "Estado conectado limpio (sin número de cuenta) y TabsList del hub Negocio 2×2 en mobile"
affects: [mp-connect, mercadopago, dashboard, settings]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Banner de dashboard como Server Component sin hooks, alimentado por un booleano derivado del business (aislamiento por tenant estructural)"
    - "Logo de marca inline como SVG decorativo (aria-hidden), patrón google-button, sin paquetes de íconos de marca"
    - "Estado de la card derivado del flag semántico (mpConnected / mpConnectionError), no del solo mp_user_id"

key-files:
  created:
    - components/dashboard/mp-connection-banner.tsx
  modified:
    - app/(dashboard)/settings/settings-client.tsx
    - app/(dashboard)/layout.tsx

key-decisions:
  - "El ámbar sale del token semantic warning (--warning), NO amber-500 ni hex — a diferencia de plan-banner que usa amber crudo"
  - "El banner recibe SOLO un booleano derivado (connectionError) para que estructuralmente no pueda exponer tokens/secretos ni el número de cuenta (D-07)"
  - "El CTA del banner es un <a href> (route handler OAuth, navegación HTTP completa, no next/link) con eslint-disable puntual justificado"
  - "El número de cuenta MP (mp_user_id) queda solo como flag interno; ya no se renderiza en la UI (D-09)"

patterns-established:
  - "Tres estados de conexión en una card de integración: sano / caído (recuperable, ámbar) / desconectado"
  - "Banner global de dashboard nuevo espejando PlanBanner/TestModeBanner, montado en (dashboard)/layout.tsx"

requirements-completed: [MPCONN-04]

# Metrics
duration: ~20min
completed: 2026-07-20
status: complete
---

# Phase 2 Plan 01: Aviso de reconexión en el dashboard Summary

**El dashboard refleja el estado REAL de MercadoPago Connect: card de tres estados (Conectado limpio / aviso ámbar de reconexión / Conectar) + banner global persistente, reusando el OAuth existente, con logo de MP inline y el TabsList de Negocio prolijo en mobile.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-20
- **Tasks:** 3
- **Files modified:** 3 (1 creado, 2 modificados)

## Accomplishments
- La card de MercadoPago ya no marca "Conectado" engañoso ante una caída: con `mp_connection_status === 'error'` (y `mp_user_id`) muestra un aviso ámbar con el copy locked y un botón "Reconectar" que reusa `/api/mercadopago/connect` sin desvincular primero (MPCONN-04, D-01/02/03/04).
- Banner global ámbar persistente (`MpConnectionBanner`) montado en `(dashboard)/layout.tsx`, visible en todas las páginas del route group solo con la conexión caída (D-05/D-06), alimentado por un booleano derivado del business del dueño (D-07).
- Polish de diseño: logo de MercadoPago inline (SVG decorativo, patrón google-button) en el header de la card y el botón Conectar (D-08); estado conectado limpio sin el número de cuenta (D-09); TabsList del hub Negocio 2×2 en mobile sin tocar el de Configuración (D-10).

## Task Commits

1. **Task 1: Card MP — estado caído ámbar + Reconectar, logo inline y conectado limpio** — `ca6c006` (feat)
2. **Task 2: Banner global de conexión caída + montaje en el layout** — `2d416c7` (feat)
3. **Task 3: Fix del TabsList del hub Negocio en mobile (2×2)** — `5a2846a` (fix)

## Files Created/Modified
- `components/dashboard/mp-connection-banner.tsx` (creado) — banner global del dashboard, Server Component sin hooks, ámbar/warning, persistente, CTA Reconectar → `/api/mercadopago/connect`; único prop booleano `connectionError`.
- `app/(dashboard)/settings/settings-client.tsx` (modificado) — `mpConnected` considera el flag + nuevo `mpConnectionError`; card de tres estados; `MpLogo` inline; estado conectado sin número de cuenta; TabsList de Negocio `grid-cols-2` en mobile.
- `app/(dashboard)/layout.tsx` (modificado) — importa y monta `MpConnectionBanner` junto a TestModeBanner/PlanBanner, con la visibilidad derivada del business resuelto por `owner_id`.

## Decisions Made
- Ámbar vía token semantic `warning` (no amber-500/hex), superando el patrón crudo de plan-banner por las reglas del proyecto.
- Banner recibe solo un booleano derivado → aislamiento por tenant estructural, imposible exponer secretos.
- `<a href>` (no `next/link`) para el CTA del banner: es un route handler OAuth, se quiere navegación HTTP completa; `eslint-disable` puntual con comentario justificando.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `<a>` interno flaggeado por `@next/next/no-html-link-for-pages`**
- **Found during:** Task 2 (banner)
- **Issue:** eslint marcó como error el `<a href="/api/mercadopago/connect">` del banner (2 ocurrencias del mismo error), bloqueando el lint limpio del archivo nuevo.
- **Fix:** El anchor es correcto (route handler OAuth, navegación HTTP completa, no client-routing de `next/link`). Se agregó `// eslint-disable-next-line @next/next/no-html-link-for-pages` con comentario explicando el porqué. El plan pedía explícitamente `<a href>`.
- **Files modified:** components/dashboard/mp-connection-banner.tsx
- **Verification:** `npx eslint` del banner queda limpio (0 problemas); `tsc --noEmit` exit 0.
- **Committed in:** `2d416c7` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** El escape hatch de eslint es semánticamente correcto para un endpoint OAuth; no hay scope creep.

## Issues Encountered
- **Errores de eslint preexistentes en `settings-client.tsx` (fuera de scope):** el archivo arrastra 10 errores de las reglas `react-hooks/*` del React Compiler (`set-state-in-effect`, `immutability`, `purity`) en código NO tocado por este plan (theme/effects/`Date.now`, ~líneas 180/194/202/224/348/463). Confirmado idéntico count (10) en el baseline `HEAD` linteado in-place. Mis cambios no agregan ninguno. Registrado en `deferred-items.md`. Mismo caso puntual en `layout.tsx:34` (`Date.now` en `daysLeft`, preexistente).

## User Setup Required
None — no requiere configuración de servicios externos. Para verificar visualmente: en el Supabase local, `update businesses set mp_connection_status='error' where owner_id = <dueño de prueba>` (con `mp_user_id` presente) → aparece la card ámbar + banner global; revertir a `'connected'`/NULL vuelve a "Conectado" limpio.

## Next Phase Readiness
- MPCONN-04 cubierto: la UI hace visible el estado caído y da el camino de recuperación. Cierra el milestone v0.23 (mp-connect).
- No se tocó backend/token/cobros ni el flujo OAuth (se reusa). Sin migración nueva.
- Pendiente de verificación visual manual en phase-verify (fidelidad del logo MP, ámbar, mobile 2×2).

## Self-Check: PASSED

- Archivos verificados en disco: `mp-connection-banner.tsx`, `settings-client.tsx`, `layout.tsx`, `02-01-SUMMARY.md`.
- Commits verificados: `ca6c006`, `2d416c7`, `5a2846a`.
- `tsc --noEmit` exit 0; eslint del banner limpio; eslint de settings-client sin errores nuevos (10 preexistentes documentados).

---
*Phase: 02-aviso-de-reconexi-n-en-el-dashboard*
*Completed: 2026-07-20*
