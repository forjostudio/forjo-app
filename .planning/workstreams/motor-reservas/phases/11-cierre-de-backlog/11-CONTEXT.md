# Phase 11: Cierre de backlog - Context

**Gathered:** 2026-07-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Última fase del milestone v0.25 (multi-staff). Cierra pendientes chicos e independientes **sin tocar el motor de reservas**. Cinco ítems: los 3 POLISH de la ROADMAP + 2 extras que el usuario sumó explícitamente en este discuss.

**POLISH-01** — En el tab **Archivados** de Abonos, distinguir de un vistazo una serie **cancelada** de una **completada** (indicador por estado, sin abrir el detalle).
**POLISH-02** — Sacar el error de eslint por `setState` dentro de `useEffect` en `clients-client.tsx` (~línea 494-500), sin cambiar el comportamiento (búsqueda, filtros, alta, edición, sin renders en cascada).
**POLISH-03** — Las 2 pantallas de cancelación (`/cancelar/[token]` y `/abono/cancelar/[token]`) quedan con el **mismo** criterio visual en el borde lateral acentuado, consistentes entre sí.
**EXTRA-A (folded todo)** — Aclarar el mensaje de borrado de servicio/sede/cancha (hoy engañoso).
**EXTRA-B (feature, del discuss-10)** — Default del selector público ("Cualquiera" vs "elegí") configurable por negocio.

**UI hint: yes.** Bajo riesgo. Las pantallas de cancelación son **públicas y anónimas** y ya están endurecidas (404 genérico, token no adivinable, número informado por el servidor, `noindex`, contraste por luminancia) — ningún retoque puede aflojar eso ni cambiar qué datos se muestran antes de validar el token.
</domain>

<decisions>
## Implementation Decisions

### POLISH-01 — Indicador cancelada vs completada (discutido)
- **D-01:** en Archivados, cada serie lleva un **chip con color semántico por estado**: **"Cancelado"** en tono muted/destructive suave y **"Completado"** en tono success/neutral, usando la paleta semántica del proyecto (no hex sueltos). Se ve sin abrir el detalle (SC1). El estado sale del `status` de la serie (`'cancelled'` | `'completed'`) que ya existe en `abonos-client.tsx` (Archivados = cancelled + completed sin turnos futuros). Ojo semántico: `'completed'` es un flag del **motor de generación** (la serie terminó de generar), no un estado de negocio — el chip "Completado" se muestra igual, pero no re-interpretar la lógica de `isAbonoActivo`.

### POLISH-03 — Borde lateral acentuado (discutido)
- **D-03:** **MANTENER** el borde lateral acentuado — es el **patrón de marca app-wide** (booking, confirmación y cancelación usan el mismo `border-l-4` + accent). El alcance de POLISH-03 se resuelve como: **confirmar que las 2 pantallas de cancelación coinciden entre sí** (mismo `border-l-4`, mismo `borderLeftColor: accent`) y con el resto de la app; **NO cambiar el patrón**. El finding `side-tab` del hook de diseño se **acepta como intencional** (documentarlo; si hace falta acallar el hook, usar la vía de config reviewable de impeccable acotada a esos archivos, NO un `disable` a lo bruto ni cambiar el diseño). **NO tocar** el endurecimiento de esas pantallas públicas (404 genérico, token, número del servidor, `noindex`, contraste por luminancia).

### EXTRA-A — Mensaje de borrado (folded todo, discutido)
- **D-04:** mejorar los 3 toasts de borrado bloqueado por FK 23503 para que aclaren que "tiene turnos asociados" **incluye pasados y cancelados** (cancelar no borra la fila) y ofrezcan las dos vías (desactivar para conservar historial / borrar los turnos para eliminar). **Solo copy**, NO cambiar el comportamiento (el FK protege el historial de Finanzas). Toca `app/(dashboard)/settings/settings-client.tsx:403` (servicio) y `:738` (sede), y `components/dashboard/canchas-manager.tsx:181` (cancha). Revisar `deleteProfessional` (`settings-client.tsx:573`) por si le falta el mismo manejo del 23503. Texto de referencia (ajustable): *"No se puede eliminar: tiene turnos asociados, incluidos pasados y cancelados (cancelar no los borra). Desactivalo para dejar de ofrecerlo y conservar el historial, o borrá esos turnos primero."*

### EXTRA-B — Default del selector configurable por negocio (feature, discutido)
- **D-05:** setting **por negocio** que define el default del paso "Profesional" de la reserva pública: **"Cualquiera" preseleccionado** vs **"elegí" (sin preselección)**. Es lo que en Phase 10 (D-01) estaba fijo en "Cualquiera".
- **D-06 (default = comportamiento actual):** el valor por defecto del setting es **"any" ("Cualquiera" preseleccionado)** para TODOS los negocios existentes y nuevos → cero cambio de comportamiento para quien no lo toque (preserva Phase 10 D-01).
- **D-07 (gating intacto):** el setting solo cambia la **preselección**; sigue vigente el gate de Phase 10 (la opción "Cualquiera" aparece solo con **≥2 profesionales capaces**, D-02 de Phase 10). Con "elegí", el paso arranca sin preselección pero "Cualquiera" sigue disponible como opción cuando corresponde.
- **D-08 (no toca el motor):** es puramente presentación/config — no toca `book_slot_atomic`, la asignación atómica, ni el contrato de disponibilidad.

### Claude's Discretion (a research/planner)
- **POLISH-02:** la forma idiomática de sacar el `setState`-en-`useEffect` sin cambiar comportamiento (derivar en render / `key` para resetear el form al cambiar `selected` / mover a handler) → planner. Verificable: eslint limpio + búsqueda/filtros/alta/edición idénticos.
- **EXTRA-B mecanismo:** dónde vive el setting → recomendación: **columna nueva en `businesses`** (patrón de `require_deposit`/`default_slot_duration`/`max_advance_days`), ej. `public_selector_default text DEFAULT 'any'` (`'any'|'choose'`), en una **migración 061** (última en prod = 060), idempotente, aplicada a mano; validación local `supabase db reset`. Alternativa (blob de settings) si el planner lo prefiere, pero un default de booking encaja como columna de primera clase. Exponerla al front por donde ya viaja el business a `booking-client` (respetando que la vista pública no filtre de más). UI del toggle en Ajustes/Negocio (dónde exactamente → planner, mirando la estructura de settings existente).
- **POLISH-01:** cómo se renderiza el chip (componente Badge existente vs clase) reusando la paleta semántica → planner/UI.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Alcance y criterios
- `.planning/workstreams/motor-reservas/ROADMAP.md` §"Phase 11" — goal, 3 success criteria (POLISH-01/02/03), nota de Security (pantallas de cancelación endurecidas — no aflojar).
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — POLISH-01, POLISH-02, POLISH-03.

### Superficies a tocar
- `app/(dashboard)/abonos/abonos-client.tsx` — listado de abonos; tab Archivados (`:253/:280`), `status: 'active'|'cancelled'|'completed'` (`:35`), `isAbonoActivo` (`:82-94`). Acá va el chip por estado (POLISH-01).
- `app/(dashboard)/clients/clients-client.tsx` — el `useEffect` que sincroniza el form al cambiar `selected` (~`:494-500`), fuente del error de eslint (POLISH-02).
- `app/cancelar/[token]/cancel-client.tsx` y `app/abono/cancelar/[token]/abono-cancel-client.tsx` — las 2 pantallas de cancelación (gemelas); el `border-l-4` + `borderLeftColor: accent` (`abono-cancel-client.tsx:136`). POLISH-03 = confirmar consistencia, mantener el patrón.
- `app/(dashboard)/settings/settings-client.tsx` (`:403` servicio, `:738` sede, `:573` deleteProfessional) y `components/dashboard/canchas-manager.tsx` (`:181` cancha) — toasts del EXTRA-A.
- `supabase/schema.sql` (tabla `businesses`, ~`:436-460` columnas de settings) — molde para la columna del EXTRA-B; `app/[slug]/booking-client.tsx` (el default de `selectedPro` de Phase 10) y `app/[slug]/page.tsx` (por dónde llega el business) — wiring del EXTRA-B.

### Paleta / componentes
- Paleta semántica del proyecto (éxito/error/advertencia) y el componente de badge/chip existente en `components/ui` — para POLISH-01 sin hardcodear hex.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- El `status` de la serie ya existe (`abonos-client.tsx:35`) — POLISH-01 es puramente de presentación (un chip por estado), sin lógica nueva.
- Las 2 pantallas de cancelación ya derivan el contraste por luminancia server-side (IN-05) — POLISH-03 mantiene eso intacto; solo se verifica consistencia del borde.
- `businesses` ya tiene varias columnas de settings de booking con `DEFAULT` — el EXTRA-B replica ese patrón (columna + default 'any').
- `toggleService`/`toggleLocation` (soft-disable vía `active`/`is_active`) ya existen — el EXTRA-A solo mejora el copy que apunta a ellos, no agrega mecanismo.

### Established Patterns
- Migración numerada + `DEFAULT` para columnas nuevas de `businesses`, aplicada a mano; local `supabase db reset`. (EXTRA-B = migr. 061.)
- Las pantallas de cancelación son gemelas — tocar una sin la otra las hace divergir (POLISH-03 las trata juntas).

### Integration Points / Tests
- `test/abono-cancel*.test.ts` (estados de la serie), y las suites de cancelación pública — verificar que POLISH-01/03 no cambian comportamiento. POLISH-02 se valida con `npm run lint` (eslint limpio) + que Clientes sigue igual. EXTRA-B necesita test del wiring (default 'any' preserva Phase 10; 'choose' no preselecciona) contra la DB local con la 061.
</code_context>

<specifics>
## Specific Ideas
- Chips: "Cancelado" (muted/destructive suave) + "Completado" (success/neutral), paleta semántica.
- Copy del EXTRA-A: aclarar pasados/cancelados + ofrecer desactivar (texto de referencia en D-04).
- EXTRA-B: default = **'any'** (preserva el comportamiento de Phase 10); toggle en Ajustes/Negocio.
</specifics>

<deferred>
## Deferred Ideas
- **Cupo por solape (capacity > 1)** — es **v0.26**, milestone aparte (toca `book_slot_atomic` + seat + granularidad del lock). NO entra en Phase 11. Todo en `.planning/workstreams/motor-reservas/todos/pending/2026-07-22-cupo-por-solape-*.md`.
- **Suavizar/quitar el borde acentuado app-wide** — NO elegido; se mantiene el patrón (D-03). Si en el futuro se decide cambiarlo, es una revisión de patrón visual de toda la app, no de esta fase.

### Reviewed Todos
- Folded → EXTRA-A (mensaje de borrado, `todos/pending/2026-07-27-mensaje-borrado-servicio-*.md`).
- Reviewed, NOT folded → cupo-por-solape (v0.26).

---

*Phase: 11-Cierre de backlog*
*Context gathered: 2026-07-27*
</content>
