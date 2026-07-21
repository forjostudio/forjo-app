-- 056 — abonos.cancel_token: índice ÚNICO (WR-03, T-07-33/T-07-34/T-07-35, ABONO-04, D-09/D-22).
--
-- Contexto (motor-reservas / Phase 7 — cancelación del abono por mail + panel):
--   `abonos.cancel_token` es la credencial ÚNICA de la vía PÚBLICA de baja de una serie: el link del
--   mail lleva el token y las dos superficies públicas — `app/api/abonos/cancel/[token]/route.ts` y
--   `app/abono/cancelar/[token]/page.tsx` — resuelven la serie con
--   `.eq('cancel_token', token).maybeSingle()`. La tabla HERMANA `appointments` sí tiene su índice
--   único (`appointments_cancel_token_idx`, schema.sql:1042); `abonos` quedó SIN él en la 054, que
--   creó la columna sólo como `uuid NOT NULL DEFAULT gen_random_uuid()`. Es decir: hoy la unicidad
--   de la credencial descansa en la suerte del default, no en una constraint de la base. Si por un
--   backfill, un import o un UPDATE manual dos series compartieran token, `maybeSingle()` devuelve
--   error → `data` null → la pantalla dice "Link inválido" (falla CERRADA, que es lo bueno), pero el
--   modelo de autorización queda sin respaldo en la base. Hallazgo WR-03 del code review de Phase 7.
--
-- Qué hace (el ORDEN es obligatorio):
--   1. VERIFICA que no haya `cancel_token` duplicados en `public.abonos` y, si los hay, ABORTA con un
--      mensaje accionable. Va PRIMERO y con mensaje propio a propósito: `CREATE UNIQUE INDEX` sobre
--      una tabla con duplicados falla con un error genérico de Postgres que no dice qué hacer.
--      En una base sana el conteo es 0 y el bloque es un NO-OP.
--   2. Crea `abonos_cancel_token_idx` como UNIQUE sobre `public.abonos (cancel_token)`.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO edita la 054 (`054_abonos.sql`): ya está APLICADA EN PRODUCCIÓN (2026-07-21). Una migración
--     aplicada NO se modifica en el lugar; todo cambio posterior es una migración NUEVA numerada.
--   - NO edita la 055 (`055_abono_window_bounds.sql`): existe en el repo pero TODAVÍA NO está en prod.
--     Una migración numerada tampoco se enmienda en el lugar aunque no se haya aplicado.
--   - NO crea columnas, funciones, RPC ni policies; NO toca `appointments`, `book_slot_atomic` ni
--     ninguna RLS. Se acota al índice: cero superficie nueva.
--
-- Cómo se aplica:
--   - NO desde el flujo GSD y NO por push remoto. La ÚNICA validación automatizada es
--     `supabase db reset` local (PG17), que replaya el baseline numerado + 040..056 en orden.
--   - PRODUCCIÓN se aplica A MANO, coordinado con el deploy. Prod tiene aplicada hasta la 054, así
--     que el orden obligatorio al salir a producción es:
--         1) supabase/migrations/055_abono_window_bounds.sql
--         2) supabase/migrations/056_abonos_cancel_token_unique.sql
--         3) NOTIFY pgrst, 'reload schema';
--     La 055 NO se saltea: la 056 no depende de ella, pero el repo asume que el orden numerado se
--     respeta y la 055 lleva el CHECK de `abono_window_weeks` que cierra el GAP-01 de la Phase 6.
--   - ANTES de aplicar en prod, correr la consulta de duplicados del paso 1 contra producción y
--     confirmar que devuelve 0 filas.
--   - `supabase/schema.sql` se actualiza a MANO (edición quirúrgica, sin dump: el CLI v2.107 reordena
--     el archivo entero — decisión registrada del proyecto, Phase 06).

-- ── 1. Verificación PREVIA de duplicados. Sin esto, el índice falla sin contexto ────────────────
-- En una base sana `dup_count` es 0 y este bloque es un no-op.
DO $$
DECLARE
  "dup_count" bigint;
BEGIN
  SELECT count(*) INTO "dup_count"
    FROM (
      SELECT "cancel_token"
        FROM "public"."abonos"
       GROUP BY "cancel_token"
      HAVING count(*) > 1
    ) AS "dups";

  IF "dup_count" > 0 THEN
    RAISE EXCEPTION
      'No se puede crear abonos_cancel_token_idx: hay % valor(es) de cancel_token duplicado(s) en public.abonos. Resolvelos A MANO antes de aplicar esta migración (asignar un gen_random_uuid() nuevo a cada serie repetida) y volvé a correrla.',
      "dup_count";
  END IF;
END
$$;

-- ── 2. DESPUÉS el índice. Idempotente: re-correr la migración es un no-op ───────────────────────
-- Dos efectos, los dos deseados:
--   (a) cierra el modelo de autorización de la vía pública CONTRA LA BASE: el token del link resuelve
--       a UNA sola serie por garantía de Postgres, no por confianza en el default.
--   (b) convierte el seq scan sobre `abonos` de cada click de link público en una búsqueda por índice.
CREATE UNIQUE INDEX IF NOT EXISTS "abonos_cancel_token_idx" ON "public"."abonos" ("cancel_token");
