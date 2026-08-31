---
phase: quick-260831-kxt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/unsaved-changes.ts
  - lib/unsaved-changes.test.ts
  - components/dashboard/unsaved-changes-guard.tsx
  - app/(dashboard)/layout.tsx
  - components/dashboard/sidebar.tsx
  - app/(dashboard)/agenda/agenda-client.tsx
autonomous: true
requirements: ["UNSAVED-01", "UNSAVED-02"]

must_haves:
  truths:
    - "Con cambios de horarios sin guardar, tocar Turnos / Clientes / Ajustes en el sidebar NO navega: abre un diálogo que dice que hay cambios sin guardar y ofrece seguir editando o salir sin guardar."
    - "Elegir 'Seguir editando' deja al dueño en Agenda con sus cambios intactos y el indicador 'Cambios sin guardar' encendido."
    - "Elegir 'Salir sin guardar' navega a la sección que el dueño había tocado, no a otra ni al dashboard."
    - "Recargar o cerrar la pestaña con cambios sin guardar dispara el prompt nativo del navegador."
    - "Después de guardar con éxito, ni el diálogo ni el prompt nativo aparecen: la señal es la misma que ya apaga el indicador visual."
    - "En cualquier otra pantalla del panel (Turnos, Clientes, Finanzas, Mi web) el sidebar navega igual que siempre: el guard sólo se arma cuando Agenda lo registra, y se desarma al desmontarse."
    - "Estar en Agenda y tocar 'Agenda' en el sidebar no abre el diálogo: navegar a donde ya estás no pierde nada."
    - "El diálogo cierra con Escape y con click afuera, y esas dos salidas equivalen a 'Seguir editando' (la opción segura), nunca a descartar."
    - "Cero dependencias nuevas: el diálogo es el primitivo compartido que el panel ya usa, no un overlay hand-rolled ni el ConfirmDialog del CRM."
  artifacts:
    - path: "lib/unsaved-changes.ts"
      provides: "La decisión pura allow/confirm del guard (bandera sucia + href destino + ruta actual)"
      exports: ["decideNavigation"]
    - path: "lib/unsaved-changes.test.ts"
      provides: "Cobertura de la decisión pura: limpio, sucio, misma ruta, href con query"
    - path: "components/dashboard/unsaved-changes-guard.tsx"
      provides: "Provider + diálogo compartido del panel + los dos hooks (registrar sucio / pedir navegación)"
      exports: ["UnsavedChangesProvider", "useUnsavedChanges", "useNavigationGuard"]
    - path: "components/dashboard/sidebar.tsx"
      provides: "Los Link del sidebar consultan el guard vía onNavigate antes de navegar"
    - path: "app/(dashboard)/agenda/agenda-client.tsx"
      provides: "Agenda registra hoursDirty en el guard, arma su beforeunload y protege su link interno a Servicios"
  key_links:
    - from: "components/dashboard/sidebar.tsx"
      to: "components/dashboard/unsaved-changes-guard.tsx"
      via: "cada <Link> del nav llama requestNavigation en onNavigate y cancela con preventDefault si el guard bloquea"
      pattern: "onNavigate=\\{"
    - from: "app/(dashboard)/agenda/agenda-client.tsx"
      to: "components/dashboard/unsaved-changes-guard.tsx"
      via: "useUnsavedChanges(hoursDirty) sincroniza la bandera sucia del editor de horarios con el guard"
      pattern: "useUnsavedChanges\\(hoursDirty\\)"
    - from: "app/(dashboard)/layout.tsx"
      to: "components/dashboard/unsaved-changes-guard.tsx"
      via: "el provider envuelve Sidebar y main a la vez — es la única forma de que el nav y la página compartan la bandera"
      pattern: "<UnsavedChangesProvider"
    - from: "components/dashboard/unsaved-changes-guard.tsx"
      to: "lib/unsaved-changes.ts"
      via: "requestNavigation delega el qué-decidir en decideNavigation; el componente sólo renderiza el resultado"
      pattern: "decideNavigation\\("
---

<objective>
Avisar antes de perder cambios de horarios sin guardar en **Agenda**, por las dos vías por las que hoy se
pierden: la **navegación interna** del panel (los `<Link>` del sidebar, interceptados con un diálogo propio) y
**cerrar la pestaña / recargar** (`beforeunload` nativo).

Purpose: reportado probando en producción — el dueño cambió "Duración del turno", se fue, y perdió el cambio.
El aviso pasivo que existe ("Cambios sin guardar") no alcanza porque vive a ~160 líneas de JSX del control que
lo enciende: los `Select` están arriba de la tarjeta, el aviso abajo pegado al botón Guardar, con la grilla de
7 días en el medio. En una pantalla real el aviso queda **fuera de la vista**. La fase 19 declaró el bloqueo de
navegación fuera de alcance a propósito; el uso real mostró que hace falta.

Es además **la mitad que `web-client.tsx` dejó afuera**: ese archivo ya implementó `beforeunload` y su comentario
documenta explícitamente que la navegación client-side no queda interceptada porque interceptar la nav del App
Router "es no-trivial". Este plan resuelve esa mitad y la deja en un componente compartido.

Output: `lib/unsaved-changes.ts` + su test, `components/dashboard/unsaved-changes-guard.tsx`, y el cableado en
`app/(dashboard)/layout.tsx`, `components/dashboard/sidebar.tsx` y `app/(dashboard)/agenda/agenda-client.tsx`.
</objective>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/workstreams/motor-reservas/STATE.md
@CLAUDE.md
@AGENTS.md
@.claude/CLAUDE.md
@.claude/skills/convenciones-forjo/SKILL.md

# EL PRECEDENTE EXACTO, ya en producción. Leer la cabecera del archivo (:36-59, en particular el bullet
# "GUARD DE SALIDA" de :52-57) y el efecto de beforeunload (:371-384). El diálogo de descartar (:658-695)
# es el molde de estilo/copy/foco del diálogo nuevo. Este archivo NO se modifica en este plan.
@app/(dashboard)/web/web-client.tsx

# El archivo a modificar. `hoursDirty` (:604) es la señal; `updateHoursConfig` (:563) y los seis mutadores
# de la grilla la prenden; `saveHours` (:811) es el ÚNICO que la apaga. El indicador vive en :1540.
@app/(dashboard)/agenda/agenda-client.tsx

# De acá salen los <Link> a interceptar (nav agrupado + "Ayuda"). Es client component y es el ÚNICO
# consumidor de Sidebar en todo el repo (verificado por grep).
@components/dashboard/sidebar.tsx

# Donde se monta el provider. Ya tiene el precedente de envolver Sidebar + main con un provider client
# (VerticalProvider). El layout es Server Component: los children pasan como prop, eso es legal.
@app/(dashboard)/layout.tsx

# El patrón in-repo de provider + context + hooks, corto y sin ceremonia. Espejarlo.
@lib/use-terminology.tsx

# El primitivo de diálogo del proyecto (base-ui): focus trap / Escape / outside-click / portal ya resueltos.
@components/ui/dialog.tsx
</context>

<hallazgos_de_lectura>
Verificado leyendo el código y las dependencias instaladas antes de escribir este plan. **No repetir esta
investigación durante la ejecución.**

1. **`onNavigate` EXISTE en el `<Link>` del App Router de la versión instalada (16.2.7).** No es memoria:
   - Tipo: `node_modules/next/dist/client/app-dir/link.d.ts:170` → `onNavigate?: OnNavigateEventHandler`, con
     `type OnNavigateEventHandler = (event: { preventDefault: () => void }) => void` (:4-6). El evento **no**
     es un evento de React: su única propiedad es `preventDefault`. No tiene `currentTarget`, ni `href`, ni
     modificadores — el destino hay que pasarlo a mano.
   - Runtime: `node_modules/next/dist/client/app-dir/link.js` lo referencia (7 ocurrencias). No es sólo tipo.
   - Docs de la versión instalada: `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`
     :451-501. La tabla de props de `<AppOnly>` (:79) lo lista. Dice textual: *"The handler receives an event
     object that includes a `preventDefault()` method, allowing you to cancel the navigation if needed"*.
   - Los docs además aclaran tres cosas que juegan **a favor** y que por eso NO hay que compensar a mano:
     `onNavigate` **no** dispara con Ctrl/Cmd+click (abre pestaña nueva ⇒ la página con cambios no se pierde),
     **no** dispara en URLs externas, y **no** dispara con `download`. Un handler de `onClick` sí dispararía en
     los tres casos y habría que filtrarlos.

2. **Alternativas descartadas, con motivo:**
   - `router.events` (Pages Router): **no existe** en el App Router. Ni siquiera es una opción.
   - Interceptar el click en captura sobre `document`: obliga a reimplementar a mano lo que el punto 1 regala
     (modificadores, `target="_blank"`, `download`, externo vs interno) y a re-derivar el `href` del DOM.
     Frágil, y contra el precedente de reusar la API del framework.
   - Envolver `useRouter`: no cubre el click en un `<Link>`, que es **exactamente** el gesto que se pierde
     hoy. Serviría sólo para los `router.push` programáticos, que en el panel son minoría.
   - **Vía elegida: `onNavigate` en cada `<Link>` del sidebar** + el `<Link>` interno de Agenda.

3. **Lo que esta vía NO cubre, y se declara en vez de hackear:** el **botón atrás/adelante del navegador**
   (`popstate`). El App Router de Next 16 no expone ninguna API de bloqueo de navegación para eso, y el hack
   habitual (empujar una entrada falsa al history con `pushState` y revertir en `popstate`) desincroniza el
   historial del router y es exactamente el tipo de improvisación frágil que este plan tiene prohibida. Queda
   **fuera de alcance, documentado en el código** con la misma honestidad con la que `web-client.tsx` documentó
   lo que él dejó afuera. `beforeunload` tampoco cubre atrás (es navegación client-side). Follow-up, no bug
   silencioso.

4. **El provider tiene que envolver al sidebar Y a la página, porque son hermanos.** `Sidebar` se renderiza en
   `app/(dashboard)/layout.tsx:42` y la página entra como `{children}` en `:50`. La bandera sucia nace en la
   página y se consulta en el sidebar ⇒ context en el layout es el único punto en común. El layout ya envuelve
   a los dos con `VerticalProvider` (client) desde un Server Component: el patrón está probado ahí mismo.

5. **`Sidebar` tiene un solo consumidor en todo el repo** (`grep -rn "dashboard/sidebar"` → sólo
   `app/(dashboard)/layout.tsx:4`). No hay ninguna otra superficie donde el hook del guard quede sin provider.
   Aun así el context lleva **default no-op** (`() => false`), así que sin provider nunca bloquea: el mismo
   criterio de `use-terminology.tsx`, que define un `DEFAULT` "para que los consumidores fuera del provider
   sigan funcionando".

6. **Superficies de navegación reales del panel, enumeradas** (no asumidas):
   - Sidebar: los `<Link>` del nav agrupado (`sidebar.tsx:139-152`) y el `<Link>` de "Ayuda" (`:176-184`).
   - Sidebar: `<a target="_blank">` de "Ver mi página" (`:159-167`) y el de forjo.studio (`:203-209`) → abren
     pestaña nueva, **no se toca ninguno de los dos**: no pierden la página.
   - Sidebar: botón "Cerrar sesión" (`:185-192`) → `handleLogout` es `signOut()` + `router.push('/login')`.
     **Sí se cubre**, pero NO se puede cubrir empujando un href: si el guard hiciera `router.push('/login')`
     sin desloguear, el proxy rebota al dashboard. Por eso `requestNavigation` acepta un **callback de
     continuación opcional**; el logout pasa el suyo.
   - Agenda: `<Link href="/servicios">Ir a Servicios</Link>` (`agenda-client.tsx:1422`) — dentro de la MISMA
     card de horarios, visible sólo cuando el catálogo está vacío. **Se cubre**: es el único `<Link>` del
     archivo (grep confirmado).
   - `mp-connection-banner.tsx` usa `<a>` crudo a propósito (comentado en `:25`), no `<Link>` ⇒ es navegación
     de documento y la cubre `beforeunload`.

7. **Trap 1 resuelto: NO se reusa `components/crm/confirm-dialog.tsx`.** Ese componente exige `risk`, renderiza
   `RiskBadge`, y resuelve su superficie de peligro con `useShellScope()` + `--danger` — toda la maquinaria que
   su propio docblock (`:220-226`) explica que existe porque `--crm-danger` no vive fuera de `.crm-shell`.
   Traerlo al panel para preguntar "¿salís sin guardar?" arrastra el vocabulario del super-admin a una pantalla
   del dueño. **Se usa el mismo molde que el panel ya tiene en producción para esta misma decisión**: el diálogo
   de descartar de `web-client.tsx:658-695` — `Dialog` de `@/components/ui/dialog` (base-ui: focus trap,
   Escape, outside-click y portal ya resueltos, según el propio comentario de `confirm-dialog.tsx:10-11`), con
   `variant="destructive"` en el botón de descartar. Ese variant es `bg-destructive/10 text-destructive`
   (`components/ui/button.tsx:18-19`), o sea la superficie suave que **cada tema redeclara** — que `themes.css`
   pise `--destructive` por tema es justamente lo que lo hace correcto acá, y es lo que ya se ve en `/web`.

8. **Trap 3 (no romper el guardado), verificado:** `saveHours` apaga `hoursDirty` y termina con `router.refresh()`
   — `refresh()` **no** es un `<Link>` y **no** pasa por `onNavigate`, así que el guard no lo puede bloquear ni
   por accidente. Y el guard se arma desde la MISMA bandera que apaga el guardado: guardado exitoso ⇒ bandera
   apagada ⇒ ni diálogo ni prompt nativo.

9. **Trap 4 (falsos positivos), aceptado y documentado, NO corregido:** `hoursDirty` es *estado sucio por gesto*,
   no por diff contra el estado inicial. Prender un chip y volver a apagarlo la deja en `true`. Consecuencia:
   **el diálogo va a aparecer aunque el estado final sea idéntico al inicial.** Es el comportamiento existente
   desde la fase 19 (el indicador ya se comporta así) y este plan **no lo cambia**: comparar contra un baseline
   es alcance nuevo. Se escribe en el comentario del código para que no sorprenda.

10. **Infra de tests:** `vitest.config.mts` corre con `environment: 'node'` y **no hay jsdom ni testing-library
    instalados** ⇒ no se puede testear el componente renderizado. Por eso la decisión del guard se extrae a una
    **función pura en `lib/`** (el patrón vivo del repo: `computeConfirmState` / `buildSubmitGuard` en el
    ConfirmDialog del CRM, `agenda-hours-payload.ts` en Agenda). Los `lib/*.test.ts` co-ubicados caen
    automáticamente en el proyecto `pure` del split (todo lo que no esté marcado como DB-backed).

11. **Baselines medidos, de los que dependen los gates:** `eslint` sobre `agenda-client.tsx` da hoy
    **exactamente** `1 problem (1 error, 0 warnings)` — el `react-hooks/purity` de `Date.now()` en la vista
    semanal (D-13, **fuera de alcance por constraint**). El gate es "cero hallazgos NUEVOS", no "cero
    hallazgos". `npm test` (`vitest run`) corre verde de punta a punta.
</hallazgos_de_lectura>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: La decisión del guard, como función pura testeada</name>
  <files>lib/unsaved-changes.ts, lib/unsaved-changes.test.ts</files>
  <behavior>
    - Sin cambios pendientes → permite navegar (jamás molesta).
    - Con cambios pendientes y destino distinto → pide confirmación.
    - Con cambios pendientes pero el destino es la ruta actual → permite: navegar a donde ya estás no pierde nada
      (el sidebar marca la sección activa y sigue siendo clickeable).
    - La comparación con la ruta actual usa sólo la parte de ruta del destino: un href con query o hash sigue
      contando como la misma ruta.
    - Href externo o vacío no es asunto de esta función: recibe lo que le pasan y decide con las reglas de arriba.
  </behavior>
  <action>
Crear `lib/unsaved-changes.ts` con **una** función pura exportada y su tipo de resultado:

    export type NavDecision = 'allow' | 'confirm'
    export function decideNavigation(input: { dirty: boolean; href: string; currentPath: string }): NavDecision

Reglas, en este orden: (1) sin cambios pendientes ⇒ `'allow'`; (2) el destino resuelto a su parte de ruta es
igual a `currentPath` ⇒ `'allow'`; (3) el resto ⇒ `'confirm'`. Para (2), quedarse con lo que hay antes del
primer `?` o `#` del href.

Docblock corto explicando **por qué existe el módulo**: el runner corre en `environment: 'node'` sin jsdom, así
que el único pedazo del guard que se puede cubrir con un test automatizado es la decisión; el resto es render.
Es el mismo criterio que el repo ya aplica en el ConfirmDialog del CRM y en `agenda-hours-payload.ts` — la
fuente de verdad del "qué se decide" vive en un helper puro y el componente sólo la renderiza.

**Sin dependencias, sin imports de React, sin tocar `window`.** El módulo es agnóstico del framework a propósito:
así lo puede llamar tanto el provider como cualquier test.

Crear `lib/unsaved-changes.test.ts` (co-ubicado, cae solo en el proyecto `pure`) con un caso por viñeta de
`<behavior>`, escrito ANTES de que el archivo pase: limpio + destino distinto, sucio + destino distinto, sucio +
misma ruta, sucio + misma ruta con query, sucio + misma ruta con hash, limpio + misma ruta.
  </action>
  <verify>
    <automated>export PATH="/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:/c/Program Files/Git/cmd:$PATH"; cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint lib/unsaved-changes.ts lib/unsaved-changes.test.ts && ./node_modules/.bin/vitest run lib/unsaved-changes.test.ts 2>&1 | tail -8 && [ "$(grep -cE '^export function decideNavigation' lib/unsaved-changes.ts)" = "1" ] && echo GATE_OK</automated>
  </verify>
  <done>
`lib/unsaved-changes.ts` exporta `decideNavigation` y nada más. Su test corre verde con al menos 6 casos, cubre
las tres reglas y las dos variantes de href con query/hash. `tsc` limpio con el binario local. `eslint` sobre
los dos archivos nuevos sale 0 sin imprimir nada.
  </done>
</task>

<task type="auto">
  <name>Task 2: El guard compartido del panel — provider, diálogo y los Link del sidebar</name>
  <files>components/dashboard/unsaved-changes-guard.tsx, app/(dashboard)/layout.tsx, components/dashboard/sidebar.tsx</files>
  <action>
**Parte A — `components/dashboard/unsaved-changes-guard.tsx` (nuevo, `'use client'`).**

Espejar la forma de `lib/use-terminology.tsx`: context + provider + hooks, corto, sin ceremonia. Exporta tres
cosas:

1. `UnsavedChangesProvider({ children })`. Estado interno:
   - Un **ref** con la bandera sucia (no `useState`). Motivo, escribirlo en el código: el provider envuelve al
     sidebar Y a la página entera; si la bandera fuera estado, cada encendido/apagado re-renderizaría todo el
     panel para nada. El ref se lee en el momento del click, así que siempre está fresco.
   - Un `useState` con la navegación pendiente: `null`, o un objeto con el destino y su continuación.
   - `usePathname()` para la ruta actual y `useRouter()` para navegar al confirmar.
2. `useUnsavedChanges(dirty: boolean)` — lo llama la PÁGINA. Un `useEffect` que sincroniza la bandera del
   provider con el argumento y que **en su cleanup la apaga**. El cleanup no es un detalle: es lo que garantiza
   que al desmontarse Agenda el panel entero vuelva a navegar sin fricción (y lo que evita que una bandera
   quede prendida para siempre después de salir).
3. `useNavigationGuard()` — lo llama el NAV. Devuelve `requestNavigation(href: string, proceed?: () => void)`
   que **devuelve `true` si bloqueó** y `false` si se puede navegar. El `qué decidir` NO se reimplementa acá:
   se delega en `decideNavigation` de la Task 1, pasándole la bandera del ref, el href y `usePathname()`. Si
   decide confirmar, guarda la navegación pendiente (destino + `proceed`) y devuelve `true`.

   **Por qué `proceed` y no sólo el href** (comentarlo): el logout no es un `push` — es desloguear y después
   navegar. Un guard que sólo empujara `/login` dejaría la sesión viva y el proxy rebotaría al dashboard. Con
   la continuación, cada call-site declara qué significa "seguir" para él. Sin `proceed`, el default es
   `router.push(destino)` (**nunca `redirect()`** — el precedente del CRM: `redirect()` lanza `NEXT_REDIRECT` y
   dispara un toast espurio).

   Context **default no-op**: `requestNavigation` devuelve `false` fuera del provider ⇒ sin provider nunca
   bloquea. Mismo criterio que el `DEFAULT` de `use-terminology.tsx`.

   El diálogo lo renderiza el **provider**, no cada página: es lo que permite que el sidebar (hermano de la
   página) dispare el aviso sin conocer nada del editor de horarios.

4. El **diálogo**, con el molde de `web-client.tsx:658-695` (leerlo antes de escribirlo):
   - `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter` de
     `@/components/ui/dialog`. **Nada de `components/crm/confirm-dialog.tsx`** ni de un overlay propio: el
     primitivo compartido ya trae focus trap, Escape, outside-click y portal (ver el hallazgo 7).
   - `open` = hay navegación pendiente. `onOpenChange` a `false` (Escape / click afuera / botón ×) **cancela**:
     equivale a "Seguir editando", que es la opción segura. Escribir eso en un comentario — que la salida por
     descarte del modal NO sea la destructiva es una decisión, no una casualidad.
   - Título: `¿Salir sin guardar?`. Descripción: que hay cambios en los horarios que todavía no se guardaron y
     que si sale ahora se pierden. Copy en español rioplatense, tuteo con vos, como el resto del panel.
   - Footer: botón `variant="ghost"` con `autoFocus` para **Seguir editando** (el foco arranca en la opción
     segura, igual que el diálogo de descartar de `/web`) y botón `variant="destructive"` para **Salir sin
     guardar**. Los dos con `min-h-11` (touch target ≥44px, mismo valor que el precedente).
   - Al confirmar: **apagar la bandera del ref ANTES** de ejecutar la continuación (si no, el push podría
     volver a pasar por el guard), limpiar la navegación pendiente, y recién ahí ejecutar.
   - Sin animación propia: la que trae `DialogContent` es la misma que ya usan todos los modales del panel.

5. **Docblock de cabecera del archivo**, en el estilo denso de `web-client.tsx`. Tiene que decir, sí o sí:
   - Que esto es **la mitad que el guard de `/web` dejó explícitamente afuera** (`beforeunload` no dispara en
     las navegaciones client-side de Next), y que ahora se resuelve con `onNavigate` del `<Link>` del App
     Router — **con la referencia a la versión instalada** (`link.d.ts:170`, tipo `{ preventDefault }`), no de
     memoria.
   - Que el **botón atrás/adelante del navegador NO está interceptado** y por qué: el App Router no expone API
     de bloqueo de navegación, y el truco de empujar una entrada falsa al history desincroniza el historial del
     router. Es un ítem diferido **a propósito**, no un olvido.
   - Que `onNavigate` no dispara con Ctrl/Cmd+click, en externos ni con `download`, y que eso es correcto: en
     esos tres casos la página con cambios **no se pierde**.
   - Que en mobile el drawer del sidebar se cierra en el `onClick` del link, o sea **antes** de que este guard
     cancele la navegación: el diálogo aparece con el drawer ya cerrado. Aceptado.
   - Que el guard sólo se arma cuando una página llama `useUnsavedChanges`; hoy **sólo Agenda** lo hace, y
     extenderlo a otras pantallas es una decisión aparte.

**Parte B — `app/(dashboard)/layout.tsx`.** Envolver el `<div className="min-h-screen">` (el que contiene
`<Sidebar>` y `<main>`) con `<UnsavedChangesProvider>`, **dentro** de `VerticalProvider` y después de
`<PaletteScript>`. No mover ni tocar nada más del layout: ni la sesión, ni el guard de suspendido, ni los
banners. Un provider client envolviendo children renderizados en el server es legal y ya es el patrón del
archivo.

**Parte C — `components/dashboard/sidebar.tsx`.** Obtener `requestNavigation` con `useNavigationGuard()` dentro
del componente `Sidebar` (junto a `usePathname` / `useRouter`, no dentro de `buildNavGroups`, que es una función
pura fuera del componente), y agregar en cada `<Link>` que navega dentro del panel:

    onNavigate={(e) => { if (requestNavigation(<destino>)) e.preventDefault() }}

Los `<Link>` a cubrir son **dos sitios**: los del nav agrupado (`:139`, destino `item.href`) y el de "Ayuda"
(`:176`, destino `/ayuda`). **NO tocar** los dos `<a target="_blank">` ("Ver mi página" y forjo.studio): abren
pestaña nueva y no pierden la página.

El botón "Cerrar sesión" pasa por el guard con su propia continuación: en su `onClick`, pedirle al guard el
permiso para ir a `/login` **pasándole `handleLogout` como continuación**; si el guard bloquea, no hacer nada
más (el diálogo se encarga). Si no bloquea, ejecutar `handleLogout` como hoy. **No** convertir el `onClick`
existente en un `push` pelado: la continuación tiene que seguir siendo desloguear-y-después-navegar.

`onClick` (cerrar el drawer mobile) y `aria-current` de los links **no se tocan**.
  </action>
  <verify>
    <automated>export PATH="/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:/c/Program Files/Git/cmd:$PATH"; cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && G="components/dashboard/unsaved-changes-guard.tsx" && S="components/dashboard/sidebar.tsx" && L="app/(dashboard)/layout.tsx" && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint "$G" "$S" "$L" && [ "$(grep -cE '^\s*import .*crm/confirm-dialog' "$G")" = "0" ] && [ "$(grep -cE "^\s*import .*from '@/components/ui/dialog'" "$G")" = "1" ] && [ "$(grep -cE 'decideNavigation\(' "$G")" -ge 1 ] && [ "$(grep -cE 'export function UnsavedChangesProvider' "$G")" = "1" ] && [ "$(grep -cE 'export function useUnsavedChanges' "$G")" = "1" ] && [ "$(grep -cE 'export function useNavigationGuard' "$G")" = "1" ] && [ "$(grep -cE 'onNavigate=\{' "$S")" -ge 2 ] && [ "$(grep -cE '<UnsavedChangesProvider' "$L")" -ge 1 ] && [ "$(grep -cE '^import .*unsaved-changes-guard' "$L")" = "1" ] && npm test 2>&1 | tail -5 && echo GATE_OK</automated>
  </verify>
  <done>
Existe el provider con sus dos hooks y el diálogo armado sobre `@/components/ui/dialog`; no importa el
ConfirmDialog del CRM por ningún lado. El layout lo monta envolviendo sidebar + main. Los dos sitios de `<Link>`
del sidebar consultan el guard vía `onNavigate` y el logout pasa su propia continuación. `tsc` limpio, `eslint`
sobre los tres archivos sale 0 sin imprimir nada, suite verde.
  </done>
</task>

<task type="auto">
  <name>Task 3: Agenda registra su estado sucio y arma el beforeunload</name>
  <files>app/(dashboard)/agenda/agenda-client.tsx</files>
  <action>
Tres cambios, todos dentro del componente de Agenda. **Ninguno toca la lógica de guardado, ni el payload, ni el
RPC, ni la grilla, ni el indicador visual existente.**

**1 — Registrar el estado sucio en el guard.** Después de la declaración de `hoursDirty` (`:604`), una sola
línea: `useUnsavedChanges(hoursDirty)`, importando el hook desde `@/components/dashboard/unsaved-changes-guard`.
Nada más: la sincronización y el apagado al desmontar viven adentro del hook.

**2 — `beforeunload`, espejando el molde de `web-client.tsx:371-384`.** Un `useEffect` con dependencia en
`hoursDirty` que registra un listener sobre `window`: si no hay cambios pendientes, sale sin hacer nada; si los
hay, `e.preventDefault()` y setear `returnValue` a la cadena vacía (los navegadores muestran su propio texto —
no se puede personalizar, y está bien). Devolver la baja del listener en el cleanup. Mismo orden, misma forma y
mismo estilo de comentario que el precedente.

**3 — El `<Link href="/servicios">` de la card de horarios (`:1422`).** Pasa por el guard con `onNavigate`, igual
que los del sidebar: `useNavigationGuard()` arriba en el componente, y en el link
`onNavigate={(e) => { if (requestNavigation('/servicios')) e.preventDefault() }}`. Es el único `<Link>` del
archivo y vive **dentro de la misma tarjeta** cuyos cambios se están protegiendo.

**Comentario a agregar** (bloque corto, arriba del efecto de `beforeunload`), en el estilo del archivo. Tiene que
decir tres cosas:
  - Que el aviso pasivo que ya existe no alcanza y **por qué**: el indicador vive a ~160 líneas de JSX del
    control que lo enciende (los `Select` arriba de la tarjeta, el aviso abajo pegado al botón Guardar, la
    grilla de 7 días en el medio) ⇒ en una pantalla real queda fuera de la vista. Lo reportó el dueño perdiendo
    un cambio en producción.
  - Que la bandera es **estado sucio por gesto, no por diff**: prender un chip y volver a apagarlo la deja
    encendida, así que el diálogo puede aparecer aunque el estado final sea idéntico al inicial. Es el
    comportamiento que ya tenía el indicador desde la fase 19 y **no se cambia acá**; comparar contra un
    baseline sería alcance nuevo.
  - Que la navegación interna la cubre el guard compartido y el atrás del navegador **no** (remitir al docblock
    del componente del guard, sin repetir el argumento entero).

**Prohibido en esta tarea:** tocar `saveHours`, `updateHoursConfig`, los seis mutadores de la grilla, el
`<span role="status">` del indicador, o cualquier archivo de
`.planning/workstreams/motor-reservas/phases/19-el-panel/` (la fase 19 está CERRADA, UAT 3/3 verificada en
producción el 2026-08-31).
  </action>
  <verify>
    <automated>export PATH="/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:/c/Program Files/Git/cmd:$PATH"; cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && F="app/(dashboard)/agenda/agenda-client.tsx" && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint "$F" 2>&1 | grep -q '1 problem (1 error, 0 warnings)' && [ "$(grep -cE '^\s*useUnsavedChanges\(hoursDirty\)' "$F")" = "1" ] && [ "$(grep -cE "addEventListener\('beforeunload'" "$F")" -ge 1 ] && [ "$(grep -cE "removeEventListener\('beforeunload'" "$F")" -ge 1 ] && [ "$(grep -cE 'onNavigate=\{' "$F")" -ge 1 ] && [ "$(grep -cF "hoursDirty ? 'Cambios sin guardar' : ''" "$F")" = "1" ] && [ -z "$(git status --porcelain .planning/workstreams/motor-reservas/phases/19-el-panel/)" ] && npm test 2>&1 | tail -5 && echo GATE_OK</automated>
    <human-check>
**NO es automatizable y NO es un `checkpoint:human-verify`.** Va como `human-check` a propósito: un checkpoint
sería auto-aprobado por `auto_advance: true` sin que nadie abra el navegador (trampa ya documentada del
proyecto). Como `human-check`, el ejecutor **no lo ejecuta ni lo aprueba**: lo deja registrado como PENDIENTE en
el SUMMARY. Lo hace una persona.

Con `npm run dev` y sesión de dueño, en **Agenda**:

*Vía (a) — navegación interna:*
1. Cambiar **Duración del turno** (el `Select` de arriba de la tarjeta). Verificar que abajo aparece "Cambios
   sin guardar".
2. Tocar **Turnos** (o Clientes, o Configuración) en el sidebar. **Tiene que abrirse el diálogo** y la pantalla
   tiene que seguir siendo Agenda.
3. Elegir **Seguir editando** → sigue en Agenda, el `Select` conserva el valor cambiado y el indicador sigue
   encendido.
4. Repetir y elegir **Salir sin guardar** → navega **a la sección que se tocó**, no a otra.
5. Volver a Agenda, tocar un chip de servicio de una franja, y tocar **Agenda** en el sidebar (la sección
   activa): **no** tiene que abrirse el diálogo.
6. Cambiar algo, apretar **Guardar horarios**, esperar el toast de éxito y recién ahí tocar otra sección:
   **no** tiene que aparecer el diálogo.
7. Con el diálogo abierto: **Escape** lo cierra sin navegar, y un click **afuera** también. Ninguna de las dos
   descarta los cambios.
8. En **375px** (drawer mobile): abrir el menú, tocar una sección con cambios pendientes. El drawer se cierra y
   el diálogo aparece encima del panel — comportamiento esperado. Los dos botones del diálogo tienen que
   medir al menos 44px de alto y ser cómodos de tocar.
9. Tabular dentro del diálogo: el foco arranca en **Seguir editando** y no se escapa del modal.
10. En una pantalla SIN cambios pendientes (ej. Clientes, o Agenda recién cargada), navegar por todo el
    sidebar: **nada** tiene que cambiar respecto de hoy.

*Vía (b) — cerrar pestaña / recargar:*
11. Con cambios pendientes, apretar **F5** → tiene que aparecer el prompt nativo del navegador (texto genérico,
    no personalizable). Cancelar deja la pantalla intacta.
12. Después de guardar con éxito, **F5** → **no** tiene que aparecer ningún prompt.

*Límite conocido (verificar que es lo que se documentó, no que funciona):*
13. Con cambios pendientes, apretar el **botón atrás del navegador**: navega **sin** avisar. Es el ítem
    declarado fuera de alcance en el docblock del guard.

*No-regresión de `/web`:*
14. Ir a **Mi web**, tocar algo del editor y apretar F5: el prompt nativo de esa pantalla tiene que seguir
    apareciendo igual que antes (su guard es propio y no se tocó).
    </human-check>
  </verify>
  <done>
Agenda registra `hoursDirty` en el guard con una sola línea, tiene su `beforeunload` con alta y baja del
listener, y su `<Link>` interno a Servicios pasa por el guard. El indicador visual existente quedó intacto (la
expresión condicional del texto sigue apareciendo una sola vez). `tsc` limpio, `eslint` sobre el archivo sigue
en `1 problem (1 error, 0 warnings)` — cero hallazgos nuevos. La fase 19 sin cambios en `git status`. Suite
verde. El `human-check` queda registrado como **PENDIENTE**, no aprobado.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dueño autenticado → navegación del panel (client-side) | El único cruce del plan. Todo el cambio vive en componentes cliente detrás de la sesión del dueño. |
| dueño autenticado → sesión (botón Cerrar sesión) | El logout pasa a ejecutarse a través de una continuación del guard. La secuencia `signOut()` → `push('/login')` **no cambia**; lo único que cambia es cuándo se dispara. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-kxt-01 | Repudiation | Guard de salida de Agenda | mitigate | Es la razón de la tarea: hoy el panel descarta cambios de configuración sin avisar y el dueño no puede distinguir "no guardé" de "se guardó mal". Se cierra con el diálogo sobre la navegación interna + `beforeunload` sobre recarga/cierre, los dos atados a la MISMA bandera que apaga el guardado. |
| T-kxt-02 | Elevation of Privilege | Botón "Cerrar sesión" del sidebar | mitigate | Un guard ingenuo cerraría el diálogo empujando `/login` **sin** desloguear: la sesión quedaría viva y el proxy rebotaría al dashboard, dando la falsa impresión de haber cerrado sesión. Por eso `requestNavigation` acepta una continuación y el logout pasa `handleLogout` completo (`signOut()` primero). Gate: el `onClick` del botón conserva su handler. |
| T-kxt-03 | Denial of Service | Bandera sucia registrada en el provider | mitigate | Una bandera que quedara prendida después de salir de Agenda bloquearía la navegación del panel entero para siempre. Se cierra con el cleanup del `useEffect` del hook, que la apaga al desmontar, y con el apagado explícito antes de ejecutar la continuación al confirmar. |
| T-kxt-04 | Tampering | `saveHours` / RPC `save_agenda_blocks` | accept | No se tocan: ni el payload, ni la firma, ni el manejo de error, ni el `router.refresh()` final (que además no pasa por `onNavigate`, así que el guard no lo puede interferir). Superficie sin cambios. |
| T-kxt-05 | Information Disclosure | Diálogo del guard | accept | Su contenido es copy fija: no interpola nombres de negocio, ni ids, ni horarios, ni datos de clientes. Superficie nula. |
| T-kxt-06 | Spoofing | — | accept | No se toca autenticación, RLS, `business_id`, ninguna query ni ninguna ruta pública. Todo el plan es navegación client-side del dashboard. |

Sin instalaciones de paquetes (npm/pip/cargo) en este plan: no aplica el gate de legitimidad ni el checkpoint bloqueante.
</threat_model>

<verification>
1. `./node_modules/.bin/tsc --noEmit` sale 0. **Usar el binario local**: `npx tsc` es falso verde en este repo.
2. `eslint` acotado a los archivos tocados (el completo no puede dar exit 0 y se corta a los 2 min). Gate =
   **cero hallazgos NUEVOS**: los cinco archivos nuevos/de chrome salen 0 sin imprimir nada, y
   `agenda-client.tsx` se queda en su `1 problem (1 error, 0 warnings)` preexistente (D-13, fuera de alcance).
3. `npm test` verde (`vitest run`, proyectos `pure` + `db`), con el test nuevo de `decideNavigation` adentro.
4. `git status --porcelain` limpio sobre `.planning/workstreams/motor-reservas/phases/19-el-panel/`.
5. Los gates de grep de cada tarea, todos con exit 0.
6. La verificación **real** es visual, en navegador, por las dos vías: el `human-check` de la Task 3, que queda
   PENDIENTE en el SUMMARY y lo ejecuta una persona.

Todos los comandos arrancan con
`export PATH="/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:/c/Program Files/Git/cmd:$PATH"` — el shell
Bash recibe el PATH de Windows sin convertir.
</verification>

<success_criteria>
- Con cambios de horarios sin guardar, los `<Link>` del sidebar y el link interno a Servicios abren el diálogo
  en vez de navegar; recargar o cerrar la pestaña dispara el prompt nativo.
- "Seguir editando" deja todo intacto; "Salir sin guardar" navega al destino que el dueño había tocado.
- Guardado exitoso ⇒ ni diálogo ni prompt. Navegar a la sección donde ya estás ⇒ ni diálogo.
- El resto del panel navega exactamente como antes, y el guard de `/web` sigue funcionando como antes.
- Cero dependencias nuevas; el diálogo es `@/components/ui/dialog`, no el ConfirmDialog del CRM ni un overlay
  propio.
- El límite conocido (botón atrás del navegador) queda **escrito en el código**, no descubierto por el próximo
  que lea.
</success_criteria>

<follow_ups>
Anotar en el SUMMARY, **no** hacer en esta tarea:
- **Botón atrás/adelante del navegador**: sigue sin avisar. Requiere una vía de bloqueo de navegación que el App
  Router de Next 16 no expone hoy; el workaround de `history.pushState` desincroniza el router. Revisar cuando
  Next publique una API para esto.
- **Extender el guard a otras pantallas**: `/web` (que hoy tiene sólo su `beforeunload` propio y su comentario
  dice que le falta justo esta mitad), `/servicios`, `/negocio` y `/settings` son candidatas obvias — ahora es
  una línea por pantalla. Excluido por constraint de alcance.
- **Estado sucio por diff en vez de por gesto**: hoy prender y apagar un chip deja la bandera encendida y el
  diálogo aparece aunque el estado final sea idéntico al inicial. Cambiarlo es alcance nuevo (hay que comparar
  contra un baseline de `dayStates` + `hoursConfig`).
</follow_ups>

<output>
Create `.planning/quick/260831-kxt-avisar-antes-de-perder-cambios-sin-guard/260831-kxt-SUMMARY.md` when done
</output>
