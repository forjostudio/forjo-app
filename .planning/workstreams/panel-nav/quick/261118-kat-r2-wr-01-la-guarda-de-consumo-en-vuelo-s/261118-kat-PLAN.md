---
phase: quick-261118-kat
plan: "01"
type: execute
wave: 1
depends_on: []
quick_id: 261118-kat
files_modified:
  - test/panel-tabs.test.ts
  - .planning/debug/probes/g04-scroll-y-recarga.mjs
  - .planning/debug/tabs-en-la-url-medida.md
  - lib/panel-history.ts
  - test/panel-branch.test.ts
  - lib/panel-history.test.ts
  - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md
  - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-SECURITY.md
autonomous: false
# La guarda de consumo en vuelo sirve a los tres grupos de tabs (Negocio y Configuración = MOB-08, Finanzas = MOB-09).
# Se LISTAN, no se marcan: los dos están Complete desde la re-UAT 8/8 del 04-08. El SUMMARY lleva requirements-completed: [].
requirements: [MOB-08, MOB-09]

estimate:
  tokens: 120000
  raw_tokens: 120000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Los tres casos de R2-WR-01 quedaron MEDIDOS con el código de antes y con los esperados commiteados en `test(quick-261118-kat)` antes de la primera corrida que los juzga: el caso 2 y el caso 3 (los dos sentidos, por NAV-08 y por B1) en el simulador de `test/panel-tabs.test.ts`, que corre `applyPanelView`, `consumeOwnedPanelEntry` y `runBranchNavigation` REALES con `backAsincrono`; el caso 1 en Chrome por CDP (`K1-bfcache-cruce`, la marca forzada sobre una entrada con otro documento debajo). `## (l)` lleva la línea `veredictos (l): caso 1=… · caso 2=… · caso 3a=… · caso 3b=…`, coherente con lo medido"
    - "Se arregla sólo lo que reprodujo, y para el caso 1, si no reproduce, sólo lo que elija el dueño en el checkpoint: un `back()` que tira suelta la guarda; con un consumo en vuelo, `consumeOwnedPanelEntry` no vuelve a retroceder (devuelve `true` sin retroceder) y un toque de tab durante el retroceso del menú o de B1 da `none`. Un caso que no reproduce no deja código"
    - "B1 queda igual: el segundo paso de `consume-view-then-navigate` re-decide desde el aterrizaje, también cuando el consumo sale de adentro de su propio `popstate` (dos fichas apiladas) y en el retroceso triple. `lib/panel-branch.ts` no cambia. R-B1-* 4/4, R-T-* 12/12 (la única FALLA es la declarada R-G3-10-primer-toque-atras-pronto), estática 18/18, scroll 8/8"
    - "No cambia ninguna aserción de un plan anterior salvo UNA declarada: la cuenta de oyentes del B1 en `test/panel-branch.test.ts`, y sólo si se arregla el caso 3. El bloque `R2-WR-01 — los tres casos` queda idéntico desde su commit"
    - "El docblock de la guarda ya no promete lo que el código no da (las garantías de las L998-999 y L1000-1002). Dice qué cubre cada salida y cuál es el residuo, y el de `consumeOwnedPanelEntry` ya no dice que el módulo no escucha el evento de historial (IN-05)"
    - "Sin regresión: `tsc` limpio, eslint por archivo en verde, pura >= 77 archivos / >= 1854 casos, las 8 suites de historial >= 680, `panel-tabs` >= 94, build ok"
    - "Queda el registro: `(l)` con la medición, el arreglo y la línea `cierre (l)`; `deferred-items.md` con sus tres entradas resueltas (quedan 8 abiertas); `04-SECURITY.md` con AR-04-05 y AR-04-06 cerrados con el número, T-04-39 y T-04-40 al día y una fila nueva en el audit trail. Nada se pushea"
  artifacts:
    - path: test/panel-tabs.test.ts
      provides: "el simulador fiel al DOM (oyente quitado durante el despacho, sin duplicados), el drenaje de la guarda entre casos (IN-02), el `describe('R2-WR-01 — los tres casos …')` con los 9 casos K/NR y, si hay arreglo, el `describe('R2-WR-01 — los candados del arreglo …')`"
    - path: .planning/debug/probes/g04-scroll-y-recarga.mjs
      provides: "el recorrido `K1-bfcache-cruce` y la primitiva `tocarTabUnaVez`"
    - path: lib/panel-history.ts
      provides: "el arreglo de lo que reprodujo (`try`/`catch` del retroceso, la guarda compartida con `consumeOwnedPanelEntry`, la salida por `pageshow` si corresponde) y los docblocks corregidos"
    - path: .planning/debug/tabs-en-la-url-medida.md
      provides: "`## (l)`: la medición de los tres casos, la decisión del caso 1, el arreglo, el verde y `cierre (l)`"
    - path: .planning/workstreams/panel-nav/quick/261118-kat-r2-wr-01-la-guarda-de-consumo-en-vuelo-s/261118-kat-SUMMARY.md
      provides: "el resultado, los números y los residuos declarados"
  key_links:
    - from: "`consumeOwnedPanelEntry` (NAV-08 y el primer paso de B1)"
      to: "la guarda de `applyPanelView` (`consumoEnVuelo`)"
      via: "una sola memoria del módulo: con un consumo en vuelo, el menú no retrocede otra vez y el tab devuelve `none`"
    - from: "el `segundoPaso` de B1 (se engancha ANTES del consumo, `lib/panel-branch.ts:409-416`)"
      to: "la guarda que enciende `consumeOwnedPanelEntry`"
      via: "el chequeo de identidad del state (`estadoDelConsumo`): adentro del `popstate` de su propio recorrido el state ya cambió, así que la guarda se suelta ahí mismo aunque su oyente todavía no corrió"
    - from: "los casos K/NR del simulador"
      to: "los ejecutores reales"
      via: "`montarHistoria({ backAsincrono: true })`, con despacho fiel al DOM y `procesar()` antes de afirmar"
---

<objective>
Cerrar **R2-WR-01** (code review ronda 2 de la Phase 4, `04-REVIEW-2.md` WR-01) y su cruce con `consumeOwnedPanelEntry`
(IN-03), con lo que decidió el dueño el **2026-11-18** (no se reabre): **medir primero los TRES casos y arreglar sólo
los que reproduzcan.** Los que no reproduzcan se cierran con el número, como WR-04, y AR-04-05 y AR-04-06 de
`04-SECURITY.md` pasan de «aceptado con vencimiento» a «cerrado por mitigación» o «descartado medido».

Los tres casos:
1. **bfcache, sin `popstate`:** el retroceso de un consumo cruza de documento, la página vuelve de la bfcache con
   «adelante» (llega `pageshow`, no `popstate`) y la guarda sigue encendida, así que ningún tab responde.
2. **Un `back()` que tira:** la guarda queda encendida y el toque siguiente da `none`.
3. **El cruce con `consumeOwnedPanelEntry`, en los dos sentidos:** (a) se consume un tab y, antes del `popstate`, se
   toca la sección activa del menú (NAV-08) o Inicio en la barra (B1), lo que da un doble `back()`; (b) la inversa,
   primero el retroceso del menú o de B1 y después el tab por defecto, que vuelve a consumir.

Purpose: la guarda del 04-07 (G-04-7) cierra el doble retroceso entre dos toques de tab, pero su docblock promete que
nunca se traba y eso no se midió. Además, el menú y B1 retroceden por otra puerta que la guarda no ve. Si se trabara,
el panel quedaría sin responder. Si el cruce existe, un retroceso de más deja al dueño fuera de la sección y, con B1,
fuera del sitio (la cicatriz 2).

Output: el simulador fiel al DOM, los 9 casos K/NR y el recorrido K1 commiteados ANTES de medir (`test`); la
medición con sus veredictos en `(l)` (`docs`); el checkpoint del dueño si el caso 1 no reproduce; el arreglo de lo que
reprodujo con sus candados (`test`, luego `fix`); la no-regresión completa por el turno; y el registro final (`docs`).

**Fuera de alcance, a propósito:** R2-IN-04 (el `from` del render en la ficha de clientes; `clients-client.tsx` no se
toca); IN-01 (el comentario de E1/E2/E4); un tope de tiempo para la guarda (el dueño no lo eligió y el repo no usa
temporizadores en la historia); `lib/panel-branch.ts` (el diseño de abajo no lo necesita); cualquier UAT (la UAT corta
en el teléfono va después del push conjunto con obs-G1 y la arma el orquestador); ROADMAP, STATE y REQUIREMENTS.
</objective>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/workstreams/panel-nav/STATE.md
@.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-REVIEW-2.md
@.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-SECURITY.md
@.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md
@.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-07-SUMMARY.md
@.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-08-SUMMARY.md
@.planning/workstreams/panel-nav/quick/261118-jdq-obs-g1-alto-minimo-de-los-tabs-de-finanz/261118-jdq-SUMMARY.md
@AGENTS.md
@.claude/CLAUDE.md
@.claude/skills/convenciones-forjo/SKILL.md
</context>

<!-- plan-criteria-allow: R4 - ningun git va en una etapa de tuberia que se juzgue: cada git diff / git log / git show que funda un candado es una asignacion $(...) o alimenta un awk/sed de recorte; el escaner une segmentos a traves de las comillas simples de las regex ('a|b') y lee esa barra como una tuberia -->
<!-- planner-discipline-allow: pageshow -->
<!-- planner-discipline-allow: window.history.back() -->
<!-- planner-discipline-allow: if (consumoEnVuelo) return 'none' -->
<!-- planner-discipline-allow: status: open -->
<!-- planner-discipline-allow: ERROR-DEL-INSTRUMENTO -->
<!-- planner-discipline-allow: la sonda no pudo completar -->
<!-- planner-discipline-allow: NO-COINCIDE -->
<!-- planner-discipline-allow: FALLA -->
<!-- planner-discipline-allow: R-G3-10-primer-toque-atras-pronto -->
<!-- planner-discipline-allow: TypeError -->
<!-- planner-discipline-allow: esperado_si_HA: { cruzo_de_documento: 'si', b_vuelve_de_la_cache: 'si', tab_responde: 'no' }, -->
<!-- planner-discipline-allow: esperado_tras_el_fix: { cruzo_de_documento: 'si', b_vuelve_de_la_cache: 'si', tab_responde: 'si' }, -->
<!-- planner-discipline-allow: if (!oyentes.includes(o)) continue -->
<!-- planner-discipline-allow: if (oyentes.some((o) => o.fn === fn)) return -->
<!-- planner-discipline-allow: drenarPopstateDelStub?.() -->
<!-- planner-discipline-allow: import * as PB from '@/lib/panel-branch' -->
<!-- planner-discipline-allow: expect(ctx.enganchados).toHaveLength(1) -->
<!-- planner-discipline-allow: Page.backForwardCacheNotUsed -->
<!-- planner-discipline-allow: Page.navigateToHistoryEntry -->
<!-- planner-discipline-allow: forzado: -->
<!-- planner-discipline-allow: bfcache: -->
<!-- plan-criteria-allow: R1 - cada conteo exacto cuenta LINEAS a proposito: un caso K/NR por linea (9), un OK por recorrido (12 R-T, 4 R-B1, 18 E, 8 del scroll), un status por entrada de deferred-items (8 abiertas, 3 quitadas, 3 resueltas) y una linea de drenaje por afterEach (4); son formatos de una linea por item que el plan fija, y ninguno puede valer distinto en HEAD antes de ejecutar porque los items todavia no existen -->
<!-- (Page.backForwardCacheNotUsed, Page.navigateToHistoryEntry, forzado: y bfcache: son POSITIVOS: el gate 1 del task 1 exige >= 1 de los dos primeros en la sonda y el gate 2 exige >= 1 de los dos ultimos en el log de K1; el escaner los lee como negativos) -->
<!-- (pageshow es CONDICIONAL: el gate del task 3 lo NIEGA en el codigo sin comentarios de lib/panel-history.ts SOLO si no hay F1, y con F1 lo EXIGE; los actions lo nombran porque es el arreglo de F1. window.history.back() es POSITIVO y acotado a una region: con F3 tiene que aparecer exactamente UNA vez en el cuerpo de consumeOwnedPanelEntry. if (consumoEnVuelo) return 'none' es POSITIVO: la linea tiene que quedar. status: open se cuenta para exigir que queden 8 y que las unicas lineas quitadas de deferred-items sean tres de esas. ERROR-DEL-INSTRUMENTO, la sonda no pudo completar, NO-COINCIDE, FALLA, R-G3-10-primer-toque-atras-pronto y TypeError son salidas de las sondas y de vitest, no texto que el ejecutor escribe en un archivo juzgado: los actions los nombran para decir cuando PARAR. Los esperados, las tres lineas del simulador, la del drenaje y la del import son POSITIVOS: los gates exigen que aparezcan textuales. expect(ctx.enganchados).toHaveLength(1) es la UNICA linea vieja que se permite quitar, y solo con F3) -->

## Lo medido al planificar (2026-11-18, HEAD `5f36c46`, sólo lectura)

- **La guarda hoy** (`lib/panel-history.ts`): `let consumoEnVuelo = false` en la L933, `soltarConsumo()` sólo apaga
  la memoria (L936-938), la primera sentencia de `applyPanelView` es `if (consumoEnVuelo) return 'none'` (L1024) y la
  rama `consume` es `consumoEnVuelo = true`, el oyente `popstate` de disparo único y `window.history.back()` sin `try`
  (L1045-1049). `consumeOwnedPanelEntry` (L1214-1220) no lee la guarda: guarda ajena, guarda de la marca y
  `window.history.back()`. En el docblock: la garantía de que la guarda no se traba está partida en las L1001-1002, la
  de que el módulo «muere con el documento» en las L996-999, y el «NO se extiende» en las L1003-1007. El encabezado
  (L30-31) dice que escucha un solo `popstate` y la L1188 (IN-05) dice lo contrario. En el código sin comentarios no hay
  ningún `setTimeout`, `pageshow` ni `estadoDelConsumo`.
- **B1** (`lib/panel-branch.ts:405-422`): `segundoPaso` se engancha con disparo único ANTES de `consumeOwnedPanelEntry()`
  (L416 antes de L419). Su `reDecidir` es `decidirDesdeElAterrizaje` (L2028-2053), que vuelve a llamar a
  `runBranchNavigation`. Si en el aterrizaje sigue habiendo una subsección propia (dos fichas `?c=` apiladas, A→B empuja),
  el segundo `consumeOwnedPanelEntry` corre ADENTRO del `popstate` del primero, ANTES que cualquier oyente enganchado
  después. Es el orden que el arreglo tiene que respetar.
- **Los call sites de NAV-08:** `components/dashboard/panel-bottom-nav.tsx:194`, `components/dashboard/sidebar.tsx:105,149`,
  `app/(dashboard)/mas/mas-client.tsx:214,272` (todos `… && consumeOwnedPanelEntry()` ⇒ `e.preventDefault()`). El guard de
  cambios sin guardar (`unsaved-changes-guard.tsx:273`) llama a `runBranchNavigation` SIN `reDecidir`, y por eso la rama
  B1 se niega antes de llegar al consumo.
- **El simulador** (`test/panel-tabs.test.ts:137-218`): el despacho de `popstate` recorre una COPIA de los oyentes sin
  saltear los que se quitaron durante el despacho, y `addEventListener` no deduplica. Las dos cosas difieren del DOM.
  Hoy no cambian ningún resultado. El arreglo de abajo, en cambio, las ejercita. Los tres `afterEach` que usan el
  simulador (L250, L333, L751) sólo hacen `vi.unstubAllGlobals()`, que es el IN-02. `panel-tabs`: 85 casos en verde.
- **Los stubs viejos:** `lib/panel-history.test.ts` `montarHistorial` (L536-540, dentro del describe de NAV-08 que va de
  la L533 a su primer `it` en la L546) no tiene `addEventListener`. `test/panel-branch.test.ts` `montarPila` (L44-63) sí
  lo tiene y lo registra en `enganchados`. El caso «CON `reDecidir` engancha UN oyente…» ocupa las L1282-1297 y afirma
  `toHaveLength(1)` en la L1288. El `afterEach` del archivo está en las L75-86.
- **La sonda del scroll** (`.planning/debug/probes/g04-scroll-y-recarga.mjs`): tiene `pageshow`/`pagehide` con
  `persisted` (L250-251), `navegar` (Page.navigate + load, L288), `evaluar` con `awaitPromise` (L208), `tocarTab` con
  tres reintentos (L507-540), `esperarTabQuieto` (L630), `COND_FINANZAS` (L811), `asentarUbicacion` (L816), el
  `RECORRIDOS.push` de los `G1-*` (L1305-1309) y `correrYReportar` (L1313-1343). En `hipotesis` sale con rc 0 aunque no
  coincida; en `tras-el-fix`, con 1 si algo no coincide. Corre `next dev` (no hay producción local: el entorno de
  producción apunta a la base de producción).
- **Lo que ya se sabe del caso 1** (`.planning/debug/b1-tras-recarga.md`, WR-04): en Chrome 157 una recarga NO deja la
  entrada de abajo en otro documento, así que el cruce natural no se arma así. Por eso K1 lo FUERZA: una carga dura de
  `/finances?tab=ventas` sobre `/finances` y la marca `{ frjView: 'tab' }` escrita por la sonda.
- **La sonda de la app:** `panel-exit-en-la-app.mjs dev interfaz [ids]`, 12 `R-T-*` y 4 `R-B1-*`; termina con rc 1 por la
  FALLA tolerada `R-G3-10-primer-toque-atras-pronto`. La estática `panel-back-stack.mjs`: 18 `OK  E-`.
- **Registro:** `deferred-items.md` tiene 11 `status: open`, y las entradas de este quick son tres (`- La guarda de
  consumo en vuelo no se extendió…`, `- R2-WR-01: …` y `- Decisión del dueño (2026-11-18, secure-phase): …`). La última
  sección de `tabs-en-la-url-medida.md` es la `(k)`.
- **Predicción por lectura, NO veredicto:** el caso 2 y los dos sentidos del caso 3 deberían dar rojo en el simulador.
  En K3a-b1 y K3b-b1 el tercer retroceso sale del sitio. Sobre el caso 1 no hay predicción: depende de si el documento
  del panel entra en la bfcache en `next dev` (WebSocket de HMR y `Cache-Control: no-store`). Por eso se mide.

## El diseño del arreglo (se aplica SÓLO la parte cuyo caso reprodujo; decidido acá para que el ejecutor no improvise)

- **F2, si el caso 2 reproduce.** En la rama `consume` de `applyPanelView`, `consumoEnVuelo = true` queda donde está. El
  oyente `popstate` y el `window.history.back()` pasan a ir dentro de un `try`, y el `catch` llama a `soltarConsumo()` y
  vuelve a lanzar el MISMO error: el handler del toque lo ve, pero el panel sigue respondiendo. `soltarConsumo()` apaga
  PRIMERO la memoria y DESPUÉS saca su propio oyente (`window.removeEventListener('popstate', soltarConsumo)`): así, un
  stub sin ese método no puede dejar la guarda encendida.
- **F3, si el caso 3a o el 3b reproduce. Es una sola guarda, no dos.**
  - Al lado de `consumoEnVuelo` va una memoria nueva, `estadoDelConsumo` (el `window.history.state` de la entrada desde
    la que se retrocedió). No se exporta, igual que la bandera.
  - La rama `consume` de `applyPanelView` la asigna (`estadoDelConsumo = actual`) después de `consumoEnVuelo = true`, y
    `soltarConsumo()` la vuelve a `null` después de apagar la bandera.
  - `consumeOwnedPanelEntry` empieza, ANTES de leer `actual` y ANTES de sus dos guardas, con el chequeo del consumo en
    vuelo. Si `consumoEnVuelo` está encendida y `window.history.state === estadoDelConsumo`, devuelve `true` sin
    retroceder: el retroceso que ya está en vuelo cierra la subsección, el call site previene la navegación y el
    `segundoPaso` de B1, que ya está enganchado, corre con el `popstate` de ese recorrido. Si la bandera está encendida
    pero el state cambió, llama a `soltarConsumo()` y sigue. Ese es el caso de B1 adentro del `popstate` de su propio
    recorrido: el oyente de la guarda todavía no corrió porque B1 enganchó el suyo antes.
  - Después van las dos guardas, sin cambios y en su orden, y después EL MISMO bloque de encendido que la rama `consume`
    de `applyPanelView`, con líneas textualmente iguales: la bandera, la memoria del state, y el `try` con el oyente y
    el retroceso más el `catch`. Termina con `return true`.
  - La línea `if (consumoEnVuelo) return 'none'` de `applyPanelView` queda TAL CUAL. Con eso, el candado del 04-07
    (`test/panel-tabs.test.ts:885-908`) sigue en verde sin tocarlo.
  - La duplicación del bloque es a propósito (molde de los literales duplicados del repo): la vigila un candado nuevo
    anti-deriva (`C-retroceso-unico`).
- **F1, si el caso 1 reproduce o el dueño elige A en el checkpoint.** Una función `soltarAlVolverDeLaCache(e:
  PageTransitionEvent)` que llama a `soltarConsumo()` sólo si `e.persisted`. En cada bloque de encendido, justo después
  del oyente `popstate`, va `window.addEventListener('pageshow', soltarAlVolverDeLaCache, { once: true })`, y
  `soltarConsumo()` saca también ese oyente.
- **Prohibido en cualquier rama:** un temporizador, tocar `lib/panel-branch.ts`, exportar la memoria, propagar
  `history.state` con spread (el candado de `test/panel-history-clients.test.ts` y `test/dirty-history.test.ts`) y
  cambiar las dos guardas de `consumeOwnedPanelEntry` o su orden.

## Reglas que valen para los tres tasks

- **La base `B`** es el padre del PRIMER commit `test(quick-261118-kat)` (al planificar, HEAD = `5f36c46`). **`KC`** es el
  commit que agrega el `describe('R2-WR-01 — los tres casos`. Los gates calculan las dos solas. Los números de línea
  de los `<read_first>` son los de `5f36c46`.
- **Intocables:** `lib/overlay-history.ts`, `lib/dirty-history.ts`, `lib/panel-branch.ts`, `scripts/con-turno.mjs`
  (CONGELADO; la herramienta de `D:/herramientas/turno-pantalla` no se edita), `next.config.ts` (sha1
  `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`) y todo `app/`, `components/`, `proxy.ts` y `supabase/`. No se agrega
  ninguna dependencia. Nunca `git checkout --` (CRLF): para revertir, Edit.
- **El turno de pantalla:** toda corrida que levante un navegador o un servidor va envuelta en
  `node scripts/con-turno.mjs …`, se lanza en **segundo plano** (`run_in_background`) con el MISMO comando del gate y se
  lee la salida al terminar. Si el turno está ocupado, espera e imprime quién es el dueño: **una espera no es un
  cuelgue**. **Nunca Ctrl+C** a una corrida de pantalla. Si una se corta: `bash D:/herramientas/turno-pantalla/turno-pantalla.sh estado`,
  matar el PID dueño SÓLO si es nuestro y después `bash D:/herramientas/turno-pantalla/turno-pantalla.sh liberar`.
  Quedan fuera del turno vitest, eslint, `tsc`, el build y `--autotest`.
- **El servidor:** si hay un `next dev` de ESTE repo vivo, las sondas lo detectan y miden contra él, sin matarlo ni
  reiniciarlo. Si no hay, levantan el suyo en el 3031 y lo matan al salir. El `next dev` de forjo-landing en el 3000 no
  se toca. Si el 3031 o el 9335 están ocupados por otra cosa, es P-0.
- **Supabase:** se usa sólo la pila de forjo-app, y sólo `supabase start` si la API no contesta. Nunca `stop`,
  `db reset`, `docker stop` ni `rm`. **Ninguna escritura en la base.**
- **⚠ El guard de secretos de esta máquina bloquea todo comando de Bash que contenga el literal «punto env».** Ningún
  gate lo contiene, y un comando propio del ejecutor tampoco puede.
- **Anti-gates del repo:** `./node_modules/.bin/tsc --noEmit` (nunca `npx tsc`, que sale 0 siempre), eslint archivo por
  archivo (nunca `npm run lint`). `npm test` no se corre. Si se corre igual, sólo dentro de [01:00, 23:30] hora de
  Argentina (los canarios de reloj del carril `db`).
- **Commits:** `git add <rutas explícitas>` y nada más. Nunca `-A`: `.claude/settings.json` y
  `.planning/workstreams/panel-nav/.verification-ledger.json` quedan sin trackear. Alcances `test(quick-261118-kat):`,
  `fix(quick-261118-kat):` y `docs(quick-261118-kat):`. Cada mensaje termina con una línea en blanco y
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Nada de push** (sale con obs-G1). No se edita ROADMAP,
  STATE ni REQUIREMENTS, y nunca se corre `requirements.mark-complete`.
- **Los esperados se fijan antes de medir y no se tocan después.** Ningún `esperado`, `esperado_si_HA` ni
  `esperado_tras_el_fix` cambia después de la corrida que lo juzga. Las pruebas del task 1 sólo AGREGAN líneas: 0
  quitadas en `test/panel-tabs.test.ts` y en la sonda. Las de la sonda van en español ASCII, sin tildes ni eñe, como el
  resto del archivo.
- **Comentarios nuevos:** densos, en español, del porqué. Nunca citan textual las frases viejas de los docblocks que se
  corrigen (los gates las cuentan).

## Las reglas de PARAR

- **P-0 (el entorno):** la API local no contesta y `supabase start` no la levanta, o el 3031/9335 están ocupados por algo
  que no es la sonda ⇒ PARAR con lo corrido.
- **P-1 (el instrumento):** puede ser una guarda de la sonda que tira (`ERROR-DEL-INSTRUMENTO`,
  `la sonda no pudo completar`, un P-1 de una primitiva), un caso K/NR que falla por `TypeError`/`ReferenceError` en vez
  de por su aserción, o que el simulador fiel cambie el resultado de un caso viejo de `panel-tabs`. Se hace UNA
  re-corrida idéntica. Si se repite y el defecto es del instrumento nuevo, se permite UN arreglo en otro commit
  `test(quick-261118-kat)` ANTES de la corrida que juzga, sin tocar ningún esperado. Si no, PARAR con el reporte.
  - **P-1b (el simulador no representa B1):** algún `NR-b1-*` en rojo con el código de HOY. Por la decisión del dueño, en
    ese caso el caso 3 se mide en la app por CDP. Ese instrumento no está escrito en este plan: PARAR y devolverlo al
    orquestador con los números, sin arreglar nada.
- **P-2 (un caso no reproduce):** no es un error, es un veredicto. Un caso 2 o 3 que no reproduce NO se arregla: se
  cierra como «descartado medido». Si el caso 1 no reproduce, va al checkpoint del task 2. Nada se arregla «por las
  dudas».
- **P-3 (el verde no da):** con el arreglo puesto, un K/NR/C en rojo, un caso viejo en rojo, un `R-T-*`/`R-B1-*` sin `OK`,
  la estática por debajo de 18, el scroll por debajo de 8/8 o K1 `FALLA` en `tras-el-fix` ⇒ PARAR con el log. No se
  prueba otro diseño por cuenta propia y no se toca ningún esperado.
- **P-4 (el diseño choca):** si el arreglo exige tocar `lib/panel-branch.ts`, cambiar una aserción vieja que no es la
  declarada, o pone en rojo el candado de un sentido que dio verde ⇒ PARAR y llevárselo al dueño.
- **P-7 (el build):** si `npm run build` choca con un `next dev` de este repo vivo, no se mata: se espera a que no esté y
  se re-corre. Si no se puede, se declara en el SUMMARY.

<tasks>

<task type="tracer">
  <name>Task 1: Medir los tres casos con el código de hoy — simulador fiel, K2/K3/NR y K1 commiteados ANTES, las corridas y los veredictos en (l)</name>
  <reversibility rating="reversible">Sólo instrumento y registro: líneas agregadas a una suite, a una sonda y a un documento de medición. La app no cambia. Deshacerlo es un `git revert` de los commits `test` y `docs`.</reversibility>
  <precondition>HEAD es `5f36c46` o un descendiente que no cambió `lib/panel-history.ts`, `lib/panel-branch.ts`, `test/panel-tabs.test.ts` ni `.planning/debug/probes/g04-scroll-y-recarga.mjs` desde `5f36c46`. La API local de Supabase de forjo-app contesta en 127.0.0.1:54321 (o `supabase start` la levanta).</precondition>
  <files>test/panel-tabs.test.ts, .planning/debug/probes/g04-scroll-y-recarga.mjs, .planning/debug/tabs-en-la-url-medida.md</files>
  <read_first>
    - `lib/panel-history.ts` L925-1060 (la guarda, `soltarConsumo`, el docblock de `applyPanelView` y su rama `consume`), L1181-1220 (`consumeOwnedPanelEntry`) y L717-819 (`panelBranchPlan`, en especial las reglas -1d y -1c).
    - `lib/panel-branch.ts` L345-466 (`runBranchNavigation`: `consume-view-then-navigate` en L405-422 y el colapso), L1500-1530 (`branchStackFacts`) y L2028-2097 (`decidirDesdeElAterrizaje` y `handleNavigate`: lo que el ayudante `tocarLaBarra` del simulador tiene que espejar). SÓLO LECTURA.
    - `test/panel-tabs.test.ts` L1-12 (los imports), L137-247 (el simulador, `tocar`), L249-252, L328-335 y L739-909 (los tres `afterEach` y el describe G-04-7, con E3 y el candado de la guarda).
    - `test/panel-branch.test.ts` L43-86 (el molde de `afterEach` que drena la memoria del módulo antes de soltar el `window`).
    - `.planning/debug/probes/g04-scroll-y-recarga.mjs` L1-75 (la cabecera y los modos), L232-260 (los instrumentos: `pageshow`/`pagehide`, documentos nuevos, historia), L288-320 (`navegar`, `historial`, `foto`), L401-420 (`clickEnPunto`), L507-540 (`tocarTab`), L620-660 (`esperarTabQuieto`), L811-830 (`COND_FINANZAS`, `asentarUbicacion`), L1143-1180 (el molde de recorrido `b1RecargaHacia`, con `medido`/`esperado_si_HA` y los registros del tramo), L1305-1343 y L1345-1460 (`RECORRIDOS.push`, `correrYReportar`, `main`).
    - `.planning/debug/b1-tras-recarga.md` (WR-04: por qué la recarga no arma el cruce en Chrome 157) y `.planning/debug/tabs-en-la-url-medida.md` desde la L1420 (`## (k)`: el formato a imitar).
  </read_first>
  <action>
**Paso 0 — el entorno (P-0).** Anotar para el SUMMARY la fecha y la hora, `docker ps --format '{{.Names}}'` y
`bash D:/herramientas/turno-pantalla/turno-pantalla.sh estado`. Chequear la API con
`curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:54321/rest/v1/`. Si da `000`, la pila está
caída: `supabase start` desde la raíz, en segundo plano, hasta que conteste.

**Paso 1 — el simulador se vuelve fiel al DOM y se drena entre casos (IN-02). En `test/panel-tabs.test.ts` sólo se
agregan líneas.**
(a) En el `popstate` de `montarHistoria`, como primera línea dentro del `for`, va `if (!oyentes.includes(o)) continue`:
un oyente que se quitó durante el despacho no corre, que es el «removed flag» del DOM.
(b) En `addEventListener`, justo después de `if (tipo !== 'popstate') return`, va
`if (oyentes.some((o) => o.fn === fn)) return`: el mismo oyente no se engancha dos veces.
(c) Antes de `montarHistoria`, a nivel de módulo, va `let drenarPopstateDelStub: (() => void) | null = null`, y adentro
de `montarHistoria`, después de definir `popstate`, va `drenarPopstateDelStub = popstate`.
(d) En los tres `afterEach` que ya existen (L250, L333, L751), antes de `vi.unstubAllGlobals()`, van dos líneas:
`drenarPopstateDelStub?.()` y `drenarPopstateDelStub = null`. Son las del molde de `test/panel-branch.test.ts:75-86`:
la memoria del módulo se drena ANTES de soltar el `window`, así un caso rojo no deja la guarda encendida para los que
vienen.
(e) Al docblock de `montarHistoria` se le agrega un párrafo `(quick 261118-kat)` que dice el porqué de (a)-(c).
(f) Debajo del import de `PT` va `import * as PB from '@/lib/panel-branch'`, con una línea de comentario: B1 se corre
REAL.
Correr `./node_modules/.bin/vitest run --project pure test/panel-tabs.test.ts`. Tiene que seguir 85/85 en verde: el
simulador fiel no cambia ningún resultado de hoy. Si cambia alguno, es P-1.

**Paso 2 — los nueve casos, al FINAL del archivo** (después del describe G-04-8). Llevan un encabezado de comentario
`// ── 8) R2-WR-01 (quick 261118-kat): …` que explica los tres casos, la decisión del dueño (2026-11-18), que cada
`esperado` es lo CORRECTO (rojo = el caso reproduce) y que los `NR-*` fijan B1 y tienen que estar en verde HOY (si no,
P-1b). El describe se llama exactamente `describe('R2-WR-01 — los tres casos de la guarda de consumo en vuelo, medidos antes de arreglar (quick 261118-kat)', () => {`.
- **`afterEach`:** `drenarPopstateDelStub?.()`, `drenarPopstateDelStub = null`, vaciar `navegaciones`,
  `PB.takeBackLanding()`, `PB.applyBranchMarkRequest('__drenaje__')`, `vi.restoreAllMocks()` y recién después
  `vi.unstubAllGlobals()`.
- **Ayudantes dentro del describe:**
  - `const ID = 7` y `const navegaciones: string[] = []`.
  - Tres fábricas que devuelven objetos NUEVOS en cada llamada, para que la identidad del state sea de cada caso.
    `pilaFin()` = `/afuera` (state null), `/dashboard` (null), `/finances` (`{ frjUnder: '/dashboard' }`),
    `/finances?tab=ventas` (`{ frjView: 'tab' }`). `pilaFichas()` = `/afuera`, `/dashboard`,
    `/clients` (`{ frjUnder: '/dashboard' }`), `/clients?c=a` (`{ frjView: 'c' }`), `/clients?c=b` (`{ frjView: 'c' }`).
    `pilaTriple()` = `/afuera`, `/dashboard`, `/mas` (`{ frjUnder: '/dashboard' }`), `/negocio` (`{ frjUnder: '/mas' }`),
    `/negocio?tab=cobros` (`{ frjView: 'tab' }`). Todas se montan con `{ backAsincrono: true }`.
  - `decidir(href)` es EXACTAMENTE `decidirDesdeElAterrizaje` del hook, sin React. Lee `window.history.state` y
    `window.location.pathname`, saca el plan de `PH.panelBranchPlan({ from, to: href, ...PB.branchStackFacts({ estado, id: ID, root: PH.PANEL_ROOT, more: PH.PANEL_MORE }) })`
    y sigue así: `none` corta; `push`/`replace` se anotan en `navegaciones`; lo demás va a
    `PB.runBranchNavigation({ plan, to: href, navigate: (to, modo) => anotar, exitId: ID, reDecidir: () => decidir(href) })`,
    y si no se hizo cargo se anota la caída.
  - `tocarLaBarra(href)` es EXACTAMENTE `handleNavigate`: devuelve `false` (y anota) con `push`/`replace`, y si no,
    devuelve lo que dé `runBranchNavigation` con el mismo `reDecidir`. Un comentario explica qué NO se modela: el
    sentinel de salida y el router de Next. Eso lo cubren las sondas.
  - Tocar la sección activa del menú (NAV-08) es `PH.consumeOwnedPanelEntry()` directo, que es lo que hacen la barra y el
    sidebar con `active &&`.
- **Forma de cada caso:** se juntan las medidas, se llama a `procesar()` ANTES de cualquier aserción y se cierra con UNA
  sola `expect(medido).toEqual(esperado)`, para que el rojo muestre la tupla medida entera. Para que un `back()` tire se
  usa `vi.spyOn(window.history, 'back').mockImplementationOnce(() => { throw new DOMException('demasiadas llamadas', 'SecurityError') })`:
  sólo la primera llamada tira y las demás siguen al simulador. Ningún nombre de caso menciona errores de JS.
- **Los nueve casos** (el nombre empieza EXACTAMENTE con el id y dos puntos):
  - `K2-a:` un back() que tira no deja la guarda encendida. Sobre `pilaFin()`, con el back que tira, se hace
    `tocar(TABS_FINANZAS, 'appointments')` dentro de un `try` (`tiro`), después se leen `oyentes: pila.oyentes` y
    `siguiente: tocar(TABS_FINANZAS, 'appointments')`, y se cierra con `procesar()` y `url: actual().url`. Esperado
    `{ tiro: true, oyentes: 0, siguiente: 'consume', url: '/finances' }`.
  - `K2-b:` `consumeOwnedPanelEntry` con un back() que tira no deja nada encendido (candado de no-regresión: HOY
    verde). Sobre `pilaFin()`, con el back que tira, `PH.consumeOwnedPanelEntry()` dentro de un `try` (`tiro`), después
    `siguiente: tocar(TABS_FINANZAS, 'appointments')`, `procesar()` y `url`. Esperado
    `{ tiro: true, siguiente: 'consume', url: '/finances' }`.
  - `K3a-nav08:` tab por defecto y, antes del popstate, la sección activa del menú. `consumo: tocar(…, 'appointments')`,
    `prevenido: PH.consumeOwnedPanelEntry()`, `procesar()`, `retrocesos: pila.retrocesos` y `url`. Esperado
    `{ consumo: 'consume', prevenido: true, retrocesos: 1, url: '/finances' }`.
  - `K3a-b1:` tab por defecto y, antes del popstate, Inicio en la barra. `consumo`,
    `seHizoCargo: tocarLaBarra(PH.PANEL_ROOT)`, `procesar()`, `retrocesos`, `url` y `navegaciones: [...navegaciones]`.
    Esperado `{ consumo: 'consume', seHizoCargo: true, retrocesos: 2, url: '/dashboard', navegaciones: [] }`.
  - `K3b-nav08:` la sección activa del menú y, antes del popstate, el tab por defecto.
    `prevenido: PH.consumeOwnedPanelEntry()`, `toque: tocar(…, 'appointments')`, `procesar()`, `retrocesos` y `url`.
    Esperado `{ prevenido: true, toque: 'none', retrocesos: 1, url: '/finances' }`.
  - `K3b-b1:` Inicio en la barra y, antes del popstate, el tab por defecto. `seHizoCargo: tocarLaBarra(PH.PANEL_ROOT)`,
    `toque: tocar(…, 'appointments')`, `procesar()`, `retrocesos`, `url` y `navegaciones`. Esperado
    `{ seHizoCargo: true, toque: 'none', retrocesos: 2, url: '/dashboard', navegaciones: [] }`.
  - `NR-b1-control:` Inicio en la barra con el tab arriba y sin otro toque, sobre `pilaFin()`. Esperado
    `{ seHizoCargo: true, retrocesos: 2, url: '/dashboard', navegaciones: [] }`.
  - `NR-b1-reentrada:` Inicio en la barra con dos fichas apiladas, sobre `pilaFichas()`. El segundo consumo sale del
    `popstate` del primero. Esperado `{ seHizoCargo: true, retrocesos: 3, url: '/dashboard', navegaciones: [] }`.
  - `NR-b1-triple:` Inicio desde Cobros con Más debajo, sobre `pilaTriple()`: el retroceso triple medido en la app
    (`04-04-SUMMARY.md` L81-85). Esperado `{ seHizoCargo: true, retrocesos: 3, url: '/dashboard', navegaciones: [] }`.

**Paso 3 — K1 en la sonda del scroll (en `.planning/debug/probes/g04-scroll-y-recarga.mjs` sólo se agregan líneas).**
(a) **La cabecera.** Después del párrafo `// MODO obs-G1 …` (termina en la L65) va un párrafo nuevo,
`// MODO R2-WR-01 (quick 261118-kat): …`. Explica que `K1-bfcache-cruce` mide si la guarda de consumo en vuelo queda
encendida cuando el retroceso cruza de documento y la página vuelve de la bfcache. Explica que el cruce se FUERZA
(una carga dura de `/finances?tab=ventas` sobre `/finances` y la marca `{ frjView: 'tab' }` escrita por la sonda),
porque WR-04 midió que en Chrome 157 la recarga no lo arma. Y explica que `esperado_si_HA` es el defecto y que
`NO-COINCIDE` es un veredicto, no un error. En «QUE NO CIERRA» se agrega una línea: Safari de iOS, Android real, la
pestaña descartada y restaurada, y el build de producción.
(b) **La primitiva `tocarTabUnaVez(cdp, texto)`.** Busca el tab como `tocarTab` (posición quieta en dos lecturas,
viewport VISUAL, `adentro` afirmado con `elementFromPoint`; si no lo encuentra, tira un P-1) y hace UN solo
`clickEnPunto`. No reintenta y no espera a que se seleccione: un tab muerto se mide con un toque, no con tres.
(c) **La fábrica `k1BfcacheCruce()`.** Se agrega `RECORRIDOS.push(k1BfcacheCruce())` inmediatamente después del
`RECORRIDOS.push(` de los `G1-*`, que termina en la L1309. El recorrido, en móvil (`celular`), hace esto:
  1. `entrarDirecto`, `navegar` a `ORIGEN + '/finances'` (documento A) y `esperarTabQuieto(cdp, 'Turnos', { condicion: COND_FINANZAS })`.
  2. `navegar` a `ORIGEN + '/finances?tab=ventas'` (documento B, una entrada nueva con A debajo) y
     `esperarTabQuieto(cdp, 'Ventas', …)`.
  3. Por `evaluar`, `history.replaceState({ frjView: 'tab' }, '')`, con el método parcheado de la página, que conserva
     los internos de Next. Se lee de vuelta la marca y se imprime una línea `forzado: …` que dice qué escribió la sonda
     y sobre qué URL.
  4. Antes de tocar, engancha `cdp.en('Page.backForwardCacheNotUsed', …)` para juntar los eventos del recorrido.
     Anota `registros.length`, hace `tocarTabUnaVez(cdp, 'Turnos')` (el consumo) y espera, hasta 30 s, a que la URL sea
     `/finances`. `cruzo_de_documento` vale `si` si después del toque hay un `sonda-documento-nuevo` en `/finances` o un
     `sonda-pageshow` con `persisted: true` en `/finances`. Si el aterrizaje fue en el mismo documento, vale `no`.
  5. «Adelante» del navegador: `Page.getNavigationHistory` y `Page.navigateToHistoryEntry` con el id de la entrada
     siguiente. Espera a que la URL tenga `tab=ventas`. `b_vuelve_de_la_cache` vale `si` si llega un `sonda-pageshow` con
     `persisted: true` y sin `sonda-documento-nuevo` de B, y `no` en cualquier otro caso.
  6. `tocarTabUnaVez(cdp, 'Egresos')` y hasta 5 s de espera. `tab_responde` vale `si` si `location.search` pasa a
     contener `tab=egresos`, y `no` si no.
  - **El `detalle` imprime:** la línea `forzado:`; una línea `bfcache: …` por cada `Page.backForwardCacheNotUsed`
    (navegación, y `type`/`reason` de cada explicación), o `bfcache: sin eventos backForwardCacheNotUsed`; los
    `notRestoredReasons` de `performance.getEntriesByType('navigation')[0]` del documento final; el `cache-control` de
    `fetch(location.href)`; los `sonda-pagehide`/`sonda-pageshow` con `persisted`; los documentos nuevos; las
    escrituras de historia después del toque en Egresos; y la URL final.
  - **El `medido`** son las tres claves (`cruzo_de_documento`, `b_vuelve_de_la_cache`, `tab_responde`), con valores
    `si`/`no`.
  - **Los dos esperados,** cada uno en UNA línea y tal cual:
    `esperado_si_HA: { cruzo_de_documento: 'si', b_vuelve_de_la_cache: 'si', tab_responde: 'no' },`
    `esperado_tras_el_fix: { cruzo_de_documento: 'si', b_vuelve_de_la_cache: 'si', tab_responde: 'si' },`
    Arriba van comentarios que dicen por qué el verde también exige el cruce y la vuelta: sin ellos, un `tab_responde: si`
    no probaría el arreglo.

**Paso 4 — commit ANTES de medir.** `./node_modules/.bin/eslint` de los dos archivos con rc 0, `git add` de los dos y el
commit `test(quick-261118-kat): R2-WR-01 — los tres casos de la guarda medidos antes de arreglar (simulador fiel, K2/K3/NR y K1)`
con el trailer. Correr el PRIMER gate (estático más la medición pura). El gate exige los `NR-*` y `K2-b` en verde (si no,
P-1b o P-1), la falla de cada K por su aserción y ningún caso viejo en rojo. Anotar la tupla roja de cada K.

**Paso 5 — la corrida de K1, UNA, por el turno y en segundo plano.** Es el SEGUNDO gate tal cual. **Anotar la ruta del
log.** `COINCIDE-CON-LA-HIPOTESIS` significa que el caso 1 reproduce; `NO-COINCIDE` significa que no reproduce, con el
motivo: no cruzó de documento, no volvió de la bfcache (con sus razones), o volvió y el tab respondió. Si
`cruzo_de_documento` da `no`, la construcción falló: es P-1, con una re-corrida. Si se repite, el caso 1 queda
«no reproduce: no se pudo construir el cruce» con el número.

**Paso 6 — `## (l)` al final de `.planning/debug/tabs-en-la-url-medida.md`.** Sólo se agrega; ninguna línea vieja
cambia. El título es `## (l) R2-WR-01: la guarda de consumo en vuelo, medida antes de arreglar (quick 261118-kat)`, con
el formato de `(k)`:
- **Qué se preguntó:** los tres casos y la decisión del dueño.
- **El entorno.**
- **El caso 2 y el caso 3:** el comando de vitest, la tupla medida contra la esperada de cada K, pegada TAL CUAL del
  error de la aserción, y los `NR-*` en verde (con eso, el simulador representa B1).
- **El caso 1:** el comando y el bloque de K1 pegado TAL CUAL: la línea `COINCIDE-CON-LA-HIPOTESIS`/`NO-COINCIDE` en la
  columna 0, sus claves, las líneas `bfcache:`, `forzado:`, `notRestoredReasons` y `cache-control`.
- **Una línea sola:** `veredictos (l): caso 1=<reproduce|no-reproduce> · caso 2=<…> · caso 3a=<…> · caso 3b=<…>`. Cada
  valor sale de lo medido. El caso 2 es el rojo de K2-a. El 3a, el rojo de K3a-nav08 o de K3a-b1. El 3b, el de K3b-nav08
  o K3b-b1. El caso 1 es el veredicto de K1.
Commit `docs(quick-261118-kat): R2-WR-01 medido antes de arreglar — veredictos de los tres casos en (l)` con el trailer.
Correr el TERCER gate.

**Paso 7.** Si `(l)` dice `caso 1=no-reproduce`, el plan PARA en el task 2: se devuelve el checkpoint con los números
de K1. **El ejecutor no elige**, aunque `workflow.auto_advance` esté prendido. Si dice `caso 1=reproduce`, el task 2 se
saltea (ya está la decisión previa del dueño: soltar en `pageshow`) y se sigue al task 3.
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && T=test/panel-tabs.test.ts; S=.planning/debug/probes/g04-scroll-y-recarga.mjs; TL=$(git log --reverse --format=%H --grep='^test(quick-261118-kat)' HEAD); TLRC=$?; TC=$(printf '%s\n' "$TL" | grep -c .); test "$TLRC" = 0 && test "$TC" -ge 1 || { echo "commits test(quick-261118-kat)=$TC (>=1) rc=$TLRC"; exit 1; }; B="$(printf '%s\n' "$TL" | head -1)^"; DT=$(git diff -U0 "$B" -- "$T"); DTRC=$?; DS=$(git diff -U0 "$B" -- "$S"); DSRC=$?; RT=$(printf '%s\n' "$DT" | tr -d '\r' | grep -E '^-[^-]' | grep -c .); RS=$(printf '%s\n' "$DS" | tr -d '\r' | grep -E '^-[^-]' | grep -c .); W=$(tr -d '\r' < "$T"); KD=$(printf '%s\n' "$W" | grep -c "^describe('R2-WR-01 — los tres casos"); KID=$(printf '%s\n' "$W" | grep -cE "^  it\('(K2-a|K2-b|K3a-nav08|K3a-b1|K3b-nav08|K3b-b1|NR-b1-control|NR-b1-reentrada|NR-b1-triple): "); FI=$(printf '%s\n' "$W" | grep -cF 'if (!oyentes.includes(o)) continue'); FD=$(printf '%s\n' "$W" | grep -cF 'if (oyentes.some((o) => o.fn === fn)) return'); DR=$(printf '%s\n' "$W" | grep -cF 'drenarPopstateDelStub?.()'); PBI=$(printf '%s\n' "$W" | grep -cxF "import * as PB from '@/lib/panel-branch'"); WS=$(tr -d '\r' < "$S"); K1=$(printf '%s\n' "$WS" | grep -cF "id: 'K1-bfcache-cruce'"); EHA=$(printf '%s\n' "$WS" | grep -cF "esperado_si_HA: { cruzo_de_documento: 'si', b_vuelve_de_la_cache: 'si', tab_responde: 'no' },"); ETF=$(printf '%s\n' "$WS" | grep -cF "esperado_tras_el_fix: { cruzo_de_documento: 'si', b_vuelve_de_la_cache: 'si', tab_responde: 'si' },"); BF=$(printf '%s\n' "$WS" | grep -cF 'Page.backForwardCacheNotUsed'); NH=$(printf '%s\n' "$WS" | grep -cF 'Page.navigateToHistoryEntry'); git diff --quiet HEAD -- "$T" "$S"; LIMPIO=$?; APL=$(git diff --name-only "$B" -- app components lib scripts proxy.ts next.config.ts package.json package-lock.json supabase); APRC=$?; APP=$(printf '%s\n' "$APL" | grep -c .); HC=$(sha1sum next.config.ts | cut -d' ' -f1); ./node_modules/.bin/eslint "$S" "$T" > /dev/null 2>&1; EL=$?; TSC=$(./node_modules/.bin/tsc --noEmit 2>&1 | grep -v '^\.next/' | grep -E 'error TS'); AUTO=$(node "$S" --autotest 2>&1 | tr -d '\r' | tail -1); V=$(./node_modules/.bin/vitest run --project pure "$T" 2>&1 | tr -d '\r'); printf '%s\n' "$V" | tail -8; VF=$(printf '%s\n' "$V" | grep -oE 'Tests +[0-9]+ failed' | grep -oE '[0-9]+' | tail -1); VF=${VF:-0}; VP=$(printf '%s\n' "$V" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); VP=${VP:-0}; ROJ=$(printf '%s\n' "$V" | grep -E 'FAIL|×' | grep -oE '(K2-a|K2-b|K3a-nav08|K3a-b1|K3b-nav08|K3b-b1|NR-b1-control|NR-b1-reentrada|NR-b1-triple): ' | sort -u | tr -d ': ' | tr '\n' ' '); NK=$(printf '%s\n' $ROJ | grep -c .); NRR=$(printf '%s\n' $ROJ | grep -cE '^(NR-b1-|K2-b$)'); TE=$(printf '%s\n' "$V" | grep -cE 'TypeError|ReferenceError|SyntaxError'); TOT=$((VF + VP)); echo "rojos medidos=[$ROJ] · diff rc test=$DTRC sonda=$DSRC (0 0) · lineas quitadas test=$RT sonda=$RS (0 0) · describe=$KD (1) casos K/NR=$KID (9) · simulador fiel=$FI/$FD (1/1) · drenajes=$DR (4) · import PB=$PBI (1) · K1=$K1 (1) esperados=$EHA/$ETF (1/1) · bfcache=$BF navegar a la entrada=$NH (>=1) · sin commitear=$LIMPIO (0) · app/lib cambiados=$APP (0, rc $APRC) · next.config=$HC · eslint=$EL (0) · errores TS=[$TSC] (vacio) · autotest=[$AUTO] (5/5) · panel-tabs fallas=$VF = rojos K=$NK · NR o K2-b en rojo=$NRR (0: si no, P-1b/P-1) · errores de JS=$TE (0: si no, P-1) · casos=$TOT (>=94)"; test "$DTRC" = 0 && test "$DSRC" = 0 && test "$RT" = 0 && test "$RS" = 0 && test "$KD" = 1 && test "$KID" = 9 && test "$FI" = 1 && test "$FD" = 1 && test "$DR" = 4 && test "$PBI" = 1 && test "$K1" = 1 && test "$EHA" = 1 && test "$ETF" = 1 && test "$BF" -ge 1 && test "$NH" -ge 1 && test "$LIMPIO" = 0 && test "$APRC" = 0 && test "$APP" = 0 && test "$HC" = 8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578 && test "$EL" = 0 && test -z "$TSC" && test "$AUTO" = "autotest del clasificador: 5/5" && test "$VF" = "$NK" && test "$NRR" = 0 && test "$TE" = 0 && test "$TOT" -ge 94</automated>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && LOGDIR=$(mktemp -d) || exit 1; LOG="$LOGDIR/k1-medicion.txt"; node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs K1-bfcache-cruce medicion-r2wr01 hipotesis > "$LOG" 2>&1; RC=$?; W=$(tr -d '\r' < "$LOG"); printf '%s\n' "$W" | tail -60; VER=$(printf '%s\n' "$W" | grep -E '^(COINCIDE-CON-LA-HIPOTESIS|NO-COINCIDE) K1-bfcache-cruce '); NV=$(printf '%s\n' "$VER" | grep -c .); ER=$(printf '%s\n' "$W" | grep -cE '^ERROR-DEL-INSTRUMENTO|la sonda no pudo completar'); VE=$(printf '%s\n' "$W" | grep -cE '^etiqueta=medicion-r2wr01 · recorridos: 1 · coinciden con la hipotesis: [01]$'); CL=0; for k in cruzo_de_documento b_vuelve_de_la_cache tab_responde; do n=$(printf '%s\n' "$W" | grep -cE "^      $k: medido=\"(si|no)\""); test "$n" = 1 && CL=$((CL + 1)); done; FZ=$(printf '%s\n' "$W" | grep -c 'forzado:'); RZ=$(printf '%s\n' "$W" | grep -c 'bfcache:'); echo "log=$LOG · rc=$RC (0) · veredicto=[$VER] (1 linea: COINCIDE = caso 1 reproduce, NO-COINCIDE = no reproduce) · fallos del instrumento=$ER (0: si no, P-1) · linea de cierre=$VE (1) · claves medidas=$CL (3) · marca forzada declarada=$FZ (>=1) · lineas bfcache=$RZ (>=1)"; test "$RC" = 0 && test "$NV" = 1 && test "$ER" = 0 && test "$VE" = 1 && test "$CL" = 3 && test "$FZ" -ge 1 && test "$RZ" -ge 1</automated>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && T=test/panel-tabs.test.ts; D=.planning/debug/tabs-en-la-url-medida.md; TL=$(git log --reverse --format=%H --grep='^test(quick-261118-kat)' HEAD); TLRC=$?; test "$TLRC" = 0 && test -n "$TL" || { echo "sin commit test(quick-261118-kat)"; exit 1; }; B="$(printf '%s\n' "$TL" | head -1)^"; DD=$(git diff -U0 "$B" -- "$D"); DDRC=$?; REMD=$(printf '%s\n' "$DD" | tr -d '\r' | grep -E '^-[^-]' | grep -c .); WD=$(tr -d '\r' < "$D"); LH=$(printf '%s\n' "$WD" | grep -cE '^## \(l\) '); VL=$(printf '%s\n' "$WD" | grep -E '^veredictos \(l\): '); NVL=$(printf '%s\n' "$VL" | grep -c .); K1B=$(printf '%s\n' "$WD" | grep -E '^(COINCIDE-CON-LA-HIPOTESIS|NO-COINCIDE) K1-bfcache-cruce ' | head -1); case "$K1B" in COINCIDE-CON-LA-HIPOTESIS*) E1=reproduce;; NO-COINCIDE*) E1=no-reproduce;; *) E1=sin-bloque;; esac; V=$(./node_modules/.bin/vitest run --project pure "$T" 2>&1 | tr -d '\r'); ROJ=" $(printf '%s\n' "$V" | grep -E 'FAIL|×' | grep -oE '(K2-a|K3a-nav08|K3a-b1|K3b-nav08|K3b-b1): ' | sort -u | tr -d ': ' | tr '\n' ' ') "; r() { case "$ROJ" in *" $1 "*) echo 1;; *) echo 0;; esac; }; E2=no-reproduce; test "$(r K2-a)" = 1 && E2=reproduce; E3A=no-reproduce; test "$(r K3a-nav08)$(r K3a-b1)" != 00 && E3A=reproduce; E3B=no-reproduce; test "$(r K3b-nav08)$(r K3b-b1)" != 00 && E3B=reproduce; ESP="veredictos (l): caso 1=$E1 · caso 2=$E2 · caso 3a=$E3A · caso 3b=$E3B"; DC=$(git log --format=%H --grep='^docs(quick-261118-kat)' HEAD | grep -c .); git diff --quiet HEAD -- "$D"; LIMPIO=$?; echo "lineas quitadas de la medida=$REMD (0, rc $DDRC) · seccion (l)=$LH (1) · linea de veredictos=$NVL (1) · escrita=[$VL] · recalculada=[$ESP] · bloque K1 pegado=[$K1B] · commits docs=$DC (>=1) · sin commitear=$LIMPIO (0)"; test "$DDRC" = 0 && test "$REMD" = 0 && test "$LH" = 1 && test "$NVL" = 1 && test "$E1" != sin-bloque && test "$VL" = "$ESP" && test "$DC" -ge 1 && test "$LIMPIO" = 0</automated>
    <fails_when>**El segundo gate se corre en segundo plano (`run_in_background`):** la espera del turno no tiene tope, y un tope vencido corta la corrida a la mitad y deja el turno tomado. El primero falla si: se quitó una línea de la suite o de la sonda (se reescribió algo que ya existía); no hay exactamente nueve casos K/NR con su id; faltan las dos líneas del simulador fiel, los cuatro drenajes o el import de `PB`; los esperados de K1 no son los textuales; quedan cambios sin commitear; cambió un archivo de la app o de `lib`; `next.config.ts` tiene otra huella; eslint, `tsc` o `--autotest` fallan; un `NR-*` o `K2-b` está en rojo (P-1b o P-1); un K falla por un error de JS y no por su aserción (P-1); o hay un caso viejo en rojo (el número de fallas no es el de los K rojos). El segundo falla si: no hay exactamente una línea de veredicto de K1, hubo un fallo del instrumento (P-1), falta alguna de las tres claves medidas como `si`/`no`, o faltan las líneas `forzado:` o `bfcache:`. Un `NO-COINCIDE` NO hace fallar el gate: es el veredicto «no reproduce». El tercero falla si: cambió una línea vieja de la medida; falta `(l)` o su línea de veredictos; la línea escrita no coincide con la que se recalcula de vitest y del bloque de K1 pegado; o falta el commit `docs`.</fails_when>
  </verify>
  <done>Están commiteados en `test(quick-261118-kat)`: el simulador fiel al DOM y drenado entre casos, los nueve casos K/NR y el recorrido K1 con sus esperados textuales, todo antes de medir. La medición pura dio sus rojos y verdes (con los `NR-*` y `K2-b` en verde), la corrida de K1 por el turno dio su veredicto, y `(l)` registra los tres casos con la línea `veredictos (l): …` y el bloque de K1 pegado tal cual. Quedaron anotadas la ruta del log de K1 y la tupla roja de cada K.</done>
</task>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 2: El caso 1 no reprodujo en Chrome — ¿mitigación defensiva barata o descartado medido? (decide el dueño)</name>
  <decision>Qué hacer con el caso 1 (bfcache, sin `popstate`) si `(l)` dice `caso 1=no-reproduce`. **Se presenta SÓLO en ese caso.** Si `(l)` dice `caso 1=reproduce`, el ejecutor lo saltea y en el task 3 escribe `decision caso 1 (previa del dueno, 2026-11-18): no-aplica`. El ejecutor NO elige, aunque `workflow.auto_advance` esté prendido.</decision>
  <context>
Al dueño se le presenta, tal como están en `(l)`: el veredicto de K1 y su motivo (no cruzó de documento, no volvió de la
bfcache o volvió y el tab respondió), las razones de `Page.backForwardCacheNotUsed` y `notRestoredReasons`, el
`cache-control` del documento del panel y los veredictos de los casos 2 y 3 (que se arreglan igual si reprodujeron).

Hay que decirle también lo que este quick NO puede cerrar. Safari de iOS y Chrome de Android reales: lo medido es Chrome
de escritorio headless con emulación móvil. La pestaña descartada y restaurada por el sistema, que es el caso que el
review nombra, con la marca sobreviviendo en el state restaurado. Y el build de producción: en local el entorno de
producción apunta a la base de producción y no se corre. WR-04 ya había mostrado que en Chrome 157 la recarga no arma
el cruce.
  </context>
  <options>
    <option id="A">
      <name>Aplicar igual la mitigación defensiva barata: soltar la guarda también en `pageshow` con `persisted`</name>
      <pros>Cubre los motores y caminos que no se pueden medir acá (Safari de iOS, Android, una pestaña restaurada) por si la página vuelve de la bfcache sin `popstate`. Son unas pocas líneas sin temporizador, más un candado puro (`C-pageshow-tab`). El peor caso sigue degradando al comportamiento de antes del 04-07 y nunca a un panel trabado.</pros>
      <cons>Es código para un caso que Chrome no produce: no se puede verificar en la app, sólo en el simulador. Con el caso 3 arreglado, cambia en uno más la cuenta de oyentes del B1 (la edición declarada de `test/panel-branch.test.ts` cuenta también el de `pageshow`).</cons>
    </option>
    <option id="B">
      <name>Cerrar como «descartado medido», con el número</name>
      <pros>Cero código. AR-04-05 (la parte de bfcache) se cierra con lo medido, como WR-04, y el docblock dice el número en vez de una garantía.</pros>
      <cons>Safari de iOS, Android real y la pestaña restaurada quedan como residuo declarado y sin medir. Si alguno vuelve de la bfcache sin `popstate`, los tabs no responden hasta el próximo atrás o adelante, o hasta recargar.</cons>
    </option>
  </options>
  <resume-signal>Respondé `A` (aplicar igual soltar en `pageshow` con `persisted`) o `B` (cerrar como descartado medido). Cualquier otra respuesta: el ejecutor PARA y la devuelve sin aplicar nada.</resume-signal>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Arreglar sólo lo que reprodujo (con sus candados primero), corregir los docblocks, la no-regresión completa por el turno y el registro</name>
  <reversibility rating="reversible">Unas líneas en `lib/panel-history.ts` (la guarda y sus docblocks), los candados agregados y tres documentos. Deshacerlo es un `git revert` de los commits `test`, `fix` y `docs` del task. `lib/panel-branch.ts` y la app no cambian.</reversibility>
  <precondition>El task 1 terminó con sus tres gates verdes y `(l)` tiene la línea `veredictos (l): …`. Si `caso 1=no-reproduce`, el dueño respondió `A` o `B` en el task 2. No quedó activa ninguna regla de PARAR.</precondition>
  <files>lib/panel-history.ts, test/panel-tabs.test.ts, test/panel-branch.test.ts, lib/panel-history.test.ts, .planning/debug/tabs-en-la-url-medida.md, .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md, .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-SECURITY.md</files>
  <behavior>
    - Con el arreglo de lo que reprodujo, los nueve casos del task 1 están en verde sin cambiar una línea: K2-a da `{ tiro: true, oyentes: 0, siguiente: 'consume', url: '/finances' }`; K3a-nav08 da un retroceso y `/finances`; K3a-b1 y K3b-b1 dan dos retrocesos y `/dashboard`; K3b-nav08 da `toque: 'none'`; los `NR-*` y `K2-b` siguen como estaban.
    - Con F3, `C-retroceso-unico` (nuevo y rojo antes del `fix`) fija que `consumeOwnedPanelEntry` chequea el consumo en vuelo antes de sus guardas y enciende la guarda con las MISMAS líneas que la rama `consume` de `applyPanelView`, con un solo `window.history.back()`, adentro del `try`.
    - Con F1, `C-pageshow-tab` (nuevo y rojo antes del `fix`) fija que, después de un consumo cuyo recorrido nunca llegó, un `pageshow` con `persisted` suelta la guarda: el toque siguiente a Egresos da `replace` y no quedan oyentes. Con F1 y F3, `C-pageshow-menu` fija lo mismo para el consumo del menú: un segundo `consumeOwnedPanelEntry` vuelve a retroceder.
    - Todos los casos viejos siguen en verde, incluido el candado de la guarda del 04-07 SIN tocarlo. La única aserción vieja que cambia es la cuenta de oyentes del B1, y sólo con F3.
  </behavior>
  <read_first>
    - `.planning/debug/tabs-en-la-url-medida.md` `## (l)` (lo escrito en el task 1: los veredictos, las tuplas rojas, el bloque de K1).
    - `lib/panel-history.ts` L18-37 (el encabezado), L925-1060 (la guarda y la rama `consume`) y L1181-1220 (`consumeOwnedPanelEntry` y su docblock, con el IN-05 en la L1188).
    - `lib/panel-branch.ts` L405-422 y L2028-2097, y `components/dashboard/unsaved-changes-guard.tsx` L255-290: confirmar que el guard llama a `runBranchNavigation` sin `reDecidir` y que el diseño no necesita tocar el módulo de la rama. SÓLO LECTURA.
    - `test/panel-branch.test.ts` L43-86 y L1262-1334; `lib/panel-history.test.ts` L533-582; `test/panel-tabs.test.ts` L137-247 y L885-908 (el candado del 04-07, que NO se toca).
    - `04-SECURITY.md` L88-117 y L139-165 (las filas T-04-39/T-04-40, AR-04-05/AR-04-06, el audit trail y el párrafo «Lo que esta firma NO dice») y `deferred-items.md` L80-92, L110-134.
  </read_first>
  <action>
**Paso 0 — la decisión y la matriz.** Al final de `(l)` se agrega una línea sola con este formato:
`decision caso 1 (<dueno, AAAA-MM-DD | previa del dueno, 2026-11-18>): <A | B | no-aplica>`. Es `no-aplica` si el caso 1
reprodujo, y si no, la respuesta del task 2. Con eso quedan definidas tres banderas:
- **F1** = el caso 1 reprodujo o la decisión fue A.
- **F2** = el caso 2 reprodujo.
- **F3** = el caso 3a o el 3b reprodujo.
Un caso sin su bandera NO recibe código (P-2). Se aplica `## El diseño del arreglo` (arriba), sólo en las partes de las
banderas encendidas.

**Paso 1 — los candados nuevos, ANTES del arreglo (sólo con F1 o F3).** Al final de `test/panel-tabs.test.ts`, después
del describe del task 1 (que NO se toca), va `describe('R2-WR-01 — los candados del arreglo (quick 261118-kat)', () => {`,
con el mismo `afterEach` que el del task 1.
- **Con F3, `it('C-retroceso-unico: …')`:** sobre el fuente sin comentarios de `lib/panel-history.ts` (con `sinComentarios`
  y `cuerpoDe` del archivo), recorta el cuerpo de `consumeOwnedPanelEntry` y la rama `consume` de `applyPanelView`. Afirma
  que en `consumeOwnedPanelEntry` la primera aparición de `consumoEnVuelo` va antes de `isForeignOwnedEntry(actual)`; que
  ahí hay un solo `window.history.back()`, después de `panelViewEntryParam(actual) === null`; y que las líneas recortadas
  (sin sangría) desde `consumoEnVuelo = true` hasta el cierre del `catch` son IGUALES en las dos ramas. Es el candado
  anti-deriva de la duplicación a propósito.
- **Con F1, la señal de `pageshow` en el simulador:** a `montarHistoria` se le AGREGAN una lista de oyentes de `pageshow`
  (en `addEventListener`/`removeEventListener`, antes de `if (tipo !== 'popstate') return`) y una variable de módulo
  `pageshowDelStub` que la despacha con `{ persisted }` y semántica `once`. Sólo se agregan líneas: `pila.oyentes` sigue
  contando nada más que los de `popstate`.
- **Con F1, `it('C-pageshow-tab: …')`:** sobre `pilaFin()`, `tocar(…, 'appointments')` da `consume` y no se procesa (el
  recorrido se fue a otro documento). Después `pageshowDelStub?.(true)` y `tras: tocar(TABS_FINANZAS, 'expenses')`.
  Esperado `{ tras: 'replace', oyentes: 0 }`.
- **Con F1 y F3, `it('C-pageshow-menu: …')`:** `PH.consumeOwnedPanelEntry()`, `pageshowDelStub?.(true)` y
  `otra: PH.consumeOwnedPanelEntry()`. Esperado `{ otra: true, retrocesos: 2 }`.
Correrlos y pegar en `(l)` el rojo de los que tienen que dar rojo (`C-retroceso-unico`, `C-pageshow-tab`). Commit
`test(quick-261118-kat): R2-WR-01 — los candados del arreglo, antes del arreglo` con el trailer.

**Paso 2 — el arreglo en `lib/panel-history.ts`**, exactamente como dice `## El diseño del arreglo`, en las partes de F2,
F3 y F1 que estén encendidas. Nada de temporizadores, nada de exportar la memoria, sin tocar `lib/panel-branch.ts`. Si el
diseño no alcanza, es P-4: PARAR.

**Paso 3 — las ediciones declaradas de pruebas viejas (sólo con F3; ninguna otra).**
(i) **`test/panel-branch.test.ts`.**
  - En `it('CON \`reDecidir\` engancha UN oyente…')` se reemplaza SÓLO la línea `expect(ctx.enganchados).toHaveLength(1)`
    por una línea de comentario fechada `(2026-11-18, quick 261118-kat)` y una aserción. El comentario dice que la guarda
    de `consumeOwnedPanelEntry` engancha ahora su propio oyente de liberación antes del retroceso, DESPUÉS del de B1. La
    aserción dice que los oyentes que no son de la guarda (los que no se llaman `soltarConsumo` ni
    `soltarAlVolverDeLaCache`) son exactamente uno.
  - Las aserciones de `enganchados[0]` quedan igual: el oyente de B1 sigue siendo el primero y va antes del retroceso.
  - Se AGREGA un drenaje en el `afterEach` del archivo, molde de sus L75-86. Una variable de módulo guarda los
    `enganchados` del último `montarPila`, y antes de los drenajes que ya están se llaman los oyentes registrados que se
    llaman `soltarConsumo`. Una guarda colgada de un caso no le puede ensuciar a otro el conteo de `desenganchados`.
(ii) **`lib/panel-history.test.ts` (IN-02), sólo en el preludio del describe de NAV-08, antes de su primer `it`.** El
  stub de `montarHistorial` pasa a tener `addEventListener` y `removeEventListener`, que registran los oyentes. El
  `afterEach` de ese describe llama a los `soltarConsumo` registrados antes de `vi.unstubAllGlobals()`.

**Paso 4 — los docblocks (SIEMPRE, aunque no reproduzca nada).** En `lib/panel-history.ts`:
- **El docblock de `consumoEnVuelo` (L927-932) y el de `soltarConsumo` (L935):** quién enciende la guarda (la rama
  `consume` y, con F3, `consumeOwnedPanelEntry`) y qué la apaga. Las salidas son: el `popstate` de su recorrido; el
  `catch` si el retroceso no arranca (con F2); el `pageshow` con `persisted` (con F1); y, con F3, el chequeo de identidad
  del state en `consumeOwnedPanelEntry` para cuando B1 corre adentro del `popstate` de su propio recorrido, antes que el
  oyente de la guarda. Además, que `soltarConsumo` saca sus oyentes.
- **En los ⚠ de `applyPanelView`, la viñeta de las L996-999:** se reemplaza la frase de que el módulo muere con el
  documento y la guarda no sobrevive por el número de K1: el veredicto y su motivo, citando `(l)`.
- **La viñeta de las L1000-1002:** se borra la garantía de que la guarda no se traba nunca. Queda escrito que el
  `popstate` ajeno la suelta antes de tiempo y degrada al comportamiento de antes. Y el residuo declarado: un `back()` que
  el navegador ignora EN SILENCIO (sin tirar ni recorrer) la deja encendida hasta el próximo recorrido o una recarga.
  Eso no se midió y queda fuera de los tres casos decididos.
- **La viñeta de las L1003-1007:** con F3, se reescribe: la guarda se comparte, por qué el orden de oyentes de B1 obliga
  al chequeo de identidad, y que el «Volver» de clientes la sigue heredando. Sin F3: «medido (quick 261118-kat): no
  reproduce», con los K3.
- **El encabezado (L30-31):** qué escucha el módulo después del arreglo: los oyentes de disparo único de la guarda y, con
  F1, el de `pageshow`. Nunca decide ni escribe desde ellos.
- **IN-05, en el docblock de `consumeOwnedPanelEntry` (L1188):** se reemplaza la frase que dice que el módulo no escucha
  el evento de historial por «no reescribe historial ajeno y no decide nada desde un `popstate`: los únicos que escucha
  son los oyentes de disparo único que sueltan la guarda del consumo en vuelo». Con F3, se documenta además el contrato
  nuevo: `true` también cuando ya hay un consumo en vuelo que cierra la subsección, porque el call site previene igual.
- Ningún comentario nuevo cita textual las frases que se borran.

**Paso 5 — commit.** eslint de los archivos tocados con rc 0. Si hay alguna bandera: `git add` de lo tocado y el commit
`fix(quick-261118-kat): R2-WR-01 — <lo que se arreglo: el back que tira suelta la guarda / la guarda se comparte con consumeOwnedPanelEntry / pageshow>`
con el trailer. Sin ninguna bandera: el commit es `docs(quick-261118-kat): el docblock de la guarda dice lo medido`.
Correr el PRIMER gate (estático, suites y build; P-7 si choca con un `next dev` vivo).

**Paso 6 — la no-regresión por el turno, en segundo plano.** Es el SEGUNDO gate tal cual: la sonda de la app completa,
la estática y los ocho del scroll en `tras-el-fix`, y K1 en `tras-el-fix` sólo si el caso 1 reprodujo. Si no hubo
cambio de código, sale con `no aplica`. **Anotar las rutas de los logs.** Cualquier otra cosa que no sea el verde es P-3.

**Paso 7 — el registro.**
- **En `(l)` sólo se agrega.** «El arreglo»: qué bandera se aplicó y por qué (citar la decisión), el rojo de los
  candados nuevos y el verde de los K/NR/C, con los números de los dos gates y las rutas de los logs. «Lo que NO cierra»:
  el teléfono real (la UAT corta va con obs-G1 después del push), Safari, Android, la pestaña restaurada, el `back()`
  ignorado en silencio y R2-IN-04, que sigue abierto. La última línea, sola:
  `cierre (l): la guarda de consumo en vuelo · caso 1=<mitigado|descartado-medido> · caso 2=<…> · caso 3=<…>`
  (`mitigado` sii su bandera está encendida).
- **En `deferred-items.md`,** en las tres entradas `- La guarda de consumo en vuelo no se extendió…`, `- R2-WR-01: …` y
  `- Decisión del dueño (2026-11-18, secure-phase): …`, se reemplaza SU `status: open` (y ningún otro) por
  `status: resolved (quick 261118-kat, <cerrado por mitigación | descartado medido>; medido en .planning/debug/tabs-en-la-url-medida.md ## (l))`,
  con la misma sangría, y se agrega al final de cada una una línea `**Cierre:** …` con el número.
- **En `04-SECURITY.md`:**
  - Se cambian SÓLO las filas `| T-04-39 |`, `| T-04-40 |`, `| AR-04-05 |` y `| AR-04-06 |`.
  - En AR-04-05 y AR-04-06 se agrega a la columna del racional `**Cerrado 2026-11-18 (quick 261118-kat): <cerrado por mitigación | descartado medido> — <el número>.**`.
    AR-04-05 dice el caso 2 y el caso 1 por separado. AR-04-06 dice el caso 3.
  - T-04-40 pasa a `closed (<mitigado | descartado medido>, quick 261118-kat)` y su «Lo que falta» dice lo hecho.
  - T-04-39 agrega que el residuo de AR-04-06 quedó cerrado.
  - En el audit trail se agrega una fila
    `| 2026-11-18 | 56 | … | 0 | quick 261118-kat: … |` con los números (K/NR/C, R-T 12/12, R-B1 4/4, estática 18/18,
    scroll 8/8).
  - Debajo del párrafo «⚠ Lo que esta firma NO dice» va una línea nueva fechada que dice que el vencimiento se cumplió.
    El párrafo viejo no se toca.
  - `threats_open: 0` y `status: verified` quedan.
Commit `docs(quick-261118-kat): R2-WR-01 cerrado — (l), deferred-items y 04-SECURITY con lo medido` con el trailer.

**Paso 8 — el SUMMARY** (`261118-kat-SUMMARY.md` en el directorio del quick, con la plantilla). Lleva
`requirements-completed: []`, los commits, el entorno, la tabla de los tres casos (medido, veredicto, qué se hizo), la
decisión del dueño, los números de los gates, las rutas de los logs, los residuos, y que **no se pusheó**: sale con
obs-G1, y la UAT corta en el teléfono queda para ese push. Lo commitea el orquestador junto con su contabilidad. **El
TERCER gate se corre recién con el SUMMARY escrito.**
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && T=test/panel-tabs.test.ts; TB=test/panel-branch.test.ts; TH=lib/panel-history.test.ts; PH=lib/panel-history.ts; S=.planning/debug/probes/g04-scroll-y-recarga.mjs; L=.planning/debug/tabs-en-la-url-medida.md; TL=$(git log --reverse --format=%H --grep='^test(quick-261118-kat)' HEAD); TLRC=$?; test "$TLRC" = 0 && test -n "$TL" || { echo "sin commit test(quick-261118-kat)"; exit 1; }; B="$(printf '%s\n' "$TL" | head -1)^"; KC=$(git log --format=%H -S"describe('R2-WR-01 — los tres casos" -- "$T" | tail -1); WL=$(tr -d '\r' < "$L"); VL=$(printf '%s\n' "$WL" | grep -E '^veredictos \(l\): ' | head -1); DL=$(printf '%s\n' "$WL" | grep -E '^decision caso 1 \([^)]*\): (A|B|no-aplica)$' | head -1); F1=0; F2=0; F3=0; case "$VL" in *"caso 1=reproduce"*) F1=1;; esac; case "$DL" in *": A") F1=1;; esac; case "$VL" in *"caso 2=reproduce"*) F2=1;; esac; case "$VL" in *"caso 3a=reproduce"*|*"caso 3b=reproduce"*) F3=1;; esac; DOK=0; case "$VL" in *"caso 1=reproduce"*) case "$DL" in *": no-aplica") DOK=1;; esac;; *"caso 1=no-reproduce"*) case "$DL" in *": A"|*": B") DOK=1;; esac;; esac; NEED=$((F1 + F2 + F3)); FXL=$(git log --format=%H --grep='^fix(quick-261118-kat)' HEAD); FXN=$(printf '%s\n' "$FXL" | grep -c .); FXOK=0; { [ "$NEED" -gt 0 ] && [ "$FXN" = 1 ]; } || { [ "$NEED" = 0 ] && [ "$FXN" = 0 ]; } && FXOK=1; TAL=$(git log --format=%H --grep='^test(quick-261118-kat)' "$KC"..HEAD | tail -1); TAOK=1; if [ "$F1" = 1 ] || [ "$F3" = 1 ]; then TAOK=0; [ -n "$TAL" ] && [ -n "$FXL" ] && git merge-base --is-ancestor "$TAL" "$(printf '%s\n' "$FXL" | head -1)" && TAOK=1; fi; RTK=$(git diff -U0 "$KC" HEAD -- "$T" | tr -d '\r' | grep -E '^-[^-]' | grep -c .); KB0=$(git show "$KC:$T" | tr -d '\r' | sed -n "/^describe('R2-WR-01 — los tres casos/,/^})\$/p"); KB1=$(tr -d '\r' < "$T" | sed -n "/^describe('R2-WR-01 — los tres casos/,/^})\$/p"); G70=$(git show "$KC:$T" | tr -d '\r' | sed -n "/^describe('G-04-7 —/,/^})\$/p"); G71=$(tr -d '\r' < "$T" | sed -n "/^describe('G-04-7 —/,/^})\$/p"); fuera() { git diff -U0 "$B" HEAD -- "$1" | tr -d '\r' | awk -v a="$2" -v b="$3" '/^@@/{split($2,r,","); s=substr(r[1],2)+0; n=(r[2]==""?1:r[2]+0); for(i=0;i<n;i++) if(s+i<a||s+i>b) print s+i}' | grep -c .; }; RB=$(git show "$B:$TB" | tr -d '\r' | awk '/it\(.CON `reDecidir` engancha UN oyente/{s=NR} s&&NR>s&&/^  }\)$/{print s, NR; exit}'); RH=$(git show "$B:$TH" | tr -d '\r' | awk '/^describe\(.consumeOwnedPanelEntry — tocar la secci/{s=NR} s&&NR>s&&/^  it\(/{print s, NR; exit}'); if [ "$F3" = 1 ]; then QB=$(fuera "$TB" ${RB% *} ${RB#* }); QH=$(fuera "$TH" ${RH% *} ${RH#* }); NB1=$(git diff -U0 "$B" HEAD -- "$TB" | tr -d '\r' | grep -cxF -- '-    expect(ctx.enganchados).toHaveLength(1)'); CRU=$(tr -d '\r' < "$T" | grep -c "^  it('C-retroceso-unico: "); else git diff --quiet "$B" HEAD -- "$TB" "$TH"; QB=$?; QH=$QB; NB1=1; CRU=1; fi; CPS=1; [ "$F1" = 1 ] && CPS=$(tr -d '\r' < "$T" | grep -c "^  it('C-pageshow-tab: "); NC=$(tr -d '\r' < "$PH" | grep -vE '^\s*(//|\*|/\*)'); PSA=$(printf '%s\n' "$NC" | grep -cF "addEventListener('pageshow'"); PSN=$(printf '%s\n' "$NC" | grep -c 'pageshow'); PER=$(printf '%s\n' "$NC" | grep -c 'persisted'); PSOK=0; { [ "$F1" = 1 ] && [ "$PSA" -ge 1 ] && [ "$PER" -ge 1 ]; } || { [ "$F1" = 0 ] && [ "$PSN" = 0 ]; } && PSOK=1; cuerpo() { awk '/^export function consumeOwnedPanelEntry\(\): boolean \{/{f=1} f{print} f&&/^}$/{exit}'; }; CO=$(tr -d '\r' < "$PH" | cuerpo); COB=$(git show "$B:$PH" | tr -d '\r' | cuerpo); COBK=$(printf '%s\n' "$CO" | grep -cF 'window.history.back()'); COES=$(printf '%s\n' "$CO" | grep -c 'estadoDelConsumo'); COIF=$(printf '%s\n' "$CO" | grep -n 'consumoEnVuelo' | head -1 | cut -d: -f1); COFO=$(printf '%s\n' "$CO" | grep -n 'isForeignOwnedEntry(actual)' | head -1 | cut -d: -f1); COOK=0; if [ "$F3" = 1 ]; then [ "$COBK" = 1 ] && [ "$COES" -ge 1 ] && [ -n "$COIF" ] && [ -n "$COFO" ] && [ "$COIF" -lt "$COFO" ] && COOK=1; else [ "$CO" = "$COB" ] && COOK=1; fi; PLAIN=$(printf '%s\n' "$NC" | grep -cF "if (consumoEnVuelo) return 'none'"); EXP=$(printf '%s\n' "$NC" | grep -cE '^export (let|const|var) (consumoEnVuelo|estadoDelConsumo)\b'); TMR=$(printf '%s\n' "$NC" | grep -cE 'setTimeout|setInterval'); OLD1=$(tr -d '\r' < "$PH" | grep -ci 'nunca queda colgada'); OLD2=$(tr -d '\r' < "$PH" | grep -cF 'no escucha `popstate` ni reescribe'); OLD3=$(tr -d '\r' < "$PH" | grep -c 'no sobrevive para trabar nada'); BL=$(git diff --name-only "$B" HEAD -- lib/overlay-history.ts lib/dirty-history.ts lib/panel-branch.ts scripts/con-turno.mjs next.config.ts app components proxy.ts package.json package-lock.json supabase); BLRC=$?; LIBX=$(git diff --name-only "$B" HEAD -- lib | grep -vxF -e "$PH" -e "$TH" | grep -c .); HC=$(sha1sum next.config.ts | cut -d' ' -f1); git diff --quiet HEAD -- lib test .planning/debug/probes; LIMPIO=$?; TSC=$(./node_modules/.bin/tsc --noEmit 2>&1 | grep -v '^\.next/' | grep -E 'error TS'); ./node_modules/.bin/eslint "$PH" "$T" "$TB" "$TH" "$S" > /dev/null 2>&1; EL=$?; PURA=$(./node_modules/.bin/vitest run --project pure 2>&1 | tr -d '\r'); PRC=$?; PAF=$(printf '%s\n' "$PURA" | grep -oE 'Test Files +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); PN=$(printf '%s\n' "$PURA" | grep -oE 'Tests +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); SUITES="test/panel-tabs.test.ts lib/panel-history.test.ts test/panel-history-clients.test.ts test/panel-history-sidebar.test.ts test/panel-branch.test.ts test/panel-nav-chrome.test.ts test/overlay-history.test.ts test/dirty-history.test.ts"; OUT=$(./node_modules/.bin/vitest run --project pure $SUITES 2>&1 | tr -d '\r'); RC8=$?; AF=$(printf '%s\n' "$OUT" | grep -oE 'Test Files +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); N8=$(printf '%s\n' "$OUT" | grep -oE 'Tests +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); PT=$(./node_modules/.bin/vitest run --project pure "$T" 2>&1 | tr -d '\r'); PTRC=$?; PTN=$(printf '%s\n' "$PT" | grep -oE 'Tests +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); BLD=$(npm run build 2>&1); BRC=$?; printf '%s\n' "$BLD" | tail -6; SUSP=$(printf '%s\n' "$BLD" | grep -ciE 'useSearchParams\(\) should be wrapped in a suspense|Missing Suspense boundary'); echo "banderas F1=$F1 F2=$F2 F3=$F3 (veredictos=[$VL] decision=[$DL] coherente=$DOK (1)) · fix=$FXN coherente=$FXOK (1) · candados antes del fix=$TAOK (1) · lineas quitadas de panel-tabs desde KC=$RTK (0) · bloque K identico=$([ "$KB0" = "$KB1" ] && [ -n "$KB1" ] && echo si || echo no) (si) · G-04-7 identico=$([ "$G70" = "$G71" ] && [ -n "$G71" ] && echo si || echo no) (si) · panel-branch fuera de lo declarado=$QB (0) linea declarada quitada=$NB1 (1) · panel-history.test fuera del preludio=$QH (0) · C-retroceso-unico=$CRU C-pageshow-tab=$CPS (1/1) · pageshow coherente=$PSOK (1) · consumeOwnedPanelEntry coherente=$COOK (1) · guarda llana=$PLAIN (1) exportada=$EXP (0) temporizadores=$TMR (0) · frases viejas=$OLD1/$OLD2/$OLD3 (0/0/0) · intocables=[$BL] (vacio, rc $BLRC) otros de lib=$LIBX (0) · next.config=$HC · sin commitear=$LIMPIO (0) · errores TS=[$TSC] (vacio) · eslint=$EL (0) · pura rc=$PRC (0) archivos=$PAF (>=77) casos=$PN (>=1854) · 8 suites rc=$RC8 (0) archivos=$AF (8) casos=$N8 (>=680) · panel-tabs rc=$PTRC (0) casos=$PTN (>=94) · build rc=$BRC (0) Suspense=$SUSP (0)"; test "$DOK" = 1 && test "$FXOK" = 1 && test "$TAOK" = 1 && test "$RTK" = 0 && test "$KB0" = "$KB1" && test -n "$KB1" && test "$G70" = "$G71" && test -n "$G71" && test -n "$RB" && test -n "$RH" && test "$QB" = 0 && test "$NB1" = 1 && test "$QH" = 0 && test "$CRU" = 1 && test "$CPS" = 1 && test "$PSOK" = 1 && test "$COOK" = 1 && test "$PLAIN" = 1 && test "$EXP" = 0 && test "$TMR" = 0 && test "$OLD1" = 0 && test "$OLD2" = 0 && test "$OLD3" = 0 && test -z "$BL" && test "$BLRC" = 0 && test "$LIBX" = 0 && test "$HC" = 8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578 && test "$LIMPIO" = 0 && test -z "$TSC" && test "$EL" = 0 && test "$PRC" = 0 && test -n "$PAF" && test "$PAF" -ge 77 && test -n "$PN" && test "$PN" -ge 1854 && test "$RC8" = 0 && test "$AF" = 8 && test -n "$N8" && test "$N8" -ge 680 && test "$PTRC" = 0 && test -n "$PTN" && test "$PTN" -ge 94 && test "$BRC" = 0 && test "$SUSP" = 0</automated>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && L=.planning/debug/tabs-en-la-url-medida.md; S=.planning/debug/probes/g04-scroll-y-recarga.mjs; WL=$(tr -d '\r' < "$L"); VL=$(printf '%s\n' "$WL" | grep -E '^veredictos \(l\): ' | head -1); DL=$(printf '%s\n' "$WL" | grep -E '^decision caso 1 \([^)]*\): (A|B|no-aplica)$' | head -1); F1=0; F2=0; F3=0; case "$VL" in *"caso 1=reproduce"*) F1=1;; esac; case "$DL" in *": A") F1=1;; esac; case "$VL" in *"caso 2=reproduce"*) F2=1;; esac; case "$VL" in *"caso 3a=reproduce"*|*"caso 3b=reproduce"*) F3=1;; esac; if [ $((F1 + F2 + F3)) = 0 ]; then echo "sin cambio de codigo: las sondas no aplican"; exit 0; fi; K1RUN=0; case "$VL" in *"caso 1=reproduce"*) K1RUN=1;; esac; LOGDIR=$(mktemp -d) || exit 1; LA="$LOGDIR/app.txt"; LE="$LOGDIR/estatica.txt"; LS="$LOGDIR/scroll.txt"; LK="$LOGDIR/k1.txt"; node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz > "$LA" 2>&1; RA=$?; node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs > "$LE" 2>&1; RE=$?; IDS=F-blanda-mas-movil,F-directa-movil,F-tarjeta-movil,F-sidebar-escritorio,N-negocio-borde-movil,G1-ventas-movil,G1-egresos-movil,G1-ventas-escritorio; node scripts/con-turno.mjs node "$S" "$IDS" verde-r2wr01 tras-el-fix > "$LS" 2>&1; RS=$?; RK=0; OKK=1; if [ "$K1RUN" = 1 ]; then node scripts/con-turno.mjs node "$S" K1-bfcache-cruce verde-k1-r2wr01 tras-el-fix > "$LK" 2>&1; RK=$?; OKK=$(tr -d '\r' < "$LK" | grep -cE '^OK  K1-bfcache-cruce '); fi; WA=$(tr -d '\r' < "$LA"); WE=$(tr -d '\r' < "$LE"); WS=$(tr -d '\r' < "$LS"); printf '%s\n' "$WA" | grep -E '^(OK  |FALLA )|recorridos medidos'; printf '%s\n' "$WE" | tail -4; printf '%s\n' "$WS" | grep -E '^(OK  |FALLA |ERROR-DEL-INSTRUMENTO)|^etiqueta=|paneles con alto minimo'; NT=$(printf '%s\n' "$WA" | grep -cE '^OK  R-T-'); NB=$(printf '%s\n' "$WA" | grep -cE '^OK  R-B1-'); OTRAS=$(printf '%s\n' "$WA" | grep -E '^FALLA ' | grep -v '^FALLA R-G3-10-primer-toque-atras-pronto '); NOC=$(printf '%s\n' "$WA" | grep -c 'la sonda no pudo completar'); MED=$(printf '%s\n' "$WA" | grep -oE 'recorridos medidos: [0-9]+' | grep -oE '[0-9]+'); OKE=$(printf '%s\n' "$WE" | grep -cE '^OK  E-'); OKS=$(printf '%s\n' "$WS" | grep -cE '^OK  (F-blanda-mas-movil|F-directa-movil|F-tarjeta-movil|F-sidebar-escritorio|N-negocio-borde-movil|G1-ventas-movil|G1-egresos-movil|G1-ventas-escritorio) '); VS=$(printf '%s\n' "$WS" | grep -cE '^etiqueta=verde-r2wr01 · modo=tras-el-fix · recorridos: 8 · coinciden con lo esperado tras el fix: 8$'); PAN=$(printf '%s\n' "$WS" | grep -cE '^finances-client\.tsx huella=[0-9a-f]{16} paneles con alto minimo: 3$'); ER=$(printf '%s\n' "$WS" | grep -cE '^ERROR-DEL-INSTRUMENTO|la sonda no pudo completar'); echo "logs: app=$LA estatica=$LE scroll=$LS k1=$LK · app R-T OK=$NT (12) R-B1 OK=$NB (4) otras FALLA=[$OTRAS] (vacio) medidos=$MED no completo=$NOC (0) rc=$RA (1 por la FALLA declarada) · estatica rc=$RE (0) OK=$OKE (18) · scroll rc=$RS (0) OK=$OKS (8) veredicto 8/8=$VS (1) paneles=$PAN (1) fallos=$ER (0) · K1 tras el fix (si el caso 1 reprodujo)=$OKK (1) rc=$RK (0)"; test "$NT" = 12 && test "$NB" = 4 && test -z "$OTRAS" && test "$NOC" = 0 && test -n "$MED" && test "$RE" = 0 && test "$OKE" = 18 && test "$RS" = 0 && test "$OKS" = 8 && test "$VS" = 1 && test "$PAN" = 1 && test "$ER" = 0 && test "$OKK" = 1 && test "$RK" = 0</automated>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && L=.planning/debug/tabs-en-la-url-medida.md; DI=.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md; SEC=.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-SECURITY.md; SUM=.planning/workstreams/panel-nav/quick/261118-kat-r2-wr-01-la-guarda-de-consumo-en-vuelo-s/261118-kat-SUMMARY.md; TL=$(git log --reverse --format=%H --grep='^test(quick-261118-kat)' HEAD); TLRC=$?; test "$TLRC" = 0 && test -n "$TL" || { echo "sin commit test(quick-261118-kat)"; exit 1; }; B="$(printf '%s\n' "$TL" | head -1)^"; WL=$(tr -d '\r' < "$L"); VL=$(printf '%s\n' "$WL" | grep -E '^veredictos \(l\): ' | head -1); DL=$(printf '%s\n' "$WL" | grep -E '^decision caso 1 \([^)]*\): (A|B|no-aplica)$' | head -1); F1=0; F2=0; F3=0; case "$VL" in *"caso 1=reproduce"*) F1=1;; esac; case "$DL" in *": A") F1=1;; esac; case "$VL" in *"caso 2=reproduce"*) F2=1;; esac; case "$VL" in *"caso 3a=reproduce"*|*"caso 3b=reproduce"*) F3=1;; esac; m() { if [ "$1" = 1 ]; then echo mitigado; else echo descartado-medido; fi; }; CE="cierre (l): la guarda de consumo en vuelo · caso 1=$(m $F1) · caso 2=$(m $F2) · caso 3=$(m $F3)"; ULT=$(printf '%s\n' "$WL" | grep -v '^$' | tail -1); REML=$(git diff -U0 "$B" HEAD -- "$L" | tr -d '\r' | grep -E '^-[^-]' | grep -c .); DIR=$(git diff -U0 "$B" HEAD -- "$DI" | tr -d '\r' | grep -E '^-[^-]' | sed 's/^-//'); NDIR=$(printf '%s\n' "$DIR" | grep -c .); DIRO=$(printf '%s\n' "$DIR" | grep -cxF '  status: open'); WDI=$(tr -d '\r' < "$DI"); OPEN=$(printf '%s\n' "$WDI" | grep -c 'status: open'); est() { printf '%s\n' "$WDI" | awk -v h="$1" 'index($0, h) == 1 {f=1; next} f && /^  status:/ {print; exit}'; }; RES=0; for h in '- R2-WR-01:' '- La guarda de consumo en vuelo no se extendi' '- Decisión del dueño (2026-11-18, secure-phase)'; do case "$(est "$h")" in "  status: resolved (quick 261118-kat"*) RES=$((RES + 1));; esac; done; WS=$(tr -d '\r' < "$SEC"); A5=$(printf '%s\n' "$WS" | grep -E '^\| AR-04-05 \|' | grep 'quick 261118-kat' | grep -cE 'cerrado por mitigación|descartado medido'); if [ "$F3" = 1 ]; then A6=$(printf '%s\n' "$WS" | grep -E '^\| AR-04-06 \|' | grep 'quick 261118-kat' | grep -c 'cerrado por mitigación'); else A6=$(printf '%s\n' "$WS" | grep -E '^\| AR-04-06 \|' | grep 'quick 261118-kat' | grep -c 'descartado medido'); fi; T40=$(printf '%s\n' "$WS" | grep -E '^\| T-04-40 \|' | grep -c 'quick 261118-kat'); AT=$(printf '%s\n' "$WS" | grep -E '^\| 2026-11-' | grep -c '261118-kat'); TO=$(printf '%s\n' "$WS" | grep -cxF 'threats_open: 0'); SV=$(printf '%s\n' "$WS" | grep -cxF 'status: verified'); RSEC=$(git diff -U0 "$B" HEAD -- "$SEC" | tr -d '\r' | grep -E '^-[^-]' | grep -vE '^-\| (T-04-39|T-04-40|AR-04-05|AR-04-06) \|' | grep -c .); DC=$(git log --format=%H --grep='^docs(quick-261118-kat)' HEAD | grep -c .); git diff --quiet HEAD -- "$L" "$DI" "$SEC"; LIMPIO=$?; test -f "$SUM"; SUMOK=$?; RQ=$(grep -c 'requirements-completed: \[\]' "$SUM" 2>/dev/null); FX=$(git log --format=%H --grep='^fix(quick-261118-kat)' HEAD | head -1); REMOTO=""; RRC=0; if [ -n "$FX" ]; then REMOTO=$(git branch -r --contains "$FX" 2>&1); RRC=$?; fi; echo "cierre esperado=[$CE] ultima linea=[$ULT] · lineas quitadas de la medida=$REML (0) · deferred quitadas=$NDIR (3) y son status open=$DIRO (3) · abiertas=$OPEN (8) · entradas resueltas por el quick=$RES (3) · AR-04-05=$A5 (1) AR-04-06=$A6 (1) T-04-40=$T40 (1) audit trail=$AT (>=1) threats_open 0=$TO (1) verified=$SV (1) · otras lineas de SECURITY cambiadas=$RSEC (0) · commits docs=$DC (>=2) · sin commitear=$LIMPIO (0) · SUMMARY=$SUMOK (0) requirements-completed vacio=$RQ (>=1) · fix en el remoto=[$REMOTO] (vacio: no se pusheo; rc $RRC)"; test "$ULT" = "$CE" && test "$REML" = 0 && test "$NDIR" = 3 && test "$DIRO" = 3 && test "$OPEN" = 8 && test "$RES" = 3 && test "$A5" = 1 && test "$A6" = 1 && test "$T40" = 1 && test "$AT" -ge 1 && test "$TO" = 1 && test "$SV" = 1 && test "$RSEC" = 0 && test "$DC" -ge 2 && test "$LIMPIO" = 0 && test "$SUMOK" = 0 && test -n "$RQ" && test "$RQ" -ge 1 && test "$RRC" = 0 && test -z "$REMOTO"</automated>
    <fails_when>**El segundo gate se corre en segundo plano (`run_in_background`)**, por la misma razón que en el task 1.

**El primero falla si:**
- La línea de decisión no es coherente con el veredicto del caso 1.
- El `fix` no existe habiendo una bandera, o existe sin ninguna.
- Con F1 o F3, los candados nuevos no van en un `test` anterior al `fix`.
- Se quitó una línea de `panel-tabs` desde `KC`, o cambiaron el bloque de los K o el describe G-04-7 (incluido el candado del 04-07).
- En `panel-branch.test.ts` cambió algo fuera del caso declarado del B1, o en `panel-history.test.ts` algo fuera del preludio del describe de NAV-08 (sin F3, los dos tienen que quedar intactos).
- Falta un candado `C-*` que corresponde.
- Hay `pageshow` en el código sin F1, o falta con F1.
- Con F3, `consumeOwnedPanelEntry` no chequea el consumo en vuelo antes de su guarda ajena o tiene más de un retroceso; sin F3, cambió.
- Desapareció la línea llana de la guarda, la memoria se exporta o hay un temporizador.
- Queda alguna de las tres frases viejas del docblock.
- Cambió un intocable (`lib/panel-branch.ts` incluido) o un archivo de `lib` que no es `lib/panel-history.ts` ni `lib/panel-history.test.ts`.
- `next.config.ts` tiene otra huella, o quedan cambios sin commitear.
- `tsc`, eslint, la pura, las 8 suites, `panel-tabs` o el build en rojo, o por debajo de su piso.

**El segundo falla si:** algún `R-T-*` o `R-B1-*` no está en `OK`; hay una FALLA en la app que no es la declarada (P-3); la estática da menos de 18; el scroll da menos de 8/8 o no midió con `paneles con alto minimo: 3`; o K1 no da `OK` en `tras-el-fix` cuando el caso 1 reprodujo.

**El tercero falla si:**
- La última línea de `(l)` no es el `cierre (l)` que corresponde a las banderas, o cambió una línea vieja de la medida.
- En `deferred-items.md` se quitó otra línea que no son los tres `status: open`, quedan otras que 8 abiertas, o las tres entradas no quedaron `resolved (quick 261118-kat…`.
- En `04-SECURITY.md`: AR-04-05 o AR-04-06 no tienen su cierre (AR-04-06 con el tipo que corresponde a F3), T-04-40 no está al día, falta la fila del audit trail, cambiaron `threats_open`/`status`, o cambió otra línea que no son las cuatro filas.
- Faltan el `docs` del task, el SUMMARY o el `requirements-completed: []`.
- El `fix` ya está en una rama remota.</fails_when>
  </verify>
  <done>Se arregló exactamente lo que reprodujo (y el caso 1 según el veredicto o la decisión del dueño), con los candados nuevos commiteados antes del `fix`. Los nueve casos del task 1 quedaron idénticos y en verde. La única aserción vieja que cambió es la declarada del B1, y sólo con F3. `lib/panel-branch.ts` y los intocables siguen intactos. Los docblocks dicen lo medido y ya no prometen una garantía falsa. `tsc`, eslint, la pura, las 8 suites, `panel-tabs` y el build están en verde. Por el turno: R-T 12/12, R-B1 4/4 (sólo la FALLA declarada), estática 18/18, scroll 8/8 y K1 `OK` si correspondía. `(l)` termina en `cierre (l)`, las tres entradas de `deferred-items.md` están resueltas (quedan 8 abiertas), AR-04-05 y AR-04-06 están cerrados con el número en `04-SECURITY.md`, el SUMMARY existe y nada se pusheó.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dueño (sesión) → historial del panel | El arreglo cambia CUÁNDO se retrocede: un retroceso de más deja al dueño fuera de la sección y, con B1, fuera del sitio (la cicatriz 2). No hay query, policy, route handler ni dato nuevo, y el aislamiento por `business_id` no se toca. |
| sonda → la página y la base local | K1 escribe UNA marca de historial en la página de prueba (declarada como `forzado:`) y no escribe en la base: el login sembrado es el de siempre. |
| registro de la medición | Los esperados se fijan antes de la corrida que los juzga, y los veredictos de `(l)` se recalculan de lo medido. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-kat-01 | Tampering | esperados de K2/K3/NR (`test/panel-tabs.test.ts`) y de K1 (sonda) | medium | mitigate | Commit `test(quick-261118-kat)` antes de medir. El gate 1 del task 1 exige 0 líneas quitadas y los esperados de K1 textuales. El gate 1 del task 3 exige el bloque K y el describe G-04-7 idénticos desde `KC` y 0 líneas quitadas de `panel-tabs` desde `KC`. El gate 3 del task 1 recalcula la línea de veredictos de vitest y del bloque de K1 pegado. |
| T-kat-02 | Denial of Service (dueño fuera del sitio) | `consumeOwnedPanelEntry` y el segundo paso de B1 | high | mitigate | El diseño no toca las dos guardas ni su orden. Con un consumo en vuelo, el menú devuelve `true` SIN retroceder y nunca hace un retroceso sobre una entrada ajena. El chequeo de identidad respeta que el oyente de B1 corre antes. Lo fijan `NR-b1-control`, `NR-b1-reentrada` y `NR-b1-triple` (verdes antes y después), K3a-b1 y K3b-b1 (el tercer retroceso que salía a `/afuera`) y, en la app, R-B1-* 4/4, R-T-* 12/12 y la estática 18/18. `lib/panel-branch.ts` queda intacto (gate). |
| T-kat-03 | Denial of Service (tabs muertos) | `consumoEnVuelo` | medium | mitigate | Las salidas medidas son: el `popstate` de su recorrido, el `catch` del retroceso (K2-a/K2-b), el `pageshow` con `persisted` si corresponde (`C-pageshow-*`) y el chequeo de identidad para B1. Sin temporizador (gate). El residuo es un `back()` que el navegador ignora en silencio: declarado en el docblock y en `(l)`, sin medir, fuera de los tres casos decididos. |
| T-kat-04 | Repudiation | cierre de AR-04-05 y AR-04-06 | medium | mitigate | Cada cierre lleva su número (`(l)`, la fila del audit trail y las líneas `**Cierre:**`). Un caso que no reproduce se cierra «descartado medido» y no «mitigado». El caso 1 sin reproducción lo decide el dueño (checkpoint). El gate 3 del task 3 exige la coherencia entre banderas y cierres. |
| T-kat-05 | Denial of Service | turno de pantalla y `next dev` ajenos | low | mitigate | Toda corrida con navegador pasa por `scripts/con-turno.mjs`, en segundo plano y sin Ctrl+C. Las sondas miden contra un `next dev` existente sin matarlo. El de forjo-landing (3000) no se toca. |
| T-kat-06 | Tampering | la base local | low | mitigate | Ninguna escritura: K1 navega y escribe sólo historial en la página de prueba, y `supabase start` es el único comando de la pila permitido. |
| T-kat-SC | Tampering | paquetes | low | accept | Cero dependencias nuevas: `package.json` y `package-lock.json` están en la lista de intocables del gate 1 del task 3. |
</threat_model>

<verification>
- **Medición antes del arreglo:**
  - `./node_modules/.bin/vitest run --project pure test/panel-tabs.test.ts` con los nueve casos commiteados: los K rojos
    por su aserción, los `NR-*` y `K2-b` en verde, ningún caso viejo en rojo.
  - `node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs K1-bfcache-cruce medicion-r2wr01 hipotesis`
    da una línea de veredicto, sin fallo del instrumento.
  - `(l)` con `veredictos (l): …` coherente.
- **Si `caso 1=no-reproduce`:** el checkpoint del dueño (A/B), sin decidir por él.
- **Arreglo sólo de lo que reprodujo:** candados `C-*` en un `test` anterior al `fix`, los nueve casos idénticos y
  verdes, `lib/panel-branch.ts` intacto y una sola aserción vieja cambiada (la del B1, con F3).
- **No-regresión:**
  - `./node_modules/.bin/tsc --noEmit` sin `error TS`.
  - eslint por archivo.
  - Pura >= 77/1854, 8 suites >= 680, `panel-tabs` >= 94.
  - `npm run build` en verde.
  - Por el turno: la app completa (R-T 12/12, R-B1 4/4, sólo la FALLA declarada), la estática 18/18, el scroll 8/8 en
    `tras-el-fix` y K1 `OK` si el caso 1 reprodujo.
- **Registro:** `(l)` terminada en `cierre (l)`, `deferred-items.md` con 8 abiertas, `04-SECURITY.md` con AR-04-05/06
  cerrados y una fila nueva en el audit trail. Nada pusheado.
</verification>

<success_criteria>
- Los tres casos medidos con el código de antes y con los esperados fijados antes de medir: el caso 2 y el caso 3 (en
  los dos sentidos, por NAV-08 y por B1) en el simulador fiel con los ejecutores reales, y el caso 1 en Chrome por CDP.
- Se arregla lo que reprodujo y nada más. El caso 1 que no reproduce lo decide el dueño.
- B1 sigue terminando igual (control, reentrada de dos fichas y retroceso triple), con `consume-view-then-navigate`
  intacto.
- El docblock deja de afirmar una garantía que no se midió.
- AR-04-05 y AR-04-06 se cierran con el número, por mitigación o como descartado medido.
- Sin regresión en las suites ni en las sondas. Nada pusheado: sale con obs-G1, y la UAT corta en el teléfono la arma el
  orquestador después del push.
</success_criteria>

<output>
Crear `.planning/workstreams/panel-nav/quick/261118-kat-r2-wr-01-la-guarda-de-consumo-en-vuelo-s/261118-kat-SUMMARY.md` al terminar.

Si el plan para en el task 2 (checkpoint), el ejecutor NO escribe el SUMMARY final. Devuelve el checkpoint con los
números de K1 copiados de `(l)` y las opciones A/B.

Con P-0, P-1, P-1b, P-3 o P-4, el SUMMARY dice dónde se paró, pega lo medido y deja la pregunta para el dueño, con
opciones. Por ejemplo: con P-1b, que el simulador no representa B1 y que el caso 3 hay que medirlo en la app por CDP con
un instrumento propio; con P-4, qué parte del diseño chocó y con qué.
</output>
