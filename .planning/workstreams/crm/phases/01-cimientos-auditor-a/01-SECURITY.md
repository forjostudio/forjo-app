---
phase: 01-cimientos-auditor-a
slug: cimientos-auditor-a
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-18
---

# Phase 1 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verify mode — each mitigation declared in the four PLAN `<threat_model>` blocks was
> confirmed present in the SHIPPED code (file:line evidence below). No implementation
> file was modified.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| cliente autenticado (anon key) → DB `audit_log` | Un usuario logueado podría intentar leer o falsificar el log vía RLS | Filas de auditoría (actor, acción, negocio, riesgo, motivo) — sensible/global cross-tenant |
| server action / route handler → DB (service-role) | El service-role bypassa RLS; debe usarse solo server-side para ESCRIBIR `audit_log` | Inserts de auditoría con privilegio total |
| browser (no-admin) → `/admin` (RSC) | Un no-admin podría recibir UI sensible con render parcial o guard client-side | Chrome del CRM + datos de auditoría |
| Edge proxy → sesión Supabase | Si `/admin` no pasa por `updateSession`, la cookie queda stale → `getUser()` null intermitente | Cookie de sesión del operador |
| browser (operador) → server action (vía ConfirmDialog) | La confirmación es UI; un request directo puede saltarla | Disparo de acciones peligrosas |
| operador local (CLI) → `app_metadata.is_admin` | Otorgar is_admin es la elevación de privilegio más sensible; ocurre fuera del runtime web | El flag "llaves del reino" |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-01-01 | Information Disclosure | RLS SELECT de `audit_log` | mitigate | Policy SELECT `using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true')`; sin `using(true)` — `supabase/migrations/031_crm_audit_log.sql:56-58` | closed |
| T-01-02 | Tampering / Repudiation | escritura de `audit_log` | mitigate | RLS habilitada misma migración (`:50`); única policy es SELECT — ninguna insert/update/delete para users (`:60-62`). Solo `createAdminClient()` (service-role) escribe — `lib/audit.ts:28-39` | closed |
| T-01-03 | Elevation of Privilege | `requireAdmin()` en actions | mitigate | `requireAdmin()` re-valida `app_metadata.is_admin === true` server-side y LANZA `forbidden`/`unauthorized` — `lib/admin-guard.ts:14-26`. Server-only (no `'use client'`). Phase 1 no entrega actions/route handlers del CRM que lo consuman (Phases 2+); helper presente y listo. | closed |
| T-01-04 | Spoofing | fuente de `is_admin` | mitigate | `is_admin` se lee de `auth.users.app_metadata` (no editable por el tenant) en guard (`lib/admin-guard.ts:22`), layout (`app/(crm)/layout.tsx:29`) y policy RLS (`031:58`). Ninguna columna en `businesses`. | closed |
| T-01-05 | Elevation of Privilege | guard del layout `/admin` | mitigate | Validación server-side con `redirect('/login')`/`redirect('/dashboard')` ANTES del JSX, fuera de try/catch — `app/(crm)/layout.tsx:26-29` | closed |
| T-01-06 | Spoofing | sesión stale en `/admin` | mitigate | `'/admin'` en `KNOWN_PREFIXES` → pasa por `updateSession` — `proxy.ts:16`. Middleware redirige a `/login` sin sesión en el Edge — `lib/supabase/middleware.ts:42-48` | closed |
| T-01-07 | Information Disclosure (cosmético) | tema dark global rompe dashboard | accept | Riesgo cosmético/funcional, no de seguridad. Scope `.crm-shell` + `dark` local — `app/globals.css:160`; layout aplica `dark crm-shell` — `app/(crm)/layout.tsx:47`. Ver Accepted Risks Log. | closed |
| T-01-08 | Denial of Service | operador sin business → `.single()` 500 | mitigate | El guard lee `is_admin` de `app_metadata`, NO de `businesses`; sin `.single()` — `app/(crm)/layout.tsx:24-29`. Sin query a DB de negocio en el path del guard. | closed |
| T-01-09 | Information Disclosure | visor `/admin/auditoria` | mitigate | Lee con `createClient()` (sesión + RLS), NO `createAdminClient` — `app/(crm)/admin/auditoria/page.tsx:21-28`. `auditoria-client.tsx` no importa ningún cliente supabase (sin service-role en cliente). | closed |
| T-01-10 | Elevation of Privilege | acceso al shell sin admin | mitigate | El shell vive bajo `app/(crm)/layout.tsx` cuyo guard server-side bloquea no-admins antes de montar sidebar/visor — `app/(crm)/layout.tsx:26-29` | closed |
| T-01-11 | Elevation of Privilege | ConfirmDialog como falsa garantía | mitigate | El dialog no autoriza; cabecera lo documenta y la garantía real es `requireAdmin()` server-side — `components/crm/confirm-dialog.tsx:5-8`. UI = refuerzo. | closed |
| T-01-12 | Tampering | doble submit de acción peligrosa | mitigate | Guard anti doble-submit (`buildSubmitGuard` ignora segundo disparo si `loading`) + cierre bloqueado en loading — `components/crm/confirm-dialog.tsx:105-123, 183-193, 227`. Test verde (`confirm-dialog.test.tsx`). | closed |
| T-01-13 | Elevation of Privilege | otorgar `is_admin` (llaves del reino) | mitigate | Solo vía script local con service-role fuera del runtime web; `supabase.auth.admin.updateUserById(..., { app_metadata: { is_admin: true } })` — `scripts/setup-admin.ts:93-95`. No self-serve, no endpoint, no UPDATE SQL. | closed |
| T-01-SC | Tampering (supply-chain) | npm/pip/cargo installs | accept | Phase 1 no instala paquetes nuevos (4 PLANs lo declaran). `setup:admin` reusa `tsx`/`@supabase/supabase-js` ya presentes — `package.json:11`. Ver Accepted Risks Log. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

### Unregistered Flags

None. Ningún SUMMARY (01-01..01-04) declara una sección `## Threat Flags`; cada uno reporta
`## Threat Mitigations Applied` mapeado a IDs ya registrados. No apareció superficie de ataque
nueva sin mapear durante la implementación.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-07 | Riesgo cosmético/funcional (no de seguridad): forzar dark en el CRM. Mitigado por scope `.crm-shell` + `dark` local (`app/globals.css:160`, `app/(crm)/layout.tsx:47`) — no filtra al theming por-negocio del dashboard. Disposición `accept` declarada en el PLAN 01-02. | PLAN 01-02 threat_model | 2026-06-17 |
| AR-02 | T-01-SC | Sin superficie de supply-chain: Phase 1 no instala paquetes npm nuevos (cero deps, confirmado en los 4 PLANs y en CONTEXT "Claude's Discretion"). `tsx` y `@supabase/supabase-js` ya estaban. Disposición `accept` declarada en los 4 PLANs. | PLAN 01-01..04 threat_model | 2026-06-17 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-18 | 14 | 14 | 0 | gsd-security-auditor (Verify mode) |

Notas de verificación:
- 12 threats `mitigate` confirmados por grep/lectura del código shipped (file:line en el registro).
- 2 entradas `accept` (T-01-07, T-01-SC) registradas en Accepted Risks Log.
- Suite de contrato verde: `npx vitest run lib/audit.test.ts components/crm/confirm-dialog.test.tsx` → 10/10 (cubre best-effort de logAudit y anti doble-submit / gating del ConfirmDialog).
- Cobertura de D4 (requireAdmin en cada action): Phase 1 no introduce server actions ni route handlers bajo `app/(crm)/` (`find` sin resultados, sin archivos `'use server'`), por lo que no existe entry point que deba llamar `requireAdmin()` y lo omita. El helper queda server-only y listo para Phases 2+.
- Aislamiento de lectura (T-01-09): `auditoria-client.tsx` no importa ningún cliente supabase; el service-role no cruza al cliente.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-18
