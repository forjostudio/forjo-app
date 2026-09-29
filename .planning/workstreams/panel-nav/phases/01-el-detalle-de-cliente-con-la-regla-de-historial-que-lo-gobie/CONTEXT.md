# Phase 1 — Contexto y decisiones

**Fase:** 1 · El detalle de cliente, con la regla de historial que lo gobierna
**Workstream:** `panel-nav` · **Milestone:** v0.30 La navegación del panel
**Requisitos:** NAV-01, NAV-02, NAV-05, NAV-06
**Capturado:** 2026-09-29

> Nota de proceso: esta fase **no** pasó por `/gsd-discuss-phase`. El dueño eligió planificar directo
> porque las decisiones de fondo ya estaban escritas antes de la fase: **D-01/D-02** y las **trampas
> T-1..T-6** viven en `REQUIREMENTS.md`, y el `ROADMAP.md` ya trae los 3 riesgos con su verificación.
> Este archivo agrega **la única decisión que el roadmap dejó abierta a propósito**, más lo que la
> gobierna.

## D-03 — El detalle vive en la QUERY, no en un segmento de ruta

**Decidido por el dueño el 2026-09-29.** La forma es `/clients?<param>=<id>` sobre la **misma** ruta,
usando la Native History API que Next 16 integra al router. **No** se crea `/clients/[id]`.

**Por qué esta y no la ruta hija** (las dos arreglan el back; lo que cambia es riesgo y tamaño):

1. **El criterio 1 sale gratis.** NAV-01 exige que el back devuelva el listado **con su búsqueda y sus
   tres filtros como estaban**. Con la query nada se desmonta, así que se preserva por construcción.
   La ruta hija sólo lo lograría izando el listado a un `layout`, lo que obliga a partir un componente
   de **1408 líneas** en layout + página.
2. **No se abre el oracle cross-tenant.** Hoy el detalle se resuelve **contra la lista ya filtrada por
   `business_id`** (`clients-client.tsx:499`), así que un id ajeno simplemente no matchea — sin
   diferencia observable entre "no existe" y "no es tuyo". La ruta hija empujaría a leer por id en el
   server, que exige `.eq('business_id', …)` + `notFound()` explícitos para no regalar un oracle de
   existencia. Es el riesgo (b) del roadmap, y esta decisión **lo cierra en vez de mitigarlo**.
3. **Está oficialmente soportado**, no es un hack: `window.history.pushState`/`replaceState` nativos
   se integran al router de Next y sincronizan con `useSearchParams`, sin recargar ni volver al server
   (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:341-345`).

**El costo, aceptado explícitamente:** la URL es menos linda que `/clients/abc-123`. Es barato acá —
el panel es privado y además **ya está `noindex`** (`app/robots.ts` + `lib/noindex.ts`, 2026-09-28),
así que no hay valor de SEO ni de "URL limpia" que perder. El precedente `app/(crm)/admin/negocios/[id]`
(T-4) queda como precedente **no aplicado**, y este archivo dice por qué.

⚠ **Lo que esta decisión NO autoriza:** no habilita meter cualquier estado de UI en la query. NAV-05
sigue mandando: hay **un** helper que decide `push` / `replace` / consumir, y todo pasa por ahí.

## Lo que ya estaba decidido y esta fase hereda

- **D-01 — Historia honesta.** Rutas/URLs reales; **cero** intercepción de `popstate`, cero entradas
  falsas, cero reescritura de historial. Acota a propósito el pedido original ("que el back nunca
  cruce de sección"). Ver `REQUIREMENTS.md`.
- **D-02 — Alcance.** Detalle de cliente + tabs profundos. Los tabs son la **Phase 2**.
- **T-3** — el `activeLoc` de Agenda queda afuera, pero el helper de NAV-05 tiene que **poder**
  expresar su caso `replace` aunque esta fase no lo cablee.
- **T-6** — React `<Activity>` **no** está activo (`cacheComponents` no está en `next.config.ts`).
  No contar con preservación de estado automática al navegar.

## Restricciones que el plan no puede negociar

- **Cero cambio visual** (criterio 5). El "Volver" de mobile ya existe
  (`clients-client.tsx:1204-1206`) y el split de desktop (`lg:w-80` + detalle,
  `clients-client.tsx:586-591`) queda idéntico. Si algo de esto se toca, **el gate de UI se reabre** y
  hay que pasar por `/gsd-ui-phase` antes de codear.
- **Cero migraciones.** La próxima libre sigue siendo la **080**.
- **Cero paquetes nuevos.**
- **No tocar** `lib/overlay-history.ts` ni el guard de cambios sin guardar. La exigencia de NAV-06 es
  **no empeorarlos**, no rediseñarlos. ⚠ Riesgo (c) del roadmap: el cierre del detalle y el de un
  overlay pueden competir por la misma entrada de historial. La guarda ya probada es **mirar el
  marcador de `history.state` antes de cualquier `back()`** — se reusa ese patrón, no se inventa otro.
- La suite y el typecheck tienen piso: `npx vitest run` ≥ **1392 passed / 98 archivos**, y el
  typecheck se corre con `./node_modules/.bin/tsc --noEmit` (⚠ **nunca `npx tsc`**: sale 0 falsamente).
  ⚠ Dos canarios de reloj fallan a propósito fuera de `[01:00, 23:30]` AR.

---

## Correcciones que trajo el research (2026-09-29) — el plan las hereda

El research verificó el código y encontró cuatro cosas que **contradicen** lo que estaba escrito. Ya
se corrigieron en `REQUIREMENTS.md` (T-5, + T-7 y T-8 nuevas). Lo que el plan tiene que asumir:

### C-1 — El helper tiene CUATRO acciones, no tres. La carrera está en el BORRADO, no en la fusión.

`deleteClient()` hace `setSelectedId(null)` (`clients-client.tsx:527`) y `setConfirmDelete(false)`
(`:528`) **en el mismo lote**, y ese `<Dialog>` (`:807`) participa de `lib/overlay-history.ts`. Como
`history.back()` es asincrónico, la entrada de arriba en ese instante es **la del overlay**: escribir
historial ahí le borra su marca, el overlay deja de hacer su `back()` y queda huérfana la entrada del
detalle ⇒ **el atrás lleva a la ficha de un cliente recién borrado**.

Es el mismo síntoma que el roadmap le temía a la fusión (`:570`), pero por un camino que **no estaba
anotado** — y que **no se arregla con `replace`**. El helper necesita una cuarta decisión (`none`) más
una regla de saneo posterior. **Verificado el 2026-09-29 leyendo las líneas citadas.**

La fusión (`:561-575`) sí es un `replace` limpio: no cierra su modal, así que no hay overlay
compitiendo.

### C-2 — Hay patrón del repo para `useSearchParams`, y el riesgo de build estaba sobreestimado

`plan-banner.tsx:22` ya usa `useSearchParams` en **todas** las rutas del panel, ya envuelto en
`<Suspense>` (`app/(dashboard)/layout.tsx:60-62`). Se copia ese molde. Además `/clients` **no se
prerenderiza** (su `page.tsx` usa `cookies()`), así que el bailout de build no puede dispararse. Se
envuelve igual porque son 3 líneas y es el patrón — no por miedo.

⚠ Consecuencia de forma: eso mete `app/(dashboard)/clients/page.tsx` en el diff, archivo que el
roadmap no menciona. Está bien; queda dicho acá.

### C-3 — En desktop el detalle NO se puede cerrar, y eso NO se arregla en esta fase

El único cierre es el "Volver" `lg:hidden` (`:1205`); en desktop el split deja el detalle siempre
visible (`:586-591`). El criterio 3 del roadmap menciona una "✕" que **no existe**.
⚠ **Agregar esa ✕ sería cambio visual y reabre el gate de UI.** El plan lee el criterio 3 como
"cerrar por el 'Volver' de mobile", y nada más.

### C-4 — Hay DOS `replaceState` crudos en el panel, no uno

`settings-client.tsx:1021` **y** `agenda-client.tsx:290`. Es T-7. Importa sobre todo para el grep de
la Phase 2, pero queda acá para que el inventario viva en un solo lugar.

### Abierto, que el plan decide y justifica

- Cambiar de cliente A→B: ¿`push` o `replace`? (el research recomienda `push`: es un destino).
- El saneo de la URL, ¿corre en un efecto con guarda de idempotencia? (recomienda sí, molde
  `holdingRef` de `overlay-history.ts`).
