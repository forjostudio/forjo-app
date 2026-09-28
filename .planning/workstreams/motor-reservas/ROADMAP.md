# Roadmap: Forjo App — Motor de Reservas (workstream `motor-reservas`)

> Workstream `motor-reservas`. Cubre **v0.12 Motor de Reservas** (Phases 1-3, shipped 2026-06-30), **v0.22 Turnos: alta manual y ventana de reserva** (Phases 4-5, shipped 2026-07-19), **v0.24 Turnos fijos / Abonos recurrentes** (Phases 6-7, shipped 2026-07-22) **v0.25 Reserva con varios profesionales / multi-staff** (Phases 8-11, shipped 2026-07-28) **v0.26 Cupo por solape + cierre de backlog** (Phases 12-14, shipped 2026-08-11) **v0.27 Cupo unificado por servicio** (Phases 15-17, shipped 2026-08-24) **v0.28 La agenda por servicio** (Phases 18-21, shipped 2026-09-14) y **v0.29 El catálogo del booking** (Phases 22-24, shipped 2026-09-28). Numeración de fases **continua** por workstream. PROJECT.md compartido en `.planning/PROJECT.md`; los requirements de cada milestone se archivan en `.planning/milestones/`.

## Overview

**v0.12 (shipped):** El milestone convierte "agenda" de *1-turno-por-slot / 1-recurso = 1-profesional* en un recurso reservable real con capacidad (cupos grupales) y relaciones de espacio físico (canchas), más turnos manuales desde el panel — para desbloquear rubros nuevos (gimnasios, clases grupales, canchas). El núcleo de integridad que endureció v0.9 (constraints 011/013 + concurrencia anti-doble-booking) se toca con cuidado: cada fase preserva el aislamiento por tenant (RLS + `business_id`) y la garantía anti-doble-booking, con **cero regresión** para el caso 1-turno-por-slot. El faseo va por riesgo creciente: primero turnos manuales (no toca constraints), después cupos grupales (redefine constraints a capacity-aware + concurrencia anti-sobrecupo), y por último espacio compartido (exclusión acoplada entre agendas), construido sobre el modelo de capacidad/concurrencia de la fase anterior y recortable como fase final sin tocar lo entregado.

**v0.22 — Turnos: alta manual y ventana de reserva (shipped 2026-07-19):** dos mejoras acotadas sobre el motor ya entregado, **sin reconstruir nada de v0.12**. (1) **Ventana de reserva:** el dueño limita hasta con cuánta anticipación puede reservar el público (una sola métrica global por negocio, `businesses.max_advance_days`, vacío/0 = sin límite); el tope se respeta en los **dos** calendarios públicos (general + canchas) y, como **backstop anti-tampering**, en el servidor (`app/api/booking/create`) — el alta manual autenticada queda **exenta**. (2) **Aviso al cliente:** el form "Nuevo turno" ya existente (v0.12: `app/api/appointments/create`) suma un checkbox **opt-in** para mandarle al cliente un mail de turno confirmado, respetando el default de v0.12 (no se manda salvo que se pida). Las dos mejoras son superficies distintas (público vs. alta autenticada) → una fase cada una.

**v0.24 — Turnos fijos / Abonos recurrentes (shipped 2026-07-22):** capacidad NUEVA sobre el motor ya entregado: el dueño arma un **abono semanal** (turno fijo recurrente) para un cliente desde el panel; el sistema **genera los turnos hacia adelante** (ventana rolling, extendida por el cron diario existente) respetando la integridad anti-doble-booking (constraints 011/013), los cupos/capacity y la exclusión por espacio compartido (canchas); el cliente **cancela la suscripción** desde un link en el mail y el dueño la da de baja desde el panel. **Solo reserva** — el cobro recurrente automático es un milestone futuro, pero el **modelo de datos se diseña extensible** para sumarlo sin re-migrar. Toca el núcleo de integridad anti-doble-booking + el aislamiento por tenant → la fase del modelo/generación es **security-sensitive** (secure-phase obligatorio). El faseo va por integridad: primero el modelo + alta + generación forward (el núcleo sensible), después la cancelación (mail + panel), que depende de la serie ya existente.

**v0.25 — Reserva con varios profesionales / multi-staff (Phases 8-11, shipped 2026-07-28):** capacidad NUEVA sobre el motor ya entregado, **sin reconstruirlo**. El negocio declara **qué servicios hace cada persona** del equipo (mapeo **muchos a muchos** propio, migración **057** — `professionals.service_id` es *single* y es el mecanismo de **canchas** (migr. 043): NO se toca ni se recicla), y el cliente reserva **eligiendo profesional o dejando "cualquiera"**; en ese caso el sistema le asigna uno **libre y capaz** eligiendo el que menos turnos tiene ese día. La asignación automática corre **DENTRO del RPC atómico `book_slot_atomic`** — leer profesionales libres y después insertar sería una carrera —, por lo que la fase de asignación es el punto de mayor riesgo del milestone (**secure-phase obligatorio**). El faseo va por dependencia y riesgo creciente: primero el **modelo + config del equipo** (no toca el motor), después la **asignación atómica** en el RPC (el núcleo anti-doble-booking), después la **disponibilidad across staff** en las superficies públicas (que necesita saber quién puede hacer qué), y al cierre un **backlog chico** independiente del motor. **Cero regresión obligatoria** en: canchas, abonos (generación forward por el mismo motor), cupos grupales (`time_blocks.capacity`) y exclusión por espacio compartido. **Fuera de alcance:** el **cupo por solape** (`capacity > 1` contado por hora de inicio exacta) — bug real y capturado, pero independiente de multi-staff y sobre el mismo RPC → **v0.26**, para no meter dos cambios grandes al núcleo en el mismo ciclo.

**v0.26 — Cupo por solape + cierre de backlog (Phases 12-14, shipped 2026-08-11):** cierra un bug de integridad capturado desde v0.12 y drena el backlog chico acumulado. El plato principal: hoy `time_blocks.capacity > 1` cuenta el sobrecupo **por hora de inicio exacta** — correcto para una *clase grupal* (yoga 16:00, cupo 10) pero **roto** para un *recurso simultáneo* (kinesiólogo con 2 camillas), donde turnos **escalonados** que se pisan superan el cupo. v0.26 separa las dos semánticas eligiéndolas **por servicio**: la de clase grupal queda intacta y se agrega un modo nuevo que **coexiste**, donde el cupo se cuenta por **solape de intervalos** (usando `duration_minutes`). El control corre **DENTRO del RPC atómico `book_slot_atomic`**, re-granularizando el advisory lock (hoy por slot+bucket — dos reservas escalonadas toman locks distintos y se cuelan; pasa a bucket+día/ventana) y separando la asignación de `seat` del criterio de cupo, con **cero regresión** de cupo 1, canchas, abonos, multi-staff y espacio compartido — es el punto de mayor riesgo (**secure-phase obligatorio** + tests de carrera contra la DB). Después, un **borrado de servicio que preserva el historial**: el dueño borra un servicio con solo turnos pasados/cancelados, un modal bloquea el borrado si hay futuros (ofrece desactivar), y los turnos pasados sobreviven en Finanzas / la ficha del cliente vía **desacople del FK** (snapshot de nombre/precio en el turno) — nunca hard-delete de la historia. Y al cierre, el **backlog chico de polish** (ancho de botones app-wide, `RiskBadge` con color fuera del CRM, un abono cancelado sin "Copiar link de baja", un cliente nuevo en "Nuevas" y no en "Pausa"), independiente del motor. El faseo va por riesgo: primero el cambio del motor (12, aislado como una única unidad revisable), después el borrado con historial (13, toca el write-path del alta pero es independiente del cupo), y por último el polish (14).

**v0.27 — Cupo unificado por servicio (Phases 15-17, shipped 2026-08-24):** v0.26 arregló **cómo** se cuenta el cupo; este milestone arregla **dónde vive el número** y **qué modos se pueden declarar** — el mismo defecto de modelo, detectado en la UAT de la Phase 12. Hoy "Individual" no se puede declarar (se deduce de `time_blocks.capacity = 1`, que vive en otra tabla y no sabe a qué servicio corresponde) y el cupo tiene **dos fuentes de verdad**: `time_blocks.capacity` para la clase grupal, `services.capacity` para el recurso simultáneo. v0.27 unifica a un enum de **tres** modos con `services.capacity` como fuente única del número: el **modo** decide cómo se cuenta, `services.capacity` decide cuánto, y `time_blocks.capacity` deja de decidir. En el mismo territorio se cierra el **riesgo residual R-1** de `12-SECURITY.md` — cambiar `capacity_mode` en un servicio con turnos ya creados deja filas `is_group = true` huérfanas, fuera del EXCLUDE gist y del gate espejo, o sea solapes permanentes que ningún gate detecta. **El cutover no afecta a nadie**: medido contra producción el 2026-08-11, los 19 bloques existentes tienen cupo máximo **1**, así que no se construye aviso de re-declaración y el backfill —la parte que se estimaba cara— deja de ser un problema. El faseo va por riesgo, como en v0.26: primero el modelo y el motor (15, `secure-phase` obligatorio, toca `book_slot_atomic` y sus cuatro consumidores), después la superficie del panel y el polish pendiente (16).

**v0.28 — La agenda por servicio (Phases 18-21, shipped 2026-09-14):** `time_blocks` sabe decir *"atiendo de tal hora a tal hora"* y **no sabe decir** *"a esta hora doy cerámica"* — la tabla es `business_id + day_of_week + start_time + end_time` y no tiene servicio. Alcanza para una peluquería, donde cualquier servicio entra en cualquier franja; **no alcanza** para un taller, un estudio de danza o un gimnasio, **donde la franja ES la clase**. Es **el mismo defecto que v0.27 atacó, un nivel más arriba**: v0.27 sacó el cupo de `time_blocks` *porque el bloque no sabía a qué servicio correspondía*, o sea trató el síntoma —dónde vive el número— y dejó la causa intacta. Y despejó el camino: desde la migr. **068** esa tabla ya no decide nada más que **cuándo**, así que el paso natural es que también declare **qué**. El modelo es una **tabla puente con la regla del comodín**, copiando `professional_services` (migr. 057, v0.25, con su helper puro ya en producción): **0 filas = la franja sirve para cualquier servicio**, que es el comportamiento vigente ⇒ **cutover gratis y cero regresión POR CONSTRUCCIÓN**, la misma jugada que `individual` en v0.27. **Fuera de alcance:** el cruce con multi-staff (*"martes 15-16 cerámica con Ana"*) — la franja declara **qué**, no **quién**, y el quién ya lo resuelve `professional_services` desde v0.25; se suma después sin re-migrar. El faseo va por riesgo: primero el **modelo y la disponibilidad** (18, `secure-phase` obligatorio — toca la superficie que decide qué se le ofrece a un cliente anónimo), después el **panel** que deja configurarlo (19), y al cierre el **booking público y el onboarding** (20), que son las dos caras de que un negocio de clases pueda operar de verdad.

**v0.29 — El catálogo del booking (Phases 22-24, shipped 2026-09-28):** el booking público muestra **todos los servicios en una grilla plana de dos columnas** (`grid-cols-1 sm:grid-cols-2`, `booking-client.tsx:566`): una peluquería con 12 servicios los tira en una lista sin jerarquía, y en desktop los nombres largos se parten en dos líneas justo donde en mobile ya se ven bien. v0.29 es **la contracara de v0.28**: aquel milestone hizo que la **franja** declarara *qué* se da en ella; éste hace que el **catálogo** declare *cómo se lee*. El modelo es una **tabla de categorías por negocio** (migr. **078**, la única del milestone) más `services.category_id` **nullable**, y la regla vuelve a ser la del comodín que ya usan `professional_services` (v0.25) y `time_block_services` (v0.28), un escalón más abajo: **la ausencia de dato significa "se muestra como hoy", nunca "no se muestra"** — un negocio sin categorías ve la lista de hoy, y un servicio sin categoría **nunca desaparece** del catálogo público (aparece al final bajo "Otros"). Eso hace **CAT-07 verdadero POR CONSTRUCCIÓN**, que es la promesa que no se puede romper: el día de la migración **todos** los negocios de producción tienen cero categorías, así que el camino sin categorías es el de **todos** los clientes actuales. El patrón de reordenar se **porta** de `forjo-tiendas` —`draggable` nativo de HTML5 para desktop **+** botones ▲/▼ con `aria-label` para mobile y teclado, con el orden persistido **renumerando la lista completa de hermanas**— y se porta, **no se copia**: allá las columnas están en español y el esquema de RLS es otro. **Riesgo bajo comparado con v0.28**: no toca `book_slot_atomic`, ni los constraints anti-doble-booking, ni la disponibilidad; el único punto sensible es la **lectura anónima**, que se resuelve con una **vista acotada** (`public_service_categories`) en vez de abrir la tabla, como `public_professional_services` (migr. 059) y `public_time_block_services` (migr. 071). **Fuera de alcance:** subcategorías, precio en la categoría, la categoría como paso del funnel, modo de orden por categoría, y ocultar servicios con la categoría (para eso ya existe "desactivar"). El faseo va **por superficie**, no por riesgo creciente —acá hay un solo punto sensible y está en el modelo—: primero el **modelo y la regla pura** (22, `secure-phase` obligatorio: es donde se abre la lectura anónima y donde CAT-07 se vuelve cierto por construcción), después el **panel** que deja organizar el catálogo (23), y al cierre la **página pública** (24), que toca `booking-client.tsx` **una sola vez** para los títulos y el formato de tarjeta a la vez. **Sin fase de onboarding**: ningún requisito CAT la menciona, asignar categoría no es obligatorio en ningún punto del flujo (CAT-02), y un negocio recién dado de alta nace con cero categorías — o sea, directo en el camino de CAT-07, que es el que esta fase promete no tocar.

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

### Milestone v0.28 — La agenda por servicio (shipped 2026-09-14)

> Archivado en `.planning/milestones/v0.28-ROADMAP.md` y `v0.28-REQUIREMENTS.md`. El faseo creció de 3 a **4** fases: se sumó la 21 para que el alta declare la agenda sin pasar por el panel. Migraciones **071-077**, todas en producción. Auditoría de cierre: 8/8 requirements, 0 blockers, 3 warnings de deuda.

- [x] **Phase 18: El modelo y la disponibilidad** - Tabla puente `time_block_services` con la regla del comodín (0 filas = cualquier servicio), la regla encapsulada en un helper puro con tests (molde `lib/staff-services.ts`), y `/api/booking/availability` respetándola — el endpoint ya recibe `serviceId` desde v0.27. **Cero regresión por construcción:** el día de la migración todos los negocios tienen 0 filas. **`secure-phase` obligatorio** (completed 2026-08-25)
- [x] **Phase 19: El panel** - El dueño asigna servicios a cada franja desde Agenda y la grilla muestra qué se da en cada una sin abrir nada; una franja sin servicios se lee como "cualquiera", no como un estado vacío (6/6 planes — UAT 3/3 verificada en PRODUCCIÓN, `19-UAT.md`) (completed 2026-08-31)
- [x] **Phase 20: Lo que el público ve** - El cliente que elige un servicio ve solo los horarios donde ese servicio se da, y un servicio sin franjas que lo cubran queda deshabilitado con el motivo a la vista, en vez de un calendario mudo (AGENDA-07) (completed 2026-09-10)
- [x] **Phase 21: Lo que el negocio declara** - El onboarding deja que un negocio de clases declare su agenda real desde el alta, sin tener que entrar al panel después (AGENDA-08) (completed 2026-09-13)

### Milestone v0.27 — Cupo unificado por servicio (shipped 2026-08-24)

> Archivado en `.planning/milestones/v0.27-ROADMAP.md` y `v0.27-REQUIREMENTS.md`. El faseo creció de 2 a **3** fases: la 16 se replanteó y la superficie del panel pasó a ser la 17, que terminó con 10 planes y 5 rondas de UAT.

Faseo por riesgo, igual que en v0.26: el cambio del modelo y del motor va primero y aislado (`secure-phase` obligatorio, toca `book_slot_atomic`); la superficie del panel y el polish van después, sin tocar el motor.

- [x] **Phase 15: Modelo de cupo unificado** - `services.capacity_mode` a enum de tres (`individual` default | `group_class` | `simultaneous_resource`) con `services.capacity` como única fuente del número; `time_blocks.capacity` deja de decidir; y el cambio de modo se rechaza en la base si el servicio tiene turnos futuros vivos (cierra R-1). **secure-phase obligatorio**
 (completed 2026-08-16)

- [x] **Phase 16: Correcciones del gate** - Migración **070** sobre el predicado de los gates: estrecharlo por dirección (`individual` → grupal/simultáneo es seguro y hoy se bloquea sin motivo), que marcar `completed` un turno futuro deje de abrirlo, y que compare **fecha + hora** en vez de solo la fecha en los gates de la 065 y la 068. **secure-phase obligatorio** (completed 2026-08-18)
- [x] **Phase 17: Superficie y polish** - Copy que distinga grupal de simultáneo + los tres defectos del editor que levantó la UAT, badge de modo en `/servicios`, la grilla de la agenda leyendo `services.capacity` y mostrando la ocupación grupal, y Finanzas mobile mostrando el servicio (completed 2026-08-20)

### Milestone v0.29 — El catálogo del booking (shipped 2026-09-28)

> **Archivado.** Detalle completo de las Phases 22-24 en [`.planning/milestones/v0.29-ROADMAP.md`](../../milestones/v0.29-ROADMAP.md) · requisitos en [`v0.29-REQUIREMENTS.md`](../../milestones/v0.29-REQUIREMENTS.md) · auditoría de cierre en [`v0.29-MILESTONE-AUDIT.md`](./v0.29-MILESTONE-AUDIT.md).

**3 fases · 18 planes · 11/11 requisitos (CAT-01…CAT-11) · migración 078 (la única) · 2 UAT humanas (30/30 y 18/18) · 3 × `secure-phase` con `threats_open: 0` · auditoría de milestone `passed`, 0 blockers.**

| Fase | Qué entregó |
|---|---|
| **22** — El modelo del catálogo | La tabla de categorías por negocio (migr. 078), la vista acotada `public_service_categories` para el anon, y el módulo puro `lib/service-categories.ts` que es la **fuente única** del agrupado y del orden en los dos ejes. Acá CAT-07 se vuelve cierto **por construcción**. |
| **23** — El panel que organiza el catálogo | El dueño crea, renombra y borra categorías, asigna una o ninguna por servicio, las reordena **arrastrando y con ▲/▼** (mobile y teclado incluidos), elige los dos modos de orden para todo el negocio, y escribe la descripción corta que el booking ya renderizaba desde una columna muerta. |
| **24** — El catálogo que el cliente lee | El agrupado llega a `/[slug]` y al preview de `/web`, con las tarjetas en una columna a lo ancho en desktop. Sumó en la UAT una **barra de chips que filtra** (D-16, revisa D-11) y el arreglo del nombre largo que desbordaba. |

> **Lo que más valió atrapar, y no producía ningún error:** las dos columnas de modo de orden no estaban en **ninguno** de los dos `select`, así que llegaban `undefined` y `groupCatalog` caía a `'custom'` **por casualidad**. Todos los negocios habrían visto el orden equivocado, sin un solo síntoma. Lo cerró la verificación humana, y hoy lo cubre un test de regresión que hace grep sobre el código fuente.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 (v0.12, shipped) → 4 → 5 (v0.22, shipped) → 6 → 7 (v0.24, shipped) → 8 → 9 → 10 → 11 (v0.25, shipped 2026-07-28) → 12 → 13 → 14 (v0.26, shipped 2026-08-11) → 15 → 16 → 17 (v0.27, shipped 2026-08-24) → **18 → 19 → 20 → 21 (v0.28, shipped 2026-09-14)** → **22 → 23 → 24 (v0.29, shipped 2026-09-28)**. Los **ocho** milestones cerrados quedan en el historial.

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
| 17. Superficie y polish | 10/10 | Complete   | 2026-08-24 |
| 18. El modelo y la disponibilidad | 4/4 | Complete | 2026-08-25 |
| 19. El panel | 6/6 | Complete | 2026-08-31 |
| 20. Lo que el público ve | 2/2 | Complete | 2026-09-10 |
| 21. Lo que el negocio declara | 2/2 | Complete | 2026-09-13 |
| 22. El modelo del catálogo | 4/4 | Complete    | 2026-09-15 |
| 23. El panel que organiza el catálogo | 11/11 | Complete    | 2026-09-21 |
| 24. El catálogo que el cliente lee | 3/3 | Complete    | 2026-09-28 |
