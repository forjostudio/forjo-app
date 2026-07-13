---
status: resolved
trigger: "Al borrar un turno desde el panel, el evento queda huérfano en Google Calendar"
created: 2026-06-18
updated: 2026-06-18
---

# gcal-orphan-on-delete

## Current Focus
hypothesis: (confirmada por el usuario antes de abrir la sesión)
next_action: (none — resuelto)

## Root Cause
El borrado desde el panel era un `.delete()` client-side (navegador, anon-key + sesión del
dueño) que nunca llamaba a `deleteCalendarEvent` — y no podía: `google_refresh_token` es
server-only (vive en `business_secrets`). Al ser hard-delete, el sync inverso GCal→app
(one-way por diseño) tampoco podía limpiar el evento después, porque la fila y su
`google_event_id` ya no existían. Los caminos server-side (`cancel/[token]`, webhook de pago)
sí borraban el evento; el panel no.

Call-sites afectados:
- app/(dashboard)/appointments/appointments-client.tsx (handleDelete)
- app/(dashboard)/clients/clients-client.tsx (deleteClient bulk + deleteAppt)

## Fix
1. Nuevo endpoint server `POST /api/appointments/delete` (valida sesión + ownership, filtra por
   business_id, borra el/los evento(s) de GCal en `after()` best-effort, recién borra la fila).
   Acepta `{ appointmentId }` (single) o `{ clientId }` (todos los turnos del cliente + el cliente).
2. Reemplazados los 3 `.delete()` de turnos client-side por llamadas a ese endpoint.
3. Agregado borrado de evento GCal al cancel desde el panel (`/api/notify/cancel`), para
   consistencia con el cancel público por token.

mergeGroup (clients-client.tsx:348) NO se tocó: reasigna los turnos del duplicado al cliente
que se conserva (no los borra) → cero riesgo de evento huérfano.

## Verification
- `npx tsc --noEmit` limpio.
- `npx eslint` sobre los 4 archivos: sin errores nuevos (los reportados son preexistentes).
- UAT manual pendiente del usuario: crear turno con GCal conectado → borrar desde panel y desde
  Clientes → el evento debe desaparecer de Google. Doble delete / turno sin google_event_id no
  debe romper (404/410 = éxito en deleteCalendarEvent).

files_changed:
- app/api/appointments/delete/route.ts (nuevo)
- app/api/notify/cancel/route.ts
- app/(dashboard)/appointments/appointments-client.tsx
- app/(dashboard)/clients/clients-client.tsx
