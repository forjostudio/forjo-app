---
phase: 23-el-panel-que-organiza-el-cat-logo
verified: 2026-09-18T14:10:00Z
status: human_needed
score: 6/6 must-haves verified (0 gaps de código; sólo falta la UAT visual del layout nuevo de 23-08)
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
  - "lib/service-categories.ts"
  - "test/catalog-panel.test.ts"
  - "test/service-categories.test.ts"
covered_digest: "v1:sha256:476c74f27a4f0e7fdf8a7bac585c8e5d050b967fe9281d9c7595cd5cd744cc6f"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 6/6
  gaps_closed:
    - "G-23-20 (23-UAT.md Test 20, único gap abierto de la ronda anterior): en desktop (>=640px) el precio pasa a la columna derecha a la altura del nombre, la duración debajo en el registro de la descripción, y las tres acciones debajo de esos dos datos — cerrado por 23-08 (commit 3b500af), mobile sin ningún cambio de clase base"
    - "WR-03 (23-REVIEW.md, pasada incremental sobre 23-08): la fila fija sm:row-start-3 para las acciones dejaba contenido de la tarjeta (stepper de cupo compartido, píldoras de sedes, cobertura) POR DEBAJO de los botones en configuraciones normales de producción (multi-staff con sedes), y el foco saltaba hacia atrás — cerrado por 3b500af→13629dd: la fila se deriva (leftRows/actionsRow = max(3, leftRows)) y viaja como variable CSS consumida sólo en sm:, así mobile no cambia"
    - "WR-04 (23-REVIEW.md, pasada incremental sobre 23-08): tres frases de comentario describían el layout viejo (primera fila = nombre+acciones, modo de cupo como tercer dato junto a duración/precio, 'esta fila se ve igual que siempre') — cerrado por cdf0c79, diff de comentarios puro, 0 líneas de código"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Layout nuevo de la tarjeta de /servicios en desktop y su equivalente en mobile (G-23-20, 23-08)"
    expected: "Mobile a 375px: la tarjeta es idéntica a antes de 23-08 — nombre, renglón de descripción + link, la línea con duración y precio en UN renglón (con el modo de cupo detrás del punto medio si corresponde), sedes, cobertura, y al final la divisoria con las tres acciones. El precio NO aparece dos veces, sin scroll horizontal. Desktop (>=640px): a la derecha del nombre y a su misma altura, el precio; debajo la duración, más chica y en gris; debajo de las dos, Desactivar / lápiz / tacho — ahora en la ÚLTIMA fila de esa columna, nunca con contenido de la izquierda por debajo. Servicio con cupo compartido + sedes + cobertura (la configuración que WR-03 encontró rota): las acciones siguen cerrando la tarjeta, sin la línea de cobertura ni las píldoras de sedes colgando debajo de los botones. Nombre de 40+ caracteres y precio de 7 dígitos: sigue truncando en desktop sin robarle ancho al nombre, y envolviendo en mobile. Foco por teclado: Tab recorre link Editar → Desactivar → lápiz → tacho con anillo visible, en las dos vistas y también en la pestaña Desactivados."
    why_human: "Medición real de layout responsive (dónde cae cada fila de la grilla con distintas combinaciones de datos), superposición visual y foco por teclado sólo se observan en un navegador; ni el ejecutor de 23-08 ni el reviewer de la pasada incremental abrieron uno (23-08-SUMMARY.md, 'Pending human checks'; 23-REVIEW.md, 'No pude renderizarlo')."
  - test: "Lectura de la entrada G-23-20 del 23-UI-SPEC.md"
    expected: "Alguien que no vio la UAT del 2026-09-17 puede responder, leyendo sólo esa entrada, qué ve el dueño en desktop, qué ve en mobile, y por qué no son lo mismo (los dos motivos medidos: G-02 y G-04)."
    why_human: "Juicio de legibilidad del contrato, no verificable por grep."
---

# Phase 23: El panel que organiza el catálogo — Reporte de re-verificación (ronda 3)

**Phase Goal:** Que el dueño pueda usar lo que la Phase 22 volvió declarable, en la pantalla donde ya administra sus servicios: crea, renombra y borra categorías; asigna una o ninguna a cada servicio (nunca obligatorio); las reordena arrastrando y con ▲/▼; elige los dos modos de orden para todo el negocio; y escribe la descripción corta (CAT-11, tope 120 con contador) que el cliente ve en el booking.
**Verified:** 2026-09-18
**Status:** human_needed
**Re-verification:** Sí — tercera pasada, después del cierre de G-23-20 (plan 23-08) y de su corrección de code review (WR-03, WR-04)

## Qué cambió desde la pasada anterior (resumen ejecutivo)

La `23-VERIFICATION.md` anterior (2026-09-17, `status: human_needed`, 6/6) ya daba por cerrados los gaps de código de 23-05/23-06/23-07 y dejaba pendiente sólo la UAT visual de esas tres superficies. Esa UAT se corrió (`23-UAT.md`, Tests 17-20, todos `pass`, con un único issue cosmético: G-23-20). Esta ronda cubre exclusivamente lo que pasó después de esa UAT:

1. **Plan 23-08** cerró G-23-20: en desktop el precio pasa a la columna derecha a la altura del nombre, la duración debajo, y las acciones debajo de las dos; mobile no se toca.
2. **La pasada incremental del code review sobre 23-08** encontró 2 warnings — ambos **reales y ya corregidos**: WR-03 (fila fija de las acciones dejaba contenido de la tarjeta por debajo de los botones con cupo compartido + sedes, un caso normal de producción) y WR-04 (comentarios que quedaron describiendo el layout viejo). Confirmé ambos fixes leyendo el diff de los commits `13629dd` y `cdf0c79`, no sólo el texto del review.

Los truths de CAT-01, CAT-03, CAT-04, CAT-05, CAT-10a/D-07 no tienen código tocado en esta ronda — se re-chequean por regresión abajo (Requirements Coverage) y siguen VERIFIED sin cambios.

## Goal Achievement

### Observable Truths

| # | Truth (Roadmap SC) | Status | Evidencia |
|---|---|---|---|
| 1 | CAT-01: crear/renombrar/borrar categorías; duplicado case-insensitive lo rechaza la base con copy propia | ✓ VERIFIED | Sin cambios de código en esta ronda ni en la anterior; `classifyCategoryWriteError`/`CATEGORY_WRITE_REJECT_COPY` intactos en `lib/catalog-panel.ts`. UAT Tests 1, 7, 8 = pass en navegador real |
| 2 | CAT-02: asignar una categoría o ninguna a cada servicio, nunca obligatorio | ✓ VERIFIED | Sin cambios de código en esta ronda; CR-01 y G-23-10a (cerrados en la ronda anterior) siguen confirmados por lectura de código. UAT Tests 3, 4, 5, 19 = pass |
| 3 | CAT-03: reordenar categorías arrastrando y con ▲/▼; el orden persiste renumerando la lista completa de hermanas | ✓ VERIFIED | Sin cambios de código en esta ronda; `renumber`/`moveWithinList`/`persistCategoryOrder`/`reorderCategory` intactos. UAT Tests 2, 9 = pass |
| 4 | CAT-04/CAT-05: dos modos de orden por negocio; con modo ≠ personalizado los controles de reordenar desaparecen | ✓ VERIFIED | Sin cambios funcionales en esta ronda. UAT Test 10 = pass (con dos follow-ups diferidos, G-23-10b, ya retirados por el usuario según el contexto de esta re-verificación) |
| 5 | CAT-11: descripción corta con tope duro de 120 y contador, igual a lo que la tarjeta del booking ya renderiza | ✓ VERIFIED | `ServiceDescription` (booking + web de marca) y el renglón + link de `/servicios` sin cambios en esta ronda; UAT Tests 6, 17, 18, 20 = pass. **El pedido de layout que salió del Test 20** (precio/duración a la derecha, sólo cosmético) es el objeto de esta ronda — ver truth 7 |
| 6 | Invariante D-07 (un único productor `categoryPatch` y un único traductor de `services.category_id`, un solo `update` suelto) | ✓ VERIFIED | Confirmado de nuevo sobre el HEAD actual: `from('services')` = 6 líneas en `settings-client.tsx`, 2 aperturas de diálogo (lápiz + link), ninguna de las ediciones de 23-08 agregó un escritor propio — el cambio es puro layout, cero lecturas/escrituras nuevas |
| 7 | **G-23-20 (CAT-11, nuevo en esta ronda):** en desktop el precio queda a la altura del título, la duración abajo más chica, y las tres acciones debajo de esos datos — sin reabrir el desborde de 375px (G-02) ni los toques errados (G-04), y sin dejar contenido de la tarjeta por debajo de los botones en ninguna combinación de datos | ✓ VERIFIED (por código; visual pendiente) | Ver detalle completo abajo. Las tres celdas de la columna derecha, el gate de viewport excluyente, la fila dinámica de las acciones (`leftRows`/`actionsRow`, `13629dd`) y los tres comentarios reescritos (`cdf0c79`) confirmados leyendo el código actual línea por línea, no el texto del SUMMARY. La medición visual real (que el precio se vea a la altura del nombre y que las acciones cierren la tarjeta en las cinco configuraciones) es la única pieza que sigue sin confirmar en navegador — por eso el status de la fase sigue en `human_needed`, no `passed` |

**Score:** 6/6 truths de la fase (CAT-01, CAT-02, CAT-03, CAT-04/05, CAT-11, D-07) verificadas por código + tests, sin regresión de esta ronda. El truth 7 (G-23-20) es la pieza nueva: su lógica de decisión está VERIFIED por código —helpers derivados, gate de exclusión mutua de viewport, fila dinámica— pero la confirmación visual (dónde cae cada fila en el navegador con las cinco combinaciones de datos) no se hizo, ni en la ejecución del plan ni en el review. Por eso el reporte completo sigue en `human_needed`.

### Detalle de la verificación de G-23-20 (lo nuevo de esta ronda)

**Estructura de la grilla (gate por región, re-medido sobre el HEAD actual, no copiado del SUMMARY):**

| Medición | Comando (región del `map` de `visibleServices`) | Resultado | Esperado |
|---|---|---|---|
| Anclas de columna izquierda (instrumento correcto, sin el prefijo roto) | `grep -cE 'sm:col-start-1'` | 6 | 6 |
| Anclas de columna izquierda (instrumento literal del plan, **sabido roto por `cn()`**) | `grep -cE 'className="[^"]*sm:col-start-1'` | 5 | — (IN-05, deuda de instrumento documentada, no de código) |
| Celdas de columna derecha | `grep -cE 'sm:col-start-2'` | 3 | 3 |
| Fila 1 declarada (precio) | `grep -cE 'sm:row-start-1'` | 1 | 1 |
| Fila 2 declarada (duración) | `grep -cE 'sm:row-start-2'` | 1 | 1 |
| Fila 3 fija (acciones) | `grep -cE 'sm:row-start-3'` | 0 | 0 — correcto: tras WR-03 la fila es **dinámica**, no un número fijo |
| Fila dinámica de las acciones | `grep -c 'grid-row-start:var(--actions-row)'` | 1 | 1 |
| Alineados al borde derecho | `grep -cE 'sm:justify-self-end'` | 2 | 2 |
| Bloques sólo-desktop | `grep -cE 'className="hidden [^"]*sm:block'` | 2 | 2 |
| Aperturas del diálogo de edición | `grep -c 'onClick={() => openEditService(s)}'` | 2 | 2 |
| Renglón de descripción (`line-clamp-1` real, no la mención en el comentario) | inspección de línea | 1 | 1 |
| Divisoria de mobile | `grep -c 'border-t border-border/60'` | 1 | 1 |
| Control de cupo | `grep -c 'CapacityInlineControl'` | 1 | 1 |
| `from('services')` fuera de comentarios | `grep -vE '^\s*(//|\*|/\*)' \| grep -c "from('services')"` | 6 | 6 (sin camino de escritura nuevo) |

**La corrección de WR-03 (fila dinámica), confirmada leyendo el código, no el diff del review:** `leftRows = 2 + (capMode !== 'individual' ? 2 : 0) + (activeLocations.length > 0 ? 1 : 0) + (showCoverage ? 1 : 0)`, `actionsRow = Math.max(3, leftRows)`, viaja como variable CSS (`--actions-row`) consumida sólo por `sm:[grid-row-start:var(--actions-row)]`. Verifiqué que el orden de los sumandos coincide exactamente con el orden real de renderizado de los hijos de contenido de la columna izquierda (nombre+descripción siempre = 2; línea de datos + control sólo si `capMode !== 'individual'` = +2; sedes sólo si `activeLocations.length > 0` = +1; cobertura sólo si `showCoverage` = +1) — no hay un hijo condicional que quede sin contar. En mobile la variable CSS queda declarada pero sin consumidor (el layout es `flex`, no `grid`), así que no tiene efecto visual.

**La corrección de WR-04 (comentarios), confirmada:** diff de `cdf0c79` es puramente de comentarios (0 líneas de código); las tres frases que describían el layout viejo (primera fila = nombre+acciones, modo de cupo como tercer dato compartiendo registro con duración/precio, "esta fila se ve igual que siempre") ahora describen el layout real, y el párrafo ORDEN DE FOCO deja escrito que en desktop el orden de foco coincide con el visual porque `actionsRow` fuerza a las acciones a ser la última fila — no un desfase aceptado.

**Gates duros re-corridos de forma independiente (no reusados del SUMMARY):**

| Gate | Resultado |
|---|---|
| `tsc --noEmit` filtrado (`grep -v '^\.next/' \| grep 'error TS'`) | 0 líneas — limpio |
| `eslint` sobre `settings-client.tsx` | 11 errores (piso preexistente, no subió) |
| `npx vitest run --project pure` | 61 archivos, 996 passed, 3 expected fail — piso exacto |
| Migraciones | 41 (sin cambios) |
| `git diff -- package.json package-lock.json` | sin salida (cero paquetes nuevos) |
| Debt markers (`TBD`/`FIXME`/`XXX`) en `settings-client.tsx` | ninguno |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `app/(dashboard)/settings/settings-client.tsx` | Columna derecha de tres celdas en desktop (precio, duración, acciones con fila dinámica); línea de datos como renglón de mobile | ✓ VERIFIED | Confirmado leyendo la región completa: precio `sm:row-start-1`, duración `sm:row-start-2`, acciones con `sm:[grid-row-start:var(--actions-row)]` derivada de `leftRows`/`actionsRow`; línea de datos con `sm:hidden` condicional a `capMode === 'individual'` |
| `.planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UI-SPEC.md` | Entrada G-23-20 en `## Cambios post-UAT` + mención en "Fuera de este contrato" | ✓ VERIFIED | Las cuatro entradas (G-23-6, G-23-6b, G-23-10a, G-23-20) presentes, `## Checker Sign-Off` intacto, la entrada cita G-02, G-04 y el breakpoint 640 |
| `lib/catalog-panel.ts`, `test/catalog-panel.test.ts`, `components/dashboard/categorias-manager.tsx`/`.test.tsx`, `components/booking/service-description.tsx`/`.test.tsx`, `app/[slug]/booking-client.tsx`, `components/landing/services.tsx` | Sin cambios desde la ronda anterior | ✓ VERIFIED (sin regresión) | Fuera del alcance de 23-08; no aparecen en `git show --stat` de los commits `3b500af`/`9a4d16b`/`9041224`/`13629dd`/`cdf0c79` |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| Precio de la columna derecha | Fila 1 de la grilla (misma que el nombre) | `sm:col-start-2 sm:row-start-1 sm:justify-self-end` | ✓ WIRED | Confirmado; el centrado vertical (`sm:items-center`) del contenedor los alinea sin clase extra |
| Duración de la columna derecha | Fila 2, alineada al tope | `sm:col-start-2 sm:row-start-2 sm:justify-self-end sm:self-start` | ✓ WIRED | Confirmado |
| Acciones | Última fila de la columna derecha (no una fija) | variable CSS `--actions-row` + `sm:[grid-row-start:var(--actions-row)]` | ✓ WIRED (corregido en esta ronda) | Antes de `13629dd` apuntaba a `sm:row-start-3` fijo — WR-03; ahora deriva de `leftRows` y nunca deja contenido de la izquierda por debajo |
| Duración/precio del renglón de mobile | Duración/precio del bloque de desktop | una sola derivación (`durationLabel`/`priceLabel`) pintada dos veces con gate excluyente | ✓ WIRED | `toLocaleString` = 1 ocurrencia; cada constante se usa 3 veces (derivación + mobile + desktop) |
| Link "Editar"/"Agregar descripción" y lápiz (G-23-6b) | Diálogo de edición | `onClick={() => openEditService(s)}` ×2 | ✓ WIRED (sin regresión) | Ninguna de las ediciones de 23-08 tocó este bloque |

### Anti-Patrones encontrados

| Archivo | Severidad | Hallazgo | Impacto en must-haves |
|---|---|---|---|
| `categorias-manager.tsx:545-556` (WR-01, ronda anterior) | ⚠️ Warning | Sigue abierto — no forma parte del alcance de 23-08. La rama `'place'` del drop sobre chip sigue usando `target.category_id` en vez del grupo visible | Caso de borde de CAT-02/CAT-03, no bloquea el camino principal |
| `categorias-manager.tsx:453-454, 559-564, 669-687` (WR-02, ronda anterior) | ⚠️ Warning | Sigue abierto — no forma parte del alcance de 23-08. Ventana de carrera de baja probabilidad entre `confirmMove` y un drop en vuelo | No bloquea el camino principal |
| `settings-client.tsx:2755-2758, 2790` (IN-07, nuevo — 23-REVIEW.md pasada incremental) | ℹ️ Info | La columna derecha se dimensiona al max-content del item más ancho (hoy el grupo de acciones); el precio no tiene `max-w`/`truncate` y `normalizeServicePrice` no tiene tope superior, así que un precio absurdo tipeado a mano podría en teoría ensanchar la columna derecha y robarle ancho al nombre — el mismo defecto que costó dos gaps cerrar (G-02) | No bloquea el camino principal con datos reales; deuda a vigilar si se permiten precios de más de 7 dígitos |
| `settings-client.tsx:2769-2770` (IN-08, nuevo) | ℹ️ Info | En desktop el orden de lectura pasa a ser nombre → precio → duración → descripción → Editar; antes los dos datos iban juntos después de la descripción. Autodescriptivo (signo de peso, sufijo "min"), sin duplicación | Cosmético, no bloquea CAT-11 |
| `settings-client.tsx` (IN-05, conocido, documentado en el brief de esta verificación) | ℹ️ Info (deuda de instrumento) | El gate `grep -cE 'className="[^"]*sm:col-start-1'` del plan 23-08 exige el prefijo literal `className="`, incompatible con el `cn()` que la misma acción del plan pide para la línea de datos. Devuelve 5 en vez de 6. Medido con el instrumento correcto (`grep -cE 'sm:col-start-1'` → 6): las seis anclas de columna existen, es el gate el que está roto | No es un gap de código — reportado como deuda del instrumento, no reabre el must-have |
| `settings-client.tsx:2769-2770, 2836-2837, 2846` (IN-06, nuevo) | ℹ️ Info | La exclusión mutua de viewports (que el precio nunca se vea dos veces) depende de que los cinco gates de clase usen el mismo breakpoint (`sm:`), repetido a mano en cinco lugares; ningún gate automatizado verifica que sea el *mismo* breakpoint si alguien cambia uno solo a `md:` | Riesgo latente para cambios futuros en esta región, no un defecto actual |

No se encontraron `TBD`/`FIXME`/`XXX` sin referencia en los archivos tocados por 23-08.

### Requirements Coverage

| Requirement | Source Plan | Descripción | Status | Evidencia |
|---|---|---|---|---|
| CAT-01 | 23-01, 23-03 | Crear/renombrar/borrar categorías; duplicado rechazado por la base | ✓ SATISFIED | Sin cambios en esta ronda; código + tests + UAT (Tests 1, 7, 8) |
| CAT-02 | 23-01, 23-02, 23-03, 23-06 | Asignar una categoría o ninguna, nunca obligatorio | ✓ SATISFIED | Sin cambios en esta ronda; CR-01 y G-23-10a siguen cerrados |
| CAT-03 | 23-01, 23-03, 23-04, 23-06 | Reordenar arrastrando y con ▲/▼, renumerando la lista completa | ✓ SATISFIED | Sin cambios en esta ronda; WR-01/WR-02 son advertencias de borde preexistentes |
| CAT-04 | 23-04 | Elegir los dos modos de orden para todo el negocio | ✓ SATISFIED | Sin cambios en esta ronda |
| CAT-05 | 23-01, 23-04, 23-06 | Controles de reordenar desaparecen fuera de modo personalizado | ✓ SATISFIED | Sin cambios en esta ronda |
| CAT-11 | 23-02, 23-05, 23-07, **23-08** | Descripción corta con tope de 120 y contador, igual a lo que el cliente lee; **más el layout de precio/duración del panel (G-23-20)** | ✓ SATISFIED (código); UAT visual del layout nuevo pendiente | G-23-6/G-23-6b siguen cerrados; G-23-20 cerrado en código con WR-03/WR-04 corregidos — falta la confirmación visual |

Sin requisitos huérfanos: los 6 IDs de la fase están declarados en el frontmatter de al menos un PLAN (incluido 23-08, `requirements: [CAT-11]`) y en `REQUIREMENTS.md`. La tabla de Traceability de `REQUIREMENTS.md` sigue en "Pendiente" para los 6 — estado preexistente, se resuelve en el cierre formal de la fase, no en esta verificación.

### Behavioral Spot-Checks

| Comportamiento | Comando | Resultado | Status |
|---|---|---|---|
| Estructura de la región de la tarjeta (13 mediciones, ver tabla de arriba) | `awk` + `grep -cE` sobre `settings-client.tsx` | Los 13 valores coinciden con lo esperado | ✓ PASS |
| Typecheck filtrado | `./node_modules/.bin/tsc --noEmit \| grep -v '^\.next/' \| grep "error TS"` | Sin salida | ✓ PASS |
| eslint del archivo tocado | `./node_modules/.bin/eslint "settings-client.tsx"` | 11 errores (piso preexistente) | ✓ PASS |
| Suite pura | `npx vitest run --project pure` | 61 archivos, 996 passed, 3 expected fail | ✓ PASS |
| Cero migraciones nuevas | `ls supabase/migrations/*.sql \| wc -l` | 41 | ✓ PASS |
| Cero paquetes nuevos | `git diff -- package.json package-lock.json` | Sin salida | ✓ PASS |
| WR-03 reproducible en código ya NO lo es | lectura directa de `leftRows`/`actionsRow`/`--actions-row` | La fila de las acciones es dinámica y nunca queda por debajo de contenido de la izquierda | ✓ CONFIRMADO (fix real, no cosmético) |
| WR-04 reproducible en código ya NO lo es | lectura directa de los tres comentarios reescritos | Ninguno describe ya el layout viejo | ✓ CONFIRMADO (diff de comentarios puro) |

Suite completa (`npx vitest run`) no se corrió de nuevo en esta ronda: el orquestador ya la corrió sobre este mismo HEAD tres veces (95 archivos / 1301 passed / 4 expected fail / 1 skipped, con una corrida intermitente atribuida al flake conocido del carril `db`). Se corrió sí, de forma independiente, el carril `pure` completo (996/996) como evidencia propia de este verificador, más los gates de región específicos de 23-08.

### Probe Execution

No aplica — la fase no declara probes (`scripts/*/tests/probe-*.sh`) ni el plan 23-08 los menciona.

## Human Verification Required

Dos ítems, ambos originados en el plan 23-08 (nadie abrió un navegador durante su ejecución ni durante la pasada de code review que encontró y corrigió WR-03/WR-04):

### 1. Layout nuevo de la tarjeta de `/servicios` en desktop y su equivalente en mobile (G-23-20)
**Test:** En `/servicios` con el negocio de prueba local, a 375px y en desktop (≥640px): (a) un servicio individual sin sedes/cobertura, (b) un servicio con cupo compartido, (c) un servicio con cupo compartido + sedes + cobertura (la configuración que WR-03 encontró rota antes del fix), (d) un nombre de 40+ caracteres con precio de 7 dígitos, (e) foco por teclado con Tab en las dos vistas y en la pestaña Desactivados.
**Expected:** Mobile idéntico a antes de 23-08 en las 5 configuraciones. Desktop: precio a la altura del nombre, duración debajo más chica, y las tres acciones SIEMPRE debajo de todo el contenido de la izquierda — nunca con el stepper de cupo, las píldoras de sedes o la línea de cobertura colgando por debajo de los botones. El nombre largo sigue truncando en desktop sin perder ancho. El recorrido de Tab es contenido → acciones en las dos vistas.
**Why human:** Dónde cae cada fila de una grilla CSS con contenido de alto variable, superposición visual real y foco por teclado sólo se observan en un navegador — ni la ejecución de 23-08 ni la pasada de code review lo hicieron (los dos SUMMARY/REVIEW lo dejan explícito).

### 2. Lectura de la entrada `G-23-20` del `23-UI-SPEC.md`
**Test:** Leer la entrada nueva de arriba a abajo sin haber visto la UAT del 2026-09-17.
**Expected:** Se puede responder, sin abrir el código, qué ve el dueño en desktop, qué ve en mobile, y por qué no son lo mismo (los dos motivos medidos: G-02 y G-04).
**Why human:** Juicio de legibilidad del contrato, no verificable por grep.

## Gaps Summary

No hay gaps de código en esta ronda. G-23-20 (el único gap que dejó abierto la UAT) está cerrado por el plan 23-08, y los 2 warnings que encontró la pasada incremental de code review sobre ese mismo plan (WR-03, un defecto real que dejaba contenido de la tarjeta por debajo de los botones en configuraciones normales de producción; WR-04, comentarios desactualizados) están corregidos y confirmados leyendo el diff de los commits `13629dd` y `cdf0c79`, no sólo el texto de los reportes.

Los 4 Info nuevos de esta pasada (IN-05..IN-08) y los 2 Warnings sin cerrar de la ronda anterior (WR-01, WR-02, fuera del alcance de 23-08) quedan como deuda documentada, en la misma categoría que ya tenían: ninguno bloquea un must-have de esta fase.

Lo único que falta para un `passed` de punta a punta es la UAT visual del layout nuevo de la tarjeta del panel (G-23-20) y la lectura de su entrada en el contrato — nadie abrió un navegador durante 23-08 ni durante la corrección de su code review. Por eso el status de este reporte es `human_needed`, no `gaps_found`: la lógica de decisión (helpers derivados, gate de exclusión mutua de viewport, fila dinámica de las acciones) está VERIFIED por código y por los gates estructurales re-corridos de forma independiente; lo que falta es exclusivamente la confirmación visual que este repo no tiene manera de automatizar. **Camino recomendado:** correr los dos bloques de Human Verification de arriba (o el checkpoint humano de `/gsd-verify-work`) antes de cerrar la fase.

---

_Verified: 2026-09-18_
_Verifier: Claude (gsd-verifier)_
