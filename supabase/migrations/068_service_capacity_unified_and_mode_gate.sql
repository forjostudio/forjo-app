-- 068 — Cupo unificado por servicio: enum de TRES modos con 'individual' como DEFAULT, `services.capacity`
-- como fuente única del número, y gate de cambio de modo (motor-reservas / Phase 15 — CUPO-06/07/08, v0.27).
--
-- Contexto (motor-reservas / Phase 15 — CUPO-06/07/08, v0.27):
--   Hoy el cupo vive en DOS lugares y el modo "individual" NO se puede declarar: se deduce de
--   `time_blocks.capacity = 1`, una columna que está en OTRA tabla y que no sabe a qué servicio
--   corresponde. Ese modelo produce el defecto que abrió la fase — un corte de pelo etiquetado
--   "Clase grupal" — y deja dos representaciones del MISMO estado (un `group_class` de cupo 1 es
--   indistinguible de un individual: mismo `is_group = false`, mismo EXCLUDE).
--
--   D-01 (cutover, SIN fallback transicional): `services.capacity` es la única fuente del número
--   desde el día 1. `time_blocks.capacity` deja de decidir. NO se escribe regla de precedencia en el
--   RPC y NO queda deprecación pendiente — se elige el cutover justamente porque no hay nada que
--   migrar en el camino.
--
--   D-02 (medido contra PRODUCCIÓN el 2026-08-11, no estimado):
--     select count(*), count(*) filter (where capacity is null), max(capacity) from time_blocks;
--     -- → 19 bloques · 0 sin capacity · cupo máximo 1
--   Ningún negocio usa cupo por bloque ⇒ el cutover no afecta a nadie, y por eso NO se construye
--   aviso de re-declaración para el dueño: no hay nada que re-declarar.
--
-- Qué hace (numerado en el ORDEN en que corren las sentencias — el orden de D-05):
--   1. DROPEA el CHECK del enum de DOS valores (`services_capacity_mode_chk`, migr. 062).
--   2. BACKFILL: los servicios `group_class` con cupo <= 1 pasan a `individual` (D-04).
--   3. RE-CREA `services_capacity_mode_chk` con el enum de TRES valores.
--   4. AGREGA el CHECK de coherencia modo↔cupo (D-06).
--   5. `ALTER COLUMN capacity_mode SET DEFAULT 'individual'`.
--   6. Gate de cambio de modo: función + trigger que rechazan mover `capacity_mode` cuando el
--      servicio tiene turnos futuros VIVOS (CUPO-08, cierra el riesgo residual R-1 de la Phase 12).
--
-- ⚠ POR QUÉ ESTE ORDEN Y NO OTRO (D-05) ───────────────────────────────────────────────────────────
--   El CHECK de coherencia del paso 4 exige `group_class ⇒ capacity >= 2`. Las 9 filas de PRODUCCIÓN
--   son HOY `group_class` con `capacity = 1`, o sea que VIOLAN ese CHECK. `ALTER TABLE ... ADD
--   CONSTRAINT` valida las filas existentes al crearse: si el paso 4 corriera ANTES del UPDATE del
--   paso 2, la migración ABORTARÍA ENTERA y no quedaría nada aplicado.
--   Es exactamente el mismo razonamiento (y los mismos encabezados de sección) que la migr. 055:
--   normalizar PRIMERO los valores que el CHECK nuevo no admitiría, validar DESPUÉS.
--
-- ── CAMBIO DE COMPORTAMIENTO QUE HAY QUE DECIDIR ANTES DE APLICAR ────────────────────────────────
--
--   A partir de esta migración un `group_class` con cupo 1 es ILEGAL en la base (23514). Es
--   INTENCIONAL: con cupo 1 era indistinguible de un `individual` — mismo `is_group = false`, mismo
--   tratamiento bajo el EXCLUDE gist 013 — y dos representaciones del mismo estado son exactamente la
--   ambigüedad que esta fase viene a eliminar. Lo mismo para `simultaneous_resource` con cupo 1.
--
--   Consecuencia declarada para quien toque el panel: al pasar un servicio de `individual` a un modo
--   grupal o simultáneo hay que SUBIR EL CUPO A 2 en el mismo UPDATE, o la escritura rebota contra el
--   constraint. El editor de servicios de hoy fuerza `capacity = 1` para todo lo que no sea
--   simultáneo, así que sin ese ajuste elegir "Clase grupal" deja de funcionar (es el guard mínimo de
--   D-10, que entra en esta misma fase).
--
--   Lo que NO cambia: ningún servicio de producción cambia de COMPORTAMIENTO. Los 9 pasan de
--   `group_class`/1 a `individual`/1, que es cupo 1 en los dos casos.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO edita la 067: ya está APLICADA EN PRODUCCIÓN (2026-08-11). Una migración aplicada NO se
--     modifica en el lugar; todo cambio posterior es una migración NUEVA numerada.
--   - NO dropea `time_blocks.capacity`. La columna se CONSERVA: deja de decidir el cupo, pero
--     borrarla sería una migración destructiva sin beneficio en este ciclo (queda diferido).
--   - NO toca ninguna policy RLS, ni el índice único 011, ni el EXCLUDE gist 013 de `appointments`,
--     ni el EXCLUDE de `appointment_spaces`. El aislamiento por tenant no se afloja ni se apoya en
--     nada de acá: sigue siendo RLS + filtro explícito por business_id.
--   - NO cambia la firma de `book_slot_atomic` ni ninguna vista pública.
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado + 040..068 en orden. Prod se aplica A MANO coordinado con el
--     deploy + `NOTIFY pgrst, 'reload schema';`. La última migración aplicada en prod = 067. Tras
--     aplicar, espejar `supabase/schema.sql` A MANO y de forma quirúrgica — nunca con `db dump`, que
--     reordena el archivo entero (decisión del repo desde la Phase 06).
--
-- Divergencias conscientes del molde (dos, y las dos quedan escritas a propósito):
--   (a) El paso 5 (`ALTER COLUMN ... SET DEFAULT`) es la PRIMERA vez que el repo hace un
--       `ALTER COLUMN` en una migración numerada fuera del baseline: todos los defaults existentes se
--       declaran en el `ADD COLUMN ... NOT NULL DEFAULT` (062:49-53) o vienen del baseline. Se hace
--       igual porque el DEFAULT viejo ('group_class') pasa a ser el modo MENOS común y dejarlo
--       obligaría a cada INSERT a declarar el modo para no nacer mintiendo.
--   (b) Los dos CHECK se agregan validando las filas existentes de una sola vez, en un solo paso,
--       como los cinco constraints que el repo ya agregó fuera del baseline (041, 042, 055, 061,
--       062, 065). El repo NO tiene un solo precedente del agregado en dos pasos (crear el constraint
--       sin chequear las filas viejas y confirmarlo después), y con 9 filas en prod el volumen no
--       justifica introducir un patrón nuevo acá.
--
-- ── PRE-FLIGHT OBLIGATORIO ANTES DE APLICAR EN PROD (runbook) ────────────────────────────────────
--
--   (i)  select count(*), count(*) filter (where capacity is null), max(capacity) from time_blocks;
--        CRITERIO DE ABORTO: si `max(capacity) > 1` ⇒ NO APLICAR. Significa que existe un negocio
--        cuyo cupo grupal vive en el BLOQUE de agenda, y esta migración se lo bajaría de hecho a 1
--        (el motor pasa a leer `services.capacity`, que en ese negocio está en 1). Ese caso pide
--        primero re-declarar el cupo en el servicio, y recién después aplicar.
--
--   (ii) select capacity_mode, capacity, count(*) from services group by 1,2 order by 3 desc;
--        Si aparece un `group_class` con cupo >= 2, el backfill NO lo toca (así está escrito el
--        predicado, a propósito), pero hay que REGISTRARLO: es un servicio que ya declaraba cupo
--        grupal de verdad y a partir de acá pasa a contarlo desde `services.capacity`.
--
--   POR QUÉ LOS CONTROLES SE ESCRIBEN ASÍ Y NO CON `where capacity > 1`:
--   una query que devuelve 0 filas es INDISTINGUIBLE de una que no midió lo que creías (tabla vacía,
--   columna mal nombrada, filtro de más). "Success, no rows" no prueba nada. Los dos controles de
--   arriba devuelven NÚMEROS distintos de cero y por eso sí prueban algo. Misma trampa que la
--   Phase 14 ya registró con los DELETE que salen "Success" sin que el trigger llegue a correr.

-- ── 1. Sacar PRIMERO el CHECK del enum viejo (de 2 valores, migr. 062) ───────────────────────────
-- Suelto y con IF EXISTS (molde 065:110-111): el `IF EXISTS` es lo que hace re-corrible el archivo
-- entero — en una segunda pasada el constraint ya fue reemplazado y el DROP es no-op.
-- Va antes del backfill porque el UPDATE del paso 2 escribe 'individual', un valor que el enum viejo
-- NO admite.
ALTER TABLE "public"."services"
  DROP CONSTRAINT IF EXISTS "services_capacity_mode_chk";

-- ── 2. Normalizar PRIMERO los valores que el CHECK nuevo no admitiría (si no, no se puede crear) ──
-- Backfill de D-04: los servicios que hoy dicen "clase grupal" pero tienen cupo 1 pasan a declararse
-- 'individual'.
--
-- (a) POR PREDICADO, NUNCA POR LISTA DE IDS. Si entre la escritura de esta migración y su aplicación
--     alguien declarara un grupal REAL (cupo >= 2), ese servicio queda como está y no se pisa. Una
--     lista de ids congelada el día que se escribió el archivo no tendría esa propiedad.
-- (b) EL CAMBIO ES BYTE-IDÉNTICO EN COMPORTAMIENTO: cupo 1 en los dos casos ⇒ `is_group = false` en
--     los dos ⇒ mismo conteo y mismo tratamiento bajo el EXCLUDE 013. Lo único que corrige es el
--     ETIQUETADO FALSO, que es el defecto que abrió la fase.
-- (c) ES RE-CORRIBLE: una segunda pasada matchea 0 filas, porque después de la primera ya ninguna
--     fila cumple `capacity_mode = 'group_class' AND capacity <= 1`.
--
-- Por qué es seguro tocar estas filas: HOY la rama grupal del RPC NO LEE `services.capacity` — lee
-- `COALESCE(MAX(tb.capacity), 1)` del bloque de agenda. O sea que `services.capacity` en un servicio
-- grupal es un VALOR MUERTO, y los datos de producción lo confirman (los 9 están en 1). No se está
-- reinterpretando un número que alguien haya elegido: se está nombrando bien un estado que ya existía.
UPDATE "public"."services"
   SET "capacity_mode" = 'individual'
 WHERE "capacity_mode" = 'group_class'
   AND "capacity" <= 1;

-- ── 3. DESPUÉS el CHECK del enum, ahora de TRES valores. Idempotente (molde 055/061/062) ─────────
-- Mismo NOMBRE que el constraint de la 062 a propósito: es el mismo invariante, ampliado. El guard
-- por `pg_constraint` hace que re-correr la migración sea no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'services_capacity_mode_chk'
       AND "conrelid" = '"public"."services"'::"regclass"
  ) THEN
    ALTER TABLE "public"."services"
      ADD CONSTRAINT "services_capacity_mode_chk"
      CHECK ("capacity_mode" IN ('individual', 'group_class', 'simultaneous_resource'));
  END IF;
END
$$;

-- ── 4. CHECK de coherencia modo↔cupo (D-06). Mismo molde idempotente ─────────────────────────────
--   individual            ⇒ capacity = 1
--   group_class           ⇒ capacity >= 2
--   simultaneous_resource ⇒ capacity >= 2
--
-- Se escribe como una DISYUNCIÓN de dos ramas (individual / los otros dos modos) en vez de tres
-- ramas, porque los dos modos no-individuales comparten exactamente la misma condición sobre el cupo.
--
-- NO hay rama para NULL y NO hace falta agregarla: `capacity` es `smallint NOT NULL DEFAULT 1`
-- (migr. 062) y `capacity_mode` es `text NOT NULL`. Queda dicho acá para que nadie la sume después
-- "por las dudas": una rama `IS NULL` en un CHECK sobre columnas NOT NULL es código muerto que
-- confunde al que lea el constraint buscando por qué se permitiría un NULL.
--
-- LA CONSECUENCIA REAL DE ESTE CONSTRAINT, y el motivo por el que existe:
--   `is_group ⟺ capacity_mode <> 'individual'`
-- porque individual ⇒ cupo 1 ⇒ is_group false, y los otros dos modos ⇒ cupo >= 2 ⇒ is_group true.
-- Eso es lo que vuelve SUFICIENTE al gate de la sección 6: si el único cambio que puede voltear
-- `is_group` es el cambio de MODO, entonces gatear el cambio de modo gatea TODO el drift posible de
-- `is_group`. Un cambio de solo `capacity` (de 2 a 5) nunca lo puede voltear.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'services_capacity_matches_mode_chk'
       AND "conrelid" = '"public"."services"'::"regclass"
  ) THEN
    ALTER TABLE "public"."services"
      ADD CONSTRAINT "services_capacity_matches_mode_chk"
      CHECK (
        ("capacity_mode" = 'individual' AND "capacity" = 1)
        OR ("capacity_mode" IN ('group_class', 'simultaneous_resource') AND "capacity" >= 2)
      );
  END IF;
END
$$;

-- ── 5. DEFAULT del modo: un servicio nuevo nace 'individual' ─────────────────────────────────────
-- DIVERGENCIA CONSCIENTE (a) del header: es el primer `ALTER COLUMN` del repo en una migración
-- numerada fuera del baseline. Motivo: el 100 % de los servicios reales de producción son cupo 1, o
-- sea individuales, así que el DEFAULT viejo ('group_class', migr. 062) hacía nacer a todos con una
-- etiqueta que no les corresponde. Con este DEFAULT, un INSERT que no declara el modo (el seed, un
-- alta desde el SQL editor, un caller futuro) queda coherente con el CHECK del paso 4 sin tener que
-- saber nada de cupos.
ALTER TABLE "public"."services"
  ALTER COLUMN "capacity_mode" SET DEFAULT 'individual';

-- ── 6. Gate de cambio de modo (CUPO-08 — cierra el riesgo residual R-1 de la Phase 12) ───────────
--
-- QUÉ INVARIANTE CIERRA. Hoy cambiar `capacity_mode` con turnos ya creados deja las filas viejas con
-- el `is_group` del momento del INSERT. En el sentido `simultaneous_resource → group_class` esas filas
-- quedan `is_group = true`, o sea FUERA del EXCLUDE gist 013 (`041:76`, `AND NOT is_group`) Y ADEMÁS
-- fuera del gate espejo de la 064, que exige que el servicio esté HOY en `simultaneous_resource`
-- (`064:420-425`). Resultado: solapes PERMANENTES que ningún gate vuelve a detectar. Es el residual de
-- integridad más serio que dejó abierto la Phase 12 (R-1 de 12-SECURITY.md), reconocido como fuera de
-- alcance en `064:72-74`.
--
-- El gate bloquea CUALQUIER transición de modo, no solo las que voltean `is_group`: pasar de
-- `group_class` a `simultaneous_resource` también cambia QUÉ GATE cubre a las filas ya insertadas
-- (eje de conteo por hora exacta ⇄ por solape), así que el criterio no puede ser "solo si cambia
-- is_group".
--
-- POR QUÉ BLOQUEA EN VEZ DE REPARAR (D-03). Reparar las filas existentes (recalcular `is_group` y
-- reescribirlas) puede toparse con turnos que YA se solapan de una forma que pasa a ser ilegal, y ahí
-- el EXCLUDE aborta la transacción igual: el dueño se queda con un error peor y sin salida clara. La
-- salida legítima y documentada es cancelar o esperar los turnos futuros — cuando no queda ninguno, el
-- cambio de modo pasa solo, sin intervención.
--
-- POR QUÉ UN TRIGGER `BEFORE UPDATE` ACÁ SÍ (y en la 067 NO). El review de la 067 propuso un
-- BEFORE UPDATE que habría roto TODAS las bajas de abono en producción, así que la forma se eligió
-- recién DESPUÉS de trazar el write-path real de `services`:
--   - `saveEditService` (settings-client.tsx:690-709) manda SIEMPRE `capacity_mode` en el payload,
--     incluso cuando el dueño no lo tocó ⇒ el trigger dispara, y el guard interno de no-cambio lo
--     deja pasar sin mirar turnos.
--   - `toggleService` (:656, activar/desactivar), `setServiceLocations` (:665, sedes) y
--     `updateCancha` / `setCanchaActive` (lib/canchas.ts:283, :308) NO mandan `capacity_mode` ⇒ el
--     trigger ni siquiera dispara.
--   - `addService` (:617) es un INSERT ⇒ fuera del alcance de un trigger de UPDATE.
--   - Los `afterEach` de la suite y `seedSimultaneousService` sí cambian el modo, pero borran los
--     `appointments` del tenant antes (o los siembran después) ⇒ no hay turnos futuros vivos en el
--     momento del cambio.
-- O sea: ninguna escritura legítima conocida queda bloqueada.
CREATE OR REPLACE FUNCTION "public"."services_block_mode_change"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- "Hoy" en hora de Argentina (UTC-3 sin DST), no en UTC: a las 22:00 de Buenos Aires el `now()` en
  -- UTC ya es el día siguiente y un turno de mañana temprano dejaría de contarse como futuro. Mismo
  -- criterio que `services_block_delete` (migr. 065) y `abonos_block_delete` (migr. 067).
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  -- 6.1 GUARD DE NO-CAMBIO, PRIMERO. Éste es el guard REAL del gate: el `UPDATE OF` declarado en el
  -- trigger es solo una optimización que evita disparar cuando la columna ni siquiera viene en el SET.
  -- Postgres dispara igual cuando la columna VIENE en el SET con el mismo valor que ya tenía, que es
  -- exactamente lo que hace `saveEditService` en cada guardado. Sin este guard, renombrar un servicio
  -- con turnos futuros rebotaría.
  IF NEW."capacity_mode" IS NOT DISTINCT FROM OLD."capacity_mode" THEN
    RETURN NEW;
  END IF;

  -- 6.2 ACÁ NO VA EL GUARD DE CASCADA que sí llevan la 065 y la 067, y no es un olvido:
  -- `services_business_id_fkey` es `ON DELETE CASCADE`, así que cerrar la cuenta de un negocio BORRA
  -- la fila de `services` — nunca la actualiza. Una cascada jamás llega a un BEFORE UPDATE. Queda
  -- escrito para que nadie agregue código muerto "por simetría" con los otros dos gates.

  -- 6.3 Turnos futuros VIVOS del servicio, con los mismos criterios que `services_block_delete` (065).
  --
  -- Anclado en `a.service_id = OLD.id` (UUID PK, no adivinable). El filtro por tenant es EXPLÍCITO y
  -- obligatorio: dentro de una función SECURITY DEFINER la RLS NO aplica, así que sin él la query
  -- cruzaría negocios. La rama `OLD.business_id IS NULL` es necesaria porque `services.business_id` es
  -- NULLABLE (filas legacy) — es la misma forma que usa el gate hermano de la 065.
  --
  -- "Futuro" = `date >= hoy AR`, INCLUSIVE. "Vivo" = cualquier estado que no sea `cancelled` (ya se
  -- anuló) ni `completed` (ya se prestó: es historia, no un compromiso por delante).
  --
  -- La rama de estado NULO es OBLIGATORIA y no es defensiva de más: `appointments.status` es NULLABLE
  -- y `NOT IN (...)` sobre NULL evalúa a NULL — ni true ni false —, así que esas filas quedarían fuera
  -- del EXISTS y ABRIRÍAN el gate. Un turno sin estado sigue siendo un turno reservado. El repo ya
  -- pagó esta trampa dos veces (migr. 065 y el read-path de 13-01).
  IF EXISTS (
    SELECT 1
      FROM appointments a
     WHERE a."service_id" = OLD."id"
       AND (OLD."business_id" IS NULL OR a."business_id" = OLD."business_id")
       AND a."date" >= v_today
       AND (a."status" IS NULL OR a."status" NOT IN ('cancelled', 'completed'))
  ) THEN
    -- Message = código de dominio FIJO y NUEVO, sin nombres de cliente, sin fechas y sin conteos: el
    -- texto viaja hasta el navegador y no puede filtrar datos del negocio (T-14-14 / lección T-13-09).
    -- El panel lo mapea a copy propia leyendo `code = 'P0001'` + `message.includes(...)`, igual que ya
    -- hace con los dos códigos de la 065. Convivencia verificada: ninguno de esos dos
    -- (`service_has_future_appointments`, `service_has_active_abono`) es substring de éste ni al revés,
    -- así que el `includes` del panel no los puede confundir.
    RAISE EXCEPTION 'service_mode_has_future_appointments' USING ERRCODE = 'P0001';
  END IF;

  -- 6.4 Devolver la fila nueva es OBLIGATORIO, y es el espejo exacto del RETURN OLD de la 067:
  -- devolver NULL desde un trigger BEFORE UPDATE cancela la escritura SIN error — PostgREST
  -- respondería 204, el panel diría "Servicio actualizado" y no se habría actualizado nada (T-14-16).
  -- El único camino de rechazo válido es el RAISE de arriba.
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."services_block_mode_change"() OWNER TO "postgres";

-- Idempotencia: el DROP previo es lo que hace re-corrible el archivo entero (sin él, una segunda
-- pasada fallaría con 42710). Mismo molde que la 065, la 066 y la 067.
DROP TRIGGER IF EXISTS "services_block_mode_change_trg" ON "public"."services";

CREATE TRIGGER "services_block_mode_change_trg"
  BEFORE UPDATE OF "capacity_mode" ON "public"."services"
  FOR EACH ROW EXECUTE FUNCTION "public"."services_block_mode_change"();

-- ── Recargar el schema cache de PostgREST (obligatorio tras DDL) ─────────────────────────────────
NOTIFY pgrst, 'reload schema';
