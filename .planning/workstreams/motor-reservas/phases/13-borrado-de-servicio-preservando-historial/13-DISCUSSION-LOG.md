# Phase 13: Borrado de servicio preservando historial - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-31
**Phase:** 13-borrado-de-servicio-preservando-historial
**Areas discussed:** Mecanismo de desacople, Autoridad del precio en Finanzas, Qué bloquea el borrado, UX del modal de borrado

---

## Mecanismo de desacople

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot al crear el turno | `appointments` suma service_name + service_price; FK a `ON DELETE SET NULL` + backfill. Historia autónoma. | ✓ |
| Snapshot perezoso (solo al borrar) | Columnas rellenadas recién al borrar el servicio; write-path intacto pero columnas nulas en el 99% de las filas. | |
| Soft-delete del servicio | `services.deleted_at`, FK y joins intactos; hay que filtrar en todos los listados. | |

**User's choice:** Snapshot al crear el turno
**Notes:** Se descartó el soft-delete por el riesgo de olvidar el filtro en alguno de los listados (panel, `public_services`, alta manual, abonos, canchas) y resucitar el servicio.

| Option | Description | Selected |
|--------|-------------|----------|
| Trigger BEFORE INSERT en la DB | Postgres copia name/price desde services filtrando por business_id; write-path de la app intacto. | ✓ |
| En `createAppointmentCore` (TS) | Explícito y testeable, pero toca el write-path compartido por los 4 consumidores. | |
| Trigger + core (redundante) | Máxima cobertura, dos fuentes de verdad. | |

**User's choice:** Trigger BEFORE INSERT en la DB
**Notes:** Prioridad al riesgo cero sobre `createAppointmentCore`, que es el punto sensible del workstream.

| Option | Description | Selected |
|--------|-------------|----------|
| Foto inmutable al reservar | El snapshot no se refresca nunca; congela también la facturación histórica. | ✓ |
| Espejo: se refresca en cada edición | Cero cambio de comportamiento; no arregla la mutabilidad del precio. | |
| Congelar pasados, espejar futuros | Semánticamente más fino, más lógica y más tests. | |

**User's choice:** Foto inmutable al reservar
**Notes:** Cambio de comportamiento observable en Finanzas asumido a propósito — editar un precio deja de reescribir la historia.

| Option | Description | Selected |
|--------|-------------|----------|
| FK a `ON DELETE SET NULL` + backfill | El FK deja de bloquear; el snapshot es la identidad. Alcanza porque Finanzas no agrupa por id. | ✓ |
| Dropear el FK y conservar el UUID huérfano | Permite agrupar por id; pierde integridad referencial en el write-path vivo. | |
| SET NULL + columna `service_ref` sin FK | Conserva el linaje sin perder integridad; una columna que hoy nadie lee. | |

**User's choice:** FK a `ON DELETE SET NULL` + backfill
**Notes:** Verificado en `finances-client.tsx` que la facturación suma `services(price)` y muestra `services(name)` por fila, sin agrupar por `service_id`.

---

## Autoridad del precio en Finanzas

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot primero, join de fallback | `COALESCE(service_name, services.name)`; el join queda de red de seguridad. | ✓ |
| Join primero, snapshot de fallback | Cero cambio para servicios vivos, pero contradice la foto inmutable. | |
| Solo snapshot, sin join | Una query menos y una sola fuente; sin red si un snapshot quedara vacío. | |

**User's choice:** Snapshot primero, join de fallback
**Notes:** Se dejó asentado que el backfill hereda el precio actual — el precio real de un turno viejo no es reconstruible.

| Option | Description | Selected |
|--------|-------------|----------|
| Solo los read-paths de historial | Finanzas, ficha del cliente y Turnos (Pasados/Todos). | ✓ |
| Los 11 lugares que joinean `services` | Consistencia app-wide, diff mucho mayor. | |
| Historial + un helper compartido | Abstracción nueva para tres call sites. | |

**User's choice:** Solo los read-paths de historial
**Notes:** Agenda, Dashboard, Abonos e impersonación muestran turnos vivos, donde el servicio existe por definición.

| Option | Description | Selected |
|--------|-------------|----------|
| No se distingue | El turno de un servicio borrado se lee igual que cualquier otro. | ✓ |
| Marca sutil de eliminado | Chip o texto muted; ruido visual en pantallas densas. | |
| Vos decidís | A criterio de la implementación. | |

**User's choice:** No se distingue
**Notes:** Es literalmente lo que pide HIST-03.

---

## Qué bloquea el borrado

| Option | Description | Selected |
|--------|-------------|----------|
| Futuros no cancelados | `date >= hoy` (AR) y `status != 'cancelled'`, server-side por `business_id`. | ✓ |
| Cualquier turno futuro, incluso cancelado | Más conservador; repite la confusión que la fase viene a arreglar. | |
| Futuros no cancelados + pending sin confirmar | Un hold que va a morir en horas bloquearía un borrado legítimo. | |

**User's choice:** Futuros no cancelados

| Option | Description | Selected |
|--------|-------------|----------|
| Activo bloquea, archivado se desacopla | Abono activo dispara el modal; cancelados/completados pasan a `SET NULL` + snapshot del nombre. | ✓ |
| Cualquier abono bloquea | Cero migración extra; el dueño queda trabado por series dadas de baja hace meses. | |
| Activo bloquea, archivado a SET NULL sin snapshot | Migración más chica, historial del abono degradado. | |

**User's choice:** Activo bloquea, archivado se desacopla
**Notes:** Caso que el roadmap no contemplaba — `abonos.service_id` es `ON DELETE RESTRICT`, detectado en el scout.

| Option | Description | Selected |
|--------|-------------|----------|
| Trigger BEFORE DELETE en la DB | Guard atómico sin TOCTOU; el borrado sigue saliendo desde `settings-client` con sesión + RLS. | ✓ |
| Route handler autenticado | Toda la lógica en TS y testeable; superficie nueva y hay que replicar el anti-tampering. | |
| Pre-check client-side y listo | Cambio más chico; ventana TOCTOU sin backstop. | |

**User's choice:** Trigger BEFORE DELETE en la DB
**Notes:** Necesario porque al pasar el FK a `SET NULL` se pierde el guard que hoy da Postgres.

---

## UX del modal de borrado

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-check al abrir, un modal con dos estados | Mismo diálogo en estado bloqueado o confirmable; el trigger queda de backstop. | ✓ |
| Dos diálogos separados | Sin ramas dentro de un componente; dos componentes a mantener sincronizados. | |
| Confirmación directa + modal solo si falla | Diff más chico; el dueño se entera del bloqueo después de decidir. | |

**User's choice:** Pre-check al abrir, un modal con dos estados

| Option | Description | Selected |
|--------|-------------|----------|
| Desactiva ahí mismo y cierra | Llama a `toggleService` y confirma con un toast. | ✓ |
| Solo explica y señala el switch de la fila | Más conservador; deja al dueño buscando el switch. | |
| Desactiva ahí mismo + muestra el impacto | Igual pero explicando qué implica desactivar. | |

**User's choice:** Desactiva ahí mismo y cierra

| Option | Description | Selected |
|--------|-------------|----------|
| Conteo + fecha del próximo | "3 turnos reservados a partir del 5/8" (+ abono activo si aplica). | ✓ |
| Solo la explicación, sin números | Una query menos; repite el problema del toast actual. | |
| Conteo + link a Turnos filtrado por servicio | Ese filtro no existe hoy — sería capacidad nueva. | |

**User's choice:** Conteo + fecha del próximo

| Option | Description | Selected |
|--------|-------------|----------|
| Solo el copy de sede y cancha acá | Se corrigen los dos toasts restantes (strings, riesgo cero) y se cierra el todo completo. | ✓ |
| Nada: queda para otra fase | Esta fase toca solo servicio. | |
| Extender el modal completo a sede y cancha | Es exactamente lo que REQUIREMENTS difirió. | |

**User's choice:** Solo el copy de sede y cancha acá
**Notes:** Cierra el todo `2026-07-27-mensaje-borrado-servicio-cuenta-turnos-pasados-cancelados.md`.

---

## Servicios desactivados (agregado por el dueño en el cierre)

El dueño propuso, al cerrar la discusión, que los servicios desactivados salgan de la lista principal y
vivan en una vista "Desactivados", "así como pasa con los abonos". Se aceptó dentro de la fase por ser la
vía que ofrece el modal de HIST-02: ofrecerla sin que sea usable la deja a medias.

| Option | Description | Selected |
|--------|-------------|----------|
| Tabs Activos / Desactivados | Molde exacto del filtro de `/abonos`, con contador. Cero migración (`services.active` ya existe). | ✓ |
| Sección colapsable al pie | Más compacto; patrón distinto del de abonos. | |
| Checkbox "Mostrar desactivados" | Diff más chico; al prenderlo vuelve la lista mezclada. | |

**User's choice:** Tabs Activos / Desactivados

| Option | Description | Selected |
|--------|-------------|----------|
| Solo servicios | Es la vía que ofrece el modal de esta fase. | ✓ |
| Servicios + sedes + profesionales | Consistencia total en Ajustes; triplica la superficie de UI. | |

**User's choice:** Solo servicios

---

## Claude's Discretion

- Nombres exactos de las columnas del snapshot en `appointments` y en `abonos`.
- Número (próximo libre: **065**) y estructura de la migración: orden de `ADD COLUMN` → backfill →
  `ALTER FK` → triggers, idempotencia y `NOTIFY pgrst, 'reload schema'`.
- Cómo el trigger `BEFORE DELETE` comunica el motivo del rechazo y cómo lo mapea el cliente al estado del
  modal (molde del mapeo `23505`/`23P01` → `slot_taken`).
- Si el pre-check del modal es una query directa desde `settings-client` o un helper compartido.
- Layout fino del diálogo de dos estados y del switch de tabs.

## Deferred Ideas

- Modal + desacople completo para sede y cancha (acá solo se corrige el copy).
- Tabs Activos/Desactivados también en sedes y profesionales.
- Filtro por servicio en la pantalla de Turnos.
- Reconstruir el precio histórico real de los turnos anteriores al snapshot (imposible con los datos actuales).
