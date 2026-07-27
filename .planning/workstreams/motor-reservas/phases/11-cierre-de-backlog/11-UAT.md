---
status: testing
phase: 11-cierre-de-backlog
source: [11-VERIFICATION.md]
started: 2026-07-27
updated: 2026-07-27
---

## Current Test

number: 1
name: POLISH-01 — chip Cancelado vs Completado en Archivados
expected: |
  En Abonos → tab Archivados, cada serie muestra un chip por estado: "Cancelado"
  (destructive/muted) y "Completado" (secondary/success), distinguibles de un vistazo
  sin abrir el detalle, con contraste legible.
awaiting: user response

## Tests

### 1. POLISH-01 — chip Cancelado/Completado (Archivados de Abonos)
expected: en el tab Archivados, "Cancelado" y "Completado" se distinguen por chip de color semántico, legibles, sin abrir el detalle.
result: [pending]

### 2. POLISH-02 — Clientes sin regresión
expected: la pantalla de Clientes se comporta igual que antes (búsqueda, filtros, alta, edición del cliente seleccionado, notas) sin renders raros al cambiar de cliente. (El error de eslint ya se fue — verificado por código.)
result: [pending]

### 3. POLISH-03 — bordes de cancelación consistentes
expected: `/cancelar/[token]` y `/abono/cancelar/[token]` muestran el mismo borde lateral acentuado, consistentes entre sí y con el resto de la app; nada del endurecimiento (404, número, noindex) cambió.
result: [pending]

### 4. EXTRA-A — mensaje de borrado más claro
expected: al intentar borrar un servicio/sede/cancha con turnos (incluidos pasados/cancelados), el toast aclara que cuenta pasados/cancelados y ofrece desactivar. Además, borrar un profesional con turnos ya NO dice "eliminado" en falso (muestra el error real y no lo saca de la lista).
result: [pending]

### 5. EXTRA-B — orden de la tarjeta "Cualquiera" + toggle
expected: en Ajustes hay un toggle del default del selector. Con 'any' (default) la reserva pública se ve igual que hoy (tarjeta "Cualquiera" arriba). Con 'choose' la tarjeta "Cualquiera" queda debajo de la lista de profesionales (sin ocultarse), y sigue apareciendo solo con 2+ capaces. El toggle persiste.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
</content>
