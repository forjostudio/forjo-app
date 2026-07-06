---
status: complete
phase: 03-import-de-clientes-csv
source: [03-VERIFICATION.md]
started: 2026-07-06T19:00:00Z
updated: 2026-07-06T20:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Round-trip completo (exportar → reimportar → preview → confirmar → badge Importado)
expected: Exportar CSV → Importar ese CSV → preview con conteos → Confirmar → resumen (importados/omitidos/fallidos) → clientes con badge "Importado" en la lista. Nombre "=X" vuelve intacto (lossless).
result: pass
note: Bug encontrado y arreglado durante la UAT — Excel (locale ES) colapsaba el CSV a una columna con comillas dobladas → invalid_header. Fix en parseCsv (recuperación del colapso, commit ba27417), validado con los bytes exactos del usuario. Round-trip funciona aun editando el CSV en Excel.

### 2. Preview con tabla de filas válidas (SC-1)
expected: La preview muestra conteos + tabla de filas VÁLIDAS (Nombre·Teléfono·Email) + listado de errores. El usuario pidió la tabla completa de válidas → implementada (commit 6126ff8).
result: pass
note: 2 bugs encontrados+arreglados durante la UAT — (1) el endpoint /preview no devolvía los datos de las filas válidas → agregado 'filas' + tabla en la UI (6126ff8); (2) validateClientBody no validaba formato de email → un email sin @ se colaba como válido → isValidEmail agregado, ahora marca 'invalid_email' (d710247). +tests.

### 3. Guard de tamaño / extensión (client-side, antes del fetch)
expected: Subir un archivo > 2MB o que no sea .csv muestra un error inline ("Subí un archivo .csv de hasta 2 MB.") ANTES de mandar nada al server; no avanza a preview. (El server igual re-valida.)
result: pass

### 4. Guard de header inválido
expected: Subir un CSV con un header equivocado (columnas distintas a nombre,telefono,email,origen,notas,obra_social,nro_obra_social) da un mensaje claro de header inválido, no un toast genérico ni un crash.
result: pass

### 5. Anti-doble-submit en "Confirmar"
expected: Al confirmar el import, el botón pasa a "Importando..." + disabled y el Dialog no se cierra durante la escritura; no se puede disparar el confirm dos veces.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
