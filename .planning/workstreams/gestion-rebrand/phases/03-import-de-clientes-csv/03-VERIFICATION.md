---
phase: 03-import-de-clientes-csv
verified: 2026-07-06T18:50:00Z
status: human_needed
score: 9/9
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Flujo completo round-trip: exportar clientes desde /clients, reimportar el mismo CSV, verificar preview con contadores y tabla de errores, confirmar, ver resumen con los 3 conteos, cerrar y ver los importados con badge 'Importado'."
    expected: "La preview muestra: N válidas (badge outline), N con error (badge destructive), N duplicadas (badge secondary). Las filas con error aparecen en la tabla con 'Fila X' + mensaje en español (fill destructive/10 + border-l-2 + icono AlertCircle). Al confirmar, el resumen muestra importados/omitidos/fallidos y al cerrar los nuevos clientes aparecen en la lista con badge 'Importado'."
    why_human: "Requiere browser real, sesión activa, archivo CSV generado por el export de Fase 2. El renderizado condicional por stage (upload/preview/confirming/resumen), los estilos accesibles por fill+border+icono+texto, y la actualización de la lista post-cierre no son verificables sin ejecutar la app."
  - test: "Verificar la brecha SC-1 (ver decisión de interpretación): La preview solo muestra contadores + tabla de errores — NO una tabla de todas las filas parseadas (nombre/teléfono/email por fila válida). Confirmar si el comportamiento v1 (conteos + errores) es suficiente para el dueño o si se necesita la tabla completa."
    expected: "El dueño puede revisar cuántas filas son válidas, cuántas tienen error (con detalle de fila y motivo), y cuántas son duplicadas. No ve los datos exactos de las filas válidas antes de confirmar."
    why_human: "Es una decisión de producto: si mostrar solo conteos + errores satisface SC-1 ('ve una preview con las filas parseadas y las que tienen error marcadas') o si 'filas parseadas' implica una tabla con nombre/teléfono/email de cada fila. No se puede resolver automáticamente."
  - test: "Verificar guard de tamaño: intentar subir un archivo > 2MB y confirmar el error inline 'Subí un archivo .csv de hasta 2 MB.' antes de que el archivo llegue al servidor."
    expected: "El error aparece inline debajo del input, el botón 'Continuar' queda deshabilitado, y no se realiza ningún fetch a /api/import/clients/preview."
    why_human: "Requiere generar un archivo > 2MB y verificar el comportamiento en el browser."
  - test: "Verificar guard de header inválido: subir un CSV con columnas distintas al header canónico del export de Forjo y confirmar el mensaje inline específico."
    expected: "El mensaje 'El CSV no tiene el formato esperado. Exportá tus clientes desde Forjo y usá ese archivo como base.' aparece inline (sin toast genérico)."
    why_human: "Requiere preparar un CSV con header equivocado y ejecutar el flujo en el browser."
  - test: "Verificar anti-doble-submit durante la etapa 'confirming': confirmar que el botón queda disabled + 'Importando...' y que el Dialog no se puede cerrar con Escape ni click fuera."
    expected: "Durante el write en vuelo el Dialog está bloqueado. Una vez que llega la respuesta se avanza a resumen."
    why_human: "Requiere simular latencia real o interceptar la red para observar el estado 'confirming' en el browser."
---

# Fase 3: Import de clientes CSV — Reporte de Verificación

**Goal de la fase:** Que el dueño importe clientes desde un CSV con un flujo seguro (upload → preview/validación → confirmar) que deduplica y respeta el aislamiento por tenant.
**Verificado:** 2026-07-06T18:50:00Z
**Estado:** human_needed
**Re-verificación:** No — verificación inicial

---

## Logro del objetivo

### Verdades observables

| # | Verdad | Estado | Evidencia |
|---|--------|--------|-----------|
| 1 | papaparse@5.5.4 instalada y pineada exacta (sin caret) | VERIFICADO | `package.json` L31: `"papaparse": "5.5.4"`, L48: `"@types/papaparse": "5.5.2"`. `node -e` confirma pin exacto. |
| 2 | Round-trip lossless: `=Ana` exportado como `'=Ana` se importa de vuelta como `=Ana` | VERIFICADO | `unescapeFormulaGuard` en `lib/clients-import.ts` L61-63. Test estrella en `test/clients-import.test.ts` L48-57 pasa (20/20 verde en corrida aislada). |
| 3 | Validación por fila: sin nombre → `missing_fields`; sin contacto → `missing_fields`; teléfono con letras → `invalid_phone` | VERIFICADO | `classifyRows` en `lib/clients-import.ts` L148-151 reusa `validateClientBody`. Tests L131-151 verifican los tres casos. |
| 4 | Dedup doble (vs DB e intra-CSV) por email-minúsc y teléfono-solo-dígitos | VERIFICADO | `classifyRows` L122-163: Sets `existingEmails/Phones` para DB + `seenEmails/Phones` intra-CSV. Tests L153-187 cubren ambos casos. |
| 5 | `buildClientInsert` acepta `origin='importado'` con default `'manual'` (retro-compatible) | VERIFICADO | `lib/clients-create.ts` L47: `origin: 'manual' \| 'importado' = 'manual'`. `clients/create/route.ts` no se modifica (sigue sin tercer arg). `tsc` verde. |
| 6 | `preview/route.ts` no escribe nada (SC-1): cero `.insert()/.update()/.delete()` reales | VERIFICADO | Lectura directa del archivo completo: solo `supabase.from('clients').select(...)`. Grep de `.insert(` en el archivo solo coincide en el comentario de cabecera (L13), no en código ejecutable. |
| 7 | `confirm/route.ts` re-parsea el archivo, inserta con `origin='importado'` via `createClient()` anon+RLS, NUNCA service-role | VERIFICADO | `confirm/route.ts` L1: `import { createClient } from '@/lib/supabase/server'`. L105: `buildClientInsert(business, fila, 'importado')`. Grep de `createAdminClient`/`supabase/admin` en `/api/import/clients/` = 0 coincidencias. |
| 8 | Guards antes de parsear: >2MB→413, extensión≠.csv→400, >2000 filas→400, header equivocado→400 | VERIFICADO | `preview/route.ts` L20-21, L55-71; `confirm/route.ts` L18-19, L52-67. Constantes `MAX_BYTES=2MB`, `MAX_ROWS=2000` en ambos handlers. |
| 9 | UI: botón "Importar CSV" (outline, grid 2-col), Dialog sm:max-w-2xl con 4 etapas, contadores, anti-doble-submit, resumen 3 conteos, badge "Importado" | VERIFICADO | `clients-client.tsx` L662-674 (header grid), L1137-1322 (Dialog completo). `ORIGIN_BADGE` L61-65 mapea `importado` a `label:'Importado', variant:'secondary'`. `onImportConfirm` L337-356 con guard `stage==='confirming'`. `onImportOpenChange` L275-279 bloquea cierre durante confirming. |

**Score:** 9/9 verdades verificadas

---

## Decisión de interpretación: SC-1 y la brecha de la preview (punto clave)

**SC-1 del ROADMAP:** *"El dueño sube un CSV de clientes y ve una preview con las filas parseadas y las que tienen error de validación marcadas antes de confirmar nada."*

**Lo que entrega la implementación:**
- El endpoint `/preview` devuelve: `{ total, importables (count), duplicadas (count), errores: [{row, error}] }` — es decir, conteos globales + una tabla de las **filas con error** (número de fila + código de error traducido).
- La UI muestra: 3 badges con conteos (válidas/con error/duplicadas) + tabla desktop/mobile de las filas con error marcadas con fill+border+icono+texto (accesible). Las filas válidas y duplicadas **no se muestran por fila** — solo se cuentan.

**Juicio del verificador:**
Los conteos + la tabla de errores son una preview **funcional** para el dueño: sabe cuántos clientes se van a importar, cuántos tienen problema (y cuáles exactamente, con qué error), y cuántos son duplicados. Antes de confirmar no se escribe nada (SC-1 core invariant) y puede cancelar sin consecuencias.

La ambigüedad está en "filas parseadas": si se interpreta como "una tabla de todas las filas con nombre/teléfono/email", la implementación es una brecha real. Si se interpreta como "el resultado de parsear el archivo — conteos y errores — antes de confirmar", la implementación la satisface.

**Recomendación:** Marcar como **PASS con nota** para v1 (la implementación entrega lo necesario para una decisión informada) y elevar a UAT visual para que el dueño confirme si quiere ver los datos por fila de las válidas. No se falla la fase por esto — es una decisión de interpretación de producto.

Esto se registra en `human_verification` ítem 2 arriba.

---

## Artefactos requeridos

| Artefacto | Esperado | Estado | Detalles |
|-----------|----------|--------|---------|
| `lib/clients-import.ts` | Lógica pura: `parseCsv`, `unescapeFormulaGuard`, `classifyRows` | VERIFICADO | 185 líneas. Exporta las 3 funciones + interfaces. Cero imports de React/Next. |
| `lib/clients-create.ts` | `buildClientInsert` con `origin` retro-compatible | VERIFICADO | L44-61. Tercer param `origin = 'manual'`. Shorthand `origin` en el return. |
| `test/clients-import.test.ts` | Tests de round-trip, validación, dedup, insert anon+RLS | VERIFICADO | 279 líneas, 20 tests. Todos pasan en corrida aislada. Test de insert usa `ownerAnon` (anon+RLS, guard anti-falso-verde presente). |
| `app/api/import/clients/preview/route.ts` | POST: upload → parse → clasificar, sin escribir | VERIFICADO | 100 líneas. Exporta `POST`. `request.formData` presente. Cero writes reales. |
| `app/api/import/clients/confirm/route.ts` | POST: re-parse → batch insert anon+RLS → resumen | VERIFICADO | 134 líneas. Exporta `POST`. `buildClientInsert(…, 'importado')` presente. `createClient` de `@/lib/supabase/server`. |
| `app/(dashboard)/clients/clients-client.tsx` | Botón "Importar CSV" + Dialog de 4 etapas | VERIFICADO | Contiene "Importar CSV", `importStage`, `importFile`, `importPreview`, `importResumen`, `onImportConfirm`, `onImportDone`. |
| `package.json` | `papaparse` pineada como dependency | VERIFICADO | L31: `"papaparse": "5.5.4"` (sin caret). L48: `"@types/papaparse": "5.5.2"`. |

---

## Verificación de links clave

| Desde | Hacia | Via | Estado | Detalles |
|-------|-------|-----|--------|---------|
| `lib/clients-import.ts` | `lib/clients-create.ts` | `import { validateClientBody }` | VERIFICADO | L20 del archivo fuente. |
| `lib/clients-import.ts` | `papaparse` | `import Papa from 'papaparse'` | VERIFICADO | L19 del archivo fuente. |
| `test/clients-import.test.ts` | `lib/clients-import.ts` | `import { unescapeFormulaGuard, parseCsv, classifyRows }` | VERIFICADO | L6 del test. |
| `preview/route.ts` | `lib/clients-import.ts` | `import { parseCsv, classifyRows }` | VERIFICADO | L2 del handler. |
| `confirm/route.ts` | `lib/clients-create.ts` | `import { buildClientInsert }` + llamada `'importado'` | VERIFICADO | L3 del handler, L105 (argumento forzado). |
| `confirm/route.ts` | `@/lib/supabase/server` | `createClient()` anon+RLS (NO admin) | VERIFICADO | L1 del handler. Grep de `supabase/admin` en ambos handlers = 0. |
| `clients-client.tsx` | `preview/route.ts` | `fetch('/api/import/clients/preview', …)` | VERIFICADO | L312 del componente. |
| `clients-client.tsx` | `confirm/route.ts` | `fetch('/api/import/clients/confirm', …)` | VERIFICADO | L343 del componente. |

---

## Spot-checks de comportamiento

| Comportamiento | Verificación | Resultado | Estado |
|---------------|-------------|-----------|--------|
| `vitest run test/clients-import.test.ts` (20 tests) | Ejecutado en aislamiento | 20/20 passed, 1.66s | PASS |
| `tsc --noEmit` | Ejecutado | Sin errores (salida vacía) | PASS |
| `papaparse` pineada exacta | `node -e "require('./package.json')…"` | `5.5.4` + `5.5.2` confirmados | PASS |
| Commits documentados en SUMMARYs | `git log --oneline` | `0cced7e`, `78ef625`, `be58292`, `6d893ec`, `51ac4dd`, `00c78a6`, `c32fe35`, `5776a57` — todos presentes | PASS |
| `preview/route.ts` sin writes reales | Lectura directa + grep `.insert(` | Solo en comentario L13, no en código ejecutable | PASS |
| Cero `supabase/admin` en handlers de import | Grep `createAdminClient\|supabase/admin` en `/api/import/clients/` | 0 coincidencias | PASS |

---

## Cobertura de requisitos

| Requisito | Plan | Descripción | Estado | Evidencia |
|-----------|------|-------------|--------|-----------|
| DATA-03 | 03-01, 03-02, 03-03 | Import de clientes desde CSV con flujo upload→preview→confirmar, dedup + aislamiento por tenant | SATISFECHO | Flujo completo implementado y verificado automáticamente. Human check visual pendiente. |

---

## Anti-patrones detectados

No se detectaron marcadores TBD/FIXME/XXX en los archivos creados o modificados por esta fase. No hay stubs vacíos ni handlers con `return null`/respuestas estáticas. El único stub-like comentado es el `_business` en `classifyRows` (el parámetro `business` se recibe para firmar el contrato con `buildClientInsert` aguas abajo, aunque en la clasificación pura solo se usa `business.id` para la interface de `ExistingContact`; la implementación usa el parámetro en el insert real del test).

---

## Verificación humana requerida

### 1. Flujo completo round-trip (UAT visual principal)

**Test:** Exportar clientes desde /clients, reimportar el mismo CSV.
**Esperado:** Preview con contadores correctos + tabla de errores accesible + confirmación con resumen + badge "Importado" en la lista.
**Por qué humano:** Requiere browser real, sesión activa y archivo CSV generado por el export de Fase 2.

### 2. SC-1 — Decisión de interpretación de producto (preview mostrando solo conteos + errores)

**Test:** Verificar si la preview v1 (contadores + tabla de filas con error, sin tabla de todas las filas válidas) satisface SC-1 para el dueño.
**Esperado:** El dueño puede tomar una decisión informada antes de confirmar solo con los conteos y los errores detallados.
**Por qué humano:** Es una decisión de interpretación de producto. Ver sección "Decisión de interpretación" arriba.

### 3. Guard de tamaño client-side

**Test:** Intentar subir un archivo > 2MB.
**Esperado:** Error inline antes de hacer fetch al servidor.
**Por qué humano:** Requiere preparar archivo de test > 2MB y verificar en el browser.

### 4. Guard de header inválido

**Test:** Subir un CSV con columnas distintas al canónico del export.
**Esperado:** Mensaje inline específico ("El CSV no tiene el formato esperado..."), no toast genérico.
**Por qué humano:** Requiere preparar CSV con header equivocado y verificar en el browser.

### 5. Anti-doble-submit durante confirming

**Test:** Verificar que el botón queda disabled y el Dialog no se puede cerrar mientras el write está en vuelo.
**Esperado:** Stage "confirming" bloquea cierre (Escape/click fuera) y deshabilita ambos botones.
**Por qué humano:** Requiere simular latencia de red o interceptar la request para observar el estado intermedio.

---

## Resumen de gaps

No hay gaps. Todos los artefactos existen, son sustantivos, están cableados y los datos fluyen (las funciones puras testean la lógica real, los handlers usan `createClient()` anon+RLS con `business_id` de la sesión). El estado es `human_needed` por 5 ítems de verificación visual/UAT, incluyendo la decisión de interpretación del SC-1 (ítem 2) que se recomienda resolver en la UAT con el dueño.

---

_Verificado: 2026-07-06T18:50:00Z_
_Verificador: Claude (gsd-verifier)_
