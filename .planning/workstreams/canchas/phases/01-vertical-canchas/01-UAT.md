---
status: complete
phase: 01-vertical-canchas
source: [01-VERIFICATION.md]
started: 2026-06-30
updated: 2026-06-30
---

## Current Test

[testing complete]

## Tests

### 1. Sidebar canchas sin "Equipo" + labels del rubro
expected: Negocio vertical='canchas' → sidebar sin "Equipo"; labels "Reservas"/"Canchas"/"Sedes".
result: pass

### 2. Guard server-side /equipo en negocios canchas
expected: Con un negocio canchas, escribir la URL /equipo a mano redirige a /dashboard (no muestra la vista Equipo ni lista las canchas-como-professionals).
result: pass

### 3. Cero regresión visual en salud/belleza/general
expected: Con un negocio salud o general, /equipo sigue mostrando la vista Equipo normal, y el sidebar conserva su menú y terminología de siempre — sin ningún cambio respecto a antes.
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
