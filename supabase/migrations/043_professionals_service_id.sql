-- 043 — professionals.service_id: puntero estable 1:1 cancha↔agenda (vertical canchas, D-06).
--
-- Contexto (canchas / Phase 2 — CANCHA-01/02/03):
--   En el vertical canchas, cada cancha es una entidad reservable unificada: precio + duración fija
--   viven en `services` (D-01, cada cancha = 1 fila en services) y la cancha ES la fila de agenda
--   (`professionals`) que el motor v0.12 ya reserva y que `agenda_spaces` ya mapea a espacios físicos.
--   Falta materializar el 1:1 cancha↔agenda con un PUNTERO ESTABLE: dada una cancha (agenda) hay que
--   reconstruir su `service` (precio+duración) sin emparejar por nombre (frágil al renombrar).
--
-- Qué hace:
--   1. ALTER TABLE professionals ADD COLUMN service_id uuid NULLABLE, FK → services(id) ON DELETE SET NULL.
--      Es el puntero 1:1 de la agenda-cancha a su service de precio+duración (D-06). ON DELETE SET NULL:
--      si se borra el service, la agenda queda sin puntero (huérfana recuperable) en vez de romper el FK.
--   2. Índice btree PARCIAL sobre professionals(service_id) WHERE service_id IS NOT NULL: solo las
--      filas-cancha lo pueblan → canchasFromData reconstruye la tupla rápido sin indexar millones de
--      filas NULL de salud/belleza/general.
--
-- Racional D-06 (lockeado DESPUÉS del research, supera su recomendación de "reusar specialty"):
--   Se DESCARTÓ reusar `professionals.specialty` como puntero (hacky: meter un UUID en un campo
--   semántico de especialidad, frágil y ambiguo). La columna dedicada `service_id` es explícita y
--   estable. Es NULLABLE a propósito: las filas `professionals` de salud/belleza/general la dejan en
--   NULL (cero backfill, cero regresión — esos verticales no son canchas y no la usan).
--
-- Qué NO hace (invariantes del proyecto):
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado + 040 + 041 + 042 + 043 en orden. Prod se aplica A MANO coordinado
--     con el deploy + `NOTIFY pgrst, 'reload schema';` (PostgREST refresca su schema cache). Tras
--     aplicar, regenerar `supabase/schema.sql` (patrón del repo, igual que 037/039/042).
--   - NO agrega policy RLS nueva ni habilita RLS: la columna vive sobre `professionals`, que YA es
--     RLS por business_id (policy "business member access") → hereda el aislamiento existente. Agregar
--     una policy nueva sería un error (no hace falta, no cambia la superficie de acceso).
--   - NO agrega tablas ni columnas de precio/duración (siguen en `services`, D-01).
--   - NO hace backfill: ninguna fila existente recibe service_id (la columna arranca toda en NULL).

-- ── professionals.service_id: puntero 1:1 a su service (canchas) ────────────────────────────
ALTER TABLE "public"."professionals"
  ADD COLUMN IF NOT EXISTS "service_id" uuid REFERENCES "public"."services"("id") ON DELETE SET NULL;

-- Índice parcial: solo las filas-cancha (service_id no nulo) → reconstrucción rápida de la tupla,
-- sin indexar las filas NULL de los demás verticales.
CREATE INDEX IF NOT EXISTS "professionals_service_id_idx"
  ON "public"."professionals" USING "btree" ("service_id")
  WHERE ("service_id" IS NOT NULL);
