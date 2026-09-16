---
phase: 23
slug: el-panel-que-organiza-el-catalogo
status: draft
shadcn_initialized: true
preset: "style=base-nova · baseColor=neutral · cssVariables=true · rsc=true · iconLibrary=lucide"
created: "2026-09-15"
---

# Phase 23 — UI Design Contract

> Contrato visual y de interacción de la Phase 23 (CAT-01…CAT-05, CAT-11). Generado por gsd-ui-researcher, verificado por gsd-ui-checker.
>
> **El design system YA EXISTE.** Este documento lo *documenta y reusa*: no inventa tokens, no agrega dependencias, no instala componentes, **no agrega ninguna librería de drag-and-drop**. Todo lo prescripto sale de `app/globals.css` y de idiomas ya shipeados en `app/(dashboard)/settings/settings-client.tsx`, `app/(dashboard)/web/_sections/section-list.tsx` y `app/(crm)/admin/pipeline/pipeline-client.tsx`.
>
> **`23-CONTEXT.md` manda.** D-01 a D-12 están LOCKED: este spec los materializa, no los reabre. Lo único que se decide acá es lo que el contexto delegó explícitamente (CAT-11: dónde va el campo y si el tope es duro · si el organizador aplica al vertical canchas) más el detalle visual, responsive, de accesibilidad y de copy.
>
> **Idioma de toda la UI: español rioplatense, voseo.** Es el idioma del resto del panel; un texto en "tú" o en inglés es un defecto, no una variante.

---

## Alcance de la superficie

Cinco bloques, en tres archivos (uno nuevo). Nada más entra en este contrato.

| # | Bloque | Archivo | Qué pasa | Decisión |
|---|--------|---------|----------|----------|
| **A** | **Organizador del catálogo** — Card colapsable con el CRUD de categorías, el arrastre y los chips | `components/dashboard/categorias-manager.tsx` (**NUEVO**) | **NUEVO** | D-01, D-02, D-03, D-06, D-08, D-12 |
| **B** | **Selector de orden de los servicios** | `settings-client.tsx`, arriba de la lista (`≈:2493`, bajo `ActiveTabs`) | **NUEVO** | D-03, D-12 |
| **C** | **Campo "Categoría" + "Descripción corta"** en el alta y en el diálogo de edición del servicio | `settings-client.tsx` `≈:2713-2770` y `≈:2790-2840` | **SE AGREGAN 2 campos ×2** | D-05, CAT-11 |
| **D** | **Confirmación de borrado de categoría** | dentro de A (`ConfirmDialog` ya importado en la pantalla) | **NUEVO** | D-04 |
| **E** | **Diálogo "Mover …"** — asignar categoría + posición desde cualquier chip | dentro de A | **NUEVO** | D-07, D-08 |

**Fuera de este contrato, explícitamente:**

- `app/[slug]/booking-client.tsx` y `app/[slug]/page.tsx` — toda la superficie pública es la **Phase 24**. `services.description` **ya se renderiza** ahí con `line-clamp-2` (`:610`): esta fase agrega **sólo el campo del panel**.
- La **tarjeta de servicio** de la lista de abajo (`settings-client.tsx:2494-2710`): no se agrupa, no se reordena, no se refactoriza. Su estructura de grilla está documentada línea por línea con la invariante de 32px de G-04. **No se toca** (D-06).
- `components/ui/*`: no se instala ni se modifica ningún componente. **Prohibido `npx shadcn add`** en esta fase.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn `4.10.0` (ya inicializado — `components.json` presente) |
| Preset | `style: base-nova` · `baseColor: neutral` · `cssVariables: true` · `rsc: true` |
| Component library | `@base-ui/react 1.5.0` (primitivas) + `@/components/ui` (shadcn vendorizado) |
| Styling | Tailwind CSS v4 — config CSS-first en `app/globals.css`, **sin** `tailwind.config` |
| Icon library | `lucide-react 1.17.0` — única librería de iconos, sin excepciones |
| Font (cuerpo) | `var(--font-sans)` → `--font-grotesk`, fallback `system-ui, sans-serif` |
| Font (títulos) | `var(--font-heading)` → `--font-archivo` (por `@layer base` sobre `h1,h2,h3`) |
| Toasts | `sonner 2.0.7` (`toast.error` / `toast.success`) |
| Helper de clases | `cn()` de `@/lib/utils` |
| Registries de terceros | **ninguno** (`components.json → "registries": {}`, verificado 2026-09-15) |
| Drag-and-drop | **ninguna librería.** `draggable` nativo de HTML5, molde `pipeline-client.tsx:462` |
| Temas / paletas | claro-oscuro por `next-themes` + `data-palette` / `data-theme` en `<html>` ⇒ **cero hex hardcodeado**, todo por token |

**No existe `Collapsible`, `DropdownMenu`, `Popover`, `Toggle` ni `Switch` en `@/components/ui`** (verificado: el directorio tiene 17 archivos y ninguno es eso). Las tres piezas que este spec necesita y que el design system no trae se arman a mano con el idioma ya shipeado del repo:

| Pieza que falta | Cómo se arma | Precedente en el repo |
|---|---|---|
| Colapsable | `<button aria-expanded aria-controls>` + render condicional | `section-list.tsx:122`, `canchas-manager.tsx:353` |
| Menú "Mover a…" | `Dialog` compartido (uno solo, no uno por chip) | `settings-client.tsx:2789` (Editar servicio) |
| Reorden ▲/▼ | `Button variant="ghost" size="icon"` con `ChevronUp`/`ChevronDown` + `aria-label` | `section-list.tsx:130-158` |

---

## Component Inventory

Enumerated by `ls components/ui/*.tsx` — 17 components — shadcn@4.10.0 (vendorizado en `components/ui/`, `components.json` style `base-nova`) — 2026-09-15.

> shadcn no es una dependencia con `exports`: instala **archivos** en el repo. La enumeración re-ejecutable es el listado del directorio; la versión sale de `node -p "require('./node_modules/shadcn/package.json').version"` → `4.10.0`.
>
> Lista **no exhaustiva** de componentes conocidos-buenos, **nunca una allowlist cerrada**: el ejecutor puede usar cualquier cosa que el design system exporte. Chequear un componente que no esté en la tabla es el camino esperado, no una excepción.

| Component | Import path | Notes |
|-----------|-------------|-------|
| `Card` | `@/components/ui/card` | Contenedor del organizador (Bloque A). `p-6 space-y-4`, igual que la Card de servicios |
| `Button` | `@/components/ui/button` | Todas las acciones. `size="icon"` = 32px ⇒ **hay que subirlo a 44px en mobile** (ver Accesibilidad) |
| `Input` | `@/components/ui/input` | Alta y renombrado de categoría |
| `Textarea` | `@/components/ui/textarea` | **Descripción corta** (CAT-11). `rows={2}` |
| `Label` | `@/components/ui/label` | Etiqueta de todo campo nuevo. Siempre visible, nunca reemplazada por el placeholder |
| `Select` + `SelectTrigger/Content/Item/Value` | `@/components/ui/select` | Los dos selectores de modo + el campo "Categoría" del form. ⚠ `SelectValue` de Base UI muestra el **value crudo**: hay que mapear a label con la forma de `settings-client.tsx:2423` |
| `Dialog` + `DialogContent/Header/Title/Footer` | `@/components/ui/dialog` | Diálogo "Mover …" (Bloque E) |
| `Separator` | `@/components/ui/separator` | Corte entre las secciones del diálogo "Mover …" |
| `Badge` | `@/components/ui/badge` | **No se usa**: los conteos van como pill de texto con el molde ya shipeado (`settings-client.tsx:2874`) |
| `ConfirmDialog` | `@/components/crm/confirm-dialog` | Bloque D. Ya importado por `settings-client.tsx:27`. ⚠ sus acciones **auditan y retornan**, nunca `redirect()` |
| `ActiveTabs` | `@/components/dashboard/active-tabs` | Existente en la lista de servicios. **No se toca**; el Bloque B se monta debajo |
| `toast` | `sonner` | Único canal de feedback no-inline de la pantalla |

**Iconos usados (todos verificados presentes en `lucide-react@1.17.0`):** `Tags`, `ChevronDown`, `ChevronUp`, `GripVertical`, `Plus`, `Trash2`, `Check`.

---

## Spacing Scale

Escala del proyecto. **Sólo múltiplos de 4 en el código nuevo.**

| Token Tailwind | Value | Uso en esta fase |
|----------------|-------|------------------|
| `gap-1` | 4px | Icono ↔ texto dentro del chip · par de botones de acción de la fila |
| `gap-2` / `space-y-2` | 8px | Chips entre sí · filas de categoría entre sí · campos del diálogo |
| `p-2` | 8px | Padding de la fila de categoría |
| `px-3` | 12px | Padding horizontal del pill del chip |
| `space-y-3` | 12px | Campos del form de servicio (ritmo ya existente del alta y del diálogo de edición) |
| `pt-4` / `mt-4` | 16px | Separación del bloque de alta de categoría (con `border-t`, molde `settings-client.tsx:2712`) |
| `p-6` / `space-y-4` | 24px | Padding y ritmo interno de la Card (existente, se copia tal cual) |

**Alturas:** pill visual del chip `h-7` (28px) **dentro de** un botón `min-h-11` (44px) — el molde exacto del 19-UI-SPEC. Botones de icono `h-11 w-11 sm:h-8 sm:w-8` (molde de la tarjeta de servicio, `settings-client.tsx:2701-2706`). `Input` y `Select` del alta: alto por defecto del componente, sin override.

**Radios:** `rounded-full` para chips · `rounded-md` para filas de categoría (molde `section-list.tsx:108`) · `rounded-lg` para la Card (ya lo trae). **Sin radios nuevos.**

**Iconos:** `size-4` (16px) en botones de acción · `size-3` (12px) dentro del chip.

**Excepciones: ninguna.** Prohibido en el código nuevo: `gap-1.5`, `space-y-1.5`, `p-2.5`, `text-[11px]`, `pb-0.5` y cualquier valor arbitrario entre corchetes. El repo tiene esos valores en código preexistente y **no se corrigen de paso** — pero no entran en lo nuevo.

---

## Typography

3 tamaños, 2 pesos. Line-heights = defaults de Tailwind.

| Role | Clase | Size | Weight | Line height | Dónde |
|------|-------|------|--------|-------------|-------|
| Display | `text-2xl font-bold` + `var(--font-heading)` | 24px | 700 | 32px (1.33) | El `h1` de la página (`settings-client.tsx:2137`). **EXISTENTE — no se toca, se documenta para declarar la jerarquía completa** |
| Heading de bloque | `text-sm font-medium` | 14px | 500 | 20px (1.43) | Header de la Card ("Categorías del catálogo"), nombre de la categoría, `Label` de sección |
| Body / control | `text-sm` | 14px | 400 | 20px (1.43) | Inputs, `Select`, opciones del diálogo "Mover …" |
| Support | `text-xs` | 12px | 400 · 500 en el chip | 16px (1.33) | Chips, líneas de ayuda, conteos, contador de caracteres, errores inline |

**Prohibido en el código nuevo:** `text-base`, `text-lg`, `text-[11px]`, `text-[9px]`, `font-semibold`, `font-bold`, `italic`, cualquier `font-[family-name:…]` (el cuerpo hereda `--font-sans`; los títulos de la fase **no** son `h*`, así que no heredan `--font-heading`).

**Jerarquía de headings:** la fase **no agrega ningún `h1`-`h6`**. El header de la Card es un `<button>` plano y el nombre del bloque viaja en su texto visible (que además es su nombre accesible). El `h1` de la página sigue siendo el único heading, igual que hoy. Un `h2` nuevo acá rompería la jerarquía del resto de las Cards de la pantalla, que tampoco lo tienen.

**Tabular:** `tabular-nums` **sólo** en el contador de caracteres (`0/120`) — es lo único que cambia dígito a dígito mientras el usuario mira. Los conteos de servicios no lo necesitan (cambian por acción, no por tipeo).

**Tope de línea:** las líneas de ayuda van con `max-w-prose` cuando ocupan el ancho entero de la Card en desktop. A 375px el ancho útil (295px) ya está por debajo de los 75 caracteres.

---

## Color

Todo por custom property de `app/globals.css`. **Cero hex en componentes**: cada color como clase de token (`text-muted-foreground`, `bg-secondary`), nunca `text-neutral-500` ni `#6b6253`. Es lo que hace que funcione en 5 themes × 5 paletas × dark sin duplicar estilos.

| Role | Token | Light | Dark | Uso en esta fase |
|------|-------|-------|------|------------------|
| Dominant (60%) | `--background` / `--card` | `#f3ead8` / `#fbf3e3` | `#1a1714` / `#252019` | Superficie de la Card, fondo del chip en reposo |
| Secondary (30%) | `--secondary` | `#e9ddc4` | `#2e2820` | Fila de categoría (`bg-secondary/50`, molde de la tarjeta de servicio) · pill de conteo · realce de la zona de drop |
| Accent (10%) | `--primary` / `--ring` (por paleta, default `#d94a2b`) | por paleta | por paleta | **sólo tres cosas** (lista abajo) |
| Destructive | `--destructive` | `#b23a26` | `#e05c43` | Error inline del nombre duplicado · hover del tacho · botón "Eliminar" del `ConfirmDialog` (vía `--danger`) |
| Texto secundario | `--muted-foreground` | `#6b6253` | `#a99e8b` | Chip en reposo, líneas de ayuda, conteos, contador |
| Texto primario | `--foreground` | `#1a1714` | `#f3ead8` | Nombre de la categoría, nombre del servicio en el chip |
| Borde | `--border` | `#d9ceb4` | `oklch(… /12%)` | Borde del chip y de la fila de categoría |

**Accent reservado, en esta fase, para exactamente esto — y nada más:**

1. El botón **"Agregar categoría"** (`Button` primary) — el único botón lleno del organizador.
2. El **anillo de foco** (`focus-visible:ring-ring`), que es global y preexistente.
3. La **barra de inserción de 2px** (`bg-primary`) que marca dónde va a caer lo que se arrastra — transitoria y sólo con puntero.

**NO llevan acento, deliberadamente:** los chips (ni en reposo ni marcados), las filas de categoría, los conteos, los dos selectores de modo, las ▲/▼, el grip, el grupo "Sin categoría", ni el estado "arrastrando".

**Por qué:** el 19-UI-SPEC midió que `text-primary` a 12px sobre crema **falla AA en 3 de las 5 paletas** (red 3.54:1, green 3.59:1, yellow 2.36:1). El chip de esta fase vive a 12px sobre la misma superficie: replicar el molde de `/equipo` (`border-primary bg-primary/10 text-primary`) metería el mismo fallo. Además el acento ya está gastado en "Agregar servicio" y en las píldoras de sede de la misma pantalla; un tercer y cuarto uso lo vuelve ruido.

### Contrastes medidos (light, tema `forjo`, sobre `--card #fbf3e3`)

| Par | Ratio | Requisito | Resultado |
|-----|-------|-----------|-----------|
| `--muted-foreground` sobre `--card` | ≥ 4.99:1 (medido en el 19-UI-SPEC sobre `--background`, que es la superficie más oscura de las dos) | 4.5:1 texto | ✓ AA |
| `--foreground` sobre `--card` | 16.2:1 | 4.5:1 texto | ✓ AAA |
| `--destructive` sobre `--card` | 5.41:1 | 4.5:1 texto | ✓ AA |
| `--ring` / `--primary` sobre `--card` | 3.84:1 | 3:1 no-texto | ✓ AA (foco + barra de inserción) |
| `--border` sobre `--card` | 1.42:1 | — | **No es portador de estado.** Ver abajo |

**El borde NO identifica ningún control, y eso es deliberado.** `--border` está por debajo de 3:1 en todo el repo (es el borde de shadcn y ya está en producción en cada Card e Input). Esta fase **no lo arregla y tampoco se apoya en él**: cada control nuevo se identifica por su **etiqueta de texto** + su **área táctil de 44px** + su **anillo de foco a 3.84:1**. Ningún estado de esta fase se comunica sólo con el borde.

**Ningún estado se comunica sólo por color** (WCAG 1.4.1):

| Estado | Portadores (siempre ≥2, y al menos uno no-cromático) |
|--------|------------------------------------------------------|
| Fila / chip **siendo arrastrado** | `border-dashed` + `cursor-grabbing` — **sin `opacity`** |
| Zona de **drop activa** | `bg-secondary` + `ring-2 ring-ring` + la barra de inserción |
| Grupo **"Sin categoría"** | `border-dashed` + el texto literal "Sin categoría" + ausencia de acciones |
| **Error** del nombre | icono ausente pero **texto explícito** + `role="status"` + `aria-invalid` en el `Input` |
| **Límite de 120** alcanzado | el contador pasa a `text-foreground font-medium` + anuncio polite en texto |

**Prohibido `opacity` para atenuar** cualquier cosa de esta fase (baja el contraste por debajo de AA). El precedente del pipeline del CRM (`opacity-50` sobre la tarjeta arrastrada) **no se porta**: acá se usa `border-dashed`.

---

## Bloque A — El organizador del catálogo

### Ubicación exacta

Dentro de `settings-client.tsx`, rama `view === 'servicios'` → `TabsContent value="services"` → **rama `!isCanchas`**, como **primer hijo**, arriba de la Card de servicios existente. Un componente propio, no inline (D-01):

```
components/dashboard/categorias-manager.tsx
```

Molde estructural: `components/dashboard/canchas-manager.tsx` (props tipadas, `supabase` por prop, escritura con el cliente browser, `toast` para feedback).

### El vertical canchas queda AFUERA — decisión, no olvido

> El `<code_context>` del CONTEXT pedía decidirlo y dejarlo escrito. **El organizador NO se renderiza cuando `isCanchas`, y el campo "Descripción corta" NO se agrega a `CanchasManager`.**

Tres razones que se suman:

1. En canchas el CRUD genérico de `services` **no existe**: `CanchasManager` lo reemplaza entero. Montar el organizador ahí sería montarlo sobre una lista que el dueño no ve.
2. La superficie pública de canchas es `app/[slug]/canchas-booking-client.tsx`, **no** `booking-client.tsx`. La Phase 24 agrupa en `booking-client.tsx`: un control que configura un agrupado que nunca se renderiza es, literalmente, el defecto que D-12 existe para evitar.
3. `canchas-manager.tsx` tiene un **leak guard explícito** en su cabecera: no muestra el `service_id` ni nada de la plomería `service ↔ professional`. Un selector de categoría de servicio ahí adentro lo rompe.

El gate ya existe en ese punto del archivo (`isCanchas ? <CanchasManager …> : <>…</>`): el organizador va **dentro del `else`**, sin ningún `if` nuevo.

### Anatomía

```
┌─ Card p-6 space-y-4 ───────────────────────────────────────────┐
│ [Tags] Categorías del catálogo        3 categorías      [v]    │ ← header = botón colapsable
├────────────────────────────────────────────────────────────────┤ (sólo si abierto)
│ Agrupá tus servicios bajo títulos. …                           │ ← línea de ayuda
│                                                                │
│ Orden de las categorías  [ Como las ordené yo      v ]         │ ← selector (sólo si ≥1 categoría)
│                                                                │
│ ┌ li ─────────────────────────────────────────────────────┐    │
│ │ ⣿ Color                    4 servicios   [▲][▼][🗑]     │    │ ← fila de categoría
│ │ ( Corte ) ( Mechas ) ( Balayage ) ( Nutrición )         │    │ ← chips de esa categoría
│ └─────────────────────────────────────────────────────────┘    │
│ ┌ li border-dashed ───────────────────────────────────────┐    │
│ │ Sin categoría              2 servicios                  │    │ ← grupo de sueltos (sin acciones)
│ │ ( Peinado ) ( Brushing )                                │    │
│ └─────────────────────────────────────────────────────────┘    │
│ ──────────────────────────────────────────────── (border-t)    │
│ Agregar categoría                                              │
│ [ Ej. Color                    ] [ + Agregar ]                 │
│ ⚠ Ya tenés una categoría con ese nombre.                       │ ← slot de error inline
└────────────────────────────────────────────────────────────────┘
```

### El header (siempre visible, es el disparador)

```tsx
<button
  type="button"
  aria-expanded={open}
  aria-controls="catalogo-body"
  onClick={() => setOpen(o => !o)}
  className="flex w-full min-h-11 items-center gap-2 text-left"
>
  <Tags aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
  <span className="text-sm font-medium">Categorías del catálogo</span>
  <span className="ml-auto rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">
    {countLabel}
  </span>
  <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
</button>
```

- **Estado inicial (D-02):** `open = categories.length > 0`. Cero categorías ⇒ colapsada (el estado de **todos** los negocios de producción el día del deploy: la pantalla no cambia de alto ni gana ruido). ≥1 ⇒ abierta.
- **No se recuerda la elección** (ni `localStorage` ni nada): es estado por navegador para una sola Card (D-02).
- `countLabel` con singular/plural real: `Sin categorías` · `1 categoría` · `{n} categorías`.
- La rotación del chevron va con `transition-transform` (≤300ms, `transform` — no dispara layout). El colapso en sí es **render condicional sin animación de alto**: animar `height` obliga a medir en JS, que este repo no hace en ningún lado.

### La fila de categoría

`<li>` con `rounded-md border border-border bg-secondary/50`.

**Layout — mismo idioma que la tarjeta de servicio** (`settings-client.tsx:2513`):

```
flex flex-col gap-2 p-2
sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-2
```

- **Mobile (375px):** dos líneas. Línea 1 = grip + nombre (envuelve con `break-words`, **no trunca**). Línea 2 = conteo + las tres acciones alineadas a la derecha.
  ⚠ **Acá NO va la zona de exclusión de 24px de G-04** y es decisión escrita, no olvido: G-04 nació de que *texto inerte* quedara pegado a un botón. En esta fila el vecino de arriba es el **nombre, que es él mismo un botón** (renombrar) — dos interactivos adyacentes no producen el defecto de corrección de punto de toque. Si en producción aparece un toque errado, el primer sospechoso es esto y el arreglo es `pt-4 border-t` en la línea de acciones.
- **Desktop:** una sola fila; el nombre trunca (`sm:truncate`), igual que la tarjeta de servicio.

**Contenido, en orden de DOM:**

| Elemento | Contrato |
|---|---|
| Grip | `<GripVertical aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/60" />`. **Sólo se renderiza si `category_sort_mode === 'custom'`** (D-12). Decorativo: el arrastre lo lleva el `<li>` entero |
| Nombre | `<button type="button">` que entra en **renombrado in situ**. Texto `text-sm font-medium text-foreground`. `aria-label={`Renombrar “${c.name}”`}` |
| Renombrado | El botón se reemplaza por un `<Input className="h-8 text-sm">` con el valor actual, autofoco y selección. **Enter** guarda · **Escape** cancela · **blur** guarda. Mismo mapeo de errores que el alta |
| Conteo | `<span className="text-xs text-muted-foreground">`. Singular/plural: `Sin servicios` · `1 servicio` · `{n} servicios` |
| ▲ | `<Button variant="ghost" size="icon" className="h-11 w-11 sm:h-8 sm:w-8" disabled={isFirst} aria-disabled={isFirst} aria-label={`Subir “${c.name}”`}><ChevronUp className="size-4" /></Button>`. **Sólo si modo `custom`** |
| ▼ | Ídem con `ChevronDown`, `disabled={isLast}`, `aria-label={`Bajar “${c.name}”`}`. **Sólo si modo `custom`** |
| 🗑 | `<Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-11 w-11 sm:h-8 sm:w-8" aria-label={`Eliminar “${c.name}”`}><Trash2 className="size-4" /></Button>`. **Siempre visible** (borrar no depende del modo de orden) |

**Arrastre de categorías** (`draggable` nativo, molde `pipeline-client.tsx:462`, **sólo si modo `custom`**):

- El `<li>` entero lleva `draggable`, `cursor-grab active:cursor-grabbing`, `onDragStart` (con `e.dataTransfer.effectAllowed = 'move'` y `setData('text/plain', c.id)`), `onDragEnd`.
- Estado "siendo arrastrado": `border-dashed`. **Sin `opacity`.**
- Al pasar por encima de otra fila: esa fila muestra la **barra de inserción** — un `<div aria-hidden className="h-0.5 bg-primary rounded-full" />` de 2px en su borde superior. Transitoria y sólo con puntero.
- **Regla de drop, determinista:** se saca la fila arrastrada de la lista y se inserta **en el índice de la fila sobre la que se soltó**; después se **renumera la lista completa de hermanas** desde 0. Nunca swaps sueltos — dejan huecos y empates (CAT-03).

### Los chips (segunda línea de cada grupo)

Contenedor: `<ul className="flex flex-wrap gap-2 px-2 pb-2" role="list">`.

Cada chip es **un solo botón** que abre el diálogo "Mover …" (Bloque E):

```tsx
<button
  type="button"
  draggable={serviceMode === 'custom' || categories.length > 0}
  onClick={() => setMoving(s)}
  aria-label={`Mover “${s.name}”`}
  className="inline-flex min-h-11 items-center"
>
  <span className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground whitespace-nowrap">
    {draggable && <GripVertical aria-hidden="true" className="size-3 text-muted-foreground/60" />}
    {s.name}
  </span>
</button>
```

- **Pill visual de 28px dentro de un área táctil de 44px** — el molde exacto del 19-UI-SPEC. La Card queda compacta y el piso táctil se respeta.
- **El nombre NO se trunca nunca.** `whitespace-nowrap` + `flex-wrap` en el contenedor: un nombre largo ocupa su fila entera y envuelve la siguiente. Un nombre cortado en un chip haría ambiguo cuál servicio estás por mover.
- **Un solo control por chip, no tres.** *(Desviación declarada de la lectura literal de D-08 "el mismo mecanismo".)* Tres botones inline de 44px por chip (▲ ▼ mover) son 132px + el nombre ⇒ **un chip por fila a 375px**, que destruye los "chips compactos" que D-06 eligió. El diálogo "Mover …" contiene **las dos cosas** (categoría y posición), así que el mecanismo sigue estando disponible con teclado y en mobile, que es lo que CAT-03/D-08 exigen. El arrastre sigue siendo el atajo de desktop.
- **Arrastre del chip:** `onDragStart` setea el `service_id`; los drop targets son la **fila de categoría** (soltar en cualquier parte de la fila ⇒ asignar a esa categoría, al final de su grupo) y **otro chip** (⇒ insertar antes de ese chip, resolviendo categoría y posición a la vez). La fila que recibe se realza con `bg-secondary ring-2 ring-ring`.

### El grupo "Sin categoría"

Mismo `<li>` pero: `border-dashed`, **sin grip, sin ▲/▼, sin renombrar y sin eliminar** — no es una categoría. Va **último, siempre** (espeja `OTHER_GROUP_TITLE` de `lib/service-categories.ts`).

Bajo su encabezado, una línea de ayuda permanente (`text-xs text-muted-foreground`):

> Estos se reservan igual. En tu página aparecen al final, bajo “Otros”.

Es la lectura de CAT-02 en pantalla: el estado sin categoría es **válido, permanente y visible** — nunca un accidente.

**Se renderiza sólo cuando hay ≥1 categoría creada.** Con cero categorías todos los servicios son huérfanos y el grupo sería el catálogo entero duplicado, sin ningún lugar a donde moverlo.

### Gates de visibilidad (en este orden)

| Elemento | Condición |
|---|---|
| La Card entera | `!isCanchas` |
| El cuerpo de la Card | `open === true` |
| Selector de modo de **categorías** | `categories.length > 0` |
| Filas de categoría + chips + grupo "Sin categoría" | `categories.length > 0` |
| Grip y ▲/▼ de **categorías** | `business.category_sort_mode === 'custom'` (D-12) |
| Grip del **chip** y sección "Posición" del diálogo | `business.service_sort_mode === 'custom'` (D-12) |
| Bloque de alta de categoría | siempre (es la salida del estado vacío) |

⚠ **Los dos ejes se gatean por separado** (D-12): `category_sort_mode='alpha'` apaga los controles de categorías y **deja vivos** los de servicios si `service_sort_mode='custom'`.

### Empty state — cero categorías

Con `open` y `categories.length === 0`, el cuerpo muestra **sólo** la ayuda + el bloque de alta, con este copy en el lugar de la lista:

> **Todavía no tenés categorías**
> Agrupá tus servicios bajo títulos —“Color”, “Uñas”, “Barbería”— para que tu página de reservas se lea de un vistazo. Sin categorías, tus servicios se muestran como hasta ahora.

`text-sm font-medium` el título, `text-xs text-muted-foreground` el cuerpo, centrado, con `Tags` `size-5 text-muted-foreground/60` arriba. Molde: `ActiveTabsEmptyState`.

La última frase no es decorativa: es CAT-07 dicho en voz alta, para que el dueño sepa que **no crear ninguna categoría es una opción válida**, no una tarea pendiente.

---

## Bloque B — El selector de orden de los servicios

**Ubicación (D-03):** dentro de la Card de servicios existente, **debajo de `ActiveTabs` y arriba de la lista** — o sea donde actúa, y nunca escondido detrás del colapso del organizador.

```tsx
<div className="flex flex-wrap items-center gap-2">
  <Label htmlFor="orden-servicios" className="text-xs text-muted-foreground">Orden de los servicios</Label>
  <Select value={serviceMode} onValueChange={saveServiceMode}>
    <SelectTrigger id="orden-servicios" className="w-auto min-w-40">
      <SelectValue>{(v: string | null) => SERVICE_MODE_LABELS[v ?? 'custom']}</SelectValue>
    </SelectTrigger>
    <SelectContent>…</SelectContent>
  </Select>
</div>
```

| Modo | Label |
|---|---|
| `custom` | Como los ordené yo |
| `alpha` | Alfabético (A-Z) |
| `price` | Por precio (de menor a mayor) |

Y para el eje categorías (dentro de la Card del organizador):

| Modo | Label |
|---|---|
| `custom` | Como las ordené yo |
| `alpha` | Alfabético (A-Z) |

**Línea de ayuda permanente** bajo el selector de servicios (`text-xs text-muted-foreground`):

> Vale para todo el negocio, dentro de cada categoría.

**Línea de ayuda condicional — la honestidad que hace falta.** Cuando **ningún servicio tiene categoría** (o no hay categorías), `groupCatalog()` toma el **camino de identidad** y **ni mira los modos** (D-08 del módulo puro). Elegir un modo ahí guarda una preferencia real pero no cambia nada de lo que se ve. En ese caso, y sólo en ese caso, se agrega:

> Se aplica cuando al menos un servicio tenga categoría.

⚠ **Esto NO viola CAT-05 ni D-12.** La regla de "no mostrar un control que no hace nada" apuntaba a una **acción** inerte (un arrastre que no persiste). El selector **persiste una elección real** que surte efecto en cuanto se cumple la condición; lo que faltaba era decirlo. Un arrastre inerte se lee como roto; una preferencia guardada con su condición escrita, no.

**Cambiar de modo NO persiste ningún orden** (D-11): escribe **sólo** la columna de `businesses`. Si el panel escribiera `sort_order` al cambiar de modo rompería CAT-06, que ya está entregado y verificado, y el arreglo manual del dueño **no se puede recuperar de ningún lado**.

**Feedback del guardado:** el `Select` queda `disabled` mientras la escritura está en vuelo. Éxito: sin toast (el resultado es visible: los controles de reorden aparecen o desaparecen). Fallo: el valor **vuelve al anterior** + `toast.error` (ver Copywriting).

---

## Bloque C — Los dos campos nuevos del servicio

**Decisión delegada (CAT-11), resuelta según la guía recomendada del CONTEXT:** los dos campos van **espejados en el alta y en el diálogo de edición**. Es el patrón declarado del archivo — el diálogo de edición "reusa el form de alta" — y romper el espejo deja un campo que sólo existe en una de las dos operaciones.

### Campo "Categoría"

```tsx
<div className="space-y-1">
  <Label className="text-xs text-muted-foreground">Categoría (opcional)</Label>
  <Select value={form.category_id ?? SIN_CATEGORIA} onValueChange={…}>
    <SelectTrigger className="w-full">
      <SelectValue>{(v) => labelDeCategoria(v)}</SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={SIN_CATEGORIA}>Sin categoría</SelectItem>
      {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
    </SelectContent>
  </Select>
</div>
```

- **`(opcional)` en el label es obligatorio.** Es la regla de forms del proyecto (se marcan los opcionales, nunca los obligatorios con `*`) **y** es CAT-02 escrito en la etiqueta: asignar no es obligatorio en ningún punto del flujo.
- **"Sin categoría" es la primera opción, siempre presente, y el valor por defecto del alta.** Nunca un estado al que se llega sólo por omisión (D-05). El sentinel (`SIN_CATEGORIA`) se mapea a `null` en la escritura: Base UI Select maneja `string`, no `null`.
- **El campo entero no se renderiza si `categories.length === 0`** — no hay nada que elegir, y un `Select` con una sola opción que dice "Sin categoría" es ruido. Cuando el dueño crea su primera categoría, el campo aparece en las dos superficies.
- ⚠ **Es el tercer call site que escribe `services.category_id`** (con el arrastre y el diálogo "Mover …"). **Los tres pasan por UNA sola función de escritura** (D-07, restricción dura). Tres implementaciones de la misma columna es el molde de bug que esta fase no puede permitirse.

### Campo "Descripción corta" (CAT-11)

```tsx
<div className="space-y-1">
  <Label htmlFor={descId} className="text-xs text-muted-foreground">Descripción corta (opcional)</Label>
  <Textarea
    id={descId}
    rows={2}
    maxLength={120}
    value={form.description}
    onChange={…}
    aria-describedby={`${descId}-help`}
    placeholder="Ej. Incluye lavado, corte y peinado"
  />
  <div className="flex items-start justify-between gap-2">
    <p id={`${descId}-help`} className="text-xs text-muted-foreground">
      Aparece debajo del nombre en tu página de reservas. Se ven 2 líneas.
    </p>
    <span aria-hidden="true" className={cn('shrink-0 text-xs tabular-nums', atLimit ? 'font-medium text-foreground' : 'text-muted-foreground')}>
      {len}/120
    </span>
  </div>
  <p role="status" className="sr-only">{atLimit ? 'Llegaste al máximo de 120 caracteres.' : ''}</p>
</div>
```

**Decisión delegada, resuelta: el tope de 120 es DURO** (`maxLength={120}`), con **contador visible desde el arranque** (`0/120`), no sólo al acercarse al límite.

El sentido del 120 es que **lo que el dueño escribe sea exactamente lo que la tarjeta deja ver** a 375px con el `line-clamp-2` que ya está en producción (`booking-client.tsx:610`). Un tope blando devuelve justo el problema que el número viene a resolver: recortarle sin avisar.

- El contador es `aria-hidden` (un live region que dispara en cada tecla es ruido para un lector de pantalla). El anuncio polite ocurre **una sola vez**, al tocar el límite.
- Al llegar a 120 el contador cambia de **peso y color de texto** — no de color solo, y **nunca a `--warning`**: llegar al límite no es un problema, es el diseño funcionando.
- **Sin normalización en `onBlur`.** Duración y precio la tienen (G-21-11) porque son números que hay que interpretar; una descripción es texto libre del dueño y recortarle espacios a la vista se leería como que el campo le está borrando lo que escribió. Lo único que se normaliza es el guardado: `trim()` y `'' → null`.
- **La superficie pública NO se toca.** `services.description` ya existe, `public_services` ya la expone y la tarjeta ya la renderiza. Esta fase agrega **sólo el campo del panel**.

### Orden de los campos (idéntico en alta y en edición)

`Nombre` → `Min.` + `Precio` → **`Categoría`** → **`Descripción corta`** → `Modo de cupo` (`CapacityModeFields`) → `Se ofrece en` → CTA.

Categoría y descripción van **juntas y después del precio** porque son las dos cosas que describen *qué es* el servicio; el modo de cupo y las sedes son *cómo se presta*. El diálogo de edición ya tiene scroll interno con pie anclado (`settings-client.tsx:2795`): dos campos más entran sin tocar ese patrón.

---

## Bloque D — Confirmación de borrado de categoría

`ConfirmDialog` de `@/components/crm/confirm-dialog` (ya importado en `settings-client.tsx:27`), nivel **simple** (sin `confirmWord`).

| Prop | Valor |
|---|---|
| `title` | `¿Eliminar la categoría?` |
| `risk` | `"medio"` |
| `confirmLabel` | `"Eliminar"` |
| `destructive` | `true` |
| `description` | condicional por conteo (abajo) |

**El conteo sale del estado que ya está en memoria** (`services.filter(s => s.category_id === c.id).length`). **Cero queries de pre-check**, a diferencia del borrado de servicio: por eso este diálogo **no tiene estado `loading` ni `error`** y el botón "Eliminar" está disponible desde que abre.

`risk="medio"` y no `"alto"`: la base garantiza que ningún servicio se borra (`ON DELETE SET NULL (category_id)`, migr. 078). Lo único irrecuperable es **qué servicios estaban en esa categoría**, y eso lo dice el copy.

⚠ **Gotcha del repo, obligatorio:** las acciones del `ConfirmDialog` **auditan y retornan**; navegan con `router.push`, **nunca con `redirect()`** (tira un toast espurio por `NEXT_REDIRECT`). Acá directamente no hay navegación: se escribe, se actualiza el estado local y se cierra.

---

## Bloque E — El diálogo "Mover …"

**Uno solo para toda la Card** (no uno por chip): estado `moving: Service | null` en el componente. Evita N portales montados y N `Select` en una lista densa.

`<DialogContent className="grid max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 sm:max-w-sm">` — **copia literal** del patrón de scroll interno con pie anclado del diálogo "Editar servicio" (`settings-client.tsx:2795`), porque la lista de categorías puede ser larga. Las cuatro piezas del patrón son solidarias; ninguna sola alcanza.

```
┌──────────────────────────────────────┐
│ Mover “Corte”                    [X] │  DialogTitle
├──────────────────────────────────────┤  ← única fila que scrollea
│ Categoría                            │  Label
│ ( • Color                        )   │  role="radiogroup"
│ ( ○ Uñas                         )   │
│ ( ○ Barbería                     )   │
│ ( ○ Sin categoría                )   │  ← siempre última, siempre presente
│ ──────────────────── (Separator)     │
│ Posición            2 de 4           │  ← sólo si service_sort_mode === 'custom'
│ [ ▲ Subir ]  [ ▼ Bajar ]             │
├──────────────────────────────────────┤
│                         [ Guardar ]  │  DialogFooter
└──────────────────────────────────────┘
```

- **Se aplica al confirmar, no en cada toque.** El diálogo mantiene un borrador local `{ categoryId, index }`; "Guardar" hace **una** llamada al mutador compartido. Menos round-trips y una sola ventana de fallo.
- Opciones de categoría: `<button type="button" role="radio" aria-checked className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm">`, con `<Check className="size-4" />` en la seleccionada (portador no-cromático) y `bg-secondary` de relleno. **Sin acento.**
- "Sin categoría": siempre la última opción, siempre presente, con `border-dashed` — CAT-02 otra vez, y el mismo tratamiento que su grupo en la Card.
- **"Posición"** se renderiza sólo con `service_sort_mode === 'custom'` (D-12). "Subir" en la primera posición y "Bajar" en la última quedan `disabled` + `aria-disabled`. El texto "2 de 4" es `text-xs text-muted-foreground tabular-nums` y se actualiza en el borrador.
- **Al cambiar de categoría en el borrador, la posición se resetea al final del grupo destino** y el contador se recalcula. Mantener un índice de otro grupo sería mentir sobre dónde va a caer.
- Escape / click afuera / X descartan el borrador **sin escribir nada** (lo da el `Dialog` de `@base-ui/react`: focus trap, Escape y portal ya resueltos — **no se hand-rollea** el overlay ni el trap).

---

## Copywriting Contract

**Todo en español rioplatense, voseo.** Botones = verbo de acción + contexto. Errores = qué pasó + qué hacer.

| Element | Copy |
|---------|------|
| **Primary CTA** (fase) | `Agregar categoría` |
| CTA del diálogo "Mover …" | `Guardar` |
| Header del organizador | `Categorías del catálogo` |
| Pill de conteo del header | `Sin categorías` · `1 categoría` · `{n} categorías` |
| Ayuda del organizador | `Agrupá tus servicios bajo títulos. El orden que armes acá es el que ve tu cliente en la página de reservas.` |
| Label del alta | `Agregar categoría` · placeholder `Ej. Color` |
| Label modo categorías | `Orden de las categorías` — opciones `Como las ordené yo` · `Alfabético (A-Z)` |
| Label modo servicios | `Orden de los servicios` — opciones `Como los ordené yo` · `Alfabético (A-Z)` · `Por precio (de menor a mayor)` |
| Ayuda de los modos | `Vale para todo el negocio, dentro de cada categoría.` |
| Ayuda condicional (camino identidad) | `Se aplica cuando al menos un servicio tenga categoría.` |
| Conteo por categoría | `Sin servicios` · `1 servicio` · `{n} servicios` |
| Grupo de sueltos | Título `Sin categoría` · ayuda `Estos se reservan igual. En tu página aparecen al final, bajo “Otros”.` |
| **Empty state heading** | `Todavía no tenés categorías` |
| **Empty state body** | `Agrupá tus servicios bajo títulos —“Color”, “Uñas”, “Barbería”— para que tu página de reservas se lea de un vistazo. Sin categorías, tus servicios se muestran como hasta ahora.` |
| **Error — nombre duplicado** (`23505`) | `Ya tenés una categoría con ese nombre.` (inline, bajo el input) |
| **Error — nombre vacío** (`23514`, backstop) | `Escribí un nombre para la categoría.` (inline) |
| **Error — orden no guardado** (D-10.2) | `No se pudo guardar el orden. Volvimos a mostrar el que está guardado.` (toast) |
| **Error — no se pudo mover** | `No se pudo mover “{servicio}”. Probá de nuevo.` (toast) |
| **Error — modo de orden** | `No se pudo guardar el orden. Probá de nuevo.` (toast) |
| **Error — alta/renombrado genérico** | `No se pudo guardar la categoría. Probá de nuevo.` (toast) |
| Estado en vuelo del alta | Botón: `Agregando…` (deshabilitado) |
| Estado en vuelo del diálogo | Botón: `Guardando…` (deshabilitado) |
| Éxito del alta | `toast.success('Categoría creada')` |
| Éxito de mover | *(sin toast — el chip cambia de grupo a la vista)* |
| Label campo categoría | `Categoría (opcional)` · opción `Sin categoría` |
| Label campo descripción | `Descripción corta (opcional)` |
| Ayuda de la descripción | `Aparece debajo del nombre en tu página de reservas. Se ven 2 líneas.` |
| Placeholder de la descripción | `Ej. Incluye lavado, corte y peinado` |
| Contador | `{n}/120` · al límite, anuncio polite `Llegaste al máximo de 120 caracteres.` |
| **Destructive confirmation** | Título: `¿Eliminar la categoría?` · Confirmar: `Eliminar` |
| … con N > 1 servicios | `Vas a eliminar “{nombre}”. Sus {n} servicios quedan sin categoría: siguen activos y se pueden reservar igual. Después los podés asignar a otra.` |
| … con 1 servicio | `Vas a eliminar “{nombre}”. Su servicio queda sin categoría: sigue activo y se puede reservar igual. Después lo podés asignar a otra.` |
| … con 0 servicios | `Vas a eliminar “{nombre}”. No tiene ningún servicio asignado.` |
| `aria-label` de acciones | `Renombrar “{nombre}”` · `Subir “{nombre}”` · `Bajar “{nombre}”` · `Eliminar “{nombre}”` · `Mover “{servicio}”` |
| Anuncio de reorden (polite) | `“{nombre}” movida a la posición {n} de {total}` |

**Nunca, bajo ninguna circunstancia:** el texto crudo de un error de Postgres en pantalla. Se inspecciona `error.code` (`'23505'`, `'23514'`) y se mapea a copy propia — molde `agenda-client.tsx:640-675`, regla T-14-25 / T-13-09. Interpolar el mensaje de la base filtra nombres de constraints y de columnas a la pantalla del dueño.

---

## UI Considerations

Applicable state considerations resolved: **17 covered, 2 backstop, 0 unresolved.**

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | organizador (list-collection) | ✅ covered | Cero categorías ⇒ Card colapsada por D-02 y, al abrirla, el empty state con el heading y el body de `## Copywriting Contract` |
| empty | grupo "Sin categoría" (list-collection) | ✅ covered | No se renderiza con cero categorías; con ≥1 y cero huérfanos tampoco (`groupCatalog` nunca devuelve un grupo vacío) |
| empty | form de categoría (form) | ✅ covered | Input vacío ⇒ "Agregar" `disabled` por `!name.trim()`; el `23514` queda de backstop con su copy |
| empty | campo descripción (form) | ✅ covered | Vacío es el estado normal y legal: `(opcional)` en el label, contador en `0/120`, se guarda como `null` |
| loading | organizador (list-collection) | ✅ covered | **No aplica fetch-on-mount**: los datos bajan del RSC como props. No hay skeleton porque no hay espera |
| loading | alta / renombrado / mover / modo (interactive-control) | ✅ covered | Botón `disabled` + label en gerundio (`Agregando…` / `Guardando…`), que es lo que evita el doble submit |
| error | escritura del orden (list-collection) | 🧪 backstop | D-10.2: ante fallo parcial se **re-lee el orden real de la base**, se pinta eso (no el estado optimista) y se avisa con la copy de `## Copywriting Contract`. Lo que el dueño ve tiene que ser lo que está guardado |
| error | alta / renombrado (form) | ✅ covered | `23505` y `23514` mapeados a copy propia inline con `role="status"` + `aria-invalid` en el `Input`; el estado local **no se toca** ante el rechazo |
| error | modo de orden (interactive-control) | ✅ covered | El `Select` vuelve al valor anterior + toast; nunca queda mostrando un modo que no se guardó |
| error | mover servicio (interactive-control) | ✅ covered | Toast con el nombre del servicio; el chip vuelve a su grupo original |
| populated | organizador (list-collection) | ✅ covered | Volumen típico medido contra el dominio: una peluquería tiene 3-6 categorías y 8-15 servicios. La Card abierta entra sin scroll propio a 768px |
| populated | chips por grupo (list-collection) | ✅ covered | `flex-wrap`, sin scroll horizontal jamás, sin umbral de "ver todos" (a este volumen no hace falta) |
| partial | form de servicio (form) | ✅ covered | Categoría y descripción son **las dos opcionales**: un servicio con nombre/duración/precio y nada más es el estado válido de hoy y sigue siéndolo |
| partial | catálogo a medio configurar (list-collection) | ✅ covered | Categorías creadas sin ningún servicio asignado: `groupCatalog` toma el camino de identidad; el panel lo dice con la ayuda condicional del Bloque B |
| overflow | nombre de categoría (static-content) | ✅ covered | Desktop `sm:truncate` (molde de la tarjeta de servicio) · mobile `break-words` en varias líneas, nunca truncado |
| overflow | fila de acciones a 375px (nav) | ✅ covered | La fila se parte en dos líneas en mobile (`flex-col` → `sm:grid`); las tres acciones nunca comprimen el nombre |
| overflow | lista de categorías del diálogo (list-collection) | ✅ covered | Scroll interno con pie anclado, patrón ya shipeado en "Editar servicio" |
| zero-one-many | conteos y pills (list-collection) | ✅ covered | Copy con singular/plural real en los tres: `Sin categorías`/`1 categoría`/`{n} categorías`, `Sin servicios`/`1 servicio`/`{n} servicios`, y las tres variantes de la confirmación de borrado |
| long-text | chip de servicio (interactive-control) | 🧪 backstop | `whitespace-nowrap` + `flex-wrap`: un nombre largo ocupa su fila entera y envuelve la siguiente. **No se trunca** — un nombre cortado haría ambiguo cuál servicio se está por mover. Verificable con un servicio de ≥40 caracteres a 375px |
| long-text | descripción corta (form) | ✅ covered | Tope duro `maxLength={120}` + contador desde `0/120`: es imposible escribir más de lo que la tarjeta muestra |

---

## Accesibilidad (no negociable)

- [ ] **Piso táctil de 44×44 en todo lo interactivo nuevo.** `Button size="icon"` es `size-8` (32px) por defecto: hay que subirlo con `h-11 w-11 sm:h-8 sm:w-8` (molde de la tarjeta de servicio). El chip usa pill `h-7` dentro de un botón `min-h-11`.
- [ ] **Foco visible en todo lo nuevo:** `focus-visible:ring-2 focus-visible:ring-ring` (o el default del `Button`, que ya lo trae). Ratio medido del anillo: **3.84:1** sobre `--card`.
- [ ] **El arrastre NUNCA es el único camino.** Reordenar categorías: ▲/▼ con `aria-label`. Asignar y posicionar servicios: el diálogo "Mover …". Es literalmente el motivo de CAT-03 y de D-07.
- [ ] Colapsable: `aria-expanded` + `aria-controls` apuntando al `id` del cuerpo. El chevron es `aria-hidden`.
- [ ] Grips (`GripVertical`) **siempre `aria-hidden="true"`**: son afordancia visual del arrastre, no controles.
- [ ] Reorden anunciado a lectores de pantalla por una región `aria-live="polite"` `sr-only` **siempre montada** (molde `section-list.tsx:214`): lo que cambia es el **contenido**, nunca el nodo.
- [ ] Errores inline con `role="status"` (polite, **nunca `role="alert"`**) + `aria-invalid` en el `Input` + `aria-describedby` hacia el mensaje.
- [ ] Opciones de categoría del diálogo: `role="radiogroup"` + `role="radio"` + `aria-checked`. El estado seleccionado lleva `Check` **además** del relleno.
- [ ] `Textarea` con `aria-describedby` hacia la ayuda estática. El contador es `aria-hidden`; el aviso de límite es una región polite aparte que se puebla **una sola vez**.
- [ ] Botones de borde (`▲` en la primera, `▼` en la última) con `disabled` **y** `aria-disabled` — los dos, igual que `section-list.tsx:134`.
- [ ] Orden de tabulación natural (DOM): header → ayuda → selector → fila 1 (nombre → ▲ → ▼ → 🗑 → chips) → fila 2 → … → grupo de sueltos → alta. **Sin `tabIndex` positivos, sin focus trap** fuera del `Dialog`.
- [ ] `hover` nunca es el único feedback: cada estado tiene equivalente por teclado y en touch. El grip cambia el cursor, pero lo que informa es el texto y el foco.
- [ ] Ningún estado se comunica sólo por color (tabla en `## Color`). **Prohibido `opacity`** para atenuar.
- [ ] Jerarquía de headings intacta: la fase **no agrega ningún heading**. El `h1` de la página sigue siendo el único.
- [ ] Contraste verificado por token: `--muted-foreground` ≥4.99:1 · `--foreground` 16.2:1 · `--destructive` 5.41:1 · `--ring` 3.84:1 (no-texto). **Ninguno depende de `--primary`** salvo el anillo de foco y la barra de inserción, los dos por encima de 3:1.
- [ ] Animaciones: sólo `transform` (rotación del chevron) y `colors`, ≤300ms. **Nada que dispare layout** (`height`, `width`, `margin`).

---

## Responsive (mobile-first — 375px es el caso de diseño)

Ancho útil dentro de la Card a 375px: **295px** (375 − 2×16 de padding de página − 2×24 de `p-6`).

| Viewport | Fila de categoría | Chips | Diálogo "Mover …" |
|----------|-------------------|-------|--------------------|
| **375px** | **Dos líneas**: (1) grip + nombre que envuelve · (2) conteo + ▲▼🗑 a 44px alineados a la derecha | ~2-3 por fila, `flex-wrap`, **sin scroll horizontal nunca** | `max-h-[calc(100svh-2rem)]` con scroll interno y pie anclado; botón `w-full min-h-11` |
| **768px** | Una fila (`sm:grid-cols-[auto_minmax(0,1fr)_auto]`), botones a 32px, nombre `truncate` | ~4-5 por fila | `sm:max-w-sm`, botón `sm:w-auto sm:min-h-0` |
| **1280px** | Idéntico a 768 — la Card hereda el ancho del contenedor del dashboard y no se ensancha a propósito | ~6-8 por fila | Idéntico a 768 |

- **Cero media queries nuevas.** Todo con prefijos `sm:` de Tailwind. Si el layout necesitara un breakpoint propio, es señal de que se salió del patrón heredado.
- **Mobile-first literal:** las clases base son las de 375px y `sm:` escala hacia arriba. Nunca al revés.
- El `Drawer` (vaul) **no se usa en esta fase**: el único overlay es un `Dialog`, y el bug de portal del `Select` dentro del `Drawer` (`[[drawer-select-portal-fix]]`) no aplica porque el diálogo "Mover …" **no contiene ningún `Select`** — sus opciones son botones planos. Es decisión escrita, no casualidad.
- La Card colapsada mide lo mismo en los tres viewports: una fila de 44px. Con cero categorías (el estado de **todos** los negocios el día del deploy) `/servicios` **no crece ni un píxel** (D-02).

---

## Datos que la UI necesita (contrato con el read-path)

`app/(dashboard)/servicios/page.tsx`, dentro del `Promise.all` existente:

| Dato | Estado hoy | Qué falta |
|------|-----------|-----------|
| `business` | ✔ `select('*')` ⇒ ya trae `category_sort_mode` y `service_sort_mode` | nada |
| `services` | ✔ `select('*').eq('business_id', …).order('created_at')` ⇒ ya trae `category_id` y `sort_order` | **Cambiar el `order`** a `.order('sort_order', { ascending: true }).order('created_at', { ascending: true })`. ⚠ **Es seguro para CAT-07**: hoy todos los `sort_order` valen 0, así que la clave secundaria reproduce **exactamente** el orden de hoy. Sin esto, el orden manual no sobrevive a un reload |
| **`service_categories`** | ✘ | **Query nueva**: `.select('*').eq('business_id', business.id).order('sort_order').order('created_at')` + RLS (defensa en profundidad, sin excepción). Baja como prop nueva (`initialServiceCategories`) |

**La regla de agrupar NO se reimplementa en el panel.** Si el organizador necesita el catálogo agrupado, llama a `groupCatalog()` de `@/lib/service-categories` — ya resuelve "Otros" al final, la conservación (ningún servicio se pierde nunca) y el camino de identidad con cero categorías. Mismo criterio que `lib/staff-services.ts` y `lib/time-block-services.ts`.

⚠ **`groupCatalog()` es PURA y NO ESCRIBE, y de eso depende CAT-06.** El modo de orden es un **comparador**, no un estado que se persiste. Persistir `sort_order` al cambiar de modo rompería CAT-06 en silencio y para todos los negocios a la vez, sin forma de recuperar el arreglo manual del dueño (D-11, reversibilidad **one-way**).

⚠ **`business_id` va SIEMPRE en el `.eq()` de cada escritura**, además de la RLS (D-10.1). El reordenamiento **renumera la lista completa de hermanas**, nunca swaps sueltos.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | **ninguno nuevo** — se reusan `Card`, `Button`, `Input`, `Textarea`, `Label`, `Select`, `Dialog`, `Separator` ya instalados | not required |
| terceros | **ninguno** — `components.json → "registries": {}`, verificado 2026-09-15 con `node -p "JSON.stringify(require('./components.json').registries)"` → `{}` | not applicable |

Esta fase **no instala componentes, no agrega dependencias y no agrega ninguna librería de drag-and-drop** (el arrastre es `draggable` nativo de HTML5). Iconos nuevos usados: `Tags`, `GripVertical`, `ChevronUp` — todos de `lucide-react@1.17.0`, verificados presentes en `node_modules/lucide-react/dist/lucide-react.d.ts`, sin instalación.

---

## Trazabilidad decisión → contrato

| Decisión | Dónde se cumple en este spec |
|----------|------------------------------|
| D-01 Card colapsable en componente propio | Bloque A · `components/dashboard/categorias-manager.tsx` · molde `canchas-manager.tsx` |
| D-02 colapsada si 0, abierta si ≥1 · conteo en el header | Bloque A · El header · sin `localStorage` |
| D-03 cada selector donde actúa | Bloque A (categorías) + Bloque B (servicios, fuera del colapso) |
| D-04 borrado con el conteo | Bloque D · tres variantes de copy · `ON DELETE SET NULL` dicho en voz alta |
| D-05 dos caminos para asignar · "Sin categoría" opción real | Bloque C (`Select` con `(opcional)`) + Bloque A/E · "Sin categoría" primera y siempre presente |
| D-06 chips compactos + grupo de sueltos · la lista de abajo no se toca | Bloque A · Los chips · Alcance de la superficie |
| D-07 menú "Mover a…" · UNA sola función de escritura | Bloque E + la ⚠ del campo Categoría |
| D-08 los dos ejes se reordenan a mano | ▲/▼ en la fila de categoría + sección "Posición" del diálogo (desviación declarada) |
| D-09 escritura mixta, cero migraciones | Contrato con el read-path (el spec no prescribe el mecanismo de escritura, sólo que sea uno por eje) |
| D-10 un mutador por eje + fallo parcial nunca silencioso | `## UI Considerations` fila `error / escritura del orden` (backstop) + copy del toast |
| D-11 cambiar de modo NO persiste orden | Bloque B · párrafo final |
| D-12 con modo ≠ custom los controles NO se renderizan | Gates de visibilidad · por eje, independientemente |
| CAT-11 (delegada) | Bloque C · campo espejado + tope duro + contador desde `0/120` |
| Canchas (delegada) | Bloque A · "El vertical canchas queda AFUERA" |

---

## Riesgos y notas para el planner

1. **Los chips duplican los nombres de los servicios en pantalla** (arriba en la Card, abajo en las tarjetas). Es un **costo aceptado** de D-06, no un descuido. La alternativa —agrupar la lista de abajo— obligaba a reescribir la región más cargada y más peleada de `settings-client.tsx`.
2. **`settings-client.tsx` tiene 3636 líneas.** Lo único que se le agrega es: el import + render del organizador, el Bloque B (≈8 líneas) y dos campos ×2 formularios. Todo lo demás vive en el componente nuevo. **No se refactoriza nada de paso.**
3. **La misma pantalla la sirve `/settings` y `/servicios`, y hoy las dos páginas NO leen lo mismo** (verificado 2026-09-15): `settings/page.tsx` carga 5 tablas y **no** pasa `initialProfessionalServices`; `servicios/page.tsx` carga 6. Las dos renderizan `TabsContent value="services"`, así que el organizador se monta en las dos. Si `initialServiceCategories` baja sólo desde `/servicios`, en `/settings` la Card diría "Sin categorías" con categorías creadas — un estado falso, no un estado vacío. **La lectura nueva (y el `order` por `sort_order` de `services`) van en LAS DOS páginas**, o el organizador se gatea explícitamente por `view === 'servicios'` con el motivo escrito. Decidirlo en el plan, no en el código.
4. **Los helpers del organizador (`CategoryRow`, `ServiceChip`) van definidos fuera del componente**, no anidados: se renderizan dentro de un `map` y recrearlos en cada render remonta el DOM en medio de un arrastre.
5. **El `Select` de Base UI muestra el value crudo.** `SelectValue` necesita la forma de render-prop de `settings-client.tsx:2423` para mostrar el label en vez de `'custom'` o de un UUID.
6. **El estado del arrastre se resetea al colapsar la Card y al cambiar de modo.** Un `draggingId` colgado de un nodo desmontado deja la fila en `border-dashed` para siempre.
7. **Deuda anotada, NO se arregla acá:** los chips de servicio por profesional (`settings-client.tsx:2783`) usan `text-primary`, que falla AA en las paletas red/green/yellow en light. Ya estaba anotado en el 19-UI-SPEC; sigue fuera de alcance.
8. **`--border` está por debajo de 3:1 en todo el repo.** No es de esta fase y no se toca; este spec sólo declara que **no se apoya en él** para identificar ningún control.

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
