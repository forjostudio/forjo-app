---
phase: 02
slug: configuracion-de-canchas
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-01
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Registro autorizado en plan-time (`<threat_model>` de 02-01-PLAN.md y 02-02-PLAN.md). Relevancia
> **Media**: introduce/reusa datos de tenant (la cancha = service+professional+spaces + migración
> aditiva 043) pero SIN tablas nuevas ni superficie anon (la exposición pública es Phase 3). Las
> mitigaciones fueron verificadas por gsd-verifier contra el código real (business_id en cada
> insert/update/delete; RLS existente intacta; UI presenta 'Cancha' sin campos de staff). `threats_open: 0`
> y registro plan-time → short-circuit (sin auditor).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| dueño autenticado (browser) → Supabase (RLS) | El manager de canchas escribe con browser client + anon key; la autoridad de tenant es la RLS por `business_id`. `lib/canchas.ts` orquesta los writes. | filas `services`/`professionals`/`spaces`/`agenda_spaces` del propio tenant |
| RSC `/servicios/page.tsx` → Supabase (cookies del dueño) | La carga server-side filtra por `business_id` + RLS y alimenta el componente client. | listado de canchas + espacios del propio tenant |
| migración 043 → esquema prod | Columna aditiva aplicada a prod a mano; ventana de error humano (orden / `NOTIFY pgrst`). | DDL (columna `professionals.service_id`) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-02-01 | Tampering / Elevation | `provisionCancha` inserts (service/professional/space/agenda_space) | mitigate | Cada insert setea `business_id` explícito; la RLS existente (services/professionals + 4-policies WITH CHECK de spaces/agenda_spaces) rechaza `business_id` ajeno a nivel DB. Deletes/updates filtran por `.eq('business_id')`. Verificado por gsd-verifier. | closed |
| T-02-02 | Integrity | Auto-provisión sin transacción → "media cancha" (filas huérfanas) | mitigate | Rollback manual explícito en cada paso de `provisionCancha` (borra lo anterior filtrando por `business_id`). Riesgo residual = consistencia intra-tenant (NO cross-tenant), mismo nivel que el resto del dashboard. | closed |
| T-02-03 | Tampering | Migración 043 (columna nueva sobre `professionals`) | accept | Columna aditiva nullable, `ON DELETE SET NULL`, sin policy nueva; hereda la RLS de `professionals` (ya por `business_id`). No abre superficie cross-tenant. | closed |
| T-02-04 | Information Disclosure | `service_id` como puntero interno | accept | uuid interno del propio tenant; NO se expone a `anon` (Phase 2 = 100% dashboard autenticado; la UI de cancha no renderiza `service_id`). Exposición pública = scope Phase 3 (vista acotada). | closed |
| T-02-05 | Tampering / Elevation | Alta/edición/borrado de cancha desde el browser (incl. `editCancha`/`setCanchaActive`/`deleteCancha` hard) | mitigate | Toda escritura pasa por `lib/canchas.ts`, que setea `business_id` en cada fila; la RLS rechaza `business_id` ajeno. La carga en `page.tsx` filtra por `.eq('business_id')`. El borrado de espacios dedicados (`dedicatedSpaceIds`) también filtra por `business_id`. | closed |
| T-02-06 | Information Disclosure | Listar agendas-cancha como 'Equipo' / exponer staff o `service_id` | mitigate | El eje se presenta como `term.resource` ('Cancha'); la UI no renderiza specialty/license/phone/email ni `service_id` (Pitfall 3). El redirect de `/equipo` para canchas (Phase 1) sigue vigente. | closed |
| T-02-07 | Tampering | Mapear cancha a un `space` de otro tenant (cross-tenant `agenda_spaces`) | mitigate | Los spaces del control "compartir espacio" salen de `initialSpaces` cargados por `.eq('business_id')`; el insert de `agenda_spaces` lo valida la 4-policy WITH CHECK. No se debilita el acople del motor. | closed |
| T-02-08 | Information Disclosure | Exposición a `anon` | accept | Phase 2 es 100% dashboard autenticado; NO agrega lectura/vista anon. Exposición pública = Phase 3. | closed |
| T-02-SC | Tampering | npm/pip/cargo installs (supply-chain) | accept | Phase 2 NO instala paquetes (cero dependencias nuevas). Sin superficie supply-chain nueva. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-02-02 | Sin RPC/transacción (no se migra más allá de 043); rollback manual mitiga. El riesgo es consistencia intra-tenant, nunca cross-tenant. Mismo nivel que el resto del dashboard. | Forjo Studio | 2026-07-01 |
| AR-02 | T-02-03 | Migración aditiva nullable sobre tabla ya RLS; sin policy nueva. No alcanza el umbral de bloqueo (high). | Forjo Studio | 2026-07-01 |
| AR-03 | T-02-04 / T-02-08 | `service_id` y la config de cancha son datos internos del tenant; ninguna lectura anon nueva en Phase 2. La exposición pública acotada es scope de Phase 3. | Forjo Studio | 2026-07-01 |
| AR-04 | T-02-SC | Cero dependencias nuevas; sin superficie supply-chain. | Forjo Studio | 2026-07-01 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-01 | 9 | 9 | 0 | secure-phase (short-circuit: registro plan-time, threats_open 0; mitigaciones verificadas por gsd-verifier) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-01
