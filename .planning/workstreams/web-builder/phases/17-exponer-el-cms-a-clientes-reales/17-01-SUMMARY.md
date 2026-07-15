---
phase: 17-exponer-el-cms-a-clientes-reales
plan: 01
subsystem: ui
tags: [cms, nextjs, feature-flag, entitlement, multi-tenant, upsell, verticals, sidebar]

# Dependency graph
requires:
  - phase: 15-guardar-no-publica
    provides: "landing_draft/landing_config partidos + guardar sin consecuencias públicas — precondición para exponer el editor"
  - phase: 16-web-de-la-skill-nace-borrador
    provides: "la web generada por la skill nace como borrador — seguro mostrar el editor sin publicar por accidente"
provides:
  - "Retiro del kill-switch global de entorno (CMS_ENABLED) de las 3 superficies TS del CMS"
  - "has_web_custom (add-on por sesión) como ÚNICO gate del CMS, sostenido en page + 3 Server Actions"
  - "Pantalla de upsell 'Web a medida' (_web-upsell.tsx) para dueños sin el add-on, en vez de 404"
  - "Ítem de nav 'Mi web' top-level en el sidebar, visible a los 4 verticales (superficie de venta)"
affects: [17-02, web-builder, cms, secure-phase-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Render condicional editor-vs-upsell en RSC page: entitlement por sesión ramifica ANTES del fetch del preview"
    - "Upsell RSC estático reusando UPGRADE_URL + patrón CTA externo de plan-banner (cero constante nueva)"
    - "Nav item data-driven: ITEMS + key en NAV_GROUPS + 'web' en el menu de cada vertical"

key-files:
  created:
    - "app/(dashboard)/web/_web-upsell.tsx"
  modified:
    - "app/(dashboard)/web/page.tsx"
    - "app/(dashboard)/web/_landing-actions.ts"
    - "app/(dashboard)/web/web-client.tsx"
    - "components/dashboard/sidebar.tsx"
    - "lib/verticals.ts"

key-decisions:
  - "El gate único post-flag es has_web_custom por sesión (owner_id = auth.uid()); no se agregó ninguna env var nueva de apagado — la palanca de emergencia es el toggle admin has_web_custom (D-03)."
  - "El ítem de nav 'Mi web' se muestra a TODOS los negocios de los 4 verticales (superficie de venta, D-01); el gate editor/upsell vive en la page, no en el nav."
  - "El upsell (superficie de LECTURA) no relaja las 3 Server Actions: siguen devolviendo not_entitled (defensa en profundidad, D-02c)."

patterns-established:
  - "Ramificación de entitlement antes del Promise.all del preview: un no-entitled no dispara las ~5 queries."
  - "Nav data-driven agrupado: agregar una fila = ITEMS + NAV_GROUPS + 'web' en el menu de cada vertical."

requirements-completed: [PUB-01]

# Metrics
duration: 9min
completed: 2026-07-15
status: complete
---

# Phase 17 Plan 01: Exponer el CMS a clientes reales Summary

**Retiro del kill-switch global CMS_ENABLED de las 3 superficies TS del CMS, dejando has_web_custom como único gate, con upsell 'Web a medida' para no-entitled y entrada 'Mi web' en el sidebar para los 4 verticales.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-15T13:53:12Z
- **Completed:** 2026-07-15T14:02:41Z
- **Tasks:** 3
- **Files modified:** 5 (1 creado, 4 modificados)

## Accomplishments
- El flag de entorno CMS_ENABLED ya no existe en ninguna de las 3 superficies TS del CMS (page, 3 Server Actions, copy map); barrido de cierre D-04 = 0 matches en app/ lib/ components/ scripts/.
- has_web_custom (add-on por sesión) queda como ÚNICO gate: render en la page (editor vs upsell) + early-return not_entitled intacto en las 3 Server Actions (defensa en profundidad).
- Dueño sin el add-on ve la pantalla de venta 'Web a medida' (CTA a UPGRADE_URL) en vez de un 404; el no-entitled se resuelve antes del Promise.all del preview (ahorra ~5 queries).
- Ítem 'Mi web' → /web agregado top-level bajo GESTIÓN, visible a los 4 verticales (salud/belleza/general/canchas).

## Task Commits

Cada tarea se commiteó de forma atómica:

1. **Task 1: Barrer el flag de entorno de las Server Actions y del copy** - `4b52716` (refactor)
2. **Task 2: Render condicional en page.tsx (editor vs upsell) + WebUpsell** - `2202b08` (feat)
3. **Task 3: Ítem de nav 'Mi web' top-level, visible a todos los verticales** - `73e89da` (feat)

## Files Created/Modified
- `app/(dashboard)/web/_web-upsell.tsx` (nuevo) - RSC estático 'Web a medida': un CTA dominante 'Activar' a UPGRADE_URL + link secundario subordinado a /{slug}; tokens Bauhaus dark, touch target ≥44px, focus visible, WCAG AA por tokens.
- `app/(dashboard)/web/page.tsx` - Retirado el flag (const + notFound); sin has_web_custom retorna `<WebUpsell slug={business.slug} />` antes del Promise.all; import de notFound quitado, WebUpsell agregado; select de columnas explícitas intacto.
- `app/(dashboard)/web/_landing-actions.ts` - Eliminada la const CMS_ENABLED y los 3 early-returns cms_disabled; gate has_web_custom por sesión (líneas ~104/164/230) sin tocar; comentario de cabecera reescrito al modelo de gate único.
- `app/(dashboard)/web/web-client.tsx` - Quitada la copy muerta cms_disabled de ACTION_ERROR_COPY; not_entitled conservado; comentario actualizado (la page renderiza upsell, no notFound).
- `components/dashboard/sidebar.tsx` - Entrada `web` en ITEMS (/web, icon Globe) + key 'web' en el grupo GESTIÓN + import Globe.
- `lib/verticals.ts` - `'web'` agregado al array menu de los 4 verticales.

## Decisions Made
None - se siguió el plan tal como fue especificado (las decisiones D-01/D-02/D-03/D-04 vienen del plan y se respetaron literalmente, incluidas las líneas NO-TOCAR de las Server Actions).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npm run lint` global reporta 458 errores pre-existentes (`require()`-style imports en archivos de test/config fuera de la superficie del plan). Verificado con `npx eslint` scoped a los 4 archivos web/: 0 errores/warnings. Fuera de scope (SCOPE BOUNDARY); no se tocaron. El gate de CI real es `tsc --noEmit`, que pasa.

## Known Stubs
None - todas las superficies tienen su data real conectada (el upsell es venta estática por diseño, no un stub de datos).

## Threat Flags
None - no se introdujo superficie de seguridad nueva. El plan RESTA un gate (flag) y CONECTA UX de lectura; la escritura sigue con el early-return not_entitled en las 3 Server Actions y el select de columnas explícitas de la page queda intacto. El gate del bucket de upload (RLS) lo cierra el plan hermano 17-02.

## Verification
- `npx tsc --noEmit`: verde en toda la superficie tocada.
- Barrido D-04 `grep -rn "CMS_ENABLED\|cms_disabled" app/ lib/ components/ scripts/`: 0 matches.
- `npm test` completo: 37 archivos, 553 tests verdes (incluye isolation y verticals; verticals 10/10).
- Lint scoped a los 4 archivos web/: limpio.

## Next Phase Readiness
- Coordinación de deploy: este plan (exposición) DEBE llegar a prod junto con 17-02 (gate RLS del bucket landing-assets con has_web_custom). No exponer el CMS sin el gate de upload aplicado.
- Runbook post-deploy: borrar la env var CMS_ENABLED de Vercel (3 scopes; benigno si queda). Palanca de emergencia post-flag = toggle admin has_web_custom (D-03), no un flag nuevo.
- Verificación visual del upsell y del ítem de nav en los 4 verticales queda para /gsd:verify-work (no bloquea este plan autónomo).

## Self-Check: PASSED

- Archivos creados/modificados: 7/7 presentes en disco.
- Commits de tareas: 4b52716, 2202b08, 73e89da presentes en git.

---
*Phase: 17-exponer-el-cms-a-clientes-reales*
*Completed: 2026-07-15*
