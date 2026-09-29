---
phase: 01-el-detalle-de-cliente-con-la-regla-de-historial-que-lo-gobie
plan: 03
subsystem: navegacion
tags: [history-api, next-link, onNavigate, sidebar, nav-07, nav-08, panel-history, regresion]

requires: ["01-01", "01-02"]
provides:
  - "`panelNavMode`: la regla de push-vs-replace del menú, PURA y sobre rutas — dashboard→sección empuja, sección→sección reemplaza, misma ruta reemplaza, sección→dashboard empuja"
  - "`consumeOwnedPanelEntry`: el ejecutor genérico que cierra la subsección abierta antes de que el router empuje encima (NAV-08), con DOS guardas independientes contra el `back()` sobre entrada ajena"
  - "`panelViewEntryParam`: la marca leída SIN saber de qué vista es — lo que permite que el sidebar pregunte por 'alguna subsección' sin conocer `?c=`; `isPanelViewEntry` pasa a derivarse de él"
  - "`test/panel-history-sidebar.test.ts`: el candado del CABLEADO del menú — 8 casos, 0 paquetes, probado con dos mutaciones reales"
  - "El invariante que sobrevive al futuro: agregar un `<Link>` al sidebar sin pasarlo por la regla pone la suite en ROJO"
affects:
  - "panel-nav Phase 2 (los tabs de Negocio/Ajustes/Finanzas heredan el arreglo de NAV-08 sin tocar nada: el ejecutor es genérico por diseño)"

actuals:
  tokens: 21000
  tasks: 2
  commits: 3
  commits_de_este_plan: [382a2d6, ec2bf7f, 23d836d]
  # ⚠ `git rev-list --count 079e4b6..HEAD` mide **5**, no 3, y el instrumento es INVÁLIDO acá: los
  # worktrees están desactivados y el ejecutor del plan **01-04** commiteó en la MISMA rama `main`
  # mientras esto corría (`0ad7f04` y `acc3bf7`, los dos de 01-04). Los 3 de este plan son los
  # listados arriba, verificados por hash. No se narró el número: se midió y se descartó el
  # instrumento con el motivo.
plan_head_before: 079e4b61e6fe2dacb0d908cd35ea0ea1feff9b76

tech-stack:
  added: []
  patterns:
    - "La decisión de historial de un `<Link>` se CONSUME de `lib/panel-history.ts` vía `replace={panelNavMode(...) === 'replace'}`; el JSX no vuelve a decidir política (molde NAV-05)"
    - "`onNavigate` + `e.preventDefault()` para convertir un click de navegación en un `history.back()`: prevenir, NUNCA encadenar (el `back()` es asíncrono)"

key-files:
  created:
    - test/panel-history-sidebar.test.ts
  modified:
    - lib/panel-history.ts
    - lib/panel-history.test.ts
    - components/dashboard/sidebar.tsx

key-decisions:
  - "**sección → dashboard EMPUJA, no reemplaza.** Era el hueco que el plan dejó abierto ('decidilo y escribí el porqué'). Reemplazar dejaría `/dashboard` encima de `/dashboard`: dos entradas idénticas ⇒ un atrás que no hace nada visible, que es exactamente la 'entrada basura' con la que este mismo plan descartó `<Link replace={active}>` a secas. Con `push`, el atrás desde el dashboard devuelve la sección de la que se venía: siempre hace algo. El invariante se enuncia con precisión: entre la sección abierta y el dashboard que tiene INMEDIATAMENTE debajo no hay nunca otra sección — no habla de la pila entera"
  - "**La cuarta rama que el plan no pedía: misma ruta ⇒ replace.** Cierra el caso residual de NAV-08 sin violar D-01: cuando la entrada de arriba NO es nuestra (el dueño pegó `/clients?c=A`, o hay un overlay arriba) no se puede consumir, y hoy el link empujaría `/clients` encima. Con `replace` la entrada se PISA: la ficha se cierra, la query se limpia y no queda nada apilado. Reemplazar la entrada actual ya es un movimiento sancionado del módulo (`user-close` con `holding:false` hace exactamente eso), así que no es historial ajeno reescrito: es la declaración de intención de la navegación"
  - "**El predicado se generalizó en vez de duplicarse.** El sidebar no sabe nada de `?c=`, así que necesitaba preguntar '¿la entrada de arriba es de ALGUNA subsección?'. Se extrajo `panelViewEntryParam(state): string | null` y `isPanelViewEntry` quedó definido como `panelViewEntryParam(state) === param`: el literal `'frjView'` sigue escrito UNA sola vez. Equivalencia observable exacta — los 4 casos que ya cubrían `isPanelViewEntry` siguen verdes sin tocarlos"
  - "**La guarda de overlay en el ejecutor se escribe explícita aunque hoy sea redundante.** `{frjOverlay:n}` no lleva `frjView`, así que la guarda de la marca propia ya lo rechazaría. Se pone igual, como candado independiente, porque es la cicatriz que `lib/overlay-history.ts:362-366` documenta: dos candados, no uno. Medido: la mutación que la borra deja rojo un solo caso (el de las dos marcas) — la redundancia está admitida por escrito, no supuesta"
  - "**La Ayuda del footer entra en la misma regla.** Es una ruta más del panel y llega por el mismo menú: si no compartiera la política, salir de Clientes por Ayuda dejaría Clientes debajo y el atrás caería ahí. Un item con dialecto propio es justo lo que NAV-05 viene a evitar"
  - "**Se agregó `test/panel-history-sidebar.test.ts`, fuera de los 3 archivos declarados** (deviación Rule 2, detalle abajo): sin él, degradar el cableado del menú no ponía nada en rojo, y el plan 01-02 ya había establecido que la política y el cableado necesitan candados separados"

requirements-completed: [NAV-07, NAV-08]

coverage:
  - id: D9
    description: "NAV-07: el atrás desde cualquier sección del menú cae en el dashboard y nunca en otra sección abierta antes"
    requirement: NAV-07
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts — 'Dashboard → Finanzas → Clientes → atrás aterriza en el DASHBOARD (el pedido de julio)' + 'desde CUALQUIER sección del menú, después de cualquier recorrido, el atrás cae en el dashboard' (144 pares de rutas simulados sobre la pila)"
        status: pass
      - kind: unit
        ref: "test/panel-history-sidebar.test.ts — 'TODOS los <Link> del sidebar declaran su modo' + 'la fila del menú calcula el modo con la ruta ACTUAL y el destino del item'"
        status: pass
      - kind: other
        ref: "prueba de mutación: `panelNavMode` degradado a `return 'replace'` ⇒ 6 casos ROJOS; `replace={panelNavMode(...)}` borrado del item ⇒ 2 ROJOS. Ambas revertidas"
        status: pass
    human_judgment: false
  - id: D10
    description: "NAV-08: tocar en el menú la sección en la que ya estás cierra la subsección en vez de apilarse encima, y nunca hace un back() sobre una entrada ajena"
    requirement: NAV-08
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts — describe 'consumeOwnedPanelEntry' (6 casos: consume la propia y la de otra pantalla; CERO back() con entrada ajena, marca nula, overlay, o las dos marcas)"
        status: pass
      - kind: unit
        ref: "test/panel-history-sidebar.test.ts — 'el guard de cambios sin guardar se evalúa PRIMERO y no se toca' + 'el consumo sólo corre en la sección ACTIVA y PREVIENE la navegación' (con aserciones negativas contra `await` y `.then`)"
        status: pass
      - kind: other
        ref: "prueba de mutación: quitar la guarda de overlay ⇒ 1 ROJO; quitar la guarda de marca propia ⇒ 1 ROJO; adelantar el consumo al guard de cambios sin guardar ⇒ 2 ROJOS. Las tres revertidas"
        status: pass
    human_judgment: false
  - id: D11
    description: "La causa medida del bug queda cerrada en el punto exacto donde se medía: el `<Link href='/clients'>` pulsado con la ficha abierta ya no empuja una entrada de ruta encima de `?c=`"
    requirement: NAV-08
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts — 'la misma ruta REEMPLAZA: empujarla sería un atrás muerto (cicatriz 1)' (el camino residual, cuando la entrada de arriba no es nuestra y no se puede consumir)"
        status: pass
      - kind: manual
        ref: "UAT en celular real — guión 1 del plan (ficha abierta → 'Clientes' → atrás, Fusionar, atrás, atrás). NO CORRIDA acá: la corre el dueño"
        status: pending
    human_judgment: true

duration: 38min
completed: 2026-09-29
status: complete
---

# Phase 1 Plan 03: El stack de secciones — que el menú no sepulte subsecciones y que el atrás caiga en el dashboard Summary

**Las dos decisiones de push-vs-replace que viven en el mismo `<Link>` quedaron resueltas como UNA función pura y UN ejecutor genérico en `lib/panel-history.ts`, con el sidebar consumiéndolas en una prop y una guarda del `onNavigate` que ya existía — cero cambio visual, cero paquetes, cero migraciones, y cinco mutaciones corridas de verdad para demostrar que cada pieza tiene un test que se pone rojo si alguien la degrada.**

## Performance

- **Duration:** 38 min
- **Tasks:** 2/2
- **Commits:** 3 (2 de código + 1 de tests) + 1 de docs

## Cómo quedó la regla de push-vs-replace, y dónde vive

Vive **entera** en `lib/panel-history.ts`, en `panelNavMode({ from, to, root })`, pura y sobre **pathnames** (no sobre pantallas: el hub Negocio y Ajustes comparten pantalla pero son rutas distintas). Cuatro ramas, **en este orden**:

| # | Caso | Modo | Por qué |
|---|------|------|---------|
| 1 | `from === to` (misma ruta) | **replace** | Empujar la misma URL es la cicatriz 1 (dos entradas idénticas = atrás muerto). Y es la rama que cierra el residuo de NAV-08 cuando la entrada de arriba **no es nuestra**: el replace limpia la query sin apilar nada |
| 2 | dashboard → sección | **push** | El dashboard tiene que quedar DEBAJO: es el destino del atrás. Es la rama que hace que el invariante exista — y la que demuestra que `replace` a secas era incorrecto |
| 3 | sección → dashboard | **push** | Decisión que el plan dejó abierta. `replace` dejaría `/dashboard` sobre `/dashboard` ⇒ atrás muerto. Con push, el atrás desde el dashboard devuelve la sección de la que se venía |
| 4 | sección → sección | **replace** | La sección nueva PISA a la anterior ⇒ encima del dashboard hay siempre UNA sola. Es literalmente el pedido de julio |

El sidebar **sólo la consume**, en una prop:

```
replace={panelNavMode({ from: pathname, to: item.href }) === 'replace'}
```

Verificado contra `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md:170-172` y contra el runtime instalado (`next/dist/client/app-dir/link.js:83`): `replace` resuelve en `dispatchNavigateAction(href, 'replace')`, o sea reemplaza la entrada **actual**.

**Invariante que produce, enunciado con precisión:** *entre la sección abierta y el dashboard que tiene inmediatamente debajo no hay nunca otra sección.* Por eso el atrás desde cualquier sección cae en el dashboard. No dice nada de la pila entera — y no puede, porque la rama 3 deja secciones más abajo, debajo de un dashboard que el dueño pidió explícitamente (historia honesta, D-01).

## Cómo se previene la navegación en NAV-08

`history.back()` es **asíncrono**, así que no se puede encadenar: si se dejara navegar, el router empujaría su entrada **antes** de que el browser procese el pop y la ficha volvería a quedar enterrada — el bug entero, de vuelta. Se **previene**:

```
onNavigate={(e) => {
  if (requestNavigation(item.href)) { e.preventDefault(); return }   // el guard de NAV-06, PRIMERO
  if (active && consumeOwnedPanelEntry()) e.preventDefault()          // NAV-08
}}
```

Tres cosas medidas contra el runtime de Next 16.2.7 (`next/dist/client/app-dir/link.js:53-88`), no asumidas:

1. `onNavigate` se invoca **para toda navegación local**, incluida la que apunta al href en el que ya estás — por eso el gesto "tocar la sección activa" es interceptable.
2. El `preventDefault()` del evento de `onNavigate` es un flag propio de Next que **corta antes del `dispatchNavigateAction`**: la navegación no ocurre en absoluto, no es un `e.preventDefault()` de DOM que el router podría ignorar.
3. `onClick` corre **antes** de `onNavigate`, así que el `setMobileOpen(false)` que ya estaba cierra el drawer **igual** cuando prevenimos: el dueño toca "Clientes", el menú se cierra y la ficha se cierra. Sin este orden, prevenir habría dejado el drawer abierto.

`consumeOwnedPanelEntry()` es **genérico a propósito** (no recibe el param): pregunta *"¿la entrada de arriba es de alguna subsección del panel?"*. El agujero que el diagnóstico midió no es exclusivo de Clientes, y los tabs de la Phase 2 heredan el arreglo sin tocar nada de este módulo.

## Qué test se pone rojo si alguien degrada cada cosa — con la mutación corrida

| # | Qué se degradó | Qué cayó | Medido |
|---|---|---|---|
| 1 | `panelNavMode` → `return 'replace'` (la tentación de "replace a secas") | **6 rojos**: `dashboard → sección EMPUJA`, `NO es 'replace' a secas`, `sección → dashboard EMPUJA`, `la raíz es un parámetro`, y los **dos** de la pila simulada | `6 failed \| 65 passed (71)` |
| 2 | `consumeOwnedPanelEntry`: borrada la guarda de overlay | **1 rojo**: `una entrada que lleva las DOS marcas se considera del overlay y no se toca` | `1 failed \| 70 passed (71)` |
| 3 | `consumeOwnedPanelEntry`: borrada la guarda de marca propia | **1 rojo**: `CERO back() sobre una entrada ajena — es la cicatriz 2, saca al dueño del sitio` | `1 failed \| 70 passed (71)` |
| 4 | Sidebar: borrado el `replace={panelNavMode(...)}` del item del menú | **2 rojos**: `TODOS los <Link> declaran su modo`, `la fila calcula el modo con la ruta ACTUAL` | `2 failed \| 6 passed (8)` |
| 5 | Sidebar: el consumo adelantado **antes** del guard de cambios sin guardar | **2 rojos**: `el guard se evalúa PRIMERO`, `el consumo sólo corre en la sección ACTIVA y PREVIENE` | `2 failed \| 6 passed (8)` |

Las cinco se aplicaron con un script, se midieron y se **revirtieron** con `cp` del respaldo; `git status --porcelain` de los dos archivos quedó **vacío** antes de commitear. **Nada de esto se commiteó.**

> La mutación 2 es la honesta de la tanda: prueba que la guarda de overlay es **redundante hoy** (las dos formas de state son disjuntas, así que la otra guarda ya atajaba `{frjOverlay:1}`). Se deja escrita igual, como candado independiente, y el summary lo dice en vez de venderla como imprescindible.

## Verificación — salida real

| Gate | Resultado |
|------|-----------|
| `npx vitest run` (suite completa) | `rc=0` — **Test Files 101 passed (101)** · **Tests 1486 passed \| 4 expected fail \| 1 skipped (1491)** · 96.42s. Piso de 01-02 era **1460 passed / 100 archivos** (1465 total) ⇒ **+26 casos, +1 archivo**, exacto |
| `npx vitest run lib/panel-history.test.ts` | `rc=0` — **71 passed (71)** (eran 53 ⇒ **+18**) |
| `npx vitest run test/panel-history-sidebar.test.ts` | `rc=0` — **8 passed (8)** |
| `./node_modules/.bin/tsc --noEmit` (⚠ nunca `npx tsc`) | **0 líneas `error TS`** fuera de `^\.next/` (medido con `grep -c`, dos corridas) |
| `./node_modules/.bin/eslint components/dashboard/sidebar.tsx lib/panel-history.ts lib/panel-history.test.ts test/panel-history-sidebar.test.ts` | `rc=0`, **salida vacía — 0 problemas** |
| `ls supabase/migrations/*.sql \| wc -l` | **41** — cero migraciones, como manda el plan |
| `git diff --name-only HEAD~3 HEAD -- package.json package-lock.json` | vacío — **cero paquetes nuevos** |
| Dev server del puerto 80 | **NO se tocó.** Ninguna corrida levantó un server; las mediciones de Next salieron de leer `node_modules/next/dist/` |

> ⚠ `npm run lint` (todo el repo) sale `rc=1` por **deuda preexistente** de `react-hooks` en archivos ajenos. Lo medido acá es `eslint` sobre los archivos tocados: **0 problemas**.
>
> ⚠ **La suite se corrió con el trabajo del plan 01-04 EN VUELO en el mismo working tree** (worktrees desactivados, los dos ejecutores sobre `main`): `app/(dashboard)/clients/clients-client.tsx` estaba modificado por el otro ejecutor durante todas las mediciones, y dos de sus commits (`0ad7f04`, `acc3bf7`) aterrizaron encima de los míos. Los números de arriba son por lo tanto de **la suma de los dos planes**, no de este aislado. Lo que sí es atribuible sólo a este plan y quedó medido en aislamiento: los **71** de `lib/panel-history.test.ts`, los **8** del archivo nuevo, y las cinco mutaciones. Ese archivo **no se tocó** desde acá (`git diff` de este plan no lo incluye).
>
> ⚠ **Flake de entorno medido, no atribuible a este plan.** Las primeras **cuatro** corridas de la suite completa dieron fallas distintas cada vez, TODAS en el carril `|db|` (`abono-generation`, `abono-cron`, `abono-create`, `manual-client`, `service-categories-model`, `service-coverage-public`, `settings-delete-precheck-tenant`) y casi todas en el `beforeAll` (`seedOneTenant`, `purgeAbonos`, `Test timed out in 5000ms`), más un timeout de `test/shell-scope.test.ts` que **pasa en 416 ms corrido solo**. Causa: en paralelo corría el ejecutor del plan **01-04** sobre el mismo Supabase local y la misma máquina — es exactamente la saturación del pool de PostgREST que `test/suite-split.ts` documenta. La corrida limpia (arriba) salió **101/101 verde**. Este plan no toca datos, ni SQL, ni ningún archivo del carril `db`.

## Deviations from Plan

### 1. [Rule 2 — funcionalidad crítica ausente] Se agregó `test/panel-history-sidebar.test.ts`, un cuarto archivo

- **Found during:** cierre del Task 2, al responder "¿qué se pone rojo si alguien degrada el cableado?"
- **Qué faltaba:** nada. Literalmente nada se ponía rojo. `lib/panel-history.test.ts` fija la **política** y queda **verde** con el `replace={panelNavMode(...)}` borrado del sidebar y con el orden del `onNavigate` invertido — **medido** (mutaciones 4 y 5 arriba, corridas primero contra la suite pura para confirmarlo). El entorno de Vitest es `node` sin jsdom y el milestone prohíbe paquetes, así que el componente no se puede montar: el único candado posible es el barrido de fuente que el plan **01-02** ya estableció como molde para `/clients`.
- **Qué se hizo:** un archivo nuevo en `test/`, con los tres helpers (`read`, `sinComentarios`, `recorte`) copiados de `test/panel-history-clients.test.ts` y la misma regla de honestidad (recorte vacío ⇒ falla; comentarios descontados antes de afirmar — crítico acá, porque el sidebar está lleno de comentarios que nombran `push`, `replace` y `preventDefault` para explicar la regla). Cero código de producción tocado: leer no es tocar.
- **Por qué no fue adentro de `lib/panel-history.test.ts`** (que sí estaba declarado): el encabezado de ese archivo declara que es la suite de *"el qué se decide"*, pura y sin `node:fs`. Meterle un barrido de fuente lo habría contradicho y habría mezclado los dos carriles de verificación que 01-02 separó a propósito.
- **Commit:** `23d836d`.

### 2. [Forma] La Ayuda del footer se incluyó en la regla, además de los ~14 items del menú

- **Found during:** Task 2
- **Motivo:** el plan habla de "los ~14 items del menú", y `/ayuda` es un `<Link>` del mismo sidebar a una ruta del panel. Dejándolo afuera, salir de Clientes por Ayuda dejaría Clientes debajo y el atrás caería ahí en vez del dashboard: un item con política propia, que es el dialecto que NAV-05 prohíbe. Se le puso la misma prop y la misma guarda. El consumo de NAV-08 es hoy un **no-op** ahí (Ayuda no tiene subsecciones) y se dejó igual para que no haya dos formas de escribir esa fila.

### 3. [Corrección de un mensaje de commit] El commit `382a2d6` dice "26 casos nuevos"; son **18**

- **Motivo:** el número se escribió antes de medir el total. Los 26 son la suma correcta del plan entero (**18** en `lib/panel-history.test.ts`, 53 → 71, **+ 8** en el archivo nuevo). El delta de la suite completa lo confirma exacto: 1465 → 1491 total. No se reescribió el commit (implicaría rebasear dos commits posteriores); queda corregido acá, que es el documento autoritativo.

## Límites conocidos, declarados y NO hackeados

1. **Entrar directo a una sección deja el atrás fuera del panel.** URL pegada, F5, el rebote del proxy después del login: no hay ningún dashboard debajo. Empujar uno falso sería inventar una entrada que el dueño nunca visitó (**D-01**). El plan lo declara y acá queda además con su propio caso de test (`entrar DIRECTO a una sección deja el atrás fuera del panel — caso declarado, no hackeado`).
2. **Con dos fichas apiladas (A → B), un toque del menú consume UNA sola.** Es el mismo modelo que el botón "Volver" de mobile, así que el gesto es coherente: el menú, estando ya en la sección, se comporta como un "Volver". Escrito en el JSDoc del ejecutor, como pide el plan.
3. **Con un overlay abierto, el `replace` cae sobre la entrada DEL OVERLAY y no sobre la de la sección** ⇒ quedan dos secciones encima del dashboard. Sigue siendo **mejor que hoy** (hoy esa entrada queda enterrada y suma un atrás muerto) y el overlay no se rompe: su limpieza mira la marca antes de cualquier `back()` y al no encontrarla no toca nada (`lib/overlay-history.ts:362-376`). Pelearlo exigiría interceptar la navegación del router = D-01. Documentado en el JSDoc de `panelNavMode`.
4. **Cuando el guard de cambios sin guardar intercepta y el dueño confirma "Salir sin guardar", la navegación es un `push`.** La continuación vive en `confirmLeave()` → `router.push(nav.href)`, dentro de `components/dashboard/unsaved-changes-guard.tsx`, que este plan tiene **prohibido tocar** (intocable de NAV-06). O sea: NAV-07 no aplica en ese único camino, y salir de Agenda con horarios editados hacia otra sección deja Agenda debajo. Es un hueco **honesto y acotado** (requiere tener cambios sin guardar), y cerrarlo es un cambio en un archivo pineado ⇒ candidato a plan propio.
5. **La regla cubre el sidebar, no todo enlace del panel.** Un `<Link>` sección→sección en otra superficie (una tarjeta del dashboard, un tile del hub Negocio) sigue empujando. Desde el dashboard eso es correcto por la rama 2; entre secciones sería el mismo hueco. `files_modified` del plan es explícito: sólo el sidebar. Queda anotado para la Phase 2, que ya va a tocar esas pantallas.

## Auth Gates

Ninguno.

## Known Stubs

Ninguno. No quedó ningún `it.skip`, ningún `todo`, ningún caso que pase sin afirmar: los **4** cortes de `recorte(` del archivo nuevo tienen **4** guardas de "no encontró nada" cubriéndolos (1:1, medido con `grep -c`; el 5º hit de `recorte(` es su propia definición), y los dos `describe` de `lib/panel-history.test.ts` afirman sobre `vi.fn()` contadas (`toHaveBeenCalledTimes(1)` / `not.toHaveBeenCalled()`), no sobre un booleano de retorno solo.

## Threat Flags

Ninguna. El plan no abre superficie: no toca datos, no toca SQL, no lee secretos, no agrega endpoints ni dependencias. Las dos funciones nuevas leen `window.history.state` (ya expuesto al cliente por definición) y deciden sobre pathnames públicos. Cero relación con el aislamiento por tenant — y las mitigaciones de T-01-01 / T-01-07 que 01-02 dejó vigiladas siguen verdes en la suite.

## Pendiente: UAT en celular real

Los cuatro guiones del plan (§UAT) los corre el dueño en el teléfono, una sola vez para toda la Phase 1. **No se corrió acá**, por instrucción explícita.

## Self-Check: PASSED

- `test/panel-history-sidebar.test.ts` — **FOUND**
- `lib/panel-history.ts` con `panelNavMode` / `consumeOwnedPanelEntry` / `panelViewEntryParam` — **FOUND**
- `components/dashboard/sidebar.tsx` con `replace={panelNavMode(` y `consumeOwnedPanelEntry()` — **FOUND**
- commit `382a2d6` (`feat(01-03): las dos reglas de historial del menu…`) — **FOUND**
- commit `ec2bf7f` (`feat(01-03): el sidebar CONSUME las dos reglas…`) — **FOUND**
- commit `23d836d` (`test(01-03): el candado del cableado del menu…`) — **FOUND**
- `git status --porcelain` de los archivos tocados — **vacío** (las cinco mutaciones revertidas)
- `app/(dashboard)/clients/clients-client.tsx` — **NO tocado** (es del ejecutor del plan 01-04, corriendo en paralelo)
