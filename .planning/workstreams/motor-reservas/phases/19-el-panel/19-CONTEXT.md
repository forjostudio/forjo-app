# Phase 19: El panel - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Que el dueño pueda **configurar** desde Agenda lo que la Phase 18 volvió declarable: asignar
servicios a cada franja horaria, ver qué se da en cada una sin abrir nada, y que el caso por defecto
—una franja sin servicios— se lea como **"cualquiera"** y no como un estado vacío o a medio
configurar. Cierra **AGENDA-05** y **AGENDA-06**.

**Dentro:** la sección de horarios de `app/(dashboard)/agenda/agenda-client.tsx` (write path del
mapeo + su presentación), la copy del error `service_not_scheduled` en el cliente público
(condición heredada de la Phase 18), y la limpieza de `time_blocks.capacity` en la misma función que
se reescribe.

**Fuera:** la vista semanal de turnos, el booking público (AGENDA-07, Phase 20), el onboarding
(AGENDA-08, Phase 20), el mapeo de días especiales, y la propagación de `location_id` a la regla.

</domain>

<decisions>
## Implementation Decisions

### Persistencia del mapeo — el problema central de la fase

> **Contexto medido, no supuesto.** `saveHours()`
> ([agenda-client.tsx:366-388](../../../../../app/(dashboard)/agenda/agenda-client.tsx#L366-L388))
> hoy hace **delete-all + reinsert** de `time_blocks`, y `time_block_services` es su hijo con
> `ON DELETE CASCADE` en las dos FK (verificado contra el catálogo: es el **único** hijo de
> `time_blocks`). Hasta la Phase 18 esto no molestaba a nadie porque la tabla no tenía hijos. La 18
> le dio uno y **esta fase es la que hace que la gente lo llene**. Sin cambiar el guardado, cualquier
> mapeo que el dueño configure se borra solo al siguiente guardado de horarios — y el estado al que
> vuelve (comodín) es visualmente idéntico a "todavía no configuró nada". **AGENDA-05 no se puede
> cumplir sin resolver esto.**

- **D-01: Guardado por diff, conservando ids.** `saveHours()` deja de borrar todo: compara el estado
  local contra el de la base y hace UPDATE de los bloques que siguen, INSERT de los nuevos y DELETE
  sólo de los que el dueño realmente sacó. El dato ya está: `LocalBlock` carga el `id`
  ([:173](../../../../../app/(dashboard)/agenda/agenda-client.tsx#L173),
  [:259](../../../../../app/(dashboard)/agenda/agenda-client.tsx#L259)). Es el único camino que
  preserva la identidad del bloque de verdad — el mapeo, y cualquier hijo futuro de `time_blocks`,
  quedan a salvo **por construcción** y no por una re-asociación que hay que acertar.
  - Descartado: re-mapear por `(día, inicio, fin)` tras el reinsert. La re-asociación es heurística
    y falla **en silencio** si el horario cambió en el mismo guardado — el modo de falla exacto que
    este milestone viene evitando.
  - Descartado: mover el mapeo a una clave que no dependa del id del bloque. Es re-migrar el modelo
    que la Phase 18 acaba de poner en producción, pierde las FK compuestas que cerraron WR-02 y
    desalinea el molde de `professional_services`.

- **D-02: La fila ES el bloque; el horario es un atributo.** Cambiarle el horario a un bloque que ya
  tiene servicios hace UPDATE sobre la misma fila y **el mapeo queda intacto**. Es lo que el dueño
  espera: corrió media hora la apertura, no re-declaró qué da. Coincide con cómo se edita hoy (se
  toca el input de un bloque existente, no se borra y se crea otro).

- **D-03: Un solo guardado, el botón "Guardar horarios" que ya existe.** Horarios y servicios se
  editan en la misma pantalla y se guardan juntos: un solo estado sucio, un solo "acordate de
  guardar", y ninguna ventana donde el mapeo apunte a un bloque que todavía no existe.
  - Descartado: guardado automático al elegir el servicio — choca con el resto de la pantalla, que
    es explícitamente "editá y después guardá", y sobre un bloque recién agregado no hay a qué mapear.
  - Descartado: botón propio para el mapeo — abre la puerta a que el dueño guarde uno y se olvide
    del otro, y el que se olvida es justo el que decide qué ve el público.

- **D-04: El guardado entero es TODO O NADA, vía RPC transaccional.** El diff de bloques y la
  escritura del mapeo van dentro de **una** función de Postgres, en una sola transacción. Es el molde
  que el proyecto ya usa para lo que no puede quedar a medias (`book_slot_atomic`, migr. 058).
  **Cuesta una migración nueva: la 074.** A cambio elimina de raíz el estado intermedio donde los
  horarios cambiaron pero el mapeo quedó viejo — un estado que **el público VE** a través de
  `/api/booking/availability`.

- **D-05: "Copiar a otros días" arrastra el mapeo.**
  [applyCopyDay](../../../../../app/(dashboard)/agenda/agenda-client.tsx#L347) hoy copia horario,
  label, consultorio y cupo; ahora también los servicios asignados. Es el gesto central de un negocio
  de clases ("martes y jueves 15-16 cerámica" se carga una vez y se copia); copiar el horario sin
  qué se da convertiría el caso de uso del milestone en trabajo manual repetido.

- **D-06: Los días especiales quedan comodín, y se documenta.** Un día de `schedule_exceptions` no
  tiene mapeo posible y sigue ofreciendo todos los servicios. Es el comportamiento de hoy, es
  coherente con el backstop —que acepta lo que no cae en ninguna franja (AGENDA-04)— y es el caveat
  que la Phase 18 ya aceptó como **RA-04**. Extenderlo es capacidad nueva y merece su propia fase.

- **D-07: Borrar un servicio mapeado avisa antes, con el número.** *"Este servicio está asignado a 4
  franjas. Si lo borrás, esas franjas vuelven a ofrecer cualquier servicio."* Importa porque la
  franja **no queda rota: queda comodín**, o sea que pasa a ofrecer **más** de lo que el dueño
  quería — al revés de lo que uno espera de un borrado, y en silencio.
  - Descartado: impedir el borrado mientras esté mapeado. Sería un gate nuevo sobre `services`,
    justo la clase de gate que este workstream ya tuvo que corregir tres veces (migr. 063/065/070).

### Dónde y cómo se asigna

- **D-08: Segunda línea bajo la fila del bloque.** La fila de horarios queda como está
  (`[inicio] → [fin] [×]`) y debajo va una línea con los servicios como chips + un "+ Servicios". Se
  ve **sin abrir nada** (AGENDA-05) y no compite por el ancho de los inputs de hora, que a 375px ya
  se achican con `flex-1`.
  - Sinergia con D-12: sacar el stepper de cupo libera exactamente el espacio horizontal de esa fila.
  - Descartado: un botón que abre el modal existente — para saber qué se da habría que **abrir**
    algo, que es lo que AGENDA-05 prohíbe.
  - Descartado: inline junto a las horas — rompe la línea en mobile.

- **D-09: Chips toggleables con los servicios del negocio.** Cero clicks para VER el estado (los
  prendidos ya se leen), un click para cambiarlo, y hace evidente que "ninguno prendido" es un estado
  **válido** y no un campo sin llenar — que es exactamente lo que AGENDA-06 necesita.

- **D-10: Wrap con "ver todos (N)" después de ~2 filas de chips.** Un taller puede tener 8-10
  servicios. Los chips envuelven natural y se colapsan al pasar el umbral. El caso común (negocios de
  1-2 servicios, que es lo medido en la base) no paga nada. **El umbral exacto es detalle de UI-SPEC.**

- **D-11: Sólo los servicios ACTIVOS se ofrecen para asignar, pero desactivar uno NO borra su
  mapeo.** Mapear una franja a un servicio que nadie puede reservar no tiene sentido; pero si un
  servicio ya mapeado se desactiva, la fila de la puente sobrevive y el dueño lo reactiva y todo
  vuelve. **Queda para UI-SPEC:** si ese chip se sigue mostrando atenuado o desaparece.

- **D-12: Se pliega la limpieza de `time_blocks.capacity`** (todo pendiente). La columna no decide
  nada desde la migr. 068 y se escribe en
  [la misma función](../../../../../app/(dashboard)/agenda/agenda-client.tsx#L379) que hay que
  reescribir entera. Arrastrarla al código nuevo la volvería a legitimar. **Incluye el input de cupo
  de la UI, no sólo el insert** — dejar un campo visible que no persiste nada sería peor que no tocar
  nada.

### Qué muestra la grilla, y cómo se lee "cualquiera"

- **D-13: "La grilla" de AGENDA-05 es el EDITOR de horarios, no la vista semanal de turnos.** Los
  chips de D-08 ya cumplen el requisito. La vista semanal muestra turnos reales (cliente, estado,
  ocupación) y superponerle la configuración de la franja es información de otra naturaleza
  compitiendo por el mismo espacio.

- **D-14: Peso visual secundario** — chips neutros, texto chico, que no compitan con los inputs de
  hora. Coherente con que **el 100% de los negocios los va a ver vacíos el día del deploy**: si
  fueran llamativos, un estado que está bien se leería como algo que falta. Sin color por servicio
  (`services` no tiene columna de color; agregarla es capacidad nueva).

- **D-15: El encabezado de un día colapsado NO resume qué se da.** Sigue mostrando el rango horario.
  Resumir obligaría a colapsar 3 bloques con mapeos distintos en una línea, y ahí la síntesis miente
  fácil.

- **D-16: El estado vacío se muestra como un chip "Cualquier servicio".** Ocupa el lugar de un estado
  **declarado**, no de un hueco. Dice literalmente lo que significa y enseña la regla del comodín sin
  un texto de ayuda. Al prender el primer servicio real, ese chip desaparece — el cambio de estado es
  visible. **Queda para UI-SPEC:** si es clickeable o puramente informativo.
  - Descartado: texto atenuado — se lee como placeholder, la lectura exacta que AGENDA-06 evita.
  - Descartado: no mostrar nada — la capacidad se vuelve invisible y el dueño del taller nunca
    descubre que puede declarar qué se da.

- **D-17: Se vuelve a "cualquiera" apagando todos los chips**, y el chip "Cualquier servicio"
  **reaparece al instante**. Apagar todo se lee intuitivamente como "esta franja no da nada" y
  significa lo contrario: la ambigüedad se resuelve **mostrando el resultado**, no advirtiendo sobre
  él. Es lo que menos texto agrega y lo que sigue siendo cierto si alguien cambia la copy después.

### Deuda heredada de la Phase 18 que se cierra acá

- **D-18: La copy de `service_not_scheduled` entra en ESTA fase.** Phase 18 aceptó **WR-07 con
  condición explícita** (`18-SECURITY.md` §9): el error no tiene copy en el cliente y cae en *"Error
  al confirmar. Intentá de nuevo."* — un reintento que nunca puede funcionar. Es inalcanzable hasta
  que exista la primera fila de mapeo, y **esta fase la crea**. Diferirlo a la Phase 20 dejaría una
  ventana donde el error ES alcanzable y no tiene mensaje, que es justo lo que la condición buscaba
  evitar.

- **D-19: WR-04 (`location_id`) NO se toca; se documenta el límite.** El bloque ya lleva su
  `location_id`, así que un dueño multi-sede **puede** mapear por sede sin problemas; lo que no filtra
  por sede es la **lectura** en la disponibilidad. Cerrarlo implica tocar el helper puro y los dos
  consumidores públicos que la Phase 18 acaba de asegurar con 0 amenazas abiertas, para un caso con
  **0 negocios afectados** (medido). Se cierra cuando aparezca el primero.

### Claude's Discretion

- La firma del RPC de la 074, cómo se serializa el diff (JSON de bloques + mapeo), y el mapeo de sus
  rechazos a copy propia — **nunca interpolar el mensaje de la base** (T-14-25 / T-13-09).
- El umbral exacto de "ver todos" (D-10), si el chip "Cualquier servicio" es clickeable (D-16), y el
  tratamiento visual de un servicio desactivado que sigue mapeado (D-11). Van a UI-SPEC.
- Cómo se representa un bloque recién agregado (sin `id` todavía) en el payload del RPC.

### Folded Todos

- **"El editor de horarios sigue escribiendo `time_blocks.capacity`, una columna que ya no decide
  nada"** (`cleanup`) — se pliega vía **D-12**. La columna dejó de decidir en la migr. 068 y se
  escribe en la misma función que esta fase reescribe entera.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### El modelo y la regla (Phase 18 — obligatorio)
- `.planning/workstreams/motor-reservas/phases/18-el-modelo-y-la-disponibilidad/18-CONTEXT.md` —
  D-01 (tabla puente con regla del comodín), D-02 (cero regresión por construcción), D-05 (por qué la
  vista acotada NO lleva `security_invoker`), D-16 (el helper no filtra por negocio: lo hace el caller)
- `supabase/migrations/071_time_block_services.sql` — la tabla puente, sus 4 policies y la vista
  acotada. **Leer la cabecera entera**: documenta la divergencia obligada del molde 057
  (`time_blocks.business_id` es NULLABLE) y la corrección del comentario falso del GRANT
- `lib/time-block-services.ts` — la regla del comodín en 4 funciones puras. **NO se reimplementa**
  (AGENDA-02); el panel la consume igual que la disponibilidad y el backstop
- `test/time-block-services.test.ts` — los 16 casos, con el control negativo por cada caso comodín

### Lo que la seguridad dejó cerrado y lo que dejó atado
- `.planning/workstreams/motor-reservas/phases/18-el-modelo-y-la-disponibilidad/18-SECURITY.md` §9 —
  **WR-07 aceptado CON CONDICIÓN** (la copy que D-18 trae acá) y WR-04 (el límite de D-19)
- `.planning/workstreams/motor-reservas/phases/18-el-modelo-y-la-disponibilidad/18-REVIEW.md` —
  WR-02 (por qué las FK compuestas), WR-03 (no escribir antes de validar en superficie pública)
- `supabase/migrations/072_public_views_read_only.sql` — **la regla dura**: toda vista `public_*` va
  con `GRANT SELECT`, **nunca** `ALL`, y **sin** `security_invoker`
- `supabase/migrations/073_tenant_integrity_and_default_privs.sql` — las FK compuestas de la puente
  (una fila cross-tenant ahora la rechaza la BASE) y los default privileges desarmados

### El molde del RPC transaccional (D-04)
- `supabase/migrations/058_book_slot_atomic.sql` — el patrón de "todo o nada" que ya usa el proyecto
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — **obligatorio**: el write path del panel lleva
  `.eq('business_id', business.id)` como todo el dashboard, y el rechazo de la base se mapea a copy
  propia sin interpolar el mensaje

### El archivo que se toca
- `app/(dashboard)/agenda/agenda-client.tsx` — 1344 líneas. `saveHours()` :366, `applyCopyDay()` :347,
  `LocalBlock` :173, la fila del bloque :920-995, el stepper de cupo a sacar :941-965
- `app/(dashboard)/agenda/page.tsx` — el server component que carga `time_blocks`, `services`,
  `locations`. **Hay que sumar la lectura de `time_block_services`**
- `.claude/skills/convenciones-forjo/SKILL.md` — convenciones del dashboard

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`LocalBlock` ya carga el `id` de la base** ([:173](../../../../../app/(dashboard)/agenda/agenda-client.tsx#L173),
  [:259](../../../../../app/(dashboard)/agenda/agenda-client.tsx#L259)) — el guardado por diff (D-01)
  es viable **sin rediseñar la pantalla**. Es el hallazgo que hace barata la decisión difícil.
- **Dialog (desktop) / Drawer vaul (mobile)** ya montados con `useMediaQuery` :152 — si algo necesita
  modal, el shell responsive existe. ⚠ Ver `[[drawer-select-portal-fix]]`: los `Select` dentro del
  Drawer tuvieron un bug de portal en mobile.
- **`lib/agenda-occupancy.ts`** — módulo puro con 20 casos y garantías probadas por mutación. Es el
  molde de "la UI sólo PINTA lo que un módulo puro decide"; el mapeo debería seguirlo.
- **`Tabs` de consultorio** :884-890 — el patrón por sede ya existe si hiciera falta.

### Established Patterns
- **La pantalla es "editá y después guardá"**, no autosave. D-03 lo respeta.
- **Todo write del panel lleva `.eq('business_id', business.id)`** aunque la RLS ya acote.
- **Los comentarios densos en español explican el POR QUÉ**, no el qué. `saveHours()` y el bloque de
  ocupación :528-545 son el ejemplo del nivel esperado.
- **La ocupación NO se recalcula en la UI** — sale de un módulo puro. Mismo criterio para la regla del
  comodín: sale de `lib/time-block-services.ts`.

### Integration Points
- `app/(dashboard)/agenda/page.tsx` :28 — el `Promise.all` que carga los datos. Entra
  `time_block_services` filtrado por `business_id`.
- `saveHours()` :366 — el punto de reescritura. Hoy: `delete().eq(business_id)` + `insert(toInsert)`.
- `applyCopyDay()` :347 — suma el mapeo al objeto copiado (D-05).
- El cliente público (`app/[slug]/booking-client.tsx`) — donde entra la copy de D-18.

</code_context>

<specifics>
## Specific Ideas

- **El caso de uso que manda:** *"martes y jueves 15-16 cerámica"*. Es el ejemplo con el que se
  originó el milestone y el que valida D-05 (copiar día arrastra el mapeo): si no se copia, el gesto
  central se vuelve trabajo manual repetido.
- **El estado por defecto es el estado de TODOS.** El día del deploy, el 100% de los negocios tiene 0
  filas en la puente. Cada decisión visual (D-14, D-16, D-17) se juzga contra eso: lo que se ve tiene
  que leerse como "está bien así", nunca como "te falta configurar esto".
- **Apagar todos los chips significa lo contrario de lo que parece.** Se resuelve mostrando el
  resultado (el chip reaparece), no advirtiendo sobre él.

</specifics>

<deferred>
## Deferred Ideas

- **Mapeo de servicios en los días especiales** (`schedule_exceptions`) — capacidad nueva: otra tabla
  puente, otro consumidor en la disponibilidad y otro en el backstop. Su propia fase.
- **Mostrar qué servicio corresponde a cada franja en la VISTA SEMANAL de turnos** — se decidió
  cerrar AGENDA-05 con el editor. Revisitar con datos de uso real.
- **Propagar `location_id` a la regla del comodín** (WR-04) — 0 negocios multi-sede medidos. Se cierra
  cuando aparezca el primero; toca el helper puro y los dos consumidores públicos.
- **Color por servicio** — `services` no tiene columna de color. Ayudaría a un taller con 8 talleres
  distintos; es capacidad nueva.

### Reviewed Todos (not folded)
- **"`book_slot_atomic` es ejecutable por `anon` y saltea todos los controles del route handler"**
  (`security`, score 0.9) — preexistente desde la migr. 041, aceptado como **RA-05** en la Phase 18.
  Candidato al milestone siguiente, no a esta fase.
- **"El gate de modo se esquiva moviendo `services.business_id` a otro negocio propio"**
  (`security`, 0.9) — territorio de `capacity_mode` (v0.27), no de la agenda por servicio.
- **"Las suites de abono fallan distinto en cada corrida del suite completo"** (`testing`, 0.6) —
  flakiness de infra confirmada durante la Phase 18: contención contra la misma DB local. Con
  `--no-file-parallelism` la suite da 77 archivos / 1013 passed. Es infra de testing, no de esta fase.
- **"Un turno FUTURO marcado completado no tiene ninguna salida en el panel"** (`frontend`, 0.6) —
  otra pantalla, otro flujo.
- **"El roster dice 'Seña pendiente' también cuando el hold ya venció"** (`ux`, 0.6) — vista semanal
  de turnos, no el editor de horarios.

</deferred>

---

*Phase: 19-el-panel*
*Context gathered: 2026-08-25*
