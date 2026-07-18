# Phase 4: Ventana de reserva pública - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-18
**Phase:** 4-ventana-de-reserva-p-blica
**Areas discussed:** Unidad y default, Control en Ajustes, Feedback en el calendario, Cambio del límite / turnos existentes

---

## Unidad y default del límite

| Option | Description | Selected |
|--------|-------------|----------|
| 60 días por default | En días, default 60 para todos, con "sin límite" | |
| Sin límite por default | Se agrega la columna pero arranca sin límite (no arregla el bug solo) | |
| 30 días por default | Igual que 60 pero más conservador (un mes) | ✓ |

**User's choice:** 30 días por default.
**Notes:** —

---

## Control en Ajustes

| Option | Description | Selected |
|--------|-------------|----------|
| Campo numérico en días + "sin límite" | Input en días + toggle sin límite | ✓ (ampliado) |
| Presets (1/3/6 meses / sin límite) | Botones fijos, menos flexible | |

**User's choice:** En días, con toggle a "sin límite" **y además opción de elegir una fecha exacta**.
**Notes:** El usuario amplió: el control debe permitir un tercer modo, **fecha de corte fija**, además
de los días (rolling) y "sin límite". → 3 modos mutuamente excluyentes (D-01).

---

## Feedback en el calendario

| Option | Description | Selected |
|--------|-------------|----------|
| Texto "Reservas hasta el DD/MM" | Deshabilitar + hint claro de hasta cuándo | ✓ |
| Silencioso | Solo deshabilitar días/meses, sin texto | |

**User's choice:** Texto "Reservas hasta el DD/MM".
**Notes:** Encaja con los 3 modos: todos resuelven a una fecha de corte efectiva.

---

## Cambio del límite / turnos existentes

| Option | Description | Selected |
|--------|-------------|----------|
| Solo afecta reservas nuevas | Turnos ya hechos quedan intactos; timezone AR | ✓ |
| Revisemos ese caso | Pensar qué hacer con turnos fuera de ventana | |

**User's choice:** Solo afecta reservas nuevas.
**Notes:** Cálculo en hora Argentina (UTC-3).

---

## Claude's Discretion

- Schema exacto del/los campo(s) (columnas vs mode enum) y prioridad si conviven días + fecha.
- Cómo llega el valor al calendario público sin abrir lectura ancha de `businesses` a anon (read-path).
- Forma exacta del control (radio/toggle/date-picker) siguiendo el design system.

## Deferred Ideas

- Anticipación mínima (X horas) — espejo del máximo, diferido.
- Ventana por servicio — se eligió global por negocio.
