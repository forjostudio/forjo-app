# 261009-tze — Sacar el zoom automático de iOS en los inputs del panel

**Estado:** hecho. 5 commits sobre `main` (`e12d133` → `2881ee3`).
**Gates:** `tsc` rc 0 · `vitest` rc 0 (109 archivos / 1710 casos) · `build` rc 0 · `eslint` sin hallazgos nuevos (medido contra el base).

---

## 1 · El inventario, re-medido

Lo re-medí yo con el detector correcto. **No coincide con el todo**, y la diferencia no viene de los dos
cambios que entraron después (`261009-tzd` y `261009-tzf` no tocaron ningún `className` de input):
viene de que **el barrido del todo sólo contaba `<Input>` y `<Textarea>`**.

| | Todo (2026-10-09) | Re-medido |
|---|---|---|
| Campos editables del panel | 88 | **92** |
| Por debajo de 16px en mobile | 16 | **24** |
| Archivos `.tsx` del panel | — | 46 |

Los 16 del todo están **exactos, archivo por archivo** — su medición de `<Input>`/`<Textarea>` era
correcta. Lo que faltaba son **8 campos más**, de dos clases que su lista de componentes no miraba:

| Hallazgo | Cuántos | Dónde | Por qué cuenta |
|---|---|---|---|
| `<TimeField>` | **4** | `agenda-client.tsx` (2 de cada fila de bloque + 2 del horario especial) | Envuelve un `<Input>` y le pasa el `className` derecho. Es editable *a propósito*: existe justamente para abrir el teclado numérico (`inputMode="numeric"`) en vez de la ruedita del reloj. iOS le hace el mismo zoom. |
| `<input type="number">` | **4** | steppers de `abonos-client`, `agenda-client`, `settings-client`, `nuevo-abono-form` | Son los campos del medio de un stepper −/+. Se tipea adentro (`onFocus` les hace `select()`). No usan el componente base, así que la clase ES el font-size efectivo. |

### Desglose de los 24 (= 24 líneas en 9 archivos)

| Archivo | Campos |
|---|---|
| `app/(dashboard)/clients/clients-client.tsx` | 6 (5 `Input` + 1 `Textarea`) |
| `app/(dashboard)/agenda/agenda-client.tsx` | 5 (4 `TimeField` + 1 `input[number]`) |
| `app/(dashboard)/finances/finances-client.tsx` | 4 `Input` |
| `components/dashboard/clinical-history-panel.tsx` | 4 (3 `Input` + 1 `Textarea`) |
| `app/(dashboard)/clinical-history/clinical-history-client.tsx` | 1 `Input` |
| `components/dashboard/categorias-manager.tsx` | 1 `Input` |
| `app/(dashboard)/abonos/abonos-client.tsx` | 1 `input[number]` |
| `app/(dashboard)/settings/settings-client.tsx` | 1 `input[number]` |
| `components/dashboard/nuevo-abono-form.tsx` | 1 `input[number]` |

### Lo que barrí y dejé fuera, con el motivo

- **Los otros 16 `<input>` nativos del panel** son `checkbox`, `radio` y `file`. No son editables de
  texto, no abren teclado, no hay zoom que disparar.
- **`components/crm/crm-topbar.tsx`** tiene 1 `<input>` en `text-sm`. Barrí el repo entero por si
  había inputs del panel en otro lado, y éste es el único que apareció — pero es del **CRM**
  (`/admin`, pantalla de escritorio del operador), no del panel. Fuera de scope; lo dejo anotado.
- **`components/ui/*`** no se tocan: son compartidos con el landing y con la página pública de
  reservas. Además no hacía falta — el base ya estaba bien (ver §3).
- **`PasswordInput`** envuelve un `<Input>` y ningún call site del panel le pisa el tamaño. Entra al
  candado igual, para cuando aparezca uno.

---

## 2 · Los `<SelectTrigger>`: EXCLUIDOS, y por qué

Hay **2** con `text-xs` (`clients-client.tsx:975` y `:986`, los filtros de la lista). Los dejé como
están, decidido midiendo el componente y no por inercia:

**La regla de iOS es sobre campos *editables*, no sobre "cosas que reciben foco".** El auto-zoom
existe para que el teclado virtual escriba sobre texto legible: Safari amplía cuando el foco cae en un
`<input>` de texto, un `<textarea>` o un `contenteditable` por debajo de 16px. Un `<button>` que recibe
foco no abre teclado, así que no hay nada que ampliar.

**Y el `SelectTrigger` de este repo es un `<button>` nativo.** Verificado leyendo el primitivo
instalado, no de memoria —
`node_modules/@base-ui/react/select/trigger/SelectTrigger.js`:

```
44:  * Renders a `<button>` element.
54:    nativeButton = true,
222: return useRenderElement('button', componentProps, { … })
```

No es un `<select>` nativo (ésos sí tienen historial de zoom en iOS): es un botón que abre un popup
en portal. Quedan en `text-xs`, que es lo que su diseño de filtro compacto pide.

El candado lo deja escrito y preparado: si algún día el trigger pasa a ser un combobox con entrada de
texto, se agrega a la lista `EDITABLES` y el candado lo empieza a exigir solo.

---

## 3 · El arreglo

`text-sm` → `text-base sm:text-sm` en los 24. No hubo ningún `text-xs` entre los campos editables.

**El componente base ya estaba bien** y no se tocó: `components/ui/input.tsx` y `textarea.tsx` usan
`text-base`. El defecto estaba en los call sites, que lo pisaban.

**Lo que el CSS del build no prueba y medí aparte:** que `tailwind-merge` no descarte el `text-base`
nuevo al mergearlo con el base del componente. Sonda con el `cn()` real del repo (sonda temporal,
corrida y borrada — `test/` quedó limpio):

```
ANTES  ->  md:text-sm text-sm
AHORA  ->  md:text-sm text-base sm:text-sm
```

`sm:text-sm` y `md:text-sm` son modificadores distintos: twMerge los deja a los dos y no colisionan con
el `text-base` sin modificador. Resultado por ancho:

| Ancho | Antes | Ahora |
|---|---|---|
| <640px | 14px → **iOS hace zoom** | **16px → iOS no tiene motivo** |
| 640–767px | 14px | 14px |
| ≥768px | 14px | 14px |

**Desktop idéntico**, que era el requisito.

---

## 4 · Verificación en el CSS del build

`npm run build` rc 0, y después `grep` sobre `.next/static/chunks/*.css` — no sobre la fuente:

```
--text-base:1rem;      ← 16px, el umbral exacto de iOS
--text-sm:.875rem;     ← 14px

.text-base{font-size:var(--text-base);…}          offset  52912   (SIN media query ⇒ aplica desde 0px)
.sm\:text-sm{font-size:var(--text-sm);…}          offset 110042   dentro de @media (min-width:40rem)
.md\:text-sm{font-size:var(--text-sm);…}          offset 110938   dentro de @media (min-width:48rem)
```

Las tres clases **existen compiladas** (ninguna quedó en nada), y el orden en el archivo es
`text-base` < `sm:text-sm` < `md:text-sm`, que es el que hace que a ≥640px gane el chico y a <640px
gane el grande.

---

## 5 · `maximum-scale` / `user-scalable`: no aparecen

Grep sobre todo el repo (`.ts`, `.tsx`, `.css`, `.json`, sin `node_modules` ni `.next`) por
`maximum-scale`, `maximumScale`, `user-scalable` y `userScalable`: **cero ocurrencias**. El export
`viewport` de `app/(dashboard)/layout.tsx` sigue con sólo `viewportFit` e `interactiveWidget`.

Era el camino que el dueño preguntó y queda descartado por escrito en el commit y en el candado: le
saca el pinch-zoom a todo el mundo, es falla de **WCAG 1.4.4 (Resize Text)** con la accesibilidad
declarada no negociable en el `CLAUDE.md`, y trata el síntoma. El bloque 4 del candado lo deja clavado
para que no vuelva por la puerta de atrás.

De paso, esto pone el repo **en regla con su propio `CLAUDE.md`**: *"Nunca usar font-size menor a 16px
para texto de cuerpo en mobile"*.

---

## 6 · El candado — `test/panel-input-zoom-ios.test.ts`

Barrido puro: `readdirSync` / `readFileSync` sobre `app/(dashboard)` + `components/dashboard`. Sin DB,
sin navegador, sin reloj. 11 casos en 4 bloques. Cae en el proyecto `pure` de vitest automáticamente
(no importa `./env`).

**Por qué hace falta:** nada en el repo podía denunciar este defecto. No lo ve `tsc`
(`className="h-8 text-sm"` es un string válido), no lo ve `npm run build` (la clase existe y compila
perfecto), no lo ve ninguna suite — ninguna renderiza el panel — y la UAT visual sólo lo encuentra con
un iPhone **real** en la mano: en el simulador de Chrome DevTools el auto-zoom **no pasa**, porque es
comportamiento de Safari en iOS, no del ancho del viewport. Así se acumuló hasta 24 de 92.

### La trampa del regex, evitada y clavada

Recorta la etiqueta de apertura **contando llaves** (`finDeEtiqueta`, heredado tal cual del candado de
`261009-tzd` como sugería el brief, en vez de reinventarlo). Confirmé la trampa en esta sesión: mi
primer detector, `<Input(?=[\s/>])` escrito **dentro de un template literal**, daba **0 sobre 82
`<Input>` reales** — `\s` no es escape válido en un template literal y queda como `s` literal, así que
el regex buscaba `<Input[s/>]`. Es la misma clase de falla que el `[^>]` del todo, entrando por otra
puerta. El detector final usa `(?![A-Za-z0-9_])`, sin escapes que se puedan comer.

Un detalle propio: `blanquearComentarios` reemplaza cada carácter por un espacio y **conserva los
newlines**, al contrario que la versión de `261009-tzd`. Acá el rojo tiene que nombrar la línea, y
borrando de verdad el número sale corrido — medido, 9 líneas de diferencia en `clients-client.tsx`.

### Las guardas de honestidad

`archivos > 20` · `campos > 50` · `campos con tamaño declarado > 10` · **`campos con el chico ya
prefijado > 15`** (medido: 24). La última es la que importa: los 24 arreglados quedaron con un
`sm:text-sm`, que es una clase que el extractor tiene que **ver** y que el clasificador tiene que **no
acusar** — si cualquiera de los dos se rompe, la cuenta se desploma a 0 y el caso se pone rojo en vez
de quedar verde mirando el vacío. Más 3 casos unitarios que fijan las dos trampas del regex y las
nueve formas de declarar el tamaño.

El piso quedó **holgado y no en 24 exactos**, y eso también salió de medirlo: con el número exacto,
bajar un input ponía rojos dos casos (el invariante, correcto, y la guarda, ruido), y borrar un campo
del panel por un motivo legítimo también la habría puesto roja. Commit aparte (`2881ee3`) con la
medición.

### Probado con mutación — los cuatro bloques

**Mutación principal** (bloque 2) — `clients-client.tsx`, el buscador que reportó el dueño, de
`text-base sm:text-sm` a `text-sm` pelado. **Rojo literal:**

```
 FAIL  |pure| test/panel-input-zoom-ios.test.ts > 2 · ningún campo editable del panel queda por debajo de 16px en mobile > no queda ninguno chico
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "app/(dashboard)/clients/clients-client.tsx:1001 <Input> tiene text-sm — usá text-base sm:text-sm",
+ ]
```

El rojo nombra archivo, línea, componente, la clase que lo delata y el arreglo. (La línea 1001 es donde
**abre** el `<Input>`; su `className` está en la 1010 — apunta al campo, no al atributo.)

**Mutación de la guarda de honestidad** — rompí el recorte de la etiqueta volviéndolo al primer `>`,
que es exactamente la trampa histórica. **No** quedó verde:

```
× encuentra campos que declaran su propio font-size   AssertionError: expected 0 to be greater than 10
× encuentra los campos que este arreglo prefijó       AssertionError: expected 0 to be greater than 15
```

**Mutación del bloque 4** — agregué `maximumScale: 1, userScalable: false` al viewport del panel:

```
 FAIL  … 4 · el zoom NO se desactiva a nivel viewport (WCAG 1.4.4) > ningún `viewport` del repo declara maximum-scale ni user-scalable
AssertionError: expected [ 'app/(dashboard)/layout.tsx' ] to deeply equal []
```

**Mutación del bloque 3** — saqué el `text-base` de `components/ui/input.tsx`:

```
 FAIL  … 3 · el componente base sigue siendo el que pone los 16px > `Input` y `Textarea` declaran `text-base`
AssertionError: expected 'import * as React from "react"…' to match /\btext-base\b/
```

Las cuatro mutaciones revertidas con `git checkout --` **después** de commitear, y
`git status --porcelain -- app components lib test` vacío tras cada una. Cero `git stash` (verificado:
`git stash list` vacío), cero cambios de rama, cero `--no-verify`, cero `--amend`, cero push.

---

## 7 · Commits

| SHA | Qué |
|---|---|
| `e12d133` | fix — los 16 `Input`/`Textarea` del panel dejan de disparar el zoom de iOS |
| `cfcf7ad` | fix — los 4 `TimeField` de la agenda tampoco (hallazgo nuevo) |
| `dea69e3` | fix — los 4 steppers numéricos tampoco (hallazgo nuevo) |
| `d6ee14c` | test — el candado |
| `2881ee3` | test — el piso de la guarda de prefijados, holgado y no 24 exactos |

Los 5 con el trailer verificado con `git log -1 --format=%B`.

---

## 8 · Gates

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **rc 0** |
| `npx vitest run` | **rc 0** — `Test Files 109 passed (109)` · `Tests 1710 passed \| 4 expected fail \| 1 skipped (1715)`. Piso 108/1699 → +1 archivo, +11 casos. Corrida limpia a la primera, sin flake del runner. |
| `npm run build` | **rc 0** a la primera, sin el flake de red de las fuentes |
| `eslint` | **cero hallazgos nuevos** (ver abajo) |

**El lint, medido y no asumido.** `rc 1` con `14 problems (14 errors, 0 warnings)`. Son preexistentes, y
lo probé en vez de darlo por obvio: restauré los 9 archivos al estado base (`git checkout 3093dd0 --`,
sin stash ni cambio de rama), corrí el mismo `eslint`, y el base da **las mismas `14 problems
(14 errors, 0 warnings)`** — con el mismo reparto (`react-hooks/immutability` ×6, `purity` ×3,
`set-state-in-effect` ×5). El run de HEAD incluye además el candado nuevo y sigue en 14, así que el
test tampoco agrega nada. Archivos restaurados a HEAD y árbol limpio después.

Ayuda a la conclusión que **las 24 líneas del diff son 1:1** (`-N +N`, ningún cambio desplaza líneas),
así que los números de línea de eslint son los mismos antes y después, y **ninguna** de las 24 líneas
que toqué coincide con una línea reportada. Son todos cambios de string en `className`: no pueden
introducir `react-hooks/purity` ni `set-state-in-effect`.

Reloj al correr la suite: 10:49 AR — dentro de `[01:00, 23:30]`, así que los dos canarios de reloj no
entran en juego (los 4 `expected fail` son los de siempre).

---

## 9 · Lo que al medirlo resultó distinto del todo

1. **24 campos, no 16.** El barrido del todo no miraba `<TimeField>` ni los `<input type="number">`.
   Los 16 que sí midió estaban exactos.
2. **92 campos editables, no 88.** Misma causa.
3. **La trampa del regex tiene una segunda puerta.** Además del `[^>]` que el todo documentó, el `\s`
   dentro de un *template literal* produce el mismo falso cero (0 sobre 82). Me pasó en esta sesión y
   quedó documentado en el candado.
4. **Los `<SelectTrigger>` no aplicaban**, y la razón es más fuerte que "es un select": es un
   `<button>` nativo, verificado en el primitivo instalado.
5. **Un hallazgo fuera de scope:** `components/crm/crm-topbar.tsx` tiene el mismo defecto, pero es la
   superficie del CRM. Sin tocar.

## 10 · Pendiente de UAT

El cierre real es **tocar un buscador del panel en un iPhone de verdad** y ver que ya no amplía ni
queda descentrado. Lo medible desde acá está medido (el CSS compilado, la resolución de twMerge, el
umbral de 1rem), pero el auto-zoom es comportamiento de Safari en iOS y **no se reproduce en el
simulador de Chrome DevTools** — que es justamente por qué esto vivió nueve meses sin que nadie lo
viera.

El dev server del puerto 80 quedó intacto; no lo toqué ni levanté otro.
