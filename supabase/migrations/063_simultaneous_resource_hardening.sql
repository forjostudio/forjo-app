-- 063 — Endurecimiento del modo RECURSO SIMULTÁNEO (correcciones del code-review de Phase 12).
--
-- Contexto (motor-reservas / Phase 12 — code-review CR-01, CR-02, CR-03):
--   La 062 introdujo `services.capacity_mode = 'simultaneous_resource'` (cupo por SOLAPE) y ya está
--   APLICADA A MANO EN PRODUCCIÓN ⇒ es historia inmutable: NO se edita. Esta migración la SUPERSEDE
--   redefiniendo `book_slot_atomic` in-place con las tres correcciones del review. El cuerpo arranca
--   del de la 062 y aplica los cambios encima; todo lo demás queda BYTE-IDÉNTICO.
--
-- Qué corrige (los tres agujeros que el review encontró en el anti-doble-booking del modo nuevo):
--
--   (CR-01) El gate por solape contaba holds VENCIDOS. El count filtraba por
--           status IN ('confirmed','pending_payment') sin descartar los `pending_payment` cuya seña ya
--           expiró. La justificación de la rama grupal ("el core ya liberó los holds vencidos antes del
--           RPC") NO aplica al carril simultáneo: el core libera los holds de SU bucket
--           (booking-core.ts:235-246) y este carril cuenta por service_id a través de TODAS las
--           agendas. Un hold vencido de otro profesional restaba cupo hasta que corriera el cron
--           diario ⇒ `slot_full` FALSO (availability mostraba el horario libre) y reserva perdida
--           hasta 24 h. Se agrega la MISMA guarda que ya usa la función 80 líneas más arriba
--           (selección "cualquiera") y que usa el read-path.
--
--   (CR-02) Un servicio simultáneo se podía montar ENCIMA de un turno de OTRO servicio de la misma
--           agenda (doble-booking real). Para capacity > 1 se caían las TRES capas a la vez:
--             1. el early-return JS se desactivaba con el flag `isSimultaneousResource`;
--             2. el gate SQL solo miraba el MISMO `service_id`;
--             3. la fila nacía `is_group = true` ⇒ FUERA del EXCLUDE gist 013 (que es
--                `... WHERE (status IN (...) AND NOT is_group)`, migr. 041).
--           Se agrega un gate por BUCKET, fail-closed: si el intervalo pedido solapa un turno vivo de
--           OTRO servicio en la MISMA agenda ⇒ slot_taken.
--
--           DECISIÓN DE PRODUCTO (opción A del review): un servicio simultáneo SÍ puede compartir
--           agenda con turnos individuales, pero el cruce con otro servicio se RECHAZA. Hacerlo
--           configurable por el dueño (un flag por servicio del tipo "permitir solaparse con otros
--           servicios") es un FOLLOW-UP deliberadamente fuera de alcance acá: el default tiene que
--           BLOQUEAR, porque shippear "permitir" antes de que el dueño haya decidido nada es shippear
--           el doble-booking. El cupo N del recurso sigue siendo cupo contra SÍ MISMO (D-04).
--
--   (CR-03) La re-granularización del lock rompía la serialización cross-modo que la 058 introdujo a
--           propósito (§GA1). La 062 hacía que el modo simultáneo tomara hash(business+service+date)
--           EN LUGAR de hash(business+date+time): dos claves ORTOGONALES, no una más gruesa ⇒ una
--           reserva simultánea y una grupal del mismo instante dejaban de compartir lock. Eso reabría
--           (1) `v_seat` calculado sin lock compartido (23505 espurio) y (2) la selección "cualquiera"
--           eligiendo el mismo profesional en dos transacciones concurrentes (doble-booking real bajo
--           concurrencia, justo lo que 058 §GA1 cerraba). Ahora el modo simultáneo toma LOS DOS locks
--           y el de instante se toma SIEMPRE, en los dos modos. Orden GLOBAL FIJO —
--           servicio-día → instante → espacios (042, ascendente)— idéntico en toda transacción, así
--           que no se introduce ningún ciclo: deadlock-free.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO edita la 062 (ya aplicada a mano en prod).
--   - NO cambia la firma del RPC: mismos 14 params + RETURNS TABLE (id, cancel_token) BYTE-idénticos a
--     041/042/058/062 → CREATE OR REPLACE puro, SIN DROP FUNCTION (cambiar params o el RETURNS obliga
--     a recrearla y rompería los 4 callers que entran por createAppointmentCore: booking público, alta
--     manual del panel, generación forward de abonos y canchas).
--   - NO toca la rama 'group_class': su bloque sigue byte-idéntico al de 058/062 y ahora además
--     recupera EXACTAMENTE el lock de 058 (un solo advisory lock de instante) ⇒ cero regresión.
--   - NO toca columnas, CHECKs, vistas, índices, el EXCLUDE 013 ni ninguna policy RLS: esta migración
--     solo redefine la función.
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado + 040..063 en orden. Prod se aplica A MANO coordinado con el
--     deploy + `NOTIFY pgrst, 'reload schema';`. Tras aplicar, regenerar `supabase/schema.sql`.

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
  -- (062) is_group de la fila a insertar; cada modo lo deriva de SU fuente de cupo (LANDMINE 013).
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
  --    define QUÉ locks hay que tomar. Filtro por business_id EXPLÍCITO: adentro de un SECURITY
  --    DEFINER la RLS no aplica, así que un p_service_id de otro tenant NO debe resolver a nada.
  --    COALESCE final = fail-safe al modo histórico si el servicio no resolviera.
  SELECT s.capacity_mode, COALESCE(s.capacity, 1)
    INTO v_mode, v_svc_cap
  FROM services s
  WHERE s.id = p_service_id
    AND s.business_id = p_business_id;
  v_mode := COALESCE(v_mode, 'group_class');
  v_svc_cap := COALESCE(v_svc_cap, 1);

  -- 1. (063, CR-03) Advisory locks del slot. El modo simultáneo toma LOS DOS, en un orden GLOBAL FIJO.
  --
  --    (a) Lock de SERVICIO-DÍA — solo en 'simultaneous_resource' (062, D-06). El cupo de este modo se
  --        decide por SOLAPE, y dos reservas escalonadas del mismo servicio (16:00 y 16:15) tienen
  --        `time` distinto: sin este lock no serializan entre sí y ambas pasan el gate ⇒ sobrecupo
  --        (el bug del UAT de la fase 07). El key cubre EXACTAMENTE el conjunto sobre el que se cuenta.
  --
  --    (b) Lock de INSTANTE (058 §GA1) — se toma SIEMPRE, en los DOS modos. La 062 lo había
  --        REEMPLAZADO por (a) en el modo simultáneo, y (a) es ORTOGONAL, no más grueso: una reserva
  --        simultánea y una grupal del mismo instante dejaban de compartir cualquier lock. Este lock
  --        es lo que serializa `v_seat` (se computa contando el slot EXACTO del bucket: sin lock
  --        compartido, dos transacciones de modos distintos obtienen el mismo seat → 23505 espurio) y
  --        la selección "cualquiera" del paso 2 (sin él, dos requests concurrentes ven al mismo
  --        profesional libre y ambas lo eligen; como una fila nace is_group=false y la otra true, el
  --        EXCLUDE 013 tampoco las cruza ⇒ doble-booking REAL bajo concurrencia).
  --
  --    ORDEN: servicio-día → instante → espacios (042, ascendente). Es el MISMO orden en toda
  --    transacción del sistema, así que no hay adquisición cruzada ⇒ deadlock-free (40P01 imposible
  --    por esta vía). Para 'group_class' se toma exactamente UN lock, el mismo de 058 ⇒ byte-idéntico.
  --    hashtextextended → bigint (forma de un argumento, seed 0).
  IF v_mode = 'simultaneous_resource' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_business_id::text || p_service_id::text || p_date::text, 0));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || p_date::text || p_time::text, 0));

  -- 2. (058, §GA2 / D-01/D-02/D-03/D-07/D-08/D-10) Selección del profesional "cualquiera" BAJO el lock.
  --    Solo si el caller pidió "cualquiera". La selección corre DESPUÉS de los locks (Pitfall 2:
  --    correrla antes reintroduce la carrera) y ANTES del bloque de espacio (que necesita el pro
  --    elegido). (063) SIN CAMBIO respecto de 058/062, pero ahora vuelve a correr bajo el lock de
  --    instante también en el modo simultáneo (CR-03).
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
                         --   la guarda expires_at del core booking-core.ts, Pitfall 4).
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
  --     (063) SIN CAMBIO: los locks de espacio siguen tomándose DESPUÉS de los locks de slot.
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
  --        DESPUÉS de los advisory locks: nunca se decide disponibilidad con un count suelto (TOCTOU).
  IF v_mode = 'simultaneous_resource' THEN
    -- ── (063, CR-02) Gate de EXCLUSIÓN POR AGENDA — va PRIMERO, fail-closed ────────────────────
    -- El cupo N del recurso NO reemplaza la exclusión por agenda. Con capacity > 1 la fila nace
    -- is_group = true y sale del EXCLUDE gist 013 (041: `... AND NOT is_group`), así que si el cruce
    -- con OTROS servicios no se chequea acá NO lo chequea NADIE: ni el gist, ni el gate de abajo (que
    -- filtra por el MISMO service_id), ni el re-check JS con autoAssign (que se saltea entero). Ese
    -- era el doble-booking real: "camilla" (simultáneo, cupo 2) montándose sobre una "consulta"
    -- confirmada de la misma agenda.
    --
    -- Semántica: los solapes del PROPIO servicio son legales hasta el cupo (los gatea el count de
    -- abajo); cualquier solape con OTRO servicio del MISMO bucket es doble-booking → slot_taken.
    -- Permitir el cruce es una decisión que le corresponde al dueño (flag por servicio = FOLLOW-UP
    -- planificado, fuera de alcance acá): el default DEBE bloquear.
    --
    -- Mismos criterios que el resto del motor: bucket por COALESCE(professional_id, sentinel)
    -- byte-idéntico al índice 011, holds VIGENTES únicamente, predicado tsrange && canónico,
    -- business_id EXPLÍCITO (SECURITY DEFINER ⇒ la RLS no protege adentro).
    IF EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.business_id = p_business_id
        AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
        AND a.service_id IS DISTINCT FROM p_service_id
        AND a.date = p_date
        AND a.status IN ('confirmed', 'pending_payment')
        AND (a.status = 'confirmed' OR a.expires_at IS NULL OR a.expires_at > now())
        AND tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
            && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration))
    ) THEN
      -- slot_taken (NO slot_full): no es "cupo lleno" del recurso, es la agenda ocupada por otra cosa.
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;

    -- ── Recurso simultáneo (D-02/D-03): el cupo es de services.capacity y se cuenta por SOLAPE ──
    -- Compite SOLO contra turnos del MISMO service_id (carriles independientes, D-04): una consulta
    -- normal de la misma persona a la misma hora NO resta contra el cupo de "camilla" (y si pisa la
    -- agenda ya la rechazó el gate de arriba). El predicado tsrange && tsrange es el canónico del
    -- motor (idéntico al EXCLUDE 013 de 041 y al bloque de espacio de 042). business_id EXPLÍCITO.
    --
    -- (063, CR-01) Guarda de holds VIGENTES: los `pending_payment` con la seña ya vencida NO ocupan.
    -- Es la MISMA guarda que usa la selección "cualquiera" de arriba y que usa el read-path de
    -- availability. No se puede delegar al core como hace la rama grupal: el core solo libera los
    -- holds vencidos de SU bucket y este carril cuenta a través de TODAS las agendas.
    SELECT count(*) INTO v_overlap
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND a.service_id = p_service_id
      AND a.date = p_date
      AND a.status IN ('confirmed', 'pending_payment')
      AND (a.status = 'confirmed' OR a.expires_at IS NULL OR a.expires_at > now())
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
    -- el GATE del cupo, nunca el criterio del asiento. (063, CR-03) Este count ahora corre bajo el
    -- lock de instante, que es lo que impide que dos modos distintos deriven el MISMO seat.
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
-- igual que 041/042/058/062): anon (caso anon-key), authenticated (alta manual anon+RLS), service_role
-- (booking público).
GRANT EXECUTE ON FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) TO "anon", "authenticated", "service_role";

-- ── Recargar el schema cache de PostgREST (obligatorio tras DDL) ───────────────────────────────────
NOTIFY pgrst, 'reload schema';
