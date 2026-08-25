# Phase 19: El panel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-25
**Phase:** 19-el-panel
**Areas discussed:** Persistencia del mapeo, Dónde y cómo se asigna, Qué muestra la grilla, Cómo se lee "cualquiera"

---

## Hallazgo previo a la discusión (scout de codebase)

`saveHours()` hace **delete-all + reinsert** de `time_blocks`, y `time_block_services` es su único
hijo con `ON DELETE CASCADE` en las dos FK. Verificado contra el catálogo de Postgres, no inferido.
Consecuencia: sin cambiar el guardado, todo mapeo se borra al siguiente guardado de horarios y vuelve
a comodín — indistinguible de "sin configurar". Este hallazgo reordenó la fase: la persistencia pasó
a ser el área #1 y no estaba en el ROADMAP.

---

## Persistencia del mapeo

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Guardado por diff, conservando ids | UPDATE/INSERT/DELETE selectivo; `LocalBlock` ya carga el `id` | ✓ |
| Re-mapear por (día, inicio, fin) tras el reinsert | Menos código, re-asociación heurística | |
| Que el mapeo no dependa del id del bloque | Re-migrar el modelo recién puesto en prod | |

**Notas:** se descartó la re-asociación por horario porque falla **en silencio** cuando el horario
cambia en el mismo guardado — el modo de falla que el milestone viene evitando.

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Sí: la fila ES el bloque, el horario es un atributo | UPDATE sobre la misma fila, mapeo intacto | ✓ |
| No: horario distinto = bloque nuevo | Más conservador, castiga el gesto más común | |
| Sí, pero avisando cuando el bloque se achica | Suma una interrupción al guardado | |

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Mismo botón, un solo guardado | Un estado sucio, sin ventana de inconsistencia | ✓ |
| Automático al elegir el servicio | Choca con "editá y después guardá" | |
| Botón propio para el mapeo | Duplica el gesto, se puede olvidar uno | |

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Todo o nada, vía RPC transaccional | Molde `book_slot_atomic`; cuesta la migr. 074 | ✓ |
| Escrituras sueltas con toast de error | Deja horarios nuevos + mapeo viejo, que el público VE | |
| Escrituras sueltas + revertir a mano | La reversión también puede fallar | |

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Copiar día arrastra el mapeo | El gesto central de un negocio de clases | ✓ |
| Solo el horario | Convierte el caso de uso en trabajo manual repetido | |
| Que el dueño elija con un checkbox | Una decisión más en un flujo de dos clicks | |

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Días especiales: nada por ahora, documentado | Comportamiento de hoy, coherente con RA-04 | ✓ |
| Avisarlo en la UI de días especiales | No cambia comportamiento, solo informa | |
| Extender el mapeo a los días especiales | Capacidad nueva, su propia fase | |

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Avisar antes de borrar un servicio mapeado, con el número | La franja queda comodín: ofrece MÁS, no menos | ✓ |
| Borrar sin avisar (el CASCADE ya limpia) | El dueño abre franjas sin enterarse | |
| Impedir el borrado mientras esté mapeado | Gate nuevo sobre `services`, ya corregido 3 veces | |

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Plegar la limpieza de `time_blocks.capacity` | Misma función que se reescribe entera | ✓ |
| Dejarlo en el backlog | La columna muerta queda en código recién escrito | |
| Solo sacar el write, no tocar la UI | Deja un campo visible que no persiste nada | |

---

## Dónde y cómo se asigna

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Segunda línea bajo la fila del bloque | Se ve sin abrir nada; no compite por el ancho | ✓ |
| Botón por bloque que abre el modal existente | Choca con AGENDA-05: hay que abrir algo | |
| Inline junto a las horas | Rompe la línea en 375px | |

**Notas:** sacar el stepper de cupo (D-12) libera exactamente el espacio horizontal de esa fila.

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Chips toggleables | Ver el estado cuesta 0 clicks; "ninguno" se lee como estado válido | ✓ |
| Combobox multi-select con búsqueda | Escala mejor, pero su estado vacío se lee como "falta completar" | |
| Chips, y combobox si hay muchos | Dos componentes y un umbral que justificar | |

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Wrap con "ver todos (N)" tras ~2 filas | El caso común no paga nada | ✓ |
| Wrap sin límite | Con 15 servicios se lleva media pantalla en mobile | |
| Solo los asignados + botón para editar | Escala mejor, cuesta un click para asignar | |

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Solo activos, sin romper el mapeo de un desactivado | Reactivar devuelve todo | ✓ |
| Todos, con los inactivos atenuados | Ofrece asignar algo que no produce turnos | |
| Solo activos, y punto | El chip desaparece sin explicación | |

---

## Qué muestra la grilla sin abrir nada

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| "La grilla" = el editor de horarios, ya cubierto | Los chips de D-08 cumplen AGENDA-05 | ✓ |
| La vista semanal de turnos también | Información de otra naturaleza en el mismo espacio | |
| Las dos, la semanal en otra fase | | |

**Notas:** desambiguación necesaria — en Agenda hay dos cosas llamables "grilla".

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Peso visual secundario: neutros, texto chico | El 100% los verá vacíos el día del deploy | ✓ |
| Con color por servicio | `services` no tiene columna de color | |
| Prominente | Hace que el estado por defecto se lea como un hueco | |

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Día colapsado: NO resume | La síntesis miente fácil con bloques de mapeo distinto | ✓ |
| Sí, un resumen chico | Riesgo de engaño | |
| Solo una marca de que hay algo declarado | No miente, pero hay que abrir igual | |

---

## Cómo se lee "cualquiera"

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Chip "Cualquier servicio" | Ocupa el lugar de un estado declarado, no de un hueco | ✓ |
| Texto atenuado "Todos los servicios" | Se lee como placeholder | |
| Nada: la línea solo aparece si hay servicios | La capacidad se vuelve invisible | |

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Se vuelve apagando todos los chips | Reversible por el mismo gesto | ✓ |
| Con una acción explícita | Un control más en una línea que queremos liviana | |
| Con aviso al apagar el último | Suma una interrupción | |

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| El chip "Cualquier servicio" reaparece al instante | Resuelve mostrando el resultado, no advirtiendo | ✓ |
| Texto de ayuda fijo en la sección | Se deja de leer tras la primera visita | |
| Tooltip en el chip | En mobile no hay hover | |

---

## Deuda heredada de la Phase 18

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| WR-07: la copy entra en esta fase | Es la condición con la que se aceptó el riesgo | ✓ |
| Diferir a la Phase 20 con AGENDA-07 | Deja una ventana con el error alcanzable y sin mensaje | |
| Decidir según el orden de release | Ata seguridad a una decisión de release no tomada | |

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| WR-04 (`location_id`): nada, documentar el límite | 0 negocios multi-sede medidos | ✓ |
| Propagar `location_id` al helper ahora | Toca 3 superficies recién aseguradas, para 0 usuarios | |
| Gatear la UI a negocios de una sola sede | Niega la capacidad por un límite que no los afecta | |

---

## Claude's Discretion

- Firma del RPC de la 074, serialización del diff, y el mapeo de sus rechazos a copy propia
  (sin interpolar el mensaje de la base — T-14-25 / T-13-09).
- El umbral exacto de "ver todos", si el chip "Cualquier servicio" es clickeable, y el tratamiento
  visual de un servicio desactivado que sigue mapeado. Van a UI-SPEC.
- Cómo se representa en el payload un bloque recién agregado que todavía no tiene `id`.

## Todos plegados

- "El editor de horarios sigue escribiendo `time_blocks.capacity`" (`cleanup`) → D-12.

## Ideas diferidas

- Mapeo en días especiales (`schedule_exceptions`) — capacidad nueva.
- Mostrar el servicio en la vista semanal de turnos — revisitar con uso real.
- Propagar `location_id` a la regla (WR-04) — cuando exista el primer negocio multi-sede.
- Color por servicio — requiere columna nueva en `services`.
