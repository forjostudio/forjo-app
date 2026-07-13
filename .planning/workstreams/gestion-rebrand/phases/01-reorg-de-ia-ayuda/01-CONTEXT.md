# Phase 1: Reorg de IA + Ayuda - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Reorganizar el **chasis de navegación** de la app Gestión sin cambiar el comportamiento de
ningún flujo existente (**behavior-frozen**), y sumar una **FAQ/ayuda estática**. Cubre
NAV-01, NAV-02, HELP-01.

Concretamente:
1. **Sidebar agrupado** (NAV-01): la lista plana pasa a secciones PANEL · AGENDA · GESTIÓN ·
   REPORTES · AJUSTES. Cada item sigue linkeando exactamente adonde linkeaba antes.
2. **Split Negocio / Configuración** (NAV-02): las tabs Cobros · Integraciones · Notificaciones
   migran de Configuración a **Negocio** (que pasa a ser un hub con tabs: Datos · Cobros ·
   Integraciones · Notificaciones/Mails). **Configuración** queda con Apariencia · Seguridad ·
   Suscripción.
3. **FAQ estática** (HELP-01): página de ayuda sobre cómo usar Forjo Gestión, sin relación con
   el agente.

**Fuera de alcance de esta fase** (van a otras fases del milestone): alta manual de cliente +
badge de origen + exports CSV (Fase 2), import CSV (Fase 3). **Fuera del milestone:** bandeja de
Mensajes y FAQ-base-de-conocimiento del agente (dependen del add-on del agente WhatsApp).
</domain>

<decisions>
## Implementation Decisions

### Sidebar agrupado (NAV-01)
- **D-01:** El agrupado se implementa **en el propio `components/dashboard/sidebar.tsx`**:
  definir un array de grupos `{ section, keys[] }` y filtrar cada grupo contra el `v.menu` del
  vertical resuelto (`resolveVertical(business).menu`). Así el gating por rubro se mantiene
  automáticamente (ej. `canchas` no tiene `equipo` en su `menu` → el item no aparece bajo
  GESTIÓN) **sin tocar `lib/verticals.ts`**. NO agregar `menuGroups` a `VERTICALS`.
- **D-02:** Mapeo de grupos (LOCKED por el mock aprobado + inventario de pantallas):
  - **PANEL:** Dashboard
  - **AGENDA:** Turnos (`/appointments`) · Agenda (`/agenda`) · Clientes/Pacientes (`/clients`)
  - **GESTIÓN:** Prestaciones/Servicios (`/servicios`) · Equipo (`/equipo`) · Consultorios (`/consultorios`) · Negocio (`/negocio`)
  - **REPORTES:** Finanzas (`/finances`)
  - **AJUSTES:** Configuración (`/settings`)
  - Grupo **MENSAJES** del brief queda **excluido** (depende del add-on, fuera de este milestone).
- **D-03:** Los items fuera de grupo del footer se conservan tal cual: "Ver mi página"
  (link externo), "Cerrar sesión" y la firma "hecho con Forjo Studio". Behavior-frozen: mismos
  destinos, misma lógica.

### Negocio hub / qué migra de Configuración (NAV-02)
- **D-04:** Cobros · Integraciones · Notificaciones se implementan como **tabs client-side dentro
  de `/negocio`** (mismo patrón que hoy usa `/settings`), NO como sub-rutas. Negocio queda como
  hub con tabs: **Datos del negocio · Cobros · Integraciones · Notificaciones/Mails**.
  Configuración (`/settings`) queda con **Apariencia · Seguridad · Suscripción**.
- **D-05:** **Cero redirects** por la migración de tabs: Cobros/Integraciones/Notificaciones
  nunca tuvieron URL propia (eran estado client-side de `/settings`), así que no hay ruta vieja
  a la que redirigir. Las dos rutas (`/negocio`, `/settings`) siguen existiendo.
- **D-06:** **Reubicar el callback del OAuth de MercadoPago**: hoy vuelve a `/settings?mp=connected|error`
  y `settings-client.tsx` (useEffect ~L145) setea `configTab='integraciones'` asumiendo que
  Integraciones vive en `/settings`. Como Integraciones se muda a `/negocio`, hay que:
  (a) cambiar los redirects a `/negocio?mp=...` en `app/api/mercadopago/callback/route.ts`
  (L16, L68) y `app/api/mercadopago/connect/route.ts` (L9);
  (b) mover el manejo del `?mp=` (toast + set de tab Integraciones + `history.replaceState`) a
  donde se renderice el hub Negocio. Esto es parte del behavior-frozen (que "conectar MP" siga
  aterrizando en la tab correcta), no una feature.

### FAQ / Ayuda (HELP-01)
- **D-07:** Vive en **ruta propia** (`/ayuda` o `/faq` — el planner elige el slug) con **dos
  accesos**: link desde el **footer del sidebar** Y desde **Configuración**.
- **D-08:** Contenido **estático en el repo** como array TS de `{ pregunta, respuesta }`,
  versionado en git (editar = commit). Sin tabla en Supabase, sin MDX.
- **D-09:** Draft inicial de preguntas: Claude redacta un set de arranque (cómo crear un turno,
  cómo cargar servicios/equipo/consultorios, cómo cobrar una seña / conectar MercadoPago, cómo
  compartir la página pública de reservas, cómo funciona el rubro/vertical) y el usuario lo
  revisa/ajusta. El contenido no es crítico para el plan; la estructura sí.

### Claude's Discretion
- Slug exacto de la ruta de ayuda (`/ayuda` vs `/faq`), orden de tabs dentro de Negocio (más allá
  de "Datos primero"), y microcopy de las secciones del sidebar (mayúsculas/eyebrow).
- **FLAG de dependencia (decidir en plan-phase):** el componente `Accordion` **no existe** en
  `components/ui/`. Sumarlo vía shadcn trae una dependencia nueva (`@radix-ui/react-accordion` o
  el equivalente base-ui). Dado el criterio "preferir zero-install y flaggear deps nuevas",
  evaluar **`<details>`/`<summary>` nativo estilado con Tailwind (zero-install)** como opción
  por defecto vs. sumar el Accordion de shadcn. Flaggear antes de agregar la dep.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño aprobado de ESTA reorg (fuente de verdad del "de dónde a dónde")
- `../gestion-actual/Forjo Gestión - Reestructura (offline).html` — mock vanilla APROBADO
  (2026-06-17) de la reorg: sidebar agrupado, Negocio hub, split Configuración, FAQ. Re-implementar
  nativo, no copiar el HTML.
- `../gestion-actual/screenshots/inventario-pantallas.md` — inventario de las 11 pantallas actuales
  con la **tabla de mapeo sidebar → sección** (Dashboard→PANEL, Turnos/Agenda→AGENDA,
  Prestaciones/Equipo/Consultorios/Negocio→GESTIÓN, Finanzas→REPORTES, Configuración→AJUSTES) y el
  detalle de las 6 tabs actuales de Configuración.
- `../forjo-gestion-rebrand-brief.md` — brief del milestone con las decisiones LOCKED (G1–G6),
  la estructura nueva (§3) y qué es diseño vs backend (§4).

### ⚠️ NO confundir
- `design_handoff_forjo_rebrand/README.md` — es el **rebrand VISUAL Bauhaus + selector de paletas**,
  YA SHIPEADO (globals.css/fuentes/F constructivista ya aplicados en el repo). **NO es el diseño de
  esta reorg de IA.** El ROADMAP lo cita por error como "Mapa de cambios"; el mapa real está en
  `../gestion-actual/`.

### Requirements del milestone
- `.planning/workstreams/gestion-rebrand/REQUIREMENTS.md` — NAV-01, NAV-02, HELP-01.
- `.planning/workstreams/gestion-rebrand/ROADMAP.md` §"Phase 1" — Success Criteria (1–5).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/(dashboard)/settings/settings-client.tsx` — **mega-componente ya manejado por `view`**
  (`config` | `negocio` | `servicios` | `equipo` | `consultorios`). Tiene `SECTION_TAB`,
  `isSection`, `configTab`. Las 6 tabs de Configuración (`appearance`, `cobros`, `integraciones`,
  `notificaciones`, `seguridad`, `suscripcion`) YA viven acá como `<TabsContent>`. La migración
  NAV-02 = **reasignar qué tabs muestra cada `view`**: `negocio` pasa de una sola tab
  (`business`) a un TabsList [Datos · Cobros · Integraciones · Notificaciones]; `config` reduce su
  TabsList a [Apariencia · Seguridad · Suscripción]. El contenido de cada tab NO cambia, solo dónde
  se lista/renderiza.
- `app/(dashboard)/negocio/page.tsx` — server component que ya renderiza `SettingsClient view="negocio"`.
  Hoy no le pasa `secrets` ni datos de MP/notif porque solo mostraba Datos; al sumar Cobros/
  Integraciones/Notificaciones probablemente necesite pasar `secrets`, `mpConnectEnabled`, etc.
  (mirar qué props consumen esas tabs en `settings-client.tsx`).
- `components/dashboard/sidebar.tsx` — `buildNav(business)` arma la lista plana desde
  `resolveVertical(business).menu`. Acá se agrega la estructura de grupos (D-01). Ya tiene la
  marca "F" y el footer; agregar el link a la FAQ en el footer (D-07).
- `components/crm/crm-sidebar.tsx` — referencia de sidebar **ya agrupado** (el brief dice "como el
  CRM"). Mirar cómo agrupa antes de crear un patrón nuevo.
- `components/dashboard/page-eyebrow.tsx` (`PageEyebrow`) — el label de sección arriba de cada
  título; reusable para los headers.

### Established Patterns
- **Gating por vertical:** `resolveVertical(business).menu` es la única fuente de qué items ve
  cada rubro. Filtrar los grupos contra este array (D-01) preserva el gating sin tocar `verticals.ts`.
- **Callback OAuth MP:** `app/api/mercadopago/callback/route.ts` (L16, L68) y `connect/route.ts`
  (L9) redirigen a `/settings?mp=...`; el `settings-client.tsx` (~L145) lo consume. Reubicar a
  `/negocio` (D-06).
- **shadcn Tabs:** el hub usa `Tabs/TabsList/TabsTrigger/TabsContent` de `@/components/ui/tabs`
  (ya en uso en settings-client). El hub Negocio usa el mismo componente.

### Integration Points
- `app/(dashboard)/layout.tsx` — monta el `<Sidebar>`; no debería necesitar cambios (el sidebar
  se agrupa internamente).
- Nueva ruta de ayuda: `app/(dashboard)/ayuda/page.tsx` (o `/faq`) — server component simple que
  renderiza el array TS de FAQ. Link desde el footer del sidebar y desde Configuración.

### Behavior-frozen — NO tocar
- `lib/verticals.ts` (`resolveVertical`, `VERTICALS`, terminología, `menu` por rubro).
- El motor de agenda/booking y cualquier lógica de las tabs migradas (Cobros/Integraciones/
  Notificaciones): se **mueve el componente/tab de lugar, no se cambia su comportamiento**.
</code_context>

<specifics>
## Specific Ideas

- El mock aprobado (`../gestion-actual/`) es "solo lo que cambia": reproducir fielmente el
  agrupado y el split, no rediseñar las 11 pantallas.
- Sidebar agrupado "como el CRM" (`crm-sidebar.tsx`) — misma familia visual.
- Label de la 4ª tab de Negocio: **"Notificaciones/Mails"** (per brief §3), aunque el contenido
  es la tab de notificaciones actual.
</specifics>

<deferred>
## Deferred Ideas

- **Grupo MENSAJES + Bandeja del negocio** — depende del add-on del agente WhatsApp; milestone
  aparte (v2 en REQUIREMENTS: MSG-01, NAV-MSG-01).
- **FAQ-base-de-conocimiento del agente** (el dueño carga Q&A que usa el agente) — atada al
  add-on; distinta de la ayuda estática de esta fase (MSG-FAQ-01, v2).
- **Alta manual de cliente + badge de origen + exports CSV** — Fase 2.
- **Import de clientes CSV** — Fase 3.
- **Sub-rutas reales para las tabs de Negocio** (deep-linkeables) — descartado para v1 (D-04);
  si en el futuro se quieren URLs compartibles por tab, es una mejora posterior.

</deferred>

---

*Phase: 1-Reorg de IA + Ayuda*
*Context gathered: 2026-07-05*
