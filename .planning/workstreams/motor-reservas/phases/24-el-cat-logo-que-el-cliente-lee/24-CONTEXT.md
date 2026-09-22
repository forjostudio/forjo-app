# Phase 24: El catálogo que el cliente lee - Context

**Gathered:** 2026-09-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Que la organización que el dueño le dio a su catálogo en el panel **llegue a la pantalla pública**: con al menos una categoría creada, el cliente ve los servicios agrupados bajo títulos, en el orden que el dueño definió, con los sueltos al final bajo "Otros" y nunca escondidos. Con cero categorías la pantalla es la de hoy. En la misma pasada, las tarjetas de desktop pasan de dos columnas a una a lo ancho, y el nombre largo deja de partirse.

**No entra:** el funnel no gana pasos (sigue siendo servicio → profesional → día → horario), no hay migraciones nuevas, no hay lecturas anónimas nuevas, y CAT-11 (el campo del panel) ya lo entregó la Phase 23.

</domain>

<decisions>
## Implementation Decisions

### Títulos de categoría

- **D-01:** Título **pelado**: solo el nombre en negrita, más chico que el `h2` de "Elegí tu servicio", con aire arriba para separar grupos. **Sin** línea divisoria y **sin** contador de servicios. *Motivo:* los títulos son un nivel de jerarquía nuevo en una pantalla que hoy solo tiene un `h2`, y no pueden robarle peso visual a las tarjetas, que son lo único clickeable. El contador además abriría una pregunta que nadie quiere responder: si cuenta o no los servicios deshabilitados.
- **D-02:** El título **scrollea con el contenido**. NO es sticky. *Motivo:* es lo que la pantalla hace hoy; un sticky obliga a resolver contra qué se pega (el header del negocio ya ocupa arriba) y suma z-index a una región cuyas capas ya están resueltas y bajo contrato — el pseudo-elemento del botón de selección y el `isolate` de la tarjeta (G-23-6, Phase 23).
- **D-03:** El grupo **"Otros" se ve idéntico a cualquier categoría real**: mismo título, mismo peso, mismas tarjetas. *Motivo:* el cliente no sabe ni le importa que al dueño le faltó clasificarlos. Un tratamiento más apagado degrada visualmente servicios que se venden igual, y CAT-09 existe precisamente para que un servicio sin categoría no se degrade.
- **D-04:** Jerarquía semántica: los títulos de grupo van **un nivel debajo** del `h2` existente ("Elegí tu servicio"), sin saltar niveles. *Nota:* decidido por convención del proyecto (accesibilidad no negociable), no por preferencia del usuario — el planner elige el tag concreto.

### La tarjeta horizontal en desktop

- **D-05:** Se **conserva la fila que ya existe** —nombre a la izquierda, precio y duración apilados a la derecha— y solo se estira: desaparece el `sm:grid-cols-2` y queda **una columna**. *Motivo:* es el cambio más chico posible; la fila ya existe, ya está centrada verticalmente (`items-center`) y ya funciona así en mobile. Con el ancho extra el nombre largo deja de partirse solo, que es literalmente lo que pide CAT-10. — **Reversibility:** reversible — es una clase de Tailwind en un solo `div`.
- **D-06:** El paso 1 **sigue en `max-w-lg`** (512px). No se ensancha ni el paso 1 solo ni el wizard completo. *Dato medido durante la discusión:* el wizard entero vive en `max-w-lg mx-auto px-6` (`booking-client.tsx:551`), así que "horizontal a lo ancho" significa pasar de dos columnas de **~194px útiles** a una de **~432px** — no tarjetas cruzando el viewport. *Motivo:* ensanchar solo el paso 1 haría que el wizard cambie de ancho al elegir un servicio (se lee como un salto); ensanchar los cuatro pasos obligaría a recalibrar calendario, horarios y confirmación, que es rediseñar el booking y está fuera de alcance.
- **D-07:** **Mobile no cambia nada.** *Motivo:* hoy la grilla ya es `grid-cols-1` abajo de `sm:`, así que el cambio es literalmente quitar el modificador `sm:` — mobile queda byte-idéntico, no "parecido".
- **D-08:** El "Ver más" de la descripción **no se toca**: sigue apareciendo solo si el texto desborda **medido** (`scrollHeight > clientHeight`, `ServiceDescription`). *Consecuencia esperada, no un bug:* con ~432px de ancho una descripción de 120 caracteres entra sin desbordar, así que en desktop el toggle prácticamente no va a aparecer; en mobile a 375px sigue apareciendo como hoy. Nada de volver a un recorte por cantidad de renglones fija.

### El orden

- **D-09:** El orden de la pantalla pública es **exactamente el que el dueño configuró en el panel**, en los dos ejes y con los tres modos: categorías (alfabético · personalizado) y servicios (alfabético · por precio · personalizado). Los dos valores salen de `public_businesses` (`category_sort_mode`, `service_sort_mode`) y se pasan a `groupCatalog`. *Confirmado explícitamente por el usuario al cierre de la discusión.*
- **D-10:** Los modos se pasan a `groupCatalog` **campo por campo con `??`**, NUNCA con spread (`{ ...DEFAULT_SORT_MODES, ...modes }`). *Motivo:* está escrito y explicado en `lib/service-categories.ts:270-280` — en `lib/types.ts` las dos columnas son opcionales, y el spread NO cae al default cuando la clave existe con valor `undefined`: la pisa. Hoy el resultado coincidiría con `'custom'` **por casualidad**, y el día que cambie un default sería un orden equivocado para todos los negocios, en silencio. Es la clase exacta de cambio que CAT-07 existe para impedir.

### Catálogo largo

- **D-11:** **Nada.** Sin índice de categorías, sin grupos colapsables, sin buscador: el paso 1 se scrollea. *Motivo:* el problema es teórico hasta que exista un negocio real con muchas categorías; una peluquería con 12 servicios se scrollea en diez segundos. Colapsar esconde servicios detrás de un click que nadie pidió (roza el espíritu de CAT-09) y un índice necesitaría gatearse por cantidad de categorías, o sea un umbral inventado que habría que elegir y defender.

### Grupos donde nada se puede reservar

- **D-12:** Una categoría con **todos** sus servicios deshabilitados se pinta **igual que cualquier otra**: su título normal y cada tarjeta con su motivo a la vista ("Sin horarios disponibles" / "Sin profesional disponible"), como ya hace hoy. Sin aviso en el título y sin mandar el grupo al final. *Motivo:* esconder o degradar ese grupo le oculta el problema de configuración justo al dueño, que es la única persona que puede arreglarlo — y él ve su propia web. Mandarlo al final rompería el orden que CAT-08 promete respetar, por un estado transitorio.

### El preview del panel (`/web`)

- **D-13:** El preview de `/web` tiene que mostrar el catálogo **como lo va a ver el cliente**: agrupado bajo títulos y con el ancho nuevo, no la lista plana del fallback. En concreto, ese call site **recibe las categorías y los modos de orden**. *Pedido explícito del usuario al cierre.* Esto va **más allá** del Success Criterion 5 del ROADMAP, que solo garantizaba que el preview no se rompa si el dato falta.
- **D-14:** **No hace falta escalar nada.** *Dato verificado durante la discusión:* `BookingClient` lleva su propio `max-w-lg mx-auto`, así que montado dentro del contenedor del panel (`max-w-[1400px]`) ya se renderiza al ancho real, 512px centrados. El preview es fiel por construcción; lo único que le faltaba era el dato.
- **D-15:** El `?? []` **se mantiene como red de seguridad** para el `LandingRenderer`, que no pasa la prop. *Motivo:* es el molde que ya usa `timeBlockServices` (`booking-client.tsx:566`) y el que sostiene el Success Criterion 5 — ante el dato ausente el default es la lista plana, **nunca un catálogo vacío**. D-13 (pasar el dato en `/web`) y D-15 (degradar bien cuando no llega) conviven: no son alternativas.

### Claude's Discretion

- El tag HTML concreto de los títulos de grupo, el espaciado exacto entre grupos y las clases de Tailwind: los resuelve el planner respetando D-01 a D-04 y los tokens del proyecto.
- Dónde exactamente cae la lectura de categorías dentro del `Promise.all` de `app/[slug]/page.tsx`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### El módulo puro que hace el trabajo (Phase 22)

- `lib/service-categories.ts` — `groupCatalog()`, `sortCategories()`, `OTHER_GROUP_TITLE`, `DEFAULT_SORT_MODES`, `CatalogGroup`. **Ya resuelve el agrupado, el orden en los dos ejes y los tres casos de borde.** La Phase 24 lo **consume**, no reimplementa nada de esto. Leer en particular: el contrato de `CatalogGroup` (`title: null` ES la regla "sin títulos" viviendo en el dato — un consumidor que recibe `title` nulo no *puede* pintar un encabezado, y eso hace que CAT-07 no dependa de que alguien se acuerde de escribir un `if`); la Regla 0 (sin servicios no hay grupos — **ningún grupo de la salida está vacío, nunca**); y el aviso de no-mutación de la entrada.
- `test/service-categories.test.ts` — la suite del módulo. Lo que ya está cubierto no se re-testea en esta fase.

### La región de código que se toca

- `app/[slug]/booking-client.tsx` — **una sola pasada** sobre la misma región: la grilla de tarjetas (`:567`) y el render de la descripción (`:640`). El bloque de comentarios de `:601-613` es el contrato G-23-6 de la tarjeta (contenedor + botón estirado con pseudo-elemento + toggle hermano) — **se conserva entero**.
- `app/[slug]/page.tsx` — el `Promise.all` de lecturas públicas (`:75`). Acá entra la lectura de categorías.
- `app/(dashboard)/web/page.tsx:182` — el call site del preview del panel (D-13).
- `components/landing/landing-renderer.tsx:53` — props congelados de `BookingClient`; el call site que **no** pasa la prop y depende del `?? []` (D-15).

### Contratos heredados que NO se pueden romper

- `.planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UI-SPEC.md` — el contrato de UI de la Phase 23. Leer la entrada **G-23-6** (la descripción a ancho completo con "Ver más" medido, y por qué nada interactivo puede anidarse en el botón de selección).
- `.planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-SECURITY.md` — el registro de amenazas de la fase anterior. Relevante acá: **T-23-06 / T-23-10 / T-23-26** (el nombre de categoría y la descripción son texto del dueño que lee un anónimo → interpolación JSX, auto-escape de React, **nunca** `dangerouslySetInnerHTML`).

### La base de datos (ya existe — nada que migrar)

- `supabase/migrations/078_service_categories.sql` — el modelo entero. **Verificado durante la discusión:** `public_services` ya expone `category_id`, `public_service_categories` existe como vista acotada con `GRANT SELECT` a `anon`, y `public_businesses` ya expone `category_sort_mode` y `service_sort_mode`. **La Phase 24 no necesita ninguna lectura anónima nueva ni ninguna migración**, así que NO se dispara la herencia de `secure-phase` que el ROADMAP advertía.

### El requisito

- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — CAT-08, CAT-09, CAT-10 (y la sección "Fuera de alcance", que ya descarta subcategorías, la categoría como paso del funnel y ocultar servicios con la categoría).
- `.planning/workstreams/motor-reservas/ROADMAP.md` §"Phase 24" — los 5 Success Criteria.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`groupCatalog()` / `sortCategories()`** (`lib/service-categories.ts`): puros, testeados y escritos exactamente para este consumo. Le pasás servicios + categorías + modos y devuelve `CatalogGroup[]`. El JSX solo itera grupos y pinta `group.title` cuando no es nulo.
- **`ServiceDescription`** (`components/booking/service-description.tsx`): ya resuelve el recorte medido con "Ver más". No se toca.
- **`hasScheduleCoverage` / `isServiceStaffed`**: los dos ejes de cobertura por servicio, ya en uso en la tarjeta. Siguen igual — D-12 depende de que cada tarjeta conserve su motivo.

### Established Patterns

- **El default ante el dato ausente es degradar, nunca apagar.** El `?? []` de `timeBlockServices` (`:566`) es el molde, y el comentario de `groupCatalog` documenta que este modo de falla —un helper que responde "no" para todo y apaga el catálogo entero en silencio— **ya mordió dos veces en este repo** (CR-01 del code review de la Phase 20, y otra vez en la 21). Cualquier código nuevo de esta fase se sostiene con esa regla.
- **La lectura pública va por vistas acotadas, con `.eq('business_id', ...)`**, como las otras del `Promise.all`. Nunca la tabla base con anon key.
- **La tarjeta es un contenedor, no un botón** (G-23-6). Cualquier cosa interactiva que se agregue va como hermana del botón de selección, nunca adentro.

### Integration Points

- `app/[slug]/page.tsx` — una lectura más en el `Promise.all` (`public_service_categories`) y dos props más a `BookingClient`.
- `app/[slug]/booking-client.tsx` — la grilla pasa de `services.map` a iterar grupos; la tarjeta en sí no cambia salvo el ancho.
- `app/(dashboard)/web/page.tsx:182` — el preview recibe el mismo dato (D-13).
- `components/landing/landing-renderer.tsx` — no cambia; depende del default (D-15).

</code_context>

<specifics>
## Specific Ideas

- **"Que se vea escalado con el ancho nuevo a como se va a ver originalmente"** (sobre el preview de `/web`). Intención: el preview tiene que ser **fiel**, no una variante apretada. Resuelto por D-13 + D-14 — resulta que no hace falta escalar nada porque el componente se auto-restringe a `max-w-lg`; lo único que le faltaba al preview era recibir las categorías.
- **"El orden es el mismo configurado en el panel: alfabético, por precio, personalizado"** — confirmación explícita de que los tres modos y los dos ejes se respetan tal cual (D-09).

</specifics>

<deferred>
## Deferred Ideas

- **Índice de categorías arriba del paso 1** (chips con los nombres que saltan a su grupo). Útil solo en un catálogo largo; en un negocio con dos categorías es ruido puro. Necesitaría gatearse por cantidad de categorías, y ese umbral es un número inventado. **Se reevalúa cuando exista un negocio real con muchas categorías** — no antes.
- **Grupos colapsables.** Si arrancan abiertos no cambia nada; si arrancan cerrados el catálogo arranca vacío y los servicios quedan detrás de un click que nadie pidió, lo que roza el espíritu de CAT-09.
- **Aviso de "sin disponibilidad" en el título del grupo.** Duplicaría en el título un motivo que cada tarjeta ya explica mejor, y exigiría cruzar los dos ejes de cobertura dentro del JSX para un caso de borde.

### Reviewed Todos (not folded)

- **"Una sola persona puede ocupar todos los cupos de una clase grupal"** (`.planning/todos/pending/2026-08-16-...md`) — matcheó por keywords y por área (`booking`), pero es del motor de cupos, no del catálogo. Fuera de dominio.
- **"El gate de modo se esquiva moviendo `services.business_id` a otro negocio propio"** (`.planning/todos/pending/2026-08-18-...md`) — matcheó por keywords (`business`, `secure`, `phase`), pero es un gate de escritura del panel. Esta fase no abre ninguna superficie de escritura. Fuera de dominio.

</deferred>

---

*Phase: 24-el-catálogo-que-el-cliente-lee*
*Context gathered: 2026-09-22*
