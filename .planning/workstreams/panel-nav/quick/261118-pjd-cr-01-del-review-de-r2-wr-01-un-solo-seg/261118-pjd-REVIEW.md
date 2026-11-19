---
phase: quick-261118-pjd
reviewed: 2026-11-19T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - lib/panel-branch.ts
  - lib/panel-history.ts
  - lib/panel-history.test.ts
findings:
  critical: 1
  warning: 1
  info: 4
  total: 6
status: issues_found
---

# Quick 261118-pjd (CR-01 del review de R2-WR-01): revisión de verificación antes del push

**Revisado:** 2026-11-19
**Profundidad:** standard, con chequeos puntuales entre archivos: `components/dashboard/unsaved-changes-guard.tsx`, `components/dashboard/panel-bottom-nav.tsx`, `usePanelBranch` en `lib/panel-branch.ts` y `test/panel-branch.test.ts`
**Archivos revisados:** 3
**Estado:** issues_found

## Resumen

Revisé `git diff 73ff6cc HEAD -- lib/panel-branch.ts lib/panel-history.ts lib/panel-history.test.ts`, cada archivo completo como contexto.

**Verificación mecánica:**

- `vitest run lib/panel-history.test.ts test/panel-tabs.test.ts test/panel-branch.test.ts`: 521/521 en verde.
- `node_modules/.bin/tsc --noEmit`: sale 0 y sin salida.

**Pregunta (3): la política no cambió.** Comparé el cuerpo completo de cada función, de la firma al `}` de cierre, entre `73ff6cc` y HEAD. Son byte-idénticas `panelNavMode` (18 líneas), `panelBranchPlan` (103), `branchSecondStep`, `branchStackFacts`, `consumeOwnedExitSentinel`, `isForeignOwnedEntry`, `panelUnderRoute` y `panelViewEntryParam`.

**Pregunta (1): los arreglos, re-medidos.** Re-corrí el simulador de la ronda anterior contra HEAD y le sumé uno nuevo. El nuevo corre los ejecutores REALES:

- un `back()` asíncrono, que también puede tirar o ser ignorado;
- un despacho como el del DOM: copia de los oyentes, marca de removido y sin duplicar el mismo par (tipo, fn);
- el conteo de los oyentes de `pageshow`;
- un `decidir` igual a `decidirDesdeElAterrizaje`;
- un doble del guard de cambios sin guardar, sin `exitId` ni `reDecidir`, que degrada a la regla de rutas.

Lo corrí contra HEAD y contra `73ff6cc`.

- Probe viejo: `C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/e3541fb4-9838-45ba-8edf-fb689e438b9e/scratchpad/rev/guard.run.ts` (bundle de HEAD: `guard.head.mjs`)
- Probe nuevo: `C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/e3541fb4-9838-45ba-8edf-fb689e438b9e/scratchpad/rev/sim2.ts` (bundles `sim2.head.mjs` y `sim2.base.mjs`, que resuelven `@/` con `tsc.head.json` y `tsc.base.json`)

Las pilas:

- **fin:** `/afuera → /dashboard → /finances{U:/dashboard} → /finances?tab=ventas{V}`
- **sec:** `/afuera → /dashboard → /finances{U:/dashboard}`
- **fichas:** `… → /clients{U} → ?c=A{V} → ?c=B{V}`
- **mas:** `/afuera → /dashboard → /mas{U:/dashboard} → /web{U:/mas}`
- **exit:** `/afuera → /dashboard → /dashboard{frjExit:7}`

| Escenario | HEAD | 73ff6cc | Veredicto |
|---|---|---|---|
| C (CR-01): doble B1 | 2, `/dashboard` | 3, `/afuera` | cerrado |
| C2: doble B1, dos fichas | 3, `/dashboard` | 4, `/afuera` | cerrado |
| C3: triple B1, dos fichas | 3, `/dashboard` | 5, `/afuera` | cerrado |
| D / D2: menú↔B1 en los dos órdenes | 2, `/dashboard` | 2, `/dashboard` | sin cambio |
| UP-doble | 1, `/dashboard` | 2, `/afuera` | cerrado |
| CO1: doble colapso hacia Inicio (`second-consume`) | 2, `/dashboard` | 4, **`/afuera`** | cerrado (antes no estaba medido) |
| CO2: doble colapso hacia `/agenda` | 1 + `replace /agenda` ×2 | 2, `/dashboard` + `replace` ×2 | cerrado |
| W1-menú: el tab, después el `replaceState` de Next, después el menú (WR-01) | 1, `/finances` | 2, `/dashboard` | cerrado |
| W1-b1: el tab, después el `replaceState` de Next, después B1 | 2, `/dashboard` | 3, `/afuera` | cerrado |
| W1-up: up, después el `replaceState` de Next, después up | 1, `/dashboard` | 2, `/afuera` | cerrado |
| E (WR-02, B1): el `back()` tira, después un atrás del sistema | 1, `/finances`; 0 oyentes después del tiro | 2, `/dashboard`; queda 1 oyente | cerrado |
| E3 (WR-02, colapso) | 1, `/mas`, sin navegación; 0 oyentes | `replace /agenda` espurio | cerrado |
| E4 (WR-02, exit) | 1, `/dashboard`, sin navegación; 0 oyentes | `push /finances` espurio | cerrado |
| E5: B1 colgado, después un B1 que tira, después atrás | 1, `/finances`; 0 oyentes | 3, `/afuera` | cerrado |
| S (CR-b1-silencio): retroceso ignorado, 4 toques a la barra y un atrás | 2, `/dashboard` | 5, `/afuera` | cerrado (con el radio declarado) |
| P1 (IN-01): `pageshow` no persistido y después persistido | la guarda sigue en pie y después se suelta; 0/0 oyentes | nunca se suelta; queda 1 oyente | cerrado |
| P2 / P3: oyentes después de un up o un B1 normal | 0 popstate / 0 pageshow | 0/0 | sin fugas |
| **X2: doble toque desde Inicio con el aviso de salida armado** | **2, `/afuera`**, `push` ×2 | 2, `/afuera` | **abierto** (CR-01) |
| **S4: up colgado, después el guard sucio pide `up`** | **0 retrocesos, sin navegación** | 1, `/dashboard` | **nuevo** (WR-01) |
| W1x: up, después un reemplazo que CAMBIA la URL, después up | 2, `/afuera` | 2, `/afuera` | borde declarado de la opción A (IN-02) |

**Pregunta (2): lo que el arreglo podría introducir.**

**El segundo paso único de B1 nunca dejó un Inicio pedido sin completar** en C, C2, C3, D, D2, W1b, E5, S y F (un `popstate` ajeno antes que el de B1). La negativa de `consumeOwnedPanelEntry` después de un plan `consume-view-then-navigate` es inalcanzable fuera del `popstate`, porque el plan y las guardas leen el mismo state en el mismo tick. Por eso el `segundoPasoB1Pendiente = null` en la rama de la negativa no puede perder el paso de otro toque legítimo.

**Fugas: no encontré ninguna.**

- `pageshow` sin `once` no se acumula. Cada encendido va precedido de una liberación, o sale temprano con `'none'`, y el DOM no duplica la misma referencia.
- Los tres `catch` dejan cero oyentes y la memoria apagada.

**`throw e` no deja estado a medias.** El único caso es un pendiente viejo de B1 que se descarta cuando el consumo nuevo tira. El docblock lo declara: aterriza sin re-decidir y el dueño queda en la sección.

**La guarda compartida sí bloquea un camino legítimo:** el `up` del guard de cambios sin guardar con una guarda colgada (WR-01). Con un overlay, el aviso de salida o una navegación del router sin `popstate` (S3: el `push` cambia el state Y la URL, así que el chequeo de llegada suelta la guarda) no encontré bloqueos nuevos.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: un doble toque en la barra desde Inicio con el aviso de salida armado saca al dueño del sitio (preexistente, de la misma familia, y no cubierto)

**Archivos:** `lib/panel-branch.ts:310-314` (`consumeOwnedExitSentinel`, sin guarda de consumo en vuelo) y `lib/panel-branch.ts:413-441` (la rama `consume-exit-then-navigate`)

**Problema:** este quick cierra el doble toque en B1 (CR-01) y en `up` (UP-doble), y además el del colapso (CO1, medido acá: antes daba 4 retrocesos y `/afuera`). Pero el tercer consumo de dos pasos sigue sin la guarda. Con el sentinel de salida arriba (Inicio, con el aviso armado; por D-05 también en escritorio), dos toques a un destino de la barra antes de que llegue el recorrido hacen esto:

1. `handleNavigate` lee dos veces el MISMO `{frjExit: id}`.
2. Las dos veces el plan da `consume-exit-then-navigate`.
3. Cada toque engancha su propio `segundoPaso`.
4. `consumeOwnedExitSentinel` retrocede dos veces: el primer retroceso consume el sentinel y el segundo consume la entrada de Inicio.

Medido (X2): 2 retrocesos y **`/afuera`**, con `push /finances` ×2, en HEAD y en `73ff6cc`.

- **No es una regresión de este diff:** `consumeOwnedExitSentinel` es byte-idéntica.
- **Es el mismo gesto (el doble toque impaciente en la barra de mobile, sin debounce) y el mismo resultado (cicatriz 2) que este quick declara cerrados.** Y arranca desde Inicio, que es la pantalla donde más se toca la barra.

**Fix:** que `consumeOwnedExitSentinel` lea la misma guarda. La forma mínima es exportar desde `lib/panel-history.ts` un chequeo y encendido compartidos (`consumoEnVueloDesdeAca(): boolean` / `encenderConsumo(actual)`), para no hacer una cuarta copia del bloque:

```ts
export function consumeOwnedExitSentinel({ id }: { id: number }): boolean {
  if (consumoEnVueloDesdeLaEntradaActual()) return true   // el mismo chequeo de llegada (state O URL)
  if (!isPanelExitEntry(window.history.state, id)) return false
  return retrocederConGuarda(window.history.state)        // el mismo bloque de encendido + back + catch
}
```

Los dos `segundoPaso` de la rama piden la misma navegación (`setPedida` con el mismo destino, en el mismo evento), así que con un solo retroceso el resultado es un `push` y no dos. Si se quiere simetría con B1, el último toque gana con una memoria `segundoPasoExitPendiente`.

Antes del arreglo conviene un candado `X2-exit-doble` en `test/panel-tabs.test.ts`: dos `barra('/finances')` en la pila exit y después `procesar()` ⇒ 1 retroceso, `/dashboard`, 1 `push`.

## Warnings

### WR-01: con la guarda colgada, el `up` del guard de cambios sin guardar queda muerto después de «Descartar»

**Archivos:**

- `lib/panel-history.ts:1404-1407`: el `return true` temprano, ahora también en `consumeOwnedBranchEntry`.
- `components/dashboard/unsaved-changes-guard.tsx:269-277`: el camino inmediato, sin sentinel sucio.
- `lib/panel-history.ts:1079-1087`: el residuo declarado.

**Problema:** antes de este diff, `consumeOwnedBranchEntry` no encendía la guarda ni la leía. Una guarda colgada (el residuo aceptado: un `back()` que el navegador ignora sin tirar) sólo trababa los tabs, el menú y B1. Ahora también la enciende el propio `up`, y mientras siga encendida, todo `up` o colapso sobre la misma entrada devuelve `true` **sin retroceder y sin navegar**. El ejecutor lo propaga como «se hizo cargo», así que el guard sucio no degrada a `navegar`.

- Medido (S4): en `73ff6cc`, 1 retroceso y `/dashboard`. En HEAD, `up:seHizoCargo`, 0 retrocesos, ninguna navegación, y el dueño queda donde estaba después de aceptar perder su trabajo.
- Medido (S2): por la barra, el segundo `up` también queda muerto (0 retrocesos).

El guard declara este resultado como «el peor de todo este archivo» (`unsaved-changes-guard.tsx:275-277`), y el radio del residuo en `panel-history.ts:1079-1087` lista tabs, menú y barra, pero no el guard.

**Probabilidad:** baja. Requiere el retroceso ignorado en silencio (sin medir en ningún motor) y que el guard tome el camino inmediato, sin sentinel sucio. Por eso es WARNING y no BLOCKER.

**Fix:** como mínimo, sumar el guard sucio al radio declarado del residuo. Para cerrarlo, que la guarda se considere colgada pasado un tiempo que ningún recorrido real alcanza (un clic sobre un diálogo tarda segundos; un recorrido de la misma página, milisegundos):

```ts
let consumoDesde = 0 // performance.now() del encendido
// en el chequeo de vuelo de los dos consumos:
if (consumoEnVuelo) {
  const colgada = performance.now() - consumoDesde > 2000
  if (!colgada && (window.history.state === estadoDelConsumo || urlActual() === urlDelConsumo)) return true
  soltarConsumo()
}
```

Si no se quiere un reloj, que `consumeOwnedBranchEntry` devuelva un resultado de tres valores (`'consumio' | 'en-vuelo' | 'nego'`) y que el guard trate `'en-vuelo'` como negativa y navegue.

## Info

### IN-01: el contrato de `true` de `consumeOwnedBranchEntry` cambió, y el encabezado y dos call sites dicen lo de antes

**Archivos:** `lib/panel-history.ts:1357-1358`, `lib/panel-branch.ts:408-410` y `:496`, y `components/dashboard/unsaved-changes-guard.tsx:274`

**Problema:**

- El encabezado sigue diciendo «Devuelve `true` si consumió algo, `false` si no tocó nada». Ahora `true` también significa «hay otro consumo en vuelo y no retrocedí». La sección ⚠ de más abajo lo explica, pero la primera línea, que es la que lee quien la llama, es falsa.
- En el colapso, `if (consumeOwnedBranchEntry()) return` (`panel-branch.ts:496`) depende de que otro recorrido haga el trabajo. Es lo que hace andar CO1, pero no está escrito.
- El comentario del guard («Se negó (marca perdida, o entrada de otro dueño)») ya no describe todos los caminos. Es el origen de WR-01.

**Fix:** corregir la primera línea del docblock, igual que en `consumeOwnedPanelEntry:1284-1285`, y anotar en `:496` que un `true` sin retroceso es correcto porque el recorrido en vuelo cubre el segundo consumo.

### IN-02: el borde de la opción A está medido, sin un productor conocido

**Archivo:** `lib/panel-history.ts:1336, 1405` (comparación `pathname + search`)

**Problema:** W1x (un reemplazo que cambia la URL dentro de la ventana) da 2 retrocesos y `/afuera` en HEAD, igual que antes. Está declarado en el docblock.

Busqué productores reales dentro de la ventana:

- La rama `replace` de `applyPanelView` queda bloqueada por la bandera.
- La limpieza de la query de Google en Agenda corre sobre una carga completa, sin la marca de la rama.
- Ninguno otro.

La comparación tampoco mira el `hash`. Hoy no importa: las entradas de overlay y del sentinel sucio, que sí lo usan, quedan ARRIBA y no debajo de una entrada nuestra.

**Fix:** ninguno ahora. Si aparece un productor, la alternativa sigue siendo la de capturar `popstate` (WR-01 del review anterior).

### IN-03: semánticas distintas ante dos toques: B1 se queda con el último y el colapso con el primero

**Archivo:** `lib/panel-branch.ts:457-462` frente a `:514` y `:428`

**Problema:**

- Con B1, el último toque gana (B1d: Inicio y después `/clients` ⇒ `replace /clients`).
- Con el colapso y con el sentinel, gana el primero (CO3: `/agenda` y después Más ⇒ `replace /agenda`). Además los dos `segundoPaso` navegan (CO2: `replace /agenda` ×2; X2: `push` ×2).

Hoy es benigno: es el mismo destino, en el mismo evento, y React lo agrupa en un solo commit. Pero es una asimetría sin declarar entre ramas hermanas.

**Fix:** declararla en el docblock de `segundoPasoB1Pendiente`, o unificar con una sola memoria de segundo paso pendiente para las tres ramas, que también resolvería la mitad de CR-01.

### IN-04: fuera de alcance: `test/panel-branch.test.ts` sigue filtrando por `fn.name` y su stub no tiene `location.search`

**Archivo:** `test/panel-branch.test.ts:58-61, 201, 213` (no está en el alcance de este review; se anota porque lo toca el mismo quick)

**Problema:**

- Las aserciones editadas filtran con `o.fn.name !== 'soltarConsumo'`. Es el patrón que IN-03 del review anterior pidió sacar, y `panel-history.test.ts` sí lo sacó en este diff.
- El stub `location: { pathname }` no tiene `search`, así que la URL de la guarda vale `'/financesundefined'`. Es consistente dentro de cada caso, pero esa suite nunca mide el disyunto de URL de la opción A con una query real.

**Fix:** filtrar por identidad contra los oyentes que no son de la guarda (por ejemplo, el primero enganchado) y agregar `search: ''` al stub.

---

_Reviewed: 2026-11-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
