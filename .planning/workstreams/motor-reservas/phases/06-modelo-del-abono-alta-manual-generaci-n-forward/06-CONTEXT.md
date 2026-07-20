# Phase 6: Modelo del abono + alta manual + generación forward - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend del abono recurrente semanal (turno fijo). El dueño crea un abono desde el panel para un
cliente; el sistema genera los turnos hacia adelante (ventana rolling que el cron diario mantiene)
respetando el núcleo de integridad anti-doble-booking (constraints 011/013 + cupos + espacio
compartido). Modelo de datos **extensible** (para el cobro futuro y el flujo pagá-o-liberá de v0.25).
Cubre ABONO-01, 02, 03, 06. NO incluye la cancelación de la serie (Phase 7) ni el flujo semanal de
seña/liberación (diferido a v0.25). **Solo reserva** — v0.24 NO cobra.

</domain>

<decisions>
## Implementation Decisions

### Modelo de datos (ABONO-01, 03)
- **D-01:** Entidad NUEVA para el abono (tabla `abonos` o `recurring_bookings` — nombre a definir en
  plan), migración numerada **054** en `supabase/migrations/`, idempotente, **NO aplicada por el flujo**
  (se coordina a mano; última aplicada en prod = 053). Campos base: `business_id`, `client_id`,
  `service_id`, `professional_id` (nullable según vertical), `location_id` (nullable), `day_of_week`,
  `start_time`, duración (según service/cancha), `status` ('active'|'cancelled'), `cancel_token`,
  `created_at`, `cancelled_at`. RLS owner-only + aislamiento por `business_id`.
- **D-02:** **Extensible sin re-migrar** para lo diferido: dejar lugar (columnas nullable / diseño) para
  el **cobro futuro** y para el **flujo pagá-la-seña-o-liberá de v0.25** (ej. lead-time del recordatorio,
  monto/seña, referencia a la suscripción de cobro). No se construye nada de eso en v0.24, pero el
  esquema no debe obligar a una migración destructiva después.
- **D-03:** El `appointment` generado lleva un FK nullable al abono (ej. `abono_id`) para vincular la
  serie (necesario para cancelar/listar la serie en Phase 7 y para marcar el turno en la agenda).

### Alta manual del abono (ABONO-01)
- **D-04:** El dueño lo crea desde el panel (cliente + servicio/cancha + profesional/consultorio según
  vertical + día de la semana + hora), **indefinido hasta cancelar**. **Reusa el pipeline de alta de
  turno** (`app/api/appointments/create` / `lib/booking-core.ts`): validación, anti-tampering de tenant,
  y el chequeo atómico anti-doble-booking / cupos / espacio compartido por cada turno generado.

### Generación forward + conflicto (ABONO-02, 06)
- **D-05:** El alta genera **de inmediato** la primera tanda de turnos (hasta el borde de la ventana); el
  **cron DIARIO existente** (`app/api/cron/cancel-expired`, Vercel Hobby = 1 cron diario, NO agregar más
  frecuentes) **extiende la ventana** cada día generando las ocurrencias nuevas que van entrando. La
  lógica de generación puede vivir en ese handler o en uno nuevo disparado por el mismo cron diario.
- **D-06 (conflicto — LOCKED):** cuando una ocurrencia semanal **choca** (slot tomado, día cerrado,
  excepción de horario, sobrecupo, o exclusión por espacio compartido) → **saltear esa ocurrencia y
  registrarla** (para avisar al dueño). **NUNCA pisar/desplazar un turno existente** — la garantía
  anti-doble-booking del motor no se toca. Las ocurrencias no generadas se registran (campo/tabla) y se
  muestran en el detalle del abono (superficie exacta = discreción del planner/UI).
- **D-07 (ventana — LOCKED):** la ventana de generación (cuántas semanas hacia adelante) es
  **configurable por el dueño**. Decisión: setting a **nivel negocio** (un valor por negocio, default a
  definir ~8 semanas), no per-abono (más simple). Idealmente ≥ la ventana de reserva pública del negocio
  (v0.22 `max_advance_days`) para que el slot del abono esté siempre bloqueado dentro del rango reservable.

### Mail (acotado en v0.24)
- **D-08:** En v0.24 se manda **un solo mail al cliente al CREAR el abono** (resumen: día/hora fijos +,
  en Phase 7, el link de cancelar suscripción). Los turnos generados semana a semana **NO** mandan mail
  cada uno. **El flujo semanal "pagá la seña o liberá el horario" (recordatorio X antes + link de seña +
  auto-liberación por deadline) queda DIFERIDO a v0.25** (ver Deferred).

### Marca en la agenda (UX)
- **D-09:** El turno que viene de un abono se **distingue con una marca/badge "fijo"/"abono"** en la
  agenda del dueño, para no confundirlo con un turno suelto (usa el FK `abono_id`).

### Seguridad / aislamiento
- **D-10:** Todo keyed por `business_id`/`owner_id`; la generación reusa el chequeo atómico anti-sobrecupo
  y la exclusión de espacio compartido del motor (no se relaja ninguna garantía). **Phase 6 lleva threat
  model y pasa por secure-phase** (tan sensible como pagos/RLS: crear turnos programáticamente que
  podrían saltear los constraints si se hace mal). El cron valida el secreto de cron existente.

### Claude's Discretion
- Nombre exacto de la tabla/campos del abono; forma del registro de ocurrencias saqueadas.
- Dónde vive la lógica de generación (extender `cancel-expired` vs handler nuevo con el mismo cron diario).
- El valor default de la ventana y el punto de configuración en la UI.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + scope
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — ABONO-01..06 + decisiones LOCKED de scope.

### Skills de dominio (LEER)
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — RLS/aislamiento para la tabla nueva + FK.
- `.claude/skills/convenciones-forjo/SKILL.md` — stack, verticales, naming, patrón de migraciones.

### Código a reusar / tocar (verificado en la sesión)
- `lib/booking-core.ts` — core compartido de alta de turno (anti-doble-booking 011/013, cupos, espacio compartido). La generación DEBE pasar por acá.
- `app/api/appointments/create/route.ts` — alta manual autenticada del dueño (patrón a reusar/extender).
- `app/api/cron/cancel-expired/route.ts` — el ÚNICO cron diario (Vercel Hobby); acá o disparado por acá va la generación forward.
- `app/api/cancel/[token]/route.ts` — patrón del cancel-token (base para el cancel de la serie en Phase 7).
- `lib/email.ts` — templates de mail (patrón `sendManualBookingConfirmation`) para el mail de alta del abono.
- `supabase/migrations/052_booking_window.sql` / `053_mp_connection_status.sql` — formato de migración de referencia (la nueva = 054).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/booking-core.ts` (createAppointmentCore) — TODO turno generado pasa por acá para no regresar la integridad.
- El cron diario `cancel-expired` — punto de enganche para la generación forward (sin sumar crons, Hobby).
- El cancel-token (`app/api/cancel/[token]`) — patrón para el cancel-de-serie de Phase 7.
- Templates de `lib/email.ts` — para el mail de alta del abono.
- La ventana de reserva pública (`businesses.max_advance_days`, v0.22) — referencia para dimensionar la ventana de generación.

### Established Patterns
- Alta autenticada = sesión del dueño, tenant por `owner_id`, chequeo atómico anti-sobrecupo/espacio (motor v0.12).
- Migraciones numeradas idempotentes aplicadas a mano; RLS owner-only por `business_id`.

### Integration Points
- Nueva tabla del abono + FK `abono_id` en `appointments`.
- Generación: alta (primera tanda) + cron diario (extensión de la ventana).
- Agenda (`agenda-client.tsx`) — marca del turno de abono.

</code_context>

<specifics>
## Specific Ideas

El abono NO debe poder violar el anti-doble-booking: ante conflicto, saltea (nunca pisa). Modelo pensado
para que v0.25 (pagá-la-seña-o-liberá semanal) se enganche sin re-migrar — sofisticar el dato ahora,
mantener el scope de v0.24 en "solo reserva".

</specifics>

<deferred>
## Deferred Ideas

- **v0.25 — Flujo semanal "pagá la seña o liberá el horario":** recordatorio al cliente **X tiempo antes**
  de cada ocurrencia (lead-time **configurable por el dueño**), con link para **pagar la seña** (reusando
  el flujo de seña de MercadoPago existente, `createDepositPreference` + webhook) o **liberar** ese
  horario esa semana, y **auto-liberación por deadline** si no responde (en el cron diario). Es lo que el
  usuario pidió; se separó de v0.24 por tamaño + porque toca el flujo de pagos MP. El modelo de datos de
  Phase 6 (D-02) se diseña para soportarlo sin re-migrar.
- **Cobro recurrente automático** (MP preapproval por cliente) — milestone posterior.
- Recurrencia no-semanal; alta pública del abono; editar/reprogramar una serie viva; waitlist.

</deferred>

---

*Phase: 6-Modelo del abono + alta manual + generación forward*
*Context gathered: 2026-07-20*
