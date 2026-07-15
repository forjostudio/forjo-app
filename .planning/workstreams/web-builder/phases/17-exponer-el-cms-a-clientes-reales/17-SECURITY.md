---
phase: 17-exponer-el-cms-a-clientes-reales
workstream: web-builder
audited: 2026-07-15
auditor: gsd-security-auditor
asvs_level: 1
block_on: high
threats_total: 10
threats_closed: 10
threats_open: 0
accepted_risks: 2
status: SECURED
---

# Phase 17: Exponer el CMS a clientes reales — Auditoría de Seguridad

Fase security-sensitive: se retira el kill-switch fail-closed `CMS_ENABLED` y `has_web_custom` (el add-on
pago) queda como ÚNICO gate del CMS en sus 4 superficies (guardar / publicar / descartar / upload). El
registro de amenazas se redactó en tiempo de plan (`register_authored_at_plan_time: true`). Esta auditoría
VERIFICA que cada mitigación declarada existe en el código shippeado — no se acepta documentación ni
intención como evidencia. Cada fila abajo está respaldada por una referencia file:line y, donde aplica, por
una corrida de test en vivo.

**Resultado: SECURED — 10/10 amenazas resueltas (8 mitigadas + verificadas, 2 aceptadas; 0 abiertas).**

## Verificación de amenazas

| Threat ID | Categoría | Disposición | Estado | Evidencia |
|-----------|-----------|-------------|--------|-----------|
| T-17-01 | Elevation (barrido del flag: page + 3 actions + copy) | mitigate | CLOSED | Barrido de cierre `grep -rn "CMS_ENABLED\|cms_disabled" app/ lib/ components/ scripts/` = **0 matches** (corrido en esta auditoría, exit 1). Único gate en pie = `has_web_custom`: `page.tsx:62` (`if (!business.has_web_custom) return <WebUpsell .../>`) + `_landing-actions.ts:98/155/218` (early-return `not_entitled`). Nav item agregado sin gatear: `sidebar.tsx:65` (`web: { href: '/web', label: 'Mi web', icon: Globe }`) + `verticals.ts:58/80/101/122` (`'web'` en los 4 menús); comentario `sidebar.tsx:62-63` confirma "NO se gatea por has_web_custom". |
| T-17-02 | Elevation/Tampering (upsell abre la LECTURA de `/web`) | mitigate | CLOSED | La page ramifica read-only: `page.tsx:62-64` retorna `<WebUpsell>` ANTES del `Promise.all` del preview. `_web-upsell.tsx` es RSC estático sin ruta de escritura (solo `<a href={UPGRADE_URL}>` y `<Link href={/slug}>`; cero llamada a Server Action). Las 3 Server Actions NO se relajan: `_landing-actions.ts:98` (save), `:155` (publish), `:218` (discard) siguen con `if (!business.has_web_custom) return { ok:false, error:'not_entitled' }`. Un POST directo de un no-entitled se corta en la acción. |
| T-17-03 | Spoofing/Tampering (`business_id` inyectado por el cliente) | mitigate | CLOSED | `has_web_custom` se resuelve SIEMPRE contra la sesión, nunca de un body: `page.tsx:47` `.eq('owner_id', user.id).single()`; acciones `_landing-actions.ts:89` (save), `:149` (publish), `:213` (discard) — todas `.eq('owner_id', user.id)` y el `.update` apunta a `.eq('id', business.id)`. No hay body que resuelva el tenant (publish/discard son sin argumentos). |
| T-17-04 | Elevation (dueño se auto-otorga `has_web_custom` vía anon key) | mitigate | CLOSED | Trigger `businesses_protect_admin_columns` en `032_crm_admin.sql:88-112`: `if coalesce(auth.role(),'') <> 'service_role'` → `new.has_web_custom := old.has_web_custom` (`:98-99`), revierte cualquier UPDATE no-service_role. **Test en vivo:** `test/isolation.test.ts:177` ('A NO puede auto-otorgarse has_web_custom') — `anonA.update({ has_web_custom: true })` seguido de `expect(after?.has_web_custom).toBe(false)` (`:201`), con anon-key. |
| T-17-05 | Info disclosure (fuga de columnas sensibles al bundle) | mitigate | CLOSED | `page.tsx:44-46` conserva el select de COLUMNAS EXPLÍCITAS (`'id, owner_id, slug, ... has_web_custom, landing_config, landing_draft'`), NO `select('*')`. El upsell solo recibe la prop `slug` (`_web-upsell.tsx:15`) y el nav item no agrega datos al payload → ninguna superficie nueva de este plan amplía el bundle del cliente. |
| T-17-06 | Tampering/Elevation (upload de un no-entitled directo a Storage) | mitigate | CLOSED | Migración `051_landing_assets_gate_entitlement.sql` agrega `AND has_web_custom = true` al subquery de businesses en INSERT (`:51-52`, WITH CHECK) y UPDATE (`:64-66` USING + `:71-73` WITH CHECK). Policy DELETE intacta. **Verificado LIVE en PROD** (checkpoint Task-3, `17-02-SUMMARY.md:97`): dueño con `has_web_custom=false` → subida RECHAZADA (antes de 051 daba 200); entitled → OK. El test automático de aislamiento `test/isolation.test.ts:214` cubre el rechazo, guardado por `RUN_STORAGE_TESTS` (skip limpio local, Storage OFF por diseño). |
| T-17-07 | Elevation (DELETE del bucket queda owner-only) | accept | CLOSED | La migración 051 NO toca la policy DELETE ("landing-assets owner delete", owner-only heredada de 030); documentado en `051:20-22`. Borrar assets propios no es escalada ni pone contenido en la web pública; permite que un negocio recién desactivado limpie sus objetos. Riesgo aceptado registrado abajo (AR-17-01). |
| T-17-08 | Tampering (051 rompe la skill del operador o el logo de settings) | mitigate | CLOSED | El writer de la skill usa service-role → bypassa RLS, inmune al cambio de policy (documentado `051:23`); el logo de Configuración usa OTRO bucket, no `landing-assets` (`051:24`). **Verificado LIVE** (checkpoint Task-3, `17-02-SUMMARY.md:99-100`): subida service-role vía dashboard sigue OK; cambio de logo en Configuración intacto. |
| T-17-09 | Availability/Regresión (migración sobre `storage.objects` rompe el reset local) | mitigate | CLOSED | Todo el DDL va guardado por `IF to_regclass('storage.objects') IS NOT NULL THEN` (`051:42`) con DROP/CREATE POLICY vía `EXECUTE` dinámico dentro del bloque `DO`. No-op en local (storage OFF), aplica en prod/staging. `supabase db reset --local` corrió limpio con 051 como no-op (`17-02-SUMMARY.md:66,91`). |
| T-17-SC | Tampering (supply chain — instalación de paquetes npm) | accept | CLOSED | Cero dependencias nuevas: `17-01-SUMMARY.md` y `17-02-SUMMARY.md` ambos con `tech-stack.added: []`. Sin superficie de instalación. Riesgo aceptado registrado abajo (AR-17-02). |

**Evidencia comportamental (referenciada de los SUMMARY + corrida en esta auditoría):**
- Barrido de cierre `grep -rn "CMS_ENABLED\|cms_disabled" app/ lib/ components/ scripts/` → 0 matches (corrido ahora, exit 1). Regla dura D-04 satisfecha.
- `npx tsc --noEmit` verde en toda la superficie tocada (`17-01-SUMMARY.md:106`).
- `npm test` completo → 553 tests verdes, incluye `isolation` (trigger anti-tampering) y `verticals` 10/10 (`17-01-SUMMARY.md:108`).
- `supabase db reset --local` → completa con 051 como no-op (baseline replayable, storage OFF) (`17-02-SUMMARY.md:66`).
- Checkpoint blocking-human APROBADO: gate del upload verificado EN VIVO contra Storage real de PROD — no-entitled rechazado, entitled OK, bypass service-role esperado, logo (otro bucket) intacto (`17-02-SUMMARY.md:93-103`).

## Riesgos aceptados

### AR-17-01 — DELETE del bucket `landing-assets` queda owner-only, sin gatear por `has_web_custom`

- **Disposición:** ACCEPT (T-17-07). Documentado, mismo-tenant, sin superficie de escalada.
- **Origen:** La migración 051 endurece INSERT+UPDATE del bucket con `AND has_web_custom = true`, pero deja la
  policy DELETE ("landing-assets owner delete") como owner-only (heredada de 030).
- **Por qué NO es una amenaza abierta:**
  1. Borrar objetos propios no es elevación de privilegios ni pone contenido en la web pública — solo remueve
     assets del propio prefijo `{business_id}/`.
  2. El aislamiento cross-tenant se mantiene: la policy DELETE sigue acotada a `owner_id = auth.uid()`, así que
     un dueño no puede borrar assets de otro negocio.
  3. Es un comportamiento intencional: permite que un negocio recién desactivado (add-on revocado) limpie sus
     propios objetos huérfanos (RESEARCH Open Q2).
- **Riesgo residual:** BAJO. Auto-infligido, mismo-tenant, sin exfiltración ni escalada.

### AR-17-02 — Supply chain (instalación de paquetes) fuera del alcance de esta fase

- **Disposición:** ACCEPT (T-17-SC). N/A este plan.
- **Origen:** Ambos planes (17-01, 17-02) declaran `tech-stack.added: []`. No se instaló ningún paquete npm.
- **Por qué NO es una amenaza abierta:** sin superficie de instalación, no hay dependencia nueva que auditar.
- **Riesgo residual:** NINGUNO introducido por esta fase.

## Flags no registrados (Unregistered Flags)

Ninguno. `17-01-SUMMARY.md` `## Threat Flags` reporta "None - no se introdujo superficie de seguridad nueva.
El plan RESTA un gate (flag) y CONECTA UX de lectura...". `17-02-SUMMARY.md` `## Threat Flags` reporta "None -
no se introdujo superficie de seguridad nueva. El plan CIERRA una superficie de escritura (el upload)...".
Verificado de forma independiente: la única migración de la fase es `051_landing_assets_gate_entitlement.sql`
(que ENDURECE, no abre, la RLS del bucket); no hay endpoint nuevo, y ninguna superficie nueva usa service-role
en el runtime web.

## Conclusión

Las 10 amenazas del registro resuelven: 8 `mitigate` verificadas presentes en el código shippeado con
evidencia file:line — reforzadas por la verificación LIVE en producción del gate del upload (T-17-06/T-17-08)
en el checkpoint blocking-human — y 2 `accept` (DELETE owner-only, supply chain) confirmadas como riesgos
documentados que no rompen el aislamiento cross-tenant ni habilitan escalada. El barrido de cierre del
kill-switch retirado es 0 matches: `has_web_custom` sostiene solo como gate único en las 4 superficies del CMS
(page + 3 Server Actions + RLS del bucket). `block_on: high` se satisface: cero amenazas high/critical abiertas.

**Phase 17 está SECURED.**
