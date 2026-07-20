-- 054 — Abonos recurrentes: espinazo de datos (ABONO-01/02/03, D-01/02/03/06/07/10).
--
-- Contexto (motor-reservas / Phase 6 — modelo del abono + alta manual + generación forward):
--   Un abono es una SERIE de turnos fijos que se repite semana a semana en el mismo día/hora para
--   el mismo cliente/servicio/agenda (ej. "cancha 5 todos los martes 20hs", "kinesiología todos
--   los lunes 9hs"). El dueño da de alta la serie a mano (Plan 03) y un motor de generación forward
--   (Plan 02) materializa turnos concretos en `appointments` dentro de una ventana rolling de N
--   semanas (D-07). Esta migración crea SOLO el espinazo de datos; NO construye motor, endpoint ni cron.
--
-- Qué hace:
--   1. Crea `abonos`: la serie por negocio (D-01). Datos de tenant → RLS + 4 policies owner-only por
--      operación. Columnas base + columnas EXTENSIBLES nullable (D-02) para el cobro recurrente y el
--      flujo pagá-o-liberá de v0.25, presentes desde ya para NO re-migrar (v0.24 NO las usa).
--   2. `appointments.abono_id` (D-03): FK nullable turno→serie, `on delete set null` (borrar un abono
--      NO borra los turnos ya generados; solo los desvincula). Índice para el join por serie.
--   3. `businesses.abono_window_weeks` (D-07): ventana de generación forward a nivel negocio, default 8.
--      Owner-updatable (el trigger businesses_protect_admin_columns NO la protege — no es columna admin,
--      igual que max_advance_days). NO viaja a la vista pública (el anon no necesita este dato, D-10).
--
-- Qué NO hace (invariantes del proyecto):
--   - NO toca `book_slot_atomic` (núcleo anti-doble-booking endurecido). El vínculo `abono_id` se setea
--     con un UPDATE acotado JUSTO DESPUÉS del insert atómico (Plan 02): es una etiqueta que NO participa
--     de ninguna constraint (011/013/cupos/espacio), así que setearla fuera del RPC NO relaja el
--     anti-doble-booking y evita un DROP/recreate del SECURITY DEFINER (menor riesgo al núcleo, D-10).
--   - NO da read a `anon` sobre `abonos` (D-10): el público NUNCA lee ni escribe abonos. Sin read policy
--     anon, las columnas sensibles (client_id, deposit_amount, billing_subscription_id) quedan cerradas.
--   - NO toca la vista pública acotada (public_businesses): abono_window_weeks es dato interno del dueño.
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que replaya
--     el baseline numerado + 040..054 en orden. Prod se aplica A MANO coordinado con el deploy +
--     `NOTIFY pgrst, 'reload schema';` (PostgREST refresca su schema cache). Tras aplicar, regenerar
--     `supabase/schema.sql` (patrón del repo, igual que 037/039/042/043/052).

-- ── 1. abonos: la serie recurrente por negocio ─────────────────────────────────────────────
-- business_id ON DELETE CASCADE: borrar el negocio borra sus abonos. service_id ON DELETE RESTRICT:
-- un abono no puede quedar huérfano de servicio (la generación forward necesita la duración/precio
-- vivos del service). client_id / professional_id / location_id ON DELETE SET NULL + nullable:
-- professional_id es NULLABLE porque según el vertical la agenda puede ser el bucket sentinela
-- "sin profesional"; location_id NULLABLE por el mismo motivo.
CREATE TABLE IF NOT EXISTS "public"."abonos" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id"        uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
  "client_id"          uuid REFERENCES "public"."clients"("id") ON DELETE SET NULL,
  "service_id"         uuid REFERENCES "public"."services"("id") ON DELETE RESTRICT,
  "professional_id"    uuid REFERENCES "public"."professionals"("id") ON DELETE SET NULL,  -- NULLABLE: bucket "sin profesional" según vertical
  "location_id"        uuid REFERENCES "public"."locations"("id") ON DELETE SET NULL,      -- NULLABLE
  -- convención EXTRACT(dow): 0=domingo..6=sábado, idéntica a time_blocks.day_of_week y a book_slot_atomic.
  "day_of_week"        smallint NOT NULL CHECK ("day_of_week" BETWEEN 0 AND 6),
  "start_time"         time without time zone NOT NULL,
  "duration_minutes"   integer,  -- snapshot de referencia al crear; la generación usa la duración VIVA del service.
  "status"             text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'cancelled')),
  "cancel_token"       uuid NOT NULL DEFAULT gen_random_uuid(),  -- token a NIVEL SERIE (link de cancelación, Phase 7).
  "generated_until"    date,  -- frontera de la ventana rolling; hace idempotente la generación forward.
  "skipped_occurrences" jsonb NOT NULL DEFAULT '[]'::jsonb,  -- D-06: array de {date, reason} salteadas por conflicto.
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "cancelled_at"       timestamptz,
  -- ── Columnas EXTENSIBLES (D-02) — NULLABLE, presentes pero SIN lógica en v0.24 ──
  -- Placeholders del modelo extensible para NO re-migrar cuando llegue el cobro recurrente / pagá-o-liberá.
  "reminder_lead_hours"      integer,  -- v0.25: lead-time del recordatorio pagá-o-liberá.
  "deposit_amount"           numeric,  -- futuro: seña por ocurrencia.
  "billing_subscription_id"  text      -- futuro: referencia a la suscripción de cobro por cliente.
);

-- Índices: el cron itera abonos ACTIVOS por negocio.
CREATE INDEX IF NOT EXISTS "abonos_business_id_idx" ON "public"."abonos" ("business_id");
CREATE INDEX IF NOT EXISTS "abonos_business_id_status_idx" ON "public"."abonos" ("business_id", "status");

-- RLS en la MISMA migración (regla dura de la skill supabase-multitenant-rls). 4 policies owner-only,
-- una por operación, predicado de tenant idéntico al del repo (owner_id = auth.uid() envuelto en subselect).
-- drop policy if exists antes de cada create → idempotente. SIN policy anon (D-10).
ALTER TABLE "public"."abonos" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "abonos tenant select" ON "public"."abonos";
CREATE POLICY "abonos tenant select" ON "public"."abonos" FOR SELECT USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

DROP POLICY IF EXISTS "abonos tenant insert" ON "public"."abonos";
CREATE POLICY "abonos tenant insert" ON "public"."abonos" FOR INSERT WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

DROP POLICY IF EXISTS "abonos tenant update" ON "public"."abonos";
CREATE POLICY "abonos tenant update" ON "public"."abonos" FOR UPDATE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

DROP POLICY IF EXISTS "abonos tenant delete" ON "public"."abonos";
CREATE POLICY "abonos tenant delete" ON "public"."abonos" FOR DELETE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

-- ── 2. appointments.abono_id: vínculo turno → serie (D-03) ─────────────────────────────────
-- on delete set null: borrar el abono NO borra los turnos ya generados, solo los desvincula.
-- Columna aditiva → NO se agrega policy nueva (appointments ya tiene RLS + policies owner/insert).
ALTER TABLE "public"."appointments"
  ADD COLUMN IF NOT EXISTS "abono_id" uuid REFERENCES "public"."abonos"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "appointments_abono_id_idx" ON "public"."appointments" ("abono_id");

-- ── 3. businesses.abono_window_weeks: ventana de generación forward a nivel negocio (D-07) ──
-- default 8 semanas; owner-updatable (el trigger businesses_protect_admin_columns no la protege).
-- NO se agrega a public_businesses: dato interno, el anon no lo necesita (D-10).
ALTER TABLE "public"."businesses"
  ADD COLUMN IF NOT EXISTS "abono_window_weeks" integer DEFAULT 8;
