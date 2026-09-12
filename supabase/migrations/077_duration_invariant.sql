-- 077 — La duración de un servicio deja de depender de que cada formulario se acuerde
--       (motor-reservas / quick 260912-pm1 — G-21-11, v0.28).
--
-- ── Contexto ────────────────────────────────────────────────────────────────────────────────────
--   Hasta acá la invariante "un servicio dura más de 0 minutos" no existía en ningún lado más que
--   en la memoria de cada formulario. TRES pantallas escriben `services` (el paso 2 del alta, el
--   panel de canchas y el panel de servicios de Ajustes) y cada una escribía su propia variante de
--   "texto de input → número", con dos modos de falla distintos:
--
--     `parseInt(x)`        → la celda vaciada da NaN, que serializa `null` contra una columna
--                            NOT NULL ⇒ 23502. En el alta, donde el INSERT es UNA sentencia
--                            multi-fila, eso no pierde una fila: pierde el CATÁLOGO ENTERO y, con
--                            él, el mapeo franja↔servicio.
--     `parseInt(x) || 0`   → la celda vaciada da **0**, que SÍ se guarda. Ese es el peor de los dos:
--                            no hay error, hay un desajuste silencioso (el dueño cree que el
--                            servicio dura X y el motor reserva 30).
--
--   El código de esta tanda unifica las tres superficies detrás de un solo normalizador. Esta
--   migración es la otra mitad: la invariante pasa a vivir en la base, que es el único lugar donde
--   no depende de que un formulario se acuerde. Si mañana aparece una cuarta pantalla, la ataja
--   igual.
--
-- ── Por qué esto toca el Core Value y no es sólo prolijidad ─────────────────────────────────────
--   `book_slot_atomic` arma TODOS sus chequeos de solape como
--   `tsrange(p_date + p_time, ... + make_interval(mins => p_duration))`. Con `p_duration = 0` ese
--   rango es **vacío**, y un rango vacío no solapa con nada: pasan en silencio los SEIS gates
--   anti-doble-booking. El `COALESCE(duration_minutes, 30)` del EXCLUDE ataja el NULL pero **no el
--   0** — esa asimetría es la trampa. Un servicio guardado con duración 0 era el camino de entrada.
--
-- ── Qué hace ────────────────────────────────────────────────────────────────────────────────────
--   1. `services`: NORMALIZA (0 o menos → 30) y recién después agrega el CHECK
--      `services_duration_positive`. El orden importa (ver abajo).
--   2. `appointments`: CHECK `appointments_duration_positive` **NOT VALID**, con el NULL explícito
--      como valor LEGAL.
--   3. `book_slot_atomic`: guard fail-closed sobre `p_duration`, antes de cualquier lectura o lock.
--
-- ── (1) POR QUÉ SE NORMALIZA ANTES DE RESTRINGIR, Y EN LA MISMA TRANSACCIÓN ─────────────────────
--   Producción NO se pudo consultar desde la sesión que escribió esto. Una migración que sólo
--   agrega el CHECK puede abortar el deploy contra una fila que nadie vio, y el error de Postgres
--   no dice cuál es. El UPDATE previo la deja pasar.
--
--   Normalizar un 0 a 30 **no inventa un dato**: los seis lugares del código que leen esta columna
--   YA se comportan como si 0 fuera 30 — `Number(x || 30)` en `lib/booking-core.ts`, `|| 30` en los
--   tres loops de `app/api/booking/availability/route.ts`, el `if (durationMinutes <= 0) return []`
--   de `lib/time-block-services.ts`, y el `COALESCE(..., 30)` del EXCLUDE. El UPDATE hace que el
--   valor GUARDADO coincida con la conducta que el negocio ya tenía.
--
--   El umbral es `> 0`, **no** `>= 5`: el 5 es un mínimo de UI (`MIN_SERVICE_MINUTES`) y subirlo a
--   la base podría rechazar filas legítimas de prod que esta sesión no pudo medir.
--
-- ── (2) POR QUÉ EL DE `appointments` ES `NOT VALID` Y EL NULL SIGUE SIENDO LEGAL ────────────────
--   Las dos mitades son deliberadas:
--
--   - **NULL legal**: `appointments.duration_minutes` es nullable POR DISEÑO y los seis chequeos de
--     solape dependen de `COALESCE(duration_minutes, 30)`. Prohibir el NULL rompería ese contrato.
--   - **NOT VALID**: Postgres igual lo aplica a todo INSERT/UPDATE nuevo, pero NO revisa las filas
--     históricas. Normalizarlas sería reescribir el RANGO que ocupan, y reescribir un rango puede
--     chocar contra el EXCLUDE `appointments_no_overlap` y abortar la transacción entera — es
--     literalmente la lección de D-03 de v0.27: reparar filas descubre solapes que antes eran
--     invisibles y le deja al dueño un error peor.
--
--   Si algún día se quiere cerrar del todo: medir primero en prod
--   (`SELECT count(*) FROM appointments WHERE duration_minutes <= 0`) y recién ahí
--   `VALIDATE CONSTRAINT` en una migración propia.
--
-- ── (3) LA FUNCIÓN NO SE TRANSCRIBIÓ A MANO ────────────────────────────────────────────────────
--   Es `SECURITY DEFINER`, tiene `SET search_path TO 'public'` y son 314 líneas. Su cuerpo se
--   EXTRAJO programáticamente de `supabase/schema.sql` (la definición vigente) y lo único que se le
--   agregó son las líneas del guard: cero líneas eliminadas, verificado por diff. Copiarla a mano
--   arriesga perder un guard de tenant adentro sin que nada falle a la vista.
--
--   La firma y el `ALTER FUNCTION ... OWNER TO "postgres"` se conservan byte-idénticos, y
--   `CREATE OR REPLACE` preserva los permisos: el `REVOKE ... FROM anon` de la migr. 076 sigue en
--   pie. Eso lo verifica `test/book-slot-atomic-anon-revoke.test.ts`, que tiene que seguir verde.
--
-- ── RUNBOOK DE PRODUCCIÓN (esta migración NO se aplicó allá) ────────────────────────────────────
--   Última migración aplicada en prod: 076.
--
--   (a) **PRIMERO SE DEPLOYA EL CÓDIGO, DESPUÉS SE APLICA ESTA MIGRACIÓN.** No es una preferencia:
--       es la lección de la 068, que se aplicó al revés. Al revés no hay pérdida de datos, pero
--       durante la ventana el panel VIEJO puede mandar un 0 y comerse un rechazo crudo del CHECK
--       con un toast genérico ("Error"), que es UX peor y perfectamente evitable.
--
--   (b) PRE-FLIGHT (informativo — el UPDATE de abajo lo arregla igual, pero conviene SABER):
--
--         SELECT count(*) FROM "public"."services" WHERE "duration_minutes" <= 0;
--         SELECT count(*) FROM "public"."appointments" WHERE "duration_minutes" <= 0;
--
--   (c) Pegar y ejecutar este archivo **COMPLETO, de una sola vez** — nunca statement por statement.
--       Todo va dentro de un BEGIN/COMMIT explícito: el UPDATE y el CHECK que lo hace cumplir tienen
--       que entrar o no entrar JUNTOS.
--
--   (d) VERIFICACIÓN POSTERIOR:
--
--         SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--          WHERE conname IN ('services_duration_positive', 'appointments_duration_positive');
--
--       Esperado: **DOS filas**. Y la query de control:
--
--         SELECT count(*) FROM "public"."services" WHERE "duration_minutes" <= 0;   -- debe dar 0
--
--   (e) RECIÉN DESPUÉS de aplicarla, espejar `supabase/schema.sql` A MANO y de forma QUIRÚRGICA
--       —nunca con `db dump` (decisión del repo desde la Phase 06)—: el CHECK de `services` va en su
--       bloque de constraints, el de `appointments` como `ALTER TABLE ... NOT VALID`, y las líneas
--       del guard adentro del cuerpo de la función.
--
-- Idempotente (molde 061/065): cada `ADD CONSTRAINT` guardado por `pg_constraint`, el UPDATE acotado
-- por su propio WHERE (correrlo de nuevo no matchea nada) y la función con `CREATE OR REPLACE`.
-- Nada destructivo.

BEGIN;

-- ── 1. services: normalizar y RECIÉN DESPUÉS restringir ─────────────────────────────────────────
-- El orden es el punto entero de este bloque: el CHECK solo abortaría contra una fila que nadie
-- midió. Ver la cabecera para por qué 30 no es un dato inventado.
UPDATE "public"."services"
   SET "duration_minutes" = 30
 WHERE "duration_minutes" <= 0;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'services_duration_positive'
       AND "conrelid" = '"public"."services"'::"regclass"
  ) THEN
    ALTER TABLE "public"."services"
      ADD CONSTRAINT "services_duration_positive" CHECK (("duration_minutes" > 0));
  END IF;
END
$do$;

-- ── 2. appointments: NOT VALID, y el NULL sigue siendo legal ────────────────────────────────────
-- `duration_minutes IS NULL OR duration_minutes > 0`: el NULL es parte del contrato que necesita el
-- `COALESCE(duration_minutes, 30)` de los seis chequeos de solape. `NOT VALID` deja las filas
-- históricas en paz a propósito (lección D-03 de v0.27) y sigue aplicando a todo INSERT/UPDATE
-- nuevo, que es donde el 0 podía entrar.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'appointments_duration_positive'
       AND "conrelid" = '"public"."appointments"'::"regclass"
  ) THEN
    ALTER TABLE "public"."appointments"
      ADD CONSTRAINT "appointments_duration_positive"
      CHECK (("duration_minutes" IS NULL) OR ("duration_minutes" > 0)) NOT VALID;
  END IF;
END
$do$;

-- ── 3. book_slot_atomic: el guard fail-closed sobre p_duration ──────────────────────────────────
-- Cuerpo EXTRAÍDO de `supabase/schema.sql` (cero líneas eliminadas, verificado por diff); lo único
-- agregado es el bloque `IF p_duration IS NULL OR p_duration <= 0` que está justo después del BEGIN.

CREATE OR REPLACE FUNCTION "public"."book_slot_atomic"("p_business_id" "uuid", "p_professional_id" "uuid", "p_service_id" "uuid", "p_location_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_duration" integer, "p_client_id" "uuid", "p_client_name" "text", "p_client_phone" "text", "p_client_email" "text", "p_notes" "text", "p_status" "text", "p_expires_at" timestamp with time zone) RETURNS TABLE("id" "uuid", "cancel_token" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  -- (068) modo de cupo del SERVICIO, de TRES valores:
  -- 'individual' (DEFAULT) | 'group_class' | 'simultaneous_resource'.
  v_mode text;
  -- (068) cupo N del servicio (services.capacity). Lo leen LOS TRES MODOS: es la fuente ÚNICA del
  -- número (antes lo leía solo la rama simultánea).
  v_svc_cap int;
  -- (062) turnos del MISMO servicio que SOLAPAN el intervalo pedido (gate del modo simultáneo).
  v_overlap int;
  -- (062) is_group de la fila a insertar: cada modo lo deriva de SU fuente de cupo (LANDMINE 013).
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
  -- ── (077) GUARD FAIL-CLOSED DE p_duration — corre ANTES de cualquier lectura o lock ───────────
  -- Todos los chequeos de solape de más abajo arman el intervalo pedido como
  -- `tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration))`. Con
  -- `p_duration = 0` ese rango es **VACÍO**, y un rango vacío NO SOLAPA CON NADA: los seis gates
  -- anti-doble-booking pasan en silencio y el turno se inserta encima de cualquier otro. Es el Core
  -- Value del proyecto fallando sin un solo error visible.
  --
  -- ⚠ `COALESCE(duration_minutes, 30)` (el del EXCLUDE `appointments_no_overlap`) ataja el NULL
  -- pero NO el 0 — esa asimetría es la trampa exacta que este guard cierra.
  --
  -- Falla FUERTE a propósito. Hoy NO puede dispararse con el código de la app: el único caller
  -- coerciona (`lib/booking-core.ts`, `Number(service.duration_minutes || 30)`) y la migr. 076 ya le
  -- revocó EXECUTE a `anon`. Lo que hace no es tapar un bug vivo: convierte un futuro desajuste
  -- silencioso en un error visible, que es toda la diferencia entre un dato plausible y equivocado
  -- y un rechazo que alguien puede leer.
  IF p_duration IS NULL OR p_duration <= 0 THEN
    RAISE EXCEPTION 'invalid_duration: la duración del turno tiene que ser mayor a 0 minutos (recibido: %). Un intervalo vacío no solapa con nada y saltearía TODOS los chequeos anti-doble-booking.', COALESCE(p_duration::text, 'NULL')
      USING ERRCODE = 'P0001';
  END IF;

  -- 0. (062, D-07) Modo y CUPO del servicio, leídos ANTES del lock (es configuración, no compite en la
  --    carrera — y define QUÉ lock tomar). business_id EXPLÍCITO: adentro de un SECURITY DEFINER la RLS
  --    no aplica. (068) El fail-safe del COALESCE pasa a 'individual' y es MÁS fail-closed que el
  --    histórico: un p_service_id que no resuelva (p. ej. de otro tenant) cae a cupo 1 en vez de caer
  --    a la rama grupal, donde podía heredar un cupo > 1 del BLOQUE de agenda que nunca declaró.
  SELECT s.capacity_mode, COALESCE(s.capacity, 1)
    INTO v_mode, v_svc_cap
  FROM services s
  WHERE s.id = p_service_id
    AND s.business_id = p_business_id;
  v_mode := COALESCE(v_mode, 'individual');
  v_svc_cap := COALESCE(v_svc_cap, 1);

  -- 1. (064, CR2-01) UN ÚNICO advisory lock de NEGOCIO-DÍA, en los DOS modos. Reemplaza y SUBSUME a
  --    los dos locks de la 063 (servicio-día + instante). El EJE del invariante a serializar es
  --    AGENDA-DÍA: los gates cross-servicio (rama simultánea + su espejo en la grupal) deciden sobre
  --    TODA la agenda del día — los intervalos escalonados se pisan sin compartir `time`, y las filas
  --    is_group=true están FUERA del EXCLUDE gist 013 ⇒ sin este lock esos gates son un count suelto
  --    (TOCTOU) y el doble-booking cross-servicio entra bajo concurrencia (CR2-01).
  --    NEGOCIO-día y no AGENDA-día porque con "cualquiera" (058) el bucket todavía no existe acá;
  --    business_id + date sí se conocen de entrada. NO es regresión: es ESTRICTAMENTE MÁS GRUESO que
  --    el lock de instante de 058 (§GA1) —business+date es prefijo de business+date+time— así que
  --    preserva por construcción la vista consistente del instante para `v_seat` y para la selección
  --    de candidato. COSTO ACEPTADO (aprobado): todas las reservas de un negocio en una fecha
  --    serializan (RPC medido en 15-18 ms, key per-tenant). Un lock más fino REABRE CR2-01.
  --    ORDEN GLOBAL: negocio-día → espacios (042, ascendente) ⇒ deadlock-free.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || p_date::text, 0));

  -- 2. (058, §GA2 / D-01/D-02/D-03/D-07/D-08/D-10) Selección del profesional "cualquiera" BAJO el lock.
  --    Solo si el caller pidió "cualquiera". La selección corre DESPUÉS del lock (Pitfall 2) y ANTES
  --    del bloque de espacio (que necesita el pro elegido).
  IF v_is_any THEN
    SELECT p.id
    INTO   v_effective_pro
    FROM   professionals p
    WHERE  p.business_id = p_business_id                            -- D-08 tenant explícito
      AND  p.active = true                                          -- D-07 activos
      AND  p.service_id IS NULL                                     -- excluir CANCHAS (Pitfall 6)
      AND  (p.location_id = p_location_id OR p.location_id IS NULL) -- D-07/D-13 sede (sin-sede vale para todas)
      AND  (  -- D-07 capaz: paridad-comodín EXACTA con staff-services.ts:48-52 (0 filas = capaz de todo).
              NOT EXISTS (SELECT 1 FROM professional_services ps
                          WHERE ps.business_id = p_business_id AND ps.professional_id = p.id)
              OR EXISTS  (SELECT 1 FROM professional_services ps
                          WHERE ps.business_id = p_business_id AND ps.professional_id = p.id
                            AND ps.service_id = p_service_id)
           )
      AND  NOT EXISTS (  -- LIBRE: sin turno OCUPANTE solapado en su agenda ese día (espeja EXCLUDE 013 +
                         --   la guarda expires_at del core, Pitfall 4).
              SELECT 1 FROM appointments a
              WHERE a.business_id = p_business_id
                AND a.professional_id = p.id
                AND a.date = p_date
                AND a.status IN ('confirmed','pending_payment')
                AND (a.status = 'confirmed' OR a.expires_at IS NULL OR a.expires_at > now())
                AND tsrange(a.date + a.time,
                            a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
                    && tsrange(p_date + p_time,
                               p_date + p_time + make_interval(mins => p_duration))
           )
    ORDER BY (  -- D-02/D-03 carga = turnos NO cancelados del pro ese DÍA COMPLETO, TODAS las sedes/servicios.
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
      -- D-10: ningún capaz libre → el error de disponibilidad de siempre (rama slot_taken→409 del core).
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- (058) Recomputar el bucket con el pro EFECTIVO ya resuelto (Pitfall 1: literal byte-idéntico al 011).
  v_bucket := COALESCE(v_effective_pro, '00000000-0000-0000-0000-000000000000'::uuid);

  -- 1b. (042) Exclusión acoplada por espacio físico — lock por conjunto de espacios + EXISTS.
  --     Resolver el set de espacios de la agenda reservada vía la puente. NOTA: se keya por
  --     v_effective_pro (el pro REAL elegido): la puente referencia professionals.id real; las
  --     agendas sin profesional/sentinela no tienen espacios (Pitfall 1 / A2). Si la agenda no tiene
  --     espacios mapeados, v_space_ids queda NULL → sin lock de espacio, sin chequeo, cero overhead.
  SELECT array_agg(asp.space_id ORDER BY asp.space_id) INTO v_space_ids   -- ORDEN ASCENDENTE (anti-deadlock)
  FROM agenda_spaces asp
  WHERE asp.business_id = p_business_id
    AND asp.professional_id = v_effective_pro;

  -- (064, gap 3 — AMPLIADO por la 069, CR-03) CUPO > 1 + agenda con ESPACIO mapeado ⇒ RECHAZO
  --   EXPLÍCITO, en los DOS modos de cupo compartido. Un espacio es una sala/cancha FÍSICA y
  --   appointment_spaces_no_overlap (042) impone un turno por espacio a la vez (capacidad 1): un
  --   servicio de cupo ≥ 2 sobre el mismo espacio es una contradicción semántica, NO un bug a
  --   parchear relajando ese EXCLUDE (relajarlo borraría el invariante de espacio compartido de
  --   v0.12). (069) La condición de MODO se cayó: hasta la 068 exigía 'simultaneous_resource' y por
  --   ahí se colaba un `group_class` de cupo ≥ 2 (declarable recién desde la 068) — la 1ª inscripción
  --   entraba y la 2ª moría con 23P01 → slot_taken mientras availability publicaba los N lugares.
  --   Lo que hace imposible la configuración es el CUPO, no el modo. Código PROPIO para no
  --   confundirlo con slot_taken/slot_full. Con cupo 1 NO aplica (is_group=false ⇒ el EXCLUDE 013 lo
  --   cubre) ⇒ cero regresión del camino canchas/F11.
  IF v_svc_cap > 1 AND v_space_ids IS NOT NULL THEN
    RAISE EXCEPTION 'simultaneous_space_conflict' USING ERRCODE = 'P0001';
  END IF;

  IF v_space_ids IS NOT NULL THEN
    -- Lock por CADA espacio en el orden ascendente del array_agg → ambas reservas que pelean un
    -- espacio compartido lo toman en la misma posición global (sin cruce → sin deadlock 40P01).
    FOREACH v_sid IN ARRAY v_space_ids LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text || v_sid::text, 0));
    END LOOP;

    -- Tras tomar los locks (el EXISTS es ahora autoritativo): ¿hay algún turno SOLAPADO en tiempo en
    -- CUALQUIER agenda HERMANA (que comparta ≥1 espacio del set) excluyendo la propia agenda? El
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
        AND other.space_id = ANY (v_space_ids)                                              -- comparte ≥1 espacio
        AND tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
            && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration))  -- solape de tiempo
    ) THEN
      -- Reusar slot_taken (NO space_taken). El caller lo capta por `message` (P0001) en booking-core.
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 2/3/4. (062) Gate de cupo + asiento + is_group, BIFURCADOS por modo. Todo corre DESPUÉS del
  --        advisory lock: nunca se decide disponibilidad con un count suelto (TOCTOU).
  IF v_mode = 'simultaneous_resource' THEN
    -- (063, CR-02) Gate de EXCLUSIÓN POR AGENDA, PRIMERO y fail-closed. Con capacity > 1 la fila nace
    -- is_group = true y sale del EXCLUDE gist 013 (041: `AND NOT is_group`), el gate de abajo filtra
    -- por el MISMO service_id y el re-check JS se saltea con autoAssign ⇒ sin este bloque NADIE impide
    -- montar un turno simultáneo sobre un turno de OTRO servicio de la misma agenda (doble-booking).
    -- Los solapes del PROPIO servicio son legales hasta el cupo (los gatea el count de abajo); el
    -- cruce con otro servicio se RECHAZA. Hacerlo configurable por el dueño es un follow-up: el
    -- default debe bloquear. Bucket byte-idéntico al índice 011, holds VIGENTES, business_id explícito.
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
      -- slot_taken (NO slot_full): no es cupo lleno del recurso, es la agenda ocupada por otra cosa.
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;

    -- Recurso simultáneo (D-02/D-03): cupo de services.capacity contado por SOLAPE, compitiendo SOLO
    -- contra turnos del MISMO service_id (carriles independientes, D-04). Predicado tsrange &&
    -- canónico (idéntico al EXCLUDE 013 y al bloque de espacio de 042). business_id EXPLÍCITO.
    -- (063, CR-01) Guarda de holds VIGENTES: un `pending_payment` con la seña vencida NO ocupa. No se
    -- puede delegar al core como hace la rama grupal (el core solo libera los holds de SU bucket y
    -- este carril cuenta a través de TODAS las agendas) ⇒ daba `slot_full` falso hasta el cron diario.
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
      RAISE EXCEPTION 'slot_full' USING ERRCODE = 'P0001';
    END IF;

    -- El ASIENTO sigue atado al slot EXACTO (D-05): el índice 011 exige unicidad dentro del mismo
    -- date+time. El solape es el GATE del cupo, nunca el criterio del asiento.
    SELECT count(*) INTO v_occupied
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
      AND a.date = p_date AND a.time = p_time
      AND a.status IN ('confirmed', 'pending_payment');
    v_seat := v_occupied;

    -- LANDMINE: el EXCLUDE gist 013 solo aplica a is_group = false. Un recurso de cupo > 1 DEBE nacer
    -- is_group = true o el 2º turno solapado chocaría (23P01) y el recurso nunca se llenaría. Con cupo
    -- 1 queda false a propósito: el EXCLUDE actúa de respaldo redundante con el gate por solape.
    v_is_group := (v_svc_cap > 1);
  ELSE
    -- (068) individual + group_class: cupo por HORA DE INICIO EXACTA. La rama cubre DOS modos
    -- declarables (no "el default"): comparten eje de conteo y tratamiento del asiento, y desde la 068
    -- los dos sacan el número del MISMO lugar (services.capacity).
    -- ⚠ CAMBIO DE RÉGIMEN frente al EXCLUDE gist 013: `individual` ⇒ cupo 1 ⇒ seat fijo en 0 (23505
    -- en la 2ª del slot exacto) e is_group = false ⇒ la fila VUELVE A ENTRAR al EXCLUDE 013, que es el
    -- que rechaza el solape de duración variable. Con cupo >= 2 nace is_group = true y sale del gist a
    -- propósito (un EXCLUDE no puede expresar "hasta N"): ahí el anti-solape lo impone esta función,
    -- bajo el lock de negocio-día.
    --
    -- (064, CR2-01 — eje INVERSO / 069, CR-01) Gate ESPEJO del gate cross-servicio de la rama
    -- simultánea: es lo ÚNICO que puede frenar un solape cross-servicio cuando al menos una de las dos
    -- filas está FUERA del EXCLUDE gist 013.
    -- ⚠ (069) EL PREDICADO PASÓ DE MIRAR EL MODO A MIRAR EL CUPO. Hasta la 068 exigía que la fila
    -- PREEXISTENTE fuera de un servicio 'simultaneous_resource', y eso dejaba entrar una clase grupal
    -- ENCIMA de un turno individual confirmado de la misma agenda (declarable recién desde la 068;
    -- reproducido contra el Postgres local). Ahora:
    --   (a) `a.is_group = true OR v_svc_cap > 1` — alguno de los dos lados salió del gist. Si ninguno
    --       salió (individual ↔ individual) este gate NO dispara A PROPÓSITO: el rechazo lo sigue
    --       dando el EXCLUDE 013 con 23P01 (invariante asertado por SQLSTATE en `no-drift (a)`).
    --   (b) EXCEPCIÓN de D-07, escrita por lo que es: dos servicios GRUPALES DISTINTOS con cupo >= 2
    --       pueden coexistir solapados (es lo que "cupo N" significa). Se exigen los DOS
    --       (`capacity_mode = 'group_class' AND capacity >= 2`): un allow-list por cupo a secas
    --       también exceptuaría a los RECURSOS SIMULTÁNEOS —cupo >= 2 por CHECK— y reabriría lo que
    --       cerró la 064. La excepción sólo vale si la fila NUEVA también es un grupal declarado.
    IF EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.business_id = p_business_id
        AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
        AND a.service_id IS DISTINCT FROM p_service_id
        AND a.date = p_date
        AND a.status IN ('confirmed', 'pending_payment')
        AND (a.status = 'confirmed' OR a.expires_at IS NULL OR a.expires_at > now())
        AND (a.is_group = true OR v_svc_cap > 1)   -- (a) alguno de los dos lados está fuera del gist
        AND NOT (                                  -- (b) excepción D-07: grupal declarado ↔ grupal declarado
              v_svc_cap > 1
              AND EXISTS (
                    SELECT 1 FROM services s2
                    WHERE s2.id = a.service_id
                      AND s2.business_id = p_business_id
                      AND s2.capacity_mode = 'group_class'
                      AND s2.capacity >= 2
                  )
            )
        AND tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
            && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration))
    ) THEN
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;

    -- 2. (068, CUPO-07) El cupo sale del SERVICIO. Acá vivía la consulta que lo resolvía con un MAX
    --    sobre el BLOQUE de agenda; se borró entera. El número ya se leyó en el paso 0, ANTES del lock,
    --    porque es configuración y no compite en la carrera. Se conserva `v_capacity` como variable
    --    (en vez de usar v_svc_cap en línea) para dejar byte-idénticas las dos líneas que la consumen.
    v_capacity := v_svc_cap;

    -- 3. Ocupantes actuales del slot exacto (mismo bucket, mismo date+time, estados que ocupan).
    --    Los holds vencidos ya los liberó el core ANTES del RPC, así que el count está limpio.
    SELECT count(*) INTO v_occupied
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
      AND a.date = p_date AND a.time = p_time
      AND a.status IN ('confirmed', 'pending_payment');

    -- 4. Asignación de asiento + cero regresión cupo 1 (CONC-02). Sin cambio respecto de 041.
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

ALTER FUNCTION "public"."book_slot_atomic"("p_business_id" "uuid", "p_professional_id" "uuid", "p_service_id" "uuid", "p_location_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_duration" integer, "p_client_id" "uuid", "p_client_name" "text", "p_client_phone" "text", "p_client_email" "text", "p_notes" "text", "p_status" "text", "p_expires_at" timestamp with time zone) OWNER TO "postgres";

COMMIT;

-- ── Recargar el schema cache de PostgREST (obligatorio tras DDL) ─────────────────────────────────
NOTIFY pgrst, 'reload schema';
