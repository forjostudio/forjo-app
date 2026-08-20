---
created: 2026-08-20T00:00:00.000Z
title: "Dos clases grupales a la misma hora, sin profesional, compiten por el mismo espacio de `seat`"
area: database
severity: media
source: Hallazgo del ejecutor de 17-05 (Phase 17), verificado contra el Postgres local
files:
  - supabase/migrations/011_*.sql
  - supabase/schema.sql
---

## El índice, tal como está instalado

```sql
CREATE UNIQUE INDEX appointments_no_double_booking
  ON public.appointments
  USING btree (business_id,
               COALESCE(professional_id, '00000000-0000-0000-0000-000000000000'::uuid),
               date, "time", seat)
  WHERE (status = ANY (ARRAY['confirmed','pending_payment']));
```

**No incluye `service_id`.**

## Qué implica

Cuando un turno **no tiene profesional asignado**, `COALESCE` lo manda al UUID centinela, así que la
clave efectiva es `(negocio, centinela, fecha, hora, seat)`. Dos **clases grupales distintas** del mismo
negocio a la **misma hora** —yoga y pilates a las 09:00, sin profesional— comparten ese espacio: el
`seat 0` de una choca con el `seat 0` de la otra y el segundo insert rebota con `23505`, que la app
traduce a `slot_taken`.

El dueño ve "horario ocupado" en una clase que tiene lugares libres.

## Por qué recién aparece ahora

Es **alcanzable desde la v0.27**. Antes, el cupo grupal salía de `time_blocks.capacity`, que en
producción siempre valió 1, así que una clase grupal con cupo ≥ 2 era **indeclarable**. La 068 la volvió
declarable con dos clicks, y la Phase 17 invita a hacerlo al explicar los modos en pantalla.

Es el mismo patrón que ya se pagó una vez en este milestone: **la 068 abrió una configuración nueva y
las protecciones viejas filtraban por un criterio que no la contemplaba** (fue el blocker central del
code review de la Phase 15, arreglado en la 069).

## Qué NO es

- **No es un bug del panel.** La Phase 17 no lo introduce; lo destapa. El módulo `lib/agenda-occupancy.ts`
  agrupa **por `(fecha, hora, service_id)`**, o sea que la grilla ya modela dos clases separadas
  correctamente — es la base la que no las distingue.
- **No es cross-tenant.** El `business_id` está en la clave.

## A medir antes de elegir un arreglo

Agregar `service_id` al índice parece obvio y **por eso hay que medirlo**: este workstream ya registró
**tres** veces un fix propuesto que se cayó al reproducirlo. Preguntas abiertas:

- ¿Qué pasa con los turnos que hoy tienen `service_id` nulo? Entran al índice con NULL y un índice
  único trata cada NULL como distinto — podría **aflojar** una protección existente.
- ¿Interactúa con el EXCLUDE gist 013 y con los gates espejo de las migr. 042/058/062/063/064, que ya
  tuvieron que resolver la ambigüedad de `is_group`?
- ¿Es realmente el índice el que tiene que distinguir servicios, o el modelo correcto es que una clase
  grupal **tenga** profesional o espacio asignado?

Reproducir primero, con control negativo, contra Postgres real. No es una migración de una línea.
