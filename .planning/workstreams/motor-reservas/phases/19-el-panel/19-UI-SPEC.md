---
phase: 19
slug: el-panel
status: draft
shadcn_initialized: true
preset: "style=base-nova · baseColor=neutral · cssVariables=true · rsc=true · iconLibrary=lucide"
created: 2026-08-25
---

# Phase 19 — UI Design Contract

> Contrato visual y de interacción de la Phase 19 (AGENDA-05 / AGENDA-06). Generado por gsd-ui-researcher, verificado por gsd-ui-checker.
>
> **El design system YA EXISTE.** Este documento lo *documenta y reusa*: no inventa tokens, no agrega dependencias, no instala componentes. Todo lo prescripto sale de `app/globals.css` y de idiomas ya probados en `app/(dashboard)/agenda/agenda-client.tsx` y `app/(dashboard)/settings/settings-client.tsx`.
>
> **`19-CONTEXT.md` manda.** D-01 a D-19 están LOCKED: este spec los materializa, no los reabre. Lo único que se decide acá es lo que el contexto delegó explícitamente (umbral de "ver todos", chip "Cualquier servicio" clickeable o no, tratamiento del servicio desactivado) más el detalle visual, responsive, de accesibilidad y de copy.

---

## Alcance de la superficie

Cuatro cambios, en tres archivos. Nada más entra en este contrato.

| # | Bloque | Archivo | Qué pasa | Decisión |
|---|--------|---------|----------|----------|
| A | **La línea de servicios** bajo cada franja del editor de horarios | `app/(dashboard)/agenda/agenda-client.tsx` | **NUEVO** | D-08, D-09, D-10, D-11, D-14, D-16, D-17 |
| B | **La fila del bloque** pierde el stepper de cupo | `app/(dashboard)/agenda/agenda-client.tsx` :941-965 | **SE BORRA** | D-12 |
| C | **Aviso de borrado** de un servicio mapeado | `app/(dashboard)/settings/settings-client.tsx` (`delDescription` :1233-1247) | **SE AMPLÍA** | D-07 |
| D | **Copy del error `service_not_scheduled`** | `app/[slug]/booking-client.tsx` :394-407 | **SE AGREGA una rama** | D-18 |

**Fuera de alcance — no se toca ni un pixel:** la vista semanal de turnos (D-13), el calendario de días especiales, la ventana de reserva, el alta manual (`NuevoTurnoForm`), la tarjeta de servicio de `/servicios` salvo la descripción del diálogo de borrado, y el resto del cliente público de booking.

**Componentes nuevos a crear: CERO componentes de `@/components/ui`.** El Bloque A se arma con dos funciones locales en `agenda-client.tsx`, hermanas de `OccupancyBadge` (:110-145): `ServiceChip` y `BlockServicesLine`. Mismo archivo, mismo idioma, sin barril nuevo.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn `^4.10.0` (ya inicializado — `components.json` presente) |
| Preset | `style: base-nova` · `baseColor: neutral` · `cssVariables: true` · `rsc: true` |
| Component library | `@base-ui/react ^1.5.0` (primitivas) + `@/components/ui` (shadcn) |
| Styling | Tailwind CSS v4 — config CSS-first en `app/globals.css`, **sin** `tailwind.config` |
| Icon library | `lucide-react ^1.17.0` — única librería de iconos, sin excepciones |
| Font (cuerpo) | `var(--font-sans)` → `--font-grotesk`, fallback `system-ui, sans-serif` |
| Font (títulos) | `var(--font-heading)` → `--font-archivo` (por `@layer base` sobre `h1,h2,h3`) |
| Toasts | `sonner ^2.0.7` |
| Helper de clases | `cn()` de `@/lib/utils` |
| Registries de terceros | **ninguno** (`components.json → "registries": {}`, verificado 2026-08-25) |
| Temas / paletas | claro-oscuro por `next-themes` + `data-palette` / `data-theme` en `<html>` ⇒ **cero hex hardcodeado**, todo por token |

**No existe `Toggle` ni `ToggleGroup` en `@/components/ui`** (verificado: el directorio tiene 17 archivos y ninguno es un toggle). El chip es un `<button type="button" aria-pressed>` a mano — el mismo idioma que ya usan `settings-client.tsx:2776-2793` (chips de servicio por profesional), `components/crm/tag-chip.tsx` y `canchas-manager.tsx:366`. **Prohibido `npx shadcn add`** en esta fase: si hiciera falta, es señal de desvío del contrato.

---

## Spacing Scale

Escala del proyecto, **solo múltiplos de 4** en el código nuevo:

| Token Tailwind | Value | Uso en esta fase |
|----------------|-------|------------------|
| `gap-1` | 4px | Icono ↔ texto dentro del chip |
| `space-y-1` | 4px | Separación entre la fila de horas, su error y la línea de servicios (contenedor ya existente) |
| `gap-x-2` | 8px | Separación horizontal entre chips |
| `gap-y-0` | 0 | Separación vertical entre filas de chips — **la da el área táctil de 44px del botón**, no un gap |
| `px-3` | 12px | Padding horizontal del pill |
| `mt-4` / `pt-4` | 16px | Línea guía de la card ↔ lista de días |
| `p-6` | 24px | Padding de la Card (existente) |

**Alturas:** pill visual `h-7` (28px) dentro de un botón `min-h-11 min-w-11` (44px). Icono `size-3` (12px).

**Radios:** `rounded-full` para chips (idéntico al molde de `settings-client.tsx:2783`). Sin radios nuevos.

**Excepciones declaradas (2):**

1. **El `gap-1.5` (6px) de la fila de horas** (:920) es preexistente y **no se toca** — sacar el stepper no es motivo para reescribir el espaciado de una fila que ya funciona. El código NUEVO no puede introducir `gap-1.5`.
2. **`text-xs` (12px) como tamaño del chip**, por debajo del mínimo de 16px de cuerpo en mobile. Es texto de control denso en un dashboard, no cuerpo de lectura; el archivo ya opera a 12px y 11px, y `OccupancyBadge` a 9px. Mitigación obligatoria: contraste **AA completo** (ver Color) y área táctil de 44px.

**Ganancia de espacio (D-12):** sacar el stepper libera ~74px de la fila (`w-7 + w-9 + w-7` + bordes). Ese ancho **va entero a los dos inputs `flex-1` de hora**: a 375px cada input pasa de ~78px a ~115px. No se agrega ningún control nuevo en esa fila.

---

## Typography

3 tamaños, 2 pesos. Line-heights = defaults de Tailwind.

| Role | Clase | Size | Weight | Line height | Dónde |
|------|-------|------|--------|-------------|-------|
| Control / dato | `text-sm` | 14px | 400 | 20px (1.43) | Inputs de hora (existente), botón "Guardar horarios" |
| Chip | `text-xs font-medium` | 12px | 500 | 16px (1.33) | Label de cada chip, chip "Cualquier servicio", trigger "Ver todos (N)" |
| Ayuda / estado | `text-xs` | 12px | 400 | 16px (1.33) | Línea guía de la card, "Cambios sin guardar", error del bloque |

**Prohibido en el código nuevo:** `text-base`, `text-lg`, `text-[11px]`, `text-[9px]`, `font-semibold`, `font-bold`, `italic`. El chip del día (`text-sm font-semibold`, :911) y el `h1` de la página ya existen y **no se tocan**.

**Tabular:** no aplica — la línea de servicios no muestra cifras (el único `tabular-nums` de la fila se va con el stepper).

---

## Color

Todo por custom property de `app/globals.css`. **Cero hex en componentes**: cada color como clase de token (`text-muted-foreground`, `bg-secondary`), nunca `text-neutral-500` ni `#6b6253`. Es lo que hace que funcione en 5 themes × 5 paletas × dark sin duplicar estilos.

| Role | Token | Light | Dark | Uso en esta fase |
|------|-------|-------|------|------------------|
| Dominant (60%) | `--background` / `--card` | `#f3ead8` / `#fbf3e3` | `#1a1714` / `#252019` | Superficie de la card y fondo del chip **sin** marcar (`bg-transparent`) |
| Secondary (30%) | `--secondary` | `#e9ddc4` | `#2e2820` | Relleno del chip **marcado** |
| Accent (10%) | `--primary` (por paleta, default `#d94a2b`) | por paleta | por paleta | **solo** lo que ya existe: chip del día abierto, "Agregar bloque", botón "Guardar horarios", `--ring` del foco |
| Warning | `--warning` | `#8a5a12` (4.97:1) | `#e6b53f` (8.75:1) | **exclusivamente** el indicador "Cambios sin guardar" |
| Destructive | `--destructive` | `#b23a26` | `#e05c43` | **no se usa** en el Bloque A; el diálogo de borrado (Bloque C) ya lo trae por `destructive` |
| Texto secundario | `--muted-foreground` | `#6b6253` | `#a99e8b` | Chip sin marcar, chip "Cualquier servicio", trigger, línea guía |
| Texto primario | `--foreground` | `#1a1714` | `#f3ead8` | Label del chip **marcado** |
| Borde | `--border` | `#d9ceb4` | `oklch(… /12%)` | Borde del chip sin marcar y del chip comodín (dashed) |

### El acento NO entra en la línea de servicios — y no es solo estética

**Divergencia declarada del molde de la Phase 8.** El chip de `settings-client.tsx:2783` pinta el estado marcado con `border-primary bg-primary/10 text-primary`. Acá **no se replica**, por dos razones que se suman:

1. **D-14 lo prohíbe:** chips neutros, peso secundario, que no compitan con los inputs de hora ni con el chip del día (que ya es `bg-primary`).
2. **`text-primary` a 12px sobre superficie clara NO pasa WCAG AA** (calculado sobre `--background: #f3ead8` con los valores reales de `app/globals.css:180-193`):

   | Paleta (light) | `--primary` | Contraste vs. crema | AA texto normal (4.5:1) |
   |---|---|---|---|
   | red (default) | `#d94a2b` | **3.54:1** | ✗ |
   | green | `#2f8a5b` | **3.59:1** | ✗ |
   | yellow | `#c8901a` | **2.36:1** | ✗ |
   | blue | `#2a5fa5` | 6.9:1 | ✓ |
   | ink | `#1a1714` | 13.2:1 | ✓ |

   O sea: copiar el molde metería un fallo de contraste en **tres de las cinco paletas, incluida la default**. (Deuda preexistente de `/equipo`, fuera del alcance de esta fase — se anota, no se arregla acá.)

**Tratamiento elegido — todo neutro, todo AA:**

| Estado | Clases | Contraste medido |
|--------|--------|------------------|
| Sin marcar | `border-border bg-transparent text-muted-foreground` | 4.99:1 (light) · 6.68:1 (dark) ✓ |
| Marcado | `border-foreground/30 bg-secondary text-foreground` | 13.1:1 (light) · 12.3:1 (dark) ✓ |

El cambio de estado lo llevan **tres portadores a la vez** (relleno + color de texto + icono `Check`), nunca el color solo. Y no depende de la paleta: `--secondary`, `--foreground`, `--muted-foreground` son tokens de tema, no de paleta.

**El warning queda reservado para, y SOLO para:** el indicador "Cambios sin guardar". No se usa en los chips, ni en el comodín, ni en el servicio inactivo — ninguno de esos es un problema.

---

## Bloque A — La línea de servicios (el corazón de la fase)

### Ubicación exacta

Dentro del `map` de bloques del día (:918-940), como **tercer hijo** del wrapper `div.space-y-1` que ya existe, después de la fila de horas y **después** de `block.error`:

```
div.space-y-1
├─ div.flex.items-center.gap-1.5      ← fila de horas (Bloque B: sin stepper)
├─ p.text-xs.text-red-400             ← error del bloque (existente, intacto)
└─ div[role=group]                    ← NUEVO: la línea de servicios
```

El error queda **pegado a los inputs que lo causaron**; los chips van abajo de todo. No se envuelve la fila existente en contenedores nuevos.

### Gates de visibilidad (en este orden)

| # | Condición | Resultado | Origen |
|---|-----------|-----------|--------|
| 1 | vertical `canchas` (`resolveVertical(business).key === 'canchas'`) | La línea **no se renderiza** en ninguna franja, y tampoco la línea guía | ver ↓ |
| 2 | catálogo de servicios vacío (0 activos y 0 mapeados) | La línea **no se renderiza** por franja; la card muestra **una** línea guía (ver Empty state) | decisión de este spec |
| 3 | resto | Se renderiza en **todas** las franjas del consultorio activo | D-08 |

> **Gate 1 — por qué canchas queda afuera.** En el vertical canchas un "servicio" **ES** una cancha (v0.13: cancha = tupla service + agenda propia + espacio), y su disponibilidad ya la modela su propia agenda. Ofrecer "qué canchas se dan en esta franja" duplicaría ese eje con otro que no lo decide. Mismo criterio y mismo precedente que D-18 de la Phase 8 (`settings-client.tsx:2745`, `equipo/page.tsx:18`). **Sin el gate, canchas queda en comodín igual** (0 filas en la puente) ⇒ cero regresión.

### Anatomía

```
┌ div.space-y-2  (bloques del día) ────────────────────────────────────────┐
│ ┌ div.space-y-1  (una franja) ──────────────────────────────────────────┐│
│ │ [ 09:00 ]  →  [ 13:00 ]                              [×]              ││ ← Bloque B
│ │ ┌ div[role=group].flex.flex-wrap.gap-x-2.gap-y-0 ──────────────────┐  ││
│ │ │ ( ✱ Cualquier servicio )                                         │  ││ ← 0 marcados
│ │ └──────────────────────────────────────────────────────────────────┘  ││
│ └───────────────────────────────────────────────────────────────────────┘│
│ ┌ div.space-y-1  (otra franja) ─────────────────────────────────────────┐│
│ │ [ 15:00 ]  →  [ 16:00 ]                              [×]              ││
│ │ ┌ div[role=group] ─────────────────────────────────────────────────┐  ││
│ │ │ ( ✓ Cerámica ) ( Torno ) ( Vitrofusión )   Ver todos (8)          │  ││ ← 1 marcado
│ │ └──────────────────────────────────────────────────────────────────┘  ││
│ └───────────────────────────────────────────────────────────────────────┘│
│  + Agregar bloque      ⧉ Copiar a otros días                             │
└──────────────────────────────────────────────────────────────────────────┘
```

Contenedor del grupo:

```tsx
<div
  role="group"
  aria-label={`Servicios de la franja de ${block.start_time} a ${block.end_time}`}
  className="flex flex-wrap items-center gap-x-2 gap-y-0"
>
```

`gap-y-0` es deliberado: cada chip es un botón de 44px que envuelve un pill de 28px, así que las filas ya quedan separadas por 16px de área táctil transparente. Meter `gap-y-2` daría 24px de aire y rompería el "peso secundario" de D-14.

### El chip (contrato exacto)

```tsx
function ServiceChip({ label, selected, inactive, onToggle, ariaLabel }: {...}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={ariaLabel}          // solo cuando el label visible no alcanza (servicio inactivo)
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors',
          selected
            ? 'border-foreground/30 bg-secondary text-foreground'
            : 'border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground',
          inactive && 'border-dashed',
        )}
      >
        {selected && <Check aria-hidden="true" className="size-3" />}
        {label}
      </span>
    </button>
  )
}
```

**Por qué botón externo + pill interno** (molde `components/crm/tag-chip.tsx:42-64`): el área táctil llega a 44×44 sin engordar el pill. Es la única forma de cumplir a la vez el mínimo táctil de CLAUDE.md y el "peso visual secundario" de D-14.

### Qué chips se muestran, y en qué orden

- **Orden:** `created_at` del servicio, ascendente. Es el mismo orden del molde de `/equipo` y el único estable: **prohibido reordenar por seleccionados**, porque los chips saltarían de lugar al togglear.
- **Se ofrecen** (D-11): los servicios **activos** del negocio.
- **Se muestran además**: los servicios **inactivos que siguen mapeados a ESA franja** (tratamiento propio, ver abajo). Un inactivo **no** mapeado no aparece nunca.
- **Un servicio marcado nunca se colapsa** (ver umbral).

### Umbral de "ver todos" — la decisión delegada por D-10

**Regla (determinista, sin medir el DOM):**

| Situación | Qué se muestra |
|-----------|----------------|
| Total de chips ≤ **6** | Todos. **Sin** trigger. |
| Total > 6, colapsado | **Todos los marcados** (nunca se ocultan) + chip comodín si corresponde + los no marcados en orden hasta llegar a **6 chips en total** + trigger `Ver todos (N)` |
| Total > 6, expandido | Todos los chips + trigger `Ver menos` |

- **6 chips** ≈ 2 filas a 375px: con la card en `p-6` el ancho útil es ~295px y un chip promedio (`px-3` + label de 8 caracteres a 12px) mide ~85px ⇒ 3 por fila. Es exactamente el "~2 filas" de D-10, expresado en una unidad que no depende de medir texto en runtime.
- **El comodín cuenta dentro de los 6.** Cuando aparece (0 marcados) la línea muestra el comodín + 5 servicios; es el peor caso de altura y sigue siendo 2 filas.
- **Los marcados nunca se cuentan para recortar.** Si un negocio de 10 servicios tiene 7 marcados en una franja, se ven los 7 y el trigger dice `Ver todos (10)`. **AGENDA-05 exige ver qué se da sin abrir nada**: colapsar un servicio declarado rompería el requisito. Lo único que se colapsa son las **opciones no elegidas**.
- **Expansión in situ**, en la misma línea. **Nada de modal, nada de popover** (D-08: abrir algo es justo lo que AGENDA-05 prohíbe).
- **Estado por franja**, en un `Set<string>` con clave `${day}-${idx}`. Se resetea al eliminar un bloque (los índices se corren) y al cambiar de consultorio. No persiste entre recargas.

Trigger:

```tsx
<button
  type="button"
  onClick={() => toggleExpanded(day, idx)}
  className="inline-flex min-h-11 items-center rounded-full px-1 text-xs font-medium text-muted-foreground underline underline-offset-2 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
>
  {expanded ? 'Ver menos' : `Ver todos (${total})`}
</button>
```

Neutro y subrayado a propósito: es navegación dentro de la línea, no una acción de configuración. El acento no entra acá (ver Color).

### El chip "Cualquier servicio" — la decisión delegada por D-16

**Es informativo. NO es clickeable.** Marcado explícito de la decisión:

- Un botón "Cualquier servicio" solo existiría cuando **no hay nada que limpiar** (0 marcados): sería un control cuyo único estado posible es el no-op. Un control que no hace nada enseña mal la regla.
- Y si fuera clickeable se leería como **una opción más entre los servicios** — exactamente la lectura que D-16 evita (el estado por defecto no es "una opción sin elegir", es un estado declarado).
- Para volver al comodín ya hay un camino, y es el que D-17 fijó: apagar todos los chips.

```tsx
<span role="status" className="inline-flex min-h-11 items-center">
  <span className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
    <Asterisk aria-hidden="true" className="size-3" />
    Cualquier servicio
  </span>
</span>
```

- **Borde punteado + icono `Asterisk`**: lo separa de un chip "sin marcar" (borde sólido, sin icono) sin usar color. El asterisco es el glifo universal de comodín; refuerza la regla sin agregar un texto de ayuda.
- **`min-h-11` también en el comodín** aunque no sea clickeable: la altura de la línea es idéntica con o sin él ⇒ **cero layout shift** cuando aparece o desaparece (D-17: reaparece al instante). Mismo criterio que el "Hace todo" inline de `settings-client.tsx:2769`.
- **`role="status"`**: cuando reaparece, un lector de pantalla lo anuncia. Es información, no interrupción — nunca `role="alert"`.
- **Nunca coexiste con un chip marcado.** Se renderiza si y solo si la franja tiene **0** servicios asignados (contando los inactivos mapeados: si queda uno inactivo mapeado, la franja **no** es comodín y el chip no se muestra — porque el motor tampoco la trata como comodín).

### El servicio desactivado que sigue mapeado — la decisión delegada por D-11

**Se muestra, marcado, con borde punteado y sufijo explícito. No se oculta.**

- Ocultarlo mentiría: la franja **sigue** restringida por ese mapeo (la fila de la puente existe y el helper la lee), y el dueño vería "Cualquier servicio"… que no es lo que pasa. Peor: no tendría forma de sacarlo desde ninguna pantalla.
- Atenuarlo con `opacity` está prohibido (baja el contraste por debajo de AA). La señal es **forma** (`border-dashed`) + **palabra** (`· inactivo`), nunca opacidad ni color.

| Propiedad | Valor |
|-----------|-------|
| Label visible | `{nombre} · inactivo` |
| Clases | las de `selected` **+** `border-dashed` |
| `aria-pressed` | `true` |
| `aria-label` | `{nombre} — servicio inactivo, todavía asignado a esta franja. Tocá para quitarlo.` |
| Click | **quita** el mapeo y el chip desaparece de la línea (un inactivo no mapeado no se ofrece) |
| Feedback | `toast.info` — es la única acción de la línea que no se puede deshacer desde esa pantalla |

Toast: `Quitaste "{nombre}" de esta franja. Como está inactivo, para volver a asignarlo reactivalo en Servicios.`

**Ningún otro toggle dispara toast.** El chip que se pinta ES el feedback (molde Phase 8, D-06).

### Empty state — negocio sin servicios cargados

Gate 2. **No se renderiza un empty state por franja.** Un negocio nuevo puede tener 7 días × 2 bloques = 14 franjas: repetir catorce veces "todavía no cargaste servicios" convierte una pantalla sana en un tablero de pendientes — exactamente lo que la fase evita (D-14, D-16).

En su lugar, **una sola línea** en la card, en la misma posición que la línea guía (son mutuamente excluyentes), arriba de la lista de días:

```tsx
<p className="text-xs text-muted-foreground">
  Cuando cargues {term.services.toLowerCase()} vas a poder elegir qué se da en cada franja.{' '}
  <Link href="/servicios" className="underline underline-offset-2">Ir a Servicios</Link>
</p>
```

### Línea guía (caso normal)

Misma posición, cuando **sí** hay servicios. Es el único texto explicativo de toda la fase: enseña la regla del comodín una vez, no una vez por franja.

```tsx
<p className="text-xs text-muted-foreground">
  Debajo de cada franja elegí qué {term.services.toLowerCase()} se dan. Si no elegís ninguno, esa franja sirve para todos.
</p>
```

### Estados del chip

| Estado | Tratamiento |
|--------|-------------|
| Default (sin marcar) | `border-border bg-transparent text-muted-foreground` |
| Hover (sin marcar) | `hover:border-foreground/30 hover:text-foreground` — solo color, `transition-colors` |
| Focus (teclado) | `focus-visible:ring-2 focus-visible:ring-ring` sobre el botón externo (el anillo abraza el área de 44px) |
| Marcado | `border-foreground/30 bg-secondary text-foreground` + icono `Check` |
| Marcado + hover | sin cambio — el estado ya es el feedback |
| Marcado + inactivo | igual que marcado + `border-dashed` + sufijo `· inactivo` |
| Guardando (`savingHours`) | **ninguno**. Los chips no se deshabilitan: el guardado toma un snapshot del estado al hacer click en "Guardar horarios" y el feedback ya lo da el botón ("Guardando..."). Deshabilitar solo los chips y no los inputs de hora sería una inconsistencia nueva. |
| Disabled | **no existe** en esta fase |
| Error de guardado | lo maneja `saveHours` con su `toast.error`; los chips no cambian de aspecto |

**Motion:** solo `transition-colors` (150ms default). **Prohibido** animar la aparición/desaparición del chip comodín (D-17: al instante), la expansión de "Ver todos", o cualquier propiedad de layout (`height`, `width`, `margin`).

**Carga:** ninguna. Los datos llegan server-rendered por props desde `page.tsx`. Sin skeleton, sin spinner.

### "Cambios sin guardar" (obligatorio — derivado de D-03)

D-03 fija un solo guardado y un solo "acordate de guardar". Hoy la pantalla **no tiene ninguna señal de estado sucio**: el botón "Guardar horarios" está siempre igual. Con horarios eso perdonaba (el input que quedó mal se ve); con el mapeo no: el dueño toca cuatro chips, se va, y la franja sigue en comodín — el estado al que vuelve es **visualmente idéntico** a no haber configurado nada, que es el modo de falla que este milestone entero viene evitando.

Contrato mínimo, sin mecanismos nuevos:

- Un booleano `hoursDirty` que ponen en `true` todos los mutadores del editor (`toggleDay`, `addBlock`, `removeBlock`, `updateBlock`, `applyCopyDay`, el toggle de chips) y que `saveHours` pone en `false` **después** de un guardado exitoso.
- Al lado del botón "Guardar horarios" (:1000-1004), dentro de un `flex items-center gap-4`:

```tsx
{hoursDirty && (
  <span role="status" className="text-xs text-warning">Cambios sin guardar</span>
)}
```

- **Sin** `beforeunload`, **sin** bloqueo de navegación, **sin** modal. Fuera de alcance.

---

## Bloque B — La fila del bloque sin el stepper (D-12)

**Se borra completo** el `div` del stepper (:941-965): los dos botones `Minus`/`Plus`, el `<input type="number">` y su contenedor. La fila queda:

```
[ input time flex-1 ]  →  [ input time flex-1 ]  [ × ]
```

- El `capacity` sale de `LocalBlock`, de `defaultBlock()`, de `addBlock()`, del objeto de `applyCopyDay()` y del payload del guardado. **No queda un campo oculto**: un valor que no se ve y no decide nada es exactamente lo que D-12 vino a sacar.
- El icono `Minus` deja de importarse si no lo usa nadie más en el archivo (verificar antes de borrar el import).
- La `×` de eliminar bloque conserva su `title="Eliminar bloque"`; se le **agrega** `aria-label="Eliminar bloque"` y `focus-visible:ring-2 focus-visible:ring-ring` (hoy no tiene foco visible y ahora queda como único botón de la fila). Es el único retoque permitido a esa fila.
- **No se rellena el espacio liberado con nada.** Va a los inputs de hora.

---

## Bloque C — Aviso de borrado de un servicio mapeado (D-07)

Se **amplía** `delDescription` (`settings-client.tsx:1233-1247`), rama **confirmable** únicamente. En la rama bloqueada no se agrega nada: si el borrado no va a ocurrir, avisar de sus consecuencias es ruido.

Frase que se **concatena** a la descripción existente, solo si `blocks > 0`:

```
Está asignado a {n} {n === 1 ? 'franja horaria' : 'franjas horarias'} de tu agenda: al eliminarlo, {n === 1 ? 'esa franja vuelve' : 'esas franjas vuelven'} a ofrecer cualquier servicio.
```

- **La copy no puede decir "se rompe" ni "quedan sin servicio".** Es el punto entero de D-07: la franja **pasa a ofrecer más**, no menos. Un borrado que amplía la oferta es contraintuitivo y por eso se avisa.
- El número sale del **pre-check** que el diálogo ya hace (`delInfo`), con un campo nuevo `blocks`. **No se cuenta en el cliente** ni se estima.
- **No se agrega un gate:** el borrado sigue permitido (D-07 descartó explícitamente bloquearlo).
- **Desactivar un servicio no muestra ninguna copy nueva** (D-11: el mapeo sobrevive). Donde eso se ve es en el editor, con el chip `· inactivo`.

---

## Bloque D — Copy del error `service_not_scheduled` (D-18)

Rama nueva en la cadena de `booking-client.tsx:394-407`, con el molde exacto de `any_professional_unsupported`:

```tsx
} else if (data?.error === 'service_not_scheduled') {
  toast.error('Ese horario ya no se ofrece para este servicio. Recargá la página y elegí otro.')
}
```

- **Ubicación:** antes del `else` genérico, junto a las otras ramas de dominio.
- **Por qué esa copy:** el error solo es alcanzable con una pestaña vieja o con el dueño cambiando la agenda mientras el cliente reserva. "Intentá de nuevo" es un reintento que **nunca** puede funcionar; la salida real es recargar y elegir otro horario.
- **Prohibido interpolar el mensaje de la base** (T-14-25 / T-13-09): la copy es del cliente, el código de error es lo único que viaja.
- No se toca el resto del flujo público (AGENDA-07 es de la Phase 20).

---

## Copywriting Contract

Idioma: **español rioplatense, voseo** ("elegí", "acordate", "reactivalo"). Sin emojis, sin signos de admiración.

**Terminología:** los sustantivos de eje salen de `resolveVertical(business).terminology` (`term.services` → "Servicios" / "Prestaciones" / "Canchas"), **nunca** hardcodeados. Regla de género heredada de la Phase 8: **evitar el artículo** antes de la interpolación (`qué {term.services.toLowerCase()} se dan` ✓ · `elegí los {term.services.toLowerCase()}` ✗).

**Excepción declarada — el chip "Cualquier servicio" va literal.** D-16 lo fijó textualmente, y `term` **solo tiene la forma plural**: no existe `term.service` singular, así que interpolar daría "Cualquier prestaciones". Inventar el singular obliga a tocar `lib/verticals.ts` = capacidad nueva, fuera de alcance. Se deja literal y se anota como deuda menor.

| Elemento | Copy |
|----------|------|
| **Primary CTA** | `Guardar horarios` — **el que ya existe**, sin cambios (D-03). Esta fase **no agrega ningún CTA**. |
| Línea guía de la card | `Debajo de cada franja elegí qué {term.services.toLowerCase()} se dan. Si no elegís ninguno, esa franja sirve para todos.` |
| Estado comodín (por franja) | `Cualquier servicio` |
| Servicio inactivo mapeado | `{nombre} · inactivo` |
| `aria-label` del inactivo | `{nombre} — servicio inactivo, todavía asignado a esta franja. Tocá para quitarlo.` |
| Trigger colapsado | `Ver todos ({N})` |
| Trigger expandido | `Ver menos` |
| Empty state (sin servicios) | `Cuando cargues {term.services.toLowerCase()} vas a poder elegir qué se da en cada franja.` + link `Ir a Servicios` |
| Estado sucio | `Cambios sin guardar` |
| Toast — quitar un inactivo | `Quitaste "{nombre}" de esta franja. Como está inactivo, para volver a asignarlo reactivalo en Servicios.` |
| Toast — copiar día **con** mapeo (D-05) | `Horario y {term.services.toLowerCase()} copiados · acordate de guardar` |
| Toast — copiar día **sin** mapeo | `Horario copiado · acordate de guardar` *(existente, intacto)* |
| Toast — guardado OK | `Horarios guardados` *(existente, intacto)* |
| Toast — guardado con error | copy propia del rechazo, **nunca** el mensaje de la base. Genérico: `No se pudieron guardar los horarios. Revisá tu conexión y probá de nuevo.` |
| **Confirmación destructiva** (D-07) | `¿Eliminar servicio?` + `… Está asignado a {n} franjas horarias de tu agenda: al eliminarlo, esas franjas vuelven a ofrecer cualquier servicio.` |
| **Error público** (D-18) | `Ese horario ya no se ofrece para este servicio. Recargá la página y elegí otro.` |

**Verificación de veracidad del copy (obligatoria).** Cada frase tiene que seguir siendo cierta **después** de la Phase 20:

- ✔ "esa franja sirve para todos" — es literalmente la regla del comodín de `lib/time-block-services.ts`.
- ✔ "vuelven a ofrecer cualquier servicio" — es lo que pasa cuando la fila de la puente desaparece.
- ✘ **Prohibido** escribir que una franja "no se puede reservar", "queda sin servicio" o "desaparece de tu página": ninguna de las tres es verdad con la regla del comodín.

**Acciones destructivas en el Bloque A: ninguna.** Apagar un chip es reversible en un click y no persiste hasta "Guardar horarios". La única acción con aviso es el borrado de servicio (Bloque C), que ya tiene su `ConfirmDialog` — **no se agrega una confirmación nueva**.

---

## Accesibilidad (no negociable)

- [ ] Chips: `<button type="button">` con `aria-pressed`; nombre accesible = nombre del servicio (o el `aria-label` completo en el caso inactivo).
- [ ] Grupo: `role="group"` + `aria-label="Servicios de la franja de {inicio} a {fin}"` — un lector de pantalla sabe de qué franja son los chips.
- [ ] Área táctil **44×44** en todo lo interactivo nuevo (`min-h-11 min-w-11` en el botón externo, `min-h-11` en el trigger).
- [ ] Foco visible en **todo** lo nuevo: `focus-visible:ring-2 focus-visible:ring-ring`. Incluye la `×` de eliminar bloque, que hoy no lo tiene.
- [ ] Orden de tabulación natural (DOM): hora inicio → hora fin → × → chips de la franja → siguiente franja. **Sin `tabIndex` positivos, sin focus trap.**
- [ ] Ningún estado se comunica **solo por color**: marcado lleva `Check` + relleno + color de texto; comodín lleva `Asterisk` + borde punteado + la palabra; inactivo lleva borde punteado + la palabra "inactivo".
- [ ] **Prohibido `opacity` para atenuar** cualquier chip: baja el contraste por debajo de AA.
- [ ] Iconos decorativos (`Check`, `Asterisk`) con `aria-hidden="true"`.
- [ ] Chip comodín e indicador de estado sucio con `role="status"` (polite), nunca `role="alert"`.
- [ ] Contraste verificado por token: chip sin marcar 4.99:1 (light) / 6.68:1 (dark); marcado 13.1:1 / 12.3:1; `--warning` 4.97:1 / 8.75:1. **Todos AA o mejor, en las 5 paletas** (ninguno depende de `--primary`).
- [ ] Jerarquía de headings intacta: la línea guía es un `<p>`, no un heading. La fase **no agrega ningún heading**.
- [ ] `hover` nunca es el único feedback: cada estado tiene equivalente visible por teclado y en touch.

---

## Responsive (mobile-first — 375px es el caso de diseño)

El contenedor del día ya es `sm:max-w-md` (:906): **el editor nunca pasa de 448px de ancho, ni en 1280px**. Eso hace que 375px y desktop sean casi el mismo problema, y por eso el umbral de 6 chips no necesita variar por breakpoint.

| Viewport | Ancho útil de la línea | Comportamiento |
|----------|------------------------|----------------|
| **375px** (mobile) | ~295px (375 − padding de página − `p-6` de la Card) | ~3 chips por fila · umbral 6 = 2 filas · los inputs de hora ganan los ~74px del stepper · **sin scroll horizontal, nunca** |
| **768px** (tablet) | 448px (`sm:max-w-md`) | ~4-5 chips por fila · el mismo umbral cae en 1-2 filas · sin cambios de layout |
| **1280px** (desktop) | 448px — **idéntico a 768** | Igual que tablet. El editor no se ensancha a propósito: una fila de horas de 1200px sería peor de leer. |

- **Cero media queries nuevas.** Si el layout necesitara un breakpoint, es señal de que se salió del patrón heredado.
- `flex-wrap` obligatorio en el grupo: los chips envuelven, nunca hacen scroll ni se truncan con ellipsis.
- `whitespace-nowrap` en el pill: un nombre largo ("Masaje descontracturante") ocupa toda la fila y envuelve la siguiente. **No se trunca el nombre de un servicio** — un nombre cortado en un chip marcado haría ilegible el estado declarado, que es justo lo que AGENDA-05 pide mostrar.
- El Drawer/Dialog de mobile **no se usa en esta fase** (D-08 descartó el modal), así que el bug de portal de `[[drawer-select-portal-fix]]` no aplica.

---

## Datos que la UI necesita (contrato con el read-path)

Para renderizar sin fetch en cliente, `app/(dashboard)/agenda/page.tsx` (:28, el `Promise.all`) necesita:

| Dato | Estado hoy | Qué falta |
|------|------------|-----------|
| `time_blocks` | ✔ con `id` | nada |
| `services` (prop existente) | ✔ **filtrado a `active = true`** — lo consume `NuevoTurnoForm` | **NO SE TOCA.** Cambiarle el filtro metería servicios inactivos en el alta manual = regresión. |
| **`time_block_services`** | ✘ | **query nueva**, `.eq('business_id', business.id)` + RLS (defensa en profundidad) |
| **Catálogo para los chips** | ✘ | **prop nueva** (ej. `serviceCatalog`): `id, name, active`, **sin** filtro de `active`, `order('created_at')`. Es lo único que puede nombrar a un servicio inactivo que sigue mapeado (D-11). |

El chip se arma de: `serviceCatalog.filter(s => s.active || estáMapeadoEnEstaFranja)`.

**La regla del comodín NO se reimplementa en la UI** (AGENDA-02). "Esta franja es comodín" sale de `lib/time-block-services.ts`, igual que la disponibilidad y el backstop; el componente solo pinta. Mismo criterio que `lib/agenda-occupancy.ts` con la ocupación.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | ninguno nuevo — se reusan `Card`, `Input`, `Button`, `Tabs` y el idioma de `<button aria-pressed>` ya instalados | not required |
| terceros | **ninguno** — `components.json → "registries": {}` verificado 2026-08-25 | not applicable |

Esta fase **no instala componentes** ni agrega dependencias. Iconos nuevos usados: `Check` (ya importado en `agenda-client.tsx:119`) y `Asterisk` (de `lucide-react`, misma librería, sin instalación).

---

## Trazabilidad decisión → contrato

| Decisión | Dónde se cumple en este spec |
|----------|------------------------------|
| D-03 un solo guardado | Primary CTA = "Guardar horarios" existente · sin autosave · "Cambios sin guardar" |
| D-05 copiar día arrastra el mapeo | Copy condicional del toast de `applyCopyDay` |
| D-07 aviso de borrado con el número | Bloque C + regla de veracidad ("ofrece más, no menos") |
| D-08 segunda línea bajo la fila | Bloque A · Ubicación exacta · sin modal ni popover |
| D-09 chips toggleables | Contrato exacto del chip + `aria-pressed` |
| D-10 wrap con "ver todos (N)" | Umbral = 6 chips, expansión in situ, marcados nunca colapsan |
| D-11 solo activos se ofrecen; el mapeado sobrevive | Qué chips se muestran + tratamiento del inactivo (dashed + `· inactivo`) |
| D-12 se elimina el stepper de cupo | Bloque B + los ~74px van a los inputs de hora |
| D-13 la grilla es el editor | Alcance: la vista semanal está fuera, explícitamente |
| D-14 peso visual secundario | Color: el acento no entra en la línea · `text-xs` · `gap-y-0` · sin color por servicio |
| D-15 el día colapsado no resume | El encabezado del día no se toca (fuera de alcance) |
| D-16 chip "Cualquier servicio" | Chip comodín informativo (no clickeable), dashed + `Asterisk`, `role="status"` |
| D-17 volver a comodín apagando todo | Sin confirmación, sin toast, reaparición **sin animación** y sin layout shift |
| D-18 copy de `service_not_scheduled` | Bloque D |
| D-19 `location_id` no se toca | El grupo se etiqueta por franja, no por sede; el editor ya opera por consultorio activo |

---

## Riesgos y notas para el planner

1. **La línea de servicios se renderiza dentro de un `map` de 7 días × N bloques.** Los helpers (`ServiceChip`, `BlockServicesLine`) van definidos **fuera** del componente `AgendaClient`, como `OccupancyBadge`, para no recrearse en cada render.
2. **`applyCopyDay` copia por valor** (D-05): el array de `service_ids` del bloque origen se clona, no se comparte referencia — dos días copiados que compartan el mismo array se corromperían al togglear uno.
3. **El estado de expandido se indexa por `${day}-${idx}`**, y `removeBlock` corre los índices: resetear el `Set` al eliminar un bloque y al cambiar de consultorio.
4. **`hoursDirty` tiene que cubrir los seis mutadores.** Si uno se olvida, el indicador miente — y un indicador de estado sucio que miente es peor que no tenerlo.
5. **Deuda anotada, NO se arregla acá:** los chips de `/equipo` (`settings-client.tsx:2783`) usan `text-primary`, que falla AA en las paletas red / green / yellow en light. Candidato a un todo de `ux`, fuera del alcance de la Phase 19.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
