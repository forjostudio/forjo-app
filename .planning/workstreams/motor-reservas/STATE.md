---
gsd_state_version: 1.0
milestone: v0.24
milestone_name: — Turnos fijos / Abonos recurrentes
status: verifying
stopped_at: Completado 07-12-PLAN.md (12/12 planes de la Phase 07)
last_updated: "2026-07-22T12:45:28.990Z"
last_activity: 2026-07-22
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 40
  completed_plans: 40
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-16)

**Core value:** Un negocio NUNCA puede leer ni modificar datos de otro y los pagos no pueden falsificarse; el núcleo de integridad anti-doble-booking (v0.9/v0.12) no puede regresar. v0.24 agrega abonos semanales (turno fijo recurrente): alta manual por el dueño + generación forward de los turnos respetando 011/013 + cupos + espacio compartido + cancelación por link en el mail / panel. **Solo reserva** (el cobro recurrente es futuro; el modelo se diseña extensible).
**Current focus:** Phase 07 — cancelaci-n-del-abono-mail-panel

## Current Position

Phase: 07
Plan: Not started
Status: Listo para `/gsd:verify-work` y `/gsd:secure-phase 07 --ws motor-reservas`
Last activity: 2026-07-22

**Deploy:** migración **054 YA APLICADA A PRODUCCIÓN** (2026-07-21). Última migración en prod = 054; la próxima debe numerarse **055**. El schema del abono ya no se puede enmendar en el lugar.

## Performance Metrics

**Velocity (workstream, histórico):**

- v0.12 (Phases 1-3, shipped 2026-06-30): 14 plans completados
- v0.22 (Phases 4-5, shipped 2026-07-19): 6 plans completados
- v0.24 (Phases 6-7): 7 plans completados (Phase 6 cerrada)

**By Phase (v0.24):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 6 | TBD | - | - |
| 7 | TBD | - | - |
| 07 | 12 | - | - |

*Updated after each plan completion*
| Phase 06 P01 | 20min | 2 tasks | 3 files |
| Phase 06 P02 | 18min | 2 tasks | 2 files |
| Phase 06 P03 | 22min | 3 tasks | 3 files |
| Phase 06 P04 | 20min | 2 tasks | 2 files |
| Phase 6 P06 | 24min | 4 tasks | 12 files |
| Phase 06 P07 | 13min | 2 tasks | 3 files |
| Phase 06 P05 | 11min | 3 tasks | 7 files |
| Phase 06 P08 | 22min | 4 tasks | 7 files |
| Phase 07 P08 | 26min | 4 tasks | 2 files |
| Phase 07 P09 | 20min | 3 tasks | 5 files |
| Phase 07 P10 | 20min | 3 tasks | 3 files |
| Phase 07 P11 | 11min | 2 tasks | 3 files |
| Phase 07 P12 | 55min | 3 tasks | 1 file |

## Accumulated Context

### Decisions

Decisiones LOCKED de v0.24 (ver REQUIREMENTS.md + PROJECT.md):

- **Solo reserva, sin cobro.** El cobro recurrente automático (MP preapproval por cliente) es milestone FUTURO; v0.24 deja el **modelo de datos extensible** para sumarlo sin re-migrar.
- **Alta manual por el dueño** (no pública en v1), reusando el pipeline de alta de turno existente (validación + anti-tampering de tenant, `.eq('business_id', ...)`, re-validar service/professional/location/cancha).
- **Recurrencia semanal** (mismo día y hora), **indefinido hasta cancelar**. No quincenal/mensual en v1.
- **Generación forward** = ventana rolling de N semanas, primera tanda al crear el abono + extendida por el **cron DIARIO existente** de Vercel (Hobby: sin crons más frecuentes).
- **Cancelación** por **link en el mail** (token a nivel serie, patrón del cancel-token de turno actual) + **baja desde el panel** del dueño.
- **Faseo por integridad:** Phase 6 (modelo + alta + generación forward, núcleo anti-doble-booking → **secure-phase**) → Phase 7 (cancelación mail + panel).

Heredadas del workstream (siguen vigentes):

- Núcleo anti-doble-booking = RPC atómico `book_slot_atomic` (cupos capacity-aware + advisory lock por espacio compartido). La generación forward del abono DEBE insertar por este mismo camino atómico, nunca por insert directo.
- Cupo por `time_blocks.capacity` (default 1 = cero regresión); público ve "disponible/lleno" sin lugares restantes.
- [Phase 06]: book_slot_atomic intacto: abono_id se setea con UPDATE post-insert fuera del RPC (etiqueta no-constraint)
- [Phase 06]: schema.sql editado quirúrgicamente (no dump) porque el CLI v2.107 reordena el archivo entero
- [Phase ?]: 06-02: motor de abono materializa cada ocurrencia vía createAppointmentCore (nunca insert directo); skip-and-record ante conflicto
- [Phase ?]: 06-02: schedule_exception closed=false (horario especial) OVERRIDE la grilla semanal para ese dia (autoridad unica de horario)
- [Phase ?]: 06-03: endpoint POST /api/abonos/create valida professional/service/location por business_id y deriva serviceId de la cancha server-side (anti-tampering); insert anon+RLS, nunca admin
- [Phase ?]: 06-03: el alta persiste generated_until + skipped_occurrences.slice(-50) (cap compartido con el cron 06-04) tras correr la primera tanda por el motor
- [Phase ?]: D-06': el abono NO se gatea por horario semanal (solo day_closed); el core anti-doble-booking queda intacto
- [Phase ?]: D-07': duracion por abono (total_occurrences null=indefinido / N=finito) + status completed; un choque no consume sesion
- [Phase ?]: D-09': el detalle del abono muestra el ultimo turno REAL de la serie, no generated_until
- [Phase ?]: 06-07: el arreglo del Select-dentro-del-Drawer vive en la capa compartida (contexto con el nodo del DrawerContent + container del Portal); fuera de un drawer NO se pasa container, cero regresion en los 9 archivos que usan Select
- [Phase ?]: Migración 054 APLICADA A PRODUCCIÓN (2026-07-21): última migración en prod = 054, la próxima debe ser 055; el schema del abono ya no se puede enmendar en el lugar
- [Phase ?]: Checkpoint 06-05 (human-verify, blocking) APROBADO tras 3 rondas de UAT; los hallazgos se cerraron en planes propios (06-06 D-06'/D-07'/D-09' · 06-07 portal del Select dentro del Drawer) sin re-abrir planes cerrados
- [Phase 06]: GAP-01 cerrado en 3 capas: clamp server-side 1..52 en los dos callers (la correccion real), motor con validacion de formato + tope de 520 iteraciones, y CHECK en la migracion 055 tras normalizar los valores existentes — La ventana era owner-writable sin techo y dimensionaba el loop del motor dentro del cron diario COMPARTIDO por todos los tenants: un dueno podia colgar la generacion de todos
- [Phase 07]: 07-08: la unicidad del cancel_token del abono la garantiza la BASE (migracion 056, indice UNIQUE) y no el default gen_random_uuid() — WR-03: appointments ya tenia su indice unico; abonos quedo sin el en la 054. La credencial de la via publica de baja no puede depender de la suerte del default
- [Phase 07]: 07-08: migracion de constraint sobre datos existentes = verificacion previa con DO $$ + RAISE EXCEPTION accionable ANTES del DDL idempotente — CREATE UNIQUE INDEX sobre una tabla con duplicados falla con un error generico de Postgres que no dice que hacer
- [Phase 07]: 07-09: los dos mails de la baja publica salen fuera del request path con after(), unificando el criterio con la via del panel — la respuesta deja de depender de la latencia de Resend
- [Phase 07]: 07-09: el numero que informa la pantalla publica de baja sale SIEMPRE de la respuesta del servidor; el preview server-rendered es solo la estimacion del momento de la carga
- [Phase 07]: 07-09: el color de texto sobre el acento del negocio se deriva de la luminancia WCAG (lib/contrast.ts) y el foco visible usa tokens del design system, porque con acentos de luminancia intermedia ningun candidato llega a 4.5:1
- [Phase 07]: 07-10: la credencial de baja del abono NO viaja en el payload de /abonos; sale de GET /api/abonos/cancel-link/[id] con la sesion del dueno, una serie por vez y solo al tocar el boton — el token no rota ni vence (D-09): repartirlo en cada render dejaba una fuga permanente en HTML serializado, cache y cualquier captura de DOM (WR-07/D-25)
- [Phase 07]: 07-10: los agregados por serie del panel usan count exact + limit(1) y el preview se acota con gte(date, cutoff) — traer todas las filas historicas para contarlas en memoria podia recortarse EN SILENCIO por el tope de filas de PostgREST y hacer que el dialogo subestimara el alcance de una baja irreversible (WR-06)
- [Phase 07]: 07-12: el anti-avalancha de la baja del abono (D-14/T-07-15) queda verificado por un test de CARRERA REAL contra la DB local (Promise.all de dos POST sobre el mismo cancel_token → 1 mail al cliente + 1 aviso al dueño), no por lectura de codigo — un doble del cliente Supabase no puede probar el gate atomico que serializa las dos requests
- [Phase 07]: 07-12: para testear un route handler que despacha efectos con after() de Next 16 se mockea next/server PARCIALMENTE (importOriginal) reemplazando solo after por un ejecutor que guarda la promesa del callback; sin eso el handler tira porque en Vitest no hay request scope
- [Phase 07]: 07-12: la prueba de mutacion del gate atomico que pedia el plan NO quedo evidenciada (el ejecutor original se colgo en el watchdog del harness al entrar a Task 3 y no dejo registro); se reporta como PENDIENTE para secure-phase, no como cumplida

### Pending Todos

1 pendiente:

- **[database]** Cupo por solape: con `capacity > 1` el control de sobrecupo cuenta por hora de inicio exacta y no por solape, asi que turnos escalonados que se pisan superan el cupo (reproducido: cupo 2 + 4 turnos simultaneos). El `EXCLUDE` anti-solape se apaga con `is_group = (capacity > 1)` y el conteo del RPC solo mira `date + time`. Requiere decidir la semantica de cupo (clase grupal = por hora de inicio, correcto hoy · recurso simultaneo = por solape, roto), y toca `book_slot_atomic`, la asignacion de `seat` y la granularidad del advisory lock. **NO es quick task** — fase propia + secure-phase. Ver `todos/pending/2026-07-22-cupo-por-solape-*.md`.

### Blockers/Concerns

- **[Phase 6 — migración]** Migración nueva **054** (idempotente, numerada) crea la tabla del abono (recurring booking) + el vínculo turno→abono, con RLS habilitada + policies por operación con `with check` por `business_id`/`owner_id`. Baseline de migraciones: última aplicada = **053** (`mp_connection_status`, v0.23) → la próxima es **054**. Se aplica **A MANO** al Supabase de prod, coordinada con el deploy (+ `NOTIFY pgrst, 'reload schema'` si toca cache) — **NO** por el flujo GSD. Diseñar el esquema **extensible** para cobro recurrente futuro sin re-migrar.
- **[Phase 6 — integridad]** La generación forward inserta cada ocurrencia por el RPC atómico existente (capacity-aware + advisory lock por espacio) → cero grieta de doble-booking / sobrecupo / conflicto de espacio bajo concurrencia con reservas públicas o manuales. **secure-phase obligatorio.**
- **[Phase 6 — cron]** La extensión de la ventana corre en el **cron diario existente** (`vercel.json` → `0 3 * * *`, `/api/cron/cancel-expired` o un cron análogo). Vercel Hobby NO permite crons más frecuentes que diario — no agregar ninguno.
- **[Phase 6 — comportamiento]** Manejo exacto de una ocurrencia que choca (turno existente / día cerrado / excepción de horario): saltear y/o avisar — **cerrar en discuss-phase**.
- **[Phase 7 — token]** El token del link de cancelación debe scopear a la serie correcta (no adivinable + `timingSafeEqual`, patrón del cancel-token de turno) sin permitir cancelar el abono de otro tenant.
- **[Phase 7 — turnos ya generados]** Qué pasa con los turnos futuros ya generados al dar de baja (cancelarlos o dejarlos), consistente entre baja por mail y por panel — **cerrar en discuss-phase**.
- [Phase 7 — deploy] RESUELTO (2026-07-22): las migraciones **055** y **056 ya estan APLICADAS en produccion** (confirmado por el operador). Pre-check previo: 0 cancel_token duplicados en prod, por eso el indice UNIQUE entro limpio. La proxima migracion del repo es la **057**.
- [Phase 7 — mails sin verificar en prod] `RESEND_API_KEY` esta **vacia** en `.env.local`, asi que en local no sale ningun mail (verificado contra api.resend.com: HTTP 401). El test 10 de la UAT quedo BLOCKED: la entrega real de los dos mails de baja y el render del HTML escapado (WR-02) siguen **sin verificar en produccion**. El escapado si esta cubierto por los 21 casos de `test/abono-cancel-email.test.ts`.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260722-n3a | Cerrar pendientes de la UAT de la fase 07: catch de red en copyCancelLink, enmienda de D-14/D-15, comentario de cancel/route.ts y disposicion de T-07-19 | 2026-07-22 | c23257e | [260722-n3a-cerrar-pendientes-de-la-uat-de-la-fase-0](./quick/260722-n3a-cerrar-pendientes-de-la-uat-de-la-fase-0/) |
| 260722-nll | El abono finito cuyas N sesiones entran en la ventana ya no se archiva al crearlo: Activos incluye las series completed con turnos futuros (fix solo de UI, semantica del status intacta) | 2026-07-22 | d4e4bc7 | [260722-nll-un-abono-finito-cuyas-n-sesiones-entran-](./quick/260722-nll-un-abono-finito-cuyas-n-sesiones-entran-/) |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Abono | Cobro recurrente automático (MP preapproval por cliente) — modelo queda extensible | milestone futuro | 2026-07-20 |
| Abono | Recurrencia no-semanal (quincenal / mensual / custom) | v2 | 2026-07-20 |
| Abono | Alta pública del abono por el cliente (desde `/[slug]`) | v2 | 2026-07-20 |
| Abono | Waitlist si el slot del abono está ocupado | v2 | 2026-07-20 |
| Abono | Editar / reprogramar una serie viva (cambiar día/hora) | v2 | 2026-07-20 |
| Ventana | Anticipación **mínima** (espejo del máximo) | v2 | 2026-07-18 |
| Ventana | Ventana **por servicio** (se eligió global por negocio) | v2 | 2026-07-18 |
| Alta manual | Seña en el alta manual (MANUAL-04) | v2 | 2026-06-25 |
| Plan | Enforcement server-side de límites de plan ([[plan-model-agendas]]) | backlog | 2026-07-18 |

## Session Continuity

Last session: 2026-07-22T12:36:59.603Z
Stopped at: Completado 07-12-PLAN.md (12/12 planes de la Phase 07)
Resume file: None

## Operator Next Steps

- Planificar la primera fase: `/gsd-plan-phase 6 --ws motor-reservas`
- Phase 6 es **security-sensitive** (secure-phase obligatorio): toca el núcleo anti-doble-booking + crea entidad de tenant nueva (migración 054).
