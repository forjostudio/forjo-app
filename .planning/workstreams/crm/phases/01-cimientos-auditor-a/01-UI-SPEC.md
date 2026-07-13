---
phase: 1
slug: 01-cimientos-auditor-a
status: draft
shadcn_initialized: true
preset: "base-nova (neutral, CSS variables) — components.json existente"
created: 2026-06-17
---

# Phase 1 — UI Design Contract

> Visual and interaction contract for the CRM **foundation shell** (FND-04) + reusable primitives (ConfirmDialog FND-03, audit table/badges). The actual data screens (directorio, ficha, pipeline, reportes, bandeja) are OUT OF SCOPE for this phase and get their own UI-SPECs in Phases 2–6.
> Design is ALREADY APPROVED (brief §11, 2026-06-17). Source of visual truth: `crm-design/01-dashboard.png`, `crm-design/09-auditoria.png`, `crm-design/Forjo Consola CRM (offline).html`. This contract reproduces them faithfully; it does not re-decide layout/palette/typography.

---

## Phase 1 UI Scope

| In scope (lock here) | Out of scope (later phases) |
|----------------------|------------------------------|
| CRM shell: route group `app/(crm)/`, `CrmSidebar` (grouped, NEW), top bar, main content area | Directorio + ficha de negocios (Phase 2) |
| Forced dark, scoped to CRM subtree (no global next-themes mutation) | KPI cards with real data, alerts (Phase 2) |
| CRM accent remap (`--primary`→amarillo, info→azul, danger→un solo rojo) | Impersonation banner (Phase 3) |
| `ConfirmDialog` escalonado (FND-03) — all levels + states | Pipeline board, tags, timeline (Phase 4) |
| Reusable primitives styling: cards, tables, badges (incl. **Riesgo** Alto/Medio/Bajo), tabs, toasts | Reportes / charts (Phase 5), Bandeja (Phase 6) |
| Audit-log table + **Riesgo**/**Motivo** columns look (per `09-auditoria.png`) — component contract locked, basic viewer page optional | — |

**Audit viewer decision (Claude's discretion, D-context):** Phase 1 ships the shell + reusable primitives AND a basic read-only audit-viewer page at `/admin/auditoria` that exercises the table + Riesgo badge + filter tabs contracts (it has real rows once `logAudit` runs). This avoids shipping dead components and gives Phase 2+ a proven table. The KPI/dashboard cards are styled as primitives but wired to real data only in Phase 2.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (already initialized — `components.json`, style `base-nova`, baseColor `neutral`, CSS variables) |
| Preset | not re-run; reuse existing config. **Zero new npm packages** (D-context). |
| Component library | base-ui (`@base-ui/react` ^1.5.0) — Dialog, Tabs primitives; shadcn wrappers in `@/components/ui` |
| Icon library | `lucide-react` ^1.17.0 (single icon system — never mix) |
| Font | Forjo default: `--font-heading` = Archivo (headings, tight `-0.02em`), `--font-sans` = Space Grotesk (body). Mono (`--font-geist-mono`) for KPI labels + audit timestamps (see Typography). Do NOT set `data-theme`/`data-font` in the CRM — inherit the Forjo default. |

**Theming anchor (D6, FND-04):**
- CRM is NOT themeable. Wrap the CRM subtree in `<div className="dark crm-shell">` (or `[data-surface="crm"]`) in `app/(crm)/layout.tsx`. This forces the `.dark` tokens (`globals.css:107-132`) locally via the `&:is(.dark *)` variant WITHOUT mutating `next-themes` global state or touching `PaletteScript` — preserves per-business dashboard theming (Pitfall 5).
- Do NOT add `data-palette` to the CRM (that is per-business). The CRM defines its own accent remap (see Color → CRM accent remap block).
- **Toaster (A4 open):** mount a CRM-scoped `<Toaster theme="dark" />` inside the CRM layout so toasts match the dark shell, instead of inheriting the global light Toaster. Low-risk; resolve final placement in plan-phase.

---

## Spacing Scale

8-point scale (multiples of 4). Derived from existing component padding (card `py-4 px-4`, table `h-10 px-2 p-2`, dialog `p-4 gap-4`) and the captures.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, badge dot spacing, inline padding (`gap-1`) |
| sm | 8px | Compact spacing: table cell padding (`p-2`), nav item padding (`px-2 py-2`), sidebar footer padding (`p-2`), nav item gaps |
| lg | 16px | Default element spacing: card padding, dialog padding (`p-4 gap-4`), section gaps, sidebar body padding (`p-4`) |
| xl | 24px | Card-to-card grid gap, content area padding |
| 2xl | 32px | Major section breaks (KPI row → pipeline row) |
| 3xl | 48px | Page-level top spacing |

Exceptions:
- 20px (`p-5`) for the sidebar brand header block (matches existing `components/dashboard/sidebar.tsx:68`) — preserve for visual parity.
- Touch targets: nav items and icon buttons must be ≥ 40px tall on mobile (`py-2` + icon ≈ 40px); icon-only buttons use `size-icon` (36px) on desktop, bumped to 44px min on touch.

---

## Typography

Forjo type system (3 families used by role, ≤ 3 sizes per surface). Headings = Archivo, body = Space Grotesk, **mono = Geist Mono for KPI labels + audit timestamps** (visible in both captures as the spaced uppercase labels and the `Hoy · 13:22` timestamps).

| Role | Size | Weight | Line Height | Font |
|------|------|--------|-------------|------|
| Display (KPI number) | 36px / `text-4xl` | 700 (bold) | 1.1 | heading (Archivo) |
| Heading (page title, card title) | 16px / `text-base` | 700 (bold) | 1.2 | heading (Archivo), `letter-spacing -0.02em` |
| Body / table cell | 14px / `text-sm` | 400 (regular) | 1.5 | sans (Space Grotesk) |
| Label / caption (mono) | 12px / `text-xs` | 400 (regular) | 1.2, `tracking-wide` uppercase | mono (Geist Mono) — KPI labels (`MRR`, `NEGOCIOS ACTIVOS`), audit column headers, timestamps, breadcrumb. Differentiated from body by UPPERCASE + letter-spacing + muted color + mono family, NOT by weight. |

> **Exactly 2 font weights: 400 (regular) and 700 (bold).** Hierarchy is carried by size, UPPERCASE/mono treatment, letter-spacing, and color — never a third weight. The dark premium look does not need a medium weight.

Rules:
- Body text never below 14px (`text-sm`); mono labels at 12px are non-body (labels/timestamps only).
- Sidebar section labels (OPERACIÓN / VENTAS / INSIGHTS / CUENTA): 11–12px mono, uppercase, `tracking-wider`, `text-muted-foreground`.
- Max 3 sizes per screen beyond the labels; do NOT introduce ad-hoc font sizes.
- The typographic overlap visible in the mock ("$3.24M" overlapping "ARS") is a CSS artifact of the prototype — do NOT replicate (brief §11 fix).

---

## Color

CRM runs on the Forjo **dark** neutrals with a deliberately divergent accent: **amarillo primary** (the app's primary is rojo — the CRM overrides it). One single red, reserved for danger only. `--destructive` token is NOT used for CRM danger (brief §12).

| Role | Value (dark) | Usage |
|------|--------------|-------|
| Dominant (60%) | `--background` `#1a1714` (ink) | Page background, main content area |
| Secondary (30%) | `--card` `#252019`, `--sidebar` `#141110`, `--secondary` `#2e2820` | Cards, sidebar, nav surfaces, table rows |
| Accent / primary (10%) | **amarillo `#e6b53f`** (dark; `#f4c543` light ref = `--chart-3`) | See "Accent reserved for" |
| Info | azul `#2a5fa5` (`--chart-2`; dark `#7aa6d6`) | Info badges, info trend sparkline, "Calificado"/Trial stage markers |
| Success | verde `#54b07f` (`--chart-4`) | Positive deltas, "active"/pago stage markers |
| Danger (single red) | **`#e85c3f`** (dark; `#d94a2b` light) | Danger ONLY — Riesgo Alto dot, destructive confirm button, "pagos fallidos" trend, suspend action. NOT `--destructive`. |

**Accent (amarillo) reserved for:**
- Active sidebar nav item (left accent bar + filled background).
- Riesgo **Medio** badge (filled yellow pill).
- Primary CTA button background (e.g. confirm button in non-destructive dialogs).
- Focus ring (`--ring`) across CRM interactive elements.
- KPI "MRR" / positive-emphasis sparkline accent.
- NEVER applied to all interactive elements or body text.

**CRM accent remap (CSS — document next to the palettes in `app/globals.css`, scoped, do NOT touch root/dashboard tokens):**

```css
/* CRM shell — divergent accent: amarillo primary, single red for danger.
   Scoped so it never leaks into the dashboard/booking surfaces. The subtree
   also carries `dark`, so dark neutrals apply via &:is(.dark *). */
.crm-shell {
  /* primary → amarillo (NOT the app's rojo). primary-foreground = ink for contrast. */
  --primary: #e6b53f;
  --primary-foreground: #1a1714;
  --accent: #e6b53f;
  --accent-foreground: #1a1714;
  --ring: #e6b53f;
  --sidebar-primary: #e6b53f;
  --sidebar-primary-foreground: #1a1714;
  --chart-1: #e6b53f;

  /* CRM danger = un solo rojo de marca (NOT --destructive). Exposed as a token
     so danger variants reference it explicitly. */
  --crm-danger: #e85c3f;
  --crm-danger-foreground: #fbf3e3;

  /* info / success reference existing Bauhaus constants (already dark-aware) */
  --crm-info: var(--chart-2);     /* azul */
  --crm-success: var(--chart-4);  /* verde */
}
```

Contrast: amarillo `#e6b53f` on ink `#1a1714` ≈ 8.9:1 (text/icon on accent uses ink foreground → passes AA). Red `#e85c3f` on ink passes AA for large text/icon use (badge dot + button bg with cream foreground). All body text uses `--foreground` `#f3ead8` on `--background` (≈ 13:1).

---

## Component Contracts (shell + reusable primitives)

Reuse existing `@/components/ui/*` verbatim; CRM-specific styling is composition + the accent remap. No fork of base components.

### CrmSidebar (NEW — `components/crm/crm-sidebar.tsx`)
Do NOT reuse `components/dashboard/sidebar.tsx` (flat, business-scoped via `buildNav(business)` + vertical terminology). Build a new grouped sidebar.

- Surface: `bg-sidebar` `#141110`, right border `--sidebar-border`, fixed width `w-60` desktop / drawer on mobile (mirror dashboard sidebar's mobile pattern).
- Brand header (`p-5`, bottom border): "**forjo** studio" wordmark (heading font, `forjo` bold) + mono caption "CONSOLA · OPERACIÓN".
- Grouped nav: section labels (mono uppercase, `tracking-wider`, `text-muted-foreground`, `px-2 pt-4 pb-1`) over groups:
  - **OPERACIÓN** → Dashboard, Bandeja
  - **VENTAS** → Pipeline, Negocios
  - **INSIGHTS** → Reportes, Auditoría
  - **CUENTA** → Planes y precios, Ajustes
  - In Phase 1 only Dashboard (placeholder) and **Auditoría** route to real pages; the rest render as navigable placeholders or `PRONTO`-tagged disabled items (Claude's discretion — match the mock's `PRONTO` tag styling).
- Nav item: `flex items-center gap-3 px-2 py-2 rounded-lg text-sm` (400 regular). Default `text-muted-foreground hover:bg-secondary hover:text-foreground`. **Active**: filled `bg-secondary`/elevated + `text-foreground` (active state differentiated by background + accent bar + color, NOT a heavier weight) + a 2px **amarillo** left accent bar (`before:` pseudo or border-l-2 in `--primary`) + the icon tinted amarillo. (Note: the active state uses amarillo as the marker, NOT a full `bg-primary` fill — that would over-saturate; match `09-auditoria.png` where "Auditoría" has the yellow bar.)
- Lucide icon per item (16px / `w-4 h-4`), left-aligned.
- Optional numeric badge (count) right-aligned per item (e.g. Bandeja `3`, Pipeline `13`) — small mono, `text-muted-foreground`.
- Footer (`p-2`, top border): user block (avatar initials in a rounded square, name + "Operador · dueño" mono caption) + logout icon button.
- States required on every interactive item: default / hover / focus-visible (amarillo ring) / active(current route). No hover-only feedback.

### Top bar (`components/crm/crm-topbar.tsx` or in layout)
- Page title (heading font) + mono breadcrumb (`Operación · Overview · Q2 2026` style).
- Global search input (`Buscar en todo…`) with `⌘K` hint chip, leading search icon.
- Theme toggle icon + notifications bell with count badge (the bell count badge uses the **single red** dot).

### Card (reuse `@/components/ui/card.tsx`)
- KPI card: mono uppercase label (12px), large display number (`text-4xl` heading), trend sparkline top-right (recharts, accent-colored per metric), delta line with directional arrow (`↑`/`↓`) colored success/danger.
- Default card: `bg-card`, `rounded-xl`, `ring-1 ring-foreground/10` (existing). Section header = card title (heading) + optional mono subtitle.
- "Pagos fallidos" KPI gets a red top accent rule (the mock shows a thin red line) — use `--crm-danger`.

### Table (reuse `@/components/ui/table.tsx`) — audit-log look (`09-auditoria.png`)
- Column headers: mono uppercase 12px, `text-muted-foreground`, `h-10 px-2`, left-aligned (`QUIÉN / ACCIÓN / NEGOCIO / DETALLE / MOTIVO / CUÁNDO / RIESGO`).
- Row: `border-b`, `hover:bg-muted/50` (existing), `p-2` cells, 14px body.
- **QUIÉN** cell: small avatar/icon + actor name ("Operador" / "Sistema" with a distinct system icon).
- **ACCIÓN** cell: bold label ("Cambió plan", "Suspendió negocio", "Impersonó negocio").
- **DETALLE** + **MOTIVO**: muted body text, mono where it's a value transition (`Básico → Pro`, `$22.000 → $24.000`).
- **CUÁNDO** cell: mono timestamp, `text-muted-foreground` (`Hoy · 13:22`, `Ayer · 17:05`, `14 jun · 09:12`).
- **RIESGO** cell: Riesgo badge (see below), right-aligned column.
- Above the table: search input (`Buscar acción, negocio…`) + filter tabs (Todos / Altos / Medios / Bajos) + `Exportar log` outline button (right).
- Note: audit data references `recordatorios WhatsApp`, never "SMS" — the mock's "Recordatorios SMS" row is a fix to apply (brief §11): use "WhatsApp".

### Badge — Riesgo (reuse `@/components/ui/badge.tsx` + CRM variants)
Add CRM-scoped risk variants (via `cn` overrides or a `riskBadgeVariants` cva in `components/crm/`, NOT by editing the shared badge):

| Riesgo | Style | Reference |
|--------|-------|-----------|
| **Alto** | dark pill (`bg-secondary` / outline), `text-foreground`, leading **red dot** (`--crm-danger`) | `09-auditoria.png` rows "Suspendió/Editó/Impersonó" |
| **Medio** | filled **amarillo** pill (`bg-primary text-primary-foreground` ink), no dot or amarillo dot | "Cambió plan" row |
| **Bajo** | dark pill, `text-muted-foreground`, leading neutral/muted dot | "Extendió trial", "add-on" rows |

Generic status badges keep existing variants (`secondary`/`outline`); destructive-domain badges use `--crm-danger`, never the `--destructive` token.

### Tabs (reuse `@/components/ui/tabs.tsx`)
- Filter tabs (Todos/Altos/Medios/Bajos) use the `default` variant: `bg-muted` track, active tab `data-active:bg-background` + amarillo text/indicator. Active = amarillo, matching `Todos` highlighted in `09-auditoria.png`.

### Toasts (reuse `@/components/ui/sonner.tsx`)
- CRM mounts a dark-themed Toaster (see Theming anchor). Uses existing icon set (success/info/warning/error/loading). Position top-right desktop. Success confirms the action + next step; error states say what failed + how to recover.

---

## ConfirmDialog escalonado (FND-03 — `components/crm/confirm-dialog.tsx`)

Reusable type-to-confirm dialog over the existing `@base-ui/react` Dialog (`@/components/ui/dialog.tsx`). Preserve the prototype levels (brief §11). **Disabled-UI is reinforcement only — the real guarantee is server-side (`requireAdmin()`, D4); the dialog never authorizes anything.**

### Levels (locked)

| Level | Trigger example | Mechanism | Confirm word | Reason field |
|-------|-----------------|-----------|--------------|--------------|
| `simple` | Cambiar plan | single confirm button | — | no |
| `type-word` | Suspender | type exact word | `SUSPENDER` | no |
| `type-word` | Impersonar | type exact word | `VER` | **yes** (motivo obligatorio) |
| `type-word` | Editar precio | type exact word | `CONFIRMAR` | no |

(Impersonation's reason field is exercised in Phase 3 but the prop contract is locked here.)

### Props contract
`open`, `onOpenChange`, `title`, `description`, `confirmWord?` (undefined ⇒ simple), `requireReason?: boolean`, `risk: 'alto'|'medio'|'bajo'`, `confirmLabel`, `destructive?: boolean`, `onConfirm(reason?) => Promise<void>`.

### States (locked)

| State | Visual | Confirm button |
|-------|--------|----------------|
| default | dialog open, inputs empty, risk badge shown in header (Riesgo Alto/Medio/Bajo) | disabled (if `confirmWord` or `requireReason`) / enabled (simple) |
| typing | user typing the confirm word; field neutral border | disabled until exact match |
| word-mismatch | typed ≠ word: field gets red border + helper text `Escribí "{word}" para confirmar` (mono, `--crm-danger`) | disabled |
| word-match | typed === word | enabled (unless reason still required) |
| reason-empty | `requireReason` and textarea blank | disabled + helper `El motivo es obligatorio` |
| reason-ok + word-ok | both satisfied | enabled |
| loading | after click: button shows spinner + label "Confirmando…", inputs disabled, dialog not closable | disabled (prevents double-submit) |
| error | server action fails | toast error (`No se pudo completar la acción. {motivo}`) + dialog stays open, returns to ready state |

- Confirm button: when `destructive` true → background `--crm-danger` with cream foreground; otherwise amarillo primary (ink foreground).
- Word input: monospace, autofocus, exact case-sensitive match against `confirmWord`.
- Cancel always available (Escape, X, outside click) — except during `loading`.
- Risk badge in the dialog header reuses the Riesgo badge contract above.
- A11y: focus trap + Escape + portal come free from base-ui Dialog (do not hand-roll). Confirm button `disabled` is mirrored with `aria-disabled`; helper text wired via `aria-describedby`.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA (audit page) | "Exportar log" |
| Filter tabs | Todos · Altos · Medios · Bajos |
| Search placeholders | Top bar: "Buscar en todo…" · Audit: "Buscar acción, negocio…" |
| Empty state heading (audit) | "Todavía no hay acciones registradas" |
| Empty state body (audit) | "Cuando ejecutes una acción sensible (cambiar plan, suspender, impersonar) va a aparecer acá con quién, qué, cuándo y motivo." |
| Empty state (filtered, no match) | "Ninguna acción coincide con este filtro." + acción "Limpiar filtros" |
| Guard redirect (no copy/UI) | No partial render — server-side `redirect('/dashboard')`; user never sees `/admin` chrome (FND-01). |
| Error state (action fails) | "No se pudo completar la acción. Probá de nuevo o revisá tu conexión." (toast) |
| ConfirmDialog — Suspender | Title "Suspender negocio" · desc "El negocio deja de operar hasta reactivarlo. Escribí SUSPENDER para confirmar." · confirm "Suspender" (destructive) |
| ConfirmDialog — Impersonar | Title "Ver como cliente" · desc "Vas a ver este negocio en SOLO LECTURA. Escribí VER y dejá un motivo." · reason placeholder "Motivo del acceso (ej. soporte: revisar config)" · confirm "Ver como cliente" |
| ConfirmDialog — Editar precio | Title "Editar precio del plan" · desc "Editar el precio no altera suscripciones activas sin aviso. Escribí CONFIRMAR." · confirm "Confirmar" |
| ConfirmDialog — Cambiar plan | Title "Cambiar plan" · desc "Vas a cambiar el plan de este negocio. Queda registrado en auditoría." · confirm "Cambiar plan" (simple) |
| Toast success (generic) | "Listo. La acción quedó registrada en auditoría." |

Microcopy rules: action buttons = verbo + sustantivo ("Exportar log", "Ver como cliente"), never "Aceptar"/"OK". Labels always visible (no placeholder-as-label). Errors say what + how to recover.

---

## Accessibility & Interaction (non-negotiable)

- All interactive elements: default / hover / focus-visible / active / disabled states. Focus-visible ring = amarillo (`--ring`), 3px. No hover-only affordances (mobile has no hover).
- Mobile-first: sidebar collapses to a drawer < `lg`; nav/icon targets ≥ 44px on touch.
- Contrast ≥ 4.5:1 body text, ≥ 3:1 large text/icons (verified above for amarillo/red on ink).
- Heading hierarchy: one page `h1` (page title) → card titles `h2`/`h3`; no level skips.
- Dialog: focus trap, Escape, outside-click close (except loading), `aria-describedby` for helper text.
- Animations ≤ 300ms, `transform`/`opacity` only (existing dialog uses `data-open:animate-in` zoom/fade — reuse). Loading > 300ms → spinner in confirm button; tables that fetch use existing skeleton/row patterns.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official (already vendored in `@/components/ui`) | card, table, badge, tabs, dialog, sonner, button, input, label, textarea, avatar, separator | not required (already in repo, no fetch) |
| third-party | none | not applicable |

No third-party registries declared. No `npx shadcn add` / `view` needed — all primitives already exist in the repo and are reused verbatim. Zero new npm packages (D-context confirmed).

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
