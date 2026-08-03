-- 065 — snapshot de servicio en el historial + FK desacoplado + gate de borrado.
--
-- Contexto (motor-reservas / Phase 13 — HIST-01/02/03, v0.26):
--   Hoy el historial de un turno DEPENDE de que la fila de `services` siga viva: Finanzas suma
--   `services(price)` y la ficha del cliente muestra `services(name)` por join. Como consecuencia,
--   borrar un servicio es imposible (el FK cuenta filas, no estados: un turno de hace un año, o uno
--   cancelado, traba el DELETE igual) y, si se soltara el FK sin más, la historia clínica del
--   paciente se vaciaría. Esta migración corta ese acople de raíz.
--
-- Qué hace (idempotente — re-correr la migración es no-op):
--   1. Suma tres columnas de SNAPSHOT (D-01): `appointments.service_name`,
--      `appointments.service_price` y `abonos.service_name`. La historia pasa a ser AUTÓNOMA.
--   2. BACKFILLEA el snapshot de todo lo histórico desde el join actual (D-04), guardado por
--      `IS NULL` para no pisar nunca un snapshot ya escrito (violaría D-03).
--   3. Pasa `appointments_service_id_fkey` y `abonos_service_id_fkey` a la acción referencial
--      SET NULL (D-04, D-09). El FK se CONSERVA (no se dropea): es lo que mantiene vivo el embed
--      `services(...)` de PostgREST en todos los read-paths y la integridad del write-path.
--   4. Instala dos triggers BEFORE INSERT que escriben el snapshot solos (D-02): el write-path de la
--      app queda INTACTO — cero cambios en `createAppointmentCore` ni en sus cuatro consumidores
--      (booking público, alta manual, generación forward de abonos, canchas), que es exactamente
--      donde vive el riesgo de regresión de este workstream.
--   5. Instala el GATE de borrado como trigger BEFORE DELETE sobre `services` (D-08, D-09, D-10):
--      al soltar el FK se pierde el guard que hoy da Postgres, y un pre-check solo del lado del
--      cliente dejaría una ventana TOCTOU en la que un turno reservado en el medio queda huérfano
--      en silencio. El trigger corre DENTRO de la misma transacción del DELETE.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO toca `book_slot_atomic`, ni `lib/booking-core.ts`, ni ningún archivo de `app/` o `lib/`.
--     Todo el mecanismo del snapshot es de base (D-02).
--   - NO toca `professional_services_service_id_fkey` (CASCADE: la puente se limpia sola) ni
--     `professionals_service_id_fkey` (ya en SET NULL desde la migr. 043, mecanismo de canchas).
--     Los otros dos FKs a `services` quedan EXACTAMENTE como están.
--   - NO agrega, quita ni modifica ninguna policy RLS: las tres columnas son aditivas sobre tablas
--     que ya tienen RLS + policies por tenant, y los triggers escriben con privilegios del definer.
--   - NO refresca el snapshot nunca (D-03): es una FOTO inmutable, no un espejo. Un turno de marzo
--     conserva el nombre y el precio que el servicio tenía en marzo. Consecuencia buscada: editar
--     el precio de un servicio deja de reescribir la facturación histórica.
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado + 040..065 en orden. Prod se aplica A MANO coordinado con el
--     deploy, seguido del NOTIFY de recarga del schema cache de PostgREST (sección 7). La última
--     migración aplicada en prod = 064. Tras aplicar, regenerar `supabase/schema.sql` A MANO y de
--     forma quirúrgica — nunca con `db dump`, que reordena el archivo entero (decisión del repo
--     desde Phase 06).
--
-- Dos divergencias CONSCIENTES del molde de columna aditiva (055/061/062):
--   (a) Las tres columnas van NULLABLE y SIN DEFAULT, en vez de `NOT NULL DEFAULT`. Motivo:
--       `service_id` es nullable en las dos tablas (canchas derivan el service server-side; un abono
--       puede no tener servicio), así que hay filas legítimas SIN servicio del cual sacar snapshot.
--       Un `DEFAULT ''` mentiría: el read-path usa `COALESCE(snapshot, services.…)` (D-05) y un
--       string vacío NO es NULL, así que ganaría el COALESCE y rompería el fallback al join.
--   (b) Se antepone un `DROP TRIGGER ... IF EXISTS` a cada `CREATE TRIGGER` (la 042 no lo hace). Sin eso,
--       re-correr la migración fallaría con 42710 (trigger duplicado) y dejaría de ser no-op.

-- ── 1. Columnas de snapshot: la historia deja de depender de `services` (D-01) ────────────────────
-- Nombres cortos, snake_case, y elegidos para NO colisionar con el embed `services(...)` que
-- PostgREST expone bajo la clave `services` en los read-paths existentes.
ALTER TABLE "public"."appointments"
  ADD COLUMN IF NOT EXISTS "service_name" "text";

ALTER TABLE "public"."appointments"
  ADD COLUMN IF NOT EXISTS "service_price" numeric(10,2);

-- Los abonos archivados (cancelled/completed) dejan de bloquear el borrado (D-09), así que su
-- detalle también necesita sobrevivir al servicio. Solo el NOMBRE: el precio de una serie no se
-- lee del servicio (`abonos.deposit_amount` es su propio dato).
ALTER TABLE "public"."abonos"
  ADD COLUMN IF NOT EXISTS "service_name" "text";

-- ── 2. Backfill de lo histórico (D-04) ───────────────────────────────────────────────────────────
-- Va ANTES de cambiar el FK y de instalar los triggers: cuando el DELETE de un servicio empiece a
-- poner `service_id` en NULL, las filas viejas ya tienen que tener su snapshot escrito, o la historia
-- se vacía igual. Molde de orden: 055 (normalizar primero, validar después).
--
-- El guard `IS NULL` es lo que vuelve el backfill RE-CORRIBLE: en una segunda pasada no toca ninguna
-- fila que ya tenga snapshot, porque sobrescribirlo violaría D-03 (foto inmutable).
--
-- `OR a.business_id IS NULL` — `appointments.business_id` es nullable en el esquema; sin esa rama
-- perderíamos el snapshot de las filas legacy sin tenant. Para las que SÍ lo tienen, el filtro
-- `s.business_id = a.business_id` sigue siendo explícito (defensa en profundidad del aislamiento).
--
-- LÍMITE CONOCIDO Y ACEPTADO (D-04): el precio backfilleado es el VIGENTE HOY, no el que el turno
-- tuvo realmente. El precio histórico real ya se perdió y no es reconstruible con los datos actuales.
-- No es un bug a resolver: es el costo de arrancar el snapshot tarde.
UPDATE "public"."appointments" a
   SET "service_name"  = s."name",
       "service_price" = s."price"
  FROM "public"."services" s
 WHERE s."id" = a."service_id"
   AND (a."business_id" IS NULL OR s."business_id" = a."business_id")
   AND (a."service_name" IS NULL OR a."service_price" IS NULL);

UPDATE "public"."abonos" ab
   SET "service_name" = s."name"
  FROM "public"."services" s
 WHERE s."id" = ab."service_id"
   AND (ab."business_id" IS NULL OR s."business_id" = ab."business_id")
   AND ab."service_name" IS NULL;

-- ── 3. FKs de `service_id`: desacople referencial (D-04, D-09) ────────────────────────────────────
-- `appointments_service_id_fkey` hoy no declara acción (NO ACTION ⇒ el DELETE del servicio se
-- rechaza) y `abonos_service_id_fkey` está en RESTRICT (una serie dada de baja hace meses traba el
-- borrado). Los dos pasan a poner `service_id` en NULL cuando el servicio se borra.
--
-- Se CONSERVA el FK en vez de dropearlo y dejar un UUID huérfano: perder la integridad referencial
-- del write-path vivo iría en contra de la disciplina anti-tampering del proyecto, y además el embed
-- `services(...)` de PostgREST (que es el fallback de D-05 en TODOS los read-paths) existe
-- precisamente porque hay un FK declarado.
--
-- Idempotencia: DROP ... IF EXISTS + re-creación guardada por `pg_constraint` (molde 061).
ALTER TABLE "public"."appointments"
  DROP CONSTRAINT IF EXISTS "appointments_service_id_fkey";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'appointments_service_id_fkey'
       AND "conrelid" = '"public"."appointments"'::"regclass"
  ) THEN
    ALTER TABLE "public"."appointments"
      ADD CONSTRAINT "appointments_service_id_fkey"
      FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;
  END IF;
END
$$;

ALTER TABLE "public"."abonos"
  DROP CONSTRAINT IF EXISTS "abonos_service_id_fkey";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'abonos_service_id_fkey'
       AND "conrelid" = '"public"."abonos"'::"regclass"
  ) THEN
    ALTER TABLE "public"."abonos"
      ADD CONSTRAINT "abonos_service_id_fkey"
      FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;
  END IF;
END
$$;

-- ── 4. Snapshot automático en `appointments` (D-02, D-03) ────────────────────────────────────────
-- BEFORE INSERT: el snapshot se escribe SOLO, sin que ningún caller lo pida. Cubre los cuatro
-- consumidores del RPC de una sola vez y también cualquier insert que NO pase por el core (seeds,
-- callers futuros, alta desde el SQL editor).
CREATE OR REPLACE FUNCTION "public"."appointments_service_snapshot"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- El filtro `s.business_id = NEW.business_id` es OBLIGATORIO, no decorativo: dentro de una función
  -- SECURITY DEFINER la RLS NO aplica, así que un `service_id` de OTRO tenant mandado por PostgREST
  -- resolvería sin problema y filtraría el nombre y el precio de un negocio ajeno (T-13-01).
  --
  -- Se SOBRESCRIBE SIEMPRE (no "solo si viene NULL"): el snapshot no puede ser dictado por el
  -- cliente. Si respetáramos el valor entrante, un dueño podría insertar por PostgREST con
  -- `service_price` inventado e inflar su propia facturación histórica (T-13-02).
  --
  -- Sin match (service_id NULL, business_id NULL, o servicio de otro tenant) `SELECT ... INTO` deja
  -- los targets en NULL — comportamiento documentado de plpgsql. Eso es FAIL-SAFE a propósito: el
  -- historial cae al fallback por join (D-05), que es exactamente el comportamiento actual. NO se
  -- hace RAISE: un turno de cancha (service derivado) o una fila legacy no deben poder romper un alta.
  SELECT s."name", s."price"
    INTO NEW."service_name", NEW."service_price"
    FROM services s
   WHERE s."id" = NEW."service_id"
     AND s."business_id" = NEW."business_id";

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."appointments_service_snapshot"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "appointments_service_snapshot_trg" ON "public"."appointments";

CREATE TRIGGER "appointments_service_snapshot_trg"
  BEFORE INSERT ON "public"."appointments"
  FOR EACH ROW EXECUTE FUNCTION "public"."appointments_service_snapshot"();

-- ── 5. Snapshot automático en `abonos` (D-09) ────────────────────────────────────────────────────
-- Mismo patrón y mismas reglas de aislamiento que la sección 4. Solo copia el nombre.
CREATE OR REPLACE FUNCTION "public"."abonos_service_snapshot"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Filtro por `business_id` obligatorio (SECURITY DEFINER ⇒ sin RLS), sobrescritura incondicional
  -- (el cliente no dicta el snapshot) y NULL fail-safe cuando no hay servicio: idéntico razonamiento
  -- que `appointments_service_snapshot()`.
  SELECT s."name"
    INTO NEW."service_name"
    FROM services s
   WHERE s."id" = NEW."service_id"
     AND s."business_id" = NEW."business_id";

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."abonos_service_snapshot"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "abonos_service_snapshot_trg" ON "public"."abonos";

CREATE TRIGGER "abonos_service_snapshot_trg"
  BEFORE INSERT ON "public"."abonos"
  FOR EACH ROW EXECUTE FUNCTION "public"."abonos_service_snapshot"();

-- ── 6. Gate de borrado de servicio (D-08, D-09, D-10) ────────────────────────────────────────────
-- El guard vive en la BASE, no en el cliente: el DELETE sale de `settings-client` con la sesión del
-- dueño + RLS (como el resto del CRUD de Ajustes), y el trigger corre dentro de la MISMA transacción
-- del DELETE. Eso cierra la ventana TOCTOU: si alguien reserva entre el pre-check del modal y el
-- DELETE, el RAISE aborta la transacción ANTES de que la acción referencial ponga ningún
-- `service_id` en NULL (T-13-05). El pre-check del modal (13-03) es UX, esto es la garantía.
CREATE OR REPLACE FUNCTION "public"."services_block_delete"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- "Hoy" en hora de Argentina (UTC-3 sin DST), no en UTC: a las 22:00 de Buenos Aires el `now()`
  -- en UTC ya es el día siguiente y un turno de mañana temprano dejaría de contarse como futuro.
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  -- 6.1 GUARD DE CASCADA (crítico). En un `DELETE FROM businesses` la fila padre se borra ANTES de
  -- que corran las acciones referenciales hacia `services`, así que la AUSENCIA del negocio
  -- identifica de forma confiable un borrado en cascada (y no un borrado de servicio del dueño).
  -- Sin este guard, cerrar la cuenta de un negocio con turnos futuros sería literalmente imposible,
  -- y `teardownOneTenant` (test/helpers/booking-fixtures.ts) rompería toda la suite de integración
  -- porque su cleanup borra `businesses` y cascadea a `services` (T-13-07).
  IF OLD."business_id" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b."id" = OLD."business_id") THEN
    RETURN OLD;
  END IF;

  -- 6.2 Turnos futuros TODAVÍA PENDIENTES (D-08). "Futuro" = `date >= hoy` en hora AR. Dos estados
  -- quedan FUERA del conteo porque ya no son una reserva pendiente:
  --   - `cancelled`: contarlo reproduciría exactamente la confusión que esta fase viene a arreglar
  --     (el dueño cancela todo, ve la lista vacía, y el borrado sigue trabado).
  --   - `completed`: el turno YA SE PRESTÓ. Es historia, no una reserva a futuro. Un turno de hoy
  --     marcado como completado trabando el borrado es el mismo bug con otra cara (gap UAT #2).
  -- Los demás estados (`pending`, `pending_payment`, `confirmed`) SÍ bloquean: son compromisos vivos.
  --
  -- La rama `a."status" IS NULL` es OBLIGATORIA y NO es defensiva de más: `appointments.status` es
  -- NULLABLE, y `NOT IN (...)` sobre NULL evalúa a NULL (ni true ni false), así que esas filas
  -- quedarían fuera del EXISTS y ABRIRÍAN el gate. Un turno sin estado sigue siendo un turno
  -- reservado, así que se cuenta explícitamente. Por el mismo motivo el pre-check del modal (13-03)
  -- no puede usar un `.in('status', [...])` de PostgREST: `.in(...)` también descarta los NULL.
  --
  -- El predicado se ancla en `a.service_id = OLD.id` (UUID PK global, no adivinable) y suma el filtro
  -- explícito por tenant. `OLD.business_id IS NULL` cubre las filas legacy de `services` sin negocio,
  -- para las que el conteo cae en fail-closed (cuenta todo) en vez de abrir el borrado (T-13-04).
  IF EXISTS (
    SELECT 1
      FROM appointments a
     WHERE a."service_id" = OLD."id"
       AND (OLD."business_id" IS NULL OR a."business_id" = OLD."business_id")
       AND a."date" >= v_today
       AND (a."status" IS NULL OR a."status" NOT IN ('cancelled', 'completed'))
  ) THEN
    -- Message = código de dominio FIJO, sin nombres, fechas ni conteos: el texto del RAISE llega al
    -- cliente y no debe filtrar datos del negocio (T-13-09). El modal (13-03) lo mapea a su copy.
    RAISE EXCEPTION 'service_has_future_appointments' USING ERRCODE = 'P0001';
  END IF;

  -- 6.3 Abono ACTIVO (D-09). Un abono activo genera turnos hacia adelante: cuenta como turnos
  -- futuros y dispara el mismo modal. Los archivados (cancelled/completed) ya NO bloquean — su FK
  -- pasó a SET NULL en la sección 3 y su nombre sobrevive por el snapshot de la sección 5.
  --
  -- Message DISTINTO sobre el mismo ERRCODE P0001 a propósito: es lo que le permite al modal decir
  -- "y un abono activo" en vez de un genérico (D-13).
  IF EXISTS (
    SELECT 1
      FROM abonos ab
     WHERE ab."service_id" = OLD."id"
       AND (OLD."business_id" IS NULL OR ab."business_id" = OLD."business_id")
       AND ab."status" = 'active'
  ) THEN
    RAISE EXCEPTION 'service_has_active_abono' USING ERRCODE = 'P0001';
  END IF;

  -- 6.4 `RETURN OLD` es OBLIGATORIO. Devolver NULL desde un trigger BEFORE DELETE CANCELA el borrado
  -- SIN error: PostgREST respondería 204, el cliente filtraría la lista y la UI diría "eliminado"
  -- sin haber borrado nada (T-13-06). El único camino de rechazo válido acá es el RAISE.
  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."services_block_delete"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "services_block_delete_trg" ON "public"."services";

CREATE TRIGGER "services_block_delete_trg"
  BEFORE DELETE ON "public"."services"
  FOR EACH ROW EXECUTE FUNCTION "public"."services_block_delete"();

-- ── 7. Recargar el schema cache de PostgREST (obligatorio tras DDL) ──────────────────────────────
NOTIFY pgrst, 'reload schema';
