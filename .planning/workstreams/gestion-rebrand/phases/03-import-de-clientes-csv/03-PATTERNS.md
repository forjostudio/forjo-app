# Phase 3: Import de clientes CSV - Pattern Map

**Mapped:** 2026-07-06
**Files analyzed:** 7 (5 nuevos, 3 modificados — 1 overlap: `package.json`/`lib/clients-create.ts` MODIFY)
**Analogs found:** 6 con match fuerte / 7

## File Classification

| New/Modified File | Rol | Data Flow | Analog más cercano | Match |
|-------------------|-----|-----------|--------------------|-------|
| `package.json` | config | — | (Fases 1/2 fueron cero-deps; no hay analog de add-dep en este workstream) | no-analog |
| `lib/clients-import.ts` | utility (lógica pura) | transform / batch | `lib/clients-create.ts` | exact (rol) |
| `lib/clients-create.ts` (MODIFY) | utility (lógica pura) | transform | sí mismo (parametrizar `origin`) | self |
| `app/api/import/clients/preview/route.ts` | route handler (API) | file-I/O + request-response | `app/api/clients/create/route.ts` + `app/api/export/clients/route.ts` | role-match (auth+tenant); NUEVO en upload |
| `app/api/import/clients/confirm/route.ts` | route handler (API) | file-I/O + batch write | `app/api/clients/create/route.ts` (insert anon+RLS) | role-match; NUEVO en upload |
| `app/(dashboard)/clients/clients-client.tsx` (MODIFY) | component (client) | event-driven (UI flow) | sí mismo (alta/merge dialogs + header grid + dedup L260-275) | self/exact |
| `test/clients-import.test.ts` | test | — | `test/manual-client.test.ts` | exact |

## Shared Patterns

### Auth + tenant por sesión (aplicar a AMBOS route handlers)
**Source:** `app/api/clients/create/route.ts` L14-31 (idéntico en `export/clients/route.ts` L29-46).
Molde exacto a copiar al tope de `preview/route.ts` y `confirm/route.ts` — anon+RLS, NUNCA service-role, `business_id` derivado por `owner_id`:
```typescript
export async function POST(request: Request) {
  const supabase = await createClient()               // anon+RLS con cookies del dueño. NO admin.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const { data: business } = await supabase
    .from('businesses')
    .select('id, type, vertical')                       // type/vertical → gate obra social en buildClientInsert
    .eq('owner_id', user.id)                            // TENANT = SESIÓN, nunca del CSV/body
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
  // ...
}
```
Regla dura (SC-2, threat central): `business_id` = `business.id`; `origin='importado'` forzado server-side. El CSV no aporta ninguno de los dos.

### Response.json + errores snake_case (ambos handlers)
**Source:** `clients/create/route.ts` L22/L38/L50/L58/L62.
Éxito `{ ok: true, ... }`; falla `{ ok: false, error: '<snake>' }`. Códigos de esta fase: `unauthorized` (401), `not_found` (404), `bad_request` (400 — `formData()` falla), `missing_file` (400), `file_too_large` (413), `invalid_file_type` (400), `invalid_header` (400), `too_many_rows` (400), `insert_failed` (500). Logging de falla: `console.error('[import/preview] ...', ...)`.

### Validación + insert reusables (ambos handlers + `lib/clients-import.ts`)
**Source:** `lib/clients-create.ts` — `validateClientBody` (L32-37), `isValidPhone` (L24-28), `buildClientInsert` (L42-58). Ya importados en `clients/create/route.ts` L2 y en `clients-client.tsx` L12. No reinventar: importar de `@/lib/clients-create`.

### Round-trip: `esc()` del export = contrato a revertir
**Source:** `app/api/export/clients/route.ts` L58-61 (escaping) + L64 (header) + L85 (BOM).
```typescript
const esc = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v   // prefijo ' anti-fórmula OWASP
  return `"${safe.replace(/"/g, '""')}"`               // RFC4180
}
const headers = ['nombre','telefono','email','origen','notas','obra_social','nro_obra_social']
return new Response('\uFEFF' + csv, {...})              // BOM con secuencia de escape (NO glifo pegado)
```
El import lee ESTO de vuelta: papaparse quita comillas RFC4180 y strippea BOM; `unescapeFormulaGuard` revierte el `'` líder (Pattern 3 del RESEARCH). El header L64 es el `expectedHeader` rígido a validar contra `Papa.meta.fields`.

---

## Pattern Assignments

### `lib/clients-import.ts` (utility, lógica pura — NUEVO)

**Analog:** `lib/clients-create.ts` (mismo rol: lógica pura framework-agnostic compartida handler+test).

**Patrón de módulo a imitar** (`clients-create.ts` L1-20): cabecera con invariantes de seguridad en español, `interface` de input PascalCase, named exports de funciones puras, cero imports de React/Next. `clients-import.ts` importa `validateClientBody`/`isValidPhone`/`buildClientInsert` de `@/lib/clients-create` y expone: `parseCsv(text)`, `unescapeFormulaGuard(v)`, `classifyRows({ rows, existing, business, origin })` → `{ importables, errores, duplicadas, total }`.

**`unescapeFormulaGuard`** (RESEARCH Pattern 3, deriva de `export/route.ts` L59):
```typescript
function unescapeFormulaGuard(v: string): string {
  return v.startsWith("'") && /^[=+\-@\t\r]/.test(v.slice(1)) ? v.slice(1) : v
}
```

**Dedup** (copiar la lógica exacta de `clients-client.tsx` L260-266 — email minúsc + tel solo-dígitos):
```typescript
if (c.email) { const k = c.email.toLowerCase(); existingEmails.add(k) }
if (c.phone) { const k = c.phone.replace(/\D/g, ''); if (k) existingPhones.add(k) }
```
Aplicar contra DB (query de existentes) Y intra-CSV (Sets `seen*`). Ver RESEARCH Pattern 6 para el loop completo. Truncado de notas a 1000 chars (mismo que `create/route.ts` L44 `.slice(0,1000)`).

---

### `lib/clients-create.ts` (MODIFY — parametrizar `origin`)

**Cambio quirúrgico** (RESEARCH Pattern 5 / Pitfall 5): hoy L56 hardcodea `origin: 'manual'`. Parametrizar con default retro-compatible para NO tocar `clients/create/route.ts`:
```typescript
export function buildClientInsert(
  business: { id: string; type?: string | null; vertical?: string | null },
  input: ClientCreateInput,
  origin: 'manual' | 'importado' = 'manual',   // NUEVO — default mantiene el alta manual intacta
): Record<string, unknown> {
  // ... sin cambios hasta el return ...
  origin,                                        // era: origin: 'manual'
}
```
El CHECK de migr.049 acepta `'importado'` — sin migración nueva. `clients/create/route.ts` L54 no se toca (usa el default).

---

### `app/api/import/clients/preview/route.ts` (route handler — NUEVO)

**Analog:** `app/api/clients/create/route.ts` (auth+tenant+Response) — copiar L14-31 (ver Shared Patterns). El upload multipart es **NUEVO en el repo** (no existe `request.formData()` en ningún handler).

**Upload multipart (patrón NUEVO — RESEARCH Pattern 1):** Web `Request` API nativa de Next 16, runtime Node por defecto, sin config. Guard de tamaño/tipo ANTES de parsear:
```typescript
const MAX_BYTES = 2 * 1024 * 1024                                 // 2 MB (D-04)
let form: FormData
try { form = await request.formData() }                          // mismo espíritu que try/catch de request.json() (create L35-39)
catch { return Response.json({ ok: false, error: 'bad_request' }, { status: 400 }) }
const file = form.get('file')
if (!(file instanceof File)) return Response.json({ ok:false, error:'missing_file' }, { status: 400 })
if (file.size > MAX_BYTES) return Response.json({ ok:false, error:'file_too_large' }, { status: 413 })
if (!(file.name ?? '').toLowerCase().endsWith('.csv'))
  return Response.json({ ok:false, error:'invalid_file_type' }, { status: 400 })
const text = (await file.text()).replace(/^\uFEFF/, '')          // strip BOM defensivo (espeja export L85)
```

**Parseo + clasificación:** `Papa.parse<RawRow>(text, { header:true, skipEmptyLines:'greedy', transformHeader: h => h.trim().toLowerCase() })`; validar `meta.fields` contra el header rígido → `invalid_header`; delegar la clasificación por fila a `lib/clients-import.ts`. Query de existentes filtrada por tenant: `supabase.from('clients').select('email, phone').eq('business_id', business.id)`.

**NADA se escribe (SC-1).** Shape de respuesta (RESEARCH):
```typescript
return Response.json({ ok: true, preview: { total, importables, duplicadas, errores } })
```

---

### `app/api/import/clients/confirm/route.ts` (route handler — NUEVO)

**Analog:** MISMO molde auth+tenant+upload+parseo que `preview` (D-03: re-recibe y RE-PARSEA el File, no confía en la preview del cliente). Diferencia: inserta.

**Batch insert anon+RLS** (analog: `clients/create/route.ts` L54-59, extendido a array — RESEARCH Pattern 5):
```typescript
const rows = importables.map((f) =>
  buildClientInsert(business, {
    name: f.nombre, phone: f.telefono, email: f.email, notes: f.notas,
    insurance_name: f.obra_social, insurance_number: f.nro_obra_social,
  }, 'importado'))                                              // origin forzado
const { data, error } = await supabase.from('clients').insert(rows).select('id')
if (error) { console.error('[import/confirm] insert error:', error.message); /* → fallidos */ }
```
Un solo `.insert()` para ≤2.000 filas (lotes de 500 = opcional). Fallo de batch → contar en `fallidos` (no romper el response). Resumen (SC-4):
```typescript
return Response.json({ ok: true, resumen: { importados, omitidos, fallidos } })
```

---

### `app/(dashboard)/clients/clients-client.tsx` (MODIFY — botón + Dialog 4 etapas)

**Analog:** sí mismo. Reusar patrones ya presentes en el archivo.

**Header (grid 2-col, fix Fase 2 L513-528):** reestructurar según UI-SPEC — fila secundaria 2-col con "Exportar CSV" (`<a>` outline existente L517-524) + "Importar CSV" nuevo (`Button variant="outline"` + icono `Upload`, SIN `gap-*` manual); "Nuevo cliente" (L525-527) pasa a fila propia full-width. NO copiar el legacy `gap-1.5` al botón nuevo (UI-SPEC guardrail).

**Dialog (analog: alta modal L939-983):** `Dialog open/onOpenChange` con reset al cerrar; `DialogContent className="sm:max-w-2xl"` (más ancho que el `sm:max-w-md` del alta, para la tabla de preview). Estado local `stage: 'upload'|'preview'|'confirming'|'resumen'` + `File` en React state para re-postear a confirm sin re-seleccionar.

**Fetch + estado (analog: `onCreateClient` L192-224):** copiar el patrón `setCreating(true)` / `fetch` / `res.json().catch(()=>null)` / `toast.error/success` / `finally`. Para el upload el body es `FormData` (no JSON): `const fd = new FormData(); fd.append('file', file); fetch('/api/import/clients/preview', { method:'POST', body: fd })` (sin header `Content-Type` — el browser lo setea con boundary). Anti-doble-submit: botón disabled + label "Importando..." durante `confirming` (molde `saving`/`creating`).

**Tabla de preview (analog: `components/ui/table.tsx`):** importar `Table, TableHeader, TableBody, TableRow, TableHead, TableCell`. Columnas Nombre·Teléfono·Email·Estado. Filas error = `bg-destructive/10 border-l-2 border-destructive`; duplicada = `text-muted-foreground` + `Badge variant="secondary"` "Duplicado" (UI-SPEC). Mobile `< sm:` = `divide-y` stacked, no tabla. `Badge` ya importado L18.

**Dedup L260-275:** NO se toca; es la fuente del criterio que `lib/clients-import.ts` replica. Al cerrar el resumen, re-fetch de clientes para reflejar los importados con badge "Importado".

---

### `test/clients-import.test.ts` (test — NUEVO)

**Analog:** `test/manual-client.test.ts` (mismo dominio, mismo molde).

**Estructura a copiar 1:1:**
- `describe.skipIf(!hasSupabaseCreds)` (L28) — skip sin las 3 creds.
- `seedOneTenant` / `teardownOneTenant` (L4, L33-53) + `ownerAnon` anon-key autenticado como el dueño (L37-39) — NUNCA service-role para aserciones.
- GUARD anti-falso-verde (L42-48): sesión anon autenticada + `anonKey !== SERVICE_ROLE_KEY`.
- `afterEach` limpia `clients` del tenant + restaura vertical (L56-60).
- Aserciones vía lógica pura importada (`validateClientBody`, `buildClientInsert` de `@/lib/clients-create`) + las nuevas de `@/lib/clients-import`.

**Casos propios de la fase (RESEARCH):**
1. **Round-trip lossless estrella:** nombre `=X` → export (`esc` lo hace `'=X`) → `unescapeFormulaGuard` → valor almacenado `=X` (NO `'=X`).
2. Validación por fila (nombre faltante → `missing_fields`; sin contacto; teléfono con letras → `invalid_phone`).
3. Dedup vs DB + intra-CSV (email minúsc / tel solo-dígitos).
4. `origin='importado'` en el insert (via `buildClientInsert(business, input, 'importado')`).
5. Aislamiento: `business_id` = el de la sesión, un `business_id` en el CSV se ignora (molde L104-118).

---

## No Analog Found

| File | Rol | Razón |
|------|-----|-------|
| `package.json` (add `papaparse`+`@types/papaparse`) | config | Fases 1 y 2 fueron cero-deps; no hay precedente de add-dependency en este workstream. Es un `npm install papaparse@5.5.4` + `-D @types/papaparse@5.5.2` (D-05, RESEARCH §Installation) + commit de ambos lockfiles. |

**Patrón NUEVO documentado (sin analog en el repo, cubierto por RESEARCH):** recepción `multipart/form-data` vía `request.formData()` → `File` → `file.text()` (Next 16, RESEARCH Pattern 1). Guards de tamaño/tipo/BOM antes de parsear. El planner usa el excerpt de `preview/route.ts` arriba, derivado de RESEARCH, no de código existente.

## Metadata

**Analog search scope:** `app/api/{export,clients}/**`, `lib/clients-create.ts`, `app/(dashboard)/clients/clients-client.tsx`, `components/ui/table.tsx`, `test/manual-client.test.ts`.
**Files scanned:** 7 leídos en full/targeted.
**Pattern extraction date:** 2026-07-06
