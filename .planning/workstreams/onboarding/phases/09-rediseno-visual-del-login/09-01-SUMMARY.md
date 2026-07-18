---
phase: 09-rediseno-visual-del-login
plan: 01
status: complete
completed: 2026-07-18
retroactive: true
requirements: [LOGINUI-01, LOGINUI-02, LOGINUI-03]
files_modified:
  - components/auth/mobile-login-hero.tsx
  - components/auth/google-button.tsx
  - app/(auth)/(split)/login/page.tsx
  - app/(auth)/(split)/layout.tsx
  - app/globals.css
---

# Phase 9 — Rediseño visual del login — Summary

> Rediseño visual de las pantallas de auth del split, mobile y desktop, sin cambios de lógica.
> Implementado directamente con el usuario sobre specs cerradas + 2 HTML de referencia; el plan y este
> summary son retroactivos para dejar la fase trackeada.

## Qué se construyó

### LOGINUI-01 — Mobile (≤760px): hero + bottom sheet
- **`components/auth/mobile-login-hero.tsx`** (nuevo): overlay `fixed inset-0` visible sólo bajo
  `min-[760px]:hidden`. Hero dark (#141110) con formas Bauhaus rojas/crema, logo F + wordmark, headline,
  y 3 CTAs pill: Iniciar sesión (abre bottom sheet), Crear cuenta (→ /register), Continuar con Google.
  Bottom sheet (#1a1613, translateY con `cubic-bezier(.32,.72,.25,1)`) con el form email/contraseña
  (ojito, focus rojo), "Entrar" y links. Reusa `signInWithPassword` y `useGoogleSignIn`.
- A11y sobre la referencia: foco al email al abrir, cierre con Escape + scrim, `inert` para el foco,
  `role="dialog"` + `aria-labelledby`, ojito 44px, inputs 16px (sin zoom iOS).

### LOGINUI-02 / 03 — Desktop (≥760px): hero dark + form crema (fijo)
- **`app/(auth)/(split)/layout.tsx`** (reescrito): hero izquierdo dark (#141110) con 6 formas rojas
  (viewBox 1440×900), ícono F + wordmark, headline con "un solo lugar." en rojo, "hecho con Forjo
  Studio". Panel derecho crema con la clase `.auth-cream-panel`. Reemplazó el `<Image>` lockup por el
  F-icon SVG. Breakpoint alineado a 760px.
- **`app/globals.css`**: bloque `.auth-cream-panel` — fija la paleta crema (los tokens que leen
  Input/Button/Label/GoogleButton) aunque el usuario esté en dark, y ajusta tamaños de campo del ref
  (inputs 44px, 15px, radius 10px; botones 46px; hover de links #c23f22; ojito #5a5044). El tema light
  del proyecto ya era crema, así que esto sobre todo lo PINEA. Los 3 forms no se tocaron.

### Preservación de lógica
- **`components/auth/google-button.tsx`**: se extrajo `useGoogleSignIn` (refactor puro) para que el
  `redirectTo` fijo (invariante T-05-02) viva en un solo lugar, compartido por GoogleButton (desktop)
  y el CTA del hero mobile.
- **`app/(auth)/(split)/login/page.tsx`**: el form desktop se envolvió en `hidden min-[760px]:block`
  y se montó `<MobileLoginHero />`; fix del separador "o" (usa el color del panel, no el token de
  campo). Sin cambios de lógica (mismo `onSubmit`, `OAuthErrorNotice`, links).

## Decisiones
- **Diseño fijo** (dark hero + form crema), confirmado por el usuario: no sigue claro/oscuro. El reset
  de paleta de tenant de ONB-05 (Phase 8) se mantiene — todos los colores son literales Forjo.
- **Alcance = las 3 del split** (login + forgot + reset), no sólo login, para que la navegación entre
  ellas sea consistente. Se recoloreó el layout compartido una vez.
- `/register` fuera de scope (mantiene su Card).

## Verificación
- `tsc --noEmit` ✓ · `eslint` (archivos tocados) ✓ · `next build` ✓ (login/forgot/reset prerender ○).
- UAT visual pendiente (staging/local): flujos mobile y desktop + no-regresión de /register y del
  desktop de /login.

## Notas para secure-phase
- Superficie casi nula (presentación; reusa flujos de auth). Único punto sensible: el `redirectTo` de
  Google, PRESERVADO y centralizado en `useGoogleSignIn`. Ver el threat model en `09-01-PLAN.md`.
