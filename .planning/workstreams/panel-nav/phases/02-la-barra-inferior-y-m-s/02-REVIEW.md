---
phase: 02-la-barra-inferior-y-m-s
reviewed: 2026-10-08T22:30:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - app/(dashboard)/layout.tsx
  - app/(dashboard)/mas/mas-client.tsx
  - app/(dashboard)/mas/page.tsx
  - app/globals.css
  - app/themes.css
  - components/dashboard/nav-groups.ts
  - components/dashboard/panel-bottom-nav.tsx
  - components/dashboard/panel-top-bar.tsx
  - components/dashboard/sidebar.tsx
  - test/panel-nav-chrome.test.ts
  - test/panel-nav-groups.test.ts
findings:
  critical: 2
  warning: 15
  info: 0
  total: 17
status: issues_found
---

# Phase 2: Informe de code review

**Revisado:** 2026-10-08T22:30:00Z
**Profundidad:** standard
**Archivos revisados:** 11
**Estado:** issues_found

## Resumen

El aislamiento multi-tenant está bien: `app/(dashboard)/mas/page.tsx` usa el cliente con cookies
(anon + RLS), resuelve el negocio por `.eq('owner_id', user.id)`, nunca toma un id del cliente, no
toca el service role, y los 7 secretos por tenant ya no viven en `businesses` (están en
`business_secrets`) ⇒ **no hay fuga de credenciales ni oracle cross-tenant**. La resta barra/Más es
correcta por HREF y la trampa `clients`/`patients` está bien resuelta: medido con la producción, los
4 rubros dan 12/12/12/11 destinos y 8/8/8/7 filas, sin duplicar ni perder una fila. La frontera
RSC/cliente es legal, `export const viewport` vive en un segmento válido, y **todas** las clases
arbitrarias de los cuatro archivos nuevos compilan de verdad (se compiló `globals.css` con
`tailwindcss@4.3.0` y se verificó la salida: `h-[var(--panel-nav-h)]`, los tres `env()`,
`focus-visible:ring-inset`, `[@media(hover:hover)]:hover:*` y `min-h-12` generan CSS; además `px-4`
sale ANTES de `pl-*`/`pr-*` en el orden de Tailwind, así que los insets laterales del header sí
ganan).

Dicho eso, hay **dos defectos que no deberían salir así**:

1. La barra inferior nueva **tapa la barra de acciones sticky del editor `/web`** (Guardar /
   Publicar / Descartar) durante toda la edición en mobile. Es la única superficie del panel con un
   elemento `sticky bottom-0`, y el `pb` del `<main>` no la protege por construcción.
2. Los eyebrows de grupo de `/mas` se pintan con `text-muted-foreground` y **fallan WCAG AA en 10 de
   las 40 combinaciones** de tema × modo × paleta — exactamente el fallo que el token
   `--panel-nav-muted` se creó para cerrar, con los números escritos en el comentario de
   `app/themes.css` que esta misma fase agregó.

Lo demás son 15 WARNINGs, con dos focos: **los candados de la fase son más débiles de lo que
afirman** (dos de ellos pasan en verde con la mutación que dicen cazar — se demostró ejecutándolas) y
un puñado de bordes sin cubrir en el chrome nuevo.

**Deuda preexistente, fuera de alcance (se menciona una sola vez):** `app/(dashboard)/layout.tsx:63`
dispara `react-hooks/purity` por el `Date.now()` del cálculo de `daysLeft`. Está medido contra la
base de la fase y no se cuenta como hallazgo.

**Evidencia de pipeline recogida durante la review:** `tsc --noEmit` → exit 0 ·
`eslint` sobre los 7 archivos de app/components → 1 error, el preexistente de arriba ·
`vitest run test/panel-nav-*.test.ts` → 61/61 verdes (que es parte del problema: ver WR-01 y WR-02).

---

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: La barra inferior tapa las acciones de Guardar/Publicar del editor `/web` en mobile

**BLOCKER**

**Archivos:**
- `components/dashboard/panel-bottom-nav.tsx:90` (el elemento fijo nuevo)
- `app/(dashboard)/layout.tsx:94` (la reserva de alto)
- `app/(dashboard)/web/web-client.tsx:560` (la víctima)

**Issue:** `/web` es la única pantalla del panel con una barra de acciones **`sticky bottom-0`**:

```tsx
// app/(dashboard)/web/web-client.tsx:560
<div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background/95 py-3 ...">
```

En mobile esa barra son **dos filas** (fila 1: estado + "Ver mi web"; fila 2: Descartar · Guardar ·
Publicar, cada botón `min-h-11`) ⇒ mide ~120px, y la fila de acciones ocupa los **últimos ~56px**.

Un elemento `sticky bottom-0` se fija al borde inferior del **scrollport** (el documento), no al
borde inferior del `<main>`: el `pb-[calc(var(--panel-nav-h)+env(...))]` que la fase agregó al
`<main>` está *por debajo* del contenedor de la barra sticky, así que **no la empuja**. La barra nueva
es `fixed bottom-0` con `z-30` y `bg-card` **opaco** ⇒ mientras el dueño edita (el editor es largo y
la barra está pinneada durante todo el scroll) la banda de 56px inferior queda cubierta y **la fila
de los tres botones no se ve**. Sólo reaparece al llegar al final absoluto del scroll, cuando la
sticky vuelve a su posición de flujo por encima del `pb` del `<main>`.

Dos consecuencias, y la segunda es la grave:

- la acción primaria del editor (Publicar) deja de ser alcanzable "siempre a la vista", que es la
  única razón de existir de una barra sticky;
- un toque donde el dueño *ve* que deberían estar los botones aterriza en un destino de la barra y lo
  **saca del editor**. El `useUnsavedChanges(dirty)` de `web-client.tsx:216` sí intercepta y pregunta
  (no hay pérdida de datos silenciosa), pero el gesto es exactamente el inverso del que quiso hacer.

El criterio §10.2 del UI-SPEC ("los botones de alta de Finanzas y el footer de los formularios largos
quedan completamente visibles") no lo cubre: el footer de `/web` **no** es un footer de flujo, es
sticky, y por eso el `pb` del `<main>` no lo protege. El §18.6 de la UAT tampoco lista `/web`.

**Fix:** desplazar el `bottom` de la barra sticky por el alto del chrome nuevo, con el mismo token y
el mismo `lg:` simétrico que usa el `<main>` (cero cambios en la barra ni en el layout):

```tsx
// app/(dashboard)/web/web-client.tsx:560
<div className="sticky bottom-[calc(var(--panel-nav-h)+env(safe-area-inset-bottom,0px))] lg:bottom-0 flex flex-col gap-2 border-t bg-background/95 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
```

⚠ En el valor arbitrario no puede haber **ni un espacio** (misma trampa que el `pb` del `<main>`).
Y conviene cerrarlo con un candado: un barrido estático que exija que todo `sticky bottom-0` /
`fixed bottom-0` dentro de `app/(dashboard)` que no sea la propia barra declare el offset por
`--panel-nav-h`, para que la próxima pantalla que estrene una barra de acciones no repita el choque.

---

#### CR-02: Los eyebrows de grupo de `/mas` fallan WCAG AA en 10 de las 40 combinaciones

**BLOCKER**

**Archivo:** `app/(dashboard)/mas/mas-client.tsx:173` y `:223`

**Issue:** los dos eyebrows de grupo (los derivados de `NAV_GROUPS` y el de `CUENTA`) se pintan con
`text-muted-foreground`:

```tsx
className="px-2 pt-4 pb-1 font-[family-name:var(--font-geist-mono)] text-[11px] tracking-wider uppercase text-muted-foreground"
```

Los eyebrows se leen **sobre `--background`** (viven en la página, no en la barra), y ese par está
medido —por esta misma fase— como fallo de AA:

| Tema / modo | `--muted-foreground` sobre `--background` | AA (4.5:1 para 11px) |
|---|---|---|
| spa claro (`#90847a`) | **3.02:1** | ✗ (5 paletas) |
| modern claro (`#69748c`) | **4.15:1** | ✗ (5 paletas) |

⇒ **10 de las 40 combinaciones** de tema × modo × paleta que el panel puede renderizar. Los números
no son míos: están escritos en el comentario que esta fase agregó a `app/themes.css:32-34` y
`:108-110`, y son la justificación completa del token nuevo.

Y el token existe exactamente para esto. El UI-SPEC lo dice en tres lugares distintos:

- §5 › "el eyebrow de grupo de Más se lee sobre `--background`" y la **tabla final de contraste**:
  `Eyebrow de grupo | --panel-nav-muted sobre --background | 5.02:1`;
- §18.8 (contraste, marcado **OBLIGATORIO**): "es donde cae el peor caso absoluto de la superficie
  (eyebrow de Más, **5.02:1**)";
- §19 C-6: "Para la **superficie nueva** se resuelve con `--panel-nav-muted` y sus dos overrides
  (§5) … El defecto preexistente del **sidebar** NO se arregla acá".

El implementador siguió la otra mitad del contrato (§11 regla 3, "eyebrows verbatim del sidebar,
`--muted-foreground`"), que es una **contradicción interna del UI-SPEC**. Pero el verbatim del
sidebar es justo lo que §19 C-6 declara como deuda de **desktop**, y `/mas` es una pantalla **nueva de
mobile**: hoy la tabla de contraste del contrato es falsa para el código que shipea, y el criterio de
UAT §18.8 ("el eyebrow de grupo de Más **se lee**") fallaría en spa claro con cualquiera de sus 5
paletas.

Síntoma adicional que confirma que el caso del eyebrow se perdió por el camino: el comentario del
token en `app/globals.css:77-79` lo describe como "el color del destino **INACTIVO**" y dice que
`--muted-foreground` "falla AA **sobre `--card`** en los temas claros de spa y modern" — pero modern
claro sobre `--card` da 4.69:1 y **pasa**; modern claro sólo falla sobre `--background`, que es el
caso del eyebrow. La narrativa del token ya había dejado afuera el elemento para el que se calculó la
mitad de sus números.

**Fix:** usar el token en los dos eyebrows (y nada más; el sidebar de desktop no se toca, MOB-07):

```tsx
// app/(dashboard)/mas/mas-client.tsx:171-176 y 221-226 — único cambio: el token de color
className="px-2 pt-4 pb-1 font-[family-name:var(--font-geist-mono)] text-[11px] tracking-wider uppercase text-[var(--panel-nav-muted)]"
```

Conviene extraer la clase a una constante `EYEBROW` al lado de `FILA` (hoy el string está duplicado
literal en los dos extremos de la pantalla, así que un arreglo a medias es posible) y actualizar el
§13 de la UAT, que espera hits de `panel-nav-muted` en "los 2 componentes nuevos" y pasarían a ser 3.
Si el dueño prefiere mantener la paridad visual exacta con el sidebar aun fallando AA, eso es una
decisión suya — pero entonces hay que **borrar la fila del eyebrow de la tabla de contraste de §5 y
el criterio de §18.8**, porque hoy el contrato promete algo que el código no cumple.

---

### Warnings

#### WR-01: El candado del reparto NO puede ver un quinto href en `EN_LA_BARRA` — y afirma que sí

**WARNING**

**Archivos:** `test/panel-nav-groups.test.ts:32-42` · `test/panel-nav-chrome.test.ts:144-153`

**Issue:** el comentario del candado declara su propio valor así:

> "No se importa a propósito — el valor del candado está en que si alguien cambia el conjunto del
> componente (p. ej. suma un quinto href 'para que Más tenga menos filas') sin cambiar el de acá,
> **los conteos de abajo se rompen y el test lo dice**."

**Es falso, y se midió.** Agregando `'/finances'` al `EN_LA_BARRA` de `mas-client.tsx:59`:

- `panel-nav-groups.test.ts` nunca lee el componente (usa su propia copia del Set) ⇒ sigue afirmando
  8/8/8/7 filas mientras la producción renderiza 7/7/7/6 → **verde**;
- `panel-nav-chrome.test.ts` sólo exige que los 4 hrefs *aparezcan* en el archivo y que `'/clients'`
  aparezca **una** vez; un quinto href no altera ninguna de las dos cuentas → **verde**.

Ejecutado sobre el fuente real: los 4 hrefs presentes = `true`, `count('/clients') === 1` = `true`.
O sea: la fila que desaparece de Más es exactamente la clase de bug que la fase dice tener cerrada,
y pasa con el pipeline entero en verde. El `describe` final de `panel-nav-groups` afirma
`EN_LA_BARRA.size === 4` **sobre la copia del test**, no sobre la producción, así que tampoco lo ve.

**Fix:** que el barrido estático lea el conjunto **de la producción** y afirme su tamaño y su
contenido, que es lo único que ata las dos suites:

```ts
// test/panel-nav-chrome.test.ts
it('EN_LA_BARRA de la producción tiene exactamente los 4 hrefs', () => {
  const decl = bloque(mas, 'const EN_LA_BARRA', '])')
  expect(decl).not.toBe('')
  const hrefs = (decl.match(/'\/[a-z-]+'/g) ?? []).sort()
  expect(hrefs).toEqual(["'/agenda'", "'/appointments'", "'/clients'", "'/dashboard'"])
})
```

---

#### WR-02: El candado del `aria-labelledby` pasa con el `id` borrado — el fallo que dice cazar

**WARNING**

**Archivo:** `test/panel-nav-chrome.test.ts:315-321`

**Issue:** el caso se llama "el vínculo del nombre de grupo está escrito en los DOS extremos" y
afirma:

```ts
expect(cuenta(mas, /mas-grupo-/g)).toBeGreaterThanOrEqual(2)
expect(cuenta(mas, /aria-labelledby/g)).toBeGreaterThan(0)
```

Borrando el `id={` + "`mas-grupo-${slugDeGrupo(group.section)}`" + `}` del `<p>` derivado
(`mas-client.tsx:172`) —o sea dejando **todos** los grupos del menú sin nombre accesible— quedan 3
ocurrencias de `mas-grupo-` (el `aria-labelledby` del `.map`, y el par `id`/`aria-labelledby` de
`CUENTA`) y 2 de `aria-labelledby`. Medido: `3 >= 2` → **verde**, `2 > 0` → **verde**.

El umbral `>= 2` es el agujero: con el grupo `CUENTA` escrito a mano, el par hardcodeado solo ya
satisface la cota, y el extremo derivado —el que cubre 4 de los 5 grupos— queda sin vigilar. Es
literalmente el modo de falla que el archivo describe tres veces ("un `aria-labelledby` roto no tira
error de consola, no rompe el build y no se ve en la UAT visual").

**Fix:** contar los dos extremos por separado y exigir que coincidan:

```ts
const ids = cuenta(mas, /id=\{`mas-grupo-/g)
const refs = cuenta(mas, /aria-labelledby=\{?["`]?mas-grupo-/g)
expect(ids).toBeGreaterThanOrEqual(2)       // el derivado + CUENTA
expect(refs).toBe(ids)                      // cada referencia tiene su id escrito
```

---

#### WR-03: `slugDeGrupo` no sanea caracteres ilegales de `id`, y el rango de combinantes está escrito con caracteres crudos

**WARNING**

**Archivo:** `app/(dashboard)/mas/mas-client.tsx:78-83`

**Issue:** dos cosas, las dos silenciosas.

1. La función sólo baja a minúsculas y quita diacríticos. El `section` viene de `NAV_GROUPS`, que hoy
   son cinco palabras sueltas, pero el comentario promete que "un grupo nuevo en el inventario trae
   su `id` solo". Un `section` con **espacio** (`'MI NEGOCIO'`) produce
   `aria-labelledby="mas-grupo-mi negocio"`, que el parser trata como **dos referencias de id**
   (`mas-grupo-mi` y `negocio`), ninguna de las cuales existe ⇒ el grupo queda **sin nombre, en
   silencio**. Es el mismo fallo invisible que la cabecera del archivo dice estar evitando, y ningún
   candado lo ve (WR-02).

2. El rango de combinantes está escrito con los **caracteres crudos** U+0300 y U+036F dentro del
   literal de regex (verificado leyendo los code points del archivo: `/[̀-ͯ]/g`). Hoy funciona
   (`GESTIÓN` → `gestion`, comprobado), pero son marcas combinantes que en el fuente se adhieren
   visualmente al `[` y al `-`: cualquier normalización, formateo o paso por una herramienta que no
   las preserve rompe el rango, y el síntoma sería un `id` con una tilde combinante adentro —feo,
   difícil de depurar, e invisible en un diff.

**Fix:**

```ts
function slugDeGrupo(section: string): string {
  return section
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // rango escapado: legible y a prueba de normalización
    .replace(/[^a-z0-9]+/g, '-')       // ningún id con espacios ni caracteres ilegales
    .replace(/^-+|-+$/g, '')
}
```

---

#### WR-04: `mas/page.tsx` serializa la fila entera de `businesses` al cliente con `select('*')`

**WARNING**

**Archivo:** `app/(dashboard)/mas/page.tsx:24-32`

**Issue:** la query es `select('*')` y la fila completa cruza la frontera servidor→cliente como prop
de `MasClient` (`'use client'`). `MasClient` consume **cinco** campos: `name`, `logo_url`, `plan`,
`plan_status`, `type`, `slug`. La tabla tiene hoy ~40 columnas, incluidas `landing_config` y
`landing_draft`, dos `jsonb` que contienen el config completo de la web del negocio: viajan enteras
en el payload RSC de `/mas` sin que nadie las lea.

No es una fuga **hoy** —se verificó contra `supabase/schema.sql` y `lib/types.ts`: los 7 secretos por
tenant se movieron a `business_secrets`, y en `businesses` no quedó ninguna columna secreta— pero es
el patrón que ya costó un incidente en este repo (`credential-exposure-rls-2026-06`): con `select('*')`
+ paso directo a un componente de cliente, **la próxima columna sensible que alguien agregue a
`businesses` queda publicada en el browser sin que ningún gate lo note**. El `(dashboard)/layout.tsx`
tiene el mismo patrón (preexistente), así que en `/mas` la fila se serializa además dos veces.

**Fix:** columnas explícitas en la pantalla nueva — es la lista mínima y documenta el contrato:

```ts
const { data: business } = await supabase
  .from('businesses')
  .select('id, name, slug, logo_url, type, plan, plan_status')
  .eq('owner_id', user.id)
  .single()
```

(Requiere ajustar el tipo de la prop de `MasClient` a `Pick<Business, …>`, que es la otra mitad del
beneficio: deja escrito qué necesita la pantalla.)

---

#### WR-05: La línea de plan del bloque de identidad también falla AA en spa claro

**WARNING**

**Archivo:** `app/(dashboard)/mas/mas-client.tsx:148`

**Issue:** `<p className="text-sm text-muted-foreground truncate">` se lee sobre `bg-card`, y
`--muted-foreground` sobre `--card` en **spa claro** da **3.41:1** (número del comentario que esta
fase agregó a `app/themes.css:108-110`), por debajo del 4.5:1 de AA para 14px. Son 5 de las 40
combinaciones.

Misma raíz que CR-02 y misma tensión de contrato (§11 pide verbatim del sidebar; §19 C-6 dice que la
superficie nueva se resuelve con el token), pero se separa porque la tabla de contraste de §5 **no
lista** este elemento ⇒ no hay promesa explícita incumplida, sólo un texto nuevo de mobile que no
pasa AA en un tema que el negocio puede elegir. Y a diferencia del eyebrow, acá el dato es relevante
(el plan contratado), no decorativo.

**Fix:** `text-[var(--panel-nav-muted)]` en esa línea (5.74:1 sobre `--card` en spa claro), o
decidir explícitamente que se acepta y anotarlo junto a C-6.

---

#### WR-06: El logo del bloque de identidad anuncia el nombre del negocio dos veces

**WARNING**

**Archivo:** `app/(dashboard)/mas/mas-client.tsx:138`

**Issue:** `<img src={business.logo_url} alt={business.name} …>` está inmediatamente seguido de
`<p>{business.name}</p>`. Para un lector de pantalla el bloque se anuncia "Barbería Nómade, imagen —
Barbería Nómade". El logo acá es **decorativo**: el nombre ya está en texto a su lado. La regla del
proyecto es explícita ("Imágenes decorativas con `alt=''`, imágenes informativas con alt
descriptivo"). Viene copiado del sidebar, pero `/mas` es pantalla nueva y es el único lugar de mobile
donde este bloque existe.

**Fix:** `alt=""` en el `<img>` (y dejar el `alt` descriptivo sólo donde el logo sea el único
portador del nombre).

---

#### WR-07: `/mas` no está acotada por viewport: a ≥1024px duplica el menú del sidebar

**WARNING**

**Archivos:** `app/(dashboard)/mas/mas-client.tsx` (toda la pantalla) · `components/dashboard/panel-top-bar.tsx:95`

**Issue:** la barra (`lg:hidden`) y el header (`lg:hidden`) desaparecen en desktop, pero la **ruta**
`/mas` no tiene ningún gate: a ≥1024px renderiza la lista completa de secciones al lado del sidebar
de desktop, que muestra el mismo inventario. Consecuencias concretas:

- dos menús visibles a la vez, y dos landmarks de navegación (`Navegación` del sidebar y `Secciones`
  de Más) con el mismo contenido;
- como el header es `lg:hidden`, en desktop la pantalla **no se nombra en ninguna parte**: su único
  `h1` es `sr-only` precisamente porque "el header ya la nombra en pantalla" (§11) — premisa que en
  desktop no se cumple ⇒ pantalla sin título visible.

Es alcanzable sin esfuerzo: deep link / bookmark, o simplemente rotar o ensanchar la ventana estando
en `/mas` (el panel se usa también en tablet, y la banda 768–1023px sí tiene barra).

**Fix:** elegir una de las dos y dejarla escrita:

- **(a) mínima:** hacer visible el `h1` a partir de `lg` (`className="sr-only lg:not-sr-only lg:…"`),
  que arregla el título pero deja el menú duplicado; o
- **(b) correcta:** envolver el contenido de `MasClient` en un contenedor `lg:hidden` y renderizar a
  ≥1024px un estado que redirija o explique ("Esta pantalla es el menú de mobile"), porque en desktop
  la pantalla no tiene razón de existir.

---

#### WR-08: `/clinical-history` es una ruta del panel sin título de sección y sin activo en la barra

**WARNING**

**Archivo:** `components/dashboard/panel-top-bar.tsx:63-78`

**Issue:** el comentario dice "Los 14 pathnames del panel" y el mapa tiene 14 entradas, pero
`app/(dashboard)/` tiene **15** rutas con `page.tsx`: falta `/clinical-history` (existe, tiene su
`page.tsx`, y está listada en `app/robots.ts:52`). En esa pantalla:

- el header queda de **una sola línea** (comportamiento declarado para "cualquier otro" pathname en
  §12, así que no es una falla de implementación) ⇒ el dueño pierde el único indicador fijo de dónde
  está, que es la razón por la que la segunda línea existe;
- y la barra inferior no marca **ningún** destino activo (`pathname === destino.href` es exacto), así
  que tampoco ahí hay orientación.

Hoy ninguna vista enlaza a `/clinical-history` (se grepeó: sólo se usa el componente
`ClinicalHistoryPanel` embebido en `clients-client.tsx`), así que es alcanzable por URL únicamente.
Pero es una ruta viva del route group, con `noindex` propio, que el chrome nuevo no cubre — y el
inventario del header se escribió creyendo que eran 14.

**Fix:** agregar la entrada al mapa con el término del rubro (`'/clinical-history': t.clinicalHistory`
o el literal que corresponda), o —si la ruta está muerta— borrarla y corregir el "14" del comentario.
Vale además un candado barato: un test que afirme que todo directorio con `page.tsx` bajo
`app/(dashboard)/` tiene entrada en `TITULOS`, que es justo el drift que acá ya ocurrió.

---

#### WR-09: El label de la barra puede quedar vacío ⇒ link sin nombre accesible

**WARNING**

**Archivo:** `components/dashboard/panel-bottom-nav.tsx:74-95`

**Issue:**

```ts
const label = destino.label ?? LABELS[destino.href] ?? ''
```

Si `LABELS[destino.href]` no resolviera, el `<Link>` queda con un `<svg>` de lucide (sin `title`, sin
`aria-label`) y un `<span>` **vacío** ⇒ un destino de navegación **sin nombre accesible**, anunciado
como "enlace" a secas, y visualmente un icono sin etiqueta en una barra donde los otros cuatro la
tienen. No pasa hoy (el provider siempre está montado y `VerticalTerminology` trae las dos claves),
pero el fallback elegido es el peor posible: convierte una falta de dato en un elemento mudo en vez
de en un error visible.

Y el `?? ''` es **inalcanzable bajo TypeScript**: `LABELS` es `Record<string, string>`, así que el
compilador considera que el acceso siempre devuelve `string` — o sea que la rama defensiva no está
tipada como defensa y nadie la va a mantener.

**Fix:** tipar el mapa como parcial y que el fallback sea visible, no mudo:

```ts
const LABELS: Partial<Record<string, string>> = { '/appointments': t.appointments, '/clients': t.clients }
const label = destino.label ?? LABELS[destino.href] ?? destino.href.replace('/', '')
```

(o, si se prefiere no inventar texto, dejar `''` pero agregar `aria-label` al `<Link>` con el mismo
fallback, de modo que el nombre accesible nunca falte.)

---

#### WR-10: Restos del drawer borrado en `sidebar.tsx`: Fragment de un hijo e indirección `sidebarContent`

**WARNING**

**Archivo:** `components/dashboard/sidebar.tsx:51`, `:191-198`

**Issue:** con las dos superficies de mobile fuera, el `return` quedó así:

```tsx
return (
  <>
    {/* Desktop sidebar */}
    <div className="hidden lg:flex …">{sidebarContent}</div>
  </>
)
```

El Fragment envuelve **un solo hijo** y la variable `sidebarContent` tiene ahora **un solo consumidor**.
Las dos cosas existían por una razón que ya no está (el mismo árbol se renderizaba en el sidebar y en
el drawer; el comentario de `:48-50` explica justamente por qué no podía ser un componente). Dejarlas
le miente al próximo lector: sugiere que hay dos puntos de uso y que la indirección paga algo.

**Fix:** inline del contenido y borrado del Fragment, dejando el comentario de `:48-50` sólo si se
conserva la variable. Es el cierre natural de MOB-07 ("este archivo es el sidebar de desktop y nada
más"), y no toca una sola clase del bloque de desktop.

---

#### WR-11: `NAV_GROUPS` y `NavItem` se exportan y nadie los consume fuera del módulo

**WARNING**

**Archivo:** `components/dashboard/nav-groups.ts:43`, `:52`

**Issue:** grep sobre `app/ components/ lib/ test/`: fuera de `nav-groups.ts`, `NAV_GROUPS` aparece
sólo en **comentarios** de `mas-client.tsx` y `NavItem` sólo como un tipo **privado y distinto** de
`components/crm/crm-sidebar.tsx:37`. Son superficie pública sin consumidor, en un módulo que la fase
creó explícitamente como "fuente única": amplían el contrato que hay que mantener (cualquiera puede
empezar a leer `NAV_GROUPS` y saltearse el gateo por rubro de `buildNavGroups`, que es el modo de
falla que el módulo existe para impedir) sin que nada lo necesite.

Además el nombre colisiona conceptualmente con el `NAV_GROUPS` privado del CRM: dos constantes con el
mismo nombre y semántica distinta en el mismo repo.

**Fix:** quitar el `export` de `NAV_GROUPS` (y de `NavItem` si no se tipan props con él); si el test
del inventario lo necesitara en el futuro, se exporta **entonces** y con un nombre que no choque
(`DASHBOARD_NAV_GROUPS`).

---

#### WR-12: Las filas de Más quedan pegadas (0px) contra los 8px que el contrato asigna

**WARNING**

**Archivo:** `app/(dashboard)/mas/mas-client.tsx:177` y `:227`

**Issue:** los items de cada grupo van en un `<div>` pelado, sin `space-y-*`, así que las filas de
48px quedan **a tope** una contra otra. El UI-SPEC §3 asigna explícitamente `sm = 8px` a *"gap entre
filas de Más"*, y el sidebar —la superficie que Más espeja— usa `space-y-0.5`. (§11 › Anatomía de la
fila sólo dice "sin **separador**", que es otra cosa: habla de la línea, no del espacio.)

Es una contradicción interna del contrato, pero el resultado observable es que ninguno de los dos
valores escritos (8px de §3, 2px del sidebar) se aplica, y 10-11 filas de 48px sin aire leen como un
bloque sólido en una pantalla de 375px donde el bloque es el 60% del alto.

**Fix:** decidirlo y escribirlo: `className="space-y-2"` en los dos `<div>` de items (los 8px de §3),
o `space-y-0.5` si manda la paridad con el sidebar. Y corregir el §3 o el §11 para que no queden dos
números para la misma medida.

---

#### WR-13: `--font-geist-mono` no existe en el repo: el eyebrow mono de Más no renderiza en mono

**WARNING**

**Archivo:** `app/(dashboard)/mas/mas-client.tsx:173`, `:223`

**Issue:** los dos eyebrows declaran `font-[family-name:var(--font-geist-mono)]`, y
`--font-geist-mono` **no está definido en ninguna parte** (se grepeó todo el repo: las únicas
apariciones son usos, más `--font-mono: var(--font-geist-mono)` en el `@theme inline` de
`app/globals.css:22`, que reenvía a la misma variable inexistente). Con la custom property sin valor,
la declaración `font-family: var(--font-geist-mono)` es **inválida en tiempo de cómputo** ⇒ la
familia se hereda: el eyebrow sale en `--font-sans`, no en mono.

El UI-SPEC §4 declara el eyebrow como "**mono**" y §19 C-8 construye toda una excepción declarada
alrededor de que la pantalla renderiza "3 familias, incluida `--font-mono`". Las dos afirmaciones son
falsas en el render real. Es estado **preexistente** del repo (el sidebar y ~20 sitios del CRM tienen
el mismo token muerto), pero esta fase lo duplicó dos veces más y construyó una excepción de contrato
sobre él.

**Fix:** una de dos, y las dos son chicas:
- declarar la familia de una vez (`--font-geist-mono: var(--font-geist-mono-loaded), ui-monospace,
  SFMono-Regular, Menlo, monospace;` en `:root`, o cargarla con `next/font`), con lo cual §4 y C-8
  pasan a ser verdad; o
- si se decide que el eyebrow **no** es mono, borrar la clase de los dos eyebrows nuevos y quitar la
  tercera familia de §4/C-8 (que además devolvería el proyecto al "máximo 2 familias" de sus propias
  reglas).

De paso: el token muerto explica por qué nadie notó la diferencia entre sidebar y Más — las dos
superficies están igualmente rotas.

---

#### WR-14: El barrido de "valores arbitrarios sin espacios" no cubre `mas-client.tsx`

**WARNING**

**Archivo:** `test/panel-nav-chrome.test.ts:388-401`

**Issue:** el caso recorre `[layout, barra, header]` con el regex
`/\[[^[\]]*(?:calc|env|var)\([^[\]]*\]/g`. Quedan **fuera** del barrido:

- `app/(dashboard)/mas/mas-client.tsx`, que tiene dos valores arbitrarios con `var()`
  (`font-[family-name:var(--font-geist-mono)]`) y uno más (`h-[0.95rem]`) — es decir, la pantalla
  nueva de la fase no está vigilada por el candado que protege del modo de falla silencioso;
- los arbitrarios **sin** `calc`/`env`/`var`, como `[-webkit-tap-highlight-color:transparent]` y
  `[@media(hover:hover)]:hover:bg-secondary`, que tienen exactamente la misma trampa del espacio (el
  segundo es el más expuesto: `[@media (hover:hover)]` con un espacio es la forma que uno escribiría
  natural, y se perdería el envoltorio que impide el `:hover` pegajoso en touch).

Nada de esto está roto hoy — se compiló `app/globals.css` con `tailwindcss@4.3.0` y las 20 clases de
los cuatro archivos generan CSS — pero el candado promete cubrir "los valores arbitrarios del chrome"
y cubre un subconjunto.

**Fix:** sumar `mas` al array de fuentes y ensanchar el regex a **todo** valor arbitrario
(`/\[[^[\]\s]*\]/g` para la forma válida, más una negación explícita de `/\[[^\]]*\s[^\]]*\]/g` que
caza cualquier arbitrario **con** espacio), que es la forma positiva del invariante.

---

#### WR-15: Nada impide que un vertical futuro rompa el inventario (key duplicada o key huérfana)

**WARNING**

**Archivo:** `components/dashboard/nav-groups.ts:52-101`

**Issue:** dos invariantes están **documentados pero no verificados**, y los dos fallan en silencio:

1. **Dos keys al mismo href.** `clients` y `patients` apuntan a `/clients` a propósito. Hoy ningún
   vertical expone las dos (verificado en `lib/verticals.ts:58,80,101,122`), pero si alguna lo
   hiciera, el `.map` de `sidebar.tsx:83` y el de `mas-client.tsx:178` usan `key={item.href}` ⇒
   **keys de React duplicadas** en la misma lista (warning en consola, reconciliación impredecible),
   además de la fila repetida. El comentario de `:83-87` lo advierte; nada lo impide (el tipo no
   puede, y el test de rubros sólo cubre los 4 verticales de hoy).

2. **Key del vertical que ningún grupo reclama.** `buildNavGroups` agrupa recorriendo `NAV_GROUPS` y
   filtrando contra `v.menu`. Una key presente en `v.menu` pero **ausente de todos los grupos**
   (p. ej. el `mensajes` que §/D excluyó del milestone, o cualquier sección nueva) **desaparece del
   menú por completo**, en los tres consumidores a la vez. El test del inventario no lo ve: su `total`
   es la salida de `buildNavGroups`, no el largo de `v.menu`, así que sumar una key a un vertical sin
   agregarla a `NAV_GROUPS` mantiene los conteos y el pipeline en verde con la sección invisible.

**Fix:** dos aserciones en `test/panel-nav-groups.test.ts`, que son el tipo de candado que esta fase
sí puede escribir (función pura, entorno `node`):

```ts
it('ningún rubro expone dos keys al mismo href', () => {
  for (const { vertical } of RUBROS) {
    const hrefs = buildNavGroups(negocio(vertical)).flatMap(g => g.items.map(i => i.href))
    expect(new Set(hrefs).size).toBe(hrefs.length)
  }
})

it('NAV_GROUPS reclama TODAS las keys de menú de los 4 verticales', () => {
  const reclamadas = new Set(NAV_GROUPS.flatMap(g => g.keys))   // requiere exportarlo (ver WR-11)
  for (const v of Object.values(VERTICALS)) {
    for (const key of v.menu) expect(reclamadas.has(key)).toBe(true)
  }
})
```

(El segundo caso y WR-11 se resuelven juntos: si `NAV_GROUPS` se exporta, que sea para esto.)

---

_Reviewed: 2026-10-08T22:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
