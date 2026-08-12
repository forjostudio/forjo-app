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
- [ ] **CUPO-07** — `services.capacity` es la **única** fuente del número para los tres modos.
      `book_slot_atomic` deja de leer `time_blocks.capacity` para decidir cupo. Cero regresión de los
      cuatro consumidores del RPC (booking público, alta manual, generación forward de abonos, canchas).
- [x] **CUPO-08** — Cambiar `capacity_mode` en un servicio con **turnos futuros vivos** se rechaza en
      la base con un código de dominio fijo, sin filtrar datos del negocio en el mensaje. Cierra el
      riesgo residual **R-1** de `12-SECURITY.md`: hoy ese cambio deja filas `is_group = true`
      huérfanas, fuera del EXCLUDE gist y fuera del gate espejo ⇒ solapes permanentes que ningún gate
      detecta.

### Superficie y polish (Phase 16)

- [ ] **CUPO-09** — El editor de servicio ofrece los **tres** modos y el cupo en un solo lugar, con
      copy que explique la diferencia entre grupal (por hora de inicio) y simultáneo (por solape). El
      cupo se deshabilita en `individual`.
- [ ] **POLISH-08** — La lista de `/servicios` muestra un **badge de modo**: hoy el modo solo se ve al
      abrir el servicio.
- [ ] **POLISH-09** — La ocupación **grupal** se ve en la grilla de la agenda. Hoy solo se ve al abrir
      el turno, mientras que la simultánea sí se muestra — es una inconsistencia, no una regresión.
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
| CUPO-06 | Phase 15 | Complete (15-01) |
| CUPO-07 | Phase 15 | Pending |
| CUPO-08 | Phase 15 | Complete (15-01) — instalado y verificado por comportamiento en local; la copy del panel es 15-02 y la suite de integración 15-05 |
| CUPO-09 | Phase 16 | Pending |
| POLISH-08 | Phase 16 | Pending |
| POLISH-09 | Phase 16 | Pending |
| POLISH-10 | Phase 16 | Pending |

## Riesgo

**Phase 15 toca el núcleo anti-doble-booking.** `book_slot_atomic` sostiene canchas, abonos, cupos
grupales, multi-staff y espacio compartido a través de sus cuatro consumidores, y lo endurecieron v0.9,
v0.12 y v0.26 (migraciones 062/063/064, con 5 blockers encontrados en dos rondas de code review).
**`secure-phase` es obligatorio** y las garantías de concurrencia se prueban con tests de carrera
contra Postgres de verdad, con control negativo — no con aserciones de lectura de código.

**Próxima migración del proyecto: la 068** (la 067 se aplicó a prod el 2026-08-11).
