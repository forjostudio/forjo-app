# Phase 5: Vitest Test Suite (TEST-01) - Research

**Researched:** 2026-06-17
**Domain:** Test tooling (Vitest 4) + route-handler unit tests + Supabase RLS isolation integration tests + GitHub Actions CI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (Stack):** Vitest `^4.1` + `vite-tsconfig-paths` (resuelve `@/*`) + `@vitejs/plugin-react`, todos devDependencies. `environment: 'node'` (sin jsdom — no se testea UI). `vitest.config.mts` en la raíz, directorio `test/` (o `__tests__/`). `npm test` = `vitest run`. Sin nuevas deps de runtime.
- **D-02 (DB target):** Tests de aislamiento corren contra el **proyecto Supabase dev** (no hay Supabase CLI local), fixtures creados y borrados por la suite. NO un proyecto dedicado nuevo.
- **D-03 (CI behavior):** **Skip graceful si faltan creds.** Webhook tests (mockeados, sin DB) corren SIEMPRE. Aislamiento (necesita `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`) se **skipea con aviso** (`describe.skip`/`it.skip` + `console.warn`) si esas env faltan. NO requerir creds siempre.
- **D-04 (CI wiring):** Crear `.github/workflows/test.yml` que corre `vitest run` en push/PR, con keys de Supabase + `MP_WEBHOOK_SECRET` como GitHub Secrets. Node `^20/^22/>=24`.
- **D-05 (Fixtures):** Seed suite-level + IDs únicos. `beforeAll` crea 2 negocios fixture con slugs/ids prefijados `__test_<uuid>` con service-role; `afterAll` borra TODO lo creado (service-role) incluso si un test falló.
- **D-06 (Aislamiento — trampa crítica):** ASERCIONES con **anon-key, NUNCA service_role** (service_role bypassa RLS → falso verde). Service-role SOLO setup/teardown. Cubrir: (a) cross-tenant **read** = 0 filas / denegado, (b) cross-tenant **write** falla. Para owner-level (`owner_id = auth.uid()`), autenticar dos sesiones anon como los dueños de los 2 negocios.
- **D-07 (Webhooks):** Importar el `POST` de cada webhook + construir `NextRequest` con `x-signature` crafteada (HMAC-SHA256 determinista con `MP_WEBHOOK_SECRET` de test). Mockear el fetch a `/v1/payments/{id}`. Cubrir: firma válida → procesa; ausente/inválida → 401; (deposit) monto distinto → NO confirma (`amount_mismatch`).

### Claude's Discretion
- Nombres de archivos de test, helper de construcción de `NextRequest`, helper de firma HMAC de test.
- Estructura exacta del seed (cuántos servicios/turnos por negocio fixture — lo mínimo para probar cross-read/write).

### Deferred Ideas (OUT OF SCOPE)
- Tests de UI/E2E (Testing Library, Playwright) → v2.
- Tests de SEC-03 (admin timing-safe) y SEC-04 (plan gating) → no en TEST-01.
- pgTAP / Supabase CLI para RLS testing → fuera de scope (no se adoptó Supabase CLI).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Introducir Vitest + suite CI-runnable que cubra (1) aislamiento multi-tenant read/write cruzado vía anon-key, (2) ambos webhooks MP (firma válida/inválida fail-closed + mismatch de monto), con skip graceful sin creds | §Standard Stack (versiones verificadas), §Code Examples (config, NextRequest, firma HMAC, dos sesiones anon, mock de fetch, skip graceful, GitHub Actions), §Architecture Patterns, §Common Pitfalls (12/13) |
</phase_requirements>

## Summary

TEST-01 introduce el primer runner de tests del repo (Vitest 4) y dos pilares de tests de seguridad: aislamiento multi-tenant (RLS owner-level) y los dos webhooks de MercadoPago. La investigación confirma que **toda la mecánica es factible con cero deps de runtime nuevas** y patrones ya validados en el propio repo (`verifyMPSignature` es determinista; los handlers exportan `POST` puro; los clientes Supabase ya están separados por rol).

El hallazgo más importante para el planner es una **divergencia entre los dos webhooks**: el de suscripción usa `mpFetch` (`lib/mercadopago.ts`), pero el de seña (`app/api/payment/webhook/[slug]/route.ts:93`) usa **`fetch` crudo**, NO `mpFetch`. Por lo tanto la estrategia de mock difiere: para el webhook de seña hay que mockear `global.fetch` (o las dependencias `getBusinessSecrets`/`getValidMpAccessToken`), no `mpFetch`. Mockear solo `mpFetch` dejaría el test de mismatch de monto sin interceptar la llamada real a MP. El segundo hallazgo: la trampa de Pitfall 12 (tests con service-role = falso verde) — las aserciones deben usar **dos sesiones anon autenticadas como los dueños** y **sin** filtro `.eq('business_id', ...)` en la query de aserción, para que sea RLS y no el WHERE lo que deniega.

Compatibilidad de versiones verificada hoy en npm: `vitest@4.1.9`, `vite-tsconfig-paths@^5` (peer `vite: *`), `@vitejs/plugin-react@^5` (peer `vite ^4.2||^5||^6||^7||^8`, compatible con el Vite 6/7/8 que bundlea Vitest 4). **NO usar `@vitejs/plugin-react@6`**: su peer es `vite: ^8.0.0` exclusivo, que puede chocar con el Vite que resuelve Vitest 4. Y como esta suite no renderiza JSX (`environment: 'node'`), `@vitejs/plugin-react` es estrictamente opcional aquí; se puede incluir inerte o omitir.

**Primary recommendation:** Instalar `vitest@^4.1 vite-tsconfig-paths@^5 @vitejs/plugin-react@^5` como devDeps; `vitest.config.mts` con `tsconfigPaths()` + `environment: 'node'` + un setup file que cargue `.env.local`; tests de webhook que importan `POST` y construyen `NextRequest`, mockeando `global.fetch` (seña) / `mpFetch` (suscripción); tests de aislamiento con dos clientes `@supabase/supabase-js` anon autenticados como dueños fixture, gated por `describe.skipIf(!hasSupabaseCreds)`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Verificación de firma HMAC | API / Backend (route handler + `lib/mercadopago.ts`) | — | Determinista, server-only; se testea importando `POST` y la fn pura |
| Confirmación de pago / mismatch de monto | API / Backend (`processWebhook` + service-role) | Database (update de `appointments`) | El handler decide; se testea mockeando el fetch a MP y observando el efecto (o cortándolo antes del DB write) |
| Aislamiento multi-tenant (RLS) | Database (policies `owner_id = auth.uid()`) | API (filtro `business_id` en queries) | El test debe ejercitar la capa DB vía anon-key autenticada, NO la app |
| Setup/teardown de fixtures | API / Backend (service-role admin client) | — | Bypassa RLS a propósito; SOLO para seed, jamás en aserciones |
| Ejecución CI | CI (GitHub Actions) | — | `vitest run`, secrets inyectados; skip graceful sin creds |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | `^4.1` (hoy 4.1.9) | Test runner + aserciones + mocking (`vi.mock`, `vi.fn`) | Recomendado por los docs oficiales de Next.js 16 (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`). ESM/TS nativo. Engines `^20 \|\| ^22 \|\| >=24`. `[VERIFIED: npm registry]` |
| `vite-tsconfig-paths` | `^5` (5.1.4) | Resuelve el alias `@/*` (de `tsconfig.json`) en los tests | Sin esto, todo `import ... from '@/lib/...'` falla. Peer `vite: *` → compatible con el Vite de Vitest 4. `[VERIFIED: npm registry]` |
| `@vitejs/plugin-react` | `^5` (5.2.0) | Transform JSX/React (parte del setup oficial de Next.js + Vitest) | Peer `vite ^4.2 \|\| ^5 \|\| ^6 \|\| ^7 \|\| ^8` → compatible con Vitest 4 (que bundlea Vite 6/7/8). Opcional para esta suite (sin JSX), pero inofensivo. `[VERIFIED: npm registry]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@supabase/supabase-js` | `^2.106.2` (ya instalado) | Crear 2 clientes anon autenticados como dueños fixture; `auth.admin.createUser`/`deleteUser` para setup/teardown | Tests de aislamiento. NO es dep nueva. `[VERIFIED: codebase package.json]` |
| Node `crypto` | stdlib | `createHmac('sha256', secret)` para craftear el `x-signature` de test (mismo algoritmo que `verifyMPSignature`) | Tests de webhook (firma válida/inválida). `[VERIFIED: lib/mercadopago.ts:68]` |
| Carga de `.env.local` | setup file (`process.env` ya poblado por Vitest si se usa `--env-file`) o `import 'dotenv/config'` | Vitest **no** auto-carga `.env.local`. Los tests de aislamiento necesitan URL+anon+service-role | Ver §Code Examples para el patrón sin dep nueva (Node `--env-file` o un setup file mínimo) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest | Jest | Necesita `ts-jest`/`babel` + `next/jest`; más pesado/lento; no es lo que lidera Next 16 docs. |
| Vitest | `node:test` | Cero deps pero sin path-alias, watch/mocking pobres. |
| Dos clientes anon JS | pgTAP + `supabase test db` | Más riguroso pero requiere Supabase CLI (fuera de scope, D deferred). |
| `@vitejs/plugin-react@^5` | `@vitejs/plugin-react@^6` | v6 peer `vite: ^8.0.0` exclusivo → riesgo de conflicto con el Vite de Vitest 4. **No usar v6 en este milestone.** |

**Installation:**
```bash
npm install -D vitest@^4.1 vite-tsconfig-paths@^5 @vitejs/plugin-react@^5
```

**Version verification (ejecutado este sesión, 2026-06-17):**
- `npm view vitest version` → `4.1.9` `[VERIFIED: npm registry]`
- `npm view vite-tsconfig-paths version` → `6.1.1` (latest); `@5` resuelve a `5.1.4`. STACK.md pinea `^5`; mantener `^5` por seguridad (peer `vite:*` igual cubre). `[VERIFIED: npm registry]`
- `npm view @vitejs/plugin-react version` → `6.0.2` (latest, peer `vite:^8`); usar `@^5` (5.2.0, peer cubre Vite 6/7/8). `[VERIFIED: npm registry]`
- `npm view vitest@4.1.9 engines` → `{ node: '^20.0.0 || ^22.0.0 || >=24.0.0' }` `[VERIFIED: npm registry]`
- `npm view vitest@4.1.9 dependencies.vite` → `^6.0.0 || ^7.0.0 || ^8.0.0` `[VERIFIED: npm registry]`

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `vitest` | npm | publicado 2026-06-15 (4.1.9) | 70.7M/wk | github.com/vitest-dev/vitest | OK (seam dijo SUS por `too-new`) | Approved — falso positivo: es el runner canónico, recomendado por docs de Next 16, 70M downloads/sem, repo oficial. La marca `too-new` es por el patch reciente. |
| `vite-tsconfig-paths` | npm | publicado 2026-02-11 | 28.3M/wk | github.com/aleclarson/vite-tsconfig-paths | OK | Approved |
| `@vitejs/plugin-react` | npm | publicado 2026-05-14 | 65M/wk | github.com/vitejs/vite-plugin-react | OK | Approved (pinear `@^5`, no `@6`) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `vitest` — flag automático por `too-new` (patch del 15-jun). Es un falso positivo claro (paquete oficial, 70M downloads, repo verificado). El planner NO necesita un `checkpoint:human-verify` adicional; basta pinear `^4.1` (no exact `4.1.9`).

`postinstall` de los tres: `null` (sin scripts de postinstall sospechosos). `[VERIFIED: package-legitimacy seam]`

## Architecture Patterns

### System Architecture Diagram

```text
                         vitest run  (npm test / CI)
                                │
              ┌─────────────────┴──────────────────┐
              │                                     │
   ┌──────────▼───────────┐            ┌────────────▼─────────────┐
   │  WEBHOOK TESTS        │            │  ISOLATION TESTS          │
   │  environment: node    │            │  environment: node        │
   │  SIN DB · siempre corren│          │  describe.skipIf(!creds)  │
   └──────────┬───────────┘            └────────────┬─────────────┘
              │                                     │
   import { POST } from                  beforeAll (service-role admin):
   '@/app/api/.../route'                   auth.admin.createUser ×2
              │                            insert businesses/services/appts ×2
   construir NextRequest(url, init)                  │
   con x-signature HMAC                   2 clientes anon-key:
              │                            signInWithPassword(ownerA / ownerB)
   ┌──────────▼───────────┐                          │
   │ mock fetch a MP:      │              ASERCIONES (anon, SIN .eq business_id):
   │ - seña → global.fetch │                A lee filas de B  → 0 filas
   │ - subscr → vi.mock    │                A escribe filas de B → falla/0 rows
   │   mpFetch             │                          │
   └──────────┬───────────┘              afterAll: borrar todo (service-role)
   assert Response.status                  + auth.admin.deleteUser ×2
   (200 / 401) + efecto
```

File-to-implementation mapping en §Component Responsibilities (abajo).

### Recommended Project Structure
```
test/                              # o __tests__/  (Claude's discretion, D-01)
├── helpers/
│   ├── mp-signature.ts            # craftSignature({ secret, dataId, requestId, ts })
│   ├── next-request.ts            # makeWebhookRequest({ url, headers, body })
│   └── supabase-fixtures.ts       # seedTwoTenants() / teardown()
├── env.ts                         # hasSupabaseCreds, hasWebhookSecret (flags de skip)
├── webhook-deposit.test.ts        # payment/webhook/[slug]: firma + mismatch monto
├── webhook-subscription.test.ts   # subscription/webhook: firma
└── isolation.test.ts              # cross-tenant read/write con 2 anon sessions
vitest.config.mts                  # raíz
vitest.setup.ts                    # carga .env.local (raíz)
.github/workflows/test.yml
```

### Component Responsibilities
| Capability | File under test | Test file | Mock surface |
|-----------|-----------------|-----------|--------------|
| Webhook seña: firma + monto | `app/api/payment/webhook/[slug]/route.ts` | `test/webhook-deposit.test.ts` | `global.fetch` (usa fetch crudo) + `@/lib/supabase/admin` + `@/lib/business-secrets` + `@/lib/payment` |
| Webhook suscripción: firma | `app/api/subscription/webhook/route.ts` | `test/webhook-subscription.test.ts` | `vi.mock('@/lib/mercadopago')` parcial (mock `mpFetch`, real `verifyMPSignature`/`getMPWebhookSecret`) + `@/lib/supabase/admin` |
| Aislamiento RLS | `supabase/schema.sql` policies + migraciones 026/027/028 | `test/isolation.test.ts` | ninguno — DB real vía anon-key |

### Pattern 1: Test del verificador de firma vía el handler exportado
**What:** Importar `POST` del route handler y llamarlo con un `NextRequest` construido a mano; no hace falta servidor Next corriendo.
**When to use:** Ambos webhooks.
**Example:** ver §Code Examples "Construir NextRequest" + "Firma HMAC".

### Pattern 2: Dos sesiones anon autenticadas para owner-level RLS
**What:** Crear 2 usuarios con `auth.admin.createUser` (service-role), setear `owner_id` de cada negocio, y autenticar 2 clientes anon distintos con `signInWithPassword`. Las aserciones corren con esos clientes anon.
**When to use:** Aislamiento (D-06).
**Example:** ver §Code Examples.

### Anti-Patterns to Avoid
- **Aserción de aislamiento con `createAdminClient`/service-role:** bypassa RLS → falso verde (Pitfall 12). SOLO seed/teardown.
- **`.eq('business_id', ...)` en la query de aserción:** testea tu filtro, no RLS. Omitirlo: que RLS sea quien deniegue (Pitfall 12).
- **Mockear solo `mpFetch` para el webhook de seña:** ese route usa `fetch` crudo (`route.ts:93`) → el mock no intercepta → llamada real a MP (Pitfall 13).
- **`@vitejs/plugin-react@^6`:** peer `vite:^8` exclusivo → posible conflicto de versión con Vitest 4.
- **Llamar a la API real de MP en CI** (Pitfall 13).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resolución de `@/*` en tests | Aliases manuales en config | `vite-tsconfig-paths` | Lee `tsconfig.json` directo; un solo source of truth |
| HMAC del `x-signature` de test | Re-implementar el algoritmo | `crypto.createHmac` replicando el manifest de `verifyMPSignature` (`id:<id>;request-id:<rid>;ts:<ts>;`) | Debe coincidir byte-a-byte con producción; copiar la fórmula exacta |
| Crear/borrar usuarios de auth | Insertar en `auth.users` a mano | `supabase.auth.admin.createUser` / `deleteUser` | API soportada; setea identidades correctamente |
| Comparación constant-time | npm shim | Node `crypto.timingSafeEqual` (ya en `verifyMPSignature`) | Built-in; no se testea acá pero no introducir shims |

**Key insight:** Casi todo lo que la suite necesita ya existe en el repo o en stdlib. La única dep nueva real es el runner (Vitest) + 2 plugins de Vite. Las dos "trampas" (mock del fetch correcto por webhook, anon-key en aserciones) son de método, no de librería.

## Runtime State Inventory

> No aplica completo (esta fase agrega tests, no renombra/migra). Único estado runtime relevante: **datos fixture en el proyecto Supabase dev**.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Fixtures `__test_<uuid>`: 2 `businesses` + sus `services`/`appointments`/`clients`/`business_secrets` + 2 usuarios en `auth.users` | `afterAll` borra todo (service-role) incluso si un test falló; `auth.admin.deleteUser` para los 2 usuarios. ON DELETE CASCADE en FKs (`business_id`, `owner_id`) ayuda pero **borrar usuarios y negocios explícitamente**. |
| Live service config | None — verificado: la suite no toca n8n/Vercel/cron. |
| OS-registered state | None. |
| Secrets/env vars | Reusa `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MP_WEBHOOK_SECRET`. No crea claves nuevas; en CI van como GitHub Secrets (D-04). |
| Build artifacts | None — Vitest no compila a disco. |

**Riesgo de teardown:** si `afterAll` no borra, se acumulan filas `__test_*` en dev. Usar prefijo único por corrida (`__test_<uuid>`) evita colisiones entre runs concurrentes (D-05), pero el teardown debe ser robusto (try/finally; borrar por `owner_id` de los usuarios fixture o por prefijo de slug).

## Common Pitfalls

### Pitfall 1: Aislamiento testeado con service-role (LA trampa — Pitfall 12 del milestone)
**What goes wrong:** Los tests usan `createAdminClient`/service-role, que bypassa RLS. "A no lee datos de B" pasa porque agregaste un `.eq('business_id')`, no porque RLS deniegue. RLS podría estar roto y el test queda verde.
**Why it happens:** El service-role ya está cableado para los paths de booking; se reusa por costumbre.
**How to avoid:** Aserciones con **anon-key autenticada** como dueño; **sin** `.eq('business_id')` en la query de aserción; agregar un guard en setup que falle si el cliente de aserción es service-role.
**Warning signs:** El test importa `createAdminClient` y luego asierta aislamiento; la query de aserción tiene `.eq('business_id', ...)`; los tests siguen verdes tras dropear una policy a mano.

### Pitfall 2: Mock equivocado para el webhook de seña (Pitfall 13)
**What goes wrong:** Se mockea `mpFetch` pero el webhook de seña usa **`fetch` crudo** (`route.ts:93`). El mock no intercepta → el test de mismatch de monto pega a la API real de MP (flaky, necesita token, falla en CI offline).
**Why it happens:** El webhook de suscripción sí usa `mpFetch`; se asume que ambos hacen lo mismo.
**How to avoid:** Para `payment/webhook/[slug]`: mockear `global.fetch` (o mockear `@/lib/supabase/admin` + `@/lib/business-secrets` + `@/lib/payment` para cortar antes del fetch). Para `subscription/webhook`: `vi.mock('@/lib/mercadopago')` parcial.
**Warning signs:** CI necesita red a mercadopago.com; el test de monto es flaky.

### Pitfall 3: `after()` no se ejecuta en el test (efecto async fuera del scope)
**What goes wrong:** Ambos handlers responden 200 y procesan el trabajo dentro de `after(async () => …)` de `next/server`. Si el test solo asierta `Response.status === 401/200`, el efecto de `processWebhook` (el update de monto/confirmación) puede no haberse ejecutado/await-eado cuando termina el test.
**Why it happens:** `after()` programa trabajo post-respuesta; fuera de un request lifecycle de Next puede no drenarse determinísticamente.
**How to avoid:** Para los casos de **firma** (válida/inválida → 401/200) basta asertar el status: la firma se verifica ANTES de `after()` (`route.ts:33`), no depende del callback. Para el caso de **mismatch de monto**, el trabajo está dentro de `after()` → preferir **testear `processWebhook` por su efecto observable** mockeando el admin client y verificando que se llamó `update({ payment_status: 'amount_mismatch' })` y NO `update({ status: 'confirmed' })`. Si `after()` no drena en el entorno de test, considerar exportar/testear la lógica de monto vía el mock del admin client (el handler ya separa `POST` de `processWebhook`, pero `processWebhook` no está exportado — el planner decide: o se exporta para test, o se asierta vía el mock del fetch+admin observando las llamadas). **Decisión recomendada:** mockear `@/lib/supabase/admin` y asertar las llamadas a `.update(...)`; esto no depende de que `after()` drene porque el mock captura las llamadas sincrónicamente cuando ocurren.

### Pitfall 4: Vitest no carga `.env.local`
**What goes wrong:** Los tests de aislamiento leen `process.env.NEXT_PUBLIC_SUPABASE_URL` y compañía, pero Vitest no auto-carga `.env.local` → `undefined` → o crashea o (peor) el skip-if cree que no hay creds y skipea silenciosamente cuando sí las hay.
**How to avoid:** Cargar `.env.local` en un setup file (`setupFiles` en config) o vía `node --env-file=.env.local`. Ver §Code Examples. Confirmar en el setup que las 3 vars existen antes de decidir skip.
**Warning signs:** Los tests de aislamiento siempre se skipean en local aunque `.env.local` tenga las claves.

### Pitfall 5: Teardown incompleto deja basura en dev
**What goes wrong:** Un test falla, `afterAll` no corre o falla a mitad → filas `__test_*` + usuarios fixture quedan en el proyecto dev compartido.
**How to avoid:** `afterAll` en try/finally; borrar negocios (CASCADE limpia services/appointments/clients/business_secrets) y luego `auth.admin.deleteUser` de los 2 usuarios. IDs únicos por corrida evitan colisión, pero igual limpiar.

### Pitfall 6: Owner policy es `FOR ALL USING(...)` sin `WITH CHECK` explícito
**What goes wrong:** Las policies base (`schema.sql:99-133`) son `FOR ALL USING (owner_id = auth.uid())` / `USING (business_id IN (...))`. `FOR ALL` con solo `USING` aplica el `USING` también como check de escritura en Postgres, pero un cross-tenant **INSERT** desde anon podría toparse además con las policies `public insert appointments/clients` `WITH CHECK (true)` (`schema.sql:151-156`).
**How to avoid:** El test de cross-tenant **write** debe distinguir: (a) **UPDATE** de una fila de B desde la sesión de A → la `USING` de owner deniega (0 filas afectadas); (b) **INSERT** directo: `appointments`/`clients` tienen policy de insert público `WITH CHECK(true)` → un INSERT anon de un appointment para `business_id` de B **podría pasar** (es el path de booking público). Por eso el test de escritura cruzada debe enfocarse en **UPDATE/DELETE de filas existentes de B** (owner-level), no en INSERT de appointments/clients (que es público por diseño). Para INSERT, probar contra una tabla **sin** policy de insert público (ej. `services`, `professionals`, `business_secrets`): un INSERT anon ahí debe fallar.
**Warning signs:** El test asierta que "anon no puede insertar appointment para B" y falla porque el booking público lo permite a propósito.

## Code Examples

> Patrones derivados de: docs oficiales de Next 16 (bundled), tipos instalados de `next`/`@supabase/auth-js`, y el código validado del repo. Los snippets son ilustrativos para el planner (Claude's Discretion sobre nombres exactos).

### vitest.config.mts (raíz)
```ts
// Source: node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md (adaptado a environment: 'node', D-01)
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import react from '@vitejs/plugin-react' // opcional aquí (sin JSX); inofensivo

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',           // D-01: no se testea UI
    setupFiles: ['./vitest.setup.ts'],
    // Alternativa a setupFiles para env: correr con `node --env-file=.env.local`
  },
})
```

### vitest.setup.ts — cargar .env.local sin dep nueva
```ts
// Vitest NO auto-carga .env.local (Pitfall 4). Cargarlo acá.
// Opción A (sin dep): parsear .env.local con fs (mínimo) o usar el flag --env-file de Node 20+.
// Opción B: import 'dotenv/config' (dotenv ya es transitive; confirmar antes de depender de él).
import { config } from 'dotenv'   // si dotenv está disponible transitivamente
config({ path: '.env.local' })
// Si dotenv NO está garantizado, preferir el script CI/local: `node --env-file=.env.local node_modules/vitest/vitest.mjs run`
// o agregar dotenv como devDep explícita (decisión del planner).
```

### test/env.ts — flags de skip graceful (D-03)
```ts
export const hasSupabaseCreds =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY

export const hasWebhookSecret = !!process.env.MP_WEBHOOK_SECRET || !!process.env.MP_WEBHOOK_SECRET_TEST

if (!hasSupabaseCreds) {
  console.warn('[isolation] Skipping RLS isolation tests: faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY')
}
```

### Helper: firma HMAC de test determinista
```ts
// Source: replica exacta del manifest de lib/mercadopago.ts:62-68
import crypto from 'crypto'

export function craftSignature(opts: {
  secret: string
  dataId?: string | number   // se lowercasea como en producción
  requestId?: string         // va al header x-request-id
  ts?: string                // unix; default Date.now()
}): { xSignature: string; xRequestId?: string } {
  const ts = opts.ts ?? String(Math.floor(Date.now() / 1000))
  const id = opts.dataId != null ? String(opts.dataId).toLowerCase() : undefined
  let manifest = ''
  if (id) manifest += `id:${id};`
  if (opts.requestId) manifest += `request-id:${opts.requestId};`
  manifest += `ts:${ts};`
  const v1 = crypto.createHmac('sha256', opts.secret).update(manifest).digest('hex')
  return { xSignature: `ts=${ts},v1=${v1}`, xRequestId: opts.requestId }
}
// Firma INVÁLIDA: pasar un secret distinto, o mutar v1, o omitir el header x-signature.
```

### Helper: construir NextRequest para webhook
```ts
// Source: tipos de node_modules/next/.../request.d.ts → NextRequest(input: URL|RequestInfo, init?: RequestInit)
import { NextRequest } from 'next/server'

export function makeWebhookRequest(opts: {
  baseUrl?: string
  dataIdQuery?: string        // ?data.id=...
  xSignature?: string
  xRequestId?: string
  body: unknown
}): NextRequest {
  const url = new URL(opts.baseUrl ?? 'https://gestion.forjo.studio/api/payment/webhook/__test_slug')
  if (opts.dataIdQuery) url.searchParams.set('data.id', opts.dataIdQuery)
  const headers = new Headers({ 'content-type': 'application/json' })
  if (opts.xSignature) headers.set('x-signature', opts.xSignature)
  if (opts.xRequestId) headers.set('x-request-id', opts.xRequestId)
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body),
  })
}
```

### Test webhook de SEÑA: firma inválida → 401 (mock global.fetch)
```ts
// Source: app/api/payment/webhook/[slug]/route.ts — usa fetch CRUDO (línea 93), NO mpFetch.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock de los módulos que el handler importa, para no tocar DB ni MP:
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/business-secrets', () => ({ getBusinessSecrets: vi.fn() }))
vi.mock('@/lib/payment', () => ({ getValidMpAccessToken: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendConfirmationEmail: vi.fn(), sendAdminNotification: vi.fn() }))
vi.mock('@/lib/google-calendar', () => ({ createCalendarEvent: vi.fn(), deleteCalendarEvent: vi.fn() }))

import { POST } from '@/app/api/payment/webhook/[slug]/route'
import { makeWebhookRequest } from './helpers/next-request'
import { craftSignature } from './helpers/mp-signature'

const SECRET = 'test_webhook_secret'
beforeEach(() => {
  vi.stubEnv('MP_MODE', 'production')        // getMPWebhookSecret() lee MP_WEBHOOK_SECRET
  vi.stubEnv('MP_WEBHOOK_SECRET', SECRET)
})

describe('deposit webhook signature', () => {
  it('rechaza con 401 sin x-signature', async () => {
    const req = makeWebhookRequest({ dataIdQuery: '123', body: { type: 'payment', data: { id: '123' } } })
    const res = await POST(req, { params: Promise.resolve({ slug: '__test_slug' }) })
    expect(res.status).toBe(401)
  })

  it('acepta (200) con firma válida', async () => {
    const { xSignature, xRequestId } = craftSignature({ secret: SECRET, dataId: '123', requestId: 'req-1' })
    const req = makeWebhookRequest({ dataIdQuery: '123', xSignature, xRequestId, body: { type: 'payment', data: { id: '123' } } })
    const res = await POST(req, { params: Promise.resolve({ slug: '__test_slug' }) })
    expect(res.status).toBe(200)   // la firma se valida ANTES de after() → status no depende del callback
  })
})
```

### Test webhook de SEÑA: mismatch de monto (mock del admin client, observar el update)
```ts
// El chequeo de monto vive en processWebhook, dentro de after(). Estrategia: mockear el admin
// client y global.fetch, y asertar que se llamó update({payment_status:'amount_mismatch'}) y NO confirmed.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateSpy = vi.fn().mockReturnThis()
const eqSpy = vi.fn().mockResolvedValue({ data: null })
const fakeAdmin = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn()
      .mockResolvedValueOnce({ data: { id: 'biz', name: 'B', slug: '__test_slug' } })           // businesses
      .mockResolvedValueOnce({ data: { id: 'appt', status: 'pending_payment', deposit_amount: 1500, services: { name: 's', price: 3000 } } }), // appointment
    update: updateSpy.mockReturnValue({ eq: eqSpy }),
  })),
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin }))
vi.mock('@/lib/business-secrets', () => ({ getBusinessSecrets: vi.fn().mockResolvedValue({ mp_access_token: 'tok' }) }))
vi.mock('@/lib/payment', () => ({ getValidMpAccessToken: vi.fn().mockResolvedValue('tok') }))
vi.mock('@/lib/email', () => ({ sendConfirmationEmail: vi.fn(), sendAdminNotification: vi.fn() }))
vi.mock('@/lib/google-calendar', () => ({ createCalendarEvent: vi.fn(), deleteCalendarEvent: vi.fn() }))

// fetch crudo a /v1/payments/{id} → devolver approved con monto distinto ($1 vs $1500 esperado)
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: async () => ({ status: 'approved', external_reference: 'appt', transaction_amount: 1 }),
  }))
})
// NOTA PARA EL PLANNER: como el trabajo corre en after(), puede hacer falta await de un microtask flush,
// o exportar processWebhook para testearlo directo. Validar empíricamente al implementar (Open Question 1).
```

### Test webhook de SUSCRIPCIÓN: firma + mock parcial de mpFetch
```ts
// Source: app/api/subscription/webhook/route.ts — usa mpFetch (mockear), POST(request) sin params.
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: vi.fn(() => ({ update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({}), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: {} }) })) }) }))

// Mock PARCIAL: mockea mpFetch pero preserva verifyMPSignature/getMPWebhookSecret reales.
vi.mock('@/lib/mercadopago', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mercadopago')>()
  return { ...actual, mpFetch: vi.fn().mockResolvedValue({ status: 'authorized', id: 'sub', external_reference: 'biz' }) }
})

import { POST } from '@/app/api/subscription/webhook/route'
// ... construir NextRequest (sin segundo arg de params) y asertar 401 sin firma / 200 con firma válida.
```

### Aislamiento: seed de 2 tenants + 2 sesiones anon + aserciones (D-05/D-06)
```ts
// Source: tipos @supabase/auth-js (createUser/deleteUser/signInWithPassword), schema.sql policies owner_id=auth.uid()
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

describe.skipIf(!hasSupabaseCreds)('multi-tenant isolation (RLS owner-level)', () => {
  const run = crypto.randomUUID().slice(0, 8)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  let userA: string, userB: string, bizA: string, bizB: string, apptB: string
  const emailA = `__test_${run}_a@forjo.test`, emailB = `__test_${run}_b@forjo.test`
  const pass = `Test_${run}_pw!`

  // GUARD anti-Pitfall-12: las aserciones NUNCA usan `admin`. Solo seed/teardown.
  let anonA: ReturnType<typeof createClient>, anonB: ReturnType<typeof createClient>

  beforeAll(async () => {
    const a = await admin.auth.admin.createUser({ email: emailA, password: pass, email_confirm: true })
    const b = await admin.auth.admin.createUser({ email: emailB, password: pass, email_confirm: true })
    userA = a.data.user!.id; userB = b.data.user!.id
    const insA = await admin.from('businesses').insert({ owner_id: userA, slug: `__test_${run}_a`, name: 'A' }).select('id').single()
    const insB = await admin.from('businesses').insert({ owner_id: userB, slug: `__test_${run}_b`, name: 'B' }).select('id').single()
    bizA = insA.data!.id; bizB = insB.data!.id
    // fila de B para probar read/update cruzado (appointment de B):
    const ap = await admin.from('appointments').insert({ business_id: bizB, client_name: 'cliB', date: '2030-01-01', time: '10:00' }).select('id').single()
    apptB = ap.data!.id
    // 2 clientes anon autenticados como cada dueño:
    anonA = createClient(url, anonKey, { auth: { persistSession: false } })
    anonB = createClient(url, anonKey, { auth: { persistSession: false } })
    await anonA.auth.signInWithPassword({ email: emailA, password: pass })
    await anonB.auth.signInWithPassword({ email: emailB, password: pass })
  })

  afterAll(async () => {
    try {
      if (bizA) await admin.from('businesses').delete().eq('id', bizA)  // CASCADE limpia hijos
      if (bizB) await admin.from('businesses').delete().eq('id', bizB)
    } finally {
      if (userA) await admin.auth.admin.deleteUser(userA)
      if (userB) await admin.auth.admin.deleteUser(userB)
    }
  })

  it('cross-tenant READ: A no ve los appointments de B (RLS, sin filtro business_id)', async () => {
    const { data } = await anonA.from('appointments').select('id')   // SIN .eq('business_id') — RLS debe denegar
    expect((data ?? []).some(r => r.id === apptB)).toBe(false)
  })

  it('cross-tenant WRITE: A no puede actualizar un appointment de B', async () => {
    const { data } = await anonA.from('appointments').update({ client_name: 'hacked' }).eq('id', apptB).select('id')
    expect(data ?? []).toHaveLength(0)   // RLS USING(owner) → 0 filas afectadas
    // verificación independiente con service-role (no es aserción de RLS, es check del efecto):
    const { data: check } = await admin.from('appointments').select('client_name').eq('id', apptB).single()
    expect(check!.client_name).toBe('cliB')
  })

  it('cross-tenant INSERT en tabla sin insert público: A no inserta service para B', async () => {
    // services NO tiene policy de insert público (a diferencia de appointments/clients) → debe fallar
    const { error, data } = await anonA.from('services').insert({ business_id: bizB, name: 'x', duration_minutes: 30, price: 10 }).select('id')
    expect(error || (data ?? []).length === 0).toBeTruthy()
  })
})
```

### .github/workflows/test.yml (D-04)
```yaml
name: Tests
on:
  push:
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22      # dentro de ^20 || ^22 || >=24 (engines de vitest 4)
          cache: npm
      - run: npm ci
      - run: npm test            # = vitest run
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          MP_WEBHOOK_SECRET: ${{ secrets.MP_WEBHOOK_SECRET }}
          MP_MODE: production
# Si los secrets de Supabase NO están cargados (ej. fork PR), los tests de aislamiento se
# skipean (describe.skipIf) y solo corren los de webhook → el job pasa igual (D-03).
```

`package.json` script (D-01):
```json
{ "scripts": { "test": "vitest run", "test:watch": "vitest" } }
```
> Nota: STACK.md sugiere `"test": "vitest"` (watch) + `"test:ci": "vitest run"`. CONTEXT D-01 fija `npm test = vitest run`. Seguir D-01 (CONTEXT manda). Si se quiere watch local, agregar `test:watch`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest + ts-jest + next/jest | Vitest (recomendado por Next 16 docs) | Next 13+/Vitest 1+ | Menos config, ESM/TS nativo |
| `middleware.ts` | `proxy.ts` (Next 16) | Next 16 | No afecta tests (no se testea el proxy aquí) |
| Secretos en columnas de `businesses` | tabla `business_secrets` owner-RLS + views acotadas (migr. 026/027/028) | Milestone v0.9 fases 1 | Las aserciones de aislamiento deben reflejar el estado post-028 (anon no lee `services`/`business_hours` base, no existen columnas-secreto en `businesses`) |

**Deprecated/outdated:**
- `@vitejs/plugin-react@^6` para este repo: fuerza `vite:^8`, conflicto con el Vite de Vitest 4. Usar `^5`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `after()` de Next no drena determinísticamente en un test de Vitest fuera del request lifecycle; el caso de mismatch de monto conviene testearlo observando el mock del admin client | Pitfall 3 / Code Examples | Si `after()` SÍ drena con un microtask flush, el test podría asertarse más directo. Validar empíricamente al implementar (Open Q1). |
| A2 | `dotenv` está disponible transitivamente; si no, hace falta `node --env-file` o agregar `dotenv` como devDep | Code Examples (setup) | Si no está, el `import 'dotenv/config'` falla. Mitigación: usar `--env-file` de Node 20+ (sin dep) o agregar dotenv explícita. |
| A3 | El INSERT cruzado de `services`/`professionals`/`business_secrets` desde anon falla por RLS (no hay policy de insert público en esas tablas, a diferencia de `appointments`/`clients`) | Pitfall 6 / Code Examples | Si alguna migración agregó una policy de insert anon en esas tablas, el test fallaría. Verificado en schema.sql + 027: solo `appointments`/`clients` tienen `public insert`. |
| A4 | `auth.admin.createUser({ email_confirm: true })` permite `signInWithPassword` inmediato sin confirmación por email | Code Examples (aislamiento) | Si el proyecto dev tiene confirmación obligatoria y `email_confirm:true` no la satura, el signIn fallaría. `email_confirm:true` está documentado para esto. |

## Open Questions

1. **Drenado de `after()` en tests de Vitest**
   - Qué sabemos: la firma se valida ANTES de `after()` → los tests de 401/200 por firma no dependen del callback. El chequeo de monto vive DENTRO de `after()`.
   - Qué no está claro: si `after()` ejecuta su callback dentro del mismo tick await-eable durante el test, o si hace falta flush de microtasks / exportar `processWebhook`.
   - Recomendación: al implementar, probar primero asertando el mock del admin client tras un `await Promise.resolve()`/`vi.waitFor`; si no drena, exportar `processWebhook` del route (cambio mínimo) y testearlo directo. El planner debe incluir una tarea de verificación empírica.

2. **`dotenv` vs `--env-file`**
   - Qué sabemos: Vitest no auto-carga `.env.local`.
   - Recomendación: preferir `node --env-file=.env.local` (Node 20+, sin dep) o agregar `dotenv` como devDep explícita si se quiere el setup file. El planner elige; ambos son válidos.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (engines vitest 4) | runner | ✓ (asumido en dev/CI) | `^20 \|\| ^22 \|\| >=24` | CI fija `node-version: 22` |
| npm | install/CI | ✓ | lockfile presente | — |
| Proyecto Supabase dev (URL+anon+service-role) | tests de aislamiento | depende de `.env.local` / secrets | — | **skip graceful** (D-03) si faltan |
| `MP_WEBHOOK_SECRET` (o `_TEST`) | tests de webhook | inyectable como env de test (`vi.stubEnv`) | — | los tests stubean su propio secret → no dependen del entorno |

**Missing dependencies with no fallback:** ninguna (la suite degrada con skip graceful).
**Missing dependencies with fallback:** creds de Supabase → skip de los tests de aislamiento (webhook tests siguen corriendo).

## Validation Architecture

> Esta fase ES la infraestructura de validación. El Nyquist validation aplica a la suite misma.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1` (hoy 4.1.9) |
| Config file | `vitest.config.mts` (a crear — Wave 0) |
| Quick run command | `npx vitest run test/webhook-deposit.test.ts` |
| Full suite command | `npm test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | Webhook seña: firma ausente/inválida → 401 | unit | `vitest run test/webhook-deposit.test.ts` | ❌ Wave 0 |
| TEST-01 | Webhook seña: firma válida → 200 | unit | idem | ❌ Wave 0 |
| TEST-01 | Webhook seña: monto distinto → `amount_mismatch`, NO confirmed | unit | idem | ❌ Wave 0 |
| TEST-01 | Webhook suscripción: firma ausente/inválida → 401 / válida → 200 | unit | `vitest run test/webhook-subscription.test.ts` | ❌ Wave 0 |
| TEST-01 | Aislamiento: cross-tenant READ = 0 filas (anon, sin filtro) | integration | `vitest run test/isolation.test.ts` | ❌ Wave 0 |
| TEST-01 | Aislamiento: cross-tenant WRITE (update) falla | integration | idem | ❌ Wave 0 |
| TEST-01 | Aislamiento: cross-tenant INSERT en tabla sin insert público falla | integration | idem | ❌ Wave 0 |
| TEST-01 | Skip graceful sin creds Supabase | meta | `vitest run` (sin env) → isolation skipped, webhooks pass | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <archivo afectado>`
- **Per wave merge:** `npm test` (suite completa)
- **Phase gate:** `npm test` verde (con creds → aislamiento corre; sin → skip) antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.mts` + `vitest.setup.ts` — config base
- [ ] `package.json` script `test` + devDeps instaladas
- [ ] `test/helpers/mp-signature.ts`, `test/helpers/next-request.ts`, `test/helpers/supabase-fixtures.ts`, `test/env.ts`
- [ ] `test/webhook-deposit.test.ts`, `test/webhook-subscription.test.ts`, `test/isolation.test.ts`
- [ ] `.github/workflows/test.yml`
- [ ] Decisión empírica sobre `after()` (Open Q1) y carga de env (Open Q2)

## Security Domain

> `security_enforcement` activo. Esta fase ES un control de seguridad (verificación de las fases 1-4).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Tests verifican la separación de roles (anon vs service-role) |
| V4 Access Control | **yes (core)** | Tests de aislamiento multi-tenant prueban RLS owner-level (`owner_id = auth.uid()`) |
| V5 Input Validation | yes | Webhook: rechazo de body forjado por firma inválida |
| V6 Cryptography | yes | HMAC-SHA256 + `timingSafeEqual` ya en `verifyMPSignature` (se ejercita, no se reimplementa) |
| V9 Communication / Webhooks | yes | Firma `x-signature` fail-closed (401) — el test lo bloquea contra regresión |

### Known Threat Patterns for este stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant data read (negocio A lee B) | Information Disclosure | RLS `owner_id=auth.uid()` — test con anon-key autenticada, sin filtro |
| Cross-tenant write (A modifica B) | Tampering | RLS `USING` deniega update/delete cross-tenant — test verifica 0 filas |
| Webhook forjado confirma turno sin pagar | Spoofing / Tampering | Verificación HMAC fail-closed → 401 — test con firma inválida/ausente |
| Underpayment (pagar $1 una seña de $1500) | Tampering | Comparación en centavos enteros vs `deposit_amount` → `amount_mismatch` — test de monto |
| Test que usa service-role y da falso verde | (meta-amenaza al propio control) | Aserciones SOLO con anon-key; guard que falla si es service-role (Pitfall 12) |

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` — setup oficial Vitest+Next 16 (config, plugins, script, "no async Server Components")
- `node_modules/next/dist/server/web/spec-extension/request.d.ts` — firma del constructor `NextRequest(input, init?)`
- `node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.d.ts` — `createUser(attributes)`, `deleteUser(id)`
- npm registry (verificado 2026-06-17): `vitest@4.1.9` (engines, deps.vite), `vite-tsconfig-paths` (peer `vite:*`), `@vitejs/plugin-react@5.2.0` (peer vite ^4.2..^8)
- Repo ground truth: `lib/mercadopago.ts` (verifyMPSignature/manifest/HMAC), `app/api/payment/webhook/[slug]/route.ts` (fetch crudo + chequeo de monto), `app/api/subscription/webhook/route.ts` (mpFetch), `lib/supabase/{admin,client,public}.ts`, `supabase/schema.sql` + migraciones 027/028 (policies owner + insert público)
- `.planning/research/PITFALLS.md` (Pitfall 12: service-role = falso verde; Pitfall 13: webhook tests), `.planning/research/ARCHITECTURE.md` §Test layer, `.planning/research/STACK.md`
- `.claude/skills/supabase-multitenant-rls/SKILL.md`

### Secondary (MEDIUM confidence)
- `package-legitimacy` seam (verdicts OK / SUS-too-new para los 3 paquetes)

### Tertiary (LOW confidence)
- ninguna

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versiones y peers verificados en npm hoy; config confirmada contra docs bundled de Next 16.
- Architecture (NextRequest, auth.admin, mock por webhook): HIGH — tipos instalados + código del repo leído directamente.
- Pitfalls: HIGH — derivados del código real (fetch crudo vs mpFetch; policies de insert público) y de PITFALLS.md.
- `after()` en tests / carga de env: MEDIUM — requieren validación empírica al implementar (Open Questions).

**Research date:** 2026-06-17
**Valid until:** ~2026-07-17 (Vitest 4 es área de movimiento rápido; re-verificar versiones si pasa >30 días)
