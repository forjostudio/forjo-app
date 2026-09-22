# Phase 24: El catálogo que el cliente lee — Research

**Researched:** 2026-09-22
**Domain:** Render de un catálogo agrupado en un Client Component de Next 16 / React 19, alimentado
por una lectura RSC de vistas acotadas de Supabase. Cero dependencias nuevas, cero migraciones.
**Confidence:** HIGH (todo lo que decide el plan se midió leyendo el repo; lo único LOW está aislado
en `## Open Questions`)

---

<user_constraints>
## User Constraints (de 24-CONTEXT.md)

### Locked Decisions

**Títulos de categoría**

- **D-01:** Título **pelado**: solo el nombre en negrita, más chico que el `h2` de "Elegí tu servicio", con aire arriba para separar grupos. **Sin** línea divisoria y **sin** contador de servicios. *Motivo:* los títulos son un nivel de jerarquía nuevo en una pantalla que hoy solo tiene un `h2`, y no pueden robarle peso visual a las tarjetas, que son lo único clickeable. El contador además abriría una pregunta que nadie quiere responder: si cuenta o no los servicios deshabilitados.
- **D-02:** El título **scrollea con el contenido**. NO es sticky. *Motivo:* es lo que la pantalla hace hoy; un sticky obliga a resolver contra qué se pega (el header del negocio ya ocupa arriba) y suma z-index a una región cuyas capas ya están resueltas y bajo contrato — el pseudo-elemento del botón de selección y el `isolate` de la tarjeta (G-23-6, Phase 23).
- **D-03:** El grupo **"Otros" se ve idéntico a cualquier categoría real**: mismo título, mismo peso, mismas tarjetas. *Motivo:* el cliente no sabe ni le importa que al dueño le faltó clasificarlos. Un tratamiento más apagado degrada visualmente servicios que se venden igual, y CAT-09 existe precisamente para que un servicio sin categoría no se degrade.
- **D-04:** Jerarquía semántica: los títulos de grupo van **un nivel debajo** del `h2` existente ("Elegí tu servicio"), sin saltar niveles. *Nota:* decidido por convención del proyecto (accesibilidad no negociable), no por preferencia del usuario — el planner elige el tag concreto.

**La tarjeta horizontal en desktop**

- **D-05:** Se **conserva la fila que ya existe** —nombre a la izquierda, precio y duración apilados a la derecha— y solo se estira: desaparece el `sm:grid-cols-2` y queda **una columna**. *Motivo:* es el cambio más chico posible; la fila ya existe, ya está centrada verticalmente (`items-center`) y ya funciona así en mobile. Con el ancho extra el nombre largo deja de partirse solo, que es literalmente lo que pide CAT-10. — **Reversibility:** reversible — es una clase de Tailwind en un solo `div`.
- **D-06:** El paso 1 **sigue en `max-w-lg`** (512px). No se ensancha ni el paso 1 solo ni el wizard completo. *Dato medido durante la discusión:* el wizard entero vive en `max-w-lg mx-auto px-6` (`booking-client.tsx:551`), así que "horizontal a lo ancho" significa pasar de dos columnas de **~194px útiles** a una de **~432px** — no tarjetas cruzando el viewport. *Motivo:* ensanchar solo el paso 1 haría que el wizard cambie de ancho al elegir un servicio (se lee como un salto); ensanchar los cuatro pasos obligaría a recalibrar calendario, horarios y confirmación, que es rediseñar el booking y está fuera de alcance.
- **D-07:** **Mobile no cambia nada.** *Motivo:* hoy la grilla ya es `grid-cols-1` abajo de `sm:`, así que el cambio es literalmente quitar el modificador `sm:` — mobile queda byte-idéntico, no "parecido".
- **D-08:** El "Ver más" de la descripción **no se toca**: sigue apareciendo solo si el texto desborda **medido** (`scrollHeight > clientHeight`, `ServiceDescription`). *Consecuencia esperada, no un bug:* con ~432px de ancho una descripción de 120 caracteres entra sin desbordar, así que en desktop el toggle prácticamente no va a aparecer; en mobile a 375px sigue apareciendo como hoy. Nada de volver a un recorte por cantidad de renglones fija.

**El orden**

- **D-09:** El orden de la pantalla pública es **exactamente el que el dueño configuró en el panel**, en los dos ejes y con los tres modos: categorías (alfabético · personalizado) y servicios (alfabético · por precio · personalizado). Los dos valores salen de `public_businesses` (`category_sort_mode`, `service_sort_mode`) y se pasan a `groupCatalog`. *Confirmado explícitamente por el usuario al cierre de la discusión.*
- **D-10:** Los modos se pasan a `groupCatalog` **campo por campo con `??`**, NUNCA con spread (`{ ...DEFAULT_SORT_MODES, ...modes }`). *Motivo:* está escrito y explicado en `lib/service-categories.ts:270-280` — en `lib/types.ts` las dos columnas son opcionales, y el spread NO cae al default cuando la clave existe con valor `undefined`: la pisa. Hoy el resultado coincidiría con `'custom'` **por casualidad**, y el día que cambie un default sería un orden equivocado para todos los negocios, en silencio. Es la clase exacta de cambio que CAT-07 existe para impedir.

**Catálogo largo**

- **D-11:** **Nada.** Sin índice de categorías, sin grupos colapsables, sin buscador: el paso 1 se scrollea.

**Grupos donde nada se puede reservar**

- **D-12:** Una categoría con **todos** sus servicios deshabilitados se pinta **igual que cualquier otra**: su título normal y cada tarjeta con su motivo a la vista ("Sin horarios disponibles" / "Sin profesional disponible"), como ya hace hoy. Sin aviso en el título y sin mandar el grupo al final.

**El preview del panel (`/web`)**

- **D-13:** El preview de `/web` tiene que mostrar el catálogo **como lo va a ver el cliente**: agrupado bajo títulos y con el ancho nuevo, no la lista plana del fallback. En concreto, ese call site **recibe las categorías y los modos de orden**. *Pedido explícito del usuario al cierre.*
- **D-14:** **No hace falta escalar nada.** `BookingClient` lleva su propio `max-w-lg mx-auto`, así que montado dentro del contenedor del panel (`max-w-[1400px]`) ya se renderiza al ancho real, 512px centrados.
- **D-15:** El `?? []` **se mantiene como red de seguridad** para el call site que no pasa la prop. Ante el dato ausente el default es la lista plana, **nunca un catálogo vacío**. D-13 y D-15 conviven: no son alternativas.

### Claude's Discretion

- El tag HTML concreto de los títulos de grupo, el espaciado exacto entre grupos y las clases de Tailwind: los resuelve el planner respetando D-01 a D-04 y los tokens del proyecto.
- Dónde exactamente cae la lectura de categorías dentro del `Promise.all` de `app/[slug]/page.tsx`.

### Deferred Ideas (FUERA DE ALCANCE)

- **Índice de categorías arriba del paso 1** (chips con los nombres que saltan a su grupo). Se reevalúa cuando exista un negocio real con muchas categorías — no antes.
- **Grupos colapsables.** Si arrancan abiertos no cambia nada; si arrancan cerrados el catálogo arranca vacío y los servicios quedan detrás de un click que nadie pidió (roza el espíritu de CAT-09).
- **Aviso de "sin disponibilidad" en el título del grupo.** Duplicaría en el título un motivo que cada tarjeta ya explica mejor.
- De REQUIREMENTS.md "Fuera de alcance": **subcategorías**, **precio en la categoría**, **la categoría como paso del funnel**, **modo de orden por categoría**, **ocultar servicios con la categoría**.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descripción | Soporte de esta investigación |
|----|-------------|-------------------------------|
| **CAT-08** | Con al menos una categoría creada, el cliente ve los servicios **agrupados bajo títulos**, en el orden que el dueño definió. El funnel no gana pasos. | §"El seam de render" (map anidado, cero duplicación de JSX) + §"La lectura" (cómo entra `public_service_categories` al `Promise.all`) + §"El `??`-per-field" (la forma exacta de la llamada a `groupCatalog`). El funnel no se toca: el cambio vive **adentro** del bloque `{step === 1 && ...}` (`booking-client.tsx:564-666`). |
| **CAT-09** | Un servicio sin categoría **siempre** se puede reservar; con categorías aparece al final bajo "Otros". | Lo entrega `groupCatalog` por invariante de conservación (`lib/service-categories.ts:258-264`, Regla 3 en `:340-346`), ya testeado. Esta fase solo debe **no romperlo**: §"Common Pitfalls" P-1 y P-2. |
| **CAT-10** | En desktop las tarjetas son **horizontales a lo ancho**; el nombre largo deja de partirse. | §"Architecture Patterns / Patrón 2" — quitar `sm:grid-cols-2` de `booking-client.tsx:567`. Aritmética del ancho en §"Standard Stack / mediciones". |
</phase_requirements>

---

## Summary

La fase es **casi toda cableado**: la regla de negocio ya está escrita, testeada y en producción
(`lib/service-categories.ts`), la vista acotada ya existe y ya le da SELECT a `anon`
(migr. `078_service_categories.sql:322-340`), y las dos columnas de orden ya viajan por
`public_businesses` (`078:381-406`). Lo que falta son **cuatro ediciones quirúrgicas**: una lectura
más en cada uno de los dos RSC que montan `BookingClient`, dos columnas más en cada uno de sus dos
`select` de negocio, una prop opcional nueva en `BookingClient`, y un `map` anidado sobre la grilla
del paso 1 menos el modificador `sm:`.

Tres hallazgos cambian el plan respecto de lo que el brief asumía, y los tres **achican** el trabajo:

1. **Hay DOS call sites de `BookingClient`, no tres.** `components/landing/landing-renderer.tsx` ya
   **no monta** `BookingClient`: el quick 260913-3tv borró su fallback interno e hizo `bookingSlot`
   requerido (`landing-renderer.tsx:71-78`). El `grep` sobre todo el repo da exactamente dos
   ocurrencias de `<BookingClient`: `app/[slug]/page.tsx:168` y `app/(dashboard)/web/page.tsx:182`.
   Consecuencia directa: el camino del landing recibe las categorías **gratis**, porque el
   `bookingNode` que arma `app/[slug]/page.tsx:159-178` es el mismo que viaja como `bookingSlot` a
   `<LandingRenderer>` (`:217`). El Success Criterion 5 se cumple por construcción, y el `?? []`
   pasa de ser el sostén de un call site vivo a ser **defensa en profundidad** (el tipo opcional
   sigue siendo el mecanismo — ver §"El `?? []`").
2. **Los modos de orden NO necesitan props nuevas.** `PublicBusiness = Omit<Business,
   'notification_email'>` (`lib/types.ts:141`) ya incluye `category_sort_mode?` y
   `service_sort_mode?` (`lib/types.ts:66,68`), y `business` ya es prop de `BookingClient`
   (`booking-client.tsx:24,71`). Lo que falta es que los **dos `select` los pidan**: hoy ni
   `app/[slug]/page.tsx:62` ni `app/(dashboard)/web/page.tsx:49` los listan, así que llegan
   `undefined` y `groupCatalog` cae a `'custom'` campo por campo. Esa es, textualmente, la
   "casualidad" que documenta `lib/service-categories.ts:274-283`.
3. **El tipo de la prop nueva importa y no es el obvio.** `ServiceCategory` (`lib/types.ts:218-225`)
   exige `created_at: string`, y `public_service_categories` **deliberadamente no lo expone**
   (migr. `078:307,322-327`). Tipar la prop como `ServiceCategory[]` obligaría a un cast mentiroso
   en la página pública. El tipo correcto es `CatalogCategory` (`lib/service-categories.ts:99-103`),
   que la fila de la vista satisface tal cual y que `ServiceCategory` también satisface
   estructuralmente (así el call site del panel entra sin cast).

**Primary recommendation:** una prop opcional nueva (`serviceCategories?: CatalogCategory[]`), dos
columnas más en los dos `select` de negocio, una lectura más en cada `Promise.all`, y en el JSX un
`map` anidado que deja la tarjeta **inline donde ya está** — sin extraer componente, sin duplicar el
bloque G-23-6 y sin tocar la aritmética de cobertura.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Filtrar categorías por tenant | Database / Storage (RLS + vista acotada) | Frontend Server (`.eq('business_id', …)`) | `public_service_categories` es DEFINER sin `security_invoker` (migr. `078:311-313`); el aislamiento efectivo lo pone el `.eq` del RSC. Las dos capas, como el resto del `Promise.all`. |
| Leer el catálogo público | Frontend Server (RSC `app/[slug]/page.tsx`) | — | Molde ya establecido: todas las lecturas públicas viven en el `Promise.all` de `:75-110`, ninguna en el cliente. |
| Leer el catálogo del preview | Frontend Server (RSC `app/(dashboard)/web/page.tsx`) | — | Doctrina explícita de `lib/preview-booking.ts:19-31`: el dashboard lee **tablas base** con la sesión del dueño (RLS + `.eq`), nunca las vistas DEFINER. |
| Agrupar y ordenar | Módulo puro (`lib/service-categories.ts`) | — | Fuente única de la regla para el panel y el público (cabecera `:1-9`). Esta fase la **consume**. |
| Pintar títulos y tarjetas | Browser / Client (`booking-client.tsx`) | — | Es Client Component (`'use client'`, `:1`) por el estado del wizard. Solo itera `CatalogGroup[]`. |
| Escapar el `name` del dueño | Browser / Client (auto-escape de React) | — | T-23-06 / T-23-10: interpolación JSX, jamás `dangerouslySetInnerHTML`. |

---

## Standard Stack

### Core (todo YA instalado — cero `npm install` en esta fase)

| Librería | Versión | Propósito | Por qué es la estándar acá |
|---|---|---|---|
| `next` | `16.2.7` | App Router, RSC, `force-dynamic` | Ya es el framework del repo. `Promise.all` sigue siendo la guía oficial de fetch paralelo en RSC. [VERIFIED: `node -e "require('next/package.json').version"` → `16.2.7`; `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md:451-505`] |
| `react` / `react-dom` | `19.2.4` | Render + `renderToStaticMarkup` para tests | [VERIFIED: `node -e "require('react/package.json').version"` → `19.2.4`] |
| `@supabase/supabase-js` | `^2.106.2` | Lectura de las vistas/tablas | Ya en uso en los dos RSC. |
| Tailwind CSS | `v4` (CSS-first, sin `tailwind.config`) | La única clase que se toca es `sm:grid-cols-2` | `app/globals.css:17-58` solo redefine colores, fuentes y radios: **la escala de spacing y los `--container-*` quedan en el default de Tailwind v4**. [VERIFIED: `grep -n -- "--spacing\|--container-lg" app/globals.css` → sin resultados] |
| `lib/service-categories.ts` | in-repo | `groupCatalog`, `sortCategories`, `CatalogGroup`, `CatalogCategory`, `OTHER_GROUP_TITLE` | Fuente única, ya testeada. |

### Mediciones del ancho (la aritmética de D-05/D-06)

Derivada de las clases reales + la escala default de Tailwind v4 (`max-w-lg` = 32rem = 512px,
`px-6` = 24px, `gap-3` = 12px, `p-4` = 16px), sobre `booking-client.tsx:551` (`max-w-lg mx-auto
px-6`), `:567` (`grid grid-cols-1 sm:grid-cols-2 gap-3`) y `:590` (`p-4` de la tarjeta):

| | Hoy (`sm:grid-cols-2`) | Después (`grid-cols-1`) |
|---|---|---|
| Ancho del contenedor | 512 − 24 − 24 = **464px** | 464px |
| Ancho de columna | (464 − 12) / 2 = **226px** | **464px** |
| Ancho útil dentro de la tarjeta | 226 − 32 = **194px** | 464 − 32 = **432px** |

[VERIFIED: `app/[slug]/booking-client.tsx:551,567,590` + escala default Tailwind v4 confirmada por
la ausencia de override en `app/globals.css:17-58`] — coincide exactamente con los números que D-06
declara.

`sm:` = 40rem = 640px en Tailwind v4, así que **abajo de 640px la grilla ya es de una columna hoy**:
quitar el modificador `sm:` no cambia un píxel en mobile. Esto es lo que hace que D-07 sea una
propiedad y no una promesa. [ASSUMED: el breakpoint `sm` = 640px es el default de Tailwind, no se
verificó contra el CSS generado; el repo no lo redefine.]

### Alternativas consideradas

| En vez de | Se podría usar | Trade-off |
|---|---|---|
| `grid grid-cols-1 gap-3` | `space-y-3` | Visualmente idéntico con una sola columna, pero es un diff más grande sobre una línea bajo contrato y rompe la simetría con el resto del wizard. **No.** |
| Prop nueva `serviceCategories` | Pasar `CatalogGroup[]` ya agrupado desde el RSC | Mueve la llamada a `groupCatalog` al servidor y evita re-ejecutarla en cada render del cliente, pero **rompe D-13/D-15**: el preview tendría que duplicar la llamada, y el contrato "el dato ausente degrada" dejaría de vivir en un `?? []` reconocible. Además el molde del repo (`timeBlockServices`, `professionalServices`) es pasar el dato crudo y resolver la regla en el cliente. **No.** |
| Extraer `<ServiceCard>` a un componente propio | Map anidado inline | Ver §"Architecture Patterns / Patrón 1". **No en esta fase.** |

### Package Legitimacy Audit

**No aplica: esta fase no instala ningún paquete.** Cero dependencias nuevas, cero `npm install`.
La propia regla de UI de la Phase 23 lo declara (`23-UI-SPEC.md:60`: *"Drag-and-drop: **ninguna
librería**"*), y el milestone entero se construyó sin sumar dependencias.

- Paquetes removidos por veredicto `[SLOP]`: ninguno.
- Paquetes marcados `[SUS]`: ninguno.

---

## Architecture Patterns

### Diagrama del flujo de datos

```text
                      ┌──────────────────── Postgres (Supabase) ────────────────────┐
                      │  services · service_categories · businesses                 │
                      │  RLS por tenant (078:158-189)                               │
                      └───────┬─────────────────────────────────┬───────────────────┘
                              │                                 │
        vistas DEFINER        │                                 │   tablas base
        (GRANT SELECT anon)   │                                 │   (sesión del dueño + RLS)
                              ▼                                 ▼
   ┌───────────────────────────────────────┐   ┌──────────────────────────────────────────┐
   │ RSC público  app/[slug]/page.tsx      │   │ RSC panel  app/(dashboard)/web/page.tsx  │
   │  Promise.all :75-110                  │   │  Promise.all :96-118                     │
   │   + public_service_categories  ◀NUEVO │   │   + service_categories          ◀NUEVO   │
   │  select de negocio :62                │   │  select de negocio :49                   │
   │   + category_sort_mode         ◀NUEVO │   │   + category_sort_mode          ◀NUEVO   │
   │   + service_sort_mode          ◀NUEVO │   │   + service_sort_mode           ◀NUEVO   │
   └───────┬───────────────────────┬───────┘   └───────────────┬──────────────────────────┘
           │ bookingNode           │ bookingNode               │
           │ (rama legacy :184-200)│ (bookingSlot :217)        │
           ▼                       ▼                           ▼
   ┌──────────────┐        ┌────────────────┐        ┌────────────────────┐
   │  <BookingClient …  services · serviceCategories(NUEVO) · business{modos} …  />        │
   └───────────────────────────────┬──────────────────────────────────────────────────────┘
                                   │  paso 1, booking-client.tsx:564-666
                                   ▼
                    groupCatalog(services, serviceCategories ?? [],
                                 { categories: business.category_sort_mode,
                                   services:   business.service_sort_mode })
                                   │
                                   ▼  CatalogGroup<Service>[]
                    ┌──────────────────────────────────────┐
                    │ group.title === null → sin encabezado│ ← CAT-07, la regla vive en el dato
                    │ group.title !== null → <h3>{title}</h3>
                    │ group.services.map → LA MISMA tarjeta de hoy (G-23-6 intacto)
                    └──────────────────────────────────────┘
```

### Patrón 1 — El seam de render: **map anidado, la tarjeta se queda donde está**

El cuerpo de la tarjeta va de `booking-client.tsx:587` a `:661` (~75 líneas) y carga el contrato
G-23-6: contenedor `relative isolate` (`:590`), botón estirado con pseudo-elemento
(`after:absolute after:-inset-px`, `:621`), `ServiceDescription` como **hermana** del botón
(`:639-647`) y el párrafo del motivo también hermano (`:656-660`). Copiarlo dentro de un loop de
grupos sería un defecto real.

**La transformación es de una sola línea de estructura.** Hoy:

```tsx
// booking-client.tsx:567-664 (estado actual)
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
  {services.map(service => {
    const scheduled = hasScheduleCoverage(service.id, timeBlocks, timeBlockServices ?? [])
    const staffed   = isServiceStaffed(service.id, professionals, professionalServices)
    const enabled   = scheduled && staffed
    return (
      <div key={service.id} className={cn('relative isolate rounded-lg border p-4 …')}>
        {/* … 75 líneas: botón + ServiceDescription + motivo … */}
      </div>
    )
  })}
</div>
```

Después:

```tsx
<div className="space-y-6">
  {catalogGroups.map(group => (
    <div key={group.categoryId ?? '__sueltos__'}>
      {group.title !== null && (
        <h3 className="text-sm font-bold mb-2">{group.title}</h3>
      )}
      <div className="grid grid-cols-1 gap-3">
        {group.services.map(service => {
          /* ← EL MISMO BLOQUE, VERBATIM, solo re-indentado. Nada adentro cambia. */
        })}
      </div>
    </div>
  ))}
</div>
```

**Por qué este seam y no una extracción a componente:**

- `hasScheduleCoverage` (`:578`) e `isServiceStaffed` (`:584`) dependen de **cuatro props** del
  componente (`timeBlocks`, `timeBlockServices`, `professionals`, `professionalServices`), y el
  `onClick` (`:616`) depende de **cinco setters de estado** más `selectedService` (`:597`). Extraer
  un `<ServiceCard>` a nivel de módulo obligaría a enhebrar ~10 props y a re-declarar sus tipos —
  mucha más superficie de error que el problema que resuelve. [VERIFIED:
  `app/[slug]/booking-client.tsx:578,584,597,616`]
- Extraerlo a una función **dentro** de `BookingClient` (closure) evitaría las props pero sigue
  siendo una edición mayor sobre el bloque bajo contrato G-23-6, y el repo ya tiene el precedente
  del IIFE inline para exactamente este tipo de caso (`booking-client.tsx:678`).
- Con el map anidado, el diff sobre `:587-661` es **puro re-indentado**: un `git diff -w` sobre esas
  líneas queda vacío. Eso convierte "no se duplicó el JSX" en algo **verificable**, no opinable.

**Por qué la estructura de arriba deja el camino de cero categorías byte-idéntico:** con cero
categorías `groupCatalog` devuelve **exactamente un grupo** con `title: null`
(`lib/service-categories.ts:316-318`). El `<h3>` no se pinta, `space-y-*` no aplica margen al primer
hijo (solo a los siguientes), y un `<div>` sin clases es una caja de bloque que no altera el layout
de un grid hijo. Resultado: el mismo grid, a la misma posición, con las mismas tarjetas.

**Alternativa equivalente:** `<Fragment key={…}>` por grupo con `<h3>` y el grid como hermanos, y
el aire por `mt-6` en el `<h3>`. Deja el DOM más plano; también deja mobile intacto con cero
categorías (no hay `<h3>`). Elección del planner.

### Patrón 2 — La grilla a una columna (CAT-10 / D-05 / D-07)

Cambio literal en `booking-client.tsx:567`: `grid grid-cols-1 sm:grid-cols-2 gap-3` →
`grid grid-cols-1 gap-3`. Nada más de esa línea se toca. El `min-w-0` del bloque izquierdo (`:624`)
y el `shrink-0` del derecho (`:627`) ya resuelven el reparto horizontal a cualquier ancho, y con
432px el nombre deja de partirse por falta de espacio. **No hace falta tocar `break-words` ni
`truncate`**: el nombre se pinta en un `<p>` sin recorte (`:625`).

### Patrón 3 — La lectura pública (CAT-08)

Entra como un elemento más del `Promise.all` de `app/[slug]/page.tsx:75-110`, siguiendo el molde
exacto de `public_time_block_services` (`:109`):

```ts
// Vista pública acotada (migración 078 §5): las categorías del catálogo con 4 columnas
// (id, business_id, name, sort_order) — SIN abrir la tabla base a anon. La consume BookingClient
// con groupCatalog (lib/service-categories). Fail-safe DIRECCIONAL: si la vista fallara, el `|| []`
// deja CERO categorías ⇒ groupCatalog cae en su camino de identidad ⇒ la lista plana de hoy.
// Un error de lectura nunca puede apagar el catálogo, solo desagruparlo.
supabase.from('public_service_categories').select('*').eq('business_id', business.id)
  .order('sort_order', { ascending: true }),
```

Y en la destructuración de `:75`, un `{ data: serviceCategories }` más; en el call site,
`serviceCategories={serviceCategories || []}` (el repo usa `|| []` en ese archivo, no `?? []` —
`page.tsx:170-176`).

> ⚠ **La trampa concreta del `.order`.** `app/(dashboard)/servicios/page.tsx:35` ordena las
> categorías por `sort_order` **y `created_at`** con este comentario verbatim: *"El desempate por
> `created_at` NO es decorativo: varias categorías recién creadas pueden quedar empatadas en 0, y
> sin una segunda clave el orden que devuelve PostgREST no está garantizado entre lecturas."*
> **Ese desempate NO se puede copiar acá:** `public_service_categories` proyecta solo cuatro
> columnas y `created_at` **no** está (migr. `078:322-327`, verbatim: `SELECT "id", "business_id",
> "name", "sort_order" FROM "public"."service_categories"`). Un `.order('created_at')` contra la
> vista devuelve error de columna inexistente. Si el planner quiere determinismo ante el empate, el
> único desempate disponible es `.order('id')`. El riesgo real es bajo: `nextSortOrder` devuelve
> `max + 1` (`lib/catalog-panel.ts:111-113`), así que las categorías creadas desde el panel nacen
> con `sort_order` distintos.

### Patrón 4 — La lectura del preview (D-13)

En `app/(dashboard)/web/page.tsx`, dos ediciones:

1. Agregar `category_sort_mode, service_sort_mode` al `select` explícito de `:49`. Sin esto el
   preview ordenaría con `'custom'` mientras el público ordena con `'alpha'` — exactamente la clase
   de "preview que miente" que el quick 260913-3tv vino a cerrar (`web/page.tsx:142-149`).
2. Una lectura más en el `Promise.all` de `:96-118`, contra la **tabla base** y no contra la vista:

```ts
// Tabla base + sesión del dueño + .eq('business_id'), igual que las otras siete: la base suma la RLS
// al filtro explícito (las dos capas), mientras public_service_categories es DEFINER sin
// security_invoker y dejaría el aislamiento colgado de una sola. La vista es una proyección SIN
// WHERE, así que base y vista devuelven las mismas filas para el mismo tenant (doctrina de
// lib/preview-booking.ts:19-31, pinchada en test/preview-booking-parity.test.ts).
supabase.from('service_categories')
  .select('id, business_id, name, sort_order')
  .eq('business_id', business.id)
  .order('sort_order', { ascending: true })
  .order('created_at', { ascending: true }),
```

Acá **sí** se puede desempatar por `created_at` (es la tabla base), y conviene: es el mismo orden
que `/servicios` (`servicios/page.tsx:35`). La policy de SELECT por tenant existe
(`078:171-174`, `"service_categories tenant select"`), así que la lectura con la sesión del dueño
devuelve filas.

`previewBookingInputs` **no necesita cambios**: proyecta servicios con `.filter()`
(`lib/preview-booking.ts:61`), que conserva `category_id` y `sort_order` intactos.

### Patrón 5 — El `??`-per-field (D-10), y por qué el call site correcto es el que ya existe

`lib/service-categories.ts:274-283` (leído verbatim esta sesión) explica que el spread pisa el
default con `undefined`. La forma correcta **ya existe en el repo** y se copia tal cual de
`components/dashboard/categorias-manager.tsx:217`:

```ts
const catalogGroups = useMemo(
  () => groupCatalog(
    services,
    serviceCategories ?? [],
    { categories: business.category_sort_mode, services: business.service_sort_mode },
  ),
  [services, serviceCategories, business.category_sort_mode, business.service_sort_mode],
)
```

Nótese: el objeto literal `{ categories: …, services: … }` es **correcto y suficiente**, porque el
`??` per-field vive **adentro** de `groupCatalog` (`:284-285`). Lo prohibido es que el call site
escriba `{ ...DEFAULT_SORT_MODES, ...algo }`. La regla se enuncia así al planner: *ningún call site
de `groupCatalog` puede contener un spread en su tercer argumento.*

`useMemo` y no llamada pelada: `BookingClient` re-renderiza en cada tecla del paso 4
(`clientName`/`clientPhone`/`clientEmail`, `:83-86`), y `groupCatalog` devuelve arreglos nuevos.
Molde: `app/(dashboard)/settings/settings-client.tsx:1968-1975`. (`categorias-manager.tsx:217` la
llama pelada; las dos formas son válidas, la memoizada es la del componente con formulario.)

### Patrón 6 — El `?? []` y el contrato de degradación (D-15 / SC-5)

La prop se declara **opcional**, copiando el molde y el comentario de `timeBlockServices`
(`booking-client.tsx:37-45`), y el default se aplica **en el punto de consumo** (`serviceCategories
?? []`), no en la desestructuración. Motivo: es lo que hace `timeBlockServices ?? []` en `:578` y lo
que hace que el fail-safe sea **legible en el lugar donde importa**.

La direccionalidad del fail-safe es la clave y hay que escribirla en el comentario: **cero
categorías ⇒ `groupCatalog` cae en su camino de identidad ⇒ un grupo sin título con la lista tal
cual llegó** (`lib/service-categories.ts:312-318`). El dato ausente **desagrupa**; jamás vacía.

### Estructura del proyecto (nada se mueve)

```text
app/[slug]/page.tsx            # +1 lectura en Promise.all, +2 columnas en el select, +1 prop
app/[slug]/booking-client.tsx  # +1 prop, +1 import, +1 useMemo, map anidado, -1 clase `sm:`
app/(dashboard)/web/page.tsx   # +1 lectura en Promise.all, +2 columnas en el select, +1 prop
lib/service-categories.ts      # NO SE TOCA
components/booking/service-description.tsx  # NO SE TOCA (D-08)
components/landing/landing-renderer.tsx     # NO SE TOCA (ya no monta BookingClient)
supabase/migrations/           # NO SE TOCA — sigue en 41 archivos (079 es la última)
```

### Anti-patrones a evitar

- **Reimplementar la regla de agrupado en el JSX.** La única fuente es `groupCatalog`. Un
  `services.filter(s => s.category_id === c.id)` en el render es el camino a divergir del panel.
- **Preguntar `serviceCategories.length === 0` para decidir si pintar títulos.** La regla vive en el
  dato: `group.title !== null`. Un `if` sobre el largo del arreglo se olvida del caso "categorías
  creadas pero ninguna asignada", que `groupCatalog` ya manda al camino de identidad (`:312-318`).
- **`dangerouslySetInnerHTML` para el título.** T-23-06 / T-23-10 / T-23-26. El `name` es texto del
  dueño que lee un anónimo: interpolación JSX, siempre.
- **Anidar algo interactivo dentro del botón de selección** (`:613-634`). Un botón dentro de otro es
  HTML inválido y un toque en "Ver más" elegiría el servicio (G-23-6). Esta fase **no agrega nada
  interactivo**, pero el `<h3>` debe quedar **fuera** de cualquier tarjeta, como hermano del grid.
- **`key={index}` en los grupos.** Ver §"Next 16 / React 19".

---

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|---|---|---|---|
| Agrupar servicios por categoría | Un `reduce`/`filter` en el JSX | `groupCatalog()` (`lib/service-categories.ts:269`) | Ya resuelve los 3 modos × 2 ejes, "Otros", el `category_id` colgado y el cross-tenant, la no-mutación y el orden estable. 43 casos testeados. |
| Ordenar las categorías | `.sort((a,b) => a.name.localeCompare(b.name))` | `sortCategories()` (`:219`) | El comparador real usa locale `'es'` + `sensitivity: 'base'` **coherente con el índice único de la base** (`:128-148`), y no tira con un `name` nulo. |
| El texto "Otros" | Un literal `'Otros'` en el JSX | `OTHER_GROUP_TITLE` (`:80`) | Dos literales serían dos nombres para el mismo grupo entre panel y público. |
| Decidir si mostrar el título | `if (categories.length > 0)` | `group.title !== null` | La regla vive en el dato (`:108-112`). |
| Medir si la descripción desborda | Contar caracteres | `ServiceDescription` (`components/booking/service-description.tsx`) | D-08. Ya mide con `ResizeObserver` + `document.fonts.ready`. |
| Escapar el nombre de categoría | `escapeHtml()` propio | Interpolación JSX | React auto-escapa. Ya probado en `components/booking/service-description.test.tsx:57-59`. |

**Key insight:** en esta fase **no hay nada que valga la pena construir**. Todo lo difícil ya está
escrito, comentado y testeado. El riesgo del plan no es "hacer poco", es "hacer de más": cualquier
helper nuevo que decida algo sobre el catálogo es candidato al modo de falla que ya mordió dos veces
en este repo (CR-01 de la Phase 20, y otra vez en la 21).

---

## Runtime State Inventory

*No aplica: esta fase no es un rename, refactor ni migración. No hay estado en runtime que quede
desfasado — no se renombra nada, no se escribe nada y no se toca ninguna configuración de servicio,
tarea de SO, secreto ni artefacto de build.*

---

## Common Pitfalls

### P-1 — El helper que responde "no" para todo y apaga el catálogo entero

**Qué sale mal:** una condición nueva en el render (un `if (categories.length)`, un `filter` sobre
grupos, un `group.services.length > 0`) que en el caso de dato ausente devuelve "nada" en vez de
"todo".
**Por qué pasa:** es el modo de falla natural cuando alguien lee "agrupar" como "filtrar". Está
documentado como ocurrido dos veces: CR-01 del code review de la Phase 20 y otra vez en la 21
(`lib/service-categories.ts:258-264`).
**Cómo evitarlo:** el único condicional nuevo permitido en el JSX es `group.title !== null` para
pintar el `<h3>`. Nada más filtra, nada más decide visibilidad.
**Señal temprana:** la pantalla con cero categorías deja de mostrar servicios, o muestra menos
servicios que `services.length`.

### P-2 — El `select` que no pide las columnas nuevas

**Qué sale mal:** se escribe la llamada a `groupCatalog` perfecta, pero `business.category_sort_mode`
llega `undefined` porque el `select` de `page.tsx:62` sigue con la lista vieja. El catálogo ordena
con `'custom'` para todos los negocios, aunque el dueño haya elegido alfabético, **y nadie se
entera**: no hay error, hay un orden equivocado silencioso.
**Por qué pasa:** los dos RSC usan **columnas explícitas** a propósito (`page.tsx:57-62`,
`web/page.tsx:38-49`), no `select('*')`, así que una columna nueva NO llega sola.
**Cómo evitarlo:** las dos columnas van en los **dos** `select`, y un gate de texto lo verifica (ver
§"Validación").
**Señal temprana:** cambiar el modo a "Alfabético" en el panel y ver que la página pública no se
reordena.

### P-3 — `.order('created_at')` contra `public_service_categories`

**Qué sale mal:** se copia el `.order('sort_order').order('created_at')` de
`servicios/page.tsx:35` a la lectura pública y la query falla: la vista no proyecta `created_at`
(migr. `078:322-327`). En PostgREST eso es un error de columna inexistente, y como el RSC hace
`|| []`, el catálogo **se desagrupa en silencio** — no revienta la página, simplemente deja de
agrupar. Es el peor sabor de bug: degrada exactamente al comportamiento que también es el correcto
para otro caso.
**Cómo evitarlo:** en la lectura pública, solo `.order('sort_order')`. Si hace falta desempate,
`.order('id')`.
**Señal temprana:** el panel muestra las categorías agrupadas y la página pública no, sin ningún
error visible.

### P-4 — Romper el contrato G-23-6 al re-indentar

**Qué sale mal:** al mover las ~75 líneas de la tarjeta un nivel adentro, se "aprovecha" para
limpiar: mover `ServiceDescription` adentro del `<button>`, sacar el `isolate`, o cambiar el
`after:-inset-px`.
**Por qué pasa:** el bloque de comentarios de `:602-612` explica el *por qué*, y un re-indentado
grande invita a tocarlo.
**Cómo evitarlo:** la regla operativa es **`git diff -w` vacío sobre `:587-661`**. Cualquier
diferencia que no sea whitespace en ese rango es un cambio no autorizado.
**Señal temprana:** un toque en "Ver más" selecciona el servicio, o el anillo de foco cambia de
lugar.

### P-5 — El preview que vuelve a mentir

**Qué sale mal:** se agrega la lectura de categorías a `app/[slug]/page.tsx` y se olvida
`app/(dashboard)/web/page.tsx`, o se agrega la lectura pero no las dos columnas del `select`.
**Por qué pasa:** D-13 es una decisión de la discusión, no algo que el Success Criterion 5 del
ROADMAP exigía (el SC-5 solo pedía que el preview **no se rompa**).
**Cómo evitarlo:** el plan trata los dos RSC como una sola tarea, no dos.
**Señal temprana:** `/web` muestra la lista plana mientras `/{slug}` muestra grupos.

### P-6 — `key` de grupo colisionando

**Qué sale mal:** `key={group.categoryId}` a secas. `categoryId` es `null` en el grupo de identidad
y en el de "Otros" (`:317`, `:342`).
**Por qué no es realmente un problema, y por qué igual hay que escribirlo bien:** los dos casos
nulos **no pueden coexistir** — la Regla 1 retorna un arreglo de un solo elemento (`:316-318`), la
Regla 2 solo empuja `categoryId` no nulos (`:335`) y la Regla 3 empuja a lo sumo uno (`:340-346`).
Así que hay **como máximo un grupo con `categoryId` nulo**. `key={group.categoryId ?? '__sueltos__'}`
es único por construcción.
**Qué NO hacer:** `key={index}`. Con "alfabético" la posición de un grupo cambia entre renders y
React reusaría estado de la tarjeta equivocada.

---

## Code Examples

### El cambio completo en `app/[slug]/page.tsx`

```tsx
// 1. El select del negocio (:60-64) — DOS columnas más al final de la lista.
const { data: business } = await supabase
  .from('public_businesses')
  .select('id, owner_id, slug, name, type, vertical, logo_url, primary_color, whatsapp, address, instagram, require_deposit, deposit_amount, deposit_expiry_hours, recaptcha_site_key, default_slot_duration, buffer_minutes, created_at, landing_config, max_advance_days, max_advance_date, public_selector_default, category_sort_mode, service_sort_mode')
  .eq('slug', slug)
  .single()

// 2. Una lectura más en el Promise.all (:75-110) — molde exacto de public_time_block_services.
const [ …, { data: timeBlockServices }, { data: serviceCategories }] = await Promise.all([
  …,
  supabase.from('public_service_categories').select('*').eq('business_id', business.id)
    .order('sort_order', { ascending: true }),
])

// 3. Una prop más en el call site (:168-177). Se usa `|| []` como sus hermanas de este archivo.
<BookingClient
  …
  timeBlockServices={timeBlockServices || []}
  serviceCategories={serviceCategories || []}
/>
```

*Fuente de las columnas: `supabase/migrations/078_service_categories.sql:381-406` (lista verbatim de
`public_businesses`) y `:322-327` (`public_service_categories`).*

### El cambio en `booking-client.tsx`

```tsx
// Import (junto a los otros de lib/, :10-12)
import { groupCatalog, type CatalogCategory } from '@/lib/service-categories'

// Props (:23-46), con el molde y el tono del comentario de timeBlockServices (:37-45)
interface Props {
  …
  // Categorías del catálogo (vista acotada public_service_categories, migr. 078 §5). Se interpretan
  // con groupCatalog (lib/service-categories), la MISMA función que usa el panel: el orden y los
  // títulos no se reimplementan acá. Opcional a propósito — el fail-safe es DIRECCIONAL: sin
  // categorías groupCatalog cae en su camino de identidad y devuelve la lista de hoy, sin títulos.
  // Un dato ausente DESAGRUPA el catálogo; nunca lo apaga.
  //
  // El tipo es CatalogCategory y NO ServiceCategory: la vista pública no expone `created_at`
  // (migr. 078:307,322-327), así que exigir la interfaz completa obligaría a un cast mentiroso.
  serviceCategories?: CatalogCategory[]
}

// Dentro del componente, antes del return:
const catalogGroups = useMemo(
  // ⚠ D-10 / CAT-07: el tercer argumento es un objeto LITERAL, nunca un spread. El `??` campo por
  // campo vive dentro de groupCatalog (lib/service-categories.ts:284-285); un
  // `{ ...DEFAULT_SORT_MODES, ...modes }` acá pisaría el default con `undefined` cuando la fila se
  // leyó con un select más angosto, y sería un orden equivocado para TODOS los negocios en silencio.
  () => groupCatalog(services, serviceCategories ?? [], {
    categories: business.category_sort_mode,
    services: business.service_sort_mode,
  }),
  [services, serviceCategories, business.category_sort_mode, business.service_sort_mode],
)
```

### El `<h3>` y la tipografía

`app/globals.css:269` declara `h1, h2, h3 { font-family: var(--font-heading); letter-spacing:
-0.02em; }` en `@layer base`. **Un `<h3>` toma la tipografía de títulos solo**: no necesita el
`font-[family-name:var(--font-heading)]` que el `h2` de `:566` escribe explícito (aunque escribirlo
tampoco molesta y es lo que el archivo hace hoy). El `h2` es `text-xl font-bold mb-4`; para quedar
"más chico" (D-01) el `h3` debería estar en `text-sm` o `text-base` con `font-bold`.
[VERIFIED: `app/globals.css:264-269`; `app/[slug]/booking-client.tsx:566`]

---

## Next 16 / React 19 — lo que aplica y lo que no

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| ¿Cambia cómo se agrega una lectura paralela en un RSC? | **No.** La guía oficial de Next 16 sigue siendo iniciar los requests y esperarlos con `Promise.all`. El patrón del archivo es correcto tal cual. | [CITED: `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md:451-505`] |
| ¿Hay riesgo de cacheo de la lectura nueva? | **No.** `app/[slug]/page.tsx:36` declara `export const dynamic = 'force-dynamic'`; la lectura nueva hereda esa estrategia. | [VERIFIED: `app/[slug]/page.tsx:33-36`] |
| ¿`key` sobre listas anidadas cambia en React 19? | **No.** Regla de siempre: la `key` es única **entre hermanos**, no globalmente. `key` de grupo → `group.categoryId ?? '__sueltos__'`; `key` de servicio → `service.id`, sin cambios. La unicidad de `service.id` entre grupos la garantiza el consumo del bucket en `groupCatalog` (`:327-334`). | [VERIFIED: `lib/service-categories.ts:327-335`] [ASSUMED: la semántica de `key` no cambió en React 19 — no se verificó contra los docs de React esta sesión] |
| ¿Hace falta `<Suspense>` o streaming? | **No.** Una query más contra la misma conexión, en paralelo con siete que ya corren. No agrega latencia secuencial. | [VERIFIED: `app/[slug]/page.tsx:75-110`] |
| ¿El `useMemo` nuevo tiene algún problema con el compilador de React 19? | No se investigó; el repo usa `useMemo` en client components sin fricción (`settings-client.tsx:1968`). | [ASSUMED] |

---

## State of the Art (dentro de este repo)

| Enfoque viejo | Enfoque actual | Cuándo cambió | Impacto en esta fase |
|---|---|---|---|
| `LandingRenderer` armaba su propio `BookingClient` como fallback | `bookingSlot` es **requerido**; el nodo lo arma el call site | quick 260913-3tv | **Hay dos call sites, no tres.** El landing recibe las categorías gratis. |
| El preview de `/web` mostraba todo habilitado | El preview recibe las mismas puentes y pasa por `previewBookingInputs` | quick 260913-3tv | D-13 es la continuación natural de ese quick: "el preview no miente". |
| La tarjeta entera era un `<button>` con la descripción adentro | La tarjeta es un **contenedor**; el botón se estira con `after:absolute` | Phase 23 (23-05/23-07, G-23-6) | El `<h3>` va **afuera** de la tarjeta; nada interactivo se anida. |
| La descripción se recortaba a 2 renglones fijos (`line-clamp-2`) | 3 renglones a ancho completo + "Ver más" medido | Phase 23 | D-08: no se vuelve atrás. El ROADMAP SC-4 menciona `line-clamp-2` pero está **actualizado por la nota de G-23-6** (`ROADMAP.md:852`). |

**Obsoleto / a no repetir:**

- El `GRANT ALL … TO "anon"` de las migraciones 059/061/071 (CR-01). Las vistas de la 078 ya llevan
  `REVOKE ALL` + `GRANT SELECT` (`078:336-340,372-376,412-416`). Esta fase **no toca permisos**.
- El pre-filtrado server-side del catálogo (`bookableServices`, borrado en la Phase 20): ocultar un
  servicio mal configurado. Hoy se **deshabilita con motivo** (`page.tsx:148-157`). D-12 lo reafirma.

---

## Assumptions Log

| # | Claim | Sección | Riesgo si está mal |
|---|---|---|---|
| A1 | El breakpoint `sm` de Tailwind v4 es 640px (no se verificó contra el CSS generado; el repo no lo redefine) | Standard Stack / mediciones | Bajo. Si fuera otro, cambia el ancho donde la grilla pasa a una columna, pero no la corrección de D-07 (mobile ya es 1 columna a cualquier breakpoint ≥ el actual). |
| A2 | La semántica de `key` en listas anidadas no cambió en React 19 | Next 16 / React 19 | Bajo. Verificable con un render; si cambiara, el síntoma sería estado reusado entre tarjetas. |
| A3 | `useMemo` no tiene fricción con el compilador de React 19 en este repo | Next 16 / React 19 | Bajo. El repo ya lo usa en client components. |
| A4 | Un `.order('created_at')` contra `public_service_categories` falla con error de columna inexistente (se verificó que la columna **no está en la vista**; NO se ejecutó la query contra PostgREST) | Pitfall P-3 | Bajo-medio. La ausencia de la columna está verificada leyendo la migración; el código de error exacto no. La recomendación (no usar `created_at` en la lectura pública) es correcta en cualquier caso. |
| A5 | En producción no hay categorías con `sort_order` empatado (se verificó que `nextSortOrder` = `max+1`, no se midió la tabla en prod) | Patrón 3 | Bajo. Si hubiera empates, el orden entre esas dos categorías sería no determinista en el público. Mitigable con `.order('id')`. |

---

## Open Questions

1. **¿Se le agrega `.order('sort_order')` a la lectura de `public_services`?**
   - *Lo que sabemos:* hoy `app/[slug]/page.tsx:80` lee `public_services` **sin ningún `ORDER BY`**,
     y `lib/service-categories.ts:66-69` dice textualmente que "el mismo orden que hoy" solo es
     reproducible porque el modelo no reordena nada. Dentro de un grupo, `groupCatalog` **sí**
     ordena por `sort_order` (modo `'custom'` → `porOrden`, `:124-126`), así que **el orden manual
     del dueño llega al público sin necesidad de ordenar en la query**. En el camino de identidad
     (cero categorías) los modos ni se miran (`:315-318`), así que ahí el orden es el que devuelva
     PostgREST.
   - *Lo que no está claro:* si el dueño ordena manualmente sus servicios **sin crear ninguna
     categoría**, ese orden no llega al público. El panel ya cubre ese hueco: los controles de
     posición se gatean con `hayAgrupacion` (`categorias-manager.tsx:232-238`) precisamente para que
     no exista una acción inerte (CAT-05). O sea: **el hueco está cerrado por diseño, no abierto**.
   - *Recomendación:* **NO agregar `.order()` a `public_services` en esta fase.** Agregarlo cambiaría
     el orden de la pantalla de **todos** los negocios de producción el día del deploy (de "lo que
     devuelva PostgREST" a `sort_order, created_at`), que es exactamente la clase de cambio
     silencioso que CAT-07 y el Success Criterion 3 existen para impedir. Si el planner cree que hay
     que hacerlo, es una decisión de producto propia y debería ir a un checkpoint humano, no
     colarse como detalle de implementación.

2. **¿El `?? []` sigue teniendo un consumidor vivo tras el hallazgo de los dos call sites?**
   - *Lo que sabemos:* los dos call sites van a pasar la prop. No queda un tercero que dependa del
     default.
   - *Recomendación:* **mantenerlo igual** (D-15 lo exige y el ROADMAP SC-5 lo verifica). Sigue
     cubriendo tres casos reales: el `|| []` cuando la lectura falla, un call site futuro, y —el más
     importante— el `type` opcional **es** el mecanismo que declara "el dato ausente degrada". Pero
     el plan debe **escribir explícitamente en VERIFICATION** que el SC-5 se verifica por los dos
     caminos (el landing vía `bookingSlot`, y la prop opcional), no por un `LandingRenderer` que ya
     no monta el componente. Si la UAT busca "el call site del LandingRenderer que no pasa la prop"
     no lo va a encontrar.

3. **¿El `<h3>` es `text-sm` o `text-base`?**
   - Discreción explícita del planner (CONTEXT, "Claude's Discretion"). El `h2` es `text-xl`
     (`:566`); cualquiera de las dos cumple D-01. Va a UI-SPEC si la fase genera uno.

---

## Environment Availability

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|---|---|---|---|---|
| Node + npm | build / test | ✓ | (del entorno de dev) | — |
| `next` | todo | ✓ | 16.2.7 | — |
| `react` / `react-dom` | render + `renderToStaticMarkup` en tests | ✓ | 19.2.4 | — |
| `vitest` | suite | ✓ | 4.x (config en `vitest.config.mts`) | — |
| Supabase local | tests DB-backed (`describe.skipIf(!hasSupabaseCreds)`) | condicional | — | Las suites DB se auto-skipean sin creds; los tests puros corren igual |
| Migración nueva | **ninguna** | — | — | — |

**Dependencias faltantes que bloquean:** ninguna.
**Dependencias faltantes con fallback:** solo las creds de Supabase para las suites DB-backed, que
ya se skipean solas (`test/env.ts` → `hasSupabaseCreds`).

---

## Validación: qué NO volver a testear, y cuál es la superficie nueva

> `workflow.nyquist_validation` está en **`false`** en `.planning/config.json`, así que no va la
> sección de Validation Architecture. Esto es el material que el planner necesita igual para no
> escribir tests redundantes.

### Ya cubierto — NO re-testear

`test/service-categories.test.ts` tiene **43 casos** (lista completa obtenida con `grep -n
"describe(\|  it("`). Lo que ya está probado, por bloque:

| Bloque | Casos | Qué garantiza |
|---|---|---|
| Orden de categorías (`:56-104`) | 3 | `custom` por `sort_order`, empate estable sin desempatar por nombre, `alpha` con acentos/caps |
| Orden de servicios (`:106-226`) | 8 | `custom`/`alpha`/`price`, precio no numérico/nulo/vacío sin leerse como gratis, el grupo "Otros" con el mismo modo, no-mutación de la entrada |
| **CAT-07** (`:228-269`) | 3 | Cero categorías ⇒ un grupo sin título con la lista exacta; **los modos ni se miran**; categorías creadas sin asignar ⇒ también lista plana |
| **CAT-06** (`:271-341`) | 2 | `custom → alpha → price → custom` devuelve el arreglo idéntico; no hay por dónde borrarlo |
| **Invariante de conservación** (`:343-466`) | 6+ | La unión de los grupos ES la entrada en los 7 casos × 3 modos; el colgado y el cross-tenant caen en "Otros" y van últimos; categoría repetida no duplica; ningún grupo vacío |
| Nombre roto (`:468-520`) | 2 | Un `name` nulo no tira en ninguna posición |
| **El default campo por campo** (`:522-578`) | 5 | Incluye literalmente *"las dos claves PRESENTES con valor `undefined` — el caso que el spread no cubre"* (`:552`) |
| `sortCategories` (`:580-622`) | 6 | Mismo eje, con las vacías incluidas, misma regla que `groupCatalog` |

`test/service-categories-model.test.ts` (DB-backed) ya cubre el **camino completo** hasta el anon:
CAT-07 contra la vista real (`:120-138`), la categoría naciendo en la base y saliendo por la vista
anónima con `category_id` viajando por `public_services` (`:140-165`), y CAT-09 medido contra lo que
devuelve la vista (`:167-196`).

`components/booking/service-description.test.tsx` ya cubre el "Ver más" medido y el escape del
`<script>` (`:14-70`). **D-08: nada de eso se re-testea.**

### La superficie genuinamente NUEVA de esta fase

Es toda de **cableado**, y el repo tiene dos moldes probados para testear cableado sin DOM. El
entorno de Vitest es `node`, sin jsdom ni Testing Library, y el milestone prohíbe paquetes nuevos
(`vitest.config.mts:12-14`; `test/shell-scope.test.ts:54-58` lo explica verbatim).

| # | Qué probar | Cómo, con el molde del repo |
|---|---|---|
| V-1 | **Los dos `select` piden las dos columnas nuevas** | Gate de texto sobre las fuentes: `readFileSync` de `app/[slug]/page.tsx` y `app/(dashboard)/web/page.tsx`, asertando `category_sort_mode` y `service_sort_mode` en cada uno. Molde: `test/shell-scope.test.ts:59-60` |
| V-2 | **Los dos RSC leen las categorías y pasan la prop** | Mismo gate: `public_service_categories` en el público, `service_categories` en el panel, y `serviceCategories={` en los dos call sites. Sin esto, "el preview no miente" es una afirmación sobre el archivo que alguien miró |
| V-3 | **Ningún call site de `groupCatalog` usa spread en el 3er argumento** (D-10) | Barrido repo-wide con `fuentesDelRepo()` (el helper recursivo de `test/shell-scope.test.ts:70-80`) buscando `...DEFAULT_SORT_MODES` / un spread dentro del literal de modos. Es el único gate que convierte D-10 de comentario en invariante |
| V-4 | **`sm:grid-cols-2` ya no está en el paso 1** (CAT-10 / D-07) | Gate de texto sobre `booking-client.tsx`. Barato y exacto |
| V-5 | **Paridad de categorías preview ↔ público** (D-13) | Un caso más en `test/preview-booking-parity.test.ts` (DB-backed, ya tiene los dos roles montados: `ownerAnon` y el anon sin sesión, `:29-36`): el set de ids de `service_categories` leído como dueño == el set de `public_service_categories` leído como anon, para el mismo tenant, **asertando primero que trajo filas** (un `[]` inesperado por RLS es indistinguible de una proyección correcta — `:38-41`) |

**Lo que NO recomiendo:** intentar `renderToStaticMarkup(<BookingClient …/>)`. Es el molde correcto
para un componente chico (`service-description.test.tsx:6-8`), pero `BookingClient` llama
`useRouter()` de `next/navigation` en el cuerpo (`booking-client.tsx:129`), que tira fuera de un
router montado. Se podría `vi.mock('next/navigation')`, pero eso es infraestructura nueva para
probar un `map` anidado: los gates V-1..V-4 cubren lo mismo por una centésima del costo. *Si* el
planner quiere una aserción real sobre el markup, el camino barato es extraer el encabezado a un
componente trivial y renderizarlo — pero eso es una extracción que D-01 no necesita.

**Comando de la suite:** `npm run test` (→ `vitest run`).

---

## Security Domain

`workflow.security_enforcement` está en **`true`** (`.planning/config.json`), así que la sección va.
La relevancia declarada por el ROADMAP es **Media**, y la condición que habría disparado la herencia
de `secure-phase` de la Phase 22 —"si esta fase termina necesitando cualquier lectura anónima
nueva"— **no se dispara**: la vista ya existe y ya tiene `GRANT SELECT` a `anon`.

### Categorías ASVS aplicables

| Categoría ASVS | Aplica | Control estándar acá |
|---|---|---|
| V2 Authentication | no | La página pública es anónima por diseño; el preview corre bajo la sesión ya verificada (`web/page.tsx:36`) |
| V3 Session Management | no | No se toca sesión ni cookies |
| V4 Access Control | **sí** | Aislamiento por tenant: `.eq('business_id', business.id)` en las dos lecturas nuevas + RLS (`078:171-174`) en la del panel + vista DEFINER acotada en la del público (`078:322-340`) |
| V5 Input Validation | parcial | No entra input del cliente en esta fase; el `slug` ya se resuelve server-side (`page.tsx:63`) |
| V6 Cryptography | no | — |
| V7 Error Handling / Logging | **sí** | `|| []` direccional: una lectura fallida desagrupa, nunca vacía |

### Amenazas conocidas sobre esta superficie

| Patrón | STRIDE | Mitigación estándar | Estado |
|---|---|---|---|
| XSS almacenado vía el `name` de categoría escrito por el dueño y leído por un anónimo | Tampering | Interpolación JSX (auto-escape de React); **cero** `dangerouslySetInnerHTML` | Heredado de T-23-06 / T-23-10 (`23-SECURITY.md:60,69`), `closed`. Esta fase debe **no reabrirlo**. El módulo puro propaga `name` como `string` plano y nunca construye marcado (`lib/service-categories.ts:28-30`) |
| XSS almacenado vía `description` | Tampering | Ídem; ya con test real | T-23-26 (`23-SECURITY.md:100`), `closed` — `service-description.test.tsx:57-59` |
| Fuga cross-tenant por leer la tabla base con `anon` | Information Disclosure | Leer **la vista acotada**, nunca `service_categories` con anon key | La tabla base no tiene policy `anon` (`078` solo define las 4 policies de tenant, `:171-189`) |
| Vista DEFINER auto-actualizable con GRANT de escritura | Elevation of Privilege | `REVOKE ALL` + `GRANT SELECT` (forma de la 072) | Ya aplicado en la 078 (`:336-340`). **Esta fase no emite un solo GRANT.** |
| Preview del dueño leyendo una vista DEFINER (aislamiento de una sola capa) | Information Disclosure | El dashboard lee **tabla base** con la sesión del dueño: RLS + `.eq` | Doctrina de `lib/preview-booking.ts:19-31`. El Patrón 4 la respeta |

⚠ **Si en el plan aparece una migración, un `GRANT`, o una columna que la vista no expone, el plan se
salió del alcance**: eso dispara la herencia de `secure-phase` que el ROADMAP advierte
(`ROADMAP.md:856`) y cambia la postura de seguridad de la fase.

---

## Project Constraints (de CLAUDE.md / AGENTS.md / .claude/CLAUDE.md)

Directivas accionables que el plan **debe** cumplir:

1. **Next 16, no 14.** Consultar `node_modules/next/dist/docs/` antes de asumir comportamiento del
   framework. El middleware es `proxy.ts`. *(Hecho en esta investigación: el patrón `Promise.all`
   está confirmado contra los docs empaquetados.)*
2. **Aislamiento por tenant no negociable.** Toda query que toque datos de un negocio lleva
   `.eq('business_id', …)` **y** se apoya en RLS o vista acotada. Las dos lecturas nuevas cumplen.
3. **Tailwind v4 CSS-first, sin `tailwind.config`.** Cero hex hardcodeado, todo por token
   (`23-UI-SPEC.md:61`).
4. **`lucide-react` es la única librería de iconos.** Esta fase no agrega iconos.
5. **Errores de API con `{ ok, error }` en snake_case.** No aplica: no hay route handler nuevo.
6. **Comentarios en español explicando el *por qué*** de lo no obvio. Aplica a los tres comentarios
   nuevos (la lectura pública, la lectura del preview, el `useMemo` con la advertencia de D-10).
7. **Migraciones SQL numeradas y aplicadas a mano.** **Cero migraciones en esta fase** — el
   directorio debe seguir con 41 archivos (última: `079_service_categories_name_normalized.sql`).
   [VERIFIED: `ls supabase/migrations/ | tail -8`]
8. **Alias `@/*` siempre**, nunca rutas relativas profundas. (`app/[slug]/page.tsx:3` usa `./` para
   sus vecinos del mismo directorio: eso es lo existente y se conserva.)
9. **Windows + PowerShell** en el entorno de dev: los comandos del plan deben ser válidos ahí, o
   declarar que van por Bash.
10. **Flujo GSD:** nada de ediciones directas fuera del workflow.
11. **Accesibilidad no negociable** (CLAUDE.md global): jerarquía de headings correcta sin saltar
    niveles → D-04 → `<h3>` bajo el `<h2>` de `:566`.
12. **Escala de espaciado en múltiplos de 4/8px** y **1 solo elemento dominante por pantalla**
    (CLAUDE.md global). El `<h3>` no puede robarle peso a las tarjetas (D-01).

---

## Sources

### Primary (HIGH confidence) — leídos verbatim esta sesión

- `lib/service-categories.ts` (349 líneas, completo) — contrato de `groupCatalog`, `CatalogCategory`,
  `CatalogGroup`, el `??` per-field (`:274-285`), las tres reglas (`:287-348`)
- `app/[slug]/page.tsx` (221 líneas, completo) — `select` del negocio (`:60-64`), `Promise.all`
  (`:75-110`), call site (`:168-177`), `bookingSlot` (`:217`)
- `app/[slug]/booking-client.tsx:1-140` y `:490-690` — Props, paso 1, contrato G-23-6
- `app/(dashboard)/web/page.tsx:36-210` — `select` (`:49`), `Promise.all` (`:96-118`), call site
  (`:182-192`), doctrina del preview (`:142-162`)
- `components/landing/landing-renderer.tsx:43-80` — `bookingSlot` requerido, fallback borrado
- `supabase/migrations/078_service_categories.sql:138-189, 306-416` — RLS, las tres vistas, los GRANT
- `lib/types.ts:40-100, 141, 195-284` — `Business`/`PublicBusiness`, `ServiceCategory`, `Service`
- `lib/preview-booking.ts` (94 líneas, completo) — doctrina base-vs-vista, `previewBookingInputs`
- `lib/catalog-panel.ts:111-131` — `nextSortOrder`
- `components/dashboard/categorias-manager.tsx:200-280` — call site de referencia de `groupCatalog`
- `app/(dashboard)/settings/settings-client.tsx:1955-2010` — call site memoizado
- `app/(dashboard)/servicios/page.tsx:1-52` — el `.order` de categorías y su porqué
- `components/booking/service-description.tsx` (130 líneas) + `service-description.test.tsx:1-70`
- `test/service-categories.test.ts` (índice completo de 43 casos) y
  `test/service-categories-model.test.ts:110-196`
- `test/shell-scope.test.ts:40-80`, `test/preview-booking-parity.test.ts:1-60`
- `vitest.config.mts` (completo), `package.json` (scripts + devDependencies)
- `app/globals.css:17-58, 264-281`
- `.planning/workstreams/motor-reservas/{REQUIREMENTS,ROADMAP,STATE}.md` y el `24-CONTEXT.md`
- `23-UI-SPEC.md` (entradas G-23-6 y design system), `23-SECURITY.md:60,69,100,172`

### Secondary (MEDIUM confidence)

- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md:451-505` — fetch
  paralelo con `Promise.all` en Next 16 (documentación oficial empaquetada con la versión instalada)

### Tertiary (LOW confidence)

- Ninguna. **No se hizo una sola búsqueda web**: toda la incertidumbre de esta fase es sobre el
  repo, y el repo es medible. Lo que quedó sin medir está en `## Assumptions Log`.

---

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — cero dependencias nuevas; las versiones se leyeron del `package.json`
  instalado, no de memoria
- Arquitectura / el seam de render: **HIGH** — las cuatro ediciones se derivaron leyendo las líneas
  exactas de los cuatro archivos, con los números de línea citados
- Pitfalls: **HIGH** — P-1 y P-5 son incidentes documentados de este mismo repo; P-2, P-3 y P-6 se
  derivaron de las listas de columnas leídas verbatim
- Superficie de test: **HIGH** — los dos moldes (`shell-scope`, `preview-booking-parity`) existen y
  se leyeron; la limitación de `useRouter` se identificó en la línea concreta

**Research date:** 2026-09-22
**Valid until:** 2026-10-22 (30 días — todo el material es in-repo y estable; se invalida si alguien
toca `booking-client.tsx`, `lib/service-categories.ts` o las vistas de la 078)
