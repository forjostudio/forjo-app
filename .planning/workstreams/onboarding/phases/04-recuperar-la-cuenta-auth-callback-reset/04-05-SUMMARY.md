---
phase: 04-recuperar-la-cuenta-auth-callback-reset
plan: 05
subsystem: auth-ui
tags: [auth, signup, enumeration, ui, next16, bugfix]

# Dependency graph
requires:
  - phase: 04-03
    provides: "components/auth/check-your-email.tsx — CheckYourEmail (consumido, NO modificado)"
  - phase: 04-01
    provides: "app/auth/callback/route.ts — el link del mail entra por /auth/callback?type=signup (D-13)"
provides:
  - "Alta honesta en /register: estado 'revisá tu mail' en vez del push a una ruta protegida sin sesión (AUTH-06)"
  - "Paridad de respuesta entre mail nuevo y mail ya registrado (D-14)"
affects: [04-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Card con contenido conmutado por estado local (form ↔ confirmación) sin tocar el chrome de la página"
    - "supabase.auth.resend({ type: 'signup', email }) — firma verificada contra auth-js, no asumida"

key-files:
  created: []
  modified:
    - "app/(auth)/register/page.tsx"

key-decisions:
  - "El comentario del onSubmit se redactó SIN los literales que los grep gates prohíben, preservando la explicación completa"
  - "La limpieza de huérfanos (router/useRouter) se ejecutó dentro de la Task 1: su propio gate de eslint la exigía"
  - "Task 2 no produjo commit: era limpieza ya absorbida + preservación (no-cambio) + verificación"

patterns-established:
  - "Consumir CheckYourEmail reemplazando CardHeader+CardContent, conservando <Card> y lockup intactos (D-10/D-12)"

requirements-completed: [AUTH-06]

# Metrics
duration: ~12min
completed: 2026-07-17
status: complete
---

# Phase 4 Plan 05: el registro deja de mentir (AUTH-06) Summary

**`/register` ya no festeja una cuenta inusable ni empuja al usuario a una ruta protegida que el proxy iba a rebotar: el alta termina en el estado "revisá tu mail" dentro del mismo card, con reenvío y cooldown de 60s, y un mail ya registrado se ve idéntico a uno nuevo.**

## El bug que se arregló (estaba vivo en producción)

`register/page.tsx:56-58` hacía `toast.success(...)` + `router.push` a la ruta de onboarding + `router.refresh()`. Con `enable_confirmations` ON —verificado en prod, H-01: `mailer_autoconfirm: false`— `signUp` **no devuelve sesión**. La cadena real era:

1. El usuario lee un toast que le dice que su cuenta está creada.
2. Navega a una ruta protegida que matchea `isDashboardRoute` (`lib/supabase/middleware.ts:33`).
3. `getUser()` devuelve `null` → el proxy lo redirige a `/login`.
4. El usuario termina mirando la pantalla de la que venía, sin explicación, con un mail sin abrir.

Ahora el camino feliz es `setSent(data.email)` y nada más. **Cero navegaciones a pantallas que van a rebotar** — que es textualmente el criterio 4 de la fase.

## Qué se construyó

- **Estado `sent`** (`useState<string | null>`): mientras es `null` se ve el form; con valor, el contenido del card pasa a `CheckYourEmail`.
- **Render del estado enviado (D-12):** se reemplaza `<CardHeader>` + `<CardContent>`, **no la página**. El `<Card>`, el lockup tinta/crema con su comentario y el link "¿Ya tenés cuenta?" quedan intactos. `title="Revisá tu mail"`, `description` con el copy textual de D-12 y el mail en `<strong>`, y un `children` con "Volver al login".
- **`onResend`:** `supabase.auth.resend({ type: 'signup', email: sent })`, con el resultado descartado igual que el submit — mostrar un error acá reintroduciría el oráculo que D-14 cierra.
- **Comentario en español** arriba del `onSubmit` explicando el porqué (convención del repo): que `signUp` no devuelve sesión con confirmación ON, que por eso el alta no navega, y que la paridad de respuesta es deliberada.

## Decisiones de seguridad (no son copy)

- **T-04-17 (user enumeration):** con confirmación ON, GoTrue devuelve el mismo shape para un mail nuevo y para uno ya registrado → la UI muestra el mismo `CheckYourEmail` **sin ninguna rama**. El `toast.error` se conserva porque cubre errores de forma (contraseña débil, mail inválido, rate limit), no de existencia.
- **T-04-01 (open redirect):** no se pasa `options` ni `emailRedirectTo`. El destino del link lo fija el template con `{{ .SiteURL }}`; un valor del cliente se ignora. Verificado: `grep -c "emailRedirectTo"` == 0.
- **T-04-19 (repudiation):** el card dice "Confirmá tu cuenta para entrar" y no navega.
- **Firma de `resend` verificada, no asumida** (el plan lo pedía explícitamente): `ResendParams` en `node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:705-713` → `{ type: Extract<EmailOtpType, 'signup' | 'email_change'>, email: string, options?: {...} }`. `options` es opcional. ✔

## Deviations from Plan

### 1. [Rule 3 - Blocking] La limpieza de huérfanos de la Task 2 se ejecutó dentro de la Task 1

- **Encontrado durante:** Task 1.
- **Problema:** el `<verify>` de la Task 1 es `npx tsc --noEmit && npx eslint "app/(auth)/register/page.tsx"`. Al morir la navegación, `router` y `useRouter` quedan sin uso y `eslint` (`core-web-vitals` + `typescript`) marca el unused var → **la Task 1 no podía cerrar su propio gate sin hacer la limpieza que el plan asigna a la Task 2.**
- **Fix:** `router` y su import de `next/navigation` se eliminaron en el commit de la Task 1. Ningún camino que queda los usa (verificado con eslint, no a ojo).
- **Impacto:** la Task 2 quedó sin cambios de código y **no produjo commit** — sus otras dos mitades eran una preservación (no-cambio) y verificación. Se decidió no crear un commit vacío. Todos sus acceptance criteria se verificaron igual y pasan.

### 2. [Rule 1 - Bug] Los comentarios que el plan pide chocaban con sus propios grep gates

- **Encontrado durante:** Task 1.
- **Problema:** el plan pide comentar *por qué* murieron el toast de éxito y la navegación, y a la vez exige `grep -c "Cuenta creada"` == 0 y `grep -c "'/onboarding'"` == 0. Escribir la explicación con los literales rompe los greps: **la prosa cuenta igual que el uso.** Los `planner-discipline-allow` del plan eximen al PLAN, no al código (mismo defecto que reportaron los dos ejecutores de la Wave 1 y el plan `04-01`).
- **Fix:** el comentario se redactó preservando la regla y el razonamiento completo, sin los tokens prohibidos ("un toast de éxito" / "una ruta protegida" en vez de los literales). **No se debilitó ni se omitió ninguna explicación.** Verificado: los greps dan 0 y el comentario sigue explicando el bug entero.
- **Señal para el planner:** es la **tercera vez en esta fase** que el mismo defecto aparece. Los acceptance criteria basados en grep mecánico son incompatibles con los comentarios que el mismo plan ordena escribir.

### 3. [Nota de a11y, no bloqueante] Dos `<h1>` en el estado enviado

- **Encontrado durante:** Task 1.
- **Problema:** `/register` tiene el lockup como `<h1>` (línea 68, dentro del bloque 62-79 que el plan prohíbe tocar) y `CheckYourEmail` renderiza su propio `<h1>`. En el estado `sent` conviven dos → roza la regla "1 h1 único por página" de CLAUDE.md.
- **Por qué NO se arregló:** las dos salidas están cerradas por diseño — tocar el lockup viola D-10 y el criterio de "sin cambios en 62-79"; tocar `CheckYourEmail` rompería el plan paralelo `04-04`. En el split layout no pasa (ahí el lockup no es `h1`).
- **Acción:** se reporta en vez de resolverse unilateralmente. Es cosmético a nivel screen-reader, no afecta el fix. Candidato al UAT del `04-06` o a un follow-up.

## El `?plan=` del landing

El `useEffect` de las líneas 37-43 quedó **tal cual, con su comentario y sus deps `[]`** — corre en el montaje, antes de cualquier submit, y no está condicionado por ninguna rama de `sent`. Verificado por `git diff`: cero cambios en ese bloque.

Sobrevive al cambio de flujo por diseño: el usuario vuelve **al mismo navegador** desde el mail, así que `localStorage['forjo_intended_plan']` sigue intacto cuando el callback lo deja en el onboarding.

> **La verificación real de esto es del UAT (plan `04-06`):** registrarse con `?plan=studio`, confirmar desde el mail, y comprobar que el plan se sigue aplicando post-confirmación. Acá solo se verificó que la captura no se rompió.

## Verificación

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint "app/(auth)/register/page.tsx" --max-warnings=0` | exit 0, **sin warnings** |
| `npx vitest run` | **524 passed / 49 skipped**, 0 fallas |
| `npm run build` | exit 0 · `○ /register` en el route table (la URL no cambió) |
| `setSent(data.email)` / `CheckYourEmail` | 1 / 4 (import + uso) |
| `Confirmá tu cuenta para entrar` (copy D-12) | 1 |
| **El bug murió:** `'/onboarding'` / `Cuenta creada` | **0 / 0** (y `/onboarding` en cualquier forma: 0) |
| `emailRedirectTo` | 0 (T-04-01) |
| lockup tinta / `<Card>` | 1 / 1 (D-10: no se rediseña) |
| `forjo_intended_plan` / `useEffect` deps `[]` | 1 / intacto |
| `useRouter` \| `next/navigation` | 0 (huérfanos eliminados) |
| `git diff` en el bloque del card (62-79) y en "¿Ya tenés cuenta?" | **sin cambios** (el diff del card es puramente aditivo) |
| `git diff` de `components/auth/check-your-email.tsx` vs base | **exit 0 — NO modificado** (el plan paralelo `04-04` está a salvo) |

**Nota sobre el build:** requiere `.env.local`, que está gitignored y no viaja al worktree. Se copió del repo principal solo para correr el build y **se borró después** (verificado: `.env.local present after cleanup: NO`, `git status` limpio, cero `.env` trackeados). Pre-existente y ajeno a este plan.

## Known Stubs

Ninguno. El fix está entero: no hay valores hardcodeados, placeholders ni ramas sin cablear.

## Threat Flags

Ninguno. Este plan **reduce** superficie: elimina una navegación y no agrega endpoints, rutas de auth, acceso a datos ni cambios de schema. La única llamada nueva (`auth.resend`) va contra GoTrue con la anon key, ya cubierta por T-04-13 (cooldown de 60s con reset en `finally`, en `CheckYourEmail`).

## Lo que NO se verificó acá (por diseño)

El flujo end-to-end contra GoTrue real: alta → mail → link → onboarding **con sesión**; alta con mail ya existente → misma pantalla; `?plan=` aplicado post-confirmación. Requiere el template del mail (`04-06`, H-02) y la allowlist de Redirect URLs en el Dashboard de Supabase (D-20). **Se cubre en el UAT del plan `04-06`** — incluida la verificación visual del card en 375px y desktop.

## Commits

| Task | Commit | Descripción |
|------|--------|-------------|
| 1 | `7bc80b5` | el alta deja de mentir — estado "revisá tu mail" en /register |
| 2 | — | sin commit: limpieza absorbida en la Task 1 + preservación + verificación (ver Deviation 1) |

---
*Phase: 04-recuperar-la-cuenta-auth-callback-reset*
*Completed: 2026-07-17*

## Self-Check: PASSED

Los 2 archivos declarados existen en disco y los 2 commits (`7bc80b5`, `d791a02`) están en el historial.
Árbol limpio, sin `.env` trackeados ni borrados accidentales. Cero cambios en STATE.md / ROADMAP.md
(los escribe el orquestador) y cero cambios en `components/auth/check-your-email.tsx` (dependencia del plan paralelo `04-04`).
