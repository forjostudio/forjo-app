---
phase: 03-impersonaci-n-read-only
plan: 01
subsystem: api
tags: [impersonation, multi-tenant, audit, service-role, supabase, zod, rsc, next16]

# Dependency graph
requires:
  - phase: 01-cimientos-auditor-a
    provides: requireAdmin(), logAudit()/audit_log (migr. 031), ConfirmDialog nivel VER, PaletteScript, .crm-shell dark
  - phase: 02-admin-de-plataforma
    provides: ficha /admin/negocios/[id], patrón server action requireAdmin+parse+logAudit, _actions.schemas.ts, auditoria-client.tsx ACTION_LABEL, estado suspended
provides:
  - "startImpersonationSchema (businessId uuid + reason trim().min(10)) + StartImpersonationInput"
  - "startImpersonation server action: audita user.impersonate (risk alto) + redirect a /ver, sin mutar nada (D-02)"
  - "getBusinessIntegrationStatus(businessId): presencia de integraciones como booleanos (sin valores crudos)"
  - "loadImpersonationData(businessId): capa de lectura read-only service-role acotada por business_id; tipo ImpersonationData"
  - "loader RSC /admin/negocios/[id]/ver: guard + notFound + auditoría por carga (user.impersonate.view) + PaletteScript del negocio + escape del shell dark (.impersonation-view)"
  - "label 'user.impersonate.view' en el visor de auditoría"
affects: [03-02-PLAN (banner + renderers read-only por sección consumen ImpersonationData), crm impersonation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-only POR CONSTRUCCIÓN: la garantía IMP-01 se logra por AUSENCIA de write paths (action sin mutación, helper sin update/insert/delete, sin cliente browser), no bloqueando writes"
    - "Capa de lectura cross-tenant centralizada en un único helper service-role para que ninguna query olvide el filtro .eq('business_id', ...)"
    - "Trail de auditoría hermético: entrada con motivo (user.impersonate) + auditoría por carga del loader (user.impersonate.view) — ninguna vista del tenant sin traza, incluido acceso directo por URL"
    - "Presencia de integraciones como booleanos (getBusinessIntegrationStatus) — nunca el valor crudo del secreto bajo impersonación"
    - "Escape del shell dark del CRM vía clase scopeada (.impersonation-view) que re-declara neutrales light"

key-files:
  created:
    - "lib/impersonation.ts"
    - "app/(crm)/admin/negocios/[id]/ver/page.tsx"
  modified:
    - "app/(crm)/admin/_actions.schemas.ts"
    - "app/(crm)/admin/_actions.schemas.test.ts"
    - "app/(crm)/admin/_actions.ts"
    - "lib/business-secrets.ts"
    - "app/(crm)/admin/auditoria/auditoria-client.tsx"
    - "app/globals.css"

key-decisions:
  - "Motivo validado server-side con z.string().trim().min(10) — el dialog es refuerzo, no la garantía (D-07, Pitfall 5)"
  - "action='user.impersonate' (entrada, risk alto) + action='user.impersonate.view' (cada carga del loader, risk medio, sin motivo) son complementarias (D-08/D-09 + #2 trail completo)"
  - "Escape del shell dark con clase scopeada .impersonation-view (re-declara neutrales light de :root) en vez de variante Tailwind inexistente (not-dark)"
  - "getBusinessIntegrationStatus añadida a lib/business-secrets.ts como fuente de presencia para la sección config de Plan 03-02"

patterns-established:
  - "Server action de solo-auditoría (audit + redirect) sin mutación de negocio: única action del árbol de impersonación"
  - "Helper de lectura read-only por business_id con Promise.all + integrationStatus"

requirements-completed: [IMP-01, IMP-02, IMP-03]

# Metrics
duration: 24min
completed: 2026-06-20
status: complete
---

# Phase 3 Plan 01: Impersonación Read-Only (backbone de seguridad) Summary

**Backbone server-side de la impersonación read-only: action de entrada que audita el motivo (validado server-side) y navega sin mutar, capa de lectura cross-tenant service-role acotada por `business_id` centralizada en un helper, y loader RSC `/ver` que audita CADA carga y aplica la paleta del negocio escapando del shell dark del CRM.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-06-20T11:58:00Z (aprox.)
- **Completed:** 2026-06-20T12:22:00Z (aprox.)
- **Tasks:** 3
- **Files modified:** 8 (2 creados, 6 modificados)

## Accomplishments
- `startImpersonationSchema` + `startImpersonation`: motivo obligatorio min 10 validado server-side, audita `user.impersonate`/`risk='alto'`/`reason` y redirige a `/ver` SIN mutar ningún dato de negocio (D-02/D-04/D-08).
- `loadImpersonationData(businessId)`: lee todas las secciones operativas (turnos, servicios, equipo, consultorios, clientes con PII completa, time_blocks, schedule_exceptions) con service-role acotado por `business_id` (negocio por `id`) + `integrationStatus`; cero `owner_id`, cero clientes de sesión/browser, cero mutaciones, cero secretos crudos.
- `getBusinessIntegrationStatus`: presencia de integraciones (mercadopago/email/recaptcha/google) como booleanos sin exponer valores.
- Loader `/ver/page.tsx`: re-valida `requireAdmin` (Pitfall 2), `notFound()` si no existe, audita CADA carga con `user.impersonate.view`/`risk='medio'` (trail completo #2), aplica `PaletteScript` del negocio impersonado y escapa del shell dark del CRM con `.impersonation-view`.

## Tipo `ImpersonationData` (contrato para Plan 03-02)

`loadImpersonationData(businessId: string): Promise<ImpersonationData>` devuelve exactamente:

```ts
interface ImpersonationBusiness {
  id: string
  name: string
  slug: string
  plan: string | null
  plan_status: string | null
  palette: string | null
  theme: string | null
  font: string | null
}

interface BusinessIntegrationStatus {   // de @/lib/business-secrets
  mercadopago: boolean
  email: boolean
  recaptcha: boolean
  google: boolean
}

interface ImpersonationData {
  business: ImpersonationBusiness | null        // null → el loader hace notFound()
  appointments: Record<string, unknown>[]        // select('*, professionals(name), services(name, price, duration_minutes)') ordenado date/time
  services: Record<string, unknown>[]            // select('*') por created_at
  professionals: Record<string, unknown>[]       // select('*') por created_at
  locations: Record<string, unknown>[]           // select('*') por created_at
  clients: Record<string, unknown>[]             // select('*') por created_at (PII completa, D-15)
  timeBlocks: Record<string, unknown>[]          // select('*')
  scheduleExceptions: Record<string, unknown>[]  // select('*') por date
  integrationStatus: BusinessIntegrationStatus   // presencia conectado/desconectado
}
```

Notas para Plan 03-02:
- Las colecciones nunca son `null` (se normalizan a `[]`). `business` SÍ puede ser `null`, pero el loader ya hace `notFound()` antes de renderizar, así que los renderers pueden asumir `business` presente.
- Los renderers read-only deben construirse NUEVOS (sin `'use client'` que mute, sin `@/lib/supabase/client`, sin botones de acción) — los `*-client.tsx` del dashboard son clase (b) y NO deben derivarse (Pitfall 1). El montaje se deja marcado en `/ver/page.tsx` con `{/* Plan 03-02: ImpersonationBanner + renderers read-only por sección */}` dentro del wrapper `.impersonation-view`.
- El campo `integrationStatus` alimenta la sección config (presencia, no valores).

## Task Commits

1. **Task 1: startImpersonationSchema + startImpersonation action (audit + redirect, sin mutar)** — `310300e` (feat)
2. **Task 2: getBusinessIntegrationStatus + lib/impersonation.ts (capa de lectura scoped por business_id)** — `2a6d834` (feat)
3. **Task 3: /ver/page.tsx loader read-only + paleta + auditoría por carga + label del visor** — `d14cc17` (feat)

_Nota: Task 1 era TDD; schema y test son una unidad atómica de un solo módulo puro (los 5 tests del nuevo describe quedaron en verde en el mismo commit; no requirió RED separado porque schema+test se introdujeron juntos)._

## Files Created/Modified
- `lib/impersonation.ts` (nuevo) — `loadImpersonationData(businessId)` + tipos `ImpersonationData`/`ImpersonationBusiness`; capa de lectura read-only service-role acotada por `business_id`.
- `app/(crm)/admin/negocios/[id]/ver/page.tsx` (nuevo) — loader RSC read-only: guard + notFound + auditoría por carga + PaletteScript + escape del shell dark.
- `app/(crm)/admin/_actions.schemas.ts` — `startImpersonationSchema` + `StartImpersonationInput`.
- `app/(crm)/admin/_actions.schemas.test.ts` — describe `startImpersonationSchema` (5 casos).
- `app/(crm)/admin/_actions.ts` — server action `startImpersonation` (audit + redirect, sin mutación) + imports `redirect`/schema.
- `lib/business-secrets.ts` — `getBusinessIntegrationStatus` + `BusinessIntegrationStatus`.
- `app/(crm)/admin/auditoria/auditoria-client.tsx` — label `user.impersonate.view`.
- `app/globals.css` — clase scopeada `.impersonation-view` (escape del shell dark, neutrales light).

## Decisions Made
- **Escape del shell dark:** el plan sugería `:not(.dark)` semantics; el dark del CRM es class-based (`&:is(.dark *)`) y un wrapper sigue siendo descendiente de `.dark`, por lo que `not-dark` (utilidad inexistente) no neutralizaba nada. Se resolvió con una clase scopeada `.impersonation-view` en `globals.css` que RE-DECLARA los neutrales light de `:root`, mientras el acento sigue saliendo del `data-palette` que PaletteScript setea en `<html>`. Mirror del patrón ya usado por `.crm-shell` y `.frj-site`. (Encaja en la discreción del plan: "clases que reseteen background/foreground al tema del negocio".)
- El resto se ejecutó exactamente como el plan especifica.

## Deviations from Plan

None - plan executed exactly as written. (La elección de `.impersonation-view` sobre `:not(.dark)` está dentro de la discreción explícita del plan para resolver el escape del shell dark, no es una desviación de alcance.)

## Issues Encountered
- **Greps de prohibición sensibles a comentarios:** las acceptance de Task 2 exigen `owner_id`==0, `@/lib/supabase/client|server`==0 y `getBusinessSecrets\b`==0 sobre TODO el archivo. La primera redacción de los comentarios de `lib/impersonation.ts` mencionaba esos tokens en prosa explicativa y hacía fallar los greps mecánicos. Se reescribieron los comentarios para describir las prohibiciones sin nombrar los tokens literales; los greps quedaron en 0 sin perder la documentación del "por qué". Sin impacto funcional.

## Known Stubs
- El cuerpo de `/ver/page.tsx` renderiza solo `business.name` + un marcador comentado para el banner y los renderers read-only. Es un stub INTENCIONAL y declarado por el plan: el banner (`ImpersonationBanner`) y los renderers por sección los provee **Plan 03-02**. No bloquea el objetivo de este plan (backbone de seguridad: action + capa de lectura + loader auditado).

## Verification
- `npx vitest run "app/(crm)/admin/_actions.schemas.test.ts"` → 24 tests en verde (5 nuevos del schema de impersonación).
- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npx eslint` sobre los 6 archivos nuevos/modificados de código → exit 0, sin errores. (Los 590 problemas que reporta `npm run lint` son pre-existentes y viven en `design_handoff_forjo_rebrand/` y otros archivos no tocados por este plan — fuera de scope.)
- Greps de prohibición read-only-by-construction + scope: todos pasan (body de `startImpersonation` sin mutaciones; `lib/impersonation.ts` con 9× `.eq('business_id',`, `owner_id`==0, mutaciones==0, clientes de sesión/browser==0, `getBusinessSecrets\b`==0; loader sin imports de clientes/`*-client.tsx`, `notFound()` antes del `logAudit`).

## User Setup Required
None - sin configuración de servicios externos. Sin migración SQL (audit_log ya existe en migr. 031). Cero paquetes npm nuevos.

## Next Phase Readiness
- Backbone de seguridad listo: la entrada audita con motivo, la lectura está acotada por `business_id` sin fuga cross-tenant y cada carga de `/ver` deja traza.
- **Plan 03-02** puede consumir `loadImpersonationData(id)` (tipo `ImpersonationData` documentado arriba) para montar `ImpersonationBanner` + renderers read-only NUEVOS por sección dentro del wrapper `.impersonation-view`, y la sección config con `integrationStatus`.
- Pendiente fuera de fase (D-14): revisión legal formal de impersonación antes del primer cliente del vertical salud — no bloquea el build.

## Self-Check: PASSED

- Archivos creados verificados en disco: `lib/impersonation.ts`, `app/(crm)/admin/negocios/[id]/ver/page.tsx` (+ modificados).
- Commits verificados en git log: `310300e`, `2a6d834`, `d14cc17`.

---
*Phase: 03-impersonaci-n-read-only*
*Completed: 2026-06-20*
