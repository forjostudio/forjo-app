---
phase: 10-reservar-con-cualquiera-desde-la-p-gina-p-blica
plan: 03
subsystem: mail/booking
tags: [ASIGN-05, email, multi-staff, motor-reservas]
requires:
  - "sendConfirmationEmail (lib/email.ts) — template de confirmación branded existente"
  - "appointments.professional_id + professionals(name) — join del turno ya creado (mismo tenant)"
provides:
  - "Param professionalName?: string | null en sendConfirmationEmail + fila 'Profesional' condicional (HTML + text)"
  - "professionals(name) en el select y professionalName al call site en notify/booking (sin seña) y payment/webhook (con seña)"
affects:
  - "lib/email.ts"
  - "app/api/notify/booking/route.ts"
  - "app/api/payment/webhook/[slug]/route.ts"
tech-stack:
  added: []
  patterns:
    - "Fila condicional en template de mail con esc() (mismo patrón que ${deposit > 0 ? ... : ''})"
    - "Nombre del profesional derivado del turno persistido vía join, nunca del front (D-04/D-05)"
key-files:
  created: []
  modified:
    - "lib/email.ts"
    - "app/api/notify/booking/route.ts"
    - "app/api/payment/webhook/[slug]/route.ts"
decisions:
  - "Label 'Profesional' en la tabla de detalle (consistente con Servicio/Fecha/Hora), ubicada junto a Servicio"
  - "Param opcional → cero regresión para callers que no lo pasen; sentinel (sin profesional) no renderiza fila (D-04)"
  - "esc(professionalName) obligatorio: input persistido que cruza a HTML del mail (T-10-06)"
metrics:
  duration: "~10 min"
  completed: "2026-07-25"
  tasks: 3
  files: 3
status: complete
---

# Phase 10 Plan 03: ASIGN-05 en el mail — nombre del profesional en la confirmación

Cierra ASIGN-05 en el mail: el mail de confirmación ahora muestra una fila "Profesional: {nombre}" cuando el turno tiene profesional asignado (elegido o resuelto por "Cualquiera"), en los DOS paths de envío (sin seña vía `notify/booking` y con seña vía `payment/webhook`). El nombre sale siempre del turno ya creado (join `professionals(name)`, mismo tenant), nunca del front, y va escapado con `esc()`.

## Qué se construyó

- **`lib/email.ts` — `sendConfirmationEmail`:** nuevo param opcional `professionalName?: string | null` (destructuring + type inline). En la tabla de detalle del HTML se agregó una fila condicional "Profesional" (con `esc(professionalName)`) justo debajo de Servicio, copiando el estilo inline exacto de las filas hermanas. También se refleja en el `text:` plano (línea "Profesional: …" condicional). Sin nombre (undefined/null) no se renderiza nada → cubre el caso sentinel (negocio sin profesionales nombrados, D-04). No se tocó el branding (accent/fuente los sigue resolviendo `brandEmail`), ni los otros cuatro templates del módulo.
- **`app/api/notify/booking/route.ts` (path SIN seña):** `professionals(name)` agregado al `.select(...)`; `const professionalName = (appt.professionals as { name?: string } | null)?.name || null` (mismo cast que `serviceName`); pasado al call site de `sendConfirmationEmail`. Sin cambios al flag `email_sent` ni a la notif al dueño.
- **`app/api/payment/webhook/[slug]/route.ts` (path CON seña):** `professionals(name)` agregado al `.select('*, services(name, price)')`; mismo derive de `professionalName`; pasado al call site. Sin tocar idempotencia ni chequeo de monto (Pitfall 3: si se tocaba solo `notify/booking`, el mail del flujo con seña quedaba sin el nombre).

## Verificación

- `npx vitest run test/booking-core.test.ts` → 5/5 verde (sin regresión de templates).
- `npx vitest run test/email-escaping.test.ts` → 5/5 verde (escapado del mail intacto).
- `npx tsc --noEmit` → limpio (sin errores de tipo).
- `grep` confirma `professionalName` en `lib/email.ts` (firma + type + fila HTML + text) y `professionals(name)` + `professionalName` en los dos route handlers.

**Envío real del mail:** NO verificable en local — `RESEND_API_KEY` está vacía en el entorno local (STATE), así que Resend devuelve 401 y el mail no sale. La verificación de la ENTREGA real (que la fila "Profesional" aparezca en el mail recibido) queda para el UAT / post-deploy (Plan 05). En local se validó por código el render, el escapado y la estructura.

## Deviations from Plan

None - plan executed exactly as written.

## Threat surface

Cubierto en el plan (T-10-05 fuente del nombre = join del turno persistido, no el front; T-10-06 inyección HTML = `esc()`). Sin superficie nueva fuera del threat_model del plan.

## Self-Check: PASSED

- Files modificados existen: `lib/email.ts`, `app/api/notify/booking/route.ts`, `app/api/payment/webhook/[slug]/route.ts` — FOUND.
- Commits: `533921a` (Task 1), `6092663` (Task 2), `9120cd4` (Task 3) — todos en el log.
