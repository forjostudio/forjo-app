---
created: 2026-08-20T00:00:00.000Z
title: "Un turno FUTURO marcado completado no tiene ninguna salida en el panel"
area: frontend
source: code review Phase 16 (WR-02), 2026-08-19
files:
  - app/(dashboard)/appointments/appointments-client.tsx
  - app/(dashboard)/settings/settings-client.tsx
---

## Problem

Desde la migración 070 (GATE-02, cierre del residual R-15-A) un turno **futuro** en estado
`completed` **bloquea el cambio de modo de cupo** de su servicio. Eso es correcto: marcar
"completado" un turno que todavía no pasó era un bypass de un click del gate.

Lo que no está: la salida. En `RowActions` (`appointments-client.tsx:72-95`) las acciones de fila se
derivan así:

```ts
const isActive = !['cancelled', 'completed'].includes(appt.status)
// cancelar: sólo si isActive          → un completed NO tiene botón de cancelar
// eliminar: sólo si cancelled|pending_payment → tampoco tiene borrar
// confirmar: sólo si status === 'pending'     → no hay vuelta atrás desde completed
```

Y no hay reprogramación de turnos en el panel. O sea: el dueño se queda con el modo del servicio
**congelado hasta que la fecha del turno pase**, que pueden ser meses, y sin ninguna acción posible
sobre esa fila.

## Qué se hizo ya (y qué NO)

En la ronda de fixes del review se corrigió **sólo la copy** del rechazo (`saveEditService`), que
antes prometía una salida inexistente ("Cancelalos o esperá a que pasen"). Ahora el toast dice la
verdad: que un turno marcado como completado no se puede cancelar desde el panel y hay que esperar a
que pase su horario.

**La capacidad sigue faltando.** Esto es el registro de esa deuda.

## Propuesta

Opción (a) del review, que es la que la copy original prometía: permitir **cancelar un turno
`completed` cuyo horario todavía no pasó**.

```ts
// RowActions necesita el "ahora" AR para decidir (hoy no lo recibe):
isActive || (appt.status === 'completed' && !isPastAppointment(appt, now))
```

Ojo antes de hacerlo:

- **No es sólo un `||`**: `RowActions` es un componente a nivel módulo y no tiene `now`; hay que
  pasárselo desde el cliente (con `nowInAR()`, la fuente declarada en `lib/appointment-time.ts`).
- **Tiene efecto en Finanzas**: Finanzas, el export CSV y la ficha del cliente filtran
  `.neq('status','cancelled')`, así que cancelar un turno que estaba marcado como completado lo saca
  de la facturación. Es lo correcto para un turno que no se prestó, pero hay que decidirlo a
  propósito, no de rebote.
- **Alternativa**: un "desmarcar completado" (volver a `confirmed`) en vez de cancelar. Deja al dueño
  en el estado anterior y evita tocar Finanzas, pero agrega una transición de estado nueva.

⛔ **NO** proponer "sacar `completed` del gate de modo": eso reabre R-15-A, que es literalmente lo
que la Phase 16 vino a cerrar.

## Alcance

Un archivo y medio, sin migración. `/gsd:quick` alcanza si se elige (a) tal cual; si se elige el
"desmarcar", conviene pensarlo como cambio de producto chico (afecta el historial y Finanzas).
