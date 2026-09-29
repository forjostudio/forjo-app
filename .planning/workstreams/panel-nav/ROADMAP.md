# Roadmap: Forjo App — La navegación del panel (workstream `panel-nav`)

> Workstream **nuevo** `panel-nav` (`phase_dir_count: 0`). Cubre **v0.30 La navegación del panel** (Phases 1-2). Numeración de fases del workstream desde **Phase 1**. Requirements en `.planning/workstreams/panel-nav/REQUIREMENTS.md` (NAV-01..NAV-06, D-01/D-02, trampas T-1..T-6). Rama `main`, worktrees desactivados (`use_worktrees: false`). Granularidad `coarse`. Aplica la skill `convenciones-forjo`; **no** aplica `supabase-multitenant-rls` como fase de datos (cero migraciones), pero sí su invariante de lectura: todo lo que se resuelva por un id que viene de la URL se acota por `business_id`.

## Overview

El panel tiene **14 rutas planas y cero segmentos dinámicos**. Todo lo que parece "una pantalla adentro de una sección" (el detalle de cliente, los tabs de Negocio/Configuración/Finanzas) es `useState`: no existe para el navegador. Por eso el back popea la última entrada de **ruta** — que puede ser otra sección — y el dueño pierde la pantalla en la que estaba trabajando (Bug B de la UAT de v0.24). Bug A (los overlays) ya se cerró en el quick `260928-seo` con `lib/overlay-history.ts`.

Este milestone convierte en navegación real **sólo** las subsecciones que se comen el back, bajo **D-01 (historia honesta)**: rutas/URL de verdad, **cero intercepción de `popstate` y cero reescritura de historial**. El back se arregla por existir la entrada, no por pelearse con el router.

El faseo va por **mecanismo + superficie**, en dos fases:

1. **Phase 1** nace el mecanismo (NAV-05) junto con la superficie que exige sus casos difíciles: el detalle de cliente. Es además la superficie del bug reportado, así que al cerrar la Phase 1 el bug está arreglado.
2. **Phase 2** aplica el mismo mecanismo a los tres grupos de tabs, que son el caso fácil pero el de mayor radio de impacto (T-1: `settings-client.tsx` es una pantalla de 4183 líneas compartida por 5 rutas).

**Por qué NAV-05 va en la Phase 1 y no al final:** de acuerdo con la lectura del dueño, y con un matiz que la refuerza. El helper no se puede diseñar en el vacío (un "existe un helper" no es un criterio observable), así que va **junto con** su primer consumidor — y el primer consumidor tiene que ser el **difícil**, no el fácil. El detalle de cliente es el único que ejerce los tres casos del helper: `push` (abrir un cliente es un destino), `replace` (la re-selección automática después de fusionar duplicados, `clients-client.tsx:570` — si empujara, el back llevaría a la ficha de un cliente recién borrado) y el **consumo** de la entrada al cerrar (el "Volver" de mobile). Los tabs sólo ejercen `push` + `replace`. Si el helper nace contra los tabs, la Phase 2 le tiene que agregar el modo de cambio de ruta y el consumo de entrada → el helper acaba documentando dos dialectos, que es exactamente lo que NAV-05 viene a evitar.

## Hechos verificados contra la versión instalada (Next 16.2.7, no de memoria)

Las decisiones de forma de las dos fases dependen de estos cuatro hechos. Están citados con archivo y línea para que ningún plan los re-suponga:

| Hecho | Dónde | Por qué condiciona el roadmap |
|---|---|---|
| `router.push` **agrega** entrada al historial; `router.replace` **no**. Los dos aceptan `{ scroll: false }`. | `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md:44-45` y `:119` | Es la primitiva que el helper de NAV-05 envuelve para el caso "cambio de ruta". |
| `window.history.pushState` / `replaceState` **nativos están soportados** y se **integran al router**: sincronizan `usePathname` y `useSearchParams` sin recargar ni volver al server. | `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:341-345` (ejemplo `pushState` con query: `:351-372`; `replaceState`: `:397-412`) | Es el camino oficial para estado-en-query sin round-trip al server, y es **el mismo `pushState` parcheado** que ya usa `lib/overlay-history.ts` (que depende de que Next le copie adentro `__NA`). El helper tiene que usar este, nunca un `pushState` original guardado aparte. |
| Los layouts **preservan estado, siguen interactivos y no se re-renderizan** al navegar entre sus páginas hijas. | `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md:43` | Es la única forma de que un detalle-como-ruta-hija no pierda la búsqueda y los filtros del listado. |
| `<Activity>` (preservar estado de página al navegar) **requiere `cacheComponents: true`**, y `next.config.ts` no lo tiene → las páginas se desmontan normal. El propio doc nombra "hoisting state to a shared layout" como el workaround previo. | `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md:13` y `:15`; `next.config.ts` (confirmado: sólo `images` y `allowedDevOrigins`) | T-6. Cierra la puerta al "se arregla solo": si el detalle es ruta hija, o el estado del listado sube al layout o viaja en la URL. |
| `useSearchParams` en una página **prerenderizada** exige `<Suspense>` o el **build de producción falla** (en dev no se nota). Si la ruta es dinámica, está disponible ya en el render inicial del server. | `use-search-params.md:178-179` y `:186` | Las 14 páginas del panel llaman `createClient()` → `cookies()` (`lib/supabase/server.ts:5`) ⇒ son dinámicas ⇒ el fallo de build no debería aparecer. **"No debería" no es "no aparece": `npm run build` es criterio de las dos fases**, no una formalidad. |

## Phases

**Phase Numbering:**

- Integer phases: Planned milestone work (numeración desde Phase 1 — workstream nuevo)
- Decimal phases (1.1, 1.2): Urgent insertions (marked with INSERTED)

### Milestone v0.30 — La navegación del panel

- [ ] **Phase 1: El detalle de cliente, con la regla de historial que lo gobierna** - Abrir un cliente pasa a ser navegación real (el back vuelve al listado con su búsqueda y filtros, la URL se recarga y se comparte) y nace el único helper que decide empujar vs. reemplazar, ejercido contra los tres casos difíciles de esta superficie
- [ ] **Phase 2: Los tabs profundos sobre la misma regla** - Los tabs de `/negocio`, `/settings` y `/finances` viven en la URL consumiendo el helper de la Phase 1, sin tocar las otras tres rutas que comparten esa pantalla ni romper el retorno del OAuth de MercadoPago

## Phase Details

### Phase 1: El detalle de cliente, con la regla de historial que lo gobierna

**Goal**: Que abrir un cliente sea una navegación real —el back vuelve **al listado de Clientes** con su búsqueda y filtros intactos, y la URL del detalle se recarga y se comparte— gobernada por **un único** helper compartido que decide cuándo un cambio de vista empuja entrada, cuándo la reemplaza y cuándo la consume.

**Depends on**: Nothing (first phase)

**Requirements**: NAV-01, NAV-02, NAV-05, NAV-06

**Success Criteria** (qué tiene que ser VERDAD):

  1. **El recorrido del bug queda cerrado:** Finanzas → menú hamburguesa → Clientes → abrir un cliente → el back vuelve **al listado de Clientes**, y el listado aparece con la búsqueda y los tres filtros (estado, profesional, obra social) **tal como estaban** — no reseteados y no en Finanzas (NAV-01). Observable en un celular real; y en DevTools la entrada del detalle existe en el historial.
  2. **La URL del detalle es de verdad:** recargar con F5 la URL de un cliente abre ese cliente; la misma URL pegada en otra pestaña del mismo dueño abre el mismo cliente. Un id **inexistente** y un id **de otro negocio** producen exactamente el mismo resultado observable (vuelta al listado o 404, sin diferencia entre "no existe" y "no es tuyo") y toda lectura sigue acotada por `business_id` (NAV-02).
  3. **La regla de push-vs-replace es observable, no teórica:** cerrar el detalle por el "Volver" de mobile (`clients-client.tsx:1204-1206`) o por la ✕ no deja entradas basura — no hace falta apretar el back dos veces para salir de Clientes; y la re-selección **automática** de cliente después de fusionar duplicados (`clients-client.tsx:570`) **reemplaza** en vez de empujar, así que el back nunca lleva a la ficha de un cliente que se acaba de borrar (NAV-05).
  4. **Hay una sola forma de hacerlo:** existe un módulo compartido cuyas decisiones (`push` | `replace` | `none` | consumir) son **puras y están testeadas en vitest** (`environment: 'node'`, sin jsdom — mismo molde que `lib/unsaved-changes.test.ts` y `lib/landing/lightbox.test.ts`), y `grep -rE 'pushState|replaceState|history\.back' app/(dashboard)/clients/` da **cero** hits fuera del helper. El helper puede expresar también el caso `replace` de un filtro (el `activeLoc` de Agenda, T-3) aunque esta fase **no** lo consuma (NAV-05).
  5. **No se rompe nada de lo que ya funciona:** con un overlay de Clientes abierto (drawer de importar CSV, diálogo de borrar, de fusionar) el back **sigue cerrando el overlay** y no navega; `lib/overlay-history.ts` no se modifica y su suite sigue verde; con cambios sin guardar en Agenda el aviso de salida sigue apareciendo igual que hoy (`lib/unsaved-changes.ts` y `components/dashboard/unsaved-changes-guard.tsx` sin cambios de comportamiento); y el resultado es **cero cambio visual** — el split de desktop (listado `lg:w-80` + detalle) y el "Volver" de mobile quedan idénticos (NAV-06).

**Fuera de alcance de esta fase** (explícito):

- Los tabs de `/negocio`, `/settings` y `/finances` → Phase 2.
- El `activeLoc` de Agenda (T-3): es un **filtro**, no una subsección, y Agenda es la única pantalla con `useUnsavedChanges`. El helper tiene que **poder** expresar su `replace`, pero la fase no lo cablea.
- El toggle `mobileView` edit/preview de `/web` (D-02).
- Interceptar `popstate`, empujar entradas falsas o reescribir historial para que el back "nunca cruce de sección" (D-01, y el límite ya documentado en `unsaved-changes-guard.tsx:21-25`).
- Tocar `lib/overlay-history.ts` o el guard de cambios sin guardar: la exigencia es **no empeorarlos**, no rediseñarlos.
- Cambiar el layout master-detail, agregar breadcrumb o rediseñar el header del detalle.
- Migraciones: **cero**. Nada de esta fase toca datos; la próxima migración libre sigue siendo la **080**.
- Rehacer el menú hamburguesa o la IA del sidebar.

**Riesgo y verificación**:

Riesgo **medio-alto** — es la fase que inventa el mecanismo y la única que toca la forma de la ruta. Los tres riesgos concretos:

- **(a) La elección de forma es la decisión de arranque del plan, y el criterio 1 es el que la arbitra.** Hay dos formas viables y el roadmap no la cierra: ruta hija `/clients/[id]` (precedente a mirrorear: `app/(crm)/admin/negocios/[id]`, T-4) **con el listado izado a un layout** para que preserve búsqueda y filtros (`03-layouts-and-pages.md:43`), o el id en query string sobre la misma ruta con la Native History API (`04-linking-and-navigating.md:341-345`), que no desmonta nada. Sin `<Activity>` (T-6) la variante ruta-hija **sin** layout pierde los filtros y falla el criterio 1: ese es el corte.
- **(b) Oracle de existencia cross-tenant.** Hoy el detalle se resuelve **contra la lista ya filtrada por `business_id`** (`clients-client.tsx:499`), así que un id ajeno simplemente no matchea: NAV-02 sale casi gratis. Si el plan pasa a leer por id en el server, hay que agregar el `.eq('business_id', business.id)` explícito + `notFound()`, o se abre el oracle. Es el único punto de la fase con relevancia de seguridad.
- **(c) Doble consumo de entradas con `overlay-history`.** El cierre del detalle y el cierre de un overlay pueden competir por la misma entrada. El precedente ya pagó ese bug tres veces y está documentado (las "tres cicatrices", `lib/overlay-history.ts`): la guarda es el marcador en `history.state` antes de cualquier `back()`. Se reusa el patrón, no se inventa otro.

Verificación: vitest sobre las decisiones puras del helper · `npm run lint` · `npx tsc --noEmit` (⚠ trampa conocida: `npx tsc` puede salir 0 falsamente — ver memoria `worktree-nodemodules-y-npx-tsc-traps`) · `npm run build` (por el punto de `useSearchParams` + Suspense) · **UAT manual en celular real** de los dos recorridos (Finanzas → Clientes → cliente → back; y recarga/compartir de la URL) + prueba con un id de otro negocio. ⚠ **Corregido 2026-09-29:** `auto_advance` está en `true` en `.planning/config.json` pero el workstream lo **pisa a `false`** (`.planning/workstreams/panel-nav/config.json`), así que el checkpoint humano **no** se auto-aprueba (la memoria `auto-advance-saltea-uat-visual` describe el riesgo general, no el estado de este workstream). Igual vale lo de fondo: este milestone **es** comportamiento del botón atrás en un celular, y sin abrir un teléfono real no hay evidencia de nada.

**UI-SPEC**: **no**, y está medido, no asumido. La flecha de volver **ya existe**: `clients-client.tsx:1204-1206` (`lg:hidden`, `ChevronLeft` + "Volver") cableada a `onBack` → hoy `setSelectedId(null)`, que pasa a llamar al helper. Y en desktop el listado nunca desaparece (split `lg:w-80` + detalle, `clients-client.tsx:586-591`), así que no hay pérdida de contexto que un breadcrumb tenga que compensar. El objetivo de la fase es **cero cambio visual** (criterio 5). **Lo que vuelve a abrir el gate:** si un plan propone cambiar el layout master-detail, hacer el detalle full-page en desktop, o agregar breadcrumb/header nuevo, eso **sí** es diseño y hay que pasar por `/gsd-ui-phase` antes de codear.

**Security/Integrity relevance**: Superficie autenticada del dashboard, sin cambios de esquema ni de policies. El único invariante en juego es el de lectura: un id de cliente que viene de la **URL** no es autorización — la garantía sigue siendo `business.id` resuelto por `owner_id` (`app/(dashboard)/clients/page.tsx:10-16`) y el filtro `.eq('business_id', business.id)` en cada query. No se expone nada a `anon` (el panel no es superficie pública) y no se toca el service role. Riesgo bajo salvo el punto (b) de arriba, que es el que un `secure-phase` tendría que mirar si se elige la variante con lectura por id en el server.

**Plans**: 1/2 plans executed

Plans:

- [x] 01-01-PLAN.md — El mecanismo (`lib/panel-history.ts`: 4 acciones × 6 causas, puro y testeado) nace junto con su primer consumidor: el detalle de cliente pasa a vivir en `/clients?c=<id>` (D-03), con `<Suspense>` en `page.tsx` y los cuatro cambios de vista declarados al helper — incluido el borrado (C-1)
- [ ] 01-02-PLAN.md — El candado de C-1: una suite pura que lee fuentes (molde `test/catalog-public.test.ts`) y se pone roja si el call site del borrado degrada su causa, si vuelve una mutación cruda de historial a `app/(dashboard)/clients/`, si el helper compone el state por propagación, o si deriva la clave de `lib/overlay-history.ts`

### Phase 2: Los tabs profundos sobre la misma regla

**Goal**: Que los tabs que hoy se comen el back —`/negocio` (Datos·Cobros·Integraciones·Notificaciones/Mail), `/settings` (Apariencia·Seguridad·Suscripción) y `/finances` (Turnos·Ventas·Egresos)— vivan en la URL consumiendo **el helper de la Phase 1**, sin alterar las otras tres rutas que comparten la misma pantalla de 4183 líneas y sin que el retorno del OAuth de MercadoPago aterrice en un tab que el dueño no pidió.

**Depends on**: Phase 1 (consume el helper de NAV-05; si esta fase resolviera los tabs por su cuenta, el helper pasaría a documentar dos dialectos)

**Requirements**: NAV-03, NAV-04

**Success Criteria** (qué tiene que ser VERDAD):

  1. **Los tabs son destinos:** en `/negocio` y en `/settings`, cambiar de tab cambia la URL, el back vuelve **al tab anterior** (no a la sección anterior) y pegar o recargar la URL abre ese tab. Un valor de tab ausente o inválido cae al default de hoy sin pantalla vacía (`business` en Negocio, `appearance` en Configuración — `settings-client.tsx:996-999`) (NAV-03).
  2. **T-1 respetado — las otras tres rutas no se mueven:** `/servicios`, `/equipo` y `/consultorios`, que renderizan el **mismo** `settings-client.tsx` vía la prop `view`, se comportan exactamente igual que hoy: no ganan tab en la URL, no cambian de default, no aparece ninguna `TabsList` nueva y su `onTabChange` sigue en `undefined` (`settings-client.tsx:993-1003`) (NAV-03).
  3. **T-2 reconciliado — el OAuth no pierde su tab:** volver del OAuth de MercadoPago (`/negocio?mp=connected`) sigue mostrando el toast y aterriza en **Integraciones**; la limpieza de la URL ya no pisa el tab (hoy `window.history.replaceState(null, '', '/negocio')` en `settings-client.tsx:1021` corre justo después de forzar el tab y lo borraría). Mismo criterio para `?google=connected|error` y para las ramas de error. El dueño nunca vuelve del OAuth a Datos (NAV-03).
  4. **Finanzas, con su botón de alta coherente:** en `/finances` los tabs Turnos·Ventas·Egresos viven en la URL con el mismo criterio, y el botón de alta sigue correspondiendo al tab visible — "Nueva venta" sólo en Ventas y "Nuevo egreso" sólo en Egresos (`finances-client.tsx:878-879`), incluso al entrar directo por URL o al volver con el back (NAV-04).
  5. **Cero dialecto nuevo y cero regresión:** los tres grupos de tabs consumen el helper de la Phase 1 — `grep -rE 'pushState|replaceState|history\.back' app/(dashboard)/settings/settings-client.tsx app/(dashboard)/finances/finances-client.tsx` da cero hits fuera del helper (la línea 1021 incluida: pasa a expresarse como una decisión `replace` del helper) — el back sigue cerrando los overlays de esas pantallas, y `npm run build` no falla por `useSearchParams` sin `Suspense`.

**Fuera de alcance de esta fase** (explícito):

- El `activeLoc` de Agenda (T-3). Sigue siendo un filtro y Agenda sigue siendo la única pantalla con `useUnsavedChanges`: empujar historia en cada cambio de sucursal volvería insoportable editar horarios. Si algún día entra, entra con **`replace`** y el helper de la Phase 1 ya lo puede expresar.
- Reorganizar los tabs, renombrarlos o mover contenido entre tabs: esto es routing, no IA. El milestone es el back, no la navegación de entrada.
- Extender `useUnsavedChanges` a `/settings`, `/negocio`, `/servicios` o `/web` (decisión aparte, ya declarada en `unsaved-changes-guard.tsx:30-32`).
- El toggle `mobileView` de `/web` (D-02).
- Migraciones: **cero**. La próxima libre sigue siendo la **080**.

**Riesgo y verificación**:

Riesgo **medio**, y todo el riesgo es **radio de impacto**, no mecanismo (el mecanismo ya quedó probado en la Phase 1):

- **T-1 es el riesgo principal:** un solo archivo de 4183 líneas sirve 5 rutas. Un cambio en el par `tabValue`/`onTabChange` (líneas 1002-1003) toca las cinco. El criterio 2 existe para que la no-regresión de `/servicios`, `/equipo` y `/consultorios` se verifique a mano, ruta por ruta, y no por inspección.
- **T-2 es el riesgo silencioso:** el efecto del OAuth (líneas 1009-1022) fuerza el tab y **después** reescribe la URL. Con el tab en la URL, ese orden lo borra. Es una regresión que sólo se ve **volviendo de verdad del OAuth**, no navegando a mano.
- **El `replaceState` del OAuth no desaparece, se reencuadra:** no es "reescribir historial" en el sentido de D-01 (no saca entradas ajenas ni pelea con el back) — es limpiar la query de un redirect externo. Pasa a ser una decisión `replace` del helper en vez de una llamada cruda.

Verificación: recorrido manual por **las 5 rutas** de `settings-client.tsx` + las 3 tabs de Finanzas, con back y con URL pegada · recorrido de retorno del OAuth con `?mp=connected` / `?mp=error` / `?google=connected` (el de MP hay que probarlo donde MP vuelve de verdad: staging o prod, no local) · vitest (el helper ya tiene sus decisiones cubiertas; los casos nuevos de tab se suman ahí) · `npm run lint` · `npx tsc --noEmit` · `npm run build`.

**UI-SPEC**: **no**. Los tres grupos de tabs ya existen, con su markup, su `TabsList` y sus defaults (`settings-client.tsx:2399-2419`, `finances-client.tsx:871`). Sólo cambia **de dónde sale el valor** del tab: de `useState` a la URL. Cero pixel nuevo, cero componente nuevo. El gate se reabre sólo si un plan propone reorganizar o renombrar tabs — que además está fuera de alcance.

**Security/Integrity relevance**: Superficie autenticada, sin cambios de esquema ni policies. Un valor de tab que viene de la URL es un **string del cliente**: hay que validarlo contra la lista cerrada de tabs y caer al default, nunca usarlo para elegir qué se lee (el criterio 1 lo exige). `/negocio` y `/settings` muestran secretos del dueño (`getBusinessSecrets`, service role) resueltos por `owner_id` **antes** de cualquier tab: el tab decide qué se **muestra**, nunca qué se **lee**, así que el aislamiento por tenant no cambia. Riesgo bajo.

## Cobertura de requisitos

| Requisito | Fase | Por qué ahí |
|---|---|---|
| NAV-01 | Phase 1 | Es el bug reportado (Bug B) y la superficie que exige los casos difíciles del helper. |
| NAV-02 | Phase 1 | Misma superficie; la URL compartible y el id ajeno se resuelven en el mismo cambio. |
| NAV-03 | Phase 2 | Los dos grupos de tabs de `settings-client.tsx`, con T-1 y T-2 aislados en su propia fase. |
| NAV-04 | Phase 2 | Mismo mecanismo que NAV-03, otra pantalla; separarlo sería una fase de un requisito. |
| NAV-05 | Phase 1 | **Cimiento.** Nace con su primer consumidor (el difícil), no al final. Ver Overview. |
| NAV-06 | Phase 1 | Es el **contrato del helper**, y el contrato se fija cuando el helper nace. La Phase 2 lo hereda por construcción: su criterio 5 exige que toda escritura de historial pase por el helper (grep = cero hits fuera), así que no puede introducir una segunda forma de tocar el historial que se lo saltee. |

**Coverage:** 6/6 requisitos mapeados · sin asignar: 0 · duplicados: 0

## Restricciones transversales (valen para las dos fases)

- **D-01:** rutas/URL reales. **Cero** intercepción de `popstate`, cero entradas falsas, cero reescritura de historial para forzar que el back no cruce de sección. Eso quedó **fuera de alcance del milestone** (registrado como decisión, no como gap).
- **Cero migraciones.** Nada de este milestone toca datos. La próxima migración libre sigue siendo la **080**. Si una fase parece necesitar una, está mal cortada.
- **`lib/overlay-history.ts` no se modifica.** Su `pushState` depende de que Next le copie `__NA` adentro del state: el helper nuevo tiene que empujar por el **mismo** `window.history.pushState` parcheado, nunca por una referencia original guardada aparte.
- **Next 16.2.7, no 14.** `proxy.ts`, no `middleware.ts`. Toda decisión de routing se cita contra `node_modules/next/dist/docs/` (ver tabla de hechos verificados).
- **Sin paquetes nuevos** y sin jsdom: los tests son de decisiones **puras** en `environment: 'node'`, con el molde de `lib/unsaved-changes.test.ts` y `lib/landing/lightbox.test.ts`.
- **Windows + PowerShell** para los comandos locales.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. El detalle de cliente, con la regla de historial que lo gobierna | 1/2 | In Progress|  |
| 2. Los tabs profundos sobre la misma regla | 0/? | Not started | - |
