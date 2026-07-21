---
phase: 07-cancelaci-n-del-abono-mail-panel
plan: 07
subsystem: api
tags: [email, resend, html-escaping, security, vitest, abono]

# Dependency graph
requires:
  - phase: 07-cancelaci-n-del-abono-mail-panel
    provides: los dos templates de baja de abono (07-02) y el archivo de tests de mails
provides:
  - "esc() local en lib/email.ts: escapado de HTML compartido por los templates de baja y por renderEmailHeader"
  - "AbortSignal.timeout(10s) en el POST a Resend (todos los templates del módulo)"
  - "logs de los dos templates de baja sin direcciones de mail (prefijo [abonos/cancel])"
  - "clientName acotado a 120 chars en la superficie anónima de booking"
  - "helper payloadAt(fetchMock, i) para asertar envíos múltiples por índice"
affects: [07-09 (after() en la ruta pública de baja), secure-phase 07, futuros templates de mail]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Escapado de HTML en la capa de template (función local, sin dependencias) + acotado del input en la fuente"
    - "Timeout duro en toda llamada saliente que vive en el request path"
    - "Tests de mail que asiertan por índice de envío cuando el caso hace más de un POST"

key-files:
  created: []
  modified:
    - lib/email.ts
    - app/api/booking/create/route.ts
    - test/abono-cancel-email.test.ts

key-decisions:
  - "esc() escapa &, <, >, \" y ' (ampersand primero) y solo se aplica al HTML: el text plano y el subject quedan sin escapar a propósito"
  - "renderEmailHeader se escapa una sola vez para TODOS los templates: se escapa el resultado de toUpperCase(), no al revés (mayusculizar una entidad daría &AMP;)"
  - "El waPhone del href de wa.me no lleva esc porque ya está reducido a dígitos; el teléfono que se MUESTRA sí se escapa"
  - "Los console.log de los templates VIEJOS quedan como están: deuda pre-existente fuera del alcance del review"
  - "Timeout de 10 s: holgado para un POST a una API de mail y muy por debajo del límite de la función serverless"

patterns-established:
  - "Todo valor dinámico que entra a un template HTML de lib/email.ts pasa por esc()"
  - "Todo input de la superficie anónima se acota en el route handler (patrón .slice() de notes)"

requirements-completed: [ABONO-04, ABONO-05]

# Metrics
duration: 18min
completed: 2026-07-21
status: complete
---

# Phase 07 Plan 07: Endurecimiento de los mails de baja del abono — Summary

**Los dos mails de baja del abono dejan de ser un canal de inyección de contenido/links (esc() en todo el HTML + acotado del nombre en la fuente anónima), el POST a Resend aborta a los 10 s y los logs de envío ya no llevan direcciones de clientes.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-07-21T18:33Z
- **Completed:** 2026-07-21T18:41Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- **WR-02 cerrado.** `esc()` (función local, sin dependencias nuevas) aplicado a todo valor dinámico que entra al HTML de `sendAbonoCancelledEmail` y `sendAbonoCancelledAdminNotification`, y también a `renderEmailHeader` (compartido por TODOS los templates, incluidos los viejos). Un nombre de cliente con un ancla HTML —reservable desde la superficie anónima— llega al inbox del dueño como texto, no como link.
- **Defensa en profundidad en la fuente.** `app/api/booking/create/route.ts` acota `clientName` a 120 caracteres (mismo patrón que `notes`), una sola línea funcional cambiada.
- **WR-05 (mitad email) cerrado.** `resendSend` manda con `signal: AbortSignal.timeout(10_000)`: un Resend degradado ya no puede colgar el handler hasta el límite de la función serverless.
- **IN-03 cerrado.** Los dos `console.log` de los templates de baja dejaron de interpolar el destinatario; ahora llevan prefijo `[abonos/cancel]` y solo describen el evento.
- **WR-09 cerrado.** El Test 5 asierta los DOS envíos por índice (`null` en el 0, `undefined` en el 1) vía el nuevo `payloadAt(fetchMock, i)`, y el Test 11 suma el caso espejo del aviso al dueño.
- Suite completa verde: **603 tests pasados** (88 skipped, los que requieren DB local) + `tsc --noEmit` limpio.

## Task Commits

1. **Task 1 (RED): tests del escapado** — `a6436d1` (test)
2. **Task 1 (GREEN): esc() + acotado en booking/create** — `52dee64` (feat)
3. **Task 2: timeout de Resend + logs sin PII** — `61a68cc` (fix)
4. **Task 3: payloadAt + Test 5/11 por índice** — `e4fa098` (test)

## Files Created/Modified

- `lib/email.ts` — `esc()` nuevo (helpers del módulo); escapado aplicado en `renderEmailHeader` y en los dos templates de baja (18 líneas con `esc(`); `AbortSignal.timeout(10_000)` en `resendSend`; los dos logs de baja sin PII.
- `app/api/booking/create/route.ts` — `clientName` acotado con `.slice(0, 120)` (+2 líneas de comentario, 1 línea funcional cambiada).
- `test/abono-cancel-email.test.ts` — helper `payloadAt`; 7 tests nuevos (5 de escapado, 2 de `signal`); Test 5 y Test 11 reescritos para asertar por índice. 14 → 21 tests.

## Decisions Made

- **`esc()` solo para HTML.** El `text` plano y el `subject` NO se escapan: no hay contexto de markup y las entidades se verían como basura para el lector (T-07-32, riesgo aceptado en el plan). Hay tests que fijan este contrato (`text` muestra el nombre tal cual).
- **`renderEmailHeader` escapado para todos los templates.** Ningún test de mails viejos rompió por esto (`manual-notify-email`, y la suite completa) — no hizo falta arreglar ningún template.
- **Templates viejos sin tocar (intencional).** Los `console.log` de `sendConfirmationEmail`, `sendManualBookingConfirmation`, `sendAbonoConfirmation`, `sendAdminNotification`, `sendBusinessCancelEmail`, `sendClientCancelEmail`, `sendPendingPaymentEmail` y `sendExpiredHoldEmail` siguen interpolando el destinatario: es deuda pre-existente, no un hallazgo de esta fase, y tocarlos ampliaría el diff sobre flujos vivos sin cerrar nada del review. Quedan 8 ocurrencias de `console.log(...${to})` en el archivo, ninguna en los dos templates de baja. Sus cuerpos HTML tampoco se escaparon (solo su header compartido): esos templates reciben valores de flujos ya cubiertos por otras superficies y su endurecimiento es candidato a un plan propio.
- **`waPhone` sin `esc`.** El valor que va dentro del `href` de `wa.me` ya está reducido a dígitos por el reemplazo de no-dígitos; se dejó comentado para que no parezca un olvido. El teléfono visible sí se escapa.
- **`primaryColor`, `businessSlug` y `bookingUrl` sin escapar** en los templates de baja: son owner-controlled (no atacante anónimo) y el plan enumeró explícitamente el alcance. Riesgo residual bajo, anotado acá para secure-phase.
- **`sendAbonoConfirmation` y el botón condicional de `cancelUrl` no se tocaron** (D-16, ya cerrado en Wave 2).

## Deviations from Plan

None - plan executed exactly as written.

Nota: no se agregó ninguna dependencia (T-07-SC respetado): `package.json` y `package-lock.json` quedan intactos.

## Issues Encountered

- **Verificación por mutación del caso `undefined` (Task 3).** La mutación obvia (`lastDate!.trim()` sin guard) rompe también el caso `null`, así que no probaba nada sobre `undefined`. Se hizo una segunda mutación que aísla el path (`lastDate === null ? '' : lastDate!.trim() ? ...`): con ella fallan Test 5 y Test 11, confirmando que el caso `undefined` se asierta de verdad. La mutación se revirtió con `git checkout -- lib/email.ts` y la suite volvió a 21/21.
- **Hook de diseño (`impeccable`) sobre `lib/email.ts`:** reporta `side-tab` y `overused-font` en los templates de mail. Son falsos positivos en este contexto (markup de email, no UI de la app) y además el plan prohíbe explícitamente cambiar la estructura visual de los templates. Se dejaron sin cambios y sin suprimir.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- La otra mitad de WR-05 (unificar el criterio de `after()` en la ruta pública de baja) queda para el **Plan 07-09**, como estaba previsto.
- Para secure-phase: T-07-28/29/30/31 quedan mitigados; T-07-32 sigue siendo un `accept` documentado. Nuevo residual menor a considerar: los templates VIEJOS siguen interpolando valores sin escapar en su propio HTML (solo comparten el header ya escapado).

---
*Phase: 07-cancelaci-n-del-abono-mail-panel*
*Completed: 2026-07-21*
