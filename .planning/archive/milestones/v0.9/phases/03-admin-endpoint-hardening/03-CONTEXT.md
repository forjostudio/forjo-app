# Phase 3: Admin Endpoint Hardening - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Endurecer la autenticación de los endpoints admin (SEC-03):
- `app/api/admin/set-plan/route.ts` — hoy header-only pero con comparación `!==` (timing-unsafe).
- `app/api/admin/setup-plans/route.ts` — hoy acepta el secreto por **query string** (`?secret=` → queda en logs de acceso) + `!==`.

El objetivo: el secreto admin solo por header HTTP, comparación en tiempo constante, sin secreto en logs.

**Fuera de scope:** las fases 4/5; unificar las fuentes de planes (`lib/plans.ts` / `lib/subscription-plans.ts`, backlog v2).
</domain>

<decisions>
## Implementation Decisions

### setup-plans: sacarlo del runtime web (D-01)
- **D-01:** **Borrar** `app/api/admin/setup-plans/route.ts` (elimina toda la superficie de ataque del runtime web, incluido el agujero del `?secret=`) y **mover su lógica a un script local** `scripts/setup-mp-plans.ts` que se corre a mano cuando haga falta crear/recrear los preapproval plans en MP (ej. nuevo entorno o cambio de `MP_MODE`). El script lee credenciales de MP del entorno directamente y NO tiene chequeo de admin-secret (no está expuesto a la web). Los IDs de plan ya existen en las env vars actuales, así que esto no rompe nada en producción — es capacidad de re-setup, no funcionalidad activa.
- El script reusa la lógica actual: `SUBSCRIPTION_PLANS` (`lib/subscription-plans.ts`), `mpFetch` + `MP_MODE` (`lib/mercadopago.ts`), `BACK_URL`. Imprime los IDs para copiar a las env vars (igual que hoy el endpoint).

### set-plan: comparación timing-safe inline (D-02)
- **D-02:** Reemplazar `secret !== process.env.ADMIN_SECRET` por una comparación en **tiempo constante hash-both-sides**: `crypto.timingSafeEqual(sha256(provided), sha256(expected))`, con guard de nulo/vacío que devuelve 401 (NO pasar strings crudos a `timingSafeEqual` — tira RangeError por longitud distinta; por eso se hashea a 32 bytes fijos primero). **Inline** en `set-plan` (no helper compartido — con `setup-plans` borrado, `set-plan` es el único endpoint admin web que queda). Sigue siendo header-only (`x-admin-secret`), ya lo es.

### Limpieza
- **D-03:** Borrar el comentario vestigial "will be called by Stripe webhook" en `set-plan` (el proyecto usa MercadoPago, no Stripe). Reemplazar por un comentario en español que explique el porqué del timing-safe.

### Claude's Discretion
- **Runner del script:** no hay `tsx`/`ts-node` en deps (solo `typescript`). El planner decide: agregar `tsx` como devDep + un npm script (ej. `"setup:mp-plans": "tsx scripts/setup-mp-plans.ts"`) e importar de `@/lib/*`, o escribir el script autocontenido sin imports de alias. Recomendado: `tsx` devDep + npm script (reusa la lógica de lib sin duplicar). Debe respetar `MP_MODE` y el sufijo `_TEST`.
- Respuesta ante secret inválido: mantener `Response.json({ error: 'Unauthorized' }, { status: 401 })` (convención de set-plan). Logueo opcional de intentos fallidos: a discreción, sin loguear el secreto.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Archivos objetivo
- `app/api/admin/set-plan/route.ts` — `!==` en §11 a reemplazar por timing-safe; header-only ya OK; comentario "Stripe webhook" §9 a limpiar.
- `app/api/admin/setup-plans/route.ts` — A BORRAR; su lógica (§13-47) se muda al script. Acepta `?secret=` (§16) — el agujero que se elimina al borrarlo.

### Lógica que reusa el script
- `lib/subscription-plans.ts` — `SUBSCRIPTION_PLANS` (reason, price_ars).
- `lib/mercadopago.ts` — `mpFetch`, `MP_MODE` (el script crea `/preapproval_plan` por cada plan).

### Patrón timing-safe (referencia interna)
- `lib/mercadopago.ts` `verifyMPSignature` (Fase 2) — ya usa `crypto.timingSafeEqual` con guard de longitud sobre buffers HMAC (hex). OJO: ese caso compara buffers de longitud fija (hex HMAC); para el admin secret (longitud arbitraria) hay que **hashear ambos lados a SHA-256 primero** para evitar el RangeError de longitud (diferencia clave, ver `.planning/research/STACK.md`).

### Docs / research
- `.planning/research/STACK.md` — snippet `safeEqual` (hash-both-sides) para SEC-03.
- `.planning/research/PITFALLS.md` — pitfalls 6-7 (timingSafeEqual length throw, secreto persistente en query string).
- `.planning/security-hardening-brief.md` §Fase 3.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- El patrón `crypto.timingSafeEqual` ya está en el repo (`lib/mercadopago.ts`), pero con buffers de longitud fija — para el secret admin hay que hashear primero (hash-both-sides).
- `mpFetch`/`MP_MODE`/`SUBSCRIPTION_PLANS` ya existen → el script los importa, no duplica lógica de MP.

### Established Patterns
- `set-plan` usa `Response.json({ ok }|{ error })` (convención dashboard, distinta a los webhooks que usan `new Response(...)`).
- Comentarios densos en español explicando el porqué (seguridad).

### Integration Points
- `set-plan` es llamado por un actor externo con `x-admin-secret` (no por sesión). El timing-safe protege contra side-channel de adivinación del secreto.
- El script `scripts/setup-mp-plans.ts` corre fuera del runtime web (Node local), lee env, golpea la API de MP.
</code_context>

<specifics>
## Specific Ideas

- Borrar `app/api/admin/setup-plans/route.ts` por completo; nuevo `scripts/setup-mp-plans.ts`.
- `set-plan`: helper inline `safeEqual(provided, expected)` con SHA-256 + `timingSafeEqual`.
</specifics>

<deferred>
## Deferred Ideas

- Unificar fuentes de verdad de planes (`lib/plans.ts`, `lib/subscription-plans.ts`, `lib/plan-limits.ts`) → backlog v2.
- Rate-limiting / lockout en endpoints admin → no pedido, fuera de SEC-03.
</deferred>

---

*Phase: 3-Admin Endpoint Hardening*
*Context gathered: 2026-06-16*
