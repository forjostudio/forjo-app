-- 076 — `book_slot_atomic` deja de ser ejecutable por el rol anónimo
--       (motor-reservas / quick 260902-h6m — cierre del hallazgo X-16-A y del riesgo aceptado RA-05).
--
-- ── Contexto ────────────────────────────────────────────────────────────────────────────────────
--   `book_slot_atomic` es `SECURITY DEFINER` (`prosecdef = t`) y tiene `GRANT EXECUTE ... TO "anon"`
--   desde la migración **041**, re-otorgado idéntico en la 042, 058, 062, 063, 064, 068 y 069.
--   **Adentro de una función definer la RLS no corre**, así que el bloqueo que sí atrapa a un
--   `INSERT` directo sobre `appointments` no aplica: cualquiera con la anon key —que viaja en el
--   bundle del navegador de todo el que abra `/[slug]`— podía llamar la función por PostgREST y
--   crear un turno **salteándose los tres controles del booking público**, que viven SOLO en
--   `app/api/booking/create/route.ts`:
--     1. ventana de reserva (`isDateOutOfWindow`, `lib/booking-window.ts`),
--     2. gate de plan (`plan_status`),
--     3. reCAPTCHA.
--   Los dos únicos parámetros no adivinables (`business_id`, `service_id`) **son públicos**: los
--   publica la vista `public_services`. El ataque es realizable, no teórico.
--
--   NO es cross-tenant: la función re-impone `p_business_id` internamente y no se puede escribir en
--   otro negocio. Lo que se abre es el eje que ninguna auditoría previa miró — *controles que
--   existen sólo en el route handler mientras la base expone el mismo camino sin ellos*.
--
-- ── Medición previa (quick 260902-h6m, 2026-09-02, Postgres local PG17) ─────────────────────────
--   El bypass se reprodujo por las DOS vías antes de escribir una línea de esta migración:
--
--   (1) Superficie REAL (PostgREST + anon key sin sesión), `test/book-slot-atomic-anon-revoke.test.ts`:
--       la llamada anónima devolvió `error = null` —o sea, creó el turno— con un payload que el
--       route handler público rechazaría DOS veces (fecha `2031-03-03` con `max_advance_days = 7`
--       ⇒ 400 `date_out_of_window`; `plan_status = 'cancelled'` ⇒ 403 `plan_inactive`).
--
--   (2) `SET LOCAL ROLE anon` + `ROLLBACK` en una sola transacción (la vía del todo original):
--
--         chequeo                  | anon_puede_ejecutar
--         -------------------------+---------------------
--         privilegio ANTES del fix | t
--
--         NOTICE:  G1 control negativo OK: INSERT directo BLOQUEADO por RLS (42501)
--
--         resultado                                  | appointment_id
--         -------------------------------------------+--------------------------------------
--         turno creado por anon via book_slot_atomic | fc8026bb-81c3-4cfe-b90b-1cf6e442b487
--
--       El mismo rol que NO puede insertar directo (42501) SÍ crea el turno por la función definer.
--       La transacción terminó en `ROLLBACK`: no quedó nada escrito.
--
-- ── Por qué se REVOCA y no se lleva la ventana adentro de la función ────────────────────────────
--   El todo dejaba dos caminos. NO cubren lo mismo:
--
--     | Camino                                        | Ventana | Gate de plan  | reCAPTCHA     |
--     |-----------------------------------------------|---------|---------------|---------------|
--     | Llevar `isDateOutOfWindow` adentro del RPC     | cierra  | SIGUE ABIERTO | SIGUE ABIERTO |
--     | Revocar la ejecución al rol anónimo (esta)     | cierra  | cierra        | cierra        |
--
--   Además, mover la ventana a la base DUPLICA una regla de negocio que hoy tiene una sola fuente de
--   verdad (`lib/booking-window.ts`, con su propia suite y su manejo de hora AR), y las dos copias se
--   desincronizarían a la primera excepción de negocio.
--
--   La condición que el todo marcaba como PREVIA —"verificar primero que ninguna superficie anónima
--   llame al RPC directo, o se rompe el booking público"— se midió y se cumple. Hay UN solo call site
--   en producción (`lib/booking-core.ts:499`), que recibe el cliente por parámetro y nunca lo crea;
--   sus llamadores, medidos uno por uno:
--
--     app/api/booking/create/route.ts:91        → createAdminClient()      ⇒ service_role
--     app/api/appointments/create/route.ts:23   → await createClient()     ⇒ authenticated
--     lib/abono-generation.ts:196 (rol-agnóstico), con sus dos invocadores:
--       app/api/abonos/create/route.ts:73       → await createClient()     ⇒ authenticated
--       app/api/cron/cancel-expired/route.ts:253→ createAdminClient()      ⇒ service_role
--
--   Ninguno usa la anon key sin sesión. Los dos roles que quedan con EXECUTE cubren los tres caminos
--   de alta (booking público, alta manual del dueño, generación de abonos).
--
-- ── Qué hace ────────────────────────────────────────────────────────────────────────────────────
--   1. `REVOKE EXECUTE ... FROM PUBLIC` y `FROM "anon"` sobre `book_slot_atomic`.
--   2. Re-`GRANT EXECUTE` explícito a `authenticated` y a `service_role`.
--   3. Guard de post-estado que ABORTA la transacción si el estado final no es el esperado.
--
-- ── Qué NO hace ─────────────────────────────────────────────────────────────────────────────────
--   NO toca el CUERPO de la función: el motor de reservas no se redefine acá (ni advisory lock, ni
--   cupo, ni asignación de profesional, ni gates de espacio). NO toca ninguna tabla, columna, índice,
--   policy ni vista. NO toca ninguna migración previa (041 … 075 ya corrieron y son inmutables).
--
-- ── POR QUÉ ESTA MIGRACIÓN NO ESTÁ ACOPLADA A NINGÚN DEPLOY ─────────────────────────────────────
--   Los tres callers usan `service_role` o `authenticated` (medido arriba), así que revocar el
--   privilegio del rol anónimo NO cambia el comportamiento de ninguna superficie viva de la app. Se
--   puede aplicar SOLA, antes o después de cualquier deploy, sin ventana de coordinación. Es lo
--   contrario de la 074, que sí venía acoplada al código que estrenaba la función. Decirlo explícito
--   ahorra una coordinación que no hace falta.
--
-- ── POR QUÉ LOS DOS `REVOKE` Y POR QUÉ EN ESE ORDEN ─────────────────────────────────────────────
--   No son redundantes; sacan DOS concesiones independientes que se suman:
--     · `FROM PUBLIC` saca la concesión implícita que Postgres le da a PUBLIC en toda función nueva
--       (y que el baseline del proyecto reforzaba con `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON
--       FUNCTIONS TO "anon"`, vigente cuando se creó esta función).
--     · `FROM "anon"` saca la concesión EXPLÍCITA de las migraciones 041/042/058/062/063/064/068/069.
--   Sacar sólo una deja el privilegio en pie por la otra vía y la migración saldría verde igual.
--   Los dos `GRANT` van DESPUÉS de los `REVOKE` porque `REVOKE ... FROM PUBLIC` también le saca a
--   `authenticated` y a `service_role` lo que tuvieran por HERENCIA de PUBLIC; re-otorgarlos explícito
--   los deja independientes de esa herencia. Misma forma que la 074 (único precedente del repo de
--   revocar la ejecución de una función), trasladada a esta firma.
--
--   ⚠ La firma de los CATORCE argumentos va COMPLETA y va copiada byte a byte de
--   `069_shared_capacity_agenda_and_space_gates.sql:489`. El NOMBRE SOLO NO IDENTIFICA UNA FUNCIÓN:
--   una firma con un tipo distinto apunta a otra función (o a ninguna) y el REVOKE no revoca nada
--   mientras la migración sale verde. El guard del §3 es la red que caza exactamente ese error.
--
-- ── RUNBOOK DE PRODUCCIÓN (esta migración NO se aplicó allá) ────────────────────────────────────
--
--   (a) PRE-FLIGHT — correr primero esto en el SQL editor de producción:
--
--         SELECT rol,
--                has_function_privilege(rol,
--                  'public.book_slot_atomic(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone)'::regprocedure,
--                  'EXECUTE') AS puede_ejecutar
--           FROM unnest(ARRAY['anon','authenticated','service_role']) AS rol;
--
--       Esperado ANTES de aplicar: `anon = t`, `authenticated = t`, `service_role = t`.
--       Si `anon` ya viniera en `f`, la migración es un no-op y no hace falta aplicarla.
--
--   (b) CHEQUEO DE CONSUMIDORES — la condición que el todo exigía, re-verificada EN EL MOMENTO DE
--       APLICAR y no sólo en el de planificar. Confirmar que ninguna integración externa llame al
--       RPC con la anon key. Los tres callers de la app usan service_role/authenticated (medido
--       arriba). El agente de WhatsApp consume `/api/agent/context` por HTTP, no PostgREST, así que
--       no se ve afectado. **Si apareciera un consumidor nuevo con anon key desde que se escribió
--       esta migración: NO aplicar y reabrir la decisión** — el revoke le rompería el alta de turnos.
--
--   (c) Pegar y ejecutar este archivo **COMPLETO, de una sola vez** — nunca statement por statement.
--       Partirlo rompe la atomicidad del BEGIN/COMMIT: si el `GRANT` fallara después de un `REVOKE`
--       ya autocommiteado, el alta manual del dueño se quedaría SIN poder ejecutar la función.
--
--   (d) VERIFICACIÓN POSTERIOR — la MISMA query del pre-flight.
--       Esperado: `anon = f`, `authenticated = t`, `service_role = t`.
--       Y una prueba de humo FUNCIONAL, que es la que de verdad importa: crear un turno desde el link
--       público del negocio y otro desde el alta manual del panel. Los dos tienen que funcionar.
--
--   (e) RECIÉN DESPUÉS de aplicarla, espejar `supabase/schema.sql` A MANO y de forma QUIRÚRGICA
--       —nunca con `db dump` (decisión del repo desde la Phase 06)—:
--         · borrar la línea `GRANT ALL ON FUNCTION "public"."book_slot_atomic"(...) TO "anon";`
--           (~`schema.sql:2884`) — la de `anon` ÚNICAMENTE; las de `authenticated` y `service_role`
--           se quedan;
--         · actualizar la nota de `~schema.sql:4449`, que hoy dice que `book_slot_atomic` conserva su
--           grant explícito a `anon` y que RA-05 sigue siendo un riesgo aceptado. Deja de ser cierto.
--       Antes de aplicarla, `schema.sql` NO se toca: es el espejo del estado REAL de producción, y
--       reflejar una migración no aplicada lo convierte en mentira.
--
--   (f) ORDEN — producción tiene aplicada hasta la **075 inclusive**. La 075 se aplicó el 2026-08-31
--       y quedó verificada con evidencia cruda del operador (`pg_constraint` devuelve una sola fila,
--       `tb_location_same_tenant`, y `time_blocks_location_id_fkey` ya no existe). Las migraciones se
--       aplican en orden numérico sin excepción: la 076 es la siguiente y no tiene nada delante.
--       Re-verificar igual el estado real antes de aplicar.
--
-- Idempotente: `REVOKE`/`GRANT` son declarativos (fijan el estado final, no lo incrementan), así que
-- correr este archivo dos veces deja exactamente el mismo ACL. Sin datos que migrar y sin downtime.

BEGIN;

-- ── 1. El rol anónimo pierde la ejecución; los otros dos la conservan explícita ──────────────────
REVOKE EXECUTE ON FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) TO "service_role";

-- ── 2. Guard de post-estado, DENTRO de la misma transacción ──────────────────────────────────────
-- Aborta, no avisa. Esta migración se aplica A MANO en el SQL editor de producción y una "consulta
-- posterior recomendada" se saltea; un `RAISE EXCEPTION` no. Cubre los DOS modos de falla que la
-- salida verde de un `REVOKE` no distingue:
--   · que la firma apunte a otra función (el revoke "funciona" sin revocar nada) ⇒ `anon` sigue en `t`;
--   · que el revoke se haya pasado de rosca ⇒ `authenticated` o `service_role` quedan en `f` y el
--     alta manual del dueño / el booking público se rompen en producción.
-- El `::regprocedure` es parte del guard: si la firma no resolviera a ninguna función existente, el
-- cast tira `42883 function does not exist` acá adentro y la transacción se revierte igual.
DO $$
DECLARE
  "v_firma" "regprocedure" := 'public.book_slot_atomic(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone)'::"regprocedure";
  "v_anon" boolean;
  "v_auth" boolean;
  "v_svc"  boolean;
BEGIN
  "v_anon" := has_function_privilege('anon', "v_firma", 'EXECUTE');
  "v_auth" := has_function_privilege('authenticated', "v_firma", 'EXECUTE');
  "v_svc"  := has_function_privilege('service_role', "v_firma", 'EXECUTE');

  IF "v_anon" THEN
    RAISE EXCEPTION '076: el rol anon TODAVIA puede ejecutar book_slot_atomic despues del REVOKE. Casi seguro la firma de 14 argumentos no coincide con la funcion real (el nombre solo no identifica una funcion) y el REVOKE apunto a otro objeto. Comparar contra 069_shared_capacity_agenda_and_space_gates.sql:489. La transaccion se revierte entera: no quedo nada aplicado.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT "v_auth" THEN
    RAISE EXCEPTION '076: el rol authenticated PERDIO la ejecucion de book_slot_atomic. Es el rol del ALTA MANUAL del dueno (app/api/appointments/create/route.ts) y del alta de abonos (app/api/abonos/create/route.ts): sin este privilegio el panel no puede crear turnos. La transaccion se revierte entera.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT "v_svc" THEN
    RAISE EXCEPTION '076: el rol service_role PERDIO la ejecucion de book_slot_atomic. Es el rol del BOOKING PUBLICO (app/api/booking/create/route.ts) y del cron de abonos (app/api/cron/cancel-expired/route.ts): sin este privilegio la pagina publica no puede crear turnos. La transaccion se revierte entera.'
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '076 OK: book_slot_atomic queda ejecutable por authenticated y service_role, y NO por anon.';
END
$$;

COMMIT;

-- ── Recargar el schema cache de PostgREST ────────────────────────────────────────────────────────
-- PostgREST cachea el schema JUNTO CON los privilegios: sin el reload, el revoke puede tardar en
-- verse desde la API y la verificación posterior del runbook daría un falso negativo (parecería que
-- el rol anónimo todavía puede). Idempotente: correrlo de más no rompe nada.
NOTIFY pgrst, 'reload schema';
