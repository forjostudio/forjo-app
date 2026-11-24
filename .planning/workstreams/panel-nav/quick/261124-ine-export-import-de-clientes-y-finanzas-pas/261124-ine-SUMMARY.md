---
phase: quick-261124-ine
plan: "01"
status: complete
subsystem: panel / export-import de datos
tags: [excel, xlsx, exceljs, import, export, clientes, finanzas]
requirements-completed: []
dependency_graph:
  requires: [DATA-01, DATA-02, DATA-03]
  provides: ["export de clientes .xlsx", "plantilla de import", "import .xlsx + .csv", "export de finanzas .xlsx de 4 hojas"]
  affects: [app/api/export/clients, app/api/export/finances, app/api/import/clients/preview, app/api/import/clients/confirm, /clients, /finances]
tech-stack:
  added: ["exceljs 4.4.0 (exacta)"]
  patterns: ["módulos lib/ puros y solo de servidor", "formato del import decidido por la firma ZIP", "pre-chequeo del ZIP-bomba por directorio central"]
key-files:
  created:
    - lib/xlsx-style.ts
    - lib/clients-xlsx.ts
    - lib/finances-xlsx.ts
    - test/clients-xlsx.test.ts
    - test/finances-xlsx.test.ts
  modified:
    - package.json
    - package-lock.json
    - lib/clients-import.ts
    - app/api/export/clients/route.ts
    - app/api/export/finances/route.ts
    - app/api/import/clients/preview/route.ts
    - app/api/import/clients/confirm/route.ts
    - app/(dashboard)/clients/clients-client.tsx
    - app/(dashboard)/finances/finances-client.tsx
decisions:
  - "Cap de filas del import se queda en 2000 (IMPORT_MAX_ROWS, una sola fuente para preview y confirm)"
  - "Header del import sigue rígido (7 columnas); canonicalHeader reconoce títulos legibles y snake_case sin tabla de alias"
  - "La plantilla sale de GET /api/export/clients?plantilla=1 (mismo gate de sesión) y lleva hoja Instrucciones; el export de datos no"
  - "ymdToUtcDate también rechaza fechas imposibles (2026-02-31) en vez de correrlas al mes siguiente"
metrics:
  duration: 23min
  completed: 2026-11-24
  tasks: 3
  files: 14
estimate:
  tokens: 70000
  tasks: 3
actuals:
  tokens: 16700
  tasks: 3
  commits: 5
plan_head_before: b23c2679fcd43c23ead2e8de0667eadc93af31f5
---

# Quick 261124-ine: export/import de clientes y finanzas pasa a Excel — Summary

El export de clientes, la plantilla de import y el export de finanzas salen como .xlsx con encabezado rojo Forjo (#D94A2B, texto blanco en negrita), fila congelada, autofiltro, fechas reales dd/mm/yyyy y montos con formato de pesos. El import acepta .xlsx y sigue aceptando los .csv viejos; qué parser usar lo decide el contenido del archivo, no la extensión.

## Commits

| Task | Commit | Qué |
|------|--------|-----|
| 1 (tracer) | c33ca80 | exceljs 4.4.0 + lib/xlsx-style.ts + lib/clients-xlsx.ts (builder) + canonicalHeader + /api/export/clients en .xlsx con `?plantilla=1` |
| 2 | 9caaea6 | parseClientsFile (detección por firma ZIP, ZIP-bomba, cellText, cap de filas), preview/confirm, modal de /clients con «Descargar plantilla» |
| 3 | 7629e72 | lib/finances-xlsx.ts + /api/export/finances con 4 hojas + botón «Exportar Excel» |

`commits: 5` es lo que mide `git rev-list --count b23c267..HEAD`. Incluye 2 commits de OTRAS sesiones que entraron a main mientras corría este quick (`5ec62c2` quick-261124-iu8 y `e01be07` quick-261119-q8v). Los de este quick son 3.

## Evidencia

- `node node_modules/typescript/bin/tsc --noEmit`: sin salida (exit 0).
- `npm test` completo: **118 archivos ok; 2345 passed, 4 expected fail, 1 skipped (2350)**. Corrió a las 14:07 hora AR, dentro de la ventana [01:00, 23:30], así que los canarios de reloj pasaron.
  - test/clients-xlsx.test.ts: 53/53. test/finances-xlsx.test.ts: 9/9 (carril `pure`, ninguna importa test/env).
  - test/clients-import.test.ts sin modificar y en verde (el CSV viejo se comporta igual).
  - Candados estáticos en verde: panel-nav-chrome, panel-history-clients, panel-input-zoom-ios, forms-no-get-leak, panel-tabs, service-delete-gate.
- `npm run build`: ok (Next 16.2.7, Turbopack). **No hizo falta `serverExternalPackages`.**
- ESLint sobre los archivos tocados:
  - Archivos nuevos y las 4 rutas: 0 problemas.
  - `lib/clients-import.ts`: 1 warning que ya estaba (`_business` sin usar en classifyRows, que no se tocó).
  - `clients-client.tsx`: 0 antes y 0 después.
  - `finances-client.tsx`: 1 antes y 1 después (`react-hooks/set-state-in-effect` en L467, que ya estaba).
- Gates de grep del plan: ninguna ruta ni módulo nuevo importa `supabase/admin`; ningún componente cliente importa exceljs ni los módulos nuevos; no queda BOM en los exports. Integridad sha512 de exceljs en package-lock.json idéntica a la de la tabla de legitimidad.

## Auditoría del paquete (`npm audit --omit=dev`)

En el subárbol de exceljs aparece un solo aviso: **uuid (moderate)**, "Missing buffer bounds check in v3/v5/v6 when buf is provided" → afecta a `exceljs`. exceljs usa uuid v4 y no le pasa `buf`, así que el camino vulnerable no se ejecuta. No se corrió `audit fix`. El resto de los 25 avisos del proyecto (next, hono, postcss, etc.) ya estaban y no tienen que ver con este cambio.

`npm install` además sacó la marca `dev` a 3 paquetes que ahora también usa exceljs (`es-to-primitive` 1.3.0→1.3.4, `typed-array-byte-offset` 1.0.4→1.0.5, `which-typed-array` 1.1.21→1.1.24). Es la resolución normal de npm.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tipos de la librería: `load()` pide un ArrayBuffer y `Response` pide `Uint8Array<ArrayBuffer>`**
- **Found during:** Task 1
- **Issue:** el index.d.ts de exceljs declara `interface Buffer extends ArrayBuffer`, así que `xlsx.load(Buffer.from(...))` no compila. Además, con TS 5.9, `Uint8Array<ArrayBufferLike>` no es un `BodyInit` válido.
- **Fix:** `workbookToBytes` devuelve `Promise<Uint8Array<ArrayBuffer>>`; los tests recargan con `bytes.buffer.slice(...)`, que es lo que ya sugería el plan, sin `as any`; `parseClientsFile` le pasa el ArrayBuffer de `file.arrayBuffer()` directo.
- **Commit:** c33ca80

**2. [Rule 2 - Correctness] ymdToUtcDate rechaza fechas imposibles**
- **Found during:** Task 1
- **Issue:** `Date.UTC(2026, 1, 31)` corre la fecha al 3 de marzo. Una fecha mal cargada iba a aparecer en el Excel como un día inventado.
- **Fix:** si después de construirla el año, el mes o el día no coinciden, devuelve null y la celda queda vacía. Lo cubre test/finances-xlsx.test.ts.
- **Commit:** c33ca80

**3. Comentarios de `unescapeFormulaGuard` actualizados**
- Decían que el export prefijaba con `esc()`, y eso ya no es cierto. Ahora explican que el prefijo `'` lo traen los .csv viejos y que el Excel no lo pone. El código no cambió.

Fuera de eso, el plan se ejecutó como estaba escrito.

## Archivos de muestra (generados para abrir a mano, NO commiteados)

Los generó un script descartable en el scratchpad (`gen-samples.ts`, que no está en el repo) con los builders reales de lib/:
- C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/852caa9d-96c1-4359-9d60-05639393cb6a/scratchpad/clientes-ejemplo-2026-11-24.xlsx (5 clientes inventados, uno con `=Prueba de fórmula` y otro con `O'Brien`)
- C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/852caa9d-96c1-4359-9d60-05639393cb6a/scratchpad/plantilla-clientes.xlsx
- C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/852caa9d-96c1-4359-9d60-05639393cb6a/scratchpad/finanzas-ejemplo-2026-11-24.xlsx (4 turnos, 2 ventas y 2 egresos inventados)

## UAT pendiente (human-check del Task 3)

**Los archivos NO se abrieron en Excel.** Formato, colores, fila congelada y filtros se comprobaron recargando el archivo con la misma librería en los tests, no mirándolos. Falta que el dueño:
1. Abra en Excel `clientes-*.xlsx`, `plantilla-clientes.xlsx` y `finanzas-*.xlsx` (o los de muestra de arriba) y confirme: encabezado rojo Forjo con texto blanco, fila 1 congelada, filtros, fechas dd/mm/aaaa del mismo día que el panel y montos con $.
2. Complete la plantilla con 2 filas y la importe desde /clients.

Tampoco se probaron las rutas contra un server levantado (no había que correr pruebas de navegador). La autenticación de las rutas no cambió y lo único que se verificó es que compilan y que pasan el build.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat model del plan. Hay una superficie nueva, `?plantilla=1`, y queda detrás del mismo gate de sesión (T-q-01).

## Self-Check: PASSED

- FOUND: lib/xlsx-style.ts, lib/clients-xlsx.ts, lib/finances-xlsx.ts, test/clients-xlsx.test.ts, test/finances-xlsx.test.ts
- FOUND: c33ca80, 9caaea6, 7629e72
