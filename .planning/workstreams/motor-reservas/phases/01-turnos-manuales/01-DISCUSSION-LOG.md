# Phase 1: Turnos Manuales - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 1-Turnos Manuales
**Areas discussed:** Seña opcional, Cliente (elegir/crear), Flexibilidad del slot, Disparo de la UI

---

## Seña en el turno manual (MANUAL-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Reusar flujo de pago | "Pedir seña" → pending_payment + mail con link de pago; toggle default NO | |
| Solo registro informativo | Turno siempre confirmed; "seña" guarda monto adeudado sin link ni mail | |
| Sin seña en manual | Turno manual siempre confirmed directo; seña solo en booking público | ✓ |

**User's choice:** Sin seña en manual.
**Notes:** La opción contradice MANUAL-04. En follow-up se confirmó: **diferir MANUAL-04 a v2** (no eliminar, no reconsiderar). Phase 1 entrega MANUAL-01/02/03; el turno manual siempre queda `confirmed`.

---

## Selección/creación de cliente (MANUAL-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Combobox + crear, con dedupe | Buscador de existentes + crear inline; dedupe por teléfono/email | ✓ |
| Combobox + crear, sin dedupe | Buscador + crear, siempre inserta (como el público) | |
| Dos pasos separados | Tab elegir / tab crear | |

**User's choice:** Combobox + crear, con dedupe (recomendada).
**Notes:** Mantiene `clients` limpio para Finanzas/CRM. El comportamiento del booking público (siempre inserta) NO se modifica.

---

## Flexibilidad del horario (MANUAL-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Cualquier hora libre | Agendar a cualquier hora sin colisión, incluso fuera de grilla (walk-in) | ✓ |
| Solo slots publicados | Mismo selector que el público (availability dentro de horario de atención) | |
| Publicados + forzar con aviso | Default publicados, permite forzar fuera de grilla con confirmación | |

**User's choice:** Cualquier hora libre (recomendada).
**Notes:** Caso de uso ancla = reserva telefónica/walk-in. Flexibilidad solo respecto al horario de atención; el anti-doble-booking (colisión con otro turno) se mantiene intacto → mismo `slot_taken`.

---

## Disparo de la UI (UI hint: yes)

| Option | Description | Selected |
|--------|-------------|----------|
| Botón + click en slot | Botón "Nuevo turno" en Agenda + Turnos; click en slot vacío pre-llena; modal/drawer | ✓ |
| Solo botón "Nuevo turno" | Único botón con form vacío, sin interacción con la grilla | |
| Solo desde Turnos | Alta solo en pestaña Turnos | |

**User's choice:** Botón + click en slot (recomendada).
**Notes:** Modal en desktop, drawer (`vaul`) en mobile. Reusar lenguaje visual de la agenda y componentes shadcn existentes; sin dependencias nuevas.

---

## Claude's Discretion

- Arquitectura del reúso del pipeline (helper compartido en `lib/`; route handler nuevo vs server action) — research/planner decide la forma; corre con sesión autenticada (anon key + RLS), locked por roadmap.
- Verificación/migración de policy RLS para `appointments` INSERT por el dueño autenticado.
- Sin mail de confirmación al cliente desde el alta manual (consistente con path público sin seña); gcal best-effort en `after()`.
- reCAPTCHA omitido en el alta manual (actor autenticado).

## Deferred Ideas

- **MANUAL-04 (seña opcional en turno manual) → diferido a v2.** Actualizar Traceability de REQUIREMENTS.md para reflejar que sale de Phase 1.
