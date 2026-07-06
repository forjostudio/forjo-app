---
status: testing
phase: 03-import-de-clientes-csv
source: [03-VERIFICATION.md]
started: 2026-07-06T19:00:00Z
updated: 2026-07-06T19:00:00Z
---

## Current Test

number: 1
name: Round-trip completo (exportar → reimportar → preview → confirmar → badge Importado)
expected: |
  Exportás clientes a CSV (Fase 2), después "Importar CSV" ese mismo archivo → preview con los conteos
  (importables / duplicadas / errores) → Confirmar → resumen (importados / omitidos / fallidos) → al cerrar,
  los clientes importados aparecen en la lista con badge "Importado". Un cliente con nombre tipo "=X" vuelve
  intacto (round-trip lossless), sin romperse ni ejecutar fórmula.
awaiting: user response

## Tests

### 1. Round-trip completo (exportar → reimportar → preview → confirmar → badge Importado)
expected: Exportar CSV → Importar ese CSV → preview con conteos → Confirmar → resumen (importados/omitidos/fallidos) → clientes con badge "Importado" en la lista. Nombre "=X" vuelve intacto (lossless).
result: [pending]

### 2. Decisión SC-1 — ¿la preview alcanza con conteos + tabla de errores?
expected: La preview muestra los conteos (importables / duplicadas / con error) + una tabla de las filas CON ERROR (Fila N + motivo). NO muestra una tabla de todas las filas válidas (nombre/teléfono/email). Decisión de producto: ¿te alcanza para decidir antes de confirmar, o querés ver la tabla completa de las filas válidas (sería una iteración: el endpoint /preview tendría que devolver los datos por fila)?
result: [pending]

### 3. Guard de tamaño / extensión (client-side, antes del fetch)
expected: Subir un archivo > 2MB o que no sea .csv muestra un error inline ("Subí un archivo .csv de hasta 2 MB.") ANTES de mandar nada al server; no avanza a preview. (El server igual re-valida.)
result: [pending]

### 4. Guard de header inválido
expected: Subir un CSV con un header equivocado (columnas distintas a nombre,telefono,email,origen,notas,obra_social,nro_obra_social) da un mensaje claro de header inválido, no un toast genérico ni un crash.
result: [pending]

### 5. Anti-doble-submit en "Confirmar"
expected: Al confirmar el import, el botón pasa a "Importando..." + disabled y el Dialog no se cierra durante la escritura; no se puede disparar el confirm dos veces.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
