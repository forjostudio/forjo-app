---
phase: 02-mp-webhook-signature-amount-check
plan: 01
subsystem: payments
tags: [mercadopago, webhook, hmac, signature, refactor, security]

# Dependency graph
requires:
  - phase: 01
    provides: getMPWebhookSecret() y el patron de webhook firmado validado en prod
provides:
  - "verifyMPSignature exportado desde lib/mercadopago.ts (verificador HMAC compartido)"
  - "Webhook de suscripcion importando el verificador compartido sin copia inline"
affects: [02-02, deposit-webhook, mp-webhook-signature]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verificacion HMAC de firma MP centralizada en lib/mercadopago.ts junto a getMPWebhookSecret"
    - "Extraccion verbatim de logica de seguridad validada en prod (sin cambio de algoritmo)"

key-files:
  created: []
  modified:
    - lib/mercadopago.ts
    - app/api/subscription/webhook/route.ts

key-decisions:
  - "verifyMPSignature movido VERBATIM (D-03): mismo manifest, lowercasing, guard de longitud, timingSafeEqual y fail-closed. Cambiar la logica reintroduciria bugs ya evitados en prod."
  - "Imports crypto (built-in Node) y type NextRequest agregados a lib/mercadopago.ts; el modulo ya es server-only (fetch + process.env), por lo que es valido."

patterns-established:
  - "Fuente unica de verdad para verificacion de firma de webhooks MP en lib/mercadopago.ts"

requirements-completed: [SEC-02]

# Metrics
duration: 8min
completed: 2026-06-16
status: complete
---

# Phase 02 Plan 01: Extraer verifyMPSignature a lib/mercadopago.ts Summary

**verifyMPSignature movido verbatim a lib/mercadopago.ts como export reusable; el webhook de suscripcion ahora lo importa sin copia inline ni imports muertos, con comportamiento inalterado.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-16T20:48:44Z
- **Completed:** 2026-06-16T20:57:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `verifyMPSignature` extraido verbatim del webhook de suscripcion (§18-54) a `lib/mercadopago.ts`, ubicado inmediatamente tras su unica dependencia `getMPWebhookSecret`, y exportado.
- Imports `crypto` (built-in) y `import type { NextRequest }` agregados al tope de `lib/mercadopago.ts`.
- Webhook de suscripcion repuntado a `import { mpFetch, verifyMPSignature } from '@/lib/mercadopago'`; eliminada la copia inline, el doc-comment y los imports muertos (`getMPWebhookSecret`, `crypto`).
- Comportamiento del webhook de suscripcion inalterado: call site intacto, 401 en firma invalida, 200 en bad JSON.

## Task Commits

Each task was committed atomically:

1. **Task 1: Mover verifyMPSignature a lib/mercadopago.ts (verbatim + export)** - `367c2c8` (refactor)
2. **Task 2: Repuntar el webhook de suscripcion al verificador compartido** - `032e083` (refactor)

## Files Created/Modified
- `lib/mercadopago.ts` - Agrega imports crypto + type NextRequest; exporta verifyMPSignature (HMAC SHA256, manifest, timingSafeEqual, fail-closed) tras getMPWebhookSecret.
- `app/api/subscription/webhook/route.ts` - Elimina la copia inline de verifyMPSignature y su doc-comment; importa el verificador compartido; quita imports muertos (getMPWebhookSecret, crypto).

## Decisions Made
- Movimiento VERBATIM (D-03): se conservo exactamente el algoritmo validado en prod (manifest `id:<id>;request-id:<reqid>;ts:<ts>;` omitiendo partes ausentes, lowercasing del id, guard de longitud, `crypto.timingSafeEqual`, fail-closed ante secreto/firma ausente). No se toco la logica.
- `crypto` removido del webhook de suscripcion tras verificar 0 usos restantes (grep `crypto` = 0).
- `import type { NextRequest }` conservado en el webhook porque el handler `POST` lo sigue tipando.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. `npx tsc --noEmit` paso limpio en ambas tareas. `npm run lint` reporta 590 problemas preexistentes en archivos no relacionados (`components/dashboard/upcoming-appointments.tsx`, `design_handoff_forjo_rebrand/preview/app.js`); ninguno toca los dos archivos modificados (grep filtrado por `subscription/webhook` y `lib/mercadopago` = 0 matches). Out-of-scope per SCOPE BOUNDARY — no se modificaron.

## Threat Model Compliance
- T-02-01 (Spoofing, mitigate): cumplido — la extraccion es verbatim, preservando el algoritmo HMAC validado en prod.
- T-02-02 (Tampering, accept): cumplido — comportamiento observable del webhook de suscripcion sin cambios (solo la fuente del simbolo).
- T-02-SC (accept): cumplido — no se instalo ningun paquete (solo `crypto` built-in).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `verifyMPSignature` ya disponible como export compartido en `lib/mercadopago.ts`.
- Listo para Plan 02-02: el webhook de seña puede importar el mismo verificador.
- `npm run build` (verificacion de cierre de fase) se corre tras Plan 02-02, cuando ambos webhooks consuman el simbolo.

## Self-Check: PASSED

- lib/mercadopago.ts — FOUND (exports verifyMPSignature)
- app/api/subscription/webhook/route.ts — FOUND
- 02-01-SUMMARY.md — FOUND
- Commit 367c2c8 — FOUND
- Commit 032e083 — FOUND

---
*Phase: 02-mp-webhook-signature-amount-check*
*Completed: 2026-06-16*
