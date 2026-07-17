---
phase: 07
slug: onboarding-wizard-robustez-y-pulido
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-17
---

# Phase 07 — Security

> Contrato de seguridad de la fase: registro de amenazas, riesgos aceptados y trazabilidad de auditoría. Workstream `onboarding`, milestone v0.20. Endpoint service-role de disponibilidad de slug + upload de logo + pulido del wizard de alta.

Registro modelado en tiempo de plan (`07-01-PLAN.md` `<threat_model>`, IDs T-07-01…04 + T-07-SC). El auditor verificó que cada mitigación exista en el código actual de `main` — no buscó amenazas nuevas fuera del register. **5/5 cerradas.** La fase tocó exactamente 2 archivos de implementación (`app/api/onboarding/slug-available/route.ts` NUEVO, `app/(onboarding)/onboarding/page.tsx` MODIFICADO); sin migración, sin paquetes nuevos.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Wizard (browser) → API `slug-available` | El `slug` (query param) es input no confiable; el handler usa service-role (bypassa RLS) → aislamiento manual | `slug` (string), respuesta booleana |
| Browser → Supabase Storage (bucket `logos`) | El archivo del logo es input no confiable (tipo, tamaño, nombre) | File binario, `logo.${ext}` |
| Browser → Supabase Auth (signOut) | Cambio de estado de sesión iniciado por el cliente | Cookies de sesión |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-07-01 | Information Disclosure | `app/api/onboarding/slug-available/route.ts` (load-bearing) | mitigate | La respuesta de éxito serializa EXCLUSIVAMENTE el booleano: `Response.json({ available: !data }, ...)` (route.ts:48). Query `.select('id').eq('slug', slug).maybeSingle()` (route.ts:41-45) — el `id` es solo marcador de existencia, jamás se serializa; sin spread del row. Ramas de error tampoco filtran datos del negocio: 401 `{ok:false,error:'unauthorized'}` (route.ts:26), 400 `{ok:false,error:'bad_request'}` (route.ts:34). Único header = `Cache-Control: no-store` (route.ts:48). `createAdminClient` (service-role) usado solo server-side en el route handler; el wizard lo consume por `fetch` HTTP (page.tsx:123), NO importa el módulo del route; `page.tsx` es `'use client'` e importa `@/lib/supabase/client` (anon), nunca `createAdminClient`. | closed |
| T-07-02 | Tampering | Upload de logo (path) en `handleFinish` | mitigate | `path = ${business.id}/logo.${ext}` (page.tsx:339). `business` proviene del insert `.select().single()` con `owner_id: user.id` (page.tsx:296,309-327) → `business.id` es el UUID server-generado del negocio recién creado por la sesión (de confianza, NO del cliente) y es el 1er segmento del path. La RLS del bucket `logos` (owner-scoped por 1er segmento) rechaza cualquier path fuera del prefijo del negocio; `ext` va siempre después de `logo.` (nunca puede escapar el prefijo `${business.id}/`). | closed |
| T-07-03 | Tampering / DoS | Upload de logo (tipo/tamaño) en `handleLogoSelect` | mitigate | Validación cliente en `handleLogoSelect` (page.tsx:96-104): `file.size > 2*1024*1024` → toast + return (page.tsx:99); `file.type ∈ ['image/jpeg','image/png','image/webp']`, si no → toast + return (page.tsx:100-101); recién si pasa `setLogoFile`/`setLogoPreview`. La barrera no-bypasseable server-side sigue siendo la policy del bucket (documentado en el register). | closed |
| T-07-04 | Information Disclosure | `app/api/onboarding/slug-available/route.ts` (acceso anónimo) | mitigate | Gate de sesión ANTES de la query: `const supabaseAuth = await createClient(); const { data: { user } } = await supabaseAuth.auth.getUser(); if (!user) return 401` (route.ts:23-27) — corre antes de `createAdminClient()` (route.ts:37) y del `.select` (route.ts:41). Corta la enumeración anónima con cero costo de UX (el onboarding siempre está autenticado). | closed |
| T-07-SC | Tampering | npm/pip/cargo installs | **accept** | La fase NO instala ningún paquete: `git diff 5fec7f5..HEAD -- package.json package-lock.json` = 0 cambios; `07-01-SUMMARY.md` `tech-stack.added: []`. Sin superficie de slopsquatting. | closed |

*Status: open · closed*
*Disposition: mitigate (implementación requerida) · accept (riesgo documentado) · transfer (tercero)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-07-01 | T-07-SC | La fase no agregó ninguna dependencia: los tres commits de la fase (3399c03, 49b603c, dbb5c4e) no tocan `package.json` ni `package-lock.json` (verificado por `git diff` contra la base 5fec7f5) y el SUMMARY declara `tech-stack.added: []`. Superficie de install N/A. | Forjo Studio (dueño) | 2026-07-17 |

---

## Unregistered Flags

None. `07-01-SUMMARY.md` no declara sección `## Threat Flags` ni superficie de ataque nueva sin mapear (`tech-stack.added: []`, sin migración). El `<threat_model>` del plan cubre exactamente T-07-01…04 + T-07-SC — sin amenazas fuera del register.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-17 | 5 | 5 | 0 | gsd-security-auditor (opus) |

**Notas del audit (config `block_on: high` — ambos checks de blocker PASS):**
- **Blocker 1 — sin fuga de datos del negocio (T-07-01):** la única línea de éxito es `Response.json({ available: !data }, { headers: { 'Cache-Control': 'no-store' } })` (route.ts:48); `.select('id')` + `.maybeSingle()` (route.ts:41-45); ninguna rama (401/400/éxito) serializa row/id/name/owner_id, ni en body ni en headers.
- **Blocker 2 — service-role no alcanzable desde el browser (T-07-01):** grep de `slug-available` en el repo = solo `page.tsx` (por `fetch` HTTP) + docs de planning; ningún componente cliente importa el módulo del route. `createAdminClient` vive en `lib/supabase/admin.ts` con `SUPABASE_SERVICE_ROLE_KEY` (sin prefijo `NEXT_PUBLIC_`, server-only) y solo lo importan route handlers / server actions / libs server-side. `page.tsx` (`'use client'`) importa `@/lib/supabase/client` (anon), no el admin.
- **Gate de sesión antes de la query (T-07-04):** `auth.getUser()` → 401 corre antes de instanciar el service-role y de tocar `businesses`.
- **Path del logo aislado por tenant (T-07-02):** `${business.id}/logo.${ext}` con `business.id` del insert (owner = sesión), no del cliente.
- **Validación tipo/tamaño del logo (T-07-03):** presente en `handleLogoSelect` (2MB + jpeg/png/webp) antes de aceptar el archivo.
- Validación reportada en `07-01-SUMMARY.md`: `npx tsc --noEmit` verde, `npx eslint` sin problemas nuevos (2 pre-existentes en base documentados en `deferred-items.md`), `npx vitest run` 532 passed / 49 skipped / 0 failed.
- Alcance verificado por lectura de código en `main`; el upload real del logo (Supabase Storage OFF en Windows) queda para UAT/staging al cierre — la auditoría cubre el cableado y las invariantes, no el runtime del bucket.

---

## Sign-Off

- [x] Todas las amenazas tienen disposición (mitigate / accept / transfer)
- [x] Riesgos aceptados documentados en el Accepted Risks Log
- [x] `threats_open: 0` confirmado
- [x] `status: verified` en el frontmatter

**Approval:** verified 2026-07-17
