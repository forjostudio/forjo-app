# Phase 5: Aviso al cliente en el alta manual - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-19
**Phase:** 5-aviso-al-cliente-en-el-alta-manual
**Areas discussed:** Checkbox sin email, Contenido del mail, Link de cancelar

---

## Checkbox cuando no hay email del cliente

| Option | Description | Selected |
|--------|-------------|----------|
| Deshabilitado + hint | Se ve deshabilitado con "agregá un email…"; se habilita al escribir email | ✓ |
| Oculto | No aparece hasta que hay email | |

**User's choice:** Deshabilitado + hint.

---

## Contenido del mail de confirmación

| Option | Description | Selected |
|--------|-------------|----------|
| Solo el turno, sin precio | Confirmación limpia (servicio/fecha/hora/negocio + cancelar), sin seña/saldo | ✓ |
| Reusar sendConfirmationEmail tal cual | Verbatim, muestra precio/seña ("$0 seña" en manual) | |

**User's choice:** Solo el turno, sin precio.
**Notes:** No reusar `sendConfirmationEmail` verbatim; variante/template sin el framing de seña.

---

## Link de cancelar en el mail

| Option | Description | Selected |
|--------|-------------|----------|
| Sí, con link de cancelar | Usa el cancelToken del core, igual que el público | ✓ |
| Sin link de cancelar | Solo confirma | |

**User's choice:** Sí, con link de cancelar.

---

## Claude's Discretion

- Mecanismo del template (variante vs template nuevo).
- Nombre del flag en el body.
- Confirmar cancelToken en el alta manual confirmada.
- Ampliar el select de business en el endpoint.

## Deferred Ideas

None — fase de un solo requisito.
