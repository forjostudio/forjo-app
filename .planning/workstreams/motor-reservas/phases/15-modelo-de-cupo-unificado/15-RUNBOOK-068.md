# Runbook — aplicar la migración 068 a PRODUCCIÓN

**Migración:** `supabase/migrations/068_service_capacity_unified_and_mode_gate.sql`
**Fase:** 15 — Modelo de cupo unificado (motor-reservas, v0.27) · CUPO-06 / CUPO-07 / CUPO-08
**Última migración aplicada en prod hoy:** **067** (2026-08-11)
**Estado:** ⛔ **la 068 NO está aplicada en producción.** Este documento es el procedimiento; ejecutarlo
es decisión del dueño.

> **Cómo leer este runbook.** Cada paso trae la query **literal**, el **resultado esperado** al lado y
> **qué hacer si no coincide**. No hay pasos "de confianza": si un control no devuelve lo esperado, hay
> un criterio escrito de seguir o abortar.
>
> ⚠ **Los `RAISE NOTICE` NO se ven en el SQL Editor de Supabase.** Por eso **todos** los controles de
> acá devuelven **filas** (o dejan subir el error). Si un control tuyo no devuelve filas, no midió nada.

---

## 1. Antes de tocar nada — PRE-FLIGHT, con criterio de ABORTO

Correr las dos queries **contra producción**, en el SQL Editor, **antes** de abrir el archivo de la
migración.

### (i) ¿Algún negocio tiene el cupo viviendo en el BLOQUE de agenda?

```sql
select count(*) as bloques,
       count(*) filter (where capacity is null) as sin_capacity,
       max(capacity) as cupo_max
  from time_blocks;
```

| Resultado | Qué significa | Acción |
|---|---|---|
| `cupo_max = 1` | Ningún negocio usa cupo por bloque. El cutover es **byte-idéntico** para el 100 % de los datos. | **SEGUIR** |
| `cupo_max > 1` | Existe un negocio cuyo cupo grupal vive en el **bloque**. La 068 hace que el motor lea `services.capacity`, que en ese negocio está en 1 ⇒ **le bajaría el cupo de hecho**. | 🛑 **ABORTAR.** Primero re-declarar ese cupo en el **servicio** (`services.capacity`), y recién después volver a este runbook. |
| `bloques = 0` | La query no midió lo que creías (tabla vacía / entorno equivocado). | 🛑 **ABORTAR.** Verificar que estás en el proyecto de producción. |

**Última medición (2026-08-11, producción):** `19 bloques · 0 sin capacity · cupo_max 1` ⇒ premisa
**D-02** válida a esa fecha. **Volver a medirla el día que se aplique**: la premisa es de una fecha, no
una constante.

### (ii) ¿Cómo está declarado hoy el cupo de los servicios?

```sql
select capacity_mode, capacity, count(*)
  from services
 group by 1,2
 order by 3 desc;
```

| Resultado | Acción |
|---|---|
| `group_class · 1 · 9` (única fila, **cero** `simultaneous_resource`) | **SEGUIR.** Es el estado medido el 2026-08-12; el backfill los pasa a `individual` sin cambiar comportamiento. |
| Aparece un `group_class` con **cupo >= 2** | **SEGUIR, pero REGISTRARLO** (anotar id y nombre del servicio). El backfill **no lo toca** — así está escrito el predicado, a propósito —, pero a partir de la 068 ese servicio pasa a contar su cupo desde `services.capacity` en vez de desde el bloque. |
| Aparece algún `simultaneous_resource` | **SEGUIR, pero REGISTRARLO.** Cambia la premisa de **D-09**: con un simultáneo vivo, el gate de CUPO-08 **sí** se podría provocar desde la UI. |

### (iii) ¿Hay alguna fila que el CHECK nuevo NO admitiría? *(agregado por el code-review — WR-02)*

El control que **realmente prueba que la migración no va a abortar**. El backfill del paso 2 normaliza
sólo `group_class` con cupo <= 1; un **`simultaneous_resource` con cupo 1** era una configuración legal
y explícitamente testeada antes de esta fase (`test/concurrency.test.ts` la documenta), y el
`ADD CONSTRAINT` del paso 4 **valida las filas existentes**: si existiera una sola, la migración
**aborta entera**. Es el mismo modo de falla al que el header del archivo le dedica seis líneas para el
caso grupal, y el que rompe de verdad no estaba nombrado en ningún lado.

```sql
select capacity_mode, capacity, count(*) as filas
  from services
 where capacity_mode <> 'individual'
   and capacity <= 1
 group by 1,2;
```

| Resultado | Acción |
|---|---|
| **0 filas** *(y la query (ii) devolvió números)* | **SEGUIR.** No hay ninguna fila que el CHECK de coherencia rechace. ⚠ Este es el único control del runbook que prueba algo devolviendo cero filas, y **sólo vale si (ii) ya devolvió números**: es (ii) el que demuestra que la tabla y las columnas son las que creés. |
| Aparece `group_class · 1` | **SEGUIR.** Esas son las que el backfill del paso 2 normaliza a `individual`. |
| Aparece **`simultaneous_resource · 1`** | 🛑 **ABORTAR.** El backfill **no** la toca y el `ADD CONSTRAINT` del paso 4 va a rechazarla ⇒ la migración aborta entera (falla cerrado, no corrompe nada, pero no sirve de nada correrla). Normalizar primero a mano: `update services set capacity_mode='individual' where capacity_mode='simultaneous_resource' and capacity <= 1;` — un simultáneo de un solo lugar es indistinguible de un individual, que es justo la ambigüedad que esta fase elimina. Después, volver a este runbook. |

**Medición del 2026-08-11 (producción):** cero servicios en modo simultáneo (D-04) ⇒ el caso no se dio.
El hueco queda escrito igual porque **reaparece en cualquier replay** sobre una base que no sea la de
prod (staging, un dump viejo, un tenant importado).

### Por qué los controles se escriben así y NO con `where capacity > 1`

Una query que devuelve **0 filas** es **indistinguible** de una que no midió lo que creías: tabla
vacía, columna mal nombrada, filtro de más, proyecto equivocado. `"Success, no rows"` no prueba nada.
Los dos controles de arriba devuelven **números distintos de cero** y por eso sí prueban algo. Es la
misma trampa que la Phase 14 registró con los `DELETE` que salen "Success" sin que el trigger llegue a
correr.

---

## 2. Aplicación

### Orden respecto del deploy: **el CÓDIGO primero, la migración inmediatamente después**

El editor de servicios **viejo** (el que hay hoy en prod) fuerza `capacity = 1` para todo lo que no sea
simultáneo. Desde la 068 un `group_class` con cupo 1 es **ilegal** (`23514`), así que **si la migración
llegara antes que el deploy, elegir "Clase grupal" en el panel rebotaría** contra el constraint: una
pantalla que hoy funciona quedaría rota. El guard mínimo que lo arregla es **D-10** y está en el código
(plan 15-02) — **tiene que estar en prod antes de la migración**.

**Ventana intermedia (código nuevo + base vieja) y su mitigación.** Entre el deploy y la migración, el
editor nuevo puede escribir `group_class` con cupo 2, pero el motor viejo (064) sigue resolviendo el
cupo grupal desde el **bloque** (que vale 1) ⇒ el negocio declararía cupo 2 y el motor daría 1. Es una
inconsistencia **transitoria y no destructiva** (sub-oferta: el turno se rechaza, nunca se sobre-vende).
Mitigación: **aplicar la 068 en la misma ventana de mantenimiento que el deploy**, y no declarar
ninguna clase grupal nueva hasta que esté aplicada.

### Cómo se aplica

1. Abrir el **SQL Editor** de Supabase en el proyecto de **producción**.
2. Pegar **el archivo entero** `068_service_capacity_unified_and_mode_gate.sql`, **de una sola vez**,
   en **una sola** sesión/transacción. **NO partirlo en pedazos**: el orden interno es obligatorio
   (**D-05** — el backfill del paso 2 va **antes** del CHECK del paso 4, o el `ADD CONSTRAINT` valida
   las 9 filas viejas y **aborta la migración entera**).

   > ⚠ **La atomicidad depende del CLIENTE, no del archivo** *(corregido por el code-review — WR-01)*.
   > El archivo **no tiene `BEGIN;`/`COMMIT;`**. El SQL Editor de Supabase manda el script como un
   > batch y lo envuelve en una transacción implícita ⇒ por ahí la garantía se cumple. **`psql -f
   > archivo.sql` sin `-1` NO**: manda statement por statement en autocommit, y un fallo en el paso 3
   > o 4 dejaría la tabla **sin ningún CHECK de enum** (el paso 1 ya lo dropeó), aceptando cualquier
   > string en `capacity_mode` **en silencio**. Por eso el camino es **SQL Editor**, o —si se aplica
   > por consola— **`psql -1 --set=ON_ERROR_STOP=1 -f archivo.sql`**, nunca `psql -f` pelado.
   > La **069** ya no tiene esta ambigüedad: abre su propia transacción explícita.
3. ⛔ **NUNCA por `supabase db push`.** Producción **no tiene** `supabase_migrations.schema_migrations`:
   un `db push` no sabe qué está aplicado y puede intentar replayar el historial completo. Las
   migraciones de este proyecto se aplican **a mano y en orden**, sin excepción.
4. El `NOTIFY pgrst, 'reload schema';` es la **última sentencia del archivo** y es **obligatorio** tras
   el DDL — sin él, PostgREST sigue sirviendo el schema cache viejo. Ya está incluido: no hay que
   agregarlo, pero sí **verificar que corrió** (si se pegó el archivo entero, corrió).
5. El archivo es **re-corrible**: `DROP CONSTRAINT IF EXISTS`, guards por `pg_constraint`, backfill por
   predicado y `DROP TRIGGER IF EXISTS`. Una segunda pasada es no-op.

---

## 3. Verificación post-aplicación — por **INSTALACIÓN**, no por comportamiento (D-09)

> **No perder tiempo intentando provocar el rechazo de CUPO-08 en producción.** Hay **cero** servicios
> en modo simultáneo y el gate solo dispara con **turnos futuros vivos**, así que el rechazo **no se
> puede provocar desde la UI**. Misma situación que el gate de la 067. El **comportamiento** está
> probado contra el Postgres local en `test/capacity-mode-change-gate.test.ts` (7 casos, con control
> negativo). Lo que se verifica acá es que **quedó instalado**.

### (a) Los dos CHECK existen sobre `services`

```sql
select conname, pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where conrelid = 'public.services'::regclass
   and conname in ('services_capacity_mode_chk', 'services_capacity_matches_mode_chk')
 order by conname;
```

**Esperado: 2 filas.**
- `services_capacity_mode_chk` → `CHECK (capacity_mode = ANY (ARRAY['individual', 'group_class', 'simultaneous_resource']))` — **tres** valores, no dos.
- `services_capacity_matches_mode_chk` → la disyunción `(individual AND capacity = 1) OR (group_class|simultaneous_resource AND capacity >= 2)`.

**Si devuelve 1 fila o 0:** la migración no corrió entera → ir a §4.

### (b) El DEFAULT de la columna del modo es el individual

```sql
select column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'services'
   and column_name = 'capacity_mode';
```

**Esperado: `'individual'::text`.** Si sigue en `'group_class'::text`, el paso 5 no corrió.

### (c) El trigger nuevo existe sobre `services`

```sql
select tgname, tgenabled
  from pg_trigger
 where tgrelid = 'public.services'::regclass
   and not tgisinternal
 order by tgname;
```

**Esperado: 2 filas** — `services_block_delete_trg` (migr. 065, ya estaba) y
`services_block_mode_change_trg` (068), las dos con `tgenabled = 'O'` (habilitado).

### (d) Los cuerpos de las funciones dicen lo que tienen que decir

```sql
select position('service_mode_has_future_appointments' in prosrc) > 0
         as gate_tiene_el_codigo_de_dominio
  from pg_proc
 where proname = 'services_block_mode_change';
```

**Esperado: 1 fila con `t`.** Si devuelve **0 filas**, la función ni siquiera se creó.

```sql
select position('MAX(tb.capacity)' in prosrc) > 0
         as book_slot_atomic_sigue_leyendo_el_bloque
  from pg_proc
 where proname = 'book_slot_atomic';
```

**Esperado: 1 fila con `f`.** Si sale **`t`**, el `CREATE OR REPLACE` del paso 7 **no** reemplazó la
función y el motor sigue resolviendo el cupo desde `time_blocks` — o sea, CUPO-07 **no** quedó
aplicado. Ir a §4.

### (e) Los datos quedaron coherentes

```sql
select capacity_mode, capacity, count(*)
  from services
 group by 1,2
 order by 3 desc;
```

**Esperado: `individual · 1 · 9`** (más lo que hayas registrado en el pre-flight (ii)).

```sql
select count(*) as filas_incoherentes
  from services
 where not (
        (capacity_mode = 'individual' and capacity = 1)
     or (capacity_mode in ('group_class', 'simultaneous_resource') and capacity >= 2)
       );
```

**Esperado: 1 fila con `0`.** (Devuelve una fila con el número **aunque sea 0** — a diferencia de un
`select ... where`, que no distinguiría "no hay incoherentes" de "no midió".) Si el CHECK existe, esto
es redundante por construcción: es exactamente el punto — **confirma que el CHECK está haciendo su
trabajo**.

### (f) El único control funcional barato que SÍ se puede hacer en prod

En el panel, con un negocio propio:

1. Crear un servicio de prueba → nace **Individual**, guarda sin error.
2. Editarlo a **Clase grupal** (sin turnos asociados) → el cupo salta a 2 y **guarda sin error**.
   Si rebota con `23514`, el guard **D-10** del editor no está deployado (§2, orden del deploy).
3. Borrarlo.

Lo que **no** se puede verificar así es el **rechazo** del gate: haría falta un servicio con turnos
futuros vivos **y** cambiarle el modo, y hoy ningún servicio de prod está en una configuración donde el
dueño quiera hacerlo. Eso es D-09.

---

## 4. Si algo sale mal

**Si se aplicó por el camino de §2** (SQL Editor, o `psql -1`), la migración corre en una sola
transacción: si **aborta**, no queda nada aplicado y no hay que revertir nada — se corrige la causa y se
vuelve a correr entera.

> ⚠ *(corregido por el code-review — WR-01)* Esa garantía **no la da el archivo**: la 068 no abre
> transacción explícita. Si se hubiera aplicado con `psql -f` pelado (autocommit) y hubiera abortado en
> el paso 3 o 4, la tabla habría quedado **sin ningún CHECK de enum** —el paso 1 lo dropea primero— y
> aceptaría cualquier string en `capacity_mode` sin avisar. **Control para saber en qué estado quedó:**
> `select conname from pg_constraint where conrelid='public.services'::regclass and conname like 'services_capacity%';`
> — tiene que devolver **2 filas**; con 0 o 1, re-correr el archivo entero por el camino transaccional.

Si **corrió** y hay que dar marcha atrás, cada objeto se revierte por separado:

| Objeto | Cómo se revierte |
|---|---|
| `book_slot_atomic` | **Re-aplicar el cuerpo de la migr. 064** con `CREATE OR REPLACE`, **sin `DROP FUNCTION`**. Dropearla obliga a recrear grants y rompe los **cuatro** callers (booking público, alta manual, abonos, canchas). |
| Trigger del gate | `DROP TRIGGER IF EXISTS "services_block_mode_change_trg" ON "public"."services";` (y, si se quiere limpiar, `DROP FUNCTION IF EXISTS "public"."services_block_mode_change"();` **después** del trigger). |
| CHECK de coherencia | `ALTER TABLE "public"."services" DROP CONSTRAINT IF EXISTS "services_capacity_matches_mode_chk";` |
| CHECK del enum | ⚠ **Ojo con el orden.** Volver al enum de **dos** valores exige que **no quede ninguna fila `'individual'`**, o el `ADD CONSTRAINT` aborta. O sea: revertir el enum obliga a revertir **antes** el backfill (`update services set capacity_mode='group_class' where capacity_mode='individual' and capacity <= 1`). En la práctica **no hace falta**: el enum de tres valores es un superconjunto del de dos y no rompe nada si se queda. |
| DEFAULT de la columna | `ALTER TABLE "public"."services" ALTER COLUMN "capacity_mode" SET DEFAULT 'group_class';` |
| **Backfill** | **NO se revierte automáticamente, y no hace falta.** Lo único que se "pierde" es la **etiqueta**: esos 9 servicios volverían a decir "clase grupal". El **comportamiento con cupo 1 es idéntico en los dos modos** (`is_group = false`, misma cobertura del EXCLUDE gist 013). **El rollback no pierde datos ni rompe ninguna reserva.** |

Después de **cualquier** rollback: `NOTIFY pgrst, 'reload schema';`

---

## 5. Después de aplicar

1. **Notas del proyecto:** la última migración aplicada en producción pasa a ser la **068**, y la
   **próxima migración del proyecto es la 069**. Actualizar `STATE.md` del workstream y la memoria del
   proyecto (`infra-testing-roadmap` / `v024-abonos-shipped`), que hoy dicen 067.
2. **Espejar `supabase/schema.sql`:** ya está hecho (plan 15-01) — el archivo trae la función
   `services_block_mode_change`, el trigger, los dos CHECK y el `DEFAULT 'individual'`. Verificar que no
   haya drift comparando esos cinco puntos contra la base.
   ⛔ El espejado es **quirúrgico y a mano, NUNCA `supabase db dump`**: el dump reordena el archivo
   entero y vuelve ilegible cualquier diff (decisión del repo desde la Phase 06).
3. **Anotar la fecha de aplicación** y el resultado del pre-flight (i)/(ii) del día, en el SUMMARY de la
   fase o en las notas del proyecto. Es la evidencia de que el criterio de aborto se evaluó de verdad
   (T-15-29).
