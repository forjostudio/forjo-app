# CRM — Backlog

Items fuera del scope de las fases actuales, capturados para revisar/promover más adelante (`/gsd:review-backlog`).

---

## BL-01 — Vista de deals "perdidos" en el pipeline

- **Origen:** UAT Phase 4 (test 6, 2026-06-22).
- **Qué:** Hoy el tablero de pipeline solo lee deals `status='open'`. Al marcar un deal como perdido, desaparece del board y solo queda rastreable en el timeline/auditoría. No hay una vista para revisar los deals perdidos.
- **Propuesta:** Una sección/filtro de "Perdidos" (o un tab) que liste los deals `status='lost'` con su `lost_reason`. Posiblemente análogo a una futura vista de "Ganados".
- **Tamaño estimado:** chico-mediano (nueva query + UI de listado, sin migración).
- **Estado:** backlog (feature nuevo, no es bug de Phase 4).

## BL-02 — Renombrar tab "Churn" en el directorio de Negocios

- **Origen:** UAT Phase 4 (test 14, 2026-06-22). El tab proviene de Phase 2 (directorio de Negocios), no de Phase 4.
- **Qué:** El tab "Churn" en `/admin/negocios` usa un término técnico de SaaS poco claro para el operador.
- **Propuesta:** Cambiar el copy a algo más claro: "Bajas" o "Cancelados".
- **Tamaño estimado:** trivial (cambio de copy/label en el filtro de tabs de `negocios-client.tsx`).
- **Estado:** backlog (copy de Phase 2).
