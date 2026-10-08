---
phase: "2"
slug: "la-barra-inferior-y-m-s"
workstream: "panel-nav"
milestone: "v0.31 — La navegación mobile del panel"
status: draft
shadcn_initialized: true
preset: "b2fA (style base-nova · baseColor neutral · iconLibrary lucide)"
created: "2026-10-08"
requirements: ["MOB-01", "MOB-02", "MOB-03", "MOB-07", "MOB-05 (sólo la superficie; se implementa en Phase 3)"]
---

# Phase 2 — Contrato de diseño: la barra inferior y Más

> Contrato visual y de interacción de la navegación mobile del panel. Lo consumen
> `gsd-ui-checker`, `gsd-planner` y `gsd-executor`. **Todo número de este documento está medido**
> (sonda en iframe a 375px con la Space Grotesk real del build, y contraste calculado sobre los
> hex de `app/globals.css` + `app/themes.css`). Donde dice "medido" hay un número, no un adjetivo.

**Qué cierra este contrato:** las seis decisiones que el ROADMAP le encargó a la Phase 2
—(1) inventario y jerarquía de Más, (2) el header superior, (3) iconos y labels a 375px,
(4) estados, (5) zona segura y teclado, (6) la forma de Más— **más** la superficie de MOB-05
(el aviso de salida), que se implementa en la Phase 3 pero se diseña acá para que haya un solo
pase de diseño.

---

## §0 Decisiones ya tomadas por el dueño (NO se reabren)

| # | Decisión | Consecuencia que este contrato asume |
|---|---|---|
| **O-1** | **Más es una PANTALLA COMPLETA, ruta de verdad** (`/mas`), no un panel deslizante. Referencia: app de MercadoPago. **La barra sigue visible estando en Más.** | Cierra el riesgo (a) del ROADMAP y la decisión (6): Más es una entrada de historial **gratis**, la Phase 3 trabaja sobre **rutas** (donde `panelNavMode` ya vive) y no sobre `overlay-history`. Queda descartado el molde `useState` del drawer de hoy (**T-7/M-6**). |
| **O-2** | **El header de arriba SE QUEDA**, sin el botón ☰, mostrando el **nombre del negocio** y el **título de la sección**. Es donde irían acciones de pantalla. | Cierra la decisión (2). El header NO pierde su razón de ser: pasa de "portador del ☰" a portador de identidad + orientación persistente (el `h1` de cada pantalla scrollea; el header no). |
| **O-3** | **La guarda al salir desde Inicio es un AVISO EFÍMERO estilo Android**: el primer atrás no sale y avisa; el segundo sale. **Sin modal, sin botones.** | Cierra la superficie de MOB-05. ⚠ El `<Toaster>` del proyecto es **`top-center` en mobile** (`app/layout.tsx:81`, M-7) ⇒ el aviso aparecería **lejos del pulgar**. Resuelto en **§13**: el aviso **no es un toast de sonner**. |

---

## §1 Design System

| Property | Value |
|----------|-------|
| Tool | **shadcn** (`components.json` presente) |
| Preset | `b2fA` · style `base-nova` · baseColor `neutral` · `cssVariables: true` · `rsc: true` |
| Component library | `@base-ui/react` 1.5.0 (primitivas sin estilo) |
| Icon library | **`lucide-react` 1.17.0** — declarada en `components.json:13`. **Cero iconos nuevos de otro sistema.** |
| Styling | **Tailwind v4 CSS-first** vía `@tailwindcss/postcss`. **NO existe `tailwind.config`** (`components.json:7` → `"config": ""`): todo token nuevo se declara como custom property en `app/globals.css`. |
| Font | ⚠ **`--font-sans` NO es fijo: lo elige el negocio.** `business.font` ∈ `auto \| geometrica \| bauhaus \| elegante \| tech \| suave` (`lib/types.ts:11-15`) y el tema también lo redefine ⇒ **`--font-sans` puede resolver a 5 familias distintas**: **Space Grotesk** (`bauhaus`, y el default `forjo`), **Plus Jakarta Sans** (`geometrica`, tema `modern`), **Mulish** (`elegante`, tema `spa`), **Chakra Petch** (`tech`, tema `cyber`), **Manrope** (`suave`). Declaraciones: `app/globals.css:74` · `app/themes.css:17,88,156` (por tema) y `:244-248` (por `data-font`). `--font-heading` → Archivo/Jakarta/Cormorant/Orbitron/Sora · `--font-mono` → `--font-geist-mono` (fijo). **Los 5 se miden en §7.** |
| Ejes que la superficie tiene que soportar | **tema** (`forjo \| modern \| spa \| cyber`) × **modo** (claro/oscuro) × **paleta** (5 por tema) ⇒ **40 combinaciones**, más el eje **fuente** (5 familias), y los tres son **por negocio**: `PaletteScript palette theme font` en `app/(dashboard)/layout.tsx:49`. ⇒ **las 40 combinaciones de color se calculan en §5; las 5 familias se miden en §7.** |

---

## §2 Component Inventory

Enumerated by `ls components/ui/*.tsx | grep -v '\.test\.'` — 18 components — shadcn@4.10.0 (style `base-nova`, preset `b2fA`) — 2026-10-08.

Lista **no exhaustiva** de componentes conocidos-buenos, no un allowlist cerrado: si hace falta uno
que no está, se agrega con `npx shadcn add` desde el registry oficial (ver §17).

| Component | Import path | Cuándo se usa en esta fase |
|-----------|-------------|----------------------------|
| `Button` | `@/components/ui/button` | Slot de acciones del header (§12). **NO** para los ítems de la barra: son `<Link>`, no botones. |
| `Separator` | `@/components/ui/separator` | Opcional entre grupos de Más; por defecto la separación es espaciado, no línea (§11). |
| `Avatar` | `@/components/ui/avatar` | **NO se usa.** El bloque de identidad de Más reusa **verbatim** el markup del sidebar (`<img>` + fallback con inicial), para que logo y fallback se vean idénticos en las dos superficies. |
| `Sonner` (`Toaster`) | `@/components/ui/sonner` | Sólo para el error de logout (§14). **NO** para el aviso de salida (§13). |
| `Drawer` / `Dialog` | `@/components/ui/drawer`, `.../dialog` | **NO se usan.** O-1 descarta el panel deslizante y O-3 descarta el modal. Se listan para que quede escrito que fueron descartados. |
| `Card`, `Badge`, `Input`, `Label`, `Select`, `Table`, `Tabs`, `Textarea`, `Calendar`, `TimeField`, `PasswordInput`, `ShellScope` | `@/components/ui/*` | Fuera de alcance de esta fase. |

---

## §3 Spacing Scale

Múltiplos de 4, y la escala del proyecto (`.claude/CLAUDE.md`: 4, 8, 12, 16, 24, 32, 48, 64).

| Token | Valor | Uso en esta fase |
|-------|-------|------------------|
| xs | **4px** | Gap icono↔label en la barra · alto del indicador activo · padding horizontal del ítem |
| sm | **8px** | Separación aviso↔barra · padding vertical del aviso · gap entre filas de Más |
| md | **12px** | Gap icono↔label en las filas de Más · padding horizontal de la fila de Más |
| lg | **16px** | Padding horizontal del header y del aviso · el `p-4 sm:p-6 lg:p-8` que ya tiene el `<div>` interno de `app/(dashboard)/layout.tsx:63` (⚠ **no** está en el `<main>` de la `:57`, que sólo lleva el `pt-14`) |
| xl | **24px** | Ancho del indicador activo · tamaño del icono de la barra · separación entre grupos de Más |
| 2xl | **56px** (`h-14`) | **Alto de la barra** y alto del header. Mismo valor que el header de hoy (`sidebar.tsx:253`), a propósito: una sola altura de chrome. |

**Excepciones declaradas (dos, y las dos son legítimas):**

1. **`env(safe-area-inset-bottom)`** — lo provee el dispositivo (0px en Android con barra de botones, ~34px en iPhone X+ en Safari portrait). No está en la escala **por naturaleza**: es una medida física del hardware, no una decisión de diseño. Nunca se cablea un número en su lugar.
2. **Alto del label**: `11px × line-height 1.1 = 12.1px`. Es una altura **calculada por el texto**, no un token de espaciado.

**No hay ninguna otra.** El indicador activo mide **4×24px** (y no 3×24 como suele dibujarse) justamente para no salirse de la escala.

---

## §4 Typography

Tres tamaños (**11 / 14 / 16**) y **tres pesos: 400 / 500 / 600**.

⚠ **Son tres, no dos, y se declara explícito** porque el proyecto pide una escala contenida: **500 y
600 son los dos pesos de decisión** de este contrato (inactivo / activo, cuerpo / título); el **400
no es una elección nueva** — aparece en dos lugares y los dos son **reuso verbatim** del sidebar que
Más reemplaza: el eyebrow mono de grupo (`sidebar.tsx:136`, sin clase de peso ⇒ 400) y la línea de
plan del bloque de identidad (`sidebar.tsx:122`, `text-xs text-muted-foreground` ⇒ 400). Pasarlos a
500 los haría **distintos del sidebar**, que muestra el mismo inventario en desktop: entre "tres
pesos" y "Más y el sidebar no se parecen", este contrato elige lo primero. **Declarado como
excepción en §19 C-8.**

| Rol | Size | Weight | Line height | Dónde |
|-----|------|--------|-------------|-------|
| Label de barra — inactivo | **11px** | **500** | 1.1 | Los 4 destinos no activos + "Más" |
| Label de barra — activo | **11px** | **600** | 1.1 | El destino actual (canal no-cromático del estado activo, §8) |
| Título de sección (header) | **11px** | **500** | 1.2 | Línea 2 del header, subordinada al nombre del negocio — ver §12 para el porqué de esa jerarquía |
| Eyebrow de grupo (Más) | **11px** | **400** | 1.2 | `AGENDA` · `GESTIÓN` · `REPORTES` · `AJUSTES` · `CUENTA` — **mono**, `tracking-wider`, `uppercase`, `--muted-foreground`. Copiado tal cual de `sidebar.tsx:136`. |
| Cuerpo de fila / aviso | **14px** | **500** | 1.4 | Filas de Más · aviso efímero de salida · plan en el bloque de identidad (peso 400 ahí) |
| Nombre del negocio | **16px** | **600** | 1.2 | Header superior (línea 1) y bloque de identidad de Más |

### Familias — el criterio de conteo, declarado una sola vez

**Este documento cuenta las familias A NIVEL PANTALLA**, incluyendo `--font-heading` y
`--font-mono`, porque es como las ve el usuario: dos familias no se vuelven una porque las declaren
componentes distintos. Ése es el único criterio que se usa acá, en §7 y en §19 C-8.

Con ese criterio:

| | Familias que renderiza una pantalla del panel | Cuántas |
|---|---|---|
| **Hoy, sin esta fase** | `--font-heading` (los `h1`) + `--font-sans` (contenido y header) + `--font-mono` (eyebrows de grupo del sidebar, `sidebar.tsx:136`) | **3** |
| **Con esta fase** | las mismas tres | **3 — cero nuevas** |
| **Si se clavara la familia del label** | las tres **+ una segunda sans** | **4** |

⚠ **La tercera familia (`--font-mono`) excede el "máximo 2" del proyecto, y es estado preexistente
del repo**, no una decisión de este contrato: el eyebrow mono ya existe en el sidebar y Más lo
**reusa verbatim** para no verse distinto de la superficie que reemplaza (§19 C-8). **Lo que esta
fase garantiza es lo único que puede garantizar: no agrega ninguna.**

⚠ **`--font-sans` NO es Space Grotesk.** Lo elige el negocio y resuelve a **5 familias** distintas
(§1, medidas en §7). La barra y Más **heredan** `--font-sans`, sin declarar familia.
`--font-heading` **no se usa en esta superficie**: los `h1` de las pantallas la usan y el chrome de
navegación no debe competir con ellos (§12).

### ⚠ Excepción declarada a la regla "nunca font-size < 16px en mobile"

`.claude/CLAUDE.md` dice *"Nunca usar font-size menor a 16px para texto de **cuerpo** en mobile"*.
Los labels de 11px **no son texto de cuerpo**: son etiquetas de chrome de navegación, de una sola
palabra, con el icono de 24px como portador primario del significado, y con el área táctil completa
(75×56) intacta. Es el tamaño del tab bar de iOS (10pt) y de Material (12sp). **Precedente en el
repo:** `sidebar.tsx:136` ya usa `text-[11px]` para los headers de grupo. El aviso efímero usa 14px
por la misma razón (Snackbar de Android = 14sp) y porque es texto transitorio, no contenido.
**Ningún texto legible de contenido baja de 16px en esta fase.**

---

## §5 Color

### Reparto 60/30/10

| Rol | Token | Valor (forjo claro / oscuro) | Uso |
|-----|-------|------------------------------|-----|
| **Dominante (60%)** | `--background` | `#f3ead8` / `#1a1714` | Superficie de todas las pantallas, incluida la de Más |
| **Secundario (30%)** | `--card` | `#fbf3e3` / `#252019` | **Superficie de la barra** y del header. Es la misma del header de hoy (`bg-card`, `sidebar.tsx:253`) ⇒ cero cambio de tono en mobile. Más `--secondary` para el hover de filas. |
| **Acento (10%)** | `--primary` | `#d94a2b` (paleta red) | **Reservado a dos cosas y nada más** (ver abajo) |
| Peligro | `--destructive` | `#b23a26` / `#e05c43` | **No se usa en esta fase.** "Cerrar sesión" NO se pinta de rojo (§11). |

**El acento (`--primary`) queda reservado, en esta superficie, exclusivamente para:**

1. El **fallback de inicial** del bloque de identidad de Más (`bg-primary text-primary-foreground`), reusado verbatim de `sidebar.tsx:116`.
2. Nada más.

### ⚠ El indicador del destino activo NO se pinta con `--primary` — y está medido

La elección obvia era pintar el indicador activo con el acento de marca. **No se puede**, y el
motivo es un número: `--primary` **no llega a 3:1 contra `--card`** (mínimo WCAG 1.4.11 para
elementos de UI no textuales que comunican estado) en **8 de las 40** combinaciones que el panel
puede renderizar.

**El espacio real son 40 combinaciones**, enumeradas y calculadas una por una: **4 temas × 2 modos ×
5 paletas**. Las paletas son `forjo:{red,blue,yellow,green,ink}` (`globals.css:177-192`),
`modern:{indigo,emerald,violet,rose,amber}`, `spa:{sage,mauve,clay,ocean,lavender}` y
`cyber:{cyan,magenta,lime,purple,amber}` (`themes.css:210-238`). `cyber` declara los dos selectores
(`[data-theme]` y `.dark[data-theme]`) pero **los dos son oscuros** y comparten `--primary`; sólo
cambia `--card` (`#0e0b1c` → `#0b0818`), así que sus 10 combinaciones se calculan igual que las
otras 30.

**Los 8 fallos, y son los únicos de los 40:**

| Combinación | `--primary` vs `--card` | |
|---|---|---|
| modern claro / amber | **2.15:1** | ✗ |
| modern claro / emerald | **2.54:1** | ✗ |
| forjo claro / yellow | **2.55:1** | ✗ |
| spa claro / clay | **2.81:1** | ✗ |
| spa claro / lavender | **2.82:1** | ✗ |
| spa claro / sage | **2.85:1** | ✗ |
| spa claro / mauve | **2.85:1** | ✗ |
| spa claro / ocean | **2.98:1** | ✗ |

**Las 32 que pasan**, por si hace falta auditarlas: modern claro/rose 3.67 · forjo claro/red 3.83 ·
forjo claro/green 3.88 · modern claro/indigo 4.21 · modern claro/violet 4.23 · forjo oscuro/red 4.64 ·
modern oscuro/indigo 4.81 · forjo oscuro/blue 5.10 · modern oscuro/violet 5.23 · cyber claro/magenta
5.49 · modern oscuro/rose 5.51 · cyber oscuro/magenta 5.60 · forjo claro/blue 5.80 · cyber
claro/purple 5.94 · cyber oscuro/purple 6.06 · forjo oscuro/green 6.08 · spa oscuro/ocean 6.56 · spa
oscuro/clay 6.60 · spa oscuro/mauve 6.62 · spa oscuro/lavender 6.67 · spa oscuro/sage 6.91 · modern
oscuro/emerald 8.10 · forjo oscuro/yellow 8.50 · modern oscuro/amber 9.27 · cyber claro/cyan 12.60 ·
cyber oscuro/cyan 12.85 · cyber claro/amber 13.42 · forjo oscuro/ink 13.52 · cyber oscuro/amber
13.69 · cyber claro/lime 14.77 · cyber oscuro/lime 15.06 · forjo claro/ink 16.18.

⇒ **El indicador se pinta con `--foreground`**, que mide **≥8.94:1 en las 40** combinaciones
(mínimo: spa claro, `#4c443d` sobre `#fbf7f2` = 8.94:1; spa oscuro 11.55:1; forjo oscuro 13.52:1;
modern claro 15.53:1; forjo claro 16.18:1; cyber 17.32:1). La marca ya está presente en el panel
(pill activo del sidebar, botones, banners); **la barra cambia acento por legibilidad, por
medición.**

### ⚠ El label inactivo necesita un token propio — y está medido en los dos fondos

`--muted-foreground` es la convención del repo para lo inactivo, pero falla AA **en dos lugares**.
Hay que medirlo contra **los dos fondos** de esta superficie, no contra uno: el label de la barra se
lee sobre `--card` (la barra) y el eyebrow de grupo de Más se lee sobre `--background` (la página).

| Tema / modo | vs `--card` (label de barra) | vs `--background` (eyebrow de Más) |
|---|---|---|
| **spa claro** (`#90847a`) | **3.41:1** ✗ | **3.02:1** ✗ |
| **modern claro** (`#69748c`) | 4.69:1 ✓ | **4.15:1** ✗ |
| forjo claro (`#6b6253`) | 5.44:1 ✓ | 5.02:1 ✓ |
| modern oscuro (`#8b96ac`) | 5.48:1 ✓ | 6.09:1 ✓ |
| spa oscuro (`#a99fa6`) | 5.72:1 ✓ | 6.35:1 ✓ |
| cyber claro (`#7d8bb5`) | 5.75:1 ✓ | 5.97:1 ✓ |
| cyber oscuro (`#7d8bb5`) | 5.87:1 ✓ | 6.10:1 ✓ |
| forjo oscuro (`#a99e8b`) | 6.12:1 ✓ | 6.76:1 ✓ |

⇒ **3 de los 8 pares fallan** (spa claro en los dos fondos, modern claro sólo en el eyebrow) ⇒
sobre las 40 combinaciones: **5 de 40** fallan el label de barra (las 5 paletas de spa claro) y
**10 de 40** fallan el eyebrow (spa claro + modern claro). ⇒ **Token nuevo, aditivo, con dos
overrides:**

```
/* app/globals.css — junto al bloque de :root / [data-theme='forjo'] */
--panel-nav-muted: var(--muted-foreground);   /* forjo: 5.44 / 5.02 ✓ (y es el default) */

/* app/themes.css — DOS overrides, sólo en los modos CLAROS que fallan */
[data-theme='spa']         { --panel-nav-muted: #6b6055; }   /* 5.74 sobre card · 5.08 sobre bg ✓ */
.dark[data-theme='spa']    { --panel-nav-muted: var(--muted-foreground); }   /* 5.72 / 6.35 ✓ */
[data-theme='modern']      { --panel-nav-muted: #5c6578; }   /* 5.85 sobre card · 5.17 sobre bg ✓ */
.dark[data-theme='modern'] { --panel-nav-muted: var(--muted-foreground); }   /* 5.48 / 6.09 ✓ */
```

**Los valores se eligieron con margen, no al filo.** `#736659` (spa) daba 4.62:1 sobre el fondo —
sólo 0.12 sobre AA— y `#626c82` (modern) 4.66:1. Los valores elegidos suben el peor caso de la
superficie a **5.02:1** y, lo más importante, ese peor caso pasa a ser **forjo claro con el token
original del repo**, que es el único tema **sin `color-mix`** ⇒ su número es **exacto, no
aproximado** (ver la nota de método abajo).

**Por qué es seguro tocar `globals.css`/`themes.css`, que son compartidos con el landing y el CRM:**
el token es **nuevo** y **nadie más lo lee** ⇒ cero cambio de render fuera de la barra y de Más.
Verificable: `grep -rn 'panel-nav-muted' app components lib` sólo debe dar hits en los dos archivos
de CSS y en los dos componentes nuevos. (Esto NO toca el `<head>` servido, así que el criterio 2 de
la fase —diff byte a byte del `<head>` de `/[slug]` y del landing— sigue valiendo.)

### Tabla final de contraste de la superficie

Las 40 combinaciones calculadas una por una; se publica el **peor caso de las 40** por elemento.

| Elemento | Par de tokens | Peor caso de las 40 | Dónde cae el peor caso | Mínimo exigido |
|---|---|---|---|---|
| Label/icono **activo** | `--foreground` sobre `--card` | **8.94:1** | spa claro | 4.5:1 (texto 11px) ✓ |
| Label/icono **inactivo** | `--panel-nav-muted` sobre `--card` | **5.44:1** | forjo claro | 4.5:1 ✓ |
| **Indicador** activo | `--foreground` sobre `--card` | **8.94:1** | spa claro | 3:1 (1.4.11) ✓ |
| **Anillo de foco** | `--foreground` sobre `--card` | **8.94:1** | spa claro | 3:1 (1.4.11) ✓ |
| **Aviso efímero** | `--background` sobre `--foreground` (invertido) | **7.91:1** | spa claro | 4.5:1 (14px) ✓ |
| Filas de Más | `--foreground` sobre `--background` | **7.91:1** | spa claro | 4.5:1 ✓ |
| Eyebrow de grupo | `--panel-nav-muted` sobre `--background` | **5.02:1** | **forjo claro** | 4.5:1 ✓ |

**Mínimo absoluto de la superficie: 5.02:1**, y cae en **forjo claro** — el tema **sin
`color-mix`**.

⚠ **Las dos últimas filas se leen sobre `--background`, no sobre `--card`** (las filas de Más viven
en la página, y el aviso es el par invertido), y ése es un fondo distinto con otro número: contra
`--background` el peor caso de `--foreground` es **7.91:1** (spa claro, `#4c443d` sobre `#efe9e2`),
no los 8.94:1 que da contra `--card`. Los otros siete fondos van de 12.84 a 18.36. Sin consecuencia
—7.91 ≫ 4.5— pero la tabla promete el peor caso **por elemento** y cada elemento tiene que citar
**su** fondo.

> **Método y su límite.** Las razones se calculan con los hex literales de `globals.css`/`themes.css`
> (fórmula WCAG 2.x de luminancia relativa). En `modern`/`spa`/`cyber` el `--card`/`--background`
> real es `color-mix(in oklab, <hex> 9x%, var(--tint))`, o sea el hex **teñido un 5-12% con el
> acento** ⇒ en esos tres temas los números son **aproximados** (el margen más chico entre ellos es
> el eyebrow de spa claro, **5.08:1**, con 0.58 de aire: un tinte del 9% no lo cruza).
> En **forjo** no hay `color-mix` ⇒ sus números son **exactos**, y ahí cae el peor caso de la
> superficie.
> ⇒ **Chequeo de UAT OBLIGATORIO (no opcional): barra y Más en `spa` claro con paleta `clay`**
> (el acento más oscuro de spa, el que más tiñe el fondo) **y en `modern` claro con paleta `amber`**
> (donde `--primary` mide 2.15:1 y donde se ve si el indicador en `--foreground` realmente se
> distingue). Está en §18.8 marcado como obligatorio.

### ⚠ El anillo de foco diverge del patrón del repo, y también por medición

El repo usa `focus-visible:ring-[3px] focus-visible:ring-ring/50` en todos lados. `--ring` **es**
`--primary` en todas las paletas (verificado: los 20 bloques de paleta declaran `--ring` con el mismo
hex que `--primary`), y al 50% de opacidad sobre `--card` baja de 2:1 en las 8 combinaciones de la
tabla de arriba — es decir, **en 8 de las 40 combinaciones el foco de la barra sería invisible**. La
barra y las filas de Más usan:

```
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground
```

`ring-inset` es obligatorio: sin él, el anillo del ítem más a la izquierda/derecha queda recortado
por el borde de la barra. **Esta divergencia está scopeada a los dos componentes nuevos** — ningún
otro `focus-visible` del repo se toca.

---

## §6 La barra inferior — anatomía y medidas

```
┌─────────────────────────────────────────────────────────────┐  ← border-t border-border
│  ▬▬▬▬                                                       │  ← indicador 4×24, --foreground
│  [icon]      [icon]      [icon]      [icon]      [icon]     │  ← lucide 24×24 (w-6 h-6)
│  Inicio      Turnos      Agenda    Clientes       Más       │  ← 11px/500 (600 si activo)
├─────────────────────────────────────────────────────────────┤  h-14 = 56px
│          env(safe-area-inset-bottom)  ·  bg-card            │  ← zona de gestos, PINTADA
└─────────────────────────────────────────────────────────────┘
   75px        75px        75px        75px        75px          (a 375px)
```

| Propiedad | Valor exacto |
|---|---|
| Visibilidad | `lg:hidden` — **nunca `md:hidden`** (M-5/T-5: entre 768 y 1023px hoy no hay sidebar, hay hamburguesa; con `md:hidden` esa banda quedaría sin ningún menú) |
| Posición | `fixed bottom-0 left-0 right-0` |
| Capa | **`z-30`** — exactamente la del header de hoy (`sidebar.tsx:253`). Overlays (`z-40`) y drawers (`z-50`) la tapan, y así tiene que ser: el atrás cierra el overlay antes de navegar (política vigente, intacta). |
| Superficie | `bg-card` + `border-t border-border` (una sola línea; **sin sombra** — la escala de sombras del proyecto es de 3 niveles y la barra no necesita elevación, el borde alcanza) |
| Alto del contenido | **56px**, declarado una sola vez como `--panel-nav-h: 3.5rem` en `:root` de `app/globals.css`. La barra usa `h-[var(--panel-nav-h)]`; `main` reserva con la misma var (§10). |
| Zona segura | `padding-bottom: env(safe-area-inset-bottom, 0px)` **dentro** del elemento fijo, debajo de la caja de 56px ⇒ el `bg-card` **pinta** la franja de gestos (el pedido literal del Goal: "dibujada por encima de la zona de gestos") |
| Zona segura horizontal | `padding-left: env(safe-area-inset-left, 0px)` · `padding-right: env(safe-area-inset-right, 0px)` — en landscape sobre iPhone con notch el inset lateral vale 44px y sin esto el primer y el último ítem quedarían debajo del notch |
| Ítem | `flex-1 min-w-0` · `flex flex-col items-center justify-center gap-1` · `px-1` · **sin padding vertical** (`justify-center` centra los 40px de contenido en los 56px) |
| Área táctil | **75 × 56 px** a 375px · **64 × 56 px** a 320px ⇒ ambas ≥ 44×44 ✓ |
| Icono | **24×24** (`w-6 h-6`), `stroke-width` por defecto de lucide, `flex-shrink-0` |
| Gap icono↔label | **4px** (`gap-1`) |
| Indicador activo | `absolute top-0 left-1/2 -translate-x-1/2` · **4px alto × 24px ancho** · `rounded-b-full` · `bg-foreground` |
| Tipografía del label | **Hereda `--font-sans`** — no declara familia. Es el eje `business.font` (5 familias) y está **medido** en §7: no se clava a propósito (clavarla pondría 3 familias en la misma pantalla). |
| Elemento | `<Link>` de `next/link`, **no** `<button>`: son destinos, y así heredan el `prefetch` y el `replace` que el sidebar ya usa |

### Los 5 destinos — iconos (todos ya importados por `sidebar.tsx`)

| Pos | Destino | `href` | Icono lucide | Label |
|---|---|---|---|---|
| 1 | Inicio | `/dashboard` | `LayoutDashboard` | `Inicio` (literal, ver §14) |
| 2 | Turnos | `/appointments` | `Calendar` | `t.appointments` → `Turnos` / **`Reservas`** (canchas) |
| 3 | Agenda | `/agenda` | `CalendarClock` | `Agenda` (literal) |
| 4 | Clientes | `/clients` | `Users` | `t.clients` → `Clientes` / **`Pacientes`** (salud) |
| 5 | Más | `/mas` | **`MoreHorizontal`** | `Más` (literal) |

**`MoreHorizontal` verificado presente en `lucide-react@1.17.0`** (`typeof === 'object'`). Es el
glifo estándar de "overflow" y el label "Más" lo desambigua. *Alternativa considerada y descartada:*
`LayoutGrid` ("todas las secciones") — se parece demasiado al `LayoutDashboard` de la posición 1, a
24px y a 11px de label los dos leerían como "cuadraditos".

**Ruta de Más: `/mas`, sin tilde.** Un `/más` viajaría percent-encoded (`/m%C3%A1s`) en el historial,
en `usePathname()` y en cualquier `grep`, y la Phase 3 tiene que comparar ese pathname contra un
literal. La tilde vive en el **label**, no en la URL.

### Consumo del historial — orden obligatorio (T-5), sin inventar nada

Los 5 `<Link>` consumen `panelNavMode` y `consumeOwnedPanelEntry` **exactamente** como los consume
hoy `sidebar.tsx:152,161-164`, en el **mismo orden**:

```
replace={panelNavMode({ from: pathname, to: href }) === 'replace'}
onNavigate={(e) => {
  if (requestNavigation(href)) { e.preventDefault(); return }   // 1º guard de cambios sin guardar
  if (active && consumeOwnedPanelEntry()) e.preventDefault()    // 2º NAV-08
}}
```

**Cero líneas** en `lib/panel-history.ts`, `lib/overlay-history.ts` y `lib/dirty-history.ts`
(criterio 6 de la fase). En esta fase el atrás sigue siendo de **un nivel**; los dos niveles son la
Phase 3.

---

## §7 Labels a 375px — la medición, en las 5 familias (T-8/M-2)

**Método:** sonda HTML montada en un `<iframe width="375">` (la memoria
`medicion-responsive-chrome-headless` avisa que Chrome headless **ignora** `--window-size` con
`--dump-dom`), con **las cinco familias reales del build** cargadas por `@font-face` desde los
`.woff2` del subset latino de `.next/static/media/`, `document.fonts.load()` por familia **y por
peso** antes de medir, y `getBoundingClientRect().width` sobre un `<span>`
`display:inline-block; white-space:nowrap`.

**Se miden los dos pesos**, no sólo uno: el label activo es **600** (§8) y en 4 de las 5 familias es
**más ancho** que el inactivo de 500 — medirlo sólo a 500 subestimaría el peor caso.

### Ancho del peor label (`Pacientes`) en las 5 familias

| `--font-sans` resuelve a | `business.font` / tema | 11px/500 | **11px/600** | 12px/500 |
|---|---|---|---|---|
| Space Grotesk | `bauhaus` · tema `forjo` (default) | 52.1px | 52.1px | 56.9px ✗ |
| **Plus Jakarta Sans** | `geometrica` · tema `modern` | 52.0px | **52.4px ← PEOR CASO ABSOLUTO** | 56.7px ✗ |
| Manrope | `suave` | 51.1px | 52.0px | 55.7px ✗ |
| Chakra Petch | `tech` · tema `cyber` | 50.2px | 51.0px | 54.8px ✗ |
| Mulish | `elegante` · tema `spa` | 49.5px | 49.9px | 54.0px ✗ |

### Detalle por label, en la familia del peor caso (Plus Jakarta, 11px/600)

| Label | Ancho | Rubros |
|---|---|---|
| `Más` | **21.6px** | todos |
| `Inicio` | **28.7px** | todos |
| `Turnos` | **35.1px** | salud, belleza, general |
| `Agenda` | **41.5px** | todos |
| `Clientes` | **43.9px** | belleza, general, canchas |
| `Reservas` | **47.8px** | canchas |
| **`Pacientes`** | **52.4px** | **salud ← el caso a mirar en la UAT** |

### El veredicto, con el margen (sobre el peor caso de las 5 familias y los 2 pesos)

| Ancho de pantalla | Ancho por ítem | Disponible para texto (`px-1` = 4px/lado) | Peor label del sistema | Margen |
|---|---|---|---|---|
| **375px** (piso del proyecto) | 75.0px | 67.0px | 52.4px | **+14.6px** (21.8%) ✓ |
| **320px** (iPhone SE 1ª gen) | 64.0px | 56.0px | 52.4px | **+3.6px** (6.4%) ✓ |

**⇒ A 11px los cinco labels entran en una sola línea, sin truncar, hasta 320px, en las 5 familias y
en los 2 pesos. No hace falta ninguna estrategia de degradación, y el criterio de §18.1 es
decidible.**

**Por qué 11px y no 12px:** medido, a 12px "Pacientes" mide entre **54.0px** (Mulish) y **56.9px**
(Space Grotesk), y a 320px el espacio disponible es **56.0px** ⇒ **desborda en 2 de las 5 familias**
(Space Grotesk por 0.9px, Jakarta por 0.7px). 12px alcanza a 375px pero rompe a 320px según qué
fuente eligió el negocio — exactamente el tipo de falla que sólo aparece en el teléfono de un
cliente. **11px es el tamaño más grande que no rompe en ningún ancho × ninguna familia.**

### ⚠ Por qué la familia del label NO se fija, aunque fijarla eliminaría la variable

La alternativa era clavar la familia del label de la barra (como el repo clava `--font-mono` en los
eyebrows) para que la medición no dependa de `business.font`. **Se descarta, y por dos razones:**

1. **No hace falta: está medido y las 5 entran**, con +3.6px de margen a 320px en el peor caso. Fijar la familia resolvería un riesgo que la medición ya cerró.
2. **Fijarla agregaría una familia, y la peor posible: una segunda sans.** Con el criterio de conteo de §4 (a nivel pantalla, incluyendo heading y mono), una pantalla del panel renderiza **3** familias hoy y seguiría renderizando **3** con esta fase. Clavar el label la llevaría a **4**: con un negocio en `font: 'elegante'` la misma pantalla mostraría Cormorant (`--font-heading`, los `h1`), Mulish (`--font-sans`, header y contenido), Geist Mono (los eyebrows de Más) **y** Space Grotesk (la barra) — es decir **dos sans distintas a 3px de distancia**, que es la duplicación más visible de todas. La barra hereda `--font-sans` **a propósito**: es chrome del panel, y el chrome del panel habla el idioma tipográfico que el negocio eligió.

⇒ **Contrato:** la barra y Más usan `--font-sans` (heredado, sin declarar familia), y el criterio de
no-truncado de §18.1 se chequea **con el eje fuente incluido**.

### ⚠ Corrección medida a T-8 y a M-2 del ROADMAP

Los dos documentos dicen que la palabra más larga del sistema es **"Reservas" (8 caracteres)**.
**Es falsa.** El peor caso es **"Pacientes"**: 9 caracteres, y es el peor en **las 5 familias** (de
49.5px a 52.4px), entre un **4%** (Jakarta) y un **10%** (Space Grotesk) más ancho que "Reservas".
No cambia la conclusión, pero sí el caso que hay que mirar en la UAT: el rubro crítico es **salud**,
no canchas. (El dato de T-8 probablemente salió de contar caracteres de la terminología de
`canchas`, que es la que más se aparta; `salud` cambia una palabra más corta de origen por una más
larga.)

**Backstop, aunque hoy nunca se dispare:** el label lleva `truncate` (`overflow-hidden`
`text-ellipsis` `whitespace-nowrap`). Es el seguro para el día en que un vertical nuevo introduzca
un término más largo que "Pacientes", **o en que se agregue una familia tipográfica nueva al
selector de fuente** (que es el eje más fácil de ampliar sin acordarse de este documento).
**Criterio verificable:** a 375px y a 320px, ninguno de los 5 labels muestra `…` en ninguno de los
**4 rubros × 5 fuentes** (§18.1). Y lo que **no** se hace, por decisión:

- **Dos líneas:** rompe el alto de 56px y desalinea los 5 ítems entre sí (unos con 1 línea, otros con 2).
- **Sólo icono, sin label:** 12 destinos y 4 terminologías distintas; un icono pelado no distingue `Calendar` de `CalendarClock` para un dueño de peluquería.
- **Bajar a 10px:** innecesario (hay **+3.6px** de margen a 320px sobre el peor caso de las 5 familias) y empeora la legibilidad sin ganancia.

---

## §8 Estados

Obligatorios los cinco del proyecto. **El estado activo se comunica por 4 canales, 3 de ellos
no-cromáticos** — la regla "que no dependa sólo del color" está cumplida con redundancia.

| Estado | Barra | Más (filas) |
|---|---|---|
| **default / inactivo** | icono + label en `--panel-nav-muted` · label weight **500** · sin indicador | icono + label en `--foreground` · fondo transparente |
| **activo** | (1) **indicador 4×24 en `--foreground`** arriba del ítem · (2) icono + label en **`--foreground`** · (3) label weight **600** · (4) **`aria-current="page"`** | **No existe.** Una fila de Más nunca es la ruta actual (estás en `/mas`). El activo de `/mas` lo muestra la **barra**. |
| **hover** | `hover:bg-secondary` **sólo** `@media (hover: hover)` — en touch no hay hover y un `:hover` pegajoso dejaría el ítem resaltado después del toque | `hover:bg-secondary` con la misma condición |
| **toque / active** | `active:bg-secondary` — **feedback táctil inmediato, no opcional**: la navegación entre rutas del panel tarda, y sin esto el dueño toca dos veces. Además `-webkit-tap-highlight-color: transparent` para que el highlight azul del navegador no compita con el nuestro. | ídem |
| **focus visible** | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground` (§5: el `ring-ring/50` del repo es invisible en 8 de las 40 combinaciones) | ídem, sin `ring-inset` (las filas no tocan el borde) |
| **disabled** | **No aplica, y está medido**: los 4 destinos fijos existen en los **4 verticales** (`lib/verticals.ts:58,80,101,122` — M-1), y un negocio suspendido ni entra al panel (`(dashboard)/layout.tsx` redirige a `/suspendido`). ⇒ ningún ítem de la barra puede estar deshabilitado. | **No aplica**: Más sólo renderiza filas que el vertical expone. |
| **loading** | **Sin spinner, por decisión.** El activo sigue a `usePathname()`, que se actualiza cuando la navegación **commitea** ⇒ hay un lapso entre el toque y el cambio de activo. Lo cubre el `active:bg-secondary`. Es **exactamente** el comportamiento del sidebar de hoy; meter un spinner en el chrome sería introducir un patrón que el panel no tiene. | ídem |

**Transiciones:** `transition-colors duration-150 ease-out` (≤300ms, y sólo `color`/
`background-color` — nada que dispare layout). El indicador **no se anima entre ítems** (eso exigiría
un layout animation compartido; aparece y desaparece con el cambio de ruta).

---

## §9 Zona segura, viewport y teclado

### El `viewport` (T-2/T-9/H-1/H-2) — capacidad nueva en el repo

`app/(dashboard)/layout.tsx` exporta:

```ts
export const viewport: Viewport = {
  viewportFit: 'cover',
  interactiveWidget: 'resizes-visual',
}
```

**Verificado contra lo instalado**, no de memoria: `ViewportLayout` en
`node_modules/next/dist/lib/metadata/types/extra-types.d.ts:45-53` acepta
`viewportFit?: 'auto' | 'cover' | 'contain'` e `interactiveWidget?: 'resizes-visual' |
'resizes-content' | 'overlays-content'`, aunque `generate-viewport.md` no documente el primero.

**Por qué en `(dashboard)/layout.tsx` y no en el root:** `app/layout.tsx` **no exporta `viewport` ni
`generateViewport`** (medido: cero coincidencias) y el merge de viewport es de la raíz a la hoja y
**superficial** ⇒ declararlo en el route group `(dashboard)` deja el landing, `/[slug]` y el CRM
**sin enterarse**. Es lo que acota el radio del cambio. Requisito cumplido: el export tiene que
vivir en un Server Component y `DashboardLayout` es `async function`.

**Sin `viewport-fit=cover`, `env(safe-area-inset-bottom)` vale 0 y MOB-02 no se cumple aunque el CSS
esté perfecto.** Es el orden de causalidad que hay que respetar: primero el viewport, después el CSS.

### El teclado — decidido, no descubierto

**Decisión: `interactiveWidget: 'resizes-visual'`.** El argumento es el único que importa en este
repo: **`resizes-visual` es el valor por defecto de Chrome y por lo tanto es el comportamiento que
hoy está en producción.** Declararlo explícitamente **no cambia nada** del teclado — y eso es
exactamente lo que se busca, porque este repo pagó **cuatro quicks en octubre** sobre teclado y
drawers (`261005-pbj`, `261005-x91`, `261005-vuy`, `261006-fln`) y uno de ellos (`261005-x91`)
consistió en **apagar** el manejo de teclado de vaul. Declarar `resizes-content` **reflowearía el
panel entero cada vez que se abre el teclado** — la clase exacta de bug que esos cuatro quicks
arreglaron.

**Qué pasa, concretamente, con la barra y el teclado abierto:** con `resizes-visual` el viewport de
**layout** no cambia, así que un `position: fixed; bottom: 0` sigue anclado al fondo del layout ⇒ la
barra queda **detrás del teclado, fuera de vista**. Eso es lo correcto y es lo deseado: **mientras
se escribe no se navega**, el campo no queda tapado, y el botón de submit del formulario no compite
con la barra. Lo escribimos como contrato observable, no como suposición:

> **Contrato del teclado:** con el teclado abierto en cualquier formulario del panel, la barra
> inferior **no es visible** y **no se superpone** al campo enfocado ni al botón de submit. Al
> cerrarse el teclado la barra vuelve, en su lugar, sin reflow del contenido.

**Cómo se prueba** (está en §20, pero se declara acá porque es la perilla): celular real, formulario
largo de Finanzas y el drawer de alta de turno, enfocar el último campo, confirmar los tres hechos
del párrafo anterior; repetir en Android Chrome **y** en iOS Safari (el inset de iOS es el que vale
~34px; el de Android suele ser 0).

### Zona segura horizontal — una consecuencia aceptada y escrita

`viewport-fit=cover` también hace que el contenido entre bajo el notch **en landscape**
(`safe-area-inset-left/right` = 44px). Este contrato pone los insets laterales en los **dos
elementos fijos** (barra y header, §6/§12). **No** los pone en el `main`: eso cambiaría el padding
horizontal de las 12 pantallas y el ROADMAP es explícito —*"lo único que se puede mover de una
pantalla es el padding que reserva el alto de la barra"*. ⇒ **Consecuencia aceptada:** en un iPhone
con notch, en **landscape**, el contenido de una pantalla puede quedar a ras del notch. Motivo de la
aceptación: el panel se usa en portrait, el contenido ya tiene `p-4` (16px), y arreglarlo bien es
tocar las 12 pantallas. **Queda anotado como deuda, no como descubrimiento.**

---

## §10 Cómo convive la barra con el contenido (MOB-02)

**El alto se reserva en UN SOLO lugar** — el `<main>` de **`app/(dashboard)/layout.tsx:57`**
(`className="lg:pl-60 pt-14 lg:pt-0 min-h-screen"`), el mismo que hoy reserva el header con
`pt-14 lg:pt-0` (M-9). ⚠ **No** es la `:56`, y **no** es el `<div className="p-4 sm:p-6 lg:p-8">` de
la `:63`: la reserva va en el `<main>`, junto al `pt-14`, para que el padding de contenido de las
pantallas quede intacto:

```
pt-14 lg:pt-0
pb-[calc(var(--panel-nav-h)+env(safe-area-inset-bottom,0px))] lg:pb-0
```

| Hecho | Valor |
|---|---|
| `--panel-nav-h` | `3.5rem` (56px), declarado en `:root` de `app/globals.css`. **Si el alto de la barra cambia, cambia en un solo lugar y la reserva lo sigue sola.** |
| `lg:pb-0` | Obligatorio, simétrico al `lg:pt-0` de hoy: en desktop no hay barra y no se reserva nada (D-02/MOB-07) |
| Por qué en `main` y no en cada pantalla | Es la única forma de que el criterio sea verificable de una sola vez, y es el patrón que el header ya estableció |
| Lo que **no** se hace | Nada de `100dvh`/`100svh` nuevo ni tocar el `min-h-screen` existente: el `min-h-screen` de hoy sigue tal cual, y el `pb` es aditivo |

**Criterios observables:**

1. A 375px, el último elemento de la pantalla más larga del panel (Finanzas y los formularios de Negocio/Configuración) sigue **alcanzable con scroll** y **no queda debajo de la barra**.
2. Los botones de alta de Finanzas ("Nueva venta" / "Nuevo egreso") y el footer de los formularios largos quedan **completamente visibles** con la barra presente.
3. En la pantalla **Más**, el último ítem (la firma "hecho con Forjo Studio") es alcanzable con scroll y no queda debajo de la barra — Más vive dentro del mismo `main`, así que el `pb` la cubre **por construcción**, sin una segunda regla.
4. Con `env(safe-area-inset-bottom) == 0` (Android con barra de botones) el layout es el mismo menos los ~34px: no hay hueco vacío ni doble reserva.

**Lo que la barra NO hace:** no se oculta al scrollear (nada de "hide on scroll down"). Motivo: con
12 secciones la barra **es** el mapa, y esconderla a mitad de un formulario largo deja al dueño sin
salida justo donde más la necesita. Es una decisión, no un olvido.

---

## §11 La pantalla Más — inventario y jerarquía (MOB-03 / T-6 / M-3 / M-4)

**Forma: ruta `/mas`, pantalla completa, con la barra visible y el ítem "Más" activo** (O-1).
Vive dentro del `main` del dashboard ⇒ hereda el header, el `p-4` y la reserva de alto.

### Inventario completo, en orden de arriba a abajo

```
┌─ header superior (§12) ──────────────────────────┐
│  Barbería Nómade                                 │
│  Más                                             │
└──────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────┐
  │ [logo 40] Barbería Nómade                    │   ← bloque de identidad (bg-card, border)
  │           Plan Pro                           │
  └──────────────────────────────────────────────┘

  AGENDA                                             ← eyebrow mono 11px/400
   ↻  Abonos
  GESTIÓN
   ⌗  Servicios            (t.services)
   ⚙  Equipo               (ausente en canchas)
   ⚲  Locales              (t.locations)
   ⌂  Negocio
   ⊕  Mi web
  REPORTES
   ▦  Finanzas
  AJUSTES
   ⚙  Configuración
  CUENTA                                             ← grupo NUEVO (T-6)
   ?  Ayuda
   ↗  Ver mi página                            ↗     ← pestaña nueva, ExternalLink a la derecha
   ⎋  Cerrar sesión
  ─────────────────────────────────────────────
   [F]  hecho con Forjo Studio                       ← firma, reusada verbatim
```

### El reparto, verificado contra los 4 verticales

| Rubro | Filas de menú en Más | Detalle |
|---|---|---|
| salud | **8** | Abonos · Prestaciones · Equipo · Consultorios · Negocio · Mi web · Finanzas · Configuración |
| belleza | **8** | Abonos · Servicios · Equipo · Locales · Negocio · Mi web · Finanzas · Configuración |
| general | **8** | Abonos · Servicios · Equipo · Sucursales · Negocio · Mi web · Finanzas · Configuración |
| **canchas** | **7** | Abonos · Canchas · **(sin Equipo)** · Sedes · Negocio · Mi web · Finanzas · Configuración |

**+ 3 filas de `CUENTA` en todos los rubros** ⇒ **11 filas** (10 en canchas).
**Criterio duro:** `Más` + la barra reproducen **exactamente** el inventario que hoy muestra el
drawer, **rubro por rubro, los 4**.

### Reglas de construcción (no negociables)

1. **Más NO reimplementa el filtro.** Deriva de `buildNavGroups(business)` —la misma función del
   sidebar— y le resta las 4 keys de la barra (`dashboard`, `appointments`, `agenda`,
   `clients`/`patients`). Si Más reimplementara el filtro contra `resolveVertical(business).menu`,
   un negocio de **canchas** podría ver "Equipo", que es una ruta que no le corresponde. No es una
   fuga cross-tenant, es coherencia de producto — y se preserva **por construcción** o no se
   preserva.
2. **El grupo `PANEL` desaparece entero** (su único item, `dashboard`, está en la barra). Lo cubre
   el `.filter(g => g.items.length > 0)` que `buildNavGroups` **ya tiene** (`sidebar.tsx:85`) ⇒
   **ningún grupo vacío renderiza su header**, sin escribir una línea nueva.
3. **Los eyebrows de grupo son los de hoy, verbatim:** `sidebar.tsx:136`
   (`font-mono`, `text-[11px]`, `tracking-wider`, `uppercase`, `--muted-foreground`). `CUENTA` es el
   único header nuevo y usa el mismo estilo.
4. **Los iconos son los del sidebar, uno a uno:** `Repeat`, `Tag`, `UserCog`, `MapPin`, `Store`,
   `Globe`, `BarChart3`, `Settings`, `HelpCircle`, `ExternalLink`, `LogOut`. **Cero iconos nuevos.**

### Semántica y jerarquía de headings — cero píxeles, y todo reuso del repo

`/mas` es **la única pantalla nueva de la fase**, y las otras 12 ya traen su `h1` (medido:
`appointments-client.tsx:273`, `finances-client.tsx:607`). Sin esto, `/mas` nacería **sin `h1`**,
contra la regla del proyecto (*"cada página: 1 h1 único"* / *"jerarquía de headings correcta"*).

| Elemento | Markup | Por qué así |
|---|---|---|
| Título de la pantalla | **`<h1 className="sr-only">Más</h1>`** | Es el `h1` único de `/mas`. Va **oculto visualmente** porque el header superior **ya la nombra en pantalla** (`§12`), y un `h1` visible sería el mismo texto dos veces a 56px de distancia — exactamente el choque que `§19 C-5` resuelve. **Patrón ya establecido en el repo, no inventado acá:** el CRM usa literalmente `<h1 className="sr-only">` por este mismo motivo en 5 pantallas (`admin/page.tsx:78`, `pipeline-client.tsx:214`, `negocios-client.tsx:218`, `bandeja-client.tsx:194`, `planes-client.tsx:27`). |
| Lista de secciones | **`<nav aria-label="Secciones">`** envolviendo los grupos de menú | Espeja `sidebar.tsx:131` (`<nav aria-label="Navegación">`). El nombre es **distinto** del de la barra a propósito: dos landmarks `navigation` en la misma pantalla **tienen** que distinguirse por nombre, o el lector de pantalla anuncia "navegación" dos veces y no se sabe cuál es cuál. |
| Grupo (`AGENDA`, `GESTIÓN`, `REPORTES`, `AJUSTES`, `CUENTA`) | **`<div role="group" aria-labelledby="mas-grupo-{slug}">`**, con el eyebrow llevando ese `id` | El eyebrow **sigue siendo `<p>`, verbatim de `sidebar.tsx:136`** (no se convierte en `h2`): así Más y el sidebar se ven y se leen igual, y la agrupación se expresa por `aria-labelledby` en vez de por nivel de heading. **`role="group"` y no `<section>`**: `<section>` con nombre accesible se vuelve **landmark**, y 5 landmarks nuevos en una pantalla son ruido para quien navega por landmarks; `role="group"` es justamente "conjunto de objetos que no va en el resumen de la página". **Precedente en el repo:** `role="group"` con nombre accesible ya se usa en `settings-client.tsx:382,3494`, `reportes-client.tsx:316` y `theme-controls.tsx:236`. |
| `id`s | `mas-grupo-agenda` · `mas-grupo-gestion` · `mas-grupo-reportes` · `mas-grupo-ajustes` · `mas-grupo-cuenta` | ⚠ **`aria-labelledby` EXIGE que el `<p>` del eyebrow lleve un `id`** — no funciona apuntando a nada. El `<p>` de hoy (`sidebar.tsx:136`) **no tiene `id`**, así que agregárselo en Más es obligatorio y es el **único** cambio respecto del verbatim (atributo, cero clase, cero píxel). Los `id` se **derivan** del `section` de `NAV_GROUPS` (minúsculas, sin tilde: `GESTIÓN` → `gestion`), **no se inventan ni se numeran**: así un grupo nuevo en `NAV_GROUPS` trae su `id` solo. Son únicos por construcción —hay **una** pantalla Más y **un** grupo por `section`— y el prefijo `mas-` evita colisión con cualquier `id` de las otras 12 pantallas. |
| Bloque de identidad y firma | **fuera** del `<nav>` | No son destinos de navegación. |

**Criterio verificable:** `/mas` tiene **exactamente un** `h1`, no muestra texto duplicado con el
header, y en el árbol de accesibilidad cada fila se anuncia bajo el nombre de su grupo (p. ej.
"Finanzas, enlace, grupo REPORTES").

### Lo mismo del lado de la barra

La barra se envuelve en **`<nav aria-label="Navegación principal">`** — mismo patrón que
`sidebar.tsx:131`, con nombre propio por la razón de la tabla de arriba. Es el otro landmark de
navegación de la pantalla y sin nombre quedaría indistinguible del `<nav>` de Más cuando el dueño
está **en** Más (donde los dos coexisten). Cero píxeles.

### Anatomía de la fila

| Propiedad | Valor |
|---|---|
| Alto mínimo | **48px** (`min-h-12`) ⇒ ≥44 ✓ |
| Padding | `px-3 py-3` (12px) |
| Icono | **20×20** (`w-5 h-5`), `flex-shrink-0`. ⚠ El sidebar usa 16px (`w-4 h-4`); en una pantalla completa de 375px con filas de 48px, 16px queda chico. 20px está en la escala del proyecto ("mismo tamaño base, 20px o 24px") y es ≠ de los 24px de la barra a propósito: barra y lista son dos jerarquías distintas. |
| Gap icono↔label | **12px** (`gap-3`, igual que el sidebar) |
| Label | 14px / 500 / `--foreground` · `truncate` |
| Radio | `rounded-lg` (= `--radius`, 0.4rem) — el mismo del sidebar |
| Separador | **Ninguno entre filas.** La jerarquía la dan los eyebrows + 24px entre grupos. 11 filas con 11 líneas es ruido. |
| Chevron `>` | **No.** 10 chevrons idénticos no informan nada (todas las filas navegan). **Excepción única:** `Ver mi página` lleva un `ExternalLink` de **16px** alineado a la derecha, porque abre **pestaña nueva** y eso sí es información que el usuario no puede inferir. |
| Ancho del label | Medido a 14px/500 en **las 5 familias**: el peor caso es `Configuración` = **95.7px** (Plus Jakarta; Space Grotesk 95.2 · Manrope 93.5 · Mulish 90.5 · Chakra Petch 89.9), contra **287px** disponibles a 375px (343 de contenido − 24 de padding − 20 de icono − 12 de gap). Margen de 3×; `truncate` es puro backstop. |

### El bloque de identidad

Reusa **verbatim** el markup de `sidebar.tsx:110-129` (incluido el fallback `bg-primary` con la
inicial, que es el único uso del acento en esta superficie): `<img>` o inicial **40×40**
(`rounded-lg`), nombre 16px/600 `truncate`, segunda línea 14px/400 `--muted-foreground` con
`Plan {nombre}` si `plan_status === 'active'` o `business.type`. Sobre `bg-card` con
`border border-border rounded-lg p-4`.

**Por qué va arriba y por qué no es un link:** es el **único lugar de la app en mobile donde se ve
el plan del negocio** (el header no lo muestra) — hoy sólo vive en el header del drawer que esta
fase elimina. No es clickeable porque no lo es en el sidebar tampoco; convertirlo en un acceso a
Configuración sería una decisión de producto nueva, y no es esta fase.

### "Cerrar sesión" — tratamiento

Misma fila que las demás: `--foreground`, icono `LogOut`, **sin rojo y sin confirmación propia**.
Motivos: (a) el sidebar no lo pinta de rojo hoy y la consistencia entre superficies hermanas manda;
(b) el guard de cambios sin guardar **ya es** la barrera y se consume con su propia continuación
(`sidebar.tsx:220`: `requestNavigation('/login', () => void handleLogout())` — si el guard empujara
`/login` sin llamar a `signOut()`, la sesión quedaría viva y el proxy rebotaría al dashboard); (c) lo
que lo diferencia es el **grupo** `CUENTA` y su **posición última**, no el color. Es un `<button>`,
no un `<Link>`.

### Scroll y orden

Más mide, a 375px: identidad ~72px + 5 grupos × (eyebrow ~21 + filas × 48) + firma ~32 ≈ **760px**
⇒ **scrollea**. Scrollea el `main` (scroll de documento), **no** un contenedor interno: así el
header fijo y la barra fija se comportan igual que en cualquier otra pantalla del panel y no hay dos
scrolls anidados. **El orden de los grupos es el de `NAV_GROUPS` y no se reordena** (está fuera de
alcance por el ROADMAP), con `CUENTA` agregado al final.

---

## §12 El header superior (O-2)

Se queda, pierde el ☰, gana la segunda línea. **Alto sin cambios: `h-14` (56px)** ⇒ el `pt-14` de
`main` **no se toca**.

```
┌──────────────────────────────────────────────────────────────┐
│  Barbería Nómade                                   [ ] [ ]   │  16px/600 --foreground, truncate
│  Pacientes                                                   │  11px/500 --panel-nav-muted
└──────────────────────────────────────────────────────────────┘  h-14, bg-card, border-b
   ↑ px-4 + env(safe-area-inset-left)        ↑ slot de acciones (vacío en esta fase)
```

| Propiedad | Valor |
|---|---|
| Visibilidad / posición / capa | `lg:hidden fixed top-0 left-0 right-0 z-30` — **idénticos a hoy** (`sidebar.tsx:253`) |
| Superficie | `bg-card border-b border-border` — **idéntica a hoy** |
| Layout | `flex items-center px-4` + bloque de texto `flex-1 min-w-0` + slot de acciones `shrink-0` |
| Zona segura | `padding-left/right: env(safe-area-inset-left/right, 0px)` sumados al `px-4` |
| Línea 1 | **Nombre del negocio** · 16px/600 · `--foreground` · `truncate` |
| Línea 2 | **Título de la sección** · 11px/500 · `--panel-nav-muted` · `truncate` |
| Altura ocupada | 19.2 + 13.2 = **32.4px** centrados (`justify-center`) en 56px ⇒ 11.8px arriba y abajo ✓ |
| Semántica | **Las dos líneas son `<p>`, ninguna es un heading.** Cada pantalla conserva su propio `h1` (medido: `appointments-client.tsx:273` tiene `<h1>Turnos</h1>`, `finances-client.tsx:607` tiene `<h1>Finanzas</h1>`). Meter un `h1` en el header rompería la jerarquía de headings de las 12 pantallas. ⚠ **Esto NO significa que el panel se quede sin `h1`: significa que el `h1` es de la PANTALLA, no del header.** La otra mitad de esta decisión está en **§11 › Semántica y jerarquía de headings**: `/mas`, que es la única pantalla nueva de la fase y la única que no traía `h1` propio, lleva **`<h1 className="sr-only">Más</h1>`** — oculto justamente porque este header ya la nombra en pantalla. Las dos reglas se leen juntas o la segunda se pierde. |
| ☰ | **Eliminado.** Con él se va el `mobileOpen`, el overlay y el drawer (`sidebar.tsx:93,254-256,261-276`) ⇒ **un solo** camino de entrada en mobile (criterio 5 / MOB-07 / riesgo (d) del ROADMAP: dos inventarios divergen en el próximo destino que alguien agregue). |
| Logo | **No va en el header.** El logo vive en el bloque de identidad de Más, junto al plan. Razón: el header tiene que quedarse callado para que el `h1` de la pantalla domine, y un avatar de 32px no agrega nada que el nombre no diga. *Alternativa considerada:* avatar 32px a la izquierda ocupando el hueco del ☰ — descartada. |
| Slot de acciones | Declarado, **vacío en esta fase**. Contrato para quien lo use después: alineado a la derecha, **máximo 2** botones, `Button variant="ghost" size="icon"` con área táctil **44×44**, y nunca texto (no hay ancho). **Al ser sólo-icono, cada botón es obligatorio que lleve nombre accesible: `aria-label` con un verbo + objeto en español** (p. ej. `aria-label="Nuevo turno"`, `aria-label="Filtrar clientes"`), **nunca** `aria-label="Acción"` ni el `title` como sustituto (no hay hover en touch, y la regla del proyecto prohíbe tooltips en mobile). Un icono sin `aria-label` deja el botón anunciado como "botón" a secas. Mover acciones de una pantalla al header está **fuera de alcance**. |

### ⚠ Por qué el nombre del negocio es la línea DOMINANTE y el título de la sección la subordinada

Resuelve un choque real entre O-2 y la regla *"1 elemento dominante por pantalla"* /
*"cada elemento debe tener razón de existir"*: las pantallas **ya tienen** un `h1` visible con el
nombre de la sección, 24px bold en Archivo, 56px más abajo. Si el header pusiera el título de la
sección como elemento dominante, habría **dos títulos iguales a 56px de distancia** y el `h1` de la
pantalla —que es el dominante legítimo— quedaría compitiendo con el chrome.

La inversión honra las dos cosas: el header muestra **ambas**, como decidió el dueño, pero el
dominante del header es el **nombre del negocio** (que no está duplicado en ninguna parte de mobile)
y el título de la sección entra como **eyebrow de orientación**, que gana su lugar por una razón
que el `h1` no cubre: **el header es fijo y el `h1` scrollea**, así que a mitad de un formulario
largo el header es lo único que dice dónde estás. Con 12 secciones, eso importa.

### Fuente del título de la sección — una sola, y con la terminología del rubro

Un mapa `pathname → label` derivado del **mismo** `ITEMS`/`terminology` que usa `buildNavGroups()`,
para que diga **"Pacientes"** en salud y **"Reservas"** en canchas igual que la barra:

| pathname | Título |
|---|---|
| `/dashboard` | `Inicio` |
| `/appointments` | `t.appointments` |
| `/agenda` | `Agenda` |
| `/abonos` | `Abonos` |
| `/clients` | `t.clients` |
| `/servicios` | `t.services` |
| `/equipo` | `Equipo` |
| `/consultorios` | `t.locations` |
| `/negocio` | `Negocio` |
| `/web` | `Mi web` |
| `/finances` | `Finanzas` |
| `/settings` | `Configuración` |
| `/ayuda` | `Ayuda` |
| `/mas` | `Más` |
| **cualquier otro** | **la línea 2 no se renderiza** (el header queda de una línea, centrada). Nunca `undefined`, nunca un hueco vacío. |

**Nota:** `/clients?c=<id>` (el detalle de cliente de la Phase 1 de v0.30) tiene pathname `/clients`
⇒ el header dice `Clientes`/`Pacientes`. Correcto: el detalle es una subsección, no una sección.

---

## §13 El aviso efímero de salida (MOB-05) — y el problema del pulgar, resuelto

Se **diseña** acá y se **implementa** en la Phase 3 (donde vive el historial). Patrón: absorber el
primer `popstate` y avisar; el segundo sale. El atrás **no se cancela, se absorbe** (llega
`cancelable: false`), y hay implementación de referencia en producción: `lib/dirty-history.ts` ya
corre el ciclo sentinel completo.

### ⚠ El problema: el aviso aparecería lejos del pulgar

El `<Toaster>` del proyecto es **`top-center` en mobile** (`app/layout.tsx:81`, M-7). El gesto de
atrás es una acción del **pulgar, abajo**. Un aviso que nace arriba, a 700px del dedo que acaba de
apretar, se lo pierde: el usuario mira el fondo de la pantalla, aprieta de nuevo y sale sin haber
leído nada ⇒ el requisito **no cumple su función** aunque el código funcione.

Y no se puede "mover sonner": `position` es **una sola prop evaluada en el render**, no es
responsiva, y el `<Toaster>` es **uno solo y global** — moverlo a `bottom-center` movería **todos**
los toasts de la app, incluido el landing y el booking público. Montar un **segundo** `<Toaster>` es
una opción que el propio repo ya documentó y **descartó** en el quick `261005-vuy` (dos viewports
montados; con `id` hay que elegir destino en cada `toast()`).

### La resolución: no es un toast de sonner, es parte de la barra

El aviso es un **elemento propio del componente de la barra**, anclado **8px arriba de ella**, en el
mismo contexto de apilado. Cuatro razones, y la cuarta es la que cierra:

1. **Está donde está la atención.** El feedback de un gesto del pulgar va al alcance del pulgar.
2. **Cero efecto colateral.** No toca el `<Toaster>` global, no monta un segundo viewport, no cambia ni un toast del resto de la app (landing y `/[slug]` incluidos).
3. **Cero dependencia nueva.** Es un `<div>` condicional dentro del componente que ya existe.
4. **Semánticamente no es un toast.** No tiene acción, ni botón de cerrar, ni se apila, ni se descarta con swipe, ni sobrevive a un cambio de ruta: es una **pista transitoria atada a un gesto de navegación**. Y el patrón que el dueño nombró —el "press back again to exit" de Android— **es un Snackbar abajo**, no una notificación arriba. Mandarlo a `top-center` sería traicionar la referencia.

### Especificación

| Propiedad | Valor |
|---|---|
| Copy | **`Tocá atrás otra vez para salir`** |
| Ancho medido | **193.3px** de texto a 14px/500 en el peor caso de las 5 familias (**Space Grotesk**; Mulish 190.2 · Chakra Petch 185.8 · Manrope 185.7 · Plus Jakarta 184.5) + 32px de padding = **225.3px** de pill. Disponible: 343px a 375px, 288px a 320px ⇒ **entra en una línea en los dos, en las 5 familias**, con 118px y 63px de margen. `whitespace-nowrap`. |
| Posición | `fixed left-1/2 -translate-x-1/2` · `bottom: calc(var(--panel-nav-h) + env(safe-area-inset-bottom,0px) + 0.5rem)` ⇒ **8px arriba de la barra**, siempre, con o sin inset |
| Superficie | `bg-foreground text-background` — pill **invertido**. Es el par de tokens con contraste **garantizado en todos los temas** (≥8.94:1 medido) y se lee como "chrome del sistema", no como contenido de la pantalla. |
| Radio / padding | `rounded-lg` (= `--radius`) · `px-4 py-2` |
| Tipografía | 14px / 500 / line-height 1.4 |
| Capa | `z-40` — arriba de la barra (`z-30`), debajo de drawers y modales (`z-50`). No puede coexistir con un overlay abierto: el atrás **cierra el overlay primero** (política vigente, intacta). |
| Interactividad | `pointer-events-none` · no focusable · **sin** botón de cerrar |
| a11y | `role="status" aria-live="polite" aria-atomic="true"` ⇒ el lector de pantalla lo anuncia sin robar el foco |
| Movimiento | entrada `opacity 0→1` + `translateY(8px→0)`, **150ms ease-out** · salida `opacity 1→0`, **200ms ease-in**. Sólo `opacity` y `transform` (nunca `width`/`height`/`margin`). |
| `prefers-reduced-motion: reduce` | sin `translateY`; sólo el cambio de opacidad |
| Duración visible | **2000ms** |

### El detalle que la Phase 3 necesita, y que es de diseño

> **La duración visible del aviso y la ventana lógica en la que el segundo atrás sale son el MISMO
> valor, exportado desde UN solo lugar** (constante única, p. ej. `PANEL_EXIT_HINT_MS = 2000`).

Si fueran dos números, lo que el usuario **ve** y lo que el código **acepta** se desincronizan: el
aviso desaparece y el segundo atrás todavía sale (sale sin avisar), o el aviso sigue en pantalla y el
segundo atrás ya no vale (el usuario aprieta y no pasa nada). Los dos síntomas son **silenciosos** —
ni `tsc` ni la suite los ven. Un solo número los hace imposibles.

**Criterios observables (los verifica la Phase 3):** en Inicio el primer atrás **no sale** y muestra
el aviso abajo; el segundo **sale**; salir cuesta exactamente **un** atrás más, **nunca dos avisos
encadenados**; y el ciclo repetido **tres veces seguidas** sigue funcionando. Si la decisión final
fuera descartar MOB-05, **queda marcado "descartado con motivo"** en `REQUIREMENTS.md`, no como
pendiente silencioso.

---

## §14 Copywriting Contract

| Elemento | Copy |
|---|---|
| Labels de la barra | `Inicio` · `{t.appointments}` · `Agenda` · `{t.clients}` · `Más` |
| Eyebrows de grupo en Más | `AGENDA` · `GESTIÓN` · `REPORTES` · `AJUSTES` · **`CUENTA`** (nuevo) |
| Filas de `CUENTA` | `Ayuda` · `Ver mi página` · `Cerrar sesión` — **las tres literales del sidebar, sin cambiar una letra** |
| Título de sección en el header | El mapa de §12 |
| Segunda línea del bloque de identidad | `Plan {nombre}` si `plan_status === 'active'`, si no `business.type` — **literal del sidebar** |
| Firma al pie de Más | `hecho con Forjo Studio` — literal, con su SVG |
| **Aviso de salida (MOB-05)** | **`Tocá atrás otra vez para salir`** |
| Empty state | **No aplica, y está medido.** Más nunca está vacía: **mínimo 10 filas** (canchas: 7 de menú + 3 de `CUENTA`). Backstop por construcción: un grupo sin items no renderiza ni su header (`.filter(g => g.items.length > 0)`, `sidebar.tsx:85`). |
| Error state | **Falla de logout:** `toast.error('No pudimos cerrar la sesión. Probá de nuevo.')`. Hoy `handleLogout` no tiene rama de error (`sidebar.tsx:99-103`): en el sidebar un logout fallido deja al dueño mirando una fila que no hizo nada. En Más es **la única** forma de salir en mobile, así que el silencio no es aceptable. Cumple la regla del proyecto: qué pasó + qué hacer. |
| Confirmación destructiva | **Ninguna propia.** `Cerrar sesión` no abre diálogo: el guard de cambios sin guardar es la única barrera, y se consume con su propia continuación (§11). |
| Lo que **no** se escribe | Cero tooltips (no hay hover en touch, y la regla del proyecto los prohíbe en mobile). Cero placeholders. Cero copy nuevo en las 12 pantallas. |

### ⚠ "Inicio" vs "Dashboard" — inconsistencia aceptada y anotada

D-01 fija el label de la barra en **`Inicio`**. El sidebar de desktop dice **`Dashboard`**
(`sidebar.tsx:61`) y D-02/MOB-07 prohíbe tocar desktop. ⇒ el mismo destino se llama distinto en
mobile y en desktop. **Se acepta** porque son dos superficies que nunca se ven a la vez, y porque
tocar el label del sidebar viola MOB-07. **Mitigación dentro de mobile:** el título de sección del
header para `/dashboard` también dice **`Inicio`** ⇒ **dentro de mobile la palabra es una sola**.
Unificar desktop a "Inicio" es un quick de una línea, para después del milestone.

---

## §15 UI Considerations

Resueltas: **10 covered · 2 backstop · 0 unresolved**

| Categoría | Elemento(s) | Status | Resolución |
|---|---|---|---|
| long-text | labels de la barra | ✅ covered | Medido a 375px y 320px sobre **4 rubros × 5 familias × 2 pesos**: peor caso `Pacientes` en Plus Jakarta a 11px/600 = **52.4px** contra 67.0px / 56.0px disponibles ⇒ entran sin truncar en todas (§7) |
| long-text | labels de la barra, **eje fuente** | ✅ covered | `--font-sans` lo elige el negocio (`business.font`, 5 familias — §1). Las 5 están medidas; la diferencia entre la más ancha y la más angosta en el peor label es **2.9px** y ninguna cruza el límite (§7). El eje está incluido en el chequeo de §18.1 |
| long-text | nombre del negocio en el header y en identidad | 🧪 backstop | `truncate` + `min-w-0` en el contenedor flex. No hay límite de longitud en `businesses.name` ⇒ se verifica visualmente con un nombre de ≥40 caracteres |
| long-text | labels de fila en Más | ✅ covered | Peor caso `Configuración` **95.7px** (Plus Jakarta) a 14px/500 contra 287px disponibles a 375px |
| overflow | pantalla Más | ✅ covered | ~760px de contenido a 375px ⇒ scrollea el documento (no un contenedor interno); el último ítem queda alcanzable gracias al `pb` del `main` (§10) |
| zero-one-many | reparto por vertical | ✅ covered | 8 filas en salud/belleza/general, **7 en canchas** (sin `equipo`); `PANEL` desaparece entero; ningún grupo vacío renderiza header (§11) |
| partial | `safe-area-inset-bottom == 0` | ✅ covered | Android con barra de botones: mismo layout sin los ~34px, sin hueco ni doble reserva (§10, criterio 4) |
| partial | teclado abierto | ✅ covered | `interactiveWidget: 'resizes-visual'` ⇒ la barra queda detrás del teclado, no tapa el campo ni el submit, y no hay reflow (§9) |
| empty | pantalla Más | ✅ covered | Imposible: mínimo 10 filas. Backstop estructural ya existente (§14) |
| error | logout | 🧪 backstop | `toast.error` con copy declarado (§14); se verifica forzando la falla de `signOut()` |
| loading | activo de la barra durante la navegación | ✅ covered | Sin spinner, por decisión; lo cubre `active:bg-secondary`; es el comportamiento del sidebar de hoy (§8) |
| disabled | ítems de la barra / filas de Más | ✅ covered | **No aplica**, y está medido: los 4 destinos existen en los 4 verticales (M-1) y un negocio suspendido no entra al panel (§8) |

---

## §16 Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | ninguno nuevo en esta fase (`Button`, `Separator`, `Sonner` ya instalados) | not required |
| third-party | **ninguno** — `components.json:24` → `"registries": {}` | no aplica |

**Cero dependencias npm nuevas. Cero iconos fuera de `lucide-react@1.17.0`. Cero `tailwind.config`
(no existe): todo token nuevo (`--panel-nav-h`, `--panel-nav-muted`) es una custom property en
`app/globals.css` / `app/themes.css`.**

---

## §17 Lo que este contrato NO decide (y dónde se decide)

| Qué | Dónde |
|---|---|
| La política de atrás de **dos niveles** (MOB-04) | **Phase 3.** En esta fase el atrás sigue siendo de **un nivel**: `Inicio → Más → sección → atrás` cae en **Inicio** salteando Más, porque `panelNavMode` reemplaza entre secciones. Es el comportamiento actual y verificado, **no un defecto de esta fase**. |
| La **implementación** del aviso de MOB-05 | **Phase 3** (ciclo sentinel, `lib/*-history.ts`). Acá queda su superficie, su copy, su posición y la regla del número único. |
| Tabs de `/negocio`, `/settings`, `/finances` | Phase 4 |
| Un affordance "volver a Más" en el header de la sección, o un breadcrumb | **No existe en este contrato.** Si la Phase 3 lo necesitara, **reabre el gate de diseño** (lo dice su propio `UI-SPEC: no`). |
| Rediseñar las 12 pantallas, su contenido o sus `h1` | Fuera de alcance. Lo único que se mueve de una pantalla es el **padding** del §10. |
| PWA / `manifest` | Fuera de alcance del milestone. Y es relevante: el panel **no es instalable** (cero `manifest`, cero usos de `display-mode`) ⇒ gatear MOB-05 por `@media (display-mode: standalone)` daría **siempre false** (M-8). |
| Reordenar los grupos de Más o cambiar el reparto de D-01 | Decidido y fijo |
| Migraciones | **Cero.** Próxima libre: **080** (no 042 — M-10 corrige el dato de los requisitos). |

### Nota no-UI para el planner (medida, y no es un bloqueante)

`/mas` es una **ruta nueva** y no está en `KNOWN_PREFIXES` ni en `DASHBOARD_ROUTE_PREFIXES`
(`lib/auth/route-lists.ts`) ⇒ no pasaría por `updateSession` en el Edge. **No es un agujero y no es
una regresión:** `/agenda`, `/abonos`, `/servicios`, `/equipo`, `/consultorios`, `/negocio`, `/web`
y `/ayuda` **tampoco** están, y funcionan — el guard real vive en `(dashboard)/layout.tsx`
(`getUser()` → `redirect('/login')`). La recomendación es **no tocar esas listas en esta fase**: el
archivo documenta con cuatro advertencias que el reflejo de "agrego la ruta a las listas de auth"
rompe cosas en silencio, y `/mas` quedaría siendo la única ruta del panel tratada distinto de sus 8
hermanas. Queda **anotado**, no resuelto de paso.

---

## §18 Cómo se verifica este contrato

**UAT en celular real es el único criterio que vale.** El dueño encontró 7 bugs así con el pipeline
en verde, y NAV-08 sólo apareció en un teléfono.

1. **Labels: 4 rubros × 5 fuentes, a 375px y 320px.** Ninguno de los 5 labels muestra `…` ni se sale de su ítem. **El eje fuente es obligatorio**, no opcional: `--font-sans` lo elige el negocio (`business.font`, §1) y las 5 familias tienen anchos distintos (§7). Mínimo a mirar, y alcanza con esto porque el peor caso está medido: **rubro `salud`** (`Pacientes`, el peor label en las 5 familias) con **`font: 'geometrica'`** (Plus Jakarta, la familia más ancha: 52.4px a 11px/600) y con **`font: 'bauhaus'`** (Space Grotesk, 52.1px) — **y con el ítem en estado activo** (peso 600, que es el ancho que manda). Segundo pase con **`canchas`** (`Reservas`).
2. **Áreas táctiles.** Leyendo el DOM a 375px: los 5 ítems miden ≥44×44 (esperado 75×56). ⚠ Sonda **en iframe** del ancho pedido: Chrome headless ignora `--window-size` con `--dump-dom`.
3. **Zona segura de verdad.** iPhone con notch: la barra pinta la franja de gestos y el último label no queda bajo la barra de gestos. En Android (inset 0) no hay hueco.
4. **El `<head>` de los vecinos, byte por byte.** Diff del markup servido de `/[slug]` y del landing antes/después: **idéntico** (el `viewport` es del route group `(dashboard)`, H-2). Método ya instalado por el quick `261006-mx6`.
5. **Teclado.** Formulario largo de Finanzas + drawer de alta de turno, en Android Chrome **y** iOS Safari: con el teclado abierto la barra **no se ve** y no tapa campo ni submit; al cerrarse vuelve sin reflow (§9).
6. **Nada tapado.** Finanzas (botones de alta), formularios de Negocio y Configuración, y el final de Más: todo alcanzable con scroll.
7. **Inventario, rubro por rubro.** `Más` + barra == el inventario del drawer de hoy, en los **4** verticales. Específicamente: en **canchas** no aparece "Equipo"; en los 4 aparecen **Ayuda**, **Ver mi página** (pestaña nueva) y **Cerrar sesión**.
8. **Contraste — OBLIGATORIO, no opcional.** Tres pasadas, y las tres tienen motivo medido:
   - **forjo claro** — es donde cae el **peor caso absoluto de la superficie** (eyebrow de Más, **5.02:1**) y es el único tema **sin `color-mix`**, o sea el único cuyo número es exacto.
   - **spa claro con paleta `clay`** — el acento más oscuro de spa, el que más tiñe el fondo; es donde la **aproximación del método** (§5) tiene menos aire (eyebrow 5.08:1) y donde vive uno de los dos overrides de `--panel-nav-muted`.
   - **modern claro con paleta `amber`** — donde `--primary` mide **2.15:1**: es la pasada que confirma que el indicador en `--foreground` **sí** se distingue justo donde el acento no se distinguiría.

   En las tres: el foco visible se ve, el activo se distingue del inactivo, y el eyebrow de grupo de Más se lee.
9. **Desktop intacto.** ≥1024px: cero barra, sidebar idéntico. Y la banda **768-1023px**: la barra **sí** está (entra por `lg:hidden`, no por `md:hidden` — M-5).
10. **Un solo menú.** El ☰, el overlay y el drawer **ya no existen** en el markup.
11. **El historial no se tocó.** `git diff` de la fase: **cero** cambios en `lib/panel-history.ts`, `lib/overlay-history.ts`, `lib/dirty-history.ts`. `grep -rE 'pushState|replaceState|history\.back'` sobre los componentes nuevos: **cero** hits. Y la UAT de v0.30 repetida **desde la barra**: sección → atrás → **Inicio**, y el atrás sigue cerrando overlay, selector, calendario y teclado antes de navegar.
12. **Jerarquía de headings y landmarks — el chequeo que `/mas` no tenía.** Es el modo de falla que este contrato evita en todo lo demás: sin un chequeo, el `h1` de `/mas` puede desaparecer en el próximo refactor y **nada lo nota** (no lo ve `tsc`, ni la suite, ni el build, ni la UAT visual — es invisible por definición). Cuatro cosas, verificables en el DOM servido de `/mas`:
    - **`document.querySelectorAll('h1').length === 1`** y su texto es `Más`. Y está **oculto**: no aparece texto "Más" duplicado en pantalla junto al del header.
    - **No hay salto de nivel**: `/mas` no introduce `h2`/`h3` (los eyebrows siguen siendo `<p>`, §11) ⇒ la jerarquía es `h1` y nada más.
    - **Los 5 `id` resuelven:** cada `aria-labelledby` del contenedor de grupo apunta a un `id` que **existe** en la página (un `aria-labelledby` roto no tira error: deja el grupo sin nombre, en silencio). Chequeo: para cada `[role=group][aria-labelledby]`, `document.getElementById(valor) !== null`.
    - **Los dos landmarks `navigation` tienen nombres distintos** estando en `/mas` (donde coexisten): `Navegación principal` (la barra) y `Secciones` (la lista de Más). Se lee en el árbol de accesibilidad de DevTools, o con el lector de pantalla del teléfono en la misma pasada de la UAT.
13. **Tokens nuevos sin fuga.** `grep -rn 'panel-nav-muted\|panel-nav-h' app components lib`: sólo los 2 archivos de CSS y los 2 componentes nuevos. Y **el render del landing y del CRM no cambia**: los tokens son nuevos y nadie más los lee.
14. **Pipeline.** `npx vitest run` (⚠ dos canarios de reloj fallan a propósito fuera de [01:00, 23:30] AR) · `npm run lint` · `npx tsc --noEmit` (⚠ puede salir 0 en falso — memoria `worktree-nodemodules-y-npx-tsc-traps`) · `npm run build`.

---

## §19 Conflictos con las reglas del proyecto — declarados, no escondidos

| # | Regla del proyecto | Choque | Resolución |
|---|---|---|---|
| C-1 | *"Nunca font-size < 16px para texto de cuerpo en mobile"* | Los labels de la barra son de **11px** y el aviso de **14px** | **Excepción declarada (§4):** no son texto de cuerpo, son chrome de navegación de una palabra con el icono como portador primario; precedente en el repo (`sidebar.tsx:136` ya usa `text-[11px]`); y el tamaño es el **máximo que no rompe a 320px**: medido en las 5 familias y los 2 pesos, **12px desborda en 2 de las 5** (Space Grotesk por 0.9px, Plus Jakarta por 0.7px) — o sea que a 12px la barra rompería o no **según qué fuente eligió el negocio**, que es la peor clase de falla. Ningún texto de contenido baja de 16px. |
| C-2 | *"Usar los tokens del sistema"* + *"regla 60-30-10, 10% acento para CTAs"* | El acento `--primary` **no** se usa para el destino activo | **Medido sobre las 40 combinaciones** (4 temas × 2 modos × 5 paletas): `--primary` no llega a 3:1 contra `--card` en **8 de 40** (mínimo 2.15:1, modern claro/amber). Se usa `--foreground` (≥8.94:1 en las 40). Es un cambio de token, no de sistema. |
| C-3 | *"Reusá lo que existe"* (el foco del repo es `ring-ring/50`) | La barra usa `ring-2 ring-inset ring-foreground` | **Medido:** `--ring` **es** `--primary` en los 20 bloques de paleta, y al 50% baja de 2:1 en las mismas 8 combinaciones ⇒ **el foco sería invisible en 8 de las 40**. La divergencia está scopeada a los 2 componentes nuevos; ningún otro `focus-visible` del repo se toca. |
| C-4 | *"No hardcodear hex"* | `--panel-nav-muted: #6b6055` (spa claro) y `#5c6578` (modern claro) | Es la **declaración del token**, que es exactamente donde los hex viven en este repo (todo `globals.css`/`themes.css` son hex en declaraciones). Ningún componente ve el hex: ven `var(--panel-nav-muted)`. |
| C-5 | *"1 elemento dominante por pantalla"* / *"cada elemento debe tener razón de existir"* | O-2 pide el título de la sección en el header, y las pantallas **ya** tienen su `h1` con ese mismo texto a 56px de distancia (medido) | **§12:** se invierte la jerarquía **dentro** del header (nombre del negocio dominante, sección como eyebrow) y las dos líneas son `<p>`, no headings. El `h1` de la pantalla sigue siendo el dominante; la línea de sección gana su lugar porque el header es **fijo** y el `h1` **scrollea**. |
| C-6 | *"Contraste mínimo AA"* | **`--muted-foreground` falla AA en 10 de las 40**: 3.41:1 sobre `--card` en spa claro (5 paletas) y 4.15:1 sobre `--background` en modern claro (5 paletas) — y eso **ya pasa hoy** en los ítems inactivos del sidebar | Para la superficie nueva se resuelve con `--panel-nav-muted` y sus **dos** overrides (§5), subiendo el peor caso a 5.02:1. **El defecto preexistente del sidebar NO se arregla acá** (D-02/MOB-07: desktop no se toca) y queda **anotado como deuda**: `text-muted-foreground` en `sidebar.tsx:122,136,170,186,210,221` falla AA en spa claro y, en el eyebrow, también en modern claro. |
| C-7 | *"Nunca hover como único feedback"* | — | Cumplido: `active:` + indicador + `aria-current`; el `hover:` va dentro de `@media (hover: hover)`. |
| **C-8** | *"No más de 3-4 tamaños de fuente"* + *"no mezclar pesos no definidos en la guía"* (⇒ escala de pesos contenida) | La superficie declara **tres** pesos (400 / 500 / 600), no dos | **Excepción declarada.** 500 y 600 son los **dos pesos de decisión** de este contrato (inactivo/activo, cuerpo/título). El **400 no es una elección nueva**: son los **dos reusos verbatim** del sidebar que Más reemplaza —eyebrow mono de grupo (`sidebar.tsx:136`, sin clase de peso) y línea de plan (`sidebar.tsx:122`, `text-xs`)—. Alternativa considerada: subirlos a 500, descartada porque haría que **Más y el sidebar no se parezcan** mostrando el mismo inventario. Tamaños: **tres** (11/14/16), dentro del límite. Familias, con el criterio único de §4 (a nivel pantalla, heading y mono incluidos): la pantalla del panel renderiza **3** hoy y renderiza **3** con esta fase ⇒ **esta superficie no agrega ninguna**. La tercera (`--font-mono` del eyebrow) **excede** el "máximo 2" del proyecto y es **estado preexistente** del repo (`sidebar.tsx:136`), reusado verbatim para que Más no se vea distinta del sidebar; queda **anotado como deuda heredada**, igual que C-6. Y es justamente lo que §7 protege al **no** clavar la familia del label: clavarla la llevaría a **4**, con dos sans a 3px de distancia. |

**Correcciones de dato al upstream (medidas hoy):**

- **T-8 / M-2 dicen que la palabra más larga es "Reservas" (8 chars). Es falso:** es **"Pacientes"** (9 chars), y lo es en **las 5 familias tipográficas** medidas — entre 4% (Plus Jakarta) y 10% (Space Grotesk) más ancha. El rubro crítico de la UAT es **salud**, no canchas.
- **T-8 / M-2 además hablan de "~75px por ítem" como si el ancho del texto fuera uno solo.** Medido: depende de **`business.font`** (5 familias, hasta 2.9px de diferencia en el peor label) y del **peso** (el activo es 600 y es más ancho que el inactivo en 4 de las 5 familias). El peor caso del sistema es **`Pacientes` en Plus Jakarta a 11px/600 = 52.4px**, no el de Space Grotesk.
- **T-9 / M-5 citan `sidebar.tsx:253,279` y `:262-267`** para el breakpoint y el drawer; en el archivo actual son **`:253` y `:279`** (header `lg:hidden` y sidebar `hidden lg:flex`) y **`:266-276`** (drawer). El hecho —breakpoint **`lg`**, drawer con `useState` pelado— está confirmado.
- **M-10 ya corrige** el "próxima migración libre: 042" de los requisitos ⇒ es la **080**. Esta fase no usa ninguna.

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
