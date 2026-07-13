# Retrospective — Forjo App

## Milestone: v0.9 — Security Hardening

**Shipped:** 2026-06-17
**Phases:** 5 | **Plans:** 11 | **Tasks:** ~20

### What Was Built
Cierre de 4 agujeros de seguridad auditados + red de tests anti-regresión, pre-lanzamiento:
- SEC-01: RLS lockdown + `business_secrets` (vistas acotadas, secretos owner-only; migraciones 027/028).
- SEC-02: `verifyMPSignature` compartido fail-closed + chequeo de monto en ambos webhooks MP.
- SEC-03: endpoints admin header-only + `timingSafeEqual`; `setup-plans` movido a script local (superficie web eliminada).
- SEC-04: gating de `plan_status` (blocklist) en booking público.
- TEST-01: suite Vitest (7 webhooks + 3 aislamiento) en CI.
- Extra (029): cierre de `public read appointments USING(true)`, agujero cross-tenant que el test de aislamiento detectó.

### What Worked
- Discuss → research → plan → plan-check → execute → verify → secure → ship por fase, manejado a mano por el usuario: control total entre pasos.
- El orden (DB → pagos → superficies independientes → tests) respetó la dependencia dura SEC-01→SEC-02 y dejó los tests para el final, contra comportamiento correcto.
- Los checkpoints humanos en las migraciones destructivas (027/028) y el env de webhooks evitaron deploys rotos.
- TEST-01 cumplió su razón de ser: cazó un agujero real de producción (029) que las migraciones versionadas no cubrían.

### What Was Inefficient
- El plan-checker falsamente bloqueó por VALIDATION.md/Nyquist en fases tempranas (premisa "no config" equivocada); se resolvió pre-anunciando que Nyquist está off.
- El helper `gsd query commit` reporta `skipped_gitignored` para código trackeado a veces → hubo que commitear con `git` directo.

### Patterns Established
- `.planning/` gitignored + flujo direct-to-main + Vercel: "ship" = `git push origin main`, sin PR (gh no autenticado).
- Worktrees deshabilitados (incompatibles con `.planning/` gitignored): ejecución secuencial en main.
- Vistas públicas acotadas + secretos en tabla owner-only como patrón de aislamiento.

### Key Lessons
- Las policies permissive de Postgres se combinan con OR: una `USING(true)` abierta anula la restrictiva. Auditar TODAS las tablas, no solo las del schema versionado (el agujero 029 vivía out-of-band).
- Tests de RLS DEBEN asertar con anon-key autenticado, nunca service_role (bypassa RLS → falso verde).
- `schema.sql` desactualizado puede recrear agujeros al bootstrappear: mantenerlo en sync con las migraciones.

### Deuda / follow-ups
- Versionar el esquema (el agujero 029 no estaba trackeado) — considerar Supabase CLI migrations (estaba en out-of-scope v2).
- Cargar los 4 GitHub Secrets para que los tests de aislamiento corran en CI (hoy skipean sin creds).

## Cross-Milestone Trends

| Milestone | Phases | Plans | Shipped | Nota |
|-----------|--------|-------|---------|------|
| v0.9 Security Hardening | 5 | 11 | 2026-06-17 | Primer milestone GSD; pre-lanzamiento |
