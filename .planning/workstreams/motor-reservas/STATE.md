---
gsd_state_version: 1.0
milestone: v0.26
milestone_name: — Cupo por solape + cierre de backlog
status: executing
stopped_at: 14-09 Task 1 completada (commit 2e11c40) — PAUSADO en la Task 2, checkpoint human-verify BLOQUEANTE (7 observaciones a transcribir)
last_updated: "2026-08-10T20:37:16.442Z"
last_activity: 2026-08-10 -- Phase 14 execution started
progress:
  total_phases: 14
  completed_phases: 13
  total_plans: 71
  completed_plans: 70
  percent: 93
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-16)

**Core value:** Un negocio NUNCA puede leer ni modificar datos de otro y los pagos no pueden falsificarse; el núcleo de integridad anti-doble-booking (v0.9/v0.12) no puede regresar. v0.25 agrega **multi-staff**: el negocio declara qué servicios hace cada persona y el cliente reserva eligiendo profesional **o** "cualquiera", con la asignación automática resuelta **dentro del RPC atómico** `book_slot_atomic` — sin regresión para canchas, abonos, cupos grupales ni espacio compartido.
**Current focus:** Phase 14 — cierre-de-backlog

## Current Position

Phase: 14 (cierre-de-backlog) — EXECUTING
Plan: 9 of 9 (14-01..14-08 ejecutados; 14-09 en curso)
Status: BLOQUEADO en checkpoint humano — 14-09 Task 2 (`human-verify`, gate="blocking")
Last activity: 2026-08-10 -- 14-09 Task 1 completada (radiogroup de preselección desestirado + auditoría de los 3 controles de alta de Equipo, commit 2e11c40). La Task 3 (REQUIREMENTS.md + ROADMAP.md) NO se ejecuta hasta que el dueño transcriba las 7 observaciones del checkpoint.

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

### Pending Todos

1 pendiente:

- **[database]** Cupo por solape: con `capacity > 1` el control de sobrecupo cuenta por hora de inicio exacta y no por solape, asi que turnos escalonados que se pisan superan el cupo (reproducido: cupo 2 + 4 turnos simultaneos). El `EXCLUDE` anti-solape se apaga con `is_group = (capacity > 1)` y el conteo del RPC solo mira `date + time`. Requiere decidir la semantica de cupo (clase grupal = por hora de inicio, correcto hoy · recurso simultaneo = por solape, roto), y toca `book_slot_atomic`, la asignacion de `seat` y la granularidad del advisory lock. **NO es quick task** — fase propia + secure-phase. Ver `todos/pending/2026-07-22-cupo-por-solape-*.md`.

### Blockers/Concerns

- **[Phase 14 — gap 1 CODEADO, falta el ojo humano]** 14-08 cerró el ítem 1 en código: el popup del `Dialog` hereda el scope del shell activo (`ShellScopeProvider` + `portalScopeClass`, `lib/shell-scope.ts` + `components/ui/shell-scope.tsx`), sin tocar `risk-badge.tsx`, `globals.css` ni `themes.css`. 12 tests con prueba de mutación; `tsc` 0 y `build` 0. **POLISH-05 NO se puede dar por cerrado desde acá**: la verificación de que "Alto" y "Medio" se distinguen en pantalla es el checkpoint humano bloqueante del **plan 14-09** (ver `14-08-SUMMARY.md` §"A mirar en el checkpoint humano"). Ojo: los modales del CRM ahora se ven con fondo oscuro (el popup lleva `dark`) — es intencional pero es un cambio visible. Los ítems 2 y 3 (toggle de `Equipo` + centrado de los "+ Agregar") siguen abiertos.
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

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260722-n3a | Cerrar pendientes de la UAT de la fase 07: catch de red en copyCancelLink, enmienda de D-14/D-15, comentario de cancel/route.ts y disposicion de T-07-19 | 2026-07-22 | c23257e | [260722-n3a-cerrar-pendientes-de-la-uat-de-la-fase-0](./quick/260722-n3a-cerrar-pendientes-de-la-uat-de-la-fase-0/) |
| 260722-nll | El abono finito cuyas N sesiones entran en la ventana ya no se archiva al crearlo: Activos incluye las series completed con turnos futuros (fix solo de UI, semantica del status intacta) | 2026-07-22 | d4e4bc7 | [260722-nll-un-abono-finito-cuyas-n-sesiones-entran-](./quick/260722-nll-un-abono-finito-cuyas-n-sesiones-entran-/) |
| 260722-wxt | Branding unificado de TODOS los mails: color y fuente desde la misma fuente que la pagina de reservas (paleta + font + override del landing via resolveLandingTheme), fondo claro. Cierra el linaje WR-02 (esc() en los templates de turno) y unifica el color de marca tambien en los mails al dueño. Codigo completo + verificado (tsc/vitest 742/build/greps de seguridad). ⚠ Task 4 = prueba VISUAL post-deploy PENDIENTE (RESEND vacio en local, igual que los mails de v0.24) | 2026-07-23 | efb6b4b | [260722-wxt-unificar-el-branding-de-todos-los-templa](./quick/260722-wxt-unificar-el-branding-de-todos-los-templa/) |
| 260723-tma | FIX del wxt: los mails eran theme-aware SOLO para los 5 temas forjo — un negocio no-forjo (cyber/spa/modern) recibia rojo default + Helvetica. Ahora brandEmail resuelve color y fuente via THEME_PALETTES/THEME_EMAIL_FONT (mismo resolver que brandedHex de la og:image), theme threadeado en los ~11 callers. Cero regresion forjo (hex identicos, verificado). tsc/vitest 747/build verdes; gate de seguridad de la URL de fuentes intacto. Color VERIFICADO en Gmail (estudio-test cyber → amarillo). Falta solo Apple Mail (fuente) | 2026-07-23 | 3b2f4e2 | [260723-tma-mails-theme-aware](./quick/260723-tma-mails-theme-aware/) |
| 260723-p76 | Turnos: reemplazado el `<input type="date">` roto por un selector de rango Hoy/Esta semana/Este mes/Elegir fecha (relativo a hoy, semana lun-dom) con el Calendar de la app (locale es) desplegado en "Elegir fecha", y filtrado por rango que suma (AND) a los tabs Proximos/Pasados/Todos + Profesional + Estado. UI-only en appointments-client.tsx; calendar.tsx intacto. tsc/vitest 747/build verdes. ⚠ Prueba VISUAL PENDIENTE (verificable EN LOCAL, no depende de prod) | 2026-07-23 | f3f44f9 | [260723-p76-turnos-selector-de-rango-de-fecha-hoy-se](./quick/260723-p76-turnos-selector-de-rango-de-fecha-hoy-se/) |

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

## Session Continuity

Last session: 2026-08-10T20:37:16.430Z
Stopped at: Completado 14-08-PLAN.md (fix del scope portaleado; queda el checkpoint humano 14-09)
Resume file: None

## Operator Next Steps

- **Phase 14 NO está cerrada.** Los 7 planes están ejecutados, pero la UAT del 14-07 dejó **1 regresión** (chips "Alto"/"Medio" indistinguibles dentro de los modales del CRM) + 2 gaps de cobertura de POLISH-04 en `Equipo`. Próximo: planificar y ejecutar el **plan 14-08** dentro de esta misma fase (`/gsd:plan-phase 14 --ws motor-reservas` o el flujo de cierre de gaps). Detalle completo en `14-07-SUMMARY.md` §Gaps abiertos.
- **Migraciones:** la **066 ya está en producción** (2026-08-06). La próxima del repo es la **067**. Recordá: apply **A MANO** en el SQL Editor + `NOTIFY pgrst, 'reload schema'`, nunca `db push`; y que **prod no tiene `supabase_migrations.schema_migrations`**, así que el pre-check de "última aplicada" se lee de este STATE, no de la base.
- **Deploy:** el código de 14-06 (botón Eliminar) todavía no está en prod. La base ya tiene el gate, así que el orden está bien; se puede deployar cuando se quiera.
