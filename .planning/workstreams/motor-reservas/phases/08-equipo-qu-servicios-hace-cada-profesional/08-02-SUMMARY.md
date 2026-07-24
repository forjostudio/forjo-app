---
phase: 08-equipo-qu-servicios-hace-cada-profesional
plan: 02
subsystem: ui
tags: [react, nextjs, supabase, rls, multi-tenant, staff-services, optimistic-ui, shadcn, a11y]

# Dependency graph
requires:
  - phase: 08-01
    provides: "tabla puente professional_services (migr. 057) + interface ProfessionalService + helper puro lib/staff-services.ts (regla del comodín)"
  - phase: 03-espacio-compartido
    provides: "patrón toggleAgendaSpace (chips optimistas con rollback) + chip markup en settings-client"
provides:
  - "Bloque A en /equipo: editor de chips servicio×profesional (optimista, rollback, toasts D-02/D-10) dentro de SettingsClient (view=equipo)"
  - "Bloque B en /servicios: cobertura por servicio (Lo hacen / badge Sin cobertura + línea con link a Equipo), solo lectura"
  - "toggleProfessionalService/isServiceMapped + estado professionalServices en settings-client.tsx"
  - "read-paths ampliados: equipo/page.tsx (services + professional_services) y servicios/page.tsx (professional_services), por tenant"
affects: [09-asignacion-atomica-book-slot-atomic, 10-reserva-publica-cualquiera, settings-client]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Escritura autenticada del dueño por browser client + RLS + .eq('business_id') (defensa en profundidad), nunca service-role — espejo de toggleAgendaSpace"
    - "Cobertura/comodín consumidos del helper puro (lib/staff-services), nunca reimplementados en el componente"
    - "Un solo componente (SettingsClient vía prop view) sirve editor (equipo) y cobertura (servicios)"

key-files:
  created: []
  modified:
    - app/(dashboard)/settings/settings-client.tsx
    - app/(dashboard)/equipo/page.tsx
    - app/(dashboard)/servicios/page.tsx

key-decisions:
  - "El toast D-10 se restringe al servicio recién desmarcado (svc = serviceId): solo su cobertura puede caer con ese toggle; si el pro quedó comodín, la cobertura sube y gana D-02 — implementa la precedencia D-10 > D-02 exacta del UI-SPEC"
  - "El nombre del servicio en /servicios pasa a truncate + wrapper flex para que el badge Sin cobertura sobreviva a nombres largos (mobile-first, la advertencia es prioritaria)"
  - "No se agregó test de componente React (RED/GREEN): la lógica pura (comodín/cobertura) ya está congelada en test/staff-services.test.ts (08-01) y un harness de componente exige dependencia nueva prohibida por el UI-SPEC (Registry Safety)"

patterns-established:
  - "Chip de toggle idéntico al de espacios + único delta focus-visible:ring-2 focus-visible:ring-ring (WCAG)"
  - "Gates de visibilidad en orden: !isCanchas (D-18) → ≥2 profesionales activos (D-07) → sin servicios (guía)"

requirements-completed: [STAFF-01, STAFF-02, STAFF-03]

# Metrics
duration: ~22min
completed: 2026-07-24
status: complete
---

# Phase 8 Plan 02: Editor de mapeo (/equipo) + cobertura (/servicios) Summary

**Los dos bloques de UI de la Phase 8 dentro de `SettingsClient`: el editor de chips servicio×profesional en `/equipo` (optimista, rollback, toasts D-02/D-10 derivados del helper) y la cobertura por servicio en `/servicios` (Lo hacen / badge "Sin cobertura" con link a Equipo), más los dos read-paths ampliados para cargar el mapeo por tenant — escritura por RLS del dueño, nunca service-role; tsc limpio, 0 lint nuevos, 0 tests nuevos rotos.**

## Performance

- **Duration:** ~22 min
- **Completed:** 2026-07-24
- **Tasks:** 3 de 3
- **Files modified:** 3

## Accomplishments
- **Bloque A (`/equipo`, view=equipo):** tercera Card en la tab Equipo con `isServiceMapped`/`toggleProfessionalService` (write optimista con rollback por browser client + RLS + `.eq('business_id')`), gates canchas/<2 activos/sin servicios, estado comodín "Hace todo", chip visualmente idéntico al de espacios + `focus-visible:ring` (WCAG), `role="group"` por fila. Toasts al desmarcar con precedencia D-10 (`toast.warning` servicio sin cobertura) > D-02 (`toast.info` volvió a comodín), derivados de `isServiceCovered`; marcar nunca avisa; error → solo `toast.error` con rollback.
- **Bloque B (`/servicios`, view=servicios):** dos agregados quirúrgicos a la fila de servicio existente — badge "Sin cobertura" (tokens `warning`) junto al nombre y línea final "Lo hacen: …" (joiner ` · `) o aviso `role="status"` con link a `/equipo`. Lista y booleano salen de `professionalsForService`/`isServiceCovered`; gateado por `!isCanchas` + ≥2 activos; texto plano sin pills.
- **Read-paths:** `equipo/page.tsx` carga `services` (antes `initialServices={[]}`) + `professional_services`; `servicios/page.tsx` carga `professional_services`; ambos `.eq('business_id', business.id)` + RLS y pasan `initialProfessionalServices`. Redirect por canchas de `/equipo` intacto.

## Task Commits

Cada task se commiteó de forma atómica:

1. **Task 1: settings-client — prop/estado + toggleProfessionalService + Bloque A** - `bd3a4a1` (feat)
2. **Task 2: settings-client — Bloque B (cobertura por servicio)** - `23959b6` (feat)
3. **Task 3: read-paths equipo/servicios cargan el mapeo por tenant** - `0273fd5` (feat)

**Plan metadata:** (docs: complete plan — commit final)

## Files Created/Modified
- `app/(dashboard)/settings/settings-client.tsx` - Prop `initialProfessionalServices` + estado `professionalServices`; `isServiceMapped`/`toggleProfessionalService`; Bloque A (Card editor de chips, view=equipo); Bloque B (badge + línea de cobertura en el map de servicios).
- `app/(dashboard)/equipo/page.tsx` - `Promise.all` carga `services` + `professional_services` por tenant; pasa `initialServices={services||[]}` y `initialProfessionalServices`.
- `app/(dashboard)/servicios/page.tsx` - `Promise.all` carga `professional_services` por tenant; pasa `initialProfessionalServices`.

## Decisions Made
- **Precedencia D-10 > D-02 acotada al servicio desmarcado:** el toggle de desmarcar (professionalId, serviceId) solo puede bajar la cobertura de `serviceId`; si al desmarcar el pro quedó con 0 filas, se vuelve comodín y la cobertura sube (nunca genera huérfano) → gana D-02. Se chequea `!isServiceCovered(serviceId, activos, next)` primero, `else` `next.every(r => r.professional_id !== professionalId)`. Implementa la tabla de precedencia del UI-SPEC exactamente.
- **`truncate` en el nombre de servicio de `/servicios`:** requerido por el UI-SPEC para que el badge "Sin cobertura" (`flex-shrink-0`) sobreviva a nombres largos en 375px; cambio mínimo dentro del wrapper `flex items-center gap-2 min-w-0`.
- **Import dividido entre commits:** `isServiceCovered` entra en Task 1 (lo usa el toggle) y `professionalsForService` en Task 2 (lo usa la cobertura), para que cada commit quede lint-limpio (el preset de Next marca imports sin usar).

## Deviations from Plan

None - plan executed exactly as written. Cero componentes nuevos, cero dependencias nuevas, cero hex hardcodeado (solo tokens por clase). Escritura por RLS, no service-role. Motor de reservas, alta manual/abonos y `professionals.service_id` intactos (D-04/D-15/D-18).

## Issues Encountered

- **`npx vitest run` completo:** 751 passed, 1 skipped, **4 failed** — los 4 fallos están todos en `test/abono-*.test.ts` (`abono-cancel`, `abono-create`, `abono-cron`, `abono-generation`), integración date-dependent contra la Supabase LOCAL. Son PRE-EXISTENTES / ambientales (documentado en el prompt y en el 08-01-SUMMARY): dependen de la fecha/estado del DB local. Ningún archivo `abono-*` importa la superficie tocada por este plan y los cambios son solo UI + read-paths. `npx vitest run test/staff-services.test.ts` → **8/8 verdes**. Fuera de alcance (SCOPE BOUNDARY).
- **Lint pre-existente:** `eslint` sobre `settings-client.tsx` reporta 10 errores `react-hooks/purity`/`react-hooks/*` en líneas 194-477 (código pre-existente: efectos y `Date.now()` en los uploads). Idénticos antes y después de mis ediciones; mis adiciones (≈ líneas 588+, 660+, 1230+, 1490+) no agregan ninguno. `equipo/page.tsx` y `servicios/page.tsx` lintean limpio.

## TDD Gate Compliance

Task 1 estaba marcado `tdd="true"`, pero es cableado de UI que **consume** el helper puro ya testeado en `test/staff-services.test.ts` (08-01, 8/8). El repo no tiene harness de tests de componente (solo `vitest` para libs puras); agregar uno (`@testing-library/react` + jsdom/happy-dom) sería una **dependencia nueva prohibida** por el UI-SPEC (Registry Safety: "no instala componentes nuevos ni agrega dependencias"). Por eso no se corrió un ciclo RED/GREEN de componente. La lógica de dominio bajo prueba (regla del comodín / cobertura) queda congelada aguas arriba; la verificación de esta capa es tsc + greps de acceptance + UAT visual del checkpoint de fase. El MVP+TDD gate no estaba activo (orquestador no pasó MVP_MODE/TDD_MODE; `tdd_mode: false` en config).

## Verification (autónoma)
- `node ./node_modules/typescript/bin/tsc --noEmit` → **limpio** (tras los 3 tasks).
- Greps de acceptance: `toggleProfessionalService`=2, `from('professional_services')`=2 (insert+delete), `staff-services`=3, `role="status"`=2, `Sin cobertura`=1, `focus-visible:ring-2 focus-visible:ring-ring`=4, `createAdminClient|service_role`=**0**, `professionalsForService|isServiceCovered`=4. Pages: `professional_services` en ambos, `initialServices={services`=1, redirect canchas de `/equipo` presente sin cambios.
- `npx vitest run test/staff-services.test.ts` → 8/8; suite completa 751/756 (4 fallos abono-* ambientales pre-existentes).

## Threat Surface
- **T-08-06/07 (IDOR/Spoofing):** `professional_id`/`service_id` provienen solo de listas cargadas por `business_id`; write por browser client + RLS `WITH CHECK` + `.eq('business_id')` en el delete; `service_role` = 0. Mitigado.
- **T-08-08 (Info Disclosure):** ambos read-paths `.eq('business_id')` + RLS; `services` con `select('*')` como el resto. Mitigado.
- **T-08-09/10 (motor/vertical):** solo se tocaron `settings-client.tsx` + los dos `page.tsx`; sin cambios al booking público, `book_slot_atomic`, availability ni forms de alta/abonos; editor y cobertura gateados por `isCanchas`. Mitigado.
- Sin flags de amenaza nuevos (ninguna superficie de red/auth/schema nueva).

## Next Phase Readiness
- El dueño ya configura "qué hace cada profesional" y ve la cobertura inversa con el hueco señalado. El mapeo persiste por tenant y alimenta las Phases 9 (asignación atómica) y 10 (grilla pública) — que recién ahí lo harán afectar la reserva pública.
- **Pendiente operativo aguas abajo (de 08-01):** aplicar la migr. 057 a **producción** a mano en el próximo deploy (+ `NOTIFY pgrst, 'reload schema';`) antes de que estos bloques tengan datos reales en prod.
- UAT visual pendiente en el checkpoint de fase: marcar chips en `/equipo` y recargar; ver "Lo hacen" y "Sin cobertura" en `/servicios`; confirmar que en canchas y con <2 activos no aparece nada.

## Self-Check: PASSED

Los 3 archivos modificados existen y los 3 commits (`bd3a4a1`, `23959b6`, `0273fd5`) están en el historial. `tsc --noEmit` limpio; greps de acceptance verdes; `staff-services` 8/8.

---
*Phase: 08-equipo-qu-servicios-hace-cada-profesional*
*Completed: 2026-07-24 — 3/3 tasks (plan autónomo, sin checkpoints)*
