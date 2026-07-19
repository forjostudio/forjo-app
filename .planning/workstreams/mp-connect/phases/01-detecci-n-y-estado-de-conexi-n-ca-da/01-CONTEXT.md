# Phase 1: Detección y estado de conexión caída - Context

**Gathered:** 2026-07-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend de la resiliencia de MercadoPago Connect (token OAuth **del negocio**, cobro de señas). El
resolver de token deja de caer en fallback silencioso, se persiste un estado de conexión durable en
`businesses`, se limpia al reconectar/recuperarse, y todo fallo se loguea server-side. NO incluye la
UI del dashboard (Phase 2). NO toca el flujo de suscripciones de Forjo (token de plataforma). Cubre
MPCONN-01, 02, 03, 05, 06.

</domain>

<decisions>
## Implementation Decisions

### Flag de estado de conexión (MPCONN-03)
- **D-01:** Columna nueva `businesses.mp_connection_status text NOT NULL DEFAULT 'connected'`. Valores:
  `'connected'` (sano) | `'error'` (caído). Text-enum elegido sobre boolean por extensibilidad barata
  (futuro `'revoked'` sin re-migrar). Vive en `businesses` (no en `business_secrets`) porque el
  dashboard ya lee `business` y `mp_user_id` vive ahí → Phase 2 lo lee sin query nuevo.
- **D-02:** Migración **053** en `supabase/migrations/`, idempotente (`ADD COLUMN IF NOT EXISTS`).
  **NO se aplica por el flujo** — checkpoint humano coordina el orden (053 a prod ANTES del deploy del
  código). Baseline: última aplicada 052. No toca `public_businesses` (es interno del dueño, no
  público) ni policies (el dueño ya lee su `business`; la escritura del flag es service-role).

### Detección de caída (MPCONN-01, 02, + mejoras)
- **D-03:** Marcar `mp_connection_status='error'` cuando: (a) MP rechaza el refresh —
  `refreshMpToken` devuelve null (MPCONN-01); (b) el refresh es OK pero **falla la persistencia** del
  token rotado a `business_secrets` (MPCONN-02) — el `.update()` HOY no chequea el error; hay que
  capturarlo. En ambos casos `getValidMpAccessToken` **devuelve null** (no sigue con token vencido).
- **D-04:** **Mejora aprobada — detección por 401 en el cobro:** si el POST a `/checkout/preferences`
  (`createDepositPreference`) devuelve 401, marcar la conexión caída también (cubre token revocado por
  el negocio, que no se detecta por expiración).
- **D-05:** **Mejora aprobada — auto-sanar:** un refresh exitoso posterior (con persistencia OK) que
  encuentra el flag en `'error'` lo vuelve a `'connected'` — recuperación sin intervención, además del
  reconnect OAuth.

### Limpieza del flag (MPCONN-05)
- **D-06:** El callback OAuth exitoso (`app/api/mercadopago/callback/route.ts`) setea
  `mp_connection_status='connected'` junto con `mp_user_id` — reconexión = conexión sana.

### Scope OAuth (deuda #2 de la skill — foldeada a Phase 1)
- **D-07:** Sumar `scope=offline_access read write` **explícito** en la URL de autorización
  (`app/api/mercadopago/connect/route.ts`). Garantiza que MP siempre emita `refresh_token` (sin él, el
  refresh —raíz de todo este milestone— depende de un grant default frágil). Es 1 línea y directamente
  relacionado. **Nota:** no altera negocios ya conectados (su token/refresh ya existen); aplica a
  conexiones/reconexiones nuevas.

### Cliente público cuando la conexión está caída (MPCONN-06)
- **D-08:** Phase 1 **NO cambia el flujo de booking público**. Solo se loguea server-side con severidad
  el motivo real del fallo del cobro (token inválido/conexión caída). El arreglo de cara al negocio es
  reconectar (aviso en Phase 2). No se agrega código de error nuevo al front público ni se cae a
  reservar-sin-seña (esto último cambia una regla de negocio sensible → descartado).

### Seguridad / aislamiento
- **D-09:** Toda escritura del flag es **service-role, keyed por `business_id`** (nunca id del
  cliente, nunca bajo impersonación). El helper de secretos sigue server-only. **Phase 1 lleva threat
  model y pasa por secure-phase** (integridad de pagos + tokens + RLS). Aplican las skills
  `mercadopago-connect` y `supabase-multitenant-rls`. NO se toca el flujo de suscripciones
  (`MP_FORJO_ACCESS_TOKEN`).

### Claude's Discretion
- La forma exacta del logging (nivel/prefijo) sigue el patrón del repo (`console.error('[mp/...]')`).
- Si la escritura del flag `'error'` (best-effort) falla, al menos loguear; no re-lanzar.
- Orden interno de las operaciones en `getValidMpAccessToken` (persistir → marcar) lo decide el planner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Skills de dominio (LOCKED — leer sí o sí)
- `.claude/skills/mercadopago-connect/SKILL.md` — patrón OAuth Connect en prod, refresh single-use
  load-bearing, punto frágil #1 (este bug) y #2 (scope), aislamiento por tenant.
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — reglas de aislamiento para la columna nueva y las escrituras.

### Requirements
- `.planning/workstreams/mp-connect/REQUIREMENTS.md` — MPCONN-01..06 + contexto del diagnóstico.

### Código a tocar (verificado en la sesión)
- `lib/payment.ts` §40-64 (`getValidMpAccessToken`, el fallback mudo) + §74-149 (`createDepositPreference`, el cobro / 401).
- `lib/mercadopago.ts` §148-164 (`refreshMpToken`, devuelve null en fallo).
- `lib/business-secrets.ts` — lectura/escritura de secretos (`getBusinessSecrets`), service-role keyed por business_id.
- `app/api/mercadopago/callback/route.ts` §43-62 (persiste `mp_user_id` + secretos; acá se limpia el flag).
- `app/api/mercadopago/connect/route.ts` — URL de autorización (agregar `scope`).
- `supabase/migrations/052_booking_window.sql` — referencia de formato para la migración 053.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getBusinessSecrets` / patrón service-role keyed por `business_id` (`lib/business-secrets.ts`) — modelo para leer/escribir con aislamiento.
- Patrón de migración idempotente numerada (`supabase/migrations/052_booking_window.sql`).

### Established Patterns
- Errores server-side con `console.error('[modulo/accion]', ...)`; extraer mensaje seguro.
- Escrituras server-side con `createAdminClient()` (service role) SIEMPRE keyed por `business_id`.
- `mp_user_id` (no secreto) vive en `businesses`; los 3 secretos MP en `business_secrets`.

### Integration Points
- `getValidMpAccessToken` (payment.ts) es el punto central: refresh + persistencia + set flag error/heal.
- `createDepositPreference` (payment.ts) — detección por 401 del cobro.
- Callback OAuth — limpieza del flag.
- Connect route — scope explícito.
- La columna `mp_connection_status` la consume Phase 2 (dashboard) — Phase 1 la crea + escribe.

</code_context>

<specifics>
## Specific Ideas

El flag en `businesses` (no `business_secrets`) es deliberado: Phase 2 lee `business` por `owner_id` sin
tocar el read-path de secretos (server-only). Valores string en vez de boolean por el mismo criterio que
el resto del modelo: sofisticar el dato (barato de migrar), mantener simple la UI.

</specifics>

<deferred>
## Deferred Ideas

- **Notificación por mail al negocio** cuando la conexión cae — futuro; v0.23 avisa en el dashboard (Phase 2).
- **Reintento automático de cobros** fallidos — fuera de scope; acá solo se detecta/persiste/avisa.
- **Cifrado de los tokens en `business_secrets`** (deuda #3 de la skill) — milestone aparte.

</deferred>

---

*Phase: 1-Detección y estado de conexión caída*
*Context gathered: 2026-07-19*
