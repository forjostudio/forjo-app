---
phase: 02-admin-de-plataforma
reviewed: 2026-06-18T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - supabase/migrations/032_crm_admin.sql
  - lib/plan-prices.ts
  - lib/crm-metrics.ts
  - lib/crm-directory.ts
  - app/api/admin/set-plan/route.ts
  - app/api/booking/create/route.ts
  - app/(dashboard)/layout.tsx
  - app/suspendido/page.tsx
  - app/(crm)/admin/_actions.schemas.ts
  - app/(crm)/admin/_actions.ts
  - app/(crm)/admin/page.tsx
  - app/(crm)/admin/negocios/page.tsx
  - app/(crm)/admin/negocios/negocios-client.tsx
  - app/(crm)/admin/negocios/[id]/page.tsx
  - app/(crm)/admin/negocios/[id]/ficha-client.tsx
  - app/(crm)/admin/planes/page.tsx
  - app/(crm)/admin/planes/planes-client.tsx
  - components/crm/kpi-card.tsx
  - components/crm/alert-list.tsx
  - components/crm/status-badge.tsx
  - components/crm/addon-toggle.tsx
  - components/crm/extend-trial-dialog.tsx
  - components/crm/plan-price-card.tsx
  - components/crm/crm-sidebar.tsx
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-06-18
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

This is the platform super-admin surface of a multi-tenant SaaS, reviewed with security weighted highest. The implementation is, overall, security-conscious and the load-bearing controls hold up:

- **Server actions (`_actions.ts`):** Every one of the 6 actions (`changePlan`, `suspendBusiness`, `reactivateBusiness`, `extendTrial`, `toggleAddon`, `updatePlanPrice`) calls `requireAdmin()` as its first line, then `.parse(input)` before any mutation. `requireAdmin()` reads `is_admin` from JWT `app_metadata` (not a tenant-editable column) and throws on failure. This correctly defeats the "curl the action directly, bypassing the ConfirmDialog" attack.
- **Migration 032:** The `businesses_protect_admin_columns` BEFORE UPDATE trigger reverts `has_web_custom`/`has_whatsapp`/`plan`/`plan_status` for any non-`service_role` session, closing the owner self-assignment hole. `plan_prices` RLS is admin-only SELECT with no `using(true)`, write restricted to service-role. Confirmed against the same pattern in 031 (`audit_log`).
- **Suspended cutoff:** `booking/create` fails closed (403 `plan_inactive`) for `suspended`/`expired`/`cancelled` before reCAPTCHA/slot logic, and `(dashboard)/layout.tsx` redirects to `/suspendido` before rendering any dashboard JSX.
- **Cross-tenant reads:** Directory/ficha/planes RSCs use service-role *inside* the server component, select explicit non-secret columns, and resolve only the owner email string to the client.
- **MP webhook:** Not touched. Confirmed not in scope/diff.

The one BLOCKER is a **trigger-bypass hole in the legacy `/api/admin/set-plan` route** that undermines the entire 032 trigger guarantee. The remaining findings are correctness/robustness issues and one factual mismatch in user-facing copy.

## Critical Issues

### CR-01: `set-plan` route can be invoked by a leaked/guessed `ADMIN_SECRET` to write the exact columns 032 was written to protect — and bypasses the audit log

**File:** `app/api/admin/set-plan/route.ts:23-63`

**Issue:** Migration 032 (lines 78-112) exists specifically to make `plan` and `plan_status` writable *only* by `service_role`, and the new CRM actions layer `requireAdmin()` + `logAudit()` on top of every such mutation. But `set-plan/route.ts` still uses `createAdminClient()` (service-role) to write `plan`, `plan_status`, and `trial_ends_at` (lines 50-57), guarded only by a static shared `x-admin-secret` header — **no `requireAdmin()`, no audit log entry**.

Because the route runs as `service_role`, the 032 trigger does NOT revert its writes. This means:
- Anyone holding `ADMIN_SECRET` (a long-lived static secret, not a per-user admin JWT) can set any business to `active`/`suspended`/any plan with zero audit trail — the exact action the phase's threat model (`business.suspend` = risk `alto`, audited) is built to record.
- `set-plan` now accepts `'suspended'` in `VALID_STATUSES` (line 7), so this legacy endpoint can also *suspend* businesses silently, contradicting D-06's "suspend is an audited operator action."

This is a real privilege/audit-bypass surface introduced (or left live) alongside this phase: the phase hardens the owner path (trigger) and the operator UI path (actions), but leaves a parallel unaudited write path open. The phase brief explicitly requires that plan/plan_status writes be controlled; this route is a hole in that control.

**Fix:** Either (a) retire this route now that the CRM actions exist, or (b) bring it up to the same bar — call `requireAdmin()` instead of the static secret, and call `logAudit(...)` for every mutation. If it must stay secret-gated for an external automation caller, at minimum add `logAudit` for plan/status changes and document why it is exempt from `requireAdmin`. Minimum patch:
```ts
// after computing `update`, before/after the write:
await logAudit({
  actorId: '<system actor id or null-actor sentinel>',
  action: status === 'suspended' ? 'business.suspend' : 'plan.change',
  targetType: 'business',
  targetId: businessId,
  businessId,
  risk: status === 'suspended' ? 'alto' : 'medio',
  metadata: { plan, status, via: 'set-plan-route' },
})
```
(Note: `logAudit.actorId` is non-nullable in `AuditInput`; a system route has no `auth.users` actor, so a sentinel/decision is required — flagging because the audit model assumes a human admin actor.)

## Warnings

### WR-01: `extendTrial` can set a trial date in the past, with no lower bound

**File:** `app/(crm)/admin/_actions.ts:129-140`, `lib/crm-metrics.ts:92-102`, `app/(crm)/admin/_actions.schemas.ts:37-45`

**Issue:** `extendTrialSchema` validates that `exactDate` is a valid ISO datetime but imposes no "must be in the future" constraint. `resolveTrialEndsAt` happily returns a past date for any `exactDate`. An operator (or a direct POST) can set `trial_ends_at` to a date already elapsed, immediately turning an active trial into an effectively-expired one without going through the audited `suspend` path. The UI calendar disables past days (`extend-trial-dialog.tsx:168`), but the server action — the actual security boundary — does not enforce it. For an action named "extend," moving the date backward is a logic error.

**Fix:** Enforce a lower bound in the schema or the resolver. e.g. in `resolveTrialEndsAt`, after computing the date, `if (result < now) throw new Error('date_in_past')`, or add `.refine()` to `extendTrialSchema` comparing `exactDate` to now.

### WR-02: MRR (dashboard) and per-plan active counts (planes) silently disagree with the per-row MRR cells (directory)

**File:** `lib/crm-metrics.ts:53-61` vs `app/(crm)/admin/negocios/negocios-client.tsx:82-86` vs `app/(crm)/admin/planes/page.tsx:30-35`

**Issue:** Three surfaces compute "active" revenue differently with no shared definition:
- `computeKpis` MRR sums `prices[r.plan] ?? 0` over `plan_status === 'active'` — a missing/legacy plan key contributes 0 but still counts as an active business.
- `planes/page.tsx` counts active businesses only when `PLAN_ORDER.includes(row.plan)` — a legacy-plan active business is dropped from the count entirely.
- `negocios-client.tsx mrrCell` shows `'–'` for an active business whose plan key isn't in `prices`.

So a business on a deprecated plan key that is `active`: counts toward `negociosActivos` and adds 0 to MRR (dashboard), is excluded from any plan's active count (planes), and shows `'–'` MRR (directory). The numbers won't reconcile across screens. Not a security issue, but it will produce "the dashboard says N active, the plan cards sum to N-1" support tickets and erodes trust in the operator console.

**Fix:** Centralize the "is this an active, priced business" predicate in `lib/crm-metrics.ts` and reuse it in all three places, or at minimum document the divergence. Decide whether unpriced/legacy-plan actives count and apply it uniformly.

### WR-03: Per-business owner-email resolution does N sequential admin Auth API calls inside the directory RSC

**File:** `app/(crm)/admin/negocios/page.tsx:58-81`

**Issue:** `Promise.all(businesses.map(... admin.auth.admin.getUserById ...))` fires one Supabase Auth Admin API call per business on every load of `/admin/negocios`. The comment justifies it as "volumen bajo (un operador)," but this is the directory of *all tenants* — it scales with the number of businesses, not operators. At a few hundred businesses this is hundreds of round-trips per page load, and `getUserById` is rate-limited by GoTrue. A transient rate-limit makes the `catch` fall back to `notification_email` silently, so emails intermittently disappear from the directory. (Performance is out of v1 scope, but the *silent correctness degradation under load* is in scope.)

**Fix:** Prefer the stored `notification_email` as the primary source and only call `getUserById` for rows missing it, or batch via `admin.auth.admin.listUsers()` once and join in memory. At minimum, surface that an email is "unverified/fallback" so a rate-limited load doesn't look like missing data.

### WR-04: `set-plan` route logs business name and full plan-limits payload via `console.log` in a production API handler

**File:** `app/api/admin/set-plan/route.ts:61`

**Issue:** The project convention (AGENTS.md / CLAUDE.md "Logging") is `console.error` only, with no `console.log` in production API routes. This line logs the business name and a JSON blob on every successful call. Beyond the convention violation, it writes tenant-identifying data (business name + plan posture) to logs on a security-sensitive endpoint. Combined with CR-01, log noise here also makes the unaudited writes look "logged" when they are not in the tamper-proof `audit_log`.

**Fix:** Remove the `console.log`, or replace with a structured `console.error`-free audit entry (see CR-01).

### WR-05: `getUserById` failure path conflates "no such user" with "transient error," masking owner-account problems

**File:** `app/(crm)/admin/negocios/[id]/page.tsx:57-63`, `app/(crm)/admin/negocios/page.tsx:60-66`

**Issue:** Both ficha and directory wrap `getUserById` in a `try/catch` that, on any error (deleted user, rate limit, network), falls back to `notification_email` and logs to `console.error`. A business whose `owner_id` points at a deleted/missing auth user will silently show the (possibly stale) `notification_email` or "Sin dato" with no operator-visible signal. For the super-admin console whose job is to spot account problems, swallowing "owner account no longer exists" is a meaningful information loss.

**Fix:** Distinguish the not-found case from the transient-error case and surface "owner account missing" in the ficha (it is actionable operator information), rather than collapsing both into a silent email fallback.

## Info

### IN-01: `planes-client.tsx` banner copy contradicts the comment directly above it (truthfulness regression vs D-04)

**File:** `app/(crm)/admin/planes/planes-client.tsx:35-38`

**Issue:** The header comment (lines 8-11) says the banner copy is "VERBATIM del UI-SPEC ... NO el del mock ('impacta la facturación de todos los negocios del plan')." But the rendered copy reads: *"Editar un precio impacta la facturación de planes futuros, no altera las suscripciones activas sin aviso."* The phrasing "impacta la facturación de planes futuros" reintroduces exactly the "impacta la facturación" framing the comment says to avoid, and the sentence is grammatically muddled (missing conjunction between the two clauses). Given D-04's emphasis that editing a price does NOT alter active MP subscriptions, the copy should be unambiguous.

**Fix:** Align the rendered string with the locked UI-SPEC copy referenced in the comment, e.g. "Editar un precio aplica a cobros futuros (nuevas suscripciones); no altera las suscripciones activas. Cada cambio pide confirmación y queda en auditoría."

### IN-02: `timeToMinutes` in booking/create has no guard for malformed time strings

**File:** `app/api/booking/create/route.ts:11-14`

**Issue:** `t.split(':').map(Number)` returns `NaN` for a malformed `time` (e.g. `"abc"` or `""`), and `time` comes straight from the request body with only a non-empty-string check (line 34, 41). A `NaN` `reqStart` makes every `overlaps()` comparison false (so the slot looks free) and propagates a `NaN`-derived value; the insert then stores a junk `time`. This file is out of the phase's new code but was modified for the suspended gate. Low likelihood (client always sends `HH:MM`), hence Info.

**Fix:** Validate `time` against `/^\d{2}:\d{2}$/` early and return `missing_fields`/`bad_request` if it fails.

### IN-03: Magic 7-day window duplicated as both `SEVEN_DAYS_MS` and an inline literal

**File:** `lib/crm-metrics.ts:34`, `app/(dashboard)/layout.tsx:33`, `app/(crm)/admin/page.tsx:30`

**Issue:** The "trial por vencer = ≤7 días" criterion is defined in `crm-metrics.ts` (`SEVEN_DAYS_MS`), while the dashboard layout and admin page each independently recompute day math with their own `86_400_000` literal / `DAY_MS` const. The comment in `crm-metrics.ts:42` claims parity with `layout.tsx:26-28` but the two are not actually sharing code — a future change to one won't track the other.

**Fix:** Export a single `daysUntil(iso, now)` helper from `crm-metrics.ts` and consume it in both the layout and the admin page.

### IN-04: `extendTrial` exactDate round-trips through a `T12:00:00.000Z` literal that is immediately discarded

**File:** `components/crm/extend-trial-dialog.tsx:111-112` → `lib/crm-metrics.ts:96-99`

**Issue:** The dialog builds `${day}T12:00:00.000Z` purely to satisfy `extendTrialSchema`'s `z.iso.datetime()` requirement, then `resolveTrialEndsAt` discards everything after `slice(0, 10)`. The `T12:00:00.000Z` is dead payload — harmless but confusing, and it couples the client to an implementation detail of the resolver. If the schema were ever tightened to validate the time portion, this fake noon would silently pass.

**Fix:** Accept a plain `YYYY-MM-DD` date in the schema (`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`) so the client sends what the resolver actually uses, removing the throwaway time component.

---

_Reviewed: 2026-06-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
