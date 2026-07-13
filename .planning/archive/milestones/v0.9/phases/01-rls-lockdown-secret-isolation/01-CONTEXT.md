# Phase 1: RLS Lockdown + Secret Isolation - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Cerrar el agujero de aislamiento donde el rol `anon` puede leer columnas sensibles de las tablas públicas y donde los secretos viven en una tabla con lectura pública. Entrega (SEC-01):

1. El gemelo del fix ya aplicado a `businesses` (migración `026_public_businesses_view.sql`), ahora para **`services`** y **`business_hours`**: vistas públicas acotadas + `DROP POLICY` de cualquier `USING(true)`.
2. Una tabla **`business_secrets`** (keyed by `business_id`, RLS solo-dueño, sin acceso `anon`) que aloja los secretos hoy en `businesses`: `mp_access_token`, `mp_refresh_token`, `mp_token_expires_at`, `resend_api_key`, `resend_from`, `recaptcha_secret_key`, `google_refresh_token`.
3. Repunte de **todos** los lectores server-side de esos secretos (≈20 archivos) a `business_secrets` vía el cliente service-role.

**Fuera de scope:** webhooks de pago (Fase 2), endpoints admin (Fase 3), gating de plan en booking (Fase 4), tests (Fase 5). No re-arquitecturar la app.
</domain>

<decisions>
## Implementation Decisions

### Mecanismo de aislamiento de secretos
- **D-01:** Separar los secretos en una tabla `business_secrets` con RLS solo-dueño (sin policy de lectura `anon`), NO una policy column-scoped sobre `businesses`. Decidido en PROJECT.md (Key Decisions): Postgres RLS es row-level, no column-level; la separación física hace la exposición de columnas estructuralmente imposible en vez de depender de una policy. Lectura server-side exclusivamente vía `lib/supabase/admin.ts` (service role).

### Build order y seguridad de la migración (el riesgo más alto de la fase)
- **D-02:** Orden interno de la fase: **(a)** crear la migración aditiva-primero (`CREATE TABLE business_secrets`, copiar datos desde `businesses`, crear vistas acotadas, `GRANT`), **(b)** desplegar el código que lee desde `business_secrets` **con fallback a `businesses`**, **(c)** confirmar que todo funciona, **(d)** recién entonces `DROP` de las columnas-secreto en `businesses` y `DROP POLICY` de los `USING(true)` restantes. La lectura backward-compatible con fallback es el camino seguro dado que las migraciones se aplican a mano (PROJECT.md constraint).
- **D-03:** Evitar el landmine de `select('*')`: el webhook de seña (`app/api/payment/webhook/[slug]/route.ts`) hace `select('*')` y luego `if (!business?.mp_access_token)`; al dropear columnas devolvería `undefined` SIN error SQL y dejaría de confirmar turnos pagados. El repunte de ese lector (aunque su endurecimiento de firma es Fase 2) debe incluirse en esta fase para no romper pagos en silencio. Migración 026 ya creó `public_businesses`; la nueva migración es la **`027`**.

### Exposición de `services` / `business_hours`
- **D-04:** Vistas públicas acotadas completas (`public_services`, `public_business_hours` o equivalentes) replicando el patrón exacto de `026_public_businesses_view.sql` y `007_professionals_extended.sql` (`CREATE OR REPLACE VIEW` + `GRANT SELECT ... TO anon, authenticated` + `DROP POLICY IF EXISTS`), no un lockdown mínimo. Consistencia con el patrón ya establecido + defensa en profundidad. Verificar que la página pública `/[slug]` siga leyendo lo que necesita desde las vistas.

### Lecturas owner-side del dashboard
- **D-05:** El dashboard del dueño (`settings-client.tsx`, `agenda/page.tsx`) expone **presencia/booleanos** de configuración de secretos (¿hay token MP?, ¿hay reCAPTCHA?), NUNCA el valor crudo del secreto al cliente. La lectura va por código server-side con service role, no por el cliente de sesión/anon.

### Claude's Discretion
- Nombres exactos de las vistas (`public_services` vs `services_public`) y forma precisa de la tabla `business_secrets` (columnas, defaults, FK con `ON DELETE CASCADE`) — a definir en planning siguiendo el patrón 026/007. El planner/research deciden los detalles SQL.

### Decisión humana — RESUELTA (2026-06-15)
- **D-06 (RESUELTA → ROTAR):** El usuario confirmó que la app **estuvo desplegada en la URL pública de Vercel con secretos reales** mientras el agujero `USING(true)` exponía `businesses` al rol `anon`. Esto es una **exposición real de credenciales**: cualquiera con la anon key (que viaja al navegador) pudo leer los secretos. **Acción requerida: rotar todas las claves afectadas.** Secretos per-negocio en la tabla `businesses` (los que filtró la RLS): `mp_access_token`, `mp_refresh_token`, `resend_api_key`, `recaptcha_secret_key`, `google_refresh_token` — todos de cuenta real → rotar. Más, por precaución del brief: `ADMIN_SECRET`, `CRON_SECRET` (env vars; no filtradas por esta RLS pero el brief las incluye y `setup-plans` las logueaba por query string — SEC-03). Es una **acción operativa del usuario fuera del repo** (re-OAuth de MP/Google, regenerar keys en consolas, actualizar env vars en Vercel + valores en DB). Ver runbook de rotación entregado en la sesión. No bloquea el código de la migración 027, pero debería ejecutarse pronto dado que las claves están comprometidas.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Patrón de migración (vista pública + DROP POLICY)
- `supabase/migrations/026_public_businesses_view.sql` — el fix gemelo ya aplicado a `businesses`; la migración 027 lo replica para `services`/`business_hours`
- `supabase/migrations/007_professionals_extended.sql` — patrón canónico original (`public_professionals`): `CREATE OR REPLACE VIEW` + `GRANT` + `DROP POLICY IF EXISTS`

### Planos de acceso Supabase (qué cliente puede leer qué)
- `lib/supabase/admin.ts` — service role, ÚNICO cliente que puede leer `business_secrets`
- `lib/supabase/public.ts`, `lib/supabase/server.ts`, `lib/supabase/client.ts` — NUNCA deben tocar `business_secrets`

### Blast radius del repunte de secretos (lectores verificados)
- `lib/payment.ts` — lee Y **escribe** `mp_access_token`/`mp_refresh_token`/`mp_token_expires_at` (MP rota el refresh token en cada uso; el path de escritura también se mueve)
- `lib/recaptcha.ts` — `select('recaptcha_secret_key')` (fail-open hoy)
- `lib/email.ts` — `resend_api_key`, `resend_from`
- `lib/google-calendar.ts` + `app/api/google/{sync,callback,disconnect}` — `google_refresh_token`
- `app/api/payment/webhook/[slug]/route.ts` — **`select('*')` landmine** (ver D-03)
- `app/api/booking/create/route.ts` (línea ~49), `app/api/cancel/[token]`, `app/api/payment/retry/[token]`, `app/api/notify/{booking,cancel}`, `app/api/mercadopago/{callback,disconnect}`
- `app/(dashboard)/settings/settings-client.tsx`, `app/(dashboard)/agenda/page.tsx` — lecturas owner-side (ver D-05)
- `lib/types.ts` — separar los campos-secreto de `Business` en una forma `BusinessSecrets`

### Documentos de proyecto / research
- `.planning/PROJECT.md` — Key Decisions (tabla `business_secrets`), constraints (migraciones a mano + deploy coordinado)
- `.planning/security-hardening-brief.md` §Fase 1 — goal, secretos a aislar, ítem condicional de rotación, criterio de éxito
- `.planning/research/ARCHITECTURE.md` — data flow de aislamiento de secretos, blast radius de 20 archivos, build order
- `.planning/research/PITFALLS.md` — pitfalls 1-5 (revoke base table, security_invoker, orden migración/deploy, mover-no-copiar, completitud de columnas de la vista)
- `.planning/research/STACK.md` — sin nuevas deps; solo `crypto` built-in (relevante a fases siguientes)
- Skill del proyecto `supabase-multitenant-rls` — checklist de aislamiento por tenant
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `026_public_businesses_view.sql` y `007_professionals_extended.sql`: plantillas SQL exactas (idempotentes: `CREATE OR REPLACE VIEW`, `DROP POLICY IF EXISTS`, `ADD COLUMN IF NOT EXISTS`) para las vistas de `services`/`business_hours`.
- `lib/supabase/admin.ts` (`createAdminClient()`): el plano service-role ya existe; los repuntes lo usan tal cual.
- Patrón de re-validación por `business_id` ya presente en route handlers (anti-tampering de tenant) — `business_secrets` se lee `.eq('business_id', id)`.

### Established Patterns
- Migraciones numeradas en `supabase/migrations/`, aplicadas a mano y en orden. La próxima libre es **`027`** (última: `026_public_businesses_view.sql`).
- Columnas de DB en snake_case; la capa TS NO renombra a camelCase (`lib/types.ts`).
- Defensa en profundidad de tenant: RLS en DB + filtro explícito por `business_id` en cada query.

### Integration Points
- DB → service-role client → libs/route handlers. El public read path (`app/[slug]/page.tsx`) NO lee secretos (verificado), así que el cambio de secretos no lo afecta; lo que sí lo afecta son las vistas acotadas de `services`/`business_hours`.
- El webhook de seña es el punto de integración más frágil por el `select('*')` (D-03).
</code_context>

<specifics>
## Specific Ideas

- Migración objetivo: `supabase/migrations/027_*.sql` (aditiva-primero, idempotente, no destructiva de datos hasta el paso final de DROP).
- Runbook PowerShell (Windows) para aplicar la migración a mano coordinada con el deploy — el research lo marca como gap a llenar en planning.
</specifics>

<deferred>
## Deferred Ideas

- Endurecimiento de firma `x-signature` + chequeo de monto del webhook de seña → Fase 2 (SEC-02). Esta fase solo repunta su lectura de secretos para no romperlo.
- Cifrado at-rest por secreto en `business_secrets` → backlog v2 (fuera de scope).
- Unificar fuentes de verdad de planes / `webhook_events` idempotencia → backlog v2.
</deferred>

---

*Phase: 1-RLS Lockdown + Secret Isolation*
*Context gathered: 2026-06-15*
