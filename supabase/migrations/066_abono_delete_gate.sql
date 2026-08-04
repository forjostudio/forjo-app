-- 066 — Gate de borrado de una serie de abono (EXTRA-B / D-16, D-17, D-18, v0.26).
--
-- Contexto (motor-reservas / Phase 14 — cierre de backlog):
--   Hoy una serie de abono archivada (dada de baja, o finita que ya juntó todas sus sesiones) se
--   queda para siempre en la lista de Archivados: el panel no ofrece NINGUNA acción sobre ella. El
--   dueño lo reportó en la UAT visual de Phase 13. EXTRA-B suma el borrado definitivo, y esta
--   migración pone la mitad de BASE: la regla de qué serie se puede borrar y cuál no.
--
--   La regla NO puede vivir en el cliente. Un borrado puede llegar por PostgREST sin pasar por la
--   pantalla, y aun pasando por ella quedaría una ventana entre el pre-check y el borrado. El trigger
--   corre DENTRO de la misma transacción, así que la BASE es la autoridad y la UI (plan 14-06) queda
--   como UX (D-18) — exactamente el criterio que la Phase 13 acaba de establecer para servicios.
--
-- Qué hace (idempotente — re-correr la migración es no-op):
--   1. Instala `public.abonos_block_delete()` y su trigger BEFORE DELETE sobre `public.abonos`: si la
--      serie está ACTIVA, el borrado se rechaza con el código de dominio `abono_is_active`
--      (ERRCODE P0001). Una serie 'cancelled' o 'completed' se borra sin trabas.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO crea ni modifica ninguna referencia hacia `abonos`. El vínculo `appointments.abono_id` ya
--     está en `ON DELETE SET NULL` desde la migr. 054 (:106-107): borrar la serie DESVINCULA sus
--     turnos, no los destruye (D-16). El historial de Finanzas y de la ficha del cliente sobrevive
--     entero, con su snapshot de nombre y precio de servicio (migr. 065).
--   - NO toca las 4 policies RLS de `abonos` (migr. 054, :81-101). La de borrado por tenant ya existe
--     y sigue siendo la que decide QUÉ FILA ve el dueño; este trigger decide si esa fila se puede
--     borrar. Son dos capas distintas y complementarias, ninguna reemplaza a la otra.
--   - NO cancela ni borra los turnos futuros de la serie (D-17, DESCARTADO). Una serie 'completed'
--     puede tener turnos vivos por delante: se los deja intactos y con su estado original.
--   - NO suma columnas, ni índices, ni constraints, ni backfills: la 066 es SOLO la función y su
--     trigger. Tampoco muta ninguna fila.
--   - NO toca el motor de reservas (`book_slot_atomic`) ni ningún archivo de `app/` o `lib/`.
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado + 040..066 en orden. Prod se aplica A MANO coordinado con el
--     deploy, cerrando con la recarga del schema cache de PostgREST (sección 2). La última migración
--     aplicada en prod = 065. Tras aplicar, espejar `supabase/schema.sql` A MANO y de forma
--     quirúrgica — nunca con `db dump`, que reordena el archivo entero (decisión del repo, Phase 06).

-- ── 1. Gate de borrado de la serie (D-18) ────────────────────────────────────────────────────────
-- Calco de la sección 6 de la 065 (gate de borrado de servicio) con un predicado más simple: acá no
-- hay fechas ni conteos de por medio, solo el estado de la propia fila que se está borrando.
CREATE OR REPLACE FUNCTION "public"."abonos_block_delete"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 1.1 GUARD DE CASCADA (crítico). Cuando se cierra la cuenta de un negocio, la fila padre de
  -- `businesses` se elimina ANTES de que corran las acciones referenciales hacia `abonos`, así que la
  -- AUSENCIA del negocio identifica de forma confiable un borrado en cascada (y no el borrado de una
  -- serie hecho por el dueño). Sin este guard, cerrar la cuenta de un negocio con una serie activa
  -- sería literalmente imposible, y `teardownOneTenant` (test/helpers/booking-fixtures.ts) rompería
  -- toda la suite de integración, porque su cleanup borra el negocio y cascadea a `abonos`. Es el
  -- mismo T-13-07 que la 065 ya pagó (acá, T-14-15).
  --
  -- El EXISTS mira `businesses` por PK contra la propia columna de la fila borrada: dentro de una
  -- función SECURITY DEFINER la RLS NO aplica, así que el único predicado admisible sobre otra tabla
  -- es uno que no pueda leer datos de un tenant ajeno (T-14-13). Este solo pregunta "¿existe?" y no
  -- devuelve ni una columna del negocio.
  IF OLD."business_id" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b."id" = OLD."business_id") THEN
    RETURN OLD;
  END IF;

  -- 1.2 La regla (D-18): SOLO se borra lo archivado. `abonos.status` es NOT NULL con CHECK sobre tres
  -- valores (migr. 054, :59), así que NO hace falta la rama `IS NULL` que sí necesita
  -- `services_block_delete` sobre `appointments.status` (esa columna es nullable y un `NOT IN` sobre
  -- NULL abriría el gate). Acá el CHECK garantiza que el estado siempre es uno de los tres, y la
  -- comparación por igualdad es fail-closed por construcción: cualquier estado que no sea 'active'
  -- se considera archivado a propósito.
  --
  --   - 'active'    → serie viva, sigue generando turnos hacia adelante. NO se borra.
  --   - 'cancelled' → baja explícita del dueño. Archivada: se borra.
  --   - 'completed' → serie finita que ya juntó sus N sesiones. Archivada: se borra, y sus turnos
  --                   futuros quedan INTACTOS (D-17 descartado), desvinculados por la referencia en
  --                   SET NULL que la 054 ya dejó puesta.
  --
  -- Message = código de dominio FIJO, sin nombres de cliente, sin fechas y sin conteos: el texto
  -- viaja hasta el navegador y no puede filtrar datos del negocio (lección T-13-09; acá, T-14-14). El
  -- plan 14-06 lo mapea a su copy leyendo `code = 'P0001'` + `message.includes('abono_is_active')`,
  -- igual que `settings-client.tsx` hace hoy con los dos códigos de la 065.
  IF OLD."status" = 'active' THEN
    RAISE EXCEPTION 'abono_is_active' USING ERRCODE = 'P0001';
  END IF;

  -- 1.3 Devolver la fila vieja es OBLIGATORIO. Devolver NULL desde un trigger BEFORE DELETE cancela
  -- el borrado SIN error: PostgREST respondería 204, el cliente filtraría la lista y la UI diría
  -- "eliminado" sin haber borrado nada (T-13-06; acá, T-14-16). El único camino de rechazo válido es
  -- el RAISE de arriba.
  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."abonos_block_delete"() OWNER TO "postgres";

-- El DROP previo es lo que hace re-corrible el archivo entero: sin él, una segunda pasada fallaría
-- con 42710 (trigger duplicado) y la migración dejaría de ser no-op. Mismo molde que la 065.
DROP TRIGGER IF EXISTS "abonos_block_delete_trg" ON "public"."abonos";

CREATE TRIGGER "abonos_block_delete_trg"
  BEFORE DELETE ON "public"."abonos"
  FOR EACH ROW EXECUTE FUNCTION "public"."abonos_block_delete"();

-- ── 2. Recargar el schema cache de PostgREST (obligatorio tras DDL) ───────────────────────────────
NOTIFY pgrst, 'reload schema';
