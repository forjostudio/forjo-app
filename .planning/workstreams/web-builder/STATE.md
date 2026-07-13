---
gsd_state_version: 1.0
milestone: v0.18
milestone_name: CMS Publish / Go-live
status: verifying
stopped_at: Completado 15-03-PLAN.md — fase 15 lista para verify-work
last_updated: "2026-07-13T12:59:56.651Z"
last_activity: 2026-07-13 -- Phase 15 plan 02 completo (3 Server Actions + compare canónico)
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (sección "Current Milestone (workstream `web-builder`): v0.18 CMS Publish / Go-live")

**Core value:** Un negocio NUNCA puede leer ni modificar datos de otro, y los flujos de pago no pueden ser forzados ni falsificados. (v0.18 separa borrador de publicado SIN debilitar el write path owner-only que aseguró v0.16.)
**Current focus:** Phase 15 — Borrador y publicación (núcleo)

## Current Position

Phase: 15 (Borrador y publicación (núcleo)) — EXECUTING
Plan: 3 of 3
Status: Phase complete — ready for verification
Last activity: 2026-07-13 -- Phase 15 plan 02 completo (3 Server Actions + compare canónico)

Progreso: `[░░░░░░░░░░] 0/3 fases`

## Performance Metrics

**Velocity:**

- Total plans completed (v0.18): 2
- Average duration: 20 min
- Total execution time: 0.7 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 15 | 2/3 | 40 min | 20 min |
| 16 | TBD | - | - |
| 17 | TBD | - | - |

**Recent Trend:**

- Último milestone (v0.16, Phases 11-14): 9 plans, 4 fases, ~3 días.
- Trend: —

*Updated after each plan completion*
| Phase 15 P03 | 25min | 3 tasks | 2 files |

## Accumulated Context

### Decisions

Decisiones LOCKED del milestone v0.18 (no re-litigar en discuss-phase) — de PROJECT.md:

- [v0.18]: **`landing_config` = LO PUBLICADO; `landing_draft` = lo que se edita.** `/[slug]` lee SOLO lo publicado. Publicar copia el borrador encima.
- [v0.18]: **Migración ADITIVA** (la próxima libre es la **050**; 049 es la última aplicada): `landing_draft` nace copiando `landing_config`. Las landings ya al aire NO se bajan (PUB-08). Se valida con `supabase db reset` local; a prod se aplica A MANO, coordinada con el deploy (nunca `db push`).
- [v0.18]: **Go-live IMPLÍCITO** — publicar por primera vez = salir al aire. NO se agrega columna `web_live`: menos estado, nada que se desincronice del contenido. Se apoya en `parseLandingConfig(null) → null` = negocio legacy → reserva simple (camino que YA existe y está probado).
- [v0.18]: **La skill/script escribe el BORRADOR**, no lo publicado (SKILL-07). Es lo que convierte a este milestone en el prerequisito del auto-armado con el pago del add-on.
- [v0.18]: **Build order LOCKED: 15 (núcleo publish) → 16 (skill → borrador) → 17 (exponer el CMS).** PUB-01 va ÚLTIMO: exponer el editor a clientes reales mientras cada guardado todavía sale al aire sería el error exacto que el milestone viene a evitar.
- [v0.18]: Se mantienen TODOS los invariantes de v0.16 — write path **owner-only** (session client anon+cookies + RLS por tenant + Zod estricto reject-on-invalid), **NUNCA service-role** en la superficie web de escritura, booking = **caja negra**, fail-safe del config (roto → `DEFAULT_LANDING_CONFIG`, `/[slug]` nunca 500ea).
- [v0.18]: El gate del add-on (`has_web_custom`) se chequea en la **Server Action**, no solo en la page: gatear solo la page es cosmético, un POST directo la saltea. La columna está protegida por el trigger `businesses_protect_admin_columns` (revierte en silencio los UPDATE no-service_role).

Carryover relevante de v0.10/v0.16 (base sobre la que se construye):

- [v0.10]: `landing_config` viaja por la vista `public_businesses` **por columnas explícitas** — sin re-abrir la fuga de secretos de v0.9. `landing_draft` NO puede entrar ahí.
- [v0.10]: `parseLandingConfig` total — `null → null` (passthrough legacy); `presente-pero-inválido → DEFAULT_LANDING_CONFIG`; `safeParse` exclusivo; `.strip()` de claves desconocidas.
- [v0.16 / Phase 13]: `saveLandingConfig` (`app/(dashboard)/web/_landing-actions.ts`) = Server Action owner-only, `business_id` de la SESIÓN, `parseLandingConfigForWrite` (`lib/landing/write.ts`), overwrite-total con `.select('id')`. SECURED 7/7. Es el molde de publish/descartar.
- [v0.16 / Phase 14]: borrador en memoria + `savedBaseline` + `isDirty` ya existen en `web-client.tsx`; los mutadores puros viven en `lib/landing/editor-draft.ts` (testeados). PUB-05 reusa ese andamiaje, no lo reinventa.
- [v0.17]: el gate `has_web_custom` YA está enforced en la Server Action; lo que resta de PUB-01 es **retirar el flag global `CMS_ENABLED`** y exponer la entrada en el panel.
- [Phase 15-01]: businesses.landing_draft = columna jsonb nullable sin DEFAULT (migr. 050, aditiva + backfill idempotente). Hereda la RLS de businesses; la vista public_businesses NO se toca y 4 tests anon-key lo prueban. Prod: aplicar A MANO + NOTIFY pgrst ANTES del deploy.
- [Phase 15-02]: `saveLandingDraft(input)` escribe el BORRADOR (el nombre `saveLandingConfig` ya no existe). `publishLanding()` y `discardLandingDraft()` son de **CERO argumentos**: copia server-side entre columnas (SELECT + UPDATE — PostgREST no hace `SET col_a = col_b`), con Zod estricto sobre el borrador LEÍDO DE LA DB al publicar (`invalid_draft`). Cero service-role, cero `revalidatePath` (`/[slug]` es force-dynamic).
- [Phase 15-02]: **Desviación declarada de D-03** — el compare draft-vs-published usa un stringify **CANÓNICO** (`configsEqual` en `lib/landing/editor-draft.ts`), no `JSON.stringify` crudo: Postgres reordena las claves del `jsonb` y el compare crudo dejaría "Guardado — sin publicar" trabado para siempre. Misma semántica (estado derivado del contenido, sin flag ni timestamp), otro mecanismo. NO "simplificar" de vuelta.
- [Phase 15-02]: contrato page → client = `initialDraft` (`landing_draft ?? landing_config`, coalesce defensivo) + `publishedConfig` (`landing_config ?? null`, donde **null ⇒ nunca publicó**: dispara go-live y el empty-state).
- [Phase ?]: 15-03: publicar encadena guardar → publicar SIEMPRE (D-04); el estado post-publicacion se resuelve en memoria (cero revalidatePath / router.refresh)

### Pending Todos

- [Operativo v0.9 — carryover]: Cargar los 4 GitHub Secrets para que los tests de aislamiento (TEST-01) corran en CI. Phase 15 extiende ese test (`landing_draft` no se filtra a `anon`, no se cruza entre tenants); el CI debe estar verde.

### Blockers/Concerns

- [RAMA — OPERATIVO / CRÍTICO]: El código del web-builder vive en la rama **`gsd/gestion-rebrand`**, NO en `gsd/web-builder` (stale). `branching_strategy: none` → execute-phase NO cambia de rama: hacer checkout ANTES.
- [WORKSTREAM POINTER — OPERATIVO]: Antes de correr `/gsd:*-phase N --ws web-builder` hay que setear el pointer activo (`gsd-tools query workstream set web-builder`). El flag `--ws` solo scopea una llamada suelta; los subagentes ejecutores resuelven STATE/ROADMAP por el pointer activo.
- [Phase 15 — SECURITY-SENSITIVE]: migración + write path. `landing_draft` NO se expone a `anon` (ni por la vista pública), publicar/descartar son copia server-side (nunca un config del body como "lo publicado"), Zod estricto, cero service-role en la web. → correr `/gsd:secure-phase 15`.
- [Phase 15 — REGRESIÓN]: PUB-08 es el riesgo real de la migración. Un negocio ya publicado tiene que ver su landing **idéntica** después del deploy, y abrir el editor viendo una copia fiel. Verificar con datos reales antes de prod.
- [Phase 17 — SECURITY-SENSITIVE]: sacar `CMS_ENABLED` retira el kill-switch fail-closed; `has_web_custom` queda como ÚNICO gate y tiene que sostener solo (chequeado en CADA acción, `business_id` de sesión, trigger de la columna verificado). Barrer restos del flag: ninguna ruta puede quedar con un chequeo muerto que la deje abierta. → correr `/gsd:secure-phase 17`.
- [Next 16 — carryover]: consultar `node_modules/next/dist/docs/` antes de asumir comportamiento (server actions, revalidación/cache de RSC bajo `force-dynamic`).

### Roadmap Evolution

- [2026-07-07] Roadmap v0.16 creado: 4 fases (11-14), coarse, 15/15 requirements mapeados. SHIPPED 2026-07-10.
- [2026-07-12] Roadmap v0.18 creado: 3 fases (15-17), coarse, 9/9 requirements mapeados. Orden LOCKED núcleo → skill → exposición.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| AUTO | Auto-armado de la web al confirmarse el pago del add-on (MercadoPago) | Deferred | v0.18 scope lock — milestone propio; v0.18 es su prerequisito |
| CMS | Video de fondo en el hero | Blocked | Infra: bucket `landing-assets` solo imágenes ≤2 MB (config en el dashboard de Supabase) |
| CMS | Toggle "foto ancha" en la galería del editor | Deferred | Cambio de contrato de datos (el flag no existe en el schema) |
| CMS | Confirm-on-exit por navegación interna | Deferred | Interceptar la nav del App Router de Next 16 es no-trivial |
| PUB | Columna `web_live` / interruptor explícito on-off | Out of scope | El go-live implícito logra lo mismo con menos estado |
| PUB | Historial de versiones / rollback | Out of scope | El borrador cubre el grueso del valor |
| PUB | Preview compartible por link | Out of scope | Agrega superficie pública nueva sin desbloquear nada |
| FU | Rediseño premium full-bleed / layout Meitre + tuning del "feel premium" del motion | Deferred | Pasada de estilo design-first aparte |
| OPS | Venta in-app + URLs por-negocio / dominio propio (OPS-01/02/03) | Deferred | v0.16 scope lock |
| BUG | Modal "Elegí tu plan" muestra "99 agendas" en prod (`NEXT_PUBLIC_PLANS_UNLIMITED`) | Deferred | Fuera del web-builder |

## Session Continuity

Last session: 2026-07-13T12:59:56.632Z
Stopped at: Completado 15-03-PLAN.md — fase 15 lista para verify-work
Resume file: None

## Operator Next Steps

- `gsd-tools query workstream set web-builder` (pointer activo) + checkout de `gsd/gestion-rebrand`
- Docker corriendo + `.env.test.local` apuntando al Supabase local (si no, los tests de aislamiento salen `skipped` = falso positivo de seguridad en una fase security-sensitive)
- `/gsd:execute-phase 15 --ws web-builder`
- Después: `/gsd:secure-phase 15` (fase SECURITY-SENSITIVE) y `/gsd:verify-work 15`
