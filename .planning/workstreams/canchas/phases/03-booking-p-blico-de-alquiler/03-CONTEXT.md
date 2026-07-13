# Phase 3: Booking público de alquiler - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

La página pública `/[slug]` de un negocio de canchas permite al cliente final (anon, no
autenticado) **elegir una cancha + un horario disponible** y reservarla al **precio propio de la
cancha**, SIN elegir duración (la fija que seteó el dueño en Phase 2). Si quiere más tiempo, saca
**dos turnos consecutivos**. La reserva hereda la **exclusión atómica por espacio** del motor v0.12.

**Fuera de scope:** cambiar el modelo de seña/pago, selección de duración custom (descartada),
staff en canchas (diferido), pricing por franja (diferido). NO re-implementar disponibilidad ni
atomicidad — ya existen y se reusan.

**Clave del estado actual (validado en scouting):** `/api/booking/availability` **YA acopla la
exclusión por espacio** (lógica `siblingBusy`: una agenda hermana que comparte espacio bloquea el
slot) y corre con **service-role resuelto por slug** (spaces/agenda_spaces sin read anon). Así
**ALQUILER-02 ya está resuelto en el read-path**, y `book_slot_atomic` da la atomicidad. El trabajo
de esta fase es **exponer la cancha al anon + la UI pública + adaptar el create**, NO re-hacer el motor.
</domain>

<decisions>
## Implementation Decisions

### Exposición de la cancha al anon (decisión central de la fase)
- **D-01:** Vista pública dedicada **`public_canchas`** (migración **044** aditiva). Joinea
  `professionals` (donde `service_id IS NOT NULL`) con su `service` y expone SOLO:
  `{ business_id, id (= professional_id, lo reservable), name, price, duration_minutes }`.
  **NO expone `service_id` ni config interna.** El anon lee esta vista (patrón de vista acotada,
  consistente con `public_services`/`public_professionals`, migr. 026/027). Se descartó extender
  `public_professionals` con `service_id` (filtraría el puntero interno y movería el join al browser).

### Flujo de booking de canchas (UI, UI hint: yes)
- **D-02:** **Flujo de canchas dedicado** — un client component propio (nombre a discreción, ej.
  `canchas-booking-client.tsx`). El cliente elige una **cancha** (nombre + **precio** + **duración
  fija visible**), después un **horario disponible**; **SIN picker de duración ni de profesional**
  (la cancha ES lo reservable). Reusa `/api/booking/availability` (ya acopla espacios) y
  `/api/booking/create`. Se descartó adaptar el `BookingClient` genérico (el flujo servicio+
  profesional+duración no calza con canchas → sería adaptación condicional pesada en un componente ya grande).

### Anti-tampering del create (seguridad, público)
- **D-03:** El cliente manda el **`professional_id`** (la cancha/agenda), **NUNCA `service_id` ni
  precio**. El create resuelve el `service` vía `professional.service_id` **server-side** (service-role),
  toma **precio + duración de ahí** y re-valida por `business_id`. Patrón ya vigente en
  `/api/booking/create` ("nunca confiar en IDs del cliente"). La duración para el anti-solape sale
  del service (no del cliente), igual que hoy.

### Seña / precio
- **D-04:** **Reusar la seña business-level fija de hoy** (`require_deposit` + `deposit_amount`). La
  cancha muestra **su** precio; la **reserva registra el precio de la cancha** (ALQUILER-04). Si el
  negocio tiene `require_deposit`, se cobra el `deposit_amount` fijo por el **mismo camino**
  (reCAPTCHA + `pending_payment` + MP webhook) — cero cambio al modelo de pago. Si
  `require_deposit=false`, confirma sin seña (camino existente).

### Integración con la landing
- **D-05:** El flujo de canchas entra en **AMBOS caminos** de `/[slug]`: el **legacy** (BookingClient
  directo) y la **sección booking del `LandingRenderer`**, gateado por
  `resolveVertical(business).key === 'canchas'`. Un negocio canchas funciona igual **con o sin**
  `landing_config` — sin caminos muertos.

### Dos turnos consecutivos (ALQUILER-03)
- **D-06:** **Inherente, sin lógica ni UI nueva**: el cliente reserva un slot y puede reservar el
  siguiente slot consecutivo como cualquier otra reserva. NO hay picker de duración custom
  (descartado por diseño). Opcional: un copy que lo sugiera; no requiere código nuevo.

### Claude's Discretion
- Nombre/ubicación exactos del client component; detalles visuales (grilla de canchas, selector de
  horario) siguiendo el `BookingClient` y el design system.
- Cómo el `create` distingue el caso canchas (por vertical del negocio o por `professional.service_id` presente).
- Si `public_canchas` filtra por `active` (la vista debería, como `public_services`).
- Copy de la sugerencia de 2 turnos consecutivos.
- Forma exacta del payload que el client manda al create para canchas (dentro de D-03: sin service_id/precio).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Página pública + UI (a extender/gatear)
- `app/[slug]/page.tsx` — RSC: lee vistas acotadas (`public_businesses`/`public_services`/
  `public_professionals`), gatea legacy vs LandingRenderer, `resolveVertical` YA presente. Acá se
  agrega la lectura de `public_canchas` y el gateo del flujo canchas.
- `app/[slug]/booking-client.tsx` — BookingClient existente (patrón de UI + de llamada a
  availability/create a reusar para el flujo de canchas).
- `components/landing/landing-renderer.tsx` — inyecta el booking en la landing; gatear canchas acá (D-05).

### Routes del motor (reusar — NO re-implementar)
- `app/api/booking/availability/route.ts` — YA acopla espacios (`siblingBusy`), service-role por slug.
  NO cambiar la forma de la respuesta `{ ok, busy, full }`.
- `app/api/booking/create/route.ts` — anti-tampering + `book_slot_atomic`. Adaptar para derivar el
  service de `professional.service_id` en el caso canchas (D-03).

### Datos / modelo
- `lib/canchas.ts` — `canchasFromData` (reconstrucción de la tupla por `service_id`) como referencia.
- `lib/supabase/public.ts` — `createPublicServerClient` (anon, para la lectura de `public_canchas`).
- `supabase/migrations/` — `public_services`/`public_professionals` (migr. 026/027) como patrón de
  vista acotada; la nueva vista es **044**. `professionals.service_id` (migr. 043, Phase 2).
- `lib/verticals.ts` — `resolveVertical`, terminología canchas (Reserva/Cancha).

### Roadmap / requirements / skills
- `.planning/workstreams/canchas/ROADMAP.md` §"Phase 3" — goal, 4 criterios, security Alto, decisión de fase.
- `.planning/workstreams/canchas/REQUIREMENTS.md` — ALQUILER-01/02/03/04.
- Skill `supabase-multitenant-rls` — vista acotada + anti-tampering (público + concurrencia).
- Skill `mercadopago-suscripciones` — el camino de seña/pago que se reusa.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`/api/booking/availability`** ya devuelve `{ok,busy,full}` con el bloqueo por espacio compartido
  incorporado (`siblingBusy`) → **ALQUILER-02 sin trabajo nuevo** en el read-path.
- **`book_slot_atomic`** (motor v0.12) da la atomicidad anti-conflicto → no re-implementar.
- **Camino de seña/pago** (reCAPTCHA, `pending_payment`, MP webhook, back_url) se reusa tal cual (D-04).
- **`public_services`** ya expone `price`+`duration_minutes`; **`public_professionals`** expone
  `id`+`name` — la nueva `public_canchas` los combina para el caso canchas.

### Established Patterns
- **Vistas acotadas `public_*`** para anon (migr. 026/027): exponer solo columnas no sensibles.
- **Service-role resuelto por slug** en los routes públicos (availability/create).
- **Anti-tampering**: re-validar toda entidad por `business_id`; nunca confiar en IDs/precio del cliente.
- **`force-dynamic`** en la página pública (datos siempre frescos).

### Integration Points
- Nueva vista `public_canchas` (migr. 044, aditiva).
- Nuevo client component de booking de canchas + gateo por vertical en `page.tsx` y `landing-renderer.tsx`.
- Adaptación de `/api/booking/create` para derivar el service de `professional.service_id` (canchas).

### Security / Isolation (relevancia: ALTO — público + concurrencia)
El secure-phase gate verificará: (a) heredar la atomicidad de `book_slot_atomic` sin debilitarla
(nunca un count/check suelto sin el lock); (b) anti-tampering de cancha/service/espacios por
`business_id` (el cliente nunca manda `service_id`/precio — D-03); (c) exponer a `anon` solo vía
`public_canchas` (sin config interna ni datos de otro tenant); (d) respetar `plan_status` + reCAPTCHA
del booking existente; (e) no sobre-reserva concurrente entre canchas que comparten espacio.
</code_context>

<specifics>
## Specific Ideas

- El cliente **NO** elige duración (la fija de la cancha, Phase 2); más tiempo = **2 turnos consecutivos**.
- El precio mostrado y **asociado a la reserva** = precio propio de la cancha (no genérico) — ALQUILER-04.
- La disponibilidad ya refleja el bloqueo por espacio compartido (ej. reservar F11 bloquea sus cruzadas A/B/C).
</specifics>

<deferred>
## Deferred Ideas

- **Seña = precio completo de la cancha / seña por cancha** — considerado en discuss; NO elegido (se
  reusa la seña fija business-level). Cambiaría el modelo de pago → fase/decisión futura.
- **Pricing por franja horaria (peak/off-peak)** — PRICING-FRANJA-01, v2.
- **Selección de duración custom por el cliente** — descartada por diseño (más tiempo = 2 turnos).

### Reviewed Todos (not folded)
None.

</deferred>

---

*Phase: 3-Booking público de alquiler*
*Context gathered: 2026-07-01*
