---
phase: 03-impersonaci-n-read-only
verified: 2026-06-20T00:00:00Z
status: passed
score: 11/11
behavior_unverified: 0
overrides_applied: 0
---

# Phase 03: Impersonación Read-Only — Verification Report

**Phase Goal:** El operador puede "ver como cliente" cualquier negocio en modo solo lectura para soporte, con la garantía real de que ningún write ocurre bajo la sesión impersonada, scope estricto por `business_id` y cada acceso auditado con motivo.
**Verified:** 2026-06-20
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Read-only por construcción: `startImpersonation` no contiene `.update(`/`.insert(`/`.delete(`/`.upsert(`/`revalidatePath` | VERIFIED | `sed -n '/export async function startImpersonation/,/^export /p'` devuelve 0 coincidencias; la action solo llama `requireAdmin` + `startImpersonationSchema.parse` + `logAudit` y retorna `void` |
| 2 | `lib/impersonation.ts` no contiene ninguna mutación ni cliente de sesión/browser | VERIFIED | `grep -cE ".update\|.insert\|.delete\|.upsert"` = 0; `grep -cE "@/lib/supabase/client\|@/lib/supabase/server"` = 0 |
| 3 | Toda lectura en `lib/impersonation.ts` usa `createAdminClient()` + `.eq('business_id', ...)` (cero `owner_id`) | VERIFIED | `grep -c ".eq('business_id'"` = 9 (una por colección); `grep -c "owner_id"` = 0; negocio resuelto con `.eq('id', businessId)` (línea 74) |
| 4 | Motivo validado server-side con `z.string().trim().min(10)` | VERIFIED | `_actions.schemas.ts` línea 67: `reason: z.string().trim().min(10)`; `StartImpersonationInput` exportado; tests del schema incluyen los casos de borde |
| 5 | `startImpersonation` audita con `action='user.impersonate'`, `risk='alto'`, `reason` | VERIFIED | `_actions.ts` líneas 283-291: `logAudit` con action/risk/reason exactos; `requireAdmin()` es PRIMERA línea (línea 280) |
| 6 | `requireAdmin()` como primera operación en el loader `/ver/page.tsx` (Pitfall 2) | VERIFIED | `ver/page.tsx` línea 24: `const actor = await requireAdmin()` es la primera sentencia ejecutable del body de `VerPage` |
| 7 | TRAIL COMPLETO: el loader `/ver/page.tsx` audita CADA carga con `action='user.impersonate.view'`, `risk='medio'`, ubicado DESPUÉS del `notFound()` | VERIFIED | `ver/page.tsx` línea 33: `if (!data.business) notFound()`; líneas 43-50: `logAudit` con action/risk correctos después del guard |
| 8 | Visor mapea `'user.impersonate'` → "Impersonó negocio" y `'user.impersonate.view'` → "Vio ficha (impersonación)" | VERIFIED | `auditoria-client.tsx` líneas 67-68: ambas entradas presentes en `ACTION_LABEL` |
| 9 | Secciones excluidas D-06 (historia clínica / finanzas) no se renderizan en `impersonation-view.tsx` | VERIFIED | `grep -cE "clinical-history\|finances\|historia clínica\|finanzas"` = 0 |
| 10 | Config muestra PRESENCIA de integraciones (booleanos), nunca valor crudo de secreto | VERIFIED | `getBusinessIntegrationStatus` mapea `!= null` y devuelve `{ mercadopago, email, recaptcha, google }` sin retornar ningún string de token; `impersonation-view.tsx` consume `data.integrationStatus` (booleanos); `grep -cE "mp_access_token\|resend_api_key\|google_refresh_token"` en impersonation-view.tsx = 0 |
| 11 | Banner fijo "Estás viendo como X · solo lectura" + "Salir de la vista" (Link a /admin/negocios) + estado del negocio | VERIFIED | `impersonation-banner.tsx`: copy exacto en JSX; `href="/admin/negocios"` (Link de navegación, D-04); `StatusBadge` con `planStatus` (D-11) |

**Score:** 11/11 truths verified (0 present, behavior-unverified)

---

## Prohibitions Verified (must-NOT checks)

| Prohibition | Check | Result |
|-------------|-------|--------|
| `startImpersonation` sin `.update`/`.insert`/`.delete`/`.upsert`/`revalidatePath` en su body | `sed` acotado al cuerpo de la función | PASS — 0 coincidencias |
| `lib/impersonation.ts` sin `@/lib/supabase/client` ni `@/lib/supabase/server` | grep -cE | PASS — 0 |
| `lib/impersonation.ts` sin `.update`/`.insert`/`.delete`/`.upsert` | grep -cE | PASS — 0 |
| `lib/impersonation.ts` sin `.eq('owner_id', ...)` | grep -c | PASS — 0 |
| `lib/impersonation.ts` no llama `getBusinessSecrets` | grep -c | PASS — 0 |
| `impersonation-view.tsx` sin `@/lib/supabase/client` ni `*-client.tsx` del dashboard | grep -cE | PASS — 0 |
| `impersonation-view.tsx` sin `.update`/`.insert`/`.delete`/`fetch('/api` | grep -cE | PASS — 0 |
| `impersonation-view.tsx` sin secciones `clinical-history`/`finances` | grep -cE | PASS — 0 |
| `impersonation-view.tsx` sin tokens crudos (`mp_access_token`, etc.) | grep -cE | PASS — 0 |
| `ver/page.tsx` sin `@/lib/supabase/client` ni `*-client.tsx` del dashboard | grep -cE | PASS — 0 |

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/(crm)/admin/_actions.schemas.ts` | `startImpersonationSchema` con `businessId: z.uuid()` + `reason: z.string().trim().min(10)` | VERIFIED | Línea 65-68; `StartImpersonationInput` exportado en línea 76 |
| `app/(crm)/admin/_actions.ts` | `startImpersonation` (audit + retorno limpio, sin mutar) | VERIFIED | Líneas 263-292; `requireAdmin` primera; `logAudit` exacto; sin mutación; sin `redirect` (desviación aprobada: navega client-side) |
| `lib/impersonation.ts` | `loadImpersonationData(businessId)` service-role scoped | VERIFIED | Archivo completo; 9× `.eq('business_id', ...)`; negocio por `.eq('id', ...)`; `Promise.all` con todas las colecciones + `integrationStatus` |
| `lib/business-secrets.ts` | `getBusinessIntegrationStatus` solo booleanos | VERIFIED | Función exportada líneas 60-79; devuelve `{ mercadopago, email, recaptcha, google }` como `!= null` |
| `app/(crm)/admin/negocios/[id]/ver/page.tsx` | RSC loader read-only: requireAdmin + loadImpersonationData + PaletteScript + logAudit view | VERIFIED | Orden: requireAdmin → await params → loadImpersonationData → notFound → logAudit → PaletteScript + ImpersonationBanner + ImpersonationView |
| `app/(crm)/admin/negocios/[id]/ver/impersonation-view.tsx` | Renderers read-only por sección sin write paths | VERIFIED | Componentes presentacionales sobre primitivos UI; sin cliente browser; sin *-client.tsx; sin clinical-history/finances; config solo presencia |
| `components/crm/impersonation-banner.tsx` | Banner fijo con "Salir de la vista" Link + StatusBadge | VERIFIED | Implementado con `sticky top-0 z-50`; `<Link href="/admin/negocios">`; `StatusBadge` |
| `app/(crm)/admin/negocios/[id]/ficha-client.tsx` | Botón "Ver como cliente" + ConfirmDialog `confirmWord="VER"` + `requireReason` + `minReasonLength={10}` | VERIFIED | Líneas 263-371; botón sin gating de estado (D-11); dialog con todos los props requeridos; `router.push` tras resolve de action |
| `components/crm/confirm-dialog.tsx` | Prop aditiva `minReasonLength?` backward-compatible | VERIFIED | Línea 56: prop opcional; `minLen = minReasonLength ?? 1` preserva comportamiento previo; `reasonOk = reasonLen >= minLen` |
| `app/(crm)/admin/auditoria/auditoria-client.tsx` | Labels `'user.impersonate'` y `'user.impersonate.view'` en `ACTION_LABEL` | VERIFIED | Líneas 67-68 |

---

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `app/(crm)/admin/_actions.ts` | `lib/audit.ts` | `logAudit({ action: 'user.impersonate', risk: 'alto', businessId, reason })` | WIRED — líneas 283-291 |
| `app/(crm)/admin/negocios/[id]/ver/page.tsx` | `lib/impersonation.ts` | `loadImpersonationData(id)` | WIRED — línea 30 |
| `lib/impersonation.ts` | `lib/supabase/admin.ts` | `createAdminClient()` + `.eq('business_id', ...)` × 9 | WIRED — línea 57; 9 ocurrencias del filtro |
| `app/(crm)/admin/negocios/[id]/ficha-client.tsx` | `app/(crm)/admin/_actions.ts` | `await startImpersonation({ businessId: data.id, reason: reason! })` + `router.push(...)` | WIRED — líneas 369-370 |
| `app/(crm)/admin/negocios/[id]/ver/page.tsx` | `app/(crm)/admin/negocios/[id]/ver/impersonation-view.tsx` | `<ImpersonationView data={data} />` | WIRED — línea 70 |
| `app/(crm)/admin/negocios/[id]/ver/page.tsx` | `components/crm/impersonation-banner.tsx` | `<ImpersonationBanner businessName={...} planStatus={...} />` | WIRED — línea 67 |
| `lib/impersonation.ts` | `lib/business-secrets.ts` | `getBusinessIntegrationStatus(businessId)` en `Promise.all` | WIRED — línea 96 |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `impersonation-view.tsx` | `data: ImpersonationData` | `loadImpersonationData(businessId)` vía props desde `ver/page.tsx` | Sí — service-role queries a 8 tablas de Supabase en `Promise.all` | FLOWING |
| `impersonation-banner.tsx` | `businessName`, `planStatus` | Props desde `ver/page.tsx` alimentadas por `data.business` | Sí — DB query a `businesses` | FLOWING |
| `IntegrationRow` (config) | `data.integrationStatus` | `getBusinessIntegrationStatus(businessId)` → `business_secrets` | Sí — booleanos derivados de columnas reales; fila ausente → todo `false` | FLOWING |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED en su mayoría — el proyecto no tiene servidor iniciable en el contexto de verificación, y el checkpoint humano end-to-end fue completado y aprobado por el operador (citado en el contexto de verificación). Los checks automáticos que sí son ejecutables (tsc, vitest, lint) fueron reportados por el orquestador como exitosos: tsc exit 0, suite 119/119 verde.

---

## Probe Execution

No se declaran probes explícitos en los PLAN.md de esta fase. La verificación automatizable se realiza vía greps empíricos sobre el código (arriba) y las garantías de compilación/test declaradas por el orquestador.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| IMP-01 | 03-01, 03-02 | Garantía server-side de que ningún write ocurre bajo impersonación | SATISFIED | `startImpersonation` sin mutación; `lib/impersonation.ts` sin update/insert/delete/upsert (0 coincidencias); `impersonation-view.tsx` sin write paths; garantía por construcción (ausencia de paths), no por bloqueo |
| IMP-02 | 03-01 | Doble confirmación + motivo obligatorio + auditoría de cada acceso | SATISFIED | `startImpersonationSchema` valida `reason: z.string().trim().min(10)` server-side; `logAudit` con action/risk/reason; `ConfirmDialog confirmWord="VER" requireReason minReasonLength={10}`; re-entrada = fila nueva (logAudit sin deduplicar en la action) |
| IMP-03 | 03-01, 03-02 | Scope estricto por `business_id` + banner "solo lectura" + "Salir de la vista" | SATISFIED | 9× `.eq('business_id', ...)` en `lib/impersonation.ts`; negocio por `.eq('id', ...)` sin `owner_id`; `ImpersonationBanner` con copy exacto + Link de navegación; `StatusBadge` para todos los estados |

---

## Anti-Patterns Found

Ninguno. Revisión de los archivos modificados:

- Sin comentarios TBD/FIXME/XXX sin referencia formal
- Sin `return null` como stub en componentes de render de datos reales
- Sin props hardcodeadas vacías en call sites
- Los comentarios densos en español documentan decisiones de seguridad no obvias (por qué se audita en el loader, por qué no se redirige desde la action, por qué no se reusa `*-client.tsx`) — patrón positivo del proyecto, no anti-pattern

---

## Desviación Intencional Documentada (no es gap)

**D-04 client-side navigation:** `startImpersonation` originalmente usaba `redirect()` server-side. Cambiado a auditar + retornar limpio; la navegación a `/ver` la hace el cliente con `router.push` en `ficha-client.tsx` (línea 370). Motivo: `redirect()` lanza `NEXT_REDIRECT` que atravesaba el `try/catch` del `ConfirmDialog` y disparaba un toast de error espurio aunque la navegación ocurriera correctamente. Las garantías de auditoría e IMP-01/IMP-02/IMP-03 no se ven afectadas. Aprobado por el operador tras verificación end-to-end.

---

## Human Verification Required

No hay ítems pendientes de verificación humana. El checkpoint humano (Task 3 de Plan 03-02) fue completado y aprobado por el operador cubriendo: paleta del negocio, banner fijo, read-only sin botones de mutación, estados activo/suspendido, auditoría (filas de entrada + vista + acceso directo por URL), y el flujo completo de diálogo + navegación.

---

_Verified: 2026-06-20_
_Verifier: Claude (gsd-verifier)_
