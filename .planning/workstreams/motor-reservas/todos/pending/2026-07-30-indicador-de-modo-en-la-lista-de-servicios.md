---
created: 2026-07-30T00:00:00.000Z
title: "Indicador de modo de cupo en la lista de servicios"
area: frontend
source: UAT Phase 12 (2026-07-30)
files:
  - app/(dashboard)/settings/settings-client.tsx
---

## Problem

En `/servicios`, las tarjetas de la lista muestran nombre, duración y precio ("Corte · 30min ·
$5.000") y los chips de sede, pero **no dicen en qué modo de cupo está el servicio**. Hay que abrir
el editor de cada uno para enterarse.

Con el modo nuevo eso importa: un servicio en "Recurso simultáneo" con cupo 2 se comporta muy
distinto de uno grupal, y desde la lista son indistinguibles.

## Propuesta

Un badge en la tarjeta cuando el modo NO es el default — mismo criterio que ya usa la lista para
"Se ofrece en" (solo muestra lo que aporta información). Algo como `Simultáneo · 2` para
`simultaneous_resource`, y nada para el default.

Reusar el `Badge` de `components/ui` con una variante existente; no hardcodear hex ni inventar un
componente nuevo. El label va FIJO para todos los verticales (D-10 de la Phase 12): no rutear por
`lib/use-terminology`.

## Nota de dependencia

Si primero se hace
`2026-07-30-el-cupo-vive-en-dos-lugares-y-falta-el-modo-individual.md`, el badge debería
contemplar los tres modos (y seguir sin mostrar nada para `individual`, que sería el nuevo default).
Conviene hacerlo DESPUÉS de esa fase para no escribir el badge dos veces — o hacerlo ahora asumiendo
dos modos y aceptar el retoque.

## Alcance

Polish chico. Un archivo, sin migración, sin tocar el motor. `/gsd:quick` alcanza.
