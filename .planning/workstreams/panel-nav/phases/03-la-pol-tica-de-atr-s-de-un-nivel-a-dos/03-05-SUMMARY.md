---
phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos"
plan: "05"
subsystem: ui
tags: [history-api, back-button, mobile-nav, next16, vitest, cdp]

# Dependency graph
requires:
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (planes 03-01..03-04)"
    provides: "la sonda CDP con sus ocho escenarios, la marca de la rama (`frjUnder`), el ejecutor de dos pasos del colapso, el sentinel de salida (`frjExit`) y la cadena de tres pasos del guard de cambios sin guardar"
provides:
  - "`writePanelUnder`: el ÚNICO escritor de la marca de la rama, con la regla 0 y la idempotencia en ese orden"
  - "la regla de dirección en `branchMarkDecision`: ningún retroceso escribe la marca, y el hecho entra sin valor por omisión"
  - "el rastreo del retroceso por RUTA de aterrizaje (no por bandera), leído y descartado en toda corrida del efecto de marcado"
  - "el canal de propagación del colapso: un productor (el ejecutor), un consumidor (`applyBranchMarkRequest`), consumido sólo en el destino que lo pidió"
  - "E-11: el escenario de sonda que cruza el sentinel de salida con la marca de la rama y deja la mentira del par de rutas medida como número"
affects: ["03-06 (la decisión (a) del dueño se contesta LEYENDO esta marca)", "03-07", "03-08", "panel-nav ronda 2 de UAT"]

actuals:
  tokens: 67076
  tasks: 3
  commits: 5
plan_head_before: 2a41cc1941410299182b7f8894c55bd85c317642

tech-stack:
  added: []
  patterns:
    - "Escritor único con guardas en orden: la regla 0 y la idempotencia viven en UN lugar y los demás caminos se re-expresan sobre él"
    - "Rastreo de un gesto por la RUTA en la que aterrizó, nunca por una bandera, cuando el consumidor es un efecto que depende de esa ruta"
    - "Canal de propagación a nivel de módulo: un productor, un consumidor, consumo condicionado al destino que lo pidió y descarte incondicional"
    - "Hecho de la pila como parámetro sin valor por omisión: un call site que lo olvide no compila"

key-files:
  created: []
  modified:
    - "lib/panel-history.ts"
    - "lib/panel-history.test.ts"
    - "lib/panel-branch.ts"
    - "test/panel-branch.test.ts"
    - ".planning/debug/probes/panel-back-stack.mjs"
    - ".planning/debug/pila-de-dos-niveles-medida.md"

key-decisions:
  - "La marca de la rama dice la verdad o no dice nada: sin ruta real de abajo NO se deriva ninguna, aunque eso deje la pila un escalón más larga"
  - "El rastreo del retroceso guarda la RUTA del aterrizaje y no un booleano: el retroceso que el sentinel absorbe en Inicio no cambia la ruta, el efecto de marcado no vuelve a correr, y una bandera suprimiría el próximo empuje legítimo en silencio"
  - "Con el dato propagado presente la decisión de marcado NO se consulta: el dato viene de haber LEÍDO la entrada de abajo y es más preciso que cualquier derivación del par de rutas"
  - "`panelUnderState` pasa de `export function` a `export const` para que el candado de un-solo-constructor cuente call sites y no su propia declaración"
  - "El prefijo `OK ` del arnés de la sonda es contrato con los gates de 03-05..03-08, no cosmética"

patterns-established:
  - "Gate de región que mide una MENTIRA como número: la ruta que una derivación produciría, la ruta real, y la afirmación de que no coinciden"
  - "Candado de atrás muerto comparado por PATHNAME y no por ruta completa, con el par del sentinel declarado como la única excepción admitida"

requirements-completed: [MOB-04, MOB-06]

coverage:
  - id: D1
    description: "La sonda CDP mide la intersección que faltaba: el sentinel de salida al fondo, la rama de Más encima y el colapso, en la misma pila (el recorrido D7 de la UAT), con la mentira del par de rutas medida como número y el atrás muerto comparado por pathname"
    requirement: "MOB-04"
    verification:
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs (9 escenarios, rc 0, OK E-11 en los 18 valores)"
        status: pass
      - kind: other
        ref: "gate de región sobre E-11: cruza el sentinel=3, cruza la marca de la rama=4, mide la mentira=5, compara por pathname=14"
        status: pass
    human_judgment: false
  - id: D2
    description: "Un solo escritor de la marca de la rama, con la regla 0 primero y la idempotencia después; `applyPanelUnder` conserva su firma y su semántica y delega en vez de duplicar"
    requirement: "MOB-06"
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts (122 casos, rc 0) — describe 'writePanelUnder — EL ÚNICO ESCRITOR de la marca'"
        status: pass
      - kind: other
        ref: "gate de región: escritor exportado=1, regla 0=1, idempotencia=1, escribe=1, applyPanelUnder duplica regla 0=0 / duplica escritura=0, usos del constructor en código=1"
        status: pass
    human_judgment: false
  - id: D3
    description: "Ningún retroceso escribe la marca: el hecho entra en la decisión sin valor por omisión y la regla va primera, y el rastreo guarda la ruta del aterrizaje"
    requirement: "MOB-04"
    verification:
      - kind: unit
        ref: "test/panel-branch.test.ts (66 casos, rc 0) — describes 'la REGLA DE DIRECCIÓN' y 'el RASTREO del retroceso'"
        status: pass
      - kind: other
        ref: "gate de región sobre branchMarkDecision: retornos=5, conoce el hecho del retroceso=5; módulo: temporizadores=1, enganches del retroceso=6"
        status: pass
    human_judgment: false
  - id: D4
    description: "El reemplazo del colapso propaga la ruta REAL de abajo por un canal único con un consumidor único, y el provider del guard de cambios sin guardar hereda el arreglo sin tocarse"
    requirement: "MOB-04"
    verification:
      - kind: unit
        ref: "test/panel-branch.test.ts — describes 'la PROPAGACIÓN del colapso' y 'el canal es UNO y el consumidor es UNO', incluido el caso con nombre propio 'EL CASO DE LA UAT (G-3 / D7)'"
        status: pass
      - kind: other
        ref: "candado de alcance: git status sobre los 6 intocables del plan + scripts/con-turno.mjs, vacío"
        status: pass
    human_judgment: false
  - id: D5
    description: "El comportamiento en un teléfono real: `Inicio → Turnos → Más → Finanzas → tocar Clientes` aterriza sin recargar, el atrás cae en Turnos, y `/web` con cambios sin guardar → Más → Salir sin guardar aterriza en Más"
    requirement: "MOB-04"
    verification: []
    human_judgment: true
    rationale: "Es el must_have declarado `verification: backstop` del plan. El modo de falla de esta fase es silencioso y A1/A2/A11 siguen abiertos: ni la sonda (su propio servidor estático, sin router de Next) ni la suite pura pueden observar el orden del efecto contra la escritura del router, ni Chrome Android / Safari iOS reales. Además la decisión (a) del dueño —que gobierna H, G19 y G20— la implementa 03-06, así que la UAT de la ronda 2 sólo tiene sentido con los cuatro planes de la tanda cerrados."

duration: 36 min
completed: 2026-10-23
status: complete
---

# Phase 3 Plan 05: La marca de la rama dice la verdad o no dice nada — Summary

**La marca `frjUnder` dejó de derivarse del par de rutas: un solo escritor con la regla 0 y la idempotencia en orden, una regla de dirección que impide que cualquiera de los tres retrocesos del sistema escriba, y un canal por el que el colapso propaga la ruta que LEYÓ en la entrada de Más — más el escenario de sonda E-11, que cruza el sentinel de salida con la marca de la rama y deja la mentira del par de rutas medida como número.**

## Performance

- **Duration:** 36 min
- **Started:** 2026-10-23T20:58:00Z (aprox.)
- **Completed:** 2026-10-23T21:34:45Z
- **Tasks:** 3 de 3
- **Files modified:** 6 (0 creados)

## Accomplishments

- **La causa raíz de G-3 está cerrada en código y medida en dos instrumentos.** `frjUnder` se derivaba del par de rutas, y el par no sabe qué pasó de verdad: con un retroceso, con el reemplazo del colapso y con el de la política dice `push` igual. Ahora un retroceso **nunca** escribe (regla de dirección, primera y sin valor por omisión), una entrada que **ya lleva** marca no se re-marca (idempotencia, la segunda red), y el reemplazo del colapso anota la **ruta real de abajo** en vez de la ruta de Más.
- **Se cerró la divergencia entre la sonda y la app que ningún gate veía.** La sonda propagaba la marca en el reemplazo desde el plan 03-01 (`colapsar`, línea 221) y E-5 lo afirmaba; **la app no lo hacía**. El diseño medido y el implementado no eran el mismo. Ahora lo son, y el canal de propagación es el que los une.
- **E-11 mide la intersección que explica el 8/8 con el teléfono rojo.** El sentinel de salida al fondo (`frjExit`) × la rama de Más (`frjUnder`) × el colapso, en la misma pila — el recorrido **D7** de la UAT. Entre sus 18 valores esperados están los tres que dejan la mentira **medida como número**: la ruta que el par derivaría (`/mas`), la ruta real de abajo (`/appointments`), y que **no coinciden**.
- **El candado del atrás muerto se compara por pathname.** `/dashboard` y `/dashboard#salir` son rutas **distintas** y pantallas **iguales**: comparadas como lo hace E-5 —por ruta completa— el candado pasaría en falso sobre exactamente el atrás que no hace nada visible.
- **Alcance respetado:** cero paquetes nuevos, cero migraciones (la próxima libre sigue siendo la **080**), cero affordance visible nuevo (D-04), **un** temporizador en `lib/panel-branch.ts`, y los seis intocables del plan más `scripts/con-turno.mjs` sin una línea tocada.

## Task Commits

1. **Task 1: la sonda mide la intersección (E-11)** — `61f9266` (test)
2. **Task 2: un solo escritor de la marca** — `80ba9f2` (test, RED) → `28a4e6c` (feat, GREEN)
3. **Task 3: la dirección y la propagación** — `cce039d` (test, RED) → `0e13d1f` (feat, GREEN)

Sin commits de REFACTOR: en los dos tasks con TDD la implementación GREEN ya quedó mínima y limpia (el único retoque fue quitar dos `?.` del drenaje del `afterEach`, que viajó en el commit GREEN del task 3 por ser del mismo archivo de tests).

**Plan metadata:** ver el commit `docs(03-05)` que sigue a este archivo.

## Files Created/Modified

- `.planning/debug/probes/panel-back-stack.mjs` — el escenario **E-11** (la pila de D7, la mentira del par de rutas como número, el atrás muerto por pathname, el sentinel al fondo con su clave viva), E-11 en la línea de supuestos cerrados del veredicto, y el prefijo del arnés alineado con los gates de la tanda.
- `.planning/debug/pila-de-dos-niveles-medida.md` — la medición de E-11 pegada tal cual salió, la sección **"⚠ POR QUÉ EL 8/8 ERA VERDAD Y NO ALCANZABA"**, y el título actualizado a nueve mediciones.
- `lib/panel-history.ts` — `writePanelUnder` (el escritor único, en la sección del ejecutor), `applyPanelUnder` re-expresado sobre él, `panelUnderState` como `const`, y la lista de "quién borra esta marca" ampliada con la cuarta causa: **nosotros mismos**.
- `lib/panel-history.test.ts` — 10 casos nuevos (112 → 122), con el par contrapuesto adyacente "ya hay marca" vs "entrada ajena" y el contrapuesto que protege v0.30.
- `lib/panel-branch.ts` — la regla de dirección, el rastreo del retroceso por ruta, el canal de propagación con su único consumidor, y el efecto nuevo que anota el aterrizaje.
- `test/panel-branch.test.ts` — 19 casos nuevos (47 → 66), con el caso de la UAT con nombre propio y las dos auditorías de alcance.

## Decisions Made

1. **Sin ruta real de abajo, no se deriva ninguna.** Si la marca de la entrada de Más se había perdido, el canal escribe **nada** en vez de la ruta de Más. Quedarse sin marca deja una pila un escalón más larga —la degradación segura de toda la fase—; una marca falsa deja al dueño **fuera del sitio**.
2. **El pedido se descarta siempre, coincida o no.** Un pedido que sobrevive a una navegación que no ocurrió escribiría una marca rancia en una entrada ajena: el mismo bug, del otro lado.
3. **El rastreo es independiente de `drawsExitHint`.** El aviso es de MOB-05; la dirección es de la **política**, y la política no se negocia por consumidor.
4. **El candado de un solo dueño por entrada va antes de tocar los dos canales.** Una instancia que no es la dueña no escribe **ni se come** el dato de la que sí lo es.
5. **El par del sentinel es la única excepción admitida del candado de pathnames repetidos**, y está declarada como valor esperado en vez de silenciada: el sentinel es una entrada **absorbente** y su "nada visible" lo cubre el aviso de MOB-05.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] El gate del escritor único no podía dar verde con `panelUnderState` declarado como `export function`**

- **Found during:** Task 2
- **Issue:** El gate exige `usos del constructor del estado EN CODIGO en todo el archivo = 1`, contando `panelUnderState\(` sobre líneas no-comentario. **Medido hoy: 2** — la **declaración** (`export function panelUnderState(route…`) matchea el mismo regex que un call site. Con un único call site el número mínimo alcanzable era 2, así que el objetivo era inalcanzable con esa forma de declaración. El `fails_when` del propio gate dice *"hay un segundo punto de escritura de la marca"*, y una declaración **no** es un punto de escritura: el regex no medía lo que el gate dice medir.
- **Fix:** `panelUnderState` pasó a `export const panelUnderState = (route: string): PanelUnderState => ({ frjUnder: route })`. El conteo pasa a ver **sólo** call sites, que es la propiedad que el gate declara, y **el gate conserva sus dientes**: un segundo call site lo pone rojo igual. El **por qué** quedó escrito en el docblock para que nadie lo "arregle" de vuelta.
- **Files modified:** `lib/panel-history.ts`
- **Verification:** gate de Task 2 en verde con los números medidos (`usos del constructor EN CODIGO=1`), 122/122 en la suite del módulo, `tsc` y `eslint` limpios. **El gate NO se editó.**
- **Committed in:** `28a4e6c`

**2. [Rule 3 - Blocker] El gate de la sonda contaba líneas `^OK  E-n` que el arnés nunca imprimió**

- **Found during:** Task 1
- **Issue:** El arnés imprimía `` `${ok ? 'OK  ' : 'FALLA'} ${esc.id}` `` — `OK` + dos espacios **más** el espacio de la plantilla = **TRES** espacios. Los gates de los **cuatro** planes de esta tanda (`03-05`, `03-06`, `03-07`, `03-08`) cuentan con `grep -cE '^OK  E-…'`, o sea **dos** espacios. Medido: con la sonda en **9/9 y rc 0**, los cuatro gates medían **cero**. Un gate que no mide es peor que no tenerlo.
- **Fix:** el prefijo pasó a `'OK '`, así la línea sale `OK  E-11`. Teeth intactos: el gate sigue exigiendo `rc = 0` **y** que el escenario esté en `OK`. Y el arreglo **desbloquea los otros tres planes** en vez de dejarles el mismo rojo falso. Queda un comentario en el arnés diciendo que el prefijo es contrato con los gates, no cosmética.
- **Files modified:** `.planning/debug/probes/panel-back-stack.mjs`
- **Verification:** `rc=0`, `E-11 coincide con lo esperado=1`, `escenarios en OK=9`. **El gate NO se editó.**
- **Committed in:** `61f9266`

---

**Total deviations:** 2 auto-fijadas (2 × Rule 3 — bloqueantes de medición). Ninguna cambió una expectativa ni debilitó un candado: las dos hicieron que un instrumento midiera lo que dice medir.
**Impact on plan:** nulo sobre el alcance. Cero scope creep, cero paquetes, cero migraciones. La segunda deviation además **arregla por adelantado** el mismo falso-verde en los gates de `03-06`, `03-07` y `03-08`.

## Pisos que ya estaban satisfechos antes del trabajo

Honestidad sobre los gates, que es lo que el plan pide dos veces:

- **`explica por que el verde anterior no alcanzaba` (gate 3 del Task 1):** el contador `grep -ciE '8/8|…'` ya daba **≥1** antes de tocar nada, porque el `## Current Focus` del documento dice "8/8". La sección nueva se escribió igual —la pide el `<done>`— pero **ese contador no la mide**: el que sí mordía era `titulo viejo de ocho mediciones = 0`.
- **Las dos auditorías de alcance del canal (Task 3):** "el provider del guard no lo cablea" y "la barra tampoco" pasaban **antes** de escribir el canal, porque los nombres no existían. Quedan como **candado anti-regresión**, no como prueba de que algo se construyó.
- Todos los demás pisos estaban rojos antes y verdes después, con los números en el reporte.

## Issues Encountered

Ninguno más allá de las dos deviations. El turno de pantalla estaba libre en las dos corridas de la sonda (sin espera). Los dos canarios de reloj de la suite no se activaron: la hora de Argentina en toda la ejecución fue **~06:10–06:35**, dentro de la ventana [01:00, 23:30].

## STATE.md / ROADMAP.md / REQUIREMENTS.md

- **`STATE.md` y `ROADMAP.md`: NO tocados** — los escribe el orquestador.
- **`REQUIREMENTS.md`: NO tocado, y a propósito.** `MOB-04` y `MOB-06` los declaran también `03-06`, `03-07` y `03-08`, que todavía no tienen SUMMARY, así que el gate de ID compartido (#2388) los bloquea. Y coincide con lo que la UAT dejó escrito: *"MOB-04, MOB-05 y MOB-06 siguen SIN marcar. La fase no cierra hasta que los 6 gaps estén cerrados"*.
- **Las casillas marcadas a mano en `03-04-SUMMARY.md`: sin tocar.** Son el registro de primera mano del dueño y están commiteadas en `7c756a5`.

## Known Stubs

Ninguno. Cero valores vacíos hardcodeados, cero placeholders, cero `TODO`/`FIXME` nuevos, cero tests salteados, y los nueve `<verify>` del plan se corrieron de verdad.

## Threat Flags

Ninguna superficie de seguridad nueva. La fase no toca datos de ningún negocio: superficie autenticada, cero cambios de esquema, policies o queries, y cero migraciones. Los seis `mitigate` del `<threat_model>` quedaron cubiertos:

| Threat | Cómo quedó cerrado |
|---|---|
| T-03-21 (spoofing de la pila) | regla de dirección **primera** y sin valor por omisión, más la idempotencia como segunda red |
| T-03-22 (tampering de la entrada revelada) | guarda de idempotencia dentro del escritor único, con su par de tests contrapuestos adyacentes |
| T-03-23 (repudiation de la medición) | E-11 cruza el sentinel con la marca de la rama, mide la mentira como número y compara el atrás muerto por pathname |
| T-03-24 (EoP del canal) | el pedido se consume **sólo** en el destino que lo pidió y se descarta siempre, con el contrapuesto como test |
| T-03-25 (DoS del gesto) | el rastreo guarda **la ruta** del aterrizaje; test con nombre propio para el retroceso que no cambia de ruta |
| T-03-26 (tampering del contrato de diseño) | gate de **exactamente un** temporizador en verde (medido = 1); el diferimiento va por estado y un efecto |

## Next Phase Readiness

**Listo para `03-06`, y en el orden correcto.** La decisión (a) del dueño —el sentinel se arma **sólo si no hay nada nuestro debajo**— se contesta **leyendo `frjUnder`**, y esa marca ya dejó de mentir. Si `03-06` se hubiera ejecutado primero, tras `Inicio → Turnos → atrás` la entrada de Inicio habría quedado marcada **sin tener nada debajo**, (a) habría decidido "no armar" y el atrás habría salido del panel sin avisar: un **G-5 nuevo fabricado por el arreglo**.

**Lo que sigue abierto, y no lo cierra este plan:**

- **G-4 / G-5 / G-6** (la colisión de diseño y el armado del sentinel) → plan `03-06`, con los escenarios **E-9**, **E-10** y **E-12**.
- **G-1 y G-2** quedan cerrados **a medias**: este plan sacó la marca rancia del medio; la recarga del cruce y el atrás muerto del degenerado son de los planes siguientes.
- **A1, A2 y A11** siguen abiertos: ni la sonda (servidor estático propio, sin router de Next) ni la suite pura pueden observar el orden del efecto contra la escritura del router, ni los dos motores reales.
- **La ronda 2 de UAT** —la parte de overlay del ítem 20 y el pase completo de iPhone— sigue pendiente hasta que los cuatro planes de la tanda estén cerrados.

## Self-Check: PASSED

- `.planning/debug/probes/panel-back-stack.mjs` — FOUND (modificado), E-11 declarado 1 vez, sonda rc 0 con 9/9
- `.planning/debug/pila-de-dos-niveles-medida.md` — FOUND, `### E-11` presente, título viejo en 0
- `lib/panel-history.ts` — FOUND, `writePanelUnder` exportado 1 vez
- `lib/panel-history.test.ts` — FOUND, 122 casos verdes
- `lib/panel-branch.ts` — FOUND, 1 temporizador, 6 enganches de `popstate`
- `test/panel-branch.test.ts` — FOUND, 66 casos verdes
- Commits `61f9266`, `80ba9f2`, `28a4e6c`, `cce039d`, `0e13d1f` — los cinco presentes en `git log`
- Carril puro completo: **1543 pasados + 3 expected-fail / 76 archivos**, rc 0
- `tsc --noEmit` sin una línea `error TS` fuera de `.next/`; `eslint` rc 0

---
*Phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos*
*Completed: 2026-10-23*
