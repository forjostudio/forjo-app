---
phase: 01-cimientos-auditor-a
plan: 03
subsystem: crm-shell
tags: [ui, shell, sidebar, audit, rls, dark-theme]
status: complete
requires:
  - "guard server-side de /admin + ancla de tema .crm-shell (plan 01-02)"
  - "tabla audit_log + RLS admin-read (migración 031, plan 01-01)"
provides:
  - "shell de UI del CRM: CrmSidebar agrupado + topbar + área de contenido (FND-04)"
  - "RiskBadge alto/medio/bajo como primitiva reusable para Phases 2+"
  - "Toaster scopeado dark del CRM (resuelve A4)"
  - "visor read-only de /admin/auditoria leyendo audit_log por sesión/RLS (FND-02 lectura)"
affects:
  - components/crm/crm-sidebar.tsx
  - components/crm/crm-topbar.tsx
  - components/crm/crm-toaster.tsx
  - components/crm/risk-badge.tsx
  - app/(crm)/layout.tsx
  - app/(crm)/admin/auditoria/page.tsx
  - app/(crm)/admin/auditoria/auditoria-client.tsx
tech-stack:
  added: []
  patterns:
    - "sidebar agrupado estático (no business-scoped, no derivado de business): nav declarativo en grupos"
    - "estado activo de nav por fondo elevado + barra de acento amarillo + color/icono tintado, NUNCA por peso de fuente (sistema 400/700)"
    - "Toaster scopeado con theme=dark explícito que pisa el theme de next-themes (shell dark vs global light)"
    - "RiskBadge con cva local (riskBadgeVariants) sin editar el badge.tsx compartido"
    - "visor de audit_log con createClient (sesión + RLS admin-read), NUNCA service-role en lectura"
    - "Server Component lee + pasa filas a Client Component para filtro/búsqueda/empty-states"
    - "timestamps formateados con toLocaleString + timeZone America/Argentina/Buenos_Aires (sin date-fns-tz)"
key-files:
  created:
    - components/crm/crm-sidebar.tsx
    - components/crm/crm-topbar.tsx
    - components/crm/crm-toaster.tsx
    - components/crm/risk-badge.tsx
    - app/(crm)/admin/auditoria/page.tsx
    - app/(crm)/admin/auditoria/auditoria-client.tsx
  modified:
    - app/(crm)/layout.tsx
decisions:
  - "CrmSidebar NUEVO y estático (no reusa components/dashboard/sidebar.tsx ni deriva de un business): el CRM no es un tenant"
  - "En Phase 1 solo Dashboard (/admin) y Auditoría (/admin/auditoria) enrutan; el resto son items deshabilitados con tag PRONTO"
  - "RiskBadge usa --crm-danger (único rojo), nunca --destructive (brief §12)"
  - "El visor lee audit_log con la sesión del operador (RLS), NO createAdminClient — no exponer service-role en lectura (T-01-09)"
  - "Sin date-fns-tz nuevo: timestamps con toLocaleString + timeZone AR (convención del proyecto, cero paquetes nuevos)"
  - "operatorName del footer del sidebar sale de user_metadata o el local-part del email (best-effort, sin query a DB)"
metrics:
  duration: "~12 min"
  completed: 2026-06-18
  tasks: 2
  files: 7
---

# Phase 1 Plan 03: Shell del CRM + Visor de Auditoría Summary

Shell de UI propio del CRM (FND-04) — `CrmSidebar` agrupado nuevo, top bar, `Toaster` scopeado dark y `RiskBadge` de tres niveles — montado dentro del wrapper `dark crm-shell` del layout, más un visor read-only en `/admin/auditoria` que lee `audit_log` con la sesión del operador (RLS admin-read) y ejercita el contrato tabla + RiskBadge + tabs (FND-02 lectura) para Phases 2+.

## What Was Built

- **`components/crm/crm-sidebar.tsx`** (client) — Sidebar agrupado NUEVO, independiente del de dashboard (que es plano y business-scoped). Nav declarativo estático en 4 grupos con label mono uppercase `tracking-wider`: OPERACIÓN (Dashboard, Bandeja), VENTAS (Pipeline, Negocios), INSIGHTS (Reportes, Auditoría), CUENTA (Planes y precios, Ajustes). En Phase 1 solo **Dashboard** (→ `/admin`) y **Auditoría** (→ `/admin/auditoria`) enrutan; el resto son items deshabilitados con tag mono "PRONTO". Item activo (detectado con `usePathname()`, comparación exacta para que `/admin` no se active en `/admin/auditoria`): fondo elevado `bg-secondary` + barra de acento amarillo izquierda (`before:` 2px en `--primary`) + `text-foreground` + icono tintado amarillo — diferenciado por fondo/barra/color, NUNCA por peso de fuente. Brand header ("**forjo** studio" + caption mono "CONSOLA · OPERACIÓN"), footer con bloque de usuario (iniciales + "Operador · dueño") y botón de logout. Drawer en mobile (< lg) calcando el patrón del sidebar de dashboard; estados focus-visible con ring amarillo.
- **`components/crm/crm-topbar.tsx`** (client) — Top bar: título de página (heading) + breadcrumb mono, input de búsqueda global "Buscar en todo…" (placeholder en Phase 1) con chip `⌘K` e icono de búsqueda, y campana de notificaciones cuyo badge de count usa el ÚNICO rojo `--crm-danger` (no `--destructive`).
- **`components/crm/crm-toaster.tsx`** (client) — Toaster scopeado al CRM con `theme="dark"` explícito (pisa el theme que el Toaster compartido toma de next-themes, global en light). Resuelve A4: el shell es dark pero next-themes global sigue light → sin esto los toasts saldrían light. Posición top-right.
- **`components/crm/risk-badge.tsx`** — `RiskBadge` con `riskBadgeVariants` (cva local, SIN editar `components/ui/badge.tsx`): **alto** = pill oscuro `bg-secondary` + dot rojo `--crm-danger`; **medio** = pill amarillo relleno `bg-primary text-primary-foreground`; **bajo** = pill oscuro `text-muted-foreground` + dot neutro. Server-safe (sin `'use client'`, sin hooks) para usarse tanto en RSC como en client.
- **`app/(crm)/layout.tsx`** (modificado) — Monta el shell DENTRO del wrapper `dark crm-shell` existente: `<CrmSidebar />` + un contenedor `lg:pl-60` con `<CrmTopbar />` arriba y `<main>` con `{children}`, más `<CrmToaster />`. El guard server-side (getUser → redirects fuera de try/catch) quedó intacto; se agregó solo el cálculo best-effort de `operatorName` (de `user_metadata` o el local-part del email, sin query a DB).
- **`app/(crm)/admin/auditoria/page.tsx`** (Server Component) — Lee `audit_log` con `createClient()` (sesión + cookies → RLS admin-read de la migración 031), SELECT explícito de las 10 columnas ordenado por `created_at desc` con `limit(100)`. NO usa el cliente service-role en lectura (T-01-09). Pasa las filas + flag de error a un client component.
- **`app/(crm)/admin/auditoria/auditoria-client.tsx`** (client) — Tabla con las 7 columnas del UI-SPEC (QUIÉN/ACCIÓN/NEGOCIO/DETALLE/MOTIVO/CUÁNDO/RIESGO), headers mono uppercase 12px, celda QUIÉN con icono Operador/Sistema, ACCIÓN en label (mapa `action`→texto, fallback al código crudo), CUÁNDO en timestamp mono "Hoy · 13:22"/"Ayer · …"/"14 jun · …" en hora AR, RIESGO con `<RiskBadge>` alineado a la derecha. Arriba: búsqueda "Buscar acción, negocio…", filter tabs Todos/Altos/Medios/Bajos (activo amarillo vía `data-active:text-primary`) y botón outline "Exportar log" (placeholder/disabled). Filtrado client-side. Empty states con copy exacto: sin filas → "Todavía no hay acciones registradas" + body; filtrado sin match → "Ninguna acción coincide con este filtro." + "Limpiar filtros"; error de lectura → estado de error propio. Cero "SMS".

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | CrmSidebar agrupado + topbar + Toaster dark montados en el layout | efd2d07 | components/crm/crm-sidebar.tsx, crm-topbar.tsx, crm-toaster.tsx, app/(crm)/layout.tsx |
| 2 | RiskBadge + visor read-only de auditoría (audit_log vía sesión/RLS) | c6d6daf | components/crm/risk-badge.tsx, app/(crm)/admin/auditoria/page.tsx, auditoria-client.tsx |

## Verification

- Task 1 automated: `buildNav` ausente en crm-sidebar (sidebar independiente), `CrmSidebar` montado en el layout, `theme="dark"` en el toaster → PASS.
- Task 2 automated: `from('audit_log')` presente, `createAdminClient` ausente en el page (lectura por sesión), `crm-danger` presente en risk-badge, cero "SMS" en código → PASS.
- `npx tsc --noEmit` → 0 errores en los 7 archivos del plan. Único error (`test/webhook-deposit.test.ts:104`) es PRE-EXISTENTE y fuera de scope (ver Deferred Issues).
- `npx eslint` sobre los 7 archivos del plan → limpio (se corrigieron en el camino: patrón "componente creado en render" en el sidebar → element JSX `content`; imports/vars sin uso en el client).
- Ningún commit borró archivos (`git diff --diff-filter=D` vacío en ambos).

## Threat Mitigations Applied

- **T-01-09 (Information Disclosure):** el visor `/admin/auditoria` lee `audit_log` con `createClient()` (sesión del operador) → la policy RLS admin-read (migración 031) es la garantía; NO usa el cliente service-role en lectura, así que no bypassa la RLS.
- **T-01-10 (Elevation of Privilege):** el shell y el visor viven bajo `app/(crm)/layout.tsx`, cuyo guard server-side (plan 01-02) bloquea no-admins antes del render del sidebar/visor. El guard quedó intacto en este plan.
- **T-01-SC (Tampering / installs):** cero paquetes npm nuevos (timestamps con `toLocaleString` + timeZone AR en vez de `date-fns-tz`).

## Deviations from Plan

Ninguna desviación funcional. Dos ajustes menores de cumplimiento durante la ejecución, sin cambio de comportamiento:

**1. [Rule 3 - Blocking] Comentarios reescritos para no contener los literales `buildNav` / `createAdminClient`**
- **Found during:** Tasks 1 y 2 (verificación automated).
- **Issue:** Los comentarios explicaban "NO reusar `buildNav`" y "NO usar `createAdminClient`", pero el grep de verificación es literal y los contaba como ocurrencias → la verificación fallaba pese a que el código sí cumple.
- **Fix:** Reformulé los comentarios ("nav construido desde el business", "el cliente service-role") manteniendo el sentido; cero cambio de código ejecutable.
- **Commits:** efd2d07, c6d6daf.

**2. [Rule 3 - Blocking] `Content` del sidebar pasado de componente-en-render a element JSX**
- **Found during:** Task 1 (lint).
- **Issue:** Declarar `const Content = () => (...)` dentro del componente dispara `react/no-unstable...` ("componente creado en render resetea su estado"). El sidebar de dashboard usa el mismo patrón pero la regla ahora está activa.
- **Fix:** Convertí `Content` en un elemento JSX `const content = (...)` y reemplacé `<Content />` por `{content}`. Mismo render, sin recreación de componente.
- **Commit:** efd2d07.

## Known Stubs

- **Búsqueda global del topbar** (`crm-topbar.tsx`): input no funcional en Phase 1 — las pantallas con datos llegan en Phases 2+. Documentado en el código. No bloquea el objetivo (shell visual).
- **Items "PRONTO" del sidebar** (Bandeja, Pipeline, Negocios, Reportes, Planes y precios, Ajustes): deshabilitados intencionalmente; Phase 1 entrega el shell, las pantallas son Phases 2+ (01-CONTEXT.md `<deferred>`).
- **Botón "Exportar log"** (`auditoria-client.tsx`): disabled/placeholder en Phase 1 (UI-SPEC lo marca como placeholder).
- **Visor de auditoría con log vacío:** esperado en Phase 1 — `logAudit` aún no corre hasta las acciones de Phases 2+. El empty state lo cubre; el valor es el contrato de tabla/badge/tabs probado.

Ninguno de estos stubs impide el objetivo del plan (entregar el shell + primitivas + visor con contrato probado).

## Deferred Issues (out of scope)

- **`test/webhook-deposit.test.ts:104` — TS2348** (pre-existente, `vi.fn()` sin parametrizar bajo `strict`). Archivo NO tocado por este plan. Ya logueado en planes 01-01/01-02. Fix sugerido futuro: tipar el spy con `vi.fn<(...args) => ...>()`.

## Human Verification Pendiente (acción del operador)

Requiere un usuario con `app_metadata.is_admin = true` (bootstrap D2, script `npm run setup:...` del plan 01-04). Con ese usuario, en `/admin`:
1. El sidebar agrupado muestra las 4 secciones; el item activo (Dashboard en /admin, Auditoría en /admin/auditoria) tiene la barra amarilla.
2. La top bar muestra título + búsqueda con `⌘K` + campana con badge rojo.
3. En mobile (< lg) el sidebar colapsa a drawer.
4. Un toast de prueba sale en dark.
5. `/admin/auditoria`: con log vacío aparece "Todavía no hay acciones registradas"; las tabs Todos/Altos/Medios/Bajos filtran; el activo está en amarillo.

## Self-Check: PASSED

- FOUND: components/crm/crm-sidebar.tsx
- FOUND: components/crm/crm-topbar.tsx
- FOUND: components/crm/crm-toaster.tsx
- FOUND: components/crm/risk-badge.tsx
- FOUND: app/(crm)/layout.tsx (modified)
- FOUND: app/(crm)/admin/auditoria/page.tsx
- FOUND: app/(crm)/admin/auditoria/auditoria-client.tsx
- FOUND commit: efd2d07, c6d6daf
