-- 041 — Cupos grupales: capacity-aware integrity + anti-sobrecupo atómico.
--
-- Contexto (motor-reservas / Phase 2 — cupos grupales, CUPOS-01/03, CONC-01/02):
--   Un bloque de horario (time_blocks) pasa de "1 reserva por slot" a "hasta N reservas"
--   (cupo). El caso ancla es una clase de spinning de las 9 con cupo 15: cada persona
--   reserva el MISMO date+time hasta llenar. La integridad anti-doble-booking que v0.9
--   endureció (índice único 011 + EXCLUDE gist 013) está construida para "1 fila por slot";
--   esta migración la redefine a capacity-aware SIN regresión para el caso cupo 1.
--
-- ⚠ A DIFERENCIA de 040 (que decía explícitamente "NO toca los constraints 011/013"):
--   ESTA migración SÍ redefine appointments_no_double_booking (011) y appointments_no_overlap
--   (013). Es seguro porque la redefinición es estrictamente más permisiva SOLO en el caso
--   cupo>1: para cupo 1 (seat 0 único, is_group=false) el comportamiento es byte-idéntico al
--   actual (la 2ª fila sigue chocando con 23505 → slot_taken, y el anti-solape de duración
--   variable sigue activo). La cero-regresión la guardea CONC-02 (Plan 05).
--
-- Qué hace:
--   1. time_blocks gana `capacity smallint NOT NULL DEFAULT 1 CHECK (capacity >= 1)`.
--   2. appointments gana `seat smallint NOT NULL DEFAULT 0` e `is_group boolean NOT NULL DEFAULT false`.
--   3. Redefine el índice único 011 agregando `seat` como última columna del bucket.
--   4. Condiciona el EXCLUDE gist 013 a `NOT is_group` (cupo 1 conserva el anti-solape).
--   5. Crea `book_slot_atomic` (SECURITY DEFINER + pg_advisory_xact_lock) — el respaldo atómico
--      anti-sobrecupo bajo concurrencia (la garantía real vive en la DB, no en el JS).
--   6. GRANT EXECUTE del RPC a anon/authenticated/service_role.
--   7. Hardening RLS de time_blocks: policies FOR INSERT/UPDATE WITH CHECK por tenant (estilo 040),
--      para que editar `capacity` no abra un vector cross-tenant.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17).
--   - NO elimina ni hace siempre-permisivo el EXCLUDE 013 globalmente (solo lo condiciona a NOT is_group).
--   - NO expone roster/ocupación viva a anon: appointments sigue sin read público para anon.
--     La policy "public read time_blocks" (baseline:1354) queda INTACTA — anon puede leer `capacity`
--     (tope ESTÁTICO del cupo, no la ocupación viva; aceptable bajo D-06, que solo prohíbe exponer
--     "lugares restantes"). La ocupación viva se cuenta sobre appointments (sin read anon).
--   - NO se aplica a producción automáticamente: prod se aplica a mano, coordinado con el deploy.

-- ── 1. capacity en time_blocks (plantilla semanal) ───────────────────────────────────────
-- time_blocks es la plantilla semanal recurrente (day_of_week + start_time/end_time); `capacity`
-- aplica a TODOS los slots generados dentro de la ventana del bloque. El backfill DEFAULT 1 deja
-- los bloques existentes con comportamiento idéntico al actual (1 reserva por slot).
ALTER TABLE "public"."time_blocks" ADD COLUMN "capacity" smallint NOT NULL DEFAULT 1;
ALTER TABLE "public"."time_blocks" ADD CONSTRAINT "time_blocks_capacity_positive" CHECK ("capacity" >= 1);

-- ── 2. seat + is_group en appointments ────────────────────────────────────────────────────
-- `seat` = posición 0..capacity-1 que vuelve único el índice por slot (sin esta columna no se
--   pueden tener N filas en el mismo (business_id, bucket, date, time)).
-- `is_group` desnormaliza si el slot es grupal (lo escribe el RPC = capacity > 1) para condicionar
--   el EXCLUDE 013 — un EXCLUDE gist no puede hacer join a time_blocks en su predicado, así que el
--   dato vive en la fila de appointments.
-- El backfill DEFAULT 0 / false deja las filas vivas como individuales (seat 0, no grupal):
--   consistente con que hoy cada slot tiene a lo sumo 1 fila (lo garantiza el índice 011 actual).
ALTER TABLE "public"."appointments" ADD COLUMN "seat" smallint NOT NULL DEFAULT 0;
ALTER TABLE "public"."appointments" ADD COLUMN "is_group" boolean NOT NULL DEFAULT false;

-- ── 3. Redefinir el índice único 011 → capacity-aware (agrega seat) ───────────────────────
-- IDÉNTICO al baseline (baseline.sql:797) pero con `seat` como última columna del bucket.
-- Sentinel '00000000-0000-0000-0000-000000000000' PRESERVADO EXACTO (debe coincidir byte-a-byte
-- con la clave del advisory lock y el count de ocupación del RPC — Pitfall 1).
-- Cupo 1: solo se asigna seat=0 → el índice rechaza la 2ª fila igual que hoy (23505 → slot_taken),
--   CERO regresión (CONC-02). Cupo N: seats 0..N-1 distintos son válidos en el mismo slot; la fila
--   N+1 reusaría un seat ya tomado → 23505 (respaldo atómico si el advisory lock fallara).
DROP INDEX IF EXISTS "public"."appointments_no_double_booking";
CREATE UNIQUE INDEX "appointments_no_double_booking" ON "public"."appointments" USING "btree" ("business_id", COALESCE("professional_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "date", "time", "seat") WHERE ("status" = ANY (ARRAY['confirmed'::"text", 'pending_payment'::"text"]));

-- ── 4. Condicionar el EXCLUDE gist 013 a NOT is_group ─────────────────────────────────────
-- IDÉNTICO al baseline (baseline.sql:649) pero agregando `AND NOT is_group` al WHERE.
-- Cupo 1 (is_group=false): conserva el anti-solape de duración variable INTACTO — dos turnos de
--   distinta duración que se pisan parcialmente siguen chocando (23P01 → slot_taken). Cero regresión.
-- Cupo N (is_group=true): el EXCLUDE NO aplica, porque los inscriptos comparten el MISMO rango exacto
--   (D-03: duración fija del bloque) y el índice de seat ya cubre la unicidad por seat. Si el gist
--   siguiera activo, la 2ª inscripción del slot grupal chocaría (23P01 falso) y no se podría llenar el cupo.
ALTER TABLE "public"."appointments" DROP CONSTRAINT IF EXISTS "appointments_no_overlap";
ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_no_overlap" EXCLUDE USING "gist" ("business_id" WITH =, COALESCE("professional_id", '00000000-0000-0000-0000-000000000000'::"uuid") WITH =, "tsrange"(("date" + "time"), (("date" + "time") + "make_interval"("mins" => COALESCE("duration_minutes", 30)))) WITH &&) WHERE (("status" = ANY (ARRAY['confirmed'::"text", 'pending_payment'::"text"]) AND NOT "is_group"));

-- ── 5. book_slot_atomic — respaldo atómico anti-sobrecupo (SECURITY DEFINER) ──────────────
-- El JS client de Supabase NO puede dar atomicidad count→insert: cada .insert() es su propia
-- transacción autocommit y entre un SELECT count y un INSERT hay una ventana de carrera (TOCTOU)
-- que dos requests concurrentes pueden cruzar → sobrecupo. Esta función encapsula lock + count +
-- insert en UNA sola transacción server-side.
--
-- pg_advisory_xact_lock: serializa SOLO las reservas que pelean este MISMO slot+bucket (no toda la
--   tabla). El server es multi-instancia en Vercel; un mutex en Node no sirve — el lock de Postgres
--   es global al cluster y se libera al fin de la transacción. La clave del lock usa EXACTAMENTE el
--   mismo COALESCE(professional_id, sentinel) que el índice 011 (Pitfall 1: si la clave difiere, dos
--   requests del mismo slot no comparten lock → sobrecupo).
--
-- SECURITY DEFINER + SET search_path = public: el caller manual corre anon+RLS (sesión del dueño);
--   la función corre con privilegios del owner y por eso DEBE re-imponer el aislamiento por tenant
--   internamente — recibe `p_business_id` ya resuelto por el caller (slug→business o owner→business)
--   y filtra TODO por él (Pitfall 2). NUNCA confía en IDs del cliente: el anti-tampering de
--   service/professional/location lo hace el core ANTES del RPC. search_path fijo evita shadowing.
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
BEGIN
  -- 1. Lock por slot+bucket: serializa SOLO las reservas que pelean este mismo slot.
  --    hashtextextended de la clave estable del slot → bigint para el advisory lock.
  --    El COALESCE es byte-idéntico al del índice 011 y al count de abajo.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || v_bucket::text || p_date::text || p_time::text, 0));

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

  -- 4. Si ya está lleno → slot_full (P0001). El core lo mapea a error de dominio slot_full (409).
  IF v_occupied >= v_capacity THEN
    RAISE EXCEPTION 'slot_full' USING ERRCODE = 'P0001';
  END IF;

  -- 5. Asigna el primer asiento libre (0..capacity-1) e inserta. is_group = (capacity > 1) desnormaliza
  --    si el slot es grupal para condicionar el EXCLUDE 013. El índice único (..., seat) es el respaldo
  --    atómico: si dos requests cruzaran el lock (no debería), el seat duplicado choca con 23505.
  v_seat := v_occupied;
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

-- ── 6. GRANT EXECUTE del RPC ──────────────────────────────────────────────────────────────
-- anon (booking público service-role no lo necesita, pero el grant a anon cubre el caso anon-key),
-- authenticated (alta manual del dueño anon+RLS), service_role (booking público). El grant NO es un
-- vector cross-tenant: `p_business_id` lo resuelve el caller, no el cliente, y la función re-impone
-- el filtro por tenant internamente.
GRANT EXECUTE ON FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) TO "anon", "authenticated", "service_role";

-- ── 7. Hardening RLS de time_blocks (estilo 040) ──────────────────────────────────────────
-- La policy "business access" del baseline (baseline.sql:1197) es FOR ALL con USING (sin WITH CHECK
-- explícito), así que en INSERT/UPDATE usa su USING como check y el cross-tenant YA falla hoy. Estas
-- dos policies permissive FOR INSERT/UPDATE WITH CHECK son hardening de CLARIDAD (regla 3 de la skill
-- supabase-multitenant-rls) para que editar `capacity` no abra un vector cross-tenant. Se OR-ean con
-- "business access" (misma regla de tenant) → no aflojan nada. NO se hace DROP de "business access"
-- ni de "public read time_blocks" (anon sigue leyendo capacity = tope estático, aceptable D-06).
CREATE POLICY "time_blocks tenant insert" ON "public"."time_blocks" FOR INSERT WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "time_blocks tenant update" ON "public"."time_blocks" FOR UPDATE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));
