---
phase: 24
slug: el-catalogo-que-el-cliente-lee
status: approved
shadcn_initialized: true
preset: "style=base-nova · baseColor=neutral · cssVariables=true · rsc=true · iconLibrary=lucide"
created: "2026-09-22"
verified: "2026-09-22"
checker: "gsd-ui-checker — 7/7 dimensiones PASS"
ui_considerations: "22 applicable · 20 resolved (18 explicit + 2 backstop) · 2 diferidas por decision del usuario"
---

# Phase 24 — UI Design Contract

> Contrato visual y de interacción de la Phase 24 (CAT-08, CAT-09, CAT-10) sobre la **pantalla pública** del booking. Generado por gsd-ui-researcher, verificado por gsd-ui-checker.
>
> **El diseño ya está decidido.** `24-CONTEXT.md` trae **15 decisiones LOCKED (D-01…D-15)** de un `/gsd-discuss-phase` completo. Este documento las **materializa en un contrato verificable**: no reabre ninguna, no propone alternativas y no agrega superficie. Lo único que decide acá es lo que el CONTEXT delegó explícitamente (*"el tag HTML concreto de los títulos de grupo, el espaciado exacto entre grupos y las clases de Tailwind"*).
>
> **El design system YA EXISTE.** Cero dependencias, cero componentes instalados, cero migraciones, cero iconos, cero tokens nuevos. Todo lo prescripto sale de `app/globals.css`, `app/themes.css` y de la escala default de Tailwind v4, **medido esta sesión** contra el paquete instalado (ver `## Mediciones y procedencia`).
>
> **Idioma de la UI: español rioplatense.** El único texto que esta fase pinta es el nombre de categoría que escribió el dueño y el literal `Otros`.

---

## Alcance de la superficie

Un solo bloque de JSX, en un solo archivo. Nada más entra en este contrato.

| # | Bloque | Archivo | Qué pasa | Decisión |
|---|--------|---------|----------|----------|
| **A** | **Título de grupo** — el nombre de la categoría (o `Otros`) arriba de sus tarjetas | `app/[slug]/booking-client.tsx`, dentro de `{step === 1 && …}` (`:564-666`) | **NUEVO** (`<h3>`) | D-01, D-02, D-03, D-04, D-12 |
| **B** | **La grilla del paso 1 pasa a una columna** | `app/[slug]/booking-client.tsx:567` | **CAMBIA una clase** | D-05, D-06, D-07, CAT-10 |
| **C** | **La tarjeta de servicio** | `booking-client.tsx:587-661` | **NO CAMBIA** — sólo se re-indenta | D-05, D-08, G-23-6 heredado |
| **D** | **El preview del panel** (`/web`) | `app/(dashboard)/web/page.tsx:182` | **recibe el mismo dato** — cero CSS propio | D-13, D-14 |

**Fuera de este contrato, explícitamente:**

- El **funnel**: sigue teniendo 4 pasos (servicio → profesional → día → horario). La categoría **no** es un paso y **no** es un filtro.
- Los **pasos 2, 3 y 4** de `booking-client.tsx`. En particular **`:749`** (`grid grid-cols-1 sm:grid-cols-2 gap-3`, el selector de sede/consultorio del paso 3) es **una segunda ocurrencia byte-idéntica a la de `:567` y NO se toca**. Ver `## Regla para el que toque esta región después`.
- `components/booking/service-description.tsx` — **no se toca** (D-08).
- `app/[slug]/canchas-booking-client.tsx` — la superficie pública del vertical canchas es **otro** componente y quedó fuera por decisión escrita de la Phase 23 (23-UI-SPEC, *"El vertical canchas queda AFUERA"*). Esta fase **no** lo agrupa.
- `components/landing/landing-renderer.tsx` — no monta `BookingClient` y no cambia (`:71-78`).
- `components/ui/*` — **prohibido `npx shadcn add`** en esta fase.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn `4.10.0` (ya inicializado — `components.json` presente) |
| Preset | `style: base-nova` · `baseColor: neutral` · `cssVariables: true` · `rsc: true` |
| Component library | `@base-ui/react 1.5.0` (primitivas) + `@/components/ui` (shadcn vendorizado) |
| Styling | Tailwind CSS **v4.3.0** — config CSS-first en `app/globals.css`, **sin** `tailwind.config` |
| Icon library | `lucide-react 1.17.0` — única librería. **Esta fase no agrega ningún icono** |
| Font (cuerpo) | `var(--font-sans)` → `--font-grotesk`, fallback `system-ui, sans-serif` |
| Font (títulos) | `var(--font-heading)` → `--font-archivo`, aplicada a `h1, h2, h3` por `@layer base` (`app/globals.css:269`) |
| Helper de clases | `cn()` de `@/lib/utils` |
| Registries de terceros | **ninguno** (`components.json → "registries": {}`, verificado 2026-09-22) |
| Temas / paletas | 5 themes (`forjo`/`modern`/`spa`/`cyber` + `data-font`) × 5 paletas × claro-oscuro ⇒ **cero hex hardcodeado** |

---

## Component Inventory

Enumerated by `ls components/ui/*.tsx` — 17 components — shadcn@4.10.0 (vendorizado en `components/ui/`, versión por `node -p "require('./node_modules/shadcn/package.json').version"`) — 2026-09-22.

> shadcn no es una dependencia con `exports`: instala **archivos** en el repo, así que la enumeración re-ejecutable es el listado del directorio.
>
> Lista **no exhaustiva** de componentes conocidos-buenos, **nunca una allowlist cerrada**: el ejecutor puede usar cualquier cosa que el design system exporte, y chequear uno que no esté en la tabla es el camino esperado.

**Esta fase no monta ni un solo componente del inventario.** El agregado es un `<h3>` de HTML plano y un `<div>` envoltorio. La tabla queda para declarar lo que había disponible y que se decidió **no** usar.

| Component | Import path | Notes |
|-----------|-------------|-------|
| `Badge` | `@/components/ui/badge` | **No se usa.** D-01 prohíbe el contador de servicios en el título |
| `Separator` | `@/components/ui/separator` | **No se usa.** D-01 prohíbe la línea divisoria entre grupos; el corte lo hace el aire |
| `Card` | `@/components/ui/card` | **No se usa.** La tarjeta del paso 1 es un `<div>` con clases propias bajo contrato G-23-6; envolverla en `Card` la reescribiría |
| `Button` | `@/components/ui/button` | **No se usa.** El botón de selección es un `<button>` con el pseudo-elemento estirado (G-23-6), no un `Button` |
| `Tabs`, `Dialog`, `Select`, `Input`, `Label`, `Textarea`, `Table`, `Avatar`, `Calendar`, `Drawer`, `Sonner`, `Separator`, `PasswordInput`, `ShellScope` | `@/components/ui/*` | Fuera de alcance de esta fase |

**Piezas in-repo que esta fase SÍ consume (ninguna es del design system):**

| Pieza | Path | Rol |
|---|---|---|
| `groupCatalog`, `OTHER_GROUP_TITLE`, `CatalogCategory`, `CatalogGroup` | `lib/service-categories.ts` | Fuente única del agrupado y del orden. Se **consume**, no se reimplementa |
| `ServiceDescription` | `components/booking/service-description.tsx` | **No se toca** (D-08) |
| `hasScheduleCoverage` / `isServiceStaffed` | `lib/time-block-services`, `lib/staff-services` | Los dos ejes de cobertura de la tarjeta. **No se tocan** (D-12 depende de eso) |

---

## Spacing Scale

Escala del proyecto (`--spacing: 0.25rem` = 4px, default de Tailwind v4 — **no hay override** en `app/globals.css`). **Sólo múltiplos de 4 en el código nuevo.**

| Token Tailwind | Value | Uso en esta fase |
|----------------|-------|------------------|
| `mb-2` | **8px** | Título de grupo ↔ su primera tarjeta. **NUEVO** |
| `gap-3` | 12px | Tarjeta ↔ tarjeta dentro de un grupo (**existente**, `:567`, no se toca) |
| `space-y-6` | **24px** | Grupo ↔ grupo. **NUEVO** |
| `p-4` | 16px | Padding interno de la tarjeta (**existente**, `:590`) |
| `px-6` / `py-8` | 24px / 32px | Contenedor del wizard (**existente**, `:551`) |
| `mb-4` | 16px | `h2` "Elegí tu servicio" ↔ el contenido de abajo (**existente**, `:566`) |

**Por qué 24 arriba y 8 abajo, y no al revés.** El agrupado se lee por **proximidad**, no por una línea (D-01 la prohíbe). La distancia del título a **sus** tarjetas (8px) tiene que ser notoriamente menor que la distancia al grupo anterior (24px) y menor que la que separa tarjetas hermanas (12px): 8 < 12 < 24 es la única escalera que hace que el título se lea pegado a lo que titula. Los tres valores caen en la grilla de 4.

**Excepciones: ninguna.** Prohibido en el código nuevo: `space-y-5`, `mb-1.5`, `mt-[18px]` y cualquier valor arbitrario fuera de la grilla de 4. Los **grosores de trazo** (`border-*`, `ring-*`) no son espaciado y esta fase **no agrega ninguno** — D-01 prohíbe la divisoria.

**El primer grupo no lleva aire extra, y eso es estructural, no cosmético.** En Tailwind v4.3.0 `space-y-6` compila a `:where(& > :not(:last-child)) { margin-block-end: … }` — margen **inferior** en todos los hijos **salvo el último** [medido esta sesión en `node_modules/tailwindcss/dist/lib.js`]. Con un solo grupo (el camino de cero categorías) ese único hijo **es** el último ⇒ **no se emite un solo píxel de margen**. De eso depende G-24-2.

---

## Typography

**La fase no agrega ningún tamaño ni ningún peso nuevo a la pantalla:** `text-sm` ya se renderiza en el header del negocio (`booking-client.tsx:545`) y `font-bold` ya está en el `h2` (`:566`) y en el precio (`:627`). Lo único nuevo es una **combinación** que ya existe en el repo.

| Role | Clase | Size | Weight | Line height | Dónde |
|------|-------|------|--------|-------------|-------|
| Display (`h1`) | `text-[clamp(22px,6vw,34px)] font-black` | 22–34px | 900 | 1.05 | Nombre del negocio (`:543`). **EXISTENTE** |
| Heading de paso (`h2`) | `text-xl font-bold` | 20px | 700 | 28px (1.4) | "Elegí tu servicio" (`:566`). **EXISTENTE** |
| **Título de grupo (`h3`)** | **`text-sm font-bold`** | **14px** | **700** | **20px (1.43)** | **NUEVO — nombre de categoría y "Otros"** |
| Nombre del servicio | `font-semibold` (hereda el base) | 16px | 600 | 24px | `:625`. **EXISTENTE** |
| Precio | `text-lg font-bold` | 18px | 700 | 28px | `:627`. **EXISTENTE** |
| Support | `text-xs` | 12px | 400 | 16px | Duración, descripción, motivo de deshabilitado. **EXISTENTE** |

Valores de la escala default de Tailwind v4 [medidos en `node_modules/tailwindcss/theme.css:347-356`]: `--text-xs: 0.75rem`, `--text-sm: 0.875rem` (lh `1.25/0.875`), `--text-base: 1rem`, `--text-lg: 1.125rem`, `--text-xl: 1.25rem`. `app/globals.css` **no redefine ninguno**.

### Por qué 14px y no 16px — y por qué la jerarquía NO puede descansar en el peso

`text-base` (16px) también sería "más chico que el `h2`" (D-01), pero **empata en tamaño con el nombre del servicio** (`:625`, 16px `font-semibold`): el título del grupo y el título de la tarjeta quedarían al mismo cuerpo, separados sólo por 100 unidades de peso. A 14px la distinción es de **tamaño**, que es lo único que sobrevive a los themes:

> `app/themes.css:150` → `[data-theme="spa"] h1, [data-theme="spa"] h2, [data-theme="spa"] h3 { font-weight: 500 }`
> `app/themes.css:251` → `[data-font="elegante"] … h3 { font-weight: 600 }`
>
> `themes.css` se importa **sin `@layer`** (`app/layout.tsx:12`), así que sus reglas ganan sobre **cualquier** utilidad de Tailwind (los estilos sin capa vencen a los de capa). Con `data-theme="spa"` el `font-bold` del `h3` **se renderiza en 500** — exactamente lo mismo que ya le pasa al `h2` de `:566`, que también escribe `font-bold`. **El peso es theme-dependiente; el tamaño no.** Una jerarquía apoyada en "el título es más negrita" se cae en 2 de los 5 themes; apoyada en 20px vs 14px, no se cae en ninguno.

`font-bold` se escribe igual (es el peso correcto en el theme default y el que pide D-01 — *"solo el nombre en negrita"*), pero **no es el portador de la jerarquía**.

### Lo que el `h3` NO lleva, y por qué

| No lleva | Por qué |
|---|---|
| `font-[family-name:var(--font-heading)]` | `app/globals.css:269` (`@layer base`) ya le da `var(--font-heading)` a `h1, h2, h3`. El `h2` de `:566` lo escribe explícito y es **redundante** — resuelve a la misma custom property. Escribirlo de nuevo sería ruido; **quitárselo al `h2` está fuera de alcance** |
| `uppercase` | La mayúscula la pone **el theme**: `themes.css:201,251` (`[data-theme="cyber"] h3`, `[data-font="tech"] h3`) con su `letter-spacing:.03em`. Hardcodearla rompería los otros 3 themes. Es la misma regla que el comentario del `h1` en `:541` ya deja escrita |
| `text-muted-foreground` | D-01 dice *"solo el nombre en negrita"*. Apagar el título con muted lo convierte en una etiqueta de sistema; además `--muted-foreground` mide **4.99:1** contra la superficie más oscura y `--foreground` mide **16.2:1** [contrastes medidos en la Phase 23, `23-UI-SPEC.md` §Color] — con el título en color de texto normal el margen de AA no se discute |
| `tracking-*` | El `letter-spacing: -0.02em` de `@layer base` ya aplica, y los themes lo reescriben cuando corresponde |
| `text-balance`, `truncate`, `line-clamp-*` | Ningún recorte en el título: D-11 y CAT-09 mandan que nada se esconda, y un nombre recortado es un nombre escondido a medias |

### `break-words` es obligatorio, no decorativo

**Medido esta sesión: el nombre de categoría NO tiene tope de longitud en ningún lado.** El `Input` del alta (`components/dashboard/categorias-manager.tsx:967`) y el del renombrado (`:813`) **no declaran `maxLength`**, y `supabase/migrations/078_service_categories.sql` **no tiene ningún `CHECK` de `char_length`** sobre `service_categories.name`. O sea: una cadena larga **sin espacios** llega al `<h3>` público tal cual, y a 375px el ancho interior del wizard es de **327px** (375 − 24 − 24 de `px-6`).

Ese es el modo de falla de **G-23-21**, que en este repo ya se pagó **dos veces** (la descripción en G-23-6 se salvó por accidente y el nombre del panel se salió 36.88px medidos). El `h1` del negocio (`:543`) ya lleva `break-words` por ese mismo motivo: acá se **copia el precedente**, no se inventa nada.

### Markup canónico del título

```tsx
<h3 className="text-sm font-bold break-words mb-2">{group.title}</h3>
```

Nada más. `{group.title}` **interpolado** (auto-escape de React): el nombre es texto del dueño que lee un anónimo — T-23-06 / T-23-10 / T-23-26, `closed`. **`dangerouslySetInnerHTML` está prohibido en esta región, sin excepción.** El literal `Otros` **nunca** se escribe en el JSX: viene en `group.title` desde `OTHER_GROUP_TITLE` (`lib/service-categories.ts:80`).

---

## Color

Todo por custom property. **Cero hex en el código nuevo.** Esta fase **no introduce un solo color**: el `h3` hereda `--foreground` del `body` y no declara clase de color.

| Role | Token | Light (`forjo`) | Uso en esta pantalla |
|------|-------|-----------------|----------------------|
| Dominant (60%) | `--background` / `--card` | `#f3ead8` / `#fbf3e3` | Fondo de la página y de cada tarjeta habilitada |
| Secondary (30%) | `--secondary` | `#e9ddc4` | Pista de la barra de progreso (`:558`) y fondo de la tarjeta deshabilitada (`bg-secondary/30`, `:592`) |
| Accent (10%) | `--primary` / `--ring` | por paleta (default `#d94a2b`) | **Sólo cuatro cosas, todas preexistentes** (lista abajo) |
| Texto primario | `--foreground` | `#1a1714` | Nombre del negocio, `h2`, **el título de grupo**, nombre del servicio, precio |
| Texto secundario | `--muted-foreground` | `#6b6253` | Duración, descripción, motivo de deshabilitado |

**Acento reservado, en esta pantalla, para exactamente esto — y la fase no le suma un quinto uso:**

1. La **banda del hero** del negocio (`bg-primary`, `:518`).
2. La **barra de progreso** del paso (`bg-primary`, `:559`).
3. El **borde y el fondo tenue de la tarjeta seleccionada** (`border-primary bg-primary/[0.06]`, `:594`) y el `hover:border-primary` (`:595`).
4. El **anillo de foco** (`focus-visible:after:ring-ring/50`, `:621`), global y preexistente.

**NO llevan acento, deliberadamente: el título de grupo, el grupo "Otros", y cualquier cosa que esta fase agregue.** Motivo doble: D-01 (el título no le roba peso a las tarjetas, que son lo único clickeable) y la medición del 19-UI-SPEC —`text-primary` a cuerpo chico **falla AA en 3 de las 5 paletas** (red 3.54:1, green 3.59:1, yellow 2.36:1)—, que es exactamente el tamaño en el que viviría el título.

**Contrastes que aplican al elemento nuevo** (medidos en la Phase 23, `23-UI-SPEC.md` §Color, light, theme `forjo`):

| Par | Ratio | Requisito | Resultado |
|-----|-------|-----------|-----------|
| `--foreground` sobre `--background` / `--card` | 16.2:1 | 4.5:1 (texto normal, 14px) | ✓ AAA |

**Ningún estado nuevo se comunica por color** (WCAG 1.4.1): esta fase no agrega estados. El grupo "Otros" se distingue por **su texto** (`Otros`) y por **su posición** (último), nunca por un color, un borde punteado o una opacidad — D-03 exige que se vea **idéntico** a una categoría real.

---

## El contrato, entrada por entrada

### G-24-1 — El título de grupo

- **Tag:** `<h3>`. Un nivel debajo del `h2` de `:566`, sin saltar niveles (D-04).
- **Ubicación:** **hermano** de la grilla, **dentro** del envoltorio del grupo y **siempre fuera de cualquier tarjeta**. Un `<h3>` adentro del `<div>` de la tarjeta metería un heading por servicio y anidaría contenido en la caja del botón estirado (G-23-6).
- **Clases, exactas:** `text-sm font-bold break-words mb-2`. Nada más.
- **Condición de render:** `group.title !== null`, y **nada más**. Prohibido `serviceCategories.length > 0`, `group.services.length > 0`, o cualquier otro condicional: la regla vive en el dato (`lib/service-categories.ts:108-112`) y un `if` sobre el largo del arreglo se olvida del caso "categorías creadas pero ninguna asignada", que `groupCatalog` ya manda al camino de identidad (`:312-318`).
- **Contenido:** `{group.title}`, interpolado. Sin prefijos, sin sufijos, sin contador, sin icono, sin línea, sin `aria-label` que difiera del texto visible.
- **No es sticky** (D-02): sin `sticky`, sin `top-*`, sin `z-*`, sin `backdrop-blur`. La región ya tiene sus capas resueltas y bajo contrato (`isolate` de la tarjeta + pseudo-elemento del botón + `z-10` del toggle); sumar un plano nuevo acá es reabrir G-23-6 por un efecto que nadie pidió.

### G-24-2 — La invariante de cero categorías, como propiedad chequeable

Con `serviceCategories = []` —o con categorías creadas pero **ninguna asignada**— `groupCatalog` devuelve **exactamente un grupo** con `title: null` y la lista tal cual llegó (`lib/service-categories.ts:315-318`, testeado en `test/service-categories.test.ts:228-269`). De ahí salen **tres propiedades verificables**, no tres esperanzas:

| # | Propiedad | Cómo se comprueba |
|---|-----------|-------------------|
| P1 | **Cero `<h3>` en el DOM del paso 1** | `document.querySelectorAll('h3').length === 0` en `/{slug}` con un negocio sin categorías. El `<h3>` no se pinta porque `title` es `null` — no porque alguien se acordó de escribir un `if` |
| P2 | **Cero apariciones del literal `Otros`** | Regla 3 sólo empuja el grupo de sueltos **si hay grupos por categoría** (`:340-346`); en el camino de identidad no se llega a ejecutar |
| P3 | **Ni un píxel de desplazamiento vertical** | Los dos envoltorios nuevos (`div.space-y-6` y el `div` del grupo) son **cajas de bloque sin padding, sin margen y sin borde**, y `space-y-6` emite `margin-block-end` sólo en `:where(& > :not(:last-child))` [medido en tailwindcss 4.3.0]: con un hijo único, que además es el último, **no emite nada**. El `<div>` de la grilla queda a la misma distancia del `h2` que hoy |

**El límite honesto de esta invariante, dicho explícito:** en **desktop** y con cero categorías la pantalla **sí** cambia — las tarjetas pasan de dos columnas a una. Eso es **CAT-10 / D-05**, aplica a todos los casos y no es una excepción de este invariante. **En mobile (<640px) el render es byte-idéntico a hoy en el camino de cero categorías**, porque la grilla ya era de una columna por debajo del breakpoint `sm` [`--breakpoint-sm: 40rem` = 640px, medido en `node_modules/tailwindcss/theme.css`].

### G-24-3 — La tarjeta a ~432px: cambia el ancho, y nada más

**El único cambio:** `booking-client.tsx:567`, `grid grid-cols-1 sm:grid-cols-2 gap-3` → `grid grid-cols-1 gap-3`. Se borra **un modificador**. La aritmética (derivada de las clases reales y de la escala default medida: `max-w-lg` = `--container-lg` = 32rem = 512px, `px-6` = 24px, `gap-3` = 12px, `p-4` = 16px):

| | Hoy (`sm:grid-cols-2`) | Después (`grid-cols-1`) |
|---|---|---|
| Ancho del contenedor (`:551`) | 512 − 24 − 24 = **464px** | **464px** |
| Ancho de columna | (464 − 12) / 2 = **226px** | **464px** |
| Ancho útil dentro de la tarjeta (`p-4` ×2) | 226 − 32 = **194px** | 464 − 32 = **432px** |

**Lo que NO puede cambiar** — la lista completa, porque un re-indentado grande invita a "limpiar" (P-4 de la RESEARCH):

| Invariante | Línea | Por qué |
|---|---|---|
| El contenedor es un `<div>`, no un `<button>`: `relative isolate rounded-lg border p-4 …` | `:588-596` | G-23-6. `isolate` encierra el z-index de la tarjeta |
| El botón de selección se estira con el pseudo-elemento: `after:absolute after:-inset-px after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring/50` | `:621` | El anillo de foco cae donde caía cuando la tarjeta entera era el botón |
| `ServiceDescription` es **hermana** del botón, con `toggleClassName="relative z-10 …"` | `:639-647` | Un `<button>` dentro de otro es HTML inválido, y un toque en "Ver más" elegiría el servicio |
| El párrafo del motivo es hermano, con su `id` referenciado por `aria-describedby` | `:617-620`, `:656-660` | D-12 depende de que cada tarjeta conserve su motivo a la vista |
| La precedencia `!enabled` **primero** en el `cn()` | `:588-596` | "Seleccionada y deshabilitada" es un estado inalcanzable; invertirlo pintaría un borde que el usuario no pudo producir |
| `min-w-0` en el bloque izquierdo y `shrink-0` en el derecho | `:624`, `:627` | Son los que reparten el ancho a cualquier medida; con 432px el nombre deja de partirse **por espacio**, no por una clase nueva |
| El "Ver más" sigue **midiendo** (`scrollHeight > clientHeight`) | `service-description.tsx` | D-08. **Nada de volver a un recorte por cantidad fija de renglones.** Consecuencia esperada, no un bug: a 432px una descripción de 120 caracteres entra sin desbordar y el toggle casi no va a aparecer en desktop; a 375px sigue apareciendo como hoy |

**Regla operativa, verificable y no opinable:** `git diff -w` sobre `booking-client.tsx:587-661` tiene que quedar **vacío**. Cualquier diferencia que no sea whitespace en ese rango es un cambio **no autorizado** por este contrato.

### G-24-4 — "Otros" se ve idéntico a una categoría real (D-03)

Mismo tag, **las mismas cuatro clases**, el mismo ritmo, las mismas tarjetas. La **única** diferencia permitida es la que pone el módulo puro: va **último** (Regla 3, `lib/service-categories.ts:340-346`). **Prohibido**: `text-muted-foreground`, `italic`, `opacity-*`, `border-dashed`, un separador arriba, un texto explicativo, o mandarlo a otra posición. El cliente no sabe —ni le importa— que al dueño le faltó clasificar esos servicios, y CAT-09 existe para que un servicio sin categoría **no se degrade**.

### G-24-5 — Un grupo donde nada se puede reservar se pinta igual (D-12)

Una categoría con **todos** sus servicios deshabilitados renderiza su `<h3>` **normal**, en su posición del orden, y cada tarjeta conserva su motivo (`Sin horarios disponibles` / `Sin profesional disponible`). **Prohibido**: `aria-disabled` en el heading (un heading no es un control y no tiene estado deshabilitado), un aviso en el título, un color apagado, o mandar el grupo al final. Esconder o degradar ese grupo le oculta el problema de configuración **justo al dueño**, que es la única persona que puede arreglarlo y que ve su propia web; y moverlo rompería el orden que CAT-08 promete respetar, por un estado transitorio.

### G-24-6 — Catálogo largo: nada (D-11)

El paso 1 **se scrollea con la página**. **Prohibido en esta fase**: índice de categorías, chips de salto, grupos colapsables, buscador, paginado, `max-h-*` con `overflow-auto` sobre la lista, y cualquier gate por cantidad de categorías. Un umbral inventado es una decisión de producto disfrazada de detalle de implementación, y colapsar esconde servicios detrás de un click que nadie pidió (roza el espíritu de CAT-09).

### G-24-7 — El preview de `/web` es fiel por construcción (D-13, D-14)

El preview tiene que mostrar el catálogo **agrupado bajo títulos y con el ancho nuevo**, no la lista plana. **Cero CSS propio para lograrlo**: `BookingClient` lleva su propio `max-w-lg mx-auto` (`:551`), así que montado dentro del contenedor del panel (`max-w-[1400px]`) ya se renderiza a los 512px reales, centrados. **Prohibido**: `transform: scale()`, un wrapper con ancho distinto, un zoom, o una variante "compacta" del paso 1. Lo único que le faltaba al preview era **el dato**.

**Síntoma del defecto que esta entrada previene (P-5):** `/web` muestra la lista plana mientras `/{slug}` muestra grupos. Es un preview que miente, y es la clase exacta de bug que el quick 260913-3tv vino a cerrar.

### G-24-8 — La fase no agrega superficie interactiva

Cero controles nuevos, cero iconos, cero componentes, cero dependencias, cero migraciones, cero animaciones, cero estados. El `<h3>` es texto inerte: **sin** `onClick`, **sin** `role`, **sin** `tabIndex`, **sin** `title` como tooltip. Si el plan agrega un control a esta región, se salió del contrato.

---

## Accesibilidad

| Punto | Decisión | Por qué |
|---|---|---|
| **Jerarquía de headings** | `h1` (nombre del negocio, `:543`) → `h2` ("Elegí tu servicio", `:566`) → **`h3` (título de grupo)**. Sin saltos. | Regla no negociable del proyecto (CLAUDE.md global). **Verificado: hoy no existe ningún `<h3>` en `app/[slug]/booking-client.tsx` ni en `app/[slug]/page.tsx`** — el `h3` nuevo es el primero de la página y no se cuela por encima de ninguno preexistente |
| **Semántica de agrupación, más allá del heading** | **Ninguna.** El grupo es un `<div>` pelado: **sin** `<section>`, **sin** `aria-labelledby`, **sin** `role="group"`, **sin** `role="list"`, **sin** `<ul>/<li>` | Tres motivos que se suman: (1) un `<section>` con nombre accesible es un **landmark `region`** — un negocio con 8 categorías metería 8 landmarks en el menú de landmarks del lector, que es ruido, no navegación; (2) los lectores de pantalla ya navegan esta pantalla **por headings**, que es justo lo que la fase agrega; (3) envolver las tarjetas en `<ul>/<li>` obligaría a tocar el bloque `:587-661`, que G-24-3 exige dejar verbatim |
| **Orden de foco** | Sin cambios. El DOM queda título → tarjetas del grupo → título siguiente → …, que es **el mismo orden visual** | No hay reordenamiento visual por CSS en esta fase (a diferencia de G-23-20 en el panel), así que no hay ninguna forma de introducir el salto hacia atrás de WCAG 2.4.3 que produjo WR-03 |
| **Grupo con todo deshabilitado** | El `<h3>` se anuncia **normal** (G-24-5). El estado lo lleva cada tarjeta: `disabled` nativo + el motivo enlazado por `aria-describedby` | Un heading no tiene estado deshabilitado; marcarlo mentiría sobre el rol del elemento |
| **Contraste** | `--foreground` sobre `--background`/`--card`: **16.2:1** (mínimo 4.5:1 para 14px) | Medido en la Phase 23. El título no usa muted ni acento (ver §Color) |
| **Targets táctiles** | Sin cambios: el `<h3>` no es interactivo y el área de selección de la tarjeta **crece** de 194px a 432px de ancho útil | Ningún target se achica |
| **Texto largo** | `break-words` en el `h3` (obligatorio, ver §Typography) | El nombre de categoría **no tiene tope** en el panel ni en la base [medido esta sesión] |
| **Zoom / reflow (WCAG 1.4.10)** | Mejora: a una sola columna el contenido reflowea mejor a 400% que con dos columnas de 226px | No se introduce ningún ancho fijo |
| **Movimiento** | Ninguna animación nueva. El `transition-colors` de la tarjeta (`:590`) no se toca | — |
| **Idioma** | El `<h3>` hereda el `lang` del documento. Sin `lang` propio | El nombre lo escribe el dueño en su idioma, que es el del sitio |

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | **La tarjeta entera es el control** — no hay botón con etiqueta. Copy **sin cambios**: nombre del servicio + precio + duración (`:625-631`) |
| Título de grupo | El `name` que escribió el dueño, **tal cual**, sin prefijo, sin sufijo, sin contador y sin transformar (la mayúscula la decide el theme) |
| Grupo de los sueltos | **`Otros`** — literal único, importado de `OTHER_GROUP_TITLE` (`lib/service-categories.ts:80`). **Nunca** un string literal en el JSX: dos literales serían dos nombres para el mismo grupo entre el panel y el público |
| Empty state — cero **categorías** | **Sin copy, a propósito.** La pantalla es la de hoy: la lista plana, sin títulos y sin "Otros" (CAT-07 / G-24-2) |
| Empty state — cero **servicios** | **Sin copy, y queda anotado como deuda preexistente** (ver abajo) |
| Error state | **Sin UI de error.** Si la lectura de categorías falla, el `\|\| []` deja cero categorías ⇒ `groupCatalog` cae en su camino de identidad ⇒ **la lista plana de hoy**. El cliente no tiene por qué enterarse de que una vista falló: el catálogo **sigue reservable**. Un error de lectura puede **desagrupar**, nunca **apagar** |
| Motivo de tarjeta deshabilitada | `Sin horarios disponibles` / `Sin profesional disponible` — **existente** (`:658`), no se toca (D-12) |
| Acciones destructivas | **Ninguna.** Esta fase no abre una sola superficie de escritura |

**Deuda anotada, NO se arregla acá:** con **cero servicios** el paso 1 renderiza el `h2` y una grilla vacía — pantalla en blanco, sin empty state. Es **preexistente** (hoy pasa lo mismo), ninguna de las 15 decisiones lo cubre, y escribir copy nueva de empty state es superficie que este contrato no tiene autorizada. Se registra como ⚠ en `## UI Considerations` para que no se pierda, no para que se cierre en esta fase.

---

## UI Considerations

> Probe de completitud de estados (eje UI), corrido el 2026-09-22 con `ui-consideration-probe.cjs`.
> **Elementos y sus tipos** — los tipos se corrigieron a mano tras la confirmación del usuario: el
> clasificador heurístico había dejado la lista agrupada y el preview en `unclassified` (levantaba 13
> consideraciones); con los tipos correctos levanta **22 y ninguna sin clasificar**. Esa corrección es
> el paso que hace sólida la cobertura — el cue automático es una señal, no una prueba.
>
> | ID | Superficie | Tipos |
> |----|-----------|-------|
> | **E1** | El título de grupo (`<h3>`) | `static-content` |
> | **E2** | La lista agrupada del paso 1 | `list-collection`, `static-content` |
> | **E3** | La tarjeta de servicio pública | `interactive-control`, `static-content` |
> | **E4** | El preview del catálogo en `/web` | `list-collection`, `static-content` |

**Applicable: 22 · resolved: 20 (18 explicit + 2 backstop) · unresolved: 2 (diferidas por decisión del usuario)**

| Category | Elem. | Status | Resolution / Reason |
|----------|-------|--------|---------------------|
| overflow | E1 | ✅ explicit | El `<h3>` es hermano del grid, a ancho completo del contenedor (432px desktop / 327px interior a 375px). No tiene contenedor de scroll propio |
| long-text | E1 | ✅ explicit | `break-words` es **obligatorio**, no decorativo: el nombre de categoría **no tiene tope** — sin `maxLength` en los dos `Input` del panel y sin `CHECK` en la migr. 078 [medido]. Es G-23-21 en su tercera aparición potencial; acá se ataja antes de que ocurra |
| empty | E2 | ✅ explicit | **Cero categorías:** `groupCatalog` devuelve un grupo con `title: null` ⇒ cero `<h3>`, cero "Otros", cero desplazamiento vertical (G-24-2, propiedades P1-P3). **Cero grupos vacíos:** la Regla 0 del módulo garantiza que ningún grupo de la salida está vacío |
| empty | E2 | ⚠ **unresolved** | **Cero SERVICIOS:** el paso 1 queda en blanco bajo el `h2`. **Preexistente — no lo crea esta fase.** Diferido por decisión explícita del usuario (2026-09-22): escribir copy de empty state es superficie que ninguna de las 15 decisiones autoriza, y un negocio sin ningún servicio activo no debería estar recibiendo reservas igual. Queda visible para una fase de copy del booking público |
| loading | E2 | ✅ explicit | No hay estado de carga: la página es RSC con `export const dynamic = 'force-dynamic'`, el HTML llega con el catálogo ya renderizado. **Sin skeleton y sin spinner nuevos** |
| error | E2 | ✅ explicit | La lectura de categorías falla ⇒ `|| []` ⇒ cero categorías ⇒ **lista plana**. El contrato es *"desagrupa, nunca apaga"*: el cliente ve el catálogo de hoy, no un error ni una pantalla vacía. Es la defensa contra el modo de falla que ya mordió dos veces en este repo (CR-01 de la Phase 20, y otra vez en la 21) |
| populated | E2 | ✅ explicit | N grupos separados por `space-y-6` (24px), cada título a `mb-2` (8px) de sus tarjetas, tarjetas en una columna a ~432px útiles |
| partial | E2 | ✅ explicit | Un servicio con `category_id` nulo, colgado, o de otro tenant cae en "Otros" y va último — invariante de conservación, ya testeada. **Ninguna tarjeta desaparece nunca** (CAT-09) |
| overflow | E2 | ✅ explicit | El paso 1 scrollea con la página (D-11): sin contenedor de scroll propio, sin colapsar, sin índice, sin paginado (G-24-6) |
| zero-one-many | E2 | ✅ explicit | **0** categorías ⇒ lista plana sin títulos · **1** con todo asignado ⇒ un título y **sin** "Otros" · **N** ⇒ N títulos + "Otros" último. La copy **no concuerda en número** porque D-01 prohíbe el contador: no hay singular/plural que mantener |
| long-text | E2 | ✅ explicit | Hereda E1: el título envuelve con `break-words` |
| loading | E3 | ✅ explicit | La selección es estado local (`setStep(2)`), sin viaje al servidor. Sin cambios |
| error | E3 | ✅ explicit | La tarjeta no carga datos propios. Un servicio no reservable se **deshabilita con su motivo a la vista** (existente, `:656-660`), y con cupo/pago el error vive en pasos posteriores del wizard |
| overflow | E3 | ✅ explicit | La descripción sigue con "Ver más" **medido** (D-08): a 432px normalmente entra y el toggle no aparece; a 375px aparece como hoy. No se vuelve a un recorte por cantidad de renglones fija |
| long-text | E3 | 🧪 **backstop** | **Nombre largo en desktop:** es literalmente CAT-10. Se verifica **midiendo en el navegador** con un nombre real, no derivándolo — el repo ya se equivocó dos veces estimando anchos de texto en el pizarrón (G-23-6, G-23-21) |
| long-text | E3 | ⚠ **unresolved** | **Nombre de servicio SIN ESPACIOS en mobile:** el `<p>` del nombre (`:625`) no lleva `min-w-0`, así que una cadena de 40+ caracteres sin espacios se sale a 375px — el mismo defecto que G-23-21 cerró en el panel. **Diferido por decisión explícita del usuario (2026-09-22): gana D-07** (*"mobile byte-idéntico"*), que es LOCKED. Queda con causa y arreglo ya diagnosticados: `min-w-0` junto al `break-words`, el par indivisible que funcionó en el panel. Es un fix de una clase para una fase futura |
| empty · loading · error · populated · partial · overflow · zero-one-many | E4 | ✅ explicit (×7) | **Hereda E2 en bloque, por construcción y no por disciplina:** el preview monta el MISMO componente con los MISMOS datos (D-13/D-14, G-24-7), y `BookingClient` se auto-restringe a `max-w-lg`, así que no hay nada que escalar ni una variante que pueda divergir |
| long-text | E4 | 🧪 **backstop** | La paridad preview↔público se sostiene con un test, no con la vista: un caso más en `test/preview-booking-parity.test.ts` que exija que el preview reciba categorías y modos igual que la pública. Sin él, el preview puede desfasarse en silencio — que es exactamente lo que le pasó al fallback del `LandingRenderer` tres veces antes de que lo borraran |

### Las dos diferidas, juntas

Las dos son **deuda preexistente con diagnóstico completo**, no huecos de esta fase, y las dos las
difirió el usuario a propósito el 2026-09-22. Ninguna es un bloqueo del plan: el planner las trata
como asunciones declaradas, **no** como trabajo pendiente. Lo que las hace baratas de retomar es que
ya tienen causa medida y arreglo nombrado.

---
## Regla para el que toque esta región después

> En el estilo de **G-23-20**, cuya regla equivalente ya atrapó un defecto real (WR-03). Esto no es prosa de cierre: es lo que hay que leer **antes** de editar `booking-client.tsx:564-666`.

1. **Hay DOS grillas idénticas en este archivo, y sólo una es de esta fase.** `:567` es el paso 1 (servicios) y **`:749` es el selector de sede/consultorio del paso 3** — la cadena `grid grid-cols-1 sm:grid-cols-2 gap-3` es **byte-idéntica** en las dos [verificado esta sesión: `grep -n "sm:grid-cols-2"` devuelve exactamente esas dos líneas]. Consecuencias operativas, las dos:
   - Un buscar-y-reemplazar sobre esa cadena ensancha **también** el picker de sedes, que nadie pidió cambiar y que con tarjetas de una sola línea se lee peor a ancho completo.
   - Un gate de texto del estilo *"`sm:grid-cols-2` ya no está en `booking-client.tsx`"* es **incorrecto** y va a empujar al ejecutor a borrar la ocurrencia equivocada. El gate correcto cuenta: **de 2 ocurrencias a 1**, y la que sobrevive es la del paso 3. La divergencia visual entre un paso de una columna y otro de dos es **deliberada y está fuera de alcance** (D-05/D-06 nombran sólo la grilla del paso 1): no es una inconsistencia para "arreglar" de paso.
2. **El `<h3>` va siempre afuera de la tarjeta.** Adentro serían N headings por grupo y contenido anidado en la caja del botón estirado. La tarjeta es un **contenedor**; cualquier cosa nueva va como **hermana** del botón de selección, nunca como hija (G-23-6). Y si algún día esa cosa nueva es **interactiva**, necesita `relative z-10` para ganarle al pseudo-elemento, como ya hace el toggle de "Ver más".
3. **El envoltorio del grupo es obligatorio, y `space-y-6` no se mezcla con un Fragment.** Si el grupo se rinde como `<Fragment>` con el `<h3>` y el grid como hermanos **directos** del contenedor con `space-y-6`, el margen de 24px se mete **entre el título y sus propias tarjetas** y el agrupado se lee al revés. Las dos piezas son solidarias: `div.space-y-6` > `div` (uno por grupo) > `h3` + `div.grid`. Cambiar una obliga a cambiar la otra.
4. **Ningún condicional nuevo puede decidir visibilidad.** El único permitido en esta región es `group.title !== null`. Un `if (categories.length)`, un `.filter()` sobre grupos o un `group.services.length > 0` es el modo de falla que **ya mordió dos veces en este repo** (CR-01 de la Phase 20 y otra vez en la 21): el helper que responde "no" para todo y apaga el catálogo entero en silencio. **Señal temprana:** la pantalla muestra **menos** tarjetas que `services.length`.
5. **El orden no se decide en el JSX.** `groupCatalog` es la fuente única, y su tercer argumento **nunca** lleva un spread (`{ ...DEFAULT_SORT_MODES, ...modes }` pisa el default con `undefined`). Un `services.filter(s => s.category_id === c.id)` en el render es el camino a divergir del panel: el dueño ordena una cosa y el cliente ve otra, sin ningún error.
6. **El título no se vuelve sticky sin reabrir G-23-6.** Un `sticky` obliga a resolver contra qué se pega (el hero del negocio ya ocupa arriba) y suma un plano `z` a una región cuyas capas están cerradas por contrato. Si alguna vez hace falta, es una decisión de producto con su propia discusión, no un retoque de CSS.
7. **La mayúscula, el peso y el interletrado del `h3` los pone el theme.** `themes.css` (sin capa) gana sobre cualquier utilidad: `spa` baja el peso a 500, `cyber` y `data-font="tech"` lo ponen en mayúsculas. **No hardcodees `uppercase`, `tracking-*` ni un peso "para que se vea igual"**: lo único que sobrevive a los 5 themes es el **tamaño**, y por eso la jerarquía descansa ahí.
8. **Corolario para el que agregue una categoría-como-filtro, un paso al funnel o un colapsable:** los tres están **explícitamente diferidos** en `24-CONTEXT.md` con su motivo. Reabrirlos es un milestone nuevo, no un plan de esta fase.

---

## Mediciones y procedencia

> Convención del proyecto: **una afirmación sin medición es una hipótesis.** Cada número de este documento sale de una de estas filas.

| Medición | Valor | Procedencia |
|---|---|---|
| `--spacing` (base de la escala) | 0.25rem = **4px** | `node_modules/tailwindcss/theme.css` — **medido esta sesión** |
| `--container-lg` (`max-w-lg`) | 32rem = **512px** | idem — **medido esta sesión** |
| `--breakpoint-sm` (`sm:`) | 40rem = **640px** | idem — **medido esta sesión** (cierra la asunción A1 de la RESEARCH) |
| `--text-sm` / line-height | **14px / 20px** (1.43) | `theme.css:349-350` — **medido esta sesión** |
| `--text-base` / `--text-lg` / `--text-xl` | 16px / 18px / **20px** (lh 28px) | `theme.css:351-356` — **medido esta sesión** |
| Semántica de `space-y-*` en v4.3.0 | `:where(& > :not(:last-child)) { margin-block-end: … }` | `node_modules/tailwindcss/dist/lib.js` — **medido esta sesión**. Es lo que sostiene G-24-2 / P3 |
| `app/globals.css` **no** redefine spacing, container ni text | sin resultados | `grep -- "--text-\|--spacing\|--font-size"` — **medido esta sesión** |
| `h1, h2, h3 { font-family: var(--font-heading); letter-spacing: -0.02em }` | `@layer base` | `app/globals.css:269` — **leído esta sesión** |
| `[data-theme="spa"] h3 { font-weight: 500 }` · `[data-font="elegante"] h3 { 600 }` | pisan `font-bold` | `app/themes.css:150,251` + import sin capa en `app/layout.tsx:12` — **medido esta sesión** |
| `[data-theme="cyber"] h3` / `[data-font="tech"] h3` → `text-transform: uppercase` | `letter-spacing:.03em` | `app/themes.css:201,251` — **medido esta sesión** |
| El nombre de categoría **no tiene tope** de longitud | sin `maxLength`, sin `CHECK` | `components/dashboard/categorias-manager.tsx:813,967` + `supabase/migrations/078_service_categories.sql` — **medido esta sesión**. Es lo que hace obligatorio el `break-words` |
| Dos ocurrencias de `sm:grid-cols-2` | `:567` (paso 1) y `:749` (paso 3, sedes) | `grep -n "sm:grid-cols-2" app/[slug]/booking-client.tsx` — **medido esta sesión** |
| Cero `<h3>` preexistentes en la pantalla pública | sin resultados | `grep -n "<h3" app/[slug]/booking-client.tsx app/[slug]/page.tsx` — **medido esta sesión** |
| Clases vigentes del `h2`, la grilla, el contenedor y la tarjeta | `:551`, `:566`, `:567`, `:590`, `:621`, `:624-631`, `:640-647`, `:657` | `app/[slug]/booking-client.tsx` — **leído verbatim esta sesión** |
| Ancho interior del wizard / de columna / útil de tarjeta | **464px** / 226px → 464px / **194px → 432px** | Derivado de las clases de `:551,567,590` con la escala medida arriba. Coincide con `24-RESEARCH.md` §"Mediciones del ancho" y con D-06 |
| Ancho interior a 375px | **327px** (375 − 48 de `px-6`) | Derivado con la misma escala |
| Contrastes `--foreground` 16.2:1 · `--muted-foreground` 4.99:1 · `text-primary` 3.54/3.59/2.36:1 en red/green/yellow | ratios | Medidos en la Phase 23 y en el 19-UI-SPEC (`23-UI-SPEC.md` §Color) — **citados, no re-medidos** |
| `groupCatalog`: camino de identidad, Regla 3, `OTHER_GROUP_TITLE` | `:80`, `:312-318`, `:340-346` | `lib/service-categories.ts` — **leído esta sesión** |

**Lo que NO se midió, dicho explícito:** el render real en navegador del `<h3>` a 14px en los 5 themes × 5 paletas. La UAT de esta fase es el lugar donde se mira, y la fila `long-text / E3` de `## UI Considerations` ya está marcada 🧪 backstop precisamente por eso.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | **ninguno** — esta fase no instala ni modifica un solo componente | not required |
| terceros | **ninguno** — `components.json → "registries": {}` | no aplica (verificado 2026-09-22) |

**Prohibido en esta fase:** `npx shadcn add`, `npm install`, y cualquier bloque de un registry de terceros. El milestone entero se construyó sin sumar dependencias y esta fase no es la excepción.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS
- [ ] Dimension 7 Inventory Provenance: PASS

**Approval:** pending
