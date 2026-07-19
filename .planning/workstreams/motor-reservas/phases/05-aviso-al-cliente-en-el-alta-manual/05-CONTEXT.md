# Phase 5: Aviso al cliente en el alta manual - Context

**Gathered:** 2026-07-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Sumar un **aviso opt-in por mail al cliente** cuando el dueño carga un turno a mano desde el panel.
Requisito único: BOOK-NOTIFY-01. El alta manual (`app/api/appointments/create` + el form "Nuevo turno")
YA existe (v0.12); esta fase le agrega SOLO el mail. Google Calendar ya se sincroniza y NO cambia.

**Fuera de scope:** reconstruir el alta manual, tocar el booking público o `lib/booking-core.ts`, o la
ventana de reserva (Phase 4). El default histórico de v0.12 (D-02: el alta manual NO avisaba) se
respeta haciéndolo **opt-in** (default OFF).
</domain>

<decisions>
## Implementation Decisions

### Checkbox en el form "Nuevo turno"
- **D-01:** Checkbox **"avisar al cliente por mail"**, default **OFF** (opt-in; respeta la decisión de
  v0.12 de no avisar por default). Cuando el turno NO tiene email del cliente cargado: el checkbox se
  muestra **deshabilitado con un hint** ("agregá un email del cliente para poder avisarle") y se habilita
  apenas se escribe un email. El flag viaja en el POST body a `appointments/create`.

### Mail (endpoint `appointments/create`)
- **D-02:** Si el flag está ON **y** el cliente tiene email, el endpoint manda el mail en `after()`
  (best-effort: no demora la respuesta ni rompe el alta si falla; try/catch + console.error) — mismo
  patrón que el mail del booking público (`app/api/booking/create`).
- **D-03:** **Contenido = solo el turno, SIN precio ni framing de seña/saldo.** Confirmación limpia:
  servicio, fecha, hora, negocio (+ link de cancelar). NO se reusa `sendConfirmationEmail` **verbatim**
  (muestra precio/seña/saldo → en un alta manual sin seña mostraría "$0 seña", confuso). El mecanismo
  exacto (variante nueva tipo `sendManualBookingConfirmation` vs template propio vs param que oculta el
  bloque de precio) es discreción de research/planner.
- **D-04:** El mail **incluye link de cancelar** (usa el `cancelToken` que `createAppointmentCore` ya
  genera). Si el core no devolviera cancelToken en el path confirmed-sin-seña, research lo confirma y el
  mail va sin link (degradación elegante).

### Claude's Discretion
- Mecanismo del template (variante de la función existente vs template nuevo).
- Nombre del flag en el body (`notify` / `notifyClient`).
- Confirmar que `createAppointmentCore` devuelve `cancelToken` en el alta manual confirmada.
- El endpoint hoy trae `business` con `select('id, name, address, buffer_minutes')` → hay que **ampliar
  el select** con lo que el mail necesita (slug, primary_color, logo_url, whatsapp) + `getBusinessSecrets`
  (ya importado) para resend key/from.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### El alta manual (donde se agrega el mail)
- `app/api/appointments/create/route.ts` — endpoint autenticado (owner, anon+RLS, tenant por owner_id).
  Hoy hace gcal en `after()` y NO manda mail (D-01 de v0.12). Acá: leer el flag del body + mandar el mail
  en `after()`; ampliar el `select` de business; NO tocar el core.
- `components/dashboard/nuevo-turno-form.tsx` — el form compartido (modal desktop / drawer mobile) de
  "Nuevo turno". Acá va el checkbox + el hint; ya maneja clientEmail; sumar el flag al POST.

### Mail
- `lib/email.ts` — `sendConfirmationEmail` (L74; NO reusar verbatim, es la base para la variante) +
  `sendPendingPaymentEmail` (L547) / `sendExpiredHoldEmail` (L660) como patrón de params (resendApiKey,
  resendFrom, primaryColor, logoUrl, cancelToken). Helpers `resolveSender`, `fmtDate`.
- `app/api/booking/create/route.ts` — patrón a espejar: mail en `after()` con `getBusinessSecrets`,
  best-effort, gateado por email presente.

### Core
- `lib/booking-core.ts` — `createAppointmentCore` (devuelve `cancelToken`, `serviceName`, etc.). NO se toca.

### Requirements
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — BOOK-NOTIFY-01.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Patrón mail best-effort en `after()`** del booking público (`booking/create`): `getBusinessSecrets` →
  helper de mail → try/catch + console.error. Se espeja en `appointments/create`.
- **El form ya captura clientEmail** → el checkbox reacciona a si hay email (habilitado/deshabilitado).
- **`cancelToken`** del core → el link de cancelar del mail (mismo mecanismo que el público).

### Established Patterns
- Efectos best-effort en `after()` (no demoran ni rompen el flujo principal).
- Secretos por tenant vía `getBusinessSecrets` (service-role acotado, solo el propio negocio).
- El alta manual NO toca `booking-core`; solo se le agrega el mail en el route.

### Integration Points
- `nuevo-turno-form.tsx` (checkbox + hint) → flag en el POST body → `appointments/create` (mail en `after()`).
</code_context>

<specifics>
## Specific Ideas

- Checkbox: "avisar al cliente por mail", default OFF, deshabilitado con hint si no hay email.
- Mail: confirmación limpia (servicio/fecha/hora/negocio + link cancelar), sin precio/seña.
</specifics>

<deferred>
## Deferred Ideas

None — fase de un solo requisito, acotada.
</deferred>

---

*Phase: 5-aviso-al-cliente-en-el-alta-manual*
*Context gathered: 2026-07-19*
