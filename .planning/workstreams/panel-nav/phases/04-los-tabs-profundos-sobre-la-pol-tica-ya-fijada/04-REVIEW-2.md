---
phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
reviewed: 2026-11-18T13:35:00Z
depth: standard
round: 2
diff_base: 974a131
files_reviewed: 9
files_reviewed_list:
  - app/(dashboard)/finances/page.tsx
  - app/(dashboard)/negocio/page.tsx
  - app/(dashboard)/settings/page.tsx
  - app/(dashboard)/finances/finances-client.tsx
  - app/(dashboard)/settings/settings-client.tsx
  - lib/panel-history.ts
  - lib/panel-tabs.ts
  - lib/panel-history.test.ts
  - test/panel-tabs.test.ts
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 4: Code Review Report (ronda 2, cierre de gaps 04-06 / 04-07)

**Reviewed:** 2026-11-18T13:35:00Z
**Depth:** standard (diff `974a131..HEAD` sobre los 9 archivos, con el archivo completo como contexto)
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Revisé el código nuevo del cierre de gaps: el fallback con nodo de los tres `<Suspense>` (04-06), el
helper `toqueDeTab`, la guarda `consumoEnVuelo` de `applyPanelView` con su `popstate` de disparo
único, el predicado `vueltaDeOAuthPendiente` y `cleansQuery` en la regla 2 de `panelHistoryAction`
(04-07). Corrí `npx vitest run test/panel-tabs.test.ts lib/panel-history.test.ts` y dio 256/256 en
verde. Además repliqué el `sinComentarios` del candado de la guarda sobre `lib/panel-history.ts`: la
región de `applyPanelView` sale entera (1241 caracteres, el mismo número de `export function` antes y
después del descuento), así que ese gate no mide cero.

**Lo que verifiqué y está bien:**

- **`cleansQuery` no cambia la decisión cuando no hay `drop`.** Sólo vale `true` si `drop` no está
  vacío y uno de sus nombres está en `window.location.search` (`lib/panel-history.ts:1029-1030`). Además
  sólo se lee en la regla 2 (`:123`), después de la regla 0 y la regla 1. Las otras cuatro llamadas a
  `applyPanelView` (los toques, las dos reconciliaciones y Agenda) no pasan `drop`, así que su decisión
  queda bit a bit igual. Una limpieza nunca consume, y si la entrada es nuestra el reemplazo le conserva
  la marca (`holding ? to : null`).
- **El OAuth usa un solo criterio en los tres lugares.** El render (`settings-client.tsx:1014`) alimenta
  `tabValue` (`:1046`) y el corte de la reconciliación (`:1069`) con el mismo `vueltaDeOAuth`, y la
  guarda del efecto (`:1119`) llama al mismo predicado. El gate (g) cuenta exactamente dos llamadas en el
  código sin comentarios.
- **La guarda va antes de leer el state** (`:1024`). El encendido y el oyente van antes del `back()`
  (`:1046-1048`), y sólo la rama `consume` la enciende, que ya exige `holding`. Mientras la guarda está
  encendida, la reconciliación recibe `'none'`, que no le envenena la memoria (`reconciledMemo` conserva
  `previous`). Además el recorrido cambia `searchParams`, así que el efecto vuelve a correr con la guarda
  ya apagada.
- **La interacción con overlays, el aviso de salida y B1 no empeora.** La regla 0 sigue primera dentro de
  la decisión. La guarda sólo descarta escrituras propias, y el `popstate` de disparo único no escribe ni
  decide nada. El `segundoPaso` de B1 (`lib/panel-branch.ts:395/416/460`) tiene su propio oyente y no
  depende de esta memoria.

**Cierre de la ronda 1:**

- **WR-01: CERRADO por el código.** Los tres boundaries tienen un `div` vacío con la clase del contenedor
  raíz de su cliente (`space-y-6 max-w-5xl`, que es `finances-client.tsx:822`, y `space-y-6 max-w-3xl`,
  que es `settings-client.tsx:2501`). Contra `layout-router.js` de Next 16.2.7: `findDOMNode` encuentra
  un `HTMLElement` y `shouldSkipElement` no lo saltea, porque el ancho del bloque no es cero. Así se
  ejecuta `scrollRef.current = false` en el montaje. Los gates (e) y el de la página exigen el fallback
  nuevo y prohíben `fallback={null}`. `/clients` sigue pendiente, como diferido.
- **WR-02: CERRADO para los tabs.** Los dos `alElegirTab` sacan `from` de `window.location.search`
  a través de `toqueDeTab`, y el doble consumo lo corta la guarda: E3 y «un empuje durante el consumo»
  son rojos genuinos contra el código anterior. Quedan abiertos el caso cruzado con
  `consumeOwnedPanelEntry` (diferido; ver IN-03 por la dirección que el diferido no nombra) y el mismo
  defecto en clientes (IN-04, fuera de los archivos).
- **WR-03: CERRADO.** El predicado es único y va por presencia. Con `?tab=integraciones&mp=…`,
  `cleansQuery` hace que la regla 2 reemplace. Las cinco URLs que trababan los tabs y los dos controles
  pasan por el ejecutor real del simulador, y después del arreglo Datos responde con `replace` (no con
  `consume`). El comentario falso («la query queda hasta el próximo toque») ya no está. Queda un residuo
  teórico que ya existía: el efecto corre una sola vez (`[isNegocio]`), así que si su escritura cayera en
  la regla 0 no se reintenta. En un documento recién llegado del proveedor no encontré quién pueda tener
  la entrada de arriba, así que no lo reporto.

El único WARNING es la garantía de que la guarda «nunca queda colgada». Depende de que siempre llegue un
`popstate` a este documento, y eso no está medido para un documento que sobrevive al retroceso (bfcache).

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: la guarda `consumoEnVuelo` sólo se apaga con un `popstate`. Si ese evento no llega a un documento que sigue vivo, todo `applyPanelView` del documento queda en `'none'`

**File:** `lib/panel-history.ts:933-938`, `:1024`, `:1045-1049` (y el docblock en `:996-1002`)

**Issue:** La guarda se enciende **antes** del `back()` y lo único que la apaga es `soltarConsumo`, el
oyente de `popstate`. Mientras está encendida, la primera sentencia del ejecutor devuelve `'none'` para
**todas** las pantallas, porque es memoria del módulo y no de un componente: los toques de los tres
grupos de tabs, las dos reconciliaciones y también abrir y cerrar la ficha `?c=` de clientes. El
docblock lo da por imposible: «si alguna vez el retroceso cruzara a otro documento no llegaría el
evento, pero este módulo muere con el documento que lo cargó: la guarda no sobrevive para trabar nada».
Ese argumento no se midió y tiene al menos dos huecos:

1. **bfcache.** Un `back()` entre documentos deja la página que se va en la caché de atrás/adelante si es
   elegible, con su heap de JS intacto: `consumoEnVuelo === true` y el oyente todavía enganchado. Un
   *adelante* la restaura sin cargar el módulo de nuevo. Al restaurar, lo que se garantiza es
   `pageshow` con `persisted: true`, no un `popstate` en ese documento. El cierre del WR-04 de la ronda 1
   (`04-UAT-CIERRE.md`, «NO REPRODUCE») muestra que en Chrome 157 una recarga no deja entradas de otro
   documento debajo. Pero el mismo registro deja **sin medir** Safari iOS, Android real y «pestaña
   descartada/restaurada por el sistema». Ese último es justo el caso en que la entrada de abajo es de
   otro documento y `holding` sigue en `true`, porque la marca `frjView` sobrevive en el state restaurado.
   Si la página entra en la bfcache, el dueño vuelve con *adelante* a un panel donde ningún tab ni ninguna
   ficha responde hasta el próximo atrás o adelante dentro del documento, o hasta recargar.
2. **Un `back()` que no despacha nada.** Si `history.back()` tira una excepción (Safari tira
   `SecurityError` cuando se pasa del límite de llamadas a la API de historial) o el navegador la ignora
   por estrangulamiento (Chrome lo hace con la inundación de navegaciones), la bandera ya quedó encendida
   y no hay recorrido que la apague.

Es una derivación: no lo medí. La probabilidad es baja, pero el efecto es peor que el defecto que la
guarda cierra: un doble retroceso se convierte en un panel sin respuesta. Además, el docblock hoy afirma
una garantía («nunca queda colgada») que el código no da.

**Fix:** que la guarda tenga una segunda salida que no dependa del `popstate`, y que un `back()` que
tira no la deje encendida. Por ejemplo:

```ts
function soltarConsumo(): void {
  consumoEnVuelo = false
  window.removeEventListener('popstate', soltarConsumo)
  window.removeEventListener('pageshow', soltarConsumo)
}

// rama consume
consumoEnVuelo = true
window.addEventListener('popstate', soltarConsumo, { once: true })
// Restaurada desde la bfcache tras un retroceso entre documentos: no llega ningún popstate.
window.addEventListener('pageshow', soltarConsumo, { once: true })
try {
  window.history.back()
} catch (e) {
  soltarConsumo()
  throw e
}
```

Opcionalmente, agregar un tope de tiempo generoso (por ejemplo, un `setTimeout(soltarConsumo, 1500)`
que se cancela en `soltarConsumo`) que degrade al comportamiento de antes del plan y nunca a un bloqueo.
Además hay que corregir la frase del docblock (`:996-999`) para que diga qué cubre cada salida, sumar
un caso al simulador (un `pageshow` suelta la guarda; un `back` que tira no la deja encendida) y ajustar
el candado de la guarda si cambia el texto de la rama `consume`.

## Info

### IN-01: E1, E2 y E4 pasan también con el código anterior. Que el `from` salga de la URL lo prueba sólo el candado textual

**File:** `test/panel-tabs.test.ts:828-856` (E1/E2/E4), `:653-667` (el candado de `alElegirTab`)

**Issue:** El `tocar` del simulador **ya leía** `window.location.search` antes del plan (ver el diff:
`const desde = resolveTab({ … new URLSearchParams(window.location.search) … })`). Lo que tenía el
defecto eran las pantallas, que usaban `tabResuelto.slug`. El simulador no modela el desfase entre la URL
y el render, así que E1, E2 y E4 no pueden distinguir el código viejo del nuevo. Están rotulados como
«regresión», así que no mienten, pero el `describe` dice «un toque decide con la URL de ahora» y la parte
del `from` de G-04-7 la sostienen sólo `toContain('toqueDeTab(')`, `toContain('window.location.search')`
y `not.toContain('tabResuelto.slug')`. El último no ve `tabResuelto?.slug` ni `tabNegocio.slug`. Los
rojos genuinos de esta suite son E3 y «un empuje durante el consumo».
**Fix:** alcanza con aclarar en el comentario del bloque que E1, E2 y E4 fijan el contrato de
`toqueDeTab` y no el desfase. Si se quiere un rojo dinámico, se puede agregar al simulador un «render
viejo» (un `slugDelRender` congelado) y un `tocarComoAntes` que lo use, para demostrar que esa forma
empuja dos veces y que `tocar` no. Endurecer el negativo: `not.toMatch(/tab(Resuelto|Negocio|Config)\??\.slug/)`.

### IN-02: la guarda del módulo persiste entre casos y ningún `afterEach` la resetea

**File:** `test/panel-tabs.test.ts:729-731`, `:736-738`; `lib/panel-history.test.ts:445-448`, `:538`, `:1123-1126`

**Issue:** El comentario del bloque lo reconoce: todo caso que consuma tiene que terminar con su
`popstate`. Pero si una aserción falla entre el `consume` y el `procesar()`, la guarda queda encendida y
todos los casos siguientes del archivo reciben `'none'`. La falla se derrama y tapa la causa. Además, los
stubs de `window` de `lib/panel-history.test.ts` no tienen `addEventListener`: el primer caso futuro que
haga un `consume` por `applyPanelView` con esos stubs tira un `TypeError` **después** de
`consumoEnVuelo = true` (L1046 antes que L1047), y deja la guarda colgada para el resto de ese archivo.
**Fix:** en los `afterEach` de los dos archivos, despachar un `popstate` sobre el stub antes de
`vi.unstubAllGlobals()`, o aislar con `vi.resetModules()` y reimportar. También se puede agregar un
`addEventListener: vi.fn()` a los stubs viejos para que un `consume` futuro falle en su aserción y no en
el cargador.

### IN-03: el caso cruzado tiene dos direcciones y el diferido nombra una sola

**File:** `lib/panel-history.ts:1003-1007`, `:1214-1220`; `.planning/workstreams/panel-nav/phases/04-…/deferred-items.md` (la entrada «La guarda de consumo en vuelo no se extendió a `consumeOwnedPanelEntry`»)

**Issue:** El diferido describe «consumir un tab y tocar la barra o el sidebar antes de que llegue el
retroceso». La dirección inversa tampoco está cubierta y no está escrita. Si primero va el retroceso de
`consumeOwnedPanelEntry` (NAV-08 o el primer paso de B1), la guarda sigue apagada, el state de arriba
todavía es `{ frjView: 'tab' }`, y un toque al tab por defecto en esa ventana vuelve a consumir: doble
retroceso, y el `segundoPaso` de B1 re-decide sobre el aterrizaje equivocado. El arreglo que el diferido
ya propone (compartir la guarda con `consumeOwnedPanelEntry`) cubre las dos direcciones, así que es un
tema de registro y no de código nuevo.
**Fix:** sumar la dirección inversa a la entrada del diferido, para que la medición futura recorra las
dos.

### IN-04: la ficha de clientes conserva el defecto de WR-02 (ronda 1): el `user-open` decide con el `from` del render

**File:** `app/(dashboard)/clients/clients-client.tsx:1055` (fuera de los archivos revisados; `app/(dashboard)/clients/**` es intocable en el cierre)

**Issue:** `onClick={() => applyPanelView({ cause: 'user-open', …, from: selectedId, to: client.id })}`.
`selectedId` sale de `useSearchParams()` del último commit. Un doble toque en una fila antes del commit
del restore pasa `from: null` dos veces, así que `from !== to`, se ejecutan dos `push` y queda `?c=A`
sobre `?c=A`. Es la misma «entrada basura» que G-04-7 cerró en los tabs, y la regla 2 tampoco la ve
acá. El «Volver» sí hereda la guarda del doble consumo, pero el `from` del render sigue ahí.
**Fix:** un quick después de la fase: el `from` de `new URLSearchParams(window.location.search).get(VIEW_PARAM)`
en el momento del toque, en el molde de `toqueDeTab`, con su caso en el simulador de
`test/panel-history-clients.test.ts`. Mientras tanto, anotarlo en `deferred-items.md`.

### IN-05: el docblock de `consumeOwnedPanelEntry` sigue diciendo que el módulo no escucha `popstate`

**File:** `lib/panel-history.ts:1188`

**Issue:** «este módulo sólo consume la de arriba y, por D-01, no escucha `popstate` ni reescribe
historial ajeno». El plan 04-07 corrigió el encabezado del módulo (`:28-31`), que ahora dice «Escucha UN
SOLO `popstate`, de disparo único», pero esta frase quedó vieja y contradice el encabezado del mismo
archivo.
**Fix:** «…no reescribe historial ajeno y no decide nada desde un `popstate` (el único que escucha es el
oyente de disparo único que suelta la guarda de {@link applyPanelView})».

---

_Reviewed: 2026-11-18T13:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
