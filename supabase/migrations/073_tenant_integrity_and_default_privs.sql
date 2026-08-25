-- 073 — Cierre de la auditoría de seguridad de la Phase 18: R-01, RA-07/R-02 y WR-02.
--
-- Contexto (secure-phase de la Phase 18, motor-reservas / v0.28):
--   La migr. 072 cerró CR-01 —las seis vistas `public_*` dejaron de ser escribibles por `anon`—,
--   pero la auditoría encontró que **tapó las instancias y no la fábrica**, y que la RLS de la
--   puente nueva garantiza menos de lo que la skill `supabase-multitenant-rls` exige. Esta
--   migración cierra las tres cosas que quedaron.
--
-- ── 1. R-01: los default privileges reabren CR-01 sola ───────────────────────────────────────────
--   Medido antes de esta migración:
--
--     pg_default_acl (schema public, creadores postgres y supabase_admin, objtype 'r'):
--       anon = arwdDxtm   ← ALL, sobre TODA relación futura
--
--     BEGIN;
--     CREATE VIEW public.__tmp AS SELECT id FROM public.businesses;
--     -- grants heredados: anon = DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--     ROLLBACK;
--
--   O sea: una vista `public_*` NUEVA nace hoy con INSERT/UPDATE/DELETE para `anon`, que es
--   exactamente el defecto de CR-01. Para una TABLA nueva el paracaídas es la RLS; para una VISTA
--   DEFINER **no hay ninguno** — la vista evalúa la RLS de la tabla base como su owner. La Phase 20
--   agrega superficie pública de lectura: si crea una vista y alguien se olvida del `REVOKE ALL`,
--   CR-01 vuelve idéntica y en silencio.
--
--   Se revoca la escritura por DEFAULT para `anon` en las relaciones futuras del schema `public`.
--
--   ⚠ `authenticated` NO se toca: todo el dashboard escribe con la sesión del dueño (anon key +
--   RLS), así que revocarle la escritura por default rompería cualquier tabla nueva del panel.
--
--   ⚠ Esto NO afecta objetos EXISTENTES — `ALTER DEFAULT PRIVILEGES` sólo aplica a los que se creen
--   después. En particular `landing_leads` conserva su `landing_leads_public_insert` (policy con
--   `with_check: true`, INSERT anónimo DELIBERADO para la captación de leads del landing), que sigue
--   funcionando igual.
--
--   ⚠ CONSECUENCIA A CONOCER: si una tabla futura necesita INSERT anónimo legítimo (otro
--   `landing_leads`), va a fallar con `permission denied` hasta que su migración le dé el GRANT
--   explícito. Es el lado correcto para fallar: un permiso olvidado se ve al primer intento, un
--   permiso de más no se ve nunca.
--
-- ── 2. RA-07 / R-02: TRUNCATE no pasa por RLS ───────────────────────────────────────────────────
--   `anon` y `authenticated` conservan TRUNCATE sobre todas las tablas (default de Supabase), y
--   **TRUNCATE ignora la RLS**: medido, `SET LOCAL ROLE anon; TRUNCATE time_block_services` funciona
--   dentro de una transacción. No es alcanzable vía PostgREST —ningún verbo HTTP mapea a TRUNCATE—,
--   por eso la severidad es baja; pero el REVOKE estaba en el fix propuesto del code review para
--   CR-01 y la 072 no lo hizo. Cuesta cero y saca la única operación de escritura del schema que la
--   RLS no puede frenar.
--
-- ── 3. WR-02: la RLS no exige que las tres FK sean del MISMO negocio ────────────────────────────
--   Las 4 policies de `time_block_services` validan sólo el `business_id` de la propia fila. Las FK
--   simples garantizan EXISTENCIA, no PERTENENCIA. Medido como dueño autenticado de un negocio:
--
--     INSERT (mi business_id, time_block_id de OTRO tenant, mi service_id)  → INSERT 0 1  aceptada
--     INSERT (mi business_id, mi time_block_id, service_id de OTRO tenant)  → INSERT 0 1  aceptada
--
--   y los ids ajenos son PÚBLICOS (`public_services` y la policy `public read` de `time_blocks` los
--   devuelven para todos los tenants). La primera variante queda inerte (los lectores intersectan
--   contra los bloques propios, T-18-03); la segunda NO: convierte una franja propia en "mapeada a
--   un servicio que no está en mi catálogo" ⇒ esa franja deja de ofrecer todos mis servicios.
--
--   Se cierra de forma DECLARATIVA con UNIQUE compuesto en los padres + FK compuestas, en vez de
--   endurecer el predicado de las policies: la base pasa a rechazar la fila cross-tenant sin que
--   ningún consumidor tenga que acordarse. Molde a copiar en la Phase 19 y en cualquier puente nueva.
--
--   `time_blocks.business_id` es NULLABLE: la FK compuesta con nulo NO matchea, lo que refuerza la
--   decisión ya aceptada (RA-02) de que una franja huérfana nunca recibe mapeo y queda comodín para
--   siempre — su comportamiento de hoy.
--
-- Idempotente y sin downtime: privilegios + constraints, sin datos que migrar. La puente tiene 0
-- filas en producción, así que las FK compuestas no pueden fallar por datos preexistentes.
--
-- Verificación posterior:
--   SELECT pg_get_userbyid(defaclrole), defaclacl::text FROM pg_default_acl d
--     JOIN pg_namespace n ON n.oid = d.defaclnamespace
--    WHERE n.nspname = 'public' AND d.defaclobjtype = 'r';
--   -- anon debe quedar en 'r' (sólo SELECT), no 'arwdDxtm'
--   SELECT conname, contype FROM pg_constraint
--    WHERE conrelid = 'public.time_block_services'::regclass ORDER BY conname;

-- ── 1. R-01: la escritura deja de ser el default para `anon` en relaciones futuras ───────────────
-- `pg_default_acl` tiene una entrada POR CREADOR: `postgres` y `supabase_admin`. Hay que desarmar
-- las dos o el agujero sigue abierto según quién cree el objeto.
--
-- ⚠ `postgres` NO es miembro de `supabase_admin`, así que la segunda tira
-- `42501 permission denied to change default privileges` y abortaría la migración entera. Va dentro
-- de un bloque que degrada a NOTICE: en la práctica el creador que importa es `postgres` —es el rol
-- con el que corren TANTO las migraciones locales del CLI COMO el editor SQL del dashboard de
-- Supabase, o sea las dos vías por las que este proyecto crea objetos. Lo de `supabase_admin` se
-- intenta igual por si el entorno lo permite, y si no, queda anotado en el propio log de la
-- migración en vez de romperla.
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM "anon";

DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public"
             REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM "anon"';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE '073: sin permiso para alterar los default privileges de supabase_admin — se deja como estaba. El creador efectivo de este proyecto es postgres (CLI + editor SQL), ya cubierto arriba.';
END $$;

-- ── 2. RA-07: TRUNCATE fuera del alcance de los roles del cliente ────────────────────────────────
-- Es la única escritura del schema que la RLS no puede frenar. `authenticated` también lo pierde:
-- el dashboard nunca trunca nada, y un dueño autenticado con TRUNCATE sobre `appointments` podría
-- borrar los turnos de TODOS los negocios de una.
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA "public" FROM "anon";
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA "public" FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE TRUNCATE ON TABLES FROM "authenticated";

DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public"
             REVOKE TRUNCATE ON TABLES FROM "authenticated"';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE '073: sin permiso para alterar los default privileges de supabase_admin (TRUNCATE/authenticated) — ver la nota de arriba.';
END $$;

-- ── 3. WR-02: pertenencia al tenant garantizada por la base ──────────────────────────────────────
-- UNIQUE compuesto en los padres: requisito de Postgres para poder referenciar el par (id, business_id).
-- Redundante con la PK en cuanto a unicidad — su razón de existir es habilitar la FK compuesta.
ALTER TABLE "public"."services"
  ADD CONSTRAINT "services_id_business_uq" UNIQUE ("id", "business_id");

ALTER TABLE "public"."time_blocks"
  ADD CONSTRAINT "time_blocks_id_business_uq" UNIQUE ("id", "business_id");

-- FK compuestas: la fila sólo existe si el bloque Y el servicio son del MISMO negocio que declara.
-- ON DELETE CASCADE, igual que las tres FK simples que ya tiene (que se conservan: la de business_id
-- sigue siendo la que limpia al borrar el negocio, y las otras dos no estorban).
ALTER TABLE "public"."time_block_services"
  ADD CONSTRAINT "tbs_block_same_tenant" FOREIGN KEY ("time_block_id", "business_id")
      REFERENCES "public"."time_blocks" ("id", "business_id") ON DELETE CASCADE;

ALTER TABLE "public"."time_block_services"
  ADD CONSTRAINT "tbs_service_same_tenant" FOREIGN KEY ("service_id", "business_id")
      REFERENCES "public"."services" ("id", "business_id") ON DELETE CASCADE;
