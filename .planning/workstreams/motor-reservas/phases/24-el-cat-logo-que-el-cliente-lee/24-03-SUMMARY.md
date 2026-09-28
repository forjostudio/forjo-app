---
phase: 24-el-cat-logo-que-el-cliente-lee
plan: 03
subsystem: ui
tags: [nextjs16, react19, tailwind4, a11y, vitest, uat-driven]

requires:
  - phase: 24-el-cat-logo-que-el-cliente-lee
    provides: "el catálogo agrupado del paso 1 (`catalogGroups` + el `<h3>` por grupo) y la prop `serviceCategories?: CatalogCategory[]` en los dos call sites (planes 24-01 y 24-02)"
  - phase: 22-el-modelo-del-cat-logo
    provides: "`groupCatalog()` y `OTHER_GROUP_TITLE` — la fuente única del agrupado y del orden, sobre la que se apoya el orden de los chips"
provides:
  - "La barra de chips que FILTRA el catálogo público desde 2 categorías (D-16 / G-24-6): `Todo` primero y seleccionado al montar"
  - "El umbral como constante nombrada y testeada: `CHIPS_MIN_CATEGORIES = 2` en `lib/service-categories.ts`"
  - "Tres funciones puras nuevas en el módulo del catálogo (`catalogChips`, `filterCatalogGroups`, `catalogGroupKey`) con 11 casos unitarios propios"
  - "7 gates de texto nuevos en `test/catalog-public.test.ts` (11 → 18) sobre el umbral, el estado inicial, el gateo y la accesibilidad del molde portado"
affects: [secure-phase 24, UAT visual de la fase 24, /gsd-verify-work 24]

actuals:
  tokens: 21000
  tasks: 2
  commits: 3
plan_head_before: e7b5ef1222cebda2e7597f72adc4c8e9d19c81fd

tech-stack:
  added: []
  patterns:
    - "Cuando la regla de un control se puede escribir como función pura, se escribe pura y se testea EJECUTÁNDOLA — el gate de texto queda sólo para el cableado que no se puede ejecutar (entorno Vitest `node`, sin DOM)"
    - "La condición de render de un control opcional es «¿hay items?» y no un umbral escrito en el JSX: la función devuelve `[]` cuando no corresponde, igual que `title: null` decide el encabezado de grupo"
    - "Una sentinela de filtro es una clave PROPIA (`__todo__`), nunca el rótulo visible: el rótulo es un nombre que el dueño puede escribir en una categoría suya"

key-files:
  created: []
  modified:
    - lib/service-categories.ts
    - app/[slug]/booking-client.tsx
    - test/service-categories.test.ts
    - test/catalog-public.test.ts

key-decisions:
  - "El umbral vive en `CHIPS_MIN_CATEGORIES = 2` (lib/service-categories.ts) y gatea DOS cosas con el mismo número: las categorías CREADAS y los grupos CON TÍTULO de la salida de `groupCatalog`. El segundo gate es lo que evita una barra con sólo `Todo` encima de una lista plana cuando hay categorías creadas pero ninguna asignada"
  - "La sentinela del chip que no filtra es `ALL_GROUPS_KEY = '__todo__'`, una clave propia y NO el rótulo `Todo` (que es lo que hace el molde de forjo-tiendas): acá las claves son ids de categoría y un negocio puede llamar `Todo` a una categoría suya — con el rótulo como sentinela tendría dos chips que se leen igual y hacen cosas distintas"
  - "`filterCatalogGroups` con el chip `Todo` devuelve LA MISMA REFERENCIA que entró, no una copia: el consumidor es un `useMemo` y una copia re-renderizaría el catálogo entero en el estado por defecto, que es el estado del 100% de las visitas que no filtran"
  - "Una clave de chip desconocida devuelve el catálogo ENTERO, nunca `[]` — misma regla direccional que la invariante de conservación de `groupCatalog`: el peor caso posible es «se ve como hoy»"
  - "La `key` de React del envoltorio de grupo pasó de `group.categoryId ?? '__sueltos__'` a `catalogGroupKey(group)`: el chip y la tarjeta no pueden quedar hablando de claves distintas (si divergieran, el chip de «Otros» filtraría a cero grupos y caería en la red de seguridad sin que nada lo avise)"
  - "Alto real `min-h-11` (44px) en el chip y NO el pseudo-elemento estirado que usa la tarjeta: adentro de un contenedor con `overflow-x` el pseudo-elemento que sobresale vuelve scrolleable también el eje vertical (medido en el molde, `CatalogoCarta.tsx:56-60`)"
  - "El chip apagado va en `text-foreground` (16.2:1) y nunca en `text-primary`, que a 14px falla AA en 3 de las 5 paletas (3.54 / 3.59 / 2.36:1, medido en el 19-UI-SPEC). El elegido usa el par `bg-primary`/`text-primary-foreground` que ya pinta el hero"

requirements-completed: [CAT-08, CAT-09]

coverage:
  - id: D1
    description: "El umbral es una constante nombrada del módulo y vale 2; el JSX no escribe ninguna comparación contra un número distinto de cero"
    requirement: CAT-08
    verification:
      - kind: unit
        ref: "test/service-categories.test.ts#el umbral es UNA CONSTANTE del módulo y vale 2"
        status: pass
      - kind: unit
        ref: "test/catalog-public.test.ts#el umbral NO se escribe acá: no hay una sola comparación contra un número distinto de cero"
        status: pass
    human_judgment: false
  - id: D2
    description: "Con cero categorías la barra NO se renderiza (CAT-07 / G-24-2 intactos), con una tampoco, y con categorías creadas pero ninguna asignada tampoco"
    requirement: CAT-08
    verification:
      - kind: unit
        ref: "test/service-categories.test.ts#con CERO categorías no hay barra: la pantalla es la de hoy (CAT-07 / G-24-2)"
        status: pass
      - kind: unit
        ref: "test/service-categories.test.ts#con UNA categoría tampoco: filtrar entre un grupo y \"Otros\" es ruido"
        status: pass
      - kind: unit
        ref: "test/service-categories.test.ts#con categorías creadas pero NINGUNA asignada tampoco: una barra con sólo \"Todo\" no filtra nada"
        status: pass
    human_judgment: false
  - id: D3
    description: "El chip seleccionado por defecto es la sentinela `Todo` ⇒ al entrar se ve el catálogo completo y reservar no cuesta un click más (CAT-09)"
    requirement: CAT-09
    verification:
      - kind: unit
        ref: "test/service-categories.test.ts#el estado inicial (`Todo`) devuelve el catálogo COMPLETO y la MISMA referencia"
        status: pass
      - kind: unit
        ref: "test/catalog-public.test.ts#el chip seleccionado por defecto es la sentinela `Todo`"
        status: pass
    human_judgment: false
  - id: D4
    description: "El filtro conserva los servicios del grupo elegido, respeta el orden del dueño y ante una clave desconocida devuelve el catálogo entero"
    requirement: CAT-09
    verification:
      - kind: unit
        ref: "test/service-categories.test.ts#un chip de grupo deja EXACTAMENTE ese grupo, con sus servicios intactos"
        status: pass
      - kind: unit
        ref: "test/service-categories.test.ts#una clave DESCONOCIDA devuelve el catálogo entero, nunca cero grupos (filtra, no apaga)"
        status: pass
      - kind: unit
        ref: "test/service-categories.test.ts#desde 2 categorías: \"Todo\" PRIMERO y después un chip por grupo, en el orden del dueño"
        status: pass
    human_judgment: false
  - id: D5
    description: "La accesibilidad del molde portado está completa: `role=tablist` con nombre, `role=tab` + `aria-selected`, 44px reales sin pseudo-elemento, foco visible y scrollbar oculta en los dos motores"
    verification:
      - kind: unit
        ref: "test/catalog-public.test.ts#la accesibilidad del molde portado está completa: tablist con nombre, tab con estado y 44px reales"
        status: pass
    human_judgment: false
  - id: D6
    description: "No se portó el buscador ni la segunda fila de subcategorías, y no hay colapsables ni contenedor de scroll propio para la lista"
    verification:
      - kind: unit
        ref: "test/catalog-public.test.ts#NO se portó el buscador ni la segunda fila de subcategorías"
        status: pass
    human_judgment: false
  - id: D7
    description: "Nada de la fase anterior regresionó: los tres conteos de la región siguen en 1·1·1, el cuerpo de la tarjeta quedó intacto, 41 migraciones, cero paquetes"
    verification:
      - kind: other
        ref: "grep -c de las tres cadenas = 1·1·1 · git diff -w muestra 6 líneas borradas y ninguna del bloque de la tarjeta · ls supabase/migrations/*.sql | wc -l = 41 · git diff package.json package-lock.json vacío"
        status: pass
    human_judgment: false
  - id: D8
    description: "En pantalla: la barra aparece con el catálogo real del dueño, filtra al tocar un chip, `Todo` vuelve al catálogo completo, no salta el scroll, y con 0/1 categoría no aparece"
    requirement: CAT-09
    verification: []
    human_judgment: true
    rationale: "La barra es el resultado de una decisión tomada DURANTE la UAT, mirando datos reales: su criterio de éxito es exactamente el mismo acto. El entorno Vitest es `node` (sin DOM) y `BookingClient` llama al router en su cuerpo, así que no hay aserción automática posible sobre el render. Queda para la UAT visual del cierre de fase, junto con los puntos que dejaron abiertos los planes 24-01 y 24-02."

duration: 25 min
completed: 2026-09-28
status: complete
---

# Phase 24 Plan 03: La barra de chips que filtra el catálogo — Summary

**El cliente ahora puede filtrar el catálogo público por categoría desde una fila de chips arriba del paso 1 —`Todo` primero y elegido al entrar, así que el catálogo completo sigue siendo la pantalla de llegada y reservar no cuesta un click más—, y las dos reglas de la barra (cuándo aparece, qué muestra) viven en el módulo puro con 11 casos que las ejecutan, no en un `if` del JSX.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 de 2
- **Files modified:** 4 (4 modificados, 0 creados)
- **Commits:** 3 (2 de tarea + este de cierre)

## Accomplishments

- **La regla salió del JSX antes de escribirse.** El brief pedía extraer la lógica si era pura; lo era. `lib/service-categories.ts` —el precedente del repo para lógica pura de catálogo— ganó tres funciones y cuatro constantes: `catalogChips(groups, categoryCount)`, `filterCatalogGroups(groups, chipKey)`, `catalogGroupKey(group)`, y `CHIPS_MIN_CATEGORIES` / `ALL_GROUPS_KEY` / `ALL_GROUPS_TITLE` / `LOOSE_GROUP_KEY`. Consecuencia concreta: las tres cosas que más barato se rompen en un refactor —el umbral, el estado inicial y el borde del filtro— se prueban **ejecutándolas**, no leyendo el archivo con un grep.

- **El umbral es una constante y gatea dos cosas con el mismo número, a propósito.** `CHIPS_MIN_CATEGORIES = 2` corta (1) por **categorías creadas** —que es el eje que nombra D-16, y el único que distingue "cero categorías" de "categorías sin asignar"— y (2) por **grupos con título** en la salida de `groupCatalog`. El segundo corte no es celo: con dos categorías creadas y ninguna asignada, `groupCatalog` cae en su camino de identidad y devuelve un único grupo sin título; una barra ahí sería un control que no filtra nada y que además **insinuaría un agrupado que la pantalla no muestra**. Los dos cortes son el mismo criterio ("hacen falta al menos dos baldes entre los que elegir") y por eso comparten la constante.

- **`Todo` por defecto quedó escrito como invariante, no como default cómodo.** El comentario del estado y el test lo dicen igual: el chip `Todo` es lo que hace que esto **no** reabra la objeción que fundaba D-11. Y `filterCatalogGroups(groups, ALL_GROUPS_KEY)` devuelve **la misma referencia** que entró —testeado con `toBe`, no `toEqual`—, así que el estado por defecto (el de todas las visitas que no filtran) no paga ni un re-render del catálogo.

- **La sentinela no es el rótulo, y eso es un bug que no va a existir.** El molde de `forjo-tiendas` usa `TODAS = "Todo"` como sentinela **y** como texto visible, porque allá las claves son nombres de categoría. Acá las claves son ids, y un negocio es perfectamente capaz de llamar `Todo` a una categoría suya: con el rótulo como sentinela tendría dos chips que se leen igual y hacen cosas distintas. `ALL_GROUPS_KEY = '__todo__'` cierra eso por construcción.

- **Filtra, nunca apaga.** Una clave de chip que no matchea ningún grupo —el dueño borró la categoría en otra pestaña entre dos renders— devuelve el catálogo **entero**, nunca `[]`. Es la misma regla direccional de la invariante de conservación de `groupCatalog` y el mismo modo de falla que ya mordió dos veces en este repo (CR-01 de la Phase 20, y otra vez en la 21).

- **La accesibilidad del molde se portó completa, con su medición.** Contenedor `role="tablist"` con `aria-label="Filtrar el catálogo por categoría"`; cada chip `role="tab"` + `aria-selected`. Alto **real** de 44px (`min-h-11`) y **no** el pseudo-elemento estirado que usa la tarjeta del paso 1: adentro de un contenedor con `overflow-x` los píxeles que sobresalen vuelven scrolleable también el eje vertical y la rueda del mouse parada encima mueve la barra — está medido en el comentario `:56-60` del molde y el gate lo congela con un `not.toMatch(/after:-inset-[0-9]/)`. La fila scrollea en horizontal con la barra oculta en los dos motores (`[scrollbar-width:none]` + `[&::-webkit-scrollbar]:hidden`) y cada chip tiene foco visible (`focus-visible:ring-ring/50`).

- **Cero superficie de más.** No se portó el buscador ni la segunda fila de subcategorías (D-16 lo dice con todas las letras, y Forjo no tiene subcategorías). Cero paquetes, cero migraciones (41, medido), cero componentes de `components/ui`, cero iconos, cero hex. El chip elegido reusa el par `bg-primary`/`text-primary-foreground` del hero; el apagado va en `text-foreground` (16.2:1) y **nunca** en `text-primary`, que a 14px falla AA en 3 de las 5 paletas.

## Task Commits

1. **Task 1: La barra de chips como lógica pura, con sus 11 casos** — `0ff6962` (feat)
2. **Task 2: La barra en el paso 1 y los 7 gates del cableado** — `9dc5c1f` (feat)

## Files Created/Modified

- `lib/service-categories.ts` — +112 líneas al final: la cabecera de sección que explica por qué la regla vive acá y no en el render, las cuatro constantes, `CatalogChip`, y las tres funciones. Nada del módulo existente se tocó.
- `app/[slug]/booking-client.tsx` — el import del módulo pasa a multilínea; el estado `catalogChip` (inicial `ALL_GROUPS_KEY`) y dos `useMemo` (`chips`, `visibleCatalogGroups`) justo debajo del memo de `catalogGroups`; la barra de chips entre el `h2` y el catálogo, con su bloque de comentarios; el paso 1 itera `visibleCatalogGroups` y la `key` del envoltorio pasa a `catalogGroupKey(group)`. **Seis líneas borradas en total** (`git diff -w`): el import viejo, tres de un comentario que se reescribió para seguir siendo cierto, y las dos del `map`/`key`.
- `test/service-categories.test.ts` — un `describe` nuevo con **11 casos** (46 `it` en el archivo, de 35; **48 tests** contando los `it.each`, de 37) y ocho nombres más en el import.
- `test/catalog-public.test.ts` — un `describe` nuevo con **7 gates** (11 → **18**), más el ajuste del caso existente del render: ahora exige `visibleCatalogGroups.map` en vez de `catalogGroups.map`, con el comentario que explica por qué el cambio de nombre **no** debilita el gate.

## Decisions Made

Todo el diseño venía escrito: D-16 en el `24-CONTEXT.md` y G-24-6 en el `24-UI-SPEC.md`, los dos del 2026-09-28. Se ejecutaron tal cual. Lo que el contrato delegaba y se resolvió acá:

- **Dónde vive la lógica:** en `lib/service-categories.ts`, no en un módulo nuevo. Es el precedente del repo para lógica pura de catálogo y ya es la fuente única del agrupado y del orden de los que dependen los chips; partirlo en dos archivos habría puesto "el orden de los grupos" y "el orden de los chips" en lugares distintos.
- **El segundo gate del umbral** (grupos con título ≥ 2), descrito arriba. Es la única adición al contrato y sólo puede hacer que la barra **no** aparezca, nunca que aparezca donde D-16 no la pide.
- **`text-sm` (14px) y no `text-xs` (12px)** como en el molde: 14px es uno de los dos cuerpos que la fase ya introdujo (el `<h3>` de grupo), da 16.2:1 contra el fondo y no obliga a discutir el margen de AA.
- **Espaciado:** `mb-4` (16px) en la barra, `gap-2` (8px) entre chips, `px-4` (16px) de relleno. Los tres en la grilla de 4 de la §Spacing Scale del UI-SPEC, sin un solo valor arbitrario. El `mb-4` va **en la barra**, no en el `h2`: por eso el `h2` no se tocó y sin barra no hay ni un píxel de desplazamiento.
- **La `key` de React pasa a `catalogGroupKey(group)`** en vez de repetir el literal `'__sueltos__'`. Es el único toque al envoltorio de grupo y elimina la posibilidad de que el chip y la tarjeta hablen de claves distintas.

## Deviations from Plan

No hubo PLAN.md: el brief de la sesión fue la especificación, y D-16 / G-24-6 el contrato. Cero desviaciones respecto de ellos. Dos ajustes de ejecución, los dos dentro de lo que el brief delega:

**1. [Rule 3 - Blocking] El gate `region.not.toContain('.filter(')` era incorrecto y se acotó.**
- **Encontrado durante:** Task 2, al correr la suite (1 rojo de 18).
- **Problema:** la región del paso 1 ya contiene un `.filter(` **legítimo y preexistente**: el que compone el `aria-describedby` de la tarjeta (`[…].filter(Boolean).join(' ')`). Un gate genérico sobre `.filter(` habría empujado al siguiente a "arreglar" código que está bien.
- **Arreglo:** el gate quedó acotado a los grupos y los servicios (`catalogGroups.filter`, `visibleCatalogGroups.filter`, `Groups.sort`, `services.filter`, `services.sort`), con el comentario que explica por qué.
- **Commit:** `9dc5c1f`.

**2. [Rule 2 - Missing critical] El caso existente del render se actualizó, no se duplicó.**
- El gate `expect(region).toContain('catalogGroups.map')` tenía que pasar a `visibleCatalogGroups.map`. Dejarlo como estaba lo habría puesto rojo por el cambio correcto; borrarlo habría perdido el invariante. Se reescribió con un comentario que declara por qué el nombre nuevo **no** debilita el gate (el filtro sigue sin estar en el JSX: lo resolvió el módulo puro, y con `Todo` devuelve la misma referencia).

## Cómo se verificó que los caminos de 0 y de 1 categoría NO cambiaron

> El brief lo pedía explícito, y es el invariante más fácil de romper sin darse cuenta.

Por **tres** vías, ninguna de las cuales es "lo miré y parecía igual":

1. **En el dato, ejecutado.** Tres casos puros cubren los tres estados que tienen que dejar la pantalla como estaba: `catalogChips(identidad, 0)` → `[]`; una categoría con sus servicios + sueltos (dos grupos en la salida) → `[]`; dos categorías creadas y ninguna asignada (camino de identidad, un grupo sin título) → `[]`. Los tres son **controles negativos**: pasan sólo si el umbral existe de verdad.
2. **En el render, por construcción.** La condición es `{chips.length > 0 && (…)}`. Con `chips` vacío, React renderiza `false`, o sea **ningún nodo y ningún whitespace**: no hay un `<div>` vacío que pueda ocupar alto. Y el `mb-4` que separa la barra del catálogo está **en la barra**, no en el `h2` ni en un envoltorio nuevo — es el mismo argumento con el que G-24-2/P3 sostiene que `space-y-6` no emite margen con un hijo único. Sin barra, la distancia entre el `h2` y la grilla es exactamente la de antes.
3. **En el diff, medido.** `git diff -w` sobre `booking-client.tsx` borra **seis** líneas y **ninguna** es del `h2`, del envoltorio `space-y-6` ni del bloque de la tarjeta (`:587-661` del contrato G-24-3). Los tres conteos de la región siguen en **1 · 1 · 1**: `sm:grid-cols-2` (el picker de sedes del paso 3, fuera de alcance), `grid grid-cols-1 gap-3` (la grilla del paso 1) y `<h3` (el título de grupo). El `min-w-0 break-words` del `<p>` del nombre (commit `e7b5ef1`) quedó intacto.

## Verificación — números REALES medidos

| # | Criterio | Resultado |
|---|---|---|
| 1 | `./node_modules/.bin/tsc --noEmit` (nunca `npx tsc`) — `error TS` en la salida | ✅ **0** |
| 2 | `npx eslint` sobre los 4 archivos tocados | ✅ **0 findings**, `rc=0` |
| 3 | `npx vitest run test/service-categories.test.ts` | ✅ **48 passed** (de 37) · 1 file |
| 4 | `npx vitest run test/catalog-public.test.ts` | ✅ **18 passed** (de 11) · 1 file |
| 5 | `npx vitest run` (suite completa) | ⚠️ **1348 passed** · 2 failed · 4 expected fail · 6 skipped · **97 files** — ver la nota de abajo |
| 6 | Conteos de la región de `booking-client.tsx` | ✅ **1 · 1 · 1** (`sm:grid-cols-2` · `grid grid-cols-1 gap-3` · `<h3`) |
| 7 | Cuerpo de la tarjeta intacto (G-23-6 / G-24-3) | ✅ `git diff -w` borra 6 líneas, ninguna del bloque de la tarjeta |
| 8 | `ls supabase/migrations/*.sql \| wc -l` | ✅ **41** (sin cambios) |
| 9 | `git diff package.json package-lock.json` | ✅ **vacío** — cero paquetes nuevos |
| 10 | UAT visual de la barra en el navegador | ⏳ **PENDIENTE** — cierre de fase (`human_verify_mode: end-of-phase`) |

### La nota del criterio 5: los 2 rojos son el reloj, y se reconcilian al número

La suite corrió a las **00:47 AR**, o sea **fuera** de la ventana `[01:00, 23:30]` que exigen los dos canarios horarios. Los dos rojos son exactamente esos, con su propio mensaje diciéndolo:

- `test/service-delete-gate.test.ts` → *"GUARD DE MEDIANOCHE: son las 00:49:46 en hora AR, fuera de [01:00:00, 23:30:00]. Los casos 12, 13 y 14 se SALTEARON… El resto del archivo SÍ corrió."*
- `test/capacity-mode-change-gate.test.ts` → el mismo guard, por el mismo motivo.

**No es una regresión, y la aritmética lo cierra sin margen de interpretación:**

| | Antes (plan 24-02, 01:13 AR, en ventana) | Ahora (00:47 AR, fuera de ventana) |
|---|---|---|
| passed | 1337 | 1348 |
| failed | 0 | **2** (los canarios) |
| expected fail | 4 | 4 |
| skipped | 1 | **6** (+5: los casos horarios que el guard saltea) |
| **total** | **1342** | **1360** |

Delta de total = **18**, que son exactamente los **18 casos nuevos** de este plan (11 puros + 7 gates). Y `1348 + 2 + 6 = 1356 = 1337 + 18 + 1` — los 1337 de la corrida anterior más los 18 nuevos más el caso que antes estaba skipeado. **Piso del brief (1337 / 97 files): superado.** Los 97 archivos siguen siendo 97. Volver a correrla dentro de la ventana antes de dar la fase por verde.

## Deuda y asunciones declaradas

- **La UAT visual de la barra no se corrió.** Es el único criterio sin medir de este plan, y es el importante: la barra existe porque el dueño vio su catálogo real: su criterio de éxito es el mismo acto. Puntos a mirar: que aparezca con su catálogo, que filtre al toque, que `Todo` vuelva al completo, que **no salte el scroll**, que los chips no se apilen en tres renglones a 375px, y el control negativo de un negocio con 0 y con 1 categoría.
- **La suite completa quedó con los dos canarios horarios en rojo por la hora** (00:47 AR). Hay que re-correrla dentro de `[01:00, 23:30]`.
- **El vertical canchas sigue afuera.** `app/[slug]/canchas-booking-client.tsx` es otro componente y quedó fuera de alcance por decisión escrita de la Phase 23. No tiene barra de chips.
- **Las dos asunciones diferidas del UI-SPEC siguen abiertas** por decisión explícita del usuario del 2026-09-22, y este plan no las toca: cero **servicios** deja el paso 1 en blanco bajo el `h2` (preexistente), y un nombre de servicio de 40+ caracteres sin espacios a 375px (D-07 LOCKED gana).
- **`G-24-6` del `24-UI-SPEC.md` y `D-16` del `24-CONTEXT.md` no se editaron.** Son el contrato de entrada de este plan, escritos por el usuario el mismo día; el summary no reescribe el contrato.

## Known Stubs

Ninguno. Las tres funciones nuevas tienen implementación completa y testeada, la barra tiene su fuente de datos real (`catalogGroups` + la cantidad de categorías que ya llegaba por prop) y no quedó ningún valor vacío cableado a la UI.

## Threat Flags

Ninguna superficie nueva. La barra es estado **local** de un client component: cero lecturas, cero escrituras, cero endpoints, cero migraciones (41, medido), cero `GRANT`, cero paquetes. El texto que pinta cada chip es el `name` que escribió el dueño y llega **interpolado** en JSX (auto-escape de React) por el mismo camino que el `<h3>` de grupo — T-23-06 / T-23-10 / T-23-26 siguen `closed`, y el gate de `dangerouslySetInnerHTML` sobre el archivo entero sigue verde. El filtro **no** puede revelar nada que la pantalla no mostrara ya: opera sobre los grupos que el servidor mandó, y su peor caso es mostrarlos todos.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

La fase 24 queda con sus tres planes ejecutados y una sola cosa pendiente, la misma que arrastran los tres: la **UAT visual**, ahora con dos puntos más (los 14 del `24-UAT.md` más la barra de chips y sus controles negativos de 0 y 1 categoría). Nada bloquea el `secure-phase` ni el `code-review`.

## Self-Check: PASSED

Los 4 archivos modificados y el SUMMARY existen en disco; los 2 commits de tarea (`0ff6962`, `9dc5c1f`) existen en `git log`. `git rev-list --count e7b5ef1..HEAD` = **2** al momento del self-check; el commit de cierre de docs es el tercero.
