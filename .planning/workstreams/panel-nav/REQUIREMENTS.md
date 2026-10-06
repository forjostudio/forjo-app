# Requirements: v0.30 — La navegación del panel

**Defined:** 2026-09-28
**Workstream:** `panel-nav`
**Core Value:** el botón "atrás" del celular hace lo que el usuario espera en el panel. Nunca lo
saca de la sección en la que está trabajando por haber abierto un detalle o un tab.

## El bug que cierra este milestone

Reportado por el dueño en la UAT de v0.24 (2026-07-21), **Bug B** de los dos de navegación mobile:

> Estoy en Finanzas → voy a Clientes por el menú hamburguesa → abro un cliente → el back me lleva
> **directo a Finanzas**, no al listado de Clientes.

**Bug A ya está cerrado** (quick `260928-seo`, 2026-09-28): el back cierra los overlays. Lo que queda
es el estado de UI que **hace de página sin ser una ruta**.

**Causa raíz, medida el 2026-09-28:** el panel tiene **14 rutas planas y cero segmentos dinámicos**.
Todo lo que parece "una pantalla adentro de una sección" es `useState`, así que no existe para el
navegador y el back popea la última entrada de *ruta* — que puede ser otra sección.

## Decisiones tomadas antes de planificar (2026-09-28)

**D-01 — Historia honesta, NO reescrita.** Las subsecciones pasan a ser rutas reales y el back se
arregla *solo* por existir la entrada. **No se intercepta `popstate` ni se reescribe el historial.**

⚠ Esto **acota a propósito** el pedido original de julio. El dueño pidió que el back "en última
instancia lleve al dashboard y nunca a otra sección abierta antes". La primera mitad sale sola; la
segunda **no se implementa**, porque:

- Si el usuario viene de Finanzas, esa entrada **existe**. Sacarla es reescribir historial.
- `components/dashboard/unsaved-changes-guard.tsx` **ya documenta** (verificado contra Next 16.2.7,
  no de memoria) que el App Router no expone API de bloqueo para `popstate`, y que el truco de
  empujar una entrada falsa y revertirla **desincroniza el historial del router**.
Queda como decisión registrada, no como gap. Si más adelante duele, entra por el camino de NAV-05.

**D-02 — Alcance: detalle de cliente + los tabs profundos.** Se convierten las subsecciones que hoy
se comen el back. **Queda afuera** el toggle `mobileView` edit/preview de `/web`: es una vista, no
una subsección, y no hay dolor reportado.

## Requisitos

### Detalle de cliente

- [x] **NAV-01**: El detalle de un cliente es una ruta propia. Abrir un cliente empuja una entrada, y
      el back vuelve **al listado de Clientes** con su búsqueda y filtros como estaban, no a la
      sección anterior.
- [x] **NAV-02**: La URL del detalle se puede recargar y compartir: entrar directo muestra ese
      cliente, y un id inexistente o **de otro negocio** no filtra nada (404 o vuelta al listado, sin
      confirmar que el id existe).

### Tabs que son subsecciones

- [ ] **NAV-03**: Los tabs de `/negocio` (Datos·Cobros·Integraciones·Notificaciones) y de `/settings`
      (Apariencia·Seguridad·Suscripción) viven en la URL. El back vuelve al tab anterior y el tab se
      puede compartir/recargar.
- [ ] **NAV-04**: Los tabs de `/finances` (Turnos·Ventas·Egresos) viven en la URL con el mismo
      criterio, y el botón de alta que depende del tab sigue correspondiendo al tab visible.

### El stack de secciones (agregado 2026-09-29, tras la UAT de la Phase 1)

- [x] **NAV-07**: El menú lateral deja **una sola sección** en la pila por encima del dashboard. Ir
      del dashboard a una sección **empuja**; ir de una sección a otra **reemplaza**. Consecuencia
      buscada: el atrás desde cualquier sección cae en el **dashboard**, nunca en otra sección
      abierta antes.
      ⚠ Caso aceptado y documentado: si se entra **directo** a una sección (URL pegada o F5), no hay
      dashboard debajo y el atrás sale del panel. Empujar uno falso sería reescribir historial (D-01).
- [x] **NAV-08**: Tocar en el menú la sección **en la que ya estás** cierra la subsección abierta en
      vez de apilar una entrada de ruta encima. Sin esto queda una entrada de subsección **sepultada**
      que el atrás desentierra más tarde, llevando a un destino equivocado.

⚠ **NAV-08 es una REGRESIÓN introducida por la Phase 1**, encontrada en la UAT del 2026-09-29 y
diagnosticada midiendo la pila real del navegador por CDP: `sidebar.tsx:141` calcula `active` con
`usePathname()`, que ignora la query, así que con `/clients?c=A` el link se pinta activo **y aun así
navega y empuja**. Antes de la Phase 1 no existía ninguna entrada `?c=` que sepultar.

### El aviso de cambios sin guardar (agregado 2026-10-06)

- [ ] **NAV-09**: "Hay cambios sin guardar" significa **realmente distinto de lo que se cargó**, no
      "tocaste algo". Hoy es un latch **por gesto**: abrir un día ya marca sucio, y prender y apagar un
      chip lo deja encendido (`agenda-client.tsx:374-381,389-392`). Es prerrequisito de NAV-10 y
      arregla además un aviso que **hoy ya miente**.
- [ ] **NAV-10**: El **atrás del navegador** avisa antes de perder cambios sin guardar, igual que ya
      avisa un link del menú.
- [ ] **NAV-11**: Confirmar "Salir sin guardar" respeta la regla de secciones. Hoy `confirmLeave()`
      usa `router.push` ignorando `panelNavMode` ⇒ **ya rompe NAV-07** (deja dos secciones encima del
      dashboard). Defecto preexistente, destapado al medir NAV-10.

#### ⚠ Enmienda a D-01 — reabierta a propósito

D-01 decía *"cero intercepción de `popstate`"* citando el encabezado de
`unsaved-changes-guard.tsx:21-25`: que Next 16 no expone API de bloqueo **y** que empujar una entrada
y revertirla *"desincroniza el historial del router"*.

**Medido el 2026-10-05** (`.planning/debug/interceptar-atras-aviso-sin-guardar.md`): la primera mitad
sigue siendo cierta —y peor, el `popstate` del atrás de usuario llega `cancelable: false` por diseño
del estándar, así que **ni la Navigation API lo cancela**—. Pero **la segunda caducó**:
`segment-cache/navigation.js:412-413` setea `preserveCustomHistoryState: true` en el camino del
back/forward, con el comentario de que es **a propósito**. Y la prueba por existencia es
`lib/overlay-history.ts`, en producción sobre 39 overlays.

⇒ **D-01 se mantiene para el historial de RUTAS** (no se reescribe la navegación entre secciones) y
**se relaja para el estado de UI**, que es como ya venía funcionando de hecho desde Bug A. No se
*cancela* el atrás: se **absorbe**, que es lo que el repo ya sabe hacer.

### La regla de fondo

- [x] **NAV-05**: Queda **una** forma de hacer esto en el panel, no cuatro copias. Un helper
      compartido decide cuándo un cambio de vista **empuja** entrada y cuándo **reemplaza**, y las
      superficies lo consumen. Sin esto, la próxima subsección que alguien agregue vuelve a romper el
      back.
- [x] **NAV-06**: Nada de lo anterior rompe el arreglo de Bug A ni la guarda de cambios sin guardar:
      con un overlay abierto el back sigue cerrando el overlay (no navegando), y con cambios sin
      guardar en Agenda el back/cambio de vista sigue avisando.

## Trampas medidas que el plan tiene que respetar

Salieron de medir el código el 2026-09-28, no de suponer:

| # | Qué | Dónde |
|---|-----|-------|
| T-1 | **`settings-client.tsx` es UNA sola pantalla de 4183 líneas compartida por 5 rutas** (`/settings`, `/negocio`, `/servicios`, `/equipo`, `/consultorios`) vía la prop `view`. Tocar "los tabs de settings" toca las cinco. | `app/(dashboard)/settings/settings-client.tsx:993-1003` |
| T-2 | ⚠ El retorno del OAuth de MercadoPago hace `window.history.replaceState(null, '', '/negocio')` para limpiar `?mp=...`. Si el tab pasa a vivir en la URL, **esa línea lo borra** — y justo después el código fuerza el tab `integraciones`. Hay que reconciliarlo o el usuario vuelve del OAuth a un tab que no pidió. | `app/(dashboard)/settings/settings-client.tsx:1009-1022` |
| T-3 | ⚠ `activeLoc` de Agenda **no es una subsección, es un filtro** entretejido con el editor de horarios (se lee en ~10 lugares entre las líneas 447-581), y Agenda es **la única** pantalla que usa `useUnsavedChanges`. Si cada cambio de sucursal empujara historia y disparara el guard de salida, editar horarios se volvería insoportable. Por eso **no** está en NAV-03/04: si entra, entra con `replace`, no con `push` — y esa es justamente la decisión que NAV-05 tiene que poder expresar. | `app/(dashboard)/agenda/agenda-client.tsx:346,447` |
| T-4 | Hay precedente de ruta dinámica en el repo para mirrorear, y **no** está en el panel: el CRM. | `app/(crm)/admin/negocios/[id]` |
| T-5 | ~~El panel no tiene `useSearchParams`~~ **CORREGIDO 2026-09-29 (research Phase 1):** el panel **sí** tiene uno corriendo en **todas** sus rutas — `plan-banner.tsx:22`, renderizado desde el layout del dashboard y **ya envuelto en `<Suspense>`**. O sea que **hay patrón del repo para copiar**, y el riesgo de que `useSearchParams` rompa el build está sobreestimado. | `app/(dashboard)/layout.tsx:60-62`, `components/dashboard/plan-banner.tsx:22` |
| T-7 | ⚠ **Inventario completo de `replaceState` crudos del panel** (el grep de la Phase 2 tiene que cubrir los dos, no uno): `settings-client.tsx:1021` (limpieza de `?mp=`) **y** `agenda-client.tsx:290` (limpieza de `?google=`). El segundo se había omitido. | medido 2026-09-29 |
| T-8 | ⚠ **El borrado de cliente es una carrera, no sólo la fusión.** `deleteClient()` hace `setSelectedId(null)` y `setConfirmDelete(false)` **en el mismo lote** (`clients-client.tsx:527-528`), y ese `<Dialog>` (`:807`) participa de `lib/overlay-history.ts`. Escribir historial ahí compite con el `back()` del overlay. Detalle y decisión en el CONTEXT.md de la Phase 1 (C-1). | `clients-client.tsx:519-531,807` |
| T-6 | React `<Activity>` (que preservaría el estado al navegar) **NO está activo**: requiere `cacheComponents: true` y `next.config.ts` no lo tiene. Las páginas se desmontan normal. Verificado en `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md:13`. | `next.config.ts` |

## Fuera de alcance

| Qué | Por qué |
|---|---|
| Forzar que el back nunca cruce de sección / caiga al dashboard | D-01. Pelea con la historia lineal y el repo ya documentó que el truco desincroniza el router de Next. |
| El toggle edit/preview de `/web` (`mobileView`) | Es una vista mobile, no una subsección. Cero dolor reportado. |
| Interceptar el back para la guarda de cambios sin guardar | Límite ya declarado a propósito en `unsaved-changes-guard.tsx`. NAV-06 sólo exige **no empeorarlo**. |
| Rehacer el menú hamburguesa o la IA del sidebar | Este milestone es el back, no la navegación de entrada. |
| Migraciones de base | Nada de esto toca datos. La próxima migración libre sigue siendo la **080**. |

## Traceability

| Requisito | Fase | Estado |
|---|---|---|
| NAV-01 | Phase 1 | ✅ Completo — UAT en celular PASS |
| NAV-02 | Phase 1 | ✅ Completo — UAT en celular PASS |
| NAV-03 | **DIFERIDO a v0.31** | Pending — ver nota |
| NAV-04 | **DIFERIDO a v0.31** | Pending — ver nota |
| NAV-05 | Phase 1 | ✅ Completo — UAT en celular PASS |
| NAV-07 | Phase 1 (cierre de gaps) | ✅ Completo — UAT en celular PASS |
| NAV-08 | Phase 1 (cierre de gaps) | ✅ Completo — UAT en celular PASS |
| NAV-06 | Phase 1 | ✅ Completo — UAT en celular PASS |

**Coverage:** 6 requisitos · mapeados a fases: 6/6 (ROADMAP.md, 2026-09-28) · sin mapear: 0

## ⚠ Por qué NAV-03/NAV-04 se difieren a v0.31 (2026-10-06)

La Phase 2 —los tabs de `/negocio`, `/settings` y `/finances` en la URL— **no se ejecutó, y es una
decisión, no un olvido.**

El dueño pidió rediseñar la navegación mobile con **barra inferior + sección "Más"** (milestone v0.31,
ver `REQUIREMENTS-v031.md`). Ese rediseño **redefine la política de atrás**: hoy es de **un nivel**
(una sola sección encima del dashboard) y pasa a ser de **dos** (Inicio → Más → sección).

Los tabs en la URL son independientes del rediseño, **pero la regla que los gobierna no**. Hacerlos
ahora significaría escribirlos contra una política que está por cambiar. Se difieren para definir la
política **una sola vez**.

**v0.30 cierra con lo que entregó**, que es más de lo que su roadmap original planteaba: a los 6
requisitos iniciales se sumaron NAV-07/08 (del cierre de gaps) y NAV-09/10/11 (el aviso de cambios sin
guardar), los cinco verificados en celular real.
