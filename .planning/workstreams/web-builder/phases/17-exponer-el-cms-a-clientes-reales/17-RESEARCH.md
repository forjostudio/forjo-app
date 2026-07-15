# Phase 17: Exponer el CMS a clientes reales - Research

**Researched:** 2026-07-15
**Domain:** Refactor interno de gating (quitar flag env) + UI mínima (1 ítem de sidebar + 1 pantalla de upsell) — Next.js 16 App Router + Supabase RLS multi-tenant
**Confidence:** HIGH (todo verificado contra el código; una sola decisión de diseño abierta = ubicación del nav item)

## Summary

Esta fase NO agrega capacidades. Retira el kill-switch global `CMS_ENABLED` (fail-closed) y deja `has_web_custom` (add-on pago, protegido por el trigger `businesses_protect_admin_columns`) como **único** gate del editor CMS. Además le da al dueño una entrada real desde el sidebar y define qué ve un dueño sin el add-on (pantalla de upsell, no un 404).

El barrido de `CMS_ENABLED` es acotado y limpio: **solo 3 archivos de producción** lo referencian (`page.tsx`, `_landing-actions.ts`, `web-client.tsx`). No aparece en `proxy.ts`, `.env*`, `vercel.json`, ni `next.config.ts` [VERIFIED: grep repo + inspección directa de env/config]. Los 3 gates `has_web_custom` por sesión ya existen en las Server Actions y NO se tocan (solo se quita el flag de encima). El trigger anti-tampering está verificado en vivo por un test existente.

**Hallazgo crítico (MANDATORY-1):** el path de UPLOAD de imágenes **NO gatea `has_web_custom`**. Sube DIRECTO a Supabase Storage desde el browser con el session client; la RLS del bucket (migr. 030) valida solo `owner_id`, no el add-on. Un dueño sin el add-on puede subir objetos a su propio prefijo `landing-assets/{business_id}/`. La exposición práctica es baja (el objeto queda huérfano, no puede persistirse al landing porque `saveLandingDraft` sí gatea, y nunca llega a la web pública) — pero el threat note lista `upload` como 4ª superficie del CMS, así que **el plan debe cerrarlo con una migración** que agregue `AND has_web_custom = true` a la policy de INSERT del bucket.

**Primary recommendation:** Refactor quirúrgico en 3 archivos TS (quitar flag) + 1 migración nueva (051) para gatear el upload por `has_web_custom` en la RLS del bucket + 1 ítem de sidebar + 1 pantalla de upsell reusando `UPGRADE_URL`. Cero dependencias nuevas.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** El editor gana un **ítem propio top-level en el sidebar**, rotulado **"Mi web"**, al nivel de Turnos/Agenda/Negocio. Se muestra a **TODOS** los negocios (no solo a los que tienen el add-on) — el CMS es feature estrella + superficie de venta del add-on pago. Se agrega al mapa de nav de `components/dashboard/sidebar.tsx`.
- **D-02:** Un negocio **sin** `has_web_custom` que entra a `/web` (por nav o URL directa) ve una **pantalla de upsell** ("Web a medida") — NO un `notFound()` 404. CTA **"Activar"** apuntando a **`UPGRADE_URL`** (`https://forjo.studio/#servicios`), reusando el patrón de plan-banner/settings ("Ver planes →"). Cero constante nueva.
- **D-02b:** Un negocio **con** `has_web_custom` ve el editor, igual que hoy.
- **D-02c:** Reemplaza el `notFound()` de `app/(dashboard)/web/page.tsx` por render condicional: entitled → editor, no-entitled → upsell. El gate de escritura (las 3 Server Actions) NO se relaja — sigue devolviendo `not_entitled` (defensa en profundidad).
- **D-03:** La **única** palanca de emergencia es el **toggle per-negocio `has_web_custom` del admin CRM** (`/admin/negocios/[id]`, ya existente, service-role que bypassa el trigger). NO se agrega toggle masivo ni env var de apagado.
- **D-04:** Remover `CMS_ENABLED` de **todas** las superficies: const + `notFound()` en `page.tsx`, 3 const + 3 chequeos en `_landing-actions.ts`, y de `.env*`/Vercel/docs. El código de error `cms_disabled` y su copy quedan muertos → removerlos. **Regla dura:** ninguna ruta puede quedar con un chequeo muerto que la deje abierta.

### Claude's Discretion
- Ícono del ítem "Mi web" en el sidebar (Globe/Layout/PenSquare/etc. de lucide) — coherente con el set existente.
- Diseño exacto de la pantalla de upsell (brand Bauhaus dark, tokens del design system). Checklist UI: 1 CTA claro, contraste WCAG AA, mobile 375px.
- Label final si "Mi web" no calza bien con la terminología por vertical.

### Deferred Ideas (OUT OF SCOPE)
- **Toggle masivo de `has_web_custom` en el admin** (apagar el CMS de todos los negocios de una): descartado como palanca de emergencia (D-03). Si algún día hace falta un off-switch global de verdad, es su propia fase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PUB-01 | El CMS se expone a los clientes en el dashboard, con `has_web_custom` como ÚNICO gate — sin el flag global `CMS_ENABLED`. | Barrido de `CMS_ENABLED` (3 archivos, líneas exactas abajo); gates `has_web_custom` ya presentes en las 3 Server Actions (`_landing-actions.ts:104/164/230`); trigger anti-tampering verificado (`isolation.test.ts:177`); upload path gap identificado + fix propuesto (migración 051); entrada de sidebar (NAV_GROUPS + ITEMS); upsell reusando `UPGRADE_URL`. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Gate de lectura del editor (editor vs upsell) | Frontend Server (RSC `page.tsx`) | — | `has_web_custom` se resuelve del business de la SESIÓN; render condicional server-side |
| Gate de escritura (guardar/publicar/descartar) | API / Backend (Server Actions) | Database (RLS + trigger) | El gate real vive en cada acción; `not_entitled` server-side, no cosmético |
| Gate de escritura de imágenes (upload) | **Database (RLS del bucket)** | — | El upload es browser→Storage directo; el único punto no-bypasseable es la policy RLS. **Hoy solo gatea `owner_id`, falta `has_web_custom`** |
| Anti-tampering del add-on | Database (trigger `businesses_protect_admin_columns`) | — | Revierte en silencio cualquier UPDATE no-service_role sobre `has_web_custom` |
| Palanca de emergencia (apagar un negocio) | API / Backend (`toggleAddon`, service-role) | Database | El service-role bypassa el trigger; setea `has_web_custom=false` |
| Entrada al editor (nav) | Browser / Client (`sidebar.tsx`) | — | `<Link>` a `/web`, visible para todos |
| CTA de upsell | Browser / Client | — | `<a href={UPGRADE_URL}>` externo |

## Standard Stack

No se agregan librerías. Todo el trabajo usa lo ya presente: Next.js 16 App Router (RSC + Server Actions), `@supabase/ssr` (session client), lucide-react (íconos), tokens Tailwind v4 del design system, `sonner` (toasts ya integrados).

## Package Legitimacy Audit

**No aplica.** Esta fase no instala ni referencia ningún paquete externo nuevo. Es refactor interno (quitar una env var + render condicional) + una migración SQL. Cero superficie de dependencias.

## Runtime State Inventory

> Esta fase toca gating y remueve una env var (comportamiento de rename/config-change). Inventario obligatorio.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | Ninguno. No hay datos que almacenen la string `CMS_ENABLED` como clave/valor de negocio. La columna `has_web_custom` ya existe y NO cambia de semántica. | Ninguna |
| **Live service config** | **`CMS_ENABLED` seteada como env var en Vercel** (scopes Production/Preview — se seteó a mano en la UAT de Phase 14, ver `14-VERIFICATION.md`). Vive en el dashboard de Vercel, NO en git. | Runbook: tras el deploy del código que ya no la lee, **borrar la env var `CMS_ENABLED` de Vercel** (los 3 scopes). Benigno si queda: el código ya no la referencia. NO es bloqueante del deploy. |
| **OS-registered state** | Ninguno. | Ninguna |
| **Secrets/env vars** | `CMS_ENABLED` (server-only, no secreto). No hay `.env`/`.env.example` con la variable [VERIFIED: inspección directa de `.env.local`, `.env.development.local` → sin match]. En local se seteaba `CMS_ENABLED=true` para probar el editor; tras esta fase ya no hace falta. | Opcional: quitar `CMS_ENABLED=true` de `.env.development.local`/`.env.local` del dev si estuviera (no apareció en el grep, pero verificar antes de cerrar). |
| **Build artifacts** | Ninguno. No hay artefactos compilados que embeban el flag. | Ninguna |

**Nota:** el trigger de la DB y la RLS del bucket son estado vivo en Postgres — la migración 051 (fix del upload) debe aplicarse a prod A MANO y en orden, coordinada con el deploy (convención del repo, ver `.claude/CLAUDE.md`).

## Common Pitfalls

### Pitfall 1: Dejar el upload sin gatear (SC2 incompleto)
**Qué sale mal:** se quita `CMS_ENABLED` y se cierra el gate en page + 3 actions, pero el upload de imágenes sigue abierto a cualquier dueño autenticado (sin add-on).
**Por qué pasa:** el upload NO es una Server Action — es un `supabase.storage.from('landing-assets').upload()` directo desde el browser (`image-controls.tsx:51`). Su único gate es la RLS del bucket (migr. 030), que valida `owner_id` pero NO `has_web_custom`.
**Cómo evitar:** migración 051 que agregue `AND has_web_custom = true` al subquery de la policy INSERT (y UPDATE) de `landing-assets`. Ver Code Examples.
**Señal temprana:** un negocio con `has_web_custom=false` logra un `200` en un `POST` de upload al bucket.

### Pitfall 2: El ítem de nav no aparece por el filtrado por vertical
**Qué sale mal:** se agrega `'web'` al record `ITEMS` y a un `NAV_GROUP`, pero el ítem no se muestra.
**Por qué pasa:** `buildNavGroups` filtra cada key contra `resolveVertical(business).menu` (`sidebar.tsx:74`). Los 4 verticales (`salud`, `belleza`, `general`, `canchas`) **NO tienen `'web'` en su array `menu`** (`lib/verticals.ts:58/80/101/122`) → la fila se descarta. D-01 pide mostrarlo a TODOS.
**Cómo evitar:** dos caminos (ver Architecture Patterns → decisión abierta). Recomendado: agregar `'web'` a los 4 `menu` de `verticals.ts`, o renderizarlo fuera del loop de grupos (como "Ver mi página").
**Señal temprana:** el ítem aparece en un vertical pero no en otro.

### Pitfall 3: Confundir "quitar el flag" con "relajar el gate de escritura"
**Qué sale mal:** al ver el upsell (lectura abierta a no-entitled), alguien relaja también las Server Actions.
**Por qué pasa:** D-02c es sutil: la superficie de LECTURA (page) pasa de 404 a upsell, pero la de ESCRITURA sigue fail-closed con `not_entitled`.
**Cómo evitar:** NO tocar los 3 chequeos `if (!business.has_web_custom) return { ok:false, error:'not_entitled' }`. Solo quitar los `if (!CMS_ENABLED)` de arriba.

### Pitfall 4: Dejar `cms_disabled` como chequeo muerto que abre una ruta
**Qué sale mal:** se quita la const `CMS_ENABLED` pero queda un `if (!CMS_ENABLED)` colgado, o se deja el copy `cms_disabled` mapeado a un código que ya nadie emite.
**Por qué pasa:** la remoción es en 3 lugares por archivo (const + uso) y hay que barrer los 3 archivos.
**Cómo evitar:** checklist de líneas exactas abajo. Tras el cambio, `grep -rn "CMS_ENABLED\|cms_disabled" app/ lib/ components/` debe dar **cero** matches en código de producción.

## Barrido exhaustivo de `CMS_ENABLED` / `cms_disabled` (MANDATORY-3)

**Código de producción (TODO lo que hay que tocar) [VERIFIED: grep repo completo]:**

| Archivo | Línea | Contenido | Acción |
|---------|-------|-----------|--------|
| `app/(dashboard)/web/page.tsx` | 25 | `const CMS_ENABLED = process.env.CMS_ENABLED === 'true'` | **Eliminar** |
| `app/(dashboard)/web/page.tsx` | 29 | `if (!CMS_ENABLED) notFound()` | **Eliminar** (el gate queda en el render condicional de `has_web_custom`) |
| `app/(dashboard)/web/page.tsx` | 5-22, 24 | comentarios de cabecera que describen el flag fail-closed | **Actualizar** el comentario para reflejar el nuevo modelo (gate único `has_web_custom` + upsell) |
| `app/(dashboard)/web/page.tsx` | 67 | `if (!business.has_web_custom) notFound()` | **Reemplazar** por render condicional: no-entitled → `<WebUpsell/>`, entitled → editor (D-02c) |
| `app/(dashboard)/web/_landing-actions.ts` | 63 | `const CMS_ENABLED = process.env.CMS_ENABLED === 'true'` | **Eliminar** |
| `app/(dashboard)/web/_landing-actions.ts` | 75 | `if (!CMS_ENABLED) return { ok:false, error:'cms_disabled' }` (saveLandingDraft) | **Eliminar** |
| `app/(dashboard)/web/_landing-actions.ts` | 141 | idem (publishLanding) | **Eliminar** |
| `app/(dashboard)/web/_landing-actions.ts` | 209 | idem (discardLandingDraft) | **Eliminar** |
| `app/(dashboard)/web/_landing-actions.ts` | 51-63 | comentarios de cabecera que describen el kill-switch (punto (c) "FLAG PRIMERO") | **Actualizar** — el nuevo primer early-return de dominio es el session/entitlement, no el flag |
| `app/(dashboard)/web/web-client.tsx` | 96 | `cms_disabled: 'El editor no está disponible en este momento.'` en `ACTION_ERROR_COPY` | **Eliminar** la entrada (código muerto; ya nadie emite `cms_disabled`) |

**Fuera de código de producción (NO se toca / solo runbook):**
- `proxy.ts`, `.env.local`, `.env.development.local`, `vercel.json`, `next.config.ts` → **sin match** [VERIFIED: inspección directa].
- Vercel dashboard: env var `CMS_ENABLED` seteada a mano → borrar post-deploy (runbook, benigno).
- Docs de planning (`.planning/**`) y milestones archivados → son registro histórico, NO se editan.

**Verificación de cierre:** tras el cambio, `grep -rn "CMS_ENABLED\|cms_disabled" app/ lib/ components/ scripts/` = 0 matches.

## Trigger `businesses_protect_admin_columns` — verificado en vivo (MANDATORY-2)

**Definición** [VERIFIED: `supabase/_migrations-archive/032_crm_admin.sql:88-112`; réplica en baseline `00000000000000_baseline.sql:55-74` (función) + `:897` (trigger)]:

```sql
create or replace function public.businesses_protect_admin_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.has_web_custom := old.has_web_custom;   -- revierte
    new.has_whatsapp   := old.has_whatsapp;
    new.plan           := old.plan;
    new.plan_status    := old.plan_status;
  end if;
  return new;
end;
$$;
create trigger businesses_protect_admin_columns
  before update on public.businesses for each row
  execute function public.businesses_protect_admin_columns();
```

- Es `BEFORE UPDATE ... FOR EACH ROW`. Si la sesión NO es `service_role` (dueño = `authenticated`), fuerza `new.has_web_custom := old.has_web_custom` → el dueño **no puede** auto-otorgarse el add-on. El UPDATE "tiene éxito" pero la columna no cambia (falso verde a vigilar en tests).
- El **admin CRM** (`toggleAddon`, `_actions.ts:234-256`) usa `createAdminClient()` (service-role) → bypassa el trigger → SÍ puede setear `has_web_custom`. **Palanca de emergencia D-03 confirmada operativa** [VERIFIED: `app/(crm)/admin/_actions.ts:234-256`].
- **Test en vivo existente:** `test/isolation.test.ts:177-201` — "A NO puede auto-otorgarse has_web_custom (trigger lo revierte)": parte de `has_web_custom=false`, hace UPDATE como owner, y assertea que sigue `false` después. NO asumido: hay cobertura automatizada [VERIFIED: `test/isolation.test.ts`].

**Conclusión:** el gate `has_web_custom` sostiene solo. El dueño no puede escalar privilegios vía anon/session key. El plan NO necesita tocar el trigger; sí debe mantener la cobertura del test (correr `npm test` en el phase gate).

## Path de UPLOAD de imágenes — HALLAZGO (MANDATORY-1)

**Mecanismo** [VERIFIED: `app/(dashboard)/web/_sections/image-controls.tsx:48-61` + `lib/landing/editor-upload.ts`]:
- NO hay Server Action de upload. `image-controls.tsx` (usado por `section-list.tsx` → `section-forms.tsx`) sube **directo** con el **browser session client**:
  ```ts
  const supabase = createClient() // browser session client
  const path = buildUploadPath({ businessId, section, ext }) // `${businessId}/xxx-{uuid}.ext`
  await supabase.storage.from('landing-assets').upload(path, file, { upsert:false })
  ```
- El `businessId` viene de props del shell (de la SESIÓN, `page.tsx`), nunca del cliente. El path fuerza el prefijo `{businessId}/`.
- **Gate de aislamiento:** RLS del bucket (migr. 030) [VERIFIED: `supabase/_migrations-archive/030_landing_config_and_storage.sql:86-93`]:
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

**El gap:** la policy gatea `owner_id` (aislamiento cross-tenant: OK) pero **NO `has_web_custom`**. Un dueño **sin** el add-on puede subir objetos a su propio `landing-assets/{business_id}/`. → SC2 ("no logra escribir su landing aunque postee directo") queda **incompleto** para la superficie `upload`.

**Severidad real:** BAJA-MEDIA. El objeto subido queda **huérfano**: `saveLandingDraft` (que persiste la URL en `landing_draft`) SÍ gatea `has_web_custom` (`_landing-actions.ts:104`), así que la imagen nunca entra al config ni llega a la web pública. Es abuso de storage owner-scoped, no una fuga cross-tenant ni una escritura de landing. **Pero** el threat note lista `upload` como 4ª superficie que debe gatear el add-on → el plan lo cierra.

**Fix recomendado (migración 051, quirúrgico, no toca el editor):** agregar `has_web_custom` al subquery de las policies de `landing-assets`:

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
-- idem para la policy UPDATE (reemplazar imagen). DELETE es discrecional:
-- gatearlo impediría que un negocio recién desactivado limpie sus propios objetos;
-- dejarlo owner-only (sin has_web_custom) es defendible. Recomendado: gatear INSERT+UPDATE,
-- dejar DELETE owner-only.
```

- **No rompe la skill del operador:** el writer usa service-role → bypassa RLS (no depende de estas policies) [VERIFIED: `030:81` "service_role bypassa RLS"].
- **No afecta el logo de settings:** ese usa un bucket distinto, no `landing-assets`.
- **Nota de infra:** el Storage local está OFF (memoria `web-builder-v016-milestone`); la verificación del gate de upload requiere Supabase hosteado/staging o prod-like. Marcar como checkpoint de verificación manual, no bloqueante del build.

## Architecture Patterns

### Flujo de datos (post-fase)

```
Dueño entra a /web (nav o URL directa)
        │
        ▼
page.tsx (RSC, session client, RLS)
  1. getUser() → sin user → redirect('/login')
  2. business = SELECT columnas explícitas WHERE owner_id = auth.uid()
        │
        ├── business.has_web_custom === true ──► <WebEditorClient/> (editor, igual que hoy)
        │                                          │
        │                                          ├─ save/publish/discard → Server Actions
        │                                          │    (re-chequean has_web_custom → not_entitled)
        │                                          └─ upload imágenes → browser→Storage
        │                                               (RLS bucket: owner_id + has_web_custom  ← fix 051)
        │
        └── business.has_web_custom === false ─► <WebUpsell/> (pantalla "Web a medida")
                                                   └─ CTA "Activar" → UPGRADE_URL (externo)

Emergencia: admin CRM /admin/negocios/[id] → toggleAddon (service-role, bypassa trigger)
            → has_web_custom=false → el negocio cae al upsell y no puede escribir.
```

### Pattern 1: Render condicional en la page (reemplaza el doble `notFound()`)
**Qué:** la page deja de ser fail-closed por flag; resuelve sesión y ramifica por `has_web_custom`.
**Cuándo:** `page.tsx`, reemplazando líneas 25/29 (flag) y 67 (`notFound`).
**Ejemplo:**
```tsx
// Sin flag. Sesión + business igual que hoy (getUser → redirect, select columnas explícitas).
// El fetch de los 5 datasets del preview SOLO se necesita para el editor: para el upsell no
// hace falta. Recomendado: resolver has_web_custom primero y hacer early-return del upsell
// ANTES de los Promise.all del preview (evita 5 queries innecesarias para no-entitled).
if (!business.has_web_custom) {
  return <WebUpsell slug={business.slug} />
}
// ... acá recién los Promise.all del preview + <WebEditorClient/> (código actual intacto)
```
**Nota de perf:** mover el early-return del upsell antes del `Promise.all` (líneas 75-95) ahorra 5 queries por render de no-entitled. El editor conserva su fetch tal cual.

### Pattern 2: Pantalla de upsell (Server Component, sin estado)
**Qué:** componente de presentación con copy + 1 CTA externo. Mismo patrón de monetización que plan-banner/settings.
**Ejemplo:**
```tsx
// UPGRADE_URL ya existe: lib/plans.ts:33 = 'https://forjo.studio/#servicios'
// Patrón de CTA verificado en settings-client.tsx:1323/1501 y plan-banner.tsx:141
<a href={UPGRADE_URL} target="_blank" rel="noopener noreferrer" className="...">
  Activar
</a>
```
Diseño a discreción (Bauhaus dark, tokens). Checklist UI obligatorio: 1 CTA dominante, contraste WCAG AA, mobile 375px, touch target ≥44px. Puede vivir como componente co-ubicado `app/(dashboard)/web/_web-upsell.tsx` (Server Component, sin `'use client'` — es estático).

### Pattern 3: Ítem de sidebar — DECISIÓN ABIERTA (data-driven vs floating)

El sidebar YA NO es un `NAV_ITEMS` plano (la referencia de CONTEXT.md está **desactualizada**). Hoy es: `NAV_GROUPS` (secciones) + record `ITEMS` (key→`{href,label,icon}`) + `buildNavGroups(business)` que **filtra cada key contra `resolveVertical(business).menu`** [VERIFIED: `sidebar.tsx:39-77`]. Los 4 verticales NO incluyen `'web'` en su `menu` [VERIFIED: `lib/verticals.ts:58/80/101/122`].

| Opción | Cómo | Tradeoff |
|--------|------|----------|
| **A — data-driven (recomendada)** | Agregar `web: { href:'/web', label:'Mi web', icon:<Globe/> }` al record `ITEMS`; agregar `'web'` al array `keys` de un `NAV_GROUP` (ej. `GESTIÓN`, junto a `negocio`); agregar `'web'` a los 4 `menu` de `verticals.ts`. | Mantiene el patrón agrupado y consistente. Toca `verticals.ts` (4 líneas). Un vertical futuro necesitaría recordar agregar `'web'`. |
| **B — floating link** | Renderizar "Mi web" como `<Link href="/web">` **fuera** del loop de grupos, junto a "Ver mi página" (`sidebar.tsx:152-160`). | Cero cambios a `verticals.ts`; garantiza "para TODOS" sin depender del menu del vertical. NO queda dentro de una sección (D-01 lo quiere "al nivel de Turnos/Agenda/Negocio", que están agrupados). |

**Recomendación:** Opción A si se quiere fidelidad a "ítem top-level agrupado" (D-01); Opción B si se prioriza cero-toque a `verticals.ts` y garantía dura de "para todos". El planner/UI-SPEC decide. En ambas: `'web'` es distinto de "Ver mi página" (que va al público `/[slug]`); "Mi web" va al editor `/web`. Ícono a discreción (Globe recomendado — no está en uso).

### Anti-Patterns to Avoid
- **Gatear el upload solo en el cliente (JS del editor):** un `POST` directo al endpoint de Storage lo saltea. El gate debe vivir en la RLS del bucket (migración 051).
- **Relajar las Server Actions al abrir el upsell:** la lectura pasa a upsell, la escritura sigue `not_entitled`. Son superficies distintas.
- **Coaccionar el upsell a los negocios entitled:** el render condicional debe ser exclusivo (entitled → editor; no-entitled → upsell), nunca ambos.
- **Agregar el ítem de nav gateado por `has_web_custom`:** D-01 pide mostrarlo a TODOS (es superficie de venta). El gate está en la page, no en el nav.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CTA de monetización | Nueva constante de URL / nuevo componente de banner | `UPGRADE_URL` (`lib/plans.ts:33`) + patrón `<a target="_blank" rel="noopener noreferrer">` de plan-banner/settings | Ya validado en prod, consistente, cero constante nueva (D-02) |
| Gate anti-tampering del add-on | Chequeo custom en app-layer | Trigger `businesses_protect_admin_columns` (ya existe y testeado) | La DB es la fuente de verdad; el app-layer es frágil |
| Gate de aislamiento del upload | Validación de path en el cliente/action | RLS del bucket `landing-assets` (extender con `has_web_custom`) | El upload es browser→Storage; solo la RLS es no-bypasseable |
| Ícono de nav | SVG custom | lucide-react (Globe/Layout/etc.) | `iconLibrary` del proyecto; el set ya está importado |

**Key insight:** todo el andamiaje de esta fase ya existe (gates, trigger, UPGRADE_URL, patrón de nav, patrón de upload). El trabajo es **restar** (el flag) y **conectar** (nav + upsell), más **cerrar un hueco** (upload RLS). No se construye nada nuevo de cero.

## Code Examples

### Gate `has_web_custom` en las Server Actions (NO se toca — ya existe)
```ts
// _landing-actions.ts — patrón idéntico en las 3 acciones (líneas 104/164/230)
const { data: business } = await supabase
  .from('businesses').select('id, has_web_custom')
  .eq('owner_id', user.id).single()   // business_id de la SESIÓN, nunca del body
if (!business) return { ok: false, error: 'no_business' }
if (!business.has_web_custom) return { ok: false, error: 'not_entitled' }  // gate real, defensa en profundidad
```

### Copy `not_entitled` (se conserva; solo se quita `cms_disabled`)
```ts
// web-client.tsx ACTION_ERROR_COPY — QUITAR la línea 96 (cms_disabled); MANTENER:
not_entitled: 'Tu plan no incluye la edición de la web. Escribinos para activarla.',
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Doble gate: `CMS_ENABLED` (flag global) + `has_web_custom` | Gate único: `has_web_custom` (add-on per-negocio) | Phase 17 (esta) | Se retira el kill-switch fail-closed; el gate único debe sostener solo (verificado: sí) |
| No-entitled → `notFound()` 404 invisible | No-entitled → pantalla de upsell (superficie de venta) | Phase 17 | Decisión de monetización, no solo UX (D-02) |
| Editor sin entrada en nav (solo URL directa detrás del flag) | Ítem "Mi web" visible para todos | Phase 17 | El CMS deja de ser inalcanzable |
| Upload gateado solo por `owner_id` (RLS bucket) | Upload gateado por `owner_id` + `has_web_custom` | Phase 17 (fix propuesto, migr. 051) | Cierra la 4ª superficie del CMS |

**Deprecado/muerto tras esta fase:**
- Env var `CMS_ENABLED` (código + Vercel + dev local).
- Código de error `cms_disabled` y su copy.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | (ninguno) | — | — |

**Todos los claims de esta research fueron verificados contra el código, migraciones o tests de la sesión.** No hay conocimiento asumido pendiente de confirmación. La única decisión ABIERTA (no un assumption) es la ubicación del nav item (Opción A vs B), que el planner/UI-SPEC resuelve.

## Open Questions

1. **Ubicación del ítem de nav: data-driven (Opción A, toca `verticals.ts`) vs floating link (Opción B, cero-toque).**
   - Lo que sabemos: ambas cumplen D-01 ("para todos"); A queda agrupado, B queda flotante.
   - Recomendación: A si prima la fidelidad al "ítem top-level agrupado"; B si prima cero-toque a `verticals.ts`. Decide el planner/UI-SPEC.
2. **Gatear DELETE de `landing-assets` por `has_web_custom` (además de INSERT/UPDATE).**
   - Lo que sabemos: gatear DELETE impediría que un negocio recién desactivado borre sus propios objetos.
   - Recomendación: gatear INSERT+UPDATE (donde vive el abuso de escritura), dejar DELETE owner-only. Confirmar con el usuario si prefiere cerrar los 3.
3. **¿Borrar la env var `CMS_ENABLED` de Vercel es parte de la fase o runbook separado?**
   - Lo que sabemos: es benigno si queda (el código ya no la lee).
   - Recomendación: incluirlo como paso de runbook post-deploy, no como tarea de código.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Storage (hosteado/prod-like) | Verificación del gate de upload (migr. 051) | ✗ en local (Storage OFF) | — | Verificar en staging/prod-like o marcar como checkpoint manual |
| Supabase Postgres (para aplicar migr. 051) | Fix del upload | ✓ (local reset + prod a mano) | PG17 local / prod | — |
| vitest | Test gate (`isolation.test.ts`, etc.) | ✓ | ^4.1.9 | — |

**Missing dependencies with fallback:**
- Storage local OFF → el gate de upload NO se puede probar contra Storage local; usar staging hosteado o verificación manual prod-like (mismo tratamiento que Phase 14). No bloquea el build ni los tests unitarios.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.9 |
| Config file | `vitest.config.mts` |
| Quick run command | `npm test` (= `vitest run`) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PUB-01 | El dueño NO puede auto-otorgarse `has_web_custom` (trigger revierte) | integration (RLS/trigger) | `npm test -- isolation` | ✅ `test/isolation.test.ts:177-201` |
| PUB-01 | Cross-write de landing denegado / same-tenant permitido | integration | `npm test -- isolation` | ✅ `test/isolation.test.ts` |
| PUB-01 | Zod de escritura del landing (reject-on-invalid) | unit | `npm test -- landing-write` | ✅ `test/landing-write.test.ts` |
| PUB-01 (fix) | Upload de no-entitled rechazado por RLS del bucket (migr. 051) | integration (Storage) | manual / staging | ❌ Storage local OFF → checkpoint manual |
| PUB-01 | `buildUploadPath` fuerza el prefijo `{businessId}/` | unit | `npm test -- landing-editor-upload` | ✅ `test/landing-editor-upload.test.ts` |

### Sampling Rate
- **Per task commit:** `npm test` (suite completa es rápida, ~283+ tests en memoria).
- **Per wave merge:** `npm test` + `tsc --noEmit`.
- **Phase gate:** suite verde + `npm run lint` + verificación manual del gate de upload contra Storage prod-like antes de `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] (Opcional) Test de que el gate de upload rechaza a un negocio `has_web_custom=false` — requiere infra de Storage; si no se puede automatizar, cubrir por checkpoint manual documentado. El resto de la superficie (page condicional, remoción del flag) se cubre por `tsc` + lint + el UAT visual.

*Nota: la remoción del flag y el render condicional son de bajo riesgo de regresión (no hay lógica nueva); el riesgo real es el gate de upload, que es el foco de la validación.*

## Security Domain

> `security_enforcement` habilitado (fase security-sensitive). ASVS acotado a la superficie tocada.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Gate único `has_web_custom` con defensa en profundidad (page + 3 actions + RLS bucket) |
| V4 Access Control | **yes (central)** | Entitlement per-negocio resuelto de la SESIÓN; trigger anti-escalada; RLS del bucket |
| V5 Input Validation | yes | Zod estricto en `saveLandingDraft`/`publishLanding` (ya existe); `buildUploadPath` sanitiza el token de sección |
| V6 Cryptography | no | — |
| V2 Authentication | no (heredado) | Supabase Auth sin cambios |

### Known Threat Patterns for {Next.js 16 App Router + Supabase RLS}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Retiro del kill-switch deja una ruta con chequeo muerto abierto | Elevation | Barrido exhaustivo (tabla de líneas exactas arriba); grep de cierre = 0 |
| No-entitled escribe su landing por POST directo a la action | Elevation/Tampering | Gate `has_web_custom` server-side en cada acción (ya existe, NO se toca) |
| No-entitled sube imágenes por POST directo a Storage | Tampering | **Fix migr. 051:** RLS del bucket con `has_web_custom` (hoy es el hueco) |
| Dueño se auto-otorga `has_web_custom` vía anon key | Elevation | Trigger `businesses_protect_admin_columns` (verificado por `isolation.test.ts`) |
| `business_id` inyectado por el cliente | Spoofing/Tampering | Todo se resuelve con `owner_id = auth.uid()`; el `businessId` del upload viene de la sesión, no del body |

## Sources

### Primary (HIGH confidence — código/migraciones/tests de la sesión)
- `app/(dashboard)/web/page.tsx` — doble gate actual (líneas 25/29/67).
- `app/(dashboard)/web/_landing-actions.ts` — flag (63/75/141/209) + gates `has_web_custom` (104/164/230).
- `app/(dashboard)/web/web-client.tsx` — `ACTION_ERROR_COPY` (96 = `cms_disabled`, 100 = `not_entitled`).
- `app/(dashboard)/web/_sections/image-controls.tsx` + `lib/landing/editor-upload.ts` — mecanismo de upload directo a Storage.
- `supabase/_migrations-archive/030_landing_config_and_storage.sql:86-119` — RLS del bucket `landing-assets` (gatea owner_id, no has_web_custom).
- `supabase/_migrations-archive/032_crm_admin.sql:88-112` — trigger `businesses_protect_admin_columns` (réplica en baseline).
- `app/(crm)/admin/_actions.ts:234-256` — `toggleAddon` (service-role, palanca D-03).
- `components/dashboard/sidebar.tsx:39-77,152-160` — `NAV_GROUPS`/`ITEMS`/`buildNavGroups` (filtrado por vertical).
- `lib/verticals.ts:36,58,80,101,122` — arrays `menu` (sin `'web'`).
- `lib/plans.ts:33` + `components/dashboard/plan-banner.tsx:141` + `app/(dashboard)/settings/settings-client.tsx:1323,1501` — `UPGRADE_URL`.
- `test/isolation.test.ts:177-201` — verificación en vivo del trigger.
- Grep repo completo de `CMS_ENABLED`/`cms_disabled` + inspección directa de `.env.local`/`.env.development.local`/`vercel.json`/`next.config.ts`/`proxy.ts` (sin match en config/env).

### Secondary / Tertiary
- Ninguna. Fase 100% interna; no se consultaron fuentes externas (no hay librerías nuevas).

## Metadata

**Confidence breakdown:**
- Barrido `CMS_ENABLED` / líneas a tocar: HIGH — grep exhaustivo + lectura de los 3 archivos.
- Trigger anti-tampering: HIGH — leído + test en vivo existente.
- Upload gap + fix: HIGH — mecanismo y RLS leídos; severidad razonada; fix es SQL estándar.
- Nav item: HIGH en el diagnóstico (el filtrado por vertical es real); MEDIUM en la elección A vs B (decisión de diseño, no técnica).
- Palanca de emergencia D-03: HIGH — `toggleAddon` service-role verificado.

**Research date:** 2026-07-15
**Valid until:** ~2026-08-15 (código estable; re-verificar líneas exactas si Phase 15/16 recibieran hotfixes sobre estos archivos).
