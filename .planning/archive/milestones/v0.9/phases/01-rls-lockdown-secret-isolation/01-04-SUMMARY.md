---
phase: 01-rls-lockdown-secret-isolation
plan: 04
subsystem: database
tags: [rls, supabase, secrets, dashboard, oauth, public-view, services, mercadopago, google-calendar]

# Dependency graph
requires:
  - phase: 01-01
    provides: "tabla business_secrets + policy owner-only, vista public_services (migración 027), getBusinessSecrets(), tipo BusinessSecrets, split de secretos fuera de Business"
provides:
  - "OAuth callbacks/disconnect de MercadoPago y Google escriben/nullean secretos en business_secrets vía session client (owner RLS)"
  - "Dashboard de settings lee secretos server-side (getBusinessSecrets) y los guarda con upsert por business_id en business_secrets"
  - "Agenda expone googleConnected como booleano de presencia derivado de business_secrets (D-05, sin token crudo)"
  - "Página pública /[slug] lee servicios desde la vista acotada public_services (cierra el hueco live de services para anon)"
affects: [01-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Write owner-side de secretos: supabase.from('business_secrets').upsert({ business_id, ...secrets }, { onConflict: 'business_id' }) con el session client, autorizado por la policy owner-only (Pitfall F)"
    - "Read owner-side de secretos: getBusinessSecrets(businessId) server-side; el client recibe el valor crudo solo en el form de edición del dueño (D-05) y solo un booleano de presencia en el resto"
    - "Lectura pública por vista acotada: from('public_services') reemplaza from('services') con anon key (gemelo de public_businesses/public_professionals)"

key-files:
  created: []
  modified:
    - app/api/mercadopago/callback/route.ts
    - app/api/mercadopago/disconnect/route.ts
    - app/api/google/callback/route.ts
    - app/api/google/disconnect/route.ts
    - app/api/google/sync/route.ts
    - app/(dashboard)/settings/page.tsx
    - app/(dashboard)/settings/settings-client.tsx
    - app/(dashboard)/agenda/page.tsx
    - app/[slug]/page.tsx

key-decisions:
  - "secrets como prop OPCIONAL de SettingsClient con default EMPTY_SECRETS: las vistas de sidebar (negocio/equipo/servicios/consultorios) reusan el componente pero no renderizan los forms de secretos, así que no fetchean secretos por service role"
  - "mp_user_id, recaptcha_site_key y notification_email NO son secretos → permanecen en businesses; solo los 7 secretos van a business_secrets"

patterns-established:
  - "Separar el write owner-side: id de cuenta/flags públicos a businesses, secretos a business_secrets en la misma operación"
  - "D-05 en el client: valor crudo solo en el form de edición del dueño; presencia (booleano) en el resto de la UI"

requirements-completed: [SEC-01]

# Metrics
duration: 5min
completed: 2026-06-16
status: complete
---

# Phase 1 Plan 04: Repunte owner-side de secretos + lectura pública de servicios Summary

**OAuth callbacks (MP/Google), dashboard settings y agenda repuntados a business_secrets vía owner RLS (D-05), y /[slug] leyendo servicios desde la vista acotada public_services — resuelve los 7 tsc errors del split Business/BusinessSecrets.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-16T02:26:18Z
- **Completed:** 2026-06-16T02:30:39Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Los 5 flujos OAuth owner-side (MP callback/disconnect, Google callback/disconnect/sync) escriben/leen/nullean secretos en business_secrets; mp_user_id queda en businesses como flag.
- El dashboard de settings lee los secretos server-side (getBusinessSecrets) y los guarda con 3 upserts a business_secrets (mp_access_token, resend_*, recaptcha_secret_key); notification_email y recaptcha_site_key (no secretos) siguen en businesses.
- agenda/page.tsx deriva googleConnected como booleano de presencia, sin pasar el token crudo al client (D-05).
- /[slug] lee servicios desde public_services (vista acotada), cerrando el hueco live de la tabla base services para anon (T-01-11).
- `npx tsc --noEmit` limpio en todo el proyecto.

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1: OAuth callbacks/disconnect (MercadoPago + Google) → business_secrets** - `575f686` (feat)
2. **Task 2: Dashboard settings — leer/guardar secretos en business_secrets (owner RLS)** - `0261cc6` (feat)
3. **Task 3: /[slug] servicios desde public_services + secrets opcional** - `e75a5fe` (feat)

## Files Created/Modified
- `app/api/mercadopago/callback/route.ts` - mp_user_id a businesses; 3 secretos MP a business_secrets (upsert owner RLS)
- `app/api/mercadopago/disconnect/route.ts` - nullea mp_user_id en businesses y los 3 secretos MP en business_secrets
- `app/api/google/callback/route.ts` - google_refresh_token a business_secrets (resuelve business_id por owner_id)
- `app/api/google/disconnect/route.ts` - revoke lee el token vía getBusinessSecrets; nullea en business_secrets
- `app/api/google/sync/route.ts` - secretos (google_refresh_token + resend_*) vía getBusinessSecrets, fuera del select de businesses
- `app/(dashboard)/settings/page.tsx` - getBusinessSecrets server-side, pasa los valores solo al form del dueño (D-05)
- `app/(dashboard)/settings/settings-client.tsx` - prop secrets (opcional, EMPTY_SECRETS default); initial state desde secrets; 3 saves upsert a business_secrets
- `app/(dashboard)/agenda/page.tsx` - googleConnected como booleano derivado de business_secrets
- `app/[slug]/page.tsx` - servicios desde public_services en vez de la tabla base services con anon key

## Decisions Made
- **secrets opcional en SettingsClient (EMPTY_SECRETS default):** las 4 páginas de sidebar (negocio/equipo/servicios/consultorios) reusan SettingsClient con view distinto de 'config' y no renderizan los forms de secretos. En vez de obligarlas a fetchear secretos por service role que no van a mostrar, la prop es opcional y cae a un objeto vacío. Solo /settings (view='config') pasa los valores reales.
- **División del write owner-side:** mp_user_id (id de cuenta, flag de conexión), recaptcha_site_key (pública, se renderiza en browser) y notification_email (contacto, no credencial) permanecen en businesses; los 7 secretos van a business_secrets. Cada save/callback hace dos operaciones cuando mezcla ambos tipos.
- **Fallback de transición intacto:** getBusinessSecrets sigue cayendo a businesses si no hay fila en business_secrets; el DROP de columnas se difiere a 028 (plan 01-05). No se removió nada del fallback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prop secrets de SettingsClient hecha opcional para desbloquear tsc en 4 páginas de sidebar**
- **Found during:** Task 3 (verificación `npx tsc --noEmit` del proyecto completo)
- **Issue:** SettingsClient es reusado por `app/(dashboard)/{negocio,equipo,servicios,consultorios}/page.tsx`. Al agregar `secrets` como prop requerida en Task 2, esos 4 callers (que no muestran los forms de secretos) producían `TS2741: Property 'secrets' is missing`.
- **Fix:** `secrets` pasó a ser opcional (`secrets?: BusinessSecrets`) con default `EMPTY_SECRETS` dentro del componente. Solo `/settings` (view='config') fetchea y pasa los valores reales; las vistas de sidebar caen al objeto vacío sin fetchear secretos por service role.
- **Files modified:** app/(dashboard)/settings/settings-client.tsx
- **Verification:** `npx tsc --noEmit` → EXIT 0 (limpio en todo el proyecto)
- **Committed in:** e75a5fe (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** El fix es necesario para que el proyecto compile y evita 4 fetches innecesarios de secretos por service role en vistas que no los muestran. Sin scope creep; alineado con D-05 (las vistas de sidebar no reciben valores crudos de secretos).

## Issues Encountered
None - el repunte siguió el plan; el único ajuste fue el de los callers compartidos de SettingsClient (documentado arriba).

## User Setup Required
None - no requiere configuración de servicios externos. (La rotación de claves de D-06 sigue siendo una acción operativa del usuario fuera del repo, ajena a este plan.)

## Next Phase Readiness
- Todos los lectores/escritores de secretos (payment, email, reCAPTCHA, cancel, cron en 01-02/01-03; owner-side OAuth + dashboard acá) apuntan a business_secrets con fallback a businesses.
- /[slug] ya lee las tres vistas acotadas (public_businesses, public_professionals, public_services).
- Plan 01-05 (migración 028) puede ahora hacer el DROP POLICY de los `USING(true)` de services/business_hours y el DROP de las columnas-secreto en businesses sin romper código: ya nada owner-side ni público escribe/lee secretos de la tabla base.
- Fallback de transición de getBusinessSecrets sigue presente (su remoción es parte del cleanup post-028).

## Self-Check: PASSED

- 9 archivos modificados verificados en disco.
- SUMMARY.md presente en disco.
- Commits 575f686, 0261cc6, e75a5fe presentes en git.
- `npx tsc --noEmit` limpio en todo el proyecto.

---
*Phase: 01-rls-lockdown-secret-isolation*
*Completed: 2026-06-16*
