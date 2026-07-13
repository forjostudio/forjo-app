---
phase: 02-admin-de-plataforma
slug: 02-admin-de-plataforma
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-18
---

# Phase 2 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Workstream: `crm`. Verified retroactively against implemented code (register authored at plan time).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| owner (sesión tenant) → `businesses` UPDATE | El dueño autenticado puede `update` su propia fila vía RLS; las columnas add-on/plan/plan_status son entrada NO confiable que no debe poder tocar | `has_web_custom`, `has_whatsapp`, `plan`, `plan_status` (escalada de privilegio) |
| client/devtools → server action (`'use server'`) | Una action es un endpoint POST invocable directo (curl/fetch) sin pasar por el ConfirmDialog ni el layout | input arbitrario (businessId, plan, status, addon, monto) |
| operator → `plan_prices` / `businesses` (service-role) | Mutaciones sensibles del super-admin cruzan acá; deben pasar `requireAdmin` + zod + `logAudit` | precios ARS, flags add-on, plan_status |
| public/anon → `plan_prices` | Lectura de precios solo para `is_admin` (no anon, no dueños) | precios de planes |
| RSC del CRM (service-role) → componente client | El RSC lee con service-role (bypassa RLS); solo deben cruzar columnas no sensibles, nunca el cliente admin ni tokens | filas de negocio (columnas no secretas) + email del dueño |
| RSC ficha `[id]` ← URL (cliente) | El `id` viene del cliente; NO es autorización. La garantía es `requireAdmin` (layout guard + actions) | business_id de la URL |
| operator → `admin.auth.admin.getUserById` | Resolver el email del dueño lee datos del user de auth | solo el string `email` (no el objeto user) |
| actor externo → `POST /api/admin/set-plan` | Endpoint server-to-server gateado por `x-admin-secret`; sin sesión humana | secret en header, plan/status |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-02-01 | Elevation of Privilege | owner UPDATE businesses set has_whatsapp/has_web_custom/plan/plan_status | mitigate | `BEFORE UPDATE` trigger `businesses_protect_admin_columns()` revierte las 4 columnas a OLD si `auth.role() <> 'service_role'` — `032_crm_admin.sql:88-112` | closed |
| T-02-02 | Information Disclosure / Tampering | plan_prices leído/escrito por no-admin | mitigate | RLS ON + policy SELECT `is_admin` vía JWT app_metadata, SIN policy de write (escritura service-role-only); nunca `using(true)` — `032_crm_admin.sql:70-76` | closed |
| T-02-03 | Tampering | seed de precios en moneda equivocada (usd vs ars) | mitigate | Seed `price_ars` 15000/30000/50000 (`032_crm_admin.sql:58-62`); `getPlanPrices` fallback `SUBSCRIPTION_PLANS.*.price_ars`, negativo de `price_usd` confirmado — `lib/plan-prices.ts:10-14` | closed |
| T-02-04 | Elevation of Privilege | server action invocada directo sin guard | mitigate | `requireAdmin()` PRIMERA línea de las 6 actions + `grantTrial` — `_actions.ts:47,75,102,130,173,204,232`; guard lanza `forbidden` — `lib/admin-guard.ts:14-26` | closed |
| T-02-05 | Tampering | input de action (plan/status/addon/monto fuera de rango) | mitigate | `<schema>.parse(input)` 2ª línea de cada action; enums + `z.uuid()` + `z.int().min(0)` — `_actions.schemas.ts:11-59`, `_actions.ts:48,76,103,131,205,233` | closed |
| T-02-06 | Repudiation | mutación sin rastro | mitigate | `logAudit()` service-role tras cada mutación con action code reconocido; insert sin policy de write para users (no falsificable) — `lib/audit.ts:29-47`, `_actions.ts` (todas) | closed |
| T-02-07 | Integridad de negocio | 'suspended' que marca pero no corta | mitigate | booking blocklist += `'suspended'` → 403 `plan_inactive` (`booking/create/route.ts:63`); dashboard guard `redirect('/suspendido')` (`(dashboard)/layout.tsx:30`); `app/suspendido/page.tsx` existe | closed |
| T-02-08 | Tampering | editar precio asumiendo que muta MP | accept | D-04: `updatePlanPrice` escribe solo `plan_prices`, no toca MercadoPago — riesgo de negocio aceptado y documentado; copy de `/admin/planes` lo avisa — `_actions.ts:227-260` | closed |
| T-02-09 | Information Disclosure | service-role / columnas secretas filtradas al client | mitigate | Lectura en RSC con `createAdminClient` server-only, SELECT explícito de columnas no sensibles, solo filas/valores al client; ningún componente `'use client'` importa `createAdminClient` (5 usos, todos RSC/action) — `admin/page.tsx`, `negocios/page.tsx`, `negocios/[id]/page.tsx`, `planes/page.tsx` | closed |
| T-02-10 | Information Disclosure | email del dueño vía admin API expone de más | mitigate | `getUserById` acotado: solo `user.email`, fallback a `notification_email`; objeto user no se propaga — `negocios/page.tsx:60-66` | closed |
| T-02-11 | Integridad de visibilidad | filtro que oculta suspendidos del directorio | mitigate | `filterBusinesses` tab 'todos' incluye suspendidos + tab 'Suspendidos'; `StatusBadge` rojo `--crm-danger` distintivo — `lib/crm-directory.ts`, `negocios/page.tsx:18-19` | closed |
| T-02-12 | Elevation of Privilege | IDOR en la ruta `[id]` (manipular business_id de la URL) | mitigate | Autorización = `requireAdmin` (layout guard + cada action), NO el id; el super-admin puede ver cualquier negocio legítimamente; mutaciones re-validan admin en la action — `negocios/[id]/page.tsx:12-19,39-49` | closed |
| T-02-13 | Elevation of Privilege | toggle add-on / cambio plan sin guard si se invoca directo | mitigate | `AddonToggle`/`ConfirmDialog` solo invocan actions; cada action corre `requireAdmin()` server-side (T-02-04). La UI es refuerzo — `_actions.ts:204,46` | closed |
| T-02-14 | Information Disclosure | email del dueño vía getUserById propaga de más en la ficha | mitigate | RSC extrae solo el string email (fallback notification_email); objeto user de auth no cruza al client — `negocios/[id]/page.tsx:56-63` | closed |
| T-02-15 | Tampering | mostrar/editar el precio en moneda equivocada (usd) | mitigate | Precios desde `getPlanPrices` (ARS, plan_prices); features read-only de `plans.ts`; negativo de "Equipo"/mock confirmado — `planes/page.tsx:13-14,37-43` | closed |
| T-02-SC | Tampering | npm/pip/cargo installs (supply-chain) | accept | Phase 2 no instala paquetes nuevos; `AddonToggle` usa el primitivo `@base-ui/react/switch` ya instalado (RESEARCH §Package Legitimacy Audit) — cero superficie nueva | closed |
| CR-01 | Repudiation / Spoofing | `set-plan` (actor externo) sin auditoría + comparación de secreto no timing-safe | mitigate | Code-review fix Phase 2: `adminSecretMatches` SHA-256 + `crypto.timingSafeEqual` (`set-plan/route.ts:17-22,28`); `logAudit({actorId:null})` tras cada mutación de plan/status (`set-plan/route.ts:66-76`); migración `033_audit_actor_nullable.sql` hace `actor_id` nullable para el actor "Sistema" | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-08 | Editar un precio en `plan_prices` (`updatePlanPrice`) aplica a cobros FUTUROS; NO re-crea preapprovals ni muta suscripciones MercadoPago ya activas (D-04). El copy del banner de `/admin/planes` lo declara explícitamente y cada edición queda en auditoría. Riesgo de negocio, no de seguridad. | Operador / dueño del proyecto (PLAN 02-02 disposition) | 2026-06-18 |
| AR-02-SC | T-02-SC | Phase 2 no agrega dependencias: el único primitivo nuevo (`@base-ui/react/switch`) ya estaba instalado (mismo origen que `@base-ui/react/dialog` en uso). Cero superficie de supply-chain en esta fase. | Operador / dueño del proyecto (PLAN 02-01..04 disposition) | 2026-06-18 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-18 | 17 | 17 | 0 | gsd-security-auditor (Claude) |

*Total = 15 mitigate (T-02-01..07, 09..15) + 2 accept (T-02-08, T-02-SC) + 1 code-review mitigate (CR-01). T-02-SC declarado por los 4 planes; contado una vez.*

---

## Unregistered Flags / Notes

- **`grantTrial` (`trial.grant`)** — acción server-side AÑADIDA en UAT (`_actions.ts:172-198`). Mapea al mismo patrón guardado que el resto: `requireAdmin()` primera línea + `extendTrialSchema.parse` + `logAudit({action:'trial.grant'})`. No es superficie de ataque nueva sin mitigar (T-02-04/05/06 la cubren). Nota funcional (NO bloqueante de seguridad): no está cableada a un control en `ficha-client.tsx` todavía — entrada de UI pendiente, no afecta el contrato de seguridad. Sin `unregistered_flag`.
- Ningún `## Threat Flags` sin mapear se detectó en los 4 SUMMARY.md.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-18
