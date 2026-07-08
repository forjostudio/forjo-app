---
phase: 13-cms-foundation-write-path-owner-only-flag
reviewed: 2026-07-08T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - lib/landing/write.ts
  - lib/landing/write.test.ts
  - app/(dashboard)/web/_landing-actions.ts
  - test/isolation.test.ts
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-07-08
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the CMS write path: the strict Zod write-validator (`lib/landing/write.ts`), the owner-only Server Action (`app/(dashboard)/web/_landing-actions.ts`), and both test suites. The security-critical properties all hold:

- `business_id` is sourced from the session (step 4), never from the request body. Anti-tampering is correct.
- `createAdminClient()` / service-role is absent from the write surface. Session client only. Correct.
- `CMS_ENABLED` is the FIRST operation (line 39), before `createClient()`, `getUser()`, or any DB access. Fail-closed (`=== 'true'`). Correct.
- The write validator calls `safeParse` and rejects on failure (`ok: false`) without falling back to `DEFAULT_LANDING_CONFIG`. Correct.
- Zod v4 `z.object()` strips unknown top-level keys by default (confirmed by runtime test). Stripping of `evil`/`__secret` in the envelope is real.
- Isolation tests use only anon-key authenticated clients for RLS assertions. The service-role guard (`anonKey === SUPABASE_SERVICE_ROLE_KEY`) and the access-token presence check both fire before any RLS assertion runs. No false-green risk from service-role leaking into assertions.
- The cross-write assertion (`error !== null || (data ?? []).length === 0`) correctly catches both RLS denial patterns and would catch a real bypass.

Three warnings and one info item were found. No critical security issues.

---

## Warnings

### WR-01: `saveLandingConfig` returns `{ ok: true }` when update writes 0 rows (silent no-op on deleted business)

**File:** `app/(dashboard)/web/_landing-actions.ts:64-68`

**Issue:** The update at step 6 checks `error` but does not check rows affected. If the business row is deleted between the fetch at step 4 and the update at step 6 (TOCTOU), Supabase returns no error and 0 rows written. The action returns `{ ok: true }` even though nothing was persisted. This is a narrow edge case, but misleads the Phase 14 caller into showing a success toast for a no-op save.

The same gap applies if the RLS policy silently permits 0 rows without returning an error (e.g., an edge case in the policy logic for a just-suspended business).

**Fix:** Chain `.select('id')` on the update and check that at least one row was returned:

```typescript
const { data: updated, error } = await supabase
  .from('businesses')
  .update({ landing_config: parsed.data })
  .eq('id', business.id)
  .select('id')
if (error) return { ok: false, error: 'update_failed' }
if (!updated || updated.length === 0) return { ok: false, error: 'update_failed' }
```

---

### WR-02: Isolation test ordering dependency — cross-write check assumes `landing_config` is null

**File:** `test/isolation.test.ts:129-135`

**Issue:** The cross-write test (line 117-135) asserts `check?.landing_config` is `null` after B's rejected write. This assertion is only valid because the same-tenant write test (line 138-155) runs later and hasn't written anything yet. If test order changes (e.g., `--shuffle`, test file reorganisation, or a future test is inserted between), the cross-write's effect-verification assertion would fail, creating a misleading RLS test failure.

The tests are sequentially correct today (Vitest default order = declaration order within a `describe`), but the dependency is undocumented.

**Fix:** Either capture the original value before the cross-write attempt and compare against it, or add a comment explicitly flagging the ordering dependency:

```typescript
// ORDERING: este test debe correr ANTES del 'same-tenant WRITE' (línea ~138)
// porque ese test escribe landing_config de bizA. Si el orden cambia, la aserción de null
// abajo falla aunque RLS sea correcto. No mover este bloque más abajo de ese test.
const { data: before } = await seeded.admin
  .from('businesses')
  .select('landing_config')
  .eq('id', seeded.bizA)
  .single()
const originalConfig = before?.landing_config ?? null

// ... (cross-write attempt) ...

const { data: check } = await seeded.admin
  .from('businesses')
  .select('landing_config')
  .eq('id', seeded.bizA)
  .single()
// El config de A no fue tocado por el intento de B.
expect(check?.landing_config).toEqual(originalConfig)
```

---

### WR-03: `saveLandingConfig` is not wrapped in try/catch — unhandled network errors throw to the caller

**File:** `app/(dashboard)/web/_landing-actions.ts:42-70`

**Issue:** None of the async operations (`createClient()`, `auth.getUser()`, the `businesses` select, the `businesses` update) are wrapped in try/catch. A transient network failure, Supabase outage, or internal error from the client factory would throw an unhandled exception out of the Server Action. Next.js 16 would surface this as an unhandled server error; whether the caller sees a proper error or a crash depends on how Phase 14 invokes the action.

The CRM pattern for non-best-effort actions (e.g., `changePlan`, `toggleAddon` in `_actions.ts`) follows the same convention of no try/catch — so this is consistent with the existing codebase style. However, those CRM actions are called from a `ConfirmDialog` that has its own error boundary. Phase 14's `saveLandingConfig` caller is not yet implemented; if it does not guard against throws, the editor panel would crash instead of showing `{ ok: false, error: '...' }`.

**Fix:** Wrap the body in a try/catch to guarantee the `{ ok, error }` contract is always returned:

```typescript
export async function saveLandingConfig(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!CMS_ENABLED) return { ok: false, error: 'cms_disabled' }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'unauthorized' }

    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', user.id)
      .single()
    if (!business) return { ok: false, error: 'no_business' }

    const parsed = parseLandingConfigForWrite(input)
    if (!parsed.ok) return { ok: false, error: parsed.error }

    const { data: updated, error } = await supabase
      .from('businesses')
      .update({ landing_config: parsed.data })
      .eq('id', business.id)
      .select('id')
    if (error || !updated?.length) return { ok: false, error: 'update_failed' }

    return { ok: true }
  } catch (e) {
    console.error('[saveLandingConfig] error inesperado:', e instanceof Error ? e.message : e)
    return { ok: false, error: 'server_error' }
  }
}
```

---

## Info

### IN-01: Write test does not cover top-level key stripping across nested section types

**File:** `lib/landing/write.test.ts:21-33`

**Issue:** Test case (2) verifies that `evil` and `__secret` are stripped at the top-level `landingConfigSchema` boundary. This is correct. However, `sectionSchema.data` is typed as `z.unknown().optional()`, which means arbitrary nested content inside sections is passed through without stripping. The test does not document this known limitation — that stripping only applies to the envelope, not to per-section data blobs.

This is intentional per `schema.ts` (D-04: "data queda permisivo en esta fase") and is not a bug. But a reader of the test could incorrectly infer that nested evil keys in `section.data` are also stripped.

**Fix:** Add a comment in test case (2) or add a separate test case documenting the boundary:

```typescript
// NOTA: el estripado aplica SOLO al envelope top-level (landingConfigSchema es z.object).
// Los blobs `section.data` son z.unknown() a propósito (D-04, Phase 7 los tipará)
// y NO se estripan. Un atacante que controle section.data puede persistir claves arbitrarias
// dentro del blob JSON — pero son datos de CONTENIDO del dueño, no del envelope de la app.
it('estripa las claves desconocidas del envelope antes de escribir', () => {
```

---

_Reviewed: 2026-07-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
