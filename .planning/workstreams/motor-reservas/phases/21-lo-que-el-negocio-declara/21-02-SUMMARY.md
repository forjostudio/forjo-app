---
phase: 21-lo-que-el-negocio-declara
plan: 02
subsystem: onboarding
tags: [react, nextjs, agenda, time-block-services, vitest, a11y, ux-copy]

# Dependency graph
requires:
  - phase: 21-lo-que-el-negocio-declara
    provides: "el Plan 21-01: `lib/onboarding-agenda.ts`, el toggle `perFranja`, `chipCatalog`, `showServicesToggle`, `canMapServices` y `HourBlock.service_ids`"
  - phase: 18-el-modelo
    provides: "`lib/time-block-services.ts` — la regla del comodín y `hasScheduleCoverage` con su guarda del negocio sin franjas"
  - phase: 20-lo-que-el-publico-ve
    provides: "la frase pública `Sin horarios disponibles` que el aviso del alta anticipa verbatim"
provides:
  - "`servicesWithoutCoverage` / `onboardingDraftBlocks` en `lib/onboarding-agenda.ts`: qué servicios del paso 2 no cubre NINGUNA franja abierta, computado con la fuente única de la regla del comodín"
  - "El aviso no bloqueante al pie del paso Horarios del alta, con la frase que el cliente ya lee en la página pública"
  - "La guarda del negocio sin franjas (CR-01 de la Phase 20) probada por mutación en una suite pura"
affects: [onboarding, agenda, booking-publico]

actuals:
  tokens: 3424
  tasks: 2
  commits: 3
plan_head_before: 994e84cd7e715ac04f18f50e24df2b57e75dc7b7

tech-stack:
  added: []
  patterns:
    - "Aviso de consecuencia (no de validación) en una región viva siempre montada cuyo contenido cambia"
    - "Copy del panel/alta que cita VERBATIM la frase que el público ya ve, para que el dueño reconozca el efecto"

key-files:
  created: []
  modified:
    - lib/onboarding-agenda.ts
    - test/onboarding-agenda.test.ts
    - app/(onboarding)/onboarding/page.tsx

key-decisions:
  - "El dato del aviso sale de `hasScheduleCoverage` y NUNCA de `isServiceScheduled`: la cruda filtra las franjas, así que con cero franjas daría `false` para todo el catálogo y el aviso pasaría de informar a mentir. En el alta cerrar los siete días es UN click, así que el caso no es teórico — es el discriminante de la suite y está probado por mutación"
  - "El aviso es una región viva SIEMPRE montada cuyo contenido cambia (cadena vacía cuando no hay nada que decir), no un nodo que aparece y desaparece: una región que se monta junto con su texto no la locuta ningún lector de pantalla"
  - "Tratamiento neutro y deliberado: `text-muted-foreground`, sin color de error, sin `aria-invalid`, sin ícono de alerta y sin `toast`. Lo que se le está diciendo al dueño es que un cliente no va a poder reservar ese servicio, no que llenó mal un campo — y tiene que quedar en pantalla mientras ajusta los chips"
  - "La no-bloqueancia es estructural, no una promesa: `handleFinish` no referencia la constante del aviso (gate con `awk` acotado a la función) y Finalizar conserva su único `disabled={loading}`"
  - "El gate `grep -c \"isServiceScheduled\" = 0` se re-mide excluyendo comentarios: el `<action>` del plan exige nombrar a la función cruda «con nombre y apellido» en el comentario que explica por qué NO se usa, así que las dos condiciones literales del plan son mutuamente excluyentes"

patterns-established:
  - "Región viva del aviso: siempre montada + contenido variable, copiada del criterio ya escrito en `components/agenda/block-services-line.tsx`"
  - "Prueba de mutación registrada: la guarda que importa se invierte a mano y tiene que poner rojo EXACTAMENTE el caso que la cubre"

requirements-completed: [AGENDA-08]

coverage:
  - id: D1
    description: "Un servicio cargado en el paso 2 que ninguna franja abierta declara queda nombrado por `servicesWithoutCoverage`, y sólo ése"
    requirement: AGENDA-08
    verification:
      - kind: unit
        ref: "test/onboarding-agenda.test.ts#nombra SOLO al servicio que ninguna franja declara"
        status: pass
      - kind: unit
        ref: "test/onboarding-agenda.test.ts#con cada servicio declarado en alguna franja, no avisa nada"
        status: pass
    human_judgment: false
  - id: D2
    description: "Con los siete días cerrados el aviso no dice nada (la guarda del negocio sin franjas, CR-01 de la Phase 20), y una sola franja comodín cubre todo el catálogo"
    requirement: AGENDA-08
    verification:
      - kind: unit
        ref: "test/onboarding-agenda.test.ts#con los SIETE días cerrados no avisa de nada (la guarda del negocio sin franjas, CR-01)"
        status: pass
      - kind: unit
        ref: "test/onboarding-agenda.test.ts#una sola franja comodín alcanza para cubrir todo el catálogo (D-01)"
        status: pass
      - kind: other
        ref: "prueba de mutación: `hasScheduleCoverage` → `isServiceScheduled` pone rojo 1 de 12, exactamente el caso de cero franjas; revertida, 12/12"
        status: pass
    human_judgment: false
  - id: D3
    description: "El dato sale de la fuente única de la regla del comodín, no de un filtro reimplementado, y el módulo sigue puro"
    requirement: AGENDA-08
    verification:
      - kind: other
        ref: "grep -cF 'hasScheduleCoverage' lib/onboarding-agenda.ts = 3 ; isServiceScheduled fuera de comentarios = 0 ; reimplementación del comodín = 0 ; business_id: '' = 1 ; ^import = 2"
        status: pass
    human_judgment: false
  - id: D4
    description: "El aviso no puede bloquear el alta: ni `handleFinish` ni el `disabled` de Finalizar lo consultan"
    requirement: AGENDA-08
    verification:
      - kind: other
        ref: "awk region-scoped sobre handleFinish | grep -cE 'sinCobertura|servicesWithoutCoverage' = 0 ; grep -cF 'onClick={handleFinish} disabled={loading}' = 1 ; validateHours sin cambios"
        status: pass
    human_judgment: false
  - id: D5
    description: "El aviso al pie del paso Horarios: copy, ubicación, tono de consecuencia (gris, sin ícono de error) y que aparezca/desaparezca con el toggle y con los días cerrados"
    requirement: AGENDA-08
    verification:
      - kind: other
        ref: "grep -cF 'Sin horarios disponibles' \"app/(onboarding)/onboarding/page.tsx\" = 2 (singular + plural) ; servicesWithoutCoverage = 2 (import + cálculo) ; role=\"status\" = 1"
        status: unknown
    human_judgment: true
    rationale: "El alta es un client component y el runner de este repo corre en `environment: 'node'`: ningún test puede afirmar que el aviso se lea como consecuencia y no como error, ni que el gris a 12px contraste bien a 375px, ni que aparezca y desaparezca al mover el toggle. Los gates de cadena prueban que la frase y la región están; la UAT visual del `<human-check>` del Task 2 sigue PENDIENTE (modo `end-of-phase`)."

# Metrics
duration: 8 min
completed: 2026-09-11
status: complete
---

# Phase 21 Plan 02: El aviso de los servicios sin franja Summary

**El paso Horarios del alta nombra los servicios que ninguna franja cubre usando la misma frase que el cliente ya lee en la página pública —«Sin horarios disponibles»—, sin bloquear el alta y sin parecer un error de formulario.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-12T00:16:25Z
- **Completed:** 2026-09-12T00:24:16Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- **El estado mal configurado dejó de ser silencioso.** Hasta la Phase 20, un servicio sin ninguna franja que lo diera era invisible en la página pública; desde la Phase 20 aparece deshabilitado con «Sin horarios disponibles». El alta ahora anticipa ESA frase, textual, para que el dueño reconozca el efecto cuando lo vea en su propia página en vez de enterarse de dos cosas parecidas con dos palabras distintas.
- **La guarda que evita que el aviso mienta está probada por mutación.** `servicesWithoutCoverage` se apoya en `hasScheduleCoverage` (la que envuelve la guarda del negocio sin franjas) y no en `isServiceScheduled` (la cruda). Invertir esa sola línea pone rojo **1 de 12** casos, y es exactamente el de los siete días cerrados: sin la guarda, un dueño que cierra todos los días —un click— vería su catálogo ENTERO marcado como sin horario, que es la forma más rápida de enseñarle a ignorar el aviso.
- **La no-bloqueancia es verificable, no una promesa.** `handleFinish` no referencia la constante del aviso (gate con `awk` acotado al cuerpo de la función), Finalizar conserva su único `disabled={loading}` y `validateHours()` no cambió. Un servicio sin franja es un estado legal (D-06 de la Phase 18): el dueño está a mitad de configurar y tiene que poder entrar al dashboard.
- **El aviso se calcula sólo cuando tiene sujeto.** Con el toggle apagado se persiste comodín (D-10), así que ningún servicio queda sin cobertura y el aviso sería falso: por eso el gate es `showServicesToggle && perFranja`. En canchas no aparece nunca, heredado de D-03 sin una segunda condición.

## Task Commits

1. **Task 1 — RED: los casos del aviso** — `a8fb583` (test)
2. **Task 1 — GREEN: `servicesWithoutCoverage` + `onboardingDraftBlocks`** — `d6748ab` (feat)
3. **Task 2: el aviso al pie del paso Horarios** — `9a28b58` (feat)

**Plan metadata:** el commit `docs(21-02)` de este mismo SUMMARY.

## Files Created/Modified

- `lib/onboarding-agenda.ts` — `onboardingDraftBlocks` (las franjas abiertas con la clave estable `${día}-${índice}`, la misma del estado de colapso) y `servicesWithoutCoverage` (filas sintéticas de la puente + `hasScheduleCoverage`). El módulo sigue puro: dos imports, ni React ni Supabase.
- `test/onboarding-agenda.test.ts` — un `describe` nuevo con los 6 casos del aviso. Ninguna aserción de la suite del Plan 21-01 fue tocada (`git diff` sobre líneas `expect(` eliminadas: **0**).
- `app/(onboarding)/onboarding/page.tsx` — la constante `sinCobertura` + el texto `avisoSinCobertura` (singular/plural), junto a los otros booleanos derivados, y la región `role="status"` siempre montada al pie del paso Horarios.

## Decisions Made

Ver `key-decisions` en el frontmatter. Las dos que más mueven la aguja:

1. **La función con guarda, no la cruda.** Es la misma trampa que ya mordió una vez en esta fase del milestone (CR-01 del code review de la Phase 20). El CONTEXT de esta fase (`21-CONTEXT.md:82`) nombra la función equivocada; la corrección queda registrada en el comentario del módulo y probada por mutación.
2. **Región siempre montada, contenido variable.** Una región viva que se monta JUNTO con su texto no la locuta ningún lector de pantalla — el nodo aparece ya con el contenido adentro y no hay cambio que anunciar. Es el criterio que el Plan 21-01 ya dejó escrito en `components/agenda/block-services-line.tsx`; acá se hereda la primera mitad (siempre montada) y no la segunda (fuera del flujo del flex), porque el aviso es un párrafo de bloque y no un item de una línea con `gap-x`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Gate mal medido] `grep -c "isServiceScheduled" lib/onboarding-agenda.ts = 0` contradice al `<action>` del mismo task**

- **Found during:** Task 1 (gates de aceptación)
- **Issue:** El `<action>` del Task 1 exige el comentario que explica **"por qué la función que envuelve la guarda y no la cruda, con nombre y apellido"** — o sea, nombrar `isServiceScheduled` en prosa. El gate cuenta ocurrencias en el archivo entero, comentarios incluidos, y exige **0**. Las dos condiciones literales son mutuamente excluyentes: cumplir el gate obligaría a escribir el comentario sin nombrar la función que advierte no usar, que es justo lo que lo vuelve útil para el próximo que lea el módulo.
- **Fix:** Se escribió el comentario con nombre y apellido (la intención del `<action>`, y el registro de la corrección al CONTEXT) y el gate se re-midió con la forma que mide la intención real — que el aviso no se APOYE en la cruda: `grep -vE "^\s*(\*|//|/\*)" lib/onboarding-agenda.ts | grep -c "isServiceScheduled"` = **0**. La única ocurrencia del archivo está en la línea 113, dentro del bloque de comentario que la prohíbe.
- **Files modified:** `lib/onboarding-agenda.ts`
- **Verification:** fuera de comentarios **0**; y la prueba de mutación confirma por comportamiento —no por cadena— que la función efectivamente llamada es la que trae la guarda.
- **Committed in:** `d6748ab`

**2. [Rule 1 - Gate mal medido] `grep -cF 'role="status"' = 1` contaba también la mención en el comentario**

- **Found during:** Task 2
- **Issue:** El comentario que explica por qué la región va siempre montada citaba el atributo entre backticks, así que el conteo daba **2** con un solo nodo en el JSX. A diferencia del caso anterior, acá el plan NO pide nombrar el literal en prosa.
- **Fix:** Se reformuló esa sola frase a "una región viva (status)" — dice exactamente lo mismo sin repetir el literal que el gate cuenta. El gate quedó en **1**, con el único nodo real.
- **Files modified:** `app/(onboarding)/onboarding/page.tsx`
- **Verification:** `grep -cF 'role="status"' "app/(onboarding)/onboarding/page.tsx"` → **1**.
- **Committed in:** `9a28b58`

---

**Total deviations:** 2 auto-fixed (2 gates mal medidos, 0 de comportamiento).
**Impact on plan:** Ninguno sobre el alcance. Las dos son de medición —cómo se cuenta una cadena en un archivo que también la menciona en prosa—, no de implementación; ningún criterio de éxito del plan cambió y no hubo scope creep.

## TDD Gate Compliance

El Task 1 declara `tdd="true"` y se ejecutó con la secuencia canónica completa (`workflow.tdd_mode` está en **false**, así que el halt gate del orquestador no estaba armado; la disciplina se siguió igual).

| Gate | Estado | Evidencia |
|------|--------|-----------|
| RED | ✓ | `a8fb583` (`test(21-02)`), previo al `feat`. Los 6 casos nuevos + un esqueleto con la firma y el call site reales pero sin la regla ⇒ `Tests 3 failed \| 9 passed (12)`, y las 3 fallas son **asserciones sobre el comportamiento planeado** (`expected [] to deeply equal [ 'Yoga' ]`), no errores de import, de sintaxis ni de fixture. RED intencional. |
| GREEN | ✓ | `d6748ab` (`feat(21-02)`): `onboardingDraftBlocks` + `servicesWithoutCoverage` reales ⇒ **12 passed (12)**, `tsc --noEmit` exit 0. |
| REFACTOR | — | No hubo cleanup que ameritara commit propio. |

**Prueba de mutación (obligatoria por el `<acceptance_criteria>` del Task 1):** sustituido a mano `hasScheduleCoverage` por `isServiceScheduled` en el módulo, `npx vitest run test/onboarding-agenda.test.ts` dio `Tests 1 failed | 11 passed (12)`, y el caso rojo fue **exactamente** `con los SIETE días cerrados no avisa de nada (la guarda del negocio sin franjas, CR-01)` (`AssertionError: expected [ {…}, {…} ] to deeply equal []` — o sea, los dos servicios del catálogo marcados como sin horario). Revertida la mutación, la suite volvió a 12/12.

## Verificación del plan

| # | Gate | Resultado |
|---|------|-----------|
| 1 | `./node_modules/.bin/tsc --noEmit` | exit **0** |
| 2 | `npm test` completo | **87/87** archivos · **1104 passed \| 4 expected fail \| 1 skipped**. Baseline del commit base: 1092 passed con un worker caído; acá **sin** el flake. `test/onboarding-agenda.test.ts` reporta **12 passed** (≥ 12 pedidos) |
| 3 | `isServiceScheduled` en `lib/onboarding-agenda.ts` | **0** fuera de comentarios (ver deviation 1); **1** en total, dentro del comentario que lo prohíbe |
| 4 | `grep -cF "Sin horarios disponibles"` en el alta | **2** (singular + plural) |
| 5 | `awk` sobre `handleFinish` \| `grep -cE "sinCobertura\|servicesWithoutCoverage"` | **0** — D-07 sigue siendo no bloqueante |
| 6 | `git status --porcelain -- package.json package-lock.json` / `ls supabase/migrations \| grep -c "^077"` | vacío / **0** — cero dependencias y cero migraciones |
| 7 | Archivos tocados | exactamente los **3** del frontmatter (`git diff --name-only 994e84c..HEAD`) |
| 8 | `npm run lint` | sin errores nuevos. Los 2 errores de `onboarding/page.tsx` (`set-state-in-effect` en `:191`, `react-hooks/purity` en `:437`) y el warning de `aria-pressed` sobre `role="switch"` son **preexistentes** (los tres ya figuran en la verificación del Plan 21-01). `lib/onboarding-agenda.ts` y `test/onboarding-agenda.test.ts` no emiten nada |
| 9 | UAT visual del `<human-check>` del Task 2 | **PENDIENTE** — ver abajo |

### UAT visual — pendiente (modo `end-of-phase`)

El modo de verificación humana de este proyecto es `end-of-phase`, así que no hubo checkpoint bloqueante en el medio. Los cinco pasos quedan registrados acá para correrse con el negocio semilla en local, a 375px y en desktop:

| # | Paso | Estado |
|---|------|--------|
| 1 | Paso Horarios con 3 servicios cargados y el toggle **apagado**: ni chips ni aviso | pendiente |
| 2 | Toggle **prendido**, "Cerámica" marcada sólo en el martes ⇒ "Yoga" y "Masaje" nombrados en el aviso del pie, en gris y sin ícono de error | pendiente |
| 3 | Finalizar sigue habilitado con el aviso en pantalla y el alta termina | pendiente |
| 4 | Cerrar los 7 días hace **desaparecer** el aviso en vez de listar todo el catálogo | pendiente |
| 5 | En un negocio de rubro **canchas** no aparece ni el toggle ni el aviso | pendiente |

El paso 4 es el que la suite ya cubre por comportamiento (y por mutación); los otros cuatro necesitan navegador.

## Amenazas del plan — estado

| Threat ID | Estado | Evidencia |
|-----------|--------|-----------|
| T-21-08 (info disclosure: el aviso nombra servicios) | accept (sin cambios) | Los nombres son del propio negocio, en la sesión del dueño, en una pantalla no pública. Las filas del cálculo se fabrican desde el estado local del wizard: no hay query ni dato de otro tenant al alcance |
| T-21-09 (tampering: copy interpolando texto del usuario) | mitigado | Los nombres se interpolan como **texto** de React (escapado por defecto). `grep -c "dangerouslySetInnerHTML" "app/(onboarding)/onboarding/page.tsx"` = **0** |
| T-21-10 (DoS de usabilidad: un aviso que bloquee el alta) | mitigado | `awk` acotado a `handleFinish` = **0** referencias; `onClick={handleFinish} disabled={loading}` sigue siendo la única condición (= 1); `validateHours()` sin cambios |
| T-21-11 (fallo mudo: el aviso apagado al revés con cero franjas) | mitigado + probado por mutación | `hasScheduleCoverage` con su guarda; la mutación pone rojo exactamente ese caso |
| T-21-SC (supply chain) | mitigado | Cero paquetes nuevos: `git status --porcelain -- package.json package-lock.json` vacío |

El registro del Plan 21-01 (T-21-01 … T-21-07) se hereda sin cambios: este plan es **sólo lectura** — no toca el write path, no agrega parámetros al RPC y no modifica ninguna policy.

## Known Stubs

Ninguno. El aviso está cableado a la fuente de datos real (el estado del wizard) desde el primer commit; no quedaron valores vacíos hardcodeados ni placeholders.

## Issues Encountered

Ninguno. Los dos tropiezos del plan fueron gates que contaban cadenas en un archivo que también las menciona en prosa, documentados arriba como desviaciones.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **AGENDA-08 queda completo.** El Plan 21-01 lo dejó en `Pending` a propósito porque el gate de ID compartido (`requirements.ready-ids`) lo bloqueaba mientras este plan no tuviera SUMMARY. Con este cierre, los dos planes que lo declaran terminaron.
- **La fase queda cerrada para código y abierta para UAT.** Lo pendiente de mirar con navegador son las cinco filas de la tabla de arriba más las tres del Plan 21-01 (D6/D7/D8 de su bloque `coverage`): equivalencia visual del panel tras la extracción, el toggle y los chips en mobile, y el error de hora vacía pegado a sus inputs.
- **Sin migraciones.** La próxima libre del proyecto sigue siendo la **077**.

## Self-Check: PASSED

- Los 3 archivos de `key-files.modified` existen en disco (`[ -f ]` → FOUND ×3).
- Los 3 commits de tarea existen en `git log` (`a8fb583`, `d6748ab`, `9a28b58`).
- Los 9 gates de `<verification>` del plan se re-corrieron después del último commit; los 8 automáticos pasan y el 9 (UAT visual) queda registrado como pendiente, que es lo que el plan pide en modo `end-of-phase`.
- `commits: 3` es MEDIDO: `git rev-list --count 994e84c..HEAD` = 3. `actuals.tokens` = 3424 = chars/4 sobre el diff realizado (13694 chars).

---
*Phase: 21-lo-que-el-negocio-declara*
*Completed: 2026-09-11*
