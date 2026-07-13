# Phase 3: Admin Endpoint Hardening - Discussion Log

> **Audit trail only.** Decisiones canónicas en CONTEXT.md.

**Date:** 2026-06-16
**Phase:** 3-Admin Endpoint Hardening
**Mode:** interactive (default)
**Areas discussed:** Disposición de setup-plans, Dónde vive el helper timing-safe

---

## Disposición de setup-plans

| Option | Description | Selected |
|--------|-------------|----------|
| Script local + borrar endpoint | Mover lógica a scripts/setup-mp-plans.ts y borrar el route web | ✓ |
| Header-only + timing-safe (mantener) | Dejar el endpoint, solo header | |
| Borrar sin script | Borrar directo, ya se corrió | |

**Decisión:** Script local + borrar el endpoint web. Elimina toda la superficie (incluido el `?secret=`); capacidad de re-setup preservada en un script que se corre a mano.

---

## Dónde vive el helper timing-safe

| Option | Description | Selected |
|--------|-------------|----------|
| Helper compartido (lib/admin-auth.ts) | safeEqual + checkAdminSecret reusado | |
| Inline en cada endpoint | comparación timing-safe en cada route | ✓ |

**Decisión:** Inline. Con setup-plans borrado, set-plan es el único endpoint admin web → inline en set-plan, sin helper compartido.

## Claude's Discretion
- Runner del script (tsx devDep + npm script recomendado, no hay tsx/ts-node hoy).
- Logueo opcional de intentos fallidos (sin loguear el secreto).

## Deferred Ideas
- Unificar fuentes de planes → v2.
- Rate-limiting/lockout admin → fuera de SEC-03.
