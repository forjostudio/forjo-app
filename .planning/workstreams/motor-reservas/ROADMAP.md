# Roadmap: Forjo App — Motor de Reservas (v0.12)

> Workstream `motor-reservas`. Numeración de fases reiniciada en Phase 1 (workstream nuevo). PROJECT.md compartido en `.planning/PROJECT.md`; requirements en `.planning/workstreams/motor-reservas/REQUIREMENTS.md`.

## Overview

El milestone convierte "agenda" de *1-turno-por-slot / 1-recurso = 1-profesional* en un recurso reservable real con capacidad (cupos grupales) y relaciones de espacio físico (canchas), más turnos manuales desde el panel — para desbloquear rubros nuevos (gimnasios, clases grupales, canchas). El núcleo de integridad que endureció v0.9 (constraints 011/013 + concurrencia anti-doble-booking) se toca con cuidado: cada fase preserva el aislamiento por tenant (RLS + `business_id`) y la garantía anti-doble-booking, con **cero regresión** para el caso 1-turno-por-slot. El faseo va por riesgo creciente: primero turnos manuales (no toca constraints), después cupos grupales (redefine constraints a capacity-aware + concurrencia anti-sobrecupo), y por último espacio compartido (exclusión acoplada entre agendas), construido sobre el modelo de capacidad/concurrencia de la fase anterior y recortable como fase final sin tocar lo entregado.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Faseo LOCKED por el encuadre §3 (manual → cupos → espacio).

- [x] **Phase 1: Turnos Manuales** - El dueño crea turnos desde el panel reusando el pipeline de booking, sin tocar los constraints de integridad (completed 2026-06-26)
- [x] **Phase 2: Cupos Grupales** - `capacity` por bloque + constraints capacity-aware + concurrencia atómica anti-sobrecupo, con cero regresión para cupo 1 (completed 2026-06-29)
- [x] **Phase 3: Espacio Compartido** - Recurso/espacio físico + exclusión acoplada entre agendas que comparten espacio (cancha F11 = 3 cruzadas) (completed 2026-06-30)

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

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Turnos Manuales | 4/4 | Complete    | 2026-06-26 |
| 2. Cupos Grupales | 5/5 | Complete   | 2026-06-29 |
| 3. Espacio Compartido | 5/5 | Complete    | 2026-06-30 |
