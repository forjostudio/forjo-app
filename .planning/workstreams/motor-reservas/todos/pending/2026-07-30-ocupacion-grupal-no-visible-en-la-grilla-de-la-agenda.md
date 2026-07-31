---
created: 2026-07-30T00:00:00.000Z
title: "La ocupación de una clase grupal no se ve en la grilla, solo al abrir el turno"
area: frontend
source: UAT Phase 12 (2026-07-30)
files:
  - app/(dashboard)/agenda/agenda-client.tsx
---

## Problem

En la grilla semanal de la agenda, un turno de **recurso simultáneo** muestra su badge de ocupación
directo en el chip (`2/2 lleno`, entregado por la Phase 12). Un turno de **clase grupal** no muestra
nada: hay que clickear el turno para que el modal diga `1/4 inscripto`.

Verificado en el código: `capacityFor()` resuelve el cupo del bloque desde `time_blocks` y el
contador grupal se pinta solo en el detalle, mientras `overlapFullById` alimenta el chip de la
grilla únicamente para servicios simultáneos.

## Esto NO es una regresión

El comportamiento del grupal es idéntico al de antes de la Phase 12 — el paso 5 de la UAT exigía
exactamente eso ("sigue mostrando su roster/contador al clickear el chip, sin cambios") y pasó. Lo
que la fase introdujo es la **inconsistencia**: ahora un modo informa en la grilla y el otro no.

Es pedido de mejora, no bug. Registrarlo como tal para no tratarlo como gap de la fase.

## Propuesta

Llevar el contador grupal al chip de la grilla, con el mismo tratamiento visual que el badge de
simultáneo, para que los dos modos informen igual de un vistazo.

Cuidado con D-11 de la Phase 12, que sigue vigente y es el motivo de que hoy se vean distinto: el
grupal son N inscriptos en UNA franja (un chip con contador `1/4`), el simultáneo son turnos
escalonados como **filas individuales** cada una con su badge. Unificar la *presencia* del dato en
la grilla NO significa unificar la forma: si se colapsan, se pierde la distinción entre "4 personas
a la misma hora" y "4 turnos que se pisan".

## Alcance

Polish medio. Un archivo, sin migración, sin tocar el motor ni el RPC.
