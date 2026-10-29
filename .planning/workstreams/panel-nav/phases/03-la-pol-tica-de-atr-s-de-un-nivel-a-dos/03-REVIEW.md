---
phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos
reviewed: 2026-10-29T23:05:10Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - .gitignore
  - app/[slug]/booking-client.tsx
  - app/[slug]/canchas-booking-client.tsx
  - components/dashboard/panel-bottom-nav.tsx
  - components/dashboard/unsaved-changes-guard.tsx
  - lib/panel-branch.ts
  - lib/panel-history.test.ts
  - lib/panel-history.ts
  - lib/unsaved-changes.test.ts
  - lib/unsaved-changes.ts
  - next.config.ts
  - scripts/con-turno.mjs
  - test/panel-branch.test.ts
  - test/panel-nav-chrome.test.ts
findings:
  critical: 2
  warning: 5
  info: 7
  total: 14
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-10-29T23:05:10Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Revisé el diff `06c083e^..HEAD` de los 14 archivos: la política de atrás de dos niveles (`panelBranchPlan`, la marca `frjUnder`), el sentinel de salida `#salir` con armado por activación, el aviso, el consumo diferido del desmontaje (1200308), la integración con el guard de cambios sin guardar y el arreglo del scroll del booking (76f98f3). Corrí `npx vitest run` sobre las cuatro suites del alcance: 411/411 en verde. Igual las suites son casi todas de decisiones puras o de *gates* sobre el texto fuente, así que no cubren ninguno de los dos BLOCKER de abajo.

Lo que quedó bien y verifiqué:
- El estado mutable a nivel de módulo (`marcaPedida`, `rutaDelUltimoRetroceso`, `instanciaDuena`, `instanciasVivas`) se escribe sólo en efectos y manejadores, nunca en el render. No hay fuga entre requests en SSR ni entre tenants.
- `writePanelUnder` usa `replaceState` sin url, así que el parche de Next (`app-router.js:268-279`) copia `__NA`/árbol y no despacha `ACTION_RESTORE`.
- El remontaje del modo estricto queda bien cubierto: el efecto de armado re-deriva `sentinelVivoRef` antes del microtask.
- El cambio del booking (ref con el valor previo) es correcto, porque `step` es número y `bookingLoc` es `string | null`, así que comparar por `===` alcanza.

Lo que preocupa:
1. En escritorio, el atrás de teclado (Alt+← en Windows, Cmd+[ en macOS) queda atrapado en un ciclo infinito.
2. El camino del guard **sin** sentinel ejecuta el segundo paso del colapso con la navegación inmediata desde adentro de un `popstate`. Es justo lo que la lección 3 del propio módulo da por roto.

## Critical Issues

### CR-01: El atrás de teclado en escritorio queda atrapado: cada atrás se absorbe y el `keyup` re-arma el sentinel

**File:** `lib/panel-branch.ts:1612-1655` (oyente `alTocar`), `lib/panel-branch.ts:933-952` (`panelExitTouchAction`)

**Issue:** El oyente de `keyup` sólo descarta `Enter` y la barra espaciadora. El atrás de teclado del navegador es una combinación con modificador: Alt+ArrowLeft en Chrome/Edge de Windows y Linux, Cmd+[ o Cmd+ArrowLeft en macOS. La secuencia en Inicio, con el sentinel armado (D-05 lo arma también en escritorio):
1. `keydown` Alt (activación transitoria: Alt solo no es un atajo reservado) y después `keydown` ArrowLeft, que dispara el retroceso del navegador.
2. Llega el `popstate`: `topIsOurs=false`, `holding=true`, así que `hint`. Se muestra el aviso y `sentinelVivoRef=false`.
3. `keyup` ArrowLeft y/o `keyup` Alt llegan **después** del `popstate` (soltar la tecla tarda más que el recorrido same-document). `panelExitActivationNow` da `true`: la activación transitoria dura unos 5 s y el keydown de Alt la dio. Con eso, `hintOpen=true`, `atRoot=true` y `gestoTomado=false`, la acción es `drop-and-arm`.
4. El aviso se baja en el acto y `armarSentinel({ puedeEmpujar: true })` vuelve a empujar `#salir` (la entrada de abajo no tiene marca y la URL ya no tiene hash, así que la decisión dice `arm`).

Resultado: cada Alt+← muestra el aviso un instante y deja el sentinel armado otra vez. El dueño **nunca** puede salir del panel con el atrás de teclado. Es el "botón muerto" que el módulo declara peor que el bug, y afecta justo a la superficie (escritorio) que D-05 incorporó. Ningún gate lo ve, porque la suite sólo prueba `panelExitTouchAction` pura y no modela la secuencia keydown → popstate → keyup.

**Fix:** que un `keyup` con modificador, o de una tecla modificadora, no cuente como "toque". Mejor todavía: que el `keyup` sólo arme si su `keydown` ocurrió **después** del último `popstate`.
```ts
const MODIFICADORES = new Set(['Alt', 'Meta', 'Control', 'Shift', 'AltGraph', 'OS'])
let ultimoPopstate = 0
let ultimoKeydown = 0
// en el efecto:
const alBajarTecla = () => { ultimoKeydown = performance.now() }
window.addEventListener('keydown', alBajarTecla)
// en alRetroceder, primera línea:
ultimoPopstate = performance.now()
// en alTocar, después del filtro de Enter/espacio:
if (evento instanceof KeyboardEvent) {
  if (MODIFICADORES.has(evento.key) || evento.altKey || evento.metaKey || evento.ctrlKey) return
  // la tecla se apretó ANTES del último retroceso: es la misma combinación que lo disparó
  if (ultimoKeydown <= ultimoPopstate) return
}
```
Y agregar un caso con nombre propio en `test/panel-branch.test.ts` que fije la regla (por ejemplo, extraer `esToqueDeTeclado({ key, altKey, metaKey, ctrlKey, keydownAntesDelPop })` como función pura).

### CR-02: "Salir sin guardar" sin sentinel de cambios hacia un destino fuera de Más deja al dueño en `/mas`: la navegación del colapso corre adentro del `popstate`

**File:** `components/dashboard/unsaved-changes-guard.tsx:162-168, 255-263, 326-330`. Cadena: `lib/panel-branch.ts:392-422`

**Issue:** En `confirmLeave`, cuando la entrada de arriba **no** es el sentinel de cambios sin guardar (`plan === planDeRama`), el plan se ejecuta con `navegar: navegarYa`, que llama `router.replace`/`router.push` **en el acto**. Si la pantalla sucia es `/web`, que es sección de la rama de Más con marca `frjUnder: '/mas'`, y el destino es cualquier otra sección (Turnos, Clientes o Agenda desde la barra o el sidebar), el plan es `collapse-then-replace`. `runBranchNavigation` engancha `segundoPaso`, hace `back()`, y **adentro del `popstate`** `segundoPaso` llama `navigate(to, 'replace')`, o sea `navegarYa`, o sea `router.replace` desde el evento.

Es exactamente la situación que la lección 3 del encabezado de `lib/panel-branch.ts` (líneas 30-33) y el propio comentario del guard (líneas 155-160: *"es obligatoria adentro del `popstate`… un `router.replace` pedido en ese momento se llama, no escribe nada"*) dan por **medida como rota**. La barra la evita pasando `setPedida`, y la rama con sentinel del guard pasa `setLeaveNow`. Esta rama no. El comentario de la línea 327, *"Sin sentinel el plan se ejecuta EN EL ACTO"*, es falso para el colapso: el acto real ocurre en el `popstate` del primer consumo.

El camino es alcanzable. El propio archivo enumera cómo se pierde el sentinel entre el diálogo y el click: el `replace` del sidebar, el `replaceState` crudo, y cualquier `replaceState` del `HistoryUpdater` de Next sin `preserveCustomHistoryState`. A eso se suma que `useDirtyHistory` declina armar cuando hay una entrada ajena arriba.

Síntoma: el dueño confirma descartar su trabajo en `/web`, toca Turnos y termina en **Más**, no en Turnos. El caso degenerado (`second-consume` que se niega, línea 410-411) tiene el mismo defecto.

**Fix:** que la rama sin sentinel use **siempre** la navegación diferida para todo plan que no sea `push`/`replace`. Así ninguna navegación sale de adentro de un evento:
```tsx
if (plan === planDeRama) {
  const navegar: BranchNavigate =
    planDeRama === 'push' || planDeRama === 'replace'
      ? navegarYa                                   // desde el click: verificado
      : (href, mode) => setLeaveNow({ href, mode }) // puede llegar desde un popstate
  ejecutarPlanDeRama({ plan: planDeRama, href: nav.href, from: pathname, to: destino, navegar })
  return
}
```
Ojo con la auditoría de fuente `(i)` de `test/dirty-history.test.ts`: exige ver `setLeaveNow` inline en `completarSalida`, así que este cambio puede necesitar ampliar ese gate en vez de esconder el pedido. Y fijarlo con un caso: el guard sin sentinel, `/web` (marca `/mas`) hacia `/appointments`, no puede llamar al router de forma síncrona desde el listener del `popstate`.

## Warnings

### WR-01: La animación de salida del aviso dibuja una píldora vacía

**File:** `components/dashboard/panel-bottom-nav.tsx:250-262`

**Issue:** El texto se desmonta en el mismo render en que arranca el fade-out (`{hintVisible ? 'Tocá atrás…' : null}`). Durante los 200 ms de `duration-200 ease-in`, el `span` sigue con `bg-foreground px-4 py-2` pero sin contenido: se ve un rectángulo oscuro de unos 32×36 px que encoge y se desvanece. La transición de salida nunca muestra el aviso desvaneciéndose, sólo el residuo vacío. El propio archivo cuida las duraciones de entrada y salida, y este detalle las anula.

**Fix:** mantener el texto renderizado siempre en la píldora visual (con `aria-hidden` cuando no está visible) y dejar que la región viva anuncie por separado:
```tsx
<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
  {hintVisible ? 'Tocá atrás otra vez para salir' : ''}
</div>
<span aria-hidden="true" className={cn(/* …mismas clases… */)}>Tocá atrás otra vez para salir</span>
```

### WR-02: Cerrar un overlay de Inicio con un toque (X o fondo) deja el sentinel PENDIENTE: el próximo atrás sale sin aviso

**File:** `lib/panel-branch.ts:1571-1588` (rama `ignore`), `lib/panel-branch.ts:1612-1651` (`alTocar`)

**Issue:** `components/ui/dialog.tsx` y `drawer.tsx` usan `overlay-history`, así que todo diálogo de Inicio (por ejemplo el `PlanModal` del banner de plan, que además se auto-abre desde el CTA de la landing) empuja su entrada. Si el overlay se abrió antes de que el sentinel estuviera armado (auto-apertura, o el primer toque en Inicio fue el que lo abrió), la pila es `[/dashboard, overlay]`. Al cerrarlo con la X:
- El `click` llega a `alTocar` con la entrada del overlay todavía arriba, porque su `back()` es asíncrono. `foreignOwnsTop` da `none`, y `panelExitStillHolding` da `false`.
- Llega el `popstate` del cierre y la rama `ignore` re-arma con `puedeEmpujar: false` por política, así que queda `pendiente`.

El dueño tocó (hubo activación vigente), pero el armado quedó pendiente, y el siguiente atrás sale del sitio **sin aviso**. Este caso no está en la lista de costos declarados del encabezado (que sólo menciona entrada directa, atrás del navegador, teclado y "un toque que un link se llevó").

**Fix:** guardar en una ref que el último toque declinó **por** `foreignOwnsTop`. En la rama `ignore` del `popstate` siguiente, si esa ref está encendida y `panelExitActivationNow(navigator.userActivation)` sigue en verdadero, empujar con activación, y limpiar la ref en todos los casos. No es un temporizador: es reintentar el mismo gesto cuando su obstáculo desapareció. Si se decide no hacerlo, sumar este caso a la lista de costos declarados.

### WR-03: La propagación de la marca depende de que React no comitee la ruta intermedia `/mas`; si lo hace, el único consumidor descarta el pedido y vuelve G-3

**File:** `lib/panel-branch.ts:209-219` (`applyBranchMarkRequest`), `lib/panel-branch.ts:1409-1434` (efecto de marcado)

**Issue:** En el colapso, `segundoPaso` deja el pedido `{ destino: to, rutaDebajo }` en el `popstate` que aterriza en `/mas`, y la navegación al destino se ejecuta en un commit posterior. El efecto de marcado corre en **cada** cambio de `pathname` y `applyBranchMarkRequest` **descarta siempre** el pedido. Si el traverse de Next (transición) comitea `pathname === '/mas'` antes de que se procese el `router.replace(to)`, el efecto corre con `/mas`, el pedido (`destino !== '/mas'`) se tira, y en el commit de `to` `branchMarkDecision` deriva `push` desde Más y escribe `frjUnder: '/mas'`. Eso es exactamente la causa medida de G-3. Hoy funciona porque las dos transiciones se entrelazan en un solo render, pero eso es semántica de planificación de React y Next, no un invariante del módulo, y ningún test puro lo puede ver.

**Fix:** que el descarte no ocurra en un commit cuya ruta es la del **aterrizaje del retroceso** del mismo gesto. Por ejemplo, conservar el pedido si `current === more` y `takeBackLanding() === more`, y descartarlo en el siguiente commit. Como mínimo, declarar este supuesto junto al A1 del efecto de marcado y agregar la verificación al guion de UAT.

### WR-04: El estado de módulo del canal de propagación sobrevive a la salida del panel y se puede aplicar sobre una entrada ajena al volver

**File:** `lib/panel-branch.ts:189-194, 267-284, 1372-1383`

**Issue:** `marcaPedida` (y `rutaDelUltimoRetroceso`) viven en el módulo y sólo se drenan en el efecto de marcado de una instancia montada. Si `branchCarryMark` deja un pedido (por ejemplo `/clients` hacia `/appointments` con `rutaDebajo: '/dashboard'`) y esa navegación termina fuera del panel (sesión vencida, el proxy redirige a `/login`), la barra se desmonta con el pedido vivo. Si el dueño vuelve a entrar y el primer `pathname` del panel coincide con `destino` (un login que devuelve a la ruta pedida), el primer commit escribe `frjUnder: '/dashboard'` sobre una entrada que tiene `/login` debajo. Entonces tocar Inicio da `raizDebajo` y `up`, un `back()` hacia `/login`: la marca falsa que el propio docblock describe como "el dueño fuera del sitio". Es poco probable, pero el fix es trivial.

**Fix:** en la limpieza del efecto de dominio, cuando el conteo de vivas llega a cero, descartar los dos datos de módulo:
```ts
return () => {
  instanciasVivas = Math.max(0, instanciasVivas - 1)
  if (instanciaDuena === id) instanciaDuena = null
  if (instanciasVivas === 0) { marcaPedida = null; rutaDelUltimoRetroceso = null }
}
```
(Con el modo estricto no hay problema: el remontaje es síncrono y el pedido sólo existe entre un gesto y su commit.)

### WR-05: El canal de diagnóstico (`recordExitDiag` / `window.__forjoPanelDiag`) en producción, evaluación para la decisión pendiente

**File:** `lib/panel-branch.ts:1010-1111` y los cuatro call sites (`1511`, `1558`, `1629`, `1694`)

**Issue:** Evaluación pedida:
- **Exposición de datos: baja.** Graba pathname, hash, las marcas `frj*` (`frjView` guarda el **nombre** del parámetro, no el valor, según `panelViewState`), ids numéricos de instancia y booleanos. No hay ids de cliente ni de tenant. Igual queda una **traza de navegación con timestamps** (qué secciones visitó el dueño y cuándo) disponible para cualquier script del mismo origen que defina el global antes que la app: una extensión, o un script de terceros si algún día se agrega. Ese script ya podría observar `location`, así que no es una fuga nueva, pero sí una API de telemetría lista para usar.
- **Memoria: acotada.** Tope de 200 registros chicos y `splice` de lo más viejo. Sin el global, cero.
- **Costo: despreciable pero no nulo.** `alTocar` corre en **cada** `click` y `keyup` de **todo** el panel (no sólo en Inicio) y arma el objeto `hechos` aunque el canal esté cerrado.
- **Mantenibilidad:** suma unas 100 líneas y tres exports públicos (`recordExitDiag`, `PANEL_EXIT_DIAG_MAX`, los tipos) a un módulo de política, y los call sites mezclan instrumentación con decisión.

**Fix (recomendado):** hacerlo código muerto en el build de producción salvo que se pida explícitamente:
```ts
const DIAG_HABILITADO = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_PANEL_DIAG === '1'
export function recordExitDiag(entrada: PanelExitDiagInput): boolean {
  if (!DIAG_HABILITADO) return false
  // …
}
```
Si las sondas tienen que correr contra producción, alcanza con el flag público en un deploy de preview. No es un BLOCKER de seguridad: es higiene.

## Info

### IN-01: Comentarios rancios que todavía describen la ventana/temporizador borrado en el plan 03-13, y numeración de reglas inconsistente

**File:** `components/dashboard/panel-bottom-nav.tsx:150-152`; `lib/panel-branch.ts:535`, `636-639`, `672-677`, `737-739`

**Issue:** "la ventana del aviso NO se re-declara acá: ese número vive en el módulo del ciclo", "no la consumiría al expirar la ventana" y "la mitad lógica de la constante única" hablan de algo que ya no existe. En `panelExitArmAction`, la lista numera la regla de la decisión (a) como 7 pero el código la llama "LA SEXTA", y el docblock dice "Las cinco anteriores son de seguridad" cuando hay seis. En un archivo de unas 1770 líneas, donde casi el 80% son comentarios, este tipo de desfase es lo que engaña al próximo lector.

**Fix:** actualizar esas frases a la regla vigente ("el aviso no vence; lo baja el toque") y unificar la numeración con la lista del docblock.

### IN-02: El botón adelante devuelve al sentinel con el aviso todavía visible, y ese aviso miente una vez

**File:** `lib/panel-branch.ts:1599-1606`, `1765-1767`

**Issue:** Con el aviso visible, la entrada `#salir` queda como entrada de adelante. Si se toca adelante, el `pathname` sigue siendo la raíz y `avisoAbiertoRef` sigue verdadero, así que el aviso sigue visible parado **sobre** el sentinel. El siguiente atrás consume el sentinel (otro `hint`) en vez de salir. Es poco frecuente en mobile.

**Fix:** en `alRetroceder`, si `topIsOurs` es verdadero y `avisoAbiertoRef.current` está encendido, bajar el aviso (`avisoAbiertoRef.current = false; setHintVisible(false)`).

### IN-03: Exports sólo para tests sobre estado mutable de módulo

**File:** `lib/panel-branch.ts:134-147, 1120-1123`

**Issue:** `recordBackLanding`, `takeBackLanding` y `nextBranchId` mutan el estado global del módulo y quedan en la API pública. Un consumidor futuro que los llame rompe el invariante de un solo productor/consumidor sin que lo vea ningún gate.

**Fix:** agruparlos bajo un objeto `__testing` explícito, o agregar un gate que cuente sus call sites fuera de las suites.

### IN-04: Asserts de orden con `indexOf` sin guarda de `-1`

**File:** `test/panel-nav-chrome.test.ts:261-262`

**Issue:** `expect(nav.indexOf('requestNavigation')).toBeLessThan(nav.indexOf('consumeOwnedPanelEntry'))` pasa si falta `requestNavigation` (`-1 < n`). Hoy lo protege otro `it` del bloque 3. Si ese bloque se reestructura, este gate queda midiendo cero.

**Fix:** anteponer `expect(nav).toContain('requestNavigation')` y `expect(nav).toContain('consumeOwnedPanelEntry')` en el mismo `it`.

### IN-05: El texto del aviso dice "Tocá" también en escritorio

**File:** `components/dashboard/panel-bottom-nav.tsx:261`

**Issue:** D-05 muestra el aviso en escritorio, donde el gesto es un click o el teclado. Es menor, pero el microcopy no corresponde a la superficie.

**Fix:** un texto neutro ("Volvé atrás otra vez para salir"), o decidir el copy con el dueño.

### IN-06 (CONGELADO, no se edita acá): `scripts/con-turno.mjs` con `shell: true` concatena los argumentos sin escapar

**File:** `scripts/con-turno.mjs:112-115, 141-143`

**Issue:** En el camino `.cmd`/`.bat` (`npm`, `npx`), los argumentos con espacios o metacaracteres de `cmd.exe` (`&`, `|`, `^`, `%`) llegan partidos o se interpretan. Es acotado a argumentos del propio desarrollador, así que no es un vector remoto. Además, una señal fuera del mapa sale con `128 + 0`.

**Fix:** reportarlo en el ERP: escapar cada argumento para `cmd.exe` (o resolver el `npm-cli.js` y lanzarlo con `node`) y mapear la señal con `os.constants.signals[senal]`.

### IN-07 (CONGELADO, no se edita acá): `next.config.ts` con IPs DHCP hardcodeadas en `allowedDevOrigins`

**File:** `next.config.ts:49-56`

**Issue:** Ya cambió tres veces (`.7 → .3 → .10`) y cada cambio rompe la hidratación en el teléfono, lo que parece un bug de la fase sin serlo. Sólo afecta a dev.

**Fix:** derivar las IPv4 privadas de `os.networkInterfaces()` en tiempo de config, sólo en desarrollo.

---

_Reviewed: 2026-10-29T23:05:10Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
