---
phase: 02-alta-manual-exports-csv
plan: 02
subsystem: clientes / alta manual
tags: [client-01, alta-manual, badge-origen, multi-tenant, rls]
status: complete
requires:
  - "02-01 (clients.origin — migr. 049 + Client.origin type)"
provides:
  - "POST /api/clients/create — alta manual autenticada (anon+RLS, origin='manual', tenant por sesión)"
  - "lib/clients-create.ts — validación + construcción del insert (lógica pura compartida con tests)"
  - "Dialog 'Nuevo cliente' + badge de origen por fila en clients-client.tsx"
affects:
  - "app/(dashboard)/clients (pantalla de Clientes)"
tech-stack:
  added: []
  patterns:
    - "route handler autenticado del dueño (anon+RLS, tenant por owner_id) — molde appointments/create"
    - "lógica pura en lib/ compartida entre handler y tests (misma fuente de verdad, sin réplica divergente)"
    - "alta zod + react-hook-form (mode onBlur) espejando register/page.tsx"
key-files:
  created:
    - "app/api/clients/create/route.ts"
    - "lib/clients-create.ts"
    - "test/manual-client.test.ts"
  modified:
    - "app/(dashboard)/clients/clients-client.tsx"
decisions:
  - "origin='manual' y business_id se fijan server-side en buildClientInsert; el cliente nunca los aporta"
  - "insurance_* gateado por resolveVertical(business).key === 'salud' (server + UI)"
  - "alta SIEMPRE por endpoint server-side (no insert directo del cliente), a diferencia de los updates inline"
  - "badge de origen: reserva=outline · manual=default · importado=secondary (mapeo LOCKED del UI-SPEC)"
metrics:
  duration: "~50 min"
  completed: "2026-07-06"
  tasks: 2
  files: 4
---

# Phase 02 Plan 02: Alta manual de cliente + badge de origen — Summary

Alta manual de cliente (CLIENT-01): endpoint autenticado `POST /api/clients/create` (anon+RLS, tenant derivado por `owner_id`, `origin='manual'` fijado server-side, obra social gateada por vertical salud), un tercer Dialog "Nuevo cliente" en la pantalla de Clientes con prepend optimista (SC-1), y el badge de origen por fila que coexiste con el status dot (SC-2).

## What was built

**Task 1 — Endpoint `POST /api/clients/create` (TDD)**
- RED: `test/manual-client.test.ts` importa `@/lib/clients-create` (inexistente) → suite falla al importar. Commit `9c3e7bc`.
- GREEN: `lib/clients-create.ts` (`validateClientBody` + `buildClientInsert`) + `app/api/clients/create/route.ts`. Commit `9b41b42`. 7/7 tests verdes.
- Auth gate `auth.getUser()` → 401 `unauthorized` sin sesión. Negocio por `owner_id` → 404 `not_found` sin business. Parseo defensivo → 400 `bad_request`/`missing_fields`. Insert error → 500 `insert_failed`. Éxito → `{ ok: true, client }` (fila completa).
- Cliente **anon+RLS** (`@/lib/supabase/server`), NUNCA service-role. `business_id` = el de la sesión (nunca del body). `origin: 'manual'` fijo. `insurance_*` solo si `resolveVertical(business).key === 'salud'`.
- La lógica pura (validación + shape del insert) vive en `lib/clients-create.ts` y la comparten handler y tests → misma fuente de verdad.

**Task 2 — UI en `clients-client.tsx`** (commit `c26721c`)
- Botón primary "Nuevo {cliente}" (`UserPlus`) en el header del panel izquierdo, respeta terminología por vertical.
- Tercer Dialog de alta (`sm:max-w-md`) espejando delete/merge: campos nombre / teléfono / email / notas + obra social (solo `isSalud`), validación zod + react-hook-form onBlur, labels visibles, "(opcional)" en notas, submit "Guardar"/"Guardando..." con disable anti-doble-submit, Cancel `variant="outline"`.
- Write path por `fetch('/api/clients/create')`; en éxito `setClients(prev => [body.client, ...prev])` (aparece al instante, SC-1) + `toast.success`; en error mantiene el dialog abierto y re-habilita el submit.
- Badge de origen por fila (`ORIGIN_BADGE`): reserva=`outline`, manual=`default`, importado=`secondary`. El status dot existente quedó intacto.

## Deviations from Plan

**1. [Rule 3 - Blocking] Eliminado el import `Download` de este plan**
- El plan (Task 2) pedía importar `UserPlus`/`Download`. `Download` es del botón de export CSV (plan 02-03), no de 02-02 → eslint lo marcaba `no-unused-vars`. Se dejó solo `UserPlus`; `Download` lo agregará 02-03 cuando se use.
- Archivo: `app/(dashboard)/clients/clients-client.tsx`. Commit `c26721c`.

**2. [Diseño] `origin: 'manual'` vive en `lib/clients-create.ts`, no inline en el route**
- El `<verify>` del plan grepea `origin: 'manual'` dentro de `route.ts`. Se movió a `buildClientInsert` (lib compartida con los tests) para tener una sola fuente de verdad testeable sin server vivo. El route lo aplica vía `buildClientInsert(business, ...)`. El invariante de seguridad se mantiene y está cubierto por los tests (`origin=manual` asserted). El `key_link` real del plan (`\.from\('clients'\)\.insert`) sí matchea el route.

## Deferred Issues

Baseline de lint pre-existente en `clients-client.tsx` (confirmado con `git stash` — NO introducido por 02-02), registrado en `deferred-items.md`:
- `react-hooks/set-state-in-effect` (error) L347 — effect de selección de cliente, patrón viejo del archivo.
- `@typescript-eslint/no-unused-vars` (warning) — `TrendingUp` import huérfano.
Fuera de scope (boundary: solo se arregla lo que introduce el task). Candidatos a cleanup transversal.

## Verification

- `npx tsc --noEmit` verde.
- `npx eslint app/api/clients/create/route.ts lib/clients-create.ts` → 0 problemas.
- `npx eslint "app/(dashboard)/clients/clients-client.tsx"` → solo los 2 problemas pre-existentes; 0 nuevos.
- `npx vitest run test/manual-client.test.ts` → 7/7 verdes (+ verticals regression 10/10).
- Grep: `origin: 'manual'` en `lib/clients-create.ts`, sin `supabase/admin` en el route; `api/clients/create` + import de `Badge` + prepend a `setClients` en el cliente.

## Threat mitigations (del threat_model del plan)

- T-02-04 (spoofing sin sesión) → auth gate 401. Cubierto.
- T-02-05 (business_id ajeno) → business_id de la sesión, nunca del body. Test `anti-tampering`.
- T-02-06 (origin arbitrario) → `origin:'manual'` fijo server-side + CHECK migr. 049. Test `origin=manual`.
- T-02-07 (service-role) → usa `@/lib/supabase/server`; grep confirma sin `supabase/admin`.
- T-02-08 (obra social en no-salud) → gate por `resolveVertical`. Tests salud/general.
- T-02-09 (body malformado) → try/catch 400 + `validateClientBody` missing_fields. Tests de validación.

## TDD Gate Compliance

- RED commit `9c3e7bc` (`test(...)`) — suite falla al no existir `@/lib/clients-create`.
- GREEN commit `9b41b42` (`feat(...)`) — lib + handler, 7/7 verde.
- Sin REFACTOR (no hizo falta).

## Self-Check: PASSED
- FOUND: app/api/clients/create/route.ts
- FOUND: lib/clients-create.ts
- FOUND: test/manual-client.test.ts
- FOUND (modified): app/(dashboard)/clients/clients-client.tsx
- FOUND commit: 9c3e7bc (RED), 9b41b42 (GREEN Task 1), c26721c (Task 2)
