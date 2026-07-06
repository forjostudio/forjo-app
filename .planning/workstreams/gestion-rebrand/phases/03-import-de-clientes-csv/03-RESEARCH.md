# Phase 3: Import de clientes CSV - Research

**Researched:** 2026-07-06
**Domain:** Upload de archivo + parseo CSV server-side + batch insert con aislamiento por tenant (Next.js 16 route handler + Supabase anon+RLS + papaparse)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Formato/columnas del CSV:** Header RÍGIDO = el del export de la Fase 2 (round-trip): `nombre,telefono,email,origen,notas,obra_social,nro_obra_social`. Obligatorias: `nombre` + **al menos un contacto** (`telefono` o `email`). La columna `origen` del CSV se **ignora** y se fuerza `origin='importado'` server-side. Columnas extra se ignoran. Mapeo flexible de columnas = DIFERIDO a v2.
- **D-02 — Deduplicación:** Reusar el criterio existente (`clients-client.tsx` L260-269): **email en minúsculas** + **teléfono solo-dígitos** (`replace(/\D/g,'')`). Match por cualquiera de los dos → duplicado. Duplicado → **OMITIR (v1)**, contado en "omitidos". Dedup también **dentro del propio CSV**. Actualizar el cliente existente = DIFERIDO a v2.
- **D-03 — Parseo + aislamiento:** **Route handler autenticado** en `app/api/...` (NO server action). **`business_id` SIEMPRE de la sesión** (negocio por `owner_id`), NUNCA del CSV. Al confirmar, el server **RE-PARSEA** el archivo (no confía en la preview). Nada se escribe en preview. Lean: **anon+RLS** por defensa en profundidad.
- **D-04 — Escala:** Tope conservador v1: **≤ ~2.000 filas y ≤ 2 MB de archivo**. Rechazo con error claro **antes** de parsear si excede. El research afina contra los límites reales de Vercel Hobby.
- **D-05 — Librería CSV (APROBADA):** **`papaparse`**. Dependencia NUEVA, flaggeada y aprobada por el usuario. Solo `papaparse` — no sumar xlsx ni otras.

### Claude's Discretion (para el research)

- Slug/estructura de los route handlers (ej. `preview` + `confirm`, o uno con acción).
- Formato exacto del error por fila + shape del resumen (importados/omitidos/fallidos).
- Estrategia de batch insert (tamaño de lote) + manejo de fallo parcial (transacción vs best-effort).
- Cómo se pasa el archivo de preview → confirm (re-upload vs token/cache) — con la regla dura de RE-PARSEAR en confirm.

### Deferred Ideas (OUT OF SCOPE)

- Mapeo flexible de columnas (headers arbitrarios de otras herramientas) — v2.
- ACTUALIZAR clientes existentes en el import (en vez de omitir el duplicado) — v2.
- Import de finanzas — no está en el roadmap.
- Imports grandes (>2.000 filas) / procesamiento asíncrono / cola — v2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-03 | El dueño importa clientes desde un CSV con flujo upload → preview/validación → confirmar, deduplicando y respetando el aislamiento por tenant (RLS + `business_id`). | Todo este documento: upload en route handler Next 16 (§Pattern 1), parseo papaparse round-trip (§Pattern 2-3), arquitectura preview→confirm stateless (§Pattern 4), batch insert anon+RLS (§Pattern 5), validación+dedup por fila (§Pattern 6), threat surface (§Security Domain). |
</phase_requirements>

## Summary

Esta es la única fase con backend delicado del milestone. El riesgo dominante es doble: **(1) aislamiento por tenant** (un CSV NUNCA puede escribir en otro negocio) y **(2) correctitud del parseo** (el export de la Fase 2 emite comillas RFC4180 + BOM UTF-8 + un prefijo `'` anti-fórmula; un parser naíf se rompe). Ambos riesgos ya están mitigados por las decisiones lockeadas: anon+RLS con `business_id` de sesión, y `papaparse` battle-tested.

El trabajo nuevo real es **el upload de archivo** — no existe ningún `request.formData()` en el repo. En Next 16 el patrón es la Web `Request` API estándar (`await request.formData()` → `File` → `file.text()`), sin config extra. **PERO** hay dos gotchas de plataforma que el plan DEBE cubrir: (a) Vercel corta el request en **4.5 MB** con un 413 `FUNCTION_PAYLOAD_TOO_LARGE` — por eso el tope de 2 MB de D-04 es holgado y seguro; y (b) el `proxy.ts` de este repo bufferea el body de todas las `/api/*` con un límite de **10 MB por defecto** que **trunca en silencio sin dar error** — irrelevante con el cap de 2 MB, pero hay que saberlo. La validación de tamaño se hace en el server ANTES de parsear (`file.size`), no se confía en el cliente.

La arquitectura preview→confirm debe ser **stateless (re-upload en confirm)**: Vercel Hobby no garantiza la misma instancia entre requests ni memoria persistente, así que un stash server-side (cache/token) es frágil y contradice D-03 ("el server re-parsea en confirm"). Preview y confirm son el MISMO parseo+validación; confirm además hace la query de dedup + el batch insert. **Primary recommendation:** dos route handlers (`preview` + `confirm`), ambos reciben el archivo por `multipart/form-data`, ambos re-parsean con papaparse; solo `confirm` escribe.

**Primary recommendation:** Route handler autenticado con `request.formData()`, guard de `file.size ≤ 2MB` antes de parsear, `Papa.parse(text, { header:true, skipEmptyLines:'greedy' })`, reusar `validateClientBody`/`isValidPhone` por fila, dedup con índice email-lowercase + phone-digits (misma lógica que L260-269), batch insert anon+RLS con `origin='importado'` forzado server-side, resumen `{ importados, omitidos, fallidos }`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Recepción del archivo CSV (multipart) | API / Backend (route handler) | — | El upload no puede confiar en el cliente; el server es fuente de verdad (D-03). |
| Parseo CSV (RFC4180 + BOM) | API / Backend | — | Se re-parsea en preview Y en confirm; el cliente nunca parsea autoritativamente. |
| Validación por fila (nombre + contacto) | API / Backend (`lib/clients-create`) | — | Reusa `validateClientBody`; lógica pura ya existente. |
| Deduplicación (vs DB + intra-CSV) | API / Backend | Database (query de existentes) | Requiere leer los clientes del negocio → query filtrada por `business_id`. |
| Resolución del tenant (`business_id`) | API / Backend (sesión → `owner_id`) | Database (RLS) | NUNCA del CSV. Defensa en profundidad: filtro explícito + RLS. |
| Batch insert | Database (Supabase anon+RLS) | API / Backend | RLS `with check` como red final; el filtro por `business_id` en el payload como primera capa. |
| Preview UI (mostrar filas + errores) | Browser / Client | — | Solo UX; NO es autoritativo (el server re-valida en confirm). |
| Upload + estado del flujo (drag&drop, spinner) | Browser / Client | — | Pantalla de Clientes, junto a "Nuevo cliente" / "Exportar CSV". |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `papaparse` | `5.5.4` | Parseo CSV RFC4180 robusto (comillas, comas embebidas, saltos de línea, BOM). | `[VERIFIED: npm registry]` — mholt/PapaParse, ~11.5M descargas/semana, sin postinstall. El parser CSV de facto en JS. APROBADO por el usuario (D-05). |
| `@types/papaparse` | `5.5.2` | Tipos TS para papaparse (papaparse no trae tipos propios). | `[VERIFIED: npm registry]` — DefinitelyTyped, ~8.1M descargas/semana. `devDependency`. |

### Supporting (ya en el repo — NO instalar)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@supabase/ssr` + `@supabase/supabase-js` | ya instaladas | Cliente anon+RLS vía `@/lib/supabase/server` (`createClient()`). | El insert autenticado con la sesión del dueño. `[VERIFIED: package.json]` |
| `lib/clients-create.ts` | in-repo | `validateClientBody`, `isValidPhone`, `buildClientInsert`. | Reusar por fila. `[VERIFIED: codebase]` |
| `zod` `^4.4.3` | ya instalada | Validación de shape si se quisiera formalizar la fila; **opcional** — el patrón del repo es narrowing manual (`typeof x === 'string'`). | Discreción; el repo NO usa zod en los route handlers de datos, usa narrowing manual. `[VERIFIED: package.json]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `papaparse` | Parser hand-rolled (split por coma) | REJECTED — se rompe con comillas RFC4180 del export de la Fase 2. Es exactamente la clase de bug que motivó el gate de D-05. `[VERIFIED: 03-CONTEXT.md D-05]` |
| `papaparse` | `csv-parse` (node) | Válido técnicamente, pero D-05 lockeó papaparse; no reabrir. |
| Re-upload en confirm | Stash server-side (token+cache) | REJECTED — Vercel Hobby no garantiza misma instancia ni memoria entre requests; frágil. Ver Pitfall 2. `[CITED: vercel.com/docs/functions/limitations]` |

**Installation:**
```bash
npm install papaparse@5.5.4
npm install -D @types/papaparse@5.5.2
```

**Version verification:** `npm view papaparse version` → `5.5.4` (modified 2026-06-19). `npm view @types/papaparse version` → `5.5.2` (2025-12-13). Ambos confirmados contra el registro npm el 2026-07-06.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `papaparse` | npm | Republicado 2026-06-19 (proyecto ~10+ años) | ~11.5M/sem | github.com/mholt/PapaParse | **SUS** (`too-new`) | **Aprobado con nota** — ver abajo |
| `@types/papaparse` | npm | 2025-12-13 | ~8.1M/sem | github.com/DefinitelyTyped/DefinitelyTyped | OK | Aprobado |

**Packages removed due to [SLOP] verdict:** none

**Packages flagged as suspicious [SUS]:** `papaparse` — el seam lo marcó `SUS` con razón única `too-new` (fue republicado 2026-06-19, dentro de la ventana de heurística). **Es un falso positivo**: PapaParse es el parser CSV canónico de JS (repo `mholt/PapaParse`, ~11.5M descargas/semana, sin `postinstall`, no deprecado). El `publishedAt` reciente es una release de mantenimiento de un proyecto maduro, no un paquete nuevo. **El usuario ya lo aprobó explícitamente en discuss-phase (D-05).**

**Recomendación al planner:** la doble condición (usuario ya aprobó en D-05 + repo/descargas confirman legitimidad) satisface el gate humano. Igual, por rigor del protocolo, el planner PUEDE incluir un `checkpoint:human-verify` de una línea antes del `npm install` para que el dueño confirme que sigue queriendo la dep — pero NO es bloqueante dado el approval previo. Pin exacto `papaparse@5.5.4` para evitar sorpresas de versión.

## Architecture Patterns

### System Architecture Diagram

```
[Pantalla Clientes]  (Browser / Client — junto a "Nuevo cliente" / "Exportar CSV")
      │  1. usuario elige archivo .csv (drag&drop o <input type=file>)
      │
      ├─ POST /api/import/clients/preview   (multipart/form-data, campo "file")
      │        │
      │        ▼
      │   [Route handler PREVIEW]  (Node runtime, anon+RLS)
      │        ├─ auth.getUser() → 401 si no hay sesión
      │        ├─ business por owner_id → 404 si no
      │        ├─ file = formData.get('file') → guard: file.size ≤ 2MB, mimetype/ext → 413/400 ANTES de parsear
      │        ├─ text = await file.text()   (papaparse strippea BOM)
      │        ├─ Papa.parse(text, {header:true, skipEmptyLines:'greedy'})
      │        ├─ por fila: strip prefijo `'` anti-fórmula → validateClientBody → clasificar (válida/error)
      │        ├─ query clientes existentes del negocio (business_id) → índice dedup
      │        └─ dedup vs DB + intra-CSV → clasificar (importable/duplicada)
      │        ▼
      │   Response.json({ ok, preview:{ importables, duplicadas, errores:[{row,error}], total } })
      │        │  NADA se escribe (SC-1)
      │        ▼
[Preview UI]  muestra filas + errores marcados + conteos → botón "Confirmar import"
      │
      └─ POST /api/import/clients/confirm   (RE-UPLOAD del MISMO archivo, multipart)
               │
               ▼
          [Route handler CONFIRM]  (Node runtime, anon+RLS)
               ├─ MISMO auth + business + guard de tamaño
               ├─ RE-PARSEA + RE-VALIDA + RE-DEDUP (no confía en la preview del cliente — D-03)
               ├─ buildClientInsert(business, fila) con origin='importado' FORZADO
               ├─ batch insert anon+RLS: supabase.from('clients').insert([...lote])  (business_id de sesión)
               └─ Response.json({ ok, resumen:{ importados, omitidos, fallidos } })   (SC-4)
                        │
                        ▼
                   [Supabase clients]  RLS with check (business_id ∈ negocios del owner) = red final
```

### Recommended Project Structure

```
app/api/import/clients/
├── preview/route.ts     # POST — parsea + valida + dedup, NO escribe (SC-1)
└── confirm/route.ts     # POST — re-parsea + inserta lote (SC-2, SC-4)
lib/
└── clients-import.ts    # LÓGICA PURA compartida (parseo→filas, clasificación, dedup, resumen) — testeable sin server
app/(dashboard)/clients/
└── clients-client.tsx   # UI: botón "Importar CSV" → dialog upload → preview → confirmar → resumen
```

**Nota de patrón:** el repo separa la lógica pura del route handler (ver `lib/clients-create.ts` compartido con `app/api/clients/create/route.ts`). Replicar: `lib/clients-import.ts` contiene el parseo→filas, la clasificación (válida/error/duplicada) y la construcción del resumen; los dos route handlers (`preview`/`confirm`) importan de ahí. Esto evita divergencia entre preview y confirm (el bug más peligroso: que preview diga "válida" y confirm rechace).

### Pattern 1: Upload de archivo en route handler Next 16 (NUEVO en el repo)

**What:** Recibir un `File` vía `multipart/form-data` con la Web `Request` API. NO hay config especial en Next 16 App Router route handlers — `request.formData()` funciona directo. (Los route handlers usan el **runtime Node por defecto**, no Edge; el proxy Edge solo refresca sesión.)

**When to use:** El upload del CSV en `preview` y `confirm`.

```typescript
// Source: [CITED: node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md — "Web Request/Response APIs"]
// Guard de tamaño ANTES de parsear (D-04). Vercel corta a 4.5MB con 413 igual, pero validamos a 2MB.
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB (D-04) — holgado bajo el cap de 4.5MB de Vercel

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const { data: business } = await supabase
    .from('businesses').select('id, type, vertical').eq('owner_id', user.id).single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // Parseo defensivo del multipart (mismo espíritu que el try/catch de request.json()).
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: 'missing_file' }, { status: 400 })
  }
  // Guard de tamaño ANTES de leer/parsear (D-04) → 413 claro.
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: 'file_too_large' }, { status: 413 })
  }
  // Guard de tipo laxo (los CSV llegan con mimetypes inconsistentes: text/csv,
  // application/vnd.ms-excel, application/octet-stream). Chequear extensión .csv
  // y/o mimetype, sin ser tan estricto que rechace un CSV válido de Excel-AR.
  const name = (file.name ?? '').toLowerCase()
  if (!name.endsWith('.csv')) {
    return Response.json({ ok: false, error: 'invalid_file_type' }, { status: 400 })
  }

  const text = await file.text() // string UTF-8; papaparse strippea el BOM del export
  // ... Papa.parse(text, ...) → ver Pattern 2
}
```

**Gotchas confirmados:**
- **Vercel body cap = 4.5 MB** → excederlo devuelve `413 FUNCTION_PAYLOAD_TOO_LARGE` *antes* de que el handler corra. `[CITED: vercel.com/docs/functions/limitations]` El tope de 2 MB de D-04 queda muy por debajo → seguro.
- **`proxy.ts` bufferea el body de `/api/*`** (todas las rutas de import pasan por el proxy). Next 16 default `proxyClientMaxBodySize = 10MB` y **si se excede, TRUNCA en silencio (no da error)** — el handler recibiría un body parcial. `[CITED: node_modules/next/dist/docs/.../proxyClientMaxBodySize.md]` Con el cap de 2 MB esto nunca se dispara, pero si algún día se sube el tope hay que subir también `proxyClientMaxBodySize` o el archivo llegaría cortado y el parseo daría filas incompletas sin error.
- **Sin `maxDuration` custom, Hobby default = 60s** (300s con Fluid Compute). `[CITED: vercel.com/docs/functions/limitations]` Parsear+validar+insertar 2.000 filas está muy por debajo de 60s; NO hace falta tocar `maxDuration`. Si en el futuro sube el tope de filas, considerar `export const maxDuration = 60` explícito.

### Pattern 2: Parseo con papaparse (server-side, string)

**What:** Parsear el string del archivo con header, saltando líneas vacías, con BOM stripping automático.

```typescript
// Source: [CITED: papaparse.com/docs — parse config]
import Papa from 'papaparse'

interface RawRow {
  nombre?: string; telefono?: string; email?: string
  origen?: string; notas?: string; obra_social?: string; nro_obra_social?: string
}

const result = Papa.parse<RawRow>(text, {
  header: true,            // usa la primera fila como claves → objetos {nombre, telefono, ...}
  skipEmptyLines: 'greedy', // 'greedy' descarta filas que son solo comas/espacios (no solo la línea 100% vacía)
  transformHeader: (h) => h.trim().toLowerCase(), // tolera "Nombre " / "TELEFONO" en el header
})

// result.data  → RawRow[]
// result.errors → ParseError[] con { type, code, message, row } por fila mal formada
// result.meta.fields → string[] con las columnas detectadas (para validar el header rígido D-01)
```

**Config flags (confirmar en el plan):**
- `header: true` — REQUERIDO (D-01: header rígido nombrado). `[CITED: papaparse.com/docs]`
- `skipEmptyLines: 'greedy'` — recomendado: el export termina con filas; una fila vacía final es común. `'greedy'` es más robusto que `true`.
- `transformHeader` — normaliza el header (trim + lowercase) para tolerar variaciones cosméticas SIN habilitar mapeo flexible (eso es v2). El header rígido D-01 se valida contra `result.meta.fields`.
- **BOM:** el export de la Fase 2 emite el BOM UTF-8 (`U+FEFF`) al inicio. **papaparse strippea el BOM automáticamente** cuando `header:true` (lo remueve del primer field name). `[CITED: papaparse GitHub #684 — BOM handling]` Aun así, defensivo: `text.replace(/^﻿/, '')` antes de parsear no hace daño y garantiza que la primera columna sea `nombre`, no `﻿nombre`. **Recomendado incluirlo** — es una línea y elimina toda una clase de bug (la primera columna no matchea el header). Usar la secuencia de escape `﻿`, NUNCA el glifo invisible pegado (misma convención que `export/clients/route.ts`). `[VERIFIED: cross-check export/route.ts emite '﻿' + csv]`

**Validación del header rígido (D-01):** comparar `result.meta.fields` (tras `transformHeader`) contra `['nombre','telefono','email','origen','notas','obra_social','nro_obra_social']`. Si faltan las obligatorias (`nombre` y al menos una de contacto no se puede saber por header solo → se valida por fila), rechazar con `invalid_header`. Columnas extra se ignoran (D-01).

### Pattern 3: Round-trip lossless con el export — strip del prefijo `'` anti-fórmula (EDGE CASE CLAVE)

**What:** El export de la Fase 2 prefija con `'` todo campo que arranca con `= + - @ \t \r` (defensa OWASP formula injection) y luego lo envuelve en comillas RFC4180. Al re-importar, papaparse quita las comillas RFC4180 correctamente, **pero el `'` líder queda pegado al valor**. Sin manejo, un cliente exportado como nombre `=Ana` (que en la DB era `=Ana`) se re-importaría como `'=Ana` → **round-trip NO lossless**.

**Recomendación (correcta y segura):** en el import, **quitar UN `'` líder si y solo si el siguiente carácter es uno de `= + - @ \t \r`** — que es exactamente el patrón que el export prefija. Esto restaura el valor original (round-trip lossless) y sigue siendo seguro porque el valor se re-neutraliza al re-exportar (el export vuelve a prefijar `'` en la próxima Fase-2 export).

```typescript
// Source: [VERIFIED: cross-check con esc() en app/api/export/clients/route.ts L58-61]
// El export hace:  /^[=+\-@\t\r]/.test(v) ? `'${v}` : v   →  el import lo revierte:
function unescapeFormulaGuard(v: string): string {
  // Quita SOLO el ' que el export agregó como escudo anti-fórmula (no toca ' legítimos
  // de un nombre como "O'Brien", porque ahí el char siguiente no es = + - @).
  return v.startsWith("'") && /^[=+\-@\t\r]/.test(v.slice(1)) ? v.slice(1) : v
}
```

**Por qué es seguro almacenar el valor "des-escapado":** el `'` anti-fórmula es una defensa de **presentación en CSV/Excel**, NO un saneo del dato en sí. El valor real en la DB de Forjo siempre fue `=Ana` (así se cargó en una reserva pública). Al des-escapar en el import, restauramos ESE valor. La defensa se re-aplica sola en cada export (el `esc()` de la Fase 2 corre siempre). Guardar `'=Ana` en cambio corrompería el dato (nombres con `'` líder espurio que se acumularían en cada round-trip). **Flag para el planner:** este es EL caso de prueba estrella (export → import → mismo valor). Incluir un test que exporte un cliente con nombre `=X`, lo re-importe y verifique que el valor almacenado es `=X` (no `'=X`).

### Pattern 4: Preview → confirm STATELESS (re-upload)

**What:** Dos requests independientes; el archivo se sube en ambos. No hay estado server-side entre ellos.

**When to use:** Todo el flujo. Es la única opción robusta en Vercel Hobby.

```typescript
// PREVIEW: parsea + valida + dedup + clasifica, devuelve el desglose. NO escribe.
// CONFIRM: recibe el MISMO archivo de nuevo, re-hace TODO el pipeline, y solo entonces inserta.
// El cliente NO manda "las filas válidas que vio" — manda el archivo crudo. El server es la
// fuente de verdad (D-03): si el cliente manipulara la preview, confirm lo re-valida igual.
```

**Por qué stateless y no stash:** Vercel Hobby corre funciones serverless efímeras; **no se garantiza la misma instancia entre preview y confirm**, y no hay memoria compartida. `[CITED: vercel.com/docs/functions/limitations]` Un stash requeriría una tabla/Storage temporal (complejidad + limpieza + otra superficie de tenant a aislar) sin beneficio: los archivos son ≤ 2 MB, re-subir es barato. **D-03 ya exige re-parsear en confirm** → el stash no ahorraría el parseo de todos modos. Re-upload = más simple, más seguro, alineado con la decisión lockeada.

**Trade-off aceptado:** el usuario sube el archivo dos veces (una en preview, una en confirm). Con ≤ 2 MB es imperceptible. La UI puede retener el `File` en memoria del browser (React state) y re-postearlo en confirm sin pedirlo de nuevo — el usuario no re-selecciona nada, solo hace click en "Confirmar".

### Pattern 5: Batch insert con anon+RLS (D-03, SC-2)

**What:** Insertar N filas válidas en una sola llamada `.insert([...])`, con `business_id` de la sesión.

```typescript
// Source: [VERIFIED: patrón de app/api/clients/create/route.ts + buildClientInsert]
// anon+RLS (NO service role): RLS with check + filtro por business_id = defensa en profundidad.
const rows = importables.map((fila) =>
  buildClientInsert(business, {
    name: fila.nombre,
    phone: fila.telefono,
    email: fila.email,
    notes: fila.notas,
    insurance_name: fila.obra_social,      // buildClientInsert las ignora si el vertical no es salud
    insurance_number: fila.nro_obra_social,
  })
)
// buildClientInsert YA fuerza origin: 'manual' → OJO: hay que forzar origin='importado' acá.
// Ver "Ajuste requerido a buildClientInsert" abajo.

const { data, error } = await supabase.from('clients').insert(rows).select('id')
```

**Anon+RLS vs service-role — recomendación: anon+RLS.** `[VERIFIED: skill supabase-multitenant-rls + export/create routes]`

| Criterio | anon+RLS (RECOMENDADO) | service-role acotado (booking) |
|----------|------------------------|-------------------------------|
| Aislamiento | RLS `with check` como red final + filtro `business_id` explícito | Solo el filtro manual; RLS no protege (bypass) |
| Consistencia con el repo | = `clients/create` y `export/clients` (dashboard autenticado) | = booking público (tenant por slug, no por sesión) |
| Riesgo | Menor: dos capas | Mayor: una sola capa; un bug de código = fuga |
| Cuándo | El actor ES el dueño autenticado (este caso) | El actor es anónimo (booking) — NO aplica acá |

El import lo ejecuta el dueño autenticado → **anon+RLS es el patrón correcto** (igual que el alta manual y el export). El service-role queda prohibido acá, exactamente como en `export/clients/route.ts`.

**Batch size + fallo parcial:**
- **Tamaño de lote:** 2.000 filas caben en un solo `.insert([...])` sin problema (PostgREST maneja inserts de miles de filas). Para robustez y para acotar el impacto de un error, **lotear de a ~500** es prudente pero **opcional**; un solo insert de ≤2.000 es aceptable para v1. **Recomendación:** un solo `.insert()` con todas las importables; si el planner quiere lotes, 500/lote.
- **Fallo parcial — best-effort por lote, NO transacción atómica:** PostgREST NO expone transacciones multi-statement desde `.insert()`. Un `.insert([...])` es atómico por-batch (si una fila viola una constraint, **todo el batch falla**). Dado que ya deduplicamos y validamos ANTES de insertar, las importables deberían insertar limpio. Estrategia recomendada: **insertar el batch; si falla, reportarlo en `fallidos` con el error de Postgres traducido** (patrón `insertErr?.code` del repo). Para v1 con validación+dedup previa, un fallo de insert es raro (ej. constraint de DB inesperada) → contarlo como `fallidos`, no romper todo el response. Si se lotea de a 500 y un lote falla, los otros lotes ya insertados quedan (best-effort). **Documentar esta semántica en el resumen** para que el dueño entienda "importados: 480 / fallidos: 20".

**Ajuste requerido a `buildClientInsert` (IMPORTANTE para el planner):** hoy `buildClientInsert` hardcodea `origin: 'manual'` (`lib/clients-create.ts` L56). El import necesita `origin: 'importado'`. Dos opciones:
1. **Parametrizar el origin:** `buildClientInsert(business, input, origin: 'manual'|'importado' = 'manual')`. Mínimo cambio, retro-compatible (default `'manual'` → `clients/create` no se toca). **RECOMENDADO.**
2. Construir el payload en `lib/clients-import.ts` sin reusar `buildClientInsert`, forzando `origin:'importado'`. Duplica la lógica del gate de obra social. NO recomendado.
El CHECK de migr.049 (`reserva|manual|importado`) acepta `'importado'` — no hace falta migración nueva. `[VERIFIED: lib/types.ts L178-179]`

### Pattern 6: Validación + dedup por fila (D-01, D-02)

**What:** Por cada fila parseada: normalizar → validar (reusar `validateClientBody`) → deduplicar (vs DB + intra-CSV) → clasificar.

```typescript
// Source: [VERIFIED: validateClientBody en lib/clients-create.ts + dedup en clients-client.tsx L260-269]

// 1) Índice de existentes (una sola query, filtrada por business_id de la sesión).
const { data: existing } = await supabase
  .from('clients').select('email, phone').eq('business_id', business.id)
const existingEmails = new Set<string>()
const existingPhones = new Set<string>()
for (const c of existing ?? []) {
  if (c.email) existingEmails.add(c.email.toLowerCase())
  if (c.phone) { const k = c.phone.replace(/\D/g, ''); if (k) existingPhones.add(k) }
}

// 2) Sets para dedup INTRA-CSV (dos filas iguales → una sola importable).
const seenEmails = new Set<string>()
const seenPhones = new Set<string>()

// 3) Clasificar cada fila.
for (const [i, raw] of rows.entries()) {
  const nombre = unescapeFormulaGuard((raw.nombre ?? '').trim())
  const telefono = (() => { const v = unescapeFormulaGuard((raw.telefono ?? '').trim()); return v || null })()
  const email = (() => { const v = unescapeFormulaGuard((raw.email ?? '').trim()); return v || null })()

  const invalid = validateClientBody({ name: nombre, phone: telefono, email })
  if (invalid) { errores.push({ row: i + 2, error: invalid }); continue } // +2: header + 1-indexado

  const emailKey = email?.toLowerCase() ?? null
  const phoneKey = telefono ? telefono.replace(/\D/g, '') : null

  const dupDB   = (emailKey && existingEmails.has(emailKey)) || (phoneKey && existingPhones.has(phoneKey))
  const dupCSV  = (emailKey && seenEmails.has(emailKey))     || (phoneKey && seenPhones.has(phoneKey))
  if (dupDB || dupCSV) { omitidos++; continue }

  if (emailKey) seenEmails.add(emailKey)
  if (phoneKey) seenPhones.add(phoneKey)
  importables.push({ nombre, telefono, email, notas: raw.notas, obra_social: raw.obra_social, nro_obra_social: raw.nro_obra_social })
}
```

**Edge cases (cubrir en el plan):**
- **Fila sin nombre o sin contacto** → `validateClientBody` devuelve `missing_fields` → va a `errores` (fila marcada en preview, SC-1).
- **Teléfono no numérico** (letras) → `isValidPhone` (dentro de `validateClientBody`) devuelve `invalid_phone`. OJO: `isValidPhone` acepta `+ ( ) - espacio` y dígitos; un teléfono con letras falla. `[VERIFIED: lib/clients-create.ts L24-28]`
- **Columnas extra vs header rígido** → ignoradas por `header:true` (solo se leen las claves conocidas). D-01.
- **Columna faltante** (ej. CSV sin `email`) → `raw.email` es `undefined` → tratado como sin email; si tampoco hay teléfono → `missing_fields`. Si falta una columna OBLIGATORIA del header rígido → rechazar con `invalid_header` (Pattern 2).
- **Fila con solo comas / vacía** → `skipEmptyLines: 'greedy'` la descarta antes.
- **Números de fila en los errores:** reportar `row = índice + 2` (header ocupa la fila 1; papaparse es 0-indexado tras header) para que el mensaje matchee lo que el dueño ve en Excel.
- **Notas largas:** el alta manual trunca a 1000 chars (`.slice(0,1000)`). Replicar en el import para consistencia.

### Anti-Patterns to Avoid

- **Parsear en el cliente y confiar en eso para el insert:** viola D-03. El cliente puede manipular la preview; confirm SIEMPRE re-parsea el archivo crudo.
- **Aceptar `business_id`/`origen` desde el CSV:** viola D-01/D-03/SC-2. `business_id` = sesión; `origin='importado'` forzado.
- **Service-role para el batch insert:** el actor es el dueño autenticado → anon+RLS. Service-role sería quitar la red de RLS sin motivo.
- **Stash server-side del archivo entre preview y confirm:** frágil en Vercel Hobby (instancias efímeras). Re-upload stateless.
- **Insertar sin deduplicar/validar primero:** un fallo de batch por una fila mala mataría todas. Filtrar antes.
- **Split por coma en vez de papaparse:** se rompe con las comillas RFC4180 del export.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parseo CSV (comillas, comas embebidas, saltos de línea, BOM) | Parser manual con `split(',')` / regex | `papaparse` | RFC4180 tiene decenas de edge cases (comillas escapadas `""`, saltos dentro de campos entre comillas, BOM). El export los usa. Un parser naíf falla el round-trip. |
| Validación nombre + contacto + teléfono | Nueva validación | `validateClientBody`/`isValidPhone` (`lib/clients-create.ts`) | Ya existe, ya testeada, ya es el criterio del alta manual (D-01 lo exige igual). |
| Criterio de dedup | Nuevo criterio | Lógica de `clients-client.tsx` L260-269 (email lowercase + phone digits) | D-02 lo lockea. Reusar exacto evita divergencia con "Fusionar duplicados". |
| Construcción del insert + gate obra social | Objeto manual | `buildClientInsert` (parametrizando `origin`) | Ya maneja el gate de `insurance_*` por vertical (T-02-08). |
| Recepción multipart | Parser de multipart manual | `request.formData()` (Web API nativa, Next 16) | Nativo del runtime; cero deps. |

**Key insight:** el 80% de esta fase es **reuso** de código ya escrito y testeado (validación, dedup, insert, escaping del export). La parte genuinamente nueva es (a) el upload multipart y (b) el pipeline de clasificación por fila. Todo lo "delicado" (aislamiento, formula injection) ya tiene su patrón resuelto en el repo — el import solo debe respetarlo, no reinventarlo.

## Common Pitfalls

### Pitfall 1: El BOM del export corrompe la primera columna
**What goes wrong:** El export emite el BOM UTF-8 (`U+FEFF`) antes del header. Si el BOM no se strippea, la primera clave del objeto parseado es `﻿nombre` en vez de `nombre` → `raw.nombre` es `undefined` → TODAS las filas fallan por `missing_fields`.
**Why it happens:** papaparse strippea el BOM con `header:true`, pero conviene el guard explícito por si cambia el flag o la versión.
**How to avoid:** `text.replace(/^﻿/, '')` antes de `Papa.parse`, y `transformHeader: h => h.trim().toLowerCase()`. Test: importar un archivo generado por el export real de la Fase 2.
**Warning signs:** preview muestra 100% de filas con error `missing_fields` aunque el CSV se ve bien en Excel.

### Pitfall 2: Asumir estado compartido entre preview y confirm
**What goes wrong:** Guardar el parseo en memoria del server en preview y leerlo en confirm → en Vercel el confirm cae en otra instancia → estado ausente → import vacío o crash.
**Why it happens:** funciones serverless efímeras, sin afinidad de instancia. `[CITED: vercel.com/docs/functions/limitations]`
**How to avoid:** stateless (re-upload). Retener el `File` en React state del browser y re-postearlo en confirm.
**Warning signs:** funciona en `next dev` (una instancia) y falla en producción.

### Pitfall 3: El prefijo `'` anti-fórmula se acumula en cada round-trip
**What goes wrong:** No des-escapar el `'` líder en el import → un nombre `=X` se guarda como `'=X`, el próximo export lo hace `''=X`, y así (o al menos queda `'=X` permanente).
**Why it happens:** el export defiende contra Excel prefijando `'`; el import debe revertirlo (Pattern 3).
**How to avoid:** `unescapeFormulaGuard` (quita UN `'` solo si el siguiente char es `= + - @ \t \r`). Test de round-trip con `=X`.
**Warning signs:** clientes importados con `'` espurio al inicio del nombre/notas.

### Pitfall 4: El proxy trunca el body en silencio si se sube el tope
**What goes wrong:** Si algún día se sube el cap de 2 MB por encima de 10 MB sin ajustar `proxyClientMaxBodySize`, el proxy entrega un body PARCIAL sin error → el CSV llega cortado → últimas filas se pierden sin aviso.
**Why it happens:** `proxyClientMaxBodySize` default 10MB trunca sin fallar. `[CITED: proxyClientMaxBodySize.md]`
**How to avoid:** mantener el cap en 2 MB (muy por debajo). Si se sube, subir también `proxyClientMaxBodySize` Y recordar que Vercel corta a 4.5 MB de todos modos.
**Warning signs:** imports grandes pierden filas del final sin error.

### Pitfall 5: `buildClientInsert` fuerza `origin:'manual'`
**What goes wrong:** reusar `buildClientInsert` tal cual → los importados quedan con badge "Manual" en vez de "Importado" → falla SC-4.
**Why it happens:** el helper hardcodea `origin:'manual'` (L56).
**How to avoid:** parametrizar `origin` con default `'manual'` (retro-compatible). Ver Pattern 5.
**Warning signs:** clientes importados muestran badge "Manual".

## Runtime State Inventory

> No aplica en el sentido de rename/refactor, pero se documenta el estado runtime que el import toca:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Tabla `clients` (Postgres/Supabase), columna `origin` (migr.049 ya en prod). El import escribe filas nuevas con `origin='importado'`. | Ninguna migración nueva — solo consume la columna existente. `[VERIFIED: lib/types.ts + REQUIREMENTS.md]` |
| Live service config | Ninguna. El import no toca n8n, cron, ni integraciones externas. | None — verificado. |
| OS-registered state | Ninguna. | None. |
| Secrets/env vars | Ninguna nueva. Usa la sesión Supabase existente (anon key + cookies). | None. |
| Build artifacts | `package.json` + `package-lock.json` cambian al instalar `papaparse` (a diferencia de Fases 1 y 2, cero-deps). | `npm install` → commitear ambos lockfiles. |

## Common Operations (Code Examples)

### Resumen post-confirm (SC-4)
```typescript
// Source: [VERIFIED: patrón Response.json del repo]
return Response.json({
  ok: true,
  resumen: {
    importados: insertedCount,   // filas efectivamente insertadas
    omitidos: omitidos,          // duplicados (vs DB o intra-CSV) — D-02
    fallidos: errores.length,    // filas con error de validación (nombre/contacto/teléfono)
  },
})
```

### Shape de la preview (SC-1)
```typescript
return Response.json({
  ok: true,
  preview: {
    total: rows.length,
    importables: importables.length,
    duplicadas: omitidos,
    errores: errores, // [{ row: 5, error: 'missing_fields' }, ...] → la UI marca esas filas
  },
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| API Routes (`pages/api`) con `bodyParser` config | Route Handlers (`app/api/.../route.ts`) con Web `Request`/`formData()` | Next 13+ App Router | No hay `export const config = { api: { bodyParser } }`; se usa `request.formData()` directo. `[CITED: route-handlers.md]` |
| `middleware.ts` | `proxy.ts` (Next 16) | Next 16 | El middleware se llama `proxy.ts`; bufferea el body de `/api/*`. `[VERIFIED: proxy.ts + convenciones-forjo]` |
| Timeout Hobby 10s | 60s (300s con Fluid Compute) | 2024-2025 | 2.000 filas caben holgado; sin necesidad de async/cola en v1. `[CITED: vercel.com/docs/functions/limitations]` |

**Deprecated/outdated:**
- NO usar `export const config = { api: { bodyParser: false } }` — es de `pages/api`, no aplica a route handlers.
- NO usar el runtime Edge para estos handlers (usan Supabase + parseo; el runtime Node por defecto es correcto).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | papaparse strippea el BOM automáticamente con `header:true`. | Pattern 2 | Bajo — mitigado con el guard explícito `replace(/^﻿/,'')` recomendado. Si el guard está, es irrelevante. |
| A2 | Un `.insert([...])` de ≤2.000 filas es atómico por-batch y no supera 60s en Hobby. | Pattern 5 | Bajo — inserts de miles de filas son rutina en PostgREST; el timeout de 60s da margen enorme. Verificable con un test de carga de 2.000 filas. |
| A3 | El mimetype de un CSV es inconsistente entre navegadores/Excel-AR (por eso el guard va por extensión `.csv`). | Pattern 1 | Bajo — chequear extensión es la práctica robusta; si se quiere, aceptar también `text/csv`/`application/vnd.ms-excel`. |

**Nota:** los hechos de plataforma (4.5MB cap, 60s Hobby, proxy 10MB truncation) están CITADOS/VERIFICADOS, no asumidos. Los tres assumptions arriba son de bajo riesgo y todos tienen mitigación o test asociado.

## Open Questions

1. **¿Lote único o lotes de 500 para el insert?**
   - What we know: 2.000 filas caben en un `.insert()` único sin timeout.
   - What's unclear: si el planner prefiere lotes para acotar el blast-radius de un fallo de batch.
   - Recommendation: lote único para v1 (más simple); documentar que un fallo de insert cuenta como `fallidos`. Lotes de 500 si se quiere granularidad — decisión de plan, no bloqueante.

2. **¿`checkpoint:human-verify` antes del `npm install papaparse`?**
   - What we know: usuario ya aprobó la dep en D-05; el seam la marca `SUS` solo por `too-new` (falso positivo).
   - What's unclear: si el protocolo del proyecto exige el checkpoint igual.
   - Recommendation: opcional. El approval de D-05 + la legitimidad confirmada (mholt/PapaParse, 11.5M dl/sem) satisfacen el gate. Pin `@5.5.4`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `papaparse` (npm) | Parseo CSV | ✗ (a instalar) | 5.5.4 | Sin fallback — es la dep aprobada (D-05). `npm install papaparse@5.5.4` |
| `@types/papaparse` (npm) | Tipos TS | ✗ (a instalar) | 5.5.2 | — |
| Next.js `request.formData()` | Upload multipart | ✓ | 16.2.7 (Web API nativa) | — |
| Supabase anon+RLS (`@/lib/supabase/server`) | Insert autenticado | ✓ | ya en repo | — |
| `lib/clients-create.ts` (validate/insert) | Validación + insert | ✓ | in-repo | — |

**Missing dependencies with no fallback:** `papaparse` + `@types/papaparse` — instalación aprobada (D-05); no es blocker, es un paso de setup.

## Security Domain

> `security_enforcement` habilitado (asumido; no hay `false` explícito en config). Esta es la fase de mayor superficie de riesgo del milestone.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `auth.getUser()` gate → 401 sin sesión (patrón del repo). |
| V4 Access Control | **yes (crítico)** | `business_id` de sesión (`owner_id`), NUNCA del CSV. Anon+RLS `with check` + filtro explícito = defensa en profundidad. `[skill supabase-multitenant-rls]` |
| V5 Input Validation | **yes (crítico)** | `validateClientBody`/`isValidPhone` por fila; papaparse para el parseo; guard de tamaño/tipo antes de parsear. |
| V6 Cryptography | no | No aplica (no se manejan secretos nuevos). |
| V12 File Upload | **yes** | Guard `file.size ≤ 2MB` + extensión `.csv` antes de parsear; Vercel corta a 4.5MB (413). No se persiste el archivo (solo se parsea en memoria). |

### Known Threat Patterns for {Next 16 route handler + Supabase multi-tenant + CSV upload}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| **CSV con `business_id`/`origen` ajeno para escribir en otro tenant** | Elevation of Privilege / Tampering | `business_id` = sesión (`owner_id`); `origin='importado'` forzado server-side. El CSV NO aporta ninguno. RLS `with check` como red final. **(SC-2, el threat central de la fase.)** |
| **File upload abuse: archivo gigante (DoS por memoria/CPU)** | Denial of Service | Guard `file.size ≤ 2MB` ANTES de leer/parsear; Vercel corta a 4.5MB (413); Hobby 60s de timeout acota el peor caso. |
| **Zip-bomb / expansión: CSV con millones de filas en pocos MB** | Denial of Service | Tope de ~2.000 filas: tras parsear, si `rows.length > 2000` → rechazar con `too_many_rows` antes de dedup/insert. El cap de 2MB ya limita el conteo real. |
| **CSV formula injection en los VALORES almacenados** (se muestran en el panel y se re-exportan) | Tampering (payload de fórmula persistido) | El valor se almacena tal cual (des-escapado del `'` del export, Pattern 3); la defensa se re-aplica en cada EXPORT (`esc()` de la Fase 2 prefija `'`). En la UI del panel los valores se renderizan como texto (React escapa por default) — NO como fórmula. La defensa vive en la capa de SALIDA (export/render), no en el almacenamiento. |
| **Preview manipulada por el cliente para colar filas inválidas** | Tampering | Confirm RE-PARSEA + RE-VALIDA el archivo crudo (D-03); la preview del cliente no es autoritativa. |
| **CSV malformado que crashea el parser** | Denial of Service | papaparse es tolerante (reporta errores por fila en `result.errors`, no tira); `try/catch` alrededor de `formData()` y del parseo. |
| **Inyección de columnas extra / header falso** | Tampering | Header rígido validado contra `result.meta.fields` (D-01); columnas extra ignoradas; `origin` del CSV ignorado. |

**Nota de seguridad clave:** el `'` anti-fórmula es una defensa de **presentación en Excel/Sheets**, no de almacenamiento. Almacenar el valor des-escapado (Pattern 3) es correcto Y seguro porque (a) React escapa el render en el panel y (b) el export vuelve a aplicar `esc()`. Almacenar `'=X` sería incorrecto (corrompe el dato) sin ganar seguridad.

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — Web Request/Response API en route handlers Next 16; `request.formData()` nativo, sin config.
- `node_modules/next/dist/docs/.../proxyClientMaxBodySize.md` — proxy bufferea body de `/api/*`, default 10MB, trunca en silencio.
- `node_modules/next/dist/docs/.../maxDuration.md` — config de duración por route segment.
- `app/api/export/clients/route.ts` — contrato de round-trip (header, `esc()` RFC4180, prefijo `'` anti-fórmula, BOM).
- `app/api/clients/create/route.ts` + `lib/clients-create.ts` — patrón de alta anon+RLS, `validateClientBody`, `isValidPhone`, `buildClientInsert`.
- `app/(dashboard)/clients/clients-client.tsx` L260-269 — criterio de dedup (email lowercase + phone digits).
- `app/api/booking/create/route.ts` — patrón service-role (contraste, NO usar acá).
- `.claude/skills/supabase-multitenant-rls/SKILL.md`, `.claude/skills/convenciones-forjo/SKILL.md` — reglas de aislamiento y stack.

### Secondary (MEDIUM confidence)
- [vercel.com/docs/functions/limitations](https://vercel.com/docs/functions/limitations) — 4.5MB body cap (413 FUNCTION_PAYLOAD_TOO_LARGE), 60s Hobby (300s Fluid Compute).
- npm registry — `papaparse@5.5.4` (mod 2026-06-19), `@types/papaparse@5.5.2` (verificado 2026-07-06 vía `npm view`).

### Tertiary (LOW confidence)
- Ninguna. Todos los hechos de plataforma y librería están verificados contra docs o registro.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — papaparse verificado en registro + aprobado (D-05); todo lo demás ya en repo.
- Architecture: HIGH — patrones derivados del código existente del repo (export/create/booking) y de las docs Next 16 locales.
- Upload/limits: HIGH — límites de Vercel citados de docs oficiales; comportamiento del proxy citado de docs locales.
- Pitfalls: HIGH — cada pitfall tiene raíz en código verificado (BOM del export, `origin` hardcodeado, proxy truncation).
- Security: HIGH — threat model derivado de las decisiones lockeadas + skill de multi-tenancy.

**Research date:** 2026-07-06
**Valid until:** ~2026-08-05 (30 días; stack estable). Re-verificar `papaparse` si sale una major nueva.
