---
phase: 02-la-barra-inferior-y-m-s
fixed_at: 2026-10-09T09:40:00Z
source: .planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-VERIFICATION.md
gap: "Criterio 3 — Nada queda tapado (MOB-02), status partial"
base: a0d1940
head: 568d5d2
commits: 3
status: gap_cerrado_en_codigo
---

# Phase 2 — Cierre del gap del criterio 3

**Arreglado:** 2026-10-09 · **Base:** `a0d1940` · **HEAD:** `568d5d2`
**Gap de origen:** `02-VERIFICATION.md`, criterio 3 / MOB-02 en `partial`.

El gap **se reprodujo** tal como lo describe el verificador: los dos archivos existen, con la forma
exacta que reporta, y la forma de arreglo que propone es la correcta. No hubo que forzar nada ni
corregirle la aritmética.

**Tres commits atómicos:**

| # | SHA | Qué |
|---|---|---|
| 1 | `787b3f6` | `fix(02)`: los dos altos bloqueados al viewport descuentan la barra |
| 2 | `65b9543` | `fix(02)`: el candado 8 también vigila los altos fijados al viewport |
| 3 | `568d5d2` | `fix(02)`: el guion de UAT A.3 suma `/clients` y `/clinical-history` |

Los tres llevan el trailer `Co-Authored-By: Claude Opus 5 (1M context)` (verificado con
`git log -1 --format=%B` en cada uno; se usó `git commit -m` directo, no el helper del CLI).

---

## 1 · Los dos altos · `787b3f6`

**Archivos:** `app/(dashboard)/clients/clients-client.tsx:731` ·
`app/(dashboard)/clinical-history/clinical-history-client.tsx:32`. **Una sola clase por archivo**,
diff de 1 línea cada uno — nada más de esos dos archivos se tocó.

### Medición ANTES

```
$ grep -rnoE 'h-\[calc\(100vh[^]]*\]' "app/(dashboard)/"
app/(dashboard)/clients/clients-client.tsx:731:h-[calc(100vh-56px)]
app/(dashboard)/clinical-history/clinical-history-client.tsx:32:h-[calc(100vh-56px)]
app/(dashboard)/web/web-client.tsx:504:h-[calc(100vh-8rem)]
rc=0
```

Barrido más ancho (incluye `min-h-`, `max-h-`, `dvh`/`svh`), que es el que encontró un cuarto caso
que el verificador no había listado:

```
$ grep -rnoE '[a-z0-9:_-]*(min-|max-)?h-\[[^]]*100[dsv]?vh[^]]*\]' "app/(dashboard)/"
app/(dashboard)/clients/clients-client.tsx:731:h-[calc(100vh-56px-...)]        <- (ya arreglado al momento de este barrido)
app/(dashboard)/clinical-history/clinical-history-client.tsx:32:h-[calc(...)]  <- idem
app/(dashboard)/settings/settings-client.tsx:3290:max-h-[calc(100svh-2rem)]    <- CUARTO caso, no listado
app/(dashboard)/web/web-client.tsx:504:lg:max-h-[calc(100vh-8rem)]             <- con prefijo lg:
```

### El arreglo

```diff
-<div className="-m-4 sm:-m-6 lg:-m-8 flex h-[calc(100vh-56px)] lg:h-screen overflow-hidden bg-background">
+<div className="-m-4 sm:-m-6 lg:-m-8 flex h-[calc(100vh-56px-var(--panel-nav-h)-env(safe-area-inset-bottom,0px))] lg:h-screen overflow-hidden bg-background">
```

Idéntico en los dos archivos. Sin **ni un espacio** en el valor arbitrario. El `lg:h-screen`
preexistente se conserva (a ≥1024px no hay barra ni header de mobile) y el literal `56px` del header
**no se tokenizó**: es preexistente y queda fuera de alcance.

### Medición DESPUÉS, en el CSS del build (no en la fuente)

```
$ npm run build   →   rc 0
$ grep -ho 'height:calc(100vh[^;}]*' .next/static/chunks/*.css | sort -u
height:calc(100vh - ...)
height:calc(100vh - 3.5rem)
height:calc(100vh - 56px - var(--panel-nav-h) - env(safe-area-inset-bottom,0px))   <- EL ARREGLO
height:calc(100vh - 56px)
height:calc(100vh - 6.5rem)
height:calc(100vh - 8rem)
```

La clase **genera CSS de verdad** — era el riesgo real (un espacio adentro y Tailwind no la genera,
no avisa, y la fuente se ve bien igual). Medido sobre un `.next` **recreado desde cero** en el build
final, con los tres chunks `.css` fechados a las 09:37.

> ⚠ **TRAMPA PARA EL PRÓXIMO QUE MIRE ESTE CSS.** En la lista de arriba `height:calc(100vh - 56px)`
> **sigue apareciendo**, y **no** es código sin arreglar. Tailwind v4 (detección automática de
> fuentes, `@import "tailwindcss"` sin `@source` en `app/globals.css`) escanea **también los `.md`
> del repo**, y el string literal `calc(100vh-56px)` sobrevive en tres líneas de
> `02-VERIFICATION.md` y en un comentario de `test/panel-nav-chrome.test.ts`. Prueba:
>
> ```
> $ grep -rn 'calc(100vh-56px)' app components lib
> rc=1          (cero hits en código)
>
> $ grep -rc 'calc(100vh-56px)' .../02-VERIFICATION.md
> 3
> ```
>
> El `height:calc(100vh - ...)` de la misma lista es el mismo fenómeno: lo genera el
> `h-[calc(100vh-...)]` **con elipsis** que el verificador escribió en su frontmatter. Son reglas
> CSS muertas que ningún elemento usa. El criterio correcto no es "el string viejo desapareció del
> CSS", es **"el string viejo desapareció del código"** (`grep` sobre `app components lib` → cero) y
> **"el nuevo apareció en el CSS"** (arriba).

### La aritmética, confirmada

`--panel-nav-h: 3.5rem` (56px, `app/globals.css:80`). El `<main>` de `(dashboard)/layout.tsx:94`
lleva `pt-14` (56px) **y** `pb-[calc(var(--panel-nav-h)+env(safe-area-inset-bottom,0px))] lg:pb-0`.
El `-m-4 sm:-m-6 lg:-m-8` cancela el `p-4` del wrapper interno, **no** el padding del `<main>`.

```
documento = 56 (pt) + (100vh − 56) + 56 (pb) + inset = 100vh + 56px + inset
viewport  = 100vh
barra     = fixed bottom-0, 56px + inset, bg-card OPACO, z-30
```

⇒ en reposo (scrollTop 0) la banda inferior del elemento —que es `overflow-hidden` con scrollers
internos, así que su propio scroll **no** la revela— queda tapada. Sólo se alcanzaba encadenando el
scroll al documento, que es el doble scroll torpe que el criterio 3 existe para evitar. Con el
arreglo el elemento mide `100vh − 56 − 56 − inset` y su borde inferior cae exactamente en el borde
superior de la barra.

---

## 2 · `/web:504` — MEDIDO, y NO se toca

**Decisión: está bien como está. Cero cambios.** La cuenta, hecha antes de decidir:

El grep del verificador mostró `h-[calc(100vh-8rem)]`, pero eso es **el final de un token más
largo**. El token completo es:

```
$ sed -n '504p' "app/(dashboard)/web/web-client.tsx"
            'space-y-6 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2',
```

| Hecho | Consecuencia |
|---|---|
| La clase es **`lg:max-h-`**, con variante `lg:` | A **<1024px no aplica en absoluto**: la columna del editor fluye con el documento, y ahí la reserva del `<main>` (`pb` de 56px + inset) **sí** la empuja ⇒ nada queda tapado en mobile. |
| A **≥1024px** sí aplica | Pero a ≥1024px la barra es `lg:hidden` (`panel-bottom-nav.tsx`, caso 1 del candado) y el `<main>` suelta la reserva con `lg:pb-0` ⇒ **no hay nada que descontar**. Descontarla ahí dejaría un hueco de 56px, que es exactamente el defecto simétrico que `lg:pb-0` y `lg:h-screen` existen para evitar. |
| Es `max-h-`, no `h-` | No fija el alto: lo acota. Sin contenido suficiente, el elemento es más bajo. |
| `8rem` = 128px | Es el chrome de **desktop** (el `lg:p-8` del wrapper + la fila de tabs del editor), no el de mobile. Nada que ver con `--panel-nav-h`. |

Y además, CR-01 ya arregló en este mismo archivo (línea 560) la única parte de `/web` que **sí**
tocaba el borde inferior en mobile: `sticky bottom-[calc(var(--panel-nav-h)+env(…))] lg:bottom-0`.
Las dos piezas son coherentes entre sí.

**Veredicto:** el verificador no lo marcó, y midiéndolo tenía razón en no marcarlo. El candado nuevo
lo deja exento **por regla explícita y documentada** (variante `lg:`/`xl:`/`2xl:`), no por omisión.

### Hallazgo extra: un CUARTO caso que nadie había listado, también legítimo

`app/(dashboard)/settings/settings-client.tsx:3290` → `max-h-[calc(100svh-2rem)]`, **sin prefijo** y
**sin** descontar la barra. El barrido ancho lo encontró. Medido antes de decidir:

```
$ grep -nE 'fixed|z-\[?[0-9]' components/ui/dialog.tsx
102: "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 …"

$ grep -noE 'z-[0-9]+' components/dashboard/panel-bottom-nav.tsx
90:z-30
```

Es un `DialogContent`: monta en un **portal** con `fixed … z-50`, o sea **por encima** de la barra
(`z-30`), con su backdrop tapándola. No vive en el flujo del documento y la barra no puede cubrirlo.
Descontarle `--panel-nav-h` le encogería el alto sin motivo y le rompería el centrado documentado en
el propio archivo (`-translate-y-1/2` con 16px de backdrop arriba y abajo). **No se toca**, y el
candado lo exime por regla explícita (primitivas de overlay), no por lista a mano.

---

## 3 · El candado 8, extendido · `65b9543`

**Archivo:** `test/panel-nav-chrome.test.ts` (+76 líneas: un `it` nuevo y dos helpers). **Un solo
caso nuevo**, dentro del `describe('8 · el alto reservado para el chrome fijo es coherente')`.

**Por qué el candado que había no podía verlo:** su caso barre `sticky|fixed bottom-*`, o sea
**anclajes** al borde inferior. Esto es un **alto calculado** contra el viewport — otra forma del
mismo defecto de familia.

**La regla nueva:** bajo `app/(dashboard)`, todo alto arbitrario (`h-`, `min-h-`, `max-h-`)
calculado contra `100vh` / `100dvh` / `100svh` tiene que referenciar `var(--panel-nav-h)`. Dos
exenciones, **las dos con un hecho medido detrás** (arriba) y ninguna por comodidad:

1. variante `lg:` / `xl:` / `2xl:` ⇒ sólo aplica a ≥1024px, donde no hay chrome de mobile.
   **`sm:` y `md:` NO eximen**: a 768px la barra **sí** está, porque entra por `lg:hidden` y no por
   `md:hidden` (M-5, y es el caso 1 de este mismo archivo).
2. primitivas de overlay (`Dialog*`, `Sheet*`, `Drawer*`, `Popover*`, `Tooltip*`, `Command*`,
   `Modal*`), detectadas por la etiqueta JSX más cercana hacia atrás ⇒ portal con `fixed … z-50`
   por encima de la barra `z-30`.

**Puro:** `readdirSync` recursivo sobre el route group entero (no una lista de archivos, que habría
que mantener y a la que la próxima pantalla llegaría sin entrada) + `readFileSync`. Sin base, sin
navegador, sin reloj, sin fecha. Sin `matchAll` a propósito (`target: ES2017`).

**Guardas de honestidad: DOS, no una.**

- `hallados > 0` — si el barrido no encontrara ninguna altura de viewport (archivo movido, regex
  roto), el caso no midió nada;
- `exigidos > 0` — si las **exenciones** se comieran todos los casos, el caso también pasaría por
  vacío. Ésta es la que falta en la mayoría de los candados con exenciones, y es la que se probó en
  la segunda mutación de abajo.

Más la que ya traía el `describe`: `archivos.length > 10`.

### Prueba de que muerde — dirección 1: revertir un alto

Mutación: `clients-client.tsx:731` de vuelta a `h-[calc(100vh-56px)]`.

```
 FAIL  |pure| test/panel-nav-chrome.test.ts > 8 · el alto reservado para el chrome fijo es coherente > ninguna pantalla del panel fija su alto al viewport sin descontar el alto de la barra
AssertionError: app/(dashboard)/clients/clients-client.tsx: h-[calc(100vh-56px)] fija el alto al viewport sin descontar el alto de la barra: expected 'h-[calc(100vh-56px)]' to contain 'var(--panel-nav-h)'

Expected: "var(--panel-nav-h)"
Received: "h-[calc(100vh-56px)]"

 ❯ test/panel-nav-chrome.test.ts:572:13

 Test Files  1 failed (1)
      Tests  1 failed | 38 passed (39)
RC=1
```

### Prueba de que muerde — dirección 2: "arreglar" poniendo `lg:` donde no va

Es el modo de falla que la segunda guarda de honestidad cierra: si alguien silencia el candado
prefijando los dos altos con `lg:` (que los haría exentos), el barrido se quedaría sin un solo caso
exigido y pasaría por vacío. Mutación: `flex h-[calc(…)]` → `flex lg:h-[calc(…)]` en **los dos**
archivos.

```
 FAIL  |pure| test/panel-nav-chrome.test.ts > 8 · el alto reservado para el chrome fijo es coherente > ninguna pantalla del panel fija su alto al viewport sin descontar el alto de la barra
AssertionError: expected 0 to be greater than 0
 ❯ test/panel-nav-chrome.test.ts:580:22
    579|     expect(hallados).toBeGreaterThan(0)
    580|     expect(exigidos).toBeGreaterThan(0)
       |                      ^

 Test Files  1 failed (1)
      Tests  1 failed | 38 passed (39)
RC=1
```

**Las dos mutaciones se revirtieron con `git checkout --` y NUNCA se commitearon.** Verificado
después de cada una:

```
$ git status --porcelain -- app components lib
(sin salida)
```

### Verde

```
$ npx vitest run test/panel-nav-chrome.test.ts
 Test Files  1 passed (1)
      Tests  39 passed (39)
RC=0
```

El archivo pasa de **38 → 39** casos.

---

## 4 · El guion de UAT, bloque A.3 · `568d5d2`

**Archivo:** `.planning/.../02-04-SUMMARY.md`, bloque **A · Los cinco ítems irreducibles**, ítem 3
("Nada tapado"). +12 líneas, dos sub-bullets. **No se editó el UI-SPEC** (artefacto aprobado).

Por qué el guion no lo miraba: las cuatro pantallas que listaba (Finanzas, Negocio, Configuración,
final de Más) **fluyen con el documento**, así que las cubre el `pb` del `<main>` por construcción.
`/clients` es de **otra familia** — alto bloqueado al viewport con scrollers internos — y por eso
necesita su propio paso.

Lo añadido:

- **`/clients`** — abrir Clientes, scrollear hasta el final **DENTRO de la lista** (no arrastrando
  la página), confirmar que el **último cliente** queda completamente visible y **tocable** por
  encima de la barra; después **abrir una ficha** y repetir en el panel de detalle, que es el
  **segundo** scroller interno. Con el criterio de falsación explícito: *si hace falta arrastrar la
  página para ver la última fila, el arreglo no tomó efecto.*
- **`/clinical-history` si el rubro es `salud`** — mismo patrón de alto; la ruta se alcanza **por
  URL** (sin entrada de menú ni título en el header, WR-08).

---

## Gates

Todos medidos en `568d5d2`, el HEAD final.

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **rc 0**, sin líneas `error TS` (el compilador real, no `npx tsc`) |
| `npx vitest run` | **rc 0** · `Test Files 107 passed (107)` · `Tests 1683 passed \| 4 expected fail \| 1 skipped (1688)` |
| `npm run build` | **rc 0** (con `.next` recreado desde cero) |
| `npx eslint` sobre los 2 archivos de `app/` + el test | **rc 0**, sin salida ⇒ **cero hallazgos nuevos** |

**El piso de la suite sube de 1682 → 1683 casos** (+1: el candado nuevo). Los 107 archivos y los 4
"expected fail" intencionales no cambian. **Corrida limpia**: cero flakes del pool de workers en
esta sesión, y no hizo falta repetir ningún comando.

**Reloj al medir:** `9/10/2026, 09:34:39` (America/Argentina/Buenos_Aires, leído con `node -e`
porque en Git Bash el prefijo `TZ=` no se honra) ⇒ dentro de `[01:00, 23:30]`, así que los dos
canarios de reloj de la suite no interfieren. **El caso nuevo no lee el reloj**: es un barrido puro
de fuente.

⚠ Nota de entorno: el primer intento de build limpio fue `rm -rf .next && npm run build` y el `rm`
falló con `cannot remove '.next/dev/cache/turbopack/…': Directory not empty` porque el dev server
del puerto 80 tiene ese directorio tomado. El `&&` cortó la cadena, así que **el build no corrió en
ese intento** (el `rc 1` que se vio era del `rm`). Se repitió el build sin el `rm`; Next recreó
`.next` solo y salió **rc 0**. **El dev server no se mató.**

## Fronteras respetadas

```
$ git diff 49fa195..HEAD --stat -- lib/panel-history.ts lib/overlay-history.ts lib/dirty-history.ts
(sin salida)

$ git diff a0d1940..HEAD -- components/dashboard/sidebar.tsx | wc -l
0

$ git diff a0d1940..HEAD --stat
 .../02-la-barra-inferior-y-m-s/02-04-SUMMARY.md    | 12 ++++
 app/(dashboard)/clients/clients-client.tsx         |  2 +-
 .../clinical-history/clinical-history-client.tsx   |  2 +-
 test/panel-nav-chrome.test.ts                      | 76 ++++++++++++++++++++++
 4 files changed, 90 insertions(+), 2 deletions(-)
```

- **Cero** diff en los tres módulos de historial desde la base de la fase.
- **Cero** diff en `components/dashboard/sidebar.tsx` ⇒ `sidebarContent` y el bloque `hidden lg:flex`
  intactos.
- **Cero** `--no-verify`, cero `git stash`, cero cambio de rama, cero push, cero amend, cero revert.
- **Ningún requisito marcado como completo**: `REQUIREMENTS.md`, `STATE.md` y `ROADMAP.md` **no se
  tocaron**. MOB-01/02/03/07 siguen en `Pending`, como el dueño los dejó.
- Este archivo (`02-GAP-FIX.md`) queda **sin commitear**, a propósito.

## Discrepancias registradas, no arregladas

1. **El UI-SPEC no cubre esta familia de pantallas.** §10 dice *"el alto se reserva en UN SOLO
   lugar — el `<main>`"* y lista como criterio observable *"el último elemento de la pantalla más
   larga"* nombrando Finanzas y los formularios. La afirmación "un solo lugar" **es falsa para los
   layouts bloqueados al viewport**: el `pb` del `<main>` no los empuja, y hoy hay **tres** lugares
   que descuentan la barra (`<main>`, el `sticky` de `/web` por CR-01, y estos dos altos). No se
   editó el documento. Al reconciliarlo conviene reformular §10 como *"se reserva en el `<main>`
   para todo lo que fluye con el documento; lo que se bloquea al viewport o se ancla al borde
   inferior descuenta la misma var en su propia clase, y el candado 8 lo vigila"*.
2. **`/clinical-history` sigue sin título ni activo** (WR-08, fuera de alcance). El alto quedó
   arreglado, pero la ruta sigue siendo una pantalla viva sin chrome orientador.
3. **Ruido de CSS por documentación**, medido arriba: Tailwind v4 escanea los `.md` del repo y
   genera reglas muertas a partir de los ejemplos de clase escritos en los artefactos de planning
   (`height:calc(100vh - 56px)` y `height:calc(100vh - ...)` hoy). No afecta el render; sí **engaña
   a quien verifique el arreglo grepeando el CSS del build**, que es justo lo que el método manda
   hacer. Está documentado arriba para que el próximo no se coma la trampa.

## Lo que este cierre NO hace

**No cierra el criterio 3.** Cierra su parte de **código**. La parte que vale sigue pendiente y es
la misma de antes: **la UAT en un teléfono real**, con el bloque A.3 ya actualizado. Todo lo de acá
es aritmética sobre el código más CSS del build — **no se midió en un navegador**. La UAT lo
confirma o lo descarta en 30 segundos, y los otros 9 ítems de `human_verification` del
`02-VERIFICATION.md` siguen intactos.

---

_Arreglado: 2026-10-09_
_Fixer: Claude (gsd-executor, cierre de gap)_
