# Phase 5: Vitest Test Suite (TEST-01) - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

TEST-01: introducir un runner de tests (Vitest) y escribir una suite automatizada, ejecutable en CI, que cubra:
1. **Aislamiento multi-tenant** — lectura Y escritura cruzada entre dos negocios debe fallar (RLS).
2. **Los dos webhooks de pago** — firma válida/inválida (fail-closed 401) + mismatch de monto (no confirma).

Es la última fase del milestone; valida el comportamiento correcto que dejaron las fases 1-4. No hay suite de tests en el repo hoy.

**Fuera de scope:** tests de UI/E2E (Testing Library/Playwright) → v2; tests de SEC-03 (admin) y SEC-04 (plan gating) — NO se agregan (solo los dos pilares de TEST-01); refactors de código de producción.
</domain>

<decisions>
## Implementation Decisions

### Stack (locked por research/STACK.md)
- **D-01:** Vitest `^4.1` + `vite-tsconfig-paths` `^5` (resuelve el alias `@/*`) + `@vitejs/plugin-react` `^5`, todos devDependencies. `environment: 'node'` (sin jsdom — no se testea UI). `vitest.config.mts` en la raíz, directorio `test/` (o `__tests__/`). `npm test` = `vitest run`. Sin nuevas deps de runtime.

### DB target (D-02)
- **D-02:** Los tests de aislamiento corren contra el **proyecto Supabase dev** (no hay Supabase CLI local), con fixtures creados y borrados por la suite. NO un proyecto dedicado nuevo.

### Comportamiento en CI (D-03)
- **D-03:** **Skip graceful si faltan creds.** Los tests de webhook (mockeados, sin DB) corren SIEMPRE. Los de aislamiento (necesitan `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`) se **skipean con aviso** (`describe.skip` / `it.skip` con `console.warn`) si esas env no están presentes. Así el suite no falla en un fork/PR sin secrets. NO requerir creds siempre.

### CI wiring (D-04)
- **D-04:** Crear `.github/workflows/test.yml` (GitHub Actions completo) que corre `vitest run` en push/PR, con las keys de Supabase + `MP_WEBHOOK_SECRET` como **GitHub Secrets**. Node version acorde a Vitest 4 (^20/^22/>=24). El job instala deps y corre el suite. (El usuario carga los secrets en el repo settings.)

### Fixtures (D-05)
- **D-05:** **Seed suite-level + IDs únicos.** `beforeAll` crea 2 negocios fixture con slugs/ids únicos prefijados (ej. `__test_<uuid>`) usando el **service-role** (setup); `afterAll` borra TODO lo creado (service-role), incluso si un test falló. IDs únicos por corrida → sin colisiones entre runs concurrentes en el proyecto dev compartido. Los servicios/turnos/secretos de cada negocio se crean en el mismo seed.

### Aislamiento — la trampa crítica (locked)
- **D-06:** Las ASERCIONES de aislamiento usan el cliente **anon-key, NUNCA service_role** (service_role bypassa RLS → falso verde). Service-role SOLO para setup/teardown de fixtures. Cubrir: (a) cross-tenant **read** devuelve 0 filas / denegado, (b) cross-tenant **write** (update/insert sobre datos de otro negocio) falla. Para probar el aislamiento owner-level (policies `owner_id = auth.uid()`), los tests autentican dos sesiones anon como los dueños de los 2 negocios y verifican que el dueño A no ve/escribe datos de B. (Mecánica exacta de auth de los 2 usuarios → research.)

### Webhooks (locked)
- **D-07:** Tests importan el handler `POST` de cada webhook y construyen un `NextRequest` con `x-signature` crafteada (HMAC-SHA256 determinista con un `MP_WEBHOOK_SECRET` de test conocido). Mockear `mpFetch` / el fetch a `/v1/payments/{id}` (sin llamadas reales a MP). Cubrir: firma válida → procesa; firma ausente/inválida → 401; (deposit) monto distinto → turno NO confirmado (`amount_mismatch`).

### Claude's Discretion
- Nombres de archivos de test, helper de construcción de `NextRequest`, helper de firma HMAC de test.
- Estructura exacta del seed (cuántos servicios/turnos por negocio fixture — lo mínimo para probar cross-read/write).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack / setup
- `.planning/research/STACK.md` — versiones exactas de Vitest + companions, `environment: 'node'`, config para Next 16 + alias `@/*`.
- `package.json` — `tsx ^4` ya presente; agregar vitest + companions como devDeps + script `test`.
- `tsconfig.json` — alias `@/*` (por eso `vite-tsconfig-paths`).

### Código bajo test
- `app/api/payment/webhook/[slug]/route.ts` — webhook de seña: `POST(request, { params: Promise<{slug}> })`; firma + monto (Fase 2).
- `app/api/subscription/webhook/route.ts` — webhook de suscripción: `POST(request)`; firma.
- `lib/mercadopago.ts` — `verifyMPSignature`, `getMPWebhookSecret`, `mpFetch` (a mockear).
- `lib/supabase/admin.ts` (service-role, fixtures), `lib/supabase/client.ts` / `public.ts` (anon-key, aserciones).
- Tablas/policies: migraciones 026/027/028 (vistas acotadas + business_secrets + owner RLS), `supabase/schema.sql` (owner policies por `owner_id = auth.uid()`).

### Docs / skills
- `.planning/research/ARCHITECTURE.md` §Test layer placement — fixtures two-tenant, importar POST, mock mpFetch.
- `.planning/research/PITFALLS.md` — Pitfall 12 (¡tests con service-role = falso verde!), Pitfall 13 (webhook tests sin firma o con API real).
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — checklist de aislamiento por tenant.
- `.planning/security-hardening-brief.md` §Fase 5.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tsx ^4` ya está (de Fase 3) — útil para scripts, no para el runner (Vitest tiene el suyo).
- Clientes Supabase ya separados por rol: `admin.ts` (service-role) para fixtures, `client.ts`/`public.ts` (anon) para aserciones.
- `verifyMPSignature` es determinista dado el secreto → la firma de test se computa con `crypto.createHmac` igual que producción.

### Established Patterns
- Handlers exportan `POST` (Next route handlers); el de seña recibe `{ params: Promise<{slug}> }`.
- Error shapes: webhooks `new Response('OK'|'Invalid signature',{status})`; booking `Response.json({ok,error})`.

### Integration Points
- Los tests de aislamiento tocan el proyecto dev real (RLS en vivo) — por eso el skip-if-no-creds y los IDs únicos + teardown.
- Los tests de webhook son unitarios (handler + mocks), corren sin DB.
</code_context>

<specifics>
## Specific Ideas

- `vitest.config.mts` raíz, `test/` dir, `npm test`=`vitest run`, `.github/workflows/test.yml`.
- Fixtures `__test_<uuid>` con beforeAll/afterAll service-role; aserciones anon-key.
- GitHub Secrets a cargar: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MP_WEBHOOK_SECRET`.
</specifics>

<deferred>
## Deferred Ideas

- Tests de UI/E2E (Testing Library, Playwright) → v2.
- Tests de SEC-03 (admin timing-safe) y SEC-04 (plan gating) → no en TEST-01; se pueden agregar después.
- pgTAP / Supabase CLI para RLS testing → fuera de scope (no se adoptó Supabase CLI).
</deferred>

<research_flags>
## Para que research resuelva (decisión técnica, no del usuario)
- **Auth de dos sesiones anon para el test owner-level:** cómo crear/autenticar 2 usuarios Supabase (los dueños de los 2 negocios fixture) y obtener clientes anon-key autenticados, para probar que el dueño A no lee/escribe datos de B (policies `owner_id = auth.uid()`). Confirmar el flujo (`auth.admin.createUser` con service-role + `signInWithPassword` con anon) y el teardown de esos usuarios.
- **Config exacta de Vitest para Next 16:** forma de `vitest.config.mts` con `vite-tsconfig-paths` + `@vitejs/plugin-react`, `environment: 'node'`, que importe route handlers (`@/app/api/.../route`) sin romper por imports de `next/server`.
- **Construir `NextRequest` en test node:** cómo instanciar `NextRequest` con headers (`x-signature`, `x-request-id`) y query (`data.id`) + el `{ params: Promise<{slug}> }` del webhook de seña.
- **Mock de `mpFetch`/fetch a MP:** `vi.mock('@/lib/mercadopago')` o mock de `global.fetch` para el `GET /v1/payments/{id}` del webhook de seña.
</research_flags>

---

*Phase: 5-Vitest Test Suite*
*Context gathered: 2026-06-17*
