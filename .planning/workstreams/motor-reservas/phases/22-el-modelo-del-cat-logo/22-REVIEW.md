---
phase: 22-el-modelo-del-cat-logo
reviewed: 2026-09-15T17:35:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - lib/service-categories.ts
  - lib/types.ts
  - supabase/migrations/078_service_categories.sql
  - supabase/schema.sql
  - test/isolation.test.ts
  - test/service-categories-model.test.ts
  - test/service-categories.test.ts
findings:
  critical: 0
  warning: 7
  info: 5
  total: 12
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-09-15T17:35:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the catalog model phase: migration 078, the pure `groupCatalog` module, the TS types mirror, the `schema.sql` mirror and the three test files.

**What holds up under attack (verified, not assumed):**

- The two view redefinitions are correct. I diffed the column lists mechanically against the last migration that defined each view (`061` for `public_businesses`, `062` for `public_services`): in both cases the 078 list is the previous list **verbatim, in the same order, with the new columns appended at the end**. `CREATE OR REPLACE VIEW` will not fail on ordering, and the public payload does not silently shift. `WHERE active = true` is preserved on `public_services`.
- CR-01 (migr. 072) is not reopened. All three views emit `REVOKE ALL` + `GRANT SELECT` for anon/authenticated, `GRANT ALL` only for `service_role` — the 072 mold, not the 059/061/071 one. I checked the current mirror state of the other six `public_*` views; none of them regressed.
- The FK ends in `ON DELETE SET NULL (category_id)` with the column list, so the `business_id`-nulling failure mode the 075 measured is genuinely closed. I also confirmed no trigger on `services` can block the cascade: `services_block_delete_trg` is `BEFORE DELETE` and `services_block_mode_change_trg` is `BEFORE UPDATE OF capacity_mode`, so an FK-driven `category_id`-only update fires neither.
- The 4 RLS policies match the 071 mold, `UPDATE` carries both `USING` and `WITH CHECK`, and there is no `anon` policy on the base table.
- `tsc --noEmit` is clean; the pure test lane is 895 passed / 3 expected-fail across 58 files.

**Where it does not hold up.** Every defect I found is in the *defensive* claims the code makes about itself, and each one I reproduced by execution rather than by reading:

- `porPrecio` documents `null` by name as the case it protects against, and does not protect against it — `Number(null) === 0`, so a broken price sorts **first**, as if it were free.
- `porNombre` has no protection at all and **throws** on a null name, which inside an RSC render is a 500 on the public booking page — the exact catastrophic mode the module header says it precludes.
- The "conservation invariant" (`exactly once`) is violated by duplicate category ids: the same service is emitted in two groups.
- The `modes` merge does not do what its comment says for explicitly-`undefined` fields, and `lib/types.ts` makes the natural Phase 23/24 call site produce exactly those undefineds.
- The `schema.sql` mirror omits the table-level grants for `service_categories` — the first table created after 073 — so it understates what `anon` actually holds on the base table.
- The `lower(name)` uniqueness the migration claims closes CAT-01 "in the base, not on screen" does not normalize whitespace.
- The DB-backed model test is order-dependent, against the stated convention of its sibling file.

None of these is reachable from the real read path *today* (DB `NOT NULL` on both `name` columns, `numeric(10,2) NOT NULL` on price, `id` is a PK), which is why none is classified BLOCKER. But this module's entire stated contract is "receives rows from a third party and cannot validate their origin", and it is about to be consumed by two surfaces in Phases 23 and 24. The defenses should either work or not be claimed.

## Warnings

### WR-01: `porPrecio` does not handle the `null` its own JSDoc names — a broken price sorts first, as free

**File:** `lib/service-categories.ts:150-155` (test gap at `test/service-categories.test.ts:153-166`)

**Issue:** The JSDoc states verbatim: *"una lectura rota puede traer `null`"* and promises the pair is left *"SIN CRITERIO"*. The guard is `!Number.isFinite(Number(x))`, but `Number(null) === 0` and `Number('') === 0` — both **finite**. A `null` or empty-string price is therefore treated as a real price of `0` and sorted to the **top** of its group, which is the loudest possible position for a broken row and exactly the *"le movería el catálogo al dueño por un dato roto que él no ve"* outcome the comment says it avoids.

Reproduced by execution:

```
NULL price en grupo (price): [ 'roto', 'barato', 'caro' ]   // roto.price = null  → first
empty-string price:          [ 'vacio', 'x' ]                // vacio.price = ''   → first
```

The test that exists (`'price': un precio que NO es un número...`) only covers `'no-es-un-numero'` and `NaN` — the two inputs the guard already handles. The case the comment names is untested, which is why the gap survived.

Not reachable from `public_services` today (`services.price` is `numeric(10,2) NOT NULL`), so this is a latent defect, not a live one.

**Fix:**

```ts
/** Normaliza lo que llega de PostgREST: null/''/no-numérico ⇒ NaN ⇒ sin criterio. */
function precioDe(v: unknown): number {
  if (v === null || v === undefined || v === '') return NaN
  return Number(v)
}

function porPrecio(a: { price: number }, b: { price: number }): number {
  const pa = precioDe(a.price)
  const pb = precioDe(b.price)
  if (!Number.isFinite(pa) || !Number.isFinite(pb)) return 0
  return pa - pb
}
```

And extend the existing test case with `price: null as unknown as number` and `price: '' as unknown as number`, asserting the input order is preserved.

---

### WR-02: `porNombre` throws on a null name — an exception inside the comparator 500s the public booking page

**File:** `lib/service-categories.ts:137-139`

**Issue:** `a.name.localeCompare(...)` dereferences `name` with no guard. `porPrecio` right below it is explicitly defensive about broken reads; `porNombre` is not, and it is the comparator used by **both** axes in `'alpha'` mode. A null/undefined `name` on either a service or a category makes `groupCatalog` throw, and `groupCatalog` is about to be called inside an RSC that renders `/[slug]` — an uncaught throw there is a 500 on the public reservation page, i.e. *"no se ve nada"*, which is precisely the failure mode the module header (lines 216-222) declares impossible: *"el peor caso posible es 'se ve como hoy', nunca 'no se ve nada'"*.

Reproduced by execution (position-dependent, which is worse — it will not reproduce consistently):

```
null name 2nd:  THROW -> Cannot read properties of null (reading 'localeCompare')
null cat name:  THROW -> Cannot read properties of null (reading 'localeCompare')
null name 1st:  no-throw    // 'b'.localeCompare(null) coerces to the string "null"
```

Note the third line: when the broken row lands first in the input, there is no throw and the row silently sorts as if its name were the literal string `"null"`. So the same bad row either crashes the page or mis-sorts, depending on heap order.

Not reachable from the DB today (`services.name` and `service_categories.name` are both `NOT NULL`), but the module's own contract says it receives rows it cannot validate.

**Fix:**

```ts
function porNombre(a: { name: string }, b: { name: string }): number {
  // Un nombre roto NO puede tirar: acá adentro un throw es un 500 en la página pública.
  const na = typeof a.name === 'string' ? a.name : ''
  const nb = typeof b.name === 'string' ? b.name : ''
  return na.localeCompare(nb, 'es', { sensitivity: 'base' })
}
```

Add a test asserting `groupCatalog` does not throw with a null `name` in either array, in both positions.

---

### WR-03: a duplicate category id emits the same service in two groups — the conservation invariant is violated

**File:** `lib/service-categories.ts:270-276`

**Issue:** The loop reads `porCategoria.get(c.id)` without consuming the bucket. If `categories` contains two entries with the same `id`, both iterations read the **same array** and push it into **two different groups**. The module's JSDoc (lines 216-222) states the invariant as absolute — *"todo servicio de la entrada aparece EXACTAMENTE UNA VEZ en la salida"* — and the test suite asserts it with `expect(new Set(salida).size).toBe(entrada.length)` (`test/service-categories.test.ts:363`), but no test case feeds duplicate category ids, so the assertion never sees this input.

Reproduced by execution:

```
DUP-CAT: [{"t":"Cortes","s":["s1"]},{"t":"Cortes dup","s":["s1"]}]
```

Downstream this also produces duplicate React keys in whatever Phase 24 renders, and a client would see the same bookable service listed twice under two headings.

Not reachable from `public_service_categories` today (`id` is the PK). It becomes reachable the moment a caller concatenates two reads, merges a cached list, or an optimistic UI appends a category that a refetch also returns — all plausible in Phase 23.

**Fix:** consume the bucket so a second visit to the same id finds nothing.

```ts
  for (const c of ordenadas(categories, comparadorDeCategorias(modoCategorias))) {
    const suyos = porCategoria.get(c.id)
    if (!suyos || suyos.length === 0) continue
    porCategoria.delete(c.id) // una categoría repetida no puede duplicar sus servicios
    grupos.push({ categoryId: c.id, title: c.name, services: ordenadas(suyos, ordenarServicios) })
  }
```

Add the case to the `casos` table in Bloque C (`test/service-categories.test.ts:324-353`) so the existing `new Set(...)` assertion covers it.

---

### WR-04: the `modes` merge does not restore defaults for explicitly-`undefined` fields, and the likely call site passes exactly that

**File:** `lib/service-categories.ts:232-233` (with `lib/types.ts:66,68`)

**Issue:** The comment claims *"Campo por campo: un caller que sólo sabe el modo de servicios no pierde el de categorías"*, but `{ ...DEFAULT_SORT_MODES, ...modes }` does **not** fall back when a key is present with value `undefined` — the spread overwrites the default with `undefined`.

This matters because `lib/types.ts` declares both business fields as optional:

```ts
category_sort_mode?: 'custom' | 'alpha'
service_sort_mode?: 'custom' | 'alpha' | 'price'
```

so the natural Phase 23/24 call site — `groupCatalog(services, categories, { categories: business.category_sort_mode, services: business.service_sort_mode })` — passes `undefined` for both whenever the row predates the migration or was fetched with a narrower `select`. Reproduced:

```
UNDEF modes: [ 'b', 'a' ]   // sort_order 1,2 → se ordenó por sort_order, no explotó
```

Today the output still matches `'custom'`, but **only by accident**: both `comparadorDeCategorias` and `comparadorDeServicios` fall through their `if` chains to `porOrden`. The moment either default changes, or a `switch` with an exhaustive `never` guard is introduced, this becomes a silent wrong-order-for-every-tenant bug — the exact class of change CAT-07 exists to prevent.

**Fix:** normalize field by field instead of relying on spread semantics.

```ts
  const modoCategorias = modes?.categories ?? DEFAULT_SORT_MODES.categories
  const modoServicios = modes?.services ?? DEFAULT_SORT_MODES.services
```

Add a test passing `{ categories: undefined, services: undefined }` and asserting it equals the `DEFAULT_SORT_MODES` output.

---

### WR-05: the `schema.sql` mirror omits the table-level grants for `service_categories` — it understates what `anon` holds

**File:** `supabase/schema.sql:1395-1404` (grant section around `supabase/schema.sql:4508-4530`; default privileges at `supabase/schema.sql:4589-4607`)

**Issue:** Every other base table in the mirror carries an explicit grant block (`professional_services` at 4331-4333, `time_block_services` at 4337-4339, `saved_products`, etc.). `service_categories` has **none** — the mirror records the table, its owner, its PK, its indexes, its FK, its RLS and its 4 policies, but zero privileges.

That is not what the real database will have. `service_categories` is the **first table created after migration 073**, and 073 left this in place (mirrored at `schema.sql:4589-4592` and `4606-4607`):

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE TRUNCATE ON TABLES FROM "authenticated";
```

So after applying 078 as `postgres`, the real ACL is `anon = SELECT`, `authenticated = ALL minus TRUNCATE`, `service_role = ALL`. A `pg_dump` would print those lines; this mirror does not. The project rule is explicit — *"un espejo que miente sobre permisos o constraints es un defecto"* — and the specific lie here is the one that matters most: reading `schema.sql`, a future migration author concludes `anon` has **no** privilege on `service_categories`, when in fact `anon` holds `SELECT` and the only thing stopping it from reading every tenant's categories is the RLS policy. That is exactly the kind of assumption that produced CR-01.

This is a mirror-fidelity defect, not a live vulnerability: RLS with no `anon` policy does block the reads.

**Fix:** add the block next to the other table grants, with the reason inline.

```sql
-- (migr. 078) La 078 NO emite GRANT para la tabla base: el ACL sale de los ALTER DEFAULT PRIVILEGES
-- de la 073 (primera tabla creada después de ella). Resultado real: anon SELECT (la RLS es lo único
-- que lo frena), authenticated ALL menos TRUNCATE.
GRANT SELECT ON TABLE "public"."service_categories" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER ON TABLE "public"."service_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."service_categories" TO "service_role";
```

Confirm against the live catalog with the runbook's own query (078, step d.2) extended to include `service_categories`, and mirror whatever it actually returns.

---

### WR-06: `service_categories_name_uq` does not normalize whitespace, so the duplicate-title case it claims to close in the base stays open

**File:** `supabase/migrations/078_service_categories.sql:190-198` (mirrored at `supabase/schema.sql:1901-1908`)

**Issue:** The migration justifies the index as CAT-01 *"resuelto EN LA BASE, no en la pantalla"*, and states the harm precisely: *"dos títulos que el cliente lee como UNO"*. The index is over `lower(name)`, which closes `'Color'` vs `'COLOR'` but leaves `'Color'` vs `'Color '`, `' Color'` and `'Color  '` all insertable in the same business — producing exactly the two-headings-that-read-as-one outcome, since the trailing space is invisible in rendered HTML.

There is also no constraint against `name = ''` or a whitespace-only name, so an empty public heading is insertable. Phase 23 is the panel that will write this column, and it will do so believing the base already enforces CAT-01.

The expression index is already an expression — normalizing costs nothing.

**Fix (needs a follow-up migration, since 078 is not yet applied to prod this can go into 078 itself):**

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "service_categories_name_uq"
  ON "public"."service_categories" ("business_id", "lower"("btrim"("name")));

ALTER TABLE "public"."service_categories"
  ADD CONSTRAINT "service_categories_name_not_blank" CHECK ("btrim"("name") <> '');
```

If the `CHECK` is judged to be a rule the rest of the schema does not sustain (no other `name` column has one), drop it and keep the `btrim` in the index — but then say so in the header instead of claiming CAT-01 is closed. Mirror the change in `schema.sql` after applying.

---

### WR-07: `test/service-categories-model.test.ts` is order-dependent, against the convention its sibling file advertises

**File:** `test/service-categories-model.test.ts:34,93-133,135-155`

**Issue:** `categoryId` is declared at suite scope, assigned inside the second `it`, and the third `it` asserts against the state the second one left behind (`expect(grupos[0].title).toBe(CATEGORY_NAME)`, `expect(services).toHaveLength(2)`). Running the third test alone (`vitest -t 'D-03'`), under `--sequence.shuffle`, or after a failure in the second, fails for reasons unrelated to what it is testing.

This is directly against the stated convention of the sibling DB-backed file, which is explicit about it (`test/isolation.test.ts`, case 8): *"Centinela sembrado con service-role (order-independent, como el resto del archivo): partimos de `category_id = null` sin asumir qué dejó otro caso."* The new file adopts the fixtures and the anon-vs-service-role discipline of that family but not its order-independence.

Secondary: the anti-false-green guard (lines 64-66) runs **after** `seedOneTenant()` and after `createClient`. It should be the first statement in `beforeAll` so a misconfigured environment aborts before writing fixtures.

**Fix:** seed the category in each test that needs it (or in a `beforeEach` that upserts and a `afterEach` that deletes), and assert the count of services the test itself created rather than the cumulative total:

```ts
  const seedCategoria = async (name: string, sort = CATEGORY_SORT) => {
    const ins = await seeded.admin
      .from('service_categories')
      .insert({ business_id: seeded.businessId, name, sort_order: sort })
      .select('id').single()
    if (ins.error || !ins.data) throw new Error(`insert de categoría falló: ${ins.error?.message}`)
    return ins.data.id as string
  }
```

and move the `anonKey === SUPABASE_SERVICE_ROLE_KEY` guard to the top of `beforeAll`.

## Info

### IN-01: the CR-01 regression block never probes UPDATE, and never asserts the base table is unreadable by anon

**File:** `test/isolation.test.ts:566-600` (cases 1-3), `test/isolation.test.ts:611-628` (case 4)

**Issue:** The block exists to catch a re-copied `GRANT ALL ... TO anon` on a DEFINER view. It tests `INSERT` on the new view and `DELETE` on all three, but never `UPDATE`. A leaked `GRANT UPDATE` — which on an auto-updatable DEFINER view is a cross-tenant write that bypasses RLS just as badly — would pass this suite green. Separately, case 4 asserts the anon cannot `INSERT` into the base table but never asserts the anon `SELECT` on the base table returns zero rows; as established in WR-05, `anon` **does** hold `SELECT` on that table at the grant level, and RLS is the only thing between it and every tenant's category names.

**Fix:** add to case 3 an `UPDATE` attempt per view with an independent survival check, e.g. `await pub.from('public_services').update({ name: '__hacked' }).eq('business_id', seeded.bizA)` followed by asserting the name is unchanged; and to case 4 `const { data } = await pub.from('service_categories').select('id'); expect((data ?? []).length).toBe(0)`.

---

### IN-02: `public_service_categories` has no `WHERE`, so anon can enumerate every tenant's category names in one request

**File:** `supabase/migrations/078_service_categories.sql:322-327`

**Issue:** The view is unfiltered; isolation depends entirely on the consumer's `.eq('business_id', ...)`. A `GET /rest/v1/public_service_categories?select=*` with the anon key returns the catalog headings of every business on the platform. This is consistent with `public_services` and `public_businesses`, which already leak comparably (service names and prices, business names and slugs), and the phase context states this is the deliberate design — recorded here so the precedent is explicit and not re-derived later. The exposed columns themselves were correctly minimized (`created_at` excluded, no PII), matching the `public_canchas` precedent.

**Fix:** none required for this phase. If cross-tenant enumeration is ever revisited, it must be revisited for all seven `public_*` views at once, not for this one alone.

---

### IN-03: the migration relies on the executing role for both ownership and grants, and the runbook does not verify either

**File:** `supabase/migrations/078_service_categories.sql:149-156` (table), `:112-133` (runbook verification)

**Issue:** The new base table gets no `ALTER TABLE ... OWNER TO "postgres"` (unlike all three views, which get an explicit `ALTER VIEW ... OWNER TO "postgres"`), and no explicit grants. Both the recorded owner in `schema.sql:1404` and the ACL described in WR-05 are therefore consequences of *who runs the file*. That is true in practice (SQL editor and CLI both run as `postgres`, as migration 073's own note documents), but the runbook's verification queries check policies, RLS, constraints and view grants — never the table's owner or its ACL.

**Fix:** add `ALTER TABLE "public"."service_categories" OWNER TO "postgres";` after the `CREATE TABLE`, and extend the runbook's step (d.2) query to include `'service_categories'` in the `table_name IN (...)` list so the applied ACL is recorded rather than assumed.

---

### IN-04: mirror object ordering diverges from what a regenerated dump would produce

**File:** `supabase/schema.sql:1395` (`service_categories`), `supabase/schema.sql:1497` (`public_service_categories`)

**Issue:** `pg_dump` orders objects alphabetically by name; the surgical insertions place `service_categories` between `public_professionals` and `services`, and `public_service_categories` between `public_time_block_services` and `saved_products`. Harmless today (the mirror is never executed — `supabase db reset` does not read it), but it will show as spurious churn the day the mirror is regenerated or diffed against a dump.

**Fix:** optional. If addressed, move `service_categories` to sort after `schedule_exceptions` and `public_service_categories` to sort between `public_professionals` and `public_services`.

---

### IN-05: the module, the type and the constants have no application consumers yet

**File:** `lib/service-categories.ts:227`, `lib/types.ts:218`

**Issue:** `groupCatalog`, `ServiceCategory`, `DEFAULT_SORT_MODES`, `OTHER_GROUP_TITLE` and `CatalogSortModes` are referenced only from `test/`. A cross-module scan reports them as unused exports. This is intended — Phase 23 (panel) and Phase 24 (public page) are the consumers — and is recorded so the dead-export signal is not mistaken for an oversight. The practical consequence worth naming: the new DB columns and the module are exercised **only** by tests, so the correctness of the Phase 23/24 call sites (see WR-04) has no compile-time or runtime evidence yet.

**Fix:** none for this phase. Revisit WR-04 when the first real call site lands.

---

_Reviewed: 2026-09-15T17:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
