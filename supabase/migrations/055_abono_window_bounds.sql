-- 055 — businesses.abono_window_weeks: rango válido 1..52 (GAP-01, T-06-08/T-06-17/T-06-24/T-06-28).
--
-- Contexto (motor-reservas / Phase 6 — cierre del blocker de la auditoría de seguridad):
--   `abono_window_weeks` (creada en la 054) dimensiona el loop del motor de generación forward del
--   abono. Ese loop corre DENTRO del único cron DIARIO, que es COMPARTIDO por todos los negocios
--   (Vercel Hobby = 1 cron/día). La columna es OWNER-WRITABLE por diseño (la escribe el panel con
--   anon+RLS, igual que max_advance_days) y NO tenía techo en ninguna capa: la auditoría persistió en
--   vivo 5000 / 999999 / 2147483647 con la sesión real de un dueño. Con 999999 son ~1.000.000 de
--   iteraciones (2 queries cada una); con 2147483647 el borde de la ventana degenera y el loop NO
--   termina. Es decir: UN dueño podía degradar o colgar la generación de TODOS los demás tenants.
--
-- Qué hace (el ORDEN es obligatorio):
--   1. NORMALIZA los valores existentes fuera de rango con LEAST/GREATEST (clampea preservando la
--      intención del dueño en vez de resetear a 8). Va PRIMERO porque, si hay una sola fila fuera de
--      rango, la constraint del paso 2 NO se puede crear (ALTER ... ADD CHECK valida las filas
--      existentes). En la DB local de la auditoría hay filas con 5000 / 999999 / 2147483647.
--   2. Agrega el CHECK `businesses_abono_window_weeks_range`:
--        abono_window_weeks IS NULL OR abono_window_weeks BETWEEN 1 AND 52
--      Permite NULL a propósito: la columna es NULLABLE con DEFAULT 8 y un NULL significa "usá el
--      default" (los dos callers ya lo resuelven a 8). 52 = 1 año de anticipación; más que eso no es
--      un caso de uso, es abuso.
--
-- Defensa en profundidad, NO la única barrera:
--   La corrección REAL vive en el servidor — `clampWindowWeeks()` en app/api/abonos/create/route.ts y
--   en app/api/cron/cancel-expired/route.ts acota a 1..52 ANTES de calcular el rango, y el motor
--   (lib/abono-generation.ts) valida el formato del rango y tiene un tope duro de iteraciones. El
--   servidor NO confía en la columna aunque este CHECK exista (una fila vieja, un import, un cambio
--   de constraint futuro). Este CHECK cierra la escritura desde el panel/API PostgREST.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO edita la 054: ya está APLICADA EN PRODUCCIÓN (2026-07-21). Una migración aplicada NO se
--     modifica en el lugar; todo cambio posterior es una migración NUEVA numerada.
--   - NO toca la tabla `abonos`, ni `appointments`, ni `book_slot_atomic`, ni ninguna policy RLS.
--     La columna vive en `businesses`, que ya tiene RLS + policies owner-only; el CHECK es aditivo.
--   - NO agrega la FK compuesta (business_id, abono_id) sobre `appointments` (UF-02 de la auditoría):
--     `appointments` es una tabla CALIENTE con constraints existentes (011 índice único / 013
--     exclusion) y hoy ninguna lectura cruza tenants (el motor filtra toda query por business_id).
--     El riesgo de tocarla no se justifica → queda DIFERIDO y anotado.
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado + 040..055 en orden. Prod se aplica A MANO coordinado con el
--     deploy + `NOTIFY pgrst, 'reload schema';`. Tras aplicar, regenerar `supabase/schema.sql`
--     (patrón del repo, igual que 037/039/042/043/052/054).

-- ── 1. Normalizar PRIMERO los valores fuera de rango (si no, el CHECK no se puede crear) ────────
UPDATE "public"."businesses"
   SET "abono_window_weeks" = LEAST(GREATEST("abono_window_weeks", 1), 52)
 WHERE "abono_window_weeks" IS NOT NULL
   AND ("abono_window_weeks" < 1 OR "abono_window_weeks" > 52);

-- ── 2. DESPUÉS el CHECK. Idempotente: sólo se crea si no existe (re-correr la migración es no-op) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'businesses_abono_window_weeks_range'
       AND "conrelid" = '"public"."businesses"'::"regclass"
  ) THEN
    ALTER TABLE "public"."businesses"
      ADD CONSTRAINT "businesses_abono_window_weeks_range"
      CHECK ("abono_window_weeks" IS NULL OR "abono_window_weeks" BETWEEN 1 AND 52);
  END IF;
END
$$;
