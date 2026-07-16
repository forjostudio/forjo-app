---
phase: quick/260716-ide
plan: 01
subsystem: auth-ui
tags: [branding, next-image, dark-mode, accessibility]
requires:
  - public/brand/forjo-gestion-lockup-tinta.png
  - public/brand/forjo-gestion-lockup-crema.png
provides:
  - Lockup oficial "forjo | gestión" en las dos pantallas de auth, inmune a la paleta del tenant
affects:
  - app/(auth)/login/page.tsx
  - app/(auth)/register/page.tsx
tech-stack:
  added: []
  patterns:
    - "next/image con width/height explícitos + priority (sin CLS, above-the-fold)"
    - "Swap de variante por tema con dark:hidden / hidden dark:block (patrón ya existente en onboarding)"
key-files:
  created: []
  modified:
    - app/(auth)/login/page.tsx
    - app/(auth)/register/page.tsx
decisions:
  - "En /login va la variante crema FIJA, sin swap: el panel es siempre bg-primary (color saturado de marca), nunca hay fondo claro posible"
  - "En /register va el par tinta/crema con swap: el fondo es bg-background, temático (claro u oscuro)"
  - "El h1 de /register se mantiene como <h1> para no romper la jerarquía de headings; el nombre accesible lo aporta el alt de la imagen visible"
  - "Task 3 (repuntar proxy.ts + borrar public/forjo-lockup.png) OMITIDA por decisión explícita del usuario"
metrics:
  duration: ~12 min
  completed: 2026-07-16
  tasks_completed: 2
  tasks_skipped: 1
  files_modified: 2
status: complete
---

# Quick Task 260716-ide: Logo de marca con variantes dark/light en auth — Summary

Las pantallas `/login` y `/register` ahora muestran el lockup oficial "forjo | gestión" servido desde `public/brand/` vía `next/image`, en vez de una marca dibujada con `currentColor` y un wordmark pintado con `text-primary` — el logo dejó de cambiar de color según la paleta del negocio.

## Qué se hizo

### Task 1 — Lockup crema fijo en el panel de `/login` (`e9bfff0`)

Se eliminaron los dos hijos del bloque del logo y se reemplazaron por un único `<Image>`:

1. El `<svg>` de la marca F dibujada a mano (viewBox 64×80) — usaba `currentColor` (heredaba la paleta del tenant: **causa raíz del bug**), un hex amarillo hardcodeado (`#f4c543`) y varios `rgba(...)`.
2. El `<span>` con el wordmark de texto "Forjo Studio".

Variante **crema fija, sin swap dark/light**: el contenedor es `bg-primary text-primary-foreground`, o sea siempre un color saturado de marca — nunca hay fondo claro posible.

El wrapper pasó de `<div className="relative flex items-center gap-3">` a `<div className="relative">`: el `relative` es load-bearing (apila por encima del svg de fondo `absolute inset-0`) y se mantuvo; `flex items-center gap-3` perdieron función con un hijo único y se sacaron.

El `<svg>` de **fondo** Bauhaus (viewBox 500×700) quedó intacto, verificado por grep.

### Task 2 — Lockup con swap dark/light en el `h1` de `/register` (`5bcd1c2`)

El `<h1 className="text-3xl font-bold text-primary">` (ese `text-primary` era lo que teñía el logo por negocio) pasó al par tinta/crema, espejando el patrón del onboarding (`app/(onboarding)/onboarding/page.tsx:416-417`):

- `-tinta` con `dark:hidden` → fondo claro.
- `-crema` con `hidden dark:block` → fondo oscuro.

Se mantuvo el `<h1>` como elemento (no se degradó a `<div>`) para no romper la jerarquía de headings. La variante oculta usa `display:none`, así que sale del árbol de accesibilidad y no duplica el nombre accesible.

No se tocaron el `<p>` "Creá tu negocio en minutos", la Card, el form, ni el link "Iniciar sesión" (conserva su `text-primary`, uso legítimo como link — verificado).

## Tarea omitida por decisión del usuario

### Task 3 — Deduplicar el asset (repuntar `proxy.ts` + borrar `public/forjo-lockup.png`) — **OMITIDA**

**No es un gap ni trabajo pendiente: es una decisión explícita del usuario de sacarla del alcance.**

Motivos:

1. **La premisa del brief era falsa.** El brief afirmaba que `public/forjo-lockup.png` era huérfano ("no lo referencia nadie, verificado por grep"). Es incorrecto: `proxy.ts:15` lo sirve en `SUSPENDED_HTML`, la página de mantenimiento del kill switch — justo la que ven todos los usuarios cuando la app está suspendida.
2. **Estaba fuera del pedido real** del usuario (el logo de las pantallas de auth).
3. **CLAUDE.md del proyecto:** "cambiá solo lo necesario, no limpies código alrededor del cambio".

Estado verificado tras la ejecución: `proxy.ts` sin modificar (`git diff` vacío) y `public/forjo-lockup.png` sigue presente. La página de mantenimiento sigue mostrando su logo — el must-have se cumple justamente por NO haber ejecutado esta tarea.

Tasks 1 y 2 eran independientes y no la necesitaban.

## Desviaciones del plan

Ninguna. Tasks 1 y 2 se ejecutaron exactamente como estaban escritas.

## Verificación

| Check | Resultado |
|-------|-----------|
| Verify automatizado Task 1 (7 asserts: lockup crema presente, sin swap, sin viewBox 64×80, sin hex `f4c543`, sin wordmark, svg de fondo 500×700 intacto, import de next/image) | OK |
| Verify automatizado Task 2 (6 asserts: 2 lockups, sin `font-bold text-primary`, sin wordmark, un solo `<h1>`, link `text-primary hover:underline` conservado, import) | OK |
| `npx tsc --noEmit` | Verde |
| `npx eslint` sobre los 2 archivos modificados | Limpio (exit 0, sin findings) |
| `proxy.ts` + `public/forjo-lockup.png` sin tocar | Confirmado |

Nota sobre `npm run lint` a nivel repo: reporta 588 problemas (458 errores, 130 warnings) **preexistentes** y ajenos a este cambio — concentrados en `design_handoff_forjo_rebrand/`, `components/dashboard/`, `lib/`. Fuera del scope boundary de esta tarea; no se tocaron. Los dos archivos modificados acá lintean limpio.

## Pendiente de verificación visual (no bloqueante)

Los criterios de render quedan para chequeo manual con `npm run dev`:

- `/login`: lockup crema legible sobre el panel `bg-primary`, formas Bauhaus de fondo presentes.
- `/register` en tema claro → tinta; en tema oscuro → crema.
- En ambas: cambiar la paleta del negocio NO cambia el color del lockup.

## Self-Check: PASSED

- `app/(auth)/login/page.tsx` — FOUND (modificado)
- `app/(auth)/register/page.tsx` — FOUND (modificado)
- `public/brand/forjo-gestion-lockup-crema.png` — FOUND (21362 bytes)
- `public/brand/forjo-gestion-lockup-tinta.png` — FOUND (21110 bytes)
- Commit `e9bfff0` — FOUND
- Commit `5bcd1c2` — FOUND
