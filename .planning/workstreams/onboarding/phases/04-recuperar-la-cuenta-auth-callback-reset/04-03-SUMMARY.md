---
phase: 04-recuperar-la-cuenta-auth-callback-reset
plan: 03
subsystem: auth-ui
tags: [auth, layout, route-group, ui, enumeration, rate-limit]
requires: []
provides:
  - "app/(auth)/(split)/layout.tsx — panel Bauhaus compartido por login/forgot/reset (D-07/D-08)"
  - "components/auth/check-your-email.tsx — CheckYourEmail + RESEND_COOLDOWN_SECONDS (D-02/D-05/D-12)"
  - "/forgot-password linkeado desde el login (D-04)"
affects:
  - "04-04 (/forgot-password): consume el layout y CheckYourEmail"
  - "04-05 (/register): consume CheckYourEmail para el estado 'revisá tu mail' (D-12)"
tech-stack:
  added: []
  patterns:
    - "route group anidado (split) — patrón NUEVO en el repo, sin precedente"
    - "countdown con setInterval + cleanup (cancelled + clearInterval), copiado de plan-banner.tsx"
key-files:
  created:
    - "app/(auth)/(split)/layout.tsx"
    - "components/auth/check-your-email.tsx"
  modified:
    - "app/(auth)/(split)/login/page.tsx (movido desde app/(auth)/login/page.tsx + extracción + link D-04)"
decisions:
  - "El headline del panel queda hard-coded en el layout (D-08): es identidad de marca, no copy contextual"
  - "Task 1 se partió en 2 commits (git mv puro + extracción) para que git --follow preserve el historial"
  - "El cooldown arranca en 60, no en 0: cuando el componente monta, el primer mail acaba de salir"
metrics:
  duration: "~35 min"
  completed: 2026-07-17
status: complete
---

# Phase 4 Plan 3: Piezas compartidas del reset (split layout + "revisá tu mail") Summary

Panel Bauhaus extraído a un route group anidado `(split)` que login/forgot/reset heredan sin duplicar markup,
más el componente `CheckYourEmail` con cooldown de 60s y sin ramas que dependan del alta de la cuenta.

## Qué se construyó

**`app/(auth)/(split)/layout.tsx`** (Server Component, 63 líneas) — el `div` raíz, el panel `bg-primary` con el
SVG de formas geométricas, el lockup crema FULL, el `<h2>` y el crédito "hecho con Forjo Studio", más la columna
derecha (`md:w-[440px]` → `max-w-[340px]`) donde entra `{children}`. Los **tres comentarios originales se movieron
con el markup** (explican por qué va el lockup FULL y no el bicolor, y por qué el estilo del crédito no se copia
del booking). Se sumó un comentario nuevo citando D-07/D-08 y explicando por qué el grupo es **anidado**: un
`app/(auth)/layout.tsx` envolvería a todos los hijos de `(auth)` y arrastraría `/register` al split, violando D-10.

**`app/(auth)/(split)/login/page.tsx`** — movido con `git mv` (URL `/login` sin cambios) y reducido a un fragmento
que arranca en el `<h1>Iniciá sesión</h1>`. **Ni una clase de Tailwind ni una palabra de copy cambiaron**: es una
extracción, no un rediseño. El único agregado es el link de D-04. Salió el import huérfano de `next/image`;
`useRouter`, `toast` y el `onSubmit` quedaron intactos.

**Link "¿Olvidaste tu contraseña?" (D-04)** — entre el `</form>` y el link de registro (líneas 78 < 86 < 92),
no en la fila del label Contraseña. `inline-block py-2` para llegar a los 44px de touch target que pide
CLAUDE.md §UI/UX; el `mt` del contenedor y del link de registro se ajustaron para compensar el padding y que la
separación visual con el botón quede en la escala de siempre.

**`components/auth/check-your-email.tsx`** (`'use client'`, 88 líneas) — named exports `CheckYourEmail` y
`RESEND_COOLDOWN_SECONDS = 60`. Props: `email`, `title`, `description`, `onResend`, `children?`. El componente
**no sabe qué se reenvía** — eso lo decide cada consumidor.

## Decisiones de seguridad (no son copy)

- **Anti-enumeration estructural (T-04-12 / D-02 / D-14):** el componente no acepta ningún prop sobre el alta de
  la cuenta y no tiene ramas condicionales — renderiza siempre lo mismo. La garantía no depende de que cada página
  se acuerde. Verificado: `grep -ci "exists\|accountFound"` == 0.
- **El rate limit no es oráculo lateral (T-04-13):** el cooldown se resetea en un `finally`, también ante error. Si
  solo se reiniciara en el camino feliz, un error de rate limit dejaría el botón habilitado y el tempo de la UI
  delataría qué mails existen.
- **Cuota de mails (T-04-14 / D-05):** `RESEND_COOLDOWN_SECONDS = 60` y el contador arranca **bloqueado al montar**,
  no en 0 — cuando el componente aparece, el primer mail acaba de salir.
- **Accesibilidad:** sin `aria-live` en el texto del botón (el contador cambia cada segundo y spamearía a los
  lectores de pantalla); `aria-label="Reenviar mail a {email}"` para dar contexto sin leer el contador.

## Mecánica del countdown

`running = secondsLeft > 0` como dependencia del `useEffect`: cuando el contador llega a 0, `running` se apaga y
el cleanup limpia el intervalo — sin recrear el `setInterval` en cada tick ni arrastrar closures viejos. La higiene
(`let cancelled = false` + `return () => { cancelled = true; clearInterval(id) }`) se copió de
`components/dashboard/plan-banner.tsx:44-61`, el único `setInterval` del repo. Su mecánica (polling de webhook) no
se copió: no aplica.

## Deviations from Plan

**1. [Proceso] Task 1 se ejecutó en 2 commits en vez de 1**
- **Encontrado durante:** Task 1, al validar el criterio `git log --follow ... | wc -l > 1`.
- **Problema:** con el `git mv` y la extracción en un solo commit, el archivo resultante (87 líneas) cae por debajo
  del umbral de similitud del 50% frente al original (128 líneas) → git deja de detectarlo como rename y `--follow`
  devuelve 1. El historial se perdía.
- **Fix:** commit 1 = `git mv` puro (rename 100%); commit 2 = la extracción. `--follow` devuelve 8.
- **Commits:** `59b65bf`, `7e936eb`

**2. [Verificación] El build necesita `.env.local`, que no existe en el worktree**
- **Encontrado durante:** Task 1, al correr `npm run build`.
- **Problema:** los `.env*` están gitignored → no viajan al worktree. El prerender de `/onboarding` falla con
  "Your project's URL and API key are required". **Pre-existente y ajeno a este plan** (el compile y el typecheck
  pasan igual).
- **Fix:** se copió `.env.local` del repo principal solo para correr el build y **se borró después**. El worktree
  quedó sin ningún `.env`. No se commiteó nada de eso.

## Known Stubs

Ninguno. `components/auth/check-your-email.tsx` todavía no tiene consumidores — es **intencional y está en el plan**:
lo consumen `/forgot-password` (plan 04-04) y `/register` (plan 04-05). El plan 04-03 existe justamente para que esas
dos pantallas encuentren la pieza hecha.

## Verificación

| Check | Resultado |
|---|---|
| `npm run build` | exit 0 · `○ /login` y `○ /register` en el route table (la URL no cambió) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint "app/(auth)/(split)" components/auth/check-your-email.tsx` | exit 0 |
| `git diff --exit-code "app/(auth)/register/page.tsx"` | exit 0 — **intacto (D-10)** |
| `app/(auth)/login/page.tsx` | ya no existe |
| lockup en layout / en login | 1 / 0 (se movió, no se duplicó) |
| `Tu agenda,` en layout | 1 (D-08: vive una sola vez) |
| `'use client'` en layout | 0 (Server Component) |
| `next/image` en login | 0 (import huérfano eliminado) |
| `git log --follow (split)/login/page.tsx` | 8 commits (historial preservado) |
| `href="/forgot-password"` / copy del link | 1 / 1 · orden de líneas 78 (`</form>`) < 86 (forgot) < 92 (register) |
| `RESEND_COOLDOWN_SECONDS = 60` / `Reenviar en ` / `finally` | 1 / 1 / 1 |
| `grep -ci "exists\|accountFound"` | 0 (D-02) |

Verificación visual de `/login` (375px + desktop): pendiente, se cubre en el UAT del plan 04-06.

## Threat Flags

Ninguno. Este plan no agrega superficie de red, rutas de auth ni acceso a datos: mueve markup existente y agrega un
componente de UI sin llamadas propias (el `onResend` lo inyecta el consumidor).

## Commits

| Task | Commit | Descripción |
|------|--------|-------------|
| 1 | `59b65bf` | mover el login al route group anidado (split) — `git mv` puro |
| 1 | `7e936eb` | extraer el panel Bauhaus al layout del split |
| 2 | `9f71e30` | link "¿Olvidaste tu contraseña?" en el login (D-04) |
| 3 | `befece6` | componente "revisá tu mail" con reenvío y cooldown de 60s |

## Self-Check: PASSED

Los 3 artefactos declarados existen en disco, `app/(auth)/login/page.tsx` ya no existe, y los 4 commits de tareas
(`59b65bf`, `7e936eb`, `9f71e30`, `befece6`) están en el historial.
