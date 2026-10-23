---
phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos"
plan: "06"
subsystem: ui
tags: [history-api, back-button, mobile-nav, next16, vitest, cdp]

# Dependency graph
requires:
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-05)"
    provides: "`writePanelUnder` como escritor único, la regla de dirección y la propagación del colapso — o sea la marca de la rama DICIENDO LA VERDAD, que es el dato con el que la decisión (a) se contesta"
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (planes 03-01..03-04)"
    provides: "la sonda CDP con su arnés, el sentinel de salida (`frjExit`), el ejecutor de dos pasos del colapso, y el ejecutor exhaustivo del provider del guard de cambios sin guardar"
provides:
  - "la DECISIÓN (a) del dueño: `panelExitArmAction` con SEIS reglas en orden y la de política ÚLTIMA, más su límite aceptado escrito en el módulo y en el documento de debug"
  - "el SEXTO miembro de `PanelBranchPlan` (`consume-exit-then-navigate`), producido por la decisión pura con tres hechos y con la regla entre la -1 y la 0"
  - "`consumeOwnedExitSentinel`: la tercera función hermana de retroceso guardado, que pregunta por la marca de ESTA instancia"
  - "la rama de dos pasos del ejecutor, con `exitId` OPCIONAL como mecanismo de degradación del consumidor que no es dueño del sentinel"
  - "E-9, E-10 y E-12: el entierro contra el consumo (las dos formas medidas), las dos mitades de (a), y el degenerado con el primer atrás cambiando de pantalla"
affects: ["03-07", "03-08 (el límite aceptado de (a) va al registro de imprecisiones)", "panel-nav ronda 2 de UAT"]

actuals:
  tokens: 18517
  tasks: 3
  commits: 6
plan_head_before: 4e1e7f25fdd213b87bc6b66e7c46bdb1176ebbb2

tech-stack:
  added: []
  patterns:
    - "Regla de POLÍTICA siempre después de las de SEGURIDAD en una decisión pura ordenada: así la regla de política nunca lee un dato en un estado donde ese dato no significa nada"
    - "Función hermana de retroceso guardado por dueño: una por marca, cada una re-verificando SU marca justo antes del `back()`, y la del sentinel preguntando por la INSTANCIA y no sólo por el dueño"
    - "Parámetro OPCIONAL como mecanismo de degradación declarado: sin el identificador de dueño la rama se niega, y el consumidor que no es dueño cae en el camino seguro sin un `if` que lo nombre"
    - "Límite de una decisión de producto escrito en el código, en el instrumento de medición y en el registro de imprecisiones — en vez de descubierto en la UAT siguiente"

key-files:
  created: []
  modified:
    - ".planning/debug/probes/panel-back-stack.mjs"
    - ".planning/debug/pila-de-dos-niveles-medida.md"
    - "lib/panel-branch.ts"
    - "test/panel-branch.test.ts"
    - "lib/panel-history.ts"
    - "lib/panel-history.test.ts"
    - "components/dashboard/unsaved-changes-guard.tsx"
    - "lib/unsaved-changes.ts"
    - "lib/unsaved-changes.test.ts"

key-decisions:
  - "La regla de (a) va ÚLTIMA entre las seis, y el orden es el argumento: las cinco anteriores son de SEGURIDAD y ésta es de POLÍTICA. Puesta última nunca lee la marca de la rama estando parados sobre el sentinel, donde ese dato no significa nada porque el state del sentinel lleva sólo su propia clave"
  - "La pregunta '¿hay algo nuestro debajo?' se contesta con `frjUnder` —que YA guarda la ruta— y no con una clave nueva: una cuarta clave sería un cuarto dueño sin necesidad, y la regla 0 tiene tres a propósito"
  - "El límite de (a) (la entrada AJENA) queda ESCRITO en tres lugares, no intentado: no hay API confiable porque `history.length` cuenta también las entradas de adelante"
  - "El sexto miembro entra EN EL TIPO y no al lado: es lo que hace que el chequeo de exhaustividad del provider no compile hasta que alguien decida qué hace con él"
  - "El consumo del sentinel pregunta por la marca de ESTA INSTANCIA y no sólo por el dueño: dos dueños por la misma entrada descuadran el conteo de retrocesos"
  - "`exitId` es OPCIONAL a propósito, y esa opcionalidad ES la degradación: sin él la rama se niega y el provider del guard navega con la regla de rutas en vez de retroceder sobre una entrada ajena"
  - "El dominio se suelta ANTES de delegar al ejecutor, no después: si no, el retroceso deliberado se lee como el atrás del dueño y el aviso de salida salta al tocar un destino de la barra"

requirements-completed: [MOB-04, MOB-05, MOB-06]

coverage:
  - id: D1
    description: "La sonda mide el entierro del sentinel con las DOS formas al lado (E-9): la vieja —empujar el destino encima— con la booleana del atrás muerto en verdadero, y la nueva —consumirlo primero— con dos escalones, el sentinel fuera del camino del atrás y cero pares de pathnames repetidos"
    requirement: "MOB-04"
    verification:
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs (12 escenarios, rc 0, OK E-9 en sus 15 valores)"
        status: pass
      - kind: other
        ref: "gate de región sobre E-9: cruza el sentinel=2, compara por pathname=17, mide la forma vieja=23"
        status: pass
    human_judgment: false
  - id: D2
    description: "La sonda mide las dos mitades de la decisión (a) (E-10) con las seis condiciones en orden escritas en el escenario, más el candado del orden entre *ya estoy armado* y (a); y el degenerado con el sentinel al fondo (E-12) con la clave de G-2: que el primer atrás CAMBIA de pathname"
    requirement: "MOB-05"
    verification:
      - kind: e2e
        ref: "la misma corrida: OK E-10 (10 valores) y OK E-12 (15 valores), `el_primer_atras_cambia_de_pathname: true`"
        status: pass
      - kind: other
        ref: "gate de región: E-10 lee la marca de la rama=4 y decide armar o no=15; E-12 cruza el sentinel=1 y compara por pathname=24; E-6 y E-11 intactos (1 y 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "La decisión de armado tiene SEIS reglas en orden con la de (a) última y su hecho sin valor por omisión; el hook la alimenta leyendo la marca de la rama del estado REAL de la entrada de arriba; y el párrafo de la imprecisión vieja quedó reemplazado por el límite aceptado"
    requirement: "MOB-05"
    verification:
      - kind: unit
        ref: "test/panel-branch.test.ts (74 casos, rc 0) — describe 'la DECISIÓN (a) — el sentinel se arma SÓLO si no hay nada nuestro debajo', incluidos el caso del ítem H y el que fija el orden"
        status: pass
      - kind: other
        ref: "gate de región: reglas que no arman=6, única salida que arma=1, la decisión conoce el hecho=7, el armado lee la marca=1, temporizadores=1, gate de viewport=0, nombra la decisión=1, cita E-10=3"
        status: pass
    human_judgment: false
  - id: D4
    description: "El tipo del plan de rama tiene un sexto miembro producido por la decisión pura con sus tres hechos, con la regla entre la -1 y la 0, y sin cambiar ninguna rama de hoy fuera de la raíz"
    requirement: "MOB-04"
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts (130 casos, rc 0) — describe 'panelBranchPlan — el SEXTO miembro', con los tres negativos (uno por hecho faltante) y el barrido de no regresión"
        status: pass
      - kind: other
        ref: "gate de región: miembros literales del tipo=4, retornos en la decisión=6, usa la raíz=4"
        status: pass
    human_judgment: false
  - id: D5
    description: "El consumo guardado del sentinel propio y la rama de dos pasos del ejecutor: disparo único, desenganche a mano cuando el consumo se niega, navegación pedida desde el evento con el modo de la política, y la negativa sin identificador de dueño"
    requirement: "MOB-06"
    verification:
      - kind: unit
        ref: "test/panel-branch.test.ts — describes 'consumeOwnedExitSentinel' y 'runBranchNavigation — CONSUMIR EL SENTINEL y recién entonces navegar', con el caso de G-1 con nombre propio"
        status: pass
      - kind: other
        ref: "gate de región: consumo exportado=1, usos=2, usos del predicado=6, enganches de popstate=8, temporizadores=1; DENTRO del ejecutor: disparo único=2, desenganche a mano=2, identificador opcional=4"
        status: pass
    human_judgment: false
  - id: D6
    description: "El dominio se suelta ANTES del retroceso deliberado, y el provider del guard declara el miembro nuevo con su degradación sin perder el chequeo de exhaustividad ni ganar una sola mutación cruda de historial"
    requirement: "MOB-06"
    verification:
      - kind: unit
        ref: "test/panel-branch.test.ts — describe 'el DOMINIO se suelta ANTES del retroceso deliberado, y el otro consumidor DEGRADA' (auditoría de ORDEN sobre el fuente del hook: el apagado va antes de la llamada al ejecutor)"
        status: pass
      - kind: other
        ref: "gate de región sobre el provider: líneas del recorte=53 (<120), ramas declaradas=6, chequeo de exhaustividad=1, mutaciones crudas de historial=0"
        status: pass
    human_judgment: false
  - id: D7
    description: "Cero regresión en todo el carril puro, tipos y lint limpios, y los seis intocables más el envoltorio del turno de pantalla sin una línea tocada"
    requirement: "MOB-06"
    verification:
      - kind: unit
        ref: "npx vitest run --project pure ⇒ 1574 pasados + 3 expected-fail / 76 archivos, rc 0 (base medida hoy: 1543 + 3 / 76)"
        status: pass
      - kind: other
        ref: "tsc --noEmit sin una línea `error TS` fuera de `.next/`; eslint rc 0 sobre los 7 archivos tocados; git status vacío sobre los intocables + scripts/con-turno.mjs + los dos archivos de tokens"
        status: pass
    human_judgment: false
  - id: D8
    description: "El comportamiento en un teléfono real: `Más → Inicio → atrás` vuelve a Más; entrando directo a Inicio el primer atrás avisa; `Inicio → Turnos → Más → Finanzas → tocar Clientes → atrás` cae en Turnos haciendo algo visible al primer toque y sin aterrizar nunca en una URL con el hash del sentinel"
    requirement: "MOB-04"
    verification: []
    human_judgment: true
    rationale: "Son los dos must_haves declarados `verification: backstop` del plan. Ni la sonda (su propio servidor estático, sin router de Next) ni la suite pura pueden observar el orden del efecto contra la escritura del router (A1/A2) ni los motores reales (A11). Y hay un agravante propio de este plan: los ítems 1-5 de la UAT PASARON y los cinco empiezan con un toque desde Inicio con el sentinel armado — o sea que este plan CAMBIA un camino que hoy funciona, y su modo de falla nuevo es silencioso. Por eso esos cinco vuelven a la UAT en el plan 03-08, mirando la URL."

duration: 31 min
completed: 2026-10-23
status: complete
---

# Phase 3 Plan 06: La decisión (a) del dueño, y el sentinel que no se queda enterrado — Summary

**La colisión que la UAT destapó queda resuelta en la dirección que el dueño eligió —el sentinel de salida se arma sólo si no hay nada nuestro debajo, como sexta y última regla, con su límite escrito en tres lugares— y la entrada ya armada deja de quedar enterrada al salir de la raíz: un sexto miembro del plan de rama, producido por la decisión pura con tres hechos, que el ejecutor corre en dos pasos soltando el dominio antes de retroceder.**

## Performance

- **Duration:** 31 min
- **Started:** 2026-10-23T21:36:00Z (aprox.)
- **Completed:** 2026-10-23T22:07:00Z
- **Tasks:** 3 de 3
- **Files modified:** 9 (0 creados)

## Accomplishments

- **La decisión (a) está implementada tal cual, y su orden es parte del diseño.** `panelExitArmAction` pasó de cinco reglas a **seis**, con la de (a) **última**: las cinco anteriores son de **seguridad** (nadie a quien avisar, lugar equivocado, ventana abierta, ya armado, la entrada de arriba es de otro dueño) y ésta es de **política**. Puesta última, **nunca** lee la marca de la rama estando parados sobre el sentinel, donde ese dato no significa nada porque el state del sentinel lleva **sólo su propia clave**. Ese orden tiene su caso de test con nombre propio.
- **La pregunta se contesta con lo que ya existía.** `frjUnder` guarda **la ruta** que quedó debajo —no un booleano—, así que estando en la raíz la respuesta es *la entrada de arriba lleva nuestra marca de rama*. Cero claves nuevas en la pila: la regla 0 sigue con **tres** dueños.
- **El límite de (a) quedó escrito, no intentado.** Si lo que quedó debajo es una entrada **ajena** (otro sitio) no hay forma confiable de saberlo —`history.length` cuenta **también las entradas de adelante**— y el aviso va a aparecer igual. Está declarado en el docblock de `panelExitArmAction`, en el encabezado del sentinel (reemplazando el párrafo de la imprecisión vieja), y en su propia sección del documento de debug. El registro de imprecisiones (`WINDOWS.md`) lo cierra el plan `03-08`, que es su dueño.
- **El sentinel dejó de quedar enterrado, y el bug viejo quedó medido al lado del arreglo.** `PanelBranchPlan` ganó un **sexto** miembro —`consume-exit-then-navigate`— producido por la decisión pura con **tres** hechos (sentinel arriba, en la **raíz**, destino **distinto**), con la regla **después** de la -1 y **antes** de la 0: ahí el hecho de la rama es falso, la decisión caería en **empujar**, y el sentinel quedaría enterrado — que es justo el bug. **E-9** mide las **dos** formas en el mismo escenario, con la booleana del atrás muerto de la forma vieja declarada en **verdadero**.
- **El ejecutor corre la rama en dos pasos, con las tres guardas medidas.** Consumo guardado por la marca de **esta instancia** (`consumeOwnedExitSentinel`, la tercera función hermana), listener enganchado **en el gesto** y con **disparo único**, **desenganche a mano** si el consumo se niega, y la navegación **pedida desde el evento** con el modo que da la política de rutas para el tramo raíz → destino.
- **El dominio se suelta ANTES de delegar**, así que tocar un destino de la barra **no** puede mostrar el aviso de salida: sin eso, el retroceso deliberado habría llegado a la decisión del retroceso con el hecho de *sentinel vivo* encendido y se habría leído como el atrás del dueño — un bug nuevo fabricado por el arreglo. El caso es una auditoría de **orden** sobre el fuente.
- **El otro consumidor degrada, y está declarado con test.** `exitId` entra como parámetro **opcional** y esa opcionalidad **es** el mecanismo: sin él la rama se niega y el call site navega con la regla de rutas. El provider del guard de cambios sin guardar declara el miembro nuevo en su ejecutor exhaustivo —con el por qué de que su respuesta correcta sea **degradar**— y sigue con **cero** mutaciones crudas de historial.
- **La sonda pasó de nueve a doce escenarios, todos en verde.** E-9, E-10 y E-12 comparan **por pathname** (dos entradas de la raíz, una con el hash del sentinel y otra sin él, son rutas distintas y pantallas iguales). **E-6 y E-11 intactos.**
- **Alcance respetado:** cero paquetes nuevos, cero migraciones (la próxima libre sigue siendo la **080**), cero affordance visible nuevo (D-04), **cero** gate de ancho de pantalla (D-05), **un** temporizador en `lib/panel-branch.ts`, y los seis intocables más `scripts/con-turno.mjs` y los dos archivos de tokens sin una línea tocada.

## Task Commits

1. **Task 1: los tres escenarios que faltaban** — `a225b2e` (test)
2. **Task 2: la decisión (a)** — `61b7556` (test, RED) → `746df49` (feat, GREEN)
3. **Task 3: el sexto miembro y su ejecutor de dos pasos** — `4dd8608` (test, RED) → `1c78363` (feat, GREEN)
4. **Cierre: dos correcciones de verdad que el cambio hizo necesarias** — `a7a260c` (docs)

Sin commits de REFACTOR: en los dos tasks con TDD la implementación GREEN quedó mínima y limpia.

**Plan metadata:** ver el commit `docs(03-06)` que sigue a este archivo.

## Los gates, con sus números medidos

### Task 1 — la sonda

| Gate | Medido | Piso |
|---|---|---|
| escenarios totales | **12** | ≥ 12 |
| E-6 intacto / E-11 intacto | **1 / 1** | 1 / 1 |
| E-9: cruza el sentinel / compara por pathname / mide la forma vieja | **2 / 17 / 23** | ≥1 / ≥1 / ≥1 |
| E-10: lee la marca de la rama / decide armar o no | **4 / 15** | ≥2 / ≥2 |
| E-12: cruza el sentinel / compara por pathname | **1 / 24** | ≥1 / ≥1 |
| sonda rc / los tres nuevos en `OK` | **0 / 3** (12 escenarios en `OK`) | 0 / ≥3 |
| secciones nuevas en el documento / límite de (a) escrito / título viejo | **3 / 5 / 0** | ≥3 / ≥1 / 0 |
| `scripts/con-turno.mjs` sin tocar | **vacío** | vacío |

### Task 2 — la decisión (a)

| Gate | Medido | Piso |
|---|---|---|
| reglas que no arman / única salida que arma | **6 / 1** | 6 / 1 |
| la decisión conoce el hecho de lo que hay debajo | **7** | ≥ 2 |
| el armado del hook lee la marca de la rama | **1** | ≥1 (base medida: **0**) |
| temporizadores / gate de ancho de pantalla | **1 / 0** | 1 / 0 |
| el módulo nombra la decisión / cita el escenario | **1 / 3** | ≥1 / ≥1 (bases: **0** y **0**) |
| `test/panel-branch.test.ts` | **74** casos, rc 0 | ≥ 68 |
| el caso del ítem H con nombre propio | **4** | ≥ 1 |
| `tsc` / `eslint` / intocables + tokens | **limpio / 0 / vacío** | — |

### Task 3 — el sexto miembro

| Gate | Medido | Piso |
|---|---|---|
| miembros literales del tipo | **4** | ≥4 (base: **3**) |
| retornos en la decisión / usa la raíz | **6 / 4** | ≥6 (base 5) / ≥3 (base **3**) |
| consumo guardado exportado / sus usos | **1 / 2** | 1 / ≥2 |
| usos del predicado de la marca del sentinel | **6** | ≥5 (base **5**) |
| enganches y desenganches del retroceso | **8** | ≥8 (base 6) |
| temporizadores | **1** | 1 |
| DENTRO del ejecutor: disparo único / desenganche a mano / id opcional | **2 / 2 / 4** | ≥2 / ≥2 / ≥1 |
| provider: líneas del recorte / ramas / exhaustividad / mutaciones crudas | **53 / 6 / 1 / 0** | <120 / ≥6 / ≥1 / 0 |
| `lib/panel-history.test.ts` / `test/panel-branch.test.ts` | **130 / 89**, rc 0 | ≥128 / ≥80 |
| el caso de G-1 con nombre propio | **9** | ≥ 1 |
| carril puro: casos pasados / archivos | **1574 + 3 expected-fail / 76**, rc 0 | ≥1545 / ≥76 |
| `tsc` / `eslint` / intocables | **limpio / 0 / vacío** | — |

### Verificación de cierre del plan

1. **La sonda, re-corrida al cierre:** rc **0**, **12/12** en `OK`, E-6 y E-11 intactos. `Chrome/155.0.8059.85 · node v24.15.0`. **El turno de pantalla estaba libre en las dos corridas** (sin espera).
2. **Las nueve suites puras:** **9 archivos, 444 casos**, rc 0.
3. **El carril puro completo:** **1574 pasados + 3 expected-fail / 76 archivos**, rc 0.
4. **`tsc --noEmit`** sin una línea `error TS` fuera de `.next/`; **`eslint` rc 0** sobre los 7 archivos de código tocados.
5. **La decisión (a) completa:** seis reglas, la de (a) última, el límite escrito en el módulo (**4** menciones) y en el documento de debug (**4**).
6. **Un solo temporizador** y **cero** gate de ancho de pantalla.
7. **Cero mutaciones crudas de historial** en el provider y el chequeo de exhaustividad **intacto**.
8. **Intocables sin tocar:** `lib/overlay-history.ts`, `lib/dirty-history.ts`, `components/dashboard/sidebar.tsx`, `app/(dashboard)/mas/mas-client.tsx`, `components/dashboard/panel-bottom-nav.tsx`, `scripts/con-turno.mjs`, `app/globals.css`, `app/themes.css`.

**Los dos canarios de reloj no se activaron:** la hora de Argentina en toda la ejecución fue **~06:40–07:07**, dentro de la ventana [01:00, 23:30]. Los **3 expected-fail** del carril puro son los normales de la base.

## Files Created/Modified

- `.planning/debug/probes/panel-back-stack.mjs` — el helper `salirDeLaRaizConsumiendoElSentinel` (consumo guardado por la marca de esta instancia, listener en el gesto con disparo único, empuje del destino diferido fuera del evento), los escenarios **E-9**, **E-10** y **E-12**, los tres sumados a la línea de supuestos cerrados del veredicto y al mensaje de ruteo del fallo, y el conteo del encabezado a doce.
- `.planning/debug/pila-de-dos-niveles-medida.md` — las tres mediciones pegadas tal cual salieron, la sección propia **"⚠ EL LÍMITE ACEPTADO DE LA DECISIÓN (a)"**, el conteo a doce, la versión exacta del navegador y la entrada del plan 03-06 en "Qué consume esto".
- `lib/panel-branch.ts` — la sexta regla de `panelExitArmAction` con su hecho sin valor por omisión y el docblock que escribe qué resuelve, por qué va última y cuál es el límite aceptado; el hook alimentándola del estado real; el párrafo de la imprecisión vieja **reemplazado**; `consumeOwnedExitSentinel`; la rama de dos pasos del ejecutor con `exitId` opcional; y el dominio soltándose antes de delegar.
- `test/panel-branch.test.ts` — 23 casos nuevos (66 → 89): la suite de la decisión (a) con el ítem H y el candado del orden, la del consumo guardado, la de la rama del ejecutor con el caso de G-1, y la del dominio + la degradación del provider.
- `lib/panel-history.ts` — el sexto miembro del tipo y la regla **-1b** con su docblock (por qué existe, por qué antes de la regla 0, por qué sólo en la raíz).
- `lib/panel-history.test.ts` — 8 casos nuevos (122 → 130): los tres hechos juntos, los tres negativos, el barrido de no regresión, la raíz como parámetro, y el sexto miembro como extensión del tipo.
- `components/dashboard/unsaved-changes-guard.tsx` — el miembro nuevo declarado en el ejecutor exhaustivo, en el mismo grupo que los otros tres, con el comentario de por qué su respuesta correcta es degradar.
- `lib/unsaved-changes.ts` / `lib/unsaved-changes.test.ts` — el conteo de planes de la rama de cinco a seis (ver deviations 2 y 4).

## Decisions Made

1. **La regla de (a) va última, y eso no es estética.** Es lo único que garantiza que la regla nunca lea `frjUnder` parada sobre el sentinel, donde el state lleva sólo `frjExit` y el dato no significa nada. El caso que lo fija está escrito con nombre propio.
2. **Cero claves nuevas en la pila.** La regla 0 tiene tres dueños a propósito; una cuarta marca para contestar "¿hay algo debajo?" sería un cuarto escritor con su propia disciplina que mantener, cuando `frjUnder` ya guarda la ruta justamente para el caso degenerado.
3. **El límite de (a) se escribe en tres lugares y no se intenta en ninguno.** La parte que el código no puede cerrar es la entrada **ajena**, y la única forma de que no vuelva como "bug nuevo" en la próxima UAT es que esté declarada donde alguien la vaya a leer: el módulo, el instrumento y el registro.
4. **El sexto miembro entra en el tipo, no al lado.** Si viviera afuera, el chequeo de exhaustividad del provider no lo vería y la salida del guard caería por un camino por defecto que nadie eligió. El costo de entrar al tipo fue exactamente el que se esperaba: un archivo que nadie había mirado dejó de compilar hasta declararlo (deviation 2), y eso **es** el candado funcionando.
5. **La regla nueva va antes de la regla 0 y después de la -1.** Antes de la 0 porque ahí el hecho de la rama es falso y la decisión caería en empujar, enterrando el sentinel; después de la -1 porque con el destino igual a la ruta actual no hay nada que navegar.
6. **El consumo pregunta por la instancia, no por el dueño.** Es la diferencia con sus dos hermanas y está escrita: dos dueños por la misma entrada descuadran el conteo de retrocesos, y es además lo que permite que el consumidor que no es dueño pueda negarse.
7. **La degradación se expresa como opcionalidad del parámetro, no como un `if` sobre quién llama.** Sin `exitId` la rama se niega; el provider del guard no tiene que saber nada de sí mismo para caer en el camino seguro.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] El gate `el modulo nombra la decision del dueno` medía CERO con la frase escrita cuatro veces**

- **Found during:** Task 2
- **Issue:** el gate cuenta con `grep -ciE 'decisi[oó]n \(a\)'`. En este entorno **no hay `LANG` ni `LC_ALL`** (locale C), así que `[oó]` se compila como una clase de **bytes** y matchea **un** byte; pero `ó` en UTF-8 son **dos** (`0xC3 0xB3`). O sea que la rama acentuada del gate es **inalcanzable**: sólo puede matchear la forma **sin** acento. Medido: `grep -cF 'decisión (a)'` daba **4** y el gate daba **0**. Es la misma clase de falla que las dos deviations del plan `03-05` (el prefijo `OK ` y la declaración contada como call site): un gate que no mide lo que dice medir.
- **Fix:** agregar al docblock una línea de **referencias cortas en ASCII** —`` `decision (a)` · `E-10` · item **H** · gap **G-4** ``— exactamente como la sonda escribe todos sus ids y comentarios sin acentos, y por el mismo motivo. Las cuatro menciones acentuadas en prosa **quedan**; lo que se agrega es la clave de búsqueda. **El gate NO se editó y conserva sus dientes:** si el módulo dejara de nombrar la decisión, vuelve a 0.
- **Files modified:** `lib/panel-branch.ts`
- **Verification:** `nombra la decision=1`, `cita el escenario=3`, los otros seis contadores del gate en su piso.
- **Committed in:** `746df49`

**2. [Rule 3 - Blocker] `lib/unsaved-changes.test.ts` dejó de compilar al entrar el sexto miembro en el tipo**

- **Found during:** Task 3
- **Issue:** `const TODOS_LOS_PLANES: Record<PanelBranchPlan, true>` quedó incompleto ⇒ `error TS2741: Property '"consume-exit-then-navigate"' is missing`. El archivo **no está** en `files_modified` del plan, pero el propio `fails_when` del Task 3 lo anticipa: *"al entrar en el tipo, todo `switch` exhaustivo sobre él deja de compilar hasta declararlo, y eso puede aparecer en un archivo que nadie esperaba"*. **No es un accidente: es el candado haciendo su trabajo.**
- **Fix:** agregar el miembro al mapa total y subir el conteo del caso de exhaustividad de 5 a 6, con el docblock diciendo que el candado **ya mordió** y en qué plan.
- **Files modified:** `lib/unsaved-changes.test.ts`
- **Verification:** `tsc` limpio; `lib/unsaved-changes.test.ts` verde dentro de las nueve suites (444 casos).
- **Committed in:** `1c78363`

**3. [Rule 1 - Bug] Dos casos del plan 03-03 afirmaban la conducta vieja que este plan cambia a propósito**

- **Found during:** Task 3
- **Issue:** `'destino DISTINTO con el sentinel arriba ⇒ el plan NO cambia respecto del plan 03-02 (E-6)'` y el barrido `10 × 5 × 2` fallaron con `expected 'consume-exit-then-navigate' to be 'push'`. Los dos afirmaban que con el sentinel arriba en la raíz la navegación **empuja** y el sentinel queda debajo, *"la forma medida en E-6 que NO deja un atrás muerto"*. **La UAT midió que sí lo deja:** enterrado, el atrás aterriza en una entrada de la raíz con hash que se ve igual que Inicio y el siguiente no hace nada visible (G-1 / G-2). E-6 medía el sentinel **aislado** y no cubría ese recorrido.
- **Fix:** los dos casos quedaron actualizados al contrato nuevo **con el por qué escrito en el comentario**, incluida la referencia a que E-9 mide las dos formas al lado. El barrido pasó a declarar las **dos** excepciones decididas (el par degenerado ⇒ nada; la salida desde la raíz ⇒ consumir y navegar) y a afirmar que **fuera de la raíz todo queda idéntico** — así sigue siendo un candado de no regresión y no una expectativa bajada.
- **Files modified:** `test/panel-branch.test.ts`
- **Verification:** 89 casos verdes; el barrido sigue exigiendo igualdad caso por caso para todos los pares que no son la raíz.
- **Committed in:** `1c78363`

**4. [Rule 1 - Bug] `lib/unsaved-changes.ts` decía "cinco planes" en tres lugares, y mi cambio lo volvió falso**

- **Found during:** cierre del plan
- **Issue:** el docblock afirmaba que la política de la rama tiene **cinco** planes y los enumeraba. Con el sexto en el tipo, las tres frases pasaron a mentir. No es un bug de comportamiento —el tipo de retorno es una **plantilla**, así que no hubo cambio de código— pero es exactamente la clase de documentación rancia que esta fase viene a no dejar.
- **Fix:** conteo a seis en los tres lugares y el miembro nuevo sumado a la enumeración. **Nada más:** cero cambios de código en ese archivo.
- **Files modified:** `lib/unsaved-changes.ts`
- **Verification:** `tsc` limpio, `eslint` rc 0, las nueve suites verdes.
- **Committed in:** `a7a260c`

---

**Total deviations:** 4 auto-fijadas (2 × Rule 3 bloqueantes, 2 × Rule 1 de verdad). Ninguna bajó una expectativa ni debilitó un candado: la 1 hizo que un gate midiera lo que dice medir, la 2 fue el candado del tipo funcionando, y las 3 y 4 corrigieron afirmaciones que **este** cambio volvió falsas, dejando el motivo escrito.
**Impact on plan:** nulo sobre el alcance. Cero scope creep, cero paquetes, cero migraciones. Dos archivos fuera de `files_modified` (`lib/unsaved-changes.ts` y `lib/unsaved-changes.test.ts`), ambos consecuencia **directa y prevista** de que el miembro nuevo entre en el tipo.

## Pisos que ya estaban satisfechos ANTES de este trabajo

El plan pide esto explícitamente, y con razón: **los pisos se escribieron antes de la wave 5**, así que varios ya estaban verdes sin mi trabajo. Lo que sigue es honestidad sobre qué midió de verdad cada candado.

- **`el limite aceptado de (a) escrito` (Task 1, gate 3) ya valía 3 antes de tocar nada.** El contador es `grep -ciE 'entrada ajena|otro sitio|entradas de adelante|forward'` sobre el documento de debug, y el documento **ya** decía "entradas de **adelante**" en la definición de *abajo / actual / adelante* y "forward" en el § de E-7. La sección nueva del límite se escribió igual —la piden el `<action>` y el `<done>`— pero **ese contador no la mide**: el que mordía en ese gate era `titulo viejo del conteo de mediciones = 0`.
- **`la decision usa la raiz >= 3` (Task 3, gate 1) ya valía exactamente 3.** El piso estaba **satisfecho de antemano**. Mi regla lo subió a 4, pero el candado no habría visto la diferencia entre implementar la regla condicionada a la raíz y no implementarla: los tres usos de base son `root = PANEL_ROOT`, `root?: string` y el `panelNavMode({…root…})`. Lo que de verdad protege ese hecho son los **dos casos negativos** de la suite (fuera de la raíz no se produce, y la raíz entra como parámetro), no el conteo.
- **`usos del predicado de la marca del sentinel >= 5` (Task 3, gate 2) ya valía exactamente 5.** Mismo caso: subió a 6, pero el piso estaba cumplido antes.
- **`temporizadores = 1`, `gate de ancho de pantalla = 0`, `chequeo de exhaustividad >= 1` y `mutaciones crudas de historial = 0`** ya valían lo exigido. Son **candados anti-regresión**, no prueba de que algo se construyó, y así quedan.
- **El piso de 68 casos del Task 2 estaba a DOS casos de la base.** El plan lo derivó de "47 medidos + lo que agrega 03-05 (≥59)"; la wave 5 lo dejó en **66**, así que 68 exigía apenas +2. Se agregaron **8** en ese task (66 → 74). El piso de 128 del Task 3 sobre `lib/panel-history.test.ts` tampoco estaba lejos (base 122 ⇒ +6 exigidos, +8 agregados).
- **Lo que NO estaba satisfecho de antemano**, con sus bases medidas hoy: `el armado del hook lee la marca de la rama` (**0**), `el modulo nombra la decision` (**0**), `cita el escenario E-10` (**0**), `reglas que no arman` (**5**, exigía 6), `miembros literales del tipo` (**3**, exigía ≥4), `retornos en la decision` (**5**, exigía ≥6), `consumo guardado exportado` (**0**, exigía 1), `enganches de popstate` (**6**, exigía ≥8), `disparo unico` (**1**, exigía ≥2), `desenganche a mano` (**1**, exigía ≥2), `identificador de dueno opcional` (**0**), `ramas del provider` (**5**, exigía ≥6), y los tres escenarios de sonda (**0** cada uno).
- **El candado hueco del arnés de la sonda** (`OK` con tres espacios contra el `^OK  ` de los gates) **ya lo había arreglado la wave 5**. Sin eso, el gate de la sonda de este plan habría medido **cero** con la sonda en 12/12. No se tocó.

## Issues Encountered

Ninguno más allá de las cuatro deviations. El turno de pantalla estaba **libre** en las dos corridas de la sonda (sin espera y sin cartel). El flake del runner en Windows no apareció: ninguna corrida de vitest se solapó con otra.

## STATE.md / ROADMAP.md / REQUIREMENTS.md

- **`STATE.md` y `ROADMAP.md`: NO tocados** — los escribe el orquestador.
- **`REQUIREMENTS.md`: NO tocado, y a propósito.** `MOB-04`, `MOB-05` y `MOB-06` los declaran también `03-07` y `03-08`, que todavía no tienen SUMMARY, así que el gate de ID compartido (#2388) los bloquea. Y coincide con lo que la UAT dejó escrito: *"MOB-04, MOB-05 y MOB-06 siguen SIN marcar. La fase no cierra hasta que los 6 gaps estén cerrados"*.
- **Las casillas marcadas a mano en `03-04-SUMMARY.md`: sin tocar.** Son el registro de primera mano del dueño y están commiteadas en `7c756a5`.
- **`.planning/WINDOWS.md`: NO tocado, y a propósito.** El límite aceptado de (a) es una **imprecisión aceptada**, no un defecto de este plan, y el plan `03-06` la declara en el módulo y en el documento de debug; el **registro de imprecisiones lo cierra el plan `03-08`**, que es su dueño declarado. Este plan no dejó stubs, ni tests salteados, ni un solo `<verify>` sin correr.

## Known Stubs

Ninguno. Cero valores vacíos hardcodeados, cero placeholders, cero `TODO`/`FIXME` nuevos, cero tests salteados, y los **once** `<verify>` del plan se corrieron de verdad, con sus números en la tabla de arriba.

## Threat Flags

Ninguna superficie de seguridad nueva. La fase no toca datos de ningún negocio: superficie autenticada, cero cambios de esquema, policies o queries, y **cero migraciones** (la próxima libre sigue siendo la **080**). Los seis `mitigate` del `<threat_model>` quedaron cubiertos:

| Threat | Cómo quedó cerrado |
|---|---|
| T-03-28 (DoS del gesto — el sentinel enterrado) | el sexto miembro y su ejecutor de dos pasos; medido en **E-9** (las dos formas) y **E-12**, con la comparación hecha por **pathname** |
| T-03-29 (spoofing del gesto — el retroceso deliberado) | el dominio se suelta **antes** de delegar, con la auditoría de **orden** sobre el fuente del hook y el caso de que la decisión del retroceso devuelve *ignorar* sin el hecho |
| T-03-30 (EoP — `runBranchNavigation` desde el provider) | `exitId` **opcional**: sin él la rama se niega. Caso de test propio, más la declaración del miembro nuevo en el ejecutor exhaustivo del provider con su degradación |
| T-03-31 (tampering del listener del segundo paso) | gate de región sobre el ejecutor en **disparo único = 2** y **desenganche a mano = 2**, más los dos casos de la suite |
| T-03-32 (repudiation de la decisión) | el límite de (a) escrito en el módulo (**4** menciones, gate en verde), en el documento de debug (sección propia, gate en verde) y ruteado al registro de imprecisiones por `03-08` |
| T-03-33 (tampering del contrato de diseño) | **un** temporizador (gate = 1) y **cero** gate de ancho de pantalla (gate = 0) |

`T-03-34` (information disclosure) queda **accept**, como el plan lo declara: el invariante en riesgo es de integridad de sesión y de trabajo del dueño, no de tenant.

## Next Phase Readiness

**Listo para `03-07`.** Los cuatro gaps de la intersección del sentinel con la rama quedaron cerrados en código y medidos en dos instrumentos: **G-4** por la decisión (a), y **G-1 / G-2** por el sexto miembro y su ejecutor de dos pasos.

**Lo que sigue abierto, y no lo cierra este plan:**

- **G-5 y G-6** (el sentinel no se arma entrando directo a Inicio, y no se re-arma al expirar la ventana): la UAT midió el sospechoso —el armado vive en un efecto con deps `[armarSentinel, pathname]`, así que sólo reintenta cuando cambia el pathname— y es trabajo de `03-07`.
- **El registro de imprecisiones** (`WINDOWS.md`) con el límite aceptado de (a) → plan `03-08`.
- **⚠ Los ítems 1-5 de la UAT, que PASARON, vuelven a la UAT en `03-08` MIRANDO LA URL.** Los cinco empiezan con un toque desde Inicio con el sentinel armado, que es exactamente el gesto que este plan pasó a ejecutar en **dos pasos**: acá no se arregló algo roto, se **cambió un camino que hoy funciona**, y su modo de falla nuevo es **silencioso** (el atrás aterrizaría en una entrada de la raíz con hash, indistinguible de Inicio). Es el riesgo más alto que deja este plan.
- **A1, A2 y A11** siguen abiertos: ni la sonda (servidor estático propio, sin router de Next) ni la suite pura pueden observar el orden del efecto contra la escritura del router, ni los dos motores reales.
- **La ronda 2 de UAT** —la parte de overlay del ítem 20 y el pase completo de iPhone— sigue pendiente hasta que los cuatro planes de la tanda estén cerrados.

**Nota sobre `actuals.tokens`:** medido como **chars/4 sobre el diff realizado** (74.071 caracteres añadidos entre `4e1e7f2` y `a7a260c` ⇒ **18.517**), que es el instrumento que el contrato de SUMMARY especifica. ⚠ **No es comparable con el `67076` del SUMMARY de `03-05`:** ese número no se reproduce con este instrumento (el mismo cálculo sobre el diff de `03-05` da **18.629**), así que las dos entradas están en **escalas distintas** y promediarlas mediría los métodos de medición, no la desviación de la estimación. Queda señalado acá en vez de ajustado para que coincida.

## Self-Check: PASSED

- `.planning/debug/probes/panel-back-stack.mjs` — FOUND (modificado), `E-9` / `E-10` / `E-12` declarados 1 vez cada uno, sonda rc 0 con **12/12**
- `.planning/debug/pila-de-dos-niveles-medida.md` — FOUND, `### E-9` / `### E-10` / `### E-12` presentes, título viejo en 0, límite de (a) en su propia sección
- `lib/panel-branch.ts` — FOUND, 6 reglas que no arman + 1 que arma, `consumeOwnedExitSentinel` exportado 1 vez, 1 temporizador, 8 enganches de `popstate`
- `test/panel-branch.test.ts` — FOUND, **89** casos verdes
- `lib/panel-history.ts` — FOUND, 4 literales propios en el tipo del plan, 6 retornos en la decisión
- `lib/panel-history.test.ts` — FOUND, **130** casos verdes
- `components/dashboard/unsaved-changes-guard.tsx` — FOUND, 6 ramas declaradas, `_exhaustivo: never` intacto, 0 mutaciones crudas
- `lib/unsaved-changes.ts` / `lib/unsaved-changes.test.ts` — FOUND, mapa total con 6 miembros
- Commits `a225b2e`, `61b7556`, `746df49`, `4dd8608`, `1c78363`, `a7a260c` — los seis presentes en `git log` (medido: `git rev-list --count 4e1e7f2..HEAD` = **6**)
- Carril puro completo: **1574 pasados + 3 expected-fail / 76 archivos**, rc 0
- `tsc --noEmit` sin una línea `error TS` fuera de `.next/`; `eslint` rc 0

---
*Phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos*
*Completed: 2026-10-23*
