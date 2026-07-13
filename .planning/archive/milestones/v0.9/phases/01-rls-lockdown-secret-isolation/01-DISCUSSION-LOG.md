# Phase 1: RLS Lockdown + Secret Isolation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 1-RLS Lockdown + Secret Isolation
**Mode:** `--auto` (recommended option auto-selected for each area; no interactive prompts)
**Areas discussed:** Mecanismo de aislamiento de secretos, Build order y seguridad de migración, Exposición de services/business_hours, Lecturas owner-side del dashboard, Rotación condicional de claves

---

## Mecanismo de aislamiento de secretos

| Option | Description | Selected |
|--------|-------------|----------|
| Tabla `business_secrets` (RLS solo-dueño) | Separación física de los secretos; lectura solo service-role | ✓ |
| Policy column-scoped sobre `businesses` | Acotar columnas dentro de la policy de lectura | |

**Auto-selección:** Tabla `business_secrets` (pre-decidido en PROJECT.md Key Decisions — RLS es row-level, no column-level).
**Notes:** Decisión heredada del proyecto, no re-discutida.

---

## Build order y seguridad de migración

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback backward-compatible | Leer `business_secrets` con fallback a `businesses`, dropear columnas en paso final | ✓ |
| Ventana coordinada migración+deploy | Aplicar migración y deploy en ventana ajustada simultánea | |

**Auto-selección:** Fallback backward-compatible (recomendado — más seguro con migraciones aplicadas a mano).
**Notes:** Evita el landmine de `select('*')` en el webhook de seña. Migración objetivo: 027.

---

## Exposición de services / business_hours

| Option | Description | Selected |
|--------|-------------|----------|
| Vistas públicas acotadas completas | Replicar patrón 026/007 (`CREATE VIEW` + `GRANT` + `DROP POLICY`) | ✓ |
| Lockdown mínimo | Solo dropear `USING(true)` y asegurar selects server-side | |

**Auto-selección:** Vistas acotadas completas (recomendado — consistencia con el patrón existente + defensa en profundidad).

---

## Lecturas owner-side del dashboard

| Option | Description | Selected |
|--------|-------------|----------|
| Presencia/booleanos vía service-role | El dashboard muestra ¿hay token? sin exponer el valor | ✓ |
| Owner-RLS select de valores en business_secrets | Devolver valores al cliente bajo RLS de dueño | |

**Auto-selección:** Presencia/booleanos vía service-role (recomendado — nunca exponer secretos crudos al cliente).

---

## Rotación condicional de claves

| Option | Description | Selected |
|--------|-------------|----------|
| Flag para decisión humana + rotar defensivamente si hay duda | Requiere saber si la app corrió en URL pública con secretos reales | ✓ |
| Asumir no-rotación | Asumir que solo corrió en localhost | |

**Auto-selección:** Flag para decisión humana (D-06). Default recomendado: rotar reCAPTCHA/Resend/ADMIN_SECRET/CRON_SECRET si hay incertidumbre.
**Notes:** NO auto-resoluble — depende de un hecho operativo que solo el usuario conoce. Acción fuera del repo.

## Claude's Discretion

- Nombres exactos de las vistas y forma precisa (columnas/defaults/FK) de `business_secrets` — a definir en planning siguiendo 026/007.

## Deferred Ideas

- Endurecimiento de firma + chequeo de monto del webhook de seña → Fase 2 (SEC-02).
- Cifrado at-rest por secreto, `webhook_events`, unificación de planes → backlog v2.
