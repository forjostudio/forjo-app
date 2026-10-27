---
phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos"
plan: "10"
subsystem: documentation
tags: [uat, mobile-nav, back-button, g2-1, requirements, windows-ledger, blocking-human]

# Dependency graph
requires:
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-08 / la UAT ronda 2)"
    provides: "el estado real de la ronda 2 —cuatro recorridos corridos (7, 8 y 15 pasan · 19 falla ⇒ `G2-1`) y seis sin correr— y el guion de la ronda 2 con sus diez ítems y su convención de marcado"
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-09)"
    provides: "la regla de `G2-1` (sección → raíz es un retroceso), el residuo de escritorio medido con su alcance de un solo caso, y los tres escenarios de sonda E-14/E-15/E-16 — el MOTIVO MEDIDO de cada ítem que vuelve en la ronda 3 sale de ahí"
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (decisión del dueño, 2026-10-27)"
    provides: "`03-DECISION-UAT-2.md` — gobierna el resultado esperado de `Más → Inicio → atrás`: AVISAR PARA SALIR, con el costo declarado de retirar lo que MOB-04 prometía para ese recorrido"
provides:
  - "el criterio 6 del ROADMAP con su REVISIÓN ACOTADA fechada 2026-10-27, el residuo de un solo caso y la puerta cerrada al chequeo de ancho de pantalla; el criterio 2 intacto"
  - "MOB-04 con la regla nueva y su LÍMITE DECLARADO: la pila de tres escalones de D-02 sigue empujando, así que lo que la fase promete es que el ciclo no crece sin techo, no que la pila nunca pase de dos"
  - "MOB-05 con la consecuencia declarada (`Más → tocar Inicio → atrás` ya no vuelve a Más: avisa para salir) ANTES de que el dueño la encuentre en el teléfono, con prohibición explícita de leerla como regresión"
  - "los tres requisitos SIN marcar con el motivo de cada uno escrito, y la tabla de trazabilidad diciendo lo mismo que las casillas"
  - "el registro de imprecisiones al día POR EL CLI: la entrada 16 (residuo aceptado, hermana de la 15) y la 17 (la ronda 3, que reemplaza como lista única a la 14 sin marcarla arreglada)"
  - "el guion de la ronda 2 CERRADO con sus diez resultados (cuatro medidos, seis *sin correr* con el motivo), sin perder una línea de lo que ya tenía"
  - "`03-UAT-GUION-3.md`: ocho recorridos en Android y los 21 en iPhone, con el motivo medido por ítem, el hash de la URL abriendo cada ciclo y el residuo de escritorio como ítem a VER"
affects:
  - "el cierre de la Phase 3: queda condicionado a que la ronda 3 pase en los DOS motores. MOB-04 y MOB-05 necesitan Android e iPhone; MOB-06 le debe sólo iPhone"
  - "Phase 4 (MOB-08/09, los tabs profundos): heredan la política con su límite ya declarado por escrito"

actuals:
  tokens: 13252
  tasks: 2
  commits: 2
plan_head_before: 3c222752bf1403753f12f33f459fe70b9492e559

tech-stack:
  added: []
  patterns:
    - "El resultado de una ronda interrumpida se ESCRIBE EN SU PROPIO GUION, ítem por ítem, con una etiqueta ASCII greppable al lado del símbolo de la convención: los símbolos son de dos bytes y los contadores de este entorno sobre ellos miden cero, así que la etiqueta de texto va ADEMÁS y no en lugar del símbolo"
    - "El motivo de *sin correr* se escribe IGUAL en los seis ítems (la regla nueva cambia la pila ⇒ correrlos antes habría medido el comportamiento viejo) y cada uno dice A DÓNDE vuelve: un guion sin resultados no se puede auditar después, y seis motivos distintos para la misma causa se leen como seis causas"
    - "La consecuencia buscada se DECLARA antes de la UAT, con fecha y con prohibición explícita de tratarla como regresión: un recorrido que el dueño ya probó con la expectativa opuesta se reporta como bug y traba la ronda en una discusión en vez de en un defecto"
    - "El límite de una regla se escribe al lado de su invariante, no en una nota al pie: la regla acota el crecimiento pero NO lo elimina en todos los caminos, y lo honesto es prometer *el ciclo no crece sin techo* en vez de *la pila nunca pasa de dos*"
    - "Un documento que lleva una tabla Y un bloque JSON con las mismas entradas se toca SÓLO por su CLI, y el gate compara las dos mitades: escribirlo a mano las desincroniza sin que nada se ponga rojo, y después el ship lee una y la persona lee la otra"
    - "Las ediciones del ROADMAP y de los requisitos van por REEMPLAZO ACOTADO con candados de no-destrucción en el gate (las tres fases y el criterio 2 contados): un volcado completo destruye todo lo que queda fuera de la ventana del cambio"

key-files:
  created:
    - ".planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-GUION-3.md"
    - ".planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-10-SUMMARY.md"
  modified:
    - ".planning/workstreams/panel-nav/ROADMAP.md"
    - ".planning/workstreams/panel-nav/REQUIREMENTS.md"
    - ".planning/WINDOWS.md"
    - ".planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-GUION-2.md"

key-decisions:
  - "El criterio 6 se REVISA de forma acotada en vez de declararse cumplido o renunciado: el mecanismo sigue sin consultar el ancho de la pantalla (cero consultas medidas en los cuatro archivos), pero lo que lo sostiene dejó de ser el hecho de la pila y pasó a ser el cableado (la barra oculta a ≥1024px y el guard que sólo computa con la pantalla sucia) ⇒ un residuo de UN SOLO CASO, declarado en vez de descubierto"
  - "MOB-04 se PRECISA, no se contradice: sección → raíz es un retroceso y el ciclo deja de crecer, pero en la pila de tres escalones que D-02 acepta la regla NO se dispara y el gesto sigue apilando. El límite queda escrito al lado del invariante, porque es lo que el dueño va a ver en el teléfono"
  - "La consecuencia de la regla sobre `Más → tocar Inicio → atrás` se declara debajo de MOB-05 con fecha y con las dos frases que evitan leerla como regresión (la `decision (a)` no cambió; el gesto de atrás desde Más sigue cayendo en Inicio): lo que cambió es la PILA que la regla lee"
  - "Los tres requisitos siguen SIN marcar. Se marcan con el teléfono, no con el código escrito ni con la suite verde ni con la sonda en 16/16 — y la condición de cierre de cada uno es distinta: MOB-04 y MOB-05 necesitan Android e iPhone, MOB-06 le debe sólo iPhone más la parte de overlay"
  - "La ronda 3 se ACOTA a ocho recorridos en Android (el gap, los tres que la regla cambió, el 20 con su mitad de overlay y el residuo de escritorio) con el motivo medido por ítem, y declara los que NO vuelven con el suyo: pedirle veintiún recorridos al dueño es cómo una UAT deja de correrse, y la UAT es la única cobertura real de esta fase"
  - "El registro de imprecisiones se tocó SÓLO por el CLI y la entrada 14 NO se marcó arreglada: la UAT no pasó, quedó interrumpida. La 17 la reemplaza como lista única, y la 15 no se tocó"
  - "NO se corrió `requirements.mark-complete` con los IDs del frontmatter del plan (MOB-04/05/06), contra el flujo genérico del ejecutor: el plan lo prohíbe explícitamente y la evidencia que los marca es el teléfono"

patterns-established:
  - "Gate de no-destrucción sobre un documento largo editado por reemplazo acotado: además de contar lo que se agregó, contar lo que NO se tocó (las tres fases del ROADMAP, la nota del criterio 2, los trece encabezados del guion) — el modo de falla medido en este repo es un volcado completo que borra lo que queda fuera de la ventana"
  - "Verificación del código de salida REAL de un comando que pasa por el turno de pantalla: capturar la salida a un archivo y leer `$?` de la sonda, nunca cerrar la tubería en `tail -N` — un gate que termina en un pipe mide el `tail` y NUNCA falla (la trampa se reprodujo en este mismo plan y obligó a re-correr la sonda)"

requirements-completed: []

coverage:
  - id: D1
    description: "El criterio 6 del ROADMAP tiene su revisión ACOTADA fechada 2026-10-27 con el residuo de un solo caso (salir con cambios sin guardar hacia Inicio desde el sidebar) y la puerta cerrada al chequeo de ancho; el criterio 2 quedó intacto y las tres fases del ROADMAP siguen en pie"
    verification:
      - kind: command
        ref: "gate de región del criterio 6: lineas=32 (>=12) · revision fechada=1 · el residuo nombrado=3 (>=2) · el criterio 2 intacto=1 · fases del roadmap=3"
        status: pass
    human_judgment: false
  - id: D2
    description: "MOB-04 con la regla nueva y su límite declarado, MOB-05 con la consecuencia declarada y su prohibición de leerla como regresión, los tres requisitos SIN marcar con su motivo, la trazabilidad al día y las dos etiquetas ASCII intactas"
    verification:
      - kind: command
        ref: "gate de REQUIREMENTS: notas fechadas hoy=9 (>=3) · gap citado=7 · etiqueta de la decision=4 (>=3) · cero regresion=4 · MOB-04/05/06 sin marcar=3 · escenario E-14 citado=1"
        status: pass
    human_judgment: false
  - id: D3
    description: "El registro de imprecisiones con sus dos entradas nuevas por el CLI (16 el residuo aceptado, 17 la ronda 3 que reemplaza como lista única a la 14), con la tabla y el bloque JSON coincidiendo y la entrada 15 sin tocar"
    verification:
      - kind: command
        ref: "gate del registro: abiertas=15 (>=15) · totales=17 (>=17) · ronda 3 declarada=2 · residuo declarado=8 (>=3) · entrada 14 nombrada=4 · tabla y JSON=coinciden"
        status: pass
    human_judgment: false
  - id: D4
    description: "El guion de la ronda 2 cerrado con sus diez resultados —cuatro medidos (7, 8 y 15 pasan; 19 falla, textual, con el puntero a G2-1) y seis *sin correr* con el mismo motivo escrito igual— sin perder una línea de lo que ya tenía"
    verification:
      - kind: command
        ref: "gate del guion 2: items=13 (intacto) · resultados anotados=10 · pasa=3 · falla=1 · sin correr=6 · gap citado=2 · apunta a la ronda 3=15; y `git diff --numstat` = 52 inserciones / 0 borrados"
        status: pass
    human_judgment: false
  - id: D5
    description: "`03-UAT-GUION-3.md` con sus ocho bloques, acotado a ocho recorridos en Android y los 21 en iPhone, con el motivo medido de cada ítem que vuelve y de cada uno que no, el hash de la URL abriendo cada ciclo, el residuo de escritorio como ítem a VER y los tres supuestos (A1, A2, A11) con su línea"
    verification:
      - kind: command
        ref: "gate del guion 3: lineas=264 (>=120) · bloques 0 a 7=8 · hash=9 · gap citado=6 · motivos=13 · E-14/15/16=6 · supuestos=6 · iPhone/Safari=17 · residuo/sidebar=5 · la expectativa que cambia declarada=1"
        status: pass
    human_judgment: false
  - id: D6
    description: "Cero regresión de los gates de la fase con los documentos nuevos: el carril puro, los tipos y la sonda de dieciséis escenarios"
    verification:
      - kind: command
        ref: "npx vitest run --project pure ⇒ rc 0 · 76 archivos · 1628 pasados + 3 expected-fail (1631); ./node_modules/.bin/tsc --noEmit ⇒ 0 errores"
        status: pass
      - kind: command
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs ⇒ rc 0 · escenarios medidos 16 · coinciden 16 · no coinciden 0"
        status: pass
    human_judgment: false
  - id: D7
    description: "La ronda 3 de la UAT corrida en los dos motores reales: ocho recorridos en Android Chrome y los 21 en iPhone Safari, con cada ítem anotado pasa / falla (textual) / no corrible (con el motivo)"
    human_judgment: true
    rationale: "PENDIENTE DE LA PERSONA — es el checkpoint de bloqueo humano de este plan y NO se auto-aprobó. Ninguna otra cosa lo cierra: cierra A1 (el orden del efecto que escribe la marca contra la escritura del router), A2 (que no haya otro commit del router en vuelo) y A11 (los dos motores reales). El modo de falla de esta fase es silencioso —la URL cambia y la vista no, o el atrás no hace nada, o saca del sitio— y no lo ve tsc, ni la suite, ni el build, ni la sonda. Registrado como entrada 17 (abierta) en `.planning/WINDOWS.md`"

duration: "35 min"
completed: 2026-10-27
status: complete
---

# Phase 03 Plan 10: Los documentos consistentes con la regla nueva, y la ronda 3 pedida Summary

Los cuatro documentos quedaron diciendo lo que la regla de `G2-1` realmente hizo —incluido su límite y la consecuencia que el dueño va a ver en el teléfono— y la ronda 3 quedó escrita en ocho recorridos con el motivo medido de cada uno, esperando a la persona.

**Duración:** 35 min · **Tasks:** 2/2 · **Archivos:** 6 · **Commits:** 2 (+1 de cierre)

## Qué se hizo

### Task 1 — los cuatro documentos (`66445e2`)

**El ROADMAP, criterio 6.** Una nota fechada **2026-10-27** con el formato de la del criterio 2 y las cuatro cosas que tenía que decir, ninguna más: **qué se mantiene** (cero consultas del ancho de la pantalla en los cuatro archivos de la política y sus consumidores; la política se sigue expresando sobre rutas y sobre la marca), **qué dejó de ser verdad** (que escritorio no se entere *por construcción* **a través del hecho de la pila**: el hecho nuevo pregunta si la marca dice **la raíz**, y en escritorio la marca sí puede decirlo), **de qué sale ahora la protección** (la barra oculta a ≥1024px ⇒ sus links no se pueden tocar; el guard sólo computa un plan con la pantalla **sucia**) y **el residuo exacto, que es un solo caso**: salir con cambios sin guardar hacia **Inicio desde el sidebar**, con el atrás un escalón más corto. Cierra con la puerta cerrada: taparlo con un chequeo de ancho es lo que **NAV-05** y el propio criterio existen para prohibir. **El criterio 2 no se tocó.**

**MOB-04.** La regla nueva precisada y no contradicha: **sección → raíz es un retroceso**, con la causa medida de `G2-1` al lado (el ciclo crecía `3 → 5 → 7`, dos entradas por vuelta sin techo, y la marca de esa tercera entrada dejaba al armado en *no armar*) y la **cita textual** del dueño. El invariante que queda —la pila de la barra en dos niveles— y su **límite declarado**: en la pila de **tres** escalones que D-02 acepta a propósito, la raíz **no** es la entrada de abajo, así que el gesto **sigue empujando** y el atrás vuelve a **Más**, que es algo visible y el mismo principio de D-02. Lo que la fase promete es **que el ciclo no crece sin techo**, no que la pila nunca pase de dos. Y dónde vive la regla (la decisión de la **rama**, no la política de rutas) con el motivo de una línea.

**MOB-05.** Debajo del bloque de la `decision (a)`, la consecuencia **declarada el 2026-10-27**: `Más → tocar Inicio → atrás` **ya no vuelve a Más** —el toque consume la entrada de Más ⇒ el dueño queda en Inicio sin nada nuestro debajo ⇒ el sentinel se arma y el atrás avisa—, con las dos frases que evitan que se lea como regresión (la `decision (a)` **no** cambió; el **gesto de atrás** desde Más sigue cayendo en Inicio) y la **prohibición explícita** de tratarlo como bug en la ronda 3.

**Los tres requisitos, sin marcar.** La sección de *por qué siguen sin marcar* pasó a hablar de la **ronda 3** y dejó escrito qué pasó con la 2 (cuatro corridos, seis sin correr y el motivo). MOB-04 y MOB-05 deben Android **e** iPhone; **MOB-06 le debe sólo iPhone** más la parte de overlay. La tabla de trazabilidad quedó diciendo lo mismo que las casillas.

**El registro, por el CLI.** Dos entradas nuevas: la **16** (`unmet-truth`, el residuo de escritorio, hermana de la **15** y con el mismo criterio) y la **17** (`unrun-verify`, la ronda 3 con su alcance exacto, declarando que **reemplaza como lista única** a la **14**, cuyo texto quedó viejo). La **14 no se marcó arreglada** —la UAT no pasó— y la **15** no se tocó. Tabla y JSON **coinciden**.

**El guion de la ronda 2, completado.** Sus **diez** ítems con `**Resultado ronda 2:**`: `pasa` en 7, 8 y 15 con lo que se vio (y la consecuencia declarada de la pasadita por Más en el 8), `falla` **textual** en el 19 con el puntero a `G2-1`, y `sin correr` en los seis restantes con **el mismo motivo escrito igual** y a dónde vuelve cada uno. `git diff --numstat`: **52 inserciones, 0 borrados**.

### Task 2 — el guion de la ronda 3 (`2f45d3c`)

`03-UAT-GUION-3.md`, con la forma heredada del guion de la ronda 2 y **acotado**: **ocho** recorridos en Android (bloques 1 a 4) y **los 21** en iPhone (bloque 6), dicho en el encabezado para que el dueño sepa a qué se compromete.

- **Bloque 0** — el **hash** en la URL, con su uso nuevo en los dos sentidos: si después de tocar Inicio la URL **no** muestra el hash, el aviso **no** está armado y se anota **fallo sin esperar a ver el resultado** del atrás. Convierte el gap entero en un chequeo de un vistazo.
- **Bloque 1** — el gap: el recorrido del dueño **textual**, su mitad de pila (el ciclo ×3 sin acumular, medido en **E-14**) y el ítem **19** tal cual.
- **Bloque 2** — los tres recorridos cuya **expectativa cambió**, en el cuerpo del guion y no en una nota al pie: `Más → tocar Inicio → atrás` (ya no vuelve a Más, con qué sería un fallo), `Más → sección de Más → tocar Inicio` (la regla no participa, **E-15**) e `Inicio → Turnos → Más → tocar Inicio` (el **límite declarado**, **E-16** mitad B).
- **Bloque 3** — el **20** y su **parte de overlay**, que nunca se midió, con **cuál** overlay usar y la regla de que un ítem no corrible se **declara**.
- **Bloque 4** — el **residuo de escritorio**, que se corre para **verlo** y no para arreglarlo, más su gemelo sin cambios sin guardar.
- **Bloque 5** — lo que **no** vuelve en Android (7/8/15, 1-5, 10-13 y 16), cada uno con su motivo.
- **Bloque 6** — el pase completo de **iPhone / Safari** (A11), con las cinco cosas a mirar distinto.
- **Bloque 7** — **A1**, **A2** y **A11** con su línea, la frase de que un pipeline verde no es evidencia (8/8 → cinco fallos; 13/13 → `G2-1`), dónde se anota y la condición de cierre de cada requisito.

## Verificación de cierre del plan

| # | Qué | Resultado |
|---|-----|-----------|
| 1 | el criterio 6 revisado y el 2 intacto | **lineas=32 · revision fechada=1 · residuo=3 · criterio 2=1 · fases=3** |
| 2 | los requisitos con sus notas y sin marcar | **fechadas=9 · gap=7 · decision (a)=4 · cero regresion=4 · sin marcar=3 · E-14=1** |
| 3 | el registro por el CLI, tabla y JSON | **abiertas=15 · totales=17 · ronda 3=2 · residuo=8 · entrada 14=4 · coinciden** |
| 4 | el guion de la ronda 2 con sus diez resultados | **items=13 · anotados=10 · 3/1/6 · 52 inserciones, 0 borrados** |
| 5 | el guion de la ronda 3 | **264 lineas · 8 bloques · los diez contadores por encima de su piso** |
| 6 | el carril puro | **rc 0 · 76 archivos · 1628 pasados + 3 expected-fail (1631)** |
| 7 | tipos con `./node_modules/.bin/tsc --noEmit` | **0 errores** |
| 8 | la sonda por el turno de pantalla | **rc 0 · 16 escenarios · 16 coinciden · 0 no coinciden** |
| 9 | el checkpoint humano | **PENDIENTE DE LA PERSONA — no se auto-aprobó** |

Cero código tocado, cero paquetes nuevos, cero migraciones (la próxima libre sigue siendo la **080**).

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 1 — Bug de medición] La primera corrida de la sonda midió el `tail`, no la sonda**

- **Found during:** verificación de cierre
- **Issue:** la sonda se lanzó como `node scripts/con-turno.mjs … | tail -15`, así que el código de salida que volvió era el del **`tail`** y no el de la sonda — exactamente la trampa *un gate que termina en `tail -N` nunca falla* que el propio plan nombra. Encima la tubería **bufferea**, así que el cartel del turno ocupado no se vio y los veredictos por escenario quedaron fuera de las últimas quince líneas.
- **Fix:** se re-corrió redirigiendo la salida a un archivo y capturando `$?` **de la sonda**, y el resultado se leyó de la línea de resumen del propio instrumento: `escenarios medidos: 16 · coinciden con lo esperado: 16 · no coinciden: 0`, rc **0**.
- **Files modified:** ninguno (error de invocación, no del repo)
- **Verification:** rc real = 0 y 16/16 leídos del resumen
- **Commit:** —

### Desvíos declarados del flujo genérico del ejecutor

**2. [Prohibición del plan] No se corrió `requirements.mark-complete` con los IDs del frontmatter**

El plan declara `requirements: [MOB-04, MOB-05, MOB-06]` y el flujo genérico del ejecutor los marcaría completos al cerrar. **El plan lo prohíbe explícitamente** —se marcan con la evidencia del teléfono, y la ronda 3 todavía no corrió— así que el comando **no se corrió** y las tres casillas siguen en `[ ]` con su motivo escrito. Es el mismo criterio con el que la entrada **14** del registro **no** se marcó arreglada.

**3. [Contexto del entorno] El turno de pantalla estaba tomado por otro proyecto**

La sonda esperó ~18 minutos a que `forjo-tiendas` soltara el turno (`pruebas-por-tramos.ps1`). **Una espera no es un cuelgue ni un rojo**, y el turno **no se cortó a mano**: se esperó a que se liberara solo.

**Total deviations:** 1 auto-arreglada (una medición que medía el instrumento equivocado) + 2 desvíos **declarados** del flujo genérico, los dos ordenados por el plan o por el entorno. **Impacto:** ninguno sobre el contenido de los documentos.

## Authentication Gates

Ninguno.

## Known Stubs

Ninguno. Cero código tocado, cero `TODO`/`FIXME`/placeholders agregados, cero tests salteados. El único `<verify>` que no se corrió es el **human-check de bloqueo humano**, que es el objeto de este plan y queda registrado como entrada **17** (abierta) del registro de imprecisiones.

## Lo que este plan NO cierra, declarado

**La fase no se cierra acá.** Lo que falta es la **ronda 3** en los dos motores, y es lo único que puede cerrar **A1**, **A2** y **A11**. Hoy la sonda da 16/16 y la suite 1631 casos; las dos cosas siguen midiendo un espacio que **no incluye** lo que el teléfono prueba — la ronda 1 llegó con 8/8 y encontró cinco fallos más una colisión, y la ronda 2 llegó con 13/13 y encontró `G2-1`.

**Y el límite honesto de la regla, que es lo que el dueño va a ver:** la regla de `G2-1` **acota** el crecimiento, **no** lo elimina en todos los caminos. En la pila de tres escalones que D-02 acepta (`Inicio → Turnos → Más`) la raíz no es la entrada de abajo, así que ese gesto **sigue apilando**: el atrás vuelve a **Más** —algo visible— y el aviso **no** se arma porque hay algo nuestro debajo. Está escrito como **límite declarado** en MOB-04 y como ítem **2.3** del guion de la ronda 3.

## Next

**El checkpoint de bloqueo humano.** Correr `03-UAT-GUION-3.md`: **ocho** recorridos en Android Chrome y **los 21** en iPhone Safari, pestaña nueva por recorrido y la barra de direcciones a la vista en cada ciclo del aviso. Los resultados van a `03-UAT-2.md` como sección **Ronda 3**, con fecha y motor. Si algo falla, MOB-04, MOB-05 y MOB-06 **vuelven a quedar sin marcar** y los fallos entran como gaps de una ronda nueva.
