# Phase 5: Reportes de Ventas - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 05-reportes-de-ventas
**Areas discussed:** Fuente de MRR/revenue histórico, Cálculo del embudo de conversión, Scope de KPIs extra del mock, Rango temporal + Export

---

## Fuente de MRR / revenue histórico

| Option | Description | Selected |
|--------|-------------|----------|
| Tabla snapshot mensual | Migración + tabla mrr_snapshots escrita 1×/mes vía cron diario; chart lee la tabla | ✓ |
| On-the-fly (solo actual) | Calcular del estado actual, sin historia real | |
| Snapshot + backfill desde audit_log | Reconstruir meses pasados (aproximado, complejo) | |

**User's choice:** Tabla snapshot mensual (recomendado)
**Notes:** Piggyback al cron diario existente `/api/cron/cancel-expired` (Vercel Hobby: 1 cron/día), upsert idempotente dedupe por mes, seed del mes actual al migrar → D-01.

### Sub-decisión: "Ingresos del mes (cobrado)"

| Option | Description | Selected |
|--------|-------------|----------|
| Proxy = facturación recurrente | Usar MRR como proxy, relabelar la tarjeta (no "cobrado") | ✓ |
| Pagos MP persistidos | Persistir pagos desde el webhook MP (más grande) | |
| Diferir la tarjeta a v2 | Mostrar solo MRR | |

**User's choice:** Proxy = facturación recurrente (recomendado v1) → D-03. Cobrado real diferido a v2.

---

## Cálculo del embudo de conversión

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot por etapa alcanzada | Foto del pipeline; deal cuenta en 1..N; ventana 90d por created_at | ✓ |
| Cohorte real (audit_log) | Progresión real vía historial de transiciones (más complejo) | |
| Snapshot actual sin ventana | Sin recorte temporal de 90d | |

**User's choice:** Snapshot por etapa alcanzada (recomendado) → D-04. Ganados cuentan hasta pago; perdidos cortan en su última etapa.

---

## Scope de KPIs extra del mock (ARPA, Lead→Activo, Churn)

| Option | Description | Selected |
|--------|-------------|----------|
| ARPA + Lead→Activo, diferir Churn | Los baratos entran, churn se difiere | (base) |
| Solo RPT-01/02 estricto | Diferir los tres extras | |
| Todo el mock incl. Churn | Churn desde audit_log ahora | |

**User's choice:** Delegada a `forjo-advisor` (decisión técnica de scope).
**Notes:** El advisor resolvió una variante refinada de A: los **5 KPIs entran** (fidelidad A12), pero Churn se computa degradado-honesto — cuenta de bajas desde `audit_log` (business.suspend neto de reactivate) desde el día 1, y la tasa % usa el active_count del mes previo de mrr_snapshots con empty-state "sin historia suficiente" hasta acumular ≥1 snapshot. Razón: no romper el contrato de diseño con una tarjeta vacía, pero tampoco shipear un churn% engañoso. Cero infra nueva (reusa mrr_snapshots + audit_log). → D-05.

---

## Rango temporal (3/6/12m) + Exportar

| Option | Description | Selected |
|--------|-------------|----------|
| Rango funcional, Export diferido | Toggle re-consulta de verdad; export a v2 | ✓ |
| Rango funcional + Export CSV ahora | Export CSV server-side ahora | |
| Rango cosmético v1 + Export diferido | Toggle no re-consulta | |

**User's choice:** Rango funcional, Export diferido (recomendado) → D-08. Export coordinado con el export/import de gestion-rebrand (no duplicar).

---

## Claude's Discretion

- Schema exacto de `mrr_snapshots` (columnas, índices, unique (month, plan)).
- Estructura de componentes client de charts.
- Naming interno de funciones/archivos dentro de convenciones del repo.

## Deferred Ideas

- "Ingresos del mes" cobrado real (persistir pagos MP) → v2.
- Exportar (CSV/PDF) → v2 (coordinar con export/import de gestion-rebrand).
- Backfill histórico de MRR desde audit_log → descartado (aproximado/complejo).
