---
phase: 03
slug: espacio-compartido
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-30
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Workstream: motor-reservas (v0.12). Fase más crítica del milestone — exclusión atómica multi-espacio bajo concurrencia + tablas de tenant nuevas.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Cliente público → booking público (service-role) | Reserva anónima por slug; resuelve tenant server-side | service/professional/space IDs, horario (no confiables) |
| Dashboard owner (anon+RLS) → tablas de tenant | Alta/edición de spaces + mapeo agenda↔espacio | spaces, agenda_spaces (escritura por browser client, RLS WITH CHECK) |
| App → DB (book_slot_atomic SECURITY DEFINER) | Chequeo atómico de conflicto de espacio + insert | advisory lock por espacio, EXISTS anti-solape, EXCLUDE backstop |
| anon role → tablas spaces/agenda_spaces/appointment_spaces | Sin policy anon; RLS habilitada | ninguno (anon no lee ni una fila) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-01 | Tampering/Info Disclosure | spaces/agenda_spaces (RLS) | mitigate | RLS + 4 policies/op por tabla con `owner_id = auth.uid()`, WITH CHECK; sin policy anon — `042_*.sql:50,55-71,85,90-106` / `schema.sql:1403-1428,1665-1691` | closed |
| T-03-02 | Tampering (TOCTOU) | book_slot_atomic | mitigate | `pg_advisory_xact_lock` por espacio ANTES del `IF EXISTS`, nunca count suelto — `042_*.sql:167-196` | closed |
| T-03-03 | Tampering (acople cross-tenant) | book_slot_atomic | mitigate | `array_agg ... WHERE asp.business_id = p_business_id`; JOIN+EXISTS filtran por tenant — `042_*.sql:164,182,184` | closed |
| T-03-04 | DoS (deadlock subconjuntos) | book_slot_atomic | mitigate | `array_agg(... ORDER BY space_id)` + FOREACH ascendente — `042_*.sql:162,170` | closed |
| T-03-05 | Tampering (auto-conflicto F11) | book_slot_atomic | mitigate | `COALESCE(a.professional_id,sentinel) <> COALESCE(p_professional_id,sentinel)` — `042_*.sql:187-188` | closed |
| T-03-06 | Info Disclosure | availability response | mitigate | siblingBusy mapea solo time/status/expires_at/duration; respuesta `{ ok, busy, full }` — `availability/route.ts:101,116-119,156` | closed |
| T-03-07 | Tampering (acople cross-tenant) | availability | mitigate | queries a `agenda_spaces` con `.eq('business_id', business.id)` — `availability/route.ts:99,107` | closed |
| T-03-08 | Info Disclosure (error leak) | booking-core re-check | mitigate | re-check devuelve genérico `slot_taken` 409 sin detalle — `booking-core.ts:172-173` | closed |
| T-03-09 | Tampering (escritura client) | settings-client | mitigate | browser client anon+RLS; WITH CHECK del Plan 01 + FK rechazan business_id falsificado — `settings-client.tsx:140,569-571,601-606,615` | closed |
| T-03-10 | Info Disclosure (carga cross-tenant) | settings/page.tsx | mitigate | `from('spaces')/from('agenda_spaces') ... .eq('business_id', business.id)` server anon+RLS — `settings/page.tsx:32-33` | closed |
| T-03-11 | Tampering (terminología) | lib/verticals.ts | accept | Override label-only por type; no toca datos, riesgo de seguridad nulo | closed |
| T-03-12 | Tampering (backstop) | appointment_spaces EXCLUDE | mitigate | `EXCLUDE USING gist (business_id WITH =, space_id WITH =, slot WITH &&)` — `042_*.sql:297-298` / `schema.sql:843-844` | closed |
| T-03-13 | Tampering (espacio bloqueado tras cancelar) | cleanup trigger | mitigate | `appointment_spaces_cleanup()` AFTER UPDATE OF status — `042_*.sql:344-359` | closed |
| T-03-14 | Info Disclosure (proyección por anon) | appointment_spaces (RLS) | mitigate | RLS + única policy select tenant, sin anon, escritura solo por trigger — `042_*.sql:280,287-289` | closed |
| T-03-15 | Tampering (auto-conflicto F11 proyección) | populate trigger | mitigate | PK `(appointment_id, space_id)`; EXCLUDE solo choca contra otros appointment_id — `042_*.sql:278,318-325` | closed |
| T-03-16 | Tampering (regresión exclusión) | concurrency.test.ts | mitigate | CONC-03: 2× createAppointmentCore + assert contra DB real — `concurrency.test.ts:245-275` | closed |
| T-03-17 | Tampering (test flaky) | concurrency.test.ts | mitigate | determinismo por advisory lock + verificación independiente de DB — `concurrency.test.ts:259-262,274` | closed |
| T-03-SC | Tampering (supply-chain) | dependencias | accept | `tech-stack.added: []` en los 5 SUMMARY; la fase no instala paquetes | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-11 | Override de terminología es label-only por type "Cancha de fútbol"; no toca datos ni control de acceso — riesgo de seguridad nulo | gsd-security-auditor / owner | 2026-06-30 |
| AR-03-02 | T-03-SC | La fase no instala paquetes (`tech-stack.added: []` en los 5 SUMMARY); sin superficie supply-chain nueva | gsd-security-auditor / owner | 2026-06-30 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-30 | 18 | 18 | 0 | gsd-security-auditor (opus, ASVS L1) |

---

## Deploy precondition (no es un threat)

La migración 042 está validada solo en PG17 local (`supabase db reset`) y **pendiente de aplicar a mano a PROD + DEV remoto** con `NOTIFY pgrst, 'reload schema';`. Hasta el deploy, las queries a `agenda_spaces` hacen skip seguro (`if (mySpaces && mySpaces.length > 0)`) — sin regresión, pero la **exclusión por espacio NO está activa en esos entornos hasta aplicar la 042**. Precondición de despliegue del milestone, no brecha de la fase.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-30
