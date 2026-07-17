---
phase: 04-recuperar-la-cuenta-auth-callback-reset
plan: 06
subsystem: auth
tags: [supabase, gotrue, email-templates, token_hash, otp, config, uat]

requires:
  - phase: 04-01
    provides: "/auth/callback (verifyOtp con token_hash) — el destino del link del mail"
  - phase: 04-02
    provides: "/auth en MAINT_EXEMPT + las 3 rutas en KNOWN_PREFIXES (el link no se quema contra mantenimiento)"
  - phase: 04-03
    provides: "layout split + CheckYourEmail (las pantallas del reset)"
  - phase: 04-04
    provides: "/forgot-password + /reset-password (el recorrido)"
  - phase: 04-05
    provides: "/register honesto (AUTH-06)"
provides:
  - "config.toml local con enable_confirmations=true (reproduce el gate de prod) y site_url/redirect en localhost"
  - "templates recovery.html + confirmation.html con href token_hash → /auth/callback (H-02)"
  - "Config de prod aplicada a mano (Site URL, Redirect URLs sin wildcard, 2 templates, Confirm email ON)"
  - "UAT completo verificado a mano en local: 4 criterios ROADMAP + 3 blockers de seguridad"
affects: [phase-05-google-oauth]

tech-stack:
  added: []
  patterns:
    - "Config de auth versionada en config.toml (local) + checkpoint humano en el Dashboard (prod): la fuente de verdad de prod NO está en git"
    - "Anti-enumeration estructural en el cliente: no depender de que GoTrue ofusque"

key-files:
  created:
    - supabase/templates/recovery.html
    - supabase/templates/confirmation.html
    - components/ui/password-input.tsx
  modified:
    - supabase/config.toml
    - app/(auth)/register/page.tsx
    - app/(auth)/(split)/login/page.tsx
    - app/(auth)/(split)/reset-password/page.tsx
    - components/auth/check-your-email.tsx
    - next.config.ts

key-decisions:
  - "Host del UAT local = localhost (NO 127.0.0.1): next dev normaliza request.url a localhost, así que el callback siempre redirige ahí; con site_url en 127.0.0.1 la cookie no cruzaba de host y el reset caía en invalid_link. Prod no le aplica (un solo host)."
  - "D-14 estructural: /register trata error.code='user_already_exists' idéntico a un alta nueva (misma pantalla), porque GoTrue NO ofusca (devuelve 422). No se confía en el backend para la garantía anti-enumeration."
  - "El bug de slug-collision en onboarding (chequeo bajo RLS no ve otros tenants) se dejó FUERA de scope: pertenece al milestone de onboarding. Anotado en memoria."

patterns-established:
  - "PasswordInput: Input del design system + toggle de visibilidad (ojito), reusable en las 4 pantallas de auth"

requirements-completed: [AUTH-01, AUTH-02, AUTH-06]

duration: sesión de UAT interactivo (checkpoint humano + gap-fixes + verificación)
completed: 2026-07-17
status: complete
---

# Phase 4 · Plan 06: Config del link del mail + checkpoint humano + UAT Summary

**El flujo de recuperación y el alta honesta quedaron verificados de punta a punta: los links del mail entregan `token_hash` a `/auth/callback`, y el UAT confirmó los 4 criterios del ROADMAP y los 3 blockers de seguridad.**

## Qué se hizo

**Task 1 — Config local versionada (commit `d495634`).** `config.toml` con `enable_confirmations=true` (reproduce el gate de prod, D-23) y los 2 templates (`recovery.html`, `confirmation.html`) con el href apuntando a `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=...` (H-02). El ejecutor validó el parseo del CLI metiendo una clave inválida a propósito (cerró la asunción A2 contra el CLI, no solo los docs).

**Task 2 — Checkpoint humano en el Dashboard de Supabase (prod).** Ejecutado por el dueño:
- **Site URL corregido a `https://gestion.forjo.studio`.** Estaba en `localhost:3000` — bug latente: los links de mail de recuperación de clientes reales habrían apuntado a localhost. Esta fase lo habría llevado a producción. No se notó antes porque los únicos usuarios eran cuentas de prueba confirmadas desde la propia localhost del dueño.
- 2 Redirect URLs agregadas (prod + local), sin wildcard de previews (D-20). No había ninguna entrada vieja con `*`.
- href de los 2 templates cambiado a `token_hash`. Confirm email confirmado ON.

**Task 3 — UAT (local + verificación humana).** Corrido a mano en el Supabase local. Todos los criterios y blockers pasaron (tabla abajo).

## UAT: resultado

| Criterio / Blocker | Resultado | Cómo |
|---|---|---|
| Crit. 1 — mail de recuperación llega y el link funciona | ✓ | Dueño (mail en Mailpit → link → /reset-password) |
| Crit. 2 — contraseña nueva y queda adentro del panel | ✓ | Dueño ("anda ok") |
| Crit. 3 — la vieja falla, la nueva funciona | ✓ | Dueño |
| Crit. 4 — alta honesta ("revisá tu mail", link → /onboarding autenticado) | ✓ | Dueño |
| BLOCKER — anti-enumeration en /register (D-14) | ✓ | Dueño + código (fix, ver abajo) |
| BLOCKER — anti-enumeration en /forgot-password (D-02) | ✓ | Código no ramifica por existencia |
| BLOCKER — token_hash NO queda en la barra (T-04-02) | ✓ | Callback redirige a /reset-password limpio |
| BLOCKER — /forgot-password accesible con sesión (D-06) | ✓ | Test unitario: isAuthRoute('/forgot-password')===false |
| D-17 — el reset mata la sesión del otro navegador | ✓ | Dueño (2 navegadores) |
| D-05 — cooldown de reenvío arranca bloqueado | ✓ | En las dos pantallas |

## Gap-fixes que salieron del UAT

El UAT no fue solo verificación: destapó 4 defectos, todos corregidos y commiteados sobre `main` local.

1. **Dos `<h1>` en el estado "revisá tu mail" de /register** (commit `06daff6`). El lockup de /register es un h1 fuera del ternario; CheckYourEmail sumaba el suyo. `CheckYourEmail` ahora acepta `headingLevel` (default h1 para /forgot-password, donde ES el encabezado; /register pasa h2). Sin cambio visual (D-10). Lo había reportado 04-05, diferido porque entonces tocaba un componente en uso paralelo por 04-04.

2. **/register no hidrataba en `127.0.0.1` (commit `2acbc93`).** `allowedDevOrigins: ['127.0.0.1']` en next.config.ts. Next bloquea como cross-origin los recursos de dev pedidos desde 127.0.0.1 → sin JS, el form caía al submit nativo (GET), sin correr signUp ni mandar mail. SOLO dev; prod es same-origin.

3. **BLOCKER D-14 vivo (commit `6bb5155`).** Registrar un mail existente mostraba el toast "User already registered" — oráculo de enumeración. El ejecutor de 04-05 asumió que signUp ofusca; verificado contra el GoTrue local que NO: devuelve `422 error.code='user_already_exists'`. Fix: /register trata ese code idéntico a un alta nueva. Garantía estructural, no dependiente del backend. **Aplica a prod (mismo GoTrue).**

4. **Reset caía en invalid_link en local (commit `6bb5155`).** `site_url` local era 127.0.0.1 pero next dev normaliza `request.url` a localhost (probado: ni entrar por 127.0.0.1 ni `next dev -H 127.0.0.1` lo cambian), así que el callback redirigía a otro host y la cookie de sesión no cruzaba. Fix: host local unificado en localhost (site_url + additional_redirect_urls). Verificado end-to-end con cookie. Prod es un solo host, no le aplica.

5. **Ojito (toggle de visibilidad) en las 4 pantallas de contraseña** (commits `2acbc93`, `8da2347`). A pedido del dueño. `PasswordInput` reusable, focusable con anillo de foco.

## Hallazgo fuera de scope

**Bug de onboarding — slug collision bajo RLS.** El chequeo de disponibilidad de slug corre bajo RLS (`businesses` solo tiene policy `owner access`), así que no ve los slugs de otros tenants: da "disponible" aunque el slug exista, y el insert choca contra la constraint global `businesses_slug_key` con un error opaco. Pertenece al milestone de onboarding, NO se tocó acá. Anotado en memoria (`onboarding-slug-collision-rls`).

## Pendiente (no bloquea el cierre local)

- **Paso E del plan — re-verificación en prod (D-20):** después del deploy, repetir alta + reset en `gestion.forjo.studio` con una cuenta de prueba NUEVA (no las 3 reales). Auth no anda en previews de Vercel, así que no hay atajo.
- **El push a `main` es del dueño** (Vercel publica main = clientes vivos).

## Notas para Phase 5

- `/auth/callback` quedó verificado y NO se reescribe: Phase 5 suma la rama `code`→`exchangeCodeForSession` y una fila `oauth` en DESTINATIONS.
- **A4 cerrada:** el reset mata la sesión del otro navegador (D-17 verificado). El `signOut({ scope: 'others' })` cumple; queda como dato para el account-linking de Phase 5.
- El defecto de los criterios de aceptación tipo grep (chocan con el copy/comentario que el mismo plan pide) apareció en 4 de 6 planes con ejecutores aislados: conviene corregirlo en el planner antes de Phase 5.
