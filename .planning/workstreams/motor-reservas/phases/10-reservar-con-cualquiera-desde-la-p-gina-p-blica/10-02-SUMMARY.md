---
phase: 10-reservar-con-cualquiera-desde-la-p-gina-p-blica
plan: 02
subsystem: booking-public-frontend
tags: [next, react, booking, availability, multi-tenant, multi-staff]

# Dependency graph
requires:
  - phase: 10-reservar-con-cualquiera-desde-la-p-gina-p-blica
    plan: 01
    provides: "Vista public_professional_services (059) + rama any=1&serviceId en availability + boolean anyProfessional en create"
  - phase: 08-equipo-qu-servicios-hace-cada-profesional
    provides: "lib/staff-services (regla del comodín: 0 filas = capaz de todo)"
provides:
  - "Read-path de public_professional_services en page.tsx pasado como prop a BookingClient (no a CanchasBookingClient)"
  - "Tarjeta 'Cualquiera' ('El primero disponible') en el step 2, gateada a >=2 capaces (D-02/D-03)"
  - "Señal any=1&serviceId a availability + boolean anyProfessional (professionalId:null) a create desde el front (D-05)"
affects: [booking-client, page.tsx, landing-renderer, verify-phase (Plan 05)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Re-significado de estado existente (selectedPro='none' pasa a leerse como 'Cualquiera' solo cuando showAny) en vez de un selector nuevo"
    - "Gating de opción de UI por regla de dominio pura (professionalsForService) computada en el client sobre una vista acotada anon"

key-files:
  created: []
  modified:
    - app/[slug]/page.tsx
    - app/[slug]/booking-client.tsx
    - components/landing/landing-renderer.tsx

key-decisions:
  - "Fallback 'Sin preferencia' cuando capaces.length === 0 (sentinel / servicio sin cobertura) para no dejar el paso 2 sin salida — hoy la tarjeta se mostraba siempre; gatearla solo a showAny la eliminaba para negocios sin profesionales nombrados (regresión evitada, D-08)"
  - "professionalServices threadeado por LandingRenderer como prop OPCIONAL (default []): el fallback <BookingClient> de landing-renderer es camino muerto (page.tsx siempre pasa bookingSlot ya resuelto por vertical), así que no obliga a page.tsx a threadearlo por esa rama"
  - "isAny = selectedPro==='none' && showAny: con <=1 capaz 'none' sigue siendo el sentinel de hoy (availability/create idénticos), no 'Cualquiera'"

patterns-established:
  - "Tarjeta 'Cualquiera' espeja la UI de la tarjeta auto-assign existente (mismo markup, solo cambia copy) — cero diseño nuevo (D-03)"

requirements-completed: [ASIGN-01, DISP-01, DISP-02, DISP-03]

# Metrics
duration: ~15 min
completed: 2026-07-25
status: complete
---

# Phase 10 Plan 02: "Cualquiera" en la reserva pública (frontend) Summary

**El step 2 del wizard público ahora ofrece una tarjeta "Cualquiera" ("El primero disponible") arriba de la lista de profesionales — gateada a 2+ capaces del servicio (regla del comodín) — que pide la grilla agregada con `any=1&serviceId` y submitea el boolean `anyProfessional` (nunca un id), consumiendo la superficie de servidor del Plan 01. El gemelo canchas queda intacto.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-25T21:45:28Z
- **Completed:** 2026-07-25T22:00:00Z (aprox)
- **Tasks:** 2
- **Files modified:** 3 (0 creados, 3 modificados)

## Accomplishments
- **page.tsx (Task 1):** el `Promise.all` de vistas acotadas lee ahora `public_professional_services` (migr. 059) filtrado por `business_id`, y se pasa como prop `professionalServices` SOLO a `<BookingClient>` (dentro de `bookingNode`), nunca a `<CanchasBookingClient>` (D-09). Fail-safe `|| []` para el caso vista-ausente.
- **booking-client.tsx (Task 2):** tarjeta **"Cualquiera"** ("El primero disponible") arriba de la lista, gateada a `capaces.length >= 2` (D-02/D-03); la lista del paso 2 se filtra a `capaces` (regla del comodín vía `professionalsForService`); default preseleccionado por `selectedPro='none'` re-significado (D-01). Señal correcta: `any=1&serviceId` en availability y `anyProfessional: true` + `professionalId: null` en create cuando `isAny`; camino específico y sentinel idénticos a hoy (D-05/D-08). El resumen del paso 3 muestra "Cualquiera" cuando `isAny`.
- **landing-renderer.tsx:** prop opcional `professionalServices` threadeada al `<BookingClient>` de fallback (fix del caller roto por la prop nueva requerida).

## Task Commits

Cada task se commiteó atómicamente en `main` (commits normales, hooks corridos):

1. **Task 1: Read-path de public_professional_services en page.tsx** — `9223d01` (feat)
2. **Task 2: Tarjeta "Cualquiera" + gating + señal any/anyProfessional (+ fix landing-renderer)** — `87e6c76` (feat)

## Files Created/Modified
- `app/[slug]/page.tsx` (modificado) — select acotado `public_professional_services` en el `Promise.all`; prop `professionalServices` a `BookingClient` únicamente.
- `app/[slug]/booking-client.tsx` (modificado) — import de `professionalsForService` + tipo `ProfessionalService`; Props/destructuring; derivados `capaces`/`showAny`/`isAny`; tarjeta "Cualquiera" + fallback sentinel; lista filtrada a `capaces`; señal `any=1`/`anyProfessional`; copy del resumen.
- `components/landing/landing-renderer.tsx` (modificado) — prop opcional `professionalServices` (default `[]`) pasada al `BookingClient` de fallback.

## Decisions Made
- **Fallback "Sin preferencia" cuando 0 capaces:** hoy la tarjeta auto-assign se renderiza SIEMPRE y es la única salida del paso 2 cuando la lista de profesionales queda vacía (negocio sin profesionales nombrados = sentinel, o un servicio que ningún profesional cubre). Gatearla solo a `showAny (>=2)` la habría eliminado para esos negocios → paso 2 sin botón para avanzar. Se mantiene el fallback con la copy de hoy ("Sin preferencia" / "Se asignará automáticamente") cuando `capaces.length === 0`, preservando el comportamiento actual (D-08). Con exactamente 1 capaz, se elige a esa persona en la lista (sin tarjeta auto), consistente con D-02.
- **`professionalServices` opcional en LandingRenderer:** el `<BookingClient>` de fallback de landing-renderer es camino muerto (page.tsx siempre pasa `bookingSlot` ya resuelto por vertical); la prop opcional con default `[]` satisface el tipo sin obligar a re-threadear por la llamada a LandingRenderer en page.tsx.
- **`isAny` acotado por `showAny`:** con `<=1` capaz, `selectedPro='none'` sigue siendo el sentinel de hoy (availability sin `any`, create `anyProfessional:false`), no "Cualquiera".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prop nueva requerida rompía un segundo caller de BookingClient**
- **Found during:** Task 2 (verificación `tsc`)
- **Issue:** `components/landing/landing-renderer.tsx:293` renderiza un `<BookingClient>` de fallback; la prop requerida `professionalServices` en `BookingClient` hacía fallar `tsc` (TS2741) en ese caller. El plan solo listaba page.tsx + booking-client.tsx.
- **Fix:** se agregó `professionalServices?: ProfessionalService[]` (opcional, default `[]`) a `LandingRenderer` y se pasó al `BookingClient` de fallback. No se tocó la llamada a `LandingRenderer` en page.tsx (el fallback es camino muerto: page.tsx siempre pasa `bookingSlot`).
- **Files modified:** `components/landing/landing-renderer.tsx`
- **Commit:** `87e6c76`

**2. [Rule 1 - Regresión evitada] Fallback de salida del paso 2 para 0 capaces**
- **Found during:** Task 2 (análisis de gating)
- **Issue:** el plan pide mostrar la tarjeta "SOLO si showAny"; hacerlo al pie de la letra eliminaba la única salida del paso 2 para negocios con 0 profesionales capaces (sentinel / servicio sin cobertura), contradiciendo "se comporta como hoy" (D-02/D-08).
- **Fix:** rama `capaces.length === 0` que mantiene la tarjeta "Sin preferencia" de hoy (misma UI/copy/onClick). No cambia el camino de >=2 capaces (feature) ni el de 1 capaz.
- **Files modified:** `app/[slug]/booking-client.tsx`
- **Commit:** `87e6c76`

## Issues Encountered
- El `tsc` local (`node_modules/.bin/tsc --noEmit`, NO `npx tsc`) sí reporta errores (`npx tsc` sale 0 espurio en este repo — memoria del proyecto). Se usó el binario local como gate real: exit 0 tras el fix de landing-renderer.

## Threat / Design notes
- **Hooks de diseño (impeccable):** dos hallazgos `side-tab` (los summary cards con `border-l-4 border-l-primary` de los pasos 3 y 4) son estilos PRE-EXISTENTES no introducidos por este plan y fuera de scope (D-08: no tocar diseño). Se dejan sin cambios; no se suprimieron.
- **T-10-07/08/09 (threat model del plan):** el front manda `anyProfessional` boolean con `professionalId:null` gateado en `capaces>=2` (nunca un id); consume solo `{busy:[], full}`; `professionalServices` no llega a `CanchasBookingClient` y `canchas-booking-client.tsx` no se tocó.

## Next Phase Readiness
- La superficie visible de "Cualquiera" está completa: la vista se lee en page.tsx, la tarjeta se muestra gateada, la señal viaja correcta a los dos endpoints.
- Pendiente en la fase: el nombre del profesional en confirmación/mail (ASIGN-05, otro plan) y la verificación humana end-to-end (Plan 05), tras el `supabase db reset` del Plan 04 (BLOCKING) que deja la vista 059 viva en local.

## Self-Check: PASSED

- Archivos verificados en disco: `app/[slug]/page.tsx`, `app/[slug]/booking-client.tsx`, `components/landing/landing-renderer.tsx` (FOUND).
- Commits verificados en git: `9223d01`, `87e6c76` (FOUND).
- `tsc --noEmit` local exit 0; `canchas-booking-client.tsx` sin cambios en el diff.

---
*Phase: 10-reservar-con-cualquiera-desde-la-p-gina-p-blica*
*Completed: 2026-07-25*
