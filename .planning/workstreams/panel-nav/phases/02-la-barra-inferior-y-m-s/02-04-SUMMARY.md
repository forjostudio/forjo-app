---
phase: "02-la-barra-inferior-y-m-s"
plan: "04"
subsystem: panel-nav
tags: [testing, candados, accesibilidad, uat, mobile]
status: complete

requires:
  - "components/dashboard/nav-groups.ts (02-01) — pura y sin directiva de cliente"
  - "components/dashboard/panel-bottom-nav.tsx (02-01)"
  - "app/(dashboard)/mas/mas-client.tsx (02-02)"
  - "components/dashboard/panel-top-bar.tsx (02-03)"
  - "components/dashboard/sidebar.tsx (02-03, sin el segundo menú)"
provides:
  - "test/panel-nav-groups.test.ts — el candado del reparto barra/Más (25 casos)"
  - "test/panel-nav-chrome.test.ts — el candado estático de los invariantes invisibles (36 casos)"
  - "El guion de la UAT en celular real, con los 5 ítems irreducibles y los 2 recorridos que no son bugs"
  - "Evidencia MEDIDA de los criterios 1 y 2 de la fase (sonda headless en iframe, 80 pasadas)"
affects:
  - "nada de app/, components/ ni lib/ — este plan sólo agrega dos archivos de test"

tech-stack:
  added: []
  patterns:
    - "candado puro de función framework-agnostic (carril `pure`, environment node)"
    - "barrido estático de fuente por REGIÓN recortada, con comentarios descontados y guarda de recorte no vacío"
    - "falsificabilidad medida por mutación temporal revertida, en vez de RED commiteado"
    - "sonda de medición headless montada en iframe del ancho pedido, con CSS inyectado inline"

key-files:
  created:
    - test/panel-nav-groups.test.ts
    - test/panel-nav-chrome.test.ts
  modified: []

key-decisions:
  - "El ciclo RED→GREEN del Task 1 se ejecutó como falsificabilidad MEDIDA (4 mutaciones temporales revertidas) y no como commit rojo: no había código nuevo que escribir y el plan prohíbe tocar app/components/lib"
  - "El caso de `PANEL` se reescribió al hecho computable: la forma original medía el `.filter` del propio helper del test, no la producción (se midió: la mutación que lo borra NO ponía rojo)"
  - "La región del reparto de Más se delimita con un cuarto helper (`bloque`) y no con `recorte`: la primera llave del marcador es la del objeto del `.map` y el recorte cortaba antes del `.filter`"
  - "El barrido del menú único se repite sobre la fuente CRUDA, además de la descontada: con comentarios descontados un drawer entero comentado es invisible, y §5 de la verificación pide que cuente como superviviente"
  - "`--font-geist-mono` CONFIRMADO vacío con probe de navegador: cierra el `[ASSUMED]` de RESEARCH C-5 sin cambiar una línea de código"

requirements-completed: [MOB-01, MOB-02, MOB-03, MOB-07]

metrics:
  duration: "~1h 25m"
  completed: 2026-10-08
  tasks: 2
  files: 2

actuals:
  tokens: 31000
  tasks: 2
  commits: 2

commits: 2
plan_head_before: ba53249f2b98adcf218ec0064774527c346d3470

coverage:
  - deliverable: "El candado del reparto barra/Más: los cuatro inventarios resueltos (12/12/12/11 ⇒ 8/8/8/7), el complemento exacto del conjunto de la barra, el gateo de `canchas` y la resta por href"
    verification:
      - kind: test
        ref: "test/panel-nav-groups.test.ts"
        status: pass
    human_judgment: false
  - deliverable: "El candado estático de los nueve invariantes invisibles: breakpoint, resta por href, orden de T-5 por región, cero mutaciones crudas, los cuatro valores de identidad, la jerarquía de encabezados y landmarks, el menú único (descontado y crudo), el alto reservado"
    verification:
      - kind: test
        ref: "test/panel-nav-chrome.test.ts"
        status: pass
    human_judgment: false
  - deliverable: "El pipeline completo por encima del piso nuevo: suite 107 archivos / 1680 casos, tsc limpio, eslint rc 0, build rc 0"
    verification:
      - kind: command
        ref: "npx vitest run && ./node_modules/.bin/tsc --noEmit && npm run build"
        status: pass
    human_judgment: false
  - deliverable: "Inmutabilidad del mecanismo de historial (criterio 6 de la fase), en bash y no en vitest"
    verification:
      - kind: command
        ref: "git status --porcelain + git log --format=%h sobre los tres módulos de pila"
        status: pass
    human_judgment: false
  - deliverable: "Los criterios 1 y 2 de la fase MEDIDOS: áreas táctiles de los 5 destinos y truncado de labels a 375px y 320px, en los 4 rubros × 5 familias × 2 pesos"
    verification:
      - kind: command
        ref: "sonda headless en iframe (80 pasadas, 0 sospechosas): caja 75×56 @375px y 64×56 @320px, 0 labels truncados"
        status: pass
    human_judgment: false
  - deliverable: "El `<meta name=\"viewport\">` de los vecinos sin cambio y el del panel con las dos claves sumadas"
    verification:
      - kind: command
        ref: "curl | grep -o contra el dev server (puerto 80 derivado) — medido en /, /[slug], /login y /mas"
        status: pass
    human_judgment: true
    rationale: "/dashboard y /admin no sirven documento sin una sesión que el dev server acepte (307 en el proxy). Lo medido cubre 4 de las 6 rutas; las otras dos quedan determinadas por el único `export const viewport` del árbol pero NO fueron medidas servidas → van al bloque E del guion de UAT"
  - deliverable: "Los cinco ítems irreducibles de la UAT en celular real: franja de gestos, teclado en los dos motores, nada tapado, tres pasadas de contraste, y la UAT de v0.30 repetida desde la barra"
    human_judgment: true
    rationale: "Sólo un teléfono real los ve. El dueño encontró 7 bugs así con el pipeline entero en verde. NADIE los miró en este plan: la fase queda en `human_needed` a propósito"
  - deliverable: "El inventario rubro por rubro confirmado EN PANTALLA, con el eje de las 5 familias tipográficas"
    human_judgment: true
    rationale: "El candado del Task 1 computa el inventario; que el provider entregue el rubro correcto en runtime y que los labels se lean bien sólo se ve abriendo cuatro cuentas en un teléfono"
---

# Phase 2 Plan 04: Los candados de lo invisible, y el guion de la UAT que es el único criterio que vale

Dos suites puras nuevas que fijan lo que ni `tsc`, ni el build, ni la UAT visual pueden ver —el gateo
por rubro del inventario de Más y los nueve invariantes de forma del chrome del panel—, más la
evidencia **medida** de los dos criterios de la fase que pedían medición y no estimación, más el
guion completo de la UAT en celular real, que sigue pendiente y es el único criterio que de verdad
decide.

- **Duración:** ~1h 25m (inicio ~21:27 AR, cierre ~21:53 AR del 2026-10-08)
- **Tareas:** 2 de 2
- **Archivos:** 2 creados, 0 modificados
- **Commits de producción:** 2 (`89c2ca5`, `b6d635c`)

## Accomplishments

### Task 1 — `test/panel-nav-groups.test.ts`, el candado del reparto (25 casos) · `89c2ca5`

Suite **pura** (carril `pure`, `environment: 'node'`, sin base, sin navegador y sin reloj) que importa
`buildNavGroups` y fija, **medido rubro por rubro**:

| vertical | destinos resueltos | filas en Más | en la barra |
|---|---|---|---|
| `salud` | 12 | 8 | 4 |
| `belleza` | 12 | 8 | 4 |
| `general` | 12 | 8 | 4 |
| `canchas` | 11 | 7 | 4 |

Más: el complemento cierra (dentro + fuera == total) en los cuatro · `canchas` **no** expone `Equipo`
y **sí** expone `Canchas` (el filtro filtra, no devuelve menos cosas) · `salud` habla en su propia
terminología (`Prestaciones`, `Consultorios`), `belleza` dice `Locales` y `general` `Sucursales` · en
`salud` **no sobrevive ninguna fila `Pacientes`** después de restar (el caso que caza la resta por
key, el bug que aparece en un solo rubro) · el grupo `PANEL` se queda sin un solo destino al restar la
barra · el conjunto de la barra tiene exactamente cuatro hrefs.

Cada caso afirma **primero que encontró algo** (grupos > 0 e items > 0): un fixture que no resuelve
daría listas vacías y todos los conteos-cero pasarían solos.

### Task 2 — `test/panel-nav-chrome.test.ts`, el candado estático (36 casos) · `b6d635c`

Barrido estático de fuente sobre los **cinco** archivos de la fase, reusando los tres helpers del
molde de la Phase 1 (`read`, `sinComentarios`, `recorte`) tal cual, más un cuarto (`bloque`). **Nueve**
bloques de invariantes, con **17 guardas de recorte no vacío** (el gate pide ≥4):

1. El breakpoint de la barra y del header es `lg`, cero `md:hidden`, y el simétrico de desktop intacto.
2. La resta en Más es por **href** (cuatro literales, el de clientes **una** sola vez), Más no
   reimplementa el filtro por rubro, y el descarte de grupos vacíos va **después** de restar.
3. El orden guard-antes-que-consumo, **por región recortada**, en los tres componentes que navegan.
4. Cero mutaciones crudas de historial en los tres componentes nuevos, con la mitad positiva para que
   el caso no pase por "el archivo está vacío".
5. **Los cuatro valores del bloque de identidad**: 40×40 en los **dos** caminos (logo y fallback),
   radio grande, 16px el nombre y 14px el plan, con el tamaño chico negado **por región** (existe
   legítimamente en la firma del pie) y el acento de marca y la fuente de títulos conservados.
6. Un solo encabezado de nivel 1 en Más y **oculto**, cero niveles 2/3, los dos landmarks con nombres
   **distintos**, el vínculo del nombre de grupo escrito en los dos extremos, y cero encabezados en el
   header fijo (sus dos líneas son párrafos).
7. Un solo menú en mobile — y **repetido sobre la fuente cruda**, ver Deviations.
8. El alto reservado arriba y abajo con sus dos `lg:` a cero, más que ningún valor arbitrario con
   `calc`/`env`/`var` lleve un espacio (el modo de falla silencioso: la clase no se genera y Tailwind
   no avisa).
9. Los otros dos módulos de pila no se importan desde el chrome nuevo.

## El ciclo RED→GREEN, ejecutado como falsificabilidad medida

El Task 1 declara `tdd="true"`, pero **no había código nuevo que escribir**: el inventario lo
construyeron los planes 02-01 y 02-02 y este plan prohíbe explícitamente tocar `app/`, `components/`
y `lib/`. Un commit RED honesto habría exigido commitear producción a sabiendas rota. En su lugar se
midió la **falsificabilidad** de cada candado: mutación temporal en el working tree, rojo observado,
y `git checkout --` para revertir byte a byte. **Ninguna mutación se commiteó** y el working tree
quedó limpio después de cada una (verificado con `git status --porcelain -- app components lib` vacío).

| # | Mutación | Resultado |
|---|---|---|
| A | `'equipo'` agregado al menú de `canchas` | **2 rojos**: `to have a length of 11 but got 12` · `to not include 'Equipo'` |
| B | el item `patients` apuntando a otro href (la resta por key) | **3 rojos**, con el síntoma exacto: `to have a length of 8 but got 9` |
| C | borrado el descarte de grupos vacíos de `buildNavGroups` | **NO puso rojo** → ver Deviations |
| D | `PANEL` con un destino fuera de la barra (sobre la versión corregida) | **8 rojos** |
| E | el avatar de identidad a 36px / radio chico | **1 rojo** (el invariante más invisible de la fase) |
| F | la barra con el breakpoint de 768px | **1 rojo** |
| G | el orden del guard invertido en la barra | **1 rojo** |
| H | un espacio dentro del valor arbitrario del layout | **1 rojo** |
| I | el drawer repuesto en el sidebar | **1 rojo** |
| J | el drawer **comentado** en el sidebar | **1 rojo** (sólo lo ve la pasada cruda) |
| K | borrado el descarte de grupos vacíos de Más | **1 rojo** |

GREEN final sin mutaciones: 25/25 y 36/36.

## Los gates, con su salida literal

```
npx vitest run
 Test Files  107 passed (107)
      Tests  1680 passed | 4 expected fail | 1 skipped (1685)
rc=0 · casos fallados=0 · piso exigido 1619 casos / 107 archivos
```

- **Aporte de cada candado:** `panel-nav-groups` **25** casos · `panel-nav-chrome` **36** casos.
  Línea base de la fase: 105 archivos / 1619 casos ⇒ el piso nuevo es **107 / 1680**.
- `./node_modules/.bin/tsc --noEmit` → **sin una sola línea `error TS`** (nunca `npx tsc`: en este
  repo resuelve a otro paquete y sale 0 en falso).
- `./node_modules/.bin/eslint` sobre los dos archivos nuevos → **rc 0** en los dos.
- `npm run build` → **rc 0**, con `ƒ /mas` en el route list.
- **Criterio 6 — inmutabilidad del mecanismo, en bash y no en vitest** (el CI clona a profundidad 1):
  `git status --porcelain` **vacío** sobre los tres módulos de pila, hashes **`351a53b` /
  `32cf56c` / `351a53b`**, y `git diff --stat 49fa195..HEAD` **vacío** sobre los tres.
- **Los otros intocables:** `git status --porcelain` vacío sobre `app/layout.tsx`, `lib/verticals.ts`,
  `lib/auth/route-lists.ts`, `components/ui/drawer.tsx`, `vitest.config.mts` y las tres suites de
  v0.30, con sus hashes base intactos (`aee6bc8` / `351a53b` / `23d836d` / `483c36f`).
- **Tokens sin fuga:** `panel-nav-h` / `panel-nav-muted` aparecen sólo en `app/globals.css` (5),
  `app/themes.css` (4), `app/(dashboard)/layout.tsx` (1), `panel-bottom-nav.tsx` (2) y
  `panel-top-bar.tsx` (1). Cero hits en el landing y en el CRM.
- **Cero dependencias y cero migraciones:** `git diff 49fa195..HEAD -- package.json package-lock.json`
  **vacío**; última migración sigue siendo `079_service_categories_name_normalized.sql` (la próxima
  libre es la **080**).

## La sonda de medición — criterios 1 y 2, MEDIDOS y no estimados

Montada en un **`<iframe>` del ancho pedido** (Chrome headless ignora `--window-size` con
`--dump-dom`), servida desde `public/` para quedar **mismo origen** que el dev server y así poder
cargar las fuentes self-hosteadas. **80 pasadas**: 2 anchos × 4 rubros × **5 familias tipográficas** ×
2 pesos. Artefactos de la sonda borrados al terminar (no se commiteó ninguno).

```
RESUMEN | pasadas=80 | pasadas sospechosas (label 0px o fuente de respaldo)=0
        | area tactil minima observada=64x56 (320px/salud/geometrica)
        | labels truncados en total=0
```

Filas representativas (`caja` = ancho-ancho × alto del área táctil; `labels` = ancho natural de cada
label en px):

```
375px | salud   | geometrica | 600 | Plus Jakarta Sans@600 | caja=75-75x56 | Inicio:27 Turnos:36 Agenda:40 Pacientes:51 Más:22 | ok
375px | salud   | bauhaus    | 600 | Space Grotesk@600     | caja=75-75x56 | Inicio:28 Turnos:37 Agenda:42 Pacientes:53 Más:23 | ok
375px | general | elegante   | 600 | Mulish@600            | caja=75-75x56 | Inicio:27 Turnos:35 Agenda:39 Clientes:41 Más:22 | ok
320px | salud   | bauhaus    | 600 | Space Grotesk@600     | caja=64-64x56 | Inicio:28 Turnos:37 Agenda:42 Pacientes:53 Más:23 | ok
320px | belleza | tech       | 600 | Chakra Petch@600      | caja=64-64x56 | Inicio:26 Turnos:35 Agenda:39 Clientes:41 Más:21 | ok
320px | canchas | bauhaus    | 600 | Space Grotesk@600     | caja=64-64x56 | Inicio:28 Reservas:51 Agenda:42 Clientes:44 Más:23 | ok
```

**Lo que cierra:**

- **Criterio 2 (área táctil ≥44×44):** **75×56 a 375px** y **64×56 a 320px**, exactamente los valores
  esperados, en las 80 pasadas. El mínimo observado es **64×56**.
- **Criterio 1 (ningún label trunca):** **0 labels truncados** en las 80 pasadas. El peor label del
  sistema es **`Pacientes`, 53px** a 11px/600 en Space Grotesk (`bauhaus`) — confirma la predicción de
  RESEARCH y **descarta** el dato viejo de T-8/M-2 que señalaba "Reservas" (`Reservas` mide 51px en la
  misma familia). Holgura: **14.0px a 375px** y **3.0px a 320px** (espacio disponible del label =
  caja − `px-1` × 2 = 56.0px a 320px).
- ⚠ **Limitación honesta de la sonda:** `scrollWidth` devuelve entero, así que las diferencias
  sub-píxel entre peso 500 y 600 se redondean al mismo valor. El peso computado **sí** se verificó
  distinto (`@600` vs `@500`) en las 80 pasadas, y 600 es el que manda.

## El gate del `<meta name="viewport">` — medido en 4 de las 6 rutas

Puerto **derivado** del dev server ya corriendo: **80**. Sesión del seed (`test@forjo.local`) montada
como cookie `sb-127-auth-token`.

| Ruta | HTTP | `<meta name="viewport">` servido |
|---|---|---|
| `/` | 307 | `width=device-width, initial-scale=1` |
| `/negocio-prueba` | 200 | `width=device-width, initial-scale=1` |
| `/login` | 200 | `width=device-width, initial-scale=1` |
| `/mas` | 307 | `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-visual` |
| `/admin` | 307 | **sin documento** — el proxy corta en el borde |
| `/dashboard` | 307 | **sin documento** — el proxy corta en el borde |

**Lo medido:** las tres rutas vecinas que sí sirven documento dan la línea **exacta** de siempre y
**nada más** ⇒ la fase no movió el viewport de los clientes de los negocios. Y `/mas` da la línea con
las **dos claves sumadas** ⇒ el viewport acotado al route group funciona.

**Lo NO medido, y por qué:** `/dashboard` y `/admin` no sirven documento sin una sesión que este dev
server acepte (la cookie del Supabase local no autenticó — el servidor apunta a otro proyecto). No se
infiere su meta del verde de lo demás: queda en el **bloque E del guion de UAT**, donde el teléfono
tiene sesión real. Evidencia estática que lo acompaña (no lo sustituye): `export const viewport`
aparece **exactamente una vez en todo el árbol de `app/`**, en `app/(dashboard)/layout.tsx`, y
`/dashboard` vive en ese route group mientras `/admin` vive fuera.

## El probe de `--font-geist-mono` — cierra el `[ASSUMED]` de RESEARCH C-5

Corrido en el navegador contra el CSS real del dev server:

```
--font-geist-mono (lo que consume el eyebrow)   = []            ← VACÍO
--font-jetbrains-mono (lo que el repo SÍ declara) = ["JetBrains Mono", "JetBrains Mono Fallback"]
fontFamily computada del eyebrow de grupo       = ["Space Grotesk", "Space Grotesk Fallback", system-ui, sans-serif]
```

**Confirmado:** `--font-geist-mono` **no está declarada en ninguna parte del repo** (el root layout
declara `--font-jetbrains-mono` vía `next/font`), así que
`font-[family-name:var(--font-geist-mono)]` resuelve a nada y el eyebrow **hereda la sans del
negocio**. El eyebrow mono **nunca pintó como mono** — ni en Más, ni en el sidebar, ni en los ~50 call
sites del CRM. Deja de ser `[ASSUMED]` y pasa a **medido**. No se arregla acá: cambiaría el render de
los ~50 call sites de golpe y es un quick aparte con su propia UAT visual.

> Nota de método: el control con la variable declarada también resolvió a la sans, porque
> `font-[family-name:var(--font-jetbrains-mono)]` no existe como clase generada (Tailwind sólo genera
> las que aparecen en el fuente). Es un artefacto del control, no un hallazgo.

---

# EL GUION DE LA UAT EN CELULAR REAL — pendiente, y es el único criterio que vale

> **Estado: NADIE abrió un teléfono en este plan.** Lo único verificado en pantalla real en toda la
> fase es la wave 1 (la barra pinta la franja de gestos y navega). Todo el resto está **sin mirar**.
> El workstream tiene `auto_advance: false` y `human_verify_mode: end-of-phase` ⇒ esto **no** se
> auto-aprueba, y la fase queda en `human_needed` a propósito.
>
> Este guion **consolida** las entradas **9** y **10** del ledger `.planning/WINDOWS.md` (los
> pendientes de 02-02 y 02-03) con los cinco ítems irreducibles de este plan. No los duplica: los
> reemplaza como lista única de la fase.

**Paso previo obligatorio:** la IP de la LAN tiene que estar en `allowedDevOrigins`
(`next.config.ts`). Si no está, el teléfono pide `_next/*` desde otro origin, Next lo bloquea, **la
página no hidrata** y los formularios caen al submit nativo. Las IPs son por DHCP y el router ya
cambió la asignación una vez. **No es un bug de la fase.** (Al despacho de este plan, `192.168.0.3`
ya estaba en la lista y el dev server escucha en el puerto 80.)

## A · Los cinco ítems irreducibles

1. **La franja de gestos, pintada.** En un **iPhone con notch**: el `bg-card` de la barra cubre la
   zona de gestos y el último label **no** queda debajo de ella. En **Android** (inset 0) no hay hueco
   vacío ni doble reserva. ⚠ Sólo se ve en un iPhone real: el inset vale 0 en Android y en todo
   emulador headless.
2. **El teclado, en los DOS motores — Android Chrome *y* iOS Safari.** Formulario largo de Finanzas
   **y** drawer de alta de turno, enfocando el **último** campo: la barra **no se ve**, no tapa el
   campo ni el botón de submit, y al cerrar el teclado vuelve **sin que el contenido salte**. ⚠ Este
   repo pagó cuatro quicks de octubre sobre teclado y drawers; el riesgo que la perilla
   `interactive-widget` **no** gobierna es que iOS Safari desplaza el layout viewport para mantener el
   campo a la vista, y eso sólo se ve en un iPhone.
3. **Nada tapado.** Los botones de alta de Finanzas ("Nueva venta" / "Nuevo egreso") y el footer de
   los formularios de **Negocio** y **Configuración**, completamente visibles y alcanzables con el
   pulgar, con la barra presente. Y el final de **Más** (la firma) alcanzable con scroll.
4. **Las tres pasadas de contraste, obligatorias** — cada una con su motivo medido:
   - **forjo claro** — donde cae el peor caso absoluto de la superficie (**5.02:1** en el eyebrow de
     grupo de Más) y el único tema **sin `color-mix`**, o sea el único cuyo número es **exacto**;
   - **spa claro con paleta `clay`** — el acento más oscuro de spa, el que más tiñe el fondo: es donde
     la aproximación del método de cálculo tiene menos aire (5.08:1);
   - **modern claro con paleta `amber`** — donde el acento mide **2.15:1**: la pasada que confirma que
     el indicador en `--foreground` **sí** se distingue justo donde el acento no se distinguiría.

   En las tres: el **foco visible** se ve, el **activo se distingue del inactivo**, y el **eyebrow de
   grupo de Más se lee**.
5. **La UAT de v0.30, repetida DESDE LA BARRA** (criterio 6 de la fase):
   - sección → **atrás del sistema** → **Inicio**;
   - el atrás sigue cerrando **overlay**, **selector**, **calendario** y **teclado** **antes** de
     navegar;
   - con cambios sin guardar en un formulario, tocar otro destino de la barra **pregunta antes** de
     descartar;
   - tocar el destino **en el que ya estás** con una subsección abierta (p. ej. Clientes con una ficha
     abierta) **cierra la subsección** en vez de apilar.

## B · Los DOS recorridos que NO son bugs

Están escritos acá porque, si no se declaran, se reportan como exactamente la regresión que la fase
prometió no causar.

- `Inicio` → `Más` → **tocar `Inicio` en la barra** → **atrás** ⇒ aterriza **en Más**. **Correcto.**
  Es la cuarta rama de `panelNavMode` (`to === root` ⇒ **empuja**), decidida en v0.30 con motivo:
  reemplazar dejaría `/dashboard` sobre `/dashboard`, o sea **un atrás muerto**. Con `/mas` en el medio
  el empuje sigue siendo lo correcto: no hay dos entradas idénticas y el atrás **siempre hace algo
  visible**.
- `Inicio` → `Más` → entrar a una sección → **atrás** ⇒ aterriza en **Inicio**, salteando Más.
  **Correcto en esta fase.** El atrás es de **un** nivel; los **dos** niveles son la **Phase 3**
  (MOB-04), declarada fuera de alcance en el ROADMAP.

## C · El inventario, rubro por rubro (confirmación visual de lo que el Task 1 ya computó)

- **`salud`:** **8** filas de menú en Más, **"Pacientes" NO aparece en Más** (está en la barra), y la
  barra dice **Pacientes**. Es el rubro del peor label del sistema (`Pacientes`, **53px** medido a
  11px/600 en Space Grotesk — ⚠ **no** "Reservas", como decían T-8 y M-2).
- **`canchas`:** **7** filas y **"Equipo" NO aparece**; la barra dice **Reservas**.
- Idealmente también **`belleza`** (dice **Locales**) y **`general`** (dice **Sucursales**).
- En los cuatro: las **tres** filas de `CUENTA` (**Ayuda** · **Ver mi página** abriendo **pestaña
  nueva** · **Cerrar sesión**), **ningún** header de grupo vacío, y **ningún** label truncado con `…`
  en la barra.
- El **bloque de identidad**: avatar **40×40** con el plan debajo; un nombre de **≥40 caracteres**
  truncando sin empujar el layout; scroll hasta la **firma**; y **cerrar sesión** funcionando (con su
  rama de error: si falla, avisa y **no** navega).
- ⚠ **Con el eje FUENTE incluido, que es obligatorio:** `--font-sans` lo elige el negocio y resuelve a
  **5 familias**. Mínimo: `salud` con `font: 'geometrica'` (Plus Jakarta, la más ancha) **y** con
  `font: 'bauhaus'` (Space Grotesk), **con el ítem en estado activo** (peso 600, que es el ancho que
  manda).

## D · El header de dos líneas y el menú único

- La **línea 2** cambia al recorrer secciones, y dice **Pacientes** en `salud` y **Reservas** en
  `canchas`. El mapa está verificado estáticamente; que el provider entregue el rubro correcto **en
  runtime** sólo se ve en pantalla.
- En `/dashboard` el header dice **`Inicio`** mientras el sidebar de desktop sigue diciendo
  "Dashboard" **a propósito** (§14 — **no es bug**).
- El detalle de cliente (parámetro de búsqueda sobre `/clients`) deja el header diciendo
  **Clientes/Pacientes**: un detalle es una subsección, no una sección.
- El nombre del negocio con **≥40 caracteres** trunca sin desbordar el header.
- A mitad de un **formulario largo**, el header fijo es lo único que dice dónde estás (el título de la
  pantalla ya scrolleó).
- **NO existe ningún botón de menú en mobile, en ninguna pantalla.**
- **Lector de pantalla:** cada fila de Más se anuncia **bajo el nombre de su grupo** (los cinco
  `aria-labelledby`), y los **dos landmarks** de navegación tienen **nombres distintos** ("Navegación
  principal" vs "Secciones"). ⚠ Un `aria-labelledby` roto no tira error: deja el grupo sin nombre, en
  silencio.

## E · Los anchos, la banda intermedia y el viewport de los vecinos

- **A 900px** (banda 768–1023px, la que ya no tiene botón de menú): la barra **está**, el header de
  dos líneas **está**, y **no hay** botón de menú.
- **A ≥1024px:** **cero** barra, **cero** header de mobile, sidebar **idéntico** al de hoy, el
  contenido **sin** padding inferior extra, y **"Cerrar sesión" funcionando** — es el único `onClick`
  del sidebar que sobrevive y **ningún gate lo ejecuta**.
- **El `<meta name="viewport">` que este plan NO pudo medir:** con el dev server corriendo y una
  sesión real, `curl -s "http://localhost:$PORT/<ruta>" | grep -o '<meta name="viewport"[^>]*>'` sobre
  **`/dashboard`** (tiene que traer `viewport-fit=cover, interactive-widget=resizes-visual`) y sobre
  **`/admin`** (tiene que seguir dando `width=device-width, initial-scale=1` y **nada más**). Las
  otras cuatro rutas ya están medidas arriba. ⚠ **No se difea el `<head>` entero** aunque el ROADMAP
  lo diga así: el de `/[slug]` lo arma un `generateMetadata` que lee la base, y en dev hay chunks con
  hash ⇒ daría falsos rojos y el arreglo tentador sería "corregir" el viewport, que estaba bien. La
  línea del meta viewport es el **único byte** que esta fase puede mover.
- **Los anchos ya están medidos** (sonda, 80 pasadas): no hace falta volver a medirlos a ojo.

---

## Deviations from Plan

### 1. [Rule 1 - Bug] El caso del grupo `PANEL` medía el helper del propio test, no la producción

- **Encontrado durante:** Task 1, en la mutación C de la fase RED.
- **Problema:** la forma original (`expect(gruposEnMas.map(g => g.section)).not.toContain('PANEL')`)
  pasaba igual con el `.filter(g => g.items.length > 0)` **borrado de `buildNavGroups`** — porque el
  helper `inventario` del propio test vuelve a filtrar después de restar. Un candado que se da la
  razón a sí mismo es exactamente lo que la regla de honestidad prohíbe, y el plan afirmaba que ese
  `.filter` de `buildNavGroups` era la causa de la desaparición (no lo es: la causa es el filtro
  post-resta, que vive en `mas-client.tsx`).
- **Arreglo:** el caso se reescribió al **hecho computable** —todos los destinos de `PANEL` están en
  el conjunto de la barra, así que al restar le queda cero— y se agregó un caso separado, declarado
  como guardián del futuro y **no** como medición de hoy, para el invariante que `buildNavGroups` sí
  posee. La mitad de **cableado** (que Más de verdad descarte el grupo vacío) se movió al candado
  estático del Task 2, que es el único que puede leerla.
- **Verificación:** mutación D (`PANEL` con un destino fuera de la barra) ⇒ 8 rojos; mutación K
  (descarte borrado de Más) ⇒ 1 rojo en el candado estático.
- **Archivos:** `test/panel-nav-groups.test.ts`, `test/panel-nav-chrome.test.ts`. **Commits:**
  `89c2ca5`, `b6d635c`.

### 2. [Rule 3 - Blocker] El marcador del recorte del reparto de Más cortaba antes del `.filter`

- **Encontrado durante:** Task 2, primera corrida (rojo real).
- **Problema:** `recorte(mas, 'const grupos =')` balancea llaves desde la primera `{` posterior al
  marcador, que es la del objeto que devuelve el `.map` ⇒ el recorte terminaba en
  `...!EN_LA_BARRA.has(i.href)) }` y dejaba el `.filter` final afuera. El rojo era de la **sonda**, con
  el código de producción perfectamente correcto — y el arreglo tentador era borrar la aserción.
- **Arreglo:** la región se delimita con el cuarto helper (`bloque(mas, 'const grupos =', 'return (')`),
  que recorta **entre dos marcadores** y devuelve vacío si falta cualquiera. Documentado en el archivo
  con la medición que lo motivó.
- **Archivos:** `test/panel-nav-chrome.test.ts`. **Commit:** `b6d635c`.

### 3. [Rule 2 - Missing critical] El barrido del menú único se repite sobre la fuente CRUDA

- **Encontrado durante:** Task 2, al conciliar dos instrucciones del plan que se contradicen.
- **Problema:** la acción del invariante 7 pide contar **con comentarios descontados**; §5 de
  `<verification>` pide que **un drawer comentado cuente como superviviente**. Las dos no se pueden
  cumplir con una sola pasada: descontando comentarios, un drawer entero comentado es **invisible**.
- **Arreglo:** se agregó una **segunda** pasada sobre el archivo sin descontar nada. Hoy pasa limpia
  porque el plan 02-03 **borró** el drawer en vez de comentarlo (medido: los seis marcadores dan 0
  también en crudo). Satisface las dos instrucciones sin aflojar ninguna.
- **Verificación:** mutación J (drawer **comentado**) ⇒ rojo **sólo** en la pasada cruda.
- **Archivos:** `test/panel-nav-chrome.test.ts`. **Commit:** `b6d635c`.

### 4. [Proceso] El ciclo RED→GREEN del Task 1 no produjo un commit rojo

- **Problema:** el Task 1 declara `tdd="true"`, pero su sujeto —el inventario— **ya existe y es
  correcto** (lo construyeron 02-01 y 02-02), y las prohibiciones del propio plan impiden escribir
  código de producción. Un commit RED honesto habría exigido commitear producción a sabiendas rota en
  `main`, que es estrictamente peor que no tenerlo.
- **Qué se hizo en su lugar:** la **falsificabilidad medida** de las tablas A–D y E–K (ver más arriba):
  11 mutaciones temporales, nunca commiteadas, revertidas byte a byte. Es evidencia **más fuerte** que
  un RED commiteado, porque prueba que **cada** aserción clave muerde de forma independiente — y fue
  la que encontró la desviación 1.
- **Impacto:** el plan produce **2** commits de producción en vez de 3. Ninguna aserción quedó sin
  probar.

### 5. [Medición] Ninguna aserción de conteo del plan estaba miscalibrada

El orquestador avisó de la aserción `getPlanLimits = 1` de 02-03 (valor real: **2**). Este plan **no
la reusa**, y se midieron **todas** las aserciones de conteo del Task 2 contra el código antes de
escribirlas: `md:hidden`=0, `mobileOpen`=0, `Menu`=0, `bg-black/60`=0, `z-40`=0, `z-50`=0,
`translate-x-`=0, `'/clients'`=1, `resolveVertical`=0, `w-10 h-10`=2, `w-9 h-9`=0, `rounded-md`=0,
`text-xs` en la región de identidad=0, `<h1`=1, `<h2`/`<h3`=0, `<p` en el header=2. **Ninguna** hubo
que corregir. Los inventarios del Task 1 (12/12/12/11 ⇒ 8/8/8/7) también se midieron **antes** de
escribir el archivo y coincidieron exactamente con el plan.

**Total de desviaciones:** 3 auto-arregladas (1 bug de candado, 1 marcador de recorte, 1 cobertura
faltante) + 2 de proceso documentadas. **Impacto:** los dos candados quedaron **más fuertes** que
como los especificaba el plan, y cero cambios en producción.

## Known Stubs

Ninguno. Este plan no agrega superficie: sólo dos archivos de test.

## Deferred Issues

Lo que esta fase deja anotado como **deuda**, para que `secure-phase` y el próximo milestone no lo
redescubran:

1. **`--muted-foreground` del sidebar de desktop falla AA** en spa claro (3.41:1 sobre `--card`) y, en
   el eyebrow, también en modern claro (4.15:1 sobre `--background`) — **10 de las 40 combinaciones**,
   y **ya pasa hoy**. No se arregla acá porque D-02/MOB-07 prohíben tocar desktop.
2. **`--font-geist-mono` sin declaración** — **ya no es `[ASSUMED]`, está MEDIDO** (ver arriba): la
   variable resuelve vacía y el eyebrow hereda la sans del negocio en los ~50 call sites. Arreglarlo
   cambiaría el render de todos de golpe: quick aparte con su propia UAT visual.
3. **En landscape sobre un iPhone con notch el contenido puede quedar a ras del notch**, porque los
   insets laterales van en los dos elementos fijos y **no** en el `<main>`. Aceptado: el panel se usa
   en portrait y arreglarlo bien es tocar las 12 pantallas.
4. **`/mas` no recibe el refresh de cookie de `updateSession`**, igual que sus 9 hermanas del panel.
   No es un agujero (el guard real revalida en cada request) y agregarla a `lib/auth/route-lists.ts`
   es el reflejo que ese archivo documenta con cuatro advertencias como "rompe cosas en silencio".
   ⚠ **Confirmado lateralmente por este plan:** `/dashboard` corta en el proxy (307 sin documento) y
   `/mas` llega a renderizar su `<head>` — exactamente la asimetría que esa nota describe.
5. **`react-hooks/purity` preexistente en `app/(dashboard)/layout.tsx`** (`Date.now` en render) —
   entrada **8** del ledger, confirmada contra la base de la fase. Fuera de alcance: el criterio de
   esta fase es **cero hallazgos nuevos**, no `rc 0` sobre ese archivo.

## Threat Flags

Ninguno. Cero migraciones (próxima libre: **080**), cero policies, cero queries, cero rutas, cero env
vars, cero paquetes npm, cero cambios en `vitest.config.mts`. Las tres amenazas `high` del registro
del plan quedan mitigadas:

- **T-02-20** (un cuarto escritor del historial o el orden de T-5 invertido) → mitigada por el bloque
  3 y el 4 del candado estático, con falsificabilidad medida (mutación G).
- **T-02-21** (la fase marcada como verificada sin que nadie abra el teléfono) → mitigada: los cinco
  ítems irreducibles están **ruteados a la verificación humana con guion concreto** y el SUMMARY dice
  explícitamente que **nadie los miró**. La fase queda en `human_needed`.
- **T-02-23** (un candado rojo "arreglado" aflojando el candado) → mitigada: los dos archivos llevan
  escrito en su cabecera que el arreglo va en el componente, y las dos veces que apareció un rojo en
  este plan (desviaciones 1 y 2) se arregló **el candado hacia arriba**, nunca bajando la exigencia.

## Next

**Phase 2 completa (4/4 planes).** Siguiente paso: `/gsd-verify-work 02 --ws panel-nav` con el guion
de UAT de arriba en la mano, **en un teléfono real**. La fase **no** se puede dar por verificada desde
el verde del pipeline: los criterios que importan son los cinco irreducibles, y ninguno se midió acá.

## Self-Check: PASSED

- `test/panel-nav-groups.test.ts` → **FOUND** · corre y reporta **25** casos
- `test/panel-nav-chrome.test.ts` → **FOUND** · corre y reporta **36** casos
- Commit `89c2ca5` → **FOUND** en `git log` · Commit `b6d635c` → **FOUND** en `git log`
- Trailer `Co-Authored-By: Claude Opus 5 (1M context)` presente en **los dos** commits (verificado con
  `git log -1 --format=%B` después de cada uno)
- `commits` MEDIDO: `git rev-list --count ba53249..HEAD` → **2** (base registrada en
  `plan_head_before`)
- Todos los `<acceptance_criteria>` de las dos tareas re-corridos y en verde; `<verification>` del
  plan re-corrida: suite **107/1680** rc 0, `tsc` limpio, `eslint` rc 0, `build` rc 0, inmutabilidad
  en bash verde, tokens sin fuga, cero dependencias, migración tope `079`
- Los criterios 1 y 2 **medidos** con la sonda (80 pasadas, 0 sospechosas) — **no** quedaron como
  `human_needed`
- Lo que **no** se pudo medir está declarado como no medido: el meta viewport de `/dashboard` y
  `/admin`, y los **cinco ítems irreducibles** de la UAT
