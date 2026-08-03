# Requirements: v0.26 — Cupo por solape + cierre de backlog

> Workstream `motor-reservas`. Numeración de fases **continua**: v0.26 arranca en **Phase 12**.
> Milestone anterior: v0.25 Reserva con varios profesionales / multi-staff (shipped 2026-07-28, tag v0.25).

## Contexto

Hoy `time_blocks.capacity > 1` cuenta el sobrecupo **por hora de inicio exacta**. Eso es correcto para
una **clase grupal** (yoga 16:00, cupo 10) pero está **roto** para un **recurso simultáneo** (un
kinesiólogo con 2 camillas): turnos **escalonados** que se pisan superan el cupo sin que nada los frene.

**Reproducido a mano (UAT fase 07, 2026-07-22).** Cupo 2, servicio de 30 min:

```
16:00 ──────── 16:30   turno A   (aceptado)
16:00 ──────── 16:30   turno B   (aceptado → cupo 2 lleno para las 16:00)
      16:15 ──────── 16:45   turno C  (aceptado → cupo 2 lleno para las 16:15)
      16:15 ──────── 16:45   turno D  (aceptado)
        ↑ entre 16:15 y 16:30 hay CUATRO turnos a la vez, con cupo 2
```

**Causa raíz (diagnóstico cerrado, verificado en código — `todos/pending/2026-07-22-cupo-por-solape-*.md`):**

1. El `EXCLUDE` anti-solape se **apaga** con `is_group = (capacity > 1)` (necesario: con cupo > 1 el
   solape ES legal hasta el cupo), dejando el control en manos del conteo.

2. El conteo del RPC (`042_...:209-218`) mira solo `date + time` idénticos; nunca considera
   `duration_minutes`. La misma función ya sabe razonar por intervalo (el chequeo de espacios usa
   `tsrange && tsrange`) — el cupo no lo usa.

**"Cupo N" significa dos cosas distintas, y este milestone las separa:**

| Semántica | Ejemplo | Criterio correcto | Estado |
|---|---|---|---|
| **Clase grupal** | yoga 16:00, cupo 10 | por hora de inicio | ✅ correcto hoy |
| **Recurso simultáneo** | kinesiólogo, 2 camillas | por **solape** | ❌ roto → **este milestone** |

**Decisión de producto cerrada (2026-07-28):** la semántica se elige **por servicio** (cada servicio
declara si es clase grupal o recurso simultáneo). Es un **modo nuevo que coexiste** con el actual — NO
lo reemplaza: reemplazar rompería las clases grupales, donde la clase de las 16:00 y la de las 17:00 no
deben sumar entre sí.

Además se cierra el backlog chico acumulado (polish + un borrado de servicio que preserva el historial).

## v1 Requirements (este milestone)

### Cupo por solape (recurso simultáneo)

- [x] **CUPO-01**: El dueño marca cada servicio como **clase grupal** (cupo contado por hora de inicio) o **recurso simultáneo** (cupo contado por solape), desde el panel.
- [x] **CUPO-02**: Con semántica **recurso simultáneo**, una reserva se rechaza cuando en su intervalo (inicio + `duration_minutes`) ya hay `capacity` turnos **solapados** — no por hora de inicio exacta.
- [x] **CUPO-03**: Con semántica **clase grupal**, el cupo se sigue contando por hora de inicio exacta (comportamiento actual, sin cambios).
- [x] **CUPO-04**: El control por solape es **atómico** bajo concurrencia: N+1 reservas escalonadas que se pisan sobre un recurso de cupo N nunca superan el cupo — verificado con un test de carrera contra la DB real.
- [x] **CUPO-05**: **Cero regresión** del núcleo anti-doble-booking: cupo 1, canchas, generación forward de abonos, multi-staff y exclusión por espacio compartido siguen exactamente igual; los estados `slot_full`/`slot_taken` no se degradan.

### Borrado de servicio preservando historial

- [x] **HIST-01**: El dueño puede **borrar** un servicio cuyos turnos son todos **pasados/cancelados** (sin turnos futuros).
- [x] **HIST-02**: Al intentar borrar un servicio con turnos **futuros**, un **modal** lo bloquea, lo explica y ofrece la vía de **desactivar** (conservar y dejar de ofrecer).
- [x] **HIST-03**: Los turnos **pasados** de un servicio borrado **siguen visibles en el historial** (Finanzas / ficha del cliente) con su nombre y precio, sin romper los reportes — vía **desacople del FK** (el turno guarda un snapshot del servicio al crearse; se descarta hard-delete de la historia).

### Cierre de backlog (polish)

- [ ] **POLISH-04**: Los botones de acción del dashboard tienen ancho **consistente** app-wide: se elimina el `w-full` poco intencional en desktop según un criterio único definido en discuss-phase.
- [ ] **POLISH-05**: El `RiskBadge` "Alto" se muestra **con color** (relleno semántico de peligro) también **fuera del CRM** (hoy `--crm-danger` no está definido fuera del scope y el badge parece un pill gris).
- [ ] **POLISH-06**: Una serie de abono con estado **cancelado** **no** muestra el botón "Copiar link de baja".
- [ ] **POLISH-07**: Un cliente **recién creado sin turnos** aparece en el filtro **"Nuevas"**, no en **"Pausa"** (">2 meses sin venir").

## Future Requirements (diferidos)

- **Cupo por solape también en sede / cancha** — el diagnóstico y el modal de borrado nacen para **servicio**; extender el borrado-con-historial a sede/cancha se puede sumar después con el mismo patrón.
- **Estrategia de asignación de seat configurable** — v0.26 separa el criterio de cupo de la posición en el slot; exponer la política de asiento es v2.
- **Semántica de cupo derivada del vertical o global por negocio** — se eligió **por servicio**; un default por vertical (ej. salud → recurso simultáneo) es un atajo de UX posterior, no cambia el modelo.

## Out of Scope (exclusiones explícitas)

- **Reemplazar** el conteo por hora de inicio con conteo por solape a secas — rompería las clases grupales. El fix es un **modo nuevo que coexiste**, elegido por servicio.
- **Hard-delete del historial** al borrar un servicio — la historia (historia clínica del paciente / historial del cliente) se **preserva**; el borrado desacopla, no destruye.
- **Waitlist** al liberar un lugar de cupo, **anticipación mínima**, **ventana por servicio**, **cobro recurrente de abonos** — todos ya diferidos en milestones anteriores.
- **Re-hacer el copy de los 3 toasts de borrado** (servicio/sede/cancha) — ya está shipeado (`settings-client.tsx:403/580/746`).

## Decisiones LOCKED

- Cupo por solape = **modo nuevo por servicio** que **coexiste** con clase grupal; NO reemplaza.
- El control por solape corre **DENTRO del RPC atómico** `book_slot_atomic`, con:
  - la **granularidad del advisory lock** ampliada (hoy por slot+bucket → dos reservas escalonadas toman locks distintos y se cuelan; pasa a bucket+día/ventana), sin degradar `slot_full`/`slot_taken` ni el caso cupo 1;
  - la **asignación de `seat`** separada del criterio de cupo (el asiento sigue siendo posición dentro del slot exacto; el cupo se evalúa por solape) para no chocar con el índice único 011.
- El cambio afecta a los **CUATRO consumidores** del RPC (booking público, alta manual, generación forward de abonos, canchas) vía `createAppointmentCore` → **secure-phase obligatorio**.
- `book_slot_atomic` es `SECURITY DEFINER` (RLS no la protege): toda query nueva adentro filtra por `business_id` explícito.
- Borrado con solo-pasados **preserva el historial** (desacople/snapshot); NUNCA hard-delete de la historia.
- La **columna exacta** del flag por servicio y el **mecanismo de desacople** (snapshot de nombre/precio en el turno vs otra vía) se cierran en **discuss-phase**.
- Migraciones SQL numeradas nuevas (la última aplicada en prod es la **061**; la próxima es **062**), aplicadas **a mano** coordinadas con el deploy (+ `NOTIFY pgrst, 'reload schema'`), nunca por el flujo GSD.
- Aplican skills `supabase-multitenant-rls` + `convenciones-forjo`.

## Traceability

<!-- Completado por el roadmapper: cada REQ-ID mapeado a EXACTAMENTE una fase. -->

| REQ-ID | Phase | Status |
|--------|-------|--------|
| CUPO-01 | Phase 12 | Complete |
| CUPO-02 | Phase 12 | Complete |
| CUPO-03 | Phase 12 | Complete |
| CUPO-04 | Phase 12 | Complete |
| CUPO-05 | Phase 12 | Complete |
| HIST-01 | Phase 13 | Complete |
| HIST-02 | Phase 13 | Complete |
| HIST-03 | Phase 13 | Complete |
| POLISH-04 | Phase 14 | Pending |
| POLISH-05 | Phase 14 | Pending |
| POLISH-06 | Phase 14 | Pending |
| POLISH-07 | Phase 14 | Pending |
