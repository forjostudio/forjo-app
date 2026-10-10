# 261009-tzf — Compactar el banner de plan y el header de `/clients`

Ítem del quick-batch `261009-tzc`, workstream `panel-nav`. Base: `8714de0`.

## Qué se cambió

| # | Cambio | Commit |
|---|---|---|
| 1 | El banner de plan entra en una sola fila (dos líneas de texto + botón al lado) | `1fdab7d` |
| 2 | Exportar/Importar suben a la fila del título de `/clients` como iconos | `3014bce` |
| 3 | Candado: las acciones secundarias no vuelven a ocupar una fila propia | `3093dd0` |

## El alto ganado, MEDIDO

**Método: sonda CDP sobre WebSocket** (Node 24, `WebSocket` global, cero dependencias nuevas),
reusando el esqueleto de `probe.cjs` del ítem `261009-tzb` del mismo batch. La sonda:

1. monta el markup **fiel** del banner y del header del panel izquierdo (las clases de `Button` se
   componen con el mismo `cva` de `components/ui/button.tsx`);
2. le inyecta el **CSS realmente construido** (`.next/static/chunks/*.css`) — el "antes" se midió con
   el CSS del build de `8714de0` y el "después" con el del build posterior al cambio, así que ninguna
   clase se mide contra una hoja que no la tiene;
3. emula el viewport con `Emulation.setDeviceMetricsOverride` (375×812 y 1280×900);
4. mide con `getBoundingClientRect` después de `document.fonts.ready`.

Script: `scratchpad/header-probe.cjs`. Salidas crudas: `scratchpad/antes.txt`, `scratchpad/despues.txt`.

### 375×812 (el teléfono del reporte)

| Pieza | Antes | Después | Δ |
|---|---|---|---|
| Banner de plan (trial) | **102.0px** | **75.1px** | **−26.9px** |
| Banner de plan (expired) | 122.0px | 90.7px | −31.3px |
| Header de `/clients` | **327.0px** | **283.0px** | **−44.0px** |
| Dónde arranca la lista (`y` del contenedor) | **485.0px** | **414.1px** | **−70.9px** |
| Nombres enteros visibles (en la sonda) | 7 | 8 | +1 |

Las **−44px** del header son exactamente una fila completa: los 32px del grid 2-col más los 12px de
su hueco del `space-y-3`. Las filas quedaron así (`#rN` = alto medido):

```
antes:    r1=28 (título)  r2=32 (grid CSV)  r3=32 (CTA)  r4=24  r5=32  r6=32  r7=42
después:  r1=28 (título)                    r3=32 (CTA)  r4=24  r5=32  r6=32  r7=42
```

La fila del título **sigue midiendo 28px** con los tres iconos adentro: los 44×44 van con `-my-3`,
así que la caja mide 44 pero aporta 20px de alto y la fila la sigue fijando el `<h1>`.

### 1280×900 (desktop, para control)

| Pieza | Antes | Después | Δ |
|---|---|---|---|
| Banner de plan | 78.0px | 83.1px | **+5.1px** |
| Header de `/clients` | 305.0px | 261.0px | −44.0px |
| Dónde arranca la lista | 439.0px | 400.1px | −38.9px |

### Lo que resultó distinto de lo esperado

1. **La fuente cambiaba la respuesta.** Con la fallback del sistema, el banner "antes" medía **70px**
   (una sola fila: el texto entraba). Cargando la **Space Grotesk real** self-hosteada por `next/font`
   (vía `@font-face` apuntando a `.next/static/media/`), la línea mide 250px, con el botón al lado no
   entra en los 311px útiles, `flex-wrap` lo baja y el banner mide **102px** — las dos filas que
   describía el ítem. Sin la fuente real, la mitad del trabajo habría parecido innecesaria. (El 102
   coincide con el valor que ya había usado la sonda de `261009-tzb`.)
2. **En desktop el banner creció 5px.** Ahí el texto entraba en una línea, así que partirlo en dos
   agrega una línea de 15.6px y saca el hueco de 12px del wrap. No se compensó con una variante `lg:`:
   el neto de desktop sigue siendo **−38.9px** (el header baja 44), no hay presión de alto en una
   pantalla grande, y una variante más es una rama más que mantener por 5px.
3. **El solape del área táctil con el CTA era el riesgo real y no se materializó:** medido
   `solapeConCTA = −4px`. Los 8px que el icono de 44px sobresale por abajo caben en los 12px del
   `space-y-3`, así que no le roba el toque a "Nuevo cliente".

## Decisiones

### El banner: se compactó UNA de las cuatro ramas de render

Sólo la rama normal (`expired` / `trial`). Las tres de `confirmState` (`active`, `confirming`,
`timeout`) quedaron como estaban, y el motivo está escrito en el código:

- son **transitorias**: `active` se auto-apaga a los 5s, `confirming` vive hasta 36s, y sólo se ven
  al volver del checkout de MercadoPago — nunca en el día a día;
- **ya son una fila de layout**: un icono + un `<p>`, sin botón ni segunda acción que subir;
- por eso **no hay fila que eliminar**. Lo único recortable sería el texto, y acortar "no reintentes
  el pago — ya lo recibimos" para ganar una línea en una pantalla que se ve una vez es cambiar
  claridad por píxeles en el peor momento posible para confundir al dueño.

La rama normal, en cambio, la ve **todo negocio nuevo en las 15 pantallas del panel** (`plan_status`
tiene `DEFAULT 'trial'`): es donde los 27px rinden.

Detalles de la rama compactada:
- dos líneas: título (`text-sm leading-tight`) + detalle (`text-xs leading-[1.3]`, atenuado), en el
  espíritu del header de dos líneas de `panel-top-bar.tsx`. La segunda va en **12px y no en los 11px**
  del header: ahí es chrome de navegación de una palabra, acá es un dato que el dueño lee
  ("3 días restantes"), y el `CLAUDE.md` no quiere texto chico sin motivo;
- se fue `flex-wrap`; lo que absorbe el texto largo es el `min-w-0` del bloque de texto;
- la segunda línea **envuelve**, no trunca: la rama `expired` la necesita (su detalle mide ~300px) y
  truncar justo la instrucción de cómo seguir usando la app sería peor que una línea más;
- el padding (`py-3`) no se tocó: el pedido era la fila, no el espaciado.

### El header: la fila del título SIGUE replegándose en modo búsqueda

Se evaluó dejar de replegarla ahora que se lleva las tres acciones secundarias. Se decidió
**mantener el repliegue**:

- **no se pierde ningún acceso que antes existiera**: esas tres acciones ya se escondían en modo
  búsqueda (Exportar/Importar estaban en la fila del grid con `hidden lg:grid`, y fusionar en la del
  título). El comportamiento mientras se busca es **exactamente el de hoy**;
- el motivo original sigue en pie: ninguna de las tres se acciona mientras se escribe un nombre, y
  replegar la fila devuelve 40px (28 del título + 12 del hueco) justo cuando el teclado se come la
  pantalla;
- sigue siendo `hidden lg:flex` (CSS, sólo mobile), así que el candado del bloque 10 que exige `lg:` +
  `hidden` y prohíbe el desmontaje condicional sigue verde y sigue aplicando.

El `hidden lg:grid` de la fila del grid se fue con la fila. Quedan dos repliegues en vez de tres.

### Otros detalles del header

- **"Exportar CSV" sigue siendo `<a href="/api/export/clients" download>`**. Lo único que perdió es
  el texto. Pasarlo a `<Button>` obligaría a un fetch + blob por nada.
- Las tres comparten una clase nueva, `ACCION_ICONO`, **copiada tal cual** del icono de fusionar que
  ya vivía en la vista de detalle de este mismo archivo (44×44 con `-my-3`, hover de color sin fondo,
  `focus-visible:ring-3`). No se inventó patrón ni se agregó una librería de tooltip (el repo no
  tiene componente `Tooltip`).
- **Accesibilidad:** cada icono lleva `aria-label` propio en español con verbo + objeto, y `title`
  **además** para el mouse. El `title` no se usa como nombre accesible: en touch no hay hover, y es la
  regla que ya declara el contrato del slot de acciones de `panel-top-bar.tsx`. El botón de fusionar
  **ganó** nombre accesible y foco visible, que como `<button>` crudo con `p-1` no tenía — y pasó de
  24px a 44px de área táctil.
- `min-w-0 truncate` en el `<h1>`: el grupo de iconos ocupa 132px de un panel angosto (`lg:w-80`), así
  que un término largo del vertical trunca en vez de empujar los iconos fuera del `overflow-hidden`.
- Se descartó abreviar a "Imp"/"Exp" (el `CLAUDE.md` pide verbo + contexto; "Imp" no se entiende).
- `buttonVariants` quedó sin uso en el archivo y se sacó del import.

## El candado, probado con mutación

Caso nuevo en el **bloque 10** de `test/panel-nav-chrome.test.ts`:
`las acciones secundarias de /clients no vuelven a ocupar una fila propia`.

Recorta el header (de sus clases a `ref={listRef}`), con guarda de honestidad si el recorte sale
vacío, y afirma: el **único** control de ancho completo es el CTA primario; no hay `grid-cols-`; las
tres secundarias comparten `ACCION_ICONO`; la clase trae `h-11`, `w-11` y `focus-visible:`; hay al
menos tres `aria-label`; y Exportar sigue siendo `<a href … download>`.

**Agujero que cierra, medido:** con la fila del grid de vuelta, las dos suites quedaban en **verde**.
Los candados de la fase vigilan el repliegue por `modoBusqueda` — y el grid **también** se replegaba,
así que ninguno veía su regreso. Nada medía el alto del header.

### Mutación 1 — revertir el cambio del header (`git show HEAD~2:… > …`)

```
 FAIL  |pure| test/panel-nav-chrome.test.ts > 10 · los controles de durabilidad que antes eran gate de plan > las acciones secundarias de /clients no vuelven a ocupar una fila propia
AssertionError: el header de /clients tiene más de un control de ancho completo: las acciones secundarias volvieron a ocupar su propia fila: expected 3 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 3

 ❯ test/panel-nav-chrome.test.ts:787:166

 Test Files  1 failed (1)
      Tests  1 failed | 44 passed (45)
```

### Mutación 2 — bajar el área táctil (`h-11 w-11` → `h-6 w-6` en `ACCION_ICONO`)

```
AssertionError: ACCION_ICONO perdió `h-11`: sin eso el icono no llega a 44×44 o no muestra el foco: expected '-my-3 flex h-6 w-6 shrink-0 items-cen…' to contain 'h-11'

Expected: "h-11"
Received: "-my-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"

 ❯ test/panel-nav-chrome.test.ts:798:118
```

Las dos mutaciones se revirtieron con `git checkout --` sin commitearlas;
`git status --porcelain -- app components lib test` quedó **vacío** después de cada una.

## Gates

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **rc 0** |
| `npx vitest run` | **rc 0** — `Test Files 108 passed (108)` · `Tests 1699 passed \| 4 expected fail \| 1 skipped (1704)`, corrida limpia (+1 caso vs. el piso de 1698) |
| `npm run build` | **rc 0** |
| `npx eslint` sobre los dos archivos | 1 error **PREEXISTENTE**, cero hallazgos nuevos (ver abajo) |
| CSS del build | `-my-3`, `h-11`, `w-11`, `-mr-2`, `min-w-0`, `truncate`, `leading-tight`, `leading-[1.3]` **generan estilo** (verificado por `grep` sobre `.next/static/chunks/*.css`) |

**El error de eslint es preexistente:** `react-hooks/set-state-in-effect` en
`plan-banner.tsx:79` — el `setModalOpen(true)` del efecto que abre el modal cuando se llega desde un
CTA del landing. Mismo archivo y misma línea en `HEAD~3`, y el primer hunk del diff arranca en la
línea 87 (`git diff HEAD~3 --unified=0` → `@@ -86,0 +87,8 @@`), así que el efecto no se tocó. Es de
la misma clase que el de `finances-client.tsx:290` que el brief ya listaba; el brief no lo mencionaba
pero no es nuevo. `clients-client.tsx` salió sin hallazgos.

El reloj al arrancar: `9/10/2026, 10:10` AR — dentro de `[01:00, 23:30]`, los dos canarios no aplican.

## Lo que queda abierto

- **UAT visual pendiente**: todo lo de acá es medición, no ojo humano. Conviene mirar en el teléfono
  (a) que los tres iconos del header se lean como un grupo y se distingan entre sí, y (b) el banner de
  la rama `expired` con su detalle en dos líneas.
- Quien toque el banner: el `+5.1px` en desktop es conocido y aceptado.
