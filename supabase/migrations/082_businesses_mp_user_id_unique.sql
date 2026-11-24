-- 082 — Una cuenta de MercadoPago se conecta a UN solo negocio (quick 261124-obs).
--
-- ── Contexto ────────────────────────────────────────────────────────────────────────────────────
--   `businesses.mp_user_id` es el id de la cuenta de MercadoPago que el negocio conectó por OAuth
--   (MercadoPago Connect) para cobrar señas. Hasta hoy nada impedía que dos negocios conectaran la
--   MISMA cuenta: la seña de un negocio se cobraría con credenciales que otro negocio también usa, y
--   re-autorizar la cuenta desde el segundo podría invalidar los tokens del primero. Se observó en la
--   UAT del quick 261119-q8v (dos negocios locales con la misma cuenta de prueba).
--
--   La fuente de verdad es la base y no un chequeo en el callback: el callback escribe con el cliente
--   de SESIÓN del dueño, que por RLS no ve los negocios ajenos, así que un SELECT previo no encontraría
--   el choque. Meter el service role en el callback sólo para mirar negocios de otros abriría más de lo
--   que cierra. Un índice único lo hace cumplir Postgres para cualquier rol, aunque RLS esconda la fila
--   con la que choca; el callback traduce el 23505 a `?mp=error&motivo=cuenta-en-uso`.
--
-- ── Qué hace ────────────────────────────────────────────────────────────────────────────────────
--   1. Guarda: cuenta cuántos `mp_user_id` no nulos se repiten y cuántos negocios suman entre todos.
--      Si hay alguno, aborta con RAISE EXCEPTION ('082: …') que nombra SÓLO las dos cantidades (nunca
--      los valores ni ningún token). Sin la guarda, el CREATE UNIQUE INDEX fallaría igual pero con un
--      error que imprime el valor repetido (el DETAIL de Postgres).
--   2. Índice único parcial `businesses_mp_user_id_key` sobre `mp_user_id` WHERE NOT NULL, mismo molde
--      que `businesses_mp_plan_id_active_key` (080): los negocios sin MP (NULL) conviven sin límite, y un
--      negocio que vuelve a escribir SU propio mp_user_id (reconexión de la misma cuenta) no choca.
--
-- ── Qué NO hace ─────────────────────────────────────────────────────────────────────────────────
--   - NO toca datos ni elige qué negocio se queda con una cuenta repetida: eso lo decide el dueño.
--   - NO lleva `NOTIFY pgrst, 'reload schema'`: es sólo un índice y lo hace cumplir Postgres; PostgREST
--     no necesita refrescar nada (regla de la 079: el NOTIFY va con columnas/vistas/funciones nuevas).
--   - NO agrega policies: RLS de `businesses` queda como está.
--   - NO usa CONCURRENTLY: la tabla es chica, y CONCURRENTLY no corre dentro de la transacción que
--     abre el SQL Editor.
--
-- ⚠ PROD A MANO, DESPUÉS DEL DEPLOY. El código nuevo funciona con y sin el índice (sin él, sólo no se
--   rechaza la cuenta repetida), por eso se aplica después de deployar. Pasos, desde el SQL Editor:
--
--   (a) Consulta previa — tiene que dar 0 filas:
--         SELECT mp_user_id, count(*) AS negocios, array_agg(id ORDER BY created_at) AS business_ids
--         FROM public.businesses
--         WHERE mp_user_id IS NOT NULL
--         GROUP BY mp_user_id
--         HAVING count(*) > 1;
--
--   (b) Si devuelve filas, PARAR. El dueño decide qué negocio se queda con la cuenta y el otro la
--       suelta desde su panel (Negocio → Integraciones → Desconectar). Si es un dueño con DOS negocios
--       (el desconectar de hoy no llega al segundo), soltarla a mano en ESE negocio (el que la suelta),
--       reemplazando <business_id>:
--         UPDATE public.businesses SET mp_user_id = NULL WHERE id = '<business_id>';
--         UPDATE public.business_secrets
--            SET mp_access_token = NULL, mp_refresh_token = NULL, mp_token_expires_at = NULL
--          WHERE business_id = '<business_id>';
--       Repetir (a) hasta que dé 0 filas.
--
--   (c) Correr esta migración entera.
--
--   (d) Post-chequeo — tiene que devolver 1 fila:
--         SELECT indexname, indexdef FROM pg_indexes
--         WHERE schemaname = 'public' AND indexname = 'businesses_mp_user_id_key';

-- ── 1. Guarda: abortar si ya hay cuentas repetidas (sin imprimir valores) ───────────────────────
DO $$
DECLARE
  cuentas_repetidas integer;
  negocios_involucrados integer;
BEGIN
  SELECT count(*), coalesce(sum(n), 0)
    INTO cuentas_repetidas, negocios_involucrados
    FROM (
      SELECT count(*) AS n
        FROM public.businesses
       WHERE mp_user_id IS NOT NULL
       GROUP BY mp_user_id
      HAVING count(*) > 1
    ) d;

  IF cuentas_repetidas > 0 THEN
    RAISE EXCEPTION '082: hay % cuenta(s) de MercadoPago conectada(s) a más de un negocio (% negocios involucrados); no se creó el índice',
      cuentas_repetidas, negocios_involucrados
      USING HINT = 'Correr la consulta previa (a) de la cabecera de 082_businesses_mp_user_id_unique.sql y resolver cada cuenta repetida antes de reintentar.';
  END IF;
END
$$;

-- ── 2. Índice único parcial: una cuenta de MP por negocio ───────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "businesses_mp_user_id_key"
  ON "public"."businesses" ("mp_user_id")
  WHERE "mp_user_id" IS NOT NULL;
