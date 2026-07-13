---
phase: 02-configuraci-n-de-canchas
plan: 02
subsystem: dashboard-ui
tags: [canchas, dashboard, settings, verticals, multi-tenant, ui]
status: complete
requires:
  - "lib/canchas.ts (provisionCancha, canchasFromData, deleteCancha — Plan 02-01)"
  - "professionals.service_id (migr. 043 — Plan 02-01, aplicada local+prod)"
  - "motor v0.12 (spaces, agenda_spaces — migr. 040-042)"
  - "vertical canchas (Phase 1: terminology service→Cancha, menú sin equipo)"
provides:
  - "Manager de canchas en /servicios para el vertical canchas (D-03)"
  - "components/dashboard/canchas-manager.tsx (form + lista + edición + soft-delete + mapeo de espacios)"
  - "/servicios/page.tsx carga professionals/spaces/agenda_spaces por tenant"
affects:
  - "Phase 3 (booking público de canchas — consume las canchas creadas acá)"
tech-stack:
  added: []
  patterns:
    - "sub-componente que recibe estado+setters de SettingsClient (evita inflar el archivo de 1808 líneas)"
    - "render condicionado por vertical (resolveVertical().key === 'canchas') dentro del TabsContent value='services'"
    - "consumo de la capa pura lib/canchas.ts desde el browser client (sin server actions/RPC)"
key-files:
  created:
    - "components/dashboard/canchas-manager.tsx"
  modified:
    - "app/(dashboard)/servicios/page.tsx (carga ampliada por tenant)"
    - "app/(dashboard)/settings/settings-client.tsx (import + isCanchas + render condicional)"
decisions:
  - "D-03: el manager de canchas se extrae a components/dashboard/canchas-manager.tsx (discreción del plan/research) en vez de inflar settings-client.tsx; SettingsClient lo renderiza condicionalmente cuando view='servicios' y vertical=canchas"
  - "El control 'compartir espacio' (D-04) es un toggle avanzado plegado por defecto: sin selección → space dedicado 1:1; con selección → sharedSpaceIds a provisionCancha"
  - "El borrado usa deleteCancha (soft por defecto, D-05) detrás del ConfirmDialog del repo, con copy 'Desactivar' (conserva reservas)"
metrics:
  duration: "~20 min"
  completed: "2026-07-01"
  tasks: 3
  files: 3
---

# Phase 2 Plan 2: UI del manager de canchas — Summary

Manager de canchas en `/servicios` para el vertical canchas (D-03): alta de cancha (nombre + precio propio + duración fija propia, D-01), lista reconstruida por `service_id`, edición, soft-delete (D-05) y mapeo a espacios (auto 1:1 por defecto + compartir opcional, D-04), todo consumiendo `lib/canchas.ts` (Plan 01) desde el browser client + RLS, sin romper el camino `view='equipo'` de salud/belleza/general.

## Qué se construyó

- **`app/(dashboard)/servicios/page.tsx`** (Edit parcial): el `Promise.all` ahora carga también `professionals`, `spaces` y `agenda_spaces`, cada query con `.eq('business_id', business.id)` + `.order('created_at')` (aislamiento por tenant, defensa en profundidad sobre la RLS). Se pasan como `initialProfessionals`/`initialSpaces`/`initialAgendaSpaces` al `SettingsClient` (reemplaza el `initialProfessionals={[]}` hardcodeado). NO se redirige por vertical acá (a diferencia de `/equipo`): `/servicios` sirve a todos los verticales; el manager de canchas se gatea dentro del componente. Para salud/belleza/general el render de `/servicios` no cambia (la carga extra no altera el CRUD de servicios).

- **`components/dashboard/canchas-manager.tsx`** (nuevo, ~300 líneas): sub-componente que recibe `business` + `supabase` + el estado y setters de `services/professionals/spaces/agendaSpaces` de `SettingsClient`. Encapsula:
  - **Alta:** form Nombre + Duración + Precio (mismos Inputs `min/step` que el CRUD de services, validación `precio>0` y `duración>0`), + control opcional "Compartir espacio con otras canchas (avanzado)" plegado por defecto. Al confirmar llama `provisionCancha(supabase, business.id, { name, price, duration, sharedSpaceIds })` y mergea el resultado (service + professional + space dedicado + agenda_spaces) al estado local. Toast de éxito/error; botón deshabilitado durante el guardado (anti doble-submit).
  - **Lista:** `canchasFromData(services, professionals, agendaSpaces)` reconstruye cada cancha por `service_id` (NUNCA por nombre, Pitfall 2). Muestra nombre + `"{duration}min · ${price}"` (mismo render que el service, tachado si inactiva) + los espacios que ocupa como chips. Botones editar/eliminar.
  - **Edición:** dialog que edita el `service` (name/price/duration_minutes) filtrando por `business_id`. Cada cancha conserva su propia duración (edita solo su service) → dos canchas nunca comparten duración/precio (CANCHA-02).
  - **Soft-delete (D-05):** `deleteCancha(...)` (soft por defecto: `active=false` en service Y professional) detrás del `ConfirmDialog` del repo, copy "¿Desactivar cancha?" (conserva reservas). Actualiza el estado local marcando inactivos.
  - **Mapeo de espacios (D-04):** el control avanzado ofrece chips de los `spaces` existentes del negocio (de `initialSpaces`, ya filtrados por tenant); marcarlos → `sharedSpaceIds` → `provisionCancha` NO crea space nuevo (caso F11→{A,B,C}). Sin selección → space dedicado 1:1.
  - **Leak guard (Pitfall 3):** el eje se presenta como cancha; NO se renderiza `service_id` ni campos de staff (specialty/license/phone/email).

- **`app/(dashboard)/settings/settings-client.tsx`** (Edits parciales, sin reescritura): (1) import de `CanchasManager`; (2) `const isCanchas = resolveVertical(business).key === 'canchas'`; (3) dentro del `TabsContent value="services"`, un ternario: si `isCanchas` renderiza `<CanchasManager ...>`, si no, el CRUD de services de siempre (envuelto en un fragment `<>…</>` porque son dos hermanos: `<Card>` + el `<Dialog>` de edición). El bloque de espacios/mapeo del `TabsContent value="professionals"` (view='equipo') queda **intacto**.

## Verificación

- `npx tsc --noEmit`: **limpio** (tras corregir el fragment del ternario, ver Deviations).
- `npx eslint` sobre los 3 archivos tocados: **cero issues nuevos**. `canchas-manager.tsx` limpio; los 20 problemas de `settings-client.tsx` son **pre-existentes** (errores `react-hooks/purity` por `Date.now()` en helpers de upload que NO se tocaron — verificado contra la versión de HEAD: mismo conteo antes y después de mis cambios). Fuera de scope (SCOPE BOUNDARY).
- `npx vitest run canchas-provision`: **10/10 verde** (la capa consumida sigue intacta).
- Suite completa (312/312): ya verificada verde por el usuario antes de esta wave; los cambios son UI-only y la capa consumida pasa. No se re-corrió (concurrency note).
- Grep gates: `provisionCancha|canchasFromData|deleteCancha` presentes en `canchas-manager.tsx`; `CanchasManager`+`isCanchas` wired en `settings-client.tsx`; `value="professionals"` intacto (1 ocurrencia, no removido); `agenda_spaces`+`initialSpaces` presentes en `servicios/page.tsx`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] El ternario del branch no-canchas envolvía dos hermanos JSX sin wrapper**
- **Found during:** Task 2 (tsc falló con `TS1005 ')' expected` y `TS1381`).
- **Issue:** El `TabsContent value="services"` contiene DOS elementos hermanos: el `<Card>` del CRUD y el `<Dialog>` de edición de servicio. Al condicionarlos con `isCanchas ? <CanchasManager/> : (<Card/> <Dialog/>)`, el branch falso devolvía dos expresiones adyacentes → error de parse.
- **Fix:** Envolver el branch falso en un fragment `<>…</>`. Cero cambio de comportamiento para los otros verticales.
- **Files:** `app/(dashboard)/settings/settings-client.tsx`
- **Commit:** `5356a4c`

### Nota de organización (no desviación)

- El plan da discreción (D-03 "adaptada"; research §"Recommended Project Structure" recomienda extraer un `CanchasManager`). Se eligió el sub-componente sobre condicionar in-place para no inflar más `settings-client.tsx` (1808 líneas) y aislar el camino canchas. Por eso los greps de `provisionCancha|canchasFromData|deleteCancha` viven en `canchas-manager.tsx` (el consumo real) y `settings-client.tsx` referencia `CanchasManager` — el key_link plan→lib/canchas.ts se cumple a través del componente.

## Known Stubs

Ninguno. El manager está wired end-to-end contra `lib/canchas.ts` (Plan 01) y la columna real 043. La verificación humana (Task 3) confirma el comportamiento visual/funcional.

## Threat Flags

Ninguno nuevo. Plan 02 es 100% dashboard autenticado; no agrega exposición anon. Toda escritura pasa por `provisionCancha`/`deleteCancha`/update de service (Plan 01) que setean/filtran `business_id`; los `spaces` ofrecidos en "compartir espacio" salen de `initialSpaces` (filtrados por `.eq('business_id')`), y la RLS de `spaces`/`agenda_spaces` (4-policies WITH CHECK) rechaza cross-tenant a nivel DB (T-02-05/06/07 mitigados como planeado; T-02-08/SC accept).

## Checkpoint pendiente (Task 3 — human-verify)

Task 3 es un checkpoint de verificación humana visual (`autonomous: false`). Los pasos exactos están en el mensaje de checkpoint devuelto al orquestador. Este SUMMARY documenta T1+T2 (ambos auto, commiteados); el estado final del plan queda a la espera de la aprobación humana ("approved") sobre la app corriendo.

## Self-Check: PASSED

- FOUND: components/dashboard/canchas-manager.tsx
- FOUND: app/(dashboard)/servicios/page.tsx (carga ampliada — agenda_spaces + initialSpaces)
- FOUND: app/(dashboard)/settings/settings-client.tsx (CanchasManager + isCanchas)
- FOUND commit: 39854d9 (Task 1)
- FOUND commit: 5356a4c (Task 2)
- tsc limpio; canchas-provision 10/10; lint sin issues nuevos
