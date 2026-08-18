---
created: 2026-08-18T00:00:00.000Z
title: "Las suites de abono fallan distinto en cada corrida del suite completo"
area: testing
source: Regression gate de la Phase 16 (v0.27) — medido, no sospechado
files:
  - test/abono-create.test.ts
  - test/abono-cron.test.ts
  - test/abono-generation.test.ts
  - test/helpers/booking-fixtures.ts
---

## Qué pasa

`npx vitest run` (suite completo) falla en las tres suites de abono con un **conjunto distinto de
casos en cada corrida**. Corridas consecutivas, mismo código, misma base:

| Corrida | Fallos |
|---|---|
| A | 6 — `abono-create` 7 · `abono-cron` 1, 2, 3, 5 · `abono-generation` 3, 5 |
| B | 4 — `abono-create` 7 · `abono-cron` 1 · `abono-generation` 3, 5 |

Y **aisladas pasan**: `test/abono-generation.test.ts` sola dio **11/11 dos veces seguidas**. Corriendo
las tres suites de abono juntas (sin el resto) apareció un fallo **distinto otra vez** — el caso 8,
`tope duro: un rango de 50 años`, que esperaba 0 y midió 14.

Los síntomas son de **conteo**, no de timeout: `expected 5 to be 11`, `expected 0 to be 14`. Turnos de
más, no lentitud.

## No lo causó la Phase 16 — está medido

El control: `git checkout 06229f1 -- test/` (los archivos de test **anteriores** a la fase) + suite
completo → **siguen fallando 3 casos de abono** (`abono-create` 7, `abono-cron` 1 y 2), además de los
3 rojos declarados del gate. `test/` se restauró limpio después.

Dos razones más por las que la fase queda descartada como causa:

1. El único helper compartido que tocó la Phase 16 es `seedSimultaneousService`, y el cambio es
   **aditivo** (`serviceId?` opcional con default al de siempre). `seedOneTenant`, `teardownOneTenant`,
   `seedTimeBlock` y `purgeAbonos` —los que importan las suites de abono— no se tocaron.
2. Un cambio determinista de trigger SQL **no puede** producir un conjunto de fallos que varía entre
   corridas.

## Hipótesis (sin confirmar)

Vitest corre los archivos en paralelo contra **el mismo Postgres local**, y las suites de abono
comparten tenant/servicio o pisan rangos de fechas. La generación de abonos escribe muchos turnos, así
que es la que más superficie de colisión tiene. La flakiness probablemente **escala con la carga del
suite**, que es por qué se ve en el completo y no en aislado.

## Por qué importa arreglarlo, y no solo anotarlo

Mientras esté así, **el suite completo no sirve como gate**: cada fase nueva que corra `vitest run` va
a ver rojo en abono y va a tener que gastar corridas para demostrar que no fue ella. Esta fase gastó
cuatro. El costo se paga de nuevo en cada fase.

Peor: acostumbra a leer "3 rojos en abono" como ruido normal. El día que uno de esos rojos sea real,
no lo va a distinguir nadie.

## Caminos posibles

- Aislar por tenant: que cada archivo de abono siembre su **propio** `business_id` (ya existe
  `seedOneTenant`; habría que verificar que ninguna suite reusa uno fijo).
- O declarar `--no-file-parallelism` para el grupo de abono / el suite entero, midiendo primero cuánto
  cuesta en tiempo.
- Antes de elegir: **reproducir con el mismo seed** y confirmar la hipótesis de colisión. Es la trampa
  que este workstream ya registró tres veces — el fix propuesto se cae al medirlo.
