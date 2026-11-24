-- 081 — clients.last_name: apellido opcional del cliente, solo para el panel (quick 261124-lfd).
--
-- Contexto:
--   Hasta acá el cliente tenía un único campo `name` y el dueño metía nombre y apellido juntos (o solo
--   el nombre). El panel pasa a cargar el apellido por separado, opcional, en el alta manual y en la
--   edición de la ficha, y a mostrar «Nombre Apellido» donde muestra un cliente. Desde esta migración
--   `name` se lee como NOMBRE DE PILA y `last_name` como APELLIDO.
--
-- Qué hace:
--   1. ALTER TABLE clients ADD COLUMN last_name text — nullable, sin default.
--   2. NOTIFY pgrst, 'reload schema' — columna nueva → PostgREST tiene que refrescar su cache (como 061-065).
--
-- Qué NO hace:
--   - NO hace backfill ni split del `name` existente: los clientes que hay son de prueba y quedan con
--     last_name NULL. Partir "Juan Pérez" en dos adivinando dónde corta sería inventar datos.
--   - NO agrega CHECK de largo ni de contenido: `clients.name` no tiene (solo trim + mínimo 1 en la app) y
--     `professionals.last_name` (migr. 007) es text pelado. Además el confirm del import hace UN solo batch
--     insert: un CHECK haría que una celda mala tire el import entero. La normalización (trim; vacío → NULL)
--     vive en la app, en lib/client-name.ts (normalizeLastName).
--   - NO agrega policy RLS: `clients` ya es RLS por business_id (policies «business member access» y
--     «clients tenant insert») y el GRANT es a nivel tabla, así que la columna hereda ese aislamiento.
--   - NO toca la RPC atómica de reserva ni ninguna vista pública (ninguna expone clients). La reserva
--     pública sigue con un solo campo de nombre.
--   - NO se aplica vía `supabase db push` remoto. La única validación autónoma es `supabase db reset` local.
--
-- ⚠ ACOPLADA AL DEPLOY: el código nuevo pide y escribe last_name por nombre (alta, import, export, lista de
--   abonos). En staging y en prod se aplica A MANO, desde el SQL Editor, ANTES de deployar (el NOTIFY va
--   incluido). Sin la columna, esas pantallas fallan con PGRST204 / 42703.

-- ── clients.last_name: apellido opcional (nullable, sin default) ─────────────────────────────
ALTER TABLE "public"."clients"
  ADD COLUMN IF NOT EXISTS "last_name" text;

-- ── Recargar el schema cache de PostgREST (obligatorio tras DDL) ─────────────────────────────
NOTIFY pgrst, 'reload schema';
