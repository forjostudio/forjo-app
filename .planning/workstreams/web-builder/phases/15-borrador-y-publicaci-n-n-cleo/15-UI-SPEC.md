---
phase: 15
slug: borrador-y-publicacion-nucleo
status: draft
shadcn_initialized: true
preset: "shadcn base-nova · baseColor neutral · CSS variables (components.json)"
created: 2026-07-12
extends: "14-UI-SPEC.md (contrato visual del editor CMS — vigente, no se re-abre)"
---

# Phase 15 — Contrato de diseño (UI)

> Contrato visual y de interacción de la **barra de acciones publish** del editor CMS
> (`app/(dashboard)/web/`). Generado por gsd-ui-researcher, verificado por gsd-ui-checker.
>
> **Este SPEC EXTIENDE `14-UI-SPEC.md`, no lo reemplaza.** Escala de espaciado, tipografía, tokens de
> color, convención de toasts, patrón de dialogs y el toggle mobile Editar/Vista previa se heredan
> **tal cual** de Phase 14. Acá solo se especifica lo que cambia: la barra sticky pasa de
> `[estado] · [Guardar cambios]` a `[estado] — Descartar · Guardar · **Publicar**`, el indicador pasa
> de 2 a 3 estados, aparece el link "Ver mi web", dos dialogs nuevos y el toast de publicación.
>
> **Decisiones LOCKED en `15-CONTEXT.md` (D-01..D-16) — este SPEC las traduce a píxeles, NO las
> re-abre.** No hay autosave (D-01), Guardar es explícito, Publicar copia server-side (D-02), el
> estado se DERIVA del contenido (D-03), Publicar guarda primero (D-04), una sola barra sticky (D-05),
> 3 estados excluyentes (D-06), link en vez de toggle de preview (D-07), confirmación solo en la
> primera publicación (D-08/D-09), toast con acción (D-10), sin checklist pre-publicación (D-11),
> dialog destructivo al descartar (D-12/D-13), fotos huérfanas no se tocan (D-14).
>
> **No-goal:** el SPEC no re-estiliza el preview (es el `LandingRenderer` real, dueño v0.10/8.1/12), ni
> toca los paneles de sección, ni los controles de tema, ni la exposición en el nav (Phase 17).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn — **ya inicializado** (`components.json`: style `base-nova`, baseColor `neutral`, CSS variables, rsc:true) |
| Preset | `base-nova` / `neutral` / iconLibrary `lucide` — sin registry nuevo |
| Component library | primitivas `@base-ui/react` bajo los wrappers de `@/components/ui` |
| Icon library | `lucide-react` (sistema único — no mezclar sets) |
| Font | Chrome: `--font-sans` (Space Grotesk) · headings `--font-heading` (Archivo). El preview usa lo que resuelva `resolveLandingTheme` — intacto |
| Toasts | `sonner` (`toast.success` / `toast.error`) — ya montado en el layout |
| Dialogs | `@/components/ui/dialog` — el `<Dialog>` de confirm-on-exit de `web-client.tsx` es **código muerto** hoy y se recicla como base |

**Mandato de reuso (regla del proyecto + "espejar el patrón que ya existe): CERO dependencias nuevas
y CERO componentes nuevos.** Todo se arma con `Button` (`@/components/ui/button`, incl. el export
`buttonVariants`), `Dialog` y `sonner`, todos ya vendorizados. En `components/ui/` **NO hay
`dropdown-menu`** → por eso "Descartar" es un botón terciario inline y **no** un menú `···`
(decisión confirmada por el dev): un overflow menu obligaría a vendorizar un wrapper nuevo sobre
`@base-ui/react` Menu (focus trap, a11y, archivo nuevo) para un solo item.

---

## Spacing Scale

Heredada **verbatim de `14-UI-SPEC.md`** (todos múltiplos de 4, alineados con Tailwind y
`settings-client.tsx`). Los únicos valores que esta fase usa de verdad:

| Token | Valor | Uso en esta fase |
|-------|-------|------------------|
| xs | 4px | Gap ícono↔label dentro de un botón (`gap-1`), margen del punto de estado (`mr-1.5` = 6px, ver excepción) |
| sm | 8px | Gap entre los 3 botones de la barra (`gap-2`); gap entre las 2 filas de la barra en mobile (`gap-2`) |
| md | 12px | Padding vertical de la barra (`py-3`); gap indicador↔grupo de acciones en desktop (`gap-3`) |
| lg | 16px | Padding interno del aviso de empty-state (`p-4`) — ya existe |
| xl | 24px | Separación entre bloques de la columna editor (`space-y-6`) — ya existe |

Excepciones (declaradas, no arbitrarias):

- **`mr-1.5` (6px)** entre el punto de estado y su texto: **se preserva el valor que YA está en
  producción** (`web-client.tsx:294`). No es un valor nuevo — es continuidad literal del indicador
  existente. No introducir 6px en ningún lugar nuevo.
- **Touch targets ≥ 44px** (`min-h-11`) en los 3 botones de la barra y en el link "Ver mi web", en
  **mobile y desktop** (regla mobile de CLAUDE.md, no negociable). En desktop el `Button` default es
  `h-8` (32px) → la barra publish fuerza `min-h-11` explícito en las tres acciones. Es la acción más
  cara del editor: no se toca de casualidad ni se falla de precisión.
- La barra usa `border-t` + `bg-background/95` + `backdrop-blur` — mismos valores que hoy.

---

## Typography

Solo chrome (el preview tiene su propia escala). **Idéntica a `14-UI-SPEC.md`** — esta fase no
introduce ni un tamaño ni un peso nuevo.

| Rol | Tamaño | Peso | Line-height | Notas |
|-----|--------|------|-------------|-------|
| Título de página (h1) | 24px (`text-2xl`) | 700 (`font-bold`) | 1.2 | "Tu web" — sin cambios |
| Label de botón | 14px (`text-sm`) | 500 (`font-medium`) | 1.4 | **Heredado del `Button` vendorizado** (cva base `text-sm font-medium`). No es un peso nuevo de esta fase: es el componente tal cual |
| Indicador de estado | 12px (`text-xs`) | 400 | 1.4 | Los 3 estados usan el MISMO tamaño y peso — **el estado se distingue por color + glifo, nunca por bold** |
| Copy de dialog (título) | 18px (`DialogTitle` default) | 600 | 1.3 | Sin override |
| Copy de dialog (cuerpo) | 14px (`DialogDescription` default) | 400 | 1.5 | Sin override |
| Link "Ver mi web" | 14px (`text-sm`) | 500 | 1.4 | `buttonVariants({ variant: 'ghost' })` |

**Tamaños declarados: 4** (24 / 18 / 14 / 12) — mismos que Phase 14. **Pesos: 400 (cuerpo/meta) y
600/700 (títulos)**; el `font-medium` (500) de los botones es del primitivo vendorizado y **no se
altera** (misma nota que Phase 14 — esta fase no agrega un peso).

---

## Color

Todo sale de tokens CSS de `app/globals.css`. **Cero hex hardcodeado en el chrome** — con UNA
excepción declarada y justificada abajo (el token `--warning`, que hay que crear porque no existe).

| Rol | Token | Uso en esta fase |
|-----|-------|------------------|
| Dominante (60%) | `--background` (`#f3ead8` light / `#1a1714` dark) | Fondo de la barra (`bg-background/95`) |
| Secundario (30%) | `--secondary` / `--card` | Botón "Guardar" (`variant="secondary"`), superficies del editor |
| **Acento (10%)** | `--primary` (por paleta del negocio; default `#d94a2b` / `#e85c3f`) | **Botón "Publicar" (único CTA primario de la pantalla) + el punto del estado "Cambios sin guardar"** |
| Pendiente / warning | **`--warning` (NUEVO — ver abajo)** | Punto + texto del estado "Guardado — sin publicar" |
| Destructivo | `--destructive` (`#b23a26` / `#e05c43`) | **Solo dentro del dialog de descartar** (botón confirmatorio) y toasts de error |
| Muted | `--muted-foreground` (`#6b6253` / `#a99e8b`) | Texto del botón "Descartar" (ghost), estado "✓ Publicado", link "Ver mi web" |
| Border / ring | `--border` / `--ring` | `border-t` de la barra, focus rings |

**El acento queda reservado para: (a) el botón "Publicar" y (b) el punto de "Cambios sin guardar".**
Nada más. Concretamente: "Guardar" deja de ser primario (pasa a `secondary`) — **hay un solo CTA
primario por pantalla** y en esta fase ese CTA es Publicar. "Descartar" es `ghost` + texto muted:
**no lleva rojo en la barra**; el rojo aparece recién en el dialog, donde la acción es irreversible.

### Token nuevo: `--warning` (obligatorio — no existe hoy)

El estado "Guardado — sin publicar" es **pendiente**, no error ni éxito. En el dashboard no hay
token semántico de warning:

- `--crm-danger/-info/-success` están **scopeados a `.crm-shell`** → no aplican al panel del dueño.
- `--chart-3` (amarillo Bauhaus) es `#f4c543` en light. Sobre `--background: #f3ead8` da **≈1.5:1** →
  **reprueba WCAG AA y hasta el 3:1 de componentes**. Inusable como texto o como punto en light.
- `--primary` NO sirve: es la paleta del negocio (puede ser amarilla, verde o ink) y además ya está
  tomado por "Cambios sin guardar" → dos estados distintos del mismo color = indicador roto.

Se declara un token dark-aware, palette-independiente (los bloques `[data-palette=…]` no lo tocan,
igual que los `--chart-*`), en `app/globals.css`:

```css
@theme inline {
  --color-warning: var(--warning);   /* junto a los --color-* existentes */
}

:root, [data-theme='forjo'] {
  --warning: #8a5a12;   /* ámbar oscuro sobre crema #f3ead8 → 4.97:1 (AA texto normal) */
}
.dark {
  --warning: #e6b53f;   /* ámbar Bauhaus (= --chart-3 dark) sobre #1a1714 → 8.75:1 (AAA) */
}
```

Uso: `text-warning` + `bg-warning` (para el punto). Es la deuda semántica que CLAUDE.md ya pedía
("paleta semántica obligatoria: éxito / error / **advertencia (amber)** / info") — se salda acá con
3 líneas, sin tocar ninguna paleta ni el CRM.

**Contraste (WCAG AA — no negociable):**

| Par | Light | Dark | Veredicto |
|-----|-------|------|-----------|
| `--warning` sobre `--background` | #8a5a12 / #f3ead8 → **4.97:1** | #e6b53f / #1a1714 → **8.75:1** | ✅ AA texto normal |
| `--primary` (default) sobre `--background` | #d94a2b / #f3ead8 → 4.6:1 | #e85c3f / #1a1714 → 5.9:1 | ✅ AA (ya en prod) |
| `--muted-foreground` sobre `--background` | #6b6253 / #f3ead8 → 5.5:1 | #a99e8b / #1a1714 → 7.2:1 | ✅ AA (ya en prod) |
| `--primary-foreground` sobre `--primary` (botón Publicar) | ya validado en globals.css | ídem | ✅ |

El punto de estado (`size-2`, 8px) va `aria-hidden="true"` y es **redundante**: el texto contiguo
comunica el estado completo. Aun así ambos puntos usan colores que pasan ≥3:1, así que también se
sostienen como componente no textual.

---

## Component Contracts

### 1. Modelo de estado (de dónde salen los 3 estados)

`page.tsx` pasa **dos** configs (hoy pasa uno):

| Prop | Origen | Para qué |
|------|--------|----------|
| `initialDraft` | `businesses.landing_draft` (crudo) | Semilla del borrador en memoria + baseline "lo guardado" |
| `publishedConfig` | `businesses.landing_config` (crudo) | Baseline "lo publicado" + **`null` ⇒ nunca publicó** (dispara go-live y el aviso) |

En el cliente (`web-client.tsx`), con el `isDirty` de `lib/landing/editor-draft.ts` (deep-compare):

```
unsaved      = isDirty(draft, savedBaseline)                        // memoria ≠ landing_draft
neverPublished = publishedConfig === null                            // D-08 (go-live)
unpublished  = neverPublished || isDirty(savedBaseline, publishedBaseline)
```

Los 3 estados son **excluyentes y ordenados por precedencia** (D-06):

| # | Condición | Indicador |
|---|-----------|-----------|
| 1 | `unsaved` | `● Cambios sin guardar` |
| 2 | `!unsaved && unpublished` | `● Guardado — sin publicar` |
| 3 | `!unsaved && !unpublished` | `✓ Publicado` |

Cero estado nuevo: los 3 se **derivan** del contenido (D-03). No hay flag ni timestamp.

### 2. Barra sticky de acciones (D-05) — anatomía

Reemplaza el bloque `sticky bottom-0` actual de `web-client.tsx:285-305`. Conserva la clase
contenedora existente (`sticky bottom-0 border-t bg-background/95 py-3 backdrop-blur
supports-backdrop-filter:bg-background/80`) — la barra ya está bien anclada, solo cambia su contenido.

**Desktop (≥ `sm`, una fila):**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ● Guardado — sin publicar          [Descartar]  [Guardar]  [ Publicar ]  │
│ ↑ text-xs, aria-live="polite"       ghost/muted  secondary    default     │
└──────────────────────────────────────────────────────────────────────────┘
   flex items-center justify-between gap-3
   grupo de acciones: flex items-center gap-2
```

- **Orden visual izquierda→derecha: Descartar · Guardar · Publicar.** La acción más destructiva más
  lejos del pulgar/destino natural; el CTA primario al final, donde termina el barrido.
- **Descartar:** `variant="ghost"`, `className="min-h-11 text-muted-foreground hover:text-foreground"`.
  Sin ícono. **Sin rojo.**
- **Guardar:** `variant="secondary"`, `min-h-11`. Label: `Guardar` (no "Guardar cambios" — la barra
  ahora tiene 3 acciones y el label largo rompe el ritmo en 375px; el estado ya dice qué está en juego).
- **Publicar:** `variant="default"` (acento), `min-h-11`, `size="lg"` opcional. Único primario.

**Mobile (< `sm`, 375px — dos filas, confirmado):**

```
┌────────────────────────────────────────────┐
│ ● Guardado — sin publicar     Ver mi web ↗ │  fila 1: flex justify-between items-center
├────────────────────────────────────────────┤
│ [Descartar] [  Guardar  ] [   Publicar   ] │  fila 2: flex gap-2
│   ghost      secondary       primary       │  Descartar: shrink-0 (ancho por contenido)
│   auto        flex-1          flex-1       │  Guardar/Publicar: flex-1 (reparten el resto)
└────────────────────────────────────────────┘
   contenedor: flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3
```

- Las 3 acciones son `min-h-11` (44px) en mobile — obligatorio.
- "Ver mi web" vive en la **fila 1** en mobile (la barra no aguanta 4 controles en una línea a 375px)
  y en el **header, al lado del `<h1>`**, en desktop (ver §3).
- El texto del indicador **no se trunca**: si no entra, envuelve. Nunca `text-ellipsis` sobre un
  estado (el dueño tiene que poder leer "sin publicar" completo).

### 3. Link "Ver mi web" (D-07)

- **No es un toggle Borrador|Publicado.** El preview sigue mostrando SIEMPRE el borrador (Phase 14,
  D-01); lo publicado se ve en la web pública de verdad.
- Marcado: `<a href={'/' + business.slug} target="_blank" rel="noopener noreferrer">` con
  `className={cn(buttonVariants({ variant: 'ghost' }), 'min-h-11 text-muted-foreground')}` +
  ícono `ExternalLink` (lucide, `size-4`, `aria-hidden`).
- **Desktop:** en el `<header>`, alineado a la derecha del `<h1>Tu web</h1>`
  (`flex items-start justify-between`). **Mobile:** fila 1 de la barra.
- `aria-label="Ver mi web (abre en una pestaña nueva)"` — el `target="_blank"` se anuncia.
- **Es siempre visible y siempre habilitado**, incluso si el negocio nunca publicó: en ese caso
  muestra su página de reservas de siempre, y eso **es la verdad** (D-07). No se disfraza.

### 4. Matriz de estados × botones (contrato duro)

`busy = saving || publishing || discarding` · `uploading > 0` = hay imágenes subiendo (bloqueo L9 de
Phase 14, se preserva).

| Estado | Indicador | Descartar | Guardar | Publicar |
|--------|-----------|-----------|---------|----------|
| **1. Cambios sin guardar** (`unsaved`) | `● Cambios sin guardar` (accent) | **enabled** | **enabled** | **enabled** → *guarda y publica* (D-04) |
| **2. Guardado — sin publicar** (`!unsaved && unpublished`) | `● Guardado — sin publicar` (warning) | **enabled** | disabled | **enabled** |
| **3. Publicado** (`!unsaved && !unpublished`) | `✓ Publicado` (muted + `Check`) | disabled | disabled | disabled |
| **Uploads en vuelo** (`uploading > 0`, cualquier estado) | `Subiendo imágenes…` (muted) — **override transitorio** | disabled | disabled | disabled |
| **Guardando** (`saving`) | estado 1 congelado | disabled | **`Guardando…`** disabled | disabled |
| **Publicando** (`publishing`) | estado congelado | disabled | disabled | **`Publicando…`** disabled |
| **Descartando** (`discarding`) | estado congelado | **`Descartando…`** disabled | disabled | disabled |

Reglas que se derivan de la matriz y **NO son negociables**:

- **`Publicar` habilitado también en el estado 1** (D-04): si hay cambios sin guardar, publicar
  **encadena guardar-borrador → publicar**. Si el guardado falla, **NO publica** (toast del error del
  guardado, el estado no cambia). Motivo: publicar copia el borrador **de la DB**; sin esto el dueño
  publicaría algo distinto de lo que ve en el preview — exactamente la sorpresa que la fase elimina.
  **Prohibido deshabilitar Publicar por "hay cambios sin guardar"**: era un dead-end visual.
- **Durante el guardado implícito de D-04 el botón dice `Publicando…` todo el tiempo** — no parpadea
  `Guardando…` → `Publicando…`. Para el dueño es UNA acción.
- Los 4 estados transitorios (`Subiendo imágenes…`, `Guardando…`, `Publicando…`, `Descartando…`) **no
  son un 4to estado del indicador**: son overlays temporales sobre los 3 persistentes, que siguen
  siendo excluyentes (D-06).
- Los botones deshabilitados usan el estado nativo del `Button` (`disabled:opacity-50
  disabled:pointer-events-none`, ya en el cva) + `aria-disabled`. Nunca un `<div>` clickeable.
- El `beforeunload` existente sigue atado a `unsaved` (no a `unpublished`): salir con el borrador
  guardado-sin-publicar **no** es pérdida de datos y no debe molestar.

### 5. Indicador — marcado exacto

Mismo slot, mismo `aria-live="polite"` que hoy (`web-client.tsx:286-301`):

```tsx
<span className={cn('flex items-center text-xs', TONE[state])} aria-live="polite">
  {state === 'published'
    ? <Check aria-hidden className="mr-1.5 size-3.5" />
    : <span aria-hidden className={cn('mr-1.5 inline-block size-2 rounded-full', DOT[state])} />}
  {LABEL[state]}
</span>
```

| Estado | Glifo | Clase de tono | Clase del punto |
|--------|-------|---------------|-----------------|
| `unsaved` | punto | `text-primary` | `bg-primary` |
| `unpublished` | punto | `text-warning` | `bg-warning` |
| `published` | `Check` (lucide, `size-3.5`) | `text-muted-foreground` | — |

**Nunca comunicar el estado solo por color** (WCAG 1.4.1): cada estado tiene texto propio y el
publicado además cambia de glifo (punto → check).

### 6. Dialog de go-live (primera publicación · D-08/D-09)

- **Se muestra SOLO si `publishedConfig === null`** (nunca publicó). La condición se **deriva de los
  datos** → aparece exactamente una vez en la vida del negocio. Sin casilla "no volver a mostrar",
  sin preferencia persistida. **Las publicaciones siguientes NO abren dialog: publican de un click.**
- `<Dialog>` de `@/components/ui/dialog` (recicla el bloque muerto de confirm-on-exit).
- Copy **verbatim de D-09** (ver Copywriting). `{slug}` = `business.slug`.
- Footer: `[Cancelar]` (`variant="ghost"`) · `[Publicar]` (`variant="default"`, acento — **no
  destructivo**: publicar no destruye nada y es reversible editando y re-publicando).
- El botón de confirmación pasa a `Publicando…` + `disabled` mientras corre; el dialog **no se cierra
  antes** de la respuesta (si falla, se cierra y sale el toast de error; el borrador queda intacto).
- Focus: al abrir, foco en `[Publicar]`. Escape / click afuera / `[Cancelar]` = cancelar (no publica).

### 7. Dialog de descartar (destructivo · D-12/D-13)

- Se abre siempre que se toca "Descartar" (habilitado ⇒ hay algo que perder). Irreversible (no hay
  historial) → merece fricción. **Sin undo, sin toast-deshacer.**
- Footer: `[Seguir editando]` (`variant="ghost"`) · `[Descartar cambios]` (`variant="destructive"`).
  **Foco inicial en `[Seguir editando]`** (la opción segura), no en la destructiva.
- **Dos variantes de cuerpo**, según si el negocio publicó alguna vez:

| Condición | Cuerpo |
|-----------|--------|
| Ya publicó (`publishedConfig !== null`) | *"Vas a perder todos los cambios que no publicaste. Tu web al aire no se toca."* (verbatim D-12) |
| Nunca publicó (`publishedConfig === null`) | *"Vas a perder todos los cambios que hiciste. Tu web todavía no está publicada, así que forjo.studio/{slug} va a seguir mostrando tu página de reservas de siempre."* (D-13) |

- **Al descartar (D-13):** si nunca publicó, el editor vuelve a **sembrar `DEFAULT_LANDING_CONFIG`**
  (mismo camino de empty-state de Phase 14 §7) y reaparece el aviso. **Nunca queda un editor vacío**
  ni un estado "sin web" nuevo. Si ya publicó, el borrador vuelve a ser copia fiel de lo publicado y
  el indicador pasa a `✓ Publicado`.
- **Las fotos subidas quedan huérfanas** (D-14): Storage no se toca. La UI **no** menciona las fotos
  en el dialog (prometer una limpieza que no ocurre sería mentir; y el huérfano es benigno y
  owner-scoped bajo `landing-assets/{business_id}/`).

### 8. Feedback (toasts · D-10)

`sonner`, convención del repo. Duración por defecto (4s) salvo el de publicación (**6s**: tiene una
acción que el dueño tiene que alcanzar a tocar).

| Evento | Toast |
|--------|-------|
| Publicación **exitosa, primera vez** | `toast.success('Tu web está al aire', { duration: 6000, action: { label: 'Ver mi web', onClick: () => window.open('/' + business.slug, '_blank', 'noopener,noreferrer') } })` |
| Publicación **exitosa, siguientes** | Igual, con título `'Cambios publicados'` (mismo `action`) |
| Guardado exitoso | `toast.success('Borrador guardado')` — **cambia** respecto de Phase 14 ("Cambios guardados" ya no dice la verdad: guardar no publica) |
| Descartar (ya publicó) | `toast.success('Descartaste el borrador')` |
| Descartar (nunca publicó) | `toast.success('Descartaste el borrador. Volviste a la plantilla base.')` |
| Cualquier error | `toast.error(<copy del mapa de códigos>)` — ver Copywriting |

- El toast de publicación **no saca al dueño del editor** (D-10) y **no navega**: el link se abre en
  otra pestaña.
- Tras publicar, el indicador pasa a `✓ Publicado` y los 3 botones quedan disabled (estado 3).

### 9. Aviso de empty-state — copy CORREGIDO

El aviso actual (`web-client.tsx:255-263`) dice *"…se publican recién cuando tocás **Guardar
cambios**"* — **con esta fase eso pasa a ser FALSO** y hay que reemplazarlo. La condición de
visibilidad también cambia: hoy se ata a `initialConfig === null`; pasa a atarse a
**`publishedConfig === null`** (nunca publicó), que es el hecho relevante.

Dos variantes (misma caja `rounded-lg border border-primary/30 bg-primary/5 p-4`):

| Condición | Heading | Cuerpo |
|-----------|---------|--------|
| Nunca publicó **y** el borrador es el default sembrado (`isDirty(draft, DEFAULT_LANDING_CONFIG) === false`) | **Todavía no personalizaste tu web** | Arrancá desde la plantilla base y editá cada sección. **Guardar no publica nada**: los cambios salen al aire recién cuando tocás **Publicar**. Mientras tanto, forjo.studio/{slug} sigue mostrando tu página de reservas. |
| Nunca publicó **pero** hay un borrador con contenido (ej. lo armó el operador — Phase 16) | **Tu web todavía no está publicada** | Esto es un borrador: solo lo ves vos. Quien entra a forjo.studio/{slug} ve tu página de reservas de siempre. Revisalo, editá lo que quieras y tocá **Publicar** cuando esté listo. |
| Ya publicó | *(sin aviso)* | El indicador de la barra ya cuenta la historia |

---

## Copywriting Contract

Español rioplatense ("vos"), voz de la app (espeja `settings-client.tsx` y el editor de Phase 14).
Verbo + objeto en los CTA.

### Global / barra

| Element | Copy |
|---------|------|
| **Primary CTA** | **Publicar** |
| CTA secundario | Guardar |
| CTA terciario | Descartar |
| Link a la web pública | Ver mi web |
| Estado 1 | Cambios sin guardar |
| Estado 2 | Guardado — sin publicar |
| Estado 3 | Publicado |
| En vuelo — guardando | Guardando… |
| En vuelo — publicando | Publicando… |
| En vuelo — descartando | Descartando… |
| En vuelo — uploads | Subiendo imágenes… |
| aria-label del link | Ver mi web (abre en una pestaña nueva) |

### Empty state (reemplaza el copy vigente — ver §9)

| Element | Copy |
|---------|------|
| Empty state heading | Todavía no personalizaste tu web |
| Empty state body | Arrancá desde la plantilla base y editá cada sección. Guardar no publica nada: los cambios salen al aire recién cuando tocás **Publicar**. Mientras tanto, forjo.studio/{slug} sigue mostrando tu página de reservas. |
| Heading (borrador con contenido, sin publicar) | Tu web todavía no está publicada |
| Body (borrador con contenido, sin publicar) | Esto es un borrador: solo lo ves vos. Quien entra a forjo.studio/{slug} ve tu página de reservas de siempre. Revisalo, editá lo que quieras y tocá **Publicar** cuando esté listo. |

### Dialog de go-live (D-09 — LOCKED, reproducir verbatim)

| Element | Copy |
|---------|------|
| Título | Publicar tu web |
| Cuerpo | A partir de ahora, quien entre a forjo.studio/{slug} va a ver tu web en vez de la página de reservas simple. Las reservas siguen funcionando igual, dentro de tu web. |
| Confirmar | Publicar |
| Cancelar | Cancelar |

### Dialog de descartar (D-12/D-13 — destructivo)

| Element | Copy |
|---------|------|
| Título | ¿Descartar los cambios? |
| Cuerpo (ya publicó) | Vas a perder todos los cambios que no publicaste. Tu web al aire no se toca. |
| Cuerpo (nunca publicó) | Vas a perder todos los cambios que hiciste. Tu web todavía no está publicada, así que forjo.studio/{slug} va a seguir mostrando tu página de reservas de siempre. |
| Confirmar (destructivo) | Descartar cambios |
| Cancelar (foco inicial) | Seguir editando |

### Éxito

| Evento | Copy |
|--------|------|
| Primera publicación | Tu web está al aire · **acción:** Ver mi web |
| Publicaciones siguientes | Cambios publicados · **acción:** Ver mi web |
| Guardado | Borrador guardado |
| Descarte (ya publicó) | Descartaste el borrador |
| Descarte (nunca publicó) | Descartaste el borrador. Volviste a la plantilla base. |

### Errores — mapa código → toast (extiende `SAVE_ERROR_COPY` de `web-client.tsx:73-84`)

Un solo mapa compartido por las 3 acciones (`ACTION_ERROR_COPY`), porque las 3 espejan el mismo
patrón de Server Action owner-only (D-16) y devuelven el mismo `{ ok: false, error: '<snake>' }`.

| error code | Toast | Origen |
|------------|-------|--------|
| `cms_disabled` | El editor no está disponible en este momento. | heredado |
| `not_entitled` | Tu plan no incluye la edición de la web. Escribinos para activarla. | heredado |
| `unauthorized` | Tu sesión expiró. Volvé a iniciar sesión. | heredado |
| `no_business` | No encontramos tu negocio. Recargá la página. | heredado |
| `invalid_config` | Hay un dato inválido en tu web. Revisá los campos marcados. | heredado |
| `update_failed` | No se pudo guardar el borrador. Probá de nuevo. | heredado (copy ajustado: ahora se guarda un **borrador**) |
| `server_error` | Ocurrió un error. Probá de nuevo en unos segundos. | heredado (copy ajustado: ya no es solo "al guardar") |
| **`no_draft`** | No hay nada para publicar. Guardá algún cambio primero. | **nuevo** — publicar sin borrador en la DB |
| **`publish_failed`** | No se pudo publicar tu web. Probá de nuevo. | **nuevo** — falló la copia draft→published |
| **`discard_failed`** | No se pudo descartar el borrador. Probá de nuevo. | **nuevo** |
| **`invalid_draft`** | El borrador tiene un dato inválido y no se puede publicar. Revisá los campos marcados. | **nuevo** — el Zod estricto rechaza el borrador al publicar |

Fallback: cualquier código desconocido → `ACTION_ERROR_COPY.server_error` (patrón vigente).

**Regla de errores (CLAUDE.md):** todo error dice **qué pasó + qué hacer**. Ningún toast dice solo
"Ocurrió un error" sin salida.

---

## Responsive & Accessibility Contract

- **Mobile-first, base 375px.** La barra publish colapsa a 2 filas (§2). El toggle
  **Editar / Vista previa** de Phase 14 se mantiene **sin cambios** — la barra sticky vive dentro de
  la columna editor, así que en vista "Vista previa" no compite por espacio.
- **Breakpoint de la barra: `sm` (640px).** Debajo → 2 filas. (El split editor↔preview sigue en `lg`,
  como en Phase 14 — son breakpoints independientes y así queda.)
- **Touch targets ≥ 44px** (`min-h-11`) en Descartar / Guardar / Publicar / Ver mi web, en **todos**
  los viewports.
- **Focus visible en las 3 acciones y en el link:** el ring viene del cva del `Button`
  (`focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`); el `<a>` "Ver mi web"
  usa `buttonVariants()` → **hereda el mismo ring**. Prohibido `outline-none` sin reemplazo.
- **Orden de tabulación:** indicador (no focusable) → Descartar → Guardar → Publicar. En mobile, "Ver
  mi web" entra antes de Descartar (está en la fila de arriba) — coincide con el orden del DOM.
- **`aria-live="polite"`** en el slot del indicador (ya existe): cada transición de estado se anuncia
  al lector de pantalla. El punto va `aria-hidden`; el texto es la fuente de verdad.
- **Dialogs:** `Dialog` de shadcn ⇒ focus trap, `Escape` cierra, click afuera cierra, `aria-labelledby`
  / `aria-describedby` automáticos vía `DialogTitle` / `DialogDescription`. **No se anidan dialogs.**
  Foco inicial: `[Publicar]` en go-live, `[Seguir editando]` en descartar.
- **Estados obligatorios en cada interactivo:** default / hover / focus / active / disabled. Los 4
  primeros vienen del cva; `disabled` = `opacity-50` + `pointer-events-none` + `aria-disabled`.
- **Nunca hover como único feedback** (mobile): el estado de cada botón se lee del color/variante y
  del label, no del hover.
- **Sin animación decorativa.** Las únicas transiciones son las del `Button` (`transition-all`, ya en
  el cva) y la entrada del `Dialog` (≤ 200ms, `transform`/`opacity`). Si se agrega spinner en los
  estados en vuelo, `Loader2` de lucide con `animate-spin` — **opcional**: el cambio de label +
  `disabled` ya comunica el trabajo en curso (patrón vigente de `handleSave`).
- **`prefers-reduced-motion`:** respetado por las transiciones existentes; esta fase no agrega
  ninguna que necesite excepción.
- **Preview intacto:** la barra no envuelve al preview en `overflow`/`transform` (L7 de Phase 14) —
  el booking sigue siendo caja negra.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | `button`, `dialog`, `sonner` — **los tres ya vendorizados** en `@/components/ui` (Phase 14) | not required (ya en el repo; cero fetch nuevo) |
| third-party | **none** | not applicable |

- **Cero dependencias nuevas. Cero componentes nuevos.** Explícitamente NO se agrega `dropdown-menu`
  (no hay overflow menu — Descartar es inline).
- Íconos: solo `lucide-react` (`Check`, `ExternalLink`, y opcionalmente `Loader2`) — ya es la
  `iconLibrary` de `components.json`. No mezclar sets.
- Único cambio en `app/globals.css`: el token `--warning` (+ su `--color-warning` en `@theme inline`).
  No toca `:root` fuera de esa línea, ni los bloques `[data-palette=…]`, ni `.crm-shell`, ni el
  landing.
- No se declaró ningún registry de terceros → **gate de vetting: no aplica**.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
