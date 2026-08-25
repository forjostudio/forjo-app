-- 072 — HOTFIX de seguridad: las vistas public_* pasan a ser SOLO LECTURA para anon y authenticated.
--
-- Contexto (hallazgo CR-01 del code review de la Phase 18, motor-reservas / v0.28):
--   Las seis vistas acotadas `public_*` se crearon con el mismo molde desde la migr. 059:
--   `OWNER TO postgres` + `GRANT ALL` a anon/authenticated/service_role, sin `security_invoker`.
--   Ese molde tiene un agujero que ninguna de las migraciones que lo copió notó, y el comentario
--   de la 071 lo dice explícitamente al revés ("la vista no tiene otra operación posible"):
--
--   Una vista SIMPLE sobre una sola tabla (SELECT de columnas directas, sin DISTINCT, sin GROUP BY,
--   sin agregados, sin UNION) es **auto-actualizable** para Postgres: acepta INSERT/UPDATE/DELETE y
--   los propaga a la tabla base. Y como la vista NO es `security_invoker`, esas escrituras se
--   evalúan con los privilegios del OWNER (`postgres`), no los del invocador — o sea que la RLS de
--   la tabla base **no se aplica**. `GRANT ALL ... TO anon` sobre una vista así es una puerta de
--   escritura sin autenticar a la tabla que la vista pretendía proteger.
--
--   Cinco de las seis vistas son auto-actualizables (medido con
--   `SELECT table_name, is_updatable, is_insertable_into FROM information_schema.views
--    WHERE table_schema='public' AND table_name LIKE 'public\_%'`):
--
--     public_businesses             YES  ← en producción
--     public_professionals          YES  ← en producción
--     public_services               YES  ← en producción
--     public_professional_services  YES  ← en producción (migr. 059)
--     public_time_block_services    YES  ← migr. 071, todavía no aplicada a prod
--     public_canchas                NO   (la definición no es auto-actualizable HOY; se blinda igual)
--
--   Reproducción contra el Postgres local, como rol `anon`, sin ninguna sesión, en transacción
--   revertida — cada DELETE tocó a TODOS los tenants a la vez:
--
--     BEGIN; SET LOCAL ROLE anon;
--     DELETE FROM public.public_services;    -- DELETE 4   → services restantes: 0
--     DELETE FROM public.public_businesses;  -- DELETE 6   → businesses restantes: 0
--     ROLLBACK;                              -- 4 y 6 restaurados
--
--   El vector es alcanzable desde afuera vía PostgREST con la anon key (POST/DELETE sobre
--   `/rest/v1/public_*` devuelven 201/200), y los ids necesarios son públicos por diseño.
--   El control negativo confirma dónde está el defecto: el mismo INSERT contra la TABLA base rebota
--   con `42501 new row violates row-level security policy` — la RLS funciona; lo que la saltea es
--   la vista DEFINER con permiso de escritura.
--
--   Esto NO lo introdujo la Phase 18: la 071 copió un molde que ya venía roto desde la 059. La 072
--   cierra las seis de una vez en lugar de arreglar solo la nueva.
--
-- Qué hace:
--   1. REVOKE ALL de anon y authenticated sobre las 6 vistas `public_*` — saca INSERT, UPDATE,
--      DELETE, TRUNCATE, REFERENCES y TRIGGER.
--   2. GRANT SELECT a anon y authenticated — que es lo único que el read-path público usa de hecho
--      (RSC público de `/[slug]`, booking anónimo). La lectura no cambia en nada.
--   `service_role` queda intacto a propósito: es server-only, nunca llega al cliente, y ya bypassa
--   RLS por diseño en los route handlers que resuelven el tenant a mano.
--
-- Por qué SELECT y no `security_invoker`:
--   Poner `security_invoker` en estas vistas las rompería en el sentido contrario — es exactamente
--   la trampa que la 071 documenta en su cabecera: `anon` no tiene policy sobre las tablas base, así
--   que con invocador leería 0 filas SIEMPRE y en silencio (una agenda pública vacía indistinguible
--   de un negocio sin datos). El acotamiento de estas vistas ES el mecanismo de lectura pública; lo
--   que sobraba era el permiso de escritura. Se saca el permiso, se conserva el DEFINER.
--
-- Idempotente y sin downtime: son cambios de privilegios, no de datos ni de definición. El read-path
-- solo hace SELECT, así que no hay nada que migrar ni ventana que coordinar. APLICAR A PRODUCCIÓN
-- CUANTO ANTES, independientemente del deploy de la Phase 18 — cuatro de las cinco vistas afectadas
-- ya están en prod.
--
-- Verificación posterior (debe devolver solo `SELECT` para anon y authenticated):
--   SELECT table_name, grantee, privilege_type
--     FROM information_schema.role_table_grants
--    WHERE table_schema = 'public'
--      AND table_name LIKE 'public\_%'
--      AND grantee IN ('anon', 'authenticated')
--    ORDER BY table_name, grantee, privilege_type;

-- ── public_businesses ────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE "public"."public_businesses" FROM "anon";
REVOKE ALL ON TABLE "public"."public_businesses" FROM "authenticated";
GRANT SELECT ON TABLE "public"."public_businesses" TO "anon";
GRANT SELECT ON TABLE "public"."public_businesses" TO "authenticated";

-- ── public_professionals ─────────────────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE "public"."public_professionals" FROM "anon";
REVOKE ALL ON TABLE "public"."public_professionals" FROM "authenticated";
GRANT SELECT ON TABLE "public"."public_professionals" TO "anon";
GRANT SELECT ON TABLE "public"."public_professionals" TO "authenticated";

-- ── public_services ──────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE "public"."public_services" FROM "anon";
REVOKE ALL ON TABLE "public"."public_services" FROM "authenticated";
GRANT SELECT ON TABLE "public"."public_services" TO "anon";
GRANT SELECT ON TABLE "public"."public_services" TO "authenticated";

-- ── public_canchas (no auto-actualizable hoy; se blinda igual para que no dependa de su definición)
REVOKE ALL ON TABLE "public"."public_canchas" FROM "anon";
REVOKE ALL ON TABLE "public"."public_canchas" FROM "authenticated";
GRANT SELECT ON TABLE "public"."public_canchas" TO "anon";
GRANT SELECT ON TABLE "public"."public_canchas" TO "authenticated";

-- ── public_professional_services (migr. 059 — el origen del molde) ───────────────────────────────
REVOKE ALL ON TABLE "public"."public_professional_services" FROM "anon";
REVOKE ALL ON TABLE "public"."public_professional_services" FROM "authenticated";
GRANT SELECT ON TABLE "public"."public_professional_services" TO "anon";
GRANT SELECT ON TABLE "public"."public_professional_services" TO "authenticated";

-- ── public_time_block_services (migr. 071 — la instancia nueva de la Phase 18) ────────────────────
REVOKE ALL ON TABLE "public"."public_time_block_services" FROM "anon";
REVOKE ALL ON TABLE "public"."public_time_block_services" FROM "authenticated";
GRANT SELECT ON TABLE "public"."public_time_block_services" TO "anon";
GRANT SELECT ON TABLE "public"."public_time_block_services" TO "authenticated";
