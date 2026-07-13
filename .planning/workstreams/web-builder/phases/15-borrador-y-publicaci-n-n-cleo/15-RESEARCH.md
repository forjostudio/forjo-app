# Phase 15: Borrador y publicación (núcleo) — Research

**Researched:** 2026-07-12
**Domain:** Postgres/Supabase (columna jsonb + RLS multi-tenant) · Next.js 16 Server Actions · React client state
**Confidence:** HIGH (todo el material es código del propio repo, leído en esta sesión; el único territorio externo es el comportamiento de caché/revalidación de Next 16, verificado contra `node_modules/next/dist/docs/`)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Modelo de guardado y semántica del borrador**
- **D-01:** **Guardado explícito** (se mantiene el patrón de Phase 14, D-03): el botón "Guardar" arma el config COMPLETO y lo persiste — pero ahora en **`landing_draft`**, no en `landing_config`. Guardar deja de tener consecuencias públicas. NO hay autosave.
- **D-02:** **Publicar copia `landing_draft` → `landing_config` y deja el borrador INTACTO** (queda como copia fiel de lo publicado). Invariante: después de publicar, `draft == published`. NO se limpia el borrador a NULL.
- **D-03:** **"Cambios sin publicar" = comparación estructural `draft ≠ published`** (mismo criterio que el `isDirty` de `lib/landing/editor-draft.ts`: `JSON.stringify` deep-compare). No hay flag ni timestamp de publicación: el estado se DERIVA del contenido.
- **D-04:** **Publicar guarda primero.** Si hay cambios sin guardar y el dueño toca "Publicar", se encadena guardar-borrador → publicar (si falla el guardado, NO publica). NO se deshabilita el botón.

**Barra de acciones y estados (PUB-05)**
- **D-05:** **Una sola barra sticky inferior** (la que ya existe en `web-client.tsx`): `[estado] — Descartar · Guardar · **Publicar**`. Publicar = primario; Guardar = secundario; Descartar = terciario.
- **D-06:** **Un único indicador de 3 estados excluyentes**: `● Cambios sin guardar` → `● Guardado — sin publicar` → `✓ Publicado`. El botón "Publicar" se habilita solo cuando hay algo para publicar.
- **D-07:** **Link "Ver mi web" a `/[slug]`** (otra pestaña) en vez de un toggle Borrador|Publicado. El preview sigue mostrando SIEMPRE el borrador.

**Publicar y go-live (PUB-04, PUB-07)**
- **D-08:** **Confirmación SOLO en la primera publicación**, derivada de `landing_config IS NULL`.
- **D-09:** **Copy del dialog de go-live** — Título: "Publicar tu web". Cuerpo: *"A partir de ahora, quien entre a forjo.studio/{slug} va a ver tu web en vez de la página de reservas simple. Las reservas siguen funcionando igual, dentro de tu web."* CTA: "Publicar".
- **D-10:** **Feedback post-publicación:** `toast.success('Tu web está al aire')` con acción "Ver mi web". No saca al dueño del editor.
- **D-11:** **NO hay chequeo de calidad pre-publicación.** Si el Zod estricto lo acepta, se publica.

**Descartar borrador (PUB-06)**
- **D-12:** **Dialog destructivo**: *"Vas a perder todos los cambios que no publicaste. Tu web al aire no se toca."* Sin undo.
- **D-13:** **Descartar sin haber publicado nunca** (`landing_config` NULL): se borra el borrador y el editor vuelve a **sembrar `DEFAULT_LANDING_CONFIG`** + el aviso "Todavía no personalizaste tu web".
- **D-14:** **Las fotos subidas quedan huérfanas al descartar.** No se toca Storage.

**Gate y exposición (hereda Phase 13/14 — NO se toca en esta fase)**
- **D-15:** **Phase 15 NO cambia una sola línea de exposición.** Ruta directa `app/(dashboard)/web/`, gateada por `CMS_ENABLED` + `has_web_custom`, sin entrada en el nav. Orden 15 → 16 → 17 **LOCKED**.
- **D-16 (invariantes de seguridad, NO negociables):** las tres acciones pasan por Server Actions **owner-only** con el MISMO patrón que `saveLandingConfig`: flag-first fail-closed → session client (anon + cookies, RLS activo) → `business_id` de la **SESIÓN** → gate `has_web_custom` **en la acción** → Zod estricto reject-on-invalid. **PROHIBIDO service-role en la superficie web.** Publicar es una **copia server-side**: jamás se acepta un config del body como "lo que se publica".

### Claude's Discretion
- Firma exacta y granularidad de las Server Actions nuevas (`saveLandingDraft` / `publishLanding` / `discardLandingDraft` vs una sola con verbo), y si D-04 se resuelve encadenando dos actions desde el cliente o con una action `publish` que valide+persista+publique en un round-trip (en ese caso el config del body se escribe al BORRADOR y recién después se copia server-side — nunca directo a `landing_config`).
- Cómo se calcula "sin publicar" en el cliente (qué config publicado se pasa desde `page.tsx` como baseline) y cómo se compone el estado de 3 valores en `web-client.tsx`.
- Copy exacto de los toasts de error de las acciones nuevas y microcopy de los botones.
- Detalle de la migración 050 (nombre de la columna, default, backfill) mientras respete: aditiva, no destructiva, `UPDATE … SET landing_draft = landing_config`, validada con `supabase db reset` local y aplicada a mano en prod (nunca `db push`).

### Deferred Ideas (OUT OF SCOPE)
- **Autosave del borrador** — descartado en esta fase (D-01).
- **Toggle Borrador|Publicado en el preview** — descartado a favor del link "Ver mi web" (D-07).
- **Checklist de calidad pre-publicación** — descartado (D-11).
- **Limpieza de imágenes huérfanas en Storage** — backlog (heredado de Phase 14, D-02c).
- **Confirm-on-exit por navegación interna** — diferido. El `<Dialog>` muerto se recicla para publicar/descartar.
- **Columna `web_live`, historial/rollback, preview compartible por link** — Out of Scope del milestone.
- **Exponer el CMS / sacar `CMS_ENABLED`** — Phase 17. **La skill escribiendo el borrador** — Phase 16.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descripción | Research Support |
|----|-------------|------------------|
| PUB-03 | La página pública muestra SOLO lo publicado — guardar no cambia la web al aire | §"Lectura pública": los **3** lectores públicos (`app/[slug]/page.tsx:47`, `layout.tsx:18`, `opengraph-image.tsx:92`) ya seleccionan `landing_config` por nombre explícito → **no se tocan**. El cambio es que el editor deja de escribir esa columna (§"Write path", Patrón 2) |
| PUB-04 | El dueño publica su borrador y ve el cambio en su web pública | §"Patrón 3: publishLanding" (SELECT draft → Zod → UPDATE config) + §Pitfall 2 (`/[slug]` es `force-dynamic` ⇒ **no hace falta revalidar**: el cambio se ve en el próximo request) |
| PUB-05 | El editor distingue guardado de publicado | §"Patrón 4: derivación de los 3 estados" + §Pitfall 7 (canonicalización del compare draft-vs-published) |
| PUB-06 | Descartar el borrador y volver a lo publicado | §"Patrón 3: discardLandingDraft" (SELECT config → UPDATE draft) + §"Matriz de estados" (caso `published = null` ⇒ draft := NULL ⇒ reseed DEFAULT) |
| PUB-07 | Go-live: nunca publicó → reserva simple; publica → su web la reemplaza | §"Matriz de estados (config, draft)" filas 1-2-3 + `parseLandingConfig(null) → null` (`lib/landing/schema.ts:71-75`) que ya alimenta la rama legacy de `app/[slug]/page.tsx:125` |
| PUB-08 | Las landings al aire siguen idénticas tras la migración; el borrador arranca como copia fiel | §"Migración 050" (ADD COLUMN + `UPDATE SET landing_draft = landing_config`) + §"Orden de deploy" (migración ANTES del código) + §Runtime State Inventory |
</phase_requirements>

---

## Summary

Toda la fase se apoya en código que **ya existe y está probado**: el write path owner-only (`saveLandingConfig`), el validador estricto (`parseLandingConfigForWrite`), el fail-safe de lectura (`parseLandingConfig`), el deep-compare del borrador (`isDirty`) y la vista pública de columnas explícitas (`public_businesses`). No hay librería nueva, no hay dependencia nueva, no hay patrón de industria que investigar: **el trabajo es duplicar un molde ya auditado y desviar una escritura de columna.** El riesgo real no es técnico sino de *coordinación* (migración + deploy) y de *fugas por omisión* (que `landing_draft` termine en la vista pública o que un lector público se "arregle" a `select('*')`).

Tres hallazgos que condicionan el plan:

1. **`anon` no puede leer `businesses` en absoluto.** La tabla tiene RLS activa (`baseline.sql:1239`) y **una sola policy**: `CREATE POLICY "owner access" ON businesses USING (owner_id = auth.uid())` (`baseline.sql:1310`). No hay policy pública (la vieja `public read businesses` se dropeó en la migración 026, hoy archivada). Los `GRANT ALL ON TABLE businesses TO anon` (`baseline.sql:2896`) son a nivel tabla y **no otorgan nada** porque RLS filtra todas las filas para un `auth.uid()` NULL. **No hay GRANTs por columna en ninguna parte del schema.** Conclusión: `landing_draft` queda protegido *por construcción* (hereda la RLS de la fila) **siempre y cuando no entre en la vista `public_businesses`** — que corre **security-DEFINER** (owner `postgres`, sin `security_invoker`) y es la ÚNICA puerta de `anon` a esta tabla. La migración 050 **no debe tocar la vista**. Eso es todo el control de acceso de la fase.

2. **PostgREST no puede hacer `SET col_a = col_b`.** Publicar y descartar son, sí o sí, **SELECT + UPDATE en dos pasos dentro de la Server Action** (o un RPC nuevo). Se recomienda los dos pasos: además de evitar superficie SQL nueva, es lo único que permite **re-validar el borrador con Zod antes de publicarlo** — que es exactamente lo que el UI-SPEC pide con el código de error `invalid_draft`.

3. **No hay nada que revalidar.** `/[slug]` tiene `export const dynamic = 'force-dynamic'` (`app/[slug]/page.tsx:32`) y lee con `supabase-js` (no `fetch` cacheado). Ni Full Route Cache ni Data Cache tienen entrada para esa ruta. Llamar `revalidatePath` desde la Server Action **empeora las cosas**: la doc de Next 16 avisa que desde un Server Function *"also causes all previously visited pages to refresh when navigated to again"*. Recomendación: **no llamar revalidatePath ni refresh**; el estado post-publicación se actualiza en memoria en el cliente.

**Primary recommendation:** 3 Server Actions owner-only espejando `saveLandingConfig` — `saveLandingDraft(input: unknown)` (única que acepta payload), `publishLanding()` y `discardLandingDraft()` (**sin argumentos**, copia server-side pura). El cliente encadena **siempre** `saveLandingDraft(draft)` → `publishLanding()` al tocar Publicar (D-04 llevado a su forma más fuerte: publicás exactamente lo que ves). Migración 050 aditiva de 2 sentencias, sin tocar la vista ni ninguna policy. Extender `test/isolation.test.ts` con 4 casos nuevos (draft no está en la vista, cross-read, cross-write, same-tenant) y agregar un test puro de la máquina de 3 estados.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Persistir el borrador (`landing_draft`) | **API / Backend** (Server Action) | Database (RLS) | El write path owner-only es el invariante del Core Value: `business_id` de la sesión, Zod estricto. La RLS es la red de seguridad, no el guard primario |
| Copiar borrador → publicado | **API / Backend** (Server Action) | Database | "Copia server-side": el config publicado NUNCA viene del body. Toda la lógica vive en el server; el cliente solo dispara |
| Descartar borrador | **API / Backend** (Server Action) | — | Ídem: `landing_draft := landing_config` se resuelve server-side |
| Derivar los 3 estados (sin guardar / sin publicar / publicado) | **Browser / Client** | — | Es UI derivada de dos baselines que la page ya server-fetchea. Cero round-trip, cero estado nuevo en DB (D-03) |
| Aislamiento del borrador (nadie ve el de nadie) | **Database** (RLS + vista de columnas explícitas) | — | `anon`/otro tenant NO deben poder leerlo. Lo garantiza la policy `owner access` + la NO-inclusión en `public_businesses`. No es un check de app |
| Renderizar la web pública | **Frontend Server (RSC)** | Database (vista pública) | `/[slug]` + su `layout` + `opengraph-image` leen SOLO `landing_config`. Es la superficie que **no cambia** |
| Gate del add-on (`has_web_custom`) | **API / Backend** (en cada acción) | Database (trigger) | Gatear solo la page es cosmético. El trigger `businesses_protect_admin_columns` impide que el dueño se lo auto-otorgue |
| Aviso de go-live / confirmaciones | **Browser / Client** | — | Deriva de `publishedConfig === null`. Cero estado persistido (D-08) |

---

## Project Constraints (from CLAUDE.md / AGENTS.md / skills)

| Directiva | Origen | Impacto en Phase 15 |
|-----------|--------|---------------------|
| **Next.js 16, NO 14** — consultar `node_modules/next/dist/docs/` antes de asumir comportamiento | `AGENTS.md`, `.claude/CLAUDE.md` | Se consultó: `revalidatePath.md`, `refresh.md` (§State of the Art). Middleware = `proxy.ts` (no se toca) |
| **Aislamiento por tenant no negociable** (RLS + `business_id`) | `.claude/CLAUDE.md` | La columna nueva hereda la RLS de `businesses`. Test de aislamiento OBLIGATORIO |
| **Migraciones SQL numeradas, aplicadas a mano y en orden; nunca `db push`** | `.claude/CLAUDE.md`, `supabase/migrations/README.md`, molde de `049_clients_origin.sql` | Migración **050**. Idempotente (`ADD COLUMN IF NOT EXISTS`). Validar con `supabase db reset` local. Prod a mano + `NOTIFY pgrst, 'reload schema';` + regenerar `supabase/schema.sql` |
| **Service-role SOLO server-side, jamás en la superficie web de escritura** | `.claude/CLAUDE.md`, skill `supabase-multitenant-rls` | Las 3 acciones usan `@/lib/supabase/server` (anon + cookies). `createAdminClient()` PROHIBIDO en `app/(dashboard)/web/**` |
| **Errores de dominio**: `{ ok: true }` \| `{ ok: false, error: '<codigo_snake>' }` + toast por código | `.claude/CLAUDE.md` (Manejo de errores) | Las 3 acciones devuelven ese shape. Códigos nuevos: `no_draft`, `publish_failed`, `discard_failed`, `invalid_draft` (ya definidos en 15-UI-SPEC) |
| **Edit, no Write, sobre archivos existentes** (cambio parcial) | `CLAUDE.md` global (regla 3) | `web-client.tsx` (342 líneas) se EDITA por bloques; no se reescribe entero |
| **Cero dependencias nuevas / cero componentes nuevos** | `15-UI-SPEC.md` §Registry Safety | `Button`, `Dialog`, `sonner`, `lucide` ya vendorizados. Único cambio en `globals.css`: el token `--warning` |
| **Comentarios densos en español explicando el *por qué*** de decisiones no obvias | `.claude/CLAUDE.md` (Convenciones) | Migración 050 y las 3 acciones llevan bloque de cabecera al estilo de `049_clients_origin.sql` y `_landing-actions.ts` |
| **Rama de trabajo: `gsd/gestion-rebrand`** (NO `gsd/web-builder`) | STATE.md (Blockers) | Verificado: `git branch --show-current` → `gsd/gestion-rebrand` ✓ |

---

## Standard Stack

### Core — todo ya instalado, cero altas

| Librería | Versión (verificada en `package.json`) | Uso en esta fase | Por qué es la estándar acá |
|----------|----------------------------------------|------------------|----------------------------|
| `next` | **16.2.7** | Server Actions (`'use server'`), `force-dynamic`, RSC | Es el framework del repo. La fase no usa ninguna API de Next que no esté ya en uso |
| `@supabase/ssr` | ^0.10.3 | `createClient()` (anon + cookies, RLS activa) — el ÚNICO cliente permitido en el write path | D-16 / T-13-02 |
| `@supabase/supabase-js` | ^2.106.2 | `.select()` / `.update()` vía PostgREST | Idem |
| `zod` | ^4.4.3 | `parseLandingConfigForWrite` (estricto, reject-on-invalid) y `parseLandingConfig` (fail-safe) | Ya son los dos contratos del landing. **No crear un tercero** |
| `sonner` | ^2.0.7 | `toast.success` / `toast.error` (incluido el toast con `action`) | Convención del repo |
| `vitest` | (devDep, `npm test` → `vitest run`) | Tests puros + `test/isolation.test.ts` | Único framework de tests del repo |
| Supabase CLI | **2.109.1** (verificado en el entorno) + Docker OK | `supabase db reset` local para validar la 050 | Baseline replayable, PG17 local |

**Instalación:** ninguna. `npm install` no se corre en esta fase.

### Alternativas consideradas

| En vez de | Se podría usar | Trade-off |
|-----------|----------------|-----------|
| SELECT + UPDATE dentro de la Server Action | Un **RPC Postgres** `publish_landing_draft()` `SECURITY INVOKER` que haga `UPDATE businesses SET landing_config = landing_draft WHERE owner_id = auth.uid()` | El RPC es **atómico** y el payload nunca sale de la DB. **PERO**: (a) no puede correr Zod → mata el código `invalid_draft` del UI-SPEC (publicaría un borrador corrupto tal cual); (b) agrega superficie SQL nueva + `GRANT EXECUTE TO authenticated` que hay que auditar; (c) rompe el molde ya SECURED de Phase 13. **NO recomendado.** La carrera que el RPC evita requiere dos sesiones del MISMO dueño publicando a la vez — y con D-04 (save→publish encadenado) el peor caso es publicar un borrador idéntico |
| Derivar "sin publicar" en el cliente | Calcularlo **server-side** y pasarlo como prop booleano | Server-side obliga a refetchear la page tras cada publicar/descartar (`router.refresh()`), lo que re-ejecuta los 5 fetches del preview por un booleano. El cliente ya tiene ambos configs en memoria. **Cliente, sin dudas** |
| `landing_draft jsonb` (columna) | Tabla `landing_drafts` aparte (1:1) | Una tabla nueva = RLS nueva, policies nuevas, grants nuevos, JOIN nuevo, y una superficie de aislamiento que hay que probar desde cero. La columna **hereda** la RLS ya probada de `businesses`. **Columna.** (Además está LOCKED en CONTEXT) |

---

## Package Legitimacy Audit

**No aplica: esta fase no instala ningún paquete externo.** Cero dependencias nuevas (mandato explícito de `15-UI-SPEC.md` §Registry Safety y regla del repo). Toda la implementación usa librerías ya presentes en `package.json` y componentes ya vendorizados en `@/components/ui`.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
                          ┌──────────────────────── DUEÑO (sesión autenticada) ────────────────────────┐
                          │                                                                             │
   [1] GET /web ──────────▶ app/(dashboard)/web/page.tsx  (RSC, session client anon+cookies, RLS)      │
                          │    · CMS_ENABLED ? no → notFound()                                          │
                          │    · business = businesses WHERE owner_id = auth.uid()                      │
                          │    · has_web_custom ? no → notFound()                                       │
                          │    · 5 datasets del preview (.eq business_id)                               │
                          │    └─▶ props: initialDraft = business.landing_draft   ← NUEVO               │
                          │             publishedConfig = business.landing_config ← NUEVO               │
                          │                                                                             │
                          ▼                                                                             │
              web-client.tsx  ('use client')                                                            │
                 · draft (memoria) ──── mutadores puros (lib/landing/editor-draft.ts)                   │
                 · savedBaseline  ┐                                                                     │
                 · publishedBase. ┘── deriva ▶ [ sin guardar | sin publicar | publicado ]  (D-03/D-06)  │
                 · LandingRenderer(config = draft)  ← preview SIEMPRE del borrador (D-07)               │
                          │                                                                             │
        ┌─────────────────┼──────────────────┬──────────────────────────┐                               │
        │ Guardar         │ Publicar (D-04)  │ Descartar                │                               │
        ▼                 ▼                  ▼                          │                               │
  saveLandingDraft   saveLandingDraft   discardLandingDraft             │                               │
    (input)            (input)             ()                           │                               │
        │                 └─▶ publishLanding()                          │                               │
        │                        │                                      │                               │
        └────────────────────────┴──────────────────────────────────────┘                               │
                                 │  app/(dashboard)/web/_landing-actions.ts  ('use server')             │
                                 │  MISMO molde para las 3:                                             │
                                 │   1. CMS_ENABLED (fail-closed, PRIMER return)                        │
                                 │   2. createClient() ← anon+cookies · NUNCA createAdminClient()       │
                                 │   3. auth.getUser() → user                                           │
                                 │   4. business = SELECT id, has_web_custom WHERE owner_id = user.id   │
                                 │   5. !has_web_custom → not_entitled                                  │
                                 │   6. Zod estricto (parseLandingConfigForWrite)                       │
                                 │   7. UPDATE ... .eq('id', business.id).select('id')                  │
                                 ▼                                                                      │
                    ┌──────────── businesses (RLS: owner_id = auth.uid()) ────────────┐                 │
                    │  landing_draft  jsonb   ← escriben las 3 acciones               │                 │
                    │  landing_config jsonb   ← SOLO la copia server-side de publish  │                 │
                    │  has_web_custom bool    ← trigger businesses_protect_admin_cols │                 │
                    └──────────────────┬──────────────────────────────────────────────┘                 │
                                       │                                                                 │
      publish:  SELECT landing_draft ──┴──▶ Zod ──▶ UPDATE landing_config = <lo leído>   (copia server)  │
      discard:  SELECT landing_config ─────────────▶ UPDATE landing_draft  = <lo leído>                  │
                          └──────────────────────────────────────────────────────────────────────────────┘

                          ┌────────────── VISITANTE (anon, sin sesión) ──────────────┐
   GET /[slug] ───────────▶ app/[slug]/page.tsx  (force-dynamic, createPublicServerClient)
                          │   SELECT … landing_config FROM public_businesses          │  ← vista SECURITY DEFINER
                          │   parseLandingConfig(landing_config)                      │     columnas EXPLÍCITAS
                          │     · null      → BookingClient (reserva simple)  PUB-07  │     **landing_draft NO ENTRA**
                          │     · inválido  → DEFAULT_LANDING_CONFIG (nunca 500)      │
                          │     · válido    → LandingRenderer                         │
                          │ app/[slug]/layout.tsx      → admin client, select explícito con landing_config
                          │ app/[slug]/opengraph-image → admin client, select explícito con landing_config
                          └───────────── NINGUNO DE LOS 3 CAMBIA EN ESTA FASE ────────┘
```

**El que un lector público NUNCA vea el borrador no se garantiza con un `if`: se garantiza porque `landing_draft` no existe en la vista pública y porque los 3 lectores nombran sus columnas una por una.**

---

### Estructura de archivos (qué se toca y qué NO)

```
supabase/migrations/
└── 050_landing_draft.sql                     # NUEVO — aditivo, 2 sentencias
supabase/schema.sql                           # REGENERAR tras aplicar 050 (patrón del repo)

app/(dashboard)/web/
├── _landing-actions.ts                       # EDIT — +2 actions, saveLandingConfig → saveLandingDraft
├── page.tsx                                  # EDIT — pasa initialDraft + publishedConfig (2 props)
├── web-client.tsx                            # EDIT — barra de 3 botones, 3 estados, 2 dialogs, toasts
├── _sections/*                               # NO SE TOCA
lib/landing/
├── editor-draft.ts                           # EDIT — compare canónico + helper de estado (puro, testeable)
├── write.ts / schema.ts                      # NO SE TOCA (los dos contratos Zod siguen igual)
app/[slug]/
├── page.tsx / layout.tsx / opengraph-image.tsx  # NO SE TOCA (leen landing_config, punto)
app/globals.css                               # EDIT — token --warning (+ --color-warning) — 15-UI-SPEC
test/
├── isolation.test.ts                         # EDIT — 4 casos nuevos de landing_draft
└── landing-editor-draft.test.ts              # EDIT — o test nuevo: máquina de 3 estados + compare canónico
scripts/setup-landing.ts                      # NO SE TOCA (Phase 16)
```

---

### Patrón 1: Migración 050 — aditiva, dos sentencias, sin tocar nada más

**Qué:** columna `landing_draft jsonb` + backfill desde `landing_config`.
**Cuándo:** primera tarea de la fase; se aplica a prod **antes** del deploy del código.

```sql
-- 050 — businesses.landing_draft: separar BORRADOR de PUBLICADO (v0.18 / PUB-03..PUB-08).
--
-- Contexto:
--   Hasta hoy `landing_config` era a la vez "lo que edito" y "lo que está al aire": cada guardado del
--   CMS salía publicado al instante. Esta migración parte el dato en dos:
--     · landing_config → LO PUBLICADO   (lo único que leen /[slug], su layout y su opengraph-image)
--     · landing_draft  → LO QUE SE EDITA (lo único que escribe el editor del dueño)
--   Publicar = copia server-side draft → config. Descartar = copia server-side config → draft.
--
-- Qué hace:
--   1. ADD COLUMN IF NOT EXISTS landing_draft jsonb  (nullable, sin DEFAULT — igual que landing_config).
--   2. Backfill: landing_draft := landing_config para TODAS las filas donde el draft todavía no existe.
--      Esto es PUB-08: el negocio que ya tiene su landing al aire abre el editor y ve una COPIA FIEL de
--      lo publicado, y su web sigue idéntica (la columna publicada no se toca). El negocio legacy
--      (landing_config NULL) queda con draft NULL → `/[slug]` sigue mostrando su reserva simple (PUB-07).
--
-- Por qué NO lleva DEFAULT:
--   Un DEFAULT '{}'::jsonb rompería el fail-safe: `parseLandingConfig(null) → null` es la señal de
--   "negocio legacy". Un objeto vacío parsearía como inválido → DEFAULT_LANDING_CONFIG → le cambiaría
--   la página a todos los negocios sin landing. NULL es semántico acá, no es "falta un dato".
--
-- Qué NO hace (invariantes del proyecto):
--   - NO toca la vista `public_businesses`. Es la ÚNICA puerta de `anon` a esta tabla y corre
--     security-DEFINER (bypassa RLS) con columnas EXPLÍCITAS. Meter landing_draft ahí expondría el
--     borrador de TODOS los negocios a cualquier visitante y a cualquier usuario autenticado. NUNCA.
--   - NO agrega policy ni GRANT: `businesses` ya tiene RLS activa con la policy `owner access`
--     (owner_id = auth.uid()) como ÚNICA policy. La columna nueva hereda ese aislamiento fila-a-fila.
--     No hay GRANTs por columna en este schema; los GRANT ALL a anon/authenticated son a nivel tabla y
--     no otorgan nada porque RLS filtra todas las filas para un auth.uid() que no es dueño.
--   - NO toca el trigger businesses_protect_admin_columns (protege has_web_custom/has_whatsapp/plan/
--     plan_status). landing_draft NO va ahí: el dueño SÍ debe poder escribir su propio borrador.
--   - NO se aplica vía `supabase db push`. Validación autónoma = `supabase db reset` local (PG17).
--     Prod: A MANO, coordinada con el deploy + `NOTIFY pgrst, 'reload schema';` + regenerar schema.sql.

ALTER TABLE "public"."businesses"
  ADD COLUMN IF NOT EXISTS "landing_draft" jsonb;

-- Backfill idempotente: solo siembra el borrador donde todavía no hay uno (correr dos veces no pisa
-- un borrador que el dueño ya empezó a editar).
UPDATE "public"."businesses"
   SET "landing_draft" = "landing_config"
 WHERE "landing_draft" IS NULL
   AND "landing_config" IS NOT NULL;
```

**Verificación local (obligatoria antes de considerar la tarea hecha):**

```bash
npx supabase db reset          # replaya baseline + 040..050 en PG17 local
npx supabase db diff           # debe salir vacío contra el schema esperado
```

**Verificación de que la vista NO se contaminó** (correr en el SQL editor tras aplicar):

```sql
-- Debe devolver 0 filas. Si devuelve 1, la vista expone el borrador → FUGA.
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'public_businesses' AND column_name = 'landing_draft';
```

---

### Patrón 2: el write path — qué se toca y qué NO

**Lo que HOY existe** (`app/(dashboard)/web/_landing-actions.ts`, 90 líneas — leído íntegro):

| Paso | Línea | Qué hace | En Phase 15 |
|------|-------|----------|-------------|
| 1 | `:33`, `:39` | `const CMS_ENABLED = process.env.CMS_ENABLED === 'true'` → primer early-return `cms_disabled` | **Se copia idéntico en las 3 acciones** |
| 2 | `:46` | `const supabase = await createClient()` (anon + cookies, RLS) | Idéntico. **Nunca** `createAdminClient()` |
| 3 | `:49-52` | `auth.getUser()` → `unauthorized` | Idéntico |
| 4 | `:56-61` | `SELECT id, has_web_custom FROM businesses WHERE owner_id = user.id` → `no_business` | Idéntico. **El `business_id` sale de acá, jamás del body** |
| 5 | `:68` | `if (!business.has_web_custom) return not_entitled` | Idéntico en las 3 (gatear solo la page es cosmético) |
| 6 | `:71-72` | `parseLandingConfigForWrite(input)` → `invalid_config` | Solo en `saveLandingDraft`. En `publishLanding` se aplica al **borrador leído de la DB** → error `invalid_draft` |
| 7 | `:78-84` | `.update({ landing_config: parsed.data }).eq('id', business.id).select('id')` + chequeo de filas afectadas | **ÚNICO cambio real: la columna pasa a ser `landing_draft`.** El `.select('id')` + `length === 0` se conserva (detecta el update no-op, WR-01) |
| 8 | `:44`, `:87-89` | `try/catch` envolviendo los efectos de red → `server_error` | Idéntico |

**Diff conceptual:** una línea (`landing_config` → `landing_draft`) + dos acciones nuevas que reusan los pasos 1-5 y 8 verbatim.

**Firma recomendada (Claude's Discretion resuelta):**

```ts
// _landing-actions.ts
export async function saveLandingDraft(input: unknown): Promise<Result>   // única con payload
export async function publishLanding(): Promise<Result>                    // SIN argumentos
export async function discardLandingDraft(): Promise<Result>               // SIN argumentos
type Result = { ok: true } | { ok: false; error: string }
```

**Por qué `publishLanding()` sin argumentos** (y no una action que acepte el config y publique en un round-trip):

1. **Superficie de ataque = 0.** No hay body que validar, que estripar ni que confundir. La copia sale literalmente de la DB.
2. Es la lectura literal de D-16 ("jamás se acepta un config del body como lo que se publica") y de la excepción que la propia CONTEXT concede en Discretion (si hay body, se escribe al **borrador** y recién después se copia).
3. D-04 se resuelve en el cliente encadenando: `await saveLandingDraft(draft)` → si `ok` → `await publishLanding()`. Un round-trip extra a cambio de una action auditable en 20 segundos.
4. Si el guardado falla, `publishLanding()` no corre → "si falla el guardado, NO publica" sale gratis.

**Recomendación fuerte sobre D-04:** el handler de Publicar debe **guardar SIEMPRE** (no solo `if (dirty)`), porque el caso `(landing_config = null, landing_draft = null)` — negocio nuevo que abre el editor, ve la plantilla DEFAULT sembrada en memoria y toca Publicar sin haber tocado nada — tiene `unsaved = false` pero **no hay nada en la DB para copiar** → `publishLanding()` devolvería `no_draft` ("No hay nada para publicar") mientras el dueño está mirando su preview lleno. Guardar siempre elimina esa contradicción y refuerza el criterio de desempate de la fase (*"el dueño nunca publica algo distinto de lo que ve"*). El código `no_draft` se conserva igual como defensa server-side.

---

### Patrón 3: publicar y descartar = SELECT + UPDATE (PostgREST no hace `SET a = b`)

**El landmine:** `supabase.from('businesses').update({ landing_config: 'landing_draft' })` escribiría el **string literal** `"landing_draft"` en la columna. PostgREST no interpreta nombres de columna del lado derecho de un UPDATE. **No existe** forma de hacer la copia en una sola llamada sin un RPC.

```ts
// ── publishLanding: copia SERVER-SIDE del borrador al publicado (PUB-04, D-02) ──────────────
// Nada de esto acepta input: el config que se publica se LEE de la DB, no del body. Un POST directo
// a esta action no puede inyectar lo que sale al aire — a lo sumo publica el borrador del PROPIO
// negocio del atacante (que es su derecho).
export async function publishLanding(): Promise<Result> {
  if (!CMS_ENABLED) return { ok: false, error: 'cms_disabled' }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'unauthorized' }

    // business_id + entitlement + BORRADOR, todo en el MISMO select acotado a la sesión.
    const { data: business } = await supabase
      .from('businesses')
      .select('id, has_web_custom, landing_draft')
      .eq('owner_id', user.id)
      .single()
    if (!business) return { ok: false, error: 'no_business' }
    if (!business.has_web_custom) return { ok: false, error: 'not_entitled' }

    // Sin borrador no hay nada que publicar. El cliente encadena save→publish, así que en la práctica
    // esto solo salta ante una carrera; igual se corta acá (fail-closed).
    if (business.landing_draft === null || business.landing_draft === undefined)
      return { ok: false, error: 'no_draft' }

    // Zod ESTRICTO sobre lo LEÍDO de la DB (no sobre un body): un borrador corrupto — escrito por el
    // script del operador, por una versión vieja del editor o a mano — NO sale al aire. Reject-on-invalid,
    // nunca coerción a DEFAULT (eso es el contrato de RENDER, no el de ESCRITURA).
    const parsed = parseLandingConfigForWrite(business.landing_draft)
    if (!parsed.ok) return { ok: false, error: 'invalid_draft' }

    // La copia. Solo landing_config; el borrador queda INTACTO (D-02: post-publish draft == published).
    const { data: updated, error } = await supabase
      .from('businesses')
      .update({ landing_config: parsed.data })
      .eq('id', business.id)
      .select('id')
    if (error || !updated || updated.length === 0) return { ok: false, error: 'publish_failed' }

    // NO se llama revalidatePath/refresh: /[slug] es force-dynamic (no hay caché que invalidar) y
    // revalidatePath desde un Server Function refresca TODAS las páginas ya visitadas al navegar
    // (doc de Next 16). El estado post-publicación se resuelve en memoria en el cliente.
    return { ok: true }
  } catch {
    return { ok: false, error: 'server_error' }
  }
}
```

```ts
// ── discardLandingDraft: el borrador vuelve a ser copia fiel de lo publicado (PUB-06, D-12/D-13) ──
// Si el negocio NUNCA publicó (landing_config = null), el borrador se limpia a NULL: el editor
// re-siembra DEFAULT_LANDING_CONFIG en memoria (mismo camino de empty-state de Phase 14) y su
// /[slug] sigue mostrando la reserva simple. Nunca queda un editor vacío ni un estado "sin web" nuevo.
export async function discardLandingDraft(): Promise<Result> {
  // pasos 1-5 idénticos a publishLanding, pero el select trae landing_config…
  const { data: business } = await supabase
    .from('businesses')
    .select('id, has_web_custom, landing_config')
    .eq('owner_id', user.id)
    .single()
  // …y el update escribe el borrador con lo publicado (o NULL si nunca publicó).
  const { data: updated, error } = await supabase
    .from('businesses')
    .update({ landing_draft: business.landing_config ?? null })
    .eq('id', business.id)
    .select('id')
  if (error || !updated || updated.length === 0) return { ok: false, error: 'discard_failed' }
  return { ok: true }
}
```

**Nota sobre "no revalidar" (Zod y el config publicado):** en `discard` NO se re-valida `landing_config` con Zod. Es correcto: ese valor **ya está al aire** y el contrato de lectura (`parseLandingConfig`) es fail-safe. Meterle el validador estricto podría bloquear el descarte de un negocio cuyo config publicado es viejo/raro — un dead-end sin salida.

---

### Patrón 4: derivar los 3 estados (client-side, cero estado nuevo)

`page.tsx` pasa **dos** configs crudos (hoy pasa uno):

```ts
// app/(dashboard)/web/page.tsx — el select('*') de :42-46 YA trae la columna nueva sin tocarlo.
// El tipo Business no declara ninguna de las dos (igual que hoy con landing_config, :91) → cast puntual.
const b = business as { landing_config?: unknown; landing_draft?: unknown }
const publishedConfig = b.landing_config ?? null
// Coalesce DEFENSIVO (draft ?? config): cubre el estado (config=X, draft=null) — que la migración no
// produce, pero que un rollback o una fila tocada a mano sí podrían — y evita mostrarle una plantilla
// vacía a un dueño cuya web está al aire.
const initialDraft = b.landing_draft ?? publishedConfig
```

En `web-client.tsx`, con los helpers PUROS de `lib/landing/editor-draft.ts`:

```ts
// Ambos baselines pasan por EL MISMO pipeline de normalización. Si el published se parsea distinto que
// el draft (ej. sin stripPrimary), un negocio con `overrides.primary` guardado abriría el editor
// diciendo "Guardado — sin publicar" sin haber tocado nada. Falso positivo permanente.
const seedDraft = useMemo(
  () => stripPrimary(parseLandingConfig(initialDraft) ?? DEFAULT_LANDING_CONFIG),
  [initialDraft],
)
const publishedBaseline = useMemo(
  () => (publishedConfig === null ? null : stripPrimary(parseLandingConfig(publishedConfig)!)),
  [publishedConfig],
)

const [draft, setDraft] = useState(seedDraft)
const [savedBaseline, setSavedBaseline] = useState(seedDraft)
const [published, setPublished] = useState<LandingConfig | null>(publishedBaseline)

const unsaved       = isDirty(draft, savedBaseline)            // memoria ≠ landing_draft
const neverPublished = published === null                       // D-08 → dialog de go-live
const unpublished   = neverPublished || isDirty(savedBaseline, published)

// Precedencia (D-06, excluyentes):
const state = unsaved ? 'unsaved' : unpublished ? 'unpublished' : 'published'
```

**Transiciones de estado tras cada acción — todas en memoria, sin refetch:**

| Acción | `ok` ⇒ |
|--------|--------|
| Guardar | `setSavedBaseline(draft)` |
| Publicar (save→publish) | `setSavedBaseline(draft); setPublished(draft)` → estado 3 (`✓ Publicado`) |
| Descartar | `const base = published ?? stripPrimary(DEFAULT_LANDING_CONFIG); setDraft(base); setSavedBaseline(base)` (si `published === null`, además reaparece el aviso de empty-state) |

**Por qué NO `router.refresh()` / `revalidatePath` tras publicar:** re-renderizaría la page (5 fetches del preview) y recomputaría los `useMemo`, pero los `useState` **no se resetean** con props nuevas → el estado quedaría idéntico al que ya seteamos a mano. Es trabajo puro sin efecto. Peor: `revalidatePath` desde un Server Function purga el Router Cache del cliente y fuerza refresh de todas las páginas visitadas (doc de Next 16, ver §State of the Art).

---

### Matriz de estados `(landing_config, landing_draft)` — el contrato de PUB-07/PUB-08

| # | `landing_config` (publicado) | `landing_draft` | ¿Cómo se llega? | `/[slug]` renderiza | Editor muestra |
|---|------------------------------|-----------------|------------------|---------------------|----------------|
| 1 | `NULL` | `NULL` | Negocio legacy que nunca publicó ni guardó (estado post-migración de todos los que hoy no tienen landing) | **Reserva simple** (`parseLandingConfig(null) → null` → rama legacy de `page.tsx:125`) | Siembra `DEFAULT_LANDING_CONFIG` + aviso *"Todavía no personalizaste tu web"*. `neverPublished` ⇒ **Publicar habilitado**; primera publicación abre el dialog de go-live |
| 2 | `NULL` | `X` | Guardó su borrador sin publicar — **o la skill se lo armó** (Phase 16) | **Reserva simple** (¡el borrador NO sale!) | `draft = X`, aviso *"Tu web todavía no está publicada"*, estado `● Guardado — sin publicar` |
| 3 | `X` | `X` | **Estado post-migración de todos los que HOY tienen landing al aire (PUB-08)** o post-publicación (D-02) | `X` — **idéntica a antes del deploy** | `✓ Publicado`, los 3 botones disabled |
| 4 | `X` | `Y` | Publicó y después siguió editando y guardó | `X` (**no cambia** — PUB-03) | `● Guardado — sin publicar`, Publicar y Descartar habilitados |
| 5 | `X` | `NULL` | **La migración no lo produce.** Solo alcanzable por rollback parcial o edición manual de la fila | `X` | El coalesce `draft ?? config` lo trata como el caso 3: siembra el borrador desde lo publicado. **Nunca** un editor vacío sobre una web al aire |

**PUB-08 en una línea:** la migración lleva a todo el universo a los estados **1** o **3**, y ninguno de los dos cambia lo que ve un visitante.

---

### Anti-patrones a evitar

- **Meter `landing_draft` en `public_businesses`.** La vista corre **security-DEFINER** (no tiene `security_invoker`, `baseline.sql:520`) → bypassa la RLS de `businesses` a propósito. Cualquier columna que entre ahí queda legible por **anon y por cualquier usuario autenticado, de cualquier tenant**. Es el único agujero posible de esta fase.
- **"Arreglar" un lector público a `select('*')`.** Los 3 (`page.tsx:47`, `layout.tsx:18`, `opengraph-image.tsx:92`) nombran columnas explícitamente. Cambiarlos a `*` no rompe nada visible pero arrastra el borrador al server y habilita que alguien lo use "porque está ahí".
- **Usar `createAdminClient()` en la Server Action** "para que la copia sea confiable". Prohibido (D-16 / T-13-02). La copia ya es confiable: la hace el server con la sesión del dueño y RLS activa.
- **Aceptar el config a publicar desde el body.** Convierte "publicar" en "escribir directo lo publicado" y tira toda la fase a la basura.
- **Escribir `landing_config` desde el editor "por compatibilidad"** (doble escritura draft+config). Rompe PUB-03 en silencio.
- **Autosave del borrador** (D-01 lo descarta) — y sería peor ahora: escrituras invisibles sobre una columna que el dueño cree "privada".
- **Añadir `landing_draft` al trigger `businesses_protect_admin_columns`.** Ese trigger revierte columnas **administrativas** para no-service_role. El dueño DEBE poder escribir su borrador.
- **Deshabilitar "Publicar" cuando hay cambios sin guardar.** Dead-end visual explícitamente prohibido por D-04 y por la matriz del UI-SPEC §4.

---

## Don't Hand-Roll

| Problema | No construir | Usar en cambio | Por qué |
|----------|--------------|----------------|---------|
| Validar el config antes de escribir | Un validador nuevo / chequeos a mano | `parseLandingConfigForWrite` (`lib/landing/write.ts:20`) | Ya es el contrato de escritura (reject-on-invalid), ya está testeado (`lib/landing/write.test.ts`) y ya está SECURED |
| Leer un config posiblemente corrupto | `JSON.parse` + ifs | `parseLandingConfig` (`lib/landing/schema.ts:71`) | Total y fail-safe: `null → null` (legacy), inválido → DEFAULT. **Es de lo que depende PUB-07** |
| Comparar borrador vs publicado | Un diff nuevo, un hash, un `updated_at` | `isDirty` (`lib/landing/editor-draft.ts:197`) — con el compare canónico del Pitfall 7 | Ya alimenta "cambios sin guardar" y ya tiene tests |
| Aislar el borrador entre tenants | Un `if (business_id === …)` en la acción | **RLS de `businesses`** (policy `owner access`) + no incluir la columna en la vista pública | El check de app es defensa en profundidad, no el guard. La skill `supabase-multitenant-rls` es explícita |
| Gate del add-on | Un flag en el cliente / solo en la page | `has_web_custom` chequeado **en cada Server Action** + trigger `businesses_protect_admin_columns` | Un POST directo saltea la page. Y el trigger impide que el dueño se lo auto-otorgue (ya probado en `isolation.test.ts:165`) |
| Confirmación destructiva / toasts | Componentes nuevos | `Dialog` (el bloque **muerto** de `web-client.tsx:321-338`) + `sonner` | Ya vendorizados. Cero deps nuevas (UI-SPEC §Registry Safety) |
| Invalidar la caché de `/[slug]` | `revalidatePath` / `revalidateTag` / `unstable_cache` | **Nada** | `force-dynamic` + supabase-js ⇒ no hay caché. Ver §State of the Art |

**Key insight:** el 90% de esta fase es *no inventar nada*. Cada pieza que se sienta tentador escribir de cero ya existe, ya fue auditada por `/gsd:secure-phase 13` y ya tiene tests. El valor del plan está en **desviar una escritura de columna sin romper ninguno de esos contratos**.

---

## Runtime State Inventory

> Fase de migración de datos → esta sección es obligatoria.

| Categoría | Qué se encontró | Acción requerida |
|-----------|-----------------|------------------|
| **Datos almacenados** | `businesses.landing_config` (jsonb) en **prod**: filas con landing publicada (al menos las que ya se armaron con la skill) + el resto en NULL. La columna `landing_draft` **no existe** todavía (verificado: `grep -rn "landing_draft"` en todo el repo → 0 hits fuera de los docs de planning) | **Migración de datos + code edit, las dos.** La 050 hace el backfill (`UPDATE … SET landing_draft = landing_config`) y el código cambia a qué columna escribe. Sin el backfill, todo negocio publicado abriría el editor vacío |
| **Config de servicios vivos** | Ninguna. `landing_config` no viaja a MercadoPago, ni a n8n, ni a Google Calendar, ni al agente de WhatsApp. **Verificado:** el único consumidor externo del landing es `scripts/setup-landing.ts` (service-role, corre local, fuera del runtime web) — y **Phase 16** lo migra, **Phase 15 no lo toca** | **Ninguna en Phase 15.** Ojo: entre el deploy de 15 y el de 16, el script sigue escribiendo `landing_config` → **una web armada por la skill sale AL AIRE al instante** (comportamiento de hoy). Es exactamente lo que 16 viene a arreglar; no es una regresión nueva, pero conviene que el operador lo sepa |
| **Estado registrado en el SO** | Ninguno. Sin Task Scheduler, sin pm2, sin systemd tocando esto | Ninguna |
| **Secretos / env vars** | `CMS_ENABLED` (server-only, fail-closed). **No cambia en esta fase** (sacarlo es Phase 17 / PUB-01). No se agrega ninguna env var nueva | Ninguna. Verificar que `CMS_ENABLED=true` esté seteada en el entorno donde se vaya a probar el editor |
| **Artefactos de build / caché** | (a) **PostgREST cachea el schema**: tras aplicar la 050 en prod, `SELECT landing_draft` da *"column does not exist"* hasta que se corre `NOTIFY pgrst, 'reload schema';` (patrón ya documentado en `049_clients_origin.sql`). (b) `supabase/schema.sql` queda desactualizado → **regenerar** (patrón del repo: se hizo tras 037/039/042/043) | **Sí:** `NOTIFY pgrst, 'reload schema';` inmediatamente después del `ALTER TABLE` en prod + regenerar `schema.sql` y commitearlo |

### Orden de deploy (no negociable)

```
1. Aplicar 050 a PROD (SQL editor, a mano)  ─┐  la columna nueva es INVISIBLE para el código viejo:
2. NOTIFY pgrst, 'reload schema';            │  el editor actual sigue escribiendo landing_config y
                                             │  las webs al aire no se enteran. Ventana segura.
3. Deploy del código (Vercel)               ─┘  a partir de acá el editor escribe landing_draft.
4. Regenerar supabase/schema.sql + commit
```

**Al revés se rompe:** con el código nuevo desplegado y la 050 sin aplicar, `saveLandingDraft` intenta `UPDATE … SET landing_draft = …` sobre una columna inexistente → PostgREST devuelve error → `update_failed` en cada guardado. (No hay pérdida de datos, pero el editor queda inutilizable.)

---

## Common Pitfalls

### Pitfall 1 — PostgREST no hace `SET col_a = col_b`
**Qué sale mal:** `.update({ landing_config: 'landing_draft' })` escribe el **string** `"landing_draft"` en la columna jsonb. El config publicado queda destruido (bueno: `parseLandingConfig` lo coacciona a `DEFAULT_LANDING_CONFIG` y la página no 500ea… pero el dueño perdió su web).
**Por qué pasa:** PostgREST solo acepta valores literales en el body del UPDATE.
**Cómo evitarlo:** SELECT + UPDATE en dos pasos dentro de la action (Patrón 3), o RPC. **Nunca** un nombre de columna como string.
**Señal de alarma:** un test que publique y encuentre `landing_config === "landing_draft"`.

### Pitfall 2 — Creer que hay que revalidar `/[slug]`
**Qué sale mal:** se agrega `revalidatePath('/[slug]', 'page')` "por las dudas" y aparecen refreshes espurios en el dashboard.
**Por qué pasa:** intuición de Next 13/14. Pero `/[slug]` es `force-dynamic` (`app/[slug]/page.tsx:32`) y lee con supabase-js (no `fetch` cacheado; además desde Next 15 `fetch` no se cachea por default) → **no hay entrada de caché que invalidar**. Y la doc de Next 16 avisa: desde un Server Function, `revalidatePath` *"also causes all previously visited pages to refresh when navigated to again"*.
**Cómo evitarlo:** no llamar `revalidatePath` ni `refresh()`. Actualizar el estado del editor en memoria.
**Señal de alarma:** el editor pierde el scroll o parpadea después de publicar.

### Pitfall 3 — `landing_draft` colándose en la vista pública
**Qué sale mal:** alguien regenera `public_businesses` con `SELECT *` o agrega la columna "por simetría con `landing_config`". El borrador de **todos** los negocios queda legible por cualquier visitante y por cualquier usuario autenticado (la vista es security-definer).
**Por qué pasa:** `landing_config` **sí** está en la vista (`baseline.sql:539`) → parece natural que su hermana también.
**Cómo evitarlo:** la 050 **no toca la vista**. Test de aislamiento que asierta que `select('landing_draft')` sobre `public_businesses` **falla**.
**Señal de alarma:** el test de aislamiento nuevo pasa de "error esperado" a "devuelve fila".

### Pitfall 4 — Deploy antes que la migración
**Qué sale mal:** cada guardado devuelve `update_failed` (columna inexistente).
**Cómo evitarlo:** §"Orden de deploy". La migración es aditiva → aplicarla primero es 100% seguro para el código viejo.

### Pitfall 5 — Olvidarse el `NOTIFY pgrst, 'reload schema';`
**Qué sale mal:** la columna existe en Postgres pero PostgREST sigue con su schema cache viejo → `column businesses.landing_draft does not exist`, aun después de aplicar la migración. Diagnóstico frustrante ("¡pero si la columna está!").
**Cómo evitarlo:** correr el `NOTIFY` en el mismo bloque SQL de la migración en prod (ya es el patrón del repo — documentado en `049_clients_origin.sql`).

### Pitfall 6 — `DEFAULT` en la columna nueva
**Qué sale mal:** `ADD COLUMN landing_draft jsonb DEFAULT '{}'::jsonb` → todos los negocios legacy quedan con un draft `{}` → el editor lo parsea como inválido → `DEFAULT_LANDING_CONFIG` → si alguna vez se publica, la landing genérica pisa la reserva simple. Y encima rompe la señal semántica `null = nunca tuvo landing`.
**Cómo evitarlo:** columna **nullable, sin DEFAULT** (igual que `landing_config`). `NULL` es un valor con significado en este dominio.

### Pitfall 7 — El compare draft-vs-published y el orden de claves (JSON)
**Qué sale mal:** `isDirty` usa `JSON.stringify` (documentado en `editor-draft.ts:191-199`), que **es sensible al orden de claves**. Los dos baselines vienen de fuentes distintas:
- `savedBaseline` puede ser el objeto **en memoria** (tras un guardado exitoso: `setSavedBaseline(draft)`), con el orden de claves que dejaron los mutadores.
- `published` viene de un **round-trip por jsonb**, y Postgres **reordena las claves de un jsonb** (las guarda por longitud+orden binario, no por orden de inserción).

Resultado posible: dos configs **semánticamente idénticos** que stringifican distinto → el indicador dice `● Guardado — sin publicar` para siempre y el botón Publicar nunca se apaga. Es el bug más probable de la fase y **no lo agarra ningún type-check**.

**Cómo evitarlo (recomendado):** agregar a `lib/landing/editor-draft.ts` un **stringify canónico** (recursivo, con claves ordenadas) y usarlo en el compare. Es puro, testeable y no cambia el comportamiento del `isDirty` actual (mismo objeto → mismo resultado):

```ts
// ── canonicalStringify: serialización estable, insensible al orden de claves ─────────────────
// POR QUÉ: el borrador y el publicado NO vienen del mismo lugar. El publicado viaja por jsonb, y
// Postgres REORDENA las claves de un jsonb (las almacena por longitud + orden binario, no por orden
// de inserción). El borrador en memoria conserva el orden que le dejaron los mutadores. Dos configs
// idénticos podrían stringificar distinto → "hay cambios sin publicar" eterno, con el botón Publicar
// prendido para siempre. Ordenar las claves antes de serializar mata esa clase de falso positivo.
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)              // el orden de un array SÍ es significativo
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
    )
  }
  return v
}
export function configsEqual(a: LandingConfig, b: LandingConfig): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}
export function isDirty(current: LandingConfig, saved: LandingConfig): boolean {
  return !configsEqual(current, saved)
}
```

### Pitfall 8 — Parsear los dos baselines con pipelines distintos
**Qué sale mal:** el draft se siembra con `stripPrimary(parseLandingConfig(x) ?? DEFAULT)` (así lo hace hoy `web-client.tsx:102-105`) pero el published se pasa crudo o se parsea sin `stripPrimary`. Un negocio con `theme.overrides.primary` guardado abre el editor y ve `● Guardado — sin publicar` **sin haber tocado nada**.
**Cómo evitarlo:** **el mismo pipeline para los dos** (Patrón 4). Único asimetría legítima: `published === null` se preserva como `null` (es la señal de `neverPublished`), no se coacciona a DEFAULT.

### Pitfall 9 — El `.select('id')` post-update
**Qué sale mal:** sin él, un UPDATE que afecta 0 filas (negocio borrado entre el fetch y el update, o RLS denegando) devuelve `{ ok: true }` sin haber escrito nada. Ya está resuelto en `saveLandingConfig` (`:82-84`, WR-01 del code-review de Phase 13).
**Cómo evitarlo:** las 3 acciones nuevas conservan `.select('id')` + `if (!updated || updated.length === 0) return { ok:false, … }`.

### Pitfall 10 — `after()` de `next/server`
No aplica y no debe usarse. Es para efectos best-effort no críticos (emails, Google Calendar). Publicar **es** el efecto crítico: si falla, el dueño tiene que enterarse por un toast, no por un `console.error` en Vercel.

### Pitfall 11 — El trigger de columnas admin corre en CADA UPDATE
`businesses_protect_admin_columns` es `BEFORE UPDATE FOR EACH ROW` (`baseline.sql:897`) y reasigna `has_web_custom/has_whatsapp/plan/plan_status` a sus valores viejos cuando `auth.role() <> 'service_role'`. **No interfiere** con `landing_draft`/`landing_config` (no las toca), pero significa que **cada** UPDATE del dueño pasa por una función plpgsql SECURITY DEFINER. No agregar la columna nueva a esa lista, y no "optimizarlo".

### Pitfall 12 — Limitación conocida y ACEPTADA (heredada de Phase 13)
Con la policy `owner access` siendo `FOR ALL`, el dueño puede — técnicamente — escribir **su propia** `landing_config` con la anon-key directo desde la consola del browser, salteando la Server Action y, por lo tanto, la semántica de "publicar". **Esto NO viola el Core Value** (sigue siendo owner-only; nadie escribe la fila de otro) y ya está documentado y aceptado en `_landing-actions.ts:24-29`. Cerrarlo requeriría `REVOKE UPDATE (landing_config) ON businesses FROM authenticated` — que **también rompería la Server Action** (corre como `authenticated`) y obligaría a un RPC `SECURITY DEFINER`. **Fuera de scope; declararlo explícitamente en `/gsd:secure-phase 15` como riesgo aceptado**, igual que en Phase 13.

---

## Code Examples

### Guardar el borrador (el único diff real sobre `saveLandingConfig`)

```ts
// app/(dashboard)/web/_landing-actions.ts
// Antes (Phase 13/14):
const { data: updated, error } = await supabase
  .from('businesses')
  .update({ landing_config: parsed.data })   // ← salía al aire al instante
  .eq('id', business.id)
  .select('id')

// Ahora (Phase 15) — Guardar deja de tener consecuencias públicas (D-01):
const { data: updated, error } = await supabase
  .from('businesses')
  .update({ landing_draft: parsed.data })    // ← BORRADOR. La web al aire no se mueve (PUB-03)
  .eq('id', business.id)
  .select('id')
```

### El handler de Publicar en el cliente (D-04 en su forma fuerte)

```tsx
// web-client.tsx
async function doPublish() {
  if (busy || uploading > 0) return
  setPublishing(true)                       // el botón dice "Publicando…" TODO el tiempo (UI-SPEC §4)
  // Guardar SIEMPRE, no solo si `unsaved`: publicar copia el borrador DE LA DB, y un negocio que
  // nunca guardó no tiene borrador que copiar (estado 1 de la matriz). Así el dueño publica
  // exactamente lo que ve en el preview — el criterio de desempate de toda la fase.
  const saved = await saveLandingDraft(draft)
  if (!saved.ok) {
    setPublishing(false)
    toast.error(ACTION_ERROR_COPY[saved.error] ?? ACTION_ERROR_COPY.server_error)
    return                                  // si falla el guardado, NO publica (D-04)
  }
  const res = await publishLanding()        // sin argumentos: la copia sale de la DB
  setPublishing(false)
  if (!res.ok) {
    toast.error(ACTION_ERROR_COPY[res.error] ?? ACTION_ERROR_COPY.server_error)
    return                                  // el borrador quedó guardado → estado 2, recuperable
  }
  const first = published === null
  setSavedBaseline(draft)
  setPublished(draft)                       // ⇒ estado 3 (✓ Publicado). Sin refetch, sin revalidate.
  toast.success(first ? 'Tu web está al aire' : 'Cambios publicados', {
    duration: 6000,
    action: { label: 'Ver mi web', onClick: () => window.open(`/${business.slug}`, '_blank', 'noopener,noreferrer') },
  })
}
```

### Los 4 casos nuevos de `test/isolation.test.ts`

```ts
// ── landing_draft: aislamiento del BORRADOR (Phase 15 / PUB-03) ────────────────────────────────
// Aserciones SOLO con anon-key autenticado (anonA/anonB). seeded.admin únicamente para checks de
// efecto independientes — nunca como cliente de aserción (Pitfall 12 del test).

it('el borrador NO se expone en la vista pública (public_businesses NO tiene landing_draft)', async () => {
  // La vista corre security-DEFINER (bypassa RLS) → cualquier columna que entre ahí es legible por
  // anon y por CUALQUIER usuario autenticado, de cualquier tenant. El borrador NO puede entrar.
  const { error } = await anonA
    .from('public_businesses')
    .select('landing_draft')
    .eq('id', seeded.bizA)
    .single()
  expect(error).not.toBeNull()   // PostgREST: column does not exist
})

it('cross-READ landing_draft: B no ve el borrador de A (RLS, SIN filtro business_id)', async () => {
  // Sin .eq(): dejamos que RLS oculte la fila de A. Si la policy se cayera, la fila aparecería.
  const { data } = await anonB.from('businesses').select('id, landing_draft')
  expect((data ?? []).some((r) => r.id === seeded.bizA)).toBe(false)
})

it('cross-WRITE landing_draft: B no puede escribir el borrador de A', async () => {
  const { data, error } = await anonB
    .from('businesses')
    .update({ landing_draft: { theme: { preset: 'forjo' }, sections: [] } })
    .eq('id', seeded.bizA)
    .select('id')
  expect(error !== null || (data ?? []).length === 0).toBe(true)
  // Check de efecto independiente (NO es la aserción de RLS): el borrador de A sigue intacto.
  const { data: check } = await seeded.admin
    .from('businesses').select('landing_draft').eq('id', seeded.bizA).single()
  expect(check?.landing_draft).toBeNull()
})

it('same-tenant: A SÍ escribe su propio borrador (happy path)', async () => {
  const cfg = { theme: { preset: 'forjo' }, sections: [] }
  const { error } = await anonA
    .from('businesses').update({ landing_draft: cfg }).eq('id', seeded.bizA).select('id')
  expect(error).toBeNull()
  const { data: check } = await seeded.admin
    .from('businesses').select('landing_draft').eq('id', seeded.bizA).single()
  expect(check?.landing_draft).toMatchObject(cfg)
})
```

> **Ojo con el orden de los `it`:** el test existente `cross-WRITE landing_config` (`isolation.test.ts:117`) asierta que `landing_config` de A **sigue en null**, y el `same-tenant WRITE` (`:138`) lo escribe después, a propósito. Los casos nuevos de `landing_draft` deben respetar la misma disciplina: el cross-write (que asierta `null`) va **antes** del same-tenant (que escribe). Meter el happy-path primero rompería la aserción del cross-write.

### Test puro de la máquina de estados (sin DB, `environment: node`)

```ts
// test/landing-publish-state.test.ts (nuevo) — o extender test/landing-editor-draft.test.ts
// Cubre la matriz (config, draft) → estado del indicador + habilitación de botones, y el compare
// canónico (Pitfall 7). Es la lógica que decide si el dueño ve "Publicado" o no: merece test propio.
describe('estado publish del editor', () => {
  it('draft == published (distinto orden de claves) ⇒ Publicado', () => {
    const a = { theme: { preset: 'x' }, sections: [{ type: 'hero', enabled: true, order: 0 }] }
    const b = { sections: [{ order: 0, enabled: true, type: 'hero' }], theme: { preset: 'x' } }
    expect(configsEqual(a as LandingConfig, b as LandingConfig)).toBe(true)   // ← sin canonical, FALLA
  })
  it('published === null ⇒ neverPublished ⇒ Publicar habilitado (go-live)', () => { /* … */ })
  it('draft ≠ published ⇒ Guardado — sin publicar', () => { /* … */ })
})
```

---

## State of the Art — Next.js 16 (caché, revalidación, Server Actions)

| Enfoque viejo | Enfoque actual (Next 16) | Impacto acá |
|---------------|--------------------------|-------------|
| `revalidatePath` después de toda mutación | Solo si hay algo cacheado. `fetch` **no se cachea por default** desde Next 15, y `dynamic = 'force-dynamic'` fuerza render por request | **No se llama.** `/[slug]` no tiene entrada de caché [CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md] |
| `router.refresh()` desde el cliente | `refresh()` de `next/cache`, **solo** dentro de una Server Action | No se usa: el estado post-publicación se resuelve en memoria [CITED: .../04-functions/refresh.md] |
| — | `revalidatePath` desde un Server Function *"Currently, it also causes all previously visited pages to refresh when navigated to again"* | Razón concreta para **no** llamarlo por las dudas [CITED: revalidatePath.md, sección "Good to know"] |
| — | `updateTag` / `revalidateTag` / `cacheLife` / `cacheTag` (Cache Components) | **No se usan en el repo** (no hay `use cache`, `next.config.ts` es mínimo). No introducirlos en esta fase |
| Middleware = `middleware.ts` | **`proxy.ts`** en la raíz | No se toca (el editor vive bajo `(dashboard)`, ya cubierto por el matcher) |

**Deprecado / desactualizado:**
- `unstable_cache`, `unstable_noStore`: no están en el repo. No agregarlos.
- La intuición "toda mutación necesita revalidación" es de la era Next 13/14 con `fetch` cacheado por default.

---

## Assumptions Log

| # | Claim | Sección | Riesgo si está mal |
|---|-------|---------|--------------------|
| A1 | Postgres **reordena las claves** al almacenar un `jsonb` (por longitud + orden binario) → el round-trip por DB puede devolver un orden de claves distinto al de inserción | Pitfall 7 | Bajo. Si me equivoco, el compare canónico **igual es correcto** (solo es "insurance" innecesaria). Si acierto y NO se implementa, el indicador de "sin publicar" puede quedarse trabado. Costo de la mitigación: ~15 líneas puras + 1 test |
| A2 | El `select('*')` de `app/(dashboard)/web/page.tsx:42` traerá `landing_draft` automáticamente tras la migración (PostgREST devuelve todas las columnas visibles) | Patrón 4 | Bajo. Si no, se lista la columna explícitamente. Se verifica en el primer render del editor |
| A3 | `opengraph-image.tsx` no requiere revalidación explícita tras publicar (su caché, si existe, es la misma que ya tenía cuando `saveLandingConfig` escribía directo a `landing_config`) | Pitfall 2 | Bajo y **no-regresivo**: sea cual sea el comportamiento de caché de la og:image, es **idéntico al de hoy**. Esta fase no lo empeora. Si el og:image quedara stale tras publicar, es un bug preexistente y sale como Open Question |
| A4 | Ningún otro consumidor lee `businesses.landing_config` fuera de los 3 lectores públicos + el editor + `scripts/setup-landing.ts` | Runtime State Inventory | Bajo — verificado por `grep -rn "landing_config"` sobre todo el repo (resultados en §Sources). Si apareciera uno nuevo, habría que decidir si lee draft o published |
| A5 | El backfill `UPDATE … SET landing_draft = landing_config` sobre la tabla `businesses` de prod es instantáneo (decenas de filas, no millones) | Migración 050 | Nulo. Es un SaaS pre-primer-cliente-masivo. Si la tabla creciera, el UPDATE sigue siendo un scan simple |

---

## Open Questions

1. **¿La og:image queda stale tras publicar?**
   - Lo que sabemos: `app/[slug]/opengraph-image.tsx` es una ruta de metadata propia (su segment config **no** hereda el `force-dynamic` de `page.tsx`, que aplica al segmento de la page). Next puede cachear la `ImageResponse`.
   - Lo que no está claro: si en producción esa respuesta se sirve con `Cache-Control` inmutable para rutas dinámicas.
   - Recomendación: **no bloquear la fase por esto.** El comportamiento es exactamente el mismo que hoy (cuando guardar = publicar) → no es una regresión introducida por Phase 15. Anotarlo como ítem de UAT ("compartir el link en WhatsApp después de publicar y ver si la preview se actualiza") y, si se confirma stale, resolverlo con un `export const revalidate = 0` en ese archivo, en una tarea aparte.

2. **¿El operador debe saber que, entre el deploy de 15 y el de 16, la skill sigue publicando directo?**
   - `scripts/setup-landing.ts:316` escribe `landing_config` con service-role. Phase 15 **no lo toca** (LOCKED).
   - Consecuencia: una web armada por la skill entre 15 y 16 sale al aire al instante **y además** deja `landing_draft` desincronizado (el editor mostraría el draft viejo/nulo mientras la web publicada es la nueva → estado 5 de la matriz, que el coalesce defensivo maneja).
   - Recomendación: es exactamente el problema que Phase 16 resuelve. **No correr la skill sobre un negocio nuevo entre ambos deploys**, o correr 16 pegada a 15. Dejar constancia en el SUMMARY de la fase.

---

## Environment Availability

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|-------------|---------------|-----------|---------|----------|
| Node.js | Todo | ✓ | v24.15.0 | — |
| npm | Scripts | ✓ | 11.12.1 | — |
| Supabase CLI | `supabase db reset` (validar la 050) | ✓ | 2.109.1 | — |
| Docker | Postgres local (PG17) para el reset | ✓ | corriendo | — |
| Vitest | `npm test` | ✓ | devDep del repo | — |
| Creds de Supabase en el entorno (`NEXT_PUBLIC_SUPABASE_URL`, `_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) | `test/isolation.test.ts` (se skipea sin ellas — `test/env.ts`) | ⚠ sin verificar en esta sesión | — | **Sin las 3, los tests de aislamiento SE SKIPEAN EN SILENCIO** (`describe.skipIf`) y la fase se "verifica" sin haber probado nada de aislamiento. **El plan debe exigir que la corrida muestre esos tests en verde, no en skip.** Es el carryover de STATE.md ("Cargar los 4 GitHub Secrets") |
| Supabase de prod (SQL editor) | Aplicar la 050 a mano | ✓ (acceso del usuario) | — | Ninguno: es manual por diseño |

**Bloqueante potencial:** los tests de aislamiento skipeados. Si el entorno local no tiene las 3 creds, el verificador de la fase vería "0 failed" y firmaría una fase security-sensitive sin haber corrido su control de seguridad central.

---

## Security Domain

### Categorías ASVS aplicables

| Categoría ASVS | Aplica | Control estándar en esta fase |
|----------------|--------|-------------------------------|
| V2 Authentication | sí | `supabase.auth.getUser()` en cada action → `unauthorized`. Sin cambios (heredado) |
| V3 Session Management | sí | Session client `@supabase/ssr` (anon + cookies). Sin cambios |
| **V4 Access Control** | **sí — el núcleo** | (a) RLS `owner access` sobre `businesses` (única policy, `baseline.sql:1310`); (b) `business_id` de la SESIÓN, nunca del body; (c) `has_web_custom` chequeado **en cada acción**; (d) `landing_draft` **fuera** de `public_businesses`; (e) trigger `businesses_protect_admin_columns` |
| **V5 Input Validation** | **sí** | `parseLandingConfigForWrite` (Zod v4, reject-on-invalid, estripa claves desconocidas) en el guardado **y** sobre el borrador leído al publicar. `publishLanding()`/`discardLandingDraft()` no aceptan input |
| V6 Cryptography | no | No hay secretos ni cripto en esta fase |
| V7 Error Handling & Logging | sí | Errores de dominio `{ ok:false, error:'<snake>' }` + `try/catch` → `server_error`. No se filtran mensajes de Postgres al cliente |

### Amenazas conocidas para este stack

| Patrón | STRIDE | Mitigación estándar (y dónde vive) |
|--------|--------|-----------------------------------|
| **Fuga del borrador a `anon`** vía la vista security-definer | Information Disclosure | La 050 **no toca `public_businesses`**. Test: `select('landing_draft')` sobre la vista debe **fallar** |
| **Fuga del borrador cross-tenant** (otro dueño autenticado) | Information Disclosure | RLS `owner_id = auth.uid()`. Test: cross-READ sin filtro `business_id` |
| **Publicar el contenido de otro tenant** (tampering de `business_id`) | Tampering / Elevation | `business_id` se resuelve de la sesión; el body de `publishLanding()` **no existe** |
| **Inyectar "lo publicado" por POST directo** a la action | Tampering | Publicar es copia server-side desde la DB. Ningún config del body llega a `landing_config` |
| **Saltear el gate del add-on** con un POST directo | Elevation of Privilege | `has_web_custom` chequeado en las 3 acciones + trigger que impide auto-otorgárselo (`isolation.test.ts:165`) |
| **Publicar un borrador corrupto** (escrito por el script, por una versión vieja o a mano) | Tampering | `parseLandingConfigForWrite` sobre el borrador **leído de la DB** → `invalid_draft`. Y aunque algo pasara, `parseLandingConfig` es fail-safe: `/[slug]` nunca 500ea |
| **XSS vía config** (`javascript:` en un href de CTA) | Injection | Ya mitigado en `lib/landing/schema.ts:177-187` (`safeLinkUrl`, allowlist http/https). **No se debilita** |
| Owner escribiendo su propia `landing_config` por anon-key directo | Tampering (self) | **Riesgo ACEPTADO y heredado** de Phase 13 (`_landing-actions.ts:24-29`). No cross-tenant. Declararlo en `/gsd:secure-phase 15` |

---

## Sources

### Primary (HIGH confidence) — código del repo, leído en esta sesión
- `app/(dashboard)/web/_landing-actions.ts` (90 líneas, íntegro) — el molde owner-only a espejar
- `app/(dashboard)/web/page.tsx` (104 líneas, íntegro) — gate + fetch + props
- `app/(dashboard)/web/web-client.tsx` (341 líneas, íntegro) — save bar, `isDirty`, `SAVE_ERROR_COPY`, dialog muerto
- `lib/landing/editor-draft.ts` (202 líneas, íntegro) — mutadores puros + `isDirty` (`:191-199`)
- `lib/landing/write.ts` / `lib/landing/schema.ts` — los dos contratos Zod (escritura estricta / lectura fail-safe)
- `app/[slug]/page.tsx` (152 líneas, íntegro) — `force-dynamic:32`, `public_businesses:47`, rama legacy `:125`
- `app/[slug]/layout.tsx` (115 líneas) + `app/[slug]/opengraph-image.tsx` (`:89-94`) — los otros 2 lectores públicos
- `supabase/migrations/00000000000000_baseline.sql` — trigger `:55-74`/`:897`, columnas `:192-193`, vista `public_businesses` `:520-540`, `ENABLE RLS :1239`, policy `owner access :1310`, `GRANT ALL … TO anon :2896`
- `supabase/migrations/049_clients_origin.sql` — molde de migración numerada (comentario + idempotencia + `NOTIFY pgrst`)
- `test/isolation.test.ts` (231 líneas, íntegro) + `test/env.ts` + `test/helpers/supabase-fixtures.ts`
- `package.json`, `.planning/config.json`, `supabase/config.toml`
- `grep -rn "landing_config"` sobre todo el repo (consumidores exhaustivos) · `grep -rn "landing_draft"` → **0 hits en código**
- `grep -n "security_invoker"` → confirma que `public_businesses` **NO** lo lleva (corre definer)
- Entorno: `node -v` 24.15.0 · `npm -v` 11.12.1 · `npx supabase --version` 2.109.1 · `docker info` OK · `git branch --show-current` → `gsd/gestion-rebrand`

### Primary (HIGH confidence) — docs oficiales bundleadas con la versión exacta del framework
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md` (Next 16.2.7)
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/refresh.md` (Next 16.2.7)

### Secondary (MEDIUM confidence)
- `.claude/skills/supabase-multitenant-rls/SKILL.md` y `.claude/skills/convenciones-forjo/SKILL.md` (reglas del proyecto, vía `.claude/CLAUDE.md`)
- `15-CONTEXT.md`, `15-UI-SPEC.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md` del workstream

### Tertiary (LOW confidence)
- A1 (orden de claves en `jsonb`) — conocimiento de Postgres no verificado contra la DB en esta sesión. Mitigado con una solución que es correcta en ambos casos.

---

## Metadata

**Confidence breakdown:**
- Write path / Server Actions: **HIGH** — el molde existe, se leyó línea por línea, se SECURED en Phase 13
- Migración / RLS / aislamiento: **HIGH** — schema leído directo (policies, grants, vista, trigger); no queda ninguna incógnita sobre cómo se protege la columna nueva
- Lectura pública / PUB-07 / PUB-08: **HIGH** — los 3 lectores y el fail-safe se leyeron íntegros
- Caché / revalidación en Next 16: **HIGH** — verificado contra los docs bundleados de la versión exacta (16.2.7), salvo la og:image (**MEDIUM** → Open Question 1, no-regresiva)
- Compare draft-vs-published: **MEDIUM** — el riesgo del orden de claves es real pero la mitigación es barata y correcta en cualquier caso

**Research date:** 2026-07-12
**Valid until:** 2026-08-11 (30 días — stack estable, sin dependencias externas móviles). Se invalida antes si: se aplica otra migración a `businesses`, se toca `public_businesses`, o se actualiza Next.
