# Phase 23: El panel que organiza el catálogo - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Que el dueño **use** desde el panel lo que la Phase 22 volvió declarable. En la pantalla donde ya
administra sus servicios (`/servicios`, servida por `settings-client.tsx`, que también sirve
`/settings`): crear, renombrar y borrar categorías; asignarle **una o ninguna** a cada servicio —y
asignar **no es obligatorio en ningún punto del flujo**, que es lo que mantiene vivo el camino de
CAT-07—; reordenar **arrastrando y con ▲/▼**; elegir los dos modos de orden para todo el negocio; y
cargar la **descripción corta** (CAT-11), hoy una columna muerta que sólo se escribe por SQL.

**Requisitos:** CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-11.

**Fuera de esta fase:** toda la superficie pública (`booking-client.tsx`, `app/[slug]/page.tsx`) es la
Phase 24. El modelo entero ya está instalado por las migr. **078/079** — esta fase **no agrega
migraciones** (ver D-09, que es la decisión que lo sostiene).

</domain>

<decisions>
## Implementation Decisions

### Dónde vive el organizador

- **D-01:** El organizador de categorías es una **Card colapsable** dentro de `/servicios`, en un
  **componente propio** bajo `components/dashboard/` — molde exacto de
  `components/dashboard/canchas-manager.tsx`, que ya es un bloque extraído de `settings-client.tsx`
  y renderizado dentro de esta misma vista. NO se agrega el bloque inline al archivo de 3636 líneas.
  Se descartó el **diálogo**: drag-and-drop dentro de un overlay con scroll interno es una capa más
  sobre el arrastre, y el repo ya tiene el precedente de controles que se rompen dentro de overlays
  en mobile (el bug del Select dentro del Drawer). — **Reversibility:** reversible — es un componente
  nuevo, sin contrato con nada.

- **D-02:** La Card arranca **colapsada si el negocio tiene cero categorías y abierta si tiene al
  menos una**. Con cero categorías —el estado de **todos** los negocios de producción el día del
  deploy— la pantalla no cambia de alto ni gana ruido; al que ya las creó le importan, así que las
  ve. El header lleva el conteo. Se descartó recordar la elección en `localStorage`: es estado por
  navegador (en el celular vuelve a cerrada) por una sola Card. — **Reversibility:** reversible.

- **D-03:** Los **dos selectores de modo de orden van cada uno donde actúa**: el de **categorías**
  dentro de la Card de categorías (que es donde se arrastra), el de **servicios** arriba de la lista
  de servicios (que es lo que ordena). Son columnas de `businesses` y valen para todo el negocio,
  así que el copy tiene que decirlo — pero ninguno queda escondido detrás del colapso, y el de
  servicios sirve **incluso con cero categorías**. Se descartó mandarlos a la config del negocio:
  rompe el ciclo de feedback (se configura en una pantalla y se ve en otra). — **Reversibility:** reversible.

- **D-04:** Borrar una categoría abre **confirmación con el conteo**: dice cuántos servicios quedan
  sin categoría y que **siguen activos y reservables**. La base ya lo garantiza (`ON DELETE SET NULL`
  sobre `category_id`, migr. 078), pero el miedo del dueño al apretar Eliminar es exactamente "¿se me
  borran los servicios?". Molde de los ConfirmDialog que la pantalla ya usa (borrar servicio cuenta
  los turnos futuros). Se descartó el borrado directo con "Deshacer": deshacer tendría que recrear la
  categoría **y** reasignar los servicios — un camino de escritura nuevo que la fase no presupuesta.
  ⚠ Al implementarlo, respetar el gotcha del repo: las acciones del ConfirmDialog **auditan y
  retornan**, nunca `redirect()`. — **Reversibility:** reversible.

### Cómo se asigna la categoría a un servicio

- **D-05:** Hay **dos caminos** para asignar, deliberadamente: (a) un **Select "Categoría"** con
  opción "Sin categoría" en el alta y en el diálogo de edición del servicio —el camino **accesible y
  universal**, que funciona en mobile y con teclado—, y (b) **arrastrar** dentro del organizador —el
  **atajo de desktop** para reorganizar en lote. No son redundantes: son el accesible y el rápido.
  ⚠ "Sin categoría" es una **opción real y siempre disponible** del Select, nunca un estado al que
  sólo se llega por omisión: es lo que hace verdadero a CAT-02 ("asignar no es obligatorio en ningún
  punto del flujo"). — **Reversibility:** reversible.

- **D-06:** El arrastre vive **contenido en la Card**, como **chips compactos** (sólo el nombre) bajo
  cada categoría, **más un grupo "Sin categoría" al final** con los servicios huérfanos. La lista de
  servicios de abajo **NO se toca**: sigue con precio, duración, cupo, cobertura y acciones tal como
  está hoy. *(Decisión delegada a Claude — el usuario eligió "vos decidís".)* Razones: el grupo de
  sueltos es lo que **hace posible asignar en lote** (sin él no hay de dónde arrastrar) y hace
  visible el estado que CAT-02 declara válido y permanente; y mantener el arrastre fuera de la lista
  existente deja intacta la región más cargada y más peleada de `settings-client.tsx` (la tarjeta de
  servicio, con su invariante de 32px de G-04 y su estructura de grilla documentada línea por línea).
  Se descartó **agrupar la lista de abajo**: obligaba a reescribir esa región entera.
  **Costo aceptado:** los nombres de los servicios aparecen en dos lugares de la pantalla (chips
  arriba, tarjetas abajo). — **Reversibility:** reversible.

- **D-07:** Cada chip, además de arrastrable, tiene un menú **"Mover a…"** que lista las categorías +
  "Sin categoría". Arrastrar no funciona en mobile ni con teclado —es el mismo motivo por el que
  CAT-03 exige ▲/▼ para las categorías—, así que asignar **en lote** tiene que funcionar igual en
  mobile que en desktop, sin salir de la Card.
  ⚠ **RESTRICCIÓN DURA:** quedan **tres** superficies que escriben `services.category_id` (Select del
  form, arrastre, menú "Mover a…"). Las tres pasan por **UNA sola función de escritura**, nunca por
  tres implementaciones. Tres caminos escribiendo la misma columna con lógica propia es el molde de
  bug que esta fase no puede permitirse. — **Reversibility:** costly — tres call sites ya apuntando
  a lógica duplicada son caros de unificar después.

### Cómo se persiste el orden

- **D-08:** **Los dos ejes se reordenan a mano.** Categorías: drag + ▲/▼ (CAT-03). Servicios: el
  **mismo mecanismo** dentro de su grupo. Motivo: `service_sort_mode` viene con **DEFAULT 'custom'**
  en la migr. 078 — sin UI de arrastre, el modo por default del negocio sería el único que no se
  puede arreglar, y el selector diría "personalizado" sin ofrecer personalizar. — **Reversibility:** reversible.

- **D-09:** **Escritura mixta, cero migraciones.** *(Decisión delegada a Claude — el usuario eligió
  "vos decidís", con los tres caminos y sus costos sobre la mesa.)*
  - **Categorías:** un solo `.upsert(filasRenumeradas, { onConflict: 'id' })` — una sentencia SQL, o
    sea **atómica por definición**. Precedente en el repo: `app/(dashboard)/agenda/agenda-client.tsx:801`
    (`schedule_exceptions`). La RLS sigue aplicando: las policies `insert` y `update` de
    `service_categories` (migr. 078) chequean `business_id` por `owner_id`, así que un `business_id`
    forjado se rechaza.
  - **Servicios:** N updates de **SÓLO `sort_order`** (`.update({ sort_order }).eq('id', …).eq('business_id', …)`).
    ⚠ **Acá NO se usa `upsert`**: `services` tiene `name`, `duration_minutes` y `price` **NOT NULL sin
    default** (`supabase/schema.sql:1411-1425`), así que un upsert obligaría a reenviar la fila entera
    desde el estado del cliente — un cliente con dato viejo **pisaría un precio** para tocar el orden.
    Ningún precio puede viajar en una operación de reordenamiento.

  **Por qué NO el RPC transaccional (migr. 080)**, que es lo que sugiere el roadmap citando
  `save_agenda_blocks` (migr. 074): acá la atomicidad protege una propiedad **cosmética y
  auto-reparable** (el orden de display), no un invariante de integridad — al revés que en
  `save_agenda_blocks`, donde una escritura a medias cambia la **disponibilidad real**. Mantener la
  fase en cero migraciones la deja como un **deploy de app puro**: sin paso manual en producción, sin
  coordinación con el deploy y sin la trampa del `NOTIFY pgrst, 'reload schema'` (el fail-safe que
  documentaron la 059 y la 074). El requisito duro que marca el roadmap —"un solo camino que no pueda
  renumerar filas de otro negocio"— se cumple igual con **un único mutador compartido por eje**.
  **El RPC queda documentado como el upgrade** si alguna vez aparece un reporte real de orden a medias.
  — **Reversibility:** reversible — migrar después a un RPC no cambia ningún dato ni ningún contrato
  público; es reemplazar el cuerpo de dos funciones del cliente.

- **D-10:** **Dos condiciones solidarias de D-09, no opcionales:**
  1. **Un solo mutador por eje**, con `.eq('business_id', business.id)` **siempre puesto** (defensa en
     profundidad sobre la RLS, como toda query del panel). Renumera **la lista completa de hermanas**
     — nunca swaps sueltos, que dejan huecos y empates (CAT-03).
  2. **Un fallo parcial NO puede quedar silencioso.** Si alguno de los N updates falla: se **re-lee el
     orden real de la base**, se pinta eso (no el estado optimista) y se avisa al dueño que el orden
     **no se guardó**. Lo que el dueño ve tiene que ser lo que está guardado — el molde es el
     `[agenda/save-hours]` de `agenda-client.tsx:647-670`, que ante el rechazo **no toca el estado
     local** y muestra copy propia. — **Reversibility:** reversible.

- **D-11:** **Cambiar de modo NO persiste ningún orden.** El modo sólo elige un comparador dentro de
  `groupCatalog()`, que es **puro y no escribe** — así es como la Phase 22 garantizó CAT-06 por
  construcción. Si el panel escribiera `sort_order` al cambiar de modo, rompería CAT-06, que ya está
  entregado y verificado. — **Reversibility:** one-way — romper CAT-06 destruye el arreglo manual del
  dueño de forma irrecuperable: el orden viejo no está en ningún lado para restaurarlo.

- **D-12:** Con un modo **distinto de 'custom'**, los controles de reordenar (drag handles y ▲/▼)
  **no se renderizan** — no se deshabilitan, no se atenúan: no están (CAT-05). Un arrastre que no
  hace nada se lee como roto. Aplica **por eje, independientemente**: `category_sort_mode='alpha'`
  apaga los controles de categorías y deja vivos los de servicios si `service_sort_mode='custom'`.
  — **Reversibility:** reversible.

### Claude's Discretion

- **CAT-11 — la descripción corta.** El usuario delegó las dos decisiones al planner. Guía
  recomendada (no es un lock; el planner puede apartarse con motivo escrito):
  - **Dónde:** en el **alta y en el diálogo de edición**, espejados. Es el patrón declarado del
    archivo — el diálogo de edición "reusa el form de alta" (comentario en `settings-client.tsx`
    sobre el `Dialog` de editar servicio), y romper el espejo deja un campo que sólo existe en una de
    las dos operaciones.
  - **El tope de 120:** **duro** (`maxLength={120}`) con **contador visible desde el arranque**
    ("0/120"), no sólo al acercarse al límite. El sentido del 120 es que **lo que el dueño escribe sea
    exactamente lo que la tarjeta deja ver** a 375px con el `line-clamp-2` que ya está en producción
    (`booking-client.tsx:610`). Un tope blando devuelve justo el problema que el número viene a
    resolver: recortarle sin avisar.
  - **Recordar:** `services.description` **ya existe**, `public_services` **ya la expone** y la tarjeta
    **ya la renderiza**. Esta fase agrega **sólo el campo del panel**. No tocar la superficie pública.

- Las decisiones D-06 y D-09 también salieron de "vos decidís" — están escritas arriba como decisiones cerradas,
  con el razonamiento completo, porque el planner necesita el *porqué* para poder apartarse con causa.

### Reviewed Todos (not folded)

El matcher de todos devolvió 4 candidatos; **ninguno se incorporó** — los cuatro son falsos positivos
por keywords genéricas, del motor de reservas y de backstops de seguridad de milestones anteriores.
Ver `<deferred>`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### El modelo que esta fase consume (Phase 22 — leer ANTES de escribir nada)
- `supabase/migrations/078_service_categories.sql` — La tabla `service_categories` (RLS + 4 policies
  por `owner_id`, **sin policy `anon`**), `services.category_id` nullable con **FK compuesta**
  `(category_id, business_id)` y `ON DELETE SET NULL (category_id)`, `services.sort_order` DEFAULT 0,
  `businesses.category_sort_mode` (`custom|alpha`, DEFAULT `custom`) y `businesses.service_sort_mode`
  (`custom|alpha|price`, DEFAULT `custom`) con sus CHECK, y la vista acotada `public_service_categories`.
- `supabase/migrations/079_service_categories_name_normalized.sql` — El único de nombre **normalizado**:
  `(business_id, lower(btrim(name)))` + CHECK `name` no-blanco. **Es el que rechaza el duplicado de
  CAT-01**, y su código de error es lo que el panel tiene que mapear a copy propia.
- `lib/service-categories.ts` — El **módulo puro** con `groupCatalog()`, los comparadores de los dos
  ejes, `DEFAULT_SORT_MODES` y `OTHER_GROUP_TITLE`. **PROHIBIDO reimplementar la regla de agrupar u
  ordenar en el panel**: si el panel necesita mostrar el catálogo agrupado, llama a esta función.
- `lib/types.ts` — `ServiceCategory`, `Service` (con `category_id`/`sort_order`), y
  `Business.category_sort_mode` / `Business.service_sort_mode` (los dos **opcionales** en el tipo:
  pasar `undefined` a `groupCatalog` cae al default campo por campo, a propósito).

### La superficie que se toca
- `app/(dashboard)/servicios/page.tsx` — El RSC. Acá entran las **lecturas nuevas** (categorías del
  negocio) sumadas al `Promise.all` existente, cada una con `.eq('business_id', business.id)`.
- `app/(dashboard)/settings/settings-client.tsx` — **3636 líneas.** La vista de servicios vive acá
  (`view === 'servicios'`), y la misma pantalla la sirve también `/settings`. Regiones relevantes:
  lista de servicios ≈`:2494-2710`, form de alta ≈`:2713-2770`, diálogo de edición ≈`:2772+`.
  ⚠ La tarjeta de servicio tiene su estructura de grilla **documentada línea por línea** con el motivo
  de cada decisión (invariante de 32px de G-04, columnas explícitas): **no se refactoriza de paso**.
- `components/dashboard/canchas-manager.tsx` — **El molde estructural de D-01**: cómo se extrae un
  bloque nuevo de esta pantalla a componente propio y se renderiza dentro de la vista.
- `components/dashboard/active-tabs.tsx` — Las píldoras de filtro activos/desactivados que la lista ya usa.

### El patrón de reordenar (se PORTA, no se copia — D-07 del milestone)
- `../forjo-tiendas/app/(consola)/(panel)/categorias/Organizador.tsx` — `onDragStart`/`onDrop`
  (`:260`, `:597`), botones ▲/▼ con `aria-label` (`:392-414`), renumerado de la lista completa (`:125`).
- `../forjo-tiendas/app/(consola)/(panel)/categorias/acciones.ts` — `reordenarCategorias` (`:181`) y
  `reordenarProductos` (`:244`). ⚠ **Allá hacen N updates con `Promise.all`, sin atomicidad** — eso
  es exactamente lo que D-09 reemplaza para el eje categorías.
  ⚠ Las columnas de allá están en **español** (`tienda_id`, `nombre`, `orden`) y el esquema de RLS es
  otro: se porta la **forma** (dos mecanismos conviviendo, cero dependencias de drag-and-drop), **nunca
  el código**.

### Precedentes de escritura del repo
- `app/(dashboard)/agenda/agenda-client.tsx:801` — `.upsert(rows, { onConflict })` multi-fila. **El
  precedente de D-09 para el eje categorías.**
- `app/(dashboard)/agenda/agenda-client.tsx:640-675` — El molde del **rechazo honesto**: se registra el
  **código** de error (nunca el mensaje), se mapea a copy propia, y el **estado local no se toca**. Es
  el molde de D-10.2 y del rechazo del nombre duplicado (CAT-01).
- `supabase/migrations/074_save_agenda_blocks.sql` — El RPC transaccional `SECURITY INVOKER` +
  `REVOKE EXECUTE ... FROM anon` + `GRANT ... TO authenticated`. **Es el camino que D-09 descartó, y
  el upgrade documentado** si aparece un reporte real de orden parcial. Leerlo antes de proponer el RPC.

### Decisiones del milestone (LOCKED — no re-litigar)
- `.planning/notes/categorias-de-servicios.md` — El explore del 2026-09-15: el porqué de cada decisión.
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — CAT-01…CAT-11, "Fuera de alcance" y el
  reparto de requisitos entre fases.
- `.planning/workstreams/motor-reservas/STATE.md` §"Milestone v0.29 — decisiones LOCKED" — D-01…D-08.
- `.planning/workstreams/motor-reservas/ROADMAP.md` §"Phase 23" — goal, alcance y la nota de seguridad.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`lib/service-categories.ts` (`groupCatalog`)**: si el organizador muestra los chips agrupados,
  usa esta función. Ya resuelve "Otros" al final, la conservación (ningún servicio se pierde nunca) y
  el camino de identidad con cero categorías.
- **`components/dashboard/canchas-manager.tsx`**: el precedente de extraer un bloque de
  `settings-client.tsx` a componente propio con props tipadas, renderizado dentro de la vista.
- **`components/ui/dialog.tsx` + el patrón de scroll interno con pie anclado** ya aplicado por caller
  en el diálogo "Editar servicio" (UI-SPEC §3.1): si CAT-11 suma un campo a ese diálogo, el patrón ya
  está y no hay que tocarlo.
- **`ConfirmDialog`** del panel: molde para D-04. ⚠ Sus acciones **auditan y retornan**; navegan con
  `router.push`, **nunca con `redirect()`** (tira un toast espurio por `NEXT_REDIRECT`).
- **`sonner` (`toast`)**: el canal de feedback ya establecido en esta pantalla.

### Established Patterns
- **Toda query del panel filtra `.eq('business_id', business.id)`**, además de la RLS. Sin excepción.
- **El panel escribe con el cliente browser de Supabase**, no con server actions (el diálogo de editar
  servicio lo dice explícito). Las únicas server actions del dashboard viven en `/web` (landing).
- **Errores de constraint → copy propia, nunca el texto crudo de la base.** Se inspecciona `code`
  (`'23505'` para el único, `'23P01'` para exclusión) y se mapea a un mensaje escrito. T-14-25/T-13-09.
- **Texto crudo en el input + normalización en `onBlur`** (G-21-11): es lo que ya hacen duración y
  precio en el form de servicio. Aplica al nombre de categoría (el `btrim` de la 079 espeja esto).
- **Touch targets de 44px en mobile, 32 en desktop** (`h-11 w-11 sm:h-8 sm:w-8`): el molde que ya usan
  los botones de editar/eliminar de la tarjeta. Las ▲/▼ tienen que respetarlo.
- **Comentarios densos en español explicando el *porqué*** de lo no obvio, no el *qué*.

### Integration Points
- `app/(dashboard)/servicios/page.tsx` → nueva lectura de `service_categories` por tenant, sumada al
  `Promise.all`; baja como prop nueva a `SettingsClient`.
- `SettingsClient` → renderiza el organizador nuevo dentro de la rama `view === 'servicios'`,
  **`!isCanchas`** (el vertical canchas tiene su propio manager en esa misma rama).
  ⚠ **Decidir y dejar escrito si el organizador aplica al vertical canchas.** En canchas el "servicio"
  es una cancha (v0.13) y agrupar por categoría puede no tener sentido; el gate por vertical ya existe
  en ese punto del archivo.
- `businesses` → los dos `*_sort_mode` se escriben desde el panel; el prop `business` ya baja completo.
- **La Phase 24 consume lo que esta fase deja cargado.** Su criterio 1 exige verificar el agrupado con
  categorías creadas **desde el panel**, no sembradas por SQL: esta fase tiene que quedar usable de punta
  a punta para que la 24 pueda verificarse.

</code_context>

<specifics>
## Specific Ideas

- **"Sin categoría" es una opción real, no un vacío.** Aparece como opción del Select y como grupo al
  final del organizador. Es la lectura de CAT-02 en pantalla: el estado sin categoría es válido,
  permanente y visible — nunca un accidente.
- **Un arrastre que no hace nada se lee como roto** (D-12): por eso los controles desaparecen en vez de
  deshabilitarse.
- **Las flechas ▲/▼ no son un extra**: son lo que hace que reordenar funcione en mobile y con teclado.
  Mismo razonamiento detrás del menú "Mover a…" de D-07.
- **Ningún precio viaja en una operación de reordenamiento** (D-09).
- El organizador se mira contra `../forjo-tiendas/.../categorias/Organizador.tsx` para la **forma**
  de que los dos mecanismos convivan sin librerías de drag-and-drop.

</specifics>

<deferred>
## Deferred Ideas

- **Subcategorías (dos niveles).** Ya declarado fuera de alcance en REQUIREMENTS: `forjo-tiendas` las
  tiene porque un negocio llegó a 10 categorías y 39 productos; una peluquería con 12 servicios no.
  Se suman después sin re-migrar.
- **Modo de orden por categoría** (en vez de por negocio). Fuera de alcance del milestone (D-05 del
  explore). Si se pide, se agrega sin re-migrar.
- **RPC transaccional de reordenamiento (migr. 080).** No descartado: **diferido con condición de
  disparo** — se implementa si aparece un reporte real de orden guardado a medias. Ver D-09.
- **Recordar el estado abierto/cerrado de la Card por usuario.** Descartado en D-02 porque
  `localStorage` es por navegador; si alguna vez hay preferencias de UI por cuenta, entra ahí.
- **Arrastre táctil real para mover servicios entre categorías en mobile.** El menú "Mover a…" (D-07)
  cubre el caso de uso; un arrastre táctil real necesitaría una librería, que este repo evita a propósito.

### Reviewed Todos (not folded)

Los cuatro matches del cross-reference son **falsos positivos por keywords genéricas** — ninguno toca
el catálogo ni el panel de servicios. Se revisaron y se dejan donde están:

- `2026-08-16-una-persona-puede-ocupar-todos-los-cupos-de-una-clase.md` — Motor de cupos grupales
  (v0.26), no catálogo.
- `2026-08-18-el-filtro-por-tenant-del-gate-se-esquiva-moviendo-el-servicio.md` — Backstop de tenant
  sobre `services.business_id` en el gate de modo de cupo. Roza `services` pero es del motor, no del
  catálogo; incorporarlo sería scope creep sobre una fase de panel.
- `2026-09-11-el-eje-staff-no-tiene-backstop-server-side.md` — Backstop server-side del eje staff
  (v0.25/v0.28), territorio del booking.
- `2026-08-20-dos-clases-grupales-a-la-misma-hora-comparten-el-espacio-de-seat.md` — Constraint de
  `seat` en la base, motor de reservas.

</deferred>

---

*Phase: 23-El panel que organiza el catálogo*
*Context gathered: 2026-09-15*
