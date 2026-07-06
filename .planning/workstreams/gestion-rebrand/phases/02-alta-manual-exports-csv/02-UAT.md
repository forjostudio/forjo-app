---
status: testing
phase: 02-alta-manual-exports-csv
source: [02-VERIFICATION.md]
started: 2026-07-06T10:00:00Z
updated: 2026-07-06T10:00:00Z
---

## Current Test

number: 1
name: Alta manual de cliente + badge "Manual" al instante
expected: |
  Desde /clients, el botón "Nuevo cliente" abre un Dialog. Cargás nombre + un contacto (teléfono o
  email), Guardar, y el cliente aparece al instante en la lista con un badge "Manual". Validación
  inline si falta nombre o contacto. Los clientes que ya existían muestran badge "Reserva".
awaiting: user response

## Tests

### 1. Alta manual de cliente + badge "Manual" al instante
expected: Dialog "Nuevo cliente" desde /clients; alta con nombre + contacto; el cliente aparece al instante con badge "Manual"; validación inline (nombre y al menos un contacto); clientes previos = badge "Reserva".
result: [pending]

### 2. Gating de obra social por vertical salud
expected: En un negocio vertical salud, el Dialog de alta muestra los campos de obra social (nombre + número). En un negocio de otro vertical (belleza/general/canchas), esos campos NO aparecen.
result: [pending]

### 3. Export CSV de clientes (Excel-AR, tenant-scoped)
expected: El botón "Exportar CSV" en Clientes descarga un archivo que abre en Excel-AR con acentos correctos (BOM) y columnas separadas (nombre, telefono, email, origen, notas, obra_social, nro_obra_social); solo trae clientes de tu negocio.
result: [pending]

### 4. Export CSV de finanzas (3 tipos de movimiento)
expected: El botón "Exportar CSV" en Finanzas descarga un archivo (fecha, tipo, concepto, monto) que combina turnos pagados + ventas + egresos, con montos correctos; solo movimientos de tu negocio. (Los gastos fijos recurrentes se excluyen a propósito — no son movimientos fechados.)
result: [pending]

### 5. Botones "Exportar CSV" son secundarios (outline)
expected: Ambos botones "Exportar CSV" (Clientes y Finanzas) se ven en estilo outline (secundario), sin competir con el CTA primario de cada pantalla; muestran "Exportando..." mientras descargan.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
