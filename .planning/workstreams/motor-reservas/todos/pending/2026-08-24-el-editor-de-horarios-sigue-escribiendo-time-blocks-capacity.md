---
created: 2026-08-24T00:00:00.000Z
title: "El editor de horarios sigue escribiendo `time_blocks.capacity`, una columna que ya no decide nada"
area: cleanup
severity: baja
source: secure-phase de la Phase 17 (v0.27) — hallazgo del auditor, fuera del register, verificado
files:
  - app/(dashboard)/agenda/agenda-client.tsx
  - supabase/migrations/068_service_capacity_unified_and_mode_gate.sql
---

## Lo que queda

La Phase 17 cerró la **lectura**: `capacityFor()` se borró y la grilla pasó a leer `services.capacity`
(POLISH-09, T-17-22). Pero la **escritura** sigue intacta:

```ts
// agenda-client.tsx ~345-358
await supabase.from('time_blocks').delete().eq('business_id', business.id)
// …
toInsert.push({ …, capacity: b.capacity || 1 })
await supabase.from('time_blocks').insert(toInsert)
```

Cada guardado de la grilla horaria hace *delete-all + insert* y reinserta la columna. Como la UI ya no
la expone, el valor es **siempre 1**.

## Por qué es baja severidad y no un bug

Desde la migración **068**, `time_blocks.capacity` **no decide nada**: el motor lee `services.capacity`
y el panel también, desde esta fase. Escribir un 1 en una columna que nadie consulta no rompe nada ni
tiene efecto en producción.

Lo que sí genera es **ruido de modelo**: el próximo que lea `agenda-client.tsx` va a encontrar un
campo `capacity` en `LocalBlock`, tres defaults que lo ponen en 1, un tipo que lo declara y un insert
que lo persiste — y no tiene forma de saber, desde ahí, que la columna está jubilada. Es exactamente
la clase de resto que hizo que la grilla mintiera durante dos fases.

## Alcance

- Sacar `capacity` de `LocalBlock`, de los tres defaults (`:152-154`), del tipo de `toInsert` (`:347`),
  del `insert` (`:358`) y del `copied` de "Copiar horario" (`:331`).
- La columna se **conserva** en la base: dropearla es una migración destructiva sin beneficio, y así lo
  decidió el ROADMAP de v0.27 ("Fuera de alcance").
- Verificar antes que **ningún otro consumidor** la escriba ni la lea — la landing y el agente de
  WhatsApp leen `business_hours`, que es otra tabla, pero conviene confirmarlo con un grep amplio.

## Nota

No es de la Phase 17 y no lo introdujo: es deuda que quedó de la Phase 15, cuando la 068 movió la
fuente del cupo y se conservó la columna. La 17 cerró la mitad que importaba —la lectura, que era la
que mentía— y dejó la escritura a la vista.
