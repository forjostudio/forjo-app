# Phase 13: Borrado de servicio preservando historial - Context

**Gathered:** 2026-07-31
**Status:** Ready for planning

<domain>
## Phase Boundary

El dueño puede **borrar de verdad** un servicio cuyos turnos son todos pasados/cancelados, sin que eso
destruya la historia: los turnos pasados siguen visibles en Finanzas y en la ficha del cliente ("historia
clínica") con su nombre y su precio. Si el servicio tiene turnos futuros (o un abono activo), un **modal**
bloquea el borrado, lo explica con números y ofrece **desactivar** como salida — y esa salida se vuelve
usable separando los servicios desactivados de la lista principal.

El desacople es por **snapshot inmutable** de nombre y precio en `appointments`, escrito por un trigger de
base, más el FK a `ON DELETE SET NULL` y un backfill de lo histórico. El gate de "tiene futuros" vive en un
trigger `BEFORE DELETE` (guard atómico, sin ventana TOCTOU), porque al soltar el FK se pierde la protección
que hoy da Postgres.

Requisitos: HIST-01, HIST-02, HIST-03 (ver REQUIREMENTS.md del workstream).

**Fuera de alcance:** extender el patrón completo (modal + desacople) a **sede** y **cancha** — ya diferido
en REQUIREMENTS §Future. De sede/cancha se toca **solo el copy** de sus toasts (ver Folded Todos).

</domain>

<decisions>
## Implementation Decisions

### Mecanismo de desacople
- **D-01:** **Snapshot al crear el turno.** `appointments` suma dos columnas nuevas (nombre y precio del
  servicio), pobladas en cada alta. La historia queda **autónoma**: no depende de que la fila de `services`
  siga viva. Se descartó el soft-delete del servicio (obligaría a filtrar `deleted_at IS NULL` en TODOS los
  listados — panel, `public_services`, alta manual, abonos, canchas — y olvidarse en uno resucita el
  servicio) y el snapshot perezoso (dejaría las columnas nulas en el 99% de las filas sin resolver nada más).
- **D-02:** **El snapshot lo escribe un trigger `BEFORE INSERT` en la DB**, que copia `name`/`price` desde
  `services` filtrando por `business_id`. El **write-path de la app queda intacto**: cero cambios en
  `createAppointmentCore` ni en los cuatro consumidores del RPC (booking público, alta manual, generación
  forward de abonos, canchas) — que es exactamente donde vive el riesgo de regresión de este workstream.
  Cubre además cualquier insert que no pase por el core (seeds, callers futuros).
- **D-03:** **El snapshot es una foto inmutable**, no un espejo: se escribe una vez y no se refresca nunca.
  Un turno de marzo conserva el nombre y el precio que el servicio tenía en marzo. Consecuencia **buscada y
  aceptada**: editar el precio de un servicio deja de reescribir la facturación histórica (hoy sí lo hace).
- **D-04:** **`appointments.service_id` pasa a `ON DELETE SET NULL`** y la misma migración **backfillea** el
  snapshot de todos los turnos históricos desde el join actual. Alcanza porque **Finanzas no agrupa por
  `service_id`** (verificado: suma `services(price)` y muestra `services(name)` por fila). Se descartó
  dropear el FK para conservar un UUID huérfano — perdería integridad referencial en el write-path vivo, en
  contra de la disciplina anti-tampering del proyecto.
  **Límite conocido del backfill:** hereda el precio **actual** de cada servicio; el precio real que tenía un
  turno de marzo ya se perdió y no es reconstruible. Es aceptado, no un bug a resolver.

### Autoridad del precio en el historial
- **D-05:** **Snapshot primero, join de fallback** (`COALESCE(snapshot, services.…)`) para nombre y precio.
  Con el backfill el snapshot queda siempre poblado, así que el join sobrevive solo como red de seguridad
  ante un snapshot vacío.
- **D-06:** **Solo se migran los read-paths de historial:** Finanzas, ficha del cliente y Turnos (tabs
  Pasados/Todos). Agenda, Dashboard, Abonos e impersonación muestran turnos vivos, donde el servicio existe
  por definición — no se tocan. Diff chico y enfocado.
- **D-07:** **Un turno de un servicio borrado NO se distingue visualmente** en el historial: se lee igual que
  cualquier otro turno, con su nombre y su precio. Es literalmente lo que pide HIST-03.

### Qué bloquea el borrado
- **D-08:** **"Tiene turnos futuros" = `date >= hoy` (hora AR) y `status != 'cancelled'`.** Un turno futuro ya
  cancelado no bloquea nada. Se descartó contar cancelados: reproduciría exactamente la confusión que esta
  fase viene a arreglar (el dueño cancela todo y el borrado sigue trabado). El chequeo corre **server-side
  filtrando por `business_id`**.
- **D-09:** **Abonos: el activo bloquea, el archivado se desacopla.** Hoy `abonos.service_id` es
  `ON DELETE RESTRICT`, así que una serie dada de baja hace meses traba el borrado. Un abono **activo** cuenta
  como turnos futuros y dispara el mismo modal (mencionando la serie viva); los **cancelados/completados**
  dejan de bloquear: su FK también pasa a `SET NULL` **con snapshot del nombre del servicio**, para que el
  detalle de la serie archivada no quede vacío. La migración toca dos tablas.
- **D-10:** **El gate vive en un trigger `BEFORE DELETE` en la DB.** Al pasar el FK a `SET NULL` se pierde el
  guard que hoy da Postgres: un pre-check solo en el cliente dejaría una ventana TOCTOU en la que un turno
  reservado en el medio queda huérfano en silencio. El trigger rechaza el DELETE si hay turnos futuros no
  cancelados o un abono activo (filtrando por `business_id`), y el borrado **sigue saliendo desde
  `settings-client` con la sesión del dueño + RLS**, como el resto del CRUD de Ajustes.

### UX del borrado y de la desactivación
- **D-11:** **Pre-check al abrir + un solo modal con dos estados.** Al tocar el tacho se consulta si hay
  turnos futuros / abono activo y se abre el **mismo** diálogo en uno de dos estados: *bloqueado* (explica y
  ofrece "Desactivar") o *confirmable* (aclara que se conservan N turnos en el historial). El dueño sabe qué
  va a pasar **antes** de apretar; el trigger de D-10 queda de backstop por si algo cambió en el medio.
- **D-12:** **El botón "Desactivar" desactiva ahí mismo** (`toggleService(id, false)`, que ya existe), cierra
  el diálogo y confirma con un toast. Ofrecer la vía sin ejecutarla dejaría al dueño buscando el switch.
- **D-13:** **El modal bloqueado muestra conteo + fecha del próximo turno** ("tiene 3 turnos reservados a
  partir del 5/8", y "y un abono activo" cuando aplique). Sale de la misma query del pre-check. Se descartó
  linkear a Turnos filtrado por servicio: ese filtro no existe hoy (Turnos filtra por profesional, estado y
  rango de fecha) y construirlo sería capacidad nueva.
- **D-14:** **Los servicios desactivados salen de la lista principal**, con **tabs "Activos / Desactivados" y
  contador** — molde exacto del filtro Archivados de `/abonos` (Phase 7, D-20). Hoy quedan mezclados con el
  nombre tachado, lo que vuelve pobre la salida que ofrece D-12. No hace falta migración: `services.active`
  ya existe. **Solo servicios** — sedes y profesionales tienen el mismo problema pero quedan diferidos.

### Claude's Discretion
- Nombres exactos de las columnas del snapshot en `appointments` y en `abonos` (respetando snake_case y el
  molde de columnas aditivas de 055/061).
- Número y estructura de la migración: la próxima libre es la **065** (062/063/064 salieron en Phase 12 y ya
  están en prod). Orden de `ADD COLUMN` → backfill → `ALTER FK` → triggers, idempotencia, y
  `NOTIFY pgrst, 'reload schema'`.
- Cómo el trigger `BEFORE DELETE` comunica el motivo del rechazo (código de error / mensaje) y cómo lo mapea
  el cliente al estado del modal — molde del mapeo `23505`/`23P01` → `slot_taken` de `booking-core`.
- Si el pre-check del modal es una query directa desde `settings-client` o un helper compartido.
- Layout fino del diálogo de dos estados y del switch de tabs, dentro del design system existente.

### Folded Todos
- **`2026-07-27-mensaje-borrado-servicio-cuenta-turnos-pasados-cancelados.md`** (área `ux-copy`) — el toast
  de borrado dice "tiene turnos asociados" sin aclarar que el FK cuenta también pasados y cancelados. El caso
  **servicio** queda resuelto de raíz por D-11/D-13 (deja de ser un toast reactivo). De **sede y cancha** se
  corrige **solo el copy** de sus dos toasts ([settings-client.tsx:886](app/(dashboard)/settings/settings-client.tsx#L886),
  [canchas-manager.tsx:181](components/dashboard/canchas-manager.tsx#L181)) para que expliquen qué cuenta y
  ofrezcan desactivar — son strings, riesgo cero, y cierran el todo completo en vez de dejarlo a medias. **No**
  se les aplica el modal ni el desacople.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap / requisitos del workstream
- `.planning/workstreams/motor-reservas/ROADMAP.md` §"Phase 13" — Goal, Success Criteria,
  Security/Integrity relevance y la "Decisión abierta" que este CONTEXT cierra (D-01..D-04).
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — HIST-01/02/03, §Out of Scope (nunca hard-delete
  de la historia), §Future (sede/cancha diferidos), §Decisiones LOCKED.
- `.planning/PROJECT.md` — proyecto compartido (aislamiento por tenant, integridad de pagos).

### Esquema y migraciones (lo que toca la 065)
- `supabase/schema.sql` — `appointments` (sin columnas de nombre/precio hoy), `services` (con `active`,
  `capacity_mode`, `capacity`), y los **cuatro FKs a `services`**: `appointments` (NO ACTION, el que se
  suelta), `abonos` (**RESTRICT**, D-09), `professional_services` (CASCADE, se resuelve solo),
  `professionals.service_id` (**SET NULL** — mecanismo de canchas de la migr. 043).
- `supabase/migrations/043_*` — canchas: `professionals.service_id` → `services` con precio/duración.
- `supabase/migrations/054_*` / `056_*` — tabla `abonos` y su índice único; molde de columna aditiva.
- `supabase/migrations/061_public_selector_default.sql` y `055_*` — molde exacto de `ADD COLUMN IF NOT EXISTS
  … NOT NULL DEFAULT` idempotente.
- **Baseline:** la última migración aplicada en prod es la **064**; la próxima es la **065**, aplicada **a
  mano** coordinada con el deploy (+ `NOTIFY pgrst, 'reload schema'`), **nunca** por el flujo GSD. Validación
  local con `npx supabase db reset`; después regenerar `supabase/schema.sql` quirúrgicamente (el CLI reordena
  el archivo entero si se hace dump).

### Código que se modifica
- `app/(dashboard)/settings/settings-client.tsx` — `deleteService` (L521-533), `toggleService` (L534-537),
  el render de la lista de servicios (L1454+), el `ConfirmDialog` de borrado (L2316), y los toasts de sede
  (L886) y profesional (L715). El gate `isCanchas` (L322, L1434) confirma que **en el vertical canchas
  `/servicios` renderiza `CanchasManager`**, así que `deleteService` no alcanza a un servicio de cancha.
- `app/(dashboard)/finances/finances-client.tsx` — L219/246/268/288/314/518/881: toda la facturación sale de
  `services(price)` y el nombre de `services(name)`. Es el read-path más afectado por D-05.
- `app/(dashboard)/clients/page.tsx` L24 — ficha del cliente, `select('*, services(name, price)')`.
- `app/(dashboard)/appointments/page.tsx` L20 + `appointments-client.tsx` L169 — Turnos.
- `components/dashboard/canchas-manager.tsx` L181 — toast de borrado de cancha (solo copy).
- `app/(dashboard)/abonos/abonos-client.tsx` L51-57, L145-154 — **molde del filtro de tabs con contador** que
  D-14 replica en servicios.
- `lib/booking-core.ts` (`createAppointmentCore`) — **NO se modifica** (D-02); se verifica cero regresión.

### CONTEXT de fases relacionadas
- `.planning/workstreams/motor-reservas/phases/12-cupo-por-solape-recurso-simult-neo/12-CONTEXT.md` — fase
  anterior sobre el mismo write-path; `services.capacity_mode`/`capacity` y el molde de migración.
- `.planning/workstreams/motor-reservas/phases/07-cancelaci-n-del-abono-mail-panel/07-CONTEXT.md` — abonos
  (D-09) y el patrón del filtro Archivados (D-14).

### Skills a aplicar
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — columnas/triggers nuevos y aislamiento por tenant.
- `.claude/skills/convenciones-forjo/SKILL.md` — stack, arquitectura y convenciones.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `toggleService(id, active)` ([settings-client.tsx:534](app/(dashboard)/settings/settings-client.tsx#L534))
  — la desactivación ya existe y funciona; D-12 solo la invoca desde el modal.
- `ConfirmDialog` ya cableado para el borrado de servicio (L2316) — punto de anclaje del diálogo de dos
  estados de D-11.
- Filtro de tabs con contador de `/abonos` (Activos/Archivados) — molde directo de D-14.
- Mapeo de códigos de error de Postgres a errores de dominio (`23505`/`23P01` → `slot_taken`) en
  `lib/booking-core.ts` — molde para traducir el rechazo del trigger `BEFORE DELETE`.

### Established Patterns
- El CRUD de Ajustes escribe con el **browser client + RLS + `.eq('business_id', …)`**, nunca service-role.
  D-10 lo preserva: el guard nuevo es de base, no un endpoint.
- Migración numerada idempotente + `supabase db reset` local (PG17) como única validación; prod a mano.
- Borrado **no optimista**: se captura el error real y solo se filtra la lista si el DELETE salió bien
  (comentario en L522-524). D-11 lo mantiene.

### Integration Points
- **Trigger `BEFORE INSERT` sobre `appointments`** — se interpone en el write-path de los cuatro consumidores
  del RPC sin tocar su código. Es el punto que hay que verificar sin regresión (booking público, alta manual,
  generación forward de abonos, canchas).
- **Trigger `BEFORE DELETE` sobre `services`** — nuevo guard del borrado; su error tiene que llegar legible
  al modal.
- **FK `abonos.service_id`** — pasa de RESTRICT a SET NULL; el listado de `/abonos` (L39,
  `select('… services(name) …')`) necesita el fallback al snapshot para las series archivadas.

</code_context>

<specifics>
## Specific Ideas

- El framing del dueño: el borrado tiene que **desacoplar, no destruir** — la historia clínica del paciente y
  el historial del cliente sobreviven al servicio.
- Pedido explícito del dueño durante la discusión: que los servicios desactivados **salgan de la lista
  principal y vivan en "Desactivados"**, "así como pasa con los abonos" (D-14). Nace de que la vía que ofrece
  el modal tiene que quedar realmente usable, no solo mencionada.
- La confusión original que motiva la fase (UAT Phase 10, 2026-07-27): el operador canceló todos los turnos,
  vio la lista vacía, y el borrado seguía bloqueado — porque el FK cuenta filas, no estados. D-08 y D-13
  atacan exactamente eso.

</specifics>

<deferred>
## Deferred Ideas

- **Modal + desacople completo para sede y cancha** — mismo patrón, otra fase (ya diferido en REQUIREMENTS
  §Future). Acá solo se corrige su copy.
- **Tabs Activos/Desactivados también en sedes y profesionales** — mismo problema de lista mezclada; queda
  fuera para no triplicar la superficie de UI de esta fase.
- **Filtro por servicio en la pantalla de Turnos** — haría accionable el modal bloqueado ("ver los 3 turnos
  que bloquean"), pero hoy no existe: es capacidad nueva.
- **Reconstruir el precio histórico real de los turnos anteriores al snapshot** — imposible con los datos
  actuales; el backfill hereda el precio vigente y se acepta (D-04).

</deferred>

---

*Phase: 13-borrado-de-servicio-preservando-historial*
*Context gathered: 2026-07-31*
