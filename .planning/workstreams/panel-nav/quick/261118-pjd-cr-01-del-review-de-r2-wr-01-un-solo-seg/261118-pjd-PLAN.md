---
phase: quick-261118-pjd
plan: "01"
type: execute
wave: 1
depends_on: []
quick_id: 261118-pjd
files_modified:
  - test/panel-tabs.test.ts
  - test/panel-branch.test.ts
  - lib/panel-history.test.ts
  - .planning/debug/tabs-en-la-url-medida.md
  - lib/panel-branch.ts
  - lib/panel-history.ts
  - app/(dashboard)/finances/finances-client.tsx
  - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md
  - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-SECURITY.md
autonomous: false
# B1 (plan 04-04) y la guarda de consumo en vuelo sirven a los tabs de Negocio/Configuración (MOB-08) y de Finanzas (MOB-09).
# Se LISTAN, no se marcan: los dos están Complete desde la re-UAT 8/8 del 04-08. El SUMMARY lleva requirements-completed: [].
requirements: [MOB-08, MOB-09]

estimate:
  tokens: 100000
  raw_tokens: 100000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "CR-01, WR-02, WR-01, la parte de `pageshow` (WR-03/IN-01) y el doble toque sobre `up` (`UP-doble`, decisión del dueño 2026-11-18: medirlo y arreglarlo si da rojo) quedaron MEDIDOS con el código de hoy y con los esperados commiteados en `test(quick-261118-pjd)` antes de la primera corrida que los juzga, en el simulador de `test/panel-tabs.test.ts` (ejecutores REALES con `backAsincrono`) y en el `montarPila` de `test/panel-branch.test.ts`. `## (m)` lleva la línea `veredictos (m): CR-01=… · WR-02=… · WR-01=… · IN-01=… · UP=…`, recalculada de lo medido"
    - "Dos toques a Inicio desde una sección con la marca de la rama, antes del recorrido, retroceden UNA vez (`UP-doble`; control `UP-control`): si reprodujo, `consumeOwnedBranchEntry` comparte la MISMA guarda de consumo en vuelo con el mismo bloque de encendido que `applyPanelView`/`consumeOwnedPanelEntry`, vigilado por `C-retroceso-unico-rama`; si no reprodujo, queda registrado con el número y sin código"
    - "Un doble (o triple) toque a Inicio en la barra antes del recorrido deja UN solo segundo paso de B1 pendiente: el nuevo reemplaza al anterior (D del dueño, 2026-11-18) y el dueño termina en Inicio, nunca fuera del sitio (`CR-b1-doble`, `CR-b1-doble-fichas`, `CR-b1-reemplazo-unidad`)"
    - "Un `back()` que tira dentro de cualquiera de las tres ramas de dos pasos de `runBranchNavigation` desengancha su segundo paso y relanza el mismo error: el siguiente atrás del sistema no navega solo (`K2-c-b1`, `K2-c-b1-unidad`, `K2-c-exit`, `K2-c-colapso`)"
    - "Un `pageshow` no persistido no suelta la guarda ni gasta su salida por la bfcache; `soltarConsumo` saca el oyente de `pageshow` en todas sus salidas; y las dos cosas están probadas por mutación (M1 y M2 en rojo con el código mutado, revertido con Edit)"
    - "WR-01 se arregla sólo si reproduce Y el dueño elige A o B en el checkpoint; con C se registra con el número (`it.fails`, AR-04-07); si no reproduce, se cierra con el número y no deja código"
    - "B1 queda igual en todo lo demás: `panelNavMode` y `panelBranchPlan` byte-idénticas, el cambio de `lib/panel-branch.ts` confinado a `runBranchNavigation` y a su memoria, los NR del quick 261118-kat y `NR-menu-y-barra` verdes, R-B1-* 4/4 (con el retroceso triple de R-B1-inicio), R-T-* 12/12 (única FALLA la declarada), estática 18/18, scroll 8/8"
    - "Sin regresión: `tsc` limpio, eslint por archivo (en `finances-client.tsx` sólo la deuda medida: 1 error en 467:21), pura >= 77 archivos / >= 1875 casos, 8 suites >= 701, `panel-tabs` >= 111 (uno más en cada piso si se agrega `C-retroceso-unico-rama`), build ok. Los docblocks dicen la verdad después del arreglo (WR-04, WR-01, IN-01) y el comentario de obs-G1 deja de subestimar el blanco (IN-02). Nada se pushea"
  artifacts:
    - path: test/panel-tabs.test.ts
      provides: "el contador de oyentes de `pageshow` del simulador, el `describe('CR-01 del review de R2-WR-01 — medidos antes de arreglar …')` con los 14 casos y, si `UP-doble` reprodujo, el candado `C-retroceso-unico-rama`"
    - path: test/panel-branch.test.ts
      provides: "el drenaje por despacho de los oyentes vivos (IN-03), el candado de orden que nombra al oyente de B1 y el `describe` del mecanismo de los dos pasos con 4 casos"
    - path: lib/panel-branch.ts
      provides: "`segundoPasoB1Pendiente` (un solo segundo paso de B1) y el `try` de las tres ramas de dos pasos"
    - path: lib/panel-history.ts
      provides: "el `pageshow` sin `once`, el criterio de llegada que eligió el dueño para WR-01 (si corresponde), la guarda compartida con `consumeOwnedBranchEntry` (si `UP-doble` reprodujo) y los docblocks corregidos"
    - path: .planning/debug/tabs-en-la-url-medida.md
      provides: "`## (m)`: la medición, la decisión de WR-01, el arreglo, las mutaciones y `cierre (m)`"
  key_links:
    - from: "el `segundoPaso` de `consume-view-then-navigate` (`lib/panel-branch.ts:405-422`)"
      to: "`segundoPasoB1Pendiente`"
      via: "el toque nuevo desengancha el pendiente anterior antes de enganchar el suyo; el que corre se suelta a sí mismo ANTES de `reDecidir`, porque `reDecidir` puede volver a entrar a la misma rama (dos fichas apiladas)"
    - from: "`consumeOwnedPanelEntry` con un consumo en vuelo (devuelve `true` sin retroceder)"
      to: "B1"
      via: "con un solo re-decisor pendiente, ese `true` ya no le suma retrocesos a la barra (el mecanismo de CR-01 y de WR-04)"
    - from: "`consumeOwnedBranchEntry` (`up`, el primer paso del colapso y su `second-consume`)"
      to: "la guarda de consumo en vuelo (`consumoEnVuelo`)"
      via: "si `UP-doble` reprodujo: el mismo chequeo de consumo en vuelo que el menú, antes de sus dos guardas, y el mismo bloque de encendido; adentro del `popstate` de su propio recorrido el chequeo ve que el recorrido llegó y sigue, así que el `up` de B1 y el `second-consume` del colapso retroceden como hoy"
    - from: "los casos nuevos"
      to: "los ejecutores reales"
      via: "`montarHistoria({ backAsincrono: true })` con `procesar()` antes de afirmar, y `montarPila` con `back` que tira por `mockImplementationOnce`"
---

<objective>
Cerrar el code review del quick 261118-kat (`261118-kat-REVIEW.md`) con lo que decidió el dueño el **2026-11-18**:
**arreglar ANTES del push conjunto** (obs-G1 + R2-WR-01 + este). RED primero, con los esperados commiteados; arreglo sólo
de lo que reproduce; WR-01 se mide primero y, si reproduce, el diseño lo decide el dueño en un checkpoint.

Los hallazgos:
1. **CR-01 (critical, en prod desde B1):** con un consumo en vuelo, `consumeOwnedPanelEntry` devuelve `true` sin
   retroceder, pero B1 ya enganchó su segundo paso. Dos toques a Inicio ⇒ dos segundos pasos en el mismo `popstate` ⇒ 3
   retrocesos y `/afuera`. Arreglo decidido: **un solo segundo paso de B1 pendiente; el nuevo reemplaza al anterior.**
2. **WR-02:** si el `back()` tira dentro de B1 (y de las otras dos ramas de dos pasos), el segundo paso queda colgado y
   el siguiente atrás del sistema navega solo. Arreglo decidido: `try` en `runBranchNavigation` que lo desengancha.
3. **WR-03 + IN-01 + IN-03:** los candados de `pageshow` no miden la limpieza ni el `persisted: false`; el `once` del
   `pageshow` contradice su condicional; el drenaje de los tests depende de `fn.name` y el candado de orden ya no
   distingue el oyente de B1 del de la guarda.
4. **WR-01 — MEDIR PRIMERO:** un `replaceState` de Next en la ventana cambia la identidad del state y la guarda se suelta
   antes de tiempo (2 retrocesos por el menú, 3 y `/afuera` por B1).
5. **WR-04:** el docblock del `back()` ignorado en silencio tiene que decir la verdad después del arreglo.
6. **IN-02:** el comentario de obs-G1 en `finances-client.tsx` subestima el blanco. Sólo el comentario.
7. **UP-doble (visto por lectura al planificar; decisión del dueño 2026-11-18: «medirlo y arreglarlo si da rojo»):**
   `consumeOwnedBranchEntry` no tiene guarda de consumo en vuelo, así que dos toques a Inicio desde una sección con la
   marca de la rama, antes del recorrido, darían dos retrocesos. Se mide con `UP-doble` (y el control `UP-control`); si
   reproduce, `consumeOwnedBranchEntry` comparte la MISMA guarda (mismo chequeo, mismo bloque de encendido, candado
   anti-deriva `C-retroceso-unico-rama`). El arreglo de CR-01 (segundo paso único) NO cambia por esto.
8. **Registro:** `## (m)` en la medida, `04-SECURITY.md` (T-04-39/40, AR-04-06 corregido con el número; AR-04-07 sólo
   si WR-01 queda aceptado) y `deferred-items.md` al día, con el número de `UP-doble` aunque no reproduzca.

Purpose: CR-01 saca al dueño del sitio con un gesto común (el doble toque impaciente en la barra de mobile, que no tiene
debounce), y el registro de la Phase 4 declara «caso 3 mitigado» para la barra cuando no lo está. Es la cicatriz 2.

Output: los casos commiteados ANTES de medir (`test`); la medición con sus veredictos en `(m)` (`docs`); el checkpoint
del dueño si WR-01 reproduce; el arreglo (`fix`); las mutaciones; la no-regresión por el turno; el registro (`docs`).

**Fuera de alcance, a propósito:** R2-IN-04; el doble toque sobre el COLAPSO (dos toques desde Más → sección antes del
recorrido: `UP-doble` mide sólo la subida; con la guarda compartida el colapso queda cubierto por lectura, pero no se mide
acá y se DECLARA en `(m)`); usar la guarda compartida de `consumeOwnedBranchEntry` como arreglo de CR-01 (para CR-01 el
dueño eligió el segundo paso único, y ese diseño no cambia); cualquier UAT (la UAT corta en el teléfono va después del push conjunto y la arma el
orquestador); ROADMAP, STATE y REQUIREMENTS.
</objective>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/workstreams/panel-nav/STATE.md
@.planning/workstreams/panel-nav/quick/261118-kat-r2-wr-01-la-guarda-de-consumo-en-vuelo-s/261118-kat-REVIEW.md
@.planning/workstreams/panel-nav/quick/261118-kat-r2-wr-01-la-guarda-de-consumo-en-vuelo-s/261118-kat-SUMMARY.md
@.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-SECURITY.md
@.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md
@AGENTS.md
@.claude/CLAUDE.md
@.claude/skills/convenciones-forjo/SKILL.md
</context>

<!-- plan-criteria-allow: R4 - ningun git va en una etapa de tuberia que se juzgue: cada git diff / git log / git show que funda un candado es una asignacion $(...) o alimenta un awk/tr de recorte; el escaner une segmentos a traves de las comillas simples de las regex ('a|b') y lee esa barra como una tuberia -->
<!-- plan-criteria-allow: R1 - cada conteo exacto cuenta LINEAS a proposito: un caso por linea (14 en panel-tabs, 4 en panel-branch), tres aserciones declaradas de FUP, un OK por recorrido (12 R-T, 4 R-B1, 18 E, 8 del scroll), un status por entrada de deferred-items (8 abiertas, 9 con C), un try/throw por rama de dos pasos (3), una linea de pageshow por bloque de encendido (2); son formatos de una linea por item que el plan fija, y ninguno puede valer distinto en HEAD antes de ejecutar porque los items todavia no existen -->
<!-- planner-discipline-allow: fn.name === 'soltarConsumo' -->
<!-- planner-discipline-allow: window.addEventListener('pageshow', soltarAlVolverDeLaCache, { once: true }) -->
<!-- planner-discipline-allow: un tab vacío deja blanco debajo de su aviso -->
<!-- planner-discipline-allow: estadoDelConsumo -->
<!-- planner-discipline-allow: urlDelConsumo -->
<!-- planner-discipline-allow: capture: true -->
<!-- planner-discipline-allow: it.fails -->
<!-- planner-discipline-allow: setTimeout -->
<!-- planner-discipline-allow: status: open -->
<!-- planner-discipline-allow: ERROR-DEL-INSTRUMENTO -->
<!-- planner-discipline-allow: la sonda no pudo completar -->
<!-- planner-discipline-allow: FALLA -->
<!-- planner-discipline-allow: R-G3-10-primer-toque-atras-pronto -->
<!-- planner-discipline-allow: TypeError -->
<!-- planner-discipline-allow: expect(ctx.enganchados[0].fn.name).toBe('segundoPaso') -->
<!-- (expect(ctx.enganchados[0].fn.name).toBe('segundoPaso') es POSITIVO: el gate 1 del task 1 exige que aparezca exactamente 1 vez en test/panel-branch.test.ts; el escaner lee su conteo como negativo) -->
<!-- (fn.name === 'soltarConsumo' es la linea vieja del drenaje que IN-03 saca: el gate del task 1 la exige en 0 en las dos suites. La linea de pageshow con once es la que IN-01 cambia: el gate del task 3 la exige en 0 SOLO con IN-01=reproduce, y en 2 si no. La frase del tab vacio es la de obs-G1 que IN-02 corrige: 0 despues. estadoDelConsumo, urlDelConsumo, capture: true e it.fails son CONDICIONALES a la decision de WR-01: el gate exige o niega cada uno segun A/B/C/no-aplica, y las opciones del checkpoint los nombran porque son el diseno. setTimeout se exige en 0, igual que hoy. status: open se cuenta para exigir 8 (9 con C). ERROR-DEL-INSTRUMENTO, la sonda no pudo completar, FALLA, R-G3-10-primer-toque-atras-pronto y TypeError son salidas de las sondas y de vitest: los actions los nombran para decir cuando PARAR) -->

## Lo medido al planificar (2026-11-18, HEAD `73ff6cc`, sólo lectura)

- **El simulador del revisor, re-corrido hoy** contra el código de HEAD (el `fix` es `87868c4` y después sólo hubo
  `docs`): `node …/scratchpad/rev/guard.run.mjs` dio A `{retrocesos: 2, url: /dashboard}`, B `{3, /afuera}`, C (doble
  toque a la barra) `{3, /afuera}`, D (menú y barra) `{2, /dashboard}` ✔, E (B1 con un `back()` que tira y después un atrás
  del sistema) `{2, /dashboard}` (lo correcto es `{1, /finances}`). Es la REFERENCIA para escribir los casos del repo, no un
  artefacto del repo: el veredicto lo da la suite.
- **B1** (`lib/panel-branch.ts:405-422`): `segundoPaso` (un closure por toque) se engancha con `{ once: true }` ANTES de
  `consumeOwnedPanelEntry()`, sin `try`. Las otras dos ramas de dos pasos tienen el mismo molde sin `try`:
  `consume-exit-then-navigate` (L380-402, con `consumeOwnedExitSentinel`) y el colapso (L424-465, con
  `consumeOwnedBranchEntry`). La región de `runBranchNavigation` va de L345 a L466; la memoria nueva entra entre el final
  de `consumeOwnedExitSentinel` (L310-314) y el docblock de `runBranchNavigation` (L316-344). La sección siguiente empieza
  en `// ── El SENTINEL DE SALIDA` (L468). `lib/panel-branch.ts` no tiene temporizadores.
- **La guarda** (`lib/panel-history.ts`): docblock L929-949, `consumoEnVuelo` L950, `estadoDelConsumo` L952-957,
  `soltarConsumo` L959-968 (apaga la memoria y saca los DOS oyentes), `soltarAlVolverDeLaCache` L970-981 (condicional
  `if (e.persisted) soltarConsumo()`), los dos bloques de encendido con `pageshow` `{ once: true }` en L1104 (rama `consume`
  de `applyPanelView`, sangría de 6) y L1301 (`consumeOwnedPanelEntry`, sangría de 4), el chequeo de identidad L1290-1293.
  El residuo del retroceso ignorado en silencio está en L1046-1050 y el «el chequeo nuevo nunca retrocede» en L1283. El
  encabezado (L30-33) ya nombra el `pageshow`. Sin temporizadores. `panelNavMode` (L537-554, 18 líneas) y `panelBranchPlan`
  (L719-821, 103 líneas) se extraen enteras SÓLO cortando en la primera línea que es exactamente `}`: cortando en
  cualquier línea que EMPIEZA con `}` el recorte se queda en la firma con parámetro-objeto (6 y 10 líneas) y un gate de
  hashes daría verde midiendo casi nada.
- **Next 16.2.7** (`node_modules/next/dist/client/components/app-router.js:38-67`): `HistoryUpdater` hace
  `replaceState(historyState, '', canonicalUrl)` en cada commit, con el state de ahora esparcido si
  `preserveCustomHistoryState`. Escribe la `canonicalUrl` del árbol que confirma: en el flujo medido por el revisor es la
  misma URL de la entrada.
- **El simulador del repo** (`test/panel-tabs.test.ts:137-260`): ya es fiel al DOM (oyente quitado durante el despacho,
  sin duplicados), drena `popstate` en los `afterEach` (`drenarPopstateDelStub`) y despacha `pageshow`
  (`pageshowDelStub`, con `once`), pero `pila.oyentes` cuenta sólo los de `popstate` y no hay forma de contar los de
  `pageshow`. Su `location` tiene `pathname` y `search` (no `href`). Los ayudantes `decidir`, `tocarLaBarra` y `queTira`
  viven DENTRO del describe del quick 261118-kat (L1046-1093), que no se toca.
- **Los stubs viejos:** `test/panel-branch.test.ts` `montarPila` (L48-68) registra en `enganchados`/`desenganchados` y no
  quita nada; `dispararRetroceso` (L70-78) llama `enganchados[0].fn()` directo; el `afterEach` (L80-97) drena por nombre
  (`fn.name === 'soltarConsumo'`, L88). El caso «CON `reDecidir` engancha UN oyente…» ocupa L1293-1309; su candado de orden
  (L1301-1302) lo cumple también `soltarConsumo`. `lib/panel-history.test.ts`: el describe de NAV-08 empieza en L533, su
  preludio (`registrados`, `montarHistorial` SIN `location`, el `afterEach` que drena por nombre en L553) va hasta su
  primer `it` en L558. Los otros tres stubs de esa suite que no tienen `location` (L880, L985, L1064) no llegan a un
  bloque de encendido. Ninguna otra suite de historial corre los ejecutores (sólo leen fuente).
- **Los casos de hoy:** `panel-tabs` 97/97, `panel-branch` 233/233, `panel-history.test` 172/172.
- **eslint por archivo:** rc 0 en los cinco archivos de código y de prueba. `finances-client.tsx` tiene UNA deuda medida:
  `467:21 error … Calling setState synchronously within an effect` (rc 1). El comentario de obs-G1 va de L1091 a L1099, el
  `<Tabs value={txTab}` está en L1100 y hay 3 `className` con `min-h-dvh` (L1111, L1144, L1169).
- **Registro:** la última sección de `tabs-en-la-url-medida.md` es la `(l)` y su última línea es `cierre (l): …` (L1866).
  `deferred-items.md` tiene 8 `status: open` y termina con la entrada «Decisión del dueño (2026-11-18, secure-phase)».
  `04-SECURITY.md`: T-04-39 L92, T-04-40 L93, AR-04-05 L115, AR-04-06 L116, dos filas `| 2026-11-18 | 56 |` en el audit
  trail, `threats_open: 0`, `status: verified`.
- **`consumeOwnedBranchEntry`** (`lib/panel-history.ts:1338-1344`): sus dos guardas (entrada ajena, `panelUnderRoute`) y
  `window.history.back()`, sin leer la guarda de consumo en vuelo. Lo llaman tres lugares de `lib/panel-branch.ts`: `up`
  (L377), el `second-consume` del colapso adentro de su `popstate` (L442) y el primer paso del colapso (L461). Ningún
  candado de fuente lo lee. Si se le suma la guarda, rompen TRES aserciones viejas de `test/panel-branch.test.ts` que
  cuentan oyentes y no esperan los de la guarda: L142 (`up`: cero oyentes), L170 y L186 (colapso: un oyente). El
  `consumeOwnedBranchEntry` de `lib/panel-history.test.ts:970` se niega por la entrada ajena antes de encender nada.
- **Predicción por lectura, NO veredicto:** CR-01, WR-02, WR-01, IN-01 y `UP-doble` deberían dar rojo;
  `NR-menu-y-barra`, `UP-control`, los `P0-*` y el candado de orden, verde.

## El diseño del arreglo (se aplica SÓLO la parte cuyo caso reprodujo; decidido acá para que el ejecutor no improvise)

- **FCR — un solo segundo paso de B1 pendiente (CR-01, D del dueño 2026-11-18), en `lib/panel-branch.ts`:**
  - Memoria de módulo, no exportada, entre el final de `consumeOwnedExitSentinel` y el docblock de `runBranchNavigation`:
    la línea exacta `let segundoPasoB1Pendiente: (() => void) | null = null`, con su docblock en español: por qué hace falta
    (el número de `CR-b1-doble`: dos closures distintas no se deduplican y las dos re-deciden en el mismo `popstate` leyendo
    el mismo state), que el último toque gana, que el que corre se suelta a sí mismo ANTES de re-decidir, y por qué no se
    restaura el anterior si el consumo nuevo se niega o tira (el plan de la rama y las guardas del consumo leen el mismo
    state en el mismo tick, así que una negativa tras un plan `consume-view-then-navigate` no tiene camino conocido; y un
    pendiente viejo sin recorrido en vuelo —bfcache, retroceso ignorado— es justo el que NO tiene que disparar; si el
    consumo nuevo tira con otro recorrido en vuelo, ese recorrido aterriza sin re-decidir: el dueño queda en la sección,
    nunca fuera).
  - En la rama `consume-view-then-navigate`, después de la negativa sin `reDecidir`: el `segundoPaso` pasa a empezar con
    «si `segundoPasoB1Pendiente` es él mismo, ponerlo en `null`» y DESPUÉS llama `reDecidir()` (el orden importa:
    `reDecidir` puede volver a entrar a esta misma rama con dos fichas apiladas y enganchar el siguiente). Antes de enganchar:
    si hay un pendiente, `window.removeEventListener('popstate', <el pendiente>)`; después `segundoPasoB1Pendiente =
    segundoPaso`; y el enganche queda como está (`{ once: true }`, ANTES del consumo).
  - Las dos salidas sin consumo (la negativa y el `catch` de FW2) desenganchan el `segundoPaso` y ponen la memoria en `null`.
- **FW2 — el `try` de las tres ramas de dos pasos (WR-02), en `lib/panel-branch.ts`:** en `consume-exit-then-navigate`, en
  `consume-view-then-navigate` y en el colapso, la línea `if (consume…()) return true` va dentro de un `try`, y su
  `catch (e)` desengancha el `segundoPaso` (en B1, además, la memoria a `null`) y hace `throw e` (el MISMO error: el
  handler del toque lo ve, igual que el `catch` de `lib/panel-history.ts`). Un `try` y un `throw e` por rama: tres y tres.
- **FI1 — el `pageshow` sin `once` (IN-01), en `lib/panel-history.ts`:** en los dos bloques de encendido la línea del
  `pageshow` pasa a `window.addEventListener('pageshow', soltarAlVolverDeLaCache)`, igual en los dos (así
  `C-retroceso-unico` sigue en verde sin tocarlo). `soltarConsumo` ya lo saca y el condicional de `persisted` QUEDA. Se
  corrige el docblock de `soltarAlVolverDeLaCache`: sin `once` porque un `pageshow` no persistido no puede gastar la salida.
- **FW1 — WR-01, SÓLO si reproduce y el dueño elige A o B en el task 2** (los diseños están en las opciones del checkpoint;
  con C no hay código; si no reproduce, tampoco).
- **FUP — `consumeOwnedBranchEntry` comparte la guarda (sólo si `UP-doble` reprodujo; decisión del dueño 2026-11-18), en
  `lib/panel-history.ts`:** la función empieza con el MISMO chequeo de consumo en vuelo que `consumeOwnedPanelEntry`,
  textualmente igual (el que quede según la decisión de WR-01), antes de leer `actual` y de sus dos guardas; las dos
  guardas quedan iguales y en su orden; después va EL MISMO bloque de encendido que la rama `consume` de `applyPanelView`
  (la bandera, la memoria del state —y la de la URL con A—, y el `try` con los oyentes y el retroceso más el `catch`), y
  `return true`. Así un segundo `up` con el retroceso en vuelo devuelve `true` sin retroceder, y adentro del `popstate` de su
  propio recorrido (el `up` que re-decide B1, el `second-consume` del colapso) el chequeo ve que el recorrido llegó, suelta y
  sigue, como hoy. La duplicación es a propósito y la vigila un candado nuevo, `C-retroceso-unico-rama`, escrito en un
  commit `test` ANTES del `fix`. Se actualizan los docblocks de la guarda («quién la enciende»), de `applyPanelView` («se
  comparte con…») y de `consumeOwnedBranchEntry` (por qué ahora lee la guarda, con el número de `UP-doble`). Rompe las
  tres aserciones viejas declaradas de `test/panel-branch.test.ts` (L142, L170, L186), que pasan a contar los oyentes que
  no son de la guarda con el mismo filtro que ya usa la L1300. `panelNavMode` y `panelBranchPlan` no cambian. Si
  `UP-doble` no reproduce: ningún código, y se registra el número.
- **Ediciones declaradas de pruebas viejas, y ninguna otra:** las de IN-03 (task 1); con A, el stub de NAV-08 recibe
  `location`; con B, el simulador aprende captura (commit `test` neutral antes del `fix`) y cambian dos líneas de
  `C-retroceso-unico`; con C, `it(` pasa a `it.fails(` en `W1-menu` y `W1-b1`; con FUP, las tres de
  `test/panel-branch.test.ts` (L142, L170, L186) y nada más de ese archivo.
- **Prohibido en cualquier rama:** temporizadores; tocar `panelNavMode` o `panelBranchPlan`; exportar las memorias;
  propagar `history.state` con spread en código de la app; cambiar las dos guardas de `consumeOwnedPanelEntry` o de
  `consumeOwnedBranchEntry`, o su orden; tocar `lib/panel-branch.ts` fuera de `runBranchNavigation` y su memoria (FUP vive
  entero en `lib/panel-history.ts`).

## Reglas que valen para los tres tasks

- **La base `B`** es el padre del PRIMER commit `test(quick-261118-pjd)` (al planificar, HEAD = `73ff6cc`). **`KC`** es el
  commit que agrega el `describe('CR-01 del review de R2-WR-01 — medidos antes de arreglar`. Los gates calculan las dos
  solas. Los números de línea de los `<read_first>` son los de `73ff6cc`.
- **Intocables:** `lib/overlay-history.ts`, `lib/dirty-history.ts`, `scripts/con-turno.mjs` (CONGELADO; la herramienta de
  `D:/herramientas/turno-pantalla` no se edita), `next.config.ts` (sha1 `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`),
  `components/`, `proxy.ts`, `supabase/`, `package.json` y `package-lock.json`. En `app/` se toca SÓLO el comentario de
  obs-G1. No se agrega ninguna dependencia. Nunca `git checkout --` (CRLF): para revertir, Edit.
- **El turno de pantalla:** toda corrida que levante un navegador o un servidor va envuelta en
  `node scripts/con-turno.mjs …`, se lanza en **segundo plano** (`run_in_background`) con el MISMO comando del gate y se
  lee la salida al terminar. Si el turno está ocupado, espera e imprime quién es el dueño: **una espera no es un cuelgue**.
  **Nunca Ctrl+C** a una corrida de pantalla. Si una se corta: `bash D:/herramientas/turno-pantalla/turno-pantalla.sh estado`,
  matar el PID dueño SÓLO si es nuestro y después `bash D:/herramientas/turno-pantalla/turno-pantalla.sh liberar`. Quedan
  fuera del turno vitest, eslint, `tsc` y el build. El task 1 no levanta navegador.
- **El servidor:** si hay un `next dev` de ESTE repo vivo, las sondas miden contra él sin matarlo. Si no, levantan el suyo
  en el 3031 y lo matan al salir. El `next dev` de forjo-landing en el 3000 y los de otros proyectos no se tocan.
- **Supabase:** sólo la pila de forjo-app, y sólo `supabase start` si la API no contesta. Nunca `stop`, `db reset`,
  `docker stop` ni `rm`. Ninguna escritura en la base.
- **⚠ El guard de secretos de esta máquina bloquea todo comando de Bash que contenga el literal «punto env».** Ningún
  gate lo contiene, y un comando propio del ejecutor tampoco puede.
- **Anti-gates del repo:** `./node_modules/.bin/tsc --noEmit` (nunca `npx tsc`, que sale 0 siempre), eslint archivo por
  archivo (nunca `npm run lint`). `npm test` no se corre; si se corre igual, sólo dentro de [01:00, 23:30] hora de
  Argentina (los canarios de reloj del carril `db`).
- **Commits:** `git add <rutas explícitas>` y nada más. Nunca `-A`: `.claude/settings.json` y
  `.planning/workstreams/panel-nav/.verification-ledger.json` quedan sin trackear. Alcances `test(quick-261118-pjd):`,
  `fix(quick-261118-pjd):` y `docs(quick-261118-pjd):`. Cada mensaje termina con una línea en blanco y
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Nada de push.** No se edita ROADMAP, STATE ni REQUIREMENTS, y
  nunca se corre `requirements.mark-complete`.
- **Los esperados se fijan antes de medir y no se tocan después.** Ningún `expect(medido).toEqual(…)` de un caso nuevo
  cambia después de la corrida que lo juzga. El describe del quick 261118-kat (K/NR y candados) no se toca salvo las dos
  líneas declaradas de la opción B.
- **Comentarios nuevos:** densos, en español, del porqué. Nunca citan textual las frases viejas que se corrigen.

## Las reglas de PARAR

- **P-0 (el entorno, task 3):** la API local no contesta y `supabase start` no la levanta, o el 3031/9335 están ocupados por
  algo que no es la sonda ⇒ PARAR con lo corrido.
- **P-1 (el instrumento):** un caso nuevo falla por `TypeError`/`ReferenceError` en vez de por su aserción; o
  `NR-menu-y-barra`, `UP-control`, un `P0-*`, el candado de orden o un caso viejo da rojo con el código de hoy (con
  `UP-control` en rojo, el simulador no está armando el `up`: no hay veredicto de `UP-doble`); o el drenaje nuevo pone en
  rojo un caso viejo. UNA re-corrida idéntica. Si se repite y el defecto es del instrumento nuevo, se permite UN arreglo en
  otro commit `test(quick-261118-pjd)` ANTES de la corrida que juzga, sin tocar ningún esperado. Si no, PARAR.
- **P-2 (un caso no reproduce):** es un veredicto. CR-01, WR-02, IN-01 o `UP-doble` que no reproducen NO se arreglan: se
  cierran «descartado medido» con el número. WR-01 que no reproduce: `no-aplica`, sin checkpoint y sin código.
- **P-3 (el verde no da):** con el arreglo puesto, un caso nuevo o viejo en rojo, una mutación que NO pone rojo su candado,
  un `R-T-*`/`R-B1-*` sin `OK`, la estática por debajo de 18 o el scroll por debajo de 8/8 ⇒ PARAR con el log. No se prueba
  otro diseño y no se toca ningún esperado.
- **P-4 (el diseño choca):** el arreglo exige tocar `panelNavMode`/`panelBranchPlan`, `lib/panel-branch.ts` fuera de
  `runBranchNavigation` y su memoria, o una aserción vieja no declarada (con FUP, cualquier otra de
  `test/panel-branch.test.ts` que no sea L142/L170/L186, o un NR de B1 que se pone rojo) ⇒ PARAR y llevárselo al dueño.
- **P-5 (sólo con B):** con la captura puesta, algún `R-B1-*` sin `OK` en Chrome ⇒ PARAR: el orden de captura no es el que
  el diseño supone.
- **P-7 (el build):** si `npm run build` choca con un `next dev` de este repo vivo, no se mata: se espera y se re-corre. Si
  no se puede, se declara en el SUMMARY.
- **P-8 (la sonda de la app sin login):** si la corrida de la app termina sin `recorridos medidos` o con
  `la sonda no pudo completar` porque `/login` no respondió 200 (árbol de `next dev` incompleto), es el entorno: UNA
  re-corrida idéntica, sin tocar nada.

<tasks>

<task type="tracer">
  <name>Task 1: Medir CR-01, WR-02, WR-01, el pageshow y UP-doble con el código de hoy — los casos commiteados ANTES, la corrida y los veredictos en (m)</name>
  <reversibility rating="reversible">Sólo instrumento y registro: casos agregados a tres suites, el drenaje de dos stubs y un documento de medición. La app no cambia. Deshacerlo es un `git revert` de los commits `test` y `docs`.</reversibility>
  <precondition>HEAD es `73ff6cc` o un descendiente que no cambió `lib/panel-history.ts`, `lib/panel-branch.ts`, `test/panel-tabs.test.ts`, `test/panel-branch.test.ts`, `lib/panel-history.test.ts` ni `app/(dashboard)/finances/finances-client.tsx` desde `73ff6cc`.</precondition>
  <files>test/panel-tabs.test.ts, test/panel-branch.test.ts, lib/panel-history.test.ts, .planning/debug/tabs-en-la-url-medida.md</files>
  <read_first>
    - `.planning/workstreams/panel-nav/quick/261118-kat-r2-wr-01-la-guarda-de-consumo-en-vuelo-s/261118-kat-REVIEW.md` entero (CR-01, WR-01..04, IN-01..03 y la tabla A-E).
    - `C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/e3541fb4-9838-45ba-8edf-fb689e438b9e/scratchpad/rev/guard.run.ts` (el simulador del revisor: la referencia de A, B, C, D y E; no se copia al repo).
    - `lib/panel-branch.ts` L310-466 (`consumeOwnedExitSentinel` y `runBranchNavigation`) y L2028-2097 (`decidirDesdeElAterrizaje`, `handleNavigate`). SÓLO LECTURA en este task.
    - `lib/panel-history.ts` L929-981 (la guarda), L1099-1111 (la rama `consume`), L1285-1308 (`consumeOwnedPanelEntry`) y L1310-1344 (`consumeOwnedBranchEntry` y su docblock). SÓLO LECTURA.
    - `test/panel-tabs.test.ts` L137-270 (el simulador y `tocar`) y L984-1292 (los dos describes del quick 261118-kat: el molde de `decidir`, `tocarLaBarra`, `queTira`, las fábricas de pilas y el `afterEach`).
    - `test/panel-branch.test.ts` L43-97 (`montarPila`, `dispararRetroceso`, el `afterEach`), L165-200 (el molde del colapso: `panelUnderState(PANEL_MORE)` en `/finances`, `collapse-then-replace` a `/clients`), L1142-1162 (el del sentinel: `PB.panelExitState(7)` en `PANEL_ROOT`, `exitId: 7`, a `/appointments`) y L1281-1345 (B1).
    - `lib/panel-history.test.ts` L533-582 (el preludio de NAV-08).
    - `.planning/debug/tabs-en-la-url-medida.md` desde L1659 (`## (l)`: el formato a imitar).
  </read_first>
  <action>
**Paso 0 — el entorno.** Anotar para el SUMMARY la fecha, la hora, `node -v` y `git rev-parse HEAD`. Este task no levanta
navegador ni servidor, así que no pasa por el turno y no necesita Supabase.

**Paso 1 — el contador de `pageshow` del simulador (WR-03). En `test/panel-tabs.test.ts` este paso sólo agrega líneas.**
Al lado de `pageshowDelStub` (nivel de módulo) va `let oyentesPageshowDelStub: (() => number) | null = null`, con una línea
de comentario. Adentro de `montarHistoria`, después del bloque que define `pageshowDelStub`, va
`oyentesPageshowDelStub = () => oyentesPageshow.length`. Al docblock de `montarHistoria` se le agrega un párrafo
`(quick 261118-pjd)`: `pila.oyentes` sigue contando sólo `popstate` (lo que miden los casos viejos) y el contador nuevo
deja afirmar que no queda un oyente de `pageshow` vivo, que es lo que WR-03 encontró sin medir. Correr
`./node_modules/.bin/vitest run --project pure test/panel-tabs.test.ts`: tiene que seguir 97/97 (si no, P-1).

**Paso 2 — los catorce casos, al FINAL de `test/panel-tabs.test.ts`** (después del describe de los candados del quick
261118-kat, que no se toca). Encabezado de comentario `// ── 10) CR-01 del review de R2-WR-01 (quick 261118-pjd): …`
que explica los cinco grupos, las dos decisiones del dueño (2026-11-18: arreglar el review antes del push; medir el doble
toque sobre `up` y arreglarlo si da rojo), que cada `esperado` es lo CORRECTO (rojo = reproduce), que `CR-b1-silencio` fija
el residuo aceptado (a lo sumo UN re-decisor: el atrás del sistema más un `up`, nunca fuera del sitio), que
`NR-menu-y-barra`, `UP-control` y los `P0-*` son candados de no-regresión (verdes HOY; si no, P-1), y que los `W1-*`
emulan el `HistoryUpdater` de Next (`app-router.js:38-67`). El describe se llama exactamente
`describe('CR-01 del review de R2-WR-01 — medidos antes de arreglar (quick 261118-pjd)', () => {`.
- **`afterEach`:** `drenarPopstateDelStub?.()`, `drenarPopstateDelStub = null`, `pageshowDelStub = null`,
  `oyentesPageshowDelStub = null`, vaciar `navegaciones`, `PB.takeBackLanding()`, `PB.applyBranchMarkRequest('__drenaje__')`,
  `vi.restoreAllMocks()` y recién después `vi.unstubAllGlobals()`.
- **Ayudantes dentro del describe** (copias EXACTAS de los del describe K del quick 261118-kat, que no se pueden subir sin
  tocarlo): `ID = 7`, `navegaciones`, `pilaFin()` y `pilaFichas()` (fábricas: objetos nuevos en cada llamada), una tercera
  fábrica nueva `pilaSeccion()` = `/afuera` (state null), `/dashboard` (null), `/finances` (`{ frjUnder: '/dashboard' }`)
  —una sección con la marca de la rama arriba y sin subsección—, `anotar`,
  `hechos`, `decidir`, `tocarLaBarra` y `queTira`. Y dos nuevos: `queSeIgnora()` = `vi.spyOn(window.history, 'back')` con
  `mockImplementationOnce(() => {})` (un retroceso que el navegador ignora EN SILENCIO: ni tira, ni recorre, ni cuenta); y
  `nextReemplaza()` = `window.history.replaceState({ ...(window.history.state as object), __NA: true }, '')`, con un
  comentario que cita `app-router.js:38-67` y dice que la URL no cambia.
- **Forma de cada caso:** se juntan las medidas, se llama a `procesar()` ANTES de afirmar (salvo donde se dice) y se
  cierra con UNA sola `expect(medido).toEqual(esperado)`. Todos sobre `montarHistoria(…, { backAsincrono: true })`. El
  «atrás del sistema» es `window.history.back()` llamado por el caso. El nombre empieza EXACTAMENTE con el id y dos puntos.
  - `CR-b1-doble:` dos toques a Inicio en la barra antes del recorrido. `pilaFin()`, `s1`/`s2` = `tocarLaBarra(PH.PANEL_ROOT)`,
    `procesar()`. Esperado `{ s1: true, s2: true, retrocesos: 2, url: '/dashboard', navegaciones: [] }`.
  - `CR-b1-doble-fichas:` lo mismo con dos fichas apiladas (`pilaFichas()`). Esperado
    `{ s1: true, s2: true, retrocesos: 3, url: '/dashboard', navegaciones: [] }`.
  - `CR-b1-silencio:` el retroceso ignorado en silencio y tres toques a la barra; después un atrás del sistema.
    `pilaFin()`, `queSeIgnora()`, `s1`/`s2`/`s3` = `tocarLaBarra(PH.PANEL_ROOT)`, el atrás del sistema, `procesar()`.
    Esperado `{ s1: true, s2: true, s3: true, retrocesos: 2, url: '/dashboard', navegaciones: [] }`.
  - `NR-menu-y-barra:` la sección activa del menú y, antes del recorrido, Inicio en la barra (el D del revisor).
    `s1` = `PH.consumeOwnedPanelEntry()`, `s2` = `tocarLaBarra(PH.PANEL_ROOT)`, `procesar()`. Esperado
    `{ s1: true, s2: true, retrocesos: 2, url: '/dashboard', navegaciones: [] }`.
  - `K2-c-b1:` B1 con un back() que tira no deja su segundo paso enganchado. `pilaFin()`, `queTira()`, `tocarLaBarra`
    dentro de un `try` (`tiro`), `oyentes: pila.oyentes`, el atrás del sistema, `procesar()`. Esperado
    `{ tiro: true, oyentes: 0, retrocesos: 1, url: '/finances', navegaciones: [] }`.
  - `W1-menu:` el tab por defecto, el replaceState de Next en la ventana y la sección activa del menú.
    `consumo` = `tocar(TABS_FINANZAS, 'appointments')`, `nextReemplaza()`, `prevenido` = `PH.consumeOwnedPanelEntry()`,
    `procesar()`. Esperado `{ consumo: 'consume', prevenido: true, retrocesos: 1, url: '/finances' }`.
  - `W1-b1:` lo mismo con Inicio en la barra. `consumo`, `nextReemplaza()`, `seHizoCargo` = `tocarLaBarra(PH.PANEL_ROOT)`,
    `procesar()`. Esperado `{ consumo: 'consume', seHizoCargo: true, retrocesos: 2, url: '/dashboard', navegaciones: [] }`.
  - `C-pageshow-no-persistido:` un pageshow no persistido no suelta la guarda ni gasta su salida. SIN `procesar()`:
    `consumo` = `tocar(…, 'appointments')`; `pageshowDelStub?.(false)`; `primero` = `tocar(TABS_FINANZAS, 'expenses')`;
    `vivosPageshow` = `oyentesPageshowDelStub?.()`; `pageshowDelStub?.(true)`; `despues` = `tocar(TABS_FINANZAS, 'expenses')`;
    `oyentes: pila.oyentes`; `oyentesPageshow` = `oyentesPageshowDelStub?.()`. Esperado
    `{ consumo: 'consume', primero: 'none', vivosPageshow: 1, despues: 'replace', oyentes: 0, oyentesPageshow: 0 }`.
  - `P0-normal:` el recorrido que llega no deja oyentes de popstate ni de pageshow. `consumo` = `tocar(…, 'appointments')`,
    `procesar()`. Esperado `{ consumo: 'consume', url: '/finances', oyentes: 0, oyentesPageshow: 0 }`.
  - `P0-catch-tab:` el back() que tira en el tab no deja oyentes. `queTira()`, `tocar` en un `try`. Esperado
    `{ tiro: true, oyentes: 0, oyentesPageshow: 0 }`.
  - `P0-catch-menu:` el back() que tira en el menú no deja oyentes. `queTira()`, `PH.consumeOwnedPanelEntry()` en un `try`.
    Esperado `{ tiro: true, oyentes: 0, oyentesPageshow: 0 }`.
  - `P0-pageshow:` la vuelta de la bfcache tras el consumo del menú no deja oyentes. `consumo` =
    `PH.consumeOwnedPanelEntry()`, `pageshowDelStub?.(true)`, sin procesar. Esperado
    `{ consumo: true, oyentes: 0, oyentesPageshow: 0 }`.
  - `UP-doble:` dos toques a Inicio desde una sección con la marca de la rama, antes del recorrido. `pilaSeccion()`,
    `s1`/`s2` = `tocarLaBarra(PH.PANEL_ROOT)`, `procesar()`. Esperado
    `{ s1: true, s2: true, retrocesos: 1, url: '/dashboard', navegaciones: [] }`.
  - `UP-control:` un solo toque a Inicio desde la misma sección (fija que el simulador arma el `up`; HOY verde).
    `pilaSeccion()`, `s1` = `tocarLaBarra(PH.PANEL_ROOT)`, `procesar()`. Esperado
    `{ s1: true, retrocesos: 1, url: '/dashboard', navegaciones: [] }`.

**Paso 3 — `test/panel-branch.test.ts`: IN-03 y el mecanismo de los dos pasos.**
(a) **El drenaje por despacho (IN-03).** En `montarPila`, un arreglo nuevo `vivos` con `{ tipo, fn, opciones }`:
`addEventListener` también empuja ahí y `removeEventListener` saca de ahí por (tipo, fn), con `splice` sobre el MISMO
arreglo. `montarPila` lo devuelve. `dispararRetroceso`, antes de llamar al oyente, lo saca de `ctx.vivos` si es de
disparo único (el DOM lo quita antes de invocarlo). A nivel de módulo, `ultimosEnganchados` pasa a ser `ultimosVivos` (el
`vivos` del último `montarPila`), con su comentario corregido. En el `afterEach`, en el lugar del filtro por nombre: para
cada oyente de `popstate` DE DISPARO ÚNICO todavía vivo (los que modelan «el evento del recorrido»: el de B1, el del
sentinel, el del colapso y el de la guarda; sobre una copia), sacarlo de `ultimosVivos` y llamarlo; después afirmar que no
queda ningún oyente de `popstate` de disparo único vivo, y `ultimosVivos = []`. Los oyentes sin disparo único que algún
caso viejo pudiera enganchar no se llaman (no son de un recorrido y llamarlos fuera de su prueba podría tirar). El
comentario dice por qué: despachar el evento no depende del nombre de ninguna función, suelta la guarda y el pendiente de
B1, y si un oyente de recorrido quedara vivo el caso se pone rojo en vez de envenenar al siguiente. No se filtra por nombre
en ningún lado.
(b) **El candado de orden (IN-03).** En el caso «CON `reDecidir` engancha UN oyente…» se AGREGA una línea, después de la
de `enganchados[0].tipo`: `expect(ctx.enganchados[0].fn.name).toBe('segundoPaso')`, con un comentario fechado
`(2026-11-18, quick 261118-pjd)`: el primero tiene que ser el de B1, no el de la guarda. Ninguna otra línea de ese caso
cambia.
(c) **Cuatro casos al FINAL del archivo**, en `describe('CR-01 del review de R2-WR-01 — el mecanismo de los dos pasos, medido antes de arreglar (quick 261118-pjd)', () => {`.
Para que un `back()` tire: `ctx.back.mockImplementationOnce(() => { throw new DOMException('demasiadas llamadas', 'SecurityError') })`.
Cada caso cierra con UNA `expect(medido).toEqual(…)`.
  - `K2-c-b1-unidad:` `montarPila({ state: { frjView: 'tab' }, pathname: '/negocio' })`, `reDecidir = vi.fn()`, la rama
    B1 dentro de un `try`. Medido `{ tiro, segundoPasoDesenganchado: ctx.desenganchados.includes(ctx.enganchados[0].fn), reDecidio: reDecidir.mock.calls.length }`;
    esperado `{ tiro: true, segundoPasoDesenganchado: true, reDecidio: 0 }`.
  - `K2-c-exit:` el molde del sentinel (L1142-1162) con el `back` que tira. Medido `{ tiro, segundoPasoDesenganchado, navego: navegar.mock.calls.length }`;
    esperado `{ tiro: true, segundoPasoDesenganchado: true, navego: 0 }`.
  - `K2-c-colapso:` el molde del colapso (L165-172) con el `back` que tira. Mismo medido y esperado que `K2-c-exit`.
  - `CR-b1-reemplazo-unidad:` `montarPila({ state: { frjView: 'tab' }, pathname: '/negocio' })`, la rama B1 DOS veces con
    el mismo `reDecidir`. Medido `{ r1, r2, retrocesos: ctx.back.mock.calls.length, primeroDesenganchado: ctx.desenganchados.includes(ctx.enganchados[0].fn), reDecidio: reDecidir.mock.calls.length }`;
    esperado `{ r1: true, r2: true, retrocesos: 1, primeroDesenganchado: true, reDecidio: 0 }`.

**Paso 4 — `lib/panel-history.test.ts`, SÓLO en el preludio del describe de NAV-08 (IN-03).** El `afterEach` deja de
filtrar por nombre: para cada oyente de `popstate` de `registrados` (sobre una copia), sacarlo de `registrados` y llamarlo;
después `expect(registrados).toHaveLength(0)` (en este describe el único que engancha es la guarda, y `soltarConsumo` saca
también el de `pageshow`: con esto el candado de WR-03 corre en cada caso de NAV-08) y `registrados = []`, antes de
`vi.unstubAllGlobals()`. Se corrige el comentario del preludio. Ningún `it` cambia.

**Paso 5 — commit ANTES de medir.** `./node_modules/.bin/eslint` de los tres archivos con rc 0, `git add` de los tres y el
commit `test(quick-261118-pjd): CR-01 del review de R2-WR-01 — los casos medidos antes de arreglar (barra, try de la rama, pageshow, WR-01, UP-doble)`
con el trailer. Correr el PRIMER gate. Anotar la tupla roja de cada caso rojo (el diff de la aserción, tal cual).

**Paso 6 — `## (m)` al final de `.planning/debug/tabs-en-la-url-medida.md`.** Sólo se agrega; ninguna línea vieja
cambia. Título `## (m) CR-01 del review de R2-WR-01: un solo segundo paso de B1, el try de la rama y los candados de pageshow (quick 261118-pjd)`,
con el formato de `(l)`:
- **Qué se preguntó:** los hallazgos y la decisión del dueño (2026-11-18), con la tabla A-E del revisor como referencia.
- **El entorno.**
- **Lo medido:** el comando de vitest; por cada caso rojo, la tupla medida contra la esperada, pegada TAL CUAL del error
  de la aserción; los verdes (`NR-menu-y-barra`, `UP-control`, `P0-*`, el candado de orden).
- **Una línea sola:** `veredictos (m): CR-01=<reproduce|no-reproduce> · WR-02=<…> · WR-01=<…> · IN-01=<…> · UP=<…>`.
  CR-01 es el rojo de `CR-b1-doble`, `CR-b1-doble-fichas`, `CR-b1-silencio` o `CR-b1-reemplazo-unidad`; WR-02, el de algún
  `K2-c-*`; WR-01, el de `W1-menu` o `W1-b1`; IN-01, el de `C-pageshow-no-persistido`; UP, el de `UP-doble`.
Commit `docs(quick-261118-pjd): CR-01 del review medido antes de arreglar — veredictos en (m)` con el trailer. Correr el
SEGUNDO gate.

**Paso 7.** Si `(m)` dice `WR-01=reproduce`, el plan PARA en el task 2 y devuelve el checkpoint con las tuplas de `W1-menu`
y `W1-b1`. **El ejecutor no elige**, aunque `workflow.auto_advance` esté prendido. Si dice `WR-01=no-reproduce`, el task 2
se saltea y se sigue al task 3.
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && T=test/panel-tabs.test.ts; TB=test/panel-branch.test.ts; TH=lib/panel-history.test.ts; TL=$(git log --reverse --format=%H --grep='^test(quick-261118-pjd)' HEAD); TLRC=$?; TC=$(printf '%s\n' "$TL" | grep -c .); test "$TLRC" = 0 && test "$TC" -ge 1 || { echo "commits test(quick-261118-pjd)=$TC (>=1) rc=$TLRC"; exit 1; }; B="$(printf '%s\n' "$TL" | head -1)^"; quitadas() { tr -d '\r' | awk '/^@@/ { split($2, o, ","); ln = substr(o[1], 2) + 0; next } /^-/ && !/^---/ { print ln ":" substr($0, 2); ln++ }'; }; QT=$(git diff -U0 "$B" -- "$T" | quitadas | grep -c .); OB=$(git show "$B:$TB" | tr -d '\r'); A1=$(printf '%s\n' "$OB" | grep -n '^// Los oyentes del último' | cut -d: -f1); Z1=$(printf '%s\n' "$OB" | grep -n "^describe('branchSecondStep" | cut -d: -f1); QBF=$(git diff -U0 "$B" -- "$TB" | quitadas | grep . | awk -F: -v a="$A1" -v z="$Z1" '$1 < a || $1 >= z' | grep -c .); OH=$(git show "$B:$TH" | tr -d '\r'); A2=$(printf '%s\n' "$OH" | grep -n "^describe('consumeOwnedPanelEntry — tocar la sección" | cut -d: -f1); Z2=$(printf '%s\n' "$OH" | awk -v a="$A2" 'NR > a && index($0, "  it(") == 1 { print NR; exit }'); QHF=$(git diff -U0 "$B" -- "$TH" | quitadas | grep . | awk -F: -v a="$A2" -v z="$Z2" '$1 <= a || $1 >= z' | grep -c .); ITH0=$(printf '%s\n' "$OH" | grep -c '^  it('); ITH1=$(tr -d '\r' < "$TH" | grep -c '^  it('); NM=$(cat "$TB" "$TH" | tr -d '\r' | grep -cF "fn.name === 'soltarConsumo'"); OC=$(tr -d '\r' < "$TB" | grep -cF "expect(ctx.enganchados[0].fn.name).toBe('segundoPaso')"); W=$(tr -d '\r' < "$T"); KD=$(printf '%s\n' "$W" | grep -c "^describe('CR-01 del review de R2-WR-01 — medidos antes de arreglar (quick 261118-pjd)'"); KID=$(printf '%s\n' "$W" | grep -cE "^  it\('(CR-b1-doble|CR-b1-doble-fichas|CR-b1-silencio|NR-menu-y-barra|K2-c-b1|W1-menu|W1-b1|C-pageshow-no-persistido|P0-normal|P0-catch-tab|P0-catch-menu|P0-pageshow|UP-doble|UP-control): "); OPS=$(printf '%s\n' "$W" | grep -c '^let oyentesPageshowDelStub'); WB=$(tr -d '\r' < "$TB"); BD=$(printf '%s\n' "$WB" | grep -c "^describe('CR-01 del review de R2-WR-01 — el mecanismo de los dos pasos"); BID=$(printf '%s\n' "$WB" | grep -cE "^  it\('(K2-c-b1-unidad|K2-c-exit|K2-c-colapso|CR-b1-reemplazo-unidad): "); git diff --quiet HEAD -- "$T" "$TB" "$TH"; LIMPIO=$?; APL=$(git diff --name-only "$B" -- app components lib scripts proxy.ts next.config.ts package.json package-lock.json supabase); APRC=$?; APP=$(printf '%s\n' "$APL" | tr -d '\r' | grep -vxF "$TH" | grep -c .); HC=$(sha1sum next.config.ts | cut -d' ' -f1); ./node_modules/.bin/eslint "$T" "$TB" "$TH" > /dev/null 2>&1; EL=$?; TSC=$(./node_modules/.bin/tsc --noEmit 2>&1 | grep -v '^\.next/' | grep -E 'error TS'); V=$(./node_modules/.bin/vitest run --project pure "$T" "$TB" "$TH" 2>&1 | tr -d '\r'); printf '%s\n' "$V" | tail -8; VF=$(printf '%s\n' "$V" | grep -oE 'Tests +[0-9]+ failed' | grep -oE '[0-9]+' | tail -1); VF=${VF:-0}; VP=$(printf '%s\n' "$V" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); VP=${VP:-0}; IDS='CR-b1-doble-fichas|CR-b1-doble|CR-b1-silencio|CR-b1-reemplazo-unidad|NR-menu-y-barra|K2-c-b1-unidad|K2-c-b1|K2-c-exit|K2-c-colapso|W1-menu|W1-b1|C-pageshow-no-persistido|P0-normal|P0-catch-tab|P0-catch-menu|P0-pageshow|UP-doble|UP-control'; ROJ=$(printf '%s\n' "$V" | grep -E 'FAIL|×' | grep -oE "($IDS): " | sort -u | tr -d ': ' | tr '\n' ' '); NK=$(printf '%s\n' $ROJ | grep -c .); NRR=$(printf '%s\n' $ROJ | grep -cE '^(NR-menu-y-barra|UP-control|P0-normal|P0-catch-tab|P0-catch-menu|P0-pageshow)$'); TE=$(printf '%s\n' "$V" | grep -cE 'TypeError|ReferenceError|SyntaxError'); TOT=$((VF + VP)); echo "rojos medidos=[$ROJ] · lineas quitadas panel-tabs=$QT (0) · quitadas de panel-branch fuera del preludio=$QBF (0, region $A1-$Z1) · quitadas de panel-history.test fuera del preludio de NAV-08=$QHF (0, region $A2-$Z2) · its de panel-history.test=$ITH0/$ITH1 (iguales) · drenaje por nombre=$NM (0) · candado de orden=$OC (1) · describes=$KD/$BD (1/1) · casos=$KID/$BID (14/4) · contador de pageshow=$OPS (1) · sin commitear=$LIMPIO (0) · app/lib cambiados=$APP (0, rc $APRC) · next.config=$HC · eslint=$EL (0) · errores TS=[$TSC] (vacio) · fallas=$VF = rojos nuevos=$NK · NR/P0 en rojo=$NRR (0: si no, P-1) · errores de JS=$TE (0: si no, P-1) · casos=$TOT (>=520)"; test "$QT" = 0 && test -n "$A1" && test -n "$Z1" && test "$QBF" = 0 && test -n "$A2" && test -n "$Z2" && test "$QHF" = 0 && test "$ITH0" = "$ITH1" && test "$NM" = 0 && test "$OC" = 1 && test "$KD" = 1 && test "$BD" = 1 && test "$KID" = 14 && test "$BID" = 4 && test "$OPS" = 1 && test "$LIMPIO" = 0 && test "$APRC" = 0 && test "$APP" = 0 && test "$HC" = 8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578 && test "$EL" = 0 && test -z "$TSC" && test "$VF" = "$NK" && test "$NRR" = 0 && test "$TE" = 0 && test "$TOT" -ge 520</automated>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && T=test/panel-tabs.test.ts; TB=test/panel-branch.test.ts; TH=lib/panel-history.test.ts; D=.planning/debug/tabs-en-la-url-medida.md; TL=$(git log --reverse --format=%H --grep='^test(quick-261118-pjd)' HEAD); TLRC=$?; test "$TLRC" = 0 && test -n "$TL" || { echo "sin commit test(quick-261118-pjd)"; exit 1; }; B="$(printf '%s\n' "$TL" | head -1)^"; DD=$(git diff -U0 "$B" -- "$D"); DDRC=$?; REMD=$(printf '%s\n' "$DD" | tr -d '\r' | grep -E '^-[^-]' | grep -c .); WD=$(tr -d '\r' < "$D"); LH=$(printf '%s\n' "$WD" | grep -cE '^## \(m\) '); VL=$(printf '%s\n' "$WD" | grep -E '^veredictos \(m\): '); NVL=$(printf '%s\n' "$VL" | grep -c .); V=$(./node_modules/.bin/vitest run --project pure "$T" "$TB" "$TH" 2>&1 | tr -d '\r'); IDS='CR-b1-doble-fichas|CR-b1-doble|CR-b1-silencio|CR-b1-reemplazo-unidad|K2-c-b1-unidad|K2-c-b1|K2-c-exit|K2-c-colapso|W1-menu|W1-b1|C-pageshow-no-persistido|UP-doble'; ROJ=" $(printf '%s\n' "$V" | grep -E 'FAIL|×' | grep -oE "($IDS): " | sort -u | tr -d ': ' | tr '\n' ' ') "; r() { case "$ROJ" in *" $1 "*) echo 1;; *) echo 0;; esac; }; ECR=no-reproduce; test "$(r CR-b1-doble)$(r CR-b1-doble-fichas)$(r CR-b1-silencio)$(r CR-b1-reemplazo-unidad)" != 0000 && ECR=reproduce; EW2=no-reproduce; test "$(r K2-c-b1)$(r K2-c-b1-unidad)$(r K2-c-exit)$(r K2-c-colapso)" != 0000 && EW2=reproduce; EW1=no-reproduce; test "$(r W1-menu)$(r W1-b1)" != 00 && EW1=reproduce; EI1=no-reproduce; test "$(r C-pageshow-no-persistido)" = 1 && EI1=reproduce; EUP=no-reproduce; test "$(r UP-doble)" = 1 && EUP=reproduce; ESP="veredictos (m): CR-01=$ECR · WR-02=$EW2 · WR-01=$EW1 · IN-01=$EI1 · UP=$EUP"; DC=$(git log --format=%H --grep='^docs(quick-261118-pjd)' HEAD | grep -c .); git diff --quiet HEAD -- "$D"; LIMPIO=$?; echo "lineas quitadas de la medida=$REMD (0, rc $DDRC) · seccion (m)=$LH (1) · linea de veredictos=$NVL (1) · escrita=[$VL] · recalculada=[$ESP] · commits docs=$DC (>=1) · sin commitear=$LIMPIO (0)"; test "$DDRC" = 0 && test "$REMD" = 0 && test "$LH" = 1 && test "$NVL" = 1 && test "$VL" = "$ESP" && test "$DC" -ge 1 && test "$LIMPIO" = 0</automated>
    <fails_when>El primero falla si: se quitó una línea de `panel-tabs` (este task sólo agrega ahí); en `panel-branch.test.ts` se quitó una línea fuera del preludio (L43-98 de la base) o en `panel-history.test.ts` fuera del preludio de NAV-08, o cambió la cantidad de `it` de esta última; sobrevive el drenaje por nombre; falta el candado de orden; no están los dos describes con sus 14 y 4 casos con id o falta el contador de `pageshow`; quedan cambios sin commitear; cambió un archivo de la app o de `lib` que no es `lib/panel-history.test.ts`; `next.config.ts` tiene otra huella; eslint o `tsc` fallan; `NR-menu-y-barra`, `UP-control` o un `P0-*` está en rojo, o un caso falla por un error de JS (P-1); o hay un caso viejo en rojo (las fallas no son exactamente los rojos nuevos). Un caso nuevo en rojo NO hace fallar el gate: es el veredicto «reproduce». El segundo falla si: cambió una línea vieja de la medida; falta `(m)` o su línea de veredictos; la línea escrita no coincide con la que se recalcula de vitest; o falta el commit `docs`.</fails_when>
  </verify>
  <done>Están commiteados en `test(quick-261118-pjd)`, antes de medir: el contador de `pageshow` del simulador, los 14 casos de `panel-tabs` (con `UP-doble` y `UP-control`), los 4 de `panel-branch`, el drenaje por despacho de las dos suites y el candado de orden. La corrida dio sus rojos y verdes (`NR-menu-y-barra`, `UP-control`, `P0-*` y el candado de orden en verde), y `(m)` registra las tuplas tal cual y la línea `veredictos (m): …` (con `UP=`) coherente con lo medido.</done>
</task>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 2: WR-01 reprodujo — ¿con qué criterio se detecta que el recorrido llegó? (decide el dueño)</name>
  <decision>Cómo arreglar (o no) WR-01 si `(m)` dice `WR-01=reproduce`. **Se presenta SÓLO en ese caso.** Si dice `WR-01=no-reproduce`, el ejecutor lo saltea y en el task 3 escribe `decision WR-01 (sin checkpoint): no-aplica`. El ejecutor NO elige, aunque `workflow.auto_advance` esté prendido.</decision>
  <context>
Al dueño se le presentan, tal como están en `(m)`: las tuplas de `W1-menu` (por el menú: un retroceso de más, fuera de la
sección) y `W1-b1` (por la barra: fuera del sitio, la cicatriz 2), y los veredictos de CR-01, WR-02, IN-01 y UP, que se
arreglan igual (si `UP-doble` reprodujo, `consumeOwnedBranchEntry` copia el chequeo y el bloque de encendido que deje la
opción elegida: con A también la memoria de la URL, con B también la captura). Hay que decirle: el disparador es una ráfaga de toques dentro de la latencia de una transición de Next en un
dispositivo lento (el mismo escenario en el que nació G-04-7); el simulador emula el `replaceState` del `HistoryUpdater`
(`app-router.js:38-67`), que en el flujo medido conserva `frjView` y la URL; y lo que este quick NO puede medir: Safari de
iOS y Chrome de Android reales, y el `HistoryUpdater` real en la ventana (las sondas de la app no arman la ráfaga).
  </context>
  <options>
    <option id="A">
      <name>«Llegó» = cambiaron el state Y la URL (recomendada)</name>
      <pros>Determinística en todos los motores: no depende del orden de los oyentes. No toca B1 ni el orden de enganche. El bloque de encendido sigue igual en las dos ramas (`C-retroceso-unico` intacto). Diseño: una memoria nueva no exportada `let urlDelConsumo: string | null = null`; en los dos bloques, después de la memoria del state, `urlDelConsumo = window.location.pathname + window.location.search`; `soltarConsumo` la pone en `null`; y el chequeo de `consumeOwnedPanelEntry` devuelve `true` si el state es el del consumo O la URL es la del consumo (se suelta y sigue sólo si cambiaron los dos). El docblock de la memoria del state deja de presentar la identidad como prueba de llegada.</pros>
      <cons>Si algo reemplazara la entrada en la ventana CAMBIANDO la URL (el `HistoryUpdater` escribe la `canonicalUrl` del árbol que confirma; en el flujo medido es la misma), la guarda se soltaría antes de tiempo como hoy: queda declarado. Una edición declarada del stub de NAV-08 de `lib/panel-history.test.ts`, que no tiene `location` (va en un commit `test` neutral antes del `fix`).</cons>
    </option>
    <option id="B">
      <name>Oyente de liberación en captura (la propuesta del revisor)</name>
      <pros>No deduce la llegada de nada: la escucha. Sobra la memoria del state. Diseño: en los dos bloques, el oyente de `popstate` de la guarda con `{ once: true, capture: true }`; `soltarConsumo` lo saca con `{ capture: true }`; el chequeo de `consumeOwnedPanelEntry` queda en «con un consumo en vuelo, `true`»; se borra la memoria del state (código y docblocks).</pros>
      <cons>Depende de que el navegador corra los oyentes de captura del objetivo ANTES que los de burbuja (DOM actual; Chrome desde la 89, lo mide la sonda de la app, P-5). En Safari de iOS no se puede medir acá: si un motor los corriera en orden de registro, B1 con dos subsecciones apiladas se quedaría en la primera (su re-decisor corre antes que la liberación y el menú devuelve `true` sin retroceder), una regresión en el teléfono que ningún gate de acá ve. El simulador tiene que aprender captura (commit `test` neutral antes del `fix`) y cambian dos líneas declaradas de `C-retroceso-unico` (la del oyente con `{ once: true }` y la que exige la memoria del state).</cons>
    </option>
    <option id="C">
      <name>Registrar con el número y no tocar</name>
      <pros>Cero código para WR-01. Queda AR-04-07 en `04-SECURITY.md` con las tuplas, y una entrada abierta en `deferred-items.md`. `W1-menu` y `W1-b1` pasan a `it.fails` (precedente en `test/appointment-time.test.ts`): el esperado CORRECTO queda y se pone rojo el día que llegue el arreglo.</pros>
      <cons>La ráfaga dentro de la latencia de la transición sigue sacando al dueño de la sección por el menú y DEL SITIO por la barra (riesgo alto aceptado). El docblock tiene que declararlo con el número.</cons>
    </option>
  </options>
  <resume-signal>Respondé `A`, `B` o `C`. Cualquier otra respuesta: el ejecutor PARA y la devuelve sin aplicar nada.</resume-signal>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Arreglar lo que reprodujo, corregir docblocks y el comentario de obs-G1, probar los candados de pageshow por mutación, la no-regresión por el turno y el registro</name>
  <reversibility rating="reversible">Unas líneas en `lib/panel-branch.ts` (la memoria de B1 y los `try`) y en `lib/panel-history.ts` (el `pageshow` y, según la decisión, el criterio de llegada), un comentario de la app, las ediciones declaradas de pruebas y tres documentos. Deshacerlo es un `git revert` de los commits `test`, `fix` y `docs` del task.</reversibility>
  <precondition>El task 1 terminó con sus dos gates verdes y `(m)` tiene la línea `veredictos (m): …`. Si `WR-01=reproduce`, el dueño respondió `A`, `B` o `C` en el task 2. No quedó activa ninguna regla de PARAR.</precondition>
  <files>lib/panel-branch.ts, lib/panel-history.ts, app/(dashboard)/finances/finances-client.tsx, test/panel-tabs.test.ts, test/panel-branch.test.ts, lib/panel-history.test.ts, .planning/debug/tabs-en-la-url-medida.md, .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md, .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-SECURITY.md</files>
  <behavior>
    - Con FUP, `C-retroceso-unico-rama` (nuevo y rojo antes del `fix`) fija que `consumeOwnedBranchEntry` hace el chequeo del consumo en vuelo con las MISMAS líneas que `consumeOwnedPanelEntry` y antes de sus dos guardas, y enciende la guarda con las MISMAS líneas que la rama `consume` de `applyPanelView`, con un solo retroceso; y `UP-doble` da un retroceso y `/dashboard`. Sin FUP, `UP-doble` queda como dio y `consumeOwnedBranchEntry` no cambia.
    - Con el arreglo, los 14 + 4 casos del task 1 están en verde sin cambiar un esperado: `CR-b1-doble` 2 retrocesos y `/dashboard`, `CR-b1-doble-fichas` 3 y `/dashboard`, `CR-b1-silencio` 2 y `/dashboard`, `K2-c-*` con el segundo paso desenganchado y `/finances`, `C-pageshow-no-persistido` con la guarda viva tras el `pageshow` no persistido y suelta tras el persistido. Con A o B, `W1-menu` 1 retroceso y `/finances`, `W1-b1` 2 y `/dashboard`; con C, los dos como `it.fails`.
    - M1 (sin el condicional de `persisted`) pone rojo `C-pageshow-no-persistido`; M2 (sin sacar el oyente de `pageshow` en `soltarConsumo`) pone rojo `P0-normal`. Las dos mutaciones se revierten con Edit y no se commitean.
    - Todos los casos viejos siguen verdes; los del quick 261118-kat sin tocar (salvo las dos líneas declaradas de B).
  </behavior>
  <read_first>
    - `.planning/debug/tabs-en-la-url-medida.md` `## (m)` (lo escrito en el task 1) y la respuesta del dueño del task 2 si la hubo.
    - `lib/panel-branch.ts` L310-466 y el docblock de `runBranchNavigation` (L316-344).
    - `lib/panel-history.ts` L27-36 (encabezado), L929-981 (la guarda), L1023-1111 (docblock y rama `consume`, con el residuo de L1046-1050), L1240-1308 (docblock y cuerpo de `consumeOwnedPanelEntry`, con el «nunca retrocede» de L1283) y L1310-1344 (`consumeOwnedBranchEntry`).
    - Con FUP: `test/panel-branch.test.ts` L135-200 (las tres aserciones declaradas L142, L170, L186) y L1293-1302 (el filtro de oyentes de la guarda que ya usa la L1300); `test/panel-tabs.test.ts` L1214-1272 (`C-retroceso-unico`, `lineas`, `bloqueDeEncendido`: el molde del candado nuevo).
    - `components/dashboard/panel-bottom-nav.tsx` L188-198 y `components/dashboard/unsaved-changes-guard.tsx` L255-290 (la barra llama primero `consumeOwnedPanelEntry` con `active` y después `handleNavigate`; el guard llama a `runBranchNavigation` SIN `reDecidir`). SÓLO LECTURA.
    - `app/(dashboard)/finances/finances-client.tsx` L1086-1100.
    - `04-SECURITY.md` L88-117 y L139-153, y `deferred-items.md` L100-147.
  </read_first>
  <action>
**Paso 0 — la decisión y las banderas.** Al final de `(m)` va una línea sola:
`decision WR-01 (<dueno, AAAA-MM-DD | sin checkpoint>): <A | B | C | no-aplica>` (`no-aplica` si WR-01 no reprodujo). Con eso:
**FCR** = CR-01 reprodujo; **FW2** = WR-02 reprodujo; **FI1** = IN-01 reprodujo; **FW1** = WR-01 reprodujo y la decisión
fue A o B; **WC** = la decisión fue C; **FUP** = UP reprodujo. Un caso sin su bandera NO recibe código (P-2). Se aplica `## El diseño del arreglo`
(arriba) y, para FW1, el diseño de la opción elegida en el task 2.

**Paso 1 — el instrumento que la opción necesita, ANTES del arreglo (sólo con A o con B).** Con A: al stub de
`montarHistorial` del preludio de NAV-08 se le agrega `location: { pathname: '/clients', search: '' }`. Con B: el
`montarHistoria` de `test/panel-tabs.test.ts` aprende captura (cada oyente guarda si es de captura, por `{ capture: true }`
o `true`; el despacho corre primero los de captura y después los demás, cada grupo en orden de registro; el deduplicado y el
quitado van por fn y captura), con su párrafo `(quick 261118-pjd)` en el docblock. Correr las tres suites del task 1: los
rojos y verdes tienen que ser EXACTAMENTE los de `(m)` (el instrumento es neutral con el código de hoy; si no, P-1).
Commit `test(quick-261118-pjd): el instrumento de la opción <A|B> de WR-01, neutral antes del arreglo` con el trailer.

**Paso 1b — el candado de FUP, ANTES del arreglo (sólo con FUP).** Al final de `test/panel-tabs.test.ts` va
`describe('UP-doble — el candado del arreglo, antes del arreglo (quick 261118-pjd)', () => {` con una copia exacta de
`lineas` y `bloqueDeEncendido` del describe de los candados del quick 261118-kat (que no se toca) y un solo caso,
`it('C-retroceso-unico-rama: consumeOwnedBranchEntry chequea el consumo en vuelo como el menú y enciende la guarda con las MISMAS líneas que la rama consume', () => {`.
Sobre el fuente sin comentarios de `lib/panel-history.ts` (`sinComentarios`, `cuerpoDe`, `recorte` y `read`, como
`C-retroceso-unico`), recorta el cuerpo de `consumeOwnedBranchEntry`, el de `consumeOwnedPanelEntry` y la rama `consume`
de `applyPanelView`, y afirma: en `consumeOwnedBranchEntry` la primera aparición de `consumoEnVuelo` va antes de
`isForeignOwnedEntry(actual)`, y ésa antes de `panelUnderRoute(actual) === null`; hay un solo `window.history.back()`, después
de esa guarda; las líneas recortadas (sin sangría) desde la primera que nombra `consumoEnVuelo` hasta la anterior a la que
empieza con `const actual` son IGUALES en `consumeOwnedBranchEntry` y en `consumeOwnedPanelEntry` (el chequeo, no vacío); y
`bloqueDeEncendido` de `consumeOwnedBranchEntry` es IGUAL al de la rama `consume` (no vacío). Correrlo: tiene que dar rojo
con el código de hoy (pegar el rojo en `(m)` en el paso 10). Commit
`test(quick-261118-pjd): UP-doble — el candado de la guarda compartida, antes del arreglo` con el trailer.

**Paso 2 — el arreglo en `lib/panel-branch.ts`** (FCR y FW2), exactamente como dice el diseño. El docblock de
`runBranchNavigation` suma un párrafo `(quick 261118-pjd)`: el `try` de las tres ramas y el segundo paso único de B1. Nada
fuera de `runBranchNavigation` y su memoria (P-4).

**Paso 3 — el arreglo en `lib/panel-history.ts`** (FI1, FUP y, con FW1, la opción elegida; FUP se escribe DESPUÉS de
aplicar la opción de WR-01, así copia el chequeo y el bloque finales) **y los docblocks, SIEMPRE**:
- **FUP (con su bandera):** exactamente como dice `## El diseño del arreglo`. Los docblocks de la guarda («quién la
  enciende»: suma `consumeOwnedBranchEntry`, con `up`, el colapso y su `second-consume`), de `applyPanelView` (la viñeta de
  la guarda compartida) y de `consumeOwnedBranchEntry` (un párrafo `(quick 261118-pjd)` con el número de `UP-doble` antes y
  después, y por qué adentro de su propio `popstate` sigue retrocediendo). Sin FUP, el docblock de `consumeOwnedBranchEntry`
  suma una línea con el número de `UP-doble` en verde.
- **El residuo del retroceso ignorado en silencio (WR-04, L1046-1050):** se reescribe con su radio verdadero. La guarda
  queda encendida hasta el próximo recorrido o una recarga; mientras tanto, los tabs dan `'none'`, la sección activa del
  menú devuelve `true` sin retroceder (gesto muerto) y la barra también es un gesto muerto pero deja UN solo re-decisor de
  B1 pendiente (con FCR: el último toque reemplaza a los anteriores) que corre con el próximo recorrido y completa el
  Inicio pedido: a lo sumo un `up` de más, nunca fuera del sitio. Cita el número de `CR-b1-silencio` de `(m)` (rojo con el
  código de antes, verde con el arreglo). Sin FCR, dice el número de `CR-b1-silencio` tal cual quedó.
- **La frase de L1283** deja de afirmar sin matices que el chequeo nunca retrocede: dice que localmente no retrocede y que,
  con el segundo paso único de B1 (`lib/panel-branch.ts`), ese `true` tampoco le suma un retroceso a la barra (CR-01).
- **La memoria del state y el docblock de la guarda (WR-01):** con A, la identidad deja de presentarse como prueba de
  llegada y se documenta el criterio state Y URL con el número de `W1-*`; con B, se documenta la captura y desaparece
  toda mención de la memoria borrada; con C, se declara el residuo con las tuplas de `W1-*` y AR-04-07; con `no-aplica`,
  el número de `W1-*` en verde.
- **`soltarAlVolverDeLaCache`** (con FI1): por qué el oyente va sin `once`.
- **El encabezado (L30-33):** sigue diciendo qué escucha el módulo (con B, que el de `popstate` es de captura).
- Ningún comentario nuevo cita textual las frases que se reemplazan. Sin temporizadores. Con A, C o `no-aplica`, ni el
  código ni los comentarios de `lib/panel-history.ts` escriben el literal de las opciones de la captura (el gate lo cuenta
  en 0); con B, ni el código ni los comentarios nombran la memoria del state que se borra.

**Paso 4 — las ediciones declaradas de pruebas que van con el arreglo, y ninguna otra.** Con B: en `C-retroceso-unico`
(describe de los candados del quick 261118-kat) la línea que exige el oyente de `popstate` con `{ once: true }` pasa a
exigirlo con `{ once: true, capture: true }`, y la que exige la memoria del state en el menú pasa a exigir que no esté;
cada una con una línea de comentario fechada `(2026-11-18, quick 261118-pjd)`. Con C: en `W1-menu` y `W1-b1`, `it(` pasa a
`it.fails(` y se agrega arriba una línea de comentario fechada con la decisión del dueño y AR-04-07. Con FUP: en
`test/panel-branch.test.ts`, las tres aserciones L142 (`up`: cero oyentes), L170 y L186 (colapso: un oyente) pasan a contar
los oyentes que NO son de la guarda, con el mismo filtro que la L1300 (y la misma cantidad: 0, 1 y 1), cada una con una línea
de comentario fechada `(2026-11-18, quick 261118-pjd)`: `consumeOwnedBranchEntry` engancha ahora los oyentes de liberación
de la guarda. Ninguna otra línea de ese archivo cambia. Ningún esperado cambia.

**Paso 5 — el comentario de obs-G1 (IN-02), en `app/(dashboard)/finances/finances-client.tsx`, SÓLO dentro del
comentario de L1091-1099.** La última frase deja de hablar de un tab vacío: el blanco aparece debajo de CUALQUIER tab más
corto que la pantalla, también en escritorio (donde la página pasa a tener scroll aunque el contenido entre), y mientras
cargan los datos del mes (los tres paneles muestran su aviso de vacío seguido de una pantalla en blanco); como el panel es
el último bloque, se lee como espacio de scroll al final; costo aceptado por el dueño (opción A, 2026-11-18). El texto nuevo
no nombra el historial, el router, `?tab=` ni `<Link>`. Ningún `className` cambia.

**Paso 6 — commit.** eslint de `lib/panel-branch.ts`, `lib/panel-history.ts`, las tres suites con rc 0, y en
`finances-client.tsx` sólo la deuda medida. Con alguna bandera (FCR, FW2, FI1, FW1, FUP): `git add` de lo tocado y el commit
`fix(quick-261118-pjd): <lo que se arreglo: un solo segundo paso de B1 / el try de la rama / pageshow sin once / el criterio de llegada de WR-01 / la guarda compartida en consumeOwnedBranchEntry>`
con el trailer. Sin ninguna bandera: `docs(quick-261118-pjd): los docblocks y el comentario de obs-G1 dicen lo medido`.

**Paso 7 — las dos mutaciones (WR-03), sobre el árbol de trabajo, sin commitear.** M1: con Edit, en
`soltarAlVolverDeLaCache` se reemplaza el condicional por la llamada directa a `soltarConsumo()`; correr
`./node_modules/.bin/vitest run --project pure test/panel-tabs.test.ts` y guardar la salida en un log de un directorio de
`mktemp -d`; revertir con Edit. M2: con Edit, se borra de `soltarConsumo` la línea que saca el oyente de `pageshow`;
correr `panel-tabs` y `lib/panel-history.test.ts` y guardar la salida; revertir con Edit. Después,
`git diff --quiet HEAD -- lib/panel-history.ts` tiene que dar 0. Anotar qué casos dio rojos cada una y la ruta de los logs.
Si M1 no pone rojo `C-pageshow-no-persistido` o M2 no pone rojo `P0-normal`, es P-3.

**Paso 8 — el PRIMER gate** (estático, suites y build; P-7 si choca con un `next dev` vivo).

**Paso 9 — la no-regresión por el turno, en segundo plano.** Es el SEGUNDO gate tal cual: la sonda de la app completa, la
estática y los ocho del scroll en `tras-el-fix`. **Anotar las rutas de los logs.** P-8 si la de la app no completó por el
login; cualquier otra cosa que no sea el verde es P-3 (con B, un `R-B1-*` sin `OK` es P-5).

**Paso 10 — el registro.**
- **En `(m)` sólo se agrega.** «El arreglo»: qué banderas se aplicaron y por qué (las decisiones del dueño), el rojo de
  `C-retroceso-unico-rama` antes del `fix` (con FUP), el verde de los 18 casos y los números de los dos gates con las rutas de
  los logs. Sin FUP, el número de `UP-doble` tal cual dio («descartado medido»). Las dos mutaciones, cada una en una línea sola y tal
  cual: `mutacion M1 (sin el condicional de persisted): C-pageshow-no-persistido=rojo` y
  `mutacion M2 (sin sacar el oyente de pageshow): P0-normal=rojo` (si alguna dio verde, no se escribe: es P-3). «Lo que NO
  cierra»: el teléfono real (la UAT corta va después del push conjunto), Safari de iOS y Android reales (con B, el orden de
  captura en iOS), el `HistoryUpdater` real en la ventana, R2-IN-04, y el doble toque sobre el COLAPSO (sin medir: con
  FUP queda cubierto por lectura por la misma guarda; sin FUP, abierto por lectura). La última línea, sola:
  `cierre (m): CR-01=<arreglado|descartado-medido> · WR-02=<…> · WR-01=<arreglado|aceptado-medido|descartado-medido> · IN-01=<arreglado|descartado-medido> · UP=<arreglado|descartado-medido>`.
- **En `deferred-items.md` sólo se agrega.** Al final de la entrada «Decisión del dueño (2026-11-18, secure-phase)», una
  línea `  **Corrección (2026-11-18, quick 261118-pjd):** …`: el cierre por la barra no cubría el doble toque (CR-01, con el
  número de `CR-b1-doble` antes y después). Después, una entrada nueva
  `- Review del quick 261118-kat (CR-01, WR-01..04, IN-01..03): …` con `  status: resolved (quick 261118-pjd; medido en .planning/debug/tabs-en-la-url-medida.md ## (m))`,
  `**Qué:**`, `**Decisión del dueño (2026-11-18):**` y `**Cierre:**` con los números; el `**Qué:**` y el `**Cierre:**`
  incluyen `UP-doble` (el doble toque sobre `up`, visto por lectura al planificar y medido acá) con su número, haya
  reproducido o no. Con C, además, una entrada
  `- WR-01 del review del quick 261118-kat: …` con `  status: open` y la decisión del dueño.
- **En `04-SECURITY.md`:** se cambian SÓLO las filas `| T-04-39 |`, `| T-04-40 |` y `| AR-04-06 |`, agregando en cada una
  un tramo `**… 2026-11-18 (quick 261118-pjd): …**` con el número (T-04-39 y AR-04-06: el caso 3 por la barra estaba ABIERTO
  por CR-01 —`CR-b1-doble` 3 retrocesos y `/afuera`, `CR-b1-doble-fichas` 4— y queda cerrado por mitigación si dio verde;
  WR-01 según la decisión; T-04-39 suma además `UP-doble` con su número: cerrado por mitigación con la guarda compartida si
  reprodujo, o descartado medido si no. T-04-40: WR-02 en las tres ramas, el `pageshow` sin `once` y M1/M2). Con C, una fila nueva
  `| AR-04-07 | T-04-39 (WR-01 del review del quick 261118-kat) | … | Dueño | AAAA-MM-DD |` debajo de AR-04-06. En el audit
  trail, una fila nueva `| 2026-11-18 | 56 | … | 0 | quick 261118-pjd: … |` con los números (14 + 4 casos, `UP-doble`, M1/M2, R-T
  12/12, R-B1 4/4, estática 18/18, scroll 8/8). `threats_open: 0` y `status: verified` quedan.
Commit `docs(quick-261118-pjd): CR-01 del review y UP-doble cerrados — (m), deferred-items y 04-SECURITY con lo medido` con el trailer.

**Paso 11 — el SUMMARY** (`261118-pjd-SUMMARY.md` en el directorio del quick, con la plantilla): `requirements-completed: []`,
los commits, el entorno, la tabla de hallazgos (medido, veredicto, qué se hizo), la decisión del dueño de WR-01, los
números de los gates, las mutaciones, las rutas de los logs, los residuos y que **no se pusheó**. Lo commitea el
orquestador. **El TERCER gate se corre recién con el SUMMARY escrito.**
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && T=test/panel-tabs.test.ts; TB=test/panel-branch.test.ts; TH=lib/panel-history.test.ts; PH=lib/panel-history.ts; PBF=lib/panel-branch.ts; F="app/(dashboard)/finances/finances-client.tsx"; L=.planning/debug/tabs-en-la-url-medida.md; TL=$(git log --reverse --format=%H --grep='^test(quick-261118-pjd)' HEAD); TLRC=$?; test "$TLRC" = 0 && test -n "$TL" || { echo "sin commit test(quick-261118-pjd)"; exit 1; }; B="$(printf '%s\n' "$TL" | head -1)^"; KC=$(git log --format=%H -S"describe('CR-01 del review de R2-WR-01 — medidos antes de arreglar" -- "$T" | tail -1); test -n "$KC" || { echo "sin KC"; exit 1; }; quitadas() { tr -d '\r' | awk '/^@@/ { split($2, o, ","); ln = substr(o[1], 2) + 0; next } /^-/ && !/^---/ { print ln ":" substr($0, 2); ln++ }'; }; cuerpo() { tr -d '\r' | awk -v p="export function $1(" 'index($0, p) == 1 {f=1} f {print} f && $0 == "}" {exit}'; }; WL=$(tr -d '\r' < "$L"); VL=$(printf '%s\n' "$WL" | grep -E '^veredictos \(m\): ' | head -1); DL=$(printf '%s\n' "$WL" | grep -E '^decision WR-01 \([^)]*\): (A|B|C|no-aplica)$' | head -1); DW=${DL##*: }; FCR=0; FW2=0; FI1=0; FW1=0; WC=0; DOK=0; case "$VL" in *"CR-01=reproduce"*) FCR=1;; esac; case "$VL" in *"WR-02=reproduce"*) FW2=1;; esac; case "$VL" in *"IN-01=reproduce"*) FI1=1;; esac; FUP=0; case "$VL" in *"UP=reproduce"*) FUP=1;; esac; case "$VL" in *"WR-01=reproduce"*) case "$DW" in A|B) FW1=1; DOK=1;; C) WC=1; DOK=1;; esac;; *"WR-01=no-reproduce"*) test "$DW" = no-aplica && DOK=1;; esac; NEED=$((FCR + FW2 + FI1 + FW1 + FUP)); FXL=$(git log --format=%H --grep='^fix(quick-261118-pjd)' HEAD); FXN=$(printf '%s\n' "$FXL" | grep -c .); FXOK=0; { [ "$NEED" -gt 0 ] && [ "$FXN" = 1 ]; } || { [ "$NEED" = 0 ] && [ "$FXN" = 0 ]; } && FXOK=1; ORD=1; if [ "$FXN" = 1 ]; then git merge-base --is-ancestor "$KC" "$FXL" || ORD=0; fi; QT=$(git diff -U0 "$KC" -- "$T" | quitadas); OT=$(git show "$KC:$T" | tr -d '\r'); SA=$(printf '%s\n' "$OT" | grep -n '^function montarHistoria(' | cut -d: -f1); SZ=$(printf '%s\n' "$OT" | awk -v a="$SA" 'NR > a && $0 == "}" { print NR; exit }'); case "$DW" in B) MALT=$(printf '%s\n' "$QT" | grep . | awk -F: -v a="$SA" -v z="$SZ" '$1 < a || $1 > z' | grep -vF 'soltarConsumo, { once: true })")' | grep -vF "indexOf('estadoDelConsumo')" | grep -c .); DECL=$(printf '%s\n' "$QT" | grep -cE "soltarConsumo, \{ once: true \}\)\"\)|indexOf\('estadoDelConsumo'\)"); TOK=$([ "$MALT" = 0 ] && [ "$DECL" = 2 ] && echo 1 || echo 0);; C) MALT=$(printf '%s\n' "$QT" | grep . | grep -vE "^[0-9]+:  it\('W1-(menu|b1): " | grep -c .); DECL=$(printf '%s\n' "$QT" | grep -cE "^[0-9]+:  it\('W1-(menu|b1): "); TOK=$([ "$MALT" = 0 ] && [ "$DECL" = 2 ] && echo 1 || echo 0);; *) MALT=$(printf '%s\n' "$QT" | grep -c .); DECL=0; TOK=$([ "$MALT" = 0 ] && echo 1 || echo 0);; esac; QTBL=$(git diff -U0 "$KC" -- "$TB" | quitadas); QTB=$(printf '%s\n' "$QTBL" | grep -c .); OTB=$(git show "$KC:$TB" | tr -d '\r'); UA=$(printf '%s\n' "$OTB" | grep -n "^describe('runBranchNavigation — SUBIR un nivel" | cut -d: -f1); UZ=$(printf '%s\n' "$OTB" | grep -n "^describe('runBranchNavigation — los otros tres miembros" | cut -d: -f1); QTBD=$(printf '%s\n' "$QTBL" | grep -E '^[0-9]+:    expect\((ctx\.)?enganchados\)\.toHaveLength\([01]\)$' | awk -F: -v a="$UA" -v z="$UZ" '$1 > a && $1 < z' | grep -c .); if [ "$FUP" = 1 ]; then TBOK=$([ "$QTB" = 3 ] && [ "$QTBD" = 3 ] && echo 1 || echo 0); else TBOK=$([ "$QTB" = 0 ] && echo 1 || echo 0); fi; OHK=$(git show "$KC:$TH" | tr -d '\r'); A2=$(printf '%s\n' "$OHK" | grep -n "^describe('consumeOwnedPanelEntry — tocar la sección" | cut -d: -f1); Z2=$(printf '%s\n' "$OHK" | awk -v a="$A2" 'NR > a && index($0, "  it(") == 1 { print NR; exit }'); QTH=$(git diff -U0 "$KC" -- "$TH" | quitadas); QTHN=$(printf '%s\n' "$QTH" | grep -c .); QTHF=$(printf '%s\n' "$QTH" | grep . | awk -F: -v a="$A2" -v z="$Z2" '$1 <= a || $1 >= z' | grep -c .); case "$DW" in A) THOK=$([ "$QTHF" = 0 ] && echo 1 || echo 0);; *) THOK=$([ "$QTHN" = 0 ] && echo 1 || echo 0);; esac; RA=$(tr -d '\r' < "$PBF" | grep -n '^export function consumeOwnedExitSentinel(' | cut -d: -f1); RZ=$(tr -d '\r' < "$PBF" | grep -n '^// ── El SENTINEL DE SALIDA' | cut -d: -f1); FUERA=$(git diff -U0 "$B" -- "$PBF" | tr -d '\r' | awk -v a="$RA" -v z="$RZ" '/^@@/ { split($3, n, ","); s = substr(n[1], 2) + 0; c = (n[2] == "" ? 1 : n[2] + 0); if (s <= a || s + c - 1 >= z) print s }' | grep -c .); HPB=$(git diff -U0 "$B" -- "$PBF" | grep -c '^@@'); PBOK=0; if [ $((FCR + FW2)) -gt 0 ]; then [ "$HPB" -gt 0 ] && [ "$FUERA" = 0 ] && PBOK=1; else [ "$HPB" = 0 ] && PBOK=1; fi; WPB=$(tr -d '\r' < "$PBF"); MEM=$(printf '%s\n' "$WPB" | grep -cE '^let segundoPasoB1Pendiente: \(\(\) => void\) \| null = null$'); MEX=$(printf '%s\n' "$WPB" | grep -cE '^export [^(]*segundoPasoB1Pendiente'); RB=$(cuerpo runBranchNavigation < "$PBF"); RBN=$(printf '%s\n' "$RB" | grep -c .); TRY=$(printf '%s\n' "$RB" | grep -cE '^ +\} catch \(e\) \{$'); THR=$(printf '%s\n' "$RB" | grep -cE '^ +throw e$'); POL=1; for fn in panelNavMode panelBranchPlan; do h0=$(git show "$B:$PH" | cuerpo $fn | sha1sum | cut -c1-40); h1=$(cuerpo $fn < "$PH" | sha1sum | cut -c1-40); n1=$(cuerpo $fn < "$PH" | grep -c .); [ "$h0" = "$h1" ] && [ "$n1" -ge 15 ] || POL=0; done; WPH=$(tr -d '\r' < "$PH"); GN=$(printf '%s\n' "$WPH" | grep -cxF "  if (consumoEnVuelo) return 'none'"); PER=$(printf '%s\n' "$WPH" | grep -cxF '  if (e.persisted) soltarConsumo()'); PSO=$(printf '%s\n' "$WPH" | grep -cF "window.addEventListener('pageshow', soltarAlVolverDeLaCache, { once: true })"); PSN=$(printf '%s\n' "$WPH" | grep -cE "^ +window\.addEventListener\('pageshow', soltarAlVolverDeLaCache\)$"); URLM=$(printf '%s\n' "$WPH" | grep -cE '^let urlDelConsumo: string \| null = null$'); CAP=$(printf '%s\n' "$WPH" | grep -c 'capture: true'); EDC=$(printf '%s\n' "$WPH" | grep -c 'estadoDelConsumo'); SIL=$(printf '%s\n' "$WPH" | grep -c 'CR-b1-silencio'); WF=$(tr -d '\r' < "$T" | grep -cE "^  it\.fails\('W1-(menu|b1): "); ST=$(cat "$PH" "$PBF" | grep -c setTimeout); CB=$(cuerpo consumeOwnedBranchEntry < "$PH"); CBN=$(printf '%s\n' "$CB" | grep -c .); CBV=$(printf '%s\n' "$CB" | grep -c 'consumoEnVuelo = true'); CBB=$(printf '%s\n' "$CB" | grep -c 'window.history.back()'); CBG=$(printf '%s\n' "$CB" | grep -c 'isForeignOwnedEntry(actual)'); KRN=$(tr -d '\r' < "$T" | grep -cE "^  it\('C-retroceso-unico-rama: "); KR=$(git log --format=%H -S"it('C-retroceso-unico-rama:" -- "$T" | tail -1); UOK=0; KOK=1; if [ "$FUP" = 1 ]; then [ "$CBV" = 1 ] && [ "$CBB" -ge 1 ] && [ "$CBG" = 1 ] && [ "$KRN" = 1 ] && UOK=1; KOK=0; [ -n "$KR" ] && [ "$FXN" = 1 ] && [ "$KR" != "$FXL" ] && git merge-base --is-ancestor "$KR" "$FXL" && KOK=1; else [ "$CBV" = 0 ] && [ "$CBG" = 1 ] && [ "$KRN" = 0 ] && UOK=1; fi; MOK=0; if [ "$FCR" = 1 ]; then [ "$MEM" = 1 ] && [ "$MEX" = 0 ] && [ "$SIL" -ge 1 ] && MOK=1; else [ "$MEM" = 0 ] && MOK=1; fi; WOK=0; if [ "$FW2" = 1 ]; then [ "$TRY" = 3 ] && [ "$THR" = 3 ] && WOK=1; else [ "$TRY" = 0 ] && WOK=1; fi; IOK=0; if [ "$FI1" = 1 ]; then [ "$PSO" = 0 ] && [ "$PSN" = 2 ] && IOK=1; else [ "$PSO" = 2 ] && [ "$PSN" = 0 ] && IOK=1; fi; case "$DW" in A) DOK2=$([ "$URLM" = 1 ] && [ "$CAP" = 0 ] && [ "$EDC" -ge 3 ] && [ "$WF" = 0 ] && echo 1 || echo 0);; B) DOK2=$([ "$URLM" = 0 ] && [ "$CAP" -ge 3 ] && [ "$EDC" = 0 ] && [ "$WF" = 0 ] && echo 1 || echo 0);; C) DOK2=$([ "$URLM" = 0 ] && [ "$CAP" = 0 ] && [ "$WF" = 2 ] && echo 1 || echo 0);; *) DOK2=$([ "$URLM" = 0 ] && [ "$CAP" = 0 ] && [ "$WF" = 0 ] && echo 1 || echo 0);; esac; FA=$(tr -d '\r' < "$F" | grep -nF '{/* obs-G1' | cut -d: -f1); FZ=$(tr -d '\r' < "$F" | grep -nF '<Tabs value={txTab}' | cut -d: -f1); FFU=$(git diff -U0 "$B" -- "$F" | tr -d '\r' | awk -v a="$FA" -v z="$FZ" '/^@@/ { split($3, n, ","); s = substr(n[1], 2) + 0; c = (n[2] == "" ? 1 : n[2] + 0); if (s < a || s + c - 1 >= z) print s }' | grep -c .); FHN=$(git diff -U0 "$B" -- "$F" | grep -c '^@@'); VIEJA=$(grep -cF 'un tab vacío deja blanco debajo de su aviso' "$F"); MDV=$(grep -c 'className=.*min-h-dvh' "$F"); EF=$(./node_modules/.bin/eslint "$F" 2>&1 | tr -d '\r'); EFN=$(printf '%s\n' "$EF" | grep -cE '^ +[0-9]+:[0-9]+ +(error|warning)'); EF467=$(printf '%s\n' "$EF" | grep -cE '^ +467:21 +error'); CAMB=$(git diff --name-only "$B" -- app components lib scripts proxy.ts next.config.ts package.json package-lock.json supabase | tr -d '\r' | grep -vxF -e "$F" -e "$PH" -e "$PBF" -e "$TH" | grep -c .); git diff --quiet HEAD -- "$PH" "$PBF" "$T" "$TB" "$TH" "$F"; LIMPIO=$?; HC=$(sha1sum next.config.ts | cut -d' ' -f1); TSC=$(./node_modules/.bin/tsc --noEmit 2>&1 | grep -v '^\.next/' | grep -E 'error TS'); ./node_modules/.bin/eslint "$PH" "$PBF" "$T" "$TB" "$TH" > /dev/null 2>&1; EL=$?; PURA=$(./node_modules/.bin/vitest run --project pure 2>&1 | tr -d '\r'); PF=$(printf '%s\n' "$PURA" | grep -cE 'Tests +[0-9]+ failed'); PAF=$(printf '%s\n' "$PURA" | grep -oE 'Test Files +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); PN=$(printf '%s\n' "$PURA" | grep -oE 'Tests +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); SUITES="test/panel-tabs.test.ts lib/panel-history.test.ts test/panel-history-clients.test.ts test/panel-history-sidebar.test.ts test/panel-branch.test.ts test/panel-nav-chrome.test.ts test/overlay-history.test.ts test/dirty-history.test.ts"; OUT=$(./node_modules/.bin/vitest run --project pure $SUITES 2>&1 | tr -d '\r'); SF=$(printf '%s\n' "$OUT" | grep -cE 'Tests +[0-9]+ failed'); SN=$(printf '%s\n' "$OUT" | grep -oE 'Tests +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); PT=$(./node_modules/.bin/vitest run --project pure "$T" 2>&1 | tr -d '\r'); TF=$(printf '%s\n' "$PT" | grep -cE 'Tests +[0-9]+ failed'); TN=$(printf '%s\n' "$PT" | grep -oE 'Tests +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); BLD=$(npm run build 2>&1); BRC=$?; printf '%s\n' "$BLD" | tail -6; SUSP=$(printf '%s\n' "$BLD" | grep -ciE 'useSearchParams\(\) should be wrapped in a suspense|Missing Suspense boundary'); echo "banderas FCR=$FCR FW2=$FW2 FI1=$FI1 FW1=$FW1 WC=$WC FUP=$FUP (veredictos=[$VL] decision=[$DL] coherente=$DOK (1)) · fix=$FXN coherente=$FXOK (1) · casos antes del fix=$ORD (1) · panel-tabs desde KC: quitadas fuera de lo declarado=$MALT declaradas=$DECL ok=$TOK (1) · panel-branch.test desde KC: quitadas=$QTB declaradas de FUP=$QTBD ok=$TBOK (1; con FUP 3/3, si no 0) · consumeOwnedBranchEntry: lineas=$CBN encendido=$CBV retroceso=$CBB guarda ajena=$CBG candado de la rama=$KRN ok=$UOK (1) candado antes del fix=$KOK (1) · panel-history.test desde KC ok=$THOK (1) · panel-branch.ts hunks=$HPB fuera de runBranchNavigation=$FUERA ok=$PBOK (1) · memoria B1=$MEM exportada=$MEX ok=$MOK (1) · try/throw en la rama=$TRY/$THR ok=$WOK (1) · cuerpo de runBranchNavigation=$RBN lineas (>=100) · politica identica=$POL (1) · guarda llana=$GN (1) condicional persisted=$PER (1) · pageshow con once=$PSO sin once=$PSN ok=$IOK (1) · WR-01 url=$URLM captura=$CAP memoria del state=$EDC it.fails=$WF ok=$DOK2 (1) · temporizadores=$ST (0) · obs-G1: hunks=$FHN fuera del comentario=$FFU (0) frase vieja=$VIEJA (0) paneles=$MDV (3) deuda eslint=$EFN/$EF467 (1/1) · otros archivos cambiados=$CAMB (0) · sin commitear=$LIMPIO (0) · next.config=$HC · errores TS=[$TSC] · eslint=$EL (0) · pura fallas=$PF (0) archivos=$PAF (>=77) casos=$PN (>=$((1875 + FUP))) · 8 suites fallas=$SF (0) casos=$SN (>=$((701 + FUP))) · panel-tabs fallas=$TF (0) casos=$TN (>=$((111 + FUP))) · build rc=$BRC (0) suspense=$SUSP (0)"; test "$DOK" = 1 && test "$FXOK" = 1 && test "$ORD" = 1 && test -n "$SA" && test -n "$SZ" && test "$TOK" = 1 && test -n "$UA" && test -n "$UZ" && test "$TBOK" = 1 && test "$UOK" = 1 && test "$KOK" = 1 && test "$CBN" -ge 5 && test -n "$A2" && test -n "$Z2" && test "$THOK" = 1 && test -n "$RA" && test -n "$RZ" && test "$PBOK" = 1 && test "$MOK" = 1 && test "$WOK" = 1 && test "$RBN" -ge 100 && test "$POL" = 1 && test "$GN" = 1 && test "$PER" = 1 && test "$IOK" = 1 && test "$DOK2" = 1 && test "$ST" = 0 && test -n "$FA" && test -n "$FZ" && test "$FHN" -ge 1 && test "$FFU" = 0 && test "$VIEJA" = 0 && test "$MDV" = 3 && test "$EFN" = 1 && test "$EF467" = 1 && test "$CAMB" = 0 && test "$LIMPIO" = 0 && test "$HC" = 8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578 && test -z "$TSC" && test "$EL" = 0 && test "$PF" = 0 && test "${PAF:-0}" -ge 77 && test "${PN:-0}" -ge $((1875 + FUP)) && test "$SF" = 0 && test "${SN:-0}" -ge $((701 + FUP)) && test "$TF" = 0 && test "${TN:-0}" -ge $((111 + FUP)) && test "$BRC" = 0 && test "$SUSP" = 0</automated>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && L=.planning/debug/tabs-en-la-url-medida.md; S=.planning/debug/probes/g04-scroll-y-recarga.mjs; WL=$(tr -d '\r' < "$L"); VL=$(printf '%s\n' "$WL" | grep -E '^veredictos \(m\): ' | head -1); DL=$(printf '%s\n' "$WL" | grep -E '^decision WR-01 \([^)]*\): (A|B|C|no-aplica)$' | head -1); DW=${DL##*: }; N=0; case "$VL" in *"CR-01=reproduce"*) N=$((N + 1));; esac; case "$VL" in *"WR-02=reproduce"*) N=$((N + 1));; esac; case "$VL" in *"IN-01=reproduce"*) N=$((N + 1));; esac; case "$VL" in *"UP=reproduce"*) N=$((N + 1));; esac; case "$VL" in *"WR-01=reproduce"*) case "$DW" in A|B) N=$((N + 1));; esac;; esac; if [ "$N" = 0 ]; then echo "sin cambio de codigo: las sondas no aplican"; exit 0; fi; LOGDIR=$(mktemp -d) || exit 1; LA="$LOGDIR/app.txt"; LE="$LOGDIR/estatica.txt"; LS="$LOGDIR/scroll.txt"; node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz > "$LA" 2>&1; RA=$?; node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs > "$LE" 2>&1; RE=$?; IDS=F-blanda-mas-movil,F-directa-movil,F-tarjeta-movil,F-sidebar-escritorio,N-negocio-borde-movil,G1-ventas-movil,G1-egresos-movil,G1-ventas-escritorio; node scripts/con-turno.mjs node "$S" "$IDS" verde-pjd tras-el-fix > "$LS" 2>&1; RS=$?; WA=$(tr -d '\r' < "$LA"); WE=$(tr -d '\r' < "$LE"); WS=$(tr -d '\r' < "$LS"); printf '%s\n' "$WA" | grep -E '^(OK  |FALLA )|recorridos medidos'; printf '%s\n' "$WE" | tail -4; printf '%s\n' "$WS" | grep -E '^(OK  |FALLA |ERROR-DEL-INSTRUMENTO)|^etiqueta=|paneles con alto minimo'; NT=$(printf '%s\n' "$WA" | grep -cE '^OK  R-T-'); NB=$(printf '%s\n' "$WA" | grep -cE '^OK  R-B1-'); NBI=$(printf '%s\n' "$WA" | grep -cE '^OK  R-B1-inicio '); OTRAS=$(printf '%s\n' "$WA" | grep -E '^FALLA ' | grep -v '^FALLA R-G3-10-primer-toque-atras-pronto '); NOC=$(printf '%s\n' "$WA" | grep -c 'la sonda no pudo completar'); MED=$(printf '%s\n' "$WA" | grep -oE 'recorridos medidos: [0-9]+' | grep -oE '[0-9]+'); OKE=$(printf '%s\n' "$WE" | grep -cE '^OK  E-'); OKS=$(printf '%s\n' "$WS" | grep -cE '^OK  (F-blanda-mas-movil|F-directa-movil|F-tarjeta-movil|F-sidebar-escritorio|N-negocio-borde-movil|G1-ventas-movil|G1-egresos-movil|G1-ventas-escritorio) '); VS=$(printf '%s\n' "$WS" | grep -cE '^etiqueta=verde-pjd · modo=tras-el-fix · recorridos: 8 · coinciden con lo esperado tras el fix: 8$'); PAN=$(printf '%s\n' "$WS" | grep -cE '^finances-client\.tsx huella=[0-9a-f]{16} paneles con alto minimo: 3$'); ER=$(printf '%s\n' "$WS" | grep -cE '^ERROR-DEL-INSTRUMENTO|la sonda no pudo completar'); echo "logs: app=$LA estatica=$LE scroll=$LS · app R-T OK=$NT (12) R-B1 OK=$NB (4) retroceso triple R-B1-inicio=$NBI (1) otras FALLA=[$OTRAS] (vacio) medidos=$MED no completo=$NOC (0: si no, P-8) rc=$RA (no se juzga) · estatica rc=$RE (0) OK=$OKE (18) · scroll rc=$RS (0) OK=$OKS (8) veredicto 8/8=$VS (1) paneles=$PAN (1) fallos=$ER (0)"; test "$NT" = 12 && test "$NB" = 4 && test "$NBI" = 1 && test -z "$OTRAS" && test "$NOC" = 0 && test -n "$MED" && test "$RE" = 0 && test "$OKE" = 18 && test "$RS" = 0 && test "$OKS" = 8 && test "$VS" = 1 && test "$PAN" = 1 && test "$ER" = 0</automated>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && L=.planning/debug/tabs-en-la-url-medida.md; DI=.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md; SEC=.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-SECURITY.md; SUM=.planning/workstreams/panel-nav/quick/261118-pjd-cr-01-del-review-de-r2-wr-01-un-solo-seg/261118-pjd-SUMMARY.md; TL=$(git log --reverse --format=%H --grep='^test(quick-261118-pjd)' HEAD); TLRC=$?; test "$TLRC" = 0 && test -n "$TL" || { echo "sin commit test(quick-261118-pjd)"; exit 1; }; B="$(printf '%s\n' "$TL" | head -1)^"; quitadas() { tr -d '\r' | awk '/^@@/ { split($2, o, ","); ln = substr(o[1], 2) + 0; next } /^-/ && !/^---/ { print ln ":" substr($0, 2); ln++ }'; }; agregadas() { tr -d '\r' | awk '/^@@/ { split($3, n, ","); ln = substr(n[1], 2) + 0; next } /^\+/ && !/^\+\+\+/ { print ln ":" substr($0, 2); ln++ }'; }; WL=$(tr -d '\r' < "$L"); VL=$(printf '%s\n' "$WL" | grep -E '^veredictos \(m\): ' | head -1); DL=$(printf '%s\n' "$WL" | grep -E '^decision WR-01 \([^)]*\): (A|B|C|no-aplica)$' | head -1); DW=${DL##*: }; e() { case "$VL" in *"$1=reproduce"*) echo arreglado;; *) echo descartado-medido;; esac; }; case "$VL" in *"WR-01=reproduce"*) case "$DW" in C) W1=aceptado-medido; WC=1;; *) W1=arreglado; WC=0;; esac;; *) W1=descartado-medido; WC=0;; esac; CE="cierre (m): CR-01=$(e CR-01) · WR-02=$(e WR-02) · WR-01=$W1 · IN-01=$(e IN-01) · UP=$(e UP)"; UPD=$(grep -c 'UP-doble' "$DI"); UPS=$(grep -c 'UP-doble' "$SEC"); ULT=$(printf '%s\n' "$WL" | grep -v '^$' | tail -1); REML=$(git diff -U0 "$B" HEAD -- "$L" | quitadas | grep -c .); M1=$(printf '%s\n' "$WL" | grep -cxF 'mutacion M1 (sin el condicional de persisted): C-pageshow-no-persistido=rojo'); M2=$(printf '%s\n' "$WL" | grep -cxF 'mutacion M2 (sin sacar el oyente de pageshow): P0-normal=rojo'); REMDI=$(git diff -U0 "$B" HEAD -- "$DI" | quitadas | grep -c .); WDI=$(tr -d '\r' < "$DI"); OPEN=$(printf '%s\n' "$WDI" | grep -c 'status: open'); RES=$(printf '%s\n' "$WDI" | grep -c 'status: resolved (quick 261118-pjd'); COR=$(printf '%s\n' "$WDI" | grep -cE '^  \*\*Corrección \(2026-11-18, quick 261118-pjd\):\*\*'); NUE=$(printf '%s\n' "$WDI" | grep -cE '^- Review del quick 261118-kat \(CR-01, WR-01\.\.04, IN-01\.\.03\)'); NW1=$(printf '%s\n' "$WDI" | grep -cE '^- WR-01 del review del quick 261118-kat'); QS=$(git diff -U0 "$B" HEAD -- "$SEC" | quitadas); AS=$(git diff -U0 "$B" HEAD -- "$SEC" | agregadas); QSN=$(printf '%s\n' "$QS" | grep -c .); QSM=$(printf '%s\n' "$QS" | grep . | grep -vcE '^[0-9]+:\| (T-04-39|T-04-40|AR-04-06) \|'); ASM=$(printf '%s\n' "$AS" | grep . | grep -vcE '^[0-9]+:\| (T-04-39|T-04-40|AR-04-06|AR-04-07|2026-11-18) \|'); AUD=$(printf '%s\n' "$AS" | grep -cE '^[0-9]+:\| 2026-11-18 \| 56 \|.*quick 261118-pjd'); AR7=$(printf '%s\n' "$AS" | grep -cE '^[0-9]+:\| AR-04-07 \|'); PJD=$(printf '%s\n' "$AS" | grep -E '^[0-9]+:\| (T-04-39|T-04-40|AR-04-06) \|' | grep -c '261118-pjd'); TO=$(grep -cx 'threats_open: 0' "$SEC"); SV=$(grep -cx 'status: verified' "$SEC"); DC=$(git log --format=%H --grep='^docs(quick-261118-pjd)' HEAD | grep -c .); git diff --quiet HEAD -- "$L" "$DI" "$SEC"; LIMPIO=$?; SX=0; test -f "$SUM" && SX=1; RQ=0; test -f "$SUM" && RQ=$(tr -d '\r' < "$SUM" | grep -cx 'requirements-completed: \[\]'); FX=$(git log --format=%H --grep='^fix(quick-261118-pjd)' HEAD | head -1); RR=0; test -n "$FX" && RR=$(git branch -r --contains "$FX" 2>/dev/null | grep -c .); echo "ultima de (m)=[$ULT] · esperada=[$CE] · quitadas de la medida=$REML (0) · mutaciones M1=$M1 M2=$M2 (1/1) · deferred: quitadas=$REMDI (0) abiertas=$OPEN ($((8 + WC))) resueltas pjd=$RES (>=1) correccion=$COR (1) entrada nueva=$NUE (1) entrada WR-01=$NW1 ($WC) · SECURITY: filas quitadas=$QSN (3) ajenas quitadas=$QSM (0) ajenas agregadas=$ASM (0) audit=$AUD (1) AR-04-07=$AR7 ($WC) filas con pjd=$PJD (3) threats_open=$TO (1) verified=$SV (1) · UP-doble registrado en deferred=$UPD en SECURITY=$UPS (>=1/>=1) · docs=$DC (>=2) · sin commitear=$LIMPIO (0) · SUMMARY=$SX (1) requirements-completed=$RQ (1) · fix en remoto=$RR (0)"; test "$ULT" = "$CE" && test "$REML" = 0 && test "$M1" = 1 && test "$M2" = 1 && test "$REMDI" = 0 && test "$OPEN" = $((8 + WC)) && test "$RES" -ge 1 && test "$COR" = 1 && test "$NUE" = 1 && test "$NW1" = "$WC" && test "$QSN" = 3 && test "$QSM" = 0 && test "$ASM" = 0 && test "$AUD" = 1 && test "$AR7" = "$WC" && test "$PJD" = 3 && test "$TO" = 1 && test "$SV" = 1 && test "$UPD" -ge 1 && test "$UPS" -ge 1 && test "$DC" -ge 2 && test "$LIMPIO" = 0 && test "$SX" = 1 && test "$RQ" = 1 && test "$RR" = 0</automated>
    <fails_when>**El segundo gate se corre en segundo plano (`run_in_background`):** la espera del turno no tiene tope, y un tope vencido corta la corrida a la mitad y deja el turno tomado.

**El primero falla si:**
- La línea de decisión no es coherente con el veredicto de WR-01, o el `fix` no existe habiendo una bandera (o existe sin ninguna), o no desciende del commit de los casos.
- En `panel-tabs` se quitó desde `KC` algo que no es lo declarado de la opción (B: el simulador y las dos líneas de `C-retroceso-unico`; C: las dos líneas `it('W1-`; si no, nada). En `panel-branch.test.ts` se quitó algo desde `KC` (con FUP, algo que no son exactamente las tres aserciones declaradas de los describes de subir y colapsar). En `panel-history.test.ts` se quitó algo desde `KC` (con A, fuera del preludio de NAV-08).
- `lib/panel-branch.ts` cambió fuera de la región de `runBranchNavigation` y su memoria, o cambió sin FCR/FW2. Falta o se exporta la memoria de B1 (con FCR), o el docblock no cita `CR-b1-silencio`. No hay exactamente tres `catch (e)` y tres `throw e` en `runBranchNavigation` (con FW2).
- Con FUP: `consumeOwnedBranchEntry` no enciende la guarda o perdió su guarda ajena, falta `C-retroceso-unico-rama` o no está en un commit anterior al `fix`. Sin FUP: `consumeOwnedBranchEntry` enciende la guarda o existe el candado.
- `panelNavMode` o `panelBranchPlan` no son byte-idénticas a la base (o el recorte midió menos de 15 líneas).
- Desapareció la guarda llana o el condicional de `persisted` (una mutación sin revertir), el `pageshow` no está como corresponde a FI1, o el estado de WR-01 no es el de la decisión (url, captura, memoria del state, `it.fails`). Hay un temporizador.
- `finances-client.tsx` cambió fuera del comentario de obs-G1, sigue la frase vieja, cambió un panel, o eslint da otra cosa que la deuda medida de 467:21.
- Cambió otro archivo de la app, de `lib`, `components`, `scripts`, `supabase` o los de paquetes; quedan cambios sin commitear; `next.config.ts` tiene otra huella.
- `tsc`, eslint, la pura, las 8 suites, `panel-tabs` o el build en rojo, o por debajo de su piso.

**El segundo falla si:** algún `R-T-*` o `R-B1-*` no está en `OK` (con B, P-5), falta el `OK` del retroceso triple, hay una FALLA en la app que no es la declarada (P-3), la corrida no completó (P-8), la estática da menos de 18, o el scroll da menos de 8/8 o no midió `paneles con alto minimo: 3`.

**El tercero falla si:**
- La última línea de `(m)` no es el `cierre (m)` que corresponde (con `UP=`), cambió una línea vieja de la medida, o faltan las dos líneas de mutación en rojo.
- `UP-doble` no está registrado con su número en `deferred-items.md` y en `04-SECURITY.md`.
- En `deferred-items.md` se quitó una línea, las abiertas no son 8 (9 con C), falta la corrección, la entrada nueva resuelta o (con C) la de WR-01.
- En `04-SECURITY.md` cambió otra línea que no son las filas T-04-39, T-04-40 y AR-04-06 (más AR-04-07 con C y la fila nueva del audit trail), alguna de las tres no cita `261118-pjd`, o cambiaron `threats_open`/`status`.
- Faltan los `docs`, el SUMMARY o su `requirements-completed: []`, o el `fix` ya está en una rama remota.</fails_when>
  </verify>
  <done>Se arregló exactamente lo que reprodujo, y WR-01 según el veredicto y la decisión del dueño, con los casos commiteados antes del `fix`. `UP-doble`, si reprodujo, quedó arreglado con la guarda compartida en `consumeOwnedBranchEntry` y `C-retroceso-unico-rama` en un `test` anterior al `fix`; si no, registrado con el número. Los 14 + 4 casos están verdes sin cambiar un esperado, M1 y M2 pusieron rojos sus candados y quedaron revertidas. `lib/panel-branch.ts` cambió sólo en `runBranchNavigation` y su memoria, con `panelNavMode` y `panelBranchPlan` byte-idénticas. Los docblocks dicen lo medido (WR-04, WR-01, IN-01) y el comentario de obs-G1 ya no subestima el blanco. `tsc`, eslint, la pura, las 8 suites, `panel-tabs` y el build en verde; por el turno, R-T 12/12, R-B1 4/4, estática 18/18 y scroll 8/8. `(m)` termina en `cierre (m)`, `deferred-items.md` y `04-SECURITY.md` están al día con el número, el SUMMARY existe y nada se pusheó.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dueño (sesión) → historial del panel | El arreglo cambia CUÁNTAS veces se retrocede por gesto: un retroceso de más deja al dueño fuera de la sección y, con B1, fuera del sitio (la cicatriz 2). No hay query, policy, route handler ni dato nuevo; el aislamiento por `business_id` no se toca. |
| registro de la medición | Los esperados se fijan antes de la corrida que los juzga y los veredictos de `(m)` se recalculan de lo medido. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-pjd-01 | Tampering | esperados de los 18 casos | medium | mitigate | Commit `test(quick-261118-pjd)` antes de medir; el gate 1 del task 1 exige 0 líneas quitadas de `panel-tabs` y quitadas sólo en los preludios declarados; el gate 2 recalcula la línea de veredictos; el gate 1 del task 3 exige 0 quitadas desde `KC` salvo lo declarado de la opción. |
| T-pjd-02 | Denial of Service (dueño fuera del sitio) | segundo paso de B1 (`consume-view-then-navigate`) | high | mitigate | FCR: `segundoPasoB1Pendiente` (el nuevo reemplaza al anterior, el que corre se suelta antes de re-decidir). Lo fijan `CR-b1-doble`, `CR-b1-doble-fichas`, `CR-b1-silencio`, `CR-b1-reemplazo-unidad`, los NR del quick 261118-kat, `NR-menu-y-barra` y, en la app, R-B1-* 4/4 con el retroceso triple. `panelNavMode`/`panelBranchPlan` byte-idénticas (gate). |
| T-pjd-03 | Denial of Service (navegación no pedida) | `runBranchNavigation`, las tres ramas de dos pasos | medium | mitigate | FW2: `try` que desengancha el segundo paso y relanza el mismo error; `K2-c-b1`, `K2-c-b1-unidad`, `K2-c-exit`, `K2-c-colapso`; tres `catch (e)` y tres `throw e` (gate). |
| T-pjd-04 | Denial of Service (tabs muertos) | `soltarAlVolverDeLaCache` / `soltarConsumo` | medium | mitigate | FI1: `pageshow` sin `once` con el condicional de `persisted`; `C-pageshow-no-persistido` y `P0-*`; el `afterEach` de NAV-08 exige cero oyentes; M1 y M2 prueban que los candados muerden. |
| T-pjd-05 | Denial of Service (dueño fuera del sitio) | la guarda bajo un `replaceState` de Next en la ventana (WR-01) | high | mitigate | Medido primero (`W1-menu`, `W1-b1`); si reproduce, el dueño decide en un checkpoint bloqueante: A o B se arreglan con su gate; C queda como AR-04-07 con el número y `it.fails`, aceptado por el dueño. |
| T-pjd-08 | Denial of Service (dueño fuera del sitio) | `consumeOwnedBranchEntry` (`up`, colapso) con un retroceso en vuelo | high | mitigate | Medido primero (`UP-doble`, control `UP-control`); si reproduce, FUP: la misma guarda de consumo en vuelo con el mismo bloque, vigilado por `C-retroceso-unico-rama` (en un `test` anterior al `fix`), sin tocar las dos guardas ni su orden, ni `panelNavMode`/`panelBranchPlan`; los NR de B1 (incluido el retroceso triple, que pasa por el `second-consume`) y R-B1 4/4 fijan que adentro de su propio `popstate` sigue retrocediendo. Si no reproduce, se registra con el número. |
| T-pjd-06 | Repudiation | el cierre de AR-04-06 que no cubría la barra | medium | mitigate | La corrección va con el número en T-04-39/AR-04-06, una fila nueva del audit trail y una línea `**Corrección**` en `deferred-items.md`; el gate 3 exige las tres filas con `261118-pjd` y ninguna otra línea cambiada. |
| T-pjd-07 | Denial of Service | turno de pantalla y `next dev` ajenos | low | mitigate | Toda corrida con navegador por `scripts/con-turno.mjs`, en segundo plano y sin Ctrl+C; las sondas miden contra un `next dev` existente sin matarlo; forjo-landing (3000) no se toca. |
| T-pjd-SC | Tampering | paquetes | low | accept | Cero dependencias nuevas: `package.json` y `package-lock.json` en la lista de intocables del gate 1 del task 3. |
</threat_model>

<verification>
- **Medición antes del arreglo:** `./node_modules/.bin/vitest run --project pure test/panel-tabs.test.ts test/panel-branch.test.ts lib/panel-history.test.ts`
  con los 18 casos commiteados: los rojos por su aserción, `NR-menu-y-barra`, `UP-control`, los `P0-*` y el candado de
  orden en verde, ningún caso viejo en rojo; `(m)` con `veredictos (m): …` (con `UP=`) coherente.
- **Si `WR-01=reproduce`:** el checkpoint del dueño (A/B/C), sin decidir por él.
- **Arreglo sólo de lo que reprodujo:** el `fix` desciende de los casos; los 18 casos verdes sin cambiar esperados; M1 y
  M2 en rojo con el código mutado y revertidas; `lib/panel-branch.ts` confinado a `runBranchNavigation`; con FUP,
  `C-retroceso-unico-rama` rojo antes del `fix` y verde después, y sólo las tres aserciones declaradas de
  `test/panel-branch.test.ts` cambiadas; `panelNavMode`/`panelBranchPlan` byte-idénticas.
- **No-regresión:** `./node_modules/.bin/tsc --noEmit` sin `error TS`; eslint por archivo (deuda medida en
  `finances-client.tsx`); pura >= 77/1875, 8 suites >= 701, `panel-tabs` >= 111 (uno más cada uno con FUP); `npm run build` verde; por el turno, la
  app (R-T 12/12, R-B1 4/4 con R-B1-inicio, sólo la FALLA declarada), la estática 18/18 y el scroll 8/8 en `tras-el-fix`.
- **Registro:** `(m)` terminada en `cierre (m)`; `deferred-items.md` con 8 abiertas (9 con C) y la corrección;
  `04-SECURITY.md` con T-04-39/T-04-40/AR-04-06 al día y una fila nueva del audit trail; `UP-doble` registrado con su
  número en los tres. Nada pusheado.
</verification>

<success_criteria>
- CR-01, WR-02, WR-01, el `pageshow` y `UP-doble` medidos con el código de antes y con los esperados fijados antes de
  medir.
- Dos toques a Inicio desde una sección con la marca de la rama retroceden una sola vez (si reprodujo, con la guarda
  compartida en `consumeOwnedBranchEntry`), o quedan registrados con el número si no reprodujo.
- Un doble toque a Inicio en la barra termina en Inicio y nunca fuera del sitio; un `back()` que tira no deja un segundo
  paso colgado en ninguna de las tres ramas; un `pageshow` no persistido no traba ni gasta la salida.
- WR-01 resuelto como decidió el dueño, o cerrado con el número si no reprodujo.
- B1 sigue terminando igual (control, reentrada, retroceso triple) y la política de rutas no cambia.
- Los docblocks y el comentario de obs-G1 dicen lo medido; el registro de la Phase 4 deja de declarar mitigado lo que no
  estaba. Sin regresión en las suites ni en las sondas. Nada pusheado: sale con obs-G1 y R2-WR-01, y la UAT corta en el
  teléfono la arma el orquestador después del push.
</success_criteria>

<output>
Crear `.planning/workstreams/panel-nav/quick/261118-pjd-cr-01-del-review-de-r2-wr-01-un-solo-seg/261118-pjd-SUMMARY.md` al terminar.

Si el plan para en el task 2 (checkpoint), el ejecutor NO escribe el SUMMARY final: devuelve el checkpoint con las tuplas
de `W1-menu` y `W1-b1` copiadas de `(m)` y las opciones A/B/C.

Con P-0, P-1, P-3, P-4, P-5 o P-8 repetido, el SUMMARY dice dónde se paró, pega lo medido y deja la pregunta para el dueño
con opciones (por ejemplo, con P-5: que Chrome no corre la captura primero y que la opción B no sirve en este motor; con
P-4: qué parte del diseño chocó y con qué).
</output>
