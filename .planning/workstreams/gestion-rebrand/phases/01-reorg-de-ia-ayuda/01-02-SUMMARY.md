---
phase: 01-reorg-de-ia-ayuda
plan: 02
subsystem: ui
tags: [next16, shadcn-tabs, mercadopago-oauth, multi-tenant, settings-client]

# Dependency graph
requires:
  - phase: 01-reorg-de-ia-ayuda (plan 01)
    provides: sidebar agrupado — el item Negocio vive bajo GESTIÓN y linkea a /negocio
provides:
  - "/negocio = hub de 4 tabs client-side (Datos del negocio · Cobros · Integraciones · Notificaciones/Mails), default Datos"
  - "/settings = 3 tabs (Apariencia · Seguridad · Suscripción), default Apariencia"
  - "negocio/page.tsx pasa secrets del dueño (getBusinessSecrets) al hub"
  - "OAuth de MercadoPago aterriza en /negocio → tab Integraciones + toast, URL limpia a /negocio"
affects: [01-03 (FAQ/ayuda), fases que toquen el hub Negocio o el flujo de conexión MP]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hub de tabs por view en el mega-componente SettingsClient: estado de tab propio por view (negocioTab vs configTab), TabsList condicional por view, TabsContent compartidos (shadcn Tabs muestra solo el que matchea value)"

key-files:
  created: []
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"
    - "app/(dashboard)/negocio/page.tsx"
    - "app/api/mercadopago/callback/route.ts"
    - "app/api/mercadopago/connect/route.ts"

key-decisions:
  - "Reasignar qué TabsList/TabsContent muestra cada view en vez de mover el JSX de las tabs — cero cambios en el cuerpo de los TabsContent (behavior-frozen)"
  - "Estado de tab del hub Negocio separado (negocioTab) del de config (configTab): dos TabsList en dos rutas distintas"
  - "El useEffect del ?mp= se gatea por isNegocio para que solo corra al montar /negocio, no en /settings"

patterns-established:
  - "Split de tabs por view: TabsList condicional (isNegocio vs !isSection) + tabValue/onTabChange derivados del view, sobre un único <Tabs> con todos los TabsContent como hijos"

requirements-completed: [NAV-02]

# Metrics
duration: 5min
completed: 2026-07-05
status: complete
---

# Phase 1 Plan 02: Split Negocio-hub / Configuración Summary

**Cobros · Integraciones · Notificaciones migraron de Configuración al hub Negocio (4 tabs client-side) reasignando qué TabsList/TabsContent muestra cada `view` del mega-componente SettingsClient, con el retorno del OAuth de MercadoPago reruteado a /negocio → Integraciones, sin tocar el cuerpo de ninguna tab ni la validación CSRF del callback.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-05T14:58:38Z
- **Completed:** 2026-07-05T15:03:31Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- `/negocio` es ahora un hub con 4 tabs (Datos del negocio · Cobros · Integraciones · Notificaciones/Mails), default Datos, con estado de tab propio (`negocioTab`).
- `/settings` quedó con 3 tabs (Apariencia · Seguridad · Suscripción), default Apariencia — sin Cobros/Integraciones/Notificaciones.
- `negocio/page.tsx` carga los secretos del dueño (`getBusinessSecrets(business.id)`, service-role, scoped por `owner_id`) y los pasa al hub para que las tabs migradas tengan los valores del dueño.
- El OAuth de MercadoPago redirige a `/negocio?mp=connected|error` (callback L17/L69, connect L9) y el `useEffect` del `?mp=` (reubicado al hub Negocio) setea la tab Integraciones + toast + limpia la URL a `/negocio`.

## Task Commits

Each task was committed atomically:

1. **Task 1: /negocio hub de 4 tabs + /settings a 3 (NAV-02) + reubicar retorno OAuth MP (D-06)** - `7cbf8c6` (feat)
2. **Task 2: pasar secrets + mpConnectEnabled a /negocio (scoped al dueño)** - `fdd44e7` (feat)
3. **Task 3: reubicar redirects del OAuth de MercadoPago a /negocio (D-06)** - `cdd9ab9` (feat)

## Files Created/Modified
- `app/(dashboard)/settings/settings-client.tsx` - Flag `isNegocio`, estado `negocioTab`/`setNegocioTab` (default `business`), `tabValue`/`onTabChange` derivados del view, TabsList del hub Negocio (4 triggers, incl. label literal "Notificaciones/Mails"), TabsList de config reducido a 3, y `useEffect` del `?mp=` gateado por `isNegocio` que setea Integraciones + `replaceState` a `/negocio`.
- `app/(dashboard)/negocio/page.tsx` - Import de `getBusinessSecrets`; `secrets = await getBusinessSecrets(business.id)` (scoped por `owner_id`) y `secrets={secrets}` a `SettingsClient view="negocio"`.
- `app/api/mercadopago/callback/route.ts` - Redirects a `/negocio?mp=error` (L17) y `/negocio?mp=connected` (L69); comentario de cabecera actualizado a `/negocio`.
- `app/api/mercadopago/connect/route.ts` - Redirect de error a `/negocio?mp=error` (L9).

## Decisions Made
- **Migración = reasignación, no mudanza de JSX.** El componente ya tiene los 7 `<TabsContent>` como hijos de un único `<Tabs value={tabValue}>`; shadcn Tabs solo renderiza el que matchea `value`. Por eso el split se logra con el `TabsList` correcto por view + el estado por view, sin mover ni editar el cuerpo de ningún TabsContent (behavior-frozen garantizado por construcción).
- **Estado de tab por view separado.** `negocioTab` (default `business`) vive aparte de `configTab` (default `appearance`) porque son dos TabsList en dos rutas distintas; `tabValue`/`onTabChange` se derivan del `view`.
- **`?mp=` gateado por `isNegocio`.** El efecto solo corre al montar `/negocio`; en `/settings` no hace nada. El backend ahora manda a `/negocio?mp=...`, así que el efecto se dispara donde corresponde.

## Deviations from Plan

None - plan executed exactly as written.

Nota menor: durante Task 1 introduje inicialmente una variable auxiliar `showTabsList` que no llegué a usar (eslint la marcó como `no-unused-vars`); la quité en el mismo commit antes de commitear. No es una desviación del plan — es limpieza dentro de la propia tarea.

## Issues Encountered
- **eslint `set-state-in-effect` en el `useEffect` del `?mp=`:** la regla `react-hooks/set-state-in-effect` (versión estricta del plugin en el repo) marca como error el `setNegocioTab('integraciones')` dentro del efecto. Verificado que es **pre-existente**: el archivo original en HEAD ya falla eslint con el mismo error en el efecto `?mp=` original (`setConfigTab`) y en `setMounted`, además de muchos otros errores (`This value cannot be modified`, `Cannot call impure function during render`). Comparando el conteo de problemas de eslint baseline (HEAD) vs. mi versión: **20 vs 20** — mi cambio no introduce ningún problema nuevo. Fuera de scope (scope boundary: no arreglar errores pre-existentes no causados por la tarea). `npx tsc --noEmit` verde en los 4 archivos.

## User Setup Required
None - no external service configuration required. (El OAuth de MercadoPago sigue usando las mismas env vars; solo cambió el pathname del landing.)

## Next Phase Readiness
- NAV-02 completo. Falta plan 01-03 (FAQ/ayuda estática HELP-01 + link a `/ayuda` desde el sidebar y Configuración).
- Verificación manual pendiente del ejecutor/UAT: confirmar visualmente que /negocio muestra 4 tabs (default Datos) y /settings 3 (default Apariencia), y que "Conectar con MercadoPago" → volver aterriza en /negocio → Integraciones con el toast correcto.

## Self-Check: PASSED
- `app/(dashboard)/settings/settings-client.tsx` — FOUND (modified, tsc clean)
- `app/(dashboard)/negocio/page.tsx` — FOUND (modified, tsc+eslint clean)
- `app/api/mercadopago/callback/route.ts` — FOUND (modified, tsc clean)
- `app/api/mercadopago/connect/route.ts` — FOUND (modified, tsc clean)
- Commit `7cbf8c6` — FOUND
- Commit `fdd44e7` — FOUND
- Commit `cdd9ab9` — FOUND
- `grep /settings?mp= app/api/mercadopago/` — 0 (rerouted)
- `grep -diff lib/verticals.ts` — empty (untouched)

---
*Phase: 01-reorg-de-ia-ayuda*
*Completed: 2026-07-05*
