---
status: testing
phase: 08-equipo-qu-servicios-hace-cada-profesional
source: [08-VERIFICATION.md]
started: 2026-07-24T23:38:43Z
updated: 2026-07-24T23:38:43Z
---

## Current Test

number: 1
name: Persistencia real del mapeo en /equipo
expected: |
  Con un negocio de ≥2 profesionales activos: al marcar/desmarcar chips de servicio los chips
  se pintan al instante sin parpadeo de rollback, y tras recargar (F5) el estado leído del
  servidor coincide exactamente con lo marcado antes.
awaiting: user response

## Tests

### 1. Persistencia real del mapeo en /equipo
expected: Con ≥2 profesionales activos, marcar y desmarcar chips de servicio para distintos profesionales en /equipo y recargar (F5) — los chips se pintan al instante sin rollback y tras recargar el estado del servidor coincide exactamente con lo marcado. (round-trip navegador↔Supabase con RLS)
result: [pending]

### 2. Cobertura visual en /servicios
expected: Con ≥2 profesionales activos, en /servicios un servicio con al menos un profesional capaz muestra "Lo hacen: {nombres}"; un servicio sin ningún profesional capaz muestra el badge "Sin cobertura" + línea con link a /equipo (el link navega). Con al menos un profesional comodín (0 filas) presente, ningún servicio muestra "Sin cobertura". El estado visual coincide con la regla del comodín en cada combinación.
result: [pending]

### 3. Precedencia de toasts D-10/D-02 al desmarcar
expected: Desmarcar el último servicio de un profesional dejando ese servicio sin ningún otro profesional capaz → aparece SOLO toast.warning ("Nadie ofrece..."). Desmarcar un servicio sin dejar al servicio sin cobertura pero dejando al profesional en comodín (0 marcados) → aparece SOLO toast.info ("vuelve a ofrecerse para todo"). Nunca ambos toasts a la vez (D-10 gana sobre D-02).
result: [pending]

### 4. Gates de vertical/cantidad de profesionales (regresión visual)
expected: En un negocio del vertical canchas, ni el editor de chips (/equipo) ni la cobertura (/servicios) aparecen. En un negocio con 1 solo profesional activo, tampoco aparece ninguno de los dos bloques y la reserva sigue funcionando igual que antes. Cero cambios visuales/funcionales para canchas y negocios de 1 profesional.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
