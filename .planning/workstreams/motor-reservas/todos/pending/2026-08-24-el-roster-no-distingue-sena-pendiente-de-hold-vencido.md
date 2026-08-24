---
created: 2026-08-24T00:00:00.000Z
title: "El roster dice \"Seña pendiente\" también cuando el hold ya venció"
area: ux
severity: baja
source: Observación del dueño en la ronda 2 de UAT de la Phase 17 (v0.27)
files:
  - app/(dashboard)/agenda/agenda-client.tsx
  - lib/agenda-occupancy.ts
---

## Lo que vio el dueño

En la agenda, el badge del slot decía **`2/6`** sin el sufijo `· 1 sin seña`. Al abrir el roster
aparecían **tres** personas, y la tercera con el chip **"Seña pendiente"**.

Sus palabras: *"No aparece 1 sin seña, aparece directamente como que hay 2/6 y recién al abrir el
roster te das cuenta que hay uno sin seña."*

## Por qué pasa — y por qué el contador NO está mal

El hold de esa reserva **ya había vencido** (`expires_at` en el pasado; medido: venció 18:05, se miró
19:25). Un hold vencido **no ocupa lugar**, así que:

- el contador no lo cuenta ⇒ `2/6` es correcto: hay 4 lugares realmente libres;
- `hasPending` tampoco lo cuenta ⇒ el badge se queda neutro, sin el sufijo, también correcto;
- pero el roster **sí lo lista**, con el chip de su `status`, que sigue siendo `pending_payment`.

Es el comportamiento que `17-05-SUMMARY.md` ya había declarado: *"la lista puede tener más filas que el
contador cuando hay holds vencidos, y el chip de estado de cada fila lo explica"*. **El problema es que
el chip NO lo explica**: dice "Seña pendiente", que se lee como *"me debe la seña"*, cuando lo que pasó
es *"esa reserva caducó y el lugar volvió a estar libre"*. Son dos cosas distintas y el dueño actuaría
distinto en cada una.

## Alcance

**No es un defecto de la Phase 17** y no es de layout: el motor y los dos contadores dicen la verdad.
Es de **copy/estado**, y aparece sólo en la ventana entre que un hold vence y que el cron
`/api/cron/cancel-expired` lo cancela — que en producción es de horas (el cron es diario, límite de
Vercel Hobby), y en local puede ser indefinida porque el cron no corre.

## Caminos posibles

- El chip distingue los dos casos: `Seña pendiente` mientras el hold vive, y algo como `Reserva vencida`
  (en tono neutro/apagado, no de alarma) cuando ya expiró. El dato ya está en la fila: no hace falta
  tocar la base.
- O el roster directamente no lista los holds vencidos — más simple, pero esconde información que al
  dueño puede servirle (alguien intentó reservar y no pagó).

Antes de elegir, mirar qué hace el resto del panel con `expires_at` vencido: si en otras pantallas ya
hay un criterio, seguir ése en vez de inventar uno nuevo acá.

## Nota de fixture (para la próxima UAT)

El fixture local le puso al hold **2 horas** de vigencia, y la UAT se corrió al día siguiente — por eso
el caso apareció "roto" cuando en realidad estaba vencido. **Sembrar los holds con vigencia larga
(30 días)** si el fixture va a sobrevivir a más de una sesión.
