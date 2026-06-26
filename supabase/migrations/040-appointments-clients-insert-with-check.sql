-- 040 — Hardening de defensa en profundidad: FOR INSERT WITH CHECK explícito
-- para appointments y clients (aislamiento por tenant en el alta).
--
-- Contexto (motor-reservas / Phase 1 — turnos manuales, MANUAL-01):
--   El alta manual de turnos desde el panel reusa el INSERT autenticado del dueño
--   sobre appointments (y, cuando se crea un cliente nuevo, clients). Esas tablas ya
--   tienen la policy "business member access" del baseline definida como FOR ALL ...
--   USING (business_id IN <negocios del dueño>). En Postgres, una policy permissive
--   FOR ALL usa su expresión USING también como WITH CHECK de las filas nuevas, así
--   que el INSERT cross-tenant YA falla hoy. Esta migración NO arregla un bug
--   funcional: es hardening de CLARIDAD pedido por la skill supabase-multitenant-rls
--   (regla 3: "una policy por operación con la cláusula correcta; el olvido típico es
--   el WITH CHECK en INSERT").
--
-- Qué hace:
--   Agrega DOS policies PERMISSIVE adicionales, una por tabla, FOR INSERT WITH CHECK,
--   copiando literal el patrón de `fixed_expenses tenant insert` del baseline
--   (00000000000000_baseline.sql:1272-1274). Al ser permissive, se OR-ean con la
--   policy "business member access" existente; ambas expresan la MISMA regla de tenant
--   (business_id ∈ negocios cuyo owner_id = auth.uid()), por lo que no aflojan nada.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO hace DROP de la policy "business member access" existente.
--   - NO toca los constraints anti doble-booking: appointments_no_double_booking (011)
--     ni appointments_no_overlap (013).
--   - NO modifica RLS de ninguna otra tabla.
--   - NO se aplica a producción automáticamente: prod se aplica a mano, coordinado con
--     el deploy (constraint del proyecto / MEMORY infra-testing-roadmap).

CREATE POLICY "appointments tenant insert" ON "public"."appointments" FOR INSERT WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "clients tenant insert" ON "public"."clients" FOR INSERT WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));
