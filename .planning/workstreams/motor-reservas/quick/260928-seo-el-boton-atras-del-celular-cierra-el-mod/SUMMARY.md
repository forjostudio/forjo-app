---
quick_id: 260928-seo
phase: quick
plan: "01"
subsystem: panel-overlays
status: complete
tags: [historial, popstate, mobile, dialog, drawer, base-ui, vaul, phase-23, g-23-25]

requires:
  - "Phase 23 (la guarda del borrador, G-23-25) — cerrada; esto NO la replanifica, la EXTIENDE con un motivo nuevo"
  - "lib/landing/lightbox.ts — el molde del historial ya probado en producción en este repo"
provides:
  - "el back del celular cierra el overlay abierto (35 Dialog + 4 Drawer) en vez de navegar"
  - "un motivo de cierre propio ('history-back') que la guarda del borrador reconoce como accidental"
  - "re-push de la entrada de historia cuando el cierre se veta, para que el back siguiente no se lleve la página"
affects:
  - "components/ui/dialog.tsx (wrapper único de los 35 diálogos)"
  - "components/ui/drawer.tsx (wrapper único de los 4 drawers)"
  - "lib/panel-draft.ts (tipo del detalle + lista de motivos accidentales)"

tech-stack:
  added: []
  patterns:
    - "hash obligatorio en el pushState: la misma URL colapsa la entrada y el back saca al usuario de la página (cicatriz ya documentada en lib/landing/lightbox.ts)"
    - "nunca history.back() sin verificar que arriba del stack está nuestra marca CON nuestro id"
    - "el efecto de React no decide: pregunta a funciones puras (overlayHistoryAction / overlayUnmountAction / popstateAction) y ejecuta — así la mecánica del historial se testea en entorno node, sin jsdom"
    - "el veto del cierre se detecta observando que el overlay siguió ABIERTO, no leyendo cancel(): un solo mecanismo sirve para base-ui y para vaul"

key-files:
  created:
    - lib/overlay-history.ts
    - test/overlay-history.test.ts
  modified:
    - components/ui/dialog.tsx
    - components/ui/drawer.tsx
    - lib/panel-draft.ts

decisions:
  - "Overlays ANIDADOS: se APILAN (LIFO), no se ignora el segundo. Cada instancia tiene un id monotónico propio y reconoce nada más que su entrada, así que el back cierra el de arriba y deja abierto el de abajo. Ignorar el segundo dejaba sin back al diálogo de descarte del turno, que en el panel convive de hecho con el drawer del alta"
  - "DOBLE PUSH: candado holdingRef — un solo dueño de la entrada por instancia. El efecto consulta overlayHistoryAction({participates, open, holding}): abierto + holding ⇒ none. El mismo candado, del lado simétrico, impide el doble back()"
  - "DESMONTAJE CON EL OVERLAY ABIERTO: se consume la entrada, porque ése es el camino de cierre NORMAL de varios overlays del panel (se montan condicionalmente, cerrarlos los desmonta y nunca bajan open). Pero SÓLO si arriba del stack está nuestra marca: si el desmontaje fue por una navegación, la entrada de arriba es la del router y un back() desharía la navegación del usuario"
  - "El hash del pushState es LOAD-BEARING y por profundidad (#modal, #modal-2, …): empujar la misma URL hace que el router colapse la entrada — el back no encuentra nada que deshacer y saca al usuario de la página (bug real ya sufrido en el CMS hermano, documentado en lib/landing/lightbox.ts)"
  - "El re-push tras un veto se decide observando open, no cancel(): es la única señal que también sirve para los overlays cuyo veto NO pasa por el detalle (el requestClose del alta de turno/abono abre su propio diálogo de descarte, y vaul no tiene detalle de cierre)"
  - "El Drawer NO recibe detalle de cierre: el contrato de vaul es (open: boolean) => void en TODOS sus motivos. Inventarle un detalle sintético a cada cierre del drawer sería agregarle un motivo falso a los cierres que hoy funcionan bien"
  - "Los overlays no controlados (sin open) y los que no traen onOpenChange NO participan del historial: sin open no se puede saber el estado ni forzar el cierre, y sin handler el back quedaría MUERTO (el re-push lo volvería un gesto que no cierra nada y no deja salir de la página)"
  - "El id de instancia va en useState con inicializador lazy y no en una ref escrita durante el render: react-hooks/refs lo prohíbe (y tiene razón), y el valor nunca cambia así que no cuesta un re-render"
  - "lib/overlay-history.ts NO lleva la directiva de cliente: los dos wrappers ya la declaran, y lib/panel-draft.ts importa de ahí el motivo — marcarlo como frontera de cliente arrastraría a panel-draft adentro sin necesidad"

metrics:
  duration: ~25min
  completed: 2026-09-28

actuals:
  tokens: 12157
  tasks: 2
  commits: 2
  plan_head_before: ae59baa69cda28d95f5b41988a7c0607ab503815
---

# Quick 260928-seo: el botón "atrás" del celular cierra el modal — Summary

Los 35 `<Dialog>` y 4 `<Drawer>` del panel ahora participan del modelo de historia del navegador: al
abrirse empujan una entrada con hash, al cerrarse la consumen, y el back del celular pide el cierre
por el **mismo `onOpenChange`** que el click afuera y el Escape — con un motivo propio,
`'history-back'`, que `guardDraftOnDismiss` suma a su lista de cierres accidentales, así que un back
con un borrador sucio **avisa y no cierra** en vez de descartarlo en silencio. Todo se enganchó en los
dos wrappers compartidos: **ninguna de las 18 pantallas se tocó** y no hay un solo cambio de markup ni
de clases.

## Qué se hizo, tarea por tarea

### Task 1 — el modelo de historia, puro y testeable (`ed4d986`)

**`lib/overlay-history.ts` (nuevo).** Molde: `lib/landing/lightbox.ts` + su test, que resolvió este
mismo problema para el visor del landing y dejó las cicatrices documentadas. Lo puro:

| Export | Qué decide |
|---|---|
| `OVERLAY_HASH_BASE` / `nextOverlayHash(hashActual)` | el hash a empujar — vacío o ajeno ⇒ `#modal`, `#modal` ⇒ `#modal-2`, `#modal-N` ⇒ `#modal-(N+1)`, `#modal-basura` ⇒ base (nunca `#modal-NaN`) |
| `overlayHistoryState(id)` / `isOverlayHistoryEntry(state, id)` | la marca de la entrada y el guard de "arriba del stack está la MÍA" (narrowing manual, sin `any`) |
| `overlayHistoryAction({participates, open, holding})` | `push` / `consume` / `none` en cada render |
| `overlayUnmountAction({holding})` | lo mismo al desmontar (se nombra aparte para que quede explícito que no es un caso olvidado) |
| `popstateAction({topIsOurs})` | `dismiss` o `ignore` |
| `createHistoryBackDetails(event)` | el detalle sintético: el motivo propio, el `PopStateEvent` real, y un `cancel()` que asienta el veto en `isCanceled` |
| `HISTORY_BACK_REASON` | la fuente única del string, que `lib/panel-draft.ts` importa (no se reescribe a mano en dos archivos) |

El hook `useOverlayHistory({ open, dismiss })` **no decide nada**: consulta esas funciones y ejecuta.
Son tres efectos con responsabilidades separadas — empujar/consumir (sin limpieza, a propósito),
el listener de `popstate` (que sí se limpia), y la limpieza de desmontaje.

**`lib/panel-draft.ts`** — la trampa central del plan, cerrada en el mismo commit porque el test la
afirma: `DraftDismissDetails['reason']` se **ensancha** a
`DialogRootChangeEventDetails['reason'] | typeof HISTORY_BACK_REASON` (sin ensanchar el tipo el motivo
nuevo ni se podía nombrar: la unión de Base UI es cerrada) y el motivo se suma a la lista de
accidentales, que era literal.

**`test/overlay-history.test.ts` (nuevo, 27 casos).** Entorno `node`, cero paquetes. Reconstruye el
bucle del hook contra un **historial falso** (`pushState` / `back()` que avisa a los listeners
*después* de mover el puntero, y que replica la mutación de Next agregando `__NA`), usando las MISMAS
funciones de decisión que el efecto real — así los escenarios que se afirman son los del navegador, no
una paráfrasis.

### Task 2 — cableado en los dos wrappers (`50ee659`)

**`components/ui/dialog.tsx:12`** — las props pasan a `Omit<Root.Props, 'onOpenChange'>` más un
`onOpenChange` cuyo detalle es `OverlayDismissDetails` (**una unión**: el detalle real de Base UI o el
nuestro, así la rama de Base UI llega intacta y ninguna pantalla pierde tipado). El `dismiss` llama
`onOpenChange(false, createHistoryBackDetails(event))`.

**`components/ui/drawer.tsx:22`** — `dismiss` llama `onOpenChange(false)`, sin detalle.

El diff de los dos wrappers es sólo: el import, el destructuring de `open` / `onOpenChange`, la
llamada al hook y el paso explícito de esas dos props al primitivo. **Ni una clase, ni un nodo, ni un
`data-slot` tocado.** (Verificado: `git diff` filtrado por `class|rounded|bg-|text-|fixed|z-50` no
devuelve ninguna línea.) Pasar `open` en `undefined` es equivalente a omitirlo en los dos primitivos
(base-ui y el `useControllableState` de vaul chequean contra `undefined`), así que los no controlados
quedan exactamente como estaban.

## Los tres "cuidados" del Task 1, resueltos

| Cuidado | Decisión | Por qué |
|---|---|---|
| **Overlays anidados** | Se **apilan** (LIFO) | Cada instancia tiene un id monotónico y reconoce sólo su entrada: el back cierra el de arriba y el de abajo queda abierto. Ignorar el segundo dejaba sin back al diálogo de descarte, que **en el panel existe de hecho** anidado con el drawer del alta. Y el hash por profundidad (`#modal-2`) evita que dos entradas compartan URL, que es la cicatriz del colapso |
| **Doble push** | Candado `holdingRef` + `overlayHistoryAction` | Un re-render con `open` en true y la entrada ya empujada devuelve `none`. El mismo candado, del otro lado, impide el doble `back()` (dos back seguidos = usuario fuera de la página) |
| **Desmontaje con el overlay abierto** | Se consume la entrada, **pero sólo si arriba del stack está nuestra marca**; el listener se va con su efecto | Cerrar-por-desmontaje es el camino NORMAL de varios overlays del panel (se montan condicionalmente): sin consumir dejarían entrada huérfana. Si en cambio el desmontaje fue por una **navegación**, arriba está la entrada del router y un `back()` **desharía la navegación del usuario** → no se toca; la entrada queda enterrada y al volver hace falta un back extra. Precio consciente y documentado en el código |

## El borrador sucio + back: cómo se resolvió y cómo se cubre

**El camino completo.** El browser consume la entrada y dispara `popstate` → el handler ve que arriba
ya **no** está su marca (`popstateAction` ⇒ `dismiss`), suelta el `holding` y llama al `dismiss` del
wrapper → `onOpenChange(false, createHistoryBackDetails(event))` → es el mismo handler que el click
afuera, o sea `guardDraftOnDismiss`, que ahora reconoce el motivo nuevo como accidental → con el
borrador sucio llama `details.cancel()` más `onBlocked()` y **NO** llama `close()` → `open` sigue en
`true` → el `tick` que el handler bumpea vuelve a correr el efecto → `overlayHistoryAction` ⇒ `push`
→ **la entrada vuelve**. Sin ese re-push el modal quedaría abierto sin entrada y el back siguiente se
llevaría la página.

**Los tests que lo fijan** (`test/overlay-history.test.ts`, describe del back con un borrador SUCIO):

1. **el cierre vetado devuelve la entrada al historial** — arma el handler REAL
   (`guardDraftOnDismiss(() => true, close, onBlocked)`), aprieta back y afirma: `close` **no** se
   llamó, `onBlocked` sí, el stack **volvió a 2** y la instancia sigue dueña de su entrada. Y repite
   el back: vuelve a avisar, no se escapa.
2. **con el borrador LIMPIO el back cierra sin fricción** — cierra, no avisa, y al bajar `open` no
   hay segundo `back()` (stack en 1).
3. **el motivo nuevo está en la lista de accidentales** — la aserción directa: si alguien lo saca de
   esa lista, este test se pone rojo. Es el candado contra reintroducir G-23-25.

## Verificación (números medidos, no narrados)

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` (NUNCA `npx tsc`) | **exit 0 · 0 líneas de salida · `grep -c "error TS"` → 0** |
| `npx vitest run` | **98 files passed · 1392 passed** \| 4 expected fail \| 1 skipped (1397). Piso 1365/97 más los 27 nuevos = **1392/98 exacto** |
| canarios de reloj (`service-delete-gate`, `capacity-mode-change-gate`) | **verdes** — corrido a las **20:49 AR**, dentro de la ventana |
| `npx eslint` sobre los 5 archivos tocados | **exit 0**, sin hallazgos |
| `ls supabase/migrations/*.sql \| wc -l` | **41** (sin cambios) |
| paquetes nuevos | **0** — `git diff --stat package.json package-lock.json` vacío |
| cambio visual | **0** — el diff de los wrappers no toca ninguna clase, nodo ni `data-slot` |

Nota del camino: el primer `npx eslint` **falló** con 2 errores de `react-hooks/refs` (leer y escribir
`ref.current` durante el render para inicializar el id). Se corrigió pasando el id a `useState` con
inicializador lazy antes de commitear — no quedó ninguna regla silenciada ni deshabilitada.

## Desviaciones del plan

**1. [Menor — reparto entre tareas] El cambio de `lib/panel-draft.ts` entró en el commit del Task 1, no en el del Task 2**

- **Encontrado durante:** Task 1, al escribir el test.
- **Motivo:** el plan pone el ensanche del tipo y la lista de accidentales en el Task 2, pero el test
  del Task 1 (cuyo verify es `npx vitest run test/overlay-history.test.ts`) **afirma ese contrato**:
  sin el cambio no compila ni pasa. Juntarlos deja los dos commits verdes por separado, que es la
  garantía que importa.
- **Impacto:** ninguno. Los archivos y el resultado final son los mismos.
- **Commit:** `ed4d986`.

**2. [Decisión de alcance] El `<Drawer>` no recibe detalle de cierre (motivo + `cancel`); el `<Dialog>` sí**

- **Encontrado durante:** Task 2, midiendo el contrato de vaul (`node_modules/vaul/dist/index.d.ts:40`
  → `onOpenChange?: (open: boolean) => void`).
- **Motivo:** vaul **no tiene** detalle de cierre en ningún motivo, así que "el mismo `onOpenChange`
  que usan los demás motivos" en un drawer **es** la firma de un solo argumento — pasarle un detalle
  sintético obligaría a inventarle también un motivo falso a los cierres propios de vaul. Ningún
  drawer usa `guardDraftOnDismiss` (es de los 3 diálogos de Ajustes), y los dos drawers con guarda de
  borrador (alta de turno y de abono) vetan adentro de su `requestClose`, que abre su propio diálogo
  de descarte y no baja `open`. Como el re-push se decide observando que el overlay siguió abierto y
  no leyendo `cancel()`, **el veto del drawer se honra igual**.
- **Impacto:** ninguna pérdida de comportamiento; un solo mecanismo de veto para los dos wrappers.
- **Commit:** `50ee659`.

**3. [Aporte sobre el plan] El hook no se limita a "separar la lógica pura": el efecto no decide NADA**

- **Motivo:** el plan pedía poder testear sin DOM. Extraer sólo helpers de cálculo dejaba la máquina
  de estados (que es donde viven los bugs de historial) sin cubrir. Con `overlayHistoryAction` /
  `overlayUnmountAction` / `popstateAction` los tres escenarios que el plan pedía —abrir→back→cierra,
  abrir→✕→sin huérfana, desmontaje— se afirman de verdad contra un historial simulado.
- **Impacto:** +9 casos sobre lo estrictamente pedido.
- **Commit:** `ed4d986`.

**Total: 3 desviaciones, ninguna arquitectónica, ninguna de Rule 4.**

## Known Stubs

Ninguno. No quedó placeholder, TODO, FIXME ni dato sin cablear.

## Limitación conocida (documentada en el código, no es un stub)

Si el usuario **navega a otra sección con el overlay abierto**, la entrada del overlay queda
**enterrada** bajo la del router: al volver atrás a esa pantalla hará falta un back extra para salir.
Consumirla en el desmontaje habría **deshecho la navegación del usuario**, que es peor. Está explicado
en el tercer efecto de `lib/overlay-history.ts` y cubierto por el test de desmontarse DESPUÉS de
navegar.

## Fuera de alcance (respetado)

- **El bug B** (que el back salte a otra sección): sigue intacto, necesita convertir las subsecciones
  in-page del panel en rutas reales. Milestone propio.
- Cualquier cambio visual de los overlays.

## UAT pendiente — la hace el dueño en el CELULAR

Ningún test cubre el gesto real. Los 6 pasos del plan, sin cambios:

1. Abrir "Nuevo turno" → back → **cierra el modal** y queda en la agenda.
2. Con el modal cerrado, back → navega normalmente.
3. Abrir un modal, cerrar con la ✕, y después back → **navega** (no se comió un back de más).
4. Abrir "Editar servicio", tocar un campo, back → **NO cierra**, avisa, y el borrador queda.
5. Lo mismo sin tocar nada → cierra sin fricción.
6. Un Drawer (mobile) → mismo comportamiento.

## Self-Check: PASSED

- `lib/overlay-history.ts` — FOUND (creado)
- `test/overlay-history.test.ts` — FOUND (creado)
- `components/ui/dialog.tsx` — FOUND (modificado)
- `components/ui/drawer.tsx` — FOUND (modificado)
- `lib/panel-draft.ts` — FOUND (modificado)
- commit `ed4d986` — FOUND
- commit `50ee659` — FOUND
- `git rev-list --count ae59baa..HEAD` → **2**, igual a `actuals.commits`
