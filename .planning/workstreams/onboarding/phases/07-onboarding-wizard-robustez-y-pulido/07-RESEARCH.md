# Phase 7: Onboarding wizard — robustez + pulido - Research

**Researched:** 2026-07-17
**Domain:** Next.js 16 App Router (RSC + route handlers) + Supabase (RLS multi-tenant, service-role, Storage) — pulido de un wizard client-side existente
**Confidence:** HIGH

## Summary

Los cuatro cambios caen sobre una sola superficie ya construida (`app/(onboarding)/onboarding/page.tsx`, un client component de 4 pasos) y **ninguno requiere migración numerada**. Todo lo que hace falta ya existe en el repo como patrón probado en producción: el endpoint service-role-por-slug (`booking/availability`), el upload de logo (`settings-client.tsx` → bucket `logos` + columna `businesses.logo_url`, que **ya existe**), el selector de paleta de Ajustes (que queda como único lugar de configuración), y el signOut canónico (`sidebar.tsx`).

El hallazgo más importante para la autonomía de la fase: **ONB-03 NO necesita una columna nueva** — `businesses.logo_url` está en el baseline (`00000000000000_baseline.sql:166`) y el bucket `logos` + su RLS ya están desplegados. Por lo tanto **Phase 7 es completamente autónoma**: sin migración, sin deploy coordinado, sin checkpoint humano.

La única corrección al CONTEXT: D-05 sugiere reusar `lib/landing/editor-upload.ts` (bucket `landing-assets`), pero el patrón correcto para un **logo de negocio** es el de `settings-client.tsx` (bucket `logos`). La migr. 051 lo dice explícitamente: *"NO afecta la subida del LOGO de Configuración: usa OTRO bucket, no `landing-assets`"*. Ambos buckets exigen que el negocio exista y sea del owner (aislamiento por primer segmento del path), así que el racional de D-05 (subir al finalizar) se sostiene igual — solo cambia qué bucket/helper se reusa.

**Primary recommendation:** Un solo plan que toca únicamente `onboarding/page.tsx` + un route handler nuevo (`app/api/onboarding/slug-available/route.ts`). Reusar `uploadLogo` de settings (bucket `logos`), copiar el shape de `booking/availability` para el endpoint (devolver SOLO `{ available: boolean }`), borrar el bloque de paleta, y agregar el botón de cerrar sesión con el patrón de `sidebar.tsx`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (ONB-01):** El chequeo de disponibilidad va por un **endpoint service-role** (route handler bajo `app/api/`), mismo patrón que `booking/availability` — NO una RPC `security definer` (evita migración numerada + deploy coordinado). El chequeo actual (`onboarding/page.tsx` L113-123) corre con el cliente autenticado bajo RLS (`businesses` solo tiene policy `owner access`), así que no ve slugs ajenos → dice "disponible" y falla recién en el insert.
- **D-02 (invariante de seguridad):** el endpoint expone **SOLO existencia** — un booleano `{ available: boolean }`, cero datos del negocio dueño. El service-role bypassa RLS, así que el handler tiene que devolver únicamente el booleano y nada más (ni id, ni owner, ni nombre). Es multi-tenant: un leak acá expone qué negocios existen por nombre.
- **D-03 (UX):** feedback **temprano** al escribir el nombre (debounce, como el checkSlug de hoy) + un mensaje claro "ese nombre ya está en uso" si está tomado — nunca el "Error al crear el negocio" opaco al final. El insert mantiene su guardia (constraint `businesses_slug_key`) como red de seguridad ante la carrera.
- **D-04 (ONB-02):** Un usuario autenticado **sin negocio** puede salir del onboarding: un botón claro de **cerrar sesión** (signOut → `/login`), para el caso de haber entrado con la cuenta equivocada. No lo obliga a crear el negocio para escapar.
- **D-05 (ONB-03):** El logo se **elige y previsualiza en el paso 1** (Negocio), pero el archivo se **sube recién al finalizar** el wizard, cuando el negocio ya se creó. Razón: el bucket de storage tiene RLS de INSERT que exige que el negocio exista y sea del owner — en el paso 1 todavía no existe. Subir al finalizar sidestepea eso, evita archivos huérfanos si abandona, y el usuario no nota la diferencia.
- **D-06 (ONB-04):** Se **quita el selector de paleta del paso 1** (el estado `palette`, `selectPalette`, el `data-palette` que aplica en vivo, y el bloque de swatches). El negocio nuevo se crea con la **paleta default** (`'red'`). La paleta **sigue configurable en Ajustes** — NO se elimina la feature ni la columna `businesses.palette`.

### Claude's Discretion
- Detalle visual del input de logo (dropzone vs botón) y del botón de salida: seguir el design system existente y el patrón de `editor-upload` / `settings-client`.

### Deferred Ideas (OUT OF SCOPE)
- None — la discusión se mantuvo en scope. El theming de auth (ONB-05) es Phase 8, a propósito.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ONB-01 | Chequeo de slug que vea el espacio global (no solo el propio owner) | Nuevo route handler service-role copiando `booking/availability` (§Pattern 1). Devuelve `{ available: boolean }`. `checkSlug` se reapunta de query RLS a `fetch`. |
| ONB-02 | Salida del wizard (cerrar sesión → /login) | Patrón `handleLogout` de `sidebar.tsx:91-95` (§Pattern 4): `signOut()` + `router.push('/login')` + `router.refresh()`. |
| ONB-03 | Subir logo del negocio en el paso 1 | Columna `businesses.logo_url` YA existe (baseline:166); bucket `logos` YA existe; patrón `uploadLogo` de `settings-client.tsx:321-337` (§Pattern 2). Sin migración. |
| ONB-04 | Sacar el selector de paleta del wizard | Borrar `PALETTES`/`palette`/`selectPalette`/swatch block; default en el insert. Selector de Ajustes ya cubre el post-onboarding (§ONB-04). |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Chequeo de slug global (ONB-01) | API / Backend (route handler service-role) | — | Requiere bypassear RLS para ver slugs de otros tenants; el aislamiento se garantiza a mano devolviendo solo el booleano. Nunca del lado del cliente. |
| Debounce + feedback de slug (ONB-01) | Browser / Client | API | La UX (debounce, mensaje) vive en el wizard; la verdad (existencia) la resuelve el endpoint. |
| Upload de logo (ONB-03) | Browser / Client → Storage | Database (`businesses.logo_url`) | El browser session client sube al bucket `logos` (RLS owner-scoped); la URL se persiste en la fila del negocio. |
| Cerrar sesión (ONB-02) | Browser / Client | Auth (Supabase) | `supabase.auth.signOut()` desde el client + navegación. |
| Quitar paleta (ONB-04) | Browser / Client | — | Solo se borra estado/UI del wizard; la persistencia default va en el insert existente. |

## Standard Stack

Sin dependencias nuevas. Todo el stack ya está instalado y en uso en esta misma superficie.

### Core (ya presentes)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.7 | Route handlers (`app/api/.../route.ts`), App Router | Framework del proyecto [VERIFIED: package.json / CLAUDE.md] |
| `@supabase/supabase-js` | ^2.106.2 | `createAdminClient` (service-role) + browser client (`createClient`) | Cliente Postgres/Auth/Storage del repo [VERIFIED: CLAUDE.md] |
| `@supabase/ssr` | ^0.10.3 | Cliente browser con cookies para `onboarding/page.tsx` | Ya usado por el wizard [VERIFIED: import en page.tsx] |
| `sonner` | ^2.0.7 | Toasts de feedback (error de slug, error de upload) | Ya usado en el wizard [VERIFIED: import en page.tsx] |
| `lucide-react` | ^1.17.0 | Iconos (LogOut, Upload/ImageIcon para el logo) | `iconLibrary` del proyecto [VERIFIED: CLAUDE.md] |

**Installation:** ninguna — cero paquetes nuevos.

## Package Legitimacy Audit

> No aplica: la fase **no instala ningún paquete externo**. Toda la implementación reusa dependencias ya presentes en `package.json`. Sin superficie de slopsquatting.

## Architecture Patterns

### System Architecture Diagram

```text
ONB-01 (chequeo de slug)
─────────────────────────────────────────────────────────────
 [Wizard step 1]  name → slugify → debounce(500ms)
        │
        │  fetch GET /api/onboarding/slug-available?slug=<slug>
        ▼
 [Route handler]  createAdminClient() (service-role, bypassa RLS)
        │           .from('businesses').select('id').eq('slug', slug).maybeSingle()
        ▼
   Response.json({ available: <!data> })   ← SOLO booleano, nada más (D-02)
        │
        ▼
 [Wizard]  setSlugAvailable(available) → "✓ Disponible" / "✗ Ya está en uso"

ONB-03 (logo)  — el archivo se sube AL FINALIZAR
─────────────────────────────────────────────────────────────
 [Step 1]  <input type=file> → validar(2MB, jpeg/png/webp) → preview (objectURL)
                                            │ (File guardado en estado)
 [handleFinish]  insert businesses → business.id
        │
        ├─► storage.from('logos').upload(`${business.id}/logo.${ext}`, file, {upsert:true})
        │        │  (RLS: 1er segmento del path = business del owner → exige que exista)
        │        ▼
        │   getPublicUrl → update businesses.logo_url = url
        └─► insert services / professionals / time_blocks (SIN CAMBIOS) → /dashboard

ONB-02 (salida)          ONB-04 (paleta)
──────────────────       ──────────────────────────────────────
 [Header/nav del wizard]  Se BORRAN del step 1: PALETTES, palette state,
   botón "Cerrar sesión"  selectPalette, data-palette live-apply, swatch UI.
   → signOut()            El insert usa default fijo: palette:'red',
   → router.push('/login')  primary_color:'#d94a2b'.
   → router.refresh()
```

### Pattern 1: Route handler service-role por slug (ONB-01)

**What:** GET handler que resuelve por `slug` con service-role y devuelve el mínimo indispensable.
**When to use:** cuando el dato a chequear existe fuera del scope RLS del usuario (slugs de otros tenants).
**Molde exacto (de `app/api/booking/availability/route.ts`):**

```typescript
// app/api/onboarding/slug-available/route.ts   [CITED: app/api/booking/availability/route.ts:18-34]
import { createAdminClient } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'   // nunca cachear un chequeo de disponibilidad

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const slug = (searchParams.get('slug') || '').toLowerCase()
  // Validación de shape mínima (coherente con el slugify del wizard: [a-z0-9-], >=3)
  if (!slug || slug.length < 3 || !/^[a-z0-9-]+$/.test(slug)) {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }

  const supabase = createAdminClient()   // service-role: bypassa RLS, ve TODOS los slugs
  const { data } = await supabase
    .from('businesses')
    .select('id')            // SOLO id, y NO se serializa (D-02: nada del negocio ajeno sale)
    .eq('slug', slug)
    .maybeSingle()           // maybeSingle: no-match no es error (a diferencia de .single())

  // INVARIANTE D-02: la respuesta es EXCLUSIVAMENTE el booleano de existencia.
  return Response.json({ available: !data }, { headers: { 'Cache-Control': 'no-store' } })
}
```

**Cómo cambia `checkSlug` en el wizard (page.tsx L113-123):**

```typescript
const checkSlug = useCallback(async (value: string) => {
  if (!value || value.length < 3) return
  setSlugChecking(true)
  try {
    const res = await fetch(`/api/onboarding/slug-available?slug=${encodeURIComponent(value)}`)
    const json = await res.json()
    setSlugAvailable(json.available === true)   // fail-safe: solo true habilita
  } catch {
    setSlugAvailable(null)                       // error de red → estado indeterminado, no "disponible"
  } finally {
    setSlugChecking(false)
  }
}, [])   // ya NO depende de `supabase`
```

- **Ubicación recomendada:** `app/api/onboarding/slug-available/route.ts`. Intención clara y no ensucia el dominio `booking/`. (Alternativa: `app/api/business/slug-available/` — misma validez; elegir una y ser consistente.)
- **Debounce:** el `useEffect` con `setTimeout(500)` (L135-138) queda **idéntico** — solo cambia el cuerpo de `checkSlug`.
- **`.maybeSingle()` vs `.single()`:** el `checkSlug` actual usa `.single()`, que emite error PGRST116 cuando no hay fila (slug libre) — funciona por accidente porque se ignora el error. En el endpoint usar `.maybeSingle()` es lo correcto (no-match = `data: null`, sin error).
- **Proxy/middleware:** `proxy.ts` corre `updateSession` sobre `/api/*`. El endpoint es llamado por el usuario ya autenticado del onboarding, así que pasa sin fricción (no hace falta excluirlo del matcher).

### Pattern 2: Upload de logo al bucket `logos` + persistir en `businesses.logo_url` (ONB-03)

**What:** subir el archivo del logo al bucket `logos` bajo el prefijo del negocio y guardar la URL pública en la columna existente.
**When to use:** logo del negocio (NO es un asset de la landing/CMS — ese usa `landing-assets`).
**Molde exacto (de `settings-client.tsx:321-337`):**

```typescript
// En handleFinish, DESPUÉS de crear el negocio y tener business.id:   [CITED: settings-client.tsx:321-337]
if (logoFile) {
  const ext = logoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${business.id}/logo.${ext}`   // 1er segmento = business del owner → RLS OK
  const { error: upErr } = await supabase.storage.from('logos').upload(path, logoFile, { upsert: true })
  if (!upErr) {
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
    await supabase.from('businesses').update({ logo_url: `${publicUrl}?t=${Date.now()}` }).eq('id', business.id)
  }
  // Best-effort: si el upload falla, el negocio YA se creó → loguear y seguir al dashboard,
  // NUNCA romper el finish (mismo criterio que linkLeadOnSignup, page.tsx:352-356).
}
```

**Validación en el `onChange` del input (paso 1), verbatim de `handleLogoSelect` (settings-client.tsx:311-319):**

```typescript
function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  if (file.size > 2 * 1024 * 1024) { toast.error('El archivo no puede superar 2MB'); return }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    toast.error('Formato no soportado. Usá JPG, PNG o WebP'); return
  }
  setLogoFile(file)
  setLogoPreview(URL.createObjectURL(file))
}
```

- **Estado nuevo en el wizard:** `logoFile: File | null` y `logoPreview: string | null`. Preview con `URL.createObjectURL(file)`; mostrar con `next/image` (ya importado) o `<img>` — el proyecto usa `next/image` (Core Web Vitals eslint), pero un objectURL de preview local es aceptable con `<img>` (no optimizable). Seguir el render de settings (`logoPreview || currentLogo`).
- **`businesses.logo_url` YA existe** — `00000000000000_baseline.sql:166` (`"logo_url" "text"`) y `lib/types.ts:16` (`logo_url: string | null`). **Sin migración.**
- **Por qué NO `editor-upload.ts` / `landing-assets`:** ese helper es para imágenes del CMS de la landing (Phase 14), bucket `landing-assets`, gateado por `has_web_custom` (migr. 051). El logo del negocio es otra cosa y tiene su propio bucket (`logos`) sin gate de entitlement. La migr. 051:24 lo confirma: *"NO afecta la subida del LOGO de Configuración: usa OTRO bucket, no `landing-assets`"*. **Reusar `settings-client.uploadLogo`, no `editor-upload`.** (`buildUploadPath` de editor-upload es un helper puro de path para landing-assets; no aplica al logo.)
- **RLS del bucket `logos`:** owner-scoped por el primer segmento del path (`{business.id}/...`) — exige que el negocio exista y sea del owner autenticado. Por eso el upload va **al finalizar** (D-05 correcto). El bucket `logos` no está en el baseline SQL público (las policies de `storage.objects` viven en el schema `storage`, fuera del dump y OFF en el reset local), pero está desplegado en prod y probado por el flujo de Ajustes.

### Pattern 3: Default de paleta en el insert (ONB-04)

Tras borrar el selector, el insert de `businesses` (page.tsx:288-304) debe quedar con valores fijos:

```typescript
palette: 'red',
primary_color: '#d94a2b',   // el swatch del 'red' actual (PALETTES[0].swatch), hardcodeado
```

Esto elimina la dependencia de la const `PALETTES` (que se borra) en el insert. `primary_color` es back-compat (comentario existente en L300).

### Pattern 4: Cerrar sesión (ONB-02)

**Molde canónico del repo (`components/dashboard/sidebar.tsx:91-95`, idéntico en `crm-sidebar.tsx:143`):**

```typescript
async function handleLogout() {
  await supabase.auth.signOut()
  router.push('/login')
  router.refresh()   // limpia el cache RSC para que el guard del proxy reevalúe sin sesión
}
```

- El wizard ya tiene `const supabase = createClient()` (L79) y `const router = useRouter()` (L78) — no hace falta nada nuevo.
- **Ubicación del botón:** en el header del wizard (junto al lockup de Forjo, L414-422) o en el cluster de navegación. Icono `LogOut` de lucide, `variant="ghost"`, texto claro ("Cerrar sesión" / "Salir"). Debe ser visible en el paso 1 (donde el usuario "atrapado" con la cuenta equivocada lo necesita) — idealmente en todos los pasos.

### Anti-Patterns to Avoid
- **Devolver algo más que el booleano en `slug-available`:** ni `id`, ni `name`, ni `owner_id`, ni el objeto entero. El service-role bypassa RLS; cualquier campo extra es una fuga cross-tenant (T-07-01).
- **Reusar `landing-assets`/`editor-upload` para el logo:** bucket equivocado + gate de entitlement (`has_web_custom`) que un negocio nuevo NO tiene → el upload sería rechazado. Usar `logos`.
- **Subir el logo en el paso 1:** el negocio todavía no existe → la RLS del bucket rechaza el INSERT. Subir en `handleFinish` tras tener `business.id` (D-05).
- **Bloquear el finish si el upload de logo falla:** el negocio ya se creó; el logo es best-effort. No romper el redirect al dashboard.
- **Regresionar el resto del `handleFinish`:** services/professionals/time_blocks/`linkLeadOnSignup` quedan **idénticos**. El logo se inserta como paso adicional, sin tocar la lógica existente.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chequeo de slug global | Query RLS desde el client / RPC security-definer nueva | Route handler service-role copiando `booking/availability` | Evita migración + deploy coordinado (D-01); patrón ya probado |
| Upload de logo | Nuevo helper de storage / bucket nuevo | `settings-client.uploadLogo` (bucket `logos`) | Ya resuelto: path, validación, RLS, columna |
| Selector de paleta post-onboarding | Reconstruir en el wizard | Ajustes (`settings-client.tsx`) ya lo tiene | ONB-04 solo BORRA del wizard |
| Cerrar sesión | Custom auth flow | `supabase.auth.signOut()` + `router.push` (sidebar.tsx) | Patrón canónico del repo |

**Key insight:** esta fase es 90% borrar/reapuntar y 10% código nuevo (un route handler de ~15 líneas). Todo lo "difícil" (storage RLS, service-role, signOut) ya está resuelto y en producción.

## Common Pitfalls

### Pitfall 1: Fuga cross-tenant en el endpoint de slug (el threat-model central)
**What goes wrong:** el handler devuelve el registro del negocio (o campos de más), permitiendo enumerar qué negocios existen por nombre y filtrar datos del owner ajeno.
**Why it happens:** `createAdminClient()` bypassa RLS — la protección que en el resto del app da la policy `owner access` acá NO aplica; el aislamiento es responsabilidad manual del handler.
**How to avoid:** `select('id')` + `.maybeSingle()` y serializar **solo** `{ available: !data }`. Nunca hacer spread del objeto ni devolver el row.
**Warning signs:** cualquier `Response.json` en ese archivo que incluya algo distinto de `available`. → Amenaza **T-07-01** para `/gsd:secure-phase`.

### Pitfall 2: Bucket equivocado para el logo
**What goes wrong:** usar `landing-assets`/`editor-upload` → el INSERT lo rechaza porque un negocio nuevo no tiene `has_web_custom` (gate de migr. 051), o el objeto queda en el bucket del CMS.
**Why it happens:** el CONTEXT/D-05 menciona `editor-upload.ts` como referencia de "patrón de upload", pero ese es para assets de la landing.
**How to avoid:** usar el bucket `logos` y la columna `businesses.logo_url`, como `settings-client.uploadLogo`.
**Warning signs:** `.from('landing-assets')` o `import ... editor-upload` en el código del logo.

### Pitfall 3: Timing del upload vs RLS del bucket
**What goes wrong:** subir el logo antes de crear el negocio → 403 de la policy (el path `{business.id}/` no matchea ningún negocio del owner).
**How to avoid:** guardar el `File` en estado en el paso 1; hacer `upload` en `handleFinish` recién con `business.id`.
**Warning signs:** llamada a `storage.upload` fuera de `handleFinish`.

### Pitfall 4: Regresión del handoff onboarding→panel
**What goes wrong:** al agregar el logo o borrar la paleta se altera por accidente la creación de services/professionals/time_blocks o el `linkLeadOnSignup`.
**How to avoid:** tratar el logo como un paso ADITIVO al final del `try` de `handleFinish`; no reordenar ni tocar los inserts existentes. El insert de `businesses` solo cambia dos campos (palette/primary_color a default fijo).
**Warning signs:** diffs en las líneas 311-356 de page.tsx más allá de agregar el bloque de logo.

### Pitfall 5: `slugAvailable` en estado indeterminado tras error de red
**What goes wrong:** un `fetch` fallido deja `slugAvailable` en un valor viejo y el usuario avanza con un slug no verificado.
**How to avoid:** en el `catch` del nuevo `checkSlug`, `setSlugAvailable(null)`; `canGoNext` ya exige `slugAvailable === true` (L398), y el insert conserva la guardia del constraint `businesses_slug_key` como red final (D-03).

## Runtime State Inventory

> Fase de refactor/pulido sobre datos nuevos (negocios que aún no existen). No hay renombrado de strings ni migración de datos existentes.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Ninguno — el wizard CREA datos nuevos; no renombra ni migra registros existentes. | None |
| Live service config | Ninguno. | None |
| OS-registered state | Ninguno. | None |
| Secrets/env vars | `SUPABASE_SERVICE_ROLE_KEY` ya existe y lo usa `createAdminClient` (el endpoint nuevo lo reusa). Sin claves nuevas. | None |
| Build artifacts | Ninguno. | None |

**Nada nuevo que registrar:** la fase no introduce estado runtime fuera del repo.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `checkSlug` con `.from('businesses').select('slug').eq('slug',v).single()` bajo RLS | `fetch('/api/onboarding/slug-available')` service-role | Esta fase (ONB-01) | Ve el espacio global; feedback correcto |
| Selector de paleta en el wizard | Paleta solo en Ajustes; default al crear | Esta fase (ONB-04) | Onboarding más simple |
| Sin logo en onboarding | Logo en paso 1, sube al finalizar | Esta fase (ONB-03) | Marca desde el arranque |

**Deprecated/outdated:** el uso de `.single()` en `checkSlug` (emite PGRST116 en slug libre, ignorado por accidente) — se reemplaza por `.maybeSingle()` en el endpoint.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | El bucket `logos` sigue existiendo y con RLS owner-scoped por primer segmento del path en prod (no está en el dump SQL público; inferido de `settings-client.uploadLogo` en uso + migr. 051:24). | Pattern 2 | Bajo — el flujo de Ajustes lo ejercita en producción hoy; si estuviera roto, el logo de Ajustes también fallaría. Verificable subiendo un logo desde Ajustes. |
| A2 | Ubicación `app/api/onboarding/slug-available/route.ts` (no hay convención previa para este endpoint; no existe dir `onboarding` en `app/api`). | Pattern 1 | Nulo — decisión de naming; cualquier ubicación válida bajo `app/api/` sirve. |

## Open Questions

1. **¿El botón de cerrar sesión va solo en el paso 1 o en todos los pasos?**
   - Qué sabemos: el caso de uso (cuenta equivocada) aparece apenas entrás; D-04 pide "una salida clara".
   - Qué no está claro: si molesta visualmente en pasos 2-4.
   - Recomendación: ponerlo en el header (visible en todos los pasos) — es chrome del wizard, discreto (`variant="ghost"` + icono). Discreción de diseño (D-06/Discretion).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Storage bucket `logos` | ONB-03 upload | ✓ (prod) | — | — (mismo bucket que Ajustes) |
| Columna `businesses.logo_url` | ONB-03 persist | ✓ | baseline:166 | — |
| `SUPABASE_SERVICE_ROLE_KEY` | ONB-01 endpoint | ✓ | — | — |
| Selector de paleta en Ajustes | ONB-04 (queda ahí) | ✓ | settings-client.tsx:182-206, 899 | — |

**Missing dependencies with no fallback:** ninguna.
**Missing dependencies with fallback:** ninguna.

> **Nota Storage local:** el Storage de Supabase local está OFF (Windows) — el upload de logo NO es testeable sin infra. La validación real de ONB-03 es UAT manual (subir un logo en el onboarding) o verificar en staging. Coherente con la estrategia del repo (Phase 14 extrajo la lógica pura del path a `editor-upload.ts` precisamente por esto; acá el logo reusa el patrón imperativo de Ajustes, sin capa pura nueva salvo que se decida testear la construcción del path).

## Security Domain

> `security_enforcement: true` en config → sección requerida. ONB-01 lleva threat model + `/gsd:secure-phase` (multi-tenant, service-role).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | ONB-02: `supabase.auth.signOut()` (patrón del repo). El endpoint de slug es llamado por usuario autenticado. |
| V4 Access Control | **yes (crítico)** | ONB-01: el service-role bypassa RLS → el handler devuelve SOLO `{ available }`; aislamiento manual. ONB-03: RLS del bucket `logos` (owner-scoped por path) exige que el negocio exista/sea del owner. |
| V5 Input Validation | yes | ONB-01: `slug` validado (`/^[a-z0-9-]+$/`, len>=3) antes de la query. ONB-03: `handleLogoSelect` valida tipo (jpeg/png/webp) + tamaño (2MB). |
| V6 Cryptography | no | Sin cripto nueva. |

### Known Threat Patterns for {Next.js route handler service-role + Supabase Storage}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Enumeración de negocios por nombre / fuga de datos del owner ajeno vía `slug-available` | Information Disclosure | **Devolver exclusivamente `{ available: boolean }`** (D-02). Sin `id`/`name`/`owner`. → **T-07-01** |
| Path traversal en el upload de logo (`../` en el filename) | Tampering | Path = `${business.id}/logo.${ext}` con `business.id` de la sesión (UUID de confianza) + `ext` de allowlist implícita; RLS rechaza fuera del prefijo. → **T-07-02** |
| Upload de archivo no-imagen / oversize al bucket | Tampering / DoS | Validación tipo+tamaño en `handleLogoSelect` (2MB, jpeg/png/webp); RLS del bucket como barrera no-bypasseable. → **T-07-03** |
| Abuso del endpoint por anon (si no requiere sesión) para enumerar | Information Disclosure | El endpoint solo expone existencia booleana (ya minimizado). **Mitigación extra opcional y barata:** dado que el usuario del onboarding SIEMPRE está autenticado, gatear el handler a sesión válida (`auth.getUser()`) reduce la superficie de enumeración sin costo de UX. Evaluar en plan/discuss. → **T-07-04** |

**Recomendación de seguridad (regla 14):** la invariante D-02 (solo booleano) es suficiente y es lo locked. Como refuerzo de bajo costo, considerar requerir sesión autenticada en el endpoint (el onboarding siempre la tiene) — no cambia la UX y achica la superficie de enumeración anónima. Decisión del planner; no re-litigar D-01/D-02.

## Sources

### Primary (HIGH confidence)
- `app/api/booking/availability/route.ts` — molde del route handler service-role por slug (leído completo).
- `app/(dashboard)/settings/settings-client.tsx:304-346` — patrón de upload de logo (bucket `logos`, columna `logo_url`) y selector de paleta (182-206, 899).
- `app/(onboarding)/onboarding/page.tsx` — superficie a modificar (leído completo).
- `lib/supabase/admin.ts` — `createAdminClient` (service-role).
- `lib/landing/editor-upload.ts` — patrón de path para `landing-assets` (confirmado NO aplicable al logo).
- `supabase/migrations/00000000000000_baseline.sql:166` — columna `businesses.logo_url` YA existe.
- `supabase/migrations/051_landing_assets_gate_entitlement.sql:24` — el logo usa OTRO bucket que `landing-assets`.
- `components/dashboard/sidebar.tsx:91-95` — patrón canónico de signOut.
- `lib/types.ts:16` — `logo_url: string | null`.
- `.planning/config.json` — `nyquist_validation: false`, `security_enforcement: true`.

### Secondary (MEDIUM confidence)
- `.claude/CLAUDE.md` / `AGENTS.md` — stack, convenciones, invariante multi-tenant, Next 16 (`proxy.ts`).

### Tertiary (LOW confidence)
- Ninguna — todo verificado en el codebase.

## Project Constraints (from CLAUDE.md)

- **Aislamiento por tenant no negociable:** toda query/route/policy que toque datos de un negocio lo garantiza (RLS + `business_id`). El endpoint de ONB-01 usa service-role → garantiza a mano (solo booleano).
- **Service role solo en server:** `SUPABASE_SERVICE_ROLE_KEY` jamás en `NEXT_PUBLIC_*` ni en client. El endpoint corre en runtime Node (route handler).
- **Next 16, NO 14:** middleware = `proxy.ts`; consultar `node_modules/next/dist/docs/` antes de asumir comportamiento de route handlers.
- **Migraciones numeradas 040+ sobre el baseline, aplicadas a mano y en orden.** Esta fase NO agrega migración → sin deploy coordinado.
- **No reescribir archivos completos (regla usuario):** usar `Edit` sobre `onboarding/page.tsx` (cambios parciales); el único `Write` es el route handler nuevo.
- **Respuestas en español; código/paths en inglés.**
- **GSD workflow:** los cambios salen por `/gsd:execute-phase` (workstream `onboarding`, rama desde `main`).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — cero paquetes nuevos, todo en uso en la misma superficie.
- Architecture (endpoint + upload + signOut): HIGH — moldes exactos leídos del repo.
- Migración (autonomía): HIGH — `logo_url` confirmado en baseline; sin migración.
- Pitfalls/seguridad: HIGH — el threat-model (fuga cross-tenant) está claramente acotado a un archivo.

**Research date:** 2026-07-17
**Valid until:** 2026-08-16 (código estable; revalidar si cambia el esquema de `businesses` o los buckets de storage)
