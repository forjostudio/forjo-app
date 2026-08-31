---
status: testing
phase: 19-el-panel
source: [19-VERIFICATION.md]
started: 2026-08-26T14:30:00Z
updated: 2026-08-31T20:00:00Z
---

## Current Test

number: 3
name: Toast de `service_not_scheduled` desde el booking público real
expected: |
  El cliente ve "Ese horario ya no se ofrece para este servicio. Recargá la página y elegí otro."
  — no un error de red genérico.
awaiting: user response

## Tests

### 1. UAT visual de la línea de chips a 375px y en desktop
expected: Sin salto de layout al marcar el primer chip; el chip comodín se lee como informativo, no como campo vacío; estados de foco visibles y del tamaño correcto (44px). Sumar: que los controles deshabilitados durante el guardado (chips, inputs de hora, ×, toggle de día, Agregar bloque, Copiar a otros días) se **vean** apagados en las 5 paletas y en dark — es el fix de CR-01, y `opacity-50` sobre `bg-primary`/`bg-secondary` no lo miró nadie en pantalla.
result: passed — probado en navegador 2026-08-27 sobre datos sembrados (8 servicios, lunes partido en 2 franjas, martes con inactivo mapeado, 5 franjas comodín). Sin salto de layout, foco correcto, controles apagados durante el guardado.

### 2. Primer guardado de horarios en producción tras el deploy (cache de PostgREST)
expected: El guardado se completa y persiste, sin `PGRST202` / "función no encontrada". Si falla, correr `NOTIFY pgrst, 'reload schema';` en el editor SQL de producción — es una línea, sin migración.
result: passed — probado en **PRODUCCIÓN** el 2026-08-31, tras el deploy (`99cdd43`). El guardado de horarios persiste, sin `PGRST202`: el `NOTIFY pgrst` que lleva la migr. 075 al final sí corrió. Esto **cierra T-19-32 con evidencia empírica**, no por deducción. El aviso "Cambios sin guardar" aparece al tocar Duración del turno (fix del blocker del audit visual, verificado). ⚠ NOTA: el usuario esperaba además un **bloqueo de navegación** con confirmación de descarte; el contrato de la fase lo declara fuera de alcance a propósito (comentario en `agenda-client.tsx`, junto al indicador). No es una falla de este test — queda anotado como feature aparte.

### 3. Toast de `service_not_scheduled` desde el booking público real
expected: El cliente ve "Ese horario ya no se ofrece para este servicio. Recargá la página y elegí otro." — no un error de red genérico. Se dispara mapeando un servicio a un subconjunto de franjas en el panel y después reservando, desde una pestaña vieja, un horario que ese servicio ya no cubre.
result: [pending]

## Summary

total: 3
passed: 2
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
