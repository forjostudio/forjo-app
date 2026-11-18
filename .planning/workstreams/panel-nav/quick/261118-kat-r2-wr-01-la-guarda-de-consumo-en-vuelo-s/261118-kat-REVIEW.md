---
phase: quick-261118-kat (+ quick-261118-jdq obs-G1)
reviewed: 2026-11-18T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - lib/panel-history.ts
  - lib/panel-history.test.ts
  - app/(dashboard)/finances/finances-client.tsx
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Quick 261118-kat (R2-WR-01) + 261118-jdq (obs-G1): revisión de código

**Revisado:** 2026-11-18
**Profundidad:** standard, con chequeos puntuales entre archivos: `lib/panel-branch.ts`, `test/panel-tabs.test.ts`, `test/panel-branch.test.ts` y el router de Next 16.2.7 en `node_modules`
**Archivos revisados:** 3
**Estado:** issues_found

## Resumen

Revisé `git diff 5f36c46 HEAD -- lib/panel-history.ts lib/panel-history.test.ts` y `git diff ccb8979 HEAD -- app/(dashboard)/finances/finances-client.tsx`, cada uno con el archivo completo como contexto.

**Lo que sí queda bien:**

- **Ninguna salida del `try/catch` deja la guarda colgada.** Las tres salidas pasan por `soltarConsumo`.
- **`soltarConsumo` está en el orden correcto:** primero apaga la memoria y después saca los oyentes.
- **No hay oyentes que se acumulen.** Cada encendido va precedido de una liberación, y el DOM no duplica la misma referencia.
- **El caso de B1 que se re-decide adentro de su propio `popstate` funciona con la semántica real del DOM.** El oyente quitado durante el despacho no corre, porque lleva la marca de removido. El que se vuelve a enganchar durante el despacho tampoco corre en ese evento, porque no está en la copia de oyentes que se tomó al empezar.
- **obs-G1 no rompe el layout.** `min-h-dvh` es sólo un mínimo y no cambia el `display`. El panel oculto sigue con `hidden`.

**Cómo verifiqué los hallazgos.** Los de comportamiento no son sólo de lectura: los medí con un simulador hecho a propósito para esta revisión. Corre los ejecutores REALES (`applyPanelView`, `consumeOwnedPanelEntry`, `runBranchNavigation` y un `decidir` igual al del hook), con un `back()` asíncrono y la marca de removido del DOM. Corrí cada escenario dos veces: contra HEAD y contra el código de `5f36c46`.

- Probe: `C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/e3541fb4-9838-45ba-8edf-fb689e438b9e/scratchpad/rev/guard.run.ts`
- Bundles: `.../scratchpad/rev/guard.run.mjs` (HEAD) y `.../scratchpad/rev/guard.old.mjs` (pre-fix)

Resultados, en la pila `/afuera → /dashboard → /finances{frjUnder} → /finances?tab=ventas{frjView}`:

| Escenario | HEAD | pre-fix (5f36c46) |
|---|---|---|
| A — tab por defecto, `replaceState` de Next en la ventana, sección activa del menú | 2 retrocesos, `/dashboard` | 2, `/dashboard` |
| B — igual que A, pero con Inicio en la barra (B1) | 3 retrocesos, **`/afuera`** | 3, `/afuera` |
| C — doble toque a Inicio en la barra (B1 → B1) | 3 retrocesos, **`/afuera`** | 4, `/afuera` |
| D — menú y después B1 | 2, `/dashboard` ✔ | 3, `/afuera` |
| E — B1 con un `back()` que tira, y después un atrás del sistema | 2, `/dashboard` (esperado: 1, `/finances`) | igual |

El arreglo cierra D, los K3 medidos y el caso 2 del ejecutor. Pero quedan tres huecos de la misma familia (C, A/B y E), y el de C saca al dueño del sitio con un gesto común.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: un doble toque a Inicio en la barra (B1 → B1) todavía saca al dueño del sitio (cicatriz 2)

**Archivos:** `lib/panel-history.ts:1290-1292` (el `return true` cuando ya hay un consumo en vuelo) y `lib/panel-branch.ts:405-421` (`consume-view-then-navigate`)

**Problema:** el contrato nuevo dice que, con un consumo en vuelo desde la misma entrada, `consumeOwnedPanelEntry` «devuelve `true` sin retroceder (el que viaja la cierra)». Para el menú (NAV-08) es correcto. Para B1 no: `runBranchNavigation` ya enganchó su `segundoPaso` ANTES de llamar a `consumeOwnedPanelEntry`, y al recibir `true` lo deja enganchado. Con dos toques a Inicio antes del recorrido pasa esto:

1. Quedan dos `segundoPaso` (dos closures distintas: el DOM no las deduplica).
2. Llega un solo recorrido.
3. En el MISMO `popstate` corren los dos `reDecidir`, y los dos leen el mismo `history.state` (`/finances` con `frjUnder`).
4. Los dos deciden `up`, y cada uno llama a `consumeOwnedBranchEntry()`, que no tiene guarda de vuelo.
5. Salen dos `back()` sobre la misma entrada, más el primero: 3 retrocesos, y el dueño termina en `/afuera`.

Medido (escenario C): HEAD da 3 retrocesos y `/afuera`. Antes del arreglo daba 4 y `/afuera`.

**No es una regresión:** B1 ya está en `origin/main` y este push lo mejora (4 → 3 retrocesos). Pero el caso 3 de R2-WR-01 se declaró «mitigado» también para B1, y la variante más común —el doble toque impaciente en la barra de mobile, que no tiene debounce (`components/dashboard/panel-bottom-nav.tsx:192-196`)— sigue expulsando del sitio. Ningún K/NR/C la cubre. El docblock dice «el chequeo nuevo nunca retrocede». Localmente es cierto, pero el `true` que devuelve hace que B1 retroceda dos veces.

**Fix:** que B1 tenga un solo re-decisor por consumo en vuelo. La forma mínima es en `lib/panel-branch.ts`: guardar a nivel de módulo el `segundoPaso` pendiente de B1 y reemplazarlo en vez de sumar otro.

```ts
let segundoPasoB1Pendiente: (() => void) | null = null
// en la rama consume-view-then-navigate:
const segundoPaso = () => { segundoPasoB1Pendiente = null; reDecidir() }
if (segundoPasoB1Pendiente) window.removeEventListener('popstate', segundoPasoB1Pendiente)
segundoPasoB1Pendiente = segundoPaso
window.addEventListener('popstate', segundoPaso, { once: true })
if (consumeOwnedPanelEntry()) return true
window.removeEventListener('popstate', segundoPaso)
segundoPasoB1Pendiente = null
return false
```

Hay una alternativa: que `consumeOwnedBranchEntry` comparta la guarda, para que el segundo `up` dentro del mismo evento dé `true` sin retroceder. Antes del arreglo conviene un candado `K3c-b1-doble` (B1 → B1 → `procesar()` ⇒ 2 retrocesos, `/dashboard`) en `test/panel-tabs.test.ts`.

## Warnings

### WR-01: la regla «el state cambió ⇒ el recorrido llegó» es falsa con un `replaceState` en la ventana, y reabre el caso 3a

**Archivo:** `lib/panel-history.ts:1290-1293`, y el docblock de la guarda en `:946-949`

**Problema:** se compara por identidad de `history.state` para detectar que el recorrido llegó. Pero la identidad también cambia con cualquier `replaceState` sobre la entrada actual mientras el recorrido está pendiente.

El caso concreto es el de Next 16.2.7:

- `HistoryUpdater` (`node_modules/next/dist/client/components/app-router.js:38-67`) hace `replaceState({...window.history.state, __NA, tree})` en CADA commit del router.
- En los RESTORE (`restore-reducer.js:53` → `completeTraverseNavigation` con `preserveCustomHistoryState: true`) conserva `frjView`.
- Ese RESTORE es justamente el que dispara el `pushState`/`replaceState` parcheado que hace `applyPanelView` en un toque anterior (`applyUrlFromHistoryPushReplace`, en una transición).

Secuencia: Ventas (empuje, transición pendiente), enseguida Turnos (consume, la guarda guarda S1), después el commit de la transición (`replaceState` → S1', con `frjView`), y por último la sección activa del menú o Inicio. `consumeOwnedPanelEntry` ve `S1' !== S1`, suelta la guarda, pasa las dos guardas (S1' sigue llevando la marca) y retrocede otra vez.

- Medido (A): 2 retrocesos y `/dashboard`, fuera de la sección.
- Medido (B, con B1): 3 retrocesos y **`/afuera`**.
- Antes del arreglo daba lo mismo: el arreglo no cubre esta variante.

Hace falta una ráfaga de toques dentro de la latencia de la transición, en un dispositivo lento. Es el mismo escenario de ráfaga en el que nació G-04-7.

Además, cuando la liberación ocurre fuera de un `popstate`, el oyente re-enganchado del consumo 2 lo suelta el `popstate` del recorrido 1: se suelta antes de tiempo. El docblock (`:946-949`) presenta la identidad como una prueba de llegada, y no lo es.

**Fix:** no deducir la llegada del state: escucharla primero. En el objetivo, los oyentes de captura corren antes que los de burbuja (DOM actual, Chrome 89+). Así `soltarConsumo` corre antes que el `segundoPaso` de B1 y antes que el `onPopState` de Next, y el chequeo de identidad sobra.

```ts
window.addEventListener('popstate', soltarConsumo, { once: true, capture: true })
// soltarConsumo:
window.removeEventListener('popstate', soltarConsumo, { capture: true })
// consumeOwnedPanelEntry:
if (consumoEnVuelo) return true
```

Hay que medirlo en Chrome y en Safari de iOS antes de adoptarlo, y los stubs de los tests tienen que respetar `capture`. Si se mantiene la identidad, al menos hay que corregir el docblock y sumar un candado con un `replaceState` en la ventana (escenarios A y B).

### WR-02: en B1, un `back()` que tira deja colgado el `segundoPaso`, y el próximo atrás del sistema navega solo

**Archivos:** `lib/panel-history.ts:1299-1306` (relanza) y `lib/panel-branch.ts:416-421`

**Problema:** el `catch` nuevo suelta la guarda y relanza. Pero `runBranchNavigation` engancha `segundoPaso` antes de llamar a `consumeOwnedPanelEntry` y no tiene `try`: la excepción sube y el oyente queda armado. El siguiente atrás del dueño dispara `reDecidir` sin que nadie lo pida: es justo el bug que advierte el comentario de `panel-branch.ts:397-399` («dispara una navegación que nadie pidió»).

Medido (E): un atrás del sistema desde `?tab=ventas` termina en `/dashboard` (2 retrocesos) en vez de `/finances`. El docblock del ejecutor dice «el handler del toque lo ve, y el panel sigue respondiendo»: en B1 sigue respondiendo, pero mal. Lo mismo pasa con las ramas `consume-exit-then-navigate` y del colapso si su `back()` tira.

**Fix:** en las tres ramas de dos pasos de `runBranchNavigation`:

```ts
window.addEventListener('popstate', segundoPaso, { once: true })
try {
  if (consumeOwnedPanelEntry()) return true
} catch (e) {
  window.removeEventListener('popstate', segundoPaso)
  throw e
}
```

Y un candado K2-c (B1 con un `back()` que tira ⇒ cero oyentes de B1 vivos).

### WR-03: los candados de `pageshow` no miden la limpieza del oyente ni el `persisted: false`

**Archivos:** `test/panel-tabs.test.ts:1274-1291` y `lib/panel-history.ts:966-967, 979-981`

**Problema:**

- **«No quedan oyentes» cuenta sólo los de `popstate`.** `C-pageshow-tab` lo afirma en su título, pero `pila.oyentes` cuenta sólo los de `popstate` (el docblock del stub, `:172-173`, lo dice). Nada verifica que `soltarConsumo` saque el oyente de `pageshow`, ni en la salida normal por `popstate` ni en el `catch`.
  - Si se borrara `window.removeEventListener('pageshow', soltarAlVolverDeLaCache)`, todo seguiría en verde.
  - Y quedaría un oyente vivo que, en una vuelta de la bfcache posterior, soltaría una guarda LEGÍTIMA de otro consumo.
- **El `persisted: false` no se prueba nunca.** No hay ningún `pageshowDelStub(false)`: la mutación `function soltarAlVolverDeLaCache() { soltarConsumo() }` pasa toda la suite. El condicional que el docblock destaca («un `pageshow` no persistido no suelta nada») mide cero.
- **K2-a/K2-b tampoco miran `pageshow`:** `oyentes: 0` sólo cuenta `popstate`.

**Fix:**

- Exponer `pila.oyentesPageshow` y afirmar que vale 0 en C-pageshow-tab, K2-a, K2-b y después de un `procesar()` normal.
- Sumar `C-pageshow-no-persistido`: consumo, después `pageshowDelStub(false)`, y el tab siguiente da `'none'`.

### WR-04: el residuo de «un retroceso ignorado en silencio» ahora traba también el menú y B1, y el docblock no lo dice

**Archivos:** `lib/panel-history.ts:1047-1050` (residuo declarado) y `:1290-1291`

**Problema:** antes, una guarda colgada sólo dejaba los tabs en `'none'`. Con la guarda compartida, mientras el state no cambie:

- **NAV-08 queda muerto:** `consumeOwnedPanelEntry` devuelve `true` sin retroceder y el call site hace `preventDefault`. El menú queda muerto en la sección activa.
- **B1 junta oyentes:** cada toque a la barra engancha OTRO `segundoPaso`, y el `<Link>` se previene. Cuando el dueño por fin hace atrás, corren todos los `reDecidir` acumulados en el mismo `popstate`. Es el mecanismo de CR-01 multiplicado: N toques, N retrocesos `up`, y el dueño fuera del sitio.

El docblock sólo dice «deja la guarda encendida hasta el próximo recorrido», sin el radio nuevo.

**Fix:** declarar el radio en el docblock (tabs, menú y barra). El fix de CR-01 (un solo `segundoPaso` de B1 pendiente) le saca la parte destructiva: con eso, el residuo vuelve a ser «gesto muerto hasta el próximo recorrido», que es lo que se aceptó.

## Info

### IN-01: `pageshow` con `{ once: true }` y un condicional adentro

**Archivo:** `lib/panel-history.ts:1104, 1301` y `:979-981`

**Problema:** con `once`, un `pageshow` no persistido consumiría el oyente sin soltar la guarda, y dejaría al consumo sin su salida por bfcache. Hoy no pasa: en la vida de un documento, el único `pageshow` no persistido es el de la carga inicial, anterior a cualquier guarda. Pero el `once` y el condicional se contradicen.

**Fix:** enganchar `pageshow` sin `once`, porque `soltarConsumo` ya lo saca. O sacar el condicional y documentar que el `once` presupone `persisted`.

### IN-02: obs-G1, el costo es más amplio que «un tab vacío»

**Archivo:** `app/(dashboard)/finances/finances-client.tsx:1091-1099, 1111, 1144, 1169`

**Problema:** `min-h-dvh` es correcto (es la unidad que mantiene el invariante scroll-máximo ≥ borde del panel; `svh` dejaría ~60 px de recorte) y no rompe el layout de escritorio. Pero el espacio en blanco no aparece sólo con 0 filas: aparece con cualquier lista más corta que el viewport (2 o 3 ventas dejan casi una pantalla en blanco debajo). En escritorio, con un viewport alto, la página pasa a tener scroll aunque el contenido entre. Como el panel es el último bloque de la página, se lee como espacio de scroll al final y no como un bloque raro en el medio: es aceptable, pero el comentario lo subestima («un tab vacío deja blanco debajo de su aviso»). Además, los tres paneles muestran «Sin X en este período» seguido de una pantalla en blanco mientras carga el `fetch` del mes.

**Fix:** ajustar el comentario: «cualquier tab más corto que la pantalla, también en escritorio». Opcional: medir si en `lg:` hace falta, y usar `max-lg:min-h-dvh` si el recorte no se reproduce con el viewport de escritorio. La sonda G1-ventas-escritorio dice que sí se reproduce, así que hoy no aplica.

### IN-03: el drenaje por `fn.name` y el candado de orden debilitado

**Archivos:** `lib/panel-history.test.ts:539-556` y `test/panel-branch.test.ts:1299-1302`

**Problema:**

- **El drenaje por nombre falla en silencio.** Depende de `fn.name === 'soltarConsumo'`: si el oyente pasara a ser una arrow o un wrapper, el drenaje no hace nada sin avisar. Los casos siguientes fallarían por otra causa (`'none'` inesperado o `removeEventListener` inexistente en los stubs viejos), lejos del origen.
- **El candado de orden ya no distingue al oyente de B1.** En `panel-branch.test.ts`, `enganchados[0].tipo === 'popstate'` con `{ once: true }` también lo cumple `soltarConsumo`. Con la identidad (o con WR-01) el orden no es crítico, pero el candado ya no fija el que describe el docblock.

**Fix:** exportar un `__drenarGuardaParaTests()` (o drenar despachando `popstate` en el stub, como hace `panel-tabs`). Y afirmar `enganchados[0].fn.name` distinto de `soltarConsumo`.

---

_Reviewed: 2026-11-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
