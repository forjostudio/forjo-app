---
phase: 21-lo-que-el-negocio-declara
plan: 01
subsystem: onboarding
tags: [supabase, rls, rpc, react, nextjs, agenda, time-block-services, vitest]

# Dependency graph
requires:
  - phase: 18-el-modelo
    provides: la tabla puente `time_block_services` (migr. 071) y `lib/time-block-services.ts` (la regla del comodín)
  - phase: 19-el-panel
    provides: el RPC atómico `save_agenda_blocks` (migr. 074), `lib/agenda-hours-payload.ts` y el editor de chips por franja
  - phase: 20-lo-que-el-publico-ve
    provides: el consumo público del mapeo (booking + landing), que es donde se ve el efecto de lo que el alta declara
provides:
  - "El alta deja declarar qué servicios se dan en cada franja, y esa declaración queda como fila real en `time_block_services`"
  - "La agenda del onboarding se escribe por `save_agenda_blocks`: franjas + mapeo en UNA transacción (el estado 'franjas sí, mapeo no' deja de ser alcanzable)"
  - "`components/agenda/block-services-line.tsx`: el editor de chips por franja, compartido por el panel y el alta (una sola implementación de la regla del comodín)"
  - "`lib/onboarding-agenda.ts`: el traductor puro del estado del wizard al payload del RPC, con la regla de D-10 y el backstop del servicio borrado"
  - "`services.id` generado en el cliente (D-09), verificado contra una base real bajo la sesión del dueño"
affects: [21-02, onboarding, agenda, booking-publico]

actuals:
  tokens: 16430
  tasks: 3
  commits: 3
plan_head_before: a2efd35a85991c2f4c19e026bbc9b7963befa6fc

tech-stack:
  added: []
  patterns:
    - "Editor de chips por franja extraído a componente compartido (panel + alta)"
    - "Traductor puro estado-de-wizard → payload-de-RPC, testeable sin navegador ni DB"
    - "PK generada en el cliente para una fila que se referencia antes de existir"

key-files:
  created:
    - components/agenda/block-services-line.tsx
    - lib/onboarding-agenda.ts
    - test/onboarding-agenda-rpc.test.ts
    - test/onboarding-agenda.test.ts
  modified:
    - app/(onboarding)/onboarding/page.tsx
    - app/(dashboard)/agenda/agenda-client.tsx

key-decisions:
  - "El alta escribe la agenda por `save_agenda_blocks` (migr. 074) en vez de `time_blocks.insert`: franjas y mapeo caen en la misma transacción de PostgREST, y se va con el camino viejo el cupo fijo del bloque (D-12 del milestone) y el `await` que no miraba su error"
  - "El editor de chips se extrae a `components/agenda/block-services-line.tsx` y lo consumen el panel y el alta (D-05): una segunda implementación de la regla del comodín es el modo de falla que AGENDA-02 existe para prevenir"
  - "`services.id` lo genera el cliente en el paso 2 (D-09) y ese mismo uuid viaja en el INSERT: cero correlación por posición con lo que devuelve la base (Pitfall 1). Verificado contra el Supabase local que la policy `business member access` acepta una PK provista por el cliente — cierra la asunción A2 del RESEARCH"
  - "El fallo del insert de servicios degrada la agenda a comodín en vez de mandar ids inexistentes: la FK compuesta `tbs_service_same_tenant` rebotaría con 23503 y, como el RPC es todo-o-nada, se perderían TAMBIÉN los horarios"
  - "El error del RPC avisa con copy honesta y NO corta el redirect: el negocio ya existe y el alta no es re-entrante, así que tirar dejaría al dueño peor"

patterns-established:
  - "Componente de agenda compartido: `components/agenda/block-services-line.tsx` es el único editor de chips del repo; sus dos call sites (panel y alta) consumen el mismo contrato de props"
  - "Módulo puro por write path: la lógica que decide QUÉ se persiste vive fuera del client component (molde de `lib/agenda-hours-payload.ts` y `lib/agenda-occupancy.ts`)"
  - "Prueba de mutación registrada: un test de una regla de persistencia tiene que morir cuando la regla se invierte, o no está probando la regla"

requirements-completed: [AGENDA-08]

coverage:
  - id: D1
    description: "Una franja declarada en el alta (toggle prendido + servicio marcado) termina como fila real en `time_block_services`, apuntando al servicio correcto"
    requirement: AGENDA-08
    verification:
      - kind: integration
        ref: "test/onboarding-agenda-rpc.test.ts#a. el camino entero: lo declarado en el alta queda como fila real en time_block_services"
        status: pass
      - kind: unit
        ref: "test/onboarding-agenda.test.ts#mapea cada franja a SU servicio, no al de al lado (dos servicios, Pitfall 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "La agenda del alta se escribe por `save_agenda_blocks` en una sola transacción; el insert manual de `time_blocks` (y su cupo fijo) desapareció"
    requirement: AGENDA-08
    verification:
      - kind: other
        ref: "grep -cF 'save_agenda_blocks' \"app/(onboarding)/onboarding/page.tsx\" = 3 ; grep -v '^[[:space:]]*//' | grep -c 'timeBlocksToInsert' = 0 ; grep -c 'capacity: 1' = 0"
        status: pass
      - kind: integration
        ref: "test/onboarding-agenda-rpc.test.ts (3/3 contra el Supabase local, RPC invocado con anon + sesión del dueño)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Con el toggle apagado al finalizar, el payload viaja en comodín en TODAS las franjas aunque el estado local tenga mapeo (D-10), y el mapeo sigue vivo en memoria"
    requirement: AGENDA-08
    verification:
      - kind: unit
        ref: "test/onboarding-agenda.test.ts#con el toggle APAGADO todas las franjas viajan en comodín, aunque el estado tenga mapeo (D-10)"
        status: pass
      - kind: integration
        ref: "test/onboarding-agenda-rpc.test.ts#b. toggle APAGADO al finalizar: las franjas se crean y la puente queda vacía (D-10)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Un servicio borrado en el paso 2 no puede hacer rebotar la FK y perder la agenda entera: se purga del estado y, como segunda capa, se filtra del payload"
    requirement: AGENDA-08
    verification:
      - kind: unit
        ref: "test/onboarding-agenda.test.ts#descarta el id de un servicio que ya no está vigente y conserva los que sí (Pitfall 7)"
        status: pass
      - kind: integration
        ref: "test/onboarding-agenda-rpc.test.ts#c. backstop del servicio borrado: un id que ya no está vigente no viaja (Pitfall 7)"
        status: pass
    human_judgment: false
  - id: D5
    description: "`services.id` generado en el cliente es aceptado por la policy de INSERT bajo la sesión del dueño (D-09 / asunción A2)"
    requirement: AGENDA-08
    verification:
      - kind: integration
        ref: "test/onboarding-agenda-rpc.test.ts (beforeAll: insert de 2 servicios con uuid del cliente vía anonA; el test falla ruidosamente si la policy lo rechaza)"
        status: pass
    human_judgment: false
  - id: D6
    description: "El editor de chips existe una sola vez en el repo y el panel no cambia de comportamiento al importarlo en vez de definirlo"
    verification:
      - kind: other
        ref: "grep -cE '^(export )?(function|const|type) ' components/agenda/block-services-line.tsx = 6 (los 6 símbolos medidos) ; grep -c 'function BlockServicesLine' en agenda-client.tsx = 0 ; min-h-11 min-w-11 / role=\"status\" / gap-x-2 gap-y-0 / 'Cualquier servicio'×2 presentes"
        status: pass
      - kind: other
        ref: "./node_modules/.bin/tsc --noEmit exit 0 ; npm test 87/87 archivos, 1098 passed"
        status: pass
    human_judgment: true
    rationale: "Que el panel se VEA igual (layout de los chips, foco, colapso, congelado durante el guardado) no lo asegura ningún test: el repo no renderiza UI (environment 'node'). Los gates de cadena prueban que no se perdió ninguna clase, pero la equivalencia visual la firma un humano."
  - id: D7
    description: "El toggle, la línea de chips y la línea guía del paso Horarios en el alta (D-01/D-02/D-03/D-06): copy, ubicación, y que en canchas no se renderice ninguno"
    verification:
      - kind: other
        ref: "grep -cF 'role=\"switch\"' = 1 ; grep -cE \"vertical (!==|===) 'canchas'\" = 2 (gate de visibleSteps + gate nuevo de D-03) ; grep -cF 'key={service.id}' = 1"
        status: pass
    human_judgment: true
    rationale: "Es UI del wizard: el alta es un client component que el runner no puede renderizar, así que ni la copy del toggle, ni que el chip 'Cualquier servicio' se lea como respuesta y no como olvido, ni el orden visual (chips debajo del error) los puede afirmar un test. Requiere UAT en el navegador."
  - id: D8
    description: "Una hora vaciada se marca en el alta en vez de reventar el cast del RPC con 22007"
    verification:
      - kind: other
        ref: "grep -cF 'isValidBlockTime' \"app/(onboarding)/onboarding/page.tsx\" = 2 (import + uso) ; mensaje de orden conservado verbatim (= 1)"
        status: pass
    human_judgment: true
    rationale: "La rama nueva de `validateHours` no tiene test propio: la función vive dentro del client component. La regla que la respalda (`isValidBlockTime`) sí tiene suite (test/agenda-hours-payload.test.ts), pero que el error se pinte pegado a los inputs correctos se verifica mirando la pantalla."

duration: 17 min
completed: 2026-09-11
status: complete
---

# Phase 21 Plan 01: El alta declara servicios por franja Summary

**El onboarding deja de insertar `time_blocks` a mano y pasa a `save_agenda_blocks`, así que un negocio puede declarar en el alta que los martes de 15 a 16 hace cerámica y esa franja sale con su fila en `time_block_services`, en una sola transacción.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-09-11T23:49:00Z (aprox.)
- **Completed:** 2026-09-12T00:06:57Z
- **Tasks:** 3
- **Files modified:** 6 (4 creados, 2 modificados)

## Accomplishments

- **El write path de la agenda del alta es ahora atómico.** El bloque que armaba a mano las filas de `time_blocks` y las insertaba con un `await` que ni siquiera miraba el error desapareció; en su lugar hay una llamada a `save_agenda_blocks` (migr. 074, ya en producción) cuyo error SÍ se chequea y se avisa con copy honesta. El estado "franjas sí, mapeo no" deja de ser alcanzable, y de paso se fue el cupo fijo del bloque (D-12 del milestone) sin trabajo extra.
- **El editor de chips por franja vive una sola vez en el repo.** Se extrajo de `agenda-client.tsx` a `components/agenda/block-services-line.tsx` y lo consumen el panel y el alta. El cuerpo se movió sin editarlo: los seis símbolos que declaraba el bloque original siguen siendo seis, y el área táctil de 44px, el foco visible, la región viva fuera del flujo del flex y el umbral de colapso viajaron intactos con sus comentarios.
- **El alta pregunta, y sólo cuando tiene sentido.** Toggle `role="switch"` en el paso Horarios (arranca en No, D-02), línea de chips por franja cuando está en Sí, línea guía única cuando todavía no hay servicios, y nada de todo eso en el vertical canchas (D-03: control oculto, no paso oculto).
- **La identidad del servicio es estable desde el paso 2.** Cada fila nace con `crypto.randomUUID()` y ese mismo uuid es el `services.id` insertado: renombrar conserva el mapeo, y no hay ninguna correlación por posición con lo que devuelve la base (Pitfall 1). El test end-to-end prueba contra una base real que la policy de INSERT acepta esa PK — la única asunción de la fase sin precedente in-repo.
- **Dos capas contra el servicio fantasma.** `removeService` purga el id de todos los bloques (UX) y `buildOnboardingAgendaPayload` lo filtra contra el catálogo vigente (backstop). Sin la segunda, la FK compuesta `tbs_service_same_tenant` rebota con 23503 y el RPC —todo-o-nada— se lleva puesta la agenda entera.

## Task Commits

1. **Task 1 (tracer): una franja declarada en el alta llega a `time_block_services`** — `078b022` (feat)
2. **Task 2: suite pura del traductor de payload** — `ef3abb4` (test)
3. **Task 3: validación de horas y limpieza del estado al borrar un servicio** — `d9d6f53` (fix)

**Plan metadata:** ver el commit `docs(21-01)` de este mismo SUMMARY.

## Files Created/Modified

- `components/agenda/block-services-line.tsx` — el editor de chips por franja, compartido. Exporta `BlockServicesLine` y `ServiceCatalogItem`; el chip, el umbral de colapso, el sentinel del borrador y su adaptador quedan privados.
- `lib/onboarding-agenda.ts` — módulo puro que traduce los 7 días del wizard al payload de `save_agenda_blocks`. Delega la forma del payload en `buildSaveHoursPayload` y encierra las dos reglas propias del alta (D-10 y el filtro contra los servicios vigentes).
- `app/(onboarding)/onboarding/page.tsx` — `newServiceId()`, `Service.id`, `HourBlock.service_ids`, `perFranja`/`canMapServices`/`chipCatalog`/`showServicesToggle`, `expandedChips`/`toggleChipsExpanded`/`toggleBlockService`, el render del toggle y de los chips, el submit por RPC, el chequeo de error del insert de servicios, `isValidBlockTime` en `validateHours` y la purga de ids en `removeService`.
- `app/(dashboard)/agenda/agenda-client.tsx` — importa el componente extraído en vez de definirlo. Se fueron las cinco regiones movidas, el import de `Asterisk` y el de `isBlockWildcard` (`servicesOfBlock` sigue en uso). El call site no cambió.
- `test/onboarding-agenda-rpc.test.ts` — 3 casos contra el Supabase local con anon + sesión del dueño: el camino entero con DOS servicios, el toggle apagado y el backstop del servicio borrado.
- `test/onboarding-agenda.test.ts` — 6 casos puros del traductor.

## Decisions Made

Ver `key-decisions` en el frontmatter. Las tres que más mueven la aguja:

1. **El RPC en vez de dos inserts.** Era la decisión estructural del plan y es la que borra la clase de bug entera, no la que la administra.
2. **Extraer el editor en vez de escribir el del alta.** Se aceptó el costo de reversibilidad (dos call sites con estado propio) a cambio de no tener dos interpretaciones de la regla del comodín.
3. **El fallo de los servicios degrada, no aborta.** La alternativa —mandar ids que no existen— no pierde el mapeo: pierde también los horarios, porque el RPC revierte todo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Gate mal medido] El criterio `grep -cF "vertical !== 'canchas'"` ≥ 2 es insatisfacible sin código contrahecho**

- **Found during:** Task 1 (gates de aceptación)
- **Issue:** El criterio cuenta el gate ya existente de `visibleSteps` más el nuevo de D-03 y asume que los dos usan `!==`. El existente (`page.tsx:427`, hoy `:460`) usa `vertical === 'canchas'` — el filtro invierte el sentido a propósito. Para que el conteo literal diera 2 habría que repetir el literal `vertical !== 'canchas'` una segunda vez en vez de usar el booleano nombrado `canMapServices`, que es peor código y además duplicaría la regla que el gate quiere proteger.
- **Fix:** Se implementó un único `const canMapServices = vertical !== 'canchas'` y se consume por nombre en los tres lugares que lo necesitan (el gate del toggle, la línea guía y el payload del submit). El gate se verificó con la forma que mide la intención real: `grep -cE "vertical (!==|===) 'canchas'"` = **2**.
- **Files modified:** `app/(onboarding)/onboarding/page.tsx`
- **Verification:** `grep -cE "vertical (!==|===) 'canchas'" "app/(onboarding)/onboarding/page.tsx"` → 2 (los dos gates por vertical, el de `visibleSteps` y el de D-03).
- **Committed in:** `078b022`

**2. [Rule 3 - Bloqueante menor] El criterio `grep -cF "from '@/lib/onboarding-agenda'"` = 1 fallaba con el import partido en dos líneas**

- **Found during:** Task 2
- **Issue:** La suite arrancó con `import { buildOnboardingAgendaPayload } from ...` + `import type { OnboardingDayDraft } from ...` (el molde de `test/agenda-hours-payload.test.ts`), que da 2 y rompe el criterio exacto.
- **Fix:** Se fusionaron en un solo `import { buildOnboardingAgendaPayload, type OnboardingDayDraft } from '@/lib/onboarding-agenda'` — la misma forma que ya usa `agenda-client.tsx` para el componente extraído.
- **Files modified:** `test/onboarding-agenda.test.ts`
- **Verification:** `grep -cF "from '@/lib/onboarding-agenda'" test/onboarding-agenda.test.ts` → 1; la suite sigue en 6/6.
- **Committed in:** `ef3abb4`

**3. [Rule 3 - Referencia colgada] Una frase del comentario de cabecera del bloque extraído nombraba un símbolo que no viaja con él**

- **Found during:** Task 1 (extracción D-05)
- **Issue:** La regla de la extracción es mover el cuerpo sin editarlo, pero el comentario que encabeza las dos funciones de presentación decía que eran "hermanas de `OccupancyBadge`" y que estaban declaradas "FUERA de `AgendaClient`". `OccupancyBadge` y `AgendaClient` se quedan en el panel, así que en el archivo nuevo esas dos referencias apuntan a la nada.
- **Fix:** Se reformuló ESA sola frase para que diga lo mismo sin nombrar símbolos que no existen en el módulo nuevo ("declaradas a nivel de MÓDULO y no adentro del componente que las usa"). El resto del comentario —y todo el código— viajó verbatim. Se agregó además una cabecera nueva al archivo explicando por qué la extracción existe.
- **Files modified:** `components/agenda/block-services-line.tsx`
- **Verification:** `grep -cE "^(export )?(function|const|type) " components/agenda/block-services-line.tsx` → **6**, el conteo medido de los símbolos que se mueven: el cuerpo no se editó.
- **Committed in:** `078b022`

---

**Total deviations:** 3 auto-fixed (1 gate mal medido, 2 bloqueantes menores).
**Impact on plan:** Ninguno sobre el alcance. Las tres son de forma —cómo se mide o cómo se escribe una línea—, no de comportamiento; ningún criterio de éxito del plan cambió y no hubo scope creep.

## TDD Gate Compliance

El Task 2 declara `tdd="true"`. La secuencia canónica RED→GREEN no aplicó tal cual porque la implementación (`lib/onboarding-agenda.ts`) es un artefacto del Task 1 (tracer), que por diseño llega a producción antes de la suite pura. Lo que el plan puso en su lugar es una **prueba de mutación obligatoria**, que es la garantía que el gate RED existe para dar (que el test muera cuando la regla se rompe):

| Gate | Estado | Evidencia |
|------|--------|-----------|
| RED (sustituido por mutación) | ✓ | Invertir el filtro de D-10 en `buildOnboardingAgendaPayload` (`: []` → `: block.service_ids`) puso **rojo** exactamente el caso de D-10: `Tests 1 failed \| 5 passed (6)`. La mutación se revirtió y `git status --porcelain -- lib/onboarding-agenda.ts` quedó vacío. |
| GREEN | ✓ | `npx vitest run test/onboarding-agenda.test.ts` → 6 passed, commit `ef3abb4` (`test(21-01)`). |
| REFACTOR | — | No hubo cleanup que ameritara commit propio. |

Nota de disciplina: no existe un commit `test(21-01)` PREVIO al `feat(21-01)` del tracer. Es consecuencia de la estructura del plan (tracer primero, suite después), no de un salto de la disciplina; la mutación documentada arriba es lo que prueba que la suite discrimina.

## Issues Encountered

Ninguno. La precondición del Task 1 (Supabase local con migraciones hasta la 076 y las tres credenciales en `.env.test.local`) se verificó antes de tocar código corriendo `test/agenda-save-blocks-rpc.test.ts`, que pasó 9/9 contra la base local — o sea que `save_agenda_blocks` estaba expuesta por PostgREST y la suite no iba a skipear.

## Verificación del plan

| # | Gate | Resultado |
|---|------|-----------|
| 1 | `./node_modules/.bin/tsc --noEmit` | exit **0** |
| 2 | `npm test` completo | **87/87** archivos · **1098 passed \| 4 expected fail \| 1 skipped**. Baseline: 84/85 archivos · 1086 passed (con un worker caído). `git status --porcelain` de `test/agenda-save-blocks-rpc.test.ts` y `test/agenda-hours-payload.test.ts`: vacío — ni una aserción tocada. |
| 3 | `npx vitest run test/onboarding-agenda-rpc.test.ts test/onboarding-agenda.test.ts` | **9 passed**, 0 skipped, contra el Supabase local |
| 4 | `save_agenda_blocks` ≥1 / `timeBlocksToInsert` = 0 | **3** / **0** |
| 5 | `block-services-line` = 1 / `function BlockServicesLine` = 0 en el panel | **1** / **0** |
| 6 | `git status --porcelain -- package.json package-lock.json` | vacío |
| 7 | `ls supabase/migrations \| grep -c "^077"` | **0** — sin migración nueva |
| 8 | Archivos tocados | exactamente los **6** del frontmatter |
| 9 | `npm run lint` | sin errores nuevos. Los 2 errores de `onboarding/page.tsx` (`set-state-in-effect`, `Date.now` en render) y el 1 de `agenda-client.tsx` (`react-hooks/purity`) son preexistentes. El único warning nuevo (`aria-pressed no soportado por role="switch"`) es idéntico al que ya emite el molde in-repo `app/(dashboard)/web/_sections/section-forms.tsx:258`, del que el toggle se copió verbatim. |

## Amenazas del plan — estado

| Threat ID | Estado | Evidencia |
|-----------|--------|-----------|
| T-21-01 (EoP: `p_business_id` forjado) | mitigado | `grep -cF "p_business_id: business.id"` = **1**; el valor sale del `businesses.insert().select().single()` de esta sesión |
| T-21-02 (spoofing de `services.id`) | mitigado + verificado | El insert con uuid del cliente corre bajo la sesión del dueño en `test/onboarding-agenda-rpc.test.ts`; si la policy lo rechazara, el `beforeAll` tira ruidosamente |
| T-21-03 (tampering de `service_ids` cross-tenant) | mitigado | FK compuesta `tbs_service_same_tenant` + filtro contra `liveServiceIds`; caso (c) del test end-to-end |
| T-21-04 (info disclosure del error de Postgres) | mitigado | Sólo `error.code` a consola; las dos frases de la UI son literales del cliente. `grep -cF "error.message"` no creció (0 → 0) |
| T-21-05 (fallo mudo del insert de franjas) | mitigado | El error del RPC se chequea y avisa; el `await` sin chequeo desapareció |
| T-21-06 / T-21-07 | accept (sin cambios) | El alta sigue usando `@/lib/supabase/client` (anon key); el volumen del payload es el mismo que ya acepta el panel |
| T-21-SC (supply chain) | mitigado | Cero paquetes nuevos: `git status --porcelain -- package.json package-lock.json` vacío |

## Known Stubs

Ninguno. No quedaron valores vacíos hardcodeados, placeholders ni componentes sin fuente de datos.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Listo para 21-02.** Los dos símbolos que ese plan agrega (`servicesWithoutCoverage` y `onboardingDraftBlocks` en `lib/onboarding-agenda.ts`) cuelgan del módulo que este plan creó, y el aviso no bloqueante de D-07 se monta al pie del paso Horarios que este plan ya reorganizó.
- **AGENDA-08 sigue en `Pending` a propósito.** El gate de ID compartido (`requirements.ready-ids`) lo bloqueó porque `21-02-PLAN.md` también lo declara y todavía no tiene SUMMARY. Se marcará solo cuando ese plan cierre.
- **Pendiente de UAT visual (D6, D7, D8 del bloque `coverage`).** Tres cosas necesitan navegador y no las puede afirmar ningún test de este repo (`environment: 'node'`): que el panel se vea y se comporte exactamente igual después de la extracción, que el toggle y los chips del paso Horarios se lean bien en mobile, y que el error de hora vacía quede pegado a los inputs que lo causaron.
- **Sin migraciones.** La próxima libre del proyecto sigue siendo la **077**.

## Self-Check: PASSED

- Los 6 archivos de `key-files` existen en disco (`[ -f ]` → FOUND ×6).
- Los 3 commits de tarea existen en `git log` (`078b022`, `ef3abb4`, `d9d6f53`).
- Los 9 gates de `<verification>` del plan se re-corrieron después del último commit y pasaron.
- `commits: 3` es MEDIDO: `git rev-list --count a2efd35..HEAD` = 3.

---
*Phase: 21-lo-que-el-negocio-declara*
*Completed: 2026-09-11*
