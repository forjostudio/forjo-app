# Roadmap: Forjo App — Vertical Canchas (v0.13)

> Workstream `canchas`. Numeración de fases reiniciada en Phase 1 (workstream nuevo). PROJECT.md compartido en `.planning/PROJECT.md`; requirements en `.planning/workstreams/canchas/REQUIREMENTS.md`. Scopear comandos GSD con `--ws canchas`.

## Overview

Este milestone le da al rubro **canchas** (alquiler de canchas deportivas) una experiencia dedicada de punta a punta —configuración propia en el dashboard y reserva pública propia— construida **ENCIMA del motor de espacio compartido de v0.12, que ya está live**. NO se re-construye ni se re-migra el motor: las tablas `spaces`/`agenda_spaces`/`appointment_spaces`, la RPC atómica `book_slot_atomic` (advisory lock por espacio + EXISTS anti-solape + EXCLUDE gist de backstop) y la disponibilidad acoplada de `/api/booking/availability` ya están en prod (migraciones 040/041/042). El eje de agenda sigue siendo una fila de `professionals` (cada cancha es, por debajo, un "bucket"/agenda), y el anti-solape es por **duración**, no por slot fijo — así que la duración variable por cancha ya está soportada por el motor.

El faseo va de adentro hacia afuera: primero el **scaffold del vertical** (que el dashboard adopte terminología/menú de canchas, SIN "Profesionales/Equipo", sin romper los otros verticales), después el **modelo de cancha** como entidad reservable unificada (nombre + precio propio + duración fija seteada por el dueño, mapeada a espacios físicos del motor), y por último el **booking público de alquiler** que consume ese modelo y hereda la exclusión atómica por espacio. El aislamiento por tenant (RLS + `business_id`) es no negociable en todo dato nuevo, y el booking público hereda la atomicidad anti-conflicto del motor sin debilitarla.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Faseo: vertical-scaffold → cancha-config → booking-público (el modelo del vertical y de la cancha aterrizan antes de que el flujo público los consuma).

- [ ] **Phase 1: Vertical Canchas** - El negocio setea su rubro a "canchas" y el dashboard adopta terminología y menú propios (sin "Profesionales/Equipo"), sin romper los otros verticales
- [ ] **Phase 2: Configuración de Canchas** - El dueño crea/edita/elimina canchas como entidad reservable (nombre + precio propio + duración fija propia) mapeada a espacios físicos del motor v0.12
- [ ] **Phase 3: Booking público de alquiler** - El cliente elige cancha + horario disponible (sin elegir duración), al precio de la cancha, respetando la exclusión atómica por espacio

## Phase Details

### Phase 1: Vertical Canchas

**Goal**: Que un negocio pueda operar como rubro "canchas": setea su tipo/vertical a canchas y el dashboard adopta su terminología y menú propios (eje de agenda = "Cancha", SIN el item "Profesionales/Equipo", que no aplica al rubro en el 99% de los casos), reutilizando y extendiendo el sistema de verticales existente (`lib/verticals.ts` + `lib/use-terminology.tsx`). El cambio es de scaffolding del vertical: deja la terminología/menú listos para que las fases siguientes cuelguen de ellos, garantizando cero regresión en salud/belleza/general y en los negocios existentes.
**Depends on**: Nothing (first phase)
**Requirements**: VERT-01, VERT-02
**Success Criteria** (what must be TRUE):

  1. Un negocio puede setear su rubro a "canchas" (desde onboarding/settings) y queda resuelto al vertical correcto con su terminología propia (eje de agenda = "Cancha"/"Canchas").
  2. El dashboard del rubro canchas NO muestra "Profesionales/Equipo" en el menú; la terminología visible (turnos, agenda, etc.) es la del rubro.
  3. Los verticales existentes (salud/belleza/general) y los negocios ya creados resuelven exactamente igual que antes — cero regresión visible en su terminología y menú.
  4. La resolución de vertical es determinística y sin estado roto: un negocio sin el rubro canchas nunca ve UI de canchas, y uno de canchas nunca ve UI de profesionales.

**Plans**: 1 plan
- [ ] 01-01-PLAN.md — Vertical 'canchas' como VerticalKey de primera clase (terminología Reserva+Cancha, menú sin Equipo) + removal de TYPE_TERMINOLOGY_OVERRIDE + guard server-side anti-/equipo (D-05)
**Phase-level decision (defer to discuss-phase)**: cómo se resuelve "canchas" como vertical/type — ¿es un `VerticalKey` nuevo (`canchas`) con su propio `VerticalConfig` (menú sin `equipo`, terminología propia), o se eleva el `TYPE_TERMINOLOGY_OVERRIDE` actual de "Cancha de fútbol" (hoy label-only dentro de `general`) a una config de menú/terminología completa? Hay ya un override label-only en `lib/verticals.ts`; decidir en discuss si se promueve a vertical de primera clase o se extiende el mecanismo de override para esconder items de menú. NO lockear acá.

**Security/Integrity relevance**: Bajo. El cambio es de presentación (terminología/menú) y resolución de vertical, framework-agnóstico (sin React/iconos en `lib/verticals.ts`). No agrega datos de tenant nuevos. El riesgo real es de **regresión** (no romper la resolución de los otros verticales ni de los negocios existentes), no de aislamiento. Si la decisión de fase agrega una columna nueva al negocio (ej. marcar el rubro), debe respetar el aislamiento por `business_id` ya vigente en `businesses`.

### Phase 2: Configuración de Canchas

**Goal**: El dueño de un negocio de canchas gestiona sus canchas desde el dashboard como **entidad reservable unificada**: cada cancha tiene nombre, **precio propio** y **duración fija seteada por el dueño** (la duración puede diferir entre canchas — ej. Cruzada A 60min, Cancha 11 90min), y se le asocia uno o más **espacios físicos** del motor de v0.12. Por debajo, cada cancha sigue mapeando a una agenda (`professionals`) + sus `spaces` vía `agenda_spaces`, reutilizando el motor SIN re-migrarlo: el mapeo cancha→espacios sigue acoplando la disponibilidad exactamente como hoy. Reemplaza la UI genérica interina de config de espacios (en `settings-client.tsx` + tab Equipo) por una UI propia de canchas.
**Depends on**: Phase 1
**Requirements**: CANCHA-01, CANCHA-02, CANCHA-03
**Success Criteria** (what must be TRUE):

  1. El dueño crea una cancha con nombre, su propio precio y su propia duración fija, y le asocia uno o más espacios físicos.
  2. El dueño edita y elimina canchas; dos canchas distintas pueden tener duraciones distintas, y cada una conserva la suya.
  3. La config de canchas reusa el motor de v0.12 (`spaces`/`agenda_spaces`) sin re-migrar el core: el mapeo cancha→espacios sigue acoplando la disponibilidad (reservar una cancha que comparte espacio bloquea a las hermanas).
  4. Una cancha de un negocio nunca aparece, se edita ni se mapea a espacios de otro negocio — el modelo de cancha y su mapeo a espacios están aislados por tenant.

**Plans**: TBD
**Phase-level decision (defer to discuss-phase)**: **dónde viven el precio y la duración fija de la cancha.** Opciones a evaluar en discuss-phase (NO lockear acá): (a) reusar `services` (un servicio por cancha que aporta precio + duración, ya soportado por el motor anti-solape por duración) y el mapeo agenda↔servicio; (b) columnas nuevas (`price`, `duration_min`) sobre la fila de agenda/`professionals` que representa la cancha; (c) tabla/columna nueva dedicada a la cancha. Evaluar qué minimiza migración y reusa el camino de precio/seña existente. Toda opción que agregue columnas/tablas exige RLS habilitada + policies por operación con `WITH CHECK (business_id ∈ negocios del dueño)`.

**Security/Integrity relevance**: Medio. Introduce/reusa datos de tenant (la cancha y su precio/duración + el mapeo a espacios). Toda tabla/columna nueva debe tener RLS habilitada y policies por operación que impidan crear/leer/mapear canchas o espacios de otro tenant (filtro `business_id`, `WITH CHECK` en INSERT/UPDATE). El mapeo cancha→espacios reusa `agenda_spaces` (ya RLS por tenant en v0.12) — no debilitarlo. El secure-phase gate verifica: aislamiento por tenant del modelo de cancha y de su mapeo a espacios; que un negocio no pueda acoplar disponibilidad cross-tenant; que no se exponga el precio/config interna a `anon` salvo lo que el booking público necesita (vía vista acotada, patrón `public_services`/`public_professionals`).

### Phase 3: Booking público de alquiler

**Goal**: La página pública `/[slug]` del negocio de canchas permite al cliente final (no autenticado) **elegir una cancha + un horario disponible** y reservarla al **precio propio de la cancha**, SIN elegir duración (la duración es la fija que seteó el dueño en Phase 2). Si el cliente quiere más tiempo, saca **dos turnos consecutivos** (no hay picker de duración custom — descartado por diseño). La reserva hereda la **exclusión atómica por espacio** del motor de v0.12: reservar una cancha que comparte un espacio con otra ocupada en horario solapado se rechaza, con el mismo chequeo atómico (`book_slot_atomic`) y disponibilidad acoplada (`/api/booking/availability`) que ya están en prod.
**Depends on**: Phase 2
**Requirements**: ALQUILER-01, ALQUILER-02, ALQUILER-03, ALQUILER-04
**Success Criteria** (what must be TRUE):

  1. En la página pública, el cliente elige una cancha y un horario disponible y completa la reserva; NO se le pide ni se le ofrece elegir duración (queda la fija de la cancha).
  2. El precio mostrado y asociado a la reserva es el precio propio de la cancha (Phase 2), no un precio genérico.
  3. Reservar una cancha respeta la exclusión por espacio: si comparte espacio con otra ocupada en un horario solapado, ese horario no aparece disponible / la reserva se rechaza (hereda la atomicidad de `book_slot_atomic`, sin sobre-reserva bajo concurrencia).
  4. Para más tiempo que la duración de la cancha, el cliente puede sacar dos turnos consecutivos sobre el mismo recurso (sin duración custom).

**Plans**: TBD
**UI hint**: yes
**Phase-level decision (defer to discuss-phase)**: cómo la vista pública lee el precio/duración/disponibilidad de la cancha depende de dónde quedó el modelo en Phase 2 (servicio vs columnas vs tabla) — qué vista acotada (`public_*`) expone la cancha a `anon` sin filtrar config interna. Resolver en discuss-phase de esta fase, una vez lockeado el modelo de Phase 2.

**Security/Integrity relevance**: Alto (público + concurrencia). El flujo corre por el camino anónimo (service role en el route handler, tenant resuelto por slug) y DEBE: (a) heredar la atomicidad anti-conflicto de `book_slot_atomic` sin debilitarla — nunca un `count`/check de disponibilidad suelto sin el lock atómico; (b) re-validar la cancha/servicio/espacios por `business_id` (anti-tampering de tenant: nunca confiar en IDs del cliente — patrón ya vigente en `/api/booking/create`); (c) exponer a `anon` solo lo necesario vía vista acotada, sin filtrar precio/config interna ni la grilla de otro negocio; (d) respetar el gating de `plan_status` y reCAPTCHA del booking público existente. El secure-phase gate verifica: anti-tampering de cancha/espacio, atomicidad heredada (no sobre-reserva concurrente entre canchas que comparten espacio), y que la vista pública de canchas no exponga datos de otro tenant.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Vertical Canchas | 0/1 | Not started | - |
| 2. Configuración de Canchas | 0/TBD | Not started | - |
| 3. Booking público de alquiler | 0/TBD | Not started | - |
