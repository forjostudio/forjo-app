---
phase: 01-rls-lockdown-secret-isolation
plan: 05
subsystem: database
tags: [rls, supabase, secrets, migration, security, destructive]
requires: [01-01, 01-02, 01-03, 01-04]
completed: 2026-06-16
status: complete
---

# Phase 1 Plan 05: cierre destructivo (028) + remoción de fallback + rotación

Paso final de SEC-01 (D-02 paso d). Cierra el agujero de forma definitiva: dropea las policies abiertas de `services`/`business_hours` y borra las 7 columnas-secreto de `businesses`, deja `business_secrets` como fuente única, y documenta la rotación de claves comprometidas (D-06).

## Qué se hizo

- **Migración 028 destructiva** (`supabase/migrations/028_lock_base_tables_and_drop_secret_columns.sql`, commit `7591cc2`): `DROP POLICY IF EXISTS "public read services" ON services` y `"public read hours" ON business_hours` (nombres exactos verificados), más `ALTER TABLE businesses DROP COLUMN IF EXISTS` de los 7 secretos. Idempotente. **Aplicada a mano por el usuario en Supabase.**
- **Remoción del fallback de transición** (`lib/business-secrets.ts`, commit `d53fed0`): `getBusinessSecrets()` ahora lee solo de `business_secrets`; sin fila → EMPTY. Las columnas viejas ya no existen, el fallback quedaba muerto.
- **Runbook de rotación** (`ROTATION-RUNBOOK.md`, D-06 = ROTAR): el usuario confirmó exposición real de secretos en la URL pública; la rotación es acción operativa fuera del repo (reconectar MP/Google OAuth, regenerar Resend/reCAPTCHA por negocio).

## Gates humanos honrados

1. **Smoke test (human-verify):** el usuario deployó las olas 1-2 y verificó en vivo página pública, pago de seña end-to-end, dashboard de secretos y Google Calendar. PASÓ antes de tocar columnas.
2. **Aplicación de 028 (human-action, BLOCKING):** aplicada a mano por el usuario (no `supabase db push` — este proyecto migra a mano).

## Evidencia de verificación (SEC-01 cumplido)

- Como `anon`, `SELECT * FROM services` y `FROM business_hours` → **0 filas** (RLS filtra; "no denegada" pero 0 filas = comportamiento RLS correcto sin policy de lectura anon).
- `SELECT count(*) FROM public_services` como anon → **3** (vista acotada sirve lo público).
- Columnas-secreto eliminadas de `businesses` (DROP COLUMN aplicado).
- `npx tsc --noEmit` limpio en todo el proyecto tras la remoción del fallback.

## Self-Check: PASSED
