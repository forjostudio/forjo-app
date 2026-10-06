---
quick_id: 261006-iey
slug: salir-sin-guardar-deja-la-seccion-vieja-
date: 2026-10-06
status: complete
requirements: [NAV-07, NAV-11]
uat: PENDIENTE (celular del dueño, los 4 puntos del PLAN) — medido antes END-TO-END contra la app real con Chrome + Page.getNavigationHistory
commits:
  - b4e5088
  - 7d862a4
  - bc52a2a
plan_head_before: 0b89664
actuals:
  commits: 3
  tasks: 3
  nota_commits: "MEDIDO: `git rev-list --count 0b89664..HEAD` = 3 (los 3 de código). El commit de este SUMMARY va encima."
key-files:
  created:
    - lib/reveal-in-container.ts
    - lib/reveal-in-container.test.ts
  modified:
    - lib/unsaved-changes.ts
    - lib/unsaved-changes.test.ts
    - components/dashboard/unsaved-changes-guard.tsx
    - components/dashboard/nuevo-turno-form.tsx
    - test/dirty-history.test.ts
decisions:
  - La continuación con centinela consume PRIMERO y aplica el modo de sección después (consume-then-push / consume-then-replace); el replace pelado era el defecto.
  - El consumo NO lo hace el guard: le apaga la bandera al centinela y lo consume su propio módulo, con su guarda de marca.
  - El listener del segundo paso se engancha en el CLICK, no en un efecto.
  - La navegación del segundo paso sale de un efecto (un commit), no del handler del popstate: adentro del popstate el router de Next la descarta en silencio.
  - El punto 3 de la UAT NO es el mismo defecto: es historia honesta (regla 3 de panelNavMode). Medido, no argumentado.
---

# "Salir sin guardar" deja de enterrar la sección que se abandona

Tres Tasks, tres commits. Cero paquetes, cero migraciones (siguen **41**). `lib/overlay-history.ts`,
`lib/dirty-history.ts` y `resetDrawerDrag` quedaron **sin tocar** (verificado con `git diff --stat`:
los 7 archivos del cambio están listados arriba), la copy del diálogo y del indicador es la misma, y
`dateOpen` y su cableado de historial siguen intactos.

---

## Task 1 — la continuación consume el centinela antes de reemplazar (`b4e5088`, `bc52a2a`)

### La pila, antes y después, con números

Las dos puntas medidas con **Chrome + CDP `Page.getNavigationHistory`** (entradas **y** índice
actual) y el atrás de nivel navegador (`Page.navigateToHistoryEntry`). `[x]` marca dónde está parado.

**El recorrido del punto 6** — Agenda sucia → menú → Finanzas → "Salir sin guardar":

| | pila |
|---|---|
| sucio, con centinela | `/dashboard · /agenda · [/agenda#sin-guardar]` (largo=3, i=2) |
| **ANTES** · tras salir | `/dashboard · /agenda · [/finances]` (i=2) |
| **ANTES** · un atrás | `/dashboard · [/agenda] · /finances` ⇒ **cae en Agenda** ✗ |
| **DESPUÉS** · tras salir | `/dashboard · [/finances] · /agenda#sin-guardar` (i=1) |
| **DESPUÉS** · un atrás | `[/dashboard] · /finances · /agenda#sin-guardar` ⇒ **cae en el dashboard** ✓ |

El "antes" reproduce **textual** lo que reportó el dueño (*"puse atrás y me mandó a Agenda, no a
Dashboard"*). El "después" es lo que NAV-07 promete.

**Y lo mismo medido END-TO-END contra la app real** (Next 16 + App Router, dev server del dueño en el
puerto 80 contra el Supabase LOCAL — verificado leyendo el chunk del cliente; el server no se tocó ni
se reinició). Login real, click real en el menú, ensuciado real (el chip de un día, con el indicador
"Cambios sin guardar" confirmado en pantalla), atrás real:

```
sucio:          /dashboard · /agenda · [/agenda#sin-guardar]        (largo=3, i=2)
tras salir:     /dashboard · [/finances] · /agenda#sin-guardar      (largo=3, i=1)   url=/finances
un atrás:       [/dashboard] · /finances · /agenda#sin-guardar      (largo=3, i=0)   url=/dashboard
```

**3 de 3 corridas** con el código final. Eso cierra, además, el blind spot que el quick anterior
dejó anotado (*"la integración con el router REAL de Next no está verificada"*).

### Cómo quedó la continuación

`leaveNavigationMode` pasó a ser **`leaveNavigationPlan`** y devuelve cuatro valores: `push`,
`replace`, `consume-then-push`, `consume-then-replace`. Con centinela **nunca** devuelve un modo
pelado: el modo de sección no cambia por haber centinela — cambia **sobre qué entrada se aplica**.

Los cuatro pasos, en orden, y de quién es cada uno:

1. **Click en "Salir sin guardar"** → el provider decide el plan (`panelNavMode` + "¿hay centinela
   arriba?", re-verificado en el momento del click), guarda el destino en un ref **con la pantalla
   desde la que se pidió**, y **engancha el listener del segundo paso ahí mismo, en el gesto**.
2. **El consumo lo hace el centinela, no el guard.** El provider le apaga la bandera sucia
   (`dirty && !leaving`) y `dirtyHistoryAction` devuelve `'consume'`: el módulo hace **su** `back()`,
   con **su** re-verificación de marca, y su listener ya quedó desenganchado en el mismo commit (así
   ese `popstate` no se puede leer como un atrás nuevo). Este archivo **no llama nunca** a
   `history.back()`, `pushState` ni `replaceState` — hay un caso de auditoría que lo exige.
3. **El `popstate` de ese consumo** deja la navegación *pedida* (y sólo si seguimos en la pantalla
   que se estaba dejando).
4. **Un efecto la ejecuta** (`router.replace` / `router.push`).

### Las tres cosas que sólo aparecieron midiendo contra el router real

El harness en aislamiento daba las tres por buenas. Cada una estuvo **medida**, no deducida:

- **Navegar DENTRO del `popstate` no funciona.** El listener de Next corre antes que el nuestro y
  está procesando su propio traverse (se lo ve en la sonda: `+131ms replace /agenda`, que es Next
  reescribiendo la entrada a la que volvimos, y recién `+139ms POPSTATE`). Un `router.replace` pedido
  ahí se llama y **no escribe nada**: la consola del guard mostraba
  `completarSalida target={href:'/finances',…}` y la URL seguía en `/agenda`. Con el pedido diferido a
  un efecto, la sonda registra `+3447ms replace /finances` y el destino queda.
- **El listener no puede depender de un efecto.** El `back()` del consumo es una navegación
  *same-route*, y eso hace que la pantalla vuelva a montar **limpia**: `setDirty(false)` llega
  **antes** del `popstate`. Un listener atado a `leaving` se desengancha justo antes de que llegue el
  evento. Enganchado en el click, el segundo paso no depende de ningún orden de renders.
- **`setDirty(false)` no puede borrar el destino.** Por la misma re-montada limpia: borrarlo dejaba
  el centinela consumido y la navegación nunca disparada (el dueño se quedaba en Agenda). Hoy apaga
  la bandera y nada más.

El `consume-then-push` (Agenda → dashboard, regla 3 de `panelNavMode`) no es simetría de adorno:
reemplazar sobre el centinela daba el mismo resultado hacia atrás pero dejaba el centinela como
entrada de **forward**; consumiendo primero, el `push` la trunca.

### El `set-state-in-effect` que apareció en el camino

La primera versión apagaba `leaving` en un efecto sobre `pathname` y **eslint lo rechazó**
(`react-hooks/set-state-in-effect`, que el repo trata como error). No se silenció: se movió el apagado
a `setDirty(false)`, que además es el momento semánticamente correcto ("la pantalla que se dejaba ya
no está"). La regla encontró un acoplamiento real, no un falso positivo.

### Límite nuevo, declarado

El `replace` del destino **no trunca el forward**, así que la entrada del centinela
(`/agenda#sin-guardar`) queda como entrada de **adelante**: desde Finanzas, el botón *adelante* del
navegador lleva a una URL muerta que renderiza Agenda limpia. Se cambia a conciencia por el arreglo
del atrás (que es el gesto que el dueño usa, y el único que existe en el celular sin abrir el menú del
browser). Pelearlo exigiría una tercera escritura de historial.

---

## Task 2 — el punto 3 **no** es el mismo defecto, y acá está la evidencia

**Punto 3 del dueño:** *"Salí sin guardar, me mandó al dashboard, toqué atrás y me mandó a turnos, que
no tenía nada que ver."*

Medido END-TO-END, el mismo recorrido, **con el código final**:

```
al llegar a la agenda:    /dashboard · /appointments · /dashboard · [/agenda]                (largo=4, i=3)
sucio, con centinela:     /dashboard · /appointments · /dashboard · /agenda · [#sin-guardar] (largo=5, i=4)
el atrás, absorbido:      ídem (i=4) · el diálogo pregunta
tras "Salir sin guardar": /dashboard · /appointments · [/dashboard] · /agenda · #sin-guardar (i=2)  ← "me mandó al dashboard"
el atrás siguiente:       /dashboard · [/appointments] · /dashboard · /agenda · #sin-guardar (i=1)  ← "me mandó a turnos"
```

**Idéntico antes y después del Task 1** (este camino es el del atrás, que no se tocó). Y la entrada de
`/appointments` está ahí porque **el dueño la visitó**: su recorrido fue *turnos → dashboard → agenda*,
y la **regla 3 de `panelNavMode`** (sección → dashboard = `push`) existe a propósito para que el atrás
desde el dashboard devuelva la sección de la que se venía.

La hipótesis alternativa —"la regla sección→sección no se aplicó al entrar a Agenda"— queda
**descartada por medición**: con el recorrido *dashboard → turnos → agenda*, el `replace` del menú se
come la entrada de turnos y la pila queda `/dashboard · /agenda · [#sin-guardar]`; al salir se aterriza
en `/dashboard` con **i=0** y el atrás siguiente no hace nada. Con ese recorrido, "turnos" **no puede
aparecer**. Lo que vio el dueño sólo es posible con la pila honesta de arriba.

⇒ **No hay nada que arreglar en el punto 3.** Si igual se quiere que el atrás desde el dashboard salga
del panel en vez de devolver la sección anterior, eso es cambiar la regla 3 de NAV-07 para todo el
panel: una decisión del dueño, no un bug, y fuera del alcance de este quick.

---

## Task 3 — el calendario del campo Fecha se lleva a la vista (`7d862a4`)

`revealScrollDelta` (`lib/reveal-in-container.ts`, pura y con 6 casos) calcula **cuánto bajar el
scroll del contenedor**, con tres reglas: si ya entra, 0; si falta, lo que falta más un margen de
12px; y **nunca tanto como para empujar el borde de arriba del calendario fuera de la vista** (un
calendario más alto que el contenedor perdería su principio y el campo que lo abrió). No sube nunca.

**Se scrollea el contenedor, no el documento:** el efecto camina hacia arriba hasta el primer ancestro
con `overflow-y` desplazable *y* con algo que desplazar. En mobile eso es el
`overflow-y-auto px-4 pb-6` del drawer; en desktop el `DialogContent` **no tiene scroll interno**, no
se encuentra contenedor y no pasa nada — que es lo correcto, ahí el calendario entra. Doble `rAF`
antes de medir (el drawer puede seguir animando su altura) y `smooth` salvo `prefers-reduced-motion`.

**Medido en la app real a 390×844 (mobile ⇒ Drawer):**

| | contenedor | calendario |
|---|---|---|
| antes de abrir Fecha | `overflow-y-auto px-4 pb-6` · scrollTop=0 · alto visible 598 (top=246, bottom=844) | no existe |
| al abrirse, antes del scroll | scrollTop=166 | top=651, **bottom=849** ⇒ 5px **debajo** del borde |
| después | **scrollTop=192** (+26px nuestros) | top=625, **bottom=823** ⇒ adentro, con 21px de aire |

`¿el calendario entra entero? true · ¿se ve el principio? true`.

Cero cambio de markup, clases o copy: lo único que se agregó al JSX es una `ref` para poder medir.

---

## Verificación

**`./node_modules/.bin/tsc --noEmit`** (nunca `npx tsc`): **sin una sola línea `error TS`** filtrando
`^\.next/`.

**`npx vitest run`** — los dos carriles, corridos por separado:

| carril | archivos | casos |
|---|---|---|
| `pure` | **70 passed** | **1310 passed · 3 expected fail** |
| `db` | **34 passed** | **306 passed · 1 expected fail · 1 skipped** |
| **total** | **104** | **1616 passed · 4 expected fail · 1 skipped** |

Piso del PLAN: 1602 passed / 103 archivos ⇒ **+14 casos y +1 archivo, cero regresiones**. Los 14 son
míos: 6 de `revealScrollDelta`, 3 de `leaveNavigationPlan`, y 5 en `test/dirty-history.test.ts` (la
aritmética de la pila con `consume-then-replace` y con `consume-then-push`, el camino del atrás que no
cambió, y dos auditorías nuevas del fuente).

⚠ **Los canarios de reloj NO aplican:** las corridas fueron entre las **13:28** y las **15:20** hora
AR, dentro de `[01:00, 23:30]`, y los 4 expected-fail son los mismos de la punta anterior.

⚠ **La corrida COMBINADA (`npx vitest run` de una sola vez) falla por infraestructura, no por
código:** dio 7 archivos / 5 casos fallados y 59 skipped, todos del carril `db` y todos por
**timeouts de los hooks de seed** (`Hook timed out in 10000ms`, `appointments_business_id_fkey`), en
suites de abonos/cron/snapshot que este quick no toca. Es el modo de falla que `test/suite-split.ts`
ya documenta (pool de PostgREST saturado ⇒ teardown que falla en silencio ⇒ contaminación del
siguiente), agravado por el dev server del dueño pegándole al mismo Supabase local. El carril `db`
corrido solo, **con estos cambios aplicados**, dio **34/34 verde**. Queda anotado en
`deferred-items.md`. No se intentó arreglar.

**`./node_modules/.bin/eslint`** sobre los 7 archivos del cambio: **0 problemas**. Aparte sigue el
**único error preexistente**, re-confirmado corriéndolo: `app/(dashboard)/agenda/agenda-client.tsx`
(`react-hooks/purity`, `Date.now()` dentro de un `useMemo`, línea 883) — archivo que no toqué.

**Las dos herramientas de medición** (ambas en el scratchpad de la sesión, cero dependencias nuevas:
`esbuild` ya estaba en `node_modules` y el CDP va por los `fetch`/`WebSocket` globales de Node 24):

1. **Harness** — las funciones **reales** del repo bundleadas y corriendo en Chrome sobre el historial
   de verdad, con la transcripción del provider + el hook + el `<Link>` del sidebar. Sirve para
   comparar el antes y el después sin levantar la app.
2. **Driver end-to-end** — la app real en el puerto 80, login real, clicks reales, atrás de nivel
   navegador y sonda de todas las escrituras de historial. Es el que encontró las tres cosas que el
   harness no podía ver.

El dev server del dueño (puerto 80) **no se mató ni se reinició**; los servidores propios fueron el
**8733** (harness) y los puertos de debug **922x-928x**.

---

## Lo que quedó SIN verificar

- **La UAT del celular (los 4 puntos del PLAN). No se corrió** — es del dueño, y así lo pidió el
  encargo.
- **Safari/iOS y Chrome Android reales.** Todo lo medido es Chrome 153 headless (desktop y con
  viewport de celular emulado). Hereda el blind spot del diagnóstico.
- **El atrás por teclado (Alt+Flecha izquierda).** Headless no enruta la tecla al historial.
- **El timing en producción.** En dev el destino tarda **2,9–4,5s** en escribirse porque Next compila
  `/finances` on-demand; con el build de producción debería ser inmediato, pero no se midió. Lo que
  **sí** está medido es que la navegación ocurre, no cuándo.
- **El `push` del plan `consume-then-push` contra el router real.** El único recorrido medido
  end-to-end es el `replace` (sección→sección). El `push` está cubierto en la suite pura (caso 8b) y
  en el harness, no en la app.
- **Qué pasa si el dueño aprieta el atrás del celular en el mismo instante en que toca "Salir sin
  guardar".** Hay un `popstate` ajeno posible en esa ventana de milisegundos; la guarda "sólo completo
  si sigo en la pantalla que estaba dejando" lo cubre por diseño, pero no se pudo sintetizar el gesto
  doble.
- **El `?google=connected` conviviendo con el centinela.** Sigue como lo dejó el quick anterior: el
  `history.replaceState(null, …)` crudo de `agenda-client.tsx:290` borra cualquier marca de la entrada
  actual, pero corre sólo en el mount y con ese parámetro en la URL.
- **El scroll del calendario con el teclado de software arriba.** Se midió en Chrome con viewport de
  celular, que no simula el teclado.

## Known Stubs

Ninguno. No se dejó ningún valor hardcodeado, ninguna rama sin implementar ni ningún `TODO`.

## Self-Check: PASSED

Verificado en disco, no afirmado: los 7 archivos del cambio + los 2 de documentación existen; los 3
commits (`b4e5088`, `7d862a4`, `bc52a2a`) están en el log; `git diff --name-only 0b89664..HEAD` **no** toca
`lib/overlay-history.ts`, `lib/dirty-history.ts`, `components/ui/drawer.tsx`, `package.json` ni
`supabase/`; y `ls supabase/migrations/*.sql | wc -l` sigue dando **41**.
