# Phase 8: Equipo — qué servicios hace cada profesional - Pattern Map

**Mapped:** 2026-07-24
**Files analyzed:** 6 (2 new, 4 modified) + 1 new test
**Analogs found:** 7 / 7 (all exact or near-exact — this phase is deliberately the "hermana" of Phase 3 `agenda_spaces`)

> **The whole phase mirrors one existing feature.** Phase 3 (`agenda_spaces`, migr. 042) already solved the *exact same shape*: a per-tenant many-to-many bridge (professional ↔ X), RLS with 4 per-operation policies, no `anon`, edited from `SettingsClient` with optimistic chips + rollback. Phase 8 does the same with `service` in place of `space`. Prefer copying these analogs literally over inventing anything. The UI-SPEC (`08-UI-SPEC.md`) is the visual contract; this doc is the code-pattern contract.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/057_*.sql` (new) | migration | CRUD / DDL | `supabase/migrations/042_spaces_and_coupled_exclusion.sql` §1-2 (`agenda_spaces` table + RLS) | exact |
| `supabase/schema.sql` (modified — regenerated) | schema snapshot | — | itself (regenerate after `supabase db reset`, per 042/054/056) | exact |
| `lib/types.ts` (modified — add interface) | model | — | `AgendaSpace` interface (`lib/types.ts:148-152`) | exact |
| `lib/staff-services.ts` (new, D-12) | utility (pure helper) | transform | `lib/booking-window.ts` (pure, no React/Supabase, testable) | role-match |
| `test/staff-services.test.ts` (new) | test | — | `test/verticals.test.ts` (pure vitest, `@/lib` import, no DB) | exact |
| `app/(dashboard)/equipo/page.tsx` (modified) | route (server page) | request-response | itself + `servicios/page.tsx` (add `services` + bridge rows to read-path) | exact |
| `app/(dashboard)/servicios/page.tsx` (modified) | route (server page) | request-response | itself (add bridge rows to read-path) | exact |
| `app/(dashboard)/settings/settings-client.tsx` (modified) | component | event-driven (optimistic write) | `toggleAgendaSpace` + chips block (`settings-client.tsx:617-648`, `:1468-1519`) | exact |

**Discretion (from CONTEXT.md):** the bridge table name is left to the planner; repo convention (mirror of `agenda_spaces`) strongly suggests **`professional_services`**. The rest of this doc uses that name; if the planner picks another, swap it consistently.

---

## Pattern Assignments

### `supabase/migrations/057_*.sql` (migration, DDL) — NEW

**Analog:** `supabase/migrations/042_spaces_and_coupled_exclusion.sql` §2 (the `agenda_spaces` bridge). Copy that table + its 4 policies verbatim, renaming `space_id`→`service_id` and `spaces`→`services`. **Do NOT copy §3-5 of 042** (the `book_slot_atomic` RPC and `appointment_spaces` backstop) — Phase 8 explicitly does not touch the motor (CONTEXT D-11, ROADMAP Phase 8 goal).

**Bridge table + RLS enable** (copy from `042:79-85`):
```sql
CREATE TABLE "public"."professional_services" (
  "business_id"     uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
  "professional_id" uuid NOT NULL REFERENCES "public"."professionals"("id") ON DELETE CASCADE,
  "service_id"      uuid NOT NULL REFERENCES "public"."services"("id") ON DELETE CASCADE,
  PRIMARY KEY ("professional_id", "service_id")
);
ALTER TABLE "public"."professional_services" ENABLE ROW LEVEL SECURITY;
```
Note the FK `ON DELETE CASCADE` on all three columns — this is what makes D-17 (delete a service/professional → bridge self-cleans) free, exactly like `deleteSpace` relies on for `agenda_spaces`.

**Extra index for coverage query (Claude's Discretion note in CONTEXT):** `agenda_spaces` PK is `(professional_id, space_id)`; the coverage view of Phase 8 (STAFF-02: "who offers service X") and Phase 9 query by service, so add the inverse index that `agenda_spaces` did NOT need:
```sql
CREATE INDEX "professional_services_by_service" ON "public"."professional_services" ("service_id", "professional_id");
```

**The 4 per-operation policies** (copy verbatim from `042:90-106`, rename table): `select`/`delete` with `USING`, `insert` with `WITH CHECK`, `update` with both. The tenant predicate is identical across the whole repo:
```sql
CREATE POLICY "professional_services tenant insert" ON "public"."professional_services"
  FOR INSERT WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));
```
**No `anon` policy** — see Shared Patterns §RLS. This matches 042's explicit D-06 decision (`042:35-36`, `042:87-89`): the public never reads the bridge; Phase 10 resolves capability server-side.

**Header comment convention:** 042 opens with a dense `-- Contexto / Qué hace / Qué NO hace` block in Spanish (`042:1-40`). Mirror that structure: state that 057 creates only the bridge + RLS, does NOT touch `professionals.service_id` (canchas, migr. 043), does NOT touch the RPC, has zero backfill (D-01 wildcard = no rows needed), and is applied by hand to prod + `NOTIFY pgrst, 'reload schema';` (CONTEXT D-11b).

**Idempotency + apply flow:** migration is numbered (057, after prod's 056), validated locally with `supabase db reset` (PG17), `schema.sql` regenerated after — same as 042/054/056. Applied **by hand** to prod, NOT via GSD (CONTEXT D-11b).

---

### `lib/types.ts` — add `ProfessionalService` interface (model) — MODIFIED

**Analog:** the `AgendaSpace` interface, `lib/types.ts:148-152`:
```typescript
// Puente agenda↔espacio (migración 042). ... professional_id y space_id son NOT NULL FK
// en la DB ... PK (professional_id, space_id).
export interface AgendaSpace {
  business_id: string
  professional_id: string
  space_id: string
}
```
Add the twin (place it next to `AgendaSpace` / `Service`):
```typescript
// Puente profesional↔servicio (migración 057). Mapea qué servicios sabe hacer cada persona del
// equipo. business_id + FKs NOT NULL en la DB, PK (professional_id, service_id). Regla del comodín
// (D-01): un profesional SIN filas se considera capaz de TODOS los servicios (ver lib/staff-services).
export interface ProfessionalService {
  business_id: string
  professional_id: string
  service_id: string
}
```
Note: columns stay **snake_case** to mirror the DB row (project convention — the TS layer never renames to camelCase; see `AGENTS.md`/`.claude/CLAUDE.md` naming section and every interface in this file).

---

### `lib/staff-services.ts` (pure helper, D-12) — NEW

**Analog:** `lib/booking-window.ts` — the repo's canonical "pure rule shared across layers, tested without a DB" module. It exists precisely so UI + server backstop consume the *same* function and can't drift. Phase 8's helper has the same mandate: the wildcard rule (D-01) must be interpreted identically by this phase's UI (D-08 coverage), the Phase 9 RPC SQL, and the Phase 10 public grid.

**Module doc-comment pattern** (`booking-window.ts:3-14`): open with a block explaining it's the single source of truth, that functions are PURE (no React, no Supabase → reusable client+server, testable without DB), and why the rule is centralized.

**Function shape** (`booking-window.ts:44-63` — small pure predicates over plain data):
```typescript
// Inputs are plain rows (Professional[], Service[], ProfessionalService[]) — never Supabase clients.
export function servicesForProfessional(professionalId: string, services: Service[], bridge: ProfessionalService[]): Service[]
export function professionalsForService(serviceId: string, activeProfessionals: Professional[], bridge: ProfessionalService[]): Professional[]
export function isServiceCovered(serviceId: string, activeProfessionals: Professional[], bridge: ProfessionalService[]): boolean
```
**The wildcard rule to encode (D-01 + CONTEXT "Nota de implementación" lines 76-79, UI-SPEC lines 297-299):**
- A professional with **0 bridge rows** is capable of **all** services (comodín).
- A professional with **≥1 row** is capable of exactly the mapped services.
- `professionalsForService(X)` = active pros who either have 0 rows (wildcard) OR have a row for X.
- A service is "sin cobertura" **only** when ALL active professionals have explicit mappings AND none mapped it. If any active pro is a wildcard (0 rows), **every** service is covered.
- Coverage counts **active pros only** (D-16), mirroring `public_professionals`'s `WHERE active = true`.

---

### `test/staff-services.test.ts` — NEW

**Analog:** `test/verticals.test.ts` (pure vitest suite for a pure lib module). Structure: `import { describe, it, expect } from 'vitest'`, import the helper from `@/lib/staff-services`, no Supabase, no creds. Freeze the wildcard rule cases explicitly (0-rows pro = covers all; last-service-unmapped = uncovered; mixed wildcard + explicit; inactive pro excluded from coverage per D-16). Same idiom as `test/booking-window-exemption.test.ts` for the sibling helper.

---

### `app/(dashboard)/equipo/page.tsx` (server page) — MODIFIED

**Analog:** itself + `servicios/page.tsx`. Today it passes `initialServices={[]}` (`equipo/page.tsx:31`). The editor (Bloque A) needs the business's services as chips **and** the bridge rows. Add both to the existing `Promise.all` (`equipo/page.tsx:22-26`), each scoped by tenant — copy the `.eq('business_id', business.id)` pattern already there:
```typescript
const [{ data: professionals }, { data: services }, { data: spaces }, { data: agendaSpaces }, { data: professionalServices }] = await Promise.all([
  supabase.from('professionals').select('*').eq('business_id', business.id).order('created_at'),
  supabase.from('services').select('*').eq('business_id', business.id).order('created_at'),   // NEW (was initialServices={[]})
  supabase.from('spaces').select('*').eq('business_id', business.id).order('created_at'),
  supabase.from('agenda_spaces').select('*').eq('business_id', business.id),
  supabase.from('professional_services').select('*').eq('business_id', business.id),          // NEW
])
```
Then pass `initialServices={services || []}` and a new `initialProfessionalServices={professionalServices || []}` prop. **Do not remove the canchas redirect** at `equipo/page.tsx:18` (`resolveVertical(business).key === 'canchas'` → `/dashboard`) — it's the primary gate for D-18 (the in-component gate is defense in depth). **Risk flagged in CONTEXT (line 229):** widen `initialServices` without breaking the rest of the view or over-selecting columns — `select('*')` on `services` matches the other loads here, safe.

---

### `app/(dashboard)/servicios/page.tsx` (server page) — MODIFIED

**Analog:** itself. Already loads `services`, `professionals`, `locations`, `spaces`, `agendaSpaces` (`servicios/page.tsx:19-25`). Add the bridge rows to the `Promise.all` and pass as `initialProfessionalServices`. Keep the "no vertical redirect here" comment/behavior (`servicios/page.tsx:14-18`) — `/servicios` serves all verticals, canchas gate is inside the component (D-18).

---

### `app/(dashboard)/settings/settings-client.tsx` (component) — MODIFIED

One component serves both `view="equipo"` and `view="servicios"` (props: `settings-client.tsx:156`, `SettingsView` type at `:102`). Add the new prop `initialProfessionalServices?: ProfessionalService[]` next to `initialAgendaSpaces` (`:131`) with default `[]`, plus a `useState` next to `agendaSpaces` (`:584`).

**Core pattern — optimistic toggle with rollback** (copy `toggleAgendaSpace` + `isMapped`, `settings-client.tsx:617-648`). This IS D-06. New twin:
```typescript
function isServiceMapped(professionalId: string, serviceId: string) {
  return professionalServices.some(r => r.professional_id === professionalId && r.service_id === serviceId)
}
async function toggleProfessionalService(professionalId: string, serviceId: string) {
  const mapped = isServiceMapped(professionalId, serviceId)
  if (mapped) {
    setProfessionalServices(prev => prev.filter(r => !(r.professional_id === professionalId && r.service_id === serviceId)))
    const { error } = await supabase.from('professional_services').delete()
      .eq('business_id', business.id).eq('professional_id', professionalId).eq('service_id', serviceId)
    if (error) { setProfessionalServices(prev => [...prev, { business_id: business.id, professional_id: professionalId, service_id: serviceId }]); toast.error('...') ; return }
    // D-10 / D-02 toasts computed AFTER the optimistic write (UI-SPEC lines 208-217, precedence: D-10 wins)
  } else {
    const row: ProfessionalService = { business_id: business.id, professional_id: professionalId, service_id: serviceId }
    setProfessionalServices(prev => [...prev, row])
    const { error } = await supabase.from('professional_services').insert(row)
    if (error) { setProfessionalServices(prev => prev.filter(r => !(r.professional_id === professionalId && r.service_id === serviceId))); toast.error('...') }
    // marcar nunca dispara toast (UI-SPEC line 219)
  }
}
```
Note: writes go through the **browser client with RLS + explicit `.eq('business_id', ...)`** (defense in depth) — NOT a service-role route handler. This is the authenticated-owner write path the ROADMAP Phase 8 security section mandates.

**Chip markup — Bloque A** (copy `settings-client.tsx:1495-1510`, the space chip). The UI-SPEC (lines 166-188) requires exactly ONE change: add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` to the className (the space chip omits it; WCAG focus). Keep `h-8`, `gap-1.5`, `rounded-full`, and the marked/unmarked token pair identical so it's visually indistinguishable from the space chip. Wrap the chip row in `role="group" aria-label={\`Servicios de ${fullName}\`}`.

**Card placement + gates — Bloque A** (mirror the spaces Card structure `settings-client.tsx:1422-1520`): new third Card inside `<TabsContent value="professionals">`, `<Card className="p-6 space-y-4 mt-4">`. Gates in order (UI-SPEC lines 130-138): (1) not canchas vertical, (2) `professionals.filter(p => p.active).length >= 2` (D-07), (3) if `services.length === 0` render header + guide line (mirror the `professionals.length === 0` guide at `:1479-1483`). List only **active** professionals; chips = all services in `created_at` order.

**Coverage — Bloque B** (`view="servicios"`): surgical additions to the existing service-row `map` (`settings-client.tsx:1230-1261`), same gates 1+2 (UI-SPEC lines 236-243). Add (a) a warning badge next to the name and (b) a new last line — either `Lo hacen: Ana · Juan` or the "sin cobertura" warning line. The `' · '` joiner is the repo idiom (`:1238`, `:1542`); name = `[p.name, p.last_name].filter(Boolean).join(' ')` (`:1487`). The coverage list + "sin cobertura" boolean come from `lib/staff-services.ts` (D-12) — **do not reimplement the wildcard rule in the component** (UI-SPEC line 261). Warning tokens `border-warning/30 bg-warning/10 text-warning` are the existing MP-notice tokens (`settings-client.tsx:1664-1666`).

**Terminology (D-18):** use `resourceWord`/`resourcesWord` (= `term.resource`/`term.resources`, derived at `:588-589`) and `term.services`, never hardcoded — same as the spaces block (`:1426`, `:1473`). Copy strings from UI-SPEC "Copywriting Contract" (lines 316-327); mind the gender rule (avoid the article before `term.services`).

---

## Shared Patterns

### Per-tenant bridge table + RLS (the load-bearing security pattern)
**Source:** `supabase/migrations/042_spaces_and_coupled_exclusion.sql:79-106`
**Apply to:** migration 057
- `business_id NOT NULL` + both FKs `NOT NULL` + composite PK + `ON DELETE CASCADE`.
- `ENABLE ROW LEVEL SECURITY` in the SAME migration (skill rule 1 — a `business_id` table without RLS enabled is a security bug).
- **4 policies, one per operation** (skill rule 3): select/delete `USING`, insert `WITH CHECK`, update both. The `WITH CHECK` on insert/update is what stops writing/moving a row to another tenant.
- Tenant predicate wraps `auth.uid()` in a subselect: `business_id IN (SELECT id FROM businesses WHERE owner_id = (SELECT auth.uid()))` — identical across 040/042.
- **No `anon` policy** (042 D-06, `042:87-89`): the public never reads the bridge. If Phase 10 needs public capability data, it's a *later* migration with a scoped view (à la `public_professionals`), never opening this table to `anon` (CONTEXT D-11, ROADMAP Phase 8 security).

### Defense in depth on every panel query
**Source:** `settings-client.tsx:609` (`deleteSpace`), `equipo/page.tsx:23-25`
**Apply to:** both page.tsx read-paths + every write in `toggleProfessionalService`
- Always `.eq('business_id', business.id)` in addition to RLS. Never rely on one layer.

### Optimistic write with rollback + toast
**Source:** `settings-client.tsx:617-648` (`toggleAgendaSpace`)
**Apply to:** `toggleProfessionalService`
- Mutate local state first, fire the Supabase write, roll back the exact row on error + `toast.error`. No spinner, no `disabled`, no `aria-busy` (UI-SPEC line 199).

### Migration lifecycle
**Source:** `042` header (`042:26-28`), CONTEXT D-11b
**Apply to:** 057
- Numbered, idempotent, validated locally via `supabase db reset` (PG17), `schema.sql` regenerated after, applied **by hand** to prod + `NOTIFY pgrst, 'reload schema';`, coordinated with deploy — NOT through the GSD flow.

### Pure helper shared across layers, tested without a DB
**Source:** `lib/booking-window.ts` + `test/booking-window-exemption.test.ts` / `test/verticals.test.ts`
**Apply to:** `lib/staff-services.ts` + `test/staff-services.test.ts`
- No React, no Supabase; inputs are plain rows; the same function feeds UI, RPC (Phase 9) and public grid (Phase 10) so they can't diverge on the wildcard rule.

---

## No Analog Found

None. Every file maps to a strong existing analog — this phase is, by design, the twin of Phase 3's `agenda_spaces`. The only genuinely new *rule* (the wildcard/comodín of D-01) has no code analog because `agenda_spaces` has no "0 rows = all" semantics; it is specified in CONTEXT D-01 + the "Nota de implementación" (lines 76-79) and UI-SPEC lines 297-299, and must be encoded fresh in `lib/staff-services.ts`.

---

## Metadata

**Analog search scope:** `supabase/migrations/`, `app/(dashboard)/{equipo,servicios,settings}/`, `lib/{types,booking-window,verticals}.ts`, `test/`
**Files scanned:** ~12
**Pattern extraction date:** 2026-07-24
