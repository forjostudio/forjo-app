---
phase: 17-superficie-y-polish
plan: 05
subsystem: agenda
tags: [react, typescript, tailwind, mobile, a11y, capacity, ssr-verification]

# Dependency graph
requires:
  - phase: 17-superficie-y-polish
    plan: "04"
    provides: "`lib/agenda-occupancy.ts` — buildDayEntries / computeOverlapFull / capacityOf / occupiesSeat, puros y con 20 casos en verde"
  - phase: 15-cupo-unificado
    provides: "`services.capacity` + `services.capacity_mode` como fuente única del cupo (migr. 068)"
provides:
  - "`entriesByDate`: la columna del día consume `buildDayEntries` — el cupo sale de `services.capacity`, la misma fuente que el motor"
  - "`OccupancyBadge`: un solo componente de ocupación, consumido por el grupal Y por el simultáneo"
  - "La línea de grupo colapsada: una fila por slot, contador siempre visible, un solo clickeable"
  - "`rosterSlot` con `serviceId`: el roster filtra por servicio y lee la MISMA entrada de grupo que se renderizó"
affects: [agenda-grilla, roster, uat-fase-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Un solo `Date.now()` por pantalla, leído dentro del memo que devuelve los DOS cálculos: dos partes de la misma vista no pueden discrepar sobre si un hold venció"
    - "El diálogo de detalle no recalcula: recupera por identidad el mismo objeto que pintó la fila, así la divergencia de números es estructuralmente imposible"
    - "Verificación por SSR autenticado: cookie de `@supabase/ssr` armada a mano (`base64-` + base64url del session JSON, storageKey `sb-<primer-label-del-host>-auth-token`) + `curl` al dev server ⇒ se puede medir el HTML real con datos reales sin navegador"
    - "Badge de un solo color con dos segmentos ordenados (cupo, después plata) en vez de dos badges: el aviso no se duplica ni se abarata"

key-files:
  created: []
  modified:
    - "app/(dashboard)/agenda/agenda-client.tsx"
    - ".planning/workstreams/motor-reservas/phases/17-superficie-y-polish/17-05-PLAN.md"
    - ".planning/workstreams/motor-reservas/phases/17-superficie-y-polish/deferred-items.md"

key-decisions:
  - "Los dos cálculos (entradas del día + solape) salen de UN solo `useMemo` porque comparten el reloj. Era la forma más barata de garantizar el `Date.now()` único que pide el criterio, y además la única que garantiza coherencia entre la fila y el badge de solape"
  - "El roster recupera la entrada de grupo por `(date, time, serviceId)` en vez de recalcular: T-17-23 deja de ser un riesgo que hay que vigilar y pasa a ser imposible por construcción"
  - "El contador del roster pasó de `enrollees.length/capacity` a `occupied/capacity` y su rótulo de `inscriptos` a `lugares ocupados`: la lista puede tener más filas que el contador (holds vencidos), y con el rótulo viejo eso parecía un bug"
  - "El segmento `· N sin seña` sale SOLO en el grupal (`pendingDeposit={0}` en el simultáneo): el ámbar por-persona se pierde al colapsar, pero en el simultáneo los chips siguen uno por uno a la vista"
  - "Superficie de la fila de grupo: `statusChip('confirmed')` si hay al menos un lugar ocupado, `statusChip('cancelled')` (neutra) si son todos no-ocupantes — UI-SPEC §4.2 literal"
  - "El paso 7 de la prueba manual se ejecutó cambiando `services.capacity` por PATCH directo a la base, NO desde el control inline de `/servicios`: 17-03 es wave 3 y todavía no corrió. El PATCH prueba exactamente lo mismo (el número de la grilla sale del servicio) por un camino que sí existía"

requirements-completed: [POLISH-09]

# Metrics
duration: 48min
completed: 2026-08-20
status: complete
---

# Phase 17 Plan 05: La columna del día consume el módulo puro y la clase grupal se colapsa en una fila Summary

**`agenda-client.tsx` deja de decidir el cupo con una columna que el motor ignora desde la 068 y de deducir el modo del número: ahora consume `lib/agenda-occupancy.ts`, cada clase grupal ocupa UNA fila con un contador `3/6` siempre visible y un solo elemento clickeable, el grupal y el simultáneo pintan su ocupación con el mismo `OccupancyBadge`, y el roster recupera —no recalcula— la misma entrada de grupo que se renderizó.**

## Performance

- **Duration:** ~48 min
- **Completed:** 2026-08-20
- **Tasks:** 3
- **Files created:** 0 · **modified:** 1 de código (+ 2 de planificación)

## Accomplishments

- **POLISH-09 cerrado de verdad, y medido.** El `useCallback` que sacaba el cupo recorriendo los bloques de horario **ya no existe**, y la deducción `isGroup = capacityFor(...) > 1` tampoco. La prueba no es un grep: se cambió `services.capacity` de 6 → 8 → 3 → 6 en la base local y el contador de la grilla siguió el número **en el HTML renderizado**, sin tocar un solo `time_block`.
- **La asimetría que el requisito venía a cerrar desapareció.** Antes el simultáneo tenía tratamiento de ocupación y el grupal **no tenía ninguno**. Ahora los dos consumen `OccupancyBadge`, con los mismos tokens y la misma maqueta.
- **La información que el colapso escondía se recuperó.** Colapsar 6 chips en una fila borra el ámbar por-persona de los `pending_payment`. El segundo segmento del badge (`· 1 sin seña`, umbral ≥ 1) lo devuelve, y el `aria-label` lo repite porque en mobile no hay hover (T-17-25).
- **Dos clases distintas a la misma hora ya no se pueden mezclar.** El roster viaja con `serviceId`; verificado en pantalla con `Yoga grupal` y `Pilates reformer` compartiendo las 09:00 y produciendo **dos filas** con contadores propios (T-17-24).
- **Se verificó con datos reales y HTML real, no con un smoke test.** Se sembró el fixture en el Supabase local y se hizo un `GET /agenda` **autenticado** contra el dev server armando a mano la cookie de `@supabase/ssr`. 6 de los 7 pasos de la prueba manual quedaron medidos sobre markup; el único que no, y por qué, está declarado abajo.

## Task Commits

1. **Task 1: Borrar las dos lecturas viejas y consumir el módulo puro (D-11 / D-12)** — `8aad4fe` (refactor)
2. **Task 2: `OccupancyBadge` — un solo componente de ocupación para los dos modos** — `28bc538` (feat)
3. **Task 3: La línea de grupo colapsada — una fila, un contador, un solo clickeable (D-10)** — `98ff17e` (feat)
4. *(fuera de tareas)* Registro del ESLint `react-hooks/purity` pre-existente como fuera de alcance — `f3911cb` (docs)

## Files Created/Modified

- **`app/(dashboard)/agenda/agenda-client.tsx`** (único archivo de código; +114 / −117 en Task 1, ~+60 netas en total):
  - **Se fueron:** el `useCallback` del cupo por bloque, `const isGroup = …`, `const isSimultaneous = …`, `const apptsByDate`, y las copias locales de `timeToMin` y `OCCUPYING_STATUSES`.
  - **Llegaron:** `import { buildDayEntries, computeOverlapFull, type DayEntry } from '@/lib/agenda-occupancy'`, el memo combinado `{ entriesByDate, overlapFullById }` con un solo `Date.now()`, `OccupancyBadge`, la rama `entry.kind === 'group'` de la columna, y `rosterSlot: { date, time, serviceId }`.
  - **Cambió de semántica:** el contador del roster (`occupied/capacity`, rótulo `lugares ocupados`) y su título (suma el nombre del servicio).
- **`17-05-PLAN.md`** — `<uat_script>` actualizado para que sea cierto: la preparación ya no pide cargar datos (el fixture quedó sembrado en local y está descrito), los pasos 7 y 8 describen lo que realmente se construyó (dos filas, badge neutro vs. ámbar, nombres concretos), y se declara qué pasos dependen de 17-03 (wave 3, todavía sin ejecutar).
- **`deferred-items.md`** — el ESLint `react-hooks/purity` pre-existente y los dos ítems que el plan declaró fuera de alcance.

## Verificación medida

### Gates de aceptación (antes → después)

| Criterio | Antes | Después | Pedido | |
|---|---|---|---|---|
| `./node_modules/.bin/tsc --noEmit` (exit) | 0 | **0** | 0 | PASS |
| `npm run build` (exit) | — | **0** | 0 | PASS |
| `grep -cF '@/lib/agenda-occupancy'` | 0 | **1** | 1 | PASS |
| `grep -cE 'capacityFor\s*\('` | 3 | **0** | 0 | PASS |
| `grep -cF 'initialTimeBlocks'` | 6 | **4** | 4 | PASS |
| `grep -cF 'function timeToMin'` | 1 | **0** | 0 | PASS |
| `grep -cF 'const OCCUPYING_STATUSES'` | 1 | **0** | 0 | PASS |
| `grep -cF 'entriesByDate'` | 0 | **6** | ≥3 | PASS |
| `grep -cF 'const apptsByDate'` | 1 | **0** | 0 | PASS |
| `grep -cF 'serviceId'` | 0 | **4** | ≥2 | PASS |
| `grep -cF 'Date.now()'` | 1 | **1** | 1 | PASS |
| `grep -cF 'function OccupancyBadge'` | 0 | **1** | 1 | PASS |
| `grep -cF '<OccupancyBadge'` | 0 | **2** | 2 | PASS |
| `grep -cF 'text-[9px]'` | 2 | **2** | 2 | PASS |
| `grep -cF 'sin seña'` | 0 | **1** | ≥1 | PASS |
| `grep -cF 'tabular-nums'` | 2 | **5** | ≥1 | PASS |
| `grep -cF 'size-2.5!'` | 2 | **2** | 2 | PASS |
| `grep -cE 'bg-warning/10\|border-warning/30'` | 1 | **1** | ≥1 | PASS |
| `grep -cE '#[0-9a-fA-F]{6}'` | 0 | **0** | 0 | PASS |
| `grep -cE 'const isGroup'` | 1 | **0** | 0 | PASS |
| `grep -cE 'capacity_mode\s*==='` | 1 | **0** | 0 | PASS |
| `grep -cF "entry.kind === 'group'"` | 0 | **1** | ≥1 | PASS |
| `grep -cF 'min-w-0 flex-1 truncate'` | 0 | **1** | ≥1 | PASS |
| `grep -cF 'flex-shrink-0'` | 8 | **9** | ≥1 | PASS |
| `grep -cF 'Ver inscriptos de'` | 1 | **1** | 1 | PASS |
| `vitest run test/agenda-occupancy.test.ts --no-file-parallelism` | 20 passed | **20 passed / 0 failed** | 0 failed | PASS |
| `git diff -- lib/ test/` | — | **vacío** | vacío | PASS |
| `git diff -- "agenda/page.tsx" package.json package-lock.json` | — | **vacío** | vacío | PASS |
| `git diff --name-only` | — | **solo `agenda-client.tsx`** | exacto | PASS |

### Prueba manual — ejecutada contra el HTML renderizado con datos reales

**Cómo.** No hay navegador en este entorno, pero sí hay Supabase local corriendo y un negocio semilla. En vez de repetir la limitación de 17-04 ("`/finances` está detrás del login"), se **atravesó** el login: se sembró un fixture con la service-role key, se hizo login por GoTrue con `test@forjo.local`, se armó a mano la cookie de `@supabase/ssr` (`sb-127-auth-token` = `base64-` + base64url del session JSON, un solo chunk de 2426 chars) y se hizo `GET http://localhost:3000/agenda` con esa cookie → **HTTP 200**, 155.808 bytes de HTML del dashboard real. Todo lo de abajo sale de **inspeccionar ese markup**, no de razonar sobre el código. El servidor de dev quedó apagado.

**Fixture sembrado** (negocio `Negocio de Prueba`, fecha `2026-08-21`, dentro de la semana en curso):
`Yoga grupal` (group_class, cupo 6) con Ana Gomez + Bruno Diaz confirmados y Carla Ruiz en `pending_payment` con hold vivo, todos a las 09:00 · `Pilates reformer` (group_class, cupo 4) con Dora Paz a las **09:00, el mismo horario** · `Corte` (individual) con Elsa Mora a las 11:00.

| Paso | Resultado | |
|---|---|---|
| **1.** El horario ocupa **una sola fila**, con la hora, el nombre truncable y el contador sin recortar | La celda del viernes renderiza `<button>` con `<span class="font-semibold">09:00</span>`, `<span class="min-w-0 flex-1 truncate">Yoga grupal</span>` y el badge con `flex-shrink-0`. **Una fila, tres inscriptos.** El ancho de 375px no se pudo medir sin navegador, pero el markup es el que el UI-SPEC §4.3 prescribe justamente para ese ancho | PASS (markup) |
| **2.** El contador se ve **aunque no esté lleno** | `👥 3/6` con `title="3 de 6 lugares ocupados · 1 inscripto sin la seña pagada"` y tokens **neutros** (`border-border bg-secondary text-muted-foreground`)… con la salvedad de que acá sale ámbar porque hay seña pendiente. La fila de Pilates, sin seña pendiente y sin llenarse, muestra `👥 1/4` en tokens neutros: **el contador se ve igual** | PASS |
| **3.** Tocar la fila abre el roster con los tres y el título con el nombre del servicio | **NO MEDIDO** — es JS de cliente y no hay navegador. Ver "Rojo declarado" | PENDIENTE UAT |
| **4.** Un turno del **mismo horario** pero de **otro** servicio grupal produce una **segunda** fila | Dos `<button>` distintos en la misma celda: `Ver inscriptos de Pilates reformer a las 09:00 … — 1 de 4 lugares` y `Ver inscriptos de Yoga grupal a las 09:00 … — 3 de 6 lugares, 1 sin seña`. **No se fusionan** (T-17-24) | PASS |
| **5.** Un turno individual se sigue viendo como hoy y **no** abre nada | `<div class="rounded px-1.5 py-1 text-[11px] … break-words …"><span class="font-semibold">11:00</span> Elsa Mora<span class="block text-[10px] opacity-80">Corte</span></div>` — **`<div>`, no `<button>`**, sin contador y sin roster (D-12) | PASS |
| **6.** Un `pending_payment` suma `· 1 sin seña` | `<span>· <span class="tabular-nums">1</span> sin seña</span>` dentro del badge, con `border-warning/30 bg-warning/10 text-warning`, y `, 1 sin seña` al final del `aria-label` | PASS |
| **7.** Cambiar el cupo del **servicio** cambia el número de la grilla | Tres PATCH sobre `services.capacity` de Yoga y tres re-render: **cap 8 → `3/8`, sin "lleno"** · **cap 3 → `3/3` con `lleno`** · **cap 6 → `3/6`**. Ningún `time_block` tocado. **Esta es la prueba de POLISH-09** | PASS |
| *(extra, UI-SPEC §4.2)* Un slot con **todos** sus miembros no-ocupantes se renderiza igual | Se sembró un `pending_payment` con `expires_at` **vencido** a las 10:00: la fila existe, con `👥 0/6`, `aria-label … — 0 de 6 lugares`, **sin** segmento de seña, y sobre la **superficie neutra** (`bg-secondary text-muted-foreground border-border`). Colapsar no hizo desaparecer nada, y el hold vencido no ocupa lugar | PASS |

**Desviación del paso 7 respecto de la letra del plan:** el plan pedía subir el cupo "desde `/servicios` (el control inline de 17-03)". **17-03 es wave 3 y no está ejecutado** (`git log` no tiene ni un commit suyo), así que ese control todavía no existe. El cupo se cambió por PATCH directo a `services.capacity`, que prueba exactamente la afirmación del criterio —el número de la grilla sale del **servicio**— por el único camino disponible.

### El cambio de comportamiento que el plan predijo

**Confirmado: el roster ahora filtra por servicio.** Antes, `roster` filtraba `a.date === date && a.time === slotKey` y mezclaba en una sola lista a los inscriptos de todas las clases de ese horario. Con el fixture de arriba (Yoga y Pilates a las 09:00), el modelo viejo habría listado a **Dora Paz junto a Ana, Bruno y Carla**, y su contador habría dicho `4/…`. El modelo nuevo produce dos entradas independientes (`3/6` y `1/4`) y el roster recupera la que corresponde por `serviceId`. Verificado en el markup por los dos `aria-label` con sus contadores propios.

**Segunda consecuencia, también confirmada:** la lista del roster puede tener más filas que el contador. El caso del hold vencido lo muestra: la entrada existe con `occupied: 0` pero `appts` tiene un miembro. Por eso el rótulo del contador del diálogo pasó de `inscriptos` a **`lugares ocupados`** — con el rótulo viejo, "0 inscriptos" sobre una lista de uno parecía un bug en vez de la distinción correcta entre *quiénes figuran* y *cuántos lugares hay tomados*.

## Deviations from Plan

**1. [Alcance] El paso 7 de la prueba manual se ejecutó por PATCH a la base, no desde `/servicios`**

- **Found during:** Task 3
- **Issue:** el criterio nombra "el control inline de 17-03", pero 17-03 es **wave 3** y 17-05 es wave 2: el control no existe todavía en el código.
- **Fix:** se cambió `services.capacity` por PATCH directo (6 → 8 → 3 → 6) y se re-renderizó la agenda entre cada cambio. La afirmación que el criterio quiere probar —que el número de la grilla sale del servicio y no de un bloque de horario— queda probada igual, y con tres valores en vez de uno.
- **Verification:** contadores `3/8`, `3/3 lleno`, `3/6` medidos en el HTML.

**2. [Rule 2 - Corrección] El contador del roster pasó a decir "lugares ocupados"**

- **Found during:** Task 1
- **Issue:** el roster viejo contaba `enrollees.length` (filas de la lista) y lo rotulaba `inscriptos`. Al pasar a leer la entrada de grupo, el contador correcto es `occupied` (lugares tomados), que **puede diferir** de la cantidad de filas cuando hay holds vencidos. Dejar el rótulo `inscriptos` sobre un número que ya no cuenta filas habría producido una pantalla que se contradice a sí misma.
- **Fix:** contador = `occupied/capacity`, rótulo = `lugar ocupado` / `lugares ocupados`.
- **Files modified:** `app/(dashboard)/agenda/agenda-client.tsx`
- **Commit:** `8aad4fe`

**3. [Alcance] El paso 3 de la prueba manual no es ejecutable en este entorno**

- Abrir el roster es una interacción de cliente. No hay navegador headless en el proyecto y **agregar uno habría violado el propio threat model del plan** (T-17-SC exige `git diff -- package.json package-lock.json` vacío). Queda declarado abajo y anotado en el `<uat_script>` del plan.

**Total deviations:** 1 auto-arreglada (Rule 2) + 2 limitaciones de entorno/secuencia declaradas.
**Impact:** ninguno sobre el código entregado. Los 28 gates automatizados están en verde y 6 de los 7 pasos manuales quedaron medidos sobre HTML real.

## Fuera de alcance encontrado (no arreglado)

- **`agenda-client.tsx` — ESLint `react-hooks/purity` PRE-EXISTENTE.** `const nowMs = Date.now()` dentro de un `useMemo`. Verificado presente en `HEAD` antes de esta fase (línea 495 del archivo original, en el memo de `overlapFullById`): se comprobó restaurando el archivo de `HEAD` y corriendo ESLint — **1 error, la misma regla**. 17-05 no lo introduce ni lo multiplica (el conteo de `Date.now()` sigue en 1). Registrado en `deferred-items.md`.
- **`agenda-client.tsx:1130` "Copiar horario" y el diálogo del roster de desktop** — mismo problema de alto potencial que 17-02 resolvió en el editor de servicio. **Declarados fuera de alcance por el propio plan.** Anotados, no tocados.
- **"La agenda no sabe qué servicio se da en cada franja"** — el plan lo declaró del tamaño de un milestone y con todo propio. No se tocó.
- **Detalle de la base encontrado al sembrar el fixture:** `appointments_no_double_booking` es único sobre `(business_id, professional_id, date, time, seat)` — **sin `service_id`**. Dos clases grupales distintas a la misma hora **sin profesional asignado** compiten por el mismo espacio de `seat`, así que la segunda clase tiene que nacer con seats corridos. No es un defecto de esta fase ni algo que 17-05 pueda o deba tocar (es el motor, no el panel), pero es exactamente el tipo de cosa que conviene tener anotada si alguna vez se persigue "dos clases al mismo horario" como caso de negocio.

## Rojo conocido y DECLARADO al cerrar este plan

**El paso 3 de la prueba manual (tocar la fila → se abre el roster) NO se ejecutó.** La apertura del diálogo es JS de cliente: el SSR autenticado llega hasta el markup inicial y ahí termina. No hay navegador headless en el proyecto y agregarlo habría roto T-17-SC.

Lo que sí está medido de ese camino: el `<button>` existe, es el **único** clickeable del slot, su `onClick` es `setRosterSlot({ date, time, serviceId })`, y el `roster` recupera la entrada por esos tres campos con la misma función que produjo las filas verificadas. El riesgo residual es de renderizado del diálogo, no de datos.

**Con esto la fase queda PENDIENTE DE UAT VISUAL**, con el guion del `<uat_script>` ya corregido para que sea cierto (fixture descrito, pasos 7 y 8 reescritos contra lo construido, y advertencia de que los pasos 1-6 miran pantallas de 17-01/02/03 y que **17-03 todavía no corrió**).

## Known Stubs

Ninguno. No hay valores vacíos hardcodeados, ni placeholders, ni componentes sin fuente de datos. Los dos únicos fallbacks del archivo (`entry.serviceName ?? 'Clase'` en la fila y `?? 'la clase'` en el `aria-label`) cubren un servicio sin nombre, que es un dato faltante real, no un stub: el contador y el roster siguen siendo correctos en ese caso.

## Threat Flags

Ninguno. El plan no crea endpoints, no toca auth, no accede a archivos, no cambia esquema y no agrega dependencias. `git diff -- package.json package-lock.json "app/(dashboard)/agenda/page.tsx"` **vacío** (T-17-SC, T-17-28). El único efecto de un click sigue siendo abrir un diálogo local; no se agregó ni modificó ningún camino de escritura.

Los seis threats con disposición `mitigate` están cubiertos y medidos: **T-17-22** (lectura vieja borrada: `capacityFor` = 0, `initialTimeBlocks` 6 → 4), **T-17-23** (el roster recupera, no recalcula), **T-17-24** (dos filas separadas para dos clases del mismo horario, verificado en el HTML), **T-17-25** (`· 1 sin seña` en el badge y en el `aria-label`), **T-17-26** (una fila de alto fijo, `min-w-0 flex-1 truncate` + `flex-shrink-0`), **T-17-27** (`capacity_mode ===` = 0: el componente no re-implementa la decisión de modo).

## Next

La fase 17 queda con **17-03 pendiente** (wave 3, `settings-client.tsx`) y con la **UAT visual** de los 10 pasos del guion, que un ejecutor no puede cerrar solo. El fixture de la agenda ya está sembrado en el Supabase local para que los pasos 7 y 8 se puedan correr sin preparación.

## Self-Check: PASSED

- `app/(dashboard)/agenda/agenda-client.tsx` — FOUND (modificado)
- `lib/agenda-occupancy.ts` — FOUND (sin diff: consumido, no ajustado)
- `.planning/.../17-05-PLAN.md` — FOUND (uat_script actualizado)
- `.planning/.../deferred-items.md` — FOUND (sección 17-05)
- Commits `8aad4fe`, `28bc538`, `98ff17e`, `f3911cb` — FOUND en `git log`
- `tsc --noEmit` exit 0 · `npm run build` exit 0 · suite 20/20 · los 28 gates medidos arriba en verde
