# Phase 4: Plan Gating on Public Booking - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

SEC-04: el endpoint público `app/api/booking/create/route.ts` debe rechazar reservas si el negocio tiene `plan_status` en `expired` o `cancelled`. Hoy el endpoint trae el negocio por slug (§50-54) pero el select (§51) NO incluye `plan_status` y no hay gating: un negocio vencido sigue aceptando reservas por su link `/[slug]`.

**Fuera de scope:** UX de la página pública (mostrar "no disponible" / deshabilitar el form) — esta fase es SOLO el endpoint; la Fase 5 (tests).
</domain>

<decisions>
## Implementation Decisions

### Gating por blocklist (D-01)
- **D-01:** Blocklist explícito **`['expired', 'cancelled']`**. Solo esos dos estados bloquean. `active`, `trial`, `null`, legacy o cualquier valor no contemplado → **PERMITIDO** (recibe reservas). Esto evita bloquear negocios legítimos por accidente (Pitfall 11 del research): un `trial` o un negocio sin `plan_status` seteado NO debe perder reservas.

### Implementación (D-02)
- **D-02:** Agregar `plan_status` a la lista de columnas del select existente (§51) — sin query nueva, es una ampliación de una columna. Agregar un early-return inmediatamente DESPUÉS del `if (!business)` (§54): `if (['expired','cancelled'].includes(business.plan_status)) return Response.json({ ok:false, error:'plan_inactive' }, { status:403 })`.

### Respuesta (D-03)
- **D-03:** Rechazo con `403` + `{ ok: false, error: 'plan_inactive' }` (código snake_case, convención del proyecto). 403 (no 404/409) porque el negocio existe pero no está habilitado para recibir reservas.

### Claude's Discretion
- Comentario en español explicando por qué blocklist y no allowlist (evitar bloquear trial/null). Ubicación exacta del early-return (tras el `if (!business)`).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Archivo objetivo
- `app/api/booking/create/route.ts` §50-54 — el select por slug (agregar `plan_status` a §51) y el `if (!business)` §54 (poner el gating justo después). Shape de error `{ ok:false, error }` ya usado en §54 (`'not_found'`).

### Docs / research
- `.planning/research/PITFALLS.md` — Pitfall 11 (blocklist `[expired,cancelled]`, NO "not active" — no bloquear `trial`).
- `.planning/security-hardening-brief.md` §Fase 4.
- `.planning/codebase/CONCERNS.md` — el bug original (booking no consulta plan_status).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- El negocio ya se trae por slug en §50-54 → agregar `plan_status` al select es una sola columna, sin round-trip extra.
- El patrón de early-return con `Response.json({ ok:false, error }, { status })` ya está en el endpoint (§54).

### Established Patterns
- Códigos de error snake_case (`'not_found'`, `'slot_taken'`, etc.) → `'plan_inactive'` encaja.
- Anti-tampering por tenant + validaciones server-side ya presentes.

### Integration Points
- Es el único punto a tocar: el `processBooking`/handler de `booking/create`. El gating va antes de cualquier validación de servicio/slot (rechazar temprano).
</code_context>

<specifics>
## Specific Ideas

- `plan_status` agregado al select §51; early-return 403 `plan_inactive` tras `if (!business)`.
</specifics>

<deferred>
## Deferred Ideas

- UX de la página pública (`/[slug]`): mostrar "reservas no disponibles" / deshabilitar el form para negocios vencidos → fuera de scope de SEC-04 (otra fase / mejora de UX).
- Gating en otros endpoints de booking (availability) → no pedido; SEC-04 apunta a `create`.
</deferred>

---

*Phase: 4-Plan Gating on Public Booking*
*Context gathered: 2026-06-17*
