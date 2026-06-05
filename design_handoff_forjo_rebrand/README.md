# Handoff: Forjo App — Rebrand Bauhaus + selector de paletas

## Overview
Rebrand visual completo de **forjostudio/forjo-app** (Next.js 16 · React 19 · Tailwind v4 ·
shadcn/ui · Supabase) a la identidad de marca **Forjo** (lenguaje Bauhaus: crema/tinta,
primarios rojo/azul/amarillo, tipografías Archivo + Space Grotesk, formas geométricas y la
"F" constructivista). Incluye una **feature nueva**: selector de paleta de color por negocio,
en Configuración → Apariencia, que tiñe tanto el panel como la página pública de reservas.

El cambio es **a nivel de capa de tema** (tokens shadcn) + tres ajustes puntuales de UI.
Como los componentes ya consumen los tokens de shadcn (`bg-primary`, `text-muted-foreground`,
`border-border`, etc.), reemplazar el theme reestiliza **toda la app sin tocar componentes**.

## About the Design Files
Los archivos en `preview/` son **referencias de diseño hechas en HTML/CSS/JS plano** —
un prototipo navegable que muestra el look & feel y el comportamiento buscados. **No son
código a copiar tal cual.** La tarea es trasladar ese diseño al stack real del repo
(Next.js + Tailwind v4 + shadcn) usando sus patrones existentes. El entregable principal de
producción es `globals.css` (drop-in real); el HTML es solo para ver el resultado esperado.

Abrir `preview/Forjo App Rebrand.html` y usar la barra superior para recorrer las 9 pantallas
y probar las 5 paletas + claro/oscuro en vivo.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, radios y espaciados son finales. El
`globals.css` adjunto ES la fuente de verdad de los tokens — usarlo literal. Las pantallas
del preview muestran cómo deben verse los componentes shadcn ya existentes una vez aplicado
el theme; no hay que rehacer componentes, solo el theme + 3 retoques.

---

## Cambios en el repo (orden recomendado)

### 1. Fuentes — `app/layout.tsx`
Reemplazar Geist por el par de marca, ambos vía `next/font/google`:
```tsx
import { Archivo, Space_Grotesk } from "next/font/google";
const sans = Space_Grotesk({ variable: "--font-sans", subsets: ["latin"], weight: ["300","400","500","600","700"] });
const heading = Archivo({ variable: "--font-heading", subsets: ["latin"], weight: ["400","500","600","700","800","900"] });
```
- En `<html>`: `className={`${sans.variable} ${heading.variable} h-full antialiased`}`.
- **Quitar** el `dark` hardcodeado del `<html>` y envolver con next-themes (ya está en deps):
  `<ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>`.
  Así el toggle Claro/Oscuro de Apariencia funciona.

### 2. Theme — `app/globals.css`
Reemplazar el archivo completo por el `globals.css` adjunto. Mantiene los mismos nombres de
token shadcn y el bloque `@theme inline`, así que Button/Card/Badge/Table/Tabs/Input/Sidebar
heredan el nuevo look sin cambios. Agrega `--font-heading` y los bloques `[data-palette=...]`.

### 3. Feature: selector de paleta
- **DB**: agregar columna `palette text not null default 'red'` a `businesses`
  (migración en `supabase/`). Valores válidos: `red | blue | yellow | green | ink`.
- **Aplicar el atributo**: en `app/(dashboard)/layout.tsx` y `app/[slug]/layout.tsx`
  setear `data-palette={business.palette}` en el `<html>` (o en un wrapper raíz). Eso hace
  que el panel **y** la página pública sigan el color elegido por el negocio.
- **UI**: nuevo tab **Apariencia** (primero) en `settings-client.tsx`. Renderiza 5 tarjetas
  de paleta + un segmented Claro/Oscuro (ver `preview/` sección Configuración → Apariencia).
  Al elegir: `await supabase.from('businesses').update({ palette }).eq('id', business.id)`
  y aplicar `document.documentElement.dataset.palette = palette` para feedback inmediato.
  El tema claro/oscuro se maneja con `useTheme()` de next-themes.
- **Reemplaza** el color-picker libre `primary_color` del tab Negocio por estas paletas
  curadas (se puede conservar la columna por compatibilidad, pero la UI ya no la usa).

### 4. Retoques Bauhaus (ya reflejados en el preview)
- **Sidebar** (`components/dashboard/sidebar.tsx`): footer "hecho con **Forjo**" con la marca
  "F" constructivista (SVG abajo). Item activo ya usa `bg-primary` → queda automático.
- **Dashboard** (`app/(dashboard)/dashboard/page.tsx`): la card "Ingresos del mes" como bloque
  sólido `bg-primary text-primary-foreground` (acento Bauhaus). Las otras 3 quedan normales.
- **Hero público** (`app/[slug]/...`): banda superior full-bleed `bg-primary` con formas
  geométricas y título en Archivo uppercase (`font-[family-name:var(--font-heading)]`).

> La "F" constructivista (reusar como SVG inline):
> ```svg
> <svg viewBox="0 0 64 80"><rect x="6" y="6" width="14" height="68" fill="#1a1714"/><rect x="20" y="6" width="38" height="14" fill="#d94a2b"/><path d="M20 34 L50 34 L36 48 L20 48 Z" fill="#2a5fa5"/><circle cx="56" cy="13" r="6" fill="#f4c543"/></svg>
> ```
> En fondos oscuros, cambiar el primer `fill` (#1a1714) por crema (#f3ead8).

---

## Design Tokens

### Tipografía
- **Heading / display**: Archivo (700–900), `letter-spacing:-0.02em`, mayúsculas en títulos grandes.
- **Body / UI**: Space Grotesk (400–600).
- **Radius base**: `0.4rem` (más duro que el default shadcn, acento constructivista).

### Neutrales — Claro (crema/tinta)
| token | hex |
|---|---|
| background | `#f3ead8` |
| foreground | `#1a1714` |
| card / popover | `#fbf3e3` |
| secondary | `#e9ddc4` |
| muted | `#ece0c8` · fg `#6b6253` |
| border / input | `#d9ceb4` |
| sidebar | `#efe3cd` · border `#ddd1b7` |
| destructive | `#b23a26` |

### Neutrales — Oscuro (tinta)
| token | hex |
|---|---|
| background | `#1a1714` |
| foreground | `#f3ead8` |
| card / popover | `#252019` |
| secondary / muted | `#2e2820` · fg `#a99e8b` |
| border | `rgba(243,234,216,.12)` |
| sidebar | `#141110` |
| destructive | `#e05c43` |

### Paletas (solo cambia la familia de acento: primary / accent / ring / sidebar-primary / chart-1)
| paleta | primary claro | primary oscuro | primary-foreground |
|---|---|---|---|
| **red** (Rojo Forjo, default) | `#d94a2b` | `#e85c3f` | crema `#fbf3e3` |
| **blue** (constructivista) | `#2a5fa5` | `#5f93d6` | crema / `#10141c` (osc.) |
| **yellow** (ocre) | `#c8901a` | `#e6b53f` | tinta `#1a1714` |
| **green** (bosque) | `#2f8a5b` | `#54b07f` | crema / `#0f1712` (osc.) |
| **ink** (monocromo) | `#1a1714` | `#f3ead8` | crema / tinta (osc.) |

Constantes Bauhaus para charts y badges de estado (no cambian por paleta):
rojo `#d94a2b` · azul `#2a5fa5` · amarillo `#f4c543` · verde `#2f8a5b` · violeta `#8a5fb0`.
Estados de turno: pending=amarillo, confirmed=azul, completed=verde, cancelled=rojo.

---

## Screens / Views
Todas heredan el theme; abajo, qué archivo del repo las implementa y qué cambia.

1. **Login** — `app/(auth)/login/page.tsx`. Panel izq. `bg-primary` con formas geométricas +
   título Archivo uppercase; formulario a la derecha. Solo theme.
2. **Onboarding** — `app/(onboarding)/onboarding/page.tsx`. Wizard 4 pasos, stepper con
   `bg-primary`, título "Forjo" en `text-primary`. El color-picker del paso 1 → swatches de paleta.
3. **Dashboard** — `app/(dashboard)/dashboard/page.tsx`. 4 stat cards (1 como bloque primary),
   "Turnos de hoy" con hora en `text-primary` + badges de estado.
4. **Turnos** — `app/(dashboard)/appointments/`. Tabs Próximos/Pasados/Todos + tabla con badges.
5. **Clientes** — `app/(dashboard)/clients/`. Master/detail: lista con filtros, índice alfabético,
   punto de estado; ficha con nombre Archivo uppercase, stat cards, sugerencia, historial + chart.
6. **Historia clínica** — `components/dashboard/clinical-history-panel.tsx` (solo vertical salud).
   Obra social, nueva nota, timeline EVOLUCIÓN con nodos `bg-primary`, adjuntos.
7. **Finanzas** — `app/(dashboard)/finances/`. 6 KPIs, bar chart 6 meses (ingresos=primary,
   egresos=destructive), ranking, gastos fijos, tabs Turnos/Ventas/Egresos. En charts recharts,
   usar `hsl(var(--primary))` / `hsl(var(--destructive))` como ya lo hace el código.
8. **Configuración** — `app/(dashboard)/settings/settings-client.tsx`. Tab **Apariencia** nuevo
   (paletas + tema). Tab **Negocio** conserva Tipo (select agrupado) + aviso de **Rubro**
   (`getVerticalKeyByType` → Salud/Belleza/General · "cambiarlo ajusta el menú y los campos").
9. **Reserva pública** — `app/[slug]/booking-client.tsx`. Hero `bg-primary` + flujo de pasos
   (servicio → día → hora → datos) con cards/pills que usan `border-primary` al seleccionar.

## Interactions & Behavior
- **Paleta**: persiste en `businesses.palette`; aplica al instante vía `data-palette` en `<html>`.
- **Tema**: next-themes (`.dark`), persistido en localStorage por la librería.
- **Selección** (servicios/días/horas/clientes): borde `--primary` + fondo `color-mix(primary 8–10%)`.
- **Estados de turno**: badges con color por estado (ver tokens). Hover de filas: overlay sutil.
- En el preview, al cambiar paleta en vivo se suprimen las transiciones un frame para evitar
  colores "pegados"; **en el repo no hace falta** (next-themes hace swap de clase sin transición).

## State Management
- `palette` (string) en `businesses` → server component lo pasa al layout.
- Tema vía `useTheme()` de next-themes.
- El resto de estados (turnos, clientes, finanzas) ya existen en los `*-client.tsx`; no cambian.

## Assets
- Marca "F" constructivista: SVG inline (arriba). No requiere archivos externos.
- **Favicons de marca** (carpeta `favicons/`): composición Bauhaus 2×2 sobre fondo tinta
  (cuadrado rojo, círculo crema, triángulo azul, cuadrado amarillo). Para Next.js App Router:
  - copiar `favicons/icon.png` → `app/icon.png` (Next genera `<link rel="icon">` solo).
  - copiar `favicons/apple-icon.png` → `app/apple-icon.png` (touch icon iOS).
  - opcional: generar `app/favicon.ico` desde `favicon-32.png`/`favicon-16.png`
    (p. ej. `npx png-to-ico favicons/favicon-32.png favicons/favicon-16.png > app/favicon.ico`)
    y borrar el `app/favicon.ico` viejo. Tamaños sueltos: 16/32/48/180/512.
- Sin otras imágenes nuevas; las formas del hero/login son SVG inline.

## Files (en este bundle)
- `globals.css` — **drop-in de producción** para `app/globals.css`.
- `favicons/` — íconos de marca (icon.png, apple-icon.png, favicon-16/32/48/180/512.png).
- `preview/Forjo App Rebrand.html` + `preview/theme.css` + `preview/app.js` — prototipo de
  referencia navegable (9 pantallas, 5 paletas, claro/oscuro). Solo referencia visual.
