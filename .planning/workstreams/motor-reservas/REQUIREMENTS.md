# Requisitos — workstream `motor-reservas`

> **No hay milestone activo.** Los requisitos del último, **v0.29 — El catálogo del booking**
> (Phases 22-24, shipped 2026-09-28), se archivaron completos en
> [`.planning/milestones/v0.29-REQUIREMENTS.md`](../../milestones/v0.29-REQUIREMENTS.md) con sus
> 11/11 satisfechos.
>
> **El próximo milestone escribe este archivo desde cero** — `/gsd-new-milestone` lo regenera con sus
> propios requisitos. No agregues requisitos acá a mano: se perderían al arrancar el milestone nuevo.

## Historial de milestones del workstream

| Milestone | Fases | Requisitos | Archivo |
|---|---|---|---|
| v0.29 — El catálogo del booking | 22-24 | 11/11 | [`v0.29-REQUIREMENTS.md`](../../milestones/v0.29-REQUIREMENTS.md) |
| v0.28 — La agenda por servicio | 18-21 | 8/8 | [`v0.28-REQUIREMENTS.md`](../../milestones/v0.28-REQUIREMENTS.md) |
| v0.27 — Cupo unificado por servicio | 15-17 | — | [`v0.27-REQUIREMENTS.md`](../../milestones/v0.27-REQUIREMENTS.md) |

> Los milestones anteriores del workstream (v0.12, v0.22, v0.24, v0.25, v0.26) están en el historial
> del ROADMAP; ver `.planning/MILESTONES.md` para el resumen de cada uno.

## Candidatos para el próximo milestone

Sin decidir. Lo que quedó registrado durante v0.29, con el diagnóstico ya hecho:

- **Asignar sede a un profesional.** La columna `professionals.location_id` **ya existe** con su FK;
  falta la UI. ⚠ Decidir primero si un profesional pertenece a **una** sede o a **varias** — la
  columna es singular y los servicios usan `location_ids` en plural; multi-sede necesitaría migración.
- **Cuarto modo de orden: precio de mayor a menor.** Necesita **migración 080** (el CHECK
  `businesses_service_sort_mode_chk` lista los tres valores literales), más el comparador, el selector
  del panel y su whitelist de escritura.
- **Copys del panel:** aviso al crear una sucursal ("asignale horarios para que aparezca en la página
  de reserva"), *"Elegí **el** sucursal"* → "la", y *"Matrícula / Nº de registro"* → "Matrícula".
- **Empty state con cero servicios** en el booking público (hoy queda en blanco bajo el `h2`).
- **Deuda de seguridad heredada:** cuatro writes sin `.eq('business_id', …)` en `settings-client.tsx`
  (`:1526`, `:1840`, `:1849`, `:1875`), de junio 2026. Hoy los contiene la RLS — una sola capa donde
  la doctrina del repo pide dos.
- **Pre-chequeo de bajada de cupo** en el diálogo de edición de servicio (el stepper inline sí lo
  tiene). Diferido en v0.29 porque un `ConfirmDialog` ahí anidaría modales.
