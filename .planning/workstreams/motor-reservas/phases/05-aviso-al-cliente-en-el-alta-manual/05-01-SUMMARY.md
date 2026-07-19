---
phase: 05-aviso-al-cliente-en-el-alta-manual
plan: 01
subsystem: email
tags: [email, notifications, alta-manual, resend]
requires: [resolveSender, fmtDate, renderEmailHeader, normalizeArWhatsApp, resendSend]
provides: [sendManualBookingConfirmation]
affects: [lib/email.ts]
tech-stack:
  added: []
  patterns: [best-effort-email-template, resolveSender-header-sanitization, test-puro-fetch-stub]
key-files:
  created:
    - test/manual-notify-email.test.ts
  modified:
    - lib/email.ts
decisions:
  - "D-03: mail sin precio/seña/saldo — variante nueva sendManualBookingConfirmation, NO param sobre sendConfirmationEmail"
  - "D-04: botón de cancelar solo si hay cancelToken; sin token el mail se manda igual (degradación elegante)"
metrics:
  duration: ~10min
  completed: 2026-07-19
  tasks: 1
  files: 2
status: complete
requirements: [BOOK-NOTIFY-01]
---

# Phase 05 Plan 01: sendManualBookingConfirmation Summary

Nuevo template de mail `sendManualBookingConfirmation` en `lib/email.ts`: confirmación LIMPIA de turno (servicio, fecha, hora, negocio + link de cancelar opcional) sin el bloque de precio/seña/saldo del booking público, base para que el endpoint del alta manual (Plan 02) avise al cliente.

## What Was Built

- **`lib/email.ts` → `sendManualBookingConfirmation`** (nuevo export). Firma por objeto desestructurado (convención del módulo): `to`, `clientName`, `service`, `date`, `time`, `businessName`, `businessSlug`, `primaryColor?`, `logoUrl?`, `whatsapp?`, `cancelToken?`, `resendApiKey?`, `resendFrom?`. NO recibe `price` ni `deposit`.
  - Modelada sobre `sendConfirmationEmail` (mismo layout de tabla/branding, accent = `primaryColor` con fallback `#d94a2b`, footer "Enviado por Forjo Gestión · forjo.studio/{slug}") pero el bloque "Detalle del turno" contiene SOLO Servicio / Fecha / Hora — sin filas de Total / Seña / Saldo (D-03).
  - Botón "Cancelar turno" (`${baseUrl}/cancelar/${cancelToken}`) se renderiza solo si hay `cancelToken`; sin token se omite (D-04). Link de WhatsApp solo si `normalizeArWhatsApp` da un número usable.
  - Reusa tal cual los helpers del módulo: `resolveSender` (key+from, ya sanitiza el header From → T-05-04), `fmtDate`, `renderEmailHeader`, `normalizeArWhatsApp`, `resendSend`. Subject y `text` plano también sin importes.
- **`test/manual-notify-email.test.ts`** — test puro (environment node, sin red ni Supabase). Stubbea `global.fetch` con `vi.stubGlobal`, pasa `resendApiKey`/`resendFrom` propios (path de key propia en `resolveSender`), captura el body del POST y asierta sobre `html`/`text`/`subject`. 5 casos: (1) un POST a api.resend.com, (2) presencia servicio/fecha/hora/negocio, (3) cancel-link con token, (4) degradación sin token, (5) ausencia de precio/seña/saldo/total sobre html y text.

## Verification

- `npx vitest run test/manual-notify-email.test.ts` → **5/5 verdes**.
- `npx tsc --noEmit` → **exit 0**, sin errores nuevos.
- Inspección: el bloque "Detalle del turno" no tiene filas de Total/Seña/Saldo.

## TDD Gate Compliance

- RED: commit `0262442` `test(05-01): add failing test...` (5 fallando, función inexistente).
- GREEN: commit `89d3a83` `feat(05-01): sendManualBookingConfirmation...` (5 verdes).
- REFACTOR: no necesario (el código espeja los patrones existentes del módulo sin deuda).

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model

- **T-05-04 (header injection):** mitigado — se reusa `resolveSender`/`fromDisplayName`, no se arma el header `From` a mano.
- **T-05-05 (info disclosure):** mitigado — la función solo renderiza los params que recibe; no lee DB ni otros tenants. El caller (Plan 02) acota la fuente.
- **T-05-SC (supply chain):** sin dependencias nuevas; reusa `fetch` crudo y helpers ya en el repo.

## Notes for Next Plan (05-02)

- El endpoint `app/api/appointments/create/route.ts` debe: leer el flag del body (`notify`/`notifyClient`), ampliar el `select` de business (slug, primary_color, logo_url, whatsapp), obtener secrets con `getBusinessSecrets`, y disparar `sendManualBookingConfirmation` en `after()` gateado por email presente (best-effort, try/catch + console.error).
- Confirmar que `createAppointmentCore` devuelve `cancelToken` en el alta manual confirmada (si no, el mail va sin link — D-04).

## Self-Check: PASSED

- `lib/email.ts` existe y exporta `sendManualBookingConfirmation`: FOUND.
- `test/manual-notify-email.test.ts` existe: FOUND.
- Commit `0262442` (test RED): FOUND.
- Commit `89d3a83` (feat GREEN): FOUND.
