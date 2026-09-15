-- 078 — El modelo del catálogo: service_categories por negocio + categoría/orden en services +
--       los dos modos de orden a nivel negocio + la vista acotada anon.
--
-- Contexto (motor-reservas / Phase 22 — CAT-06/CAT-07, v0.29 "Categorías de servicios"):
--   Hoy la página pública de reservas pinta el catálogo como UNA lista plana: `services` no tiene
--   forma de decir "esto es Color y esto es Corte", así que un negocio con 20 servicios obliga al
--   cliente a leerlos todos para encontrar el suyo. Esta migración instala el MODELO que permite
--   declarar esos títulos —y NADA más: no hay superficie en esta fase (el panel es la Phase 23 y la
--   página pública la 24)—.
--
--   La forma del modelo está elegida para que CAT-07 ("un negocio sin categorías ve exactamente la
--   lista de hoy") sea cierto POR CONSTRUCCIÓN y no por cuidado (D-08). El día que esto se aplique
--   TODOS los negocios de producción tienen cero categorías, o sea que "sin categorías" no es un
--   caso borde: es el camino de TODOS los clientes actuales. `category_id` nullable + `sort_order`
--   con DEFAULT 0 + modo de orden con DEFAULT 'custom' hacen que ese camino devuelva la lista de
--   hoy sin una sola rama de código que lo cuide.
--
--   Misma familia que `professional_services` (migr. 057) y `time_block_services` (migr. 071): la
--   AUSENCIA de dato significa "vale igual", nunca "no vale" (D-03). Un servicio sin categoría es un
--   estado LEGAL Y PERMANENTE y jamás desaparece del catálogo.
--
-- Qué hace:
--   1. Crea `service_categories` (id, business_id, name, sort_order, created_at), habilita RLS en la
--      MISMA migración y crea las 4 policies por operación con el predicado de tenant por `owner_id`
--      (molde 071). SIN policy `anon`: el público nunca lee la tabla base.
--   2. Tres índices además de la PK: UNIQUE (business_id, lower(name)) —CAT-01 resuelto en la BASE,
--      no en la pantalla—, (business_id, sort_order) para el orden, y UNIQUE (id, business_id) cuya
--      única razón de existir es habilitar la FK compuesta del punto 3.
--   3. `services.category_id` uuid NULLABLE + `services.sort_order` integer NOT NULL DEFAULT 0, y la
--      FK COMPUESTA `services_category_same_tenant (category_id, business_id) → service_categories
--      (id, business_id) ON DELETE SET NULL (category_id)`: un servicio NUNCA puede apuntar a una
--      categoría de otro negocio, y borrar una categoría NO toca el `business_id` del servicio.
--   4. `businesses.category_sort_mode` ('custom'|'alpha') y `businesses.service_sort_mode`
--      ('custom'|'alpha'|'price'), las dos NOT NULL DEFAULT 'custom' con su CHECK (molde 061). El
--      modo de orden es POR NEGOCIO, no por categoría (D-05).
--   5. Crea la vista acotada `public_service_categories` (4 columnas, owner postgres, DEFINER) con
--      REVOKE ALL + GRANT SELECT para anon/authenticated — el camino por el que el público lee los
--      títulos.
--   6. Redefine `public_services` y `public_businesses` agregando AL FINAL las columnas nuevas, y
--      re-emite sus permisos EN LA FORMA DE LA 072 (SELECT-only para anon/authenticated).
--   7. `NOTIFY pgrst, 'reload schema';`
--
-- Qué NO hace (invariantes del proyecto):
--   - CERO BACKFILL: no siembra ni una categoría, ni asigna ni un `category_id`. Es lo que hace
--     cierto a CAT-07 por construcción (D-08). Sembrar UNA sola fila rompería la garantía.
--   - Nada destructivo: ni DROP TABLE, ni DROP COLUMN, ni DELETE, ni TRUNCATE. Todo es aditivo.
--   - NO toca el motor de reservas: ni `book_slot_atomic`, ni el índice único 011, ni el EXCLUDE
--     gist 013, ni ningún trigger/constraint de `appointments`, ni `services.capacity` /
--     `capacity_mode` (migr. 068) ni el invariante de duración de la 077.
--   - NO toca las policies de `services` ni de `businesses`: las columnas nuevas quedan cubiertas
--     por las policies de tenant que esas tablas ya tienen.
--   - NO da acceso `anon` a la TABLA `service_categories` (molde 057/071): para eso está la vista.
--   - NO edita `supabase/schema.sql`. Ese espejo se hace DESPUÉS de aplicar a prod y de forma
--     QUIRÚRGICA (decisión del repo desde la Phase 06); reflejar una migración no aplicada convierte
--     al espejo en mentira.
--
-- ⚠⚠ POR QUÉ EL `ON DELETE` LLEVA LISTA DE COLUMNAS — `ON DELETE SET NULL ("category_id")`:
--   Sin la lista, Postgres nulea LAS DOS columnas de la clave foránea, y `services.business_id` es
--   NULLABLE (verificado: en `schema.sql` la columna se declara `"business_id" "uuid"`, sin NOT
--   NULL). O sea que borrar una categoría dejaría a sus servicios SIN NEGOCIO: fuera de la RLS de su
--   dueño (que filtra por esa columna), fuera de `public_services` —que el RSC lee acotando por
--   `business_id`— y por lo tanto FUERA DE LA VENTA, sin un solo error a la vista. Eso viola de
--   frente el criterio de la fase: borrar una categoría no borra ni desactiva un solo servicio.
--   Es el MISMO defecto que la migr. 075 midió contra este mismo motor (PG 17.6, transacción
--   revertida: con `ON DELETE SET NULL` a secas, `business_id_quedo_null = t`), sólo que acá el
--   objeto que desaparece es un servicio VENDIBLE, así que el daño es peor. La lista de columnas se
--   soporta desde PG 15 y la 075 ya la usa. Verificación: la definición del constraint TIENE que
--   terminar en `ON DELETE SET NULL (category_id)` — sin los paréntesis con el nombre de la columna,
--   el constraint es la variante que saca servicios de la venta (T-22-05).
--
-- ⚠ RESIDUO CONOCIDO: MATCH SIMPLE.
--   Un servicio con `business_id` NULL y `category_id` seteado NO es validado por esta FK: con MATCH
--   SIMPLE (el default), si alguna columna de la clave es nula la FK no se evalúa. Es el mismo
--   residuo que las migr. 073 y 075 ya documentaron. Ese servicio YA es invisible hoy —ni el panel
--   ni `public_services` lo alcanzan, las dos lecturas filtran por `business_id`—, así que el
--   residuo REFUERZA el estado actual en vez de abrir algo. No se agrega ningún chequeo extra para
--   taparlo: sería inventar una regla que el resto del esquema no sostiene.
--
-- ⚠⚠ LA COPIA-Y-PEGA MÁS PELIGROSA DE ESTE ARCHIVO — los GRANT de las vistas:
--   El molde de GRANT de las migr. 059/061/071 termina en `GRANT ALL ... TO "anon"`. Ese molde VENÍA
--   ROTO y la migr. **072** existe exactamente para desarmarlo: una vista SIMPLE sobre una tabla es
--   AUTO-ACTUALIZABLE para Postgres, y siendo DEFINER (owner postgres), un permiso de escritura ahí
--   es una puerta de escritura SIN AUTENTICAR que SALTEA la RLS de la tabla base. Medido en la 072:
--   como rol `anon`, sin ninguna sesión, `DELETE FROM public.public_services` borró los servicios de
--   TODOS los tenants a la vez. Las tres vistas de esta migración llevan `REVOKE ALL` + `GRANT
--   SELECT` para anon/authenticated y `GRANT ALL` sólo para `service_role`. La próxima fase que
--   agregue una columna a estas vistas NO debe pisar esto (T-22-03).
--
-- ⚠ LA VISTA ES DEFINER, NUNCA `security_invoker` (Pitfall 5 — documentado en la 044, repetido en la
--   059 y otra vez en la 071):
--   Con `security_invoker` la vista heredaría la RLS de la tabla base, que `anon` NO cumple (no tiene
--   policy) ⇒ el público leería 0 filas SIEMPRE y EN SILENCIO. El resultado observable sería "ningún
--   negocio tiene categorías", indistinguible del estado real de CAT-07 y por lo tanto invisible en
--   un QA superficial. Owner `postgres`, sin excepción (T-22-02).
--
-- ── RUNBOOK DE PRODUCCIÓN (esta migración NO se aplicó allá) ────────────────────────────────────
--   Última migración aplicada en prod: 077. Esta es la 078 y no se saltea ningún número.
--
--   (a) La 078 es ADITIVA E INERTE: ninguna lectura de la app de hoy necesita las columnas ni la
--       vista nuevas, y no hay backfill. Se puede aplicar ANTES del deploy sin coordinar nada, y
--       entre que se aplica y que se deployan las Phases 23/24 el comportamiento es byte-idéntico.
--
--   (b) Pegar y ejecutar este archivo COMPLETO, de una sola vez, en el SQL editor — nunca statement
--       por statement.
--
--   (c) OBLIGATORIO al final: `NOTIFY pgrst, 'reload schema';` (ya está en la sección 6). Sin eso
--       PostgREST no expone ni la vista nueva ni las columnas nuevas de las vistas viejas, y la
--       falla es FAIL-SAFE Y SILENCIOSA: el booking de hoy sigue funcionando y las categorías
--       simplemente nunca aparecen (la 059 documentó exactamente este modo de falla). Nunca deja el
--       catálogo vacío, sólo sin títulos (T-22-09).
--
--   (d) VERIFICACIÓN POSTERIOR — las tres consultas, en este orden:
--
--         -- 1) estructura
--         SELECT count(*) FROM pg_policies
--          WHERE schemaname='public' AND tablename='service_categories';                  -- 4
--         SELECT relrowsecurity FROM pg_class WHERE relname='service_categories';          -- t
--         SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--          WHERE conname IN ('services_category_same_tenant','service_categories_id_business_uq',
--                            'businesses_category_sort_mode_chk','businesses_service_sort_mode_chk');
--         -- services_category_same_tenant DEBE terminar en: ON DELETE SET NULL (category_id)
--
--         -- 2) permisos (debe devolver SOLO 'SELECT' para anon y authenticated)
--         SELECT table_name, grantee, privilege_type
--           FROM information_schema.role_table_grants
--          WHERE table_schema='public'
--            AND table_name IN ('public_service_categories','public_services','public_businesses')
--            AND grantee IN ('anon','authenticated')
--          ORDER BY table_name, grantee, privilege_type;
--
--         -- 3) cero backfill
--         SELECT count(*) FROM public.service_categories;                                  -- 0
--
--   (e) RECIÉN DESPUÉS de aplicarla, espejar `supabase/schema.sql` A MANO y de forma QUIRÚRGICA
--       —nunca con `db dump`—. Ese espejo es trabajo del plan 22-04, no de éste.
--
-- Idempotente (el baseline se replaya entero en cada `supabase db reset`): CREATE TABLE IF NOT
-- EXISTS, ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS antes de cada CREATE POLICY, CREATE INDEX
-- IF NOT EXISTS, CREATE OR REPLACE VIEW, y los ADD CONSTRAINT guardados por pg_constraint (molde
-- 065/075). Re-correrla es no-op.

-- ── 1. service_categories: los títulos del catálogo, por negocio ────────────────────────────────
-- `sort_order` con DEFAULT 0 y `created_at` para desempatar/auditar. La FK a `businesses` es ON
-- DELETE CASCADE: cerrar un negocio se lleva sus categorías (y el `ON DELETE SET NULL` de la sección
-- 2 deja a sus servicios sin categoría, no sin negocio).
--
-- `business_id` es NOT NULL acá (a diferencia de `services.business_id`, que es nullable por
-- historia): una categoría sin negocio no tendría dueño que la vea ni vista pública que la filtre.
CREATE TABLE IF NOT EXISTS "public"."service_categories" (
  "id"          uuid NOT NULL DEFAULT "gen_random_uuid"(),
  "business_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
  "name"        "text" NOT NULL,
  "sort_order"  integer NOT NULL DEFAULT 0,
  "created_at"  timestamp with time zone NOT NULL DEFAULT "now"(),
  PRIMARY KEY ("id")
);

ALTER TABLE "public"."service_categories" ENABLE ROW LEVEL SECURITY;

-- 4 policies por operación, predicado de tenant idéntico al de la 071 (owner_id = auth.uid()
-- envuelto en subselect para que Postgres lo evalúe una sola vez por query).
-- select/delete con USING; insert con WITH CHECK; update con USING **y** WITH CHECK (regla 3 de la
-- skill supabase-multitenant-rls: sin el WITH CHECK del UPDATE, un dueño podría REASIGNAR su
-- categoría al business_id de otro). SIN policy `anon`: el público nunca lee la tabla base, para eso
-- está la vista de la sección 5 (T-22-06). Precedidas por DROP POLICY IF EXISTS (idempotencia).
DROP POLICY IF EXISTS "service_categories tenant select" ON "public"."service_categories";
DROP POLICY IF EXISTS "service_categories tenant insert" ON "public"."service_categories";
DROP POLICY IF EXISTS "service_categories tenant update" ON "public"."service_categories";
DROP POLICY IF EXISTS "service_categories tenant delete" ON "public"."service_categories";

CREATE POLICY "service_categories tenant select" ON "public"."service_categories" FOR SELECT USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "service_categories tenant insert" ON "public"."service_categories" FOR INSERT WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "service_categories tenant update" ON "public"."service_categories" FOR UPDATE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "service_categories tenant delete" ON "public"."service_categories" FOR DELETE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

-- ── 2. Los tres índices de service_categories (además de la PK) ─────────────────────────────────
-- (a) UNIQUE sobre (business_id, lower(name)) — CAT-01 resuelto EN LA BASE y no por buena voluntad
--     de la pantalla. Dos categorías del mismo negocio llamadas "Color" y "COLOR" dejarían el
--     catálogo con dos títulos que el cliente lee como UNO (T-22-07). Va sobre la EXPRESIÓN
--     `lower(name)`, no sobre la columna cruda: un índice sobre `name` no atrapa la diferencia de
--     capitalización, que es justo el caso que muerde. Portado del `categorias_nombre_idx` de
--     forjo-tiendas a las columnas en inglés de este repo. Es índice y no constraint porque Postgres
--     no acepta expresiones en un UNIQUE de tabla.
CREATE UNIQUE INDEX IF NOT EXISTS "service_categories_name_uq"
  ON "public"."service_categories" ("business_id", "lower"("name"));

-- (b) El orden del catálogo se lee SIEMPRE acotado por negocio y ordenado por sort_order.
CREATE INDEX IF NOT EXISTS "service_categories_order_idx"
  ON "public"."service_categories" ("business_id", "sort_order");

-- (c) UNIQUE (id, business_id): redundante con la PK en cuanto a unicidad — su ÚNICA razón de
--     existir es habilitar la FK compuesta de la sección 3, porque Postgres exige un índice único
--     sobre las columnas referenciadas. Misma frase y mismo motivo que `services_id_business_uq` de
--     la 073 y `locations_id_business_uq` de la 075. Guardado por pg_constraint (idempotencia).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'service_categories_id_business_uq'
       AND "conrelid" = '"public"."service_categories"'::"regclass"
  ) THEN
    ALTER TABLE "public"."service_categories"
      ADD CONSTRAINT "service_categories_id_business_uq" UNIQUE ("id", "business_id");
  END IF;
END
$$;

-- ── 3. services declara su categoría y su orden ─────────────────────────────────────────────────
-- `category_id` es NULLABLE, y esa nulabilidad ES EL REQUISITO (D-03): un servicio sin categoría es
-- un estado legal y PERMANENTE, no un dato a completar. `sort_order` NOT NULL DEFAULT 0 cubre las
-- filas existentes sin backfill, y con todos los valores en 0 más un orden ESTABLE la salida del
-- módulo puro es la IDENTIDAD sobre la lista que llega (CAT-07 por construcción).
ALTER TABLE "public"."services"
  ADD COLUMN IF NOT EXISTS "category_id" uuid;

ALTER TABLE "public"."services"
  ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;

-- La FK COMPUESTA: un servicio jamás puede apuntar a una categoría de OTRO negocio, y la garantía es
-- DECLARATIVA en vez de confiada al predicado de las policies (que sólo miran el business_id de la
-- PROPIA fila, y las FK simples garantizan EXISTENCIA, no PERTENENCIA — T-22-04). Molde exacto de
-- las migr. 073 y 075, que tuvieron que agregar esto retroactivamente cuando faltó.
--
-- ⚠⚠ `ON DELETE SET NULL ("category_id")` CON LISTA DE COLUMNAS. Ver el bloque de la cabecera: sin
-- la lista, borrar una categoría también nulearía `services.business_id` (que es NULLABLE) y el
-- servicio saldría de la RLS de su dueño y de `public_services` — o sea, dejaría de venderse, en
-- silencio (T-22-05). La 075 midió ese comportamiento contra este mismo motor.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'services_category_same_tenant'
       AND "conrelid" = '"public"."services"'::"regclass"
  ) THEN
    ALTER TABLE "public"."services"
      ADD CONSTRAINT "services_category_same_tenant"
      FOREIGN KEY ("category_id", "business_id")
      REFERENCES "public"."service_categories" ("id", "business_id")
      ON DELETE SET NULL ("category_id");
  END IF;
END
$$;

-- ── 4. Los dos modos de orden, a nivel NEGOCIO (D-05) ───────────────────────────────────────────
-- Molde exacto de la 061 (`public_selector_default`): columna text NOT NULL DEFAULT + CHECK de enum
-- guardado por pg_constraint. El NOT NULL DEFAULT cubre las filas existentes SIN backfill.
--
-- ⚠ POR QUÉ EL DEFAULT ES 'custom' Y NO ALFABÉTICO:
--   Con 'custom' + todos los `sort_order` en 0 + un orden ESTABLE, la salida del módulo puro es la
--   IDENTIDAD sobre la lista que llega. Y eso importa porque la lectura pública de HOY
--   (`app/[slug]/page.tsx`) NO tiene `ORDER BY`: "el mismo orden que hoy" sólo es reproducible si el
--   modelo NO REORDENA NADA. Cualquier otro default —alfabético, por precio— sería un cambio VISIBLE
--   para todos los negocios de producción el día de la migración, que es exactamente lo que CAT-07
--   prohíbe.
--
-- El modo es por NEGOCIO y no por categoría (D-05): si algún día se pide por categoría, se agrega
-- sin re-migrar. `service_sort_mode` tiene un valor más ('price') porque ordenar categorías por
-- precio no significa nada.
ALTER TABLE "public"."businesses"
  ADD COLUMN IF NOT EXISTS "category_sort_mode" "text" NOT NULL DEFAULT 'custom';

ALTER TABLE "public"."businesses"
  ADD COLUMN IF NOT EXISTS "service_sort_mode" "text" NOT NULL DEFAULT 'custom';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'businesses_category_sort_mode_chk'
       AND "conrelid" = '"public"."businesses"'::"regclass"
  ) THEN
    ALTER TABLE "public"."businesses"
      ADD CONSTRAINT "businesses_category_sort_mode_chk"
      CHECK ("category_sort_mode" IN ('custom', 'alpha'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'businesses_service_sort_mode_chk'
       AND "conrelid" = '"public"."businesses"'::"regclass"
  ) THEN
    ALTER TABLE "public"."businesses"
      ADD CONSTRAINT "businesses_service_sort_mode_chk"
      CHECK ("service_sort_mode" IN ('custom', 'alpha', 'price'));
  END IF;
END
$$;

-- ── 5. public_service_categories: la vista acotada que lee el anon ──────────────────────────────
-- CUATRO columnas y nada más. `created_at` queda AFUERA a propósito: ningún consumidor lo necesita y
-- es metadato de cuándo se configuró el negocio. La pregunta columna por columna es la misma que la
-- v0.13 se hizo con `public_canchas`, que deliberadamente NO expone `service_id`.
--
-- ⚠ DEFINER, nunca `security_invoker` — ver el bloque de la cabecera (Pitfall 5 / T-22-02): con
-- invocador el anon leería 0 filas SIEMPRE y en silencio, indistinguible de "este negocio no tiene
-- categorías". Owner `postgres`, sin excepción.
--
-- El aislamiento efectivo lo da el `.eq('business_id', ...)` que hace el RSC al leerla, igual que las
-- otras vistas `public_*`. Lo que la vista expone (`name`) es un TÍTULO PÚBLICO POR DISEÑO: la Phase
-- 24 lo pinta en la página de reservas. Sin dato de cliente, sin precio, sin ocupación (T-22-01).
--
-- Todavía NO tiene consumidor: se crea acá igual y a propósito, porque las migraciones se aplican a
-- prod A MANO y partir la tabla y su vista en dos aplicaciones manuales separadas duplica el riesgo
-- operativo por cero beneficio (mismo criterio que la 071).
CREATE OR REPLACE VIEW "public"."public_service_categories" AS
 SELECT "id",
    "business_id",
    "name",
    "sort_order"
   FROM "public"."service_categories";


ALTER VIEW "public"."public_service_categories" OWNER TO "postgres";


-- ⚠ FORMA DE LA 072, NO la de la 059/061/071. Ver el bloque de la cabecera: esta vista es simple
-- sobre una tabla ⇒ auto-actualizable ⇒ un GRANT de escritura sobre una vista DEFINER es una puerta
-- de escritura sin autenticar que saltea la RLS de la tabla base (T-22-03).
REVOKE ALL ON TABLE "public"."public_service_categories" FROM "anon";
REVOKE ALL ON TABLE "public"."public_service_categories" FROM "authenticated";
GRANT SELECT ON TABLE "public"."public_service_categories" TO "anon";
GRANT SELECT ON TABLE "public"."public_service_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."public_service_categories" TO "service_role";

-- ── 6. Las dos vistas públicas existentes exponen las columnas nuevas ───────────────────────────
-- ⚠ `CREATE OR REPLACE VIEW` sólo permite AGREGAR COLUMNAS AL FINAL: si el listado de las viejas no
-- coincide EXACTAMENTE en orden y en nombre, la redefinición falla entera (T-22-08). Los listados de
-- abajo se copiaron VERBATIM del estado vigente (`supabase/schema.sql` + `pg_get_viewdef` contra el
-- PG local): 11 columnas en `public_services` y 22 en `public_businesses`. El `WHERE active = true`
-- de `public_services` se conserva.
CREATE OR REPLACE VIEW "public"."public_services" AS
 SELECT "id",
    "business_id",
    "name",
    "duration_minutes",
    "price",
    "description",
    "active",
    "location_id",
    "location_ids",
    "created_at",
    "capacity_mode",
    "category_id",
    "sort_order"
   FROM "public"."services"
  WHERE ("active" = true);


ALTER VIEW "public"."public_services" OWNER TO "postgres";


-- ⚠⚠ Re-emitir los permisos EN LA FORMA DE LA 072. Ésta es la copia-y-pega más peligrosa del
-- archivo: el molde de la 061 termina con `GRANT ALL ... TO "anon"` sobre `public_businesses`, y
-- copiarlo tal cual REABRIRÍA CR-01 sobre dos vistas que YA ESTÁN EN PRODUCCIÓN (T-22-03).
REVOKE ALL ON TABLE "public"."public_services" FROM "anon";
REVOKE ALL ON TABLE "public"."public_services" FROM "authenticated";
GRANT SELECT ON TABLE "public"."public_services" TO "anon";
GRANT SELECT ON TABLE "public"."public_services" TO "authenticated";
GRANT ALL ON TABLE "public"."public_services" TO "service_role";

-- `category_sort_mode` y `service_sort_mode` viajan al anon porque son flags de PRESENTACIÓN del
-- propio negocio (enum acotado), no dato sensible ni PII — mismo criterio con el que la 061 expuso
-- `public_selector_default`. La página pública necesita saber en qué orden pintar el catálogo.
CREATE OR REPLACE VIEW "public"."public_businesses" AS
 SELECT "id",
    "owner_id",
    "slug",
    "name",
    "type",
    "vertical",
    "logo_url",
    "primary_color",
    "whatsapp",
    "address",
    "instagram",
    "require_deposit",
    "deposit_amount",
    "deposit_expiry_hours",
    "recaptcha_site_key",
    "default_slot_duration",
    "buffer_minutes",
    "created_at",
    "landing_config",
    "max_advance_days",
    "max_advance_date",
    "public_selector_default",
    "category_sort_mode",
    "service_sort_mode"
   FROM "public"."businesses";


ALTER VIEW "public"."public_businesses" OWNER TO "postgres";


REVOKE ALL ON TABLE "public"."public_businesses" FROM "anon";
REVOKE ALL ON TABLE "public"."public_businesses" FROM "authenticated";
GRANT SELECT ON TABLE "public"."public_businesses" TO "anon";
GRANT SELECT ON TABLE "public"."public_businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."public_businesses" TO "service_role";

-- ── 7. Recargar el schema cache de PostgREST (obligatorio tras DDL) ─────────────────────────────
-- Sin esto PostgREST no expone ni la vista nueva ni las columnas nuevas de las vistas viejas. La
-- falla es fail-safe y SILENCIOSA: el booking de hoy sigue funcionando y las categorías simplemente
-- nunca aparecen (modo de falla documentado en la 059). T-22-09.
NOTIFY pgrst, 'reload schema';
