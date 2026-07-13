# Phase 1: Turnos Manuales - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

El dueño/admin carga un turno desde el dashboard (reserva telefónica / walk-in) reusando el mismo pipeline server-side de booking (validación, anti-tampering de tenant, anti-doble-booking), pero desde su **sesión autenticada** (anon key + RLS + `.eq('business_id', business.id)`), **NO** por el flujo anónimo con service role. NO toca los constraints de integridad 011/013 — es un turno más por el mismo camino de validación.

**En alcance (Phase 1):** MANUAL-01 (reusar pipeline desde sesión autenticada), MANUAL-02 (elegir/crear cliente), MANUAL-03 (respeta disponibilidad real, no sobre-reserva).
**Fuera de alcance:** MANUAL-04 (seña opcional en turno manual) — **diferido a v2** (ver `<deferred>`). En Phase 1 el turno manual siempre queda `confirmed`, sin `pending_payment` ni cobro.
</domain>

<decisions>
## Implementation Decisions

### Seña en el turno manual
- **D-01:** Sin seña en el alta manual. El turno manual **siempre se confirma directo** (`status = 'confirmed'`, sin `expires_at`, sin `pending_payment`). No genera link de pago ni mail de seña. Esto **saca MANUAL-04 del alcance de Phase 1** (diferido a v2).
- **D-02:** reCAPTCHA NO aplica en el alta manual: el actor es el dueño autenticado, no un anónimo. El gate de tenant es la sesión + RLS + re-validación por `business_id`, no el captcha.

### Selección/creación de cliente (MANUAL-02)
- **D-03:** Un combobox/buscador de los clientes existentes del negocio (`clients` filtrados por `business_id`) + opción "crear nuevo" inline (nombre + contacto) dentro del mismo flujo.
- **D-04:** Dedupe al crear: si el teléfono o email del cliente nuevo coincide con uno existente del negocio, sugerir/reusar el cliente existente en vez de insertar uno duplicado. Objetivo: mantener `clients` limpio para Finanzas/CRM. (Contrasta con el booking público, que SIEMPRE inserta un cliente nuevo — ese comportamiento del flujo público NO se cambia.)
- **D-05:** El cliente elegido/creado queda asociado al turno vía `client_id` (igual que el insert público), además de copiar `client_name`/`client_phone`/`client_email` a la fila del turno (patrón actual).

### Flexibilidad del horario (MANUAL-03)
- **D-06:** El dueño puede agendar a **cualquier hora libre**, incluso fuera de la grilla de horario publicada (caso real walk-in / "te anoto igual aunque no atienda ese día/hora"). NO se restringe el alta manual a los slots que devuelve `/api/booking/availability`.
- **D-07:** El anti-doble-booking se mantiene intacto: una hora que **choca** con otro turno (cupo 1) se rechaza con el **mismo** `slot_taken` (409) que el booking público — el alta manual reusa el re-check de solapamiento + el respaldo atómico de los constraints 011/013. La flexibilidad es solo respecto al horario de atención, NUNCA respecto a la colisión con otro turno.

### Disparo de la UI (UI hint: yes)
- **D-08:** Botón "Nuevo turno" en **Agenda** y en **Turnos** (`appointments`). Además, click en un **slot vacío** de la grilla de la agenda abre el alta con fecha/hora (y profesional, si la columna corresponde a uno) **pre-llenados**.
- **D-09:** Patrón responsive existente: **modal en desktop, drawer (`vaul`) en mobile**. Reusar el lenguaje visual de la agenda actual (`agenda-client.tsx`) y los componentes shadcn/`@/components/ui` ya presentes — no introducir librería nueva.

### Claude's Discretion
- **Arquitectura del reúso del pipeline:** extraer la lógica compartida (re-validación de tenant de service/professional/location, re-check de disponibilidad por solapamiento + buffer, liberación de holds vencidos, traducción de `23505`/`23P01` → `slot_taken`) a un helper en `lib/` reusado tanto por el endpoint público (`app/api/booking/create/route.ts`) como por el alta manual autenticada. La forma exacta (route handler nuevo `app/api/appointments/create` vs. server action) la define research/planner siguiendo el patrón del repo. **Locked por roadmap:** corre con la sesión autenticada del dueño (anon key + RLS), no service role.
- **RLS de `appointments` INSERT:** research/security debe verificar que las policies permiten al dueño autenticado insertar turnos en SU negocio (anon key + RLS) sin abrir escritura cross-tenant; si falta policy, la migración la agrega con `with check (business_id = ...)`.
- **Notificación al cliente:** al no haber seña, el turno queda `confirmed` directo; NO se manda mail de confirmación al cliente desde el alta manual (consistente con el path público sin seña, que tampoco lo manda). El evento de Google Calendar se crea best-effort en `after()` si el negocio tiene sync conectado, igual que el path público confirmado.
- **Validación de entrada:** mismo estilo defensivo del repo (parseo defensivo del body / Zod, errores `{ ok, error }` en snake_case, status coherentes).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline de booking a reusar (núcleo de la fase)
- `app/api/booking/create/route.ts` — Pipeline server-side a reusar: anti-tampering de tenant (re-valida service/professional/location por `business_id`), re-check de disponibilidad por solapamiento + buffer, liberación de holds vencidos, insert con respaldo atómico de constraints (`23505`/`23P01` → `slot_taken`). El alta manual replica esta validación desde sesión autenticada.
- `app/api/booking/availability/route.ts` — Cómo se computa la disponibilidad (solapamiento, sentinela `00000000-...` para "sin profesional", estados `confirmed`/`pending_payment`). Referencia para el re-check; el alta manual NO se restringe a sus slots (D-06) pero sí comparte la lógica de colisión.

### UI / superficie del dashboard
- `app/(dashboard)/agenda/page.tsx` + `app/(dashboard)/agenda/agenda-client.tsx` — Vista de agenda donde vive el botón "Nuevo turno" + click en slot vacío (D-08/D-09). Carga `time_blocks`, `locations`, `schedule_exceptions`, `appointments` por `business_id`.
- `app/(dashboard)/appointments/page.tsx` + `appointments-client.tsx` — Segunda superficie con botón "Nuevo turno".
- `app/(dashboard)/clients/page.tsx` — Patrón de carga de clientes por `business_id` para el combobox (D-03).

### Aislamiento por tenant (no negociable)
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — Reglas de RLS / policies / `business_id` para el alta autenticada y cualquier migración de policy.
- `lib/supabase/server.ts` — `createClient()` (anon key + cookies, RLS activo) para el alta autenticada.
- `supabase/migrations/` — Constraints anti doble-booking (011 índice único mismo-inicio, 013 exclusion constraint solapamiento). NO se modifican en Phase 1.

### Encuadre del milestone
- `c:\Users\franc\Desktop\Forjo Studio\forjo-motor-reservas-encuadre.md` — Brief del milestone (faseo manual→cupos→espacio, §9 turnos manuales).
- `.planning/workstreams/motor-reservas/ROADMAP.md` — Phase 1 goal + success criteria + security/integrity relevance.
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — MANUAL-01..04.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Pipeline de validación de `booking/create`:** toda la cadena (anti-tampering tenant + re-check solapamiento + buffer + liberación de holds + traducción de constraint a `slot_taken`) es directamente reutilizable; el plan debe extraerla a un helper compartido en `lib/` en vez de duplicarla.
- **`createClient()` (`lib/supabase/server.ts`):** cliente autenticado anon-key + RLS para el alta del dueño.
- **Componentes shadcn / `@/components/ui` + `vaul`:** modal desktop / drawer mobile ya disponibles (no agregar dependencias).
- **Patrón `page.tsx` server + `*-client.tsx`:** el alta manual sigue el patrón de carga server (business por `owner_id`, datos por `business_id`) + interactividad en client.

### Established Patterns
- Toda query del dashboard filtra por `.eq('business_id', business.id)` — el alta manual también.
- Errores `Response.json({ ok, error }, { status })` con códigos snake_case; reusar `slot_taken` (409), `invalid_service`/`invalid_professional` (400), `not_found`, `insert_failed` (500).
- Efectos best-effort (gcal) en `after()` con try/catch.
- Sentinela `00000000-0000-0000-0000-000000000000` para "sin profesional" en el bucket de solapamiento.

### Integration Points
- Nuevo helper de creación de turno en `lib/` consumido por: (a) `app/api/booking/create/route.ts` (público, service-role) y (b) el alta manual autenticada (route handler nuevo o server action — discretion).
- UI: botón + handler de click-en-slot en `agenda-client.tsx`; botón en `appointments-client.tsx`.
- Posible migración de policy RLS para `appointments` INSERT por el dueño (a verificar por research/security).

</code_context>

<specifics>
## Specific Ideas

- El caso de uso que ancla la flexibilidad de horario (D-06) es la reserva telefónica / walk-in: "te anoto igual aunque no atienda esa hora". El alta manual es la herramienta del dueño, no del público — por eso prioriza flexibilidad sobre la restricción de grilla, pero nunca sobre el anti-doble-booking.

</specifics>

<deferred>
## Deferred Ideas

- **MANUAL-04 — Seña opcional en turno manual → diferido a v2.** El dueño decidió que el alta manual no maneja seña en Phase 1 (turno siempre `confirmed`). Reconsiderar en un milestone futuro si aparece el caso de cobrar seña en reservas telefónicas. Actualizar Traceability de REQUIREMENTS.md para reflejar que MANUAL-04 sale de Phase 1.

</deferred>

---

*Phase: 1-Turnos Manuales*
*Context gathered: 2026-06-25*
