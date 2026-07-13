---
phase: 15-borrador-y-publicacion-nucleo
reviewed: 2026-07-13T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - app/(dashboard)/web/_landing-actions.ts
  - app/(dashboard)/web/page.tsx
  - app/(dashboard)/web/web-client.tsx
  - app/globals.css
  - lib/landing/editor-draft.ts
  - supabase/migrations/050_landing_draft.sql
  - test/isolation.test.ts
  - test/landing-editor-draft.test.ts
findings:
  critical: 2
  warning: 6
  info: 5
  total: 13
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-07-13
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

El núcleo de la fase está bien construido y los 8 puntos del contrato de seguridad se cumplen **de verdad**, no de palabra. Lo verifiqué uno por uno:

1. **Aislamiento multi-tenant:** las 3 Server Actions usan `createClient()` (anon + cookies, RLS) — cero `createAdminClient` en la superficie web. El `business_id` sale siempre de `.eq('owner_id', user.id)`. ✅
2. **`landing_draft` no llega a `anon`:** la vista `public_businesses` (schema.sql:674-694) tiene columnas explícitas y la migración 050 no la toca. Los 4 tests nuevos de `isolation.test.ts` lo cubren con anon-key (sin falso verde por service-role). ✅
3. **`publishLanding()` / `discardLandingDraft()` de cero argumentos:** confirmado; publish lee el borrador de la DB y lo revalida con `parseLandingConfigForWrite` antes de copiarlo. ✅
4. **Gate `has_web_custom` en CADA acción:** las 3 lo chequean tras el flag. ✅
5. **`configsEqual` orden-insensible:** `canonical()` recursa por objetos y arrays (incluye objetos anidados dentro de arrays). El test "dos configs con las MISMAS claves en distinto orden" prueba el caso jsonb. ✅
6. **Fail-safe del renderer:** `parseLandingConfig(null) → null` intacto. ✅
7. **Migración aditiva:** `ADD COLUMN IF NOT EXISTS` + backfill idempotente condicionado a `landing_draft IS NULL`. ✅
8. **Sin `revalidatePath` / `router.refresh()`:** confirmado por grep; el layout público usa `cache()` de React (per-request), no `unstable_cache` → la afirmación "no hay caché que invalidar" se sostiene. ✅

Dicho eso: **la fase abre dos agujeros reales fuera de su propio código**. El primero es una regresión de pérdida de datos que se dispara con el flujo principal del negocio (el operador arma la web con la skill); el segundo es un XSS almacenado que el CMS ahora hace *alcanzable desde la UI* y que este write path persiste y publica. Los dos son BLOCKER y ninguno los agarra el type-check ni los tests actuales.

---

## Critical Issues

### CR-01: El write path del operador (`setup-landing.ts`) sólo escribe `landing_config` — publicar puede REVERTIR la web recién construida

**File:** `app/(dashboard)/web/_landing-actions.ts:139-191` (contrato roto) · `scripts/setup-landing.ts:316` (write path culpable)

**Issue:**
La fase inventa el invariante "`landing_draft` es lo que se edita, `landing_config` es lo que está al aire", pero **el único otro escritor de landing en el repo no lo respeta**. `scripts/setup-landing.ts:316` hace `.update({ landing_config: parsed })` con service-role y **no toca `landing_draft`**.

Secuencia de pérdida de datos, con datos reales del proyecto (la skill `forjo-web-builder` es el camino principal para armar webs):

1. Negocio X ya tiene web al aire (`landing_config` = v1). La migración 050 backfillea `landing_draft` = v1. Consistente.
2. El operador vuelve a correr la skill / `npm run setup:landing` para rehacerle la web → `landing_config` = **v2**. `landing_draft` sigue en **v1**.
3. El dueño abre `/web`. El editor le muestra **v1** (el borrador) y el indicador dice **"Guardado — sin publicar"** (`deriveEditorState`: `savedBaseline`(v1) ≠ `published`(v2)).
4. El dueño toca **Publicar** (que es exactamente lo que el indicador le está pidiendo). `runPublish` → `saveLandingDraft(v1)` → `publishLanding()` copia v1 sobre `landing_config`.
5. **La web v2 que armó el operador desaparece.** No hay historial, no hay undo (D-14 prohíbe tocar Storage y no hay versionado).

El mismo bug, en su versión suave, degrada el flujo de alta: si el operador arma la web *después* de que el dueño abrió el editor y guardó una vez, el dueño nunca ve la web nueva.

**Fix:** el script del operador es un publish, así que tiene que escribir las DOS columnas (mismo invariante que `publishLanding`):

```ts
// scripts/setup-landing.ts:316
const { error: updErr } = await admin
  .from('businesses')
  // Escribir SOLO landing_config dejaría el borrador del dueño desincronizado: al abrir el
  // editor vería su draft viejo y "Publicar" REVERTIRÍA esta web (Phase 15, D-02).
  .update({ landing_config: parsed, landing_draft: parsed })
  .eq('id', businessId)
```

Y agregar a `test/isolation.test.ts` (o a un test de contrato) la aserción de que ningún write path deja `landing_draft` desincronizado de un `landing_config` recién escrito.

---

### CR-02: XSS almacenado — `map_url` acepta `javascript:` y sale a un `<a href>` de la web PÚBLICA

**File:** `app/(dashboard)/web/_landing-actions.ts:107` y `:174` (write/publish path) · `lib/landing/schema.ts:164` (validación floja) · `components/landing/location.tsx:93` (sink)

**Issue:**
`parseLandingConfigForWrite` valida el *envelope*, pero `sectionSchema.data` es `z.unknown()` → el `data` de cada sección se persiste **verbatim**. La única validación de `map_url` corre en RENDER:

```ts
// lib/landing/schema.ts:161-168
export const locationData = z.object({
  map_url: z.string().url().optional(),   // ← NO restringe protocolo
  ...
}).catch({})
```

y termina acá, en el sitio público:

```tsx
// components/landing/location.tsx:91-93
{d.map_url && (
  <a href={d.map_url} target="_blank" rel="noopener">
```

`new URL('javascript:alert(document.cookie)')` **parsea sin problema** → `z.string().url()` lo acepta → el HTML server-rendered de `/[slug]` sale con `href="javascript:..."` y cualquier visitante que toque "Ver en el mapa" ejecuta script en el origen del sitio público. No es teoría: **el propio schema.ts documenta esta clase exacta de bug** en su comentario de seguridad (líneas 170-176) y creó `safeLinkUrl` (allowlist de protocolo http/https)… pero lo aplicó **sólo a `ctaLink`**, dejando `map_url` afuera.

Por qué es de ESTA fase y no una deuda vieja: Phase 14/15 abrieron el input (`_sections/section-forms.tsx:488` escribe `map_url` sin filtro) y esta fase construyó el pipeline que lo persiste (`saveLandingDraft`) y lo **publica** (`publishLanding`, que revalida con el mismo Zod flojo y por lo tanto lo deja pasar). El actor es un tenant y la víctima es cualquier visitante de `/[slug]`.

**Fix:** reusar el validador que ya existe (una línea):

```ts
// lib/landing/schema.ts — safeLinkUrl ya está definido más abajo; subirlo antes de locationData.
export const locationData = z
  .object({
    title: z.string().optional(),
    map_url: safeLinkUrl.optional(),      // ← allowlist http/https, igual que ctaLink
    show_address: z.boolean().optional(),
  })
  .catch({})
```

Revisar en el mismo pase `heroData.image`, `aboutData.image`, `galleryData.images` y `rsvData.images` (`z.string().url()`): en `<img src>` un `javascript:` no ejecuta, pero `data:` sí permite contenido arbitrario y ninguna pasa por `next/image` con allowlist de dominios. Acotarlas a http/https es gratis.

---

## Warnings

### WR-01: `select('*')` manda la fila COMPLETA de `businesses` al bundle del cliente (incluye `notification_email`, plan, MP)

**File:** `app/(dashboard)/web/page.tsx:42-46` y `:105`

**Issue:** la page hace `.select('*')` y pasa la fila entera a un Client Component con `business={business as unknown as PublicBusiness}`. El cast es una **mentira**: `PublicBusiness = Omit<Business, 'notification_email'>` (lib/types.ts:103, con el comentario *"Public subset — never include secret keys"*), pero el objeto en runtime **sí** trae `notification_email`, más `plan`, `plan_status`, `mp_subscription_id`, `mp_user_id`, `owner_id`, `trial_ends_at`, `has_whatsapp`… Todo eso se serializa en el payload RSC y viaja al navegador.

No hay fuga cross-tenant (los 7 secretos viven en `business_secrets` desde v0.9, y la fila es la del propio dueño), por eso no es BLOCKER — pero el `as unknown as` desactiva justo el tipo que el proyecto creó para impedir esto, y basta con que mañana alguien agregue una columna sensible a `businesses` para que se publique sola.

**Fix:** seleccionar columnas explícitas (las que consume el renderer + `landing_config`/`landing_draft`/`has_web_custom`) y borrar el `as unknown as`:

```ts
const { data: business } = await supabase
  .from('businesses')
  .select('id, slug, name, type, vertical, logo_url, primary_color, whatsapp, address, instagram, require_deposit, deposit_amount, deposit_expiry_hours, recaptcha_site_key, default_slot_duration, buffer_minutes, created_at, palette, theme, font, has_web_custom, landing_config, landing_draft')
  .eq('owner_id', user.id)
  .single()
```

### WR-02: los cambios sin guardar se pierden en silencio al navegar dentro del panel

**File:** `app/(dashboard)/web/web-client.tsx:324-334`

**Issue:** el guard de salida es sólo `beforeunload`, que **no dispara en las navegaciones client-side de Next** (`<Link>` del sidebar, botón atrás del router). Con `dirty === true`, un click en "Turnos" descarta el borrador sin preguntar nada. El comentario de cabecera (`web-client.tsx:50`) todavía promete *"CONFIRM-ON-EXIT: beforeunload + dialog cuando hay cambios sin guardar (D-03b)"*, pero el dialog fue reciclado para Descartar (`:610-616` lo dice explícitamente). O sea: la protección que el comentario promete no existe.

**Fix:** interceptar la navegación in-app (patrón mínimo, sin dependencias): capturar clicks en anchors internos mientras `dirty`, o exponer el guard con `useEffect` sobre `router` + un dialog "Tenés cambios sin guardar". Si se decide no hacerlo, corregir el comentario para no prometer lo que no hay.

### WR-03: `supabase/schema.sql` no se regeneró — sigue sin `landing_draft`

**File:** `supabase/migrations/050_landing_draft.sql:45` (la instrucción) vs `supabase/schema.sql:356` (la realidad)

**Issue:** la propia migración dice *"Tras aplicar, regenerar `supabase/schema.sql` (patrón del repo, igual que 037/039/042/043)"* y no se hizo: `businesses` en schema.sql termina en `has_whatsapp`, sin `landing_draft`. El repo usa schema.sql como referencia de esquema (y ya hubo un incidente de schema.sql desactualizado en v0.9). Deja al próximo que lea el esquema convencido de que la columna no existe.

**Fix:** `supabase db reset` local + regenerar schema.sql y commitearlo con la fase.

### WR-04: tras descartar sin haber publicado nunca, el indicador MIENTE y "Guardar" queda deshabilitado

**File:** `app/(dashboard)/web/web-client.tsx:301-322` + `_landing-actions.ts:229`

**Issue:** con `landing_config IS NULL`, `discardLandingDraft()` escribe `landing_draft = null` en la DB. El cliente, en cambio, hace `setDraft(DEFAULT)` **y** `setSavedBaseline(DEFAULT)`. Resultado:

- DB: **no hay borrador**.
- Memoria: `draft === savedBaseline` → `deriveEditorState` = `'unpublished'` → la barra dice **"Guardado — sin publicar"**. Falso: no hay nada guardado.
- `canSave = !blocked && editorState === 'unsaved'` → **el botón Guardar queda deshabilitado**, así que el dueño no puede materializar ese "guardado" que la UI le está afirmando.

Es recuperable (Publicar encadena un save, y editar cualquier campo vuelve a habilitar Guardar), por eso no es BLOCKER — pero es un estado inconsistente entre memoria y DB en la ruta de una acción destructiva.

**Fix:** en `runDiscard`, cuando `publishedBaseline === null`, no fijar el `savedBaseline` al DEFAULT — reflejar el hecho real (no hay borrador en la DB):

```ts
if (publishedBaseline !== null) {
  setDraft(publishedBaseline)
  setSavedBaseline(publishedBaseline)
} else {
  // La DB quedó SIN borrador: el DEFAULT es una semilla en memoria, no algo guardado.
  setDraft(DEFAULT_LANDING_CONFIG)
  setSavedBaseline(DEFAULT_LANDING_CONFIG)  // + permitir Guardar en 'unpublished', o
                                            //   volver a sembrar como "nunca guardado"
}
```
La opción limpia: que `canSave` sea `!blocked && editorState !== 'published'` (guardar un borrador idéntico es idempotente y barato), con lo cual el estado deja de tener un dead-end.

### WR-05: el write path acepta `section.data` arbitrario y sin tope de tamaño

**File:** `app/(dashboard)/web/_landing-actions.ts:107` · `lib/landing/schema.ts:36`

**Issue:** `sectionSchema.data = z.unknown().optional()` → `parseLandingConfigForWrite` no estripa **nada** dentro de `data`. Cualquier sesión de dueño (o un POST directo a la Server Action) puede persistir un `data` con claves arbitrarias y de tamaño arbitrario (hasta el límite de body de Server Actions, 1 MB por defecto) en el jsonb de su fila, y `publishLanding` lo copia tal cual a la columna que lee la web pública. Es la misma clase de agujero que habilita CR-02, y además hace que el "overwrite total + Zod estripa las claves desconocidas" que promete `write.ts:16-19` sea **falso para el 90% del payload**.

**Fix:** validar `data` por tipo de sección en el write path (los esquemas ya existen: `heroData`, `aboutData`, `galleryData`, `locationData`, `ctaData`, `rsvData`), o como mínimo aplicar un `z.record(z.string(), z.unknown())` con tope de claves + un chequeo de tamaño serializado antes del `.update`.

### WR-06: los tests nuevos de `isolation.test.ts` son dependientes del ORDEN — se rompen con `--shuffle` o `it.concurrent`

**File:** `test/isolation.test.ts:238-301`

**Issue:** el propio bloque lo admite: *"ORDEN: el cross-WRITE (que asierta que el borrador de A sigue null) va ANTES del same-tenant (que lo escribe). Invertirlos rompería la aserción del cross-write."* El test `cross-WRITE landing_draft` asume `landing_draft === null` en la fila de A, y el test siguiente lo escribe. Es acoplamiento entre casos a través de estado compartido: cualquiera que agregue `--shuffle`, `--sequence.shuffle` o `it.concurrent` (o que inserte un caso nuevo en el medio) pone la suite en rojo por una razón que no tiene nada que ver con RLS. Es justo la suite que **no puede** dar falsos negativos.

**Fix:** que el caso cross-WRITE no dependa del estado inicial de la fila — sembrar un centinela y verificar que no cambió:

```ts
// Sembrar con service-role un valor centinela ANTES del intento de B.
const sentinel = { theme: { preset: 'forjo' }, sections: [], __sentinel: 'A' }
await seeded.admin.from('businesses').update({ landing_draft: sentinel }).eq('id', seeded.bizA)
// … intento de B …
expect(check?.landing_draft).toMatchObject({ __sentinel: 'A' })   // el write de B NO pasó
```

---

## Info

### IN-01: comentarios desactualizados que describen código que ya no existe

**Files:** `app/(dashboard)/web/page.tsx:56-57` · `app/(dashboard)/web/web-client.tsx:50` · `app/(dashboard)/web/_landing-actions.ts:15` (nota `(a)` refiere `_landing-actions.ts:33`, hoy línea 63)

**Issue:** `page.tsx:56-57` dice *"el gate que DE VERDAD importa vive en `saveLandingConfig`"* — esa función fue renombrada a `saveLandingDraft` en esta fase (el propio `_landing-actions.ts:70-72` celebra el rename). `web-client.tsx:50` promete un confirm-on-exit con dialog que ya no existe (ver WR-02). En un repo cuyos comentarios son documentación de decisiones, un comentario que miente es peor que no tenerlo.

**Fix:** actualizar los 3 punteros.

### IN-02: `DEFAULT_LANDING_CONFIG` (constante de módulo) entra directo al estado de React

**File:** `app/(dashboard)/web/web-client.tsx:314` (`stripPrimary(DEFAULT_LANDING_CONFIG)` devuelve **el mismo objeto** cuando no hay `primary` — ver `editor-draft.ts:176`)

**Issue:** `setDraft(restored)` y `setSavedBaseline(restored)` meten la referencia compartida del módulo en dos slots de estado. Hoy es benigno porque **todos** los mutadores de `editor-draft.ts` son puros (los tests lo cubren), pero es una bomba latente: una sola mutación in-place futura corrompería el DEFAULT para todos los negocios servidos por ese proceso.

**Fix:** `structuredClone(DEFAULT_LANDING_CONFIG)` en el punto de siembra (o congelarlo con `Object.freeze` profundo en schema.ts).

### IN-03: el config viaja DOS veces en el payload RSC

**File:** `app/(dashboard)/web/page.tsx:104-113`

**Issue:** `business` (por el `select('*')`) ya contiene `landing_config` y `landing_draft`, y además se mandan como props separadas `publishedConfig` / `initialDraft`. Con una galería cargada el config no es chico. Se resuelve solo al arreglar WR-01 (columnas explícitas sin los dos jsonb en `business`).

### IN-04: `configsEqual` se recalcula 4 veces por render, sin memo

**File:** `app/(dashboard)/web/web-client.tsx:170-180`

**Issue:** `isDirty`, `deriveEditorState` (2 comparaciones internas) y `draftIsPristine` corren `JSON.stringify(canonical(...))` en **cada** render — y el editor re-renderiza en cada tecla del copy. Irrelevante al tamaño actual del config; queda anotado por si mañana entra una galería grande. `useMemo` sobre `[draft, savedBaseline, publishedBaseline]` lo resuelve.

### IN-05: `--warning` no está declarado en `.impersonation-view`

**File:** `app/globals.css:223-242`

**Issue:** ese bloque re-declara los neutrales light (incluido `--destructive`) para escapar del shell dark del CRM, pero **no** `--warning`. Un `text-warning` renderizado dentro de la vista de impersonación heredaría el ámbar de `.dark` (#e6b53f) sobre fondo crema → contraste ~1.9:1. Hoy no es alcanzable (el editor CMS no se renderiza ahí), pero la simetría con `--destructive` está rota.

**Fix:** agregar `--warning: #8a5a12;` al bloque `.impersonation-view`.

---

_Reviewed: 2026-07-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
