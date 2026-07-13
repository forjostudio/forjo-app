---
phase: 01
slug: vertical-canchas
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-30
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Registro autorizado en plan-time (`<threat_model>` de 01-01-PLAN.md). Esta fase es de
> **presentación + resolución de vertical** (terminología/menú), framework-agnóstica, SIN
> tablas/columnas/endpoints nuevos ni datos de tenant nuevos. Riesgo de **regresión**, no de
> aislamiento. `threats_open: 0` y registro plan-time → short-circuit (sin auditor).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| owner (autenticado) → dashboard server components | El dueño autenticado pide rutas del dashboard; el server resuelve su vertical (`resolveVertical`) y decide menú/datos a renderizar. | `business.vertical`/`type` (no sensible); listado de `professionals`/`spaces` del propio tenant (bajo RLS por `business_id`) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-01-01 | Information Disclosure | `app/(dashboard)/equipo/page.tsx` | mitigate | Guard server-side `if (resolveVertical(business).key === 'canchas') redirect('/dashboard')` ubicado ANTES del `Promise.all` de `professionals`/`spaces` (equipo/page.tsx:18). Evita exponer las canchas-como-`professionals` como "Equipo". Acceso ya acotado por `owner_id` + RLS por `business_id`. | closed |
| T-01-02 | Tampering | `lib/verticals.ts` (`resolveVertical`) | accept | Menú/terminología derivan del `vertical` almacenado (bajo RLS por tenant). Cambiar el vertical de OTRO negocio requiere escribir su fila — bloqueado por RLS preexistente (motor v0.12), no por esta fase. Cambiar el PROPIO vertical solo altera la presentación del propio dashboard (sin impacto cross-tenant). | closed |
| T-01-03 | Information Disclosure | `general.types` / removal de `TYPE_TERMINOLOGY_OVERRIDE` | accept | El cutover (quitar `'Cancha de fútbol'` de general, borrar el override) es un cambio de configuración de presentación sin datos sensibles. Sin clientes en prod (D-06) → sin migración ni exposición de datos. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-02 | Manipular el vertical es write a la propia fila bajo RLS; sin impacto cross-tenant (solo cambia la presentación del propio dashboard). El aislamiento real lo sostiene la RLS preexistente del motor v0.12, no esta fase. | Forjo Studio | 2026-06-30 |
| AR-02 | T-01-03 | Cutover de presentación sin datos sensibles; prod sin clientes (D-06). No alcanza el umbral de bloqueo (ASVS L1, block_on: high). | Forjo Studio | 2026-06-30 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-30 | 3 | 3 | 0 | secure-phase (short-circuit: registro plan-time, threats_open 0) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-30
