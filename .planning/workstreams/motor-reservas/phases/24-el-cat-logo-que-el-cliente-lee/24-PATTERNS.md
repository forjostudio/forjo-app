# Phase 24: El catálogo que el cliente lee — Pattern Map

**Mapeado:** 2026-09-22
**Archivos a tocar:** 3 (modificados) + 1 test (ampliado) — **cero archivos nuevos**, cero paquetes, cero migraciones
**Analogs encontrados:** 5 / 5 (todos *exact match*, todos in-repo y **git-tracked** — verificado con `git ls-files`)

> Convención del proyecto: *una afirmación sin medición es una hipótesis.* Cada analog de abajo lleva
> `file:line` y un excerpt leído verbatim esta sesión.

---

## File Classification

| Archivo a modificar | Rol | Data Flow | Analog más cercano | Match |
|---|---|---|---|---|
| `app/[slug]/page.tsx` (`:62` select, `:75` Promise.all, `:168` call site) | RSC page (server read) | request-response / read-only | **`app/[slug]/page.tsx:109`** (la lectura de `public_time_block_services`, hermana en el mismo `Promise.all`) | exacto (mismo archivo, mismo bloque) |
| `app/(dashboard)/web/page.tsx` (`:49` select, `:96-118` Promise.all, `:182` mount) | RSC page (preview, sesión del dueño) | request-response / read-only | **`app/(dashboard)/web/page.tsx:111-118`** (`time_block_services` contra **tabla base**) + `app/(dashboard)/servicios/page.tsx:35` (la lectura de `service_categories` con sus dos `.order`) | exacto |
| `app/[slug]/booking-client.tsx` (prop nueva, `useMemo`, `:567` grilla, `:564-666` render) | Client Component (wizard) | render de lista agrupada / estado local | **`components/dashboard/categorias-manager.tsx:217,754-757,895,945`** (mismo `groupCatalog` → render agrupado, en el panel) + **`booking-client.tsx:37-45,578`** (el molde `timeBlockServices?` + `?? []`) | exacto en ambos ejes |
| `test/preview-booking-parity.test.ts` (+1 caso) | test | invariante DB-backed | **el propio archivo** (`:52` `describe.skipIf(!hasSupabaseCreds)`) | exacto |
| gates de texto de la fase (archivo a elección del planner) | test | invariante grep-style sobre fuentes | **`test/shell-scope.test.ts:59-125`** | exacto |

**Ningún archivo queda sin analog.** No hay sección "No Analog Found" en esta fase.

---

## Pattern Assignments

### 1. `app/[slug]/page.tsx` — la lectura pública nueva (RSC, read-only)

**Analog:** `app/[slug]/page.tsx:104-110` — la lectura de `public_time_block_services`, la última del
`Promise.all` y la última agregada al archivo. Es el molde exacto: **vista acotada + `.eq('business_id')`
+ comentario que explica el fail-safe DIRECCIONAL**.

**Patrón de lectura (verbatim, `:104-110`):**

```ts
    // Vista pública acotada (migración 071 §3): mapeo franja↔servicio (business_id, time_block_id,
    // service_id), SIN abrir la tabla puente `time_block_services` a anon — mismo criterio que D-07
    // de la migr. 059 para el staff (…)
    // Fail-safe: si la vista fallara (permiso mal aplicado, schema cache sin refrescar), el `|| []`
    // deja la puente VACÍA ⇒ regla del comodín ⇒ TODO servicio queda agendado. Degrada al
    // comportamiento de hoy, nunca al revés (nunca apaga servicios por un error de lectura).
    supabase.from('public_time_block_services').select('*').eq('business_id', business.id),
```

**Qué copiar exactamente:**

- El **shape** de una sola línea: `supabase.from('<vista>').select('*').eq('business_id', business.id)`.
  Las ocho lecturas del `Promise.all` usan `.eq('business_id', business.id)` **sin excepción**
  (`:80,82,83,84,85,90,97,109`), y la del negocio usa `.eq('slug', slug)` (`:63`).
- El **comentario de cabecera** con la misma estructura: *qué vista / qué migración / qué columnas /
  por qué no la tabla base / qué pasa si falla*. Esta es la única lectura del archivo sin comentario
  si el plan no lo escribe.
- El **defaulting en el call site** con `|| []`, no `??`. **Medido:** en este archivo son **ocho**
  `|| []` consecutivos (`:169-177`, ver excerpt abajo) y **cero** `?? []`.

**Patrón de desestructuración (`:75`, verbatim):**

```ts
  const [{ data: services }, { data: professionals }, { data: timeBlocks }, { data: exceptions }, { data: locations }, { data: canchas }, { data: professionalServices }, { data: timeBlockServices }] = await Promise.all([
```

→ se le agrega `, { data: serviceCategories }` al final del array de destructuring y la lectura al
final del `Promise.all`. (CONTEXT delega la posición exacta al planner; el final es donde cayó cada
lectura nueva de las últimas 3 fases.)

**Patrón del call site (`:168-177`, verbatim):**

```tsx
    <BookingClient
      business={business as unknown as PublicBusiness}
      services={services || []}
      professionals={professionals || []}
      timeBlocks={timeBlocks || []}
      exceptions={exceptions || []}
      locations={locations || []}
      professionalServices={professionalServices || []}
      timeBlockServices={timeBlockServices || []}
    />
```

**Patrón del select de negocio (`:60-64`, verbatim la línea larga):**

```ts
  const { data: business } = await supabase
    .from('public_businesses')
    .select('id, owner_id, slug, name, type, vertical, logo_url, primary_color, whatsapp, address, instagram, require_deposit, deposit_amount, deposit_expiry_hours, recaptcha_site_key, default_slot_duration, buffer_minutes, created_at, landing_config, max_advance_days, max_advance_date, public_selector_default')
    .eq('slug', slug)
    .single()
```

→ **Verificado esta sesión: `category_sort_mode` y `service_sort_mode` NO están.** Es columnas
explícitas a propósito (el comentario de `:57-59` explica por qué nunca `select('*')`), así que una
columna nueva **no llega sola** (P-2 de la RESEARCH). Se agregan **al final de la lista**.

> ⚠ **Trampa P-3, carry-over obligatorio:** **NO copiar el `.order('created_at')`** de
> `app/(dashboard)/servicios/page.tsx:35` a esta lectura. `public_service_categories` proyecta solo
> `id, business_id, name, sort_order` (migr. `078:322-327`): `created_at` no existe en la vista, la
> query falla, el `|| []` la convierte en cero categorías y el catálogo **se desagrupa en silencio**.
> En la lectura pública: solo `.order('sort_order', { ascending: true })`; si hace falta desempate,
> `.order('id')`.

---

### 2. `app/(dashboard)/web/page.tsx` — la lectura del preview (RSC, sesión del dueño)

**Analog A — la lectura:** `app/(dashboard)/web/page.tsx:111-118`, la puente leída contra **tabla
base** con columnas explícitas:

```ts
    supabase
      .from('professional_services')
      .select('business_id, professional_id, service_id')
      .eq('business_id', business.id),
    supabase
      .from('time_block_services')
      .select('business_id, time_block_id, service_id')
      .eq('business_id', business.id),
```

**Analog B — el orden de las categorías:** `app/(dashboard)/servicios/page.tsx:35` (verbatim, con su
comentario de `:25-27`):

```ts
  // service_categories (Phase 23): por tenant (.eq('business_id') + RLS). El desempate por
  // `created_at` NO es decorativo: varias categorías recién creadas pueden quedar empatadas en 0, y
  // sin una segunda clave el orden que devuelve PostgREST no está garantizado entre lecturas.
    supabase.from('service_categories').select('*').eq('business_id', business.id).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
```

**Aquí SÍ se copia el doble `.order`** (es la tabla base, `created_at` existe) — y es lo que mantiene
el preview en el mismo orden que `/servicios`. Es la **única** de las dos lecturas nuevas de la fase
donde ese desempate es legal.

**Analog C — el select de negocio (`:47-52`, verbatim):**

```ts
  const { data: business } = await supabase
    .from('businesses')
    .select(
      'id, owner_id, slug, name, type, vertical, logo_url, primary_color, whatsapp, address, instagram, require_deposit, deposit_amount, deposit_expiry_hours, recaptcha_site_key, default_slot_duration, buffer_minutes, created_at, palette, theme, font, has_web_custom, landing_config, landing_draft',
    )
    .eq('owner_id', user.id)
    .single()
```

Su comentario (`:38-46`) declara textualmente *"La lista es exactamente lo que consume el
LandingRenderer + el BookingClient del preview (misma lista que `app/[slug]/page.tsx`)"* — así que
agregar las dos columnas en **un solo** select y no en el otro **rompe una invariante escrita en el
repo**, no solo D-13. Van en los dos.

**Analog D — el mount (`:173-183`, verbatim):**

```tsx
  ) : (
    <BookingClient
      business={publicBusiness}
      services={visibleServices}
      professionals={visibleStaff}
      timeBlocks={timeBlocks || []}
      exceptions={exceptions || []}
      locations={locations || []}
      professionalServices={professionalServices || []}
      timeBlockServices={timeBlockServices || []}
    />
  )
```

Mismo `|| []`. Ojo: acá `business` es `publicBusiness` (ya derivado), no el `as unknown as` del
público — las dos columnas nuevas tienen que sobrevivir esa derivación (el planner debe verificar
cómo se arma `publicBusiness` en este archivo).

> **Trap P-5:** el plan debe tratar los dos RSC como **una sola tarea**, no dos. El síntoma del
> defecto es: `/web` muestra lista plana mientras `/{slug}` muestra grupos.

---

### 3. `app/[slug]/booking-client.tsx` — la prop, el `useMemo` y el render agrupado

#### 3a. Prop opcional que degrada — analog: `timeBlockServices` (`:37-45`, verbatim)

```ts
  // Mapeo franja↔servicio (vista acotada public_time_block_services, migr. 071 §3). Se interpreta
  // con la regla del comodín (lib/time-block-services): 0 filas para una franja = sirve para todos
  // los servicios. (…) Opcional a propósito: el BookingClient de fallback del
  // LandingRenderer no la pasa; cuando falta se degrada a la puente vacía ⇒ regla del comodín ⇒ todo
  // agendado, que es el comportamiento previo a la migr. 071. El fail-safe es DIRECCIONAL: un dato
  // ausente nunca puede apagar el catálogo.
  timeBlockServices?: TimeBlockService[]
```

**El camino completo de la prop, para copiar entero:**

| Eslabón | Línea | Forma |
|---|---|---|
| import del tipo | `:8` | `import type { PublicBusiness, Service, …, TimeBlockService } from '@/lib/types'` |
| declaración | `:45` | `timeBlockServices?: TimeBlockService[]` (con `?`, dentro de `interface Props`) |
| defaulting **en el punto de consumo** | `:578` | `hasScheduleCoverage(service.id, timeBlocks, timeBlockServices ?? [])` |
| call site público | `page.tsx:176` | `timeBlockServices={timeBlockServices || []}` |
| call site preview | `web/page.tsx:181` | `timeBlockServices={timeBlockServices || []}` |

⚠ Dos detalles medidos que el planner no puede invertir:

1. El `?? []` va **en el punto de consumo**, NO en la desestructuración de props (el componente no
   desestructura con defaults; `:578` lo aplica inline).
2. El **tipo correcto para esta fase es `CatalogCategory`** (`lib/service-categories.ts:99-103`), NO
   `ServiceCategory`. Medido: `CatalogCategory` es `{ id: string; name: string; sort_order?: number | null }`
   y su docblock dice verbatim *"la fila de `public_service_categories` entra tal cual"*.
   `ServiceCategory` exige `created_at`, que la vista no expone → obligaría a un cast mentiroso.
   El import viene de `@/lib/service-categories`, no de `@/lib/types`.
3. El comentario de `timeBlockServices` menciona *"el BookingClient de fallback del LandingRenderer"*
   — **ese fallback ya no existe** (quick 260913-3tv). El comentario de la prop nueva **no debe
   copiar esa justificación caduca**: la razón vigente es el `|| []` de una lectura que falla + el
   tipo opcional como declaración de "el dato ausente degrada" (D-15).

#### 3b. La llamada a `groupCatalog` — analog: `categorias-manager.tsx:212-217` (verbatim)

```ts
  // La regla de agrupar vive en groupCatalog (no se reimplementa acá). Los dos modos pueden llegar
  // `undefined` y la función ya lo cubre campo por campo. En el camino de la identidad (ninguna
  // categoría con servicios) devuelve un único grupo con `categoryId` nulo: son todos sueltos.
  const groups = groupCatalog(services, categories, { categories: categorySortMode, services: serviceSortMode })
```

**Analog memoizado** (el componente con formulario que re-renderiza en cada tecla) —
`app/(dashboard)/settings/settings-client.tsx:1968-1975` (verbatim):

```ts
  const manageableServices = useMemo(
    () => groupCatalog(
      nonCanchaServices(services, canchasFromData(services, professionals, agendaSpaces)),
      serviceCategories,
      { categories: categorySortMode, services: serviceSortMode },
    ).flatMap(g => g.services),
    [services, professionals, agendaSpaces, serviceCategories, categorySortMode, serviceSortMode],
  )
```

`BookingClient` re-renderiza en cada tecla del paso 4 (`:83-86`) y ya importa `useMemo` (`:3`
verbatim: `import { useState, useEffect, useMemo, useRef, useId } from 'react'`) → **el molde a copiar
es el memoizado**, con las 4 dependencias: `[services, serviceCategories, business.category_sort_mode, business.service_sort_mode]`.

**La regla del tercer argumento (D-10 / CAT-07)** — `lib/service-categories.ts:275-285`, verbatim el
comentario que la escribe:

```ts
  // Campo por campo con `??`, y NO con `{ ...DEFAULT_SORT_MODES, ...modes }`: el spread NO cae al
  // default cuando la clave EXISTE con valor `undefined` — la pisa con `undefined`. Y ése es
  // justamente el call site natural de las Phases 23/24 (…)
  const modoCategorias = modes?.categories ?? DEFAULT_SORT_MODES.categories
  const modoServicios = modes?.services ?? DEFAULT_SORT_MODES.services
```

→ **El `??` per-field vive DENTRO de `groupCatalog`.** El call site escribe un **objeto literal**
`{ categories: …, services: … }` y nada más. Regla enunciable para el gate: *ningún call site de
`groupCatalog` puede contener un spread en su tercer argumento.* Medido: los 2 call sites de
producción existentes (`categorias-manager.tsx:217`, `settings-client.tsx:1969`) cumplen; el tercero
(`settings-client.tsx:2009`) llama con **dos** argumentos, que también es legal.

#### 3c. El render agrupado — analog: `categorias-manager.tsx:754-757 / 895 / 945`

Es el **problema hermano** (mismo `groupCatalog`, mismo dominio, otra superficie). Lo que se copia
son **estrategia de key y forma del anidado**, no las clases (el panel es un `<ul>` de chips; el
público es un grid de tarjetas y el UI-SPEC prohíbe `<ul>/<li>` acá — G-24 §Accesibilidad).

```tsx
            <ul className="space-y-2">
              {categoriasOrdenadas.map((c, i) => {
                …
                const suyos = serviciosPorCategoria.get(c.id) ?? []
                return (
                  <li key={c.id}
```

y el nivel interno (`:894-897`):

```tsx
                      <ul className="flex flex-wrap gap-2 px-2 pb-2" role="list">
                        {suyos.map(s => (
                          <ServiceChip
                            key={s.id}
```

**Lo que se lleva a la Phase 24:**

- **Key del nivel externo = id estable, nunca el índice.** En el panel es `c.id`; acá el grupo puede
  tener `categoryId: null`, así que el molde se adapta a `key={group.categoryId ?? '__sueltos__'}`
  (único por construcción: `groupCatalog` emite **como máximo un** grupo con `categoryId` nulo —
  Regla 1 `:316-318`, Regla 2 solo empuja ids no nulos `:335`, Regla 3 empuja a lo sumo uno `:340-346`).
  **Prohibido `key={index}`**: con modo alfabético la posición del grupo cambia entre renders.
- **Key del nivel interno = `service.id`**, sin cambios respecto de hoy (`:588`). La unicidad entre
  grupos la garantiza el consumo del bucket (`:327-335`, el `porCategoria.delete(c.id)`).
- **El espaciado entre grupos vive en el contenedor externo** (`space-y-*` en el panel). El UI-SPEC
  fija los valores de esta fase: `div.space-y-6` > `div` (uno por grupo) > `h3.mb-2` + `div.grid`.
  ⚠ El envoltorio por grupo es **obligatorio**: con un `<Fragment>` el margen de 24px cae entre el
  título y sus propias tarjetas (Regla 3 del UI-SPEC §"Regla para el que toque esta región después").

#### 3d. El bloque que NO cambia — `booking-client.tsx:587-661`

Leído verbatim esta sesión. Contrato G-23-6 vivo en el código (`:602-612` el comentario, `:621` el
pseudo-elemento, `:624/:627` el `min-w-0`/`shrink-0`, `:639-647` `ServiceDescription` **hermana** del
botón con `toggleClassName="relative z-10 …"`, `:656-660` el motivo hermano con `aria-describedby`).

**Regla operativa para el executor:** `git diff -w` sobre `:587-661` tiene que quedar **vacío**. El
único cambio permitido ahí es re-indentación.

---

### 4. Gates de texto (invariantes grep-style) — analog: `test/shell-scope.test.ts`

El entorno de Vitest es `node` (`vitest.config.mts`): **sin jsdom, sin Testing Library**, y el
milestone prohíbe agregar paquetes. El molde para afirmar cableado es **leer el archivo fuente**.
Verbatim, `:54-59`:

```ts
// El contrato puro de arriba puede estar verde con el helper DESCONECTADO (…) El
// entorno de Vitest de este repo es `node` (vitest.config.mts): no hay DOM, no hay Testing Library y
// el milestone prohíbe agregar paquetes, así que el cableado NO se puede probar renderizando. Se
// afirma leyendo el código fuente, mismo mecanismo que test/auth-email-templates.test.ts.
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
```

y el estilo de aserción acotada (`:90-120`):

```ts
  it('DialogContent consume el scope del shell activo', () => {
    // Previene: que alguien borre el hook y el popup vuelva a montarse sin los tokens del shell.
    expect(dialog).toMatch(/const\s+\w+\s*=\s*useShellScope\(\)/)
  })
  …
    const popupAt = dialog.indexOf('data-slot="dialog-content"')
    …
    const popupBlock = dialog.slice(popupAt, propsAt)
    expect(popupBlock).toMatch(/className=\{cn\(\s*portalScopeClass\(\w+\)/)
```

**Tres lecciones de este analog que el planner debe heredar:**

1. Cada `it` lleva un comentario **"Previene: …"** que nombra la regresión concreta.
2. **La aserción se acota al bloque**, no al archivo entero: el comentario de `:105-110` documenta que
   `lastIndexOf` sobre el archivo completo *"se satisface con un COMENTARIO que mencione el helper"*.
   Aplicado acá: un gate sobre `groupCatalog` debe mirar el bloque del `useMemo`, no el archivo.
3. Hay un barrido de **unicidad sobre todas las fuentes del repo** (`fuentesDelRepo()`, `:69-82`) para
   que "se monta en un solo lugar" sea un invariante y no una afirmación sobre el archivo que alguien
   miró. Es el molde para *"ningún call site de `groupCatalog` tiene spread en el 3er argumento"*.

**Gates concretos que este molde habilita para la Phase 24** (medidos, listos para el planner):

| Gate | Forma correcta | Por qué |
|---|---|---|
| La grilla del paso 1 pasa a una columna | **contar**: `sm:grid-cols-2` en `booking-client.tsx` va de **2 ocurrencias a 1** — [medido esta sesión: `grep -n "sm:grid-cols-2"` → `:567` y `:749`] | Un gate *"la clase ya no está"* es **incorrecto** y empuja a borrar la ocurrencia equivocada (`:749` = picker de sedes del paso 3, **fuera de alcance**) |
| Las dos columnas están en los DOS selects | `expect(publicPage).toContain('category_sort_mode')` y `expect(webPage).toContain('category_sort_mode')` (idem `service_sort_mode`) | P-2: los dos RSC usan columnas explícitas; la columna nueva no llega sola y el fallo es **silencioso** |
| Ningún spread en el 3er arg de `groupCatalog` | barrido de fuentes al estilo `fuentesDelRepo()` + regex sobre el call | D-10 / CAT-07 |
| La lectura pública NO ordena por `created_at` | el bloque de la lectura de `public_service_categories` no contiene `created_at` | P-3: la query fallaría y el catálogo se desagruparía en silencio |
| El `<h3>` se condiciona solo por `group.title !== null` | el bloque del paso 1 no contiene `serviceCategories.length` ni `group.services.length` | P-1: el helper que responde "no" para todo — ya mordió dos veces en este repo |

---

### 5. `test/preview-booking-parity.test.ts` — el caso de paridad preview ↔ público

**Analog:** el propio archivo. Cabecera verbatim (`:19-27`):

```ts
// ── El PIN de la paridad preview ↔ página pública (quick 260913-3tv) ─────────────────────────────
//
// `lib/preview-booking.ts` REPRODUCE los WHERE de las vistas acotadas del público sobre las tablas
// base (…) El riesgo obvio de reproducir una definición SQL en TypeScript es quedar desfasado en silencio el día
// que la vista cambie su WHERE o su proyección. Este archivo es el que lo impide: compara la
// derivación contra lo que las vistas devuelven DE VERDAD.
```

y el gate de entorno (`:52`):

```ts
describe.skipIf(!hasSupabaseCreds)('paridad preview ↔ vistas públicas (quick 260913-3tv)', () => {
```

**Qué copiar:** el `describe.skipIf(!hasSupabaseCreds)`, los **dos roles de lectura** (anon sin sesión
para las vistas `public_*`; anon-key **autenticado como el dueño** para las tablas base — nunca
`t.admin`, que bypassa RLS y haría pasar el test con las policies rotas), y la disciplina declarada en
`:41-43`: **cada caso assertea PRIMERO que la lectura trajo filas**, porque un `[]` de RLS es
indistinguible de una proyección correcta.

Para esta fase el caso nuevo es: `service_categories` (tabla base, sesión del dueño) devuelve **el
mismo conjunto de `id`** que `public_service_categories` (anon) para el mismo tenant — más el assert
de que las dos columnas de orden llegan por los **dos** selects.

---

## Shared Patterns

### S-1 — El fail-safe DIRECCIONAL (`|| []` server, `?? []` cliente)

**Fuente:** `app/[slug]/page.tsx:104-110` + `booking-client.tsx:37-45,570-578` + el docblock de
`lib/service-categories.ts:258-267` (verbatim):

```
 * ⚠ **INVARIANTE DE CONSERVACIÓN — todo servicio de la entrada aparece EXACTAMENTE UNA VEZ en la
 * salida.** (…) JAMÁS se descarta. Éste es el modo de falla que ya mordió DOS veces en este repo (CR-01
 * del code review de la Phase 20, y otra vez en la 21): un helper que responde "no" para todo y
 * apaga el catálogo entero, en silencio. Acá el peor caso posible es "se ve como hoy", nunca "no se
 * ve nada".
```

**Aplica a:** las dos lecturas nuevas, la prop nueva y el render. Regla: **el dato ausente desagrupa,
nunca apaga**. `|| []` del lado servidor (8/8 en `page.tsx`), `?? []` en el punto de consumo del
cliente (`:578`).

### S-2 — Columnas explícitas en los selects de negocio (nunca `select('*')`)

**Fuente:** `app/(dashboard)/web/page.tsx:38-46` (el comentario largo: un `'*'` publicaría
`notification_email`, `plan_status`, `mp_subscription_id`… en el payload RSC) + `app/[slug]/page.tsx:57-59`.
**Aplica a:** las dos adiciones de `category_sort_mode, service_sort_mode`. Se agregan **al final** de
cada lista, en los **dos** archivos, en la misma pasada.

### S-3 — El comentario que explica el *por qué*, en español

**Fuente:** todo el repo; el ejemplo denso más cercano es `booking-client.tsx:602-612` y `:648-655`.
**Aplica a:** la lectura nueva (qué vista, qué migración, qué pasa si falla), la prop nueva (por qué
opcional, por qué `CatalogCategory` y no `ServiceCategory`), y el `useMemo` (por qué objeto literal y
no spread).

### S-4 — Escape del texto del dueño

**Fuente:** el patrón del repo es **interpolación JSX** (`booking-client.tsx:546`:
`{business.type || getVerticalLabel(business)}` con el comentario *"Interpolado en JSX → auto-escape
de React"*).
**Aplica a:** `{group.title}` en el `<h3>`. **`dangerouslySetInnerHTML` prohibido sin excepción**
(T-23-06 / T-23-10 / T-23-26). El literal `Otros` nunca se escribe en el JSX: viene de
`OTHER_GROUP_TITLE` (`lib/service-categories.ts:80`).

---

## Trampas que vienen de upstream (que el planner NO puede perder)

1. **DOS `sm:grid-cols-2` byte-idénticos** en `booking-client.tsx`: `:567` (paso 1, **EN** alcance) y
   `:749` (picker de sede del paso 3, **FUERA**). [medido esta sesión]. Buscar-y-reemplazar está
   prohibido; el gate **cuenta 2 → 1**.
2. **`.order('created_at')` NO se copia** del panel (`servicios/page.tsx:35`) a la lectura pública:
   `public_service_categories` no proyecta esa columna (migr. `078:322-327`) → query en error → `|| []`
   → catálogo desagrupado **en silencio** (P-3).
3. **El tipo de la prop es `CatalogCategory`**, no `ServiceCategory` (`created_at` obligatorio).
4. **`app/themes.css` se importa sin capa** (`app/layout.tsx:12`) y pisa el `font-weight` de `h3` por
   theme (`themes.css:150` → 500 en `spa`; `:251` → 600 en `data-font="elegante"`). La jerarquía del
   título descansa en el **tamaño** (14px vs 20px), no en el peso. No hardcodear `uppercase` ni
   `tracking-*`: también los pone el theme (`themes.css:201,251`).
5. **El comentario de `timeBlockServices` (`:41-43`) cita un call site que ya no existe** (el fallback
   del `LandingRenderer`). Copiar el *molde*, no esa justificación.

---

## Metadata

**Scope de búsqueda:** `app/[slug]/`, `app/(dashboard)/{web,servicios,settings}/`, `lib/`,
`components/dashboard/`, `components/booking/`, `test/`.
**Archivos leídos verbatim esta sesión:** `app/[slug]/page.tsx` (`:55-115`, `:155-225`),
`app/[slug]/booking-client.tsx` (`:1-60`, `:545-670`), `app/(dashboard)/web/page.tsx` (`:30-60`,
`:90-195`), `lib/service-categories.ts` (`:95-115`, `:255-350`),
`components/dashboard/categorias-manager.tsx` (`:205-300`, `:748-950` parcial),
`app/(dashboard)/servicios/page.tsx` (`:25-45`), `app/(dashboard)/settings/settings-client.tsx`
(`:1960-1985`), `test/shell-scope.test.ts` (`:1-125`), `test/preview-booking-parity.test.ts` (`:1-80`).
**Tracked-source gate:** los 9 paths verificados con `git ls-files` — **todos tracked**, ninguno es un
mirror de `.gsd/capabilities/`.
**Fecha:** 2026-09-22.
