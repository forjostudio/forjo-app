---
phase: 17-superficie-y-polish
plan: 10
subsystem: ui
tags: [react, tailwind, touch-targets, accesibilidad, servicios, cupo]

requires:
  - phase: 17-superficie-y-polish
    provides: "17-06 puso el modo como tercer dato de la línea y bajó el stepper a un renglón propio (G-02b); 17-09 refactorizó el control sin tocar su composición"
provides:
  - "El control de cupo inline dejó de ser hijo de la línea de datos: ahora es una fila hermana de la tarjeta"
  - "Zona de exclusión táctil de 32px entre cualquier texto inerte de la tarjeta y el primer píxel de un botón"
  - "La línea de datos de la tarjeta quedó demostrablemente inerte: cero descendientes interactivos, con gate que lo prueba"
  - "El rótulo del modo lo resuelve y renderiza la tarjeta (CAPACITY_MODE_HELP sigue siendo fuente única, D-03)"
affects: [17-UAT ronda 4, cualquier plan que vuelva a tocar la tarjeta de /servicios]

tech-stack:
  added: []
  patterns:
    - "Texto inerte y botón no pueden ser vecinos en mobile: la corrección del punto de toque del navegador convierte un gesto de lectura en una escritura"
    - "La separación se compra con padding propio del bloque interactivo (suma determinista al ritmo del contenedor), nunca con margen ni achicando el target"

key-files:
  created: []
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"

key-decisions:
  - "G-04 es geometría táctil, no un manejador suelto: el label nunca tuvo onClick y el contenedor tampoco"
  - "La zona de exclusión es de 32px y es una decisión DERIVADA, no una medición: sale del piso táctil de 44px del proyecto (radio 22px) contra un renglón de 18px"
  - "Se descartó achicar los botones (rompe el piso táctil) y volver al apilado en tres niveles (deshace G-02b)"
  - "Si la UAT todavía reproduce el defecto, la salida NO es un tercer aumento de padding: el próximo movimiento es estructural y es decisión del dueño"

patterns-established:
  - "Gate de anidamiento: contar `</div>` entre dos anclas del JSX prueba que un nodo salió de un contenedor, cosa que ningún gate de conteo de clases puede probar"
  - "Gate de inercia: acotar con sed el rango de un contenedor de texto y exigir 0 aperturas de botón, manejadores de click, roles e índices de tabulación"

requirements-completed: [POLISH-08]

duration: 28 min
completed: 2026-08-24
status: complete
---

# Phase 17 Plan 10: Cierre de G-04 — el control del cupo deja de ser vecino del texto Summary

**El bloque `[−] N [+] lugares [Guardar]` salió del contenedor de texto de la tarjeta de servicio y pasó a ser una fila hermana con 24px de padding propio, que sumados a los 8px del ritmo de la tarjeta dan 32px de zona de exclusión táctil arriba y abajo de los botones de 44px — sin achicar un solo target y sin deshacer el renglón único que el dueño verificó en las rondas 2 y 3.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-08-24T17:30:00Z
- **Completed:** 2026-08-24T17:58:00Z
- **Tasks:** 2 de 2
- **Files modified:** 1

## Las tres mediciones de confirmación (Task 1)

El plan exigía volver a medir el diagnóstico antes de tocar nada, no heredarlo. Las tres dieron lo esperado.

**1 — No hay ningún manejador que sacar.** El `span` del rótulo (L689 antes del cambio) es
`<span className="font-medium text-foreground">{label}</span>`: sin manejador de click, sin rol y sin
índice de tabulación. El `div` contenedor de la línea de datos tampoco tiene ninguno. Acotando con
`sed` el rango entre el `div` de la línea de datos y el control, el conteo de
`<[Bb]utton|onClick=\{|role=|tabIndex=` daba **0 antes** del cambio y da **0 después**. El defecto no
podía venir de ahí — y además ningún manejador suelto podría explicar que el efecto cambie de
dirección según dónde aterrice el dedo.

**2 — Los botones del stepper no tienen el área de toque agrandada por CSS.** `components/ui/button.tsx`
no declara ningún pseudo-elemento (`before:`/`after:` → **0**). `app/globals.css` tampoco (**0**). Las
seis apariciones de `44px` en `globals.css` están todas fuera de alcance: dos en `.auth-cream-panel`
(el panel de login), una en un botón del landing (`min-height: 2.75rem`), una en una sombra
(`0 14px 44px`) y dos en `.frj-lb-btn` (el chrome del visor de imágenes). Ninguna alcanza al stepper,
que son `<button>` crudos con `h-11 w-11 sm:h-8 sm:w-8`. El área de toque es la caja, y nada más.

**3 — La aritmética horizontal se re-confirmó contra las clases reales.** Interior de la tarjeta a
375px: `375 − 32 (p-4 del layout, L50 de `app/(dashboard)/layout.tsx`) − 48 (p-6 de la `Card`) − 24
(p-3 de la tarjeta) = **271px**`. Las dos capas caen así:

| Capa | Pieza | Rango medido | Rango del plan |
|---|---|---|---|
| Línea de datos (`text-xs`, 12px) | `60min · $7.000` | 0 – 92 | 0 – 92 |
| | `·` (con `gap-x-2` = 8px a cada lado) | 100 – 106 | 100 – 106 |
| | `Clase grupal` | 114 – 188 | 114 – 188 |
| Stepper (146px: 1 borde + 44 + 56 `w-14` + 44 + 1 borde) | `−` | 1 – 45 | 1 – 45 |
| | campo del número | 45 – 101 | 45 – 101 |
| | `+` | 101 – 145 | 101 – 145 |

`60min · $7.000` arranca encima del `−` ⇒ **baja**. `Clase grupal` arranca encima del `+` ⇒ **sube**.
Es exactamente lo que reportó el dueño, y se deriva sin navegador. El rótulo `Clase grupal` se
confirmó en `CAPACITY_MODE_HELP` (L206). En el eje vertical: renglón de ~18px, `gap-y-1` = 4px,
y abajo un botón de 44px — el dedo centrado en el texto cae adentro del botón.

**Ninguna base del plan tuvo que ajustarse.** Los 23 conteos de la tabla de criterios coincidieron con
el archivo antes del primer cambio, incluido el gate estructural (`</div>` entre la línea de datos y
el control = **0**) y `DL=2286 < CI=2293 < SO=2303`.

## De dónde salen los 32px

Es una **decisión derivada, no una medición**, y así queda escrito en el código. No se puede medir el
radio de corrección del punto de toque de un navegador desde este repo. Lo que hay son dos anclas:

1. **La constante del proyecto.** `CLAUDE.md` exige targets de 44px porque ése es el ancho de contacto
   que se le supone a un dedo ⇒ radio de 22px. Un dedo centrado en un renglón de 18px llega hasta
   `9 + 22 = 31px` por debajo del techo del texto.
2. **La evidencia de campo, que son sólo dos puntos.** El nombre del servicio está a ~30px por encima
   del stepper y nunca falló. La línea de datos estaba a 4px y falló el 100% de las veces.

⇒ 32px es el primer paso de la escala que supera las dos anclas. Se arma con **24px de padding
vertical propio de la fila + 8px del `space-y-2` de la tarjeta**. Va como padding y no como margen
porque el padding suma al ritmo de la tarjeta de forma determinista; un margen pelearía con él.

⚠ **Si la ronda 4 de UAT todavía reproduce el defecto, la respuesta NO es un tercer aumento de
padding.** Significaría que la corrección de toque de ese navegador alcanza más de 32px y que la
salida deja de ser de espaciado. El próximo movimiento —que el stepper aparezca detrás de un control
explícito— es una decisión del dueño, no un ajuste del ejecutor.

## Por qué no hay prueba automática de esto

**No hay prueba automática posible de este defecto en este repo.** El runner corre en
`environment: 'node'` y el repo no tiene ninguna librería de render de componentes: no hay con qué
montar la tarjeta, ni con qué despachar un toque, ni con qué pedirle al motor de layout las cajas de
los elementos. Agregar una es una dependencia nueva y una decisión de infraestructura que excede este
plan, así que **no se agregó y no se simuló ningún criterio que pretenda cubrir un toque**.

Lo estructural lo cubren los gates de conteo y el gate de anidamiento. **Lo vivencial lo cierra el
guion de UAT del plan, y nada más.**

## Tasks completadas

| Task | Nombre | Commit |
|---|---|---|
| 1 | El control deja la línea de datos y pasa a ser una fila propia con 32px de zona de exclusión | `b4592e0` |
| 2 | La línea de datos queda demostrablemente inerte y la composición de G-02b se re-mide | sin cambios de código — ver abajo |

**Task 2 no produjo commit propio.** Su parte B (escribir la invariante de los 32px en el comentario
del `div` de la fila del control, con las cuatro piezas: qué, cómo, por qué y de dónde sale el 32, más
el corolario de la recaída) ya quedó escrita dentro del mismo cambio de la Task 1, porque el
comentario vive en el bloque que la Task 1 reescribe entero: separarlo en dos commits habría partido
un bloque de comentario a la mitad. Sus partes A y C son verificación pura, y todas pasaron; quedan
registradas abajo.

## Gates de aceptación (base → resultado)

Los 23 conteos, todos sobre `app/(dashboard)/settings/settings-client.tsx`:

| Gate | Base | Esperado | Resultado |
|---|---|---|---|
| `flex items-center gap-x-2 gap-y-1 py-6 text-xs text-muted-foreground` | 0 | 1 | **1** PASS |
| `className="[^"]*py-6` | 0 | 1 | **1** PASS |
| `className="[^"]*basis-full` | 1 | 0 | **0** PASS |
| `gap-x-2 gap-y-1` | 2 | 2 | **2** PASS |
| `flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground` | 1 | 1 | **1** PASS |
| `h-11 w-11 sm:h-8 sm:w-8` (piso táctil del stepper) | 2 | 2 | **2** PASS |
| `min-h-11` | 7 | 7 | **7** PASS |
| `min-w-24` | 1 | 1 | **1** PASS |
| `hidden sm:inline` | 1 | 1 | **1** PASS |
| `font-medium text-foreground` | 5 | 5 | **5** PASS |
| `CAPACITY_MODE_HELP` | 6 | 6 | **6** PASS |
| `const label = CAPACITY_MODE_HELP.find` | 1 | 0 | **0** PASS |
| `capacityModeLabel` | 0 | 2 | **2** PASS |
| `capMode !== 'individual'` | 1 | 2 | **2** PASS |
| `CapacityInlineControl` | 3 | 3 | **3** PASS |
| `CapacityStepper` | 4 | 4 | **4** PASS |
| `onKeyDown={` | 2 | 2 | **2** PASS |
| `onClick={` | 63 | 63 | **63** PASS |
| `tabIndex=` | 0 | 0 | **0** PASS |
| `role="button"` | 0 | 0 | **0** PASS |
| `flex shrink-0 items-center gap-1` (acciones de R2-1) | 1 | 1 | **1** PASS |
| `capacityFocusedRef.current` (D-06) | 3 | 3 | **3** PASS |
| `onInputFocus={` (D-06) | 1 | 1 | **1** PASS |

### El gate estructural — el que discrimina el fix de un no-op

```
antes:   DL=2286  CI=2293  SO=2303   cierres </div> entre DL y CI = 0
después: DL=2304  LB=2316  CI=2321  SO=2329   cierres </div> entre DL y CI = 1
```

`0 → 1`: la línea de datos **cerró** antes de que empiece el control. El orden
`DL < LB < CI < SO` se sostiene: el rótulo (`{capacityModeLabel}`, L2316) se quedó adentro de la línea
de datos, el control salió y quedó entre la línea de datos y el bloque de sedes.

### La línea de datos es inerte

Acotando con `sed` el rango `DL..CI` y contando
`<[Bb]utton|onClick=\{|role=|tabIndex=` con `-cE`: **0**. (Con `-E`, nunca `-ciF`: en el Git Bash de
esta máquina `grep -ciF` aborta con código 134.)

## G-02b sigue en pie

La fila del control es **hija directa** del contenedor de la tarjeta
(`p-3 rounded-lg bg-secondary/50 space-y-2`), igual que la línea de datos y que el bloque de sedes.
Dispone de los 271px enteros, así que la aritmética del renglón único de 17-06 no cambió:
`146 (stepper) + 8 (gap) + 96 (botón) = 250px ≤ 271px`. Verificado además pieza por pieza: el sufijo
`lugares` conserva su clase condicional (`hidden sm:inline`, cede el ancho sólo en mobile y sólo con
la fila sucia), el botón conserva su ancho mínimo (`min-w-24`) y su propio piso táctil (`min-h-11`), y
los dos botones del stepper conservan `h-11 w-11 sm:h-8 sm:w-8`. **Nada se achicó para comprar espacio
vertical.**

## Los servicios `individual` no cambiaron (D-07)

El separador, el rótulo del modo y la fila del control viven los tres dentro de un condicional
`capMode !== 'individual'`. En una tarjeta individual no se renderiza ninguno de los tres: el `div` de
la línea de datos queda con su único `span` de duración y precio, y no aparece ningún hermano nuevo,
así que el `space-y-2` de la tarjeta no suma ni un píxel. Verificado contra el JSX resultante, no de
memoria. El separador y el rótulo viajan dentro del **mismo** condicional, que es lo que evita que
quede un `·` colgando solo (R2-1).

## El camino de escritura no se tocó

`saveCapacityInline` y `CapacityStepper` aparecen en el diff crudo (4 y 2 líneas), pero con
`git diff -w` **desaparecen los dos: son puras re-indentaciones** del bloque que cambió de padre
(`onSave={c => saveCapacityInline(s, c)}` y `<CapacityStepper` idénticos, dos espacios menos). El
cuerpo de la función, acotado con `sed`, sigue con el payload de **una sola clave**
(`.update({ capacity })` = 1, cero updates con coma) y el **filtro por tenant**
(`.eq('business_id', business.id)` = 1). La RLS sigue siendo la segunda capa, nunca la única.

## Alcance del diff

`git diff --stat` → **un solo archivo**: `app/(dashboard)/settings/settings-client.tsx`
(99 inserciones, 73 borrados).

`git diff -- package.json package-lock.json components/ui/ lib/ test/ "app/(dashboard)/agenda/" "app/(dashboard)/finances/"` → **vacío**. Cero dependencias nuevas.

En el diff del archivo **no aparecen** (con `-w`): el renglón del nombre
(`text-sm font-medium truncate` = 0), el contenedor de las acciones
(`flex shrink-0 items-center gap-1` = 0), `CapacityStepper` (0), `CapacityModeFields` (0),
`saveCapacityInline` (0). El explicador y el diálogo tampoco.

## Verificación

| Check | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **exit 0** |
| `npm run build` | **compila**, sin warnings nuevos. Las 23 rutas se generan igual que antes |
| `npx vitest run test/agenda-occupancy.test.ts --no-file-parallelism` | **20 passed (20)**, 1 test file |
| Dev server del puerto 3000 | **vivo** (`HTTP 200` en `/login`) — no se levantó ninguno nuevo; Next 16 separa `.next/dev` de `.next/build` y el build no lo tumbó |
| `git diff --stat` | un solo archivo de código |

`npx tsc` a secas **no se usó como gate**: en esta máquina siempre sale 0. El `npx vitest run`
completo tampoco: es flaky por las suites de abono (pre-existente, registrado en el CONTEXT).

## El guion de UAT no se modificó

Los cuatro pasos del `<uat_script>` describen exactamente lo que quedó implementado y se mandan tal
cual:

- **Paso 1** (el que importa): la tarjeta muestra el nombre con sus acciones, debajo
  `60min · $7.000 · Clase grupal`, y **más abajo, claramente separado**, el `[−] N [+] lugares`. Es la
  estructura resultante.
- **Paso 2** conserva la mitad positiva de R3-3, que **nunca se llegó a verificar** (en la ronda 3 el
  negativo falló antes): que `Guardar` aparece, revierte solo al volver al valor original, guarda con
  toast, y que el estado de guardado es por tarjeta.
- **Paso 3** incluye el negativo de D-07 (una tarjeta individual no creció de alto).
- **Paso 4** prueba la adyacencia gemela de abajo sobre una tarjeta donde `Todos` ya está activa, a
  propósito, para que un toque de más sea idempotente y no destruya la configuración del dueño. **Ese
  detalle de seguridad se preservó.**

## La adyacencia gemela que se dejó sin tocar

El texto `Se ofrece en:` está a ~8px horizontales de la pill `Todos` (`gap-1.5` = 6px, en un contenedor
`flex flex-wrap items-center`). Es **la misma clase de riesgo con otro dato**: un texto inerte pegado a
un control, esta vez en el eje horizontal y con las sedes en juego en vez del cupo. Está **fuera del
alcance de G-04** y este plan no la toca. Queda registrada acá para que no se descubra dos veces, y el
paso 4 del guion la sondea de forma segura.

Lo que sí cambió a favor: entre el botón `+` del stepper y el texto `Se ofrece en:` ahora hay los
mismos 32px (24 de padding-bottom de la fila del control + 8 del ritmo de la tarjeta), donde antes
había 8. La fila nueva protege el bloque de sedes por el mismo mecanismo con que se protege a sí misma.

## Deviations from Plan

None - plan executed exactly as written.

La única nota de ejecución, ya explicada arriba, es que la Task 2 no generó commit propio porque su
única acción de escritura (el comentario con la invariante) vive dentro del bloque que la Task 1
reescribe entero. Sus verificaciones corrieron completas y pasaron todas.

## Issues Encountered

Ninguno.

## Known Stubs

Ninguno.

## Next Phase Readiness

Listo para la **cuarta ronda de UAT** con el guion del plan, sobre el dev server que ya está corriendo
en el puerto 3000. El defecto es de geometría táctil: **hay que probarlo con el dedo a 375px, no con
el mouse** — con un puntero no se reproduce.

Si el paso 1 todavía reproduce el defecto, la decisión siguiente es del dueño y es estructural, no un
tercer aumento de padding.

## Self-Check: PASSED

- `app/(dashboard)/settings/settings-client.tsx` — FOUND
- `.planning/workstreams/motor-reservas/phases/17-superficie-y-polish/17-10-SUMMARY.md` — FOUND
- commit `b4592e0` — FOUND en `git log --all`
