# Phase 1: Vertical Canchas - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffolding del vertical "canchas": que un negocio resuelva al rubro canchas y el
dashboard adopte su **terminología** y **menú** propios (eje de agenda = "Cancha",
SIN el item "Profesionales/Equipo"), reutilizando y extendiendo el sistema de
verticales existente (`lib/verticals.ts` + `lib/use-terminology.tsx`).

Es scaffolding de presentación + resolución de vertical. Deja terminología/menú
listos para que Phase 2 (config de cancha) y Phase 3 (booking público) cuelguen de
ellos. **No** agrega datos de tenant nuevos ni toca el motor de reservas v0.12. El
riesgo real es de **regresión** (no romper la resolución de salud/belleza/general),
no de aislamiento.

**Fuera de scope (esta fase):** crear/editar canchas (Phase 2), precio/duración de
la cancha (Phase 2), booking público de alquiler (Phase 3), turnos fijos/recurrentes
(diferido, ver Deferred Ideas).
</domain>

<decisions>
## Implementation Decisions

### Modelo de resolución del vertical
- **D-01:** `'canchas'` es un **`VerticalKey` nuevo de primera clase** (Opción A), no
  una extensión del override por-type. Se agrega `'canchas'` al tipo `VerticalKey` y
  un `VerticalConfig` propio en `VERTICALS`. La columna `businesses.vertical` guarda
  el string `'canchas'`. `resolveVertical`/`getVerticalKeyByType`/`TYPE_GROUPS` lo
  agarran automáticamente (derivan de `VERTICALS`), sin tocar el render del sidebar
  ni las pantallas de onboarding/settings.
- **D-02:** El menú del rubro sale **solo** del `VerticalConfig.menu` — se omite
  `'equipo'`. Menú propuesto (ajustable en planning):
  `['dashboard','appointments','agenda','clients','finances','servicios','consultorios','negocio','settings']`.
  (`servicios`/`consultorios` se revisitan en Phase 2 según dónde aterrice el modelo
  de cancha; en Phase 1 no se pre-decide eso.)
- **D-03:** Mantener `lib/verticals.ts` framework-agnóstico (sin React/iconos), igual
  que hoy. El mapeo key→icono ya vive en `components/dashboard/sidebar.tsx::buildNav`.

### Terminología del rubro canchas
- **D-04:** Mapa "Reserva + Cancha":
  - `appointment` → `Reserva` / `appointments` → `Reservas`
  - `resource` → `Cancha` / `resources` → `Canchas`
  - `location` → `Sede` / `locations` → `Sedes`
  - `service` → `Cancha` / `services` → `Canchas` (en canchas el bookable ES la
    cancha; se confirma en Phase 2)
  - `client` → `Cliente` / `clients` → `Clientes`
  (El planner ajusta `service/services` si Phase 2 separa "servicio" de "cancha";
  por ahora la cancha es el bookable.)

### Enforcement de "Equipo"
- **D-05:** Doble capa. (1) Fuera del menú vía `VerticalConfig.menu` (D-02). (2)
  **Guard server-side** en `app/(dashboard)/equipo/page.tsx`: si
  `resolveVertical(business).key === 'canchas'` → `redirect('/dashboard')`. Cumple el
  criterio 4 literal: escribir `/equipo` a mano no debe mostrar las canchas-como-
  profesionales. Motivo de fondo: cada cancha ES una fila de `professionals` (bucket
  de agenda del motor v0.12), así que `/equipo` listaría las canchas como "Equipo" —
  leaky, no solo estético.

### Tratamiento de datos existentes / legacy
- **D-06:** **No hay clientes en producción** → cutover limpio, sin script de
  migración:
  - `'Cancha de fútbol'` (+ pádel/tenis/etc. a definir en planning) pasan a ser
    `types` del vertical `'canchas'`.
  - Se **quita** `'Cancha de fútbol'` de `general.types`.
  - Se **elimina entero** `TYPE_TERMINOLOGY_OVERRIDE` — existía solo para darle el
    label "Cancha" a `general` + ese type; ahora el vertical `canchas` dueña esa
    terminología de forma nativa. (Verificar que ningún otro type lo use antes de
    borrarlo — hoy solo lo usa `'Cancha de fútbol'`.)
  - Si en dev/staging hubiera alguna fila con `type='Cancha de fútbol'`, es un
    `UPDATE businesses SET vertical='canchas' WHERE type='Cancha de fútbol'` de una
    línea — no se necesita migración numerada (no toca esquema).

### Cero regresión (criterio 3 y 4)
- **D-07:** Los `VerticalConfig` de `salud`/`belleza`/`general` quedan **byte-
  idénticos** (salvo el removal de `'Cancha de fútbol'` de `general.types`, que no
  cambia menú ni terminología de general). La resolución de vertical debe seguir
  siendo determinística: un negocio sin canchas nunca ve UI de canchas; uno de
  canchas nunca ve UI de profesionales (D-05).

### Claude's Discretion
- Lista final de `types` del vertical canchas (qué deportes incluir además de fútbol).
- Composición exacta del array `menu` de canchas (qué items conservar de la base
  general menos `equipo`); validar contra las rutas que existen hoy.
- Mecánica del removal del override (borrado total vs dejar el `Record` vacío) —
  decisión de limpieza, no de comportamiento.
- Si la sugerencia de rubro por IA (`ALL_BUSINESS_TYPES`) necesita incluir/excluir los
  nuevos types de canchas.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Sistema de verticales (núcleo de esta fase)
- `lib/verticals.ts` — `VerticalKey`, `VERTICALS`, `getVerticalKeyByType`,
  `resolveVertical`, `getVertical`, `TYPE_GROUPS`, `ALL_BUSINESS_TYPES`,
  `TYPE_TERMINOLOGY_OVERRIDE` (a eliminar), `LEGACY_TYPE_VERTICAL`. Framework-agnóstico.
- `lib/use-terminology.tsx` — `VerticalProvider`, `useVertical`, `useTerminology`,
  `DEFAULT` (cae a `general`).

### Consumidores del menú/terminología (puntos de regresión)
- `components/dashboard/sidebar.tsx` §`buildNav` — mapea `menu` keys → ruta + icono +
  label (desde terminología). Aquí se materializa el "sin Equipo".
- `app/(dashboard)/equipo/page.tsx` — ruta a guardear (D-05); hoy renderiza
  `professionals` + `spaces`/`agenda_spaces` (motor v0.12) vía `SettingsClient view="equipo"`.
- `app/(dashboard)/settings/settings-client.tsx` — select de rubro (GRUPO=vertical,
  type=label); `saveBusiness` escribe `vertical = typeGroup`. Deriva de `TYPE_GROUPS`.
- `app/(onboarding)/onboarding/page.tsx` — escribe `vertical: getVerticalKeyByType(type)`;
  select de tipo desde `TYPE_GROUPS`.

### Roadmap / requirements del workstream
- `.planning/workstreams/canchas/ROADMAP.md` §"Phase 1" — goal, criterios de éxito,
  phase-level decision (resuelta acá como Opción A).
- `.planning/workstreams/canchas/REQUIREMENTS.md` — VERT-01, VERT-02.

### Contexto del motor (no se toca en P1, pero explica el porqué de D-05)
- `.planning/workstreams/canchas/STATE.md` §"Milestone Context" — motor v0.12 live
  (`spaces`/`agenda_spaces`/`appointment_spaces`, `book_slot_atomic`, migr. 040/041/042);
  cancha = fila de `professionals` (bucket/agenda).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VERTICALS` + `VerticalConfig`: agregar `canchas` es puramente declarativo. El menú,
  terminología y features salen de ahí sin lógica nueva.
- `TYPE_GROUPS` / `ALL_BUSINESS_TYPES`: derivados de `VERTICALS` → "Canchas" aparece
  solo como grupo en onboarding/settings sin tocar esas pantallas.
- `resolveVertical(business)`: prioriza `business.vertical` almacenado; cae a derivar
  por `type`. Ya usado en sidebar, settings, páginas públicas y de retorno.

### Established Patterns
- `lib/verticals.ts` es framework-agnóstico (server+client). NO importar React/iconos.
- El menú es data: array de keys en `VerticalConfig.menu` → `buildNav` filtra
  `.filter(Boolean)` los keys desconocidos. Omitir `'equipo'` basta para el menú.
- Guards server-side de página: patrón `getUser()→redirect` ya presente en
  `equipo/page.tsx`; agregar el check de vertical sigue ese patrón.

### Integration Points
- Nuevo `VerticalKey` 'canchas' en `lib/verticals.ts` (tipo + `VERTICALS` + types).
- Guard en `app/(dashboard)/equipo/page.tsx` (redirect si vertical canchas).
- Removal de `TYPE_TERMINOLOGY_OVERRIDE` y de `'Cancha de fútbol'` en `general.types`.
- Sin migración de esquema (la columna `vertical` ya existe y acepta el string nuevo).

</code_context>

<specifics>
## Specific Ideas

- "Eje de agenda = Cancha" es el ancla de identidad del rubro (del milestone context,
  LOCKED). El término del turno pasa a "Reserva" (más natural para alquiler).
- El rubro QUITA "Profesionales/Equipo" porque en el ~99% de las canchas no hay staff
  (LOCKED en STATE → Decisions).

</specifics>

<deferred>
## Deferred Ideas

- **Turnos fijos / abonos recurrentes (canchas)** — Idea del usuario durante el
  discuss. Caso típico de canchas: un cliente pide "fijo todos los miércoles a las 19"
  y ese slot deja de estar disponible semana a semana. Dos partes:
  1. **Lado dueño:** generar una reserva **recurrente** desde el panel que bloquea el
     slot recurrentemente (se apoya en turnos manuales desde el panel — ver memoria
     `manual-booking-panel` — y en el motor de reservas).
  2. **Lado público:** check opcional *"enviar solicitud de turno fijo"* al terminar
     de reservar + flujo de **aprobación/rechazo** del dueño.
  Es una **capacidad nueva**, fuera del scope de Phase 1 y de v0.13 (que cubre vertical
  → config de cancha → booking simple). Candidata a milestone/fase propia. No se pierde:
  registrada acá y en backlog de memoria.

### Reviewed Todos (not folded)
None — no había todos cruzados con esta fase.

</deferred>

---

*Phase: 1-Vertical Canchas*
*Context gathered: 2026-06-30*
