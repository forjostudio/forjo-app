# Requirements — workstream `motor-reservas`

> **Sin milestone activo.** El último cerrado es **v0.27 Cupo unificado por servicio**
> (Phases 15-17, shipped 2026-08-24), archivado en:
>
> - `.planning/milestones/v0.27-REQUIREMENTS.md`
> - `.planning/milestones/v0.27-ROADMAP.md`
>
> Los requisitos del próximo milestone se definen con `/gsd:new-milestone --ws motor-reservas`.
> Este archivo se reemplaza entero en ese paso — no acumula milestones (los anteriores viven en
> `.planning/milestones/`).

## Pendientes que arrastra el workstream

9 todos en `todos/pending/`. Los dos de seguridad, **los dos pre-existentes**, son los que conviene
mirar primero al armar el próximo milestone:

- **`book_slot_atomic` es ejecutable por `anon`** (severidad **alta**, desde la migr. 041): saltea la
  ventana de reserva, el gate de plan y el reCAPTCHA, que viven **solo** en el route handler. No es
  cross-tenant — la función re-impone `business_id` — pero el eje "controles que existen solo en el
  handler mientras la base expone el mismo camino sin ellos" nunca se auditó.
- **El filtro por tenant del gate se esquiva moviendo `services.business_id`** a otro negocio del mismo
  dueño (media): reabre R-1 por una cadena que no pasa por `individual`.

Y uno de infraestructura que ya cuesta plata en cada fase: **las suites de abono son flaky en
paralelo**, así que `npx vitest run` completo **no sirve hoy como gate** — cada fase gasta corridas
demostrando que el rojo no fue suya.
