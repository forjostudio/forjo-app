-- 070 — Los dos gates de servicio dejan de bloquear de más (y uno de ellos deja de bloquear de menos)
--       (motor-reservas / Phase 16 — GATE-01, GATE-02 y GATE-03, v0.27).
--
-- ── POR QUÉ UNA SOLA MIGRACIÓN Y NO TRES (D-01) ─────────────────────────────────────────────────
--   Las tres correcciones viven en el MISMO `IF EXISTS` que comparten `services_block_delete`
--   (migr. 065) y `services_block_mode_change` (migr. 068). Tocarlo tres veces multiplica el riesgo
--   sobre dos funciones que YA están en producción y triplica el trabajo de auditoría. Una sola
--   redefinición, un solo threat model, una sola pasada.
--
-- ── DE DÓNDE SALIÓ CADA CORRECCIÓN ──────────────────────────────────────────────────────────────
--   GATE-01 — UAT de la Phase 15 (`15-UAT.md`), con las palabras del dueño: pasar un servicio de
--             individual a grupal con un turno futuro vivo rebotaba, y no tenía por qué.
--   GATE-02 — residual **R-15-A** de `15-SECURITY.md`: marcar `completed` un turno FUTURO lo sacaba
--             del conteo y abría el gate de modo. Un bypass de un click desde el panel.
--   GATE-03 — gap **G4** de la Phase 13, que se arregló en la UI (`lib/appointment-time.ts`) y NUNCA
--             cruzó al SQL: un turno de HOY a hora ya pasada se ve en "Pasados" y sigue bloqueando.
--
--   Nada de esto se dedujo: el comportamiento vigente quedó MEDIDO caso por caso contra el Postgres
--   local ANTES de escribir una línea de este archivo, y vuelto a medir después con el mismo script
--   (`16-BASELINE-070.md`). Es el estándar del workstream porque ya evitó tres regresiones: el
--   `BEFORE UPDATE` de la 067 (habría roto todas las bajas de abono en producción) y el
--   `capacity >= 2` del review de la 069 (habría reabierto lo que cerró la 064).
--
-- ── (1) GATE-01: EL GATE DE MODO SE RECORTA POR DIRECCIÓN DE ORIGEN ─────────────────────────────
--   `services_block_mode_change` bloquea hoy CUALQUIER transición de modo con turnos futuros vivos.
--   El recorte deja pasar UNA sola dirección, y el criterio es NOMINAL, no numérico:
--
--     IF OLD."capacity_mode" = 'individual' THEN RETURN NEW; END IF;
--
--   Tabla de direcciones, con lo que decide cada una:
--
--     individual  → grupal / simultáneo : PASA.    Las filas que ya existen nacieron `is_group=false`
--                                                  (un turno nace `is_group=true` sólo si el servicio
--                                                  NO era individual al crearse), así que siguen
--                                                  DENTRO del EXCLUDE gist 013 (041: `AND NOT is_group`)
--                                                  Y ADEMÁS se cuentan contra el cupo nuevo. Nada
--                                                  queda huérfano de guards.
--     grupal / simultáneo → individual  : RECHAZA. Esas filas son `is_group=true`: están FUERA del
--                                                  EXCLUDE y el gate espejo deja de cubrirlas. **Acá
--                                                  vive R-1**, el residual de integridad de v0.26.
--     grupal ⇄ simultáneo               : RECHAZA. Cambia el EJE DE CONTEO (hora de inicio exacta ⇄
--                                                  solape de intervalos): un conjunto de turnos hoy
--                                                  legal puede volverse ilegal.
--
--   UN SOLO TURNO FUTURO ALCANZA para abrir el agujero en las dos direcciones peligrosas. No es
--   cuestión de cantidad: es que esa fila queda huérfana de todos los guards. El dueño planteó lo
--   contrario durante la UAT y se evaluó y descartó con este razonamiento (`15-UAT.md`).
--
--   POR QUÉ NOMINAL Y NO `OLD."capacity" <= 1`. Post-068 vale `is_group ⟺ capacity_mode <> 'individual'`
--   —el auditor de la Phase 15 lo PROBÓ, no lo dedujo: el CHECK de coherencia
--   `services_capacity_matches_mode_chk` impide cualquier cambio de solo `capacity` que cruce la
--   frontera 1/2—. Escribirlo por el número sería exactamente el error que el review de la 069
--   propuso en el otro sentido: un criterio numérico que se despega del significado en cuanto el
--   CHECK cambie. El gate no debe depender de un CHECK para ser correcto.
--
--   El guard de no-cambio de la 068 (`IS NOT DISTINCT FROM`) queda INTACTO y sigue yendo PRIMERO:
--   es el que deja pasar los guardados de `saveEditService`, que manda `capacity_mode` en cada
--   payload aunque el dueño no lo haya tocado.
--
-- ── (2) GATE-02: LOS DOS PREDICADOS DIVERGEN, A PROPÓSITO Y ESCRITO ─────────────────────────────
--   Hasta hoy los dos gates usaban el MISMO conjunto de estados, carácter por carácter. Desde acá NO:
--
--     services_block_delete       → a."status" IS NULL OR a."status" NOT IN ('cancelled', 'completed')
--     services_block_mode_change  → a."status" IS NULL OR a."status" <> 'cancelled'
--
--   La divergencia se sostiene con el CRITERIO de cada gate, no con su forma:
--
--     · El gate de BORRADO pregunta "¿queda algo por prestar?". Un turno `completed` YA SE PRESTÓ:
--       es historia, su nombre sobrevive por el snapshot de la 065 (HIST-01..03) y no puede trabar el
--       borrado del servicio. Fue el gap UAT #2 que la Phase 13 arregló; volver a contarlo sería
--       re-romperlo.
--     · El gate de MODO pregunta "¿queda alguna fila cuyo `is_group` quedaría desalineado?". Ahí
--       `completed` NO es una salida legítima: es un botón de un solo click del panel
--       (`appointments-client.tsx`) aplicable a un turno FUTURO, o sea un bypass accesible del gate.
--       Ese es el residual R-15-A, y ésta es la condición de cierre que quedó registrada.
--
--   `cancelled` sigue afuera en LOS DOS: cancelar destruye el compromiso y es la salida documentada
--   que el propio copy del panel le ofrece al dueño.
--
--   ⚠ LOS DOS PREDICADOS YA NO SON INTERCAMBIABLES. Quedan parecidos a propósito y distintos a
--   propósito. Por eso tampoco se extrae una función auxiliar compartida: compartir el predicado
--   justo en la migración que decide separarlo es el peor momento posible. Si alguien los "unifica"
--   más adelante por simetría, reabre R-15-A o re-rompe el gap UAT #2 — uno de los dos, seguro.
--
-- ── (3) GATE-03: FECHA + HORA, EN LOS DOS GATES ────────────────────────────────────────────────
--   El predicado de fecha pasa de `a."date" >= v_today` (solo el día) a:
--
--     a."date" > v_today OR (a."date" = v_today AND a."time" >= v_now_time)
--
--   Tres cosas que hay que dejar por escrito para que nadie las "mejore" después:
--
--     · SE COMPARA CONTRA EL INICIO DEL TURNO, NUNCA CONTRA SU FIN, y no es estilo:
--       `lib/appointment-time.ts::isPastAppointment` —el fix del gap G4 en la UI— hace
--       `hhmmss(appt.time) < hhmmss(now.time)`, o sea compara el inicio. Sumarle la duración
--       reintroduciría la MISMA inconsistencia UI↔base que GATE-03 viene a cerrar, sólo que al revés:
--       un turno de 30 min a las 14:00 sería "pasado" en la UI a las 14:01 y "futuro" en la base
--       hasta las 14:30. Por eso el predicado no menciona la duración del turno.
--     · EL `>=` ES INCLUSIVE en la hora exacta, espejo del `<` estricto de `isPastAppointment`: el
--       turno de la hora exacta todavía no pasó y sigue bloqueando.
--     · NO HAY RAMA DEFENSIVA ANTE NULL para estas dos columnas, y eso está VERIFICADO, no asumido:
--       `appointments.date` y `appointments.time` son NOT NULL. La rama `status IS NULL` SÍ se
--       conserva en los dos gates: `status` sigue siendo nullable y `NOT IN`/`<>` sobre NULL evalúa
--       NULL —ni true ni false—, así que esas filas quedarían fuera del EXISTS y ABRIRÍAN el gate.
--       El repo ya pagó esa trampa dos veces (migr. 065 y el read-path de 13-01).
--
--   `v_now_time` se declara al lado del `v_today` que ya existía y se toma en hora AR (UTC-3 sin DST)
--   por el mismo motivo: a las 22:00 de Buenos Aires el `now()` en UTC ya es el día siguiente.
--   `now()` es estable dentro de la transacción, así que las dos lecturas son del MISMO instante y no
--   hay skew posible entre el día y la hora.
--
--   ⚠ ES UN CAMBIO PERMISIVO, y se evaluó como tal en el threat model (T-16-05, disposición
--   `accept`): el alta manual del panel está EXENTA de la ventana de reserva, así que el dueño puede
--   crear turnos con fecha/hora pasada. El vector completo es autolesión del propio dueño, en su
--   propio tenant, sobre un horario que YA PASÓ — no afecta la disponibilidad futura, no toca otro
--   negocio, y ninguna superficie anónima puede crear turnos en el pasado (el booking público sí
--   respeta la ventana). Reabrir si alguna de esas dos condiciones cambia.
--
-- ── QUÉ NO CAMBIA (inventario explícito, molde de cada redefinición de este repo) ───────────────
--   · La FIRMA de las dos funciones y su `LANGUAGE plpgsql` + definer + `search_path` fijo ⇒
--     `CREATE OR REPLACE` PURO.
--   · LOS TRIGGERS NO SE TOCAN: `CREATE OR REPLACE` conserva el binding de `services_block_delete_trg`
--     y `services_block_mode_change_trg`. Recrearlos sería riesgo gratis, así que este archivo no
--     los dropea ni los vuelve a declarar.
--   · El FILTRO POR TENANT explícito `(OLD."business_id" IS NULL OR a."business_id" = OLD."business_id")`
--     en las DOS: adentro de una función definer la RLS NO aplica, así que es la única defensa que
--     queda dentro. La rama `IS NULL` cubre las filas legacy de `services` sin negocio y cae en
--     fail-closed (cuenta todo).
--   · El guard de cascada de la 065 (y su AUSENCIA deliberada en la 068, que no es un olvido: la FK
--     de `services` es ON DELETE CASCADE, así que una cascada BORRA la fila, nunca la actualiza, y
--     jamás llega a un trigger BEFORE UPDATE).
--   · El bloque de abono activo de la 065, con su `service_has_active_abono`.
--   · LOS DOS CÓDIGOS DE DOMINIO (`service_has_future_appointments` y
--     `service_mode_has_future_appointments`): no se renombran y no se agrega ninguno nuevo. El panel
--     los mapea con `code === 'P0001' && message.includes(...)`, y el copy actual sigue siendo CIERTO
--     después del recorte ⇒ esta fase no toca una sola línea de `.tsx`.
--   · Los `RETURN OLD` / `RETURN NEW` de salida, que son OBLIGATORIOS: una salida nula desde un
--     trigger BEFORE cancela la escritura SIN error — PostgREST respondería 204 y el panel diría
--     "guardado" sin haber guardado (T-14-16). El único camino de rechazo válido es el RAISE.
--   · Ninguna columna, CHECK, vista, índice, policy RLS, ni el EXCLUDE gist 013.
--
-- ── TRANSACCIÓN EXPLÍCITA (D-05) Y RE-CORRIBILIDAD ─────────────────────────────────────────────
--   El archivo se envuelve solo, igual que la 069: la 068 afirmaba en su header que abortaría entera
--   sin tener transacción propia, y esa garantía dependía del cliente (`psql -f` sin `-1` va statement
--   por statement en autocommit). El `NOTIFY` va DESPUÉS del cierre a propósito: no necesita
--   transacción y su entrega es al commit.
--   Al ser `CREATE OR REPLACE` puro, una segunda pasada es un no-op: la re-corribilidad se prueba
--   aplicando el archivo DOS VECES contra el local.
--
-- ── CÓMO SE APLICA ─────────────────────────────────────────────────────────────────────────────
--   ⚠ ESTA MIGRACIÓN **NO** SE APLICA A PRODUCCIÓN DENTRO DE LA FASE (D-08). Se deja el archivo, y
--   el runbook lo escribe el plan 16-02. Aplicarla es decisión del dueño.
--   Nunca por push remoto. Validación local (PG17):
--     docker exec -i supabase_db_forjo-app psql -U postgres -d postgres \
--       -v ON_ERROR_STOP=1 < supabase/migrations/070_service_gates_direction_and_time_precision.sql
--   Prod se aplica A MANO coordinado con el deploy. Tras aplicar, espejar `supabase/schema.sql` A
--   MANO y de forma QUIRÚRGICA — nunca con `db dump` (decisión del repo desde la Phase 06).
--   Última migración aplicada en prod: 069.

BEGIN;

-- ── 1. Gate de BORRADO de servicio (065) — sólo cambia la rama de fecha (GATE-03) ───────────────
-- El guard vive en la BASE, no en el cliente: el DELETE sale de `settings-client` con la sesión del
-- dueño + RLS, y el trigger corre dentro de la MISMA transacción del DELETE. Eso cierra la ventana
-- TOCTOU: si alguien reserva entre el pre-check del modal y el DELETE, el RAISE aborta la transacción
-- ANTES de que la acción referencial ponga ningún `service_id` en NULL (T-13-05). El pre-check del
-- modal (13-03) es UX; esto es la garantía.
CREATE OR REPLACE FUNCTION "public"."services_block_delete"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- "Hoy" en hora de Argentina (UTC-3 sin DST), no en UTC: a las 22:00 de Buenos Aires el `now()`
  -- en UTC ya es el día siguiente y un turno de mañana temprano dejaría de contarse como futuro.
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  -- La HORA de ahora, en la misma zona (GATE-03). `now()` es estable dentro de la transacción, así
  -- que ésta y `v_today` son del MISMO instante: no hay skew posible entre el día y la hora.
  v_now_time time := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::time;
BEGIN
  -- 1.1 GUARD DE CASCADA (crítico). En un `DELETE FROM businesses` la fila padre se borra ANTES de
  -- que corran las acciones referenciales hacia `services`, así que la AUSENCIA del negocio
  -- identifica de forma confiable un borrado en cascada (y no un borrado de servicio del dueño).
  -- Sin este guard, cerrar la cuenta de un negocio con turnos futuros sería literalmente imposible,
  -- y `teardownOneTenant` (test/helpers/booking-fixtures.ts) rompería toda la suite de integración
  -- porque su cleanup borra `businesses` y cascadea a `services` (T-13-07).
  IF OLD."business_id" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b."id" = OLD."business_id") THEN
    RETURN OLD;
  END IF;

  -- 1.2 Turnos futuros TODAVÍA PENDIENTES.
  --
  -- "FUTURO" (GATE-03, lo único que cambia acá): fecha Y HORA en zona AR, comparado contra el INICIO
  -- del turno. Antes miraba SÓLO el día (fecha mayor o igual a hoy), así que un turno de HOY a hora ya
  -- pasada seguía trabando el borrado hasta la medianoche, mientras la UI ya lo mostraba en
  -- "Pasados". Es el gap G4 de la Phase 13 cruzando por fin al SQL: el criterio de
  -- `lib/appointment-time.ts::isPastAppointment` es la fuente de verdad y esto lo replica. El `>=` es
  -- INCLUSIVE (el turno de la hora exacta todavía no pasó) y no se le suma la duración, porque
  -- `isPastAppointment` tampoco lo hace: sumarla desalinearía la base respecto de la UI al revés.
  -- `a."date"` y `a."time"` son NOT NULL: no hay NULL que manejar en esta rama.
  --
  -- "VIVO": dos estados quedan FUERA del conteo porque ya no son una reserva pendiente.
  --   - `cancelled`: contarlo reproduciría la confusión que la Phase 13 vino a arreglar (el dueño
  --     cancela todo, ve la lista vacía, y el borrado sigue trabado).
  --   - `completed`: el turno YA SE PRESTÓ. Es historia, no un compromiso por delante, y su nombre
  --     sobrevive por el snapshot de la 065 (gap UAT #2).
  -- ⚠ ACÁ ESTÁ LA DIVERGENCIA DELIBERADA con `services_block_mode_change`, que desde la 070 excluye
  -- SÓLO `cancelled`. Los dos gates preguntan cosas distintas: éste "¿queda algo por prestar?", el
  -- otro "¿queda alguna fila cuyo `is_group` quedaría desalineado?". NO son intercambiables: si
  -- alguien los unifica por simetría, re-rompe el gap UAT #2 o reabre R-15-A.
  --
  -- La rama `a."status" IS NULL` es OBLIGATORIA y no es defensiva de más: `appointments.status` es
  -- NULLABLE y `NOT IN (...)` sobre NULL evalúa a NULL (ni true ni false), así que esas filas
  -- quedarían fuera del EXISTS y ABRIRÍAN el gate. Un turno sin estado sigue siendo un turno.
  --
  -- El predicado se ancla en `a.service_id = OLD.id` (UUID PK global, no adivinable) y suma el filtro
  -- explícito por tenant, obligatorio porque adentro de una función definer la RLS NO aplica.
  -- `OLD.business_id IS NULL` cubre las filas legacy de `services` sin negocio, para las que el
  -- conteo cae en fail-closed (cuenta todo) en vez de abrir el borrado (T-13-04).
  IF EXISTS (
    SELECT 1
      FROM appointments a
     WHERE a."service_id" = OLD."id"
       AND (OLD."business_id" IS NULL OR a."business_id" = OLD."business_id")
       AND (a."date" > v_today OR (a."date" = v_today AND a."time" >= v_now_time))
       AND (a."status" IS NULL OR a."status" NOT IN ('cancelled', 'completed'))
  ) THEN
    -- Message = código de dominio FIJO, sin nombres, fechas ni conteos: el texto del RAISE llega al
    -- cliente y no debe filtrar datos del negocio (T-13-09). El modal (13-03) lo mapea a su copy.
    -- El nombre NO se toca en esta migración: el copy del panel sigue siendo cierto.
    RAISE EXCEPTION 'service_has_future_appointments' USING ERRCODE = 'P0001';
  END IF;

  -- 1.3 Abono ACTIVO. Un abono activo genera turnos hacia adelante: cuenta como turnos futuros y
  -- dispara el mismo modal. Los archivados (cancelled/completed) ya NO bloquean — su FK pasó a
  -- SET NULL en la 065 y su nombre sobrevive por el snapshot.
  -- Message DISTINTO sobre el mismo ERRCODE P0001 a propósito: es lo que le permite al modal decir
  -- "y un abono activo" en vez de un genérico.
  IF EXISTS (
    SELECT 1
      FROM abonos ab
     WHERE ab."service_id" = OLD."id"
       AND (OLD."business_id" IS NULL OR ab."business_id" = OLD."business_id")
       AND ab."status" = 'active'
  ) THEN
    RAISE EXCEPTION 'service_has_active_abono' USING ERRCODE = 'P0001';
  END IF;

  -- 1.4 Devolver la fila vieja es OBLIGATORIO. Una salida nula desde un trigger BEFORE DELETE
  -- CANCELA el borrado SIN error: PostgREST respondería 204, el cliente filtraría la lista y la UI
  -- diría "eliminado" sin haber borrado nada (T-13-06). El único rechazo válido acá es el RAISE.
  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."services_block_delete"() OWNER TO "postgres";

-- ── 2. Gate de CAMBIO DE MODO (068) — recorte por dirección + estados + fecha/hora ──────────────
-- Cierra el riesgo residual R-1 de la Phase 12: cambiar `capacity_mode` con turnos ya creados deja
-- las filas viejas con el `is_group` del momento del INSERT, y en las direcciones peligrosas esas
-- filas quedan fuera del EXCLUDE gist 013 Y fuera del gate espejo de la 064 ⇒ solapes PERMANENTES
-- que ningún gate vuelve a detectar. Bloquea en vez de reparar (D-03 de la 068): recalcular
-- `is_group` puede toparse con turnos que YA se solapan de una forma que pasa a ser ilegal, y ahí el
-- EXCLUDE aborta igual, dejando al dueño con un error peor y sin salida clara. La salida legítima y
-- documentada es cancelar o esperar los turnos futuros.
CREATE OR REPLACE FUNCTION "public"."services_block_mode_change"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- Mismo criterio de zona que `services_block_delete` (065) y `abonos_block_delete` (067).
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  -- La HORA de ahora, en la misma zona y del MISMO instante que `v_today` (GATE-03).
  v_now_time time := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::time;
BEGIN
  -- 2.1 GUARD DE NO-CAMBIO, PRIMERO. Éste es el guard REAL del gate: el `UPDATE OF` declarado en el
  -- trigger es sólo una optimización que evita disparar cuando la columna ni siquiera viene en el
  -- SET. Postgres dispara igual cuando la columna VIENE en el SET con el mismo valor que ya tenía,
  -- que es exactamente lo que hace `saveEditService` en cada guardado. Sin este guard, renombrar un
  -- servicio con turnos futuros rebotaría.
  IF NEW."capacity_mode" IS NOT DISTINCT FROM OLD."capacity_mode" THEN
    RETURN NEW;
  END IF;

  -- 2.2 GUARD DE DIRECCIÓN (GATE-01, NUEVO en la 070). Salir de `individual` es la ÚNICA dirección
  -- segura, y por eso es la única que se deja pasar por negación explícita:
  --   individual → grupal/simultáneo : las filas que ya existen nacieron `is_group = false`, siguen
  --                                    DENTRO del EXCLUDE gist 013 y ADEMÁS se cuentan contra el
  --                                    cupo nuevo. Nada queda huérfano de guards.
  --   grupal/simultáneo → individual : esas filas son `is_group = true`, están FUERA del EXCLUDE y
  --                                    el gate espejo deja de cubrirlas. ACÁ VIVE R-1.
  --   grupal ⇄ simultáneo            : cambia el eje de conteo (hora de inicio exacta ⇄ solape), y
  --                                    un conjunto hoy legal puede volverse ilegal.
  -- El criterio es NOMINAL y no `OLD."capacity" <= 1` a propósito: post-068 vale
  -- `is_group ⟺ capacity_mode <> 'individual'` porque el CHECK de coherencia impide cualquier cambio
  -- de sólo `capacity` que cruce la frontera 1/2 — pero un gate no debe depender de un CHECK para ser
  -- correcto. Escribirlo por el número es el mismo error que el review de la 069 propuso en el otro
  -- sentido. `capacity_mode` es NOT NULL con default 'individual', así que la igualdad simple alcanza.
  -- ⚠ Un SOLO turno futuro alcanza para abrir el agujero en las dos direcciones peligrosas: no es
  -- cuestión de cantidad (evaluado y descartado en `15-UAT.md`).
  IF OLD."capacity_mode" = 'individual' THEN
    RETURN NEW;
  END IF;

  -- 2.3 ACÁ NO VA EL GUARD DE CASCADA que sí lleva la 065, y no es un olvido:
  -- `services_business_id_fkey` es ON DELETE CASCADE, así que cerrar la cuenta de un negocio BORRA la
  -- fila de `services` — nunca la actualiza. Una cascada jamás llega a un BEFORE UPDATE. Queda
  -- escrito para que nadie agregue código muerto "por simetría" con el otro gate.

  -- 2.4 Turnos futuros VIVOS del servicio.
  --
  -- "FUTURO" (GATE-03): igual que en el gate de borrado — fecha Y HORA en zona AR, contra el INICIO
  -- del turno, con `>=` inclusive y sin sumar la duración. Antes era sólo el día, así que un turno de
  -- HOY a hora ya pasada trababa el cambio de modo hasta la medianoche.
  --
  -- "VIVO" (GATE-02, LA DIVERGENCIA): acá se excluye SÓLO `cancelled`, no `completed`. Este gate no
  -- pregunta "¿queda algo por prestar?" sino "¿queda alguna fila cuyo `is_group` quedaría
  -- desalineado?", y para esa pregunta `completed` NO es una salida legítima: marcarlo es un botón de
  -- UN CLICK del panel (`appointments-client.tsx`) aplicable a un turno FUTURO, o sea un bypass
  -- accesible del gate. Ése es el residual R-15-A de `15-SECURITY.md`, y ésta es su condición de
  -- cierre registrada. `cancelled` sí sigue afuera: cancelar destruye el compromiso y es la salida
  -- documentada que el copy del panel le ofrece al dueño.
  -- ⚠ Este predicado y el de `services_block_delete` YA NO SON INTERCAMBIABLES. Se parecen a propósito
  -- y difieren a propósito; unificarlos por simetría reabre R-15-A o re-rompe el gap UAT #2.
  --
  -- La rama de estado NULO es OBLIGATORIA: `appointments.status` es NULLABLE y `<>` sobre NULL evalúa
  -- a NULL —ni true ni false—, así que esas filas quedarían fuera del EXISTS y ABRIRÍAN el gate. El
  -- repo ya pagó esta trampa dos veces (migr. 065 y el read-path de 13-01).
  --
  -- Anclado en `a.service_id = OLD.id` (UUID PK, no adivinable). El filtro por tenant es EXPLÍCITO y
  -- obligatorio: adentro de una función definer la RLS NO aplica, así que sin él la query cruzaría
  -- negocios. La rama `OLD.business_id IS NULL` cubre las filas legacy de `services`.
  IF EXISTS (
    SELECT 1
      FROM appointments a
     WHERE a."service_id" = OLD."id"
       AND (OLD."business_id" IS NULL OR a."business_id" = OLD."business_id")
       AND (a."date" > v_today OR (a."date" = v_today AND a."time" >= v_now_time))
       AND (a."status" IS NULL OR a."status" <> 'cancelled')
  ) THEN
    -- Código de dominio FIJO, sin nombres de cliente, sin fechas y sin conteos: el texto viaja hasta
    -- el navegador y no puede filtrar datos del negocio (T-14-14 / lección T-13-09). El panel lo mapea
    -- a copy propia leyendo `code = 'P0001'` + `message.includes(...)`. El nombre NO se toca y no se
    -- agrega ninguno nuevo: la convivencia por substring con los dos códigos de la 065 ya está
    -- verificada, y el copy actual sigue siendo cierto después del recorte por dirección.
    RAISE EXCEPTION 'service_mode_has_future_appointments' USING ERRCODE = 'P0001';
  END IF;

  -- 2.5 Devolver la fila nueva es OBLIGATORIO, y es el espejo exacto del RETURN OLD del gate de
  -- borrado: una salida nula desde un trigger BEFORE UPDATE cancela la escritura SIN error —
  -- PostgREST respondería 204, el panel diría "Servicio actualizado" y no se habría actualizado nada
  -- (T-14-16). El único camino de rechazo válido es el RAISE de arriba.
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."services_block_mode_change"() OWNER TO "postgres";

COMMIT;

-- ── Recargar el schema cache de PostgREST (obligatorio tras DDL) ─────────────────────────────────
NOTIFY pgrst, 'reload schema';
