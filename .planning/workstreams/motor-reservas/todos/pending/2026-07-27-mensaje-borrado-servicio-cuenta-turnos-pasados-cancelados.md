---
created: 2026-07-27T14:00:00.000Z
title: "Mensaje de borrado engañoso: cuenta turnos pasados/cancelados sin aclararlo"
area: ux-copy
files:
  - app/(dashboard)/settings/settings-client.tsx:403
  - app/(dashboard)/settings/settings-client.tsx:738
  - components/dashboard/canchas-manager.tsx:181
---

## Problem

Al intentar borrar un **servicio / sede / cancha** que tiene turnos asociados, el toast dice
"No se puede eliminar: tiene turnos asociados. Desactivalo en vez de borrarlo." — técnicamente
cierto pero **engañoso**: el guard es el **FK de Postgres (error 23503)**, que cuenta TODAS las
filas de `appointments` que referencian el id, **sin mirar el status** (incluye pasados y
cancelados). Cancelar un turno NO borra la fila, solo la marca `cancelled`.

**Detectado en UAT de Phase 10 (2026-07-27).** El operador canceló todos los turnos, vio "no hay
más turnos" en la vista activa, y el borrado seguía bloqueado. Lo descubrió por prueba y error:
recién al **hard-deletear** las filas desde Turnos → Todos/Pasados se soltó la referencia y el
borrado funcionó. Contraintuitivo.

## Contexto (no es bug de comportamiento)

- El FK que bloquea el borrado **protege el historial de Finanzas** (reportes por servicio) — orphanar
  turnos rompería los reportes. NO cambiar el comportamiento.
- **Desactivar** (`toggleService` → `services.active`; `locations.is_active`; el ojo en canchas) YA
  resuelve el caso "quiero conservar el historial y dejar de ofrecerlo": conserva el ítem + los turnos
  pasados y deja de ofrecerse en público. Solo que el mensaje no lo explica.

## Fix propuesto (puro copy — chico, bajo riesgo)

Mejorar los 3 toasts (servicio, sede, cancha) para que aclaren lo que cuenta y ofrezcan las dos vías:

> "No se puede eliminar: tiene turnos asociados, incluidos pasados y cancelados (cancelar no los
> borra). Desactivalo para dejar de ofrecerlo y conservar el historial, o borrá esos turnos primero."

Revisar también `deleteProfessional` (settings-client.tsx:573) por si le falta el mismo manejo del 23503.

## Alcance

Phase 11 (cierre de backlog / POLISH). `/gsd:quick` alcanza (solo strings de toast). No toca DB ni
lógica de borrado.
</content>
