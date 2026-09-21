---
phase: 23-el-panel-que-organiza-el-cat-logo
verified: 2026-09-21T17:00:00Z
status: passed
score: 11/11 must-haves verificadas
covered_files:
  - ".planning/workstreams/motor-reservas/REQUIREMENTS.md"
  - ".planning/workstreams/motor-reservas/ROADMAP.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-01-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-01-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-02-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-02-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-03-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-03-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-04-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-04-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-05-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-05-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-06-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-06-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-07-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-07-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-08-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-08-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-09-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-09-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-10-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-10-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-11-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-11-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-REVIEW-FIX.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-REVIEW.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UAT.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UI-SPEC.md"
  - "app/(dashboard)/servicios/page.tsx"
  - "app/(dashboard)/settings/settings-client.tsx"
  - "app/[slug]/booking-client.tsx"
  - "components/booking/service-description.test.tsx"
  - "components/booking/service-description.tsx"
  - "components/dashboard/categorias-manager.test.tsx"
  - "components/dashboard/categorias-manager.tsx"
  - "components/landing/services.tsx"
  - "lib/catalog-panel.ts"
  - "lib/panel-draft.ts"
  - "test/catalog-panel.test.ts"
  - "test/panel-draft.test.ts"
  - "test/service-categories.test.ts"
covered_digest: "v1:sha256:8f4ab835d55224239e6ec3b16e01fff7743018d545c656e4bac061aa147de2d4"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "Gate api-coverage.verify-pre (declaró block: true sobre la fase)"
    reason: "Falso positivo confirmado por lectura directa: ninguno de los 12 archivos que tocó la fase 23 (todos listados en covered_files, incluidos los 8 que 23-09/10/11 no modificaron) contiene un fetch() a un host externo. Los únicos fetch() en app/(dashboard)/settings/settings-client.tsx apuntan a rutas propias (/api/subscription/cancel, /api/mercadopago/disconnect, /api/google/disconnect, /api/google/sync, /api/appointments/cleanup-expired); las tres apariciones de https:// en ese archivo y en app/[slug]/booking-client.tsx son un placeholder de input, el script de reCAPTCHA (preexistente, sin tocar por esta fase) y hrefs estáticos de Google/Forjo — ninguna es una llamada de red nueva de esta fase. Phase 23 es panel UI puro sobre Supabase, sin integración con APIs externas nuevas."
    accepted_by: "gsd-verifier (verificación independiente, ronda 5)"
    accepted_at: "2026-09-21T17:00:00Z"
re_verification:
  previous_status: human_needed
  previous_score: 7/11
  gaps_closed:
    - "G-23-21 + G-23-23 (truth 8, 23-09): confirmado en la app real por el dueño con dos capturas (UAT Test 23) — nombre de 40+ caracteres envuelve en mobile sin desbordar; en desktop el modo de cupo y el stepper comparten línea, tarjeta compactada, acciones en la última fila sin nada colgando. Regresión de mobile confirmada aparte (Test 24)."
    - "G-23-22 (truth 9, 23-10): confirmado en Windows —la plataforma del dueño y la única donde el scrollbar clásico materializaba el defecto— (UAT Test 25): el diálogo no cambia de ancho útil entre los tres modos de cupo, y las tres etiquetas del toggle apilado entran completas."
    - "G-23-25 (truth 10, 23-10 + WR-05): confirmado en los tres diálogos de edición (UAT Test 26, click afuera/Escape bloquean con cambios; Test 27, los cuatro falsos positivos no ensucian el borrador, incluida la confirmación en navegador real del fix WR-05 —grupal→individual→grupal conserva el cupo—; Test 29, el aviso se anuncia por lector de pantalla vía Escape)."
  gaps_remaining: []
  regressions: []
  reclassifications_reviewed:
    - test: 6
      verdict: "de acuerdo"
      note: "El propio result ya era pass sobre el comportamiento del test (contador 0/120, tope duro, guardado/borrado); el issue derivado quedó registrado aparte como G-23-6 (resolved, planes 23-05/23-07) y re-verificado en navegador real por los Tests 17 y 18 (ambos pass, con nota de verificación explícita en /negocio-prueba y en el preview /web). La cadena de evidencia es completa: no es un pass rescatado por reclasificación sola, tiene re-confirmación independiente en dos superficies."
    - test: 10
      verdict: "de acuerdo"
      note: "El reported del propio usuario abre con 'Pass.' explícito sobre la ida y vuelta de modos, que es el criterio del test. Los dos reclamos derivados se resolvieron por separado: G-23-10a resolved (plan 23-06) y re-verificado por el Test 19 (pass, 7 sub-casos); G-23-10b withdrawn por aclaración del propio usuario (no era un gap, malentendido de alcance)."
    - test: 20
      verdict: "de acuerdo"
      note: "El reported abre con 'pass.' sobre el criterio exacto del test (renglón, link Editar/Agregar descripción, diálogo, teclado). El issue era un pedido de layout nuevo sobre la misma tarjeta, registrado como G-23-20 — resolved y confirmado en navegador real por el propio Test 21 (confirmed_pass)."
    - test: 21
      verdict: "de acuerdo con matiz"
      note: "Es la reclasificación menos trivial de las cuatro: el reported dice 'Salvo lo del nombre en +40 caracteres en movil: pass' — o sea el propio dueño marcó una excepción explícita, no sólo un comentario aparte. Pero esa excepción SÍ se registró como gap con nombre (G-23-21) y HOY tiene su propia confirmación independiente en navegador real con capturas (Test 23), igual que los otros tres hallazgos derivados de este test (G-23-22 vía Test 25, G-23-23 vía Test 23, G-23-24 vía Test 30). El criterio nuclear de G-23-20 (jerarquía precio/duración/acciones en desktop) tiene su propio confirmed_pass explícito citando la configuración que WR-03 había roto. No se rescata nada sin evidencia propia: los cuatro derivados están cerrados y re-verificados uno por uno."
behavior_unverified_items: []
coincidental_reliance_items: []
---

# Phase 23: El panel que organiza el catálogo — Reporte de re-verificación (ronda 5, cierre de la UAT completa)

**Phase Goal:** Que el dueño pueda usar lo que la Phase 22 volvió declarable, en la pantalla donde ya administra sus servicios: crea, renombra y borra categorías; asigna una o ninguna a cada servicio (nunca obligatorio); las reordena arrastrando y con ▲/▼; elige los dos modos de orden para todo el negocio; y escribe la descripción corta (CAT-11, tope 120 con contador) que el cliente ve en el booking.
**Verified:** 2026-09-21
**Status:** passed
**Re-verification:** Sí — quinta pasada. La `23-VERIFICATION.md` anterior (2026-09-18, `status: human_needed`, 7/11) dejaba tres truths (8, 9, 10) `⚠️ PRESENT_BEHAVIOR_UNVERIFIED`: código presente, cableado y medido con sondas estáticas o tests de lógica pura, pero sin que nadie hubiera abierto la app real. Esta ronda cubre exactamente eso: el dueño corrió la UAT completa en la app real el 2026-09-21 (`23-UAT.md`, `status: complete`, 30/30 pass, 0 issues, 0 pending, los 10 gaps totales de la fase `resolved` o `withdrawn`).

## Qué cambió desde la pasada anterior (resumen ejecutivo)

1. **Los tres truths que quedaban `PRESENT_BEHAVIOR_UNVERIFIED` en la ronda 4 pasan a `✓ VERIFIED`** con evidencia de navegador real: Test 23 (con dos capturas del dueño) cierra G-23-21 + G-23-23; Test 25 (confirmado específicamente en Windows, la plataforma del dueño y la única donde el defecto se materializaba) cierra G-23-22; Tests 26+27+29 cierran G-23-25 y confirman en vivo el fix de WR-05 (el cupo ya no se degrada al ir a Individual y volver).
2. **Cuatro tests de rondas anteriores (6, 10, 20, 21) se reclasificaron de `issue` a `pass`** al cierre de la UAT. Revisé la justificación de cada uno por separado (ver `reclassifications_reviewed` en el frontmatter): las cuatro tienen (a) un `reported` del propio usuario que abre afirmando el criterio del test, y (b) el reclamo derivado registrado como su propio gap, resuelto y **re-verificado por un test posterior independiente** — no es una reclasificación que se apoye sólo en la relectura del reporte viejo. Estoy de acuerdo con las cuatro.
3. **Cero código nuevo desde la ronda 4.** `git status --porcelain` sobre `app`, `components`, `lib`, `test` y el directorio de la fase: sin salida. Los 13 commits citados por la ronda 4 (incluidos `24087b7`, `3259e60`, `bba8f94`, `25655ec`, `f11307c`, `691d5da`, `880d0dc`, `dbee8e9`, `41ee31f`, `846a68b`, `b9d6491`, `9b7dd6a`, `91aa7a1`) siguen presentes en el historial; lo único nuevo son los commits de la UAT (`e70f6b8`, `d90c7bb`) y de esta verificación no se agregó ni un cambio de código.
4. **Re-confirmé por lectura directa, no por confianza en el reporte anterior**, cada pieza de código que la ronda 4 citó como evidencia: `min-w-0 break-words sm:truncate` en el nombre (línea 2909), el envoltorio único con el gate `sm:hidden` mudado (línea 2999), `[scrollbar-gutter:stable]` (línea 3313), el toggle en `grid-cols-1` sin excepción de desktop (línea ~510), `guardDraftOnDismiss` cableada en los tres `<Dialog>` (líneas 3273/3743/4060), `dismissBlockedNotice` montada en los tres popups, `saveEditLocation` con `.eq('business_id', ...)`, y `capacityModePatch` en `lib/panel-draft.ts`. Todo coincide exactamente con lo que la ronda 4 midió.
5. **Corrí de forma independiente** `npx vitest run test/panel-draft.test.ts` (24/24 pass) y el typecheck filtrado (`0 error TS` fuera de `.next/`) sobre el HEAD actual.
6. **Override del gate `api-coverage.verify-pre`** (declaró `block: true`): confirmado como falso positivo por lectura directa de los 12 archivos que la fase tocó — cero `fetch()` a host externo introducido por esta fase (ver `overrides` en el frontmatter).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidencia |
|---|---|---|---|
| 1 | CAT-01: crear/renombrar/borrar categorías; duplicado case-insensitive rechazado por la base con copy propia | ✓ VERIFIED | Sin cambios de código desde la ronda 4; `classifyCategoryWriteError`/`CATEGORY_WRITE_REJECT_COPY` intactos en `lib/catalog-panel.ts`. UAT Tests 1, 7, 8 = pass en navegador real |
| 2 | CAT-02: asignar una categoría o ninguna a cada servicio, nunca obligatorio | ✓ VERIFIED | Sin cambios de código. CR-01 y G-23-10a siguen confirmados. UAT Tests 3, 4, 5, 19 = pass |
| 3 | CAT-03: reordenar categorías arrastrando y con ▲/▼; el orden persiste renumerando la lista completa de hermanas | ✓ VERIFIED | Sin cambios de código. `renumber`/`moveWithinList`/`persistCategoryOrder`/`reorderCategory` intactos. UAT Tests 2, 9 = pass |
| 4 | CAT-04/CAT-05: dos modos de orden por negocio; con modo ≠ personalizado los controles de reordenar desaparecen | ✓ VERIFIED | Sin cambios funcionales. UAT Test 10 = pass, reclasificado de `issue` con justificación revisada y compartida (ver arriba); G-23-10b retirado por el usuario |
| 5 | CAT-11 (core): descripción corta con tope duro de 120 y contador, igual a lo que la tarjeta del booking ya renderiza | ✓ VERIFIED | `ServiceDescription` (booking + web de marca) y el renglón + link de `/servicios` sin cambios de código; UAT Tests 6, 17, 18, 20 = pass, dos de ellos (6, 20) reclasificados con re-verificación independiente en Tests 17/18/21 |
| 6 | Invariante D-07 (un único productor `categoryPatch` y un único traductor de `services.category_id`, un solo `update` suelto) | ✓ VERIFIED | Re-confirmado sobre el HEAD actual: `from('services')` sigue en 6 líneas en `settings-client.tsx`; ningún commit de esta fase agregó un escritor propio de `services` — sólo el filtro `business_id` sumado a `locations` (WR-06) |
| 7 | G-23-20: en desktop el precio a la altura del título, la duración abajo, las acciones en la última fila, sin reabrir el desborde de 375px (G-02) ni los toques errados (G-04) | ✓ VERIFIED | Confirmado en la app real por el dueño (UAT Test 21, `confirmed_pass`, incluida la configuración que WR-03 había roto) |
| 8 | G-23-21 + G-23-23: a 375px el nombre largo envuelve sin desbordar; en desktop el modo de cupo y el stepper comparten línea sin dejar contenido colgando | ✓ VERIFIED | **Confirmado en la app real con dos capturas del dueño** (UAT Test 23): mobile — nombre `SupercalifragilisticoEspialidoso123456` envuelve en dos renglones adentro de la tarjeta, con la píldora "Sin cobertura" al lado, sin desborde ni scroll horizontal; desktop — "Clase grupal" comparte línea con el stepper, acciones en la última fila, nada colgando. Regresión de mobile confirmada aparte (Test 24). Código re-confirmado línea por línea (`min-w-0 break-words sm:truncate` :2909; envoltorio único :2999; `py-6 sm:py-0` :863; `leftRows` con sumando 1 :2854-2858) |
| 9 | G-23-22: el diálogo Editar servicio no cambia de ancho útil entre modos de cupo; las tres etiquetas del toggle entran completas en una línea en las dos vistas | ✓ VERIFIED | **Confirmado en Windows** —la plataforma del dueño y la única donde el scrollbar clásico materializaba el defecto— (UAT Test 25, pass). Código re-confirmado: `[scrollbar-gutter:stable]` (:3313), radiogroup en `grid-cols-1` sin excepción de desktop |
| 10 | G-23-25: un click afuera o Escape accidental sobre un borrador con cambios NO cierra el diálogo (servicio, sede o profesional); avisa por toast y por lector de pantalla; sin cambios y con la ✕ cierra siempre | ✓ VERIFIED | **Confirmado en los tres diálogos** (UAT Test 26: los cuatro sub-casos a/b/c/d, pass; Test 27: los cuatro falsos positivos no ensucian el borrador, incluida la confirmación en navegador real del fix WR-05 —grupal→individual→grupal conserva 12, no degrada a 2—; Test 29: el aviso se anuncia por lector de pantalla vía Escape). Más `test/panel-draft.test.ts` (24/24, corrido de forma independiente en esta verificación) sobre la lógica de decisión pura |
| 11 | G-23-24: la entrada `G-23-20` del `23-UI-SPEC.md` describe la fila derivada de las acciones (no una fila fija) y su regla nombra el defecto WR-03 que ya ocurrió | ✓ VERIFIED | Leído el texto completo de la entrada (líneas 889-897): dice explícitamente "La fila de las acciones se DERIVA, no se fija" y "WR-03 ya ocurrió exactamente así", con el corolario operativo. **Segunda lectura humana confirmada** (UAT Test 30, pass, "Se entiende") — la versión corregida ya pasó por el mismo juicio de legibilidad que la anterior había aprobado en el Test 22 |

**Score:** 11/11 truths verificadas. Las tres que la ronda 4 dejó `⚠️ PRESENT_BEHAVIOR_UNVERIFIED` (8, 9, 10) tienen ahora confirmación directa en la app real — dos de ellas con capturas o confirmación de plataforma específica (Windows), la tercera con confirmación de accesibilidad real (lector de pantalla). Ninguna FAILED.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `app/(dashboard)/settings/settings-client.tsx` | `min-w-0` en el nombre; envoltorio único modo+cupo con gate mudado; `leftRows` actualizado; scrollbar-gutter reservado; toggle apilado; guarda de descarte cableada en 3 diálogos; filtro `business_id` en `saveEditLocation`; botón de sede deshabilitado con nombre vacío; región sr-only de aviso | ✓ VERIFIED | Cada pieza re-confirmada por grep/lectura directa en esta ronda (ver evidencia de los truths 8-10) |
| `lib/panel-draft.ts` | Módulo puro con `guardDraftOnDismiss`, las tres huellas, `capacityModePatch`, `locToPayload`/`proToPayload` | ✓ VERIFIED | Existe en disco, importado en `settings-client.tsx`; `capacityModePatch` y `guardDraftOnDismiss` confirmados por grep |
| `test/panel-draft.test.ts` | Tests de la guarda, las tres huellas, `capacityModePatch` y la regresión de WR-05 | ✓ VERIFIED | **Corrido de forma independiente en esta ronda: 24/24 pass**, incluido el test de la regresión WR-05 |
| `23-UI-SPEC.md` | 6 entradas en `## Cambios post-UAT`, la de `G-23-20` corregida por G-23-24, 2 entradas nuevas (G-23-21+23, G-23-22) | ✓ VERIFIED | Confirmado por lectura completa (líneas 866-928); la entrada G-23-20 dice explícitamente "la fila de las acciones se DERIVA" y nombra WR-03 |
| `23-UAT.md` | UAT completa, 30 tests, 0 issues pendientes, gaps resueltos | ✓ VERIFIED | `status: complete`, `total: 30, passed: 30, issues: 0, pending: 0`; los 10 gaps de `## Gaps` están todos `resolved` o `withdrawn` |
| `lib/catalog-panel.ts`, `test/catalog-panel.test.ts`, `components/dashboard/categorias-manager.tsx`/`.test.tsx`, `components/booking/service-description.tsx`/`.test.tsx`, `app/[slug]/booking-client.tsx`, `components/landing/services.tsx` | Sin cambios desde la ronda 4 | ✓ VERIFIED (sin regresión) | `git status --porcelain` sobre `app`, `components`, `lib`, `test`: sin salida |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `<p>` del nombre del servicio | Encoge sin desbordar la tarjeta a 375px | `min-w-0 break-words sm:truncate` | ✓ WIRED | Confirmado en línea 2909; confirmado en navegador real por el dueño (Test 23) |
| Envoltorio de línea de datos + control de cupo | Una sola fila de grilla en desktop, apilado en mobile | `flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 sm:col-start-1` con el gate `sm:hidden` mudado adentro | ✓ WIRED | Confirmado en línea 2999; confirmado en navegador real (Test 23) |
| Fila scrolleable del diálogo | Ancho útil estable entre los tres modos de cupo | `[scrollbar-gutter:stable]` en el contenedor con `overflow-y-auto` | ✓ WIRED | Confirmado en línea 3313; confirmado específicamente en Windows (Test 25) |
| Radiogroup del modo de cupo | Tres etiquetas en una línea, en las dos vistas | `grid-cols-1` sin `sm:grid-cols-3` | ✓ WIRED | Confirmado; confirmado en navegador real (Test 25) |
| `onOpenChange` de los tres `<Dialog>` de edición | `guardDraftOnDismiss` con la huella, el cierre y el aviso de cada formulario | `guardDraftOnDismiss(isEditSvcDirty\|isEditLocDirty\|isEditProDirty, close, noticeDismissBlocked)` | ✓ WIRED | Confirmado en las 3 líneas (3273, 3743, 4060); confirmado en navegador real en los tres diálogos (Test 26) |
| Región `sr-only` de aviso | Montada dentro de cada uno de los tres popups | `{dismissBlockedNotice}` | ✓ WIRED | Confirmado en las 3 líneas; confirmado con lector de pantalla real (Test 29) |
| `saveEditLocation` | Filtra por tenant además de RLS | `.eq('id', editLoc.id).eq('business_id', business.id)` | ✓ WIRED | Confirmado en línea 2204 |
| Botón Guardar de "Editar sede" | Deshabilitado con el nombre vacío | `disabled={savingEditLoc || !editLocForm.name.trim()}` | ✓ WIRED | Confirmado; confirmado en navegador real (Test 28, "se entiende, no se lee como trabada") |

### Data-Flow Trace (Level 4)

No aplica — esta fase es layout CSS y manejo de eventos del cliente sobre datos que ya fluían (servicios, sedes, profesionales); ningún camino de lectura/escritura a Supabase se agregó ni se modificó desde la ronda 4 salvo el filtro `business_id` de WR-06 (ya cerrado en rondas anteriores).

### Anti-Patrones encontrados

| Archivo | Severidad | Hallazgo | Impacto en must-haves |
|---|---|---|---|
| `categorias-manager.tsx:545-556` (WR-01, rondas anteriores) | ⚠️ Warning | Sigue abierto — fuera del alcance de esta fase de cierre. La rama `'place'` del drop sobre chip sigue usando `target.category_id` en vez del grupo visible | Caso de borde de CAT-02/CAT-03, no bloquea el camino principal |
| `categorias-manager.tsx:453-454, 559-564, 669-687` (WR-02, rondas anteriores) | ⚠️ Warning | Sigue abierto. Ventana de carrera de baja probabilidad entre `confirmMove` y un drop en vuelo | No bloquea el camino principal |
| `settings-client.tsx` (segunda mitad de WR-05, dejada abierta a propósito) | ⚠️ Warning | `saveEditService` sigue sin el pre-chequeo de bajada de cupo contra inscriptos vivos que sí tiene el stepper de la tarjeta (`saveCapacityInline`/`askCapacityDowngrade`). No aplicado porque el aviso es un `ConfirmDialog` y dispararlo desde el diálogo de edición abierto sería un modal anidado, que CLAUDE.md prohíbe explícitamente. El camino que originó el hallazgo (ir a Individual y volver) ya no llega a esa escritura (WR-05 la cerró); queda el caso preexistente de tipear a mano un cupo menor en el diálogo | No bloquea ningún must-have; deuda preexistente documentada |
| `settings-client.tsx` (límite aceptado de WR-08) | ℹ️ Info | La región `sr-only` no tiene expiración automática (un `setTimeout` en `useRef` sumaba errores de eslint sobre un piso inamovible). Dos intentos de cierre bloqueados consecutivos dentro del mismo diálogo anuncian una sola vez (el toast sí se repite) | Cosmético para lector de pantalla en un caso poco común; no bloquea CAT-11 |
| `categorias-manager.tsx:1000` (IN-14) | ℹ️ Info | El diálogo "Mover …" del organizador quedó explícitamente fuera de la guarda de G-23-25, por decisión pendiente del usuario, documentada | No bloquea el camino principal |
| `settings-client.tsx:2755-2758, 2769` (IN-07/IN-08, rondas anteriores) | ℹ️ Info | Sin tope superior real de precio más allá del guard de cupo; orden de lectura desktop cosmético | No bloquea con datos reales |
| `REQUIREMENTS.md` — tabla de Traceability (CAT-01..05, CAT-11) | ℹ️ Info | Sigue en "Pendiente" pese a que los 5 Success Criteria del ROADMAP están confirmados por código + UAT completa. Es un documento de milestone que se actualiza en el cierre formal, no algo que esta verificación de fase deba escribir — señalado ya en la ronda 4, sin cambios | No bloquea el goal de la fase; pendiente administrativo para `/gsd-complete-milestone` o equivalente |

No se encontraron `TBD`/`FIXME`/`XXX` sin referencia en los archivos tocados por la fase.

### Requirements Coverage

| Requirement | Source Plan | Descripción | Status | Evidencia |
|---|---|---|---|---|
| CAT-01 | 23-01, 23-03 | Crear/renombrar/borrar categorías; duplicado rechazado por la base | ✓ SATISFIED | Código + tests + UAT (Tests 1, 7, 8, todos pass en navegador real) |
| CAT-02 | 23-01, 23-02, 23-03, 23-06 | Asignar una categoría o ninguna, nunca obligatorio | ✓ SATISFIED | CR-01 y G-23-10a cerrados; UAT Tests 3, 4, 5, 19 |
| CAT-03 | 23-01, 23-03, 23-04, 23-06 | Reordenar arrastrando y con ▲/▼, renumerando la lista completa | ✓ SATISFIED | UAT Tests 2, 9; WR-01/WR-02 son advertencias de borde preexistentes, no bloquean |
| CAT-04 | 23-04 | Elegir los dos modos de orden para todo el negocio | ✓ SATISFIED | UAT Test 10 (pass, ida y vuelta confirmada) |
| CAT-05 | 23-01, 23-04, 23-06 | Controles de reordenar desaparecen fuera de modo personalizado | ✓ SATISFIED | UAT Test 10 |
| CAT-11 | 23-02, 23-05, 23-07, 23-08, 23-09, 23-10, 23-11 | Descripción corta con tope de 120 y contador; layout de precio/duración/toggle de cupo del panel y guarda de descarte accidental de los diálogos de edición | ✓ SATISFIED | G-23-6/G-23-6b/G-23-20/G-23-21/G-23-22/G-23-23/G-23-24/G-23-25 — los 8 gaps que tocan CAT-11 están `resolved`, cada uno con su propio test de re-verificación en navegador real (17, 18, 21, 23, 24, 25, 26, 27, 29, 30) |

Sin requisitos huérfanos: los 6 IDs de la fase (CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-11) están declarados en el frontmatter de al menos un PLAN y en `REQUIREMENTS.md`. La marcación `[x]` de CAT-11 en la sección `## Requisitos` de `REQUIREMENTS.md` está justificada por el cuerpo de evidencia de arriba: campo del panel implementado (tope 120 + contador), la tarjeta pública muestra exactamente lo escrito (G-23-6, Tests 17/18), el renglón+link del panel (G-23-6b, Test 20), y las tres rondas de layout/accesibilidad sobre esa misma superficie (G-23-20/21/22/23/24/25), todas resueltas y re-verificadas en navegador real. La tabla de **Traceability** (que dice "Pendiente" para los 6 IDs de esta fase) es un artefacto de milestone que no se actualiza por esta verificación — señalado como pendiente administrativo, no como gap de la fase, igual que en la ronda 4.

### Behavioral Spot-Checks

| Comportamiento | Comando | Resultado | Status |
|---|---|---|---|
| `test/panel-draft.test.ts` completo (guarda, 3 huellas, `capacityModePatch`, regresión WR-05) | `npx vitest run test/panel-draft.test.ts` | 1 archivo, 24 tests, 24 passed | ✓ PASS (corrido de forma independiente en esta ronda) |
| Typecheck filtrado | `./node_modules/.bin/tsc --noEmit \| grep -v '^\.next/' \| grep "error TS"` | Sin salida | ✓ PASS (corrido de forma independiente en esta ronda) |
| Árbol de trabajo limpio (todos los cambios claimados están commiteados) | `git status --porcelain -- app components lib test .planning/.../23-*` | Sin salida | ✓ PASS |
| Los 13 commits citados por la ronda 4 existen en el historial | `git cat-file -t <hash>` × 13 | 13/13 `commit` | ✓ PASS |
| `min-w-0` en el nombre del servicio | `grep -n "min-w-0 break-words sm:truncate"` | 1 ocurrencia, línea 2909 | ✓ PASS |
| `scrollbar-gutter:stable` en la fila scrolleable | `grep -n "scrollbar-gutter"` | 1 ocurrencia, línea 3313 | ✓ PASS |
| Toggle de cupo sin `sm:grid-cols-3` | lectura directa del componente `CapacityModeFields` | `grid-cols-1 gap-1` sin excepción de desktop, con comentario explícito de la decisión (opción C) | ✓ PASS |
| `guardDraftOnDismiss` cableada en los tres `<Dialog>` de edición | `grep -n "guardDraftOnDismiss"` | 3 usos + 1 import | ✓ PASS |
| `dismissBlockedNotice` montada en los tres popups | `grep -n "dismissBlockedNotice"` | 1 definición + 3 usos | ✓ PASS |
| `saveEditLocation` filtra por `business_id` | `grep -n "from('locations').update"` | 2/2 llamadas con `.eq('business_id', business.id)` | ✓ PASS |
| Cero `fetch()` externo en los 12 archivos tocados por la fase (override del gate api-coverage) | `grep -n "fetch(\|https\?://"` sobre los 12 archivos | Sólo rutas propias `/api/...`, un placeholder, el script de reCAPTCHA preexistente y hrefs estáticos de Google/Forjo | ✓ PASS |

Suite completa (`npx vitest run`) no se corrió de nuevo en esta ronda: se reusa el número ya medido y documentado por la pasada 3 del code review sobre este mismo HEAD (96 archivos / 1325 passed / 4 expected fail / 1 skipped), reforzado por la corrida independiente de `test/panel-draft.test.ts` (24/24) de esta verificación — no hay código nuevo desde entonces que justifique correr la suite completa otra vez.

### Probe Execution

No aplica — la fase no declara probes (`scripts/*/tests/probe-*.sh`). Las sondas ad-hoc de Chrome headless de 23-09/23-10 no se commitean (decisión explícita de esos planes) y ya no son el instrumento relevante: la evidencia de esta ronda es la UAT en la app real, no las sondas.

## Human Verification Required

Ninguno. Los tres ítems que la ronda 4 dejó pendientes de confirmación en navegador real (tarjeta compactada, diálogo con ancho estable + toggle apilado, guarda de descarte con anuncio de lector de pantalla) fueron confirmados por el dueño en la UAT completa del 2026-09-21 (`23-UAT.md`, Tests 23-29). La lectura de la entrada corregida de `23-UI-SPEC.md` también se confirmó (Test 30).

## Gaps Summary

No hay gaps abiertos. Los 10 gaps de la fase (G-23-6, G-23-6b, G-23-10a, G-23-10b, G-23-20, G-23-21, G-23-22, G-23-23, G-23-24, G-23-25) están `resolved` o `withdrawn` en `23-UAT.md`, cada uno con su test de re-verificación explícito. Las 6 warnings de la tercera pasada de code review (WR-05..WR-10) están corregidas y confirmadas — 5 por lectura de código y 1 (WR-09) además por corrida independiente de `test/panel-draft.test.ts` (24/24) en esta misma ronda.

Quedan dos piezas de deuda aceptada, documentadas y sin impacto en ningún must-have: la segunda mitad de WR-05 (el pre-chequeo de bajada de cupo en el guardado del diálogo, no aplicado a propósito para no anidar un `ConfirmDialog`) y el límite de WR-08 (la región sr-only no expira sola). Más tres follow-ups diferidos por decisión explícita del usuario (arrastre táctil en mobile para categorías, link "Cambiar" en la línea de cobertura cuando SÍ hay cobertura, error inline en rojo en "Editar sede"), todos registrados en `## Deferred Follow-Ups` de `23-UAT.md` como capacidad nueva, no como defectos.

La marcación "Pendiente" de la tabla de Traceability en `REQUIREMENTS.md` para los 6 IDs de esta fase sigue sin actualizarse — es, como en la ronda 4, un pendiente administrativo de cierre de milestone, no un gap de esta fase: los 5 Success Criteria del ROADMAP y los 6 requisitos están satisfechos por código + tests + UAT completa en navegador real.

**Con la UAT completa y las tres piezas que faltaban confirmadas en la app real, la fase alcanza `passed`.** No se fuerza el resultado: cada uno de los 11 truths tiene evidencia de código re-confirmada de forma independiente en esta ronda, y los tres que dependían de comportamiento de runtime (integración con Base UI, plataforma Windows, lector de pantalla) tienen confirmación humana explícita y específica, no una relectura del reporte anterior.

---

_Verified: 2026-09-21_
_Verifier: Claude (gsd-verifier)_
