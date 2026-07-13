---
phase: 3
slug: rework-del-selector-de-rubro
status: draft
shadcn_initialized: true
preset: base-nova (neutral, CSS variables)
created: 2026-07-04
---

# Phase 3 — Contrato de diseño de UI

> Contrato visual y de interacción del selector de rubro (4 rubros + campo libre siempre visible).
> Generado por gsd-ui-researcher; verificado por gsd-ui-checker.
> Idioma de la UI: **español** (convención del proyecto). Los identificadores de código/tokens quedan como están.

**Alcance del contrato:** un único control reutilizado en DOS superficies que deben quedar visualmente idénticas entre sí:
1. **Onboarding** — paso "Tu negocio" (`app/(onboarding)/onboarding/page.tsx` ~L455-484).
2. **Dashboard → Configuración → Negocio** (`app/(dashboard)/settings/settings-client.tsx` L1084-1119).

Y un consumidor display-only aguas abajo:
3. **Booking público** — subtítulo de categoría (`app/[slug]/booking-client.tsx:401` y `app/[slug]/canchas-booking-client.tsx:331`), donde el texto libre (o el label del rubro como fallback, D-03) se muestra como categoría del negocio.

**No se introduce ningún componente nuevo ni dependencia.** Se reusan `Select`, `Input`, `Label` de `@/components/ui` verbatim; el contrato lifta sus estados default/hover/focus/disabled tal cual ya existen, para consistencia con los componentes hermanos.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn `^4.10.0` (ya inicializado — `components.json`) |
| Preset | `base-nova`, baseColor `neutral`, CSS variables |
| Component library | base-ui (`@base-ui/react` `^1.5.0`) — primitivas sin estilo bajo shadcn |
| Icon library | `lucide-react` `^1.17.0` |
| Font | `--font-sans` = `var(--font-grotesk)` (cuerpo/labels); `--font-heading` = `var(--font-archivo)` (títulos). Identidad Bauhaus, dark/light vía `next-themes` + `data-palette`/`data-theme` |

**Regla dura:** ningún color, radio ni tamaño hardcodeado. Todo sale de los tokens CSS de `app/globals.css` (`--input`, `--ring`, `--muted-foreground`, `--destructive`, `--radius`, etc.) vía clases utilitarias Tailwind v4 (`border-input`, `focus-visible:ring-ring/50`, `text-muted-foreground`, `rounded-lg`). Esto es lo que ya hacen `select.tsx` e `input.tsx`; el control nuevo NO debe apartarse.

---

## Spacing Scale

Escala 4/8 ya vigente en ambas superficies. El bloque del selector usa exactamente estos valores (no inventar otros):

| Token | Value | Uso en este control |
|-------|-------|---------------------|
| xs | 4px | `space-y-1` (gap Label↔control en settings); `pt-0.5`/`mt-0.5` de la leyenda |
| sm | 8px | `space-y-2` (gap Label↔control en onboarding); `gap-2` interno; padding horizontal del trigger/input (`px-2.5`) |
| md | 16px | `gap-4` de la grilla `grid-cols-1 sm:grid-cols-2`; `space-y-4` del bloque "Tu negocio" |
| lg | 24px | Separación entre secciones del form (heredada de la superficie, no se toca) |

**Excepciones (heredadas de shadcn, NO modificar):**
- Alto del `SelectTrigger` y del `Input`: `h-8` (32px) — es el default del design system para densidad de dashboard. Ver nota de touch target abajo.
- Padding interno del trigger: `py-2 pr-2 pl-2.5`; del input: `px-2.5 py-1`.
- Padding de los `SelectItem`: `py-1 pr-8 pl-1.5`.

**Touch target (mobile 375px):** el `SelectTrigger`/`Input` de 32px de alto es más chico que el mínimo de 44px de la guía. Es el estándar ya establecido en TODO el dashboard y onboarding (densidad de app, no de landing) → **se mantiene por consistencia con los hermanos** (cambiarlo solo acá rompería la coherencia visual, que es load-bearing para este proyecto). El área tocable efectiva del `Select` de base-ui incluye todo el ancho del trigger (`w-full`), lo que mitiga el alto reducido en mobile. No agregar un alto especial solo para este control.

---

## Typography

Tamaños/pesos ya definidos por los primitivos shadcn — NO redeclarar, solo respetar:

| Rol | Size | Weight | Line height | Origen |
|-----|------|--------|-------------|--------|
| Título de sección ("Tu negocio") | 20px (`text-xl`) | 600 (`font-semibold`) | heading ~1.2 | onboarding L456 |
| Label del selector / del campo | 14px (`text-sm`) | 500 (`font-medium`) | 1 (`leading-none`) | `label.tsx` |
| Valor del Select / texto del Input | 14px en `md+` (`md:text-sm`), 16px base en mobile (`text-base`) | 400 | ~1.5 | `input.tsx`, `select.tsx` |
| Item del Select | 14px (`text-sm`) | 400 | ~1.5 | `select.tsx` |
| Leyenda "Así aparecerá…" + hints | 12px (`text-xs`) | 400 | ~1.4 | patrón `p.text-xs.text-muted-foreground` (settings L1115) |

**Nota mobile-first (WCAG/CLAUDE.md):** el `Input` usa `text-base` (16px) en mobile y baja a `text-sm` (14px) desde `md`. Esto es correcto: cumple "nunca <16px de cuerpo en mobile" en el input de texto libre, que es el campo que el usuario escribe. **Mantener el `md:text-sm` del `Input` tal cual** — no forzar 14px en mobile.

Pesos totales en pantalla: **2** (400 regular + 500/600 para labels y título). Cumple el máximo de 2 pesos.

---

## Color

Paleta Bauhaus del proyecto (tokens de `app/globals.css`, light mode como referencia; dark los sobreescribe):

| Rol | Token | Valor (light) | Uso en este control |
|-----|-------|---------------|---------------------|
| Dominante (60%) | `--background` | `#f3ead8` (cream) | Fondo del paso/página. El trigger/input son `bg-transparent` sobre este fondo |
| Secundario (30%) | `--card` / `--popover` | `#fbf3e3` | Fondo del `SelectContent` (popup, `bg-popover`); la card contenedora en settings |
| Borde de control | `--input` | `#d9ceb4` | `border-input` del trigger y del input (estado default) |
| Acento (10%) | `--primary` / `--ring` | `#d94a2b` (Rojo Forjo) | **Reservado**: anillo de focus (`ring-ring/50`), borde en focus (`border-ring`), check del item seleccionado (`focus:bg-accent`), y el borde/tint del hint por vertical (`border-primary/30 bg-primary/5`) |
| Destructive | `--destructive` | `#b23a26` | **Solo estado inválido** (`aria-invalid:border-destructive` / `ring-destructive/20`). En esta fase el campo libre es opcional → normalmente NO se usa |
| Texto atenuado | `--muted-foreground` | `#6b6253` | Placeholder del select/input, leyenda "Así aparecerá…", texto de los hints |

**Acento reservado exclusivamente para:** (1) el estado focus del control (anillo + borde), (2) el indicador de selección del item activo en el Select, (3) el recuadro de "hint por vertical" (`border-primary/30 bg-primary/5`) que ya existe en onboarding. **Nunca** aplicar el acento como fondo del trigger, del input, ni de los items en reposo.

**Sin negro/blanco puro:** los tokens ya usan near-black (`#1a1714`) y near-cream (`#f3ead8`/`#fbf3e3`). No introducir `#000`/`#fff`.

**Contraste (WCAG AA):** placeholder/leyenda usan `--muted-foreground` (`#6b6253`) sobre cream (`#f3ead8`) → ratio ~4.7:1 (texto normal ≥4.5:1 OK). El texto ingresado usa `--foreground` (`#1a1714`) → ratio muy alto. Ambos estados ya validados por el design system vigente.

---

## Interaction States (el corazón de este contrato)

El control se compone de: **(A) Select de rubro** + **(B) Input de texto libre** + **(C) leyenda**. Estados liftados verbatim de los primitivos — el executor NO debe reescribir estos estilos, solo usar los componentes:

### A. Select de rubro (`components/ui/select.tsx`)
- **default:** `border-input bg-transparent` (`dark:bg-input/30`), texto `text-sm`, chevron `text-muted-foreground`. Placeholder `"Elegí tu rubro"` en `data-placeholder:text-muted-foreground`.
- **hover (dark):** `dark:hover:bg-input/50`. En light no hay cambio de fondo (consistente con el resto del dashboard).
- **focus-visible:** `border-ring` + `ring-3 ring-ring/50` (anillo de acento visible — cumple foco visible WCAG AA).
- **open:** popup `bg-popover` con `ring-1 ring-foreground/10 shadow-md`, animación de entrada `fade-in-0 zoom-in-95` (base-ui, <100ms).
- **item hover/active:** `focus:bg-accent focus:text-accent-foreground`; item seleccionado muestra `CheckIcon` a la derecha.
- **disabled:** `disabled:cursor-not-allowed disabled:opacity-50` (no aplica en esta fase; el rubro es obligatorio y editable).
- **inválido:** `aria-invalid:border-destructive aria-invalid:ring-destructive/20` — reservado; el rubro es required (D-02), si se enviara vacío el `canGoNext` ya lo bloquea sin marcar el control en rojo (patrón vigente del onboarding: se deshabilita "Siguiente", no se pinta el campo).

**Contenido del Select:** exactamente **4 `SelectItem` planos** (sin `SelectGroup`/`SelectLabel`), `value = VerticalKey`, en este orden y con estos labels:

| value (VerticalKey) | Label visible |
|---------------------|---------------|
| `salud` | Salud |
| `belleza` | Belleza/Estética/Spa |
| `general` | General |
| `canchas` | Canchas |

> El label de `belleza` cambia en `VERTICALS.belleza.label` a **"Belleza/Estética/Spa"** (D-01) y se propaga solo al Select, al fallback de booking y al hint. Iterar `Object.keys(VERTICALS)` para no hardcodear la lista.

### B. Input de texto libre (`components/ui/input.tsx`)
- **default:** `border-input bg-transparent`, `text-base md:text-sm`, `placeholder:text-muted-foreground`. Placeholder = `RUBRO_PLACEHOLDERS[vertical]` (cambia con el rubro — ver Copywriting).
- **focus-visible:** `border-ring ring-3 ring-ring/50` (idéntico al Select → consistencia).
- **disabled:** `disabled:opacity-50 disabled:bg-input/50` (no aplica; campo siempre editable).
- **inválido:** `aria-invalid:*` reservado. El campo es **opcional** (D-03) → no lleva validación de requerido ni marca de error en flujo normal. (Defensivo opcional, no bloqueante: `type.trim()` + límite de longitud razonable al guardar, ver Security de RESEARCH — no cambia estados visuales.)

### C. Leyenda + hint
- Leyenda bajo el input: `<p className="text-xs text-muted-foreground">Así aparecerá en tu página de reservas</p>`, con `pt-0.5` (4px) de separación. Siempre visible.
- Hint por vertical (ya existe en onboarding, L487-498): recuadro `flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm` con icono lucide + copy. **Se conserva**, pero su condición pasa a keyear por el `vertical` elegido directamente (no `getVerticalKeyByType(type)`, D-07). En settings el hint equivalente es la línea `Rubro: <label> · define el menú…` (L1115-1118) — se conserva leyendo `VERTICALS[vertical].label`.

### Layout del bloque (mobile-first 375px)
- **Onboarding:** dentro de `grid grid-cols-1 sm:grid-cols-2 gap-4`. El Select de rubro ocupa una celda (junto a "Nombre del negocio"); el Input libre + leyenda van **debajo, a ancho completo** (fuera de la grilla de 2 columnas o en una fila propia `sm:col-span-2`), para que la sugerencia y la leyenda respiren. En mobile todo apila a 1 columna. Gap Label↔control: `space-y-2`.
- **Settings:** dentro de `grid grid-cols-1 sm:grid-cols-2 gap-4`; el bloque "Tipo/Rubro" reemplaza el andamiaje viejo (Select 4 rubros + Input libre siempre visible + leyenda), reusando `space-y-1` para el gap Label↔control (patrón de la superficie). Se elimina el `flex gap-2` con el toggle "Otro" y el Input condicional.
- **Consistencia entre superficies:** mismo orden vertical (Label rubro → Select → Label "¿A qué se dedica tu negocio?" → Input → leyenda), mismos componentes, mismos placeholders. La única diferencia admitida es el `space-y` del contenedor (2 en onboarding, 1 en settings) porque cada superficie ya usa el suyo.

---

## Copywriting Contract

Copy **bloqueado por el usuario (CONTEXT D-05/D-06)** — reproducir literal, sin reformular:

| Elemento | Copy |
|----------|------|
| Label del Select de rubro | Onboarding usa "Tipo de negocio *"→ pasa a **"Rubro *"** (obligatorio, D-02); settings usa "Tipo" → pasa a **"Rubro"**. (Label corto; el detalle lo da el campo de abajo.) |
| Placeholder del Select | **Elegí tu rubro** |
| Label del campo libre | **¿A qué se dedica tu negocio?** |
| Leyenda bajo el campo | **Así aparecerá en tu página de reservas** |
| Placeholder del campo — Salud | **Ej: Lic. en Psicología, Kinesiólogo** |
| Placeholder del campo — Belleza/Estética/Spa | **Ej: Barbería, Masajista, Depilación** |
| Placeholder del campo — General | **Ej: Lavaautos, Tatuajes, Fotógrafo** |
| Placeholder del campo — Canchas | **Ej: Canchas de fútbol** |

**Fuente única de los placeholders:** mapa `RUBRO_PLACEHOLDERS: Record<VerticalKey, string>` en `lib/verticals.ts` (D-06 / RESEARCH Pattern 1). Ambas superficies lo consumen con `RUBRO_PLACEHOLDERS[vertical]`. No hardcodear el placeholder en cada componente.

**Estados adicionales (no hay empty/error clásicos en este control):**

| Elemento | Copy / comportamiento |
|----------|----------------------|
| Campo libre vacío (opcional) | No es un error. En booking, si `type` está vacío se muestra el **label del rubro como fallback** (D-03): `business.type || getVerticalLabel(business)`. Ejemplos visibles en booking: "Salud", "Belleza/Estética/Spa", "General", "Canchas". El subtítulo **nunca** queda vacío. |
| CTA de la superficie | Este control NO tiene CTA propio. Onboarding avanza con el botón "Siguiente"/"Continuar" ya existente (gateado por `canGoNext`, que exige rubro elegido, D-02); settings guarda con el botón "Guardar" ya existente. No agregar botones. |
| Acción destructiva | **Ninguna en esta fase.** Cambiar de rubro en settings reconfigura terminología/menú del propio negocio (patrón vigente), no borra datos → no requiere confirmación destructiva. No introducir ConfirmDialog. |

**Subtítulo de categoría en booking (D-03):** aplicar el fallback en AMBOS clients — `booking-client.tsx:401` y `canchas-booking-client.tsx:331` — con el mismo patrón (`business.type || getVerticalLabel(business)`). Render con JSX interpolado (auto-escape de React); **prohibido** `dangerouslySetInnerHTML` sobre el texto libre (V5 input validation, RESEARCH Security).

---

## Registry Safety

| Registry | Blocks usados | Safety Gate |
|----------|---------------|-------------|
| shadcn official | `Select`, `Input`, `Label` (ya instalados en `@/components/ui`, sin cambios) | not required |
| Terceros | ninguno | not applicable |

No se instala ni se trae ningún bloque nuevo. Sin superficie de registry safety.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
