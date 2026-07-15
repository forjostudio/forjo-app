---
phase: 17-exponer-el-cms-a-clientes-reales
plan: 02
subsystem: database
tags: [rls, supabase-storage, entitlement, multi-tenant, cms, migration, isolation-test]

# Dependency graph
requires:
  - phase: 17-exponer-el-cms-a-clientes-reales (plan 01)
    provides: "retiro del kill-switch global CMS_ENABLED — has_web_custom queda como único gate; el upload es la 4ª superficie que faltaba gatear"
  - phase: 16-web-de-la-skill-nace-borrador
    provides: "la web generada por la skill nace como borrador — seguro exponer el editor (incl. el upload) sin publicar por accidente"
provides:
  - "Migración 051: gate has_web_custom en las policies INSERT+UPDATE del bucket landing-assets (RLS)"
  - "Cierre de SC2 en la 4ª superficie del CMS (el upload de imágenes) — el único punto no-bypasseable es la RLS del bucket"
  - "Caso de upload-gate en test/isolation.test.ts, guardado por RUN_STORAGE_TESTS (skip limpio en local, corre en staging/CI con Storage)"
affects: [secure-phase-17, web-builder, cms, deploy-go-live]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DDL sobre storage.objects guardado por to_regclass('storage.objects') IS NOT NULL vía SQL dinámico — no-op en local (storage OFF), aplica en prod/staging; mantiene el baseline replayable"
    - "Gate de entitlement en la RLS del bucket: AND has_web_custom = true agregado al subquery de businesses (no en la app, que el upload directo saltea)"
    - "Test de integración de Storage guardado por flag de entorno explícito (RUN_STORAGE_TESTS) para evitar falso-rojo (storage no disponible) y falso-verde"

key-files:
  created:
    - "supabase/migrations/051_landing_assets_gate_entitlement.sql"
  modified:
    - "test/isolation.test.ts"
    - "test/env.ts"

key-decisions:
  - "El gate del upload vive en la RLS del bucket, no en la page ni en una Server Action: el editor sube DIRECTO a Storage desde el browser (session client), así que la policy es el único punto no-bypasseable."
  - "La policy DELETE NO se gatea por has_web_custom: queda owner-only para que un negocio recién desactivado pueda limpiar sus propios objetos (RESEARCH Open Q2 / T-17-07 = accept)."
  - "Todo el DDL sobre storage.objects va guardado por to_regclass — en local (storage OFF) no-opea y el baseline replayable no se rompe; en prod/staging el gate SÍ se materializa."
  - "El caso de upload-gate del test se guarda por RUN_STORAGE_TESTS: skipea limpio donde no hay Storage API (local), corre en staging/CI; nunca usa service-role en la aserción."

patterns-established:
  - "Gate de add-on en Storage: para superficies que escriben directo al bucket, el entitlement se enforcea en la policy RLS (AND has_web_custom = true), no en el runtime web."
  - "Migración sobre storage.objects segura para el baseline local: envolver DROP/CREATE POLICY en un guard de existencia por to_regclass + EXECUTE dinámico."

requirements-completed: [PUB-01]

# Metrics
duration: 12min
completed: 2026-07-15
status: complete
---

# Phase 17 Plan 02: Exponer el CMS a clientes reales — gate del upload Summary

**Migración 051 que agrega `AND has_web_custom = true` a las policies INSERT+UPDATE del bucket `landing-assets`, cerrando SC2 en la 4ª superficie del CMS (el upload de imágenes) en la RLS — el único punto no-bypasseable del upload directo a Storage — verificado en PROD.**

## Performance

- **Duration:** ~12 min (implementación) + checkpoint blocking-human (verificación en prod)
- **Started:** 2026-07-15T11:00:00-03:00 (aprox.)
- **Completed:** 2026-07-15 (checkpoint aprobado)
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 3 (1 creado, 2 modificados)

## Accomplishments
- Migración 051 re-crea las policies "landing-assets owner insert" y "landing-assets owner update" con `AND has_web_custom = true` en el subquery de `businesses`; la policy DELETE queda intacta (owner-only). Con esto el gate único `has_web_custom` sostiene en las 4 superficies del CMS: guardar, publicar, descartar y **upload**.
- Todo el DDL sobre `storage.objects` va guardado por `to_regclass('storage.objects') IS NOT NULL` vía SQL dinámico → no-op en el baseline local (storage OFF), gate real en prod/staging. `supabase db reset` local sigue replayable.
- `test/isolation.test.ts` incorpora un caso de upload-gate (dueño con `has_web_custom = false` rechazado por la RLS), guardado por `RUN_STORAGE_TESTS` para skipear limpio en local y correr donde hay Storage. El caso del trigger anti-tampering (`businesses_protect_admin_columns`) se mantiene verde.
- SC2 verificado EN VIVO contra Storage real: rechazo del no-entitled + happy path del entitled + bypass service-role esperado + no-regresión colateral (ver Checkpoint Verification).

## Task Commits

Cada tarea se commiteó de forma atómica:

1. **Task 1: Migración 051 — gatear el upload por has_web_custom en la RLS del bucket** - `2e5af64` (feat)
2. **Task 2: Extender el test de aislamiento con el gate del upload (guardado por RUN_STORAGE_TESTS)** - `97aa52b` (test)
3. **Task 3: Verificar el gate del upload contra Storage prod-like + aplicar 051** - checkpoint:human-verify (blocking-human) — APROBADO por el humano (sin commit de código)

## Files Created/Modified
- `supabase/migrations/051_landing_assets_gate_entitlement.sql` (nuevo) - Amend de las policies INSERT+UPDATE del bucket `landing-assets`: agrega `AND has_web_custom = true` al subquery `SELECT id::text FROM businesses WHERE owner_id = auth.uid()`. Nombres de policy EXACTOS y mismas cláusulas de la migr. 030, solo se suma el AND. DELETE no se toca. Todo el DDL guardado por `to_regclass('storage.objects') IS NOT NULL` + `EXECUTE` dinámico. Cabecera en español explicando qué hace, qué NO hace y por qué el guard (storage OFF en local).
- `test/isolation.test.ts` - Nuevo `it` de upload-gate: `anonA` (dueño con `has_web_custom = false`) intenta `storage.from('landing-assets').upload(...)` y se assertea el rechazo por policy; guardado por `RUN_STORAGE_TESTS` (skip limpio en local). Solo clientes anon-key en la aserción (nunca service-role). El caso del trigger anti-tampering queda tal cual (verde).
- `test/env.ts` - Deriva el flag `RUN_STORAGE_TESTS` del entorno para skipear el caso de Storage donde no está disponible.

## Decisions Made
None - se siguió el plan tal como fue especificado. Las decisiones clave (gate en la RLS del bucket, DELETE owner-only sin gatear, guard por `to_regclass`, test guardado por flag) vienen del plan/RESEARCH y se respetaron literalmente.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. El `supabase db reset --local` corrió con 051 como no-op (storage OFF en el baseline) y `npm test -- isolation` pasó con el nuevo caso skipeando limpio. La verificación funcional del gate contra Storage real recayó en la Task 3 (checkpoint), como estaba previsto en el plan (Storage local OFF).

## Checkpoint Verification (Task 3 — blocking-human, APROBADO)

La verificación se realizó en **PRODUCCIÓN** (staging estaba pausado). Migración 051 aplicada a prod a mano (SQL editor) + schema recargado:

- **Rechazo confirmado (SC2):** dueño autenticado con `has_web_custom = false` intentando subir una imagen desde el editor `/web` → **RECHAZADO** (toast "No se pudo subir la imagen"). Antes de 051, la misma subida daba 200. El gate del upload vive en la RLS del bucket, no solo en la page.
- **Happy path confirmado:** con `has_web_custom = true`, la subida desde el editor **funciona** — el editor de Phase 14 no se rompe.
- **Bypass service-role confirmado como esperado:** subir el mismo objeto vía el dashboard de Supabase (service-role) sigue funcionando — RLS bypasseada por diseño (skill del operador intacta; T-17-08).
- **No-regresión colateral:** el cambio de logo en Configuración usa OTRO bucket → intacto.
- **DELETE** del bucket queda owner-only sin gatear (Open Q2 / T-17-07 = accept).

Todos los threats mitigables de la fase quedan verificados en vivo: T-17-06 (upload no-entitled rechazado), T-17-08 (writer service-role + logo intactos), T-17-09 (reset local replayable), T-17-04 (trigger anti-tampering verde en el test).

## Known Stubs
None - la migración materializa el gate real; el test cubre la superficie donde hay Storage disponible.

## Threat Flags
None - no se introdujo superficie de seguridad nueva. El plan CIERRA una superficie de escritura (el upload) que estaba gateada solo por `owner_id`; ahora también por `has_web_custom`. La policy DELETE (owner-only) es un accept documentado (T-17-07), no una superficie nueva.

## User Setup Required

**La migración 051 se aplica A MANO a la base hosteada** (el repo NO hace `db push` a prod). Ya aplicada a PROD durante la verificación del checkpoint. Ver `17-02-PLAN.md` (bloque `user_setup`) para el detalle. Runbook de go-live abajo.

## Next Phase Readiness — Runbook de go-live (DOWNSTREAM, fuera del cierre de este plan)

Estado tras cerrar 17-02:

- **Prod ya tiene la RLS endurecida (051 aplicada).** El código de 17-01 + 17-02 vive en la rama `gsd/gestion-rebrand` y **aún NO está deployado a prod**: hoy prod corre el código viejo (gate-first ordering, seguro) con la RLS nueva. Esta combinación es segura (la RLS es más restrictiva; el código viejo no expone el CMS de más).
- **Deploy real pendiente (paso posterior):** merge de `gsd/gestion-rebrand` a main → Vercel. El código de 17-01 (exposición del editor) DEBE llegar a prod con 051 ya aplicada — lo cual ya se cumple. No exponer el CMS sin el gate del upload; el orden quedó correcto (051 primero).
- **Runbook post-deploy (no bloqueante, benigno):** borrar la env var `CMS_ENABLED` de Vercel (3 scopes: Production/Preview/Development). El código ya no la lee; si queda, no hace nada.
- **Palanca de emergencia post-flag:** toggle admin `has_web_custom` (D-03), no un flag de entorno nuevo.
- **Pendiente de seguridad de fase:** correr `/gsd:secure-phase 17` para el sello formal de los threats (ya verificados en vivo en el checkpoint).

## Self-Check: PASSED

- Archivos creados/modificados: `supabase/migrations/051_landing_assets_gate_entitlement.sql`, `test/isolation.test.ts`, `test/env.ts` — 3/3 presentes en disco.
- Commits de tareas: `2e5af64`, `97aa52b` presentes en git.

---
*Phase: 17-exponer-el-cms-a-clientes-reales*
*Completed: 2026-07-15*
