---
phase: 11-cierre-de-backlog
plan: 02
subsystem: dashboard-settings
tags: [ux-copy, delete-guard, fk-23503, canchas, professionals]
requires: []
provides:
  - "Copy honesto en los toasts de borrado bloqueado por FK (servicio/sede/cancha): aclara pasados+cancelados y ofrece las dos vías"
  - "deleteProfessional captura el error del DELETE, ramifica 23503 y no muta el estado cuando el FK bloquea"
affects:
  - "app/(dashboard)/settings/settings-client.tsx"
  - "components/dashboard/canchas-manager.tsx"
tech-stack:
  added: []
  patterns:
    - "delete NO optimista: capturar { error }, ramificar error.code === '23503', return sin mutar estado si falló (analog deleteService)"
key-files:
  created: []
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"
    - "components/dashboard/canchas-manager.tsx"
decisions:
  - "El comportamiento del borrado NO cambia: el FK 23503 sigue protegiendo el historial de Finanzas; el soft-disable es la vía correcta (D-04)"
  - "Mensaje genérico 'tiene turnos asociados' para profesional: el FK que bloquea es el de appointments; professional_services/agenda_spaces caen por CASCADE (Assumptions Log A3)"
metrics:
  duration: "~15min"
  completed: "2026-07-27"
status: complete
---

# Phase 11 Plan 02: EXTRA-A — Copy de borrado bloqueado + fix deleteProfessional Summary

Aclara el copy engañoso de los toasts de borrado bloqueado por FK (23503) en servicio, sede y cancha, y alinea `deleteProfessional` al patrón de `deleteService` para que deje de mentir "eliminado" cuando el FK protege el historial.

## What Was Built

- **3 toasts (copy, D-04):** los mensajes de borrado bloqueado por FK ahora aclaran que "tiene turnos asociados" incluye **pasados y cancelados** (cancelar no borra la fila) y ofrecen las **dos vías**: desactivar para conservar el historial, o borrar esos turnos primero. Aplicado en:
  - `settings-client.tsx:403` (servicio, "Desactivalo")
  - `settings-client.tsx:738` (sede, `${locWord}`, "Desactivalo")
  - `canchas-manager.tsx:181` (cancha, "Desactivala")
- **Fix `deleteProfessional` (`settings-client.tsx:573`):** antes hacía `delete` fire-and-forget con borrado optimista de la lista y `toast.success('Profesional eliminado')` aunque el FK 23503 bloqueara → toast mentiroso. Ahora captura `const { error }`, ramifica `error.code === '23503'` (copy nuevo "el profesional" + "Desactivalo", **sin** mutar `setProfessionals`/`setAgendaSpaces`), toast genérico para otros errores, y solo en el camino sin error saca la fila y muestra el success.

## Root Cause / Diagnosis

`deleteProfessional` era el único de los 4 handlers de borrado que no capturaba el error del DELETE (los otros ya seguían el patrón de `deleteService`). Como el FK `appointments → professionals` (23503) bloquea el borrado en la DB pero el handler no leía el error, la UI aplicaba el borrado optimista y mostraba "eliminado" cuando en realidad la fila seguía en la base. El fix espeja `deleteService` exactamente.

## Deviations from Plan

**None — plan ejecutado tal cual.** Solo copy + el handler; no se tocó la lógica de cancelación ni el motor, ni ninguna condición de ramificación (`error.code === '23503'` / `res.error === 'has_appointments'`), ni el soft-disable.

## Deferred Issues (out of scope)

`npm test` reporta 9 fallos en 4 archivos (`abono-create`, `abono-generation`, `abono-cancel`, `abono-cron`, `booking-core`, `manual-booking`, `staff-assignment`), **todos** por timeout de hooks/tests (`Hook timed out in 10000ms` / `Test timed out in 5000ms`) contra el Supabase local (fase de import de 133s). Son tests de integración DB pre-existentes, **sin relación con este cambio**: ningún test referencia `settings-client.tsx` ni `canchas-manager.tsx` (verificado con grep), y el cambio es solo copy de toasts + un handler de UI client-side. `tsc --noEmit` limpio y **762 tests pasan**. No se corrigen aquí (fuera de alcance: entorno/DB, no el diff del plan).

## Verification

- `./node_modules/.bin/tsc --noEmit` → limpio.
- `grep 'pasados y cancelados'` → presente en `settings-client.tsx` y `canchas-manager.tsx`.
- `grep "error.code === '23503'"` → presente en `settings-client.tsx` (deleteService, deleteLocation y ahora deleteProfessional).
- Manual (pendiente UAT): borrar servicio/sede/cancha/profesional con turnos muestra el toast nuevo y el profesional NO desaparece de la lista.

## Commits

- `8e34b00` fix(11-02): copy honesto de borrado bloqueado + deleteProfessional captura 23503 (EXTRA-A)

## Self-Check: PASSED
- FOUND: app/(dashboard)/settings/settings-client.tsx (modificado)
- FOUND: components/dashboard/canchas-manager.tsx (modificado)
- FOUND commit: 8e34b00
