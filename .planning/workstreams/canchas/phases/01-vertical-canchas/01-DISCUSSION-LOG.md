# Phase 1: Vertical Canchas - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-30
**Phase:** 1-Vertical Canchas
**Areas discussed:** Modelo de vertical, Terminología del rubro, Esconder vs bloquear Equipo, Setear rubro + existentes

---

## Modelo de vertical

| Option | Description | Selected |
|--------|-------------|----------|
| VerticalKey 'canchas' nuevo | Agregar 'canchas' a VerticalKey + VerticalConfig propio (menu sin 'equipo', terminología propia). `vertical` guarda 'canchas'. Primera clase, determinístico, menú sale del config. | ✓ |
| Extender el override por-type | Mantener 'Cancha de fútbol' en 'general' y elevar TYPE_TERMINOLOGY_OVERRIDE para esconder menú. Reusa mecanismo, pero más acoplado. | |

**User's choice:** VerticalKey 'canchas' nuevo (Recomendado)
**Notes:** Resuelve el phase-level decision diferido del roadmap a favor de un vertical de primera clase.

---

## Terminología del rubro

| Option | Description | Selected |
|--------|-------------|----------|
| Reserva + Cancha | appointment→Reserva, resource→Cancha, client→Cliente, location→Sede, service→Cancha. Natural para alquiler. | ✓ |
| Turno + Cancha (mínimo) | Mantener Turno, solo cambiar resource→Cancha y location→Sede. Menos superficie. | |
| Vos decidís el mapa | Claude define el mapa completo. | |

**User's choice:** Reserva + Cancha (Recomendado)
**Notes:** `service/services` queda como "Cancha" provisional; planner lo ajusta si Phase 2 separa servicio de cancha.

---

## Esconder vs bloquear Equipo

| Option | Description | Selected |
|--------|-------------|----------|
| Sacar del menú + guard en ruta | Menú vía config + redirect server-side en /equipo si vertical==='canchas'. Cumple criterio 4 literal. | ✓ |
| Solo sacar del menú | Solo quitar de VerticalConfig.menu; ruta /equipo accesible a mano (mostraría canchas como Equipo). | |

**User's choice:** Sacar del menú + guard en ruta (Recomendado)
**Notes:** Cada cancha es una fila de `professionals` (motor v0.12), así que /equipo sin guard listaría las canchas como Equipo — leaky.

---

## Setear rubro + existentes

| Option | Description | Selected |
|--------|-------------|----------|
| Conviven, sin migración | No migrar; existentes siguen general+override; pasan a canchas re-eligiendo el rubro. | |
| Migrar a 'canchas' ahora | UPDATE de los 'Cancha de fútbol' a vertical 'canchas'. Premature (Phase 2/3 no existen). | |
| Vos decidís | Claude resuelve legacy priorizando cero regresión. | |

**User's choice:** Free-text — "no existen clientes, así que si conviene migrar ahora lo hacemos".
**Notes:** Sin clientes en producción → cutover limpio: 'Cancha de fútbol' pasa a type del vertical canchas, se quita de general.types, se ELIMINA el TYPE_TERMINOLOGY_OVERRIDE entero (el vertical canchas dueña la terminología nativa). Sin migración numerada (no toca esquema; si hubiera filas de dev, UPDATE de una línea).

---

## Claude's Discretion

- Lista final de `types` del vertical canchas (qué deportes además de fútbol).
- Composición exacta del array `menu` de canchas.
- Mecánica del removal del override y de los types de canchas en la sugerencia por IA.

## Deferred Ideas

- **Turnos fijos / abonos recurrentes (canchas):** idea del usuario al cierre. Reserva
  recurrente generada por el dueño (bloquea slot semanal) + check público opcional
  "enviar solicitud de turno fijo" con aprobación del dueño. Capacidad nueva fuera del
  scope de Phase 1 y de v0.13; candidata a milestone/fase propia. Se apoya en turnos
  manuales desde el panel y en el motor de reservas.
