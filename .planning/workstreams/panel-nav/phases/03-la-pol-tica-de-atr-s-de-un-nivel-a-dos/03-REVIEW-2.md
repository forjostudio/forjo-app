---
phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos
reviewed: 2026-11-16T23:55:00Z
depth: standard
round: 2
diff_base: a16e5f4
files_reviewed: 3
files_reviewed_list:
  - lib/panel-branch.ts
  - components/dashboard/plan-modal.tsx
  - test/panel-branch.test.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 03: Code Review Report, ronda 2

**Reviewed:** 2026-11-16T23:55:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

El alcance es sólo lo que cambió después de `a16e5f4`:
- `lib/panel-branch.ts`: el gate `panelExitDiagEnabled` (03-15, WR-05), `panelExitKeyStep`/`panelExitKeyId` con el oyente `keydown` en captura (03-16, G3-5), y `panelExitForeignRetry` con `reintentoTrasAjenaRef`/`reintentoDelArmado` (03-16, G3-7). Leí los hunks contra el archivo entero.
- `components/dashboard/plan-modal.tsx`: sólo `fa70f25` (G3-9).
- `test/panel-branch.test.ts`: los casos nuevos de esos tres cambios.

No repito nada de `03-REVIEW.md`: CR-01, CR-02, WR-01..05 e IN-01..07 ya los resolvió el dueño.

Lo que corrí: `vitest run --project pure test/panel-branch.test.ts` dio 224/224. `tsc --noEmit` dio cero errores. `eslint` sobre los tres archivos sólo marca el `react-hooks/immutability` conocido de `plan-modal.tsx:33`. También mutué en memoria el fuente para probar el gate de R2-WR-01 (ver abajo). No toqué ningún archivo ni corrí navegador ni sondas.

Lo que verifiqué y está bien:
- **G3-5.** El conjunto de teclas cubre los dos órdenes de soltar y el Cmd+[ de macOS, que pierde el keyup de la tecla común. También cubre el acelerador reservado: si el keydown de la flecha nunca llega a la página, su keyup no está en el conjunto y no cuenta como toque. La tecla mantenida (`repeat`) tampoco cuenta. El keydown va en captura y el keyup en burbuja, y esa asimetría sólo puede dejar una tecla de más en el conjunto hasta el próximo `popstate`. Eso no fabrica un toque, porque el keydown siguiente de esa tecla vuelve a entrar al conjunto y su keyup cuenta como siempre. `SIN_TECLAS` es compartido y ninguna rama lo muta. Escape, que cierra un overlay, también queda fuera: su keyup llega después del `popstate`.
- **G3-7.** Toda llamada a `armarSentinel` reasigna la referencia, así que no queda un `true` colgado entre gestos. El empuje del reintento vuelve a preguntar la decisión entera. Los diálogos anidados se corrigen solos: el overlay de afuera sigue arriba, la regla 0 declina y el contrafáctico vuelve a pedir, sin empujar. Un toque que un link se lleva apaga la referencia antes de decidir, así que `R-lateral` queda intacto.
- **WR-05.** El gate es la primera sentencia de `recordExitDiag`, usa la forma literal `process.env.NODE_ENV` (Next la reemplaza en el bundle del cliente) y falla cerrado. Los dos casos con `vi.stubEnv` muerden: sin el gate, el caso de `production` graba y falla. El `afterEach` global (línea 75) borra el canal global entre casos.
- **G3-9.** Copia el patrón de Editar servicio: tope con `max-h` y la fila del medio en `minmax(0,1fr)`. La spec de Grid resuelve la fracción contra el `max-height` cuando el alto es indefinido. La lista con `min-h-0 overflow-y-auto` es la única que scrollea, y la X vive en el popup, que no scrollea. El `py-1`/`px-4` deja lugar para el `ring-1` de la tarjeta recomendada dentro del contenedor que recorta. No encontré defectos.

Lo que preocupa:
1. El gate que se supone que fija el orden "leer, después apagar" del reintento de G3-7 pasa con el reintento muerto. Lo medí con una mutación en memoria.
2. En la variante `pronto` de G3-10 (el costo declarado), el código hace que el toque posterior no haga nada. La viñeta del costo declarado dice lo contrario, y nadie lo midió.

## Warnings

### R2-WR-01: El gate de la rama `ignore` no fija el orden leer→apagar. Con las dos líneas invertidas, G3-7 queda muerto y la suite sigue verde

**File:** `test/panel-branch.test.ts:1839-1853`. El código que protege está en `lib/panel-branch.ts:1776-1779`.

**Issue:** El caso ancla `iLee` en `ignorar.indexOf('reintentoTrasAjenaRef.current')`, o sea en la **primera** aparición del identificador, sea cual sea la sentencia. Si alguien escribe la limpieza antes de la lectura:
```ts
reintentoTrasAjenaRef.current = false
const reintentar = reintentoTrasAjenaRef.current   // siempre false
```
entonces `iLee` cae en la línea de la limpieza y sigue siendo menor que `iArma`. `toContain('reintentoTrasAjenaRef.current = false')` y `toContain('setReintentoDelArmado((n) => n + 1)')` siguen siendo verdaderos, así que **el caso pasa**. Pero `reintentar` es siempre falso y el reintento de G3-7 nunca se dispara. Lo comprobé: apliqué esa inversión en memoria sobre el fuente actual, corrí el mismo recorte y las mismas aserciones del caso, y dieron `pasa: true` (`iLee=1932`, `iArma=2095`).

Lo mismo vale para la otra variante peligrosa: dejar la limpieza antes de la lectura y mover la lectura entre la limpieza y `armarSentinel`. El comentario del fuente (`EL ORDEN ES CARGA`) nombra justo ese riesgo, y las pruebas puras de `panelExitForeignRetry` no lo ven, porque el cableado sólo lo cubren estas auditorías de texto. La sonda sí lo vería, pero corre bajo el turno de pantalla y no en `npm test`.

**Fix:** anclar cada sentencia por su texto completo y encadenar el orden:
```ts
const iLee = ignorar.indexOf('const reintentar = reintentoTrasAjenaRef.current')
const iApaga = ignorar.indexOf('reintentoTrasAjenaRef.current = false')
const iPide = ignorar.indexOf('if (reintentar) setReintentoDelArmado((n) => n + 1)')
const iArma = ignorar.indexOf('armarSentinel({ puedeEmpujar: false })')
expect(iLee).toBeGreaterThan(-1)
expect(iApaga).toBeGreaterThan(iLee)
expect(iPide).toBeGreaterThan(iApaga)
expect(iArma).toBeGreaterThan(iPide)
expect(cuenta(ignorar, /reintentoTrasAjenaRef\.current/g)).toBe(2)
```
Mejor todavía: sacar la rama a una función pura, por ejemplo `({ reintentoPendiente }) => ({ pedir: boolean, refDespues: false })`. Así hay un caso de comportamiento y no sólo una auditoría de texto.

### R2-WR-02: En la variante `pronto` de G3-10, el toque posterior al cierre no hace nada (regla 4). La viñeta del costo declarado afirma que "arma siempre", y eso no está medido

**File:** `lib/panel-branch.ts:1661-1666, 1704-1712, 1776-1779` (el reintento), `lib/panel-branch.ts:730` (la regla 4), `lib/panel-branch.ts:1680-1682` (`panelExitStillHolding`). La afirmación está en `03-DECISION-UAT-3.md:51`.

**Issue:** La sección `(i)` del veredicto midió la variante `pronto`: el diálogo se cierra con el atrás antes de los 5 s de activación. El reintento de G3-7 **empuja** `#salir` desde el efecto (`armado arm`, `vivo_despues=true`), y Chrome marca la entrada como salteable (`entradas_salteadas=1`, "el hash miente"). El dueño lo declaró costo del camino 1, y eso no se discute acá. Lo nuevo es qué pasa con **el toque siguiente**, el que según la viñeta de `03-DECISION-UAT-3.md:51` arregla todo ("Un toque en Inicio después del cierre arma siempre y el atrás avisa"). En el código:
- El toque llega a `alTocar`, `panelExitTouchAction` devuelve `arm`, y se llama `armarSentinel({ puedeEmpujar: true })`.
- `paradoSobreElNuestro = isPanelExitEntry(estado, id)` es **verdadero**, porque el `#salir` del reintento es nuestro. La regla 4 devuelve `none`, **no hay un empuje nuevo**, y `panelExitStillHolding` deja `vivo=true`.

El toque **nunca reemplaza** el sentinel salteable. Que el atrás siguiente avise depende **sólo** de que Chrome le quite la marca de salteable a las entradas del documento cuando llega la activación nueva. Eso no lo garantiza el módulo y no está medido: `atras-y-toque` se midió desde `tarde` (estado `pendiente`), no desde `pronto` (estado `#salir` salteable). Si Chrome no quita la marca, el dueño queda con un cartel que miente. Toca la pantalla, la URL dice `#salir`, y el atrás igual sale sin aviso. Esta variante no figura entre los costos declarados.

**Fix:** dos caminos, a decidir por el dueño:
1. **Medir antes de nada** un `R-G3-10-pronto-y-toque`: el mismo `pronto` de `(i)`, después un toque en Inicio, y después el atrás. Si avisa, corregir la viñeta para que diga que el arreglo lo hace el navegador y no el módulo. Si sale, este hallazgo pasa a BLOCKER del costo declarado.
2. **Que el reintento no se pida cuando el gesto mismo abrió el overlay**, sin temporizador. Se puede leer la entrada de arriba al **empezar** el gesto con un oyente `click` en **captura** sobre `window`, que corre antes que el manejador de React. Así, el toque que abre el diálogo (todavía sin ajena al empezar) no pide reintento, y queda `pendiente` igual que en `tarde`, que es la variante medida en la que el toque siguiente sí arma. La X y el fondo del diálogo ya abierto (con la ajena arriba al empezar) siguen pidiéndolo, así que los tres `R-G3-7` no cambian.
```ts
const ajenaAlEmpezarRef = useRef(false)
const alEmpezarToque = () => { ajenaAlEmpezarRef.current = isForeignOwnedEntry(window.history.state) }
window.addEventListener('click', alEmpezarToque, true)
// en armarSentinel, el hecho nuevo del reintento:
//   ajenaArriba: ajenaArriba && ajenaAlEmpezarRef.current
```
Este camino toca la lógica que el 03-17 dejó bloqueada, así que necesita decisión del dueño. Si no se toma, al menos corregir la viñeta.

## Info

### R2-IN-01: Comentarios que el 03-16 y el 03-17 dejaron desactualizados

**File:** `lib/panel-branch.ts:1757-1763`, `1704-1708`, `884-888`

**Issue:**
- `1760-1762`: la rama `ignore` todavía dice que el efecto del armado "tiene deps `[armarSentinel, pathname]`, así que **no vuelve a correr**". Desde `7722984` las deps incluyen `reintentoDelArmado`, y esta misma rama lo sube cuatro líneas más abajo para que el efecto **sí** vuelva a correr.
- `1706-1707`: dice que el empuje sale "con la activación leída ahora —la del toque que cerró—". Eso sólo es cierto con la X o el fondo. En G3-10 `pronto`, el cierre es un atrás y la activación es la del toque que **abrió**. El código no distingue entre los dos casos.
- `884-888`: el docblock de `panelExitForeignRetry` todavía presenta P-8 como un riesgo "que mide la sonda". El 03-17 lo observó (`entradas_salteadas=1` en `pronto`) y lo declaró costo.

**Fix:** actualizar las tres frases a la regla vigente y citar `G3-10` / `(i)` en el docblock.

### R2-IN-02: El contrafáctico no ve lo que hay debajo de la entrada ajena, así que con un overlay encima del sentinel ya armado pide un reintento sin necesidad

**File:** `lib/panel-branch.ts:1661-1666`, `1682`

**Issue:** Caso: el sentinel ya está armado y el dueño abre un diálogo encima. Queda arriba `{frjOverlay}` con el hash `#modal`, porque `nextOverlayHash('#salir')` devuelve la base. Un toque adentro del diálogo da `topIsOurs=false`, `urlNuestra=false`, `foreignOwnsTop=true` y `algoNuestroDebajo=false`, así que el contrafáctico devuelve `arm` y la referencia queda en `true`, aunque **nuestro sentinel está debajo**. El docblock (`861-869`) dice que eso significa "declinó **SÓLO** por la entrada ajena", y acá no es así. No hay daño: al cerrar, el `popstate` cae sobre el sentinel (`topIsOurs`, la rama `ignore`), el armado sin empuje re-deriva `vivo=true`, y el efecto que se dispara devuelve `none`. El costo es un render y un efecto de más, más una afirmación del docblock que no es exacta. El defecto es anterior: `panelExitStillHolding` pone `vivo=false` en ese toque. G3-7 sólo hereda esa ceguera.

**Fix:** decir en el docblock que el contrafáctico **sobreaproxima** (no puede ver debajo de la ajena) y que lo corrige la re-pregunta del efecto. O sumar `vivoAntes` como hecho: si el sentinel estaba vivo antes del toque, no pedir.

### R2-IN-03: Un `indexOf` sin guarda de `-1` en el gate del toque

**File:** `test/panel-branch.test.ts:1830-1835`

**Issue:** `expect(iApaga).toBeGreaterThan(iCandado)` pasa si falta `branchOwnerDecision(` en el recorte (`iCandado=-1`). Es la misma clase que el IN-04 de la ronda 1, pero en un caso nuevo de esta ronda: el gate que fija "el toque apaga la referencia **después** del candado" no se entera si el candado desaparece.

**Fix:** sumar `expect(iCandado).toBeGreaterThan(-1)` y `expect(iDecision).toBeGreaterThan(-1)` antes de comparar.

---

_Reviewed: 2026-11-16T23:55:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
