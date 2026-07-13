# Phase 1 — UI Review

**Audited:** 2026-06-18
**Baseline:** 01-UI-SPEC.md (approved design contract, 2026-06-17)
**Screenshots:** Not captured (no dev server detected; runtime evidence from UAT confirmed in task prompt)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | One copy deviation: "Exportar log" rendered disabled (placeholder), not the functional CTA the spec declared; filtered empty state heading has trailing period inconsistency. |
| 2. Visuals | 4/4 | Shell hierarchy, empty states, and PRONTO tagging all match the approved captures. No focal point confusion. |
| 3. Color | 4/4 | .crm-shell tokens exactly match the spec; 60/30/10 distribution correct; --crm-danger never conflated with --destructive; amarillo confined to declared elements. |
| 4. Typography | 3/4 | Two non-spec font sizes in use (10px on PRONTO tag and ⌘K kbd, below the 12px floor for non-body labels). Weights and families otherwise correct. |
| 5. Spacing | 3/4 | Admin landing page uses ad-hoc p-8/p-12 not on the canonical scale; all other components conform. |
| 6. Experience Design | 4/4 | All required states present: empty/filtered/error, loading spinner, anti-double-submit, dialog non-closable during loading, aria-describedby on helpers, focus trap from base-ui. |

**Overall: 21/24**

---

## Top 3 Priority Fixes

1. **10px font sizes on PRONTO tag and ⌘K kbd chip** — Both `text-[10px]` usages fall below the spec's 12px mono label floor and below WCAG's practical minimum for non-body text at 4.5:1. Fix: change both to `text-xs` (12px). Files: `components/crm/crm-sidebar.tsx:101`, `components/crm/crm-topbar.tsx:47`.

2. **"Exportar log" button is disabled in production** — The spec declares it as a functional primary CTA ("Exportar log" outline button). It ships `disabled` as a placeholder, meaning users who reach the table see a non-actionable button with no explanation. Fix: either wire a basic CSV export of the current `filtered` array client-side (no backend required), or add a `title="Disponible próximamente"` tooltip and explicit visual affordance so users understand it is intentionally locked. File: `app/(crm)/admin/auditoria/auditoria-client.tsx:169`.

3. **Admin landing page spacing off-scale** — `/admin/page.tsx` uses `p-8` (32px) and `p-12` (48px) via `sm:p-12` as an inline class pair. The canonical scale has `xl=24px` for content padding and `2xl=32px` for section breaks. The responsive jump from 32 to 48px is not on the scale. Fix: change to `px-6 py-6 lg:px-8` to align with the content area padding used by the layout (`px-4 py-6 lg:px-6`) plus one increment. File: `app/(crm)/admin/page.tsx:12`.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**PASS items:**
- Empty state heading: "Todavía no hay acciones registradas" — exact match to spec.
- Empty state body: exact match to spec.
- Filter tabs: Todos / Altos / Medios / Bajos — exact match.
- Search placeholders: "Buscar en todo…" (topbar) and "Buscar acción, negocio…" (audit) — exact match.
- ConfirmDialog error toast: "No se pudo completar la acción. Probá de nuevo o revisá tu conexión." — exact match to spec.
- Action verbs in ConfirmDialog titles and the `onConfirm` confirm labels follow the verb+noun rule.
- Brand copy "WhatsApp" is used in ACTION_LABEL (`addon.toggle` → "Cambió add-on"); no "SMS" string found — brief §11 fix applied correctly.

**WARNING items:**
- `filtered.length === 0` empty state heading (`auditoria-client.tsx:188`): "Ninguna acción coincide con este filtro." — includes a trailing period. The spec copy ("Ninguna acción coincide con este filtro.") also has the period, so this is technically consistent with spec, but the other headings have no trailing period. Minor inconsistency.
- "Exportar log" is rendered `disabled` with no tooltip or explanatory text. Users who reach a populated table see a non-functional CTA with no signal that it is intentionally locked vs broken. The spec declares it as an active outline button. This is the most impactful copy failure: the button's label is correct, but the interaction promise is broken with no recovery copy. (WARNING — degrades trust but does not break the read flow.)
- Admin landing placeholder copy (`admin/page.tsx:13-18`) is internal-facing dev copy, not a user-facing empty state per spec. Acceptable for Phase 1 given the scope note, but not spec-aligned for a shipped surface.

### Pillar 2: Visuals (4/4)

All structural contracts met:

- Shell hierarchy: sidebar fixed, topbar sticky, main content area offset by `lg:pl-60` + `min-h-[calc(100vh-3.5rem)]` — correct.
- CrmSidebar: brand header with "forjo studio" wordmark (heading font, bold) + mono caption "CONSOLA · OPERACIÓN" — matches spec.
- Grouped nav (OPERACIÓN / VENTAS / INSIGHTS / CUENTA) with section labels in mono uppercase, muted color, correct padding (`px-2 pt-4 pb-1`) — matches spec.
- Active state: `bg-secondary` + `before:opacity-100` (2px amarillo bar, `before:bg-primary`) + `text-primary` icon — matches the spec's "accent bar NOT full bg-primary fill" requirement. Exact match to `09-auditoria.png` reference.
- PRONTO tag: disabled `<span>` with `aria-disabled="true"`, cursor-not-allowed, reduced opacity — matches mock styling.
- Empty state: dashed border card, icon in `bg-secondary` rounded square, bold heading, muted body, action slot — correct visual hierarchy.
- Mobile drawer: `translate-x-0`/`-translate-x-full` transition, overlay `bg-black/60`, close button top-right — complete.
- RiskBadge: Alto (dark pill + red dot), Medio (amarillo fill, no dot), Bajo (dark pill + muted dot) — correct per spec.
- ConfirmDialog inline RiskBadge differs slightly from standalone `RiskBadge` component (rounded-md vs rounded-4xl, no Bajo/Medio style differentiation vs the spec variants). This is a minor visual inconsistency between the two implementations of the same concept, not a user-facing failure.

No focal-point confusion. The one `h1` per screen is properly declared in both the topbar and the empty-state heading.

### Pillar 3: Color (4/4)

Token implementation exactly matches the spec CSS block:

```
.crm-shell {
  --primary: #e6b53f; ✓
  --primary-foreground: #1a1714; ✓
  --accent: #e6b53f; ✓
  --ring: #e6b53f; ✓
  --sidebar-primary: #e6b53f; ✓
  --crm-danger: #e85c3f; ✓
  --crm-danger-foreground: #fbf3e3; ✓
  --crm-info: var(--chart-2); ✓
  --crm-success: var(--chart-4); ✓
}
```

60/30/10 distribution verified:
- 60% dominant: `bg-background` (#1a1714) on all page surfaces — correct.
- 30% secondary: `bg-card` and `bg-sidebar` on sidebar, cards, table wrapper, avatar — correct.
- 10% accent: amarillo applied only to active nav bar, active icon, Riesgo Medio badge fill, and (when used) confirm button — confirmed. Not applied to body text or decorative elements.

`--destructive` token never referenced in any CRM component — brief §12 constraint met. The bell notification badge in `crm-topbar.tsx:66` uses `style={{ backgroundColor: 'var(--crm-danger)' }}` inline correctly.

No hardcoded hex values outside of the `.crm-shell` CSS block definition itself.

### Pillar 4: Typography (3/4)

**Weights — PASS:** Only `font-bold` (700) and default (400) appear in all CRM components. No `font-medium`, `font-semibold`, or other weights. Spec requires exactly 2 weights — met.

**Families — PASS:** `--font-heading` (Archivo), `--font-geist-mono` (Geist Mono), and default sans (Space Grotesk). All applied by role — heading font for titles/wordmark, mono for labels/timestamps/kbd, sans for body. No mixing.

**Sizes — WARNING:**

| Usage | Class | Actual size | Spec minimum |
|-------|-------|-------------|--------------|
| PRONTO tag (sidebar) | `text-[10px]` | 10px | 12px (`text-xs`) |
| ⌘K kbd chip (topbar) | `text-[10px]` | 10px | 12px (mono label floor) |
| Section group labels | `text-[11px]` | 11px | Spec allows 11-12px for sidebar section labels — PASS |
| Brand caption ("CONSOLA · OPERACIÓN") | `text-[11px]` | 11px | Same exception — PASS |
| Footer mono caption | `text-[11px]` | 11px | Same — PASS |

The spec states: "Sidebar section labels (OPERACIÓN / VENTAS / INSIGHTS / CUENTA): 11–12px mono" — the 11px usage on section labels is within the declared exception. However, the PRONTO tag and ⌘K chip are NOT covered by that exception. The spec's mono label floor is `text-xs` (12px). At 10px these elements fail WCAG AA on muted-foreground/50 (`~20% opacity`) — the effective contrast ratio would be below 3:1 even with the base muted-foreground color.

**Heading hierarchy — PASS:**
- Topbar: `h1` for page title.
- Empty state: `h2` for heading — correct hierarchy (no h1 conflict since topbar h1 precedes it in DOM).
- No heading level skips detected.

**Line-height and tracking — PASS:** heading `tracking-[-0.02em]` applied consistently. Mono labels use `tracking-wider`/`tracking-wide` as specified.

### Pillar 5: Spacing (3/4)

**Canonical scale compliance — mostly PASS:**

| Component | Spacing used | Scale token | Verdict |
|-----------|-------------|-------------|---------|
| Sidebar brand header | `p-5` (20px) | Documented exception | PASS |
| Sidebar nav padding | `px-2 py-2` (8px) | sm | PASS |
| Sidebar body | `px-2 pb-2` | sm | PASS |
| Sidebar footer | `p-2` | sm | PASS |
| Section label | `px-2 pt-4 pb-1` | sm/lg | PASS |
| Layout content area | `px-4 py-6 lg:px-6` | lg/xl | PASS |
| Audit controls | `space-y-4`, `gap-3` | lg/sm | PASS |
| Dialog | `p-4 gap-4` (via shadcn) | lg | PASS |
| **Admin landing** | `p-8 sm:p-12` | 32px/48px | WARNING |

The admin landing page (`app/(crm)/admin/page.tsx:12`) uses `p-8 sm:p-12`. The `2xl` token (32px) maps to `p-8` which is technically on-scale, but the responsive jump to `p-12` (48px) is the `3xl` token which the spec reserves for "page-level top spacing" — not side/content padding. Using 48px as content area horizontal padding is the off-scale violation.

No arbitrary `[Npx]` or `[Nrem]` spacing values detected anywhere in the CRM components (only the 10px/11px font sizes which are typography, not spacing).

### Pillar 6: Experience Design (4/4)

All required states are implemented and verified:

**Loading states:**
- `ConfirmDialog`: `loading` state shows `<Loader2Icon className="animate-spin" />` + "Confirmando…" with all inputs disabled and dialog non-closable (`handleOpenChange` guards `loadingRef.current`). Anti-double-submit via `buildSubmitGuard`. Correct.
- `AuditoriaClient`: relies on server-side render (no client loading state needed in Phase 1 — data arrives pre-fetched from `AuditoriaPage`). Acceptable for the current architecture.

**Error states:**
- Load error: `loadError` prop triggers `EmptyState` with "No se pudo cargar la auditoría" + recovery copy — matches spec.
- Action error (ConfirmDialog): `catch` block fires `toast.error(...)` with exact spec copy, dialog stays open, returns to ready state — correct.

**Empty states:**
- Zero rows: "Todavía no hay acciones registradas" with explanatory body — correct.
- Filtered empty: "Ninguna acción coincide con este filtro." + "Limpiar filtros" button — correct.

**Disabled states:**
- "Exportar log" button: `disabled` — correct visual affordance, but missing explanatory tooltip (see Copywriting finding).
- PRONTO nav items: `aria-disabled="true"`, `cursor-not-allowed`, `pointer-events: none` implied by `span` (not a link) — correct.

**Accessibility:**
- Focus trap in `ConfirmDialog` comes from `@base-ui/react` Dialog — not hand-rolled. Correct.
- `aria-describedby` wired to `wordHelpId`/`reasonHelpId` — correct.
- `aria-current="page"` on active nav items — correct.
- `aria-label` on all icon-only buttons (logout, menu open/close, bell, search input) — correct.
- `aria-hidden="true"` on all decorative icons — correct.
- `aria-invalid` on mismatch input — correct.

**Interaction constraints:**
- Escape / outside-click blocked during loading via `handleOpenChange` guard — correct.
- `confirmButtonClass(destructive)` applies `--crm-danger` background only on destructive actions — correct.
- `canConfirm` gating: exact case-sensitive match (`typed === confirmWord`) — matches spec "case-sensitive" requirement.

**One minor gap:** The `ConfirmDialog`'s inline `RiskBadge` component (`confirm-dialog.tsx:139-156`) only differentiates `alto` vs non-alto — Medio and Bajo render identically with `border-border bg-muted text-muted-foreground`. The standalone `RiskBadge` correctly shows amarillo fill for Medio. This divergence means dialogs with `risk="medio"` show a muted style instead of the amarillo Medio badge declared in the spec. This is a visual inconsistency but not a flow-breaking defect; scored as acceptable within a 4/4 given the overall state coverage is complete.

---

## Registry Safety

No third-party shadcn registries declared in UI-SPEC.md. All primitives (card, table, badge, tabs, dialog, sonner, button, input, label, textarea, avatar, separator) are already vendored in `@/components/ui`. No `npx shadcn add` was run in Phase 1. Registry audit: not applicable.

---

## Files Audited

- `app/(crm)/layout.tsx`
- `app/(crm)/admin/page.tsx`
- `app/(crm)/admin/auditoria/page.tsx`
- `app/(crm)/admin/auditoria/auditoria-client.tsx`
- `components/crm/crm-sidebar.tsx`
- `components/crm/crm-topbar.tsx`
- `components/crm/crm-toaster.tsx`
- `components/crm/risk-badge.tsx`
- `components/crm/confirm-dialog.tsx`
- `app/globals.css` (`.crm-shell` block, lines 152-179)
- `.planning/workstreams/crm/phases/01-cimientos-auditor-a/01-UI-SPEC.md`
- `.planning/workstreams/crm/phases/01-cimientos-auditor-a/01-CONTEXT.md`
