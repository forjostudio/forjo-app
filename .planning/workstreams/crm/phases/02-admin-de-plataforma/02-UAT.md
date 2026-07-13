---
status: complete
phase: 02-admin-de-plataforma
source: [02-VERIFICATION.md]
started: 2026-06-18T14:15:00Z
updated: 2026-06-18T16:35:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Corte real de 'suspended' (booking 403 + redirect del dashboard)
expected: POST /api/booking/create con el slug de un negocio suspended responde 403 { ok:false, error:'plan_inactive' } antes de reCAPTCHA/slot; el dueño suspended es redirigido a /suspendido y no entra al dashboard.
result: pass

### 2. Auditoría del path externo set-plan (requiere aplicar migración 033)
expected: Tras aplicar a mano la migración 033 (audit_log.actor_id → nullable), un POST /api/admin/set-plan con x-admin-secret que cambie plan o status queda registrado en audit_log con actor_id NULL (= "Sistema"); el insert NO falla por NOT NULL.
result: pass

### 3. Trigger anti-escalación del dueño (migración 032)
expected: Como usuario dueño NO-admin, un UPDATE businesses SET has_whatsapp=true / plan='pro' / plan_status='active' sobre su propia fila NO cambia esas 4 columnas — el trigger businesses_protect_admin_columns las revierte; solo el service-role (server actions del CRM) las escribe.
result: pass

### 4. Flujo end-to-end de la ficha + editor de precios → auditoría
expected: Como operador, recorrer la ficha (cambiar plan, suspender escribiendo "SUSPENDER", reactivar, extender trial con preset y con fecha exacta, togglear los 2 add-ons) y editar un precio en /admin/planes (escribiendo "CONFIRMAR") → cada acción muestra el ConfirmDialog correcto por riesgo, se refleja tras revalidatePath, y aparece una entrada en /admin/auditoria con el action code y riesgo correctos.
result: pass
note: |
  Pasó tras los fixes verificados en UAT (commits a main): selector de plan que elige destino
  (0dc3da1) + label del selector (2e61338) + vencimiento en la ficha (2e61338) + gating de acciones
  por estado (195a96e) + "Renovación automática" en activos sin fecha MP (post 195a96e) + extender
  trial suma desde el fin vigente, no desde hoy (e8870da) + NUEVA acción "Poner en trial"
  status→trial auditada trial.grant (cf6cc1a). Add-ons fuera del MRR = por diseño (D-03/D-08, cobro
  manual → ADDON-PAY-01 v2), NO defecto. Reactivar sigue → activo (restaurar trial previo =
  migración 034, diferido).
scope_addition: |
  "Poner en trial" (grantTrial / código de auditoría trial.grant) es capacidad NUEVA más allá de
  ADM-04 (que cubría suspender + extender). Aprobada por el operador durante la UAT (2026-06-18).

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "El operador cambia el plan de un negocio a un plan ESPECÍFICO desde la ficha (ADM-03), no solo ciclando al siguiente"
  status: resolved
  reason: "Resuelto en UAT (commit 0dc3da1): selector de plan en la ficha que pasa el destino explícito a changePlan, en vez de ciclar al siguiente."
  severity: major
  test: 4
  artifacts: ["app/(crm)/admin/negocios/[id]/ficha-client.tsx"]
  missing: []
