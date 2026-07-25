-- 058 — Asignación automática atómica de profesional ("cualquiera") dentro de book_slot_atomic.
--
-- Contexto (motor-reservas / Phase 9 — ASIGN-02/03/04, v0.25 multi-staff):
--   Cuando una reserva NO elige profesional ("cualquiera"), el sistema debe asignarle uno LIBRE y
--   CAPAZ (que sabe hacer el servicio) — y esa elección tiene que ocurrir DENTRO de la misma
--   transacción SECURITY DEFINER que ya serializa el anti-sobrecupo (041) y la exclusión por espacio
--   compartido (042). Leer-libres→insertar desde JS sería una carrera (TOCTOU): dos "cualquiera"
--   concurrentes podrían elegir el MISMO profesional (D-05). Entre varios candidatos gana el de MENOS
--   turnos ese día (reparto de carga, ASIGN-04) con desempate determinístico por created_at (D-01).
--
-- Qué hace (cambios sobre el cuerpo VIGENTE de 042, CREATE OR REPLACE puro):
--   1. Amplía el advisory lock del slot a hash(business_id + date + time) — se quita v_bucket del hash
--      (D-04 / §Gray Area 1). Un lock MÁS GRUESO serializa MÁS (nunca menos): toda reserva del mismo
--      instante (específicas + "cualquiera") hace cola en el MISMO lock antes de tocar espacio/cupo, de
--      modo que la selección de candidato ve un estado consistente. Es necesario porque una reserva
--      "cualquiera" (bucket mágico) y una específica de la persona X (bucket X) tomaban locks distintos
--      con el hash viejo → no serializaban → la "cualquiera" podía elegir a X justo al insertarse la
--      específica. No degrada slot_full ni slot_taken (ver análisis por invariante en 09-RESEARCH §GA1).
--   2. Si p_professional_id es el UUID MÁGICO '00000000-0000-0000-0000-000000000001' ("cualquiera",
--      DISTINTO del sentinel cero de "sin profesional"): BAJO el lock ya tomado, selecciona un
--      profesional capaz (paridad-comodín exacta con lib/staff-services.ts) + de la sede + activo +
--      LIBRE, ordenado por MENOS carga ese día → v_effective_pro. Sin candidato libre → RAISE
--      'slot_taken' (D-10, el error de disponibilidad de siempre). El profesional REAL elegido se usa
--      en el bloque de espacio, el count y el INSERT — NUNCA se inserta el UUID mágico.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO cambia la firma: mismos 14 params + el RETURNS TABLE (id, cancel_token) BYTE-idénticos
--     a 041/042 → CREATE OR REPLACE puro, sin DROP FUNCTION (cambiar params o el RETURNS obliga a
--     recrearla y rompería los 4 callers — Pitfall 5 / D-11). Re-emite OWNER + GRANT con la firma completa.
--   - CERO regresión de los 4 caminos (profesional específico · cancha · ocurrencia de abono · cupo
--     grupal): ninguno manda jamás el UUID mágico → v_effective_pro = p_professional_id → comportamiento
--     byte-idéntico (v_is_any=false salta toda la selección; el lock más grueso solo serializa de más).
--   - NO cambia el RETURNS para devolver el pro asignado (Pitfall 5: "cannot change return type"):
--     Phase 10 leerá appointments.professional_id de la fila.
--   - D-08 (SECURITY DEFINER, RLS no protege adentro): TODA subquery nueva (candidatos, carga, capaz)
--     filtra por business_id = p_business_id EXPLÍCITO.
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado 001→058 en orden. Prod se aplica A MANO coordinado con el deploy +
--     `NOTIFY pgrst, 'reload schema';`. Tras aplicar, regenerar `supabase/schema.sql` (patrón 042/057).

-- ── book_slot_atomic REDEFINIDO IN-PLACE — lock ampliado + selección de candidato "cualquiera" ──
-- Firma BYTE-IDÉNTICA a 042:126-142. El cuerpo es el de 042 + (a) lock ampliado (sin v_bucket) y
-- (b) el bloque de selección de candidato ENTRE el lock y el bloque de espacio.
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
  -- 1. (058, §GA1 / D-04) Lock del slot AMPLIADO a (business_id + date + time) — SIN v_bucket.
  --    Serializa TODA reserva del mismo instante de inicio del negocio (específicas + "cualquiera")
  --    antes de tocar espacio/cupo. Un lock más grueso serializa MÁS, nunca menos → no degrada
  --    slot_full (los inscriptos de una clase comparten biz+date+time → mismo key que antes) ni
  --    slot_taken (las agendas que comparten espacio convergen ANTES, y siguen convergiendo en el
  --    lock de espacio). Es lo que hace que la selección de candidato (paso 2) vea un estado
  --    consistente de todo el instante. hashtextextended → bigint (forma de un argumento, seed 0).
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || p_date::text || p_time::text, 0));

  -- 2. (058, §GA2 / D-01/D-02/D-03/D-07/D-08/D-10) Selección del profesional "cualquiera" BAJO el lock.
  --    Solo si el caller pidió "cualquiera". La selección corre DESPUÉS del lock (Pitfall 2: correrla
  --    antes reintroduce la carrera) y ANTES del bloque de espacio (que necesita el pro elegido).
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

  -- 4. Asignación de asiento + cero regresión cupo 1 (CONC-02). Sin cambio respecto de 041/042.
  IF v_capacity > 1 THEN
    IF v_occupied >= v_capacity THEN
      RAISE EXCEPTION 'slot_full' USING ERRCODE = 'P0001';
    END IF;
    v_seat := v_occupied;
  ELSE
    -- Cupo 1: seat fijo en 0 → la 2ª reserva colisiona con el índice 011 (23505 → slot_taken).
    v_seat := 0;
  END IF;
  RETURN QUERY
  INSERT INTO appointments (
    business_id, client_id, client_name, client_phone, client_email,
    service_id, professional_id, location_id, date, time, duration_minutes,
    seat, is_group, notes, status, expires_at
  ) VALUES (
    p_business_id, p_client_id, p_client_name, p_client_phone, p_client_email,
    p_service_id, v_effective_pro, p_location_id, p_date, p_time, p_duration,   -- (058) el pro REAL, nunca el mágico
    v_seat, (v_capacity > 1), p_notes, p_status, p_expires_at
  )
  RETURNING appointments.id, appointments.cancel_token;
END;
$$;

ALTER FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) OWNER TO "postgres";

-- Re-emitir el GRANT (el CREATE OR REPLACE preserva grants, pero se re-emite por claridad/idempotencia,
-- igual que 041/042): anon (caso anon-key), authenticated (alta manual anon+RLS), service_role (booking público).
GRANT EXECUTE ON FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) TO "anon", "authenticated", "service_role";
