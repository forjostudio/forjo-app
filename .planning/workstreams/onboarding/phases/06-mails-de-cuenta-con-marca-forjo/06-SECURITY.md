---
phase: 06
slug: mails-de-cuenta-con-marca-forjo
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-17
---

# Phase 06 — Security

> Contrato de seguridad de la fase: registro de amenazas, riesgos aceptados y trazabilidad de auditoría. Workstream `onboarding`, milestone v0.19 "Cuenta y acceso". Brandeo de los 2 templates de auth de Supabase + custom SMTP vía Resend.

Registro modelado en tiempo de plan (los 2 planes tienen `<threat_model>`). El auditor verificó que cada mitigación exista en el código actual de `main` — no buscó amenazas nuevas. Esta fase continúa la numeración T-06-NN de Phase 4 (T-04-NN) y NO debe debilitar el contrato de Phase 4 (T-04-02 / T-04-06 / T-04-20). **6/6 cerradas.**

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| GoTrue → cliente de mail | El `token_hash` viaja dentro del HTML del template; el link es lo único que autoriza la confirmación/recuperación | Token single-use (1h) |
| Template (repo) → `/auth/callback` | El href del mail alimenta el intercambio de token por sesión de Phase 4; reescribir el envoltorio no puede alterar el link | token_hash |
| Resend/GoTrue → cliente de mail | El `token_hash` viaja en el mail entregado por SMTP real de Resend | token_hash single-use |
| Dashboard de Supabase → runtime | Custom SMTP, remitente y los 2 templates de prod gobiernan qué se manda y a dónde vuelve el link. NO están en git | Config de auth de prod |
| Resend API key → almacenamiento | Credencial de envío; su único lugar correcto es el campo Password del Dashboard | Secreto SMTP |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-06-01 | Info Disclosure / Tampering | Reescribir el template rompe/expone el `token_hash` | mitigate | Href a mano con `{{ .SiteURL }}` + `{{ .TokenHash }}` + `type` fijo; solo esas 2 variables Go en el HTML; guard `test/auth-email-templates.test.ts` afirma el href exacto; `grep ConfirmationURL` en templates = 0 | closed |
| T-06-02 | Tampering (open redirect) | Variable de redirect reflejada (`RedirectTo`/`redirect_to`/`next`) colada en el href | mitigate | Destino sale de `{{ .SiteURL }}` (config del proyecto), nunca del navegador; guard afirma `.not.toContain('RedirectTo')` en los 2 templates; `grep RedirectTo` en templates = 0 | closed |
| T-06-03 | Info Disclosure | Resend API key en el repo o en un `NEXT_PUBLIC_*` | mitigate | Key dedicada solo en el campo Password del Dashboard; `git grep 're_[A-Za-z0-9]{16,}'` = 0; sin `NEXT_PUBLIC_*` SMTP/RESEND/MAIL/PASS; sin archivos `.env`/`smtp` versionados; bloque `[auth.email.smtp]` de `config.toml` comentado | closed |
| T-06-04 | Info Disclosure | `token_hash` en logs de Resend / en tránsito | **accept** | Residual (continúa T-04-06): token single-use + 1h → un token logueado ya está consumido; el proveedor decide qué loguea. Documentado en Accepted Risks Log (AR-06-01) | closed |
| T-06-05 | Tampering | Pegar el HTML en el Dashboard introduce la variable por defecto / rompe el link | mitigate | El HTML pegado es el de 06-01 (guard verde); checkpoint verificó el href con `token_hash`; UAT prod clickeó los 2 links end-to-end (owner: "anduvo"), sin `token_hash` en la barra tras el canje (T-04-02) | closed |
| T-06-06 | Tampering | Autogol de grep: mencionar la variable prohibida en un comentario invalida el guard | mitigate | Los comentarios de los 2 templates refieren las variables prohibidas por concepto, nunca por su literal; `grep ConfirmationURL\|RedirectTo` en templates = 0 (confirma que ni comentarios ni HTML contienen los literales) | closed |

*Status: open · closed*
*Disposition: mitigate (implementación requerida) · accept (riesgo documentado) · transfer (tercero)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-04 | Resend (o cualquier hop SMTP) puede loguear el path/link con el `token_hash`. El token es single-use (lo quema `verifyOtp`) y vence en 1h (`otp_expiry=3600`, `config.toml:245`), así que uno que aparezca en un log ya está consumido. El proveedor decide qué loguea; no hay mitigación de código razonable adicional. Continúa AR-04-01 (T-04-06). | Forjo Studio (dueño) | 2026-07-17 |

---

## Contrato de Phase 4 — verificado intacto

El rebranding NO debilitó las mitigaciones de Phase 4 que gobiernan este mismo canal:

| Threat Phase 4 | Contrato | Estado post-Phase 6 |
|----------------|----------|---------------------|
| T-04-02 | `token_hash` nunca renderizado; barra sin token tras el canje | Intacto: href sin cambios; UAT prod confirmó barra limpia (06-02-SUMMARY) |
| T-04-06 | Token en access logs de Vercel — riesgo aceptado (AR-04-01) | Intacto: T-06-04 extiende el mismo residual a los logs de Resend (AR-06-01) |
| T-04-20 | Href a mano con `{{ .SiteURL }}` + `type` fijo; sin `ConfirmationURL` | Reforzado: ahora hay guard de vitest (`test/auth-email-templates.test.ts`) que lo deja como regresión permanente |

---

## Unregistered Flags

Ninguno. Los SUMMARY de 06-01 y 06-02 no declaran sección `## Threat Flags`; 06-01 registra "Deviations from Plan: None" (solo notas de higiene de grep previstas por el plan, T-06-06). No apareció superficie de ataque nueva sin mapear.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-17 | 6 | 6 | 0 | gsd-security-auditor (opus) |

**Notas del audit:**
- **T-06-01 / T-06-02 (blockers si el href cambiara):** verificados en el código. `confirmation.html:40` → `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup`; `recovery.html:41` → `...&type=recovery`. Byte a byte, `&` crudo. Solo `{{ .SiteURL }}` y `{{ .TokenHash }}` como variables Go. `grep -c "ConfirmationURL\|RedirectTo" supabase/templates/*.html` = 0.
- **Guard de regresión:** `test/auth-email-templates.test.ts` afirma, por template, el href exacto (`toContain`, línea 49), la presencia de `{{ .SiteURL }}` (línea 54) y la AUSENCIA de `ConfirmationURL`/`RedirectTo` (`FORBIDDEN`, líneas 39/56-60). Es puro (`readFileSync`, sin red/Supabase). 06-01-SUMMARY: 8/8 verde antes y después del rebranding; suite completa 532 passed.
- **T-06-03 (blocker si hubiera key/pass committeada):** `git grep -nE 're_[A-Za-z0-9]{16,}'` sobre archivos trackeados = 0 (exit 1); sin `NEXT_PUBLIC_*` con SMTP/RESEND/MAIL/PASS; sin archivos `.env`/`smtp` en `git ls-files`; `[auth.email.smtp]` en `config.toml:248-255` comentado. La key dedicada `supabase-auth-smtp` vive solo en el Dashboard (06-02-PLAN user_setup).
- **T-06-05 / T-06-04:** el HTML de prod es config del Dashboard (no versionada); se verificó por (a) la fuente en repo con guard verde y (b) el UAT prod end-to-end confirmado por el dueño ("anduvo", 06-02-SUMMARY): remitente `no-reply@forjo.studio` display "Forjo Gestión", en español, sin "powered by Supabase", links a `/onboarding` y `/reset-password` sin `token_hash` en la barra, inbox-no-spam + SPF/DKIM PASS.
- **T-06-06:** los comentarios de cabecera de ambos templates (`confirmation.html:8-17`, `recovery.html:8-17`) refieren "la variable de confirmación por defecto de Supabase" y "una variable de redirect reflejada del navegador" por concepto; el grep negativo de los literales sigue en 0.
- Dependencias atestiguadas por el dueño (fuera del alcance de lectura de archivos): estado del Dashboard de prod (custom SMTP cargado, 2 templates + subjects pegados con href de `token_hash` intacto, dominio `forjo.studio` Verified en Resend). El espejo local en `config.toml` (subjects en español, templates versionados, SMTP comentado) sí fue verificado.

---

## Sign-Off

- [x] Todas las amenazas tienen disposición (mitigate / accept / transfer)
- [x] Riesgos aceptados documentados en el Accepted Risks Log
- [x] Contrato de Phase 4 (T-04-02 / T-04-06 / T-04-20) verificado intacto
- [x] `threats_open: 0` confirmado
- [x] `status: verified` en el frontmatter

**Approval:** verified 2026-07-17
