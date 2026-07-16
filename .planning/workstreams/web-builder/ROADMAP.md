# Roadmap: Forjo App — Web Builder (workstream `web-builder`)

## Milestones

- ✅ **v0.9 Security Hardening** — Phases 1-5 (shipped 2026-06-17, workstream base)
- ✅ **v0.10 Web Builder** — Phases 6-10 (shipped 2026-06-23, archivado en `milestones/v0.10-*`)
- ✅ **v0.16 Web Builder — Ampliación + CMS** — Phases 11-14 (shipped 2026-07-10, archivado en `milestones/v0.16-*`)
- ✅ **v0.17 Landing Polish + CMS usable** — sin fases GSD (polish reactivo, shipped 2026-07-12 — ver `MILESTONES.md`)
- ✅ **v0.18 CMS Publish / Go-live** — Phases 15-17 (shipped 2026-07-16, archivado en `milestones/v0.18-*`)

Detalle archivado: [`milestones/v0.9-ROADMAP.md`](../../milestones/v0.9-ROADMAP.md) · [`milestones/v0.10-ROADMAP.md`](../../milestones/v0.10-ROADMAP.md) · [`milestones/v0.16-ROADMAP.md`](../../milestones/v0.16-ROADMAP.md) · [`milestones/v0.18-ROADMAP.md`](../../milestones/v0.18-ROADMAP.md).

## Phases

**Phase Numbering:**

- El workstream `web-builder` **continúa** la numeración: v0.18 cerró en Phase 17, el próximo milestone arranca en **Phase 18**.
- Integer phases: trabajo planeado del milestone.
- Decimal phases (18.1, …): inserciones urgentes (marcadas INSERTED).

<details>
<summary>✅ v0.9 Security Hardening (Phases 1-5) — SHIPPED 2026-06-17</summary>

- [x] Phase 1: RLS Lockdown + Secret Isolation (5/5 plans, SEC-01) — completed 2026-06-16
- [x] Phase 2: MP Webhook Signature + Amount Check (2/2 plans, SEC-02) — completed 2026-06-16
- [x] Phase 3: Admin Endpoint Hardening (1/1 plan, SEC-03) — completed 2026-06-16
- [x] Phase 4: Plan Gating on Public Booking (1/1 plan, SEC-04) — completed 2026-06-17
- [x] Phase 5: Vitest Test Suite (2/2 plans, TEST-01) — completed 2026-06-17

</details>

<details>
<summary>✅ v0.10 Web Builder (Phases 6-10 + 8.1) — SHIPPED 2026-06-23</summary>

- [x] Phase 6: Schema, Storage & Safe Foundation (2/2 plans) — completed 2026-06-17
- [x] Phase 7: Renderer & Section Components (4/4 plans) — completed 2026-06-18
- [x] Phase 8: Theming (2/2 plans) — completed 2026-06-19
- [x] Phase 8.1: Re-diseño premium del template (full-bleed editorial) (INSERTED, 4/4 plans) — completed 2026-06-20
- [x] Phase 9: SEO, OG & Performance (3/3 plans) — completed 2026-06-22
- [x] Phase 10: Skill `forjo-web-builder` (3/3 plans) — completed 2026-06-23

</details>

<details>
<summary>✅ v0.16 Web Builder — Ampliación + CMS (Phases 11-14) — SHIPPED 2026-07-10</summary>

- [x] Phase 11: Skill — modo edición + fuentes de contenido (2/2 plans, SKILL-05/06) — completed 2026-07-07
- [x] Phase 12: Premium motion + fotos en la reserva (2/2 plans, MOTION-01..04, RSV-01/02) — completed 2026-07-07
- [x] Phase 13: CMS foundation — write path owner-only + flag (1/1 plan, EDIT-05/07) — completed 2026-07-08
- [x] Phase 14: CMS editor UI (4/4 plans, EDIT-01..04, EDIT-06) — completed 2026-07-09

Detalle completo archivado en [`milestones/v0.16-ROADMAP.md`](../../milestones/v0.16-ROADMAP.md).

</details>

<details>
<summary>✅ v0.18 CMS Publish / Go-live (Phases 15-17) — SHIPPED 2026-07-16</summary>

**Build order LOCKED:** núcleo borrador/publicar (15) → la skill escribe el borrador (16) → **recién ahí** se expone el CMS (17). El orden no fue preferencia: exponer el editor mientras cada guardado salía al aire era exactamente el error que el milestone vino a evitar.

- [x] Phase 15: Borrador y publicación (núcleo) (3/3 plans, PUB-03..PUB-08) — completed 2026-07-13 — SECURED 18/18
- [x] Phase 16: La web nace como borrador (skill del operador) (3/3 plans, SKILL-07/08) — completed 2026-07-13
- [x] Phase 17: Exponer el CMS a clientes reales (2/2 plans, PUB-01) — completed 2026-07-15 — SECURED 10/10

Migraciones: **050** (`businesses.landing_draft`, aditiva) + **051** (gate del upload en la RLS de `landing-assets`) — ambas aplicadas a prod a mano.

Detalle completo archivado en [`milestones/v0.18-ROADMAP.md`](../../milestones/v0.18-ROADMAP.md).

</details>

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 11. Skill — modo edición + fuentes | v0.16 | 2/2 | Complete | 2026-07-07 |
| 12. Premium motion + fotos en la reserva | v0.16 | 2/2 | Complete | 2026-07-07 |
| 13. CMS foundation — write path owner-only + flag | v0.16 | 1/1 | Complete | 2026-07-08 |
| 14. CMS editor UI | v0.16 | 4/4 | Complete | 2026-07-09 |
| 15. Borrador y publicación (núcleo) | v0.18 | 3/3 | Complete | 2026-07-13 |
| 16. La web nace como borrador (skill) | v0.18 | 3/3 | Complete | 2026-07-13 |
| 17. Exponer el CMS a clientes reales | v0.18 | 2/2 | Complete | 2026-07-15 |

---
*Next: `/gsd:new-milestone --ws web-builder`*
