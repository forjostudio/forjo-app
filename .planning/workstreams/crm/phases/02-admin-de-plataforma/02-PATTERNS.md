# Phase 2: Admin de Plataforma - Pattern Map

**Mapped:** 2026-06-18
**Files analyzed:** 14 new/modified
**Analogs found:** 14 / 14 (todos con match real verificado en el codebase)

> Todos los excerpts son de archivos reales leídos en esta sesión. Las server actions (`'use server'`) NO tienen precedente en el repo — el analog más cercano es el route handler `app/api/admin/set-plan/route.ts` + los helpers de Phase 1 (`requireAdmin`, `logAudit`). El planner debe componer el patrón nuevo a partir de esas piezas verificadas.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/032_crm_admin.sql` | migration | DDL/transform | `supabase/migrations/031_crm_audit_log.sql` | exact |
| `app/(crm)/admin/_actions.ts` | service (server actions `'use server'`) | CRUD | `app/api/admin/set-plan/route.ts` + `lib/audit.ts` + `lib/admin-guard.ts` | role-match (no `'use server'` precedent) |
| `app/(crm)/admin/page.tsx` (MODIFY) | route (RSC) | request-response (read) | `app/(crm)/admin/auditoria/page.tsx` | exact |
| `app/(crm)/admin/negocios/page.tsx` | route (RSC) | request-response (read) | `app/(crm)/admin/auditoria/page.tsx` | exact |
| `app/(crm)/admin/negocios/negocios-client.tsx` | component (client) | CRUD/filter | `app/(crm)/admin/auditoria/auditoria-client.tsx` | exact |
| `app/(crm)/admin/negocios/[id]/page.tsx` | route (RSC, dynamic) | request-response (read) | `app/(crm)/admin/auditoria/page.tsx` | role-match (dynamic param) |
| `app/(crm)/admin/negocios/[id]/ficha-client.tsx` | component (client) | event-driven (actions) | `auditoria-client.tsx` + `confirm-dialog.tsx` consumer | role-match |
| `app/(crm)/admin/planes/page.tsx` | route (RSC) | request-response (read) | `app/(crm)/admin/auditoria/page.tsx` | exact |
| `app/(crm)/admin/planes/planes-client.tsx` | component (client) | event-driven (actions) | `auditoria-client.tsx` + `confirm-dialog.tsx` | role-match |
| `components/crm/kpi-card.tsx` | component | presentational | `components/crm/risk-badge.tsx` (chrome) | partial |
| `components/crm/status-badge.tsx` | component | presentational | `components/crm/risk-badge.tsx` | exact (calque cva) |
| `components/crm/alert-list.tsx` | component | presentational | `auditoria-client.tsx` table/empty-state | role-match |
| `components/crm/addon-toggle.tsx` | component (client) | event-driven | `confirm-dialog.tsx` (submit guard + toast) | partial |
| `components/crm/extend-trial-dialog.tsx` | component (client) | event-driven | `components/crm/confirm-dialog.tsx` | exact |
| `components/crm/plan-price-card.tsx` | component (client) | event-driven | `confirm-dialog.tsx` consumer + `risk-badge.tsx` | role-match |
| `lib/crm-metrics.ts` | utility | transform (pure) | `lib/audit.ts` shape + `confirm-dialog.tsx:81-99` pure helpers | role-match |
| `lib/plan-prices.ts` | utility | read + fallback | `lib/subscription-plans.ts` (`getSubscriptionPlan`) + `lib/plans.ts` (`getPlanLimits`) | exact |
| `app/api/booking/create/route.ts` (MODIFY) | route handler | request-response | self (line 63 blocklist) | self-edit |
| `app/(dashboard)/layout.tsx` (MODIFY) | layout (RSC guard) | request-response | self (line 25 `planStatus`) | self-edit |
| `components/crm/crm-sidebar.tsx` (MODIFY) | component | nav | self (NAV_GROUPS) | self-edit |

---

## Pattern Assignments

### `supabase/migrations/032_crm_admin.sql` (migration, DDL)

**Analog:** `supabase/migrations/031_crm_audit_log.sql`

**Header + numbering convention** (031 lines 1-22): bloque de comentarios en español que explica QUÉ agrega, "se aplica A MANO y EN ORDEN (última aplicada: NNN)", la razón de la decisión D1/D8, y el TODO operativo post-deploy (regenerar `schema.sql` con `supabase db dump`). Replicar verbatim este estilo de cabecera para 032.

**RLS pattern admin-only (calcar de 031 lines 47-62):**
```sql
alter table public.audit_log enable row level security;
drop policy if exists "admin read audit_log" on public.audit_log;
create policy "admin read audit_log" on public.audit_log
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- NO se crea policy de insert/update/delete: solo el service-role escribe.
```
Para `plan_prices`: misma estructura (`enable rls` + policy SELECT con el JWT `app_metadata.is_admin = 'true'`, SIN policy de write → service-role-only). El schema exacto de la tabla (`plan_key pk check in (basic/studio/pro)`, `price_ars int >= 0`, `updated_at`, `updated_by → auth.users on delete set null`) y el seed (15000/30000/50000 desde `subscription-plans.ts`) están en RESEARCH §"Schema SQL propuesto — 032" — copiar de ahí.

**Add-on columns en `businesses`:** `add column if not exists has_web_custom boolean not null default false` + `has_whatsapp` igual. **VERIFICAR en plan-phase** (RESEARCH Open Question RLS): que las policies de UPDATE de `businesses` no permitan al dueño auto-asignarse estas flags (bypass de cobro). Las policies de update no estaban en los archivos leídos.

**Nota verificada:** `plan_status` es `text` libre (sin check constraint) → `'suspended'` entra sin migración de constraint.

---

### `app/(crm)/admin/_actions.ts` (service, `'use server'`, CRUD)

**Analog primario:** `app/api/admin/set-plan/route.ts` (lógica de update) + `lib/admin-guard.ts` (guard) + `lib/audit.ts` (auditoría). **NO hay `'use server'` en el repo** — esta action establece el patrón.

**Guard pattern — PRIMERA línea de cada action** (de `lib/admin-guard.ts:14-26`):
```typescript
export async function requireAdmin(): Promise<User> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthorized')
  if (user.app_metadata?.is_admin !== true) throw new Error('forbidden')
  return user  // user.id = actorId para logAudit
}
```
`requireAdmin()` LANZA (no redirige) porque corre dentro de actions. El ConfirmDialog NO autoriza — `requireAdmin()` es la garantía (Pitfall 2).

**Update logic a reusar** (de `set-plan/route.ts:50-57`):
```typescript
const update: Record<string, string | null> = {}
if (plan) update.plan = plan
if (status) {
  update.plan_status = status
  if (status === 'active') update.trial_ends_at = null  // al activar, limpiar trial
}
const { error } = await supabase.from('businesses').update(update).eq('id', businessId)
if (error) return Response.json({ error: error.message }, { status: 500 })
```
En la action: replicar (NO mover) esta lógica. `set-plan/route.ts` NO se borra (lo usa el actor externo con `x-admin-secret`). **Sumar `'suspended'` a `VALID_STATUSES`** (hoy `set-plan/route.ts:7` = `['trial','active','expired','cancelled']`).

**Audit pattern — DESPUÉS de la mutación** (de `lib/audit.ts:27-45`, shape estable):
```typescript
await logAudit({
  actorId: actor.id, action: 'plan.change', targetType: 'business', targetId: businessId,
  businessId, risk: 'medio',
  metadata: { from: prev?.plan ?? null, to: plan },
})
```
`logAudit` es best-effort (no lanza, loguea `[audit/log]` y retorna). NO envolver en rollback. Las `action` codes ya tienen labels en el visor (`auditoria-client.tsx:62-70`): usar `'plan.change'`, `'business.suspend'`, `'business.reactivate'`, `'plan.price_edit'`, `'trial.extend'`, `'addon.toggle'` para que el ACTION_LABEL los reconozca.

**Error handling:** la action lanza `throw new Error('update_failed')` en error de DB (el ConfirmDialog ya captura el throw → toast + deja el dialog abierto, ver `confirm-dialog.tsx:200-205`). Validación de input con `zod` (schemas por action, RESEARCH Patterns 2-4).

**Cierre con `revalidatePath`** (Next 16, Pitfall 5): `revalidatePath('/admin/negocios/${businessId}')` al final; para precios revalidar `/admin/planes` y `/admin`. **Consultar `node_modules/next/dist/docs/`** para la API exacta de server actions + revalidatePath en 16.2.7 (regla del proyecto).

---

### `app/(crm)/admin/negocios/page.tsx` + `app/(crm)/admin/page.tsx` (RSC, read global)

**Analog:** `app/(crm)/admin/auditoria/page.tsx`

**Diferencia clave de cliente Supabase:** auditoria lee con `createClient()` (sesión + RLS admin-read porque `audit_log` tiene policy). Para `businesses` NO existe policy "is_admin lee todo" → usar `createAdminClient()` (service-role) DENTRO del RSC (ya tras el guard del layout `(crm)`). Patrón de SELECT explícito heredado de auditoria:
```typescript
// auditoria/page.tsx:24-27 — calcar el SELECT explícito (sin comodín) + order + error handling
const { data, error } = await supabase
  .from('audit_log')
  .select('id, actor_id, action, ...')   // columnas explícitas, NO select('*')
  .order('created_at', { ascending: false })
  .limit(100)
if (error) console.error('[crm/auditoria] read error:', error.message)
return <AuditoriaClient rows={rows} loadError={Boolean(error)} />
```
Para negocios: `createAdminClient().from('businesses').select('id, name, slug, owner_id, plan, plan_status, trial_ends_at, subscription_ends_at, mp_subscription_id, whatsapp, notification_email, has_web_custom, has_whatsapp, created_at')` (columnas no secretas; NUNCA tokens/secrets). Pasar solo filas leídas al client — el service-role NUNCA cruza al cliente (anti-pattern T-01-09). Email del dueño (ADM-02): resolver vía `admin.auth.admin.getUserById(owner_id)` con fallback a `notification_email` (Pitfall 6).

---

### `app/(crm)/admin/negocios/negocios-client.tsx` (component, filter)

**Analog:** `app/(crm)/admin/auditoria/auditoria-client.tsx` (calcar verbatim la mecánica)

**Filtros + búsqueda client-side** (de `auditoria-client.tsx:114-148`): array `FILTERS` const con `{value,label}`, `useState` para query + filter, `useMemo` que filtra el array de filas en memoria. Para negocios las tabs son `Todos {n} · Activos {n} · Trial {n} · Suspendidos {n} · Churn {n}` (UI-SPEC); `Todos` default e INCLUYE suspendidos (Pitfall 4 — nunca un default que los oculte). Búsqueda sobre nombre/email/slug.

**Tabla** (de `auditoria-client.tsx:237-288`): `rounded-xl border border-border bg-card`, headers mono uppercase (`font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground`). Reusar `Table/TableBody/TableRow/...` de `@/components/ui/table`.

**Empty states** (de `auditoria-client.tsx:293-317`): componente `EmptyState` con heading (heading font) + body + action opcional. Reusar la estructura para "Todavía no hay negocios" / "Ningún negocio coincide" + "Limpiar filtros".

**Export CSV client-side** (de `auditoria-client.tsx:78-95,155-166`): el patrón `rowsToCsv` (escape RFC-4180 + BOM UTF-8) + Blob/anchor download YA existe — reusarlo para "Exportar CSV" del directorio si plan-phase lo confirma. Cero libs.

**Filas clickeables → ficha:** wrap la fila en link / `tabindex`+Enter (a11y, UI-SPEC). El visor de auditoría no navega; el directorio sí → agregar el affordance (chevron + `cursor-pointer` + focus ring amarillo, ≥44px).

---

### `app/(crm)/admin/negocios/[id]/ficha-client.tsx` + `planes-client.tsx` (consumers de acciones)

**Analog:** consumidor de `components/crm/confirm-dialog.tsx`

**Patrón de invocación de action vía ConfirmDialog:** el `onConfirm` del dialog es `(reason?) => Promise<void>` que llama la server action. El dialog ya maneja loading, anti doble-submit (`buildSubmitGuard`), toast de error y mantener abierto en fallo (`confirm-dialog.tsx:106-124,192-205`). El client solo pasa `open/onOpenChange/title/description/confirmWord/risk/confirmLabel/destructive/onConfirm`. Niveles lockeados (Phase 1 D7): Cambiar plan = simple (sin `confirmWord`); Suspender = `confirmWord="SUSPENDER"` + `destructive`; Editar precio = `confirmWord="CONFIRMAR"`. Copy exacto en UI-SPEC §Copywriting (LOCKED).

---

### `components/crm/status-badge.tsx` (component, calque)

**Analog:** `components/crm/risk-badge.tsx` (calcar el patrón cva, NO editar el badge compartido)

**cva local pattern** (de `risk-badge.tsx:19-66`):
```typescript
const riskBadgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-4xl border px-2 py-0.5 text-xs whitespace-nowrap',
  { variants: { risk: { alto: '...', medio: '...', bajo: '...' } }, defaultVariants: { risk: 'bajo' } }
)
// dot con var(--crm-danger) inline style para el hue rojo
<span style={{ backgroundColor: 'var(--crm-danger)' }} className="size-1.5 shrink-0 rounded-full" />
```
StatusBadge: variantes `active` (verde `--crm-success`) / `trial` (azul `--crm-info`) / `suspended` (rojo `--crm-danger`) / `cancelled|expired` (churn, rojo muted). Mismo shape pill + leading dot. NUNCA `--destructive` (un solo rojo `--crm-danger`, brief §12). Suspendidos SIEMPRE visibles + marcados.

---

### `lib/crm-metrics.ts` (utility, pure transform)

**Analog:** funciones puras testeables de `confirm-dialog.tsx:81-124` (`computeConfirmState`/`buildSubmitGuard`) + shape de input de `lib/audit.ts`

**Patrón:** funciones puras (sin DB, sin React) testeables en vitest node — igual que `computeConfirmState` extrajo la lógica de gating fuera del componente. `computeKpis(rows, prices, now)` y `deriveAlerts(rows, now)` con `now = new Date()` inyectable (determinismo en test). Implementación completa en RESEARCH §Pattern 5. MRR = Σ(precio × activos por plan) (D-03); "pagos fallidos" derivado de `plan_status` cancelled/expired (D-10); trials ≤7d. Cuidado zona AR (Pitfall 7): el conteo "≤7d" usa el mismo criterio que `daysLeft` de `app/(dashboard)/layout.tsx:26-28`.

---

### `lib/plan-prices.ts` (utility, read + fallback)

**Analog:** `lib/subscription-plans.ts` (`getSubscriptionPlan` con fallback a `.basic`) + `lib/plans.ts` (`getPlanLimits` con fallback)

**Patrón de getter con fallback** (de `subscription-plans.ts:29-31`):
```typescript
export function getSubscriptionPlan(plan: string) {
  return SUBSCRIPTION_PLANS[plan as SubscriptionPlanKey] ?? SUBSCRIPTION_PLANS.basic
}
```
`getPlanPrices()` lee la tabla `plan_prices` (service-role) y devuelve `Record<plan_key, price_ars>`; si falta una fila, fallback al `price_ars` literal de `subscription-plans.ts` (15000/30000/50000). **Pitfall 1 (CRÍTICO):** la fuente es `price_ars` de `subscription-plans.ts` (lo que MP cobra), NO el `price_usd` de `plans.ts`. `plans.ts` queda solo para topes/features (read-only en PlanPriceCard).

---

## Shared Patterns

### Guard (requireAdmin)
**Source:** `lib/admin-guard.ts:14-26`
**Apply to:** PRIMERA línea de TODAS las server actions de `_actions.ts` (changePlan, suspendBusiness, extendTrial, toggleAddon, updatePlanPrice). Sin excepción (Pitfall 2). Devuelve el `user` cuyo `.id` es el `actorId` del audit.

### Auditoría (logAudit)
**Source:** `lib/audit.ts:27-45`
**Apply to:** DESPUÉS de cada mutación exitosa en `_actions.ts`. Best-effort (no rollback). Usar los `action` codes ya mapeados en `auditoria-client.tsx:62-70`.

### Cliente Supabase service-role en RSC del CRM
**Source:** `lib/supabase/admin.ts` (`createAdminClient`) — usado server-only
**Apply to:** Todas las páginas RSC del CRM que leen `businesses`/`plan_prices` (no hay policy "is_admin lee todo" en businesses). SELECT explícito de columnas no secretas; nunca pasar el cliente al componente client.

### ConfirmDialog (doble confirmación)
**Source:** `components/crm/confirm-dialog.tsx`
**Apply to:** Cambiar plan, Suspender, Editar precio. Niveles lockeados Phase 1. El dialog ya maneja loading/anti-doble-submit/toast-de-error/no-cerrar-en-fallo — el caller solo pasa props + `onConfirm` (la action).

### Toasts (sonner via CrmToaster dark)
**Source:** `confirm-dialog.tsx:203` (`toast.error(...)`) + `CrmToaster` montado en `(crm)/layout.tsx`
**Apply to:** Éxito/error de cada action (add-on toggle, precio actualizado). Copy en UI-SPEC §Copywriting.

### Formato fecha/hora zona AR
**Source:** `auditoria-client.tsx:35-58` (`AR_TZ` + `formatWhen` con `toLocaleDateString('es-AR', { timeZone })`)
**Apply to:** ExtendTrialDialog (fin de trial), conteo trials por vencer, "cliente desde" en ficha. Pitfall 7: fin del día AR para fecha exacta.

---

## Self-Edits (modificaciones de 1-2 líneas, no archivos nuevos)

| File | Edit | Anchor |
|------|------|--------|
| `app/api/booking/create/route.ts:63` | `['expired','cancelled']` → `['expired','cancelled','suspended']` (SUMAR, no reescribir; preservar comentario blocklist :56-62) | verificado, línea 63 |
| `app/(dashboard)/layout.tsx` | nuevo `if (planStatus === 'suspended') redirect('/suspendido')` tras `const planStatus = ...` (:25); fuera de try/catch | verificado, :25 hoy solo alimenta `<PlanBanner>` :40 |
| `app/api/admin/set-plan/route.ts:7` | sumar `'suspended'` a `VALID_STATUSES` | verificado |
| `components/crm/crm-sidebar.tsx:63-78` | cablear items `Negocios` (→`/admin/negocios`) y `Planes y precios` (→`/admin/planes`): quitar `soon: true` + poner href real | verificado, hoy `href:'#', soon:true` |

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `app/(crm)/admin/_actions.ts` (`'use server'`) | service | No existe ningún `'use server'` en el repo. Es el PRIMER server action. Se compone de analogs (set-plan update + requireAdmin + logAudit) pero el wrapper `'use server'` + `revalidatePath` es patrón nuevo de Next 16 → consultar `node_modules/next/dist/docs/`. |
| `components/crm/kpi-card.tsx` (sparkline) | component | No hay KPI card con recharts en el CRM. `recharts` se usa en finanzas (no leído). El slot sparkline va vacío/plano en v1 (sin histórico, D-03) → el analog de recharts es secundario. |

---

## Metadata

**Analog search scope:** `lib/`, `app/(crm)/`, `app/api/admin/`, `app/api/booking/`, `app/(dashboard)/`, `components/crm/`, `supabase/migrations/`
**Files scanned:** ~14 leídos + 2 globs
**Pattern extraction date:** 2026-06-18
