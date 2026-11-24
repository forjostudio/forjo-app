---
phase: quick-261124-ine
plan: "01"
type: execute
wave: 1
depends_on: []
quick_id: 261124-ine
files_modified:
  - package.json
  - package-lock.json
  - lib/xlsx-style.ts
  - lib/clients-xlsx.ts
  - lib/clients-import.ts
  - lib/finances-xlsx.ts
  - app/api/export/clients/route.ts
  - app/api/export/finances/route.ts
  - app/api/import/clients/preview/route.ts
  - app/api/import/clients/confirm/route.ts
  - app/(dashboard)/clients/clients-client.tsx
  - app/(dashboard)/finances/finances-client.tsx
  - test/clients-xlsx.test.ts
  - test/finances-xlsx.test.ts
autonomous: true
# DATA-01 (export clientes), DATA-02 (export finanzas) y DATA-03 (import clientes) son los requisitos dueños de
# estas pantallas. Se LISTAN, no se marcan: ya están Complete; este quick les cambia el formato (CSV -> Excel).
# El SUMMARY lleva requirements-completed: [].
requirements: [DATA-01, DATA-02, DATA-03]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Exportar clientes (el mismo <a href=\"/api/export/clients\" download> del header) baja `clientes-{slug}-{fecha}.xlsx` con la hoja `Clientes`: encabezados Nombre · Teléfono · Email · Origen · Notas · Obra social · Nro. obra social en fondo rojo Forjo #D94A2B con texto blanco en negrita, fila 1 congelada, autofiltro sobre los datos y anchos de columna fijos; todo texto va como celda de TEXTO (un nombre `=Ana` no es una fórmula y no lleva prefijo `'`)"
    - "El modal de importar tiene «Descargar plantilla» → `plantilla-clientes.xlsx`: la MISMA hoja `Clientes` con 0 filas de datos + una hoja `Instrucciones` con las reglas reales de validateClientBody; la ruta exige sesión igual que el export (401 sin usuario, 404 sin negocio) y no lee ningún cliente"
    - "Importar acepta .xlsx y .csv: el Excel exportado (o la plantilla completada) vuelve a entrar sin pérdida (acentos, `=...` literal, `O'Brien`, teléfonos guardados como texto con su cero inicial) y los CSV viejos (prefijo `'` anti-fórmula, colapso a una columna de Excel ES, `sep=`, BOM) siguen funcionando exactamente igual; el parser lo decide el CONTENIDO (firma ZIP `PK\\x03\\x04`), la extensión es solo lista permitida"
    - "Los encabezados se reconocen legibles, snake_case, en mayúsculas y con o sin acento/punto (`Teléfono`/`telefono`/`TELÉFONO`, `Nro. obra social`/`nro_obra_social`), en CSV y en Excel; el header sigue RÍGIDO: falta una de las 7 columnas → `invalid_header`, columnas extra se ignoran"
    - "Un archivo hostil se corta antes de gastar memoria: >2 MB → `file_too_large` (413), ZIP ilegible o con tamaño descomprimido DECLARADO > 30 MB o > 500 entradas → `unreadable_file` (400, chequeado ANTES de cargarlo), > 2000 filas → `too_many_rows` (400, contado antes de recorrer filas); ninguna fórmula se evalúa (solo se lee su `result` cacheado)"
    - "Exportar finanzas baja `finanzas-{slug}-{fecha}.xlsx` con las hojas Resumen · Turnos · Ventas · Egresos en ese orden: Resumen con Turnos/Ventas/Egresos (cantidad + monto), Ingresos = turnos + ventas y Saldo = ingresos − egresos como VALORES calculados; fechas como fecha real `dd/mm/yyyy` que muestran el MISMO día que la DB (construidas en UTC); montos numéricos con formato `\"$\" #,##0.00`; cada hoja ordenada por fecha descendente"
    - "Aislamiento intacto en las 4 rutas: cliente anon+RLS de @/lib/supabase/server, negocio por owner_id de la sesión, `.eq('business_id', business.id)` en cada query, cero service role; el paquete de Excel nunca entra al bundle del cliente (ningún componente 'use client' importa los módulos nuevos)"
  artifacts:
    - path: lib/xlsx-style.ts
      provides: "constantes y helpers compartidos: XLSX_CONTENT_TYPE, BRAND_ARGB='FFD94A2B', DATE_FMT, ARS_FMT, styleHeaderSheet(ws, { autoFilter }), ymdToUtcDate(s), workbookToBytes(wb)"
    - path: lib/clients-xlsx.ts
      provides: "CLIENTS_XLSX_COLUMNS, buildClientsWorkbook(rows, { plantilla }), IMPORT_MAX_ROWS, cellText(v), zipDeclaredSizeOk(bytes, limits), detectImportFormat({ name, bytes }), parseClientsFile({ name, bytes, maxRows })"
    - path: lib/clients-import.ts
      provides: "canonicalHeader(h) exportada y usada como transformHeader de parseCsv; CANONICAL_HEADER exportada; classifyRows sin cambios de comportamiento"
    - path: lib/finances-xlsx.ts
      provides: "TurnoRow/VentaRow/EgresoRow, financesSummary(input), buildFinancesWorkbook(input)"
    - path: test/clients-xlsx.test.ts
      provides: "suite PURA (sin hasSupabaseCreds): formato del libro, fórmula-como-texto, plantilla, normalización de headers, ida y vuelta, tipos de celda, detección de formato, límites"
    - path: test/finances-xlsx.test.ts
      provides: "suite PURA: orden de hojas, totales del Resumen, fecha UTC sin corrimiento, formatos numéricos, orden desc"
  key_links:
    - from: "app/api/export/clients/route.ts (GET, ?plantilla=1)"
      to: "buildClientsWorkbook → workbookToBytes → new Response(bytes, XLSX_CONTENT_TYPE)"
      via: "mismo gate de sesión/tenant que hoy; con plantilla no hay query a clients"
    - from: "app/api/import/clients/{preview,confirm}/route.ts"
      to: "parseClientsFile (firma ZIP → xlsx | extensión .csv → parseCsv) → classifyRows (intacto)"
      via: "await file.arrayBuffer() DESPUÉS del guard de 2 MB; los códigos de error mapean a 400"
    - from: "canonicalHeader (lib/clients-import.ts)"
      to: "transformHeader de parseCsv Y la fila 1 de la hoja en parseClientsFile"
      via: "una sola normalización: trim, sin comillas sueltas, minúsculas, sin acentos, sin puntos, espacios → _"
    - from: "botón «Descargar plantilla» del modal (clients-client.tsx)"
      to: "/api/export/clients?plantilla=1"
      via: "<a href download> con buttonVariants({ variant: 'outline' })"
    - from: "app/api/export/finances/route.ts"
      to: "buildFinancesWorkbook({ turnos, ventas, egresos })"
      via: "las MISMAS tres queries de hoy (snapshot de servicio vía apptServiceName/apptServicePrice), mapeadas a filas tipadas"
---

<objective>
El export/import del panel pasa de CSV a Excel (.xlsx) con formato, usando la librería de planillas fijada en 4.4.0
(dependencia nueva YA aprobada por el dueño; es la misma versión y el mismo patrón que usa ../facturador-ARCA para
importar productos).

- Clientes: export y plantilla salen del MISMO builder; el import acepta .xlsx y sigue aceptando los .csv de antes.
- Finanzas: un libro con Resumen + una hoja por tipo de movimiento.

Purpose: el dueño (y su contador) abren el archivo en Excel y lo ven prolijo — encabezados de marca, fechas y montos
de verdad — en vez de un CSV que en Excel-AR se abre colapsado en una columna. El import deja de depender de que el
dueño no "rompa" el CSV al guardarlo.

Output: 3 módulos puros en lib/ (testeables sin server), 4 rutas actualizadas, ediciones mínimas en 2 pantallas,
2 suites de vitest nuevas (carril `pure`).
</objective>

## Cobertura de fuentes (auditoría)

| Fuente | Ítem | Dónde |
|--------|------|-------|
| GOAL | Export/import de clientes y finanzas pasa a .xlsx con formato | Tasks 1-3 |
| D-01 | Import acepta .xlsx Y .csv; CSV viejo idéntico (prefijo `'`, colapso de Excel); formato por contenido, no por extensión | Task 2 |
| D-02 | Header de marca, negrita blanca, congelado, autofiltro, anchos; fechas reales UTC dd/mm/yyyy; montos ARS; Resumen + Turnos/Ventas/Egresos; orden desc | Task 1 (estilo + clientes), Task 3 (finanzas) |
| D-03 | Plantilla = mismo libro con 0 filas + hoja Instrucciones; un solo builder; botón «Descargar plantilla»; con auth | Task 1 (builder + ruta), Task 2 (botón) |
| D-04 | Headers legibles; el import reconoce legibles y snake_case normalizados; header rígido (7 obligatorias, extras ignoradas) | Task 1 (canonicalHeader + CSV), Task 2 (xlsx) |
| Restricción | anon+RLS, owner_id, `.eq('business_id')`, sin service role; runtime nodejs | Tasks 1-3 |
| Restricción | Texto como celda string (sin fórmulas) + test; lectura robusta de celdas; unescapeFormulaGuard también en xlsx | Task 1 (export), Task 2 (import) |
| Restricción | 2 MB, cap de filas, solo la hoja Clientes/primera no-Instrucciones, zip-bomb | Task 2 |
| Restricción | Códigos snake_case, Content-Type xlsx, nombres de archivo | Tasks 1-3 |
| Restricción | UI mínima, copy rioplatense sin ¿¡, comentarios "por qué" actualizados | Tasks 2-3 |
| Restricción | `npm install exceljs@4.4.0 --save-exact`; papaparse se queda | Task 1 |
| Restricción | Tests vitest node (ida y vuelta, plantilla, headers, tipos de celda, detección, finanzas) | Tasks 1-3 |

Decisiones de criterio propio (discreción del planner, documentadas):
- **Cap de filas = 2000, no 5000**: ya es el límite vigente (T-03-06) y el confirm hace UN batch insert "≤2000 filas"; subirlo afloja un límite de seguridad sin pedido. Pasa a una sola fuente (`IMPORT_MAX_ROWS` en lib/clients-xlsx.ts).
- **Header sigue rígido** (las 7 columnas, `Origen` incluida aunque se ignore): la plantilla y el export ya la traen, así que hacerla opcional no le ahorra nada al dueño y abre un segundo contrato.
- **Pre-chequeo del ZIP**: el cap de filas solo actúa DESPUÉS de que la librería descomprimió todo en memoria; por eso se suma el tamaño descomprimido DECLARADO del directorio central antes de cargar. Residuo aceptado (ver threat model): un ZIP con tamaños falsificados solo se detecta al terminar de descomprimir.
- **Plantilla vía `GET /api/export/clients?plantilla=1`** (misma ruta, mismo gate) en vez de una ruta nueva: un solo lugar para la autenticación.
- **La hoja Instrucciones va SOLO en la plantilla**; el export de datos lleva solo `Clientes`.
- Se agrega `Cache-Control: no-store` a las respuestas xlsx (datos personales; costo cero).

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/workstreams/panel-nav/STATE.md
@AGENTS.md
@.claude/skills/convenciones-forjo/SKILL.md
@.claude/skills/supabase-multitenant-rls/SKILL.md

# Código actual (leer COMPLETO antes de tocar)
@lib/clients-import.ts
@app/api/export/clients/route.ts
@app/api/export/finances/route.ts
@app/api/import/clients/preview/route.ts
@app/api/import/clients/confirm/route.ts
@test/clients-import.test.ts
@lib/clients-create.ts

# Regiones de las pantallas (leer SOLO estos rangos)
# app/(dashboard)/clients/clients-client.tsx: L32 (import de Button), L166 (IMPORT_MAX_BYTES), L462-514 (selección de
#   archivo + preview), L912-939 (iconos Exportar/Importar del header), L1285-1345 (etapa upload del modal), ~L1365
#   (texto del estado vacío de la preview)
# app/(dashboard)/finances/finances-client.tsx: L839-869 (botón Exportar)

# Patrón probado de la librería (repo hermano, misma versión 4.4.0): leer L66-117
# ../facturador-ARCA/servicio/panel/importar.ts  → celda(v) (richText/result/text), filasDeExcel (load + worksheets[0]
#   + actualRowCount), plantillaDeProductos (columns + writeBuffer)
# ../facturador-ARCA/app/panel/[comercio]/productos/plantilla/route.ts L21 → new Response(new Uint8Array(buffer), …)

# Next 16: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md
#   (`export const runtime = 'nodejs'` es válido en route.ts; 'nodejs' es el default — se declara para documentar
#   que la librería necesita Node)
# Marca: app/globals.css L154 `--primary: #d94a2b` (Rojo Forjo) → ARGB 'FFD94A2B'
# Candado estático que NO hay que romper: test/panel-nav-chrome.test.ts L836-873 (el header de /clients conserva
#   `href="/api/export/clients"` seguido de `download`, 3 × ACCION_ICONO, ≥3 aria-label, un solo `w-full`)
</context>

## Auditoría de legitimidad del paquete

| Paquete | Versión | Fuente | Integridad | Estado |
|---------|---------|--------|-----------|--------|
| exceljs | 4.4.0 (exacta) | registry.npmjs.org, repo github.com/exceljs/exceljs, MIT | `sha512-XctvKaEMaj1Ii9oDOqbW/6e1gXknSY4g/aLCDicOXqBE4M0nRWkUu0PTp++UPNzoFY12BNHMfs/VadKIS6llvg==` — idéntica en `npm view` (2026-11-24) y en `../facturador-ARCA/package-lock.json` | [VERIFIED] — aprobado por el dueño; sin checkpoint |

<!-- planner-discipline-allow: exceljs -->
<!-- planner-discipline-allow: clients-xlsx -->
<!-- planner-discipline-allow: finances-xlsx -->
<!-- planner-discipline-allow: xlsx-style -->

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): el export de clientes sale en Excel con formato, y la plantilla del mismo builder</name>
  <files>package.json, package-lock.json, lib/xlsx-style.ts, lib/clients-xlsx.ts, lib/clients-import.ts, app/api/export/clients/route.ts, test/clients-xlsx.test.ts</files>
  <behavior>
    - buildClientsWorkbook(filas) → una hoja `Clientes`; fila 1 = Nombre, Teléfono, Email, Origen, Notas, Obra social, Nro. obra social (en ese orden)
    - cada celda de la fila 1: fill sólido argb FFD94A2B, font bold con color FFFFFFFF; ws.views[0] = frozen con ySplit 1; ws.autoFilter definido; todas las columnas con width > 0; Teléfono y Nro. obra social con numFmt '@'
    - un nombre `=Ana` y unas notas `=HYPERLINK("http://x")`, recargados desde el buffer, son celdas ValueType.String, sin `.formula`, y el valor es literal (sin `'` delante); ninguna celda de la hoja es ValueType.Formula
    - null/'' en una columna → celda sin valor (no la cadena "null")
    - buildClientsWorkbook([], { plantilla: true }) → hojas ['Clientes', 'Instrucciones'] en ese orden; `Clientes` tiene solo la fila de encabezados (actualRowCount 1) y el mismo estilo
    - canonicalHeader: 'Teléfono', 'TELÉFONO', ' telefono ', 'telefono' → 'telefono'; 'Nro. obra social' y 'nro_obra_social' → 'nro_obra_social'; 'Obra social' → 'obra_social'; 'Email' → 'email'
    - parseCsv con la línea de headers legibles (`Nombre,Teléfono,Email,Origen,Notas,Obra social,Nro. obra social`) → validHeader true y rows[0].telefono poblado; sin la columna Email → validHeader false
    - las suites existentes de parseCsv/classifyRows (test/clients-import.test.ts) siguen verdes sin tocarlas
  </behavior>
  <action>
    1) Dependencia (Restricción de instalación): correr `npm install exceljs@4.4.0 --save-exact`. Confirmar que package.json quedó con `"exceljs": "4.4.0"` (sin ^) y que la entrada `node_modules/exceljs` de package-lock.json tiene exactamente la integridad de la tabla de legitimidad. NO correr `npm audit fix`; sí anotar en el SUMMARY lo que diga `npm audit --omit=dev` sobre el subárbol de exceljs. papaparse se queda (el CSV sigue soportado).

    2) Crear lib/xlsx-style.ts (módulo puro, server-only por uso; cabecera de comentario en español con el por qué). Importa la librería con import default (`import ExcelJS from …`, igual que facturador-ARCA; tsconfig tiene esModuleInterop). Exporta:
       - XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'.
       - BRAND_ARGB = 'FFD94A2B' (Rojo Forjo, app/globals.css --primary) y WHITE_ARGB = 'FFFFFFFF' (per D-02).
       - DATE_FMT = 'dd/mm/yyyy' y ARS_FMT = '"$" #,##0.00;[Red]-"$" #,##0.00' (per D-02).
       - styleHeaderSheet(ws, { autoFilter: boolean }): pinta CELDA POR CELDA la fila 1 (no el estilo de la fila entera: eso pintaría las 16384 columnas en Excel) con fill pattern solid fgColor BRAND_ARGB, font bold color WHITE_ARGB, alineación vertical middle; ws.views = [{ state: 'frozen', ySplit: 1 }]; si autoFilter, ws.autoFilter desde la fila 1 col 1 hasta la última fila con datos (mínimo la 1) y la última columna. Se llama DESPUÉS de cargar las filas.
       - ymdToUtcDate(s: string): Date | null — solo acepta /^\d{4}-\d{2}-\d{2}$/; devuelve new Date(Date.UTC(y, m-1, d)) (la librería convierte a serial de Excel con milisegundos UTC, así que medianoche UTC = el mismo día en cualquier zona; nunca new Date('YYYY-MM-DD') local). Cualquier otra cosa → null.
       - workbookToBytes(wb): Promise<Uint8Array> = new Uint8Array(await wb.xlsx.writeBuffer()) (mismo molde que facturador-ARCA; sirve directo como body de Response).

    3) lib/clients-import.ts (edición PARCIAL, per D-04): exportar CANONICAL_HEADER y reemplazar normHeader por una función exportada canonicalHeader(h) que: trim → quita comillas sueltas al principio/fin (lo que ya hacía) → trim → normalize('NFD') y borra marcas diacríticas → minúsculas → borra los puntos → trim → colapsa espacios/guiones bajos repetidos a un solo '_'. Así 'Nro. obra social' → 'nro_obra_social' sin tabla de alias. Usarla como transformHeader en las DOS llamadas a Papa.parse con header:true. La recuperación del colapso a una columna NO cambia (re-parsea desde el texto crudo). classifyRows, unescapeFormulaGuard y RawRow quedan idénticos. Actualizar los comentarios que ahora mienten: el de "NO habilita mapeo flexible (v2)" pasa a explicar que la normalización reconoce los headers legibles del Excel (D-04) pero el header sigue RÍGIDO (las 7 obligatorias, extras ignoradas); la cabecera del módulo menciona que ahora también lo consume el import de Excel.

    4) Crear lib/clients-xlsx.ts (en este task SOLO la parte de export; el parser lo agrega el Task 2). Cabecera de comentario en español: por qué el xlsx ya no lleva el prefijo `'` (una cadena se escribe como celda de texto; Excel no la evalúa — test lo prueba), por qué Teléfono/Nro. van en formato texto '@' (que el cero inicial que el dueño tipea en la plantilla no se pierda), y que este módulo es SOLO de servidor (nunca importarlo desde un componente cliente). Exporta:
       - CLIENTS_XLSX_COLUMNS: arreglo en el orden canónico de { key (el canónico: nombre, telefono, …), header (Nombre, Teléfono, Email, Origen, Notas, Obra social, Nro. obra social — per D-04), width (28, 18, 32, 14, 40, 22, 18), text?: true en telefono y nro_obra_social }.
       - ClientExportRow = { name, phone, email, origin, notes, insurance_name, insurance_number }, todos string | null (la fila tal cual la select de la ruta).
       - CLIENTS_SHEET = 'Clientes', INSTRUCTIONS_SHEET = 'Instrucciones'.
       - buildClientsWorkbook(rows: ClientExportRow[], opts?: { plantilla?: boolean }): ExcelJS.Workbook — UN SOLO builder para export y plantilla (per D-03). Hoja Clientes: ws.columns desde CLIENTS_XLSX_COLUMNS (header + key + width); numFmt '@' en las columnas text ANTES de estilar la fila 1; una fila por cliente con cada valor como string, y null/'' → sin valor; nunca un objeto { formula }. Después styleHeaderSheet(ws, { autoFilter: true }). Si plantilla: rows se ignora (0 filas de datos) y se agrega la hoja Instrucciones (columnas «Columna» ancho 18 y «Qué poner» ancho 90, styleHeaderSheet sin autofiltro) con una fila por columna, en copy rioplatense sin ¿¡ y fiel a validateClientBody/classifyRows: Nombre = obligatorio; Teléfono = teléfono o email, al menos uno de los dos; solo números, espacios y + ( ) -; Email = formato nombre@dominio.com; Origen = se ignora al importar, todos quedan como Importado; Notas = opcional, se guardan hasta 1000 caracteres; Obra social / Nro. obra social = opcionales, solo se guardan si el negocio es del rubro salud. Más dos filas generales: no cambies ni borres los títulos de la primera fila de la hoja Clientes; las filas con el mismo email o teléfono que alguien que ya tenés (o repetidas en el archivo) se saltean; máximo 2000 filas por archivo.

    5) app/api/export/clients/route.ts (edición parcial; el gate de sesión/tenant queda IDÉNTICO): agregar `export const runtime = 'nodejs'` con una línea de por qué; la firma pasa a GET(request: Request) y lee `plantilla` del querystring (=== '1'). Auth gate y negocio por owner_id SIN cambios (sin usuario → 401, sin negocio → 404) — también para la plantilla (per D-03). Con plantilla: NO consultar clients; responder buildClientsWorkbook([], { plantilla: true }) con filename `plantilla-clientes.xlsx`. Sin plantilla: la MISMA query de hoy (select acotado + .eq('business_id', business.id) + order name) → buildClientsWorkbook(clients ?? []) → workbookToBytes → new Response(bytes, { headers: Content-Type XLSX_CONTENT_TYPE, Content-Disposition attachment filename `clientes-${business.slug}-${fecha}.xlsx`, Cache-Control no-store }). Borrar esc(), el arreglo de headers, el join CSV y el prefijo de BOM. Reescribir la cabecera de comentario: lo que sigue igual (anon+RLS, owner_id, todas las filas) y lo que cambió (xlsx, celdas de texto en vez del prefijo anti-fórmula, headers legibles reconocidos por el import, plantilla por ?plantilla=1). Nunca el cliente de service role.

    6) Crear test/clients-xlsx.test.ts — suite PURA: NO importar hasSupabaseCreds ni nada de test/env (si no, el clasificador la manda al carril db). Para leer el resultado, recargar con la librería: new ExcelJS.Workbook() + wb.xlsx.load(bytes) (si el tipo de load se queja de Uint8Array, pasarle bytes.buffer recortado con slice(byteOffset, byteOffset + byteLength), como ArrayBuffer — sin `as any`). Cubrir todos los ítems de <behavior> de este task, incluido el de parseCsv con headers legibles.
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && npm test -- clients-xlsx clients-import && node node_modules/typescript/bin/tsc --noEmit && grep -c '"exceljs": "4.4.0"' package.json && grep -A4 '"node_modules/exceljs"' package-lock.json | grep -c 'sha512-XctvKaEMaj1Ii9oDOqbW/6e1gXknSY4g/aLCDicOXqBE4M0nRWkUu0PTp++UPNzoFY12BNHMfs/VadKIS6llvg==' && test "$(grep -v '^\s*//' app/api/export/clients/route.ts | grep -c 'uFEFF')" -eq 0 && test "$(grep -v '^\s*//' app/api/export/clients/route.ts lib/clients-xlsx.ts lib/xlsx-style.ts | grep -c 'supabase/admin')" -eq 0 && grep -c "spreadsheetml" lib/xlsx-style.ts</automated>
  </verify>
  <done>
    exceljs fijado en 4.4.0 exacto con la integridad verificada; el icono Exportar del header (sin tocar) baja un .xlsx con la hoja Clientes formateada per D-02/D-04; `?plantilla=1` baja la plantilla con Instrucciones per D-03 detrás del mismo gate; parseCsv reconoce headers legibles; test/clients-xlsx.test.ts verde con todos los casos del behavior; test/clients-import.test.ts verde sin cambios; tsc sin salida.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: el import acepta el Excel (y sigue aceptando el CSV viejo), con plantilla en el modal</name>
  <files>lib/clients-xlsx.ts, app/api/import/clients/preview/route.ts, app/api/import/clients/confirm/route.ts, app/(dashboard)/clients/clients-client.tsx, test/clients-xlsx.test.ts</files>
  <behavior>
    - Ida y vuelta: buildClientsWorkbook con [José Pérez / +54 11 2233-4455 / jose@test.com / notas `=HYPERLINK("http://x")` / OSDE / 123], [`=Ana` / sin teléfono / ana@test.com], [O'Brien / `0348 15 1234` / sin email] → parseClientsFile({ name: 'clientes.xlsx', … }) → ok, validHeader, 3 filas → classifyRows → 3 importables con los MISMOS datos: `=Ana` sin `'`, notas literales, O'Brien intacto, `0348 15 1234` con su cero
    - La plantilla (buildClientsWorkbook([], { plantilla: true })) parsea con ok, validHeader true y 0 filas (la hoja Instrucciones no se lee como datos)
    - Un libro armado a mano con headers en MAYÚSCULAS con acento ('NOMBRE', 'TELÉFONO', …, 'NRO. OBRA SOCIAL') → validHeader true; con headers snake_case → true; con 6 columnas (sin Email) → validHeader false
    - Tipos de celda: teléfono número 1122334455 → '1122334455'; 5491122334455 → '5491122334455' (sin exponente); email { text: 'ana@test.com', hyperlink: 'mailto:ana@test.com' } → 'ana@test.com'; nombre richText [Ana , María] → 'Ana María'; notas { formula: '1+1', result: 2 } → '2'; fórmula sin result → ''; { error: '#N/A' } → ''
    - Una celda de texto `'=Ana` en el xlsx → classifyRows la deja en `=Ana` (unescapeFormulaGuard también aplica al xlsx)
    - Hoja: con Instrucciones PRIMERO y Clientes segunda → lee Clientes; con una sola hoja llamada 'Hoja1' → la lee; una fila con solo espacios en el medio → se saltea
    - Detección: ('x.csv', bytes CSV con BOM) → camino CSV con filas; el fixture del colapso de Excel de test/clients-import.test.ts pasado por parseClientsFile → validHeader true; ('x.xlsx', bytes CSV) → invalid_file_type; ('x.txt', bytes xlsx) → invalid_file_type; ('x.csv', bytes xlsx) → se parsea como xlsx (manda el contenido); ('X.XLSX', bytes xlsx) → ok; ('x.xlsx', 'PK\x03\x04' + basura) → unreadable_file
    - Límites: maxRows 2 con 3 filas de datos → too_many_rows; zipDeclaredSizeOk(libro real) → true; zipDeclaredSizeOk(export de 2000 filas) → true; el mismo buffer con el tamaño descomprimido de la PRIMERA entrada del directorio central parcheado a 0x7FFFFFF0 → false, y parseClientsFile sobre él → unreadable_file; un buffer sin registro de fin de directorio → false
  </behavior>
  <action>
    1) lib/clients-xlsx.ts — agregar la parte de import (per D-01, D-04 y las restricciones de lectura robusta y zip-bomb), con comentarios en español del por qué:
       - IMPORT_MAX_ROWS = 2000 (UNA fuente para los dos handlers; mismo valor que el T-03-06 vigente — ver decisiones del plan), XLSX_MAX_UNZIPPED_BYTES = 30 MB, XLSX_MAX_ENTRIES = 500.
       - cellText(v: ExcelJS.CellValue): string. null/undefined → ''; string → tal cual; number → entero seguro con String(v), entero fuera del rango seguro con BigInt(v).toString() (nunca exponente), no entero con String(v); boolean → String(v); Date → toISOString().slice(0, 10); objeto: si tiene richText → concatenar los .text; si tiene text (hipervínculo) → cellText(v.text) recursivo (el text puede ser a su vez richText); si tiene result (fórmula o fórmula compartida) → cellText(result) — se lee SOLO el resultado cacheado, ninguna fórmula se evalúa; si tiene error → ''; cualquier otra cosa → ''. Mismo espíritu que celda() de facturador-ARCA, pero devolviendo siempre string.
       - zipDeclaredSizeOk(bytes: ArrayBuffer, limits = { maxUnzippedBytes, maxEntries }): boolean, con DataView little-endian. Buscar hacia atrás, en los últimos 65557 bytes, la firma de fin de directorio central 0x06054b50; leer cantidad de entradas (uint16 en +10), tamaño (uint32 en +12) y offset (uint32 en +16) del directorio. false si: no hay firma; cantidad 0xFFFF u offset/tamaño 0xFFFFFFFF (ZIP64); cantidad > maxEntries; el directorio cae fuera del buffer. Recorrer las entradas: cada una tiene que empezar con 0x02014b50 (si no → false); sumar el tamaño descomprimido (uint32 en +24; 0xFFFFFFFF → false); avanzar 46 + largo de nombre (+28) + extra (+30) + comentario (+32). false si la suma supera maxUnzippedBytes. Comentar el residuo: los tamaños declarados se pueden falsificar y la librería recién lo detecta al terminar de descomprimir; esto frena el ZIP-bomba común (tamaños honestos) sin costo.
       - detectImportFormat({ name, bytes }): 'xlsx' | 'csv' | null. La extensión (en minúsculas) es SOLO lista permitida: si no termina en .xlsx ni .csv → null. Después manda el CONTENIDO: si los 4 primeros bytes son 50 4B 03 04 → 'xlsx' (aunque se llame .csv); si no son ZIP y la extensión es .csv → 'csv'; si no son ZIP y la extensión es .xlsx → null (per D-01: el server no confía en la extensión).
       - ParseFileResult = { ok: true; validHeader: boolean; rows: RawRow[] } | { ok: false; error: 'invalid_file_type' | 'unreadable_file' | 'too_many_rows' }.
       - parseClientsFile({ name, bytes, maxRows }): Promise<ParseFileResult>. null → invalid_file_type. 'csv' → new TextDecoder('utf-8').decode(bytes) → parseCsv (que ya saca BOM, `sep=` y recupera el colapso — CSV viejo idéntico) → { ok: true, … }. 'xlsx' → zipDeclaredSizeOk falso → unreadable_file; cargar con new ExcelJS.Workbook() + xlsx.load dentro de try/catch → si tira, unreadable_file; elegir la hoja: la que con canonicalHeader del nombre da 'clientes', si no la primera cuyo nombre NO da 'instrucciones'; sin hoja → unreadable_file; si actualRowCount > maxRows + 1 → too_many_rows ANTES de recorrer filas; fila 1: mapear número de columna → canonicalHeader(cellText(valor)) (si un canónico se repite, gana la primera columna); validHeader = las 7 de CANONICAL_HEADER presentes, si no { ok: true, validHeader: false, rows: [] }; después eachRow desde la fila 2 armando un RawRow SOLO con las columnas canónicas (extras ignoradas) con cellText, y salteando la fila si todos sus valores quedan vacíos tras trim (mismo criterio que skipEmptyLines 'greedy' del CSV, así la numeración de errores de classifyRows significa lo mismo en los dos formatos). NO aplicar unescapeFormulaGuard acá: classifyRows ya lo aplica a nombre/teléfono/email/notas para los dos formatos.
       - Sin ciclo de imports: lib/clients-xlsx.ts importa de lib/clients-import.ts, nunca al revés.

    2) app/api/import/clients/preview/route.ts y confirm/route.ts — ediciones parciales, idénticas en los dos: agregar `export const runtime = 'nodejs'` con su por qué; importar parseClientsFile e IMPORT_MAX_ROWS del módulo nuevo y dejar de importar parseCsv (classifyRows sigue viniendo de lib/clients-import); `const MAX_ROWS = IMPORT_MAX_ROWS`. El guard de tamaño (file.size > MAX_BYTES → 413) queda PRIMERO, antes de leer bytes. Reemplazar el chequeo de extensión .csv + file.text() + parseCsv por: parseClientsFile({ name: file.name, bytes: await file.arrayBuffer(), maxRows: MAX_ROWS }); si !ok → Response.json({ ok: false, error }, { status: 400 }); después el chequeo de validHeader → invalid_header (400) y el de rows.length > MAX_ROWS quedan COMO ESTÁN. Auth, owner_id, query de existentes con .eq('business_id', business.id), classifyRows, buildClientInsert(…, 'importado') y el batch insert anon+RLS: sin tocar. Actualizar los comentarios de cabecera que dicen CSV (ahora: archivo .xlsx o .csv; el tipo lo decide el contenido, T-03-08).

    3) app/(dashboard)/clients/clients-client.tsx — SOLO estas ediciones (per D-01/D-03; copy rioplatense sin ¿¡; no reestilar nada más; antes de editar, correr eslint sobre el archivo y anotar la cuenta de problemas, para comparar al final):
       - L32: importar también buttonVariants de @/components/ui/button.
       - onImportFileSelect (~L467-471): extensión válida = termina en .xlsx o en .csv; mensaje 'Subí un archivo .xlsx o .csv de hasta 2 MB.'; el comentario de arriba pasa a decir .xlsx/.csv.
       - onImportPreview (~L497-503): invalid_header → 'El archivo no tiene el formato esperado. Bajá la plantilla o exportá tus clientes desde Forjo y usá ese archivo como base.'; file_too_large/invalid_file_type → el mismo mensaje nuevo de .xlsx o .csv; NUEVO unreadable_file → 'No pudimos leer el archivo. Tiene que ser un Excel (.xlsx) o un .csv; si es un .xls viejo, guardalo como .xlsx.'; NUEVO too_many_rows → 'El archivo tiene más de 2000 filas. Partilo en varios.' (2000 escrito a mano con un comentario "mismo cap que el server", como IMPORT_MAX_BYTES: este componente NO puede importar el módulo de servidor). El resto → el toast genérico de hoy.
       - Iconos del header (L919-935): el `<a href="/api/export/clients" download>` queda IGUAL (lo vigila test/panel-nav-chrome); solo cambian aria-label → `Exportar ${term.clients.toLowerCase()} a Excel`, title → 'Exportar a Excel', y en el botón de importar aria-label → `Importar ${term.clients.toLowerCase()} desde Excel o CSV`, title → 'Importar'; el comentario de L919 dice Excel en vez de CSV.
       - Etapa upload del modal (L1300-1311): texto 'Elegí el Excel (.xlsx) o el .csv exportado de Forjo.'; accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"; envolver el Button «Elegir archivo» existente y un `<a href="/api/export/clients?plantilla=1" download className={buttonVariants({ variant: 'outline' })}>` con el icono Download (w-4 h-4, ya importado) y el texto «Descargar plantilla» en un div flex flex-wrap items-center justify-center gap-2 (mismo estilo outline que «Elegir archivo», sin w-full); la línea chica pasa a `Si vas a cargar ${term.clients.toLowerCase()} desde cero, bajá la plantilla y completala.` (como expresión JSX). El comentario de L1285 dice Excel/CSV.
       - Estado vacío de la preview (~L1365): 'Revisá que el CSV tenga…' → 'Revisá que el archivo tenga…'.
       - Ninguna otra línea del archivo cambia. El componente NO importa ninguno de los módulos nuevos de lib (llevarían la librería de planillas al bundle del navegador).

    4) test/clients-xlsx.test.ts — agregar los casos de <behavior> de este task (suite sigue PURA). Para los libros "armados a mano", crear el Workbook directo con la librería en el test (no con buildClientsWorkbook), así se prueban celdas número/hipervínculo/richText/fórmula que el builder nunca escribe. Para el parche del ZIP, buscar en el buffer la PRIMERA firma 50 4B 01 02 y escribir uint32 LE 0x7FFFFFF0 en +24 sobre una copia.
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && npm test -- clients-xlsx clients-import panel-nav-chrome panel-history-clients panel-input-zoom-ios forms-no-get-leak && node node_modules/typescript/bin/tsc --noEmit && npm run lint -- lib/clients-xlsx.ts lib/clients-import.ts lib/xlsx-style.ts app/api/export/clients/route.ts app/api/import/clients/preview/route.ts app/api/import/clients/confirm/route.ts && test "$(grep -cE "exceljs|clients-xlsx|finances-xlsx|xlsx-style" "app/(dashboard)/clients/clients-client.tsx")" -eq 0 && test "$(grep -v '^\s*//' app/api/import/clients/preview/route.ts app/api/import/clients/confirm/route.ts | grep -c 'supabase/admin')" -eq 0 && grep -c 'plantilla=1' "app/(dashboard)/clients/clients-client.tsx" && grep -c 'accept=".xlsx,.csv' "app/(dashboard)/clients/clients-client.tsx" && grep -c "parseClientsFile" app/api/import/clients/preview/route.ts app/api/import/clients/confirm/route.ts</automated>
  </verify>
  <done>
    preview y confirm aceptan .xlsx y .csv por contenido, con los guards en orden (2 MB → tipo/ZIP → filas → header) y los códigos snake_case nuevos (unreadable_file) más los de siempre; el modal ofrece «Descargar plantilla» y el copy nuevo; los candados estáticos de /clients siguen verdes; eslint de clients-client.tsx con la misma cuenta que antes de editarlo (o menos); tsc sin salida.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: el export de finanzas sale como libro con Resumen + Turnos/Ventas/Egresos</name>
  <files>lib/finances-xlsx.ts, app/api/export/finances/route.ts, app/(dashboard)/finances/finances-client.tsx, test/finances-xlsx.test.ts</files>
  <behavior>
    - buildFinancesWorkbook → hojas en orden ['Resumen', 'Turnos', 'Ventas', 'Egresos'], cada fila 1 con el mismo estilo de marca (fill FFD94A2B, bold blanco) y congelada
    - Con turnos [2026-03-01 Corte 1000, 2026-03-15 Color 2500], ventas [2026-03-10 Shampoo cantidad 2 × 1500], egresos [2026-03-05 Alquiler 500]: financesSummary da turnos {2, 3500}, ventas {1, 3000}, ingresos 6500, egresos {1, 500}, saldo 6000; en la hoja Resumen, buscando por la etiqueta de la columna A, la fila Ingresos vale 6500, Egresos 500, Saldo 6000 (números, no fórmulas)
    - Hoja Turnos fila 2 = 2026-03-15 (orden desc); su celda de fecha recargada es Date con getUTCFullYear 2026, getUTCMonth 2, getUTCDate 15 y numFmt 'dd/mm/yyyy'; la celda de monto es number con numFmt que contiene '#,##0.00'
    - Hoja Ventas: Total = 3000 como número; Cantidad 2 y Precio unitario 1500 como números
    - Una descripción `=SUM(A1)` queda como celda ValueType.String; una fecha '' o inválida deja la celda vacía (nunca Invalid Date)
    - Sin movimientos: las cuatro hojas existen, Resumen en 0, las hojas de datos solo con encabezados
    - La entrada no se muta (el orden desc se hace sobre copias)
  </behavior>
  <action>
    1) Crear lib/finances-xlsx.ts (puro, solo servidor; cabecera en español con el por qué; usa lib/xlsx-style.ts) per D-02:
       - TurnoRow = { fecha: string; servicio: string; monto: number }, VentaRow = { fecha: string; descripcion: string; cantidad: number; precioUnitario: number }, EgresoRow = { fecha: string; categoria: string; monto: number }, FinancesExportInput = { turnos, ventas, egresos }.
       - financesSummary(input) → { turnos: { cantidad, monto }, ventas: { cantidad, monto }, ingresos, egresos: { cantidad, monto }, saldo }; total de venta = cantidad × precioUnitario (el mismo cálculo que hoy hacen la ruta y finances-client); todo número no finito cuenta como 0.
       - buildFinancesWorkbook(input): ExcelJS.Workbook. Hojas agregadas en este orden: Resumen [Concepto ancho 22, Cantidad 12, Monto 18 con ARS_FMT] con filas Turnos (cantidad, monto), Ventas (cantidad, monto), Ingresos (negrita, sin cantidad), Egresos (cantidad, monto), Saldo (negrita, sin cantidad) — VALORES calculados, nunca fórmulas; Turnos [Fecha 12 DATE_FMT, Servicio 36, Monto 16 ARS_FMT]; Ventas [Fecha, Descripción 36, Cantidad 10, Precio unitario 16 ARS_FMT, Total 16 ARS_FMT]; Egresos [Fecha, Categoría 30, Monto 16 ARS_FMT]. Cada hoja de datos ordenada por fecha DESC con el mismo comparador de strings de hoy, sobre una copia. Fecha con ymdToUtcDate (null → celda vacía). Textos como strings, montos como number. styleHeaderSheet con autoFilter en Turnos/Ventas/Egresos y sin autofiltro en Resumen. Mover acá (o dejar en la ruta, pero que no se pierda) el comentario de por qué fixed_expenses NO entra: son plantillas recurrentes, no movimientos fechados.

    2) app/api/export/finances/route.ts (edición parcial): `export const runtime = 'nodejs'` con su por qué. Auth gate, negocio por owner_id y las TRES queries con .eq('business_id', business.id) (incluido el .neq('status', 'cancelled') y el select con el snapshot de servicio) quedan IDÉNTICAS. Reemplazar el arreglo Movimiento + esc + CSV + BOM por el mapeo a filas tipadas: turnos con fecha a.date ?? '', servicio apptServiceName(a), monto apptServicePrice(a); ventas con fecha s.sale_date ?? '', descripcion s.description ?? '', cantidad Number(s.quantity), precioUnitario Number(s.amount); egresos con fecha e.expense_date ?? '', categoria e.category ?? '', monto Number(e.amount). buildFinancesWorkbook → workbookToBytes → new Response(bytes, { headers: Content-Type XLSX_CONTENT_TYPE, Content-Disposition attachment filename `finanzas-${business.slug}-${fecha}.xlsx`, Cache-Control no-store }). Reescribir la cabecera (export-only, sin round-trip; ahora un libro de 4 hojas; tenant igual que export/clients). Nunca el cliente de service role.

    3) app/(dashboard)/finances/finances-client.tsx — SOLO tres cambios en el botón (L839-868): el comentario dice Export Excel en vez de CSV; el nombre de respaldo pasa a 'finanzas.xlsx'; la etiqueta 'Exportar CSV' → 'Exportar Excel' ('Exportando...' queda). Nada más (la deuda de eslint medida en este archivo es react-hooks/set-state-in-effect = 1 y no tiene que subir). No importar ningún módulo nuevo de lib.

    4) Crear test/finances-xlsx.test.ts — suite PURA (sin hasSupabaseCreds), recargando el buffer con la librería como en el Task 1; cubrir todo el <behavior>.

    5) Build: correr `npm run build`. Si (y solo si) falla resolviendo dependencias de Node de la librería de planillas, agregar `serverExternalPackages: ['exceljs']` a next.config.ts (edición mínima), re-correr el build y declararlo como desvío en el SUMMARY.
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && npm test -- finances-xlsx panel-tabs service-delete-gate && node node_modules/typescript/bin/tsc --noEmit && npm run lint -- lib/finances-xlsx.ts app/api/export/finances/route.ts && test "$(grep -v '^\s*//' app/api/export/finances/route.ts | grep -c 'uFEFF')" -eq 0 && test "$(grep -v '^\s*//' app/api/export/finances/route.ts lib/finances-xlsx.ts | grep -c 'supabase/admin')" -eq 0 && test "$(grep -cE "exceljs|clients-xlsx|finances-xlsx|xlsx-style" "app/(dashboard)/finances/finances-client.tsx")" -eq 0 && grep -c "finanzas.xlsx" "app/(dashboard)/finances/finances-client.tsx" && npm run build</automated>
    <human-check>UAT del dueño (end-of-phase, no bloquea): abrir en Excel los tres archivos — clientes-*.xlsx, plantilla-clientes.xlsx y finanzas-*.xlsx — y confirmar encabezado rojo Forjo con texto blanco, fila congelada, filtros, fechas dd/mm/aaaa del mismo día que el panel y montos con $; después completar la plantilla con 2 filas e importarla desde /clients.</human-check>
  </verify>
  <done>
    Exportar Excel en /finances baja un libro de 4 hojas con totales correctos, fechas UTC sin corrimiento y montos con formato ARS per D-02; test/finances-xlsx.test.ts verde; los candados de /finances siguen verdes; eslint de finances-client.tsx sin problemas nuevos; build ok.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| navegador del dueño → /api/import/clients/{preview,confirm} | archivo subido NO confiable (contenido, extensión, nombre, tamaño, estructura ZIP) |
| navegador → /api/export/{clients,finances} | sesión del dueño; querystring `plantilla` no confiable (no aporta tenant) |
| datos de la DB → archivo descargado | textos de origen no confiable (nombres cargados en reservas públicas) llegan a Excel |
| npm registry → node_modules | dependencia nueva con subárbol transitivo |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-q-01 | Information disclosure | export clients/finances, plantilla | critical | mitigate | Gate intacto: cliente anon+RLS de @/lib/supabase/server, negocio por owner_id de auth.getUser(), `.eq('business_id', business.id)` en cada query; `plantilla=1` no lee datos y exige la misma sesión; gate negativo de grep contra el módulo de service role en las 4 rutas y los 3 módulos lib |
| T-q-02 | Tampering | celdas de texto del xlsx exportado (formula injection) | high | mitigate | Todo texto se escribe como string (nunca objeto fórmula); los tests recargan el buffer y afirman ValueType.String sin `.formula` para `=Ana` / `=HYPERLINK(...)` / `=SUM(A1)` |
| T-q-03 | Denial of service | parseClientsFile (ZIP-bomba / archivo enorme) | high | mitigate | 2 MB antes de leer bytes; zipDeclaredSizeOk (≤30 MB descomprimidos declarados, ≤500 entradas, sin ZIP64) ANTES de cargar; actualRowCount > 2000+1 → too_many_rows antes de recorrer; solo se recorre una hoja |
| T-q-03b | Denial of service | ZIP con tamaños declarados falsificados | low | accept | La librería verifica el largo recién al terminar de descomprimir; solo lo puede subir un dueño autenticado contra su propio negocio y el costo queda en esa invocación de la función |
| T-q-04 | Spoofing | detectImportFormat (extensión mentirosa) | medium | mitigate | La extensión es solo lista permitida; el parser lo decide la firma ZIP; `.xlsx` sin firma → invalid_file_type; tests de la matriz de detección |
| T-q-05 | Elevation of privilege | columnas del archivo (business_id / origin inyectados) | high | mitigate | Sin cambios: solo se leen las 7 columnas canónicas, extras ignoradas; buildClientInsert fuerza business_id de la sesión y origin='importado'; confirm re-parsea el archivo (no confía en la preview) |
| T-q-06 | Tampering | fórmulas dentro del xlsx subido | medium | mitigate | cellText solo lee el `result` cacheado; nada se evalúa; unescapeFormulaGuard sigue aplicándose en classifyRows |
| T-q-07 | Information disclosure | caché intermedia de las descargas | low | mitigate | `Cache-Control: no-store` en las respuestas xlsx |
| T-q-08 | Information disclosure | bundle del navegador | low | mitigate | Los módulos nuevos son solo de servidor; gate de grep en clients-client.tsx y finances-client.tsx |
| T-q-SC | Tampering | npm install exceljs | high | mitigate | Versión exacta 4.4.0 (`--save-exact`); integridad sha512 verificada contra el registry y contra el lockfile de facturador-ARCA; el verify del Task 1 la compara en package-lock.json; `npm audit --omit=dev` anotado en el SUMMARY sin `audit fix` |
</threat_model>

<verification>
- `npm test` completo (carriles pure + db). Ojo con los canarios de reloj: 2 tests fallan A PROPÓSITO fuera de [01:00, 23:30] hora AR; mirar el reloj antes de culpar al cambio y declararlo en el SUMMARY.
- `node node_modules/typescript/bin/tsc --noEmit` sin salida (NO `npx tsc`: en esta máquina sale 0 aunque haya errores).
- `npm run lint` sobre los archivos tocados: los nuevos y las rutas limpios; clients-client.tsx y finances-client.tsx sin problemas nuevos frente a la cuenta anotada antes de editarlos.
- `npm run build` ok.
- No hacen falta pruebas de navegador (no se corre con-turno). La revisión visual del Excel queda como UAT del dueño (human-check del Task 3) y el SUMMARY tiene que decir que NO se abrió en Excel.
</verification>

<success_criteria>
- Los 7 truths de must_haves comprobados por tests de vitest (formato, fórmula-como-texto, plantilla, headers, ida y vuelta, tipos de celda, detección, límites, finanzas) o por los gates de grep de cada task.
- test/clients-import.test.ts sin modificar y verde: el CSV viejo se comporta igual.
- Candados estáticos existentes verdes: panel-nav-chrome, panel-history-clients, panel-input-zoom-ios, forms-no-get-leak, panel-tabs, service-delete-gate.
- package.json con exceljs 4.4.0 exacto e integridad verificada; papaparse intacto.
- Commits atómicos por task; nada se pushea.
</success_criteria>

<output>
Crear `.planning/workstreams/panel-nav/quick/261124-ine-export-import-de-clientes-y-finanzas-pas/261124-ine-SUMMARY.md` al terminar (requirements-completed: []; incluir la salida de `npm audit --omit=dev` para el subárbol de exceljs, la cuenta de eslint antes/después de las dos pantallas, y el aviso explícito de que el formato visual en Excel queda pendiente de la UAT del dueño).
</output>