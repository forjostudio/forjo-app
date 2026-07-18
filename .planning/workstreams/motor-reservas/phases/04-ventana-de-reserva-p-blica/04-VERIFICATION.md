---
phase: 04-ventana-de-reserva-p-blica
verified: 2026-07-18T21:06:22Z
status: human_needed
score: 5/5 must-haves verified (all 3 requirements + code-level truths)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Ajustes → Cobros: alternar los 3 modos del control de ventana (días / sin límite / fecha exacta), guardar cada uno, refrescar la página y confirmar que el valor persistido se refleja (incluyendo que 'sin límite' deja ambas columnas en null)."
    expected: "El modo elegido persiste tras refrescar; cambiar de modo nulea correctamente la columna del modo anterior; no quedan ambas columnas seteadas a la vez."
    why_human: "Es un flujo de UI interactivo (radios + inputs condicionales + guardado async) — el código está verificado estáticamente (saveWindow, payload por modo) pero la experiencia real de alternar/guardar/refrescar en el navegador no es observable por grep."
  - test: "Con un negocio a 30 días (default), abrir /[slug] público: confirmar que no se puede avanzar el calendario más allá del mes de corte, que los días posteriores al corte aparecen visualmente deshabilitados, y que se ve el texto 'Reservas hasta el DD/MM'. Repetir en un negocio del vertical canchas (/[slug] canchas) y en un negocio con 'sin límite' (debe navegar como siempre, sin texto)."
    expected: "Botón 'mes siguiente' deshabilitado al llegar al mes de corte; días fuera de ventana no clickeables; texto de corte visible; comportamiento idéntico entre los dos calendarios gemelos; sin límite = cero cambio visual."
    why_human: "Verificación visual/interactiva de un calendario custom (no es un componente headless testeado) — el código (condiciones `disabled`, gateo por `cutoff != null`) fue verificado por lectura directa y no hay regresión de tipos, pero el resultado visual real (estilos de disabled, click real bloqueado) requiere ojos humanos en el navegador. Ambos SUMMARY (04-02, 04-03) declaran esto explícitamente como 'checkpoint humano de la fase' pendiente."
---

# Phase 4: Ventana de reserva pública — Verification Report

**Phase Goal:** El dueño puede acotar hasta con cuánta anticipación un cliente reserva desde la página pública, y ese tope se respeta tanto en la UI de los dos calendarios como en el servidor (no se puede saltear manipulando la request). Aplica solo al público; el alta manual autenticada del dueño no se limita.

**Verified:** 2026-07-18T21:06:22Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Nota sobre tracking desactualizado (no es un gap de código)

`ROADMAP.md` marca la fase como "3/4 plans executed" con `04-04-PLAN.md` sin tildar, y
`REQUIREMENTS.md` marca `BOOK-WINDOW-01` y `BOOK-WINDOW-03` sin tildar. Esto es **lag de
documentación**, no un gap real: los 4 `SUMMARY.md` están completos, los 4 planes tienen commits
reales en `git log` (`de7d3df`…`fca3322`), y el código de las 3 capas (config, calendarios,
backstop) existe, compila y pasa la suite. Se recomienda actualizar los checkboxes de ROADMAP.md
y REQUIREMENTS.md, pero no bloquea esta verificación.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | BOOK-WINDOW-01: el dueño configura la ventana en Ajustes (3 modos), persiste en `businesses`, y la columna llega a la vista `public_businesses` (no solo la tabla) | ✓ VERIFIED | Migración 052 confirmada en código Y en la DB local corriendo (`docker exec … \d businesses` y `\d public_businesses` muestran `max_advance_days`/`max_advance_date` en ambos). `settings-client.tsx` L722-782 tiene `windowForm`/`saveWindow` con los 3 modos mutuamente excluyentes, escribe una sola columna y nulea la otra. `saveWindow` usa `supabase.from('businesses').update(payload).eq('id', business.id)` con el cliente browser (RLS owner-only) |
| 2 | BOOK-WINDOW-02: los DOS calendarios públicos (general + canchas) capan mes y días, muestran "Reservas hasta el DD/MM", reusando el helper compartido sin lógica de fecha duplicada | ✓ VERIFIED | `booking-client.tsx` L156-157, 569, 586, 611-612 y `canchas-booking-client.tsx` L133-134, 427, 444, 469-470 — ambos importan y llaman `effectiveBookingCutoff(business)` de `lib/booking-window.ts` (cero duplicación de lógica de fecha), gatean el cap por `cutoff != null` (cero regresión sin límite), mismo texto/copy en los dos |
| 3 | BOOK-WINDOW-03: el backstop en `booking/create` rechaza fechas fuera de ventana server-side (anti-tampering, hora AR) ANTES del insert de `client`; el alta manual (`appointments/create`) queda exenta | ✓ VERIFIED | `route.ts` L79-81: guard `isDateOutOfWindow(business, date)` → 400 `date_out_of_window`, ubicado tras el gate de `plan_status` (L67) y ANTES del insert de `client` (L99) — confirmado por lectura secuencial completa del handler (no hay ningún insert previo al guard). `git log -- app/api/appointments/create/route.ts` muestra el último commit como `6663133` (Phase 1, v0.12) — **cero commits durante Phase 4** → exención por construcción. `lib/booking-core.ts`/`appointments/create` no referencian `booking-window` (grep vacío) |
| 4 | No-regresión: con `cutoff null` (sin límite) el comportamiento es idéntico al actual; la suite pasa | ✓ VERIFIED | Todas las condiciones de cap están gateadas por `cutoff != null` / `cutoffMonth != null` — sin límite, ninguna condición nueva se activa. `npx vitest run` → **43 files, 598 passed, 1 skipped** (coincide exactamente con el número declarado en 04-04-SUMMARY.md). `npx tsc --noEmit` → 0 errores |
| 5 | Hora AR: el helper (no `new Date()` crudo) lo usan los 2 clients Y el backstop | ✓ VERIFIED | `lib/booking-window.ts` `todayInAR()` usa offset literal -3h (mismo patrón que `lib/crm-metrics.ts`), consumido exclusivamente vía `effectiveBookingCutoff`/`isDateOutOfWindow` en los 2 calendarios (`effectiveBookingCutoff`) y en el backstop (`isDateOutOfWindow`, vía `route.ts` L79). Tests de borde de medianoche AR/UTC pasan (`lib/booking-window.test.ts`, 9/9) |

**Score:** 5/5 truths verified (todas las capas de código presentes, cableadas y probadas)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/052_booking_window.sql` | Columnas + vista + grant | ✓ VERIFIED | Aditivo, `DEFAULT 30`, sin drop de RLS/policies; validado contra DB local corriendo |
| `supabase/schema.sql` | Refleja columnas en tabla y vista | ✓ VERIFIED | `grep max_advance` → L360-361 (tabla), L697-698 (vista) |
| `lib/booking-window.ts` | `todayInAR`, `effectiveBookingCutoff`, `isDateOutOfWindow` | ✓ VERIFIED | Los 3 exports presentes, puros (sin React/Supabase), documentados |
| `lib/booking-window.test.ts` | Tests de 3 modos + borde AR/UTC + corte inclusive | ✓ VERIFIED | 9 tests, cubren todos los casos declarados |
| `lib/types.ts` | `max_advance_days`/`max_advance_date` en `Business` | ✓ VERIFIED | L44-45; `PublicBusiness = Omit<Business, 'notification_email'>` los hereda (L107) |
| `app/[slug]/page.tsx` | Select ampliado + prop a ambos clients | ✓ VERIFIED | L47 select incluye ambas columnas; L104/L112 pasan `business` completo a `CanchasBookingClient`/`BookingClient` |
| `app/(dashboard)/settings/settings-client.tsx` | Control 3 modos | ✓ VERIFIED | `windowForm`/`saveWindow`/Card "Ventana de reserva" (L1600-1645) |
| `app/[slug]/booking-client.tsx` | Cap + texto | ✓ VERIFIED | `effectiveBookingCutoff`, cap de botón, día disabled, texto condicional |
| `app/[slug]/canchas-booking-client.tsx` | Mismo cap + texto (gemelo) | ✓ VERIFIED | Idéntico patrón, verbatim |
| `app/api/booking/create/route.ts` | Backstop antes del insert de client | ✓ VERIFIED | L79-81 guard, L99 insert (orden confirmado por lectura completa) |
| `app/api/appointments/create/route.ts` | NO tocado (exento) | ✓ VERIFIED | `git log` último commit = Phase 1 (`6663133`); sin referencias a `booking-window` |
| `test/booking-window-exemption.test.ts` | Exención del alta manual + contrato del predicado | ✓ VERIFIED | 4 tests pasan (core acepta fecha lejana vía DB + contrato unitario del predicado) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/[slug]/page.tsx` | `public_businesses` (vista) | `.select(...max_advance_days, max_advance_date)` | WIRED | Confirmado en código y en DB local |
| `booking-client.tsx` / `canchas-booking-client.tsx` | `lib/booking-window.ts` | `effectiveBookingCutoff(business)` | WIRED | Idéntico en ambos, sin lógica duplicada |
| `settings-client.tsx` | `businesses` (tabla) | `.update(payload).eq('id', business.id)` | WIRED | Payload correcto por modo, nulea la columna inactiva |
| `app/api/booking/create/route.ts` | `lib/booking-window.ts` | `isDateOutOfWindow(business, date)` antes del insert de `client` | WIRED | Orden verificado por lectura secuencial completa del handler |
| `lib/booking-core.ts` / `app/api/appointments/create` | `lib/booking-window.ts` | (ausencia intencional) | NOT_WIRED (por diseño) | Cero referencias — exención por construcción, consistente con D-08/T-04-11 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suite completa | `npx vitest run` | 43 files, 598 passed, 1 skipped | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | 0 errores | ✓ PASS |
| Tests específicos de la ventana | `npx vitest run lib/booking-window.test.ts test/booking-window-exemption.test.ts test/canchas-booking.test.ts` | 3 files, 17 passed | ✓ PASS |
| Columnas en DB local (tabla) | `docker exec … psql -c "\d businesses"` | `max_advance_days integer DEFAULT 30`, `max_advance_date date` | ✓ PASS |
| Columnas en DB local (vista) | `docker exec … psql -c "\d public_businesses"` | ambas columnas presentes | ✓ PASS |
| `appointments/create` no tocado en Phase 4 | `git log -- app/api/appointments/create/route.ts` | último commit = `6663133` (Phase 1, 26-jun) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| BOOK-WINDOW-01 | 04-01, 04-02 | Config global por negocio, 3 modos, persiste | ✓ SATISFIED | Migración + control en Ajustes verificados end-to-end |
| BOOK-WINDOW-02 | 04-01, 04-03 | Cap en los dos calendarios públicos | ✓ SATISFIED | Ambos clients capados, mismo helper, cero duplicación |
| BOOK-WINDOW-03 | 04-01, 04-04 | Backstop server + exención del alta manual | ✓ SATISFIED | Guard antes del insert, alta manual sin tocar |

No hay requirements huérfanos: los 3 REQ-ID de Phase 4 en REQUIREMENTS.md aparecen declarados en el campo `requirements` de al menos un plan.

### Anti-Patterns Found

Ninguno. Se escanearon los 11 archivos tocados/creados por la fase (`lib/booking-window.ts`, `lib/booking-window.test.ts`, migración 052, `page.tsx`, `settings-client.tsx`, los 2 booking clients, `route.ts`, los 2 tests nuevos, `types.ts`) buscando `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` y empty-implementation patterns. Los únicos matches de "placeholder" son atributos HTML `placeholder="..."` pre-existentes de inputs de formulario (no relacionados a la fase), y un comentario en español "TODO el lenguaje visual" (= "todo/all", no el marcador en inglés). Cero debt markers reales.

### Human Verification Required

1. **Ajustes → Cobros: flujo de guardado de los 3 modos** — alternar días/sin límite/fecha, guardar, refrescar, confirmar persistencia real en el navegador (código verificado estáticamente; falta la confirmación visual/interactiva declarada como pendiente en 04-02-SUMMARY.md).
2. **Calendarios públicos: cap visual real** — confirmar en `/[slug]` (general y canchas) que la navegación de mes queda realmente bloqueada, los días aparecen visualmente deshabilitados y el texto "Reservas hasta el DD/MM" se ve correctamente; repetir con "sin límite" para confirmar cero regresión visual. Declarado como pendiente en 04-03-SUMMARY.md.

Ninguno de estos dos ítems es un gap de código — ambos SUMMARY los declaran explícitamente como checkpoints humanos de la fase, y el código subyacente fue verificado (lectura + tests + typecheck + DB real).

### Gaps Summary

No se encontraron gaps de código. Las 3 capas de enforcement (config → UI pública → backstop server) existen, están cableadas con una única fuente de verdad (`lib/booking-window.ts`), se probaron contra la base de datos local real, y la suite completa (598/598 tests aplicables) + `tsc` pasan limpio. El único motivo por el que el status no es `passed` es la verificación visual/interactiva pendiente en navegador, explícitamente señalada por los propios SUMMARY como checkpoint humano — no una falla del código.

Nota aparte (no bloqueante): actualizar los checkboxes de `ROADMAP.md` (Phase 4 → 4/4 plans) y `REQUIREMENTS.md` (BOOK-WINDOW-01/03 → `[x]`) para que el tracking documental refleje el estado real del código.

---

_Verified: 2026-07-18T21:06:22Z_
_Verifier: Claude (gsd-verifier)_
