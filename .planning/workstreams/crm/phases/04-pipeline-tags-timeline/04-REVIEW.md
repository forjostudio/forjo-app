---
phase: 04-pipeline-tags-timeline
reviewed: 2026-06-22T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - components/crm/tag-manager-dialog.tsx
findings:
  critical: 0
  warning: 1
  info: 1
  total: 2
status: issues_found
---

# Phase 04: Code Review Report (gap-closure 04-09)

**Reviewed:** 2026-06-22
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Gap-closure review of commit `525627c`: a new "Asignadas" section in
`components/crm/tag-manager-dialog.tsx` that imports `removeTag`, adds a `handleRemove`
handler, and renders `assignedTags` as `<TagChip removable onRemove={...} />` for both
`entityType` ('lead' | 'business').

The delta is small and high quality. `handleRemove` mirrors the existing
`handleAssignExisting` pattern exactly (pending guard, `try/catch`, safe
`console.error` message extraction, `toast.error`, `finally setPending(false)`,
`onChanged?.()`). The call shape `{ tagId, entityType, entityId }` matches the
`removeTag` server action's `removeTagSchema.parse(input)` contract.

Security is sound: `removeTag` re-runs `requireAdmin()` + zod validation + `logAudit`
server-side; it only deletes a single `entity_tags` row scoped by
`entity_type`/`entity_id`, never touching business data. The client is affordance-only,
as documented. No multi-tenant isolation concern in the delta.

No bugs, no hooks/exhaustive-deps issues (no new hooks introduced; handlers are plain
functions, intentionally not memoized — consistent with the rest of the file), no unused
imports/vars. Two non-blocking findings below.

## Warnings

### WR-01: Remove (X) chips lack pending feedback / disabled state

**File:** `components/crm/tag-manager-dialog.tsx:142`
**Issue:** While an action is in flight, `handleRemove` (and `handleAssignExisting`) is
correctly guarded by the shared `pending` flag (`if (pending) return`), so a second click
is a safe no-op. But the `TagChip removable` X-buttons give no visual feedback during
`pending` — they stay fully clickable-looking. By contrast, the "Crear tag" button uses
`disabled={!newTagLabel.trim() || pending}`. This is an inconsistency in interactive-state
feedback (CLAUDE.md: loading states / disabled to avoid the appearance of an unresponsive
control), not a correctness bug. The pre-existing "Asignar existente" toggle chips share
the same gap, so the new code merely matches an existing weakness rather than introducing
a worse one.
**Fix:** Plumb a `disabled`/`busy` prop into `TagChip` and pass `pending`, e.g.
`<TagChip ... removable onRemove={() => handleRemove(t)} disabled={pending} />`, and have
the X-button render `disabled={disabled}` with reduced opacity. If touching `TagChip` is
out of scope for this gap-closure, leave a note — the behavior is safe as-is.

## Info

### IN-01: Single `pending` flag serializes all chip interactions

**File:** `components/crm/tag-manager-dialog.tsx:51,79`
**Issue:** All three handlers (`handleAssignExisting`, `handleRemove`, `handleCreateTag`)
share one `pending` boolean. Clicking remove on tag A blocks removing tag B until the
first round-trip + `onChanged()` refresh completes. For a dialog with a handful of tags
this is acceptable and matches the pre-existing design; flagged only for awareness, not as
a defect. No per-row state is warranted here given the scale.
**Fix:** None required. If per-chip responsiveness ever matters, track an in-flight set of
tag ids instead of a single boolean.

---

_Reviewed: 2026-06-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
