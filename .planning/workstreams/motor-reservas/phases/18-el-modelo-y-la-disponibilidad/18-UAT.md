---
status: complete
phase: 18-el-modelo-y-la-disponibilidad
source: [18-VERIFICATION.md]
started: 2026-08-25T00:00:00Z
updated: 2026-08-25T14:50:00Z
---

## Current Test

[testing complete]

## Tests

### 1. El picker público oculta los horarios de la franja que no da el servicio
expected: En `/negocio-prueba`, lunes 31/08 — "Color" (no mapeado) NO muestra los horarios de 08:00 a 12:30 y SÍ los de 14:00 a 19:30; "Corte" (mapeado a la franja de la mañana) los muestra todos; y cualquier otro día muestra todo para los dos servicios (comodín).
verificado_por_api: |
  GET /api/booking/availability?slug=negocio-prueba&date=2026-08-31&serviceId=<Color> → full: ["08:00".."12:30"]
  GET ... serviceId=<Corte>                                                          → full: []
  GET ...date=2026-09-01 (martes, comodín), ambos servicios                          → full: []
result: pass

### 2. POST forjado a /api/booking/create contra el server real
expected: Un POST pidiendo "Color" el lunes 31/08 a las 10:00 (dentro de la franja que solo da "Corte") responde **400 `service_not_scheduled`** y no crea ningún turno — aunque el picker nunca lo haya ofrecido. El mismo POST a las 15:00 (franja comodín) SÍ crea el turno. El dueño, en cambio, puede seguir cargando a mano una excepción de "Color" a las 10:00 desde su panel (el alta manual sigue sin validar horario — exención deliberada D-04).
medido_contra_server_real: |
  POST /api/booking/create  {"serviceId": Color, "date":"2026-08-31","time":"10:00"}
    → HTTP 400  {"ok":false,"error":"service_not_scheduled"}   · turnos en ese horario: 0
  POST /api/booking/create  {"serviceId": Color, "date":"2026-08-31","time":"15:00"}
    → HTTP 200  {"ok":true,"appointmentId":"621c6944-…"}       · turno creado (control negativo)
  Exención del alta manual: NO se clickeó en el panel. Evidencia automatizada —
  caso 2 de `booking-service-window-backstop` (core sin el flag, mismo pedido, lo crea)
  + `git diff` vacío sobre `appointments/create/route.ts` y `lib/abono-generation.ts`.
result: pass

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[ninguno — los 2 tests pasaron]

## Hallazgos colaterales (no son gaps de esta UAT; van a secure-phase)

- **WR-03 CONFIRMADO POR MEDICIÓN.** El POST rechazado del Test 2 caso 1 dejó una fila
  huérfana en `clients` (`__uat_forjado`, 0 turnos). El insert de `clients` corre ANTES
  del core en `app/api/booking/create/route.ts`, así que **toda** request rechazada por
  el backstop `service_not_scheduled` ensucia la lista de clientes que el dueño ve en su
  panel — y el endpoint es público y anónimo. El code review lo había marcado como
  advertencia teórica; acá pasó a medido. Las filas de la prueba se borraron.
  (El guard de forma de CR-02 sí corre antes del insert de `clients`; este camino, no.)

## Cómo sembrar la fila (no hay UI hasta la Phase 19)

```bash
# 1. Elegir una franja y dos servicios del negocio de prueba
docker exec supabase_db_forjo-app psql -U postgres -d postgres -c \
  "select tb.id as block_id, tb.day_of_week, tb.start_time, tb.end_time, tb.business_id
     from time_blocks tb order by tb.day_of_week, tb.start_time;"
docker exec supabase_db_forjo-app psql -U postgres -d postgres -c \
  "select id, name, business_id from services order by name;"

# 2. Mapear la franja al servicio S1 (a partir de acá esa franja da S1 y SOLO S1)
docker exec supabase_db_forjo-app psql -U postgres -d postgres -c \
  "insert into time_block_services (business_id, time_block_id, service_id)
   values ('<BUSINESS_ID>', '<BLOCK_ID>', '<SERVICE_S1_ID>');"

# 3. Al terminar: volver todo a comodín
docker exec supabase_db_forjo-app psql -U postgres -d postgres -c \
  "delete from time_block_services;"
```

⚠ Ojo con el día: la franja mapeada tiene un `day_of_week` concreto (0 = domingo … 6 = sábado).
En el picker hay que elegir una fecha que caiga en ESE día, si no la prueba mide otra franja.
