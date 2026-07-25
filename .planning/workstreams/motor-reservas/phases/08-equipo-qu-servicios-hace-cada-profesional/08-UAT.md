---
status: complete
phase: 08-equipo-qu-servicios-hace-cada-profesional
source: [08-VERIFICATION.md]
started: 2026-07-24T23:38:43Z
updated: 2026-07-25T00:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Persistencia real del mapeo en /equipo
expected: Con ≥2 profesionales activos, marcar y desmarcar chips de servicio para distintos profesionales en /equipo y recargar (F5) — los chips se pintan al instante sin rollback y tras recargar el estado del servidor coincide exactamente con lo marcado. (round-trip navegador↔Supabase con RLS)
result: pass
note: Persistencia OK (Ana=Corte·Color, Juan=comodín "Hace todo"). Observación cosmética registrada en Gaps: el texto "Hace todo" desaparece al marcar el primer chip y cambia el alto de la tarjeta (layout shift) — mover a una posición que no altere la altura.

### 2. Cobertura visual en /servicios
expected: Con ≥2 profesionales activos, en /servicios un servicio con al menos un profesional capaz muestra "Lo hacen: {nombres}"; un servicio sin ningún profesional capaz muestra el badge "Sin cobertura" + línea con link a /equipo (el link navega). Con al menos un profesional comodín (0 filas) presente, ningún servicio muestra "Sin cobertura". El estado visual coincide con la regla del comodín en cada combinación.
result: pass

### 3. Precedencia de toasts D-10/D-02 al desmarcar
expected: Desmarcar el último servicio de un profesional dejando ese servicio sin ningún otro profesional capaz → aparece SOLO toast.warning ("Nadie ofrece..."). Desmarcar un servicio sin dejar al servicio sin cobertura pero dejando al profesional en comodín (0 marcados) → aparece SOLO toast.info ("vuelve a ofrecerse para todo"). Nunca ambos toasts a la vez (D-10 gana sobre D-02).
result: pass
note: Confirmado el caso 2 (Juan→comodín: solo toast.info "vuelve a ofrecerse para todo", un único toast) + cobertura reacciona en /servicios (Corte→"Sin cobertura", Color→"Lo hacen: Ana·Juan"). Invariante "nunca ambos a la vez" visible.

### 4. Gates de vertical/cantidad de profesionales (regresión visual)
expected: En un negocio del vertical canchas, ni el editor de chips (/equipo) ni la cobertura (/servicios) aparecen. En un negocio con 1 solo profesional activo, tampoco aparece ninguno de los dos bloques y la reserva sigue funcionando igual que antes. Cero cambios visuales/funcionales para canchas y negocios de 1 profesional.
result: pass
note: Verificado en negocio canchas — sidebar "Canchas", página "Agregar cancha", SIN editor de mapeo ni cobertura por servicio. Gating OK. Observación no-Fase-8 capturada en backlog: el H1 de la página en el vertical canchas sigue diciendo "Servicios" (debería usar la terminología del vertical → "Canchas").

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0
cosmetic: 1

## Gaps

- truth: "El editor de /equipo no debe cambiar el alto de la tarjeta del profesional al marcar/desmarcar chips"
  status: cosmetic
  reason: "El texto 'Hace todo' (estado comodín, 0 servicios marcados) desaparece al marcar el primer chip y su ausencia altera el alto de la tarjeta → layout shift feo. Reubicarlo donde no afecte la altura (p. ej. reservar el espacio, o ponerlo inline en el header del profesional)."
  severity: cosmetic
  test: 1
  scope: phase-8
  artifacts: [app/(dashboard)/settings/settings-client.tsx]
  missing: []
