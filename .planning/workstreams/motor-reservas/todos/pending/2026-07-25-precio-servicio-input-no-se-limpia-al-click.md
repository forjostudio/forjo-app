---
created: 2026-07-25T00:00:00.000Z
title: "Campo de precio de servicio: no se limpia al hacer click y el modal no deja borrar el 0"
area: frontend
files:
  - app/(dashboard)/settings/settings-client.tsx:1363
  - app/(dashboard)/settings/settings-client.tsx:1405
---

## Problem

Los dos inputs de **Precio** de la gestión de servicios (Agregar servicio y el modal Editar servicio)
son `<Input type="number">` controlados a un estado numérico que arranca en `0`. UX molesta,
reportada en UAT de la Fase 8 (2026-07-25, incidental — NO es de la Fase 8; el campo es pre-existente
del vertical canchas / precio+duración en `services`, migr. 043):

- **Agregar servicio** (`settings-client.tsx:1363`): `onChange={e => setNewService(f => ({ ...f, price: parseFloat(e.target.value) }))}`.
  Al hacer click, el cursor queda **detrás del `0`** (no se limpia). Se puede borrar el 0 (queda `NaN`/vacío),
  pero hay que hacerlo a mano.
- **Editar servicio (modal)** (`settings-client.tsx:1405`): `onChange={e => setEditSvcForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}`.
  El `|| 0` hace que al vaciar el campo **vuelva a `0` al instante** → con el teclado NO se puede borrar el 0
  (solo seleccionándolo con el mouse y sobrescribiendo). Tipear "1" sobre el 0 da "01".

## Desired

Al hacer click/focus en el campo de precio, la celda queda lista para escribir el precio directo
(el `0` se selecciona/limpia). El modal debe dejar borrar el 0 con el teclado.

## Fix propuesto (chico)

1. Agregar `onFocus={e => e.target.select()}` a ambos inputs de precio (selecciona todo al enfocar →
   tipear reemplaza; el patrón más simple y consistente). Aplica igual al de duración si se quiere.
2. En el onChange del modal, quitar el `|| 0` (permitir vacío) y normalizar a 0 recién al guardar
   (o usar `Number.isNaN(parsed) ? '' : parsed` con el estado como string), para que el teclado pueda
   vaciar el campo. Mismo criterio en Agregar para consistencia.
3. Opcional: mostrar `placeholder="0"` con valor vacío en vez de un `0` literal, y validar `> 0` al guardar.

Bajo esfuerzo, sin dependencias. Candidato a quick task junto con el gap cosmético del "Hace todo"
(layout shift en el editor de /equipo) anotado en `08-UAT.md`.
