---
created: 2026-07-30T00:00:00.000Z
title: "El cupo vive en dos lugares y falta el modo Individual"
area: database
source: UAT Phase 12 (2026-07-30)
files:
  - supabase/migrations/041_time_blocks_capacity_and_seat.sql
  - supabase/migrations/062_service_capacity_mode_overlap.sql
  - supabase/migrations/064_agenda_day_lock_and_mirror_gate.sql
  - app/(dashboard)/settings/settings-client.tsx
  - app/(dashboard)/agenda/agenda-client.tsx
  - lib/types.ts
---

## Problem

Dos observaciones de la UAT que son **el mismo problema de modelo**.

**(a) No existe "Individual".** El segmented control obliga a elegir entre "Clase grupal" y
"Recurso simultáneo". Un corte de pelo para una persona queda etiquetado como *clase grupal*, que
es falso. Hoy "individual" se expresa implícitamente como `capacity_mode='group_class'` +
`time_blocks.capacity = 1` — o sea, no se puede declarar, se deduce de otra tabla.

**(b) El cupo tiene dos fuentes de verdad:**

| Modo | De dónde sale el cupo | Scope de esa columna |
|---|---|---|
| `group_class` | `time_blocks.capacity` | business + day_of_week + ventana horaria — **NO por servicio** |
| `simultaneous_resource` | `services.capacity` | por servicio |

El usuario lo formuló así: *"los cupos son por servicio y no por agenda; al aumentar los cupos en
la agenda habría un conflicto de intereses si también los puedo poner por servicio."* Tiene razón:
un negocio puede tener un bloque de cupo 3 y un servicio de cupo 2, y cuál manda depende del modo.

## Sobre "clase grupal sería redundante con recurso simultáneo"

Es la intuición correcta apuntando al lugar correcto, pero **los dos modos no son intercambiables**.
La diferencia real es el eje de conteo:

- **Clase grupal**: 15 personas, TODAS arrancan 9:00. Se cuenta por hora de inicio exacta.
- **Recurso simultáneo**: 2 camillas, gente a las 16:00, 16:15, 16:30. Se cuenta por solape.

Si modelaras una clase de spinning como simultáneo cupo 15, alguien podría reservar 9:30 y
consumir un lugar solapándose con la clase de las 9:00 — o sea, sumarse a mitad de clase. El modo
simultáneo es **estrictamente más permisivo**, así que no subsume al grupal. Lo que sí sobra es que
el NÚMERO viva en dos tablas distintas.

## Propuesta

Un enum de tres valores con UNA sola fuente para el número:

```
services.capacity_mode = 'individual' | 'group_class' | 'simultaneous_resource'
services.capacity      = N            -- lo usan grupal Y simultáneo; individual fuerza 1
time_blocks.capacity   -- legacy, deja de decidir
```

`individual` es el default y replica exactamente el comportamiento de hoy (cupo 1). El modo decide
CÓMO se cuenta; `services.capacity` decide CUÁNTO. Eso arregla (a) y (b) de una, y hace honesto al
editor.

## Trampa de la migración (leer antes de estimar)

**El backfill NO es mecánico.** `time_blocks.capacity` es por bloque (business + día + ventana), y
el bloque **no sabe a qué servicio corresponde**. Un negocio con un bloque de cupo 15 de 9 a 10 no
declara en ningún lado que la clase de las 9 es "Funcional". No hay forma de derivar
`services.capacity` automáticamente sin adivinar.

Opciones: dejar `time_blocks.capacity` como fallback durante una transición, o hacer que el dueño
re-declare el cupo por servicio (con un aviso en el panel para los negocios que hoy tienen bloques
de cupo > 1). Decisión de producto, no técnica.

Ese "el bloque no sabe el servicio" ES el defecto de modelo que la observación del usuario
detectó — y también es lo que hace que arreglarlo cueste.

## Alcance

Fase propia. Toca migración + backfill/transición + el gate de cupo del RPC (`book_slot_atomic`,
hoy en `064`) + el editor de servicio + la grilla de la agenda. NO es polish.

Relacionado: el riesgo residual **R-1** de `12-SECURITY.md` (cambiar `capacity_mode` con turnos ya
creados deja filas `is_group=true` huérfanas fuera de todos los gates) vive en el mismo territorio y
conviene resolverlo en la misma fase.
