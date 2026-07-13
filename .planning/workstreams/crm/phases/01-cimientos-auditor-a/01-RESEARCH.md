# Phase 1: Cimientos & Auditoría - Research

**Researched:** 2026-06-17
**Domain:** Super-admin surface sobre app multi-tenant Next.js 16 + Supabase RLS — guard server-side, audit log global, doble confirmación, shell de UI anclado a dark
**Confidence:** HIGH (todo verificado contra el codebase real; cero dependencias nuevas)

## Summary

Phase 1 monta la base de seguridad transversal del CRM super-admin sobre un codebase que ya tiene los patrones necesarios. El modelo de auth es simple y verificado: **no existe tabla `profiles`, no existe `is_admin` en ningún lado** (grep vacío) — la app autentica con `auth.users` de Supabase + `businesses.owner_id`. Los Server Components leen sesión con `createClient()` (anon key + cookies, RLS activo) y `supabase.auth.getUser()`, exactamente como `app/(dashboard)/layout.tsx:12-15`. El guard de `/admin` (FND-01) se modela calcando ese patrón en un layout async de un route group nuevo `app/(crm)/` con `redirect()` server-side.

Las cuatro piezas mapean a patrones ya presentes: (1) el guard reusa el layout-as-guard de dashboard; (2) `audit_log` (FND-02) es una migración SQL numerada nueva (`030_*`) siguiendo la convención de `supabase/migrations/`, con RLS habilitada y escritura por service-role vía un helper `logAudit()`; (3) la doble confirmación (FND-03) se construye sobre el `Dialog` de `@base-ui/react` ya instalado (`components/ui/dialog.tsx`); (4) el shell (FND-04) reusa card/table/badge/tabs/dialog/sonner existentes pero **fuerza dark** — hoy el root layout fuerza `defaultTheme="light"` (`app/layout.tsx:55`), así que el CRM necesita forzar `.dark` localmente sin tocar el theming por-negocio.

**Primary recommendation:** Crear route group `app/(crm)/` con layout-guard server-side que lee `is_admin` (columna nueva en `businesses`, o `auth.users.raw_app_meta_data` — ver decisión abajo), una migración `030_crm_foundations.sql` con la columna `is_admin` + tabla `audit_log` (RLS on, admin-only read, service-role write), un helper `lib/audit.ts` con `logAudit()`, y un `ConfirmDialog` reutilizable escalonado. Construir **audit_log + guard primero** porque todo lo demás escribe sobre ellos. Cero paquetes nuevos.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Validar `is_admin` y redirigir (FND-01) | Frontend Server (RSC layout) | API / Backend (defensa en profundidad opcional en `proxy.ts`) | El guard debe ser server-side y bloquear antes de render; el layout async es el punto natural (igual que dashboard). |
| Registrar acción sensible (FND-02) | API / Backend (route handler / server action) | Database (tabla `audit_log` + RLS) | El audit se escribe server-side con service-role; la tabla lo persiste con RLS admin-only. |
| Type-to-confirm escalonado (FND-03) | Browser / Client (componente Dialog) | API / Backend (re-valida la acción server-side, nunca confía en la UI) | La confirmación es UX; la garantía real de cada acción peligrosa vive en el server. |
| Shell + tema dark forzado (FND-04) | Frontend Server (layout) + Browser (componentes client) | CDN / Static (tokens CSS en `globals.css`) | El layout ancla `.dark` y la paleta; los componentes consumen tokens existentes. |

## Standard Stack

Phase 1 **no instala nada nuevo**. Todo el stack ya está en `package.json` y verificado en el codebase.

### Core (ya instalado — reuso)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.7 | App Router, RSC layouts, `redirect()`, route handlers | Framework del proyecto; middleware = `proxy.ts` (NO `middleware.ts`) `[VERIFIED: package.json + proxy.ts]` |
| `@supabase/ssr` | ^0.10.3 | `createServerClient` con cookies para leer sesión en RSC | Patrón existente en `lib/supabase/server.ts` `[VERIFIED: lib/supabase/server.ts]` |
| `@supabase/supabase-js` | ^2.106.2 | `createAdminClient()` service-role para escribir audit | Patrón existente en `lib/supabase/admin.ts` `[VERIFIED: lib/supabase/admin.ts]` |
| `@base-ui/react` | ^1.5.0 | Primitiva `Dialog` para el ConfirmDialog escalonado | Base del `components/ui/dialog.tsx` existente `[VERIFIED: components/ui/dialog.tsx]` |
| `next-themes` | ^0.4.6 | Forzar modo dark en el shell del CRM | Ya provee `ThemeProvider` en root `[VERIFIED: app/layout.tsx:55]` |
| `sonner` | ^2.0.7 | Toasts (un solo `<Toaster>` global ya montado) | `components/ui/sonner.tsx` `[VERIFIED]` |
| `lucide-react` | ^1.17.0 | Iconografía del sidebar/badges | `iconLibrary` del proyecto `[VERIFIED: components.json]` |
| `zod` | ^4.4.3 | Validar input de las server actions/route handlers del audit | Patrón de validación del proyecto `[CITED: .claude/CLAUDE.md]` |

### Supporting (ya instalado)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-hook-form` + `@hookform/resolvers` | ^7.77 / ^5.4 | Si el ConfirmDialog necesita un input controlado del texto a tipear | Solo si se quiere validación rica; un `useState` simple alcanza para type-to-confirm |
| `tailwind-merge` / `clsx` / `cva` | varios | `cn()` y variantes de badge (riesgo Alto/Medio/Bajo) | Componer clases del shell |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `is_admin` en `businesses` (columna) | `is_admin` en `auth.users.raw_app_meta_data` (app_metadata) | Ver "Decisión: dónde vive is_admin" abajo. Columna en businesses es más simple de leer en RSC y de auditar; app_metadata es más "canónico" para roles pero requiere admin API para setearlo. |
| Tabla `profiles` nueva | Reusar `businesses.owner_id` + flag | El proyecto NO tiene `profiles` y el modelo es dueño-solo; crear `profiles` sería sobre-ingeniería para un operador único. |
| Guard solo en layout | Guard en layout **+** `proxy.ts` | Defensa en profundidad recomendada (ver Pitfall 3). |

**Installation:** Ninguna. `npm install` no se ejecuta en esta fase.

## Package Legitimacy Audit

> **No aplica.** Phase 1 no instala ningún paquete externo nuevo. Todas las librerías usadas (`next`, `@supabase/ssr`, `@supabase/supabase-js`, `@base-ui/react`, `next-themes`, `sonner`, `lucide-react`, `zod`, `react-hook-form`) ya están en `package.json` y en uso productivo en el repo.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Decisión clave: dónde vive `is_admin`

**Estado verificado:** `is_admin` no existe en el codebase (grep vacío en `**/*`). No hay tabla `profiles` ni uso de `app_metadata`/`raw_app_meta_data` (grep vacío en `*.ts/tsx/sql`). El único vínculo usuario↔negocio es `businesses.owner_id → auth.users.id` (`supabase/schema.sql:536`).

**Opción recomendada — columna `is_admin boolean` en `businesses`** `[ASSUMED — confirmar con el operador, ver Assumptions Log]`:
- Pro: se lee en el mismo query que ya hace el dashboard (`select * from businesses where owner_id = user.id`), sin llamadas extra. Auditarla es trivial (otorgar is_admin = un UPDATE).
- Pro: el brief A2 dice "flag en el usuario" pero el modelo es dueño-solo (1 user ↔ 1 business), así que el flag en el business del operador es equivalente y más fácil de leer en RSC.
- Contra: si el operador NO tiene un `business` propio (signup directo sin onboarding), el query `.single()` falla. **Mitigación:** el guard debe tolerar `business` null y leer el flag de forma defensiva (ver patrón del guard abajo).

**Alternativa — `auth.users.raw_app_meta_data->>'is_admin'`** `[CITED: supabase.com/docs/guides/auth/managing-user-data]`:
- Pro: vive en el usuario, no depende de tener un business; es el lugar canónico de Supabase para roles/claims (no editable por el usuario, solo por service-role/admin API).
- Pro: aparece en el JWT, así que `proxy.ts` (Edge) podría leerlo sin un query a la DB.
- Contra: setearlo requiere `supabase.auth.admin.updateUserById(...)` con service-role (no un simple UPDATE SQL); leerlo en RSC es `user.app_metadata.is_admin`.

**Recomendación de research:** dado que el operador es un usuario real que probablemente tiene su propio `business`, y que el guard de dashboard ya carga el business, **columna en `businesses`** minimiza fricción. Pero como `is_admin` son "las llaves del reino" (brief §7) y NO es self-serve, app_metadata tiene la ventaja de no ser tocable por el dueño vía RLS. El planner debe presentar ambas a discuss-phase; ambas son válidas y la elección afecta el SQL de la migración 030.

## Architecture Patterns

### System Architecture Diagram

```text
  Request a /admin/*
        │
        ▼
  ┌─────────────────────┐   no es ruta /[slug] pública
  │ proxy.ts (Edge)     │── updateSession() refresca cookies
  │ matcher + KNOWN_*   │   [OPCIONAL: check is_admin en JWT → redirect temprano]
  └─────────┬───────────┘
            ▼
  ┌─────────────────────────────────┐
  │ app/(crm)/layout.tsx (RSC async) │  ← GUARD CANÓNICO (FND-01)
  │  createClient() + getUser()       │
  │  leer is_admin                    │
  │  if (!user || !is_admin)          │
  │     redirect('/dashboard')        │  ← server-side, sin render parcial
  │  fuerza .dark + paleta CRM        │  (FND-04)
  └─────────┬───────────────────────┘
            ▼  (solo si is_admin)
  ┌─────────────────────┐     ┌──────────────────────────┐
  │ CRM pages (RSC)     │     │ ConfirmDialog (client)    │ (FND-03)
  │ sidebar agrupado    │────▶│ type-to-confirm escalonado│
  │ cards/tables/badges │     │ SUSPENDER/VER/CONFIRMAR    │
  └─────────┬───────────┘     └────────────┬─────────────┘
            │ acción peligrosa confirmada    │
            ▼                                ▼
  ┌────────────────────────────────────────────────┐
  │ Server Action / Route handler (Node runtime)     │
  │  - re-valida is_admin server-side (NO confía UI)  │
  │  - ejecuta la acción (set-plan, suspend, etc.)    │
  │  - logAudit({actor, action, target, reason,...})  │ (FND-02)
  └─────────────────────┬────────────────────────────┘
                        ▼
  ┌──────────────────────────────────────┐
  │ Supabase (service-role en server)     │
  │  audit_log  (RLS on, admin-read,      │
  │              service-role-write)      │
  └──────────────────────────────────────┘
```

### Recommended Project Structure
```text
app/
└── (crm)/                      # route group nuevo → URL /admin/*
    ├── layout.tsx              # GUARD server-side + shell dark (FND-01, FND-04)
    └── admin/
        └── page.tsx            # landing del CRM (placeholder en Phase 1)
components/
└── crm/
    ├── crm-sidebar.tsx         # sidebar AGRUPADO propio del CRM (FND-04)
    ├── confirm-dialog.tsx      # type-to-confirm escalonado reutilizable (FND-03)
    └── crm-shell.tsx           # wrapper de layout (opcional)
lib/
├── audit.ts                    # logAudit() helper (FND-02)
└── admin-guard.ts              # requireAdmin() helper reutilizable (FND-01)
supabase/migrations/
└── 030_crm_foundations.sql     # is_admin + audit_log + RLS
```

### Pattern 1: Layout-as-guard server-side (FND-01)
**What:** Un layout async de RSC que valida sesión + rol y hace `redirect()` antes de renderizar children. Calca `app/(dashboard)/layout.tsx`.
**When to use:** Toda la superficie `/admin/*`.
**Example:**
```typescript
// app/(crm)/layout.tsx  — Source: patrón de app/(dashboard)/layout.tsx:11-23
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Variante columna-en-businesses (defensiva: el operador puede no tener business)
  const { data: biz } = await supabase
    .from('businesses')
    .select('is_admin')
    .eq('owner_id', user.id)
    .maybeSingle()           // maybeSingle: no explota si no hay fila
  if (!biz?.is_admin) redirect('/dashboard')

  // Variante app_metadata:  if (!user.app_metadata?.is_admin) redirect('/dashboard')

  return (
    <div className="dark">   {/* fuerza dark localmente sin tocar next-themes global */}
      {/* shell: CrmSidebar + main */}
      {children}
    </div>
  )
}
```
Nota: `redirect()` lanza — llamarlo FUERA de cualquier `try/catch` (`[CITED: node_modules/next/dist/docs/.../redirect.md:50-52]`). El acceso a cookies/`getUser()` hace la ruta dinámica automáticamente; no hace falta `force-dynamic` salvo que se quiera explicitarlo.

### Pattern 2: `requireAdmin()` reutilizable en server actions / route handlers (FND-01 + FND-02)
**What:** Helper que re-valida `is_admin` server-side en cada acción peligrosa (el guard del layout NO protege server actions invocadas directamente).
**When to use:** Al inicio de toda server action / route handler del CRM.
**Example:**
```typescript
// lib/admin-guard.ts
import { createClient } from '@/lib/supabase/server'

export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthorized')
  const { data: biz } = await supabase
    .from('businesses').select('is_admin').eq('owner_id', user.id).maybeSingle()
  if (!biz?.is_admin) throw new Error('forbidden')
  return user   // actor para el audit
}
```

### Pattern 3: `logAudit()` con service-role (FND-02)
**What:** Helper que inserta en `audit_log` con service-role (bypassa RLS, escritura server-only).
**When to use:** Después de toda acción sensible, en el mismo handler.
**Example:**
```typescript
// lib/audit.ts — Source: patrón createAdminClient() de lib/supabase/admin.ts
import { createAdminClient } from '@/lib/supabase/admin'

type Risk = 'alto' | 'medio' | 'bajo'
export async function logAudit(input: {
  actorId: string
  action: string                 // 'set_plan' | 'suspend' | 'impersonate' | ...
  targetType: string             // 'business' | 'plan' | 'user'
  targetId?: string | null
  businessId?: string | null
  risk: Risk
  reason?: string | null         // obligatorio en impersonación
  metadata?: Record<string, unknown>
}) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('audit_log').insert({
    actor_id: input.actorId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    business_id: input.businessId ?? null,
    risk: input.risk,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  })
  if (error) console.error('[audit/log] insert error:', error.message)
}
```

### Pattern 4: ConfirmDialog escalonado (FND-03)
**What:** Componente client sobre `@base-ui/react` Dialog. Niveles: `simple` (solo botón confirmar), `type-to-confirm` (input que debe igualar una palabra: `SUSPENDER` | `VER` | `CONFIRMAR`).
**When to use:** Toda acción peligrosa. Preservar los niveles del prototipo (brief §11): Suspender→"SUSPENDER", Impersonar→"VER", Editar precio→"CONFIRMAR", Cambiar plan→simple.
**Example:**
```typescript
// components/crm/confirm-dialog.tsx (esqueleto)
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Props = {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: string
  confirmWord?: string            // undefined => confirmación simple
  requireReason?: boolean         // impersonación
  risk: 'alto' | 'medio' | 'bajo'
  onConfirm: (reason?: string) => Promise<void>
}
export function ConfirmDialog({ confirmWord, requireReason, onConfirm, ...p }: Props) {
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const wordOk = !confirmWord || typed === confirmWord
  const reasonOk = !requireReason || reason.trim().length > 0
  const canConfirm = wordOk && reasonOk && !loading
  // render: input de palabra si confirmWord, textarea de motivo si requireReason,
  // botón confirm deshabilitado hasta canConfirm. La UI deshabilitada es refuerzo,
  // NO la garantía — el handler server-side re-valida (Pitfall 2).
  return <Dialog open={p.open} onOpenChange={p.onOpenChange}>{/* ... */}</Dialog>
}
```

### Anti-Patterns to Avoid
- **Guard solo-cliente:** validar `is_admin` en un `useEffect`/componente client. El render parcial filtra UI sensible antes del redirect. FND-01 exige server-side.
- **Confiar en la UI del ConfirmDialog como garantía:** un atacante salta el dialog. La acción peligrosa SIEMPRE re-valida `is_admin` server-side (`requireAdmin()`).
- **Tabla `audit_log` sin RLS habilitada:** el bug clásico (skill `supabase-multitenant-rls` regla 1). Habilitar RLS en la misma migración.
- **Forzar dark mutando next-themes global:** rompería el theming por-negocio del dashboard. Usar `className="dark"` local en el layout del CRM (scoped al subtree).
- **Reusar el `Sidebar` de dashboard:** es business-scoped (`buildNav(business)`, terminología por vertical). El CRM necesita su propio `CrmSidebar` agrupado.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Comparar `ADMIN_SECRET` timing-safe | tu propio `===` | `crypto.timingSafeEqual` (ya en `set-plan/route.ts:16-21`) | Side-channel de timing; el patrón hash-both-sides ya está resuelto |
| Modal de confirmación | div+overlay propio | `@base-ui/react` Dialog vía `components/ui/dialog.tsx` | Focus trap, Escape, portal, a11y ya resueltos |
| Toasts | tu propio toast | `sonner` (`<Toaster>` global ya montado) | richColors + iconos ya configurados |
| Leer sesión en RSC | parsear cookies a mano | `createClient()` + `auth.getUser()` | Patrón del proyecto, RLS-aware |
| Escribir con service-role | nuevo cliente | `createAdminClient()` | Factory existente server-only |

**Key insight:** Phase 1 es 90% composición de patrones que ya existen en el repo. El valor está en NO inventar: copiar el guard del dashboard, el timingSafeEqual de set-plan, el Dialog de base-ui, y las convenciones de migración/RLS de la skill.

## Endpoints admin existentes + ADMIN_SECRET (reuso)

**Verificado:** existe UN solo endpoint admin: `app/api/admin/set-plan/route.ts`. Usa autenticación por **header** `x-admin-secret` comparado timing-safe contra `process.env.ADMIN_SECRET` (`set-plan/route.ts:16-29`). Cambia `plan`/`plan_status`/`trial_ends_at` en `businesses` con `createAdminClient()`.

**Cómo conviven los dos modelos de acceso:**
- `set-plan` (header `ADMIN_SECRET`): pensado para un actor EXTERNO/script (ej. webhook, CLI `npm run setup:mp-plans`). NO tiene sesión de usuario.
- `/admin` (CRM, sesión + `is_admin`): pensado para el operador logueado en el browser.
- **Recomendación:** en Phase 2 la lógica de `set-plan` (validación de planes, UPDATE de businesses) se REUSA desde las server actions del CRM, pero la AUTORIZACIÓN cambia de "header secret" a "sesión + is_admin + requireAdmin()". No borrar `set-plan` (lo usa el flujo externo); extraer su lógica de negocio (los arrays `VALID_PLANS`/`VALID_STATUSES` y el UPDATE) a un helper compartido si conviene. En Phase 1 solo se documenta; no se toca `set-plan`.
- Lógica reusable hoy: `VALID_PLANS = ['basic','studio','pro']`, `VALID_STATUSES = ['trial','active','expired','cancelled']`, y el patrón de `update.plan_status` + `trial_ends_at = null` al activar.

## Runtime State Inventory

> Aplica parcialmente: Phase 1 NO renombra nada, pero AGREGA estado (columna + tabla). Se documenta lo que el deploy debe coordinar.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Ninguna columna `is_admin` ni tabla `audit_log` existe hoy (grep verificado vacío). | Migración `030_*` aplicada A MANO y en orden (convención del repo); luego setear `is_admin=true` para el usuario operador (UPDATE manual o admin API). |
| Live service config | `set-plan` usa `ADMIN_SECRET` (env var, no en git). No cambia en Phase 1. | None — el CRM usa sesión, no toca `ADMIN_SECRET`. |
| OS-registered state | Ninguno (no hay tasks/crons relacionados al CRM). | None. |
| Secrets/env vars | `SUPABASE_SERVICE_ROLE_KEY` (para `logAudit`/admin client) ya existe. No se agregan secrets nuevos en Phase 1. | None — verificar que el service-role key esté presente en Vercel. |
| Build artifacts | `supabase/schema.sql` está desactualizado vs migraciones (MEMORY: pendiente regenerar) — el último commit `3ef7bae` lo regeneró vía `db dump`. | Tras aplicar `030`, regenerar `schema.sql` con `supabase db dump` para mantenerlo en sync. |

**Nothing found:** `is_admin` y `audit_log` son net-new — verificado por grep en todo el repo (no node_modules).

## Schema SQL propuesto — migración `030_crm_foundations.sql`

> Próximo número de migración: **030** (último aplicado: `029_drop_public_read_appointments_policy.sql`, verificado).
> Aplicar la skill `supabase-multitenant-rls`: RLS habilitada en la misma migración, una policy por operación, `service_role` solo server-side.

```sql
-- 030: cimientos del CRM super-admin — flag is_admin + tabla audit_log
-- (FND-01, FND-02). Aplicar a mano y en orden. Coordinar con el deploy.

-- ── 1. Flag is_admin (variante columna-en-businesses) ──────────────────────
-- Si discuss-phase elige app_metadata en vez de columna, OMITIR este bloque
-- y setear el flag vía supabase.auth.admin.updateUserById(...).
alter table public.businesses
  add column if not exists is_admin boolean not null default false;

-- ── 2. Tabla audit_log (GLOBAL, admin-only) ────────────────────────────────
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid not null references auth.users(id) on delete set null,
  action       text not null,                 -- 'set_plan','suspend','impersonate',...
  target_type  text not null,                 -- 'business','plan','user'
  target_id    text,                          -- id de la entidad afectada (texto: puede no ser uuid)
  business_id  uuid references public.businesses(id) on delete set null,
  risk         text not null default 'medio'  -- 'alto'|'medio'|'bajo' (columna Riesgo del prototipo)
               check (risk in ('alto','medio','bajo')),
  reason       text,                          -- obligatorio a nivel app en impersonación
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_business_id_idx on public.audit_log (business_id);
create index if not exists audit_log_action_idx      on public.audit_log (action);

-- ── 3. RLS: tabla admin-only. anon/owner NO ven nada; solo is_admin lee. ────
-- La ESCRITURA va por service-role (createAdminClient bypassa RLS), por eso
-- NO se define policy de insert para usuarios autenticados.
alter table public.audit_log enable row level security;

-- SELECT solo para operadores con is_admin (variante columna-en-businesses):
create policy "audit_log admin read" on public.audit_log
  for select using (
    exists (
      select 1 from public.businesses b
      where b.owner_id = (select auth.uid()) and b.is_admin = true
    )
  );
-- Sin policy de insert/update/delete para authenticated/anon → solo service-role escribe.
-- (Si is_admin vive en app_metadata, reemplazar el exists() por:
--   ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true') )
```

**Notas de seguridad (checklist `supabase-multitenant-rls`):**
- [x] RLS habilitada en la misma migración.
- [x] `audit_log` NO lleva policy de insert/update/delete para usuarios → solo service-role escribe (correcto: el audit no debe ser falsificable por un cliente).
- [x] La policy de SELECT no es `using(true)` — restringe a `is_admin` (evita el agujero de la migración 029).
- [x] `service_role` solo en server (`logAudit` usa `createAdminClient`).
- [ ] Probar la policy con un usuario NO-admin: debe ver 0 filas.
- Nota: `audit_log` es una tabla GLOBAL (cross-tenant a propósito: registra acciones del operador sobre cualquier negocio). NO lleva el patrón `business_id IN (negocios del dueño)` típico; `business_id` acá es solo referencia de la entidad afectada, no scope de aislamiento.

## Tokens de tema + componentes (FND-04)

**Verificado en `app/globals.css`:**
- Modo dark = clase `.dark` en `<html>`, manejada por `next-themes` (`@custom-variant dark`). Dark tokens en `globals.css:107-132`.
- Los acentos del CRM YA existen como constantes Bauhaus palette-independent:
  - amarillo `#f4c543` → `--chart-3` light (`globals.css:91`); dark `#e6b53f`.
  - azul `#2a5fa5` → `--chart-2` (`globals.css:90`).
  - rojo de marca `#d94a2b` (light) / `#e85c3f` (dark) → es el `--primary` default y `data-palette="red"`.
- `--destructive` light `#b23a26` / dark `#e05c43` — **el brief §12 dice NO usar este; el rojo de peligro del CRM es el rojo de marca `#d94a2b`/`#e85c3f`, un solo rojo.**

**Cómo forzar dark + acentos del CRM sin romper el theming por-negocio:**
- El root layout fuerza `defaultTheme="light"` + `enableSystem={false}` (`app/layout.tsx:55`) y `data-palette="red"` en `<html>` (`app/layout.tsx:51`). El dashboard sobrescribe la paleta por-negocio vía `PaletteScript`.
- **Recomendación:** el layout del CRM NO usa `PaletteScript` (eso es per-business). En su lugar:
  1. Envolver el subtree del CRM en `<div className="dark">` para forzar los tokens dark localmente (la variante `&:is(.dark *)` aplica a descendientes). Esto NO cambia `next-themes` global ni afecta al dashboard.
  2. Como el CRM se ancla al tema Forjo DEFAULT (sin `data-theme`, sin `data-font`), no setear esos atributos — heredan el default.
  3. El primario del CRM es AMARILLO (no el rojo default). Definir un scope CSS para el CRM (ej. `[data-surface="crm"]` o una clase `.crm-shell`) que mapee `--primary`/`--accent`/`--ring` a `#f4c543` (dark `#e6b53f`) y reserve el rojo `#d94a2b`/`#e85c3f` SOLO para variantes de peligro. Documentar este bloque junto a las paletas en `globals.css`.
- **Toaster:** hay UN solo `<Toaster>` global montado en root con `theme={theme}` de next-themes (`components/ui/sonner.tsx:8`). Como el CRM fuerza dark localmente pero next-themes sigue en "light" globalmente, los toasts del CRM saldrían en tema light. Decidir en plan-phase si se monta un Toaster scoped al CRM o se acepta. (Riesgo menor — los toasts usan tokens `--popover`.)

**Componentes shadcn/base-ui existentes a reusar (verificado en `components/ui/`):**
`button`, `input`, `label`, `textarea`, `select`, `card`, `badge` (variantes default/secondary/destructive/outline/ghost/link), `table`, `tabs`, `drawer`, `sonner`, `avatar`, `separator`, `dialog`, `calendar`. **Todos disponibles.**

**Sidebar agrupado:** NO existe un sidebar agrupado del "milestone rebrand" en el codebase actual — el único `Sidebar` (`components/dashboard/sidebar.tsx`) es flat y business-scoped (nav plano por vertical, sin grupos). El CRM debe crear su **propio** `CrmSidebar` agrupado desde cero (reusando `lucide-react` + tokens). El rebrand de Gestión (MEMORY) tiene diseño aprobado pero su sidebar agrupado aún no está implementado en este repo.

## Common Pitfalls

### Pitfall 1: Render parcial antes del redirect (guard débil)
**What goes wrong:** Validar `is_admin` en client o renderizar children y luego redirigir → la UI sensible se manda al browser de un no-admin.
**Why it happens:** Poner el check en un componente client o después del JSX.
**How to avoid:** Guard en el layout RSC async, `redirect()` ANTES de retornar JSX (patrón `app/(dashboard)/layout.tsx:15`). `redirect()` lanza, así que corta la ejecución.
**Warning signs:** El check usa `useEffect`/`useState`; o el `redirect` está dentro de un `try`.

### Pitfall 2: Server action confía en que pasó el ConfirmDialog
**What goes wrong:** La acción peligrosa asume que si llegó es porque el usuario confirmó/es admin → un request directo (curl, devtools) salta el dialog y el guard del layout.
**Why it happens:** El guard del layout NO protege server actions/route handlers invocadas directamente; solo protege el render.
**How to avoid:** `requireAdmin()` al inicio de CADA server action/route handler del CRM. La UI deshabilitada es refuerzo, no garantía (igual que el read-only de impersonación en Phase 3).
**Warning signs:** Una mutación del CRM sin llamada a `requireAdmin()` en sus primeras líneas.

### Pitfall 3: `proxy.ts` no matchea `/admin`
**What goes wrong:** `proxy.ts` tiene `KNOWN_PREFIXES` explícito (`proxy.ts:4-15`) que NO incluye `/admin`. Cualquier ruta fuera de la lista que no sea `/` retorna `NextResponse.next()` sin refrescar sesión → la cookie de sesión puede no refrescarse en `/admin`, causando `getUser()` stale.
**Why it happens:** El matcher de Next sí matchea `/admin` (regex amplio), pero el `if (!isKnownRoute && pathname !== '/')` lo deja pasar SIN `updateSession`.
**How to avoid:** Agregar `'/admin'` a `KNOWN_PREFIXES` en `proxy.ts:4-15`. Opcional (defensa en profundidad): en `updateSession` (`lib/supabase/middleware.ts:30-43`) agregar `/admin` a la lógica de rutas protegidas y redirigir si `!user`. El check de `is_admin` en sí queda mejor en el layout (la columna requiere query a DB; el JWT solo si se usa app_metadata).
**Warning signs:** Sesión expira en `/admin` sin re-login; `getUser()` retorna null intermitente.

### Pitfall 4: `audit_log` sin RLS o con SELECT abierto
**What goes wrong:** Olvidar `enable row level security`, o poner `using(true)` → cualquier usuario autenticado lee TODO el log de auditoría (incluye qué negocios tocó el operador). Es exactamente el agujero que cerró la migración 029.
**Why it happens:** Tabla nueva, RLS off por default; o copiar una policy permisiva.
**How to avoid:** RLS on en la misma migración + policy SELECT restringida a `is_admin`. Sin policy de insert para usuarios (solo service-role escribe).
**Warning signs:** Un usuario no-admin puede `select` de `audit_log` y ve filas.

### Pitfall 5: Forzar dark rompe el dashboard
**What goes wrong:** Mutar `next-themes` a dark global o cambiar `defaultTheme` en root → el dashboard (que es light-first por-negocio) se rompe.
**Why it happens:** Pensar el tema como global cuando el CRM es una isla.
**How to avoid:** `className="dark"` scoped al subtree del CRM en su layout; no tocar `app/layout.tsx` ni `PaletteScript`.
**Warning signs:** El dashboard aparece en dark; los toasts de la app cambian de tema.

### Pitfall 6: Operador sin business → `.single()` explota
**What goes wrong:** Si `is_admin` vive en `businesses` y el operador no completó onboarding, `.single()` tira error y el guard falla raro.
**Why it happens:** El dashboard usa `.single()` asumiendo que el user tiene business.
**How to avoid:** En el guard del CRM usar `.maybeSingle()` y tratar `null` como no-admin (redirect). O usar app_metadata (independiente de business).
**Warning signs:** Error 500 en `/admin` para un user sin onboarding.

## Code Examples

Ver los bloques en "Architecture Patterns" (Pattern 1-4) — todos derivados de patrones verificados del codebase (`app/(dashboard)/layout.tsx`, `lib/supabase/admin.ts`, `app/api/admin/set-plan/route.ts`, `components/ui/dialog.tsx`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` (Next 16) | Next 16 | El guard de Edge va en `proxy.ts`; no crear `middleware.ts` `[VERIFIED: proxy.ts + .claude/CLAUDE.md]` |
| `redirect()` en `try` | `redirect()` fuera de `try/catch` | Next 13+ | Lanza una excepción de control; dentro de try se traga `[CITED: node_modules/next/dist/docs/.../redirect.md:50-52]` |

**Deprecated/outdated:** nada relevante para Phase 1.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `is_admin` se modela como columna en `businesses` (vs app_metadata) | Decisión clave | Si el operador no tiene business o se prefiere el flag en el usuario, cambia el SQL de la migración 030 y el guard. discuss-phase debe confirmar. Bajo riesgo técnico (ambas funcionan), alto impacto en el shape del SQL. |
| A2 | El operador (Forjo) tiene un `business` propio en la tabla | Decisión clave / Pitfall 6 | Si no lo tiene, la variante columna-en-businesses no tiene dónde colgar el flag → forzaría app_metadata. |
| A3 | El nivel de riesgo (`alto`/`medio`/`bajo`) se persiste en `audit_log` como columna | Schema SQL | El prototipo muestra columna Riesgo (brief §11); si el operador la quiere derivada en vez de almacenada, sobra la columna. Bajo riesgo. |
| A4 | El CRM acepta toasts en tema light (un solo Toaster global) o monta uno scoped | Tokens de tema | Cosmético; resolver en plan-phase. |

**Las assumptions A1/A2 son las que discuss-phase debe cerrar antes de planificar la migración 030.**

## Open Questions

1. **¿`is_admin` en `businesses` o en `auth.users.app_metadata`?**
   - What we know: ninguno existe hoy; ambos son viables; el modelo es dueño-solo.
   - What's unclear: si el operador siempre tendrá un business propio.
   - Recommendation: presentar las dos opciones a discuss-phase con el tradeoff (simplicidad de lectura vs no-tocable-por-el-dueño). Default sugerido: columna en businesses con `.maybeSingle()` defensivo.

2. **¿Cómo se setea `is_admin=true` la primera vez? (bootstrap)**
   - What we know: no es self-serve (brief §7, "llaves del reino", Out of Scope).
   - What's unclear: si se setea por UPDATE manual en Supabase, por env-gated endpoint, o por admin API.
   - Recommendation: en Phase 1, UPDATE manual documentado (más simple y seguro); el otorgar is_admin se auditará cuando exista la acción, pero el bootstrap inicial es manual fuera del panel.

3. **¿`/admin` o `/crm` como prefijo de URL?**
   - What we know: brief y requirements dicen `/admin` (FND-01).
   - Recommendation: usar `/admin` (route group `(crm)` → ruta `admin`). Agregar `/admin` a `KNOWN_PREFIXES` y al matcher.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (Postgres + Auth) | guard, audit_log, is_admin | ✓ | proyecto activo | — |
| `SUPABASE_SERVICE_ROLE_KEY` | `logAudit` / admin client | ✓ (env) | — | sin él, no se puede escribir audit (bloqueante) |
| Vitest | tests de RLS/guard | ✓ | (vitest.config.mts presente) | — |
| Migración aplicada a mano | 030_crm_foundations.sql | manual | — | aplicar antes del deploy del código que la usa |

**Missing dependencies with no fallback:** ninguna — todo el stack está disponible.

## Security Domain

> `security_enforcement: true`, ASVS L1. Esta fase ES la superficie de seguridad más sensible del sistema.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Defensa en profundidad: guard en layout RSC + `requireAdmin()` en cada action + (opcional) proxy.ts |
| V2 Authentication | yes | Sesión Supabase (`auth.getUser()`); `is_admin` no self-serve |
| V4 Access Control | yes | Guard server-side `is_admin`; RLS admin-only en `audit_log`; service-role solo server |
| V5 Input Validation | yes | `zod` + narrowing defensivo en server actions; validar `action`/`target` del audit |
| V6 Cryptography | yes | `crypto.timingSafeEqual` para `ADMIN_SECRET` (ya implementado; no hand-roll) |
| V7 Logging | yes | `audit_log` registra toda acción sensible (quién/qué/cuándo/motivo/riesgo) — ES el control central de FND-02 |

### Known Threat Patterns for Next 16 + Supabase super-admin

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| No-admin accede a `/admin` (render parcial) | Elevation of Privilege | Guard server-side en layout + redirect antes de JSX (Pitfall 1) |
| Server action invocada directo sin pasar el dialog/guard | Elevation of Privilege | `requireAdmin()` al inicio de cada action (Pitfall 2) |
| Audit log falsificable o leído por terceros | Repudiation / Information Disclosure | RLS admin-only read, insert solo service-role (Pitfall 4) |
| Sesión stale en `/admin` por proxy que no refresca | Spoofing | Agregar `/admin` a `KNOWN_PREFIXES` (Pitfall 3) |
| Fuga cross-tenant a través del CRM | Information Disclosure | El CRM lee con service-role acotado por `business_id` (regla central; crítico en Phase 3) |

## Sources

### Primary (HIGH confidence)
- `app/(dashboard)/layout.tsx:11-23` — patrón canónico de layout-as-guard server-side
- `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/supabase/middleware.ts` — factories de cliente verificados
- `proxy.ts:4-36` — matcher y KNOWN_PREFIXES (Next 16, no middleware.ts)
- `app/api/admin/set-plan/route.ts:16-63` — ADMIN_SECRET timingSafeEqual + lógica de plan reusable
- `supabase/migrations/029_*.sql` — convención de migración + lección del agujero de RLS abierto
- `supabase/schema.sql:91-126` — columnas reales de `businesses` (no hay is_admin)
- `app/globals.css:88-150` — tokens, dark mode, paletas, acentos Bauhaus (#f4c543/#2a5fa5/#d94a2b)
- `app/layout.tsx:47-62` — root fuerza light + data-palette red + Toaster global
- `components/ui/dialog.tsx`, `components/ui/badge.tsx`, `components/ui/sonner.tsx` — componentes a reusar
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — reglas de RLS y checklist
- `node_modules/next/dist/docs/.../redirect.md:9-55` — comportamiento de `redirect()`

### Secondary (MEDIUM confidence)
- `forjo-crm-admin-brief.md` §1/§6/§7/§11/§12 — decisiones LOCKED y comportamientos a preservar
- Grep verificado: `is_admin`, `profiles`, `app_metadata` → 0 resultados en el repo (todo net-new)

### Tertiary (LOW confidence)
- app_metadata como ubicación canónica de roles en Supabase — conocimiento general `[CITED: supabase docs]`, no verificado en sesión contra docs en vivo

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — cero paquetes nuevos, todo verificado en package.json/codebase
- Architecture: HIGH — patrones calcados de archivos reales con líneas citadas
- Pitfalls: HIGH — derivados del código real (proxy KNOWN_PREFIXES, migración 029, root layout light)
- Decisión is_admin: MEDIUM — dos opciones válidas, requiere confirmación del operador

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (stack estable; revalidar si cambia el modelo de auth o se agrega tabla profiles)
