-- 064 — Serialización del gate cross-servicio + espejo en la rama grupal + rechazo simultáneo×espacio.
--       (correcciones de la 2ª ronda de code-review de Phase 12: CR2-01 + gaps 2 y 3)
--
-- Contexto (motor-reservas / Phase 12 — code-review 2, CR2-01):
--   La 062 introdujo `services.capacity_mode = 'simultaneous_resource'` (cupo por SOLAPE) y la 063
--   agregó el gate cross-servicio. AMBAS están APLICADAS A MANO EN PRODUCCIÓN ⇒ son historia
--   inmutable: NO se editan. Esta migración las SUPERSEDE redefiniendo `book_slot_atomic` in-place.
--   El cuerpo arranca del de la 063 y aplica los cambios encima; todo lo demás queda BYTE-IDÉNTICO.
--
-- ── LA CAUSA RAÍZ (leer esto antes de tocar los locks) ─────────────────────────────────────────
--   `is_group` hace DOBLE TRABAJO: significa a la vez "cupo > 1, varias filas pueden compartir el
--   slot exacto" Y "exenta del EXCLUDE gist 013 (041: `... AND NOT is_group`)". Un RECURSO
--   SIMULTÁNEO necesita lo primero pero NO lo segundo, y un EXCLUDE no puede expresar "hasta N".
--   Consecuencia: el invariante anti-solape de esas filas hay que imponerlo DENTRO de la función —
--   y para eso el lock tiene que cubrir EL EJE DEL INVARIANTE.
--
--   El eje del invariante es AGENDA-DÍA (mismo bucket, misma fecha, intervalos que se pisan). Los
--   locks de la 063 eran INSTANTE (business+date+time) y SERVICIO-DÍA (business+service+date):
--   NINGUNO es el eje agenda-día, así que el gate cross-servicio de la 063 quedaba como un SELECT
--   sin serializar (TOCTOU), justo lo que la propia función declara que nunca hace:
--
--     R1 "Consulta" (group_class, cupo 1)      pro P, 16:00-16:30  → lock hash(B+date+'16:00')
--     R2 "Camilla"  (simultaneous, capacity 2) pro P, 16:10-16:40  → hash(B+camilla+date) + hash(B+date+'16:10')
--     Intersección de locks: CERO ⇒ R2 no ve la fila sin commitear de R1 ⇒ pasa el gate.
--     R2 nace is_group=true ⇒ FUERA del EXCLUDE 013; el índice único 011 no choca (`time` distinto).
--     Ambas commitean ⇒ dos turnos SOLAPADOS en una misma agenda. Doble-booking real.
--
-- ── QUÉ CORRIGE ────────────────────────────────────────────────────────────────────────────────
--
--   (CR2-01, 1/2) UN SOLO advisory lock de NEGOCIO-DÍA: hash(business_id + date), en los DOS modos.
--       Reemplaza a los DOS locks de la 063 (servicio-día + instante) y los SUBSUME:
--         · es ESTRICTAMENTE MÁS GRUESO que el de instante de 058 (§GA1) — business+date es un
--           prefijo de business+date+time — así que TODA garantía de 058 se preserva por
--           construcción: `v_seat` y la selección de candidato de "cualquiera" siguen viendo un
--           estado consistente de todo el instante (y ahora de todo el día);
--         · es más grueso que el servicio-día de la 062 (que sí serializaba las escalonadas del
--           MISMO servicio) porque ya no discrimina por servicio;
--         · cubre el EJE AGENDA-DÍA, que es lo único que hace autoritativos los dos gates
--           cross-servicio (el bucket no se conoce hasta después de resolver "cualquiera", pero
--           business_id + date SÍ se conocen de entrada — que es exactamente por lo que 058 no
--           podía usar agenda-día).
--       Al ser UN solo lock en esta clase, el orden de adquisición y el riesgo de deadlock
--       DESAPARECEN sobre este eje. Los locks por ESPACIO (042) siguen DESPUÉS, en orden ascendente
--       ⇒ orden global fijo negocio-día → espacios(asc) ⇒ deadlock-free (40P01 imposible por acá).
--
--       COSTO ACEPTADO Y APROBADO EXPLÍCITAMENTE (no lo "optimices" de nuevo a algo más fino):
--       todas las reservas de UN negocio en UNA fecha se serializan entre sí. Cada transacción del
--       RPC se midió en 15-18 ms y el lock es POR TENANT (la key incluye business_id) ⇒ cero
--       impacto cross-tenant. Volver a un lock más fino (instante, servicio-día, agenda-día por
--       bucket) REABRE CR2-01: con "cualquiera" el bucket todavía no existe cuando hay que tomarlo.
--
--   (CR2-01, 2/2 — gap del eje INVERSO) Gate ESPEJO en la rama `group_class`. Hasta ahora el eje
--       inverso no tenía NINGÚN gate: una fila is_group=true de un recurso simultáneo es invisible
--       para el EXCLUDE 013, así que un turno grupal/individual se le podía montar encima — y con
--       `time_blocks.capacity > 1` entraba incluso SIN concurrencia (el re-check JS tampoco lo
--       frena: `rejectEarly = taken && slotCapacity <= 1` → false).
--
--       ALCANCE DELIBERADAMENTE ACOTADO (divergencia consciente del snippet literal del review):
--       el espejo exige que la fila preexistente sea `is_group = true` Y que SU servicio esté en
--       modo `simultaneous_resource`. El predicado del review no llevaba esa 2ª condición, y sin
--       ella se ROMPE un caso que hoy funciona: `time_blocks.capacity` es del BLOQUE (business +
--       day_of_week + ventana), NO del servicio, así que en un negocio con un bloque de cupo 3
--       TODOS sus servicios son grupales y sus filas nacen is_group=true. Dos servicios distintos
--       en el mismo slot de ese bloque (Corte 10:00 + Color 10:00, mismo profesional) son LEGALES
--       hoy — es lo que "cupo 3" significa. Bloquearlos sería drift de `group_class`, que el
--       objetivo de esta ronda prohíbe explícitamente. Con la condición de modo, el espejo dispara
--       SOLO contra filas que se fueron del gist 013 por la feature nueva ⇒ cero drift para todo
--       negocio sin servicios simultáneos (o sea: el 100% de las filas existentes, porque
--       capacity_mode nace en 'group_class').
--       Con `capacity = 1` en el bloque la fila propia nace is_group=false y el EXCLUDE 013 ya
--       rechazaba el solape ⇒ el espejo es redundante-pero-consistente ahí (probado por test).
--       Nota (WR-04, fuera de alcance): si el dueño cambia el modo de un servicio DESPUÉS de tener
--       turnos, las filas viejas quedan con el is_group de su momento; ese desalineo es el defecto
--       ya documentado en WR-04 y no se resuelve acá.
--
--   (gap 3) RECHAZO EXPLÍCITO de `simultaneous_resource` con cupo > 1 sobre una agenda que tiene
--       ESPACIO físico mapeado (`agenda_spaces`). Un "espacio" es una sala/cancha física compartida
--       entre agendas y `appointment_spaces_no_overlap` impone UN turno por espacio a la vez, o sea
--       CAPACIDAD 1. Un recurso de cupo ≥ 2 sobre ese mismo espacio físico es una CONTRADICCIÓN
--       SEMÁNTICA, no una incompatibilidad técnica a parchear: NO se le agrega un `WHERE NOT
--       is_group` al EXCLUDE de `appointment_spaces` (eso borraría en silencio el invariante de
--       espacio compartido de v0.12). Hoy la combinación falla SOLA y MAL: el 1er turno entra, el
--       2º muere con 23P01 → `slot_taken` mientras `availability` publicaba el horario como libre.
--       Se rechaza de entrada con un código PROPIO (`simultaneous_space_conflict`) para no
--       confundirlo con `slot_taken`/`slot_full`, y el panel deja de ofrecer el modo para servicios
--       cuyas agendas tengan espacios (ver settings-client.tsx).
--
-- Qué NO hace (invariantes del proyecto):
--   - NO edita la 062 ni la 063 (ambas ya aplicadas a mano en prod).
--   - NO cambia la firma del RPC: mismos 14 params + RETURNS TABLE (id, cancel_token) BYTE-idénticos
--     a 041/042/058/062/063 → CREATE OR REPLACE puro, SIN DROP FUNCTION (cambiar params o el RETURNS
--     obliga a recrearla y rompería los 4 callers que entran por createAppointmentCore: booking
--     público, alta manual del panel, generación forward de abonos y canchas).
--   - NO toca columnas, CHECKs, vistas, índices, el EXCLUDE 013, el EXCLUDE de appointment_spaces ni
--     ninguna policy RLS: esta migración solo redefine la función.
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado + 040..064 en orden. Prod se aplica A MANO coordinado con el
--     deploy + `NOTIFY pgrst, 'reload schema';`. Tras aplicar, regenerar `supabase/schema.sql`.

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
  -- (062) modo de cupo del SERVICIO: 'group_class' (default histórico) | 'simultaneous_resource'.
  v_mode text;
  -- (062) cupo N del recurso simultáneo (services.capacity). Lo lee SOLO la rama simultánea.
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
  -- 0. (062, D-07) Modo de cupo del servicio. Se lee ANTES del lock a propósito: es CONFIGURACIÓN del
  --    negocio (no compite en la carrera de reservas), así que no necesita serializarse. Filtro por
  --    business_id EXPLÍCITO: adentro de un SECURITY DEFINER la RLS no aplica, así que un p_service_id
  --    de otro tenant NO debe resolver a nada. COALESCE final = fail-safe al modo histórico si el
  --    servicio no resolviera.
  SELECT s.capacity_mode, COALESCE(s.capacity, 1)
    INTO v_mode, v_svc_cap
  FROM services s
  WHERE s.id = p_service_id
    AND s.business_id = p_business_id;
  v_mode := COALESCE(v_mode, 'group_class');
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
  --    COSTO ACEPTADO Y APROBADO (leer el header antes de "optimizar"): todas las reservas de UN
  --    negocio en UNA fecha se serializan. Transacción medida en 15-18 ms; la key lleva business_id
  --    ⇒ per-tenant, sin impacto cross-tenant. Cualquier lock más fino REABRE CR2-01.
  --
  --    ORDEN GLOBAL: negocio-día (acá) → espacios (042, ascendente, paso 1b). Idéntico en TODA
  --    transacción del sistema ⇒ sin adquisición cruzada ⇒ deadlock-free (40P01 imposible por acá).
  --    hashtextextended → bigint (forma de un argumento, seed 0).
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || p_date::text, 0));

  -- 2. (058, §GA2 / D-01/D-02/D-03/D-07/D-08/D-10) Selección del profesional "cualquiera" BAJO el lock.
  --    Solo si el caller pidió "cualquiera". La selección corre DESPUÉS del lock (Pitfall 2: correrla
  --    antes reintroduce la carrera) y ANTES del bloque de espacio (que necesita el pro elegido).
  --    (064) SIN CAMBIO respecto de 058/062/063: el lock nuevo es más grueso que el de 058, así que
  --    esta selección sigue corriendo serializada contra todo el instante (y ahora contra todo el día).
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
  --     (064) SIN CAMBIO: los locks de espacio siguen tomándose DESPUÉS del lock de slot.
  SELECT array_agg(asp.space_id ORDER BY asp.space_id) INTO v_space_ids   -- ORDEN ASCENDENTE (anti-deadlock)
  FROM agenda_spaces asp
  WHERE asp.business_id = p_business_id
    AND asp.professional_id = v_effective_pro;

  -- (064, gap 3) RECURSO SIMULTÁNEO cupo > 1 + agenda con ESPACIO mapeado ⇒ RECHAZO EXPLÍCITO.
  --   Un espacio es una sala/cancha FÍSICA compartida entre agendas, y appointment_spaces_no_overlap
  --   (042) impone un turno por espacio a la vez: capacidad 1. Un recurso de cupo ≥ 2 sobre ese mismo
  --   espacio es una contradicción semántica, no un bug a parchear relajando el EXCLUDE (relajarlo
  --   borraría el invariante de espacio compartido de v0.12). Antes de este rechazo la combinación
  --   fallaba sola y MAL: el 1er turno entraba y el 2º moría con 23P01 → `slot_taken`, mientras
  --   `availability` seguía publicando el horario como libre. Código de error PROPIO para no
  --   confundirlo con slot_taken/slot_full (booking-core lo mapea a `simultaneous_space_conflict`).
  --   Con cupo 1 NO aplica: la fila nace is_group=false, entra al EXCLUDE 013 y el espacio funciona
  --   como siempre (canchas / F11) ⇒ cero regresión del camino v0.12.
  --   No necesita lock (es configuración, igual que la lectura del paso 0), y va ANTES de tomar los
  --   locks de espacio para no serializar de gratis a una transacción que va a abortar.
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

  -- 2/3/4. (062) Gate de cupo + asiento + is_group, BIFURCADOS por modo. Todo lo de acá abajo corre
  --        DESPUÉS del advisory lock de negocio-día: nunca se decide disponibilidad con un count
  --        suelto (TOCTOU). (064) Ahora eso vale de verdad también para los gates cross-servicio: el
  --        lock cubre el eje agenda-día sobre el que deciden.
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
    -- (064, CR2-01) Este EXISTS es AUTORITATIVO recién ahora: corre bajo el lock de negocio-día, que
    -- es el único que cubre su eje (agenda-día). Antes era un SELECT sin serializar.
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
    -- ── Clase grupal (default): cupo por HORA DE INICIO EXACTA ────────────────────────────────
    --
    -- (064, CR2-01 — eje INVERSO) Gate ESPEJO del gate cross-servicio de la rama simultánea. Sin él
    -- este eje no tenía NINGÚN chequeo: una fila `is_group = true` de un RECURSO SIMULTÁNEO está
    -- FUERA del EXCLUDE gist 013 (041: `... AND NOT is_group`), así que un turno grupal/individual se
    -- le podía montar encima — y con `time_blocks.capacity > 1` entraba incluso SIN concurrencia (el
    -- re-check JS tampoco frena: `rejectEarly = taken && slotCapacity <= 1` → false). Bajo
    -- concurrencia entraba también con capacity = 1.
    --
    -- ALCANCE ACOTADO A PROPÓSITO (divergencia consciente del snippet del review): además de
    -- `is_group = true` + servicio DISTINTO + solape, se exige que el servicio de la fila
    -- preexistente esté en modo `simultaneous_resource`. Sin esa 2ª condición se rompe un caso que
    -- HOY funciona: `time_blocks.capacity` es del BLOQUE (business + day_of_week + ventana), NO del
    -- servicio, así que en un negocio con un bloque de cupo 3 TODAS sus filas nacen is_group=true y
    -- dos servicios distintos en el mismo slot (Corte 10:00 + Color 10:00, mismo profesional) son
    -- legales — es lo que "cupo 3" significa. Bloquearlos sería DRIFT de `group_class`, prohibido.
    -- Con la condición de modo el espejo dispara SOLO contra filas que se fueron del gist por la
    -- feature nueva ⇒ cero drift para todo negocio sin servicios simultáneos (o sea, para el 100% de
    -- las filas existentes: capacity_mode nace en 'group_class').
    --
    -- Con `capacity = 1` en el bloque la fila PROPIA nace is_group=false y el EXCLUDE 013 ya rechaza
    -- el solape: ahí este gate es redundante-pero-consistente (y es lo que cubre el caso concurrente,
    -- donde la fila ajena is_group=true nunca cruza el gist con la propia is_group=false).
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
        AND EXISTS (                     -- ...y se fueron por la feature nueva, no por cupo grupal
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

    -- 2. Capacity del bloque que cubre este slot (plantilla semanal: day_of_week + ventana).
    --    Si no hay bloque que lo cubra, default 1 (comportamiento individual). EXTRACT(dow) usa la
    --    misma convención que time_blocks.day_of_week (0=domingo..6=sábado).
    SELECT COALESCE(MAX(tb.capacity), 1) INTO v_capacity
    FROM time_blocks tb
    WHERE tb.business_id = p_business_id
      AND tb.day_of_week = EXTRACT(dow FROM p_date)
      AND p_time >= tb.start_time AND p_time < tb.end_time;

    -- 3. Ocupantes actuales del slot exacto (mismo bucket, mismo date+time, estados que ocupan).
    --    Los holds vencidos ya los liberó el core ANTES del RPC, así que el count está limpio.
    SELECT count(*) INTO v_occupied
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
      AND a.date = p_date AND a.time = p_time
      AND a.status IN ('confirmed', 'pending_payment');

    -- 4. Asignación de asiento + cero regresión cupo 1 (CONC-02). Sin cambio respecto de 041/042/058.
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
-- igual que 041/042/058/062/063): anon (caso anon-key), authenticated (alta manual anon+RLS),
-- service_role (booking público).
GRANT EXECUTE ON FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) TO "anon", "authenticated", "service_role";

-- ── Recargar el schema cache de PostgREST (obligatorio tras DDL) ───────────────────────────────────
NOTIFY pgrst, 'reload schema';
