---
quick: 261124-nxz
verified: 2026-11-24
status: passed
score: 6/6 must-haves verified
behavior_unverified: 0
gaps: []
---

# Quick 261124-nxz: Apellido opcional en el alta rápida de cliente. Verificación

**Goal:** apellido opcional en el alta rápida de cliente (Nuevo turno, Nuevo abono, venta de Finanzas), guardado en `clients.last_name`, snapshot con nombre completo, caminos existente/dedupe sin cambios, guardas de borrador, reserva pública intacta, sin migración, aislamiento de tenant intacto.

## Verdad por verdad (contra el código, no contra el SUMMARY)

| # | Verdad | Estado | Evidencia |
|---|--------|--------|-----------|
| 1 | Nuevo turno: campo «Apellido (opcional)» junto a Nombre; `clients.last_name` (NULL si vacío); `appointments.client_name` = nombre completo; resumen y tarjeta con nombre completo | VERIFICADO | `nuevo-turno-form.tsx`: fila `flex flex-col sm:flex-row` con el campo nuevo, `body.clientLastName`, resumen y tarjeta con `clientFullName(...)`. `appointments/create/route.ts`: `normalizeLastName(body.clientLastName)`, insert con `last_name`, `clientName: fullName` hacia `createAppointmentCore`. Test de handler real verde. |
| 2 | Nuevo abono: mismo campo; la primera tanda lleva el nombre completo | VERIFICADO | `nuevo-abono-form.tsx` equivalente. `abonos/create/route.ts` inserta `last_name`. `lib/abono-generation.ts` selecciona `name, last_name` y arma el snapshot con `clientFullName` (L111-124, filtrado por `business_id`). Test real verde. |
| 3 | Finanzas: Apellido junto a «Nombre *»; insert con `last_name` normalizado | VERIFICADO | `finances-client.tsx`: `NewClientDraft.last_name`, grilla `grid-cols-2` con `text-base sm:text-sm`, insert con `last_name: normalizeLastName(...)`. |
| 4 | Cliente existente y dedupe sin cambios | VERIFICADO | `pickClient` pone `last_name: null` (su `name` ya es el completo), así que no hay apellido duplicado. El handler no toca el cliente en el camino por `clientId` ni en el match por contacto. Tests de «existente» y «contacto repetido» verdes. El aviso de dedupe ahora muestra `clientFullName(dedupeMatch)`, cambio solo de copy y previsto en el plan. |
| 5 | Guardas de borrador: el apellido cuenta y se resetea | VERIFICADO | `isDirty` de turno y abono incluye `newClientLastName.trim()`. `saleFingerprint` incluye `ncLastName`. Los reseteos están en los dos «Crear nuevo cliente» de ambos forms y en `resetSaleClientState`/`openNewSale`/`openEditSale`. |
| 6 | Aislamiento: anon+RLS, `business_id`, sin service role nuevo, sin migración, reserva pública intacta | VERIFICADO | `git diff --name-only 6888afb^ 536bb3c` lista solo 7 archivos: 2 routes, 3 pantallas, 2 tests. No hay cambios en `app/[slug]`, `app/api/booking` ni `supabase/`. Los inserts de `clients` siguen en `supabase` anon+RLS con `business_id` del dueño. El dedupe sigue con `.eq('business_id', businessId)`. No hay cliente admin nuevo (el único uso de service role es el preexistente de `getBusinessSecrets`). |

## Comprobaciones ejecutadas

- `node node_modules/typescript/bin/tsc --noEmit`: exit 0, sin errores.
- `npm test -- test/manual-booking.test.ts test/abono-create.test.ts test/client-name.test.ts test/panel-input-zoom-ios.test.ts test/panel-draft-guard-coverage.test.ts test/forms-no-get-leak.test.ts`: 6 archivos, 60 tests pasados, 0 salteados.
- Los 6 casos nuevos del carril `db` corrieron de verdad (verbose, marcados ✓ `|db|`) y llaman al `POST` real del handler:
  - turno: cliente nuevo con apellido, apellido en blanco, existente sin apellido, contacto repetido sin pisar nombre ni apellido.
  - abono: con apellido (todos los turnos con nombre completo), apellido en blanco.

## Anti-patrones

Sin TODO/FIXME/stubs en las líneas modificadas. El campo nuevo se manda y se persiste de punta a punta (formulario, body, handler, insert, snapshot).

## Observaciones (no bloqueantes)

- `origin` de los clientes creados inline sigue sin enviarse (la base pone el default). Está fuera de alcance y el SUMMARY lo anota para decisión de Franco.
- En Finanzas, si el usuario escribe un Apellido, vuelve a buscar y entra otra vez a «Nuevo» dentro del mismo modal, el apellido queda conservado. Es el mismo comportamiento que ya tienen teléfono y email, y se limpia al abrir el modal.
- Visual (alineación de la fila y 16px en mobile): lo cubren los gates de grep (`panel-input-zoom-ios` verde). No se hizo prueba en navegador; la regla del repo la reserva para UAT con turno de pantalla. No es bloqueante.

## Veredicto

Objetivo logrado. Sin gaps.
