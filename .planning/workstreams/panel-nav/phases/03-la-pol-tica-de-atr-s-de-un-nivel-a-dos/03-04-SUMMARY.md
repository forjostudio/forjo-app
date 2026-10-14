---
phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos"
plan: "04"
subsystem: ui
tags: [navegacion, historial, popstate, cambios-sin-guardar, uat-celular, next16, react19]

requires:
  - phase: "03-02"
    provides: "panelBranchPlan con los cinco planes, runBranchNavigation (el ejecutor de dos pasos), branchSecondStep, consumeOwnedBranchEntry y la marca frjUnder"
  - phase: "03-03"
    provides: "el sentinel de salida (frjExit, PANEL_EXIT_HINT_MS, PANEL_EXIT_HASH), la regla -1 de panelBranchPlan y el aviso de §13"
  - phase: "02-la-barra-inferior-y-m-s"
    provides: "Más como RUTA (/mas), la barra inferior y el orden de contrato del onNavigate (el guard primero)"
provides:
  - "El plan de salida del guard de cambios sin guardar ampliado a los CINCO planes de la rama, con un tipo de plantilla y una sola regla"
  - "El provider del guard ejecutando ese plan y delegando al MISMO ejecutor que usa la barra, con manejo exhaustivo del tipo"
  - "El plan de la rama RE-DERIVADO en el popstate del consumo, que es el único momento en que la marca es legible (medido en E-8)"
  - "El escenario E-8 de la sonda: la cadena de tres pasos, medida antes de codearse"
  - "REQUIREMENTS.md diciendo lo que el código hace: MOB-04 precisado, MOB-05 resuelto con su forma, MOB-07 enmendado"
  - "El guion de la UAT en celular real con los 21 recorridos escritos de antemano — PENDIENTE de ejecución"
affects: ["Phase 4 — los tabs profundos (MOB-08/09): heredan la política ya fijada y el plan de salida ampliado"]

actuals:
  tokens: 27930
  tasks: 2.5
  commits: 4
plan_head_before: 3789d9aba0320bd17c7eb77baec0083f531d2e32

tech-stack:
  added: []
  patterns:
    - "Tipo de plantilla sobre una unión existente (`consume-then-${PanelBranchPlan}`) para que un miembro nuevo no se pueda olvidar en la composición"
    - "Re-derivar una decisión en el evento en vez de en el gesto, cuando el hecho que la gobierna sólo es legible después del primer consumo"
    - "Un ejecutor único con `switch` exhaustivo (`: never`) delegando al ejecutor compartido, en vez de un segundo dialecto por call site"

key-files:
  created: []
  modified:
    - "lib/unsaved-changes.ts — el plan de salida ampliado a los cinco planes de la rama"
    - "lib/unsaved-changes.test.ts — 8 casos nuevos, los 3 medidos intactos"
    - "components/dashboard/unsaved-changes-guard.tsx — el provider ejecutando el plan nuevo"
    - ".planning/debug/probes/panel-back-stack.mjs — el escenario E-8"
    - ".planning/debug/pila-de-dos-niveles-medida.md — el registro de E-8"
    - ".planning/workstreams/panel-nav/REQUIREMENTS.md — MOB-04/05/07"
    - "next.config.ts — la IP medida de la LAN en allowedDevOrigins (solo-dev)"

key-decisions:
  - "El plan de la rama se RE-DERIVA en el popstate del consumo y no en el click: medido (E-8) que con el sentinel de cambios sin guardar arriba la marca de la rama es `null`, porque `dirtyHistoryState` devuelve sólo `{ frjDirty }`. Decidirlo en el click habría dejado 'Salir sin guardar' desde /web aterrizando con la política de UN nivel"
  - "El nombre del parámetro `sectionMode` se conserva aunque ahora reciba el plan de la rama: renombrarlo obligaba a reescribir los tres casos medidos, que es justo lo que el diseño existe para evitar. Deuda deliberada, declarada en el docblock"
  - "`lib/unsaved-changes.ts` acepta un import DE TIPO de `panel-history`: duplicar los cinco valores sería un segundo dialecto, que es el hueco silencioso que la fase viene a cerrar"
  - "El guard pregunta por el sentinel de salida por DUEÑO (`isExitSentinelOwnedEntry`) y no por id, porque no es su dueño: sólo necesita saber si la entrada de arriba es una absorbente"
  - "La navegación diferida se arma INLINE en `completarSalida` y no en un callback con nombre: la auditoría de fuente de `test/dirty-history.test.ts` recorta ese handler y un `setLeaveNow` escondido dejaría el candado midiendo nada"
  - "Si un retroceso guardado se niega, se navega con `panelNavMode`: quedarse sin hacer nada dejaría el gesto MUERTO después de que el dueño ya aceptó descartar su trabajo"
  - "Las casillas de MOB-04, MOB-05 y MOB-06 quedan SIN marcar: las marca la UAT en celular, y marcarlas acá sería el pendiente silencioso que el criterio 3 prohíbe"

patterns-established:
  - "Medir la cadena más larga con la sonda ANTES de escribir el código que la ejecuta: E-8 rehizo el diseño del provider antes de que existiera"
  - "Enmendar un requisito marcado Complete con fecha, motivo y la distinción explícita contra el criterio del ROADMAP que NO se toca"

requirements-completed: []

coverage:
  - id: D1
    description: "El plan de salida acepta los cinco planes de la rama y devuelve el plan o el plan con el prefijo de consumo, con los tres casos medidos intactos"
    requirement: "MOB-06"
    verification:
      - kind: unit
        ref: "lib/unsaved-changes.test.ts#EXHAUSTIVIDAD: para los CINCO planes, con sentinel es el prefijo de consumo y sin sentinel es el plan pelado"
        status: pass
      - kind: unit
        ref: "lib/unsaved-changes.test.ts#las DOS formas viejas siguen siendo casos particulares de la nueva"
        status: pass
      - kind: other
        ref: "git diff --numstat 3789d9a -- lib/unsaved-changes.test.ts => 84 agregadas / 0 borradas"
        status: pass
    human_judgment: false
  - id: D2
    description: "El provider no toca el historial por su cuenta y maneja el plan de forma exhaustiva sobre el tipo"
    requirement: "MOB-06"
    verification:
      - kind: other
        ref: "gate de código del Task 1: mutaciones crudas de historial EN CÓDIGO = 0, `: never` = 1, `once: true` = 1, panel-branch = 3"
        status: pass
      - kind: unit
        ref: "test/dirty-history.test.ts#(i) el segundo paso de la continuación sale del `popstate`, NUNCA del mismo tick"
        status: pass
      - kind: unit
        ref: "npx vitest run --project pure => 76 archivos / 1514 casos pasados"
        status: pass
    human_judgment: false
  - id: D3
    description: "La cadena de tres pasos aterriza donde dice: consumir el sentinel de cambios sin guardar, consumir la entrada de la sección y recién entonces reemplazar"
    requirement: "MOB-04"
    verification:
      - kind: integration
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs => E-8 OK (8/8, rc 0)"
        status: pass
    human_judgment: true
    rationale: "La sonda mide `history` crudo con su propio servidor estático: SIN el router de Next en el medio. Lo que no puede observar es el orden del efecto que escribe la marca contra la escritura del router (A1) ni que no haya otro commit en vuelo (A2). Si A1 estuviera mal, la marca no se escribe y la cadena degrada a apilar EN SILENCIO — sin excepción, sin rojo. Lo cierra el teléfono (ítems 15 y 16 del guion)"
  - id: D4
    description: "'Salir sin guardar' aterriza donde manda la política NUEVA en las dos pantallas con guarda (/agenda y /web)"
    requirement: "MOB-06"
    verification: []
    human_judgment: true
    rationale: "El defecto es que el dueño aterriza en el lugar equivocado DESPUÉS de haber descartado trabajo: no hay excepción, no hay rojo, y ni `tsc` ni la suite ni el build lo ven. Es el criterio 4 y sólo se verifica en un teléfono (ítems 14 a 17)"
  - id: D5
    description: "REQUIREMENTS.md dice lo que el código hace: MOB-04 precisado por D-02, MOB-05 resuelto con su forma y su costo, MOB-07 enmendado por D-05 sin tocar el criterio 6"
    requirement: "MOB-05"
    verification:
      - kind: other
        ref: "gate 1 del Task 2: faltantes=0, 'decisión abierta'=0, techo=1, invariante=1, enmienda=3, constante=4, casillas marcadas antes de la UAT=0"
        status: pass
      - kind: other
        ref: "gate 2 del Task 2: 81 agregadas / 3 borradas (piso: ≤12), 204 líneas totales, advertencia original intacta, 9 filas de trazabilidad"
        status: pass
    human_judgment: false
  - id: D6
    description: "La UAT en celular real: los 21 recorridos en Android y en iPhone"
    requirement: "MOB-04"
    verification: []
    human_judgment: true
    rationale: "PENDIENTE — es el entregable principal de la fase y el único criterio que vale. El checkpoint es `gate=\"blocking-human\"` y NO se auto-aprobó. Cierra A1, A2 y A11, que ninguna sonda puede cerrar"

duration: 72min
completed: 2026-10-14
status: complete
---

# Phase 3 Plan 04: La política de atrás, de un nivel a dos — el cierre Summary

**"Salir sin guardar" aterriza con la política de dos niveles porque el plan de la rama se re-deriva en el `popstate` del consumo —el único momento en que la marca es legible, medido en E-8— y los requisitos quedaron diciendo lo que el código hace; la UAT en celular real queda escrita con sus 21 recorridos y DETENIDA esperando al dueño.**

## Performance

- **Duration:** 72 min
- **Started:** 2026-10-14T04:14:00Z (aprox.)
- **Completed:** 2026-10-14T04:40:00Z
- **Tasks:** 2 de 3 completos · el **Task 3 quedó DETENIDO en el checkpoint humano** (sus gates automáticos pasaron)
- **Files modified:** 7

## Accomplishments

- **El plan de salida del guard aprendió la política nueva** (`lib/unsaved-changes.ts`): acepta los **cinco** planes de la rama y devuelve *ese plan* o *ese plan con el prefijo de consumo*, construido con un **tipo de plantilla** sobre `PanelBranchPlan` para que agregar un plan nuevo no se pueda olvidar. El cuerpo sigue teniendo **una** regla. Las dos formas viejas son casos particulares de la nueva, así que **los tres casos medidos quedaron byte por byte intactos** (84 líneas agregadas, **0 borradas**, medido contra el HEAD de la wave 3).
- **El provider lo ejecuta, con un solo ejecutor exhaustivo** (`unsaved-changes-guard.tsx`): `push`/`replace` por el router, y `up`/`collapse-then-replace`/`none` **delegados a `runBranchNavigation`**, el mismo que usa la barra. Manejo exhaustivo con `: never` —un plan nuevo sin decidir qué hace acá **no compila**— y **cero mutaciones crudas de historial**: el consumo lo hace cada dueño sobre su marca.
- **La cadena de tres pasos quedó MEDIDA antes de codearse** (E-8 en la sonda, 8/8, rc 0), y **la medición rehizo el diseño del provider** antes de que existiera. Ver "Decisiones" y el desvío 1.
- **Los requisitos dicen lo que el código hace**: MOB-04 **precisado** por D-02 (dos niveles es profundidad, **no es un techo de la pila**) con el invariante verificable del cruce; MOB-05 **resuelto** con su forma (aviso efímero de §13, regla de la constante única), su costo aceptado y su alcance en escritorio; MOB-07 **enmendado** con fecha, motivo y la distinción explícita contra el **criterio 6** del ROADMAP.
- **El guion de los 21 recorridos de la UAT está escrito de antemano**, abajo, con su resultado esperado — incluidos los dos recorridos que esta fase cambia **a propósito** y los casos declarados que **no** son bugs.

## Task Commits

1. **Task 1 (RED): la cadena de tres pasos medida, y los casos de la rama antes del contrato** — `5cde71d` (test)
2. **Task 1 (GREEN): el guard aprende la política nueva, con el plan re-derivado tras el consumo** — `145b8f4` (feat)
3. **Task 2: los requisitos dicen lo que el código hace** — `4a34cb2` (docs)
4. **Task 3 (preparación): la IP medida de la LAN en la lista de orígenes de dev** — `2fc3fcc` (chore)

_REFACTOR del ciclo TDD: sin commit, porque no hubo cambio — el código quedó en su forma final en el GREEN._

**Commits medidos:** `git rev-list --count 3789d9a..HEAD` = **4** (no narrados).

## Files Created/Modified

- `lib/unsaved-changes.ts` — el plan de salida ampliado a los cinco planes de la rama; el docblock extendido con su tercera mitad (por qué el modo de sección ya no alcanza, cuál es el caso vivo, y qué es lo que esta función **no** puede decidir)
- `lib/unsaved-changes.test.ts` — 8 casos nuevos **debajo** de los tres medidos, más el mapa total `Record<PanelBranchPlan, true>` como candado de exhaustividad
- `components/dashboard/unsaved-changes-guard.tsx` — el plan de la rama calculado con los dos hechos re-verificados en el click, el ejecutor exhaustivo, las dos navegaciones (inmediata y diferida) y la re-derivación en el `popstate`
- `.planning/debug/probes/panel-back-stack.mjs` — el escenario **E-8** y sus dos helpers (`empujarSentinelDeCambios`, `cadenaDeTresPasos`)
- `.planning/debug/pila-de-dos-niveles-medida.md` — el registro de E-8 con la consecuencia de diseño escrita
- `.planning/workstreams/panel-nav/REQUIREMENTS.md` — MOB-04 precisado, MOB-05 resuelto, MOB-07 enmendado, tabla de trazabilidad actualizada
- `next.config.ts` — la IP medida de la LAN en `allowedDevOrigins` (solo-dev, cero efecto en producción)

## Decisions Made

### 1. El plan de la rama se re-deriva en el `popstate`, no en el click — y lo decidió la medición

El plan pedía calcular el plan de la rama **en el momento del click** y pasárselo al plan de salida. **E-8 midió que eso no alcanza**, y el motivo es mecánico: `dirtyHistoryState(id)` devuelve `{ frjDirty: id }` **y nada más**, así que el `pushState` del sentinel de cambios sin guardar crea una entrada **sin** la marca de la rama — que sigue viva, intacta, en la entrada de la sección de abajo.

```
la_marca_de_la_rama_con_el_sentinel_arriba:     null
la_marca_de_la_rama_tras_consumir_el_sentinel:  "/mas"
```

Decidido en el click, `masDebajo` sería **falso** ⇒ la **regla 0** ⇒ `panelNavMode('/web' → '/mas')` ⇒ **`push`**: *editar la web → tocar Más → "Salir sin guardar"* aterrizaría en **Más-encima-de-`/web`** y el atrás volvería a `/web`. Eso es **exactamente** el defecto que el criterio 4 prohíbe y que el quick `261006-iey` ya tuvo que arreglar una vez.

**No es un mecanismo nuevo:** es la forma que `branchSecondStep` (`lib/panel-branch.ts`) ya tiene **por el mismo motivo** — *"esa ruta sólo se puede leer estando parado sobre la entrada de Más, o sea después del primer consumo"* —, medida en E-5.

### 2. El nombre `sectionMode` se conserva

El tipo del parámetro se amplió al plan de la rama, pero **el nombre quedó**. Renombrarlo obligaba a editar los tres casos medidos, y el gate de cero borrados existe justamente para que eso no pase: su docblock y sus aserciones son las tres mediciones que justifican todo el mecanismo. Deuda **deliberada y acotada**, declarada con un ⚠ en el docblock: *el tipo dice la verdad; el nombre quedó corto*.

### 3. Un import de TIPO en el módulo que declara no tener imports

`lib/unsaved-changes.ts` abre su encabezado con *"sin React, sin `window`, sin imports"*. Ahora tiene **un** import, **de tipo**, que se borra al compilar. La alternativa era duplicar los cinco valores de `PanelBranchPlan`, o sea crear **un segundo dialecto** de la política — el hueco silencioso que `panelNavMode` documenta como *"la clase de hueco que esta fase viene a cerrar"*. El encabezado quedó corregido y el motivo escrito ahí mismo.

### 4. El sentinel de salida se pregunta por dueño, no por id

La barra usa `isPanelExitEntry(estado, id)` porque **es** la dueña. El guard usa `isExitSentinelOwnedEntry(estado)` porque **no lo es**: sólo necesita saber si la entrada de arriba es una absorbente de salida, para que la regla -1 de `panelBranchPlan` no reemplace sobre ella.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] El diseño del provider que el plan describía aterrizaba con la política vieja en el caso vivo**

- **Found during:** Task 1, paso 1 (la sonda primero)
- **Issue:** el `<action>` pedía calcular el plan de la rama con *"el hecho leído de la entrada de arriba, re-verificado en el momento del click"*. Con el sentinel de cambios sin guardar arriba —que es **la condición del caso vivo**— ese hecho es `null`, así que el plan caía en la regla 0 y "Salir sin guardar" desde `/web` aterrizaba con la política de **un** nivel. El plan **anticipó** esta posibilidad por escrito: *"si la medición no da eso, el diseño del provider se rehace contra lo medido y se deja escrito"*.
- **Fix:** el plan se **re-deriva** en el `popstate` del consumo, parado sobre la entrada de la sección, donde la marca vuelve a ser legible. El contrato de `leaveNavigationPlan` queda igual de ancho (los cinco planes) y sigue siendo el que dice **si hay que consumir primero**; lo que cambió es **cuándo** se decide *cuál* de los cinco.
- **Files modified:** `components/dashboard/unsaved-changes-guard.tsx`, `.planning/debug/probes/panel-back-stack.mjs`, `.planning/debug/pila-de-dos-niveles-medida.md`
- **Verification:** E-8 de la sonda (`dos-consumos-y-reemplazo`, `abajo: [/dashboard, /clients]`, `atras_cae_en: /dashboard`, `mas_quedo_inmediatamente_debajo: false`) — 8/8, rc 0. Y las 9 suites verdes.
- **Committed in:** `5cde71d` (la medición) y `145b8f4` (el diseño)

**2. [Rule 3 — Blocker] La navegación diferida tuvo que armarse INLINE para no dejar un candado existente midiendo nada**

- **Found during:** Task 1, gate 4
- **Issue:** extraer la navegación diferida a un `useCallback` con nombre puso **rojo** el caso `(i)` de la auditoría de fuente de `test/dirty-history.test.ts`, que recorta el cuerpo de `completarSalida` y exige ver ahí el `setLeaveNow(` y **ninguna** llamada al router. El gate tenía razón: un `setLeaveNow` escondido detrás de un callback declarado arriba cumple la intención pero deja el candado sin medir — y ese candado es el que impide que alguien "simplifique" esto navegando desde adentro del evento, que está **medido como roto**.
- **Fix:** la diferida se arma inline en `completarSalida` (`navegar: (href, mode) => setLeaveNow({ href, mode })`), con el motivo escrito donde estaba el callback para que nadie lo vuelva a extraer sin leerlo. **Cero cambios en el test**: el sospechoso era el código, como dice la regla.
- **Files modified:** `components/dashboard/unsaved-changes-guard.tsx`
- **Verification:** gate 4 del Task 1 — 9 archivos / 384 casos verdes, `tsc` limpio, eslint rc 0
- **Committed in:** `145b8f4`

**3. [Rule 3 — Blocker] La IP de la LAN no estaba en la lista de orígenes de dev: la UAT no podía correr**

- **Found during:** Task 3 (preparación del guion)
- **Issue:** medido con `Get-NetIPAddress`, la IP de esta máquina en la LAN es **`192.168.0.10`**, y `allowedDevOrigins` sólo tenía `127.0.0.1`, `192.168.0.7` y `192.168.0.3`. El DHCP volvió a cambiar la asignación (**`.7` → `.3` → `.10`**, ya había cambiado una vez antes). Sin la IP nueva el teléfono pide `_next/*` desde un origin que Next bloquea como cross-origin, **la página no hidrata**, y ninguno de los 21 recorridos reproduce lo que el plan dice — un fallo de **entorno** que se leería como un bug de la fase y que quemaría la sesión de UAT entera, que es el recurso más caro de esta fase.
- **Fix:** se agregó `192.168.0.10` a `allowedDevOrigins`, con la fecha y el método de medición en el comentario. `allowedDevOrigins` es **solo-dev**: cero efecto en el build de producción. El propio comentario del archivo instruía hacerlo (*"si aparece una tercera, se agrega acá"*).
- **Files modified:** `next.config.ts`
- **Verification:** `tsc --noEmit` limpio, `eslint next.config.ts` sin hallazgos, `npm run build` rc 0 (re-corrido después del cambio)
- **Committed in:** `2fc3fcc`

---

**Total deviations:** 3 auto-fixed (1 × Rule 1 — bug; 2 × Rule 3 — bloqueo).
**Impact on plan:** cero alcance nuevo. La primera es el plan haciendo lo que él mismo pidió (medir antes de codear, y rehacer el diseño contra lo medido); las otras dos son bloqueos para que el task cierre y para que la UAT **pueda correrse**. Cero paquetes nuevos, cero migraciones, cero intocables tocados, y ningún test existente editado.

## Issues Encountered

**El piso del carril `pure` del plan estaba desactualizado, y se declara en vez de darse por bueno.** El plan exige `≥1404 casos / ≥75 archivos`. Medido **antes** de escribir una línea: la base real era **1506 casos / 76 archivos**, o sea que ese piso ya estaba satisfecho y no medía nada de este plan. El número honesto de este plan es **1514 casos / 76 archivos** (+8, que son exactamente los 8 casos nuevos), más los **3 declarados para fallar** que son normales. Es el mismo defecto que la wave 3 encontró: un piso copiado en vez de derivado.

**Los otros pisos ya satisfechos antes de este trabajo, también declarados:** del gate 3 del Task 1, `mutaciones crudas de historial EN CÓDIGO = 0`, `leaveNavigationPlan = 2` y `once: true = 1` ya daban verde en la base — son gates de **preservación**, y su valor es que sigan dando eso. Los que de verdad midieron trabajo nuevo son `panel-branch|panelBranchPlan` (0 → **3**) y `: never` (0 → **1**).

## Verificación — los números medidos

| Gate | Exigido | Medido |
|---|---|---|
| Sonda (Task 1 g1, Task 3 g1) | rc 0 · E-8 presente ≥1 | **rc 0 · 8/8 escenarios · E-8 presente** |
| Casos del plan de salida (Task 1 g2) | rc 0 · ≥17 casos · 0 borradas | **rc 0 · 19 casos · 0 borradas** (contra `3789d9a`: 84 agregadas / 0 borradas) |
| Código del provider (Task 1 g3) | crudas 0 · rama ≥1 · plan ≥1 · once ≥1 · never ≥1 | **crudas 0 · rama 3 · plan 2 · once 1 · never 1** |
| Suites + tipos + lint + intocables (Task 1 g4) | rc 0 · 9 archivos · tsc limpio · eslint rc 0 · intocables vacío | **rc 0 · 9 archivos / 384 casos · tsc limpio · eslint rc 0 · intocables vacío** |
| Texto de los requisitos (Task 2 g1) | faltantes 0 · abierta 0 · techo ≥1 · invariante ≥1 · enmienda ≥1 · constante ≥1 · marcadas 0 | **0 · 0 · 1 · 1 · 3 · 4 · 0** |
| Forma de la enmienda (Task 2 g2) | ≥10 agregadas · ≤12 borradas · ≥126 líneas · advertencia ≥1 · 9 filas | **81 · 3 · 204 · 1 · 9** |
| Carril `pure` (Task 3 g2) | rc 0 · ≥1404 casos · ≥75 archivos | **rc 0 · 1514 casos + 3 expected-fail · 76 archivos** |
| Tipos y build (Task 3 g3) | tsc limpio · build rc 0 | **tsc limpio · build rc 0** (re-corrido tras el cambio de `next.config.ts`) |

---

# ⏸ LA UAT EN CELULAR REAL — PENDIENTE, NO APROBADA

> **Estado: PENDIENTE.** El checkpoint del Task 3 es `gate="blocking-human"` y **no se auto-aprobó**.
> El `auto_advance` del workstream está en `true` a nivel global (es el bug del CLI: `auto_advance:
> false` del workstream es **inerte**), así que el bloqueo humano explícito era **la única** protección
> que quedaba. Registrado además como **imprecisión abierta #13** en `.planning/WINDOWS.md`.
>
> **Las casillas de MOB-04, MOB-05 y MOB-06 en `REQUIREMENTS.md` siguen SIN marcar** hasta que esto se
> verifique.

## Por qué esto no es el último checkbox, sino el entregable principal

El modo de falla de esta fase es **silencioso**: la URL cambia y la vista no, o el atrás no hace nada,
o saca del sitio. **Nada de eso lo ve la comprobación de tipos, ni la suite, ni el build.** Así se
encontraron los **7 bugs** de la UAT de v0.30 con el pipeline entero en verde, y así apareció NAV-08.

**Los tres supuestos que ninguna sonda puede cerrar, y que esto cierra:**

| # | Supuesto | Qué pasa si está mal |
|---|---|---|
| **A1** | El efecto que escribe la marca corre **después** de la escritura del router de Next | La marca no se escribe ⇒ **D-03 y el criterio 2 degradan a APILAR EN SILENCIO**. Lo delatan los ítems 4, 5, 6, 7 y 8 |
| **A2** | No hay otro commit del router en vuelo cuando se escribe la marca | Ídem A1, intermitente |
| **A11** | Lo medido vale en **Safari/iOS** y **Chrome Android** reales | Todo lo medido en este repo sobre el retroceso fue **Chrome de escritorio headless**. Hace falta **Android Y iPhone** |

## Qué tiene que levantar el dueño (nada de esto lo puede hacer el plan)

1. **Docker + Supabase local.** `npx supabase start`, y después `npx supabase status` tiene que
   responder. El seed del negocio de prueba vive ahí.
2. **El dev server:** `npm run dev`. ⚠ Si el puerto quedó colgado de una sesión anterior (ya pasó:
   acepta la conexión TCP y no responde), hay que **matar el proceso** antes.
3. **Desde el teléfono, en la misma red Wi-Fi:** `http://192.168.0.10:3000/`
   (o el puerto que imprima `npm run dev`).
   ⚠ **La IP ya quedó agregada** a `allowedDevOrigins` en este plan (commit `2fc3fcc`), pero las IPs
   son **por DHCP**: si el router la cambió otra vez, hay que verificar con `Get-NetIPAddress` y sumar
   la nueva ahí. **Sin eso la página NO HIDRATA y nada de esta fase funciona — y no es un bug de la
   fase.**
4. **Login:** `test@forjo.local` / `Forjo1234!` (seed local, slug `negocio-prueba`).
5. ⚠ **PESTAÑA NUEVA Y RECARGA, siempre.** El estado runtime de esta fase **es la pila del
   navegador**: una pestaña abierta conserva entradas **sin la marca nueva** y además corre **el bundle
   viejo**, así que los recorridos **no reproducen** lo que el plan dice.
6. **Dos teléfonos: Android Chrome Y iPhone Safari.** A11 no se cierra con uno.

## Los 21 recorridos, listos para marcar

### A · Los dos niveles (MOB-04) — los dos recorridos son distintos y los dos son correctos

- [ ] **1.** `Inicio → Más → Finanzas → atrás` ⇒ queda **Más abierto** (no Inicio, y no una pantalla
      intermedia vacía). Un atrás más ⇒ **Inicio**.
- [ ] **2.** `Inicio → Turnos → atrás` ⇒ **Inicio**, sin pasar por Más.

### B · Más apila sobre lo que haya abierto (D-02)

- [ ] **3.** `Inicio → Turnos → Más → atrás` ⇒ **Turnos**.
      *(La pila tiene tres escalones **a propósito**: "dos niveles" es la profundidad de Más y sus
      secciones, **no un techo**.)*

### C · Tocar Más dentro de su rama sube un nivel (D-03)

- [ ] **4.** `Inicio → Más → Finanzas → tocar Más` ⇒ **Más** (no una segunda entrada de Más). Y
      `atrás` ⇒ **Inicio**: salir cuesta lo mismo sin importar por cuántas secciones de Más se pasó.
- [ ] **5.** Pasar por **tres** secciones de Más seguidas (Finanzas → Configuración → Negocio, cada una
      tocando Más en el medio) y después `atrás` ⇒ **Inicio**. Nunca hay que desandar pantallas ya
      dejadas.

### D · El cruce entre los dos niveles (criterio 2) — donde más fácil queda basura

- [ ] **6.** `Inicio → Más → Finanzas → tocar Clientes en la barra → atrás` ⇒ **Inicio** (no Más).
- [ ] **7.** `Inicio → Turnos → Más → Finanzas → tocar Clientes en la barra → atrás` ⇒ **Turnos** (no
      Más, y **no** hace falta apretar atrás dos veces para que pase algo visible).
- [ ] **8.** **El degenerado:** `Inicio → Turnos → Más → Finanzas → tocar Turnos en la barra` ⇒ queda
      en Turnos, y el `atrás` ⇒ **Inicio**, haciendo algo visible la primera vez.
- [ ] **9.** **NAV-08 sigue vivo:** en Clientes con una ficha abierta, tocar **Clientes** en la barra
      ⇒ **cierra la ficha** en vez de apilar.

### E · Cero regresión sobre lo ya verificado (criterio 4) — los cuatro overlays

- [ ] **10.** Con un **overlay** abierto (el alta de turno), el atrás **cierra el overlay** y no navega.
- [ ] **11.** Con el **selector de hora** propio abierto, el atrás lo cierra y no navega.
- [ ] **12.** Con el **campo de fecha / calendario** abierto, el atrás lo cierra y no navega.
- [ ] **13.** Con el **teclado** arriba, el atrás baja el teclado y no navega (**ni aparece el aviso de
      salida**).

### F · Cambios sin guardar — el caso que hoy caería mal

- [ ] **14.** En **`/agenda`** (destino de la barra) con cambios sin guardar, tocar otro destino ⇒
      pregunta antes de descartar; **"Salir sin guardar"** ⇒ aterriza en el destino y el `atrás` cae en
      **Inicio**.
- [ ] **15.** En **`/web`** (sección de la **rama de Más**) con cambios sin guardar, **tocar Más** ⇒
      pregunta; **"Salir sin guardar"** ⇒ aterriza en **Más** (política **nueva**, no la vieja) y el
      `atrás` cae en **Inicio**.
      ⚠ **Es el recorrido que el research encontró vivo**, el defecto que el quick `261006-iey` ya tuvo
      que arreglar una vez, y el que esta wave rediseñó contra lo medido en E-8. **Si algo de esta fase
      va a fallar, es acá.**
- [ ] **16.** En **`/web`** con cambios sin guardar, tocar un **destino de la barra** ⇒ "Salir sin
      guardar" ⇒ aterriza en el destino y el `atrás` cae en **Inicio** (es **la cadena de tres pasos**).
- [ ] **17.** En `/agenda` con cambios sin guardar, **el atrás del sistema** ⇒ sigue avisando, y
      **"Seguir editando"** deja todo como estaba.

### G · El aviso de salida (MOB-05 / D-01) — repetido tres veces

- [ ] **18.** En **Inicio**, `atrás` ⇒ **no sale** y aparece el aviso **abajo, 8px arriba de la
      barra**, en **una sola línea** y legible. `atrás` otra vez ⇒ **sale de verdad**. Salir cuesta
      exactamente **un** atrás más y **nunca** aparecen dos avisos encadenados.
- [ ] **19.** Repetir el ciclo **tres veces seguidas**: sigue funcionando igual las tres.
- [ ] **20.** **Esperar** a que el aviso desaparezca y apretar atrás otra vez ⇒ **vuelve a avisar** (no
      sale sin avisar). Y con un **overlay abierto** en Inicio, el atrás **cierra el overlay** y el
      aviso **no** aparece.
- [ ] **21.** **En escritorio (D-05):** el mismo ciclo, con el aviso **centrado sobre la columna de
      contenido** (no debajo de donde estaría una barra que ahí no existe), legible y sin tapar nada. Y
      el recorrido del **sidebar** da exactamente lo de hoy (**criterio 6**).

### H · Los dos recorridos que ESTA fase cambia a propósito

Declarados para que **el cambio no se reporte como regresión** y para que **una regresión no se lea
como el cambio**:

- **`Más → Inicio → atrás` ⇒ sigue cayendo en Más.** Es la rama de v0.30 (volver a la raíz **empuja**,
  porque reemplazar dejaría dos entradas idénticas). **NO cambió.**
- **`Más → sección → atrás` ⇒ AHORA cae en Más.** En la Phase 2 caía en Inicio y estaba declarado
  correcto *en esa fase*. **Éste es el cambio**, y es MOB-04.

### I · Casos declarados que NO son bugs

- Pegar `/finances` en una pestaña nueva y tocar **Más** ⇒ **apila** (el atrás vuelve a Finanzas). No
  hay Inicio debajo y retroceder expulsaría del sitio: aceptado y documentado desde v0.30 (medido en
  **E-7**).
- Después de volver con el atrás desde una sección, el botón **adelante** del navegador puede llevar a
  una pantalla por la que el dueño pasó. **Es historia honesta**, está medido, y no es basura en el
  camino del atrás.
- En escritorio, pegar `/mas` muestra la lista y su atrás es el mismo de siempre: si Más es un lugar,
  su atrás es igual en todas partes.
- **La URL de Inicio muestra el hash** (`/dashboard#salir`) con el sentinel armado. Es inherente al
  mecanismo —el hash es la condición de existencia de la entrada— y es la forma medida en **E-6**.
- ⚠ **La imprecisión declarada #12, que hay que poder distinguir de un bug.** El sentinel de salida se
  arma estando en la raíz **haya o no haya historia debajo**. Si debajo de Inicio quedó una sección
  —`Inicio → Turnos → Inicio`, que la política empuja en los dos sentidos— el **segundo atrás no sale
  del panel: vuelve a Turnos**, y el copy del aviso queda optimista. **Eso es la imprecisión aceptada,
  no un bug**: no hay forma confiable de preguntarle al navegador *"¿hay algo debajo?"*
  (`history.length` cuenta también el forward). **Sería un bug** si el segundo atrás **no hiciera nada
  visible**, o si **no avisara** y saliera de una. Para probar el ítem 18 **limpio**, entrar a Inicio
  en una pestaña nueva **sin pasar por otra sección antes**.

## Si algo del guion falla

**El hallazgo vale más que el verde del pipeline.** Y si lo que falla es que el dueño **se pierde**
—dos pantallas que se ven igual y se comportan distinto, porque **D-04** decidió no agregar ningún
indicador—, eso **no se arregla acá**: vuelve con evidencia y entra por el **gate de diseño**, que es
exactamente lo que D-04 previó.

## Known Stubs

Ninguno. No hay valores vacíos cableados a la UI, ni texto de relleno, ni componentes sin fuente de
datos en los archivos de este plan.

## Threat Flags

Ninguna. Cero cambios de esquema, policies, queries y migraciones (próxima libre: **080**); cero datos
de otro negocio; cero paquetes nuevos. El único archivo de configuración tocado es `next.config.ts`, y
sólo en `allowedDevOrigins`, que es **solo-dev**.

Las tres amenazas `high` del registro del plan quedan así:

| Threat ID | Estado |
|---|---|
| **T-03-18** (aterrizar con la política vieja ⇒ trabajo descartado **y** lugar equivocado) | **mitigada** — el plan de salida acepta los cinco planes, el provider los ejecuta delegando al mismo ejecutor que la barra, el manejo del tipo es exhaustivo, y la cadena está medida en E-8. **Falta su pata humana: los ítems 15 y 16** |
| **T-03-19** (el provider retrocediendo por su cuenta ⇒ doble consumo) | **mitigada y medida** — `mutaciones crudas de historial EN CÓDIGO = 0` |
| **T-03-20** (la fase marcada como verificada sin que nadie abrió el teléfono) | **mitigada** — el checkpoint es `gate="blocking-human"` y **NO se auto-aprobó**, con `auto_advance` global en `true` |

## Next Phase Readiness

**La fase NO está cerrada.** Las cuatro waves están ejecutadas y sus gates en verde, pero el criterio
que cierra la Phase 3 es la UAT en celular real, y está **pendiente**. Hasta entonces:

- MOB-04, MOB-05 y MOB-06 siguen **sin marcar** en `REQUIREMENTS.md`.
- A1, A2 y A11 siguen **abiertos** y declarados.
- La **Phase 4** (los tabs profundos, MOB-08/09) depende de que la política no se mueva: conviene que
  la UAT la confirme **antes** de planificarla, que es justo el orden que el ROADMAP eligió.

## Self-Check: PASSED

- Archivos modificados, verificados en disco: `lib/unsaved-changes.ts`, `lib/unsaved-changes.test.ts`,
  `components/dashboard/unsaved-changes-guard.tsx`, `.planning/debug/probes/panel-back-stack.mjs`,
  `.planning/debug/pila-de-dos-niveles-medida.md`,
  `.planning/workstreams/panel-nav/REQUIREMENTS.md`, `next.config.ts` — **los 7 presentes**.
- Commits verificados con `git log --oneline --all`: `5cde71d`, `145b8f4`, `4a34cb2`, `2fc3fcc` — **los
  4 presentes**.
- `git rev-list --count 3789d9a..HEAD` = **4**, consistente con los 4 commits listados.
- Todos los `<acceptance_criteria>` / `<automated>` de los tres tasks re-corridos y en verde, con sus
  números en la tabla de arriba.
- `STATE.md` y `ROADMAP.md` **no se tocaron** (los escribe el orquestador).
