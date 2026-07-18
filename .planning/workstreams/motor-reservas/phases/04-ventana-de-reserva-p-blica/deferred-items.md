# Deferred / Out-of-scope discoveries — Phase 04

## schema.sql drift pre-existente (NO tocado por 04-01)

Al regenerar via `supabase db dump --local` durante Task 1 (04-01), el dump del baseline local
(migraciones 001..052) reveló que `supabase/schema.sql` committeado en esta rama está desactualizado
respecto a migraciones **anteriores** a la 052:

- Faltan las tablas `app_settings` (migr. 048), `landing_content` y `landing_leads` (junto con sus
  PKs, RLS policies y grants).
- El orden de las vistas `public_canchas` / `public_professionals` y el índice
  `professionals_service_id_idx` difiere del dump.

Esto es drift generado por migraciones 048-051 que no regeneraron `schema.sql`. **Está fuera del scope
de 04-01** (SCOPE BOUNDARY: solo se corrige lo que introduce el cambio actual). Por eso schema.sql se
editó quirúrgicamente para agregar SOLO las 2 columnas de la ventana (tabla + vista), evitando arrastrar
el drift ajeno y el reformateo de whitespace del dump.

**Acción sugerida (fuera de esta fase):** regenerar `schema.sql` completo desde el baseline local para
reconciliar 048-051, en un commit/fase dedicada de mantenimiento de schema.
