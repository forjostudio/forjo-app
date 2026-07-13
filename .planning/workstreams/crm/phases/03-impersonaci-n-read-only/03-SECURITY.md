---
phase: 03
slug: impersonaci-n-read-only
status: secured
threats_open: 0
threats_closed: 11
asvs_level: 1
block_on: high
created: 2026-06-20
---

# SECURITY — Phase 03: Impersonación Read-Only

**Phase:** 03 — Impersonación Read-Only (workstream crm)
**Audited:** 2026-06-20
**ASVS Level:** 1
**Block on:** high
**Disposition:** SECURED — 11/11 amenazas cerradas (10 mitigate + 1 accept)

Superficie más sensible del milestone: impersonación cross-tenant read-only. Garantía central:
un negocio NUNCA puede leer/mutar datos de otro, y todo acceso queda auditado. La garantía
read-only se logra POR AUSENCIA de write paths (no por bloqueo), y el scope cross-tenant se
centraliza en un único helper service-role acotado por `business_id`.

## Threat Verification

### Plan 03-01 (backbone server-side)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-03-01 | Information Disclosure | mitigate | CLOSED | `lib/impersonation.ts`: 9× `.eq('business_id', ...)` (grep=9, ≥7 requerido); negocio por `.eq('id', businessId)` (`lib/impersonation.ts:74`); `owner_id`=0; sin columnas de secretos en el SELECT de businesses (`lib/impersonation.ts:73`) |
| T-03-02 | Tampering | mitigate | CLOSED | Cuerpo de `startImpersonation` (sed firma→export) sin `.update/.insert/.delete/.upsert/revalidatePath/createAdminClient` (0 coincidencias); `lib/impersonation.ts` mutaciones=0; solo `requireAdmin`+`parse`+`logAudit`+return void (`app/(crm)/admin/_actions.ts`) |
| T-03-03 | Elevation of Privilege | mitigate | CLOSED | `requireAdmin()` primera línea de la action (`_actions.ts`, cuerpo de startImpersonation) Y primera op del loader (`ver/page.tsx:24`); `lib/admin-guard.ts:22` valida `app_metadata.is_admin === true` y lanza si no |
| T-03-04 | Repudiation | mitigate | CLOSED | Entrada: `reason: z.string().trim().min(10)` (`_actions.schemas.ts:67`) + `logAudit({action:'user.impersonate',risk:'alto',reason})` (cuerpo de startImpersonation). TRAIL COMPLETO: loader audita cada carga `user.impersonate.view`/`risk:'medio'` DESPUÉS de `notFound()` (`ver/page.tsx:33` notFound, `:43-50` logAudit) → acceso directo por URL también deja traza |
| T-03-05 | Information Disclosure | mitigate | CLOSED | `lib/impersonation.ts` no llama `getBusinessSecrets` (grep=0); presencia vía `getBusinessIntegrationStatus` que mapea `!= null` a boolean y nunca retorna strings de token (`lib/business-secrets.ts:60-79`) |
| T-03-SC | Tampering (supply-chain) | accept | CLOSED | Cero paquetes nuevos. SUMMARY 03-01 `tech-stack.added: []`; sin instalación npm/pip/cargo. Riesgo aceptado: sin superficie supply-chain nueva en esta fase |

### Plan 03-02 (superficie visual read-only)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-03-06 | Tampering | mitigate | CLOSED | `impersonation-view.tsx`: sin `@/lib/supabase/client` ni `*-client.tsx` del dashboard (grep=0); sin `.update/.insert/.delete/fetch('/api` (grep=0); renderers nuevos sobre primitivos puros (Card/Badge/UpcomingAppointments) |
| T-03-07 | Information Disclosure | mitigate | CLOSED | Config muestra solo presencia conectado/desconectado vía `data.integrationStatus` booleanos (`impersonation-view.tsx:246-249`); sin tokens crudos `mp_access_token/resend_api_key/google_refresh_token/recaptcha_secret_key` (grep=0) |
| T-03-08 | Information Disclosure | mitigate | CLOSED | `impersonation-view.tsx` sin `clinical-history/finances/historia clínica/finanzas` (grep=0); las secciones de salud e ingresos no se renderizan (D-06) |
| T-03-09 | Repudiation | mitigate | CLOSED | Botón "Ver como cliente" (`ficha-client.tsx:264-271`) siempre pasa por `ConfirmDialog confirmWord="VER" requireReason minReasonLength={10}` (`:358-365`) → `startImpersonation` que audita (`:368-369`); no hay link directo a /ver sin auditar |
| T-03-10 | Repudiation/EoP | mitigate | CLOSED | Acceso directo por URL: loader re-valida `requireAdmin` (`ver/page.tsx:24`) Y audita cada carga `user.impersonate.view` (`:43-50`); labels mapeados en visor (`auditoria-client.tsx:67-68`) |
| T-03-SC | Tampering (supply-chain) | accept | CLOSED | Cero paquetes nuevos. SUMMARY 03-02 `tech-stack.added: []` |

## Desviación intencional (no es amenaza abierta)

`startImpersonation` pasó de `redirect()` server-side a auditar+retornar; la navegación a `/ver`
la hace el cliente con `router.push` (`ficha-client.tsx:369-370`). Motivo: `redirect()` lanza
`NEXT_REDIRECT` que atravesaba el try/catch del ConfirmDialog → toast espurio. Las invariantes de
auditoría y read-only/scope NO cambian: la action sigue auditando `user.impersonate` con motivo,
`requireAdmin` sigue como primera línea, y el loader sigue auditando cada carga. T-03-03/T-03-04
siguen mitigadas.

## Unregistered Flags

Ninguno. Los SUMMARY de 03-01 y 03-02 no declaran `## Threat Flags`; ambos reportan
`tech-stack.added: []` (cero superficie de ataque nueva no mapeada) y ninguna migración SQL
(`audit_log` ya existía en migración 031). Toda la superficie nueva está cubierta por el threat
register autorado en plan-time.

## Aceptación de riesgos

- **T-03-SC (supply-chain):** ACEPTADO. La fase no instala paquetes; sin superficie supply-chain
  nueva. Disposition `accept` declarada en ambos PLAN.md.

## Pendiente fuera de fase (no bloquea)

- Revisión legal formal del flujo de impersonación antes del primer cliente del vertical salud
  (D-14). Registrado en SUMMARY 03-01; no bloquea el ship de esta fase.

## Security Audit 2026-06-20 (re-verificación)

Re-auditoría State-A: cada mitigación documentada re-verificada contra el working tree EN VIVO
en la rama `gsd/crm` @ `2030fca` (la rama que posee la fase). Register autorado en plan-time →
modo verify-mitigations (sin escaneo de amenazas nuevas). La desviación intencional
(`startImpersonation` audita+retorna + `router.push` cliente en vez de `redirect()` server)
confirmada en código: preserva las invariantes de auditoría/read-only/scope.

| Métrica | Conteo |
|---------|--------|
| Threats verificados | 11 |
| Closed | 11 |
| Open | 0 |

> Nota operativa: la primera corrida de esta re-auditoría escaló por mismatch de rama (working
> tree estaba en `gsd/web-builder`, que NO contiene los commits de impersonación). Resuelto con
> `git checkout gsd/crm`; la verificación final corrió contra el working tree correcto. El código
> CRM vive en `gsd/crm` — ver memoria del milestone.
