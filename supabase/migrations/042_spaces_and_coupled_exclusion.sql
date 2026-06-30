-- 042 — Espacio compartido: modelo de espacios físicos + exclusión acoplada atómica.
--
-- Contexto (motor-reservas / Phase 3 — espacio compartido, ESPACIO-01/02/03, CONC-03):
--   Una agenda (fila de `professionals`, per D-02 — se reusa el bucket existente, NO se crea
--   una entidad `resource` genérica) puede ocupar uno o más espacios físicos. El caso ancla es
--   un predio con una cancha de fútbol 11 que físicamente son 3 canchas cruzadas alquilables por
--   separado: F11 → {A, B, C}; cruzada A → {A}, B → {B}, C → {C}. Reservar la F11 a las 20hs
--   requiere A, B y C libres, y al confirmarse bloquea las 3; reservar una cruzada bloquea la F11.
--   La exclusión es BIDIRECCIONAL y por SOLAPE de tiempo (capacity 1 + duración variable, D-03),
--   NO por count de slot exacto. Es extender la regla anti-solape (EXCLUDE 013 / por bucket) a
--   nivel de ESPACIO físico, con el MISMO chequeo atómico de la Phase 2 (book_slot_atomic +
--   pg_advisory_xact_lock). Construye ENCIMA de capacity/concurrencia (Phase 2 / 041) SIN re-migrar.
--
-- Qué hace:
--   1. Crea `spaces`: espacios físicos por negocio (A, B, C). Datos de tenant (RLS + 4 policies por op).
--   2. Crea `agenda_spaces`: puente professional(agenda) ↔ space. NOT NULL FKs, PK (professional_id, space_id).
--      Mapea cada agenda a los espacios que ocupa (F11→{A,B,C}; cruzada A→{A}). Datos de tenant (RLS + 4 policies).
--   3. Redefine `book_slot_atomic` IN-PLACE (no RPC nuevo): además del lock slot+bucket + count vs
--      capacity existentes, resuelve el set de espacios de la agenda vía `agenda_spaces`, toma un
--      advisory lock por CADA space_id en orden ascendente (anti-deadlock), y rechaza con slot_taken
--      cualquier turno SOLAPADO en una agenda hermana que comparta un espacio del set. Excluye la
--      propia agenda (auto-conflicto F11). Re-emite OWNER + GRANT con la firma completa.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado + 040 + 041 + 042 en orden. Prod se aplica A MANO coordinado con
--     el deploy + `NOTIFY pgrst, 'reload schema';` (PostgREST refresca su schema cache). Tras aplicar,
--     regenerar `supabase/schema.sql` (patrón del repo, igual que 037/039).
--   - NO toca la 041: NO re-migra `capacity`, NO toca el índice único 011 (appointments_no_double_booking)
--     ni el EXCLUDE gist 013 (appointments_no_overlap). El anti-sobrecupo/anti-solape por bucket queda intacto.
--   - NO crea un RPC nuevo `book_space_slot_atomic`: la exclusión se extiende IN-PLACE dentro de
--     book_slot_atomic. Una agenda SIN filas en `agenda_spaces` pasa por el mismo código sin lock de
--     espacio ni chequeo → byte-idéntica a hoy (cupos/individual), cero regresión.
--   - NO da read a `anon` sobre `spaces` ni `agenda_spaces` (D-06). El bloqueo acoplado lo computa el
--     endpoint availability con service-role (Plan 02); si el público necesitara nombres de canchas,
--     los sirve el page.tsx público con service-role, NO una policy anon sobre estas tablas.
--   - NO crea la proyección/backstop `appointment_spaces` ni su EXCLUDE gist: eso es Plan 04
--     (backstop declarativo, recortable). Acá la garantía mínima es el advisory lock por espacio.
--   - NO agrega un código de error `space_taken`: el conflicto de espacio reusa `slot_taken` 409.

-- ── 1. spaces: espacios físicos por negocio ───────────────────────────────────────────────
-- Cada espacio físico (cancha A/B/C) = una fila. business_id ON DELETE CASCADE: si se borra el
-- negocio, se borran sus espacios (y por cascada sus filas de agenda_spaces).
CREATE TABLE "public"."spaces" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
  "name"        text NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "public"."spaces" ENABLE ROW LEVEL SECURITY;

-- 4 policies por operación, predicado de tenant idéntico al de 040 (owner_id = auth.uid()).
-- select/delete con USING; insert con WITH CHECK; update con USING + WITH CHECK (regla 3 de la
-- skill supabase-multitenant-rls: una policy por op con la cláusula correcta). SIN policy anon (D-06).
CREATE POLICY "spaces tenant select" ON "public"."spaces" FOR SELECT USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "spaces tenant insert" ON "public"."spaces" FOR INSERT WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "spaces tenant update" ON "public"."spaces" FOR UPDATE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "spaces tenant delete" ON "public"."spaces" FOR DELETE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

-- ── 2. agenda_spaces: puente professional(agenda) ↔ space ─────────────────────────────────
-- Mapea cada agenda (fila de professionals, per D-02) a los espacios físicos que ocupa.
-- professional_id y space_id son NOT NULL FK (Pitfall 1 / A2): la sentinela "sin profesional"
-- (00000000-...) NO tiene espacios — el caso ancla (canchas) SIEMPRE tiene professional_id real.
-- El mapeo de espacios solo aplica a agendas con profesional concreto. PK (professional_id, space_id)
-- evita duplicar el mapeo de un espacio a la misma agenda. business_id ON DELETE CASCADE (espejo de spaces).
CREATE TABLE "public"."agenda_spaces" (
  "business_id"     uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
  "professional_id" uuid NOT NULL REFERENCES "public"."professionals"("id") ON DELETE CASCADE,
  "space_id"        uuid NOT NULL REFERENCES "public"."spaces"("id") ON DELETE CASCADE,
  PRIMARY KEY ("professional_id", "space_id")
);
ALTER TABLE "public"."agenda_spaces" ENABLE ROW LEVEL SECURITY;

-- Mismas 4 policies por op WITH CHECK por tenant. SIN policy anon (D-06): el join a la puente para
-- el bloqueo acoplado lo hace el RPC (SECURITY DEFINER) en el write path y availability con
-- service-role en el read path — nunca el cliente público con anon-key.
CREATE POLICY "agenda_spaces tenant select" ON "public"."agenda_spaces" FOR SELECT USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "agenda_spaces tenant insert" ON "public"."agenda_spaces" FOR INSERT WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "agenda_spaces tenant update" ON "public"."agenda_spaces" FOR UPDATE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "agenda_spaces tenant delete" ON "public"."agenda_spaces" FOR DELETE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

-- ── 3. book_slot_atomic EXTENDIDO IN-PLACE — lock por conjunto de espacios + EXISTS anti-solape ──
-- CREATE OR REPLACE con la FIRMA EXACTA de 041 (mismos 14 params, mismo RETURNS TABLE, mismo
-- LANGUAGE/SECURITY DEFINER/search_path). El cuerpo es el de 041 + un bloque de espacio insertado
-- ENTRE el lock slot+bucket y el count vs capacity.
--
-- Por qué el lock va ANTES del EXISTS (TOCTOU): si chequearas el solape y DESPUÉS tomaras el lock,
--   dos reservas del mismo espacio podrían leer "libre" antes de que ninguna inserte → sobre-reserva.
--   El advisory lock por espacio serializa a las reservas que pelean ese espacio; recién con el lock
--   tomado el EXISTS es autoritativo. NUNCA un count/SELECT suelto sin lock (LOCKED en CONTEXT).
-- Por qué el lock es por CADA space_id en orden ASCENDENTE (anti-deadlock, Pitfall 2): dos reservas
--   que pelean subconjuntos solapados ({A,B} vs {B,C}) toman B en la misma posición del orden global
--   → nunca se cruzan → sin deadlock 40P01. Un solo lock por hash del set NO serializaría contra una
--   reserva que pelea solo {B} (hashes distintos).
-- Por qué se excluye la self-agenda (auto-conflicto F11, Pitfall 3): la F11 ocupa {A,B,C} pero es UNA
--   fila; sin excluir la propia agenda, "¿hay turno en agenda que comparta A?" se respondería con la
--   propia F11 → no se podría reservar nunca. El COALESCE(..., sentinel) <> COALESCE(..., sentinel) la excluye.
-- INVARIANTE #1 (Pitfall 1): el COALESCE(professional_id, '00000000-0000-0000-0000-000000000000'::uuid)
--   es BYTE-IDÉNTICO al v_bucket de 041:113, al índice 011 (041:65) y al EXCLUDE 013 (041:76).
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
  v_bucket uuid := COALESCE(p_professional_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_capacity int;
  v_occupied int;
  v_seat smallint;
  v_space_ids uuid[];   -- (042) espacios físicos que ocupa la agenda reservada (vía agenda_spaces)
  v_sid uuid;           -- (042) iterador del FOREACH del lock por espacio
BEGIN
  -- 1. Lock por slot+bucket: serializa SOLO las reservas que pelean este mismo slot.
  --    hashtextextended de la clave estable del slot → bigint para el advisory lock.
  --    El COALESCE es byte-idéntico al del índice 011 y al count de abajo.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || v_bucket::text || p_date::text || p_time::text, 0));

  -- 1b. (042) Exclusión acoplada por espacio físico — lock por conjunto de espacios + EXISTS.
  --     Resolver el set de espacios de la agenda reservada vía la puente. NOTA: se keya por
  --     p_professional_id CRUDO (no v_bucket): la puente referencia professionals.id real; las
  --     agendas sin profesional/sentinela no tienen espacios (Pitfall 1 / A2). Si la agenda no tiene
  --     espacios mapeados, v_space_ids queda NULL → sin lock de espacio, sin chequeo, cero overhead.
  SELECT array_agg(asp.space_id ORDER BY asp.space_id) INTO v_space_ids   -- ORDEN ASCENDENTE (anti-deadlock)
  FROM agenda_spaces asp
  WHERE asp.business_id = p_business_id
    AND asp.professional_id = p_professional_id;

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
            <> COALESCE(p_professional_id, '00000000-0000-0000-0000-000000000000'::uuid)   -- excluye self (Pitfall 3)
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

  -- 4. Asignación de asiento + cero regresión cupo 1 (CONC-02). Sin cambio respecto de 041.
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
    p_service_id, p_professional_id, p_location_id, p_date, p_time, p_duration,
    v_seat, (v_capacity > 1), p_notes, p_status, p_expires_at
  )
  RETURNING appointments.id, appointments.cancel_token;
END;
$$;

ALTER FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) OWNER TO "postgres";

-- Re-emitir el GRANT (el CREATE OR REPLACE preserva grants, pero se re-emite por claridad/idempotencia,
-- igual que 041): anon (caso anon-key), authenticated (alta manual anon+RLS), service_role (booking público).
GRANT EXECUTE ON FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) TO "anon", "authenticated", "service_role";

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- BACKSTOP DECLARATIVO (Plan 03-04) — appointment_spaces: proyección turno×espacio + EXCLUDE gist
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Append marker: todo lo de ARRIBA es del Plan 01 (spaces + agenda_spaces + book_slot_atomic).
-- Lo de ABAJO es la red de seguridad DECLARATIVA del Plan 04 (recortable, defensa en profundidad).
--
-- POR QUÉ ESTO Y NO UN EXCLUDE SOBRE appointments: un EXCLUDE constraint opera por tupla de UNA
--   tabla y NO puede hacer join a la puente (agenda_spaces) en su predicado por fila. La reserva
--   F11 es UNA fila de appointments mapeada a {A,B,C} vía la puente — un gist sobre appointments no
--   puede expandir esa fila a 3 espacios. Esta proyección DESNORMALIZA el fan-out F11→{A,B,C}: la
--   F11 produce 3 filas (una por A, B, C) y cada cruzada produce 1. El EXCLUDE entonces SÍ ve
--   "espacio B ocupado por la F11 a las 20" vs "espacio B reservado por cruzada B a las 20" como dos
--   filas con el mismo space_id y rangos solapados → choca (23P01).
--
-- RELACIÓN CON EL ADVISORY LOCK DEL PLAN 01: el advisory lock es app-logic dentro del RPC; un bug
--   de lógica (ej. olvidar un espacio del set) no lo detecta nadie. El EXCLUDE de la proyección es
--   declarativo: si dos reservas no se serializaran, el insert de proyección choca con 23P01 y aborta
--   toda la transacción. Es defensa en profundidad ADICIONAL — NO reemplaza el lock (Pitfall 6).
--
-- BACKFILL: el backstop aplica a reservas creadas TRAS esta migración. No hay backfill de turnos
--   previos (RESEARCH §Runtime State Inventory): la proyección arranca vacía y se puebla por trigger.

-- ── 4. appointment_spaces: proyección turno×espacio (una fila por turno × espacio ocupado) ───
-- Una fila por cada (appointment × espacio que ocupa). La F11 a las 20hs (que ocupa {A,B,C}) produce
-- 3 filas; cada cruzada produce 1. PK (appointment_id, space_id): cada espacio aparece UNA sola vez
-- por appointment → la F11 NO choca consigo misma (Pitfall 3). appointment_id ON DELETE CASCADE: si
-- se borra el turno, se borran sus proyecciones; space_id ON DELETE CASCADE (espejo de spaces).
CREATE TABLE "public"."appointment_spaces" (
  "appointment_id" uuid NOT NULL REFERENCES "public"."appointments"("id") ON DELETE CASCADE,
  "business_id"    uuid NOT NULL,
  "space_id"       uuid NOT NULL REFERENCES "public"."spaces"("id") ON DELETE CASCADE,
  "slot"           tsrange NOT NULL,
  PRIMARY KEY ("appointment_id", "space_id")
);
ALTER TABLE "public"."appointment_spaces" ENABLE ROW LEVEL SECURITY;

-- Tabla de tenant: la pueblan los triggers (corren con privilegios del owner del trigger / del RPC
-- SECURITY DEFINER), no el cliente directamente. Policies de SOLO LECTURA por tenant (mismo molde
-- que spaces: owner_id = auth.uid()) para que el dashboard pueda leerla si hiciera falta. SIN policy
-- anon (D-06): la proyección es interna. NO se dan insert/update/delete por policy: solo los triggers
-- escriben (vía privilegios del definer), así que el owner nunca la muta a mano desde el dashboard.
CREATE POLICY "appointment_spaces tenant select" ON "public"."appointment_spaces" FOR SELECT USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

-- EXCLUDE gist: mismo business + mismo espacio + rangos de tiempo solapados ⇒ rechazo (23P01).
-- El core ya mapea 23P01 → slot_taken 409 (booking-core.ts:276) — sin cambio de app. btree_gist ya
-- está habilitado (lo usa el EXCLUDE 013 de la 041/baseline). Este es el ÚNICO backstop CROSS-bucket
-- (el 013 es por bucket/agenda, no por espacio): dos AGENDAS distintas que comparten un espacio
-- físico chocan acá aunque sus buckets sean distintos. La proyección ya filtra por status (solo
-- confirmed/pending_payment entran vía el trigger), así que el EXCLUDE no necesita WHERE de status.
ALTER TABLE ONLY "public"."appointment_spaces"
  ADD CONSTRAINT "appointment_spaces_no_overlap" EXCLUDE USING "gist" ("business_id" WITH =, "space_id" WITH =, "slot" WITH &&);

-- ── 5. Triggers de población/limpieza de appointment_spaces ──────────────────────────────────
-- appointment_spaces_populate(): AFTER INSERT en appointments. Si el turno ocupa
-- (confirmed/pending_payment), expande la agenda a sus espacios vía agenda_spaces e inserta UNA fila
-- de proyección por espacio. Para una agenda SIN espacios mapeados, la subconsulta devuelve 0 filas
-- → no inserta nada (cero overhead/regresión para cupos/individual). El slot se construye con el
-- MISMO tsrange(date+time, date+time + make_interval(mins => COALESCE(duration_minutes,30))) que el
-- EXISTS del Plan 01 y el EXCLUDE 013, garantizando semántica de solape consistente.
--
-- Corre dentro de la MISMA transacción del insert de appointments (el RPC book_slot_atomic): si el
-- advisory lock del Plan 01 fallara y dos reservas de espacios solapados llegaran al insert, la 2ª
-- proyección choca con appointment_spaces_no_overlap (23P01) y aborta TODA la transacción (incluido
-- el insert del appointment). Ese es el backstop atómico vivo.
CREATE OR REPLACE FUNCTION "public"."appointment_spaces_populate"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('confirmed', 'pending_payment') THEN
    -- Una fila por espacio de la agenda (vía la puente). Keya por professional_id REAL (no por el
    -- sentinela): la agenda sin profesional no tiene espacios (Pitfall 1 / A2). Cada espacio aparece
    -- una sola vez (la PK de agenda_spaces lo garantiza) → la F11 no choca consigo misma (Pitfall 3).
    INSERT INTO appointment_spaces (appointment_id, business_id, space_id, slot)
    SELECT NEW.id, NEW.business_id, asp.space_id,
           tsrange(NEW.date + NEW.time,
                   NEW.date + NEW.time + make_interval(mins => COALESCE(NEW.duration_minutes, 30)))
    FROM agenda_spaces asp
    WHERE asp.business_id = NEW.business_id
      AND asp.professional_id = NEW.professional_id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."appointment_spaces_populate"() OWNER TO "postgres";

CREATE TRIGGER "appointment_spaces_populate_trg"
  AFTER INSERT ON "public"."appointments"
  FOR EACH ROW EXECUTE FUNCTION "public"."appointment_spaces_populate"();

-- appointment_spaces_cleanup(): AFTER UPDATE OF status en appointments. Si el turno DEJA de ocupar
-- (NEW.status NOT IN confirmed/pending_payment — ej. cancelled/expirado) y OLD.status SÍ ocupaba,
-- borra sus filas de proyección → el espacio se libera (Pitfall 4: espejo del WHERE de status del
-- EXCLUDE 013). El core pasa los holds vencidos a cancelled ANTES del RPC, así que el trigger los
-- limpia y la proyección no bloquea espacios por turnos muertos. El DELETE es idempotente (si no hay
-- filas, no hace nada). No se repuebla en el camino inverso (pending→confirmed sigue ocupando, ya
-- tiene su proyección del INSERT; el trigger solo dispara cuando status CAMBIA y deja de ocupar).
CREATE OR REPLACE FUNCTION "public"."appointment_spaces_cleanup"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('confirmed', 'pending_payment')
     AND NEW.status NOT IN ('confirmed', 'pending_payment') THEN
    DELETE FROM appointment_spaces WHERE appointment_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."appointment_spaces_cleanup"() OWNER TO "postgres";

CREATE TRIGGER "appointment_spaces_cleanup_trg"
  AFTER UPDATE OF "status" ON "public"."appointments"
  FOR EACH ROW EXECUTE FUNCTION "public"."appointment_spaces_cleanup"();
