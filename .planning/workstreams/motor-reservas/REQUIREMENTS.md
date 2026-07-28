# Requirements: v0.25 — Reserva con varios profesionales (multi-staff)

> Workstream `motor-reservas`. Numeración de fases **continua**: v0.25 arranca en **Phase 8**.
> Milestone anterior: v0.24 Turnos fijos / Abonos recurrentes (shipped 2026-07-22, tag v0.24).

## Contexto

Un negocio con varias personas (ej. peluquería con 3 barberos + 1 colorista) hoy no puede expresar
**qué servicios hace cada una**, ni ofrecerle al cliente reservar "con cualquiera". El cliente está
obligado a elegir una agenda puntual, y el dueño no tiene forma de decir "el color solo lo hace Ana".

**Distinción de modelo (LOCKED).** Tres conceptos que NO son lo mismo y que este milestone separa
explícitamente:

| Concepto | Ejemplo | Cómo se modela | Estado |
|---|---|---|---|
| **Varias personas** | 3 barberos | varias agendas (`professionals`) | ← **esto resuelve v0.25** |
| **Clase grupal** | yoga, 10 alumnos, 1 profe | `time_blocks.capacity`, contado por hora de inicio | funciona hoy |
| **Recurso simultáneo** | 2 camillas | capacity contado por **solape** | roto → **v0.26** |

Tres barberos **no son "cupo 3"**: son tres agendas. Intentar resolverlo con `capacity` es lo que
hoy hace imposible "corte 3 / color 1 al mismo horario".

## v1 Requirements (este milestone)

### Equipo y servicios

- [x] **STAFF-01**: El dueño define qué servicios puede hacer cada profesional (relación muchos a muchos) desde el panel.
- [x] **STAFF-02**: El dueño ve, por servicio, qué profesionales lo ofrecen — para detectar servicios sin cobertura.
- [x] **STAFF-03**: Un negocio de 1 profesional, o sin mapeo definido, sigue reservando exactamente como hoy (cero regresión; default sensato sin obligar a configurar).

### Reserva con "cualquiera"

- [x] **ASIGN-01**: En la reserva pública el cliente puede elegir un profesional específico **o** la opción "cualquiera".
- [x] **ASIGN-02**: Con "cualquiera", el sistema asigna automáticamente un profesional libre que sepa hacer el servicio elegido.
- [x] **ASIGN-03**: La asignación automática es **atómica**: dos reservas concurrentes de "cualquiera" sobre el mismo horario nunca reciben el mismo profesional ni sobre-reservan.
- [x] **ASIGN-04**: La asignación elige el profesional con **menos turnos ese día** (reparto de carga entre el equipo).
- [x] **ASIGN-05**: El cliente ve qué profesional le tocó en la pantalla de confirmación y en el mail.

### Disponibilidad

- [x] **DISP-01**: Elegido un servicio, un horario aparece disponible si **algún** profesional capaz lo tiene libre.
- [x] **DISP-02**: Elegido un profesional específico, la disponibilidad es la de esa agenda (comportamiento actual, sin cambios).
- [x] **DISP-03**: Si ningún profesional capaz tiene lugar en un horario, ese horario no se ofrece.

### Cierre de backlog

- [x] **POLISH-01**: En el tab Archivados de Abonos se distingue a simple vista una serie **cancelada** de una **completada** (hoy se ven idénticas; el propio autor las confundió con corrupción de datos).
- [x] **POLISH-02**: Se corrige el `setState` dentro de `useEffect` en `clients-client.tsx:497` (error de eslint preexistente que dispara renders en cascada).
- [x] **POLISH-03**: Se resuelve el borde lateral acentuado de las 2 pantallas de cancelación (`/cancelar/[token]` y `/abono/cancelar/[token]`), tratándolas juntas para que no diverjan.

## Future Requirements (diferidos)

- **"Cualquiera" en el alta manual del panel** — el dueño normalmente sabe a quién asignar; suma superficie sin valor claro en v1.
- **"Cualquiera" en abonos** — una serie recurrente necesita un profesional estable; asignar dinámicamente cada ocurrencia cambia la naturaleza del abono.
- **Estrategia de asignación configurable** (menos-ocupado / orden fijo / azar) — v0.25 fija **menos-ocupado**; hacerlo configurable se puede agregar después sin re-migrar.
- **Preferencia de profesional del cliente** ("siempre con Ana si está libre") — requiere historial por cliente.

## Out of Scope (exclusiones explícitas)

- **Cupo por solape** (`capacity > 1` contado por hora de inicio exacta en vez de por solape → turnos escalonados superan el cupo). Es un bug REAL y capturado (`todos/pending/2026-07-22-cupo-por-solape-*.md`), pero es **independiente** de multi-staff y toca el mismo RPC: va a **v0.26** para no meter dos cambios grandes al núcleo anti-doble-booking en el mismo ciclo.
- **Reusar `professionals.service_id`** para el mapeo staff↔servicios. Ese campo es *single* y es el mecanismo de **canchas** (migr. 043: cancha = professional + service_id). No se toca ni se recicla.
- **Cobro / precios por profesional** (un barbero senior más caro). Fuera del alcance de reserva.

## Decisiones LOCKED

- El cliente puede elegir profesional **o** "cualquiera" — las dos vías conviven.
- La asignación automática corre **DENTRO del RPC atómico** `book_slot_atomic`, nunca en el cliente ni en dos pasos (leer-libres → insertar sería una carrera).
- Estrategia de asignación: **menos turnos ese día**.
- El profesional asignado **se le muestra al cliente** (confirmación + mail).
- Cero regresión obligatoria para: canchas (`professionals.service_id`), abonos (generación forward por el mismo motor), cupos grupales (`time_blocks.capacity`) y exclusión por espacio compartido.
- Toca el núcleo anti-doble-booking → **secure-phase obligatorio**.

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| STAFF-01 | Phase 8 — Equipo: qué servicios hace cada profesional | Complete |
| STAFF-02 | Phase 8 — Equipo: qué servicios hace cada profesional | Complete |
| STAFF-03 | Phase 8 — Equipo: qué servicios hace cada profesional | Complete |
| ASIGN-01 | Phase 10 — Reservar con "cualquiera" desde la página pública | Complete |
| ASIGN-02 | Phase 9 — Asignación automática atómica de profesional | Complete |
| ASIGN-03 | Phase 9 — Asignación automática atómica de profesional | Complete |
| ASIGN-04 | Phase 9 — Asignación automática atómica de profesional | Complete |
| ASIGN-05 | Phase 10 — Reservar con "cualquiera" desde la página pública | Complete |
| DISP-01 | Phase 10 — Reservar con "cualquiera" desde la página pública | Complete |
| DISP-02 | Phase 10 — Reservar con "cualquiera" desde la página pública | Complete |
| DISP-03 | Phase 10 — Reservar con "cualquiera" desde la página pública | Complete |
| POLISH-01 | Phase 11 — Cierre de backlog | Complete |
| POLISH-02 | Phase 11 — Cierre de backlog | Complete |
| POLISH-03 | Phase 11 — Cierre de backlog | Complete |

**Cobertura: 14/14 requisitos mapeados, cada uno a UNA sola fase. Sin huérfanos ni duplicados.**

| Phase | Requisitos |
|-------|------------|
| 8. Equipo — qué servicios hace cada profesional | STAFF-01, STAFF-02, STAFF-03 |
| 9. Asignación automática atómica de profesional | ASIGN-02, ASIGN-03, ASIGN-04 |
| 10. Reservar con "cualquiera" desde la página pública | ASIGN-01, ASIGN-05, DISP-01, DISP-02, DISP-03 |
| 11. Cierre de backlog | POLISH-01, POLISH-02, POLISH-03 |
