---
phase: 05
slug: entrar-con-google
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-17
---

# Phase 05 — Security

> Contrato de seguridad de la fase: registro de amenazas, riesgos aceptados y trazabilidad de auditoría. Workstream `onboarding`, milestone v0.19 "Cuenta y acceso". Google OAuth + account linking.

Registro modelado en tiempo de plan (los 3 planes tienen `<threat_model>`, IDs T-05-01…09 continuando la numeración de Phase 4). El auditor verificó que cada mitigación exista en el código actual de `main` — no buscó amenazas nuevas fuera del register. La fase pasó un UAT prod-first (05-03-SUMMARY.md): varias amenazas quedaron confirmadas en vivo y acá se verificó que el code path coincide. **9/9 cerradas.**

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Google (IdP) → GoTrue → `/auth/callback` | El round-trip de OAuth vuelve con `?code=` (o `?error=` si se cancela el consent); GoTrue valida el `state` anti-CSRF | `code` OAuth (PKCE), `error`/`error_description` |
| Navegador de origen → `/auth/callback` | El `code_verifier` PKCE vive en cookie del host que inició el flujo; el callback lo lee para canjear | code_verifier PKCE, cookies de sesión |
| Dashboard de Supabase / Google Cloud → runtime | Provider habilitado, Redirect URLs (sin wildcard) y confirm-email gobiernan el round-trip. NO están en git | Config de auth de prod |
| Cliente → `/register` (orden inverso del linking) | Registrar con contraseña sobre una cuenta Google-only no debe revelar existencia (anti-enumeration, comparte path con T-04-17) | email (posible enumeration) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-05-01 | Spoofing/EoP | pre-account-takeover por auto-link sobre email NO verificado | mitigate | GoTrue auto-vincula solo sobre email VERIFICADO; `enable_confirmations=true` (config.toml:237, prod ON). Repo NO hand-rollea linking, NO toca `enable_manual_linking` (config.toml:187 = false, sin cambios); sin `linkIdentity` en el código | closed |
| T-05-02 | Tampering | open redirect en el retorno OAuth / `redirectTo` / allowlist | mitigate | Destino post-canje de `DESTINATIONS['oauth']` = `/dashboard` (callback.ts:35, resuelto con literal `'oauth'` en route.ts:65), nunca de un param de la URL; `redirectTo` hardcodeado a `${window.location.origin}/auth/callback` (google-button.tsx:34); Redirect URLs de prod sin wildcard (2 entradas, D-06) | closed |
| T-05-03 | Spoofing | CSRF del round-trip OAuth | mitigate | El `state` anti-CSRF lo genera/valida GoTrue; el botón solo pasa `provider` + `redirectTo` y no toca `state` (google-button.tsx:30-36). Delegado al proveedor por diseño | closed |
| T-05-04 | Info Disclosure | fuga del `code`/sesión en URL, Referer o logs | mitigate | Logs solo mensaje fijo / `error.message`, nunca `request.url` ni el `code` (route.ts:44,59); 303 a URL limpia + `Referrer-Policy: no-referrer` en la rama OAuth (route.ts:66-67) | closed |
| T-05-05 | EoP | cliente del canje (exchange) | mitigate | `exchangeCodeForSession` corre sobre `createClient()` anon+cookies de `@/lib/supabase/server` (route.ts:2,55-56), NUNCA service role. grep `createAdminClient`/`supabase/admin`/`service_role` en el route = 0 | closed |
| T-05-06 | Tampering | `?type=oauth` fabricado en un link de mail para llegar a `verifyOtp` | mitigate | `oauth` NO está en `ALLOWED_TYPES` (callback.ts:25 = `['recovery','signup']`); ruteo de OAuth por presencia de `code`, no por `type`. `token_hash=x&type=oauth` → `ok:false` en parse (regresión en callback.test.ts:37) | closed |
| T-05-07 | Repudiation/UX | fallo OAuth cae en mensaje opaco (viola D-05) | mitigate | Rama de error OAuth propia → `/login?error=oauth`, cubre fallo del canje (route.ts:57-60) y `?error=` de Google / cancelación del consent (route.ts:43-46); NO reusa `fail()` (`/forgot-password?error=invalid_link`). Aviso en `OAuthErrorNotice` (login/page.tsx:32-41) | closed |
| T-05-08 | Spoofing | UAT en prod contra cuentas reales | **accept** (proceso) | UAT + cross-test de linking con cuentas de Google descartables, no las 3 reales de prod (D-10, espejo de T-04-22). Sin superficie de código | closed |
| T-05-09 | Repudiation/UX | orden inverso (registrar con contraseña sobre cuenta Google-only) — soft dead-end | **accept** | GoTrue ofusca existencia (anti-enumeration, mismo path que T-04-17): `error.code === 'user_already_exists'` tratado idéntico a alta nueva (register/page.tsx:75-80), sin password nuevo ni mail. Agregar copy "¿te registraste con Google?" reintroduciría el oráculo que Phase 4 cerró → deliberadamente NO tocado. El path real "agregar contraseña a cuenta OAuth" (`updateUser({password})` logueado) queda fuera de scope | closed |

*Status: open · closed*
*Disposition: mitigate (implementación requerida) · accept (riesgo documentado) · transfer (tercero)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-08 | El UAT prod-first (incluido el cross-test de account linking en los dos órdenes) se ejecutó con cuentas de Google descartables, nunca contra las 3 cuentas reales de prod. Control de proceso, sin superficie de código (espejo de AR-04-02). | Forjo Studio (dueño) | 2026-07-17 |
| AR-05-02 | T-05-09 | Un usuario que se dio de alta con Google no puede "agregarse" una contraseña desde `/register`: el registro con contraseña sobre un email ya existente muestra el "revisá tu mail" genérico sin mandar mail y sin duplicar la cuenta (mismo path de D-14/T-04-17). Diferenciar ese caso reintroduciría el oráculo de enumeration. El flujo correcto de "definir contraseña" desde una cuenta OAuth (updateUser logueado) queda fuera del scope de este milestone. Verificado en vivo (UAT Orden 2): sin cuenta duplicada. | Forjo Studio (dueño) | 2026-07-17 |

---

## Phase 4 Contract — regresión sobre la rama OAuth

La rama OAuth nueva NO debilitó las mitigaciones de Phase 4 sobre `/auth/callback`:

| Contrato Phase 4 | Estado sobre la rama OAuth |
|------------------|-----------------------------|
| T-04-01 (open redirect) | Intacto: destino de la tabla cerrada (`resolveDestination('oauth')`) + error hardcodeado `/login?error=oauth`; ningún param de URL reflejado |
| T-04-02 (fuga token/code) | Intacto: logs solo mensaje fijo/`error.message`, 303 + `Referrer-Policy: no-referrer` también en OAuth |
| T-04-04 (anon, no service role) | Intacto: mismo `createClient()` anon+cookies; grep service role en el route = 0 |
| T-04-17 (anti-enumeration) | Intacto: `register/page.tsx` sin cambios; `error.code === 'user_already_exists'` tratado igual que alta nueva |

El path de mail (parse → `verifyOtp` → `resolveDestination`) quedó sin cambios (la rama OAuth va ANTES del parse; si no hay `code`/`error`, cae al path de mail de Phase 4).

---

## Unregistered Flags

None. Los tres SUMMARY (05-01/02/03) no declaran sección `## Threat Flags` ni superficie de ataque nueva sin mapear. Los IDs de amenaza en los `<threat_model>` de los planes cubren exactamente T-05-01…09 — sin amenazas fuera del register.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-17 | 9 | 9 | 0 | gsd-security-auditor (opus) |

**Notas del audit:**
- **Checks de blocker (config `block_on: high`) — ambos PASS:** (1) T-05-05 → grep `createAdminClient`/`supabase/admin`/`service_role` en `app/auth/callback/route.ts` = 0 matches; el canje usa el cliente anon+cookies. (2) T-05-06 → `oauth` NO está en `ALLOWED_TYPES` (callback.ts:25) y la regresión callback.test.ts:37 lo asierta.
- Amenazas ya confirmadas en vivo (UAT 05-03), verificado que el code path coincide: T-05-01 (Orden 1 password→Google cayó en la cuenta existente → auto-link + confirm-email ON), T-05-02 (Dashboard = 2 Redirect URLs sin wildcard), T-05-07 (bloque D: cancelar Google → `/login` con mensaje claro), T-05-09 (Orden 2 Google→password → "revisá tu mail" sin mail ni cuenta duplicada).
- Dependencias atestiguadas por el dueño (fuera del alcance de lectura de archivos): estado del Dashboard/Google Cloud de prod para T-05-01 (confirm-email ON) y T-05-02 (2 Redirect URLs sin wildcard). El espejo local en `config.toml` (`enable_confirmations=true`, `enable_manual_linking=false`) sí fue verificado.
- `enable_manual_linking = false` (config.toml:187) sin cambios y sin `linkIdentity` en el código: el auto-link de identidad lo maneja GoTrue solo sobre email verificado (no hay linking hand-rolled que auditar).
- Validación: `npx vitest run lib/auth/callback.test.ts` (8/8 en 05-01), `npx tsc --noEmit` exit 0, `npx eslint` sobre los 3 archivos exit 0 (reportado en 05-01/05-02-SUMMARY).

---

## Sign-Off

- [x] Todas las amenazas tienen disposición (mitigate / accept / transfer)
- [x] Riesgos aceptados documentados en el Accepted Risks Log
- [x] `threats_open: 0` confirmado
- [x] `status: verified` en el frontmatter

**Approval:** verified 2026-07-17
