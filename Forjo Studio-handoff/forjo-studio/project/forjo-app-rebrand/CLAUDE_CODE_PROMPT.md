# Prompt para Claude Code — Cambios de Forjo (Finanzas + Themes + Confirmación)

> Pegá esto tal cual en Claude Code, con el repo de Forjo abierto y estos archivos del
> prototipo disponibles (o adjuntados): `Forjo App Rebrand.html`, `theme.css`,
> `themes.css` y `app.js`. El objetivo es replicar **exacto** lo que se ve en el
> prototipo. No inventes valores, colores, fuentes ni radios: salen de esos archivos.

Hay tres bloques de cambios independientes. Podés hacerlos por separado.

---

## A · Dashboard de FINANZAS (rediseño del header)

Reemplazá la grilla de 6 KPIs por **5 tarjetas**, con *Saldo del mes* destacado, y sumá
un **resumen del mes**. (Markup/clases de referencia en el HTML, sección
`#screen-finanzas`; estilos `.fin-hero`, `.fin-saldo`, `.fin-resumen`, `.rcard`.)

- **Eliminá** la tarjeta *Ticket promedio*.
- Las 5 tarjetas son: **Saldo del mes**, **Margen**, **Ingresos**, **Egresos**,
  **Cantidad de turnos**.
- Layout: `Saldo del mes` ocupa toda la columna izquierda (grande, número
  `clamp(40px,5.2vw,64px)`) y a la derecha una grilla 2×2 con Ingresos, Egresos, Margen
  y Cantidad de turnos. Grid: `grid-template-columns:1.55fr 1fr 1fr` / 2 filas; el saldo
  hace `grid-row:1 / span 2`. Responsive: en ≤1100px el saldo pasa a fila propia
  full-width y el resto a 2 columnas.
- Debajo, sección **«Resumen del mes»** con 3 cards (`.rcard`): **Servicios**, **Ventas**,
  **Gastos**, cada una con valor, subtítulo, delta vs. mes anterior y una barra de acento
  inferior de 3px del color correspondiente (verde / azul-acento / rojo).
- Los números cierran: Servicios + Ventas = Ingresos; Gastos = Egresos.

---

## B · Sistema de ESTILOS VISUALES (themes + paletas + tipografías)

Portá el sistema de themes a la app real (Next.js + Tailwind/shadcn + next-themes).
Fuentes de verdad: `theme.css` (base + paletas Forjo) y `themes.css` (los 3 themes +
variantes de paleta + tipografías) y la sección de theming de `app.js`.

### Modelo
Se controla con 3 atributos en `<html>` + la clase `.dark`:
- `data-theme="modern|spa|cyber"`  → ausente = **Forjo** (default actual).
- `data-palette="<id>"`            → acento; el set de ids depende del theme.
- `data-font="<id>"`               → pairing tipográfico; ausente = fuente nativa del theme.
- `.dark`                          → claro/oscuro (next-themes).

Cada theme reescribe TODO el set de tokens (neutros, acento, tipografías, radius) más
detalles scopeados (sombras, degradés, glows neón). Todo es variables CSS, así que
cambiar tokens cascadea solo por la UI.

### Tinte de fondo por paleta (`--tint`)
Para que la paleta **también combine con el fondo** (no sólo los objetos), cada theme
declara `--tint` y deriva sus neutros con `color-mix` sobre un base fijo, p.ej.
`--background: color-mix(in oklab,#eef1f7 95%, var(--tint))`. Cada variante de paleta
sólo redefine `--tint` (= su `--primary`) y los tokens de acento; los neutros se re-tiñen
solos. En **Spa** el degradé del `body` usa `var(--tint)`/`var(--accent)` en sus stops;
en **Cyber** la grilla, los glows radiales y las sombras de cards usan
`color-mix(... var(--primary)/var(--accent))`, así siguen al color elegido.

### CSS
1. **Copiá `themes.css` verbatim**, importado DESPUÉS de `globals.css` (o pegá su
   contenido al final). Contiene: el `@import` de Google Fonts (Plus Jakarta Sans,
   Cormorant Garamond, Mulish, Orbitron, Chakra Petch, Sora, Manrope), los bloques
   `[data-theme]` / `.dark[data-theme]`, las variantes `[data-theme="X"][data-palette="id"]`,
   los pairings `[data-font="id"]` y los flourishes por theme. En Next.js podés usar
   `next/font/google` y mapear a `--font-sans`/`--font-heading`; si no, dejá el `@import`.
2. Las paletas de **Forjo** ya viven en `theme.css` (`[data-palette="red|blue|yellow|green|ink"]`).
   No las dupliques.
3. **Especificidad**: el dark de cada theme usa `.dark[data-theme="..."]` (0,2,0) para
   ganarle a `[data-theme="..."]` (0,1,0); y `themes.css` carga DESPUÉS de la base.

### Datos (tal cual `app.js`)
```js
const THEME_PALETTES = {
  forjo:  ['red','blue','yellow','green','ink'],
  modern: ['indigo','emerald','violet','rose','amber'],
  spa:    ['sage','mauve','clay','ocean','lavender'],
  cyber:  ['cyan','magenta','lime','purple','amber'],
};
const THEME_DEFAULT_PAL = { forjo:'red', modern:'indigo', spa:'sage', cyber:'cyan' };
const FONTS = ['auto','geometrica','bauhaus','elegante','tech','suave']; // 'auto' = sin data-font
```
(Nombres visibles, metas y swatches de cada card están en los arrays `THEMES`,
`THEME_PALETTES`, `FONTS` de `app.js`. Reusalos para construir los selectores.)

### Lógica + persistencia (replicar el contrato)
- `setTheme(t)`: setea/borra `data-theme` (borra si `t==='forjo'`), guarda
  `localStorage['forjo-theme']`, **re-renderiza el set de paletas del theme** y aplica
  `setPalette(localStorage['forjo-pal-'+t] ?? THEME_DEFAULT_PAL[t])`.
- `setPalette(p)`: setea `data-palette`, guarda **por theme** en `localStorage['forjo-pal-'+themeActual]`.
- `setFont(f)`: setea/borra `data-font` (borra si `f==='auto'`), guarda `localStorage['forjo-font']`.
- `setMode('light'|'dark')`: toggle `.dark` (en la app real, next-themes), guarda `localStorage['forjo-mode']`.
- **Init**: `setTheme(... ?? 'forjo')` (aplica la paleta) → `setFont(... ?? 'auto')` → `setMode(...)`.
- Para repintar sin flash, envolvé el cambio en una clase `notransition` un frame (ver `flushNoTransition`).

Claves de localStorage: `forjo-theme`, `forjo-mode`, `forjo-font`, `forjo-pal-<theme>`.

### UI de selección (Configuración → Apariencia)
Tres secciones, en orden: **Estilo visual** (4 theme cards con mini-preview Aa + chips),
**Paleta de color** (cards de la paleta del theme activo, se re-renderizan al cambiar de
theme), **Tipografía** (cards con "Aa" en la fuente real de cada pairing; «Automática» =
nativa del theme). Markup/clases de referencia en el HTML (`.tcard`, `.pcard`,
`.fontcard`). Mantené layout y copys.

---

## C · Página de CONFIRMACIÓN de turno (pública) + enganchar «Continuar»

Rediseñá la confirmación de turno de la página pública según el prototipo (sección
`#screen-confirmacion`; estilos `.conf-*`). Es client-facing y usa los tokens, así que
hereda la paleta del negocio y es theme-aware.

Estructura:
- **Hero** (banda `--primary`) con logo + nombre del negocio + rubro/ubicación.
- **Check de éxito** (círculo `--primary`, sombra suave), saludo personalizado
  («¡Listo, {Nombre}!») y línea «Te esperamos el {fecha} a las {hora} hs.».
- **Chip de código** de reserva con botón **copiar** (al copiar muestra ✓ ~1.4s).
- **Tarjeta de detalle** (`.conf-card`) con filas iconificadas separadas por divisores:
  **Cuándo** (fecha · `hora · Duración Xmin`), **Servicio** (nombre + `min · precio`),
  **Profesional**, **Dirección** (+ link «Ver en el mapa →»), **A nombre de**
  (nombre · `tel · email`), **Política de cancelación**.
- **Botones de acción** apilados (`.conf-btn`, full-width, outline):
  **Agregar al calendario**, **Cómo llegar**, **Escribir al negocio** (variante `.wa`
  en verde WhatsApp `#25d366`).
- Nota final + footer «hecho con Forjo».

Conectá los datos reales del turno recién creado (cliente, servicio, fecha/hora, duración,
precio, profesional, dirección del negocio, código generado).

Acciones de los botones:
- **Agregar al calendario** → generar un `.ics` (o link Google Calendar) con el turno.
- **Cómo llegar** → abrir Google/Apple Maps con la dirección del negocio.
- **Escribir al negocio** → `https://wa.me/<telefono>` con un mensaje prearmado
  (negocio, servicio, fecha/hora, código).

### Enganchar el botón «Continuar» / «Confirmar turno»
En el flujo de reserva (paso 4 «Tus datos»), al **confirmar el turno** debe navegar a
esta página de confirmación pasándole los datos del turno creado (no a un estado
inline). Es decir: submit del form → crea el turno → redirige/navega a la vista de
confirmación con esos datos.

---

## Criterio de aceptación
- **Finanzas**: 5 tarjetas con Saldo destacado, sin Ticket promedio, + resumen
  Servicios/Ventas/Gastos con deltas y barra de acento.
- **Themes**: cambiar de theme cambia neutros, acento, tipografía, radius y **tiñe el
  fondo** según la paleta; cada theme muestra SUS paletas y recuerda la última por
  separado; la tipografía se puede sobreescribir y «Automática» vuelve a la nativa;
  claro/oscuro anda en los 4 (Cyber siempre oscuro/neón).
- **Confirmación**: página dedicada theme-aware con todos los bloques y los 3 botones
  funcionando; el «Continuar/Confirmar turno» del flujo aterriza ahí con los datos reales.
- Sin valores nuevos: todo sale de `theme.css` + `themes.css` + `app.js` + el HTML del prototipo.
