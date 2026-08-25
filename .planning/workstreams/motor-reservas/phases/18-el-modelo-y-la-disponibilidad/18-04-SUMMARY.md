---
phase: 18-el-modelo-y-la-disponibilidad
plan: 04
subsystem: booking
tags: [write-path, backstop, anti-tampering, agenda-por-servicio, flag-por-caller, integracion-db-local]

# Dependency graph
requires:
  - phase: 18-el-modelo-y-la-disponibilidad
    plan: 01
    provides: "la tabla puente `time_block_services` (migr. 071), aplicada en el Postgres LOCAL"
  - phase: 18-el-modelo-y-la-disponibilidad
    plan: 02
    provides: "`isServiceAllowedAt` — la regla del ACEPTA como fuente única, con su semántica angosta (sin franja contenedora, acepta)"
  - phase: 18-el-modelo-y-la-disponibilidad
    plan: 03
    provides: "el fixture `seedTimeBlockService` y la convención de `dow` (medianoche UTC + getUTCDay) que este plan replica para no divergir de la superficie que ofrece"
  - phase: 01-refactor-del-core
    provides: "`createAppointmentCore` y su mecanismo de flags por caller (`requireDeposit`/`autoAssign`), el molde exacto del flag nuevo"
provides:
  - "`lib/booking-core.ts`: flag `enforceServiceWindow` (default apagado) + el backstop de la regla franja↔servicio + el código de error `service_not_scheduled` (400)"
  - "`app/api/booking/create/route.ts`: el único caller que enciende el flag"
  - "`test/booking-service-window-backstop.test.ts`: 5 casos de integración — el rechazo, su control negativo con el flag apagado, y los dos anti-regresión"
  - "Las dos exenciones deliberadas (alta manual del dueño, generación de abonos) medidas por `git diff` vacío, no argumentadas"
affects: [phase-19-ui-de-configuracion, phase-20-booking-publico]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flag opcional con default APAGADO para diferenciar callers de un core compartido: el fail-safe apunta a que el caller olvidado herede el comportamiento de hoy"
    - "El control de tampering vive donde la entidad ya está re-validada por `business_id` (el core), no donde llega cruda del cliente (el handler)"
    - "Control negativo ejecutable: el mismo pedido por la vía sin flag DEBE entrar — es lo que prueba que el rechazo lo produce el flag y a la vez congela la exención"
    - "Exención deliberada verificada por `git diff` vacío sobre los archivos exentos, en vez de por comentario"

key-files:
  created:
    - "test/booking-service-window-backstop.test.ts"
  modified:
    - "lib/booking-core.ts"
    - "app/api/booking/create/route.ts"

key-decisions:
  - "El backstop vive DENTRO de `createAppointmentCore` y no en el route handler porque acá el servicio ya está re-validado por `business_id`: la regla se evalúa sobre `service.id` (el id que la base confirmó de este negocio) y nunca sobre el `serviceId` crudo del body. En el handler habría razonado sobre un id del cliente, que es justo lo que el repo prohíbe"
  - "Gateado por `enforceServiceWindow` con default `false`: el core tiene TRES llamadores y la regla aplica a UNO. Sin el gate se rompían DOS exenciones deliberadas de una (alta manual + abonos). Con el flag apagado no corre ni una query nueva → camino byte-idéntico"
  - "Ubicado después del gate de `any_professional_unsupported` y antes de resolver el profesional: cubre por igual el camino con profesional elegido y el de asignación automática (los dos son públicos) y no gasta queries en una request ya rechazada por otro motivo"
  - "Código de error PROPIO `service_not_scheduled` en vez de colapsar en `invalid_service`: el servicio es válido y está activo; lo inválido es el par servicio↔franja. Colapsarlos haría indistinguibles dos mensajes distintos para el público (la copy es AGENDA-07, Phase 20)"
  - "400 y no 409: no hay conflicto de horario —el slot puede estar libre—, es una request no soportada por la configuración de la agenda. Mismo razonamiento que su gate hermano de arriba"
  - "La convención de `dow` se replica EXACTA de la superficie que ofrece (`new Date(date + 'T00:00:00Z').getUTCDay()`, alineada con `EXTRACT(dow)`): si las dos derivaran el día distinto, una ofrecería lo que la otra rechaza"
  - "La lectura de la puente lleva `.eq('business_id', business.id)` explícito aunque el cliente pueda ser service-role: el helper es puro y NO filtra por negocio (contrato D-16, el caller acota antes de llamar)"
  - "CERO archivos `.tsx`: el backstop sólo lo puede disparar una request forjada (la grilla ya no ofrece esos horarios desde el Plan 03) y el cliente ya tiene un mensaje genérico de fallback"

patterns-established:
  - "El control negativo del gate no es prosa: se ejecuta. El caso 2 llama al core por la vía sin flag con EXACTAMENTE el mismo pedido que el caso 1 rechaza — si el backstop se filtrara a las otras dos superficies, ese caso se pondría rojo antes que ningún humano lo note"
  - "El anti-regresión duro se congela como caso propio: un horario fuera de TODA franja se acepta (caso 5). Sin él, la próxima persona que 'complete' la validación de ventana rompería los días con horario especial sin que nada se ponga rojo"

requirements-completed: [AGENDA-03, AGENDA-04]

# Metrics
duration: 38min
completed: 2026-08-25
status: complete
---

# Phase 18 Plan 04: El backstop del `create` Summary

**La superficie que ACEPTA quedó alineada con la que ofrece: un POST forjado a `/api/booking/create` ya no puede reservar un servicio en una franja que declaró no darlo — rechazo 400 `service_not_scheduled` desde dentro del core, sobre el `service.id` re-validado por tenant, gateado por un flag con default apagado que deja intactas las dos exenciones deliberadas (alta manual del dueño y generación de abonos), medidas por `git diff` vacío y no por comentario.**

## Qué se construyó

**El flag (`lib/booking-core.ts`).** `enforceServiceWindow?: boolean`, documentado con el mismo nivel de detalle que sus dos hermanos `requireDeposit` / `autoAssign`: qué caller lo enciende, qué pasa en su default, y por qué el default es **apagado** — si mañana aparece un caller nuevo y nadie se acuerda del flag, hereda el comportamiento de hoy en vez de romperse. Desestructurado con default `false` junto a los otros dos.

**El código de error.** `service_not_scheduled` como miembro nuevo de la unión del resultado, con su bloque de documentación al lado de `any_professional_unsupported` y `simultaneous_space_conflict`: qué significa, por qué es 400 y no 409, y por qué no colapsa en `invalid_service`.

**El backstop.** Después del gate de `any_professional_unsupported` y antes de resolver el profesional. Gateado entero por el flag. Deriva el `dow` con la misma convención que la base y el endpoint de disponibilidad, lee las franjas de ese día y las filas de la puente —las dos con `.eq('business_id', ...)` explícito— y le pregunta a `isServiceAllowedAt` del helper puro del Plan 02, pasándole el `service.id` ya re-validado. Negativo ⇒ rechazo temprano 400.

**El único caller que lo enciende.** `app/api/booking/create/route.ts` pasa `enforceServiceWindow: true` junto a `requireDeposit` y `autoAssign`, con el comentario de por qué es el único.

**La suite (`test/booking-service-window-backstop.test.ts`, 5 casos).** Escenario de dos franjas del lunes —A 09:00-12:00 mapeada a `svc1`, B 12:00-15:00 comodín—: (1) POST forjado de `svc2` a las 10:00 ⇒ 400 `service_not_scheduled` **y cero filas en `appointments`** (asertado contra la base, no sólo contra el status); (2) el MISMO pedido por el core sin el flag ⇒ se crea; (3) `svc1` a las 10:00 ⇒ se crea; (4) puente vaciada ⇒ se crea; (5) `svc2` a las 20:00, fuera de toda franja ⇒ se crea.

## El rojo esperado del Task 1, y que lo cerró el Task 2

El plan pedía que la suite quedara **roja en exactamente el caso 1** al terminar el Task 1, y así quedó: `1 failed | 4 passed (5)`, con el fallo siendo `expected 200 to be 400` — el core todavía no rechazaba. Ese rojo se commiteó a propósito (`47dd911`) y lo cerró el Task 2 (`bdcbdef`): la suite pasó a `5 passed`, 0 skipped.

Vale la pena decir por qué el caso 1 es el único que podía estar rojo: los casos 3, 4 y 5 asertan que el turno **se crea**, y crear turnos es lo que el core ya hacía antes del cambio. Son verdes antes y después — su valor no es el rojo, es que se pongan rojos **si alguien ensancha la regla**. El caso 2 es el mismo tipo de guarda, apuntando a la otra dirección: se pondría rojo si el backstop se filtrara a las superficies exentas.

## Deviations from Plan

None - plan executed exactly as written. Los tres archivos declarados son los tres archivos tocados, sin `.tsx` y sin dependencias nuevas.

## Verificación

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npx vitest run test/booking-service-window-backstop.test.ts` | 5 passed, 0 failed, **0 skipped** |
| `git diff -- app/api/appointments/create/route.ts lib/abono-generation.ts` | **vacío** (las dos exenciones, medidas) |
| `git diff -- package.json package-lock.json` | vacío |
| No-regresión core/manual (4 suites) | 35 passed |
| No-regresión abonos (`abono-generation`, `abono-create`, de a una) | 11 passed · 13 passed |
| No-regresión público (`cualquiera`, `public-regression`, `canchas`, `concurrency`) | 41 passed |
| Phase 18 (`availability-service-window`, `time-block-services`, backstop) | 28 passed |
| `grep -cE "enforceServiceWindow" lib/booking-core.ts` | 4 (≥3 pedido) |
| `grep -cE "service_not_scheduled" lib/booking-core.ts` | 3 (≥2 pedido) |
| `grep -vE '^\s*//' lib/booking-core.ts \| grep -cE "isServiceAllowedAt\("` | **1** (la regla no se reimplementa) |
| `grep -cE "enforceServiceWindow" app/api/booking/create/route.ts` | 1 |
| `grep -cE "^  it\(" test/booking-service-window-backstop.test.ts` | 5 |

## Notas de entorno (no son deviations)

**La flakiness de la DB local es más ancha que las suites de abono.** El prompt advertía sobre `abono-*`; en esta corrida también timeoutearon *hooks* (`beforeAll`, 10 s) de `booking-core.test.ts`, `manual-booking.test.ts` y `booking-window-exemption.test.ts` — en corridas distintas, en archivos distintos, y **con `--no-file-parallelism` puesto**. El punto lento es `auth.admin.createUser` del fixture contra el Supabase local en Windows/Docker, no el código de este plan: las mismas suites, re-corridas sin cambiar una línea, dieron 35/35 verde. Un fallo así **no se debe leer como regresión** sin re-correr primero.

**Ninguna verificación se hizo en paralelo.** Todos los gates de arriba se corrieron con `--no-file-parallelism`.

## Lo que este plan NO hizo (a propósito)

- **`app/api/appointments/create/route.ts`** y **`lib/abono-generation.ts`**: sin tocar, ni un comentario. Heredan el flag apagado y con eso alcanza.
- **Cero `.tsx`**: la copy al público es AGENDA-07, Phase 20.
- **Sin trigger ni constraint en la base** (D-04): sería la garantía más fuerte —valdría incluso contra `book_slot_atomic` invocado directo por `anon`— pero es un gate nuevo sobre `appointments`, y las migraciones 063/064/067/069 de este mismo workstream fueron todas correcciones de gates ahí. Queda como candidato al milestone siguiente, ya registrado.

## Threat Flags

Ninguno. El plan no introdujo superficie de red, de auth ni de esquema nuevas: sólo dos lecturas acotadas por `business_id` dentro de un camino ya existente, y ambas sólo cuando el flag está encendido.

## Self-Check: PASSED

- `lib/booking-core.ts` — FOUND (modificado)
- `app/api/booking/create/route.ts` — FOUND (modificado)
- `test/booking-service-window-backstop.test.ts` — FOUND (creado)
- commit `47dd911` (test, RED) — FOUND
- commit `bdcbdef` (feat, GREEN) — FOUND
