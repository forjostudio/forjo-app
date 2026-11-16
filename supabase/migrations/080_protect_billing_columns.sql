-- 080 — Las columnas con las que el webhook de suscripción reconoce a un negocio pasan a ser admin.
--
-- ── Contexto ────────────────────────────────────────────────────────────────────────────────────
--   La suscripción deja de pedir el email de Mercado Pago: cada negocio tiene su propio
--   `preapproval_plan` (guardado en `businesses.mp_plan_id_active`, columna que ya existía en el
--   baseline y no usaba nadie) y paga desde el link del plan con la cuenta que quiera. La
--   suscripción que nace ahí NO trae external_reference, así que el webhook encuentra al negocio
--   por `mp_plan_id_active` o por `mp_subscription_id`.
--
--   Hasta hoy esas dos columnas (y `subscription_ends_at`) eran escribibles por el dueño con su
--   sesión: la policy `owner access` le deja hacer UPDATE de su fila y el trigger
--   `businesses_protect_admin_columns` solo protegía has_web_custom/has_whatsapp/plan/plan_status.
--   Con el webhook buscando por ellas, un dueño podía escribir en su fila el plan o la suscripción
--   de OTRO negocio y quedarse con sus eventos de cobro. Ahora las revierte el trigger, igual que
--   al plan: solo el service_role (webhook, CRM) las escribe.
--
-- ── Qué hace ────────────────────────────────────────────────────────────────────────────────────
--   1. Redefine `businesses_protect_admin_columns` sumando mp_subscription_id, mp_plan_id_active y
--      subscription_ends_at a la lista que se revierte.
--   2. Índice único parcial sobre `mp_plan_id_active`: un plan de MP es de UN negocio, y el webhook
--      no puede quedar con dos candidatos.
--
-- ── Qué NO hace ─────────────────────────────────────────────────────────────────────────────────
--   - NO agrega columnas ni toca vistas: no hace falta `NOTIFY pgrst, 'reload schema'`.
--   - NO toca datos. Ningún código escribía `mp_plan_id_active`, así que en prod debería estar en
--     NULL en todas las filas. Verificar ANTES de aplicar (si no da 0, PARAR: el índice abortaría):
--       SELECT count(*) FROM public.businesses WHERE mp_plan_id_active IS NOT NULL;  -- 0
--   - El trigger NO se recrea: sigue apuntando a la misma función, que se reemplaza.

CREATE OR REPLACE FUNCTION "public"."businesses_protect_admin_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- auth.role() devuelve el role del JWT actual: 'service_role' para el admin client,
  -- 'authenticated' para el dueño con sesión, 'anon' para el público. Solo el service-role
  -- puede tocar las columnas administrativas; cualquier otro role las ve revertidas.
  if coalesce(auth.role(), '') <> 'service_role' then
    new.has_web_custom       := old.has_web_custom;
    new.has_whatsapp         := old.has_whatsapp;
    new.plan                 := old.plan;
    new.plan_status          := old.plan_status;
    -- 080: con estas el webhook de suscripción reconoce al negocio (ver cabecera).
    new.mp_subscription_id   := old.mp_subscription_id;
    new.mp_plan_id_active    := old.mp_plan_id_active;
    new.subscription_ends_at := old.subscription_ends_at;
  end if;
  return new;
end;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "businesses_mp_plan_id_active_key"
  ON "public"."businesses" ("mp_plan_id_active")
  WHERE "mp_plan_id_active" IS NOT NULL;
