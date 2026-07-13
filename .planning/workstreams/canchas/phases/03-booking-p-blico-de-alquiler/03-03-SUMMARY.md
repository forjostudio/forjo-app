---
phase: 03-booking-p-blico-de-alquiler
plan: 03
subsystem: frontend
tags: [canchas, booking, ui, next16, rsc, multi-tenant, verticals, landing]

# Dependency graph
requires:
  - phase: 03-01
    provides: "Vista public_canchas (migr. 044): { id, business_id, name, price, duration_minutes } al anon, sin service_id"
  - phase: 03-02
    provides: "Rama canchas en /api/booking/create: deriva el service del professional server-side; el client manda professionalId sin serviceId"
  - phase: motor-reservas (v0.12)
    provides: "/api/booking/availability con bloqueo por espacio compartido (professionalId=cancha.id) + create/payment reusados"
provides:
  - "canchas-booking-client.tsx: flujo público de reserva de canchas (3 pasos: Cancha → Fecha y hora → Tus datos), hermano visual del BookingClient"
  - "Gateo por vertical en page.tsx: lee public_canchas y elige CanchasBookingClient vs BookingClient en ambas ramas (legacy + renderer)"
  - "landing-renderer.tsx: prop bookingSlot (ReactNode) para inyectar el booking resuelto por vertical en la caja negra <section id='reservar'>"
  - "Tipo PublicCancha en lib/types.ts"
affects: [secure-phase-03, verify-phase-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Booking resuelto por vertical en el RSC (page.tsx) y pasado como ReactNode opaco al LandingRenderer: el renderer no conoce el modelo canchas (desacople D-05)"
    - "CanchasBookingClient replica el lenguaje visual del BookingClient verbatim (hero/progreso/calendario/slots/resumen/footer), cambiando solo el contenido de los pasos"

key-files:
  created:
    - app/[slug]/canchas-booking-client.tsx
  modified:
    - lib/types.ts
    - app/[slug]/page.tsx
    - components/landing/landing-renderer.tsx

key-decisions:
  - "El booking se resuelve por vertical en page.tsx (un solo punto) y se reusa tanto en la rama legacy como pasado al renderer vía bookingSlot — evita duplicar el gateo y no acopla el renderer a canchas"
  - "En canchas el calendario usa solo la grilla time_blocks + excepciones globales (location_id null); no hay location_ids por bloque ni excepciones por consultorio (el eje reservable es la cancha)"
  - "availability se consume con professionalId=cancha.id sin lógica nueva: el bloqueo por espacio compartido ya vive server-side (ESPACIO-02)"

patterns-established:
  - "bookingSlot?: ReactNode en LandingRenderer: slot opaco para variar el componente de booking por vertical sin tocar el switch/orderedSections"

requirements-completed: [ALQUILER-01, ALQUILER-03, ALQUILER-04]

# Metrics
duration: 20min
completed: 2026-07-01
status: awaiting-checkpoint
---

# Phase 03 Plan 03: UI pública del booking de canchas Summary

**Flujo público de reserva de canchas (`canchas-booking-client.tsx`, 3 pasos: Cancha → Fecha y hora → Tus datos), hermano visual del BookingClient, gateado por vertical en `/[slug]` (legacy + LandingRenderer) leyendo `public_canchas` y reusando availability/create/pago con `professionalId=cancha.id` sin `serviceId` (D-03). Precio y total = el precio propio de la cancha (ALQUILER-04). Tasks 1-2 ejecutadas y verificadas; Task 3 es un checkpoint humano visual pendiente.**

## Performance

- **Duration:** ~20 min (tasks automáticas)
- **Started:** 2026-07-01
- **Completed (auto tasks):** 2026-07-01
- **Tasks:** 2 de 3 (Task 3 = checkpoint humano bloqueante, pendiente)
- **Files created/modified:** 4 (1 creado, 3 modificados)

## Accomplishments
- **`app/[slug]/canchas-booking-client.tsx`** (nuevo, `'use client'`): flujo de 3 pasos del UI-SPEC, anclado visualmente al BookingClient (hero Bauhaus `bg-primary` con las formas SVG, barra de progreso `Paso {step} de 3`, calendario mensual verbatim, grilla de slots `grid grid-cols-3 sm:grid-cols-4`, resumen `border-l-primary`, formulario `Input/Label/Textarea`, reCAPTCHA v3 solo sin seña, footer "hecho con Forjo Studio", auto-scroll `prefers-reduced-motion`).
  - **Paso 1 (Cancha):** grilla de tarjetas con nombre + precio propio (`toLocaleString('es-AR')`) + duración fija con icono `Clock`; sin descripción (la vista no la expone); empty state con el copy del UI-SPEC.
  - **Paso 2 (Fecha y hora):** resumen `Cancha · {duration} min · ${price}`, calendario, grilla de slots con la duración FIJA de la cancha (sin picker), sugerencia de 2 turnos consecutivos (D-06).
  - **Paso 3 (Tus datos):** resumen con `Total: ${price}` (ALQUILER-04) + seña si aplica, formulario, CTA "Reservar cancha" / "Pagar seña $X".
  - Disponibilidad: `GET /api/booking/availability?slug&date&professionalId={cancha.id}` (`cache:'no-store'`, `{busy,full}` defensivo). POST create: `{ slug, professionalId: cancha.id, date, time, locationId: null, ...datos, recaptchaToken }` — **SIN serviceId ni precio**. Redirección post-reserva idéntica al BookingClient (con seña → payment/create → MercadoPago; sin seña → notify/booking → `/{slug}/turno/{token}`). Toasts de error exactos del UI-SPEC.
- **`lib/types.ts`:** tipo `PublicCancha` `{ id, business_id, name, price, duration_minutes }`.
- **`app/[slug]/page.tsx`:** query aditiva `public_canchas` en el `Promise.all` (anon, filtrada por `business.id`); `isCanchas = vertical.key === 'canchas'` (reusa el `resolveVertical` de :76); `bookingNode` resuelto por vertical y usado en AMBAS ramas (legacy directo y como `bookingSlot` del renderer).
- **`components/landing/landing-renderer.tsx`:** prop opcional `bookingSlot?: ReactNode`; el `case 'booking'` renderiza `bookingSlot ?? <BookingClient/>` dentro de la MISMA `<section id="reservar">` sin envoltorios nuevos (sin transform/overflow/position). Otros verticales byte-idénticos.

## Task Commits

1. **Task 1: canchas-booking-client.tsx (3 pasos) + tipo PublicCancha** — `2aa8c03` (feat)
2. **Task 2: gateo por vertical en page.tsx + booking como prop en landing-renderer** — `961a5f4` (feat)
3. **Task 3: Checkpoint humano visual** — pendiente (bloqueante, `autonomous:false`)

## Files Created/Modified
- `app/[slug]/canchas-booking-client.tsx` — (nuevo) client component del booking de canchas (3 pasos).
- `lib/types.ts` — tipo `PublicCancha`.
- `app/[slug]/page.tsx` — lectura de `public_canchas` + gateo por vertical (`bookingNode`) en ambas ramas; pasa `bookingSlot` al renderer.
- `components/landing/landing-renderer.tsx` — prop `bookingSlot` + `case 'booking'` que lo usa dentro de la caja negra.

## Decisions Made
- **Un solo punto de gateo (`bookingNode`) en page.tsx**, reusado en legacy y renderer: evita duplicar el `isCanchas` en dos ramas y mantiene el LandingRenderer agnóstico del modelo canchas (recibe un `ReactNode` opaco), cumpliendo D-05.
- **Calendario de canchas simplificado**: usa solo `time_blocks` (grilla semanal) + excepciones GLOBALES (`location_id` null). Canchas no usa `location_ids` por servicio, ni consultorios reservables, ni excepciones por consultorio — el único eje reservable es la cancha. La lógica de `bookableLocs`/`needLocStep`/`svcAllowed` del BookingClient no aplica.
- **availability se consume con `professionalId=cancha.id` sin cambios**: el bloqueo por espacio compartido (ESPACIO-02) y el cómputo de `busy`/`full` ya viven server-side; el client solo descarta solapados con buffer y los `full`, con `duration = cancha.duration_minutes`.

## Deviations from Plan

None - las tasks automáticas se ejecutaron exactamente como el plan las describe. La forma exacta de la simplificación del calendario (solo time_blocks + excepciones globales) es coherente con el modelo de datos de canchas (sin consultorios/location_ids) y con el UI-SPEC ("sin selector de sede", "un único eje reservable = la cancha").

## Issues Encountered
- **Import de `React.ReactNode`**: el `landing-renderer.tsx` no importa React (new JSX runtime). Se agregó `import type { ReactNode } from 'react'` y se tipó el prop como `ReactNode` (no `React.ReactNode`). tsc/lint quedaron limpios.

## Threat Mitigations (del threat_model del plan)
- **T-03-08 (Information Disclosure):** el RSC lee `public_canchas` (vista acotada sin `service_id`); el client recibe solo `{ id, name, price, duration_minutes }`. No se leen tablas base con anon.
- **T-03-09 (Tampering):** el POST a create lleva SOLO `professionalId=cancha.id`; nunca `serviceId` ni `price` (verificado en el código del client).
- **T-03-10 (DoS por envoltorio):** el `case 'booking'` del renderer NO añade transform/overflow-hidden/position:fixed|sticky/filter alrededor de `<section id="reservar">` — el `bookingSlot` va como hijo directo.
- **T-03-11 (regresión otros verticales):** gateo aditivo (`isCanchas`); salud/belleza/general renderizan `BookingClient` byte-idéntico. Tests de landing verdes (26/26). Verificación humana (checkpoint paso 7) pendiente.
- **T-03-12 (bypass reCAPTCHA/plan gate):** reusa `/api/booking/create` y `/api/payment/create` sin cambios → hereda reCAPTCHA fail-closed y el gate de plan.

## Verification
- `npx tsc --noEmit` → limpio (0 errores) tras ambas tasks.
- `npx eslint` sobre los 4 archivos tocados → 0 errores.
- `npx vitest run test/landing-derive.test.ts test/landing-schema.test.ts` → **26 passed (2 files)** (renderer sin regresión).
- **Checkpoint humano (Task 3): PENDIENTE** — verificación visual end-to-end del flujo de canchas + regresión de otros verticales (ver how-to-verify del plan).

## User Setup Required
- La migración 044 (`public_canchas`) debe estar aplicada en la DB local/prod para que la vista exista (ya aplicada en Wave 1 por el usuario, en local y prod).
- Para la verificación del checkpoint hace falta un negocio con vertical `canchas` con al menos una cancha provisionada (Phase 2).

## Next Phase Readiness
- Tras la aprobación del checkpoint humano, la fase queda lista para `secure-phase` / `verify-phase`.
- Sin blockers de código.

## Self-Check: PASSED

- `app/[slug]/canchas-booking-client.tsx` — FOUND
- `app/[slug]/page.tsx` — FOUND
- `components/landing/landing-renderer.tsx` — FOUND
- `lib/types.ts` — FOUND
- Commit `2aa8c03` — FOUND
- Commit `961a5f4` — FOUND

---
*Phase: 03-booking-p-blico-de-alquiler*
*Completed (auto tasks): 2026-07-01 — Task 3 checkpoint pendiente*
