---
phase: 17
slug: superficie-y-polish
status: draft
shadcn_initialized: true
preset: base-nova (baseColor neutral, CSS variables)
created: 2026-08-20
---

# Phase 17 — UI Design Contract

> Contrato visual y de interacción de las **cinco superficies del panel** que esta fase toca:
> el editor de servicio, la tarjeta de `/servicios`, el diálogo de edición, la columna del día de
> la agenda y la fila mobile de Finanzas. Generado por gsd-ui-researcher.
>
> **Ancla dura:** esta fase NO inventa lenguaje visual. Todo sale de patrones que ya existen en el
> repo, citados con archivo y línea. Donde el elemento nuevo se aparta del molde, el spec dice
> **en qué** y **por qué**. Si el executor duda entre reusar y crear, reusa.
>
> **Insumo bloqueado:** `17-CONTEXT.md` D-01…D-13 son decisiones tomadas. Este documento es la capa
> de abajo (tokens, escala, estados, responsive, motion, a11y). No reabre ninguna.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn `^4.10.0` — ya inicializado (`components.json`) |
| Preset | `base-nova`, baseColor `neutral`, CSS variables |
| Component library | `@base-ui/react` (primitivas sin estilo) |
| Icon library | `lucide-react` — **único sistema**, no se mezcla |
| Font | `--font-heading` = Archivo (títulos) · `--font-sans` = Space Grotesk (cuerpo) |
| Toasts | `sonner` (`toast.error` / `toast.success`) |
| Tema | `next-themes` + `data-palette` / `data-theme` en `<html>` → **cero hex suelto**, todo por token |

**Componentes reusados (NO crear nuevos):** `@/components/ui/button`, `input`, `label`, `badge`,
`dialog` (incluido `DialogFooter`, que ya existe y resuelve el footer anclado), `card`, `drawer`.

**Componentes nuevos autorizados en esta fase:** exactamente **dos**, ambos internos a su archivo:

| Nuevo | Dónde vive | Por qué no alcanza lo existente |
|---|---|---|
| `CapacityInlineControl` | `settings-client.tsx` | Combina label estático + stepper + confirmación diferida en una línea de datos. No hay precedente de "badge que además escribe". |
| `OccupancyBadge` | `agenda-client.tsx` | Hoy el contador del simultáneo está inline en el JSX (línea ~647). POLISH-09 exige que grupal y simultáneo tengan **el mismo** tratamiento → un solo componente que los dos consumen. |

---

## Spacing Scale

Escala del panel (múltiplos de 4, utilidades Tailwind). Se adopta tal cual; no se agregan valores.

| Token | Value | Uso en esta fase |
|-------|-------|------|
| — | 2px (`gap-0.5`, `space-y-0.5`) | separación entre las capas de un mismo grupo del explicador (eje / ejemplo / advertencia) |
| xs | 4px (`gap-1`, `p-1`) | gap del radiogroup, padding del contenedor de pills |
| sm | 8px (`gap-2`, `space-y-2`) | separación entre grupos del explicador, gap horizontal de la línea de datos |
| — | 10px (`space-y-2.5`) | ritmo vertical entre los tres grupos del explicador |
| — | 12px (`p-3`, `gap-3`, `space-y-3`) | padding de la tarjeta de servicio, cuerpo del diálogo, gap de la fila de Finanzas |
| md | 16px (`p-4`, `gap-4`) | padding del `DialogContent` (ya es el default del componente) |
| lg | 24px (`p-6`) | padding de las `Card` del panel (ya es el default) |

**Excepciones (targets táctiles):** `min-h-11` / `min-w-11` (44px) en todo control interactivo nuevo
**en mobile**, liberado desde `sm:` cuando el control convive con densidad de datos. Es el idioma que
el repo ya usa: `settings-client.tsx:255` (toggles de modo, `min-h-11` siempre) y
`settings-client.tsx:2047/2060` (`min-h-11 sm:min-h-0`). Ver §1.3 para el caso del stepper inline.

---

## Typography

Escala del panel. **No se agregan tamaños nuevos.** La jerarquía del explicador (§2) se construye con
peso + color + riel, no con un cuarto tamaño.

| Rol | Size | Weight | Color token | Uso en esta fase |
|------|------|--------|-------------|-----|
| Título de diálogo | 16px (`text-base`) | 500 | `--popover-foreground` | "Editar servicio" (`DialogTitle`, `font-heading`) |
| Body / control | 14px (`text-sm`) | 400 / 500 | `--foreground` | labels de los toggles, label de modo en la tarjeta, nombre del servicio |
| Label de campo | 12px (`text-xs`) | 400 | `--muted-foreground` | "Cómo se ocupa el cupo", "Cuántos lugares" |
| Data line | 12px (`text-xs`) | 400 | `--muted-foreground` | `30min · $5.000 · …` en la tarjeta |
| Meta / chip | 11px (`text-[11px]`) | 400/600 | según superficie | pills de sede, chips de turno, línea de grupo en la agenda |
| Micro-badge | 9px (`text-[9px]`) | 500 | `--warning` / `--muted-foreground` | contador de ocupación (molde de `agenda-client.tsx:648-655`) |

**Números:** todo contador o cupo lleva `tabular-nums` (el cambio de 9 a 10 no debe mover nada al
lado). El cupo es entero 2…99, **sin separador de miles** (el techo `MAX_CAPACITY = 99` lo hace
innecesario). El precio conserva `toLocaleString('es-AR')`.

Line-height: `leading-tight` en chips y líneas de grupo (ya es el default de los chips actuales),
default (~1.5) en el cuerpo del explicador — es texto para leer, no para escanear.

---

## Color

Sistema de tokens de `app/globals.css`. **Prohibido el hex suelto**: el acento cambia por
`data-palette` y el par claro/oscuro por `data-theme`.

| Rol | Token | Uso |
|------|-------|-------|
| Dominante (60%) | `--background` / `--foreground` | fondo del panel y texto principal |
| Secundario (30%) | `--card`, `--secondary`, `--muted`, `--border`, `--muted-foreground` | tarjeta de servicio (`bg-secondary/50`), contenedor del explicador, borde del stepper, textos de dato |
| Acento (10%) | `--primary` / `--primary-foreground` | ver lista reservada abajo |
| Aviso | `--warning` | ocupación llena, "sin seña", advertencias del explicador, bloqueo por espacio |
| Destructivo | `--destructive` | **solo** el borde transitorio del stepper cuando el guardado es rechazado (§1.4). No hay acción destructiva nueva en esta fase |

**`--primary` reservado exclusivamente para:**
- El toggle de modo **activo** en el radiogroup (`bg-primary text-primary-foreground`) — ya es así.
- El **riel izquierdo** del grupo del modo activo en el explicador (`border-l-primary`, §2.2).
- El botón **"Guardar"** de la edición inline y el del diálogo (`Button` variant default).
- El botón **"Agregar servicio"** del alta (§5).
- El **borde del stepper mientras la fila está sucia** (`border-primary/50`, §1.4) — es la misma
  señal de "hay algo pendiente" que el botón, en el elemento que la produjo.
- La superficie del chip de turno confirmado (`bg-primary/10 … border-primary/30`) — ya es así.

NUNCA para: el badge de modo en reposo, el contador de ocupación no lleno, ni el texto del explicador.

**Contraste (verificado en `globals.css`):** `--warning` = `#8a5a12` sobre crema → **4.97:1** (AA
texto normal) y `#e6b53f` sobre `#1a1714` → **8.75:1** (AAA). El micro-badge de 9px es texto pequeño
en negrita sobre `bg-warning/10`: **el color del texto va en `--warning` puro, nunca a opacidad**, y
el badge SIEMPRE lleva además un icono (`Users`) y la palabra ("lleno" / "sin seña") — el color no es
el único portador del significado.

---

## 1. `CapacityInlineControl` — el badge que además escribe (D-07 + D-08)

> **La pieza de más riesgo de la fase.** No existe nada igual en el design system: un dato de la línea
> de datos que además es un control de escritura. Todo lo de abajo es prescriptivo.

### 1.1 Dónde vive y qué reemplaza

En la tarjeta de `/servicios` (`settings-client.tsx:1730-1746`) la línea de datos es hoy:

```
<p class="text-xs text-muted-foreground">30min · $5.000</p>
```

Pasa a ser un contenedor flexible que admite el control como **tercer dato**:

```
<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
  30min  ·  $5.000  ·  [ CapacityInlineControl ]
</div>
```

- El separador `·` es un `<span aria-hidden="true">` — no se lee dos veces en el lector de pantalla.
- **Servicios `individual`: no se renderiza nada** (D-07). La línea queda byte-idéntica a la de hoy.
- `flex-wrap` + `gap-y-1`: a 375px el control **baja a su propia línea** cuando no entra. Es
  deliberado (ver 1.3), no un accidente del wrap.
- La pill de alarma ("Sin cobertura") **no se toca**: sigue arriba, junto al nombre. Los dos
  registros quedan separados como fija D-07.

### 1.2 Composición

```
Clase grupal   [−][ 6 ][+]   lugares        (limpio)
Clase grupal   [−][ 7 ][+]   lugares  [Guardar]    (sucio)
```

| Parte | Marcado | Clases |
|---|---|---|
| Label de modo | `<span>` | `font-medium text-foreground` (14px no: hereda `text-xs`; el peso y el color lo levantan sobre el resto de la línea) |
| Stepper | `<div role="group">` | `inline-flex items-center overflow-hidden rounded-md border bg-background` |
| Sufijo | `<span>` | hereda `text-xs text-muted-foreground` |
| Guardar | `<Button size="sm">` | `min-h-11 sm:min-h-0 min-w-24` |

**Labels de modo (D-03, fijos):** `Clase grupal` · `Recurso simultáneo`. Sufijo `lugares` en los dos
modos (no se pluraliza a "lugar": el piso es 2).

### 1.3 Targets táctiles — la tensión, resuelta

El proyecto exige ≥44×44px; la línea de datos es de 12px y densa. Los tres steppers del repo miden
32px de alto. Resolución **explícita**:

| Viewport | Stepper | Por qué |
|---|---|---|
| < 640px | botones `h-11 w-11`, input `h-11 w-14` | El control ya bajó a su propia línea por el `flex-wrap`: hay ancho libre, y ahí el piso de 44px se cumple **de verdad**, sin trucos de área invisible |
| ≥ 640px | botones `sm:h-8 sm:w-8`, input `sm:h-8 sm:w-10` | Vuelve al molde exacto de `agenda-client.tsx:870-895`. En desktop hay puntero, y la línea recupera su densidad |

Se descartó expandir el área táctil con un pseudo-elemento (`after:-inset-y-*`): deja el control
visualmente de 32px con un blanco de 44px que solapa la fila de arriba, y es un patrón que el repo no
usa en ningún lado. Preferimos el idioma que ya existe (`min-h-11 sm:min-h-0`, `settings-client.tsx:2047`).

### 1.4 Los cuatro estados de la fila

**① Reposo (limpio) — `value === saved`**

- Sin botón "Guardar" en el DOM.
- Stepper `border-border bg-background`; iconos `text-muted-foreground`, `hover:bg-secondary
  hover:text-foreground` (`transition-colors`, ≤300ms).
- `−` deshabilitado en el piso (2) y `+` en el techo (99): `disabled:pointer-events-none
  disabled:opacity-30` (molde `agenda-client.tsx:786`), más `title="El mínimo de este modo es 2
  lugares"` / `title="El máximo es 99 lugares"`. Un disabled sin explicación es un callejón.

**② Sucia — `value !== saved`**

- Aparece `[Guardar]` **a la derecha del sufijo**, dentro del mismo contenedor flex → si no entra,
  baja con el control, nunca se recorta.
- El stepper marca el pendiente sin mover nada: `border-primary/50`.
- Entrada: `animate-in fade-in-0 slide-in-from-left-1 duration-150 motion-reduce:animate-none`
  (`tw-animate-css` ya está instalado; solo `opacity` + `transform`).
- **Salida sin animar** (unmount directo). Animar la salida exige presencia montada y no paga; se
  documenta como decisión, no como olvido.
- **Revertir = volver al número guardado.** No hay botón "Cancelar": si el dueño vuelve el número a
  6, la fila se limpia sola y el botón se va. Además, `Escape` con el foco dentro del grupo
  restaura `saved` y saca el botón.
- El número **se puede tipear** (mismo criterio que D-06): mientras el foco está adentro se acepta
  cualquier cosa, incluido el vacío; al salir (`onBlur`) se normaliza al piso del modo. Molde
  literal: el `NumberField` de `app/(dashboard)/web/_sections/section-forms.tsx` (~130-185), que ya
  implementa `text` local + commit en `onBlur`. **Reusar esa lógica, no reescribirla.**

**③ Guardando**

- Botón `disabled` + `aria-busy="true"`, texto `Guardando…` (patrón de la casa:
  `settings-client.tsx:1866`). El `min-w-24` (96px) evita que la fila se reacomode al cambiar la
  etiqueta.
- Stepper e input `disabled` mientras vuela el request → **una tarjeta = un request en vuelo**. El
  estado es **por tarjeta** (`savingCapacityId: string | null` o un `Set`), nunca global: varias
  tarjetas de cupo pueden estar en pantalla y guardar una no puede congelar las otras.
- Sin spinner: el cambio de etiqueta + `disabled` ya es el feedback, y no introduce un elemento
  animado nuevo en una línea de 12px.

**④ Rechazada**

- **El número vuelve al valor anterior** (`saved`) apenas llega el error. Como queda limpio, el botón
  desaparece: no hay estado zombi "sucio pero fallado".
- **Dónde vive el mensaje, sin empujar la tarjeta:** en un `toast.error` de `sonner` (canal principal,
  **cero** desplazamiento de layout) + una marca en el elemento que falló: el stepper toma
  `border-destructive` y `aria-invalid="true"` durante ~4s (mismo lifetime del toast) y vuelve solo
  con `transition-colors`. **Prohibido** insertar un `<p>` de error dentro de la tarjeta: empuja la
  cobertura y las pills de sede de todas las tarjetas de abajo.
- **La copy es propia y fija. NUNCA se interpola `error.message` ni el nombre del servicio**
  (T-14-25 / T-13-09). Ver §7.

### 1.5 Contrato de escritura

El payload del guardado inline es **exactamente `{ capacity }`**. Nada más. Es **higiene, no un
requisito de corrección**: el motivo verdadero está abajo, medido.

**Medido contra el Postgres local (2026-08-20), en transacción con ROLLBACK y con control:**

| Prueba | Resultado |
|---|---|
| Trigger testigo `BEFORE UPDATE OF capacity_mode`, `SET capacity_mode='group_class'` (**mismo valor**) + `capacity` | **dispara** |
| Mismo testigo, `SET capacity = 8` (payload mínimo) | **no dispara** |
| Mismo testigo, `SET name = …` (renombrar) | **no dispara** |
| Sobre `group_class` con turno futuro vivo: `SET capacity_mode='group_class', capacity=7` (payload amplio) | **PASA** |
| Ídem, `SET capacity = 8` (payload mínimo) | **PASA** |
| **Control:** ídem, `SET capacity_mode='individual', capacity=1` (cambio real) | **RECHAZA** `service_mode_has_future_appointments` |

El control rechaza, así que el gate estaba activo y los dos "PASA" no son falsos negativos.

**Qué significa, y qué NO:**

- **Disparar ≠ rechazar.** El `UPDATE OF` del trigger es solo una optimización de despacho. El guard
  real es la primera línea del cuerpo (migr. **070, líneas 338-342**):
  `IF NEW."capacity_mode" IS NOT DISTINCT FROM OLD."capacity_mode" THEN RETURN NEW`.
- **El payload amplio es seguro.** `saveEditService` manda `capacity_mode` en **cada** guardado hoy,
  en producción, y no rebota — el guard lo deja salir temprano. Si el payload amplio rompiera, el
  editor estaría roto desde la 068. El comentario de la 070 dice exactamente para qué está el guard:
  *"renombrar un servicio con turnos futuros rebotaría"*.
- **Por qué igual mandamos el mínimo:** con `capacity_mode` en el `SET`, cada guardado del stepper
  despacha un trigger `SECURITY DEFINER` que solo puede terminar en `RETURN NEW`. Trabajo inútil por
  cada `+`/`−`, y una superficie de ejecución que el guardado de cupo no necesita tocar. Cuesta cero
  evitarlo.
- **Dependencia real que el executor tiene que conocer:** ese guard de no-cambio es la **única** razón
  por la que el payload amplio es seguro. Si alguna vez se lo saca de la función, **se rompen juntos
  el diálogo de edición y el stepper inline** — no es un detalle del camino nuevo, es un supuesto
  compartido por los dos caminos de escritura sobre `services`.
- **Cómo leer D-08 a la luz de esto.** *"Si se dispara, algo está mandando `capacity_mode` de más"*
  sigue siendo un buen olfato de diagnóstico: desde la tarjeta **no** se cambia el modo (D-09), así
  que un rechazo real por `service_mode_has_future_appointments` en el camino inline significa que
  alguien mandó un `capacity_mode` **distinto**, no meramente presente. Por eso ese error queda
  mapeado en §7 como fail-safe: no debería llegar nunca, y si llega es un bug del cliente.

- El `UPDATE` lleva `.eq('id', …).eq('business_id', business.id)` — defensa en profundidad, igual que
  `saveEditService` (`settings-client.tsx:790`).
- El piso por modo se aplica en cliente antes de mandar (`normalizeCapacity(n, minCapacityFor(mode))`),
  y el techo `MAX_CAPACITY = 99` evita el `22003 smallint out of range`.
- Desde la tarjeta **no se cambia el modo** (D-09): el label de modo es texto, no un control.

---

## 2. Bloque explicativo de los tres modos + radiogroup (D-01, D-02, D-13)

> Riesgo: que salga como nueve líneas de texto plano. La jerarquía de abajo es obligatoria.

### 2.1 El radiogroup, realineado (D-13)

Hoy: `inline-flex flex-wrap gap-1 rounded-md border border-border p-1` — con tres opciones que no
entran a 375px, el wrap deja la caja dentada y la tercera pill colgando.

Pasa a **grid determinista**, sin wrap posible:

```
<div role="radiogroup" class="grid grid-cols-1 gap-1 rounded-md border border-border p-1 sm:grid-cols-3">
```

- Botones: `w-full min-h-11 sm:min-h-0 sm:h-9 px-3 rounded text-sm font-medium` — conservan
  `bg-primary text-primary-foreground` en activo y `text-muted-foreground hover:text-foreground` en
  reposo, más el `focus-visible:ring-2 ring-ring ring-offset-1` que ya tienen.
- Mobile: tres filas de 44px, una opción por línea, cero ambigüedad y lectura vertical que **rima con
  los tres grupos del explicador de abajo**.
- Desktop: tres columnas iguales; "Recurso simultáneo" entra en una línea.
- El estado `blocked` (espacio compartido) no cambia: sigue visible, `disabled`,
  `cursor-not-allowed`, con su aviso `--warning` debajo (`settings-client.tsx:270-277`).
- **Solo se realinea este bloque.** El grupo "Se ofrece en" queda como está (D-13).

### 2.2 El explicador: tres grupos paralelos

Contenedor: `rounded-md border border-border bg-secondary/30 p-3 space-y-2.5`.
Los tres grupos, **siempre los tres visibles** (D-02), en el mismo orden que los toggles:
`Individual → Clase grupal → Recurso simultáneo`.

Cada grupo:

```
<div class="border-l-2 pl-3 space-y-0.5 [border-l-primary | border-l-border]">
  <p class="text-sm font-medium [text-foreground | text-muted-foreground]">Clase grupal</p>
  <p class="text-xs text-muted-foreground">Todos arrancan a la misma hora y comparten los lugares.</p>
  <p class="text-xs text-muted-foreground"><span class="font-medium text-foreground/80">Ej:</span> yoga de 9:00 — 6 personas, todas a las 9:00.</p>
  <p class="flex items-start gap-1.5 text-xs text-warning">
    <TriangleAlert aria-hidden class="w-3.5 h-3.5 flex-shrink-0 mt-px" />
    <span>Si elegís Recurso simultáneo por error, alguien puede reservar 9:30 y sumarse a mitad de clase.</span>
  </p>
</div>
```

**Las cuatro señales de jerarquía (y ninguna más):**

| Capa | Tamaño | Peso | Color | Otro |
|---|---|---|---|---|
| Label del modo | `text-sm` | 500 | `--foreground` (activo) / `--muted-foreground` (resto) | primera línea del grupo |
| Eje de conteo | `text-xs` | 400 | `--muted-foreground` | la definición: qué se cuenta |
| Ejemplo | `text-xs` | 400 | `--muted-foreground`, con `Ej:` en `text-foreground/80 font-medium` | el prefijo `Ej:` es el único ancla; sin itálica (la marca no la contempla) |
| Advertencia | `text-xs` | 400 | `--warning` + icono `TriangleAlert` | molde idéntico al aviso de espacio compartido ya en pantalla |

**Cómo se lee como tres grupos paralelos, y no como nueve líneas:**

1. **El riel izquierdo** (`border-l-2 pl-3`) es el dispositivo de paralelismo: fija un borde izquierdo
   común y encierra visualmente cada grupo. Las nueve líneas dejan de flotar.
2. **El label es la única línea de 14px** de cada grupo: tres anclas de igual peso, equiespaciadas.
3. **Las capas internas van a 2px** (`space-y-0.5`) y **los grupos a 10px** (`space-y-2.5`): la
   distancia entre grupos es 5× la distancia interna. El agrupamiento es proximidad, no color.
4. **La advertencia es la única línea con color y con icono** en cada grupo → cae siempre en la misma
   posición relativa (última), y el ojo la usa como cierre de grupo.

**Que `individual` sea más corto no rompe nada** (D-01 le saca la capa de advertencia): la simetría la
sostienen el riel + el label + el ritmo, no la altura. Aun así, `individual` **sí lleva ejemplo**
—D-01 solo le quita la advertencia—, así que quedan **3-3-4 líneas**, no 1-4-4. Se ve como una
familia, no como un huérfano al lado de dos bloques.

**El bloque es descriptivo, no interactivo.** Sin `onClick`, sin `role="button"`, sin `tabIndex`.
Leer no escribe (D-02). Cada grupo lleva `id="cap-mode-help-{modo}"` y cada `role="radio"` lo
referencia con `aria-describedby`: el lector de pantalla lee la explicación al enfocar la opción.

El estado activo se marca **solo con color** (riel + label). No cambia peso ni tamaño → **cero
reflow** al cambiar de modo.

### 2.3 El campo "Cuántos lugares" del editor (D-06)

- Se muestra si el modo ≠ `individual` (como hoy), `max-w-[11rem]`, con su `Label` visible.
- **Se puede vaciar.** Estado de texto local; `onChange` no normaliza. `onBlur` normaliza al piso del
  modo (`minCapacityFor`) y clampa a `MAX_CAPACITY`. Es el arreglo de `settings-client.tsx:289` y el
  molde a copiar es el `NumberField` de `web/_sections/section-forms.tsx`.
- `inputMode="numeric"` (teclado numérico en mobile), `tabular-nums`, spinners nativos ocultos
  (`[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`), alto `h-11 sm:h-8`.
- Al cambiar de modo el patch sigue llevando modo + cupo juntos (ya es así, `settings-client.tsx:253`):
  eso NO es un efecto de lectura, es el click en el control.

---

## 3. Diálogo alto: scroll interno + footer anclado (D-05)

> **Patrón transversal: se define una vez acá y vale para todo el panel.**

### 3.1 La regla

El componente base **`components/ui/dialog.tsx` NO se toca**. Los ~15 diálogos del panel quedan
byte-idénticos. El patrón se aplica **por caller**, con tres clases sobre el `DialogContent` que ya
existe (es un `grid` con `gap-4 p-4`):

```jsx
<DialogContent className="grid max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 sm:max-w-sm">
  <DialogHeader className="pb-3 pr-8">…</DialogHeader>

  <div className="-mx-4 min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 py-1">
    …cuerpo del formulario…
  </div>

  <DialogFooter className="mt-4">
    <Button …>Guardar</Button>
  </DialogFooter>
</DialogContent>
```

| Pieza | Valor | Por qué exactamente eso |
|---|---|---|
| `max-h` | `calc(100svh-2rem)` | `svh`, no `vh`: en mobile la barra de URL no puede comerse el borde. `-2rem` deja 16px de backdrop arriba y abajo (el popup está centrado con `-translate-y-1/2`) |
| Filas | `grid-rows-[auto_minmax(0,1fr)_auto]` | El `DialogContent` **ya es** `grid`. `minmax(0,1fr)` es lo que permite que la fila del medio encoja por debajo de su contenido |
| Cuerpo | `min-h-0 overflow-y-auto` | Sin `min-h-0` el hijo de un grid no encoge y el scroll nunca aparece |
| Sangrado | `-mx-4 px-4` | El área que scrollea llega al borde del diálogo: el scrollbar y los anillos de foco no quedan recortados por el padding |
| `gap-0` | reemplaza el `gap-4` del componente | Con `gap-4`, el `DialogFooter` (que ya trae `-mb-4`) quedaba flotando a 16px del fondo. El espaciado se recupera con `pb-3` en el header y `mt-4` en el footer |
| `overscroll-contain` | — | Llegar al final del cuerpo no arrastra el scroll de la página de atrás |
| `pr-8` en el header | — | El botón X es `absolute top-2 right-2`: el título no puede pasarle por abajo |

**Dónde cae el límite del scroll:** el **título queda fijo** (es el contexto de qué estás editando) y
el **footer queda fijo** (es la salida). Scrollea únicamente el cuerpo del formulario.

### 3.2 Sombra / fade en los bordes: **no**

Decisión escrita, no omisión:

- Abajo la frontera **ya está marcada**: `DialogFooter` trae `border-t` + `bg-muted/50` (ver
  `components/ui/dialog.tsx`), o sea una superficie distinta y una línea. No hace falta agregar nada.
- Arriba, el `pb-3` del header + el contenido cortado al ras alcanzan como señal.
- Un fade "solo cuando hay scroll" exige medir en JS (`scrollTop`/`ResizeObserver`) o
  `mask-image` con `scroll-timeline`, que este repo no usa en ningún lado. Es superficie nueva para
  auditar por un beneficio marginal en **un** diálogo.

### 3.3 Compatibilidad e inercia

- Un diálogo **corto** con estas clases se comporta igual que hoy: las filas `auto` toman su
  contenido, el cuerpo nunca desborda y el `max-h` queda inerte. Se puede aplicar sin condicionar.
- **Alcance en esta fase:** solo el diálogo **"Editar servicio"** (`settings-client.tsx:1826`). Eso
  cierra además un desborde que ya existía hoy: un negocio con muchas sedes llena "Se ofrece en" y
  empuja el "Guardar" fuera del viewport (D-05).
- El botón "Guardar" pasa a vivir dentro del `DialogFooter` (hoy es el último hijo suelto del
  `DialogContent`, `settings-client.tsx:1866`), con `min-h-11 sm:min-h-0` y `w-full sm:w-auto`.
- **Diálogos que quedan como precedente a migrar en fases futuras** (no en esta): "Copiar horario"
  (`agenda-client.tsx:1130`) y el roster en desktop (`agenda-client.tsx:1110`). Se anota, no se toca.

---

## 4. La columna del día de la agenda: slot grupal colapsado (D-10, D-11, D-12)

### 4.1 Fuente de datos (POLISH-09 — no es cosmético)

- **`capacityFor()` (`agenda-client.tsx:467`) se elimina.** El cupo sale de
  `serviceById.get(a.service_id)?.capacity`.
- **El modo se lee, no se deduce.** `capacity_mode === 'group_class'` — se borra
  `const isGroup = !isSimultaneous && capacityFor(...) > 1` (`:638`).
- El `roster` (`:530-537`) también deja de usar `capacityFor`: su contador pasa a
  `services.capacity`, y el título del roster suma el nombre del servicio.
- La guarda de holds vencidos (`isAlive`, `:493`) se aplica **también** al conteo grupal: un
  `pending_payment` con la seña expirada no ocupa lugar (precedente CR-01, `agenda-client.tsx:494`).
- **D-12:** turno sin `service_id` o con servicio irresoluble → se trata como `individual`: chip de
  hoy, sin contador y sin roster. No se inventa un número.

### 4.2 Agrupación

- **Clave del grupo: `date | time(HH:MM) | service_id`.** El `service_id` es obligatorio en la clave:
  el cupo es del **servicio**, así que dos clases distintas a la misma hora en agendas distintas no
  se pueden fusionar — el contador mentiría.
- Entran al grupo los turnos con `OCCUPYING_STATUSES` y hold vivo. Los cancelados/no-show **no
  cuentan**.
- **Un slot cuyos turnos son todos no-ocupantes igual se renderiza** (línea de grupo con `0/6` sobre
  la superficie neutra de `statusChip('cancelled')`): colapsar no puede hacer desaparecer un día que
  hoy muestra algo.
- Los grupos se ordenan **cronológicamente mezclados** con los chips individuales y simultáneos: la
  columna sigue leyéndose como una línea de tiempo.

### 4.3 La línea de grupo

```
09:00  Yoga            [👥 3/6]
```

```jsx
<button
  className={cn(chipClass, 'flex w-full items-center gap-1.5 text-left cursor-pointer hover:brightness-95 focus-visible:ring-2 …')}
  aria-label="Ver inscriptos de Yoga a las 09:00 del martes 25 de agosto — 3 de 6 lugares"
>
  <span className="font-semibold">09:00</span>
  <span className="min-w-0 flex-1 truncate">Yoga</span>
  <OccupancyBadge … />
</button>
```

- Superficie: `chipClass` con `statusChip('confirmed')` (`bg-primary/10 text-foreground
  border-primary/30`) — el grupo es una unidad, y el estado por persona ahora vive en el badge y en
  el roster.
- **Un solo elemento clickeable por slot** (D-10). Abre el roster igual que hoy (`setRosterSlot`),
  que pasa a llevar también `service_id`.
- **Alto fijo: una fila**, sin importar si hay 3 o 15 inscriptos. Es la razón de ser de la decisión:
  a 375px la grilla es `grid-cols-2` (~170px por columna) y seis chips apilados hacían impracticable
  la semana. El nombre del servicio va `truncate` dentro de un `min-w-0 flex-1`; el contador nunca se
  recorta (`flex-shrink-0`).
- El badge `Fijo` (abono) **no aplica** a la línea de grupo (es propiedad de un turno, no del slot):
  se ve en el roster.

### 4.4 `OccupancyBadge` — un solo componente para los dos modos

Molde: el badge `N/M lleno` que ya existe (`agenda-client.tsx:648-655`). Se extrae y lo consumen
**los dos** modos, que es lo que POLISH-09 viene a emparejar.

`Badge variant="outline"`, `h-4 gap-0.5 px-1 py-0 text-[9px] font-medium`, icono `Users`
(`size-2.5!`), cifras con `tabular-nums`.

**Un único badge, hasta dos segmentos, un solo color** (así el aviso no se duplica ni se abarata):

| Situación | Contenido | Tokens |
|---|---|---|
| Normal | `👥 3/6` | `border-border bg-secondary text-muted-foreground` |
| Lleno | `👥 6/6 lleno` | `border-warning/30 bg-warning/10 text-warning` |
| Hay seña pendiente (umbral **≥ 1**) | `👥 3/6 · 1 sin seña` | warning |
| Las dos a la vez | `👥 6/6 lleno · 1 sin seña` | warning |

- **Orden fijo: primero el cupo, después la plata.** El cupo es la pregunta de todos los días; el
  aviso de seña es la excepción.
- El contador de "sin seña" muestra el número siempre (`1 sin seña`, `2 sin seña`) — pluralizar solo
  el sustantivo sería inconsistente con `lugares`; "sin seña" queda invariable.
- **Por qué "sin seña" es parte de la decisión y no un extra:** colapsar el grupo esconde el color
  ámbar por-persona que hoy se ve en cada chip (`statusChip('pending_payment')`). Sin este segmento,
  la fase perdería información que hoy está en pantalla.
- `title` completo en el badge (`El cupo de este horario está completo (6 de 6)` / `1 inscripto sin
  la seña pagada`) y la misma información repetida en el `aria-label` del botón del grupo: en mobile
  no hay hover, así que el `title` **nunca** es el único portador.
- **Siempre visible, no solo al llenarse** (D-10). El simultáneo conserva su comportamiento actual
  (aparece solo al llenarse, porque el solape no se lee de un vistazo) pero **con este mismo
  componente y estos mismos tokens** — es la armonización que pide POLISH-09.

### 4.5 Recurso simultáneo e individual: sin cambios de estructura

- Simultáneo: sigue **sin agrupar**, un chip por turno con su horario propio, sin roster. Solo cambia
  que su badge ahora sale de `OccupancyBadge`.
- Individual: chip de hoy, tal cual.

---

## 5. Alta de servicio: el `+` pasa a ser un botón al final (CUPO-09)

Hoy el alta confirma con un `Button size="icon"` con un `Plus`, metido en `col-span-1` de la grilla
de campos (`settings-client.tsx:1799`) — o sea, el submit está **en el medio** del formulario, antes
del modo de cupo y de las sedes.

- El `+` **sale de la grilla**. Las tres columnas se rebalancean: `col-span-12 sm:col-span-6` /
  `sm:col-span-3` / `sm:col-span-3` (nombre / min. / precio), y en mobile cada campo ocupa la fila.
- Al **final del bloque** (después de `CapacityModeFields` y de "Se ofrece en"):

```jsx
<Button onClick={addService} disabled={!newService.name.trim() || savingNewSvc}
        className="w-full sm:w-auto min-h-11 sm:min-h-0">
  <Plus className="w-4 h-4" /> {savingNewSvc ? 'Agregando…' : 'Agregar servicio'}
</Button>
```

- Etiqueta **"Agregar servicio"** (verbo + sustantivo, regla de microcopy del proyecto) en vez de un
  "Guardar" pelado: cumple el criterio —el alta confirma con un botón rotulado al final del
  formulario— y no compite con el "Guardar" del diálogo de edición, que es otra operación.
- Estado `savingNewSvc` nuevo: hoy `addService` no deshabilita nada y admite doble submit.
- El botón **siempre visible**, nunca detrás de scroll (el bloque de alta vive en la página, no en un
  diálogo).

---

## 6. Finanzas mobile (POLISH-10)

`finances-client.tsx:890` esconde el servicio con `hidden sm:block`. La fila a 375px es:
`[fecha 80px] [cliente flex-1] [precio] [Pagado | Cobrar]`.

**Decisión: el servicio baja como segunda línea bajo el nombre del cliente, solo en mobile.** Ningún
dato se desplaza ni se saca.

```jsx
<div className="min-w-0 flex-1">
  <span className="block truncate font-medium">{appt.client_name}</span>
  {svc && <span className="block truncate text-xs text-muted-foreground sm:hidden">{svc}</span>}
</div>
```

- La columna `hidden sm:block` se **mantiene** para ≥640px: en desktop la fila de una línea ya
  funciona y no hay motivo para tocarla.
- Si el servicio es vacío (turno sin servicio resoluble), no se renderiza la línea — nada de filas
  con altura fantasma.
- La fila crece ~16px **solo en mobile**. Fecha, precio y la acción quedan donde están.
- **Para el SUMMARY:** no hubo que desplazar ningún otro dato.

---

## 7. Copywriting Contract

Español rioplatense (voseo), directo. Los labels de modo **no se traducen ni se renombran** (D-03).

### 7.1 Explicador de modos (D-01 — tres capas, ejemplos fijos para todos los verticales, D-04)

| Modo | Eje de conteo | Ejemplo | Advertencia |
|---|---|---|---|
| **Individual** | Un turno por vez. | Ej: un corte de pelo — una persona por horario. | *(ninguna, D-01)* |
| **Clase grupal** | Todos arrancan a la misma hora y comparten los lugares. | Ej: yoga de 9:00 — 6 personas, todas a las 9:00. | Si elegís Recurso simultáneo por error, alguien puede reservar 9:30 y sumarse a mitad de clase. |
| **Recurso simultáneo** | Entran escalonados y se cuentan los turnos que se pisan. | Ej: 3 camillas — una a las 9:00 y otra a las 9:30. | Si elegís Clase grupal por error, se te llena la agenda antes de tiempo: solo entran a la hora en punto. |

La línea actual que mete grupal y simultáneo en la misma bolsa (`settings-client.tsx:281-284`)
**se borra**: este bloque la reemplaza.

### 7.2 Controles

| Elemento | Copy |
|---|---|
| Label del radiogroup | `Cómo se ocupa el cupo` *(sin cambios)* |
| Label del campo del editor | `Cuántos lugares` *(sin cambios)* |
| Sufijo del control inline | `lugares` |
| CTA del alta | `Agregar servicio` / `Agregando…` |
| CTA del diálogo | `Guardar` / `Guardando…` *(sin cambios)* |
| CTA inline (sucio) | `Guardar` / `Guardando…` |
| `title` del `−` en el piso | `El mínimo de este modo es 2 lugares` |
| `title` del `+` en el techo | `El máximo es 99 lugares` |

### 7.3 Resultados y errores

| Situación | Canal | Copy |
|---|---|---|
| Cupo guardado desde la tarjeta | `toast.success` | `Cupo actualizado` |
| Servicio guardado desde el diálogo | `toast.success` | `Servicio actualizado` *(sin cambios)* |
| Servicio creado | `toast.success` | `Servicio agregado` |
| Error genérico del guardado inline | `toast.error` + borde `--destructive` + revert | `No pudimos guardar el cupo. Volvimos al valor anterior. Intentá de nuevo.` |
| Rechazo del gate de modo (**no debería llegar desde la tarjeta**, §1.5) | `toast.error` + revert | **La misma cadena fija que ya usa `saveEditService`** (`settings-client.tsx:809`). No se escribe una variante nueva. |
| Rechazo del gate de modo desde el diálogo | `toast.error` | *(sin cambios — ya existe desde 15-02, no se reescribe)* |

**Prohibido en cualquiera de los dos caminos:** interpolar `error.message`, el código de la base o el
nombre del servicio en la copy que ve el dueño (T-14-25 / T-13-09).

### 7.4 Contador de ocupación

| Estado | Copy |
|---|---|
| Normal | `3/6` |
| Lleno | `6/6 lleno` |
| Con seña pendiente | `3/6 · 1 sin seña` |
| Ambos | `6/6 lleno · 1 sin seña` |
| `title` lleno | `El cupo de este horario está completo (6 de 6)` |
| `title` sin seña | `1 inscripto sin la seña pagada` |

---

## 8. Motion

Regla del proyecto: ≤300ms, solo `transform`/`opacity`, nunca `width`/`height`/`margin`.

| Qué | Cómo |
|---|---|
| Entrada del botón "Guardar" inline | `animate-in fade-in-0 slide-in-from-left-1 duration-150 motion-reduce:animate-none` |
| Salida del botón | sin animación (unmount) — decisión escrita, ver §1.4② |
| Hover/active del stepper y de los toggles | `transition-colors` (default ~150ms) |
| Borde del stepper: limpio ↔ sucio ↔ error | `transition-colors`, 200ms |
| Diálogo | el `data-open:animate-in fade-in/zoom-in-95` que ya trae `DialogContent`. **No se agrega nada** |
| Scroll del cuerpo del diálogo | nativo, sin `scroll-behavior: smooth` |
| Línea de grupo de la agenda | `hover:brightness-95` + `transition-colors`, igual que los chips de hoy |

Nada de esta fase anima layout. El único elemento que entra/sale (`Guardar`) lo hace **dentro de un
contenedor `flex-wrap`**, así que su aparición puede empujar la línea a wrapear: por eso el control y
el botón viven en el mismo contenedor y el wrap ocurre **debajo** de la línea de datos, nunca sobre
el nombre del servicio.

---

## 9. Accesibilidad

- **Targets:** ≥44×44px en mobile en todo control nuevo (stepper, toggles, CTA, línea de grupo).
  Liberado desde `sm:` solo donde el spec lo dice explícitamente (§1.3).
- **Foco visible** en todo interactivo: `focus-visible:outline-none focus-visible:ring-2
  focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background` (idioma
  ya usado en los dos archivos).
- **Stepper:** `role="group" aria-label="Lugares de {servicio}"`; input `aria-label="Cantidad de
  lugares"` + `inputMode="numeric"`; botones `aria-label="Un lugar menos"` / `"Un lugar más"`.
  `aria-invalid="true"` mientras dura el estado rechazado.
- **Explicador ↔ radiogroup:** cada `role="radio"` con `aria-describedby="cap-mode-help-{modo}"`.
- **Línea de grupo de la agenda:** `aria-label` completo con servicio, hora, día y ocupación
  ("… — 3 de 6 lugares, 1 sin seña"). El `3/6` visual va acompañado de texto en el label accesible.
- **El color nunca solo:** lleno y sin-seña llevan siempre palabra + icono además del token de aviso.
- **Sin dependencia de hover:** `title` es refuerzo, jamás el único canal (no hay hover en mobile).
- **Jerarquía de headings intacta:** ninguna superficie de esta fase introduce headings nuevos.
- **`prefers-reduced-motion`:** `motion-reduce:animate-none` en la única animación de entrada.
- **Contraste:** todos los pares provienen de tokens ya calibrados AA en las 5 paletas × claro/oscuro.
  No se introduce ninguna combinación color/fondo nueva.

---

## 10. Moldes a reusar — mapa para el executor

> Objetivo: que se reuse, no que se reinvente. Si un elemento se aparta del molde, acá está escrito
> **en qué** y **por qué**.

| Molde existente | Archivo:línea | Lo usa | Se aparta en |
|---|---|---|---|
| Stepper de cupo por bloque | `app/(dashboard)/agenda/agenda-client.tsx:781-800` | `CapacityInlineControl` (contenedor bordeado, `overflow-hidden rounded-md border`, input central con bordes laterales, spinners ocultos, `disabled:opacity-30`) | Alto: `h-11 sm:h-8` en vez de `h-8` fijo (piso táctil, §1.3). Ancho del input: `w-14 sm:w-10` (cabe `99` con `tabular-nums` a 44px) |
| Stepper de días de anticipación | `app/(dashboard)/agenda/agenda-client.tsx:870-895` | mismo — es el gemelo más cercano en proporciones (`h-8 w-8` + input `w-12`) | igual que arriba |
| `NumberField` con commit en `onBlur` + `min-h-11 min-w-11` | `app/(dashboard)/web/_sections/section-forms.tsx:~130-185` | **La lógica de D-06** (texto local, vacío permitido, normalización al salir) y el piso táctil de 44px | Nada en la lógica. En lo visual usa `Button variant="outline"` sueltos con `gap-2`; el nuestro va en grupo bordeado continuo para leerse como **un** dato en la línea |
| Aviso `--warning` con `TriangleAlert` | `app/(dashboard)/settings/settings-client.tsx:270-277` | La capa de advertencia del explicador (§2.2) y el aviso "Nadie lo ofrece" | Nada: mismas clases, mismo icono, mismo tamaño |
| Badge `N/M lleno` | `app/(dashboard)/agenda/agenda-client.tsx:645-656` | `OccupancyBadge` (extracción literal) | Suma el estado neutro (`--secondary`) y el segundo segmento "sin seña" |
| `min-h-11 sm:min-h-0` | `app/(dashboard)/settings/settings-client.tsx:2047,2060` | El criterio de piso táctil liberado en desktop | — |
| Toggle de modo activo | `app/(dashboard)/settings/settings-client.tsx:253-260` | El radiogroup realineado | `flex-wrap` → `grid grid-cols-1 sm:grid-cols-3` (D-13) |
| `DialogFooter` | `components/ui/dialog.tsx` | El footer anclado del §3 | Nada: el componente ya bleedea a los bordes y trae `border-t` + `bg-muted/50` |
| Mapeo del rechazo del gate a copy propia | `app/(dashboard)/settings/settings-client.tsx:793-813` | El camino de escritura nuevo (§1.4④) | Reusa **la misma cadena**, no una variante |
| Roster (Dialog desktop / Drawer mobile) | `app/(dashboard)/agenda/agenda-client.tsx:1109-1127` | Sigue igual; solo cambia la fuente del contador | — |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | `button`, `input`, `label`, `badge`, `dialog`, `card`, `drawer` — **todos ya instalados** | not required |
| Terceros | ninguno | **no aplica** — esta fase no agrega ninguna dependencia ni bloque externo |

No se corre `npx shadcn add` en esta fase: no hay componente nuevo del registry. `tw-animate-css` ya
es dependencia del proyecto (`^1.4.0`).

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
