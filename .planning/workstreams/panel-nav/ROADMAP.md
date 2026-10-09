# Roadmap: Forjo App — v0.31 La navegación mobile del panel (workstream `panel-nav`)

> ⚠ **Este archivo NO es el `ROADMAP.md` del workstream.** El `ROADMAP.md` de `panel-nav` sigue siendo
> el de **v0.30** y no se pisó, por pedido explícito. Ver **"Dónde vive este archivo"** más abajo: hay
> un paso obligatorio antes de planificar la primera fase, porque las herramientas del GSD leen
> `ROADMAP.md` y **no** ven este archivo.
>
> Cubre **v0.31 La navegación mobile del panel**, Phases **2-4** del workstream `panel-nav`.
> Requisitos: `.planning/workstreams/panel-nav/REQUIREMENTS-v031.md` (MOB-01..MOB-09, D-01/D-02,
> restricciones medidas T-1..T-5). Rama `main`, worktrees desactivados (`use_worktrees: false`).
> Granularidad `coarse` (`.planning/config.json:91`) ⇒ 3 fases. `project_code: null` y sin
> `phase_id_convention` ⇒ IDs secuenciales (`Phase 2`, `Phase 3`, `Phase 4`).
> Aplican las skills `convenciones-forjo` (stack, naming, verticales) y, de `supabase-multitenant-rls`,
> **sólo su invariante de lectura** — este milestone no toca datos ni policies.

## Overview

v0.30 arregló **qué hace el atrás**. v0.31 cambia **cómo se entra**: en el celular el panel se navega
desde una barra inferior fija (`Inicio · Turnos · Agenda · Clientes · Más`) en vez de un menú
hamburguesa, y "Más" guarda el resto del menú del rubro. Es el pedido del dueño después de la UAT de
v0.30, y es el único milestone del workstream que **redefine** una política ya verificada en celular
real en vez de agregarle casos.

El faseo sale de una sola pregunta: **¿qué se puede verificar sin tocar el mecanismo de historial?**

1. **Phase 2 — la superficie.** La barra y Más existen, se ven, se tocan, respetan la zona segura y no
   tapan nada. **Cero líneas** en `lib/panel-history.ts`, `lib/overlay-history.ts` y
   `lib/dirty-history.ts`: el atrás sigue haciendo exactamente lo que el dueño ya verificó. Si esta
   fase rompe algo, rompió píxeles, no navegación.
2. **Phase 3 — la política.** Recién acá el atrás pasa de **un nivel** a **dos**, con la fase entera
   dedicada a eso y con la suite y la UAT de v0.30 como red. Es la fase riesgosa, y está sola a
   propósito.
3. **Phase 4 — los tabs.** Lo que era la Phase 2 de v0.30 (NAV-03/04, hoy MOB-08/09), escrito **una
   sola vez** contra la política ya fijada. Era justamente el motivo del diferimiento.

**Por qué la política NO va primero, aunque sea el corazón del milestone.** Es la decisión de forma de
este roadmap y conviene dejarla por escrito. La política de dos niveles sólo se puede *definir* cuando
existe el segundo nivel: "atrás desde una sección vuelve a **Más**" no se puede escribir, ni testear,
ni mirar en un teléfono, si Más todavía no es un lugar. Y el **cómo** es un lugar (ruta propia vs.
hoja registrada en `lib/overlay-history.ts`) es una decisión que el contrato de diseño de la Phase 2
tiene que cerrar, porque cambia el stack de historial. Hacer la política primero sería escribirla
contra un Más imaginario — exactamente el error que v0.30 evitó difiriendo sus tabs.

**Por qué los tabs van al final y no en el medio.** No dependen de la política para *funcionar*, pero
sí para no reescribirse: su regla de push-vs-replace la fija la Phase 3. Y son la fase de mayor radio
de impacto (T-1 de v0.30: `settings-client.tsx` son 4183 líneas compartidas por 5 rutas), así que
conviene que lleguen cuando el mecanismo ya no se mueve.

## Dónde vive este archivo (y qué hay que hacer antes de planificar)

Lo pedido fue no pisar el `ROADMAP.md` de v0.30, y está respetado. Pero hay un costo concreto que
conviene saber antes, no después:

**Las herramientas del GSD leen `.planning/workstreams/panel-nav/ROADMAP.md` y nada más.**
`/gsd-plan-phase`, `/gsd-execute-phase` y `/gsd-progress` resuelven la fase por el header
`### Phase N:` de ese archivo. Con este roadmap en `ROADMAP-v031.md`, `/gsd-plan-phase 2 --ws panel-nav`
levantaría **"Los tabs profundos"** del roadmap de v0.30, no la barra inferior. Y `state.json` del
workstream todavía tiene `{"number": "2", "status": "pending"}` apuntando a esa Phase 2 vieja.

**Recomendación (es el camino que el repo ya usa en todos los milestones anteriores):** antes de correr
`/gsd-plan-phase 2`, archivar v0.30 y promover este archivo a canónico:

1. `.planning/workstreams/panel-nav/ROADMAP.md` → `.planning/milestones/v0.30-ROADMAP.md`
   y `REQUIREMENTS.md` → `.planning/milestones/v0.30-REQUIREMENTS.md`
   (es exactamente lo que hace `/gsd-complete-milestone`, y la convención ya tiene 30 entradas:
   `.planning/milestones/v0.9-*` … `v0.29-*`).
2. `ROADMAP-v031.md` → `ROADMAP.md` y `REQUIREMENTS-v031.md` → `REQUIREMENTS.md`.
3. Entrada de v0.30 en `.planning/MILESTONES.md` (⚠ la memoria del proyecto avisa que el CLI
   `milestone.complete` **genera mal** la entrada en un workstream acumulativo: hay que reescribirla a
   mano).

Hasta que eso pase, este archivo es documentación, no plan ejecutable. **No lo promoví yo** porque
mover `ROADMAP.md` es destruir el artefacto de v0.30, y la consigna fue no pisarlo.

**Numeración.** Arranca en **Phase 2**, como se pidió: el número está libre de verdad —no existe
`phases/02-*`, no hay planes, no hay commits— y el contenido de esa Phase 2 (los tabs) **sigue vivo en
este milestone** como la Phase 4. La única consecuencia es la ambigüedad transitoria del párrafo
anterior: mientras los dos archivos coexistan hay dos definiciones distintas de "Phase 2" en el
workstream. Si preferís cero ambigüedad sin archivar nada, la alternativa es correr este milestone como
Phases **3-5** y dejar la 2 quemada con motivo. Lo digo y queda a tu criterio; el roadmap está escrito
con 2-3-4.

## Hechos verificados contra lo instalado (Next 16.2.7, no de memoria)

Las tres fases apoyan decisiones de forma en estos hechos. Están citados con archivo y línea para que
ningún plan los re-suponga.

| # | Hecho | Dónde | Por qué condiciona el roadmap |
|---|---|---|---|
| H-1 | El tipo `ViewportLayout` de Next **sí acepta `viewportFit: 'auto' \| 'cover' \| 'contain'`**, aunque `generate-viewport.md` **no lo documenta** (documenta `width`, `initialScale`, `maximumScale`, `userScalable`, `interactiveWidget`, `themeColor`, `colorScheme`). | `node_modules/next/dist/lib/metadata/types/extra-types.d.ts:42-53`; doc: `.../04-functions/generate-viewport.md:148-170` | T-2 tiene camino tipado y sin hacks. **Sin `viewport-fit=cover` el `env(safe-area-inset-bottom)` vale 0** y MOB-02 no se cumple aunque el CSS esté escrito. El plan NO tiene que inventar un `<meta>` crudo. |
| H-2 | El viewport/metadata se evalúa **de la raíz hacia la hoja** y se mergea **superficialmente**: las claves duplicadas las **reemplaza el segmento más profundo**. Y `app/layout.tsx` **no exporta `viewport` ni `generateViewport`** (medido: cero coincidencias). | `.../04-functions/generate-metadata.md:1316-1328`; `app/layout.tsx` | ⇒ `viewport-fit=cover` se puede declarar **sólo en `app/(dashboard)/layout.tsx`** y el landing, `/[slug]` y el CRM **no se enteran**. Esto saca de encima el riesgo de "tocar el viewport global por una barra del panel". Requisito: el export vive en un Server Component (`generate-viewport.md:17`) — `(dashboard)/layout.tsx` es `async function`, cumple. |
| H-3 | El mismo tipo acepta `interactiveWidget: 'resizes-visual' \| 'resizes-content' \| 'overlays-content'`. | `extra-types.d.ts:52-53` | Es la perilla del **teclado contra la barra fija**, y en este repo no es teoría: hay **cuatro quicks** de octubre sobre teclado y drawers (`261005-pbj`, `261005-x91`, `261005-vuy`, `261006-fln`). Una barra fija abajo + teclado abierto es terreno ya lastimado. |
| H-4 | El back/forward **conserva** el custom history state (`preserveCustomHistoryState: true`, con el comentario de que es a propósito), pero la navegación blanda —`<Link>`, `router.push/replace`— lo setea en **`false`** y por lo tanto **borra** las marcas propias de la entrada. | `node_modules/next/dist/client/components/segment-cache/navigation.js:405-414` y `:376-384` | Es la trampa central de la Phase 3: cualquier marca que la barra o Más escriban en `history.state` **sobrevive al atrás pero no sobrevive al siguiente toque de un `<Link>`**. Toda decisión de la política tiene que re-verificar la marca en el punto de uso, nunca confiar en que sigue ahí. |
| H-5 | El `popstate` del atrás del usuario llega **`cancelable: false`** y su `preventDefault()` es no-op; la Navigation API tampoco lo cancela (`userInitiated: true`). **No se cancela: se absorbe.** | medido en Chrome 153 por CDP, `.planning/debug/interceptar-atras-aviso-sin-guardar.md` | Es la advertencia de MOB-05, y ya tiene implementación de referencia en producción: `lib/dirty-history.ts` (quick `261006-flm`) corre el ciclo sentinel completo. La Phase 3 **no inventa mecanismo**, decide si lo quiere. |
| H-6 | `window.history.pushState/replaceState` están **soportados y se integran al router** (sincronizan `usePathname`/`useSearchParams` sin round-trip), y `router.push` **agrega** entrada mientras `router.replace` **no**. | `.../01-getting-started/04-linking-and-navigating.md:341-345`; `.../04-functions/use-router.md:44-45` | Son las dos primitivas que `lib/panel-history.ts` ya envuelve. La Phase 3 extiende ese módulo, no abre un segundo camino. |

## Lo medido en el repo que cambia el alcance de las fases

Esto salió de leer el código hoy, y corrige o completa lo que dicen los requisitos:

| # | Qué | Dónde |
|---|---|---|
| M-1 | **La barra fija de D-01 es válida en los 4 verticales**, verificado uno por uno: `salud`, `belleza`, `general` y `canchas` exponen todos `dashboard`, `appointments`, `agenda` y `clients`/`patients`. D-01 no tiene excepciones. | `lib/verticals.ts:58,80,101,122` |
| M-2 | ⚠ **D-01 fija los DESTINOS, no las PALABRAS.** Los labels salen de la terminología: en `canchas` "Turnos" es **"Reservas"** y en `salud` "Clientes" es **"Pacientes"**. A 375px con 5 ítems eso es ~75px por ítem para la palabra más larga del sistema (**"Reservas"**, 8 caracteres). Es una restricción de diseño, no un detalle. | `lib/verticals.ts:44-45,105-116`; `sidebar.tsx:63-76` |
| M-3 | ⚠ **"Todo el menú" es más que `NAV_GROUPS`.** El footer del sidebar tiene tres filas que **no** están en los 5 grupos y que hoy sólo existen ahí: **Ayuda** (`/ayuda`), **Ver mi página** (externa, pestaña nueva) y **Cerrar sesión** — más el bloque de identidad (logo, nombre, plan). Si Más renderiza sólo `buildNavGroups()`, el dueño **pierde el logout en mobile**. | `sidebar.tsx:181-241` |
| M-4 | El reparto exacto: 12 destinos en el menú ⇒ **8 en Más** para salud/belleza/general (`abonos`, servicios, equipo, consultorios, negocio, web, finanzas, configuración) y **7 en canchas** (no expone `equipo`). | `sidebar.tsx:43-48`; `lib/verticals.ts:122` |
| M-5 | ⚠ **El breakpoint real es `lg` (1024px), no 768.** El sidebar es `hidden lg:flex` y el header mobile `lg:hidden`: entre 768 y 1023px **hoy no hay sidebar**, hay hamburguesa. Si la barra entrara por `md:hidden`, esa banda se quedaría sin ningún menú. | `sidebar.tsx:244,276` |
| M-6 | ⚠ **El drawer hamburguesa de hoy NO participa del historial**: es `useState` pelado (`mobileOpen`), sin marca en `history.state` y sin registro en `lib/overlay-history.ts`. ⇒ Si Más se construye con ese molde, **el atrás no lo cierra**, y MOB-04 ("desde Más vuelve a Inicio") es imposible. Más tiene que ser una **ruta** o una hoja **registrada** en `overlay-history`. | `sidebar.tsx:93,243-273` |
| M-7 | Los toasts del proyecto son **`top-center` en mobile** (un solo `<Toaster>`, decisión del quick `261005-vuy`). ⇒ Cero colisión con una barra inferior; y si MOB-05 se resuelve con un aviso tipo toast, **ese aviso aparece arriba**, lejos del pulgar que acaba de apretar atrás. Es un dato de diseño. | `app/layout.tsx:65-81` |
| M-8 | El panel **no es instalable**: no hay `app/manifest.ts`, ni `site.webmanifest`, ni un solo uso de `display-mode`/`standalone` en todo el repo. ⇒ La única condición bajo la cual la advertencia de MOB-05 dice que el patrón es natural **no existe hoy**, y gatear por `@media (display-mode: standalone)` daría **siempre false** (un requisito que no hace nada). | medido (`ls app/manifest*`, grep `display-mode`) |
| M-9 | `main` reserva hoy el header con `pt-14 lg:pt-0` y **no reserva nada abajo**. Las pantallas no tienen padding inferior que una barra pueda ocupar: el alto se reserva acá, en un solo lugar. | `app/(dashboard)/layout.tsx:56` |
| M-10 | ⚠ **Error de dato en los requisitos:** `REQUIREMENTS-v031.md:93` dice "próxima migración libre: **042**". Es falso — la última aplicada es la **079** (`supabase/migrations/079_service_categories_name_normalized.sql`), así que la próxima libre es la **080**. Inofensivo acá (este milestone tiene cero migraciones), pero conviene corregirlo para que no se arrastre. | `supabase/migrations/` |

## Phases

**Phase Numbering:**

- Fases enteras: trabajo planificado del milestone. Arrancan en **2**, continuando el workstream
  (`panel-nav` cerró v0.30 con la Phase 1 ejecutada y la 2 nunca materializada — ver "Dónde vive este
  archivo").
- Fases decimales (2.1, 2.2): inserciones urgentes posteriores (marcadas INSERTED).

### Milestone v0.31 — La navegación mobile del panel

- [ ] **Phase 2: La barra inferior y Más** - En mobile el panel se navega desde una barra fija de 5 destinos que respeta la zona segura del teléfono y un "Más" que guarda el resto del menú del rubro sin perder ninguna fila; el mecanismo de historial no se toca y desktop queda idéntico
- [ ] **Phase 3: La política de atrás, de un nivel a dos** - El atrás pasa a tener dos niveles (sección → Más → Inicio) sin romper nada de lo que el dueño ya verificó en celular, y la guarda de salida en Inicio se decide con los números a la vista en vez de asumirse
- [ ] **Phase 4: Los tabs profundos sobre la política ya fijada** - Los tabs de `/negocio`, `/settings` y `/finances` viven en la URL contra la política definitiva, sin tocar las otras tres rutas que comparten esa pantalla ni romper el retorno del OAuth de MercadoPago

## Phase Details

### Phase 2: La barra inferior y Más

**Goal**: Que en el celular el panel se navegue desde una **barra inferior fija** con `Inicio · Turnos ·
Agenda · Clientes · Más` —dibujada por encima de la zona de gestos del teléfono y sin tapar contenido de
ninguna pantalla— y que **Más** contenga el resto del menú del negocio, agrupado como hoy y sin perder
ni una fila; con el mecanismo de historial **intacto** y el desktop idéntico.

**Depends on**: Nothing (primera fase del milestone; la Phase 1 de v0.30 ya está en producción)

**Requirements**: MOB-01, MOB-02, MOB-03, MOB-07

**Success Criteria** (qué tiene que ser VERDAD):

  1. **La barra existe y navega, en todas las pantallas y en los cuatro rubros.** En un celular real,
     cualquier pantalla del panel muestra abajo cinco destinos con el actual señalado (y señalado de
     verdad: `aria-current` además del color), y cada uno navega. Los labels salen de la terminología
     del vertical, así que un negocio de **canchas** lee **"Reservas"** y uno de **salud** lee
     **"Pacientes"** (M-2) — y a **375px los cinco entran sin truncar "Reservas"**, medido en el
     navegador a ese ancho, no estimado (MOB-01).
  2. **Zona segura real, no escrita.** `viewport-fit=cover` queda declarado por el export `viewport`
     de **`app/(dashboard)/layout.tsx`** y no por el root layout (H-1, H-2), así que `/[slug]`, el
     landing y el CRM salen **byte por byte iguales** en su `<head>` (verificable con un diff del
     markup servido, que es el método que el quick `261006-mx6` ya dejó instalado). Con eso, la barra
     se dibuja por encima de la barra de gestos y **ningún destino mide menos de 44×44**, medido
     leyendo el DOM a 375px (MOB-02).
  3. **Nada queda tapado.** El alto de la barra se reserva en **un solo lugar** (`main` de
     `(dashboard)/layout.tsx`, el mismo que hoy reserva el header con `pt-14` — M-9), e incluyendo el
     inset inferior: el último elemento de la pantalla más larga del panel sigue alcanzable con scroll
     a 375px, y los botones de alta de Finanzas y el footer de los formularios no quedan debajo de la
     barra. El caso **teclado abierto** está decidido explícitamente —no accidentalmente— con la
     perilla `interactiveWidget` (H-3) o con la regla de que la barra se oculta mientras el teclado
     está arriba: la fase declara cuál y lo prueba en el teléfono, porque este repo ya pagó cuatro
     quicks de teclado (MOB-02).
  4. **Más no pierde ningún destino, y el reparto es el medido.** Más muestra el menú resuelto por
     vertical **menos** los cuatro de la barra: **8 filas** en salud/belleza/general y **7 en canchas**
     (que no expone `equipo` — M-4), agrupadas con los mismos headers de hoy y sin que aparezca un
     grupo vacío. **Y están las tres filas del footer que no viven en `NAV_GROUPS`**: Ayuda, "Ver mi
     página" (pestaña nueva) y **Cerrar sesión** (M-3). Criterio duro: `Más` + la barra reproducen
     **exactamente** el inventario que hoy muestra el drawer, rubro por rubro — se verifica contra los
     cuatro verticales, no contra uno (MOB-03).
  5. **Desktop idéntico y un solo menú en mobile.** A ≥1024px no aparece ninguna barra y el sidebar es
     el de hoy sin cambios (`hidden lg:flex`); la barra entra por **`lg:hidden`** y no por `md:`, para
     que la banda 768-1023px —que hoy tiene hamburguesa y no sidebar— quede cubierta (M-5). Y en
     mobile queda **un solo** camino de entrada: el drawer hamburguesa dejó de ser el menú (MOB-07).
  6. **El mecanismo de historial no se tocó, y es auditable:** `git diff` de la fase da **cero**
     cambios en `lib/panel-history.ts`, `lib/overlay-history.ts` y `lib/dirty-history.ts`; los links de
     la barra consumen `panelNavMode` y `consumeOwnedPanelEntry` **exactamente** como los consume hoy
     el sidebar, en el **mismo orden** (guard de cambios sin guardar primero — T-5); `npx vitest run`
     sigue verde; y la UAT de v0.30 repetida desde la barra da lo mismo que daba desde el menú:
     sección → atrás → **Inicio**, y el atrás sigue cerrando overlay, selector, calendario y teclado
     antes de navegar.

**Fuera de alcance de esta fase** (explícito):

- **La política de dos niveles (MOB-04).** En esta fase el atrás sigue siendo de **un nivel**, y eso
  es deliberado: `Inicio → Más → sección → atrás` va a caer en **Inicio** salteando Más, porque
  `panelNavMode` reemplaza entre secciones. Es el comportamiento actual y verificado, no un defecto de
  la fase. Lo cambia la Phase 3.
- **MOB-05** (la guarda de salida en Inicio): se *decide* en el contrato de diseño de esta fase, se
  *implementa* en la Phase 3, donde vive el historial.
- Los tabs de `/negocio`, `/settings` y `/finances` → Phase 4.
- Rediseñar las pantallas en sí, su contenido o sus headers internos: esto es navegación. Lo único que
  se puede mover de una pantalla es el **padding** que reserva el alto de la barra.
- Convertir el panel en **PWA instalable** / agregar `manifest` (fuera de alcance del milestone, y
  M-8 explica por qué importa para MOB-05).
- Reordenar los grupos de Más o cambiar el reparto de D-01 (la barra es fija, por decisión).
- **Migraciones: cero.** Nada de esta fase toca datos. La próxima libre es la **080** (M-10 corrige el
  dato de los requisitos).

**Riesgo y verificación**:

Riesgo **medio**, y es casi todo riesgo de **diseño y de superficie**, no de mecanismo:

- **(a) La forma de Más es la decisión de arranque, y arrastra a la Phase 3.** Hay dos formas viables y
  **no son equivalentes para el atrás**: (i) **ruta propia** (`/mas`) ⇒ Más es una entrada de
  historial gratis y la Phase 3 trabaja sobre rutas, que es donde `panelNavMode` ya vive; (ii) **hoja
  registrada en `lib/overlay-history.ts`** ⇒ no hay ruta nueva, pero la entrada de Más queda **arriba**
  de la de la sección y choca con el límite que `panel-history.ts` ya documenta ("si un overlay empujó
  su entrada y el dueño toca el menú, el `replace` cae sobre la entrada del overlay"). Lo que **no** es
  viable es el molde del drawer de hoy: `useState` pelado, sin historial (**M-6**) ⇒ el atrás no lo
  cerraría y MOB-04 quedaría imposible. **El contrato de diseño tiene que cerrar esta decisión**, y la
  Phase 3 hereda la consecuencia.
- **(b) El viewport es un cambio con radio, y el radio se acota midiendo.** `viewport-fit=cover`
  cambia cómo se calcula el área de dibujo. Acotarlo al route group `(dashboard)` (H-2) es lo que
  impide que la landing premium y la página pública de reservas se enteren — y el criterio 2 pide
  **probarlo**, no confiar en la teoría del merge.
- **(c) El teclado.** Cuatro quicks de octubre sobre teclado/drawer son el aviso. Una barra
  `position: fixed; bottom: 0` con el teclado abierto puede quedar flotando sobre el campo o pegada
  arriba del teclado según `interactiveWidget` (H-3) y según el navegador. Se decide y se prueba; no se
  descubre en producción.
- **(d) Quedarse con dos menús.** Si el drawer sobrevive "por si acaso", hay dos inventarios que
  divergen en el próximo destino que alguien agregue. El criterio 5 lo cierra.

Verificación: **UAT en celular real** (el único criterio que vale: el dueño encontró 7 bugs así con el
pipeline en verde) recorriendo los **cuatro rubros** —o al menos `canchas` por "Reservas" y `salud` por
"Pacientes"— con y sin teclado abierto, y confirmando que nada quede tapado en Finanzas y en los
formularios largos · medición del DOM a **375px** para los 44×44 y para el truncado (⚠ la memoria
`medicion-responsive-chrome-headless` avisa: Chrome headless **ignora** `--window-size` con
`--dump-dom`; hay que montar la sonda en un iframe del ancho pedido) · diff del `<head>` servido de
`/[slug]` y del landing antes/después (criterio 2) · `npx vitest run` (⚠ dos canarios de reloj fallan a
propósito fuera de [01:00, 23:30] AR — memoria `canarios-de-reloj-en-la-suite`) · `npm run lint` ·
`npx tsc --noEmit` (⚠ memoria `worktree-nodemodules-y-npx-tsc-traps`: `npx tsc` puede salir 0 en falso)
· `npm run build`. El workstream tiene `auto_advance: false` (`workstreams/panel-nav/config.json`), así
que el checkpoint humano **no** se auto-aprueba.

**UI-SPEC**: **SÍ, y es la fase que lo necesita de verdad.** Coincido con tu lectura y la refuerzo con
lo medido: la barra y Más no son "poner cinco botones", son seis decisiones de diseño que el código no
puede tomar solo —(1) el **inventario y la jerarquía** de Más, incluyendo dónde caen Ayuda, "Ver mi
página" y Cerrar sesión, y qué pasa con el bloque de identidad del negocio (M-3); (2) qué pasa con el
**header superior** de hoy, que se queda sin su única razón de ser (el ☰) pero es lo único que muestra
el nombre del negocio en mobile; (3) **iconos y labels a 375px** con "Reservas" como peor caso (M-2);
(4) los **estados** del destino activo, el toque y el foco visible; (5) la **zona segura** y el
comportamiento con el **teclado** (H-3); y (6) **la forma de Más** —hoja o pantalla— que es el riesgo
(a) y que arrastra a la Phase 3. El dueño eligió explícitamente *"diseñar primero"*, y acá eso no es
ceremonia: la decisión (6) cambia el plan de la fase siguiente.

**Y además:** el contrato de diseño de esta fase tiene que cerrar **la superficie de MOB-05** (el aviso
de salida en Inicio), aunque se implemente en la Phase 3. Motivo: es una decisión de patrón —toast,
diálogo, o nada— que se toma mirando el diseño de la barra, no leyendo un diff. Un solo pase de diseño,
no dos.

**Security/Integrity relevance**: Superficie autenticada del dashboard, **sin** cambios de esquema,
policies ni queries. Un punto a no perder: Más deriva su contenido de `resolveVertical(business).menu`,
y el gating por rubro se preserva **por construcción** sólo si el filtrado sigue siendo el de
`buildNavGroups()` (`sidebar.tsx:78-88`) — si Más reimplementa el filtro, un negocio de canchas podría
ver "Equipo", que es una ruta que no le corresponde. No es una fuga de datos cross-tenant (el panel
resuelve `business` por `owner_id` en el layout), es coherencia de producto. Riesgo bajo.

**Plans:** 3/4 plans executed (**4 waves secuenciales** · 8 tareas · 11 archivos: 7 nuevos, 4 editados)

Plans:

- [x] 02-01-PLAN.md
- [x] 02-02-PLAN.md
- [x] 02-03-PLAN.md
- [ ] 02-04-PLAN.md
- [ ] `02-01-PLAN.md` — wave 1 · El prerequisito compartido (`nav-groups.ts`, bloqueante C-2) y el slice: los dos tokens, el export `viewport` acotado al route group, la reserva de alto en el `<main>` y la barra inferior de 5 destinos, montada y navegando
- [ ] `02-02-PLAN.md` — wave 2 · La ruta `/mas`: inventario del rubro derivado de `buildNavGroups` **restando por `href`** (8/8/8/7), bloque de identidad con los 4 valores del contrato, grupo `CUENTA` con sus 3 filas y la semántica de headings/landmarks
- [ ] `02-03-PLAN.md` — wave 3 · El header de dos líneas extraído a `panel-top-bar.tsx` (nombre del negocio + título de sección con la terminología del rubro) y el fin del segundo menú: ☰, overlay y drawer fuera del markup, desktop intacto
- [ ] `02-04-PLAN.md` — wave 4 · Los dos candados de lo invisible (el inventario puro de los 4 verticales y el barrido estático de los 8 invariantes) más el guion de la UAT en celular real, con los 5 ítems irreducibles y los 2 recorridos que no son bugs

**Correcciones medidas que los planes obedecen por encima de este documento:** **C-1** el repo **sí**
usa `env(safe-area-inset-*)` (T-2 es falso; precedente que ya compila en `whatsapp-float.tsx:36`, y en
un valor arbitrario de Tailwind **no puede haber espacios**) · **C-2** `buildNavGroups` **no está
exportada** ⇒ su extracción es tarea de la wave 1, no un refactor opcional · **C-3** el bloque de
identidad **no** es verbatim: son **4 divergencias deliberadas** (40×40, `rounded-lg`, 16px/600,
14px/400) que ningún gate automático ve · y el criterio 2 se verifica por **la línea del
`<meta name="viewport">`**, no por un diff del `<head>` entero (el de `/[slug]` lo arma un
`generateMetadata` que lee la base ⇒ falsos rojos).

**UI hint**: yes

### Phase 3: La política de atrás, de un nivel a dos

**Goal**: Que el atrás del celular tenga **dos niveles** —desde una sección abierta por Más vuelve a
**Más**, desde Más vuelve a **Inicio**, y desde una sección de la barra vuelve derecho a **Inicio**—
sin romper **nada** de lo que el dueño ya verificó en celular (overlays, selectores, calendario,
teclado y el aviso de cambios sin guardar), y que la guarda de salida en Inicio se resuelva con una
**decisión escrita** en vez de asumirse.

**Depends on**: Phase 2 (la política de dos niveles no se puede definir, ni testear, ni mirar en un
teléfono, antes de que Más sea un lugar; y la forma que la Phase 2 le dé a Más —ruta u hoja— determina
sobre qué escribe esta fase)

**Requirements**: MOB-04, MOB-05, MOB-06

**Success Criteria** (qué tiene que ser VERDAD):

  1. **Los dos niveles, observables en un teléfono.** `Inicio → Más → una sección de Más → atrás` deja
     a Más **abierto** (no a Inicio, y no en una pantalla intermedia vacía), y un atrás más cae en
     **Inicio**. En paralelo, `Inicio → un destino de la barra → atrás` cae en **Inicio** sin pasar por
     Más. Los dos recorridos son distintos y los dos son correctos: ésa es toda la fase (MOB-04).
  2. **El cruce entre los dos niveles no deja basura ni atrás muertos.** Estando en una sección que se
     abrió por Más, tocar un destino **de la barra** deja la pila en **un** nivel ⇒ el atrás cae en
     Inicio, no en Más. Tocar en la barra el destino en el que ya estás **no apila** nada y sigue
     cerrando la subsección abierta (la regla NAV-08 de v0.30 sigue viva). Y en ningún recorrido hace
     falta apretar atrás dos veces para que pase **algo visible** — la "entrada basura" que v0.30
     prohíbe explícitamente (MOB-04).
  3. **MOB-05 queda resuelto por una decisión, no por una suposición.** La fase arranca cerrando la
     decisión y la deja escrita en `REQUIREMENTS-v031.md` con su motivo. Si se implementa, el criterio
     observable es: en Inicio el primer atrás **no saca** del panel y avisa; el segundo sale de verdad;
     salir cuesta exactamente **un** atrás más —nunca dos avisos encadenados— y el ciclo repetido tres
     veces seguidas sigue funcionando (es el escenario S1 ya medido en el diagnóstico). Si se descarta,
     el criterio es: en Inicio el atrás sale directo, **y MOB-05 queda marcado "descartado con
     motivo"** en los requisitos — no como pendiente silencioso (MOB-05).
  4. **Cero regresión sobre lo verificado, y verificado otra vez a mano.** Con un overlay abierto el
     atrás **cierra el overlay** y no navega; ídem el selector de hora propio, el campo de fecha y el
     calendario (los cuatro quicks de octubre: `261005-n41`, `261006-dzr`, `261006-fln`, `261005-x91`);
     con cambios sin guardar en Agenda el atrás **sigue avisando** (`lib/dirty-history.ts`) y
     "Salir sin guardar" aterriza donde manda la política **nueva**, no la vieja (el defecto que el
     quick `261006-iey` ya tuvo que arreglar una vez); y las suites `test/overlay-history.test.ts`,
     `test/dirty-history.test.ts`, `test/panel-history.test.ts`, `test/panel-history-sidebar.test.ts`
     y `test/panel-history-clients.test.ts` siguen **verdes** (MOB-06).
  5. **Una sola forma, y los tres dueños de historial se siguen reconociendo.** La política nueva vive
     en `lib/panel-history.ts` como funciones **puras** testeadas en vitest (`environment: 'node'`, sin
     jsdom ni paquetes nuevos — el molde que el módulo ya documenta), y un `grep -rE
     'pushState|replaceState|history\.back'` sobre los componentes de la barra y de Más da **cero**
     hits fuera del helper. La regla 0 (`isForeignOwnedEntry`) sigue reconociendo `frjOverlay` y
     `frjDirty`, y si esta fase agrega una marca nueva, es **nueva** —no reusa ninguna de las tres— y
     los otros dos módulos la reconocen o la ignoran, pero nunca le hacen `back()` encima (MOB-06).
  6. **Desktop sigue sin enterarse.** La política de dos niveles se expresa sobre **rutas** (o sobre la
     marca de la entrada), de modo que el desktop —que nunca navega desde Más porque Más no existe
     ahí— cae en las mismas ramas de siempre **por construcción**, sin un chequeo de viewport en el
     medio. Verificado: el recorrido del sidebar en desktop da exactamente lo de hoy.

**Fuera de alcance de esta fase** (explícito):

- Rediseñar la barra o Más: su forma la fijó la Phase 2.
- Los tabs → Phase 4.
- **PWA / manifest**, incluso si la decisión de MOB-05 lo hace atractivo (M-8 explica por qué el gate
  `display-mode: standalone` hoy sería un requisito que no hace nada).
- Forzar que el atrás **nunca** cruce de sección cuando se entró **directo** a una ruta (URL pegada,
  F5, el rebote del proxy post-login). Ese caso ya está **aceptado y documentado** en v0.30: no hay
  Inicio debajo y el atrás sale del panel. Empujar un Inicio falso es inventar una entrada que el
  dueño nunca visitó.
- Extender `useUnsavedChanges` a pantallas nuevas (decisión aparte, ya declarada).
- **Migraciones: cero.** Próxima libre: **080**.

**Riesgo y verificación**:

Riesgo **ALTO — es la fase más riesgosa del milestone**, y por eso está sola. Lo que la hace riesgosa
no es la cantidad de código, es que **redefine una regla que ya está verificada en celular real** y que
tiene **tres módulos** escribiendo en la misma pila (`panel-history`, `overlay-history`,
`dirty-history`, los tres documentando las mismas tres cicatrices: empujar la misma URL saca al usuario
de la página, un `back()` sobre entrada ajena lo expulsa del sitio, y dos dueños por entrada rompe el
conteo de backs).

- **(a) La política de dos niveles no es expresable con `panelNavMode({from, to})` tal como está, y ése
  es el corazón del plan.** Hoy "sección → sección" devuelve `replace`, que es lo que garantiza **un**
  nivel. Con Más en el medio, el caso "estoy en una sección que abrí por Más y toco un destino de la
  barra" necesita saber **qué hay debajo**, y eso no está en el par `(from, to)`: con la regla actual
  el `replace` pisaría la sección y dejaría `Inicio → Más → sección`, de modo que el atrás caería en
  Más — violando MOB-04 para los destinos de la barra. Hay tres caminos y el plan tiene que elegir con
  argumento: (i) **Más como ruta** y una rama nueva `from === '/mas' ⇒ push`, más una forma de
  colapsar los dos niveles al volver a la barra; (ii) **marcar la entrada** de una sección abierta por
  Más en `history.state` (el idioma que los tres módulos ya hablan) y decidir con esa marca — ⚠ con H-4
  encima: la marca **sobrevive al atrás pero la borra la siguiente navegación blanda**, así que hay que
  re-verificarla en el punto de uso; (iii) **Más como hoja de `overlay-history`**, que evita la ruta
  pero hereda el límite ya documentado de la entrada del overlay arriba de la de la sección. **Esta es
  la decisión de arranque del plan y el criterio 2 es el que la arbitra.**
- **(b) MOB-05 es una decisión de producto disfrazada de requisito técnico, y está medida en contra.**
  Lo que se puede hacer es absorber (H-5), y absorber significa **dos toques de atrás siempre** en
  Inicio. Lo que lo haría natural —una app instalada— **no existe** (M-8). Mi recomendación, para que
  el plan tenga de dónde agarrarse: la variante **menos intrusiva** es el patrón de Android —absorber
  **una** vez y mostrar un aviso efímero ("Tocá atrás otra vez para salir"), sin diálogo modal y sin
  botones— porque cuesta un solo toque extra, no bloquea, usa `sonner` que ya está (cero dependencia
  nueva) y se apoya en `lib/dirty-history.ts`, que ya corre el ciclo sentinel completo en producción.
  ⚠ Con un detalle de diseño medido: **ese aviso aparecería arriba** (`top-center`, M-7), lejos del
  pulgar. El diálogo modal es la variante **peor**: cuesta dos toques y una decisión, para proteger
  algo que en Inicio no tiene nada que perder. Y "descartarlo" es una respuesta **legítima** y hay que
  dejarla sobre la mesa: es el único requisito del milestone cuyo propio texto admite que puede molestar
  más de lo que ayuda.
- **(c) Las tres marcas y el orden de evaluación.** `frjView`, `frjOverlay` y `frjDirty` conviven hoy
  porque cada módulo re-verifica **su** marca justo antes de cada `back()` y porque la regla 0 de
  `panel-history` se abstiene ante las otras dos. Una política nueva que escriba historial sin pasar
  por ese embudo rompe el conteo de backs de los otros dos, y el síntoma es **un atrás muerto o una
  expulsión del sitio**, no un error en consola. El criterio 5 es el candado.
- **(d) El modo de falla de esta fase es silencioso.** Ninguno de estos bugs tira una excepción: la
  URL cambia y la vista no, o el atrás no hace nada, o saca del sitio. Nada de eso lo ve `tsc`, ni la
  suite, ni el build. **La UAT en celular real es el único criterio que vale** — es literalmente cómo
  se encontraron NAV-08 y los siete bugs de la UAT de v0.30.

Verificación: **UAT en celular real, exhaustiva y con los recorridos escritos de antemano** (los dos
de MOB-04, el cruce del criterio 2, los cuatro overlays del criterio 4, el de cambios sin guardar en
Agenda y el de MOB-05 repetido tres veces) · vitest sobre las decisiones puras nuevas + las cinco
suites de historial existentes · `npm run lint` · `npx tsc --noEmit` · `npm run build` · y, para el
criterio 2, **medir la pila real del navegador por CDP** si el recorrido a mano deja dudas: es el método
con el que v0.30 diagnosticó NAV-08 y el que la memoria `medir-antes-de-aceptar-un-fix-propuesto`
reclama (cinco fixes confiados que se cayeron al medirlos).

**UI-SPEC**: **no**, y a condición de que la Phase 2 haya hecho su trabajo. Esta fase no dibuja nada
nuevo: Más y la barra ya existen con su diseño aprobado, y la única superficie visible que agrega es el
aviso de MOB-05, **cuyo patrón y copy se cierran en el contrato de diseño de la Phase 2** a propósito,
para que haya un solo pase de diseño. **Lo que reabre el gate:** si la decisión de MOB-05 termina
pidiendo un **diálogo modal** nuevo (con botones, foco atrapado y copy de dos opciones), o si la
política de dos niveles exige un affordance visible que hoy no existe (un "volver a Más" en el header
de la sección, un breadcrumb), eso **sí** es diseño y hay que pasar por `/gsd-ui-phase` antes de codear.

**Security/Integrity relevance**: Superficie autenticada, **sin** cambios de esquema, policies ni
queries, y sin datos de otro negocio en juego. El único invariante en riesgo es de **integridad de
sesión del usuario**, no de tenant: un `back()` sobre una entrada ajena **expulsa al dueño del sitio**
(la cicatriz 2, ya sufrida tres veces en este repo) y, en una pantalla con cambios sin guardar, eso es
**pérdida de trabajo silenciosa**. Es el riesgo que la regla 0 y la re-verificación de la marca
mitigan, y es lo que un `/gsd-secure-phase` tendría que mirar acá. Riesgo bajo en términos de datos,
medio en términos de pérdida de trabajo del dueño.

**Plans**: TBD

### Phase 4: Los tabs profundos sobre la política ya fijada

**Goal**: Que los tabs que hoy se comen el atrás —`/negocio` (Datos·Cobros·Integraciones·
Notificaciones), `/settings` (Apariencia·Seguridad·Suscripción) y `/finances` (Turnos·Ventas·Egresos)—
vivan en la URL consumiendo el helper **con la política ya definitiva**, sin alterar las otras tres
rutas que comparten la misma pantalla de 4183 líneas y sin que el retorno del OAuth de MercadoPago
aterrice en un tab que el dueño no pidió.

**Depends on**: Phase 3 (es el motivo por el que esta fase se difirió de v0.30: escribir los tabs
contra una política que estaba por cambiar era trabajo para rehacer)

**Requirements**: MOB-08, MOB-09

**Success Criteria** (qué tiene que ser VERDAD):

  1. **Los tabs son destinos, y se componen con los dos niveles.** En `/negocio` y en `/settings`,
     cambiar de tab cambia la URL, el atrás vuelve **al tab anterior** (no a la sección anterior, no a
     Más y no a Inicio), y pegar o recargar la URL abre ese tab. Agotados los tabs, el siguiente atrás
     respeta la política de la Phase 3 según cómo se entró a la sección: por Más vuelve a **Más**, por
     la barra vuelve a **Inicio**. Un valor de tab ausente o inválido cae al default de hoy sin
     pantalla vacía (`business` en Negocio, `appearance` en Configuración — `settings-client.tsx`)
     (MOB-08).
  2. **T-1 respetado — las otras tres rutas no se mueven.** `/servicios`, `/equipo` y `/consultorios`,
     que renderizan el **mismo** `settings-client.tsx` vía la prop `view`, se comportan exactamente
     igual que hoy: no ganan tab en la URL, no cambian de default, no aparece ninguna `TabsList` nueva
     y su `onTabChange` sigue en `undefined`. Se verifica **ruta por ruta a mano**, no por inspección
     del diff (MOB-08).
  3. **T-2 reconciliado — el OAuth no pierde su tab.** Volver del OAuth de MercadoPago
     (`/negocio?mp=connected`) sigue mostrando el toast y aterriza en **Integraciones**: la limpieza de
     la query ya no pisa el tab (hoy un `window.history.replaceState(null, '', '/negocio')` crudo corre
     **justo después** de forzar el tab y lo borraría). Mismo criterio para `?google=connected|error`
     —el segundo `replaceState` crudo del panel, en `agenda-client.tsx`, que el inventario T-7 de v0.30
     dejó anotado— y para las ramas de error. El dueño nunca vuelve del OAuth a Datos (MOB-08).
  4. **Finanzas, con su botón de alta coherente.** En `/finances` los tabs Turnos·Ventas·Egresos viven
     en la URL con el mismo criterio, y el botón de alta sigue correspondiendo al tab visible —"Nueva
     venta" sólo en Ventas, "Nuevo egreso" sólo en Egresos— incluso al entrar directo por URL y al
     volver con el atrás (MOB-09).
  5. **Cero dialecto nuevo y cero regresión.** Los tres grupos de tabs consumen el helper: un
     `grep -rE 'pushState|replaceState|history\.back'` sobre `settings-client.tsx`,
     `finances-client.tsx` y `agenda-client.tsx` da **cero** hits fuera del helper (los dos
     `replaceState` crudos del OAuth incluidos: pasan a expresarse como una decisión `replace`); el
     atrás sigue cerrando los overlays de esas pantallas; el aviso de cambios sin guardar de Agenda
     sigue intacto; y `npm run build` no falla por un `useSearchParams` sin `<Suspense>` (el panel ya
     tiene el patrón del repo para copiar: `plan-banner.tsx` envuelto en `<Suspense>` desde el layout
     del dashboard — T-5 de v0.30) (MOB-08, MOB-09).

**Fuera de alcance de esta fase** (explícito):

- El `activeLoc` de Agenda. Sigue siendo un **filtro**, no una subsección, y Agenda es una de las dos
  pantallas con `useUnsavedChanges` (la otra es `/web` — corregido en el diagnóstico del 2026-10-05):
  empujar historia en cada cambio de sucursal volvería insoportable editar horarios. Si algún día
  entra, entra con **`replace`**, que el helper ya puede expresar (causa `'filter'`).
- Reorganizar, renombrar o mover contenido entre tabs: esto es routing, no arquitectura de información.
- Extender `useUnsavedChanges` a `/settings`, `/negocio` o `/servicios`.
- El toggle `mobileView` edit/preview de `/web`.
- **Migraciones: cero.** Próxima libre: **080**.

**Riesgo y verificación**:

Riesgo **medio**, y todo el riesgo es **radio de impacto**, no mecanismo —el mecanismo ya quedó probado
en la Phase 1 de v0.30 y la política ya quedó fijada en la Phase 3:

- **T-1 es el riesgo principal:** un solo archivo de 4183 líneas sirve **5 rutas**. Un cambio en el par
  `tabValue`/`onTabChange` toca las cinco. El criterio 2 existe para que la no-regresión de
  `/servicios`, `/equipo` y `/consultorios` se verifique **a mano, ruta por ruta**.
- **T-2 es el riesgo silencioso:** el efecto del OAuth fuerza el tab y **después** reescribe la URL.
  Con el tab en la URL, ese orden lo borra. Es una regresión que sólo se ve **volviendo de verdad del
  OAuth** (staging o prod — en local MP no vuelve), no navegando a mano.
- **Composición con los dos niveles:** es lo único nuevo respecto del plan de v0.30. Un tab es una
  subsección **dentro** de un nivel, así que el atrás tiene tres profundidades (tab → sección → Más →
  Inicio). El criterio 1 lo exige explícitamente para que no se descubra en producción.

Verificación: recorrido manual por **las 5 rutas** de `settings-client.tsx` + las 3 tabs de Finanzas,
con atrás y con URL pegada, **entrando a la sección por Más y por la barra** (las dos profundidades) ·
retorno del OAuth con `?mp=connected` / `?mp=error` / `?google=connected` (el de MP, donde MP vuelve de
verdad) · vitest (los casos nuevos de tab se suman a las suites del helper) · `npm run lint` ·
`npx tsc --noEmit` · `npm run build` · **UAT en celular real**.

**UI-SPEC**: **no**, y está medido en v0.30, no asumido: los tres grupos de tabs ya existen con su
markup, su `TabsList` y sus defaults. Sólo cambia **de dónde sale el valor** del tab: de `useState` a
la URL. Cero pixel nuevo, cero componente nuevo. El gate se reabre sólo si un plan propone reorganizar
o renombrar tabs — que además está fuera de alcance.

**Security/Integrity relevance**: Superficie autenticada, sin cambios de esquema ni policies. Un valor
de tab que viene de la URL es un **string del cliente**: hay que validarlo contra la lista cerrada de
tabs y caer al default, **nunca** usarlo para elegir qué se lee (el criterio 1 lo exige). `/negocio` y
`/settings` muestran secretos del dueño (`getBusinessSecrets`, service role) resueltos por `owner_id`
**antes** de cualquier tab: el tab decide qué se **muestra**, nunca qué se **lee**, así que el
aislamiento por tenant no cambia. Riesgo bajo.

**Plans**: TBD

## Cobertura de requisitos

| Requisito | Fase | Por qué ahí |
|---|---|---|
| MOB-01 | Phase 2 | Es la superficie entera del milestone y no depende de nada: la barra puede existir y navegar con la política de hoy. |
| MOB-02 | Phase 2 | Zona segura y áreas táctiles son propiedades de la barra; nacen con ella o no nacen (T-2 es capacidad nueva en el repo). |
| MOB-03 | Phase 2 | Más es la otra mitad de la barra: el reparto de los 12 destinos (M-4) y las tres filas del footer (M-3) se deciden en el mismo acto. |
| MOB-04 | **Phase 3** | **La redefinición de la política.** No puede ir antes (necesita que Más sea un lugar) ni después (los tabs de la Phase 4 se escriben contra ella). Sola en su fase porque es el único cambio del milestone que puede romper algo ya verificado en celular real. |
| MOB-05 | Phase 3 | Es historial, no diseño: se implementa donde vive el mecanismo sentinel (`lib/dirty-history.ts`). ⚠ Su **decisión de patrón** se toma antes, en el contrato de diseño de la Phase 2 (un solo pase de diseño). |
| MOB-06 | Phase 3 | Es el **contrato de la política nueva**, y el contrato se fija cuando la política cambia. La Phase 2 no lo necesita como requisito porque no toca el mecanismo (su criterio 6 lo prueba con un `git diff` vacío sobre los tres módulos); la Phase 4 lo hereda por construcción (su criterio 5 exige que toda escritura pase por el helper). |
| MOB-07 | Phase 2 | El corte mobile/desktop se hace una vez, cuando la barra entra, y con el breakpoint medido (`lg`, M-5). La Phase 3 lo preserva **por construcción** (su criterio 6: la política se expresa sobre rutas, y el desktop nunca navega desde Más). |
| MOB-08 | Phase 4 | Los dos grupos de tabs de `settings-client.tsx`, con T-1 y T-2 aislados en su propia fase, ya con la política fijada. |
| MOB-09 | Phase 4 | Mismo mecanismo que MOB-08, otra pantalla; separarlo sería una fase de un requisito. |

**Coverage:** 9/9 requisitos mapeados · sin asignar: 0 · duplicados: 0

## Restricciones transversales (valen para las tres fases)

- **D-01 — la barra es FIJA e igual para todos los rubros** (`Inicio · Turnos · Agenda · Clientes ·
  Más`). Validado contra los cuatro verticales (M-1). ⚠ Fija en **destinos**, no en **palabras**: los
  labels salen de la terminología (M-2).
- **D-02 — sólo mobile.** Desktop no cambia. El breakpoint es **`lg` (1024px)**, que es donde el
  sidebar aparece de verdad (M-5), no 768.
- **Cero migraciones.** Nada de este milestone toca datos. Próxima libre: **080** (⚠ M-10: los
  requisitos dicen 042, es un error de dato). Si una fase parece necesitar una, está mal cortada.
- **Los tres dueños del historial se respetan.** `lib/panel-history.ts` (`frjView`),
  `lib/overlay-history.ts` (`frjOverlay`) y `lib/dirty-history.ts` (`frjDirty`) conviven porque cada
  uno re-verifica **su** marca justo antes de cada `back()`. Una marca nueva es **nueva**: reusar
  cualquiera de las tres es el peor error posible (doble consumo ⇒ el dueño fuera del sitio).
- **El atrás no se cancela: se absorbe** (H-5). Y toda marca escrita en `history.state` sobrevive al
  atrás pero **la borra la siguiente navegación blanda** (H-4) ⇒ re-verificar en el punto de uso,
  nunca confiar.
- **Next 16.2.7, no 14.** `proxy.ts`, no `middleware.ts`. Toda afirmación de routing se cita contra
  `node_modules/next/dist/docs/` o contra los tipos instalados (ver la tabla de hechos verificados).
- **Sin paquetes nuevos y sin jsdom.** Los tests son de decisiones **puras** en `environment: 'node'`,
  con el molde de `lib/panel-history.ts`, `lib/overlay-history.ts` y `lib/dirty-history.ts`.
- **La UAT en celular real es el único criterio que vale.** El dueño encontró **7 bugs** así con el
  pipeline en verde, y NAV-08 fue una regresión que sólo apareció en un teléfono. `tsc`, la suite y el
  build son necesarios y **no son suficientes** para ninguna de las tres fases.
- **Windows + PowerShell** para los comandos locales. Rama `main`, sin worktrees.

## Progress

**Execution Order:**
Las fases se ejecutan en orden numérico: 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 2. La barra inferior y Más | 3/4 | In Progress|  |
| 3. La política de atrás, de un nivel a dos | 0/? | Not started | - |
| 4. Los tabs profundos sobre la política ya fijada | 0/? | Not started | - |
