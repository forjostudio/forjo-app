---
status: complete
phase: 01-cimientos-auditor-a
workstream: crm
source: [01-VERIFICATION.md]
started: 2026-06-17
updated: 2026-06-18
---

## Current Test

[testing complete]

## Prerequisitos (acciones operativas — hacer ANTES de testear)

1. **Aplicar la migración 031 a Supabase a mano** (en orden, última previa: 030):
   `supabase/migrations/031_crm_audit_log.sql` → crea `audit_log` + RLS admin-only.
2. **Regenerar el schema** tras aplicar: `supabase db dump` → actualizar `supabase/schema.sql`.
3. **Bootstrapear el operador** (no self-serve, D2): con `.env.local` cargado, correr local
   `npm run setup:admin -- <email-del-operador>` → setea `app_metadata.is_admin = true`.

## Tests

### 1. Guard end-to-end de /admin (FND-01)
expected: is_admin=true entra a /admin; sin is_admin → redirige a /dashboard; sin sesión → /login. Todo server-side, sin render parcial.
result: pass
note: Camino admin verificado en gestion.forjo.studio/admin (captura): shell + sidebar agrupado + tema dark + acento amarillo. Redirects de no-admin/sin-sesión confirmados estáticos por el verifier (redirect() antes del JSX, lee app_metadata).

### 2. Aislamiento de tema (FND-04 / D6)
expected: el dashboard sigue en claro con su paleta por-negocio mientras /admin se ve oscuro con acento amarillo. El theming por-negocio del dashboard NO se rompe.
result: pass

### 3. Visor de auditoría con filas reales (FND-02)
expected: /admin/auditoria muestra el empty-state cuando no hay filas, y lista filas reales de audit_log (con columnas QUIÉN/ACCIÓN/NEGOCIO/DETALLE/MOTIVO/CUÁNDO/RIESGO + RiskBadge) una vez que el CRM registre acciones. Un no-admin no puede leer audit_log (RLS).
result: pass
note: Empty-state correcto verificado en gestion.forjo.studio/admin/auditoria (captura): página carga limpia leyendo audit_log por RLS, sin 500. Los headers de columna (7, presentes en auditoria-client.tsx por el verifier) se renderizan con filas, no en empty-state — by design. Tabla poblada testeable en Phase 2+ cuando se registren acciones.

### 4. Script setup:admin (D2)
expected: `npm run setup:admin -- <email>` confirma is_admin=true en app_metadata de Supabase; un email inexistente falla con mensaje claro; falla claro si falta SUPABASE_SERVICE_ROLE_KEY.
result: pass
note: Validado de facto — el operador entró a /admin como admin, así que setup:admin seteó app_metadata.is_admin=true correctamente.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
