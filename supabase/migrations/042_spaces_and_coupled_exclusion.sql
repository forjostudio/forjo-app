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
