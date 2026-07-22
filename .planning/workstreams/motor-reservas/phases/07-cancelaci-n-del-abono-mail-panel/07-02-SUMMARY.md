---
phase: 07-cancelaci-n-del-abono-mail-panel
plan: 02
subsystem: notificaciones
tags: [email, resend, abonos, multi-tenant]
requires:
  - "lib/email.ts helpers privados: resolveSender, fmtDate, renderEmailHeader, normalizeArWhatsApp, resendSend"
provides:
  - "sendAbonoCancelledEmail (mail de baja de serie al cliente)"
  - "sendAbonoCancelledAdminNotification (aviso de baja al dueño)"
affects:
  - "Plan 03 (vía token público) y Plan 04 (vía panel) — ambos consumen estos dos templates"
tech-stack:
  added: []
  patterns:
    - "template de mail = objeto desestructurado + resolveSender + resendSend (html + text siempre)"
    - "filas de detalle armadas como array para que las opcionales no dejen borde/fila huérfana"
key-files:
  created:
    - test/abono-cancel-email.test.ts
  modified:
    - lib/email.ts
decisions:
  - "El aviso al dueño es un template PROPIO y no un flag más de sendAdminNotification: esa función está atada a date/price/deposit de un turno suelto y la baja de serie no tiene ninguno de los tres."
  - "Las filas de detalle se generan desde un array ({label, value, capitalize}) en vez de HTML inline condicional: con `service` vacío o sin `lastDate` no queda fila huérfana ni borde colgando."
  - "Ambos templates reciben cancelledCount y lastDate ya calculados por el caller — nunca iteran fechas (D-14)."
metrics:
  duration: ~20 min
  completed: 2026-07-21
  tasks: 2
  files: 2
  tests: 14
status: complete
---

# Phase 7 Plan 02: Templates de mail de la baja de serie — Summary

Dos templates nuevos en `lib/email.ts` (mail al cliente + aviso al dueño) que describen la BAJA de un turno fijo semanal como resumen (conteo de turnos cancelados + fecha del último), con branding por tenant y política anti-avalancha probada: 1 mail por baja, nunca 1 por turno.

## Qué se construyó

**`sendAbonoCancelledEmail`** (`lib/email.ts`) — mail al cliente. Copia la estructura de `sendAbonoConfirmation`: tabla de 560px, header con el acento del negocio (`primary_color` con fallback `#d94a2b`), bloque de detalle con borde izquierdo acentuado, footer con el slug. Filas: Servicio (solo si viene), Se repetía (`dayLabel`, capitalizado), Hora, Turnos cancelados (concordado singular/plural) y Último turno cancelado (solo si viene `lastDate`, renderizado con el `fmtDate` del módulo). Cierra con botón a `${NEXT_PUBLIC_APP_URL}/${businessSlug}` y link de WhatsApp si hay número. Subject: `Tu turno fijo fue dado de baja — ${businessName}`.

**`sendAbonoCancelledAdminNotification`** (`lib/email.ts`) — aviso al dueño, con el molde de `sendAdminNotification`: header oscuro `#1a1714`, eyebrow, badge `#fee2e2` / `#991b1b`, bloque de contacto del cliente con link `wa.me` (teléfono normalizado a dígitos) y `mailto`. Subject: `❌ Turno fijo dado de baja — ${clientName} · ${dayLabel} ${hora} hs`.

Los dos reusan `resolveSender` (que ya sanitiza el display name del header `From`), `renderEmailHeader`, `resendSend`, y mandan siempre `html` + `text`. Ninguno menciona importes: v0.24 no cobra el abono.

**`test/abono-cancel-email.test.ts`** — 14 tests puros con `fetch` stubbeado, copiando el andamiaje de `test/manual-notify-email.test.ts` (`stubFetchOk`, `capturedPayload`, `resendApiKey`/`resendFrom` propios para no depender de `process.env`).

## Decisiones tomadas

| Decisión | Por qué |
|---|---|
| Aviso al dueño = template nuevo, no un flag en `sendAdminNotification` | Esa función es `date`/`price`/`deposit` de un turno suelto; la baja de serie no tiene fecha puntual ni importe. Meterle un cuarto flag la habría vuelto una función con tres formas incompatibles. |
| Filas de detalle desde un array | El plan exige que con `service` vacío o sin `lastDate` no quede fila huérfana. Con HTML inline condicional además queda un `border-bottom` colgando en la última fila. El array resuelve ambos con una sola regla. |
| `cancelledCount` como número, no lista de fechas | D-14 (LOCKED): cancelar 7 turnos manda 1 mail. Si el template recibiera fechas, la tentación de iterar (y de mandar uno por turno en el caller) queda abierta. |

## Verificación

- `npx tsc --noEmit` → exit 0.
- `npx vitest run test/abono-cancel-email.test.ts` → 14/14 verde (el plan pedía ≥9).
- Suite completa: `npx vitest run` → 584 passed | 80 skipped (51 archivos), sin regresiones.
- `grep -cE "^export async function sendAbonoCancelledEmail" lib/email.ts` → 1; ídem `sendAbonoCancelledAdminNotification` → 1.
- `grep -cE "\bresolveSender\s*\(" lib/email.ts`: 9 → 11 (+2, uno por template nuevo).
- `git diff -U0 lib/email.ts` → 0 líneas eliminadas: `sendAbonoConfirmation`, `sendAdminNotification` y `sendClientCancelEmail` quedaron intactos (T-07-11).
- `git diff --name-only` del plan: solo `lib/email.ts` y `test/abono-cancel-email.test.ts`. No se tocó `app/cancelar/`, `app/api/cancel/` ni `supabase/migrations/` (D-10).

## Cobertura del threat model

| Threat | Estado |
|---|---|
| T-07-07 (spoofing del `From`) | Mitigado: los dos templates arman el remitente con `resolveSender(businessName, resendApiKey, resendFrom)`; ninguno concatena el header a mano. |
| T-07-08 (destinatarios) | Mitigado: `to: [to]` con un único destinatario; ningún template acepta listas ni CC. |
| T-07-09 (fuga cross-tenant) | Mitigado: no reciben `business_id` ni consultan la base; renderizan solo lo que el caller les pasa. |
| T-07-10 (avalancha de mails) | Mitigado y probado: Tests 12 y 13 asertan `toHaveBeenCalledTimes(1)` con `cancelledCount: 7`. |
| T-07-11 (tampering sobre templates vivos) | Mitigado: verificado por diff, 0 líneas eliminadas. |
| T-07-SC (supply chain) | N/A: el plan no instaló ningún paquete. |

## Deviations from Plan

None — el plan se ejecutó tal cual está escrito.

**Nota de hook (no es una desviación):** el hook `impeccable` marcó 18 hallazgos `side-tab` ("thick colored border on one side of a card") en `lib/email.ts`, de los cuales 2 corresponden a los bloques nuevos. Se dejan **sin cambiar**: `border-left:4px solid ${accent}` es el patrón visual establecido de TODOS los templates del módulo desde hace varias versiones en producción, y el plan lo pide explícitamente ("bloque de detalle con borde izquierdo del color del negocio"). Romper la consistencia con `sendAbonoConfirmation` / `sendClientCancelEmail` por un lint de diseño sería peor. No se agregó ningún `impeccable-disable` inline: la supresión, si se quiere, la decide el usuario.

## Notas para los planes siguientes

- Los callers (Plan 03 vía token, Plan 04 vía panel) tienen que resolver `cancelledCount` y `lastDate` ANTES de llamar, y pasar los secretos por tenant (`getBusinessSecrets(business.id)` → `resend_api_key` / `resend_from`).
- `sendAbonoCancelledAdminNotification` sale **solo** por la vía del cliente (D-13). La baja desde el panel manda únicamente el mail al cliente (D-15).
- `service` puede ir `''` sin romper nada — el caller no está obligado a resolverlo.

## Self-Check: PASSED

- `lib/email.ts` — FOUND (modificado)
- `test/abono-cancel-email.test.ts` — FOUND (creado)
- Commit `ece1ebe` (Task 1) — FOUND
- Commit `c5306c5` (Task 2) — FOUND
