# Phase 15: Borrador y publicación (núcleo) - Pattern Map

**Mapped:** 2026-07-12
**Files analyzed:** 7 (1 nuevo + 6 modificados)
**Analogs found:** 7 / 7 (todos exactos — la fase es "duplicar un molde ya auditado")

## File Classification

| New/Modified File | Estado | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|--------|------|-----------|----------------|---------------|
| `supabase/migrations/050_landing_draft.sql` | NUEVO | migration | schema/DDL + backfill | `supabase/migrations/049_clients_origin.sql` | exact |
| `app/(dashboard)/web/_landing-actions.ts` | EDIT | server action (owner-only write path) | request-response / CRUD | **el propio `saveLandingConfig`** (self-analog) | exact |
| `app/(dashboard)/web/page.tsx` | EDIT | page (RSC, gate + fetch) | request-response | sí mismo (línea 91 `initialConfig`) | exact |
| `app/(dashboard)/web/web-client.tsx` | EDIT | component (client, editor shell) | event-driven / form | sí mismo (`handleSave` + save bar + `<Dialog>` muerto) | exact |
| `lib/landing/editor-draft.ts` | EDIT | utility (reducer puro) | transform | `isDirty` / `stripPrimary` en el mismo archivo | exact |
| `test/isolation.test.ts` | EDIT | test (RLS anon-key) | CRUD | los 3 casos `landing_config` (líneas 117-156) + D-10a/b/c (197-230) | exact |
| `test/landing-editor-draft.test.ts` | EDIT | test (puro) | transform | sí mismo (líneas 1-40) | exact |
| `app/globals.css` | EDIT (3 líneas) | config (design tokens) | — | bloque `@theme inline` / `:root` existente | role-match |

**NO se tocan (invariante de la fase):** `app/[slug]/page.tsx`, `app/[slug]/layout.tsx`, `app/[slug]/opengraph-image.tsx`, `lib/landing/write.ts`, `lib/landing/schema.ts`, `scripts/setup-landing.ts`, la vista `public_businesses`, el trigger `businesses_protect_admin_columns`.

---

## Pattern Assignments

### `supabase/migrations/050_landing_draft.sql` (migration, DDL + backfill)

**Analog:** `supabase/migrations/049_clients_origin.sql` (última migración aplicada; 050 = primer número libre).

**Estructura del archivo** (`049_clients_origin.sql:1-35`) — copiar la forma exacta: título de una línea (`-- 049 — clients.origin: <qué> (<milestone> — <REQ>)`), bloque `-- Contexto:`, `-- Qué hace:`, `-- Racional D-0x (lockeado):`, `-- Qué NO hace (invariantes del proyecto):`, y recién después el SQL. Comentarios densos en español explicando el *porqué*.

Los 3 párrafos del bloque "Qué NO hace" de la 049 son literalmente los que la 050 debe replicar con su propio contenido:

```sql
-- Qué NO hace (invariantes del proyecto):
--   - NO agrega policy RLS nueva ni habilita RLS: `clients` YA es RLS por business_id (tabla existente) →
--     la columna hereda ese aislamiento. Agregar una policy sería un error: no cambia la superficie de acceso.
--   - NO renumera ni edita ninguna migración ajena (045 landing_cms, 046 drop_business_hours,
--     047 backfill_vertical, 048 app_settings ya tomadas). 049 = primera libre.
--   - NO se aplica vía `supabase db push` remoto. La ÚNICA validación autónoma es `supabase db reset` local
--     (PG17), que replaya el baseline numerado + 040..049 en orden. Staging (forjo-staging) y prod se aplican
--     A MANO coordinado con el deploy + `NOTIFY pgrst, 'reload schema';` (PostgREST refresca su schema cache).
--     Tras aplicar, regenerar `supabase/schema.sql` (patrón del repo, igual que 037/039/042/043).
```

**DDL idempotente** (`049_clients_origin.sql:34-35`):

```sql
ALTER TABLE "public"."clients"
  ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'reserva' CHECK (origin IN ('reserva','manual','importado'));
```

→ La 050 usa la misma forma (`ADD COLUMN IF NOT EXISTS`, nombre de tabla/columna entrecomillado) **pero sin `DEFAULT` y nullable** (Pitfall 6 del RESEARCH: `NULL` es semántico) + el `UPDATE … SET landing_draft = landing_config WHERE landing_draft IS NULL AND landing_config IS NOT NULL` (backfill idempotente). El SQL completo ya está redactado en `15-RESEARCH.md` §"Patrón 1" — copiarlo verbatim.

**Anti-patrón del analog a NO copiar:** `045_landing_cms.sql` (grants + policies + `create table`) es de otro dominio (la landing de forjo.studio, no el multi-tenant). No usarla de molde: la 050 no crea policy, ni grant, ni toca la vista.

---

### `app/(dashboard)/web/_landing-actions.ts` (server action, owner-only write path)

**Analog:** el propio `saveLandingConfig` en ese mismo archivo (90 líneas). Las 3 acciones de la fase son **este molde, verbatim, cambiando el paso 6-7**.

**Cabecera del módulo + flag fail-closed** (`_landing-actions.ts:1-4, 31-33`) — se conserva tal cual y se amplía el bloque de comentario:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { parseLandingConfigForWrite } from '@/lib/landing/write'

// Kill-switch global del CMS (D-01/D-01b). Server-only (NO NEXT_PUBLIC_*), fail-closed: solo el valor
// exacto 'true' enciende; ausente o cualquier otro valor → false. Espeja el patrón de MP_MODE.
const CMS_ENABLED = process.env.CMS_ENABLED === 'true'
```

**Pasos 1-5 (flag → try → session client → getUser → business de la sesión → entitlement)** — `_landing-actions.ts:35-68`. Estas 34 líneas se replican **idénticas** en `publishLanding()` y `discardLandingDraft()`; lo único que cambia es la lista de columnas del `.select` (`'id, has_web_custom, landing_draft'` en publish, `'id, has_web_custom, landing_config'` en discard):

```ts
export async function saveLandingConfig(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1. Flag primero — kill-switch global. Con el flag off el request NO escribe ni resuelve sesión.
  if (!CMS_ENABLED) return { ok: false, error: 'cms_disabled' }

  try {
    // 2. Session client (anon + cookies, RLS activo). PROHIBIDO createAdminClient()/service-role acá.
    const supabase = await createClient()

    // 3. Sesión del dueño.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'unauthorized' }

    // 4. Negocio resuelto de la SESIÓN (owner_id = auth.uid()), nunca de un business_id del body.
    const { data: business } = await supabase
      .from('businesses')
      .select('id, has_web_custom')
      .eq('owner_id', user.id)
      .single()
    if (!business) return { ok: false, error: 'no_business' }

    // 4b. ENTITLEMENT (gate real, server-side): sin web a medida contratada, NO se escribe.
    if (!business.has_web_custom) return { ok: false, error: 'not_entitled' }
```

**Validación + write + verificación de filas afectadas** (`_landing-actions.ts:70-89`) — el patrón exacto a copiar; **el único cambio de `saveLandingDraft` es `landing_config:` → `landing_draft:`**:

```ts
    // 5. Validación estricta reject-on-invalid: un config inválido NO se escribe (no 500, no default).
    const parsed = parseLandingConfigForWrite(input)
    if (!parsed.ok) return { ok: false, error: parsed.error }

    // 6. Overwrite total SOLO de landing_config, acotado a la fila del propio negocio. El `.select('id')`
    //    verifica filas afectadas: si el negocio fue borrado entre el fetch y el update, el update es
    //    un no-op silencioso que sin esta verificación devolvería { ok:true } sin escribir nada (WR-01).
    const { data: updated, error } = await supabase
      .from('businesses')
      .update({ landing_config: parsed.data })
      .eq('id', business.id)
      .select('id')
    if (error) return { ok: false, error: 'update_failed' }
    if (!updated || updated.length === 0) return { ok: false, error: 'update_failed' }

    return { ok: true }
  } catch {
    return { ok: false, error: 'server_error' }
  }
}
```

**Reglas duras que salen del analog (D-16, no negociables):**
- `createClient()` de `@/lib/supabase/server` — **jamás** `createAdminClient()` en `app/(dashboard)/web/**`.
- `business_id` de `.eq('owner_id', user.id).single()`, nunca del body. `publishLanding()` / `discardLandingDraft()` **no reciben argumentos** → superficie de tampering = 0.
- El `.select('id')` + `length === 0` → `*_failed` se conserva en las 3 (WR-01).
- Publish re-valida con `parseLandingConfigForWrite(business.landing_draft)` (lo LEÍDO de la DB) → código `invalid_draft`. Discard **no** valida `landing_config` con Zod (ya está al aire; el contrato de lectura es fail-safe).
- **No** llamar `revalidatePath`/`refresh` (Pitfall 2 del RESEARCH).

Los cuerpos completos de `publishLanding` y `discardLandingDraft` están escritos en `15-RESEARCH.md` §"Patrón 3" — el plan puede copiarlos.

---

### `app/(dashboard)/web/page.tsx` (page RSC, gate + fetch)

**Analog:** sí misma. El único cambio es el bloque 6 (`page.tsx:88-102`):

```ts
  // 6. El initialConfig se pasa CRUDO (business.landing_config, jsonb): el cliente lo parsea con
  //    parseLandingConfig y siembra DEFAULT_LANDING_CONFIG si es null (D-03 / empty-state §7). El
  //    tipo Business no declara landing_config (igual que [slug]/page.tsx) → cast puntual.
  const initialConfig = (business as { landing_config?: unknown }).landing_config ?? null

  return (
    <WebEditorClient
      business={business as unknown as PublicBusiness}
      initialConfig={initialConfig}
      services={services || []}
      …
```

→ Pasa a dos props (`initialDraft` = `landing_draft ?? landing_config` con coalesce defensivo, `publishedConfig` = `landing_config ?? null`) con el **mismo cast puntual** al no estar declaradas en el tipo `Business`. El `select('*')` de `page.tsx:42-46` **ya trae la columna nueva sin tocarlo**.

**Gate fail-closed que NO se toca** (`page.tsx:24-29, 58`): `const CMS_ENABLED = process.env.CMS_ENABLED === 'true'` → `if (!CMS_ENABLED) notFound()` como PRIMER paso, y `if (!business.has_web_custom) notFound()`. Phase 15 no cambia una línea de exposición (D-15).

---

### `app/(dashboard)/web/web-client.tsx` (component, client editor shell)

**Analog:** sí mismo. Se edita **por bloques** (regla 3 del CLAUDE.md global: 342 líneas, nunca reescribir entero).

**Mapa de errores → toast** (`web-client.tsx:72-84`) — el `SAVE_ERROR_COPY` se renombra a `ACTION_ERROR_COPY` y se le suman `no_draft` / `publish_failed` / `discard_failed` / `invalid_draft` (copys en `15-UI-SPEC.md` §Copywriting):

```ts
// Mapa de códigos de error de saveLandingConfig → toast en español (14-UI-SPEC §6, D-03c).
const SAVE_ERROR_COPY: Record<string, string> = {
  cms_disabled: 'El editor no está disponible en este momento.',
  not_entitled: 'Tu plan no incluye la edición de la web. Escribinos para activarla.',
  unauthorized: 'Tu sesión expiró. Volvé a iniciar sesión.',
  no_business: 'No encontramos tu negocio. Recargá la página.',
  invalid_config: 'Hay un dato inválido en tu web. Revisá los campos marcados.',
  update_failed: 'No se pudieron guardar los cambios. Probá de nuevo.',
  server_error: 'Ocurrió un error al guardar. Probá de nuevo en unos segundos.',
}
```

**Seed + baselines** (`web-client.tsx:95-118`) — el patrón `useMemo(stripPrimary(parseLandingConfig(x) ?? DEFAULT))` es EL molde para los DOS baselines (Pitfall 7: ambos deben pasar por el mismo pipeline de normalización):

```ts
  const isEmpty = initialConfig === null || initialConfig === undefined
  const seeded = useMemo<LandingConfig>(
    () => stripPrimary(parseLandingConfig(initialConfig) ?? DEFAULT_LANDING_CONFIG),
    [initialConfig],
  )
  const [draft, setDraft] = useState<LandingConfig>(seeded)
  const [savedBaseline, setSavedBaseline] = useState<LandingConfig>(seeded)
  const [uploading, setUploading] = useState(0)
  const [saving, setSaving] = useState(false)
  const dirty = isDirty(draft, savedBaseline)
```

**Handler de acción async** (`web-client.tsx:150-163`) — el molde de `handlePublish` / `handleDiscard` (guard de reentrada → setState busy → await action → toast por rama → actualizar baselines):

```ts
  async function handleSave() {
    if (saving || !dirty || uploading > 0) return
    setSaving(true)
    const res = await saveLandingConfig(draft)
    setSaving(false)
    if (res.ok) {
      toast.success('Cambios guardados')
      // D-03c: limpiar el flag de cambios sin guardar → baseline pasa a ser el draft actual.
      setSavedBaseline(draft)
    } else {
      toast.error(SAVE_ERROR_COPY[res.error] ?? SAVE_ERROR_COPY.server_error)
    }
  }
```

→ `handlePublish` encadena `saveLandingDraft(draft)` → si `ok` → `publishLanding()`; label `Publicando…` durante TODO el encadenado (UI-SPEC §4).

**Barra sticky + indicador aria-live** (`web-client.tsx:284-305`) — el bloque que se reemplaza; **conservar el contenedor y el `mr-1.5`**:

```tsx
          {/* Save bar sticky (§6): Save nunca detrás del scroll. */}
          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background/95 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
            <span
              className={cn('text-xs', dirty ? 'text-primary' : 'text-muted-foreground')}
              aria-live="polite"
            >
              {dirty ? (
                <>
                  <span
                    aria-hidden="true"
                    className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle"
                  />
                  Cambios sin guardar
                </>
              ) : (
                'Todo guardado'
              )}
            </span>
            <Button onClick={handleSave} disabled={saving || !dirty || uploading > 0}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
```

**Dialog (código muerto a reciclar)** (`web-client.tsx:319-338`) — es la base literal de los dos dialogs nuevos (go-live y descartar); ya tiene los imports de `@/components/ui/dialog` en el tope del archivo:

```tsx
      <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tenés cambios sin guardar</DialogTitle>
            <DialogDescription>
              Si salís ahora perdés los cambios que no guardaste.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowExitConfirm(false)}>
              Seguir editando
            </Button>
            <Button variant="destructive" onClick={() => setShowExitConfirm(false)}>
              Descartar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

**Empty-state a corregir** (`web-client.tsx:255-263`): la caja `rounded-lg border border-primary/30 bg-primary/5 p-4` se conserva; el copy *"se publican recién cuando tocás **Guardar cambios**"* pasa a ser FALSO → reemplazar por el copy del UI-SPEC §9 y atar la condición a `publishedConfig === null` en vez de `initialConfig === null`.

**`beforeunload`** (`web-client.tsx:166-175`): sigue atado a `unsaved` (NO a `unpublished`). No tocar.

---

### `lib/landing/editor-draft.ts` (utility, reducer puro)

**Analog:** las funciones vecinas del propio archivo. El add es `canonicalStringify` + usarlo en el compare (Pitfall 7: Postgres reordena las claves del jsonb → falso positivo permanente de "sin publicar").

**Molde de función pura + comentario de cabecera** (`editor-draft.ts:191-199`):

```ts
// ── isDirty: comparación estructural borrador-vs-guardado ─────────────────────────────
// Devuelve true si difieren. Usamos JSON.stringify (deep-equal barato y suficiente: el config es
// JSON plano, sin funciones/undefined significativos ni ciclos). Lo consume la save bar (indicador
// de cambios sin guardar) y el confirm-on-exit. Nota: JSON.stringify es sensible al orden de
// claves, pero como todos los mutadores parten del mismo config y hacen spread, el orden de claves
// se mantiene estable entre borrador y baseline — no hay falsos positivos por reordenamiento.
export function isDirty(current: LandingConfig, saved: LandingConfig): boolean {
  return JSON.stringify(current) !== JSON.stringify(saved)
}
```

→ La nota final de ese comentario **deja de ser cierta** cuando el baseline viene de un round-trip por jsonb. El plan debe actualizar el comentario junto con el compare canónico.

**Molde de mutador puro no-destructivo** (`editor-draft.ts:175-189`, `stripPrimary` / `setMotion`): spread, nunca mutación del argumento, early-return cuando no hay cambio. Cualquier helper nuevo (ej. `deriveEditorState`) sigue esta forma: puro, sin React, exportado nombrado, testeable en Vitest.

---

### `test/isolation.test.ts` (test, RLS anon-key)

**Analog:** los casos `landing_config` (`isolation.test.ts:117-156`) y `D-10a/b/c` (`:197-230`) del mismo archivo. Los 4 casos nuevos de `landing_draft` son estos, cambiando la columna.

**Cross-write con anon-key + check independiente de efecto** (`:117-136`) — el molde exacto para "B no escribe el borrador de A":

```ts
  it('cross-WRITE landing_config: B no puede escribir el config de A (SC2)', async () => {
    // anonB (sesión de B) apunta EXPLÍCITAMENTE a la fila de A (por id, NO por owner/business_id):
    // dejamos que RLS deniegue. Un config válido cualquiera como payload.
    const { data, error } = await anonB
      .from('businesses')
      .update({ landing_config: { theme: { preset: 'forjo' }, sections: [] } })
      .eq('id', seeded.bizA)
      .select('id')
    // Denegación RLS: error, o 0 filas afectadas. Cualquiera de las dos es válida.
    expect(error !== null || (data ?? []).length === 0).toBe(true)

    // Check INDEPENDIENTE del efecto con service-role (NO es la aserción de RLS): …
    const { data: check } = await seeded.admin
      .from('businesses')
      .select('landing_config')
      .eq('id', seeded.bizA)
      .single()
    expect(check?.landing_config).toBeNull()
  })
```

**"La columna NO está en la vista pública"** — se espeja el D-10b (`:209-218`), que asierta que un select de una columna ausente **erra**:

```ts
  it('D-10b — los secretos SIGUEN denegados tras agregar landing_config a la vista (anonA)', async () => {
    const { error } = await anonA
      .from('public_businesses')
      .select('mp_access_token')
      .eq('id', seeded.bizA)
      .single()
    expect(error).not.toBeNull()
  })
```

→ Caso nuevo: `select('landing_draft')` sobre `public_businesses` con `anonA` **debe errar** (Pitfall 3 del RESEARCH). Es la aserción central de seguridad de la fase.

**Regla dura del archivo (Pitfall 12, líneas 14-17):** las aserciones de aislamiento usan **solo** clientes anon-key autenticados (`anonA`/`anonB`); `seeded.admin` (service-role) **solo** para sembrar y para el check independiente de efecto. Y **nunca** `.eq('business_id', …)` en la aserción (testearía el WHERE, no la RLS).

---

### `test/landing-editor-draft.test.ts` (test puro)

**Analog:** sí mismo (`:1-32`): `describe/it/expect` de vitest, import por alias `@/lib/...`, environment node, sin Supabase, factory `baseConfig()` local. Los tests de la máquina de 3 estados y del `canonicalStringify` van acá con la misma forma.

---

## Shared Patterns

### 1. Server Action owner-only (D-16 — el invariante de la fase)
**Source:** `app/(dashboard)/web/_landing-actions.ts:31-89`
**Apply to:** `saveLandingDraft`, `publishLanding`, `discardLandingDraft`
Secuencia obligatoria: `CMS_ENABLED` (primer return, antes de cualquier efecto) → `try` → `createClient()` (anon + cookies) → `auth.getUser()` → `SELECT … WHERE owner_id = user.id` → `!has_web_custom → not_entitled` → [Zod] → `.update(…).eq('id', business.id).select('id')` + chequeo de filas → `catch → server_error`.

### 2. Contrato de respuesta y toast por código
**Source:** `_landing-actions.ts:37` + `web-client.tsx:73-84, 161`
**Apply to:** las 3 acciones y sus 3 handlers.
`Promise<{ ok: true } | { ok: false; error: string }>` con códigos snake_case; en el cliente `toast.error(ACTION_ERROR_COPY[res.error] ?? ACTION_ERROR_COPY.server_error)`.

### 3. Los dos contratos Zod (leer ≠ escribir)
**Source:** `lib/landing/write.ts:1-25` (estricto, reject-on-invalid) · `lib/landing/schema.ts` → `parseLandingConfig` (fail-safe: `null → null`, inválido → DEFAULT)
**Apply to:** escritura del borrador y validación del borrador **al publicar** (estricto); parseo de ambos baselines en el cliente y lectura pública (fail-safe). **No crear un tercer validador.**

### 4. Cast puntual del jsonb no declarado en el tipo
**Source:** `app/(dashboard)/web/page.tsx:91` y `app/[slug]/page.tsx:56`
```ts
const landing = parseLandingConfig((business as { landing_config?: unknown }).landing_config)
```
**Apply to:** leer `landing_draft` en `page.tsx` (el tipo `Business` tampoco la va a declarar).

### 5. Lectura pública con columnas explícitas (lo que NO se toca)
**Source:** `app/[slug]/page.tsx:45-49`
```ts
  const { data: business } = await supabase
    .from('public_businesses')
    .select('id, owner_id, slug, name, … , landing_config')
    .eq('slug', slug)
    .single()
```
**Apply to:** nada — es el **anti-patrón guardián**: prohibido pasar estos selects a `select('*')` y prohibido meter `landing_draft` en `public_businesses`.

### 6. Comentario de cabecera en español explicando el porqué
**Source:** `_landing-actions.ts:6-29`, `page.tsx:6-22`, `049_clients_origin.sql:1-31`
**Apply to:** la migración 050 y las 2 acciones nuevas. Formato: bloque `// ── Título ──` + "Por qué cada decisión" enumerado (a)/(b)/(c) + limitaciones conocidas.

---

## No Analog Found

Ninguno. Los 7 archivos de la fase tienen analog exacto en el repo (5 de ellos son self-analogs: el archivo ya existe y se extiende con su propio patrón).

Único elemento sin precedente directo: el token `--warning` en `app/globals.css` (no existe token semántico de warning fuera de `.crm-shell`). El molde es el bloque `@theme inline` + `:root` / `.dark` ya presente; los valores exactos están LOCKED en `15-UI-SPEC.md` §Color.

---

## Metadata

**Analog search scope:** `app/(dashboard)/web/`, `app/[slug]/`, `lib/landing/`, `supabase/migrations/`, `test/`
**Files scanned:** 11
**Pattern extraction date:** 2026-07-12
