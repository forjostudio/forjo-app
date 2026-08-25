---
status: testing
phase: 18-el-modelo-y-la-disponibilidad
source: [18-VERIFICATION.md]
started: 2026-08-25T00:00:00Z
updated: 2026-08-25T00:00:00Z
---

## Current Test

number: 1
name: Escenario OFRECE en el navegador — el picker público oculta los horarios de la franja que no da el servicio
expected: |
  Con `npm run dev` contra el Supabase LOCAL y una fila sembrada a mano en `public.time_block_services`
  (una franja de la mañana mapeada a UN solo servicio S1):
  - Abrir `/[slug]`, elegir el servicio **S2** (NO mapeado) → los horarios de esa franja NO aparecen en el picker.
  - Volver, elegir **S1** → SÍ aparecen todos.
  - Borrar la fila y recargar → todo vuelve a aparecer para ambos servicios (comodín = estado de hoy).
awaiting: user response

## Tests

### 1. Escenario OFRECE en el navegador — el picker público oculta los horarios de la franja que no da el servicio
expected: El picker público oculta visualmente los horarios de la franja mapeada solo para el servicio no cubierto, los muestra para el cubierto, y todo vuelve al estado de hoy al borrar la fila (comodín).
result: [pending]

### 2. Escenario ACEPTA — POST forjado a /api/booking/create contra el server real
expected: Un POST (curl o consola del navegador) pidiendo S2 en un horario de la franja mapeada a S1, con la fila de la puente puesta, responde **400 `service_not_scheduled`** y no crea ningún turno. El dueño, en cambio, puede seguir cargando a mano una excepción de S2 en esa misma franja desde su panel (el alta manual sigue sin validar horario — exención deliberada D-04).
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

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
