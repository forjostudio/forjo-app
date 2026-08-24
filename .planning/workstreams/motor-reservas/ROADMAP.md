# Roadmap: Forjo App — Motor de Reservas (workstream `motor-reservas`)

> Workstream `motor-reservas`. Cubre **v0.12 Motor de Reservas** (Phases 1-3, shipped 2026-06-30), **v0.22 Turnos: alta manual y ventana de reserva** (Phases 4-5, shipped 2026-07-19), **v0.24 Turnos fijos / Abonos recurrentes** (Phases 6-7, shipped 2026-07-22) **v0.25 Reserva con varios profesionales / multi-staff** (Phases 8-11, shipped 2026-07-28) **v0.26 Cupo por solape + cierre de backlog** (Phases 12-14, shipped 2026-08-11) y **v0.27 Cupo unificado por servicio** (Phases 15-16, activo). Numeración de fases **continua** por workstream. PROJECT.md compartido en `.planning/PROJECT.md`; los requirements de cada milestone se archivan en `.planning/milestones/`.

## Overview

**v0.12 (shipped):** El milestone convierte "agenda" de *1-turno-por-slot / 1-recurso = 1-profesional* en un recurso reservable real con capacidad (cupos grupales) y relaciones de espacio físico (canchas), más turnos manuales desde el panel — para desbloquear rubros nuevos (gimnasios, clases grupales, canchas). El núcleo de integridad que endureció v0.9 (constraints 011/013 + concurrencia anti-doble-booking) se toca con cuidado: cada fase preserva el aislamiento por tenant (RLS + `business_id`) y la garantía anti-doble-booking, con **cero regresión** para el caso 1-turno-por-slot. El faseo va por riesgo creciente: primero turnos manuales (no toca constraints), después cupos grupales (redefine constraints a capacity-aware + concurrencia anti-sobrecupo), y por último espacio compartido (exclusión acoplada entre agendas), construido sobre el modelo de capacidad/concurrencia de la fase anterior y recortable como fase final sin tocar lo entregado.

**v0.22 — Turnos: alta manual y ventana de reserva (shipped 2026-07-19):** dos mejoras acotadas sobre el motor ya entregado, **sin reconstruir nada de v0.12**. (1) **Ventana de reserva:** el dueño limita hasta con cuánta anticipación puede reservar el público (una sola métrica global por negocio, `businesses.max_advance_days`, vacío/0 = sin límite); el tope se respeta en los **dos** calendarios públicos (general + canchas) y, como **backstop anti-tampering**, en el servidor (`app/api/booking/create`) — el alta manual autenticada queda **exenta**. (2) **Aviso al cliente:** el form "Nuevo turno" ya existente (v0.12: `app/api/appointments/create`) suma un checkbox **opt-in** para mandarle al cliente un mail de turno confirmado, respetando el default de v0.12 (no se manda salvo que se pida). Las dos mejoras son superficies distintas (público vs. alta autenticada) → una fase cada una.

**v0.24 — Turnos fijos / Abonos recurrentes (shipped 2026-07-22):** capacidad NUEVA sobre el motor ya entregado: el dueño arma un **abono semanal** (turno fijo recurrente) para un cliente desde el panel; el sistema **genera los turnos hacia adelante** (ventana rolling, extendida por el cron diario existente) respetando la integridad anti-doble-booking (constraints 011/013), los cupos/capacity y la exclusión por espacio compartido (canchas); el cliente **cancela la suscripción** desde un link en el mail y el dueño la da de baja desde el panel. **Solo reserva** — el cobro recurrente automático es un milestone futuro, pero el **modelo de datos se diseña extensible** para sumarlo sin re-migrar. Toca el núcleo de integridad anti-doble-booking + el aislamiento por tenant → la fase del modelo/generación es **security-sensitive** (secure-phase obligatorio). El faseo va por integridad: primero el modelo + alta + generación forward (el núcleo sensible), después la cancelación (mail + panel), que depende de la serie ya existente.

**v0.25 — Reserva con varios profesionales / multi-staff (Phases 8-11, shipped 2026-07-28):** capacidad NUEVA sobre el motor ya entregado, **sin reconstruirlo**. El negocio declara **qué servicios hace cada persona** del equipo (mapeo **muchos a muchos** propio, migración **057** — `professionals.service_id` es *single* y es el mecanismo de **canchas** (migr. 043): NO se toca ni se recicla), y el cliente reserva **eligiendo profesional o dejando "cualquiera"**; en ese caso el sistema le asigna uno **libre y capaz** eligiendo el que menos turnos tiene ese día. La asignación automática corre **DENTRO del RPC atómico `book_slot_atomic`** — leer profesionales libres y después insertar sería una carrera —, por lo que la fase de asignación es el punto de mayor riesgo del milestone (**secure-phase obligatorio**). El faseo va por dependencia y riesgo creciente: primero el **modelo + config del equipo** (no toca el motor), después la **asignación atómica** en el RPC (el núcleo anti-doble-booking), después la **disponibilidad across staff** en las superficies públicas (que necesita saber quién puede hacer qué), y al cierre un **backlog chico** independiente del motor. **Cero regresión obligatoria** en: canchas, abonos (generación forward por el mismo motor), cupos grupales (`time_blocks.capacity`) y exclusión por espacio compartido. **Fuera de alcance:** el **cupo por solape** (`capacity > 1` contado por hora de inicio exacta) — bug real y capturado, pero independiente de multi-staff y sobre el mismo RPC → **v0.26**, para no meter dos cambios grandes al núcleo en el mismo ciclo.

**v0.26 — Cupo por solape + cierre de backlog (Phases 12-14, shipped 2026-08-11):** cierra un bug de integridad capturado desde v0.12 y drena el backlog chico acumulado. El plato principal: hoy `time_blocks.capacity > 1` cuenta el sobrecupo **por hora de inicio exacta** — correcto para una *clase grupal* (yoga 16:00, cupo 10) pero **roto** para un *recurso simultáneo* (kinesiólogo con 2 camillas), donde turnos **escalonados** que se pisan superan el cupo. v0.26 separa las dos semánticas eligiéndolas **por servicio**: la de clase grupal queda intacta y se agrega un modo nuevo que **coexiste**, donde el cupo se cuenta por **solape de intervalos** (usando `duration_minutes`). El control corre **DENTRO del RPC atómico `book_slot_atomic`**, re-granularizando el advisory lock (hoy por slot+bucket — dos reservas escalonadas toman locks distintos y se cuelan; pasa a bucket+día/ventana) y separando la asignación de `seat` del criterio de cupo, con **cero regresión** de cupo 1, canchas, abonos, multi-staff y espacio compartido — es el punto de mayor riesgo (**secure-phase obligatorio** + tests de carrera contra la DB). Después, un **borrado de servicio que preserva el historial**: el dueño borra un servicio con solo turnos pasados/cancelados, un modal bloquea el borrado si hay futuros (ofrece desactivar), y los turnos pasados sobreviven en Finanzas / la ficha del cliente vía **desacople del FK** (snapshot de nombre/precio en el turno) — nunca hard-delete de la historia. Y al cierre, el **backlog chico de polish** (ancho de botones app-wide, `RiskBadge` con color fuera del CRM, un abono cancelado sin "Copiar link de baja", un cliente nuevo en "Nuevas" y no en "Pausa"), independiente del motor. El faseo va por riesgo: primero el cambio del motor (12, aislado como una única unidad revisable), después el borrado con historial (13, toca el write-path del alta pero es independiente del cupo), y por último el polish (14).

**v0.27 — Cupo unificado por servicio (Phases 15-16, activo):** v0.26 arregló **cómo** se cuenta el cupo; este milestone arregla **dónde vive el número** y **qué modos se pueden declarar** — el mismo defecto de modelo, detectado en la UAT de la Phase 12. Hoy "Individual" no se puede declarar (se deduce de `time_blocks.capacity = 1`, que vive en otra tabla y no sabe a qué servicio corresponde) y el cupo tiene **dos fuentes de verdad**: `time_blocks.capacity` para la clase grupal, `services.capacity` para el recurso simultáneo. v0.27 unifica a un enum de **tres** modos con `services.capacity` como fuente única del número: el **modo** decide cómo se cuenta, `services.capacity` decide cuánto, y `time_blocks.capacity` deja de decidir. En el mismo territorio se cierra el **riesgo residual R-1** de `12-SECURITY.md` — cambiar `capacity_mode` en un servicio con turnos ya creados deja filas `is_group = true` huérfanas, fuera del EXCLUDE gist y del gate espejo, o sea solapes permanentes que ningún gate detecta. **El cutover no afecta a nadie**: medido contra producción el 2026-08-11, los 19 bloques existentes tienen cupo máximo **1**, así que no se construye aviso de re-declaración y el backfill —la parte que se estimaba cara— deja de ser un problema. El faseo va por riesgo, como en v0.26: primero el modelo y el motor (15, `secure-phase` obligatorio, toca `book_slot_atomic` y sus cuatro consumidores), después la superficie del panel y el polish pendiente (16).

## Phases

**Phase Numbering:**

- Integer phases: Planned milestone work (numeración **continua** por workstream; v0.24 arranca en Phase 6)
- Decimal phases (6.1, 6.2): Urgent insertions (marked with INSERTED)

### Milestone v0.12 — Motor de Reservas (shipped 2026-06-30)

Faseo LOCKED por el encuadre §3 (manual → cupos → espacio).

- [x] **Phase 1: Turnos Manuales** - El dueño crea turnos desde el panel reusando el pipeline de booking, sin tocar los constraints de integridad (completed 2026-06-26)
- [x] **Phase 2: Cupos Grupales** - `capacity` por bloque + constraints capacity-aware + concurrencia atómica anti-sobrecupo, con cero regresión para cupo 1 (completed 2026-06-29)
- [x] **Phase 3: Espacio Compartido** - Recurso/espacio físico + exclusión acoplada entre agendas que comparten espacio (cancha F11 = 3 cruzadas) (completed 2026-06-30)

### Milestone v0.22 — Turnos: alta manual y ventana de reserva (shipped 2026-07-19)

- [x] **Phase 4: Ventana de reserva pública** - Tope de anticipación configurable (global por negocio) aplicado en los dos calendarios públicos + backstop anti-tampering en el servidor; el alta manual queda exenta (completed 2026-07-19, SECURED 11/11)
- [x] **Phase 5: Aviso al cliente en el alta manual** - Checkbox opt-in en el form "Nuevo turno" que le manda al cliente un mail de turno confirmado, respetando el default de v0.12 (completed 2026-07-19, SECURED 8/8)

### Milestone v0.24 — Turnos fijos / Abonos recurrentes (shipped 2026-07-22)

Faseo por integridad: primero el modelo del abono + alta manual + generación forward (núcleo anti-doble-booking → **secure-phase**), después la cancelación (mail + panel), que depende de que la serie ya exista.

- [x] **Phase 6: Modelo del abono + alta manual + generación forward** - Entidad de abono semanal extensible (migración 054), alta manual por el dueño reusando el pipeline de alta de turno, y generación forward de los appointments (ventana rolling en el cron diario) respetando 011/013 + cupos + espacio compartido, cada turno vinculado al abono (completed 2026-07-21)
- [x] **Phase 7: Cancelación del abono (mail + panel)** - Link de "cancelar suscripción" en el mail (token a nivel serie) + baja del abono desde el panel del dueño; deja de generar turnos futuros y maneja los ya generados (completed 2026-07-21)

### Milestone v0.25 — Reserva con varios profesionales / multi-staff (shipped 2026-07-28)

Faseo por dependencia y riesgo: el mapeo staff↔servicios habilita la asignación, y la disponibilidad across staff necesita saber quién puede hacer qué. El backlog chico va al final, separado del motor.

- [x] **Phase 8: Equipo — qué servicios hace cada profesional** - Mapeo muchos a muchos staff↔servicios (migración 057, tabla puente propia) + config y cobertura desde el panel, sin tocar el motor de reservas (completed 2026-07-24)
- [x] **Phase 9: Asignación automática atómica de profesional** - "Cualquiera" resuelto DENTRO de `book_slot_atomic`: elige un profesional libre y capaz (el de menos turnos ese día) sin carreras ni sobre-reserva (**secure-phase obligatorio**) (completed 2026-07-25)
- [x] **Phase 10: Reservar con "cualquiera" desde la página pública** - Opción "cualquiera" en el selector + disponibilidad across staff en la grilla + profesional asignado visible en la confirmación y el mail (completed 2026-07-27)
- [x] **Phase 11: Cierre de backlog** - Chip Cancelado/Completado en Archivados de Abonos, `setState`-in-effect de `clients-client.tsx`, y el borde lateral de las 2 pantallas de cancelación (completed 2026-07-27)

### Milestone v0.26 — Cupo por solape + cierre de backlog (shipped 2026-08-11)

Faseo por riesgo: el cambio del motor (cupo por solape) va primero y aislado como una única unidad revisable (secure-phase obligatorio); el borrado de servicio con historial es un cambio mediano independiente; el polish va al cierre.

- [x] **Phase 12: Cupo por solape (recurso simultáneo)** - Flag por servicio clase-grupal / recurso-simultáneo; el cupo por solape se controla de forma atómica dentro de `book_slot_atomic` (advisory lock de negocio-día + `seat` separado del criterio de cupo), con cero regresión del núcleo anti-doble-booking — 4/4 planes · code-review 2 rondas, 5 blockers cerrados (migr. 063 + 064) · SECURED 18/18 (`threats_open: 0`) · UAT 5/5 · migr. 062/063/064 en prod (completed 2026-07-30)
- [x] **Phase 13: Borrado de servicio preservando historial** - Borrar un servicio con solo turnos pasados; modal que bloquea si hay futuros y ofrece desactivar; los turnos pasados sobreviven en el historial (Finanzas / ficha del cliente) vía desacople del FK (snapshot de nombre/precio en el turno) (completed 2026-08-03)
- [x] **Phase 14: Cierre de backlog** - Ancho consistente de botones app-wide, `RiskBadge` "Alto" con color fuera del CRM, un abono cancelado sin "Copiar link de baja", y un cliente nuevo sin turnos en "Nuevas" (no en "Pausa") (completed 2026-08-11)

### Milestone v0.27 — Cupo unificado por servicio (Phases 15-16, activo)

Faseo por riesgo, igual que en v0.26: el cambio del modelo y del motor va primero y aislado (`secure-phase` obligatorio, toca `book_slot_atomic`); la superficie del panel y el polish van después, sin tocar el motor.

- [x] **Phase 15: Modelo de cupo unificado** - `services.capacity_mode` a enum de tres (`individual` default | `group_class` | `simultaneous_resource`) con `services.capacity` como única fuente del número; `time_blocks.capacity` deja de decidir; y el cambio de modo se rechaza en la base si el servicio tiene turnos futuros vivos (cierra R-1). **secure-phase obligatorio**
 (completed 2026-08-16)

- [x] **Phase 16: Correcciones del gate** - Migración **070** sobre el predicado de los gates: estrecharlo por dirección (`individual` → grupal/simultáneo es seguro y hoy se bloquea sin motivo), que marcar `completed` un turno futuro deje de abrirlo, y que compare **fecha + hora** en vez de solo la fecha en los gates de la 065 y la 068. **secure-phase obligatorio** (completed 2026-08-18)
- [x] **Phase 17: Superficie y polish** - Copy que distinga grupal de simultáneo + los tres defectos del editor que levantó la UAT, badge de modo en `/servicios`, la grilla de la agenda leyendo `services.capacity` y mostrando la ocupación grupal, y Finanzas mobile mostrando el servicio (completed 2026-08-20)

## Phase Details

### Phase 1: Turnos Manuales

**Goal**: El dueño puede cargar un turno desde el dashboard (reserva telefónica / walk-in) reusando el mismo pipeline server-side de `/api/booking/create` (validación, disponibilidad, anti-tampering de tenant, anti-doble-booking), desde su sesión autenticada en vez del flujo anónimo. Es la entrega más chica, de valor inmediato, y NO toca los constraints de integridad — un turno más por el mismo camino.
**Depends on**: Nothing (first phase)
**Requirements**: MANUAL-01, MANUAL-02, MANUAL-03, MANUAL-04
**Success Criteria** (what must be TRUE):

  1. El dueño carga un turno desde el dashboard y queda registrado igual que uno sacado por la página pública (mismo pipeline, misma validación anti-tampering de tenant).
  2. Al cargar el turno, el dueño elige un cliente existente o crea uno nuevo (nombre + contacto) que queda asociado al turno.
  3. Un turno manual sobre un slot ya ocupado (cupo 1) es rechazado con el mismo error de disponibilidad que el booking público — no puede sobre-reservar.
  4. ~~El dueño decide al cargarlo si exige seña, independiente del flag de seña del servicio (seña opcional para el turno manual).~~ **DIFERIDO a v2 (D-01):** el alta manual no maneja seña en Phase 1; el turno siempre queda `confirmed`. MANUAL-04 sale del alcance de Phase 1 (ver REQUIREMENTS.md Traceability).

**Plans**: 4/4 plans complete
**Wave 1**

- [x] 01-01-PLAN.md — Extraer `lib/booking-core.ts` + refactor del endpoint público (sin regresión) + tests del core
- [x] 01-02-PLAN.md — Route handler autenticado `app/api/appointments/create` (auth, business por owner_id, dedupe D-04, GCal en after()) + test de dedupe
- [x] 01-03-PLAN.md — Migración 040 (`FOR INSERT WITH CHECK` appointments/clients) + validación local `supabase db reset` + Traceability MANUAL-04 diferido

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-04-PLAN.md — Form compartido `nuevo-turno-form.tsx` (modal/drawer + combobox) + cableado en Turnos y Agenda (botón + click-en-día)

**UI hint**: yes
**Security/Integrity relevance**: El alta corre con la sesión autenticada del dueño (anon key + RLS + `.eq('business_id', business.id)`), NO con service role como el flujo anónimo. Debe garantizar que el dueño solo cree turnos en SU negocio (re-validar service/professional/location por `business_id`, nunca confiar en IDs del cliente) y reusar el anti-doble-booking existente sin debilitarlo. El secure-phase gate verifica: aislamiento por tenant en el alta manual + que el camino manual no abra un bypass del re-check de disponibilidad.

### Phase 2: Cupos Grupales

**Goal**: Un bloque de horario puede admitir N reservas (cupo) en vez de 1. Se agrega `capacity` (default 1) a `time_blocks`, se redefinen los constraints 011/013 a **capacity-aware** con CERO regresión para el caso cupo 1, y se implementa el chequeo atómico **anti-sobrecupo concurrente** en el alta (nuevo error `slot_full`). Esta fase LOCKEA el modelo "agenda como recurso" (genérico vs `professionals`+tipo) decidiéndolo ya contemplando las necesidades de espacio compartido de la Phase 3, para no pagar una migración después. Es el corazón del milestone y su ingeniería real está en la concurrencia.
**Depends on**: Phase 1
**Requirements**: CUPOS-01, CUPOS-02, CUPOS-03, CUPOS-04, CUPOS-05, CONC-01, CONC-02
**Success Criteria** (what must be TRUE):

  1. El dueño define un cupo por bloque en el editor de agenda; con cupo 1 (default) el comportamiento es idéntico al actual — un negocio con cupo 1 sigue rechazando la doble-reserva (cero regresión).
  2. La página pública muestra un horario como "disponible" hasta que se completa el cupo, sin exponer cuántos lugares quedan; al llenarse deja de ofrecerlo.
  3. El sistema admite hasta `capacity` reservas en el mismo slot y rechaza la que excede el cupo con error `slot_full`; dos reservas concurrentes sobre el último lugar: solo una confirma, la otra recibe `slot_full` (anti-sobrecupo atómico).
  4. El dueño ve en la agenda el contador de ocupación por slot grupal (ej. 8/15) y la lista de inscriptos (roster).
  5. La seña se configura por servicio (pide / no pide), independiente de que el bloque sea individual o grupal.

**Plans**: 5/5 plans complete

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Migración 041 (capacity en time_blocks + seat/is_group en appointments + índice 011 capacity-aware + EXCLUDE 013 condicional + función book_slot_atomic) + validación `supabase db reset` local + schema.sql + scaffold de tests

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Core: booking-core.ts pasa a book_slot_atomic (RPC atómico) + error slot_full (409) + re-check capacity-aware + tipos (capacity/seat/is_group)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — Availability capacity-aware (count por slot vs capacity → full) sin filtrar lugares restantes (D-06) + booking-client marca slots llenos
- [x] 02-04-PLAN.md — UI: campo "cupo" por bloque en agenda-client.tsx (CUPOS-01) + roster del admin (contador 8/15 + inscriptos) reusando Dialog/Drawer (CUPOS-04, D-04)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-05-PLAN.md — Tests de concurrencia: CONC-01 (anti-sobrecupo), CONC-02 (no-regresión cupo 1), CUPOS-03 (hasta capacity), CUPOS-02 (availability non-leak)

**Waves**: Wave 1 = 02-01 (espinazo de integridad: migración + RPC). Wave 2 = 02-02 (core, depende del RPC). Wave 3 = 02-03 + 02-04 (availability/público y UI, en paralelo; ambos dependen de la columna capacity). Wave 4 = 02-05 (tests, dependen de migración + core + availability).

**UI hint**: yes
**Security/Integrity relevance**: Esta fase toca DIRECTAMENTE el core que v0.9 endureció. Riesgos clave: (a) regresión del anti-doble-booking al volver capacity-aware los constraints 011/013 — el caso cupo 1 NO puede dejar de rechazar la doble-reserva; (b) sobrecupo bajo concurrencia si el chequeo "¿queda lugar?" se hace con un `count` simple sin lock — LOCKED: chequeo atómico deliberado (lock por slot / `SELECT … FOR UPDATE` / serializable), nunca `count` suelto; (c) la migración de `capacity` y del modelo de recurso debe mantener RLS habilitada + policies por operación con `with check` que impida reasignar a otro tenant. El secure-phase gate verifica: cero regresión cupo 1 (CONC-02), atomicidad anti-sobrecupo (CONC-01), y que la migración no exponga datos de capacidad/roster a `anon` (el público NO ve lugares restantes — C3).

### Phase 3: Espacio Compartido

**Goal**: Modelar agendas como recursos con espacio(s) físico(s) asociado(s) y acoplar su disponibilidad: reservar una agenda en un horario bloquea a todas las que comparten alguno de sus espacios en el horario solapado (cancha F11 = {A,B,C}; cada cruzada = {A} | {B} | {C}). La regla anti-solape (hoy 013, dentro de una agenda) se extiende a nivel de espacio físico, con el mismo chequeo atómico de la Phase 2. Construye sobre el modelo de capacidad/concurrencia ya entregado; es la fase final, recortable si crece sin tocar lo que entregaron Phase 1 y 2.
**Depends on**: Phase 2
**Requirements**: ESPACIO-01, ESPACIO-02, ESPACIO-03, CONC-03
**Success Criteria** (what must be TRUE):

  1. El dueño/admin modela una agenda como recurso con uno o varios espacios físicos asociados (ej. F11 = {A,B,C}; cada cruzada = un espacio).
  2. Reservar la F11 a las 20hs requiere las 3 cruzadas libres y, al confirmarse, bloquea a las 3 a las 20hs; reservar 1 cruzada a las 20hs bloquea la F11 a las 20hs (exclusión acoplada en ambos sentidos).
  3. Dos reservas concurrentes sobre agendas que comparten espacio físico en el horario solapado: solo una confirma, la otra es rechazada (chequeo "¿todos los espacios libres?" + insert atómico).

**Plans**: 5/5 plans complete

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Espinazo de integridad: migración 042 (tablas `spaces` + puente `agenda_spaces` con RLS por op) + `book_slot_atomic` extendido in-place (advisory lock por espacio ascendente + EXISTS anti-solape cross-bucket → slot_taken) + tipos `Space`/`AgendaSpace` + validación `supabase db reset` local

**Wave 2** *(blocked on Wave 1)*

- [x] 03-02-PLAN.md — Disponibilidad acoplada bidireccional en `/api/booking/availability` (siblingBusy → busy, D-06 intacto) + re-check de espacio (UX) en booking-core
- [x] 03-03-PLAN.md — UI de alta de espacios + mapeo agenda→espacios en settings (D-04, patrón professionals) + terminología "Recurso/Cancha" (D-05, override por type, label-only)

**Wave 3** *(blocked on Wave 1)*

- [x] 03-04-PLAN.md — Backstop recortable: tabla proyección `appointment_spaces` + EXCLUDE gist + triggers de población/limpieza (amendado a la 042) + re-validación local

**Wave 4** *(blocked on Waves 1+2+3)*

- [x] 03-05-PLAN.md — Fixtures `seedSpace`/`seedAgendaSpace` + test CONC-03 (anti-conflicto-de-espacio concurrente: 1 ok + 1 slot_taken, verificado contra la DB)

**Waves**: Wave 1 = 03-01 (modelo + RPC atómico, garantía mínima de ESPACIO-03). Wave 2 = 03-02 + 03-03 (read-path/availability+core y UI/terminología, en paralelo, sin solape de archivos). Wave 3 = 03-04 (backstop EXCLUDE, amenda la 042 → posterior a 03-01). Wave 4 = 03-05 (CONC-03, depende del RPC + re-check + backstop). El backstop (03-04) es el plan recortable si la fase crece (ESPACIO-03 ya queda cumplido por el advisory lock de 03-01).

**UI hint**: yes
**Security/Integrity relevance**: Extiende el anti-solape al nivel de espacio físico — mismo desafío de concurrencia que la Phase 2 (el chequeo de espacios libres + insert debe ser atómico, nunca `count` suelto). La config de espacios y el mapeo agenda→espacio son datos de tenant: tabla(s) nueva(s) con RLS habilitada + policies por operación + filtro por `business_id`; un negocio no puede mapear ni leer espacios de otro, ni acoplar disponibilidad cross-tenant. El secure-phase gate verifica: atomicidad anti-conflicto-de-espacio (CONC-03), aislamiento por tenant del modelo de espacios, y que la exclusión acoplada no filtre la grilla de un negocio a otro.

### Phase 4: Ventana de reserva pública

**Goal**: El dueño puede acotar hasta con cuánta anticipación un cliente reserva desde la página pública, y ese tope se respeta tanto en la UI de los dos calendarios como en el servidor (no se puede saltear manipulando la request). Aplica **solo al público**; el alta manual autenticada del dueño no se limita.
**Depends on**: Phase 3 (base del motor de reservas ya entregada; sin dependencia funcional nueva — primera fase de v0.22)
**Requirements**: BOOK-WINDOW-01, BOOK-WINDOW-02, BOOK-WINDOW-03
**Success Criteria** (what must be TRUE):

  1. El dueño configura en Ajustes la anticipación máxima de reserva en días, como una sola métrica **global por negocio** (`businesses.max_advance_days`); dejarla vacía o en 0 = sin límite (comportamiento actual, cero regresión).
  2. En el calendario público general (`booking-client.tsx`) el cliente no puede navegar ni elegir un día más allá de la ventana: la navegación de mes queda capada y los días fuera de rango aparecen deshabilitados.
  3. En el calendario público de canchas (`canchas-booking-client.tsx`) rige el mismo tope, con el mismo comportamiento de navegación capada y días deshabilitados.
  4. Una reserva **pública** con fecha fuera de la ventana es rechazada por el servidor (`app/api/booking/create`) aunque el cliente manipule la request — el backstop no confía en el cliente.
  5. El alta manual autenticada del dueño NO queda limitada por la ventana: puede cargar turnos con cualquier anticipación.

**Plans**: 4/4 plans complete

Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Foundation: migración 052 (columnas + vista public_businesses) + helper `lib/booking-window.ts` (hora AR, testeado) + tipos + read-path en page.tsx

**Wave 2** *(blocked on Wave 1)*

- [x] 04-02-PLAN.md — Control en Ajustes → Cobros (3 modos: días / sin límite / fecha exacta) que persiste max_advance_days/max_advance_date
- [x] 04-03-PLAN.md — Cap + texto "Reservas hasta el DD/MM" en los dos calendarios públicos gemelos (booking-client + canchas-booking-client)
- [x] 04-04-PLAN.md — Backstop server anti-tampering en booking/create (date_out_of_window/400) + test de exención del alta manual

**Waves**: Wave 1 = 04-01 (plomería: schema + read-path + helper del que dependen las 3 capas). Wave 2 = 04-02 + 04-03 + 04-04 en paralelo (config UI · cap público · backstop server; archivos disjuntos, todos dependen del helper/tipos del Plan 01).

**UI hint**: yes
**Security/Integrity relevance**: BOOK-WINDOW-03 es un **backstop anti-tampering**: el servidor debe rechazar la fecha fuera de ventana sin confiar en el cliente (mismo patrón que el re-check de tenant/disponibilidad existente en `app/api/booking/create`). La migración agrega `businesses.max_advance_days` (aditiva, default sin límite → cero regresión): debe preservar RLS y NO exponer nada sensible; el valor de la ventana viaja al público por el read-path acotado ya existente (vista pública / config), nunca por una lectura ancha de `businesses` para `anon`. El secure-phase gate verifica: (a) el servidor caps la fecha en el flujo público aunque la UI se saltee; (b) el alta manual autenticada queda exenta sin abrir un bypass del anti-doble-booking; (c) la migración no filtra columnas de `businesses` a `anon`.

### Phase 5: Aviso al cliente en el alta manual

**Goal**: Al cargar un turno manual desde el panel, el dueño puede optar por avisarle al cliente por mail que el turno quedó confirmado — **sin cambiar el default de v0.12** (no se manda mail salvo que el dueño lo pida). Reusa el alta manual autenticada existente (`app/api/appointments/create`) y el envío transaccional ya cableado; NO reconstruye el alta ni toca la sincronización con Google Calendar.
**Depends on**: Phase 4 (secuencial dentro del milestone; sin dependencia funcional — es una superficie distinta: alta autenticada vs. público)
**Requirements**: BOOK-NOTIFY-01
**Success Criteria** (what must be TRUE):

  1. El form "Nuevo turno" existente suma un checkbox "avisar al cliente por mail", **destildado por defecto** (respeta la decisión de v0.12: sin tildar, no se manda nada).
  2. Con el checkbox tildado y un cliente que tiene email, el alta manual (`app/api/appointments/create`) le envía un mail de turno confirmado, reusando el envío transaccional existente (`lib/email.ts`).
  3. Si el checkbox está destildado o el cliente no tiene email, no se manda ningún mail y el alta funciona exactamente igual que hoy.
  4. La sincronización con Google Calendar del alta manual sigue igual — el aviso por mail no la altera.

**Plans**: 2/2 plans complete

Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Mail `sendManualBookingConfirmation` en lib/email.ts (confirmación limpia sin precio/seña, D-03) + test puro

**Wave 2** *(blocked on Wave 1)*

- [x] 05-02-PLAN.md — Wiring: flag `notify` + select de business ampliado + mail en after() en appointments/create; checkbox opt-in (default OFF, disabled+hint sin email) en nuevo-turno-form + checkpoint humano

**Waves**: Wave 1 = 05-01 (el template del mail, que el endpoint importa). Wave 2 = 05-02 (endpoint + form; depende del template de Wave 1).

**UI hint**: yes
**Security/Integrity relevance**: Acción autenticada del dueño sobre un cliente de SU negocio. El envío debe usar los secretos de email acotados por tenant (`business_secrets` vía `getBusinessSecrets`, patrón v0.9) y mandar el mail SOLO al cliente del turno recién creado — sin exponer datos de otro tenant. El mail va como efecto best-effort en `after()` (patrón existente): si falla, se loguea y el alta NO se rompe. Bajo riesgo; no redefine constraints ni el flujo público.

### Phase 6: Modelo del abono + alta manual + generación forward

**Goal**: El dueño arma un **abono semanal** (turno fijo recurrente) para un cliente desde el panel, y el sistema **genera automáticamente los turnos hacia adelante** (ventana rolling) como appointments reales que RESPETAN la integridad anti-doble-booking (constraints 011/013), los cupos/capacity y la exclusión por espacio compartido (canchas), cada uno vinculado al abono. El **modelo de datos del abono se diseña extensible** para sumar el cobro recurrente automático a futuro **sin re-migrar**, pero v0.24 **NO cobra**. Es el núcleo sensible del milestone: reusa el pipeline de alta de turno existente y su anti-tampering de tenant, y la generación corre en el **cron diario existente** de Vercel (Hobby — sin crons más frecuentes).
**Depends on**: Phase 5 (última fase entregada del workstream; base del motor de reservas — booking-core / RPC atómico / cupos / espacios — ya entregada; sin dependencia funcional nueva de v0.22, primera fase de v0.24)
**Requirements**: ABONO-01, ABONO-02, ABONO-03, ABONO-06
**Success Criteria** (what must be TRUE):

  1. El dueño crea un abono semanal desde el panel eligiendo cliente + servicio (o cancha) + profesional/consultorio (según vertical) + día de la semana + hora, **indefinido hasta cancelar**; la creación reusa la validación anti-tampering de tenant del alta de turno (service/professional/location/cancha re-validados por `business_id`, nunca se confía en IDs del cliente).
  2. Al crear el abono, el sistema genera de inmediato los turnos de las próximas N semanas como appointments reales, **cada uno vinculado al abono**, respetando constraints 011/013, cupos/capacity y exclusión por espacio compartido (canchas) — con la misma garantía atómica anti-doble-booking del motor existente.
  3. Una ocurrencia del abono que choca con un turno existente, un día cerrado o una excepción de horario **se saltea (y/o avisa) sin romper la generación del resto de la serie** (el comportamiento exacto se cierra en discuss-phase).
  4. El **cron diario existente** de Vercel extiende la ventana rolling hacia adelante (genera las semanas nuevas al acercarse el borde), sin agregar ningún cron más frecuente que el diario permitido por Hobby.
  5. Un negocio solo ve y crea abonos de SU negocio (RLS + `business_id`); el modelo de datos del abono admite sumar cobro recurrente automático a futuro sin re-migrar (v0.24 no cobra).

**Plans**: 8/8 plans complete

Plans:

- [x] 06-08-PLAN.md

- [x] 06-07-PLAN.md

**Wave 1**

- [x] 06-01-PLAN.md — Migración 054 (tabla `abonos` extensible + FK `appointments.abono_id` + `businesses.abono_window_weeks`, RLS owner-only) + `supabase db reset` + schema.sql + tipos

**Wave 2** *(blocked on Wave 1)*

- [x] 06-02-PLAN.md — Motor `lib/abono-generation.ts` (generación forward vía `createAppointmentCore`, skip-and-record ante conflicto, `abono_id`, idempotente) + tests

**Wave 3** *(blocked on Wave 2)*

- [x] 06-03-PLAN.md — Endpoint `POST /api/abonos/create` (auth por owner_id, anti-tampering, primera tanda, 1 mail) + `sendAbonoConfirmation` + tests
- [x] 06-04-PLAN.md — Extensión de la ventana rolling en el cron diario `cancel-expired` (piggyback, best-effort) + tests

**Wave 4** *(blocked on Wave 3)*

- [x] 06-05-PLAN.md — UI: sección /abonos (form día-de-la-semana + hora + control de ventana), badge "fijo/abono" en la agenda, detalle con ocurrencias salteadas + checkpoint humano

**Wave 5** *(cierre post-UAT, blocked on Wave 4)*

- [x] 06-06-PLAN.md — Cierre post-UAT (D-06′ sin guarda de horario · D-07′ abono finito/indefinido con `total_occurrences` + `completed` · D-09′ "Último" real y "Sesiones X de N") + tests

**Waves**: Wave 1 = 06-01 (espinazo de datos). Wave 2 = 06-02 (motor, depende del schema/tipos). Wave 3 = 06-03 + 06-04 en paralelo (endpoint de alta · extensión del cron; archivos disjuntos, ambos dependen del motor). Wave 4 = 06-05 (UI, depende del endpoint). Wave 5 = 06-06 (ajustes post-UAT sobre todo lo anterior).

**UI hint**: yes
**Security/Integrity relevance**: **Security-sensitive — secure-phase obligatorio.** Toca el núcleo anti-doble-booking (constraints 011/013 + concurrencia atómica) que endurecieron v0.9 y v0.12, y crea entidad(es) de tenant nuevas. Riesgos clave: (a) la generación forward debe insertar cada ocurrencia por el **mismo camino atómico** del motor (RPC `book_slot_atomic` / re-check capacity-aware / advisory lock por espacio) — nunca un insert directo que evada el anti-sobrecupo o el anti-solape de espacio compartido; una serie que genera N turnos no puede abrir una grieta de doble-booking bajo concurrencia con reservas públicas o manuales; (b) la migración nueva (**054**, idempotente, numerada, aplicada a mano y coordinada con el deploy — NO por este flujo) debe crear la tabla del abono con RLS habilitada + policies por operación con `with check` por `business_id`/`owner_id`, sin exponer nada a `anon`; el vínculo turno→abono no puede permitir leer o cancelar series de otro tenant; (c) el modelo extensible para cobro futuro no debe filtrar campos sensibles (tokens/pagos) ni al cliente ni a `anon`. El secure-phase gate verifica: la generación forward pasa por el chequeo atómico (cero grieta de doble-booking / sobrecupo / conflicto de espacio), aislamiento por tenant de la entidad abono + el vínculo turno→abono, y que la migración 054 no exponga datos a `anon`.

### Phase 7: Cancelación del abono (mail + panel)

**Goal**: Tanto el **cliente** (desde un link en el mail) como el **dueño** (desde el panel del negocio) pueden dar de baja el abono completo. La baja **deja de generar turnos futuros** de la serie; el manejo de los turnos ya generados (cancelarlos o dejarlos) se aplica de forma consistente por ambas vías. Reusa el patrón del cancel-token de turno actual, pero elevado a **nivel serie** (da de baja el abono entero, no una sola ocurrencia).
**Depends on**: Phase 6 (necesita la entidad abono + el vínculo turno→abono + la generación forward para poder darla de baja y frenarla)
**Requirements**: ABONO-04, ABONO-05
**Success Criteria** (what must be TRUE):

  1. El cliente recibe un **mail** (patrón del mail de confirmación actual) con un link para **cancelar la suscripción**; abrir el link da de baja la **serie completa** del abono, no un turno suelto.
  2. El dueño puede **dar de baja el abono desde el panel** del negocio.
  3. Al darse de baja por cualquiera de las dos vías, el sistema **deja de generar turnos futuros** de esa serie (el cron ya no la extiende).
  4. Los turnos futuros **ya generados** se manejan según lo definido en discuss-phase (cancelarlos o dejarlos), de forma consistente entre la baja por mail y la baja por panel.

**Plans**: 12/12 plans complete

Plans:
**Wave 1**

- [x] 07-01-PLAN.md — Motor compartido `lib/abono-cancel.ts` (baja idempotente, doble scoping `abono_id`+`business_id`, corte "hoy" en fecha AR) + tests puros y contra la DB
- [x] 07-02-PLAN.md — Templates de baja de serie en `lib/email.ts` (mail al cliente + aviso al dueño, UN solo mail por vía) + test del payload

**Wave 2** *(blocked on Wave 1)*

- [x] 07-03-PLAN.md — Vía del cliente: ruta NUEVA `app/abono/cancelar/[token]` + `POST /api/abonos/cancel/[token]` (404 genérico, preview conteo/última fecha) + `cancelUrl` en el mail de alta
- [x] 07-04-PLAN.md — Vía del dueño: `POST /api/abonos/cancel` autenticado + UX en `/abonos` (filtro Archivados, "Dar de baja" con confirmación, "Copiar link de baja")

**Wave 3** *(blocked on Waves 2)*

- [x] 07-05-PLAN.md — Checkpoint humano: verificación end-to-end de las dos vías (mismo efecto sobre los turnos, un solo mail por destinatario, checklist visual)

### Cierre del code review (07-REVIEW.md — 1 critical · 9 warnings · 5 info)

**Wave 1 (gap closure)**

- [x] 07-06-PLAN.md — CR-01: la baja a medias se repara en el reintento en vez de reportar éxito falso · WR-04 preview que distingue fallo de cero · publica `abonoDayLabel`/`toISODate` (IN-01/IN-02)
- [x] 07-07-PLAN.md — WR-02 escapado de HTML en los dos mails nuevos + acotado del input anónimo · WR-05 timeout del POST a Resend · IN-03 logs sin PII · WR-09 test que asierta los dos envíos
- [x] 07-08-PLAN.md — WR-03: migración **056** con índice ÚNICO sobre `abonos.cancel_token` + `schema.sql` quirúrgico + checkpoint de aplicación manual en prod *(autonomous: false)*

**Wave 2 (gap closure)** *(blocked on Wave 1)*

- [x] 07-09-PLAN.md — Superficie pública: WR-01 el servidor es la autoridad del número · WR-04 copy del preview no calculable · WR-05 `after()` · IN-04 noindex · IN-05 contraste y foco · IN-01/IN-02
- [x] 07-10-PLAN.md — Panel: WR-07 el `cancel_token` deja de viajar con el listado (endpoint on-demand `GET /api/abonos/cancel-link/[id]`) · WR-06 preview acotado por fecha y agregados exactos
- [x] 07-11-PLAN.md — IN-01/IN-02 en los callers restantes (`abonos/cancel`, `abonos/create`, cron): etiqueta del día y serialización de fecha desde el módulo compartido

**Wave 3 (gap closure)** *(blocked on Wave 2)*

- [x] 07-12-PLAN.md — WR-08: `test/abono-cancel-routes.test.ts` (carrera real sobre el mismo token = 1 mail, 401/400/404, cero escrituras cruzadas) + gate final y auditoría de los 15 hallazgos

**Waves**: *Build* — Wave 1 = 07-01 + 07-02 en paralelo (motor de baja · templates de mail; archivos disjuntos, sin dependencias). Wave 2 = 07-03 + 07-04 en paralelo (superficie pública · panel; archivos disjuntos, ambas dependen del motor y de los templates). Wave 3 = 07-05 (checkpoint, depende de las dos vías construidas). *Cierre del review* — Wave 1 = 07-06 + 07-07 + 07-08 en paralelo (motor · mails · migración; `files_modified` disjuntos). Wave 2 = 07-09 + 07-10 + 07-11 en paralelo (superficie pública · panel · callers restantes; disjuntos, todos consumen el módulo compartido del 07-06). Wave 3 = 07-12 (tests de ruta contra los handlers ya arreglados).

**UI hint**: yes
**Security/Integrity relevance**: El **token de cancelación** del mail debe dar de baja **solo** el abono al que corresponde: token no adivinable, comparado con `timingSafeEqual` (patrón del cancel-token de turno actual), sin permitir cancelar la serie de otro tenant manipulando el link — un cliente no puede tocar el abono de otro negocio. La baja desde el panel es una acción autenticada del dueño sobre un abono de SU negocio (RLS + `business_id`/`owner_id`). Frenar la generación y (según decisión) cancelar los turnos futuros ya generados no puede tocar turnos de otra serie ni de otro tenant. Riesgo acotado frente a Phase 6 (no redefine constraints), pero toca aislamiento por tenant → el secure-phase gate verifica: scoping del token de cancelación a la serie correcta, aislamiento por tenant de la baja (mail y panel), y que frenar/cancelar la serie no afecte turnos ajenos.

### Phase 8: Equipo — qué servicios hace cada profesional

**Goal**: El dueño puede declarar desde el panel **qué servicios sabe hacer cada persona** del equipo y ver la cobertura al revés (por servicio, quién lo ofrece), con un modelo **muchos a muchos** propio (tabla puente nueva, migración **057**) que NO toca ni recicla `professionals.service_id` (ese campo es *single* y es el mecanismo de canchas, migr. 043). Es la fase de menor riesgo: agrega datos de configuración y su UI, **sin tocar el motor de reservas** (`book_slot_atomic`, availability, constraints 011/013). Habilita las dos fases siguientes: sin saber quién puede hacer qué, no hay asignación automática ni disponibilidad across staff.
**Depends on**: Phase 7 (última fase entregada del workstream; sin dependencia funcional nueva — primera fase de v0.25)
**Requirements**: STAFF-01, STAFF-02, STAFF-03
**Success Criteria** (what must be TRUE):

  1. El dueño abre un profesional del equipo, marca los servicios que esa persona hace, guarda, y al volver a entrar el mapeo sigue ahí — un mismo servicio puede estar asignado a varias personas y una persona puede hacer varios servicios.
  2. El dueño ve, por servicio, qué profesionales lo ofrecen, y detecta a simple vista un servicio que **no cubre nadie**.
  3. Un negocio que nunca configuró el mapeo —o que tiene un solo profesional— reserva exactamente como hoy: sin mapeo definido, todos los profesionales se consideran capaces de todos los servicios (default sensato, cero regresión, sin obligar a configurar nada).
  4. Un negocio del vertical **canchas** sigue reservando igual que antes: el mapeo nuevo convive con `professionals.service_id` sin pisarlo ni cambiar su significado.

**Plans**: 2/2 plans complete

Plans:
**Wave 1**

- [x] 08-01-PLAN.md — Espinazo: migración 057 (tabla puente `professional_services` + RLS por op + índice inverso) + tipo `ProfessionalService` + helper puro `lib/staff-services.ts` (regla del comodín D-01/D-12) con tests + validación local `supabase db reset` *(autonomous: false)*

**Wave 2** *(blocked on Wave 1)*

- [x] 08-02-PLAN.md — UI: read-paths de `/equipo` (+ services) y `/servicios` (+ mapeo) + Bloque A editor de chips optimista (D-06) + Bloque B cobertura por servicio con aviso "sin cobertura" (D-08/D-10), gateados por vertical canchas y por <2 profesionales activos

**Waves**: Wave 1 = 08-01 (modelo + regla, no toca UI ni motor). Wave 2 = 08-02 (UI, depende del tipo + helper + tabla del Plan 01; sin solape de archivos entre planes).

**UI hint**: yes
**Security/Integrity relevance**: Datos de tenant nuevos → la migración **057** (idempotente, numerada; última aplicada en prod = **056**) crea la tabla puente con **RLS habilitada + policies por operación con `with check`** por `business_id`/`owner_id`: un negocio no puede mapear un profesional suyo a un servicio de otro tenant, ni leer el mapeo ajeno. La escritura es una acción autenticada del dueño (sesión + RLS + `.eq('business_id', ...)`, nunca service-role), re-validando profesional y servicio por `business_id` sin confiar en IDs del cliente. La migración se aplica **A MANO** al Supabase de prod coordinada con el deploy, NO por el flujo GSD. No redefine constraints ni toca el RPC → riesgo acotado; la exposición del mapeo al público (si hace falta para la fase 10) debe salir por una vista acotada, nunca abriendo la tabla a `anon`.

### Phase 9: Asignación automática atómica de profesional

**Goal**: Una reserva que **no elige profesional** queda asignada a uno **libre y capaz** (que sabe hacer el servicio elegido), y esa elección ocurre **DENTRO del RPC atómico `book_slot_atomic`**, en la misma transacción que ya serializa el anti-sobrecupo y la exclusión por espacio compartido — nunca leyendo libres y después insertando, que sería una carrera. Entre varios candidatos gana el que **menos turnos tiene ese día** (reparto de carga). Es el punto de mayor riesgo del milestone: toca el núcleo anti-doble-booking que endurecieron v0.9 y v0.12 y que hoy sostiene canchas, abonos, cupos grupales y espacio compartido.
**Depends on**: Phase 8 (necesita saber qué profesionales son capaces de cada servicio para poder elegir entre ellos)
**Requirements**: ASIGN-02, ASIGN-03, ASIGN-04
**Success Criteria** (what must be TRUE):

  1. Una reserva pedida **sin profesional** queda confirmada con un profesional concreto asignado, que sabe hacer el servicio elegido y tenía ese horario libre.
  2. Dos reservas de "cualquiera" sobre el mismo horario lanzadas **a la vez** terminan con dos profesionales **distintos**; si solo quedaba uno libre, una confirma y la otra es rechazada — nunca el mismo profesional dos veces ni una sobre-reserva.
  3. Si ningún profesional capaz tiene ese horario libre, la reserva se rechaza con el error de disponibilidad de siempre (no se asigna a alguien ocupado ni se cae).
  4. Entre varios profesionales libres y capaces, el turno cae en el que **menos turnos tiene ese día**.
  5. Cero regresión verificada en los cuatro caminos que comparten el motor: elegir un profesional específico, reservar una cancha, generar la ocurrencia de un abono y llenar un cupo grupal se comportan exactamente como antes.

**Plans**: 2/2 plans complete

Plans:
**Wave 1**

- [x] 09-01-PLAN.md — Migración 058 (`book_slot_atomic`: lock ampliado a business_id+date+time + selección "cualquiera" con paridad-comodín + UUID mágico) + core `autoAssign` + apply local (`supabase db reset`)

**Wave 2** *(blocked on Wave 1)*

- [x] 09-02-PLAN.md — Fixture `seedProfessionalService` + `test/staff-assignment.test.ts` (ASIGN-02/03/03b/04 + paridad-comodín + sede, carrera real) + regresión completa de los 4 caminos (D-11)

**Waves**: Wave 1 = 09-01 (motor: migración + core + apply local, del que dependen los tests). Wave 2 = 09-02 (verificación: fixtures + tests de asignación/carrera + regresión; depende de la 058 aplicada localmente).

**UI hint**: no
**Security/Integrity relevance**: **Security-sensitive — secure-phase obligatorio.** Reescribe el corazón de la integridad del producto. Riesgos clave: (a) **carrera de asignación** — leer profesionales libres fuera del RPC y después insertar permite que dos clientes concurrentes reciban el mismo profesional; la selección tiene que ocurrir bajo el mismo `pg_advisory_xact_lock` / la misma transacción `SECURITY DEFINER` que ya protege el conteo de ocupación y la exclusión por espacio; ampliar la granularidad del lock (de slot-por-agenda a slot-por-negocio/servicio) no puede degradar ni el anti-sobrecupo (`slot_full`) ni el anti-solape cross-espacio (`slot_taken`); (b) **regresión** de los cuatro consumidores del RPC (booking público, alta manual autenticada, generación forward de abonos, canchas) — todos entran por `createAppointmentCore`, así que un cambio de firma o de semántica del RPC los afecta a los cuatro a la vez; (c) **anti-tampering de tenant**: el conjunto de candidatos se deriva **server-side** del `business_id` resuelto por slug/sesión y del mapeo de la Phase 8, nunca de una lista de IDs que mande el cliente — un `professionalId` ajeno no puede colarse por la vía "cualquiera"; (d) la función es `SECURITY DEFINER`: cualquier query nueva adentro debe filtrar por `business_id` explícitamente, porque RLS no la protege. La modificación del RPC va en una **migración numerada nueva** (idempotente, `CREATE OR REPLACE FUNCTION`), aplicada a mano y coordinada con el deploy. El secure-phase gate verifica: atomicidad de la asignación bajo concurrencia real (test contra la DB, no lectura de código), cero regresión de los cuatro caminos, y aislamiento por tenant del conjunto de candidatos.

### Phase 10: Reservar con "cualquiera" desde la página pública

**Goal**: La capacidad que entregó la Phase 9 se vuelve visible y usable para el cliente final: en la página pública puede elegir un profesional específico **o** "cualquiera", la grilla de horarios refleja al **equipo entero** (un horario está libre si algún profesional capaz lo tiene libre), y al confirmar ve **quién le tocó** — en pantalla y en el mail. Elegir profesional específico sigue comportándose exactamente como hoy.
**Depends on**: Phase 9 (la opción "cualquiera" solo se expone cuando el servidor ya sabe asignar de forma atómica) y Phase 8 (la disponibilidad across staff necesita el mapeo)
**Requirements**: ASIGN-01, ASIGN-05, DISP-01, DISP-02, DISP-03
**Success Criteria** (what must be TRUE):

  1. En la reserva pública, elegido el servicio, el cliente puede elegir un profesional de la lista **o** la opción "cualquiera".
  2. Con "cualquiera", un horario aparece disponible si **al menos un** profesional capaz lo tiene libre, y deja de ofrecerse cuando ninguno tiene lugar.
  3. Elegido un profesional específico, la grilla de horarios es la de esa agenda — idéntica a hoy (cero regresión para el negocio de un solo profesional).
  4. Al confirmar una reserva hecha con "cualquiera", el cliente ve el nombre del profesional asignado en la pantalla de confirmación y lo recibe en el mail de confirmación.
  5. El calendario público de **canchas** (el gemelo `canchas-booking-client.tsx`) sigue funcionando igual que hoy: el cliente elige la cancha, sin opción "cualquiera".

**Plans**: 4/5 plans executed

Plans:
**Wave 1**

- [x] 10-01-PLAN.md — Backend: migr 059 (`public_professional_services`) + rama de agregación `any=1&serviceId` en availability (DISP-01/03, D-06) + wiring `anyProfessional`→`autoAssign` en create (ASIGN-01, D-05)
- [x] 10-03-PLAN.md — Mail ASIGN-05: param `professionalName` en `sendConfirmationEmail` + los DOS callers (`notify/booking` sin seña, `payment/webhook` con seña)

**Wave 2** *(blocked on 10-01)*

- [x] 10-02-PLAN.md — Front: read-path de `public_professional_services` en `page.tsx` + tarjeta "Cualquiera" gateada por 2+ capaces (D-02/D-03) + señal `any`/`anyProfessional` (D-05); canchas intacto (D-09)

**Wave 3** *(blocked on 10-01, 10-02, 10-03)*

- [x] 10-04-PLAN.md — `[BLOCKING] supabase db reset` (apply local 059) + `test/booking-cualquiera-public.test.ts` (DISP-01/02/03 + ASIGN-05) + regresión de canchas/booking público/core

**Wave 4** *(blocked on 10-04)*

- [x] 10-05-PLAN.md — Checkpoint humano: verificación end-to-end de la reserva pública con "Cualquiera" (con la vista 059 viva)

**Waves**: Wave 1 = 10-01 + 10-03 en paralelo (backend/data + mail; `files_modified` disjuntos). Wave 2 = 10-02 (front; depende del contrato any/anyProfessional y de la vista del Plan 01). Wave 3 = 10-04 (reset local + tests + regresión; al final, tras todo el código). Wave 4 = 10-05 (checkpoint humano, tras el reset que deja la vista viva).

**UI hint**: yes
**Security/Integrity relevance**: Superficie **pública y anónima**. El endpoint `/api/booking/availability` pasa a agregar disponibilidad de varias agendas: debe mantener el contrato acotado que ya rige (`{ ok, busy, full }` — D-06 LOCKED: el público **no** ve cuántos lugares quedan) y **no filtrar** por el camino nuevo qué profesional está ocupado a qué hora, ni la agenda interna del negocio, más allá de lo que ya expone hoy. La lista de profesionales capaces por servicio se sirve por una **vista acotada** al estilo `public_professionals`/`public_services`, nunca abriendo la tabla puente a `anon`. El cliente puede mandar "sin profesional", pero **el servidor es la autoridad**: nada de aceptar un profesional pre-elegido por el front como si fuera la asignación, ni de confiar en un `professionalId` que no pertenezca al negocio del slug (anti-tampering existente intacto). El nombre del profesional asignado que se muestra/manda por mail sale del turno ya creado y del mismo tenant. La ventana de reserva (v0.22) y el gating de `plan_status` (SEC-04) siguen aplicando sin cambios. Los dos calendarios públicos son **gemelos**: tocar uno sin el otro es la regresión clásica de este workstream.

**Decisión abierta (cerrar en discuss-phase)**: si el default del selector público es "cualquiera" o "elegí profesional", y si la opción "cualquiera" se muestra cuando el negocio tiene un solo profesional (candidato: ocultarla).

### Phase 11: Cierre de backlog

**Goal**: Cerrar los tres pendientes chicos e independientes que quedaron del ciclo anterior, sin tocar el motor de reservas: distinguir en Archivados una serie **cancelada** de una **completada**, sacar el error de eslint por `setState` dentro de `useEffect` en `clients-client.tsx`, y resolver de una sola vez el borde lateral acentuado de las **dos** pantallas de cancelación, tratándolas juntas para que no diverjan.
**Depends on**: Phase 10 (secuencial dentro del milestone; sin dependencia funcional — ninguno de los tres ítems toca multi-staff)
**Requirements**: POLISH-01, POLISH-02, POLISH-03
**Success Criteria** (what must be TRUE):

  1. En el tab **Archivados** de Abonos, el dueño distingue de un vistazo una serie **cancelada** de una **completada** (indicador propio por estado), sin abrir el detalle.
  2. La pantalla de Clientes deja de disparar el error de eslint por `setState` dentro de `useEffect` (`clients-client.tsx:497`) y se comporta igual que hoy: búsqueda, filtros, alta y edición sin renders en cascada.
  3. Las dos pantallas de cancelación (`/cancelar/[token]` y `/abono/cancelar/[token]`) quedan resueltas con el **mismo** criterio visual en el borde lateral acentuado — se ven consistentes entre sí.

**Plans**: 4/4 plans complete

Plans:
**Wave 1** *(paralelo — sin solape de archivos)*

- [x] 11-01-PLAN.md — Los 3 pulidos: chip Cancelado/Completado en Archivados (POLISH-01/D-01), key-remount en clients-client (POLISH-02), borde gemelo + aceptación reviewable del side-tab (POLISH-03/D-03)
- [x] 11-02-PLAN.md — EXTRA-A (D-04): copy de borrado bloqueado por FK (servicio/sede/cancha) + fix de `deleteProfessional` (captura 23503, fin del toast mentiroso)
- [x] 11-03-PLAN.md — EXTRA-B plomería (D-05/D-06/D-08): migración 061 `public_selector_default` + schema.sql + read-path público + `[BLOCKING] supabase db reset` local

**Wave 2** *(bloqueada por 11-02 y 11-03)*

- [x] 11-04-PLAN.md — EXTRA-B wiring (D-05/D-06/D-07/D-08): función pura `anyCardPlacement` + orden de la tarjeta "Cualquiera" en el paso 2 + toggle en Ajustes (owner-only) + tests

**Waves**: Wave 1 = 11-01 + 11-02 + 11-03 en paralelo (front polish · copy+fix · migración/read-path; `files_modified` disjuntos). Wave 2 = 11-04 (wiring+toggle; depende de la columna 061/tipo/read-path del 11-03 y va después del 11-02 por el conflicto en `settings-client.tsx`).

**UI hint**: yes
**Security/Integrity relevance**: Bajo riesgo. Los tres ítems son de presentación o de higiene de render; no tocan el motor de reservas, los constraints, el aislamiento por tenant ni el flujo de cancelación en sí. Único cuidado: las pantallas de cancelación son **públicas y anónimas** y ya están endurecidas (404 genérico, token no adivinable, el número lo informa el servidor, `noindex`, contraste derivado por luminancia) — el retoque visual no puede aflojar ninguna de esas propiedades ni cambiar qué datos se muestran antes de autenticar el token.

### Phase 12: Cupo por solape (recurso simultáneo)

**Goal**: Que "cupo N" signifique lo correcto según el caso. El dueño marca cada servicio como **clase grupal** (cupo contado por hora de inicio exacta — comportamiento actual, intacto) o **recurso simultáneo** (cupo contado por **solape de intervalos** usando `duration_minutes`). El modo nuevo **coexiste** con el actual — NO lo reemplaza — y su control corre **DENTRO del RPC atómico `book_slot_atomic`**, re-granularizando el advisory lock (de slot+bucket a bucket+día/ventana, para que dos reservas escalonadas no tomen locks distintos y se cuelen) y separando la asignación de `seat` del criterio de cupo (el asiento sigue siendo posición dentro del slot exacto para no chocar con el índice único 011). Es el punto de mayor riesgo del milestone: toca el núcleo anti-doble-booking que endurecieron v0.9 y v0.12 y que hoy sostiene canchas, abonos, cupos grupales, multi-staff y espacio compartido, a través de los CUATRO consumidores del RPC (booking público, alta manual, generación forward de abonos, canchas).
**Depends on**: Phase 11 (última fase entregada del workstream; base del motor — booking-core / RPC atómico / cupos / espacios / multi-staff — ya entregada; sin dependencia funcional nueva, primera fase de v0.26)
**Requirements**: CUPO-01, CUPO-02, CUPO-03, CUPO-04, CUPO-05
**Success Criteria** (what must be TRUE):

  1. El dueño marca cada servicio como "clase grupal" o "recurso simultáneo" desde el panel, y el modo persiste al volver a entrar (CUPO-01).
  2. Con **recurso simultáneo**, una reserva se rechaza cuando en su intervalo (inicio + `duration_minutes`) ya hay `capacity` turnos **solapados** — turnos escalonados que se pisan sobre un recurso de cupo N ya no superan el cupo (CUPO-02).
  3. Con **clase grupal**, el cupo se sigue contando por hora de inicio exacta: la clase de las 16:00 y la de las 17:00 no suman entre sí (comportamiento actual, sin cambios) (CUPO-03).
  4. N+1 reservas escalonadas concurrentes sobre un recurso de cupo N nunca superan el cupo — verificado con un test de carrera real contra la DB (CUPO-04).
  5. Cero regresión del núcleo: cupo 1, canchas, generación forward de abonos, multi-staff y exclusión por espacio compartido se comportan exactamente igual, y los estados `slot_full`/`slot_taken` no se degradan (CUPO-05).

**Plans**: 4/4 plans complete

Plans:
**Wave 1**

- [x] 12-01-PLAN.md — Espinazo: migración 062 (columnas `capacity_mode`/`capacity` + CHECKs idempotentes + `book_slot_atomic` mode-aware: lock por modo + gate por solape + `public_services` con `capacity_mode`) + tipo `Service` + `[BLOCKING] supabase db reset` local *(autonomous: false)*

**Wave 2** *(blocked on 12-01)*

- [x] 12-02-PLAN.md — Camino público mode-aware: booking-core landmine (early-return de solape mode-aware) + availability rama específica overlap-aware (D-12) + booking-client oculta "Cualquiera" en simultáneo (D-13) + manda `serviceId`
- [x] 12-03-PLAN.md — UI del panel: segmented control "Clase grupal / Recurso simultáneo" + campo de cupo N en el editor de servicio (D-09/D-10) + indicador "lleno" en la agenda (D-11) + checkpoint humano *(autonomous: false)*

**Wave 3** *(blocked on 12-01, 12-02)*

- [x] 12-04-PLAN.md — Verificación: fixture `seedSimultaneousService` + casos CUPO-04 (carrera N+1 escalonada) / CUPO-02 / simultáneo cap 1 en `concurrency.test.ts` + `[BLOCKING] supabase db reset` + `npm run test` verde con regresión de las 4 vías (CUPO-05) *(autonomous: false)*

**Waves**: Wave 1 = 12-01 (migración + RPC + tipos + apply local, del que dependen todos). Wave 2 = 12-02 + 12-03 en paralelo (camino público backend/read/selector · UI del panel; `files_modified` disjuntos, ambos dependen de las columnas/función del Plan 01). Wave 3 = 12-04 (tests de carrera + gate de reset + regresión; depende de la 062 y del core del Plan 02).

**UI hint**: yes
**Security/Integrity relevance**: **Security-sensitive — secure-phase obligatorio.** Modifica el corazón de la integridad del producto en una migración numerada nueva (`CREATE OR REPLACE FUNCTION`, aplicada a mano coordinada con el deploy — la última en prod es la **061**, la próxima la **062**). Riesgos clave: (a) **carrera de sobrecupo por solape** — el conteo por intervalo tiene que ocurrir bajo el mismo `pg_advisory_xact_lock` / la misma transacción `SECURITY DEFINER` que ya serializa el anti-sobrecupo y la exclusión por espacio; con la granularidad vieja (slot+bucket) dos reservas escalonadas toman locks distintos y se cuelan, así que el lock pasa a bucket+día/ventana **sin degradar** `slot_full`/`slot_taken` ni el caso cupo 1; (b) **regresión** de los cuatro consumidores del RPC (booking público, alta manual, generación forward de abonos, canchas) — todos entran por `createAppointmentCore`, un cambio de firma o semántica los afecta a los cuatro; (c) la asignación de `seat` no puede chocar con el índice único 011 (el cupo se evalúa por solape, el asiento sigue siendo posición en el slot exacto); (d) `book_slot_atomic` es `SECURITY DEFINER` (RLS no la protege): toda query nueva adentro filtra por `business_id` explícito, y el flag por servicio se re-valida por `business_id` sin confiar en IDs del cliente; (e) el flag por servicio (columna nueva) debe migrarse con default = clase grupal para cero regresión. El secure-phase gate verifica: atomicidad del anti-sobrecupo por solape bajo concurrencia real (test contra la DB, no lectura de código), cero regresión de los cuatro caminos + cupo 1, y aislamiento por tenant del conteo y del flag. Aplican skills `supabase-multitenant-rls` + `convenciones-forjo`.

**Decisión abierta (cerrar en discuss-phase)**: la **columna exacta** del flag por servicio (nombre / tipo) y el mecanismo preciso de re-granularización del lock (bucket+día vs. ventana por servicio).

### Phase 13: Borrado de servicio preservando historial

**Goal**: El dueño puede **borrar** un servicio cuyos turnos son todos **pasados/cancelados**, y ese borrado **no destruye la historia**: los turnos pasados siguen visibles en Finanzas y en la ficha del cliente ("historia clínica" del paciente) con su nombre y precio, vía **desacople del FK** — el turno guarda un **snapshot** del nombre/precio del servicio al crearse. Si el servicio tiene turnos **futuros**, un **modal** bloquea el borrado, lo explica y ofrece la vía de **desactivar** (conservar y dejar de ofrecer). Cambio mediano y autocontenido: migración + backfill del snapshot + write-path del alta del turno + el modal de borrado. Independiente del cambio de cupo de la Phase 12.
**Depends on**: Phase 12 (secuencial dentro del milestone; sin dependencia funcional — el borrado-con-historial es independiente del cupo por solape, aunque ambos tocan el write-path de creación de turnos por `createAppointmentCore`)
**Requirements**: HIST-01, HIST-02, HIST-03
**Success Criteria** (what must be TRUE):

  1. El dueño borra un servicio cuyos turnos son todos pasados/cancelados (sin turnos futuros) y el servicio desaparece del panel (HIST-01).
  2. Al intentar borrar un servicio con turnos **futuros**, un modal bloquea el borrado, lo explica y ofrece **desactivar** (conservar y dejar de ofrecer) en vez de borrar (HIST-02).
  3. Un turno **pasado** de un servicio ya borrado sigue visible en el historial (Finanzas / ficha del cliente) con su nombre y precio, y los reportes no se rompen — vía desacople del FK / snapshot (HIST-03).

**Plans**: 5/5 plans complete

Plans:
**Wave 1**

- [x] 13-01-PLAN.md — Migración 065: columnas de snapshot + backfill + FKs a `ON DELETE SET NULL` + triggers de snapshot y de gate de borrado; validación `supabase db reset` local + `schema.sql`

**Wave 2** *(bloqueada por Wave 1)*

- [x] 13-02-PLAN.md — Helper puro `lib/appointment-service.ts` (fallback snapshot→join) + los 8 read-paths de historial (Finanzas, CSV, Dashboard `monthRevenue`, ficha del cliente, Turnos desktop+mobile, Abonos)
- [x] 13-03-PLAN.md — UX del borrado: `ConfirmDialog` extendido, pre-check + modal de dos estados con "Desactivar", `deleteService` discriminado, `toggleService` endurecido, tabs Activos/Desactivados y mapeo `P0001` en canchas

**Wave 3** *(bloqueada por Wave 2)*

- [x] 13-04-PLAN.md — Tests de integración de los dos triggers (snapshot + gate) y verificación de cero regresión del write-path

**Wave 4** *(bloqueada por Wave 3)*

- [x] 13-05-PLAN.md — UAT visual de los tres Success Criteria + runbook del apply manual de la 065 en prod

**Waves**: Wave 1 = 13-01 (la migración habilita todo lo demás). Wave 2 = 13-02 + 13-03 en paralelo (no comparten archivos). Wave 3 = 13-04 (tests, dependen de migración + UI). Wave 4 = 13-05 (checkpoints humanos).

**UI hint**: yes
**Security/Integrity relevance**: Riesgo acotado — NO redefine los constraints anti-doble-booking ni la lógica de concurrencia del RPC. El cuidado está en dos frentes: (a) la migración del snapshot (columna/s nuevas en `appointments` + backfill de los turnos históricos, idempotente y numerada — próxima **062**+, aplicada a mano coordinada con el deploy) debe preservar RLS + aislamiento por tenant; (b) el **write-path del alta** graba el snapshot al crear el turno y pasa por `createAppointmentCore` — el mismo camino de los cuatro consumidores del RPC — así que el cambio se verifica sin regresión en booking público, alta manual, abonos y canchas. El borrado y la desactivación son acciones autenticadas del dueño sobre un servicio de SU negocio (RLS + `.eq('business_id', ...)`); el chequeo de "tiene turnos futuros" se resuelve server-side por `business_id`. Se **descarta hard-delete de la historia**. Aplican skills `supabase-multitenant-rls` + `convenciones-forjo`.

**Decisión abierta — CERRADA en `13-CONTEXT.md`**: el mecanismo de desacople es **snapshot inmutable de nombre/precio escrito por un trigger `BEFORE INSERT`** (D-01/D-02/D-03) + **FK `ON DELETE SET NULL` con backfill** (D-04), y lo consumen los read-paths de historial vía un helper puro con fallback snapshot→join (D-05/D-06). El gate de "tiene futuros / abono activo" vive en un trigger `BEFORE DELETE` (D-08/D-09/D-10).

### Phase 14: Cierre de backlog

**Goal**: Drenar el backlog chico de polish acumulado, sin impacto en el motor de reservas ni en los constraints: unificar el ancho de los botones de acción app-wide (hoy varios `w-full` poco intencionales en desktop), que el `RiskBadge` "Alto" se vea **con color** fuera del CRM (hoy `--crm-danger` no está definido fuera del scope y el badge parece un pill gris), que un abono **cancelado** deje de mostrar "Copiar link de baja", y que un cliente **recién creado sin turnos** caiga en el filtro "Nuevas" y no en "Pausa".
**Depends on**: Phase 13 (secuencial dentro del milestone; sin dependencia funcional — los cuatro ítems son de presentación / higiene y no tocan el motor)
**Requirements**: POLISH-04, POLISH-05, POLISH-06, POLISH-07
**Success Criteria** (what must be TRUE):

  1. Los botones de acción del dashboard tienen ancho **consistente** app-wide en desktop (sin el `w-full` poco intencional), según un criterio único definido en discuss-phase (POLISH-04).
  2. El `RiskBadge` "Alto" se muestra con **relleno semántico de peligro** también **fuera del CRM** (`--crm-danger` resuelto en el scope global), no como un pill gris (POLISH-05).
  3. Una serie de abono con estado **cancelado** **no** muestra el botón "Copiar link de baja" (POLISH-06).
  4. Un cliente **recién creado sin turnos** aparece en el filtro **"Nuevas"**, no en **"Pausa"** (">2 meses sin venir") (POLISH-07).

**Alcance ampliado en discuss-phase (2 todos foldeados, sin REQ-ID en REQUIREMENTS.md):**

  5. **EXTRA-A** — Canchas tiene los tabs Activos/Desactivados con paridad de Servicios (D-14 de Phase 13), vía un componente compartido. Origen: `todos/pending/2026-08-03-canchas-sin-tabs-activos-desactivados.md`.
  6. **EXTRA-B** — el dueño puede **eliminar definitivamente** una serie de abono archivada, con el gate en la base (migración **066**) y conservando los turnos en el historial. **No es polish: es capacidad nueva.** Origen: `todos/pending/2026-08-03-borrar-definitivamente-abonos-archivados.md`.

⚠ **D-06 del CONTEXT supersede** la nota de Security de esta fase sobre "sin alterar cómo se ve el badge dentro del CRM": el usuario aceptó explícitamente que el CRM cambie de aspecto con tal de mantener un solo componente compartido.

**Plans**: 9/9 plans executed — 7 de alcance (14-01…14-07) + 2 de cierre de gaps: **14-08** cerró la causa raíz del gap 1 (BLOCKER, POLISH-05: los tokens del shell no llegaban a las superficies portaleadas) y **14-09** cerró los gaps 2 y 3 (POLISH-04 en la vista `Equipo`) más la **UAT visual bloqueante** de los 3 gaps. Fase **cerrada**: el checkpoint humano de 14-09 quedó aprobado con las 7 observaciones transcritas (`14-09-SUMMARY.md`), que es la única evidencia admisible para POLISH-05.

Plans:
**Wave 1**

- [x] 14-01-PLAN.md — POLISH-04 en Ajustes/Agenda/formularios de alta (17 botones) + POLISH-05 RiskBadge "Alto" con relleno semántico de peligro
- [x] 14-02-PLAN.md — POLISH-07: helper puro `lib/client-status.ts` (visits 0 ⇒ nuevo, umbral único 60 días) + 8 labels en masculino + POLISH-04 en Clientes
- [x] 14-03-PLAN.md — POLISH-06: gate server-side en `GET /api/abonos/cancel-link/[id]` con 404 genérico + bloque de UI oculto en serie cancelada + POLISH-04 en Abonos
- [x] 14-04-PLAN.md — EXTRA-B (base): migración **066** con trigger `BEFORE DELETE` sobre `abonos` + validación local + suite de integración

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 14-05-PLAN.md — EXTRA-A: módulo compartido `components/dashboard/active-tabs.tsx`, Servicios migrado sin regresión y Canchas con paridad
- [x] 14-06-PLAN.md — EXTRA-B (UI): borrado de serie archivada con RLS + `ConfirmDialog` de dos pasos + mapeo del rechazo del gate

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 14-07-PLAN.md — UAT visual de los 6 ítems en los dos shells + runbook y apply manual de la 066 en producción — **23 observaciones humanas reales** (visual 9/10 con 1 falla · funcional 13/13) + **migración 066 APLICADA en prod el 2026-08-06** con el rechazo del gate verificado en vivo (`P0001 / abono_is_active`)

**Wave 4** *(cierre de gaps — blocked on Wave 3 completion)*

- [x] 14-08-PLAN.md — gap 1 (BLOCKER, POLISH-05): causa raíz del scope de tokens en las superficies portaleadas — `lib/shell-scope.ts` + contexto `ShellScopeProvider` consumido por el `Dialog`, sin tocar `risk-badge.tsx` ni los tokens

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 14-09-PLAN.md — gaps 2 y 3 (POLISH-04 en la vista `Equipo`: radiogroup de preselección + auditoría de los controles de alta) + **UAT visual bloqueante de los 3 gaps** — 7 observaciones humanas transcritas, 3 defectos reportados y corregidos (datos de contacto siempre visibles, segmentado a ancho completo en mobile, confirmar destructivo del panel al primario del tema) + cierre de la trazabilidad de POLISH-04/05

**Waves**: Wave 1 = 14-01 + 14-02 + 14-03 + 14-04 en paralelo (cero solape de archivos). Wave 2 = 14-05 (necesita `settings-client.tsx` liberado por 14-01) + 14-06 (necesita `abonos-client.tsx` liberado por 14-03 y el gate de 14-04). Wave 3 = 14-07 (checkpoints humanos bloqueantes). Wave 4 = 14-08 (cero solape con todo lo anterior: crea 2 módulos nuevos y toca `dialog.tsx` + el layout del CRM). Wave 5 = 14-09 (necesita el fix del portal en el árbol para poder observarlo, y serializa `settings-client.tsx`; su checkpoint humano es bloqueante).

**UI hint**: yes
**Security/Integrity relevance**: Bajo riesgo. Los cuatro ítems son de presentación o de lógica de filtro en el cliente; no tocan el motor de reservas, los constraints, el aislamiento por tenant ni el flujo de cancelación. **Cuidado transversal (POLISH-05):** `--crm-danger` es un **design token** — definirlo fuera del scope del CRM afecta también al CRM; el cambio debe respetar el token existente sin duplicar hex y sin alterar cómo se ve el badge dentro del CRM. La pantalla pública de baja del abono ya está endurecida (404 genérico, token no adivinable, `noindex`): POLISH-06 solo oculta un botón del **panel autenticado**, no toca esa superficie.

---

### Phase 15: Modelo de cupo unificado

**Goal**: Que el cupo tenga **una sola fuente de verdad** y que los tres modos se puedan **declarar** en vez de deducirse. `services.capacity_mode` pasa a un enum de tres (`individual` **default** | `group_class` | `simultaneous_resource`) y `services.capacity` pasa a ser el único lugar donde vive el número, para los tres modos; `time_blocks.capacity` deja de decidir (se conserva la columna, no se dropea). El **modo** decide *cómo* se cuenta —por hora de inicio exacta el grupal, por solape de intervalos el simultáneo, ambos ejes ya correctos y verificados en v0.26— y `services.capacity` decide *cuánto*. En el mismo territorio se cierra el riesgo residual **R-1**: cambiar `capacity_mode` en un servicio con turnos futuros vivos se rechaza en la base con un código de dominio propio, porque hoy ese cambio deja filas `is_group = true` huérfanas que quedan fuera del EXCLUDE gist **y** del gate espejo — solapes permanentes que ningún gate detecta. Es el punto de mayor riesgo del milestone: toca `book_slot_atomic` y sus **cuatro** consumidores (booking público, alta manual, generación forward de abonos, canchas).
**Depends on**: Phase 14 (secuencial dentro del workstream; funcionalmente depende de v0.26 — el conteo por solape de la migr. 062/064 y el lock de negocio-día son la base sobre la que se mueve la fuente del número)
**Requirements**: CUPO-06, CUPO-07, CUPO-08
**Success Criteria** (what must be TRUE):

  1. Un servicio se puede declarar **`individual`** desde el modelo, es el **default**, fuerza cupo 1 y se comporta **byte-idéntico** a como se comporta hoy un servicio de cupo 1 (CUPO-06).
  2. `book_slot_atomic` decide el cupo leyendo **`services.capacity`** en los tres modos y **ya no** consulta `time_blocks.capacity` para eso, con **cero regresión** de los cuatro consumidores del RPC, de canchas, de abonos, de multi-staff y del espacio compartido (CUPO-07).
  3. Cambiar `capacity_mode` en un servicio con **turnos futuros vivos** se rechaza **en la base**, con un código de dominio fijo que no filtra datos del negocio, y el panel lo mapea a copy propio — el texto crudo del error nunca llega a la pantalla (CUPO-08, cierra R-1).
  4. Las garantías de concurrencia se prueban con **tests de carrera contra Postgres de verdad y con control negativo** (el molde de `test/concurrency.test.ts` y de la Phase 12), no con aserciones de lectura de código.

**Plans**: 5/5 plans executed — los cinco planes ejecutados y commiteados. ⚠ La migración **068 NO está aplicada en producción** (última en prod = 067): el procedimiento quedó en `15-RUNBOOK-068.md` y aplicarla es decisión del dueño. Falta el `secure-phase` (obligatorio) y la UAT de cierre de fase.

Plans:
**Wave 1**

- [x] 15-01-PLAN.md — Migración **068**: enum de tres modos + backfill por predicado + CHECK de coherencia modo↔cupo + DEFAULT `individual` + gate `services_block_mode_change` (CUPO-08 / R-1) + espejo quirúrgico en `schema.sql` + los dos comentarios de `lib/` que la 070 vuelve falsos + el tipo del modo en `lib/types.ts`

**Wave 2** *(blocked on 15-01)*

- [x] 15-02-PLAN.md — Guard **mínimo** del editor (3ª opción, defaults en `individual`, piso de cupo por modo, mapeo del rechazo de CUPO-08 a copy propia) + `seedGroupClassService` + los cuatro `afterEach` legales (D-10). NO es la UX completa: eso es CUPO-09 / Phase 16

**Wave 3** *(blocked on 15-02)*

- [x] 15-03-PLAN.md — El motor: `book_slot_atomic` lee `services.capacity` en los tres modos y deja de consultar `time_blocks` (CUPO-07) + espejo en `schema.sql` + reescritura del comentario del gate espejo (D-07) + migración de los casos de carrera al cupo por servicio

**Wave 4** *(blocked on 15-03)*

- [x] 15-04-PLAN.md — Las lecturas JS alineadas (D-08): `booking-core` + `availability` (definición y sus **tres** consumidores) + el booking público mandando `serviceId` + reencuadre del caso de no-fuga de la grilla

**Wave 5** *(blocked on 15-04)*

- [x] 15-05-PLAN.md — Verificación: suite de integración del gate de cambio de modo contra Postgres real (molde `abono-delete-gate`), dos casos de carrera con **control negativo** A/B, y el runbook de aplicación manual de la 068 (pre-flight con criterio de aborto + verificación por instalación, D-09)

**Waves**: cadena **secuencial** por dependencia real, sin paralelismo — todo pasa por el mismo motor y la misma suite. 15-01 instala el modelo del que dependen todos; 15-02 deja el editor y los fixtures legales **antes** de que el motor cambie (D-10: nada roto en ningún commit); 15-03 mueve la fuente del cupo y migra sus tests en la misma unidad revisable; 15-04 alinea las lecturas JS (no antes, o la grilla y el RPC discreparían dentro de la propia fase); 15-05 prueba y documenta.

**Security/Integrity relevance**: **ALTA — `secure-phase` obligatorio.** Toca el núcleo anti-doble-booking que endurecieron v0.9, v0.12 y v0.26. La Phase 12 encontró **5 blockers en dos rondas de code review** sobre este mismo RPC, incluido un doble-booking real; asumir que un cambio "solo mueve de dónde se lee el número" es exactamente el error que la 063 y la 064 tuvieron que reparar. Ojo particular con la relación entre `is_group` y el EXCLUDE gist 013: esa columna hace **doble trabajo** ("cupo > 1" y "exenta del EXCLUDE") y es la causa raíz que la 064 tuvo que resolver con el lock de negocio-día.
**UI hint**: no (el modelo y el motor; la superficie va en la Phase 16)

---

### Phase 16: Correcciones del gate

**Goal**: Corregir el **predicado de los gates** en una sola pasada. Las tres cosas salieron de la UAT de la Phase 15 y del audit de seguridad, **después** de que el gate ya estuviera en producción, y las tres viven en el mismo `IF EXISTS`: (a) **se estrecha por dirección** — hoy rechaza cualquier cambio de modo con turnos futuros vivos, pero `individual` → grupal/simultáneo es **seguro** (esos turnos nacieron `is_group = false`, siguen bajo el EXCLUDE gist y además se cuentan contra el cupo nuevo) y bloquearlo obliga al dueño a cancelar turnos sin motivo, justo en el cambio más frecuente porque `individual` es el default; (b) marcar **`completed`** un turno futuro deja de abrir el gate (residual **R-15-A**); (c) los gates comparan **fecha + hora** en vez de solo la fecha, así que un turno de **hoy ya pasado** deja de bloquear hasta mañana — el mismo bug que la Phase 13 arregló en la UI (gap **G4**) y que nunca cruzó al SQL. Las direcciones peligrosas (hacia `individual`, y grupal ⇄ simultáneo, donde cambia el eje de conteo) **siguen bloqueando**: ahí es donde vive R-1.
**Depends on**: Phase 15 (la 070 corrige el gate que la 068 instaló; el código que mapea sus rechazos a copy propia ya está en producción)
**Requirements**: GATE-01, GATE-02, GATE-03
**Success Criteria** (what must be TRUE):

  1. Pasar un servicio de `individual` a grupal o simultáneo **con turnos futuros vivos** ya no se rechaza; las direcciones peligrosas siguen rechazando con su código de dominio (GATE-01).
  2. Marcar `completed` un turno futuro **no** abre el gate (GATE-02).
  3. Un turno de **hoy a hora ya pasada** deja de bloquear el borrado de un servicio y el cambio de modo — en los **dos** gates, el de la 065 y el de la 068 (GATE-03).
  4. Cero regresión de R-1: existe un test por **dirección** que demuestra que las peligrosas siguen cerradas, con **control negativo** contra el predicado viejo.

**Plans**: 2/2 plans complete

Plans:
**Wave 1**

- [x] 16-01-PLAN.md — Medir los dos gates **antes** de tocarlos (control negativo, ocho casos contra el Postgres local) + la migración **070** con las tres correcciones en una sola redefinición y transacción explícita (D-01/D-05) + espejo quirúrgico en `schema.sql`

**Wave 2** *(blocked on 16-01)*

- [x] 16-02-PLAN.md — La matriz **por dirección** del gate de modo (dos seguras que pasan, dos peligrosas que rechazan) + GATE-02 y GATE-03 en los **dos** gates, cada caso nuevo visto FALLAR contra el predicado viejo (D-07) + `16-RUNBOOK-070.md`

**Waves**: cadena **secuencial**, sin paralelismo. 16-01 mide, corrige y aplica al local; 16-02 no puede escribir un solo caso contra un predicado que todavía no existe, y su control negativo A/B necesita poder instalar y desinstalar los cuerpos viejos. `files_modified` disjuntos (`supabase/` vs `test/`) para que el rojo esperado de 16-01 —la suite de modo queda con 3 casos en rojo, previstos y declarados— lo cierre 16-02 sin pisarse.

**Security/Integrity relevance**: **ALTA — `secure-phase` obligatorio.** Se estrecha un gate que cierra el riesgo residual R-1 de v0.26 y que acaba de pasar auditoría (`SECURED 32/32`). El register nuevo tiene que **demostrar** que estrechar no reabre R-1 en las direcciones peligrosas — no alcanza con argumentarlo. GATE-03 es además un cambio **permisivo**: hay que evaluar el alta manual, que está **exenta** de la ventana de reserva y en teoría puede crear turnos en el pasado.
**UI hint**: no (es SQL; el mapeo de los rechazos a copy ya existe desde 15-02)

---

### Phase 17: Superficie y polish

**Goal**: Que el dueño **entienda** lo que la Phase 15 hizo declarable, y cerrar los pendientes de presentación. Lo central es el **copy**: hoy el editor mete los dos modos de cupo compartido en la misma bolsa —*"Clase grupal y Recurso simultáneo: varios lugares por turno"*— y un dueño no tiene con qué elegir, cuando la diferencia es exactamente lo que v0.26 tardó tres migraciones en modelar (grupal cuenta por **hora de inicio**, simultáneo por **solape**); elegir mal significa que alguien se sume a mitad de clase, o que se le llene la agenda antes de tiempo. Más los **tres defectos** que levantó la UAT (el campo de cupo no se puede editar con el teclado, los toggles del modal quedan desacomodados, el `+` del alta debería ser un "Guardar" al final), el **badge de modo** en la lista, la **grilla de la agenda** leyendo `services.capacity` y mostrando la ocupación grupal, y **Finanzas mobile** con el servicio.
**Depends on**: Phase 16 (la grilla y el editor conviven con el gate corregido; conviene que el comportamiento nuevo ya esté en la base antes de explicarlo en pantalla)
**Requirements**: CUPO-09, POLISH-08, POLISH-09, POLISH-10
**Success Criteria** (what must be TRUE):

  1. El editor **explica la diferencia** entre grupal y simultáneo con el eje de conteo, no como dos etiquetas intercambiables (CUPO-09).
  2. Los tres defectos del editor están cerrados: el campo de cupo se puede editar con el teclado, los toggles quedan alineados, y el alta confirma con un "Guardar" al final del formulario (CUPO-09).
  3. La lista de `/servicios` muestra el modo de cada servicio sin abrirlo (POLISH-08).
  4. La grilla de la agenda calcula la ocupación desde **`services.capacity`** —la misma fuente que el motor— y muestra la ocupación **grupal** con el mismo tratamiento que la simultánea (POLISH-09).
  5. Finanzas en mobile muestra el servicio de cada movimiento (POLISH-10).

**Plans**: 8/8 plans complete

Plans:
**Wave 1**

- [x] 17-01-PLAN.md — El editor **explica** los tres modos: `CAPACITY_MODE_HELP` como fuente única de label + eje + ejemplo + advertencia (D-01/D-02/D-03/D-04), el radiogroup en grid determinista (D-13) y el campo de cupo con commit en `onBlur` (D-06) — CUPO-09
- [x] 17-04-PLAN.md — `lib/agenda-occupancy.ts`: la ocupación y el agrupamiento por slot como funciones **puras** (`buildDayEntries`, `computeOverlapFull`, `capacityOf`, `occupiesSeat`) + su suite con **2 casos discriminantes probados por mutación**, y Finanzas mobile con el servicio — POLISH-09 / POLISH-10

**Wave 2** *(17-02 blocked on 17-01 · 17-05 blocked on 17-04)*

- [x] 17-02-PLAN.md — El diálogo "Editar servicio" scrollea por dentro con el `DialogFooter` anclado (D-05, sin tocar el componente base) + el alta confirma con "Agregar servicio" al final y sin doble submit — CUPO-09
- [x] 17-05-PLAN.md — La columna del día consume el módulo puro: se borra la lectura del cupo por bloque y la deducción del modo (D-11), `OccupancyBadge` compartido por los dos modos, la clase grupal colapsa en **una** línea con contador `3/6` y un solo clickeable (D-10/D-12) — POLISH-09

**Wave 3** *(blocked on 17-02)*

- [x] 17-03-PLAN.md — `CapacityInlineControl`: el badge de modo **es** el control de cupo en la tarjeta de `/servicios` (D-07/D-08/D-09), con `saveCapacityInline` como **segundo write path** (filtro por tenant, payload `{ capacity }`, copy propia del rechazo) y estado de guardado **por tarjeta** — POLISH-08

**Cierre de gaps de la UAT** *(la UAT dio 7 pass / 3 issues — los tres de layout a 375px, ninguno de lógica)*

**Wave 1 (gaps)** *(archivos distintos: paralelismo real)*

- [x] 17-06-PLAN.md — **G-02 + G-02b**: las acciones de la tarjeta de `/servicios` salen de la fila del dato y la línea de datos recupera los 271px reales; el control se parte en dos (el modo como dato inline, el stepper con `basis-full` en su propia línea) para que `[−] N [+] [Guardar]` entre en un renglón — POLISH-08
- [x] 17-07-PLAN.md — **G-03**: el chip del slot grupal de la agenda pasa a dos niveles (hora + nombre arriba, contador abajo) y el badge se acota con `max-w-full`, sin tocar `lib/agenda-occupancy.ts` ni un solo color — POLISH-09

**Wave 2 (gaps)** *(17-08 blocked on 17-06: mismo archivo, otra región)*

- [x] 17-08-PLAN.md — **G-01**: el explicador muestra completo sólo el modo seleccionado y deja los otros dos en una línea con su eje de conteo (D-02 revisada por la UAT), conservando el texto completo en el canal accesible para que comparar siga sin exigir tocar un control que escribe — CUPO-09

**El patrón de los tres gaps, en una línea**: son el mismo problema con tres disfraces — piezas diseñadas para un ancho que a 375px no existe. La fase trae su propio contraejemplo: **POLISH-10 (Finanzas mobile) pasó limpio** porque ahí el dato nuevo entró en **su propia línea** bajo el nombre del cliente en vez de pelear por ancho dentro de una fila llena. G-02 y G-03 hicieron lo contrario. Los fixes aplican esa misma regla.

**Waves**: dos cadenas en paralelo que no comparten un solo archivo. La de `settings-client.tsx` es **secuencial** (17-01 → 17-02 → 17-03): los tres planes editan el mismo archivo, así que paralelizarlos sería una ficción que el orquestador serializaría igual. La de la agenda parte la lógica de la pintura (17-04 → 17-05) porque el runner corre en `environment: 'node'` y no renderiza JSX: lo testeable se extrae y se congela antes de tocar la grilla. **Rojo conocido y declarado:** al cerrar 17-04 el módulo queda sin consumidores y `agenda-client.tsx` sigue con su lógica vieja — lo cierra 17-05, y ningún criterio de 17-04 depende de eso.

**Security/Integrity relevance**: Baja. No toca el motor, los constraints ni el aislamiento por tenant. Dos precauciones: el editor escribe `capacity_mode` y `capacity`, así que sigue teniendo que **mapear el rechazo del gate a copy propia** en vez de interpolar el error de la base (T-14-25 / T-13-09); y POLISH-09 **no es cosmético** — `agenda-client.tsx:467` lee `time_blocks.capacity`, que desde la 068 **ya no decide nada**, así que hoy la grilla calcula "lleno" con un número que el motor ignora. No se nota porque todo vale 1, pero miente en cuanto se declare una clase de cupo > 1. Es la **cuarta** lectura que D-08 dejó para esta fase.
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 (v0.12, shipped) → 4 → 5 (v0.22, shipped) → 6 → 7 (v0.24, shipped) → 8 → 9 → 10 → 11 (v0.25, shipped 2026-07-28) → 12 → 13 → 14 (v0.26, shipped 2026-08-11) → **15 → 16 → 17 (v0.27, activo)**. Los cinco milestones cerrados quedan en el historial.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Turnos Manuales | 4/4 | Complete    | 2026-06-26 |
| 2. Cupos Grupales | 5/5 | Complete   | 2026-06-29 |
| 3. Espacio Compartido | 5/5 | Complete    | 2026-06-30 |
| 4. Ventana de reserva pública | 4/4 | Complete | 2026-07-19 |
| 5. Aviso al cliente en el alta manual | 2/2 | Complete | 2026-07-19 |
| 6. Modelo del abono + alta manual + generación forward | 8/8 | Complete   | 2026-07-21 |
| 7. Cancelación del abono (mail + panel) | 12/12 | Complete    | 2026-07-22 |
| 8. Equipo — qué servicios hace cada profesional | 2/2 | Complete    | 2026-07-24 |
| 9. Asignación automática atómica de profesional | 2/2 | Complete    | 2026-07-25 |
| 10. Reservar con "cualquiera" desde la página pública | 5/5 | Complete    | 2026-07-27 |
| 11. Cierre de backlog | 4/4 | Complete    | 2026-07-27 |
| 12. Cupo por solape (recurso simultáneo) | 4/4 | Complete    | 2026-07-29 |
| 13. Borrado de servicio preservando historial | 5/5 | Complete    | 2026-08-03 |
| 14. Cierre de backlog | 9/9 | Complete    | 2026-08-11 |
| 15. Modelo de cupo unificado | 5/5 | Complete    | 2026-08-16 |
| 16. Correcciones del gate | 2/2 | Complete    | 2026-08-18 |
| 17. Superficie y polish | 8/8 | Complete   | 2026-08-24 |
