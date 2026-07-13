# Phase 2: Admin de Plataforma - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-18
**Phase:** 02-admin-de-plataforma
**Areas discussed:** Precios + moneda + MRR, Suspensión + extensión de trial, Catálogo y storage de add-ons, Alertas + pagos fallidos

---

## Precios editables + moneda + MRR (ADM-05, ADM-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Mover precios a DB/config | Precios de `lib/plans.ts` → DB editable desde `/admin`; `lib/plans.ts` queda como seed/fallback | ✓ |
| Dejar precios hardcodeados | No editables desde el panel | |

**User's choice:** Mover a DB/config editable. Moneda = **ARS**. **MRR = Σ(precio del plan × negocios activos por plan)** — MRR actual, no histórico.
**Notes:** Persistir el monto cobrado por suscripción (para MRR histórico) = mejora futura, no v1.

---

## Suspensión + extensión de trial (ADM-04)

| Option | Description | Selected |
|--------|-------------|----------|
| `suspended` como valor de `plan_status` | Reusar el enum existente; suspender corta booking + dashboard reusando el gate SEC-04 | ✓ |
| Columna `is_suspended` aparte | Flag booleana separada de `plan_status` | |
| Suspensión solo como marca CRM | Sin efecto real sobre el negocio | |

**User's choice:** `suspended` como nuevo valor de `plan_status`. Corta de verdad: blocklist de `booking/create` (SEC-04) + check en el layout del dashboard. Extensión de trial: **presets 7/14/30 + fecha exacta**.
**Notes:** Reusar el gate de plan de v0.9 (SEC-04) que ya rechaza expired/cancelled.

---

## Catálogo y storage de add-ons (ADM-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Flags booleanas por negocio | Columnas `has_web_custom`, `has_whatsapp` en `businesses` — set chico y fijo | ✓ |
| Tabla/jsonb de add-ons | Catálogo extensible | |

**User's choice:** Flags booleanas (`has_web_custom`, `has_whatsapp`).
**Notes:** `has_whatsapp` = MISMA flag que gatea la Bandeja de Mensajes del milestone Gestión rebrand (naming consistente entre milestones). Add-on = "Recordatorios WhatsApp", NO "SMS".

---

## Alertas + "pagos fallidos": fuente y frescura (ADM-07, ALERT-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Derivar en vivo al cargar | Alertas/KPIs calculados de `plan_status` + `trial_ends_at` al abrir `/admin`; sin tabla de eventos, sin tocar el webhook | ✓ |
| Persistir eventos | Tabla de notificaciones; webhook escribe eventos discretos | |

**User's choice:** Derivar en vivo, sin tabla de eventos y sin tocar el webhook (lo que v0.9 endureció no se toca). KPIs en vivo al abrir `/admin` (un operador, bajo tráfico → sin cron). Alertas clickeables → ficha del negocio.
**Notes:** Persistir un evento "pago falló" discreto = v2.

---

## Claude's Discretion

- Cambiar plan desde el CRM = nueva server action con `requireAdmin()` + `logAudit()`, reusando la lógica de `set-plan` (no el route con ADMIN_SECRET).
- Fuente del email de contacto en la ficha (`auth.users` vs `notification_email`).
- Filtros/búsqueda del directorio (seguir mockup `03-negocios.png`).
- Nombre exacto de tabla de precios + columnas de add-on en la migración 032.
- Estructura de archivos dentro de `app/(crm)/admin/`, `components/crm/`, `lib/`.

## Deferred Ideas

- Persistir monto por suscripción + MRR histórico → v2.
- Evento discreto "pago falló" persistido → v2 (NOTIF-EXT-01 relacionado).
- Cobro automático de add-ons → v2 (ADDON-PAY-01).
