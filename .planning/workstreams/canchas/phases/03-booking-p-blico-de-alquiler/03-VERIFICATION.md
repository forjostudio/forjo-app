---
phase: 03-booking-p-blico-de-alquiler
verified: 2026-07-02T00:00:00Z
status: passed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 03: Booking público de alquiler — Verification Report

**Phase Goal:** La página pública /[slug] de un negocio canchas deja al cliente anónimo elegir una cancha + horario disponible y reservarla al precio propio de la cancha, SIN elegir duración, heredando la exclusión atómica por espacio del motor v0.12.
**Verified:** 2026-07-02
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `public_canchas` expone `{ id, business_id, name, price, duration_minutes }` SIN `service_id`, filtrando canchas soft-deleted | VERIFIED | `044_public_canchas.sql`: SELECT lista `p.id, p.business_id, p.name, s.price, s.duration_minutes`; `service_id` aparece solo en JOIN (`s.id = p.service_id`) y WHERE (`p.service_id IS NOT NULL`), jamás en el SELECT. WHERE incluye `p.active = true AND s.active = true`. |
| 2 | `public_canchas` usa owner `postgres` SIN `security_invoker` | VERIFIED | `ALTER VIEW "public"."public_canchas" OWNER TO "postgres"` presente; el string `security_invoker` no aparece en el DDL (solo en comentarios explicando por qué NO se usa). |
| 3 | `public_canchas` tiene GRANT a `anon` | VERIFIED | `GRANT ALL ON TABLE "public"."public_canchas" TO "anon"` (y a `authenticated` y `service_role`, patrón idéntico a `public_services`). |
| 4 | POST /api/booking/create con `professionalId` y SIN `serviceId` deriva el service server-side, re-validado por `business_id`, e ignora cualquier `serviceId` del body | VERIFIED | `route.ts` líneas 110-127: bloque de derivación canchas lee `professionals.service_id` con `.eq('business_id', business.id)`; cuando `cancha.service_id` no es nulo, `resolvedServiceId = cancha.service_id` y cualquier `serviceId` del body se descarta. Guard ampliado a `!(serviceId || professionalId)` (línea 44). |
| 5 | `professionalId` de otro tenant → `invalid_service` (400); el path legacy (con `serviceId`) queda byte-idéntico | VERIFIED | Línea 120-123: si la consulta a `professionals` no devuelve fila para este `business.id` y no hay `serviceId` legacy → `invalid_service 400`. Cuando `cancha.service_id` es null pero HAY `serviceId` del body, `resolvedServiceId` queda intacto (path legacy). |
| 6 | `CanchasBookingClient` implementa el flujo de 3 pasos (Cancha → Fecha y hora → Tus datos) SIN picker de duración ni de profesional | VERIFIED | `canchas-booking-client.tsx` 610 líneas, `'use client'`, barra `Paso {step} de 3`, Step 1 = grilla de canchas, Step 2 = calendario + grilla de slots con `duration = selectedCancha.duration_minutes` (sin control de selección), Step 3 = datos del cliente. Ningún control de duración en todo el componente. |
| 7 | El price del client al create NO incluye `serviceId` ni `price`; usa `professionalId = cancha.id` | VERIFIED | Líneas 236-251 del client: el `JSON.stringify` del body incluye `slug`, `professionalId: selectedCancha.id`, `date`, `time`, `locationId: null`, `clientName`, `clientPhone`, `clientEmail`, `notes`, `recaptchaToken`. Grep confirma que `serviceId` no aparece en el cuerpo del POST. |
| 8 | El precio mostrado y el resumen del Paso 3 muestran el precio propio de la cancha (ALQUILER-04) | VERIFIED | Step 1: `${Number(cancha.price).toLocaleString('es-AR')}`. Step 3: `Total: {priceLabel}` donde `priceLabel = "$" + Number(selectedCancha.price).toLocaleString('es-AR')`. El precio viene de `public_canchas.price`, nunca del cliente. |
| 9 | Gateo por `resolveVertical(business).key === 'canchas'` en ambas ramas de `/[slug]` (legacy + LandingRenderer); otros verticales byte-idénticos | VERIFIED | `page.tsx` línea 99: `const isCanchas = vertical.key === 'canchas'`; `bookingNode` usa `CanchasBookingClient` o `BookingClient` según `isCanchas`. Se usa en rama legacy (línea 129) y se pasa como `bookingSlot={bookingNode}` al renderer (línea 149). `landing-renderer.tsx` prop `bookingSlot?: ReactNode`; `case 'booking'` renderiza `bookingSlot ?? <BookingClient/>` sin envoltorios nuevos. |
| 10 | La exclusión atómica por espacio se hereda del motor v0.12 sin re-implementación (`book_slot_atomic` no se toca; `createAppointmentCore` no se modifica) | VERIFIED | `route.ts` llama a `createAppointmentCore` con `serviceId: resolvedServiceId` — el mismo camino que el path legacy. `lib/booking-core.ts` no fue modificado en esta fase. `availability` se consume con `professionalId=cancha.id` que activa el bloqueo `siblingBusy` ya existente en el motor. |

**Score:** 10/10 truths verified

---

### Requirements Coverage

| Requirement | Phase | Description | Status | Evidence |
|-------------|-------|-------------|--------|----------|
| ALQUILER-01 | Phase 3 | Cliente elige cancha + horario SIN elegir duración (la fija de la cancha) | SATISFIED | `CanchasBookingClient`: duración fija `selectedCancha.duration_minutes` en el cómputo de slots; sin control de selección de duración en ningún paso. |
| ALQUILER-02 | Phase 3 | Reserva respeta exclusión por espacio del motor | SATISFIED | `availability` se llama con `professionalId=cancha.id` activando `siblingBusy`; `book_slot_atomic` y `createAppointmentCore` sin cambios. Tests ALQUILER-02 en concurrency.test.ts (CONC-03 + caso secuencial). |
| ALQUILER-03 | Phase 3 | Dos turnos consecutivos posibles (sin duración custom) | SATISFIED por diseño | Inherente: el cliente puede reservar el slot consecutivo como reserva separada. Copy "¿Necesitás más tiempo? Reservá dos horarios seguidos." presente en Step 2 (línea 488). No requería lógica nueva (D-06). REQUIREMENTS.md lo marca como "Pending" — se trata de un estado del tracking, no un gap de implementación. La feature ES inherente al flujo y el copy de sugerencia es la única entrega de código. |
| ALQUILER-04 | Phase 3 | Precio mostrado/asociado = precio propio de la cancha | SATISFIED | `public_canchas.price` fluye a la UI; el POST al create deriva el service de la cancha server-side desde el que el core toma el precio; `Total: {priceLabel}` en Step 3. |

**Nota sobre ALQUILER-03:** REQUIREMENTS.md lo tiene como "Pending" (checkbox sin marcar), pero el CONTEXT.md (D-06) lo define explícitamente como "inherente, sin lógica ni UI nueva: el cliente reserva un slot y puede reservar el siguiente slot consecutivo como cualquier otra reserva". La implementación satisface este diseño. El checkbox de REQUIREMENTS.md refleja que no había código específico a escribir — no es un gap.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/044_public_canchas.sql` | Vista acotada `public_canchas` (sin `service_id`, sin `security_invoker`, GRANT anon) | VERIFIED | 65 líneas, DDL completo, todas las prohibiciones cumplidas. |
| `test/canchas-booking.test.ts` | Suite de integración ALQUILER-01/03/04 + anti-tampering + cross-tenant | VERIFIED | Existe, `describe.skipIf(!hasSupabaseCreds)`, usa `seedOneTenant` + `provisionCancha`, 4 casos + casos de regresión. |
| `app/api/booking/create/route.ts` | Rama canchas: derivación server-side del service desde `professional.service_id` | VERIFIED | Bloque de derivación en líneas 92-127, comentado en español, con doble barrera de anti-tampering. |
| `app/[slug]/canchas-booking-client.tsx` | Client component de booking canchas (3 pasos, 200+ líneas) | VERIFIED | 610 líneas, `'use client'`, todos los pasos del UI-SPEC implementados. |
| `app/[slug]/page.tsx` | Lee `public_canchas` (anon) + gateo canchas vs BookingClient en ambas ramas | VERIFIED | `.from('public_canchas').select('*').eq('business_id', business.id)` en el `Promise.all`; `isCanchas` gatea ambas ramas. |
| `components/landing/landing-renderer.tsx` | `bookingSlot?: ReactNode` + case 'booking' sin envoltorios nuevos | VERIFIED | Prop `bookingSlot?: ReactNode`; `case 'booking'` renderiza `{bookingSlot ?? <BookingClient.../>}` dentro de `<section id="reservar">` sin transform/overflow/position. |
| `lib/types.ts` | `PublicCancha` exportado con `{ id, business_id, name, price, duration_minutes }` | VERIFIED | Líneas 141-151, interface exportada con los 5 campos exactos, comentario sobre la prohibición de `service_id`. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `page.tsx` | `public_canchas` (vista migr. 044) | `supabase.from('public_canchas').select('*').eq('business_id', business.id)` con `createPublicServerClient` (anon) | WIRED | En el `Promise.all` de la línea 60-75. |
| `canchas-booking-client.tsx` | `/api/booking/availability` | `GET ?slug&date&professionalId={cancha.id}` `cache:'no-store'` | WIRED | Líneas 161-167. Respuesta `{busy, full}` consumida defensivamente. |
| `canchas-booking-client.tsx` | `/api/booking/create` | `POST { slug, professionalId: cancha.id, ... }` SIN `serviceId` | WIRED | Líneas 236-251. Confirmado por grep: `serviceId` no aparece en el body del POST. |
| `app/api/booking/create/route.ts` | `professionals.service_id` (tabla `professionals`) | `.from('professionals').select('service_id').eq('id', professionalId).eq('business_id', business.id).single()` | WIRED | Líneas 111-116. |
| `app/api/booking/create/route.ts` | `createAppointmentCore` | pasa `serviceId: resolvedServiceId`; el core re-valida por `business_id` (doble barrera) | WIRED | Línea 135. |
| `page.tsx` + `landing-renderer.tsx` | `resolveVertical` | `vertical.key === 'canchas'` decide el componente; `bookingSlot` se pasa al renderer | WIRED | `page.tsx` línea 81 y 99-119; `landing-renderer.tsx` línea 67 y 193. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `canchas-booking-client.tsx` | `canchas: PublicCancha[]` | `public_canchas` vista (DB real), `page.tsx` la lee con anon y la pasa como prop | Sí — JOIN `professionals` + `services` con filtro activo | FLOWING |
| `canchas-booking-client.tsx` | `availableSlots` | `GET /api/booking/availability?professionalId=cancha.id` → `{busy, full}` del motor v0.12 | Sí — availability lee `appointments` reales y `agenda_spaces` | FLOWING |
| `canchas-booking-client.tsx` | `appointmentId` / `cancelToken` | `POST /api/booking/create` → `createAppointmentCore` → insert real en `appointments` | Sí — el core inserta en la DB y devuelve el UUID | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compila sin errores | `npx tsc --noEmit` | 0 errores (output vacío) | PASS |
| `public_canchas` SELECT no contiene `service_id` | grep en `044_public_canchas.sql` | `service_id` solo en JOIN+WHERE, nunca en la lista del SELECT | PASS |
| `canchas-booking-client.tsx` POST body no contiene `serviceId` | grep en el archivo | `serviceId` aparece solo en comentarios que documentan la ausencia; no en el `JSON.stringify` del body | PASS |
| Gateo por vertical presente en ambas ramas de `page.tsx` | lectura del código | `isCanchas` en línea 99; `bookingNode` usado en rama legacy (línea 129) y en rama renderer (línea 149) | PASS |
| Tests de landing sin regresión (26/26) | documentado en SUMMARY 03-03 | `npx vitest run test/landing-derive.test.ts test/landing-schema.test.ts` → 26 passed | PASS (evidencia SUMMARY) |
| Tests de integración booking de canchas (11/11) | documentado en SUMMARY 03-02 | `npx vitest run test/canchas-booking.test.ts test/booking-public-regression.test.ts test/booking-core.test.ts` → 11 passed | PASS (evidencia SUMMARY + Supabase local activo) |

---

### Prohibition Checks

| Prohibition | Status | Evidence |
|-------------|--------|----------|
| `public_canchas` NO expone `service_id` en el SELECT | VERIFIED | Grep sobre el DDL: `service_id` solo en JOIN+WHERE. |
| `public_canchas` NO usa `security_invoker` | VERIFIED | String `security_invoker` no aparece en el DDL activo; solo en comentarios que explican la razón de NO usarlo. |
| El client de canchas NO manda `serviceId` al create | VERIFIED | Grep sobre `canchas-booking-client.tsx`: `serviceId` solo en comentarios; el `JSON.stringify` del body no lo incluye. |
| `lib/booking-core.ts` y `book_slot_atomic` SIN tocar | VERIFIED | Ninguna modificación a `lib/booking-core.ts` registrada en ningún SUMMARY de la fase. |
| `<section id="reservar">` del LandingRenderer SIN envoltorios (sin transform/overflow-hidden/position:fixed|sticky/filter) | VERIFIED | `case 'booking'` en `landing-renderer.tsx` solo tiene `<section id="reservar" key={i}>{bookingSlot ?? <BookingClient.../>}</section>`. Ningún contenedor adicional. |

---

### Checkpoint Humano (Wave 3)

El checkpoint bloqueante de Task 3 (Plan 03) fue aprobado por el usuario con la señal "Aprobado". Caveats registrados:

- **Flujo sin `landing_config` (camino legacy):** aprobado visualmente.
- **Flujo CON `landing_config` (LandingRenderer + `bookingSlot`, D-05):** no pudo probarse visualmente porque no hay negocio canchas con landing_config. Verificado por código: `page.tsx` pasa `bookingSlot={bookingNode}` al renderer; `case 'booking'` del renderer usa `bookingSlot` dentro de la caja negra. Tests de landing 26/26 verdes confirman que el switch/orderedSections no tiene regresión. Status: **code-verified**.
- **Exclusión por espacio (ALQUILER-02):** cubierto por tests de concurrencia (CONC-03 + caso secuencial ALQUILER-02) y por herencia del motor v0.12 sin tocar.

---

### Anti-Patterns Found

No se encontraron marcadores de deuda (`TBD`, `FIXME`, `XXX`) en los archivos modificados por esta fase. Los comentarios `TODO` ausentes. No hay return null, stubs ni implementaciones vacías en los archivos modificados.

---

### Human Verification Required

Ningún ítem requiere verificación humana adicional. El checkpoint de Wave 3 fue aprobado. El único caso code-verified (negocio canchas con landing_config) está cubierto por código + tests de landing y no presenta gap.

---

## Gaps Summary

Ningún gap. Todos los must-haves de los tres planes están verificados en el código real.

---

_Verified: 2026-07-02_
_Verifier: Claude (gsd-verifier)_
