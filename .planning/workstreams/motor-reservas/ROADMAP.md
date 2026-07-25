# Roadmap: Forjo App — Motor de Reservas (workstream `motor-reservas`)

> Workstream `motor-reservas`. Cubre **v0.12 Motor de Reservas** (Phases 1-3, shipped 2026-06-30), **v0.22 Turnos: alta manual y ventana de reserva** (Phases 4-5, shipped 2026-07-19), **v0.24 Turnos fijos / Abonos recurrentes** (Phases 6-7, shipped 2026-07-22) y **v0.25 Reserva con varios profesionales / multi-staff** (Phases 8-11, en planificación). Numeración de fases **continua** por workstream: el próximo milestone arranca en **Phase 12**. PROJECT.md compartido en `.planning/PROJECT.md`; los requirements de cada milestone se archivan en `.planning/milestones/`.

## Overview

**v0.12 (shipped):** El milestone convierte "agenda" de *1-turno-por-slot / 1-recurso = 1-profesional* en un recurso reservable real con capacidad (cupos grupales) y relaciones de espacio físico (canchas), más turnos manuales desde el panel — para desbloquear rubros nuevos (gimnasios, clases grupales, canchas). El núcleo de integridad que endureció v0.9 (constraints 011/013 + concurrencia anti-doble-booking) se toca con cuidado: cada fase preserva el aislamiento por tenant (RLS + `business_id`) y la garantía anti-doble-booking, con **cero regresión** para el caso 1-turno-por-slot. El faseo va por riesgo creciente: primero turnos manuales (no toca constraints), después cupos grupales (redefine constraints a capacity-aware + concurrencia anti-sobrecupo), y por último espacio compartido (exclusión acoplada entre agendas), construido sobre el modelo de capacidad/concurrencia de la fase anterior y recortable como fase final sin tocar lo entregado.

**v0.22 — Turnos: alta manual y ventana de reserva (shipped 2026-07-19):** dos mejoras acotadas sobre el motor ya entregado, **sin reconstruir nada de v0.12**. (1) **Ventana de reserva:** el dueño limita hasta con cuánta anticipación puede reservar el público (una sola métrica global por negocio, `businesses.max_advance_days`, vacío/0 = sin límite); el tope se respeta en los **dos** calendarios públicos (general + canchas) y, como **backstop anti-tampering**, en el servidor (`app/api/booking/create`) — el alta manual autenticada queda **exenta**. (2) **Aviso al cliente:** el form "Nuevo turno" ya existente (v0.12: `app/api/appointments/create`) suma un checkbox **opt-in** para mandarle al cliente un mail de turno confirmado, respetando el default de v0.12 (no se manda salvo que se pida). Las dos mejoras son superficies distintas (público vs. alta autenticada) → una fase cada una.

**v0.24 — Turnos fijos / Abonos recurrentes (shipped 2026-07-22):** capacidad NUEVA sobre el motor ya entregado: el dueño arma un **abono semanal** (turno fijo recurrente) para un cliente desde el panel; el sistema **genera los turnos hacia adelante** (ventana rolling, extendida por el cron diario existente) respetando la integridad anti-doble-booking (constraints 011/013), los cupos/capacity y la exclusión por espacio compartido (canchas); el cliente **cancela la suscripción** desde un link en el mail y el dueño la da de baja desde el panel. **Solo reserva** — el cobro recurrente automático es un milestone futuro, pero el **modelo de datos se diseña extensible** para sumarlo sin re-migrar. Toca el núcleo de integridad anti-doble-booking + el aislamiento por tenant → la fase del modelo/generación es **security-sensitive** (secure-phase obligatorio). El faseo va por integridad: primero el modelo + alta + generación forward (el núcleo sensible), después la cancelación (mail + panel), que depende de la serie ya existente.

**v0.25 — Reserva con varios profesionales / multi-staff (Phases 8-11, en planificación):** capacidad NUEVA sobre el motor ya entregado, **sin reconstruirlo**. El negocio declara **qué servicios hace cada persona** del equipo (mapeo **muchos a muchos** propio, migración **057** — `professionals.service_id` es *single* y es el mecanismo de **canchas** (migr. 043): NO se toca ni se recicla), y el cliente reserva **eligiendo profesional o dejando "cualquiera"**; en ese caso el sistema le asigna uno **libre y capaz** eligiendo el que menos turnos tiene ese día. La asignación automática corre **DENTRO del RPC atómico `book_slot_atomic`** — leer profesionales libres y después insertar sería una carrera —, por lo que la fase de asignación es el punto de mayor riesgo del milestone (**secure-phase obligatorio**). El faseo va por dependencia y riesgo creciente: primero el **modelo + config del equipo** (no toca el motor), después la **asignación atómica** en el RPC (el núcleo anti-doble-booking), después la **disponibilidad across staff** en las superficies públicas (que necesita saber quién puede hacer qué), y al cierre un **backlog chico** independiente del motor. **Cero regresión obligatoria** en: canchas, abonos (generación forward por el mismo motor), cupos grupales (`time_blocks.capacity`) y exclusión por espacio compartido. **Fuera de alcance:** el **cupo por solape** (`capacity > 1` contado por hora de inicio exacta) — bug real y capturado, pero independiente de multi-staff y sobre el mismo RPC → **v0.26**, para no meter dos cambios grandes al núcleo en el mismo ciclo.

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

### Milestone v0.25 — Reserva con varios profesionales / multi-staff (en planificación)

Faseo por dependencia y riesgo: el mapeo staff↔servicios habilita la asignación, y la disponibilidad across staff necesita saber quién puede hacer qué. El backlog chico va al final, separado del motor.

- [x] **Phase 8: Equipo — qué servicios hace cada profesional** - Mapeo muchos a muchos staff↔servicios (migración 057, tabla puente propia) + config y cobertura desde el panel, sin tocar el motor de reservas (completed 2026-07-24)
- [x] **Phase 9: Asignación automática atómica de profesional** - "Cualquiera" resuelto DENTRO de `book_slot_atomic`: elige un profesional libre y capaz (el de menos turnos ese día) sin carreras ni sobre-reserva (**secure-phase obligatorio**) (completed 2026-07-25)
- [ ] **Phase 10: Reservar con "cualquiera" desde la página pública** - Opción "cualquiera" en el selector + disponibilidad across staff en la grilla + profesional asignado visible en la confirmación y el mail
- [ ] **Phase 11: Cierre de backlog** - Chip Cancelado/Completado en Archivados de Abonos, `setState`-in-effect de `clients-client.tsx`, y el borde lateral de las 2 pantallas de cancelación

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

**Plans**: 5 plans

Plans:
**Wave 1**

- [ ] 10-01-PLAN.md — Backend: migr 059 (`public_professional_services`) + rama de agregación `any=1&serviceId` en availability (DISP-01/03, D-06) + wiring `anyProfessional`→`autoAssign` en create (ASIGN-01, D-05)
- [ ] 10-03-PLAN.md — Mail ASIGN-05: param `professionalName` en `sendConfirmationEmail` + los DOS callers (`notify/booking` sin seña, `payment/webhook` con seña)

**Wave 2** *(blocked on 10-01)*

- [ ] 10-02-PLAN.md — Front: read-path de `public_professional_services` en `page.tsx` + tarjeta "Cualquiera" gateada por 2+ capaces (D-02/D-03) + señal `any`/`anyProfessional` (D-05); canchas intacto (D-09)

**Wave 3** *(blocked on 10-01, 10-02, 10-03)*

- [ ] 10-04-PLAN.md — `[BLOCKING] supabase db reset` (apply local 059) + `test/booking-cualquiera-public.test.ts` (DISP-01/02/03 + ASIGN-05) + regresión de canchas/booking público/core

**Wave 4** *(blocked on 10-04)*

- [ ] 10-05-PLAN.md — Checkpoint humano: verificación end-to-end de la reserva pública con "Cualquiera" (con la vista 059 viva)

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

**Plans**: TBD
**UI hint**: yes
**Security/Integrity relevance**: Bajo riesgo. Los tres ítems son de presentación o de higiene de render; no tocan el motor de reservas, los constraints, el aislamiento por tenant ni el flujo de cancelación en sí. Único cuidado: las pantallas de cancelación son **públicas y anónimas** y ya están endurecidas (404 genérico, token no adivinable, el número lo informa el servidor, `noindex`, contraste derivado por luminancia) — el retoque visual no puede aflojar ninguna de esas propiedades ni cambiar qué datos se muestran antes de autenticar el token.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 (v0.12, shipped) → 4 → 5 (v0.22, shipped) → 6 → 7 (v0.24, shipped) → 8 → 9 → 10 → 11 (v0.25, en planificación). El próximo milestone del workstream arranca en Phase 12.

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
| 10. Reservar con "cualquiera" desde la página pública | 0/5 | Not started | - |
| 11. Cierre de backlog | 0/? | Not started | - |
