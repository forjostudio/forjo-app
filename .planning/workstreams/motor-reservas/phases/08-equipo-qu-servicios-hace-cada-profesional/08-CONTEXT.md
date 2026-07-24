# Phase 8: Equipo — qué servicios hace cada profesional - Context

**Gathered:** 2026-07-24
**Status:** Ready for planning

<domain>
## Phase Boundary

El dueño declara desde el panel **qué servicios sabe hacer cada persona del equipo** (mapeo muchos a
muchos staff↔servicios) y ve la cobertura al revés (por servicio, quién lo ofrece), detectando un
servicio que no cubre nadie. Entrega: **migración 057** (tabla puente propia + RLS), la **UI de
config y cobertura**, y el **helper puro** que resuelve "quién puede hacer qué" (D-12).

**NO toca el motor de reservas:** `book_slot_atomic`, `/api/booking/availability`, `lib/booking-core.ts`,
los constraints 011/013, ni ninguna de las dos páginas públicas de booking. Habilita las Phases 9
(asignación atómica) y 10 (reserva pública con "cualquiera"), que son las que consumen el mapeo.

**Fuera de alcance (LOCKED por REQUIREMENTS.md):** reusar `professionals.service_id` (es el mecanismo
de canchas, migr. 043 — no se toca ni se recicla), el cupo por solape (v0.26), y cualquier cambio en
las superficies públicas.

</domain>

<decisions>
## Implementation Decisions

### Semántica del mapeo (el núcleo — define la query de las Phases 9/10)

- **D-01 (LOCKED):** **Comodín por persona.** Un profesional **sin filas** en la puente se considera
  capaz de **todos** los servicios. Para limitarlo se le marcan los que sí hace. "No hace nada" **no**
  se expresa con el mapeo: se expresa desactivando al profesional (`active = false`, ya existe).
  Rechazado explícitamente el default "a nivel negocio" (apenas hay 1 fila, manda el mapeo para
  todos): el primer guardado sacaría de la grilla a los profesionales aún no configurados — un
  precipicio en producción. También rechazado un switch `usar_mapeo` por negocio (estado de config
  extra). Consecuencia directa: **cero backfill** en la 057, y STAFF-03 (cero regresión) sale gratis.
- **D-02:** Desmarcar el **último** servicio de un profesional **se guarda igual**, con un aviso
  (toast/nota) de que esa persona vuelve a ofrecerse para todos. No se bloquea ni se inventa una
  regla especial: la regla del comodín queda única y simple, pero sin sorpresa.
- **D-03:** Un servicio **nuevo** **no** se auto-asigna a nadie. Los profesionales ya configurados no
  lo hacen hasta que se marque explícitamente; el servicio arranca sin cobertura y la vista de
  cobertura (STAFF-02) lo señala. El sistema nunca asume una capacidad que el dueño no declaró.
- **D-04:** El mapeo **no restringe el panel del dueño**. El alta manual de turno y el alta de abonos
  siguen permitiendo asignar a cualquier profesional (el dueño cubre ausencias y hace excepciones).
  El mapeo alimenta **solo** el booking público (Phases 9/10). Ningún formulario del motor ya
  entregado se toca en esta fase.

### Ubicación y forma de la UI

- **D-05:** **Editor en `/equipo`** (por profesional) + **cobertura en `/servicios`** (por servicio,
  **solo lectura**). Una sola superficie de escritura. Razón de peso además del UX: `/equipo` ya
  redirige a `/dashboard` en el vertical canchas ([equipo/page.tsx:18](app/(dashboard)/equipo/page.tsx#L18)),
  así que el gateo por vertical del editor sale gratis; `/servicios` sirve a **todos** los verticales
  (ahí vive el manager de canchas) y necesita gateo explícito para la cobertura.
- **D-06:** **Chips inline con guardado inmediato** — por cada profesional, una fila de chips de
  servicios; al tocar guarda al instante, optimista con rollback y toast en error. Es exactamente el
  patrón ya probado de `toggleAgendaSpace`
  ([settings-client.tsx:617-648](app/(dashboard)/settings/settings-client.tsx#L617-L648) +
  [:1468-1519](app/(dashboard)/settings/settings-client.tsx#L1468-L1519)). Rechazado meterlo dentro
  del modal "Editar profesional": esconde el panorama del equipo detrás de un click por persona.
- **D-07:** El bloque de mapeo **se oculta con menos de 2 profesionales activos**. Con una sola
  persona el mapeo no aporta y solo agrega ruido; aparece cuando el negocio suma la segunda.
  Alineado con STAFF-03 (no obligar a configurar nada).

### Cobertura (STAFF-02)

- **D-08:** En `/servicios`, debajo de cada servicio se listan **quiénes lo ofrecen**; si no lo cubre
  nadie, un **aviso claro en tono de advertencia**. Cubre STAFF-02 completo: la cobertura real y el
  hueco, de un vistazo. (Rechazado el bloque-matriz aparte: componente nuevo que se desincroniza del
  CRUD de servicios.)
- **D-09 (insumo de la Phase 10, no se implementa acá):** Un servicio **sin cobertura no se ofrece**
  en la página pública. Evita el callejón de elegir un servicio y no encontrar ningún horario; el
  aviso del panel es lo que le explica al dueño por qué desapareció.
- **D-10:** El aviso de "sin cobertura" aparece en **los dos lados**: badge persistente en
  `/servicios` **y** aviso en el momento, al desmarcar en `/equipo` al último profesional que ofrecía
  ese servicio. El dueño se entera cuando lo causa, no cuando lo descubre semanas después.
- **Nota de implementación derivada de D-01:** un servicio solo queda *realmente* sin cobertura
  cuando **todos** los profesionales activos tienen mapeo explícito y ninguno lo marcó. Si queda al
  menos un comodín (0 filas), **todos** los servicios están cubiertos. El cálculo de cobertura debe
  respetar esa regla — es la misma del helper (D-12), no una segunda implementación.

### Migración 057 y superficie de datos

- **D-11:** La **057** crea **solo** la tabla puente + RLS habilitada + **4 policies por operación**
  con `WITH CHECK` por tenant. **Sin acceso `anon`**, replicando el criterio de `agenda_spaces`
  (migr. 042, D-06 de la Phase 3): el público nunca lee la puente; la Phase 10 resuelve quién puede
  hacer qué **server-side** (availability + `page.tsx` público con service-role). Cero superficie
  pública nueva que auditar en esta fase. Si la Phase 10 necesitara una vista acotada, será una
  migración posterior.
- **D-11b:** La migración es **idempotente y numerada**; la última aplicada en prod es la **056**. Se
  aplica **A MANO** al Supabase de prod, coordinada con el deploy (+ `NOTIFY pgrst, 'reload schema';`),
  **NO** por el flujo GSD. Validación local obligatoria con `supabase db reset` (PG17) y regeneración
  de `supabase/schema.sql`, igual que 042/054/056.
- **D-12:** La **regla del comodín vive en un helper puro con tests** (ej. `lib/staff-services.ts`),
  **ya en la Phase 8**: resolución del comodín + "quiénes ofrecen el servicio X" + "un servicio está
  cubierto". La misma regla la van a necesitar el SQL del RPC (Phase 9) y la grilla pública (Phase 10);
  definirla y testearla ahora evita que tres capas la interpreten distinto. La UI de esta fase (D-08,
  D-10) consume ese helper, no una segunda copia de la lógica.

### Interacción con el resto del modelo

- **D-13:** Con varias sucursales, la cobertura es **global por negocio** (mapeo de 2 ejes:
  profesional × servicio, **sin sede**). La sucursal ya la resuelven los `time_blocks` por sede.
  Rechazado un tercer eje profesional × servicio × sede: multiplica modelo y UI.
- **D-14 (insumo de la Phase 9, no se implementa acá):** el conjunto de candidatos de "cualquiera" se
  filtra por **capaz + de la sede de la reserva**; los profesionales sin sede asignada valen para
  todas. Un negocio con dos locales no puede terminar asignando a alguien que no está ahí.
- **D-15:** Cambiar el mapeo **no toca nada existente**: el histórico no se reescribe y un abono en
  curso sigue generando con su profesional fijo (lo eligió el dueño). El mapeo gobierna únicamente
  reservas públicas nuevas — consistente con D-04.
- **D-16:** Al **desactivar** un profesional, sus filas de mapeo **se conservan** (reactivarlo lo
  devuelve tal cual), pero la **cobertura y el público cuentan solo activos** — mismo criterio que la
  vista `public_professionals` (`WHERE active = true`). Desactivar al único que hacía un servicio deja
  ese servicio sin cobertura, que es justo el hueco que STAFF-02 debe mostrar.
- **D-17:** Al **borrar** un servicio o un profesional, las FK con `ON DELETE CASCADE` limpian la
  puente y el estado del cliente se sincroniza — igual que hoy hacen `deleteSpace` /
  `deleteProfessional` con `agenda_spaces`. **Sin** confirmación adicional (el borrado ya tiene la
  suya).
- **D-18:** **Oculto en el vertical canchas** — ni editor ni cobertura (ahí `professionals` son
  canchas y `/servicios` **sí** las sirve → gateo explícito, mismo criterio que el manager de
  canchas). En el resto de los verticales, el copy usa el término que ya resuelve `term.resource`
  (`lib/verticals.ts` / `lib/use-terminology.tsx`), sin textos hardcodeados.

### Claude's Discretion

El usuario no delegó ninguna decisión con "vos decidí". Quedan a criterio del planner/executor, por
ser detalle técnico y no zona gris de producto:

- Nombre exacto de la tabla puente (la convención del repo sugiere `professional_services`, espejo de
  `agenda_spaces`), sus columnas (`business_id` NOT NULL + FKs NOT NULL + PK compuesta) e índices
  (hace falta el inverso `(service_id, professional_id)` para la query de cobertura y para la Phase 9).
- Firma exacta y ubicación del helper de D-12.
- Descomposición en planes/waves y redacción final del copy.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Alcance y requisitos del milestone

- `.planning/workstreams/motor-reservas/ROADMAP.md` §"Phase 8: Equipo — qué servicios hace cada
  profesional" — goal, 4 success criteria, y el bloque "Security/Integrity relevance" que fija la
  migración 057 + RLS por operación + escritura autenticada sin service-role.
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — STAFF-01/02/03, la tabla "Distinción de
  modelo (LOCKED)" (varias personas ≠ clase grupal ≠ recurso simultáneo), §Out of Scope (no reusar
  `professionals.service_id`; cupo por solape a v0.26) y §Decisiones LOCKED.
- `.planning/PROJECT.md` — core value y constraints del proyecto (aislamiento por tenant, Vercel
  Hobby, migraciones a mano).

### Patrón obligatorio a espejar (tabla puente + RLS)

- `supabase/migrations/042_spaces_and_coupled_exclusion.sql` §1-2 — **la plantilla de la 057**: tabla
  puente `agenda_spaces` (FKs NOT NULL, PK compuesta, `business_id` ON DELETE CASCADE), RLS habilitada
  y las 4 policies por operación (`select`/`delete` con USING, `insert` con WITH CHECK, `update` con
  ambas) y la decisión explícita de **no** dar read a `anon`.
- `supabase/schema.sql` — estado actual del esquema: tablas `professionals` (líneas ~689-703, incluye
  el `service_id` de canchas que NO se toca) y `services` (~751-762), y las vistas públicas acotadas
  `public_professionals` (~737-745), `public_services` (~768-780) y `public_canchas` (~786-794).

### Patrón obligatorio a espejar (UI del mapeo)

- `app/(dashboard)/settings/settings-client.tsx` — `isMapped` / `toggleAgendaSpace` (617-648, escritura
  optimista con rollback vía browser client + RLS) y su render de chips (1468-1519). El componente
  sirve las 3 vistas (`config` / `servicios` / `equipo`) vía la prop `view`.
- `app/(dashboard)/equipo/page.tsx` — read-path del editor: redirect por vertical canchas (línea 18) y
  carga por tenant con `.eq('business_id', ...)`.
- `app/(dashboard)/servicios/page.tsx` — read-path de la cobertura: sirve a **todos** los verticales
  (comentario de las líneas 14-18 explica por qué NO redirige por vertical).

### Contexto de las fases que consumen esto (no se implementan acá)

- `.planning/workstreams/motor-reservas/ROADMAP.md` §"Phase 9" y §"Phase 10" — a quién le sirve el
  mapeo y con qué garantías (asignación dentro del RPC; vista acotada para el público).
- `app/[slug]/booking-client.tsx:476-487` — el paso "Sin preferencia" que YA existe en el booking
  público y que la Phase 10 vuelve real.

### Skills del proyecto aplicables

- `.claude/skills/supabase-multitenant-rls/SKILL.md` — obligatoria para la 057 (tabla nueva + policies).
- `.claude/skills/convenciones-forjo/SKILL.md` — naming, estructura y convenciones del panel.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`toggleAgendaSpace` + chips** (`settings-client.tsx:617-648` y `:1468-1519`): el editor de mapeo
  muchos-a-muchos ya existe y está probado en producción — estado local, escritura directa con el
  browser client (RLS), UI optimista con rollback y `toast`. D-06 es literalmente este patrón con
  `services` en lugar de `spaces`. Cero componentes nuevos.
- **`SettingsClient` con prop `view`**: un solo componente sirve `config` / `servicios` / `equipo`, así
  que el editor (equipo) y la cobertura (servicios) viven en el mismo archivo con el estado del mapeo
  compartido — sin duplicar fetch ni sincronizar dos árboles.
- **Migración 042** como plantilla textual de la 057 (tabla puente + 4 policies + comentario de por qué
  no hay acceso `anon`).
- **`term.resource` / `resolveVertical`** (`lib/verticals.ts`, `lib/use-terminology.tsx`): terminología
  por vertical ya resuelta, requerida por D-18.
- **Vistas públicas acotadas** (`public_professionals`, `public_services`): el criterio `WHERE active = true`
  que D-16 replica en la cobertura.

### Established Patterns

- **Tabla puente por tenant:** `business_id` NOT NULL + FKs NOT NULL + PK compuesta + `ON DELETE CASCADE`
  + RLS con 4 policies por operación. La escritura pasa `business_id` porque la columna es NOT NULL,
  pero la policy es la que valida — no es superficie falsificable.
- **Sin `anon` sobre tablas de config del motor:** el público nunca lee la puente; el read-path público
  lo resuelve el servidor (service-role) o una vista acotada. Precedente: `agenda_spaces` (D-06 Phase 3).
- **Defensa en profundidad:** además de RLS, filtro explícito `.eq('business_id', business.id)` en toda
  query del panel (ver `deleteSpace`, `settings-client.tsx:609`).
- **Migraciones numeradas aplicadas a mano**, validadas con `supabase db reset` local, con `schema.sql`
  regenerado después.

### Integration Points

- `supabase/migrations/057_*.sql` (nueva) + `supabase/schema.sql` (regenerado).
- `lib/types.ts` — tipo de la fila de la puente (espejo de `AgendaSpace`).
- `lib/staff-services.ts` (nuevo, D-12) + su archivo de tests en `test/`.
- `app/(dashboard)/equipo/page.tsx` y `app/(dashboard)/servicios/page.tsx` — sumar la carga del mapeo
  (y de `services` en `/equipo`, que hoy pasa `initialServices={[]}`).
- `app/(dashboard)/settings/settings-client.tsx` — bloque editor (vista `equipo`) + bloque cobertura
  (vista `servicios`), ambos gateados por vertical (D-18) y por cantidad de profesionales (D-07).

### Riesgo a vigilar

`/equipo` hoy pasa `initialServices={[]}`: el editor necesita los servicios del negocio, así que hay que
ampliar ese read-path **sin** romper el resto de la vista ni filtrar datos de más.

</code_context>

<specifics>
## Specific Ideas

- El usuario eligió sistemáticamente la opción **fail-open y sin precipicios**: comodín por persona,
  avisar en vez de bloquear, no auto-asignar servicios nuevos, no restringir el panel. El criterio
  transversal es **que configurar de a poco nunca rompa lo que ya funcionaba**.
- Y en paralelo, el criterio **espejar el patrón existente** en vez de inventar: la Phase 3 ya resolvió
  la misma forma de problema (`agenda_spaces`) y esta fase debe leerse como su hermana.
- El aviso de "sin cobertura" quiere ser **contextual, no solo pasivo**: el dueño tiene que enterarse
  en el momento en que lo provoca (D-10).

</specifics>

<deferred>
## Deferred Ideas

- **Filtrar el selector de profesional por capacidad en el panel** (alta manual de turno, alta de
  abonos). Descartado para v0.25 por D-04: toca formularios del motor ya entregado y agrega riesgo de
  regresión a una fase que hoy no lo toca. Candidato a milestone posterior.
- **Cobertura por sede** (tercer eje profesional × servicio × sede). Descartado por D-13; volvería a
  la mesa solo si aparece un negocio multi-sede con equipos realmente disjuntos.
- **Avisar al guardar si hay abonos activos con ese profesional y servicio** (variante de D-15).
  Descartado por costo/beneficio; el histórico y las series quedan intactos igual.
- **Vista pública acotada del mapeo** (`public_professional_services`). No entra en la 057 (D-11); si
  la Phase 10 la necesita, será una migración propia.
- **"Cualquiera" en el alta manual y en abonos** — ya diferido en `REQUIREMENTS.md` §Future Requirements.
- **Estrategia de asignación configurable** y **preferencia de profesional del cliente** — ya diferidos
  en `REQUIREMENTS.md` §Future Requirements.

### Reviewed Todos (not folded)

- **"Cupo por solape: capacity > 1 no controla turnos escalonados"**
  (`todos/pending/2026-07-22-cupo-por-solape-capacity-mayor-a-1-no-controla-turnos-escalo.md`, match
  score 0.6) — **no plegado**. Está explícitamente fuera de alcance en `REQUIREMENTS.md` §Out of Scope:
  es un bug real pero independiente de multi-staff, toca el mismo RPC y va a **v0.26** para no meter dos
  cambios grandes al núcleo anti-doble-booking en el mismo ciclo. Phase 8 ni siquiera toca el RPC.

</deferred>

---

*Phase: 8-Equipo — qué servicios hace cada profesional*
*Context gathered: 2026-07-24*
