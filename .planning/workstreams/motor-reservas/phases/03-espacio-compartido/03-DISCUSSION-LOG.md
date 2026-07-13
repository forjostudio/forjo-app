# Phase 3: Espacio Compartido - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-29
**Phase:** 3-Espacio Compartido
**Areas discussed:** Modelo de datos del espacio, Qué es una 'agenda'/recurso, Naturaleza de la reserva, UI de configuración, Terminología/vertical canchas

---

## Modelo de datos del espacio (D-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Tabla `spaces` + puente agenda↔espacio | Tabla de espacios físicos (A,B,C) + tabla puente que mapea cada agenda a los espacios que ocupa (F11→{A,B,C}). General, escala, es lo que piden los success criteria. | ✓ |
| Exclusión explícita entre agendas | Sin entidad espacio: pares de agendas que se bloquean. Simple de cargar pero no escala (N² pares), no modela el espacio como recurso. | |

**User's choice:** Tabla `spaces` + puente agenda↔espacio
**Notes:** Ambas tablas con RLS + `business_id`; nada cross-tenant. Es la pregunta abierta del brief §8, resuelta a favor del modelo general.

---

## Qué es una 'agenda'/recurso (D-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Reusar `professionals` como eje | Cada cancha/F11 = una fila en `professionals` (el bucket ya se keya por professional_id). Cero modelo nuevo, alineado con D-02 de Phase 2. | ✓ |
| Entidad `resource` nueva genérica | Tabla separada, semánticamente más limpia, pero implica migrar el bucket/booking-core sobre el core endurecido = más riesgo de regresión. | |

**User's choice:** Reusar `professionals` como eje
**Notes:** Mantiene la decisión LOCKED de Phase 2 (professional = eje de la agenda); el público elige la cancha como hoy elige profesional.

---

## Naturaleza de la reserva (D-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Capacity 1 + duración variable (solape) | Cancha = 1 reserva a la vez, duración variable; conflicto por solape de tiempo entre agendas que comparten espacio → extiende EXCLUDE 013 a nivel espacio; CONC-03 = anti-solape. | ✓ |
| Slot fijo como clases grupales | Horarios fijos, reusa book_slot_atomic tal cual (count por slot exacto). Más simple, no refleja cómo se reservan canchas. | |

**User's choice:** Capacity 1 + duración variable (solape)
**Notes:** Consecuencia: `book_slot_atomic` pasa de count-por-slot-exacto a chequeo anti-solape multi-bucket por espacio.

---

## UI de configuración (D-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Dentro del editor de agenda/settings existente | Reusa patrones de settings-client.tsx/agenda-client.tsx. Menos superficie nueva, consistente. | ✓ |
| Sección nueva 'Espacios/Canchas' dedicada | Pantalla propia. Más visible para el rubro pero más superficie/navegación nueva. | |

**User's choice:** Dentro del editor de agenda/settings existente

---

## Terminología/vertical canchas (D-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Término genérico mínimo del eje | Agregar UN término ('Recurso/Cancha') a la terminología para que canchas no vea 'Profesional/Equipo'. Label-only, sin vertical nuevo. | ✓ |
| Diferir terminología entera | Solo motor + config genérica; canchas se cargan como 'profesionales/equipo'. Menor riesgo, peor UX. | |
| Vertical 'canchas/deportes' completo | Nuevo VerticalKey con menú/types/términos propios. Más fiel pero mucha superficie sobre la fase más riesgosa = over-scope. | |

**User's choice:** Término genérico mínimo del eje
**Notes:** `VerticalTerminology` hoy NO tiene término para "profesional"/"equipo"; "Cancha de fútbol" ya es un type del vertical `general`. El término del eje debe resolver para ese caso sin romper los otros verticales.

---

## Claude's Discretion

- Mecanismo atómico anti-conflicto-de-espacio (lock por conjunto de espacios en orden estable anti-deadlock; extender `book_slot_atomic` vs RPC nuevo; constraint DB de respaldo). LOCKED: nunca `count` suelto.
- Disponibilidad acoplada en `/api/booking/availability` (cómo se computa el bloqueo cruzado sin exponer detalle interno — D-06 de Phase 2).
- Código de error del conflicto de espacio (reusar `slot_taken` 409 vs nuevo `space_taken`).
- Numeración/forma de la migración (`042_…`, RLS + policies), validada con `supabase db reset` local antes de prod.

## Deferred Ideas

- Vertical "canchas/deportes" completo (menú/types/copy propios) — v-futuro.
- Entidad `resource`/`agenda` genérica separada de `professionals`.
- Modelo de exclusión explícita entre agendas (descartado por no escalar).
- Constraint DB de respaldo a nivel espacio (si no entra en la fase, hardening futuro).
- GCAL-GROUP-01 (Google Calendar grupal/espacio), WAIT-01 (waitlist), CANCEL-REOPEN-01 (re-apertura al cancelar) — v2.
