# Phase 17: Exponer el CMS a clientes reales - Pattern Map

**Mapped:** 2026-07-15
**Files analyzed:** 6 (5 modify + 1 new migration + 1 new component)
**Analogs found:** 6 / 6 (todos con analog en el propio repo; RESEARCH ya los ubicó con file:line — verificados acá)

> Fase de RESTAR (quitar el flag) + CONECTAR (nav + upsell) + CERRAR un hueco (RLS de upload). No se construye nada de cero: cada pieza copia un patrón existente en el repo.

## File Classification

| Archivo (new/modify) | Rol | Data Flow | Analog más cercano | Match |
|----------------------|-----|-----------|--------------------|-------|
| `app/(dashboard)/web/page.tsx` | route (RSC page) | request-response (gate + render condicional) | sí mismo (patrón interno) + `app/(dashboard)/settings/page.tsx` | exact (edición in-place) |
| `app/(dashboard)/web/_landing-actions.ts` | server-action | CRUD (write landing) | sí mismo (3 acciones simétricas) | exact |
| `app/(dashboard)/web/web-client.tsx` | component (client) | request-response (copy map) | sí mismo (`ACTION_ERROR_COPY`) | exact |
| `components/dashboard/sidebar.tsx` | component (nav) | event-driven (navegación) | `NAV_GROUPS`/`ITEMS`/`buildNavGroups` + link flotante "Ver mi página" | exact |
| `app/(dashboard)/web/_web-upsell.tsx` **(NEW)** | component (RSC estático) | request-response (CTA externo) | `components/dashboard/plan-banner.tsx:140-147` + `settings-client.tsx:1323/1501` | role-match (monetización) |
| `supabase/migrations/051_*.sql` **(NEW)** | migration | file-I/O (RLS del bucket) | `supabase/_migrations-archive/030_landing_config_and_storage.sql:84-110` | exact (amend de policy) |

**Solo-referencia (NO se modifica):** `app/(crm)/admin/_actions.ts:234-256` `toggleAddon` (palanca de emergencia D-03).

## Pattern Assignments

### `app/(dashboard)/web/page.tsx` (route, request-response) — MODIFY

**Analog:** sí mismo. El código de sesión + fetch (líneas 32-95, 114-135) se conserva **intacto**. Solo cambian: quitar el flag (25/29), actualizar comentario (5-24), y convertir el gate `notFound()` (67) en render condicional.

**Quitar (líneas 25 y 29):**
```ts
const CMS_ENABLED = process.env.CMS_ENABLED === 'true'   // ← eliminar (25)
if (!CMS_ENABLED) notFound()                             // ← eliminar (29)
```

**Reemplazar el gate (línea 67):** hoy `if (!business.has_web_custom) notFound()`. Nuevo patrón (RESEARCH Pattern 1 — early-return del upsell ANTES del `Promise.all` de líneas 75-95, para ahorrar 5 queries en no-entitled):
```tsx
// resolver has_web_custom primero; el no-entitled no necesita los 5 datasets del preview
if (!business.has_web_custom) {
  return <WebUpsell slug={business.slug} />
}
// ... acá recién el Promise.all del preview + <WebEditorClient/> (código actual intacto)
```

**Import a agregar:** `import { WebUpsell } from './_web-upsell'`. `notFound` deja de usarse — quitarlo del import de línea 2 si no queda otro uso (hay que chequear: es el único uso).

**Comentario de cabecera (5-24):** reescribir para reflejar el modelo nuevo — gate único `has_web_custom` + upsell para no-entitled; eliminar el punto (a) "FLAG PRIMERO (fail-closed)". Mantener (b) session-client y (c) aislamiento por tenant.

**Nota de defensa en profundidad:** el `business` se sigue seleccionando con COLUMNAS EXPLÍCITAS (línea 48-54, incluye `slug` y `has_web_custom`) — NO tocar ese select. El upsell solo necesita `slug`.

---

### `app/(dashboard)/web/_landing-actions.ts` (server-action, CRUD) — MODIFY

**Analog:** sí mismo. Las 3 acciones (`saveLandingDraft`/`publishLanding`/`discardLandingDraft`) tienen el flag en el mismo lugar. El gate `has_web_custom` por sesión (líneas 104/164/230) **NO se toca** (Pitfall 3 del RESEARCH).

**Gate que SE CONSERVA (patrón idéntico en las 3 — NO relajar):**
```ts
const { data: business } = await supabase
  .from('businesses').select('id, has_web_custom')
  .eq('owner_id', user.id).single()          // business_id de la SESIÓN, nunca del body
if (!business) return { ok: false, error: 'no_business' }
if (!business.has_web_custom) return { ok: false, error: 'not_entitled' }  // gate real, defensa en profundidad
```

**Quitar (const línea 63 + los 3 chequeos 75/141/209):**
```ts
const CMS_ENABLED = process.env.CMS_ENABLED === 'true'          // ← eliminar (63)
if (!CMS_ENABLED) return { ok: false, error: 'cms_disabled' }  // ← eliminar (75, 141, 209)
```

**Comentario de cabecera (51-63):** actualizar — el primer early-return de dominio ahora es sesión/entitlement, ya no el flag "FLAG PRIMERO".

---

### `app/(dashboard)/web/web-client.tsx` (component, request-response) — MODIFY

**Analog:** sí mismo, `ACTION_ERROR_COPY`.

**Quitar (línea 96 — código muerto, ya nadie emite `cms_disabled`):**
```ts
cms_disabled: 'El editor no está disponible en este momento.',   // ← eliminar
```
**Conservar (línea ~100, ya existe):**
```ts
not_entitled: 'Tu plan no incluye la edición de la web. Escribinos para activarla.',
```

---

### `components/dashboard/sidebar.tsx` (component, nav) — MODIFY

**Analog:** el propio mecanismo `NAV_GROUPS` + `ITEMS` + `buildNavGroups`. **La referencia "NAV_ITEMS" de CONTEXT.md está desactualizada** — el sidebar hoy es data-driven agrupado con filtrado por vertical (verificado: líneas 39-77).

**Mecanismo real (verificado):** cada key se filtra contra `resolveVertical(business).menu` (línea 69-74). Los 4 verticales NO tienen `'web'` en su `menu` (`lib/verticals.ts:58/80/101/122`) → si solo se agrega a `ITEMS`, **el ítem no aparece** (Pitfall 2).

Dos analogs candidatos — el planner/UI-SPEC elige:

**Opción A — data-driven (agrupado, recomendada para fidelidad a D-01 "top-level agrupado"):**
1. Agregar al record `ITEMS` (dentro de `buildNavGroups`, junto a líneas 56-68):
```ts
web: { href: '/web', label: 'Mi web', icon: Globe },   // Globe de lucide (no está en uso)
```
2. Agregar la key `'web'` a un `NAV_GROUP` (ej. `GESTIÓN`, línea 42, junto a `'negocio'`).
3. Agregar `'web'` a los 4 arrays `menu` de `lib/verticals.ts` (líneas 58/80/101/122). **Sin este paso el filtro lo descarta.**
4. Import: agregar `Globe` al bloque de lucide (líneas 10-27).

Tradeoff: mantiene consistencia agrupada; toca `verticals.ts` (4 líneas); un vertical futuro debe recordar incluir `'web'`.

**Opción B — link flotante (cero-toque a `verticals.ts`, garantía dura de "para todos"):**
Renderizar "Mi web" como `<Link href="/web">` **fuera** del loop de grupos, calcado del link "Ver mi página" (líneas 152-160), pero apuntando al editor `/web` (interno, con `<Link>`, sin `target="_blank"`):
```tsx
<Link
  href="/web"
  onClick={() => setMobileOpen(false)}
  className="mt-4 flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
>
  <Globe className="w-4 h-4 flex-shrink-0" />
  Mi web
</Link>
```
Tradeoff: no depende del `menu` del vertical (visible siempre); pero queda flotante, no dentro de una sección agrupada (D-01 lo quiere "al nivel de Turnos/Agenda/Negocio", que están agrupados).

**Ojo:** "Mi web" (→ editor `/web`, `<Link>` interno) es distinto de "Ver mi página" (→ público `/[slug]`, `<a target="_blank">`, líneas 152-160). NO reemplazar ese link; agregar uno nuevo.

---

### `app/(dashboard)/web/_web-upsell.tsx` (component RSC estático) — NEW

**Analog de monetización:** el CTA de `plan-banner.tsx:140-147` (patrón verificado en prod):
```tsx
// components/dashboard/plan-banner.tsx:140-147 — patrón del CTA externo
<a
  href={UPGRADE_URL}
  target="_blank"
  rel="noopener noreferrer"
  className="text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap bg-red-500 text-white hover:opacity-80 transition-opacity"
>
  Ver planes
</a>
```

**Reglas para el nuevo componente (Pattern 2 del RESEARCH):**
- `import { UPGRADE_URL } from '@/lib/plans'` (línea 33 = `https://forjo.studio/#servicios`). **Cero constante nueva** (D-02).
- CTA calcado: `<a href={UPGRADE_URL} target="_blank" rel="noopener noreferrer">Activar</a>`.
- Server Component estático (SIN `'use client'`) — no tiene estado. Recibe `slug` como prop (para el link "ver mi página actual" si se quiere).
- Diseño a discreción dentro de Bauhaus dark + tokens del design system. Checklist UI OBLIGATORIO (CLAUDE.md UI/UX): **1 CTA dominante**, contraste WCAG AA, mobile 375px, touch target ≥44px, headings jerárquicos.
- Copy: "Web a medida" (título del add-on). NO usar el copy `not_entitled` (ese es para errores de acción); este es una superficie de venta.

**Importante (D-02c):** este componente es SOLO UX de la superficie de LECTURA. NO relaja las Server Actions (siguen `not_entitled`). Son superficies distintas.

---

### `supabase/migrations/051_landing_assets_gate_entitlement.sql` — NEW

**Analog exacto:** las policies del bucket `landing-assets` en `030_landing_config_and_storage.sql:84-121`. El gap: gatean `owner_id` pero NO `has_web_custom` (RESEARCH MANDATORY-1). El upload es browser→Storage directo (`_sections/image-controls.tsx` + `lib/landing/editor-upload.ts`), la RLS del bucket es el único gate no-bypasseable.

**Policy actual a amendar (030:86-93, INSERT):**
```sql
CREATE POLICY "landing-assets owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'landing-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM businesses WHERE owner_id = auth.uid()
    )
  );
```

**Patrón del fix (agregar `AND has_web_custom = true` al subquery, INSERT + UPDATE):**
```sql
-- 051_landing_assets_gate_entitlement.sql (aplicar a prod A MANO, coordinado con el deploy)
DROP POLICY IF EXISTS "landing-assets owner insert" ON storage.objects;
CREATE POLICY "landing-assets owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'landing-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM businesses
      WHERE owner_id = auth.uid() AND has_web_custom = true   -- ← gate del add-on
    )
  );
-- idem la policy UPDATE (030:96-110). DELETE (030:113-121) queda owner-only
-- (permite que un negocio recién desactivado limpie sus objetos). Ver Open Q2 del RESEARCH.
```

**Reglas del repo (convenciones-forjo / .claude/CLAUDE.md):**
- Migración numerada, sobre el baseline actual (siguiente número disponible = 051 — verificar `supabase/migrations/` antes de fijar el número).
- Se aplica a prod A MANO y en orden, coordinada con el deploy. Storage local está OFF → el gate no se prueba en local; checkpoint manual contra staging/prod-like.
- El service-role (skill writer del operador) bypassa RLS → el fix NO rompe el writer.

---

## Shared Patterns

### CTA de monetización (upsell + banner)
**Source:** `components/dashboard/plan-banner.tsx:140-147`, `lib/plans.ts:33` (`UPGRADE_URL`).
**Apply to:** `_web-upsell.tsx`.
**Regla:** reusar `UPGRADE_URL` + `<a target="_blank" rel="noopener noreferrer">`. Cero constante nueva.

### Gate de entitlement resuelto de la SESIÓN
**Source:** `_landing-actions.ts:104/164/230` (write), `page.tsx:48-67` (read).
**Apply to:** page (render condicional) + las 3 actions (sin cambios).
**Regla:** `has_web_custom` siempre del business de `owner_id = auth.uid()`, nunca del body. Defensa en profundidad: page + 3 actions + RLS del bucket.

### Anti-tampering del add-on (NO se toca)
**Source:** trigger `businesses_protect_admin_columns` (`_migrations-archive/032_crm_admin.sql:88-112`, réplica en baseline). Test en vivo: `test/isolation.test.ts:177-201`.
**Apply to:** verificación del phase gate — correr `npm test -- isolation` (el dueño no puede auto-otorgarse `has_web_custom`).

### Palanca de emergencia (solo-referencia, NO modificar)
**Source:** `app/(crm)/admin/_actions.ts:234-256` `toggleAddon` — `createAdminClient()` (service-role) bypassa el trigger → setea `has_web_custom=false`. Es la única palanca post-flag (D-03).

## No Analog Found

Ninguno. Todos los archivos tienen analog verificado en el repo.

## Barrido de cierre (regla dura D-04)

Tras el cambio, `grep -rn "CMS_ENABLED\|cms_disabled" app/ lib/ components/ scripts/` debe dar **0 matches**. Ninguna ruta puede quedar con un chequeo muerto que la deje abierta. Runbook post-deploy: borrar la env var `CMS_ENABLED` de Vercel (3 scopes; benigno si queda).

## Metadata

**Analog search scope:** `app/(dashboard)/web/`, `components/dashboard/`, `lib/`, `supabase/_migrations-archive/`, `app/(crm)/admin/`.
**Files scanned:** 6 leídos/verificados (sidebar, web/page, plan-banner, verticals, migr.030, admin/_actions) + RESEARCH.md como fuente autoritativa de líneas.
**Pattern extraction date:** 2026-07-15
</content>
</invoke>
