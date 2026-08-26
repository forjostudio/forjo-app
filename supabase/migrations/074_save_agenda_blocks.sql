-- 074 — Guardado atómico de la agenda: franjas + mapeo franja↔servicio (motor-reservas / Phase 19 — AGENDA-05, v0.28).
--
-- Contexto (motor-reservas / Phase 19 — AGENDA-05, v0.28 "La agenda por servicio"):
--   El guardado de horarios de hoy (`saveHours()` en `app/(dashboard)/agenda/agenda-client.tsx`)
--   hace DOS cosas: `.delete().eq('business_id', ...)` sobre TODOS los bloques del negocio, y
--   después reinserta la grilla entera. Eso funcionaba mientras `time_blocks` no tenía hijos que
--   el dueño configurara a mano. Desde la migr. 071 sí los tiene: `time_block_services` es hijo de
--   `time_blocks` con `ON DELETE CASCADE`, así que **cualquier mapeo franja↔servicio que el dueño
--   configure se borraría solo al siguiente guardado de horarios** — y el estado al que vuelve
--   (COMODÍN, o sea "esta franja sirve para todos los servicios", D-01) es visualmente idéntico a
--   "todavía no configuré nada". Un dato que se pierde sin ruido y sin síntoma: el peor modo de
--   falla posible. AGENDA-05 no se puede cumplir sin resolver esto.
--
--   Y hay una ventana peor que la pérdida: entre el DELETE y el INSERT, la disponibilidad PÚBLICA
--   (`/api/booking/availability`) lee un estado intermedio en el que el negocio no tiene horarios,
--   o los tiene con el mapeo viejo. La transacción única lo elimina de raíz (D-04): una sola
--   llamada, un solo estado observable, todo-o-nada.
--
--   CERO cambios de esquema. La tabla puente (071), sus 4 policies, su índice inverso y sus FK
--   compuestas de pertenencia al tenant (073) ya existen. Lo único que agrega esta migración es la
--   función y sus privilegios.
--
-- Qué hace:
--   1. Guard de AUTORÍA: `p_business_id` tiene que ser un negocio cuyo `owner_id` sea `auth.uid()`,
--      o se rechaza con `not_your_business`.
--   2. Normaliza el payload: `NULL` ⇒ arreglo vacío; cualquier cosa que no sea un arreglo JSON ⇒
--      `invalid_payload`.
--   3. Aplica el DIFF: borra del negocio las franjas cuyo id no viene en el payload (el borrado en
--      cascada limpia su mapeo).
--   4. Recorre el payload elemento por elemento: valida la entrada, INSERT si viene sin id / UPDATE
--      si viene con id, y sincroniza el mapeo de esa franja (borra los que salieron, inserta los
--      que entraron).
--   5. Devuelve el set resultante del negocio con sus servicios agregados, para que el cliente
--      RE-DERIVE su estado sin correlacionar nada.
--   6. Todo lo anterior en UNA transacción: PostgREST envuelve cada request en una, así que
--      cualquier `RAISE` revierte la llamada entera. D-04 sale gratis.
--
-- ⚠ Divergencias del molde vivo del schema — hay dos y las dos son deliberadas:
--
--   (a) EL MODO DE SEGURIDAD ES **INVOKER**, al revés del único RPC no-trigger que hoy tiene el
--       schema (el del motor de reservas), que corre con los privilegios del owner de la función y
--       además está concedido al rol anónimo. Eso último es exactamente el riesgo aceptado RA-05
--       ("ese RPC es ejecutable por `anon` y saltea todos los controles del route handler").
--       Copiar ese molde acá crearía una SEGUNDA RA-05, esta vez sobre la CONFIGURACIÓN del
--       negocio: una función que borra y reescribe la agenda entera de un tenant no puede correr
--       con privilegios prestados. Con INVOKER, la RLS de `time_blocks`, de `time_block_services`
--       y de `businesses` aplica ADENTRO de la función, y el peor caso de un payload forjado por
--       un tercero es "no hace nada".
--
--   (b) POR ESO MISMO, el `p_business_id` explícito acá es la SEGUNDA capa, no la única defensa.
--       En el RPC del motor era al revés: al correr con los privilegios del owner, la RLS no aplica
--       adentro y el `business_id` explícito es lo ÚNICO que sostiene el aislamiento. Acá la RLS es
--       la primera capa y el guard de autoría + el `business_id` en cada WHERE/INSERT son el
--       refuerzo (regla dura de la skill `supabase-multitenant-rls`: la RLS es la segunda capa, no
--       la única — acá se cumple en los dos sentidos).
--
-- Qué NO hace (invariantes del proyecto):
--   - NO toca el esquema: ni una tabla, ni una columna, ni un índice, ni una policy, ni una vista.
--     Sólo `CREATE OR REPLACE FUNCTION` + privilegios.
--   - NO redefine ninguna función existente. El motor de reservas no se toca en esta fase.
--   - NO toca la vista pública `public_time_block_services` (071) ni sus grants (072).
--   - NO escribe la columna de cupo de `time_blocks` (D-12). Esa columna dejó de decidir el cupo en
--     la migr. 068 —el número vive en `services`, para los tres modos— y arrastrarla al código
--     nuevo la volvería a legitimar. Omitirla es seguro POR CONSTRUCCIÓN: es NOT NULL con DEFAULT
--     1, así que el INSERT que no la menciona toma el default y el UPDATE que no la menciona
--     conserva el valor histórico de la fila. D-12 pide dejar de ESCRIBIRLA, no resetearla a mano
--     (P-06: ponerla en 1 "para limpiar" perdería un dato histórico de los negocios que hoy tienen
--     bloques con cupo > 1, sin ningún motivo).
--   - NO se aplica por push remoto ni por el flujo GSD. La ÚNICA validación de este plan es
--     `supabase db reset` LOCAL (PG17), que replaya el baseline numerado en orden.
--
-- Runbook de aplicación (Plan 19-06, con checkpoint humano):
--   1. Aplicar A MANO en el SQL editor del dashboard, coordinado con el deploy del código que la
--      llama. Antes del deploy la función no existe y nadie la invoca; después del deploy, sin la
--      función, CADA guardado de horarios falla.
--   2. `NOTIFY pgrst, 'reload schema';` — OBLIGATORIO (P-05). PostgREST cachea el schema: sin esa
--      línea la función existe en la base pero NO está expuesta, y cada guardado devuelve
--      `PGRST202` ("Could not find the function ... in the schema cache"), un error indistinguible
--      de un problema de red para quien lo mira desde el navegador. La cabecera de la 071 ya
--      documenta este mismo modo de falla para la tabla y la vista.
--   3. Regenerar `supabase/schema.sql` QUIRÚRGICAMENTE (nunca por `supabase db dump`, que reordena
--      el archivo entero) — patrón del repo, igual que 042/057/059/071.
--
-- Verificación posterior (las dos consultas que el Plan 19-06 repite contra producción):
--   -- (i) privilegios efectivos + modo de seguridad de la función: `anon` NO debe aparecer,
--   --     `authenticated=X` SÍ, y `prosecdef` debe ser false.
--   SELECT p.proname, p.prosecdef, p.proacl::text
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'save_agenda_blocks';
--   -- (ii) el default de FUNCTIONS del schema public: no debe conceder ejecución a `anon`.
--   SELECT pg_get_userbyid(d.defaclrole), d.defaclacl::text
--     FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
--    WHERE n.nspname = 'public' AND d.defaclobjtype = 'f';

-- ── 1. save_agenda_blocks: el diff de la agenda + el mapeo, en una sola transacción ─────────────
-- Recibe el ESTADO DESEADO COMPLETO del negocio (los 7 días × todos los consultorios), no un delta:
-- el editor no guarda el estado original así que no puede calcular un delta confiable, y un delta
-- calculado en el cliente queda viejo si otra pestaña guardó en el medio. El estado deseado es
-- idempotente y es exactamente la semántica que el dueño ya tiene en la cabeza ("lo que veo es lo
-- que queda"). El shape del parámetro lo fija `AgendaBlockPayload` y el del retorno
-- `SavedAgendaBlock` (`lib/agenda-hours-payload.ts`, Plan 19-01): 7 columnas, sin cupo, sin claves
-- de correlación.
--
-- ⚠ NO se abre ni se cierra transacción a mano: PostgREST envuelve cada request en una transacción
-- y cualquier excepción revierte TODO lo hecho en la llamada. Eso es lo que convierte a D-04
-- (todo-o-nada) en gratis: no hay estado intermedio que el público pueda ver por la disponibilidad.
--
-- Idempotente por `CREATE OR REPLACE` (regla del README de migraciones): correrla dos veces no
-- rompe, y REPLACE conserva la ACL ya ajustada por la §2.
CREATE OR REPLACE FUNCTION "public"."save_agenda_blocks"("p_business_id" "uuid", "p_blocks" "jsonb") RETURNS TABLE("id" "uuid", "day_of_week" integer, "start_time" time without time zone, "end_time" time without time zone, "label" "text", "location_id" "uuid", "service_ids" "uuid"[])
    LANGUAGE "plpgsql"
    SECURITY INVOKER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  -- Payload ya normalizado: nunca NULL, siempre un arreglo JSON (ver paso 2).
  v_blocks jsonb;
  -- Elemento actual del recorrido (un bloque del editor).
  v_item jsonb;
  -- Ids de franja que SOBREVIVEN a este guardado (los que el payload trae con id). Todo lo que no
  -- esté acá se borra en el paso 3.
  v_keep uuid[];
  -- Id de la franja resultante del INSERT o del UPDATE del elemento actual. Es la clave con la que
  -- se sincroniza el mapeo, así que el camino nuevo y el camino existente convergen en la misma
  -- variable y el bloque de mapeo se escribe UNA sola vez.
  v_block_id uuid;
  -- Campos del elemento actual, ya extraídos y casteados desde el jsonb.
  v_day integer;
  v_start time without time zone;
  v_end time without time zone;
  v_label text;
  v_location uuid;
  -- Servicios mapeados a la franja actual. Arreglo VACÍO = franja comodín (D-01): la ausencia de
  -- filas ES el estado, no un dato faltante.
  v_service_ids uuid[];
BEGIN
  -- 1. GUARD DE AUTORÍA. Va igual habiendo RLS: es la regla dura del proyecto (la RLS es la segunda
  --    capa, no la única). Sin este guard, un `p_business_id` ajeno no rompería nada —la RLS haría
  --    que todos los WHERE devuelvan 0 filas— pero el resultado sería un guardado que "funcionó" y
  --    no hizo nada, o peor, un DELETE que el dueño real no pidió si alguna policy se aflojara. Con
  --    el guard, el intento se rechaza en la primera línea y con un código propio (T-19-06).
  IF p_business_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM "public"."businesses" AS b
        WHERE b."id" = p_business_id
          AND b."owner_id" = "auth"."uid"()
     )
  THEN
    RAISE EXCEPTION 'not_your_business' USING ERRCODE = 'P0001';
  END IF;

  -- 2. NORMALIZACIÓN DEL PAYLOAD. El arreglo VACÍO es legítimo y significa "el dueño cerró todos
  --    los días": el paso 3 borra todas las franjas del negocio, que es exactamente lo pedido. Lo
  --    que no es legítimo es que el parámetro no sea un arreglo (un objeto, un número, una cadena):
  --    eso es un cliente roto o un payload forjado, y se rechaza antes de tocar una sola fila (V5
  --    del ASVS: el jsonb entero viene del browser y no se le cree nada).
  v_blocks := COALESCE(p_blocks, '[]'::jsonb);
  IF jsonb_typeof(v_blocks) <> 'array' THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = 'P0001';
  END IF;

  -- 3. EL BORRADO DEL DIFF. Los ids NO NULOS que trae el payload son los que sobreviven; el resto
  --    de las franjas del negocio se van.
  --    Dos cosas que no son obvias y por eso se escriben:
  --      · Con `v_keep` VACÍO, `id <> ALL('{}')` es TRUE para toda fila ⇒ borra todos los bloques
  --        del negocio. Es el comportamiento deseado ("cerré todos los días"), no un accidente.
  --      · NO hace falta un DELETE aparte sobre la puente: `time_block_services` es el ÚNICO hijo
  --        de `time_blocks` y su FK es ON DELETE CASCADE (071), así que el mapeo de las franjas que
  --        se van se limpia solo. Escribirlo a mano sería una segunda fuente de verdad del borrado.
  --    El `business_id = p_business_id` explícito acota el alcance ADEMÁS de la RLS (T-19-07).
  SELECT COALESCE(array_agg((t.e->>'id')::uuid), ARRAY[]::uuid[])
    INTO v_keep
    FROM jsonb_array_elements(v_blocks) AS t(e)
   WHERE t.e->>'id' IS NOT NULL;

  DELETE FROM "public"."time_blocks" AS tb
   WHERE tb."business_id" = p_business_id
     AND tb."id" <> ALL (v_keep);

  -- 4. EL RECORRIDO, UN ELEMENTO A LA VEZ.
  FOR v_item IN SELECT t.e FROM jsonb_array_elements(v_blocks) AS t(e) LOOP
    -- 4a. Extracción. Etiqueta y consultorio vacíos ⇒ NULL: la base guarda `null`, no una cadena
    --     vacía (misma regla que `textOrNull` en `lib/agenda-hours-payload.ts`). Los ids de
    --     servicio salen a un arreglo de uuid; si la clave falta, viene como JSON null o no es un
    --     arreglo, se trata como arreglo vacío ⇒ franja comodín.
    v_day      := (v_item->>'day_of_week')::integer;
    v_start    := (v_item->>'start_time')::time without time zone;
    v_end      := (v_item->>'end_time')::time without time zone;
    v_label    := NULLIF(btrim(COALESCE(v_item->>'label', '')), '');
    v_location := NULLIF(btrim(COALESCE(v_item->>'location_id', '')), '')::uuid;

    SELECT COALESCE(array_agg(DISTINCT s.sid::uuid), ARRAY[]::uuid[])
      INTO v_service_ids
      FROM jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(v_item->'service_ids') = 'array'
                  THEN v_item->'service_ids'
                  ELSE '[]'::jsonb END
           ) AS s(sid);

    -- 4b. VALIDACIÓN DE ENTRADA (V5 del ASVS). El día tiene que caer en 0..6 (0 = domingo, igual
    --     que la columna) y la hora de inicio tiene que ser ESTRICTAMENTE menor que la de fin — una
    --     franja de duración cero o negativa no es una franja. El editor ya valida esto en
    --     pantalla, pero el editor es el browser: acá está el backstop (T-19-10).
    IF v_day IS NULL OR v_day < 0 OR v_day > 6
       OR v_start IS NULL OR v_end IS NULL OR v_start >= v_end
    THEN
      RAISE EXCEPTION 'invalid_block' USING ERRCODE = 'P0001';
    END IF;

    v_block_id := NULL;

    IF (v_item->>'id') IS NULL THEN
      -- 4c. FRANJA NUEVA ⇒ INSERT. El `business_id` sale del parámetro YA validado, nunca del
      --     elemento: mandarlo por bloque le daría al cliente una segunda forma de mentir.
      --     ⚠ La lista de columnas NO incluye la de cupo (D-12): es NOT NULL con DEFAULT 1, así que
      --     omitirla es seguro y es exactamente lo que la decisión pide.
      INSERT INTO "public"."time_blocks" AS tb
                  ("business_id", "day_of_week", "start_time", "end_time", "label", "location_id")
           VALUES (p_business_id, v_day, v_start, v_end, v_label, v_location)
        RETURNING tb."id" INTO v_block_id;
    ELSE
      -- 4d. FRANJA EXISTENTE ⇒ UPDATE sobre la MISMA fila. Esta es la razón de ser de toda la
      --     migración (D-01/D-02): cambiarle el horario a una franja que ya tiene servicios NO
      --     borra su mapeo, porque la fila no se borra ni se recrea — se actualiza, y el hijo ni se
      --     entera.
      --     El filtro lleva el `business_id` ADEMÁS del id: los ids de franja de CUALQUIER negocio
      --     son públicos (`public read time_blocks` con `USING (true)`), así que un payload forjado
      --     con un id ajeno es un ataque REALIZABLE, no teórico (T-19-07).
      --     ⚠ Las asignaciones TAMPOCO incluyen la de cupo: la fila conserva su valor histórico.
      --     D-12 pide dejar de escribirla, no resetearla (P-06).
      UPDATE "public"."time_blocks" AS tb
         SET "day_of_week" = v_day,
             "start_time"  = v_start,
             "end_time"    = v_end,
             "label"       = v_label,
             "location_id" = v_location
       WHERE tb."id" = (v_item->>'id')::uuid
         AND tb."business_id" = p_business_id
      RETURNING tb."id" INTO v_block_id;

      -- Si el UPDATE no tocó ninguna fila, el id no existe, es de otro negocio, o lo borró otra
      -- pestaña en el medio. Se rechaza en vez de degradar a INSERT: un fallo MUDO acá dejaría al
      -- dueño con una configuración distinta a la que vio en pantalla, y encima con un bloque
      -- duplicado si el id resucitara como fila nueva. Falla ruidosa y todo-o-nada.
      IF v_block_id IS NULL THEN
        RAISE EXCEPTION 'block_not_found' USING ERRCODE = 'P0001';
      END IF;
    END IF;

    -- 4e. SINCRONIZACIÓN DEL MAPEO DE ESA FRANJA. Primero salen los que ya no están, después entran
    --     los que faltan.
    --     ⚠ Volver a COMODÍN **es** borrar todas las filas (D-16/D-17): no existe ninguna fila que
    --     represente el estado vacío — la AUSENCIA es el estado. Por eso el arreglo vacío no es un
    --     caso especial acá: el DELETE se lleva todo y el INSERT no inserta nada.
    --     ⚠ La fila cross-tenant NO se valida acá a propósito: las FK compuestas
    --     `tbs_block_same_tenant` y `tbs_service_same_tenant` (migr. 073) ya rechazan en la BASE
    --     cualquier combinación en la que el bloque o el servicio no sean del negocio que declara la
    --     fila. Reimplementar esa validación en la función crearía una segunda fuente de verdad que
    --     puede divergir; el punto de la 073 es justamente que ningún consumidor tenga que
    --     acordarse (T-19-08).
    DELETE FROM "public"."time_block_services" AS tbs
     WHERE tbs."business_id" = p_business_id
       AND tbs."time_block_id" = v_block_id
       AND tbs."service_id" <> ALL (v_service_ids);

    INSERT INTO "public"."time_block_services" ("business_id", "time_block_id", "service_id")
    SELECT p_business_id, v_block_id, s.sid
      FROM unnest(v_service_ids) AS s(sid)
        ON CONFLICT ("time_block_id", "service_id") DO NOTHING;
  END LOOP;

  -- 5. EL RETORNO: el set FINAL del negocio, con su mapeo agregado por franja.
  --    ⚠ Esto NO es cosmético (P-01). El editor inicializa sus 7 días con `useState(initializer)` y
  --    NUNCA los re-deriva de las props: no hay `useEffect` que los re-sincronice, y
  --    `router.refresh()` no sirve porque el inicializador ya corrió y no vuelve a correr. Con el
  --    guardado por DIFF, un bloque insertado en el guardado #1 seguiría con el id vacío en el
  --    estado del cliente y el guardado #2 lo volvería a INSERTAR: cada bloque nuevo, duplicado.
  --    El cliente re-deriva su estado de ESTAS filas (`buildDayStatesFromRows`), así que no hay
  --    ninguna correlación payload↔retorno que mantener — y por eso tampoco hay clase de bug de
  --    correlación (se descartó la clave temporal por bloque que proponía el research).
  --    El LEFT JOIN va acotado por `business_id` en los DOS lados; el FILTER + COALESCE hacen que
  --    una franja sin mapeo vuelva con arreglo VACÍO y no con `{NULL}` ni con NULL, que es lo que
  --    `SavedAgendaBlock` espera para la franja comodín.
  RETURN QUERY
  SELECT tb."id",
         tb."day_of_week",
         tb."start_time",
         tb."end_time",
         tb."label",
         tb."location_id",
         COALESCE(
           array_agg(tbs."service_id" ORDER BY tbs."service_id")
             FILTER (WHERE tbs."service_id" IS NOT NULL),
           ARRAY[]::uuid[]
         )
    FROM "public"."time_blocks" AS tb
    LEFT JOIN "public"."time_block_services" AS tbs
           ON tbs."time_block_id" = tb."id"
          AND tbs."business_id" = p_business_id
   WHERE tb."business_id" = p_business_id
   GROUP BY tb."id", tb."day_of_week", tb."start_time", tb."end_time", tb."label", tb."location_id"
   ORDER BY tb."day_of_week", tb."start_time";
END;
$_$;

ALTER FUNCTION "public"."save_agenda_blocks"("p_business_id" "uuid", "p_blocks" "jsonb") OWNER TO "postgres";

-- ── 2. Privilegios de la función: sólo `authenticated` (P-02 / T-19-05) ────────────────────────
-- La función NACE ejecutable por el rol anónimo por DOS vías independientes que se SUMAN:
--   (i)  PostgreSQL concede EXECUTE a PUBLIC por defecto en toda función nueva; y
--   (ii) el baseline del proyecto tiene
--        `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon"`
--        (`00000000000000_baseline.sql:3081`), que sigue VIGENTE: la migr. 073 revocó los defaults
--        de escritura sólo sobre TABLES, nunca sobre FUNCTIONS.
-- Con INVOKER el daño de un olvido sería acotado (el rol anónimo no tiene ninguna policy de
-- escritura sobre `time_blocks`), pero el REVOKE es igual OBLIGATORIO: es la misma clase de agujero
-- que la 073 acaba de cerrar y dejarlo abierto sería una regresión de la postura de seguridad, no
-- un detalle.
--
-- ⚠ NO EXISTE PRECEDENTE EN EL REPO de revocar la ejecución de una función: las migraciones que
-- tocan privilegios de función hacen exactamente lo CONTRARIO (conceden a `anon`), y son el molde a
-- NO copiar. La FORMA de este bloque sale de la 072 —revocar primero, conceder lo mínimo después—,
-- trasladada del objeto TABLE al objeto FUNCTION. La firma va completa y comillada porque el nombre
-- solo no identifica una función.
REVOKE EXECUTE ON FUNCTION "public"."save_agenda_blocks"("uuid", "jsonb") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."save_agenda_blocks"("uuid", "jsonb") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."save_agenda_blocks"("uuid", "jsonb") TO "authenticated";

-- ── 3. El default de FUNCTIONS deja de conceder ejecución al rol anónimo (P-02, en la raíz) ────
-- La §2 tapa ESTA instancia; esta sección cierra LA FÁBRICA. Es el hermano exacto de la §1 de la
-- migr. 073 (que hizo lo mismo sobre TABLES) trasladado a FUNCTIONS: sin esto, la próxima función
-- que alguien agregue nace otra vez ejecutable por el rol anónimo y hay que acordarse del REVOKE.
--
-- ⚠ NO afecta a NINGUNA función existente: `ALTER DEFAULT PRIVILEGES` sólo aplica a objetos que se
-- creen DESPUÉS. En particular, la función del motor de reservas conserva su grant explícito y
-- sigue funcionando igual (RA-05 sigue siendo un riesgo aceptado; no se cierra ni se reabre acá).
--
-- ⚠ CONSECUENCIA BUSCADA: de acá en más toda función nueva del schema `public` necesita un GRANT
-- explícito para ser invocable desde el cliente. Es el lado correcto para fallar — un permiso
-- olvidado se ve al primer intento, un permiso de más no se ve nunca.
--
-- SÓLO se revoca para el rol anónimo: `authenticated` conserva su default, porque todo el dashboard
-- llama funciones con la sesión del dueño y romper eso rompería el flujo de desarrollo entero.
--
-- `pg_default_acl` tiene una entrada POR CREADOR (`postgres` y `supabase_admin`). El creador que
-- importa en este proyecto es `postgres` —es el rol con el que corren TANTO las migraciones locales
-- del CLI COMO el editor SQL del dashboard—, y va suelto. El de `supabase_admin` va dentro de un
-- bloque que degrada a NOTICE porque `postgres` no es miembro de ese rol y el ALTER tiraría
-- `42501 permission denied to change default privileges`, abortando la migración entera (molde
-- idéntico al de la 073).
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE EXECUTE ON FUNCTIONS FROM "anon";

DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public"
             REVOKE EXECUTE ON FUNCTIONS FROM "anon"';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE '074: sin permiso para alterar los default privileges de supabase_admin (EXECUTE/anon) — se deja como estaba. El creador efectivo de este proyecto es postgres (CLI + editor SQL), ya cubierto arriba.';
END $$;
