---
status: testing
phase: 13-borrado-de-servicio-preservando-historial
source: [13-VERIFICATION.md]
started: 2026-08-03T00:00:00.000Z
updated: 2026-08-03T00:00:00.000Z
---

## Current Test

number: 1
name: Backstop TOCTOU — un rechazo tardío del trigger no cierra el modal en silencio
expected: |
  Con el modal abierto en estado CONFIRMABLE, si alguien reserva un turno futuro entre el pre-check
  y el click en "Eliminar", el DELETE es rechazado por `services_block_delete_trg`. El modal NO debe
  cerrarse: tiene que volver a abrir en estado BLOQUEADO con el motivo real (el conteo de turnos y la
  fecha del próximo), y el servicio debe seguir existiendo en la lista.
awaiting: user response

## Tests

### 1. Backstop TOCTOU — modal reabre en estado bloqueado tras un rechazo tardío

expected: el modal no se cierra en silencio; reabre en estado bloqueado con el motivo real (D-10/D-11)
result: [pending]

**Por qué quedó sin verificar:** el código está presente y bien cableado (`onConfirm` hace
`await openDeleteService(...)` y después `throw`, para que `ConfirmDialog` no decida cerrar), y la
garantía de datos que lo respalda (`services_block_delete_trg`) tiene test de integración. Lo que no
tiene cobertura es el **re-render del modal**: este repo corre Vitest en `environment: 'node'` y no
renderiza componentes React en ningún test. Las tres rondas de UAT del plan 13-05 recorrieron los tres
estados del modal pero no ejercieron esta ventana de carrera.

**Riesgo:** bajo. Lo que está en juego es la UX de la rama de error, no la integridad de los datos —
el borrado accidental ya lo impide el trigger, y eso está probado.

**Escenario preparado en el Supabase local:**

- Servicio **"Color"** (`bf0cc80e-700c-45ca-8b11-d2feb3766dab`), $12.000, activo.
- Tiene 1 turno **pasado** (30/7 16:00, completado) → el modal abre en estado **confirmable**.
- No tiene turnos futuros ni abonos activos → nada lo bloquea todavía.

**Pasos:**

1. Ajustes → Servicios → tocá el tacho de **"Color"**.
2. El modal abre en estado **confirmable**: *"Vas a eliminar 'Color'. Se conservan su 1 turno en el
   historial…"*, con "Eliminar" en rojo sólido.
3. **Sin cerrar el modal**, avisá — se inserta un turno futuro para "Color" por service-role,
   simulando que un cliente reservó en ese instante.
4. Recién entonces tocá **"Eliminar"**.
5. **Esperado:** el modal NO se cierra. Vuelve al estado **bloqueado**: *"'Color' tiene 1 turno
   reservado a partir del D/M. Desactivalo para dejar de ofrecerlo y conservar el historial."*, sin
   "Eliminar" habilitado y con "Desactivar" disponible. "Color" sigue en la lista de Servicios.
6. **Falla si:** el modal se cierra solo, aparece un toast de error genérico sin reabrir el modal, o
   el servicio desaparece de la lista.

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
