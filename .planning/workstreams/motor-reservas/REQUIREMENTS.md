# Requirements: v0.27 — Cupo unificado por servicio

> Workstream `motor-reservas`. Numeración de fases **continua**: v0.27 arranca en **Phase 15**.
> Milestone anterior: v0.26 Cupo por solape + cierre de backlog (shipped 2026-08-11, tag `v0.26`).

## Contexto

v0.26 arregló **cómo** se cuenta el cupo (por hora de inicio exacta para una clase grupal, por solape
de intervalos para un recurso simultáneo). Lo que dejó sin arreglar es **dónde vive el número** y
**qué modos se pueden declarar**. Son el mismo defecto de modelo, detectado en la UAT de la Phase 12.

### (a) "Individual" no se puede declarar

El segmented control obliga a elegir entre *Clase grupal* y *Recurso simultáneo*. Un corte de pelo
para una persona queda etiquetado como **clase grupal**, que es falso. Hoy "individual" se expresa
implícitamente como `capacity_mode = 'group_class'` + `time_blocks.capacity = 1` — o sea, no se
declara: **se deduce de otra tabla**.

### (b) El cupo tiene dos fuentes de verdad

| Modo | De dónde sale el cupo | Scope de esa columna |
|---|---|---|
| `group_class` | `time_blocks.capacity` | business + day_of_week + ventana horaria — **NO por servicio** |
| `simultaneous_resource` | `services.capacity` | por servicio |

Un negocio puede tener un bloque de cupo 3 y un servicio de cupo 2, y cuál manda depende del modo.
El defecto de fondo: **el bloque no sabe a qué servicio corresponde**. Un bloque de cupo 15 de 9 a 10
no declara en ningún lado que la clase de las 9 es "Funcional".

### Por qué los dos modos NO son intercambiables

La intuición de "clase grupal es redundante con recurso simultáneo" apunta al lugar correcto pero
llega a la conclusión equivocada. La diferencia real es el **eje de conteo**:

- **Clase grupal:** 15 personas, todas arrancan 9:00. Se cuenta por hora de inicio exacta.
- **Recurso simultáneo:** 2 camillas, gente a las 16:00, 16:15, 16:30. Se cuenta por solape.

Modelar una clase de spinning como simultáneo cupo 15 dejaría que alguien reserve 9:30 y **se sume a
mitad de clase**. El modo simultáneo es estrictamente más permisivo, así que no subsume al grupal.
Lo redundante no son los modos: es que el **número** viva en dos tablas.

### El modelo al que vamos

```
services.capacity_mode = 'individual' | 'group_class' | 'simultaneous_resource'
services.capacity      = N            -- lo usan grupal Y simultáneo; individual fuerza 1
time_blocks.capacity                  -- legacy, deja de decidir
```

El **modo** decide cómo se cuenta; **`services.capacity`** decide cuánto. `individual` es el default y
replica exactamente el comportamiento de hoy.

## Decisiones tomadas antes de planificar

**D-01 — Cutover, sin fallback transicional.** `services.capacity` es la única fuente desde el día 1;
`time_blocks.capacity` deja de decidir. No se escribe regla de precedencia en el RPC y no queda
deprecación pendiente.

**D-02 — El cutover no afecta a nadie, medido contra producción (2026-08-11).**

```sql
select count(*) as bloques_totales,
       count(*) filter (where capacity is null) as sin_capacity,
       max(capacity) as cupo_max
  from time_blocks;
-- → bloques_totales 19 · sin_capacity 0 · cupo_max 1
```

19 bloques, la columna existe y está poblada en todos, y **el cupo máximo en producción es 1**. Ningún
negocio usa cupo por bloque. Por eso: **no se construye aviso de re-declaración** (no hay a quién
avisarle) y **el backfill deja de ser un problema** — la trampa de "el bloque no sabe el servicio" es
real como defecto de modelo, pero no tiene consecuencia práctica porque no hay datos que migrar.

> ⚠ El control se corrió **a propósito** además del filtro `where capacity > 1`, que había dado
> "Success, no rows": una query que devuelve 0 filas es indistinguible de una que no midió lo que
> creías (lección de la Phase 14). El control prueba que hay datos y que la columna es la correcta.

**D-03 — R-1 se cierra bloqueando, no reparando.** Cambiar `capacity_mode` en un servicio con turnos
futuros vivos se **rechaza** en la base con un código de dominio propio, con el molde fail-closed que
ya usan los gates de borrado de las migraciones 065 y 066. Reparar las filas existentes se descartó:
puede descubrir que dos turnos ya se solapan de forma ahora ilegal, y ahí el EXCLUDE aborta la
transacción igual — el owner queda con un error peor y sin salida clara.

## Requisitos

### Modelo y motor (Phase 15)

- [x] **CUPO-06** — `services.capacity_mode` pasa a un enum de **tres** valores
      (`individual` | `group_class` | `simultaneous_resource`), con `individual` como **default**.
      Un servicio individual fuerza cupo 1 y se comporta byte-idéntico a hoy.

- [x] **CUPO-07** — `services.capacity` es la **única** fuente del número para los tres modos.
      `book_slot_atomic` deja de leer `time_blocks.capacity` para decidir cupo. Cero regresión de los
      cuatro consumidores del RPC (booking público, alta manual, generación forward de abonos, canchas).
      *(El motor quedó cerrado en **15-03**: RPC + espejo en `schema.sql` + control negativo A/B contra
      la función de la 064. **15-04 cerró el resto**: `lib/booking-core.ts` y `availability` —definición
      y sus **tres** consumidores— deciden con `services.capacity`, `capacityFor()` se borró entera, y
      el booking público manda el `serviceId` que el endpoint necesita. 22/22 en `concurrency.test.ts`
      y **65/65** en las 8 suites de los cuatro consumidores, con A/B contra las versiones viejas de
      los dos archivos. La **cuarta** lectura, `agenda-client.tsx`, es del panel autenticado y queda en
      la **Phase 16** por D-08: drift de visualización, no de reserva. **15-05** agregó los dos casos
      de carrera que lo cierran: el control negativo del cupo por bloque en la hora exacta y N+1
      reservas concurrentes sobre un grupal de cupo N, los dos vistos **FALLAR** contra un mutante que
      restaura la lectura de `time_blocks`.)*

- [x] **CUPO-08** — Cambiar `capacity_mode` en un servicio con **turnos futuros vivos** se rechaza en
      la base con un código de dominio fijo, sin filtrar datos del negocio en el mensaje. Cierra el
      riesgo residual **R-1** de `12-SECURITY.md`: hoy ese cambio deja filas `is_group = true`
      huérfanas, fuera del EXCLUDE gist y fuera del gate espejo ⇒ solapes permanentes que ningún gate
      detecta.
      *(Cerrado en **15-01** (gate en la base) + **15-02** (copy propia del panel) + **15-05** (la
      suite de integración: 7 casos contra Postgres real que asiertan `code` Y `message` Y el estado
      real de la base, con **control negativo** — dropeado el trigger, los 3 casos de rechazo FALLAN).
      En producción se verifica **por instalación, no por comportamiento** (D-09): cero servicios
      simultáneos ⇒ el rechazo no se puede provocar desde la UI. ⚠ El gate vive hoy solo en la base
      **local**: llega a prod cuando se aplique la 068 con `15-RUNBOOK-068.md`.)*

### Correcciones del gate (Phase 16) — migración **070**, `secure-phase` obligatorio

> Las tres viven en el **mismo predicado** y se tocan **una sola vez**. Salieron de la UAT de la
> Phase 15 y del audit de seguridad, después de que el gate estuviera en producción.

- [x] **GATE-01** — El gate de cambio de modo se **estrecha por dirección**. Hoy rechaza cualquier
      cambio con turnos futuros vivos, pero solo algunas direcciones son peligrosas: un turno nace
      `is_group = true` **solo si el servicio no era `individual`**, así que `individual` → grupal /
      simultáneo es seguro (los turnos existentes siguen bajo el EXCLUDE gist y además se cuentan
      contra el cupo nuevo). Bloquear ese sentido obliga al dueño a cancelar turnos sin motivo, y es
      el cambio **más frecuente** porque `individual` es el default. Las direcciones peligrosas
      (hacia `individual`, y grupal ⇄ simultáneo, donde cambia el eje de conteo) **siguen bloqueando**.

- [x] **GATE-02** — Marcar `completed` un turno **futuro** deja de abrir el gate. El
      `NOT IN ('cancelled','completed')` lo saca del `EXISTS`, así que un turno futuro marcado
      completado deja de proteger. Residual **R-15-A** de `15-SECURITY.md`; el cierre es excluir solo
      `'cancelled'`.

- [x] **GATE-03** — Los gates comparan **fecha + hora**, no solo la fecha. Hoy los **dos**
      (`services_block_delete` de la migr. 065 y `services_block_mode_change` de la 068) usan
      `a."date" >= v_today`, así que un turno de **hoy a hora ya pasada** sigue bloqueando hasta
      mañana. Es el **mismo bug** que la Phase 13 arregló en la UI (gap **G4**, resuelto con
      `lib/appointment-time.ts::isPastAppointment`) y que **nunca cruzó al SQL**: por eso la UI muestra
      el turno en "Pasados" mientras la base lo cuenta como futuro. Encontrado por el dueño en la UAT
      de la Phase 15 intentando borrar un servicio.

### Superficie y polish (Phase 17)

- [ ] **CUPO-09** *(reescrito 2026-08-16 al alcance que queda)* — El editor de servicio **explica la
      diferencia entre los dos modos de cupo compartido**: grupal se cuenta **por hora de inicio**
      (todos arrancan juntos), simultáneo **por solape** (entran escalonados). El copy actual mete los
      dos en la misma bolsa —*"Clase grupal y Recurso simultáneo: varios lugares por turno"*— y un
      dueño no tiene con qué elegir; elegir mal significa que alguien se sume a mitad de clase, o que
      se le llene la agenda antes de tiempo. Incluye además los **tres defectos** que la UAT levantó:
      el campo de cupo no se puede editar con el teclado, los toggles del modal quedan desacomodados, y
      el `+` del alta debería ser un **"Guardar"** al final del formulario.
      *(La parte funcional del requisito original —ofrecer los tres modos, el cupo en un solo lugar, el
      piso por modo, el bloqueo por espacio compartido y la copy propia del rechazo del gate— **ya está
      en producción**: la entregaron el guard de 15-02 y el fix de CR-03 en la 069.)*

- [ ] **POLISH-08** — La lista de `/servicios` muestra un **badge de modo**: hoy el modo solo se ve al
      abrir el servicio.

- [ ] **POLISH-09** *(ampliado 2026-08-16)* — La grilla de la agenda **calcula la ocupación desde
      `services.capacity`**, la misma fuente que el motor, y muestra la ocupación **grupal** con el
      mismo tratamiento que ya tiene la simultánea. Hoy `agenda-client.tsx:467` tiene su propio
      `capacityFor()` sobre `time_blocks.capacity` — la **cuarta** lectura, que la Phase 15 dejó a
      propósito para esta fase (D-08). Desde la migr. 068 **esa columna ya no decide nada**, así que la
      grilla del panel está calculando "lleno" con un número que el motor ignora: no se nota hoy porque
      todo vale 1, pero **miente en cuanto se declare una clase de cupo > 1**. No es cosmético.

- [ ] **POLISH-10** — Finanzas en mobile **muestra el servicio**. Hoy lo oculta con `hidden sm:block`;
      es layout, no read-path.

## Fuera de alcance

- **Aviso de re-declaración de cupo en el panel** — descartado por D-02: cero negocios afectados.
- **Dropear `time_blocks.capacity`** — deja de decidir, pero la columna se conserva. Borrarla es una
  migración destructiva sin beneficio en este ciclo.

- **Cupo por profesional** o por sede — el cupo sigue siendo del servicio.
- **Cambiar el eje de conteo de ninguno de los dos modos** — v0.26 los dejó correctos y verificados
  con tests de carrera contra la DB; este milestone solo mueve *dónde vive el número* y *qué se puede
  declarar*.

## Traceability

| Req | Phase | Status |
|-----|-------|--------|
| CUPO-06 | Phase 15 | Complete (15-01 modelo + 15-02 editor: 'Individual' es elegible y es el default de alta) |
| CUPO-07 | Phase 15 | Complete (15-03 motor + 15-04 las tres lecturas JS + 15-05 los dos casos de carrera con A/B contra un mutante que restaura la lectura del bloque; la 4ª —grilla del panel— es Phase 16 por D-08) |
| CUPO-08 | Phase 15 | Complete (15-01 gate + 15-02 copy del panel + 15-05 la suite de integración: 7 casos contra Postgres real, vistos FALLAR con el trigger dropeado). ⚠ El gate está en la base **LOCAL**; llega a prod al aplicar la 068 (`15-RUNBOOK-068.md`) |
| GATE-01 | Phase 16 | Pending — migr. 070 |
| GATE-02 | Phase 16 | Pending — migr. 070 (residual R-15-A de `15-SECURITY.md`) |
| GATE-03 | Phase 16 | Pending — migr. 070, toca los gates de la **065** y la **068** |
| CUPO-09 | Phase 17 | Pending — reescrito al alcance que queda (la parte funcional ya está en prod) |
| POLISH-08 | Phase 17 | Pending |
| POLISH-09 | Phase 17 | Pending — ampliado: la grilla lee la fuente equivocada, no es solo visual |
| POLISH-10 | Phase 17 | Pending |

## Riesgo

**Phase 15 toca el núcleo anti-doble-booking.** `book_slot_atomic` sostiene canchas, abonos, cupos
grupales, multi-staff y espacio compartido a través de sus cuatro consumidores, y lo endurecieron v0.9,
v0.12 y v0.26 (migraciones 062/063/064, con 5 blockers encontrados en dos rondas de code review).
**`secure-phase` es obligatorio** y las garantías de concurrencia se prueban con tests de carrera
contra Postgres de verdad, con control negativo — no con aserciones de lectura de código.

**Próxima migración del proyecto: la 068** (la 067 se aplicó a prod el 2026-08-11).
