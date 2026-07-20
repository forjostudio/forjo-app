# Roadmap: Forjo App — Motor de Reservas (workstream `motor-reservas`)

> Workstream `motor-reservas`. Cubre **v0.12 Motor de Reservas** (Phases 1-3, shipped 2026-06-30), **v0.22 Turnos: alta manual y ventana de reserva** (Phases 4-5, shipped 2026-07-19) y **v0.24 Turnos fijos / Abonos recurrentes** (Phases 6-7, activo). Numeración de fases **continua** por workstream: v0.24 arranca en **Phase 6**. PROJECT.md compartido en `.planning/PROJECT.md`; requirements en `.planning/workstreams/motor-reservas/REQUIREMENTS.md`.

## Overview

**v0.12 (shipped):** El milestone convierte "agenda" de *1-turno-por-slot / 1-recurso = 1-profesional* en un recurso reservable real con capacidad (cupos grupales) y relaciones de espacio físico (canchas), más turnos manuales desde el panel — para desbloquear rubros nuevos (gimnasios, clases grupales, canchas). El núcleo de integridad que endureció v0.9 (constraints 011/013 + concurrencia anti-doble-booking) se toca con cuidado: cada fase preserva el aislamiento por tenant (RLS + `business_id`) y la garantía anti-doble-booking, con **cero regresión** para el caso 1-turno-por-slot. El faseo va por riesgo creciente: primero turnos manuales (no toca constraints), después cupos grupales (redefine constraints a capacity-aware + concurrencia anti-sobrecupo), y por último espacio compartido (exclusión acoplada entre agendas), construido sobre el modelo de capacidad/concurrencia de la fase anterior y recortable como fase final sin tocar lo entregado.

**v0.22 — Turnos: alta manual y ventana de reserva (shipped 2026-07-19):** dos mejoras acotadas sobre el motor ya entregado, **sin reconstruir nada de v0.12**. (1) **Ventana de reserva:** el dueño limita hasta con cuánta anticipación puede reservar el público (una sola métrica global por negocio, `businesses.max_advance_days`, vacío/0 = sin límite); el tope se respeta en los **dos** calendarios públicos (general + canchas) y, como **backstop anti-tampering**, en el servidor (`app/api/booking/create`) — el alta manual autenticada queda **exenta**. (2) **Aviso al cliente:** el form "Nuevo turno" ya existente (v0.12: `app/api/appointments/create`) suma un checkbox **opt-in** para mandarle al cliente un mail de turno confirmado, respetando el default de v0.12 (no se manda salvo que se pida). Las dos mejoras son superficies distintas (público vs. alta autenticada) → una fase cada una.

**v0.24 — Turnos fijos / Abonos recurrentes (activo):** capacidad NUEVA sobre el motor ya entregado: el dueño arma un **abono semanal** (turno fijo recurrente) para un cliente desde el panel; el sistema **genera los turnos hacia adelante** (ventana rolling, extendida por el cron diario existente) respetando la integridad anti-doble-booking (constraints 011/013), los cupos/capacity y la exclusión por espacio compartido (canchas); el cliente **cancela la suscripción** desde un link en el mail y el dueño la da de baja desde el panel. **Solo reserva** — el cobro recurrente automático es un milestone futuro, pero el **modelo de datos se diseña extensible** para sumarlo sin re-migrar. Toca el núcleo de integridad anti-doble-booking + el aislamiento por tenant → la fase del modelo/generación es **security-sensitive** (secure-phase obligatorio). El faseo va por integridad: primero el modelo + alta + generación forward (el núcleo sensible), después la cancelación (mail + panel), que depende de la serie ya existente.

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

### Milestone v0.24 — Turnos fijos / Abonos recurrentes (activo)

Faseo por integridad: primero el modelo del abono + alta manual + generación forward (núcleo anti-doble-booking → **secure-phase**), después la cancelación (mail + panel), que depende de que la serie ya exista.

- [ ] **Phase 6: Modelo del abono + alta manual + generación forward** - Entidad de abono semanal extensible (migración 054), alta manual por el dueño reusando el pipeline de alta de turno, y generación forward de los appointments (ventana rolling en el cron diario) respetando 011/013 + cupos + espacio compartido, cada turno vinculado al abono
- [ ] **Phase 7: Cancelación del abono (mail + panel)** - Link de "cancelar suscripción" en el mail (token a nivel serie) + baja del abono desde el panel del dueño; deja de generar turnos futuros y maneja los ya generados

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

**Plans**: 1/5 plans executed

Plans:
**Wave 1**

- [x] 06-01-PLAN.md — Migración 054 (tabla `abonos` extensible + FK `appointments.abono_id` + `businesses.abono_window_weeks`, RLS owner-only) + `supabase db reset` + schema.sql + tipos

**Wave 2** *(blocked on Wave 1)*

- [ ] 06-02-PLAN.md — Motor `lib/abono-generation.ts` (generación forward vía `createAppointmentCore`, skip-and-record ante conflicto, `abono_id`, idempotente) + tests

**Wave 3** *(blocked on Wave 2)*

- [ ] 06-03-PLAN.md — Endpoint `POST /api/abonos/create` (auth por owner_id, anti-tampering, primera tanda, 1 mail) + `sendAbonoConfirmation` + tests
- [ ] 06-04-PLAN.md — Extensión de la ventana rolling en el cron diario `cancel-expired` (piggyback, best-effort) + tests

**Wave 4** *(blocked on Wave 3)*

- [ ] 06-05-PLAN.md — UI: sección /abonos (form día-de-la-semana + hora + control de ventana), badge "fijo/abono" en la agenda, detalle con ocurrencias salteadas + checkpoint humano

**Waves**: Wave 1 = 06-01 (espinazo de datos). Wave 2 = 06-02 (motor, depende del schema/tipos). Wave 3 = 06-03 + 06-04 en paralelo (endpoint de alta · extensión del cron; archivos disjuntos, ambos dependen del motor). Wave 4 = 06-05 (UI, depende del endpoint).

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

**Plans**: TBD
**UI hint**: yes
**Security/Integrity relevance**: El **token de cancelación** del mail debe dar de baja **solo** el abono al que corresponde: token no adivinable, comparado con `timingSafeEqual` (patrón del cancel-token de turno actual), sin permitir cancelar la serie de otro tenant manipulando el link — un cliente no puede tocar el abono de otro negocio. La baja desde el panel es una acción autenticada del dueño sobre un abono de SU negocio (RLS + `business_id`/`owner_id`). Frenar la generación y (según decisión) cancelar los turnos futuros ya generados no puede tocar turnos de otra serie ni de otro tenant. Riesgo acotado frente a Phase 6 (no redefine constraints), pero toca aislamiento por tenant → el secure-phase gate verifica: scoping del token de cancelación a la serie correcta, aislamiento por tenant de la baja (mail y panel), y que frenar/cancelar la serie no afecte turnos ajenos.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 (v0.12, shipped) → 4 → 5 (v0.22, shipped) → 6 → 7 (v0.24, activo)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Turnos Manuales | 4/4 | Complete    | 2026-06-26 |
| 2. Cupos Grupales | 5/5 | Complete   | 2026-06-29 |
| 3. Espacio Compartido | 5/5 | Complete    | 2026-06-30 |
| 4. Ventana de reserva pública | 4/4 | Complete | 2026-07-19 |
| 5. Aviso al cliente en el alta manual | 2/2 | Complete | 2026-07-19 |
| 6. Modelo del abono + alta manual + generación forward | 1/5 | In Progress|  |
| 7. Cancelación del abono (mail + panel) | 0/TBD | Not started | - |
