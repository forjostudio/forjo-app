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

## Milestone: v0.18 — CMS Publish / Go-live

**Shipped:** 2026-07-16
**Phases:** 3 (15-17) | **Plans:** 8 | **Tasks:** 15

### What Was Built
Guardar dejó de publicar, y el CMS se abrió a clientes reales:
- PUB-03..08 (Phase 15): `landing_draft` vs `landing_config` (migración 050, aditiva con backfill). Guardar persiste el borrador; publicar/descartar son copia **server-side** (nunca se acepta el config del body); editor de 3 estados con compare canónico inmune al reorden de claves del `jsonb`; go-live implícito.
- SKILL-07/08 (Phase 16): `scripts/setup-landing.ts` escribe el BORRADOR (`--publish` opt-in), `--inspect` separa al-aire de pendiente-de-aprobación, key de Storage derivada del contenido (sha256) → escritura idempotente.
- PUB-01 (Phase 17): retiro del kill-switch `CMS_ENABLED`; `has_web_custom` queda como ÚNICO gate; upsell "Web a medida" para no-entitled; migración 051 cierra el upload en la RLS del bucket.

### What Worked
- **El orden LOCKED (15 → 16 → 17) ERA el contenido del milestone**, no una preferencia. Poner PUB-01 último fue la decisión de diseño central: exponer el editor mientras cada guardado salía al aire era exactamente el bug que el milestone venía a evitar.
- **El research de la Phase 17 encontró un agujero que el CONTEXT no sabía que existía**: el upload de imágenes NO gateaba `has_web_custom` (sube directo browser→Storage, sin Server Action; su único gate era la RLS del bucket, que chequeaba `owner_id` pero no el add-on). Sin ese hallazgo, el milestone shipeaba con SC2 incompleto. Lo forzó el ítem MANDATORY del CONTEXT: *"verificar, no asumir"*.
- El **checkpoint blocking-human** de la migración 051 evitó auto-aprobar una verificación de producción que nadie había hecho.
- Verificar el gate **directo en prod** (staging pausado) fue seguro porque el cambio era puramente restrictivo + reversible, y el orden DB-first lo permitía.

### What Was Inefficient
- **El CONTEXT de la Phase 17 estaba stale**: citaba `NAV_ITEMS` como el mecanismo del sidebar, cuando hoy es `NAV_GROUPS` + `buildNavGroups` filtrando contra `resolveVertical(business).menu` (y ningún vertical tenía `'web'`). El research lo cazó, pero un CONTEXT desactualizado casi manda al planner por el camino equivocado.
- El **gate de cobertura de decisiones** bloqueó por D-02b "sin citar" aunque estaba funcionalmente cubierto — fix de una línea, pero el gate no distingue *no implementado* de *no citado*.
- El **pre-close audit** marcó el UAT de la Phase 15 como gap siendo `status: passed` con 0 pending → falso positivo.
- `test/concurrency.test.ts` CONC-01 flakea por timeout de 5s bajo la carga de la suite full; pasa 6/6 aislado. Ruido recurrente que obliga a re-verificar cada vez.

### Patterns Established
- **Gate-first deploy ordering:** aplicar la migración restrictiva a prod ANTES de deployar el código que expone la superficie. Deja prod seguro durante toda la ventana entre ambos, y hace el rollback innecesario.
- **Migración con guard de existencia** (`to_regclass('storage.objects') IS NOT NULL`): permite DDL sobre un schema que no existe en local (Storage OFF) sin romper `supabase db reset` — no-opea local, aplica en prod, y el baseline sigue replayable.
- Cuando la única barrera **no-bypasseable** es la RLS (upload directo browser→Storage), el gate del add-on va EN la policy, no en la app.

### Key Lessons
- **Un flag global fail-closed enmascara gates faltantes.** Mientras `CMS_ENABLED` apagaba la ruta entera, nadie notó que el upload no chequeaba el add-on. Retirar un kill-switch no es solo borrar una env var: expone todo lo que tapaba. El threat note que exigía "el gate único tiene que sostener solo" fue lo que obligó a auditar las 4 superficies.
- **Un checkpoint que requiere acción del mundo real no es auto-aprobable, por definición.** En modo `--auto`, el default habría marcado SC2 "verificado" sin que nadie aplicara la migración ni tocara Storage.
- **"Verificar, no asumir" no es ceremonia**: se pidió confirmar el gate del upload y la confirmación devolvió que no existía.

### Deuda / follow-ups
- Rediseñar el upsell "Web a medida" — hoy funciona pero está diseñado para no romper, no para vender (todo capturado en `.planning/todos/pending/`).
- Borrar la env var `CMS_ENABLED` de Vercel (benigna; el código ya no la lee).
- CONC-01 flaky (timeout 5s bajo carga).
- **El norte:** auto-armado de la web al confirmarse el pago del add-on en MP — este milestone fue su prerequisito, ahora está desbloqueado.

## Cross-Milestone Trends

| Milestone | Phases | Plans | Shipped | Nota |
|-----------|--------|-------|---------|------|
| v0.9 Security Hardening | 5 | 11 | 2026-06-17 | Primer milestone GSD; pre-lanzamiento |
| v0.18 CMS Publish / Go-live | 3 | 8 | 2026-07-16 | Borrador/publicar + CMS abierto a clientes; 2 de 3 fases security-sensitive (SECURED 18/18 y 10/10) |

> Nota: v0.10–v0.17 no tienen sección de retrospective (no se corrió `/gsd:complete-milestone` con este archivo en su momento). La tabla salta de v0.9 a v0.18 a propósito.
