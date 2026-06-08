# Migraciones — Forjo Gestión

`../schema.sql` es el **estado base** (tablas núcleo + RLS inicial). Estos archivos son los
cambios incrementales que se aplicaron después, uno por feature. Correr **en orden**, una
vez cada uno, en el SQL editor de Supabase (o vía `supabase db`).

## Orden de corrida

Sobre una base de datos **vacía**:

0. `../schema.sql` — base (tablas + RLS inicial)
1. `001_payments_deposits_notifications.sql` — MercadoPago, señas, Resend, reCAPTCHA
2. `002_verticals_salud.sql` — rubros + historia clínica + adjuntos (tabla) + backfill
3. `003_storage_attachments.sql` — bucket privado de adjuntos + policy (depende de 002)
4. `004_fixed_expenses.sql` — gastos fijos (tabla + RLS por operación)
5. `005_dashboard_widgets.sql` — columna `dashboard_widgets`
6. `006_palette.sql` — columna `palette`
7. `007_professionals_extended.sql` — apellido/especialidad/matrícula/contacto + vista
   pública acotada `public_professionals` (reemplaza la lectura pública de la tabla)
8. `008_email_delivery.sql` — flag `email_sent`/`email_error` en turnos + `resend_from` por negocio
9. `009_cancel_token.sql` — `cancel_token` por turno (link de cancelación del email)
10. `010_rename_phone_to_whatsapp.sql` — renombra `businesses.phone` → `whatsapp` (coordinar con el deploy)

Sobre una base de datos que **ya tiene parte del esquema** aplicado: correr cualquiera de
001–010 es seguro (son no-ops idempotentes si ya están). Los pendientes que suelen faltar
en una base que arrancó de `schema.sql` y se fue actualizando a mano son **007–010**:

- **007** — campos de profesionales + vista acotada `public_professionals`.
- **008** — `resend_from` por negocio + `email_sent`/`email_error` en turnos (flujo de emails).
- **009** — `cancel_token` por turno (link de cancelación del email/cliente).
- **010** — renombra `businesses.phone` → `whatsapp`. ⚠ Acoplada al deploy: el código nuevo
  lee `whatsapp` (booking público, onboarding, settings, emails). Sin esta migración esas
  queries fallan contra una columna `phone`. Correr en cuanto se deploya el código.

## Reglas

- **Idempotentes**: `IF NOT EXISTS`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`,
  `CREATE OR REPLACE VIEW`, `ON CONFLICT DO NOTHING`. Correr dos veces no rompe.
- **Nada destructivo**: no hay `DROP TABLE` / `DROP COLUMN` / `DELETE`. El único `DROP` es
  de policies (RLS), marcado con `⚠` donde cambia el acceso.
- **Excepción de idempotencia marcada con `⚠`**: el backfill de `businesses.vertical` en
  `002` es un `UPDATE` de datos; es convergente pero pisa un vertical seteado a mano si no
  coincide con el `type`. Pensado para correr una sola vez.
