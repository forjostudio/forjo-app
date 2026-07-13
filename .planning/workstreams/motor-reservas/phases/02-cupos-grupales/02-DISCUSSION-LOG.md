# Phase 2: Cupos Grupales - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-26
**Phase:** 2-Cupos Grupales
**Areas discussed:** Bloque↔clase/servicio, Modelo de recurso (mira Phase 3), Duración en bloque grupal, Roster del admin

---

## Bloque ↔ clase/servicio (CUPOS-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Capacidad genérica + label | El time_block solo gana `capacity` (default 1); el `label` nombra la clase. No cambia el flujo de selección de servicio del público. Mínimo cambio, cero regresión, reusa todo el pipeline. | ✓ |
| Bloque atado a service_id | El time_block referencia un servicio (clase): timetable real de gym; el público reserva 'la clase'. Más fiel a gyms pero agrega FK + cambia booking y disponibilidad. | |

**User's choice:** Capacidad genérica + label (Recommended)
**Notes:** El cupo cuenta todos los turnos del slot contra `capacity`, sin atar el bloque a un servicio.

---

## Modelo de recurso (mira Phase 3)

| Option | Description | Selected |
|--------|-------------|----------|
| Capacity sobre modelo actual | Se decide el modelo conceptual ahora (agenda = profesional/time_block con capacity; Phase 3 agrega tabla de espacios encima sin re-migrar capacity). Menor riesgo sobre el core 011/013; Phase 3 sigue recortable. | ✓ |
| Abstracción `resource`/`agenda` ya | Crear tabla genérica de recurso/agenda y migrar professionals ahora. Más limpio a futuro pero migración grande sobre el core endurecido, más riesgo de regresión. | |

**User's choice:** Capacity sobre modelo actual (Recommended)
**Notes:** Phase 3 (espacio compartido) construye encima sin re-migrar capacity.

---

## Duración en bloque grupal (CUPOS-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Duración fija del bloque | La clase grupal es un bloque con inicio/fin fijos; todos al mismo horario. Ocupación = count de turnos en slot < capacity. Simple y atomizable. | ✓ |
| Respeta duración del servicio | Cada reserva usa la duración de su servicio dentro del bloque; ocupación por solapamiento. Más flexible pero el anti-sobrecupo deja de ser un count limpio por slot. | |

**User's choice:** Duración fija del bloque (Recommended)
**Notes:** Habilita el chequeo atómico limpio por slot.

---

## Roster del admin (CUPOS-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Click en slot → drawer/panel | Click en slot grupal abre drawer (vaul mobile) / panel (desktop) con contador (8/15) + lista: nombre, contacto y estado (confirmado / seña pendiente). Reusa agenda-client + ui existente. | ✓ |
| Expand inline en la grilla | El slot grupal se expande in situ; sin drawer. Menos modal pero recarga la grilla. | |

**User's choice:** Click en slot → drawer/panel (Recommended)
**Notes:** Reusa el lenguaje visual de la agenda y componentes ya presentes; no agregar librería.

---

## Claude's Discretion

- Mecanismo atómico exacto anti-sobrecupo (lock por slot / `FOR UPDATE` / serializable / contador con check) — LOCKED como atómico deliberado, nunca `count` suelto.
- Redefinición concreta de los constraints `appointments_no_double_booking` (011) y `appointments_no_overlap` (013) a capacity-aware con cero regresión cupo 1; cómo se keya la ocupación del slot.
- Migración de `capacity` (aditiva, RLS + policies con `with check`, numeración 041+ underscore, validación `supabase db reset` local).
- Mapeo de error `slot_full` (409) + estilo de validación defensivo del repo.

## Deferred Ideas

- Bloque atado a `service_id` (timetable formal de clases) — descartado para el MVP.
- Abstracción `resource`/`agenda` genérica — diferida a Phase 3 (modelo de espacio encima).
- Google Calendar para clases grupales (GCAL-GROUP-01) — v2.
- Waitlist (WAIT-01) y re-apertura del lugar al cancelar (CANCEL-REOPEN-01) — v2.
