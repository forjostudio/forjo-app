---
phase: quick-261124-lfd
plan: "01"
type: execute
wave: 1
depends_on: []
quick_id: 261124-lfd
files_modified:
  - supabase/migrations/081_clients_last_name.sql
  - supabase/schema.sql
  - lib/types.ts
  - lib/client-name.ts
  - lib/clients-create.ts
  - app/api/clients/create/route.ts
  - app/(dashboard)/clients/clients-client.tsx
  - test/client-name.test.ts
  - test/manual-client.test.ts
  - components/dashboard/nuevo-turno-form.tsx
  - components/dashboard/nuevo-abono-form.tsx
  - app/(dashboard)/abonos/page.tsx
  - app/(dashboard)/abonos/abonos-client.tsx
  - lib/abono-generation.ts
  - app/(dashboard)/finances/finances-client.tsx
  - app/(dashboard)/clinical-history/clinical-history-client.tsx
  - app/(crm)/admin/negocios/[id]/ver/impersonation-view.tsx
  - test/abono-generation.test.ts
  - lib/clients-import.ts
  - lib/clients-xlsx.ts
  - app/api/export/clients/route.ts
  - app/api/import/clients/confirm/route.ts
  - test/clients-xlsx.test.ts
autonomous: true
# CLIENT-01 (alta manual), DATA-01 (export de clientes) y DATA-03 (import de clientes) son los requisitos
# dueños de estas pantallas. Se LISTAN, no se marcan: ya están Complete; este quick les agrega el apellido
# y ordena la columna Origen. El SUMMARY lleva requirements-completed: [].
requirements: [CLIENT-01, DATA-01, DATA-03]

estimate:
  tokens: 85000
  raw_tokens: 85000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "En /clients, «Nuevo cliente» tiene «Apellido (opcional)» al lado de «Nombre» (misma fila, mismo estilo que Teléfono/Email); se guarda en clients.last_name y, si queda vacío, queda NULL. La ficha en modo edición permite cambiarlo o borrarlo. Ningún lado lo exige (D-02, D-05)"
    - "Donde el panel muestra a un cliente de la tabla clients —lista y ficha de /clients, modal de fusión y su aviso, confirmación de borrado, pickers de nuevo turno / nuevo abono / venta, lista y ficha de historia clínica, lista de abonos, vista de CRM— se lee «Nombre Apellido» recortado, salido de UN helper (clientFullName); buscar por el apellido o por el nombre completo encuentra al cliente; el orden y la letra del índice siguen saliendo del nombre de pila (D-06)"
    - "Un turno o un abono que el panel crea para un cliente existente guarda appointments.client_name = nombre completo (picker de nuevo-turno y nuevo-abono, y la generación de ocurrencias del abono); el esquema de appointments no cambia (D-07)"
    - "La reserva pública queda intacta: ningún commit de este quick toca la ruta dinámica por slug, sus route handlers de reserva ni la RPC atómica de reserva; sigue habiendo un solo campo de nombre (D-04)"
    - "El Excel exportado trae Nombre · Apellido · Teléfono · Email · Notas · Obra social · Nro. obra social · Origen; la columna Origen (última) tiene encabezado gris con una nota «lo completa el sistema… se ignora» y lista desplegable reserva/manual/importado en sus celdas de datos; la plantilla NO trae Origen y su hoja Instrucciones explica Apellido y las columnas obligatorias (D-08, D-11, D-12)"
    - "El import acepta archivos con o sin Apellido y con o sin Origen (que se ignora siempre: origin='importado'); reconoce `Apellido`, `apellido`, `APELLIDO` y `last_name`; el header es válido si tiene Nombre Y al menos una de Teléfono o Email; los .csv viejos (7 columnas snake_case con origen) entran igual y test/clients-import.test.ts no se modifica; dedup sin cambios (D-08, D-13)"
    - "La migración 081 aplica limpia con `supabase db reset` local (el log dice Applying migration 081_clients_last_name.sql) y deja clients.last_name text nullable sin default ni backfill; schema.sql la espeja; NO se aplica a staging ni a prod (lo hace Franco a mano ANTES del deploy + NOTIFY pgrst) (D-01, D-03)"
    - "Aislamiento intacto: ninguna policy nueva (clients ya es RLS por business_id y el GRANT es a nivel tabla), ningún cliente de service role nuevo, todas las queries tocadas siguen filtradas por business_id (D-01)"
  artifacts:
    - path: supabase/migrations/081_clients_last_name.sql
      provides: "ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_name text (nullable) + NOTIFY pgrst, 'reload schema'; cabecera estilo 049"
    - path: lib/client-name.ts
      provides: "clientFullName(c) y normalizeLastName(v) — puros, aptos para el navegador; la única fuente del nombre completo"
    - path: test/client-name.test.ts
      provides: "suite PURA del helper (sin test/env)"
    - path: lib/clients-import.ts
      provides: "CANONICAL_HEADER = columnas reconocidas (con apellido), isValidImportHeader(fields), alias last_name → apellido en canonicalHeader, ImportableRow.apellido"
    - path: lib/clients-xlsx.ts
      provides: "Apellido después de Nombre; Origen al final como columna informativa (nota + validación de lista + encabezado gris) solo en el export; plantilla sin Origen; parseo con la regla nueva de header"
  key_links:
    - from: "formulario «Nuevo cliente» (clients-client.tsx)"
      to: "POST /api/clients/create → normalizeLastName(body.last_name) → buildClientInsert(…).last_name → insert anon+RLS"
      via: "campo last_name del body JSON"
    - from: "ClientDetail.saveClient"
      to: "update directo de clients con last_name = normalizeLastName(editForm.last_name)"
      via: "cliente de navegador anon+RLS (igual que hoy)"
    - from: "pickClient de nuevo-turno-form / nuevo-abono-form"
      to: "selectedClient.name = clientFullName(c) → body.clientName → appointments.client_name"
      via: "el snapshot que ya escribe el core de reserva del panel (sin tocar la RPC)"
    - from: "lib/abono-generation.ts"
      to: "select name, last_name… → clientFullName → clientName de cada ocurrencia"
      via: "query filtrada por business_id"
    - from: "Excel exportado (columna Apellido)"
      to: "parseClientsFile → RawRow.apellido → classifyRows → ImportableRow.apellido → confirm: buildClientInsert last_name"
      via: "canonicalHeader('Apellido') === 'apellido'"
---

<objective>
El cliente pasa a tener apellido opcional, SOLO en el panel, y el Excel de clientes deja de confundir con la
columna Origen.

- Base: columna nueva `clients.last_name` (migración 081, nullable, sin backfill).
- Panel: «Apellido» opcional en el alta manual y en la edición de la ficha; en todo lugar donde el panel muestra
  un cliente de la tabla `clients` se ve «Nombre Apellido», desde un único helper; el snapshot `client_name` de
  los turnos/abonos que crea el panel para un cliente existente lleva el nombre completo.
- Excel: columna Apellido después de Nombre (export, plantilla, import). Origen queda solo en el export, al
  final, marcada como informativa (nota + lista desplegable); la plantilla no la trae; el import la ignora y ya
  no la exige.
- La reserva pública no se toca.

Purpose: el dueño puede cargar nombre y apellido por separado y ver a sus clientes completos en todo el panel
sin que la reserva pública cambie; y el que abre el Excel deja de pensar que «Origen» es algo que tiene que
completar.

Output: 1 migración + espejo en schema.sql, 1 helper puro nuevo, ediciones chicas en 15 archivos del panel y
del Excel, 1 suite pura nueva y 3 suites existentes extendidas.
</objective>

## Decisiones bloqueadas (del dueño, numeradas para trazabilidad)

- **D-01** Migración nueva `081_clients_last_name.sql` (080 es la última), cabecera al estilo de 049; sin policy
  nueva; se valida SOLO con `supabase db reset` local; staging y prod los aplica Franco a mano +
  `NOTIFY pgrst, 'reload schema';`; schema.sql se actualiza según el patrón del repo.
- **D-02** `name` = Nombre (de pila), `last_name` = Apellido. Opcional, no se exige en ningún lado.
- **D-03** Sin backfill ni split: los clientes existentes (datos de prueba) quedan con last_name NULL.
- **D-04** Reserva pública (página por slug, route handlers de reserva, RPC atómica): SIN cambios, un solo campo.
- **D-05** Alta manual y edición de la ficha con «Apellido» opcional al lado de «Nombre», mismo estilo; candados
  de borrador y de zoom de iOS en verde.
- **D-06** Nombre completo (recortado) en todo lugar del panel que muestra un cliente de `clients`, con UN helper
  en lib/; la búsqueda matchea nombre, apellido o completo; el orden sigue por nombre.
- **D-07** El snapshot `appointments.client_name` de un turno/abono del panel para un cliente existente = nombre
  completo; sin tocar el esquema de appointments.
- **D-08** Excel: «Apellido» después de «Nombre» en export, plantilla e import; opcional; alias `apellido` /
  `last_name`; ida y vuelta extendida con apellido; dedup sin cambios.
- **D-09** Agente, CRM, emails, finanzas: decidir por caso (ver tabla de alcance).
- **D-10** `last_name?: string | null` en la interfaz Client de lib/types.ts, con comentario.
- **D-11** Export con datos: «Origen» se queda como columna informativa, con lista desplegable
  (reserva, manual, importado) en sus celdas y nota en el encabezado.
- **D-12** Plantilla: sin columna Origen.
- **D-13** Import: Origen opcional (ignorada si viene); el planner decide el set mínimo de columnas obligatorias y
  lo documenta; la hoja Instrucciones se actualiza.

## Decisiones de criterio del planner (documentadas)

- **Sin CHECK en la base para last_name.** `clients.name` no tiene CHECK de largo (solo trim + mínimo 1 en la
  app) y `professionals.last_name` (migr. 007) es `text` pelado: «consistente con name» es no poner CHECK. Además
  el confirm del import hace UN solo batch insert: un CHECK haría que una celda mala tire el import entero. La
  normalización vive en la app: `normalizeLastName` (trim; vacío o no-string → NULL), usada por los tres
  escritores (alta, edición de la ficha, import). Sin tope de largo, igual que name.
- **Header válido = Nombre + (Teléfono o Email)** (D-13). Se evaluó «solo Nombre»: un archivo cualquiera con
  columna Nombre pasaría el header y TODAS sus filas caerían como `missing_fields`, o sea 2000 errores de fila
  en vez de un aviso claro de formato — se pierde la protección de D-01 de la quick anterior («header
  equivocado → no se procesan filas»). Exigir la columna de contacto que validateClientBody necesita fila por
  fila conserva esa protección, y una lista propia con solo Nombre + Teléfono entra sin agregar columnas
  vacías. Apellido, Notas, Obra social, Nro. obra social y Origen pasan a opcionales; extras se ignoran.
- **Origen va al final del export** (antes era la 4ª): así se lee aparte como «la columna del sistema» y la
  plantilla queda igual al export menos la última columna. El import mapea por título, así que el orden no rompe
  nada. Encabezado de Origen en gris neutro (ARGB `FF7F7F7F`, texto blanco en negrita) en vez del rojo de marca:
  la señal visual de «informativo». Lo confirma el dueño en la UAT.
- **Avatar con iniciales del nombre de pila, sin cambios**: el avatar no es «el nombre»; ordenar y agrupar por
  nombre de pila ya es la regla (D-06).
- **El alta rápida inline** (cliente nuevo dentro de nuevo-turno, nuevo-abono y la venta de Finanzas) sigue con
  un solo campo «Nombre»: D-05 nombra el alta manual y la edición de la ficha; sumarlo ahí llevaría el cambio a
  dos route handlers más sin pedido.

## Alcance de superficies (D-09) — qué entra y qué no

| Superficie | Lee `clients.name` para mostrar | Decisión |
|------------|-------------------------------|----------|
| /clients: lista, ficha, buscador, fusión + aviso, borrado | sí | ENTRA (Task 1) |
| nuevo-turno-form / nuevo-abono-form: filtro, lista, cliente elegido | sí | ENTRA (Task 2) + snapshot D-07 |
| lib/abono-generation.ts (client_name de cada ocurrencia) | sí | ENTRA (Task 2), D-07 |
| /abonos: lista, título del detalle, diálogos de baja/borrado | sí (join `clients(name)`) | ENTRA (Task 2) |
| /finances: buscador de cliente de la venta, cliente elegido, cliente vinculado en la lista | sí | ENTRA (Task 2) |
| /clinical-history: buscador, lista, encabezado | sí | ENTRA (Task 2) |
| CRM: impersonation-view (lista de clientes del negocio) | sí (`select *` vía lib/impersonation.ts) | ENTRA (Task 2), 1 línea |
| GET /api/agent/context | no lee clients | QUEDA AFUERA (nada que cambiar) |
| Emails de baja de abono (saludo «Hola …» con `clients(name)`) | sí, como saludo al cliente final | QUEDA AFUERA: es de cara al cliente y saludar por el nombre de pila es lo natural |
| Agenda / Turnos / próximos turnos del dashboard / Google Calendar / emails de turno | no: leen el snapshot `client_name` | QUEDA AFUERA (los turnos nuevos del panel ya traen el completo por D-07) |
| Página pública de baja de abono y reserva pública | sí / snapshot | QUEDA AFUERA (D-04) |
| Alta inline de cliente (turno, abono, venta) | escribe name | QUEDA AFUERA (ver criterio arriba) |

## Cobertura de fuentes (auditoría)

| Fuente | Ítem | Dónde |
|--------|------|-------|
| GOAL | Apellido opcional solo panel + Origen del Excel que no confunda | Tasks 1-3 |
| D-01 | Migración 081, sin policy, db reset local, schema.sql, prod a mano + NOTIFY | Task 1 |
| D-02 | name = Nombre, last_name = Apellido, opcional | Tasks 1, 3 |
| D-03 | Sin backfill | Task 1 |
| D-04 | Reserva pública intacta | Task 2 (snapshot sin RPC) + verificación (gate de git) |
| D-05 | Alta + edición con Apellido, mismos estilos, candados verdes | Task 1 |
| D-06 | Helper único, display completo, búsqueda, orden por nombre | Task 1 (helper + /clients), Task 2 (resto) |
| D-07 | Snapshot client_name completo | Task 2 |
| D-08 | Apellido en export/plantilla/import, alias, ida y vuelta, dedup igual | Task 3 |
| D-09 | Superficies decididas por caso | Tabla de alcance + Task 2 |
| D-10 | Client.last_name en lib/types.ts | Task 1 |
| D-11 | Origen informativa con lista + nota | Task 3 |
| D-12 | Plantilla sin Origen | Task 3 |
| D-13 | Origen opcional, set obligatorio decidido, Instrucciones | Task 3 |
| Restricción | Muestras .xlsx regeneradas en el scratchpad | Task 3 |
| Restricción | npm test (canarios de reloj), tsc sin npx, lint, build | Tasks 1-3 + verificación |

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/workstreams/panel-nav/STATE.md
@AGENTS.md
@.claude/skills/convenciones-forjo/SKILL.md
@.claude/skills/supabase-multitenant-rls/SKILL.md
@.planning/workstreams/panel-nav/quick/261124-ine-export-import-de-clientes-y-finanzas-pas/261124-ine-SUMMARY.md

# Leer COMPLETOS antes de tocar
@supabase/migrations/049_clients_origin.sql          (molde de cabecera)
@lib/clients-create.ts
@app/api/clients/create/route.ts
@lib/clients-import.ts
@lib/clients-xlsx.ts
@app/api/export/clients/route.ts

# Leer SOLO estos rangos
# supabase/schema.sql L1049-1064 (CREATE TABLE clients; pg_dump ordena por attnum → la columna nueva va
#   después de "origin", antes del CONSTRAINT)
# lib/types.ts L286-304 (interface Client)
# app/(dashboard)/clients/clients-client.tsx — Task 1: L11-13 (imports de lib), L168-185 (schema zod),
#   L356-409 (isNewClientDirty + onCreateClient), L627-648 (filtro + agrupado), L807-836 (mergeGroup),
#   L1054-1095 (fila de la lista), L1151-1157 (confirmar borrado), L1193-1205 (modal de fusión),
#   L1249-1254 (campo Nombre del alta), L1529-1600 (editForm + saveClient), L1645-1670 (edición + h2).
#   Task 3: L151-152 (ImportPreviewRow), L498-499 (copy de invalid_header), L1388-1416 (tabla/lista de preview)
# components/dashboard/nuevo-turno-form.tsx L375-407, L651-660
# components/dashboard/nuevo-abono-form.tsx L262-306, L500-506
# app/(dashboard)/abonos/page.tsx L42 · abonos-client.tsx L44-52, L380, L505-510, L660, L684
# lib/abono-generation.ts L108-125
# app/(dashboard)/finances/finances-client.tsx L364-370, L1151-1158, L1266-1270, L1288-1296
# app/(dashboard)/clinical-history/clinical-history-client.tsx L20-30, L70-75, L98-101
# app/(crm)/admin/negocios/[id]/ver/impersonation-view.tsx L215-235
# test/manual-client.test.ts L100-160 · test/abono-generation.test.ts L45-70, L136-154
# test/clients-xlsx.test.ts (entero: hay que actualizar los casos que fijaban el header rígido de 7)
# Patrón de Nombre/Apellido ya existente en el repo (profesionales): app/(dashboard)/settings/settings-client.tsx
#   L116-124 y el join inline `[p.name, p.last_name].filter(Boolean).join(' ')` (L3516) — el helper nuevo es
#   la versión centralizada y recortada de eso para clientes; NO tocar settings-client.
</context>

<!-- planner-discipline-allow: clients-xlsx -->
<!-- planner-discipline-allow: test/clients-import.test.ts -->

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): el dueño carga y ve el apellido de un cliente — base → alta → /clients</name>
  <files>supabase/migrations/081_clients_last_name.sql, supabase/schema.sql, lib/types.ts, lib/client-name.ts, test/client-name.test.ts, lib/clients-create.ts, app/api/clients/create/route.ts, app/(dashboard)/clients/clients-client.tsx, test/manual-client.test.ts</files>
  <precondition>La 081 está libre: `ls supabase/migrations` termina en 080_protect_billing_columns.sql + README.md y `git log --all --oneline -- "supabase/migrations/081_*"` no devuelve nada; y el Supabase local responde (`supabase status` lista DB_URL). Si Docker o el Supabase local no están, PARAR las partes de base (db reset, casos db) y declararlo en el SUMMARY; nunca darlas por verdes.</precondition>
  <behavior>
    - clientFullName({ name: 'Ana', last_name: 'Pérez' }) → 'Ana Pérez'; con last_name null, undefined, '' o '   ' → 'Ana'; con ' Ana ' y ' Pérez ' → 'Ana Pérez'; con name '' y last_name 'Pérez' → 'Pérez'; con null o undefined → ''
    - clientFullName(…).toLowerCase() incluye 'pérez' y 'ana p' (la búsqueda por apellido y por completo funciona con el includes de siempre)
    - normalizeLastName('  Pérez ') → 'Pérez'; '' / '   ' / null / undefined / 123 / {} → null
    - buildClientInsert con last_name 'Pérez' → payload.last_name 'Pérez'; sin last_name en el input → payload.last_name null; business_id y origin sin cambios
    - (carril db, después del db reset) un insert con buildClientInsert hecho por el dueño (ownerAnon, RLS) con last_name 'Pérez' vuelve con last_name 'Pérez'; uno sin apellido vuelve con last_name null
  </behavior>
  <action>
    Orden TDD: primero test/client-name.test.ts y el caso nuevo de test/manual-client.test.ts (rojos), después la implementación. Antes de editar clients-client.tsx, correr eslint sobre ese archivo y anotar la cuenta (la quick anterior midió 0).

    1) supabase/migrations/081_clients_last_name.sql (per D-01, D-03). Cabecera en español al estilo de 049 con secciones Contexto / Qué hace / Qué NO hace: el apellido opcional del cliente, solo para el panel; name pasa a leerse como nombre de pila (D-02); sin backfill ni split (los clientes que hay son de prueba, quedan en NULL); sin CHECK y por qué (ver «Decisiones de criterio»: name no tiene, professionals.last_name de la 007 tampoco, y el import es un solo batch insert; la normalización vive en lib/client-name.ts); sin policy nueva porque clients ya es RLS por business_id (policies «business member access» y «clients tenant insert») y el GRANT es a nivel tabla, así que la columna lo hereda; no toca la RPC atómica de reserva ni ninguna vista pública (ninguna expone clients); se valida SOLO con supabase db reset local; ⚠ acoplada al deploy: el código nuevo pide y escribe last_name por nombre, así que en staging y prod se aplica A MANO ANTES de deployar, con el NOTIFY. Cuerpo: un solo ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "last_name" text; (nullable, sin default) y al final la línea NOTIFY pgrst, 'reload schema'; (columna nueva → cache de PostgREST, como 061-065).

    2) supabase/schema.sql — espejo quirúrgico (patrón del commit 004a6a2): agregar una línea `"last_name" "text",` en CREATE TABLE "public"."clients", justo después de la línea de "origin" y antes del CONSTRAINT clients_origin_check. Nada más. NO tocar supabase/migrations/00000000000000_baseline.sql.

    3) Aplicar en local: `supabase db reset` desde la raíz del repo (borra los datos locales y re-siembra seed.sql con el negocio test@forjo.local; no levanta navegador ni server de Next, así que no va con el turno). Guardar el log en el scratchpad y confirmar la línea «Applying migration 081_clients_last_name.sql» (si dice Skipping, el nombre está mal). Confirmar la columna con psql dentro del contenedor de la base local (supabase_db_forjo-app): information_schema.columns de public.clients, column_name last_name → data_type text, is_nullable YES.

    4) lib/types.ts (per D-10): en la interfaz Client, `last_name?: string | null` después de name, con comentario: apellido opcional (migr. 081), solo lo carga el panel; la reserva pública no lo pide; para mostrar se usa clientFullName.

    5) Crear lib/client-name.ts (per D-06) — puro, sin imports de servidor (lo usan componentes 'use client' y route handlers), cabecera en español con el por qué (una sola fuente del «Nombre Apellido»; el orden y la letra del índice siguen saliendo de name). Exporta clientFullName(c: { name?: string | null; last_name?: string | null } | null | undefined): string — junta name y last_name recortados, saltea los vacíos, separa con un espacio; null/undefined → ''. Y normalizeLastName(v: unknown): string | null — string con algo tras trim → recortado; cualquier otra cosa → null. Es el mismo molde que el join inline de profesionales en settings-client, centralizado y con trim.

    6) lib/clients-create.ts: ClientCreateInput gana `last_name?: string | null` (opcional: los tests y llamadores existentes no cambian) con comentario; buildClientInsert escribe `last_name: input.last_name ?? null` junto a name. validateClientBody NO cambia (el apellido nunca es obligatorio, D-02).

    7) app/api/clients/create/route.ts (edición parcial): leer `last_name` del body con normalizeLastName (mismo parseo defensivo que el resto) y pasarlo a buildClientInsert. Auth, owner_id, validación y el insert anon+RLS sin tocar. Actualizar el comentario de contrato con una línea sobre el apellido opcional.

    8) app/(dashboard)/clients/clients-client.tsx — SOLO estas ediciones (per D-05/D-06; copy rioplatense sin ¿¡; mismos estilos que los campos vecinos):
       - Importar clientFullName y normalizeLastName de @/lib/client-name.
       - newClientSchema: `last_name: z.string().trim().optional()`.
       - isNewClientDirty: sumar last_name a la cuenta de campos y ajustar el comentario (son siete campos, no seis).
       - onCreateClient: mandar `last_name: data.last_name?.trim() || null`.
       - Alta (L1249-1254): el bloque de Nombre pasa a ser una fila `flex flex-col sm:flex-row gap-2` con dos `flex-1 space-y-2` — la MISMA forma que la fila Teléfono/Email de abajo —: Label «Nombre» + Input id nc-name (como hoy) y Label «Apellido (opcional)» + Input id nc-last-name con registerNew('last_name'). El mensaje de error del nombre queda debajo de la fila. Sin clases de tamaño en los Input (heredan text-base, el candado del zoom de iOS lo exige).
       - ClientDetail: editForm gana last_name (client.last_name || ''); saveClient agrega `last_name: normalizeLastName(editForm.last_name)` a updates (el patch al padre ya lo propaga). En la edición (L1647), el Input del nombre y uno nuevo del apellido van en una fila `flex flex-col sm:flex-row gap-2`, los dos con las mismas clases que hoy tiene el del nombre, placeholder y aria-label «Nombre» / «Apellido».
       - Display con clientFullName: el h2 de la ficha (L1670), el nombre de la fila de la lista (L1083), el nombre en el modal de fusión (L1200), el aviso de fusión exitosa (L834) y el strong de la confirmación de borrado (L1156).
       - Búsqueda (L632): el match por nombre pasa a ser clientFullName(c).toLowerCase().includes(q). El sort de L638, la letra de L644 y las iniciales del avatar (L1075) NO cambian (siguen por name, D-06).
       - Ninguna otra línea cambia. Mobile: los dos campos nuevos van a 16px, no hay layout nuevo más que la fila.

    9) test/client-name.test.ts — suite PURA (no importa test/env): cubrir los ítems de clientFullName / normalizeLastName / búsqueda del behavior, y los dos de buildClientInsert (pura, sin base).

    10) test/manual-client.test.ts — agregar UN caso dentro del describe existente (carril db): «apellido — last_name se persiste; vacío queda null»: buildClientInsert con last_name 'Pérez' insertado por ownerAnon y releído (select last_name) = 'Pérez'; otro con last_name normalizeLastName('   ') = null. Mismo molde que el caso origin=manual. No tocar los casos existentes.
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && supabase db reset > "C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/852caa9d-96c1-4359-9d60-05639393cb6a/scratchpad/db-reset-081.log" 2>&1 && grep -c "Applying migration 081_clients_last_name.sql" "C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/852caa9d-96c1-4359-9d60-05639393cb6a/scratchpad/db-reset-081.log" && COL_081="$(docker exec supabase_db_forjo-app psql -U postgres -tAc "select data_type||','||is_nullable from information_schema.columns where table_schema='public' and table_name='clients' and column_name='last_name'")" && test "$(printf '%s' "$COL_081" | tr -d '[:space:]')" = "text,YES" && npm test -- client-name manual-client panel-input-zoom-ios panel-draft-guard-coverage forms-no-get-leak panel-history-clients panel-nav-chrome && node node_modules/typescript/bin/tsc --noEmit && npm run lint -- lib/client-name.ts lib/clients-create.ts app/api/clients/create/route.ts "app/(dashboard)/clients/clients-client.tsx" && grep -c '"last_name" "text",' supabase/schema.sql && grep -c "NOTIFY pgrst, 'reload schema';" supabase/migrations/081_clients_last_name.sql && grep -c "normalizeLastName(body.last_name)" app/api/clients/create/route.ts && grep -c "registerNew('last_name')" "app/(dashboard)/clients/clients-client.tsx" && test "$(grep -c 'clientFullName(' "app/(dashboard)/clients/clients-client.tsx")" -ge 6 && test "$(grep -v '^\s*//' app/api/clients/create/route.ts lib/client-name.ts | grep -c 'supabase/admin')" -eq 0</automated>
  </verify>
  <done>
    081 aplicada en local (log con Applying + columna text nullable confirmada por psql) y espejada en schema.sql; el alta de /clients tiene «Apellido (opcional)», la ficha lo edita, y lista/ficha/fusión/borrado/búsqueda usan clientFullName per D-05/D-06; test/client-name.test.ts verde y el caso nuevo de manual-client verde contra la base local; candados de /clients verdes; eslint de clients-client.tsx con la misma cuenta que antes; tsc sin salida.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: el resto del panel muestra el nombre completo, y los turnos/abonos nuevos lo guardan en el snapshot</name>
  <files>components/dashboard/nuevo-turno-form.tsx, components/dashboard/nuevo-abono-form.tsx, lib/abono-generation.ts, app/(dashboard)/abonos/page.tsx, app/(dashboard)/abonos/abonos-client.tsx, app/(dashboard)/finances/finances-client.tsx, app/(dashboard)/clinical-history/clinical-history-client.tsx, app/(crm)/admin/negocios/[id]/ver/impersonation-view.tsx, test/abono-generation.test.ts</files>
  <precondition>Task 1 commiteada (lib/client-name.ts existe) y la 081 aplicada en el Supabase local (el select de abono-generation pide last_name por nombre).</precondition>
  <behavior>
    - (carril db) Con el cliente sembrado del test de abonos como name 'Cliente Abono' + last_name 'Pérez', las 5 ocurrencias que genera generateAbonoOccurrences en el caso 1 tienen client_name 'Cliente Abono Pérez'
    - Los demás casos de test/abono-generation.test.ts siguen verdes sin cambios (los ocupantes ajenos conservan su client_name)
  </behavior>
  <action>
    Ediciones mecánicas, cada una de pocas líneas, todas per D-06 salvo donde se indica D-07; importar clientFullName de @/lib/client-name en cada archivo. Antes de editar, correr eslint sobre los 7 archivos de app/ y components/ y anotar la cuenta de problemas de cada uno (finances-client.tsx ya tiene 1 preexistente, react-hooks/set-state-in-effect) para comparar al final. Ninguna otra línea cambia; el alta inline de cliente de estos formularios queda con su campo único (ver «Decisiones de criterio»).

    1) components/dashboard/nuevo-turno-form.tsx: en filteredClients (L381) el match por nombre usa clientFullName(c).toLowerCase(); en pickClient (L405) el name del cliente elegido pasa a ser clientFullName(c) — eso es lo que viaja como clientName y termina en el snapshot appointments.client_name (per D-07); en la lista del combobox (L658) se muestra clientFullName(c). El cliente nuevo inline (id null) NO cambia.

    2) components/dashboard/nuevo-abono-form.tsx: lo mismo en L271 (filtro), L295 (pickClient, per D-07) y L504 (lista).

    3) lib/abono-generation.ts (per D-07): el select del cliente de la serie (L116-121) suma last_name; clientName pasa a ser clientFullName del cliente leído (vacío si no hay cliente, como hoy). El filtro por business_id queda igual. Actualizar el comentario (1) para decir que copia el nombre completo.

    4) app/(dashboard)/abonos/page.tsx L42: el embed pasa de clients(name) a clients(name, last_name). abonos-client.tsx: el tipo de la fila (L48) gana `last_name?: string | null` en clients; los cinco lugares que muestran el nombre del cliente de la serie (L380, L505, L510, L660, L684) usan clientFullName de ese objeto con el mismo texto de respaldo de hoy cuando da vacío ('Cliente', '—', 'este cliente').

    5) app/(dashboard)/finances/finances-client.tsx: búsqueda de cliente de la venta (L368) con clientFullName(c).toLowerCase(); el cliente elegido (L1268), el resultado de búsqueda (L1294) y el cliente vinculado en la lista de ventas (L1157) se muestran con clientFullName. El insert del cliente nuevo de la venta (L602) y su sort NO cambian.

    6) app/(dashboard)/clinical-history/clinical-history-client.tsx: el filtro (L25) matchea con clientFullName; la lista (L74) y el encabezado de la ficha (L100) muestran clientFullName; el sort (L26) y las iniciales (L71) NO cambian.

    7) app/(crm)/admin/negocios/[id]/ver/impersonation-view.tsx L227: el nombre de cada cliente pasa a ser clientFullName armado con str(c, 'name') y str(c, 'last_name') (lib/impersonation.ts ya trae select *, no se toca).

    8) test/abono-generation.test.ts: en el seed del cliente (L52-53) sumar last_name 'Pérez'; en el caso 1 sumar client_name al select de verificación y afirmar que las 5 filas tienen client_name 'Cliente Abono Pérez'. Nada más.
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && npm test -- abono-generation abono-create client-name panel-draft-guard-coverage panel-input-zoom-ios overlay-history panel-tabs service-delete-gate && node node_modules/typescript/bin/tsc --noEmit && npm run lint -- components/dashboard/nuevo-turno-form.tsx components/dashboard/nuevo-abono-form.tsx lib/abono-generation.ts "app/(dashboard)/abonos/page.tsx" "app/(dashboard)/abonos/abonos-client.tsx" "app/(dashboard)/clinical-history/clinical-history-client.tsx" "app/(crm)/admin/negocios/[id]/ver/impersonation-view.tsx" && test "$(grep -c 'name: clientFullName(c)' components/dashboard/nuevo-turno-form.tsx components/dashboard/nuevo-abono-form.tsx | awk -F: '{s+=$2} END {print s}')" -ge 2 && grep -c 'name: clientFullName(c)' components/dashboard/nuevo-turno-form.tsx && grep -c 'name: clientFullName(c)' components/dashboard/nuevo-abono-form.tsx && grep -c "clients(name, last_name)" "app/(dashboard)/abonos/page.tsx" && test "$(grep -c 'clientFullName(' "app/(dashboard)/abonos/abonos-client.tsx")" -ge 5 && test "$(grep -c 'clientFullName(' "app/(dashboard)/finances/finances-client.tsx")" -ge 4 && test "$(grep -c 'clientFullName(' "app/(dashboard)/clinical-history/clinical-history-client.tsx")" -ge 3 && grep -c "clientFullName(" lib/abono-generation.ts && grep -c "clientFullName(" "app/(crm)/admin/negocios/[id]/ver/impersonation-view.tsx" && grep -c "Cliente Abono Pérez" test/abono-generation.test.ts</automated>
  </verify>
  <done>
    Pickers de turno y abono, abonos, finanzas, historia clínica y CRM muestran «Nombre Apellido» per D-06; el snapshot de los turnos que el panel crea para un cliente existente (form y generación de abonos) lleva el nombre completo per D-07, probado contra la base local; eslint de cada archivo sin problemas nuevos frente a la cuenta anotada; tsc sin salida.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: el Excel trae Apellido, Origen queda como columna del sistema y el import deja de exigirla</name>
  <files>lib/clients-import.ts, lib/clients-xlsx.ts, app/api/export/clients/route.ts, app/api/import/clients/confirm/route.ts, app/(dashboard)/clients/clients-client.tsx, test/clients-xlsx.test.ts</files>
  <behavior>
    - Export: títulos en orden Nombre, Apellido, Teléfono, Email, Notas, Obra social, Nro. obra social, Origen; Teléfono y Nro. obra social con numFmt '@'; la celda 9 de la fila 1 sin fill; Nombre..Nro. con fill rojo de marca y Origen con fill FF7F7F7F, los 8 con texto blanco en negrita
    - Export: el encabezado de Origen tiene una nota que contiene «se ignora»; cada celda de datos de Origen tiene dataValidation type 'list' con formulae que contiene reserva, manual e importado; con 0 filas no se rompe
    - Plantilla: hojas Clientes + Instrucciones; Clientes con 7 títulos (sin Origen) y actualRowCount 1; Instrucciones tiene una fila «Apellido», ninguna fila cuya columna sea «Origen», y una fila «Columnas» que explica Nombre + Teléfono o Email
    - Ida y vuelta: José Pérez → name 'José' + last_name 'Pérez' (más el resto de los datos de hoy), `=Ana` sin apellido, O'Brien con apellido `=X` → importables con apellido 'Pérez', null y '=X' (texto literal; una celda `'=X` también queda '=X'); un apellido de solo espacios → null
    - Un Excel con el formato de la quick anterior (7 columnas, Origen 4ª, sin Apellido) entra con validHeader true y apellido null; uno con Origen 'hackeado' entra igual y classifyRows no devuelve ningún campo de origen
    - Header (xlsx y CSV): Nombre + Teléfono → válido; Nombre + Email → válido; solo Nombre → inválido; Teléfono + Email sin Nombre → inválido; canonicalHeader de 'Apellido', 'APELLIDO', ' apellido ' y 'last_name' → 'apellido'; un CSV con header `nombre,last_name,telefono` puebla rows[0].apellido
    - Un export de 2000 filas (con Origen validado) pesa menos de 2 MB y pasa zipDeclaredSizeOk (sigue siendo re-importable)
    - test/clients-import.test.ts pasa SIN modificarlo (el CSV viejo se comporta igual)
  </behavior>
  <action>
    1) lib/clients-import.ts (edición parcial, per D-08/D-13):
       - RawRow gana `apellido?: string`; ImportableRow gana `apellido: string | null`.
       - CANONICAL_HEADER pasa a ser la lista de columnas RECONOCIDAS, en el orden del export nuevo: nombre, apellido, telefono, email, notas, obra_social, nro_obra_social, origen. Comentario: ya no son todas obligatorias.
       - Nueva export isValidImportHeader(fields: Iterable<string>): boolean = contiene 'nombre' Y ('telefono' o 'email'). Comentario con el porqué del set (ver «Decisiones de criterio»: conserva el «header equivocado → no se procesan filas» de la quick anterior sin exigir columnas de puro dato). parseCsv la usa en lugar del every sobre CANONICAL_HEADER; la recuperación del colapso de Excel ES no cambia.
       - canonicalHeader: al final de la normalización, un alias de un solo elemento: 'last_name' → 'apellido' (D-08). Ajustar su comentario (ya no es «sin tabla de alias»: hay uno, el snake_case en inglés del apellido).
       - classifyRows: apellido = normalizeLastName(unescapeFormulaGuard(trim del raw.apellido)) — importar normalizeLastName de @/lib/client-name —, y va en cada ImportableRow. Dedup, validación y numeración de errores sin cambios.
       - Cabecera del módulo: reemplazar «Header RÍGIDO… las 7» por la regla nueva (Nombre + Teléfono o Email; el resto opcional; Origen se ignora siempre; extras se ignoran).

    2) lib/clients-xlsx.ts (per D-08, D-11, D-12, D-13):
       - CLIENTS_XLSX_COLUMNS en el orden nuevo: nombre «Nombre» 28, apellido «Apellido» 24, telefono «Teléfono» 18 text, email «Email» 32, notas «Notas» 40, obra_social «Obra social» 22, nro_obra_social «Nro. obra social» 18 text, origen «Origen» 14 con una marca `informativa: true`. Comentario: Origen solo va en el export, al final, y es informativa.
       - ClientExportRow gana `last_name: string | null`.
       - buildClientsWorkbook: las columnas de la hoja salen de CLIENTS_XLSX_COLUMNS SIN las informativas si es plantilla, y todas si es export; el numFmt '@' se aplica por índice sobre ESA lista; cada fila se agrega como objeto por key (nombre, apellido, …, origen) con textCell, así la plantilla sin Origen no corre las columnas. Después de styleHeaderSheet, SOLO en el export: el encabezado de Origen con fill sólido FF7F7F7F (texto blanco negrita igual que el resto) y la nota «Lo completa el sistema según cómo llegó el cliente: reserva, manual o importado. Es informativa: si volvés a importar este archivo, se ignora.»; y en cada celda de datos de Origen (filas 2 a la última) dataValidation tipo lista, allowBlank, formulae con la lista entre comillas reserva,manual,importado, showErrorMessage, errorTitle «Origen», error «Lo completa el sistema: reserva, manual o importado.». Constante local para el gris con comentario del porqué (señal de columna informativa, no de marca).
       - INSTRUCCIONES: Nombre → «Obligatorio. El apellido va en su propia columna.»; nueva fila Apellido → «Opcional.» después de Nombre; Teléfono, Email, Notas, Obra social y Nro. obra social igual que hoy; la fila Origen se borra; la fila Títulos se reemplaza por Columnas → «Tienen que estar la columna Nombre y al menos una de Teléfono o Email, con esos títulos en la primera fila de la hoja Clientes. Las demás son opcionales. Las columnas que no reconocemos se ignoran, igual que la columna Origen del export: todo lo que importes queda como Importado.»; Repetidos y Límite igual. Copy rioplatense sin ¿¡.
       - parseClientsFile: la validación del header usa isValidImportHeader sobre las claves de colOf (en vez del every); el resto igual. Actualizar los dos comentarios que dicen «las 7 tienen que estar».

    3) app/api/export/clients/route.ts: el select suma last_name (misma query, mismo .eq por business_id, mismo order por name); actualizar la cabecera con una línea sobre Apellido y Origen informativa. Nada más.

    4) app/api/import/clients/confirm/route.ts: en el mapeo a buildClientInsert sumar `last_name: f.apellido`. Nada más (origin='importado' sigue forzado). La preview ya devuelve las importables tal cual, así que no se toca.

    5) app/(dashboard)/clients/clients-client.tsx — SOLO: ImportPreviewRow (L151) gana `apellido?: string | null`; en la tabla y en la lista mobile de la preview (L1401 y L1413) el nombre se muestra con clientFullName armado con nombre y apellido de la fila; el mensaje de invalid_header (L499) pasa a «Al archivo le falta la columna Nombre, o una de Teléfono o Email. Bajá la plantilla y usala como base.». Sigue sin importar ningún módulo de planillas.

    6) test/clients-xlsx.test.ts — actualizar los casos que fijaban el formato viejo (HEADERS de 7 con Origen 4ª, la celda 8 sin fill, «sin la columna Email → false» en parseCsv y «6 columnas (sin Email) → inválido» en xlsx, el helper row() que ahora necesita last_name, el toEqual de la ida y vuelta que ahora lleva apellido) y agregar todos los ítems del behavior. Para la nota y la validación: recargar el buffer y leer cell.note (puede venir como string o como objeto con texts) y cell.dataValidation; si la librería no devuelve la nota al recargar, afirmarla sobre el libro en memoria antes de escribirlo y declararlo en el SUMMARY. Para el «formato de la quick anterior» y el header roto, armar el libro a mano con la librería en el test. Suite sigue PURA. test/clients-import.test.ts NO se toca.

    7) Muestras para revisar a mano (fuera del repo, NO commitear): actualizar el gen-samples.ts del scratchpad para que los clientes de ejemplo traigan last_name (separar los nombres que hoy tienen apellido, dejar uno sin apellido) y regenerar clientes-ejemplo-2026-11-24.xlsx y plantilla-clientes.xlsx en C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/852caa9d-96c1-4359-9d60-05639393cb6a/scratchpad/ (correrlo con el tsx de node_modules/.bin desde la raíz del repo, con el tsconfig del repo para que resuelva @/). La de finanzas puede quedar como está.
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && npm test -- clients-xlsx clients-import client-name panel-nav-chrome panel-history-clients panel-input-zoom-ios forms-no-get-leak && node node_modules/typescript/bin/tsc --noEmit && npm run lint -- lib/clients-import.ts lib/clients-xlsx.ts app/api/export/clients/route.ts app/api/import/clients/confirm/route.ts "app/(dashboard)/clients/clients-client.tsx" && DIFF_IMPORT_TEST="$(git diff --name-only HEAD -- test/clients-import.test.ts)" && test -z "$DIFF_IMPORT_TEST" && LFD_FILES="$(git log --format= --name-only --grep='261124-lfd')" && test "$(printf '%s\n' "$LFD_FILES" | grep -c '^test/clients-import.test.ts$')" -eq 0 && grep -c "isValidImportHeader" lib/clients-import.ts && grep -c "isValidImportHeader" lib/clients-xlsx.ts && grep -c "last_name: f.apellido" app/api/import/clients/confirm/route.ts && grep -c "last_name" app/api/export/clients/route.ts && test "$(grep -cE "exceljs|clients-xlsx|xlsx-style" "app/(dashboard)/clients/clients-client.tsx")" -eq 0 && test "$(grep -v '^\s*//' app/api/export/clients/route.ts app/api/import/clients/confirm/route.ts lib/clients-xlsx.ts | grep -c 'supabase/admin')" -eq 0 && test -f "C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/852caa9d-96c1-4359-9d60-05639393cb6a/scratchpad/plantilla-clientes.xlsx" && npm run build</automated>
    <human-check>UAT del dueño (no bloquea): abrir en Excel clientes-ejemplo-2026-11-24.xlsx y plantilla-clientes.xlsx del scratchpad: Apellido al lado de Nombre; en el export, Origen última, gris, con la nota al pasar el mouse y la lista desplegable; la plantilla sin Origen y con la hoja Instrucciones nueva. Después, en /clients: crear un cliente con y sin apellido, editarle el apellido, buscarlo por apellido, y reimportar el export.</human-check>
  </verify>
  <done>
    El export trae Apellido y Origen informativa (gris + nota + lista) per D-08/D-11; la plantilla no trae Origen per D-12; el import acepta Apellido (y last_name), ignora Origen y valida Nombre + Teléfono o Email per D-13; test/clients-xlsx.test.ts verde con los casos nuevos; test/clients-import.test.ts verde sin tocar; muestras regeneradas en el scratchpad; build ok.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| navegador del dueño → POST /api/clients/create | body JSON no confiable (last_name nuevo) |
| navegador del dueño → update directo de clients (ficha) | cliente anon+RLS; la base es la autoridad del tenant |
| navegador del dueño → /api/import/clients/{preview,confirm} | archivo subido no confiable (columnas Apellido/Origen/extras) |
| datos de la DB → archivo descargado | apellidos de origen no confiable llegan a Excel |
| repo → base de staging/prod | migración aplicada a mano, acoplada al deploy |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-lfd-01 | Information disclosure | clients.last_name (lectura cruzada entre negocios) | critical | mitigate | Sin policy nueva: la columna hereda «business member access» + «clients tenant insert» y el GRANT de tabla; todas las queries tocadas conservan `.eq('business_id', …)`; el caso nuevo de manual-client inserta y relee como el dueño (ownerAnon, RLS); gates negativos contra el cliente de service role en las rutas y módulos tocados |
| T-lfd-02 | Tampering | POST /api/clients/create | medium | mitigate | last_name pasa por normalizeLastName (solo string, recortado, vacío → null); business_id y origin siguen saliendo de la sesión dentro de buildClientInsert (sin cambios) |
| T-lfd-03 | Tampering | celdas de Apellido en el xlsx (formula injection) | high | mitigate | Apellido se escribe con textCell como string (nunca objeto fórmula); el test de ida y vuelta afirma `=X` literal; unescapeFormulaGuard aplicado también al apellido en classifyRows |
| T-lfd-04 | Elevation of privilege | columna Origen / columnas extra del archivo | high | mitigate | Origen nunca llega al insert (classifyRows no la devuelve; buildClientInsert fuerza origin='importado'); test con Origen 'hackeado'; confirm re-parsea el archivo |
| T-lfd-05 | Tampering | header más permisivo (Nombre + Teléfono o Email) | low | accept | Un archivo ajeno con esas columnas pasa el header, pero nada se escribe sin la preview + confirm del dueño, cada fila se valida y se deduplica, y solo puede afectar a su propio negocio |
| T-lfd-06 | Denial of service | deploy del código antes que la 081 | high | mitigate | El código pide/escribe last_name por nombre (PGRST204/42703 sin la columna: export vacío, abonos sin lista, alta e import fallando). Cabecera de la 081 con ⚠ de orden + SUMMARY con el paso manual «aplicar 081 + NOTIFY en staging y prod ANTES del deploy»; este quick no pushea |
| T-lfd-07 | Tampering | superficie pública (reserva por slug y RPC atómica) | high | mitigate | D-04: ningún commit del quick toca esos archivos — gate de git en <verification>; el panel sigue pasando el nombre como string al core existente |
| T-lfd-08 | Information disclosure | bundle del navegador | low | mitigate | lib/client-name.ts es puro y sin imports de servidor; clients-client.tsx sigue sin importar módulos de planillas (gate de grep) |
| T-lfd-09 | Denial of service | export de 2000 filas con validación por celda | low | mitigate | Test: el export de 2000 filas pesa < 2 MB y pasa zipDeclaredSizeOk (sigue re-importable bajo el tope de subida) |
</threat_model>

<verification>
- `npm test` completo (carriles pure + db, con la 081 ya aplicada en local). Mirar el reloj: 2 canarios fallan A PROPÓSITO fuera de [01:00, 23:30] hora AR; declararlo en el SUMMARY si pasa.
- `node node_modules/typescript/bin/tsc --noEmit` sin salida (NO `npx tsc`: en esta máquina sale 0 aunque haya errores).
- `npm run lint` sobre los archivos tocados: módulos nuevos y rutas limpios; las pantallas sin problemas nuevos frente a la cuenta anotada antes de editarlas.
- `npm run build` ok (no levanta navegador: no va con el turno).
- Reserva pública intacta (D-04): `LFD_FILES="$(git log --format= --name-only --grep='261124-lfd')" && test "$(printf '%s\n' "$LFD_FILES" | grep -cE '^app/\[slug\]|^app/api/booking|book_slot_atomic')" -eq 0` (capturar primero la salida de git, así un git roto no se lee como limpio).
- Base: el log de `supabase db reset` con «Applying migration 081_clients_last_name.sql» y la columna confirmada por psql. NO se corre nada contra staging ni prod.
- No hacen falta pruebas de navegador; si alguna se corriera, va con `node scripts/con-turno.mjs`. El SUMMARY dice explícitamente que los .xlsx NO se abrieron en Excel y que las pantallas no se probaron en un navegador.
</verification>

<success_criteria>
- Los 8 truths de must_haves comprobados por tests (client-name, manual-client, abono-generation, clients-xlsx) o por los gates de cada task.
- test/clients-import.test.ts sin modificar y verde.
- Candados estáticos verdes: panel-nav-chrome, panel-history-clients, panel-input-zoom-ios, panel-draft-guard-coverage, forms-no-get-leak, overlay-history, panel-tabs, service-delete-gate.
- Commits atómicos por task con `261124-lfd` en el mensaje; nada se pushea; la 081 NO se aplica fuera del Supabase local.
</success_criteria>

<output>
Crear `.planning/workstreams/panel-nav/quick/261124-lfd-apellido-opcional-del-cliente-solo-panel/261124-lfd-SUMMARY.md` al terminar (requirements-completed: []). Tiene que incluir:
- Un bloque «⚠ Antes del deploy» con el paso manual de Franco: aplicar `supabase/migrations/081_clients_last_name.sql` en staging y en prod desde el SQL Editor (trae el `NOTIFY pgrst, 'reload schema';`), confirmar con `select column_name from information_schema.columns where table_name='clients' and column_name='last_name'`, y recién después deployar. Sin eso el alta, el import, el export y la lista de abonos fallan. schema.sql ya queda espejado.
- El log de `supabase db reset` (la línea Applying de la 081) y la salida del psql.
- La cuenta de eslint antes/después de cada pantalla tocada.
- La regla nueva del header del import (Nombre + Teléfono o Email) con su porqué, y la tabla de superficies incluidas/excluidas.
- Las rutas completas de las muestras regeneradas en el scratchpad y el aviso de que el formato en Excel y las pantallas quedan para la UAT del dueño.
</output>
