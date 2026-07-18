---
phase: 08-auth-siempre-con-tema-forjo
plan: 01
subsystem: auth-theming
tags: [theming, auth, next-app-router, hardening]
requires:
  - PaletteScript (components/palette-script.tsx) — el molde invertido
  - root layout default data-palette="red" (app/layout.tsx)
provides:
  - ResetThemeScript — script inline pre-paint que fuerza el tema Forjo base sobre <html>
  - app/(auth)/layout.tsx — padre común de las 4 pantallas de auth que inyecta el reset
affects:
  - login, register, forgot-password, reset-password (heredan el reset de tema)
tech-stack:
  added: []
  patterns:
    - "Script inline (Server Component, dangerouslySetInnerHTML) para theming pre-paint sin flash"
    - "Route-group layout a nivel (auth) como vehículo de un side-effect común, sin markup visual"
key-files:
  created:
    - components/reset-theme-script.tsx
    - components/reset-theme-script.test.tsx
    - app/(auth)/layout.tsx
  modified: []
decisions:
  - "Reset con literales 100% estáticos (sin JSON.stringify): no interpola input → cero superficie de inyección"
  - "Incluir removeProperty('--primary') para cerrar el vector teórico /[slug]→/login (landing override inline)"
  - "El layout (auth) NO lleva markup visual: el panel Bauhaus queda en (split)/layout.tsx para no arrastrar /register al split"
  - "Nunca tocar classList/.dark: claro/oscuro es de next-themes (eje ortogonal, D-03)"
metrics:
  duration: ~3 min
  completed: 2026-07-17
  tasks: 2
  files: 3
requirements: [ONB-05]
status: complete
---

# Phase 8 Plan 01: Auth siempre con tema Forjo Summary

Las pantallas de auth ahora fuerzan el tema Forjo base (data-palette='red', sin theme/font/--primary del tenant) vía un `ResetThemeScript` inline pre-paint montado en un nuevo `app/(auth)/layout.tsx`, eliminando el leak de paleta del negocio al hacer logout con soft-nav.

## Qué se construyó

- **`components/reset-theme-script.tsx`** — `ResetThemeScript`, Server Component que devuelve un `<script dangerouslySetInnerHTML>` con una IIFE de literales estáticos. Espejo invertido de `PaletteScript`: setea `data-palette='red'`, borra `data-theme` y `data-font`, y hace `style.removeProperty('--primary')` sobre `document.documentElement`. Corre sincrónicamente antes del paint (no useEffect) → sin flash. Nunca toca `classList`/`.dark`.
- **`components/reset-theme-script.test.tsx`** — 5 assertions sobre el `__html` generado: las 4 ops de reset (palette=red, delete theme/font, removeProperty --primary) y la invariante D-03 (`not.toContain('classList')`). No requiere jsdom: invoca el componente como función y lee `props.dangerouslySetInnerHTML.__html`.
- **`app/(auth)/layout.tsx`** — `AuthLayout`, Server Component que renderiza `<ResetThemeScript />` antes de `{children}` dentro de un Fragment, sin markup visual. Al ser padre común de `(auth)/(split)/{login,forgot-password,reset-password}` y `(auth)/register`, cubre las 4 pantallas con un solo archivo.

## Decisiones clave

- **Literales estáticos, sin `JSON.stringify`:** a diferencia de `PaletteScript` (que recibe valores del negocio), el reset no interpola ningún input, así que no hace falta la defensa anti-injection. Cero superficie de ataque (T-08-01 accept/N-A).
- **`removeProperty('--primary')` incluido:** cierra el vector teórico `/[slug] → /login` por soft-nav cuando el landing dejó `--primary` inline (recomendación del RESEARCH; barato y seguro).
- **Sin markup visual en el layout (auth):** el panel Bauhaus permanece en `(split)/layout.tsx` a propósito — moverlo a nivel `(auth)` arrastraría `/register` al split y violaría el diseño de Phase 4.

## Verificación

- `npx vitest run components/reset-theme-script.test.tsx` → 5/5 verde (RED confirmado antes de implementar, GREEN después).
- `npx tsc --noEmit` → limpio.
- `npx eslint` sobre los 3 archivos nuevos → 0 problemas.
- No se modificó `PaletteScript`, ni `(dashboard)/layout.tsx`, ni `[slug]/layout.tsx`, ni `(split)/layout.tsx` (no-regresión D-04 confirmada por `git status`: solo 3 archivos nuevos).

**Nota UAT (efecto DOM cross-navegación, no unit-testeable):** el fix real se valida en staging/local con un negocio de `palette != 'red'`: logout desde su dashboard → `/login` debe verse en Forjo base sin flash, y el dashboard/`/[slug]` deben conservar su paleta. Requiere un tenant de paleta custom; el entorno del worktree no lo tiene.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: components/reset-theme-script.tsx
- FOUND: components/reset-theme-script.test.tsx
- FOUND: app/(auth)/layout.tsx
- FOUND commit c457afd (test RED)
- FOUND commit ce37b6f (feat ResetThemeScript)
- FOUND commit 6fe0424 (feat AuthLayout)
