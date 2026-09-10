---
phase: 20-lo-que-el-publico-ve
plan: 01
subsystem: api
tags: [supabase, rls, vistas-publicas, rsc, next16, booking, vitest]

# Dependency graph
requires:
  - phase: 18-la-agenda-por-servicio
    provides: "vista public_time_block_services (migr. 071 §3) + REVOKE ALL/GRANT SELECT (migr. 072) + lib/time-block-services.ts (regla del comodin, fuente unica)"
  - phase: 10-multi-staff
    provides: "bookableServices + vista public_professional_services (migr. 059), el molde exacto que espeja la query nueva"
provides:
  - "app/[slug]/page.tsx lee public_time_block_services (8va query del Promise.all) y la pasa como prop timeBlockServices a BookingClient"
  - "BookingClient recibe el catalogo de servicios COMPLETO (sin pre-filtrar por bookableServices) — D-05"
  - "lib/staff-services.ts exporta isServiceStaffed: el guard sentinel de staff preguntado POR SERVICIO"
  - "test/schedule-coverage-public.test.ts: el eje franja verificado contra la DB local con anon key"
affects: [20-02-booking-client, 21-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El RSC publico consume la vista acotada nueva con el MISMO cliente anon del resto del Promise.all y el mismo fail-safe || []"
    - "Los ejes de cobertura (staff y franja) se preguntan POR SERVICIO con funciones booleanas hermanas: isServiceStaffed / isServiceScheduled"
    - "Test DB-backed que lee con cliente anon SIN sesion para ejercitar la ruta real, no con el service-role del fixture"

key-files:
  created:
    - test/schedule-coverage-public.test.ts
  modified:
    - app/[slug]/page.tsx
    - lib/staff-services.ts
    - app/[slug]/booking-client.tsx
    - test/service-coverage-public.test.ts

key-decisions:
  - "El eje staff pasa de OCULTAR a DESHABILITAR-CON-MOTIVO (D-05): page.tsx deja de llamar bookableServices y manda el catalogo completo; el chequeo por-servicio lo hace el cliente en el Plan 20-02"
  - "isServiceStaffed queda como fuente unica del guard sentinel: bookableServices delega en ella en vez de duplicar el activeProfessionals.length === 0"
  - "La prop timeBlockServices se declaro OPCIONAL en BookingClient porque el BookingClient de fallback del LandingRenderer no la pasa"
  - "AGENDA-07 NO se marca completo en este plan: este plan solo prepara el dato; el criterio visible al publico lo cierra el Plan 20-02"

patterns-established:
  - "Fail-safe direccional: el || [] de una puente con regla del comodin degrada a TODO permitido, nunca a todo apagado — un error de lectura no puede apagar el catalogo"
  - "Un test DB-backed sobre una vista public_* asierta la CANTIDAD de filas leidas antes de aplicar la regla: un 0-filas silencioso por RLS es indistinguible del comodin"

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-09-10
status: complete
---

# Phase 20 Plan 01: Lo que el público ve — datos al cliente Summary

**El RSC público sirve el mapeo franja↔servicio (`public_time_block_services`) a `BookingClient` y deja de esconderle servicios: el catálogo viaja completo y los dos ejes de cobertura quedan preguntables por servicio (`isServiceStaffed` / `isServiceScheduled`).**

## Performance

- **Duration:** ~25 min de trabajo efectivo (repartidos en dos sesiones: los Tasks 1-2 el 2026-09-04, el Task 3 el 2026-09-10 tras destrabar Docker — ver Issues)
- **Started:** 2026-09-04T00:10:00Z
- **Completed:** 2026-09-10T19:10:00Z
- **Tasks:** 3
- **Files modified:** 5 (4 del frontmatter + 1 por desviación Rule 3)

## Accomplishments

- `app/[slug]/page.tsx` suma la **8va query** del `Promise.all` sobre `public_time_block_services` (migr. 071 §3), acotada por `.eq('business_id', business.id)`, y la pasa como prop `timeBlockServices` a `BookingClient`. La vista que la Phase 18 creó a propósito **sin consumidor** ya tiene consumidor.
- **D-05 aplicado:** se quitó el filtro `bookableServices` del RSC. `BookingClient` recibe `services={services || []}` — el mismo array crudo que ya recibía el `LandingRenderer`, así que las dos ramas quedaron consistentes. El eje staff deja de OCULTAR; el deshabilitar-con-motivo por tarjeta es del Plan 20-02.
- `lib/staff-services.ts` exporta **`isServiceStaffed`**, la versión por-servicio del guard sentinel que hasta ahora vivía embebido en el filtro. `bookableServices` delega en ella: mismo resultado, una sola definición de "cubierto por staff".
- El **eje franja tiene test contra datos reales**: `test/schedule-coverage-public.test.ts` lee la vista con **anon key y sin sesión** (la ruta real del público, no `t.admin`) y comprueba que un servicio mapeado da `isServiceScheduled=true`, uno huérfano `false`, y con la puente vacía los dos `true`.

## Task Commits

Cada task se commiteó atómicamente:

1. **Task 1: RSC — 8va query + prop + catálogo sin pre-filtrar (D-05)** — `7904fa3` (feat)
2. **Task 2: `isServiceStaffed` exportada y reusada por `bookableServices`** — `6672563` (refactor)
3. **Task 3: `test/schedule-coverage-public.test.ts`, eje franja con anon key** — `168ba93` (test)

## Files Created/Modified

- `app/[slug]/page.tsx` — 8va query de la vista con comentario denso (qué vista, por qué no se abre la tabla base a `anon`, quién la consume, por qué el fail-safe degrada al comodín); prop `timeBlockServices`; `services` sin pre-filtrar + comentario que deja explícito el cambio de comportamiento aceptado.
- `lib/staff-services.ts` — `isServiceStaffed` nueva (guard sentinel + delegación en `isServiceCovered`); `bookableServices` reescrita para delegar; cabecera actualizada anotando que `page.tsx` ya no la llama.
- `app/[slug]/booking-client.tsx` — **solo** la declaración type-only de la prop opcional `timeBlockServices` (ver desviación).
- `test/schedule-coverage-public.test.ts` — **nuevo**: 2 casos DB-backed sobre el eje franja con cliente anon sin sesión.
- `test/service-coverage-public.test.ts` — **solo** el docstring de cabecera (que decía que `page.tsx` filtra con `bookableServices`, ya falso). Los 3 `it(...)` y todas sus aserciones intactos: `git diff` no toca ni una línea con `expect(`.

## Decisions Made

- **`isServiceStaffed` como fuente única del guard sentinel.** El `activeProfessionals.length === 0` dejó de existir dentro de `bookableServices`. Alternativa descartada: copiar el `length === 0` inline en `booking-client.tsx` — sería una segunda interpretación de "cubierto por staff", que es exactamente cómo la pantalla y el motor terminan diciendo cosas distintas sobre el mismo servicio (AGENDA-02).
- **La prop `timeBlockServices` es opcional.** El `LandingRenderer` tiene un `<BookingClient>` de fallback (para el preview del panel) que no la pasa; hacerla obligatoria habría roto ese call site sin ningún beneficio.
- **AGENDA-07 queda SIN marcar como completo.** Este plan solo prepara el dato; el criterio del requisito es visible al público (el selector explica el vacío) y lo cierra el Plan 20-02. Marcarlo ahora sería declarar hecho algo que el usuario final todavía no ve — el mismo modo de falla que la fase viene a matar. `requirements-completed: []` a propósito.
- **El fail-safe se documentó como direccional.** Si la lectura de la vista fallara, el `|| []` deja la puente vacía ⇒ regla del comodín ⇒ todo servicio agendado: degrada al comportamiento de hoy, nunca a apagar el catálogo (Pitfall 5 del research, T-20-03 del threat model).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `app/[slug]/booking-client.tsx` tocado para que el RSC compile**

- **Found during:** Task 1 (RSC — 8va query + prop)
- **Issue:** El plan pedía pasar `timeBlockServices` a `BookingClient` "sin tocar todavía ni un pixel de `booking-client.tsx`", pero el `Props` del componente no declara esa prop, así que el JSX no compila: `TS2322: Property 'timeBlockServices' does not exist on type 'IntrinsicAttributes & Props'`. Las dos exigencias del propio plan (prop en el JSX **y** `tsc --noEmit` exit 0) no podían coexistir sin declararla.
- **Fix:** Cambio **type-only**, mínimo: `TimeBlockService` sumado al `import type` existente y `timeBlockServices?: TimeBlockService[]` agregado al `interface Props` con su comentario. **No se desestructura ni se consume**, no se tocó una línea de JSX ni de lógica — el consumo (derivación `serviceBlocks`, `disabled` + motivo) sigue siendo del Plan 20-02. Opcional porque el `<BookingClient>` de fallback del `LandingRenderer` no la pasa.
- **Files modified:** `app/[slug]/booking-client.tsx`
- **Verification:** `./node_modules/.bin/tsc --noEmit` exit 0 (fallaba antes del fix, con el error citado); `npx eslint` limpio sobre el archivo.
- **Committed in:** `7904fa3` (commit del Task 1)
- **Impacto en el frontmatter del plan:** `files_modified` quedó desactualizado — son **5** archivos, no 4. Aprobado explícitamente por el coordinador.

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** El fix es el mínimo necesario para que el objetivo declarado del plan compile. Cero scope creep: la superficie de `booking-client.tsx` que el Plan 20-02 va a tocar queda intacta.

### Fuera de alcance (detectado, NO tocado)

- El hook de diseño reporta `broken-image` en `app/[slug]/booking-client.tsx` (`<img src={pro.photo_url}>`). **Falso positivo y preexistente:** el `<img>` está guardado por `pro.photo_url ?` y tiene su rationale documentado + `eslint-disable` deliberado (no migra a `next/image` porque exigiría `remotePatterns` global). No se tocó ni se silenció.

## Issues Encountered

- **Docker Desktop caído bloqueó la verificación DB-backed (~6 días de pausa).** `npx vitest run test/service-coverage-public.test.ts` fallaba con `seed: createUser falló: fetch failed`: `.env.test.local` apunta la suite al Supabase LOCAL (127.0.0.1) y el daemon estaba abajo. Se intentó automatizar (lanzar `Docker Desktop.exe` y polear `docker info` ~15 min): los procesos levantaban pero el daemon nunca quedaba listo — necesita interacción en la GUI. Se devolvió un checkpoint `human-action`; el coordinador levantó Docker + `supabase start` (migraciones hasta la 076, sin `db reset`) y la ejecución retomó desde el gate del Task 2. **Lección:** las suites `db` no skipean cuando las creds existen pero el host no responde — fallan, que es lo correcto, pero el mensaje (`fetch failed`) no dice "prendé Docker".
- Nada más: los 3 casos de `service-coverage-public.test.ts` pasaron sin tocar sus aserciones, confirmando que el refactor de `bookableServices` preservó el comportamiento.

## Verificación (los 9 gates del plan)

| # | Gate | Resultado |
|---|------|-----------|
| 1 | `./node_modules/.bin/tsc --noEmit` | exit **0** |
| 2 | Las 2 suites de cobertura pública | **5 passed** (3 staff + 2 franja), 0 failed |
| 3 | `staffBookableServices` / import de `staff-services` en `page.tsx` | **0** y **0** |
| 4 | `public_time_block_services` / `timeBlockServices` en `page.tsx` | **1** y **2** |
| 5 | `^export function ` en `lib/staff-services.ts` | **5** |
| 6 | `git diff -- lib/landing/derive.ts` (D-03 intacto) | vacío |
| 7 | `ls supabase/migrations \| grep -c "^077"` (fence 3) | **0** |
| 8 | Archivos tocados | 5 (los 4 del frontmatter + `booking-client.tsx` por la desviación) |
| 9 | `git diff -- package.json package-lock.json` | vacío |

Extra: `npx eslint` limpio sobre los 5 archivos; `test/suite-split.test.ts` verde (el archivo nuevo cae en el carril `db` serializado, confirmado con `npx vitest run --project db`).

## Known Stubs

Ninguno. La prop `timeBlockServices` llega a `BookingClient` declarada pero **todavía no consumida** — no es un stub sino la costura planificada del plan: el consumidor es el Plan 20-02 (mismo phase), y hasta entonces el comportamiento visible del eje franja es el de hoy (nada se rompe porque la regla del comodín ya cubre el caso).

⚠ **Estado transitorio a cerrar en 20-02:** entre este commit y el Plan 20-02, un servicio sin cobertura de staff **ya no se oculta** (D-05) pero **todavía no se deshabilita** — o sea que queda reservable como antes del gap UAT de la Phase 10. Es una ventana intencional y de corta vida dentro de la misma fase, pero **no debe deployarse a producción sin el Plan 20-02**.

## Threat Flags

Ninguno. La única superficie nueva es una lectura `SELECT` sobre una vista `public_*` que ya existía en producción con sus permisos acotados (migr. 072), consumida con el mismo cliente anon y el mismo filtro por tenant que las otras 7 queries del `Promise.all`. T-20-01 (fuga cross-tenant) queda mitigado por el `.eq('business_id', business.id)` **y verificado contra datos reales** en el Task 3.

## Next Phase Readiness

- **Plan 20-02 desbloqueado:** tiene todo lo que necesita — la prop `timeBlockServices` llegando al componente, el catálogo completo sin pre-filtrar, y las dos funciones booleanas hermanas (`isServiceStaffed` para el eje staff, `isServiceScheduled` para el eje franja) listas para preguntarse por servicio.
- **Pendiente para 20-02:** derivar `serviceBlocks` (D-04, los días mudos de `openDaysSet`), la tarjeta del paso 1 con `disabled` + motivo por los dos ejes (D-02/D-05) copiando el molde del picker de consultorios, y marcar AGENDA-07 como completo recién ahí.
- **Sin deuda de infra:** cero dependencias nuevas, cero migraciones (la próxima libre sigue siendo la 077).

---
*Phase: 20-lo-que-el-publico-ve*
*Completed: 2026-09-10*

## Self-Check: PASSED

Los 5 archivos declarados existen en disco y los 3 commits de task existen en git (`7904fa3`, `6672563`, `168ba93`).
