---
gsd_state_version: 1.0
milestone: v0.16
milestone_name: Web Builder — Ampliación + CMS
status: planning
stopped_at: Phase 11 planned (2 plans, verification passed)
last_updated: "2026-07-07T09:49:00.000Z"
last_activity: 2026-07-07 — Phase 11 planificada (2 planes, 2 waves) — plan-checker PASS
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 2
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-07)

**Core value:** Un negocio NUNCA puede leer ni modificar datos de otro, y los flujos de pago no pueden ser forzados ni falsificados. (v0.16 suma edición self-serve del landing + motion premium SIN debilitar este invariante.)
**Current focus:** Phase 11 planificada (2 planes). Próximo: `/gsd:execute-phase 11 --ws web-builder`.

## Current Position

Phase: 11 — Skill: modo edición + fuentes de contenido (planned)
Plan: 11-01 (Wave 1), 11-02 (Wave 2) — verification PASSED
Status: Phase 11 planned — 2 plans, plan-checker PASS; SKILL-05 + SKILL-06 cubiertos
Last activity: 2026-07-07 — Phase 11 planificada (plan-checker PASS)

## Performance Metrics

**Velocity:**

- Total plans completed (v0.16): 0
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 11 | TBD | - | - |
| 12 | TBD | - | - |
| 13 | TBD | - | - |
| 14 | TBD | - | - |

**Recent Trend:**

- Last 5 plans: — (v0.10 cerrado; métricas históricas en milestones/v0.10)
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Decisiones LOCKED del milestone v0.16 (no re-litigar en discuss-phase) — de PROJECT.md + `forjo-webbuilder-skill-ampliacion.md`:

- [v0.16]: Premium DENTRO del modelo actual (web-scrolling = referencia de movimiento, NO output HTML; bespoke per-cliente descartado)
- [v0.16]: `prefers-reduced-motion` off → estático SIEMPRE
- [v0.16]: **Booking = caja negra** — sin transform/overflow/scroll-timeline alrededor del widget (vale para MOTION y RSV); el motion/las fotos van AROUND, nunca dentro del contenedor de reserva
- [v0.16]: Fail-safe motion/config — `motion` o `landing_config` ausente/roto → estático actual, cero regresión; `landing_config` null sigue renderizando la página pre-v0.10
- [v0.16]: LCP del hero no se degrada (imagen sigue `priority`)
- [v0.16]: **El CMS escribe `landing_config` por un path autenticado owner-only (RLS por tenant + Zod)** — NUNCA service-role ni endpoint anónimo en la superficie web (invariante multi-tenant, Core Value)
- [v0.16]: CMS detrás de feature flag este milestone — NO expuesto a clientes; sin publish/go-live (EDIT-07 es el borde; publish → v2 PUB-01/02)
- [v0.16]: Build order LOCKED — skill (11) → motion+RSV schema (12) → CMS foundation (13) → CMS editor UI (14); el schema (`motion` + galería de reserva) existe ANTES del CMS porque el editor lo expone
- [v0.16]: Set de secciones FIJO — EDIT-03 solo reordena/togglea, sin layout libre / drag-and-drop de secciones nuevas
- [v0.10 carryover]: `landing_config` viaja por la vista `public_businesses` por columnas explícitas — sin re-abrir la fuga de secretos de v0.9
- [v0.10 carryover]: `parseLandingConfig` total — `null → null` (passthrough legacy); `presente-pero-inválido → DEFAULT_LANDING_CONFIG`; `safeParse` exclusivo; `.strip()` de claves desconocidas

### Pending Todos

- [Operativo v0.9 — carryover]: Cargar los 4 GitHub Secrets para que los tests de aislamiento (TEST-01) corran en CI. Phase 13 extiende ese test (write path owner-only); el CI debe estar verde.

### Blockers/Concerns

[Riesgos de diseño del milestone — mitigados por el orden de fases y las threat notes del ROADMAP]

- [Phase 12 — REGRESIÓN]: El motion y la galería RSV NO pueden envolver `BookingClient` en transform/overflow/scroll-timeline (rompe vaul/date-picker/sonner — Pitfall 4/8 de v0.10). Motion solo en secciones editoriales; galería FUERA del `<section id="reservar">` interactivo. Verificar reserva real con y sin seña.
- [Phase 12 — FAIL-SAFE]: `motion` ausente/inválido → estático; `landing_config` null → legacy byte-idéntico. Piso no-negociable de todo path de render.
- [Phase 13 — SEGURIDAD / SECURITY-SENSITIVE]: El write path del CMS debe ser owner-only por RLS + `.eq('business_id', …)` de la sesión; PROHIBIDO service-role o endpoint anónimo en la web; Zod `safeParse` + `.strip()` antes de escribir (no re-abrir la fuga de secretos de v0.9). Extender el test de aislamiento anon-key al write path. Flag apaga la ruta entera. → correr `/gsd:secure-phase 13`.
- [Phase 14 — STORAGE]: Upload de imágenes SOLO bajo `{business_id}/` en `landing-assets` (RLS owner-write del bucket, ya existe de v0.10); rechazar escritura fuera del prefijo del dueño. Preview no expone datos de otro tenant; booking sigue caja negra dentro del preview.
- [Next 16 — carryover]: consultar `node_modules/next/dist/docs/` antes de asumir comportamiento (server actions, cache de RSC bajo `force-dynamic`, scroll-driven animations en el App Router).

### Roadmap Evolution

- [2026-07-07] Roadmap v0.16 creado: 4 fases (11-14) desde Phase 11, granularidad coarse, 15/15 requirements mapeados.

## Deferred Items

Items reconocidos y diferidos a milestones posteriores (v2):

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| PUB | Exponer CMS a clientes en el nav (PUB-01) | Deferred | v0.16 scope lock |
| PUB | Flujo publish/go-live draft→publicado (PUB-02) | Deferred | v0.16 scope lock |
| OPS | Venta in-app + `landing_status` (OPS-01) | Deferred | v0.16 scope lock |
| OPS | URLs por-negocio + dominio propio (OPS-02/03) | Deferred | v0.16 scope lock |
| FU | Rediseño premium full-bleed del template (FU-2) | Deferred | milestone de estilo aparte |
| FU | Alto del drawer de reservas en mobile (FU-1) | Deferred | polish de booking aparte |
| BESPOKE | Sitio standalone vía API (D6) | Deferred | milestone aparte |

## Session Continuity

Last session: 2026-07-07T04:08:21.856Z
Stopped at: Phase 11 planned (2 plans, plan-checker PASS)
Resume file: .planning/workstreams/web-builder/phases/11-skill-modo-edici-n-fuentes-de-contenido/11-01-PLAN.md

## Operator Next Steps

- Execute Phase 11 with `/gsd:execute-phase 11 --ws web-builder`
