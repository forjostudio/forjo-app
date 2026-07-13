# Phase 3: User Setup Required

**Generated:** 2026-07-04
**Phase:** 03-rework-del-selector-de-rubro
**Status:** Incomplete

Un único paso manual: aplicar la migración **047** a la base de **PRODUCCIÓN**. Es un `UPDATE` de
backfill (data-only, aditivo, no destructivo). Se aplica A MANO, coordinada con el deploy del código
de esta fase — disciplina de migraciones del proyecto (Vercel Hobby). **NUNCA `supabase db push`.**

## Environment Variables

Ninguna. Esta fase no agrega variables de entorno.

## Dashboard Configuration

- [ ] **Aplicar `supabase/migrations/047_backfill_vertical.sql` a PRODUCCIÓN**
  - Location: Supabase (prod) → SQL Editor (o `psql` contra la DB de prod)
  - Cuándo: **ANTES o DURANTE** el deploy del código de esta fase (03-02/03-03 vacían
    `VERTICALS[*].types`; si el código se deploya sin el backfill, los negocios existentes con
    `vertical` NULL dejarían de resolver su rubro granular).
  - Qué hace: `UPDATE public.businesses SET vertical = CASE type … END WHERE vertical IS NULL;`
    (escribe `vertical` donde falta, derivándolo del `type`; NO toca `type`).
  - Idempotente: correrla dos veces no rompe (la 2da no hay filas con vertical NULL).
  - NO regenerar `supabase/schema.sql` (el backfill es data-only; no cambia el esquema).

## Verification

Tras aplicar en prod, confirmar la post-condición (debe dar 0):

```sql
SELECT count(*) FROM businesses WHERE vertical IS NULL;
```

Validación local ya hecha (no repetir en prod):
- `supabase db reset` → exit 0 (047 aplica limpio sobre baseline + 040..047).
- Backfill probado en PG local: Peluquería→belleza, Estética→belleza, Cancha de pádel→canchas,
  Médico→salud, texto libre→general; 0 filas con vertical NULL.

Expected: el `SELECT count(*)` de arriba devuelve `0`.

---

**Once all items complete:** Mark status as "Complete" at top of file.
