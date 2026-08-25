---
status: completed
completed: 2026-08-24
closed_by: v0.27 Phase 17
created: 2026-08-03T00:00:00.000Z
title: Finanzas en mobile oculta el nombre del servicio
area: dashboard
milestone: motor-reservas
source: UAT de la Phase 13 (v0.26). El dueño ya avisó que quiere rehacer esa sección entera, así que esto es insumo para ese rediseño, no un parche suelto.
files:
  - app/(dashboard)/finances/finances-client.tsx:890 (el span tiene `hidden sm:block`)
---

## Problem

En la lista de movimientos de Finanzas, la fila de un turno muestra fecha, hora, cliente, monto y
estado de cobro — pero **no el servicio** en pantallas menores a 640px. No es un dato faltante: el
span existe y ya lee del snapshot correcto (`apptServiceName`, helper de la Phase 13), pero está
oculto por CSS:

```tsx
<span className="text-muted-foreground hidden sm:block truncate max-w-32">{apptServiceName(appt, '')}</span>
```

Es una decisión de layout anterior a la Phase 13 — la fila es una sola línea y el nombre no entraba.
Consecuencia práctica: en mobile el dueño ve tres turnos de $5.000 del mismo cliente sin poder
distinguir de qué fueron.

## Solution

No taparlo con un `sm:` más permisivo: la fila de una línea no da para un campo más a 375px.
El camino es **cambiar la forma de la fila en mobile**, no revelar el span.

Opción recomendada: en mobile la fila pasa a dos líneas — cliente + monto arriba, servicio + hora
abajo en `text-xs text-muted-foreground`. Es el mismo patrón que ya usa la tarjeta mobile de Turnos,
así que hay molde en el repo y las dos vistas quedarían consistentes.

El dueño ya dijo que quiere rehacer Finanzas (ver la idea de "Cashflow → Actividad estilo
MercadoPago" en el backlog de ideas del panel). Conviene resolverlo ahí adentro y no antes.
