-- 069 — Las protecciones de "cupo > 1" dejan de mirar el MODO y pasan a mirar el CUPO
--       (motor-reservas / Phase 15 — correcciones CR-01 y CR-03 del code-review, v0.27).
--
-- ── EL DIAGNÓSTICO, EN UNA FRASE ────────────────────────────────────────────────────────────────
--   La 068 volvió DECLARABLE `group_class` con `capacity >= 2` por primera vez —hasta ahí el cupo
--   grupal salía de `time_blocks.capacity`, que en el 100 % de producción valía 1, así que un grupal
--   REAL era inalcanzable— pero NINGUNA de las protecciones que la 064 construyó para "cupo > 1" lo
--   acompañó: las dos que viven en este RPC filtran por `capacity_mode = 'simultaneous_resource'`
--   LITERAL. Desde la 068 el dueño declara un grupal con dos clicks y aparecen dos agujeros que se
--   REPRODUJERON contra el Postgres local, no se dedujeron:
--
--     (CR-01) una clase grupal se reserva ENCIMA de un turno confirmado de otro servicio en la misma
--             agenda, sin un solo error. `is_group = true` saca la fila del EXCLUDE gist 013
--             (041: `... AND NOT is_group`) y el gate espejo —lo único que podía frenar el solape
--             cross-servicio de una fila exenta— exigía que la PREEXISTENTE fuera de un simultáneo.
--             Un turno `individual` no cumple ese predicado ⇒ nada la frena.
--             Repro: individual 10:00 OK · grupal 10:00 OK (montado encima) · grupal 10:15 OK.
--
--     (CR-03) una clase grupal sobre una agenda con ESPACIO físico mapeado entra la 1ª vez y muere en
--             la 2ª con 23P01 (`appointment_spaces_no_overlap`) → el core lo traduce a `slot_taken`.
--             Es EXACTAMENTE la mentira ("horario ocupado" en vez de "configuración imposible") que
--             la 064 (gap 3) vino a eliminar, sobrevivida porque su rechazo pedía el modo simultáneo.
--             Repro: grupal 16:00 OK · grupal 16:00 ERROR 23P01.
--
-- ── POR QUÉ EL CRITERIO NUEVO NO ES "capacity >= 2" A SECAS (medido, no supuesto) ────────────────
--   El snippet del review proponía reemplazar `capacity_mode = 'simultaneous_resource'` por
--   `s2.capacity >= 2` en el gate espejo. Aplicado LITERAL eso REABRE lo que la 064 cerró: con el
--   CHECK de coherencia de la 068, `capacity >= 2` ⟺ `capacity_mode <> 'individual'`, o sea que una
--   fila de un RECURSO SIMULTÁNEO también cumple `capacity >= 2` y quedaría EXENTA del gate. Control
--   negativo corrido contra el local ANTES de tocar nada: simultáneo 11:00 OK · grupal 11:10 →
--   `slot_taken` (o sea: HOY está protegido, y un allow-list por cupo lo desprotegería).
--
--   El recorte que hay que preservar es el de D-07, y es NOMINAL, no numérico: lo legal es
--   GRUPAL↔GRUPAL —dos servicios `group_class` distintos, cada uno con cupo >= 2, coexistiendo
--   solapados en la misma agenda, que es lo que "cupo N" significa—. Todo lo demás que se pise en la
--   MISMA agenda es doble-booking. Por eso la excepción se escribe con el modo Y el cupo
--   (`capacity_mode = 'group_class' AND capacity >= 2`) y no con uno solo de los dos: el gate no
--   depende del CHECK de la 068 para ser correcto (mismo criterio que la 064 usó en el gap 3).
--
-- ── QUÉ CAMBIA (dos cambios quirúrgicos sobre el cuerpo de la 068) ──────────────────────────────
--
--   (1) GATE ESPEJO de la rama no-simultánea (CR-01). Pasa de "rechazá el solape contra filas
--       is_group de un SIMULTÁNEO" a "rechazá el solape cross-servicio de todo par que el EXCLUDE 013
--       NO puede ver, salvo la excepción grupal↔grupal":
--
--         AND (a.is_group = true OR v_svc_cap > 1)   ⇐ al menos UNO de los dos lados está fuera del gist
--         AND NOT ( v_svc_cap > 1 AND <la preexistente es un group_class de cupo >= 2> )
--
--       La 1ª condición es lo que deja INTACTO el camino individual↔individual: ahí las dos filas
--       nacen `is_group = false`, las dos están DENTRO del gist y el rechazo lo sigue dando el gist
--       con 23P01 —no este gate con P0001—, que es el invariante que el test `no-drift (a)` asierta
--       por SQLSTATE crudo. La 2ª es el recorte de D-07, ahora escrito por lo que realmente es.
--
--       Tabla de verdad completa (fila NUEVA vs fila PREEXISTENTE de OTRO servicio, misma agenda,
--       solapadas), con el resultado ANTES → DESPUÉS y quién lo decide:
--         individual ↔ individual  : 23P01 (gist)      → 23P01 (gist)        [sin cambio]
--         individual ↔ simultáneo  : slot_taken (gate) → slot_taken (gate)   [sin cambio, 064]
--         individual ↔ grupal      : ENTRABA            → slot_taken (gate)   [CR-01, eje inverso]
--         grupal     ↔ individual  : ENTRABA            → slot_taken (gate)   [CR-01, el repro]
--         grupal     ↔ simultáneo  : slot_taken (gate) → slot_taken (gate)   [sin cambio, 064]
--         grupal     ↔ grupal      : ENTRA              → ENTRA               [D-07, LEGAL]
--
--       El eje inverso (individual montándose sobre una clase) se cierra en el mismo movimiento y no
--       es alcance de más: es el MISMO mecanismo (la fila grupal está fuera del gist) y ya estaba
--       cerrado en las otras dos capas —el re-check JS del core rechaza con `taken` y el read-path lo
--       manda a `busy`—, así que la base era la única que decía que sí. Dejarlo abierto habría dejado
--       write-path y read-path en desacuerdo, que es la falla que este review vino a corregir.
--
--   (2) RECHAZO `simultaneous_space_conflict` (CR-03). Deja de exigir el modo: la contradicción es
--       "cupo > 1 sobre un espacio que es 1-a-la-vez", y el modo no la cambia. Cupo 1 sigue SIN
--       aplicar (la fila nace is_group=false, entra al EXCLUDE 013 y el espacio funciona como en
--       v0.12) ⇒ CERO regresión del camino canchas/F11, verificado con un control negativo
--       (individual + espacio mapeado ⇒ ENTRA, antes y después).
--       El NOMBRE del código de error NO se cambia (sigue `simultaneous_space_conflict`): renombrarlo
--       obliga a tocar el union de `booking-core`, el mapa de copy del panel y cuatro tests, todo para
--       un string que el público nunca ve. La copy del panel sí se reescribe a algo neutro.
--
-- ── QUÉ NO CAMBIA (inventario explícito, molde de cada redefinición de esta función) ────────────
--   · la FIRMA: los 14 params + `RETURNS TABLE (id, cancel_token)` byte-idénticos a
--     041/042/058/062/063/064/068, y `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`
--     ⇒ `CREATE OR REPLACE` PURO, SIN `DROP FUNCTION` (dropearla rompería los 4 callers que entran
--     por `createAppointmentCore`: booking público, alta manual, forward de abonos y canchas);
--   · el ÚNICO advisory lock de NEGOCIO-DÍA (064, CR2-01) y el orden global respecto de los locks por
--     espacio ⇒ EL EJE DE SERIALIZACIÓN NO SE TOCA;
--   · la selección del profesional "cualquiera" (058) y el recomputo del bucket;
--   · el bloque de espacio (042) y su EXISTS cross-agenda;
--   · TODA la rama simultánea (gate por agenda, count por solape, asiento, derivación de is_group);
--   · el cupo por hora de inicio exacta de la rama no-simultánea y el `INSERT ... RETURNING`;
--   · NINGUNA columna, CHECK, vista, índice, policy RLS ni el EXCLUDE 013.
--
--   Lo que este archivo NO arregla, y queda ESCRITO para que no se lea como olvido:
--   · "Cualquiera" + cupo > 1 (CR-02) se cierra en la capa de aplicación (booking-core, availability
--     y el selector público), con el mismo código `any_professional_unsupported` que ya existía para
--     el simultáneo. Hacer capacity-aware la selección de candidatos del RPC es un cambio de
--     COMPORTAMIENTO (soportar el combo) y no entra en una migración correctiva.
--   · Un grupal que acepta inscripciones a horas de inicio DISTINTAS del MISMO servicio (10:00 y
--     10:15). Es el eje de conteo del modo (`group_class` cuenta por hora exacta) y no es alcanzable
--     desde la grilla pública, que sólo ofrece start-times a paso = duración. Queda anotado.
--
-- ── WR-01: ESTA MIGRACIÓN SÍ ABRE TRANSACCIÓN EXPLÍCITA ─────────────────────────────────────────
--   La 068 afirmaba en su header "la migración ABORTARÍA ENTERA y no quedaría nada aplicado" sin
--   tener `BEGIN;`/`COMMIT;`: esa garantía dependía del cliente (el SQL editor de Supabase envuelve el
--   batch; `psql -f` sin `-1` va statement por statement en autocommit y NO). Acá el archivo se
--   envuelve solo, así que la atomicidad no depende de cómo se lo aplique. El `NOTIFY` va DESPUÉS del
--   COMMIT a propósito (no necesita transacción y su entrega es al commit).
--
-- ── CÓMO SE APLICA ─────────────────────────────────────────────────────────────────────────────
--   NO se aplica vía push remoto. Validación local (PG17):
--     docker exec -i supabase_db_forjo-app psql -U postgres -d postgres \
--       -v ON_ERROR_STOP=1 < supabase/migrations/069_shared_capacity_agenda_and_space_gates.sql
--   Prod se aplica A MANO coordinado con el deploy. Tras aplicar, espejar `supabase/schema.sql`
--   A MANO y de forma QUIRÚRGICA — nunca con `db dump` (decisión del repo desde la Phase 06).
--   Última migración aplicada en prod: 068.

BEGIN;

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
  -- (068) modo de cupo del SERVICIO, de TRES valores:
  --   'individual' (DEFAULT desde la 068) | 'group_class' | 'simultaneous_resource'.
  v_mode text;
  -- (068) cupo N del servicio (services.capacity). Lo leen LOS TRES MODOS: es la fuente ÚNICA del
  -- número desde esa migración.
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
  -- 0. (062, D-07 / 068 CAMBIO 1) Modo y CUPO del servicio. Se leen ANTES del lock a propósito: son
  --    CONFIGURACIÓN del negocio (no compiten en la carrera de reservas). Filtro por business_id
  --    EXPLÍCITO: adentro de un SECURITY DEFINER la RLS no aplica, así que un p_service_id de otro
  --    tenant NO debe resolver a nada. El fail-safe del COALESCE es 'individual' (el camino MÁS
  --    restrictivo: seat fijo en 0, is_group false, la fila adentro del EXCLUDE 013).
  --    (069) SIN CAMBIO.
  SELECT s.capacity_mode, COALESCE(s.capacity, 1)
    INTO v_mode, v_svc_cap
  FROM services s
  WHERE s.id = p_service_id
    AND s.business_id = p_business_id;
  v_mode := COALESCE(v_mode, 'individual');
  v_svc_cap := COALESCE(v_svc_cap, 1);

  -- 1. (064, CR2-01) UN ÚNICO advisory lock de NEGOCIO-DÍA — en los DOS modos, sin condicionales.
  --
  --    El EJE del invariante que hay que serializar es AGENDA-DÍA: los gates cross-servicio (el de la
  --    rama simultánea y su espejo en la no-simultánea) deciden sobre TODA la agenda del día, porque
  --    los intervalos ESCALONADOS se pisan sin compartir `time` y porque las filas is_group = true
  --    están FUERA del EXCLUDE gist 013 (041) ⇒ sin este lock esos gates son un count suelto (TOCTOU)
  --    y el doble-booking cross-servicio entra bajo concurrencia (CR2-01).
  --
  --    ¿Por qué NEGOCIO-día y no AGENDA-día? Porque el bucket todavía NO existe acá: si el caller
  --    pidió "cualquiera" (058), el profesional se elige recién en el paso 2. business_id + date, en
  --    cambio, se conocen de entrada. Es el motivo por el que 058 no podía usar agenda-día.
  --
  --    COSTO ACEPTADO Y APROBADO (leer el header de la 064 antes de "optimizar"): todas las reservas
  --    de UN negocio en UNA fecha se serializan. Transacción medida en 15-18 ms; la key lleva
  --    business_id ⇒ per-tenant. Cualquier lock más fino REABRE CR2-01.
  --
  --    ORDEN GLOBAL: negocio-día (acá) → espacios (042, ascendente, paso 1b) ⇒ deadlock-free.
  --    (069) SIN CAMBIO: esta migración NO toca el eje de serialización — y el gate ampliado del paso
  --    2/3/4 sigue corriendo BAJO este lock, que es lo que lo vuelve autoritativo y no un count suelto.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || p_date::text, 0));

  -- 2. (058, §GA2 / D-01/D-02/D-03/D-07/D-08/D-10) Selección del profesional "cualquiera" BAJO el lock.
  --    Solo si el caller pidió "cualquiera". La selección corre DESPUÉS del lock (Pitfall 2) y ANTES
  --    del bloque de espacio (que necesita el pro elegido).
  --    (069) SIN CAMBIO respecto de 058/062/063/064/068. ⚠ ESTA SELECCIÓN NO ES CAPACITY-AWARE:
  --    marca ocupada a CUALQUIER agenda con un solape, así que no sabe usar el 2º lugar de un servicio
  --    de cupo > 1. Por eso el combo "Cualquiera" + cupo > 1 se RECHAZA en la capa de aplicación
  --    (`any_professional_unsupported`, CR-02) en vez de servirse mal desde acá.
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
  --     Resolver el set de espacios de la agenda reservada vía la puente. Se keya por v_effective_pro
  --     (el pro REAL elegido): las agendas sin profesional/sentinela no tienen espacios (Pitfall 1 /
  --     A2). Si la agenda no tiene espacios mapeados, v_space_ids queda NULL → sin lock, sin chequeo.
  --     (069) SIN CAMBIO.
  SELECT array_agg(asp.space_id ORDER BY asp.space_id) INTO v_space_ids   -- ORDEN ASCENDENTE (anti-deadlock)
  FROM agenda_spaces asp
  WHERE asp.business_id = p_business_id
    AND asp.professional_id = v_effective_pro;

  -- (064, gap 3 — AMPLIADO por la 069, CR-03) CUPO > 1 + agenda con ESPACIO físico mapeado ⇒ RECHAZO
  --   EXPLÍCITO, EN LOS DOS MODOS DE CUPO COMPARTIDO.
  --   Un espacio es una sala/cancha FÍSICA compartida entre agendas y `appointment_spaces_no_overlap`
  --   (042) impone UN turno por espacio a la vez, o sea CAPACIDAD 1. Un servicio de cupo >= 2 sobre
  --   ese mismo espacio es una CONTRADICCIÓN SEMÁNTICA, no una incompatibilidad técnica a parchear:
  --   NO se le agrega un `WHERE NOT is_group` al EXCLUDE de `appointment_spaces` (eso borraría en
  --   silencio el invariante de espacio compartido de v0.12).
  --
  --   (069) LA CONDICIÓN DE MODO SE CAE. Hasta la 068 este rechazo exigía
  --   `v_mode = 'simultaneous_resource'`, lo que dejaba pasar a `group_class` cupo >= 2 —imposible de
  --   declarar antes de la 068, trivial después—: la 1ª inscripción entraba y la 2ª moría con 23P01
  --   → `slot_taken` mientras `availability` publicaba los N lugares. Exactamente la mentira que este
  --   rechazo vino a eliminar. Lo que hace imposible la configuración es el CUPO, no el modo.
  --
  --   Con cupo 1 NO aplica (ni acá ni antes): la fila nace is_group = false, entra al EXCLUDE 013 y el
  --   espacio funciona como siempre ⇒ CERO regresión del camino canchas / F11 de v0.12.
  --   Código de error PROPIO para no confundirlo con slot_taken/slot_full. No necesita lock (es
  --   configuración) y va ANTES de tomar los locks de espacio para no serializar de gratis a una
  --   transacción que va a abortar.
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
    -- CUALQUIER agenda HERMANA (que comparta >=1 espacio del set) excluyendo la propia agenda?
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
  --        suelto (TOCTOU). La bifurcación se mantiene en DOS ramas (068, CAMBIO 3): `individual` y
  --        `group_class` comparten el MISMO eje de conteo (hora de inicio EXACTA) y el mismo
  --        tratamiento del asiento.
  IF v_mode = 'simultaneous_resource' THEN
    -- ── (063, CR-02) Gate de EXCLUSIÓN POR AGENDA — va PRIMERO, fail-closed ────────────────────
    -- El cupo N del recurso NO reemplaza la exclusión por agenda. Con capacity > 1 la fila nace
    -- is_group = true y sale del EXCLUDE gist 013 (041: `... AND NOT is_group`), así que si el cruce
    -- con OTROS servicios no se chequea acá NO lo chequea NADIE: ni el gist, ni el gate de abajo (que
    -- filtra por el MISMO service_id), ni el re-check JS con autoAssign (que se saltea entero).
    --
    -- Semántica: los solapes del PROPIO servicio son legales hasta el cupo (los gatea el count de
    -- abajo); cualquier solape con OTRO servicio del MISMO bucket es doble-booking → slot_taken.
    -- (069) SIN CAMBIO — este lado del espejo YA rechazaba contra CUALQUIER otro servicio (no filtra
    -- por modo ni por cupo de la preexistente). El agujero estaba sólo en el lado no-simultáneo.
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
    -- Compite SOLO contra turnos del MISMO service_id (carriles independientes, D-04). El predicado
    -- tsrange && tsrange es el canónico del motor. business_id EXPLÍCITO.
    -- (063, CR-01) Guarda de holds VIGENTES: los `pending_payment` con la seña ya vencida NO ocupan.
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
      -- El recurso ya está ocupado por `capacity` turnos que pisan este intervalo → cupo lleno.
      RAISE EXCEPTION 'slot_full' USING ERRCODE = 'P0001';
    END IF;

    -- El ASIENTO sigue atado al slot EXACTO (D-05): el índice único 011 es (business, bucket, date,
    -- time, seat), así que el seat solo tiene que ser único DENTRO del mismo date+time. El solape es
    -- el GATE del cupo, nunca el criterio del asiento.
    SELECT count(*) INTO v_occupied
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
      AND a.date = p_date AND a.time = p_time
      AND a.status IN ('confirmed', 'pending_payment');
    v_seat := v_occupied;

    -- LANDMINE: el EXCLUDE gist 013 (041:76) solo aplica a filas con is_group = false. Si un recurso
    -- de cupo > 1 naciera con is_group = false, el 2º turno SOLAPADO del mismo bucket chocaría con el
    -- gist (23P01) y el recurso NUNCA se llenaría.
    v_is_group := (v_svc_cap > 1);
  ELSE
    -- ── individual + group_class: cupo por HORA DE INICIO EXACTA ───────────────────────────────
    --
    -- ⚠ CAMBIO DE RÉGIMEN FRENTE AL EXCLUDE GIST 013 (068), que es lo que hay que tener en la cabeza
    -- para leer el gate de abajo:
    --   · `individual` ⇒ cupo 1 ⇒ `v_seat` fijo en 0 ⇒ la 2ª reserva del slot EXACTO choca con el
    --     índice único 011 (23505 → slot_taken), y la fila nace is_group = false ⇒ está DENTRO del
    --     EXCLUDE 013, que es el que rechaza el solape de DURACIÓN VARIABLE (23P01).
    --   · cupo >= 2 ⇒ la fila nace is_group = true y SALE del gist A PROPÓSITO, porque un EXCLUDE no
    --     puede expresar "hasta N": el invariante anti-solape de esas filas lo impone ESTA función.
    --
    -- ── (069, CR-01) GATE ESPEJO, AHORA POR CUPO Y NO POR MODO ─────────────────────────────────
    -- Este gate es lo ÚNICO que puede frenar un solape cross-servicio cuando al menos una de las dos
    -- filas está FUERA del gist. Hasta la 068 exigía que la fila PREEXISTENTE fuera de un servicio
    -- `simultaneous_resource`, y esa condición dejaba entrar una clase grupal ENCIMA de un turno
    -- individual confirmado de la misma agenda (reproducido contra el Postgres local: individual
    -- 10:00 OK + grupal 10:00 OK + grupal 10:15 OK, tres turnos pisándose sin un solo error).
    --
    -- Predicado nuevo, en dos piezas:
    --   (a) `a.is_group = true OR v_svc_cap > 1` — al menos UNO de los dos lados salió del gist. Si
    --       ninguno salió (individual ↔ individual), este gate NO dispara A PROPÓSITO y el rechazo lo
    --       sigue dando el EXCLUDE 013 con 23P01, que es el invariante que el test `no-drift (a)`
    --       asierta por SQLSTATE crudo. Mover ese rechazo a P0001 sería drift silencioso.
    --   (b) la EXCEPCIÓN de D-07, escrita por lo que es: dos servicios GRUPALES DISTINTOS, cada uno
    --       con cupo >= 2, PUEDEN coexistir solapados en la misma agenda — es lo que "cupo N"
    --       significa. Se exige `capacity_mode = 'group_class' AND capacity >= 2` (los DOS): un
    --       allow-list por cupo a secas también exceptuaría a los RECURSOS SIMULTÁNEOS —que con el
    --       CHECK de la 068 tienen cupo >= 2 por definición— y REABRIRÍA el agujero que cerró la 064.
    --       Control negativo corrido antes del fix: simultáneo 11:00 + grupal 11:10 ⇒ slot_taken.
    --       La excepción sólo aplica cuando la fila NUEVA también es un grupal declarado
    --       (`v_svc_cap > 1` en el NOT): un turno individual montándose sobre una clase NO es
    --       grupal↔grupal y se rechaza, alineando la base con las otras dos capas (el re-check JS ya
    --       lo cortaba con `taken`, y el read-path ya mandaba esa ocupación a `busy`).
    --
    -- Mismos criterios que su espejo: bucket byte-idéntico al 011, holds VIGENTES, tsrange &&
    -- canónico, business_id EXPLÍCITO en las DOS tablas (SECURITY DEFINER ⇒ sin RLS adentro). Y corre
    -- bajo el lock de negocio-día (064), que es lo que lo vuelve autoritativo y no un count suelto.
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
      -- Mismo error que el espejo: la agenda está ocupada por otra cosa, no es cupo lleno.
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;

    -- 2. (068, CUPO-07) El cupo sale del SERVICIO; el número ya se leyó en el paso 0. Se conserva
    --    `v_capacity` como variable para dejar byte-idénticas las dos líneas que la consumen.
    v_capacity := v_svc_cap;

    -- 3. Ocupantes actuales del slot exacto (mismo bucket, mismo date+time, estados que ocupan).
    --    Los holds vencidos ya los liberó el core ANTES del RPC, así que el count está limpio.
    SELECT count(*) INTO v_occupied
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
      AND a.date = p_date AND a.time = p_time
      AND a.status IN ('confirmed', 'pending_payment');

    -- 4. Asignación de asiento + cero regresión cupo 1 (CONC-02). Sin cambio respecto de 041/042/058/064/068.
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
-- igual que 041/042/058/062/063/064/068): anon (caso anon-key), authenticated (alta manual anon+RLS),
-- service_role (booking público).
GRANT EXECUTE ON FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) TO "anon", "authenticated", "service_role";

COMMIT;

-- ── Recargar el schema cache de PostgREST (obligatorio tras DDL) ─────────────────────────────────
NOTIFY pgrst, 'reload schema';
