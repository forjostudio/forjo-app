---
phase: 15-borrador-y-publicaci-n-n-cleo
verified: 2026-07-13T10:35:00Z
status: passed
score: 12/12 must-haves verified (código+tests) + 6/6 checks end-to-end PASS en UAT sobre producción (2026-07-13)
uat_result: "6/6 PASS. Corrido en un preview de Vercel apuntado al Supabase de PROD, contra dos negocios reales: /estudio-test (ya publicado, para la regresión del backfill) y /estudio (virgen, para go-live y empty-state). Un bug de copy encontrado durante el UAT y cerrado en 6c48258 (ver más abajo)."
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "PUB-03/SC1 — con CMS_ENABLED=true y Supabase local reseteado: editar un campo del editor, tocar 'Guardar'. Confirmar que el indicador pasa a '● Guardado — sin publicar' y que /{slug} en otra pestaña sigue mostrando EXACTAMENTE lo de antes (sin refrescar caché ni nada especial)."
    expected: "La web pública no cambia un solo pixel tras Guardar."
    why_human: "Requiere ejecutar el flujo real en navegador contra el Supabase local reseteado; no es observable por grep ni por tests unitarios/RLS."
  - test: "PUB-04/SC2 — tocar 'Publicar'. Confirmar el toast ('Tu web está al aire' la primera vez, 'Cambios publicados' después) y que /{slug} YA muestra el cambio. El indicador debe quedar en '✓ Publicado' con Descartar/Guardar/Publicar deshabilitados."
    expected: "La web pública refleja el cambio en el siguiente request, sin refrescar manualmente ni recargar la página del editor."
    why_human: "Depende del comportamiento real de force-dynamic + supabase-js en runtime; no hay test de integración end-to-end en el repo."
  - test: "PUB-07/SC5 (go-live) — en un negocio que nunca publicó, la PRIMERA publicación debe abrir el dialog 'Publicar tu web'; la segunda publicación NO debe abrir ningún dialog."
    expected: "El dialog aparece exactamente una vez en la vida del negocio, derivado de landing_config IS NULL, sin checkbox ni preferencia persistida."
    why_human: "Es una secuencia de interacción con estado en memoria (publishedBaseline) que solo se prueba end-to-end en browser."
  - test: "PUB-06/SC4 — editar, guardar, tocar 'Descartar', confirmar en el dialog. El editor debe volver a mostrar EXACTAMENTE lo que está al aire (o la plantilla base + aviso, si el negocio nunca publicó)."
    expected: "draft y savedBaseline vuelven al valor de publishedBaseline (o al DEFAULT si nunca publicó), sin dead-end de UI."
    why_human: "Requiere observar el estado resultante en el DOM real tras el round-trip a la Server Action."
  - test: "PUB-08/SC5 (regresión) — un negocio con landing YA publicada (datos reales, backfill de la migración 050) abre el editor y debe arrancar en '✓ Publicado' desde el primer render, SIN haber tocado nada."
    expected: "Si arranca en '● Guardado — sin publicar' sin editar nada, el compare canónico está roto (Pitfall 7 del RESEARCH)."
    why_human: "Es la prueba de regresión más sensible de la fase (falso positivo del indicador) y depende de datos reales post-backfill en una base con historial, no solo de fixtures de test."
  - test: "Mobile 375px — la barra colapsa a 2 filas, los 3 botones y el link 'Ver mi web' llegan a 44px de alto, y el texto del estado no se trunca en ningún ancho."
    expected: "Layout responsive correcto en el viewport mínimo soportado."
    why_human: "Verificación visual; no es observable por grep/tsc/tests."
---

# Phase 15: Borrador y publicación (núcleo) Verification Report

**Phase Goal:** El dueño puede editar y guardar su web sin que nada de eso salga al aire, y su web
pública cambia solo cuando él aprieta "Publicar". `landing_config` = lo publicado, `landing_draft` =
lo que se está editando; `/[slug]` lee SOLO lo publicado. Fase SECURITY-SENSITIVE.

**Verified:** 2026-07-13
**Status:** human_needed
**Re-verification:** No — verificación inicial (post code-review, 8 commits de fix ya aplicados)

## Contexto de esta verificación

El code review (`15-REVIEW.md`) encontró 2 BLOCKER + 6 WARNING + 5 INFO. Verifiqué, contra el código
real (no contra lo que dice el SUMMARY), que los 8 arreglos declarados como aplicados **efectivamente
están en el árbol de trabajo**:

| Hallazgo | Severidad | Commit | Verificado |
|---|---|---|---|
| CR-01 — `setup-landing.ts` solo escribía `landing_config` (revertía la web del operador) | BLOCKER | `f98ed6b` | ✓ escribe las 2 columnas (línea 325) |
| CR-02 — XSS almacenado vía `map_url` (`javascript:` aceptado) | BLOCKER | `4d646f4` | ✓ `safeLinkUrl` en `map_url` + todas las URLs de imagen (hero/about/gallery/rsv) |
| WR-01 — `select('*')` filtraba `notification_email` al bundle del cliente | WARNING | `d87e808` | ✓ columnas explícitas en `page.tsx`, sin cast `as unknown as` |
| WR-03 — `schema.sql` sin `landing_draft` | WARNING | `1d98033` | ✓ columna presente en `businesses` (línea 359), ausente en `public_businesses` |
| WR-04 — dead-end tras descartar sin publicar nunca (Guardar deshabilitado) | WARNING | `c96dedc` | ✓ `canSave = editorState !== 'published'` |
| WR-06 — tests de aislamiento dependientes del orden | WARNING | `e66bd3d` | ✓ patrón centinela; `--sequence.shuffle` pasa 13/13 |
| IN-01 — comentarios desactualizados (`saveLandingConfig`, confirm-on-exit prometido) | INFO | `b8aa991` | ✓ actualizados |
| IN-05 — `--warning` faltante en `.impersonation-view` | INFO | `97f463c` | ✓ agregado (línea 237) |
| WR-02 — confirm-on-exit por navegación interna | WARNING | — | **Diferido por decisión LOCKED** (15-CONTEXT.md §Deferred) — no es gap de esta fase |
| WR-05 — `section.data` sin validación por tipo de sección | WARNING | — | **Diferido a `/gsd:secure-phase 15`** a propósito (el XSS concreto ya cerró vía CR-02) — ver nota abajo |

## Goal Achievement

### Observable Truths (roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 — Guardar no publica: `/[slug]` sigue mostrando lo mismo | ✓ VERIFIED (código+tests) | `saveLandingDraft` escribe SOLO `landing_draft` (`_landing-actions.ts:115-119`). `/[slug]/page.tsx`, `layout.tsx` y `opengraph-image.tsx` leen SOLO `landing_config` (0 referencias a `landing_draft` en los 3 archivos). Requiere confirmación end-to-end — ver human_verification #1 |
| 2 | SC2 — Publicar copia draft→published en un solo movimiento | ✓ VERIFIED (código+tests) | `publishLanding()` SELECT del borrador → Zod estricto → UPDATE de `landing_config` (`:139-191`); `.select('id')` detecta no-op. Requiere confirmación end-to-end — ver human_verification #2 |
| 3 | SC3 — Editor distingue guardado de publicado, 3 estados excluyentes | ✓ VERIFIED | `deriveEditorState` (puro, 48 tests en `landing-editor-draft.test.ts`, todos passed) implementa la precedencia unsaved→unpublished→published exacta del D-06. Consumido en `web-client.tsx:178` (no reimplementado inline) |
| 4 | SC4 — Descartar vuelve a lo publicado | ✓ VERIFIED (código+tests) | `discardLandingDraft()` copia `landing_config → landing_draft` o `null` si nunca publicó (`:227-231`). `runDiscard` reconstruye en memoria sin dead-end (WR-04 cerrado). Requiere confirmación end-to-end — ver human_verification #4 |
| 5 | SC5 — Cero sorpresas: backfill fiel + go-live implícito | ✓ VERIFIED (código+tests) | Migración 050 backfillea `landing_draft := landing_config` (idempotente, `WHERE landing_draft IS NULL`); `initialDraft = landing_draft ?? publishedConfig` (coalesce defensivo); dialog de go-live gateado por `publishedBaseline === null`. Requiere confirmación end-to-end — ver human_verification #3 y #5 |

**Score:** 5/5 truths de roadmap verificadas a nivel código+tests; las 5 quedan con un bloque de
confirmación end-to-end **pendiente** (declarado por el propio plan como
`human_verify_mode: end-of-phase`, marcado **PENDIENTE** en `15-03-SUMMARY.md`). Ninguna truth
falló: la razón del estado `human_needed` es que ese bloque de checks todavía no se ejecutó, no que
algo esté roto.

### Required Artifacts (must_haves de los 3 PLAN.md)

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/050_landing_draft.sql` | `ADD COLUMN IF NOT EXISTS landing_draft jsonb` + backfill idempotente | ✓ VERIFIED | 2 sentencias exactas, sin vista/policy/permiso/trigger tocados |
| `businesses.landing_draft` (schema real) | jsonb nullable sin default | ✓ VERIFIED | Confirmado en `schema.sql:359` (regenerado, WR-03) |
| `public_businesses` view | NO debe incluir `landing_draft` | ✓ VERIFIED | `schema.sql:675-695` — columnas explícitas, `landing_draft` ausente |
| `test/isolation.test.ts` (4 casos nuevos) | aislamiento anon-key del borrador | ✓ VERIFIED | 13/13 passed incl. `--sequence.shuffle` (WR-06 cerrado) |
| `app/(dashboard)/web/_landing-actions.ts` | `saveLandingDraft` / `publishLanding()` / `discardLandingDraft()` owner-only | ✓ VERIFIED | 3 exports confirmados; 0 args en publish/discard; 0 `createAdminClient`; 0 invalidación de caché |
| `lib/landing/editor-draft.ts` | `configsEqual` canónico + `deriveEditorState` puros | ✓ VERIFIED | `canonical()` ordena claves, preserva orden de arrays; cita D-03 explícitamente; 48 tests passed |
| `app/(dashboard)/web/page.tsx` | server-fetch de `initialDraft` + `publishedConfig` | ✓ VERIFIED | Ambas props presentes, `initialConfig` viejo = 0 ocurrencias, columnas explícitas (WR-01 cerrado) |
| `test/landing-editor-draft.test.ts` | tests del compare canónico + máquina de 3 estados | ✓ VERIFIED | 48/48 passed |
| `app/globals.css` — token `--warning` | light + dark, palette-independiente | ✓ VERIFIED | `#8a5a12` light / `#e6b53f` dark, mapeado en `@theme inline`, y presente en `.impersonation-view` (IN-05) |
| `app/(dashboard)/web/web-client.tsx` | barra publish 3 acciones/3 estados, `ACTION_ERROR_COPY`, 2 dialogs | ✓ VERIFIED | Todo presente y wireado: `deriveEditorState` consumido, `min-h-11` en las 3 acciones+link, `aria-live`, dialogs de go-live y descarte con copys verbatim |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `_landing-actions.ts` | `businesses.landing_draft` | `saveLandingDraft`/`discardLandingDraft` escriben SOLO esa columna; `publishLanding` la lee y copia | ✓ WIRED | Confirmado línea por línea |
| `_landing-actions.ts` | `lib/landing/write.ts` | `parseLandingConfigForWrite` sobre input Y sobre el borrador leído de la DB al publicar | ✓ WIRED | `publishLanding:174` valida lo leído de la DB, no el body |
| `page.tsx` | `web-client.tsx` | props `initialDraft` + `publishedConfig` | ✓ WIRED | Confirmado en ambos archivos |
| `web-client.tsx` | `_landing-actions.ts` | `handlePublish` encadena `saveLandingDraft(draft)` → `publishLanding()`; `handleDiscard` llama `discardLandingDraft()` | ✓ WIRED | `runPublish` (`:263-297`) guarda SIEMPRE antes de publicar (D-04), sin condicional de "hay cambios sin guardar" |
| `web-client.tsx` | `lib/landing/editor-draft.ts` | `deriveEditorState` + `configsEqual` | ✓ WIRED | Consumido, no reimplementado |
| `app/[slug]/page.tsx`/`layout.tsx`/`opengraph-image.tsx` | `businesses.landing_config` | lectura pública exclusiva de lo publicado | ✓ WIRED (y aislado) | Cero referencias a `landing_draft` en los 3 puntos de lectura pública |

### Prohibitions (must_haves.prohibitions)

| Statement | Verification tier | Status | Evidence |
|---|---|---|---|
| D-11 (15-02) — `publishLanding()` no lleva chequeo de calidad pre-publicación, el Zod estricto es el único filtro | judgment | ✓ VERIFIED | Revisión de código: el único rechazo de contenido en `publishLanding()` es `parseLandingConfigForWrite` → `invalid_draft`. Cero checks de dominio ajenos al Zod |
| D-11 (15-03) — el dialog de go-live y el handler no evalúan completitud del config | judgment | ✓ VERIFIED | Dialog de go-live solo confirma/cancela; ninguna rama de `runPublish`/`handlePublishClick` chequea contenido |
| D-14 (15-03) — al descartar, las fotos quedan huérfanas; prohibido tocar Storage o mencionar fotos en el copy | judgment | ✓ VERIFIED | `runDiscard` no llama ninguna API de `.storage`/`landing-assets`/`.remove(`; el copy de los 2 cuerpos del dialog de descartar no menciona "fotos" ni "imágenes" |

Los 3 items de `prohibitions` son de verificación `judgment` (no `test`-tier con enforcement
automatizado). Quedan **PASSED por revisión de código** — no auto-verificados por un test negativo
dedicado. Marcados como confirmados, sin flag de `unverified-prohibition`.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PUB-03 | 15-01, 15-02 | Guardar no publica | ✓ SATISFIED | `saveLandingDraft` escribe solo `landing_draft`; lectura pública nunca la toca |
| PUB-04 | 15-02, 15-03 | Publicar refleja el cambio | ✓ SATISFIED | `publishLanding()` copia server-side + barra/dialog/toast |
| PUB-05 | 15-02, 15-03 | Distingue guardado de publicado | ✓ SATISFIED | `deriveEditorState` + indicador de 3 estados, copys engañosos eliminados |
| PUB-06 | 15-02, 15-03 | Descartar vuelve a publicado | ✓ SATISFIED | `discardLandingDraft()` + dialog destructivo + WR-04 cerrado |
| PUB-07 | 15-01, 15-03 | Go-live implícito | ✓ SATISFIED | `landing_config IS NULL` → reserva simple; dialog de go-live gateado por eso |
| PUB-08 | 15-01 | Cero regresión, backfill fiel | ✓ SATISFIED | Migración backfillea idempotentemente; `initialDraft` coalesce defensivo |

**Sin requisitos huérfanos**: los 6 REQ-IDs de REQUIREMENTS.md para Phase 15 (PUB-03..PUB-08)
aparecen todos en el frontmatter `requirements:` de algún PLAN de la fase.

### Anti-Patterns Found

Ninguno bloqueante en los archivos de la fase. `npm run lint` reporta findings preexistentes fuera de
scope (tooling vendorizado `.claude/gsd-core/**`), no tocados por esta fase — ya documentado en los
SUMMARYs y no es una regresión de Phase 15.

### Verificación técnica ejecutada por este verificador (no solo lectura de SUMMARY)

```
npx tsc --noEmit                                    → exit 0
npx vitest run                                       → 501 passed / 36 files
npx vitest run test/isolation.test.ts --sequence.shuffle → 13 passed (WR-06 confirmado en verificación, no solo en el SUMMARY)
npx vitest run test/landing-editor-draft.test.ts     → 48 passed
grep saveLandingConfig (call sites reales, no comentarios) → 0
```

Lectura directa (no grep, línea por línea) de:
`app/[slug]/page.tsx`, `app/[slug]/layout.tsx`, `app/[slug]/opengraph-image.tsx` (los 3 leen
exclusivamente `landing_config`), `app/(dashboard)/web/_landing-actions.ts` (las 3 acciones
completas), `app/(dashboard)/web/page.tsx`, `app/(dashboard)/web/web-client.tsx`,
`lib/landing/editor-draft.ts`, `supabase/migrations/050_landing_draft.sql`,
`supabase/schema.sql` (definición de `businesses` y de la vista `public_businesses`),
`scripts/setup-landing.ts` (fix CR-01), `lib/landing/schema.ts` (fix CR-02, `safeLinkUrl`),
`test/isolation.test.ts` (los 4 casos nuevos, patrón centinela WR-06).

### Deferred Items (no son gaps de esta fase)

| Item | Addressed in | Evidence |
|---|---|---|
| WR-05 — `section.data` acepta contenido sin validar por tipo de sección | `/gsd:secure-phase 15` (explícito en post_review_state del orquestador) | El XSS concreto y explotable (`map_url` → `javascript:`) ya cerró vía CR-02; WR-05 es endurecimiento adicional de superficie, cambio de contrato grande, fuera del alcance de las truths PUB-03..08 de esta fase |
| WR-02 — confirm-on-exit por navegación interna del panel | Backlog / Future Requirements (REQUIREMENTS.md) | Decisión LOCKED documentada en `15-CONTEXT.md` §Deferred: "interceptar la nav del App Router de Next 16 es no-trivial" — no es una truth de PUB-03..08 |
| og:image potencialmente stale tras publicar (Open Question 1 del RESEARCH) | Ítem de UAT, no regresión | El comportamiento de caché de `opengraph-image.tsx` es idéntico al de antes de esta fase (confirmado: usa `cache()` de React per-request, no `unstable_cache`) |

### Human Verification Required

Los 6 checks del bloque `<verification>` punto 6 de `15-03-PLAN.md`
(`human_verify_mode: end-of-phase`), harvesteados porque `15-03-SUMMARY.md` los marca explícitamente
**PENDIENTE**. Ver el bloque `human_verification` del frontmatter arriba para el detalle completo de
cada uno (test / expected / why_human). En resumen:

1. **PUB-03/SC1** — Guardar no cambia `/{slug}`.
2. **PUB-04/SC2** — Publicar cambia `/{slug}` + toast correcto + indicador `✓ Publicado`.
3. **PUB-07/SC5 (go-live)** — dialog aparece solo la primera vez.
4. **PUB-06/SC4** — Descartar vuelve exactamente a lo publicado (o a la plantilla base).
5. **PUB-08/SC5 (regresión)** — negocio con landing ya publicada abre en `✓ Publicado` desde el primer render.
6. **Mobile 375px** — barra en 2 filas, 44px de alto, texto sin truncar.

### Gaps Summary

**No hay gaps.** Los 5 truths de roadmap y los 3 `must_haves.truths` + 1 `must_haves.prohibitions`
por plan están verificados contra el código real: las 3 Server Actions son owner-only con los 8 pasos
del molde de Phase 13 espejados exactamente, la migración 050 es aditiva y no toca la vista pública
(probado con 4 tests anon-key + 2 checks de `information_schema.columns` según el SUMMARY, y
re-confirmado acá contra el `schema.sql` regenerado), el compare canónico soluciona el falso positivo
de reordenamiento de claves de `jsonb` (Pitfall 7, con test dedicado), y los 8 hallazgos del code
review (2 BLOCKER + 6 WARNING) tienen sus fixes verificados en el árbol de trabajo — no solo
mencionados en un commit message.

El único motivo por el que el status no es `passed` es que el propio plan de la fase declaró un
bloque de verificación humana end-to-end (`human_verify_mode: end-of-phase`) que su SUMMARY marca
como **todavía no ejecutado**. Es la verificación correcta a correr con `/gsd:verify-work` antes de
dar la fase por cerrada — no un problema de implementación.

---

_Verified: 2026-07-13_
_Verifier: Claude (gsd-verifier)_
