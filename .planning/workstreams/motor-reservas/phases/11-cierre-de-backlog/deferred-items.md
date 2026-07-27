# Deferred Items — Phase 11

## [11-04] Flakiness de tests de abono bajo file-parallelism (out-of-scope)
- **Descubierto en:** Plan 11-04 (`npm test` full suite).
- **Síntoma:** `abono-cron`, `abono-create`, `abono-cancel-routes`, `abono-generation` fallan (~9 tests) al correr `npx vitest run` en paralelo; pasan en aislamiento y con `--no-file-parallelism` (suite completa 776/0).
- **Causa probable:** contención de la Supabase LOCAL compartida entre archivos de test en paralelo.
- **Por qué es out-of-scope:** cero overlap con los archivos de 11-04 (booking-selector/booking-client/settings-client); pre-existente.
- **Acción sugerida:** setear `--no-file-parallelism` (o pool aislado por archivo) como default para la suite con DB local, o aislar el estado de abono por test.
