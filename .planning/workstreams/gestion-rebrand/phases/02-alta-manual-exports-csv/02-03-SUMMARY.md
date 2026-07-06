---
phase: 02-alta-manual-exports-csv
plan: 03
subsystem: exports-csv
tags: [csv, export, multi-tenant, route-handler, dashboard]
requires:
  - "migración 049 (clients.origin) — 02-01, para exportar la columna origen"
  - "Client.origin en lib/types.ts — 02-01"
provides:
  - "GET /api/export/clients — CSV de clientes autenticado (BOM + RFC4180, header round-trip Fase 3)"
  - "GET /api/export/finances — CSV de finanzas autenticado (turnos+ventas+egresos)"
  - "botones 'Exportar CSV' en Clientes y Finanzas"
affects:
  - "Fase 3 (import CSV, DATA-03): consume el header contrato del export de clientes"
tech-stack:
  added: []
  patterns:
    - "route handler autenticado que devuelve Response crudo text/csv (no Response.json)"
    - "BOM U+FEFF vía secuencia de escape '\\uFEFF' + escaping RFC4180 hand-authored (sin lib CSV)"
    - "tenant re-derivado de owner_id de la sesión, nunca del querystring"
key-files:
  created:
    - "app/api/export/clients/route.ts"
    - "app/api/export/finances/route.ts"
  modified:
    - "app/(dashboard)/clients/clients-client.tsx"
    - "app/(dashboard)/finances/finances-client.tsx"
decisions:
  - "Export de clientes usa <a href download> estilado con buttonVariants (descarga directa, sin loading)"
  - "Export de finanzas usa Button onClick → window.location.href (buttonVariants/cn no estaban importados; evita imports nuevos)"
  - "fixed_expenses excluidas del CSV de finanzas por diseño (plantillas recurrentes, no movimientos fechados)"
metrics:
  duration: "~25 min"
  completed: "2026-07-06"
  tasks: 3
  files: 4
status: complete
---

# Phase 2 Plan 3: Exports CSV (Clientes + Finanzas) Summary

Dos route handlers autenticados que exportan a CSV los clientes y las finanzas del negocio del
dueño (aislamiento por tenant re-derivado de la sesión), con BOM UTF-8 + escaping RFC4180
hand-authored para que Excel-AR abra bien los acentos y las columnas, más los dos botones
"Exportar CSV" secundarios en las pantallas de Clientes y Finanzas.

## What Was Built

- **`GET /api/export/clients`** (DATA-01): auth gate (`auth.getUser()` → 401 `unauthorized`),
  tenant por `owner_id` (→ 404 `not_found`), query `.eq('business_id', business.id)` sobre TODAS
  las filas del negocio. Devuelve `Response` crudo `text/csv; charset=utf-8` con
  `Content-Disposition: attachment; filename="clientes-{slug}-{fecha}.csv"`, prefijo BOM `'U+FEFF'`
  y escaping RFC4180. Header = contrato de round-trip con la Fase 3:
  `nombre,telefono,email,origen,notas,obra_social,nro_obra_social`.
- **`GET /api/export/finances`** (DATA-02): mismo molde de auth/BOM/RFC4180. Combina TRES fuentes
  (`appointments` neq cancelled + `services(name,price)`; `manual_sales` con `amount*quantity`;
  `expenses`), cada una filtrada por `business_id`, ordenadas por fecha descendente. Header
  `fecha,tipo,concepto,monto` (`tipo ∈ turno|venta|egreso`). `fixed_expenses` excluidas a propósito.
- **Botón "Exportar CSV" en Clientes**: `<a href="/api/export/clients" download>` estilado
  `variant="outline" size="sm"` con icono `Download`, junto a "Nuevo cliente" (label oculto en mobile).
- **Botón "Exportar CSV" en Finanzas**: `Button variant="outline" size="sm"` con icono `Download`
  en la fila de acciones del header, navega a `/api/export/finances`.

Ambos botones son secundarios (nunca `bg-primary`), respetando el contrato UI-SPEC §C.

## Key Decisions

- **Clientes vs Finanzas — trigger distinto pero equivalente:** en Clientes usé `<a download>`
  (había `cn` + agregué `buttonVariants`); en Finanzas usé `Button onClick` con
  `window.location.href` porque ni `cn` ni `buttonVariants` estaban importados y la UI-SPEC deja el
  trigger a discreción. Ambos disparan la descarga vía `Content-Disposition: attachment`, sin loading.
- **BOM como secuencia de escape TS `'U+FEFF'`, no el glifo pegado:** el plan lo exige explícito.
  El glifo se coló durante la edición (los editores lo renderizan invisible); se reemplazó a nivel
  de bytes por la secuencia de escape literal en ambos endpoints.
- **`fixed_expenses` fuera del CSV de finanzas:** son plantillas recurrentes (name/amount/frequency)
  sin fecha de movimiento; incluirlas obligaría a inventar fechas y rompería la coherencia del CSV.

## Deviations from Plan

None - plan executed exactly as written. Los dos triggers de botón distintos (a vs Button) están
explícitamente a discreción en el plan/UI-SPEC (D-04, §C).

## Deferred Issues

Lint pre-existente (NO introducido por este plan, confirmado con `git stash` sobre el baseline HEAD),
registrado en `deferred-items.md`:
- `clients-client.tsx:347` — `react-hooks/set-state-in-effect` (error). Pre-existente.
- `clients-client.tsx:23` — `TrendingUp` sin usar (warning). Pre-existente.
- `finances-client.tsx:283` — `react-hooks/set-state-in-effect` (error). Pre-existente.

Los botones "Exportar CSV" no agregan ningún hallazgo de lint nuevo (baseline idéntico antes/después).

## Verification

- `npx tsc --noEmit` — verde con los dos endpoints + los dos botones.
- `npx eslint` sobre `clients-client.tsx` / `finances-client.tsx` — sin errores NUEVOS (los 2 errores
  + 1 warning reportados son pre-existentes, confirmados contra el baseline HEAD).
- greps: `text/csv; charset=utf-8`, header contrato de clientes, header de finanzas, `manual_sales`,
  `.eq('business_id'`, ausencia de `supabase/admin`, secuencia `U+FEFF` — todos OK en ambos endpoints;
  enlaces `api/export/clients` y `api/export/finances` presentes en las pantallas.
- `git diff --stat package.json` vacío — cero dependencias nuevas.

**Pendiente UAT de fase (manual):** descargar ambos CSV, abrir en Excel-AR → acentos correctos,
columnas alineadas, solo filas del propio negocio.

## Threat Mitigations Applied

- **T-02-10 (Spoofing):** auth gate `auth.getUser()` → 401 `unauthorized` en ambos endpoints.
- **T-02-11 (Information Disclosure — cross-tenant):** `business_id` re-derivado de `owner_id` de la
  sesión, nunca del querystring; toda query `.eq('business_id', business.id)`; anon+RLS como red de defensa.
- **T-02-12 (Elevation — service-role):** ambos endpoints usan `@/lib/supabase/server` (anon+RLS);
  grep confirma que NO importan `supabase/admin`.
- **T-02-13 (Tampering — CSV/formula injection):** escaping RFC4180 (`esc` = campo entre comillas +
  comilla interna duplicada) sobre todos los campos; BOM UTF-8 para acentos.
- **T-02-14 (obra social en el CSV):** aceptado por diseño — el dueño exporta sus propios clientes
  (dato ya visible en su panel), no cruza a otro tenant.

## Self-Check: PASSED

- FOUND: `app/api/export/clients/route.ts`
- FOUND: `app/api/export/finances/route.ts`
- FOUND commit `b998edd` (export clientes)
- FOUND commit `5bc6278` (export finanzas)
- FOUND commit `59e56ab` (botones)
