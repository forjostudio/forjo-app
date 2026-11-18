---
phase: quick-261118-jdq
plan: "01"
subsystem: panel-nav / Finanzas (tabs en la URL)
status: complete
tags: [obs-G1, scroll, tabs, finanzas, css, sonda-cdp]
requirements: [MOB-09]
requirements-completed: []
dependency-graph:
  requires: [04-06 (G-04-6, el fallback con nodo), 04-08 (re-UAT 8/8 y obs-G1)]
  provides: [min-h-dvh en los tres TabsContent de Finanzas, recorridos G1-* en la sonda del scroll, candado obs-G1]
  affects: [app/(dashboard)/finances/finances-client.tsx]
tech-stack:
  added: []
  patterns: [medir primero con esperados commiteados antes del arreglo, alto minimo por panel con la unidad dvh del layout]
key-files:
  created: []
  modified:
    - .planning/debug/probes/g04-scroll-y-recarga.mjs
    - test/panel-tabs.test.ts
    - app/(dashboard)/finances/finances-client.tsx
    - .planning/debug/tabs-en-la-url-medida.md
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md
decisions:
  - "obs-G1 se cierra con min-h-dvh en cada TabsContent de Finanzas (opcion A del dueno): dvh = la unidad del layout del panel; ni vh/svh/calc ni la raiz del <Tabs> ni components/ui/tabs.tsx"
metrics:
  duration: 20min
  completed: 2026-11-18
plan_head_before: ccb8979f0d08138a765b3f6b28264e004f8107bf
actuals:
  tokens: 9000
  tasks: 3
  commits: 3
---

# Quick 261118-jdq: obs-G1 — el alto mínimo de los tabs de Finanzas Summary

`min-h-dvh` en los tres `TabsContent` de Finanzas: al cambiar de Turnos (22 turnos) a un tab vacío el documento ya
no queda más corto que el scroll del toque. Antes el navegador recortaba el scroll 281/298 px en móvil y 244 px en
escritorio. Rojo 3/3 medido con el código de antes, verde 8/8 con el arreglo, G-04-6 sin regresión.

## Commits

| # | Hash | Asunto |
|---|------|--------|
| 1 | `4f114ba` | test(quick-261118-jdq): obs-G1 — la sonda del scroll mide el recorte por alto de los tabs de Finanzas y el candado del alto minimo, antes del arreglo |
| 2 | `05733dc` | fix(quick-261118-jdq): los tabs de Finanzas tienen el alto de la pantalla como minimo (obs-G1) |
| 3 | `c12091f` | docs(quick-261118-jdq): obs-G1 medido y cerrado — rojo 3/3 y verde 8/8 en (k), deferred-items resuelto |

`git rev-list --count ccb8979..HEAD` = 3. **No se pusheó**: sale en el mismo push que R2-WR-01.

## El entorno y los datos

- 2026-11-18, ~14:16-14:35 hora de Argentina. Pila local de forjo-app arriba (API 200, sin `supabase start`, sin
  escrituras: sólo `select`). Turno libre, sin espera. Sin `next dev` de este repo vivo: cada sonda levantó el suyo en
  el 3031 y lo cerró (3031/9335 libres al salir). Chrome/157.0.8103.52, node v24.15.0.
- Turnos no cancelados de `negocio-prueba` por mes: 2026-03 1 · 04 3 · 05 5 · 06 8 · 07 18 · 08 15 · **09 22** · 10 5;
  noviembre 0. `manual_sales` 0, `expenses` 0.
- `irAlMesConTurnos` retrocedió dos veces con «Mes anterior» y eligió, en los 6 recorridos medidos:
  `mes con turnos: septiembre 2026 turnos=22 ventas=0 egresos=0 pasos=2`.

## El rojo (código de antes, `paneles con alto minimo: 0`)

`etiqueta=rojo-obs-g1 · recorridos: 3 · coinciden con la hipotesis: 3` (rc 0)

| recorrido | toque 1 | alto | recorte | salto / Next |
|---|---|---|---|---|
| G1-ventas-movil | Ventas 1886 → 1605 (-281) | 4008 → 2504 | si | no / no |
| G1-egresos-movil | Egresos 1886 → 1588 (-298) | 4008 → 2504 | si | no / no |
| G1-ventas-escritorio | Ventas 1094 → 850 (-244) | 3026 → 1650 | si | no / no |

Cero escrituras de scroll en todos los toques: es el navegador recortando, no la app.

## El verde (con el fix, `paneles con alto minimo: 3`)

`etiqueta=verde-obs-g1 · modo=tras-el-fix · recorridos: 8 · coinciden con lo esperado tras el fix: 8` (rc 0)

- **Los 3 G1-\***: los dos toques con delta 0, `recorte_toque1`/`recorte_toque2` = no, `salto_*` = no, `next_*` = no.
  Móvil: 1886 → 1886 (alto 4008 → 3264) y el segundo toque 1858/1850 sin moverse. Escritorio: 1094 → 1094 (alto
  3026 → 2366).
- **Los 5 de G-04-6 en OK**, con cero escrituras de Next en el primer toque: F-blanda-mas-movil, F-directa-movil,
  F-tarjeta-movil y F-sidebar-escritorio con delta 0 (también se fueron los 37/18/55 px del recorte del viewport
  emulado); N-negocio-borde-movil igual que antes (Cobros 187 → 0 sólo informativo, Negocio queda fuera del alcance).
- `--autotest`: 5/5. Sonda de la app, `R-T-finanzas-*`: 4/4 en OK (`recorridos medidos: 4 · coinciden con lo esperado: 4`).

## Los gates

| Gate | Resultado |
|------|-----------|
| T1 estático | rc 0: 0 líneas quitadas, 3 G1, esperados textuales 1+1, `panel-tabs` 1 rojo (obs-G1) / 84 verdes, autotest 5/5 |
| T1 rojo (turno) | rc 0: 3/3 con la hipótesis, `recorte_por_alto: si` ×4, `mes con turnos` ×3 |
| T2 estático | rc 0: 3 líneas quitadas, que son las tres TabsContent; 3 nuevas; la línea `<Tabs>` intacta; criterio 5 vacío; sólo cambió finances-client.tsx; tsc limpio; eslint `react-hooks/set-state-in-effect=1`; pura 77/1845; 8 suites 8/671; panel-tabs 85; build ok, sin Suspense |
| T2 verde (turno) | rc 0: 8 OK, 8/8, 0 recortes en los G1, autotest 5/5, app 4/4 |
| T3 docs | se corre con este SUMMARY escrito (ver Self-Check) |

## La unidad y por qué

`min-h-dvh` (100dvh) en cada panel, no en la raíz de los tabs. `dvh` es el viewport visible y la misma unidad que
el envoltorio y el `<main>` del layout del panel. Con el mínimo, el alto del documento llega por lo menos al borde
del panel más una pantalla, así que el scroll máximo nunca baja del scroll con el que se tocó el tab. Queda margen
(~96 px en móvil, 56 px en escritorio) aun con el `innerHeight` inflado a 899/916 del emulado. En la raíz, la fila de
triggers contaría adentro del mínimo. `components/ui/tabs.tsx` y `finances/page.tsx` no se tocaron.

## Deviations from Plan

Sin desvíos de comportamiento. Dos detalles del instrumento, ambos dentro de lo que pedía la acción:
- `irAlMesConTurnos` lee los conteos con una espera de "quieto" (`conteosQuietos`: página cargada y mismos conteos,
  mes y alto en 4 lecturas). Si la lectura se hacía antes de que terminara el fetch del mes, el conteo podía ser
  viejo. Va agregada a lo que pedía el plan.
- Ninguna regla de PARAR se disparó (P-0/P-1/P-2/P-3/P-7) y ningún `esperado` se tocó después de medir.

## Lo que NO cierra / residuos

- El teléfono real: la UAT del dueño va con R2-WR-01, después del push conjunto.
- Negocio → Cobros sigue con su `recorte_por_alto` informativo (el dueño acotó a Finanzas).
- El desborde horizontal de Finanzas a 390 px sigue abierto (su propia entrada en `deferred-items.md`).
- Costo aceptado: un tab vacío deja hasta una pantalla de blanco debajo de su aviso.
- `imprimirToque` sigue diciendo «informativo, no se juzga» en el renglón del recorte, también en los `G1-*`, donde
  sí se juzga por su `esperado`. Se dejó así porque la sonda sólo podía agregar líneas; está aclarado en `(k)`.

## Logs

- Rojo: `C:\Users\franc\AppData\Local\Temp\tmp.ixVn9KQEmO\rojo-obs-g1.txt`
- Verde del scroll: `C:\Users\franc\AppData\Local\Temp\tmp.4uif2DaQXG\verde-obs-g1.txt`
- App: `C:\Users\franc\AppData\Local\Temp\tmp.4uif2DaQXG\app-finanzas-obs-g1.txt`
- Copias de los tres en `C:\Users\franc\AppData\Local\Temp\claude\19a1c3eef8049c86\e3541fb4-9838-45ba-8edf-fb689e438b9e\scratchpad\`

## Self-Check: PASSED

Los commits 4f114ba, 05733dc y c12091f existen; los cinco archivos modificados existen; el gate del task 3 da rc 0.
