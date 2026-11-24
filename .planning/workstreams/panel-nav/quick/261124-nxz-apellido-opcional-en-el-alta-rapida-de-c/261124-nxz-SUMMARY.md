---
phase: quick-261124-nxz
plan: "01"
subsystem: panel / alta rápida de cliente (turno, abono, venta)
tags: [clientes, apellido, panel, rls]
status: complete
requires: [quick-261124-lfd (clients.last_name + lib/client-name.ts)]
provides: [apellido opcional en el alta inline de Nuevo turno, Nuevo abono y la venta de Finanzas]
affects: [app/api/appointments/create, app/api/abonos/create, nuevo-turno-form, nuevo-abono-form, finances-client]
tech-stack:
  added: []
  patterns: [tests de la base que invocan el POST real del handler con la sesión del dueño (molde abono-cancel-routes)]
key-files:
  created: []
  modified:
    - app/api/appointments/create/route.ts
    - app/api/abonos/create/route.ts
    - components/dashboard/nuevo-turno-form.tsx
    - components/dashboard/nuevo-abono-form.tsx
    - app/(dashboard)/finances/finances-client.tsx
    - test/manual-booking.test.ts
    - test/abono-create.test.ts
decisions:
  - "Campo del body: clientLastName (camelCase, igual que clientName/clientPhone/clientEmail de esos dos handlers)"
  - "SelectedClient.last_name obligatorio; null para el cliente existente (su name ya es el completo, si no el apellido sale dos veces)"
  - "Nombre completo en el snapshot client_name, en Google Calendar y en los mails de alta (turno y abono)"
  - "«Crear nuevo cliente» desde la búsqueda sigue pasando el texto entero a Nombre, sin partirlo; Apellido arranca vacío"
  - "El aviso de dedupe muestra el nombre completo del cliente existente"
requirements-completed: []
metrics:
  duration: ~25min
  completed: 2026-11-24
commits: 3
plan_head_before: a758c958d6d6a9cba0cf3386541cc32ec1ff69f1
actuals:
  tokens: 12100
  tasks: 3
  commits: 3
---

# Quick 261124-nxz: Apellido opcional en el alta rápida de cliente (turno, abono, venta) Summary

El alta rápida de cliente dentro de Nuevo turno, Nuevo abono y la venta de Finanzas ahora tiene «Apellido (opcional)»: se guarda en `clients.last_name` (NULL si queda vacío) y el turno/abono queda con el nombre completo en `client_name`.

Cierra el ítem 1 del «Diferido / fuera de alcance» de 261124-lfd (el alta inline quedaba sin apellido).

**Sin migración ni paso manual antes del deploy:** `clients.last_name` ya existe en local, staging y prod (261124-lfd).

## Qué cambió

| Task | Commit | Archivos |
|------|--------|----------|
| 1 (tracer) — Nuevo turno: form → handler → clients + appointments | 6888afb | test/manual-booking.test.ts, app/api/appointments/create/route.ts, components/dashboard/nuevo-turno-form.tsx |
| 2 — Nuevo abono: el cliente nuevo lleva apellido y sus turnos el nombre completo | c7c8380 | test/abono-create.test.ts, app/api/abonos/create/route.ts, components/dashboard/nuevo-abono-form.tsx |
| 3 — Venta de Finanzas: modo «Nuevo» con Apellido | 536bb3c | app/(dashboard)/finances/finances-client.tsx |

- **Handlers (turno y abono):** leen `clientLastName` con `normalizeLastName` (no-string, vacío o solo espacios → null), lo pasan a `resolveClientId` y lo insertan en el paso (3). Los pasos (1) re-validación del clientId por `business_id` y (2) dedupe por contacto NO cambiaron: un contacto repetido sigue reusando al cliente sin pisarle nombre ni apellido. El guard de `missing_fields` sigue igual (el nombre es obligatorio).
  - Turno: `fullName = clientFullName(...)` va al snapshot (`createAppointmentCore`), al evento de Google Calendar y al mail opcional.
  - Abono: el mail de alta saluda con el nombre completo; el snapshot de cada ocurrencia lo sigue armando `lib/abono-generation.ts` desde la base.
- **Forms de turno y abono:** fila Nombre / Apellido (apilada en mobile, lado a lado desde `sm`), placeholder «Nombre» y «Apellido», sin clases de tamaño (heredan 16px). `isDirty` cuenta el apellido; los dos «Crear nuevo cliente» lo resetean; «Editar» lo restaura. Tarjeta del elegido, resumen de confirmación (turno) y aviso de dedupe usan `clientFullName`.
- **Finanzas:** `NewClientDraft.last_name`, `ncLastName` en `saleFingerprint`, `last_name: ''` en los 4 literales, Input «Apellido» en la grilla `grid-cols-2` junto a «Nombre *», y `last_name: normalizeLastName(...)` en el insert (sigue siendo del navegador bajo RLS, mismo `business_id`).

## TDD: rojo previo

- **manual-booking (POST real):** antes de tocar el handler fallaron los casos 1 (cliente nuevo con apellido: recibió `'Ana'` en vez de `'Ana Pérez'`) y 4 (dedupe: recibió `'Otra'` en vez de `'Otra Persona'`). Los casos 2 (apellido solo espacios) y 3 (cliente existente) pasaron desde el principio: son guardas. Resultado final: **11/11, 0 skipped**.
- **abono-create (POST real):** antes del handler falló el caso 1 (`last_name` null en vez de `'Pérez'`); el caso 2 (solo espacios) es guarda y pasó desde el principio. Resultado final: **15/15, 0 skipped** (los 1-7 y m1-m4 siguen verdes; `@/lib/email` no se mockeó).

## Verificación

- `npm test` completo: **124 archivos, 2453 passed, 4 expected fail, 1 skipped (2458)**. El skipped es `isolation.test.ts > upload-gate ... landing-assets`, que skipea a propósito sin Storage local (`RUN_STORAGE_TESTS`); no es de este quick. Corrido a las ~17:35 hora AR, dentro de la ventana de los canarios de reloj: no fallaron.
- Candados: client-name, panel-draft-guard-coverage, panel-input-zoom-ios, forms-no-get-leak, overlay-history y abono-generation verdes (90 y 101 tests en las dos corridas parciales).
- `node node_modules/typescript/bin/tsc --noEmit`: sin salida, exit 0.
- `npm run build`: ok (Compiled successfully).
- Gates de git: los commits `261124-nxz` tocan solo los 7 archivos del plan; 0 en `app/[slug]`, `app/api/booking` o `supabase/`; 0 archivos de la quick 261124-neg.
- Gates de grep de las 3 tasks: todos cumplidos (incluido 0 `createAdminClient` fuera de comentarios en los dos route files).

### eslint antes / después

| Archivo | Antes | Después |
|---------|-------|---------|
| app/api/appointments/create/route.ts | 0 | 0 |
| components/dashboard/nuevo-turno-form.tsx | 0 | 0 |
| test/manual-booking.test.ts | 0 | 0 |
| app/api/abonos/create/route.ts | 0 | 0 |
| components/dashboard/nuevo-abono-form.tsx | 0 | 0 |
| test/abono-create.test.ts | 0 | 0 |
| app/(dashboard)/finances/finances-client.tsx | 1 error | 1 error (el mismo) |

El error de finances-client es previo y ajeno: `react-hooks/set-state-in-effect` en `useEffect(() => { fetchData() }, [fetchData])` (antes L468, ahora L469 por la línea sumada en la huella). Por eso el `npm run lint -- ...` del verify de la Task 3 sale con exit 1 aunque no haya problemas nuevos. (261124-lfd había anotado 0 en ese archivo; hoy mide 1 sin cambios nuestros en esa línea.)

## Deviations from Plan

- El plan avisaba de archivos sin commitear de la quick 261124-neg; al arrancar ya estaban commiteados por la otra sesión (HEAD avanzó a a758c95 en el medio). No hubo nada que esquivar.
- Ninguna otra: el plan se ejecutó tal cual.

## Observación fuera de alcance (decisión para Franco)

Los tres inserts inline (turno, abono, venta) no mandan `origin`, así que el cliente queda con el default de la base. No se tocó. Decidir en otro quick si corresponde `'manual'`.

## Pendiente: UAT visual

**Las pantallas NO se probaron en un navegador.** Queda para la UAT del dueño (human-check de la Task 3): en Nuevo turno, Nuevo abono y una venta de Finanzas, crear un cliente con apellido y otro sin, en mobile y desktop; ver Apellido al lado de Nombre (apilado en mobile en turno/abono), sin zoom al enfocar en iPhone; el resumen del turno dice «Nombre Apellido»; en /clients la ficha muestra el apellido (o nada) y en la agenda el turno se ve con el nombre completo; escribir solo el apellido y tocar afuera tiene que avisar cambios sin guardar.

## Self-Check: PASSED

- Archivos modificados existen; commits 6888afb, c7c8380 y 536bb3c presentes en `git log`.
