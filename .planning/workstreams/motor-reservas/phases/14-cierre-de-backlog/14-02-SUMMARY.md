---
phase: 14-cierre-de-backlog
plan: 02
subsystem: dashboard-clientes
tags: [polish, clasificacion-clientes, helper-puro, tdd, copy, botones]
status: complete
requires:
  - "lib/staff-services.ts — molde de helper puro extraído de un client component"
  - "test/staff-services.test.ts — molde de suite unitaria sin DB ni creds"
provides:
  - "lib/client-status.ts — fuente única de la clasificación de clientes (classifyClient + PAUSED_AFTER_DAYS)"
  - "Umbral de pausa unificado en 60 días, compartido por el filtro por tabs y por la sugerencia"
  - "Los 8 labels de clasificación en masculino (D-12)"
  - "Las 3 acciones del panel de Clientes bajo el criterio único D-01"
affects:
  - "app/(dashboard)/clients/clients-client.tsx"
  - "Panel de Clientes: tab 'Nuevos' vs 'Pausa' y el copy de la sugerencia de la ficha"
tech-stack:
  added: []
  patterns:
    - "regla de negocio extraída a lib/ como función pura y consumida por los N sitios que la reimplementaban"
    - "record de copy por key + una sola llamada al clasificador, en vez de una cascada de ifs por consumidor"
    - "w-full sm:w-auto al final de la lista de clases, también dentro de cn(buttonVariants(...), ...)"
key-files:
  created:
    - "lib/client-status.ts"
    - "test/client-status.test.ts"
  modified:
    - "app/(dashboard)/clients/clients-client.tsx"
decisions:
  - "El <a> de Exportar CSV entra en el lote de D-01 aunque no sea un <Button>: usa buttonVariants y es hermano directo del de Importar en el mismo grid — dejarlo estirado partiría el par en dos anchos distintos"
  - "PAUSED_AFTER_DAYS NO se importa en clients-client.tsx: tras delegar en el helper no queda ningún umbral en el componente, así que el import quedaría sin uso (error de lint). El criterio real — cero umbrales literales en el componente — se verificó igual y da 0"
  - "Los 4 objetos de copy de getSuggestion se promovieron a un record de módulo SUGGESTION con sus valores intactos; la función quedó en una línea que solo mapea la key que devuelve classifyClient"
metrics:
  duration: "~25 min"
  completed: 2026-08-04
  tasks: 3
  files: 3
  commits: 4
---

# Phase 14 Plan 02: Clasificación de clientes + POLISH-04 en el panel de Clientes — Summary

La regla que decide si un cliente es nuevo, activo, frecuente o está en pausa pasó a vivir en un
helper puro testeable sin DB (`lib/client-status.ts`), consumido por los **dos** sitios que la
reimplementaban con umbrales distintos, más los 8 labels en masculino y las 3 acciones del header
alineadas al criterio único de ancho.

## Qué se hizo

### Task 1 — `lib/client-status.ts` + su suite unitaria (TDD, D-10 / D-11)

Commits `0e6dadf` (RED) y `dc2b4a4` (GREEN). La suite se escribió **primero** y falló por el módulo
inexistente; recién después se implementó el helper.

`classifyClient({ visits, daysSinceLast })` evalúa el guard de **0 visitas antes** que el chequeo de
días, que es exactamente la corrección de **D-10**: el caller pasa un sentinela de `999` cuando la
persona no tiene ninguna fecha, y ese sentinela hacía que un alta de hoy se leyera como abandono.
`PAUSED_AFTER_DAYS = 60` es el único número de la regla (**D-11**), el mismo con el que
`REQUIREMENTS.md` describe el tab ("Pausa (>2 meses sin venir)").

El helper no importa React, Supabase ni Next, no lee la fecha de alta y su firma son dos números:
no recibe ni retiene identidad, contacto ni `business_id` (**T-14-04 cerrado**).

`test/client-status.test.ts` cubre los 10 casos del contrato del plan más una aserción sobre la
constante — **11 tests, 0 skipped**, sin gates de entorno: corre aunque no haya Supabase local.
Incluye los tres bordes que importan: 60 días exactos **no** es pausa (el corte es estrictamente
mayor), 61 sí, y la pausa le sigue ganando a frecuente.

### Task 2 — Un solo dueño de la regla + los 8 labels en masculino (D-10, D-11, D-12)

Commit `15b51d5`. `clientStats` cambió su cascada de 4 ifs por una llamada al helper; el resto del
`useMemo` (cálculo de `visits`, `lastDate`, `daysSinceLast`, `totalSpend`, la forma del objeto y sus
deps) quedó igual, incluido el sentinela de `999` — ahora es el helper quien lo neutraliza.

`getSuggestion` quedó en una sola línea: los 4 objetos de copy se promovieron a un record de módulo
(`SUGGESTION`) con `label`, `text`, `status`, `color`, `border` y `bg` **intactos**, y la rama la
elige `classifyClient`. Con eso desaparecen de una sola vez las dos discrepancias: el umbral propio
de la sugerencia (**D-11**) y su primer corte por días, que le hacía decir *"hace más de 2 meses que
no viene"* a un cliente con 0 turnos (**D-10**).

Labels (**D-12**): `STATUS_LABEL.new` → `NUEVO`, `.active` → `ACTIVO`; `FILTER_TABS` → `Todos`,
`Activos`, `Nuevos`. `frequent`, `paused`, `STATUS_DOT` (clases de color, no copy) y
`"Todas las obras sociales"` (`:649`, donde el femenino concuerda con el sustantivo) quedaron
**intactos**. El barrido del resto del archivo no encontró otro texto de UI que nombre la
clasificación en femenino.

### Task 3 — POLISH-04 en el panel de Clientes, con el enlace gemelo incluido (D-01)

Commit `c35d985`. `sm:w-auto` al final de la lista de clases en los tres call-sites: el `<Button>` de
Importar CSV, el CTA de Nuevo cliente (que conservó su `gap-1.5`) y el `<a>` de Exportar CSV, cuya
lista vive dentro del `cn(buttonVariants(...), ...)`. El `grid grid-cols-2 gap-2` y la fila propia
del CTA no se tocaron.

## A mirar en la UAT visual (14-07)

**Las 3 acciones del panel lateral angosto de Clientes bajo D-01** (grid de 2 columnas + CTA en fila
propia): a partir de 640px pasan a ancho-por-contenido dentro de celdas de un grid en un panel que
sigue siendo angosto (`lg:w-80`), así que quedan alineadas a la izquierda de su celda. D-01 es LOCKED
y explícitamente sin excepciones por contenedor, así que se aplicó igual y el trade-off queda para
mirar en la UAT, no se inventó una excepción por cuenta propia. Es el mismo trade-off que 14-01
anotó para el panel de Días especiales de Agenda.

**Efecto de D-11 sobre datos reales:** no se midió cuántos clientes cambian de tab. El negocio de
prueba local no tiene historial de turnos con antigüedad suficiente (los clientes con 46-60 días sin
venir son justamente los que se mueven de "Pausa" a "Activos"/"En desarrollo"). Contrastarlo en la
UAT contra el negocio real: es un **cambio de criterio de negocio aceptado en el CONTEXT**, no una
regresión.

## Deviations from Plan

**1. [Rule 3 - Blocking] `PAUSED_AFTER_DAYS` no se importa en `clients-client.tsx`**

- **Found during:** Task 2
- **Issue:** el plan pedía importar `classifyClient` **y** `PAUSED_AFTER_DAYS`. Tras delegar la
  clasificación en el helper, el componente no tiene ningún lugar donde usar la constante (ese es
  justamente el punto de D-11), así que el import quedaría sin uso → error de
  `@typescript-eslint/no-unused-vars` del preset de Next.
- **Fix:** se importa solo `classifyClient`. El criterio de aceptación real —
  `grep -cE 'daysSinceLast > 45|daysSinceLast > 60'` en el componente → **0** — se cumple igual: no
  sobrevive ningún umbral literal.
- **Files modified:** `app/(dashboard)/clients/clients-client.tsx`
- **Commit:** `15b51d5`

Fuera de eso, los 3 tasks se ejecutaron como estaban escritos.

**Nota sobre el comando de verificación:** donde el plan dice `npx tsc --noEmit` se ejecutó
`./node_modules/.bin/tsc --noEmit`. En este repo `npx tsc` baja `tsc@2.0.4` del registro (no es el
compilador) y **siempre sale 0** — falso verde documentado del proyecto. `npx vitest` sí resuelve
bien y se usó tal cual.

## Deferred Issues

Las suites de integración contra el Supabase **local** siguen fallando de forma **no determinista**,
igual que registró 14-01: en dos corridas seguidas de esta sesión dieron conjuntos distintos
(`test/abono-create`, `test/abono-cron`, `test/abono-generation` en una; esas más un timeout de 5s en
`test/concurrency.test.ts` en la otra). Es **pre-existente** y no lo causa este plan: ninguna de esas
suites importa `lib/client-status.ts` ni renderiza `clients-client.tsx`, y el total de tests subió
exactamente +11 respecto del baseline de 863 (los 11 nuevos). Ya está registrado en el
`deferred-items.md` de la fase; queda fuera de alcance.

## Verification

| Chequeo | Resultado |
|---|---|
| `npx vitest run test/client-status.test.ts` | 11 passed, 0 skipped, exit 0 |
| `./node_modules/.bin/tsc --noEmit` | exit 0 (tras cada task) |
| `npx eslint app/(dashboard)/clients/clients-client.tsx` | sin salida (limpio) |
| `npm run build` | completó sin error |
| `npx vitest run` (suite completa) | 874 tests totales = 863 del baseline + 11 nuevos; fallas flaky pre-existentes, ver arriba |
| `git diff --name-only 7438d22 HEAD` | exactamente los 3 archivos de `files_modified`, ninguno más |

Criterios de aceptación por task: 6/6 (Task 1), 9/9 (Task 2), 5/5 (Task 3) — todos con los `grep -c`
exactos que especificaba el plan. Tres de esos greps dieron falso positivo contra **comentarios
propios** (`created_at`, `skipIf`, `daysSinceLast > 60` citados al explicar el porqué); se reescribió
la redacción de los comentarios para que el criterio se cumpla literal sin perder la explicación.

## Threat Model

| Threat ID | Disposición | Estado |
|---|---|---|
| T-14-04 (Information Disclosure, `lib/client-status.ts`) | mitigate | **Cerrado**: 0 imports de Supabase/React/Next, 0 menciones de la fecha de alta, firma = dos números |
| T-14-05 (Tampering, clasificación en el cliente) | accept | Sin cambio: sigue siendo presentación derivada de datos que el dueño ya ve de su propio negocio; no gatea ninguna acción ni permiso |
| T-14-06 (Repudiation, umbral unificado) | accept | Registrado arriba para que la UAT lo contraste contra datos reales |

Sin flags de amenaza nuevos: el plan no agrega endpoints, queries, columnas al payload RSC ni
permisos.

## Known Stubs

Ninguno.

## Commits

| Task | Commit | Descripción |
|---|---|---|
| 1 (RED) | `0e6dadf` | suite pura de clasificación de clientes (D-10, D-11) |
| 1 (GREEN) | `dc2b4a4` | helper puro de clasificación con umbral único |
| 2 | `15b51d5` | unificar la clasificación y pasar los labels a masculino |
| 3 | `c35d985` | alinear a D-01 las 3 acciones del panel de Clientes |

## Self-Check: PASSED

Los 3 archivos existen en disco (2 creados, 1 modificado) y los 4 commits existen en el historial.
