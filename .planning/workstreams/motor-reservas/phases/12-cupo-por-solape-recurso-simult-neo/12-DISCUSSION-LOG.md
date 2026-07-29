# Phase 12: Cupo por solape (recurso simultáneo) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-29
**Phase:** 12-cupo-por-solape-recurso-simult-neo
**Areas discussed:** Modelo del flag, UX del toggle, De dónde sale el cupo N, Disponibilidad pública, Roster en la agenda, "Cualquiera" + simultáneo, Terminología por vertical, Canchas + capacity_mode

---

## Modelo del flag

| Option | Description | Selected |
|--------|-------------|----------|
| Enum extensible | `capacity_mode text` ('group_class' \| 'simultaneous_resource'), default group_class. Molde migr. 061. Extensible sin re-migrar. | ✓ |
| Boolean simple | `is_simultaneous_resource boolean` default false. Más corto; 3er modo futuro obliga a migrar. | |

**User's choice:** Enum extensible
**Notes:** —

---

## UX del toggle

| Option | Description | Selected |
|--------|-------------|----------|
| Segmented + ayuda | Segmented "Clase grupal / Recurso simultáneo" + microcopy en el editor de servicio. | ✓ |
| Checkbox simple | Checkbox "Es un recurso con varios lugares en paralelo". | |
| Solo si cupo > 1 | El switch aparece solo cuando el cupo > 1. | |

**User's choice:** Segmented + ayuda
**Notes:** —

---

## De dónde sale el cupo N

| Option | Description | Selected |
|--------|-------------|----------|
| Sigue en time_blocks | El N sale del bloque de agenda (capacity, ya existe). | |
| Nueva columna en services | El dueño setea el N en el servicio. | ✓ (tras discutir) |

**User's choice:** "Sí — capacity en services" (después de plantear el problema).
**Notes:** El dueño detectó que `time_blocks` es por bloque general y una misma kinesióloga puede tener "camilla" cupo 2 y "gimnasio" con otro cupo en la misma franja → el N tiene que vivir en el servicio. Framing: "que dos turnos se puedan dar al mismo tiempo, como espacios cruzados pero al revés". También disparó una idea de modelo de negocio (agendas → profesionales/canchas) que se difirió a un milestone aparte.

---

## De dónde sale el cupo N — alcance del solape

| Option | Description | Selected |
|--------|-------------|----------|
| Por servicio | Solo cuenta contra otras reservas del mismo service_id solapadas. | ✓ |
| Por profesional/agenda | Cuenta contra todo turno solapado de la persona. | |

**User's choice:** "Permite paralelismo entre servicios, pero solo si así lo configura la persona."
**Notes:** Se interpretó como per-servicio con opt-in explícito = el propio flag recurso-simultáneo + su capacity.

---

## Cruce entre servicios (borde)

| Option | Description | Selected |
|--------|-------------|----------|
| Carriles independientes | Cada servicio cuenta lo suyo; simultáneo no bloquea ni es bloqueado por otros. | ✓ (v1) |
| La persona es el límite | El solape simultáneo vale solo entre turnos del mismo servicio; un turno normal solapado igual bloquea. | |
| Que lo elija el dueño | Control extra por servicio. | (preferencia del dueño → diferido) |

**User's choice:** "Quiero que lo elija el dueño, opción 3, pero si querés lo anotamos para después."
**Notes:** Se difirió la opción 3 (control fino) por ser la fase de mayor riesgo. v1 toma carriles independientes como default seguro y simple.

---

## Disponibilidad pública

| Option | Description | Selected |
|--------|-------------|----------|
| Overlap-aware en el grid | El availability calcula el solape y marca lleno. | ✓ |
| Solo server rechaza | El grid como hoy; solo el server aplica. | |

**User's choice:** Overlap-aware en el grid
**Notes:** —

---

## Roster en la agenda

| Option | Description | Selected |
|--------|-------------|----------|
| Filas individuales + aviso lleno | Cada turno como fila normal + indicador "lleno" (ej. "2/2 camillas"). | ✓ |
| Solo filas individuales | Sin contador agregado. | |
| Contador tipo grupal | Forzar el "8/15" por franja (no encaja con escalonados). | |

**User's choice:** Filas individuales + aviso lleno
**Notes:** —

---

## "Cualquiera" + simultáneo

| Option | Description | Selected |
|--------|-------------|----------|
| Restringir en v1 | El servicio simultáneo exige elegir profesional (no ofrece "Cualquiera"). | ✓ |
| Soportar | Asignación automática capacity-aware por solape. | (diferido) |

**User's choice:** Restringir en v1
**Notes:** Soporte diferido — hacer la asignación auto capacity-aware queda como iteración futura.

---

## Terminología por vertical

| Option | Description | Selected |
|--------|-------------|----------|
| Fijos para todos | Mismos labels + microcopy para cualquier negocio. | ✓ |
| Adaptar por vertical | lib/verticals para salud/belleza/canchas. | |

**User's choice:** Fijos para todos
**Notes:** Adaptar por vertical = pulido futuro.

---

## Canchas + capacity_mode

| Option | Description | Selected |
|--------|-------------|----------|
| Confirmar cero regresión | Canchas nacen group_class; services.capacity no las toca; exclusión por espacio intacta. | ✓ |
| Revisar | Alguna cancha podría querer el modo simultáneo. | |

**User's choice:** Confirmar cero regresión
**Notes:** El modo simultáneo no aplica a canchas (se reservan de a 1).

---

## Claude's Discretion

- Mecanismo exacto de la re-granularización del lock (dirección locked: `biz+service_id+date` para simultáneo; fino actual para grupal/cupo 1) — a validar por research.
- Estructura de la migración 062 y la ramificación del cuerpo del RPC por `capacity_mode`.

## Deferred Ideas

- Control por-dueño de paralelismo cross-servicio (opción 3 del cruce entre servicios).
- Soporte de "Cualquiera" (multi-staff) sobre servicios recurso-simultáneo (asignación auto capacity-aware por solape).
- Terminología por vertical de los dos modos.
- Repensar el modelo de planes "cantidad de agendas" → "profesionales/canchas" (milestone aparte; ver [[plan-model-agendas]]).
