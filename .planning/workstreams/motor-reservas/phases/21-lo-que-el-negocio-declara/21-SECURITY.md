---
phase: 21-lo-que-el-negocio-declara
status: secured
threats_total: 12
threats_closed: 12
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
audit_depth: L1 (grep-depth, short-circuit por registro autorado en tiempo de plan)
audited: 2026-09-12
---

# Security — Phase 21: lo que el negocio declara

Registro heredado de los `<threat_model>` de `21-01-PLAN.md` (T-21-01..T-21-07, T-21-SC) y
`21-02-PLAN.md` (T-21-08..T-21-11). El plan 21-02 hereda sin cambios el registro de 21-01: no toca
el write path, no agrega parámetros al RPC y no modifica ninguna policy.

## Threat Register

| Threat ID | Category | Severity | Disposition | Status | Evidence |
|-----------|----------|----------|-------------|--------|----------|
| T-21-01 | Elevation of Privilege | high | mitigate | CLOSED | `p_business_id: business.id` aparece exactamente 1 vez en `page.tsx`; 0 usos de service-role en el alta. Capas 2 y 3 (RPC `SECURITY INVOKER` con `not_your_business`, RLS por `business_id`) sin cambios. |
| T-21-02 | Spoofing | medium | mitigate | CLOSED | PK generada en el cliente (D-09) acotada por la policy de INSERT de `services`: un id forjado rebota con `23505`, nunca cruza tenants. Verificado contra DB local en el Task 1 del plan 21-01. |
| T-21-03 | Tampering | high | mitigate | CLOSED | FK compuesta `tbs_service_same_tenant` presente en `supabase/migrations/073_tenant_integrity_and_default_privs.sql` — rechazo en la base, no en el cliente. |
| T-21-04 | Information Disclosure | medium | mitigate | CLOSED | Los tres componentes que la amenaza nombra loguean `.code`: insert de servicios (`page.tsx:499`), profesionales (`:528`) y RPC de agenda (`:557`). Los toasts son literales del cliente, sin interpolar nada de la base. |
| T-21-05 | Repudiation / fallo mudo | medium | mitigate | CLOSED | El error del RPC se chequea (`agendaErr`, 4 referencias) y degrada con copy honesta, incluido el caso `PGRST202`. |
| T-21-06 | Elevation of Privilege | high | accept | CLOSED | N/A por construcción: el alta importa `@/lib/supabase/client` (anon key). 0 ocurrencias de `createAdminClient`/`SERVICE_ROLE`. |
| T-21-07 | Denial of Service | low | accept | CLOSED | Riesgo preexistente no agravado: mismo volumen y mismo RPC que el panel desde la Phase 19. |
| T-21-08 | Information Disclosure | low | accept | CLOSED | Los nombres del aviso son del propio negocio y sólo se ven en la sesión del dueño; las filas del cálculo se fabrican desde el estado local del wizard. |
| T-21-09 | Tampering | low | mitigate | CLOSED | 0 ocurrencias de `dangerouslySetInnerHTML`. Interpolación como texto de React (escapado por defecto). |
| T-21-10 | Denial of Service (usabilidad) | medium | mitigate | CLOSED | `handleFinish` no referencia `avisoSinCobertura` (0 coincidencias, scope acotado con `awk`); el botón Finalizar conserva su única condición de deshabilitado. |
| T-21-11 | Repudiation / fallo mudo | medium | mitigate | CLOSED | `servicesWithoutCoverage` se apoya en `hasScheduleCoverage`, cuya guarda de negocio sin franjas (`blocks.length === 0`) está presente en `lib/time-block-services.ts`. |
| T-21-SC | Tampering (supply chain) | high | mitigate | CLOSED | Cero paquetes nuevos: `git status --porcelain -- package.json package-lock.json` vacío. |

## Accepted Risks

- **T-21-06** — service-role filtrado al bundle. Aceptado como N/A por construcción, con la nota del
  plan: si una implementación futura propone service-role en el alta, es un blocker, no una optimización.
- **T-21-07** — payload sin tope de franjas. Preexistente desde la Phase 19, no agravado por esta fase.
- **T-21-08** — el aviso nombra servicios del propio negocio en la sesión del dueño. Sin dato de otro tenant al alcance.

## Notas del auditor

- Los gaps cosméticos cerrados en el commit `670f7b2` (G-21-10, G-21-12, G-21-13) son exclusivamente
  `className` y markup: no agregan superficie de ataque ni tocan ninguna de las mitigaciones de arriba.
- Fuera del alcance de T-21-04, pero registrado: `page.tsx:585` hace `console.error(err)` con el objeto
  de error completo. Es consola del servidor, no pantalla, y queda debajo del umbral `block_on: high`.
- **Riesgo preexistente que esta fase no toca ni empeora:** `book_slot_atomic` ejecutable por `anon`
  (severidad alta, milestone anterior). Esta fase no crea funciones ni `GRANT`s.

## Security Audit 2026-09-12

| Metric | Count |
|--------|-------|
| Threats found | 12 |
| Closed | 12 |
| Open | 0 |
