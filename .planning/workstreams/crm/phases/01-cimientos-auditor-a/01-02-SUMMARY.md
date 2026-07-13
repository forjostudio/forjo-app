---
phase: 01-cimientos-auditor-a
plan: 02
subsystem: crm-foundations
tags: [security, guard, theming, proxy, rsc]
status: complete
requires:
  - "requireAdmin() / logAudit() / audit_log (plan 01-01)"
provides:
  - "guard server-side de /admin (layout-as-guard, FND-01)"
  - "ancla de tema del CRM: dark + accent amarillo scopeado (FND-04)"
  - "/admin refresca sesion en el Edge (proxy KNOWN_PREFIXES + middleware)"
affects:
  - app/(crm)/layout.tsx
  - app/(crm)/admin/page.tsx
  - proxy.ts
  - lib/supabase/middleware.ts
  - app/globals.css
tech-stack:
  added: []
  patterns:
    - "layout-as-guard: createClient → getUser → redirect ANTES del JSX (no render parcial)"
    - "is_admin leido de app_metadata (JWT), nunca query a businesses ni .single()"
    - "redirect() FUERA de try/catch (lanza NEXT_REDIRECT para cortar)"
    - "tema forzado dark + accent remap SCOPEADO a .crm-shell (sin tocar next-themes global)"
key-files:
  created:
    - app/(crm)/layout.tsx
    - app/(crm)/admin/page.tsx
  modified:
    - proxy.ts
    - lib/supabase/middleware.ts
    - app/globals.css
decisions:
  - "Guard del layout lee user.app_metadata?.is_admin === true (D1); no es server action, redirige (no lanza)"
  - "/admin agregado a KNOWN_PREFIXES (proxy) + a isDashboardRoute (middleware) para sesion fresca + guard Edge"
  - ".crm-shell remap reusa exactamente los valores de .dark[data-palette=yellow] + tokens --crm-danger/info/success"
  - "Bloque .crm-shell agregado tras los [data-palette]; :root/.dark/paletas/app/layout.tsx intactos"
metrics:
  duration: "~2 min"
  completed: 2026-06-18
  tasks: 3
  files: 5
---

# Phase 1 Plan 02: Guard de /admin + Ancla de Tema del CRM Summary

Route group `app/(crm)/` con un layout async que valida sesion + `is_admin` (app_metadata) y redirige server-side antes de cualquier render (FND-01), landing placeholder en `/admin`, fix de `proxy.ts`/`middleware.ts` para refrescar y guardar sesion en `/admin` (Pitfall 3), y bloque `.crm-shell` en `globals.css` con el accent amarillo + un solo rojo de peligro scopeado al subtree del CRM (FND-04).

## What Was Built

- **`app/(crm)/layout.tsx`** — Layout-as-guard (Server Component async). En orden y FUERA de try/catch: `createClient()` → `auth.getUser()`; `!user` → `redirect('/login')`; `user.app_metadata?.is_admin !== true` → `redirect('/dashboard')`. Lee is_admin de app_metadata (D1, sin query a businesses ni `.single()` → evita el 500 del operador sin onboarding, Pitfall 6). El JSX envuelve children en `<div className="dark crm-shell ...">` + un `<main>` minimo; NO usa PaletteScript ni setea data-theme/data-font. Comentarios en español explicando por qué `redirect()` va fuera de try/catch y por qué el tema va scopeado.
- **`app/(crm)/admin/page.tsx`** — Landing placeholder de la Consola CRM (Server Component). Heading "Consola CRM" + nota de que las pantallas con datos llegan en Phases 2+. La ruta resultante es `/admin` (el route group `(crm)` no aparece en la URL). Verifica el guard end-to-end.
- **`proxy.ts`** — `'/admin'` agregado a `KNOWN_PREFIXES`. Sin esto, `/admin` caia en `NextResponse.next()` y no pasaba por `updateSession` → cookie de sesion stale → `getUser()` null intermitente en el layout (Pitfall 3). El matcher regex NO se tocó.
- **`lib/supabase/middleware.ts`** — `pathname.startsWith('/admin')` agregado a `isDashboardRoute` (defensa en profundidad, D3): un request a `/admin` sin sesion se corta en el Edge (redirige a `/login`) antes de llegar al layout. NO se agregó check de `is_admin` aca — el rol se valida en el layout (FND-01); el Edge solo garantiza que hay sesion.
- **`app/globals.css`** — Bloque `.crm-shell` (29 lineas, additivo) tras los `[data-palette=...]`. Mapea `--primary`/`--accent`/`--ring`/`--sidebar-primary`/`--chart-1` a amarillo `#e6b53f` con foregrounds ink `#1a1714` (contraste ~8.9:1). Expone tokens de dominio: `--crm-danger: #e85c3f` + `--crm-danger-foreground: #fbf3e3` (un solo rojo de marca, NO `--destructive`), `--crm-info: var(--chart-2)`, `--crm-success: var(--chart-4)`. Scopeado para no filtrar al dashboard/booking; el subtree lleva `dark`, asi que los neutrales dark aplican via `&:is(.dark *)`.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Guard layout /admin + landing placeholder | 342f202 | app/(crm)/layout.tsx, app/(crm)/admin/page.tsx |
| 2 | proxy.ts + middleware refrescan/guardan sesion en /admin | 1c04162 | proxy.ts, lib/supabase/middleware.ts |
| 3 | Accent remap .crm-shell en globals.css | 570b695 | app/globals.css |

## Verification

- Task 1 automated: layout lee `app_metadata`, redirige no-admin a `/dashboard`, envuelve en `crm-shell` → PASS.
- Task 2 automated: `'/admin'` en `KNOWN_PREFIXES` (proxy) y `/admin` en middleware → PASS.
- Task 3 automated: `.crm-shell` con `crm-danger` y `e6b53f` presentes → PASS. `git diff --stat` = 29 insertions, 0 deletions (additivo puro, tokens globales intactos).
- `npx tsc --noEmit` → 0 errores en los archivos del plan (`app/(crm)/*`, `proxy.ts`, `lib/supabase/middleware.ts`). Único error (`test/webhook-deposit.test.ts:104`) es pre-existente y fuera de scope (ver Deferred Issues).
- `npx eslint` sobre `app/(crm)/layout.tsx`, `app/(crm)/admin/page.tsx`, `proxy.ts`, `lib/supabase/middleware.ts` → limpio.
- Ningún commit borró archivos (`git diff --diff-filter=D` vacío en los 3).

## Threat Mitigations Applied

- **T-01-05 (Elevation of Privilege):** is_admin validado server-side en el layout con `redirect()` antes del JSX — nunca client-side ni render parcial (Pitfall 1).
- **T-01-06 (Spoofing / sesion stale):** `/admin` en KNOWN_PREFIXES → updateSession refresca la cookie; middleware redirige a `/login` sin sesion (Pitfall 3).
- **T-01-08 (DoS / `.single()` explota):** el guard lee is_admin de app_metadata, no de businesses → no rompe con un operador sin onboarding (Pitfall 6).

## Deviations from Plan

Ninguna. El plan se ejecutó exactamente como estaba escrito. El `.crm-shell` reusa los valores ya validados de `.dark[data-palette="yellow"]` (globals.css:144), confirmando consistencia con el sistema de paletas existente.

## Deferred Issues (out of scope)

- **`test/webhook-deposit.test.ts:104` — TS2348** (`vi.fn()` sin parametrizar bajo `strict`). Archivo NO tocado por este plan (`git diff --quiet HEAD` = UNCHANGED). Mismo patrón que el plan 01-01 corrigió en `lib/audit.test.ts`. Logueado en `deferred-items.md`. Fix sugerido futuro: tipar el spy con `vi.fn<(...args) => ...>()` explícito.

## Human Verification Pendiente (acción del operador)

El guard no se puede ejercitar end-to-end sin un usuario con `app_metadata.is_admin = true` (bootstrap del plan 01-01, TODO D2 — aún no aplicado). Cuando esté:
1. Sin sesión → `/admin` redirige a `/login`.
2. Sesión sin is_admin → `/admin` redirige a `/dashboard` sin mostrar chrome del CRM.
3. Sesión con is_admin === true → `/admin` renderiza la landing en dark con primario amarillo.
4. El dashboard por-negocio sigue en light con su paleta (el cambio del CRM está scopeado a `.crm-shell`).

## Known Stubs

- `app/(crm)/admin/page.tsx` es un placeholder navegable intencional (Phase 1 entrega el shell; las pantallas con datos son Phases 2+, ver 01-CONTEXT.md `<deferred>`). El layout deja `<main>` mínimo; el shell visual completo (CrmSidebar/topbar) lo entrega el plan 03. No bloquea el objetivo del plan (guard + ancla de tema), que está completo y funcional.

## Self-Check: PASSED

- FOUND: app/(crm)/layout.tsx
- FOUND: app/(crm)/admin/page.tsx
- FOUND: proxy.ts (modified, /admin en KNOWN_PREFIXES)
- FOUND: lib/supabase/middleware.ts (modified, /admin guard)
- FOUND: app/globals.css (modified, bloque .crm-shell)
- FOUND commit: 342f202, 1c04162, 570b695
