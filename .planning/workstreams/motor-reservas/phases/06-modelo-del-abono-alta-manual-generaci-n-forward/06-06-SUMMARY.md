---
phase: 06-modelo-del-abono-alta-manual-generaci-n-forward
plan: 06
subsystem: api
tags: [typescript, supabase, next-16, abonos, motor-generacion, cron, ui, dashboard, multi-tenant, vitest]

# Dependency graph
requires:
  - phase: 06-01-modelo-del-abono
    provides: "migración 054 (tabla abonos + appointments.abono_id + businesses.abono_window_weeks) — se EDITA acá porque aún no está en prod"
  - phase: 06-02-motor-generacion-forward
    provides: "generateAbonoOccurrences({supabase,business,abono,fromDate,toDate}) → {created, skipped}; motor PURO sobre createAppointmentCore"
  - phase: 06-03-alta-manual
    provides: "app/api/abonos/create (anti-tampering por business_id, primera tanda, persistencia de generated_until + skipped)"
  - phase: 06-04-cron-extension-ventana
    provides: "extendAbonoWindows(supabase) piggyback en el cron diario (idempotencia forward + cap de skipped)"
  - phase: 06-05-ui-abonos
    provides: "app/(dashboard)/abonos (page + client) y components/dashboard/nuevo-abono-form.tsx"
provides:
  - "Modelo de duración del abono: abonos.total_occurrences int null (null=indefinido / N=finito) + status 'completed' como estado terminal del finito"
  - "Motor sin guarda de horario semanal (D-06′): sólo saltea por day_closed (excepción closed=true) o por conflicto real del core; acepta maxCreated para acotar la tanda"
  - "Convergencia del finito a N turnos REALES: maxCreated = N − generados (conteo de appointments no cancelados por abono_id), compartido por el alta y el cron"
  - "UI: control Duración (Indefinido / N sesiones) en el alta y detalle con 'Último: <fecha del último turno real>' + 'Sesiones: X de N' (D-09′)"
affects: [07-cancelacion-serie]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Revisión de decisión lockeada con migración NO deployada: se EDITA la migración en su lugar (054) en vez de agregar una nueva — sólo válido mientras prod siga en 053"
    - "maxCreated como tope (nunca como forzador): el motor corta el loop al juntar N turnos creados; los choques no incrementan `created`, así que un conflicto no consume sesión"
    - "Progreso del finito = conteo contra la DB (appointments no cancelados por abono_id), NO result.created.length — el `continue` de idempotencia del motor no incrementa `created`"
    - "Criterio 'completed' idéntico y duplicado a propósito en los dos puntos de escritura (alta + cron), igual que SKIPPED_CAP y toISODate"
    - "UI de duración con radios nativos + stepper: mismo patrón que la Ventana de reserva de la Agenda (accent-primary, Label clickeable, sub-campo revelado con sangría pl-7)"
    - "Fecha del último turno real derivada en el Server Component (max date de appointments no cancelados por abono, comparación lexicográfica de ISO 'yyyy-MM-dd'), acotada por business_id"

key-files:
  created: []
  modified:
    - supabase/migrations/054_abonos.sql
    - supabase/schema.sql
    - lib/types.ts
    - lib/abono-generation.ts
    - test/abono-generation.test.ts
    - app/api/abonos/create/route.ts
    - test/abono-create.test.ts
    - app/api/cron/cancel-expired/route.ts
    - test/abono-cron.test.ts
    - components/dashboard/nuevo-abono-form.tsx
    - app/(dashboard)/abonos/abonos-client.tsx
    - app/(dashboard)/abonos/page.tsx

key-decisions:
  - "D-06′: el abono del dueño deja de gatearse por la grilla semanal (se elimina el skip out_of_hours, la lectura de time_blocks y el narrowing de horario especial closed=false); se conserva sólo day_closed. Razón: el alta manual de turno suelto tampoco chequea horario, el abono era MÁS restrictivo que poner un turno a mano"
  - "D-07′: la duración vive por abono (total_occurrences), no a nivel negocio; businesses.abono_window_weeks queda como horizonte rolling de los INDEFINIDOS y como tope de seguridad por corrida de los finitos"
  - "El finito busca N turnos REALES: un choque no consume sesión y un turno cancelado deja de contar (se regenera en la próxima ventana); la convergencia la da el conteo contra la DB + la idempotencia del rolling"
  - "Techo defensivo MAX_TOTAL_OCCURRENCES = 520 en el endpoint (10 años de abono semanal): un valor fuera de rango degrada a INDEFINIDO (dirección segura), nunca a 'más sesiones de las pedidas'. El form clampea 1..520 para que ese degradado no ocurra en silencio"
  - "El cron resuelve el finito ANTES del corte por ventana cubierta: un abono que ya llegó a N tiene la ventana cubierta y, saliendo por ese continue, nunca se marcaría 'completed'"
  - "D-09′: el detalle muestra el ÚLTIMO TURNO REAL (max date de la serie), no generated_until — que es la frontera de la ventana y cae cualquier día de la semana (por eso un abono de los jueves mostraba un martes)"
  - "La lista pasa a incluir los abonos 'completed' (con chip Completado): siguen teniendo turnos en la agenda y el dueño necesita verlos; sólo se ocultan los 'cancelled'"

patterns-established:
  - "Cierre post-UAT: las revisiones se lockean en <revisions> del CONTEXT (D-06′/D-07′/D-09′) y se ejecutan en un plan de cierre propio (gap_closure) en vez de re-abrir los planes ya cerrados"

requirements-completed: [ABONO-02, ABONO-07]

# Metrics
duration: 24min
completed: 2026-07-20
status: complete
---

# Phase 6 Plan 06: Cierre post-UAT del abono (horario, finito/indefinido, Último) Summary

**El abono deja de gatearse por la grilla semanal (sólo saltea por día cerrado o por conflicto real del core) y pasa a tener duración propia: `abonos.total_occurrences` null=indefinido / N=finito, con `status='completed'` al juntar sus N turnos REALES — el motor acepta `maxCreated`, el alta y el cron comparten el mismo conteo contra la DB (`maxCreated = N − generados`) y un choque NO consume sesión. En el panel se elige la duración al crear (Indefinido / N sesiones) y el detalle muestra "Último: <fecha del último turno real>" (en el día de la semana del abono) + "Sesiones: X de N". 32 tests de abonos en verde.**

## Performance

- **Duration:** ~24 min (23:35 → 23:59 ART)
- **Started:** 2026-07-21T02:35:10Z
- **Completed:** 2026-07-21T02:58:49Z
- **Tasks:** 4
- **Files modified:** 12

## Accomplishments

- **D-06′ — el abono no es más restrictivo que un turno a mano:** se eliminó del motor la lectura de `time_blocks`, el narrowing de horario especial `closed=false` y la rama `else` de la grilla semanal. La guarda pre-core quedó reducida a un único caso: excepción con `closed=true` → skip `day_closed`. Una ocurrencia a las 21:00 sin `time_block` ahora SE GENERA (test explícito).
- **D-07′ — duración por abono:** migración 054 EDITADA en su lugar (prod sigue en 053) con `total_occurrences int` (`null` o `> 0`) y el check de `status` ampliado a `('active','cancelled','completed')`. El motor acepta `maxCreated` y corta el loop al alcanzarlo; el alta genera la primera tanda con `maxCreated = N` y el cron con `maxCreated = N − generados`, marcando `completed` cuando el conteo real llega a N.
- **D-09′ — display honesto:** el detalle muestra el último turno REAL de la serie (que siempre cae en el día de la semana del abono) en vez de `generated_until`, más `Sesiones: X de N` y `Duración` en los finitos.
- **Núcleo anti-doble-booking intacto:** quitar una guarda PRE-core no relaja 011/013/cupo/espacio (un slot tomado sigue devolviendo `slot_taken`), y `total_occurrences` es metadata que no participa de ninguna constraint.

## Task Commits

1. **Task 1: Migración 054 (editar) + schema + tipos** — `2676d0c` (feat)
2. **Task 2: Motor sin `out_of_hours` + `maxCreated`** — `219519f` (test, RED) → `5540f53` (feat, GREEN)
3. **Task 3: Alta + cron finito/indefinido** — `1a5a28f` (test, RED) → `84f4a58` (feat, GREEN)
4. **Task 4: UI — Duración + "Último" / "Sesiones X de N"** — `fe4304a` (feat)

**Plan metadata:** este SUMMARY + STATE/ROADMAP (docs).

## Files Created/Modified

- `supabase/migrations/054_abonos.sql` — `abonos.total_occurrences` + `status` con `'completed'` (migración EDITADA, aún NO aplicada a prod).
- `supabase/schema.sql` — diff quirúrgico de la 054 (sin reordenar el dump).
- `lib/types.ts` — `Abono.total_occurrences: number | null`; `status: 'active' | 'cancelled' | 'completed'`.
- `lib/abono-generation.ts` — sin lectura de `time_blocks` ni skip `out_of_hours`; guarda reducida a `day_closed`; nuevo input `maxCreated` que corta el loop.
- `test/abono-generation.test.ts` — caso `out_of_hours` REEMPLAZADO por "21:00 fuera de la grilla SÍ se genera"; `day_closed` conservado; nuevo caso `maxCreated=2` sobre 5 semanas.
- `app/api/abonos/create/route.ts` — narrowing de `totalOccurrences` (entero 1..520 → finito; el resto → indefinido), persistencia, `maxCreated = N` en la primera tanda, `status='completed'` si ya juntó N, helper `countAbonoAppointments` acotado por `business_id`.
- `app/api/cron/cancel-expired/route.ts` — `extendAbonoWindows` procesa sólo `active`; por abono finito cuenta generados reales, marca `completed` (antes del corte por ventana cubierta) o genera con `maxCreated = N − generados`.
- `test/abono-create.test.ts`, `test/abono-cron.test.ts` — cobertura del finito (alta, convergencia por cron, no re-tocar `completed`) manteniendo secreto/aislamiento.
- `components/dashboard/nuevo-abono-form.tsx` — control **Duración** (radios nativos `accent-primary` + stepper 1..520, patrón de la Ventana de reserva de la Agenda); postea `totalOccurrences: N | null`; copy del aviso y del helper adaptados al modo elegido.
- `app/(dashboard)/abonos/page.tsx` — la query de `appointments` trae `date` → conteo + fecha del último turno real por abono (todo `.eq('business_id', business.id)`); el select de `abonos` suma `total_occurrences`.
- `app/(dashboard)/abonos/abonos-client.tsx` — detalle con `Duración`, `Sesiones: X de N`, `Último` (fecha real) y `Estado: Completado`; la lista incluye `completed` con chip y muestra "N sesiones" / "X de N" en finitos; helper de la ventana aclarado ("abonos indefinidos"); label muerto `out_of_hours` eliminado.

## Decisions Made

Ver `key-decisions` del frontmatter. Las tres decisiones estructurales (D-06′, D-07′, D-09′) venían lockeadas del UAT del checkpoint 06-05; las decisiones NUEVAS tomadas en ejecución fueron: el techo defensivo de 520 sesiones con degradado a indefinido, resolver el finito antes del corte por ventana cubierta en el cron, contar contra la DB en lugar de confiar en `result.created.length`, y mostrar los abonos `completed` en la lista.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Techo defensivo de `totalOccurrences` (520) en el endpoint**
- **Found during:** Task 3 (alta)
- **Issue:** El plan pedía "entero > 0 → finito". Sin techo, un `totalOccurrences` forjado de 1e10 pasa el narrowing y revienta el INSERT (`int` de Postgres) con un 500 inútil; además deja el finito sin orden de magnitud sano (DoS blando sobre el cron, T-06-24).
- **Fix:** `MAX_TOTAL_OCCURRENCES = 520` (10 años de abono semanal). Fuera de rango degrada a **indefinido** (dirección segura, comportamiento previo a la feature), nunca a más sesiones de las pedidas.
- **Files modified:** `app/api/abonos/create/route.ts`
- **Verification:** `test/abono-create.test.ts` (valores absurdos → `total_occurrences` null)
- **Committed in:** `84f4a58`

**2. [Rule 1 - Bug] El cron nunca marcaría `completed` a un finito con la ventana ya cubierta**
- **Found during:** Task 3 (cron)
- **Issue:** `extendAbonoWindows` corta con `continue` cuando `fromDate > toDate` (ventana cubierta). Un finito que ya llegó a N SIEMPRE está en ese estado → salía por el `continue` antes de evaluarse y quedaba `active` para siempre, re-consultado cada día.
- **Fix:** el bloque del finito (conteo → `completed` / `maxCreated`) se resuelve ANTES del corte por ventana cubierta.
- **Files modified:** `app/api/cron/cancel-expired/route.ts`
- **Verification:** `test/abono-cron.test.ts` (el cron completa un finito y no lo vuelve a tocar)
- **Committed in:** `84f4a58`

**3. [Rule 1 - Bug / dead code] Label muerto `out_of_hours` en el diccionario de razones de salteo**
- **Found during:** Task 4 (UI)
- **Issue:** `SKIP_REASON_ES` seguía mapeando `out_of_hours: 'Fuera de horario'` — razón que el motor dejó de emitir en Task 2 (D-06′). Código muerto que sugería un comportamiento inexistente.
- **Fix:** entrada eliminada + comentario explicando por qué ya no existe. Se conservan `day_closed`, `slot_taken`, `slot_full`, `space_conflict` y los de validación.
- **Files modified:** `app/(dashboard)/abonos/abonos-client.tsx`
- **Verification:** `npx eslint` + `npx tsc --noEmit` limpios; el fallback `?? 'Conflicto'` cubre cualquier razón desconocida.
- **Committed in:** `fe4304a`

**4. [Rule 2 - Missing Critical] Clamp 1..520 en el input de sesiones del form**
- **Found during:** Task 4 (UI)
- **Issue:** El form podía mandar un valor que el server degrada a indefinido sin que el dueño se entere (crea "10000 sesiones" y le queda un abono infinito).
- **Fix:** `clampSessions()` espeja el techo del endpoint; el stepper se deshabilita en los bordes.
- **Files modified:** `components/dashboard/nuevo-abono-form.tsx`
- **Verification:** `npx tsc --noEmit` + `npx eslint` limpios; el server sigue siendo la autoridad (re-valida igual).
- **Committed in:** `fe4304a`

**5. [Rule 2 - Missing Critical] Los abonos `completed` se mostraban como si no existieran**
- **Found during:** Task 4 (UI)
- **Issue:** La lista filtraba `status === 'active'`. Con el nuevo estado terminal, un abono completado (con sus turnos vivos en la agenda) desaparecía del panel sin explicación.
- **Fix:** el filtro pasa a `status !== 'cancelled'` y el completado se marca con chip "Completado" (+ `Estado` en el detalle). Título de la card: "Abonos activos" → "Tus abonos".
- **Files modified:** `app/(dashboard)/abonos/abonos-client.tsx`
- **Verification:** `npx tsc --noEmit` + `npx eslint` limpios; pendiente de la re-verificación visual del usuario.
- **Committed in:** `fe4304a`

---

**Total deviations:** 5 auto-fixed (2 bugs, 3 funcionalidad crítica faltante)
**Impact on plan:** Todas necesarias para corrección/seguridad o para que la feature sea comprensible en el panel. Sin scope creep: nada fuera de los 12 archivos declarados en el plan.

## Issues Encountered

- El motor NO incrementa `created` cuando la ocurrencia ya estaba materializada (`continue` de idempotencia). Confiar en `result.created.length` para decidir `completed` habría hecho que el finito se pasara de N en cada re-run. Resuelto contando los turnos reales contra la DB en los dos puntos de escritura (alta y cron), con el mismo helper duplicado a propósito.
- `generated_until` no sirve como "hasta cuándo llega el abono": es la frontera de la ventana rolling y cae cualquier día de la semana — el bug reportado en el UAT. Resuelto derivando el máximo `date` de los turnos reales en el Server Component.

## Verification

- `npx tsc --noEmit` — limpio.
- `npx eslint "app/(dashboard)/abonos" components/dashboard/nuevo-abono-form.tsx` — limpio (los ~10 errores react-hooks de `settings-client.tsx` son PRE-EXISTENTES y ajenos a este plan).
- `npx vitest run test/abono-generation.test.ts test/abono-create.test.ts test/abono-cron.test.ts --no-file-parallelism` — **32/32 en verde**.
- `supabase db reset` — replay del baseline + 040..054 idempotente (Task 1).
- `grep -E "out_of_hours" lib/abono-generation.ts` → vacío.
- Regla dura intacta: sin `.rpc('book_slot_atomic')` ni `.from('appointments').insert` en el motor.

## Threat Flags

Ninguno nuevo. Las 4 amenazas del `<threat_model>` del plan (T-06-22 a T-06-25) quedaron mitigadas: el core sigue atómico, `maxCreated`/`total_occurrences` sólo acotan (no fuerzan ni participan de constraints), el finito está capado por la ventana por corrida, y toda query nueva (conteo de turnos, último turno) va acotada por `business_id`.

## User Setup Required

**La migración 054 sigue SIN aplicar a prod** (prod = 053). Al deployar hay que correrla a mano, ya con `total_occurrences` + `status 'completed'` incluidos — NO hace falta una migración adicional porque la 054 se editó en su lugar.

## Next Phase Readiness

- Modelo, motor, alta, cron y UI del abono cerrados para v0.24. Listo para la re-verificación visual del usuario (cierre del checkpoint 06-05) y para Phase 7 (baja de la serie, ABONO-05), que ya tiene `cancel_token` a nivel serie y ahora un estado terminal (`completed`) distinto de `cancelled`.
- Fuera de alcance y sin abrir: editar una serie viva, recurrencia no-semanal, alta pública del abono, cobro recurrente (v0.25).

## Self-Check: PASSED

- Archivos declarados: presentes (12 modificados + este SUMMARY).
- Commits declarados: `2676d0c`, `219519f`, `5540f53`, `1a5a28f`, `84f4a58`, `fe4304a` — todos en `gsd/motor-reservas-v024`.

---
*Phase: 06-modelo-del-abono-alta-manual-generaci-n-forward*
*Completed: 2026-07-20*
