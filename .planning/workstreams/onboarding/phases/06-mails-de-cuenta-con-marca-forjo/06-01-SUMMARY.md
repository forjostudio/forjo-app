---
phase: 06-mails-de-cuenta-con-marca-forjo
plan: 01
subsystem: auth-email
tags: [auth, email, branding, security, i18n]
status: complete
requires:
  - "Phase 4: href de token_hash en confirmation.html/recovery.html + ALLOWED_TYPES en lib/auth/callback.ts"
provides:
  - "Templates de auth brandeados en español (confirmation.html, recovery.html)"
  - "Subjects en español versionados en supabase/config.toml"
  - "Guard de regresión del href: test/auth-email-templates.test.ts"
affects:
  - "app/auth/callback/route.ts (consume el href de los templates — sin cambios, solo verificado)"
tech-stack:
  added: []
  patterns:
    - "Mail HTML email-client-safe: <table> anidadas + CSS inline, logo hospedado por URL, sin <style>/JS"
    - "Grep-hygiene: los literales prohibidos se refieren por concepto en comentarios (T-06-06)"
key-files:
  created:
    - test/auth-email-templates.test.ts
  modified:
    - supabase/templates/confirmation.html
    - supabase/templates/recovery.html
    - supabase/config.toml
decisions:
  - "Header/footer dark #1a1714 + CTA naranja #d94a2b, misma estructura entre los 2 mails (familia visual, D-05)"
  - "Logo hospedado en https://gestion.forjo.studio/brand/forjo-gestion-lockup-crema.png (asset ya deployado, nunca inline)"
  - "El nombre de la carpeta backend en el test se arma por segmentos para no disparar el grep de pureza con una ruta correcta"
metrics:
  duration: "~6 min"
  tasks_completed: 2
  files_touched: 4
  completed: "2026-07-17"
requirements: [MAIL-01, MAIL-02]
---

# Phase 6 Plan 01: Mails de cuenta con marca Forjo Summary

Los 2 templates de auth (`confirmation.html`, `recovery.html`) que Phase 4 dejó feos a propósito
quedaron brandeados en español, de la misma familia visual, con el href de `token_hash` intacto
byte a byte y lockeado por un guard de vitest; los subjects pasaron a español en `config.toml`.

## Qué se construyó

- **Task 1 — Guard del contrato del href** (`test/auth-email-templates.test.ts`, commit `fa54846`):
  test PURO de vitest (solo lee los archivos del repo con `readFileSync`, sin red ni Supabase). Por
  cada template afirma el href exacto con su `type` correcto (`signup`/`recovery`), la presencia de
  `{{ .SiteURL }}`, y la AUSENCIA de las 2 variables prohibidas (la de confirmación por defecto y la
  de redirect reflejada). Se corrió ANTES de tocar el HTML (pasó contra los templates aún en inglés)
  y DESPUÉS del rebranding (siguió verde). Continúa T-04-20 como regresión permanente. 8 tests.

- **Task 2 — Rebranding + subjects** (commit `37f86e6`):
  - `confirmation.html` / `recovery.html` reescritos email-client-safe (estructura de `lib/email.ts`:
    `<table>` anidadas de 560px, todo el CSS inline, sin `<style>`, sin JS). Header/footer dark
    `#1a1714` con el logo de marca hospedado por URL, cuerpo blanco, un único CTA naranja `#d94a2b`
    construido como `<table>`. Copy en español (voz de marca). Misma familia visual entre los dos (D-05).
  - Href preservado byte a byte: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup`
    y `...&type=recovery`. Solo `{{ .SiteURL }}` y `{{ .TokenHash }}` como variables de Go template.
  - `supabase/config.toml`: subjects → `"Confirmá tu cuenta en Forjo"` y `"Restablecé tu contraseña"`.
    `content_path` intacto; sin tocar `smtp`, `enable_confirmations` ni `additional_redirect_urls`.

## Verificación

- `npx vitest run test/auth-email-templates.test.ts` → 8/8 verde (antes y después del rebranding).
- `npx vitest run` (suite completa) → **532 passed, 49 skipped, 0 failed** (los skipped son los tests
  de integración que se auto-saltean sin creds de Supabase — no fallan).
- `npx tsc --noEmit` → exit 0.
- `npx eslint test/auth-email-templates.test.ts` → exit 0.
- Greps de aceptación: `ConfirmationURL`==0 y `RedirectTo`==0 en templates; `data:image|base64`==0;
  pureza del test (`createClient|supabase`)==0; subjects==1 c/u; href signup/recovery==1 c/u; `lang="es"`==1 c/u.
- `git diff supabase/config.toml` acotado a los 2 subjects + el comentario (sin `content_path`/`smtp`/etc.).

## Deviations from Plan

None - plan executed exactly as written.

Nota de higiene de grep (previsto por el plan, T-06-06): en dos comentarios propios hubo que evitar
literales que las acceptance greps chequean como ausentes — el literal en minúscula del backend en el
test (criterio de pureza `grep "supabase"==0`) y la palabra `base64` en un comentario del template
(criterio `grep "base64"==0`). Se resolvió refiriendo ambos por concepto / armando el path por
segmentos, sin cambiar la lógica. Es exactamente el autogol de grep que el plan advierte, resuelto
como el plan indica (por concepto, no por literal).

## Notas para 06-02 (checkpoint humano)

- Los templates y subjects ya están en el repo. El plan 06-02 es la config externa (SMTP + Dashboard
  de Supabase de prod) y el UAT de envío real — no es parte de este plan autónomo.
- El logo apunta a `https://gestion.forjo.studio/brand/forjo-gestion-lockup-crema.png`: conviene
  confirmar en el UAT visual que el asset resuelve y contrasta sobre el header dark.

## Self-Check: PASSED

- FOUND: test/auth-email-templates.test.ts
- FOUND: supabase/templates/confirmation.html (branded)
- FOUND: supabase/templates/recovery.html (branded)
- FOUND: supabase/config.toml (subjects es)
- FOUND commit: fa54846 (test guard)
- FOUND commit: 37f86e6 (feat rebranding + subjects)
