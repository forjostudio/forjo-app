# Runbook — aplicar la migración 070 a PRODUCCIÓN

**Migración:** `supabase/migrations/070_service_gates_direction_and_time_precision.sql`
**Fase:** 16 — Correcciones del gate (motor-reservas, v0.27) · GATE-01 / GATE-02 / GATE-03
**Última migración aplicada en prod:** **069** (2026-08-16). La próxima del proyecto es la **070**.
**Estado:** 🟡 **NO APLICADA** — la 070 no está en producción. Aplicarla es **decisión del dueño**
(D-08 de `16-CONTEXT.md`). Esta fase deja el archivo y este procedimiento; **no** ejecuta ninguno de
los pasos de abajo contra prod.

> **Qué hace la 070, en una línea.** Redefine los dos gates de servicio —`services_block_delete`
> (migr. 065) y `services_block_mode_change` (migr. 068)— con tres correcciones que viven en el mismo
> `IF EXISTS`: **GATE-01** deja pasar la única dirección segura de cambio de modo (salir de
> `individual`), **GATE-02** hace que un turno futuro marcado `completed` deje de abrir el gate de modo
> (cierra el residual **R-15-A**), y **GATE-03** hace que los dos gates comparen **fecha Y hora** en vez
> de sólo el día.
>
> ⚠ **Actualizado tras el code review de la fase (2026-08-19/20), con el archivo editado EN SITIO — no
> hay una 071.** Dos cambios que este runbook ya refleja: (1) **GATE-03 mide contra el FIN del turno**
> (`date + time + COALESCE(duration_minutes, 30) > ahora AR`), no contra su inicio — con el inicio, un
> turno EN CURSO contaba como pasado y `group_class → individual` soltaba una fila viva con
> `is_group = true` (R-1 reabierto, reproducido); (2) el guard de dirección de **GATE-01 lleva adentro
> el bloque de ABONO ACTIVO**: salir de `individual` es seguro para los turnos que ya existen, no para
> una serie que va a seguir creando. Además la fase **sí toca `.tsx`** (ver §2).

> **Cómo leer este runbook.** Cada paso trae la query **literal**, el **resultado esperado** al lado y
> **qué hacer si no coincide**. No hay pasos "de confianza": si un control no devuelve lo esperado, hay
> un criterio escrito de seguir o **ABORTAR**.
>
> ⚠ **Los `RAISE NOTICE` NO se ven en el SQL Editor de Supabase.** Por eso **todos** los controles de
> acá devuelven **filas**. Si un control tuyo no devuelve filas, no midió nada.
>
> ⚠ **La lección de la 068:** ese runbook *declaraba* el orden de aplicación pero se aplicó **fuera de
> ese orden** y dejó rota la creación de servicios nuevos hasta el deploy siguiente
> (`15-RUNBOOK-068.md`, T-15-32). Acá el orden importa **mucho menos** (§2 explica por qué), y eso está
> escrito a propósito: para que nadie invente una precaución que no aplica ni se saltee la que sí.

---

## 1. Antes de tocar nada — PRE-FLIGHT, con criterio de ABORTO

Correr las tres queries **contra producción**, en el SQL Editor, **antes** de abrir el archivo de la
migración.

### (i) ¿Prod está en el estado que la 070 espera? — verificación **por INSTALACIÓN**

No se pregunta "¿qué migraciones corrí?" (prod no tiene `supabase_migrations.schema_migrations`), se
pregunta **qué hay instalado ahora mismo** en el cuerpo de las dos funciones. `pg_proc.prosrc` es la
fuente de verdad.

```sql
select p.proname,
       position('COALESCE(a."duration_minutes", 30))) > v_now' in p.prosrc) as tiene_corte_por_fin,
       position('a."date" >= v_today' in p.prosrc)                          as tiene_predicado_viejo
  from pg_proc p
 where p.proname in ('services_block_delete', 'services_block_mode_change')
 order by p.proname;
```

| Resultado | Qué significa | Acción |
|---|---|---|
| **2 filas**, las dos con `tiene_corte_por_fin = 0` y `tiene_predicado_viejo > 0` | Prod está en 065 + 068: exactamente el estado que la 070 asume. | **SEGUIR** |
| Alguna fila con `tiene_corte_por_fin > 0` | **La 070 ya está aplicada** (o alguien instaló el cuerpo nuevo a mano). | **NO RE-APLICAR.** El archivo es idempotente (`CREATE OR REPLACE` puro), así que re-aplicarlo no rompería nada — pero re-aplicar **sin saber por qué ya estaba** es cómo se pierde el rastro de qué corrió y cuándo. Averiguar primero; después, si corresponde, seguir. |
| **Menos de 2 filas** | Falta al menos una de las dos funciones: prod **no** está en el estado que este runbook asume. | 🛑 **ABORTAR.** Verificar que estás en el proyecto de producción y que la 065 / la 068 están realmente aplicadas. |
| **Más de 2 filas** | Hay funciones homónimas en otro schema. | 🛑 **ABORTAR.** Acotar por `pronamespace` y entender qué son antes de tocar nada. |

⚠ **`prosrc` incluye los COMENTARIOS del cuerpo.** No es una curiosidad: en 16-01 este mismo criterio
dio un falso negativo porque un comentario del cuerpo **citaba textualmente** el predicado viejo. Si
`tiene_predicado_viejo > 0` te sorprende, mirá el `prosrc` completo antes de concluir nada:
`select prosrc from pg_proc where proname = 'services_block_delete';`

### (ii) ¿A cuántos servicios les cambia algo el día de la aplicación?

```sql
select capacity_mode, capacity, count(*)
  from services
 group by 1,2
 order by 3 desc;
```

| Resultado | Qué significa | Acción |
|---|---|---|
| Sólo filas `individual` (**cero** `group_class` y cero `simultaneous_resource`) | **GATE-01 y GATE-02 no cambian el comportamiento de nadie** el día de la aplicación: los dos sólo se pueden manifestar sobre un servicio que **no** es `individual` (GATE-01 abre justamente la salida desde `individual`, y GATE-02 cambia el conjunto de estados que sólo se evalúa en las direcciones peligrosas). Lo único que cambia de hecho es **GATE-03**. | **SEGUIR y registrarlo** (anotar el conteo exacto). |
| Aparece algún `group_class` o `simultaneous_resource` | Son los **únicos** servicios sobre los que el gate de modo puede llegar a dispararse. | **SEGUIR, pero REGISTRAR id y nombre** de cada uno. Son los que hay que mirar si algo se comporta raro después de aplicar, y son los que hacen que la verificación por comportamiento (§4-d) sea posible en vez de imposible. |
| **0 filas** | La query no midió lo que creías (tabla vacía / proyecto equivocado). | 🛑 **ABORTAR.** Ver (iv). |

### (iii) ¿Cuántos turnos deja de contar GATE-03 en el instante de aplicar?

**No hay criterio de aborto acá: éste es el efecto buscado.** Se mide y se **registra**, porque es la
única forma de explicar después por qué un servicio que ayer no se podía borrar hoy sí.

```sql
select a."status",
       count(*) as turnos_de_hoy_que_ya_terminaron
  from appointments a
 where a."date" = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
   and (a."date" + a."time" + make_interval(mins => COALESCE(a."duration_minutes", 30)))
       <= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')
 group by 1
 order by 2 desc;
```

⚠ El predicado de arriba es el corte REAL de la 070: **el turno terminó**, no "el turno empezó". Un
turno EN CURSO **sigue contando** en los dos gates, así que no aparece acá.

Cómo leerlo:

- Las filas con `status` **distinto de `cancelled`** son las que **el gate de MODO** deja de contar a
  partir de la aplicación.
- Las filas con `status` distinto de `cancelled` **y** distinto de `completed` son las que **el gate de
  BORRADO** deja de contar (los dos predicados divergen a propósito desde la 070 — el porqué está en el
  header del archivo de la migración).
- **Si devuelve 0 filas**: hoy no hay ningún turno de la jornada que ya haya terminado. Es perfectamente
  posible (madrugada, o un día sin agenda) y **no es motivo de aborto**, siempre que (ii) haya
  devuelto números — ver (iv). Registrarlo como "cero, medido a las HH:MM AR".

### (iv) La regla que la Phase 14 dejó escrita con sangre

Una query que devuelve **0 filas** es **indistinguible** de una que no midió lo que creías: tabla
vacía, columna mal nombrada, filtro de más, **proyecto equivocado**. `"Success, no rows"` no prueba
nada por sí solo.

| Situación | Acción |
|---|---|
| (ii) devolvió números **y** (iii) devolvió 0 filas | **SEGUIR.** El cero de (iii) está respaldado: otra query ya demostró que la base y las columnas son las que creés. |
| (i) o (ii) devolvieron **0 filas** / no midieron nada | 🛑 **ABORTAR.** Verificar que estás en el proyecto de **producción** antes de correr una sola línea más. |

---

## 2. Orden de aplicación respecto del deploy

**La regla del repo es: el CÓDIGO primero, la migración después.** Existe porque una migración que
llega antes que su código puede romper una pantalla que hoy funciona — es exactamente lo que pasó con
la 068 (`15-RUNBOOK-068.md`).

**Acá la 070 puede ir SOLA, y el motivo es concreto, no una impresión:**

1. El código que mapea los rechazos de estos dos gates a copy propia **ya está en producción desde
   15-02**. El panel los detecta con `code === 'P0001'` + `message.includes(...)`.
2. La 070 **no agrega, no renombra y no borra ningún código de dominio**:
   `service_has_future_appointments` y `service_mode_has_future_appointments` siguen siendo exactamente
   los mismos strings. El `includes` del panel sigue matcheando.
3. El recorte es **permisivo** en dos de las tres correcciones (GATE-01 y GATE-03: dejan pasar
   escrituras que antes rebotaban) y la tercera —GATE-02— **cierra** un bypass, o sea agrega un rechazo
   que **ya tiene su copy** en el panel desde 15-02, con el mismo código de dominio de siempre.
4. Los rechazos nuevos (GATE-02 y el bloque de abono de GATE-01) reusan **el mismo código de dominio
   de siempre**, así que el panel los mapea aunque el deploy todavía no haya salido.

⚠ **LO QUE SÍ CAMBIÓ RESPECTO DE LA VERSIÓN ORIGINAL DE ESTE RUNBOOK: la fase SÍ toca `.tsx`.** El
code review (CR-02) mostró que el gate de BORRADO tiene un **espejo de lectura en el cliente** —el
pre-check del modal de `settings-client.tsx`, que deshabilita el botón "Eliminar"— y que ese pre-check
comparaba **sólo la fecha**. Sin él, **GATE-03 no llega a ninguna persona**: la base deja borrar y el
modal sigue bloqueando exactamente el caso que la migración vino a arreglar. También cambió la copy
del rechazo del gate de modo (WR-02 + WR-05).

**Los dos órdenes son seguros, y conviene saber qué se ve en cada uno:**

| Orden | Qué pasa en el medio |
|---|---|
| **Migración primero, deploy después** (lo más probable) | El pre-check viejo **bloquea de más**: el modal sigue diciendo "tiene 1 turno reservado" para un turno de hoy ya terminado, aunque la base ya lo dejaría borrar. Es exactamente el comportamiento de hoy en prod, o sea: no se rompe nada, **el arreglo simplemente no se ve todavía**. |
| **Deploy primero, migración después** | El pre-check nuevo **habilita el botón** para un caso que la base (todavía en 069) rechaza: el dueño aprieta Eliminar y le vuelve el toast del gate ("tiene turnos futuros"). Feo pero contenido — el mapeo del error ya existe y no se pierde ni se borra nada. |

⇒ **No hace falta coordinar la 070 con el deploy para que nada se rompa**, pero para que el arreglo se
VEA hacen falta los dos. Recomendado: aplicar la migración y deployar el mismo día, en ese orden.

---

## 3. Aplicación

1. Abrir el **SQL Editor** de Supabase en el proyecto de **producción**.
2. Pegar **el archivo entero** `070_service_gates_direction_and_time_precision.sql`, **de una sola
   vez**. **NO partirlo en pedazos.**

   El archivo trae su **propio `BEGIN;` / `COMMIT;`** (D-05) y el `NOTIFY pgrst, 'reload schema';`
   **después** del `COMMIT`. Partirlo rompe justamente eso. Es la lección literal de la 068, cuya
   atomicidad dependía de **cómo la aplicara el cliente**: `psql -f archivo.sql` sin `-1` manda
   statement por statement en autocommit. Acá la transacción viaja **dentro del archivo**, así que
   cualquier camino sirve **mientras se pegue completo**.
3. ⛔ **NUNCA por `supabase db push`.** Producción **no tiene**
   `supabase_migrations.schema_migrations` y el proyecto **sí está linkeado**: un `db push` no sabe qué
   está aplicado e intentaría **replayar el historial completo desde el baseline**. Las migraciones de
   este proyecto se aplican **a mano y en orden**, sin excepción.
4. El `NOTIFY pgrst, 'reload schema';` es la **última sentencia del archivo** y es **obligatorio** tras
   el DDL — sin él, PostgREST sigue sirviendo el schema cache viejo. Ya está incluido: no hay que
   agregarlo, pero sí verificar que corrió (si se pegó el archivo entero, corrió).
5. El archivo es **re-corrible**: son dos `CREATE OR REPLACE FUNCTION` puros, sin DDL de tablas, sin
   constraints nuevos y **sin tocar los triggers**. Una segunda pasada es un no-op — se probó
   aplicándolo **dos veces seguidas** contra el Postgres local (`16-BASELINE-070.md`).

---

## 4. Verificación post-aplicación — por **INSTALACIÓN**, no por comportamiento

> **Por qué por instalación (mismo criterio D-09 que la 068).** El rechazo del gate de **modo** sólo se
> puede provocar sobre un servicio que **no** es `individual` y que además tiene **turnos futuros
> vivos**. Si el pre-flight (ii) devolvió cero servicios no-`individual`, ese rechazo **no se puede
> provocar desde la UI de producción** — no hay forma de "probarlo funcionando" ahí. El
> **comportamiento** está probado contra el **Postgres local**: el A/B caso por caso de 16-01
> (`16-BASELINE-070.md`) y las dos suites de gate de 16-02
> (`test/capacity-mode-change-gate.test.ts`, 15 pruebas · `test/service-delete-gate.test.ts`, 17
> pruebas — incluyen los casos y el canario que sumó la ronda de fixes del code review),
> con **control negativo**: los cinco casos discriminantes se vieron **fallar** contra el predicado
> viejo instalado a mano. Lo que se verifica acá es que **quedó instalado**.

### (a) Los cuerpos nuevos están en las DOS funciones

Es la **misma query del pre-flight (i)**, y ahora tiene que dar lo contrario:

```sql
select p.proname,
       position('COALESCE(a."duration_minutes", 30))) > v_now' in p.prosrc) as tiene_corte_por_fin,
       position('a."date" >= v_today' in p.prosrc)                          as tiene_predicado_viejo
  from pg_proc p
 where p.proname in ('services_block_delete', 'services_block_mode_change')
 order by p.proname;
```

**Esperado: 2 filas**, las dos con `tiene_corte_por_fin > 0` y `tiene_predicado_viejo = 0`.
**Si alguna sigue con el predicado viejo:** el `CREATE OR REPLACE` de esa función no corrió → ir a §5.
**Si `tiene_corte_por_fin` da 0 pero el predicado viejo también:** quedó instalada la versión
INTERMEDIA de la 070 (la que comparaba contra el INICIO del turno, con `v_now_time`). Comprobalo con
`select position('v_now_time' in prosrc) from pg_proc where proname = 'services_block_delete';` y
volvé a pegar el archivo entero.

### (b) El guard de dirección de GATE-01 y la divergencia de GATE-02 quedaron escritos

```sql
select p.proname,
       position('OLD."capacity_mode" = ''individual''' in p.prosrc) as tiene_guard_de_direccion,
       position('a."status" <> ''cancelled''' in p.prosrc)          as excluye_solo_cancelled,
       position('FROM abonos ab' in p.prosrc)                       as tiene_bloque_abono
  from pg_proc p
 where p.proname = 'services_block_mode_change';
```

**Esperado: 1 fila con los TRES valores > 0.** El primero es **GATE-01** (el guard de dirección), el
segundo es **GATE-02** (el gate de modo pasa a excluir **sólo** `cancelled`) y el tercero es el bloque
de **abono activo** que el code review sumó adentro del guard de dirección (WR-05) — en la 068 ese
bloque **no existe**, así que un 0 ahí significa que quedó instalada una versión vieja o intermedia.
**Si alguno da 0:** ir a §5.

### (c) Los dos triggers siguen enganchados a sus funciones

El `CREATE OR REPLACE` **no toca los triggers** — el archivo no los dropea ni los recrea a propósito.
Pero comprobarlo es la diferencia entre creer y saber:

```sql
select t.tgname, t.tgenabled, p.proname as funcion
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'public.services'::regclass
   and not t.tgisinternal
 order by t.tgname;
```

**Esperado: 2 filas**, las dos con `tgenabled = 'O'` (habilitado):
- `services_block_delete_trg` → `services_block_delete`
- `services_block_mode_change_trg` → `services_block_mode_change`

**Si falta alguna, o apunta a otra función:** el trigger se perdió → ir a §5 y recrearlo desde la
migración que lo declara (065 y 068 respectivamente).

### (d) El único control funcional barato que SÍ se puede hacer en prod

Sólo tiene sentido si querés confirmarlo por comportamiento. En el panel, con un negocio propio:

1. Crear un servicio de prueba → nace **Individual**.
2. Crearle un turno para **mañana**, y con ese turno vivo editarlo a **Clase grupal**.
   → **Tiene que GUARDAR SIN ERROR.** Eso es **GATE-01** funcionando: antes de la 070 rebotaba con
   "tiene turnos futuros". Si sigue rebotando, la 070 no quedó aplicada.
3. Ahora intentar volverlo a **Individual** con ese mismo turno vivo.
   → **Tiene que REBOTAR.** Es la dirección peligrosa, donde vive **R-1**, que la 070 conserva
   **cerrada**. Si dejara pasar, el recorte se pasó de laxo → §5.
4. *(Opcional, control de WR-05.)* Con el servicio de prueba de vuelta en **Individual** y **sin**
   turnos, crearle un **abono activo** y volver a intentar el paso 2.
   → **Tiene que REBOTAR**, aunque no haya ningún turno materializado: es el bloque de abono adentro
   del guard de dirección. Si pasa, la versión instalada es la anterior al code review.
5. *(Opcional, control de GATE-03 por el FIN del turno.)* Crear un turno **de hoy, a una hora que ya
   pasó del todo** (que su duración también haya terminado) y probar **eliminar el servicio**.
   → **Tiene que dejar borrar, y el modal tiene que mostrar el botón "Eliminar" habilitado.** Si la
   base deja pero el modal sigue bloqueado, la migración está aplicada y **el deploy del `.tsx` no**
   (ver §2).
6. Cancelar el turno, dar de baja el abono y borrar el servicio de prueba.

---

## 5. Si algo sale mal — ROLLBACK, por objeto

La 070 es la migración más fácil de revertir de este workstream, y no es casualidad: **no hay DDL de
tablas, ni datos migrados, ni constraints nuevos, ni triggers recreados**. Sólo dos cuerpos de función.

**El rollback es re-aplicar los cuerpos VIEJOS de las DOS funciones, juntas y en una transacción:**

- `services_block_delete` → el cuerpo de la migración **065**
  (`supabase/migrations/065_service_snapshot_and_delete_gate.sql`, el `CREATE OR REPLACE FUNCTION` de
  la sección 6 — **sin** el `DROP TRIGGER` / `CREATE TRIGGER` que vienen después: el trigger no hay que
  tocarlo).
- `services_block_mode_change` → el cuerpo de la migración **068**
  (`supabase/migrations/068_service_capacity_unified_and_mode_gate.sql`, sección 6 — mismo criterio:
  **sólo** la función).

Pegar los dos `CREATE OR REPLACE FUNCTION` (con sus `ALTER FUNCTION ... OWNER TO "postgres";`) entre un
`BEGIN;` y un `COMMIT;` propios, y cerrar con `NOTIFY pgrst, 'reload schema';`. **Nunca `DROP
FUNCTION`**: dropear obliga a recrear el trigger y los grants, y eso sí es riesgo gratis.

Después de **cualquier** rollback, verificar con la query (a) de §4: tiene que volver a dar
`tiene_corte_por_fin = 0` y `tiene_predicado_viejo > 0` en las dos.

### ⚠ Qué se PIERDE al revertir

Revertir no rompe nada, pero devuelve tres problemas conocidos. Que estén escritos acá es el punto:

| Se pierde | Consecuencia concreta |
|---|---|
| **GATE-01** | Vuelve a bloquearse el cambio de modo **más frecuente**: `individual` → grupal / simultáneo con un turno futuro vivo. Y `individual` es el **default** de la tabla, así que es el punto de partida de casi todos los servicios. Es el defecto que el dueño reportó con sus palabras en la UAT de la Phase 15. |
| **GATE-02** | **Se reabre R-15-A** (`15-SECURITY.md`): marcar `completed` un turno **futuro** vuelve a sacarlo del conteo y **abre el gate de modo**. Es un bypass de **un solo click** desde el panel, y por ahí se vuelve a colar el riesgo residual **R-1** de v0.26 (una fila con `is_group` desalineado, fuera del EXCLUDE gist 013 y fuera del gate espejo de la 064). Es lo más caro de la lista. |
| **GATE-03** | Un turno de **hoy que ya terminó** vuelve a trabar el borrado del servicio **y** el cambio de modo hasta la medianoche, mientras la UI lo sigue mostrando en "Pasados". Vuelve la divergencia UI ↔ base del gap **G4** de la Phase 13. |
| **El corte por FIN de turno** | Un turno **EN CURSO** vuelve a contar como pasado: se puede borrar un servicio mientras se está prestando y, peor, `group_class → individual` con una clase en curso vuelve a pasar y suelta una fila viva `is_group = true` — fuera del EXCLUDE gist 013 y del gate espejo de la 064, o sea **R-1 reabierto** (está reproducido: con esa fila, `book_slot_atomic` inserta un turno superpuesto sin un solo error). |
| **El bloque de abono del gate de modo** | Un servicio con **abono activo** vuelve a poder pasar de `individual` a grupal/simultáneo, y las ocurrencias futuras de la serie que no entren en el cupo nuevo se **saltean en silencio** (`lib/abono-generation.ts`). |

⚠ **Revertir a la 065/068 deja el pre-check del modal (ya deployado) diciendo lo contrario que la
base**: habilitaría "Eliminar" para un turno de hoy ya terminado que la base vuelve a rechazar. No es
destructivo (el DELETE rebota con su toast), pero hay que saberlo.

---

## 6. Registro — completar EL DÍA que se aplique

Esta sección nace vacía a propósito. El runbook de la 068 terminó siendo el **registro** de cómo se
aplicó y de qué salió mal, y ése resultó ser su mayor valor. Que éste nazca preparado para eso.

| | |
|---|---|
| **Fecha y hora de aplicación (AR)** | _(a completar)_ |
| **Quién la aplicó** | _(a completar)_ |
| **Camino usado** | _(SQL Editor / `psql -1` — a completar)_ |
| **Pre-flight (i)** — estado instalado antes | _(pegar las 2 filas literales)_ |
| **Pre-flight (ii)** — servicios por modo/cupo | _(pegar las filas; anotar id + nombre de todo lo que no sea `individual`)_ |
| **Pre-flight (iii)** — turnos de hoy que ya terminaron | _(pegar las filas y la hora AR de la medición)_ |
| **Verificación (a)** — cuerpos nuevos instalados | _(pegar las 2 filas)_ |
| **Verificación (b)** — GATE-01 + GATE-02 escritos | _(pegar la fila)_ |
| **Verificación (c)** — triggers enganchados | _(pegar las 2 filas)_ |
| **Verificación (d)** — control funcional en el panel | _(hecho / no aplicable, y por qué)_ |
| **Desvíos** | _(cualquier cosa que no haya coincidido con lo esperado, y qué se hizo)_ |

Después de aplicar, actualizar además:

1. **`STATE.md` del workstream** y la memoria del proyecto: la última migración aplicada en producción
   pasa a ser la **070**, y la próxima del proyecto es la **071**.
2. **`supabase/schema.sql`** ya está espejado (plan 16-01, quirúrgico, 2 hunks). ⛔ El espejado es **a
   mano, NUNCA `supabase db dump`** — el dump reordena el archivo entero y vuelve ilegible cualquier
   diff (decisión del repo desde la Phase 06).
