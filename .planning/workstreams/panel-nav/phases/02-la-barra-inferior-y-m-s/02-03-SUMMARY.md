---
phase: "02-la-barra-inferior-y-m-s"
plan: "03"
subsystem: panel-nav
status: complete
tags: [mobile-nav, header, terminologia-por-rubro, borrado-de-superficie, a11y, desktop-intacto]
workstream: panel-nav

requires:
  - "lib/use-terminology.tsx — useTerminology(), con el VerticalProvider ya montado en (dashboard)/layout.tsx (CERO diff acá)"
  - "lib/verticals.ts — VerticalTerminology y los 4 rubros con sus términos (CERO diff, hash 9c32ef5 intacto)"
  - "components/dashboard/panel-bottom-nav.tsx — la barra de 02-01, de la que este header hereda la fuente de terminología y la sintaxis de los insets (CERO diff acá)"
  - "app/(dashboard)/mas/* — la pantalla Más de 02-02: es el reemplazo del drawer que este plan borra, y por eso 02-02 tenía que aterrizar ANTES (CERO diff acá)"
  - "lib/panel-history.ts — panelNavMode / consumeOwnedPanelEntry, el cableado que el borrado NO toca (CERO diff, hash 351a53b intacto)"
provides:
  - "components/dashboard/panel-top-bar.tsx — PanelTopBar: el header de mobile como componente propio, con dos párrafos y el mapa de 14 pathnames derivado de la terminología del rubro"
  - "el slot de acciones del header, declarado y vacío, con su contrato escrito para quien lo use después"
  - "components/dashboard/sidebar.tsx reducido a UNA sola superficie: el sidebar de desktop"
  - "un solo inventario de destinos en mobile (la barra + Más) ⇒ cierra el riesgo (d) del ROADMAP"
  - "la desaparición del único inventario del panel que no participaba del historial, que es lo que desbloquea MOB-04 en la Phase 3"
affects:
  - "app/(dashboard)/layout.tsx: monta un tercer hermano (PanelTopBar) junto al Sidebar y a la barra"
  - "components/dashboard/sidebar.tsx: pierde el header, el overlay, el drawer, el estado y los dos onClick de cierre"
  - "las 13 pantallas del panel en mobile: el header que las encabeza ahora dice también en qué sección están"

tech-stack:
  added: []
  patterns:
    - "header de chrome fijo con DOS párrafos y cero headings: la jerarquía se expresa con tamaño y peso, no con niveles de heading, porque el h1 es de la pantalla y no del chrome"
    - "jerarquía invertida deliberada en el chrome: el dato que no está duplicado en ninguna otra parte de mobile (el nombre del negocio) es el dominante, y el que sí tiene un h1 visible 56px más abajo (la sección) entra como eyebrow de orientación"
    - "mapa local pathname → label construido con useTerminology() en vez de derivarlo del inventario del menú: el inventario sólo expone lo que el rubro habilita, no incluye /ayuda ni /mas, y trae el label de desktop para la raíz"
    - "el pathname NUNCA se renderiza: sólo indexa un mapa literal de 14 entradas, y un pathname fuera del mapa no cae a un default que lo muestre — la línea 2 simplemente no se renderiza"
    - "insets laterales como suma del padding del diseño más el inset del dispositivo, en un valor arbitrario de Tailwind v4 sin un solo espacio"
    - "borrado de superficie viva verificado sobre el fuente CON COMENTARIOS DESCONTADOS, con un conteo exacto (no >=) del único handler que sobrevive: un drawer comentado cuenta como superviviente y un logout borrado por accidente también se ve"
    - "el fragmento del return se deja con un solo hijo A PROPÓSITO: desenvolverlo re-indentaría el bloque de desktop y el gate de byte-identidad lo leería como una línea eliminada"

key-files:
  created:
    - components/dashboard/panel-top-bar.tsx
  modified:
    - app/(dashboard)/layout.tsx
    - components/dashboard/sidebar.tsx

key-decisions:
  - "El header se EXTRAJO a su propio archivo en vez de editarse donde estaba: así sidebar.tsx queda siendo el sidebar de desktop y nada más, que es en lo que esta fase lo convierte. Editarlo in-place lo dejaría dueño de dos superficies justo cuando se le saca la tercera, y el header nuevo necesita el pathname y la terminología, que el sidebar no usa"
  - "El mapa de títulos es LOCAL y se construye con useTerminology(), no se deriva de buildNavGroups: ése devuelve sólo los destinos que el rubro expone (en canchas no tendría /equipo), no tiene /ayuda ni /mas, y para la raíz trae el label de desktop cuando el header tiene que decir Inicio"
  - "El nombre del negocio es la línea dominante y el título de sección la subordinada: con la inversión al revés habría dos títulos iguales a 56px de distancia y el h1 de la pantalla quedaría compitiendo con el chrome fijo"
  - "Las dos líneas son párrafos y no headings: un heading en el chrome fijo dejaría a las 13 pantallas con dos h1 cada una y rompería la jerarquía de todas a la vez"
  - "El fragmento del return del sidebar se deja con un único hijo en vez de simplificarlo: desenvolverlo cambiaría la indentación del bloque de desktop y el gate de byte-identidad (ninguna línea eliminada que mencione hidden lg:flex / lg:w-60 / z-20) lo leería como una eliminación. El plan declaraba la simplificación como opcional; acá es activamente contraproducente"
  - "El comentario del footer que describía el cierre del drawer se reescribió en vez de dejarse: describía literalmente el onClick que este plan borra, y un comentario que miente sobre el código es peor que un comentario que falta"

requirements-completed: []

coverage:
  - deliverable: "components/dashboard/panel-top-bar.tsx existe como componente de cliente y conserva idénticos la visibilidad, la posición, la capa, la superficie y el alto de 56px del header de hoy, más los insets laterales sin un espacio en el valor arbitrario"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate 1 del Task 1: directiva de cliente=1 · lg:hidden=1 · fixed top-0=1 · z-30=1 · bg-card=1 · border-b border-border=1 · h-14=1 · inset izq=1 · inset der=1 · valores arbitrarios con espacio=0"
        status: pass
  - deliverable: "El header tiene dos párrafos y ningún heading, el slot de acciones está declarado y vacío, y no quedó ningún handler en el archivo"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate 2 del Task 1: headings=0 · parrafos=2 · slot de acciones=1 · handlers=0"
        status: pass
  - deliverable: "El mapa cubre los 14 pathnames, sale de useTerminology() sin re-resolver el vertical, dice Inicio para la raíz y no trae el label de desktop"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate 2 del Task 1: entradas faltantes del mapa=0 (los 14 literales presentes) · useTerminology=2 · resolveVertical=0 · literal Inicio=1 · literal 'Dashboard'=0"
        status: pass
  - deliverable: "Un pathname fuera del mapa deja el header de una sola línea: nunca el texto undefined, nunca un hueco vacío"
    human_judgment: false
    verification:
      - kind: command
        ref: "el mapa está tipado Record<string, string | undefined> y la línea 2 se renderiza con un condicional sobre el valor; ./node_modules/.bin/tsc --noEmit rc 0 confirma que la rama undefined está manejada (un Record<string,string> indexado habría dejado pasar el caso)"
        status: pass
  - deliverable: "El header está montado en el layout como tercer hermano, y el <main> conserva intactas las dos reservas de alto (la del header y la de la barra que puso 02-01)"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate 3 del Task 1: montaje del header=2 (import + JSX) · montaje de la barra=2 · sidebar montado=1 · main con pt-14=1, lg:pt-0=1, reserva de la barra=1, lg:pb-0=1"
        status: pass
  - deliverable: "En mobile queda un solo camino de entrada al menú: el botón de las tres líneas, su overlay, su drawer, el estado que los abría y los dos onClick de cierre ya no existen en el markup, y con ellos salieron los imports huérfanos"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate A del Task 2, sobre el fuente con comentarios descontados: estado del drawer=0 · icono del menú=0 · overlay (bg-black/60)=0 · capa 40=0 · capa 50=0 · transform del drawer=0 · handlers=1 (sólo el logout) · usos de useState=0"
        status: pass
      - kind: command
        ref: "./node_modules/.bin/eslint components/dashboard/sidebar.tsx — rc 0: es el gate que caza los imports huérfanos (los dos iconos, Button, useState), que eslint-config-next/typescript marca como error y no como warning"
        status: pass
  - deliverable: "El cableado de navegación del sidebar quedó intacto: el onClick de cierre fue la única línea que salió"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate B del Task 2: panelNavMode=2 · consumeOwnedPanelEntry=2 · useNavigationGuard=1 · aria-current=1 · guard ANTES del consumo=1"
        status: pass
      - kind: tests
        ref: "test/panel-history-sidebar.test.ts (el candado que la Phase 1 dejó sobre este archivo: barrido estático por región del cableado NAV-07/NAV-08) — verde dentro de la corrida de 105/105"
        status: pass
  - deliverable: "El sidebar de desktop es byte-idéntico y sidebarContent conserva sus cinco partes"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate B del Task 2: bloque hidden lg:flex lg:flex-col lg:fixed=1 · lg:w-60=1 · z-20=1 · líneas de desktop ELIMINADAS en el diff=0 · aria-label=Navegación=1 · Ver mi página=1 · Cerrar sesión=1 · firma (hecho con)=1"
        status: pass
      - kind: command
        ref: "git diff -- components/dashboard/sidebar.tsx leído a mano: 14 inserciones / 35 borrados, y las únicas líneas tocadas dentro de sidebarContent son los dos onClick autorizados por el action más el comentario que los describía"
        status: pass
  - deliverable: "El archivo se editó y no se reescribió, y el layout sigue montando los tres hermanos"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate C del Task 2: líneas 220 → 199 · reducción 9% (>0 y <80) · Sidebar=1 · PanelTopBar=2 · PanelBottomNav=2"
        status: pass
  - deliverable: "Cero diff en los tres módulos de historial y en los otros cuatro intocables, y cero toques en app/(dashboard)/mas (el trabajo de 02-02)"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate D del Task 2: git status --porcelain sobre los 8 caminos intocables vacío; los 7 hashes base intactos (panel-history=351a53b · overlay-history=32cf56c · dirty-history=351a53b · app/layout=962dd6d · drawer=87ac7ba · route-lists=22d83eb · verticals=9c32ef5), re-medidos DESPUÉS de los dos commits"
        status: pass
      - kind: command
        ref: "git diff --stat 921fb41..HEAD -- lib/panel-history.ts lib/overlay-history.ts lib/dirty-history.ts — sin salida"
        status: pass
  - deliverable: "Cero dependencias nuevas, cero migraciones, cero iconos nuevos"
    human_judgment: false
    verification:
      - kind: command
        ref: "git diff -- package.json package-lock.json vacío; la última migración sigue siendo 079_service_categories_name_normalized.sql; el plan SACA dos iconos de un import y no agrega ninguno"
        status: pass
  - deliverable: "El pipeline del repo queda en el piso medido"
    human_judgment: false
    verification:
      - kind: command
        ref: "./node_modules/.bin/tsc --noEmit — cero líneas 'error TS' (npx tsc NO se usó: en este repo resuelve a tsc@2.0.4 y siempre sale 0)"
        status: pass
      - kind: command
        ref: "npx vitest run — rc 0 · Test Files 105 passed (105) · Tests 1619 passed | 4 expected fail | 1 skipped (1624), en una corrida limpia por cada task"
        status: pass
      - kind: command
        ref: "npm run build — rc 0, con /mas y las 13 pantallas en el route list"
        status: pass
  - deliverable: "En un celular real y en una ventana de escritorio: que no haya ningún botón de menú, que la línea 2 cambie con la terminología del rubro, que un nombre de >=40 caracteres truncue, que el header siga orientando a mitad de un formulario largo, que el sidebar de desktop esté idéntico con su logout funcionando, y la UAT de v0.30 repetida DESDE LA BARRA"
    human_judgment: true
    rationale: "NADIE lo miró todavía en un teléfono ni en una ventana de escritorio — la UAT visual está PENDIENTE. Es irreducible a comando en este repo: Vitest corre en environment:'node', sin jsdom ni Playwright, así que ni el ancho de texto, ni el orden visual, ni el comportamiento del atrás del sistema son medibles acá. Los 9 puntos del human-check quedaron registrados en .planning/WINDOWS.md (entrada 10, kind unrun-verify)."

metrics:
  duration: "18 min"
  started: "2026-10-09T00:04:00Z"
  completed: "2026-10-09T00:22:00Z"
  tasks: 2
  files: 3

actuals:
  tokens: 37000
  tasks: 2
  commits: 2
  plan_head_before: "921fb416d9a9a5264545f4340a1d4b40812ff90b"
---

# Phase 2 Plan 03: El header de dos líneas y el fin del segundo menú Summary

El header superior de mobile salió a `components/dashboard/panel-top-bar.tsx` con dos párrafos —el
nombre del negocio como línea dominante y el título de la sección con la terminología del rubro como
eyebrow de orientación— y con él se fue su única razón de ser original: el botón de las tres líneas,
su overlay y su drawer **ya no existen en el markup** de `sidebar.tsx`, que queda siendo el sidebar
de desktop y nada más, byte-idéntico a ≥1024px.

## Accomplishments

1. **`components/dashboard/panel-top-bar.tsx`** (nuevo, 127 líneas, componente de cliente). Conserva
   idénticos al header de hoy la visibilidad (`lg:hidden`), la posición (`fixed top-0 left-0
   right-0`), la capa (`z-30`), la superficie (`bg-card border-b border-border`) y el alto
   (**`h-14`**, 56px) — ese último es lo que hace que el `pt-14` del `<main>` siga siendo correcto
   sin tocarlo. Lo único que cambia es el contenido: se va el botón con el icono del menú y con él
   el `gap-3` que existía sólo para separarlo del nombre.

2. **Las dos líneas, y por qué están en ese orden.** Línea 1 = nombre del negocio, `text-base`
   (16px) / `font-semibold` (600) / `--foreground` / `truncate`, **dominante**. Línea 2 = título de
   la sección, `text-[11px]` / `leading-[1.2]` / `font-medium` (500) /
   `text-[var(--panel-nav-muted)]` / `truncate`, **subordinada y condicional**. La inversión no es
   estética: las 13 pantallas ya tienen su `h1` visible (medido: `appointments-client.tsx:273`
   → `Turnos`, `finances-client.tsx:607` → `Finanzas`) a 56px de ahí abajo, así que poner la sección
   como dominante dejaría dos títulos iguales a 56px de distancia. La línea 2 gana su lugar por lo
   que el `h1` no puede dar: **el header es fijo y el `h1` scrollea**.

3. **Ninguna de las dos es un heading.** Conteo de `<h1`/`<h2`/`<h3` en el archivo: **0**. Es la
   prohibición de categoría `transparency` del plan — un heading en el chrome fijo dejaría a las 13
   pantallas con dos `h1` cada una. Es también la otra mitad de la decisión de 02-02, donde `/mas`
   lleva su `h1` en `sr-only` justamente porque este header ya la nombra en pantalla.

4. **El mapa de 14 pathnames, construido con `useTerminology()`.** El provider ya estaba montado en
   el layout, así que el vertical **no se re-resuelve en el cliente** (`resolveVertical` = **0**
   ocurrencias). Los 14 literales presentes, con `Inicio` para la raíz y **cero** ocurrencias del
   label de desktop:

   | pathname | título | pathname | título |
   |---|---|---|---|
   | `/dashboard` | **`Inicio`** | `/negocio` | `Negocio` |
   | `/appointments` | `t.appointments` → **Reservas** en canchas | `/web` | `Mi web` |
   | `/agenda` | `Agenda` | `/finances` | `Finanzas` |
   | `/abonos` | `Abonos` | `/settings` | `Configuración` |
   | `/clients` | `t.clients` → **Pacientes** en salud | `/ayuda` | `Ayuda` |
   | `/servicios` | `t.services` → **Canchas** / **Prestaciones** | `/mas` | `Más` |
   | `/equipo` | `Equipo` | *cualquier otro* | **la línea 2 no se renderiza** |
   | `/consultorios` | `t.locations` → **Sedes** / **Locales** / **Sucursales** | | |

   El mapa está tipado `Record<string, string | undefined>` a propósito: con
   `Record<string, string>` el compilador habría dejado pasar la rama del pathname desconocido, que
   es exactamente el caso que no puede imprimir `undefined` ni dejar un hueco.

5. **El pathname nunca se renderiza.** Sólo indexa el mapa, y lo que se muestra es el valor —un
   literal o un término del rubro. Un pathname fuera del mapa **no cae a un default que lo muestre**
   (cierra T-02-17 del registro de amenazas por construcción, no por escape de React).

6. **Los insets laterales, sin un espacio.** `pl-[calc(1rem+env(safe-area-inset-left,0px))]` y
   `pr-[calc(1rem+env(safe-area-inset-right,0px))]` sumados al `px-4`. El gate que cuenta valores
   arbitrarios **con** un espacio dio **0**: es el modo de falla silencioso del repo (con espacios la
   clase no se genera, Tailwind no avisa, `tsc` no lo ve y el build pasa). Precedente espejado:
   `components/landing/whatsapp-float.tsx:36`.

7. **El slot de acciones, declarado y vacío** (`<div className="shrink-0" />`), con su contrato
   escrito en el archivo: máximo 2 botones fantasma de tamaño icono, área táctil 44×44, y
   `aria-label` verbo + objeto en español obligatorio en cada uno —nunca uno genérico y nunca el
   atributo de tooltip como sustituto—. Conteo de `onClick` en el header: **0**.

8. **El borrado.** De `sidebar.tsx` salieron del markup, no de una clase ni de un comentario: el
   header de mobile con su botón, el overlay (`fixed inset-0 z-40 bg-black/60`), el drawer casero
   (`fixed top-0 left-0 bottom-0 z-50 w-64` con su `translate-x`), el estado booleano que los abría
   y los **dos** `onClick={() => setMobileOpen(false)}` (el del item de nav y el de Ayuda). Los siete
   conteos del gate sobre el fuente con comentarios descontados dan **0**, y `onClick` queda en
   **exactamente 1** — el del logout, que es el único que tenía que sobrevivir.

9. **El sidebar de desktop, sin tocar.** `sidebarContent` completo (identidad, el
   `<nav aria-label="Navegación">`, "Ver mi página", Ayuda, Cerrar sesión y la firma) y el bloque
   `hidden lg:flex lg:flex-col lg:fixed lg:top-0 lg:left-0 lg:bottom-0 lg:w-60 bg-card border-r
   border-border z-20` intacto. El diff **no elimina ninguna línea** que mencione `hidden lg:flex`,
   `lg:w-60` ni `z-20`.

## El porcentaje real de reducción, y los imports que quedaron huérfanos de verdad

Lo que ningún comando captura y el plan pidió documentar:

| | Valor |
|---|---|
| Baseline que usaba el plan (HEAD de la fase, antes de 02-01) | 284 líneas, ~21% esperado |
| Baseline **real** al arrancar este plan (02-01 ya le había sacado `NAV_GROUPS` y `buildNavGroups`) | **220 líneas** |
| Después del borrado | **199 líneas** |
| Diff crudo | **35 borrados / 14 insertados** |
| Reducción **bruta** (sólo borrado) | 35/220 = **15.9%** |
| Reducción **neta** (lo que mide el gate) | 21/220 = **9%** |

La diferencia entre bruta y neta son las **11 líneas de comentario de cabecera** que se agregaron
para explicar por qué el drawer se borró en vez de dejarse oculto, más las 3 del comentario
reescrito. El `~21%` del plan se calculó contra las 284 líneas de antes de 02-01; medido contra lo
que había de verdad, el borrado es **15.9% bruto**. En los dos casos muy por debajo del 80% de PC-6,
que es lo que el criterio protege.

**Imports huérfanos, verificados en el archivo y no asumidos:**

| Import | ¿Quedó huérfano? | Qué se hizo |
|---|---|---|
| `Menu` (icono de las tres líneas, lucide) | **Sí** — su único uso era el botón borrado | **Sale** |
| `X` (icono de la ✕, lucide) | **Sí** — su único uso era el cierre del drawer | **Sale** |
| `Button` | **Sí** — sus dos usos eran el botón del menú y la ✕ | **Sale** |
| `useState` | **Sí** — su único uso era `mobileOpen` | **Sale** (import y uso) |
| `cn` | **NO** — sigue usándose en `sidebarContent:102` para el estado activo de cada fila | **Se queda** |

El plan anticipaba que `cn` podía quedar huérfano ("ese era su último uso en el archivo si el bloque
de desktop no lo usa"). Se verificó en el archivo: **no lo está**. `eslint` rc 0 sobre `sidebar.tsx`
es la prueba cruzada de que los cuatro que salieron tenían que salir y el quinto tenía que quedarse
— `eslint-config-next/typescript` marca los imports sin usar como **error**, no como warning.

## El fragmento con un solo hijo: por qué NO se simplificó

El `return` quedó con `<>` envolviendo un único `<div>` (el bloque de desktop). El plan declara la
simplificación como **opcional**; acá es activamente contraproducente: desenvolver el fragmento
cambiaría la indentación de la línea
`<div className="hidden lg:flex lg:flex-col lg:fixed … lg:w-60 … z-20">`, y el gate de
byte-identidad del desktop cuenta **líneas eliminadas que mencionen `hidden lg:flex`, `lg:w-60` o
`z-20`**: una re-indentación aparece en el diff como una línea eliminada más una agregada ⇒ el gate
se pondría rojo por un cambio puramente cosmético, exactamente sobre la superficie que MOB-07
protege. Se dejó el fragmento.

## Tasks Completed

| Task | Nombre | Commit | Archivos |
|---|---|---|---|
| 1 | El header de mobile extraído a su propio componente — dos líneas, el título del rubro y el slot vacío | `71c5d88` | `components/dashboard/panel-top-bar.tsx` (nuevo), `app/(dashboard)/layout.tsx` |
| 2 | Un solo menú — el botón, su overlay y su drawer salen del markup | `02ea69f` | `components/dashboard/sidebar.tsx` |

Diff total del plan (`921fb41..02ea69f`): **3 archivos, 148 inserciones, 35 borrados**.
`commits` **MEDIDO** con `git rev-list --count 921fb41..HEAD` = **2**.

## Pipeline

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **rc 0**, cero líneas `error TS` (corrido dos veces, una por task) |
| `./node_modules/.bin/eslint components/dashboard/panel-top-bar.tsx` | **rc 0**, sin hallazgos |
| `./node_modules/.bin/eslint components/dashboard/sidebar.tsx` | **rc 0**, sin hallazgos |
| `./node_modules/.bin/eslint "app/(dashboard)/layout.tsx"` | **rc 1** — **1 hallazgo, PREEXISTENTE y el único**: `react-hooks/purity` sobre `Date.now` en el cálculo de `daysLeft` (ver desviación 1). **Cero hallazgos nuevos.** |
| `npx vitest run` | **rc 0** · `Test Files 105 passed (105)` · `Tests 1619 passed \| 4 expected fail \| 1 skipped (1624)` — corrida **limpia** por cada task, sin ningún worker caído |
| `npm run build` | **rc 0**, con las 13 pantallas y `ƒ /mas` en el route list |
| Cero diff en los 3 módulos de historial | `git diff --stat 921fb41..HEAD -- …` sin salida; los 7 hashes base re-medidos **después** de los dos commits y todos intactos |
| Cero dependencias / cero migraciones | `git diff -- package.json package-lock.json` vacío; última migración sigue siendo `079_…` |

⚠ **`npx tsc` no se usó en ningún momento:** en este repo resuelve a `tsc@2.0.4` del registro, que no
es el compilador y **siempre** sale 0. Todas las corridas fueron con `./node_modules/.bin/tsc`.

⚠ **El flake del pool de forks de Windows no apareció en este plan.** Las dos corridas de la suite
salieron limpias en el primer intento, con los conteos consistentes entre sí.

## Deviations from Plan

### 1. [Fuera de alcance, preexistente y medido] El gate de eslint del Task 1 lista `app/(dashboard)/layout.tsx`, que no puede dar rc 0

- **Encontrado durante:** el gate de eslint del Task 1.
- **Qué pasó:** `./node_modules/.bin/eslint components/dashboard/panel-top-bar.tsx
  "app/(dashboard)/layout.tsx"` sale **rc 1** con un único hallazgo:
  `react-hooks/purity` — *"Cannot call impure function during render: `Date.now`"* — sobre el cálculo
  de `daysLeft`. El plan pide rc 0 sobre los dos archivos.
- **Por qué NO es de este plan:** es el ítem **D-1** de `deferred-items.md`, que el plan 02-01 ya
  midió contra la base `49fa195` y documentó como preexistente. Este plan no toca `daysLeft`: lo
  único que le agregó al layout son un import y seis líneas de montaje. La única diferencia es el
  número de línea (62 → **63**, por el import insertado arriba).
- **Qué se hizo:** se corrió el gate **acotado al archivo que este plan efectivamente escribe**
  (`panel-top-bar.tsx`) → **rc 0, sin hallazgos**. El criterio aplicado es **cero hallazgos NUEVOS**,
  no rc 0 sobre un archivo con deuda heredada. No se arregló `daysLeft`: sigue siendo una decisión de
  diseño con su propia UAT (de dónde sale "hoy" en un Server Component) y está fuera del alcance de
  esta fase.
- **Dónde se arregla:** fuera de la fase, candidato a `/gsd-quick`. Sigue abierto como entrada **8**
  de `.planning/WINDOWS.md`.

### 2. [Gate miscalibrado en el plan, NO un defecto del código] El conteo de `getPlanLimits` espera 1 y vale 2 — desde antes de la fase

- **Encontrado durante:** el gate B del Task 2.
- **Qué pasó:** el `acceptance_criteria` pide que `sidebarContent` siga completo verificando, entre
  otras cinco cadenas, que el conteo de `getPlanLimits` sea **1**. El conteo real es **2**, porque la
  cadena aparece en **dos líneas**: el `import` de `:7` y la llamada de `:67`, dentro del bloque de
  identidad.
- **Medido contra tres puntos, para probar que es preexistente:** base de la fase `49fa195` → **2** ·
  HEAD al despacharme `921fb41` → **2** · después de mi borrado → **2**. El conteo **no cambió**.
- **Por qué no se "arregló":** las dos únicas formas de llevarlo a 1 son borrar el import (rompe el
  archivo) o borrar la llamada (**mutila el bloque de identidad del sidebar de desktop**, que es
  exactamente lo contrario de lo que el criterio protege). El criterio tiene razón en la intención y
  está miscalibrado en el número.
- **Qué se hizo:** se corrió el gate completo **sin esa única aserción** y pasó
  (`nav=1 · ver mi página=1 · cerrar sesión=1 · firma=1`, más las cuatro del cableado y las cuatro
  del desktop). La intención del criterio —*`sidebarContent` sigue completo y el bloque de identidad
  sigue leyendo el plan*— **está satisfecha y verificada**. Para `02-04`: si el candado del
  inventario reusa esta aserción, el valor correcto es **2** (o `>=1`).

### 3. [Decisión de implementación dentro del contrato] El comentario del footer que describía el cierre del drawer se reescribió

- **Encontrado durante:** Task 2.
- **Qué pasó:** el comentario de HELP-01 en el footer de `sidebarContent` terminaba con *"y cierra el
  drawer en mobile igual que ellos"* — describiendo literalmente el `onClick` que este plan borra.
- **Qué se hizo:** se recortó esa cláusula (3 líneas tocadas, el resto del comentario verbatim). Es
  una línea eliminada **dentro** de la región de `sidebarContent`, así que queda explícita acá para
  que el verificador no la lea como mutilación: no toca markup, no toca cableado, y las cinco
  aserciones de contenido de `sidebarContent` siguen en 1. Dejar un comentario que miente sobre el
  código es peor que un comentario que falta.

**Total de desviaciones:** 3 — 1 fuera de alcance preexistente (Rule: scope boundary, no se
auto-arregló), 1 gate miscalibrado en el plan con la intención verificada por otra vía, 1 decisión de
implementación dentro del contrato. **Impacto:** ninguno sobre el comportamiento ni sobre el alcance.
Cero desviaciones de las Reglas 1-3 (no hubo bugs, ni funcionalidad crítica faltante, ni bloqueantes)
y cero de la Regla 4 (ninguna decisión arquitectónica).

## Authentication Gates

Ninguno. El plan no toca credenciales ni servicios externos.

## Known Stubs

Ninguno nuevo. El slot de acciones del header está **vacío a propósito y por contrato** —no es un
stub: el UI-SPEC §12 lo declara vacío en esta fase y mover acciones de una pantalla al header está
explícitamente fuera de alcance—. Queda **abierta** la entrada **8** de `.planning/WINDOWS.md` (el
`react-hooks/purity` preexistente del layout), que este plan no toca.

## Threat Flags

Ninguno. Cero migraciones (próxima libre: 080), cero policies, cero `GRANT`, cero service role, cero
superficie anónima nueva, cero env vars, cero paquetes npm, cero queries. Las dos amenazas `high` del
registro quedaron cerradas con gate propio:

- **T-02-13** (mobile sin header, o el borrado llevándose parte de `sidebarContent`): los dos gates
  independientes en verde — el layout monta los **tres** hermanos y la reducción de `sidebar.tsx` es
  >0% y <80%; y las cinco filas de `sidebarContent` más el bloque de desktop con **0** líneas
  eliminadas en el diff.
- **T-02-15** (el borrado llevándose el cableado de historial): los cinco conteos del cableado más la
  aserción de orden en verde, y `test/panel-history-sidebar.test.ts` —el candado estático que la
  Phase 1 escribió **sobre este mismo archivo**— verde dentro de la corrida de 105/105.
- **T-02-16** (tocar `components/ui/drawer.tsx` por asociación de nombre): no se tocó. Hash
  **87ac7ba** intacto. El drawer que este plan borró era un `<div>` casero del sidebar, no el
  componente de `components/ui/`.
- **T-02-17** (el pathname renderizado crudo): el pathname sólo indexa el mapa y no hay default que
  lo muestre.

## UAT visual — PENDIENTE

**Nadie miró esto todavía, ni en un teléfono ni en una ventana de escritorio.** Los 9 puntos del
`human-check` del plan quedaron sin correr y están registrados en `.planning/WINDOWS.md` (entrada
**10**, `kind: unrun-verify`). Es irreducible a comando en este repo: el runner es
`environment: 'node'`, sin jsdom y sin Playwright. Lo que falta:

1. **No hay ningún botón de menú en mobile**, en ninguna de las pantallas del panel. No oculto: no
   existe.
2. **El header con sus dos líneas**, y la línea 2 **cambiando al recorrer secciones**: Inicio ·
   Turnos/**Reservas** · Agenda · Clientes/**Pacientes** · Abonos · Finanzas · Configuración ·
   Ayuda · **Más**. ⚠ Lo irreducible acá es que diga **Pacientes** en una cuenta de salud y
   **Reservas** en una de canchas: el mapa está verificado estáticamente, pero que el provider
   entregue el rubro correcto en runtime sólo se ve en pantalla.
3. **Para la raíz el header dice `Inicio`**, no el label de desktop. (En el sidebar de **desktop**
   sigue diciendo "Dashboard" **a propósito** — MOB-07 prohíbe tocarlo. Es la inconsistencia
   aceptada y anotada de §14, no un bug.)
4. **El detalle de cliente** (`/clients?c=<id>`): el header sigue diciendo `Clientes`/`Pacientes`.
   Una subsección no es una sección.
5. **Nombre de ≥40 caracteres:** la línea 1 trunca con `…` y **no** empuja ni rompe el header. Ningún
   comando de este repo puede medir ancho de texto.
6. **A mitad de un formulario largo** (Negocio o Configuración), scrollear hasta que el `h1` de la
   pantalla salga de vista: el header fijo tiene que seguir diciendo en qué sección estás. Es la
   razón por la que la línea 2 existe.
7. **La UAT de v0.30 repetida DESDE LA BARRA** (criterio 6 de la fase, el único que compara contra lo
   ya verificado): sección → atrás del sistema → **Inicio**; el atrás cerrando overlay, selector,
   calendario y teclado **antes** de navegar; y el aviso de cambios sin guardar preguntando al tocar
   otro destino de la barra.
   ⚠ **Los dos recorridos que NO son bugs y no hay que reportar como regresión:**
   - `Inicio` → `Más` → **tocar `Inicio` en la barra** → **atrás** ⇒ aterriza **en Más**. Es la
     cuarta rama de `panelNavMode` (destino == raíz ⇒ empuja), decidida en v0.30 con motivo:
     reemplazar dejaría `/dashboard` sobre `/dashboard`, o sea un atrás muerto.
   - `Inicio` → `Más` → entrar a una sección → **atrás** ⇒ aterriza en **Inicio**, salteando Más. En
     esta fase el atrás es de **un** nivel; los dos niveles son la **Phase 3** (MOB-04).
8. **A ≥1024px:** el sidebar de desktop **exactamente igual que antes** —identidad, los grupos, "Ver
   mi página", Ayuda, Cerrar sesión y la firma— y **sin** header de mobile ni barra inferior. ⚠ Y
   **"Cerrar sesión" desde el sidebar de desktop tiene que seguir funcionando**: es el único
   `onClick` que sobrevive en el archivo, y el gate lo cuenta pero no lo ejecuta.
9. **A 900px de ancho:** no hay botón de menú, **sí** hay barra inferior, **sí** hay header de dos
   líneas. Es la banda 768-1023px, la que se habría quedado sin ningún menú si la barra hubiera
   entrado por el breakpoint de 768px.

⚠ Paso previo: la IP de la LAN tiene que estar en `allowedDevOrigins` (`next.config.ts:38-53`) o la
página **no hidrata** y los links caen al submit nativo.

## Los 9 supuestos marcados del probe de bordes — siguen abiertos

**Ninguno de los 9 cae en este plan** y queda dicho, no asumido: las 7 primeras son de MOB-01/MOB-02
y las cierra `02-01`, la 8 es de MOB-03 y la llevó `02-02`, y la 9 (`MOB-07 / unclassified`) la
defiende `02-01` con la verdad del sidebar byte-idéntico — que este plan **sostiene con evidencia**
(diff con 0 líneas de desktop eliminadas), pero **no cierra**. El verificador que necesite decidir
sobre uno de estos bordes y no encuentre evidencia **se abstiene** (`human_needed`): no lo infiere del
verde de estos gates, y **no** lo cierra con un `verification: backstop`. La tabla completa de las 9
filas, con su estado y la igualdad de no-pérdida, vive en `02-01-PLAN.md`.

## Next

Queda **un** plan en la fase. **Listo para `02-04`**: el candado de vitest del inventario sobre los
cuatro verticales, la negación por región, **el cierre de MOB-01/MOB-02/MOB-03/MOB-07** y el guion de
UAT de la fase completa.

⚠ **Este plan NO marcó requisitos como completos.** MOB-01 y MOB-07 los declaran varios planes de la
fase y los cierra `02-04` (a la wave 1 le pasó marcarlos y tuvo que revertirlo).

⚠ **Para `02-04`:** si su candado reusa la aserción de `getPlanLimits` del gate de este plan, el valor
correcto es **2**, no 1 (ver desviación 2 — medido en tres puntos, preexistente a la fase).

## Self-Check: PASSED

- `components/dashboard/panel-top-bar.tsx` — **FOUND** en disco
- `app/(dashboard)/layout.tsx` — **FOUND** en disco, con `PanelTopBar` montado 2 veces
- `components/dashboard/sidebar.tsx` — **FOUND** en disco, 199 líneas
- Commit `71c5d88` — **FOUND** en `git log`
- Commit `02ea69f` — **FOUND** en `git log`
- Los 12 `acceptance_criteria` del Task 1 y los 10 del Task 2: **re-corridos y en verde**, con las dos
  excepciones documentadas y medidas de las desviaciones 1 y 2
- `commits` del frontmatter: **MEDIDO** con `git rev-list --count 921fb41..HEAD` = **2**
