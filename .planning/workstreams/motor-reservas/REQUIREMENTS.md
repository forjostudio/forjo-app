# Requirements: Forjo App — v0.22 "Turnos: alta manual y ventana de reserva" (workstream `motor-reservas`)

> **Corrección de scope (2026-07-18):** el **alta manual de turnos ya está shipeada en v0.12**
> (MANUAL-01/02/03: botón "Nuevo turno" en Agenda/Turnos → `app/api/appointments/create/route.ts`,
> autenticado, reusa `createAppointmentCore`, sincroniza Google Calendar; NO manda mail al cliente por
> decisión de v0.12). Por eso v0.22 NO reconstruye el alta manual: agrega el **límite de ventana de
> reserva** (feature nueva) y un **aviso opt-in por mail** al alta manual existente.

## v0.22 Requirements

### Ventana de reserva (BOOK-WINDOW)

- [ ] **BOOK-WINDOW-01**: El dueño configura en Ajustes la anticipación máxima con la que se puede
  reservar (días), como una sola métrica **global por negocio** (`businesses.max_advance_days`; vacío/0
  = sin límite).

- [x] **BOOK-WINDOW-02**: El calendario público no deja elegir un día más allá de la ventana, en los
  **dos** calendarios (general `booking-client.tsx` y canchas `canchas-booking-client.tsx`): cap de la
  navegación de mes + días fuera de ventana deshabilitados.

- [ ] **BOOK-WINDOW-03**: El servidor rechaza una reserva **pública** con fecha fuera de la ventana
  (backstop anti-tampering en `app/api/booking/create`; no se confía en el cliente). El alta manual
  autenticada NO se limita (la ventana es solo del público).

### Aviso al cliente en el alta manual (BOOK-NOTIFY)

- [ ] **BOOK-NOTIFY-01**: El form "Nuevo turno" existente suma un checkbox **opt-in "avisar al cliente
  por mail"** (default: sin tildar, respetando la decisión de v0.12). Si está tildado y el cliente tiene
  email, el alta manual (`app/api/appointments/create`) le manda un mail de turno confirmado. Google
  Calendar ya se sincroniza hoy, no cambia.

## Out of Scope

- **Reconstruir el alta manual** — ya existe (v0.12, MANUAL-01/02/03).
- **Seña en el alta manual** (MANUAL-04, diferido a v2 en v0.12).
- Ventana **por servicio** (se eligió global por negocio) y **anticipación mínima** (espejo del máximo, diferido).
- **Enforcement server-side de límites de plan** ([[plan-model-agendas]], ítem aparte).

## Traceability

| REQ-ID | Phase |
|--------|-------|
| BOOK-WINDOW-01 | Phase 4 |
| BOOK-WINDOW-02 | Phase 4 |
| BOOK-WINDOW-03 | Phase 4 |
| BOOK-NOTIFY-01 | Phase 5 |
