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

- [ ] **NAV-01**: El detalle de un cliente es una ruta propia. Abrir un cliente empuja una entrada, y
      el back vuelve **al listado de Clientes** con su búsqueda y filtros como estaban, no a la
      sección anterior.
- [ ] **NAV-02**: La URL del detalle se puede recargar y compartir: entrar directo muestra ese
      cliente, y un id inexistente o **de otro negocio** no filtra nada (404 o vuelta al listado, sin
      confirmar que el id existe).

### Tabs que son subsecciones

- [ ] **NAV-03**: Los tabs de `/negocio` (Datos·Cobros·Integraciones·Notificaciones) y de `/settings`
      (Apariencia·Seguridad·Suscripción) viven en la URL. El back vuelve al tab anterior y el tab se
      puede compartir/recargar.
- [ ] **NAV-04**: Los tabs de `/finances` (Turnos·Ventas·Egresos) viven en la URL con el mismo
      criterio, y el botón de alta que depende del tab sigue correspondiendo al tab visible.

### La regla de fondo

- [ ] **NAV-05**: Queda **una** forma de hacer esto en el panel, no cuatro copias. Un helper
      compartido decide cuándo un cambio de vista **empuja** entrada y cuándo **reemplaza**, y las
      superficies lo consumen. Sin esto, la próxima subsección que alguien agregue vuelve a romper el
      back.
- [ ] **NAV-06**: Nada de lo anterior rompe el arreglo de Bug A ni la guarda de cambios sin guardar:
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
| T-5 | El panel hoy tiene **cero** `useSearchParams` (el único del repo está en `plan-banner.tsx`). No hay patrón previo de estado-en-URL que copiar en el panel: NAV-05 lo establece. | medido con grep |
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
| NAV-01 | Phase 1 | Pending |
| NAV-02 | Phase 1 | Pending |
| NAV-03 | Phase 2 | Pending |
| NAV-04 | Phase 2 | Pending |
| NAV-05 | Phase 1 | Pending |
| NAV-06 | Phase 1 | Pending |

**Coverage:** 6 requisitos · mapeados a fases: 6/6 (ROADMAP.md, 2026-09-28) · sin mapear: 0
