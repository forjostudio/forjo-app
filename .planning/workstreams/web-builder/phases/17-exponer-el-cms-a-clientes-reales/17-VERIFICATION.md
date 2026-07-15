---
phase: 17-exponer-el-cms-a-clientes-reales
verified: 2026-07-15T18:26:04Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 17: Exponer el CMS a clientes reales — Verification Report

**Phase Goal:** El add-on `has_web_custom` es el ÚNICO gate — un dueño con el add-on entra a su editor desde el panel sin ningún flag de entorno, y uno SIN el add-on no llega al editor NI logra escribir su landing aunque postee directo (el gate vive en la acción, no solo en la page). Fase security-sensitive: se retira el kill-switch fail-closed `CMS_ENABLED` y queda un solo gate en pie.

**Verified:** 2026-07-15T18:26:04Z
**Status:** passed
**Re-verification:** No — verificación inicial

## Goal Achievement

### Observable Truths (Success Criteria del ROADMAP §17)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Un dueño con `has_web_custom` encuentra "Mi web" en el sidebar y edita sin ninguna variable de entorno | ✓ VERIFIED | `components/dashboard/sidebar.tsx:65` — `web: { href: '/web', label: 'Mi web', icon: Globe }` en el record `ITEMS`, key `'web'` en `NAV_GROUPS` grupo GESTIÓN (línea 43). `lib/verticals.ts` — `'web'` presente en los 4 arrays `menu` (salud L58, belleza L80, general L101, canchas L122). `app/(dashboard)/web/page.tsx` no importa ni usa `CMS_ENABLED`; solo rama por `business.has_web_custom` resuelto de la sesión (`owner_id = auth.uid()`, línea 47). |
| 2 | Un dueño SIN el add-on no llega al editor NI logra escribir su landing aunque postee directo — incl. UPLOAD | ✓ VERIFIED | `page.tsx:62-64` — sin `has_web_custom` retorna `<WebUpsell slug={business.slug}/>` (no editor, no 404) ANTES del `Promise.all`. Las 3 Server Actions (`saveLandingDraft`, `publishLanding`, `discardLandingDraft` en `_landing-actions.ts`) re-chequean `has_web_custom` de la sesión y devuelven `not_entitled` (líneas 98, 155, 218) — confirmado `grep -c "not_entitled"` = 4 (3 gates + 1 uso). Superficie de upload: migración `051_landing_assets_gate_entitlement.sql` agrega `AND has_web_custom = true` a las policies INSERT+UPDATE del bucket `landing-assets`; verificado EN VIVO en producción (17-02-SUMMARY.md §Checkpoint Verification): no-entitled rechazado (403), entitled funciona, bypass service-role/logo intactos. |
| 3 | Para todo lo demás no cambia nada (sin add-on siguen viendo /[slug]; publicadas siguen al aire) | ✓ VERIFIED | Ningún archivo de `app/[slug]/**` fue tocado por ninguno de los dos planes (`files_modified` de ambos PLAN.md acotado a `app/(dashboard)/web/`, `components/dashboard/sidebar.tsx`, `lib/verticals.ts`, la migración y el test). La policy DELETE del bucket queda exactamente igual a la 030 (confirmado por diff de cláusulas). El gate de escritura (`has_web_custom`) es el mismo que ya regía las Server Actions desde antes — solo se retiró el flag adicional, no se tocó la lógica de publicación de Phase 15/16. |
| 4 | Kill-switch `CMS_ENABLED` y el código de error muerto `cms_disabled` retirados de las 3 superficies TS (D-04) | ✓ VERIFIED | `grep -rn "CMS_ENABLED\|cms_disabled" app/ lib/ components/ scripts/` → 0 matches (comando ejecutado directamente por el verificador, no tomado del SUMMARY). |
| 5 | PUB-01 trazado correctamente (PLAN frontmatter + REQUIREMENTS.md) | ✓ VERIFIED | `17-01-PLAN.md` y `17-02-PLAN.md` declaran `requirements: [PUB-01]`. `REQUIREMENTS.md:33` y `:70` marcan PUB-01 como `[x]` / `Complete`, mapeado a "Phase 17 — Exponer el CMS a clientes reales". Sin requisitos huérfanos adicionales mapeados a Phase 17. |

**Score:** 5/5 truths verified (0 presentes-sin-comportamiento-verificado)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/(dashboard)/web/_web-upsell.tsx` | Server Component `WebUpsell`, CTA a `UPGRADE_URL` | ✓ VERIFIED | Existe, 65 líneas, export nombrado `WebUpsell`, sin `'use client'`, `<a href={UPGRADE_URL} target="_blank" rel="noopener noreferrer">`, touch target ≥44px (`min-h-[44px]`), focus visible (`focus-visible:ring`), tokens del design system (`bg-card`, `text-foreground`, `bg-primary`). |
| `app/(dashboard)/web/page.tsx` | Render condicional editor/upsell; flag retirado | ✓ VERIFIED | Sin `notFound`, sin `CMS_ENABLED`; importa y renderiza `WebUpsell` cuando `!business.has_web_custom`, antes del `Promise.all`. Select de columnas explícitas intacto (incluye `slug`, `has_web_custom`, ambos configs). |
| `app/(dashboard)/web/_landing-actions.ts` | 3 Server Actions sin flag global; gate `has_web_custom` intacto | ✓ VERIFIED | 0 matches del flag; `not_entitled` presente 4 veces (3 early-returns + copy relacionada); resolución de `business_id` siempre por `owner_id = auth.uid()`, nunca de `input`. |
| `app/(dashboard)/web/web-client.tsx` | `ACTION_ERROR_COPY` sin código de error muerto | ✓ VERIFIED | 0 matches de `cms_disabled`; `not_entitled` y `server_error` presentes en el mapa. |
| `components/dashboard/sidebar.tsx` | Item `web` en `ITEMS` + grupo GESTIÓN | ✓ VERIFIED | `web: { href: '/web', label: 'Mi web', icon: Globe }` (L65); `'web'` en `keys` del grupo GESTIÓN (L43); import de `Globe` de lucide-react (L17). No gateado por `has_web_custom`. |
| `lib/verticals.ts` | `'web'` en los 4 arrays `menu` | ✓ VERIFIED | Confirmado en salud, belleza, general y canchas (grep ≥4 ocurrencias). |
| `supabase/migrations/051_landing_assets_gate_entitlement.sql` | Gate `has_web_custom` en INSERT+UPDATE del bucket, DELETE intacto | ✓ VERIFIED | Re-crea "landing-assets owner insert" y "landing-assets owner update" con `AND has_web_custom = true`; DELETE no se toca (confirmado diff contra `030_landing_config_and_storage.sql`); todo el DDL guardado por `to_regclass('storage.objects') IS NOT NULL`. `npx supabase db reset --local` completa sin error (051 no-opea localmente como se esperaba). |
| `test/isolation.test.ts` | Caso de upload-gate guardado por flag de Storage | ✓ VERIFIED | `it.skipIf(!hasStorageTests)('upload-gate: A sin has_web_custom NO puede subir a landing-assets ...')` (L214); usa solo cliente anon (`anonA`). Caso del trigger anti-tampering (auto-otorgarse `has_web_custom`) sigue presente y verde. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `page.tsx` | `_web-upsell.tsx` | import + render condicional pre-`Promise.all` | ✓ WIRED | `import { WebUpsell } from './_web-upsell'` + `return <WebUpsell slug={business.slug} />` antes del fetch del preview. |
| `_web-upsell.tsx` | `lib/plans.ts` | `UPGRADE_URL` | ✓ WIRED | `import { UPGRADE_URL } from '@/lib/plans'`, usado en el `href` del CTA. |
| `sidebar.tsx` | `lib/verticals.ts` | `resolveVertical(business).menu` filtra la key `'web'` | ✓ WIRED | `buildNavGroups` construye `menu = new Set(v.menu)` y filtra `g.keys.filter(k => menu.has(k))`; los 4 verticales incluyen `'web'`. |
| `051.sql` (RLS) | `businesses.has_web_custom` | subquery `owner_id = auth.uid() AND has_web_custom = true` | ✓ WIRED | Confirmado en el cuerpo de las policies INSERT/UPDATE re-creadas. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| PUB-01 | 17-01-PLAN.md, 17-02-PLAN.md | CMS expuesto con `has_web_custom` como único gate, sin `CMS_ENABLED` | ✓ SATISFIED | Kill-switch retirado (0 matches), gate único verificado en page + 3 Server Actions + RLS del bucket; `REQUIREMENTS.md` lo marca `[x]`/`Complete`. |

No requisitos huérfanos: PUB-01 es el único requisito mapeado a Phase 17 en `REQUIREMENTS.md`.

### Anti-Patterns Found

Ninguno. Se corrió `grep -iE "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|coming soon|not yet implemented"` sobre los 9 archivos tocados por la fase; todos los matches son falsos positivos (palabra "todo/TODO" en español como "all", `RUBRO_PLACEHOLDERS` como campo de UI legítimo, "hackeado"/"hacked" como datos de prueba en `isolation.test.ts`). Ningún marcador de deuda real.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `CMS_ENABLED`/`cms_disabled` ausentes del código de producción | `grep -rn "CMS_ENABLED\|cms_disabled" app/ lib/ components/ scripts/` | 0 matches | ✓ PASS |
| Type-check completo | `npx tsc --noEmit` | sin salida (verde) | ✓ PASS |
| Lint scoped a los 6 archivos de 17-01 | `npx eslint page.tsx _web-upsell.tsx _landing-actions.ts web-client.tsx sidebar.tsx verticals.ts` | sin salida (verde) | ✓ PASS |
| Suite de aislamiento + verticales | `npx vitest run test/isolation.test.ts test/verticals.test.ts` | 23 passed \| 1 skipped (24) | ✓ PASS — el skip es el caso de upload-gate guardado por `RUN_STORAGE_TESTS`, esperado en local (Storage OFF) |
| Migración 051 no rompe el baseline local | `npx supabase db reset --local` | completa sin error, 051 aplica como no-op (storage.objects ausente) | ✓ PASS |

### Probe Execution

No se declararon probes formales (`scripts/*/tests/probe-*.sh`) para esta fase; el mecanismo de verificación funcional del gate de upload fue el checkpoint humano bloqueante (Task 3 de 17-02), documentado abajo.

### Human Verification (ya completada — checkpoint bloqueante del plan)

La superficie de UPLOAD (4ª superficie de escritura) no puede probarse en local porque Supabase Storage está OFF en el baseline local (`supabase/config.toml` → `[storage] enabled = false`). El plan 17-02 incluyó un `checkpoint:human-verify` bloqueante (Task 3) que el desarrollador ejecutó y aprobó en producción:

- Dueño con `has_web_custom = false` intentando subir imagen desde `/web` → RECHAZADO (antes de 051 daba 200).
- Dueño con `has_web_custom = true` → sube con normalidad (editor de Phase 14 no se rompe).
- Bypass service-role (skill del operador) y logo de Configuración (otro bucket) → sin regresión.

Esta evidencia consta en `17-02-SUMMARY.md` §"Checkpoint Verification (Task 3 — blocking-human, APROBADO)" y es la prueba en vivo de SC2 en la superficie de upload, ya que el equivalente automatizado local solo puede skipear (`RUN_STORAGE_TESTS` no seteado). No se requiere verificación humana adicional para cerrar esta fase.

### Gaps Summary

Ninguno. Los 5 must-haves consolidados de ROADMAP + PLAN frontmatter se verificaron contra el código real (no contra las afirmaciones del SUMMARY): flag retirado (grep independiente = 0), gate único sostenido en page + 3 Server Actions + RLS del bucket, nav item visible en los 4 verticales sin gate, migración 051 no rompe el baseline y deja DELETE intacto, `tsc`/lint/tests verdes ejecutados directamente por el verificador. PUB-01 trazado sin huérfanos.

---

_Verified: 2026-07-15T18:26:04Z_
_Verifier: Claude (gsd-verifier)_
