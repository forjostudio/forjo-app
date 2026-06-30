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

-- (Task 2 agrega acá la redefinición de book_slot_atomic)
