---
audit_acknowledged:
  milestone: v0.31
  at: 2026-11-19
  gap_snapshot: "unknown::scenarios=0"
---

# Decisión del dueño durante la UAT de la fase 3 — 2026-10-15

## La colisión que la UAT destapó

Parado en **Inicio con historia debajo**, MOB-04 y MOB-05 no pueden ser verdad a la vez:

- **MOB-04**: `Más → Inicio → atrás` vuelve a **Más**.
- **MOB-05**: en Inicio el atrás **avisa antes de salir**.

Es la **imprecisión declarada #12** (`.planning/WINDOWS.md`), tocada desde el otro lado: el ítem **H**
de la UAT esperaba volver a Más y le saltó el aviso de salida.

## Lo decidido: opción (a)

**El sentinel de salida se arma SÓLO si no hay nada nuestro debajo.** Se respeta MOB-04, y el aviso
aparece únicamente cuando el atrás de verdad te saca del panel.

**Descartada (b)** — que el sentinel mande siempre en Inicio: más simple y predecible, pero cambiaba
lo que MOB-04 prometía y dejaba el aviso apareciendo cuando no ibas a salir.

## El problema conocido de (a), y por dónde sale

**No hay API confiable** para preguntarle al navegador si hay algo debajo: `history.length` cuenta
también las entradas de **adelante**. Es la misma razón por la que el caso de entrada directa está
aceptado desde v0.30 (E-7).

**El camino:** rastrearlo nosotros. La app **ya lleva la cuenta de lo que empujó** — `frjUnder`
guarda la **ruta** que quedó debajo (no un booleano), justamente para el caso degenerado. Saber si
hay algo **nuestro** debajo está al alcance con lo que ya existe; no hace falta una marca nueva.

⚠ Esto **no cierra** la imprecisión #12 para el caso en que lo de abajo sea una entrada **ajena**
(otro sitio): ahí seguimos sin poder saberlo, y el aviso va a aparecer igual. Eso queda aceptado.

## Alcance

Esta decisión gobierna el arreglo de los ítems **H**, **G19** y **G20** de la UAT. Los ítems **D7**,
**D8** y **F15** son defectos aparte (el sentinel conviviendo con el colapso de rama) y NO se
resuelven con esta decisión.
