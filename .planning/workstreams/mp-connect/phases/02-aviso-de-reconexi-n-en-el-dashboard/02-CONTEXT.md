# Phase 2: Aviso de reconexión en el dashboard - Context

**Gathered:** 2026-07-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Superficie de dashboard (UI autenticada del dueño) que refleja el estado REAL de la conexión de
MercadoPago Connect leyendo el flag `businesses.mp_connection_status` que dejó la Phase 1. Cuando la
conexión está caída, muestra un aviso de reconexión en lugar del "Conectado" engañoso. Cubre MPCONN-04.
Depende de Phase 1 (columna + lógica de escritura ya en `gsd/mp-connect`, migración 053 aplicada).
NO toca backend/token/cobros (eso es Phase 1). NO cambia el flujo OAuth (lo reusa).

</domain>

<decisions>
## Implementation Decisions

### Estado de "conectado" (lógica)
- **D-01:** `mpConnected` pasa de `!!business.mp_user_id` a `!!business.mp_user_id && business.mp_connection_status !== 'error'`
  (`settings-client.tsx:699`). "Conectado" (verde) SOLO si hay `mp_user_id` **y** el flag no está en `'error'`.
  Con `mp_user_id` presente y flag `'error'` → estado "caído" (aviso de reconexión). Sin `mp_user_id` →
  como hoy (desconectado / carga manual). Cero regresión para conexión sana (Success Criteria 1).

### Aviso en la card de Integraciones (settings-client.tsx ~1589-1599)
- **D-02:** Cuando la conexión está caída, la card de MercadoPago muestra un aviso **ámbar / warning**
  (semantic warning, NO destructive/rojo — es accionable y recuperable) en lugar de "Conectado · cuenta #…".
- **D-03:** Copy EXACTO (locked): **"Tu conexión con MercadoPago se interrumpió, reconectá tu cuenta para
  seguir cobrando señas."**
- **D-04:** Acción = botón **"Reconectar"** que dispara el flujo OAuth ya existente
  (`window.location.href = '/api/mercadopago/connect'`, el mismo que usa "Conectar con MercadoPago"),
  **sin obligar a desvincular primero** (Success Criteria 3). El callback exitoso sana el flag (Phase 1
  D-06). La opción "Desconectar" puede seguir disponible, pero el CTA primario es Reconectar.

### Aviso global en el dashboard (scope AMPLIADO por decisión del usuario)
- **D-05:** Además de la card, un **banner global** en el dashboard, visible en todas las páginas del
  route group `(dashboard)`. Se monta en `app/(dashboard)/layout.tsx` arriba del `<main>`, **espejando el
  patrón de `PlanBanner`/`TestModeBanner`** (componente nuevo `components/dashboard/mp-connection-banner.tsx`).
  > **Nota de scope:** los Success Criteria del ROADMAP solo pedían el aviso en la card. El banner global
  > es una ampliación elegida por el usuario en discuss — se implementa en esta fase. NO es scope creep no
  > acordado; queda registrado acá.
- **D-06:** El banner se muestra SOLO cuando `business.mp_connection_status === 'error'` **y**
  `business.mp_user_id` presente (el negocio tenía MP conectado y se cayó). Ámbar, **persistente** (no
  dismissable) mientras la conexión esté caída — es bloqueante de ingresos (no puede cobrar señas),
  consistente con que `PlanBanner` también es persistente. CTA "Reconectar" → `/api/mercadopago/connect`.

### Aislamiento por tenant / seguridad
- **D-07:** El estado se lee del `business` ya resuelto por `owner_id` (tanto en `layout.tsx:17-21` como en
  `negocio/page.tsx` → `settings-client`). NUNCA se muestra el estado de otro negocio. Solo se expone el
  **estado sano/caído** — jamás valores de token ni secretos (Success Criteria 4, Security/Integrity note).

### Claude's Discretion
- Estilos concretos del ámbar (usar los tokens semantic warning del design system del proyecto, no hex sueltos).
- Estructura exacta del componente del banner (mirando `plan-banner.tsx` como analog).
- Si el aviso de la card reemplaza in-place el bloque "Conectado" o se apila arriba — lo decide el planner mirando el layout actual.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Estado previo (Phase 1 — el flag y su lógica)
- `.planning/workstreams/mp-connect/phases/01-detecci-n-y-estado-de-conexi-n-ca-da/01-CONTEXT.md` — decisiones D-01..D-09 de Phase 1.
- `.planning/workstreams/mp-connect/phases/01-detecci-n-y-estado-de-conexi-n-ca-da/01-02-SUMMARY.md` — qué escribe/limpia el flag.

### Código a tocar / reusar
- `app/(dashboard)/settings/settings-client.tsx` §699 (`mpConnected`) + §1584-1610 (card de MercadoPago, "Conectado"/"Conectar").
- `app/(dashboard)/layout.tsx` §17-21 (business por owner_id) + §43-47 (dónde se montan los banners).
- `components/dashboard/plan-banner.tsx` — **analog a espejar** para el banner nuevo (patrón de banner del dashboard).
- `lib/types.ts` — `Business.mp_connection_status` (ya existe, Phase 1).
- `app/api/mercadopago/connect/route.ts` — el flujo OAuth de reconexión (se reusa, no se cambia).

### Skills
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — aislamiento (leer el flag del business del dueño, nunca de otro).
- `.claude/skills/convenciones-forjo` — tokens de diseño / patrón de componentes del dashboard.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PlanBanner` / `TestModeBanner` (`components/dashboard/`) montados en `layout.tsx` — patrón directo para el banner global nuevo.
- El botón OAuth existente en la card (`window.location.href = '/api/mercadopago/connect'`) — se reusa para "Reconectar".
- `business.mp_connection_status` ya disponible en `layout.tsx` (business por owner_id) y en `negocio/page.tsx`.

### Established Patterns
- Banners del dashboard = componentes client montados arriba del `<main>` en el layout, alimentados por props derivadas de `business`.
- La card de Integraciones ya tiene estados conectado/manual/desconectado — se agrega el estado "caído".

### Integration Points
- `settings-client.tsx`: lógica `mpConnected` + render de la card (estado caído + Reconectar).
- `layout.tsx`: montar `MpConnectionBanner` (nuevo) con props del business.

</code_context>

<specifics>
## Specific Ideas

Tono ámbar (warning), no rojo: reconectar lo resuelve, no es catástrofe. Copy locked (D-03). Banner global
persistente porque bloquea el cobro de señas (ingresos), igual criterio que el PlanBanner.

</specifics>

<deferred>
## Deferred Ideas

- **Aviso por mail al negocio** cuando la conexión cae — diferido desde Phase 1, sigue fuera de scope (v0.23 avisa solo en el dashboard).
- Aviso contextual en la pantalla de **Finanzas/cobros** específicamente (más allá del banner global) — no pedido; si se quiere, fase aparte.

</deferred>

---

*Phase: 2-Aviso de reconexión en el dashboard*
*Context gathered: 2026-07-19*
