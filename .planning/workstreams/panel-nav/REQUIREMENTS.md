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
  ⚠ **CORREGIDO (2026-10-06): el breakpoint es `lg` (1024px), no 768.** Medido: el sidebar es
  `hidden lg:flex` y el header con hamburguesa es `lg:hidden` (`sidebar.tsx:253,279`). **Entre 768 y
  1023px hoy NO hay sidebar, hay hamburguesa** — si la barra entrara por `md:hidden`, esa banda se
  quedaría sin ningún menú.

## Lo medido que condiciona el diseño

| # | Qué | Dónde |
|---|---|---|
| T-1 | **El menú varía por rubro.** Hoy son **5 grupos / 12 destinos** (`PANEL` · `AGENDA` · `GESTIÓN` · `REPORTES` · `AJUSTES`) y cada vertical expone un subconjunto. Por eso **Más** no es una lista fija: es el menú resuelto menos lo que ya está en la barra. | `components/dashboard/sidebar.tsx:43-48,57-83` |
| T-2 | ⚠ **El repo NO usa `env(safe-area-inset-*)` en ningún lado** (barrido: cero coincidencias). Una barra inferior fija sin eso queda **debajo de la zona de gestos** del teléfono. | medido |
| T-3 | El panel **no tiene ningún elemento flotante fijo**, así que la barra no colisiona con nada existente. | medido |
| T-6 | ⚠ **"Todo el menú" es MÁS que los 5 grupos.** El footer del sidebar tiene tres filas que no están en `NAV_GROUPS`: **Ayuda**, **Ver mi página** (abre el público en pestaña nueva) y **Cerrar sesión**, más el bloque de identidad. Si **Más** renderiza sólo `buildNavGroups()`, el dueño **pierde el logout en mobile**. | `sidebar.tsx:189,197` |
| T-7 | ⚠ **El drawer del menú de hoy NO participa del historial** (`useState` pelado, sin marca). Si **Más** se construye con ese molde, **el atrás no lo cierra** y MOB-04 es imposible: Más tiene que ser una **ruta** o una hoja registrada en `overlay-history`. | `sidebar.tsx:262-267` |
| T-8 | ⚠ **D-01 fija los DESTINOS, no las PALABRAS.** En `canchas` "Turnos" es **"Reservas"**; en `salud` "Clientes" es **"Pacientes"**. A 375px con 5 ítems son ~75px por ítem para la palabra más larga del sistema. Es restricción de diseño. (Verificado: los **4 verticales** exponen los 4 destinos ⇒ D-01 no tiene excepciones.) | `lib/verticals.ts` |
| T-9 | `viewportFit: 'cover'` **existe** en el tipo de Next aunque no esté documentado, y `app/layout.tsx` **no exporta `viewport`** ⇒ se puede declarar **sólo** en el layout del dashboard, sin afectar landing, `/[slug]` ni CRM. **Sin eso `env(safe-area-inset-bottom)` vale 0** y MOB-02 no se cumple aunque el CSS esté escrito. | `next/dist/lib/metadata/types/extra-types.d.ts:52` |
| T-10 | ⚠ **MOB-05 no tiene hoy su condición habilitante:** el panel **no es instalable** (no hay `manifest`, cero usos de `display-mode`), así que gatear la guarda por "app instalada" daría **siempre false**. | medido |
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

### Heredado de v0.30

- [ ] **MOB-08** (ex **NAV-03**): Los tabs de `/negocio` y `/settings` viven en la URL: el atrás vuelve
      al tab anterior y el tab se puede compartir y recargar.
- [ ] **MOB-09** (ex **NAV-04**): Ídem los de `/finances`, y el botón de alta sigue correspondiendo al
      tab visible.

⚠ **Vinieron de la Phase 2 de v0.30, sin ejecutar.** Se difirieron **a propósito**: la política de
atrás pasa de **un nivel** a **dos** con este rediseño, y escribir los tabs contra la política vieja
era trabajo para rehacer. Su análisis ya está hecho —incluidas las trampas T-1 y T-2 de
`REQUIREMENTS.md` (los 5 rutas que comparten `settings-client.tsx`, y el `replaceState` del retorno del
OAuth que borraría el tab de la URL)— y sigue siendo válido.

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
| — | — |
| Migraciones | Nada de esto toca datos. ⚠ **CORREGIDO: la próxima libre es la 080** (la última aplicada es `079_service_categories_name_normalized.sql`), no la 042 como decía este documento |

## Traceability

> Asignado por `ROADMAP-v031.md` (2026-10-06). Fases **2-4** del workstream `panel-nav`
> (continúan desde la Phase 2 de v0.30, que quedó sin ejecutar).

| Requisito | Fase | Estado |
|---|---|---|
| MOB-01 | Phase 2 — La barra inferior y Más | Pending |
| MOB-02 | Phase 2 — La barra inferior y Más | Pending |
| MOB-03 | Phase 2 — La barra inferior y Más | Pending |
| MOB-04 | Phase 3 — La política de atrás, de un nivel a dos | Pending |
| MOB-05 | Phase 3 — La política de atrás, de un nivel a dos (⚠ patrón decidido en el UI-SPEC de la Phase 2) | Pending — decisión abierta |
| MOB-06 | Phase 3 — La política de atrás, de un nivel a dos | Pending |
| MOB-07 | Phase 2 — La barra inferior y Más | Pending |
| MOB-08 | Phase 4 — Los tabs profundos sobre la política ya fijada | Pending |
| MOB-09 | Phase 4 — Los tabs profundos sobre la política ya fijada | Pending |

**Coverage:** 9 requisitos · mapeados a fases: **9/9** · sin mapear: 0 · duplicados: 0

⚠ **Corrección de dato medida el 2026-10-06:** la tabla "Fuera de alcance" dice que la próxima
migración libre es la **042**. Es falso: la última aplicada es la **079**
(`supabase/migrations/079_service_categories_name_normalized.sql`), así que la próxima libre es la
**080**. No afecta este milestone (cero migraciones), pero conviene no arrastrar el dato.
