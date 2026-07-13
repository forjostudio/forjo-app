---
phase: 15-borrador-y-publicaci-n-n-cleo
plan: 02
subsystem: cms-write-path
tags: [next16, server-actions, supabase, rls, multi-tenant, zod, landing-cms, vitest]

# Dependency graph
requires:
  - phase: 15-01
    provides: "businesses.landing_draft (jsonb, migración 050) + 4 tests de aislamiento del borrador"
  - phase: 13-cms-foundation-write-path-owner-only-flag
    provides: "molde de Server Action owner-only (saveLandingConfig), parseLandingConfigForWrite, flag CMS_ENABLED"
  - phase: 14-cms-editor-ui
    provides: "editor visual (web-client.tsx), mutadores puros de editor-draft.ts"
provides:
  - "saveLandingDraft(input) — escribe el BORRADOR; guardar deja de tener consecuencias públicas (PUB-03)"
  - "publishLanding() — SIN argumentos: copia server-side draft → published con Zod estricto sobre lo leído de la DB (PUB-04)"
  - "discardLandingDraft() — SIN argumentos: copia server-side published → draft (o NULL si nunca publicó) (PUB-06)"
  - "configsEqual / deriveEditorState — compare canónico y máquina de 3 estados, puros y testeados (PUB-05)"
  - "Contrato page → client: initialDraft + publishedConfig (publishedConfig === null ⇒ nunca publicó)"
  - "Códigos de error nuevos: no_draft, invalid_draft, publish_failed, discard_failed"
affects: [15-03, 16-skill-escribe-el-borrador, 17-publish-go-live]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action de copia server-side SIN argumentos: el dato que sale al aire se LEE de la DB, nunca del body (superficie de tampering = 0)"
    - "Copia jsonb entre columnas = SELECT + UPDATE en la acción (PostgREST no hace SET col_a = col_b) — y eso es lo que habilita validar antes de publicar"
    - "Compare canónico (claves ordenadas) cuando un baseline sale de memoria y el otro de un round-trip por jsonb"
    - "Estado de UI derivado del CONTENIDO (3 estados excluyentes), sin flag ni timestamp en la DB"

key-files:
  created: []
  modified:
    - lib/landing/editor-draft.ts
    - test/landing-editor-draft.test.ts
    - app/(dashboard)/web/_landing-actions.ts
    - app/(dashboard)/web/page.tsx
    - app/(dashboard)/web/web-client.tsx

key-decisions:
  - "publishLanding() y discardLandingDraft() no reciben argumentos: es la mitigación literal de D-16/T-15-05 — no hay body que estripar y el config publicado sale de la DB"
  - "Zod estricto (parseLandingConfigForWrite) sobre el BORRADOR LEÍDO DE LA DB al publicar → invalid_draft. Es el ÚNICO filtro de contenido (D-11): cero chequeos de calidad pre-publicación"
  - "Descartar NO re-valida lo publicado: ese valor ya está al aire y el contrato de lectura es fail-safe; validarlo sería un dead-end sin salida"
  - "Desviación declarada de D-03: stringify CANÓNICO en vez de JSON.stringify crudo. Misma semántica (estado derivado del contenido, sin flag ni timestamp), otro mecanismo — porque Postgres reordena las claves del jsonb"
  - "Cero llamadas de invalidación de caché: /[slug] es force-dynamic y revalidatePath desde un Server Function refrescaría todas las páginas visitadas (doc Next 16)"
  - "isEmpty pasa a derivarse de publishedConfig === null (nunca publicó), no de la ausencia de borrador"

patterns-established:
  - "Las 3 acciones espejan verbatim el molde owner-only ya SECURED de Phase 13: flag fail-closed → session client → business_id de la SESIÓN → gate has_web_custom EN LA ACCIÓN → .select('id') anti no-op"
  - "Los dos baselines del editor pasan por el MISMO pipeline de normalización (stripPrimary ∘ parseLandingConfig); única asimetría: null se preserva como null"

requirements-completed: [PUB-03, PUB-04, PUB-05, PUB-06]

# Metrics
duration: 22min
completed: 2026-07-13
status: complete
---

# Phase 15 Plan 02: Borrador y publicación (núcleo) — write path Summary

**El editor deja de escribir la web pública: `saveLandingDraft` persiste el borrador, `publishLanding()` y `discardLandingDraft()` copian entre columnas server-side sin aceptar un solo byte del cliente, y el editor deriva sus 3 estados de un compare canónico inmune al reordenamiento de claves del `jsonb`.**

## Performance

- **Duration:** ~22 min
- **Tasks:** 3 (la 1 en TDD: RED → GREEN)
- **Files modified:** 5 (0 creados)

## Accomplishments

- **Guardar dejó de tener consecuencias públicas (PUB-03).** `saveLandingDraft` escribe `businesses.landing_draft`. El nombre viejo (`saveLandingConfig`) **ya no existe, sin alias**: un call site que siga escribiendo lo publicado no compila.
- **Publicar es una copia server-side de cero argumentos (PUB-04).** `publishLanding()` hace SELECT del borrador → **Zod estricto sobre lo leído de la DB** (`invalid_draft`) → UPDATE de `landing_config`. El borrador queda **intacto** (D-02: post-publicación `draft == published`). Ningún valor del cliente llega jamás a la columna publicada.
- **Descartar vuelve al aire (PUB-06).** `discardLandingDraft()` copia `landing_config → landing_draft`, o limpia el borrador a `NULL` si el negocio nunca publicó (D-13). No re-valida lo publicado, a propósito.
- **3 estados sin estado nuevo en la DB (PUB-05).** `configsEqual` + `deriveEditorState` son puros, están testeados y viven en `lib/landing/editor-draft.ts`. El compare es **canónico** (claves ordenadas antes de serializar): mata el falso positivo permanente de "Guardado — sin publicar" que el `JSON.stringify` crudo habría producido en cuanto un baseline volviera del `jsonb`.
- **Los dos baselines llegan del server** (`initialDraft` + `publishedConfig`) y pasan por el **mismo pipeline** de normalización en el cliente. `publishedConfig === null` es la señal de "nunca publicó".

## Task Commits

1. **Task 1 — RED:** tests del compare canónico y de la máquina de 3 estados — `cb219cd` (test)
2. **Task 1 — GREEN:** `canonical` / `configsEqual` / `deriveEditorState` + `isDirty` reescrito — `e056b74` (feat)
3. **Task 2:** las 3 Server Actions owner-only — `405de2a` (feat)
4. **Task 3:** `page.tsx` pasa los dos configs + re-cableado de `web-client.tsx` — `0671de7` (feat)

## Files Created/Modified

- `lib/landing/editor-draft.ts` — **EDIT.** `canonical()` (interna, recursiva, ordena claves y preserva el orden de los arrays), `configsEqual()`, `isDirty()` reescrito encima (mismo contrato público, cero call sites tocados) y `deriveEditorState()` (unión de 3 literales). La cabecera del compare **cita D-03** y explica la desviación; la nota vieja de `isDirty` (que afirmaba que el orden de claves se mantiene estable) fue corregida: dejó de ser cierta cuando uno de los lados viene de la DB.
- `test/landing-editor-draft.test.ts` — **EDIT.** 9 casos nuevos (4 de `configsEqual`, 5 de `deriveEditorState`), incluido el que compara dos configs con las claves en distinto orden y **exige `true`** — sin el canónico, ese test falla (es la prueba de que la mitigación sirve).
- `app/(dashboard)/web/_landing-actions.ts` — **EDIT.** Las 3 acciones. Cabecera nueva y densa: por qué las dos nuevas no reciben argumentos, por qué la copia es de dos pasos (PostgREST escribiría el string literal `"landing_draft"` en la columna y destruiría el config publicado) y por qué **no se invalida ninguna caché**.
- `app/(dashboard)/web/page.tsx` — **EDIT.** Bloque 6 reemplazado por `publishedConfig` (`landing_config ?? null`) + `initialDraft` (`landing_draft ?? publishedConfig`, coalesce defensivo). El `select('*')` ya traía la columna nueva. **El gate de exposición no se tocó** (D-15).
- `app/(dashboard)/web/web-client.tsx` — **EDIT mínimo.** Props nuevas, `publishedBaseline` con el mismo pipeline, indicador de 3 estados vía `deriveEditorState`, `isEmpty` re-cableado a `publishedConfig`. **No** se agregaron la barra de 3 botones ni los dialogs (eso es 15-03).

## Evidencia de verificación

```
npx tsc --noEmit                              → OK
npx vitest run test/landing-editor-draft.test.ts → 48 passed (9 nuevos)
npx vitest run (suite completa)               → 497 passed / 36 files (isolation 13/13, 0 skipped)
npm run lint                                  → 0 findings en los archivos de la fase
```

Greps de aceptación sobre `_landing-actions.ts` (**código efectivo**, sin comentarios):

```
export async function saveLandingDraft(     = 1
export async function publishLanding()      = 1   ← paréntesis vacío: cero argumentos
export async function discardLandingDraft() = 1   ← ídem
export async function saveLandingConfig     = 0   ← el nombre viejo no existe, sin alias
eq('owner_id', user.id)                     = 3   ← el business_id siempre sale de la sesión
has_web_custom                              = 6   ← 3 selects + 3 gates
select('id')                                = 3   ← verificación de filas afectadas en las 3
createAdminClient                           = 0   ← cero service-role en la superficie web
revalidatePath|revalidateTag|refresh()      = 0   ← cero invalidación de caché
'no_draft'|'invalid_draft'|'publish_failed'|'discard_failed' = 4
```

Sobre `page.tsx` / `web-client.tsx`: `initialConfig` = **0** en ambos · `publishedConfig` ≥ 2 y `initialDraft` ≥ 2 en la page · `landing_draft` = 3 en la page · `notFound()` = 4 (sin cambios respecto de HEAD) · `saveLandingDraft` = 3 y `saveLandingConfig` = **0** en el client · `stripPrimary(parseLandingConfig` = **2** (los dos baselines por el mismo pipeline).

## Decisions Made

Ninguna decisión de arquitectura nueva: el RESEARCH ya traía los cuerpos de las 3 acciones y del compare canónico. Se copiaron con dos ajustes de forma:

- **La desviación de D-03 quedó escrita en el código**, no solo en el plan: el comentario de cabecera de `configsEqual` cita D-03 textualmente, aclara que la *intención* se cumple (estado derivado del contenido, sin flag ni timestamp) y que lo que cambia es el *mecanismo* (stringify canónico), con el porqué (Postgres reordena las claves del `jsonb`). Un reviewer no puede "simplificarlo" de vuelta sin leer el motivo.
- **`type Result`** se extrajo a un alias compartido por las 3 acciones (antes el shape estaba inline en la firma de la única acción que existía).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] El copy del empty-state mentía sobre lo que hace Guardar**

- **Found during:** Task 3
- **Issue:** el aviso decía *"Los cambios … se publican recién cuando tocás **Guardar cambios**"*. Después de esta fase eso es literalmente falso: guardar escribe el borrador y **no publica nada**. Dejarlo habría hecho que el dueño creyera que su web salió al aire al guardar — exactamente el malentendido que PUB-03 viene a eliminar.
- **Fix:** el aviso pasa a titularse *"Tu web todavía no está publicada"* y explica que los cambios se ven en la vista previa pero **nadie los ve todavía** hasta publicar. Coherente con el UI-SPEC (el empty-state se muestra sii `publishedConfig === null`).
- **Files modified:** `app/(dashboard)/web/web-client.tsx`
- **Commit:** `0671de7`

**2. [Rule 3 — Blocking] El rename `saveLandingConfig → saveLandingDraft` rompía el type-check hasta Task 3**

- **Found during:** Task 2
- **Issue:** el gate de Task 2 exige `tsc --noEmit` = 0, pero `web-client.tsx` seguía importando el nombre viejo (su re-cableado estaba planificado en Task 3) → el árbol quedaba rojo entre commits.
- **Fix:** el commit de Task 2 incluye el rename del import/llamada en `web-client.tsx` y el toast pasa a `'Borrador guardado'` (el copy viejo también había dejado de ser cierto). El resto del re-cableado (props, baselines, estados) quedó en Task 3 como estaba planeado. Cada commit deja el repo compilando.
- **Files modified:** `app/(dashboard)/web/web-client.tsx`
- **Commit:** `405de2a`

### Nota sobre el indicador de estado

El plan pedía "re-cableado mínimo para que `tsc` y `eslint` queden verdes" y dejar los baselines listos para 15-03. Enchufar `deriveEditorState` al **indicador ya existente** (3 labels en vez de 2) era la forma de que `publishedBaseline` fuera código **usado** y no un `useMemo` muerto que ESLint marcaría. **No** se agregaron los botones Publicar/Descartar ni los dialogs: eso sigue siendo 15-03.

## Issues Encountered

`npm run lint` reporta 588 problemas — **todos en `.claude/gsd-core/**`** (tooling vendorizado del propio GSD), preexistentes y fuera del scope de la fase. Cero findings en los 5 archivos tocados. No se tocó nada de eso.

## User Setup Required

Ninguno nuevo. Sigue vigente el runbook de 15-01: la migración 050 se aplica a **prod a mano ANTES** del deploy del código (con `NOTIFY pgrst, 'reload schema';`). Con el código de esta wave desplegado y la 050 sin aplicar, cada guardado daría `update_failed` contra una columna inexistente.

Para probar el editor en local hace falta `CMS_ENABLED=true`.

## Next Phase Readiness

- **15-03 desbloqueado:** tiene las 3 acciones, los 2 baselines en memoria, el estado de 3 valores ya derivado y los 4 códigos de error nuevos. Le queda la UI: barra sticky de 3 botones, dialog de go-live (`publishedConfig === null`), dialog destructivo de descarte, `ACTION_ERROR_COPY` y los toasts de éxito.
- **Riesgo aceptado heredado (T-15-10 / Pitfall 12):** con la policy `owner access` siendo `FOR ALL`, el dueño puede escribir **su propia** `landing_config` con la anon-key desde la consola, salteando la semántica de publicar. No viola el Core Value (sigue siendo owner-only). Re-declararlo en `/gsd:secure-phase 15`.
- **Sin blockers.**

## Self-Check: PASSED

- `lib/landing/editor-draft.ts` — FOUND
- `test/landing-editor-draft.test.ts` — FOUND
- `app/(dashboard)/web/_landing-actions.ts` — FOUND
- `app/(dashboard)/web/page.tsx` — FOUND
- `app/(dashboard)/web/web-client.tsx` — FOUND
- Commits `cb219cd`, `e056b74`, `405de2a`, `0671de7` — FOUND en `git log`

---
*Phase: 15-borrador-y-publicaci-n-n-cleo*
*Completed: 2026-07-13*
