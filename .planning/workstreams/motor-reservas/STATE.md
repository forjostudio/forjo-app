---
gsd_state_version: 1.0
milestone: v0.27
milestone_name: — Cupo unificado por servicio
status: verifying
stopped_at: Completado 19-06-PLAN.md — fase 19 lista para verificacion
last_updated: "2026-08-26T13:21:53.828Z"
last_activity: 2026-08-26 -- Phase 19 execution started
progress:
  total_phases: 20
  completed_phases: 19
  total_plans: 98
  completed_plans: 98
  percent: 95
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-16)

**Core value:** Un negocio NUNCA puede leer ni modificar datos de otro y los pagos no pueden falsificarse; el núcleo de integridad anti-doble-booking (v0.9/v0.12) no puede regresar. v0.25 agrega **multi-staff**: el negocio declara qué servicios hace cada persona y el cliente reserva eligiendo profesional **o** "cualquiera", con la asignación automática resuelta **dentro del RPC atómico** `book_slot_atomic` — sin regresión para canchas, abonos, cupos grupales ni espacio compartido.
**Current focus:** Phase 19 — el-panel

## Current Position

Phase: 19 (el-panel) — EXECUTING
Plan: 6 of 6
Status: Phase complete — ready for verification
Last activity: 2026-08-26 -- Phase 19 execution started

## Milestone v0.28 — decisiones LOCKED

- **D-01 Tabla puente con comodín, no columna.** Molde `professional_services` (migr. 057, v0.25):
  **0 filas mapeadas = la franja sirve para cualquier servicio**. Cubre "martes 15-16 cerámica" y
  "mañanas: corte y color, no alisado" sin duplicar bloques superpuestos.

- **D-02 Cero regresión POR CONSTRUCCIÓN.** El día de la migración todos los negocios tienen 0 filas ⇒
  todo comodín ⇒ nada cambia. Misma jugada que `individual` en v0.27.

- **D-03 La franja declara QUÉ, no QUIÉN.** Multi-staff queda afuera; el quién ya lo resuelve
  `professional_services` desde v0.25. Se suma después sin re-migrar.

- **D-04 El onboarding entra**, fusionado con el booking público en la Phase 20.

⚠ **Antes de escribir la migración de la Phase 18: leer la migr. 059** (`public_professional_services`).
v0.25 ya tuvo que crear una **vista acotada** para exponerle un mapeo a `anon` sin abrir la tabla
entera — acá hace falta exactamente lo mismo.

⚠ **Pendiente de seguridad VIVO sobre la misma superficie:** `book_slot_atomic` es ejecutable por
`anon` y saltea la ventana de reserva, el gate de plan y el reCAPTCHA, **que viven sólo en el route
handler** (alta, pre-existente desde la migr. 041). No es de este milestone, pero **cualquier control
que la Phase 18 ponga sólo en el handler hereda el mismo agujero**.

## Milestone v0.27 (SHIPPED 2026-08-24) — decisiones tomadas antes de planificar

- **D-01 Cutover, sin fallback transicional.** `services.capacity` es la única fuente del número desde el día 1; `time_blocks.capacity` deja de decidir (la columna se conserva, no se dropea). No se escribe regla de precedencia en el RPC y no queda deprecación pendiente.
- **D-02 El cutover no afecta a nadie — medido contra PRODUCCIÓN el 2026-08-11:** `select count(*), count(*) filter (where capacity is null), max(capacity) from time_blocks` → **19 bloques · 0 sin capacity · cupo_max 1**. Por eso **no se construye aviso de re-declaración** y el backfill deja de ser un problema. ⚠ El control se corrió a propósito además del `where capacity > 1` (que dio "Success, no rows"): una query que devuelve 0 filas es indistinguible de una que no midió lo que creías — lección de la Phase 14.
- **D-03 R-1 se cierra bloqueando, no reparando.** Cambiar `capacity_mode` con turnos futuros vivos se rechaza en la base con código de dominio propio (molde fail-closed de los gates de las migr. 065/066). Reparar las filas se descartó: puede descubrir turnos que ya se solapan de forma ahora ilegal, y ahí el EXCLUDE aborta la transacción igual, dejando al dueño con un error peor y sin salida.
- ✅ **La 069 YA ESTÁ APLICADA EN PRODUCCIÓN (2026-08-16), y esta vez EN EL ORDEN CORRECTO** — el código
  de los fixes (`3106b82`..`7ad17c2`) estaba deployado antes. **La próxima migración del proyecto es la 070.**
  La 069 cierra los 3 blockers del code review de la Phase 15: una clase grupal ya no se monta encima de
  un turno de otro servicio en la misma agenda (ni al revés), "Cualquiera" + grupal se rechaza en vez de
  partir la clase entre profesionales, y un grupal sobre agenda con espacio mapeado falla cerrado.

- ⚠ **La 068 se aplicó en producción (2026-08-14) FUERA DE ORDEN.** La próxima migración era la 069.
  Se aplicó **fuera del orden que fijaba el runbook** (código primero, migración después). Consecuencia
  medida y auditada (`15-SECURITY.md`, T-15-32): el motor **no** se rompió —el backfill dejó todo en
  `individual` cupo 1, `time_blocks.capacity` en prod ya era todo 1, y la firma del RPC es
  byte-idéntica— pero **crear un servicio nuevo quedó roto** mientras corrió el código viejo, que
  insertaba `group_class` + `capacity 1`, combinación que el CHECK de coherencia rechaza.
  **Se corrigió deployando** (`e95e11f..72c7194`), no con una migración correctiva: una correctiva
  habría tenido que aflojar el CHECK, o sea deshacer D-06.
  **Lección estructural (del auditor):** el runbook declaraba el orden pero no lo hacía *imposible de
  invertir*. La forma correcta era **partir el archivo** — el CHECK de coherencia es la única sentencia
  sensible al orden, así que dejándolo en una migración posterior al deploy, aplicar la primera mitad
  temprano deja de importar.

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
| 08 | 2 | - | - |
| 09 | 2 | - | - |
| 10 | 5 | - | - |
| 11 | 4 | - | - |
| 12 | 4 | - | - |
| 13 | 5 | - | - |
| 14 | 9 | - | - |
| 15 | 5 | - | - |
| 16 | 2 | - | - |
| 18 | 4 | - | - |

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
| Phase 08 P01 (autónomo) | ~18min | 2 tasks | 5 files |
| Phase 08 P08-02 | 22min | 3 tasks | 3 files |
| Phase 12 P01 | 18min | 3 tasks | 6 files |
| Phase 12 P02 | 12min | 3 tasks | 3 files |
| Phase 12 P03 | 12min | 3 tasks | 3 files |
| Phase 12 P04 | 30min | 2 tasks | 2 files |
| Phase 13 P01 | 35min | 3 tasks | 2 files |
| Phase 13 P02 | 20 min | 3 tasks | 10 files |
| Phase 13 P03 | 20min | 3 tasks | 4 files |
| Phase 13 P04 | 15min | 3 tasks | 2 files |
| Phase 14 P01 | 35min | 3 tasks | 5 files |
| Phase 14 P02 | 25 min | 3 tasks | 3 files |
| Phase 14 P03 | ~35 min | 3 tasks | 3 files |
| Phase 14 P04 | 62min | 3 tasks | 8 files |
| Phase 14 P05 | ~30 min | 3 tasks | 3 files |
| Phase 14 P06 | 38min | 2 tasks | 1 files |
| Phase 14 P07 | sesión interactiva | 4 tasks (3 checkpoints humanos) | 0 files de código |
| Phase 14 P08 | 60min | 3 tasks | 5 files |
| Phase 14 P09 | ~70min efectivos (~5h de reloj, partido por el checkpoint humano de 2 rondas) | 3 tasks (1 checkpoint bloqueante) | 7 files |
| Phase 15 P01 | ~47min | 3 tasks | 3 files |
| Phase 15 P02 | ~35min | 3 tasks | 4 files |
| Phase 15 P03 | ~20min | 3 tasks | 3 files |
| Phase 15 P04 | ~25min | 3 tasks | 4 files |
| Phase 15 P05 | ~40min | 3 tasks | 3 files |
| Phase 16 P01 | 15min | 3 tasks | 5 files |
| Phase 16 P02 | 26 min | 3 tasks | 4 files |
| Phase 17 P01 | 34min | 3 tasks | 1 files |
| Phase 17 P04 | 22min | 3 tasks | 3 files |
| Phase 17 P02 | 28min | 2 tasks | 1 files |
| Phase 17 P05 | 48min | 3 tasks | 1 files |
| Phase 17 P03 | 32min | 3 tasks | 1 files |
| Phase 17 P06 | 21min | 2 tasks | 1 files |
| Phase 17 P07 | 12min | 2 tasks | 1 files |
| Phase 17 P08 | 18min | 2 tasks | 1 files |
| Phase 17 P09 | 22min | 2 tasks | 1 files |
| Phase 17 P10 | 28 min | 2 tasks | 1 files |
| Phase 18 P01 | 22min | 2 tasks | 2 files |
| Phase 18 P02 | 18min | 2 tasks | 3 files |
| Phase 18 P03 | 22min | 2 tasks | 3 files |
| Phase 18 P04 | 38min | 2 tasks | 3 files |
| Phase 19 P01 | 12min | 2 tasks | 4 files |
| Phase 19 P02 | 15min | 3 tasks | 2 files |
| Phase 19 P03 | 25min | 2 tasks | 2 files |
| Phase 19 P04 | 20min | 3 tasks | 2 files |
| Phase 19 P05 | 35min | 2 tasks | 1 files |
| Phase 19 P06 | 20min | 2 tasks | 1 files |

## Accumulated Context

### Decisions

Decisiones LOCKED de v0.25 (ver REQUIREMENTS.md + PROJECT.md):

- **Tres conceptos distintos, no confundir:** varias personas = varias agendas (`professionals`, esto es v0.25) · clase grupal = muchos clientes en UNA agenda (`time_blocks.capacity`, funciona hoy) · recurso simultáneo = capacity por solape (roto, **v0.26**). Tres barberos NO son "cupo 3".
- **Mapeo staff↔servicios muchos a muchos en tabla puente propia** (migración **057**). **NO** se reusa `professionals.service_id`: es *single* y es el mecanismo de canchas (migr. 043).
- **Sin mapeo definido = todos capaces de todo** (default sensato, cero regresión, no obliga a configurar).
- **El cliente elige profesional O "cualquiera"** — las dos vías conviven.
- **La asignación automática corre DENTRO del RPC atómico `book_slot_atomic`**, nunca en el cliente ni en dos pasos (leer libres → insertar es una carrera).
- **Estrategia de asignación: el profesional con menos turnos ese día.** Hacerla configurable es v2, sin re-migrar.
- **El profesional asignado se le muestra al cliente** (pantalla de confirmación + mail).
- **Faseo:** 8 modelo+config (no toca el motor) → 9 asignación atómica (**secure-phase obligatorio**) → 10 superficies públicas → 11 backlog chico.
- **Cupo por solape queda FUERA** (v0.26): independiente de multi-staff y sobre el mismo RPC — no se meten dos cambios grandes al núcleo en el mismo ciclo.

- [Phase 08]: 08-01: migración **057** creada (tabla puente `professional_services`: business_id/professional_id/service_id NOT NULL, PK compuesta, ON DELETE CASCADE, RLS + 4 policies por op WITH CHECK por tenant, SIN anon, índice inverso `professional_services_by_service`) — hermana exacta de `agenda_spaces` (042), idempotente. NO toca `professionals.service_id` (canchas 043) ni el motor. Aplicación a prod = MANUAL/out-of-band + `NOTIFY pgrst 'reload schema'`, nunca por GSD.
- [Phase 08]: 08-01: la regla del comodín (D-01, "sin filas = capaz de todo") vive SOLO en `lib/staff-services.ts` (helper puro, 8 tests) — fuente única para la UI (fase 8), el RPC (fase 9) y la grilla pública (fase 10); cero backfill en la DB. `isServiceCovered` = `professionalsForService().length > 0` por construcción (test lo verifica).

Decisiones LOCKED de v0.24 (históricas, siguen vigentes):

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
- [Phase ?]: 08-02: escritura del mapeo profesional×servicio por browser client + RLS + .eq('business_id'), nunca service-role
- [Phase ?]: 08-02: precedencia de toasts D-10 > D-02 acotada al servicio desmarcado; comodín/cobertura consumidos de lib/staff-services
- [Phase 12]: Cupo por modo: capacity_mode DEFAULT 'group_class' (cero regresion, incluidas canchas) y cada modo lee su fuente de cupo (services.capacity vs time_blocks.capacity)
- [Phase 12]: Advisory lock re-granularizado por modo en book_slot_atomic: simultaneo = hash(business_id+service_id+date), resto inalterado; el lock de modo va primero -> orden anti-deadlock preservado
- [Phase 12]: public_services expone solo capacity_mode; capacity (el N de lugares) queda server-side por el no-leak
- [Phase ?]: 12-02: el read-path de disponibilidad cuenta el solape por service_id sin bucketear por profesional (espeja el gate del RPC 062) y devuelve busy vacio en modo simultaneo
- [Phase 12]: 12-03: el campo de cupo N solo existe en modo simultaneo; en clase grupal el cupo vive en time_blocks.capacity y el update escribe capacity=1
- [Phase 12]: 12-03: un servicio simultaneo NO abre el roster grupal del slot; el aviso 'lleno' es POR TURNO (badge N/N por solape) y no por franja (D-11)
- [Phase 12]: 12-03: labels y microcopy del modo de cupo FIJOS para todos los verticales (D-10); el badge dice 'N/N lleno', no 'N/N camillas' — a ratificar en la UAT visual
- [Phase 12]: 12-03: el checkpoint bloqueante de UAT visual se AUTO-APROBO por workflow.auto_advance; los 5 pasos manuales siguen PENDIENTES (ver 12-03-SUMMARY, seccion 'Pendiente de UAT visual')
- [Phase 12]: El warm-up del pool HTTP es parte del test de carrera CUPO-04: sin el, el test pasaba incluso con el lock viejo (falso verde) — createAppointmentCore hace 5 round-trips antes del .rpc; con el pool frio los carriles llegan escalonados y la carrera nunca ocurre
- [Phase 13]: 13-01: columnas de snapshot NULLABLE sin DEFAULT — Un DEFAULT '' ganaria el COALESCE(snapshot, services.…) del fallback de D-05 y lo romperia; service_id es nullable en appointments y abonos
- [Phase 13]: 13-01: el trigger de snapshot sobrescribe SIEMPRE el valor entrante — Si respetara el valor del cliente, un dueño podria insertar por PostgREST con service_price inventado e inflar su facturacion historica (T-13-02)
- [Phase 13]: 13-01: el gate usa IS DISTINCT FROM 'cancelled', no <> — appointments.status es NULLABLE: con <> esas filas evaluan NULL, quedan fuera del EXISTS y ABREN el gate. Verificado en vivo contra PG17 local
- [Phase ?]: 13-02: el fallback snapshot -> join vive SOLO en lib/appointment-service.ts; ningun read-path re-escribe el ternario
- [Phase ?]: 13-02: el embed services() se acepta como objeto O array (supabase-js lo infiere array en selects acotados), para no reintroducir casts por call-site
- [Phase 13]: 13-03: el pre-check del modal de borrado es UX/refuerzo; el gate autoritativo es el trigger de la 065, y onConfirm lanza para que el modal no cierre ante el rechazo tardio
- [Phase 13]: 13-04: los dos triggers de la 065 se prueban por integracion contra el Supabase LOCAL (.env.test.local -> 127.0.0.1:54321): el mecanismo vive en la base, no hay funcion de TS que testear
- [Phase 14]: 14-01 (D-03): los botones desestirados van a la izquierda con self-start, sin justify-end — Replica el precedente ya validado en produccion (settings-client.tsx:1568) en vez de abrir un eje visual nuevo por card en una pantalla con 10+ cards apiladas
- [Phase 14]: 14-01 (D-01): el criterio w-full sm:w-auto se aplico sin excepcion tambien en el panel angosto de Dias especiales — D-01 es LOCKED y explicito sobre no exceptuar por contenedor; el trade-off (ancho-por-contenido dentro de un panel angosto a partir de 640px) queda anotado para la UAT visual del plan 14-07
- [Phase 14]: 14-02: la clasificación de clientes vive en lib/client-status.ts (classifyClient + PAUSED_AFTER_DAYS=60); clientStats y getSuggestion la comparten y ningún umbral literal sobrevive en el componente
- [Phase 14]: 14-02: un <a> estilizado con buttonVariants entra en el criterio D-01 igual que un <Button> — es un botón de acción a todos los efectos y era hermano del de Importar en el mismo grid
- [Phase 14]: 14-03: el rechazo de la serie cancelada en el link de baja reusa el 404 generico existente — un codigo propio convertiria al endpoint en oraculo de existencia (D-09/T-14-08)
- [Phase 14]: 14-03: el gate corta SOLO sobre 'cancelled'; una serie 'completed' sigue entregando su link porque puede tener turnos por delante (T-14-11)
- [Phase 14]: 14-04: el gate de borrado de abonos (migr. 066) rechaza solo status='active' con message 'abono_is_active' sobre ERRCODE P0001 — contrato que mapea la UI del plan 14-06
- [Phase 14]: 14-04: los cleanups de tests que borraban series activas pasan por purgeAbonos() (archivar + borrar); el gate no se relaja para los tests
- [Phase 14]: EXTRA-A: las pildoras Activos/Desactivados salen a components/dashboard/active-tabs.tsx (hook + 2 componentes); el predicado de 'activo' se queda en el call-site y el hook lo usa para el filtro Y los contadores — Tercera aparicion del patron (Servicios, Abonos, Canchas). Compartir el predicado vuelve el invariante estructural en vez de disciplina: el tab ya no puede decir 'Activos (1)' sobre una lista vacia.
- [Phase 14]: Abonos NO se migra al modulo de tabs compartido — Sus tabs son activos/archivados (semantica distinta: 'archivado' incluye series completed sin turnos futuros) y su predicado depende de un conteo, no de un booleano de fila. Forzarlo volveria el tipo generico de mas.
- [Phase 14]: D-15 resuelto: se quita el line-through de la cancha desactivada — Dentro del tab Desactivados todas lo estan, asi que el tachado deja de informar y solo baja la legibilidad. Mismo razonamiento que ya dejo escrito la lista de servicios.
- [Phase 14]: 14-06: la visibilidad del boton de eliminar se deriva UNA vez combinando el predicado del tab con un guard redundante que espeja el gate de la 066 — El predicado de la UI ya era un subconjunto estricto del que la base acepta (isAbonoActivo devuelve activa para todo status='active' sin mirar conteos): no habia que alinear nada, habia que FIJAR el invariante para que un cambio futuro del predicado no haga aparecer el boton sobre una fila que la base rechaza
- [Phase 14]: 14-07 (UAT): dentro de los modales del CRM el chip "Alto" y el "Medio" se ven DEL MISMO COLOR — el `DialogContent` monta en `<DialogPortal>` (raiz del documento) y queda FUERA del `<div class="crm-shell">` de `app/(crm)/layout.tsx:47`, asi que `--danger` cae a `--destructive` y `bg-primary` al primary de la app. Rompe el criterio de D-05. REGRESION de 14-01 (antes `alto` era `bg-secondary` y se distinguia). Efecto colateral: el comentario de `components/crm/confirm-dialog.tsx:200-202` dice que Medio se ve amarillo — nunca se vio amarillo dentro de un modal. Destino: plan 14-08 prioridad 1
- [Phase 14]: 14-07 (UAT): el boton "Eliminar" y el badge "Alto" comparten la familia de `--danger` — DECISION DEL DUEÑO: se deja como esta (D-05 se cumple; el badge es chico y el boton es la accion)
- [Phase 14]: 14-07 (UAT): D-01 NO se reabre — los dos paneles laterales angostos que 14-01 y 14-02 marcaron como riesgo (Agenda → Dias especiales, panel de /clients) se ven deliberados en pantalla
- [Phase 14]: 14-07: **migracion 066 APLICADA EN PRODUCCION el 2026-08-06** (a mano, cero `db push`). Trigger `abonos_block_delete_trg` con `tgenabled='O'`; el rechazo se verifico EN VIVO dentro de una transaccion abortada (`P0001: abono_is_active`, `abonos_block_delete() line 38`). La base quedo ADELANTE del codigo de 14-06, que es el orden correcto. **Ultima migracion en prod = 066**
- [Phase 14]: 14-07: PRODUCCION NO TIENE LIBRO DE MIGRACIONES — `supabase_migrations.schema_migrations` no existe (`42P01`), porque las migraciones se aplican a mano y esa tabla la crea el CLI. El pre-check (a) del runbook de 14-04 NO es ejecutable tal cual; el baseline se lleva por documentacion (STATE/SUMMARY), no por la base
- [Phase 14]: 14-07: verificar un gate de borrado exige FORZAR la fila dentro de una transaccion abortada — un DELETE que no matchea filas sale "Success" sin que el trigger corra, indistinguible de un gate roto (la 1ra corrida en prod se declaro INCONCLUSA por esto)
- [Phase 14]: 14-07: T-14-16 CERRADO end-to-end en navegador (el paso que 14-06 no pudo correr): con el modal abierto se paso la serie a `active` por SQL, el modal NO cerro y salio el toast "No se puede eliminar: la serie sigue activa…"
- [Phase 14]: 14-06: el borrado del abono va por el cliente del navegador (anon+RLS) con filtro por negocio y .select('id'); onConfirm LANZA ante el rechazo tardio — Segunda aplicacion del molde de 13-03: 0 filas sin error = la RLS filtro la fila y es un FALLO, no un exito silencioso; y si el ConfirmDialog no recibe un throw cierra el modal y el rechazo del gate se traga en silencio
- [Phase 14]: 14-08: el scope del shell viaja al portal como CLASE (ShellScopeProvider + portalScopeClass), no reubicando el nodo con container ni moviendo .crm-shell a un ancestro — el popup queda donde estaba (focus trap/scroll lock/stacking intactos) y el default '' deja el className byte-identico fuera del CRM
- [Phase 14]: 14-08: CRM_SHELL_CLASS vive en lib/ SIN 'use client' porque app/(crm)/layout.tsx es Server Component y necesita el VALOR de la constante; los exports de un modulo de cliente llegan al servidor como referencias
- [Phase 14]: 14-08: el scope llega por CONTEXTO y no por prop, para que los 33 call-sites de <DialogContent> no se toquen; alcance acotado al Dialog (el popup del Select NO adhiere) porque es la unica superficie con defecto registrado
- [Phase 14]: 14-09 (UAT punto 1): POLISH-05 CERRADO por el ojo del dueno — dentro de un modal del CRM el chip "Alto" se ve rojo y el "Medio" amarillo, distinguibles a simple vista (con captura). Es la unica evidencia admisible: ninguna asercion de codigo prueba que dos chips se vean de colores distintos
- [Phase 14]: 14-09 (UAT punto 2): el fondo oscuro que los modales del CRM heredaron del scope en 14-08 queda ACEPTADO ("Creo que queda bien") — es un cambio visible pero intencional
- [Phase 14]: 14-09 (UAT punto 3, decision del dueno): el rojo de peligro del confirmar destructivo se acota al CRM. confirmButtonClass(destructive, shellScope) pregunta "hay algun shell activo?" via portalScopeClass() —la MISMA funcion del popup portaleado de 14-08, asi que las dos superficies no pueden divergir—, no "estoy en el CRM?". Reparto real: 5 ConfirmDialog del panel pasan al primario del tema (abonos x2, settings x2, canchas x1) y 10 del CRM conservan --danger (ficha x7, pipeline x1, maintenance-toggle x1, plan-price-card x1). globals.css y themes.css NO se tocaron
- [Phase 14]: 14-09 (UAT punto 3): la diferencia de color que el dueno vio entre abonos y servicios era de ESTADO, no de pantalla — /servicios recibe hideConfirm cuando el pre-check bloquea, y en ese estado computeFooterLayout() no dibuja el boton destructivo y promueve el secundario al primario del tema. Con un servicio no bloqueado mostraba el mismo rojo. Registrado en deferred-items.md para no re-diagnosticarlo
- [Phase 14]: 14-09 (UAT punto 5, decision del dueno): en mobile el segmentado de preseleccion va a ANCHO COMPLETO pero prolijo (opciones apiladas y estiradas = segmentado deliberado), no ancho-de-contenido en todos los anchos; desde sm vuelve exactamente al desktop aprobado via sm:self-start
- [Phase 14]: 14-09 (UAT punto 6, solucion propuesta por el dueno): Telefono/Email SIEMPRE visibles en el alta de profesional en vez de darle mas aire al enlace desplegable — se eliminan el enlace, el estado proExtraOpen y la prop showExtra. "Con los campos visible me gusta como queda el boton"
- [Phase 14]: 14-09: las opciones apiladas del segmentado llevan min-h-11 sm:min-h-0 — apiladas quedaban en 32px y el minimo tactil es 44x44 (regla dura del CLAUDE.md global); se copia la forma del control gemelo de CapacityModeFields en vez de inventar otra
- [Phase 14]: 14-09: 3 de las 7 observaciones humanas (puntos 3, 5 y 6) reportaron DEFECTOS que el pipeline verde no veia (tsc 0, build 0, 26/26, todos los conteos exactos). El checkpoint humano es el que encuentra lo que las aserciones no
- [Phase 14]: 14-09: un criterio de aceptacion escrito sobre una string literal de clases no sobrevive a un cambio de estrategia responsive — 'className="self-start inline-flex' paso de 1 a 0 al volver el control mobile-first. NO se forzo la clase para satisfacer el grep: el invariante se verifica con 'sm:self-start' => 1

- [Phase 15]: 15-01: la 068 corre en el orden DROP → backfill → CHECKs → DEFAULT (D-05) y el backfill va por PREDICADO (`group_class AND capacity <= 1`), no por lista de ids — con el orden invertido la migración aborta entera, porque las 9 filas de prod violan el CHECK nuevo; el predicado además la vuelve re-corrible (2ª pasada = `UPDATE 0`, verificado) y protege a un grupal >= 2 declarado entre la escritura y la aplicación
- [Phase 15]: 15-01: el CHECK de coherencia modo↔cupo produce el invariante **`is_group ⟺ capacity_mode <> 'individual'`**, y ESO es lo que vuelve suficiente al gate de CUPO-08: si lo único que puede voltear `is_group` es el cambio de MODO, gatear el modo gatea todo el drift posible; un cambio de solo `capacity` (2 → 5) nunca lo voltea
- [Phase 15]: 15-01: el gate de CUPO-08 va como trigger `BEFORE UPDATE OF "capacity_mode"` con guard de no-cambio `IS NOT DISTINCT FROM` PRIMERO — la forma se eligió después de trazar las 6 escrituras reales sobre `services` (`saveEditService` manda siempre el modo y el guard la deja pasar; `toggleService`/`setServiceLocations`/`updateCancha`/`setCanchaActive` ni disparan el trigger). Es exactamente el error que el review propuso en la 067 y que habría roto todas las bajas de abono en producción
- [Phase 15]: 15-01: el gate NO lleva guard de cascada, a propósito: `services_business_id_fkey` es `ON DELETE CASCADE`, así que cerrar una cuenta BORRA la fila y una cascada jamás llega a un `BEFORE UPDATE`. Queda escrito en el SQL para que nadie agregue código muerto "por simetría" con la 065/067
- [Phase 15]: 15-01: código de dominio nuevo `service_mode_has_future_appointments` (P0001), fijo y sin datos del negocio; convivencia verificada con los dos de la 065 (ninguno es substring del otro, así que el `message.includes` del panel no los confunde)
- [Phase 15]: 15-01: la 068 se validó aplicándola al Postgres LOCAL con `psql --single-transaction` en vez de `supabase db reset` (que borra los datos de prueba). Esa validación prueba MÁS en comportamiento (backfill real de 10 filas, re-corribilidad, los 4 rechazos del CHECK y los 6 casos del gate con filas forzadas) y MENOS en replay-desde-cero — el `db reset` queda PENDIENTE y requiere OK del dueño
- [Phase 15]: 15-02: el piso de cupo por modo del editor (`minCapacityFor`) es **espejo de UX** del CHECK `services_capacity_matches_mode_chk`, nunca su reemplazo — la autoridad sigue siendo la base y el `.eq('business_id', ...)` del update se conserva como defensa en profundidad (T-15-10)
- [Phase 15]: 15-02: el `onClick` del segmented control patchea **modo y cupo juntos** — mandar solo el modo es exactamente lo que hacía rebotar el UPDATE contra el CHECK (individual → grupal con el cupo todavía en 1)
- [Phase 15]: 15-02: los defaults del editor eran **CUATRO**, no tres: el `?? 'group_class'` de `openEditService` **no lo matchea** el grep del literal de asignación, así que sin un criterio propio los otros tres se cumplen con ese sitio sin tocar
- [Phase 15]: 15-02: un caso que el modelo vuelve imposible se convierte en **guard de esa imposibilidad**, nunca se borra — el simultáneo de cupo 1 ahora asierta `23514` + el nombre del constraint y **relee la fila** para probar que el servicio no cambió de modo (no se confía en el error)
- [Phase 15]: 15-02: para probar un rechazo de constraint desde un test, el intento va con `UPDATE` DIRECTO por `t.admin` — `seedSimultaneousService` hace `throw` y se lleva el caso puesto antes de la primera aserción
- [Phase 15]: 15-02: CR-04 (b) se **reencuadró** en vez de fusionarse con `gap 3` — `gap 3` no tiene agenda hermana ni espacio compartido entre dos agendas, así que no era redundante, y fusionarlos habría bajado el conteo de casos de 20 a 19
- [Phase 15]: 15-02: los 10 errores de ESLint de `settings-client.tsx` son **PREEXISTENTES** (probado linteando la versión de `HEAD` en un archivo temporal: mismos 10, mismo exit 1) y quedan fuera de alcance; los gates reales del plan son `tsc --noEmit` 0 y `npm run build` 0
- [Phase 15]: 15-03: **el cambio de régimen frente al EXCLUDE gist 013 es EL contenido del cambio**, no el conteo. Antes, en un negocio con un bloque de cupo 3, TODAS las filas nacían `is_group = true` y quedaban fuera del gist; ahora solo quedan fuera las de un servicio que **declaró** cupo >= 2, y un `individual` **vuelve a entrar** al EXCLUDE (que es el que rechaza el solape de duración VARIABLE, algo que el índice 011 no ve). Las dos direcciones son obligatorias: cupo >= 2 DEBE nacer `is_group = true` o el 2º solapado moriría con `23P01` y el cupo nunca se llenaría
- [Phase 15]: 15-03: el cambio del RPC se validó por **A/B**: se instaló la función VIEJA (064) en el Postgres local, se vio a los dos casos nuevos fallar con los códigos exactos que sus comentarios predicen (`23505` y `is_group = true`), y recién ahí se reinstaló la 068. Es el único modo de que un test de este motor pruebe algo — pasar no alcanza
- [Phase 15]: 15-03: **los bloques de agenda con cupo N NO se pueden bajar a 1 hasta 15-04**. `booking-core:270` hace `taken && slotCapacity <= 1` con `slotCapacity` leído de `time_blocks`, así que con el bloque en 1 y el servicio en N la 2ª alta secuencial muere con un `slot_taken` del JS **sin llegar al RPC** (probado: 2 casos fallaron). El control negativo se prueba igual, por **RPC directo**, que es el único camino que en esta ola llega al motor con las dos fuentes discrepando
- [Phase 15]: 15-03: `v_capacity` se conservó como variable en vez de usar `v_svc_cap` en línea — deja byte-idénticas las dos líneas que la consumen. Sobre esta función un diff mínimo es una decisión de **riesgo**, no de estilo (la Phase 12 necesitó dos rondas de review y cinco blockers para dejarla bien)
- [Phase 15]: 15-03: el fail-safe del modo pasó a `'individual'` y es **más** fail-closed: antes un `p_service_id` que no resolviera (p. ej. de otro tenant) caía a la rama grupal y podía heredar un cupo > 1 del bloque que ese servicio nunca declaró
- [Phase 15]: 15-03: para asertar que una fila volvió a estar DENTRO del EXCLUDE 013, el 2º intento tiene que **solapar sin compartir hora exacta** — en la hora exacta se violan a la vez el índice único 011 y el gist, y cuál reporta primero no está garantizado
- [Phase 15]: 15-04: **el desacuerdo se CIERRA, no se mueve.** El criterio real no era "cambiar tres archivos" sino que ninguna lectura JS del camino de reserva decida el cupo por `time_blocks`. Por eso `capacityFor()` se **borró entera** (en vez de reapuntarla) y `capacity` salió del `select` de bloques: las dos cosas garantizan que nadie la vuelva a usar por costumbre
- [Phase 15]: 15-04: en `availability` el cupo cambió de **forma**, no solo de fuente — pasó de ser **función de `time`** a **constante por request**. Eso es lo que vuelve imposible que la grilla y el motor diverjan por horario, y por eso los TRES consumidores (`bucle de start-times`, `busy`, `full`) se tocan aunque su semántica no cambie
- [Phase 15]: 15-04: el **fallback a cupo 1** cuando no llega `serviceId` es deliberado y es el camino MÁS restrictivo — sobre-ofrecer un horario produce un rechazo en el `create`, sub-ofrecerlo solo esconde un slot. Canchas (servicio de cupo fijo 1) queda byte-idéntico y por eso `canchas-booking-client.tsx` NO se toca, con la razón anotada en el código para que no parezca un olvido
- [Phase 15]: 15-04: bajar los cinco `seedTimeBlock` que 15-03 dejó en N **los convirtió en el control negativo de ESTE plan**: contra el `booking-core` viejo, `CONC-01` y `CUPOS-03` FALLAN (`expected +0 to be 1` / `expected true to be false`), y contra el `availability` viejo `CUPOS-02` FALLA (el slot parcial 2/3 salía como lleno). Un fixture que era parche se vuelve el A/B del plan que lo liberó
- [Phase 15]: 15-04: **`CUPO-07 (b)` conserva su bloque en 3 y el grep de aceptación queda en 1, no en 0.** Ahí el número no declara: MIENTE a propósito, y es la mentira lo que el caso prueba. Con el bloque en 1 la función vieja de la 064 también daría `is_group = false` y el test pasaría contra las dos versiones. Se descartó esconder el literal detrás de una constante para satisfacer el grep — mismo criterio que 14-09 ("NO se forzó la clase para satisfacer el grep")
- [Phase 15]: 15-04: `CUPOS-02` se reencuadró a **dos servicios y dos consultas**, no a dos ventanas horarias: un servicio tiene UN cupo, así que el truco de dos bloques con cupos distintos muere con el cupo por servicio. Las aserciones se repartieron sin ablandarse y el contrato + las claves prohibidas ahora se asiertan en LAS DOS respuestas (antes, en una sola)
- [Phase 15]: 15-01: primer `ALTER COLUMN ... SET DEFAULT` del repo en una migración numerada fuera del baseline (divergencia consciente, documentada en el header); y se rechazó introducir el agregado de constraint en dos pasos por no tener un solo precedente en el repo
- [Phase 16]: GATE-01: el criterio de direccion del gate de modo es NOMINAL (OLD.capacity_mode = 'individual'), no numerico -- un gate no debe depender del CHECK de coherencia de la 068 para ser correcto
- [Phase 16]: Los dos gates de servicio NO comparten funcion auxiliar: la 070 es justamente la migracion que los hace divergir en el conjunto de estados (borrado excluye completed, modo no)
- [Phase 16]: La matriz del gate se prueba POR DIRECCION con control negativo A/B a nivel suite: 5 casos discriminantes vistos fallar contra los cuerpos viejos de 065+068 instalados a mano — Un test de garantia que pasa con y sin la garantia no cuenta como verificacion; separar discriminantes de invariantes evita venderlos como control
- [Phase ?]: 17-01: los labels de los tres modos de cupo viven en CAPACITY_MODE_HELP (un solo lugar); el explicador es descriptivo, no interactivo (leer no escribe); el clamp del cupo se movio de onChange a onBlur
- [Phase 17]: La ocupacion y el agrupamiento por slot viven en lib/agenda-occupancy.ts, modulo puro sin imports — El cupo sale de services.capacity (fuente del motor desde la 068) y el modo se lee de capacity_mode; asi la grilla decide con la misma fuente que book_slot_atomic y la logica se puede testear sin DB ni navegador
- [Phase 17]: El service_id es parte de la clave del grupo y occupiesSeat descarta el hold vencido, ambos probados por mutacion — Un test que pasa con y sin la garantia no cuenta: sacar el service_id pone en rojo el caso 4 y sacar el guard pone en rojo el caso 2
- [Phase 17]: El patrón de diálogo alto (scroll interno + pie anclado) se aplica POR CALLER — components/ui/dialog.tsx queda byte-idéntico
- [Phase 17]: savingNewSvc se apaga en un finally, no antes de cada return — el early return por error también tiene que devolver el botón
- [Phase ?]: 17-05: la columna del dia consume lib/agenda-occupancy; el cupo sale de services.capacity y el modo se lee, no se deduce (POLISH-09)
- [Phase ?]: 17-05: el roster recupera la MISMA entrada de grupo que se renderizo (date+time+serviceId) en vez de recalcular: divergencia de numeros imposible por construccion
- [Phase ?]: 17-03: el badge de modo de la tarjeta ES el control de cupo (D-07+D-08 son un solo elemento); el label de modo es texto, no un control (D-09)
- [Phase ?]: 17-03: guardado inline con estado POR TARJETA (savingCapacityId); el booleano singleton de los dialogos congelaria el resto de la lista
- [Phase 17]: El chip del slot grupal de la agenda apila el contador en su propia linea (G-03) — Medido a 375px: la celda del dia tiene ~115px de contenido y en un solo renglon el nombre se quedaba sin ancho. Bajar el contador le devuelve ~77px; acortar el aviso de sena recuperaba menos y seguia truncando, y pasar la grilla a una columna tocaba una superficie que funciona.
- [Phase 17]: El explicador de modos de cupo muestra completo sólo el modo activo; los otros dos quedan en una línea con su eje, y el texto completo sigue en el canal accesible — D-02 revisada en la UAT: los tres bloques completos eran ~10 líneas a 375px. Ocultarlos del todo obligaría a tocar botones que escriben capacity_mode + capacity, así que la versión corta conserva la comparación sin efecto de escritura
- [Phase 17]: El control de cupo se comparte entre la tarjeta y el modal (CapacityStepper), pero el guardado NO: la tarjeta persiste en la base y el modal propaga al formulario, por eso el clamp vive en cada caller — Un dato, un control: cuando el mismo campo se edita desde dos superficies, se extrae el control; lo que no se unifica es el camino de escritura
- [Phase 18]: 18-01: la puente time_block_services exige business_id NOT NULL igual que el molde 057 — una franja huerfana nunca recibe mapeo y queda comodin para siempre (falla hacia el lado seguro; 0 huerfanas medidas en local)
- [Phase 18]: 18-01: la vista public_time_block_services es DEFINER (owner postgres) sin security_invoker — verificado por reloptions NULL + control negativo real (anon lee 1 fila)
- [Phase 18]: 18-01: cero backfill — el estado neutro (0 filas = comodin) ES el estado actual, asi que ningun negocio cambia de comportamiento (AGENDA-04)
- [Phase ?]: 18-02: blocksForService va generica sobre {id} y no atada a TimeBlock — evita el cast mentiroso que el molde staff-services paga en availability/route.ts
- [Phase ?]: 18-02: startTimesNotOffered NO lleva atajo bridge.length===0 — el resultado vacio con la puente vacia emerge de la regla del comodin; el atajo habria vuelto tautologico un control negativo
- [Phase ?]: 18-02: el helper NO filtra por business_id (contrato D-16, T-18-07); el aislamiento vive en la RLS de la 071 y en las queries de los consumidores
- [Phase 18]: 18-03: la regla de la agenda por servicio se SUMA a full (nunca filtra los bloques) y se calcula una sola vez antes de las tres ramas del endpoint de disponibilidad
- [Phase 18]: 18-03: un caso de test que asierta ausencia no puede contar como RED esperado — su mordida se demuestra contra la implementacion ingenua, no contra el estado previo
- [Phase 18]: El backstop de la agenda por servicio vive DENTRO de createAppointmentCore, gateado por el flag enforceServiceWindow con default apagado — El core tiene tres llamadores y la regla aplica a uno (el booking publico). Adentro del core el service.id ya esta re-validado por business_id; en el route handler la regla habria razonado sobre un id crudo del cliente. Default apagado = el caller que se olvide del flag hereda el comportamiento de hoy.
- [Phase 19]: 19-01: se descarta tmp_key — el estado del editor se re-deriva completo desde las filas que devuelve el RPC — Sin correlacion payload-retorno no existe la clase de bug de correlacion (P-01): mas simple que administrarla
- [Phase 19]: 19-01: buildSaveHoursPayload no acepta consultorio — P-03 (guardar una sede borra la otra) queda cerrado por la FIRMA: reintroducir el bug obliga a cambiarla, lo que se ve en review
- [Phase 19]: 19-02: save_agenda_blocks corre en modo INVOKER (no DEFINER) y solo la ejecuta authenticated — no se repite RA-05 sobre la configuracion del negocio
- [Phase 19]: 19-02: la pertenencia cross-tenant de la puente NO se revalida en plpgsql; la rechazan las FK compuestas de la migr. 073
- [Phase ?]: 19-03: el guard del pre-check de borrado tambien mira count === null — un head count de PostgREST que no resuelve vuelve 204 sin error, y el ?? 0 lo leia como 'no hay nada'
- [Phase ?]: 19-04: LocalBlock = AgendaBlockDraft + error — el tipo del editor es el del modulo puro mas su campo de UI
- [Phase ?]: 19-04: el estado inicial de dayStates se deriva con buildDayStatesFromRows + servicesOfBlock — la MISMA derivacion que el post-guardado (P-01); cero filtros inline sobre la puente en el componente
- [Phase ?]: 19-04: el cupo del bloque salio del editor entero (D-12: tipo, constructores, copiado, guardado y fila); el import de Minus se queda por su segundo uso en la ventana de reserva
- [Phase ?]: 19-04: npm run lint no puede dar exit 0 en agenda-client.tsx por un error react-hooks/purity PREEXISTENTE en la vista semanal (D-13, fuera de alcance); el gate pasa a eslint acotado sin errores nuevos
- [Phase ?]: 19-05: isBlockWildcard se consume por adaptador (isDraftBlockWildcard) en vez de reimplementar la regla del comodin en el componente
- [Phase ?]: 19-05: el rechazo de la base se clasifica a codigo de dominio y la copy vive en un mapa aparte; a consola va el code, nunca el message
- [Phase 19]: 19-06: la contradiccion de la Phase 18 sobre el estado de produccion se resolvio MIDIENDO — las 071/072/073 ya estaban aplicadas — 18-VERIFICATION.md:152 (prod en la 070) queda obsoleto frente a 18-SECURITY.md 9. La salida cruda del Paso 1 esta pegada en 19-06-SUMMARY.md
- [Phase 19]: 19-06: no se emite una migracion 075 — la proxima migracion libre del proyecto es la 075 — La residualidad de supabase_admin en pg_default_acl es una limitacion de plataforma (42501) que ninguna migracion de este proyecto puede cerrar; los dos criterios de privilegios se cumplen en produccion

### Pending Todos

1 pendiente:

- **[database]** Cupo por solape: con `capacity > 1` el control de sobrecupo cuenta por hora de inicio exacta y no por solape, asi que turnos escalonados que se pisan superan el cupo (reproducido: cupo 2 + 4 turnos simultaneos). El `EXCLUDE` anti-solape se apaga con `is_group = (capacity > 1)` y el conteo del RPC solo mira `date + time`. Requiere decidir la semantica de cupo (clase grupal = por hora de inicio, correcto hoy · recurso simultaneo = por solape, roto), y toca `book_slot_atomic`, la asignacion de `seat` y la granularidad del advisory lock. **NO es quick task** — fase propia + secure-phase. Ver `todos/pending/2026-07-22-cupo-por-solape-*.md`.

### Blockers/Concerns

- **[Phase 15 — deploy, PENDIENTE]** La migración **068** está escrita y validada en local pero **NO aplicada a producción**. Última en prod = **067**. Antes de aplicarla hay que correr el **pre-flight** que está escrito en el header del archivo, con criterio de **ABORTO** si `max(capacity) from time_blocks > 1`. Runbook completo en `15-01-SUMMARY.md` §User Setup Required. ⚠ El sub-bloqueo de ORDEN ("no debería llegar a prod antes que el guard del editor, D-10") quedó **CERRADO por el plan 15-02**: el editor ya ofrece los tres modos y sube el cupo a 2 al salir de individual, así que no puede producir la combinación que el CHECK rechaza. La 068 sigue teniendo que aplicarse a mano y coordinada con el deploy de ese código.
- **[Phase 15 — tests, RESUELTO por 15-02 (2026-08-12)]** Las escrituras que el CHECK de coherencia volvió ilegales están todas cerradas, en los **dos** sentidos: los cuatro `capacity_mode: 'group_class', capacity: 1` pasaron a `'individual'/1`, y los **tres** `seedSimultaneousService(t, { capacity: 1 })` de `concurrency.test.ts` (que morían con `23514` porque el helper hace `throw`) migraron o se convirtieron en guard. Suites verdes contra el local con la 068: **20/20** en `test/concurrency.test.ts` y **7/7** en `test/booking-cualquiera-public.test.ts` — el conteo **no bajó**.
- **[Phase 15 — DESACUERDO TEMPORAL, RESUELTO por 15-04 (2026-08-12)]** El write-path (`book_slot_atomic`) y el read-path (`lib/booking-core.ts` + `app/api/booking/availability/route.ts` con sus tres consumidores) deciden ahora el cupo con **`services.capacity`**, y el booking público manda el `serviceId` que el endpoint necesita para resolverlo. `capacityFor()` se borró entera y `capacity` salió del `select` de bloques. Los seis `seedTimeBlock(t, { capacity: N })` bajaron **salvo uno**: el de `CUPO-07 (b)`, donde el número MIENTE a propósito y es la mentira lo que el caso prueba (bajarlo lo dejaría sin poder discriminante — ver `15-04-SUMMARY.md` §Deviations). Queda **una sola** lectura decidiendo por el bloque: `app/(dashboard)/agenda/agenda-client.tsx:465-474` (+ el `isGroup` de presentación de `:638`), panel **autenticado** ⇒ drift de visualización, no de reserva, asignado a la **Phase 16** por D-08.
- **[Phase 15 — validación, PENDIENTE]** `supabase db reset` **no se corrió** (destruye los datos de prueba locales): falta confirmar que el replay del baseline + 040..068 desde cero termina limpio. Riesgo bajo (el archivo se aplicó dos veces seguidas con exit 0 sobre una base con datos), pero el gate formal del plan queda sin ejecutar. **Requiere el OK del dueño.**
- **[Phase 14 — LOS 3 GAPS CERRADOS (2026-08-10)]** El plan **14-09** cerró la fase: gap 1 (POLISH-05) verificado por el **ojo del dueño** con captura (chip "Alto" rojo + "Medio" amarillo dentro de un modal del CRM), gaps 2 y 3 (POLISH-04 en `Equipo`) cerrados por código + auditoría del inventario completo. El checkpoint humano se aprobó en **2 rondas**: la primera reportó 3 defectos reales (puntos 3, 5 y 6) que se corrigieron dentro del plan. `REQUIREMENTS.md`, `ROADMAP.md` y `14-VERIFICATION.md` dicen ahora lo mismo. Ver `14-09-SUMMARY.md`. **Los 3 blockers de abajo quedan como histórico.**
- **[Phase 14 — infra de tests, VIGENTE]** La corrida completa de `npx vitest run` sigue sin ser un gate útil en esta máquina: **725 passed / 9 failed / 23 suites caídas**, todas por `Test timed out in 5000ms`, con **3 stacks de Supabase local levantados** y `127.0.0.1:54321/rest/v1/` tardando **2,16 s** en el root. Es entorno, no código. Los gates útiles hoy son `tsc --noEmit` (usar `./node_modules/.bin/tsc`, **nunca** `npx tsc`), `npm run build` y las suites unitarias que no van contra la DB.
- **[Phase 14 — gap 1 CODEADO, falta el ojo humano — HISTÓRICO, ya cerrado por 14-09]** 14-08 cerró el ítem 1 en código: el popup del `Dialog` hereda el scope del shell activo (`ShellScopeProvider` + `portalScopeClass`, `lib/shell-scope.ts` + `components/ui/shell-scope.tsx`), sin tocar `risk-badge.tsx`, `globals.css` ni `themes.css`. 12 tests con prueba de mutación; `tsc` 0 y `build` 0. **POLISH-05 NO se puede dar por cerrado desde acá**: la verificación de que "Alto" y "Medio" se distinguen en pantalla es el checkpoint humano bloqueante del **plan 14-09** (ver `14-08-SUMMARY.md` §"A mirar en el checkpoint humano"). Ojo: los modales del CRM ahora se ven con fondo oscuro (el popup lleva `dark`) — es intencional pero es un cambio visible. Los ítems 2 y 3 (toggle de `Equipo` + centrado de los "+ Agregar") siguen abiertos.
- **[Phase 14 — infraestructura de tests local DEGRADADA]** Dos corridas completas de `npx vitest run` durante 14-08 dieron conjuntos de fallas **disjuntos** (11 fallas en 4 suites · 2 fallas en otras 2 suites + 24 suites caídas enteras), **todas** por `Test timed out in 5000ms` / `Hook timed out in 10000ms`. El Supabase local responde 200 pero tarda ~1.26 s en el root de `/rest/v1/`. La corrida completa **no es un gate útil en esta máquina hoy**; el baseline documentado de "hasta 7 fallas en las 3 suites de abonos" quedó excedido por entorno, no por código. Detalle y evidencia causal en `14-08-SUMMARY.md` §"Suite completa".
- **[Phase 14 — gap abierto original, histórico]** La UAT del 14-07 encontró **1 falla**: dentro de los modales del CRM los chips "Alto" y "Medio" se ven del mismo color (el `DialogPortal` monta fuera de `.crm-shell`), rompiendo el criterio de aceptación de D-05. Es **regresión de 14-01**. Se abre el **plan 14-08** dentro de esta misma fase con 3 ítems: (1) el color de los chips en los modales del CRM — prioridad 1 · (2) el toggle "Al reservar, ¿preseleccionar «Cualquiera»?" de `Equipo` a ancho completo (gap de cobertura de POLISH-04, `app/(dashboard)/equipo/` nunca estuvo en los 5 archivos del plan) · (3) centrado vertical de los botones "+ Agregar" de `Equipo`. Pista: el patrón ya existente para esta clase de bug es `confirmButtonClass()` en `components/crm/confirm-dialog.tsx` (gap 13-05 #1); el arreglo probablemente sea que el portal herede los tokens del shell, **no** tocar el RiskBadge. Ver `14-07-SUMMARY.md` §Gaps abiertos.
- **[Phase 14 — deploy] RESUELTO (2026-08-06):** la migración **066 ya está APLICADA en producción**, con el rechazo del gate verificado en vivo. La base va adelante del código de 14-06 (todavía sin deployar), que es el orden correcto. **La próxima migración del repo es la 067.**
- **[Phase 8 — migración]** La tabla puente staff↔servicios es la migración **057** — **CREADA y VALIDADA en 08-01** (idempotente, RLS + 4 policies por op WITH CHECK, índice inverso; commit 77b3508) + `schema.sql` regenerado quirúrgicamente. Validada con `npx supabase db reset` local (replay 001→057 limpio, 057 aparece aplicada en `migration list --local`; 4 policies + índice + ENABLE RLS confirmados en schema.sql; anon sin policies). Baseline: la última aplicada en prod es la **056** → la próxima es la **057**. **PENDIENTE OPERATIVO:** aplicarla **A MANO** al Supabase de prod en el próximo deploy (+ `NOTIFY pgrst, 'reload schema'`) — **NO** por el flujo GSD.
- **[Phase 9 — integridad]** La asignación de "cualquiera" tiene que ocurrir DENTRO de `book_slot_atomic`, bajo el mismo advisory lock / transacción `SECURITY DEFINER` que ya serializa el anti-sobrecupo y la exclusión por espacio. Cambiar la granularidad del lock no puede degradar `slot_full` ni `slot_taken`. Los CUATRO consumidores del RPC (booking público, alta manual, generación forward de abonos, canchas) entran por `createAppointmentCore`: un cambio de firma/semántica los afecta a los cuatro. **secure-phase obligatorio.** El RPC se modifica en una migración numerada nueva (`CREATE OR REPLACE FUNCTION`), aplicada a mano.
- **[Phase 9 — tenant]** `book_slot_atomic` es `SECURITY DEFINER`: RLS NO la protege. Toda query nueva adentro debe filtrar por `business_id` explícito; el conjunto de candidatos se deriva server-side, nunca de IDs que mande el cliente.
- **[Phase 10 — superficie pública]** `/api/booking/availability` pasa a agregar varias agendas: mantener el contrato acotado `{ ok, busy, full }` (D-06 LOCKED, el público no ve lugares restantes) y no filtrar la agenda interna. La lista de profesionales capaces por servicio sale por **vista acotada** (molde `public_professionals`/`public_services`), nunca abriendo la tabla puente a `anon`. Los dos calendarios públicos son **gemelos** — tocar uno sin el otro es la regresión clásica del workstream.
- **[Phase 10 — decisión abierta]** Default del selector público ("cualquiera" vs. "elegí profesional") y si la opción "cualquiera" se muestra con un solo profesional — **cerrar en discuss-phase**.
- **[Phase 6 — migración]** Migración nueva **054** (idempotente, numerada) crea la tabla del abono (recurring booking) + el vínculo turno→abono, con RLS habilitada + policies por operación con `with check` por `business_id`/`owner_id`. Baseline de migraciones: última aplicada = **053** (`mp_connection_status`, v0.23) → la próxima es **054**. Se aplica **A MANO** al Supabase de prod, coordinada con el deploy (+ `NOTIFY pgrst, 'reload schema'` si toca cache) — **NO** por el flujo GSD. Diseñar el esquema **extensible** para cobro recurrente futuro sin re-migrar.
- **[Phase 6 — integridad]** La generación forward inserta cada ocurrencia por el RPC atómico existente (capacity-aware + advisory lock por espacio) → cero grieta de doble-booking / sobrecupo / conflicto de espacio bajo concurrencia con reservas públicas o manuales. **secure-phase obligatorio.**
- **[Phase 6 — cron]** La extensión de la ventana corre en el **cron diario existente** (`vercel.json` → `0 3 * * *`, `/api/cron/cancel-expired` o un cron análogo). Vercel Hobby NO permite crons más frecuentes que diario — no agregar ninguno.
- **[Phase 6 — comportamiento]** Manejo exacto de una ocurrencia que choca (turno existente / día cerrado / excepción de horario): saltear y/o avisar — **cerrar en discuss-phase**.
- **[Phase 7 — token]** El token del link de cancelación debe scopear a la serie correcta (no adivinable + `timingSafeEqual`, patrón del cancel-token de turno) sin permitir cancelar el abono de otro tenant.
- **[Phase 7 — turnos ya generados]** Qué pasa con los turnos futuros ya generados al dar de baja (cancelarlos o dejarlos), consistente entre baja por mail y por panel — **cerrar en discuss-phase**.
- [Phase 7 — deploy] RESUELTO (2026-07-22): las migraciones **055** y **056 ya estan APLICADAS en produccion** (confirmado por el operador). Pre-check previo: 0 cancel_token duplicados en prod, por eso el indice UNIQUE entro limpio. La proxima migracion del repo es la **057**.
- [Phase 7 — mails sin verificar en prod] `RESEND_API_KEY` esta **vacia** en `.env.local`, asi que en local no sale ningun mail (verificado contra api.resend.com: HTTP 401). El test 10 de la UAT quedo BLOCKED: la entrega real de los dos mails de baja y el render del HTML escapado (WR-02) siguen **sin verificar en produccion**. El escapado si esta cubierto por los 21 casos de `test/abono-cancel-email.test.ts`.
- 19-06: pendiente operativo — confirmar el NOTIFY pgrst reload schema en produccion. Verificacion natural: el primer guardado de horarios tras el deploy; si devuelve PGRST202, correr la linea en el editor SQL (sin migracion)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260722-n3a | Cerrar pendientes de la UAT de la fase 07: catch de red en copyCancelLink, enmienda de D-14/D-15, comentario de cancel/route.ts y disposicion de T-07-19 | 2026-07-22 | c23257e | [260722-n3a-cerrar-pendientes-de-la-uat-de-la-fase-0](./quick/260722-n3a-cerrar-pendientes-de-la-uat-de-la-fase-0/) |
| 260722-nll | El abono finito cuyas N sesiones entran en la ventana ya no se archiva al crearlo: Activos incluye las series completed con turnos futuros (fix solo de UI, semantica del status intacta) | 2026-07-22 | d4e4bc7 | [260722-nll-un-abono-finito-cuyas-n-sesiones-entran-](./quick/260722-nll-un-abono-finito-cuyas-n-sesiones-entran-/) |
| 260722-wxt | Branding unificado de TODOS los mails: color y fuente desde la misma fuente que la pagina de reservas (paleta + font + override del landing via resolveLandingTheme), fondo claro. Cierra el linaje WR-02 (esc() en los templates de turno) y unifica el color de marca tambien en los mails al dueño. Codigo completo + verificado (tsc/vitest 742/build/greps de seguridad). ⚠ Task 4 = prueba VISUAL post-deploy PENDIENTE (RESEND vacio en local, igual que los mails de v0.24) | 2026-07-23 | efb6b4b | [260722-wxt-unificar-el-branding-de-todos-los-templa](./quick/260722-wxt-unificar-el-branding-de-todos-los-templa/) |
| 260723-tma | FIX del wxt: los mails eran theme-aware SOLO para los 5 temas forjo — un negocio no-forjo (cyber/spa/modern) recibia rojo default + Helvetica. Ahora brandEmail resuelve color y fuente via THEME_PALETTES/THEME_EMAIL_FONT (mismo resolver que brandedHex de la og:image), theme threadeado en los ~11 callers. Cero regresion forjo (hex identicos, verificado). tsc/vitest 747/build verdes; gate de seguridad de la URL de fuentes intacto. Color VERIFICADO en Gmail (estudio-test cyber → amarillo). Falta solo Apple Mail (fuente) | 2026-07-23 | 3b2f4e2 | [260723-tma-mails-theme-aware](./quick/260723-tma-mails-theme-aware/) |
| 260723-p76 | Turnos: reemplazado el `<input type="date">` roto por un selector de rango Hoy/Esta semana/Este mes/Elegir fecha (relativo a hoy, semana lun-dom) con el Calendar de la app (locale es) desplegado en "Elegir fecha", y filtrado por rango que suma (AND) a los tabs Proximos/Pasados/Todos + Profesional + Estado. UI-only en appointments-client.tsx; calendar.tsx intacto. tsc/vitest 747/build verdes. ⚠ Prueba VISUAL PENDIENTE (verificable EN LOCAL, no depende de prod) | 2026-07-23 | f3f44f9 | [260723-p76-turnos-selector-de-rango-de-fecha-hoy-se](./quick/260723-p76-turnos-selector-de-rango-de-fecha-hoy-se/) |
| 260827-ion | Interferencia entre suites de test: `vitest.config.ts` pasa a dos proyectos — `db` (27 suites DB-backed, serializadas) y `pure` (53, paralelas), clasificadas por el import de `./env` y definidas por EXCLUSIÓN (el include por lista habría dejado de correr en silencio las 21 suites co-ubicadas fuera de `test/`). Más `cleanupOrThrow`/`cleanupAllOrThrow`: un `delete()` de teardown que falla ahora TIRA con el motivo en vez de contaminar el test siguiente. Guard `suite-split.test.ts` (prueba negativa ejecutada). `npm test` sin flags: **6 corridas consecutivas verdes**, 81/81 archivos, 1063 tests — antes fallaban 5 en los `abono-*`. ⚠ 1 fallo no reproducible bajo serialización total (2 reintentos limpios), documentado en el SUMMARY | 2026-08-27 | affac55 | [260827-ion-separar-suites-de-test-paralelas-de-las-](./quick/260827-ion-separar-suites-de-test-paralelas-de-las-/) |
| 260828-lpg | Tarjeta de servicio en Ajustes: las 3 acciones (Desactivar/Editar/Eliminar) bajan al FINAL de la tarjeta en mobile y quedan inline al lado del título en desktop, sin duplicar markup — el nombre largo ya no se trunca a 375px. Tarjeta pasa a `flex flex-col` + `sm:grid sm:grid-cols-[minmax(0,1fr)_auto]` con los 5 hijos anclados en `sm:col-start-1` y las acciones en `sm:col-start-2 sm:row-start-1` (aguanta los hijos condicionales); `space-y-2`→`gap-2` conserva los 8px del ritmo. De paso corrige 3 touch targets bajo el piso de 44px (iconos 32px, Desactivar 28px) con el molde que ya existía del CapacityStepper, agrega `aria-label` al botón Desactivar, y le da a la fila de acciones su propia zona de exclusión G-04 (`pt-6 sm:pt-0`) para que no quede un botón a 8px de texto inerte. tsc limpio, eslint sin hallazgos nuevos (baseline 11), cero cambios de lógica. ⚠ VERIFICACIÓN VISUAL PENDIENTE (375px + desktop + caso capMode!=individual) | 2026-08-28 | 1fa99c8 | [260828-lpg-tarjeta-de-servicios-acciones-al-final-e](./quick/260828-lpg-tarjeta-de-servicios-acciones-al-final-e/) |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Abono | Cobro recurrente automático (MP preapproval por cliente) — modelo queda extensible | milestone futuro | 2026-07-20 |
| Abono | Recurrencia no-semanal (quincenal / mensual / custom) | v2 | 2026-07-20 |
| Abono | Alta pública del abono por el cliente (desde `/[slug]`) | v2 | 2026-07-20 |
| Abono | Waitlist si el slot del abono está ocupado | v2 | 2026-07-20 |
| Abono | Editar / reprogramar una serie viva (cambiar día/hora) | v2 | 2026-07-20 |
| UAT | Fase 07 UAT en `partial`: el test 10 (entrega real de los 2 mails de baja + render del HTML escapado) quedó BLOCKED porque `RESEND_API_KEY` está vacía en `.env.local`. **Solo verificable en producción** — y prod requiere justamente este merge, así que es incerrable antes de shippear. El escapado (WR-02) sí está cubierto por los 21 casos de `test/abono-cancel-email.test.ts`. | verificar post-deploy | 2026-07-22 |
| Motor | Cupo por solape: con `capacity > 1` el sobrecupo se cuenta por hora de inicio exacta y no por solape → turnos escalonados que se pisan superan el cupo. Diagnóstico completo en `todos/pending/2026-07-22-cupo-por-solape-*.md`. Requiere decisión de producto (clase grupal vs recurso simultáneo) y toca `book_slot_atomic` + `seat` + advisory lock. | **v0.25** | 2026-07-22 |
| Ventana | Anticipación **mínima** (espejo del máximo) | v2 | 2026-07-18 |
| Ventana | Ventana **por servicio** (se eligió global por negocio) | v2 | 2026-07-18 |
| Alta manual | Seña en el alta manual (MANUAL-04) | v2 | 2026-06-25 |
| Plan | Enforcement server-side de límites de plan ([[plan-model-agendas]]) | backlog | 2026-07-18 |
| Abonos | El selector de **Profesional** del modal "Nuevo abono" lista canchas ("Cancha A") en un negocio de vertical *general* — es el modelo de v0.13 (cancha = `professional` con `service_id`), no pulido. El dueño: "en la práctica no pasa, solo aviso". | backlog | 2026-08-06 |
| Servicios | Aviso amarillo "«Recurso simultáneo» no está disponible…" al existir una cancha, + la cancha se agrega sola como espacio compartido en `Equipo`. Introducido por `052d875 fix(12)` en **Phase 12**; es el cruce v0.12 (espacios) × v0.13 (cancha = professional). | backlog | 2026-08-06 |
| Motor | **El cupo vive en dos lugares y falta el modo "Individual".** `time_blocks.capacity` (por bloque: negocio+día+ventana) vs `services.capacity` (por servicio). Hoy "individual" no se declara, se deduce, y por eso un corte de pelo se etiqueta "Clase grupal". Propuesta: enum de 3 (`individual\|group_class\|simultaneous_resource`) con `services.capacity` como fuente única. ⚠ El backfill **no es mecánico**: el bloque no sabe a qué servicio corresponde. **Conviene meter acá el riesgo residual R-1 de `12-SECURITY.md`** (cambiar `capacity_mode` con turnos ya creados deja filas `is_group=true` huérfanas, fuera del EXCLUDE y del gate espejo ⇒ solapes que ningún gate detecta). | **fase propia** | 2026-08-11 |
| Servicios | Badge de modo (grupal / simultáneo) en la lista de `/servicios` — hoy el modo solo se ve al abrir el servicio. Polish. | backlog | 2026-08-11 |
| Agenda | La ocupación **grupal** no se ve en la grilla, solo al abrir el turno (la simultánea sí). Inconsistencia, no regresión. | backlog | 2026-08-11 |
| Finanzas | En mobile se oculta el servicio (`hidden sm:block`). Es layout, no read-path. | backlog | 2026-08-11 |

**Nota de proceso (2026-08-11):** los 4 de arriba son los que quedaron abiertos al cerrar v0.26. Otros
**6** todos del workstream ya estaban resueltos por este milestone y se movieron a `todos/completed/` en
el cierre. No se auto-cerraron porque el paso `close_phase_todos` de `execute-phase` busca en
`.planning/todos/pending/` (raíz) y los del workstream viven en
`.planning/workstreams/motor-reservas/todos/pending/` — nunca los ve. Dos de ellos incluso traían
`resolves_phase: 12` y `resolves_phase: 14`.

## Session Continuity

Last session: 2026-08-26T13:21:48.858Z
Stopped at: Completado 19-06-PLAN.md — fase 19 lista para verificacion
Resume file: None

## Operator Next Steps

- Continuar la Phase 15 con el plan **15-05** (suite de integración del gate de CUPO-08 + runbook de la 068)
- **La tarea heredada de 15-03 quedó CERRADA en 15-04:** los `seedTimeBlock(t, { capacity: N })` de `test/concurrency.test.ts` bajaron a 1, salvo el de `CUPO-07 (b)` que es control negativo y tiene la razón escrita en el propio test
- **UAT visual pendiente de 15-02** (declarada `end-of-phase`): en `/servicios` del dev local, crear un servicio (queda Individual), pasarlo a Clase grupal (aparece el campo en 2), subirlo a 10, y volverlo a Individual — ninguno de los cuatro pasos puede terminar en "Error al guardar"
- Antes de deployar: correr el pre-flight de la 068 contra producción y aplicarla **a mano**, coordinado con el deploy del código de 15-02
