---
phase: 02-alta-manual-exports-csv
verified: 2026-07-06T12:00:00Z
status: human_needed
score: 9/9
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Crear un cliente manual y verificar que el badge 'Manual' aparece en la lista al instante"
    expected: "El Dialog 'Nuevo cliente' se abre, al guardar el cliente aparece prepended en la lista con el badge 'Manual' (variant=default, fondo primario). Clientes preexistentes muestran badge 'Reserva' (outline)."
    why_human: "Comportamiento visual runtime (badge renderizado) y prepend optimista con estado React — el código está wired pero el resultado visual no puede confirmarse sin ejecutar la app."
  - test: "Verificar gating de obra social: en vertical salud el Dialog muestra los campos Obra social / N° de afiliado; en otros verticales NO aparecen"
    expected: "En un negocio con vertical='salud' el alta muestra los campos. En general/belleza/canchas, los campos están ocultos del form (isSalud=false) y el server también los ignora."
    why_human: "Lógica condicional por vertical que depende del tipo del negocio del usuario en sesión — requiere probar con negocios de tipos distintos en la app real."
  - test: "Descargar el CSV de clientes y abrir en Excel-AR (con acentos/comillas/comas en campos)"
    expected: "El CSV abre correctamente en Excel, columnas separadas, acentos legibles (BOM UTF-8), header exacto nombre,telefono,email,origen,notas,obra_social,nro_obra_social, solo filas del propio negocio."
    why_human: "Compatibilidad con Excel-AR (locale/separador) requiere abrir el archivo manualmente. Verificación de acentos y formato de columnas no puede hacerse con grep."
  - test: "Descargar el CSV de finanzas y verificar contenido con acentos, tres tipos de movimientos"
    expected: "El CSV abre en Excel, header fecha,tipo,concepto,monto, filas de turnos/ventas/egresos mezcladas y ordenadas por fecha descendente, montos calculados correctamente (ventas = amount*quantity), sin fixed_expenses."
    why_human: "Verificar que las tres fuentes se combinan correctamente y los montos son coherentes requiere datos reales del negocio de prueba."
  - test: "Verificar que ambos botones 'Exportar CSV' disparan la descarga y que son visualmente secundarios (outline, no primary)"
    expected: "El botón de Clientes (a[download]) y el de Finanzas (Button onClick) disparan la descarga del archivo. Ambos visualmente outline, no azul/primario."
    why_human: "Verificación visual de la apariencia de los botones y el trigger de descarga en browser."
---

# Fase 02: Alta Manual + Exports CSV — Informe de Verificación

**Goal de la fase:** Que el dueño pueda cargar un cliente que no vino por reserva y distinguir el origen de cada cliente, y llevarse sus datos (clientes y finanzas) en CSV — CRUD de bajo riesgo que además introduce la columna de origen que la Fase 3 (import) va a consumir.
**Verificado:** 2026-07-06
**Estado:** human_needed (9/9 automatizables verificados; 5 items de UAT visual pendientes)
**Re-verificación:** No — verificación inicial

---

## Logro del Goal

### Truths Observables

| # | Truth | Estado | Evidencia |
|---|-------|--------|-----------|
| 1 | La tabla clients tiene columna origin con default 'reserva' que backfillea filas existentes | VERIFICADO | `049_clients_origin.sql` línea 35: `ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'reserva' CHECK (origin IN ('reserva','manual','importado'))` |
| 2 | El type Client de TS incluye origin como union literal reserva\|manual\|importado | VERIFICADO | `lib/types.ts` L179: `origin: 'reserva' \| 'manual' \| 'importado'` (no opcional, sin `\| null`) |
| 3 | schema.sql refleja la columna origin con default y CHECK | VERIFICADO | `supabase/schema.sql` líneas 391-392: `"origin" "text" DEFAULT 'reserva'::"text" NOT NULL, CONSTRAINT "clients_origin_check" CHECK (...)` |
| 4 | El endpoint POST /api/clients/create usa anon+RLS, deriva business_id de la sesión, fija origin='manual' server-side | VERIFICADO | `route.ts` importa `createClient` de `@/lib/supabase/server` (no admin); `lib/clients-create.ts` L47: `origin: 'manual'` hardcoded; business_id = `business.id` resuelto por `owner_id` (L29-31 del route) |
| 5 | El cliente aparece en la lista al instante con badge 'Manual' (SC-1 + SC-2) | VERIFICADO (wiring) | `clients-client.tsx` L213: `setClients(prev => [body.client as Client, ...prev])`; L642-643: `<Badge variant={ORIGIN_BADGE[client.origin].variant}>` con `ORIGIN_BADGE` mapeando `manual→default`, `reserva→outline`, `importado→secondary` |
| 6 | El dueño exporta su lista de clientes a CSV solo de su negocio (DATA-01) | VERIFICADO | `app/api/export/clients/route.ts`: auth gate + `.eq('business_id', business.id)` (L50); header `nombre,telefono,email,origen,notas,obra_social,nro_obra_social` (L57); BOM `'﻿'` (L78); RFC4180 `esc` (L54); `Response` crudo `text/csv; charset=utf-8` |
| 7 | El dueño exporta sus finanzas (turnos+ventas+egresos) a CSV solo de su negocio (DATA-02) | VERIFICADO | `app/api/export/finances/route.ts`: tres queries con `.eq('business_id', business.id)`; header `fecha,tipo,concepto,monto` (L101); tres fuentes combinadas (appointments L46-51, manual_sales L52-55, expenses L56-59); `fixed_expenses` excluidas con comentario explicando el por qué |
| 8 | Ambos endpoints re-derivan business_id de la sesión — ningún dato de otro tenant | VERIFICADO | Export clients: business resuelto por `owner_id` (L39-44), sin querystring. Export finances: mismo patrón (L36-42). `grep supabase/admin` vacío en ambos archivos. |
| 9 | Cero dependencias nuevas | VERIFICADO | `git diff main...HEAD -- package.json` sin output — package.json no cambió |

**Puntuación:** 9/9 truths verificadas

---

## Artefactos Requeridos

| Artefacto | Esperado | Estado | Detalle |
|-----------|----------|--------|---------|
| `supabase/migrations/049_clients_origin.sql` | ADD COLUMN origin + CHECK | VERIFICADO | Existe, sustantivo, correcto DDL |
| `supabase/schema.sql` | Refleja origin en public.clients | VERIFICADO | Líneas 391-392 con default y CHECK |
| `lib/types.ts` | `Client.origin: 'reserva' \| 'manual' \| 'importado'` | VERIFICADO | L179, no opcional, sin null |
| `lib/clients-create.ts` | Lógica pura compartida (validateClientBody + buildClientInsert) | VERIFICADO | Existe, exporta ambas funciones; `origin: 'manual'` en L47 |
| `app/api/clients/create/route.ts` | Auth + anon+RLS + origin='manual' + tenant por sesión | VERIFICADO | Todas las condiciones presentes |
| `app/(dashboard)/clients/clients-client.tsx` | Dialog alta + badge de origen + fetch /api/clients/create | VERIFICADO | Dialog en L938-982; badge en L642-644; fetch en L193; export link en L514 |
| `app/api/export/clients/route.ts` | GET autenticado, CSV BOM + RFC4180, filtrado por sesión | VERIFICADO | Existe, sustantivo, todas las condiciones |
| `app/api/export/finances/route.ts` | GET autenticado, tres fuentes, CSV BOM + RFC4180 | VERIFICADO | Existe, sustantivo, todas las condiciones |
| `app/(dashboard)/finances/finances-client.tsx` | Botón "Exportar CSV" → /api/export/finances | VERIFICADO | L615: `Button onClick → window.location.href = '/api/export/finances'` |
| `test/manual-client.test.ts` | Tests del alta manual (7 casos) | VERIFICADO | 7 tests cubriendo validación, origin=manual, anti-tampering, gating obra social |

---

## Verificación de Key Links

| From | To | Via | Estado | Detalle |
|------|----|-----|--------|---------|
| `clients-client.tsx` | `/api/clients/create` | `fetch POST` en `onCreateClient` (L193) | WIRED | Match en L193; prepend `setClients` en L213 |
| `clients-client.tsx` | `/api/export/clients` | `<a href="/api/export/clients" download>` (L514) | WIRED | Match en L514 con `buttonVariants({ variant: 'outline', size: 'sm' })` |
| `finances-client.tsx` | `/api/export/finances` | `Button onClick → window.location.href` (L615) | WIRED | Match en L615 |
| `app/api/clients/create/route.ts` | tabla `clients` | `.from('clients').insert(payload)` (L55) | WIRED | `payload` viene de `buildClientInsert` en `lib/clients-create.ts` L33-48 |
| `app/api/export/clients/route.ts` | tabla `clients` | `.from('clients').select(...).eq('business_id', business.id)` (L48-51) | WIRED | Query con filtro tenant + todas las columnas del header |
| `app/api/export/finances/route.ts` | tablas `appointments`, `manual_sales`, `expenses` | `Promise.all` con tres queries `.eq('business_id', business.id)` (L45-59) | WIRED | Tres fuentes, todas con filtro tenant |

---

## Data-Flow Trace (Level 4)

| Artefacto | Variable de datos | Fuente | Produce datos reales | Estado |
|-----------|------------------|--------|---------------------|--------|
| `clients-client.tsx` | `clients` (state) | `initialClients` prop (page.tsx) + prepend optimista | DB query en `page.tsx` + handler insert | FLOWING |
| Badge de origen | `client.origin` | campo `origin` en el objeto Client | columna `origin` de la DB (migr. 049, DEFAULT 'reserva') | FLOWING |
| Export clients CSV | rows de la query | `.from('clients').eq('business_id', ...)` | Query real, todas las filas del negocio | FLOWING |
| Export finances CSV | `movimientos[]` | tres queries en `Promise.all` | Queries reales sobre appointments/manual_sales/expenses | FLOWING |

---

## Verificación de Spot-Checks Conductuales

Tests unitarios del alta manual (`test/manual-client.test.ts`) cubren el contrato de `lib/clients-create`:

| Comportamiento | Test | Estado |
|---------------|------|--------|
| Nombre vacío → missing_fields | `missing_fields — nombre vacío es rechazado` | Código presente, lógica determinista pura |
| Sin contacto → missing_fields | `missing_fields — nombre sin teléfono NI email es rechazado` | Código presente, lógica determinista pura |
| Nombre + contacto → válido | `válido — nombre + teléfono (o email) pasa la validación` | Código presente |
| origin=manual en el insert | `origin=manual — el cliente creado queda con origin=manual` | Verificado en `lib/clients-create.ts` L47 |
| Anti-tampering: business_id de sesión | `anti-tampering — un business_id ajeno no cambia el tenant` | `buildClientInsert` recibe `business.id` del handler, nunca del body |
| Obra social ignorada en general | `obra social ignorada — en vertical general los insurance_* NO se persisten` | Gate `resolveVertical(business).key === 'salud'` en L37 |
| Obra social persistida en salud | `obra social persistida — en vertical salud los insurance_* se guardan` | Idem, rama true |

Nota: los tests son `describe.skipIf(!hasSupabaseCreds)` — requieren Supabase local corriendo. La lógica pura (validateClientBody, buildClientInsert) es determinista y verificable sin DB. La suite tiene timeouts flaky bajo Docker/Windows en paralelo pero pasan 7/7 en serial (no es regresión de esta fase).

---

## Aislamiento por Tenant — Verificación Crítica

| Endpoint | Usa service-role? | business_id del querystring? | Filtro .eq('business_id') | Estado |
|----------|------------------|------------------------------|--------------------------|--------|
| `POST /api/clients/create` | NO — importa `@/lib/supabase/server` | NO — `business_id` = `business.id` resuelto por `owner_id` | SÍ — en el insert (payload de buildClientInsert) | CORRECTO |
| `GET /api/export/clients` | NO — importa `@/lib/supabase/server` | NO — business resuelto por `owner_id` en L39-44 | SÍ — L50 `.eq('business_id', business.id)` | CORRECTO |
| `GET /api/export/finances` | NO — importa `@/lib/supabase/server` | NO — business resuelto por `owner_id` en L36-42 | SÍ — tres queries, cada una con `.eq('business_id', business.id)` | CORRECTO |

---

## Cobertura de Requisitos

| Requisito | Plan | Descripción | Estado | Evidencia |
|-----------|------|-------------|--------|-----------|
| CLIENT-01 | 02-01, 02-02 | Alta manual + badge de origen | SATISFECHO | migr. 049 + `lib/clients-create` + Dialog en `clients-client.tsx` + badge ORIGIN_BADGE por fila |
| DATA-01 | 02-03 | Export CSV de clientes | SATISFECHO | `app/api/export/clients/route.ts` con header de round-trip + aislamiento |
| DATA-02 | 02-03 | Export CSV de finanzas | SATISFECHO | `app/api/export/finances/route.ts` con tres fuentes + fixed_expenses excluidas por diseño |

Nota sobre DATA-02: el plan 03 excluyó `fixed_expenses` del CSV de finanzas (son plantillas recurrentes sin fecha de movimiento, no hechos fechados). Esto está documentado en el código con comentario explicativo y en el SUMMARY. La exclusión no es un gap: el objetivo "llevarse datos de finanzas/movimientos" se satisface con los hechos fechados (turnos, ventas, egresos).

---

## Anti-Patrones Detectados

No se encontraron marcadores `TBD`, `FIXME` o `XXX` en ninguno de los archivos creados/modificados por esta fase. Los únicos issues lint detectados son pre-existentes en `clients-client.tsx` y `finances-client.tsx` (confirmados con `git stash` antes de los cambios — registrados en `deferred-items.md`):
- `clients-client.tsx:347` — `react-hooks/set-state-in-effect` (error, pre-existente)
- `clients-client.tsx:23` — `TrendingUp` sin usar (warning, pre-existente)
- `finances-client.tsx:283` — `react-hooks/set-state-in-effect` (error, pre-existente)

Ninguno fue introducido por esta fase.

| Archivo | Línea | Patrón | Severidad | Impacto |
|---------|-------|--------|-----------|---------|

(Sin anti-patrones nuevos)

---

## Verificación Humana Requerida

### 1. Alta manual — badge 'Manual' en lista

**Qué hacer:** Desde `/clients`, abrir el Dialog "Nuevo cliente", cargar nombre + teléfono, guardar.
**Esperado:** El cliente aparece al tope de la lista con el badge "Manual" (fondo primario/azul/oscuro según el theme), y todos los clientes preexistentes muestran el badge "Reserva" (outline, sin relleno).
**Por qué humano:** Renderizado visual de React state (prepend optimista) y badge variant — no puede verificarse con grep.

### 2. Gating de obra social por vertical

**Qué hacer:** Entrar con un negocio de vertical 'salud' y abrir el Dialog de alta. Luego repetir con un negocio de vertical distinto.
**Esperado:** En salud, el Dialog muestra "Obra social" y "N° de afiliado". En otros verticales, esos campos no aparecen.
**Por qué humano:** Condición `isSalud` que depende del tipo de negocio de la sesión — requiere probar con ambos tipos en la app.

### 3. CSV de clientes — acentos y columnas en Excel-AR

**Qué hacer:** Con al menos un cliente con acento en el nombre (ej: "María"), hacer clic en "Exportar CSV" en la pantalla de Clientes y abrir el archivo descargado en Excel (locale Argentina).
**Esperado:** El archivo abre con columnas separadas correctamente (Excel interpreta la coma como separador), los acentos se muestran bien (no aparecen signos de interrogación ni caracteres rotos), el header es `nombre,telefono,email,origen,notas,obra_social,nro_obra_social`, y solo aparecen los clientes del propio negocio.
**Por qué humano:** Compatibilidad BOM + RFC4180 con Excel-AR requiere abrir el archivo en el entorno real.

### 4. CSV de finanzas — tres fuentes y ordenamiento

**Qué hacer:** Con datos de turnos, ventas manuales y egresos cargados, hacer clic en "Exportar CSV" en Finanzas y abrir el archivo.
**Esperado:** El archivo contiene movimientos de los tres tipos (`turno`, `venta`, `egreso`), ordenados por fecha descendente, con montos correctos (ventas = amount*quantity), sin filas de gastos fijos recurrentes.
**Por qué humano:** Verificar la coherencia de los datos combinados y el ordenamiento requiere datos reales del negocio.

### 5. Apariencia visual de los botones "Exportar CSV"

**Qué hacer:** Visitar `/clients` y `/finances` y verificar los botones de exportación.
**Esperado:** Ambos botones son visualmente secundarios (borde outline, sin fondo primario). El de Clientes es un enlace `<a>` (puede verse en la URL al hover), el de Finanzas es un `<button>`. Ninguno tiene fondo de color primario.
**Por qué humano:** Apariencia visual y tipo de elemento HTML — verificación de diseño que requiere ver el browser.

---

## Resumen de Gaps

No se encontraron gaps. Todos los artefactos existen, son sustantivos, están wired y los datos fluyen. Los 5 items de verificación humana son de naturaleza visual/UAT y no bloquean la conclusión técnica de la fase.

---

_Verificado: 2026-07-06_
_Verificador: Claude (gsd-verifier)_
