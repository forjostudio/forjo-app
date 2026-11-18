---
phase: quick-261118-jdq
plan: "01"
type: execute
wave: 1
depends_on: []
quick_id: 261118-jdq
files_modified:
  - .planning/debug/probes/g04-scroll-y-recarga.mjs
  - test/panel-tabs.test.ts
  - app/(dashboard)/finances/finances-client.tsx
  - .planning/debug/tabs-en-la-url-medida.md
  - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md
autonomous: true
# MOB-09 (los tabs de /finances en la URL) es el requisito al que pertenece la pantalla que se toca. Se LISTA, no se
# marca: ya está Complete desde la re-UAT 8/8 del 04-08. El SUMMARY lleva requirements-completed: [].
requirements: [MOB-09]

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Con el código de ANTES del arreglo, la sonda del scroll reproduce obs-G1 en la app real: en un mes con >= 10 turnos y 0 ventas / 0 egresos, el primer toque de Ventas (390x844 y 1280x800) y de Egresos (390x844) desde Turnos da `recorte_por_alto: si`, sin salto y sin escritura de scroll de Next; 3/3 con la hipótesis, con los esperados commiteados en `test(quick-261118-jdq)` antes de esa corrida y el log diciendo `paneles con alto minimo: 0`"
    - "Cada uno de los tres `TabsContent` de Finanzas (Turnos · Ventas · Egresos) lleva `min-h-dvh` —CSS puro, sin JavaScript ni medición de alturas en runtime— y el único archivo de la app que cambia es `app/(dashboard)/finances/finances-client.tsx`: `components/ui/tabs.tsx`, `finances/page.tsx` y toda otra pantalla quedan idénticos"
    - "Con el arreglo, la MISMA sonda da 8/8 en `tras-el-fix`: los tres `G1-*` con `recorte_toque1`/`recorte_toque2` en `no`, `salto_*` en `no` y `next_*` en `no` (móvil y escritorio), y los cinco recorridos de G-04-6 siguen en OK (cero escrituras de Next en el primer toque); `--autotest` sigue 5/5"
    - "Sin regresión: `tsc` limpio, eslint de Finanzas con la deuda medida (`react-hooks/set-state-in-effect=1`), la pura >= 77 archivos / >= 1845 casos, las 8 suites de historial >= 671, `panel-tabs` >= 85 con el candado obs-G1 que fue ROJO antes del arreglo y VERDE después, build ok, y los cuatro `R-T-finanzas-*` de la sonda de la app en OK"
    - "Queda el registro: `## (k)` al final de `.planning/debug/tabs-en-la-url-medida.md` con el rojo y el verde pegados y la línea `cierre (k): …`; la entrada obs-G1 de `deferred-items.md` pasa a `status: resolved …`; nada se pushea (sale junto con R2-WR-01)"
  artifacts:
    - path: .planning/debug/probes/g04-scroll-y-recarga.mjs
      provides: "la primitiva `irAlMesConTurnos`, la fábrica `g1Recorrido` y los recorridos `G1-ventas-movil`, `G1-egresos-movil`, `G1-ventas-escritorio`; la línea de huella de `finances-client.tsx` con `paneles con alto minimo: N`"
    - path: test/panel-tabs.test.ts
      provides: "el candado `it('obs-G1: …')` dentro del describe de Finanzas"
    - path: app/(dashboard)/finances/finances-client.tsx
      provides: "`min-h-dvh` en los tres `TabsContent` y el comentario del porqué"
    - path: .planning/debug/tabs-en-la-url-medida.md
      provides: "la sección `## (k)` con el rojo, el verde y `cierre (k)`"
    - path: .planning/workstreams/panel-nav/quick/261118-jdq-obs-g1-alto-minimo-de-los-tabs-de-finanz/261118-jdq-SUMMARY.md
      provides: "el resultado, los números y los residuos declarados"
  key_links:
    - from: "`<TabsContent … min-h-dvh>` (el panel activo)"
      to: "el scroll máximo del documento después del toque"
      via: "alto_documento >= borde_superior_del_panel + 100dvh + lo_de_abajo ⇒ scroll_máximo >= borde_del_panel > scrollY del toque (el tab tiene que estar a la vista para tocarlo)"
    - from: "los recorridos `G1-*`"
      to: "`tocarTabMedido` → `clasificarToque` (`recorte_por_alto`, `llevo_al_inicio`, `escritura_de_next`)"
      via: "el clasificador existente, sin tocar: en estos tres recorridos `recorte_por_alto` pasa de informativo a JUZGADO por su `esperado`"
    - from: "`irAlMesConTurnos`"
      to: "el botón real «Mes anterior» y los rótulos `Turnos (N)` / `Ventas (N)` / `Egresos (N)`"
      via: "click real convertido al viewport visual (afirmado con `elementFromPoint`) y lectura del conteo de los tres triggers"
---

<objective>
Cerrar **obs-G1** de la re-UAT del 04-08 con la opción **A** que eligió el dueño (2026-11-18, no se reabre): darle a
cada tab de Finanzas (Turnos · Ventas · Egresos) un **alto mínimo igual al de la pantalla**, con CSS, para que al
cambiar a un tab con poco contenido (Ventas con 0 ventas) el documento no quede más corto que el `scrollY` del momento
y el navegador no recorte el scroll («cada vez que voy a ventas hace un salto ahí porque se achica»).

Purpose: es el mismo `recorte_por_alto` que la sonda ya mide (y hoy sólo informa) en Negocio → Cobros (`## (h)`):
no es un scroll de la app, es el máximo de scroll que se achica. **Medir primero** (memoria
`medir-antes-de-aceptar-un-fix-propuesto`): el recorte se reproduce con el código de hoy y con los esperados
commiteados antes, recién después se aplica el CSS, y la misma sonda tiene que dar el recorte en `no` sin regresar
G-04-6 (cero escrituras de scroll de Next en el primer toque; la sonda 5/5 del 04-06 sigue 5/5).

Output: tres recorridos nuevos en la sonda del scroll + un candado de fuente (commit `test`), la corrida ROJA por el
turno, el arreglo de tres clases (commit `fix`), la corrida VERDE por el turno con la no-regresión, y el registro en
`(k)` + `deferred-items.md` (commit `docs`).

**Costo aceptado por el dueño:** un tab vacío muestra espacio en blanco debajo de su empty state. **Sólo Finanzas.**

**Fuera de alcance, a propósito:** Negocio → Cobros (su recorte informativo sigue igual: el dueño acotó a Finanzas);
el desborde horizontal de Finanzas a 390 px (otra entrada de `deferred-items.md`); `components/ui/tabs.tsx`
(compartido); `finances/page.tsx`; R2-WR-01 (su propio quick, mismo push); cualquier checkpoint humano (la UAT en el
teléfono va junto con R2-WR-01, después del push conjunto); ROADMAP, STATE, REQUIREMENTS.
</objective>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/workstreams/panel-nav/STATE.md
@.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md
@.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-08-SUMMARY.md
@AGENTS.md
@.claude/CLAUDE.md
@.claude/skills/convenciones-forjo/SKILL.md
</context>

<!-- plan-criteria-allow: R4 - ningun git va en una etapa de tuberia: cada git diff / git log que funda un candado es una asignacion $(...) que captura su rc antes de seguir; el escaner une segmentos a traves de las comillas simples de las regex ('a|b') y lee esa barra como una tuberia -->
<!-- planner-discipline-allow: min-h-dvh -->
<!-- planner-discipline-allow: min-h- -->
<!-- planner-discipline-allow: recorte_por_alto: si -->
<!-- planner-discipline-allow: NO-COINCIDE -->
<!-- planner-discipline-allow: ERROR-DEL-INSTRUMENTO -->
<!-- planner-discipline-allow: esperado_si_HA: { recorte_toque1: 'si', salto_toque1: 'no', next_toque1: 'no', salto_toque2: 'no', next_toque2: 'no' } -->
<!-- planner-discipline-allow: esperado_tras_el_fix: { recorte_toque1: 'no', salto_toque1: 'no', next_toque1: 'no', recorte_toque2: 'no', salto_toque2: 'no', next_toque2: 'no' } -->
<!-- planner-discipline-allow: paneles con alto minimo: -->
<!-- planner-discipline-allow: Mes anterior -->
<!-- planner-discipline-allow: it('obs-G1: -->
<!-- planner-discipline-allow: obs-G1 -->
<!-- planner-discipline-allow: mes con turnos: -->
<!-- planner-discipline-allow: <TabsContent value= -->
<!-- planner-discipline-allow: etiqueta=rojo-obs-g1 · recorridos: 3 · coinciden con la hipotesis: 3 -->
<!-- planner-discipline-allow: etiqueta=verde-obs-g1 · modo=tras-el-fix · recorridos: 8 · coinciden con lo esperado tras el fix: 8 -->
<!-- planner-discipline-allow: cierre (k): el tab corto de finanzas ya no achica la pagina · rojo 3/3 · verde 8/8 -->
<!-- planner-discipline-allow: status: open -->
<!-- (todos los de esta lista son POSITIVOS: los gates exigen que aparezcan —los esperados textuales y la linea de huella una vez entre lo agregado a la sonda, el boton, el it, el mes elegido, los veredictos pegados y la linea de cierre al menos una vez, las tres TabsContent exactamente tres veces—; status: open se cuenta para exigir que queden 11 y que la unica linea quitada de deferred-items sea la de obs-G1. Los actions los dan textuales para que el ejecutor los escriba asi) -->
<!-- (min-h-dvh es POSITIVO: los gates exigen las tres líneas exactas de TabsContent con esa clase. min-h- se niega SOLO sobre components/ui/tabs.tsx, que ningún task edita. Los otros tres son salidas de la sonda que ya existen; los actions los nombran para decir cuándo PARAR) -->

## Lo medido al planificar (2026-11-18, `ccb8979`, sólo lectura)

- **En local el caso NO se reproduce en el mes actual:** `negocio-prueba` tiene **0** turnos en noviembre 2026, y
  **0** ventas y **0** egresos en toda su historia (`docker exec supabase_db_forjo-app psql …`, consulta de sólo
  lectura). Con los tres tabs vacíos los tres miden lo mismo y no hay nada que se achique —por eso los `F-*` de
  `(h)`/`(j)` sólo vieron el recorte de 37/55 px del viewport emulado, no el de obs-G1—.
- **Cómo se fuerza, sin escribir en la base:** hay meses pasados con turnos no cancelados —2026-07: 18, 2026-08: 15,
  **2026-09: 22**, 2026-10: 5—. Los recorridos nuevos retroceden mes por mes con el botón real «Mes anterior» hasta uno
  con **>= 10 turnos y 0 ventas y 0 egresos** (hoy: septiembre 2026). Si al ejecutar no hay ninguno en los 12 meses
  anteriores, se DECLARA y se PARA (P-0): no se insertan datos sin el dueño.
- La sonda `g04-scroll-y-recarga.mjs` no cambió desde `834417e`; `--autotest` da 5/5; `finances-client.tsx` no tiene
  ninguna clase `min-h-` y sus tres `TabsContent` están en L1102, L1135 y L1160; `components/ui/tabs.tsx` no tiene
  ninguna `min-h-`. Los archivos tocados están en CRLF en el árbol (`core.autocrlf=true`): todo `grep -x` del árbol
  pasa antes por `tr -d '\r'`.

## La geometría: por qué alcanza `min-h-dvh` en cada panel (decisión de la unidad, a criterio del planner)

Sea `P` el borde superior del panel activo en el documento, `A` el `innerHeight` después del toque, `H` el alto
mínimo del panel y `L` lo que queda debajo del panel en el documento (`p-4` del envoltorio + el `pb` del `<main>` =
16 + 56 px + safe-area en móvil; `p-8` = 32 px en escritorio). Con el mínimo, `alto_documento >= P + H + L`, así que
`scroll_máximo = alto_documento - A >= P + (H - A) + L`. Para tocar un tab tiene que estar a la vista, y el panel
empieza 24 px debajo del tab (`gap-2` del `<Tabs>` + `mt-4` del panel): `scrollY_del_toque < P - 24`. Entonces el
navegador NO recorta si `H - A + L >= -24`, o sea `H >= A - L - 24`.

- **`100dvh` (`min-h-dvh`)** es el viewport visible de ahora ≈ `A`: sobra margen (`L + 24` = 96 px en móvil, 56 px en
  escritorio). Es la misma unidad que ya usan el envoltorio y el `<main>` de `app/(dashboard)/layout.tsx` (su
  comentario explica por qué `dvh` y no `vh` frente a la barra de URL). En el móvil EMULADO de la sonda, el desborde
  horizontal infla `innerHeight` a 881/899 mientras `dvh` puede quedar en 844: `H - A` = -55 > -96, alcanza igual.
- **`100vh` (`min-h-screen`)** también alcanza pero es el viewport GRANDE: hasta ~56 px más de blanco sin ganar nada,
  y rompe la convención del layout. **`100svh`** alcanzaría con menos margen (40 px en móvil con la barra de URL
  escondida). **Restar el chrome con `calc`** contradice «alto de la pantalla» y es justo la cuenta que el layout
  dice que se rompió dos veces.
- Un navegador sin `dvh` (Chrome < 108, Safari < 15.4) descarta la declaración y se comporta como hoy: no hay regresión.
- **En cada `TabsContent` y no en el `<Tabs>` raíz:** en la raíz la fila de los tabs (32 px + `gap-2`) contaría
  adentro del mínimo y se comería ~40 px del margen; y es lo que pidió el dueño («a cada tab»). El panel inactivo no
  ocupa lugar (Base UI lo desmonta o lo oculta), así que el mínimo sólo vale para el visible. Con contenido más alto
  que la pantalla (Turnos con muchos turnos) el `min-height` ni ata.

## Reglas que valen para los tres tasks

- **La base `B`** es el padre del PRIMER commit `test(quick-261118-jdq)` (al planificar, HEAD = `ccb8979`). Los gates
  la calculan solos; los números de línea de los `<read_first>` son los de `ccb8979`.
- **Intocables:** `lib/overlay-history.ts`, `lib/dirty-history.ts`, `scripts/con-turno.mjs` (CONGELADO; la herramienta
  de `D:/herramientas/turno-pantalla` no se edita), `next.config.ts` (sha1 `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`),
  `components/ui/tabs.tsx` (compartido), `app/(dashboard)/finances/page.tsx` y toda otra pantalla. Nada de dependencias
  nuevas. Nunca `git checkout --` (CRLF): para revertir, Edit.
- **El turno de pantalla:** toda corrida que levante navegador o servidor va envuelta en `node scripts/con-turno.mjs …`
  y se lanza en **segundo plano** (`run_in_background`) con el MISMO comando del gate; se lee la salida al terminar. Si
  el turno está ocupado espera e imprime al dueño: **una espera no es un cuelgue**. **Nunca Ctrl+C** a una corrida de
  pantalla; si una se corta: `bash D:/herramientas/turno-pantalla/turno-pantalla.sh estado` → matar el PID dueño SÓLO si
  es nuestro → `bash D:/herramientas/turno-pantalla/turno-pantalla.sh liberar`. Fuera del turno: `--autotest`, eslint,
  `tsc`, la pura, el build y `docker exec … psql`.
- **El servidor:** si hay un `next dev` de ESTE repo vivo, la sonda lo detecta y mide contra él (nunca se mata ni se
  reinicia). Si no, levanta el suyo en el 3031 y lo mata al salir. El `next dev` de forjo-landing en el 3000 no se
  toca. 3031/9335 ocupados por otra cosa es P-0.
- **Supabase:** sólo la pila de forjo-app y sólo `supabase start` si la API no contesta; nunca `stop`, `db reset`,
  `docker stop`/`rm`. **Ninguna escritura en la base** (sólo `select`).
- **⚠ El guard de secretos de esta máquina bloquea todo comando de Bash que contenga el literal «punto env».** Ningún
  gate lo contiene; un comando propio del ejecutor tampoco.
- **Anti-gates del repo:** `./node_modules/.bin/tsc --noEmit` (nunca `npx tsc`: sale 0 siempre); eslint archivo por
  archivo (nunca `npm run lint`). No se corre `npm test` (ningún módulo de lógica ni de base cambia); si el ejecutor lo
  corre igual, sólo dentro de [01:00, 23:30] hora de Argentina (canarios de reloj del carril `db`).
- **Commits:** `git add <rutas explícitas>` y nada más —nunca `-A`; `.claude/settings.json` y
  `.planning/workstreams/panel-nav/.verification-ledger.json` quedan sin trackear—; alcances `test(quick-261118-jdq):`,
  `fix(quick-261118-jdq):`, `docs(quick-261118-jdq):`; cada mensaje termina con la línea en blanco y
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Nada de push** (sale en el mismo push que R2-WR-01).
  No se edita ROADMAP, STATE ni REQUIREMENTS (la contabilidad del quick la hace el orquestador); nunca
  `requirements.mark-complete`.
- **Textos de la sonda** en español ASCII sin tildes ni eñe, cada comentario en su propia línea, como el resto del
  archivo. **La sonda se AMPLÍA:** 0 líneas quitadas; ninguna función ni `esperado` existente cambia.

## Las reglas de PARAR

- **P-0 (el entorno):** la API local no contesta y `supabase start` no la levanta; ningún mes de los 12 anteriores al
  actual tiene >= 10 turnos no cancelados con 0 ventas y 0 egresos en `negocio-prueba`; o 3031/9335 ocupados por algo
  que no es la sonda ⇒ PARAR con lo corrido y lo devuelto. No se escribe en la base para destrabarlo.
- **P-1 (el instrumento):** una guarda que tira (`ERROR-DEL-INSTRUMENTO`, `la sonda no pudo completar`, el `P-1 obs-G1`
  de la primitiva nueva, `el toque no llego`) ⇒ UNA re-corrida idéntica. Si se repite y la causa es un defecto de la
  primitiva nueva (no de un `esperado`), se permite UN arreglo del instrumento en otro commit `test(quick-261118-jdq)`
  ANTES de la primera corrida que juzga, sin tocar ninguna línea de `esperado`; si no, PARAR con el reporte.
- **P-2 (el rojo no reproduce):** con el código de antes, cualquier `NO-COINCIDE` en la corrida roja (p. ej.
  `recorte_toque1` medido `no`, o un `salto`/`next` en `si`) ⇒ PARAR **sin aplicar el arreglo**: el SUMMARY pega los
  números y la pregunta va al dueño. Ningún `esperado` se toca después de medir.
- **P-3 (el verde no da 8/8):** PARAR con el log. No se prueba otra unidad ni otro lugar (la raíz del `<Tabs>`, `vh`,
  `svh`, un `calc`) por cuenta propia: eso es decisión del dueño. Ningún `esperado` se toca.
- **P-7 (el build):** si `npm run build` choca con un `next dev` de este repo vivo, no se mata: se espera a que no esté y
  se re-corre; si no se puede, se declara en el SUMMARY.

<tasks>

<task type="tracer">
  <name>Task 1: obs-G1 de punta a punta con el código de hoy — los tres recorridos y el candado, commiteados ANTES, y la corrida roja por el turno</name>
  <reversibility rating="reversible">Código agregado al instrumento y un `it` nuevo en una suite; la app no cambia; deshacerlo es un `git revert` del commit `test`.</reversibility>
  <precondition>HEAD es `ccb8979` o un descendiente sin cambios en `.planning/debug/probes/g04-scroll-y-recarga.mjs`, `test/panel-tabs.test.ts` ni `app/(dashboard)/finances/finances-client.tsx` desde `ccb8979`; la API local de Supabase de forjo-app contesta en 127.0.0.1:54321 (o `supabase start` la levanta).</precondition>
  <files>.planning/debug/probes/g04-scroll-y-recarga.mjs, test/panel-tabs.test.ts</files>
  <read_first>
    - `.planning/debug/tabs-en-la-url-medida.md` L1072-1223: `## (h)` entera (qué es `recorte_por_alto`, cómo se corrigió el clasificador en P-1, los 37/55 px del viewport emulado, el formato de las corridas pegadas).
    - `.planning/debug/probes/g04-scroll-y-recarga.mjs`: cabecera L1-62 (cómo se corre, los modos, «QUE NO CIERRA»), `celular`/`escritorio`/`exprTab`/`EXPR_PRIMERA` L559-574, `esperarTabQuieto`/`posicionar`/`estadoDelScroll`/`clasificarToque` L620-702, `tocarTabMedido`/`imprimirToque` L704-774, `tocarEnlaceDentro` y `COND_FINANZAS` L785-803, los cuatro `F-*` L868-980 (los moldes de las tres entradas: Más, tarjeta, sidebar), el `RECORRIDOS.push` de los `B1-*` L1174, `correrYReportar` L1176-1208 (las líneas `OK  `/`FALLA`/`COINCIDE-CON-LA-HIPOTESIS`), `main` L1210-1235 (los argumentos y el bucle de huellas de las `page.tsx`), `autotest` L1342-1364.
    - `app/(dashboard)/finances/finances-client.tsx`: `monthAnchor` L195, el selector de período L823-835 (el botón `aria-label="Mes anterior"` y el `span` del mes al lado), los tabs L1090-1179 (los rótulos `Turnos (N)`, `Ventas (N)`, `Egresos (N)` y los tres `TabsContent`).
    - `test/panel-tabs.test.ts` L425-505: `read` (normaliza CRLF), `sinComentarios`, y el describe «Finanzas — el tab sale de la URL, en un solo dialecto» (dónde va el `it` nuevo y con qué estilo).
  </read_first>
  <action>
**Paso 0 — el entorno (P-0).** Anotar para el SUMMARY `docker ps --format '{{.Names}}'` y la hora. Chequear la API con
`curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:54321/rest/v1/` (`000` = pila caída ⇒
`supabase start` desde la raíz, en segundo plano, hasta que conteste). Después, la distribución de SÓLO LECTURA (la
misma consulta del planificador): `docker exec supabase_db_forjo-app psql -U postgres -At -c` con un `select` que, para
el negocio de slug `negocio-prueba`, cuente por mes (`to_char(date,'YYYY-MM')`) los turnos con `status <> 'cancelled'`,
y aparte cuente sus filas de `manual_sales` y de `expenses`. Pegarla en el SUMMARY. Si ningún mes de los 12 anteriores al
actual tiene >= 10 turnos con 0 ventas y 0 egresos: P-0, PARAR y declararlo (al planificar: 2026-09 con 22).

**Paso 1 — la sonda se amplía (sólo agrega).**
(a) En la cabecera, después del párrafo `// MODO tras-el-fix …` (termina en L58), un párrafo nuevo `// MODO obs-G1
(quick 261118-jdq): …` que diga: que los recorridos `G1-*` JUZGAN `recorte_por_alto` (en el resto es informativo); que
necesitan un mes con >= 10 turnos y 0 ventas y 0 egresos, que buscan retrocediendo con el boton real «Mes anterior»
(datos locales, sin escribir en la base); que su `esperado_si_HA` es el ROJO (el codigo sin el alto minimo) y su
`esperado_tras_el_fix` el arreglo (decision del dueno, opcion A, 2026-11-18); y en «QUE NO CIERRA», una linea: el
telefono real (la UAT del dueno va con R2-WR-01).
(b) En `main()`, inmediatamente después del bucle de huellas de las tres `page.tsx` (L1230-1235), leer
`app/(dashboard)/finances/finances-client.tsx`, contar sus líneas que contienen `<TabsContent value=` Y `min-h-`, e
imprimir UNA línea con este formato exacto: `finances-client.tsx huella=<16 hex: sha256 del texto con LF> paneles con
alto minimo: <n>` (el rojo imprime 0, el verde 3: así el log dice qué variante se midió).
(c) Inmediatamente después de la línea `RECORRIDOS.push(b1RecargaHacia(...), ...)` (L1174), un bloque nuevo con su
encabezado `// ── obs-G1 (quick 261118-jdq) …` que contenga:
- `async function irAlMesConTurnos(cdp, { minimo = 10, vacios, tope = 12 })`: lee los conteos de los tres triggers
  (`[role="tab"]` cuyo texto normalizado es `Turnos (N)`, `Ventas (N)` o `Egresos (N)`) y el texto del `span` del mes;
  si `Turnos >= minimo` y cada tab de `vacios` tiene 0, devuelve `{ mes, turnos, ventas, egresos, pasos }`. Si no,
  lleva el scroll a 0 como propio de la sonda (`__sondaPropio`, igual que `posicionar`), hace un click REAL en el
  centro del botón `aria-label="Mes anterior"` convertido al viewport visual y afirmado con `elementFromPoint` (el
  patrón de `tocarTabMedido`; si no cae adentro, tira P-1), espera hasta 10 s a que el texto del mes cambie y después
  `esperarTabQuieto(cdp, 'Turnos', { condicion: COND_FINANZAS })`, y repite. Tras `tope` pasos sin encontrarlo tira
  `P-1 obs-G1: ningun mes de los ultimos <tope> tiene >= <minimo> turnos con 0 en <vacios> (el caso no se reproduce con los datos locales)`.
- `function g1Recorrido({ id, titulo, entrada, primero, segundo })` que devuelve un objeto de recorrido con `id`,
  `titulo` y `correr(cdp)`: según `entrada` —`'mas'`: `celular` → `entrarDirecto` → `tocarEnLaBarra(cdp, '/mas')` →
  `tocarEnlace(cdp, '/finances')` (molde de `F-blanda-mas-movil`); `'tarjeta'`: `celular` → `entrarDirecto` →
  `tocarEnlace(cdp, '/finances')` (molde de `F-tarjeta-movil`); `'sidebar'`: `escritorio` y, dentro de un
  `try`/`finally` que vuelve a `celular`, `entrarDirecto` → `tocarEnlaceDentro` con el mismo selector del nav que usa
  `F-sidebar-escritorio`—; después `esperarTabQuieto(cdp, 'Turnos', { condicion: COND_FINANZAS })`,
  `irAlMesConTurnos(cdp, { vacios: ['Ventas', 'Egresos'] })`, `t1 = await tocarTabMedido(cdp, primero)` (desde Turnos,
  el tab alto) y `t2 = await tocarTabMedido(cdp, segundo)`. Devuelve un `detalle(p)` que imprime
  `${p}mes con turnos: <mes> turnos=<n> ventas=<n> egresos=<n> pasos=<k>` y los dos toques con `imprimirToque`; el
  `medido` en UNA línea, tal cual:
  `medido: { recorte_toque1: t1.recorte_por_alto, salto_toque1: t1.llevo_al_inicio, next_toque1: t1.escritura_de_next, recorte_toque2: t2.recorte_por_alto, salto_toque2: t2.llevo_al_inicio, next_toque2: t2.escritura_de_next },`
  y los dos esperados en UNA línea cada uno, tal cual:
  `esperado_si_HA: { recorte_toque1: 'si', salto_toque1: 'no', next_toque1: 'no', salto_toque2: 'no', next_toque2: 'no' },`
  `esperado_tras_el_fix: { recorte_toque1: 'no', salto_toque1: 'no', next_toque1: 'no', recorte_toque2: 'no', salto_toque2: 'no', next_toque2: 'no' },`
  Arriba de los esperados, comentarios que digan por qué el rojo NO afirma `recorte_toque2`: sin el arreglo el segundo
  toque sale de un tab ya corto con el scroll pegado al máximo, y su recorte depende del desborde horizontal del
  viewport emulado (881/899), no de obs-G1; con el arreglo los dos tienen que dar `no` (la geometría del plan).
- `RECORRIDOS.push(` con tres llamadas: `g1Recorrido({ id: 'G1-ventas-movil', entrada: 'mas', primero: 'Ventas', segundo: 'Egresos', titulo: … })`,
  `g1Recorrido({ id: 'G1-egresos-movil', entrada: 'tarjeta', primero: 'Egresos', segundo: 'Ventas', titulo: … })` y
  `g1Recorrido({ id: 'G1-ventas-escritorio', entrada: 'sidebar', primero: 'Ventas', segundo: 'Egresos', titulo: … })`,
  con títulos ASCII al estilo de los `F-*` (viewport, camino de entrada, mes con turnos, los dos toques).

**Paso 2 — el candado de fuente (rojo hasta el arreglo).** En `test/panel-tabs.test.ts`, dentro del describe de
Finanzas, inmediatamente después del `it('las dos líneas del botón de alta siguen leyendo txTab', …)`, un
`it('obs-G1: los tres paneles tienen el alto de la pantalla como mínimo (CSS, sin medir alturas)', …)` que afirme sobre
`crudo` (no sobre `fuente`: el descuento de comentarios de esta suite tiene el defecto declarado en `deferred-items.md`)
que para cada uno de `appointments`, `sales` y `expenses` hay un `<TabsContent value="<v>" className="…">` cuya lista de
clases incluye `min-h-dvh` como palabra entera, y que `read('components/ui/tabs.tsx')` no contiene `min-h-` (el
componente compartido queda intacto). Un comentario corto arriba con el porqué (obs-G1, decisión del dueño, el mínimo
va por pantalla y no en el componente).

**Paso 3 — commit ANTES de medir.** eslint de los dos archivos con rc 0; `git add` de los dos; commit
`test(quick-261118-jdq): obs-G1 — la sonda del scroll mide el recorte por alto de los tabs de Finanzas y el candado del alto minimo, antes del arreglo`
con el trailer. Correr el primer gate (estático: incluye la suite `panel-tabs` con exactamente 1 rojo, el obs-G1).

**Paso 4 — la corrida roja, una sola, por el turno, en segundo plano.** El segundo gate tal cual: sólo los tres `G1-*`,
modo `hipotesis`, etiqueta `rojo-obs-g1`. **Anotar la ruta del log** (la usa el task 3). Tres `COINCIDE-CON-LA-HIPOTESIS`
con `paneles con alto minimo: 0` es el rojo esperado; un `NO-COINCIDE` es P-2; una guarda que tira es P-1.
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && S=.planning/debug/probes/g04-scroll-y-recarga.mjs; T=test/panel-tabs.test.ts; TL=$(git log --reverse --format=%H --grep='^test(quick-261118-jdq)' HEAD); TLRC=$?; TC=$(printf '%s\n' "$TL" | grep -c .); test "$TLRC" = 0 && test "$TC" -ge 1 || { echo "commits test(quick-261118-jdq)=$TC (>=1) rc=$TLRC"; exit 1; }; B="$(printf '%s\n' "$TL" | head -1)^"; DS=$(git diff -U0 "$B" -- "$S"); DSRC=$?; DT=$(git diff -U0 "$B" -- "$T"); DTRC=$?; DS=$(printf '%s\n' "$DS" | tr -d '\r'); DT=$(printf '%s\n' "$DT" | tr -d '\r'); RS=$(printf '%s\n' "$DS" | grep -E '^-[^-]' | grep -c .); RT=$(printf '%s\n' "$DT" | grep -E '^-[^-]' | grep -c .); IDS=$(tr -d '\r' < "$S" | grep -cE "id: 'G1-(ventas-movil|egresos-movil|ventas-escritorio)'"); EHA=$(printf '%s\n' "$DS" | grep -E '^\+' | grep -cF "esperado_si_HA: { recorte_toque1: 'si', salto_toque1: 'no', next_toque1: 'no', salto_toque2: 'no', next_toque2: 'no' }"); ETF=$(printf '%s\n' "$DS" | grep -E '^\+' | grep -cF "esperado_tras_el_fix: { recorte_toque1: 'no', salto_toque1: 'no', next_toque1: 'no', recorte_toque2: 'no', salto_toque2: 'no', next_toque2: 'no' }"); HU=$(printf '%s\n' "$DS" | grep -E '^\+' | grep -cF 'paneles con alto minimo:'); MA=$(printf '%s\n' "$DS" | grep -E '^\+' | grep -cF 'Mes anterior'); OBS=$(printf '%s\n' "$DT" | grep -E '^\+' | grep -cF "it('obs-G1:"); git diff --quiet HEAD -- "$S" "$T"; LIMPIO=$?; APL=$(git diff --name-only "$B" -- app components lib scripts proxy.ts next.config.ts package.json package-lock.json supabase); APRC=$?; APP=$(printf '%s\n' "$APL" | grep -c .); HC=$(sha1sum next.config.ts | cut -d' ' -f1); ./node_modules/.bin/eslint "$S" "$T" > /dev/null 2>&1; EL=$?; AUTO=$(node "$S" --autotest 2>&1 | tr -d '\r' | tail -1); V=$(./node_modules/.bin/vitest run --project pure "$T" 2>&1 | tr -d '\r'); printf '%s\n' "$V" | tail -6; VF=$(printf '%s\n' "$V" | grep -oE 'Tests +[0-9]+ failed' | grep -oE '[0-9]+' | tail -1); VP=$(printf '%s\n' "$V" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); VO=$(printf '%s\n' "$V" | grep -E 'FAIL' | grep -c 'obs-G1'); echo "diff rc sonda=$DSRC test=$DTRC (0 0) · lineas quitadas sonda=$RS (0) test=$RT (0) · recorridos G1=$IDS (3) · esperado rojo=$EHA (1) verde=$ETF (1) · linea de huella=$HU (>=1) · boton Mes anterior=$MA (>=1) · it obs-G1=$OBS (1) · sin cambios sin commitear=$LIMPIO (0) · archivos de la app cambiados=$APP (0, rc $APRC) · next.config=$HC · eslint rc=$EL (0) · autotest=[$AUTO] (5/5) · panel-tabs rojos=$VF (1) verdes=$VP (>=84) el rojo es obs-G1=$VO (>=1)"; test "$DSRC" = 0 && test "$DTRC" = 0 && test "$RS" = 0 && test "$RT" = 0 && test "$IDS" = 3 && test "$EHA" = 1 && test "$ETF" = 1 && test "$HU" -ge 1 && test "$MA" -ge 1 && test "$OBS" = 1 && test "$LIMPIO" = 0 && test "$APRC" = 0 && test "$APP" = 0 && test "$HC" = 8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578 && test "$EL" = 0 && test "$AUTO" = "autotest del clasificador: 5/5" && test "$VF" = 1 && test -n "$VP" && test "$VP" -ge 84 && test "$VO" -ge 1</automated>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && LOGDIR=$(mktemp -d) || exit 1; LOG="$LOGDIR/rojo-obs-g1.txt"; node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs G1-ventas-movil,G1-egresos-movil,G1-ventas-escritorio rojo-obs-g1 hipotesis > "$LOG" 2>&1; RC=$?; W=$(tr -d '\r' < "$LOG"); printf '%s\n' "$W" | tail -70; PAN=$(printf '%s\n' "$W" | grep -cE '^finances-client\.tsx huella=[0-9a-f]{16} paneles con alto minimo: 0$'); CO=$(printf '%s\n' "$W" | grep -cE '^COINCIDE-CON-LA-HIPOTESIS G1-(ventas-movil|egresos-movil|ventas-escritorio) '); NC=$(printf '%s\n' "$W" | grep -cE '^NO-COINCIDE '); ER=$(printf '%s\n' "$W" | grep -cE '^ERROR-DEL-INSTRUMENTO|la sonda no pudo completar'); VE=$(printf '%s\n' "$W" | grep -cE '^etiqueta=rojo-obs-g1 · recorridos: 3 · coinciden con la hipotesis: 3$'); RP=$(printf '%s\n' "$W" | grep -c 'recorte_por_alto: si'); MES=$(printf '%s\n' "$W" | grep -c 'mes con turnos:'); echo "log=$LOG · rc=$RC (0) · medido sin el arreglo=$PAN (1) · coinciden con la hipotesis=$CO (3) · no coinciden=$NC (0: si no, P-2) · fallos del instrumento=$ER (0: si no, P-1) · veredicto 3/3=$VE (1) · recorte_por_alto si=$RP (>=3) · mes con turnos=$MES (3)"; test "$RC" = 0 && test "$PAN" = 1 && test "$CO" = 3 && test "$NC" = 0 && test "$ER" = 0 && test "$VE" = 1 && test "$RP" -ge 3 && test "$MES" = 3</automated>
    <fails_when>**El segundo gate se corre en segundo plano (`run_in_background`):** la espera del turno no tiene tope y un tope vencido corta la corrida a mitad y deja el turno tomado. El primero falla con: una línea quitada de la sonda o de la suite (se reescribió algo existente); no exactamente tres `G1-*`; un esperado distinto del textual del paso 1 (otro orden de claves, otro valor, partido en varias líneas); sin la línea de huella o sin el botón «Mes anterior» en lo agregado; sin el `it` obs-G1; cambios sin commitear; un archivo de la app cambiado o `next.config.ts` con otra huella; eslint en rojo; `--autotest` distinto de 5/5; o `panel-tabs` con un número de rojos distinto de 1 o con el rojo en otro caso. El segundo falla con: el log sin `paneles con alto minimo: 0` (no se midió el código de antes); menos de tres `COINCIDE-CON-LA-HIPOTESIS` (un `NO-COINCIDE` es P-2: PARAR sin arreglar; un `ERROR-DEL-INSTRUMENTO` es P-1); o un rc distinto de 0.</fails_when>
  </verify>
  <done>Los tres recorridos `G1-*` y el candado obs-G1 están commiteados en `test(quick-261118-jdq)` con sus esperados textuales; el candado es el único rojo de `panel-tabs`; la corrida roja por el turno dio 3/3 con la hipótesis, `recorte_por_alto: si` en el primer toque de los tres, sin salto ni escritura de Next, sobre `paneles con alto minimo: 0`; la ruta del log y la distribución de la base quedaron anotadas.</done>
</task>

<task type="auto">
  <name>Task 2: El arreglo (min-h-dvh en los tres TabsContent) y la corrida verde por el turno con la no-regresión</name>
  <reversibility rating="reversible">Tres clases y un comentario en un solo archivo de presentación; deshacerlo es un `git revert` del commit `fix`.</reversibility>
  <precondition>El task 1 terminó con sus dos gates verdes (rojo 3/3 con la hipótesis); ninguna regla de PARAR quedó activa.</precondition>
  <files>app/(dashboard)/finances/finances-client.tsx</files>
  <read_first>
    - `app/(dashboard)/finances/finances-client.tsx` L1090-1179: el `{/* Tabs */}`, la línea `<Tabs value={txTab} onValueChange={alElegirTab}>` (la afirma `panel-tabs` tal cual: no se toca) y los tres `TabsContent` (L1102, L1135, L1160).
    - `app/(dashboard)/layout.tsx` L80-86 y L125-135: por qué el panel usa `dvh` y no `vh` (la unidad que este arreglo repite).
    - `components/ui/tabs.tsx` L72-80: `TabsContent` ya trae `flex-1 text-sm outline-none`; el `className` del caller se suma con `cn`. SÓLO LECTURA.
  </read_first>
  <action>
**Paso 1 — el arreglo (opción A del dueño, 2026-11-18).** Con Edit, en `finances-client.tsx`, agregar `min-h-dvh` al
final del `className` de cada uno de los tres `TabsContent`, sin tocar nada más de esas líneas: quedan
`<TabsContent value="appointments" className="space-y-2 mt-4 min-h-dvh">`,
`<TabsContent value="sales" className="space-y-3 mt-4 min-h-dvh">` y
`<TabsContent value="expenses" className="space-y-3 mt-4 min-h-dvh">`. Entre la línea `{/* Tabs */}` y la del `<Tabs …>`
(ninguna de las dos cambia), un comentario JSX en español, denso y del porqué como el resto del archivo: obs-G1 de la
re-UAT del 04-08 (con un tab corto —Ventas con 0 ventas— el documento quedaba más corto que el scroll del momento y el
navegador lo recortaba: la página «se achica» y salta); el mínimo de cada panel es el alto de la pantalla con la misma
unidad que el `<main>` del layout, así el alto del documento es al menos el borde del panel más una pantalla y el
scroll máximo nunca queda por debajo del scroll con el que se tocó el tab (que tiene que estar a la vista); CSS puro,
sin medir alturas; va en cada panel y no en el componente compartido; costo aceptado por el dueño: un tab vacío deja
blanco debajo de su aviso. **Disciplina del comentario:** no nombrar ninguna de las tres llamadas de historia del
barrido crudo del criterio 5 (el `grep -E` del gate), no escribir adentro los pares de caracteres que abren o cierran un
comentario de bloque, y no citar ningún tag `<TabsContent` (el candado y los gates cuentan esas líneas).

**Paso 2 — commit.** `git add "app/(dashboard)/finances/finances-client.tsx"` y el commit
`fix(quick-261118-jdq): los tabs de Finanzas tienen el alto de la pantalla como minimo (obs-G1)` con el trailer.

**Paso 3 — el gate estático y las suites** (el primer gate, fuera del turno; incluye el build: P-7 si choca con un
`next dev` de este repo vivo).

**Paso 4 — la corrida verde, por el turno, en segundo plano.** El segundo gate tal cual: la sonda del scroll con los
cinco de G-04-6 más los tres `G1-*` en `tras-el-fix` (etiqueta `verde-obs-g1`), `--autotest`, y los cuatro
`R-T-finanzas-*` de la sonda de la app. **Anotar las dos rutas de log.** 8/8 con `paneles con alto minimo: 3` es el
verde; cualquier otra cosa es P-3 (o P-1 si tiró una guarda).
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && FIN="app/(dashboard)/finances/finances-client.tsx"; SET="app/(dashboard)/settings/settings-client.tsx"; AGE="app/(dashboard)/agenda/agenda-client.tsx"; S=.planning/debug/probes/g04-scroll-y-recarga.mjs; T=test/panel-tabs.test.ts; TL=$(git log --reverse --format=%H --grep='^test(quick-261118-jdq)' HEAD); TLRC=$?; FX=$(git log --format=%H --grep='^fix(quick-261118-jdq)' HEAD); FXRC=$?; FC=$(printf '%s\n' "$FX" | grep -c .); test "$TLRC" = 0 && test -n "$TL" && test "$FXRC" = 0 && test "$FC" = 1 || { echo "commits test=[$TL] fix=$FC (1)"; exit 1; }; B="$(printf '%s\n' "$TL" | head -1)^"; LT=$(printf '%s\n' "$TL" | tail -1); git merge-base --is-ancestor "$LT" "$FX"; ANC=$?; DF=$(git diff -U0 "$B" -- "$FIN"); DFRC=$?; DF=$(printf '%s\n' "$DF" | tr -d '\r'); REM=$(printf '%s\n' "$DF" | grep -E '^-[^-]' | grep -c .); REMOK=$(printf '%s\n' "$DF" | grep -E '^-[^-]' | sed 's/^-//' | grep -cxF -e '        <TabsContent value="appointments" className="space-y-2 mt-4">' -e '        <TabsContent value="sales" className="space-y-3 mt-4">' -e '        <TabsContent value="expenses" className="space-y-3 mt-4">'); W=$(tr -d '\r' < "$FIN"); NUE=$(printf '%s\n' "$W" | grep -cxF -e '        <TabsContent value="appointments" className="space-y-2 mt-4 min-h-dvh">' -e '        <TabsContent value="sales" className="space-y-3 mt-4 min-h-dvh">' -e '        <TabsContent value="expenses" className="space-y-3 mt-4 min-h-dvh">'); TCN=$(printf '%s\n' "$W" | grep -cF '<TabsContent value='); TABS=$(printf '%s\n' "$W" | grep -cxF '      <Tabs value={txTab} onValueChange={alElegirTab}>'); git diff --quiet HEAD -- "$FIN"; LIMPIO=$?; CR=$(grep -E 'pushState|replaceState|history\.back' "$FIN" "$SET" "$AGE"); CHL=$(git diff --name-only "$B" -- app components lib scripts proxy.ts next.config.ts package.json package-lock.json supabase); CHRC=$?; HC=$(sha1sum next.config.ts | cut -d' ' -f1); TSC=$(./node_modules/.bin/tsc --noEmit 2>&1 | grep -v '^\.next/' | grep -E 'error TS'); CNT='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c={};for(const m of JSON.parse(s)[0].messages)c[m.ruleId]=(c[m.ruleId]||0)+1;console.log(Object.keys(c).sort().map(k=>k+"="+c[k]).join(","))})'; ELF=$(./node_modules/.bin/eslint -f json "$FIN" 2>/dev/null | node -e "$CNT"); ./node_modules/.bin/eslint "$S" "$T" "app/(dashboard)/finances/page.tsx" > /dev/null 2>&1; EL=$?; PURA=$(./node_modules/.bin/vitest run --project pure 2>&1 | tr -d '\r'); PRC=$?; PAF=$(printf '%s\n' "$PURA" | grep -oE 'Test Files +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); PN=$(printf '%s\n' "$PURA" | grep -oE 'Tests +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); SUITES="test/panel-tabs.test.ts lib/panel-history.test.ts test/panel-history-clients.test.ts test/panel-history-sidebar.test.ts test/panel-branch.test.ts test/panel-nav-chrome.test.ts test/overlay-history.test.ts test/dirty-history.test.ts"; OUT=$(./node_modules/.bin/vitest run --project pure $SUITES 2>&1 | tr -d '\r'); RC8=$?; AF=$(printf '%s\n' "$OUT" | grep -oE 'Test Files +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); N8=$(printf '%s\n' "$OUT" | grep -oE 'Tests +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); PT=$(./node_modules/.bin/vitest run --project pure "$T" 2>&1 | tr -d '\r'); PTRC=$?; PTN=$(printf '%s\n' "$PT" | grep -oE 'Tests +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); BLD=$(npm run build 2>&1); BRC=$?; printf '%s\n' "$BLD" | tail -6; SUSP=$(printf '%s\n' "$BLD" | grep -ciE 'useSearchParams\(\) should be wrapped in a suspense|Missing Suspense boundary'); echo "test ancestro del fix=$ANC (0) · diff rc=$DFRC (0) · lineas quitadas=$REM (3) y son las tres TabsContent=$REMOK (3) · las tres nuevas=$NUE (3) · TabsContent en total=$TCN (3) · la linea del Tabs intacta=$TABS (1) · sin commitear=$LIMPIO (0) · criterio 5 crudo=[$CR] (vacio) · archivos cambiados desde la base=[$CHL] (solo $FIN; rc $CHRC) · next.config=$HC · errores TS=[$TSC] (vacio) · eslint finanzas=[$ELF] (react-hooks/set-state-in-effect=1) resto=$EL (0) · pura rc=$PRC (0) archivos=$PAF (>=77) casos=$PN (>=1845) · 8 suites rc=$RC8 (0) archivos=$AF (8) casos=$N8 (>=671) · panel-tabs rc=$PTRC (0) casos=$PTN (>=85) · build rc=$BRC (0) sin Suspense=$SUSP (0)"; test "$ANC" = 0 && test "$DFRC" = 0 && test "$REM" = 3 && test "$REMOK" = 3 && test "$NUE" = 3 && test "$TCN" = 3 && test "$TABS" = 1 && test "$LIMPIO" = 0 && test -z "$CR" && test "$CHRC" = 0 && test "$CHL" = "$FIN" && test "$HC" = 8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578 && test -z "$TSC" && test "$ELF" = "react-hooks/set-state-in-effect=1" && test "$EL" = 0 && test "$PRC" = 0 && test -n "$PAF" && test "$PAF" -ge 77 && test -n "$PN" && test "$PN" -ge 1845 && test "$RC8" = 0 && test "$AF" = 8 && test -n "$N8" && test "$N8" -ge 671 && test "$PTRC" = 0 && test -n "$PTN" && test "$PTN" -ge 85 && test "$BRC" = 0 && test "$SUSP" = 0</automated>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && LOGDIR=$(mktemp -d) || exit 1; LS="$LOGDIR/verde-obs-g1.txt"; LA="$LOGDIR/app-finanzas-obs-g1.txt"; IDS=F-blanda-mas-movil,F-directa-movil,F-tarjeta-movil,F-sidebar-escritorio,N-negocio-borde-movil,G1-ventas-movil,G1-egresos-movil,G1-ventas-escritorio; node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs "$IDS" verde-obs-g1 tras-el-fix > "$LS" 2>&1; RS=$?; node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz R-T-finanzas-por-mas,R-T-finanzas-desde-inicio,R-T-finanzas-invalido,R-T-finanzas-url-pegada > "$LA" 2>&1; RA=$?; WS=$(tr -d '\r' < "$LS"); WA=$(tr -d '\r' < "$LA"); printf '%s\n' "$WS" | grep -E '^(OK  |FALLA |ERROR-DEL-INSTRUMENTO)|NO COINCIDE|paneles con alto minimo|^etiqueta='; printf '%s\n' "$WA" | grep -E '^(OK  |FALLA )|recorridos medidos'; blq() { printf '%s\n' "$WS" | awk -v id="$1" 'd{next} f && !/^ /{d=1; next} $0 ~ ("^(OK |FALLA) " id " "){f=1} f'; }; PAN=$(printf '%s\n' "$WS" | grep -cE '^finances-client\.tsx huella=[0-9a-f]{16} paneles con alto minimo: 3$'); OKS=$(printf '%s\n' "$WS" | grep -cE '^OK  (F-blanda-mas-movil|F-directa-movil|F-tarjeta-movil|F-sidebar-escritorio|N-negocio-borde-movil|G1-ventas-movil|G1-egresos-movil|G1-ventas-escritorio) '); VS=$(printf '%s\n' "$WS" | grep -cE '^etiqueta=verde-obs-g1 · modo=tras-el-fix · recorridos: 8 · coinciden con lo esperado tras el fix: 8$'); RPG=$(for i in G1-ventas-movil G1-egresos-movil G1-ventas-escritorio; do blq "$i"; done | grep -c 'recorte_por_alto: si'); MES=$(printf '%s\n' "$WS" | grep -c 'mes con turnos:'); ER=$(printf '%s\n' "$WS" | grep -cE '^ERROR-DEL-INSTRUMENTO|la sonda no pudo completar'); AUTO=$(node .planning/debug/probes/g04-scroll-y-recarga.mjs --autotest 2>&1 | tr -d '\r' | tail -1); MED=$(printf '%s\n' "$WA" | grep -oE 'recorridos medidos: [0-9]+' | grep -oE '[0-9]+'); COI=$(printf '%s\n' "$WA" | grep -oE 'coinciden con lo esperado: [0-9]+' | grep -oE '[0-9]+'); NTF=$(printf '%s\n' "$WA" | grep -cE '^OK  R-T-finanzas-'); FA=$(printf '%s\n' "$WA" | grep -cE '^FALLA '); echo "logs: scroll=$LS app=$LA · scroll rc=$RS (0) medido con el arreglo=$PAN (1) OK=$OKS (8) veredicto 8/8=$VS (1) recorte_por_alto si en los G1=$RPG (0) mes con turnos=$MES (3) fallos del instrumento=$ER (0) · autotest=[$AUTO] (5/5) · app rc=$RA (0) medidos=$MED (4) coinciden=$COI (4) R-T-finanzas en OK=$NTF (4) FALLA=$FA (0)"; test "$RS" = 0 && test "$PAN" = 1 && test "$OKS" = 8 && test "$VS" = 1 && test "$RPG" = 0 && test "$MES" = 3 && test "$ER" = 0 && test "$AUTO" = "autotest del clasificador: 5/5" && test "$RA" = 0 && test "$MED" = 4 && test "$COI" = 4 && test "$NTF" = 4 && test "$FA" = 0</automated>
    <fails_when>**El segundo gate se corre en segundo plano (`run_in_background`)**, por la misma razón que en el task 1. El primero falla con: el `fix` sin un `test` antes; otra línea quitada que no sea una de las tres `TabsContent`; las tres nuevas distintas de las textuales; la línea del `<Tabs …>` tocada; cambios sin commitear; una de las tres llamadas de historia en Finanzas, Configuración o Agenda (el comentario las nombró); otro archivo de la app cambiado (incluidos `components/ui/tabs.tsx` y `finances/page.tsx`); `next.config.ts` con otra huella; un `error TS`; la deuda de eslint de Finanzas distinta de la medida; la pura, las 8 suites o `panel-tabs` por debajo de su piso o en rojo (el candado obs-G1 tiene que estar verde); o el build en rojo / con el aviso de Suspense (P-7 si choca con un `next dev` vivo). El segundo falla con: el log sin `paneles con alto minimo: 3`; menos de 8 `OK` (un `G1-*` en `FALLA` es P-3; uno de G-04-6 en `FALLA` es una regresión de G-04-6: P-3); un `recorte_por_alto: si` dentro de un bloque `G1-*`; `--autotest` distinto de 5/5; o algún `R-T-finanzas-*` sin `OK`.</fails_when>
  </verify>
  <done>Los tres `TabsContent` de Finanzas llevan `min-h-dvh` en un commit `fix` posterior al `test`, con el comentario del porqué, y es el único archivo de la app cambiado; `tsc`, eslint, la pura, las 8 suites, `panel-tabs` (con el candado obs-G1 verde) y el build en verde; la sonda del scroll dio 8/8 en `tras-el-fix` sobre `paneles con alto minimo: 3` —los tres `G1-*` sin recorte, sin salto y sin escritura de Next en 390x844 y 1280x800, y los cinco de G-04-6 en OK—, `--autotest` 5/5 y los cuatro `R-T-finanzas-*` en OK; las dos rutas de log quedaron anotadas.</done>
</task>

<task type="auto">
  <name>Task 3: El registro — (k) con el rojo y el verde pegados, obs-G1 resuelto en deferred-items, y el SUMMARY</name>
  <reversibility rating="reversible">Dos documentos: una sección agregada al final de uno y una línea de estado reemplazada en el otro; deshacerlo es un `git revert` del commit `docs`.</reversibility>
  <precondition>Los tasks 1 y 2 terminaron con sus cuatro gates verdes y los tres logs (rojo, verde del scroll, app) existen en las rutas anotadas.</precondition>
  <files>.planning/debug/tabs-en-la-url-medida.md, .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md</files>
  <read_first>
    - `.planning/debug/tabs-en-la-url-medida.md` L1328-1417: `## (j)` (el formato a imitar: «Qué se preguntó», «El entorno», las corridas con su comando, la tabla por recorrido, «Lo demás», la línea final) y L1194-1223 (cómo se pegó un veredicto y la línea `cierre (h): …`).
    - `.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md` L94-104: la entrada obs-G1 (su `status: open` es la ÚNICA línea que cambia).
    - Los tres logs de los tasks 1 y 2 (las rutas anotadas).
  </read_first>
  <action>
**Paso 1 — `## (k)` al final de `.planning/debug/tabs-en-la-url-medida.md`** (sólo se agrega: ninguna línea vieja cambia),
titulada `## (k) obs-G1: el alto mínimo de los tabs de Finanzas (quick 261118-jdq)`, con el formato de `(j)`:
- **Qué se preguntó:** si darle a cada panel de los tabs de Finanzas el alto de la pantalla como mínimo (opción A del
  dueño, 2026-11-18) apaga el recorte del navegador al cambiar a un tab corto, sin regresar G-04-6. La geometría del
  plan en dos líneas (alto del documento >= borde del panel + 100dvh + lo de abajo ⇒ scroll máximo >= borde del panel
  > scroll del toque) y por qué `dvh`.
- **El entorno:** fecha y horas, la pila local (sin `db reset`, sin escrituras), la distribución de turnos por mes de
  `negocio-prueba` del paso 0 y el mes que eligió `irAlMesConTurnos` (la línea `mes con turnos:` de cada recorrido),
  servidor propio o existente, turno (espera o no), `Chrome/…` y node, como los imprimió la sonda.
- **El rojo** (con el `test`, sin el arreglo; `paneles con alto minimo: 0`): el comando y, pegados TAL CUAL del log, los
  tres bloques `COINCIDE-CON-LA-HIPOTESIS G1-*` (cada uno con sus claves y sus dos toques) y la línea
  `etiqueta=rojo-obs-g1 · recorridos: 3 · coinciden con la hipotesis: 3`.
- **El verde** (con el `fix`; `paneles con alto minimo: 3`): el comando, una tabla por recorrido (los ocho: `y_antes →
  y_despues`, `alto` antes/después, `recorte_por_alto` del primer toque, escrituras de Next) y, pegados tal cual, los
  tres bloques `OK  G1-*` y la línea `etiqueta=verde-obs-g1 · modo=tras-el-fix · recorridos: 8 · coinciden con lo esperado tras el fix: 8`.
- **Lo demás:** `--autotest` 5/5, los cuatro `R-T-finanzas-*` en OK, `tsc`, eslint (la deuda medida), la pura, las 8
  suites, `panel-tabs` (el candado obs-G1 rojo → verde), el build, con sus números del gate.
- **Lo que NO cierra / los residuos:** el teléfono real (la UAT del dueño va con R2-WR-01, después del push conjunto);
  Negocio → Cobros sigue con su `recorte_por_alto` informativo (el dueño acotó a Finanzas); el desborde horizontal de
  Finanzas a 390 px sigue abierto; el costo aceptado (blanco debajo del aviso de un tab vacío).
- La última línea, sola y en ASCII: `cierre (k): el tab corto de finanzas ya no achica la pagina · rojo 3/3 · verde 8/8`.

**Paso 2 — `deferred-items.md`:** en la entrada «obs-G1», reemplazar SU `status: open` (y ningún otro) por
`status: resolved (quick 261118-jdq, <sha corto del fix>; medido en .planning/debug/tabs-en-la-url-medida.md ## (k))`
con la misma sangría, y agregar al final de esa entrada una línea `**Cierre:** …` con el número (rojo 3/3 → verde 8/8,
sin regresar G-04-6). Nada más del archivo cambia.

**Paso 3 — commit.** `git add` de los dos archivos y el commit
`docs(quick-261118-jdq): obs-G1 medido y cerrado — rojo 3/3 y verde 8/8 en (k), deferred-items resuelto` con el
trailer.

**Paso 4 — el SUMMARY** (`261118-jdq-SUMMARY.md` en el directorio del quick, con la plantilla): `requirements-completed: []`;
los tres commits; la distribución de la base y el mes elegido; el rojo y el verde con sus números; la unidad y por qué;
los residuos del paso 1; y que **no se pusheó** (sale con R2-WR-01) y que la UAT en el teléfono queda para ese push.
Lo commitea el orquestador del quick junto con su contabilidad. **Recién con el SUMMARY escrito, correr el gate** (lo
verifica).
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && D=.planning/debug/tabs-en-la-url-medida.md; DI=.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md; SUM=.planning/workstreams/panel-nav/quick/261118-jdq-obs-g1-alto-minimo-de-los-tabs-de-finanz/261118-jdq-SUMMARY.md; TL=$(git log --reverse --format=%H --grep='^test(quick-261118-jdq)' HEAD); TLRC=$?; test "$TLRC" = 0 && test -n "$TL" || { echo "sin commit test(quick-261118-jdq)"; exit 1; }; B="$(printf '%s\n' "$TL" | head -1)^"; FX=$(git log --format=%H --grep='^fix(quick-261118-jdq)' HEAD); DC=$(git log --format=%H --grep='^docs(quick-261118-jdq)' HEAD); DCRC=$?; DCN=$(printf '%s\n' "$DC" | grep -c .); DD=$(git diff -U0 "$B" -- "$D"); DDRC=$?; REMD=$(printf '%s\n' "$DD" | tr -d '\r' | grep -E '^-[^-]' | grep -c .); WD=$(tr -d '\r' < "$D"); K=$(printf '%s\n' "$WD" | grep -cE '^## \(k\) '); RV=$(printf '%s\n' "$WD" | grep -cF 'etiqueta=rojo-obs-g1 · recorridos: 3 · coinciden con la hipotesis: 3'); GV=$(printf '%s\n' "$WD" | grep -cF 'etiqueta=verde-obs-g1 · modo=tras-el-fix · recorridos: 8 · coinciden con lo esperado tras el fix: 8'); CI=$(printf '%s\n' "$WD" | grep -cxF 'cierre (k): el tab corto de finanzas ya no achica la pagina · rojo 3/3 · verde 8/8'); ULT=$(printf '%s\n' "$WD" | grep -v '^$' | tail -1); DDI=$(git diff -U0 "$B" -- "$DI"); DDIRC=$?; REMDI=$(printf '%s\n' "$DDI" | tr -d '\r' | grep -E '^-[^-]' | sed 's/^-//'); WDI=$(tr -d '\r' < "$DI"); OPEN=$(printf '%s\n' "$WDI" | grep -c 'status: open'); G1S=$(printf '%s\n' "$WDI" | awk '/^- obs-G1:/{f=1; next} f && /^  status:/{print; exit}'); case "$G1S" in "  status: resolved (quick 261118-jdq, "*) G1OK=1;; *) G1OK=0;; esac; git diff --quiet HEAD -- "$D" "$DI"; LIMPIO=$?; test -f "$SUM"; SUMOK=$?; RQ=$(grep -c 'requirements-completed: \[\]' "$SUM" 2>/dev/null); REMOTO=$(git branch -r --contains "$FX" 2>&1); RRC=$?; echo "commit docs=$DCN (1, rc $DCRC) · lineas quitadas de la medida=$REMD (0, rc $DDRC) · seccion (k)=$K (1) · veredicto rojo=$RV (>=1) verde=$GV (>=1) · cierre (k)=$CI (1) ultima linea=[$ULT] · deferred quitado=[$REMDI] (  status: open; rc $DDIRC) · status open restantes=$OPEN (11) · obs-G1=[$G1S] resuelto=$G1OK (1) · sin commitear=$LIMPIO (0) · SUMMARY=$SUMOK (0) requirements-completed vacio=$RQ (>=1) · fix en el remoto=[$REMOTO] (vacio: no se pusheo; rc $RRC)"; test "$DCRC" = 0 && test "$DCN" = 1 && test "$DDRC" = 0 && test "$REMD" = 0 && test "$K" = 1 && test "$RV" -ge 1 && test "$GV" -ge 1 && test "$CI" = 1 && test "$ULT" = 'cierre (k): el tab corto de finanzas ya no achica la pagina · rojo 3/3 · verde 8/8' && test "$DDIRC" = 0 && test "$REMDI" = '  status: open' && test "$OPEN" = 11 && test "$G1OK" = 1 && test "$LIMPIO" = 0 && test "$SUMOK" = 0 && test -n "$RQ" && test "$RQ" -ge 1 && test "$RRC" = 0 && test -z "$REMOTO"</automated>
    <fails_when>Una línea vieja de la medida cambiada (sólo se agrega); sin `## (k)`, sin los dos veredictos pegados o sin la línea `cierre (k)` exacta como última; en `deferred-items.md` otra línea quitada que no sea el `status: open` de obs-G1, otra cantidad de entradas abiertas que 11, o el estado de obs-G1 sin el prefijo `status: resolved (quick 261118-jdq, `; cambios sin commitear; sin SUMMARY o con `requirements-completed` no vacío; o el commit `fix` ya en una rama remota (se pusheó).</fails_when>
  </verify>
  <done>`(k)` documenta el rojo 3/3 y el verde 8/8 con los bloques pegados tal cual, la geometría, el entorno, los residuos y la línea `cierre (k)`; obs-G1 está `resolved` en `deferred-items.md` con el sha del fix; el SUMMARY existe; nada se pusheó.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dueño (sesión) → página de Finanzas | Sin cambio: el arreglo es una clase de presentación en un componente client; ninguna query, policy, route handler ni dato nuevo. El aislamiento por `business_id` no se toca. |
| sonda → base local | La sonda y el paso 0 sólo LEEN (`select`); el mes se elige con el botón real de la UI. |
| registro de la medición | Los esperados tienen que quedar fijados antes de la corrida que los juzga. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-jdq-01 | Tampering | esperados de `G1-*` en `g04-scroll-y-recarga.mjs` | medium | mitigate | commit `test(quick-261118-jdq)` antes de la corrida roja; el gate del task 1 exige los dos esperados textuales y 0 líneas quitadas; el del task 2 exige el `test` ancestro del `fix`; P-2/P-3 prohíben tocar un esperado después de medir |
| T-jdq-02 | Tampering | datos de `negocio-prueba` en la base local | low | mitigate | sólo `select` en el paso 0; `irAlMesConTurnos` navega con la UI; P-0 para (no inserta) si no hay un mes con turnos |
| T-jdq-03 | Information Disclosure | `finances-client.tsx` | low | accept | cambio de CSS puro: no agrega lecturas ni expone datos; el gate del task 2 limita los archivos cambiados de la app a ese solo archivo |
| T-jdq-04 | Denial of Service (UX) | tab vacío de Finanzas | low | accept | blanco de hasta una pantalla debajo del aviso: costo aceptado por el dueño (2026-11-18) |
| T-jdq-05 | Denial of Service | turno de pantalla / `next dev` ajenos | low | mitigate | toda corrida con navegador por `scripts/con-turno.mjs`, en segundo plano, sin Ctrl+C; la sonda mide contra un `next dev` existente sin matarlo; el de forjo-landing (3000) no se toca |
</threat_model>

<verification>
- Rojo antes del arreglo, medido: `node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs G1-ventas-movil,G1-egresos-movil,G1-ventas-escritorio rojo-obs-g1 hipotesis` → 3/3 con la hipótesis, `recorte_por_alto: si` en el primer toque, `paneles con alto minimo: 0`.
- Verde con el arreglo, la misma sonda + G-04-6: los ocho ids en `tras-el-fix` → 8/8, `paneles con alto minimo: 3`, ningún `recorte_por_alto: si` en los `G1-*`; `--autotest` 5/5; los cuatro `R-T-finanzas-*` en OK.
- `./node_modules/.bin/tsc --noEmit` sin `error TS`; eslint por archivo con la deuda medida; `./node_modules/.bin/vitest run --project pure` >= 77 / >= 1845; 8 suites >= 671; `panel-tabs` >= 85; `npm run build` en verde.
- Sólo `app/(dashboard)/finances/finances-client.tsx` cambia en la app; intocables y `next.config.ts` (sha1 `8ceb99ae…`) idénticos; nada pusheado.
</verification>

<success_criteria>
- obs-G1 reproducido con el código de hoy (3/3) y cerrado con el CSS (8/8) en 390x844 y 1280x800, con los esperados fijados antes de medir.
- G-04-6 sin regresión: los cinco recorridos del 04-06 siguen en OK con cero escrituras de scroll de Next en el primer toque.
- El arreglo es exactamente `min-h-dvh` en los tres `TabsContent` de Finanzas, sin JavaScript, sin tocar `components/ui/tabs.tsx` ni otra pantalla.
- `(k)`, `deferred-items.md` y el SUMMARY dicen lo medido; nada se pusheó.
</success_criteria>

<output>
Crear `.planning/workstreams/panel-nav/quick/261118-jdq-obs-g1-alto-minimo-de-los-tabs-de-finanz/261118-jdq-SUMMARY.md` al terminar.
Con P-0/P-1/P-2/P-3 el SUMMARY dice dónde se paró, pega lo medido y deja la pregunta para el dueño, con opciones (p. ej. con P-2: el caso no se reproduce en local y el arreglo no se aplicó; con P-3: qué toque quedó con recorte y con qué números).
</output>
</content>
</invoke>
