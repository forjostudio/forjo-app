# Phase 6 — Discussion Log

**Date:** 2026-07-20 · Human reference only.

## Gray areas discutidas

### 1. Conflicto en la generación
- **Elección:** saltear la ocurrencia + avisar al dueño (registrar las no generadas); nunca pisar un turno existente. → D-06.

### 2. Ventana de generación (rolling)
- **Elección:** configurable por el dueño (setting a nivel negocio). → D-07.

### 3. Mail del abono → derivó en un cambio de scope
- El usuario pidió un mail X antes de cada ocurrencia para **"pagá la seña o liberá el horario"** (con
  deadline + auto-liberación). Eso es más que "solo reserva" y toca el flujo de seña MP.
- **Decisión de alcance:** v0.24 = **abono base** (un mail al crear + cancelar suscripción); el flujo
  semanal pagá-o-liberá se **difiere a v0.25**. El modelo de datos de v0.24 se diseña extensible para
  engancharlo sin re-migrar. → D-08 + Deferred.

### 4. Marca del turno de abono en la agenda
- **Elección:** sí, badge "fijo/abono". → D-09.

## Deferred
- v0.25: recordatorio semanal pagá-la-seña-o-liberá + auto-liberación. Cobro recurrente automático.
  Recurrencia no-semanal, alta pública, editar serie, waitlist.
