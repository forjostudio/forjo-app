---
phase: 04
slug: recuperar-la-cuenta-auth-callback-reset
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-17
---

# Phase 04 — Security

> Contrato de seguridad de la fase: registro de amenazas, riesgos aceptados y trazabilidad de auditoría. Workstream `onboarding`, milestone v0.19 "Cuenta y acceso".

Registro modelado en tiempo de plan (los 6 planes tienen `<threat_model>`). El auditor verificó que cada mitigación exista en el código actual de `main` — no buscó amenazas nuevas. **22/22 cerradas.**

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| GoTrue → cliente de mail | El `token_hash` viaja dentro del mail; el link es lo único que autoriza el reset/confirmación | Token single-use (1h) |
| Dashboard de Supabase → runtime | Site URL, allowlist de redirects y templates gobiernan a dónde vuelve el link. NO están en git | Config de auth de prod |
| Link de mail (anónimo) → `/auth/callback` | Un usuario anónimo abre el link; el callback canjea el token por sesión | token_hash, cookies de sesión |
| Cliente → `/register`, `/forgot-password` | Input no confiable; no debe revelar existencia de cuentas | email (posible enumeration) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-04-01 | Tampering | open redirect (destino del callback / allowlist) | mitigate | Sin `next`/`redirect_to`/`redirectTo`/`emailRedirectTo`; destino de `DESTINATIONS` por `type`; allowlist prod sin wildcard (D-20) | closed |
| T-04-02 | Info Disclosure | `token_hash` en URL/Referer/logs | mitigate | Callback nunca renderiza HTML; 303 a URL limpia; `Referrer-Policy: no-referrer`; logs solo `error.message` | closed |
| T-04-03 | Replay | link reusado/vencido | mitigate | `verifyOtp` single-use + `otp_expiry=3600`; falla → INVALID_LINK_DEST | closed |
| T-04-04 | EoP | cliente del callback | mitigate | Anon + cookies (`@/lib/supabase/server`); grep service role en el route = 0 | closed |
| T-04-05 | Spoofing | `type` arbitrario | mitigate | `ALLOWED_TYPES` Set cerrado (recovery, signup) validado en runtime; oauth fuera hasta Phase 5 | closed |
| T-04-06 | Info Disclosure | `token_hash` en access logs de Vercel | **accept** | Residual: token single-use + 1h → un token logueado ya está consumido | closed |
| T-04-07 | DoS | link de recuperación vs. kill switch de mantenimiento | mitigate | `/auth` en `MAINT_EXEMPT` (D-21); test `isMaintExempt('/auth')=true` | closed |
| T-04-08 | EoP / disponibilidad | `/forgot-password` en `isAuthRoute` (D-06) | mitigate | `AUTH_ROUTE_PREFIXES=['/login','/register']`; test `isAuthRoute('/forgot-password')=false` | closed |
| T-04-09 | Info Disclosure | credenciales del dueño al booking público | mitigate | `isKnownRoute` sin cambio: slug público → `false` → sin `updateSession` | closed |
| T-04-10 | Spoofing | sesión stale sin `updateSession` | mitigate | Las 3 rutas nuevas en `KNOWN_PREFIXES` (D-22) | closed |
| T-04-11 | Tampering | extracción a `route-lists.ts` cambia comportamiento | mitigate | Behavior-preserving (`matchesSegment` vs `matchesPrefix`); 19 tests verdes | closed |
| T-04-12 | Info Disclosure | enumeration en `CheckYourEmail` / `/forgot-password` | mitigate | Sin props/ramas de existencia; forgot descarta el resultado y `setSent` siempre | closed |
| T-04-13 | Info Disclosure | rate limit como oráculo lateral | mitigate | Cooldown 60s arranca bloqueado, reset en `finally` (también ante error) | closed |
| T-04-14 | DoS | cuota de mails quemada | mitigate | `RESEND_COOLDOWN_SECONDS=60` | closed |
| T-04-15 | EoP | `/reset-password` sin sesión de recovery | mitigate | Guard en la página: `getUser()` en mount → `router.replace(INVALID_LINK_DEST)` | closed |
| T-04-16 | EoP | sesión del intruso sobrevive al reset | mitigate | `signOut({ scope:'others' })` post-`updateUser` (D-17); verificado UAT 2 navegadores | closed |
| T-04-17 | Info Disclosure | enumeration en `/register` por mail existente | mitigate | **Fix 6bb5155:** `error.code === 'user_already_exists'` tratado idéntico a alta nueva (misma pantalla); toast solo para errores de forma | closed |
| T-04-18 | Spoofing | cuentas con mails random/ajenos | mitigate | Gate real de confirmación (`enable_confirmations=true`; prod `mailer_autoconfirm=false`) | closed |
| T-04-19 | Repudiation | usuario cree la cuenta lista cuando no lo está | mitigate | AUTH-06: card "Confirmá tu cuenta", sin navegación (solo `setSent`) | closed |
| T-04-20 | Tampering | template con `redirect_to` arbitrario | mitigate | Href a mano con `{{ .SiteURL }}` + `type` fijo; grep `ConfirmationURL` en templates = 0 | closed |
| T-04-21 | Info Disclosure | divergencia local↔prod oculta bugs de auth | mitigate | `enable_confirmations=true` versionado en `config.toml` (D-23) | closed |
| T-04-22 | Spoofing | UAT en prod contra cuentas reales | accept (proceso) | Re-verificación con cuenta descartable nueva, diferida a post-deploy | closed |

*Status: open · closed*
*Disposition: mitigate (implementación requerida) · accept (riesgo documentado) · transfer (tercero)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-06 | Los access logs de Vercel guardan el path con el `token_hash`. El token es single-use (lo quema `verifyOtp`) y vence en 1h (`otp_expiry=3600`), así que uno que aparezca en un log ya está consumido. El proveedor decide qué loguea; no hay mitigación de código razonable adicional. | Forjo Studio (dueño) | 2026-07-17 |
| AR-04-02 | T-04-22 | La re-verificación end-to-end contra GoTrue real se hace con una cuenta descartable nueva, diferida a post-deploy. Control de proceso, sin superficie de código. | Forjo Studio (dueño) | 2026-07-17 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-17 | 22 | 22 | 0 | gsd-security-auditor (opus) |

**Notas del audit:**
- El fix crítico T-04-17 (enumeration en `/register`) se verificó presente y correcto: la detección es por `error.code`, no por el `.message` en inglés. El oráculo que el UAT destapó quedó cerrado.
- Commits de UAT evaluados sin impacto en fronteras de prod: `2acbc93` (`allowedDevOrigins` — solo dev), `8da2347` (toggle de contraseña — client-side, no loguea el valor), `6bb5155` (fix T-04-17 + `site_url=localhost` solo dev).
- Sin Unregistered Flags: los `## Threat Flags` de los 6 SUMMARY dicen "None".
- Dependencias atestiguadas por el dueño (fuera del alcance de lectura de archivos): estado del Dashboard de prod para T-04-01 (2 Redirect URLs sin wildcard) y T-04-18 (Confirm email ON, Site URL correcto). El espejo local en `config.toml` sí fue verificado.
- Validación: `vitest run lib/auth/callback.test.ts test/proxy-auth-routes.test.ts` → 19/19 PASS.

---

## Sign-Off

- [x] Todas las amenazas tienen disposición (mitigate / accept / transfer)
- [x] Riesgos aceptados documentados en el Accepted Risks Log
- [x] `threats_open: 0` confirmado
- [x] `status: verified` en el frontmatter

**Approval:** verified 2026-07-17
