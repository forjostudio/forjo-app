---
phase: quick-260625-jqy
plan: 01
subsystem: dashboard-settings
status: complete
tags: [crud, multi-tenant, services, locations, confirm-dialog, soft-disable]
requires: []
provides:
  - "Borrado de servicios/locales con confirmación y manejo de FK (sin borrado optimista)"
  - "Soft-disable de locales vía locations.is_active"
  - "Edición de servicios (nombre, duración, precio, consultorios)"
affects:
  - "app/(dashboard)/settings/settings-client.tsx"
key-files:
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"
decisions:
  - "FK violation (23503) bloquea el borrado y sugiere desactivar; NO se usa ON DELETE CASCADE (preserva historial/pagos)"
  - "NO throw en onConfirm: se muestra toast específico y se cierra el dialog; el item sigue en la lista porque no se filtra del estado"
  - "is_active === false trata null/undefined como activo, consistente con el filtro de la página pública"
metrics:
  duration: "~12 min"
  completed: "2026-06-25"
  tasks: 2
  files: 1
---

# Quick 260625-jqy: Fix borrado y desactivación de locales y servicios — Summary

CRUD de Servicios y Locales en `settings-client.tsx` arreglado: borrado con confirmación (ConfirmDialog) + manejo del error FK real (sin borrado optimista), soft-disable de locales vía `is_active`, y edición de servicios reusando el form de alta.

## Qué se hizo

### Task 1 — Fix borrado (commit 342a7ab)
- Importado `ConfirmDialog` del proyecto; estado `delService`/`delLoc`.
- `deleteService` y `deleteLocation` dejan de ser optimistas: capturan `error`, detectan FK (`error.code === '23503'`) y muestran un toast claro ("tiene turnos asociados. Desactivalo en vez de borrarlo.") sin tocar el estado → el item permanece. Cualquier otro error → toast genérico. Solo en éxito se filtra el item.
- Ambas queries filtran por `.eq('business_id', business.id)` (defensa en profundidad, igual que `deleteProfessional`).
- Los botones de papelera abren el ConfirmDialog (`risk="alto"`, `destructive`, `confirmLabel="Eliminar"`) en vez de borrar al instante.

### Task 2 — Soft-disable de locales + edición de servicios (commit 294ff5f)
- `toggleLocation(id, is_active)`: update sobre `locations.is_active` con `.eq('business_id')`. Botón "Desactivar/Activar" en cada local + nombre tachado (`line-through`) cuando `is_active === false`. El booking público ya filtra `is_active`, así que un local desactivado deja de ofrecerse sin más cambios.
- Edición de servicio: estado `editSvc`/`editSvcForm`/`savingEditSvc`, `openEditService` (puebla desde `serviceLocSet`), `saveEditService` (normaliza `location_ids` vacío → null = "todos", limpia legacy `location_id`, filtra por `business_id`). Botón lápiz en cada servicio abre un Dialog con nombre/min/precio + chips de consultorios espejando el form de alta.

## Verificación
- `npx tsc --noEmit`: 0 errores de fuente (solo errores stale en `.next/` generados, ignorados).
- `npx eslint` del archivo: 10 errores — todos **preexistentes** (mismo count en el baseline antes de los cambios), 0 nuevos. Ver `deferred-items.md`.
- Grep multi-tenant: las 4 funciones tocadas/agregadas (deleteService, saveEditService, deleteLocation, toggleLocation) filtran por `business_id`.

## Deviations from Plan
None — plan ejecutado tal cual. Los lint errors preexistentes (regla nueva `react-hooks/set-state-in-effect` de Next 16, en código no tocado) quedan documentados en `deferred-items.md` por SCOPE BOUNDARY.

## Known Stubs
None.

## UAT pendiente (manual, el usuario verifica)
Ver `<uat_note>` del PLAN: borrar servicio/local con turnos (queda con toast), crear+borrar uno sin turnos (desaparece y persiste), editar servicio, desactivar/activar local y comprobar la página pública.

## Self-Check: PASSED
- FOUND: app/(dashboard)/settings/settings-client.tsx
- FOUND commit: 342a7ab (Task 1)
- FOUND commit: 294ff5f (Task 2)
