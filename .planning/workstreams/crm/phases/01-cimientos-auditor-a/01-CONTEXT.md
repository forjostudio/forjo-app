# Phase 1: Cimientos & Auditoría - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning
**Source:** forjo-advisor (decisiones técnicas) sobre las Open Questions del 01-RESEARCH.md + brief LOCKED

<domain>
## Phase Boundary

Phase 1 monta la base de seguridad transversal del CRM super-admin sobre el codebase multi-tenant existente: guard server-side de `/admin`, tabla `audit_log`, patrón de doble confirmación reutilizable y shell de UI anclado al tema Forjo default en modo oscuro. Todo lo demás del milestone (Phases 2-6) se monta encima. Requirements: FND-01..04.
</domain>

<decisions>
## Implementation Decisions

Estas decisiones están CERRADAS (resueltas por forjo-advisor sobre las Open Questions del research). El planner NO las re-litiga.

### D1 — `is_admin` vive en `auth.users.app_metadata` (NO columna en businesses)
- `is_admin` es propiedad del USUARIO, no de un negocio. El brief A2 dice "flag en el usuario" y §2 que el operador NO es un tenant.
- Más restrictivo/seguro: `app_metadata` no es editable por el dueño (solo service-role/admin API) → coherente con A7 "llaves del reino, no self-serve". Aparece en el JWT (Edge puede leerlo sin query a DB).
- **Efecto en migración 030:** OMITIR el `alter table businesses add column is_admin`. La columna NO se crea.
- **Guard (FND-01):** leer `user.app_metadata?.is_admin === true` tras `auth.getUser()`; si falta o es falso → `redirect('/dashboard')` (server-side, antes del JSX, fuera de try/catch).
- **RLS de audit_log:** la policy SELECT usa `((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true')`, NO el `exists(... businesses.is_admin)` del borrador del research.
- Descarta el Pitfall 6 (operador sin business) y las Assumptions A1/A2 del research.

### D2 — Bootstrap de `is_admin` vía npm script local (NO UPDATE SQL, NO self-serve)
- Como `is_admin` vive en `app_metadata`, se setea con `supabase.auth.admin.updateUserById(userId, { app_metadata: { is_admin: true } })` usando service-role.
- Crear un script local repetible estilo `setup:mp-plans` (acepta un email/userId, setea el flag). Corre local, fuera del panel, no self-serve (§7 "llaves del reino").
- Ejecutarlo es un todo operativo del usuario (no parte del runtime web).

### D3 — Prefijo de URL: `/admin`
- Route group nuevo `app/(crm)/` → ruta `app/(crm)/admin/...`.
- Agregar `'/admin'` a `KNOWN_PREFIXES` en `proxy.ts` (hoy NO lo matchea → Pitfall 3: sesión stale). Opcional defensa-en-profundidad: chequear `is_admin` desde el JWT en `proxy.ts`/`updateSession`.

### D4 — `requireAdmin()` en CADA server action / route handler del CRM
- El guard del layout NO protege actions invocadas directo (Pitfall 2). Helper `lib/admin-guard.ts` que re-valida `is_admin` server-side y devuelve el `user` (actor del audit). La UI deshabilitada es solo refuerzo.

### D5 — `audit_log`: tabla GLOBAL admin-only, escritura solo service-role
- Migración **030** (última aplicada: 029). RLS habilitada en la misma migración. SELECT solo para `is_admin` (vía app_metadata JWT, D1). SIN policy de insert/update/delete para usuarios → solo `createAdminClient()` escribe (audit no falsificable). NO usar `using(true)` (lección de la migración 029).
- Schema (del research §"Schema SQL propuesto", adaptado a D1): `id, actor_id (→auth.users), action, target_type, target_id (text), business_id (→businesses, solo referencia de entidad, NO scope de aislamiento), risk ('alto'|'medio'|'bajo' check), reason, metadata jsonb, created_at`. Índices en created_at desc, business_id, action.
- Helper `lib/audit.ts` con `logAudit({actor, action, target, businessId?, risk, reason?, metadata?})` (service-role).

### D6 — Tema: forzar dark scoped al CRM, NO themeable
- `<div className="dark">` (o scope `.crm-shell` / `[data-surface="crm"]`) en el layout del CRM; NO tocar `next-themes` global ni `PaletteScript` (rompería el theming por-negocio del dashboard — Pitfall 5).
- Acentos del CRM (divergencia deliberada vs la app): primario AMARILLO `#f4c543` (dark `#e6b53f`, ya `--chart-3`), azul info `#2a5fa5` (`--chart-2`), rojo `#d94a2b`/`#e85c3f` SOLO peligro (NO el token `--destructive`; un solo rojo, §12). Mapear `--primary`/`--accent`/`--ring` a amarillo en el scope del CRM.
- Resolver en plan/build: Toaster scoped al CRM (dark) vs el global light (riesgo cosmético menor).

### D7 — Doble confirmación escalonada (FND-03)
- `ConfirmDialog` reutilizable sobre el `Dialog` de `@base-ui/react` ya instalado. Niveles (preservar del prototipo, brief §11): confirmación simple (cambiar plan); type-to-confirm con palabra (Suspender→"SUSPENDER", Impersonar→"VER", Editar precio→"CONFIRMAR"); motivo obligatorio donde aplique (impersonación, Phase 3). La garantía real vive server-side (D4), el dialog es UX.

### Claude's Discretion
- Estructura exacta de archivos dentro de `app/(crm)/`, `components/crm/`, `lib/` (seguir la estructura sugerida del research §"Recommended Project Structure").
- Naming de columnas/índices puntuales de `audit_log` dentro del schema propuesto.
- Si el `CrmSidebar` agrupado se entrega completo en Phase 1 o como placeholder navegable (Phase 1 entrega el shell; las pantallas con datos son Phases 2+).
- Cero paquetes npm nuevos (el research lo confirma).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research y requirements de la fase
- `.planning/workstreams/crm/phases/01-cimientos-auditor-a/01-RESEARCH.md` — patrones verificados, schema SQL, pitfalls, tokens, Security Domain (ASVS L1)
- `.planning/workstreams/crm/REQUIREMENTS.md` — FND-01..04 + Out of Scope
- `.planning/workstreams/crm/ROADMAP.md` — Phase 1 success criteria + dependencias

### Patrones del codebase a calcar (rutas reales)
- `app/(dashboard)/layout.tsx:11-23` — layout-as-guard server-side (modelo de FND-01)
- `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/supabase/middleware.ts` — factories de cliente
- `proxy.ts:4-36` — `KNOWN_PREFIXES` + matcher (agregar `/admin`)
- `app/api/admin/set-plan/route.ts:16-63` — `ADMIN_SECRET` timingSafeEqual + lógica de plan (NO tocar en Phase 1; reuso en Phase 2)
- `supabase/migrations/029_*.sql` — convención de migración + lección del agujero RLS
- `app/globals.css:88-150` — tokens, dark mode, paletas, acentos (#f4c543/#2a5fa5/#d94a2b)
- `app/layout.tsx:47-62` — root fuerza light + Toaster global (NO tocar)
- `components/ui/dialog.tsx`, `badge.tsx`, `sonner.tsx` — componentes a reusar

### Reglas del proyecto
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — checklist de RLS (D5)
- `.claude/skills/convenciones-forjo/SKILL.md` — naming, estructura, manejo de errores
- Brief (NO en repo): `c:\Users\franc\Desktop\Forjo Studio\forjo-crm-admin-brief.md` §1/§6/§7/§11/§12
- Diseño aprobado (referencia visual): `c:\Users\franc\Desktop\Forjo Studio\crm-design\`
</canonical_refs>

<specifics>
## Specific Ideas

- Orden de build dentro de la fase: `audit_log` + `requireAdmin()`/`logAudit()` + guard PRIMERO (todo lo demás escribe sobre ellos), luego shell + ConfirmDialog.
- El UI-SPEC de esta fase se genera aparte vía `/gsd:ui-phase 1 --ws crm` (decisión del operador) — el planner debe consumir el `01-UI-SPEC.md` resultante.
- `redirect()` SIEMPRE fuera de try/catch (lanza para cortar la ejecución).
</specifics>

<deferred>
## Deferred Ideas

- Otorgar `is_admin` desde el panel (self-serve) — Out of Scope del milestone (§7); el bootstrap es manual vía script (D2). La acción de otorgar is_admin, cuando exista, se auditará (FND-02), pero no es parte de Phase 1.
- Las pantallas con datos (directorio, ficha, impersonación, pipeline, comms, reportes) son Phases 2-6; Phase 1 entrega solo los cimientos + shell.
</deferred>

---

*Phase: 01-cimientos-auditor-a*
*Context gathered: 2026-06-17 via forjo-advisor sobre RESEARCH.md Open Questions*
