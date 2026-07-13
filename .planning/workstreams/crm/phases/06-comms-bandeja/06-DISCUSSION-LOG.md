# Phase 6: Comms (Bandeja) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 06-comms-bandeja
**Areas discussed:** Mail two-way (COMMS-03) scope, Alcance Forjo-side WhatsApp, Takeover + envío manual, Modelo de datos + RLS

---

## Mail two-way (COMMS-03): scope

| Option | Description | Selected |
|--------|-------------|----------|
| Diferir inbound a v2 | Bandeja WhatsApp + mail saliente | |
| Elegir proveedor inbound ahora | Resend inbound/Postmark/SES/CF — costo+DNS | |
| Solo WhatsApp, sin tab mail | — | ✓ (vía forjo-advisor) |

**User's choice:** Delegada a `forjo-advisor`.
**Notes:** El advisor decidió **diferir el mail ENTERO (entrante + saliente) a v2** → Phase 6 = bandeja WhatsApp only, sin tab Email. Razón: inbound (§9.2) = infra/costo no resuelto; bandeja con mail solo-saliente es incoherente; faseo §9.5. **COMMS-03 queda DIFERIDO** (flag de scope). → D-01.

---

## Alcance Forjo-side del WhatsApp

| Option | Description | Selected |
|--------|-------------|----------|
| Forjo-side completo, listo para el bot | tablas + ingest + GET context + UI bandeja | ✓ |
| Solo tablas + bandeja con seed/mock | sin ingest real | |
| Ingest + tablas, UI mínima | invierte prioridad del mock | |

**User's choice:** Forjo-side completo, listo para el bot → D-02. La sync real del bot (otro repo) se configura después.

---

## Takeover + envío manual (COMMS-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Estado takeover + saliente diferido | leer+monitorear+tomar; composer "próximamente" | ✓ (vía forjo-advisor) |
| Bidireccional completo ahora | requiere endpoints nuevos en el bot (otro repo) | |

**User's choice:** Delegada a `forjo-advisor`.
**Notes:** El advisor eligió la opción (a): Phase 6 setea el estado IA→Humano + lo expone para que el bot pause; **envío manual saliente DIFERIDO** (composer "próximamente") hasta que el bot exponga `send`. Razón: la (b) crea dependencia cross-repo (el bot es otro repo en VPS) que rompe el "Phase 6 self-contained". COMMS-02 cubierto en estado/takeover. → D-03.

---

## Modelo de datos conversations/messages + RLS (compartido)

| Option | Description | Selected |
|--------|-------------|----------|
| Canónicas + RLS business-scoped + admin read-all | dueño ve lo suyo (base Mensajes) + operador ve todo | ✓ |
| Solo admin-only por ahora | rehacer RLS cuando llegue gestion-rebrand | |

**User's choice:** Tablas canónicas + RLS business-scoped + admin override → D-04. gestion-rebrand (add-on Mensajes) reusa estas tablas.

---

## Claude's Discretion

- Schema exacto de conversations/messages (idempotencia por id externo del bot).
- Shape del payload de ingest (alinear con HANDOFF del agent kit).
- Estructura de componentes de la bandeja.

## Deferred Ideas

- Mail two-way completo (COMMS-03) → v2 (elegir infra inbound: costo+DNS).
- Envío manual saliente por WhatsApp (Forjo→bot send) → slice integración bot↔Forjo (endpoint nuevo en el bot).
- Refactor multi-tenant del bot + sync real configurada → repo del bot.
