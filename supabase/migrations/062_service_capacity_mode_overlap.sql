-- 062 — Cupo por SOLAPE (recurso simultáneo) vs cupo por HORA EXACTA (clase grupal), por servicio.
--
-- Contexto (motor-reservas / Phase 12 — CUPO-01..CUPO-05, v0.26):
--   Hoy "cupo N" significa UNA sola cosa: N inscriptos que arrancan a la MISMA hora exacta (clase
--   grupal, 041: cupo en `time_blocks.capacity` + count por date+time exacto). Eso NO modela un
--   RECURSO SIMULTÁNEO: una kinesióloga con 2 camillas atiende turnos ESCALONADOS (16:00 y 16:15)
--   que se solapan en el tiempo pero arrancan en instantes distintos. Con el motor vigente esos dos
--   turnos toman advisory locks DISTINTOS (el lock es hash(business_id+date+time), 058:82-83) y el
--   conteo mira `date+time` exacto sin tocar nunca `duration_minutes` → el 3er turno escalonado se
--   cuela y hay SOBRECUPO (bug reproducido en el UAT de la fase 07).
--
--   La corrección: cada SERVICIO declara qué significa su cupo (`capacity_mode`), y el RPC atómico
--   bifurca por modo:
--     - 'group_class'          = comportamiento ACTUAL, byte-idéntico: cupo de `time_blocks.capacity`
--                                contado por hora de inicio exacta. Es el DEFAULT ⇒ cero regresión.
--     - 'simultaneous_resource'= cupo de `services.capacity` contado por SOLAPE de intervalos
--                                (`tsrange &&`) entre turnos del MISMO service_id (D-02/D-03), con el
--                                advisory lock re-granularizado a hash(business_id+service_id+date)
--                                para que las reservas ESCALONADAS de ese servicio-día serialicen (D-06).
--
-- Qué hace:
--   1. services.capacity_mode text NOT NULL DEFAULT 'group_class' — enum extensible vía CHECK (D-01,
--      elegido sobre boolean para sumar modos futuros sin re-migrar). El DEFAULT cubre TODAS las filas
--      existentes (incluidas las CANCHAS, que usan `services` desde la 043 — D-14) ⇒ NO hay backfill
--      y ningún negocio cambia de semántica (CUPO-05).
--   2. services.capacity smallint NOT NULL DEFAULT 1 — el cupo N del recurso simultáneo (D-02). Lo lee
--      SOLO la rama simultánea; la clase grupal sigue leyendo `time_blocks.capacity` INTACTO (el cupo
--      del grupal es de LA CLASE/slot: yoga 16:00=10, 18:00=15; no se puede mover al servicio).
--   3. Los 2 CHECK fail-closed a nivel DB (ASVS V5): el panel escribe estas columnas con anon+RLS vía
--      PostgREST, así que el enum y el `capacity >= 1` se validan en la base, no solo en la UI.
--   4. public_services expone `capacity_mode` (columna al FINAL del SELECT): el selector público
--      necesita saber el modo para ocultar "Cualquiera" en servicios simultáneos (D-13). Es un flag de
--      PRESENTACIÓN (enum acotado, no PII) ⇒ está bien que viaje a anon.
--   5. book_slot_atomic REDEFINIDO in-place, mode-aware (ver el bloque 5 más abajo).
--
-- Qué NO hace (invariantes del proyecto):
--   - NO expone `capacity` (el N) en la vista pública: mantener "cuántos lugares quedan" server-side
--     es el no-leak ya establecido (D-06 de Phase 2 / D-12). El público solo ve libre/lleno.
--   - NO cambia la firma del RPC: mismos 14 params + el RETURNS TABLE (id, cancel_token) BYTE-idénticos
--     a 041/042/058 → CREATE OR REPLACE puro, SIN DROP FUNCTION (cambiar params o el RETURNS obliga a
--     recrearla y rompería los 4 callers que entran por createAppointmentCore).
--   - NO toca `time_blocks`, `appointments`, el índice único 011, el EXCLUDE 013, ni ninguna policy RLS.
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado + 040..062 en orden. Prod se aplica A MANO coordinado con el
--     deploy + `NOTIFY pgrst, 'reload schema';`. La última migración en prod = 061. Tras aplicar,
--     regenerar `supabase/schema.sql` (patrón del repo, igual que 042/055/058/061).

-- ── 1. Columnas: NOT NULL DEFAULT (cubren las filas existentes sin backfill, D-01/D-02/D-14) ──────
ALTER TABLE "public"."services"
  ADD COLUMN IF NOT EXISTS "capacity_mode" "text" NOT NULL DEFAULT 'group_class';

ALTER TABLE "public"."services"
  ADD COLUMN IF NOT EXISTS "capacity" smallint NOT NULL DEFAULT 1;

-- ── 2. CHECK del enum. Idempotente: sólo se crea si no existe (re-correr = no-op). Molde 055/061 ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'services_capacity_mode_chk'
       AND "conrelid" = '"public"."services"'::"regclass"
  ) THEN
    ALTER TABLE "public"."services"
      ADD CONSTRAINT "services_capacity_mode_chk"
      CHECK ("capacity_mode" IN ('group_class', 'simultaneous_resource'));
  END IF;
END
$$;

-- ── 3. CHECK del cupo: al menos 1 lugar. Mismo molde idempotente ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'services_capacity_positive'
       AND "conrelid" = '"public"."services"'::"regclass"
  ) THEN
    ALTER TABLE "public"."services"
      ADD CONSTRAINT "services_capacity_positive"
      CHECK ("capacity" >= 1);
  END IF;
END
$$;

-- ── 4. Exponer SOLO capacity_mode en la vista pública acotada (D-13, molde migr. 061) ─────────────
-- CREATE OR REPLACE: agrega la columna al FINAL del SELECT (Postgres solo permite añadir columnas al
-- final, no reordenar/quitar). El `WHERE active = true` queda intacto. `capacity` NO se expone: el N
-- de lugares es server-side (no-leak D-06/D-12); el read-path de disponibilidad usa service-role y
-- lee `services` directo, así que no necesita la vista. Preserva OWNER/GRANT; se re-emiten por
-- idempotencia/claridad.
CREATE OR REPLACE VIEW "public"."public_services" AS
 SELECT "id",
    "business_id",
    "name",
    "duration_minutes",
    "price",
    "description",
    "active",
    "location_id",
    "location_ids",
    "created_at",
    "capacity_mode"
   FROM "public"."services"
  WHERE ("active" = true);


ALTER VIEW "public"."public_services" OWNER TO "postgres";


-- GRANT (mismo patrón que el baseline: GRANT ALL a los 3 roles, para no divergir del repo).
GRANT ALL ON TABLE "public"."public_services" TO "anon";
GRANT ALL ON TABLE "public"."public_services" TO "authenticated";
GRANT ALL ON TABLE "public"."public_services" TO "service_role";

-- ── 5. book_slot_atomic REDEFINIDO IN-PLACE — mode-aware (lock por modo + gate por solape) ────────
-- Firma BYTE-IDÉNTICA a 058:44-59 (14 params + RETURNS TABLE (id, cancel_token)). El cuerpo es el de
-- 058 con TRES cambios quirúrgicos y nada más:
--   (A) leer capacity_mode/capacity del servicio ANTES del lock (config estable: no compite en la
--       carrera de reservas), filtrando por business_id EXPLÍCITO (SECURITY DEFINER ⇒ RLS NO protege
--       adentro, D-07 / skill supabase-multitenant-rls);
--   (B) elegir la GRANULARIDAD del advisory lock según el modo (D-06);
--   (E/F) bifurcar SOLO el gate de cupo + is_group según el modo.
-- La selección "cualquiera" (058:88-137) y el bloque de exclusión por espacio (058:143-182) quedan
-- BYTE-IDÉNTICOS. La rama 'group_class' es byte-idéntica a 058:184-211 ⇒ cero regresión (CUPO-05).
CREATE OR REPLACE FUNCTION "public"."book_slot_atomic"(
  "p_business_id" uuid,
  "p_professional_id" uuid,
  "p_service_id" uuid,
  "p_location_id" uuid,
  "p_date" date,
  "p_time" time without time zone,
  "p_duration" integer,
  "p_client_id" uuid,
  "p_client_name" text,
  "p_client_phone" text,
  "p_client_email" text,
  "p_notes" text,
  "p_status" text,
  "p_expires_at" timestamp with time zone
) RETURNS TABLE ("id" uuid, "cancel_token" uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- (062) modo de cupo del SERVICIO: 'group_class' (default histórico) | 'simultaneous_resource'.
  v_mode text;
  -- (062) cupo N del recurso simultáneo (services.capacity). Lo lee SOLO la rama simultánea.
  v_svc_cap int;
  -- (062) turnos del MISMO servicio que SOLAPAN el intervalo pedido (gate del modo simultáneo).
  v_overlap int;
  -- (062) is_group de la fila a insertar; hoy 058 lo calcula inline como (v_capacity > 1). Pasa a
  -- variable porque cada modo lo deriva de SU fuente de cupo (LANDMINE del EXCLUDE 013, ver abajo).
  v_is_group boolean;
  -- (058) profesional EFECTIVO que se inserta: arranca en p_professional_id y, si el caller mandó el
  -- UUID mágico "cualquiera", se sobrescribe con el elegido bajo el lock. NUNCA se inserta el mágico.
  v_effective_pro uuid := p_professional_id;
  -- (058) ¿el caller pidió "cualquiera"? UUID mágico DISTINTO del sentinel cero ("sin profesional").
  v_is_any boolean := (p_professional_id = '00000000-0000-0000-0000-000000000001'::uuid);
  -- v_bucket se RECOMPUTA tras la selección con v_effective_pro (Pitfall 1: byte-idéntico al índice 011).
  v_bucket uuid;
  v_capacity int;
  v_occupied int;
  v_seat smallint;
  v_space_ids uuid[];   -- (042) espacios físicos que ocupa la agenda reservada (vía agenda_spaces)
  v_sid uuid;           -- (042) iterador del FOREACH del lock por espacio
BEGIN
  -- 0. (062, D-07) Modo de cupo del servicio. Se lee ANTES del lock a propósito: es CONFIGURACIÓN del
  --    negocio (no compite en la carrera de reservas), así que no necesita serializarse — y encima
  --    define QUÉ lock hay que tomar. Filtro por business_id EXPLÍCITO: adentro de un SECURITY DEFINER
  --    la RLS no aplica, así que un p_service_id de otro tenant NO debe resolver a nada.
  --    COALESCE final = fail-safe al modo histórico si el servicio no resolviera (el core ya lo valida
  --    por business_id antes del RPC): ante la duda, comportamiento actual.
  SELECT s.capacity_mode, COALESCE(s.capacity, 1)
    INTO v_mode, v_svc_cap
  FROM services s
  WHERE s.id = p_service_id
    AND s.business_id = p_business_id;
  v_mode := COALESCE(v_mode, 'group_class');
  v_svc_cap := COALESCE(v_svc_cap, 1);

  -- 1. (062, D-06) Advisory lock del slot, con la GRANULARIDAD que pide cada modo.
  --    - 'simultaneous_resource': la carrera a serializar es la del SERVICIO ese DÍA, porque el cupo
  --      se decide por SOLAPE y dos reservas escalonadas (16:00 y 16:15) tienen `time` distinto → con
  --      el key fino tomaban locks DISTINTOS, no serializaban, y ambas pasaban el gate (= el sobrecupo
  --      que esta migración corrige). El key (business_id + service_id + date) cubre exactamente el
  --      conjunto sobre el que se cuenta. Cada servicio simultáneo tiene su propio carril (D-04).
  --    - resto ('group_class', cupo 1, canchas, abonos): key de 058:82-83 INALTERADO → esas rutas
  --      quedan byte-idénticas y no se les baja la concurrencia.
  --    En AMBOS casos el lock se toma PRIMERO, antes de los locks por espacio (042, orden ascendente):
  --    el orden parcial global `modo < espacios` se mantiene en toda transacción ⇒ deadlock-free.
  --    hashtextextended → bigint (forma de un argumento, seed 0).
  IF v_mode = 'simultaneous_resource' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_business_id::text || p_service_id::text || p_date::text, 0));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_business_id::text || p_date::text || p_time::text, 0));
  END IF;

  -- 2. (058, §GA2 / D-01/D-02/D-03/D-07/D-08/D-10) Selección del profesional "cualquiera" BAJO el lock.
  --    Solo si el caller pidió "cualquiera". La selección corre DESPUÉS del lock (Pitfall 2: correrla
  --    antes reintroduce la carrera) y ANTES del bloque de espacio (que necesita el pro elegido).
  --    (062) SIN CAMBIO: el modo simultáneo no ofrece "Cualquiera" en la reserva pública (D-13).
  IF v_is_any THEN
    SELECT p.id
    INTO   v_effective_pro
    FROM   professionals p
    WHERE  p.business_id = p_business_id                            -- D-08 tenant explícito
      AND  p.active = true                                          -- D-07 activos
      AND  p.service_id IS NULL                                     -- excluir CANCHAS (Pitfall 6): una cancha
                                                                    --   (professional con service_id NOT NULL)
                                                                    --   con 0 filas en professional_services
                                                                    --   sería "comodín" y se colaría.
      AND  (p.location_id = p_location_id OR p.location_id IS NULL) -- D-07/D-13 sede (sin-sede vale para todas)
      AND  (  -- D-07 capaz: paridad-comodín EXACTA con staff-services.ts:48-52 (0 filas = capaz de todo).
              NOT EXISTS (SELECT 1 FROM professional_services ps
                          WHERE ps.business_id = p_business_id AND ps.professional_id = p.id)
              OR EXISTS  (SELECT 1 FROM professional_services ps
                          WHERE ps.business_id = p_business_id AND ps.professional_id = p.id
                            AND ps.service_id = p_service_id)
           )
      AND  NOT EXISTS (  -- LIBRE: sin turno OCUPANTE solapado en su agenda ese día (espeja EXCLUDE 013 +
                         --   la guarda expires_at del core booking-core.ts:170,177-178, Pitfall 4).
              SELECT 1 FROM appointments a
              WHERE a.business_id = p_business_id
                AND a.professional_id = p.id
                AND a.date = p_date
                AND a.status IN ('confirmed','pending_payment')
                AND (a.status = 'confirmed' OR a.expires_at IS NULL OR a.expires_at > now())  -- holds vigentes
                AND tsrange(a.date + a.time,
                            a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
                    && tsrange(p_date + p_time,
                               p_date + p_time + make_interval(mins => p_duration))
           )
    ORDER BY (  -- D-02/D-03 carga = turnos NO cancelados del pro ese DÍA COMPLETO, TODAS las sedes/servicios,
                --   incluyendo abonos (appointments normales) y holds VIGENTES (misma guarda expires_at).
             SELECT count(*) FROM appointments a2
             WHERE a2.business_id = p_business_id
               AND a2.professional_id = p.id
               AND a2.date = p_date
               AND a2.status IN ('confirmed','pending_payment')
               AND (a2.status = 'confirmed' OR a2.expires_at IS NULL OR a2.expires_at > now())
           ) ASC,
           p.created_at ASC,   -- D-01 desempate: alta más vieja (determinístico + self-balancing)
           p.id ASC            -- D-01 tie-break secundario → tests reproducibles
    LIMIT 1;

    IF v_effective_pro IS NULL THEN
      -- D-10: ningún capaz libre → el error de disponibilidad de siempre (cae en la rama slot_taken→409
      --       ya existente del core). NO se asigna a alguien ocupado ni se cae.
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- (058) Recomputar el bucket con el pro EFECTIVO ya resuelto. Literal byte-idéntico al índice 011 /
  --   EXCLUDE 013 / count (Pitfall 1). Para los 4 callers actuales v_effective_pro = p_professional_id.
  v_bucket := COALESCE(v_effective_pro, '00000000-0000-0000-0000-000000000000'::uuid);

  -- 1b. (042) Exclusión acoplada por espacio físico — lock por conjunto de espacios + EXISTS.
  --     Resolver el set de espacios de la agenda reservada vía la puente. NOTA: se keya por
  --     v_effective_pro (el pro REAL elegido): la puente referencia professionals.id real; las
  --     agendas sin profesional/sentinela no tienen espacios (Pitfall 1 / A2). Si la agenda no tiene
  --     espacios mapeados, v_space_ids queda NULL → sin lock de espacio, sin chequeo, cero overhead.
  --     (062) SIN CAMBIO: los locks de espacio siguen tomándose DESPUÉS del lock de modo.
  SELECT array_agg(asp.space_id ORDER BY asp.space_id) INTO v_space_ids   -- ORDEN ASCENDENTE (anti-deadlock)
  FROM agenda_spaces asp
  WHERE asp.business_id = p_business_id
    AND asp.professional_id = v_effective_pro;

  IF v_space_ids IS NOT NULL THEN
    -- Lock por CADA espacio en el orden ascendente del array_agg → ambas reservas que pelean un
    -- espacio compartido lo toman en la misma posición global (sin cruce → sin deadlock 40P01).
    FOREACH v_sid IN ARRAY v_space_ids LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text || v_sid::text, 0));
    END LOOP;

    -- Tras tomar los locks (el EXISTS es ahora autoritativo): ¿hay algún turno SOLAPADO en tiempo en
    -- CUALQUIER agenda HERMANA (que comparta ≥1 espacio del set) excluyendo la propia agenda? El
    -- join appointments → agenda_spaces (por COALESCE(professional_id, sentinel) del turno) expande
    -- cada turno a sus espacios; other.space_id = ANY(v_space_ids) exige intersección; el && de
    -- tsrange exige solape de tiempo (duración variable). El <> de self excluye la F11 contra sí misma.
    IF EXISTS (
      SELECT 1
      FROM appointments a
      JOIN agenda_spaces other ON other.business_id = p_business_id
                              AND other.professional_id = COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid)
      WHERE a.business_id = p_business_id
        AND a.status IN ('confirmed', 'pending_payment')
        AND a.date = p_date
        AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid)
            <> v_bucket   -- excluye self (Pitfall 3); v_bucket = COALESCE(v_effective_pro, sentinel)
        AND other.space_id = ANY (v_space_ids)                                              -- comparte ≥1 espacio
        AND tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
            && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration))  -- solape de tiempo
    ) THEN
      -- Reusar slot_taken (NO space_taken). El caller lo capta por `message` (P0001) en booking-core.
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 2/3/4. (062) Gate de cupo + asiento + is_group, BIFURCADOS por modo. Todo lo de acá abajo corre
  --        DESPUÉS del advisory lock: nunca se decide disponibilidad con un count suelto (TOCTOU).
  IF v_mode = 'simultaneous_resource' THEN
    -- ── Recurso simultáneo (D-02/D-03): el cupo es de services.capacity y se cuenta por SOLAPE ──
    -- Compite SOLO contra turnos del MISMO service_id (carriles independientes, D-04): una consulta
    -- normal de la misma persona a la misma hora NO resta contra el cupo de "camilla". El predicado
    -- tsrange && tsrange es el canónico del motor (idéntico al EXCLUDE 013 de 041:76 y al bloque de
    -- espacio de 042) → semántica de solape consistente en todo el sistema. business_id EXPLÍCITO.
    SELECT count(*) INTO v_overlap
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND a.service_id = p_service_id
      AND a.date = p_date
      AND a.status IN ('confirmed', 'pending_payment')
      AND tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
          && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration));

    IF v_overlap >= v_svc_cap THEN
      -- El recurso ya está ocupado por `capacity` turnos que pisan este intervalo → mismo error de
      -- cupo lleno que el grupal (el core lo mapea a slot_full/409).
      RAISE EXCEPTION 'slot_full' USING ERRCODE = 'P0001';
    END IF;

    -- El ASIENTO sigue atado al slot EXACTO (D-05): el índice único 011 es (business, bucket, date,
    -- time, seat), así que el seat solo tiene que ser único DENTRO del mismo date+time. Dos turnos
    -- escalonados tienen `time` distinto → claves distintas → ambos seat 0 sin colisión. El solape es
    -- el GATE del cupo, nunca el criterio del asiento.
    SELECT count(*) INTO v_occupied
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
      AND a.date = p_date AND a.time = p_time
      AND a.status IN ('confirmed', 'pending_payment');
    v_seat := v_occupied;

    -- LANDMINE: el EXCLUDE gist 013 (041:76) solo aplica a filas con is_group = false. Si un recurso
    -- de cupo > 1 naciera con is_group = false, el 2º turno SOLAPADO del mismo bucket chocaría con el
    -- gist (23P01) y el recurso NUNCA se llenaría. Con cupo 1 se deja is_group = false a propósito:
    -- el EXCLUDE actúa de respaldo atómico redundante con el gate por solape de arriba.
    v_is_group := (v_svc_cap > 1);
  ELSE
    -- ── Clase grupal (default): 058:184-211 BYTE-IDÉNTICO — cupo por HORA DE INICIO EXACTA ──
    -- 2. Capacity del bloque que cubre este slot (plantilla semanal: day_of_week + ventana).
    --    Si no hay bloque que lo cubra, default 1 (comportamiento individual). EXTRACT(dow) usa la
    --    misma convención que time_blocks.day_of_week (0=domingo..6=sábado).
    SELECT COALESCE(MAX(tb.capacity), 1) INTO v_capacity
    FROM time_blocks tb
    WHERE tb.business_id = p_business_id
      AND tb.day_of_week = EXTRACT(dow FROM p_date)
      AND p_time >= tb.start_time AND p_time < tb.end_time;

    -- 3. Ocupantes actuales del slot exacto (mismo bucket, mismo date+time, estados que ocupan).
    --    Los holds vencidos ya los liberó el core ANTES del RPC, así que el count está limpio.
    SELECT count(*) INTO v_occupied
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
      AND a.date = p_date AND a.time = p_time
      AND a.status IN ('confirmed', 'pending_payment');

    -- 4. Asignación de asiento + cero regresión cupo 1 (CONC-02). Sin cambio respecto de 041/042/058.
    IF v_capacity > 1 THEN
      IF v_occupied >= v_capacity THEN
        RAISE EXCEPTION 'slot_full' USING ERRCODE = 'P0001';
      END IF;
      v_seat := v_occupied;
    ELSE
      -- Cupo 1: seat fijo en 0 → la 2ª reserva colisiona con el índice 011 (23505 → slot_taken).
      v_seat := 0;
    END IF;
    v_is_group := (v_capacity > 1);
  END IF;
  RETURN QUERY
  INSERT INTO appointments (
    business_id, client_id, client_name, client_phone, client_email,
    service_id, professional_id, location_id, date, time, duration_minutes,
    seat, is_group, notes, status, expires_at
  ) VALUES (
    p_business_id, p_client_id, p_client_name, p_client_phone, p_client_email,
    p_service_id, v_effective_pro, p_location_id, p_date, p_time, p_duration,   -- (058) el pro REAL, nunca el mágico
    v_seat, v_is_group, p_notes, p_status, p_expires_at                          -- (062) is_group según el modo
  )
  RETURNING appointments.id, appointments.cancel_token;
END;
$$;

ALTER FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) OWNER TO "postgres";

-- Re-emitir el GRANT (el CREATE OR REPLACE preserva grants, pero se re-emite por claridad/idempotencia,
-- igual que 041/042/058): anon (caso anon-key), authenticated (alta manual anon+RLS), service_role (booking público).
GRANT EXECUTE ON FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) TO "anon", "authenticated", "service_role";

-- ── 6. Recargar el schema cache de PostgREST (obligatorio tras DDL) ───────────────────────────────
NOTIFY pgrst, 'reload schema';
