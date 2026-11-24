---
phase: quick-261124-lfd
plan: "01"
status: complete
subsystem: clientes (panel) + Excel de clientes
tags: [clients, last_name, migracion-081, xlsx, import, export]
requires: [quick-261124-ine (Excel de clientes)]
provides: [clients.last_name, lib/client-name.ts (clientFullName, normalizeLastName), isValidImportHeader]
affects: [/clients, nuevo-turno-form, nuevo-abono-form, /abonos, /finances, /clinical-history, CRM impersonation-view, export/import de clientes]
tech-stack:
  added: []
  patterns: ["un helper puro para el nombre completo del cliente (molde del join de profesionales, centralizado y con trim)"]
key-files:
  created:
    - supabase/migrations/081_clients_last_name.sql
    - lib/client-name.ts
    - test/client-name.test.ts
  modified:
    - supabase/schema.sql
    - lib/types.ts
    - lib/clients-create.ts
    - app/api/clients/create/route.ts
    - app/(dashboard)/clients/clients-client.tsx
    - test/manual-client.test.ts
    - components/dashboard/nuevo-turno-form.tsx
    - components/dashboard/nuevo-abono-form.tsx
    - lib/abono-generation.ts
    - app/(dashboard)/abonos/page.tsx
    - app/(dashboard)/abonos/abonos-client.tsx
    - app/(dashboard)/finances/finances-client.tsx
    - app/(dashboard)/clinical-history/clinical-history-client.tsx
    - app/(crm)/admin/negocios/[id]/ver/impersonation-view.tsx
    - test/abono-generation.test.ts
    - lib/clients-import.ts
    - lib/clients-xlsx.ts
    - app/api/export/clients/route.ts
    - app/api/import/clients/confirm/route.ts
    - test/clients-xlsx.test.ts
decisions:
  - "clients.last_name text nullable, sin CHECK ni backfill; la normalización (trim, vacío → NULL) vive en lib/client-name.ts"
  - "Header del import válido = Nombre + (Teléfono o Email); Apellido, Notas, Obra social, Nro. y Origen opcionales; Origen se ignora siempre"
  - "Origen solo en el export, última columna, encabezado gris FF7F7F7F + nota + lista desplegable; la plantilla no la trae"
  - "El alta inline de cliente (turno, abono, venta) sigue con un solo campo Nombre"
requirements-completed: []
metrics:
  duration: 16min
  completed: 2026-11-24
estimate:
  tokens: 85000
  tasks: 3
actuals:
  tokens: 21000
  tasks: 3
  commits: 3
plan_head_before: d46c00e8ebaa7a26e4eb81bb3eb6b86be374e710
---

# Quick 261124-lfd: el cliente tiene apellido opcional, solo en el panel, y Origen deja de confundir en el Excel

El cliente ahora tiene un apellido opcional que solo se carga desde el panel. Para la base es una columna nueva, `clients.last_name` (migración 081). Todo el panel arma el «Nombre Apellido» con un solo helper, `clientFullName`. En el Excel de clientes, Apellido va al lado de Nombre. Origen pasa a ser la última columna del export, en gris, con una nota y una lista desplegable. La plantilla no la trae y el import la ignora.

## ⚠ Antes del deploy (paso manual de Franco)

El código nuevo lee y escribe `last_name` por nombre. Si la columna no existe, fallan el alta de clientes, el import, el export y la lista de abonos (PGRST204 / 42703). Por eso **la 081 se aplica a mano en staging y en prod ANTES de deployar**, desde el SQL Editor de Supabase. Este quick no pusheó nada.

SQL a correr (es el contenido de `supabase/migrations/081_clients_last_name.sql`, con el NOTIFY incluido):

```sql
ALTER TABLE "public"."clients"
  ADD COLUMN IF NOT EXISTS "last_name" text;

NOTIFY pgrst, 'reload schema';
```

Confirmar después:

```sql
select column_name from information_schema.columns where table_name='clients' and column_name='last_name';
```

Tiene que devolver una fila (`last_name`). Recién después se deploya. `supabase/schema.sql` ya quedó espejado en el repo.

## Qué se hizo

| Task | Commit | Qué |
|------|--------|-----|
| 1 (tracer) | 889ea2f | Migración 081 + schema.sql, `lib/client-name.ts`, `last_name` en `Client`/`buildClientInsert`/POST create, «Apellido (opcional)» en el alta y en la edición de la ficha, nombre completo en lista/ficha/búsqueda/fusión/borrado de /clients |
| 2 | 3ff1cd2 | Nombre completo en los pickers de turno y abono (y en el snapshot `client_name`), generación de ocurrencias del abono, /abonos, /finances, /clinical-history, vista de CRM |
| 3 | 3a80447 | Excel: Apellido en export/plantilla/import, Origen informativa al final (solo export), header nuevo del import, preview con nombre completo, mensaje de `invalid_header` nuevo |

## Evidencia

**Base local (`supabase db reset`)**, log en `C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/852caa9d-96c1-4359-9d60-05639393cb6a/scratchpad/db-reset-081.log`:

```
Applying migration 081_clients_last_name.sql...
Finished supabase db reset on branch main.
```

psql (`information_schema.columns`, `public.clients.last_name`): `text,YES`, o sea text y nullable. No se corrió nada contra staging ni prod.

**Tests:**
- RED antes de cada implementación: `client-name` falló porque el módulo no existía, y el caso 1 de `abono-generation` falló porque todavía no tenía el apellido en `client_name`.
- Task 1: 7 archivos, 115/115. El caso nuevo de `manual-client` («apellido — last_name se persiste; vacío queda null») corrió en el carril db contra la base local, no se salteó.
- Task 2: 8 archivos, 250 pasan + 1 expected fail (preexistente). Las 5 ocurrencias tienen `client_name = 'Cliente Abono Pérez'`.
- Task 3: `clients-xlsx` + `clients-import` dan 96/96. Con los candados, 7 archivos y 191/191.
- `test/clients-import.test.ts` no se modificó: `git diff` está vacío y ningún commit del quick lo toca.
- `npm test` completo: **121 archivos, 2414 pasan, 4 expected fail, 1 skipped (2419)**, corrido a las 16:01 hora AR. Es dentro de la ventana de los canarios de reloj, así que no falló ninguno.

**Tipos y build:**
- `node node_modules/typescript/bin/tsc --noEmit`: sin salida, exit 0, después de cada task.
- `npm run build`: ok.

**eslint antes/después (problemas):**

| Archivo | Antes | Después |
|---------|-------|---------|
| app/(dashboard)/clients/clients-client.tsx | 0 | 0 |
| components/dashboard/nuevo-turno-form.tsx | 0 | 0 |
| components/dashboard/nuevo-abono-form.tsx | 0 | 0 |
| app/(dashboard)/abonos/page.tsx | 0 | 0 |
| app/(dashboard)/abonos/abonos-client.tsx | 0 | 0 |
| app/(dashboard)/finances/finances-client.tsx | 0 (el plan esperaba 1; hoy mide 0) | 0 |
| app/(dashboard)/clinical-history/clinical-history-client.tsx | 0 | 0 |
| app/(crm)/admin/negocios/[id]/ver/impersonation-view.tsx | 0 | 0 |
| lib/clients-import.ts | 1 warning (`_business` sin usar, preexistente: la misma línea en HEAD da lo mismo) | 1 (el mismo) |
| lib/client-name.ts, lib/clients-create.ts, lib/abono-generation.ts, lib/clients-xlsx.ts, rutas create/export/confirm | 0 | 0 |

**Gates:**
- La reserva pública quedó intacta (D-04). De los 24 archivos que tocaron los commits del quick, 0 caen en `^app/\[slug\]|^app/api/booking|book_slot_atomic`.
- Ningún import de `supabase/admin` en las rutas ni en los módulos tocados.
- `clients-client.tsx` sigue sin importar exceljs, clients-xlsx ni xlsx-style.

## Regla nueva del header del import

**Válido = columna Nombre Y al menos una de Teléfono o Email.**
- Apellido, Notas, Obra social y Nro. obra social son opcionales.
- Origen se reconoce, pero se ignora siempre: `origin='importado'` lo sigue forzando `buildClientInsert`.
- Las columnas extra se ignoran.
- Alias: `Apellido`, `apellido`, `APELLIDO` y `last_name` caen todos en `apellido`.

Por qué no alcanza con «solo Nombre»: un archivo cualquiera que tenga una columna Nombre pasaría el header, y todas sus filas caerían como `missing_fields`. El dueño vería 2000 errores de fila en vez de un aviso claro de formato. Exigir la columna de contacto que `validateClientBody` pide en cada fila conserva el «header equivocado → no se procesan filas», sin obligar a agregar columnas vacías: una lista propia con Nombre + Teléfono entra tal cual. Los .csv viejos (7 columnas snake_case con origen) y los Excel de la quick anterior (Origen en 4ª posición, sin Apellido) entran igual, con apellido null.

## Superficies incluidas / excluidas

| Superficie | Decisión |
|------------|----------|
| /clients: lista, ficha (h2 + edición), buscador, fusión + aviso, confirmación de borrado, preview del import | ENTRA |
| nuevo-turno-form / nuevo-abono-form: filtro, lista, cliente elegido → snapshot `client_name` completo | ENTRA |
| lib/abono-generation.ts (client_name de cada ocurrencia) | ENTRA |
| /abonos: lista, título del detalle, diálogos de baja/borrado | ENTRA |
| /finances: buscador de la venta, cliente elegido, cliente vinculado en la lista | ENTRA |
| /clinical-history: buscador, lista, encabezado | ENTRA |
| CRM impersonation-view (lista de clientes) | ENTRA |
| GET /api/agent/context | AFUERA (no lee clients) |
| Emails de baja de abono | AFUERA (saludo al cliente final por el nombre de pila) |
| Agenda / Turnos / dashboard / Google Calendar / emails de turno | AFUERA (leen el snapshot `client_name`) |
| Reserva pública y página pública de baja de abono | AFUERA (D-04) |
| Alta inline de cliente (turno, abono, venta) | AFUERA (un solo campo Nombre) |

El orden de las listas, la letra del índice y las iniciales del avatar siguen saliendo del nombre de pila.

## Diferido / fuera de alcance (no reportar como bug en la UAT)

En estos lugares se sigue viendo **solo el nombre de pila**, o lo que ya estaba guardado, y es intencional:

1. **El alta rápida inline** de cliente nuevo dentro de Nuevo turno, Nuevo abono y la venta de Finanzas sigue con un solo campo «Nombre», sin Apellido. Un cliente creado por ahí queda con `last_name` NULL.
2. **Los turnos viejos** guardan el snapshot `appointments.client_name` de cuando se crearon. Agenda, Turnos, el dashboard, Google Calendar y los mails de turno muestran ese snapshot, no el nombre completo actual. Solo los turnos y abonos que el panel cree desde ahora para un cliente existente llevan «Nombre Apellido».
3. **Los emails de baja de abono** saludan «Hola {nombre}» con el nombre de pila, a propósito.
4. **La reserva pública** sigue con un solo campo de nombre y no escribe apellido (D-04).

## Muestras para revisar a mano

- `C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/852caa9d-96c1-4359-9d60-05639393cb6a/scratchpad/clientes-ejemplo-2026-11-24.xlsx` es el export con 6 clientes: 5 con apellido (incluido `O'Brien`) y 1 sin apellido. Más uno con nombre `=Prueba de fórmula`.
- `C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/852caa9d-96c1-4359-9d60-05639393cb6a/scratchpad/plantilla-clientes.xlsx` es la plantilla: 7 columnas sin Origen, más la hoja Instrucciones nueva.

Las releí con la librería: títulos en el orden nuevo, Origen con fill `FF7F7F7F`, la nota y la validación de lista; la plantilla con 7 títulos y 1 fila.

**No se abrieron en Excel**, y **las pantallas no se probaron en un navegador**. Quedan para la UAT del dueño:
- Abrir los dos archivos en Excel: Apellido al lado de Nombre; en el export, Origen última, gris, con la nota al pasar el mouse y la lista desplegable; la plantilla sin Origen.
- En /clients: crear un cliente con y sin apellido, editarle el apellido, buscarlo por apellido y reimportar el export.

## Deviations from Plan

Ninguna de comportamiento. Dos notas menores:
- `finances-client.tsx` midió 0 problemas de eslint antes de editar (el plan esperaba 1 preexistente). Quedó en 0.
- La nota del encabezado de Origen se pudo afirmar **sobre el archivo recargado**: la librería la devuelve al recargar, así que no hizo falta el plan B de afirmarla en memoria.

## Threat Flags

Ninguna superficie nueva fuera del threat model. No hay policy nueva ni cliente de service role nuevo, y todas las queries tocadas siguen filtradas por `business_id`.

## Self-Check: PASSED

- Archivos creados presentes: `supabase/migrations/081_clients_last_name.sql`, `lib/client-name.ts`, `test/client-name.test.ts`, las dos muestras .xlsx.
- Commits presentes: 889ea2f, 3ff1cd2, 3a80447. `git rev-list --count d46c00e..HEAD` da 3.
