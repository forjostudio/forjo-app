---
phase: 8
slug: equipo-qu-servicios-hace-cada-profesional
status: draft
shadcn_initialized: true
preset: "style=base-nova · baseColor=neutral · cssVariables=true · rsc=true · iconLibrary=lucide"
created: 2026-07-24
---

# Phase 8 — UI Design Contract

> Contrato visual y de interacción para los DOS bloques nuevos de la Phase 8. Generado por gsd-ui-researcher, verificado por gsd-ui-checker.
>
> **El design system YA EXISTE.** Este documento lo *documenta y reusa*: no inventa tokens, no agrega dependencias, no crea componentes nuevos. Todo lo prescripto sale de `app/globals.css` y de los idiomas ya probados en `app/(dashboard)/settings/settings-client.tsx`.

---

## Alcance de la superficie

Exactamente **dos bloques** dentro de `app/(dashboard)/settings/settings-client.tsx`, el componente que sirve las dos vistas vía su prop `view`:

| # | Bloque | Vista | Ruta | Escritura | Decisión |
|---|--------|-------|------|-----------|----------|
| A | Editor del mapeo (por profesional) | `view="equipo"` | `/equipo` | SÍ (optimista) | D-05, D-06 |
| B | Cobertura (por servicio) | `view="servicios"` | `/servicios` | NO (solo lectura) | D-05, D-08 |

**Fuera de alcance (no se toca):** las dos páginas públicas de booking, el motor de reservas, `nuevo-turno-form.tsx`, el alta de abonos, el `CanchasManager`, el CRUD de servicios y el CRUD de profesionales existentes (solo se les **agrega** una línea / un badge, sin reescribirlos).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn `^4.10.0` (ya inicializado — `components.json` presente) |
| Preset | `style: base-nova` · `baseColor: neutral` · `cssVariables: true` · `rsc: true` |
| Component library | `@base-ui/react ^1.5.0` (primitivas) + `@/components/ui` (shadcn) |
| Styling | Tailwind CSS v4 — config CSS-first en `app/globals.css`, **sin** `tailwind.config` |
| Icon library | `lucide-react ^1.17.0` — **única** librería de iconos, sin excepciones |
| Font (cuerpo) | `var(--font-sans)` → `--font-grotesk`, fallback `system-ui, sans-serif` |
| Font (títulos) | `var(--font-heading)` → `--font-archivo` (aplicada por `@layer base` a `h1,h2,h3`) |
| Toasts | `sonner ^2.0.7` |
| Helper de clases | `cn()` de `@/lib/utils` |
| Registries de terceros | **ninguno** (`components.json → "registries": {}`) |

**Componentes nuevos a crear: CERO.** Todo se arma con `Card`, `Button`, `<button>` con `aria-pressed`, `next/link`, iconos lucide y `toast` de sonner, ya presentes en el archivo.

---

## Spacing Scale

Escala del proyecto (múltiplos de 4), tal como la usa el bloque hermano `agenda_spaces`:

| Token Tailwind | Value | Uso en esta fase |
|----------------|-------|------------------|
| `gap-1` | 4px | Icono ↔ texto dentro del badge "Sin cobertura" |
| `space-y-2` / `gap-2` | 8px | Separación entre chips · líneas dentro de una fila · icono ↔ texto del aviso |
| `p-3` | 12px | Padding de cada fila de profesional / de servicio |
| `space-y-4` / `mt-4` / `pt-4` | 16px | Separación entre sub-bloques dentro de la Card · separación entre Cards |
| `p-6` | 24px | Padding de la Card |
| `space-y-6` | 24px | Separación vertical del contenedor de página (ya existente) |

**Radios:** `rounded-full` para chips y badges · `rounded-lg` (`--radius: 0.4rem`) para filas. Sin valores nuevos.

**Excepciones declaradas (2, ambas heredadas del patrón existente — NO son valores nuevos):**

1. **Altura de chip `h-8` (32px)** en vez de un touch target de 44px. Se hereda tal cual de `settings-client.tsx:1501`. D-06 exige que el bloque nuevo sea *visualmente indistinguible* del de espacios; romper la altura lo delataría. Mitigación obligatoria: `gap-2` (8px) entre chips —separación real entre targets adyacentes— y ancho generoso por `px-3` + label de texto (nunca chips de solo icono).
2. **`text-[11px]`** para la línea de metadatos de cobertura, para igualar la línea hermana `"Se ofrece en:"` (`settings-client.tsx:1252`). Es texto de metadato, no de cuerpo.

Cualquier otro valor fuera de la escala (ej. `gap-1.5`, `py-0.5`) queda **prohibido** en el código nuevo de esta fase.

---

## Typography

3 tamaños, 2 pesos. Line-heights = defaults de Tailwind (no hace falta clase extra).

| Role | Clase | Size | Weight | Line Height | Dónde |
|------|-------|------|--------|-------------|-------|
| Título de bloque | `text-sm font-medium` | 14px | 500 | 20px (1.43) | "Qué {servicios} hace cada {profesional}" · nombre del profesional en la fila |
| Body / ayuda | `text-xs` | 12px | 400 | 16px (1.33) | Subtítulo explicativo · línea guía cuando no hay servicios |
| Chip / aviso | `text-xs font-medium` | 12px | 500 | 16px (1.33) | Label del chip · línea de "sin cobertura" |
| Metadato | `text-[11px]` | 11px | 400 / 500 | 16px (1.45) | "Lo hacen: …" · "Hace todo" · badge |

**Prohibido en esta fase:** `text-base`, `text-lg`, `font-semibold`, `font-bold`, `italic`. El `h1` de la página (`text-2xl font-bold`, fuente Archivo) ya existe y **no se toca**.

---

## Color

Todos los valores salen de custom properties de `app/globals.css`. **Cero hex hardcodeado en componentes** — regla dura: cada color debe escribirse como clase de token (`text-warning`, `bg-primary/10`, …), nunca `text-amber-600` ni `#8a5a12`. Eso es lo que hace que el bloque funcione en los 5 themes × 5 paletas × dark mode sin duplicar estilos.

| Role | Token | Light | Dark | Uso |
|------|-------|-------|------|-----|
| Dominant (60%) | `--background` | `#f3ead8` | `#1a1714` | Superficie de página |
| Secondary (30%) | `--card` + `--secondary` | `#fbf3e3` / `#e9ddc4` | `#252019` / `#2e2820` | Card del bloque · fila por profesional / por servicio (`bg-secondary/50`) |
| Accent (10%) | `--primary` (depende de la paleta del negocio; default `#d94a2b`) | por paleta | por paleta | ver lista de reserva ↓ |
| Warning | `--warning` | `#8a5a12` (4.97:1 AA) | `#e6b53f` (8.75:1 AAA) | **exclusivamente** el estado "sin cobertura" |
| Destructive | `--destructive` | `#b23a26` | `#e05c43` | **NO se usa en esta fase** |
| Texto secundario | `--muted-foreground` | `#6b6253` | `#a99e8b` | Ayudas, labels de metadato |
| Borde | `--border` | `#d9ceb4` | `oklch(… /12%)` | Chip sin marcar |

**El acento (`--primary`) queda reservado para, y SOLO para:**

1. Chip de servicio **marcado**: `border-primary bg-primary/10 text-primary`.
2. Chip **sin marcar en hover**: `hover:border-primary hover:text-primary`.
3. Anillo de foco visible: `focus-visible:ring-ring` (`--ring` = `--primary`).
4. El link "Equipo" del aviso de sin cobertura.

**Prohibido:** pintar de acento el título del bloque, el nombre del profesional, las filas, los avisos, ni el estado "Hace todo".

**El warning queda reservado para, y SOLO para:** el badge "Sin cobertura" y su línea de acción en `/servicios`, y el `toast.warning` de D-10. No se usa para el aviso de comodín de D-02 (ese no es un problema, es información).

---

## Bloque A — Editor del mapeo (`view="equipo"`)

### Ubicación exacta

Dentro de `<TabsContent value="professionals">`, como una **tercera Card**, en este orden:

1. Card "Profesionales del equipo" (CRUD existente — intacta)
2. **Card NUEVA: "Qué {servicios} hace cada {profesional}"** ← acá
3. Card "Espacios físicos compartidos" (existente — intacta)

Va antes de Espacios porque el mapeo staff↔servicios le sirve a todos los negocios con equipo, y el espacio compartido es un concepto avanzado de minoría.

Contenedor: `<Card className="p-6 space-y-4 mt-4">` — idéntico a la Card de espacios (`settings-client.tsx:1422`).

### Gates de visibilidad (en este orden, todos obligatorios)

| # | Condición | Resultado | Origen |
|---|-----------|-----------|--------|
| 1 | vertical `canchas` | Card **no se renderiza** | D-18 |
| 2 | `professionals.filter(p => p.active).length < 2` | Card **no se renderiza** (sin empty state, sin placeholder) | D-07 |
| 3 | `services.length === 0` | Card se renderiza con header + **línea guía**, sin filas | patrón `settings-client.tsx:1479-1483` |

`/equipo` ya redirige el vertical canchas a `/dashboard` (`equipo/page.tsx:18`); el gate 1 es defensa en profundidad, no reemplazo.

### Anatomía

```
┌ Card p-6 space-y-4 mt-4 ─────────────────────────────────────────────┐
│ ┌ div.space-y-1 ────────────────────────────────────────────────────┐ │
│ │ Qué servicios hace cada profesional          text-sm font-medium  │ │
│ │ Marcá qué hace cada profesional. Si no marcás nada, se ofrece      │ │
│ │ para todo.                                text-xs muted-foreground │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│ ┌ div.space-y-2 ────────────────────────────────────────────────────┐ │
│ │ ┌ div.p-3.rounded-lg.bg-secondary/50.space-y-2 ─────────────────┐ │ │
│ │ │ Ana Pérez                       text-sm font-medium truncate  │ │ │
│ │ │ Hace todo            ← solo si 0 filas · text-[11px] muted    │ │ │
│ │ │ ┌ div.flex.flex-wrap.gap-2 (role="group") ─────────────────┐  │ │ │
│ │ │ │ (✓ Corte)  ( Color )  ( Barba )         chips h-8        │  │ │ │
│ │ │ └──────────────────────────────────────────────────────────┘  │ │ │
│ │ └───────────────────────────────────────────────────────────────┘ │ │
│ │ … una fila por profesional ACTIVO                                 │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

**Qué profesionales se listan:** solo los **activos** (`p.active`), mismo criterio que el contador del plan (`settings-client.tsx:1349`) y que la vista pública `public_professionals`. D-16 se preserva igual: desactivar **no borra** filas de la puente, solo las saca de esta lista y del cálculo de cobertura.

**Qué servicios se listan como chips:** todos los `services` del negocio, en el orden en que llegan (`order('created_at')`), incluidos los **inactivos** — el mapeo es una capacidad de la persona, no un estado del catálogo. Un servicio inactivo **no** recibe tratamiento visual distinto en este bloque.

### El chip (contrato exacto — copiar de `settings-client.tsx:1495-1510`)

```
<button
  type="button"
  onClick={() => toggleProfessionalService(p.id, s.id)}
  aria-pressed={checked}
  className={cn(
    'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',   // ← ÚNICO agregado
    checked
      ? 'border-primary bg-primary/10 text-primary'
      : 'border-border text-muted-foreground hover:border-primary hover:text-primary',
  )}
>
  {checked && <Check aria-hidden="true" className="w-3.5 h-3.5" />}
  {s.name}
</button>
```

El **único** cambio respecto del chip de espacios es el par `focus-visible:*`: no altera el aspecto en reposo, hover ni marcado, y cierra el requisito de foco visible (WCAG). El `gap-1.5` interno se mantiene textualmente porque es parte del string heredado.

Envolver la fila de chips en `<div role="group" aria-label={\`Servicios de ${fullName}\`} className="flex flex-wrap gap-2">` para que un lector de pantalla sepa de quién son los chips.

### Estados

| Estado | Tratamiento |
|--------|-------------|
| Default (sin marcar) | `border-border text-muted-foreground` |
| Hover (sin marcar) | `hover:border-primary hover:text-primary` — solo color, `transition-colors` |
| Focus (teclado) | `ring-2 ring-ring` — **nunca** hover como único feedback |
| Marcado | `border-primary bg-primary/10 text-primary` + icono `Check` |
| Marcado + hover | sin cambio (el estado ya es el feedback) |
| Guardando | **ninguno** — el toggle es optimista e instantáneo, paridad exacta con `toggleAgendaSpace`. Sin spinner, sin `disabled`, sin `aria-busy`. |
| Error | Rollback del estado local + `toast.error` |
| Disabled | **no existe** en esta fase |

**Motion:** solo `transition-colors` (default 150ms). Prohibido animar layout, alto, o la aparición/desaparición de chips.

**Carga inicial:** no hay. Los datos llegan server-rendered por props desde `page.tsx`; no hay fetch en cliente, por lo tanto **no hay skeleton ni spinner**.

### Avisos al togglear (D-02 + D-10)

Ambos son `toast` de sonner disparados **después** de que la escritura optimista se aplicó.

| Condición al **desmarcar** | Toast | Copy |
|---|---|---|
| Quedó **algún** servicio sin ningún profesional capaz (D-10) | `toast.warning` | `Nadie ofrece "{servicio}". Marcá a alguien para que lo cubra.` |
| El profesional quedó con **0** servicios marcados (D-02) | `toast.info` | `Sin nada marcado, {Nombre} vuelve a ofrecerse para todo.` |
| Falla la escritura | `toast.error` | `No se pudo guardar el cambio. Revisá tu conexión y probá de nuevo.` |

**Regla de precedencia (obligatoria):** un toggle dispara **como máximo UN** toast. Si se cumplen las dos condiciones a la vez, gana el de **D-10** (dejar un servicio huérfano es más consecuente que volver a comodín). Si el toggle **falla**, se muestra solo el `toast.error` y **ninguno** de los otros dos.

Marcar (no desmarcar) nunca dispara toast: la respuesta es el propio chip que se pinta.

*Alternativa rechazada:* una lista persistente de "servicios sin cobertura" dentro del bloque de `/equipo`. D-10 pide el aviso **en el momento** en `/equipo` y el **persistente** en `/servicios`; duplicar el persistente en los dos lados agrega una tercera superficie que se puede desincronizar.

---

## Bloque B — Cobertura (`view="servicios"`, solo lectura)

### Ubicación exacta

Dentro del `map` de servicios ya existente (`settings-client.tsx:1230-1261`), en la rama **no-canchas** (`isCanchas === false`). Dos agregados quirúrgicos a la fila que ya existe, **sin reescribir la fila**:

1. Un **badge** al lado del nombre del servicio (línea 1 de la fila).
2. Una **línea nueva**, la última de la fila, después de la línea `"Se ofrece en:"`.

### Gates de visibilidad

Idénticos a los del Bloque A, gates 1 y 2:

| # | Condición | Resultado | Origen |
|---|-----------|-----------|--------|
| 1 | vertical `canchas` | ni badge ni línea | D-18 (`/servicios` **no** redirige por vertical — el gate acá es la única defensa) |
| 2 | `professionals.filter(p => p.active).length < 2` | ni badge ni línea | derivado de D-07 |

> **Derivación declarada (no es una decisión nueva):** D-07 oculta *el bloque de mapeo* con menos de 2 profesionales activos. La cobertura es la otra cara del mismo mapeo: con una sola persona, todo servicio diría "Lo hacen: Ana" — ruido puro, y contradice STAFF-03 (no obligar a configurar). Se aplica el mismo gate a las dos superficies para que no puedan divergir.

### Anatomía — servicio CON cobertura

```
┌ div.p-3.rounded-lg.bg-secondary/50.space-y-2 ────────────────────────┐
│ Corte                            [Desactivar] [✎] [🗑]               │
│ 45min · $8.000                              text-xs muted-foreground │
│ Se ofrece en: (Todos)(Centro)               ← línea existente        │
│ Lo hacen: Ana · Juan                        ← NUEVA, text-[11px]     │
└──────────────────────────────────────────────────────────────────────┘
```

- Label `Lo hacen:` en `text-[11px] text-muted-foreground`; los nombres en `text-[11px] text-foreground`.
- Separador entre nombres: `' · '` — el joiner idiomático del repo (`settings-client.tsx:1238, 1355, 1542`).
- Nombre mostrado: `[p.name, p.last_name].filter(Boolean).join(' ')`, igual que en todo el archivo.
- **Texto plano, sin pills.** Las pills en esta fila significan "clickeable" (los chips de consultorio de la línea de arriba). La cobertura es solo lectura: no puede afordar un click que no existe.
- Si la lista es larga, envuelve con el propio `flex-wrap` del contenedor; **no** se trunca ni se pone "+3 más".
- La lista sale del helper puro de D-12 (`lib/staff-services.ts`), que ya resuelve la regla del comodín: un profesional con 0 filas aparece en **todos** los servicios. Prohibido reimplementar la regla en el componente.

### Anatomía — servicio SIN cobertura

```
┌ div.p-3.rounded-lg.bg-secondary/50.space-y-2 ────────────────────────┐
│ Color  (⚠ Sin cobertura)         [Desactivar] [✎] [🗑]               │
│ 60min · $15.000                                                      │
│ Se ofrece en: (Todos)(Centro)                                        │
│ ⚠ Nadie lo ofrece — asignalo en Equipo                ← NUEVA        │
└──────────────────────────────────────────────────────────────────────┘
```

**Badge** (al lado del nombre, dentro de un wrapper `flex items-center gap-2 min-w-0`; el nombre conserva `truncate`, el badge lleva `flex-shrink-0`):

```
<span className="inline-flex items-center gap-1 flex-shrink-0 px-2 py-1 rounded-full
                 border border-warning/30 bg-warning/10 text-warning text-[11px] font-medium">
  <TriangleAlert aria-hidden="true" className="w-3 h-3" />
  Sin cobertura
</span>
```

Los tokens `border-warning/30 bg-warning/10 text-warning` son exactamente los del aviso de MercadoPago ya en producción (`settings-client.tsx:1664-1666`); el `px-2 py-1 rounded-full` es el de la pill de plan (`:1348`).

**Línea de acción** (reemplaza a la línea `Lo hacen:`):

```
<p role="status" className="flex items-center gap-2 text-xs font-medium text-warning">
  <TriangleAlert aria-hidden="true" className="w-3.5 h-3.5 flex-shrink-0" />
  <span>Nadie lo ofrece — asignalo en <Link href="/equipo" className="underline underline-offset-2">Equipo</Link></span>
</p>
```

`role="status"` (polite), no `role="alert"`: es una condición de configuración, no una interrupción.

### Cuándo un servicio está "sin cobertura"

Solo cuando **todos** los profesionales activos tienen mapeo explícito y **ninguno** marcó ese servicio. Si queda al menos un comodín (0 filas), **ningún** servicio está sin cobertura. Esa regla es la del helper de D-12 — el componente la **consume**, no la reimplementa.

---

## Copywriting Contract

Idioma: **español rioplatense, voseo** ("Marcá", "agregá", "asignalo"), igual que el resto del panel. Sin emojis. Sin signos de admiración.

**Terminología (D-18):** todo sustantivo de eje sale de `term` (`lib/use-terminology.tsx`), nunca hardcodeado:

- `term.resource` → "Profesional" (salud/belleza/general) · "Cancha" (canchas, gateado)
- `term.services` → "Servicios" (belleza/general) · "Prestaciones" (salud)

**Regla de género (obligatoria):** `term.services` cambia de género entre verticales ("los servicios" / "las prestaciones"). El copy **debe evitar el artículo** delante de la interpolación. Escribir `Qué ${term.services.toLowerCase()} hace cada …`, nunca `Marcá los ${term.services.toLowerCase()}`.

**Regla de nombres de sección:** el h1 y el sidebar dicen literalmente **"Servicios"** y **"Equipo"** en todos los verticales (`settings-client.tsx:872-873`). Cuando el copy referencia *la sección*, usa el literal; cuando referencia *la cosa*, usa `term`.

| Elemento | Copy |
|----------|------|
| Título del bloque A | `Qué {term.services.toLowerCase()} hace cada {term.resource.toLowerCase()}` |
| Subtítulo del bloque A | `Marcá qué hace cada {term.resource.toLowerCase()}. Si no marcás nada, se ofrece para todo.` |
| Estado comodín (por persona) | `Hace todo` |
| Empty state — sin servicios cargados | `Primero agregá {term.services.toLowerCase()} en Servicios; después vas a poder marcar qué hace cada {term.resource.toLowerCase()}.` |
| Cobertura — con cobertura | `Lo hacen: Ana · Juan` |
| Cobertura — badge sin cobertura | `Sin cobertura` |
| Cobertura — línea sin cobertura | `Nadie lo ofrece — asignalo en Equipo` (con "Equipo" como link a `/equipo`) |
| Toast D-10 (se quedó sin cobertura) | `Nadie ofrece "{servicio}". Marcá a alguien para que lo cubra.` |
| Toast D-02 (volvió a comodín) | `Sin nada marcado, {Nombre} vuelve a ofrecerse para todo.` |
| Toast de error (rollback) | `No se pudo guardar el cambio. Revisá tu conexión y probá de nuevo.` |

**Verificaciones de veracidad del copy (importante):** en la Phase 8 el mapeo **todavía no afecta la reserva pública** (la fase no toca el motor; eso llega en las Phases 9/10). El copy tiene **prohibido** afirmar que un servicio sin cobertura "no se puede reservar" o "desaparece de tu página". Las frases de arriba son verdaderas hoy y siguen siendo verdaderas después de la Phase 10.

**Primary CTA:** esta fase **no tiene** un CTA primario nuevo. El chip ES la acción; agregar un botón "Guardar" contradiría D-06 (guardado inmediato).

**Acciones destructivas:** **ninguna** en estos dos bloques. Desmarcar un chip es reversible en un click. Borrar servicios/profesionales ya tiene su propia confirmación y limpia la puente por FK `ON DELETE CASCADE` (D-17) — **no se agrega confirmación adicional**.

---

## Accesibilidad (no negociable)

- [ ] Chips: `<button type="button">` con `aria-pressed={checked}`; nombre accesible = nombre del servicio.
- [ ] Grupo de chips: `role="group"` + `aria-label="Servicios de {nombre}"`.
- [ ] Foco visible en **todo** lo interactivo nuevo: `focus-visible:ring-2 focus-visible:ring-ring`.
- [ ] Iconos decorativos (`Check`, `TriangleAlert`) con `aria-hidden="true"`; el significado siempre está en el texto adyacente.
- [ ] El estado "sin cobertura" **nunca** se comunica solo por color: siempre color **+ icono + texto**.
- [ ] Aviso de sin cobertura con `role="status"` (polite).
- [ ] Contraste verificado por token: `--warning` 4.97:1 (light) / 8.75:1 (dark); `--muted-foreground` y `--primary` ya validados en el design system.
- [ ] Jerarquía de headings intacta: los títulos de bloque son `<p className="text-sm font-medium">`, **no** `<h2>/<h3>` — igual que todos los bloques hermanos de la Card.
- [ ] Sin `hover` como único feedback: cada estado tiene su equivalente visible en teclado.

---

## Responsive (mobile-first, 375px)

| Aspecto | Comportamiento |
|---------|----------------|
| Contenedor | `max-w-3xl` existente; sin breakpoints nuevos |
| Fila de chips | `flex flex-wrap gap-2` — envuelve sola en 375px, sin scroll horizontal |
| Nombre + badge (bloque B) | Nombre `truncate`, badge `flex-shrink-0` → con nombres largos se recorta el nombre y **sobrevive el badge** (la advertencia es lo prioritario) |
| Línea "Lo hacen:" | Envuelve por `flex-wrap`; nunca scroll horizontal, nunca "+N más" |
| Botones de acción de la fila | Los existentes ya son `h-8 w-8` con `flex-shrink-0` — no se tocan |

**Ningún bloque nuevo introduce media queries.** Si un layout requiere un breakpoint, es señal de que se está saliendo del patrón heredado.

---

## Datos que la UI necesita (contrato con el read-path)

Para que estos dos bloques rendericen sin fetch en cliente:

| Vista | Ya llega | Falta agregar |
|-------|----------|---------------|
| `/equipo` | `professionals`, `spaces`, `agendaSpaces` | `services` (hoy `initialServices={[]}` — `equipo/page.tsx:31`) **+** filas de la puente |
| `/servicios` | `services`, `professionals`, `locations`, `spaces`, `agendaSpaces` | filas de la puente |

Ambas cargas por tenant (`.eq('business_id', business.id)` + RLS, defensa en profundidad). **Riesgo a vigilar:** ampliar `initialServices` en `/equipo` sin romper el resto de la vista ni traer columnas de más.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | ninguno nuevo — se reusan `Card`, `Button`, `Badge`-idiom y primitivas ya instaladas en `@/components/ui` | not required |
| terceros | **ninguno** — `components.json → "registries": {}` verificado 2026-07-24 | not applicable |

Esta fase **no instala componentes nuevos** ni agrega dependencias. Si el planner o el executor necesitara `npx shadcn add`, es señal de desvío del contrato: parar y revisar.

---

## Trazabilidad decisión → contrato

| Decisión | Dónde se cumple en este spec |
|----------|------------------------------|
| D-01 comodín por persona | Estado "Hace todo" · regla de cobertura del Bloque B |
| D-02 desmarcar el último guarda igual | Toast `info`, sin bloqueo, sin diálogo |
| D-03 servicio nuevo sin auto-asignar | Un servicio recién creado aparece con badge "Sin cobertura" (si aplica el gate) |
| D-04 no restringe el panel | Ningún formulario del motor aparece en el alcance |
| D-05 editor en `/equipo`, cobertura en `/servicios` | Bloques A y B, mismo componente vía prop `view` |
| D-06 chips inline optimistas | Contrato exacto del chip + estados + rollback + toast |
| D-07 oculto con < 2 profesionales activos | Gate 2 de los dos bloques |
| D-08 quiénes lo ofrecen + advertencia | Línea "Lo hacen:" + badge/línea warning |
| D-10 aviso en los dos lados | Toast en `/equipo` + badge persistente en `/servicios` |
| D-12 la regla vive en el helper | "el componente la consume, no la reimplementa" |
| D-16 la cobertura cuenta solo activos | Lista de profesionales del Bloque A + cálculo del Bloque B |
| D-17 borrado sin confirmación extra | Sección "Acciones destructivas: ninguna" |
| D-18 oculto en canchas + terminología | Gate 1 de los dos bloques + reglas de `term` y de género |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
