---
phase: 01
slug: reconciliacion-de-horarios
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-03
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Registro autorizado en plan-time (`<threat_model>` de 01-01/02/03-PLAN.md). Relevancia **BAJA**:
> riesgo de **regresión** (que el onboarding/agente dejen de reflejar horarios, o dropear la tabla
> antes de tiempo), NO de aislamiento. `time_blocks` ya está bajo RLS por `business_id`; no se
> introducen datos de tenant nuevos ni superficie anónima (al contrario: el DROP elimina la única
> vista anon `public_business_hours`). Mitigaciones verificadas por gsd-verifier (9/9) + el checkpoint
> humano del DROP fue aplicado tras el deploy. `threats_open: 0` y registro plan-time → short-circuit.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| owner (sesión autenticada) → DB (`time_blocks`) | El onboarding escribe los horarios del negocio del propio owner. | bloques de horario (day_of_week, start/end) con `business_id` del owner |
| bot (anon, por slug) → `/api/agent/context` | El bot lee datos públicos del negocio por slug; endpoint service-role, tenant por slug. | horarios/servicios NO secretos del negocio |
| migración → DB (prod) | `DROP TABLE business_hours` destructivo; aplicado a mano DESPUÉS del deploy del código. | DDL (eliminación de tabla/vista/policy/grants) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-01-01 | Tampering | insert de `time_blocks` en el onboarding | mitigate | `business_id` = `business.id` del negocio recién creado por la sesión, nunca del cliente; RLS de `time_blocks` por `business_id`. Verificado. | closed |
| T-01-02 | Elevation of Privilege | escritura de horarios | accept | Insert con la sesión del owner (anon key + RLS), no service-role; un owner solo escribe bloques de su propio negocio. | closed |
| T-01-03 | Denial of Service | insert de N bloques (split) | accept | Self-service del owner sobre su negocio; volumen acotado por días×bloques de la UI; sin superficie anónima. | closed |
| T-01-04 | Information Disclosure | endpoint del agente (service-role) | mitigate | Select de columnas NO secretas explícitas + tenant por slug; `time_blocks` solo aporta day_of_week/start/end (no secretos). Misma superficie que hoy. | closed |
| T-01-05 | Tampering | mapeo puro `time_blocks → hours[]` | mitigate | Módulo puro (sin Supabase/React); transforma filas ya filtradas por `business_id` en el route; no acepta ids del cliente. | closed |
| T-01-06 | Information Disclosure | cambio de fuente `business_hours→time_blocks` | accept | `time_blocks` ya bajo RLS por `business_id` y ya leída por el booking público; no expone datos nuevos ni cruza tenants. | closed |
| T-01-07 | Denial of Service | DROP corriendo antes del deploy del código | mitigate | Orden obligatorio (D-03): Wave 2 depende de Plans 01+02; gate de grep (0 refs vivas) + checkpoint humano que exige deployar ANTES del DROP. Aplicado en ese orden (deploy → DROP). | closed |
| T-01-08 | Tampering | migración destructiva no idempotente | mitigate | Todos los DROP usan `IF EXISTS` (idempotente); validable con `supabase db reset` local. | closed |
| T-01-09 | Information Disclosure | policy/RLS/grants colgados de `business_hours` | mitigate | `DROP TABLE` elimina policies/RLS/grants; además se dropea explícitamente la vista `public_business_hours` (única con GRANT a anon) → sin superficie colgada. | closed |
| T-01-10 | Repudiation | pérdida de datos por el DROP | accept | Cutover limpio sin backfill (D-02): sin clientes en prod, "todo en 0 OK"; no hay horarios que preservar. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-02 / T-01-03 | Escritura self-service del owner sobre su propio negocio bajo RLS; sin superficie anónima. | Forjo Studio | 2026-07-03 |
| AR-02 | T-01-06 | El cambio de fuente no expone datos nuevos; `time_blocks` ya es pública vía booking. | Forjo Studio | 2026-07-03 |
| AR-03 | T-01-10 | Cutover limpio sin backfill; sin datos de horarios reales que preservar (sin clientes). | Forjo Studio | 2026-07-03 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-03 | 10 | 10 | 0 | secure-phase (short-circuit: registro plan-time, threats_open 0; mitigaciones verificadas por gsd-verifier 9/9; DROP aplicado post-deploy) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-03
