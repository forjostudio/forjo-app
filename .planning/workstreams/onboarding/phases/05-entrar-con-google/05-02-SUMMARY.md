---
phase: 05-entrar-con-google
plan: 02
subsystem: auth
tags: [oauth, google, login, register, ui]
requires:
  - "lib/supabase/client.ts (createBrowserClient)"
  - "app/auth/callback (rama code→exchangeCodeForSession — plan 05-01, en paralelo)"
provides:
  - "components/auth/google-button.tsx (GoogleButton, botón OAuth compartido)"
  - "Botón 'Continuar con Google' en /login y /register (AUTH-03, D-03)"
  - "Aviso ?error=oauth en /login (D-05/D-08)"
affects:
  - "app/(auth)/(split)/login/page.tsx"
  - "app/(auth)/register/page.tsx"
tech-stack:
  added: []
  patterns:
    - "signInWithOAuth desde el browser client con redirectTo hardcodeado al callback fijo"
    - "Aviso de query no confiable comparado contra literal fijo + boundary de Suspense (espejo de InvalidLinkNotice)"
key-files:
  created:
    - "components/auth/google-button.tsx"
  modified:
    - "app/(auth)/(split)/login/page.tsx"
    - "app/(auth)/register/page.tsx"
decisions:
  - "Glifo de Google inline como SVG multicolor oficial (lucide no lo trae) — Pitfall 5"
  - "redirectTo SIEMPRE ${window.location.origin}/auth/callback, nunca un input (T-05-02)"
  - "Aviso ?error=oauth solo en /login (destino único del error OAuth, D-08); register no lo lleva"
  - "Chip de la 'o' con bg-background en login (split) y bg-card en register (Card shadcn)"
metrics:
  duration: "~25 min"
  completed: "2026-07-17"
status: complete
---

# Phase 5 Plan 02: Entrar con Google (superficie de cliente) Summary

Botón "Continuar con Google" compartido que inicia el flujo OAuth con `redirectTo` hardcodeado al callback fijo, montado en `/login` y `/register` con divisor "o" consistente, más el aviso propio de `?error=oauth` en `/login`.

## What Was Built

- **`components/auth/google-button.tsx` (nuevo):** client component, named export `GoogleButton` (mismo patrón que `CheckYourEmail`). Llama `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: \`${window.location.origin}/auth/callback\` } })`. El `redirectTo` es SIEMPRE el callback fijo — nunca un input ni el destino final (T-05-02). Glifo "G" oficial de Google inline como SVG multicolor (`#4285F4/#34A853/#FBBC05/#EA4335`), `size-4`, `aria-hidden` (Pitfall 5: lucide no trae el logo de marca). Estados default (`Continuar con Google`) / loading (`Conectando...`) que deshabilitan el botón. `try/catch` con `toast.error` corto para el único caso donde el botón queda en pantalla (error de red al iniciar).
- **`/login`:** import + render de `<GoogleButton />` bajo el form, con divisor "o" (chip `bg-background`, la superficie del split). Componente `OAuthErrorNotice` que espeja `InvalidLinkNotice` de forgot-password: lee `useSearchParams()`, compara `error === 'oauth'` contra literal fijo (nunca refleja el valor), renderiza aviso `role="status"` con copy `No pudimos entrar con Google. Probá de nuevo, o entrá con tu email y contraseña.`. Montado arriba del `<h1>`, envuelto en `<Suspense fallback={null}>` (boundary obligatorio para el build de prod de Next 16).
- **`/register`:** import + render de `<GoogleButton />` con divisor "o" (chip `bg-card`, la superficie del Card) dentro del `<CardContent>`, solo en el estado del form (`sent === null`). En "revisá tu mail" no aparece. Sin aviso de error (el callback manda a `/login?error=oauth`, superficie única, D-08).

## Deviations from Plan

None — el plan se ejecutó exactamente como estaba escrito.

## Verification

- `npx tsc --noEmit` → exit 0
- `npx eslint components/auth/google-button.tsx "app/(auth)/(split)/login/page.tsx" "app/(auth)/register/page.tsx"` → exit 0
- `npm run build` → exit 0; `/login` y `/register` presentes como rutas (prerender estático)
- Grep de criterios de aceptación: todos cumplidos (GoogleButton en login=2 y register=2; aviso login=1, register=0; useSearchParams+Suspense en login; bg-card en register; redirectTo con window.location.origin + /auth/callback).
- **Manual/UAT (plan 05-03):** el round-trip real (click → Google → retorno → sesión) depende del provider habilitado en el Dashboard y credenciales reales (H-06/D-10, prod-first).

## Notes for Downstream

- El botón depende de la rama `code`→`exchangeCodeForSession` del callback (plan 05-01) para canjear el retorno. Sin esa rama el redirect vuelve pero no crea sesión.
- El provider de Google debe estar habilitado en el Dashboard de Supabase y el redirect URI del callback en la allowlist sin wildcard (D-06) — checkpoint humano fuera de este plan.

## Self-Check: PASSED

- Archivos creados/modificados verificados en disco (4/4 FOUND).
- Commits de tareas verificados en git log (ef6e5e6, cf3e39a).
