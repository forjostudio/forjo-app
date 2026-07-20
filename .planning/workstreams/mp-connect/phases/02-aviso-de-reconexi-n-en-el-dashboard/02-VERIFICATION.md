---
phase: 02-aviso-de-reconexi-n-en-el-dashboard
verified: 2026-07-20T00:40:00Z
status: human_needed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "En Supabase local: `update businesses set mp_connection_status='error' where owner_id=<dueño de prueba>` (con mp_user_id presente). Abrir el dashboard → Negocio → Integraciones."
    expected: "La card de MercadoPago muestra el aviso ÁMBAR (tono warning) con el copy locked + TriangleAlert + botón Reconectar; y aparece el banner global ámbar arriba del contenido en todas las páginas del (dashboard)."
    why_human: "El render del tono ámbar (token warning en ambos temas) y la aparición del banner solo se ven con la app corriendo y el flag forzado — grep verifica la lógica/clases, no el pixel."
  - test: "Revertir a `mp_connection_status='connected'` (o NULL) con mp_user_id presente."
    expected: "La card vuelve a 'Conectado' LIMPIO (check verde, sin número de cuenta) + Desconectar; el banner global desaparece."
    why_human: "Transición visual del estado; confirmar que no quedó el '· cuenta #' viejo en pantalla."
  - test: "Con un negocio sin mp_user_id, abrir Integraciones."
    expected: "Se ve 'Conectar con MercadoPago' con el logo MP inline a la izquierda; sin aviso caído ni banner global."
    why_human: "Fidelidad visual del isotipo MP inline (óvalo azul + apretón amarillo) — reconocible como MercadoPago."
  - test: "En viewport mobile (≤640px), abrir el hub Negocio y mirar las 4 tabs (Datos·Cobros·Integraciones·Notificaciones/Mails)."
    expected: "Las 4 tabs entran 2×2 DENTRO del pill redondeado (grid-cols-2), sin caer una 4ª fila fuera del contenedor. El TabsList de Configuración (3 tabs) sigue prolijo."
    why_human: "El layout responsive dentro del pill solo se confirma visualmente en mobile."
---

# Phase 2: Aviso de reconexión en el dashboard — Verification Report

**Phase Goal:** El dueño ve en el dashboard el estado REAL de su conexión MP: caída → aviso de reconexión con acceso al OAuth existente, en vez del "Conectado" engañoso. Consume el flag de Phase 1. (+ polish: logo MP, "Conectado" limpio, fix de tabs.)
**Verified:** 2026-07-20T00:40:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Conexión sana → card "Conectado" LIMPIO (check verde, sin número de cuenta) + Desconectar (D-01/D-09, SC1) | ✓ VERIFIED | `settings-client.tsx:715` `mpConnected = !!business.mp_user_id && business.mp_connection_status !== 'error'`. Bloque `:1610-1619` renderiza `<Check text-primary/> Conectado` sin `mp_user_id` — no queda ningún `· cuenta` (grep `cuenta #`/`· cuenta` = 0 hits). |
| 2 | Conexión caída → aviso ámbar token `warning` con copy locked + botón "Reconectar" (D-02/03/04, SC2) | ✓ VERIFIED | `:717` `mpConnectionError = ... === 'error'`; `:1620-1633` contenedor `role="status" border-warning/30 bg-warning/10`, `text-warning`, copy EXACTO `:1625`, botón `Reconectar` primario. Sin `amber`/hex en el estilado (usa token). |
| 3 | Banner global ámbar en todo el (dashboard), montado en layout.tsx, solo si error && mp_user_id, persistente (D-05/06/07) | ✓ VERIFIED | `mp-connection-banner.tsx` existe (Server Component, sin `'use client'`, sin hooks), `if(!connectionError) return null`, `border-warning/30 bg-warning/10 text-warning role="status"`. `layout.tsx:46` monta `<MpConnectionBanner connectionError={business.mp_connection_status === 'error' && !!business.mp_user_id} />` dentro de `<main>`, tras TestModeBanner, antes de PlanBanner. |
| 4 | Sin mp_user_id → botón "Conectar con MercadoPago" (con logo), sin aviso caído ni banner (D-06/D-08, cero regresión) | ✓ VERIFIED | `:1634-1638` rama else: `Conectar con MercadoPago` con `<MpLogo>`. Banner y card caída dependen ambos de `!!mp_user_id`, así que con falsy no aparecen. |
| 5 | "Reconectar" (card y banner) → /api/mercadopago/connect sin desvincular primero (D-04, SC3) | ✓ VERIFIED | Card `:1628` `window.location.href='/api/mercadopago/connect'`; banner `:28` `<a href="/api/mercadopago/connect">`. Route handler existe (`app/api/mercadopago/connect/route.ts`). Ninguno llama `disconnectMp` antes; Desconectar queda como secundario. |
| 6 | Logo MP inline SVG (aria-hidden, sin paquetes) en card + botón, patrón google-button (D-08) | ✓ VERIFIED | `:136-149` `MpLogo` SVG inline `aria-hidden="true"`, brand hex `#009EE3`/`#FFE600` (excepción sancionada). Usado en header de card `:1603` y botón Conectar `:1636`. `tech-stack.added: []` (sin paquetes nuevos). |
| 7 | TabsList Negocio 4 tabs 2×2 en mobile (grid-cols-2); Configuración intacto (grid-cols-3) (D-10) | ✓ VERIFIED | `:848` TabsList de `isNegocio` (primer trigger `value="business"`, 4 tabs) = `grid grid-cols-2 sm:grid-cols-4 lg:flex...`. `:858` TabsList de `!isSection` (`value="appearance"`, 3 tabs) = `grid grid-cols-3 sm:grid-cols-4 lg:flex...` intacto. Labels sin cambios (`Notificaciones/Mails` en `:852`). |

**Score:** 7/7 truths verified (0 present, behavior-unverified). Visual fidelity delegado a UAT (ver Human Verification).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components/dashboard/mp-connection-banner.tsx` | Banner global ámbar persistente, CTA Reconectar | ✓ VERIFIED | 36 líneas, exporta `MpConnectionBanner`, Server Component, único prop booleano. Wired en layout.tsx. |
| `app/(dashboard)/settings/settings-client.tsx` | mpConnected con flag, card 3 estados, MpLogo, D-09, TabsList 2×2 | ✓ VERIFIED | Todos los marcadores presentes; `contains mp_connection_status` ✓. |
| `app/(dashboard)/layout.tsx` | Monta MpConnectionBanner con visibilidad del business por owner_id | ✓ VERIFIED | `:7` import, `:46` mount con booleano derivado. |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| layout.tsx | mp-connection-banner.tsx | `<MpConnectionBanner connectionError={... === 'error' && !!mp_user_id} />` | ✓ WIRED (`:46`) |
| settings-client.tsx | api/mercadopago/connect/route.ts | `window.location.href='/api/mercadopago/connect'` en Reconectar | ✓ WIRED (`:1628`, route existe) |
| mp-connection-banner.tsx | api/mercadopago/connect/route.ts | `<a href="/api/mercadopago/connect">` | ✓ WIRED (`:28`) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| banner + card | `mp_connection_status` / `mp_user_id` | `business` resuelto por `.eq('owner_id', user.id)` en layout.tsx:18-21 y negocio/page.tsx:12 (Supabase, RLS) | Sí — flag durable de Phase 1 (migr. 053, ya en gsd/mp-connect) | ✓ FLOWING |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MPCONN-04 | 02-01 | Dashboard refleja estado real: caída → aviso reconexión con OAuth existente en vez de "Conectado" | ✓ SATISFIED | Truths 1/2/5 + SC1-4 verificados en código |

### Prohibitions

| Prohibition | Status | Evidence |
|-------------|--------|----------|
| Nunca muestra estado de OTRO negocio (lee por owner_id) | ✓ HELD | negocio/page.tsx:12 y layout.tsx:18-21 `.eq('owner_id', user.id)`; ningún business_id del cliente |
| Nunca expone token/secretos ni el número de cuenta | ✓ HELD | Banner recibe solo booleano; card sin `mp_user_id` renderizado (grep `cuenta #`=0); tsc fuerza el tipo del prop |
| No toca backend/token/OAuth, sin migración, sin /users/me | ✓ HELD | `git diff supabase/ ca6c006^..HEAD` vacío; última migr. = 053 (Phase 1); grep `users/me`=0 en archivos tocados |
| Fix TabsList solo Negocio; Configuración intacto grid-cols-3 | ✓ HELD | `:848` grid-cols-2 (Negocio), `:858` grid-cols-3 (Config) |
| Sin amber-500/hex fuera del SVG del logo | ✓ HELD | Estilado ámbar vía token `warning`; único hex = brand del MpLogo (#009EE3/#FFE600). `amber-400` en `:1752` es código PREEXISTENTE de suscripción, fuera de scope, no tocado |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| settings-client.tsx | ~180-463 | 10 errores eslint `react-hooks/*` (React Compiler) | ℹ️ Info | PREEXISTENTES en baseline HEAD, código NO tocado por la fase; documentados en deferred-items.md; tsc exit 0 |

Sin debt markers (TBD/FIXME/XXX) introducidos. Sin stubs. Sin `return null` hueco (el `return null` del banner es el early-return correcto del patrón).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Compilación de los 3 archivos | `npx tsc --noEmit` | exit 0 | ✓ PASS |

No hay entry points runnables sin servidor para esta fase de UI; el resto se cubre por UAT visual.

### Human Verification Required

Ver frontmatter `human_verification` — 4 checks visuales (aviso ámbar + banner con flag forzado, vuelta a "Conectado" limpio, botón Conectar con logo, tabs 2×2 en mobile). El propio SUMMARY y el PLAN delegan explícitamente la fidelidad visual (logo, ámbar, mobile) al phase-verify manual.

### Gaps Summary

Ninguno. Los 7 truths, los 3 artifacts, los 3 key links, MPCONN-04 y las 5 prohibitions están verificados contra el código real; tsc pasa (exit 0). El estado es `human_needed` únicamente porque la fidelidad VISUAL (tono ámbar renderizado, reconocibilidad del isotipo MP, layout 2×2 en mobile) no es verificable por grep/lectura y queda para el UAT del usuario — tal como el PLAN/SUMMARY lo previeron. No hay trabajo de código pendiente.

---

_Verified: 2026-07-20T00:40:00Z_
_Verifier: Claude (gsd-verifier)_
