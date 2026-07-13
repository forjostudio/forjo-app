# Phase 16: La web nace como borrador (skill del operador) - Pattern Map

**Mapped:** 2026-07-13
**Files analyzed:** 2 modified + 1 likely new (test)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/setup-landing.ts` (MODIFY) | CLI script (service-role, fuera del runtime web) | batch / read-modify-write | `scripts/setup-admin.ts` (flags + service-role + exit codes) · **`app/(dashboard)/web/_landing-actions.ts`** (el otro lado del contrato draft/publish) | exact (es el mismo archivo; el analog aporta el contrato) |
| `.claude/skills/forjo-web-builder/SKILL.md` (MODIFY) | doc / prompt del operador | n/a (documenta el CLI) | sí mismo (no hay otra skill que maneje un write path) | self |
| `test/landing-setup-*.test.ts` (NEW, si el planner extrae el diff-por-sección a un módulo puro) | test | pure-function | `test/landing-editor-draft.test.ts` | exact |

---

## Pattern Assignments

### `scripts/setup-landing.ts` (CLI script, read-modify-write)

#### 1. Parseo de flags — HOY (líneas 61-71)

Helper propio, sin libs. Soporta `--flag valor` y `--flag=valor`. **NO soporta flags booleanos** (`--publish` sin valor devolvería el argv siguiente o `undefined`):

```ts
// ── Helpers de args (sin libs, como setup-admin lee process.argv) ───────────────────
// Lee un flag `--nombre <valor>`; devuelve undefined si no está. Soporta `--nombre=valor` también.
function getFlag(name: string): string | undefined {
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === `--${name}`) return argv[i + 1]
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3)
  }
  return undefined
}
```

> **Gap para D-03:** el planner necesita un `hasFlag(name: string): boolean` nuevo
> (`process.argv.slice(2).includes('--publish')`) — `getFlag('publish')` NO sirve para un flag booleano.

#### 2. Dispatch de modos — HOY (líneas 358-377, dentro de `main()`)

```ts
  // MODO INSPECT: `--inspect <slug>` (read-only). Tiene prioridad: nunca escribe.
  const inspectSlug = getFlag('inspect')
  if (inspectSlug) {
    await runInspect(supabase, inspectSlug)
    return
  }

  // MODO ESCRITURA: `--slug <slug> --config <path>`.
  const slug = getFlag('slug')
  const configPath = getFlag('config')
  if (!slug || !configPath) {
    console.error(
      '[setup-landing] uso:\n' +
        '  npm run setup:landing -- --inspect <slug>            (read-only)\n' +
        '  npm run setup:landing -- --slug <slug> --config <ruta.json>   (escritura)',
    )
    process.exitCode = 1
    return
  }
  await runWrite(supabase, slug, configPath)
```

El bloque de uso/ayuda es el lugar donde se documenta `--publish`.

#### 3. `resolveBusiness` — HOY (líneas 76-104): **el SELECT NO trae `landing_draft`**

```ts
  const { data, error } = await supabase
    .from('businesses')
    .select(
      'id, name, slug, vertical, theme, palette, font, primary_color, whatsapp, landing_config',
    )
    .eq('slug', slug)
    .maybeSingle()
```

Y el tipo de retorno castea `landing_config: unknown`. **Tanto D-01/D-02 (compare) como D-05 (`--inspect` de las dos columnas) requieren agregar `landing_draft` a este select y al cast.** Es el único punto que hay que tocar: `runInspect` y `runWrite` comparten este helper.

#### 4. `--inspect` (read-only) — HOY (líneas 106-158)

El resumen es un objeto plano que se `console.log(JSON.stringify(resumen, null, 2))`. Solo vuelca `landing_config`:

```ts
  const resumen = {
    id: biz.id,
    nombre: biz.name,
    slug: biz.slug,
    vertical: biz.vertical,
    tema_actual: { theme: biz.theme, palette: biz.palette, font: biz.font, primary_color: biz.primary_color },
    whatsapp: biz.whatsapp,
    servicios_activos: serviceNames.length,
    servicios: serviceNames,
    // Volcado COMPLETO del landing_config actual (o null si no hay). [...] Sigue read-only:
    // solo se imprime. Si ya hay config, re-correr la escritura lo SOBRE-ESCRIBE (A4).
    landing_config: biz.landing_config ?? null,
  }
  console.log('[setup-landing] inspect (read-only) —', slug)
  console.log(JSON.stringify(resumen, null, 2))
```

D-05 extiende este objeto: `al_aire: landing_config` + `pendiente_de_aprobacion: landing_draft` + el flag derivado del compare. El comentario de las líneas 150-153 (que dice "re-correr la escritura lo SOBRE-ESCRIBE") **ya no es cierto por defecto** tras D-03 — hay que actualizarlo.

#### 5. El GATE de validación — HOY (líneas 304-311): **ÉSTE es el bug a arreglar**

```ts
  // 4) GATE (SKILL-04 / T-10-06): validar con parseLandingConfig ANTES de escribir. Si devuelve null
  //    o el DEFAULT (señal de inválido) → abortar SIN UPDATE. Nunca escribir un config que rompería el render.
  const parsed = parseLandingConfig(landingConfig)
  if (!parsed || parsed === DEFAULT_LANDING_CONFIG) {
    console.error('[setup-landing] el config armado NO pasó parseLandingConfig — abortado, no se escribe.')
    process.exitCode = 1
    return
  }
```

Import actual (línea 40): `import { parseLandingConfig, DEFAULT_LANDING_CONFIG } from '@/lib/landing/schema'`.

Reemplazo (Claude's Discretion del CONTEXT): `parseLandingConfigForWrite` de `@/lib/landing/write`, que devuelve un **discriminated union** (ver §Shared Patterns). Ojo: `parsed` deja de ser el config y pasa a ser `parsed.data`.

#### 6. El `.update()` de las DOS columnas — HOY (líneas 313-331): **verbatim, el comentario que D-03 debe REEMPLAZAR (no borrar)**

```ts
  // 5) UPDATE filtrado por id resuelto del slug (NUNCA por slug — Pitfall 6 / T-10-07). Aislamiento por business_id.
  //
  // ⚠ SE ESCRIBEN LAS DOS COLUMNAS, y no es "por las dudas": desde Phase 15 (migración 050) el dato
  // está partido en `landing_config` = LO PUBLICADO y `landing_draft` = LO QUE EL DUEÑO EDITA. Este
  // script ES un publish (el operador arma la web y la deja al aire), así que tiene que dejar el
  // MISMO invariante que publishLanding(): después de escribir, draft == published.
  // Si escribiera solo landing_config, el borrador del dueño quedaría desincronizado (con la web
  // VIEJA): al abrir /web vería su borrador anterior, el indicador le diría "Guardado — sin
  // publicar" y el botón Publicar —que es exactamente lo que la barra le pide tocar— REVERTIRÍA la
  // web que el operador acaba de armar. No hay historial ni undo: sería pérdida de datos silenciosa.
  const { error: updErr } = await supabase
    .from('businesses')
    .update({ landing_config: parsed, landing_draft: parsed })
    .eq('id', businessId)
  if (updErr) {
    console.error('[setup-landing] UPDATE de landing_config/landing_draft falló:', updErr.message)
    process.exitCode = 1
    return
  }
```

Ese comentario es el commit `f98ed6b` (fix CR-01). El incidente que describe **sigue siendo real en el camino `--publish`**: por eso D-03b escribe las DOS columnas con el mismo objeto parseado. El comentario nuevo debe conservar la explicación y añadir la bifurcación default(draft-only) / `--publish`(las dos).

#### 7. El mensaje de cierre — HOY (líneas 333-336)

```ts
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  console.log(`✓ landing_config + landing_draft actualizados para "${slug}" (business ${businessId}).`)
  console.log(`  Preview (force-dynamic, inmediata): ${appUrl}/${slug}`)
```

Con D-03 este copy miente en el camino default (no hay preview pública). Hay que bifurcarlo.

#### 8. Dónde NO vive el checkpoint humano

**El checkpoint humano pre-escritura NO está en el script — está en el SKILL.md (paso 6).** El script no tiene ningún `readline`/prompt interactivo: cuando arranca, ya está aprobado. Ver §"Gap: no existe prompt interactivo".

---

### `.claude/skills/forjo-web-builder/SKILL.md` (doc del operador)

Estructura: frontmatter YAML (`name` + `description` multilínea con triggers) → intro → **Prerrequisitos** → **Flujo (paso a paso)** numerado 1..8 con un bloque **MODO EDICIÓN** intercalado entre el paso 2 y el 3 → **Guardrails / No-goals** → **Reusos declarados**. Comandos en bloques ```powershell.

Los cuatro puntos exactos que la fase debe reescribir:

| Ubicación | Texto de hoy | Por qué cambia |
|---|---|---|
| Paso 2 (línea 60) | "Si ya tiene `landing_config: poblado`, avisá al operador que la escritura lo **sobre-escribe**." | Con D-03 la escritura default NO toca lo publicado. Y `--inspect` ahora vuelca las dos columnas (D-05). |
| MODO EDICIÓN paso 1 (líneas 74-85) | "El `--inspect` extendido **vuelca el `landing_config` completo**" → reconstruye desde **lo publicado** | D-04: reconstruir SIEMPRE desde `landing_draft`, con fallback a `landing_config` si es `NULL`. |
| MODO EDICIÓN paso 4 (líneas 94-98) + Paso 6 (líneas 213-226) — el **CHECKPOINT BLOQUEANTE** | Muestra secciones/tema/imágenes/copy; nada sobre choque con el dueño | D-01/D-02: colgar acá el aviso `⚠ El dueño tiene cambios sin publicar…`. **No es un gate nuevo** — es un ítem más del checkpoint que ya existe. |
| Paso 7 (líneas 228-247) + Guardrail "Escritura SOLO por `setup:landing`" (línea 270) | `GATE parseLandingConfig` → `UPDATE ... WHERE id = businessId` | Pasa a `parseLandingConfigForWrite`, escribe `landing_draft`, y `--publish` es opt-in explícito. |

Comando canónico de escritura documentado hoy (paso 7, línea 238):
```powershell
npm run setup:landing -- --slug <slug> --config landing-payloads/<slug>.json
```

---

## Shared Patterns

### Validador ESTRICTO de escritura (el que el script debe usar)

**Source:** `lib/landing/write.ts`
**Apply to:** el gate de `scripts/setup-landing.ts` (reemplaza `parseLandingConfig`)

```ts
export type WriteError = 'invalid_config' | 'config_too_large'

export function parseLandingConfigForWrite(
  input: unknown
): { ok: true; data: LandingConfig } | { ok: false; error: WriteError }
```
- Import: `import { parseLandingConfigForWrite } from '@/lib/landing/write'`
- También exporta `SECTION_DATA_SCHEMAS` (Record exhaustivo sobre `SECTION_TYPES`) y `MAX_CONFIG_BYTES = 256 * 1024`.
- Valida el `data` de CADA sección contra el schema de su tipo (T-15-16) y **rechaza**; nunca degrada a `{}`.

Uso canónico (de `_landing-actions.ts:107-108` — copiar esta forma):
```ts
    const parsed = parseLandingConfigForWrite(input)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    // ...luego: .update({ landing_draft: parsed.data })
```

### Compare canónico (D-01/D-02)

**Source:** `lib/landing/editor-draft.ts`
**Apply to:** el aviso de choque + el flag de `--inspect`

```ts
export function configsEqual(a: LandingConfig, b: LandingConfig): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}
```

**⚠ TRAP para el planner:** `canonical` **NO está exportado** — es `function canonical(v: unknown): unknown` privada del módulo (línea 214). El CONTEXT lo nombra como si lo estuviera. Opciones para el diff **por sección** de D-02:
- **(a)** comparar sección a sección con `JSON.stringify(canonical(sectionA)) === ...` → requiere **exportar `canonical`** (una palabra, cero riesgo, ya testeado indirectamente); o
- **(b)** escribir un helper `diffSections(draft, published): SectionType[]` **en `lib/landing/editor-draft.ts`** (módulo puro, sin React/Supabase — regla dura declarada en su cabecera, líneas 10-12) y unit-testearlo.

Exports públicos del módulo, para nombrarlos con precisión: `normalizeSections`, `moveSection`, `toggleSection`, `setSectionData`, `setTheme`, `stripPrimary`, `setMotion`, `configsEqual`, `isDirty`, `deriveEditorState`, `deriveStateLabel`, tipos `EditorState` / `Section`.

Por qué NO sirve un `JSON.stringify` crudo (cabecera del módulo, líneas 193-213): **Postgres reordena las claves del `jsonb`** → dos configs semánticamente idénticos serializan distinto y el compare daría "distinto" siempre. Es el bug más probable de la fase y **no lo agarra el type-check**.

### El otro lado del contrato (referencia, NO se llama desde el script)

**Source:** `app/(dashboard)/web/_landing-actions.ts`
- `saveLandingDraft(input: unknown): Promise<Result>` → `.update({ landing_draft: parsed.data })` **solo el borrador**.
- `publishLanding(): Promise<Result>` → SIN ARGUMENTOS; lee `landing_draft` de la DB, lo pasa por `parseLandingConfigForWrite`, y `.update({ landing_config: parsed.data })` **dejando el borrador intacto**.
- `discardLandingDraft(): Promise<Result>` → `.update({ landing_draft: business.landing_config ?? null })`.
- `Result = { ok: true } | { ok: false; error: string }`; errores snake_case (`invalid_config`, `config_too_large`, `invalid_draft`, `no_draft`, `not_entitled`, `cms_disabled`).
- Todas son session-client + `owner_id = auth.uid()` + gate `CMS_ENABLED` — **nada de esto aplica al script** (service-role, sin sesión, sin flag). El script es el actor externo cuyo borrador corrupto `publishLanding` explícitamente se niega a publicar (comentario líneas 173-177).

**Invariante que D-03b preserva:** post-`--publish`, `landing_draft === landing_config` byte a byte (el MISMO objeto `parsed.data`), así el dueño abre el editor en `✓ Publicado` (`deriveEditorState` → `configsEqual(savedBaseline, published)` → `'published'`).

### Convenciones de scripts CLI service-role

**Source:** `scripts/setup-admin.ts` (y la cabecera de `setup-landing.ts`)
**Apply to:** cualquier cambio estructural del script

```ts
import { config } from 'dotenv'
config({ path: '.env.local' })   // tsx NO auto-carga .env.local
// ...
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
// errores: console.error('[setup-landing] ...') + process.exitCode = 1 + return  (NUNCA process.exit())
// éxito:   console.log('✓ ...')
main().catch((e) => {
  console.error('[setup-landing] falló:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
```
Cabecera de comentario en español explicando **por qué** es un script local y no un endpoint (invariante D10-01 / SKILL-04) — se conserva.

### Tests (Vitest)

**Comando:** `npm test` (= `vitest run`) · watch: `npm run test:watch`
**Config:** `vitest.config.mts` → `environment: 'node'`, `setupFiles: ['./vitest.setup.ts']` (carga `.env.local`), `vite-tsconfig-paths` resuelve el alias `@/*`.
**Include:** el default de Vitest → coexisten tests **colocados** (`lib/landing/write.test.ts`, `lib/landing/lightbox.test.ts`) y tests en **`test/`** (`test/landing-*.test.ts`). Los de landing viven mayormente en `test/`:
`test/landing-editor-draft.test.ts` (517 líneas — cubre `configsEqual`/`isDirty`/`deriveEditorState`), `test/landing-write.test.ts` (300), `landing-schema`, `landing-builder`, `landing-derive`, `landing-theme`, `landing-seo`, `landing-editor-upload`, `landing-whatsapp`.

**Analog exacto para un test del diff-por-sección** → `test/landing-editor-draft.test.ts` (líneas 1-35):
```ts
import { describe, it, expect } from 'vitest'
import { configsEqual, deriveEditorState /* ... */ } from '@/lib/landing/editor-draft'
import { SECTION_TYPES } from '@/lib/landing/schema'
import type { LandingConfig } from '@/lib/landing/schema'

// Config base con las 8 secciones fijas en orden 0..7 (el shell siembra algo así al cargar).
function baseConfig(): LandingConfig {
  return {
    theme: { preset: 'forjo', overrides: { palette: 'red' } },
    motion: 'subtle',
    sections: SECTION_TYPES.map((type, i) => ({ type, enabled: true, order: i })),
  }
}
```
Estilo: `describe('<fn> (<qué prueba en español>)')` + `it('...')`, funciones puras, sin Supabase ni creds, sin mocks.

**Consecuencia de diseño para el planner:** los tests solo pueden cubrir **funciones puras**. `scripts/setup-landing.ts` NO es testeable (side-effects, `process.argv`, service-role). Si quiere cobertura del diff de D-02, la lógica tiene que vivir en `lib/landing/editor-draft.ts` (o un módulo puro hermano) y el script solo consumirla.

---

## No Analog Found (gaps que el planner tiene que resolver de cero)

| Necesidad | Por qué no hay analog |
|---|---|
| **Flag booleano** (`--publish`) | `getFlag()` solo lee `--x <valor>`. `setup-admin.ts` lee `process.argv[2]` posicional; `setup-mp-plans.ts` (60 líneas) no parsea flags. Ningún script del repo tiene un flag booleano hoy. |
| **Prompt interactivo de confirmación** | **NO existe en ningún script del repo.** Ni `readline`, ni `prompts`, ni `inquirer`. El checkpoint humano de D-01 vive **en el SKILL.md** (el agente muestra y espera aprobación), no en el proceso Node. El script solo **imprime** el aviso; quien bloquea es el flujo de la skill. Ojo: agregar un prompt interactivo sería una dependencia y un patrón nuevos — el aviso impreso + el gate del SKILL.md es lo consistente con lo existente. |
| **`canonical` exportado** | Es privado en `lib/landing/editor-draft.ts:214`. Ver §Compare canónico. |
| **`landing_draft` en el script** | El `select` de `resolveBusiness` no lo trae; el script nunca lo lee (solo lo escribe a ciegas). |

---

## Metadata

**Analog search scope:** `scripts/`, `lib/landing/`, `app/(dashboard)/web/`, `test/`, `.claude/skills/forjo-web-builder/`
**Files scanned:** 12
**Pattern extraction date:** 2026-07-13
