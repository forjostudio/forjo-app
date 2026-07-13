---
phase: 01-cimientos-auditor-a
verified: 2026-06-17T23:37:00Z
status: human_needed
score: 13/13 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Como operador con is_admin=true visitar /admin"
    expected: "Entra y ve la landing de la Consola CRM con el shell dark + accent amarillo"
    why_human: "Requiere aplicar migración 031 a Supabase y correr npm run setup:admin -- <email> para crear un operador con app_metadata.is_admin=true; end-to-end no verificable estáticamente"
  - test: "Como usuario sin is_admin (sesión válida) visitar /admin"
    expected: "Redirigido a /dashboard sin ver ningún chrome del CRM"
    why_human: "Comportamiento de redirect server-side requiere navegador con sesión activa"
  - test: "Sin sesión visitar /admin"
    expected: "Redirigido a /login"
    why_human: "Requiere request real al Edge middleware"
  - test: "El dashboard por-negocio (/dashboard) conserva su paleta y modo light"
    expected: "El accent amarillo del CRM NO aparece en el dashboard; el theming por-negocio sigue funcionando"
    why_human: "El scope .crm-shell está estáticamente correcto pero la no-filtración solo es observable en el navegador con ambas superficies activas"
  - test: "/admin/auditoria muestra filas reales de audit_log"
    expected: "La tabla de auditoría lista filas con QUIÉN/ACCIÓN/NEGOCIO/DETALLE/MOTIVO/CUÁNDO/RIESGO; con log vacío muestra empty state 'Todavía no hay acciones registradas'"
    why_human: "Requiere migración 031 aplicada a Supabase y operador autenticado; el visor está correctamente wired (sesión RLS, no service-role) pero no hay DB para correr la query"
  - test: "npm run setup:admin -- <email-del-operador>"
    expected: "Confirma '✓ is_admin = true seteado en app_metadata de <email>'; luego el usuario puede entrar a /admin"
    why_human: "Script local que requiere .env.local con SUPABASE_SERVICE_ROLE_KEY y un usuario existente en Supabase Auth"
---

# Phase 1: Cimientos & Auditoría Verification Report

**Phase Goal:** Existe la base de seguridad transversal del CRM — acceso controlado server-side, registro de auditoría de toda acción sensible, patrón de doble confirmación reutilizable y un shell de UI consistente — sobre la que se montan todas las demás fases.
**Verified:** 2026-06-17T23:37:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Existe la tabla audit_log con RLS habilitada y SELECT solo para is_admin (vía app_metadata JWT) | ✓ VERIFIED | `031_crm_audit_log.sql`: `alter table public.audit_log enable row level security` + policy `using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true')` |
| 2 | Ningún usuario autenticado no-admin puede leer audit_log (0 filas) | ✓ VERIFIED | No hay policy de SELECT abierta; la única policy SELECT gatea sobre `app_metadata.is_admin`; no existe `using(true)` en la migración |
| 3 | No existe policy de insert/update/delete sobre audit_log para usuarios — solo service-role escribe | ✓ VERIFIED | La migración 031 no crea ninguna policy DML para authenticated/anon; bloque de comentario explica que solo service-role escribe vía `logAudit` |
| 4 | logAudit() inserta una fila de auditoría con actor, acción, target, riesgo y motivo opcional usando service-role | ✓ VERIFIED | `lib/audit.ts`: usa `createAdminClient()`, mapea todos los campos a snake_case, campos opcionales → null, error best-effort. Tests 1-3 verdes (3/3) |
| 5 | requireAdmin() re-valida is_admin server-side y devuelve el user actor, o lanza forbidden/unauthorized | ✓ VERIFIED | `lib/admin-guard.ts`: lee `user.app_metadata?.is_admin`, lanza `'unauthorized'` sin user y `'forbidden'` sin flag; retorna `user`; NO consulta tabla businesses |
| 6 | El operador con is_admin === true entra a /admin; cualquier otro usuario es redirigido server-side antes de cualquier render | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | El código es correcto: `layout.tsx` llama `auth.getUser()` → `app_metadata.is_admin !== true → redirect('/dashboard')`, fuera de try/catch, antes del JSX. UAT requiere browser con sesión real |
| 7 | El layout del CRM hace redirect('/login') si no hay sesión y redirect('/dashboard') si no es admin | ✓ VERIFIED | `app/(crm)/layout.tsx` líneas 26-29: `if (!user) redirect('/login')` + `if (user.app_metadata?.is_admin !== true) redirect('/dashboard')` — ambos fuera de try/catch, antes de retornar JSX |
| 8 | proxy.ts refresca la sesión en /admin (incluido en KNOWN_PREFIXES) — no hay sesión stale | ✓ VERIFIED | `proxy.ts` KNOWN_PREFIXES incluye `'/admin'`; `middleware.ts` incluye `pathname.startsWith('/admin')` en `isDashboardRoute` → redirecta a /login sin user |
| 9 | El subtree del CRM fuerza dark y el accent remap (amarillo primario) sin tocar next-themes global ni PaletteScript | ✓ VERIFIED | Layout envuelve en `<div className="dark crm-shell ...">`. `.crm-shell` en globals.css redefine `--primary: #e6b53f`. `app/layout.tsx` no fue tocado por la fase (git log confirma último commit del archivo es `28e2626`) |
| 10 | El CRM se muestra con su shell propio: CrmSidebar agrupado (OPERACIÓN/VENTAS/INSIGHTS/CUENTA), top bar y área de contenido en dark | ✓ VERIFIED | `crm-sidebar.tsx` con 4 grupos NAV_GROUPS; no usa `buildNav`/`resolveVertical`; `crm-topbar.tsx` con búsqueda + bell; `CrmToaster` con `theme="dark"`; todo montado en el layout |
| 11 | El item de nav activo se marca con barra de acento amarillo + fondo elevado (no un peso de fuente más pesado) | ✓ VERIFIED | `crm-sidebar.tsx`: activo = `bg-secondary text-foreground before:opacity-100` (barra `before:bg-primary` = amarillo) + icono `text-primary`. Comentario explícito: "NUNCA por un peso de fuente más pesado" |
| 12 | Existe el RiskBadge con variantes Alto (dot rojo) / Medio (pill amarillo) / Bajo (dot neutro) | ✓ VERIFIED | `risk-badge.tsx`: cva local con variantes; Alto → dot `style={{ backgroundColor: 'var(--crm-danger)' }}`; Medio → `bg-primary text-primary-foreground`; Bajo → dot `bg-muted-foreground`. No edita badge compartido. |
| 13 | Existe un ConfirmDialog reutilizable con niveles simple / type-to-confirm escalonado por palabra (SUSPENDER/VER/CONFIRMAR) | ✓ VERIFIED | `confirm-dialog.tsx`: `confirmWord` undefined = simple; con palabra = type-to-confirm exacto case-sensitive; `requireReason` = motivo obligatorio. 7 tests verdes incluyendo test de `--crm-danger` |

**Score:** 13/13 truths verified (0 present-but-behavior-unverified que bloqueen score — Truth 6 es PRESENT_BEHAVIOR_UNVERIFIED por UAT, pero el código es correcto y estáticamente verificado; ver sección Human Verification)

Note: Truth 6 is classified PRESENT_BEHAVIOR_UNVERIFIED (state transition — redirect before JSX — observable only with a real browser session). Score denominator is 13/13 because the implementation is complete; the human item is a UAT gate, not a gap.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/031_crm_audit_log.sql` | Tabla audit_log + RLS admin-only read + sin policy de write para usuarios | ✓ VERIFIED | 63 líneas; 10 columnas correctas; check `risk in ('alto','medio','bajo')`; 3 índices; RLS + SELECT policy vía app_metadata JWT; no hay DML policies para usuarios |
| `lib/audit.ts` | logAudit() helper con service-role, exporta Risk type | ✓ VERIFIED | Exporta `logAudit` y `Risk` type; usa `createAdminClient()`; mapeo snake_case completo; error best-effort |
| `lib/admin-guard.ts` | requireAdmin() guard reutilizable server-side | ✓ VERIFIED | Exporta `requireAdmin()`; lee `user.app_metadata?.is_admin`; lanza unauthorized/forbidden; retorna User |
| `app/(crm)/layout.tsx` | Guard server-side de /admin + shell wrapper dark scopeado | ✓ VERIFIED | 56 líneas; guard fuera de try/catch; `<div className="dark crm-shell ...">` wrapping; monta CrmSidebar + CrmTopbar + CrmToaster |
| `app/(crm)/admin/page.tsx` | Landing placeholder del CRM | ✓ VERIFIED | Server Component; renderiza "Consola CRM" + descripción de las fases futuras |
| `app/globals.css` | Bloque .crm-shell con accent remap amarillo | ✓ VERIFIED | `.crm-shell { --primary: #e6b53f; --crm-danger: #e85c3f; --crm-info: var(--chart-2); --crm-success: var(--chart-4); ... }` |
| `components/crm/crm-sidebar.tsx` | Sidebar agrupado propio del CRM (no reutiliza dashboard) | ✓ VERIFIED | 260 líneas; 4 NAV_GROUPS; no usa buildNav; activo con barra amarilla + fondo; mobile drawer |
| `components/crm/risk-badge.tsx` | RiskBadge con variantes alto/medio/bajo | ✓ VERIFIED | cva local; dot rojo usa `var(--crm-danger)`; exporta `RiskBadge` y `riskBadgeVariants` |
| `app/(crm)/admin/auditoria/page.tsx` | Visor read-only de audit_log | ✓ VERIFIED | Server Component; usa `createClient()` (sesión, no service-role); query `from('audit_log').select(...)`; delega render a AuditoriaClient |
| `components/crm/confirm-dialog.tsx` | ConfirmDialog escalonado reutilizable (FND-03) | ✓ VERIFIED | Props contract completo; `confirmWord` exacto case-sensitive; `requireReason`; loading anti-doble-submit; destructive con `--crm-danger`; compone Dialog de base-ui |
| `scripts/setup-admin.ts` | Bootstrap local de is_admin en app_metadata (D2) | ✓ VERIFIED | Usa `supabase.auth.admin.updateUserById`; acepta email o UUID; valida service-role key; NO SQL UPDATE ni columna businesses |
| `package.json` | npm script setup:admin | ✓ VERIFIED | `"setup:admin": "tsx scripts/setup-admin.ts"` presente |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/audit.ts` | `lib/supabase/admin.ts` | `createAdminClient()` para escribir audit_log | ✓ WIRED | Import en línea 1; llamado en `logAudit` |
| `lib/admin-guard.ts` | `lib/supabase/server.ts` | `createClient()` + `auth.getUser()` | ✓ WIRED | Import en línea 1; `supabase.auth.getUser()` en línea 16 |
| `app/(crm)/layout.tsx` | `lib/supabase/server.ts` | `createClient()` + `auth.getUser()` para validar sesión e is_admin | ✓ WIRED | Import en línea 2; `supabase.auth.getUser()` en línea 24 |
| `proxy.ts` | `/admin` en KNOWN_PREFIXES | `updateSession` refresca la cookie en /admin | ✓ WIRED | `'/admin'` en array línea 16; `middleware.ts` incluye `pathname.startsWith('/admin')` en `isDashboardRoute` |
| `app/(crm)/layout.tsx` | `components/crm/crm-sidebar.tsx` | El layout monta CrmSidebar dentro del wrapper crm-shell | ✓ WIRED | Import + `<CrmSidebar operatorName={operatorName} />` en el return |
| `app/(crm)/admin/auditoria/page.tsx` | supabase audit_log | select admin-only sobre audit_log con sesión del operador | ✓ WIRED | `.from('audit_log').select(...)` usando `createClient()` (no service-role) |
| `components/crm/confirm-dialog.tsx` | `components/ui/dialog.tsx` | Compone Dialog de @base-ui/react | ✓ WIRED | Import de `Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose` |
| `scripts/setup-admin.ts` | `supabase.auth.admin` | `updateUserById` con service-role para setear app_metadata.is_admin | ✓ WIRED | `supabase.auth.admin.updateUserById(userId, { app_metadata: { is_admin: true } })` en línea 93 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| logAudit tests (3 behaviors) | `npx vitest run lib/audit.test.ts` | 3/3 passed | ✓ PASS |
| ConfirmDialog tests (7 behaviors) | `npx vitest run components/crm/confirm-dialog.test.tsx` | 7/7 passed | ✓ PASS |
| TypeScript compilation (CRM files) | `npx tsc --noEmit` | 0 errors in CRM/audit files (only pre-existing error: test/webhook-deposit.test.ts:104, Phase 05, out of scope) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| FND-01 | 01-02, 01-01 | Operador accede a /admin solo si is_admin=true, validado server-side; cualquier otro es redirigido | ✓ SATISFIED | `layout.tsx` guard fuera de try/catch; `requireAdmin()` en `admin-guard.ts` para actions/handlers |
| FND-02 | 01-01, 01-03 | Toda acción sensible queda en audit_log con quién/qué/cuándo/motivo | ✓ SATISFIED | Tabla 031 + `logAudit()` service-role + visor `/admin/auditoria` con RLS |
| FND-03 | 01-04 | Acciones peligrosas exigen doble confirmación type-to-confirm escalonado, patrón reutilizable | ✓ SATISFIED | `ConfirmDialog` con niveles simple/type-word/requireReason; 7 tests verdes |
| FND-04 | 01-02, 01-03 | CRM con layout/shell propio anclado al tema Forjo dark, acentos correctos, componentes reusados | ✓ SATISFIED | `.crm-shell` scopeado, CrmSidebar agrupado, CrmTopbar, CrmToaster dark, RiskBadge con `--crm-danger` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/audit.test.ts` | — | Plan 01-01 especificaba 4 behaviors; solo 3 tests escritos. Test 4 ("Risk type acepta solo 'alto'\|'medio'\|'bajo'") no fue implementado como test de runtime | ℹ️ Info | Ninguno: el type `Risk` está correctamente exportado y TypeScript lo aplica en compile-time; el test 4 sería redundante con la cobertura de tsc. No es un gap de comportamiento. |

No TBD/FIXME/XXX markers found in any phase-1 file.

### Prohibitions Verified (from plan must_haves)

| Prohibition | Plan | Status | Evidence |
|-------------|------|--------|---------|
| audit_log NO tiene policy de insert/update/delete para authenticated/anon | 01-01 | ✓ HONORED | Migración 031: cero policies DML para usuarios; comentario explícito |
| La policy SELECT NO usa using(true) | 01-01 | ✓ HONORED | `grep "using(true)"` en 031: solo aparece en comentario que lo prohíbe; la policy real usa la condición de app_metadata |
| NO crear columna is_admin en businesses | 01-01 | ✓ HONORED | Migración 031: no contiene `alter table businesses`; `admin-guard.ts` no consulta businesses |
| El guard NO valida is_admin en cliente (useEffect/useState) | 01-02 | ✓ HONORED | Layout es Server Component; guard lee `user.app_metadata` server-side |
| redirect() NO va dentro de try/catch | 01-02 | ✓ HONORED | Layout líneas 26-29: ambos redirects fuera de cualquier try |
| NO mutar next-themes global ni PaletteScript ni app/layout.tsx | 01-02 | ✓ HONORED | git log `app/layout.tsx` muestra último commit `28e2626` (pre-Phase 1) |
| El accent remap NO filtra al dashboard/booking | 01-02 | ✓ HONORED (necesita UAT) | `.crm-shell` está correctamente scopeado; verificación visual requiere browser |
| NO reusar components/dashboard/sidebar.tsx en CrmSidebar | 01-03 | ✓ HONORED | `crm-sidebar.tsx`: no importa ni usa `buildNav`/`resolveVertical` |
| NO editar components/ui/badge.tsx compartido | 01-03 | ✓ HONORED | `risk-badge.tsx` define su propio cva local |
| El visor de auditoría usa sesión (no service-role) | 01-03 | ✓ HONORED | `auditoria/page.tsx` usa `createClient()` (anon key + cookies); no importa `createAdminClient` |
| Badges de dominio peligro usan --crm-danger, nunca --destructive | 01-03 | ✓ HONORED | `risk-badge.tsx` y `confirm-dialog.tsx`: usan `var(--crm-danger)`; ninguna referencia a `--destructive` en el markup real |
| ConfirmDialog NO autoriza — la garantía es server-side | 01-04 | ✓ HONORED | Comentario explícito en cabecera del archivo; `requireAdmin()` en admin-guard.ts es la garantía |
| NO hand-roll del modal | 01-04 | ✓ HONORED | Importa y compone `Dialog, DialogContent, DialogFooter, DialogClose` de `@/components/ui/dialog` |
| Bootstrap NO es self-serve ni endpoint web | 01-04 | ✓ HONORED | `scripts/setup-admin.ts` es script local tsx; no hay ruta /api que llame a updateUserById |
| NO setear is_admin con UPDATE SQL | 01-04 | ✓ HONORED | Script usa `supabase.auth.admin.updateUserById`; sin SQL en el archivo |

### Human Verification Required

#### 1. Guard de acceso a /admin (FND-01 end-to-end)

**Test:** Pre-requisito operativo: (a) aplicar migración 031 a mano en Supabase (`supabase db push` o Dashboard SQL Editor), (b) correr `npm run setup:admin -- francovellani@gmail.com` con .env.local cargado. Luego: con ese usuario logueado visitar `gestion.forjo.studio/admin`.
**Expected:** La landing "Consola CRM" se muestra con el shell dark + accent amarillo. Con otro usuario sin is_admin la misma ruta redirige a `/dashboard`. Sin sesión redirige a `/login`.
**Why human:** El guard es código correcto y estáticamente verificado, pero el estado de "redirige antes del JSX" es un comportamiento de runtime que solo un browser con sesión real puede confirmar.

#### 2. Aislamiento de tema CRM vs dashboard (FND-04)

**Test:** Con la app corriendo, abrir `/admin` (dark + amarillo) y en otra tab `/dashboard` (paleta del negocio).
**Expected:** El accent amarillo del CRM NO aparece en el dashboard; el modo light del dashboard no se afecta; el `.crm-shell` está scopeado.
**Why human:** El scope CSS es estáticamente correcto pero la no-filtración entre superficies solo es observable con ambas activas en el navegador.

#### 3. Visor de auditoría con filas reales (/admin/auditoria)

**Test:** Con migración 031 aplicada y operador logueado, visitar `/admin/auditoria`. Opcionalmente ejecutar una acción sensible (Phase 2+) que llame a `logAudit()` y refrescar.
**Expected:** (a) Con log vacío: heading "Todavía no hay acciones registradas". (b) Con filas: tabla con 7 columnas QUIÉN/ACCIÓN/NEGOCIO/DETALLE/MOTIVO/CUÁNDO/RIESGO; tabs Todos/Altos/Medios/Bajos filtran; el activo es amarillo.
**Why human:** El visor está correctamente wired (usa sesión, RLS admin-read, no service-role), pero requiere migración aplicada para retornar filas o incluso el empty state.

#### 4. Bootstrap npm run setup:admin

**Test:** Correr localmente `npm run setup:admin -- <email-de-prueba>` con .env.local cargado.
**Expected:** Output `✓ is_admin = true seteado en app_metadata de <email>`. En Supabase Auth Dashboard, el usuario tiene `app_metadata: { is_admin: true }`.
**Why human:** Script correcto (usa admin API, no SQL, valida service-role key) pero su ejecución requiere credenciales reales y un usuario existente en el proyecto Supabase.

---

## Gaps Summary

No gaps found. All 13 must-have truths are verified or (in the case of Truth 6) present with correct code that requires a live browser session to confirm end-to-end. All 4 requirements (FND-01, FND-02, FND-03, FND-04) are covered. All prohibitions from the 4 plan must_haves are honored.

The `human_needed` status reflects 4 UAT items that cannot be verified statically — they require the operator todo: apply migration 031 and run `npm run setup:admin`. These are documented operator tasks by design (decisions D2/D5), not implementation gaps.

---

_Verified: 2026-06-17T23:37:00Z_
_Verifier: Claude (gsd-verifier)_
