---
gsd_state_version: 1.0
milestone: v0.19
milestone_name: Cuenta y acceso
status: executing
stopped_at: Phase 8 planned (1 plan, autónomo, checker PASS) — última de v0.20
last_updated: "2026-07-18T02:07:48.741Z"
last_activity: 2026-07-17 -- Phase 07 execution started
progress:
  total_phases: 8
  completed_phases: 7
  total_plans: 20
  completed_plans: 19
  percent: 88
---

# Project State

## Project Reference

See: .planning/PROJECT.md (compartido por todos los workstreams)
Requirements: .planning/workstreams/onboarding/REQUIREMENTS.md
Roadmap: .planning/workstreams/onboarding/ROADMAP.md

**Core value:** Un negocio NUNCA puede leer ni modificar datos de otro, y los flujos de pago no pueden ser forzados ni falsificados (aislamiento multi-tenant + integridad de pagos).
**Current focus:** Phase 07 — onboarding-wizard-robustez-y-pulido

## Current Position

Phase: 07 (onboarding-wizard-robustez-y-pulido) — EXECUTING
Plan: 1 of 1
Status: Executing Phase 07
Last activity: 2026-07-17 -- Phase 07 execution started

## Milestone Context

**v0.19 Cuenta y acceso** — el paso ANTERIOR al wizard que cerró v0.14: cómo una persona pasa de no
tener cuenta a estar adentro. Numeración continúa desde Phase 4 (v0.14 cerró en Phase 3).

Tres agujeros verificados contra código:

1. **No hay recuperación de contraseña.** `app/(auth)/` = solo `login` y `register`; cero
   `resetPasswordForEmail` en el repo. Un dueño que olvida su contraseña queda afuera sin salida
   self-serve.

2. **No existe `/auth/callback`** (intercambio de código por sesión). Los callbacks que hay
   (`api/google/callback`, `api/mercadopago/callback`) son de **integraciones**, otro flujo.
   **Reset y Google comparten esa ruta** → es la pieza de infra común del milestone.

3. **Los mails son de Supabase, no de Forjo**: inglés, sin marca, `noreply@mail.app.supabase.io`,
   pie "powered by Supabase".

Faseo (orden **load-bearing**): callback + reset (P4) → Google sobre el callback ya construido
(P5) → mails branded cuando los flujos que los disparan ya existen (P6).

**A favor (verificado, no asumido):** el onboarding ya maneja "autenticado sin negocio"
(`onboarding/page.tsx` → `getUser()`) → AUTH-04 es **verificar, no construir**. Google Cloud ya
tiene credenciales OAuth (`client_secret_*.json`, usadas por Calendar) → falta un redirect URI, no
la cuenta entera. Resend ya está cableado en `lib/email.ts` → candidato natural para el SMTP.

## Accumulated Context

### Decisions

Decisiones de fase ABIERTAS (resolver en discuss-phase, NO lockeadas en el roadmap):

- **P4 — ¿`confirm email` está ON y bloquea hoy?** Es **research de fase, NO asumir**.
  `register/page.tsx:47` hace `signUp()` y empuja a `/onboarding` con un toast "Revisá tu email".
  Si la confirmación está ON, `signUp` no devuelve sesión → el proxy rebota a `/login` y el
  toast+push son engañosos. Define AUTH-06 y **alimenta MAIL-01 (P6)**.

- **P4 — Redirect URLs en previews:** las previews de Vercel tienen dominio dinámico. ¿Wildcard en
  la allowlist o auth simplemente no anda en preview? Mismo problema que pegó con reCAPTCHA en el
  UAT de Phase 14. Afecta el UAT de P4 y P5.

- **P4 — Forma de `/auth/callback`:** route handler que rutea por tipo de flujo (recovery vs oauth),
  contemplando desde ya que P5 lo reusa sin reescribirlo.

- **P5 — Account linking (AUTH-05): LA decisión del milestone.** Supabase vincula identidades o tira
  error según la config y según si el mail está verificado. Definir explícitamente y **probar los
  dos órdenes** (contraseña→Google y Google→contraseña). Cruza con el hallazgo de AUTH-06.

- **P6 — SMTP: Resend vs solo plantillas.** Resend unifica remitente con los mails de turnos y saca
  el "powered by Supabase", pero requiere dominio + DNS (SPF/DKIM). Solo-plantillas es más rápido
  pero deja `noreply@mail.app.supabase.io` → MAIL-01/02 quedarían a medias.

Histórico v0.14 (cerrado):

- [Phase 01]: Onboarding escribe `time_blocks` (fuente única) con horario partido en vez de `business_hours` (SCHED-01)
- [Phase 01]: 01-03 — DROP `business_hours` (migr. 046); `time_blocks` = fuente única
- [Phase 02]: navegación del wizard por posición en `visibleSteps` (no `s+1`) para saltar Profesionales en canchas; precio 0 = servicio gratuito; header con lockup de marca
- [Phase 03]: rubro elegido → columna `vertical`; texto libre → columna `type` (etiqueta visible en booking); migr. 047 de backfill

### Pending Todos

None yet.

### Blockers/Concerns

- **Checkpoints humanos bloqueantes (`autonomous: false`) — buena parte del milestone es config
  externa**, igual que la migración 051 de v0.18:

  - **P4:** allowlist de Redirect URLs en el Dashboard de Supabase (`/auth/callback` en prod + lo que
    se decida para previews). Sin eso el link del mail no vuelve a la app.

  - **P5:** Google Cloud (redirect URI del callback de Supabase en las credenciales OAuth que ya
    existen) + Dashboard de Supabase (habilitar provider de Google con client ID/secret).

  - **P6 (el grueso de la fase):** Supabase Auth → SMTP custom + plantillas (Confirm signup, Reset
    password) + Resend (dominio) + **DNS** (SPF/DKIM en Cloudflare). Verificación por envío real.

- **Superficie de autenticación → `/gsd:secure-phase` en P4 y P5** (y acotado en P6). No es
  RLS/multi-tenant, pero un agujero acá entrega cuentas enteras: open redirect en el callback, fuga
  del token de recovery, user enumeration en "olvidé mi contraseña", y **account takeover por
  linking automático sobre un email no verificado** (P5). En P6 los tokens viajan dentro de las
  plantillas.

- **AUTH-05 puede morder a un cliente que ya paga:** si el linking sale mal, un dueño registrado con
  contraseña que entra con Google puede quedar mirando el negocio de nadie. Probar los dos órdenes.

## Deferred Items (v2 / future — NO en v0.19)

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Auth | AUTH-OAUTH-02 (otros proveedores: Apple, Facebook) | Deferred | v0.19 scoping |
| Auth | AUTH-MAGIC-01 (magic link / passwordless) | Deferred | v0.19 scoping |
| Auth | AUTH-MFA-01 (2FA / MFA) | Deferred | v0.19 scoping |
| Panel | Paleta de colores propia (arrastra el bug del `overrides.primary` en el CMS) | Milestone aparte | v0.19 scoping |
| Booking | Categorización de servicios (decisión de modelo: columna vs tabla) | Milestone aparte | v0.19 scoping |

## Session Continuity

Last session: 2026-07-18T02:07:48.729Z
Stopped at: Phase 8 planned (1 plan, autónomo, checker PASS) — última de v0.20
Resume file: .planning/workstreams/onboarding/phases/08-auth-siempre-con-tema-forjo/08-01-PLAN.md
Next: `/gsd:discuss-phase 4 --ws onboarding`

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 01 P01 | 5min | 2 tasks | 1 files |
| Phase 01 P02 | 12min | 2 tasks | 3 files |

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
