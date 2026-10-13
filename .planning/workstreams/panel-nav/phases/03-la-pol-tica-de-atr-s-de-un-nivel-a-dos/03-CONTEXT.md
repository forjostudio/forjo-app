# Phase 3: La política de atrás, de un nivel a dos - Context

**Gathered:** 2026-10-13
**Status:** Ready for planning

<domain>
## Phase Boundary

El atrás del celular pasa de **un** nivel a **dos**: desde una sección abierta por Más vuelve a
**Más**, desde Más vuelve a **Inicio**, y desde una sección de la barra vuelve derecho a **Inicio**.
Sin romper nada de lo que el dueño ya verificó en celular —overlays, selectores, calendario, teclado
y el aviso de cambios sin guardar— y resolviendo MOB-05 con una decisión escrita en vez de una
suposición.

**Requisitos:** MOB-04, MOB-05, MOB-06.

**No entra:** rediseñar la barra o Más (su forma la fijó la Phase 2) · los tabs (Phase 4) · PWA /
`manifest` · forzar que el atrás no cruce de sección cuando se entró **directo** a una ruta (caso ya
aceptado y documentado en v0.30) · extender `useUnsavedChanges` a pantallas nuevas · migraciones
(cero; la próxima libre sigue siendo la **080**).
</domain>

<decisions>
## Implementation Decisions

### MOB-05 — la guarda de salida en Inicio

- **D-01: MOB-05 SE IMPLEMENTA**, con el aviso efímero. El primer atrás en Inicio no sale y avisa;
  el segundo sale. — **Reversibility:** reversible — es un comportamiento acotado al nodo raíz del
  panel; quitarlo es borrar la absorción del primer `popstate` y su aviso, sin tocar la política de
  dos niveles ni las otras dos marcas de historial.
  - El dueño eligió esto sabiendo el costo medido: **dos toques de atrás siempre** para salir del
    panel desde Inicio, y que la condición que lo haría natural —una app instalada— **no existe**
    (cero `manifest`, cero usos de `display-mode`).
  - ⚠ **Su forma NO se discute acá: ya está cerrada por el UI-SPEC de la Phase 2 (§13 y O-3).** No
    es un toast de `sonner` —eso se descartó midiendo que el `<Toaster>` es `top-center` y global, o
    sea lejos del pulgar y sin poder moverse sin afectar al landing y a `/[slug]`—: es un **elemento
    propio del componente de la barra**, anclado 8px arriba de ella. Copy, ancho medido en las 5
    familias, superficie, radio, tipografía, capa, interactividad, a11y y movimiento están todos
    especificados ahí. El planner **lee §13 y lo implementa tal cual**; no reabre nada.
  - ⚠ **La regla que la Phase 3 tiene que respetar, del propio §13:** la **duración visible** del
    aviso y la **ventana lógica** en la que el segundo atrás sale son el **MISMO valor**, exportado
    desde **un solo lugar** (constante única, `PANEL_EXIT_HINT_MS = 2000`). Dos constantes distintas
    producen el bug invisible de "esperé y el segundo atrás no salió" (o al revés).

### La forma de los dos niveles

- **D-02: Más se APILA sobre lo que haya abierto.** `Inicio → Turnos → Más → atrás` cae en
  **Turnos**, no en Inicio. — **Reversibility:** costly — invierte la regla de push-vs-replace para
  `/mas` y cambia los recorridos que la UAT verifique; deshacerlo después obliga a repetir la UAT en
  celular entera, que es el único criterio que vale en esta fase.
  - Motivo: el atrás deshace el último movimiento, que es el único invariante que nadie encuentra
    sorprendente. Si el dueño abrió Más de un toque reflejo, el atrás lo devuelve a donde estaba.
  - ⚠ **Consecuencia que hay que escribir en el requisito, no esconder:** en ese recorrido la pila
    tiene **tres** escalones (`Inicio → Turnos → Más`). "Dos niveles" es la profundidad de **Más y
    sus secciones**, **no un techo de la pila**. El texto de MOB-04 y el criterio 1 del ROADMAP
    dicen "desde Más vuelve a Inicio" sin aclarar este caso: **el planner tiene que precisar esa
    frase**, no contradecirla en silencio.

- **D-03: tocar Más estando DENTRO de su rama SUBE un nivel, no apila.** Desde Finanzas (abierta por
  Más), tocar Más devuelve a Más. Pila final `Inicio → Más → Configuración`; salir siempre cuesta lo
  mismo sin importar por cuántas secciones de Más se pasó. — **Reversibility:** reversible — es una
  rama más de la decisión pura; su alternativa (apilar siempre) no pierde datos, sólo alarga la pila.
  - Motivo: es el gesto **más común** del modelo nuevo (así se pasa de una sección de Más a otra).
    Apilando, recorrer tres secciones deja seis entradas y salir obliga a desandar pantallas ya
    dejadas.
  - **No inventa un concepto nuevo:** es la misma regla que el repo ya aplica desde v0.30 cuando se
    toca el destino en el que ya se está (NAV-08, `consumeOwnedPanelEntry`). El planner debería
    reusar ese molde antes que crear una marca de historial nueva.
  - ⚠ **No confundir con `replace`:** subir a Más **no** puede implementarse reemplazando la entrada
    de la sección por `/mas`, porque dejaría `/mas` encima de `/mas` ⇒ dos entradas idénticas ⇒ atrás
    muerto. Es la cicatriz 1 que los tres módulos documentan.

### La superficie visible

- **D-04: la fase NO agrega ningún affordance visible.** No se ilumina Más en la barra cuando se está
  en una sección de su rama, no hay "volver a Más" en el header, no hay breadcrumb. — **Reversibility:**
  reversible — agregarlo después es aditivo y no toca la política.
  - Motivo doble: **(1)** las tres alternativas reabren el gate de diseño y obligan a pasar por
    `/gsd-ui-phase` antes de codear, cosa que el ROADMAP ya anticipaba; **(2)** y la de método, que
    pesa más: ésta es **la fase más riesgosa del milestone** —redefine una regla ya verificada en
    celular real, con tres módulos escribiendo en la misma pila—. Si además cambia algo visible, la
    UAT tiene que separar *"¿la política funciona?"* de *"¿el indicador nuevo ayuda?"*, y eso ensucia
    justo la verificación que más importa.
  - **El riesgo queda declarado, no negado:** dos pantallas que se ven igual se comportan distinto
    (en Turnos el atrás cae en Inicio; en Finanzas cae en Más) y nada en pantalla lo dice. **Es un
    ítem explícito de la UAT**: si el dueño se pierde, es un hallazgo con evidencia y se agrega
    después sabiendo que hacía falta. Ver `<deferred>`.

### Claude's Discretion

El dueño no delegó ninguna de las cuatro áreas. Lo que **sí** queda a criterio del planner, porque es
técnico y el ROADMAP ya lo enmarcó:

- **Cómo** se expresan los dos niveles: rama nueva sobre rutas en `panelNavMode` vs. marca en
  `history.state`. El ROADMAP dejó los tres caminos y **el criterio 2 los arbitra**. ⚠ El camino
  (iii) —Más como hoja de `overlay-history`— **ya está descartado**: la Phase 2 hizo de Más una
  **ruta** (`/mas`).
  ⚠ Si se elige la marca en `history.state`, rige **H-4**: la marca **sobrevive al atrás pero la
  borra la siguiente navegación blanda**, así que hay que **re-verificarla en el punto de uso**.
- El orden de evaluación y cómo colapsar la pila al volver a un destino de la barra (criterio 2).
- La forma de los tests puros nuevos sobre la política, en el molde que `lib/panel-history.ts` ya
  documenta (`environment: 'node'`, sin jsdom ni paquetes nuevos).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### El contrato de la fase
- `.planning/workstreams/panel-nav/ROADMAP.md` §"Phase 3" — goal, los 6 criterios de éxito, el fuera
  de alcance, y los **cuatro riesgos (a)–(d)** con los tres caminos de implementación.
- `.planning/workstreams/panel-nav/REQUIREMENTS.md` — MOB-04/05/06 y las trampas **T-4** (la política
  actual es de un nivel y **se redefine**), **T-5** (el orden guard-primero), **T-7** (el drawer de
  hoy no participa del historial), **T-10** (el panel no es instalable ⇒ MOB-05 no se puede gatear
  por "app instalada").

### El diseño ya cerrado — NO reabrir
- `.planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-UI-SPEC.md` **§13** — el aviso
  efímero de MOB-05, entero: por qué no es un toast, dónde se ancla, copy, ancho medido, tokens,
  capa, movimiento, a11y, y **la regla de la constante única**.
- Ídem **O-3** — la decisión de que la guarda es un aviso efímero sin modal ni botones.

### El código que esta fase redefine
- `lib/panel-history.ts` — `panelNavMode` y sus **cuatro ramas documentadas**, `consumeOwnedPanelEntry`,
  `isForeignOwnedEntry` (la regla 0), `PANEL_ROOT`. El comentario de cabecera de `panelNavMode`
  explica **por qué** cada rama es así; leerlo antes de agregar la quinta.
- `lib/overlay-history.ts` y `lib/dirty-history.ts` — los otros dos dueños de la pila. `dirty-history`
  es además la **implementación de referencia del ciclo sentinel** que MOB-05 necesita.
- `components/dashboard/panel-bottom-nav.tsx` y `app/(dashboard)/mas/mas-client.tsx` — los consumidores
  nuevos de la Phase 2; los dos ya hablan el dialecto (guard primero, después el consumo).
- `components/dashboard/sidebar.tsx` — el consumidor de desktop, que **no se puede enterar** de nada
  (criterio 6).

### Lo verificado que no se puede romper
- `.planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-UAT.md` — los 13 ítems que el
  dueño verificó en Android y iPhone, incluidos **los dos recorridos que NO son bugs** y que esta
  fase **cambia a propósito**.
- Las cinco suites de historial: `test/overlay-history.test.ts`, `test/dirty-history.test.ts`,
  `test/panel-history.test.ts`, `test/panel-history-sidebar.test.ts`, `test/panel-history-clients.test.ts`.
- `test/panel-nav-chrome.test.ts` y `test/panel-nav-groups.test.ts` — los candados de la Phase 2.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`panelNavMode({from, to})`** — decisión pura sobre rutas, 4 ramas, ya testeada. La política nueva
  es una extensión de ésta, no un reemplazo.
- **`consumeOwnedPanelEntry()`** — el molde exacto que D-03 necesita (subir un nivel sin apilar). Ya
  resuelve "tocar el destino en el que ya estás" y ya está verificado en celular.
- **`lib/dirty-history.ts`** — el ciclo sentinel completo, **en producción**. Es la referencia para la
  absorción del primer `popstate` de MOB-05; no hay que inventarlo.
- **`sonner`** — presente, pero ⚠ **MOB-05 no lo usa**: §13 lo descartó con medición.

### Established Patterns
- **Tres marcas, un embudo.** `frjView`, `frjOverlay` y `frjDirty` conviven porque cada módulo
  **re-verifica su marca justo antes de cada `back()`** y porque la regla 0 de `panel-history` se
  abstiene ante las otras dos. Una política nueva que escriba historial por fuera de ese embudo rompe
  el conteo de backs de los otros dos. Si esta fase agrega una marca, es **nueva** y los otros dos la
  reconocen o la ignoran, **nunca le hacen `back()` encima** (criterio 5).
- **Decisiones puras en `lib/`, efectos en el componente.** La política vive como funciones puras
  testeadas con `environment: 'node'`; `grep -rE 'pushState|replaceState|history\.back'` sobre los
  componentes tiene que dar **cero** fuera del helper.
- **El orden es contrato:** guard de cambios sin guardar **primero**, después el consumo de la entrada
  propia (T-5). Los tres consumidores lo respetan hoy.

### Integration Points
- `panel-bottom-nav.tsx` y `mas-client.tsx` consumen la política en su `onNavigate`.
- `sidebar.tsx` la consume también y **tiene que caer en las mismas ramas de siempre por
  construcción**, sin un chequeo de viewport en el medio (criterio 6).
- El aviso de MOB-05 vive **dentro del componente de la barra** (§13), que es donde ya está el
  contexto de apilado y el token del alto.
</code_context>

<specifics>
## Specific Ideas

- **El patrón nombrado por el dueño para MOB-05 es el "press back again to exit" de Android**, que es
  un **Snackbar abajo**. Mandarlo arriba traicionaría la referencia — ése es el argumento que §13 usa
  para no reusar el `<Toaster>` global.
- **El atrás deshace el último movimiento** es el criterio con el que el dueño resolvió D-02: eligió
  la opción que devuelve a donde venía, por sobre la regla más simple de "siempre Inicio".
- **Que salir cueste siempre lo mismo** es el criterio con el que resolvió D-03.
</specifics>

<deferred>
## Deferred Ideas

- **Mostrar que estás dentro de la rama de Más** (que Más quede iluminado en la barra, un "volver a
  Más" en el header, o un breadcrumb). Se evaluó y se difirió **a propósito** en D-04, para no
  ensuciar la UAT de la fase más riesgosa del milestone. ⚠ **Si la UAT en celular muestra que el
  dueño se pierde** —dos pantallas iguales con atrás distinto—, vuelve con evidencia y entra por
  `/gsd-ui-phase`, que es el gate que cualquiera de las tres reabre.
- **PWA / `manifest`.** Fuera de alcance del milestone, y declarado así aunque D-01 lo vuelva más
  atractivo: hoy gatear MOB-05 por `display-mode: standalone` daría **siempre false** (M-8, T-10).
- **Forzar que el atrás nunca cruce de sección al entrar directo a una ruta** (URL pegada, F5, rebote
  post-login). Ya **aceptado y documentado** en v0.30: no hay Inicio debajo y el atrás sale del panel.
  Empujar un Inicio falso sería inventar una entrada que el dueño nunca visitó.
- **Extender `useUnsavedChanges` a pantallas nuevas.** Decisión aparte, ya declarada.
</deferred>

---

*Phase: 3-La política de atrás, de un nivel a dos*
*Context gathered: 2026-10-13*
