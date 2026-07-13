---
phase: 2
slug: 02-admin-de-plataforma
status: approved
shadcn_initialized: true
preset: "base-nova (neutral, CSS variables) — components.json existente, reusa Phase 1"
created: 2026-06-18
reviewed_at: 2026-06-18
---

# Phase 2 — UI Design Contract

> Visual and interaction contract for the **Admin de Plataforma** data screens (ADM-01..07, ALERT-01). This phase **EXTENDS** the LOCKED Phase 1 design system (`01-UI-SPEC.md`) — it does NOT invent a new one. The CRM shell, dark theme, amarillo/azul/rojo accent remap, Archivo/Space Grotesk/Geist Mono type scale, 8pt spacing, ConfirmDialog escalonado, Riesgo/Status badges, table/card/tabs/sonner contracts and `CrmSidebar` are inherited verbatim from Phase 1.
> Design is ALREADY APPROVED (brief §11). Source of visual truth for the NEW screens: `crm-design/01-dashboard.png` (Dashboard), `crm-design/03-negocios.png` (Directorio), `crm-design/04-ficha-resumen.png` (Ficha), `crm-design/08-planes.png` (Planes y precios), `crm-design/Forjo Consola CRM (offline).html` (interaction reference). Reproduce them faithfully; do not approximate.

---

## Phase 2 UI Scope

| In scope (lock here) | Inherited from Phase 1 (do NOT re-spec) | Out of scope (later phases) |
|----------------------|------------------------------------------|------------------------------|
| Dashboard `/admin` — 4 KPI cards (real data) + lista de alertas clickeables → ficha | CRM shell, `CrmSidebar`, top bar, dark theme, accent remap | Impersonación read-only (Phase 3) |
| Directorio `/admin/negocios` — tabla buscable + filtros (plan, estado incl. suspendido, trial por vencer, pagos fallidos) | `ConfirmDialog` escalonado (todos los niveles) | Pipeline / tags / timeline (Phase 4) |
| Ficha `/admin/negocios/[id]` — contacto, suscripción, plan, add-ons (toggles), acciones | Riesgo badges, table/card/tabs/sonner contracts | Reportes / charts (Phase 5) |
| Editor de precios `/admin/planes` — cards de plan editables + ConfirmDialog "CONFIRMAR" | Copywriting base (ConfirmDialog copy ya lockeado) | Bandeja / comms (Phase 6) |
| NEW components: `KpiCard`, `AlertList`, `StatusBadge`, `AddonToggle`, `ExtendTrialDialog`, `PlanPriceCard` | Typography, spacing, color tokens | Pipeline "Próximas actividades" / "Actividad reciente" del mock dashboard |

**Mock-vs-data reconciliation (CRITICAL — the mocks are a MOCK, the locked decisions are the data truth):**
- **Plans (`08-planes.png`):** the mock shows "Básico / Pro / **Equipo**" at **$12.000 / $24.000 / $48.000**. These labels and amounts are NOT data truth. The real 3 plan keys are `basic` / `studio` / `pro` → display **Básico / Estudio / Pro**, seeded at **ARS 15.000 / 30.000 / 50.000** (`plan_prices` table, migración 032, from `lib/subscription-plans.ts`). Render the mock's card layout faithfully with the REAL keys/amounts.
- **Add-ons (`04-ficha-resumen.png` + `08-planes.png`):** the mocks show 4 add-ons incl. "**Recordatorios SMS**". In v1 there are exactly **2** add-on flags (D-08): `has_web_custom` → display **"Web a medida"**, `has_whatsapp` → display **"Recordatorios WhatsApp"**. NEVER render "SMS", "Reportes avanzados", "Multi-sucursal" or "Acceso API" as toggleable add-ons (those are plan features, not v1 add-on flags). Apply the brief §11 fix: SMS → WhatsApp everywhere.
- **Dashboard pipeline/activity blocks (`01-dashboard.png`):** "Pipeline por etapa", "Próximas actividades", "Actividad reciente" are Phase 4/6 surfaces — render the 4 KPI cards + alerts row only in Phase 2. Do NOT build the pipeline/activity blocks here.
- **MRR sparklines + "+12.4% vs mes anterior" deltas:** historical data is NOT persisted in v1 (deferred to v2, D-03). Show the real current KPI number; **omit or neutralize the "vs mes anterior" delta and trend sparkline** (no data source). The card layout keeps the sparkline slot empty or a flat/decorative line — never a fabricated trend.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (already initialized — `components.json`, style `base-nova`, baseColor `neutral`, CSS variables). Inherited from Phase 1. |
| Preset | not re-run; reuse existing config. **Zero new npm packages** (D-context / RESEARCH §Standard Stack confirm). |
| Component library | base-ui (`@base-ui/react` ^1.5.0) — Dialog, Tabs, Switch primitives; shadcn wrappers in `@/components/ui` |
| Icon library | `lucide-react` ^1.17.0 (single icon system — never mix) |
| Font | Inherited Forjo default: `--font-heading` = Archivo (headings, `-0.02em`), `--font-sans` = Space Grotesk (body), `--font-geist-mono` (mono) for KPI labels, table headers, timestamps, value transitions. Do NOT set `data-theme`/`data-font` in the CRM. |

**Theming anchor (inherited, do NOT re-decide):** all Phase 2 screens render inside the Phase 1 CRM subtree `<div className="dark crm-shell">` (`app/(crm)/layout.tsx`). The accent remap (amarillo primary, azul info, verde success, single red `--crm-danger`) and the dark neutrals apply automatically. New screens add NO global theme mutation. The dark `<Toaster>` (`CrmToaster`) is already mounted — Phase 2 actions emit toasts into it.

---

## Spacing Scale

Inherited 8-point scale from Phase 1 (multiples of 4). No new tokens.

| Token | Value | Usage in Phase 2 |
|-------|-------|------------------|
| xs | 4px | Icon gaps, badge dot spacing, KPI delta arrow gap |
| sm | 8px | Table cell padding (`p-2`), filter-tab gaps, toggle row inner padding, contact icon gap |
| lg | 16px | Card padding, dialog padding (`p-4 gap-4`), contact-block gaps, ficha section gaps |
| xl | 24px | KPI card-to-card grid gap, plan-card grid gap, content area padding, ficha two-column gap |
| 2xl | 32px | KPI row → directory/alerts block break |
| 3xl | 48px | Page-level top spacing |

Exceptions (inherited):
- 20px (`p-5`) sidebar brand header — unchanged.
- Touch targets: filter tabs, toggles, table row affordances, and the alert list items must be ≥ 44px tall on touch; add-on switches use the base-ui Switch min hit area bumped to 44px on touch.

---

## Typography

Inherited Forjo type system (3 families by role, ≤ 3 sizes per surface, exactly **2 weights: 400 + 700**). No new sizes or weights. Phase 2 role mapping:

| Role | Size | Weight | Line Height | Font | Phase 2 usage |
|------|------|--------|-------------|------|---------------|
| Display (KPI number) | 36px / `text-4xl` | 700 | 1.1 | heading (Archivo) | `$3.24M`-style KPI value, `$15.000` plan price in `PlanPriceCard` |
| Heading (page title, card/section title) | 16px / `text-base` | 700 | 1.2 | heading, `-0.02em` | Page title (`Dashboard`/`Negocios`/`Planes y precios`), card titles ("Contacto", "Acciones", "Add-ons"), business name on ficha (larger `text-2xl` allowed only for the ficha hero name, per mock) |
| Body / table cell | 14px / `text-sm` | 400 | 1.5 | sans (Space Grotesk) | Table rows, plan feature list, contact values, add-on labels, alert business name |
| Label / caption (mono) | 12px / `text-xs` | 400 | 1.2, `tracking-wide` UPPER | mono (Geist Mono) | KPI labels (`MRR`, `NEGOCIOS ACTIVOS`, `TRIALS POR VENCER`, `PAGOS FALLIDOS`), table column headers (`NEGOCIO / PLAN / ESTADO / CONTACTO / ADD-ONS / MRR`), breadcrumb, `WHATSAPP · OBLIGATORIO` / `EMAIL · OBLIGATORIO` micro-labels, `ZONA SENSIBLE` label, `/mes` price suffix |

Rules (inherited):
- Body never below 14px; mono labels at 12px are non-body only.
- Hierarchy via size + UPPERCASE/mono + letter-spacing + color — never a third weight.
- Ficha hero business name may use `text-2xl` (24px) heading — single dominant element on the ficha, per `04-ficha-resumen.png`.
- Do NOT replicate the prototype's typographic overlap artifact (`$3.24M` over `ARS`, business name wrapping over its tags) — brief §11 fix.

---

## Color

Inherited CRM dark palette + accent remap from Phase 1 (`.crm-shell`). No new color tokens. Phase 2 maps roles to the existing tokens:

| Role | Value (dark) | Phase 2 usage |
|------|--------------|---------------|
| Dominant (60%) | `--background` `#1a1714` | Page background, main content area |
| Secondary (30%) | `--card` `#252019`, `--sidebar` `#141110`, `--secondary` `#2e2820` | KPI cards, plan cards, ficha panels, table rows, contact blocks, alert items |
| Accent / primary (10%) | amarillo `#e6b53f` | See "Accent reserved for" |
| Info | azul `#2a5fa5` (`--crm-info`) | "Trial" status badge, info-toned KPI sparkline slot if shown |
| Success | verde `#54b07f` (`--crm-success`) | "Activo" status badge, "Al día" subscription status, positive KPI delta (if any), enabled add-on toggle track |
| Danger (single red) | `--crm-danger` `#e85c3f` | "Suspendido" / "Churn" status badge, "Pagos fallidos" KPI top accent rule, "pago_fallido" alert dot, "Suspender negocio" button + its `ZONA SENSIBLE` label, destructive ConfirmDialog button. NOT `--destructive`. |

**Accent (amarillo) reserved for (Phase 2 specific — extends Phase 1 list):**
- Active sidebar nav item (Negocios / Planes y precios now route to real pages — same active treatment: left accent bar + filled bg + tinted icon).
- Active filter tab on the directory (`Todos` highlighted) and active tab on the ficha (`Resumen`).
- Primary CTA buttons: "Editar precio" (plan card), "Cambiar plan" / "Extender trial" (ficha actions), "Confirmar" in non-destructive ConfirmDialogs.
- Focus ring (`--ring`) on every interactive element (inputs, tabs, toggles, rows, buttons).
- "MÁS ELEGIDO" badge on the highlighted plan card (filled amarillo pill, ink text) — the `pro`/most-active plan, per mock `08-planes.png`.
- KPI value emphasis where a metric is positive (MRR) — accent the value, not the whole card.
- NEVER applied to all interactive elements, body text, or every status badge.

Contrast (inherited, verified in Phase 1): amarillo on ink ≈ 8.9:1, red on ink passes AA for badge/button use with cream foreground, body `--foreground` `#f3ead8` on `--background` ≈ 13:1. New colored status badges (Activo verde / Trial azul / Suspendido+Churn rojo) use the dark-aware chart tokens — verify each pill's text on its background ≥ 3:1 (large/pill text) at plan-phase.

---

## Component Contracts (NEW for Phase 2 — reuse Phase 1 primitives)

Reuse `@/components/ui/*` and the Phase 1 CRM primitives (`ConfirmDialog`, `RiskBadge`, `CrmSidebar`, `CrmTopbar`, card/table/tabs/sonner) verbatim. Phase 2 adds composition components only.

### KpiCard (NEW — `components/crm/kpi-card.tsx`) — ADM-07
Per `01-dashboard.png` (4 cards in a row).
- Surface: reuse Card (`bg-card`, `rounded-xl`, `ring-1 ring-foreground/10`), `p-4`/`p-5`.
- Mono uppercase label (12px, `text-muted-foreground`): `MRR` / `NEGOCIOS ACTIVOS` / `TRIALS POR VENCER` / `PAGOS FALLIDOS`.
- Display number (`text-4xl` heading, 700): the real computed value. MRR formatted ARS (`$NNN.NNN` or `$N,NM` with es-AR grouping; do NOT show a `$3.24M` + `ARS` overlap — single clean string).
- Sparkline slot top-right: **empty / flat / decorative only** in v1 (no historical data, D-03). If shown, use the metric's tone (MRR amarillo, activos azul, pagos fallidos rojo) but it must NOT imply a fabricated trend.
- Secondary line: a real sub-metric only if derivable in-memory (e.g. `9 ≤ 7d` for trials por vencer, `3 hoy requieren seguimiento`). Omit "+12.4% vs mes anterior" / "+8 este mes" deltas unless the value is truly computed this request — otherwise drop the delta line.
- **"Pagos fallidos" card:** thin top accent rule in `--crm-danger` (per mock).
- Props: `label`, `value`, `tone: 'accent'|'info'|'success'|'danger'|'neutral'`, `sub?` (string), `href?` (optional — clicking the card may navigate to a filtered directory view).

### AlertList (NEW — `components/crm/alert-list.tsx`) — ALERT-01, D-12
Live-derived alert list shown on the dashboard (replaces the mock's "Próximas actividades" block visually; same card chrome).
- Card with heading "Alertas" (heading font) + mono subtitle (e.g. "Requieren acción").
- Each alert = a **clickable row → `/admin/negocios/{id}`** (whole row is the link/affordance; `cursor-pointer`, hover `bg-secondary`, focus-visible amarillo ring, ≥44px tall).
- Row layout: leading status dot (rojo for `pago_fallido`, amarillo for `trial_por_vencer`) + lucide icon + business name (14px body) + mono caption describing the alert (e.g. `Pago fallido` / `Trial vence en 3 días`) + trailing chevron.
- Empty state (no alerts): heading "Todo en orden" + body "No hay negocios con pagos fallidos ni trials por vencer en los próximos 7 días."
- Two alert types only (D-10): `pago_fallido` (derived from `plan_status` cancelled/expired) and `trial_por_vencer` (trial + `trial_ends_at` ≤ 7d). No event table.

### StatusBadge (NEW — `components/crm/status-badge.tsx`) — ADM-01/02
Calques the Phase 1 `RiskBadge` pattern (cva variants, NOT editing the shared badge). Status of a business by `plan_status`.

| Estado | plan_status | Style | Color |
|--------|-------------|-------|-------|
| **Activo** | `active` | dark pill + leading dot | verde `--crm-success` |
| **Trial** | `trial` | dark pill + leading dot | azul `--crm-info` |
| **Suspendido** | `suspended` | filled/outlined pill + leading dot | rojo `--crm-danger` (distinctive — never hidden) |
| **Churn** | `cancelled` / `expired` | dark pill + leading dot | rojo `--crm-danger` (muted variant) |

- Suspended businesses are ALWAYS visible and visibly marked (ADM-01, Pitfall 4) — the badge is the marker; never a filter that hides them.
- Pill text on its color ≥ 3:1; dot carries the hue, text stays `--foreground`/muted where contrast is tight.

### Directory table (`/admin/negocios`) — reuse Table — ADM-01
Per `03-negocios.png`. Reuse `@/components/ui/table.tsx`; styling = Phase 1 audit-table contract.
- Above the table: search input (`Buscar negocio, dueño…`, leading search icon) + filter tabs + an "Exportar CSV" outline button (right). (No "Nuevo negocio" CTA in v1 — businesses are created via signup, not the CRM; omit or disable that mock button unless plan-phase confirms scope.)
- **Filter tabs** (base-ui Tabs, active = amarillo): `Todos {n}` · `Activos {n}` · `Trial {n}` · `Suspendidos {n}` · `Churn {n}`. `Todos` is the default and INCLUDES suspended. Counts are live. (The mock's "TAGS" row — rubro/lead caliente/etc. — is Phase 4 tagging; omit in Phase 2.)
- Columns (mono uppercase headers, `h-10 px-2`, left-aligned): `NEGOCIO` · `PLAN` · `ESTADO` · `CONTACTO` · `ADD-ONS` · `MRR` · (trailing chevron → ficha).
  - **NEGOCIO** cell: avatar (initials in rounded square) + business name (14px, bold-ish via heading at 14? keep 400 + name as link) + mono sub-caption `Dueño · Ciudad` (`text-muted-foreground`).
  - **PLAN** cell: plan display name (Básico / Estudio / Pro).
  - **ESTADO** cell: `StatusBadge`.
  - **CONTACTO** cell: two small icon buttons — email (mailto) + WhatsApp (wa.me) — `--crm-info`/muted tint, ≥44px touch.
  - **ADD-ONS** cell: count of enabled flags (`2 activos` / `1 activo` / `–`). On hover/ficha, the specific add-on names show.
  - **MRR** cell: this business's plan price if `active`, else `–` (trial/churn contribute 0 to MRR).
- Row: `border-b`, `hover:bg-muted/50`, whole row navigates to `/admin/negocios/{id}` (chevron is the visible affordance). Search/filter is client-side (low volume, RESEARCH Pattern 1).

### Ficha de negocio (`/admin/negocios/[id]`) — ADM-02..06
Per `04-ficha-resumen.png`. Composition over Card + Phase 1 primitives.
- **Hero block:** "Volver a negocios" back link (mono + chevron). Avatar + business name (`text-2xl` heading, single dominant element) + `StatusBadge` + mono meta line `Dueño · Ciudad · cliente desde {fecha} · plan {Plan}`. Tags row (rubro/etc.) is Phase 4 — omit or show read-only.
- **Tabs:** `Resumen` (active, amarillo) + `Timeline` (Phase 4 — render disabled/`PRONTO` per Phase 1 sidebar placeholder convention).
- **Two-column layout** (`xl` gap; stacks on mobile):
  - **Left — Contacto + Suscripción card:**
    - "Contacto" section: two blocks (WhatsApp, Email), each with mono micro-label `WHATSAPP · OBLIGATORIO` / `EMAIL · OBLIGATORIO`, the value (14px body), and a trailing send/open icon button. WhatsApp = `businesses.whatsapp` → `wa.me`. Email = owner account email (`auth.users`) with fallback to `notification_email` (RESEARCH Pitfall 6). If a value is missing, show `—` + muted "Sin dato", never a fake address.
    - "Suscripción · MercadoPago" section: `Estado de cobro` → a pill ("Al día" verde / "Suspendido" rojo / "Vencido" rojo — derived from `plan_status` + `subscription_ends_at`); `Plan actual` → `{Plan} · ${price}/mes` (price from `plan_prices`); `ID suscripción` → mono `mp_subscription_id` or `—`.
  - **Right — Acciones + Add-ons card:**
    - "Acciones": two primary (amarillo) buttons side by side — **"Cambiar plan"** (opens ConfirmDialog `simple`) and **"Extender trial"** (opens `ExtendTrialDialog`). Below, a `ZONA SENSIBLE` mono label (rojo) over a full-width **"Suspender negocio"** destructive button (`--crm-danger` bg, cream text → opens ConfirmDialog `type-word` "SUSPENDER"). If already suspended, this button becomes **"Reactivar negocio"** (non-destructive, amarillo — restores `plan_status`).
    - "Add-ons": **exactly 2 toggle rows** (D-08). Each row: add-on label (14px) + mono price/usage caption (optional) + `AddonToggle` switch (right). The two rows: **"Web a medida"** (`has_web_custom`) and **"Recordatorios WhatsApp"** (`has_whatsapp`). NEVER "SMS"/"Reportes avanzados"/"Multi-sucursal"/"Acceso API" here.

### AddonToggle (NEW — `components/crm/addon-toggle.tsx`) — ADM-06
- Reuse base-ui Switch (shadcn `@/components/ui/switch.tsx` if present; otherwise the base-ui primitive). Enabled track = verde `--crm-success`, thumb cream; disabled track = `--secondary`. Focus-visible amarillo ring. ≥44px touch hit area.
- Each toggle fires the `toggleAddon` server action directly (no ConfirmDialog — `bajo` risk per RESEARCH Pattern 3), with optimistic UI + sonner toast on success/error and revert on failure.
- States: off / on / focus / loading (disabled + subtle spinner while the action resolves) / disabled.

### ExtendTrialDialog (NEW — `components/crm/extend-trial-dialog.tsx`) — ADM-04 / D-07
- Built over the base-ui Dialog (same chrome as ConfirmDialog, NOT the type-to-confirm one — extend trial is `bajo` risk, simple confirm).
- Title "Extender trial" + description "Elegí cuántos días sumar o una fecha exacta de fin de trial."
- **Preset chips:** `+7 días` · `+14 días` · `+30 días` (toggle-group, active = amarillo).
- **Or exact date:** a `react-day-picker` calendar (`@/components/ui/calendar.tsx`) — selecting a date deselects the preset and vice versa.
- Shows the resulting new `trial_ends_at` ("Nuevo fin de trial: 23 jun 2026", AR timezone — fix end-of-day AR, RESEARCH Pitfall 7).
- Confirm button (amarillo, ink): "Extender trial"; loading state mirrors ConfirmDialog (spinner + "Confirmando…", non-closable). On success: toast + `revalidatePath`.

### PlanPriceCard (NEW — `components/crm/plan-price-card.tsx`) — ADM-05
Per `08-planes.png` (3 cards in a row). Reuse Card.
- **Warning banner above the grid** (full width, amarillo-tinted with warning icon): "Editar un precio impacta la facturación de planes futuros, no las suscripciones activas. Cada cambio pide confirmación y queda en auditoría." (reconciles mock copy with D-04 — the mock says "impacta la facturación de todos los negocios del plan"; the truthful copy must say it does NOT alter active subscriptions, per D-04.)
- Per card: plan display name (heading) + mono `N negocios activos` (live count) + price (`text-4xl` heading, `$15.000` ARS) + mono `/mes` suffix + feature list (✓ rows, 14px body, from `lib/plans.ts` features — read-only) + full-width **"Editar precio"** button (amarillo, opens ConfirmDialog `type-word` "CONFIRMAR").
- The most-active / `pro` plan gets the **"MÁS ELEGIDO"** amarillo pill + accent border (per mock — but tie it to the real `pro` key, not the mock's "Equipo").
- Edit flow: clicking "Editar precio" opens the ConfirmDialog whose body contains the price input (mono, ARS, numeric) + the locked "Editar precio" copy. The 3 real cards are `basic`/`studio`/`pro` (Básico/Estudio/Pro) — NOT the mock's "Equipo".
- **NO separate "Add-ons" pricing block** on this page in v1 (the mock's add-on price editor — SMS/Reportes/etc. — is not part of v1 scope; add-on pricing/cobro is deferred to v2 ADDON-PAY-01). Omit it.

---

## Copywriting Contract

Extends Phase 1 copy. ConfirmDialog copy for Cambiar plan / Suspender / Editar precio is LOCKED in `01-UI-SPEC.md` — reuse verbatim. New copy:

| Element | Copy |
|---------|------|
| Page title — Dashboard | "Dashboard" · breadcrumb "Operación · Overview" |
| Page title — Directorio | "Negocios" · breadcrumb "Ventas · Todos los clientes" |
| Page title — Planes | "Planes y precios" · breadcrumb "Cuenta · Suscripciones" |
| KPI labels | "MRR" · "NEGOCIOS ACTIVOS" · "TRIALS POR VENCER" · "PAGOS FALLIDOS" |
| Directory search placeholder | "Buscar negocio, dueño…" |
| Directory filter tabs | "Todos" · "Activos" · "Trial" · "Suspendidos" · "Churn" |
| Directory primary action | "Exportar CSV" (outline) |
| Directory empty (no businesses) | Heading "Todavía no hay negocios" · body "Cuando se registre el primer negocio va a aparecer acá con su plan, estado y contacto." |
| Directory empty (filtered, no match) | "Ningún negocio coincide con este filtro." + acción "Limpiar filtros" |
| Alerts heading / empty | "Alertas" / Heading "Todo en orden" · body "No hay negocios con pagos fallidos ni trials por vencer en los próximos 7 días." |
| Alert captions | "Pago fallido" · "Trial vence en {n} días" / "Trial vence hoy" |
| Ficha back link | "Volver a negocios" |
| Ficha contact labels | "WHATSAPP · OBLIGATORIO" · "EMAIL · OBLIGATORIO" (mono) |
| Ficha missing contact | "—" + muted "Sin dato" (never a fabricated value) |
| Ficha subscription | "Suscripción · MercadoPago" · "Estado de cobro" · "Plan actual" · "ID suscripción" |
| Ficha billing status pills | "Al día" (verde) · "Suspendido" (rojo) · "Vencido" (rojo) |
| Ficha actions | "Cambiar plan" · "Extender trial" · "Suspender negocio" (destructive) / "Reactivar negocio" (when suspended) |
| Ficha sensitive label | "ZONA SENSIBLE" (mono, rojo) |
| Add-ons section | Heading "Add-ons" · rows "Web a medida" · "Recordatorios WhatsApp" (NEVER "SMS") |
| ExtendTrial dialog | Title "Extender trial" · desc "Elegí cuántos días sumar o una fecha exacta de fin de trial." · presets "+7 días / +14 días / +30 días" · result "Nuevo fin de trial: {fecha}" · confirm "Extender trial" |
| Planes warning banner | "Editar un precio impacta la facturación de planes futuros, no altera las suscripciones activas sin aviso. Cada cambio pide confirmación y queda en auditoría." |
| Plan card | "{N} negocios activos" · "/mes" · "MÁS ELEGIDO" (pro) · "Editar precio" |
| ConfirmDialog — Editar precio (LOCKED) | Title "Editar precio del plan" · desc "Editar el precio no altera suscripciones activas sin aviso. Escribí CONFIRMAR." · confirm "Confirmar" |
| ConfirmDialog — Cambiar plan (LOCKED) | Title "Cambiar plan" · desc "Vas a cambiar el plan de este negocio. Queda registrado en auditoría." · confirm "Cambiar plan" |
| ConfirmDialog — Suspender (LOCKED) | Title "Suspender negocio" · desc "El negocio deja de operar hasta reactivarlo. Escribí SUSPENDER para confirmar." · confirm "Suspender" (destructive) |
| Toast success (generic) | "Listo. La acción quedó registrada en auditoría." |
| Toast — add-on on/off | "Add-on activado." / "Add-on desactivado." |
| Toast — price updated | "Precio actualizado. Aplica a cobros futuros." |
| Error state (action fails) | "No se pudo completar la acción. Probá de nuevo o revisá tu conexión." (toast; dialog stays open) |

Microcopy rules (inherited): action buttons = verbo + sustantivo, never "Aceptar"/"OK". Labels always visible (no placeholder-as-label). Errors say what + how to recover. "Recordatorios WhatsApp", NEVER "SMS".

---

## Accessibility & Interaction (non-negotiable, inherited)

- Every interactive element: default / hover / focus-visible / active / disabled. Focus-visible ring = amarillo (`--ring`), 3px. No hover-only affordances.
- Clickable table rows and alert items: keyboard-focusable (wrap the row in a link or add `role`/`tabindex` + Enter/Space activation), full-row `cursor-pointer`, visible focus ring, ≥44px touch.
- Add-on toggles: real `Switch` with `aria-checked`, labelled by the add-on name; optimistic update reverts on server error.
- Mobile-first: sidebar → drawer < `lg`; KPI row stacks to 1–2 cols; ficha two-column → single column; directory table → horizontally scrollable or stacked rows < `md` (per mock's horizontal scrollbar).
- Contrast ≥ 4.5:1 body, ≥ 3:1 large text / status pills / icons (verify each StatusBadge pill at plan-phase).
- Heading hierarchy: one page `h1` (page title) → card/section titles `h2`/`h3`; ficha business name is `h1` of that page; no level skips.
- Dialogs (ExtendTrial, ConfirmDialog): focus trap, Escape, outside-click close (except loading), `aria-describedby` for helper text — free from base-ui Dialog, do not hand-roll.
- Animations ≤ 300ms, `transform`/`opacity` only. Loading > 300ms → spinner in the confirm button / toggle; tables/lists use existing skeleton patterns while the RSC resolves.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official (already vendored in `@/components/ui`) | card, table, badge, tabs, dialog, sonner, button, input, label, switch, avatar, separator, calendar | not required (already in repo, no fetch) |
| third-party | none | not applicable |

No third-party registries declared. No `npx shadcn add` / `view` needed — all primitives already exist in the repo (Phase 1 + base set) and are reused verbatim. Zero new npm packages (D-context + RESEARCH §Standard Stack confirmed). If `switch` is not yet vendored, add it from the **official** shadcn registry only (no safety gate beyond official) — confirm at plan-phase.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
