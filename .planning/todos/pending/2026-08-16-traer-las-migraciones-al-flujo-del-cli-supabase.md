---
created: 2026-08-16T00:00:00.000Z
title: "Traer las migraciones al flujo del CLI: hoy `db push` es un arma cargada"
area: infra
source: Pregunta del dueño (2026-08-16) — "¿puedo aplicar con npx supabase db push --linked como en el otro proyecto?"
files:
  - supabase/migrations/
  - supabase/.temp/project-ref
---

## La pregunta que lo originó

El dueño usa `npx supabase db push --linked` en **otro** proyecto y preguntó si puede hacer lo mismo acá.
**No puede**, y el motivo vale registrarlo porque no es obvio.

## Por qué hoy no se puede

**Producción no tiene `supabase_migrations.schema_migrations`** — la tabla donde el CLI anota qué
migraciones corrieron. Sin ella, `db push` asume que **no se aplicó ninguna** y trata de replayar el
historial entero: **31 archivos**, empezando por un `00000000000000_baseline.sql` de **3.124 líneas**
con el esquema completo (27 tablas, 35 policies).

**Y el proyecto SÍ está linkeado** (existe `supabase/.temp/project-ref`), así que el comando **no falla
por falta de link**: conecta y ejecuta.

**Qué pasaría, en concreto:** los 27 `CREATE TABLE` del baseline llevan `IF NOT EXISTS` y pasarían de
largo en silencio. Los 35 `CREATE POLICY` **no**, así que abortaría en la primera policy repetida. Eso
deja el peor escenario: **aplicación parcial**, con una tabla de tracking recién creada afirmando cosas
falsas — y en las 30 migraciones siguientes hay backfills y `ALTER TABLE` que no son todos re-corribles.

**La causa de fondo:** el proyecto es brownfield. Las migraciones se vienen aplicando **a mano** desde
antes de que existiera el flujo del CLI, así que la base remota nunca registró nada. Hoy el repo y la
base coinciden **por convención**, no porque haya un mecanismo que lo garantice.

## Por qué vale la pena arreglarlo

El costo de la convención ya se cobró: la **068 se aplicó fuera de orden** (2026-08-14) y rompió la
creación de servicios en producción hasta que se deployó el código. Un flujo con tracking real hace
ese error **imposible**, no solo desaconsejado.

## El camino

`supabase migration repair --status applied <version>`, una por una, para las 31 migraciones ya
aplicadas. A partir de ahí `db push` funciona como en el otro proyecto.

## Por qué NO se hace al pasar

1. **Ensayarlo primero contra `forjo-staging`**, que ya existe, y recién después tocar prod.
2. Un `repair` mal hecho —marcar como aplicada una que no lo está, u omitir una— deja repo y base
   desincronizados **sin que nada avise**. Es *peor* que el estado de hoy, donde al menos la convención
   es explícita y el runbook la fuerza.
3. Hay que verificar **antes** que el esquema de prod coincide de verdad con el replay del repo. Si
   divergieron en algún punto de los últimos 31 archivos, el `repair` congela la divergencia como si
   fuera correcta.
4. No hacerlo con una migración pendiente de aplicar.

## Alcance

Tarea de infra, propia. Encaja con el pendiente ya registrado de **staging hosteado + CI** ([[infra-testing-roadmap]]).
Mientras tanto: **las migraciones van a mano, en orden, por el SQL editor**, con el runbook de la fase
como procedimiento.
