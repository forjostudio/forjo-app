# Deferred items — Phase 03 Import de clientes CSV

Descubrimientos fuera del alcance de un plan, registrados sin arreglar (SCOPE BOUNDARY del executor).

## 03-01

- **Flakiness de la suite completa bajo carga paralela (pre-existente, infra):** al correr
  `npx vitest run` (31 archivos en paralelo contra el Supabase local), los tests que hacen
  `.insert().select()` HTTP round-trip contra Supabase (`manual-client`, `booking-core`,
  `canchas-booking`, `concurrency`, y el nuevo `clients-import` origin=importado) fallan
  intermitentemente con `Error: Test timed out in 5000ms`. El conteo de fallas varía entre
  corridas (2 → 5), confirmando contención de red/carga, NO un fallo determinista.
  - **Evidencia de que NO es regresión de 03-01:** en aislamiento (`vitest run test/clients-import.test.ts test/manual-client.test.ts`) pasan **28/28**; el `manual-client` insert que falla bajo carga full-parallel es código que 03-01 no tocó.
  - **Fix candidato (v2 / infra):** subir `testTimeout` en `vitest.config.mts` (ej. 20000ms para
    las suites Supabase) o limitar el pool de paralelismo (`poolOptions`) para no saturar el
    Supabase local en Windows. Fuera del alcance de este plan (toca config global del runner,
    no el import CSV).
