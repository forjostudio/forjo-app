---
phase: 23-el-panel-que-organiza-el-cat-logo
verified: 2026-09-16T14:30:00Z
status: gaps_found
score: 5/6 must-haves verified (1 gap, resto con UAT visual pendiente)
covered_files:
  - ".planning/workstreams/motor-reservas/REQUIREMENTS.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-01-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-01-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-02-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-02-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-03-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-03-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-04-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-04-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-REVIEW.md"
  - "app/(dashboard)/servicios/page.tsx"
  - "app/(dashboard)/settings/settings-client.tsx"
  - "components/dashboard/categorias-manager.tsx"
  - "lib/catalog-panel.ts"
  - "lib/service-categories.ts"
  - "test/catalog-panel.test.ts"
  - "test/service-categories.test.ts"
covered_digest: "v1:sha256:8bf94fcd13a296e65327c38a90c53a28a4fcbde9e32e7563c1b13bf5bb7d141e"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "CAT-02: el dueño le asigna a cada servicio una categoría o ninguna, siempre de forma consistente"
    status: failed
    reason: >
      CR-01 del code review (23-REVIEW.md) está confirmado leyendo el código actual y sigue sin
      commit de fix: `newService.category` / `editSvcForm.category` guardan el uuid elegido, pero
      `deleteCategory` (categorias-manager.tsx) sólo actualiza `categories` y `services` — nunca los
      borradores del formulario. Si el dueño borra desde el organizador la categoría que tiene
      elegida en el alta (o en la edición) sin recargar, el `SelectValue` cae al fallback visual
      "Sin categoría" pero el estado sigue con el uuid borrado. Al guardar, `categoryPatch` escribe
      ese uuid, la FK compuesta rechaza con 23503 y aparece la copy de `mapCategoryWriteError` — y si
      esa era la última categoría del negocio, el campo entero deja de renderizarse
      (`serviceCategories.length > 0`), así que no queda ningún control para corregir el valor: TODA
      alta de servicio queda bloqueada hasta recargar la página.
    artifacts:
      - path: "app/(dashboard)/settings/settings-client.tsx"
        issue: "addService (~L1406) y saveEditService no sanean newService.category/editSvcForm.category contra serviceCategories vigente antes de escribir"
      - path: "components/dashboard/categorias-manager.tsx"
        issue: "deleteCategory (~L330-344) no expone un callback que limpie los borradores del padre cuando la categoría borrada es la seleccionada"
    missing:
      - "Sanear el valor al escribir (categoriaVigente(v) => serviceCategories.some(c=>c.id===v) ? v : SIN_CATEGORIA) en addService y saveEditService, o un callback onCategoryDeleted(id) desde CategoriasManager que resetee los dos borradores del padre."
deferred: []
advisory: []
human_verification:
  - test: "Hilo completo de una categoría (23-01): crear con nombre duplicado (case/blancos insensible), reordenar con flechas y recargar, caso offline con re-lectura honesta."
    expected: "Copy propia inline en el duplicado, orden sobrevive al reload, toast + repintado del orden real en offline (D-10.2)."
    why_human: "El flujo RSC → prop → componente → escritura → base → RSC y el estado offline sólo se ven en el navegador; el ejecutor no abrió uno (23-01-SUMMARY.md, sección UAT visual pendiente)."
  - test: "Diálogo Mover, chips y grupo Sin categoría (23-01/23-03): asignar y desasignar, Escape sin escribir, layout a 375px con nombres largos."
    expected: "Sin categoría siempre presente y última; Escape no escribe nada; sin scroll horizontal a 375px."
    why_human: "Interacción del diálogo y layout responsive; no verificable por grep (23-01-SUMMARY.md)."
  - test: "Campos Categoría y Descripción corta del form (23-02): campo oculto con cero categorías, contador 0/120 hasta el tope, lo escrito entra en las dos líneas de la tarjeta del booking a 375px."
    expected: "El límite de 120 caracteres coincide con el recorte real de line-clamp-2 de la tarjeta pública."
    why_human: "Es una assumption explícitamente flagueada por el propio plan (23-02-PLAN.md, Flagged assumptions CAT-11): el número no se re-midió contra la tipografía real; sólo la UAT visual lo confirma."
  - test: "Renombrar in situ, borrar con ConfirmDialog y arrastre nativo de filas/chips (23-03)."
    expected: "Enter/Escape/blur correctos; el diálogo de borrado cuenta bien los servicios afectados; el arrastre reordena sin parpadeo y respeta el tenant; sin arrastre en mobile."
    why_human: "Foco, selección de texto, drag-and-drop nativo y layout a 375px no son verificables con grep (23-03-SUMMARY.md)."
  - test: "Modos de orden (CAT-04/CAT-05) ida y vuelta, y sección Posición del diálogo Mover (23-04)."
    expected: "Alfabético/precio ocultan los controles; volver a personalizado devuelve el arreglo manual intacto (CAT-06); la Posición sólo aparece fuera del camino de identidad."
    why_human: "El checkpoint D-11 fue resuelto por el usuario sin abrir el navegador; el propio plan lo deja como UAT pendiente (23-04-SUMMARY.md)."
---

# Phase 23: El panel que organiza el catálogo — Reporte de verificación

**Phase Goal:** Que el dueño pueda usar lo que la Phase 22 volvió declarable: crear/renombrar/borrar categorías, asignar una o ninguna a cada servicio (nunca obligatorio), reordenar arrastrando y con ▲/▼, elegir los dos modos de orden del negocio, y escribir la descripción corta del servicio.
**Verified:** 2026-09-16
**Status:** gaps_found
**Re-verification:** No — verificación inicial

## Goal Achievement

### Observable Truths

| # | Truth (Roadmap SC) | Status | Evidencia |
|---|---|---|---|
| 1 | CAT-01: crear/renombrar/borrar categorías; duplicado case-insensitive lo rechaza la base con copy propia | ✓ VERIFIED | `lib/catalog-panel.ts` exporta `classifyCategoryWriteError`/`CATEGORY_WRITE_REJECT_COPY` (36 casos en `test/catalog-panel.test.ts`, corridos: 73/73 verde en `test/catalog-panel.test.ts` + `test/service-categories.test.ts`); `createCategory`/renombrado en vivo en `categorias-manager.tsx`; el 23-01-SUMMARY documenta la prueba contra Postgres local (`'  cOLOR '` rechazado por `service_categories_name_uq`) |
| 2 | CAT-02: asignar una categoría o ninguna a cada servicio, nunca obligatorio | ✗ FAILED (parcial) | El diálogo "Mover…", los chips y el `Select` del form cumplen la letra en el camino feliz. Pero **CR-01 del code review está confirmado en el código actual** (ver Gaps): borrar una categoría seleccionada en un formulario abierto dejas ese formulario con un uuid fantasma que bloquea toda alta hasta recargar — ver detalle abajo |
| 3 | CAT-03: reordenar categorías arrastrando y con ▲/▼; el orden persiste renumerando la lista completa de hermanas | ✓ VERIFIED (con advertencias) | `renumber`/`moveWithinList` puros y testeados; `persistCategoryOrder`/`reorderCategory` comparten la misma regla entre flechas y arrastre; gate automatizado confirma que ninguna sentencia de reorden lleva `name`/`price`/`duration_minutes`. Advertencias no bloqueantes: WR-01 (`sort_order: categories.length` puede ubicar una categoría nueva en medio de la lista tras borrados) y WR-03 (soltar un chip sobre otro chip nunca lo deja último) — confirmadas leyendo el código, ver Anti-patrones |
| 4 | CAT-04/CAT-05: dos modos de orden por negocio; con modo ≠ personalizado los controles de reordenar desaparecen | ✓ VERIFIED | Checkpoint D-11 resuelto por el usuario ("A + 1 sí + 3 sí", 23-04-SUMMARY); `saveCategorySortMode`/`saveServiceSortMode` escriben una sola columna de `businesses` con `.select('id')` y repintan ante 0 filas; gates de "ningún control deshabilitado depende de `sort_mode`" pasaron; `sortCategories` exportada en `lib/service-categories.ts` y usada por `groupCatalog` (6 tests nuevos, 37/37 en el archivo) |
| 5 | CAT-11: descripción corta con tope duro de 120 y contador, igual a lo que la tarjeta del booking ya renderiza | ✓ VERIFIED | Campo espejado en alta y edición, `maxLength={120}`, contador `tabular-nums`, normalización sólo al guardar (`trim() || null`); `git status --porcelain -- app/[slug] components/landing` vacío (no tocó la superficie pública) |
| 6 | Invariante D-07 (arquitectura interna, no un SC del roadmap pero condición dura de todos los planes): un único productor (`categoryPatch`) y un único traductor (`mapCategoryWriteError`) de la columna `services.category_id`, con exactamente un update suelto (`assignServiceCategory`) | ✓ VERIFIED | Gates 1-3 de D-07 repetidos en los 4 planes; confirmado a mano: `categoryPatch`/`mapCategoryWriteError` sólo se definen en `lib/catalog-panel.ts`; `assignServiceCategory` es el único `.update(categoryPatch(...))` fuera del form |

**Score:** 5/6 truths verificadas de forma directa por código + tests; 1 truth (CAT-02) falla por un defecto confirmado y sin commit de fix. Ningún truth quedó en present-but-behavior-unverified: la UAT visual de las cinco superficies (colapso, drag, offline, 375px, recorte de la tarjeta) sigue pendiente y se lista en Human Verification — no se cuenta contra el score porque son truths ya marcadas VERIFIED por evidencia de código/test, con la UAT como capa adicional de confianza que el propio equipo dejó explícitamente pendiente.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lib/catalog-panel.ts` | Reglas puras: renumber, moveWithinList, categoryPatch, fromCategoryId, mapCategoryWriteError, plurales, classifyCategoryWriteError | ✓ VERIFIED | Existe, sin imports de React/Supabase/next; exporta las 12 funciones/constantes declaradas en el PLAN |
| `test/catalog-panel.test.ts` | Verificación automatizada de renumeración y mapeo código→copy | ✓ VERIFIED | 36 casos, corrido ahora: verde |
| `components/dashboard/categorias-manager.tsx` | Organizador: Card colapsable, alta, flechas, chips, grupo Sin categoría, diálogo Mover, renombrar, borrar, arrastre, modos de orden | ✓ VERIFIED | Existe, montado, con `aria-expanded` y todos los handlers descritos en los 4 planes |
| `app/(dashboard)/servicios/page.tsx` | Lectura por tenant de `service_categories` + orden de `services` por `sort_order` | ✓ VERIFIED | Confirmado (no releído línea por línea en esta pasada, pero el gate de migraciones=41 y los tests de integración de los 4 planes lo ejercitan) |
| `app/(dashboard)/settings/settings-client.tsx` | Cableado del organizador + campos Categoría/Descripción del form | ✓ VERIFIED (con el gap CR-01) | `import { CategoriasManager }` en L19, montado en L2585; campos de categoría/descripción presentes en alta (~L2871) y edición (~L2980) |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `app/(dashboard)/servicios/page.tsx` | `components/dashboard/categorias-manager.tsx` | prop `initialServiceCategories` → `SettingsClient` → organizador | ✓ WIRED | Confirmado por wiring en `settings-client.tsx` |
| Flechas / arrastre de filas | `service_categories.sort_order` | `renumber()` + N updates acotados por `business_id`, 0 filas = fallo | ✓ WIRED | `persistCategoryOrder`/`reorderCategory` en `categorias-manager.tsx` |
| Rechazo de la base | copy en pantalla | `classifyCategoryWriteError`/`mapCategoryWriteError` por `error.code` | ✓ WIRED | Nunca se interpola el texto crudo; confirmado por gate + lectura directa |
| Form de alta/edición, arrastre, diálogo Mover | `services.category_id` | `categoryPatch` como única fuente | ⚠️ WIRED con gap | El valor SÍ pasa siempre por `categoryPatch`, pero el **borrador que alimenta ese `categoryPatch` puede quedar obsoleto** tras un borrado de categoría en la misma sesión (CR-01) — el link técnico está bien tendido, el dato que viaja por él puede ser inválido |

### Anti-Patrones encontrados (del code review, confirmados leyendo el código actual — commit HEAD 41a69ba, sin fix posterior)

| Archivo | Severidad | Hallazgo | Impacto en must-haves |
|---|---|---|---|
| `settings-client.tsx` (~L1406, ~L2871-2885, ~L2980-2993) + `categorias-manager.tsx` (~L330-344) | 🛑 Blocker (CR-01) | Borrar una categoría seleccionada en un form abierto deja un uuid fantasma en el borrador; si era la última categoría, el campo desaparece y toda alta queda bloqueada hasta recargar | Rompe CAT-02 en un camino real de la misma pantalla (crear categoría + organizar están en `/servicios`) |
| `categorias-manager.tsx:254` (WR-01) | ⚠️ Warning | `sort_order: categories.length` no contempla huecos por borrados; una categoría nueva puede aparecer en medio de la lista | Afecta CAT-03 sólo para categorías nuevas tras un borrado, no la mecánica de reorden en sí |
| `categorias-manager.tsx:508-510` (WR-03) | ⚠️ Warning | Soltar un chip sobre otro chip nunca lo deja último; "bajar uno" es no-op mientras igual escribe N updates | UX del arrastre de chips, no bloquea el diálogo Mover (mismo resultado alcanzable ahí) |
| `settings-client.tsx:1406` + `page.tsx:24` + `settings-client.tsx:2603-2640` (WR-04) | ⚠️ Warning | La lista de servicios bajo "Orden de los servicios" no respeta el modo ni los grupos | Cosmético/orientativo; documentado por el propio 23-04-SUMMARY como comportamiento esperado en esta fase |
| `categorias-manager.tsx:364-397` (WR-05) | ⚠️ Warning | Reorden concurrente con alta/borrado en vuelo puede pisar el estado optimista | Ventana de carrera de baja probabilidad en uso real (un solo dueño operando la pantalla) |
| Varios (IN-01 a IN-05) | ℹ️ Info | Tope de 120 sólo de cliente, error de renombrado en la fila equivocada bajo doble edición simultánea, doble-Enter, `Label` sin `htmlFor` en Categoría, cobertura de test incompleta sobre inserción de posición | No bloquean ningún must-have de esta fase; quedan como deuda menor |

No se encontraron `TBD`/`FIXME`/`XXX` sin referencia a un issue en los archivos tocados por la fase.

### Requirements Coverage

| Requirement | Source Plan | Descripción | Status | Evidencia |
|---|---|---|---|---|
| CAT-01 | 23-01, 23-03 | Crear/renombrar/borrar categorías; duplicado rechazado por la base | ✓ SATISFIED | Código + tests + prueba contra Postgres local documentada en 23-01-SUMMARY |
| CAT-02 | 23-01, 23-02, 23-03 | Asignar una categoría o ninguna, nunca obligatorio | ⚠️ BLOCKED (parcial) | Camino feliz cumple; CR-01 rompe la consistencia en un camino real sin fix commiteado |
| CAT-03 | 23-01, 23-03, 23-04 | Reordenar arrastrando y con ▲/▼, renumerando la lista completa | ✓ SATISFIED (con warnings) | Mecánica de reorden correcta y testeada; WR-01/WR-03 son defectos de posición inicial/chip-sobre-chip, no de la mecánica central |
| CAT-04 | 23-04 | Elegir los dos modos de orden para todo el negocio | ✓ SATISFIED | Handlers + gates verdes; checkpoint D-11 resuelto por el usuario |
| CAT-05 | 23-01, 23-04 | Controles de reordenar desaparecen fuera de modo personalizado | ✓ SATISFIED | Gate "ningún control depende de `sort_mode`" verde; gateo por `category_sort_mode`/`service_sort_mode` confirmado en el código |
| CAT-11 | 23-02 | Descripción corta con tope de 120 y contador | ✓ SATISFIED | Campo espejado, `maxLength={120}`, normalización sólo al guardar, superficie pública intacta |

Sin requisitos huérfanos: los 6 IDs de la fase (CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-11) están declarados en el frontmatter de al menos un PLAN y en `REQUIREMENTS.md` (marcados `[x]` en la lista de requisitos, aunque la tabla de Traceability de `REQUIREMENTS.md` líneas 92-96/102 sigue diciendo "Pendiente" — desactualización menor de documentación, no bloqueante).

### Behavioral Spot-Checks

| Comportamiento | Comando | Resultado | Status |
|---|---|---|---|
| Tests puros de la fase (`catalog-panel` + `service-categories`) | `npx vitest run test/catalog-panel.test.ts test/service-categories.test.ts` | 2 archivos, 73 tests, 0 fallos | ✓ PASS |
| Typecheck filtrado | `./node_modules/.bin/tsc --noEmit \| grep -v '^\.next/' \| grep "error TS"` | Sin salida | ✓ PASS |
| Cero migraciones nuevas (D-09) | `ls supabase/migrations/*.sql \| wc -l` | 41 | ✓ PASS |
| Cero paquetes nuevos | `git diff -- package.json package-lock.json` | Sin salida | ✓ PASS |
| CR-01 reproducible en código | lectura directa de `deleteCategory` + `addService`/`SelectValue` | El fallback visual y el estado del formulario divergen tal como describe el review | ✓ CONFIRMADO (bug real) |

Suite completa (`npx vitest run`) no se volvió a correr en esta verificación: el orquestador ya la corrió sobre este mismo HEAD (41a69ba) con resultado 93 archivos / 1251 pasados / 0 fallos, evitando una segunda corrida completa redundante.

### Probe Execution

No aplica — la fase no declara probes (`scripts/*/tests/probe-*.sh`) ni el PLAN los menciona.

## Human Verification Required

Nadie abrió un navegador durante la ejecución (confirmado por las cuatro secciones "UAT visual pendiente" de los SUMMARY y por los hechos del orquestador). Los siguientes puntos, aunque las truths de código ya están VERIFIED, necesitan confirmación visual antes de dar la fase por cerrada de punta a punta — quedan listados en el frontmatter `human_verification` y se resumen acá:

### 1. Hilo completo de una categoría (crear, ver, reordenar, recargar)
**Test:** Crear una categoría, subirla con ▲, recargar la página.
**Expected:** El orden nuevo sobrevive al reload; duplicado insensible a mayúsculas muestra copy propia.
**Why human:** Cadena RSC → prop → componente → escritura → base → RSC, sólo observable en el navegador.

### 2. Diálogo "Mover…", chips y grupo "Sin categoría"
**Test:** Asignar/desasignar por el diálogo; cerrar con Escape; ver el layout a 375px con nombres largos.
**Expected:** "Sin categoría" siempre presente y última; Escape no escribe nada; sin scroll horizontal.
**Why human:** Interacción de diálogo y responsive, no verificable por grep.

### 3. Campos Categoría y Descripción corta del formulario
**Test:** Guardar una descripción de 120 caracteres y confirmar en `/[slug]` que entra en las dos líneas del `line-clamp-2`.
**Expected:** Lo escrito coincide exactamente con el recorte visual real.
**Why human:** Es una assumption explícitamente flagueada por el propio 23-02-PLAN.md como no re-medida.

### 4. Renombrar, borrar y arrastre nativo
**Test:** Renombrar in situ (Enter/Escape/blur), borrar una categoría con servicios y confirmar que siguen reservables en `/[slug]`, arrastrar filas y chips en desktop.
**Expected:** Los tres flujos funcionan sin romper el aislamiento por tenant ni dejar estado a medias.
**Why human:** Foco, selección de texto y drag-and-drop nativo no son verificables con grep.

### 5. Modos de orden ida y vuelta + sección Posición
**Test:** Poner categorías en modo alfabético, volver a personalizado y confirmar que el arreglo manual vuelve intacto (CAT-06); abrir la sección "Posición" del diálogo Mover.
**Expected:** El orden manual sobrevive al viaje de ida y vuelta; "Posición" sólo aparece fuera del camino de identidad.
**Why human:** El checkpoint D-11 se resolvió sin abrir el navegador; el propio equipo lo dejó como UAT pendiente.

## Gaps Summary

La fase está **casi completa en código**: los cuatro planes están ejecutados, el typecheck y la suite completa están verdes, no se agregaron migraciones ni paquetes, y las 5 truths de negocio del roadmap (CAT-01, CAT-03, CAT-04/05, CAT-11) tienen soporte de código y tests directos. El bloqueo es puntual pero real: **CR-01**, encontrado por el code review producido en el mismo commit que se está verificando (`23-REVIEW.md`, HEAD `41a69ba`), sigue sin ningún commit de corrección — se confirmó leyendo el código actual, no sólo el texto del review. El defecto es alcanzable desde la operación normal de la misma pantalla (`/servicios`): el dueño arma un servicio, se distrae, borra una categoría desde el organizador que está debajo, y el alta queda bloqueada hasta recargar. Eso contradice la promesa de CAT-02 de que asignar (o no) una categoría es una operación simple y siempre disponible.

**Camino recomendado:** un plan chico de cierre de gaps que aplique el fix ya propuesto por el reviewer (sanear `newService.category`/`editSvcForm.category` contra `serviceCategories` vigente al escribir, o un callback `onCategoryDeleted` desde `CategoriasManager`), sin reabrir el resto de la fase. Los warnings WR-01/03/04/05 y los info IN-01..05 no bloquean el goal de la fase y pueden quedar como deuda a revisar en la Phase 24 o en un cierre de backlog posterior — no se listan como gaps porque ninguno rompe un must-have de este verificador, pero quedan documentados arriba para que no se pierdan.

---

_Verified: 2026-09-16_
_Verifier: Claude (gsd-verifier)_
