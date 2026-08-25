---
status: completed
completed: 2026-08-24
closed_by: v0.27 Phase 17
created: 2026-08-16T00:00:00.000Z
title: "Editor de servicios: el input de cupo no se puede borrar, y el alta necesita un botón Guardar"
area: ux
source: UAT Phase 15, test 1 (2026-08-16)
files:
  - app/(dashboard)/settings/settings-client.tsx
---

## 1. El campo "Cuántos lugares" no se puede editar con el teclado

**Síntoma (palabras del dueño):** *"el cupo solo lo puedo cambiar por las flechas, porque si quiero
escribir con el teclado no puedo borrar el número 2 que ya está."*

**Causa, verificada** — `settings-client.tsx:247`:

```tsx
onChange={e => onChange({ capacity: normalizeCapacity(parseInt(e.target.value), minCapacityFor(value)) })}
```

Es **normalización ansiosa sobre un input controlado**. Al borrar el campo, `parseInt('')` devuelve
`NaN` y `normalizeCapacity` lo sube al mínimo del modo, así que el valor se reescribe **en la misma
tecla**: nunca existe el estado intermedio "campo vacío" que hace falta para tipear otro número.

**Fix:** guardar el **texto crudo** en el estado del formulario y normalizar en `onBlur` y al
guardar, no en cada `onChange`. Es el patrón de validación `onBlur` que el repo ya usa en formularios.

⚠ **No aflojes el piso.** El CHECK de coherencia de la migr. 068 exige `capacity >= 2` para
`group_class` y `simultaneous_resource`: si el submit manda un vacío o un 1, el `UPDATE` rebota con
`23514`. La normalización tiene que seguir corriendo — más tarde, no antes.

## 2. El alta de servicio: sacar el `+` y poner un "Guardar" al final

**Pedido del dueño:** *"quiero que el botón + salga de ahí y pase a ser un botón guardar al final del
formulario."*

Hoy el `+` vive arriba, al lado de "Precio", mientras el formulario sigue hacia abajo con el modo de
cupo, los lugares y las sedes. La acción de confirmar está **antes** que la mitad de los campos, que
es al revés de cómo se lee el formulario.

Alinea además el alta con el modal de edición, que ya tiene su "Guardar" abajo — hoy las dos
pantallas resuelven la misma acción de dos formas distintas.

## Alcance

Las dos son de `/servicios` y del panel autenticado. No tocan el motor, ni la migración, ni el
aislamiento por tenant. Encajan naturalmente en la **Phase 16** junto a **CUPO-09**, que ya rehace ese
editor — conviene resolverlas ahí y no en un parche suelto.
