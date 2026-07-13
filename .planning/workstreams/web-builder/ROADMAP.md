# Roadmap: Forjo App — Web Builder (workstream `web-builder`)

## Milestones

- ✅ **v0.9 Security Hardening** — Phases 1-5 (shipped 2026-06-17, workstream base)
- ✅ **v0.10 Web Builder** — Phases 6-10 (shipped 2026-06-23, archivado en `milestones/v0.10-*`)
- ✅ **v0.16 Web Builder — Ampliación + CMS** — Phases 11-14 (shipped 2026-07-10, archivado en `milestones/v0.16-*`)
- ✅ **v0.17 Landing Polish + CMS usable** — sin fases GSD (polish reactivo, shipped 2026-07-12 — ver `MILESTONES.md`)
- 🚧 **v0.18 CMS Publish / Go-live** — Phases 15-17 (in progress)

Detalle archivado: [`milestones/v0.9-ROADMAP.md`](../../milestones/v0.9-ROADMAP.md) · [`milestones/v0.10-ROADMAP.md`](../../milestones/v0.10-ROADMAP.md) · [`milestones/v0.16-ROADMAP.md`](../../milestones/v0.16-ROADMAP.md).

**Milestone Goal (v0.18):** Que el dueño edite su web **sin que cada tecla salga al aire**, y que su web salga a producción **cuando él lo decide**. `landing_config` pasa a significar **lo PUBLICADO** y `landing_draft` **lo que se está editando**; la página pública lee SOLO lo publicado y publicar copia el borrador encima. Con eso, el CMS se puede abrir a clientes reales (`has_web_custom` como único gate) y la web que arma la skill nace como borrador esperando aprobación — el prerequisito del auto-armado con el pago del add-on.

## Phases

**Phase Numbering:**

- El workstream `web-builder` **continúa** la numeración: v0.16 cerró en Phase 14, este milestone arranca en **Phase 15**.
- Integer phases (15, 16, 17): trabajo planeado del milestone.
- Decimal phases (15.1, …): inserciones urgentes (marcadas INSERTED).

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

### 🚧 v0.18 CMS Publish / Go-live (In Progress)

**Build order LOCKED:** núcleo borrador/publicar (15) → la skill escribe el borrador (16) → **recién ahí** se expone el CMS (17).

> **Por qué PUB-01 va ÚLTIMO:** exponer el editor a clientes reales mientras cada guardado todavía sale al aire es exactamente el error que este milestone viene a evitar. El CMS solo se abre cuando (a) guardar ya no publica y (b) la web armada por la skill nace como borrador. El orden no es preferencia: es el contenido del milestone.

- [ ] **Phase 15: Borrador y publicación (núcleo)** - `landing_draft` (migración aditiva) + el CMS escribe el borrador + botón Publicar/Descartar + el estado real de "cambios sin publicar"; la web pública sigue leyendo SOLO lo publicado
- [ ] **Phase 16: La web nace como borrador (skill del operador)** - `scripts/setup-landing.ts` escribe el borrador, no lo publicado; `--inspect` muestra borrador y publicado por separado
- [ ] **Phase 17: Exponer el CMS a clientes reales** - Se retira el flag global `CMS_ENABLED`; `has_web_custom` queda como ÚNICO gate del editor

## Phase Details

### Phase 15: Borrador y publicación (núcleo)

**Goal**: El dueño puede editar y guardar su web sin que nada de eso salga al aire, y su web pública cambia solo cuando él aprieta "Publicar". `landing_config` = lo publicado, `landing_draft` = lo que se está editando; `/[slug]` lee SOLO lo publicado. Es el núcleo del milestone: sin esto, ni la skill ni la exposición del CMS son seguras de entregar. **Fase security-sensitive: toca la migración y el write path owner-only que aseguró v0.16 (Core Value).**
**Depends on**: Nothing nuevo (opera sobre el CMS de v0.16 Phases 13-14, ya shipped)
**Requirements**: PUB-03, PUB-04, PUB-05, PUB-06, PUB-07, PUB-08
**Success Criteria** (what must be TRUE):

  1. El dueño guarda un cambio en el editor y su web pública **no cambia**: `/[slug]` sigue mostrando exactamente lo que estaba antes.
  2. El dueño toca "Publicar" y su web pública pasa a mostrar el cambio (borrador → publicado, en un solo movimiento).
  3. El editor distingue **guardado** de **publicado**: le avisa al dueño que tiene cambios sin publicar, y deja de avisarle después de publicar.
  4. El dueño descarta el borrador y el editor vuelve a mostrar exactamente lo que está al aire.
  5. Cero sorpresas en la transición: un negocio que ya tenía su landing publicada la sigue viendo idéntica (y abre el editor viendo una copia fiel de lo publicado); un negocio que nunca publicó sigue viendo su página de reservas de siempre, y al publicar por primera vez su web a medida la reemplaza (go-live implícito).

**Plans**: 2/3 plans executed

Plans:
**Wave 1**

- [x] 15-01-PLAN.md — Migración 050 (`businesses.landing_draft`, aditiva) + 4 tests de aislamiento del borrador (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 15-02-PLAN.md — Write path: `saveLandingDraft` / `publishLanding()` / `discardLandingDraft()` + los 2 configs en `page.tsx` + compare canónico (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 15-03-PLAN.md — Barra publish (3 acciones · 3 estados), dialogs de go-live y descarte, toasts, token `--warning` (wave 3)

**UI hint**: yes

**Threat note** (SECURITY-SENSITIVE — correr `/gsd:secure-phase 15`):

- **Migración 050 (la próxima libre; 049 es la última aplicada)** — ADITIVA y no destructiva: `landing_draft jsonb` nace copiando `landing_config` (`UPDATE … SET landing_draft = landing_config`). Nadie se cae del aire (PUB-08). Se valida con `supabase db reset` local; a prod se aplica **a mano**, coordinada con el deploy (nunca `db push`).
- **RLS de la columna nueva**: `landing_draft` es contenido del tenant y va sobre `businesses` — hay que verificar explícitamente que **no se filtre a `anon`**. La vista pública (`public_businesses`) expone columnas explícitas: el borrador **NO** puede entrar ahí. El test de aislamiento anon-key (TEST-01, `test/isolation.test.ts`) se extiende: anon no lee `landing_draft` de nadie, y un dueño no lee/escribe el borrador de otro negocio.
- **Write path**: todo (guardar borrador, publicar, descartar) pasa por la Server Action **owner-only** existente (session client anon+cookies, RLS activo, `business_id` de la SESIÓN, Zod estricto `parseLandingConfigForWrite` reject-on-invalid). **PROHIBIDO service-role en la superficie web.** Publicar es copia server-side de draft→published: nunca se acepta un config del body como "lo que se publica".
- **Gate del add-on**: publicar/descartar se gatean en la **acción**, igual que guardar — gatear solo la page es cosmético, un POST directo la saltea. `has_web_custom` sigue protegida por el trigger `businesses_protect_admin_columns` (revierte en silencio cualquier UPDATE no-service_role).
- **Fail-safe intacto**: `parseLandingConfig(null) → null` = negocio legacy → `/[slug]` renderiza la reserva simple (PUB-07 se apoya en ese camino, que ya existe y está probado); presente-pero-inválido → `DEFAULT_LANDING_CONFIG` (la pública nunca 500ea). Booking = caja negra.

### Phase 16: La web nace como borrador (skill del operador)

**Goal**: La web que arma el operador con la skill queda esperando la aprobación del dueño en vez de salir cruda al público. `scripts/setup-landing.ts` escribe `landing_draft`; publicar sigue siendo una decisión del dueño desde su panel. Es la pieza que convierte a este milestone en el prerequisito real del auto-armado con el pago del add-on.
**Depends on**: Phase 15 (necesita que `landing_draft` exista y que publicar/descartar funcionen desde el panel)
**Requirements**: SKILL-07, SKILL-08
**Success Criteria** (what must be TRUE):

  1. El operador corre la skill sobre un negocio y la web armada **no aparece** en `/[slug]`: aparece en el editor del dueño como borrador sin publicar (y el negocio que nunca publicó sigue mostrando su reserva simple mientras tanto).
  2. El dueño revisa esa web en su editor y, al publicarla, recién ahí sale al aire — cerrando el circuito operador → dueño → público.
  3. `--inspect` muestra **borrador y publicado por separado**, de modo que el operador sabe qué está al aire y qué quedó pendiente de aprobación.

**Plans**: TBD

**Threat note**: Bajo riesgo de aislamiento — la skill NO abre superficie web nueva: sigue escribiendo por el **script local service-role** de v0.10 (fuera del runtime web), con checkpoint humano pre-escritura. El cuidado propio de esta fase es de **regresión de producto**: el script no debe tocar `landing_config` de un negocio que ya está publicado (escribir el borrador no puede pisar lo que está al aire), y el modo edición de Phase 11 debe partir del borrador, no de lo publicado, para no re-publicar sin querer.

### Phase 17: Exponer el CMS a clientes reales

**Goal**: El add-on es el único gate: un dueño con `has_web_custom` entra a su editor desde el panel sin que exista ningún flag de entorno, y uno sin el add-on no llega ni escribiendo directo. Va última a propósito: recién acá el CMS es seguro de mostrar, porque guardar ya no publica (15) y la web armada nace como borrador (16). **Fase security-sensitive: se retira un kill-switch fail-closed y queda un solo gate en pie.**
**Depends on**: Phase 16 (y por lo tanto Phase 15) — el orden es una decisión LOCKED del milestone, no una preferencia
**Requirements**: PUB-01
**Success Criteria** (what must be TRUE):

  1. Un dueño con el add-on `has_web_custom` encuentra la entrada a su web en el panel y edita/publica sin que ninguna variable de entorno lo habilite.
  2. Un dueño sin el add-on no llega al editor **ni logra escribir su landing aunque postee directo a la Server Action** (el gate vive en la acción, no solo en la page).
  3. Para todo lo demás no cambia nada: los negocios sin add-on siguen viendo su `/[slug]` exactamente igual, y las landings publicadas siguen al aire.

**Plans**: TBD

**Threat note** (SECURITY-SENSITIVE — correr `/gsd:secure-phase 17`): sacar `CMS_ENABLED` **retira el kill-switch global fail-closed** que hasta hoy apagaba la ruta entera. Al quedar `has_web_custom` como único gate, ese gate tiene que sostener solo: (a) chequeado en **cada** Server Action del CMS (guardar, publicar, descartar, upload), no solo en la page; (b) resuelto contra el `business_id` de la **sesión** (nunca del body); (c) el trigger `businesses_protect_admin_columns` debe seguir impidiendo que el dueño se auto-otorgue el flag (revierte en silencio los UPDATE no-service_role) — verificarlo, no asumirlo. Además: el editor pasa de ser inalcanzable a ser una superficie autenticada real → los uploads a `landing-assets/{business_id}/` y el preview vuelven a estar en el radar de aislamiento (heredado de Phase 14, SECURED 16/16). Barrer restos del flag: ninguna ruta puede quedar con un chequeo muerto que la deje abierta.

## Progress

**Execution Order:**
Phases execute in numeric order: 15 → 16 → 17 (el orden es LOCKED: exponer el CMS antes del núcleo publish sería el bug del milestone)

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 11. Skill — modo edición + fuentes | v0.16 | 2/2 | Complete | 2026-07-07 |
| 12. Premium motion + fotos en la reserva | v0.16 | 2/2 | Complete | 2026-07-07 |
| 13. CMS foundation — write path owner-only + flag | v0.16 | 1/1 | Complete | 2026-07-08 |
| 14. CMS editor UI | v0.16 | 4/4 | Complete | 2026-07-09 |
| 15. Borrador y publicación (núcleo) | v0.18 | 2/3 | In Progress|  |
| 16. La web nace como borrador (skill) | v0.18 | 0/? | Not started | - |
| 17. Exponer el CMS a clientes reales | v0.18 | 0/? | Not started | - |

## Requirement Coverage (v0.18)

| Requirement | Phase |
|-------------|-------|
| PUB-03 | Phase 15 |
| PUB-04 | Phase 15 |
| PUB-05 | Phase 15 |
| PUB-06 | Phase 15 |
| PUB-07 | Phase 15 |
| PUB-08 | Phase 15 |
| SKILL-07 | Phase 16 |
| SKILL-08 | Phase 16 |
| PUB-01 | Phase 17 |

**Cobertura: 9/9 requisitos v1 mapeados, cada uno a exactamente una fase. Sin huérfanos.**

---
*Next: `/gsd:plan-phase 15 --ws web-builder`*
