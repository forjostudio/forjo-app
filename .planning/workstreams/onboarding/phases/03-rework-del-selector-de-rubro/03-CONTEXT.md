# Phase 3: Rework del selector de rubro - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Simplificar el **selector de rubro** a **4 opciones** (los 4 `VerticalKey` que ya existen) + un
**campo personalizable de texto libre SIEMPRE visible** con **sugerencia por rubro** (placeholder
"Ej: …") y una **leyenda** debajo. Aplica a **dos superficies**: el **onboarding** (paso "Tu negocio")
y la **configuración del negocio en el dashboard** (Configuración → Negocio). El **rubro elegido**
resuelve el vertical (terminología / menú / features); el **texto libre** se guarda y se **muestra
como categoría del negocio en la página pública de reservas** ("así aparecerá…").

**Fuera de scope:** no se agregan pasos nuevos al onboarding; no se toca el motor de agenda/booking; no
se rediseña la página de reservas (solo el subtítulo de categoría, que YA existe). Esta fase corrige de
paso el bug del campo de "Otro" que hoy no aparece (queda resuelto por el campo siempre visible).

**Naturaleza del riesgo:** Bajo-Medio (REGRESIÓN, no aislamiento). Rubro/`type`/`vertical` ya viven bajo
`business_id`. El riesgo es no cambiar el vertical resuelto de negocios YA creados al limpiar los
subtipos (ver D-08). Casi no hay data en prod (Phase 2 CONTEXT D-01), lo que acota el riesgo real.
</domain>

<decisions>
## Implementation Decisions

### Los 4 rubros (selector)
- **D-01:** El selector muestra exactamente **4 rubros = los 4 `VerticalKey`**: **Salud**,
  **Belleza/Estética/Spa**, **General**, **Canchas**. Reemplaza la lista larga de subtipos agrupados.
  El label de belleza pasa de "Belleza y Estética" (actual en `VERTICALS.belleza.label`) a
  **"Belleza/Estética/Spa"**.
- **D-02:** Elegir un rubro **sigue siendo obligatorio** para crear el negocio (es parte del paso
  "Negocio", ya obligatorio en Phase 2 — `canGoNext` step 1). Lo que cambia es que se elige el RUBRO
  (vertical), no un subtipo granular.

### Campo personalizable (texto libre)
- **D-03:** El campo personalizable es **OPCIONAL**. Si queda vacío, la página de reservas muestra el
  **label del rubro como fallback** (ej. "Salud", "Canchas") — nunca queda sin subtítulo. Consistente
  con Phase 2 (todo completable después). Hoy el booking hace `{business.type && <p>…}`
  (`app/[slug]/booking-client.tsx:401`): cambia a mostrar `type` **o** el label del vertical si `type`
  está vacío.
- **D-04:** El campo está **SIEMPRE visible** (no depende de tocar "Otro"). Esto corrige el bug actual
  del onboarding (el campo de "Otro" no aparece).
- **D-05:** **Label del campo:** **"¿A qué se dedica tu negocio?"** (distinto del selector de rubro de
  arriba). **Leyenda** debajo del campo: **"Así aparecerá en tu página de reservas"**.
- **D-06:** **Placeholders por rubro** (el placeholder cambia según el rubro elegido, patrón "Ej: …"
  como en Servicios):
  - Salud → `Ej: Lic. en Psicología, Kinesiólogo`
  - Belleza/Estética/Spa → `Ej: Barbería, Masajista, Depilación`
  - General → `Ej: Lavaautos, Tatuajes, Fotógrafo`
  - Canchas → `Ej: Canchas de fútbol`

### Mapeo de datos
- **D-07:** **Rubro elegido → columna `vertical`** (salud/belleza/general/canchas). **Texto libre →
  columna `type`** (la etiqueta visible en booking). `resolveVertical` ya prefiere `vertical`
  (`lib/verticals.ts:163`), así que el vertical se resuelve directo del rubro; `type` deja de ser la
  fuente de resolución y pasa a ser puro label de display. La lógica de auto-ocultar Profesionales en
  canchas del onboarding (Phase 2 D-03, hoy keyea `getVerticalKeyByType(type)`) debe pasar a keyear el
  **rubro/vertical elegido** directamente.

### Negocios existentes / limpieza de subtipos
- **D-08:** **Limpiar los subtipos granulares** de `lib/verticals.ts` (los arrays `VERTICALS[key].types`
  con "Peluquería", "Médico", "Cancha de pádel", etc.). Para **cero regresión**, ANTES de limpiarlos hay
  que **backfillear la columna `vertical` desde `type`** para los negocios existentes (derivando con la
  lógica actual `getVerticalKeyByType` / `LEGACY_TYPE_VERTICAL`), de modo que sigan resolviendo su
  vertical vía la columna `vertical` una vez que los arrays queden vacíos. Riesgo real bajo (casi sin
  data en prod), pero la migración/backfill es el seguro. **El `type` guardado de negocios existentes NO
  se toca** (sigue mostrándose en booking como su categoría).

### Alcance en el dashboard
- **D-09:** **Reemplazar** el selector actual de Configuración → Negocio
  (`app/(dashboard)/settings/settings-client.tsx:242-262`, hoy grupo + toggle "Otro" + dropdown de
  subtipos) por el **mismo selector nuevo** (4 rubros + campo libre siempre visible + placeholder por
  rubro + leyenda). Consistencia total onboarding ↔ dashboard. Se saca el dropdown de subtipos y el
  toggle "Otro".

### Claude's Discretion (a resolver en research/planning)
- Mecánica exacta de la **migración de backfill** de `vertical` (nueva migración SQL numerada sobre el
  baseline; validar con `supabase db reset` local antes de prod, aplicar a prod a mano — ver constraints).
- **Consumidores de `ALL_BUSINESS_TYPES`** (el comentario en `lib/verticals.ts:184` dice que "la usa la
  sugerencia de rubro por IA"): mapear DÓNDE se usa (no está en onboarding ni parece en settings) y
  decidir si al limpiar los subtipos se adapta o se quita esa sugerencia. Flag para research.
- Si conviene un helper nuevo en `lib/verticals.ts` para los placeholders por rubro (mapa
  `VerticalKey → placeholder`) y para el label del rubro usado como fallback en booking.
- Comportamiento de `getVerticalKeyByType` / `LEGACY_TYPE_VERTICAL` una vez vaciados los `types` (queda
  como fallback para filas sin `vertical`; confirmar que tras el backfill ninguna quede sin `vertical`).
- Forma exacta del control en la UI (Select de 4 rubros + Input de texto libre debajo) respetando el
  diseño Bauhaus y los estados hover/focus/active; mobile-first.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Sistema de verticales (núcleo de la fase)
- `lib/verticals.ts` — `VerticalKey`, `VERTICALS` (label + types + terminology + menu + features),
  `getVerticalKeyByType`, `resolveVertical` (prefiere columna `vertical`), `TYPE_GROUPS`,
  `ALL_BUSINESS_TYPES`, `LEGACY_TYPE_VERTICAL`. Acá se cambian labels (belleza), se limpian los `types`
  (D-08) y se agregan los placeholders por rubro (D-06).

### Superficies del selector (a reemplazar)
- `app/(onboarding)/onboarding/page.tsx` — paso "Tu negocio": el `Select` de tipo (~línea 468, usa
  `TYPE_GROUPS`), la lógica de auto-ocultar Profesionales en canchas (`visibleSteps`, hoy
  `getVerticalKeyByType(type)`), y `handleFinish` (guarda `type`/`vertical` del negocio).
- `app/(dashboard)/settings/settings-client.tsx` §242-262 — selector actual grupo + "Otro" + subtipos
  (`typeGroup`, `typeIsOtro`, `typeSelectValue`, `predefinedTypes`); a reemplazar por el nuevo patrón (D-09).

### Display en la página pública de reservas
- `app/[slug]/booking-client.tsx:401` — `{business.type && <p>…{business.type}</p>}`: acá va el fallback
  al label del rubro cuando `type` está vacío (D-03).
- `app/[slug]/canchas-booking-client.tsx` — variante canchas del booking (revisar si muestra categoría).

### Roadmap / requirements / fase previa
- `.planning/workstreams/onboarding/ROADMAP.md` §"Phase 3" — goal, criterios, decisión de fase.
- `.planning/workstreams/onboarding/REQUIREMENTS.md` — ONB-RUBRO-01, ONB-RUBRO-02.
- `.planning/workstreams/onboarding/phases/02-rework-ux-del-onboarding/02-CONTEXT.md` — Phase 2 D-03
  (auto-ocultar Profesionales en canchas) que esta fase re-keyea al rubro elegido.

### Skills / convenciones
- Skill `convenciones-forjo` — stack, verticales, naming, Server/Client component.
- Skill `supabase-multitenant-rls` — para la migración de backfill (aditiva, aislada por `business_id`).
- CLAUDE.md (UI/UX): labels visibles, feedback inline, estados hover/focus/active, mobile-first 375px.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **El modelo grupo(vertical) + label(type) YA existe** en el dashboard (`settings-client.tsx:242-262`):
  `typeGroup` = vertical que maneja el panel, `type` = solo label del header, `"Otro"` = texto libre.
  El rework unifica esto en "4 rubros + campo libre siempre visible" y lo lleva también al onboarding.
- **El booking YA muestra `business.type`** como subtítulo (`booking-client.tsx:401`) → el "así
  aparecerá en tu página de reservas" ya está wireado; solo se agrega el fallback al label del rubro.
- **`resolveVertical` ya prefiere la columna `vertical`** (`lib/verticals.ts:163-174`) → guardar el
  rubro en `vertical` hace que el vertical se resuelva directo, sin depender de `type`.
- **Patrón de placeholder "Ej: …"** ya usado en Servicios (Phase 2, `Ej: Corte de cabello`) y en Negocio
  (`Ej: Estudio Nova`) → reutilizable para los placeholders por rubro.

### Established Patterns
- `'use client'` con estado local; shadcn (`Select`, `Input`, `Label`) + `lucide-react`.
- Columnas `businesses.type` y `businesses.vertical` ya existen; el onboarding y settings escriben sobre
  el negocio del owner autenticado (RLS + `business_id` vigentes).
- Migraciones SQL numeradas en `supabase/migrations/` (baseline v0.13; la nueva sería 04x+), validadas
  con `supabase db reset` local, aplicadas a prod a mano y coordinadas con el deploy.

### Integration Points
- `getVerticalKeyByType(type)` se usa en onboarding (canchas auto-hide) y settings (init del grupo) →
  al pasar a keyear por `vertical`, revisar todos los llamadores.
- `ALL_BUSINESS_TYPES` (flatten de `VERTICALS[*].types`) — consumidor: "sugerencia de rubro por IA"
  (comentario `lib/verticals.ts:184`); ubicar y decidir (research).
- Sidebar del dashboard (`components/dashboard/sidebar.tsx`) usa el vertical para el menú → no cambia
  (sigue leyendo `vertical`), pero verificar que el rubro elegido lo alimente bien.

### Security / Isolation (relevancia: BAJO-MEDIO — regresión, no aislamiento)
- La migración de backfill es **aditiva** (setea `vertical` donde falte, derivando de `type`), aislada
  por fila/tenant; no expone datos entre negocios. El `type` libre expuesto en booking es data pública
  ya acotada (el booking ya lo muestra). "Cambiar de rubro" en settings cambia terminología/menú del
  propio negocio del owner (patrón vigente), no toca otros tenants.

</code_context>

<specifics>
## Specific Ideas

- Los 4 rubros con el label de belleza como **"Belleza/Estética/Spa"** (no "Belleza y Estética").
- Placeholders textuales exactos por rubro (D-06) — el usuario los dictó.
- Leyenda exacta: **"Así aparecerá en tu página de reservas"**.
- Label del campo: **"¿A qué se dedica tu negocio?"**.
- El campo libre reemplaza el flujo de "Otro" (que hoy está roto en el onboarding).

</specifics>

<deferred>
## Deferred Ideas

- **Renombrar el paso/terminología del vertical más allá de esto** — sigue fuera de alcance (como en
  Phase 2). Esta fase toca el selector de rubro, no la terminología interna de cada vertical.
- **Sugerencia de rubro por IA** (si hoy existe vía `ALL_BUSINESS_TYPES`): esta fase la mapea y decide
  adaptar/quitar por la limpieza de subtipos, pero NO construye una sugerencia nueva.

### Reviewed Todos (not folded)
None — no había todos pendientes que matchearan esta fase.

</deferred>

---

*Phase: 3-Rework del selector de rubro*
*Context gathered: 2026-07-04*
