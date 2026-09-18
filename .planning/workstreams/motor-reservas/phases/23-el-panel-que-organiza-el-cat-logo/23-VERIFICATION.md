---
phase: 23-el-panel-que-organiza-el-cat-logo
verified: 2026-09-18T18:00:00Z
status: human_needed
score: 7/11 truths verificadas (3 presentes y cableadas, comportamiento sin ejercitar en navegador; 0 gaps de código)
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
covered_digest: "v1:sha256:cccf8d5048073e35a6fe9eb22db059a181af4a666427d73c5240647207070d19"
behavior_unverified: 3
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 6/6
  gaps_closed:
    - "G-23-21 (23-09): a 375px el nombre de 40+ caracteres sin espacios envolvía dos líneas en vez de salirse 36.88px — cerrado con `min-w-0` sumado a `break-words` en el `<p>` del nombre (commit 24087b7), medido en una sonda de Chrome headless con el CSS del build de producción: 307.88px/1 renglón/36.88 afuera → 271px/2 renglones/0 afuera"
    - "G-23-23 (23-09): en desktop el rótulo del modo de cupo y el stepper ocupaban una fila cada uno con un hueco vertical de 82px — cerrado fusionando los dos en un único hijo de grilla (`sm:flex-row`) y gateando el padding táctil de 24px del control a `sm:py-0` (commit 3259e60); la tarjeta con cupo compartido + sedes + cobertura baja de 276.5px a 204.5px"
    - "G-23-22 (23-10): el diálogo Editar servicio parecía cambiar de ancho al elegir cupo compartido — las dos premisas del reporte resultaron falsas al medirlas (el popup mide 384px constantes; las tres columnas del toggle eran iguales). Causa real: sin `scrollbar-gutter:stable` el hueco del scrollbar de Windows angostaba el cuerpo de 384 a 369px mientras header/pie (filas hermanas) seguían en 384. Cerrado reservando el hueco en el caller (commit bba8f94) y apilando el toggle también en desktop por decisión del usuario — opción C (commit 25655ec)"
    - "G-23-25 (reportado post-UAT, 23-10): un click afuera o un Escape accidental descartaba un borrador de servicio/sede/profesional sin avisar — cerrado con `guardDraftOnDismiss` compartida por los tres diálogos de edición (commit f11307c): cancela el cierre y avisa con un toast SÓLO si el motivo es `outside-press`/`escape-key` y el borrador tiene cambios; sin cambios y con la ✕ cierra siempre"
    - "G-23-24 (23-11): la entrada `G-23-20` del `23-UI-SPEC.md` describía la fila de las acciones como fija ('debajo de las dos') y su regla no advertía el defecto que ya había ocurrido (WR-03) — corregida para decir que la fila se DERIVA y la regla ahora nombra WR-03 explícitamente con el corolario operativo (commits 9b7dd6a, 91aa7a1)"
    - "WR-05 (code review pasada 3): ir a 'Individual' y volver a un modo compartido degradaba el cupo (12 → 2) en silencio y ensuciaba el borrador — cerrado con `capacityModePatch`, que conserva el número al ir a individual (commit 691d5da), extraído a `lib/panel-draft.ts` con regresión de test explícita (commit 880d0dc)"
    - "WR-06 (code review pasada 3): `saveEditLocation` era la única de las tres escrituras de edición sin `.eq('business_id', business.id)` — agregado (commit dbee8e9)"
    - "WR-07 (code review pasada 3): en 'Editar sede' con el nombre vacío el botón Guardar no hacía nada y el diálogo se leía trabado — el botón ahora se deshabilita y el early return avisa con un toast (commit 41ee31f)"
    - "WR-08 (code review pasada 3): el único canal del aviso de cierre bloqueado era un toast cuya región aria-live queda marcada `inert` por el modal — se sumó una región `sr-only role=status aria-live=assertive` adentro de cada uno de los tres popups (commit 846a68b)"
    - "WR-09 (code review pasada 3): la lógica pura más riesgosa del cambio (la guarda, las tres huellas) vivía sin exportar en un componente cliente de 4.100 líneas, sin un solo test — extraída a `lib/panel-draft.ts` con `test/panel-draft.test.ts` (24 casos, commit 880d0dc), verificado independientemente en esta verificación (24/24 pass)"
    - "WR-10 (code review pasada 3): comentarios nuevos citaban tres números que no eran los medidos (33px vs 32px, 343px vs 346px, +126px atribuido al bloque equivocado) — corregidos (commit b9d6491)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "G-23-21 + G-23-23 (23-09): a 375px un nombre largo sin espacios envuelve en vez de desbordar, y en desktop el rótulo del modo de cupo + el stepper comparten una línea sin dejar contenido colgando"
    test: "Abrir /servicios con el negocio de prueba local. Mobile 375px: un servicio con nombre de 40+ caracteres sin espacios, con y sin la pill 'Sin cobertura'. Desktop: un servicio con cupo compartido + sedes + cobertura."
    expected: "Mobile: el nombre envuelve dentro de la tarjeta, cero scroll horizontal. Desktop: el rótulo del modo y el stepper del cupo en la misma línea, la tarjeta compactada, y las acciones siguen cerrando la tarjeta sin nada colgando debajo (WR-03 no reabierto)."
    why_human: "La colocación se midió con una sonda de Chrome headless que reconstruye la caja con el CSS del build de producción, no con la app corriendo con datos reales; ni el ejecutor de 23-09 ni el reviewer de la pasada 3 abrieron un navegador (23-09-SUMMARY.md, 'Los siete human-check... quedan pendientes'; 23-REVIEW.md pasada 3, 'No pude renderizarlo' no se declara pero tampoco se confirma en app)."
  - truth: "G-23-22 (23-10): el diálogo Editar servicio no cambia de ancho útil al alternar el modo de cupo, y las tres etiquetas del toggle entran enteras en una línea en las dos vistas"
    test: "Abrir 'Editar servicio' en 1440×900 y alternar Individual / Clase grupal / Recurso simultáneo. Repetir a 375px. Confirmar también el mismo control en la tarjeta de alta."
    expected: "El borde derecho de los campos no se mueve entre los tres modos; las tres etiquetas del toggle se leen completas en una sola línea en las dos vistas; el guardado en cada modo sigue funcionando."
    why_human: "Medido con una sonda propia (iframes de ancho fijo, CSS de producción) que reproduce el diálogo fuera de React; nadie abrió el diálogo real (23-10-SUMMARY.md, 'Los siete human-check del Task 4 son juicio visual... la sonda no ve el render de React')."
  - truth: "G-23-25 (23-10): un diálogo de edición (servicio, sede o profesional) con cambios sin guardar no se descarta por un click afuera o un Escape accidental — avisa con un toast Y con un anuncio de lector de pantalla; sin cambios cierra como siempre; la ✕ cierra siempre"
    test: "En los tres diálogos de edición del panel: (a) tocar un campo, hacer click afuera → debe bloquear y avisar; (b) lo mismo con Escape, confirmando con un lector de pantalla (o el inspector de accesibilidad) que se anuncia el aviso, no sólo el toast visual; (c) sin tocar nada, click afuera/Escape/✕ cierran igual que siempre; (d) los cuatro falsos positivos: normalizar un campo al salir, prender y apagar una sede, ir a Individual y volver (el cupo debe seguir en su valor original, WR-05), un servicio con la categoría borrada; (e) 'Editar sede' con el nombre vacío: Guardar deshabilitado, la ✕ sigue cerrando."
    expected: "Bloqueo y aviso (visual + de lector de pantalla) sólo con cambios reales; cero fricción sin cambios; los cuatro falsos positivos NO marcan el borrador como sucio."
    why_human: "Depende del runtime de React y del manejo de eventos de Base UI (qué `reason` entrega realmente un click afuera o un Escape) y de un lector de pantalla para el anuncio — ninguna sonda ni test unitario lo puede ver. Hay evidencia automatizada parcial: `test/panel-draft.test.ts` (24/24, confirmado de forma independiente en esta verificación) ejercita la lógica pura de la guarda y la regresión de WR-05 con un mock de `cancel()`/`reason`, pero no la integración real con `<Dialog onOpenChange>` ni el anuncio del lector de pantalla."
human_verification:
  - test: "Tarjeta de /servicios: nombre largo en mobile + modo/cupo en una línea en desktop (G-23-21, G-23-23, plan 23-09)"
    expected: "Ver behavior_unverified_items #1. Además: mobile bit-idéntico en el resto de la tarjeta (ritmo de 8px, separaciones de 33px, alto de 346px con la configuración más cargada); foco por teclado sin cambios; el cupo se sigue editando y guardando desde la tarjeta."
    why_human: "Layout responsive con contenido de alto variable + foco por teclado + guardado en vivo — sólo se observan en un navegador real."
  - test: "Diálogo Editar servicio: ancho estable + toggle apilado + guarda de descarte accidental (G-23-22, G-23-25, WR-06/07/08, plan 23-10)"
    expected: "Ver behavior_unverified_items #2 y #3. Además: mobile a 375px sin cambios; 'Editar sede' con nombre vacío avisa y no queda trabado (WR-07); 'Editar profesional' con 'Cancelar' sigue descartando sin aviso (decisión explícita, no un bug); la sonda midió el flip del scrollbar en Windows — confirmar específicamente en esa plataforma, que es la del dueño."
    why_human: "Comportamiento de runtime (React + Base UI + sonner + lector de pantalla) que ninguna sonda estática puede ejercitar; son 21 checks manuales documentados en 23-10-SUMMARY.md."
  - test: "Lectura de la entrada G-23-20 del 23-UI-SPEC.md, ya corregida por G-23-24 (23-11)"
    expected: "Alguien que no vio la UAT puede responder, leyendo sólo la entrada: qué ve el dueño en desktop, qué ve en mobile y por qué no son lo mismo, y además — lo nuevo de esta ronda — que la fila de las acciones se deriva (no es un número fijo) y qué pasa si alguien la vuelve a clavar."
    why_human: "Juicio de legibilidad del contrato, no verificable por grep. La versión ANTERIOR de esta entrada ya se leyó y aprobó en UAT Test 22 ('se entiende'); la versión CORREGIDA por G-23-24 todavía no pasó por esa misma lectura humana, aunque el cambio es acotado (dos bullets y la regla final, confirmado por lectura de esta verificación)."
---

# Phase 23: El panel que organiza el catálogo — Reporte de re-verificación (ronda 4, cierre de la tercera ronda de gaps)

**Phase Goal:** Que el dueño pueda usar lo que la Phase 22 volvió declarable, en la pantalla donde ya administra sus servicios: crea, renombra y borra categorías; asigna una o ninguna a cada servicio (nunca obligatorio); las reordena arrastrando y con ▲/▼; elige los dos modos de orden para todo el negocio; y escribe la descripción corta (CAT-11, tope 120 con contador) que el cliente ve en el booking.
**Verified:** 2026-09-18
**Status:** human_needed
**Re-verification:** Sí — cuarta pasada. La `23-VERIFICATION.md` anterior (2026-09-18, `status: human_needed`, 6/6) cubría el cierre de G-23-20 (plan 23-08) y su code review (WR-03/WR-04). Esta ronda cubre lo que pasó después: la UAT visual de ese cierre (Tests 21-22 de `23-UAT.md`) encontró 4 issues nuevos (G-23-21, G-23-22, G-23-23, G-23-24) más un quinto reportado fuera de la UAT (G-23-25); los tres planes de cierre (23-09, 23-10, 23-11) y una tercera pasada de code review (WR-05..WR-10, las 6 corregidas) son el objeto de esta verificación.

## Qué cambió desde la pasada anterior (resumen ejecutivo)

1. **23-09** cerró G-23-21 (el nombre largo desbordaba en mobile) y G-23-23 (el rótulo del modo de cupo y el stepper no compartían línea en desktop, dejando un hueco de 72px). Medido con una sonda de Chrome headless que reconstruye la tarjeta con el CSS del build de producción.
2. **23-10** cerró G-23-22 (el diálogo de edición "cambiaba de ancho" — en realidad el hueco del scrollbar de Windows angostaba el cuerpo sin mover header/pie) y G-23-25, reportado post-UAT (un click afuera o Escape accidental descartaba un borrador sin avisar).
3. **23-11** cerró G-23-24 (la entrada `G-23-20` del contrato describía una fila fija; ahora describe la fila derivada y su regla nombra el defecto WR-03 que ya había ocurrido). Sólo tocó `23-UI-SPEC.md`, cero código.
4. **La pasada 3 del code review** sobre el diff de 23-09+23-10 encontró 6 warnings — **las 6 corregidas y confirmadas leyendo el diff, no el texto del reporte**: WR-05 (el toggle de cupo perdía el número al ir y volver de Individual), WR-06 (falta de filtro `business_id` en `saveEditLocation`), WR-07 ("Editar sede" con nombre vacío se leía trabado), WR-08 (el aviso de cierre bloqueado vivía en una región marcada `inert` por el modal), WR-09 (la lógica más riesgosa del cambio no tenía un solo test — ahora vive en `lib/panel-draft.ts` con `test/panel-draft.test.ts`, 24 casos), WR-10 (tres números citados en comentarios no eran los medidos).
5. G-23-20 (el gap de la ronda anterior) **quedó confirmado en un navegador real** por el dueño en UAT Test 21 (`confirmed_pass`), incluida la configuración que WR-03 había roto — cierra el único human-check pendiente de la verificación anterior.

Los truths de CAT-01, CAT-02, CAT-03, CAT-04/CAT-05, CAT-11 (core) y el invariante D-07 no tienen código tocado en esta ronda — se re-chequean por regresión abajo y siguen VERIFIED sin cambios (confirmado: `components/dashboard/categorias-manager.tsx`, `app/[slug]/booking-client.tsx`, `components/booking/service-description.tsx` y `lib/catalog-panel.ts` no aparecen en el diff `9bbe98b..HEAD`).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidencia |
|---|---|---|---|
| 1 | CAT-01: crear/renombrar/borrar categorías; duplicado case-insensitive rechazado por la base con copy propia | ✓ VERIFIED | Sin cambios de código en esta ronda; `classifyCategoryWriteError`/`CATEGORY_WRITE_REJECT_COPY` intactos en `lib/catalog-panel.ts`. UAT Tests 1, 7, 8 = pass en navegador real |
| 2 | CAT-02: asignar una categoría o ninguna a cada servicio, nunca obligatorio | ✓ VERIFIED | Sin cambios de código en esta ronda; CR-01 y G-23-10a siguen confirmados por lectura de código. UAT Tests 3, 4, 5, 19 = pass |
| 3 | CAT-03: reordenar categorías arrastrando y con ▲/▼; el orden persiste renumerando la lista completa de hermanas | ✓ VERIFIED | Sin cambios de código en esta ronda; `renumber`/`moveWithinList`/`persistCategoryOrder`/`reorderCategory` intactos. UAT Tests 2, 9 = pass |
| 4 | CAT-04/CAT-05: dos modos de orden por negocio; con modo ≠ personalizado los controles de reordenar desaparecen | ✓ VERIFIED | Sin cambios funcionales en esta ronda. UAT Test 10 = pass (G-23-10b retirado por el usuario: no era un gap) |
| 5 | CAT-11 (core): descripción corta con tope duro de 120 y contador, igual a lo que la tarjeta del booking ya renderiza | ✓ VERIFIED | `ServiceDescription` (booking + web de marca) y el renglón + link de `/servicios` sin cambios en esta ronda; UAT Tests 6, 17, 18, 20 = pass |
| 6 | Invariante D-07 (un único productor `categoryPatch` y un único traductor de `services.category_id`, un solo `update` suelto) | ✓ VERIFIED | Confirmado de nuevo sobre el HEAD actual: `from('services')` sigue en 6 líneas en `settings-client.tsx`, 2 aperturas de diálogo (lápiz + link); ninguno de los commits de 23-09/23-10 agregó un escritor propio de `services` — sólo se sumó el filtro `business_id` a `locations` (WR-06) |
| 7 | G-23-20 (cierre de la ronda anterior): en desktop el precio a la altura del título, la duración abajo, las acciones en la última fila, sin reabrir el desborde de 375px (G-02) ni los toques errados (G-04) | ✓ VERIFIED | **Confirmado en la app real por el dueño**: UAT Test 21, `confirmed_pass` — "G-23-20 quedó confirmado en la app real, incluida la configuración que WR-03 había roto (...): en desktop el precio está a la altura del nombre, la duración debajo en gris, y Desactivar / lápiz / tacho cierran la tarjeta en la última fila". Cierra el human-check pendiente de la verificación anterior |
| 8 | G-23-21 + G-23-23 (23-09, nuevo en esta ronda): a 375px el nombre largo envuelve sin desbordar; en desktop el modo de cupo y el stepper comparten línea sin dejar la tarjeta más alta de lo necesario ni contenido colgando debajo de las acciones | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Código confirmado línea por línea: `min-w-0 break-words sm:truncate` en el `<p>` del nombre (:2909); envoltorio único `flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 sm:col-start-1` con el gate `capMode === 'individual' && 'sm:hidden'` mudado al envoltorio (:2999); `py-6 sm:py-0` en el control (:863); `leftRows` con el sumando de cupo bajado de 2 a 1 (:2854-2858). Medido con sonda de Chrome headless (54/54 mediciones dentro de umbral) pero **nadie abrió la app real** con estos fixes — ver `behavior_unverified_items` |
| 9 | G-23-22 (23-10, nuevo en esta ronda): el diálogo Editar servicio no cambia de ancho útil entre modos de cupo; las tres etiquetas del toggle entran completas en una línea en las dos vistas | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Código confirmado: `[scrollbar-gutter:stable]` en la fila scrolleable (:3313); el radiogroup del modo de cupo pasó de `sm:grid-cols-3` a `grid-cols-1` sin excepción de desktop (:510). Medido con sonda (21/21 gates en verde, 384px de popup constante en 30 casos) pero sin confirmación en navegador real — ver `behavior_unverified_items` |
| 10 | G-23-25 (23-10, nuevo en esta ronda): un click afuera o Escape accidental sobre un borrador con cambios NO cierra el diálogo (servicio, sede o profesional); avisa por toast y por lector de pantalla; sin cambios y con la ✕ cierra siempre | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Código confirmado y **cableado en los tres diálogos**: `guardDraftOnDismiss(isEditSvcDirty/isEditLocDirty/isEditProDirty, close, noticeDismissBlocked)` en `onOpenChange` de los tres `<Dialog>` (:3273, :3743, :4060); la región `sr-only role="status" aria-live="assertive"` (`dismissBlockedNotice`) está montada en los tres popups (:3295, :3748, :4063). **Evidencia automatizada real de la lógica de decisión**: `test/panel-draft.test.ts`, 24/24 casos, corridos de forma independiente en esta verificación, cubre la guarda con motivos mockeados y la regresión de WR-05 (`grupal → individual → grupal` conserva el cupo). Lo que ningún test cubre es la integración real con Base UI (qué `reason` entrega un click afuera real) ni el anuncio efectivo a un lector de pantalla — ver `behavior_unverified_items` |
| 11 | G-23-24 (23-11, nuevo en esta ronda): la entrada `G-23-20` del `23-UI-SPEC.md` describe la fila derivada de las acciones (no una fila fija) y su regla nombra el defecto WR-03 que ya ocurrió | ✓ VERIFIED | Leído el texto completo de la entrada (líneas 889-897 de `23-UI-SPEC.md`): dice explícitamente "La fila de las acciones se DERIVA, no se fija" y "WR-03 ya ocurrió exactamente así", con el corolario operativo. Las 6 entradas de `## Cambios post-UAT` están todas presentes (G-23-6, G-23-6b, G-23-10a, G-23-20, G-23-21+G-23-23, G-23-22) y `## Checker Sign-Off` intacto. Es documentación pura — no hay comportamiento de runtime que un humano deba confirmar además de la lectura |

**Score:** 7/11 truths verificadas por código + tests + evidencia en navegador real (donde existe). 3 truths (8, 9, 10) son NUEVOS de esta ronda, con código presente y cableado y evidencia automatizada parcial (sonda estática o test de lógica pura), pero sin una sola confirmación en la app real corriendo — quedan ⚠️ PRESENT_BEHAVIOR_UNVERIFIED, no VERIFIED. Ninguno FAILED: no hay gaps de código en esta ronda.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `app/(dashboard)/settings/settings-client.tsx` | `min-w-0` en el nombre; envoltorio único modo+cupo con gate mudado; `leftRows` actualizado; scrollbar-gutter reservado; toggle apilado; guarda de descarte cableada en 3 diálogos; filtro `business_id` en `saveEditLocation`; botón de sede deshabilitado con nombre vacío; región sr-only de aviso | ✓ VERIFIED | Cada pieza confirmada por grep/lectura directa (ver evidencia de los truths 8-10 arriba) |
| `lib/panel-draft.ts` (nuevo, WR-09) | Módulo puro con `guardDraftOnDismiss`, las tres huellas, `capacityModePatch`, `locToPayload`/`proToPayload` | ✓ VERIFIED | 210 líneas, existe en disco, importado en `settings-client.tsx` (`from '@/lib/panel-draft'`, línea 50); no importa React ni el DOM (sólo `@/lib/types`, `@/lib/catalog-panel`, `@/lib/onboarding-agenda` y un `import type` de `@base-ui/react/dialog`) |
| `test/panel-draft.test.ts` (nuevo, WR-09) | Tests de la guarda, las tres huellas, `capacityModePatch` y la regresión de WR-05 | ✓ VERIFIED | 246 líneas, 24 casos. **Corrido de forma independiente en esta verificación: 24/24 pass**, incluido el test `REGRESIÓN WR-05: grupal → individual → grupal deja los 12 lugares intactos` |
| `.planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UI-SPEC.md` | 6 entradas en `## Cambios post-UAT`, la de `G-23-20` corregida por G-23-24, 2 entradas nuevas (G-23-21+G-23-23, G-23-22) | ✓ VERIFIED | Confirmado por lectura completa (líneas 866-928); exactamente 6 encabezados `### G-23-` |
| `lib/catalog-panel.ts`, `test/catalog-panel.test.ts`, `components/dashboard/categorias-manager.tsx`/`.test.tsx`, `components/booking/service-description.tsx`/`.test.tsx`, `app/[slug]/booking-client.tsx`, `components/landing/services.tsx` | Sin cambios desde la ronda anterior | ✓ VERIFIED (sin regresión) | `git diff 9bbe98b..HEAD --stat` sobre esos 8 archivos: sin salida |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `<p>` del nombre del servicio | Encoge sin desbordar la tarjeta a 375px | `min-w-0 break-words sm:truncate` | ✓ WIRED | Confirmado en línea 2909; medido por la sonda de 23-09 (271px/0 afuera) |
| Envoltorio de línea de datos + control de cupo | Una sola fila de grilla en desktop, apilado en mobile | `flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 sm:col-start-1` con el gate `sm:hidden` mudado adentro | ✓ WIRED | Confirmado en línea 2999; `leftRows` bajó el sumando de 2 a 1 (línea 2854-2858) en el mismo commit |
| Fila scrolleable del diálogo | Ancho útil estable entre los tres modos de cupo | `[scrollbar-gutter:stable]` en el contenedor con `overflow-y-auto` (caller, no `components/ui/dialog.tsx`) | ✓ WIRED | Confirmado en línea 3313; `components/ui/dialog.tsx` no aparece en el diff `9bbe98b..HEAD` |
| Radiogroup del modo de cupo | Tres etiquetas en una línea, en las dos vistas | `grid-cols-1` sin `sm:grid-cols-3` | ✓ WIRED | Confirmado en línea 510; era `sm:grid-cols-3` antes de 23-10 según 23-UAT.md/23-REVIEW.md |
| `onOpenChange` de los tres `<Dialog>` de edición | `guardDraftOnDismiss` con la huella, el cierre y el aviso de cada formulario | `guardDraftOnDismiss(isEditSvcDirty\|isEditLocDirty\|isEditProDirty, close, noticeDismissBlocked)` | ✓ WIRED | Confirmado en las 3 líneas (3273, 3743, 4060); cada `isEdit*Dirty` compara la huella actual contra su baseline con el mismo normalizador del guardado (líneas 1678, 1920, 2212) |
| Región `sr-only` de aviso | Montada dentro de cada uno de los tres popups | `{dismissBlockedNotice}` | ✓ WIRED | Confirmado en las 3 líneas (3295, 3748, 4063); es el mismo elemento JSX reusado, cada inserción monta su propia instancia |
| `saveEditLocation` | Filtra por tenant además de RLS | `.eq('id', editLoc.id).eq('business_id', business.id)` | ✓ WIRED (corregido en esta ronda, WR-06) | Confirmado en línea 2204; antes sólo tenía `.eq('id', ...)` |
| Botón Guardar de "Editar sede" | Deshabilitado con el nombre vacío | `disabled={savingEditLoc || !editLocForm.name.trim()}` | ✓ WIRED (corregido en esta ronda, WR-07) | Confirmado en línea 3759 |

### Data-Flow Trace (Level 4)

No aplica — esta ronda es exclusivamente layout CSS y manejo de eventos del cliente sobre datos que ya fluían (servicios, sedes, profesionales); ningún camino de lectura/escritura a Supabase se agregó ni se modificó salvo el filtro `business_id` de WR-06, que endurece un `UPDATE` existente sin cambiar su origen de datos.

### Anti-Patrones encontrados

| Archivo | Severidad | Hallazgo | Impacto en must-haves |
|---|---|---|---|
| `categorias-manager.tsx:545-556` (WR-01, rondas anteriores) | ⚠️ Warning | Sigue abierto — fuera del alcance de 23-09/10/11. La rama `'place'` del drop sobre chip sigue usando `target.category_id` en vez del grupo visible | Caso de borde de CAT-02/CAT-03, no bloquea el camino principal |
| `categorias-manager.tsx:453-454, 559-564, 669-687` (WR-02, rondas anteriores) | ⚠️ Warning | Sigue abierto — fuera del alcance de esta ronda. Ventana de carrera de baja probabilidad entre `confirmMove` y un drop en vuelo | No bloquea el camino principal |
| `settings-client.tsx` (WR-05, segunda mitad, DEJADA ABIERTA A PROPÓSITO por el fixer) | ⚠️ Warning | El camino de guardado del diálogo (`saveEditService`) sigue sin el pre-chequeo de bajada de cupo contra inscriptos vivos que sí tiene el stepper de la tarjeta (`saveCapacityInline`/`askCapacityDowngrade`). El fixer no lo aplicó porque el aviso es un `ConfirmDialog` y dispararlo desde el diálogo de edición abierto sería un modal anidado, que CLAUDE.md prohíbe explícitamente. Con el fix de WR-05 aplicado, el camino que originó el hallazgo (ir a "Individual" y volver) ya no llega a esa escritura; lo que queda es el caso preexistente de tipear a mano un cupo menor en el diálogo | No bloquea ningún must-have de la fase; es deuda preexistente, no introducida por esta ronda, documentada con su motivo en `23-REVIEW-FIX.md` |
| `settings-client.tsx` (WR-08, límite aceptado, DEJADO ABIERTO A PROPÓSITO por el fixer) | ℹ️ Info | La región `sr-only` no tiene expiración automática: un `setTimeout` guardado en un `useRef` sumaba 3 errores de eslint (`react-hooks/refs`) sobre un piso inamovible de 11. Consecuencia: dos intentos de cierre bloqueados **consecutivos dentro del mismo diálogo** anuncian una sola vez (el toast sí se repite en cada intento) | Cosmético para un lector de pantalla en un caso de uso poco común (reintentar el cierre dos veces seguidas sin cambiar nada); no bloquea CAT-11 |
| `categorias-manager.tsx:1000` (IN-14, code review pasada 3) | ℹ️ Info | El diálogo "Mover …" del organizador (misma pantalla, mismo tipo de borrador: categoría + posición elegidas) quedó explícitamente fuera de la guarda de G-23-25. Decisión pendiente del usuario, documentada, no aplicada por decisión explícita (fuera de alcance) | No bloquea el camino principal; es una inconsistencia de UX menor entre pantallas del mismo panel |
| `settings-client.tsx:2755-2758, 2769` (IN-07, ronda anterior) | ℹ️ Info | Sigue abierto — la columna derecha se dimensiona al max-content del ítem más ancho; un precio absurdo tipeado a mano podría en teoría robarle ancho al nombre. Sin tope superior real en `normalizeServicePrice` más allá del guard nuevo `MAX_CAPACITY` (que es de cupo, no de precio) | No bloquea con datos reales; deuda a vigilar |
| `settings-client.tsx:2769-2770` (IN-08, ronda anterior) | ℹ️ Info | Orden de lectura en desktop: nombre → precio → duración → descripción → Editar. Cosmético, sin duplicación | No bloquea CAT-11 |

No se encontraron `TBD`/`FIXME`/`XXX` sin referencia en los archivos tocados por 23-09/23-10/23-11.

### Requirements Coverage

| Requirement | Source Plan | Descripción | Status | Evidencia |
|---|---|---|---|---|
| CAT-01 | 23-01, 23-03 | Crear/renombrar/borrar categorías; duplicado rechazado por la base | ✓ SATISFIED | Sin cambios en esta ronda; código + tests + UAT (Tests 1, 7, 8) |
| CAT-02 | 23-01, 23-02, 23-03, 23-06 | Asignar una categoría o ninguna, nunca obligatorio | ✓ SATISFIED | Sin cambios en esta ronda; CR-01 y G-23-10a siguen cerrados |
| CAT-03 | 23-01, 23-03, 23-04, 23-06 | Reordenar arrastrando y con ▲/▼, renumerando la lista completa | ✓ SATISFIED | Sin cambios en esta ronda; WR-01/WR-02 son advertencias de borde preexistentes |
| CAT-04 | 23-04 | Elegir los dos modos de orden para todo el negocio | ✓ SATISFIED | Sin cambios en esta ronda |
| CAT-05 | 23-01, 23-04, 23-06 | Controles de reordenar desaparecen fuera de modo personalizado | ✓ SATISFIED | Sin cambios en esta ronda |
| CAT-11 | 23-02, 23-05, 23-07, 23-08, **23-09, 23-10, 23-11** | Descripción corta con tope de 120 y contador; **más el layout de precio/duración/toggle de cupo del panel y la guarda de descarte accidental de los diálogos de edición** (extensión acumulada de gaps sobre la misma superficie) | ✓ SATISFIED (código); comportamiento de las tres piezas nuevas (G-23-21+23, G-23-22, G-23-25) sin confirmar en navegador | G-23-6/G-23-6b/G-23-20/G-23-24 cerrados y confirmados (código + UAT o lectura directa); G-23-21, G-23-22, G-23-23, G-23-25 cerrados en código y medidos con sonda/test de lógica pura, falta la confirmación visual/interactiva |

Sin requisitos huérfanos: los 6 IDs de la fase están declarados en el frontmatter de al menos un PLAN (incluidos 23-09, 23-10 y 23-11, los tres con `requirements: [CAT-11]`) y en `REQUIREMENTS.md`. La tabla de Traceability de `REQUIREMENTS.md` sigue en "Pendiente" para los 6 — estado preexistente y ya señalado en la verificación anterior, se resuelve en el cierre formal de la fase, no en esta verificación.

### Behavioral Spot-Checks

| Comportamiento | Comando | Resultado | Status |
|---|---|---|---|
| `test/panel-draft.test.ts` completo (guarda, 3 huellas, `capacityModePatch`, regresión WR-05) | `npx vitest run test/panel-draft.test.ts` | 1 archivo, 24 tests, 24 passed | ✓ PASS |
| Typecheck filtrado | `./node_modules/.bin/tsc --noEmit \| grep -v '^\.next/' \| grep "error TS"` | Sin salida | ✓ PASS |
| eslint del archivo tocado | `./node_modules/.bin/eslint "settings-client.tsx"` | 11 errores (piso preexistente, no subió) | ✓ PASS |
| Suite `pure` completa | `npx vitest run --project pure` | 62 archivos, 1020 passed, 3 expected fail | ✓ PASS |
| Cero migraciones nuevas | `ls supabase/migrations/*.sql \| wc -l` | 41 | ✓ PASS |
| Árbol de trabajo limpio (todos los cambios claimados están commiteados) | `git status --porcelain -- app components lib test .planning/.../23-*` | Sin salida | ✓ PASS |
| `min-w-0` en el nombre del servicio | `grep -n "min-w-0 break-words sm:truncate"` | 1 ocurrencia, línea 2909 | ✓ PASS |
| `leftRows` con el sumando de cupo actualizado (1, no 2) | lectura directa líneas 2854-2858 | `2 + (capMode !== 'individual' ? 1 : 0) + ...` | ✓ PASS |
| `scrollbar-gutter:stable` en la fila scrolleable | `grep -n "scrollbar-gutter"` | 1 ocurrencia, línea 3313 | ✓ PASS |
| Toggle de cupo sin `sm:grid-cols-3` | `grep -n "sm:grid-cols-3"` sobre el toggle | 0 (el radiogroup del toggle usa `grid-cols-1` sin excepción de desktop, línea 510) | ✓ PASS |
| `guardDraftOnDismiss` cableada en los tres `<Dialog>` de edición | `grep -n "guardDraftOnDismiss"` | 3 usos + 1 import | ✓ PASS |
| Región `sr-only` de aviso montada en los tres popups | `grep -n "dismissBlockedNotice"` | 1 definición + 3 usos | ✓ PASS |
| `saveEditLocation` filtra por `business_id` | `grep -n "from('locations').update"` | 2/2 llamadas con `.eq('business_id', business.id)` | ✓ PASS |

Suite completa (`npx vitest run`) no se corrió de nuevo en esta verificación: se reusa el número ya medido por el ejecutor sobre este mismo HEAD (96 archivos / 1325 passed / 4 expected fail / 1 skipped) y se corrió, de forma independiente, la suite `pure` completa (1020/1023, 3 expected fail) más `test/panel-draft.test.ts` aislado (24/24) como evidencia propia de este verificador.

### Probe Execution

No aplica — la fase no declara probes (`scripts/*/tests/probe-*.sh`). Las "sondas" de Chrome headless que citan los SUMMARY de 23-09 y 23-10 (`scratchpad/probe-23-09.html`, `scratchpad/probe-lib-23-10.js`) son instrumentos ad-hoc fuera del repo, no probes del proyecto — por decisión explícita de los propios planes no se commitean, así que este verificador no las puede re-ejecutar.

## Human Verification Required

Tres ítems. Dos son nuevos de esta ronda (nadie abrió un navegador durante la ejecución de 23-09/23-10 ni durante la pasada 3 de code review); el tercero es de bajo riesgo, sobre una entrada de documentación ya corregida.

### 1. Tarjeta de `/servicios`: nombre largo en mobile + modo/cupo en una línea en desktop (G-23-21, G-23-23, plan 23-09)

**Test:** En `/servicios` con el negocio de prueba local: (a) mobile 375px, un servicio con nombre de 40+ caracteres sin espacios, con y sin la pill "Sin cobertura"; (b) mobile, cuatro combinaciones de nombre normal (confirmar que el resto de la tarjeta es bit-idéntico a antes de esta ronda); (c) desktop ≥640px, un servicio con cupo compartido + sedes + cobertura; (d) foco por teclado en las dos vistas.
**Expected:** Mobile: el nombre envuelve dentro de la tarjeta sin scroll horizontal; el resto de la tarjeta (ritmo, alto) sin cambios. Desktop: el rótulo del modo y el stepper del cupo comparten una línea, la tarjeta se ve más compacta, y las acciones siguen cerrando la tarjeta al final sin que nada quede colgando debajo (WR-03 no reabierto). El cupo se sigue editando y guardando desde la tarjeta.
**Why human:** La colocación se midió con una sonda que reconstruye la caja con el CSS del build de producción, no con la app React corriendo con datos reales; ningún test automatizado ejercita el render real ni el foco por teclado.

### 2. Diálogo Editar servicio: ancho estable + toggle apilado + guarda de descarte accidental (G-23-22, G-23-25, WR-06/07/08, plan 23-10)

**Test:** Abrir "Editar servicio" en 1440×900 (la plataforma del dueño, Windows, donde el scrollbar clásico materializa el defecto) y alternar los tres modos de cupo; repetir a 375px; confirmar el mismo control en la tarjeta de alta. En los tres diálogos de edición (servicio, sede, profesional): tocar un campo y hacer click afuera / Escape (debe bloquear y avisar, con un lector de pantalla o el inspector de accesibilidad confirmando el anuncio, no sólo el toast visual); sin tocar nada, click afuera/Escape/✕ deben cerrar igual que siempre; los cuatro falsos positivos (normalizar un campo al salir, prender y apagar una sede, ir a Individual y volver — el cupo debe conservar su valor original —, un servicio con categoría borrada) no deben marcar el borrador como sucio. "Editar sede" con el nombre vacío: Guardar debe verse deshabilitado y avisar si se fuerza el click; la ✕ sigue cerrando. "Editar profesional" con "Cancelar": debe seguir descartando sin aviso (decisión explícita documentada, no un bug).
**Expected:** El borde derecho de los campos no se mueve entre modos; las tres etiquetas del toggle se leen completas en una línea; la guarda bloquea sólo con cambios reales y avisa por los dos canales; cero fricción sin cambios.
**Why human:** Depende del runtime de React + Base UI (qué `reason` entrega realmente un evento de cierre) y de un lector de pantalla para el anuncio. Hay evidencia automatizada parcial y real para la lógica de decisión de la guarda (`test/panel-draft.test.ts`, 24/24, confirmado de forma independiente en esta verificación, incluida la regresión de WR-05), pero ningún test ejercita la integración con el `<Dialog>` real ni el anuncio efectivo.

### 3. Lectura de la entrada `G-23-20` del `23-UI-SPEC.md`, corregida por G-23-24

**Test:** Leer la entrada de arriba a abajo sin haber visto la UAT.
**Expected:** Se puede responder, sin abrir el código, qué ve el dueño en desktop, qué ve en mobile y por qué no son lo mismo; y — lo nuevo de esta ronda — que la fila de las acciones se deriva (no es un número fijo) y qué pasa si alguien la vuelve a clavar.
**Why human:** Juicio de legibilidad del contrato, no verificable por grep. La versión anterior de esta entrada ya se leyó y aprobó en UAT Test 22 ("se entiende"); la versión corregida por G-23-24 todavía no pasó por esa misma lectura humana, aunque el cambio es acotado (dos bullets y la regla final).

## Gaps Summary

No hay gaps de código en esta ronda. Los cinco gaps que dejó abierta la UAT de la ronda anterior (G-23-21, G-23-22, G-23-23, G-23-24, y G-23-25 reportado post-UAT) están cerrados por los planes 23-09/23-10/23-11, y las 6 warnings que encontró la pasada 3 de code review sobre ese mismo diff (WR-05..WR-10) están corregidas y confirmadas leyendo el código actual, no el texto de los reportes — incluida una verificación independiente de `test/panel-draft.test.ts` (24/24) que este mismo verificador corrió.

Dos piezas quedan documentadas como deuda aceptada, ninguna bloquea un must-have: la segunda mitad de WR-05 (el pre-chequeo de bajada de cupo en el guardado del diálogo, no aplicado a propósito para no anidar un `ConfirmDialog` sobre un diálogo ya abierto — decisión de CLAUDE.md) y el límite de WR-08 (la región sr-only no expira sola, así que dos cierres bloqueados consecutivos dentro del mismo diálogo anuncian una sola vez).

Lo único que falta para un `passed` de punta a punta es la confirmación en un navegador real de las tres piezas nuevas de esta ronda: la tarjeta compactada (G-23-21 + G-23-23), el diálogo con ancho estable y toggle apilado (G-23-22), y la guarda de descarte accidental en los tres diálogos con su anuncio de lector de pantalla (G-23-25). Ninguna de las tres se abrió en un navegador durante su ejecución ni durante el code review que las corrigió — es exactamente lo que ambos SUMMARY y el REVIEW-FIX declaran por escrito. La lógica de decisión de la guarda de G-23-25 sí tiene evidencia automatizada real (test de función pura con la regresión de WR-05), lo que reduce el riesgo pero no reemplaza la confirmación de la integración real. Por eso el status de este reporte es `human_needed`, no `gaps_found`: no hay código faltante ni artefactos rotos, sólo comportamiento presente y cableado que aún no se ejercitó fuera de una sonda estática o un test de lógica pura. **Camino recomendado:** correr los tres bloques de Human Verification de arriba (o el checkpoint humano de `/gsd-verify-work`) antes de cerrar la fase.

---

_Verified: 2026-09-18_
_Verifier: Claude (gsd-verifier)_
