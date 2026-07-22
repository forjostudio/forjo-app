---
phase: 07-cancelaci-n-del-abono-mail-panel
plan: 01
subsystem: api
tags: [supabase, postgres, multi-tenant, abonos, vitest, typescript]

# Dependency graph
requires:
  - phase: 06-modelo-del-abono-alta-manual-generaci-n-forward
    provides: "tabla abonos (status/cancel_token/cancelled_at, migr. 054), appointments.abono_id, lib/abono-generation.ts (contrato rol-agnóstico), fixtures test/helpers/booking-fixtures.ts"
provides:
  - "lib/abono-cancel.ts — motor compartido y ÚNICO de baja de serie del abono (D-07)"
  - "cancelAbonoSeries({ supabase, businessId, abonoId, todayStr? }) — baja idempotente con doble scoping abono_id + business_id"
  - "previewAbonoCancellation(...) — conteo + última fecha de los turnos futuros, sin escribir (aviso previo D-03)"
  - "selectFutureOccurrences / summarizeOccurrences — reglas puras de la ventana futura, reusables server y client"
  - "todayISOInAR() — 'hoy' en fecha AR serializado, centraliza el toISODate duplicado en abonos/create y en el cron"
affects: [07-02, 07-03, 07-04, cancelación pública por token, panel de abonos, mails de baja de serie]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Motor de dominio rol-agnóstico: recibe el SupabaseClient por parámetro y no importa ningún factory (service-role por token / anon+RLS por panel sobre el MISMO código)"
    - "Gate de estado DENTRO del UPDATE (.neq('status','cancelled') + .select('id')) como primitiva de idempotencia bajo concurrencia, en vez de leer-y-después-escribir"
    - "Bulk update multi-tenant con doble scoping obligatorio .eq('business_id') + .eq('abono_id')"
    - "Regla temporal pura (selectFutureOccurrences) compartida entre el preview y el efecto para que no puedan divergir"

key-files:
  created:
    - lib/abono-cancel.ts
    - lib/abono-cancel.test.ts
    - test/abono-cancel.test.ts
  modified: []

key-decisions:
  - "La baja es UNA sola función que llaman las dos vías (token público y panel autenticado): la consistencia mail↔panel queda garantizada por construcción, no por disciplina (D-07)"
  - "El gate de idempotencia vive dentro del UPDATE del abono: solo la request que voltea la fila continúa, así dos bajas simultáneas no disparan dos mails (D-05, T-07-03)"
  - "El resumen (cancelledCount / lastDate) se deriva de las filas REALMENTE afectadas por el UPDATE, no de un conteo previo: sin ventana de carrera entre preview y baja"
  - "not_found cubre tanto 'no existe' como 'es de otro tenant' a propósito: no se revela la existencia de un abono ajeno (D-22)"
  - "Si falla la cancelación masiva de turnos se devuelve update_failed pero la fila del abono ya quedó cancelled: la garantía crítica (frenar la generación forward) se sostiene igual"
  - "El corte 'hoy' sale de todayInAR() y se serializa con componentes locales: recortar el ISO string corría el día entero cerca de medianoche AR con el proceso en UTC (D-02)"

patterns-established:
  - "Cabecera doctrinal en español enunciando qué hace / qué NO hace / decisiones no obvias (molde de lib/abono-generation.ts)"
  - "Suite dual por módulo de dominio: reglas puras junto al módulo (lib/*.test.ts) + efecto real contra la DB en test/ con describe.skipIf(!hasSupabaseCreds)"
  - "Tests de DB con todayStr inyectado explícitamente: el resultado no depende del reloj del runner"

requirements-completed: [ABONO-04, ABONO-05]

# Metrics
duration: 22min
completed: 2026-07-21
status: complete
---

# Phase 7 Plan 01: Motor compartido de baja de serie Summary

**`lib/abono-cancel.ts`: única implementación de la baja de abono — idempotente por gate atómico, con doble scoping `abono_id` + `business_id`, corte AR inclusive y preview que no puede divergir del efecto**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-21T15:14:00Z
- **Completed:** 2026-07-21T15:36:00Z
- **Tasks:** 3
- **Files modified:** 3 (los 3 creados)

## Accomplishments

- **Un solo camino de baja para las dos vías (D-07).** El motor es rol-agnóstico (recibe el `SupabaseClient` por parámetro, no importa ningún factory), así que la vía pública lo va a llamar con service role y la del panel con anon+RLS sin bifurcar una línea de lógica. Los Planes 03 y 04 quedan reducidos a cáscaras de autorización + mail.
- **Idempotencia real, no "chequeo previo".** El filtro `.neq('status','cancelled')` vive DENTRO del UPDATE sobre `abonos` junto con `.select('id')`: solo la request que efectivamente voltea la fila recibe filas y continúa. Dos bajas simultáneas del mismo token no pueden disparar dos mails (T-07-03). Como `.neq` deja pasar `completed`, D-21 (completed → cancelled) sale gratis por el mismo camino.
- **Doble scoping en toda escritura (D-24, T-07-01).** El UPDATE masivo de `appointments` encadena siempre `.eq('business_id')` + `.eq('abono_id')`. Verificado contra la DB: la baja de la serie A no toca ni un turno de la serie B del mismo negocio, ni nada del otro tenant, y una invocación cruzada (abonoId ajeno + businessId propio) devuelve `not_found` sin efectos.
- **Preview y efecto no pueden divergir.** Los dos pasan por `selectFutureOccurrences` + `summarizeOccurrences`; el número informado por la baja sale de las filas realmente afectadas por el UPDATE, no de un conteo previo.
- **20 tests nuevos verdes** (12 puros + 8 contra la DB local, con Supabase local corriendo — no skipeados).

## Task Commits

1. **Task 1: lib/abono-cancel.ts — motor compartido de baja** - `3e856b6` (feat)
2. **Task 2: lib/abono-cancel.test.ts — reglas puras** - `b38fceb` (test)
3. **Task 3: test/abono-cancel.test.ts — efecto real contra la DB** - `dd0d6d2` (test)

## Files Created/Modified

- `lib/abono-cancel.ts` (227 líneas) — Motor de dominio. Exporta `todayISOInAR`, `selectFutureOccurrences`, `summarizeOccurrences`, `previewAbonoCancellation`, `cancelAbonoSeries`, más los tipos `AbonoCancelInput`, `AbonoCancelSummary` y `CancelAbonoSeriesResult`. Cabecera doctrinal en español con las prohibiciones de la fase (no manda mails, no aplica la regla de 24h, no reactiva, no toca gcal).
- `lib/abono-cancel.test.ts` (115 líneas) — 12 tests puros: corte AR en el borde de medianoche, frontera inclusive, exclusión de los ya cancelados, filas sin `date`, conteo/última fecha y composición sobre un set mixto. Cero imports de Supabase.
- `test/abono-cancel.test.ts` (282 líneas) — 8 tests contra la DB local con dos tenants sembrados: efecto, frontera D-02, scoping por serie, scoping por tenant, idempotencia, exclusión de los pre-cancelados, `completed → cancelled` y coincidencia preview↔efecto.

## Decisions Made

Todas dentro de la Claude's Discretion del CONTEXT y de la letra del plan:

- **Firma de entrada unificada** (`AbonoCancelInput`) para `cancelAbonoSeries` y `previewAbonoCancellation`: las dos operaciones consumen exactamente el mismo par (tenant, serie) + corte, así que compartir el tipo evita que una evolucione sin la otra.
- **`todayStr ?? todayISOInAR()` se resuelve UNA vez** al entrar a cada función (`const cutoff`) en lugar de evaluarse inline en cada `.gte(...)`: mismo resultado, pero imposible que dos queries de la misma llamada usen cortes distintos si cruzan la medianoche.
- **`summarizeOccurrences` cuenta TODAS las filas recibidas** (incluidas las de `date` null) y solo ignora los nulos para el máximo: el filtrado es responsabilidad de `selectFutureOccurrences`, así la función no duplica la regla. Documentado con test.
- **Los turnos PASADOS no se tocan** ni siquiera para "prolijidad": cancelarlos falsearía el historial del negocio. Asertado explícitamente en el test 2.
- **Fixtures del test de DB con `beforeEach` re-sembrando** (en vez del `afterEach` de limpieza de `abono-generation.test.ts`): acá la baja muta también la fila del abono, así que hay que devolverla a `active` entre tests o el de idempotencia contamina a los demás.

## Deviations from Plan

None - plan executed exactly as written.

Único ajuste de redacción, sin impacto funcional: el comentario que explica por qué NO se serializa el corte desde el ISO string contenía literalmente el patrón prohibido por el acceptance criterion (`toISOString().slice(0, 10)`), lo que hacía que el grep negativo diera 1. Se reformuló la prosa ("recortar los 10 primeros caracteres del ISO string") manteniendo intacta la explicación. El criterio ahora da 0.

## Issues Encountered

- **El worktree no trae `node_modules` ni los `.env*`** (gitignored). Se creó una junction de `node_modules` al repo principal y se copiaron `.env.local` + `.env.test.local` para poder correr `tsc` y la suite contra el Supabase LOCAL. Ambos son artefactos ignorados por git: `git status` quedó limpio.
- **Fallos PRE-EXISTENTES en la suite completa, fuera del alcance de este plan.** Corriendo `npx vitest run` sobre el commit base (sin ninguno de mis archivos) ya fallan 3 tests de Phase 6 contra la DB local, de forma intermitente según la corrida:
  - `test/abono-create.test.ts > 4 — la primera tanda (5 turnos) NO dispara ningún mail`
  - `test/abono-generation.test.ts > 3 — es idempotente: la 2ª corrida no crea duplicados`
  - `test/abono-generation.test.ts > 4 — saltea la fecha con schedule_exception closed=true`

  Verificado que son previos a este plan (baseline sin mis archivos: 3 files failed / 4 tests failed). Parecen flakiness por contención sobre el Supabase local corriendo los archivos en paralelo. **NO se tocaron** (SCOPE BOUNDARY: solo se auto-arregla lo causado por los cambios del task). Quedan registrados en `deferred-items.md` de la fase.

## User Setup Required

None - esta fase no agrega migración (`supabase/migrations` sin cambios: `abonos.status`, `cancelled_at`, `cancel_token` y `appointments.abono_id` ya existen desde la migr. 054) ni requiere configuración externa.

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan. El módulo no expone endpoints ni toca esquema; las seis amenazas registradas (T-07-01..06) tienen su mitigación implementada y verificada por test o por grep.

## Next Phase Readiness

- **Planes 03 (vía token público) y 04 (vía panel) desbloqueados**: pueden importar `cancelAbonoSeries` / `previewAbonoCancellation` de `@/lib/abono-cancel` y limitarse a resolver autorización + mails. La consistencia entre mail y panel (criterio 4 del ROADMAP §Phase 7) ya está garantizada estructuralmente.
- **Contrato para los callers:** `alreadyCancelled: true` significa "NO re-disparar mails" (D-05); `{ ok: false, error: 'not_found' }` debe traducirse a 404 genérico sin distinguir "no existe" de "es de otro tenant" (D-22); `{ ok: false, error: 'update_failed' }` deja el abono YA cancelado (la generación forward está frenada) pero con turnos posiblemente sin cancelar → el caller decide si reintenta o avisa.
- **Sin blockers.**

## Self-Check: PASSED

- `lib/abono-cancel.ts` — FOUND
- `lib/abono-cancel.test.ts` — FOUND
- `test/abono-cancel.test.ts` — FOUND
- commit `3e856b6` — FOUND
- commit `b38fceb` — FOUND
- commit `dd0d6d2` — FOUND
- `npx tsc --noEmit` — exit 0
- `npx vitest run lib/abono-cancel.test.ts test/abono-cancel.test.ts` — 2 files / 20 tests passed
- `git status --porcelain supabase/migrations` — vacío
- `git status --porcelain app/cancelar app/api/cancel` — vacío (D-10 respetado)
- Acceptance greps Task 1 — exports 5 / factory-imports 0 / todayInAR 2 / iso-slice 0 / eq-business 5 / eq-abono 3 / status-active 0

---
*Phase: 07-cancelaci-n-del-abono-mail-panel*
*Completed: 2026-07-21*
