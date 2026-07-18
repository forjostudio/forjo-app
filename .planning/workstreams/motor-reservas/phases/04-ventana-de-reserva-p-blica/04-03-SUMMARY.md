---
phase: 04-ventana-de-reserva-p-blica
plan: 03
subsystem: booking / calendario público (UX cap)
tags: [booking-window, public-view, date-fns, calendario, canchas, ux-cap]
status: complete
requires:
  - "lib/booking-window.ts — effectiveBookingCutoff (Plan 01)"
  - "PublicBusiness.max_advance_days/max_advance_date fluyendo por page.tsx (Plan 01)"
provides:
  - "app/[slug]/booking-client.tsx — cap de mes/día + texto 'Reservas hasta el DD/MM'"
  - "app/[slug]/canchas-booking-client.tsx — mismo cap + texto (gemelo)"
affects:
  - "Plan 04 (backstop server): esta capa es UX; la autoridad real llega en el backstop"
tech-stack:
  added: []
  patterns:
    - "Cap de calendario aditivo, gateado por cutoff != null (cero regresión sin límite)"
    - "Gemelos verbatim: mismo cambio idéntico en ambos calendarios públicos"
    - "Corte de ventana inclusive vía isAfter(startOfDay(d), cutoff)"
key-files:
  created: []
  modified:
    - app/[slug]/booking-client.tsx
    - app/[slug]/canchas-booking-client.tsx
decisions:
  - "Se reusó effectiveBookingCutoff del Plan 01 en vez de duplicar lógica de fecha en el cliente"
  - "El texto 'Reservas hasta el DD/MM' se gatea con cutoff != null para no aparecer en negocios sin límite"
metrics:
  tasks: 2
  files_created: 0
  files_modified: 2
  completed: 2026-07-18
status_line: "Los dos calendarios públicos gemelos capan navegación de mes y días fuera de la ventana (corte inclusive, hora AR) y muestran 'Reservas hasta el DD/MM' cuando hay límite"
---

# Phase 4 Plan 03: Cap de los calendarios públicos por ventana de reserva — Summary

Se capó la capa de calendarios del enforcement en 3 capas (D-08): los dos clients públicos gemelos (`booking-client.tsx` general y `canchas-booking-client.tsx`) ya no permiten navegar ni elegir un día más allá de la ventana de reserva (BOOK-WINDOW-02), y muestran el texto "Reservas hasta el DD/MM" (D-05) cuando el negocio tiene un límite configurado. Es UX pura, cierra la puerta que originó el bug de reservas a 3 años (navegación de mes sin tope); la autoridad real es el backstop server del Plan 04.

## What Was Built

### Task 1 — Cap + texto en el calendario general (commit `7ccf034`)
- Import de `isAfter` (date-fns) + `effectiveBookingCutoff` (`@/lib/booking-window`).
- `cutoff = useMemo(() => effectiveBookingCutoff(business), [business])` y `cutoffMonth = cutoff ? startOfMonth(cutoff) : null`, computados junto a `thisMonth`. `business` ya era prop (`PublicBusiness` con las columnas del Plan 01).
- Botón "mes siguiente": sumado `disabled={cutoffMonth != null && !isBefore(startOfMonth(calMonth), cutoffMonth)}` con las clases `disabled:opacity-30 disabled:pointer-events-none` reusadas del botón "mes anterior" para consistencia visual.
- Condición de día extendida a `... || (cutoff != null && isAfter(startOfDay(d), cutoff))` — corte inclusive (solo se deshabilita lo estrictamente posterior).
- Texto D-05: `<p className="mt-2 text-xs text-muted-foreground text-center">Reservas hasta el {format(cutoff, 'dd/MM')}</p>` gateado por `{cutoff && (...)}`, debajo del card del calendario y antes del bloque "Horario".

### Task 2 — Mismo cap + texto en el calendario de canchas (commit `473b980`)
- Cambio idéntico verbatim en `canchas-booking-client.tsx` (los calendarios son gemelos y no deben divergir): mismos imports, mismo `cutoff`/`cutoffMonth`, mismo cap de botón de mes, misma condición de día, mismo `<p>` con idéntico copy y estilo, gateado por `cutoff != null`.
- No se tocó la lógica de canchas/slots (duración fija).

## Verification

| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` (booking-client) | OK — sin errores nuevos |
| `npx tsc --noEmit` (canchas-booking-client) | OK — sin errores nuevos |
| `npx eslint app/[slug]/booking-client.tsx` | EXIT 0 |
| `npx eslint app/[slug]/canchas-booking-client.tsx` | EXIT 0 |
| grep `effectiveBookingCutoff` / "Reservas hasta el" en ambos | OK-TEXTO / OK-GEMELO |

## Deviations from Plan

None — el plan se ejecutó exactamente como estaba escrito. No hubo Rule 1/2/3 auto-fixes ni gates de autenticación.

## Threat Mitigations (del threat_model)

- **T-04-07 (Tampering, cap del calendario — accept):** el cap es UX, no un control de seguridad. Un cliente puede saltear la UI (devtools, request directa); la autoridad que rechaza la fecha fuera de ventana es el backstop server del Plan 04. Aceptado por diseño.
- **T-04-08 (regresión funcional — mitigate):** el cap se SUMA a la condición existente y se gatea por `cutoff != null`. Con cutoff null el comportamiento es byte-idéntico al actual (navegación y días sin cambios), preservando el flujo de negocios sin límite.
- **T-04-SC (installs — accept):** cero dependencias nuevas; `date-fns` ya estaba importado en ambos clients (solo se sumó `isAfter` al import existente).

## Known Stubs

Ninguno. El cap es funcional en ambos calendarios; el backstop server (autoridad de rechazo) llega en el Plan 04.

## Manual Verification Pendiente (checkpoint humano de la fase)

Con un negocio a 30 días, confirmar en /[slug] que no se puede avanzar más allá del mes del corte, que los días posteriores están deshabilitados y que se ve "Reservas hasta el DD/MM"; con "sin límite" el calendario navega como siempre. Repetir en un negocio del vertical canchas.

## Self-Check: PASSED
- Archivos modificados: app/[slug]/booking-client.tsx ✓, app/[slug]/canchas-booking-client.tsx ✓
- Commits: 7ccf034 ✓, 473b980 ✓
