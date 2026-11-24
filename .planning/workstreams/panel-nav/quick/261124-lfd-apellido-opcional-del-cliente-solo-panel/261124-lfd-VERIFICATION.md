---
phase: quick-261124-lfd
verified: 2026-11-24T19:10:00Z
status: human_needed
score: 8/8 must-haves verified (codigo); 0 gaps
covered_files:
  - app/(crm)/admin/negocios/[id]/ver/impersonation-view.tsx
  - app/(dashboard)/abonos/abonos-client.tsx
  - app/(dashboard)/abonos/page.tsx
  - app/(dashboard)/clients/clients-client.tsx
  - app/(dashboard)/clinical-history/clinical-history-client.tsx
  - app/(dashboard)/finances/finances-client.tsx
  - app/api/clients/create/route.ts
  - app/api/export/clients/route.ts
  - app/api/import/clients/confirm/route.ts
  - components/dashboard/nuevo-abono-form.tsx
  - components/dashboard/nuevo-turno-form.tsx
  - lib/abono-generation.ts
  - lib/client-name.ts
  - lib/clients-create.ts
  - lib/clients-import.ts
  - lib/clients-xlsx.ts
  - lib/types.ts
  - supabase/migrations/081_clients_last_name.sql
  - supabase/schema.sql
covered_digest: "v1:sha256:bf0a0c8b92637cef908da1bb28fb5b47dad48e35165ca8572342884915f767e5"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Abrir en Excel real el .xlsx exportado desde /clients"
    expected: "Encabezado de Origen en gris (distinto del rojo de marca), nota visible al pasar el mouse, y lista desplegable reserva/manual/importado en cada celda de Origen"
    why_human: "Los tests inspeccionan el modelo de ExcelJS (fill, note, dataValidation), no el render de Excel. El plan mismo deja el gris a confirmacion del dueno en la UAT"
  - test: "Abrir la plantilla descargada"
    expected: "Sin columna Origen; hoja Instrucciones explica Apellido y las columnas obligatorias"
    why_human: "Presentacion en Excel"
  - test: "/clients en mobile y desktop: Nuevo cliente y ficha en modo edicion"
    expected: "Apellido (opcional) al lado de Nombre (apilado en mobile), mismo estilo que Telefono/Email; sin zoom de iOS al enfocar"
    why_human: "Layout visual; la unica prueba automatica de zoom es un test de clases"
  - test: "Aplicar la migracion 081 a staging y a prod a mano + NOTIFY pgrst ANTES de deployar"
    expected: "clients.last_name existe; /clients, import, export y lista de abonos funcionan"
    why_human: "Accion externa de Franco (decision D-01). Sin la columna esas pantallas fallan con PGRST204/42703. Esta verificacion solo la confirmo en el Supabase LOCAL"
---

# Quick 261124-lfd: Apellido opcional del cliente + Origen del Excel — Verificacion

**Objetivo:** apellido opcional del cliente solo en el panel (migracion 081 nullable; reserva publica y book_slot_atomic intactos; lista ordenada por nombre; se muestra "Nombre Apellido") + columna Origen del Excel que no confunda (informativa con desplegable en el export, ausente en la plantilla, opcional/ignorada en el import).
**Commits:** 889ea2f, 3ff1cd2, 3a80447 (main)
**Modo:** inicial. Se leyo el codigo real y los diffs; el SUMMARY no se uso como evidencia.

## Verdades observables

| # | Verdad | Estado | Evidencia |
|---|--------|--------|-----------|
| 1 | Alta manual y ficha con Apellido opcional; vacio -> NULL; nada lo exige | VERIFICADO | `clients-client.tsx`: campo `nc-last-name` junto a Nombre, zod `last_name: z.string().trim().optional()`; `app/api/clients/create/route.ts` usa `normalizeLastName(body.last_name)`; `saveClient` escribe `normalizeLastName(editForm.last_name)`. Test db manual-client (persiste `Perez`, vacio -> null) paso contra el Supabase local |
| 2 | "Nombre Apellido" desde UN helper en todo el panel; busqueda por apellido/completo; orden e indice por nombre de pila | VERIFICADO | `lib/client-name.ts` (`clientFullName`, trim, filtra vacios). Usado en lista, ficha, fusion, borrado, pickers de turno/abono, abonos, finanzas, historia clinica, impersonation-view, preview del import. Busqueda con `clientFullName(c).toLowerCase().includes(q)`. `.sort((a,b)=>a.name.localeCompare(...))` y letra/avatar siguen con `name` (lineas 642/648/1079) |
| 3 | Turno/abono del panel para cliente existente guarda `client_name` = nombre completo | VERIFICADO | `pickClient` en nuevo-turno-form y nuevo-abono-form -> `name: clientFullName(c)` -> `clientName` del body. `lib/abono-generation.ts`: `select('name, last_name, phone, email')` con `.eq('business_id', business.id)` y `clientFullName(...)`. Test db abono-generation paso |
| 4 | Reserva publica intacta | VERIFICADO | `git diff --name-only 889ea2f~1 3a80447` filtrado por `slug|booking|book_slot` = vacio; en `supabase/migrations/` solo cambia `081_clients_last_name.sql`. 23 archivos tocados, ninguno bajo `app/[slug]` ni `app/api/booking` |
| 5 | Export: Nombre, Apellido, Telefono, Email, Notas, Obra social, Nro. obra social, Origen; Origen gris con nota y lista; plantilla sin Origen con Instrucciones | VERIFICADO (modelo) / HUMANO (render) | `CLIENTS_XLSX_COLUMNS` en ese orden con `informativa` en Origen; `buildClientsWorkbook` filtra Origen en plantilla, setea fill `FF7F7F7F`, `note` y `dataValidation list "reserva,manual,importado"` por celda de datos. `INSTRUCCIONES` trae Apellido y "Columnas". Tests de clients-xlsx cubren cada punto y pasan |
| 6 | Import acepta con/sin Apellido y con/sin Origen (ignorado); alias; header = Nombre + (Telefono o Email); .csv viejos entran; clients-import.test.ts sin modificar; dedup igual | VERIFICADO | `isValidImportHeader`, `HEADER_ALIAS {last_name: 'apellido'}`, `canonicalHeader` normaliza mayusculas. `classifyRows` nunca emite origen; `confirm` fuerza `'importado'`. `git diff --stat` de `test/clients-import.test.ts` entre 889ea2f~1 y 3a80447 = vacio. Tests: formato viejo de 7 columnas, Origen hackeado, `last_name`, solo Nombre invalido |
| 7 | Migracion 081 limpia, nullable, sin default ni backfill; schema.sql la espeja; no aplicada a staging/prod | VERIFICADO (local) | SQL: `ADD COLUMN IF NOT EXISTS last_name text` + `NOTIFY pgrst`. `psql` en `supabase_db_forjo-app`: `last_name | text | YES | (sin default)`. `schema.sql` +1 linea. Prod/staging: pendiente de Franco (ver humano #4) |
| 8 | Aislamiento intacto: sin policy nueva, sin service role nuevo, queries filtradas por business_id | VERIFICADO | Ver tabla de aislamiento abajo |

**Puntaje:** 8/8 verdades verificadas a nivel codigo; las partes visuales y la aplicacion en prod quedan como items humanos.

## Aislamiento de tenant (verificado independientemente)

| Query / escritura tocada | Cliente | Filtro de tenant |
|--------------------------|---------|------------------|
| `POST /api/clients/create` insert | anon+RLS (sesion) | `business_id` lo pone `buildClientInsert` desde el negocio de la sesion; el body no lo aporta |
| `GET /api/export/clients` select | anon+RLS | `.eq('business_id', business.id)` |
| `POST /api/import/clients/confirm` existentes + batch insert | anon+RLS | `.eq('business_id', business.id)` y `business_id` desde `buildClientInsert` |
| `lib/abono-generation.ts` select de cliente | cliente recibido (como antes) | `.eq('id', …).eq('business_id', business.id)` |
| `abonos/page.tsx` select con `clients(name, last_name)` | anon+RLS | `.eq('business_id', business.id)` (join, columna extra) |
| `saveClient` update de la ficha | browser anon+RLS | `.eq('id', client.id)` solo por id, IDENTICO a antes del quick; RLS por business_id es el limite. No es una regresion de este cambio |
| `clients/page.tsx` | anon+RLS | `.eq('business_id', business.id)`, sin cambios |

Los tres route handlers tocados declaran y usan anon+RLS; `grep createAdminClient` no encuentra ninguno. No se agregaron policies (solo 081, que no las incluye). Ninguna vista publica expone `clients`.

## Verificaciones ejecutadas

| Comprobacion | Resultado |
|--------------|-----------|
| `node node_modules/typescript/bin/tsc --noEmit` | sin errores |
| `npm test -- test/client-name.test.ts test/clients-xlsx.test.ts test/clients-import.test.ts` | 3 archivos, 106 tests OK |
| `npm test -- test/manual-client.test.ts test/abono-generation.test.ts` (carril db, Supabase local) | 2 archivos, 21 tests OK |
| `npm test -- forms-no-get-leak, overlay-history, panel-draft-guard-coverage, panel-history-clients, panel-input-zoom-ios, panel-nav-chrome` | 6 archivos, 151 tests OK |
| Columna en la DB local | `last_name text nullable, sin default` |
| Navegador / dev server | No se lanzaron (fuera de alcance) |

## Anti-patrones / observaciones

- Sin TBD/FIXME/XXX nuevos en los archivos tocados que sean relevantes; sin stubs: todos los valores renderizados salen de datos reales de `clients`.
- Fuera de alcance por decision documentada (D-09, tabla del PLAN): emails y pagina publica de baja de abono (`clients(name)` en `app/abono/cancelar`, `app/api/abonos/cancel*`), alta inline de cliente en turno/abono/venta (solo "Nombre"). Es coherente con el plan; si el dueno espera Apellido ahi, seria otro quick.
- Esperado y no es gap: los clientes existentes quedan con `last_name` NULL (D-03), el nombre completo se ve igual que antes.

## Items para confirmar a mano

Ver `human_verification` en el frontmatter: render real del Excel (gris, nota, desplegable), layout del Apellido en mobile/desktop, y sobre todo **aplicar 081 en staging y prod con NOTIFY antes de deployar** (el codigo la pide por nombre; sin ella /clients, import, export y /abonos fallan).

## Resumen de gaps

Ninguno. El codigo cumple todo lo que el plan prometio y la reserva publica y la RPC atomica no se tocaron.

---
_Verificado: 2026-11-24_
_Verificador: Claude (gsd-verifier)_
