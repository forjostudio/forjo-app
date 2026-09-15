-- 079 — Que "dos títulos que el cliente lee como UNO" sea imposible EN LA BASE, también cuando la
--       diferencia es un espacio invisible (motor-reservas / Phase 22 — CAT-01, code review WR-06).
--
-- ── Contexto ────────────────────────────────────────────────────────────────────────────────────
--   La 078 creó `service_categories_name_uq` sobre `(business_id, lower(name))` y justificó ese
--   índice diciendo que CAT-01 quedaba "resuelto EN LA BASE, no en la pantalla", con el daño escrito
--   con todas las letras: dos títulos que el cliente lee como UNO.
--
--   `lower(name)` cierra 'Color' vs 'COLOR' y NADA MÁS. Dentro del mismo negocio seguían entrando
--   'Color', 'Color ', ' Color' y 'Color  ' — las cuatro conviven en el índice y las cuatro se
--   renderizan IDÉNTICAS, porque el espacio de borde es invisible en HTML. O sea: el caso que la
--   078 dice cerrar seguía abierto por la variante más difícil de ver, que es justamente la que
--   nadie va a diagnosticar mirando la pantalla.
--
--   Tampoco había nada que impidiera `name = ''` ni un nombre de puros espacios: un encabezado
--   público VACÍO, insertable. La Phase 23 es el panel que va a escribir esta columna, y la va a
--   escribir creyendo que la base ya sostiene CAT-01. Esta migración hace que eso sea cierto.
--
-- ── Qué hace ────────────────────────────────────────────────────────────────────────────────────
--   1. Reemplaza `service_categories_name_uq` por el mismo índice sobre el nombre NORMALIZADO
--      (`lower(btrim(name, <blancos>))`): normalizar sale gratis porque ya era un índice de
--      EXPRESIÓN. El segundo argumento de `btrim` es necesario — ver el ⚠ de la sección 1.
--   2. Agrega el CHECK `service_categories_name_not_blank`, con el mismo `btrim`.
--
-- ── Qué NO hace ─────────────────────────────────────────────────────────────────────────────────
--   - NO toca la 078: esa migración ya está aplicada en producción y una migración aplicada no se
--     edita — editarla desincroniza el repo de la base real y rompe el replay del baseline.
--   - NO hace backfill ni UPDATE de ningún `name`: no hay filas (ver más abajo).
--   - NO toca `services`, ni `businesses`, ni ninguna de las tres vistas públicas, ni el motor de
--     reservas. Sólo el índice y el CHECK de una tabla que hoy está vacía en todos lados.
--   - NO emite `NOTIFY pgrst, 'reload schema'`: no cambia ninguna columna ni ninguna vista, así que
--     no hay nada nuevo que PostgREST tenga que exponer. Un CHECK y un índice no viven en su cache.
--
-- ── POR QUÉ RECREAR EL ÍNDICE ES SEGURO EN PRODUCCIÓN ───────────────────────────────────────────
--   Porque `service_categories` está VACÍA en prod, en todos los negocios, sin excepción. No es una
--   suposición: es el fundamento de CAT-07 (D-08) y la 078 lo dejó garantizado por construcción —
--   tiene CERO BACKFILL escrito como invariante, y su propio runbook verifica
--   `SELECT count(*) FROM public.service_categories;  -- 0`. Un índice único que se recrea sobre una
--   tabla sin filas no puede fallar por datos existentes, y el CHECK tampoco tiene fila que validar.
--   Si por lo que fuera esa cuenta NO diera 0 al aplicar esto, PARAR: el CREATE UNIQUE INDEX abortaría
--   solo (fail-closed, nada queda a medias) y habría que mirar qué se sembró antes de reintentar.
--
-- ── POR QUÉ EL CHECK, SI NINGUNA OTRA COLUMNA `name` DEL ESQUEMA TIENE UNO ──────────────────────
--   Porque esta columna no es un nombre cualquiera: es un ENCABEZADO que se le pinta a un visitante
--   anónimo en la página pública de reservas. Un `services.name` vacío se ve raro pero el servicio
--   sigue siendo reservable; un `service_categories.name` vacío deja un título fantasma arriba de un
--   grupo de servicios, y el cliente no tiene forma de saber qué está mirando. El costo del CHECK lo
--   paga la Phase 23 traduciendo el 23514 a un error de formulario, que es trabajo que igual hay que
--   hacer — la alternativa es que el dato roto llegue a la pantalla del cliente.
--
-- ── RUNBOOK DE PRODUCCIÓN (esta migración NO se aplicó allá) ────────────────────────────────────
--   Última migración aplicada en prod: 078. Esta es la 079 y no se saltea ningún número.
--
--   (a) Aplicar CUANDO SE QUIERA, sin coordinar con ningún deploy: no hay una sola lectura ni
--       escritura de la app de hoy que toque `service_categories` (el panel es la Phase 23 y la
--       página pública la 24). Entre que se aplica y que se deployan esas fases, el comportamiento
--       de la app es byte-idéntico.
--
--   (b) Pegar y ejecutar este archivo COMPLETO, de una sola vez, en el SQL editor — nunca statement
--       por statement.
--
--   (c) VERIFICACIÓN POSTERIOR:
--
--         -- 1) el índice quedó sobre la expresión normalizada
--         SELECT indexdef FROM pg_indexes
--          WHERE schemaname='public' AND indexname='service_categories_name_uq';
--         -- la expresión indexada tiene que ser lower(btrim(name, '<espacio><tab><nl><cr>'::text)),
--         -- NO lower(btrim(name)) ni lower(name)
--
--         -- 2) el CHECK existe
--         SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--          WHERE conname = 'service_categories_name_not_blank';
--
--         -- 3) y MUERDE de verdad (las dos tienen que fallar; correr cada una y descartar):
--         --    23505 en la segunda fila / 23514 en la del nombre en blanco
--         -- INSERT INTO public.service_categories (business_id, name)
--         --   SELECT id, 'Color'  FROM public.businesses LIMIT 1;
--         -- INSERT INTO public.service_categories (business_id, name)
--         --   SELECT id, 'Color ' FROM public.businesses LIMIT 1;   -- ⇒ 23505
--         -- INSERT INTO public.service_categories (business_id, name)
--         --   SELECT id, '   '    FROM public.businesses LIMIT 1;   -- ⇒ 23514
--         -- (borrar la 'Color' que sí entró: DELETE FROM public.service_categories;)
--
--   (d) RECIÉN DESPUÉS de aplicarla se espeja `supabase/schema.sql`. ⚠ EXCEPCIÓN DECLARADA: el
--       espejo de esta migración se escribió ANTES de aplicarla (venía pedido junto con el arreglo),
--       así que las dos líneas que toca en `schema.sql` están marcadas ahí mismo con
--       "(migr. 079 — PENDIENTE de aplicación a producción)". Cuando se aplique, borrar esa marca.
--
-- Idempotente (el baseline se replaya entero en cada `supabase db reset`): DROP INDEX IF EXISTS +
-- CREATE UNIQUE INDEX IF NOT EXISTS, y el ADD CONSTRAINT guardado por pg_constraint (molde 065/075).
-- Re-correrla es no-op.

-- ── 1. El índice único, ahora sobre el nombre NORMALIZADO ───────────────────────────────────────
-- Se DROPea y se recrea con el mismo nombre a propósito: que siga llamándose
-- `service_categories_name_uq` mantiene una sola fuente de verdad para "el índice de CAT-01" y evita
-- que queden dos índices haciendo la mitad del trabajo cada uno. `btrim` adentro de `lower` y no al
-- revés da igual en resultado, pero este orden se lee como lo que es: "recortá los bordes y después
-- ignorá la capitalización".
--
-- ⚠ EL SEGUNDO ARGUMENTO DE `btrim` NO ES DECORATIVO. `btrim(x)` a secas recorta SÓLO el caracter
-- espacio: `btrim(E'\t') = E'\t'`, medido, no deducido. Sin la lista explícita, un nombre pegado
-- desde una planilla o un documento —que es de donde sale el texto que el dueño pega— podía traer
-- un tab o un salto de línea de borde y volver a abrir el mismo agujero por otra puerta. La lista
-- cubre los cuatro blancos que existen en texto pegado de verdad: espacio, tab, salto y retorno.
DROP INDEX IF EXISTS "public"."service_categories_name_uq";

CREATE UNIQUE INDEX IF NOT EXISTS "service_categories_name_uq"
  ON "public"."service_categories" ("business_id", "lower"("btrim"("name", E' \t\n\r')));

-- ── 2. Un encabezado público no puede estar en blanco ───────────────────────────────────────────
-- Guardado por pg_constraint porque `ADD CONSTRAINT` no acepta `IF NOT EXISTS` (mismo molde que la
-- 065 y la 075). Sin NOT VALID: la tabla está vacía, no hay nada que validar y la validación es
-- instantánea.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'service_categories_name_not_blank'
       AND "conrelid" = '"public"."service_categories"'::"regclass"
  ) THEN
    ALTER TABLE "public"."service_categories"
      ADD CONSTRAINT "service_categories_name_not_blank"
      CHECK (("btrim"("name", E' \t\n\r') <> ''::"text"));
  END IF;
END
$$;
