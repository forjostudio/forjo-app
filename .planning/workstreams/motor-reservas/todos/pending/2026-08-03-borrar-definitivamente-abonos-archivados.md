---
created: 2026-08-03T00:00:00.000Z
title: Borrar definitivamente un abono archivado
area: dashboard
milestone: motor-reservas
source: UAT de la Phase 13 (v0.26) — hallazgo del dueño, capacidad nunca discutida
files:
  - app/(dashboard)/abonos/abonos-client.tsx (tabs Activos/Archivados, ya usa ConfirmDialog)
  - app/(dashboard)/abonos/page.tsx
  - supabase/migrations/065_service_snapshot_and_delete_gate.sql (abonos.service_id ya pasó a SET NULL; el snapshot del turno sobrevive al borrado)
---

## Problem

En Abonos → tab "Archivados" los abonos cancelados/completados quedan para siempre. No hay forma
de sacarlos de la lista: se acumulan y ensucian la vista. El dueño lo pidió durante la UAT visual
de la Phase 13, donde vio un abono archivado ("Juan Cliente · Cancha de 6 · Todos los miércoles ·
0 turnos", Cancelado) sin ninguna acción disponible.

No está en el ROADMAP de v0.26 ni se discutió antes. Es capacidad nueva, no un defecto.

## Solution

Agregar borrado definitivo SOLO para abonos archivados (nunca para activos — un abono activo sigue
generando turnos hacia adelante y su borrado ya está bloqueado por diseño).

La decisión de fondo que hay que tomar antes de codear: **qué pasa con los turnos que ese abono
generó**. Tres caminos, y no son equivalentes:

1. **Conservar los turnos, soltar el puntero** — `appointments.abono_id` → NULL y el turno queda
   como cualquier otro en el historial. Es coherente con lo que ya hizo la Phase 13 para los
   servicios (FK en SET NULL + snapshot inmutable): borrar la entidad de configuración nunca
   destruye el historial. Es el camino recomendado y el más barato: la 065 ya dejó
   `abonos.service_id` en SET NULL, así que el precedente y el patrón están.
2. **Borrar el abono y sus turnos futuros no cancelados** — más agresivo; hay que decidir si se
   avisa al cliente.
3. **Borrar todo, incluidos los turnos pasados** — rompe Finanzas retroactivamente. Descartar.

Si se toma el camino 1, el trabajo es: gate en la base (solo `status IN ('cancelled','completed')`),
FK `appointments.abono_id` a SET NULL si no lo está ya, acción en `abonos-client.tsx` con el
`ConfirmDialog` de dos estados que ya existe (mismo molde que el borrado de servicio de la Phase 13),
y verificar que Finanzas y la ficha del cliente siguen mostrando esos turnos con nombre y precio.

Candidata a fase propia del workstream `motor-reservas`, después del polish de la Phase 14.
