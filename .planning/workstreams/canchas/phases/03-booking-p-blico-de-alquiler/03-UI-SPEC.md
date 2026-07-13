---
phase: 3
slug: booking-p-blico-de-alquiler
status: draft
shadcn_initialized: true
preset: base-nova (baseColor neutral, CSS variables)
created: 2026-07-01
---

# Phase 3 — UI Design Contract

> Contrato visual y de interacción del **flujo público de reserva de canchas** (`/[slug]`, cliente
> final anónimo, mobile-first). Generado por gsd-ui-researcher, verificado por gsd-ui-checker.
>
> **Ancla dura:** este flujo es un client component NUEVO (`canchas-booking-client.tsx`, D-02) que
> debe verse como **parte de la misma página pública** que `app/[slug]/booking-client.tsx`
> (BookingClient). Todo patrón visual sale de ahí — NO se inventan estilos nuevos ni se hardcodean
> hex/px. Lo que ya existe en BookingClient se adopta **as-is (locked)**; esta fase solo cambia el
> *contenido de los pasos* (cancha en vez de servicio+profesional), no el lenguaje visual.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn `^4.10.0` (ya inicializado — `components.json`) |
| Preset | `base-nova`, baseColor `neutral`, CSS variables |
| Component library | `@base-ui/react` (primitivas sin estilo) |
| Icon library | `lucide-react` |
| Font | `--font-heading` = Archivo (títulos) · `--font-sans` = Space Grotesk (cuerpo) — vía `next/font` |
| Toasts | `sonner` (`toast.error` / `toast.success`) |
| Tema | por-negocio: `data-palette` en `<html>` (PaletteScript) + neutrales Bauhaus cream/ink light/dark |

**Componentes reusados (NO crear nuevos):** `@/components/ui/button` (`Button`), `@/components/ui/input`
(`Input`), `@/components/ui/label` (`Label`), `@/components/ui/textarea` (`Textarea`). El resto de la
UI (tarjetas, grilla de horarios, calendario, barra de progreso, hero) se replica con las **mismas
clases Tailwind** del BookingClient, no con componentes nuevos.

---

## Spacing Scale

Escala de facto del BookingClient (múltiplos de 4, Tailwind). Adoptar tal cual.

| Token | Value | Usage (verbatim del BookingClient) |
|-------|-------|------|
| xs | 4px (`gap-1`) | gaps de icono, celdas del calendario |
| sm | 8px (`gap-2`, `mb-2`) | grilla de horarios, labels de sección |
| md | 12px (`gap-3`, `p-3`) | grilla de tarjetas, padding del calendario, resumen |
| — | 16px (`p-4`, `mb-4`) | padding interno de tarjetas y del bloque resumen |
| lg | 24px (`px-6`, `py-8` contenedor / `mt-6`) | padding del contenedor de pasos, separación de bloques |
| xl | 28px (`mb-7`) | separación de la barra de progreso |
| 2xl | 40px (`mt-10`) | footer "hecho con Forjo Studio" |

Contenedor central: `max-w-lg mx-auto px-6` (mismo ancho de columna que el BookingClient — el flujo
de canchas DEBE compartir este ancho para verse hermano).

Exceptions: touch targets — todos los botones interactivos (tarjeta de cancha, slot de horario, día
del calendario, CTA) mantienen alto ≥44px efectivo (celdas `aspect-square` del calendario y `Button`
w-full ya cumplen; slots `py-2 px-3` con dos líneas cumplen).

---

## Typography

Escala del BookingClient (3 tamaños de heading + cuerpo + label). No agregar tamaños nuevos.

| Role | Size | Weight | Line Height | Uso |
|------|------|--------|-------------|-----|
| Display (hero) | `clamp(22px,6vw,34px)` | 900 (`font-black`) | 1.05 | nombre del negocio en el hero, `--font-heading` uppercase |
| Heading de paso | 20px (`text-xl`) | 700 (`font-bold`) | default | "Elegí tu cancha", "Elegí día y horario", `--font-heading` |
| Sub-heading | 18px (`text-lg`) | 600 (`font-semibold`) | default | "Tus datos", `--font-heading` |
| Body | 14px (`text-sm`) | 400 / 500 | ~1.5 | resumen, labels de campo, copy de ayuda |
| Precio (tarjeta) | 18px (`text-lg`) | 700 (`font-bold`) | tight | precio de la cancha, `--font-heading` |
| Meta / caption | 11px (`text-[11px]`) · 10px (`text-[10px]`) | 400/600 | — | "Paso X de N", duración con icono, nombre de sede en el slot |

Fuente de cuerpo mínima 14px (`text-sm`) — consistente con el BookingClient. Headings con
`--font-heading` (Archivo), tracking tight heredado de `h1,h2,h3` en globals.css.

---

## Color

Sistema de tokens de `app/globals.css` — **cero hex hardcodeado**. El acento cambia por negocio vía
`data-palette` (rojo/azul/amarillo/verde/ink) × claro/oscuro. Referenciar SIEMPRE por token.

| Role | Token | Usage |
|------|-------|-------|
| Dominante (60%) | `--background` / `--foreground` | fondo de la página y texto principal (cream/ink) |
| Secundario (30%) | `--card` + `--border` / `--secondary` / `--muted-foreground` | tarjetas de cancha, slots, calendario, barra de progreso base, textos secundarios |
| Acento (10%) | `--primary` / `--primary-foreground` | ver lista reservada abajo |
| Destructivo | `--destructive` | (no hay acciones destructivas en este flujo — sin uso) |

**Acento (`--primary`) reservado exclusivamente para:**
- Estado **seleccionado** de una tarjeta de cancha (`border-primary bg-primary/[0.06]`), un slot de
  horario (`bg-primary text-primary-foreground border-primary`) y el día del calendario elegido.
- **Hover/focus** de elementos interactivos (`hover:border-primary`).
- El **CTA primario** ("Continuar" / "Reservar" / "Pagar seña $X") — `Button` variant default (`bg-primary`).
- La **banda hero** full-bleed (`bg-primary text-primary-foreground` con formas Bauhaus SVG).
- El **relleno de la barra de progreso** y el **borde-guía izquierdo** del bloque resumen (`border-l-primary`).

NUNCA usar el acento para texto de cuerpo, fondos de tarjeta en reposo, ni "todos los elementos
interactivos" (el reposo va con `--border`/`--card`).

Contraste: los pares token están calibrados WCAG AA en las 5 paletas × claro/oscuro (verificado en
globals.css). No introducir combinaciones nuevas de color/fondo.

Branding del negocio: hero muestra `logo_url` (o inicial en cuadro `bg-white/15` si no hay) + `name`.
La tinta de acento sale del `data-palette` del negocio ya seteado en `<html>` — el componente no toca
el color, solo usa `--primary`.

---

## Layout & Estados de las 4 superficies

El flujo replica la **estructura de pasos con barra de progreso** del BookingClient, pero con **3
pasos** (canchas no tiene profesional, D-02): `['Cancha', 'Fecha y hora', 'Tus datos']`. Barra de
progreso `Paso {step} de 3`, mismo markup (`h-1.5 rounded-full bg-secondary` + relleno `bg-primary`).

### 1. Selección de cancha (Paso 1)
- **Patrón:** idéntico a la grilla de servicios del BookingClient (Step 1): `grid grid-cols-1
  sm:grid-cols-2 gap-3`, cada cancha es un `<button>` tarjeta `rounded-lg border p-4 text-left`.
- **Contenido de la tarjeta** (layout `flex items-center justify-between gap-3`):
  - Izquierda: nombre de la cancha (`font-semibold`, `--font-heading`). Sin descripción (la vista
    `public_canchas` no la expone → no renderizar bloque de descripción).
  - Derecha (`text-right shrink-0`): **precio** propio de la cancha `$X` (`text-lg font-bold`,
    `--font-heading`, `Number(price).toLocaleString('es-AR')`) + **duración fija** debajo con icono
    `Clock` (`text-[11px] text-muted-foreground`, `{duration_minutes} min`).
- **Selección:** click → pasa a paso 2 (no requiere confirmación intermedia). Estado seleccionado
  `border-primary bg-primary/[0.06]`; reposo `border-border bg-card hover:border-primary`.
- **Empty state (negocio sin canchas):** copy centrado `text-center text-muted-foreground text-sm
  py-4` (mismo patrón que "No hay horarios disponibles"). Ver Copywriting.

### 2. Selección de horario (Paso 2)
- **Bloque resumen** de lo elegido arriba (`rounded-md bg-card border border-border border-l-4
  border-l-primary p-3 text-sm`): "Cancha: {nombre} · {duration} min · ${price}". SIN línea de
  profesional ni de sede-multi (canchas no las usa en v0.13).
- **Calendario mensual:** reusar VERBATIM el calendario del BookingClient (Step 3): navegación de
  mes con `ChevronLeft`/`ChevronRight`, grilla `grid-cols-7 gap-1`, días `aspect-square rounded-md`,
  deshabilitados con `text-muted-foreground/30`, seleccionado `bg-primary text-primary-foreground`.
  Días abiertos/cerrados salen de `time_blocks`/exceptions como hoy.
- **Grilla de slots:** reusar VERBATIM: `grid grid-cols-3 sm:grid-cols-4 gap-2`, cada slot
  `py-2 px-3 rounded-lg text-sm font-medium border`, seleccionado `bg-primary text-primary-foreground`.
  Datos desde `/api/booking/availability` (`{ok,busy,full}`) — la duración del slot es la **fija de
  la cancha** (`duration_minutes` de `public_canchas`), NO hay picker de duración (D-02/D-06). Slots
  `busy`/`full` simplemente no se listan (mismo cómputo que el BookingClient).
- **Sin selector de sede** (canchas usa `location: 'Sede'` pero el flujo v0.13 no expone multi-sede
  en el picker — un único eje reservable = la cancha).
- **Estados:** cargando → `Cargando horarios...` centrado; sin slots → `No hay horarios disponibles
  para este día` centrado (`text-muted-foreground text-sm py-4`).
- **CTA de paso:** `Button` w-full "Continuar", `disabled` hasta que haya día + horario elegidos.
- **Copy opcional de 2 turnos consecutivos (D-06):** una línea de ayuda debajo de la grilla de slots
  (`text-xs text-muted-foreground`), sin lógica nueva. Ver Copywriting.

### 3. Resumen + datos del cliente + CTA (Paso 3)
- **Bloque resumen** (`rounded-md p-4 ... bg-card border border-border border-l-4 border-l-primary`):
  - "Cancha: {nombre}"
  - "{día d de mes} a las **{hora}**" (`format ... EEEE d 'de' MMMM`, `es`)
  - Si `require_deposit`: "Seña requerida: **${deposit_amount}**".
  - **Precio de la reserva = precio de la cancha** (ALQUILER-04): mostrar "Total: ${price}" en el
    resumen (la reserva registra ese precio, no uno genérico).
- **Formulario** (mismos campos y componentes que el BookingClient Step 4, `space-y-3`):
  - Nombre * (`Input`, placeholder "Tu nombre completo") — label visible.
  - Teléfono * (`Input type=tel`, placeholder "+54 9 11 1234-5678").
  - Email * (`Input type=email`, placeholder "tu@email.com").
  - Notas (opcional) (`Textarea rows=3 resize-none`) — opcional marcado con "(opcional)".
  - Labels SIEMPRE visibles (`Label`), placeholders no reemplazan label.
- **reCAPTCHA v3:** invisible, solo en el camino **sin seña** (script cargado como en el BookingClient).
- **CTA primario:** `Button` w-full, `disabled` hasta nombre+tel+email o mientras `submitting`.
  Texto según flujo (ver Copywriting). Nota "Serás redirigido a MercadoPago..." si hay seña.

### 4. Confirmación / redirección a pago
- **Reusar el flujo existente sin cambios:**
  - Con seña → `POST /api/booking/create` (hold + `pending_payment`) → `POST /api/payment/create` →
    `window.location.href = url` (MercadoPago).
  - Sin seña → `create` confirma → `POST /api/notify/booking` (fire-and-forget) →
    `router.push('/{slug}/turno/{cancelToken}')` (página de confirmación theme-aware existente).
- **Errores (toast `sonner`, mismos textos que el BookingClient):** `slot_taken` → "Ese horario se
  acaba de ocupar, elegí otro."; `recaptcha_failed` → "No pudimos verificar que no seas un bot.
  Recargá la página e intentá de nuevo."; genérico → "Error al confirmar. Intentá de nuevo.";
  sin conexión → "No pudimos conectar. Revisá tu conexión e intentá de nuevo."

### Navegación e integración
- Botón "Volver" (`ChevronLeft` + "Volver", `text-muted-foreground hover:text-foreground`) en pasos > 1.
- Auto-scroll entre pasos y a la grilla de horarios (patrón `smoothScrollTo` del BookingClient,
  respeta `prefers-reduced-motion`).
- Footer "hecho con Forjo Studio" idéntico.
- **Integración (D-05):** el flujo entra por AMBOS caminos de `/[slug]` — legacy directo y la sección
  `booking` del `LandingRenderer` (envuelta en `<section id="reservar">`, caja negra: PROHIBIDO
  transform/overflow-hidden/position:fixed|sticky alrededor, para no romper el popover del calendario
  ni los toasts). El gateo es por `resolveVertical(business).key === 'canchas'`.

---

## Copywriting Contract

Terminología vertical canchas (`resolveVertical`): **Cancha/Canchas**, **Reserva/Reservas**, **Sede**.
Español rioplatense (voseo), tono directo y cercano (consistente con el BookingClient).

| Element | Copy |
|---------|------|
| Heading paso 1 | **Elegí tu cancha** |
| Heading paso 2 | **Elegí día y horario** |
| Heading paso 3 | **Tus datos** |
| Label barra de progreso | **Paso {step} de 3** |
| CTA paso 2 | **Continuar** (disabled hasta día + horario) |
| Primary CTA (sin seña) | **Reservar cancha** |
| Primary CTA (con seña) | **Pagar seña $\{deposit_amount\}** |
| Estado CTA cargando (sin seña) | **Reservando...** |
| Estado CTA cargando (con seña) | **Iniciando pago...** |
| Nota bajo CTA (con seña) | Serás redirigido a MercadoPago para abonar la seña. |
| Sugerencia 2 turnos (D-06, opcional) | **¿Necesitás más tiempo?** Reservá dos horarios seguidos. |
| Empty state heading (sin canchas) | **Todavía no hay canchas disponibles** |
| Empty state body | Este negocio aún no cargó sus canchas. Escribile para consultar disponibilidad. |
| Empty state (sin horarios ese día) | No hay horarios disponibles para este día |
| Empty state (cargando slots) | Cargando horarios... |
| Error — slot ocupado | Ese horario se acaba de ocupar, elegí otro. |
| Error — reCAPTCHA | No pudimos verificar que no seas un bot. Recargá la página e intentá de nuevo. |
| Error — genérico | Error al confirmar. Intentá de nuevo. |
| Error — sin conexión | No pudimos conectar. Revisá tu conexión e intentá de nuevo. |
| Resumen — línea horario | {día d de mes} a las **{hora}** |
| Resumen — total | Total: **${price}** (precio propio de la cancha — ALQUILER-04) |
| Resumen — seña | Seña requerida: **${deposit_amount}** |

Destructive actions: **ninguna** en este flujo (el cliente solo reserva). Sin confirmación destructiva.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official (`base-nova`) | button, input, label, textarea (ya en `@/components/ui`, reusados) | not required |
| Terceros | ninguno | not applicable |

No se declaran registries de terceros ni se agregan dependencias nuevas. Todo el UI se construye con
componentes ya presentes en el repo + clases Tailwind del BookingClient.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
