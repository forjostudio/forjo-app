---
phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos"
plan: "08"
subsystem: testing
tags: [uat, mobile-nav, back-button, history-api, requirements, windows-ledger]

# Dependency graph
requires:
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-04)"
    provides: "el guion de los 21 recorridos y las 14 casillas que el dueño marcó a mano durante la ronda 1 (commit `7c756a5`) — la evidencia de primera mano de qué se corrió"
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (planes 03-05, 03-06, 03-07)"
    provides: "los arreglos de los seis gaps, y con ellos el MOTIVO MEDIDO de cada ítem que vuelve en la ronda 2: la marca de la rama diciendo la verdad (03-05), el ejecutor de dos pasos y la decisión (a) (03-06), la séptima regla y el cuarto momento de reintento más el observable del hash (03-07)"
provides:
  - "`03-UAT-GUION-2.md`: el guion de la ronda 2 en 8 bloques — 18 recorridos en Android + los 21 en iPhone, con el motivo medido de cada ítem que vuelve y de cada uno que no"
  - "el guion de la ronda 1 COMPLETO: 21 casillas resueltas, las 14 del dueño intactas, la colisión H anotada como colisión y no como defecto"
  - "la decisión (a) del dueño registrada en el REQUISITO (no sólo en el documento de fase), con su alternativa desechada y su límite aceptado"
  - "el hecho que ACHICA la ronda 2: `cero regresion` ya está afirmado en Android, así que lo que le falta a MOB-06 es iPhone"
  - "el registro de imprecisiones consistente: la 12 arreglada, la 13 abierta con una entrada nueva que la reemplaza como lista única, y el residuo aceptado de (a)"
affects: ["panel-nav ronda 2 de UAT", "Phase 4 (los tabs profundos, MOB-08/09 — depende de que la política no se mueva)", "cierre del milestone v0.31"]

actuals:
  tokens: 12608
  tasks: 2
  commits: 2
plan_head_before: 097c683ce905fad7b645bd5094152beb16fa38d2

tech-stack:
  added: []
  patterns:
    - "Guion de UAT de segunda ronda como COMPLEMENTO y no como repetición: cada ítem que vuelve trae su motivo medido (qué camino de código le cambió), y cada ítem excluido trae el suyo — las dos listas son la misma disciplina vista de los dos lados"
    - "Observable de un vistazo para un modo de falla silencioso: el guion abre cada ciclo mirando la URL, porque el falso verde (una entrada de la raíz con hash que se ve igual que Inicio) es indistinguible de un verde a ojo"
    - "Texto que un gate cuenta escrito en ASCII a propósito, con el por qué anotado en el propio documento: con `LANG` vacío las clases de caracteres de `grep` son de bytes y sobre texto acentuado miden cero"
    - "Entrada nueva que reemplaza a otra como lista única cuando el CLI no puede editar descripciones — el molde que el propio registro ya usaba (la 11 reemplazó a la 9 y la 10)"

key-files:
  created:
    - ".planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-GUION-2.md"
  modified:
    - ".planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-04-SUMMARY.md"
    - ".planning/workstreams/panel-nav/REQUIREMENTS.md"
    - ".planning/WINDOWS.md"

key-decisions:
  - "La ronda 2 NO re-corre los 21 en Android: 18 recorridos (los 5 fallos, la colisión H, la mitad de overlay nunca medida y 11 de regresión dirigida) más los 21 en iPhone. Re-correr en Android lo que ya pasó es cómo una UAT deja de correrse"
  - "Los ítems 6 y 18 se PLIEGAN en 7 y 19 en vez de volver sueltos: el 7 es el mismo cruce con un escalón más y el 19 es el mismo ciclo con la condición de entrada directa, así que el recorrido largo cubre al corto"
  - "Los ítems 1 a 5 vuelven aunque pasaron, y se verifican MIRANDO LA URL y no a ojo: el plan 03-06 les cambió el primer toque desde Inicio a dos pasos, y su modo de falla nuevo es silencioso"
  - "`requirements-completed: []` a propósito, igual que el plan 03-04: los tres requisitos de este plan (MOB-04, MOB-05, MOB-06) NO se marcan acá — los marca la ronda 2 en el teléfono"
  - "La entrada 13 del registro NO se marca arreglada: Android se corrió y encontró cinco fallos, y el pase de iPhone sigue entero sin correr. Marcarla borraría los dos hechos a la vez"
  - "Las etiquetas `decision (a)` y `cero regresion` van sin tilde en REQUIREMENTS.md, con el por qué escrito en el propio requisito: son los literales que los gates cuentan, y acentuarlas los dejaría verdes midiendo cero"

patterns-established:
  - "Marca de falla con su gap en el guion de la ronda que falló (`[FALLA] 7 (G-1)`) más lo que el dueño midió TEXTUAL: el registro de una ronda sirve para comparar con la siguiente sólo si no se reescribe con otras palabras"
  - "Tabla de cierre por requisito con el motivo DISTINTO de cada uno, en vez de un 'pendiente' común: MOB-06 debiéndole sólo iPhone es lo que impide que la próxima lectura vuelva a pedir 21 recorridos en Android"

requirements-completed: []

coverage:
  - id: D1
    description: "El guion de la ronda 1 quedó completo y consistente con el estado real: las 14 casillas del dueño intactas, los ítems 6 y 18 marcados pasados por su reporte verbal, los 7, 8, 15, 19 y 20 marcados [FALLA] con su gap y lo que midió textual, el bloque H anotado como la colisión de diseño (G-4) que resolvió la decisión (a), y el párrafo de la imprecisión 12 reemplazado por el residuo que de verdad queda aceptado"
    verification:
      - kind: other
        ref: "gate de conteo sobre 03-04-SUMMARY.md: casillas del dueño=16 (>=14, base medida 14) · sin resolver=0 (base 7) · marcas de falla=5 (>=5, base 0) · gaps nombrados=6 (>=5, base 0) · nota=2 · puntero=3 · residuo=2"
        status: pass
      - kind: other
        ref: "git diff -U0 118f0e0^..118f0e0 | grep -cE '^-- \\[(ok|OK)\\]' = 0 — cero líneas de casilla del dueño borradas"
        status: pass
    human_judgment: false
  - id: D2
    description: "REQUIREMENTS.md registra la decisión (a) del dueño con sus tres partes (qué se decidió, la alternativa (b) desechada y por qué, y el límite aceptado de la entrada ajena), deja escrito que `cero regresion` ya está afirmado en Android y que lo que le falta a MOB-06 es iPhone (A11), y mantiene los tres requisitos SIN marcar con el motivo distinto de cada uno; MOB-07 conserva su enmienda de D-05"
    verification:
      - kind: other
        ref: "gate de conteo sobre REQUIREMENTS.md: MOB-04/05/06 sin marcar=3 (>=3) · marcados=0 (=0) · MOB-07 marcado=1 · decisión registrada=3 · límite aceptado=1 · alternativa afuera=1 · cero regresion=3 · A11=3 · rondas=13"
        status: pass
    human_judgment: false
  - id: D3
    description: "El registro de imprecisiones quedó consistente con lo que de verdad pasó, tocado por el CLI y no a mano: la entrada 12 arreglada (la cerró la decisión (a)), la 13 todavía abierta, y dos entradas nuevas — la del alcance real de la ronda 2 que reemplaza a la 13 como lista única, y la del residuo aceptado de (a)"
    verification:
      - kind: other
        ref: "gsd-tools windows status: entradas totales=15 (>=15, base 13) · entrada 12=fixed · entrada 13=open · entradas nuevas=2 · reemplaza a la 13=2 · residuo aceptado=1"
        status: pass
    human_judgment: false
  - id: D4
    description: "El guion de la ronda 2 existe con sus 8 bloques: el observable del hash con sus dos lados, los 5 fallos arreglados con su recorrido textual, el bloque H bajo la decisión (a) con sus dos mitades, la parte de overlay del ítem 20 que nunca se midió, la regresión dirigida de 11 ítems con el motivo medido de cada grupo, los 5 que no vuelven con el suyo, el pase completo de iPhone, y la regla de registro con la condición de cierre por requisito"
    verification:
      - kind: other
        ref: "gate de contenido sobre 03-UAT-GUION-2.md: observable=7 (>=2) · 5 fallos con su gap=5 (>=5) · bloque H=4 (>=1) · overlay nunca medido=4 · motivos=21 (>=6) · lo que no vuelve=6 (>=3) · iPhone=11 (>=2) · Safari distinto=2 · supuestos=6 (>=3) · destino=2 · declarar vs marcar=10 · no es la ronda 1=2"
        status: pass
      - kind: other
        ref: "gate de presencia: los 11 ítems de la regresión dirigida (1-5, 10-13, 16, 21) presentes como filas/secciones reales · los 3 excluidos (9, 14, 17) nombrados=3 · Android=10 · bloques=8 (>=7)"
        status: pass
    human_judgment: false
  - id: D5
    description: "El pipeline quedó verde ANTES de entregar el guion — porque entregarlo con la suite roja sería pedirle al dueño que verifique en el teléfono un código que la suite ya sabe roto"
    verification:
      - kind: unit
        ref: "npx vitest run --project pure — rc 0, 1598 pasados + 3 expected-fail / 76 archivos (piso 1553 / 76)"
        status: pass
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs — rc 0, 13 escenarios en OK (piso 13)"
        status: pass
      - kind: other
        ref: "./node_modules/.bin/tsc --noEmit limpio (cero 'error TS' fuera de .next/) · npm run build rc 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "La RONDA 2 DE LA UAT EN CELULAR REAL — los 18 recorridos de Android y los 21 de iPhone. Es lo único que cierra MOB-04, MOB-05 y MOB-06, y lo único que cierra los supuestos A1, A2 y A11"
    requirement: "MOB-04"
    verification: []
    human_judgment: true
    rationale: "PENDIENTE — NO CORRIDA. Ningún instrumento de este repo la puede sustituir: la ronda 1 tuvo la sonda en 8/8 y el teléfono encontró cinco fallos más una colisión de diseño. El modo de falla es silencioso y no lo ve `tsc`, ni la suite, ni el build, ni la sonda (que no corre el código de la app). Requiere DOS teléfonos reales, Docker + Supabase local y el dev server alcanzable desde la LAN. El checkpoint es `gate=\"blocking-human\"` y NO se auto-aprobó"

# Metrics
duration: 20 min
completed: 2026-10-23
status: complete
---

# Phase 3 Plan 08: El bookkeeping de la fase y el guion de la ronda 2 de la UAT

**Los tres documentos quedaron consistentes con lo que de verdad pasó en la ronda 1 —16 pasan, 5 fallan, una colisión de diseño— y la ronda 2 quedó escrita como el COMPLEMENTO y no como la repetición: 18 recorridos en Android con el motivo medido de cada uno y los 21 en iPhone, entregada al dueño con el checkpoint DETENIDO en el bloqueo humano.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-10-23T22:37Z (aprox., primera llamada de este ejecutor)
- **Completed:** 2026-10-23T22:56Z
- **Tasks:** 2 de 2 ejecutados y commiteados
- **Files modified:** 4 (3 modificados + 1 creado)

## Accomplishments

- **El guion de la ronda 1 quedó COMPLETO sin perder un solo dato del dueño.** Las **14** casillas que
  marcó a mano mientras probaba siguen intactas —verificado con `git diff`: **cero** líneas `[ok]`/`[OK]`
  borradas—, y las **7** que quedaban en blanco están resueltas: **6** y **18** como pasados (su reporte
  verbal, que la tabla de `03-UAT.md` resuelve) y **7, 8, 15, 19, 20** como `[FALLA]` con su gap y con lo
  que el dueño midió **textual**. La colisión **H** quedó anotada como lo que es (**G-4**, colisión de
  diseño resuelta por la decisión (a)), **no** como un defecto de implementación.
- **La decisión del dueño salió del documento de fase y entró al REQUISITO**, que es donde el cierre de
  milestone la va a leer: debajo de MOB-05, con sus tres partes —qué se decidió, **la alternativa (b) que
  quedó afuera y por qué se desechó**, y **el límite aceptado** (si lo de abajo es una **entrada ajena**,
  el aviso aparece igual y no hay forma confiable de saberlo).
- **El hecho que ACHICA esta ronda quedó escrito con esas palabras:** `cero regresion` **ya está
  verificado en Android** —el bloque E, los cuatro quicks de octubre, se corrió y pasó— así que **lo que
  le falta a MOB-06 no es Android: es iPhone (A11)**. Sin eso escrito, la próxima lectura volvería a pedir
  los 21 recorridos en Android.
- **El guion de la ronda 2, en 8 bloques, cubre lo que falta y nada más:** el observable del hash (con sus
  **dos** lados opuestos), los **5 fallos** arreglados, el **bloque H** bajo (a) con sus **dos mitades**,
  la **parte de overlay del ítem 20** que nunca se midió, la **regresión dirigida** de 11 ítems con el
  **motivo medido** de cada grupo, los **5 que no vuelven** con el suyo, el **pase completo de iPhone** y
  la regla de registro con la condición de cierre **por requisito**.
- **El registro de imprecisiones quedó consistente, tocado por el CLI:** la **12 arreglada** (la cerró la
  decisión (a)), la **13 todavía abierta** —Android se corrió y falló, y el pase de iPhone sigue entero
  sin correr— con una **entrada nueva que la reemplaza como lista única** con el alcance real, más la del
  **residuo aceptado**. 13 → **15** entradas.
- **El pipeline quedó verde antes de entregar:** carril puro **1598 pasados + 3 expected-fail / 76
  archivos**, sonda **13/13**, `tsc` limpio, build en 0.

## Task Commits

1. **Task 1: Los tres documentos, consistentes con lo que de verdad pasó** — `118f0e0` (docs)
2. **Task 2: El guion de la ronda 2, con el motivo medido de cada ítem que vuelve** — `0c2dfaa` (docs)

**Plan metadata:** este resumen (docs: complete plan)

**Medido, no narrado:** `git rev-list --count 097c683..HEAD` = **2** (sin contar el commit de este
resumen), con `plan_head_before: 097c683`.

## Files Created/Modified

- `03-UAT-GUION-2.md` — **nuevo.** El guion de la ronda 2: 8 bloques, 18 recorridos de Android y los 21
  de iPhone, con el setup del entorno, el observable de la URL, el motivo por ítem y la condición de
  cierre por requisito.
- `03-04-SUMMARY.md` — el guion de la ronda 1 completado: nota de encabezado (qué es, el resultado, dónde
  está el detalle), las 7 casillas resueltas, el bloque H anotado, y el párrafo de la imprecisión 12
  reemplazado por el residuo aceptado.
- `.planning/workstreams/panel-nav/REQUIREMENTS.md` — la decisión (a) debajo de MOB-05; el hecho nuevo y
  su consecuencia debajo de MOB-06; la tabla de por qué los tres siguen sin marcar con el motivo de cada
  uno; las tres filas de trazabilidad actualizadas.
- `.planning/WINDOWS.md` — por el CLI: la 12 a `fixed`, dos entradas nuevas (14 y 15).

## Decisiones Made

Las seis de `key-decisions` en el frontmatter. La que más cambia el trabajo del dueño es la primera:
**la ronda 2 son 18 recorridos en Android, no 21.** Y la que más protege la fase es la cuarta:
`requirements-completed: []`, igual que el plan `03-04` — **los requisitos no se marcan acá**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 — bloqueante] El contador `coli` del gate del guion medía 1 de 6 menciones reales**

- **Found during:** Task 2 (al falsificar los gates antes de darlos por buenos)
- **Issue:** el patrón `colisi[oó]n|bloque H|M[aá]s → Inicio` daba **1** sobre un documento con **6**
  menciones de la colisión. Es la cuarta variante del historial de gates de esta fase: con `LANG` vacío
  las clases de caracteres de `grep` son de **bytes**, y `ó` son **dos**, así que `colisi[oó]n` **no
  matchea "colisión"** y `M[aá]s` no matchea "Más". Lo único que el gate veía era un `(bloque H)`
  incidental en la introducción — o sea que el gate pasaba **casi sin medir el bloque que tiene que
  medir**, y una reescritura de esa única línea lo habría puesto rojo con el contenido intacto.
- **Fix:** **el gate no se tocó.** Se le dieron anclas **ASCII** (`bloque H`) **dentro del Bloque 2**, que
  es el que el gate tiene que medir: su título y su primera frase. El contador pasó de **1** a **4**, y
  ahora las cuatro menciones están en lugares que no se pueden borrar sin borrar el bloque.
- **Verificación:** `grep -niE 'colisi[oó]n|[Bb]loque H|M[aá]s → Inicio'` → líneas 19, 138, 140 y 309, con
  las tres últimas dentro del Bloque 2 y de la condición de cierre.
- **Committed in:** `0c2dfaa`
- **Medido primero, no supuesto:** la trampa se confirmó con `printf` sobre texto acentuado antes de
  escribir una sola línea (`opci[oó]n \(a\)` → **0**, `cero regresi[oó]n` → **0**), y por eso las dos
  etiquetas de `REQUIREMENTS.md` se escribieron en ASCII **con el por qué anotado en el propio
  requisito**, para que nadie las "corrija" y deje los gates verdes midiendo cero.

---

**Total deviations:** 1 auto-arreglada (1 × Regla 3 — bloqueante).
**Impact on plan:** ninguno sobre el alcance. El arreglo fue sobre el **documento**, nunca sobre el gate,
y el resultado es que el gate mide lo que decía medir.

### Precondición de Task 1, resuelta sin desvío

El árbol de archivos **versionados** estaba limpio al arrancar (cero modificados). Los **4** untracked que
había —`.claude/gsd-local-patches/`, `.claude/settings.json`, `.gsd/` y
`.planning/workstreams/panel-nav/milestone.lock`— son artefactos de runtime **ajenos a este plan** y
quedaron **sin tocar**: commitearlos habría metido configuración local en la historia del repo, y como el
staging de este plan fue archivo por archivo, no ensuciaron ningún `git diff`. La precondición se verificó
**sólo leyendo** (`git status`), sin efectos.

## Issues Encountered

Ninguno. El carril puro, la sonda, los tipos y el build salieron verdes **a la primera** — ni el flake del
runner en Windows ni el del build sobre los archivos de fuentes aparecieron. El reloj estaba **dentro** de
la ventana [01:00, 23:30] AR (19:50), así que los dos canarios de reloj no entraron en juego, y no había
otro `vitest` corriendo.

## Pisos que ya estaban satisfechos antes de este plan

Se midieron **antes** de escribir, como pedía el encargo. De los 25 pisos de los gates:

| Gate | Piso | Base medida hoy | Estado |
|---|---|---|---|
| Task 1 · `03-04-SUMMARY` | casillas del dueño ≥ 14 | **14** | **ya satisfecho** (y este plan **no** las toca; subió a 16 por los ítems 6 y 18) |
| Task 1 · `REQUIREMENTS` | MOB-04/05/06 sin marcar ≥ 3 | **3** | **ya satisfecho** |
| Task 1 · `REQUIREMENTS` | marcados = 0 | **0** | **ya satisfecho** |
| Task 1 · `REQUIREMENTS` | MOB-07 marcado ≥ 1 | **1** | **ya satisfecho** |
| Task 2 · carril puro | ≥ 1553 pasados / ≥ 76 archivos | **1598 / 76** | **ya satisfecho** por las waves 5-7 (el piso se derivó de una base de 1514) |
| Task 2 · sonda | ≥ 13 escenarios en OK | **13** | **ya satisfecho** por las waves 5-7 (E-9 a E-13) |
| Task 2 · tipos y build | limpio / rc 0 | limpio / 0 | **ya satisfecho** |

Los **18** restantes estaban en **0** o fuera de rango y los movió este plan: los tres contadores de texto
de `03-04-SUMMARY` (nota, puntero, residuo), sus marcas de falla y sus gaps, las casillas sin resolver
(7 → 0), los seis contadores de texto de `REQUIREMENTS`, los seis del registro de imprecisiones, y los
doce más dos del guion de la ronda 2 (que no existía).

## Known Stubs

Ninguno. Este plan no toca código de producción: son cuatro documentos y un checkpoint.

## Threat Flags

Ninguna. Cero cambios de esquema, policies, queries o migraciones (la próxima libre sigue siendo la
**080**); cero datos de otro negocio; cero paquetes nuevos; cero archivos de configuración tocados.

Las amenazas del registro de este plan quedan así:

| Threat ID | Estado |
|---|---|
| **T-03-42** (critical — la fase marcada como verificada sin que nadie abrió el teléfono) | **mitigada** — el checkpoint es `gate="blocking-human"` y **NO se auto-aprobó**, con `workflow.auto_advance` global en `true` y el modo de verificación humana en `end-of-phase`. La fase **no** quedó marcada verificada |
| **T-03-43** (high — descartar las 14 casillas del dueño) | **mitigada y medida** — `git diff -U0` del commit de Task 1: **cero** líneas `[ok]`/`[OK]` borradas. El plan **sumó** 2 pasadas y 5 fallas sin re-marcar nada |
| **T-03-44** (high — un guion que gasta el tiempo del dueño y deja de correrse) | **mitigada** — 18 recorridos en Android en vez de 21, con **motivo medido** por ítem que vuelve (21 menciones) y los **3 excluidos nombrados** |
| **T-03-45** (high — el falso verde de los ítems que vuelven por el camino nuevo) | **mitigada** — el Bloque 0 con los **dos** lados del observable, y los ítems 1 a 5 marcados en el guion como *se verifican mirando la URL, no a ojo* |
| **T-03-46** (high — toda la fase descansando en un motor sin pantalla) | **mitigada en el guion, PENDIENTE en el teléfono** — el Bloque 6 pide los **21** ítems en iPhone con lo que hay que mirar distinto; se cierra cuando se corra |
| **T-03-47** (medium — desincronizar el registro de imprecisiones) | **mitigada** — tocado **sólo por el CLI**; la 12 en `fixed`, la 13 en `open`, y la entrada nueva que la reemplaza como lista única |
| **T-03-48** (medium — marcar un requisito por tener el código escrito) | **mitigada** — los tres **sin marcar**, `requirements-completed: []`, y `requirements mark-complete` **no se corrió** |
| **T-03-49** (low — information disclosure) | **aceptada** — sin cambios de producción |

## ⚠ La ronda 2 de la UAT está PENDIENTE — la fase NO está cerrada

**Este plan entregó el guion; no lo corrió.** El checkpoint de Task 2 quedó **detenido en el bloqueo
humano explícito** y **no se auto-aprobó**, que es exactamente lo que el plan pedía y lo que `auto_advance`
en `true` no puede saltear.

Lo que falta, y sólo lo puede cerrar el dueño con dos teléfonos:

- **Android Chrome** — bloques 0 a 4: el observable de la URL, los **5 fallos** (7, 8, 15, 19, 20), el
  **bloque H** bajo la decisión (a), la **parte de overlay del ítem 20** y la **regresión dirigida**
  (1, 2, 3, 4, 5, 10, 11, 12, 13, 16, 21). **18 recorridos.**
- **iPhone Safari** — bloque 6: los **21** ítems, porque en Safari **nada** de esta fase se verificó.
- **Los resultados van a `03-UAT.md` como sección Ronda 2**, con fecha y motor, **sin borrar la ronda 1**.

Hasta entonces:

- **MOB-04, MOB-05 y MOB-06 siguen sin marcar** en `REQUIREMENTS.md`, con el motivo de cada uno escrito
  (MOB-06 debiéndole **sólo iPhone**).
- **A1, A2 y A11** siguen **abiertos** y declarados.
- La entrada **13** del registro de imprecisiones sigue **abierta**, y la **nueva** (la del alcance real de
  la ronda 2) también.

## Next Phase Readiness

**La Phase 3 no cierra con este plan: cierra cuando el dueño corra la ronda 2.** Las ocho waves están
ejecutadas y sus gates en verde, y el criterio que cierra la fase es la UAT en celular real.

La **Phase 4** (los tabs profundos, MOB-08/09) depende de que la política no se mueva, así que conviene
que la ronda 2 la confirme **antes** de planificarla — que es justo el orden que el ROADMAP eligió.

## Self-Check: PASSED

- Archivo creado, verificado en disco: `03-UAT-GUION-2.md` — **presente** (314 líneas).
- Archivos modificados, verificados en disco: `03-04-SUMMARY.md`,
  `.planning/workstreams/panel-nav/REQUIREMENTS.md`, `.planning/WINDOWS.md` — **los 3 presentes**.
- Commits verificados con `git log --oneline`: `118f0e0` y `0c2dfaa` — **los 2 presentes**.
- `git rev-list --count 097c683..HEAD` = **2**, consistente con los 2 commits listados.
- Los **cinco** `<automated>` de los dos tasks re-corridos y en verde, con sus números en este resumen.
- Cero deleciones de archivos en los dos commits (`git diff --diff-filter=D` vacío en ambos).
- `STATE.md` y `ROADMAP.md` **no se tocaron** (los escribe el orquestador), y
  `requirements mark-complete` **no se corrió**.

---
*Phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos*
*Completed: 2026-10-23*
