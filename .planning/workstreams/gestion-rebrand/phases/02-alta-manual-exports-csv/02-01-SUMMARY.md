---
phase: 02-alta-manual-exports-csv
plan: 01
subsystem: db-schema
tags: [migration, clients, origin, types]
status: awaiting-checkpoint
requires: []
provides:
  - "clients.origin column (migr. 049) — text NOT NULL DEFAULT 'reserva' CHECK (reserva|manual|importado)"
  - "Client.origin union literal en lib/types.ts"
  - "schema.sql regenerado con la columna origin"
affects:
  - "supabase/migrations/049_clients_origin.sql"
  - "supabase/schema.sql"
  - "lib/types.ts"
tech-stack:
  added: []
  patterns: ["ADD COLUMN aditivo text+CHECK (analog migr. 043)", "backfill vía DEFAULT", "columna hereda RLS existente sin policy nueva"]
key-files:
  created:
    - supabase/migrations/049_clients_origin.sql
  modified:
    - supabase/schema.sql
    - lib/types.ts
decisions:
  - "D-01: text+CHECK en vez de enum Postgres (evita ALTER TYPE, más extensible)"
  - "Backfill automático vía DEFAULT 'reserva' — sin UPDATE separado (SC-2)"
  - "'importado' reservado para Fase 3 (CHECK ya lo admite, nadie lo escribe todavía)"
  - "Sin policy RLS nueva: clients ya es RLS por business_id, la columna hereda el aislamiento"
  - "schema.sql editado quirúrgicamente (2 líneas) en vez de re-dump completo: el pg_dump del CLI 2.109 reordena todo el archivo y generaría un diff de ~7000 líneas que 'limpia' contenido ajeno — se preserva el diff mínimo"
metrics:
  duration: "~4 min"
  completed: "2026-07-06"
  tasks_completed: 2
  tasks_total: 3
status_note: "2 tasks auto completas + validación local OK; Task 3 (aplicación a staging/prod) GATEADA — pendiente del usuario"
---

# Phase 02 Plan 01: clients.origin (migración 049 + type) Summary

Introduce la columna `origin` en `clients` (migración 049, `text NOT NULL DEFAULT 'reserva' CHECK (reserva|manual|importado)`) y la refleja en el `interface Client` de TypeScript como union literal — la fundación que el badge de origen (SC-2), el alta manual (CLIENT-01) y el import de Fase 3 van a consumir.

## What Was Built

- **Migración 049** (`supabase/migrations/049_clients_origin.sql`): `ALTER TABLE clients ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'reserva' CHECK (origin IN ('reserva','manual','importado'))`. Cabecera densa en español (contexto + racional D-01 + invariantes) espejando el tono de 043. Sin policy nueva, sin tocar migraciones ajenas.
- **`lib/types.ts`**: campo `origin: 'reserva' | 'manual' | 'importado'` agregado al `interface Client` (no opcional, sin `| null`, porque la columna es NOT NULL DEFAULT). Comentario en español explicando la procedencia.
- **`supabase/schema.sql`**: columna `origin` + constraint `clients_origin_check` agregadas al `CREATE TABLE clients` (edit quirúrgico, formato canónico de pg_dump).

## Verification

- `grep` confirma `ADD COLUMN IF NOT EXISTS "origin"` + la cláusula CHECK en la migración 049. Sin `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY`.
- `npx tsc --noEmit` verde con `Client.origin` agregado.
- `supabase db reset` local (PG17, Docker corriendo, CLI 2.109) **corrió limpio**: replayó baseline + 040..049 en orden, migración 049 aplicó sin error sobre `clients`.
- `supabase db dump --local` confirmó que la columna quedó como `"origin" "text" DEFAULT 'reserva'::"text" NOT NULL` + `CONSTRAINT "clients_origin_check"` — el edit de schema.sql refleja exactamente ese estado.

## Deviations from Plan

None — plan ejecutado tal cual. Nota sobre schema.sql: el plan pedía "regenerar con el patrón del repo". El `supabase db dump` del CLI 2.109 reordena/reformatea el archivo completo (~7000 líneas de diff, reescribiría contenido ajeno). Para respetar el diff mínimo se aplicó el cambio quirúrgico (las 2 líneas exactas que el dump produce para `clients`), verificado contra el dump real. El resultado es idéntico en contenido al re-dump para la tabla afectada.

## Checkpoint (D-01 — GATEADO)

Task 3 es `checkpoint:human-verify` con `gate="blocking-human"`. El ejecutor validó SOLO en local y regeneró schema.sql. La aplicación a **staging (forjo-staging)** y **prod** es acción externa del usuario, NO autónoma — ver el marcador de checkpoint devuelto al orquestador.

## Commits

- `fe23edd` feat(02-01): migración 049 — ADD COLUMN clients.origin (text + CHECK)
- `656ac94` feat(02-01): agregar Client.origin (union literal) a lib/types.ts
- `e2521d7` chore(02-01): regenerar schema.sql con clients.origin (migr. 049)

## Self-Check: PASSED

- FOUND: supabase/migrations/049_clients_origin.sql
- FOUND: lib/types.ts (origin campo)
- FOUND: supabase/schema.sql (origin)
- FOUND commit: fe23edd, 656ac94, e2521d7
