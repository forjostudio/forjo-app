# Phase 23: El panel que organiza el catálogo — Research

**Researched:** 2026-09-15
**Domain:** Panel del dueño (Next 16 App Router + React 19 client components) sobre Supabase con RLS por tenant — CRUD de categorías, reordenamiento con `draggable` nativo + ▲/▼, y dos campos nuevos en el form de servicio.
**Confidence:** HIGH (todo lo que decide el plan está medido contra el repo y contra el Postgres local; lo poco que no, está en el Assumptions Log)

> **Qué es este documento.** NO re-abre ninguna decisión: `23-CONTEXT.md` (D-01…D-12) y `23-UI-SPEC.md`
> están LOCKED y aprobados. Lo que hace es **medir el código real contra ellos** y dejar por escrito lo
> que el planner tendría que adivinar: números de línea vigentes, firmas reales, códigos de error
> medidos, y **las tres cosas que el contrato da por ciertas y el código dice distinto** (ver
> `## Desajustes medidos`).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Dónde vive el organizador

- **D-01:** El organizador de categorías es una **Card colapsable** dentro de `/servicios`, en un
  **componente propio** bajo `components/dashboard/` — molde exacto de
  `components/dashboard/canchas-manager.tsx`, que ya es un bloque extraído de `settings-client.tsx`
  y renderizado dentro de esta misma vista. NO se agrega el bloque inline al archivo de 3636 líneas.
  Se descartó el **diálogo**: drag-and-drop dentro de un overlay con scroll interno es una capa más
  sobre el arrastre, y el repo ya tiene el precedente de controles que se rompen dentro de overlays
  en mobile (el bug del Select dentro del Drawer). — **Reversibility:** reversible — es un componente
  nuevo, sin contrato con nada.

- **D-02:** La Card arranca **colapsada si el negocio tiene cero categorías y abierta si tiene al
  menos una**. Con cero categorías —el estado de **todos** los negocios de producción el día del
  deploy— la pantalla no cambia de alto ni gana ruido; al que ya las creó le importan, así que las
  ve. El header lleva el conteo. Se descartó recordar la elección en `localStorage`: es estado por
  navegador (en el celular vuelve a cerrada) por una sola Card. — **Reversibility:** reversible.

- **D-03:** Los **dos selectores de modo de orden van cada uno donde actúa**: el de **categorías**
  dentro de la Card de categorías (que es donde se arrastra), el de **servicios** arriba de la lista
  de servicios (que es lo que ordena). Son columnas de `businesses` y valen para todo el negocio,
  así que el copy tiene que decirlo — pero ninguno queda escondido detrás del colapso, y el de
  servicios sirve **incluso con cero categorías**. Se descartó mandarlos a la config del negocio:
  rompe el ciclo de feedback (se configura en una pantalla y se ve en otra). — **Reversibility:** reversible.

- **D-04:** Borrar una categoría abre **confirmación con el conteo**: dice cuántos servicios quedan
  sin categoría y que **siguen activos y reservables**. La base ya lo garantiza (`ON DELETE SET NULL`
  sobre `category_id`, migr. 078), pero el miedo del dueño al apretar Eliminar es exactamente "¿se me
  borran los servicios?". Molde de los ConfirmDialog que la pantalla ya usa (borrar servicio cuenta
  los turnos futuros). Se descartó el borrado directo con "Deshacer": deshacer tendría que recrear la
  categoría **y** reasignar los servicios — un camino de escritura nuevo que la fase no presupuesta.
  ⚠ Al implementarlo, respetar el gotcha del repo: las acciones del ConfirmDialog **auditan y
  retornan**, nunca `redirect()`. — **Reversibility:** reversible.

#### Cómo se asigna la categoría a un servicio

- **D-05:** Hay **dos caminos** para asignar, deliberadamente: (a) un **Select "Categoría"** con
  opción "Sin categoría" en el alta y en el diálogo de edición del servicio —el camino **accesible y
  universal**, que funciona en mobile y con teclado—, y (b) **arrastrar** dentro del organizador —el
  **atajo de desktop** para reorganizar en lote. No son redundantes: son el accesible y el rápido.
  ⚠ "Sin categoría" es una **opción real y siempre disponible** del Select, nunca un estado al que
  sólo se llega por omisión: es lo que hace verdadero a CAT-02 ("asignar no es obligatorio en ningún
  punto del flujo"). — **Reversibility:** reversible.

- **D-06:** El arrastre vive **contenido en la Card**, como **chips compactos** (sólo el nombre) bajo
  cada categoría, **más un grupo "Sin categoría" al final** con los servicios huérfanos. La lista de
  servicios de abajo **NO se toca**: sigue con precio, duración, cupo, cobertura y acciones tal como
  está hoy. *(Decisión delegada a Claude — el usuario eligió "vos decidís".)* Razones: el grupo de
  sueltos es lo que **hace posible asignar en lote** (sin él no hay de dónde arrastrar) y hace
  visible el estado que CAT-02 declara válido y permanente; y mantener el arrastre fuera de la lista
  existente deja intacta la región más cargada y más peleada de `settings-client.tsx` (la tarjeta de
  servicio, con su invariante de 32px de G-04 y su estructura de grilla documentada línea por línea).
  Se descartó **agrupar la lista de abajo**: obligaba a reescribir esa región entera.
  **Costo aceptado:** los nombres de los servicios aparecen en dos lugares de la pantalla (chips
  arriba, tarjetas abajo). — **Reversibility:** reversible.

- **D-07:** Cada chip, además de arrastrable, tiene un menú **"Mover a…"** que lista las categorías +
  "Sin categoría". Arrastrar no funciona en mobile ni con teclado —es el mismo motivo por el que
  CAT-03 exige ▲/▼ para las categorías—, así que asignar **en lote** tiene que funcionar igual en
  mobile que en desktop, sin salir de la Card.
  ⚠ **RESTRICCIÓN DURA:** quedan **tres** superficies que escriben `services.category_id` (Select del
  form, arrastre, menú "Mover a…"). Las tres pasan por **UNA sola función de escritura**, nunca por
  tres implementaciones. Tres caminos escribiendo la misma columna con lógica propia es el molde de
  bug que esta fase no puede permitirse. — **Reversibility:** costly — tres call sites ya apuntando
  a lógica duplicada son caros de unificar después.

#### Cómo se persiste el orden

- **D-08:** **Los dos ejes se reordenan a mano.** Categorías: drag + ▲/▼ (CAT-03). Servicios: el
  **mismo mecanismo** dentro de su grupo. Motivo: `service_sort_mode` viene con **DEFAULT 'custom'**
  en la migr. 078 — sin UI de arrastre, el modo por default del negocio sería el único que no se
  puede arreglar, y el selector diría "personalizado" sin ofrecer personalizar. — **Reversibility:** reversible.

- **D-09:** **Escritura mixta, cero migraciones.** *(Decisión delegada a Claude — el usuario eligió
  "vos decidís", con los tres caminos y sus costos sobre la mesa.)*
  - **Categorías:** un solo `.upsert(filasRenumeradas, { onConflict: 'id' })` — una sentencia SQL, o
    sea **atómica por definición**. Precedente en el repo: `app/(dashboard)/agenda/agenda-client.tsx:801`
    (`schedule_exceptions`). La RLS sigue aplicando: las policies `insert` y `update` de
    `service_categories` (migr. 078) chequean `business_id` por `owner_id`, así que un `business_id`
    forjado se rechaza.
  - **Servicios:** N updates de **SÓLO `sort_order`** (`.update({ sort_order }).eq('id', …).eq('business_id', …)`).
    ⚠ **Acá NO se usa `upsert`**: `services` tiene `name`, `duration_minutes` y `price` **NOT NULL sin
    default** (`supabase/schema.sql:1411-1425`), así que un upsert obligaría a reenviar la fila entera
    desde el estado del cliente — un cliente con dato viejo **pisaría un precio** para tocar el orden.
    Ningún precio puede viajar en una operación de reordenamiento.

  **Por qué NO el RPC transaccional (migr. 080)**, que es lo que sugiere el roadmap citando
  `save_agenda_blocks` (migr. 074): acá la atomicidad protege una propiedad **cosmética y
  auto-reparable** (el orden de display), no un invariante de integridad — al revés que en
  `save_agenda_blocks`, donde una escritura a medias cambia la **disponibilidad real**. Mantener la
  fase en cero migraciones la deja como un **deploy de app puro**: sin paso manual en producción, sin
  coordinación con el deploy y sin la trampa del `NOTIFY pgrst, 'reload schema'` (el fail-safe que
  documentaron la 059 y la 074). El requisito duro que marca el roadmap —"un solo camino que no pueda
  renumerar filas de otro negocio"— se cumple igual con **un único mutador compartido por eje**.
  **El RPC queda documentado como el upgrade** si alguna vez aparece un reporte real de orden a medias.
  — **Reversibility:** reversible — migrar después a un RPC no cambia ningún dato ni ningún contrato
  público; es reemplazar el cuerpo de dos funciones del cliente.

- **D-10:** **Dos condiciones solidarias de D-09, no opcionales:**
  1. **Un solo mutador por eje**, con `.eq('business_id', business.id)` **siempre puesto** (defensa en
     profundidad sobre la RLS, como toda query del panel). Renumera **la lista completa de hermanas**
     — nunca swaps sueltos, que dejan huecos y empates (CAT-03).
  2. **Un fallo parcial NO puede quedar silencioso.** Si alguno de los N updates falla: se **re-lee el
     orden real de la base**, se pinta eso (no el estado optimista) y se avisa al dueño que el orden
     **no se guardó**. Lo que el dueño ve tiene que ser lo que está guardado — el molde es el
     `[agenda/save-hours]` de `agenda-client.tsx:647-670`, que ante el rechazo **no toca el estado
     local** y muestra copy propia. — **Reversibility:** reversible.

- **D-11:** **Cambiar de modo NO persiste ningún orden.** El modo sólo elige un comparador dentro de
  `groupCatalog()`, que es **puro y no escribe** — así es como la Phase 22 garantizó CAT-06 por
  construcción. Si el panel escribiera `sort_order` al cambiar de modo, rompería CAT-06, que ya está
  entregado y verificado. — **Reversibility:** one-way — romper CAT-06 destruye el arreglo manual del
  dueño de forma irrecuperable: el orden viejo no está en ningún lado para restaurarlo.

- **D-12:** Con un modo **distinto de 'custom'**, los controles de reordenar (drag handles y ▲/▼)
  **no se renderizan** — no se deshabilitan, no se atenúan: no están (CAT-05). Un arrastre que no
  hace nada se lee como roto. Aplica **por eje, independientemente**: `category_sort_mode='alpha'`
  apaga los controles de categorías y deja vivos los de servicios si `service_sort_mode='custom'`.
  — **Reversibility:** reversible.

### Claude's Discretion

- **CAT-11 — la descripción corta.** El usuario delegó las dos decisiones al planner. Guía
  recomendada (no es un lock; el planner puede apartarse con motivo escrito):
  - **Dónde:** en el **alta y en el diálogo de edición**, espejados. Es el patrón declarado del
    archivo — el diálogo de edición "reusa el form de alta" (comentario en `settings-client.tsx`
    sobre el `Dialog` de editar servicio), y romper el espejo deja un campo que sólo existe en una de
    las dos operaciones.
  - **El tope de 120:** **duro** (`maxLength={120}`) con **contador visible desde el arranque**
    ("0/120"), no sólo al acercarse al límite. El sentido del 120 es que **lo que el dueño escribe sea
    exactamente lo que la tarjeta deja ver** a 375px con el `line-clamp-2` que ya está en producción
    (`booking-client.tsx:610`). Un tope blando devuelve justo el problema que el número viene a
    resolver: recortarle sin avisar.
  - **Recordar:** `services.description` **ya existe**, `public_services` **ya la expone** y la tarjeta
    **ya la renderiza**. Esta fase agrega **sólo el campo del panel**. No tocar la superficie pública.

- **D-06 y D-09** también salieron de "vos decidís" — están escritas arriba como decisiones cerradas,
  con el razonamiento completo, porque el planner necesita el *porqué* para poder apartarse con causa.

> **Nota del researcher:** las dos delegaciones de CAT-11 **ya las resolvió el `23-UI-SPEC.md`**
> (Bloque C: campos espejados en alta y edición, tope duro `maxLength={120}`, contador desde `0/120`),
> y lo mismo con la pregunta abierta del vertical canchas (§"El vertical canchas queda AFUERA").
> El planner las hereda resueltas; este research las **verifica contra el código**, no las reabre.

### Deferred Ideas (OUT OF SCOPE)

- **Subcategorías (dos niveles).** Ya declarado fuera de alcance en REQUIREMENTS: `forjo-tiendas` las
  tiene porque un negocio llegó a 10 categorías y 39 productos; una peluquería con 12 servicios no.
  Se suman después sin re-migrar.
- **Modo de orden por categoría** (en vez de por negocio). Fuera de alcance del milestone (D-05 del
  explore). Si se pide, se agrega sin re-migrar.
- **RPC transaccional de reordenamiento (migr. 080).** No descartado: **diferido con condición de
  disparo** — se implementa si aparece un reporte real de orden guardado a medias. Ver D-09.
- **Recordar el estado abierto/cerrado de la Card por usuario.** Descartado en D-02 porque
  `localStorage` es por navegador; si alguna vez hay preferencias de UI por cuenta, entra ahí.
- **Arrastre táctil real para mover servicios entre categorías en mobile.** El menú "Mover a…" (D-07)
  cubre el caso de uso; un arrastre táctil real necesitaría una librería, que este repo evita a propósito.
- **Toda la superficie pública** (`app/[slug]/booking-client.tsx`, `app/[slug]/page.tsx`): es la Phase 24.
- **Cualquier migración nueva** (la 080): la fase está locked en cero migraciones por D-09.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descripción | Qué de este research lo habilita |
|----|-------------|----------------------------------|
| **CAT-01** | Crear / renombrar / borrar categorías; el duplicado case-insensitive lo rechaza **la base**, con copy propia en pantalla | §"El modelo y sus señales de rechazo": `23505` / `23514` **medidos** contra el PG local y ya aseverados a nivel `supabase-js` por un test verde (`test/service-categories-model.test.ts:221,234`). Molde de traducción: `classifySaveHoursError` (`agenda-client.tsx:209-232`) |
| **CAT-02** | Una categoría o ninguna, y asignar nunca es obligatorio | §"Los tres call sites de `category_id`": el `Select` con sentinel "Sin categoría" entra en `newService` (`:1147`) y `editSvcForm` (`:1433`); la columna es nullable y la FK es compuesta (medido en `\d public.services`) |
| **CAT-03** | Reordenar arrastrando **y** con ▲/▼; persistencia renumerando la lista completa | §"El patrón de reordenar": receta portable de `pipeline-client.tsx:462-470` (drag) + `section-list.tsx:132-155` (flechas) + `forjo-tiendas/…/Organizador.tsx:125-134` (renumerado completo). ⚠ `section-list` hace **swap**, que CAT-03 prohíbe: se porta la forma del botón, no su mutador |
| **CAT-04** | Los dos modos de orden, para todo el negocio | §"Escritura de los dos modos": `businesses.category_sort_mode` / `service_sort_mode` con CHECK (migr. 078:274-304); el panel ya escribe `businesses` con este mismo molde (`settings-client.tsx:988,997,1005`) |
| **CAT-05** | Con modo ≠ `custom`, los controles de reorden **no se muestran** | §"Gates" del UI-SPEC + `groupCatalog()` no escribe nunca (`lib/service-categories.ts:252-332`) |
| **CAT-11** | Descripción corta con tope 120 y contador | §"CAT-11 medido": `services.description` = `text` **nullable y sin límite en la base**; hoy **nadie la escribe desde la app**; la renderiza `booking-client.tsx:611` (`line-clamp-2`) **y también** `components/landing/services.tsx:74-77` |

</phase_requirements>

---

## Summary

La fase no tiene incógnita técnica: **no se instala nada, no se migra nada y no se inventa ningún
patrón**. Todo lo que hace falta ya existe en el repo, medido y en producción — el `draggable` nativo
(`pipeline-client.tsx`), los botones ▲/▼ con `aria-label` y la región `aria-live` (`section-list.tsx`),
el upsert multi-fila (`agenda-client.tsx:801`), el rechazo honesto por `error.code`
(`agenda-client.tsx:640-675`), el molde de extraer un bloque de `settings-client.tsx` a componente
propio (`canchas-manager.tsx`) y el módulo puro que agrupa y ordena (`lib/service-categories.ts`).
El trabajo del plan es **ensamblar**, no descubrir.

Lo que sí requiere cuidado es dónde apoyarse: `settings-client.tsx` tiene **3636 líneas** y los
números de línea que cita el CONTEXT **se movieron** (la lista de servicios no arranca en `:2494` sino
en `:2495`; la tarjeta no está en `:2513` sino en `:2535`; el `DialogContent` de edición no está en
`:2795` sino en `:2789`). Un ejecutor que edite "la región `:2513`" toca el comentario de estructura,
no el markup.

Y hay **un choque real entre una decisión locked y el esquema**, medido contra el Postgres local: el
`.upsert(filas, { onConflict: 'id' })` de D-09 para categorías **falla con `23502` si el payload no
incluye `name`**, porque `service_categories.name` es `NOT NULL` sin default y Postgres valida las
constraints de la tupla propuesta **antes** de resolver el conflicto. O sea que el eje categorías cae
en la misma forma que D-09 prohibió para servicios: el nombre viaja en cada reordenamiento. No es un
bloqueo —es reversible y barato— pero el plan tiene que **decidirlo explícitamente**, no descubrirlo
en ejecución (ver `## Desajustes medidos` D-1).

**Primary recommendation:** ensamblar sobre los cuatro precedentes del repo, tomar los números de
línea de este documento (no los del CONTEXT), y cerrar D-1 antes de escribir el primer plan —o bien
mandando `name` en el upsert con el trade-off escrito, o bien usando para categorías el mismo camino
de N `.update({ sort_order })` que D-09 ya eligió para servicios.

---

## Desajustes medidos (contrato vs. código real)

> Lo más valioso de este research. Cada fila está medida esta sesión; ninguna reabre una decisión.

| # | Dice el contrato | Dice el código | Qué tiene que hacer el plan |
|---|---|---|---|
| **D-1** | D-09: categorías con `.upsert(filasRenumeradas, { onConflict: 'id' })`, y el motivo de NO usar upsert en `services` es que sus columnas NOT-NULL obligarían a reenviar la fila entera | `service_categories.name` es **`NOT NULL` sin default** igual que `services.name` **[MEDIDO: psql local, `\d public.service_categories`]**. Un upsert sin `name` aborta con **`23502`** antes de mirar el conflicto **[MEDIDO: probe, ver §"Los dos caminos de escritura"]** | Decidir y escribirlo: (a) mandar `name` en el upsert y aceptar que un cliente con dato viejo pueda pisar un renombrado, o (b) usar para categorías el mismo N-`.update({ sort_order })` que D-09 eligió para servicios. D-09 declara esta reversibilidad como "reemplazar el cuerpo de dos funciones del cliente" |
| **D-2** | D-09 / UI-SPEC: "precedente `agenda-client.tsx:801` — `.upsert(rows, { onConflict: 'id' })`" | La línea 801 existe y es un upsert multi-fila, pero el conflict target es **`'business_id,date,location_id'`** (clave natural), no `'id'`, y el payload **manda todas las columnas** **[VERIFICADO: app/(dashboard)/agenda/agenda-client.tsx:800-801]** | Citar el precedente por lo que prueba (una sentencia, multi-fila, `.select()` de vuelta), no por un `onConflict` que no dice |
| **D-3** | UI-SPEC Riesgo #3: "`/settings` y `/servicios` renderizan las dos `TabsContent value='services'`; si `initialServiceCategories` baja sólo desde `/servicios`, en `/settings` la Card diría 'Sin categorías'" | **No puede pasar hoy.** `TabsContent` es `TabsPrimitive.Panel` de `@base-ui/react` con **`keepMounted = false`** por default **[VERIFICADO: node_modules/@base-ui/react/tabs/panel/TabsPanel.js:37,99,110]**, y el `TabsList` de `/settings` sólo tiene `appearance`/`seguridad`/`suscripcion` **[VERIFICADO: settings-client.tsx:2162-2168]**: el panel `services` **nunca se monta** salvo con `view="servicios"` **[VERIFICADO: settings-client.tsx:925,934 + los 5 call sites]** | La prop nueva va **sólo** en `app/(dashboard)/servicios/page.tsx`, con default `[]` en `Props`. Dejar escrito el porqué: si mañana alguien agrega un trigger "Servicios" al TabsList de config, o un `keepMounted`, reaparece el falso vacío |
| **D-4** | CONTEXT: "lista de servicios ≈`:2494-2710`, form de alta ≈`:2713-2770`, diálogo de edición ≈`:2772+`" | Real: rama `!isCanchas` abre en **`:2493`**, `<>` en `:2494`, Card de servicios **`:2495-2767`**, map de tarjetas **`:2514-2710`**, tarjeta **`:2535`**, alta **`:2713-2766`**, `Dialog` de edición **`:2771-2846`**, `DialogContent` **`:2789`** **[VERIFICADO: settings-client.tsx:2476-2849]** | Usar la tabla de `## El archivo real, medido`. Los `≈` del CONTEXT alcanzan para orientarse, no para anclar un `Edit` |
| **D-5** | UI-SPEC: "pill de conteo con el molde ya shipeado (`settings-client.tsx:2874`)" y "los chips de servicio por profesional (`:2783`) usan `text-primary`" | `:2874` es el avatar de un profesional; los chips con `text-primary` están en **`:2960-2971`** **[VERIFICADO: settings-client.tsx]** | Citas cosméticas; corregirlas en el plan para que el ejecutor no busque un molde donde no está |
| **D-6** | UI-SPEC: molde de reorden `section-list.tsx:130-158`, `aria-live` en `:214`, fila `rounded-md` en `:108` | Real: botones **`:132-155`**, `aria-disabled` en `:137`/`:149`, región `aria-live="polite" sr-only` en **`:226-228`**, `<li className="rounded-md border bg-secondary">` en **`:110`** **[VERIFICADO: app/(dashboard)/web/_sections/section-list.tsx]** | Idem: corregir las referencias |
| **D-7** | CONTEXT: "el molde del rechazo honesto, `agenda-client.tsx:640-675`" | El bloque real de rechazo es **`:651-665`** (dentro del `try` que arranca en `:639`); `classifySaveHoursError` vive en **`:209-232`** **[VERIFICADO]** | Apuntar a las dos piezas: el clasificador (`:209`) y el call site que no toca el estado local (`:651-665`) |
| **D-8** | CAT-11 / UI-SPEC: la ayuda dice "Aparece debajo del nombre en **tu página de reservas**" | `service.description` también lo renderiza la **web de marca** (`components/landing/services.tsx:74-77`, con su propio `line-clamp-2`) **[VERIFICADO]** | Decisión de copy del planner: la frase es incompleta para los negocios con web. No es un bug — es un campo que aparece en dos superficies públicas |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Leer las categorías del negocio | Frontend Server (RSC) | — | `app/(dashboard)/servicios/page.tsx` ya lee 6 tablas por tenant con el cliente server (anon + cookies + RLS) y baja props; una lectura más entra en el `Promise.all` existente |
| Leer los dos modos de orden | Frontend Server (RSC) | — | Son columnas de `businesses`, que el RSC ya trae con `select('*')` **[VERIFICADO: servicios/page.tsx:11]** |
| CRUD de categorías (crear/renombrar/borrar) | Browser / Client | Database (RLS + índice único + CHECK) | El panel escribe con el cliente browser, no con server actions — patrón declarado del repo; la garantía de unicidad y de nombre no-blanco vive en la base (migr. 079) |
| Asignar `services.category_id` | Browser / Client | Database (FK compuesta `services_category_same_tenant`) | La pertenencia al tenant es **declarativa** en la base; el cliente agrega `.eq('business_id')` como defensa en profundidad |
| Persistir el orden (dos ejes) | Browser / Client | Database (RLS) | D-09: un mutador por eje, sin RPC |
| Agrupar y ordenar para mostrar | Módulo puro (`lib/`) | — | `groupCatalog()` es la fuente única; **prohibido** reimplementar la regla en el panel |
| Persistir los modos de orden | Browser / Client | Database (CHECK de enum) | `.update({ category_sort_mode }).eq('id', business.id)`, mismo molde que `selectTheme`/`selectPalette` |
| Mostrar la descripción al cliente | **Fuera de esta fase** | — | Ya está en producción: `booking-client.tsx:611` y `components/landing/services.tsx:74-77` |

---

## Project Constraints (from CLAUDE.md / AGENTS.md)

| Directiva | Fuente | Efecto en esta fase |
|---|---|---|
| **No es el Next.js del training data** — leer `node_modules/next/dist/docs/` antes de asumir comportamiento | `AGENTS.md` | Verificado: **no hay una sola mención de `draggable` en `node_modules/next/dist/docs/`** **[VERIFICADO: grep -rl "draggable" → sin resultados]**. El arrastre es API de React DOM / HTML5, no de Next: Next 16 no lo toca. El único requisito de Next acá es que el organizador sea `'use client'` |
| **El middleware es `proxy.ts`** | `.claude/CLAUDE.md` | Esta fase no lo toca |
| **Aislamiento por tenant no negociable**: `.eq('business_id', …)` en toda query, además de la RLS | `.claude/CLAUDE.md` + skill `supabase-multitenant-rls` | Aplica a las **5** escrituras nuevas (crear/renombrar/borrar categoría, reordenar, asignar) y a la lectura nueva del RSC |
| **Migraciones SQL numeradas, aplicadas a mano** | `.claude/CLAUDE.md` | Cero migraciones nuevas (D-09). La próxima del repo sería la **080**, y no se usa |
| **Errores de constraint → copy propia, nunca el texto crudo** | convenciones + T-14-25 / T-13-09 | `23505` y `23514` se mapean a copy escrita; nunca se interpola `error.message` |
| **Comentarios densos en español explicando el *porqué*** | convenciones | El componente nuevo se escribe con ese registro |
| **Windows + PowerShell** | `.claude/CLAUDE.md` | Los comandos de verificación de §"Environment" están medidos en esta máquina |
| **Skill `supabase-multitenant-rls`**: una policy por operación, `service_role` sólo server-side, la página pública es caso aparte | `.claude/skills/supabase-multitenant-rls/SKILL.md` | La 078 ya cumple las 5 reglas duras; esta fase **consume** el modelo, no lo modifica |
| **`Edit` parcial, nunca `Write` sobre archivo existente** salvo cambio >80% | CLAUDE.md global | `settings-client.tsx` se toca sólo con `Edit` puntual; el archivo nuevo sí se escribe entero |

---

## Standard Stack

### Core — todo ya instalado, nada nuevo

| Librería | Versión | Para qué en esta fase | Por qué es la estándar acá |
|---|---|---|---|
| `next` | `16.2.7` | App Router; el organizador es client component | Es el framework del repo **[VERIFICADO: package.json]** |
| `react` / `react-dom` | `19.2.4` | Estado local del arrastre, `useState` | ídem |
| `@supabase/supabase-js` | `^2.106.2` | Las 5 escrituras (cliente browser) | El panel no usa server actions (patrón declarado) |
| `@base-ui/react` | `^1.5.0` | `Select`, `Dialog` (focus trap / Escape / portal ya resueltos) | Primitivas del design system |
| `lucide-react` | `^1.17.0` | `Tags`, `ChevronUp`, `ChevronDown`, `GripVertical`, `Plus`, `Trash2`, `Check` | Única librería de iconos del repo |
| `sonner` | `^2.0.7` | `toast.error` / `toast.success` | Canal de feedback ya establecido en la pantalla |
| `tailwindcss` | `^4` | Clases; **cero hex**, todo por token | Config CSS-first en `app/globals.css` |
| `vitest` | `^4.1.9` | Suite de verificación | Framework de tests del repo |

### Supporting — módulos internos que la fase consume sin reimplementar

| Módulo | Qué aporta |
|---|---|
| `lib/service-categories.ts` | `groupCatalog()`, `DEFAULT_SORT_MODES`, `OTHER_GROUP_TITLE`, tipos |
| `components/dashboard/canchas-manager.tsx` | El molde estructural del componente nuevo |
| `components/dashboard/active-tabs.tsx` | `useActiveTabs`, `ActiveTabs`, `ActiveTabsEmptyState` (el empty state del organizador se mira contra `ActiveTabsEmptyState`) |
| `components/crm/confirm-dialog.tsx` | `ConfirmDialog` para D-04 |
| `components/ui/*` | 17 componentes vendorizados **[VERIFICADO: ls components/ui → 17 archivos]** |

### Alternatives Considered

| En vez de | Se podría usar | Trade-off |
|---|---|---|
| `draggable` nativo | `@dnd-kit/core`, `react-beautiful-dnd` | **Descartado por D-07 del milestone y por el UI-SPEC**: cero dependencias de drag-and-drop. Además ninguna resuelve el caso que importa (mobile + teclado), que lo resuelven las ▲/▼ y el diálogo "Mover …" |
| Colapsable a mano | `@base-ui/react/collapsible` (**existe** en `node_modules`) | El UI-SPEC eligió `<button aria-expanded aria-controls>` + render condicional, con el precedente de `section-list.tsx:119-126` y `canchas-manager.tsx:349-356`. `Collapsible` traería animación de alto, que el repo no usa en ningún lado. **No se reabre** |
| Menú "Mover a…" como `DropdownMenu` | `@base-ui/react/menu` (**existe**) | El UI-SPEC eligió un `Dialog` compartido (uno solo, no uno por chip). **No se reabre** |
| RPC transaccional (migr. 080) | `save_agenda_blocks` como molde | Descartado en D-09 y **diferido con condición de disparo**. Leer `supabase/migrations/074_save_agenda_blocks.sql` antes de proponerlo |

**Installation:** ninguna. La fase **no instala ni un paquete**.

## Package Legitimacy Audit

**No aplica: esta fase no instala ningún paquete externo.** Verificado contra el `23-UI-SPEC.md`
(§Registry Safety: "no instala componentes, no agrega dependencias y no agrega ninguna librería de
drag-and-drop") y contra el alcance de la fase (3 archivos, uno nuevo). No hay verdicts `SLOP` ni
`SUS` que reportar porque no hay candidatos. Si un plan propone `npm install` de cualquier cosa, eso
**es** la señal de que se salió del contrato.

---

## El archivo real, medido

### `app/(dashboard)/settings/settings-client.tsx` — **3636 líneas** (la 3637 es el cierre) **[VERIFICADO: conteo con node + Read]**

**Firma y props** — `[VERIFICADO: :876-903, :918]`

```ts
// :876-903
interface Props {
  business: Business
  secrets?: BusinessSecrets            // default EMPTY_SECRETS
  initialServices: Service[]
  initialProfessionals: Professional[]
  initialLocations: Location[]
  initialSpaces?: Space[]              // default []
  initialAgendaSpaces?: AgendaSpace[]  // default []
  initialProfessionalServices?: ProfessionalService[]  // default []
  mpConnectEnabled: boolean
  googleEnabled?: boolean
  googleConnected?: boolean
  ownerEmail?: string | null
  view?: SettingsView                  // 'config' | 'negocio' | 'servicios' | 'equipo' | 'consultorios', default 'config'
}
// :918 — la desestructuración con todos los defaults va en una sola línea
```

La prop nueva (`initialServiceCategories?: ServiceCategory[]`, default `[]`) entra en ese bloque y en
esa línea. **Opcional con default**, igual que `initialProfessionalServices`: los otros 4 call sites
no la pasan.

**Cómo se elige qué se renderiza** — `[VERIFICADO: :925-935, :2146-2168]`

```ts
const SECTION_TAB: Record<string,string> = { negocio:'business', servicios:'services', equipo:'professionals', consultorios:'locations' }  // :925
const isSection = view !== 'config'      // :926
const tabValue  = isNegocio ? negocioTab : isSection ? SECTION_TAB[view] : configTab  // :934
const onTabChange = isNegocio ? setNegocioTab : isSection ? undefined : setConfigTab  // :935
```

- `TabsList` de `config` (`:2162-2168`) tiene **tres** triggers: `appearance`, `seguridad`, `suscripcion`.
- `TabsContent` = `TabsPrimitive.Panel` con **`keepMounted = false`** → el panel inactivo **no se
  renderiza** `[VERIFICADO: node_modules/@base-ui/react/tabs/panel/TabsPanel.js:37,99,110]`.
- **Conclusión medida:** el panel `services` **sólo se monta con `view="servicios"`**. (Resuelve D-3.)

**Los 5 call sites de `SettingsClient`** `[VERIFICADO: grep]`: `settings/page.tsx:37` (sin `view`),
`negocio/page.tsx:24`, `equipo/page.tsx:33`, `consultorios/page.tsx:17`, **`servicios/page.tsx:31`
(`view="servicios"`)**.

**El gate de vertical y la región de servicios** — `[VERIFICADO: :961, :2476-2849]`

```
:961   const isCanchas = resolveVertical(business).key === 'canchas'
:2476  <TabsContent value="services" className="mt-4">
:2477    {isCanchas ? (
:2481      <CanchasManager … />                       ← 2481-2492
:2493    ) : (
:2494    <>
:2495      <Card className="p-6 space-y-4">           ← Card de servicios, abre
:2498        <ActiveTabs tab={serviceTab} … />        ← ⬅ el Bloque B del UI-SPEC va JUSTO DEBAJO
:2499        {visibleServices.length === 0 ? <ActiveTabsEmptyState …/> : (
:2513          <div className="space-y-2">
:2514            {visibleServices.map(s => { …
:2535              <div key={s.id} className="p-3 rounded-lg bg-secondary/50 flex flex-col gap-2
                        sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">   ← LA TARJETA (no :2513)
:2536-2565          … comentario de estructura (G-04, invariante de 32px) — NO SE TOCA
:2566              nombre + pill "Sin cobertura"
:2596              línea de datos (duración · precio · modo de cupo)
:2616              CapacityInlineControl (si capMode !== 'individual')
:2624              "Se ofrece en:" (sedes)
:2636              cobertura de staff
:2686              las tres acciones (Desactivar / Pencil / Trash2, h-11 w-11 sm:h-8 sm:w-8 en :2701,:2704)
:2710            })}
:2711          </div>
:2712        )}
:2713        <div className="border-t border-border pt-4 space-y-3">   ← ALTA DE SERVICIO, abre
:2714          <p className="text-sm font-medium">Agregar servicio</p>
:2719-2736      grid-cols-12: Nombre (sm:col-span-6) · Min. (sm:col-span-3) · Precio (sm:col-span-3)
:2737          <CapacityModeFields … />
:2743-2756      "Se ofrece en" (si activeLocations.length > 0)
:2763          <Button onClick={addService} …>   ← el CTA, último
:2766        </div>                              ← ALTA cierra
:2767      </Card>
:2771      <Dialog open={!!editSvc} …>           ← EDITAR SERVICIO, abre
:2789        <DialogContent className="grid max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 sm:max-w-sm">
:2790          <DialogHeader className="pb-3 pr-8"><DialogTitle>Editar servicio</DialogTitle></DialogHeader>
:2799          <div className="-mx-4 min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 py-1">  ← la fila que scrollea
:2800-2803        Nombre
:2804-2813        grid-cols-2: Min. + Precio
:2814            <CapacityModeFields … />
:2821-2834        "Se ofrece en"
:2835          </div>
:2842        <DialogFooter className="mt-4"> … Guardar …
:2846      </Dialog>
:2847    </>
:2848    )}
:2849  </TabsContent>
```

**Dónde aterrizan los dos campos nuevos (Bloque C del UI-SPEC):** después del precio y antes de
`CapacityModeFields`, o sea **entre `:2736` y `:2737`** en el alta, y **entre `:2813` y `:2814`** en
el diálogo. El orden que manda el UI-SPEC (`Nombre → Min.+Precio → Categoría → Descripción → Modo de
cupo → Se ofrece en → CTA`) cae exacto en esos dos huecos, sin mover nada de lo que ya está.

**Estado y handlers del servicio** — `[VERIFICADO: :1140-1501]`

| Qué | Línea | Forma real |
|---|---|---|
| `services` | `:1140` | `useState<Service[]>(initialServices)` |
| `newService` | `:1147` | `{ name: string; duration_minutes: string; price: string; location_ids: string[]; capacity_mode: CapacityMode; capacity: number }` — **los numéricos son texto crudo** (G-21-11) |
| `addService()` | `:1351-1381` | `supabase.from('services').insert({ name, duration_minutes, price, location_ids, capacity_mode, capacity, business_id }).select().single()` → `setServices(prev => [...prev, data])` |
| `editSvc` / `editSvcForm` | `:1431` / `:1433` | mismo shape que `newService` |
| `openEditService(s)` | `:1447-1464` | hidrata `editSvcForm` desde la fila (`String(s.price)` porque `numeric` llega como string) |
| `saveEditService()` | `:1465-1501` | arma `payload` literal → `.update(payload).eq('id', editSvc.id).eq('business_id', business.id)` → mapea `P0001` → `setServices(prev => prev.map(...{...s, ...payload}))` |
| `deleteService()` | `:1387-1404` | `.delete().eq('id').eq('business_id').select('id')`; mapea `P0001` / `23503` |
| `professionalServices` | `:1758` | — |
| `useActiveTabs` de servicios | `:1777` | `{ tab: serviceTab, setTab: setServiceTab, visible: visibleServices, counts: serviceTabCounts }` |
| `activeLocations` | `:1897` | `locations.filter(l => l.is_active !== false)` |
| `ConfirmDialog` de servicio / sede / cupo | `:3565` / `:3606` / `:3620` | el import está en `:27` |

Los cuatro toques de CAT-02/CAT-11 sobre este archivo son **quirúrgicos**: agregar `category_id` y
`description` a los dos shapes de form (`:1147`, `:1433`), al `insert` de `addService` (`:1370`), al
`payload` de `saveEditService` (`:1469-1483`) y a la hidratación de `openEditService` (`:1454-1463`).

### `components/dashboard/canchas-manager.tsx` — el molde de D-01 — **435 líneas** `[VERIFICADO]`

```ts
// :37-50 — Props
interface Props {
  business: Business
  supabase: SupabaseClient                       // ⬅ el cliente VIENE POR PROP, no se crea adentro
  services: Service[]
  setServices: React.Dispatch<React.SetStateAction<Service[]>>
  professionals: Professional[]
  setProfessionals: …
  spaces: Space[];         setSpaces: …
  agendaSpaces: AgendaSpace[]; setAgendaSpaces: …
}
export function CanchasManager({ … }: Props) { … }   // :52-58
```

Lo que un hermano nuevo tiene que copiar para "pertenecer":

1. **`'use client'` + cabecera de comentario** que dice dónde se monta, qué consume y cuál es el leak
   guard (`:1-15`).
2. **`supabase` por prop**, nunca `createClient()` adentro (`:53`) — así el padre y el hijo comparten
   la misma sesión.
3. **Estado compartido con el padre por pares `valor` + `setValor`** (`:42-49`): el manager mergea al
   estado del padre en vez de recargar la página. El organizador necesita exactamente esto para
   `services`/`setServices` (asignar categoría muta `services`) y para su propio `categories`/`setCategories`.
4. **Escritura con el cliente browser + `toast` para feedback** (`:99`, `:144`, `:165`, `:221-230`).
5. **`Card className="p-6 space-y-4"`** como raíz (`:261`) y `ConfirmDialog` como hermano fuera de la
   Card (`:418-431`).
6. **Un helper a nivel de módulo** cuando su identidad tiene que ser estable entre renders (`:35`,
   `isCanchaActive`) — el mismo motivo por el que el UI-SPEC pide `CategoryRow`/`ServiceChip` fuera
   del componente.
7. **Un colapsable hecho a mano**: `<button type="button" aria-expanded={shareOpen} onClick={…}>` +
   render condicional (`:349-357`). Es el precedente vivo del header de la Card de D-02.

**Se renderiza en `settings-client.tsx:2481-2492`**, dentro de la rama `isCanchas` del
`TabsContent value="services"`.

### La pregunta del vertical canchas — cerrada con evidencia

El `23-UI-SPEC.md` ya la decidió (§"El vertical canchas queda AFUERA"). El código la respalda:

- El gate **ya existe** y es un ternario, no un `if` con bloques: `:2477 {isCanchas ? (…) : (…)}`.
  El organizador va **dentro del `else`, como primer hijo del fragmento `<>` de `:2494`**, sin agregar
  ninguna condición nueva `[VERIFICADO: :2477-2494]`.
- En canchas **no hay CRUD genérico de `services`**: `CanchasManager` lo reemplaza entero y presenta
  la cancha como entidad unificada `[VERIFICADO: canchas-manager.tsx:3-8]`.
- `canchas-manager.tsx` tiene un **leak guard explícito**: "no se muestran campos de staff ni el
  `service_id` (puntero interno)" `[VERIFICADO: canchas-manager.tsx:14-15]`. Un selector de categoría
  de servicio ahí adentro lo contradice.
- La superficie pública de canchas es `app/[slug]/canchas-booking-client.tsx`, no `booking-client.tsx`
  — que es lo que agrupa la Phase 24 `[VERIFICADO: existe el archivo; la Phase 24 apunta a booking-client]`.

**Recomendación:** dejarlo escrito como decisión (no como omisión) en el plan y en el comentario de
cabecera del componente nuevo.

---

## El modelo y sus señales de rechazo

### El estado real de la base

Las migraciones **078 y 079 están aplicadas en producción desde el 2026-09-15**, y la próxima del
repo es la **080** `[CITADO: memoria del proyecto, migracion-078-catalogo-en-prod.md]`. La fase, al no
migrar, es un **deploy de app puro**: sin paso manual en prod y sin la trampa del
`NOTIFY pgrst, 'reload schema'`.

`service_categories` medida contra el PG local `[MEDIDO: docker exec supabase_db_forjo-app psql … "\d public.service_categories"]`:

```
   Column    |           Type           | Nullable |      Default
-------------+--------------------------+----------+-------------------
 id          | uuid                     | not null | gen_random_uuid()
 business_id | uuid                     | not null |
 name        | text                     | not null |            ← ⚠ SIN DEFAULT (ver D-1)
 sort_order  | integer                  | not null | 0
 created_at  | timestamp with time zone | not null | now()
Indexes:
  service_categories_pkey              PRIMARY KEY, btree (id)
  service_categories_id_business_uq    UNIQUE CONSTRAINT, btree (id, business_id)
  service_categories_name_uq           UNIQUE, btree (business_id, lower(btrim(name, ' \t\n\r')))
  service_categories_order_idx         btree (business_id, sort_order)
Check constraints:
  service_categories_name_not_blank    CHECK (btrim(name, ' \t\n\r') <> '')
Referenced by:
  services CONSTRAINT services_category_same_tenant
    FOREIGN KEY (category_id, business_id) REFERENCES service_categories(id, business_id)
    ON DELETE SET NULL (category_id)
Policies: 4 (select/insert/update/delete) con predicado de tenant por owner_id
```

`services`, columnas relevantes `[MEDIDO: information_schema.columns]`:

| Columna | Nullable | Default | Nota |
|---|---|---|---|
| `name` | NO | — | **NOT NULL sin default** |
| `duration_minutes` | NO | — | **NOT NULL sin default** |
| `price` | NO | — | **NOT NULL sin default** (`numeric`) |
| `description` | **YES** | — | `text`, **sin límite de longitud en la base** |
| `capacity_mode` | NO | `'individual'` | |
| `capacity` | NO | `1` | |
| `category_id` | **YES** | — | la nulabilidad **es** el requisito (CAT-02) |
| `sort_order` | NO | `0` | |
| `business_id` | **YES** | — | nullable por historia — el motivo del `ON DELETE SET NULL (category_id)` |

Confirma la premisa de D-09 sobre `services` (`name`/`duration_minutes`/`price` NOT NULL sin default)
**y a la vez** revela que `service_categories.name` está en la misma situación.

**Triggers de `services`** `[MEDIDO]`: `services_block_delete_trg` (BEFORE DELETE) y
`services_block_mode_change_trg` (**BEFORE UPDATE OF `capacity_mode`**). → **Un `UPDATE` que toca
sólo `sort_order` o sólo `category_id` no dispara ningún trigger**, y los 4 CHECK de `services`
(`capacity_matches_mode`, `capacity_mode`, `capacity_positive`, `duration_positive`) no lo pueden
rechazar porque no tocan esas columnas. El camino de D-09 para el eje servicios está limpio.

**Policies de `services`** `[MEDIDO]`: una sola, `"business member access"` **FOR ALL con sólo
`USING`** (en Postgres, una policy sin `WITH CHECK` usa la expresión de `USING` también como check).
Distinto de `service_categories`, que tiene las 4 por operación con `WITH CHECK` explícito en el
UPDATE. Motivo extra para no aflojar el `.eq('business_id', …)` en ningún call site.

### Los dos códigos de rechazo, medidos

**Duplicado case/space-insensitive** `[MEDIDO: probe SQL contra supabase_db_forjo-app, transacción revertida]`:

```
INSERT … name = 'Color';      -- INSERT 0 1
INSERT … name = '  cOLOR ';   -- ERROR
ERROR:  23505: duplicate key value violates unique constraint "service_categories_name_uq"
DETAIL:  Key (business_id, lower(btrim(name, ' \t\n\r')))=(00000000-…-b1, color) already exists.
CONSTRAINT NAME:  service_categories_name_uq
```

**A nivel `@supabase/supabase-js`** el código llega tal cual, y eso **ya lo asevera un test verde del
repo** `[VERIFICADO: test/service-categories-model.test.ts:216-222 y :229-235]`:

```ts
const dup = await seeded.admin.from('service_categories')
  .insert({ business_id: seeded.businessId, name: variante }).select('id')
expect(dup.error?.code, JSON.stringify(variante)).toBe('23505')   // 5 variantes de espacio/caps
…
expect(ins.error?.code, JSON.stringify(enBlanco)).toBe('23514')   // '', '   ', '\t'
```

**Forma del objeto de error que el panel recibe** (PostgREST → `supabase-js`):
`{ code, message, details, hint }`. El **nombre del constraint viaja dentro de `message`**
(`duplicate key value violates unique constraint "service_categories_name_uq"`) y la clave dentro de
`details` — **no hay campo dedicado**. Por eso el panel **tiene que ramificar por `code`** y nunca
parsear ni mostrar `message`: interpolarlo filtra nombres de constraint y de columna a la pantalla del
dueño (T-14-25 / T-13-09). `[VERIFICADO: código en el test; forma del objeto — CITADO: contrato de
`PostgrestError` de @supabase/supabase-js, coherente con los 8 call sites del repo que leen `error.code`]`

**Criterio de aceptación redactable** (lo que el planner puede escribir en vez de "maneja duplicados"):

> Crear una categoría cuyo nombre normalizado (`lower(btrim(name, ' \t\n\r'))`) ya existe en el mismo
> negocio devuelve `error.code === '23505'`; el panel **no** toca el estado local, muestra
> `"Ya tenés una categoría con ese nombre."` inline bajo el input con `aria-invalid` en el `Input`, y
> **no** aparece en pantalla ninguna parte de `error.message`. Un nombre en blanco o de puros blancos
> devuelve `'23514'` → `"Escribí un nombre para la categoría."`.

⚠ **`23505` no siempre significa "nombre duplicado" en esta tabla**: también lo puede tirar el
`service_categories_id_business_uq` o la PK. En el camino de **alta** (INSERT sin `id`) el único
alcanzable en la práctica es el del nombre. En el camino de **reorden por upsert** un `23505` NO es un
duplicado de nombre del formulario: es una condición de carrera y va al toast genérico de orden. Esa
distinción tiene que estar **por call site**, no por un clasificador global.

### El molde de traducción que ya existe

`[VERIFICADO: app/(dashboard)/agenda/agenda-client.tsx:200-232 y :651-665]`

```ts
// :209 — clasificador puro: entra el error de la base, sale un código de dominio propio.
function classifySaveHoursError(error: { code?: string; message?: string }): SaveHoursReject {
  const code = error.code ?? ''
  const message = error.message ?? ''
  if (code === 'P0001' && message.includes('not_your_business')) return 'reload'
  if (code === '23503') return 'reload'
  …
  return 'unknown'
}

// :651-665 — el call site: registra el CÓDIGO (nunca el mensaje), muestra copy propia,
// y EL ESTADO LOCAL NO SE TOCA.
if (error) {
  const reason = classifySaveHoursError(error)
  console.error('[agenda/save-hours] rechazo:', reason, error.code)
  toast.error(SAVE_HOURS_REJECT_COPY[reason])
  return                           // ⬅ el dueño sigue viendo lo que quiso guardar
}
```

Mismo molde, más chico, en `settings-client.tsx:1393-1398` (borrado de servicio) y `:1491-1496`
(gate de cambio de modo de cupo).

---

## `lib/service-categories.ts` — la superficie exportada

`[VERIFICADO: lib/service-categories.ts:47-332, leído entero esta sesión]`

```ts
export type CategorySortMode = 'custom' | 'alpha'                    // :48
export type ServiceSortMode  = 'custom' | 'alpha' | 'price'          // :54
export interface CatalogSortModes { categories: CategorySortMode; services: ServiceSortMode }  // :57
export const DEFAULT_SORT_MODES: CatalogSortModes = { categories: 'custom', services: 'custom' } // :71
export const OTHER_GROUP_TITLE = 'Otros'                             // :80

export interface CatalogService {                                    // :90
  id: string; name: string; price: number
  category_id?: string | null
  sort_order?: number | null
}
export interface CatalogCategory { id: string; name: string; sort_order?: number | null }  // :99
export interface CatalogGroup<S> { categoryId: string | null; title: string | null; services: S[] } // :113

export function groupCatalog<S extends CatalogService>(             // :252
  services: S[],
  categories: CatalogCategory[],
  modes?: Partial<CatalogSortModes>,
): CatalogGroup<S>[]
```

**Los comparadores NO se exportan** (`porOrden`, `porNombre`, `porPrecio`, `comparadorDeCategorias`,
`comparadorDeServicios`, `ordenadas` son internos, `:124-204`). Lo único público es `groupCatalog` +
las dos constantes + los tipos. Consecuencia para el plan: **el panel no puede "usar el comparador
alfabético" por su cuenta**; si necesita ver el catálogo ordenado, llama a `groupCatalog()`.

**Qué tiene que pasarle el panel:**

```ts
groupCatalog(
  services,                                   // Service[] del estado local — entra sin cast: Service ⊇ CatalogService
  categories,                                 // ServiceCategory[] — entra sin cast: ServiceCategory ⊇ CatalogCategory
  { categories: business.category_sort_mode, services: business.service_sort_mode },
)
```

⚠ En `lib/types.ts` los dos modos son **opcionales** (`category_sort_mode?`, `service_sort_mode?`,
`:66` y `:68`), así que ese objeto puede llevar `undefined`. Es el caso que `groupCatalog` cubre **a
propósito** con `??` campo por campo y **no** con spread (`:257-268`). No hace falta defenderse arriba.

**Reglas que ya están resueltas y que el panel NO debe replicar** `[VERIFICADO: :206-332]`:

| Regla | Dónde |
|---|---|
| Sin servicios ⇒ `[]` (ningún grupo vacío, nunca) | `:274` |
| **Identidad**: si ninguna categoría tiene servicios ⇒ un grupo `{categoryId:null, title:null}` con la lista en el orden de llegada, **sin mirar los modos** | `:299-301` |
| Un grupo por categoría **con** servicios, ordenadas por su eje | `:306-319` |
| Los sueltos van **últimos**, bajo `OTHER_GROUP_TITLE`, y sólo si hay | `:323-329` |
| **Conservación**: cada servicio aparece exactamente una vez (colgado / cross-tenant / nulo ⇒ sueltos; bucket consumido para que una categoría repetida no duplique) | `:278-293`, `:317` |
| No muta la entrada (ordena sobre copias) | `:202-204` |

**Cobertura de tests ya verde — no re-testear** `[VERIFICADO: test/service-categories.test.ts + test/service-categories-model.test.ts]`:

- **Puro (`service-categories.test.ts`)**: orden de categorías (custom/alpha/empate estable), orden de
  servicios (custom/alpha/price, precio roto, precio nulo ≠ gratis), grupo de sueltos con el mismo
  modo, no-mutación, **CAT-07** (cero categorías, "los modos ni se miran", categorías sin asignar),
  **CAT-06** (custom→alpha→price→custom idéntico), conservación en los 7 casos × modos, colgado,
  cross-tenant, categoría repetida, lista vacía, "ningún grupo vacío", `name` nulo en las dos
  posiciones, y los 5 casos de `modes` ausente/`undefined`.
- **DB (`service-categories-model.test.ts`, 5 casos, carril `db` serializado)**: CAT-07 por el camino
  real, el recorrido tabla → vista anon → `groupCatalog`, sueltos al final, **CAT-01 con 5 variantes
  de espacio/caps ⇒ `23505`**, nombre en blanco ⇒ `23514`.

**Lo que esta fase sí necesita testear** (no está cubierto): la **renumeración** (que produce
`0..n-1` sin huecos ni empates sobre la lista completa de hermanas) y el **mapeo código → copy**. Las
dos cosas son funciones puras si se las extrae; si quedan dentro del componente no hay test barato.
**Sugerencia**: un `lib/` chiquito con `renumber(ids: string[]): {id, sort_order}[]` y
`moveWithinList(ids, from, to)` se testea en 10 líneas y le da al plan un criterio automatizable.

---

## El patrón de reordenar

### La receta, extraída de los tres precedentes

**(a) `draggable` nativo — molde del repo** `[VERIFICADO: app/(crm)/admin/pipeline/pipeline-client.tsx:92, 141-161, 260-268, 462-470]`

```tsx
// Estado: QUÉ se arrastra y SOBRE QUÉ está parado. Dos useState en el componente padre.
const [draggingId, setDraggingId]   = useState<string | null>(null)   // :92
const [dragOverStage, setDragOverStage] = useState<StageKey | null>(null)

// ORIGEN (el elemento arrastrable)
<div
  draggable                                                            // :462
  onDragStart={(e) => {
    e.dataTransfer.effectAllowed = 'move'                              // :464
    e.dataTransfer.setData('text/plain', deal.id)                      // :465
    onDragStart()                                                      // ⬅ y ADEMÁS al estado de React
  }}
  onDragEnd={onDragEnd}                                                // :468
/>

// DESTINO (la zona que recibe)
<div
  onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.key) }}   // :260-263
  onDragLeave={(e) => {                                                     // :264-267
    // sólo limpiar si el puntero salió del contenedor, no al pasar sobre un hijo
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStage(null)
  }}
  onDrop={() => handleDrop(stage.key)}                                      // :268
/>
```

Cinco cosas que esta receta enseña y que hay que portar tal cual:

1. **`e.preventDefault()` en `onDragOver` es obligatorio.** Sin él el navegador no acepta el drop y
   `onDrop` nunca dispara. Es el error #1 de todo DnD nativo.
2. **El `id` viaja por `useState`, no por `dataTransfer`.** Se llama a `setData` igual (por
   interoperabilidad y por el cursor), pero el `onDrop` lee `draggingId` del estado
   (`pipeline-client.tsx:142`). Motivo: **`dataTransfer.getData()` devuelve `''` durante `dragover`**
   por el modo protegido del spec — sólo es legible en `drop`. Mantener el estado evita depender de
   eso para pintar el resaltado mientras se arrastra.
3. **`onDragLeave` con `currentTarget.contains(relatedTarget)`**: sin esa guarda, pasar por encima de
   un hijo apaga el resaltado y parpadea.
4. **El `onDrop` limpia los dos estados ANTES de cualquier `await`** (`:143-144`), y es no-op si el
   destino es el origen (`:148`).
5. **Optimista + revertir con `toast` si falla** (`:151-160`). ⚠ Para esta fase, **D-10.2 pide más
   que revertir**: re-leer el orden real de la base y pintar eso.

⚠ **El UI-SPEC prohíbe el `opacity-50` que usa el pipeline en `:470`**: el estado "arrastrando" se
comunica con `border-dashed` (§Color). Portar el mecanismo, no esa clase.

**(b) Los botones ▲/▼ — molde del repo** `[VERIFICADO: app/(dashboard)/web/_sections/section-list.tsx:110-155, 226-228]`

```tsx
<li className="rounded-md border bg-secondary">                       {/* :110 */}
  <div className="flex items-center gap-1.5 p-2">
    <GripVertical className="size-4 shrink-0 text-muted-foreground/40" aria-hidden="true" />  {/* :113-116 */}
    <button type="button" onClick={…} aria-expanded={open} className="flex-1 …">{LABELS[s.type]}</button>
    <Button variant="ghost" size="icon" className="min-h-11 min-w-11"
            disabled={isFirst} aria-disabled={isFirst}                {/* :136-137 — los DOS */}
            aria-label="Subir sección" onClick={() => handleMove(s.type,'up', i)}>
      <ChevronUp className="size-4" />
    </Button>
    … ChevronDown con disabled={isLast} …                             {/* :145-155 */}
  </div>
</li>
…
<div aria-live="polite" className="sr-only">{announce}</div>          {/* :226-228 — SIEMPRE montada */}
```

⚠ **Dos cosas de este precedente NO se portan:**

- **El mutador es un `swap`** (`onMove` → `moveSection` intercambia `order` con la vecina). **CAT-03
  lo prohíbe explícitamente**: "renumerando la lista completa de hermanas — nunca con swaps sueltos".
  Se porta el **botón**, no el mutador.
- El tamaño es `min-h-11 min-w-11` fijo; el UI-SPEC pide `h-11 w-11 sm:h-8 sm:w-8` (molde de la
  tarjeta de servicio, `settings-client.tsx:2701`).

Lo que **sí** se porta textual: `disabled` **y** `aria-disabled` juntos, el `aria-label` con el nombre
interpolado, el `GripVertical` siempre `aria-hidden`, y la región `aria-live="polite" sr-only`
**siempre montada** cuyo *contenido* cambia (nunca el nodo).

**(c) El renumerado completo — `forjo-tiendas`** `[VERIFICADO: ../forjo-tiendas/app/(consola)/(panel)/categorias/Organizador.tsx:125-181 y acciones.ts:181-194 — el repo hermano SÍ es alcanzable desde esta máquina]`

```ts
// Organizador.tsx:125-134 — mover con flecha: sacar e insertar sobre la lista de HERMANAS
function mover(c: CategoriaEnPanel, delta: -1 | 1) {
  const hermanas = hermanasDe(c.padreId)
  const desde = hermanas.findIndex(x => x.id === c.id)
  const hacia = desde + delta
  if (desde < 0 || hacia < 0 || hacia >= hermanas.length) return   // no-op en los bordes
  const ids = hermanas.map(x => x.id)
  const [sacado] = ids.splice(desde, 1)
  ids.splice(hacia, 0, sacado)
  correr(() => reordenarCategorias(ids))                           // ⬅ se manda la lista ENTERA
}

// Organizador.tsx:147-167 — soltar sobre otra: MISMA operación, distinto índice destino
function ponerEn(destino, id) {
  if (destino.id === id) return
  const hermanas = hermanasDe(destino.padreId)
  const ids = hermanas.filter(x => x.id !== id).map(x => x.id)      // sacar el arrastrado
  const lugar = hermanas.findIndex(x => x.id === destino.id)        // insertar EN EL ÍNDICE del destino
  ids.splice(lugar, 0, id)
  correr(() => reordenarCategorias(ids))
}
```

El comentario de `:113-123` dice el porqué en una línea reusable: *"Se manda la lista entera
reordenada, no 'este subió'. […] Además así no hay dos verdades sobre el orden."*

Y el lado servidor de allá (`acciones.ts:181-194`) es **exactamente lo que D-09/D-10 vienen a
reemplazar**, así que sirve como contraejemplo:

```ts
export async function reordenarCategorias(ids: string[]) {
  const cambios = await Promise.all(
    ids.map((id, i) => supabase.from('categorias').update({ orden: i }).eq('id', id)),
  )                                     // ⚠ SIN filtro de tenant  → D-10.1 lo prohíbe
  if (cambios.some(c => c.error)) return { error: 'No se pudo reordenar.' }
  refrescar()                           // ⚠ revalidatePath: allá el re-read es gratis; acá NO
}
```

**Dos diferencias de fondo con forjo-app**, que el plan no puede pasar por alto:

1. Allá el flujo es **server action + `revalidatePath`**, así que la lista se re-deriva del servidor
   sola. Acá el panel es **client + estado local**: el "re-leer el orden real de la base" de D-10.2
   hay que **escribirlo a mano** (un `select` de las hermanas → `setCategories(…)`).
2. Allá **no hay filtro de tenant** en el update. Acá `.eq('business_id', business.id)` va siempre.

También difieren las columnas (`tienda_id`/`nombre`/`orden` vs `business_id`/`name`/`sort_order`) y el
esquema de RLS. **Se porta la forma, nunca el código** (D-07 del milestone).

### `draggable` bajo React 19 + Next 16 — lo que hay que saber

| Gotcha | Estado medido / verificado |
|---|---|
| `onDragOver` **necesita** `e.preventDefault()` o `onDrop` no dispara | `[VERIFICADO: pipeline-client.tsx:260-261 — el código en producción lo hace]` |
| `dataTransfer.getData()` devuelve `''` durante `dragover` (modo protegido del spec HTML5); sólo es legible en `drop` | `[CITADO: HTML Living Standard §drag-and-drop, "protected mode"]`. El repo ya lo esquiva guardando el id en `useState` `[VERIFICADO: pipeline-client.tsx:142]` |
| **Touch no dispara eventos de drag.** En mobile el arrastre simplemente no existe | Es **el motivo** de CAT-03 (▲/▼) y de D-07 (diálogo "Mover …"). No se compensa con polyfills |
| `onDragLeave` dispara al entrar a un hijo | Guarda `currentTarget.contains(relatedTarget)` `[VERIFICADO: pipeline-client.tsx:264-267]` |
| Un `<button>` anidado dentro de un `<li draggable>` puede "robar" el arrastre en algunos navegadores | Mitigado por diseño: el UI-SPEC pone el `draggable` en el `<li>` entero y deja las acciones como botones hermanos; el grip es **decorativo** (`aria-hidden`) |
| `next/link` dentro de una zona arrastrable | **No aplica**: no hay ningún `Link` en la superficie nueva `[VERIFICADO: el único `Link` de la región es el de "asignalo en Equipo", settings-client.tsx:2645, fuera de la Card nueva]` |
| Algo de Next 16 que cambie el DnD | **No hay nada.** `grep -rl "draggable" node_modules/next/dist/docs/` → **cero archivos** `[VERIFICADO]`. El arrastre es API de React DOM + HTML5; lo único que Next impone es `'use client'` |
| Tailwind v4 / base-ui interfiriendo | `touch-action` / `user-select` no se tocan en `app/globals.css` para estos elementos; el pipeline del CRM arrastra bien en producción con el mismo setup `[ASSUMED — inferido de que el pipeline está shipeado; no se probó el organizador porque todavía no existe]` |
| **Estado de arrastre colgado** al desmontar (colapsar la Card, cambiar de modo) | Riesgo real señalado por el UI-SPEC #6. Mitigación: resetear `draggingId`/`dragOverId` en el mismo handler que colapsa y en el que cambia de modo |

---

## Los dos caminos de escritura, medidos

### (a) El upsert de categorías — **el hallazgo que decide un plan**

`[MEDIDO: probe SQL contra supabase_db_forjo-app, transacción revertida]`

```sql
BEGIN;
INSERT INTO service_categories (id, business_id, name, sort_order) VALUES ('1111…', <biz>, 'Color', 0);

-- lo que haría un `.upsert([{ id, business_id, sort_order }], { onConflict: 'id' })`
INSERT INTO service_categories (id, business_id, sort_order) VALUES ('1111…', <biz>, 5)
  ON CONFLICT (id) DO UPDATE SET sort_order = EXCLUDED.sort_order;
```

```
ERROR:  23502: null value in column "name" of relation "service_categories" violates not-null constraint
DETAIL: Failing row contains (1111…, 0000…b1, null, 5, 2026-09-16 01:54:12+00).
LOCATION: ExecConstraints, execMain.c:1981
ROLLBACK
```

**Por qué falla aunque la fila exista:** Postgres corre `ExecConstraints` sobre la **tupla propuesta**
*antes* de la inserción especulativa que detecta el conflicto. El `DO UPDATE` nunca llega a
evaluarse. Vale para cualquier columna `NOT NULL` sin default — o sea `name`.

**Consecuencias concretas para el plan:**

1. El payload del upsert tiene que ser `{ id, business_id, name, sort_order }` **para todas las filas**
   (PostgREST arma un solo `INSERT` con la **unión** de claves de todas las filas del array; una fila
   a la que le falte una clave manda `NULL` en esa columna). **El payload tiene que ser homogéneo.**
2. Con `name` en el payload, el reordenamiento **puede pisar un renombrado** hecho desde otra pestaña
   o sesión — exactamente el modo de falla que D-09 usó para descartar el upsert en `services`
   ("un cliente con dato viejo pisaría un precio"). Acá el daño es menor (un título, no un precio) y
   auto-reparable, pero hay que escribirlo.
3. Con `name` en el payload aparece un `23505` posible **durante el reorden** (si otra sesión creó
   mientras tanto una categoría con ese nombre normalizado). Va al toast genérico de orden + el
   re-read de D-10.2, **nunca** al error inline del formulario de alta.

**Las dos salidas, para que el planner elija con el costo a la vista** (D-09 declara esta
reversibilidad como "reemplazar el cuerpo de dos funciones del cliente"):

| Opción | Qué implica | Costo |
|---|---|---|
| **A — upsert con `name`** | Se mantiene la atomicidad de D-09 (una sentencia). El payload lleva `{id, business_id, name, sort_order}` | Un reorden puede revertir un renombrado concurrente; hay que documentarlo y cubrirlo con el re-read de D-10.2 |
| **B — N `.update({ sort_order }).eq('id').eq('business_id')`** | El eje categorías queda **idéntico** al eje servicios: un solo mutador genérico, ningún dato del dueño viaja | Se pierde la atomicidad, que D-09 ya calificó de "cosmética y auto-reparable"; D-10.2 (re-read + aviso) pasa a ser la red de seguridad de los **dos** ejes |

> El researcher **no elige**: las dos respetan la letra de D-10 ("un solo mutador por eje, con
> `business_id` siempre puesto, renumerando la lista completa"). Lo que no se puede es implementar el
> upsert tal como está escrito en D-09 y descubrir el `23502` en ejecución.

**RLS con el upsert:** `service_categories` tiene las 4 policies por operación; el INSERT especulativo
chequea la de `insert` (WITH CHECK por `owner_id`) y el `DO UPDATE` la de `update` (USING **y** WITH
CHECK). Un `business_id` forjado rebota en las dos. `[VERIFICADO: \d public.service_categories + migr. 078:166-187]`

### (b) Los N updates de `services.sort_order` / `category_id`

Forma canónica, la del repo `[VERIFICADO: settings-client.tsx:1485, 1388]`:

```ts
await supabase.from('services')
  .update({ sort_order: i })
  .eq('id', id)
  .eq('business_id', business.id)     // defensa en profundidad — la RLS es la 2ª capa, no la única
```

Medido: **ningún trigger ni CHECK de `services` se opone** a un update que sólo toca `sort_order` o
`category_id`. El único guard relevante es la **FK compuesta** `services_category_same_tenant`, que
rechaza con `23503` un `category_id` de otro negocio — la garantía declarativa de CAT-02.

⚠ Para detectar un update que la RLS filtró **sin error**, el repo usa `.select('id')` y chequea
`data.length` (`settings-client.tsx:1384-1386, 1400`): *"si la RLS filtra la fila, el DELETE vuelve
sin error y con 0 filas — sin eso diríamos 'Servicio eliminado' sin haber borrado nada."* El mismo
razonamiento aplica al reordenamiento: **un update de 0 filas no es un éxito.**

### (c) Los dos modos de orden

`businesses.category_sort_mode` (`'custom'|'alpha'`) y `service_sort_mode` (`'custom'|'alpha'|'price'`),
las dos `NOT NULL DEFAULT 'custom'` con CHECK `[VERIFICADO: migr. 078:274-304 + confirmado en el esquema local]`.

El molde del repo para escribir `businesses` desde el panel `[VERIFICADO: settings-client.tsx:988, 997, 1005]`:

```ts
const { error } = await supabase.from('businesses').update({ palette: key }).eq('id', business.id)
if (error) { toast.error('Error al guardar la paleta'); return }
```

Y **nada más**: cambiar de modo escribe **una sola columna** de `businesses` y **ningún `sort_order`**
(D-11 / CAT-06). Un valor fuera del enum rebota con `23514` — pero el `Select` sólo ofrece los
válidos, así que ese error no tiene copy propia: cae en el toast genérico.

### El contrato con el read-path

`app/(dashboard)/servicios/page.tsx` — **44 líneas**, `Promise.all` de 6 lecturas `[VERIFICADO: :21-28]`:

```ts
const [{ data: services }, { data: locations }, { data: professionals },
       { data: spaces }, { data: agendaSpaces }, { data: professionalServices }] = await Promise.all([
  supabase.from('services').select('*').eq('business_id', business.id).order('created_at'),   // :22
  … 5 más …
])
```

Dos cambios, los dos en **este archivo solo** (D-3):

1. **`services`**: `.order('sort_order', { ascending: true }).order('created_at', { ascending: true })`.
   Es seguro para CAT-07 porque hoy **todos** los `sort_order` valen `0` (la 078 no hizo backfill) y
   la clave secundaria reproduce exactamente el orden de hoy.
2. **Lectura nueva**: `supabase.from('service_categories').select('*').eq('business_id', business.id).order('sort_order').order('created_at')`.
   ⚠ El `.order('created_at')` como desempate **no es decorativo**: con varias categorías en
   `sort_order = 0` (recién creadas), sin él el orden que devuelve PostgREST no está garantizado.

`business` ya baja con `select('*')` (`:11`), así que los dos modos viajan sin tocar nada.

---

## CAT-11 medido

| Afirmación del contrato | Medición |
|---|---|
| "`services.description` ya existe" | ✅ `text`, **nullable, sin default y sin límite de longitud en la base** `[MEDIDO: information_schema.columns]`. El tope de 120 es **sólo de la app**: no hay CHECK que lo sostenga |
| "`public_services` ya la expone" | ✅ la vista lista `description` como 6ª columna `[VERIFICADO: migr. 078:348-363]`, con `GRANT SELECT` para `anon`/`authenticated` |
| "la tarjeta del booking ya la renderiza con `line-clamp-2`" | ✅ **`app/[slug]/booking-client.tsx:610-612`** — `:610` es el guard `{service.description && (` y `:611` es el `<p className="mt-1 text-xs text-muted-foreground line-clamp-2">`. La cita del CONTEXT (`:610`) apunta al guard; el clamp está en `:611` `[VERIFICADO]` |
| "hoy es una columna muerta que sólo se puede escribir por SQL" | ✅ **nadie la escribe desde la app**: las únicas apariciones de `service.description` en `app/`, `lib/` y `components/` son **lecturas** `[VERIFICADO: grep]` |
| — | ⚠ **No está en el contrato:** `components/landing/services.tsx:74-77` **también** la renderiza (web de marca, con su propio `line-clamp-2`). El campo aparece en **dos** superficies públicas (ver D-8) |

**Dónde aterriza el campo** (ver el mapa de líneas): alta entre `:2736` y `:2737`; diálogo entre
`:2813` y `:2814`. Los dos shapes de estado (`:1147`, `:1433`) suman `description: string`, la
hidratación (`:1454-1463`) suma `description: s.description ?? ''`, el `insert` (`:1370`) y el
`payload` (`:1469-1483`) suman `description: <trim o null>`.

⚠ **El UI-SPEC pide explícitamente NO normalizar en `onBlur`** (a diferencia de duración y precio):
lo único que se normaliza es el guardado (`trim()` y `'' → null`).

---

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|---|---|---|---|
| Agrupar el catálogo por categoría | Un `reduce` en el componente | `groupCatalog()` de `@/lib/service-categories` | Ya resuelve identidad, "Otros" al final, conservación, categoría repetida y `name` nulo — 40+ casos verdes. Reimplementarlo es la clase exacta de deriva que el módulo existe para impedir |
| Ordenar por nombre / precio | `.sort((a,b)=>a.name.localeCompare(b.name))` | El comparador interno de `groupCatalog` | `localeCompare` a secas **tira** con `name` nulo, y el crash es posicional (`lib/service-categories.ts:136-143`). Además el locale `'es'` y `sensitivity:'base'` son **coherentes con el índice de la base**, no una preferencia |
| Rechazar nombres duplicados | Un `categories.some(c => c.name.toLowerCase() === …)` antes del insert | El índice `service_categories_name_uq` + mapear `23505` | Un chequeo en el cliente tiene carrera y no normaliza los blancos de borde igual que `btrim(name, E' \t\n\r')`. La base es la que decide; el cliente traduce |
| Rechazar nombres en blanco | Validación propia | El CHECK `service_categories_name_not_blank` + mapear `23514` | Idem. (Un `disabled={!name.trim()}` en el botón es UX, no la garantía) |
| Drag and drop | `@dnd-kit`, `react-beautiful-dnd` | `draggable` nativo, molde `pipeline-client.tsx:462` | D-07 del milestone + UI-SPEC: cero dependencias. Y ninguna librería resuelve mobile+teclado, que lo resuelven ▲/▼ y el diálogo |
| Colapsable / overlay / focus trap | `height` animado, overlay a mano | `<button aria-expanded aria-controls>` + render condicional; `Dialog` de `@base-ui/react` | El repo no mide alturas en JS en ningún lado; el `Dialog` ya trae portal, Escape, click-afuera y trap (`confirm-dialog.tsx:10-12` lo dice explícito) |
| Confirmación destructiva | Un `Dialog` propio | `ConfirmDialog` de `@/components/crm/confirm-dialog` (ya importado en `:27`) | Niveles, `risk`, `destructive`, `secondaryAction`, `onConfirmError` y el gotcha de no-`redirect()` ya resueltos |
| Píldoras activos/desactivados y su empty state | Markup propio | `ActiveTabs` / `ActiveTabsEmptyState` / `useActiveTabs` | Ya compartidos entre la lista de servicios y el manager de canchas |

**Key insight:** esta fase no tiene ni un problema nuevo. Todo lo que parece nuevo (arrastrar,
renumerar, traducir un error de constraint, colapsar una Card, confirmar un borrado con conteo) **ya
está resuelto y en producción** en este mismo repo. El riesgo de la fase no es técnico: es **pegarle
al lugar equivocado de un archivo de 3636 líneas**.

---

## Common Pitfalls

### Pitfall 1 — El upsert de categorías sin `name`

**Qué sale mal:** `.upsert([{id, business_id, sort_order}], { onConflict: 'id' })` devuelve `23502` y
**ningún** orden se guarda.
**Por qué pasa:** `name` es `NOT NULL` sin default y Postgres valida las constraints de la tupla
propuesta antes de resolver el conflicto (medido).
**Cómo evitarlo:** resolver D-1 en el plan (payload con `name`, o N updates).
**Señal temprana:** el toast de "no se pudo guardar el orden" aparece **siempre**, desde el primer
arrastre, en local.

### Pitfall 2 — Anclar un `Edit` en un número de línea del CONTEXT

**Qué sale mal:** el ejecutor edita `:2513` creyendo que es la tarjeta y toca el `<div className="space-y-2">`
o el comentario de estructura de G-04.
**Por qué pasa:** el CONTEXT cita `≈:2494-2710`; la tarjeta real arranca en `:2535`.
**Cómo evitarlo:** anclar por **texto único** (`{/* Alta de servicio */}`, `<CapacityModeFields`,
`ActiveTabs tab={serviceTab}`), no por número; usar la tabla de §"El archivo real, medido".
**Señal temprana:** el diff toca líneas de comentario.

### Pitfall 3 — Reordenar con swaps

**Qué sale mal:** huecos y empates en `sort_order`; con dos filas empatadas el orden lo decide el
`sort` estable sobre el orden de lectura, que cambia entre reloads.
**Por qué pasa:** el precedente más cercano del repo (`section-list.tsx`) **hace swap**.
**Cómo evitarlo:** renumerar `0..n-1` sobre la lista completa de hermanas (molde
`Organizador.tsx:125-134`), que es lo que CAT-03 pide con todas las letras.
**Señal temprana:** un `.update({ sort_order })` con **dos** llamadas por click.

### Pitfall 4 — Persistir orden al cambiar de modo

**Qué sale mal:** se rompe CAT-06, ya entregado y verificado, **para todos los negocios a la vez y en
silencio**; el arreglo manual del dueño no está guardado en ningún otro lado (reversibilidad
**one-way**).
**Por qué pasa:** parece "natural" materializar el orden alfabético al elegirlo.
**Cómo evitarlo:** el handler del `Select` escribe **una sola columna de `businesses`** y nada más.
**Señal temprana:** cualquier `sort_order` dentro del handler de cambio de modo.

### Pitfall 5 — Interpolar `error.message` en la pantalla

**Qué sale mal:** el dueño ve `duplicate key value violates unique constraint "service_categories_name_uq"`
— nombres de constraint y de columna filtrados a la UI (T-14-25 / T-13-09).
**Cómo evitarlo:** ramificar por `error.code`; `console.error` registra **el código**, nunca el
mensaje (molde `agenda-client.tsx:655`).
**Señal temprana:** un `toast.error(error.message)` en el diff.

### Pitfall 6 — Un fallo de escritura que deja la pantalla mintiendo

**Qué sale mal:** el estado optimista muestra un orden (o una categoría borrada) que la base no tiene.
**Cómo evitarlo:** D-10.2 — re-leer las hermanas de la base y pintar eso; y para el borrado, **no
sacar la fila de forma optimista** (el UI-SPEC E11 lo pide como backstop).
**Señal temprana:** un `setCategories(prev => prev.filter(...))` **antes** del `await`.

### Pitfall 7 — Helpers definidos dentro del componente

**Qué sale mal:** `CategoryRow`/`ServiceChip` declarados adentro cambian de identidad en cada render
⇒ React remonta el subárbol ⇒ el arrastre se corta a mitad de gesto.
**Cómo evitarlo:** definirlos a nivel de módulo (UI-SPEC #4; mismo motivo por el que
`canchas-manager.tsx:35` saca `isCanchaActive` afuera).

### Pitfall 8 — Estado de arrastre colgado

**Qué sale mal:** una fila queda en `border-dashed` para siempre porque se colapsó la Card (o cambió
el modo) en medio de un arrastre y `onDragEnd` nunca corrió sobre un nodo desmontado.
**Cómo evitarlo:** resetear `draggingId`/`dragOverId` en el handler del colapso y en el del cambio de
modo (UI-SPEC #6).

### Pitfall 9 — El `Select` de Base UI mostrando el value crudo

**Qué sale mal:** el trigger dice `custom` o un UUID en vez del label.
**Cómo evitarlo:** la forma de render-prop que el archivo ya usa `[VERIFICADO: settings-client.tsx:2423]`:
`<SelectValue>{(v: string | null) => MAPA[v ?? 'custom']}</SelectValue>`.

### Pitfall 10 — Bajar la prop nueva sólo a `/servicios` sin dejarlo escrito

**Qué sale mal (mañana, no hoy):** alguien agrega un trigger "Servicios" al `TabsList` de config o un
`keepMounted`, y la Card dice "Sin categorías" con categorías creadas.
**Cómo evitarlo:** default `[]` + un comentario en `Props` que diga **por qué** alcanza con
`/servicios` (el panel `services` sólo se monta con `view="servicios"`), para que el que rompa la
premisa lo lea.

---

## Code Examples

> Todos salen de código **ya en producción en este repo**. Son el registro a imitar, no una propuesta.

### El mutador de orden con re-read honesto (D-09 opción B + D-10)

```ts
// Molde: settings-client.tsx:1485 (update por tenant) + agenda-client.tsx:651-665 (rechazo honesto).
// Renumera la lista COMPLETA de hermanas — nunca swaps (CAT-03).
async function persistirOrdenServicios(idsEnOrden: string[]) {
  const resultados = await Promise.all(
    idsEnOrden.map((id, i) =>
      supabase.from('services')
        .update({ sort_order: i })
        .eq('id', id)
        .eq('business_id', business.id)   // defensa en profundidad: la RLS es la 2ª capa, no la única
        .select('id'),                    // 0 filas = la RLS filtró; NO es un éxito (molde :1384-1386)
    ),
  )
  const fallo = resultados.some(r => r.error || !r.data || r.data.length === 0)
  if (!fallo) return

  // D-10.2: lo que el dueño ve tiene que ser lo que está guardado.
  console.error('[catalogo/orden-servicios] rechazo:', resultados.find(r => r.error)?.error?.code)
  const { data } = await supabase.from('services')
    .select('*').eq('business_id', business.id)
    .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  if (data) setServices(data as Service[])
  toast.error('No se pudo guardar el orden. Volvimos a mostrar el que está guardado.')
}
```

### El alta de categoría con el rechazo de la base traducido (CAT-01)

```ts
// Molde: agenda-client.tsx:209-232 (clasificar por código) + settings-client.tsx:1393-1398.
async function crearCategoria(nombreCrudo: string) {
  const name = nombreCrudo.trim()            // el btrim de la 079 espeja esto
  if (!name) return
  setCreando(true)
  const { data, error } = await supabase.from('service_categories')
    .insert({ business_id: business.id, name, sort_order: categories.length })
    .select().single()
  setCreando(false)
  if (error) {
    // NUNCA error.message en pantalla (T-14-25 / T-13-09). Se registra el CÓDIGO.
    console.error('[catalogo/alta-categoria] rechazo:', error.code)
    if (error.code === '23505') { setErrorInline('Ya tenés una categoría con ese nombre.'); return }
    if (error.code === '23514') { setErrorInline('Escribí un nombre para la categoría.'); return }
    toast.error('No se pudo guardar la categoría. Probá de nuevo.')
    return                                   // el estado local NO se toca
  }
  setCategories(prev => [...prev, data as ServiceCategory])
  setErrorInline(null)
  toast.success('Categoría creada')
}
```

### El único escritor de `services.category_id` (D-07, restricción dura)

```ts
// Los TRES call sites (Select del form, arrastre, diálogo "Mover …") llaman a ESTA función.
// La FK compuesta services_category_same_tenant garantiza en la BASE que la categoría sea del
// mismo negocio; el .eq('business_id') es la segunda capa.
async function asignarCategoria(serviceId: string, categoryId: string | null): Promise<boolean> {
  const { data, error } = await supabase.from('services')
    .update({ category_id: categoryId })
    .eq('id', serviceId)
    .eq('business_id', business.id)
    .select('id')
  if (error || !data || data.length === 0) {
    console.error('[catalogo/asignar] rechazo:', error?.code ?? 'cero filas')
    return false
  }
  setServices(prev => prev.map(s => s.id === serviceId ? { ...s, category_id: categoryId } : s))
  return true
}
```

### Los dos campos nuevos en el form (CAT-11 + CAT-02)

```tsx
{/* Va DESPUÉS del precio y ANTES de <CapacityModeFields>, en las dos superficies.
    El campo Categoría no se renderiza si no hay categorías creadas (UI-SPEC E9). */}
{categories.length > 0 && (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">Categoría (opcional)</Label>
    <Select value={form.category_id ?? SIN_CATEGORIA} onValueChange={v => setForm(f => ({ ...f, category_id: v === SIN_CATEGORIA ? null : v }))}>
      {/* Base UI Select.Value muestra el value crudo → render-prop, molde :2423 */}
      <SelectTrigger className="w-full"><SelectValue>{(v: string | null) => labelDeCategoria(v)}</SelectValue></SelectTrigger>
      <SelectContent>
        <SelectItem value={SIN_CATEGORIA}>Sin categoría</SelectItem>
        {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
)}
<div className="space-y-1">
  <Label htmlFor={descId} className="text-xs text-muted-foreground">Descripción corta (opcional)</Label>
  <Textarea id={descId} rows={2} maxLength={120} value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            aria-describedby={`${descId}-help`} placeholder="Ej. Incluye lavado, corte y peinado" />
  {/* Sin normalización en onBlur (a diferencia de duración y precio): sólo se normaliza al guardar. */}
</div>
```

---

## State of the Art

| Enfoque viejo | Enfoque vigente | Cuándo cambió | Qué implica |
|---|---|---|---|
| El orden del catálogo lo daba `created_at` (`servicios/page.tsx:22`) | `sort_order` primero, `created_at` como desempate | migr. 078 (aplicada a prod 2026-09-15) | El RSC tiene que cambiar el `order`, o el orden manual no sobrevive a un reload |
| `service_categories_name_uq` sobre `(business_id, lower(name))` | sobre `(business_id, lower(btrim(name, E' \t\n\r')))` + CHECK de no-blanco | migr. **079** | `'Color '` y `' Color'` ya no entran; hay **dos** códigos que traducir (`23505` y `23514`), no uno |
| Reordenar = swap con la vecina (`section-list.tsx`) | Renumerar la lista completa | CAT-03 de este milestone | El precedente del repo es un contraejemplo parcial: se porta el botón, no el mutador |
| Reordenar con `Promise.all` de N updates sin filtro de tenant (`forjo-tiendas/acciones.ts:186`) | Un mutador por eje con `.eq('business_id')` siempre | D-10.1 | Es el cambio explícito respecto del repo hermano |
| `services.description` escribible sólo por SQL | Campo del panel con tope duro de 120 | esta fase | La columna sigue **sin límite en la base**: el 120 es un contrato de la app |

**Deprecado / a no copiar:**

- `opacity-50` como señal de "arrastrando" (`pipeline-client.tsx:470`): el UI-SPEC lo prohíbe
  (baja el contraste por debajo de AA) y manda `border-dashed`.
- `GRANT ALL … TO anon` sobre vistas (molde de las migr. 059/061/071, desarmado por la 072). No aplica
  a esta fase porque no toca vistas, pero es la trampa de copia-y-pega del vecindario.
- `redirect()` dentro de una acción de `ConfirmDialog`: tira un toast espurio por `NEXT_REDIRECT`.

---

## Environment Availability

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|---|---|---|---|---|
| Node + npm | build, tests, typecheck | ✓ | `C:\Program Files\nodejs` | — |
| Supabase local (Docker) | `service-categories-model.test.ts` y cualquier probe SQL | ✓ | contenedor `supabase_db_forjo-app` **healthy**, Kong en `127.0.0.1:54321` | Los tests DB se **skipean** solos (`describe.skipIf(!hasSupabaseCreds)`) — el fallback silencioso es un riesgo, ver abajo |
| Docker Desktop | ídem | ✓ | `…/DockerDesktop/resources/bin` | — |
| `vitest` | suite | ✓ | `^4.1.9` | — |
| `tsc` | typecheck | ✓ | `^5`, `./node_modules/.bin/tsc` | — |
| Migraciones 078/079 en el PG local | los probes y el test model | ✓ | verificado con `\d public.service_categories` | `npx supabase db reset` replaya el baseline |
| `../forjo-tiendas` (repo hermano) | portar la forma del organizador | ✓ | `C:/Users/franc/Desktop/Forjo Studio/forjo-tiendas`, **leído esta sesión** | — |

**Sin dependencias faltantes.** Nada bloquea la ejecución.

### Comandos verificados en esta máquina (2026-09-15)

| Comando | Resultado medido |
|---|---|
| `npx vitest run` | **92 test files · 1209 passed · 4 expected fail · 1 skipped (1214) · 68s** — **la línea de base de esta fase** (la Phase 22 verificaba contra un piso de 1163) |
| `./node_modules/.bin/tsc --noEmit` | **exit 0**, sin salida |
| `npx vitest run test/service-categories.test.ts` | forma usada por los planes de la Phase 22, sigue válida |
| `docker exec supabase_db_forjo-app psql -U postgres -d postgres -c "…"` | ✓ |

⚠ **Trampa de la shell de esta sesión (anotar en el plan si el ejecutor usa Bash y no PowerShell):**
el `PATH` heredado viene con separadores `;` de Windows, así que en Git Bash **`node`, `cat`, `grep`,
`docker` y `psql` no resuelven** hasta exportar un `PATH` POSIX. Además `docker exec … -f /tmp/x.sql`
necesita `MSYS_NO_PATHCONV=1` o MSYS traduce la ruta a `C:/…/Temp`. Los comandos de la tabla se
midieron con:

```bash
export PATH="/c/Program Files/nodejs:/c/Program Files/Git/usr/bin:/c/Users/franc/AppData/Local/Programs/DockerDesktop/resources/bin:/c/WINDOWS/system32:$PATH"
export MSYS_NO_PATHCONV=1
```

⚠ **`describe.skipIf(!hasSupabaseCreds)` es un verde falso en potencia**: si el entorno no tiene las
credenciales, `service-categories-model.test.ts` **se saltea y la suite igual pasa**. Todo criterio de
aceptación que dependa de un test DB tiene que asertar **`Tests N passed` sin `skipped`**, como ya lo
hacen los planes de la Phase 22.

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` `[VERIFICADO: .planning/config.json]`.

### Categorías ASVS aplicables

| Categoría ASVS | Aplica | Control estándar en esta fase |
|---|---|---|
| V2 Authentication | no | La fase no toca auth; el RSC ya hace `auth.getUser()` → `redirect('/login')` (`servicios/page.tsx:8-9`) |
| V3 Session Management | no | La sesión la refresca `proxy.ts`; no se toca |
| **V4 Access Control** | **sí** | **RLS de `service_categories` (4 policies por `owner_id`) + FK compuesta `services_category_same_tenant` + `.eq('business_id', business.id)` en las 5 escrituras y en la lectura nueva.** Es el control central de la fase |
| **V5 Input Validation** | **sí** | El nombre de categoría lo valida **la base** (índice normalizado + CHECK de no-blanco). La descripción se acota con `maxLength={120}` en el cliente — ⚠ **sin backstop en la base** (ver abajo). El `category_id` lo valida la FK compuesta |
| V6 Cryptography | no | Sin secretos, sin tokens, sin hashing en la fase |
| **V7 Error Handling / Logging** | **sí** | `error.code` al `console.error`, **nunca** `error.message` a la pantalla (T-14-25 / T-13-09). El molde está en `agenda-client.tsx:655` |
| **V14 Data Protection / Output Encoding** | **sí** | `name` y `description` son texto del dueño que termina renderizado para un **anónimo** (Phase 24 + la landing). Se interpolan en JSX (auto-escape de React); **prohibido `dangerouslySetInnerHTML`** (T-22-10, declarado en `lib/service-categories.ts:28-30`) |

### Amenazas conocidas para este stack

| Patrón | STRIDE | Mitigación estándar |
|---|---|---|
| Renumerar filas de **otro** negocio pasando ids ajenos | Tampering | RLS (`update USING … WITH CHECK` por `owner_id`) + `.eq('business_id')` en el mutador único (D-10.1). Un update de 0 filas **no es éxito** (`.select('id')` + chequeo de longitud) |
| Asignar a un servicio la categoría de otro negocio | Tampering | **FK compuesta** `services_category_same_tenant` → `23503`. Garantía declarativa, no confiada al predicado de la policy (T-22-04) |
| Forjar `business_id` en el insert/upsert de categoría | Spoofing / Tampering | Policy `insert` con `WITH CHECK` por `owner_id`; el `business_id` sale de la prop server-side, nunca del cliente |
| Filtrar nombres de constraint/columna al dueño | Information Disclosure | Copy propia por `code`; jamás `error.message` en pantalla |
| XSS por el nombre de categoría en la página pública | Tampering / XSS | Interpolación en JSX; el módulo puro propaga `title` como `string` plano y nunca construye marcado |
| Un `description` largo o con marcado roto llegando al público | Tampering | `maxLength={120}` + `line-clamp-2`. ⚠ **`maxLength` es un control de cliente**: un `UPDATE` directo por API con 5000 caracteres entra igual, porque la columna no tiene límite ni CHECK. El daño es cosmético (el clamp recorta), no de seguridad, pero el plan debería decirlo en vez de dar por sentado que el 120 está garantizado |
| Escritura anónima por una vista auto-actualizable | Elevation of Privilege | Cerrado por la migr. 072 y re-emitido por la 078 (`REVOKE ALL` + `GRANT SELECT`). Esta fase **no toca vistas**, así que no lo puede reabrir |
| Doble submit / escritura concurrente | Tampering | `disabled` mientras la escritura está en vuelo (molde `savingNewSvc`, `savingEditSvc`), y el `savingCapacityIds` como **conjunto** cuando hay N controles en pantalla (`settings-client.tsx:1446` explica por qué un id suelto no alcanza) |

---

## Assumptions Log

| # | Claim | Sección | Riesgo si está mal |
|---|---|---|---|
| A1 | La forma del objeto de error que `supabase-js` entrega es `{ code, message, details, hint }`, con el nombre del constraint dentro de `message` y sin campo dedicado | §"Los dos códigos de rechazo" | Bajo. El **código** está verificado por un test verde del repo (`:221`, `:234`), que es lo único sobre lo que el panel ramifica. Si `details`/`hint` tuvieran otra forma, no cambia ninguna decisión |
| A2 | Tailwind v4 / `@base-ui/react` no interfieren con `draggable` en el organizador (no se probó: el componente todavía no existe) | §"`draggable` bajo React 19 + Next 16" | Bajo. El pipeline del CRM arrastra en producción con el mismo setup; si apareciera un `touch-action`/`user-select` conflictivo, se ve en el primer UAT visual |
| A3 | Todos los `sort_order` de producción valen `0`, así que cambiar el `order` del RSC no mueve el catálogo de nadie | §"El contrato con el read-path" | Medio si es falso — sería un cambio visible para negocios reales. Pero se apoya en que la 078 declaró **cero backfill** como invariante y su runbook lo verifica; y como nada escribió `sort_order` desde entonces (esta fase es la primera), la premisa se sostiene. **Confirmable en 1 query contra prod:** `select count(*) from services where sort_order <> 0;` → debe dar 0 |
| A4 | `service_categories` está vacía en producción (ningún negocio creó categorías, porque no había panel) | §"Desajustes" D-1 y la UAT | Bajo. Lo garantiza que esta fase es la primera superficie que escribe la tabla. Misma query de control: `select count(*) from service_categories;` |
| A5 | El repo hermano `forjo-tiendas` no va a cambiar durante la ejecución de la fase | §"El patrón de reordenar" | Nulo: se porta la **forma**, ya transcrita en este documento; no hay dependencia viva |

---

## Open Questions

1. **D-1 — el `23502` del upsert de categorías.** *(La única que bloquea el diseño de un plan.)*
   - **Qué sabemos:** `.upsert` sin `name` falla con `23502`, medido. Las dos salidas (payload con
     `name` / N updates) respetan la letra de D-10.
   - **Qué falta:** elegir. Es una decisión del planner, no del ejecutor: cambia la firma del mutador
     y el criterio de aceptación.
   - **Recomendación:** **opción B (N `.update({ sort_order })`)**, porque unifica los dos ejes en un
     solo mutador —que es literalmente lo que D-10.1 pide— y hace que **ningún dato del dueño viaje
     en una operación de reordenamiento**, que es el principio que D-09 escribió para `services`. La
     atomicidad que se pierde ya está calificada en D-09 como cosmética y auto-reparable, y D-10.2 es
     la red que la cubre. Si el planner elige A, tiene que dejar escrito el trade-off del renombrado
     concurrente.

2. **¿Se extrae la renumeración a `lib/`?**
   - **Qué sabemos:** la regla de agrupar está en `lib/` y testeada; la de **renumerar** no existe.
   - **Qué falta:** decidir si `renumber()` / `moveWithinList()` viven en un módulo puro.
   - **Recomendación:** sí. Son 15 líneas, dan un criterio de aceptación **automatizable** (hoy la
     única verificación posible es visual) y siguen el precedente de `staff-services` /
     `time-block-services` / `service-categories`.

3. **El copy de la ayuda de la descripción** (D-8): dice "tu página de reservas" y el campo también
   sale en la web de marca. ¿Se amplía la frase o se acepta la imprecisión?
   - **Recomendación:** decisión de producto de bajo costo; si se amplía, que no se vuelva una frase
     de dos renglones en una ayuda de `text-xs`. Anotarlo y que lo cierre la UAT.

4. **Backstop del tope de 120** (§Security): la base no lo sostiene. ¿Se acepta como control de
   cliente?
   - **Recomendación:** aceptarlo y **escribirlo** (el daño de un texto largo es cosmético: el
     `line-clamp-2` recorta). Poner un CHECK requeriría la migr. 080, que D-09 descartó.

---

## Sources

### Primary (HIGH confidence) — medido esta sesión

- `supabase/migrations/078_service_categories.sql` y `079_service_categories_name_normalized.sql` — leídas enteras
- `lib/service-categories.ts` (332 líneas) y `lib/types.ts:200-284` — leídas
- `app/(dashboard)/settings/settings-client.tsx` — regiones `:858-1010`, `:1140-1501`, `:2125-2175`, `:2405-2450`, `:2476-2860`, `:3556-3636`
- `app/(dashboard)/servicios/page.tsx`, `app/(dashboard)/settings/page.tsx` — enteras
- `components/dashboard/canchas-manager.tsx` (435 líneas) — entera
- `app/(dashboard)/web/_sections/section-list.tsx` (232 líneas) — entera
- `app/(crm)/admin/pipeline/pipeline-client.tsx:92-179, 252-306, 439-470`
- `app/(dashboard)/agenda/agenda-client.tsx:185-240, 600-700, 770-826`
- `components/ui/tabs.tsx`, `components/crm/confirm-dialog.tsx:1-70`, `components/ui/select.tsx`
- `test/service-categories.test.ts`, `test/service-categories-model.test.ts`
- `node_modules/@base-ui/react/tabs/panel/TabsPanel.js:37,99,110` (`keepMounted = false`)
- **Postgres local** (`docker exec supabase_db_forjo-app psql`): `\d public.service_categories`,
  `\d public.services`, `information_schema.columns`, y **dos probes en transacción revertida**
  (duplicado normalizado ⇒ `23505`; upsert sin `name` ⇒ `23502`)
- **`npx vitest run`** (1209 passed) y **`./node_modules/.bin/tsc --noEmit`** (exit 0)
- `../forjo-tiendas/app/(consola)/(panel)/categorias/Organizador.tsx:60-199, 250-320, 388-422` y
  `acciones.ts:165-205` — **repo hermano alcanzable y leído**

### Secondary (MEDIUM confidence)

- `.planning/workstreams/motor-reservas/phases/23-…/23-CONTEXT.md` y `23-UI-SPEC.md` (contratos LOCKED)
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md`, `STATE.md`
- `.claude/CLAUDE.md`, `AGENTS.md`, `.claude/skills/supabase-multitenant-rls/SKILL.md`
- Memoria del proyecto: `migracion-078-catalogo-en-prod.md` (078/079 aplicadas a prod; próxima = 080)

### Tertiary (LOW confidence)

- Comportamiento de `dataTransfer` en modo protegido durante `dragover` — HTML Living Standard, no
  medido en este repo (el repo lo esquiva guardando el id en `useState`, que sí está verificado)

---

## Metadata

**Confidence breakdown:**

- **Standard stack:** HIGH — cero paquetes nuevos; todo verificado en `package.json` y en el código
- **Arquitectura / ubicación del código:** HIGH — todos los números de línea releídos esta sesión, con
  8 desajustes documentados contra el contrato
- **Señales de rechazo de la base:** HIGH — `23505`, `23514` y `23502` **medidos** contra el mismo
  motor Postgres, y los dos primeros además aseverados por un test verde a nivel `supabase-js`
- **Patrón de reordenar:** HIGH — tres precedentes leídos (dos in-repo, uno en el repo hermano)
- **Comandos de verificación:** HIGH — ejecutados en esta máquina, con la trampa del `PATH` anotada
- **Gotchas de `draggable` bajo Tailwind v4 / base-ui:** MEDIUM — inferidos del pipeline en producción,
  no probados sobre el componente nuevo (A2)

**Research date:** 2026-09-15
**Valid until:** ~2026-10-15 (30 días). Se invalida antes si: se aplica cualquier migración nueva sobre
`services` / `service_categories`, o si `settings-client.tsx` cambia de tamaño — en ese caso **todos
los números de línea de §"El archivo real, medido" hay que volver a medirlos**.
