---
quick_id: 261006-flm
slug: el-aviso-de-cambios-sin-guardar-que-sign
date: 2026-10-06
status: complete
requirements: [NAV-09, NAV-10, NAV-11]
uat: PENDIENTE (celular del dueño, los 7 puntos del PLAN) — medido antes en Chrome 153 headless, 11/11 escenarios, con las funciones REALES bundleadas y el atrás de nivel navegador
commits:
  - c52593d
  - 351a53b
plan_head_before: f6027a04
actuals:
  commits: 2
  tasks: 3
key-files:
  created:
    - lib/dirty-history.ts
    - test/dirty-history.test.ts
  modified:
    - lib/agenda-hours-payload.ts
    - app/(dashboard)/agenda/agenda-client.tsx
    - lib/unsaved-changes.ts
    - lib/panel-history.ts
    - lib/panel-history.test.ts
    - components/dashboard/unsaved-changes-guard.tsx
    - test/agenda-hours-payload.test.ts
decisions:
  - La huella de "sucio" cubre EXACTAMENTE los inputs que lee el guardado; el id y el error de validación quedan afuera, y el orden de bloques y de servicios no cuenta.
  - El baseline es UNO por negocio y cambiar de sucursal no lo re-captura.
  - Marca nueva frjDirty + hash #sin-guardar; la regla 0 de panel-history la aprendió.
  - El diálogo del guard deja de pasar por el wrapper Dialog para no apilar dos absorbentes.
  - NAV-11 = panelNavMode + replace sobre el sentinel (medido contra las otras tres variantes).
---

# Que "cambios sin guardar" signifique distinto de verdad, y que el atrás frene

Tres Tasks, dos commits (NAV-09 primero y solo; NAV-10 y NAV-11 juntos porque comparten la
aritmética del stack). Cero paquetes, cero migraciones (siguen **41**), cero cambio de markup ni de
clases, misma copy y misma posición del indicador. `lib/overlay-history.ts`, `resetDrawerDrag`,
`nuevo-turno-form.tsx` y `nuevo-abono-form.tsx` quedaron **sin tocar** (verificado con
`git diff --name-only`).

---

## NAV-09 — sucio = distinto del baseline (`c52593d`)

El latch por gesto se fue. `agendaHoursFingerprint` / `isAgendaHoursDirty`
(`lib/agenda-hours-payload.ts`) comparan el modelo contra lo último cargado o guardado, y los ocho
`setHoursDirty(true)` desaparecieron del componente.

**Cómo normalizo la comparación, y el criterio que lo decide:** la huella cubre *exactamente lo que
el guardado persiste* — lo que lee `buildSaveHoursPayload` (la bandera de día abierto y, por bloque,
horas, etiqueta, consultorio y servicios) más la configuración que escribe el UPDATE de `businesses`
(duración del turno y descanso). Ese criterio es el que cierra la clase de falla "la huella dice
limpio y guardar igual cambiaría algo en la base", y es por eso que `enabled` entra aunque sea
derivado: el payload lo lee como gate.

Lo que queda **afuera**, con su motivo:

- **`id`** — decide INSERT vs UPDATE, no *qué* se guarda. Dos franjas con las mismas horas y los
  mismos servicios son la misma franja para el dueño, y un borrar-y-recrear idéntico no es un cambio
  que valga frenar una navegación.
- **`error` de validación** — es el resultado de validar, no una intención (misma razón por la que
  `validateBlocks` nunca ensució nada).

Y lo que **no cuenta como cambio aunque el arreglo difiera**: el orden de los bloques del día (el
dueño ve una lista filtrada por sede; el orden del arreglo completo es un subproducto de cómo lo
reconstruye cada mutador —copiar un día deja primero los de las otras sedes— y de cómo vienen las
filas) y el orden de los `service_ids` (se agregan en el orden en que se tocan los chips y la puente
no tiene orden). Se **ordena**, no se deduplica: dos franjas idénticas en el mismo día siguen siendo
dos. Cada bloque se serializa con `JSON.stringify` de una tupla y no juntando campos con un
separador, así una etiqueta con `|` no puede hacer colisionar dos bloques distintos (hay un caso que
lo fija).

**El cambio de sucursal: el baseline es UNO para todo el negocio y `activeLoc` NO lo re-captura.**
`dayStates` tiene los 7 días de todas las sedes y el guardado manda el set completo (P-03). Un
baseline por sede diría "limpio" al cambiar de pestaña teniendo cambios sin guardar en la otra, el
dueño se iría sin aviso y los perdería — justo el modo de falla que el indicador existe para cubrir.
Cambiar de sucursal cambia lo que se **muestra**, no el modelo. Hay un caso que lo congela.

Dos efectos colaterales que salieron gratis:

- El indicador dejó de mentir: tocar y deshacer ⇒ **limpio** (el caso que hoy fallaba).
- Si el UPDATE de duración/descanso falla, **no se re-captura el baseline de config** y la señal
  queda encendida por consecuencia de no hacer nada. Antes había que volver a prenderla a mano.

⚠ **Caso honesto que sigue sucio:** cerrar un día que tenía bloques y reabrirlo. Cerrar los destruye
y reabrir agrega uno por defecto, así que el estado final es de verdad distinto. El aviso corresponde;
la comparación no puede mentir a favor nuestro. El gesto del diagnóstico (desplegar un día cerrado
para mirar y volver) sí queda limpio.

---

## NAV-10 — el atrás avisa (`351a53b`)

`lib/dirty-history.ts`, calcado de `lib/overlay-history.ts`: marca propia, predicados, acción por
render, acción al desmontar, `dirtyPopstateAction`, y la mecánica de React al final sin decidir nada.

**La marca nueva y por qué no colisiona.** Es `frjDirty` (numérica, con id por instancia) y el hash
es `#sin-guardar`:

- No es `frjOverlay` ni `frjView`: reusar cualquiera de las dos haría que el otro módulo reconociera
  nuestra entrada como propia y le hiciera su `back()` ⇒ doble consumo ⇒ el dueño fuera del sitio.
- El hash no es `#modal` ni `#modal-N` (los interpreta el cálculo de profundidad de overlay) y no hay
  ningún `id="sin-guardar"` en el panel (barrido sobre `app/(dashboard)` y `components/dashboard`),
  así que no dispara scroll parásito.
- `isDirtyHistoryEntry` devuelve `false` para `{frjOverlay}`, `{frjView}`, `{__NA}`, `null` y
  `undefined` — hay un caso por cada uno.
- `consumeOwnedPanelEntry` ya era seguro (exige `frjView`), y ahora además cae en la guarda de
  entrada ajena.

**La marca se re-verifica antes de CADA `back()`** (consumo y desmontaje), con la guarda escrita
explícita en los dos puntos y no "ya la chequeé arriba". El test audita el fuente y exige que los dos
`back()` de limpieza estén guardados.

**Anidado LIFO: sale gratis de la regla `topIsOurs`.** El modal empuja su entrada encima de la
nuestra, así que cuando el browser la consume seguimos parados sobre la nuestra ⇒ se ignora el evento.
Medido: con un modal abierto el atrás cierra el modal y no aparece ningún aviso; el siguiente sí avisa.

**El caso inverso queda declarado:** si los cambios aparecen *mientras* un modal ya está abierto, el
sentinel queda arriba y el modal pierde su entrada al cerrarse (una entrada de más, un atrás que no
hace nada visible). Se prefiere eso a diferir el empuje: sin sentinel no hay aviso, y perder el
trabajo es peor que una entrada de más. Es el mismo trade-off que `overlay-history` ya documenta.

**Regla 0 de `panel-history` extendida**, como pedía el plan: `isDirtyGuardOwnedEntry` (literal
duplicado a propósito, con el gate que lo audita) + `isForeignOwnedEntry`, y el parámetro de la
decisión pasó de `overlayOwnsTop` a `foreignOwnsTop` para que el contrato no mienta (22 ocurrencias
actualizadas en `lib/panel-history.test.ts`, suite verde). Hoy Agenda no llama a `applyPanelView`,
pero la Phase 2 planea cablear su `activeLoc` con causa `filter` ⇒ `replace`, y ese día el reemplazo
caería justo sobre el sentinel.

**Alcance ampliado, declarado:** el sentinel se engancha en `useUnsavedChanges`, así que el atrás
frena en `/agenda` **y** en `/web`. El docblock que afirmaba "hoy lo hace SÓLO Agenda" quedó
corregido, y también la mitad caduca de la premisa de `unsaved-changes-guard.tsx:21-25`.

⚠ **Decisión que el plan no previó y que es la que hace cerrar la aritmética: el diálogo del guard
deja de pasar por el wrapper `Dialog` de `components/ui/dialog.tsx`.** Ese wrapper engancha
`useOverlayHistory`, o sea que el diálogo **empujaba su propia entrada** — y este diálogo es el que
existe porque el atrás *ya fue absorbido* por el sentinel. Con las dos entradas apiladas hay dos
absorbentes compitiendo: el `back()` de limpieza del overlay y nuestro re-empuje corren en el **mismo
commit**, y la continuación de "Salir sin guardar" tendría que contar entradas que no controla (con
el orden de efectos de React el re-empuje gana y la entrada del diálogo queda enterrada, una por
ciclo). Ahora el `Root` es el primitivo de Base UI directo: **cero diferencia visual** (ese `Root` no
renderiza ningún nodo; contenido, clases y copy intactos) y el sentinel queda como único absorbente,
así que un atrás con el diálogo abierto se absorbe otra vez y el diálogo **sigue** preguntando — que
es lo correcto cuando hay trabajo para perder. Hay un caso que falla si alguien "corrige" esto
volviendo al wrapper.

---

## NAV-11 — la continuación respeta la regla de secciones (`351a53b`)

`confirmLeave()` ya no hace `router.push` a ciegas. Decide `leaveNavigationMode`
(`lib/unsaved-changes.ts`, puro y testeado) con dos entradas:

1. **`panelNavMode({ from, to })`** — la MISMA regla que el sidebar consume en su `<Link replace>`.
   Esto arregla NAV-07 para quien pasa por el diálogo, que estaba roto hoy sin relación con el atrás.
2. **¿hay un sentinel arriba del stack?** (`isDirtyOwnedEntry(window.history.state)`, re-verificado
   en el momento del click y no al abrir el diálogo). Si hay, la continuación **reemplaza** sobre él
   cualquiera sea la regla de secciones: el sentinel es una entrada parásita justo arriba de la
   entrada real, así que reemplazarlo equivale a lo que `push` habría hecho sin él. **Medido**: con
   `push`, el primer atrás cae en `/agenda#sin-guardar` (entrada muerta); con `replace`, el destino
   queda bien y **un solo** atrás aterriza exacto en la agenda.

**La forma sin destino:** `PendingNavigation.href` pasó a `string | null` y `decideNavigation` tiene
su regla propia (sin destino y sucio ⇒ confirmar; un atrás que no cambia de pantalla no existe). Esa
variante **siempre** viaja con `proceed`, reusando el mecanismo que ya existía para el logout: el
único que sabe completar el gesto es quien absorbió la entrada.

**Y cómo quedó la continuación del atrás:** dos pasos **encadenados por el `popstate` de cada uno y
nunca en el mismo tick** (consumir el sentinel, y recién desde su `popstate` el back que lleva a la
entrada real). Encadenarlos a mano está medido como roto porque `history.back()` es asíncrono. El
`leaving` latcheado gana a todas las demás reglas del `popstate` para que el segundo paso no se
reinterprete como un atrás nuevo y vuelva a preguntar en bucle.

**Límite aceptado, igual al que `panelNavMode` ya documenta para las entradas de overlay:** cuando la
regla de secciones pedía `replace` y hay sentinel, el reemplazo cae sobre el sentinel y no sobre la
entrada de la sección, así que quedan dos secciones encima del dashboard. Mejor que un atrás muerto;
pelearlo exigiría consumir dos entradas en cadena.

---

## Verificación

**`./node_modules/.bin/tsc --noEmit`** (nunca `npx tsc`): **sin una sola línea `error TS`**
(filtrando `^\.next/`).

**`npx vitest run`**: **103 archivos, 1602 passed, 4 expected fail, 1 skipped**. Baseline antes de
tocar nada: 102 archivos, 1544 passed, 4 expected fail, 1 skipped ⇒ **+1 archivo, +58 casos, cero
regresiones**. Los canarios de reloj **no aplican**: las corridas fueron a las **11:27** (baseline) y
**11:51** (final) hora AR, dentro de `[01:00, 23:30]`, y los 4 expected-fail son los mismos en las
dos puntas.

⚠ **El baseline no era HEAD limpio y conviene decirlo:** el ejecutor paralelo del quick 261006-fln
estaba trabajando en el mismo árbol, así que sus cambios (ya sin commitear a las 11:27) entraron en
las dos corridas. La cuenta igual cierra exacta —1544 + 58 = 1602, y el único archivo nuevo es el
mío— porque sus 306 líneas de tests ya estaban en el baseline. Sus commits (75394c0, 3d966a8,
536b5c8, sobre `nuevo-turno-form.tsx` y `test/overlay-history.test.ts`) quedaron intercalados en el
log antes de los míos y no se solapan con ningún archivo de este quick.

**`./node_modules/.bin/eslint`** sobre los 8 archivos tocados: **0 problemas**. Aparte queda **un
error preexistente** en `agenda-client.tsx` (`react-hooks/purity`, `Date.now()` dentro de un `useMemo`,
línea 853 en HEAD y 883 ahora por mis líneas de más): está en código que no toqué, confirmado con
`git show HEAD:…`, y queda anotado en `deferred-items.md`.

**Medición de la secuencia completa — Chrome 153 headless, 11/11 escenarios OK.** No es una
simulación en papel: se bundleó `lib/dirty-history.ts` con el `esbuild` que ya está en
`node_modules` (cero paquetes nuevos) y el navegador corrió **las funciones reales**; el atrás es
`Page.navigateToHistoryEntry`, o sea un traverse de **nivel navegador** (el botón de verdad), no un
`history.back()` programático. CDP por `fetch` + `WebSocket` globales de Node 24, servidor estático
propio en **8732** y debug en **9223**: el dev server del dueño en el **puerto 80 no se tocó**.

| # | Escenario | Resultado |
|---|---|---|
| 1 | sucio + atrás | avisa 1 vez y **no sale** (`url=/agenda#sin-guardar`) |
| 2 | quedarse | la entrada **vuelve** y el atrás siguiente vuelve a avisar (2 avisos, 1 sola entrada nuestra) |
| 3 | salir | aterriza en `/dashboard` y **sin atrás muerto** (la pila hasta la posición actual no tiene `sin-guardar`) |
| 4 | guardado | consume, **0 avisos**, y el atrás sale de una a `/dashboard` |
| 5 / 5b | escritura ajena pisa el state | `CONSUME salteado: la marca no es nuestra`, **ni un `back()`** — ni en el consumo ni al desmontar |
| 6 / 6b | anidado LIFO | el atrás se lo come el modal (**0 avisos**), y el siguiente sí avisa |
| 7 | NAV-11 con sentinel | destino correcto y **un solo** atrás vuelve a `/agenda` |
| 8 | control negativo de NAV-11 | con `push`, el primer atrás cae en `/agenda#sin-guardar` (por eso va `replace`) |
| 9 | nadie avisa (sin provider) | el gesto se **completa** en vez de quedar muerto |

En la suite pura los mismos 9 escenarios corren sobre un historial simulado
(`test/dirty-history.test.ts`), más la auditoría del fuente: la marca duplicada no derivó, el state
nunca se compone por propagación (la trampa que falla en silencio), los dos `back()` de limpieza
están guardados, el diálogo no usa el wrapper, la continuación no empuja a ciegas, el módulo no
declara frontera de cliente, y el `beforeunload` de las dos pantallas sigue en pie.

---

## Lo que quedó SIN verificar

- **La UAT del celular (los 7 puntos del plan). No se corrió** — es del dueño, y así lo pidió el
  encargo.
- **La integración con el router REAL de Next en `/agenda` y `/web`.** Lo medido es la mecánica del
  historial en aislamiento (con las funciones reales) más el precedente de producción de
  `overlay-history`. No se levantó la app ni se logueó contra el Supabase local, así que no está
  verificado end-to-end que el `pushState` del sentinel deje a `usePathname`/`useSearchParams`
  sincronizados en estas dos pantallas concretas.
- **Safari/iOS y Chrome Android reales.** Lo medido es Chrome 153 desktop headless. Hereda el blind
  spot del diagnóstico.
- **El atrás por teclado (Alt+Flecha izquierda).** Headless no enruta la tecla al historial.
- **El `popstate` con el teclado de software arriba** (la guarda de `overlay-history`): no interactúa
  con el sentinel en ningún camino que haya podido sintetizar, pero tampoco se midió en un celular.
- **El orden de los dos listeners de `popstate`** (el de Next y el nuestro) bajo carga real.
- **La re-captura del baseline después de un guardado con éxito contra la base de verdad:** el
  ida-y-vuelta está cubierto por un caso puro (`HH:MM:SS` y `null` normalizan igual), no por un
  guardado real.
- **El `?google=connected` conviviendo con el sentinel.** `agenda-client.tsx:290` tiene un
  `history.replaceState(null, …)` crudo que borra cualquier marca de la entrada actual; corre sólo en
  el mount y con ese parámetro en la URL, o sea antes de que pueda haber nada sucio, así que no se
  pudo construir un camino en el que choque. Anotado en `deferred-items.md`.
