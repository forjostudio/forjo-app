---
phase: 02-rework-ux-del-onboarding
plan: 01
subsystem: ui
tags: [onboarding, ux, wizard, forms, verticals, canchas, next-image, branding]

# Dependency graph
requires:
  - phase: 01-reconciliacion-de-horarios
    provides: "time_blocks como fuente única de horarios; el onboarding ya escribe bloques que panel/booking leen"
provides:
  - "Onboarding wizard con paso opcional salteable ('Omitir por ahora') en Servicios/Profesionales/Horarios"
  - "Gating relajado: sólo el paso 1 (Negocio) bloquea el avance"
  - "Stepper dinámico por vertical: en 'canchas' Profesionales desaparece y la numeración queda 1-2-3 sin huecos"
  - "Servicios con header de columnas siempre visible (desktop sticky) + tarjeta 2-líneas en mobile"
  - "Validación inline onBlur (nombre requerido, precio) y precio 0 permitido (servicio gratuito)"
  - "Header del wizard con el lockup de marca Forjo Gestión (Tinta/Crema por tema)"
affects: [onboarding, booking-publico, canchas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Navegación del wizard por POSICIÓN dentro de visibleSteps (setStep(visibleSteps[i±1].n)) en vez del literal s+1"
    - "Stepper filtrado por vertical (getVerticalKeyByType(type) === 'canchas') como fuente única del array de pasos"
    - "Validación inline onBlur con text-xs text-destructive + aria-invalid, no fail-only-on-submit"
    - "Lockup de marca vía next/image con variante por tema (dark/light) desde public/brand/"

key-files:
  created:
    - public/brand/forjo-gestion-lockup-tinta.png
    - public/brand/forjo-gestion-lockup-crema.png
  modified:
    - app/(onboarding)/onboarding/page.tsx

key-decisions:
  - "Navegación por posición dentro de visibleSteps (no s+1) para saltar limpio Profesionales en canchas sin huecos de numeración"
  - "Precio 0 = servicio gratuito válido; sólo precio negativo da error (D-09)"
  - "Nombre de servicio requerido es validación inline (nameError/validateServiceName) que NO bloquea el avance del paso (D-02); handleFinish filtra filas con s.name.trim() vacío"
  - "Gate de 'Agregar servicio'/'Agregar profesional' deshabilitado si la última fila no tiene nombre (evita filas fantasma)"
  - "Header del wizard: reemplazado el wordmark teñido por el lockup oficial Forjo Gestión (next/image, Tinta claro / Crema dark)"

patterns-established:
  - "Wizard multi-paso guiado por un array visibleSteps derivado del vertical; last-step detection por visibleSteps.length (sin hardcodear 4)"
  - "Responsive de tablas de carga: header sticky en desktop + tarjeta con labels propios en mobile (mismo dataset, dos layouts)"

requirements-completed: [ONB-01, ONB-02]

# Metrics
duration: ~21h (spread over checkpoint rounds 2026-07-03 → 2026-07-04)
completed: 2026-07-04
status: complete
---

# Phase 2 Plan 01: Rework UX del Onboarding Summary

**Wizard de alta reworkeado en un único archivo cliente: pasos opcionales salteables ("Omitir por ahora"), gating relajado a sólo el paso Negocio, stepper dinámico que oculta Profesionales en el vertical canchas, header de Servicios siempre visible con validación inline onBlur y precio 0 permitido, más el lockup de marca Forjo Gestión en el header.**

## Performance

- **Duration:** ~21 h (repartido en rondas de checkpoint human-verify)
- **Started:** 2026-07-03T18:14:57-03:00
- **Completed:** 2026-07-04T15:14:23-03:00
- **Tasks:** 3 base + refinamientos de checkpoint (rondas 2–4) + centrado final
- **Files modified:** 1 modificado (`page.tsx`) + 2 assets creados (`public/brand/*.png`)

## Accomplishments

- **ONB-01 (Omitir):** botón "Omitir por ahora" en Servicios/Profesionales/Horarios (NO en Negocio) que avanza al siguiente paso sin validar; oculto en el paso 1 y en el último paso.
- **Gating relajado (D-02):** sólo el paso 1 (Negocio) bloquea "Siguiente"; los demás pasos ya no bloquean el avance.
- **Stepper dinámico canchas (D-03):** en el vertical `canchas` el paso Profesionales no aparece — flujo de 3 pasos (Negocio → Servicios → Horarios) con numeración 1-2-3 sin huecos.
- **Finalizar en el último paso real (D-04):** el botón Finalizar aparece sólo en el último paso del array filtrado (Horarios en ambos verticales).
- **Header de Servicios (ONB-02, D-07):** labels de columna (Nombre/Min./Precio) siempre visibles; sticky en desktop, tarjeta 2-líneas con labels propios en mobile.
- **Validación inline onBlur (ONB-02, D-08):** nombre y precio validan al salir del campo con `text-xs text-destructive` + `aria-invalid`, no sólo al finalizar.
- **Precio 0 permitido (D-09):** una fila con nombre y precio 0 es válida (servicio gratuito); sólo el precio negativo da error.
- **Marca:** header del wizard con el lockup oficial Forjo Gestión (variante por tema).

## Task Commits

Base tasks del plan (3):

1. **Stepper dinámico por vertical + relajar gating (D-02, D-03)** — `049a099` (feat)
2. **Botón Omitir por ahora + nav bar guiada por visibleSteps (D-01, D-04)** — `bc700f4` (feat)
3. **Header fijo de Servicios + validación inline onBlur + precio 0 (D-07, D-08, D-09)** — `d9c96b0` (feat)

Refinamientos aplicados en las rondas de checkpoint human-verify (2–4) y centrado final:

4. **Omitir de-emphasized + copy Horarios** — `2ee2750` (fix) — Omitir en `text-muted-foreground/70`; copy "Tocá cada día para abrirlo o cerrarlo…".
5. **Servicios nombre requerido (lógica) + filtra whitespace** — `1fd1d63` (fix) — `nameError`/`validateServiceName`; `handleFinish` filtra `s.name.trim()`.
6. **Servicios responsive card mobile + header sticky + placeholder + select-on-focus** — `3fa0485` (fix) — placeholder "Ej: Corte de cabello" sólo 1ª fila; select-on-focus en Min./Precio; tarjeta 2-líneas en mobile.
7. **Horarios grilla sin overflow en mobile** — `3116cd4` (fix)
8. **Omitir aún más atenuado** — `b6a5aea` (fix)
9. **No agregar fila nueva si la última está incompleta** — `90ea609` (fix) — gate de "Agregar servicio"/"Agregar profesional" deshabilitado si la última fila no tiene nombre.
10. **Horarios apilado día-arriba en mobile** — `23a6c45` (fix)
11. **Header usa el lockup de marca en vez del wordmark teñido** — `545c054` (fix) — next/image, Tinta claro / Crema dark.
12. **Horarios celdas snug centradas + día 60% en mobile** — `154a985` (fix) — día como barra ~60% centrada arriba; celdas de hora snug/centradas (`w-24`).
13. **Centrar título Horarios en mobile** — `fe42201` (fix) — h2 con `text-center sm:text-left`.

**Plan metadata:** commit de docs con SUMMARY + ROADMAP progress.

## Files Created/Modified

- `app/(onboarding)/onboarding/page.tsx` — Onboarding wizard: Omitir, stepper dinámico por vertical, header de columnas fijo en Servicios, validación inline onBlur, precio 0 permitido, header con lockup de marca, layout responsive de Horarios y Servicios.
- `public/brand/forjo-gestion-lockup-tinta.png` — lockup de marca (variante Tinta, tema claro).
- `public/brand/forjo-gestion-lockup-crema.png` — lockup de marca (variante Crema, tema dark).

## Decisions Made

- **Navegación por POSICIÓN dentro de `visibleSteps`** (`setStep(visibleSteps[i±1].n)`) en vez del literal `s+1`: necesaria para saltar limpio el paso Profesionales en el vertical canchas sin dejar huecos de numeración. Desviación controlada respecto del enfoque incremental ingenuo; documentada aquí.
- **Precio 0 = servicio gratuito válido**; sólo el precio negativo da error (D-09).
- **Nombre de servicio requerido como validación inline que NO bloquea el avance** (D-02): `nameError`/`validateServiceName` muestran el error inline, pero el paso sigue siendo salteable; `handleFinish` filtra filas con nombre vacío (`s.name.trim()`).
- **Gate de "Agregar servicio"/"Agregar profesional"** deshabilitado si la última fila no tiene nombre, para evitar filas fantasma.
- **Header con lockup de marca** en lugar del wordmark teñido: next/image con variante por tema desde `public/brand/`.

## Deviations from Plan

### Cambios respecto del plan (aplicados en checkpoints human-verify, aprobados por el usuario)

**1. [Refinamiento de checkpoint] Navegación del wizard por posición en `visibleSteps`**
- **Found during:** Task 2 (nav bar guiada por visibleSteps)
- **Issue:** El literal `s+1` no salta correctamente Profesionales en el vertical canchas (dejaría un hueco de numeración o navegaría a un paso oculto).
- **Fix:** Navegación por índice dentro del array filtrado — `setStep(visibleSteps[i±1].n)`.
- **Files modified:** `app/(onboarding)/onboarding/page.tsx`
- **Verification:** human-verify de los flujos general y canchas (numeración 1-2-3 sin huecos).
- **Committed in:** `bc700f4`

**2. [Refinamiento de checkpoint] Lockup de marca en el header**
- **Found during:** Ronda de checkpoint (revisión visual del header)
- **Issue:** El wordmark teñido no reflejaba la identidad Forjo Gestión.
- **Fix:** Reemplazo por el lockup oficial (next/image, Tinta/Crema por tema), assets nuevos en `public/brand/`.
- **Files modified:** `app/(onboarding)/onboarding/page.tsx`, `public/brand/forjo-gestion-lockup-{tinta,crema}.png`
- **Verification:** human-verify visual en claro y dark.
- **Committed in:** `545c054`

**3. [Refinamientos de layout responsive] Servicios y Horarios en mobile**
- **Found during:** Rondas 2–4 de checkpoint
- **Issue:** Overflow y jerarquía visual pobre en 375px (grilla de Horarios, tabla de Servicios, alineación del título).
- **Fix:** Servicios como tarjeta 2-líneas con labels propios en mobile + header sticky en desktop; Horarios sin overflow, día como barra ~60% centrada arriba, celdas de hora snug/centradas (`w-24`), título centrado en mobile (`text-center sm:text-left`).
- **Files modified:** `app/(onboarding)/onboarding/page.tsx`
- **Verification:** human-verify a 375px.
- **Committed in:** `3116cd4`, `23a6c45`, `154a985`, `fe42201`, `3fa0485`

---

**Total deviations:** refinamientos de UX aplicados durante checkpoints human-verify, todos aprobados por el usuario. Sin scope creep fuera de `page.tsx` + assets de marca.
**Impact on plan:** los cambios pulen fidelidad visual y el flujo por vertical; el contrato del plan (D-01..D-09, ONB-01/02) se cumple.

## Issues Encountered

None que bloqueara — los ajustes surgieron de la revisión visual iterativa en los checkpoints.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Gates

- **`npx tsc --noEmit`** → exit 0.
- **`npm run lint`** → sin findings nuevos. 3 findings pre-existentes out-of-scope en `page.tsx`: Badge unused, `dataset.palette` immutability (:99), setState-in-effect (:130). No introducidos por este plan.
- **Unit tests:** no se agregaron. El proyecto usa Vitest node-only (sin harness de componentes React), por lo que la fidelidad de UI se cubre vía el checkpoint human-verify.

## Next Phase Readiness

- Onboarding UX reworkeado y verificado visualmente; listo para uso.
- Requisitos ONB-01 y ONB-02 completados.

---
*Phase: 02-rework-ux-del-onboarding*
*Completed: 2026-07-04*

## Self-Check: PASSED
