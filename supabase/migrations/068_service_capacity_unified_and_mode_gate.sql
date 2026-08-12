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

-- ── 7. Redefinición de book_slot_atomic: el cupo sale de services.capacity en los TRES modos ─────
--
-- (CUPO-07) Es el corazón de la fase y su punto de mayor riesgo. El cuerpo arranca del de la migr.
-- 064 —la ÚLTIMA redefinición de esta función, o sea el estado VIGENTE— y aplica CUATRO cambios
-- encima. Igual que la 064 hizo con la 063: la 064 ya está APLICADA A MANO EN PRODUCCIÓN ⇒ es
-- historia inmutable y NO se edita. Es `CREATE OR REPLACE` PURO, SIN dropear la función: cambiar los
-- params o el RETURNS obliga a recrear la función y rompería los CUATRO callers que entran por
-- `createAppointmentCore` (booking público, alta manual del panel, generación forward de abonos y
-- canchas).
--
-- ── INVENTARIO DE LO QUE QUEDA BYTE-IDÉNTICO (declarado a propósito, es el patrón de cada
--    redefinición de esta función: cambio quirúrgico + inventario de lo que NO se tocó) ───────────
--   · la FIRMA: los 14 params + `RETURNS TABLE (id, cancel_token)`, y
--     `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`;
--   · el ÚNICO advisory lock de NEGOCIO-DÍA (064, CR2-01) y el orden global respecto de los locks
--     por espacio (ascendentes) ⇒ EL EJE DE SERIALIZACIÓN NO SE TOCA en esta migración;
--   · la selección del profesional "cualquiera" (058) y el recomputo del bucket;
--   · el bloque de espacio (042): resolución del set de espacios, locks ascendentes y el EXISTS
--     cross-agenda;
--   · el rechazo `simultaneous_space_conflict` (064, gap 3);
--   · TODA la rama simultánea: gate de exclusión por agenda, count por solape, asignación de asiento
--     y la derivación de `is_group` desde el cupo del servicio (que ya era el modelo nuevo);
--   · el ALCANCE del gate espejo de la rama grupal (D-07: se reescribe su JUSTIFICACIÓN, nunca su
--     predicado) y el `INSERT ... RETURNING`.
--
-- ── LOS CUATRO CAMBIOS ─────────────────────────────────────────────────────────────────────────
--   (1) El fail-safe del modo pasa de 'group_class' a 'individual' — estrictamente MÁS fail-closed
--       (ver el paso 0).
--   (2) La rama no simultánea deja de consultar el BLOQUE de agenda: el cupo lo pone el servicio.
--   (3) Se reencuadra el encabezado de esa rama (cubre `individual` + `group_class`) con el CAMBIO
--       DE RÉGIMEN frente al EXCLUDE gist 013 ESCRITO, no inferido.
--   (4) Se reescribe el comentario del gate espejo, cuya premisa muere en esta fase (D-07).
--
-- ── EL CAMBIO DE RÉGIMEN: LO ÚNICO QUE HAY QUE ENTENDER ANTES DE TOCAR ESTO ────────────────────
--   `is_group` hace DOBLE TRABAJO: significa a la vez "cupo > 1, varias filas comparten el slot" Y
--   "exenta del EXCLUDE gist 013" (041: `... AND NOT is_group`). Esa ambigüedad es la causa raíz que
--   la 064 tuvo que resolver con el lock de negocio-día DESPUÉS de que la 063 no alcanzara, así que
--   este cambio se razona CONTRA EL EXCLUDE, no solo contra el conteo:
--     · un servicio de cupo >= 2 DEBE nacer `is_group = true`, o el 2º turno SOLAPADO del mismo
--       bucket chocaría con el gist (23P01) y el cupo NUNCA se llenaría;
--     · y al revés: con el cupo en el servicio, un `individual` deriva cupo 1 ⇒ `is_group = false`
--       ⇒ la fila VUELVE A ENTRAR al EXCLUDE 013. HOY, en un negocio con un bloque de cupo 3, TODAS
--       las filas nacen `is_group = true` y quedan fuera del gist; después de esta migración solo
--       quedan fuera las de un servicio que DECLARÓ cupo >= 2.
--   POR ESO el pre-flight de este archivo ABORTA si algún bloque de producción tiene cupo > 1: en
--   ese negocio el cutover NO sería neutro. Medido el 2026-08-11: 19 bloques, cupo máximo 1 ⇒ el
--   cambio es byte-idéntico para el 100 % de los datos reales (D-02).

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
  -- (068) modo de cupo del SERVICIO, ahora de TRES valores:
  --   'individual' (DEFAULT desde esta migración) | 'group_class' | 'simultaneous_resource'.
  v_mode text;
  -- (068) cupo N del servicio (services.capacity). Lo leen LOS TRES MODOS: es la fuente ÚNICA del
  -- número desde esta migración (antes lo leía solo la rama simultánea).
  v_svc_cap int;
  -- (062) turnos del MISMO servicio que SOLAPAN el intervalo pedido (gate del modo simultáneo).
  v_overlap int;
  -- (062) is_group de la fila a insertar; cada modo lo deriva de SU fuente de cupo (LANDMINE 013).
  v_is_group boolean;
  -- (058) profesional EFECTIVO que se inserta: arranca en p_professional_id y, si el caller mandó el
  -- UUID mágico "cualquiera", se sobrescribe con el elegido bajo el lock. NUNCA se inserta el mágico.
  v_effective_pro uuid := p_professional_id;
  -- (058) ¿el caller pidió "cualquiera"? UUID mágico DISTINTO del sentinel cero ("sin profesional").
  v_is_any boolean := (p_professional_id = '00000000-0000-0000-0000-000000000001'::uuid);
  -- v_bucket se RECOMPUTA tras la selección con v_effective_pro (Pitfall 1: byte-idéntico al índice 011).
  v_bucket uuid;
  v_capacity int;
  v_occupied int;
  v_seat smallint;
  v_space_ids uuid[];   -- (042) espacios físicos que ocupa la agenda reservada (vía agenda_spaces)
  v_sid uuid;           -- (042) iterador del FOREACH del lock por espacio
BEGIN
  -- 0. (062, D-07) Modo y CUPO del servicio. Se leen ANTES del lock a propósito: son CONFIGURACIÓN del
  --    negocio (no compiten en la carrera de reservas), así que no necesitan serializarse. Filtro por
  --    business_id EXPLÍCITO: adentro de un SECURITY DEFINER la RLS no aplica, así que un p_service_id
  --    de otro tenant NO debe resolver a nada.
  --
  --    (068, CAMBIO 1) El fail-safe del COALESCE pasa de 'group_class' a 'individual', y es
  --    estrictamente MÁS fail-closed que antes: hasta la 067, un p_service_id que no resolviera —por
  --    ejemplo el de otro tenant— caía a la rama grupal, donde el cupo lo ponía el BLOQUE de agenda y
  --    podía por lo tanto heredar un cupo > 1 que ese servicio nunca declaró. Ahora cae a
  --    `individual`, que con el CHECK de coherencia del paso 4 implica cupo 1: el camino MÁS
  --    restrictivo (seat fijo en 0, is_group false, la fila adentro del EXCLUDE 013).
  --    El COALESCE de v_svc_cap a 1 NO cambia.
  SELECT s.capacity_mode, COALESCE(s.capacity, 1)
    INTO v_mode, v_svc_cap
  FROM services s
  WHERE s.id = p_service_id
    AND s.business_id = p_business_id;
  v_mode := COALESCE(v_mode, 'individual');
  v_svc_cap := COALESCE(v_svc_cap, 1);

  -- 1. (064, CR2-01) UN ÚNICO advisory lock de NEGOCIO-DÍA — en los DOS modos, sin condicionales.
  --
  --    Reemplaza a los DOS locks de la 063 (servicio-día + instante) y los subsume. El EJE del
  --    invariante que hay que serializar es AGENDA-DÍA: los gates cross-servicio (el de la rama
  --    simultánea y su espejo en la grupal) deciden sobre TODA la agenda del día, porque los
  --    intervalos ESCALONADOS se pisan sin compartir `time` y porque las filas is_group=true están
  --    FUERA del EXCLUDE gist 013 (041) ⇒ sin este lock esos gates son un count suelto (TOCTOU) y el
  --    doble-booking cross-servicio entra bajo concurrencia (CR2-01).
  --
  --    ¿Por qué NEGOCIO-día y no AGENDA-día? Porque el bucket todavía NO existe acá: si el caller
  --    pidió "cualquiera" (058), el profesional se elige recién en el paso 2 — y keyear por el UUID
  --    mágico no serializaría contra nadie. business_id + date, en cambio, se conocen de entrada.
  --    Es exactamente el motivo por el que 058 no podía usar agenda-día.
  --
  --    ¿Por qué NO es una regresión? Es ESTRICTAMENTE MÁS GRUESO que el lock de instante de 058
  --    (§GA1): business+date es un prefijo de business+date+time, así que toda transacción que antes
  --    compartía lock lo sigue compartiendo. Un lock más grueso serializa MÁS, nunca menos ⇒ se
  --    preservan por construcción las dos garantías de §GA1 (vista consistente del instante para
  --    `v_seat`, y para la selección del candidato de "cualquiera") y no se degrada slot_full ni
  --    slot_taken. Y al ser UN SOLO lock en su clase, el orden de adquisición y el deadlock
  --    desaparecen sobre este eje.
  --
  --    COSTO ACEPTADO Y APROBADO (leer el header de la 064 antes de "optimizar"): todas las reservas
  --    de UN negocio en UNA fecha se serializan. Transacción medida en 15-18 ms; la key lleva
  --    business_id ⇒ per-tenant, sin impacto cross-tenant. Cualquier lock más fino REABRE CR2-01.
  --
  --    ORDEN GLOBAL: negocio-día (acá) → espacios (042, ascendente, paso 1b). Idéntico en TODA
  --    transacción del sistema ⇒ sin adquisición cruzada ⇒ deadlock-free (40P01 imposible por acá).
  --    hashtextextended → bigint (forma de un argumento, seed 0).
  --    (068) SIN CAMBIO: esta migración NO toca el eje de serialización.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || p_date::text, 0));

  -- 2. (058, §GA2 / D-01/D-02/D-03/D-07/D-08/D-10) Selección del profesional "cualquiera" BAJO el lock.
  --    Solo si el caller pidió "cualquiera". La selección corre DESPUÉS del lock (Pitfall 2: correrla
  --    antes reintroduce la carrera) y ANTES del bloque de espacio (que necesita el pro elegido).
  --    (068) SIN CAMBIO respecto de 058/062/063/064.
  IF v_is_any THEN
    SELECT p.id
    INTO   v_effective_pro
    FROM   professionals p
    WHERE  p.business_id = p_business_id                            -- D-08 tenant explícito
      AND  p.active = true                                          -- D-07 activos
      AND  p.service_id IS NULL                                     -- excluir CANCHAS (Pitfall 6): una cancha
                                                                    --   (professional con service_id NOT NULL)
                                                                    --   con 0 filas en professional_services
                                                                    --   sería "comodín" y se colaría.
      AND  (p.location_id = p_location_id OR p.location_id IS NULL) -- D-07/D-13 sede (sin-sede vale para todas)
      AND  (  -- D-07 capaz: paridad-comodín EXACTA con staff-services.ts:48-52 (0 filas = capaz de todo).
              NOT EXISTS (SELECT 1 FROM professional_services ps
                          WHERE ps.business_id = p_business_id AND ps.professional_id = p.id)
              OR EXISTS  (SELECT 1 FROM professional_services ps
                          WHERE ps.business_id = p_business_id AND ps.professional_id = p.id
                            AND ps.service_id = p_service_id)
           )
      AND  NOT EXISTS (  -- LIBRE: sin turno OCUPANTE solapado en su agenda ese día (espeja EXCLUDE 013 +
                         --   la guarda expires_at del core booking-core.ts, Pitfall 4).
              SELECT 1 FROM appointments a
              WHERE a.business_id = p_business_id
                AND a.professional_id = p.id
                AND a.date = p_date
                AND a.status IN ('confirmed','pending_payment')
                AND (a.status = 'confirmed' OR a.expires_at IS NULL OR a.expires_at > now())  -- holds vigentes
                AND tsrange(a.date + a.time,
                            a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
                    && tsrange(p_date + p_time,
                               p_date + p_time + make_interval(mins => p_duration))
           )
    ORDER BY (  -- D-02/D-03 carga = turnos NO cancelados del pro ese DÍA COMPLETO, TODAS las sedes/servicios,
                --   incluyendo abonos (appointments normales) y holds VIGENTES (misma guarda expires_at).
             SELECT count(*) FROM appointments a2
             WHERE a2.business_id = p_business_id
               AND a2.professional_id = p.id
               AND a2.date = p_date
               AND a2.status IN ('confirmed','pending_payment')
               AND (a2.status = 'confirmed' OR a2.expires_at IS NULL OR a2.expires_at > now())
           ) ASC,
           p.created_at ASC,   -- D-01 desempate: alta más vieja (determinístico + self-balancing)
           p.id ASC            -- D-01 tie-break secundario → tests reproducibles
    LIMIT 1;

    IF v_effective_pro IS NULL THEN
      -- D-10: ningún capaz libre → el error de disponibilidad de siempre (cae en la rama slot_taken→409
      --       ya existente del core). NO se asigna a alguien ocupado ni se cae.
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- (058) Recomputar el bucket con el pro EFECTIVO ya resuelto. Literal byte-idéntico al índice 011 /
  --   EXCLUDE 013 / count (Pitfall 1). Para los 4 callers actuales v_effective_pro = p_professional_id.
  v_bucket := COALESCE(v_effective_pro, '00000000-0000-0000-0000-000000000000'::uuid);

  -- 1b. (042) Exclusión acoplada por espacio físico — lock por conjunto de espacios + EXISTS.
  --     Resolver el set de espacios de la agenda reservada vía la puente. NOTA: se keya por
  --     v_effective_pro (el pro REAL elegido): la puente referencia professionals.id real; las
  --     agendas sin profesional/sentinela no tienen espacios (Pitfall 1 / A2). Si la agenda no tiene
  --     espacios mapeados, v_space_ids queda NULL → sin lock de espacio, sin chequeo, cero overhead.
  --     (068) SIN CAMBIO: los locks de espacio siguen tomándose DESPUÉS del lock de negocio-día.
  SELECT array_agg(asp.space_id ORDER BY asp.space_id) INTO v_space_ids   -- ORDEN ASCENDENTE (anti-deadlock)
  FROM agenda_spaces asp
  WHERE asp.business_id = p_business_id
    AND asp.professional_id = v_effective_pro;

  -- (064, gap 3) RECURSO SIMULTÁNEO cupo > 1 + agenda con ESPACIO mapeado ⇒ RECHAZO EXPLÍCITO.
  --   Un espacio es una sala/cancha FÍSICA compartida entre agendas, y appointment_spaces_no_overlap
  --   (042) impone un turno por espacio a la vez: capacidad 1. Un recurso de cupo >= 2 sobre ese mismo
  --   espacio es una contradicción semántica, no un bug a parchear relajando el EXCLUDE (relajarlo
  --   borraría el invariante de espacio compartido de v0.12). Antes de este rechazo la combinación
  --   fallaba sola y MAL: el 1er turno entraba y el 2º moría con 23P01 → `slot_taken`, mientras
  --   `availability` seguía publicando el horario como libre. Código de error PROPIO para no
  --   confundirlo con slot_taken/slot_full (booking-core lo mapea a `simultaneous_space_conflict`).
  --   Con cupo 1 NO aplica: la fila nace is_group=false, entra al EXCLUDE 013 y el espacio funciona
  --   como siempre (canchas / F11) ⇒ cero regresión del camino v0.12.
  --   No necesita lock (es configuración, igual que la lectura del paso 0), y va ANTES de tomar los
  --   locks de espacio para no serializar de gratis a una transacción que va a abortar.
  --   (068) SIN CAMBIO: el CHECK de coherencia del paso 4 ya vuelve imposible el `simultaneous_resource`
  --   de cupo 1, así que el `v_svc_cap > 1` de acá pasa a ser redundante-pero-consistente; se deja
  --   igual a propósito (el gate no depende de un constraint para ser correcto).
  IF v_mode = 'simultaneous_resource' AND v_svc_cap > 1 AND v_space_ids IS NOT NULL THEN
    RAISE EXCEPTION 'simultaneous_space_conflict' USING ERRCODE = 'P0001';
  END IF;

  IF v_space_ids IS NOT NULL THEN
    -- Lock por CADA espacio en el orden ascendente del array_agg → ambas reservas que pelean un
    -- espacio compartido lo toman en la misma posición global (sin cruce → sin deadlock 40P01).
    FOREACH v_sid IN ARRAY v_space_ids LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text || v_sid::text, 0));
    END LOOP;

    -- Tras tomar los locks (el EXISTS es ahora autoritativo): ¿hay algún turno SOLAPADO en tiempo en
    -- CUALQUIER agenda HERMANA (que comparta >=1 espacio del set) excluyendo la propia agenda? El
    -- join appointments → agenda_spaces (por COALESCE(professional_id, sentinel) del turno) expande
    -- cada turno a sus espacios; other.space_id = ANY(v_space_ids) exige intersección; el && de
    -- tsrange exige solape de tiempo (duración variable). El <> de self excluye la F11 contra sí misma.
    IF EXISTS (
      SELECT 1
      FROM appointments a
      JOIN agenda_spaces other ON other.business_id = p_business_id
                              AND other.professional_id = COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid)
      WHERE a.business_id = p_business_id
        AND a.status IN ('confirmed', 'pending_payment')
        AND a.date = p_date
        AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid)
            <> v_bucket   -- excluye self (Pitfall 3); v_bucket = COALESCE(v_effective_pro, sentinel)
        AND other.space_id = ANY (v_space_ids)                                              -- comparte >=1 espacio
        AND tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
            && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration))  -- solape de tiempo
    ) THEN
      -- Reusar slot_taken (NO space_taken). El caller lo capta por `message` (P0001) en booking-core.
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 2/3/4. (062) Gate de cupo + asiento + is_group, BIFURCADOS por modo. Todo lo de acá abajo corre
  --        DESPUÉS del advisory lock de negocio-día: nunca se decide disponibilidad con un count
  --        suelto (TOCTOU). (064) Eso vale también para los gates cross-servicio: el lock cubre el eje
  --        agenda-día sobre el que deciden.
  --        (068, CAMBIO 3) La bifurcación se mantiene en DOS ramas y NO se parte en tres. `individual`
  --        y `group_class` comparten el MISMO eje de conteo (hora de inicio EXACTA) y el mismo
  --        tratamiento del asiento; lo único que los distinguía era el NÚMERO, y desde esta migración
  --        los dos lo sacan del mismo lugar. Un CASE de tres ramas duplicaría código idéntico y
  --        agrandaría el diff sobre la función que la Phase 12 necesitó DOS rondas de review y CINCO
  --        blockers para dejar bien.
  IF v_mode = 'simultaneous_resource' THEN
    -- ── (063, CR-02) Gate de EXCLUSIÓN POR AGENDA — va PRIMERO, fail-closed ────────────────────
    -- El cupo N del recurso NO reemplaza la exclusión por agenda. Con capacity > 1 la fila nace
    -- is_group = true y sale del EXCLUDE gist 013 (041: `... AND NOT is_group`), así que si el cruce
    -- con OTROS servicios no se chequea acá NO lo chequea NADIE: ni el gist, ni el gate de abajo (que
    -- filtra por el MISMO service_id), ni el re-check JS con autoAssign (que se saltea entero). Ese
    -- era el doble-booking real: "camilla" (simultáneo, cupo 2) montándose sobre una "consulta"
    -- confirmada de la misma agenda.
    --
    -- Semántica: los solapes del PROPIO servicio son legales hasta el cupo (los gatea el count de
    -- abajo); cualquier solape con OTRO servicio del MISMO bucket es doble-booking → slot_taken.
    -- Permitir el cruce es una decisión que le corresponde al dueño (flag por servicio = FOLLOW-UP
    -- planificado, fuera de alcance acá): el default DEBE bloquear.
    --
    -- Mismos criterios que el resto del motor: bucket por COALESCE(professional_id, sentinel)
    -- byte-idéntico al índice 011, holds VIGENTES únicamente, predicado tsrange && canónico,
    -- business_id EXPLÍCITO (SECURITY DEFINER ⇒ la RLS no protege adentro).
    -- (064, CR2-01) Este EXISTS es AUTORITATIVO porque corre bajo el lock de negocio-día, que es el
    -- único que cubre su eje (agenda-día). (068) SIN CAMBIO.
    IF EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.business_id = p_business_id
        AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
        AND a.service_id IS DISTINCT FROM p_service_id
        AND a.date = p_date
        AND a.status IN ('confirmed', 'pending_payment')
        AND (a.status = 'confirmed' OR a.expires_at IS NULL OR a.expires_at > now())
        AND tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
            && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration))
    ) THEN
      -- slot_taken (NO slot_full): no es "cupo lleno" del recurso, es la agenda ocupada por otra cosa.
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;

    -- ── Recurso simultáneo (D-02/D-03): el cupo es de services.capacity y se cuenta por SOLAPE ──
    -- Compite SOLO contra turnos del MISMO service_id (carriles independientes, D-04): una consulta
    -- normal de la misma persona a la misma hora NO resta contra el cupo de "camilla" (y si pisa la
    -- agenda ya la rechazó el gate de arriba). El predicado tsrange && tsrange es el canónico del
    -- motor (idéntico al EXCLUDE 013 de 041 y al bloque de espacio de 042). business_id EXPLÍCITO.
    --
    -- (063, CR-01) Guarda de holds VIGENTES: los `pending_payment` con la seña ya vencida NO ocupan.
    -- Es la MISMA guarda que usa la selección "cualquiera" de arriba y que usa el read-path de
    -- availability. No se puede delegar al core como hace la rama grupal: el core solo libera los
    -- holds vencidos de SU bucket y este carril cuenta a través de TODAS las agendas.
    -- (068) SIN CAMBIO: esta rama YA leía el cupo del servicio — es el modelo que la fase generaliza.
    SELECT count(*) INTO v_overlap
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND a.service_id = p_service_id
      AND a.date = p_date
      AND a.status IN ('confirmed', 'pending_payment')
      AND (a.status = 'confirmed' OR a.expires_at IS NULL OR a.expires_at > now())
      AND tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
          && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration));

    IF v_overlap >= v_svc_cap THEN
      -- El recurso ya está ocupado por `capacity` turnos que pisan este intervalo → mismo error de
      -- cupo lleno que el grupal (el core lo mapea a slot_full/409).
      RAISE EXCEPTION 'slot_full' USING ERRCODE = 'P0001';
    END IF;

    -- El ASIENTO sigue atado al slot EXACTO (D-05): el índice único 011 es (business, bucket, date,
    -- time, seat), así que el seat solo tiene que ser único DENTRO del mismo date+time. Dos turnos
    -- escalonados tienen `time` distinto → claves distintas → ambos seat 0 sin colisión. El solape es
    -- el GATE del cupo, nunca el criterio del asiento. (064) Este count corre bajo el lock de
    -- negocio-día, más grueso que el de instante de 058 ⇒ sigue imposible que dos modos distintos
    -- deriven el MISMO seat.
    SELECT count(*) INTO v_occupied
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
      AND a.date = p_date AND a.time = p_time
      AND a.status IN ('confirmed', 'pending_payment');
    v_seat := v_occupied;

    -- LANDMINE: el EXCLUDE gist 013 (041:76) solo aplica a filas con is_group = false. Si un recurso
    -- de cupo > 1 naciera con is_group = false, el 2º turno SOLAPADO del mismo bucket chocaría con el
    -- gist (23P01) y el recurso NUNCA se llenaría. Con cupo 1 se deja is_group = false a propósito:
    -- el EXCLUDE actúa de respaldo atómico redundante con el gate por solape de arriba.
    v_is_group := (v_svc_cap > 1);
  ELSE
    -- ── individual + group_class: cupo por HORA DE INICIO EXACTA ───────────────────────────────
    --
    -- (068, CAMBIO 3) Esta rama cubre AHORA DOS modos declarables, no "el default": `individual`
    -- (cupo 1) y `group_class` (cupo >= 2). Comparten eje de conteo y tratamiento de asiento; el
    -- número sale del mismo lugar para los dos.
    --
    -- ⚠ CAMBIO DE RÉGIMEN FRENTE AL EXCLUDE GIST 013 — es el corazón de esta migración y va escrito,
    -- no inferido (ver también el header de la sección 7):
    --   · `individual` ⇒ cupo 1 ⇒ `v_seat` fijo en 0 ⇒ la 2ª reserva del slot EXACTO choca con el
    --     índice único 011 (23505 → slot_taken), y la fila nace is_group = false ⇒ VUELVE A ENTRAR
    --     al EXCLUDE 013, que es el que rechaza el solape de DURACIÓN VARIABLE (un turno de 60' que
    --     pisa parcialmente a uno de 30' — eso el índice 011 no lo ve).
    --   · cupo >= 2 ⇒ la fila nace is_group = true y SALE del gist A PROPÓSITO, porque un EXCLUDE no
    --     puede expresar "hasta N": el invariante anti-solape de esas filas lo impone ESTA función,
    --     bajo el lock de negocio-día.
    -- Antes de esta migración, en un negocio con un bloque de agenda de cupo 3 TODAS las filas —de
    -- cualquier servicio— nacían is_group = true y quedaban fuera del gist. Desde acá solo quedan
    -- fuera las de un servicio que DECLARÓ cupo >= 2.
    --
    -- (064, CR2-01 — eje INVERSO) Gate ESPEJO del gate cross-servicio de la rama simultánea. Sin él
    -- este eje no tenía NINGÚN chequeo: una fila `is_group = true` de un RECURSO SIMULTÁNEO está
    -- FUERA del EXCLUDE gist 013, así que un turno de esta rama se le podía montar encima — y con un
    -- cupo > 1 entraba incluso SIN concurrencia (el re-check JS tampoco frena:
    -- `rejectEarly = taken && slotCapacity <= 1` → false). Bajo concurrencia entraba también con
    -- cupo 1.
    --
    -- ⚠ ALCANCE ACOTADO A PROPÓSITO, Y SU JUSTIFICACIÓN SE REESCRIBE ACÁ (D-07). El predicado NO se
    -- toca: además de `is_group = true` + servicio DISTINTO + solape, se sigue exigiendo que el
    -- servicio de la fila preexistente esté HOY en modo `simultaneous_resource`. Lo que cambia es el
    -- POR QUÉ. La razón vieja —`time_blocks.capacity` es del BLOQUE, así que con un bloque de cupo 3
    -- TODAS las filas nacen is_group = true y bloquearlas sería drift— MUERE con esta migración: el
    -- cupo ya no sale del bloque. La razón que SOBREVIVE es el mismo caso legal, ahora DECLARADO: dos
    -- servicios GRUPALES DISTINTOS, cada uno con `capacity >= 2`, siguen pudiendo coexistir solapados
    -- en la misma agenda —es lo que "cupo N" significa— y es exactamente lo que este recorte protege.
    -- Ampliar el gate NO sería restaurar integridad perdida: sería CAMBIAR COMPORTAMIENTO, y hacerlo
    -- en la misma migración que mueve la fuente del cupo, sobre este RPC, es apilar riesgo. Queda
    -- anotado como candidato a REVISIÓN PROPIA. Un comentario que miente es peor que ninguno.
    --
    -- Mismos criterios que su espejo: bucket byte-idéntico al 011, holds VIGENTES, tsrange &&
    -- canónico, business_id EXPLÍCITO en las DOS tablas (SECURITY DEFINER ⇒ sin RLS adentro).
    IF EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.business_id = p_business_id
        AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
        AND a.service_id IS DISTINCT FROM p_service_id
        AND a.date = p_date
        AND a.is_group = true            -- solo las filas que se fueron del EXCLUDE 013
        AND a.status IN ('confirmed', 'pending_payment')
        AND (a.status = 'confirmed' OR a.expires_at IS NULL OR a.expires_at > now())
        AND EXISTS (                     -- ...y se fueron por el modo simultáneo, no por cupo grupal
              SELECT 1 FROM services s2
              WHERE s2.id = a.service_id
                AND s2.business_id = p_business_id
                AND s2.capacity_mode = 'simultaneous_resource'
            )
        AND tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
            && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration))
    ) THEN
      -- Mismo error que el espejo: la agenda está ocupada por otra cosa, no es cupo lleno.
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;

    -- 2. (068, CAMBIO 2 — CUPO-07) El cupo sale del SERVICIO. Acá vivía la consulta que resolvía la
    --    capacidad con un MAX sobre el BLOQUE de agenda (plantilla semanal: day_of_week + ventana);
    --    se borró entera. El número ya se leyó en el paso 0, ANTES del lock, porque es CONFIGURACIÓN
    --    del negocio y no compite en la carrera de reservas: no hace falta ninguna consulta más.
    --
    --    Se conserva `v_capacity` como variable en vez de usar `v_svc_cap` en línea a propósito: deja
    --    BYTE-IDÉNTICAS las dos líneas que la consumen (el gate de asiento del paso 4 y la derivación
    --    de is_group), y un diff mínimo sobre esta función es una decisión de RIESGO, no de estilo.
    v_capacity := v_svc_cap;

    -- 3. Ocupantes actuales del slot exacto (mismo bucket, mismo date+time, estados que ocupan).
    --    Los holds vencidos ya los liberó el core ANTES del RPC, así que el count está limpio.
    SELECT count(*) INTO v_occupied
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
      AND a.date = p_date AND a.time = p_time
      AND a.status IN ('confirmed', 'pending_payment');

    -- 4. Asignación de asiento + cero regresión cupo 1 (CONC-02). Sin cambio respecto de 041/042/058/064.
    IF v_capacity > 1 THEN
      IF v_occupied >= v_capacity THEN
        RAISE EXCEPTION 'slot_full' USING ERRCODE = 'P0001';
      END IF;
      v_seat := v_occupied;
    ELSE
      -- Cupo 1: seat fijo en 0 → la 2ª reserva colisiona con el índice 011 (23505 → slot_taken).
      v_seat := 0;
    END IF;
    v_is_group := (v_capacity > 1);
  END IF;
  RETURN QUERY
  INSERT INTO appointments (
    business_id, client_id, client_name, client_phone, client_email,
    service_id, professional_id, location_id, date, time, duration_minutes,
    seat, is_group, notes, status, expires_at
  ) VALUES (
    p_business_id, p_client_id, p_client_name, p_client_phone, p_client_email,
    p_service_id, v_effective_pro, p_location_id, p_date, p_time, p_duration,   -- (058) el pro REAL, nunca el mágico
    v_seat, v_is_group, p_notes, p_status, p_expires_at                          -- (062) is_group según el modo
  )
  RETURNING appointments.id, appointments.cancel_token;
END;
$$;

ALTER FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) OWNER TO "postgres";

-- Re-emitir el GRANT (el CREATE OR REPLACE preserva grants, pero se re-emite por claridad/idempotencia,
-- igual que 041/042/058/062/063/064): anon (caso anon-key), authenticated (alta manual anon+RLS),
-- service_role (booking público).
GRANT EXECUTE ON FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) TO "anon", "authenticated", "service_role";

-- ── Recargar el schema cache de PostgREST (obligatorio tras DDL) ─────────────────────────────────
NOTIFY pgrst, 'reload schema';
