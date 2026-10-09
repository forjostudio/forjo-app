---
phase: 02-la-barra-inferior-y-m-s
fixed_at: 2026-10-09T05:25:00Z
review_path: .planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 2: Informe de arreglos del code review

**Arreglado:** 2026-10-09
**Review de origen:** `02-REVIEW.md` (17 hallazgos; alcance de esta corrida: **4** elegidos por el dueño)
**Iteración:** 1
**Base de la corrida:** `6d4efa9`

**Resumen:**

- Hallazgos en alcance: **4** (CR-01, CR-02, WR-01, WR-02)
- Arreglados: **4**
- Salteados: **0**
- Los otros **13** hallazgos quedan sin tocar, como deuda documentada.
- Ningún hallazgo resultó falso al medirlo: los cuatro se reprodujeron con un comando antes de
  tocar código, y los dos candados se probaron con su propia mutación (rojo demostrado).

**Pipeline final (medido en `a0e631e`):**

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **rc 0** |
| `npx vitest run` | **rc 0** · `Test Files 107 passed (107)` · `Tests 1682 passed \| 4 expected fail \| 1 skipped (1687)` |
| `npm run build` | **rc 0** |
| `npx eslint` sobre los 2 archivos de `app/` tocados | **rc 0**, sin salida ⇒ **cero hallazgos nuevos** |

El piso de la suite sube de **1680 → 1682** casos (+2 casos nuevos: el candado estático de CR-01 y
el desdoblamiento del candado de WR-01). Los 107 archivos y los 4 "expected fail" intencionales no
cambian. La corrida fue limpia: cero flakes del pool de workers en esta sesión.

**Reloj al momento de medir:** `9/10/2026, 02:12:07` (America/Argentina/Buenos_Aires) ⇒ dentro de
`[01:00, 23:30]`, así que los dos canarios de reloj de la suite no interfieren. Los casos nuevos
**no leen el reloj**: son barridos puros de fuente (`readFileSync` / `readdirSync`), sin base, sin
navegador y sin fecha.

---

## Arreglos aplicados

### CR-01 — La barra inferior tapaba la fila Guardar/Publicar del editor `/web` en mobile

**Commit:** `1bc3867`
**Archivos:** `app/(dashboard)/web/web-client.tsx` (sólo la clase de la línea 560) ·
`test/panel-nav-chrome.test.ts` (candado nuevo)

**Medición ANTES** — el único elemento del route group anclado al borde inferior, sin descontar nada:

```
$ grep -rn "sticky bottom-0\|fixed bottom-0" "app/(dashboard)/"
app/(dashboard)/web/web-client.tsx:560:          <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background/95 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
```

**Arreglo:** se descuenta el alto del chrome con el mismo token y el mismo `lg:` simétrico que usa
el `<main>`, y nada más de ese archivo:

```
sticky bottom-[calc(var(--panel-nav-h)+env(safe-area-inset-bottom,0px))] lg:bottom-0
```

**Medición DESPUÉS:**

```
$ grep -rn "sticky bottom-0\|fixed bottom-0" "app/(dashboard)/"
rc=1  (1 = sin hits)

$ grep -rnoE "(sticky|fixed) bottom-[^ \"]*" "app/(dashboard)/"
app/(dashboard)/web/web-client.tsx:560:sticky bottom-[calc(var(--panel-nav-h)+env(safe-area-inset-bottom,0px))]
```

**La clase genera CSS de verdad** (es la trampa del espacio en el valor arbitrario, que Tailwind no
avisa). Verificado contra el CSS del build de producción, no contra la fuente:

```
$ grep -ho "bottom:calc(var(--panel-nav-h)[^;}]*" .next/static/chunks/*.css | sort -u
bottom:calc(var(--panel-nav-h) + env(safe-area-inset-bottom,0px) + .5rem)      <- preexistente (aviso efímero)
bottom:calc(var(--panel-nav-h) + env(safe-area-inset-bottom,0px))              <- EL ARREGLO
```

**Candado nuevo** (`test/panel-nav-chrome.test.ts`, describe 8): barrido puro y recursivo sobre
**todo** `app/(dashboard)` — no una lista de archivos, que habría que mantener. La regla: dentro de
una cadena de clases que posicione con `sticky` o `fixed`, todo `bottom-*` **sin prefijo de
breakpoint** tiene que referenciar `var(--panel-nav-h)`. Los prefijados (`lg:bottom-0`) quedan
exentos a propósito, y los `absolute bottom-0` quedan afuera por construcción (se anclan a su
contenedor `relative`, no al viewport — las tres barritas de color de las tarjetas de Finanzas son
exactamente ese caso y son legítimas). Lleva guarda de honestidad: si el barrido no encuentra ni un
elemento anclado abajo, el caso falla en vez de pasar por vacío.

**Prueba de que el candado muerde** — se revirtió la clase a `sticky bottom-0` y el caso se puso
rojo:

```
 ❯ |pure| test/panel-nav-chrome.test.ts (37 tests | 1 failed) 49ms
     × ninguna pantalla del panel ancla algo al borde inferior sin descontar el alto de la barra 35ms

 FAIL  |pure| test/panel-nav-chrome.test.ts > 8 · el alto reservado para el chrome fijo es coherente > ninguna pantalla del panel ancla algo al borde inferior sin descontar el alto de la barra
AssertionError: app/(dashboard)/web/web-client.tsx: bottom-0 no descuenta el alto de la barra: expected 'bottom-0' to contain 'var(--panel-nav-h)'

Expected: "var(--panel-nav-h)"
Received: "bottom-0"

 Test Files  1 failed (1)
      Tests  1 failed | 36 passed (37)
```

**Cómo se verifica de acá en adelante:** `npx vitest run test/panel-nav-chrome.test.ts` — y para la
inspección a mano, `grep -rn "sticky bottom-0\|fixed bottom-0" "app/(dashboard)/"` tiene que dar
**cero hits**.

⚠ `web-client.tsx` está **fuera** de los 11 archivos declarados de la fase. La expansión fue
autorizada explícitamente por el dueño: el defecto lo causó esta fase y el arreglo no puede vivir en
otro lado. Se tocó **sólo esa clase** (diff de 1 línea, verificado).

---

### CR-02 — Los eyebrows de grupo de `/mas` fallaban WCAG AA en 10 de 40 combinaciones

**Commit:** `19bc5f0`
**Archivo:** `app/(dashboard)/mas/mas-client.tsx`

**Medición ANTES** — el token nuevo de la fase no se usaba en la pantalla nueva, y los dos eyebrows
tenían la clase escrita **literal dos veces**:

```
$ grep -rln "panel-nav-muted" app components lib
app/globals.css
app/themes.css
components/dashboard/panel-bottom-nav.tsx
components/dashboard/panel-top-bar.tsx
         <- app/(dashboard)/mas/mas-client.tsx NO aparece

$ grep -n "text-muted-foreground" "app/(dashboard)/mas/mas-client.tsx"
148:            <p className="text-sm text-muted-foreground truncate">
173:              className="px-2 pt-4 pb-1 font-[family-name:var(--font-geist-mono)] text-[11px] tracking-wider uppercase text-muted-foreground"
223:            className="px-2 pt-4 pb-1 font-[family-name:var(--font-geist-mono)] text-[11px] tracking-wider uppercase text-muted-foreground"
259:              <ExternalLink className="w-4 h-4 flex-shrink-0 ml-auto text-muted-foreground" aria-hidden="true" />
285:      <div className="flex items-center gap-2 px-3 pt-4 text-xs text-muted-foreground">
```

**Arreglo:** la clase se extrae a una constante `EYEBROW` al lado de `FILA` (con el comentario que
explica por qué acá no puede ser `--muted-foreground`, y la advertencia de la trampa del espacio), y
el color pasa a `text-[var(--panel-nav-muted)]`. Los dos extremos consumen la misma constante ⇒ un
arreglo a medias dejó de ser escribible.

**Medición DESPUÉS:**

```
$ grep -rln "panel-nav-muted" app components lib
app/(dashboard)/mas/mas-client.tsx      <- NUEVO
app/globals.css
app/themes.css
components/dashboard/panel-bottom-nav.tsx
components/dashboard/panel-top-bar.tsx

$ grep -n "EYEBROW" "app/(dashboard)/mas/mas-client.tsx"
88:const EYEBROW =
188:              className={EYEBROW}
238:            className={EYEBROW}

$ grep -n "text-muted-foreground" "app/(dashboard)/mas/mas-client.tsx"
163:            <p className="text-sm text-muted-foreground truncate">       <- WR-05, FUERA de alcance
275:              <ExternalLink ... text-muted-foreground" aria-hidden="true" />  <- FUERA de alcance
301:      <div className="... text-xs text-muted-foreground">                 <- FUERA de alcance
```

Los dos eyebrows salieron de la lista y las **tres** líneas fuera de alcance (ex 148 / 259 / 285)
quedaron intactas. El sidebar de desktop no se tocó: `git diff 6d4efa9..HEAD -- components/dashboard/sidebar.tsx`
→ **0 líneas**.

**La clase genera CSS de verdad**, verificado contra el build de producción:

```
$ grep -ho "color:var(--panel-nav-muted)" .next/static/chunks/*.css | sort -u
color:var(--panel-nav-muted)
```

**Contraste resultante:** el peor caso de las 40 combinaciones para este elemento pasa de **3.02:1**
(spa claro) / **4.15:1** (modern claro) a **5.02:1** (forjo claro, el único tema sin `color-mix` ⇒
número exacto), que es justo el valor que la tabla de contraste del §5 del UI-SPEC publica para
`Eyebrow de grupo`. Los números no son nuevos: son los que esta misma fase escribió en
`app/themes.css:32-34` y `:108-110`.

---

### WR-01 — El candado del reparto no podía ver un quinto href en `EN_LA_BARRA`

**Commit:** `92467d6`
**Archivos:** `test/panel-nav-chrome.test.ts` · `test/panel-nav-groups.test.ts` (sólo el comentario
que afirmaba vigilar al componente)

**Medición ANTES** — mutación: agregar `'/finances'` al `EN_LA_BARRA` de `mas-client.tsx:59`, que es
exactamente "sumar un quinto href para que Más tenga menos filas". Con eso, la producción renderiza
7/7/7/6 filas mientras los tests siguen afirmando 8/8/8/7, y **las dos suites quedan verdes**:

```
$ npx vitest run test/panel-nav-groups.test.ts test/panel-nav-chrome.test.ts

 Test Files  2 passed (2)
      Tests  61 passed (61)
   Duration  1.28s

RC=0
```

**Arreglo:** el caso ya no cuenta apariciones ni enumera los cuatro strings a mano. Lee la
declaración de la **producción** (`const EN_LA_BARRA` de `mas-client.tsx`) y la compara por
**igualdad de conjuntos** contra los destinos que la barra renderiza (`const DESTINOS` de
`panel-bottom-nav.tsx`), menos `/mas` — que es la pantalla misma y no se resta de sí misma. No
deduplica a propósito: un href escrito dos veces en la declaración tiene que dar rojo, no colapsar
en silencio. El chequeo de `count('/clients') === 1` se conserva como caso aparte (cubre todo el
archivo, no sólo la declaración).

El comentario de `test/panel-nav-groups.test.ts:33-40`, que afirmaba que su copia del Set vigilaba
al componente, se corrigió: la copia es la tabla de rubros, el vínculo entre las dos puntas vive
ahora en el caso nuevo de `panel-nav-chrome`.

**Prueba de que muerde — dirección 1** (un href de más en `EN_LA_BARRA`):

```
- Expected
+ Received

  [
    "'/agenda'",
    "'/appointments'",
    "'/clients'",
    "'/dashboard'",
+   "'/finances'",
  ]

 ❯ test/panel-nav-chrome.test.ts:167:22

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 62 passed (63)
```

**Prueba de que muerde — dirección 2** (un destino nuevo en la barra que nadie restó en Más; es el
otro modo de falla, y el candado viejo tampoco lo veía):

```
- Expected
+ Received

  [
    "'/agenda'",
    "'/appointments'",
    "'/clients'",
    "'/dashboard'",
-   "'/finances'",
  ]
```

Las dos mutaciones se revirtieron con `git checkout --` y **nunca se commitearon**;
`git status --porcelain -- app components lib test` quedó limpio de los archivos de producción
después de cada reversión (verificado en las dos).

---

### WR-02 — El candado del `aria-labelledby` pasaba con el `id` del grupo derivado borrado

**Commit:** `a0e631e`
**Archivo:** `test/panel-nav-chrome.test.ts`

**Medición ANTES** — mutación: borrar el `id={`mas-grupo-${slugDeGrupo(group.section)}`}` del `<p>`
derivado, o sea dejar los **cuatro** grupos del menú **sin nombre accesible**. Quedan 3 apariciones
del prefijo y 2 de `aria-labelledby`, así que la cota `>= 2` se satisface sola con el par
hardcodeado de `CUENTA` y el test pasa:

```
$ npx vitest run test/panel-nav-chrome.test.ts

 Test Files  1 passed (1)
      Tests  36 passed (36)
   Duration  276ms
```

**Arreglo:** el caso dejó de contar contra una cota. Extrae la expresión literal de **cada**
`aria-labelledby` y de **cada** `id` (con los espacios colapsados) y exige tres cosas:

1. hay exactamente **2** expresiones de referencia distintas (el extremo derivado y el de `CUENTA`)
   — guarda de honestidad: un archivo sin un solo `aria-labelledby` no puede pasar por vacío;
2. hay **tantas referencias como `role="group"`** ⇒ ningún grupo sin referencia;
3. **cada** referencia encuentra su `id` escrito ⇒ ninguna referencia sin identificador.

**Prueba de que muerde** (misma mutación que antes pasaba en verde):

```
 ❯ |pure| test/panel-nav-chrome.test.ts (38 tests | 1 failed) 58ms
     × cada aria-labelledby de la pantalla tiene su id escrito, el derivado incluido 4ms

 FAIL  |pure| test/panel-nav-chrome.test.ts > 6 · la jerarquía de encabezados y los nombres de los landmarks > cada aria-labelledby de la pantalla tiene su id escrito, el derivado incluido
AssertionError: expected [ '"mas-grupo-cuenta"' ] to include '{`mas-grupo-${slugDeGrupo(group.secti…'
 ❯ test/panel-nav-chrome.test.ts:363:41

 Test Files  1 failed (1)
      Tests  1 failed | 37 passed (38)
```

La mutación se revirtió con `git checkout --` y **nunca se commiteó**.

---

## Discrepancia documental pendiente (NO se editó el UI-SPEC)

El `02-UI-SPEC.md` es un artefacto aprobado y no se tocó. Pero después de CR-02 quedan **tres**
lugares del contrato desactualizados respecto del código que shipea, y hay que reconciliarlos en la
próxima revisión del documento:

| Lugar | Qué dice | Qué dice el código ahora |
|---|---|---|
| **§4**, tabla de tipografía (~línea 110) | `Eyebrow de grupo (Más) … --muted-foreground. Copiado tal cual de sidebar.tsx:136.` | Usa `--panel-nav-muted`. Ya **no** es copia literal del sidebar: cambian el `id` y el token de color. |
| **§11**, regla 3 | "eyebrows verbatim del sidebar, `--muted-foreground`" | Ídem: el verbatim se rompió a propósito, porque era la mitad del contrato que contradecía a §5 / §18.8 / §19 C-6. |
| **§5** (~línea 251) + **§13 de la UAT** | "`grep -rn 'panel-nav-muted' app components lib` sólo debe dar hits en los dos archivos de CSS y en los **dos** componentes nuevos" | Ahora son **tres** componentes: se suma `app/(dashboard)/mas/mas-client.tsx`. El criterio verificable hay que subirlo de 2 a 3. |

**La contradicción interna ya la dirimió el dueño y no se reabre:** manda §5 (la tabla de contraste
publica `Eyebrow de grupo | --panel-nav-muted sobre --background | 5.02:1`), §18.8 (contraste
OBLIGATORIO, y nombra al eyebrow de Más como el peor caso absoluto de la superficie) y §19 C-6 (la
superficie **nueva** se resuelve con el token; el defecto del **sidebar** de desktop es deuda
preexistente que NO se arregla acá). Las dos entradas rancias son §4 ~línea 110 y §11 regla 3.

---

## Frontera respetada

```
$ git diff 6d4efa9..HEAD --stat
 app/(dashboard)/mas/mas-client.tsx |  22 ++++++-
 app/(dashboard)/web/web-client.tsx |   2 +-
 test/panel-nav-chrome.test.ts      | 124 ++++++++++++++++++++++++++++++++++---
 test/panel-nav-groups.test.ts      |  14 +++--
 4 files changed, 144 insertions(+), 18 deletions(-)

$ git diff 6d4efa9..HEAD -- lib/panel-history.ts lib/overlay-history.ts lib/dirty-history.ts | wc -l
0

$ git diff 6d4efa9..HEAD -- components/dashboard/sidebar.tsx | wc -l
0

$ git status --porcelain -- app components lib test | wc -l
0
```

- **Cero** diff en los tres módulos de historial.
- **Cero** diff en `components/dashboard/sidebar.tsx` ⇒ `sidebarContent` y el bloque `hidden lg:flex`
  intactos.
- Cuatro archivos tocados, los cuatro justificados por su hallazgo.
- Working tree limpio: ninguna mutación de prueba sobrevivió.

## Los 13 hallazgos fuera de alcance (sin tocar)

WR-03 · WR-04 · WR-05 · WR-06 · WR-07 · WR-08 · WR-09 · WR-10 · WR-11 · WR-12 · WR-13 · WR-14 ·
WR-15. Quedan como deuda documentada en `02-REVIEW.md`.

Nota de vecindad: **WR-05** (la línea de plan del bloque de identidad, también `--muted-foreground`,
3.41:1 sobre `--card` en spa claro) comparte raíz con CR-02 y hoy es un arreglo de una sola palabra
—`text-[var(--panel-nav-muted)]` en `mas-client.tsx:163`— porque el token ya está consumido en el
archivo. **No se aplicó**: está fuera del alcance que el dueño eligió.

Y **WR-14** sigue vigente tal cual: el barrido de "valores arbitrarios sin espacios" recorre
`[layout, barra, header]` y **no** incluye `mas-client.tsx`, así que el `text-[var(--panel-nav-muted)]`
que esta corrida agregó a la pantalla nueva **no queda vigilado por ese candado**. Se verificó a mano
contra el CSS del build (arriba), pero el candado estático sigue cubriendo un subconjunto.

---

_Arreglado: 2026-10-09_
_Fixer: Claude (gsd-code-fixer)_
_Iteración: 1_
