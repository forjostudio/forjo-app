-- 067 — Correctiva del gate de borrado de serie de abono: no dejar turnos futuros VIVOS huérfanos
-- (WR-B3 del code review de la Phase 14, motor-reservas / v0.26).
--
-- ⚠ LA 066 NO SE EDITA. Ya está aplicada en producción (2026-08-06, con el rechazo verificado en vivo).
--   Toda corrección va acá. Esta migración hace `CREATE OR REPLACE` de la MISMA función
--   `public.abonos_block_delete()`: el trigger `abonos_block_delete_trg` sigue siendo uno solo y
--   apunta por nombre, así que reemplazar el cuerpo alcanza. El `DROP TRIGGER IF EXISTS` + `CREATE
--   TRIGGER` del final está sólo para que el archivo sea auto-suficiente e idempotente (re-correrlo es
--   no-op), igual que la 066.
--
-- ── QUÉ AGUJERO CIERRA ───────────────────────────────────────────────────────────────────────────
--
--   La 066 declara que "la BASE es la autoridad" y que el trigger "resiste un DELETE directo por
--   PostgREST que saltee la UI". Eso es cierto para UN DELETE, pero el mismo actor tiene la policy
--   `abonos tenant update` (migr. 054) sobre la misma tabla, así que DOS llamadas lo esquivan:
--
--       PATCH  /rest/v1/abonos?id=eq.<uuid>   {"status":"cancelled"}
--       DELETE /rest/v1/abonos?id=eq.<uuid>
--
--   El trigger evalúa `OLD.status = 'active'`, ve 'cancelled' y deja pasar el borrado. No es un
--   problema de aislamiento (es su propio negocio, su propia serie): es de INTEGRIDAD. La baja legítima
--   corre por `app/api/abonos/cancel` → `lib/abono-cancel.ts`, que además de mover el estado CANCELA
--   los turnos futuros de la serie. Este camino no. Resultado: turnos futuros vivos que quedan, tras el
--   DELETE, con `abono_id = NULL` (`ON DELETE SET NULL`, migr. 054) — reservas sin serie que las
--   explique.
--
--   La regla nueva no mira CÓMO llegó la fila a su estado, sino QUÉ QUEDA COLGANDO DE ELLA: una serie
--   no se borra si todavía tiene turnos futuros vivos vinculados. Eso hace la invariante independiente
--   del camino, y por lo tanto imposible de esquivar encadenando escrituras permitidas.
--
-- ── POR QUÉ **NO** SE HIZO CON UN TRIGGER `BEFORE UPDATE` (el enfoque que proponía el review) ─────
--
--   La propuesta original era rechazar la transición 'active' → 'cancelled' mientras quedaran turnos
--   futuros vivos. ESO ROMPE LA BAJA LEGÍTIMA EN PRODUCCIÓN: `lib/abono-cancel.ts` escribe PRIMERO el
--   estado de la serie (paso (a), :210-216) y recién DESPUÉS cancela los turnos en masa (paso (c),
--   :277-284). El orden es deliberado — el UPDATE con `.neq('status','cancelled')` adentro es el gate
--   ATÓMICO que evita que dos requests simultáneas manden dos mails de baja (D-05, T-07-03). Un trigger
--   BEFORE UPDATE con esa condición rechazaría TODAS las bajas reales, que es exactamente el momento en
--   que la serie todavía tiene sus turnos futuros vivos. Por eso el gate va del lado del DELETE, que es
--   la operación que produce el huérfano.
--
-- ── CAMBIO DE COMPORTAMIENTO QUE HAY QUE DECIDIR ANTES DE APLICAR (D-17 "descartado") ────────────
--
--   La 066 documenta que una serie 'completed' (finita que ya juntó sus N sesiones) SE BORRA aunque
--   tenga turnos vivos por delante, y que esos turnos quedan intactos y desvinculados. Con esta
--   correctiva ESE borrado pasa a rechazarse hasta que no queden turnos futuros vivos. Es el precio de
--   que la invariante no dependa del estado: si el gate sólo mirara 'cancelled', el mismo bypass se
--   rearmaría con `PATCH {"status":"completed"}` → `DELETE`.
--
--   NO deja al dueño sin salida: una serie 'completed' se puede DAR DE BAJA por el camino normal
--   ('completed' → 'cancelled' está permitido a propósito, D-21), y esa baja cancela los turnos
--   futuros. Después la serie se borra sin trabas. O sea: el orden pasa a ser "dar de baja → eliminar",
--   que es el mismo que ya rige para una serie activa.
--
--   Lo que NO cambia: los turnos ya OCURRIDOS (pasado) y los turnos futuros ya CANCELADOS no traban
--   nada. Borrar una serie vieja sigue siendo inmediato, y D-16 sigue en pie — los turnos que la serie
--   generó sobreviven en Finanzas y en la ficha del cliente con su snapshot (migr. 065).
--
-- ── QUÉ NO HACE ──────────────────────────────────────────────────────────────────────────────────
--   - NO toca la 066 ni ninguna de las 4 policies RLS de `abonos` (054). El aislamiento por tenant no
--     se afloja ni se apoya en este trigger: sigue siendo RLS + filtro explícito por business_id.
--   - NO cancela, borra ni modifica NINGÚN turno. El trigger sólo LEE `appointments` para decidir.
--   - NO suma columnas, índices, constraints ni backfills. No muta una sola fila.
--   - NO toca el motor de reservas ni ningún archivo de `app/` o `lib/`.
--   - NO se aplica vía push remoto. Validación local con `supabase db reset` (PG17); prod A MANO y
--     coordinado con el deploy. Tras aplicar en prod, espejar `supabase/schema.sql` a mano y de forma
--     quirúrgica — nunca con `db dump`.

-- ── 1. Gate de borrado, ampliado ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."abonos_block_delete"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- "Hoy" en hora de Argentina (UTC-3 sin DST), no en UTC: a las 22:00 de Buenos Aires el `now()` en
  -- UTC ya es el día siguiente y un turno de mañana temprano dejaría de contarse como futuro. Mismo
  -- criterio que `services_block_delete` (migr. 065) y que la frontera D-02 del motor de baja.
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  -- 1.1 GUARD DE CASCADA (crítico, sin cambios respecto de la 066). Cuando se cierra la cuenta de un
  -- negocio, la fila padre de `businesses` se elimina ANTES de que corran las acciones referenciales
  -- hacia `abonos`, así que la AUSENCIA del negocio identifica de forma confiable un borrado en
  -- cascada. Sin este guard, cerrar la cuenta de un negocio con una serie activa sería imposible y
  -- `teardownOneTenant` (test/helpers/booking-fixtures.ts) rompería toda la suite de integración.
  -- VA PRIMERO a propósito: la cascada tiene que pasar aunque queden turnos futuros vivos, porque esos
  -- turnos también se están borrando en la misma cascada (T-14-15).
  IF OLD."business_id" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b."id" = OLD."business_id") THEN
    RETURN OLD;
  END IF;

  -- 1.2 La regla de la 066 (D-18): una serie ACTIVA no se borra. Se mantiene TAL CUAL y va antes que la
  -- regla nueva a propósito: para una serie activa el motivo real es "está viva", y ése es el mensaje
  -- accionable ("dala de baja primero"). Si la regla nueva corriera antes, una serie activa con turnos
  -- por delante devolvería el código equivocado.
  IF OLD."status" = 'active' THEN
    RAISE EXCEPTION 'abono_is_active' USING ERRCODE = 'P0001';
  END IF;

  -- 1.3 REGLA NUEVA (WR-B3): archivada pero con turnos futuros VIVOS ⇒ el borrado dejaría huérfanos.
  --
  -- El predicado se ancla en `a.abono_id = OLD.id` (UUID PK global, no adivinable) y suma el filtro
  -- explícito por tenant. `abonos.business_id` es `uuid NOT NULL` (054), así que acá NO hace falta la
  -- rama `OLD.business_id IS NULL OR …` que la 065 sí necesita para las filas legacy de `services`.
  -- Hay índice sobre `appointments.abono_id` (`appointments_abono_id_idx`, 054): el EXISTS es barato.
  --
  -- "Futuro" = `date >= hoy AR`, INCLUSIVE — la misma frontera que usa el motor de baja (D-02), así que
  -- el conjunto que este gate mira es EXACTAMENTE el que la baja legítima cancela. Consecuencia
  -- directa y buscada: después de una baja real no queda ninguna fila que matchee, y el borrado pasa.
  --
  -- "Vivo" = cualquier estado que no sea `cancelled` ni `completed`:
  --   - `cancelled`: ya no es una reserva pendiente; contarla trabaría el borrado para siempre.
  --   - `completed`: el turno YA SE PRESTÓ. Es historia, no un compromiso por delante.
  --   - `pending` / `pending_payment` / `confirmed`: compromisos vivos. Bloquean.
  -- La rama `a.status IS NULL` es OBLIGATORIA y no es defensiva de más: `appointments.status` es
  -- NULLABLE y `NOT IN (...)` sobre NULL evalúa a NULL (ni true ni false), así que esas filas quedarían
  -- fuera del EXISTS y ABRIRÍAN el gate. Un turno sin estado sigue siendo un turno reservado. Es la
  -- misma trampa que la 065 ya pagó (y la que 13-01 encontró en el read-path).
  --
  -- Message = código de dominio FIJO y NUEVO, sin nombres de cliente, sin fechas y sin conteos: el
  -- texto viaja hasta el navegador y no puede filtrar datos del negocio (T-14-14 / lección T-13-09). El
  -- panel lo mapea a copy propio leyendo `code = 'P0001'` + `message.includes('abono_has_future_turns')`,
  -- igual que ya hace con `abono_is_active`. El texto crudo del error NUNCA se interpola en pantalla.
  IF EXISTS (
    SELECT 1
      FROM appointments a
     WHERE a."abono_id" = OLD."id"
       AND a."business_id" = OLD."business_id"
       AND a."date" >= v_today
       AND (a."status" IS NULL OR a."status" NOT IN ('cancelled', 'completed'))
  ) THEN
    RAISE EXCEPTION 'abono_has_future_turns' USING ERRCODE = 'P0001';
  END IF;

  -- 1.4 Devolver la fila vieja es OBLIGATORIO. Devolver NULL desde un trigger BEFORE DELETE cancela el
  -- borrado SIN error: PostgREST respondería 204, el cliente filtraría la lista y la UI diría
  -- "eliminado" sin haber borrado nada (T-14-16). El único camino de rechazo válido es el RAISE.
  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."abonos_block_delete"() OWNER TO "postgres";

-- Idempotencia: el DROP previo es lo que hace re-corrible el archivo entero (sin él, una segunda
-- pasada fallaría con 42710). Mismo molde que la 065 y la 066.
DROP TRIGGER IF EXISTS "abonos_block_delete_trg" ON "public"."abonos";

CREATE TRIGGER "abonos_block_delete_trg"
  BEFORE DELETE ON "public"."abonos"
  FOR EACH ROW EXECUTE FUNCTION "public"."abonos_block_delete"();

-- ── 2. Recargar el schema cache de PostgREST (obligatorio tras DDL) ──────────────────────────────
NOTIFY pgrst, 'reload schema';
