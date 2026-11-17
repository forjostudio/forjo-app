---
status: complete
phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos
source: [03-VERIFICATION.md, 03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md, 03-06-SUMMARY.md, 03-07-SUMMARY.md, 03-08-SUMMARY.md, 03-09-SUMMARY.md, 03-10-SUMMARY.md, 03-11-SUMMARY.md, 03-12-SUMMARY.md, 03-13-SUMMARY.md, 03-14-SUMMARY.md, 03-15-SUMMARY.md, 03-16-SUMMARY.md, 03-17-SUMMARY.md]
started: 2026-11-16T23:30:00Z
updated: 2026-11-17T00:30:00Z
---

<!--
Por qué este archivo y no 03-UAT.md. Las rondas de la fase se corrieron en celular real y quedaron
narradas en 03-UAT.md (ronda 1, 2026-10-15) y 03-UAT-2.md (rondas 2 y 3 + re-pruebas hasta el
2026-11-16), con los guiones 03-UAT-GUION-2/3.md. Esos documentos son la evidencia y no se reescriben.
Este archivo es el CIERRE en el formato de /gsd-verify-work: un ítem por criterio, con el resultado del
dueño citado por sección. Los entregables automáticos de los 17 SUMMARY (tests, sondas, gates) están
cubiertos en 03-VERIFICATION.md (passed 6/6) y no se presentan como checkpoint.
Nota de tooling: el clasificador `uat.classify-coverage` del CLI marca `validation_failed` los bloques
`coverage:` de los SUMMARY porque usan `deliverable:` y una verificación como objeto (el esquema pide
`id` + `description` + lista). Es formato, no un fallo de verificación.
-->

## Current Test

[testing complete]

## Tests

### 1. Los dos niveles en el teléfono (criterio 1, MOB-04)
expected: `Inicio → Más → una sección de Más → atrás` deja Más abierto y un atrás más cae en Inicio; `Inicio → un destino de la barra → atrás` cae en Inicio sin pasar por Más.
result: pass
source: owner
evidence: 03-UAT-2.md § ronda 3 re-corrida (2026-10-29), bloques 1-3 en Android Chrome; bloque 6 en iPhone Safari («esta ok en iphone»)

### 2. El cruce entre niveles sin basura ni atrás muertos (criterio 2, MOB-04)
expected: desde una sección abierta por Más, tocar un destino de la barra deja el atrás cayendo en Inicio; tocar el destino activo no apila (NAV-08); ningún recorrido necesita dos atrás para que pase algo visible.
result: pass
source: owner
evidence: 03-UAT-2.md § ronda 3 (2026-10-29), bloques 1-2 (G2-1 y G3-1 cerrados); bloque 6 iPhone

### 3. El aviso de salida en Inicio, camino 1 (criterio 3, MOB-05)
expected: con un toque previo, el primer atrás en Inicio avisa y no sale y el segundo sale; el aviso no vence solo; el ciclo repetido sigue funcionando; entrando directo / recargando sale sin aviso (costo declarado en 03-DECISION-UAT-3.md).
result: pass
source: owner
evidence: 03-UAT-2.md § ronda 3 (2026-10-29) 1.3-1.5; § «Re-prueba tras el 03-14» (2026-10-29) 1.6; § «Re-prueba tras el 03-16» (2026-11-16, producción) 1.5 ✅

### 4. Overlays, selectores, calendario y teclado cierran antes de navegar (criterio 4, MOB-06)
expected: con un overlay, selector de hora, fecha o calendario abierto, el atrás lo cierra y no navega; bajar el teclado no gasta el aviso.
result: pass
source: owner
evidence: 03-UAT.md (2026-10-15) bloque E, ítems 10-13 `[OK]` en Android; 03-UAT-2.md § «Re-prueba tras el 03-14» (2026-10-29) 3.2 ✅ (Android) y § ronda 3 bloque 6 (iPhone); ver advertencia 3 de 03-VERIFICATION.md (alcance de 10-13)

### 5. El aviso de cambios sin guardar y «Salir sin guardar» (criterio 4, MOB-06)
expected: con cambios sin guardar, el atrás avisa; «Salir sin guardar» aterriza donde manda la política nueva (en /agenda y /web).
result: pass
source: owner
evidence: 03-UAT-2.md § ronda 2 (2026-10-27) ítem 15 ✅; bloque 6 iPhone

### 6. Escritorio sigue igual, con el residuo acotado (criterio 6)
expected: el recorrido del sidebar da lo de siempre; el residuo de un solo caso (salir con cambios hacia Inicio desde el sidebar) es el declarado; el atrás de teclado real deja el aviso a la vista y el segundo sale.
result: pass
source: owner
evidence: 03-UAT-2.md § «Re-prueba tras el 03-14» (2026-10-29) 4.1 y 4.2 ✅; § «Re-prueba tras el 03-16» (2026-11-16, producción) 4.2 y 4.3 ✅

### 7. Cerrar un diálogo de Inicio con la X re-arma el aviso (G3-7)
expected: recién entrado a Inicio, abrir el diálogo del banner, cerrarlo con la X o el fondo, y atrás: avisa y no sale; el segundo sale.
result: pass
source: owner
evidence: 03-UAT-2.md § «Re-prueba tras el 03-16» (2026-11-16, producción, Android) 3.3 ✅ la primera vez (la segunda, cerrando con el atrás, es G3-10: costo declarado)

### 8. El modal de planes entra en la pantalla del celular (G3-9)
expected: «Activar plan» abre el modal con el título y la X a la vista, la lista scrollea hasta Pro, el pie se ve; cerrado con la X, el atrás avisa y el segundo sale.
result: pass
source: owner
evidence: 03-UAT-2.md § «Re-prueba tras el 03-17» (2026-11-16, producción, deploy f8fa76f, Android) 3.4 ✅ «Todo bien»

### 9. Cerrar el diálogo con el atrás (G3-10) — costo declarado, no fallo
expected: cerrar el diálogo con el atrás deja el aviso sin armar (el atrás siguiente sale sin aviso); con un toque en Inicio después, el atrás avisa — también si el cierre fue enseguida de abrirlo.
result: pass
source: owner + medido
evidence: decisión del dueño 2026-11-16 (03-DECISION-UAT-3.md, «costo del camino 1»); medido en la-absorcion-que-no-absorbe-medida.md (i) `veredicto G3-10: otro` y quick 261116-t5o `veredicto R2-WR-02: arma` (entradas_salteadas=0)

### 10. iPhone / Safari, después de los arreglos tardíos — el 3.3 y el 3.4 en producción
expected: en el iPhone, en producción: (a) el 3.4 del guion (modal de planes: título, X, scroll hasta Pro, pie; cerrado con la X, el atrás avisa y el segundo sale; no tocar «Elegir»); (b) el 3.3 (diálogo del banner cerrado con la X o el fondo, atrás avisa). El pase de iPhone del 2026-10-29 es anterior a G3-5/G3-7/G3-9/G3-10 (advertencia 4 de 03-VERIFICATION.md). Si en Safari el aviso no aparece, es la incógnita A11 declarada, no una expulsión.
result: pass
source: owner
reported: "pass, todo bien" (2026-11-16, iPhone / Safari, producción, deploy f8fa76f)

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
