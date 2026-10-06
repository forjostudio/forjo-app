# Requirements: v0.31 — La navegación mobile del panel

**Defined:** 2026-10-06 · **Workstream:** `panel-nav`
**Core Value:** en el celular el panel se usa como una app, no como un sitio con menú hamburguesa.

## De dónde sale

Pedido del dueño después de la UAT de v0.30: *"cambiar el diseño a algo tipo app de celular en móvil,
con una barra abajo con los accesos principales y una sección Más con todo el menú. Una vez que estás
en el menú Más y entrás a una sección, volver atrás tiene que volver al menú Más y de ahí recién a
inicio."*

Y un segundo pedido, del mismo mensaje: *"cuando toco atrás en el dashboard me cierra la app o me manda
a alguna página anterior, podemos poner una guarda ahí que diga ¿desea salir?"*

## Decisiones tomadas antes de diseñar (2026-10-06)

- **D-01 — La barra es FIJA, igual para todos los rubros:** `Inicio · Turnos · Agenda · Clientes · Más`.
  Los cuatro primeros existen en **todos** los verticales y son el uso diario; lo específico de cada
  rubro vive en **Más**. Se descartó derivarla del vertical (la barra cambiaría de forma entre rubros)
  y dejar que el dueño la configure (una pantalla de ajustes más que casi nadie toca).
- **D-02 — Sólo mobile.** Debajo del breakpoint entra la barra; en desktop sigue el sidebar **sin
  cambios**. Una barra inferior en pantalla grande es desperdicio de espacio.

## Lo medido que condiciona el diseño

| # | Qué | Dónde |
|---|---|---|
| T-1 | **El menú varía por rubro.** Hoy son **5 grupos / 12 destinos** (`PANEL` · `AGENDA` · `GESTIÓN` · `REPORTES` · `AJUSTES`) y cada vertical expone un subconjunto. Por eso **Más** no es una lista fija: es el menú resuelto menos lo que ya está en la barra. | `components/dashboard/sidebar.tsx:43-48,57-83` |
| T-2 | ⚠ **El repo NO usa `env(safe-area-inset-*)` en ningún lado** (barrido: cero coincidencias). Una barra inferior fija sin eso queda **debajo de la zona de gestos** del teléfono. | medido |
| T-3 | El panel **no tiene ningún elemento flotante fijo**, así que la barra no colisiona con nada existente. | medido |
| T-4 | La política de atrás actual es **un solo nivel**: `panelNavMode` deja **una sola sección encima del dashboard** (dashboard→sección empuja, sección→sección reemplaza). El modelo nuevo necesita **dos** (Inicio → Más → sección) ⇒ **esta regla se redefine**. | `lib/panel-history.ts` |
| T-5 | El sidebar ya consume `panelNavMode` y `consumeOwnedPanelEntry` en su `onNavigate`, y el guard de cambios sin guardar se evalúa **primero**. Lo que se construya tiene que respetar ese orden. | `components/dashboard/sidebar.tsx:152,162-163` |

## Requisitos

### La barra

- [ ] **MOB-01**: En mobile hay una barra inferior fija con `Inicio · Turnos · Agenda · Clientes · Más`,
      visible en todas las pantallas del panel, con el destino actual señalado.
- [ ] **MOB-02**: La barra respeta la **zona segura** del dispositivo (T-2) y sus destinos cumplen el
      área táctil mínima de 44×44. No tapa contenido: las pantallas reservan su alto.
- [ ] **MOB-03**: **Más** muestra el resto del menú del negocio —el menú resuelto por vertical menos lo
      que ya está en la barra (T-1)— agrupado como hoy, sin perder ningún destino.

### La política de atrás, redefinida

- [ ] **MOB-04**: El atrás tiene **dos niveles**: desde una sección abierta por Más vuelve a **Más**, y
      desde Más vuelve a **Inicio**. Desde una sección de la barra vuelve a **Inicio**.
- [ ] **MOB-05**: En **Inicio**, el atrás pide confirmación antes de salir del panel.
      ⚠ Ver la advertencia de abajo: tiene condiciones.
- [ ] **MOB-06**: Nada de esto rompe lo que ya está verificado en celular: el atrás sigue cerrando
      overlays, selectores y el calendario antes que navegar, y el aviso de cambios sin guardar sigue
      frenando la salida.

### Lo que no se toca

- [ ] **MOB-07**: En desktop **no cambia nada** (D-02).

## ⚠ Advertencia sobre MOB-05, para decidir con los ojos abiertos

Retener el atrás cuando **no hay nada que perder** es intrusivo en una pestaña de navegador, y es el
patrón que los navegadores vienen limitando a propósito: el `popstate` del atrás del usuario llega
`cancelable: false` por diseño del estándar (medido en
`.planning/debug/interceptar-atras-aviso-sin-guardar.md`). **No se puede cancelar: sólo absorber**, y
absorber en Inicio significa que el dueño tiene que apretar atrás dos veces para salir **siempre**.

Donde este patrón es natural y esperado es en una **app instalada (PWA)**. Si el panel no se instala,
MOB-05 puede terminar molestando más de lo que ayuda. **El diseño tiene que resolver esto
explícitamente**, no asumirlo.

## Fuera de alcance

| Qué | Por qué |
|---|---|
| El sidebar de desktop | D-02 |
| Convertir el panel en PWA instalable | Es otra decisión, aunque MOB-05 la haga atractiva |
| Rediseñar las pantallas en sí | Esto es navegación, no contenido |
| Los tabs en la URL (Phase 2 de v0.30) | Queda pendiente; se decide después de este rediseño porque la navegación cambia |
| Migraciones | Nada de esto toca datos. Próxima libre: **042** |

## Traceability

| Requisito | Fase | Estado |
|---|---|---|
| MOB-01 … MOB-07 | TBD (el roadmap las asigna) | Pending |
