---
phase: quick-261124-obs
plan: "01"
subsystem: mp-connect
status: complete
tags: [mercadopago, oauth, multi-tenant, migration, rls]
requirements-completed: []
dependency-graph:
  requires: [lib/negocio-del-dueno.ts (quick 261124-neg), migración 053 (mp_connection_status)]
  provides: [businesses_mp_user_id_key (082), MP_ERROR_REASONS, resolveMpErrorReason, MP_CUENTA_EN_USO_TEXTO]
  affects: [app/api/mercadopago/callback/route.ts, Negocio → Integraciones, /onboarding/integraciones]
tech-stack:
  added: []
  patterns: [índice único parcial como fuente de verdad, lista cerrada de motivos en la URL, 23505 → código de dominio]
key-files:
  created:
    - supabase/migrations/082_businesses_mp_user_id_unique.sql
    - test/mp-user-id-unique.test.ts
  modified:
    - lib/oauth-return.ts
    - app/api/mercadopago/callback/route.ts
    - app/(dashboard)/settings/settings-client.tsx
    - app/(onboarding)/onboarding/integraciones/integraciones-client.tsx
    - supabase/schema.sql
    - test/oauth-return-routes.test.ts
    - test/mp-cobro-callback.test.ts
    - lib/oauth-return.test.ts
    - test/panel-tabs.test.ts
decisions:
  - "La base (índice único parcial 082) es la fuente de verdad: el cliente de sesión no ve negocios ajenos por RLS y no se mete service role en el callback"
  - "23505 en el update de businesses → ?mp=error&motivo=cuenta-en-uso ANTES del upsert de business_secrets: el negocio conserva su conexión anterior"
  - "El callback resuelve el negocio con negocioDelDueno y el update va por id + owner_id"
  - "En el onboarding, cuenta-en-uso gana aunque el negocio esté conectado (con la cuenta anterior): anunciar éxito escondería el rechazo"
metrics:
  duration: ~15min
  completed: 2026-11-24
plan_head_before: 9920a9208628b32b652bcea444c0cf39bee8c880
actuals:
  tokens: 11500
  tasks: 3
  commits: 3
---

# Quick 261124-obs: una cuenta de MercadoPago no puede quedar conectada a dos negocios

Índice único parcial `businesses_mp_user_id_key` (migración 082, con guarda que aborta sin tocar datos) + el callback del OAuth traduce el 23505 a `?mp=error&motivo=cuenta-en-uso` sin escribir secretos, resuelve el negocio con `negocioDelDueno` y acota el update a `id` + `owner_id`; panel y onboarding muestran el mensaje específico con el motivo de una lista cerrada.

## Commits

| Task | Commit | Qué |
|------|--------|-----|
| 1 (tracer) | `ea1457e` | 082 + `MP_ERROR_REASONS` + callback (23505 → cuenta-en-uso, negocioDelDueno, update por id + owner_id) + tests del callback |
| 2 | `d581ee3` | Suite db `test/mp-user-id-unique.test.ts` (5 casos) + espejo en `schema.sql` |
| 3 | `f8593e9` | `resolveMpErrorReason`, `MP_CUENTA_EN_USO_TEXTO`, `oauthReturnNotice` con motivo; panel y onboarding; tests |

`git diff --stat 9920a92..HEAD`: exactamente los 11 archivos de `files_modified` (500+/35-). No se tocaron `connect/route.ts`, `disconnect/route.ts`, `lib/negocio-del-dueno.ts`, `lib/overlay-history.ts`, `lib/dirty-history.ts`, `scripts/con-turno.mjs`, `next.config.ts`, `lib/onboarding-alta.ts` ni el state anti-CSRF.

## Base local: duplicados y cómo se validó la 082

- **Consulta de duplicados (solo lectura) sobre el Postgres local:** 0 filas. La base local tenía 1 solo negocio y ninguno con `mp_user_id` (los datos de la UAT de 261119-q8v ya no estaban), así que no hubo medición real del problema en local.
- **Validación de la 082 — camino alternativo, sin `supabase db reset`:** por la regla del dueño (el Supabase local es compartido con otra sesión concurrente) NO se reseteó ni se paró nada. Se aplicó el archivo entero por stdin: `docker exec -i supabase_db_forjo-app psql -U postgres -d postgres -v ON_ERROR_STOP=1 < 082…sql` → `DO` / `CREATE INDEX`, exit 0. Segunda corrida: `NOTICE: relation "businesses_mp_user_id_key" already exists, skipping`, exit 0 (idempotente).
- **Post-chequeo local:** `pg_indexes` → `CREATE UNIQUE INDEX businesses_mp_user_id_key ON public.businesses USING btree (mp_user_id) WHERE (mp_user_id IS NOT NULL)`.
- ⚠ Como no pasó por `db reset`, la 082 no quedó en la tabla de historial de migraciones del CLI local. En el próximo reset se aplica sola desde el archivo (es idempotente); no hace falta nada.
- **Guarda probada en rollback** (lote por pipe: BEGIN; DROP INDEX; 2 negocios `__guard_a`/`__guard_b` con el mismo `mp_user_id`; la 082 entera; ROLLBACK): psql exit 3 con
  `ERROR: 082: hay 1 cuenta(s) de MercadoPago conectada(s) a más de un negocio (2 negocios involucrados); no se creó el índice` + HINT a la consulta de la cabecera. El valor `__guard_dup` no aparece en la salida (grep = 0). Después: índice sigue en `pg_indexes`, 0 negocios `__guard%` (la transacción abortada se deshizo).

## Paso manual en prod (DESPUÉS del deploy)

**La 082 NO está aplicada en prod.** El código nuevo anda con y sin el índice (sin él, sólo no se rechaza la cuenta repetida), por eso va después del deploy. No lleva `NOTIFY pgrst` (es sólo un índice). Desde el SQL Editor:

1. **Consulta previa — tiene que dar 0 filas:**
   ```sql
   SELECT mp_user_id, count(*) AS negocios, array_agg(id ORDER BY created_at) AS business_ids
   FROM public.businesses
   WHERE mp_user_id IS NOT NULL
   GROUP BY mp_user_id
   HAVING count(*) > 1;
   ```
2. **Si devuelve filas, PARAR.** El dueño decide qué negocio se queda con la cuenta; el otro la suelta desde su panel (Negocio → Integraciones → Desconectar). Si es un dueño con dos negocios (el desconectar de hoy no llega al segundo), soltarla a mano en el negocio que la suelta:
   ```sql
   UPDATE public.businesses SET mp_user_id = NULL WHERE id = '<business_id>';
   UPDATE public.business_secrets
      SET mp_access_token = NULL, mp_refresh_token = NULL, mp_token_expires_at = NULL
    WHERE business_id = '<business_id>';
   ```
   Repetir 1 hasta 0 filas.
3. **Correr** `supabase/migrations/082_businesses_mp_user_id_unique.sql` entera. Si hay duplicados, aborta con `082: …` y no toca nada.
4. **Post-chequeo — 1 fila:**
   ```sql
   SELECT indexname, indexdef FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'businesses_mp_user_id_key';
   ```

Próxima migración libre después de esta: **083**.

## Evidencia

**RED (antes de implementar):**
- Task 1 (tests nuevos contra el callback de HEAD, restaurado byte a byte después): `5 failed | 26 passed (31)` — flujo sano (cadena maybeSingle / update por id), los dos 23505 y el heal MPCONN-05 (el fake nuevo ya no tiene `.single()`).
- Task 3: `15 failed | 171 passed (186)` — `resolveMpErrorReason is not a function`, `expected 'error' to be 'cuenta-en-uso'`, `expected 'success' to be 'cuenta-en-uso'`, candado (g) de panel-tabs.

**GREEN:**
- `./node_modules/.bin/tsc --noEmit` → exit 0.
- `npm test -- lib/oauth-return.test.ts test/panel-tabs.test.ts test/oauth-return-routes.test.ts` → 215 passed.
- `npm test -- test/mp-user-id-unique.test.ts` → **5 passed, 0 skipped, carril `|db|`** contra el Postgres local; fixtures limpias después (0 negocios `__test%`).
- `npm test` completo (17:58 hora AR, dentro de la ventana [01:00, 23:30], los canarios de reloj no aplican) → **125 archivos, 2485 passed | 4 expected fail | 1 skipped** (los `it.fails`/`skipIf` preexistentes de appointment-time, service-delete-gate y capacity-mode-change-gate; ninguno de este quick).
- `npm run build` → la primera corrida falló con 30 errores de `next/font/google` (fetch a fonts.gstatic, el intermitente conocido); la segunda, sin cambios, salió **exit 0**.
- Greps del plan: `.single()` fuera de comentarios en el callback = 0; `negocioDelDueno(` = 1; `delete|truncate` fuera de comentarios en la 082 = 0; `"businesses_mp_user_id_key"` en schema.sql = 1; `drop: ['mp', 'google', 'motivo']` = 1; `oauthReturnNotice(mp, mpConnected, motivo)` = 1.

**ESLint antes/después (por archivo):**

| Archivo | Antes | Después |
|---------|-------|---------|
| lib/oauth-return.ts | 0 | 0 |
| lib/oauth-return.test.ts | 0 | 0 |
| app/api/mercadopago/callback/route.ts | 0 | 0 |
| app/(dashboard)/settings/settings-client.tsx | 10 errores (react-hooks/set-state-in-effect, immutability, purity) | los mismos 10, desplazados 7 líneas; ninguno en las líneas tocadas |
| app/(onboarding)/onboarding/integraciones/integraciones-client.tsx | 0 | 0 |
| test/oauth-return-routes.test.ts | 0 | 0 |
| test/mp-cobro-callback.test.ts | 0 | 0 |
| test/mp-user-id-unique.test.ts | (nuevo) | 0 |
| test/panel-tabs.test.ts | 0 | 0 |

**No comprobado:** la UAT visual del `<human-check>` (toasts en /negocio y en /onboarding/integraciones con un navegador real) no se corrió en este quick; queda para la UAT de fin de fase vía `node scripts/con-turno.mjs`. Tampoco se midió un rojo de la suite db sin el índice (habría que borrar el índice en la base compartida).

## Deviations from Plan

1. **[Override del orquestador] Sin `supabase db reset`.** Se usó el camino alternativo del propio plan (psql por stdin, idempotente). El `<verify>` que buscaba `Applying migration 082…` en un log de reset se reemplazó por el log de psql sin ERROR + `pg_indexes`.
2. **[Rule 1 - Test] Orden de los parámetros en un `it.each`.** El título del caso 23505 mostraba la cookie en lugar del destino; se reordenó la tupla. Sin efecto en lo que se asserta.
3. Task 3 (tdd) se commiteó en un solo commit (tests + implementación), con el RED registrado arriba.

## Fuera de scope (follow-ups)

- `app/api/mercadopago/disconnect/route.ts` sigue con `.single()` y el update por `owner_id`: un dueño con dos negocios recibe 404 al desconectar. El camino manual para soltar una cuenta en ese caso está en la cabecera de la 082.
- El índice de la 080 (`businesses_mp_plan_id_active_key`) no está espejado en `supabase/schema.sql`.
- T-obs-09 (aceptado): re-autorizar la cuenta en MP desde el segundo negocio puede rotar los tokens del primero antes de que nuestro callback la rechace; no se puede evitar desde Forjo. Si pasa, el resolver de v0.23 marca la conexión en error y el banner pide reconectar.

## Threat Flags

Ninguna superficie nueva fuera del `<threat_model>` del plan.

## Self-Check: PASSED

- FOUND: supabase/migrations/082_businesses_mp_user_id_unique.sql, test/mp-user-id-unique.test.ts
- FOUND: ea1457e, d581ee3, f8593e9 (`git rev-list --count 9920a92..HEAD` = 3)
