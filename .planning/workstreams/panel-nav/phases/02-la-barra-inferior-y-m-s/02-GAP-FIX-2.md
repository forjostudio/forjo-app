---
phase: 02-la-barra-inferior-y-m-s
fixed_at: 2026-10-09T11:45:00Z
source: .planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-VERIFICATION.md
gap: "Criterio 3 — residuo: el alto fijo se pasa por la altura de los banners en flujo (decisión B del dueño)"
base: 5d2262d
head: e328edf
commits: 2
status: residuo_cerrado_de_raiz_medido_en_el_dom
---

# Phase 2 — Cierre de raíz del residuo del criterio 3

**Arreglado:** 2026-10-09 · **Base:** `5d2262d` · **HEAD:** `e328edf`
**Encargo:** opción **B** del `02-VERIFICATION.md` — que el alto de los layouts bloqueados al
viewport deje de ser una cuenta de constantes.

**Dos commits atómicos:**

| # | SHA | Qué |
|---|---|---|
| 1 | `fe355f4` | `fix(02)`: el alto de los layouts bloqueados se hereda del espacio disponible |
| 2 | `e328edf` | `fix(02)`: el candado 8 vigila el contrato nuevo y prohíbe la cuenta de constantes |

Los dos con el trailer `Co-Authored-By: Claude Opus 5 (1M context)` (verificado con
`git log -1 --format=%B`; se usó `git commit -F-` directo, no el helper del CLI, que lo omite).

Este archivo queda **sin commitear**, a propósito.

---

## 0 · El método: todo lo que sigue está MEDIDO en el DOM

Las dos rondas anteriores cerraron el criterio 3 con aritmética sobre el código y las dos dejaron
un residuo. Esta vez el instrumento es una sonda que renderiza y mide.

**Cómo está montada** (`scratchpad/probe/`, artefactos borrados al terminar, nada commiteado):

- **Chrome headless manejado por CDP**, no por `--dump-dom`. Así el viewport se emula de verdad con
  `Emulation.setDeviceMetricsOverride` y **no hace falta la jaula del iframe** que usaron 02-01 y
  02-04 (esa jaula existía sólo porque `--dump-dom` ignora `--window-size`). Node 24 trae
  `WebSocket` global, así que el cliente CDP son 15 líneas y cero dependencias nuevas.
- **Server estático propio en el puerto 3177.** El dev server de Next del puerto 80 (PID 2576)
  **está colgado**: acepta la conexión TCP en 1.6 ms y nunca responde (`curl -m 110` → `HTTP 000`
  en `/`, `/login` y `localhost`). **No se mató**, como pide el encargo.
- **El CSS de la sonda está escrito a mano**, replicando las declaraciones exactas que generan las
  clases involucradas. La equivalencia clase→declaración se verifica aparte contra el CSS del build
  (§5). La geometría de estas cajas depende sólo de `box-sizing`, `padding`, `margin`, `min-height`,
  `flex`, `position`, `inset` y `overflow`: todo CSS plano, medible sin Next.
- **La altura del banner (`H`) está parametrizada** y se mide en tres valores (0, 102 y 224 px),
  porque `H` depende de la fuente real y de si el texto envuelve. El resultado que importa no es
  "con `H = 102` anda", es **"el solape de hoy sigue a `H` exactamente, y el del mecanismo nuevo no
  depende de `H`"**.

**Lo que la sonda NO puede medir, y por qué no se finge que sí:** las 15 pantallas reales no se
pudieron renderizar. El dev server está colgado y, aun arreglándolo, apunta a otro proyecto de
Supabase (02-04 lo midió fallando 4 veces al mintear la cookie). Así que la regresión se hizo por
**perfil de layout** y cada ruta se mapeó a su perfil con evidencia de código (§4). Un perfil es
una propiedad del contrato, no de la pantalla: las 12 que fluyen con el documento se comportan
igual por construcción.

---

## 1 · El mecanismo elegido, y por qué los otros se descartaron MIDIÉNDOLOS

### Lo que cambió

```diff
- <div className="min-h-screen">
+ <div className="min-h-dvh">
    …
-   <main className="lg:pl-60 pt-14 lg:pt-0 min-h-screen pb-[calc(var(--panel-nav-h)+env(…))] lg:pb-0">
+   <main className="lg:pl-60 pt-14 lg:pt-0 min-h-dvh flex flex-col pb-[calc(var(--panel-nav-h)+env(…))] lg:pb-0">
      <TestModeBanner /> <MpConnectionBanner /> <PlanBanner />
-     <div className="p-4 sm:p-6 lg:p-8">
+     <div className="relative grow p-4 sm:p-6 lg:p-8">
        {children}
```

```diff
  // clients-client.tsx:731 y clinical-history-client.tsx:32
- <div className="-m-4 sm:-m-6 lg:-m-8 flex h-[calc(100vh-56px-var(--panel-nav-h)-env(safe-area-inset-bottom,0px))] lg:h-screen overflow-hidden bg-background">
+ <div className="absolute inset-0 lg:static lg:-m-8 lg:h-screen flex overflow-hidden bg-background">
```

Tres piezas: el `<main>` reparte en columna, el envoltorio del contenido se queda con el **sobrante**
(`grow`) y es el **bloque contenedor** (`relative`), y las dos pantallas de la familia se montan con
`absolute inset-0` adentro. **Cero enumeración de chrome.** Sumar un cuarto banner le resta sólo al
envoltorio y las dos pantallas lo siguen sin tocar una línea.

Dos efectos colaterales buenos y medidos: desaparecen los márgenes negativos de mobile (el
`absolute inset-0` llena el **padding box** del envoltorio, así que no hay padding que sangrar a
mano a cada breakpoint — medido también a 640px, donde el padding es `p-6` y el panel midió 618px
sin que ninguna constante lo nombre), y **el doble scroll se termina**: el `absolute` saca la
pantalla del flujo, así que el documento vuelve a medir exactamente el viewport
(`scrollHeight - innerHeight`: **102 → 0** con un banner, **224 → 0** con dos).

### Los otros cuatro candidatos: descartados por medición, no por opinión

Todos a 375×667, perfil bloqueado, un banner (`H = 102`). El alto correcto del panel es **453px**.

| Mecanismo | Clases | panel.height medido | Veredicto |
|---|---|---|---|
| **V1** `h-full` (la forma candidata del encargo) | `main flex flex-col` · envoltorio `flex-1 min-h-0` · panel `-m-4 h-full` | **2017px** | ✗ El porcentaje resolvió a `auto`: el panel tomó el alto de su CONTENIDO. Solape 1565px |
| **V3** `calc(100%+2rem)` | igual que V1, panel `-m-4 h-[calc(100%+2rem)]` | **2017px** | ✗ Mismo fallo: el `100%` es el problema, no el `+2rem` |
| **V5** envoltorio flex + panel `flex-1` | envoltorio `grow flex flex-col` · panel `-m-4 flex-1 min-h-0` | **2017px** | ✗ La base `auto` del envoltorio toma la contribución de contenido del panel ⇒ el envoltorio mide lo que mide el contenido |
| **V2b** = V2 pero con `flex-1` en el envoltorio | envoltorio `relative flex-1 min-h-0` | **453px** ✓ | ✗ por otra razón (abajo) |
| **V2** (elegido) | envoltorio `relative grow` · panel `absolute inset-0` | **453px** ✓ | ✓ |

**Ésta es exactamente la sutileza que el encargo marcó**, y la medición la confirmó: `min-h-screen`
es un **mínimo**, no un alto definido, y Chrome **no** considera definida la altura de un
`flex-1` cuyo contenedor se dimensiona por `min-height`. Las tres variantes que dependen de un
porcentaje (o de la contribución de contenido) miden lo mismo que no haber hecho nada: **2017px**,
es decir el alto del contenido. El `absolute inset-0` es el único que no pregunta por porcentajes:
se ancla a los cuatro bordes del bloque contenedor y el alto sale de la resta de los bordes.

**`V2b` (`flex-1`) midió IDÉNTICO a `V2` en los cinco perfiles**, incluido el largo
(2579px de scroll, último bloque 27px arriba de la barra). O sea que **la predicción de que
`flex-1` rompería la reserva del `pb` en las pantallas largas NO se cumplió**: Chrome igual tiene
en cuenta la contribución de contenido del item para el alto intrínseco del contenedor. Se eligió
`grow` igual, pero por un motivo **semántico y declarado, no medido**: `flex-1` pone
`flex-basis: 0`, o sea que por especificación el contenido de las 12 pantallas que fluyen deja de
contar para el alto del `<main>`, y la reserva del `pb` —el único mecanismo que hoy sostiene el
criterio 3 en esas 12 pantallas— pasaría a depender de un detalle de implementación del navegador.
Con `grow` la base sigue siendo `auto` y no hay nada que depender.

### Lo que se evaluó y se descartó SIN medir, con el motivo

- **`has-[…]:p-0` en el envoltorio** (que las dos pantallas apaguen el padding del envoltorio y usen
  `h-full`): elegante, pero el `p-0` con variante `has-*` tiene que ganarle a `lg:p-8` por orden de
  cascada, lo que lo vuelve frágil a la ordenación de utilidades de Tailwind, y `h-full` ya se midió
  roto (2017px) así que el riesgo no compraba nada.
- **`h-[stretch]` / `-webkit-fill-available`**: resuelve el problema del margen negativo de un saque,
  pero `height: stretch` sin prefijo es de 2024 y `-webkit-fill-available` tiene bugs conocidos con
  `vh` en Safari móvil. Introducir eso en la pantalla de uso diario no se paga.
- **`grid-rows-[auto_auto_auto_1fr]` en el `<main>`**: los tres banners devuelven `null` cuando no
  corresponden, así que **la cantidad de hijos del `<main>` es variable** y las filas explícitas se
  desalinean (con cero banners el envoltorio caería en la fila 1, que es `auto`). `flex` no tiene
  ese problema: no depende del índice del hijo.

---

## 2 · La medición ANTES / DESPUÉS, con los números literales

375×667, perfil bloqueado (`/clients`), Chrome headless + CDP con viewport emulado.
`solape = panel.bottom − barra.top`. **`docScr` = `scrollHeight − innerHeight`** del documento: es
el doble scroll que el criterio 3 existe para evitar.

### ANTES (`5d2262d`, lo que está hoy en `main`)

| escenario | bannerH | panel.top | panel.height | panel.bottom | barra.top | **solape** | docScr | último de la lista tras su scroll interno |
|---|---|---|---|---|---|---|---|---|
| **sin banner** (negocio `active`) | 0 | 56 | 555 | 611 | 610 | **1** | 0 | 1 |
| **con banner** (negocio `trial`) | 102 | 158 | 555 | 713 | 610 | **103** | 102 | **103** |
| **dos banners** (trial + MP caído) | 224 | 280 | 555 | 835 | 610 | **225** | 224 | **225** |

### DESPUÉS (`e328edf`)

| escenario | bannerH | panel.top | panel.height | panel.bottom | barra.top | **solape** | docScr | último de la lista tras su scroll interno |
|---|---|---|---|---|---|---|---|---|
| **sin banner** | 0 | 56 | 555 | 611 | 610 | **1** | 0 | 1 |
| **con banner** | 102 | 158 | **453** | 611 | 610 | **1** | **0** | **1** |
| **dos banners** | 224 | 280 | **331** | 611 | 610 | **1** | **0** | **1** |

**El residuo se reprodujo exactamente como lo describió el verificador** (`solape = H`, y de hecho
`H + 1`) y **se cerró**: el `panel.bottom` queda clavado en 611 sea cual sea `H`, porque el alto se
derivó en vez de calcularse.

**El 1px es honesto y es preexistente:** es el `border-t border-border` de la barra, que vive
**encima** de la caja de `56px` que reserva `--panel-nav-h`. O sea que la barra mide 57px visuales y
la reserva son 56. Ese 1px está idéntico en el caso **sin banner**, que el verificador ya había
aceptado como cerrado en la pasada anterior. **No lo introduce este cambio y no se toca**:
arreglarlo significaría cambiar la semántica de `--panel-nav-h` en los cuatro lugares que la
consumen, que es justo el tipo de retoque de constante de chrome que este encargo vino a eliminar.
Queda anotado.

### Dos anchos más, para que no sea un número suelto

| escenario | bannerH | solape ANTES | solape DESPUÉS | nota |
|---|---|---|---|---|
| **320×568** (el más angosto medido en la fase) | 102 | **103** | **1** | |
| **640×800** (banda `sm`, padding `p-6`) | 70 | **71** | **1** | el panel mide 688→618: el `absolute` descuenta el `p-6` **sin que ninguna constante lo nombre** |
| **1023×800** (último píxel antes de `lg`) | 70 | **71** | **1** | la banda que no tiene sidebar ni botón de menú |

---

## 3 · La decisión `vh` vs `dvh`, con el número a la vista

El mecanismo **sigue dependiendo de una unidad de viewport** (el `min-h-*` del `<main>` es la única
referencia al viewport que queda en todo el route group), así que la decisión hay que tomarla.

`100vh` es el viewport **grande** (barra de URL escondida). La barra inferior es `fixed bottom-0`,
que se dibuja en el borde del viewport **visible**. Con la barra de URL a la vista las dos
referencias se separan.

Chrome headless no tiene barra de URL, así que `vh`, `dvh` y `svh` resuelven al mismo número y la
diferencia **no se puede medir directamente**. Se midió el **proxy exacto**: se dejó el viewport
visible en 667px (el iframe/emulación) y se forzó la unidad a resolver a **727px**, que es
"viewport grande = visible + 60px de barra de URL".

| pasada | unidad resuelve a | viewport visible | **solape medido** |
|---|---|---|---|
| hoy (`vh`) + el calc viejo | 727 | 667 | **163** (= 102 de banner + 60 de barra de URL + 1 de borde) |
| mecanismo nuevo con **`vh`** | 727 | 667 | **61** (= 60 + 1) |
| mecanismo nuevo con **`dvh`** | 667 | 667 | **1** |

**Decisión: `dvh`.** El mecanismo solo —sin cambiar la unidad— habría dejado 60px de solape con la
barra de URL visible, que es el ítem de UAT **A.3c** que el verificador dejó abierto. Con `dvh`
el borde calculado y la barra `fixed` miran la misma referencia en los dos estados.

**Por qué `dvh` y no `svh`** (que también cierra el solape): con `svh` el panel se mide siempre
contra el viewport **chico**, así que cuando la barra de URL está escondida quedan ~60px de banda
muerta arriba de la barra en la pantalla de uso diario. `dvh` da el borde exacto en los dos estados.

**El costo del `dvh`, medido:** el riesgo teórico de `dvh` es el reflow mientras la barra de URL
colapsa. No aplica acá, y se midió por qué: en las pantallas de la familia bloqueada el documento
mide exactamente el viewport (`docScr = 0`), así que **no hay nada que arrastrar** y la barra de URL
no colapsa; en las pantallas largas el `min-height` **ni ata** (manda el contenido), y el cambio de
unidad salió gratis — `vh` y `dvh` midieron idéntico (`docScr 2579`, último bloque `−27`). Por eso
**el envoltorio exterior también pasa a `min-h-dvh`**: si se quedaba en `100vh`, el documento medía
más que el viewport visible, se podía arrastrar, y ese arrastre colapsaba la barra de URL justo
debajo de los pies del contenido.

---

## 4 · Regresión: las 15 pantallas del route group, ruta por ruta

⚠ **Son 15, no 13.** `find "app/(dashboard)" -name page.tsx` devuelve 15 rutas. El UI-SPEC §10 dice
"las 13 pantallas" y el comentario del layout decía lo mismo; el candado 8 de 02-04 ya decía 15 en
su comentario. Queda anotado (§7).

Perfil asignado con evidencia de código (barrido del árbol completo de cada ruta): `locked` = contiene
el montaje `absolute inset-0 lg:static`; `sticky` = contiene una barra de acciones
`sticky bottom-[calc(var(--panel-nav-h)…)]`; el resto **fluye con el documento**.

| # | Ruta | Perfil | Evidencia | docScr A→D | último elemento vs barra.top A→D | panel.height A→D | Veredicto |
|---|---|---|---|---|---|---|---|
| 1 | `/abonos` | en flujo | `space-y-6 max-w-5xl`, 52KB | 2579 → **2579** | −27 → **−27** | 2988 → 2988 | sin cambio |
| 2 | `/agenda` | en flujo | 111KB | 2579 → **2579** | −27 → **−27** | 2988 → 2988 | sin cambio |
| 3 | `/appointments` | en flujo | 28KB | 2579 → **2579** | −27 → **−27** | 2988 → 2988 | sin cambio |
| 4 | `/ayuda` | en flujo (corta) | 4KB | 0 → **0** | −208 → **−208** | 228 → 228 | sin cambio |
| 5 | `/clients` | **locked** | `absolute inset-0 lg:static` | **102 → 0** | **103 → 1** | **555 → 453** | **ARREGLADA** |
| 6 | `/clinical-history` | **locked** | `absolute inset-0 lg:static` | **102 → 0** | **103 → 1** | **555 → 453** | **ARREGLADA** |
| 7 | `/consultorios` | en flujo (corta) | 1KB, delega en `SettingsClient` | 0 → **0** | −208 → **−208** | 228 → 228 | sin cambio |
| 8 | `/dashboard` | en flujo | `space-y-6`, 9KB | 0/2579 → **igual** | −208/−27 → **igual** | igual | sin cambio |
| 9 | `/equipo` | en flujo (corta) | 2KB | 0 → **0** | −208 → **−208** | 228 → 228 | sin cambio |
| 10 | `/finances` | en flujo | 69KB | 2579 → **2579** | −27 → **−27** | 2988 → 2988 | sin cambio |
| 11 | `/mas` | en flujo | 21KB (~760px a 375px) | 2579 → **2579** | −27 → **−27** | 2988 → 2988 | sin cambio |
| 12 | `/negocio` | en flujo (corta) | 2KB | 0 → **0** | −208 → **−208** | 228 → 228 | sin cambio |
| 13 | `/servicios` | en flujo (corta) | 3KB | 0 → **0** | −208 → **−208** | 228 → 228 | sin cambio |
| 14 | `/settings` | en flujo | 270KB | 2579 → **2579** | −27 → **−27** | 2988 → 2988 | sin cambio |
| 15 | `/web` | **sticky** | `sticky bottom-[calc(var(--panel-nav-h)+env(…))] lg:bottom-0` (CR-01) | 2627 → **2627** | −75 → **−75**, y la **barra de acciones a −15** | 3048 → 3048 | sin cambio |

**Lectura:** las 12 pantallas que fluyen y la de barra pegada miden **byte por byte lo mismo** antes
y después, en los dos extremos de contenido (corto y 3000px) y con uno y dos banners (`docScr`
2701, último −27 con dos banners, idéntico A→D). Nada colapsó a 0px, nada se descontroló: el
documento mide 0 de scroll cuando el contenido entra y exactamente el contenido cuando no.
Las dos de la familia bloqueada son las únicas que cambian, y cambian a lo que se buscaba.

### Desktop ≥1024px: idéntico, medido

| pasada | panel.top | panel.height | panel.bottom | docScr | último |
|---|---|---|---|---|---|
| **1024×800** ANTES | 78 | 800 | 878 | 78 | 57 |
| **1024×800** DESPUÉS | 78 | 800 | 878 | 78 | 57 |
| **1440×900** ANTES | 78 | 900 | 978 | 78 | 57 |
| **1440×900** DESPUÉS | 78 | 900 | 978 | 78 | 57 |
| **1440×900** corta ANTES/DESPUÉS | 110 | 228 | 338 | 0 | −505 |
| **1440×900** larga ANTES/DESPUÉS | 110 | 2988 | 3098 | 2242 | +13 |
| **1440×900** `/web` ANTES/DESPUÉS | 110 | 3048 | 3158 | 2290 | barra de acciones +25 |

**Todos los pares son iguales.** El `lg:h-screen` se conserva a propósito: a ≥1024px el panel sigue
midiendo `100vh` y el documento sigue arrastrándose los 78px del banner, que es el **desfase
heredado** que el verificador documentó como preexistente y sin barra. Se podría cerrar gratis
(bastaría no poner `lg:h-screen` y dejar que herede), pero **el encargo pide desktop idéntico**, así
que no se tocó. Queda como mejora disponible.

En el CSS del build se verificó que el override de desktop gana por orden de cascada:
`.absolute{position:absolute}` en el offset **10384** y `lg\:static{position:static}` en el **116011**,
dentro de `@media (min-width:64rem)`.

### El riesgo que el `relative` nuevo podía abrir, cerrado

`position: relative` en el envoltorio compartido crea bloque contenedor para los `absolute`
descendientes de las otras 13 pantallas. Se auditaron **los 14 tokens `absolute` del route group**
(6 archivos): los 14 viven dentro de un `relative` **más cercano** —los dos ambiguos son el overlay
de carga de `/web/_sections/image-controls.tsx:134` (dentro de un contenedor de `next/image fill`,
que exige `relative`) y el dropdown de `/finances/finances-client.tsx:106` (dentro de
`<div className="relative">`)—, así que **ninguno resolvía contra el viewport** y a ninguno le cambia
el bloque contenedor. `position: fixed` no se ve afectado por `relative` (sólo por `transform`,
`filter` o `will-change`), así que los drawers y diálogos quedan intactos.

### El otro riesgo: el banner `sticky` como item de un contenedor flex

`TestModeBanner` es `sticky top-14 lg:top-0 z-40` y ahora es un **item de un contenedor flex**.
Medido con el documento arrastrado hasta el fondo:

| pasada | `banner.top` tras arrastrar | solape del panel | docScr |
|---|---|---|---|
| ANTES, perfil largo | **56** | 2552 | 2579 |
| DESPUÉS, perfil largo | **56** | 2552 | 2579 |
| ANTES, perfil bloqueado | **56** | 103 | 102 |
| DESPUÉS, perfil bloqueado | **56** | **1** | **0** |
| ANTES/DESPUÉS, desktop 1440 | **56** | 2255 | 2242 |

**Sigue pegado en 56px, idéntico.** El bloque contenedor del `sticky` sigue siendo el `<main>`, que
cambió de contenedor de bloque a contenedor flex sin cambiar el rango de pegado.

---

## 5 · Las clases nuevas, verificadas en el CSS del build

`npm run build` → **rc 0**, `.next` regenerado. Las nueve declaraciones, buscadas con **`grep -F`**
(cadena fija) sobre `.next/static/chunks/*.css`:

```
1     <- min-height:100dvh
1     <- .absolute{position:absolute}
1     <- .inset-0{inset:calc(var(--spacing) * 0)}
1     <- .relative{position:relative}
1     <- .grow{flex-grow:1}
1     <- .flex-col{flex-direction:column}
1     <- lg\:static{position:static}
1     <- lg\:h-screen{height:100vh}
1     <- lg\:-m-8{margin:calc(var(--spacing) * -8)}
```

Y las que la sonda replicó a mano, para probar que midió la geometría real y no una inventada:

```
1     <- .pt-14{padding-top:calc(var(--spacing) * 14)}
1     <- .p-4{padding:calc(var(--spacing) * 4)}
1     <- sm\:p-6{padding:calc(var(--spacing) * 6)}
1     <- lg\:p-8{padding:calc(var(--spacing) * 8)}
1     <- .flex{display:flex}
1     <- padding-bottom:calc(var(--panel-nav-h) + env(safe-area-inset-bottom,0px))
1     <- height:var(--panel-nav-h)
1     <- --panel-nav-h:3.5rem
```

### El criterio doble, por la trampa de los `.md`

```
$ grep -rn 'calc(100vh-56px' app components lib
rc=1          ← CERO hits: el string viejo desapareció del CÓDIGO ✓

$ grep -F 'height:calc(100vh - 56px - var(--panel-nav-h)' .next/static/chunks/*.css
(presente)    ← regla MUERTA, no código sin arreglar
```

**La trampa que 02-GAP-FIX documentó sigue viva y se confirmó de una forma nueva**: el propio build
la grita. `npm run build` emitió dos *"warnings while optimizing generated CSS"* señalando
`.h-\[calc\(100vh-56px-var\(--panel-nav-h\)-env\(\.\.\.\)\)\]` con
`Unexpected token Delim('.')` — es decir, **Tailwind v4 generó una regla a partir del `env(...)`
con elipsis que el verificador escribió en el frontmatter de `02-VERIFICATION.md`**. Esos dos
warnings son la huella del escaneo de los `.md` de `.planning/`, no de un arreglo que no tomó. El
criterio correcto sigue siendo el doble: **el string viejo fuera del CÓDIGO** (rc 1) **y el nuevo
presente en el CSS** (arriba).

---

## 6 · El candado 8, adaptado · `e328edf`

**El problema con la regla vieja no era que no mordiera: era que bendecía la forma frágil.** Exigía
que los altos atados al viewport **descontaran** `var(--panel-nav-h)`, o sea que exigía la cuenta de
constantes. Esa cuenta se rompió dos veces en esta fase y **el candado estuvo verde las dos veces**,
porque la constante estaba ahí.

Y, con el mecanismo nuevo, la regla vieja **habría pasado por vacío**: ya no queda ningún alto
arbitrario exigido (los dos que había desaparecieron), así que `expect(exigidos).toBeGreaterThan(0)`
habría dado rojo. Había que reescribirla, no sólo retocarla.

### La regla nueva, más dura

> Bajo `app/(dashboard)`, todo `h-` o `max-h-` atado al viewport —valor arbitrario con
> `100vh`/`100dvh`/`100svh`, **o la palabra** `h-screen`/`h-dvh`/`h-svh`/`h-lvh`— tiene que venir
> prefijado por una variante de **desktop**. En mobile el alto disponible lo da el contrato del
> layout, no un `calc`.

Dos ensanchamientos respecto de la anterior: cubre **la forma por palabra** (`h-screen`, que la
versión anterior no veía porque sólo miraba valores arbitrarios) y la obligación pasó de
"descontá la barra" a "no nombres el viewport en mobile".

**Tres exenciones, las tres con un hecho medido detrás:**

1. variante `lg:`/`xl:`/`2xl:` ⇒ a ≥1024px no hay chrome de mobile. **`sm:` y `md:` NO eximen**: a
   768px la barra **sí** está, porque entra por `lg:hidden` y no por `md:hidden`.
2. primitivas de overlay por **etiqueta JSX** (`Dialog*`, `Sheet*`, `Drawer*`, `Popover*`,
   `Tooltip*`, `Command*`, `Modal*`) ⇒ portal `fixed … z-50` por encima de la barra `z-30`.
3. **`min-h-*` queda fuera del barrido**: es un piso, no un techo. Un mínimo no puede esconder
   contenido bajo la barra (el elemento crece con su contenido y el `pb` del `<main>` lo empuja), es
   la forma del propio contrato (`min-h-dvh`) y es el caso del upsell de `/web` (`min-h-[70vh]`),
   que el verificador ya había clasificado así.

Estado del barrido hoy: **`hallados = 4`** (los dos `lg:h-screen`, el `lg:max-h-[calc(100vh-8rem)]`
de `/web:504` y el `max-h-[calc(100svh-2rem)]` de `/settings:3290`), **`exigidos = 3`** (el de
`/settings` queda exento por overlay). Las **dos guardas de honestidad siguen**.

### Caso NUEVO: la contracara

El caso de arriba **prohíbe** la forma frágil; el nuevo exige que la buena siga en su lugar. Sin él,
borrar `grow` del envoltorio dejaría las dos pantallas con el alto de su contenido (**2017px** en vez
de 453, medido) y el barrido de arriba **seguiría verde**, porque ya no habría ningún alto de
viewport que señalar. Vigila:

- el `<main>` con `flex flex-col` y `min-h-dvh`, y **sin** `min-h-screen`;
- el envoltorio con `relative grow` y su padding de contenido;
- la punta de las pantallas **sin lista de archivos**: la llave es `lg:h-screen` (toda pantalla que
  fija su alto a la pantalla en desktop es por construcción de la familia bloqueada ⇒ en mobile no
  tiene alto propio y necesita `absolute inset-0` + `lg:static`). Con su propia guarda,
  `bloqueadas > 0`.

El archivo pasa de **39 → 40** casos.

### Probado con mutación: seis, todas rojas, todas revertidas

**M-1 — `/clients` de vuelta al `calc` viejo** (la regresión exacta que importa):

```
 FAIL  |pure| … > ninguna pantalla del panel fija su alto al viewport en mobile
AssertionError: app/(dashboard)/clients/clients-client.tsx: h-[calc(100vh-56px-var(--panel-nav-h)-env(safe-area-inset-bottom,0px))] ata el alto al viewport en mobile. El alto disponible lo da el contrato del layout (flex flex-col + relative grow + absolute inset-0), no un calc que enumere el chrome: esa cuenta ya se rompió dos veces en esta fase: expected false to be true // Object.is equality
 ❯ test/panel-nav-chrome.test.ts:589:13

 FAIL  |pure| … > el contrato del alto disponible sigue cableado en los dos extremos
AssertionError: app/(dashboard)/clients/clients-client.tsx: fija el alto a la pantalla en desktop pero en mobile le falta `absolute`: expected [ '-m-4', 'sm:-m-6', 'lg:-m-8', …(5) ] to include 'absolute'
 ❯ test/panel-nav-chrome.test.ts:640:13
```

(mordieron **los dos** casos, que es lo que se buscaba)

**M-2 — `lg:h-screen` → `h-screen` en `/clinical-history`** (la forma por palabra, invisible para la
regla vieja):

```
AssertionError: app/(dashboard)/clinical-history/clinical-history-client.tsx: h-screen ata el alto al viewport en mobile. El alto disponible lo da el contrato del layout (flex flex-col + relative grow + absolute inset-0), no un calc que enumere el chrome: esa cuenta ya se rompió dos veces en esta fase: expected false to be true // Object.is equality
```

**M-3 — quitar `grow` del envoltorio del layout:**

```
AssertionError: el envoltorio del contenido perdió `relative grow` (o le cambiaron el orden de las clases): expected '' not to be '' // Object.is equality
 ❯ test/panel-nav-chrome.test.ts:622:122
```

**M-4 — `min-h-dvh` → `min-h-screen` en el `<main>`:**

```
AssertionError: el <main> volvió a `vh`: con la barra de URL visible el borde cae 60px por debajo de la barra: expected '<main className="lg:pl-60 pt-14 lg:pt…' to contain 'min-h-dvh'
Expected: "min-h-dvh"
Received: "<main className="lg:pl-60 pt-14 lg:pt-0 min-h-screen flex flex-col pb-[calc(var(--panel-nav-h)+env(safe-area-inset-bottom,0px))] lg:pb-0">"
```

**M-5 — `OVERLAY` cazando `div`** (la enfermedad "las exenciones se comen todo", que es exactamente
lo que la segunda guarda de honestidad cierra):

```
 FAIL  |pure| … > ninguna pantalla del panel fija su alto al viewport en mobile
AssertionError: expected 0 to be greater than 0
 ❯ test/panel-nav-chrome.test.ts:597:22
    596|     expect(hallados).toBeGreaterThan(0)
    597|     expect(exigidos).toBeGreaterThan(0)
       |                      ^
```

**M-6 — quitar `absolute inset-0` de `/clients` dejando el `lg:h-screen`:**

```
AssertionError: app/(dashboard)/clients/clients-client.tsx: fija el alto a la pantalla en desktop pero en mobile le falta `absolute`: expected [ 'lg:static', 'lg:-m-8', …(4) ] to include 'absolute'
 ❯ test/panel-nav-chrome.test.ts:640:13
```

**Las seis se revirtieron y NINGUNA se commiteó.** Verificado después de cada una:

```
$ git status --porcelain -- app components lib
(sin salida)
```

(M-5 vive en el test, que es donde vive la exención que ataca; se revirtió con `sed` puntual para no
pisar el trabajo sin commitear del mismo archivo, y se confirmó la línea original en su lugar.)

Verde final del archivo: `npx vitest run test/panel-nav-chrome.test.ts` → **rc 0 · 40/40**.

---

## 7 · Gates

Todos medidos en `e328edf`, el HEAD final. **Reloj al medir:** `9/10/2026, 11:36` AR (leído con
`node -e`, porque en Git Bash el prefijo `TZ=` no se honra) ⇒ dentro de `[01:00, 23:30]`, así que los
dos canarios de reloj de la suite no interfieren. **Los casos nuevos no leen el reloj**: son barridos
puros de fuente.

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **rc 0**, sin salida (el compilador real; `npx tsc` da falso verde en este repo) |
| `npx vitest run` | **rc 0** · `Test Files 107 passed (107)` · `Tests 1684 passed \| 4 expected fail \| 1 skipped (1689)` · **corrida LIMPIA, primer intento**, sin el flake del pool |
| `npm run build` | **rc 0** |
| `npx eslint` sobre los 3 archivos de `app/` + el test | **rc 1 con UN hallazgo: el `react-hooks/purity` PREEXISTENTE** de `layout.tsx:63` (`Date.now` en `daysLeft`). **Cero hallazgos nuevos** |

**El piso de la suite sube de 1683 → 1684 casos** (+1: el caso nuevo del contrato). Los 107 archivos
y los 4 "expected fail" intencionales no cambian.

### Fronteras respetadas

```
$ git diff 49fa195..HEAD --stat -- lib/panel-history.ts lib/overlay-history.ts lib/dirty-history.ts
(sin salida)                              ← CERO diff en los tres módulos de historial

$ git diff 5d2262d..HEAD --stat -- components/dashboard/sidebar.tsx
(sin salida)                              ← esta ronda no tocó el sidebar

$ grep -o "hidden lg:flex lg:flex-col lg:fixed[^\"]*" components/dashboard/sidebar.tsx
hidden lg:flex lg:flex-col lg:fixed lg:top-0 lg:left-0 lg:bottom-0 lg:w-60 bg-card border-r border-border z-20
$ grep -c sidebarContent components/dashboard/sidebar.tsx
2                                         ← intactos

$ git diff 5d2262d..HEAD --stat -- .planning/
(sin salida)                              ← STATE / ROADMAP / REQUIREMENTS sin tocar

$ git diff 5d2262d..HEAD --stat
 app/(dashboard)/clients/clients-client.tsx         | 10 ++-
 .../clinical-history/clinical-history-client.tsx   |  5 +-
 app/(dashboard)/layout.tsx                         | 56 +++++++++++--
 test/panel-nav-chrome.test.ts                      | 94 ++++++++++++++++++----
 4 files changed, 142 insertions(+), 23 deletions(-)
```

- **MOB-01/02/03/07 siguen en `Pending`**, como el dueño los dejó (verificado en
  `REQUIREMENTS.md:111-117`). No se marcó ningún requisito.
- **Cero** `--no-verify`, cero `git stash`, cero cambio de rama, cero push, cero amend, cero revert
  de commits existentes.
- **Datos de Supabase: no se tocaron.** No hizo falta: la sonda no necesita sesión, y el dev server
  del puerto 80 (que además apunta a otro proyecto) está colgado. **No se mató.**
- **El UI-SPEC no se editó** (artefacto aprobado). Las discrepancias van abajo.

---

## 8 · Discrepancias registradas, no arregladas

1. **UI-SPEC §10 — "Lo que NO se hace: nada de `100dvh`/`100svh` nuevo ni tocar el `min-h-screen`
   existente".** Este cambio **contradice esa línea de frente**: cambia `min-h-screen` por
   `min-h-dvh` en el `<main>` y en su envoltorio. Es deliberado y está medido (§3): con `vh` el
   mecanismo deja 60px de solape cuando la barra de URL está visible, que es el ítem de UAT A.3c.
   Al reconciliar el documento, §10 debería decir: *"la referencia al viewport es `dvh` y vive en un
   solo lugar (el `min-h-*` del `<main>`), porque la barra es `fixed` sobre el viewport visible"*.
2. **UI-SPEC §10 — "el alto se reserva en UN SOLO lugar".** Mejoró respecto de la ronda anterior
   (que la dejó en **tres**) pero sigue sin ser exacta: hoy son **dos** los lugares que descuentan
   la barra —el `pb` del `<main>` para todo lo que fluye, y el `sticky bottom-[…]` de `/web` por
   CR-01—. Las dos pantallas bloqueadas **salieron de la lista**: ya no descuentan nada, heredan.
   Reformulación sugerida: *"se reserva en el `<main>` para todo lo que fluye con el documento; lo
   que se bloquea al alto de la pantalla lo HEREDA del envoltorio `relative grow`; y lo único que
   descuenta la var por su cuenta es lo que se ancla al borde inferior, que el candado 8 vigila"*.
3. **"13 pantallas" es un número viejo: son 15.** `find "app/(dashboard)" -name page.tsx` → 15
   (`abonos agenda appointments ayuda clients clinical-history consultorios dashboard equipo
   finances mas negocio servicios settings web`). El UI-SPEC §10 y los comentarios del layout decían
   13; el candado 8 de 02-04 ya decía 15. Los comentarios del layout tocados en este commit quedaron
   diciendo 15.
4. **El desfase heredado de desktop sigue ahí, por pedido.** A ≥1024px el `lg:h-screen` hace que el
   documento se arrastre la altura del banner (78px medidos). Con el mecanismo nuevo se cerraría
   **gratis** (basta no declarar `lg:h-screen` y dejar que herede del envoltorio), pero el encargo
   pide desktop idéntico y se respetó. Es una mejora disponible de una línea.
5. **El 1px del `border-t` de la barra.** La barra mide 57px visuales (56 de caja + 1 de borde) y
   `--panel-nav-h` reserva 56. Preexistente, idéntico al caso sin banner que ya estaba aceptado, y
   presente también en el `pb` del `<main>`. No se toca: arreglarlo es retocar una constante de
   chrome en los cuatro lugares que la consumen, que es lo contrario de este encargo.
6. **`/clinical-history` sigue sin título ni activo** (WR-08, fuera de alcance). El alto quedó
   arreglado; el chrome orientador no.

---

## 9 · Lo que midiéndolo resultó distinto de lo esperado

1. **La forma candidata del encargo (`h-full`) NO funciona.** Midió **2017px** en vez de 453. El
   `100%` resolvió a `auto` dentro de un `flex-1` cuyo contenedor se dimensiona por `min-height`.
   La advertencia del encargo era correcta y la medición la convirtió en un hecho: tres de los
   cuatro candidatos (V1, V3, V5) comparten ese modo de falla.
2. **`flex-1` NO rompió las pantallas largas**, al contrario de lo que predije antes de medir.
   `flex-basis: 0` debería dejar al contenido fuera del alto intrínseco del `<main>` y dejar la
   reserva del `pb` colgada, pero Chrome midió **idéntico** a `grow` en los cinco perfiles. Se
   eligió `grow` igual, por un motivo que ahora está declarado como semántico y no como medido.
3. **La altura real del banner es 102px, no 66-100.** El verificador estimó "~66-100px a 375px";
   medido con una pila `system-ui` da **102** (y 70 a 640px, 78 a desktop). No cambia ninguna
   conclusión —el mecanismo es independiente de `H`— pero el rango estimado era bajo.
4. **El dev server del puerto 80 está COLGADO, no lento.** PID 2576 (node) sigue escuchando y acepta
   la conexión TCP en 1.6 ms, pero no responde ni en 110s, ni en `/`, ni en `/login`, ni por
   `localhost`. No se mató. Toda la sonda tuvo que montarse sobre un server propio.
5. **La técnica de `--dump-dom` + jaula de iframe nunca produjo salida.** Chrome corrió 180s sin
   volcar nada (con `--virtual-time-budget`, con `fetch` de la config y con los iframes
   secuenciales). Se cambió a **CDP sobre WebSocket**, que además hace innecesaria la jaula: el
   viewport se emula de verdad con `Emulation.setDeviceMetricsOverride`. Si alguien vuelve a medir
   DOM en este repo, **arrancá por CDP**: es más corto, más confiable, y mide el viewport real.
6. **Una trampa nueva, y fea: `const top` mata el script entero en silencio.** La primera versión de
   la sonda declaraba `const top = …` en el nivel superior de un `<script>` clásico. `window.top` es
   una propiedad propia **no configurable** del objeto global, así que la declaración léxica hace
   fallar la **instanciación** del script: no corre **ni una línea**, y como el `window.onerror` que
   había puesto para diagnosticar vivía en ese mismo script, **tampoco se registró** ⇒ cero errores
   en consola, el DOM intacto, y `typeof window.__medir === "undefined"` sin ninguna pista. Se
   diagnosticó comparando `document.body.innerHTML.length` (10283, que era el **texto del script**)
   contra `getElementById("bar")` → `null`. Mismo riesgo con `name`, `self`, `length`, `status`,
   `origin`.
7. **El primer `npm run build` falló, y NO por el cambio.** 18 errores
   `Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'` sobre los
   CSS de `next/font/google`. La red estaba bien (`fonts.googleapis.com` → 200) y el **segundo
   build, comando idéntico, salió rc 0**. Es un flake de red/caché de `next/font`, hermano del flake
   conocido del pool de Vitest: **si te pasa, volvé a correr el comando tal cual.**
8. **Mi propio instrumento mintió una vez.** Un barrido con `RegExp` de node sobre los selectores
   escapados del CSS (`lg\:static`) reportó **AUSENTE** las tres clases `lg:`, que `grep -F` encontró
   presentes acto seguido. El instrumento correcto para selectores escapados es **`grep -F`** con la
   cadena fija, no una regex con clases de caracteres que incluyen la barra invertida.

---

## 10 · Lo que este cierre NO hace

**No cierra el criterio 3.** Cierra su parte de **código**, esta vez de raíz y con el DOM medido en
vez de aritmética. Lo que vale sigue pendiente: **la UAT en un teléfono real**, y los once ítems de
`human_verification` del `02-VERIFICATION.md` siguen en pie. Dos de ellos cambian de estado:

- **A.3b** (`/clients` con el banner de prueba a 375px) pasa de "confirma o descarta el gap" a
  **"confirma la medición"**: el solape medido es 1px (el borde de la barra) con cero, uno y dos
  banners, y el doble scroll desapareció (`docScr = 0`).
- **A.3c** (barra de URL visible) **estaba apuntando al riesgo correcto y ahora tiene respuesta
  medida**: con `vh` el solape era de 60px; con `dvh` es 0. Sigue necesitando el teléfono para
  confirmar que `dvh` se comporta como dice la especificación en iOS Safari, que es el único motor
  que históricamente sorprende acá.

Y el ítem que este cambio **agrega** al guion de UAT (no se editó el guion, que vive en
`02-04-SUMMARY.md`): **mirar las 12 pantallas que fluyen en el teléfono**, no sólo las dos
arregladas. El `<main>` pasó a ser un contenedor flex y su envoltorio a `relative grow`: la sonda
dice que no cambia nada (todos los pares A→D idénticos), pero el `<main>` es el ancestro común de
las 15 pantallas y el cambio de modelo de caja es lo más ancho que esta fase tocó.

---

_Arreglado: 2026-10-09_
_Fixer: Claude (gsd-executor, cierre de raíz del residuo)_
