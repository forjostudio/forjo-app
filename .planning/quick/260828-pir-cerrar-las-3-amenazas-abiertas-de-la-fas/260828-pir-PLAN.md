---
quick_id: 260828-pir
phase: quick-260828-pir
plan: 01
type: execute
wave: 1
depends_on: []
workstream: motor-reservas
files_modified:
  - supabase/migrations/075_time_block_location_same_tenant.sql
  - app/(dashboard)/settings/settings-client.tsx
  - test/settings-delete-precheck-tenant.test.ts
  - .planning/workstreams/motor-reservas/phases/19-el-panel/19-SECURITY.md
autonomous: true
requirements: [T-19-36, T-19-39, T-19-14]
user_setup:
  - service: supabase-produccion
    why: "La migración 075 se aplica a mano al SQL editor de producción, coordinada con el deploy. NO es parte de esta tarea: el plan deja el runbook escrito en la cabecera de la migración."
    dashboard_config:
      - task: "Correr el pre-flight + el archivo 075 COMPLETO de una sola vez"
        location: "Supabase Dashboard → SQL Editor (proyecto de producción)"

must_haves:
  truths:
    - "La base RECHAZA una franja horaria cuyo consultorio pertenece a otro negocio"
    - "Borrar un consultorio deja la franja sin consultorio pero CON su business_id intacto (la franja no se huerfaniza)"
    - "El pre-check de borrado de un servicio NO ofrece la acción destructiva si alguno de los cinco counts no se pudo medir"
    - "Un test permanente prueba que el 5º count del pre-check no ve franjas de otro negocio, y se pone ROJO si se le saca el filtro explícito por business_id"
    - "supabase/migrations/074_save_agenda_blocks.sql queda sin una sola línea de diff"
  artifacts:
    - path: "supabase/migrations/075_time_block_location_same_tenant.sql"
      provides: "UNIQUE (id, business_id) en locations + FK compuesta tb_location_same_tenant con lista de columnas en el ON DELETE"
      contains: "tb_location_same_tenant"
    - path: "test/settings-delete-precheck-tenant.test.ts"
      provides: "Contra-caso cross-tenant del pre-check de borrado (T-19-14), con control positivo y mordida de la capa explícita"
      contains: "hasSupabaseCreds"
  key_links:
    - from: "supabase/migrations/075_time_block_location_same_tenant.sql"
      to: "public.locations"
      via: "constraint locations_id_business_uq — sin este UNIQUE la FK compuesta NO se puede crear"
      pattern: "locations_id_business_uq"
    - from: "test/settings-delete-precheck-tenant.test.ts"
      to: "test/helpers/supabase-fixtures.ts"
      via: "seedTwoTenants() — dos dueños autenticados reales, no un solo negocio"
      pattern: "seedTwoTenants"
    - from: "test/settings-delete-precheck-tenant.test.ts"
      to: "test/env.ts"
      via: "import de hasSupabaseCreds — marcador OBLIGATORIO que la clasifica en el proyecto vitest `db` (serializado)"
      pattern: "from './env'"
---

<objective>
Cerrar las tres deudas abiertas del audit de seguridad de la Phase 19 (`19-SECURITY.md`), sin tocar
la migración 074 (ya corrió en producción) y sin tocar la UAT abierta de la fase:

1. **T-19-36 / WR-04** — migración **075**: `time_blocks.location_id` deja de entrar a la base sin
   validación de pertenencia al tenant.
2. **T-19-39 / WR-07** — el guard fail-closed del pre-check de borrado se extiende a los cinco
   counts, no a uno.
3. **T-19-14** — el contra-caso cross-tenant del 5º count pasa de "cerrado por lectura de código"
   a "cerrado por un test que muerde".

Purpose: las tres son deudas que el audit dejó explícitamente para una decisión del dueño del
milestone. Ninguna es de severidad alta, pero (1) es la única escritura del payload de la 074 que
llega a la base sin ningún control de pertenencia, y (2) es un fail-open en el camino de un borrado.

Output: una migración nueva validada por replay local (PG17), una condición más en un `if` que ya
existe, una suite DB-backed nueva, y las filas de `19-SECURITY.md` actualizadas con la evidencia.
</objective>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/workstreams/motor-reservas/phases/19-el-panel/19-SECURITY.md
@.claude/skills/supabase-multitenant-rls/SKILL.md
@.claude/skills/convenciones-forjo/SKILL.md
@supabase/migrations/073_tenant_integrity_and_default_privs.sql
@supabase/migrations/065_service_snapshot_and_delete_gate.sql
@test/helpers/supabase-fixtures.ts
@test/agenda-save-blocks-rpc.test.ts
</context>

---

## Hechos MEDIDOS durante la planificación (no re-derivar, sí re-verificar)

Todo lo de abajo se midió contra `supabase_db_forjo-app` (Postgres **17.6**, el mismo motor que
producción) el 2026-08-28, dentro de transacciones con `ROLLBACK`. La base quedó sin cambios.

### H-1. El estado de partida coincide con lo que dice el audit

```
time_blocks: time_blocks_location_id_fkey | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL   ← FK SIMPLE
             time_blocks_id_business_uq   | UNIQUE (id, business_id)                                                ← la puso la 073
locations:   locations_pkey               | PRIMARY KEY (id)
             locations_business_id_fkey   | FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
             (NO hay UNIQUE (id, business_id) → la FK compuesta hoy ni se puede crear)
```

### H-2. `time_blocks.business_id` es NULLABLE — la premisa del brief era incorrecta

```
time_blocks.business_id | is_nullable = YES
time_blocks.location_id | is_nullable = YES
locations.business_id   | is_nullable = YES
```

Esto **cambia la naturaleza de la trampa**: el `ON DELETE SET NULL` sobre las dos columnas no falla
con un error de NOT NULL. Falla **en silencio**, que es peor. Ver H-3.

### H-3. LA TRAMPA, medida: el SQL propuesto en `19-SECURITY.md` §4.1 está MAL

Contrafactual corrido con la forma propuesta (`ON DELETE SET NULL` sin lista de columnas):

```sql
ALTER TABLE ONLY public.time_blocks ADD CONSTRAINT tb_location_same_tenant
  FOREIGN KEY (location_id, business_id) REFERENCES public.locations (id, business_id)
  ON DELETE SET NULL;                       -- ← forma propuesta por el audit
-- ...borrar el consultorio de la franja:
DELETE FROM locations WHERE id = '<locA>';
-- resultado medido:
--   business_id_quedo_null | location_quedo_null
--   -----------------------+---------------------
--   t                      | t
```

Borrar un consultorio **huerfaniza la franja**: le pone `business_id = NULL`. Una franja huérfana
sale de la RLS del dueño (que filtra por `business_id`), queda comodín para siempre (RA-02 de la
Phase 18) y el dueño no tiene ninguna pantalla donde verla ni recuperarla. Con `business_id`
NULLABLE **no hay error**: el borrado de consultorios sigue "funcionando" y el daño es invisible.

### H-4. La forma CORRECTA existe en PG17 y hace exactamente lo que hace falta

```sql
ALTER TABLE ONLY public.locations
  ADD CONSTRAINT locations_id_business_uq UNIQUE (id, business_id);
ALTER TABLE ONLY public.time_blocks
  DROP CONSTRAINT time_blocks_location_id_fkey;
ALTER TABLE ONLY public.time_blocks
  ADD CONSTRAINT tb_location_same_tenant
  FOREIGN KEY (location_id, business_id) REFERENCES public.locations (id, business_id)
  ON DELETE SET NULL (location_id);         -- ← lista de columnas: SOLO se nulea el consultorio
```

`pg_get_constraintdef` tras crearla (medido):
`FOREIGN KEY (location_id, business_id) REFERENCES locations(id, business_id) ON DELETE SET NULL (location_id)`

Los cuatro comportamientos, medidos uno por uno:

| # | Caso | Resultado medido |
|---|---|---|
| 1 | Franja de A con consultorio de A | **ACEPTADA** |
| 2 | Franja de A con consultorio de B | **RECHAZADA** — `violates foreign key constraint "tb_location_same_tenant"` |
| 3 | Franja de A con `location_id = NULL` | **ACEPTADA** (MATCH SIMPLE: con un nulo la FK no se evalúa) |
| 4 | `DELETE` del consultorio de A | `location_id → NULL`, **`business_id` INTACTO** |

⚠ Al correr el probe con `psql` sin `ON_ERROR_STOP`, los `\echo` se imprimen igual aunque el
statement anterior haya fallado. La evidencia del caso 2 es la línea `ERROR: ... violates foreign
key constraint`, **no** el `\echo`. No confundirlas.

### H-5. El chequeo de backfill de `19-SECURITY.md` §4.1 también hay que corregirlo

El propuesto (`JOIN locations l ON l.id = tb.location_id WHERE l.business_id <> tb.business_id`)
tiene dos agujeros: `<>` con un `business_id` nulo de cualquiera de los dos lados devuelve NULL (fila
no contada), y el `JOIN` descarta las franjas cuyo `location_id` no existe en `locations`. La forma
que coincide EXACTAMENTE con lo que la FK va a validar es la de `NOT EXISTS` sobre el par, acotada a
las filas donde las dos columnas son no-nulas:

```sql
SELECT count(*) FROM "public"."time_blocks" tb
 WHERE tb."location_id" IS NOT NULL
   AND tb."business_id" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "public"."locations" l
                    WHERE l."id" = tb."location_id" AND l."business_id" = tb."business_id");
```

Medido en local: **0** (sobre 8 franjas). En producción hay que volver a correrlo.

### H-6. El molde de idempotencia ya existe en el repo

`065_service_snapshot_and_delete_gate.sql:110-127` — `DROP CONSTRAINT IF EXISTS` seguido de un
`DO $$ IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=... AND conrelid=...) THEN ALTER
TABLE ... ADD CONSTRAINT ... END IF; END $$;`. La regla de `supabase/migrations/README.md` exige
migraciones idempotentes; la 073 no lo cumplió para sus `ADD CONSTRAINT`. Acá se cumple.

### H-7. El `DROP` + `ADD` NECESITA transacción explícita

Sin `BEGIN;`/`COMMIT;`, cada statement autocommitea: si el `ADD CONSTRAINT` falla (por datos), el
`DROP` de la FK vieja **ya quedó committeado** y la tabla se queda **sin ninguna FK a `locations`**.
Precedente en el repo: `069:115/491` y `070:218/447` envuelven la migración entera. `supabase db
reset` tolera el `BEGIN` anidado (las dos ya se replayean hoy).

### H-8. Bonus gratis: la 075 cierra T-19-32 de paso

La 069 termina con `NOTIFY pgrst, 'reload schema';` **después** del `COMMIT`. Poniendo la misma
línea al final de la 075, aplicarla en producción recarga el schema cache de PostgREST — que es
exactamente el Paso 4 sin confirmar de T-19-32. No es el objetivo de esta tarea, pero sale gratis.

### H-9. Ningún consumidor depende del nombre ni de la forma de la FK vieja

`grep` sobre `app/` + `lib/`: las cuatro lecturas de `time_blocks` usan `select('*')` y **cero**
embeds de PostgREST hacia `locations`. Los dos embeds `locations(name, address)` que existen salen
de `appointments`, cuya FK no se toca. El borrado de consultorios (`settings-client.tsx:1883`) sigue
funcionando: caso 4 de H-4.

### H-10. Dónde corren los tests (define qué NO se puede testear acá)

`vitest.setup.ts` carga `.env.local` y después **pisa** con `.env.test.local` (existe en esta
máquina) → en local la suite pega contra el Supabase **LOCAL**. En CI ese archivo no existe → la
suite pega contra **staging**. Consecuencia dura: **un test que dependa de la 075 se pondría ROJO en
CI** hasta que alguien aplique la migración a staging. Por eso la 075 **no** lleva suite de Vitest
(ver Task 1, decisión D-3).

---

<tasks>

<task type="auto">
  <name>Task 1: Migración 075 — el consultorio deja de entrar sin validación de tenant (T-19-36 / WR-04)</name>
  <files>supabase/migrations/075_time_block_location_same_tenant.sql</files>
  <action>
    Crear el archivo de migración NUEVO. El nombre es exactamente
    `075_time_block_location_same_tenant.sql`: separador **guion bajo** entre el número y el nombre.
    Un guion medio hace que `supabase db reset` saltee el archivo **en silencio** y el build pase
    verde igual — falso positivo conocido de este proyecto.

    PROHIBIDO abrir en modo escritura `supabase/migrations/074_save_agenda_blocks.sql`. Ya corrió en
    producción. Su `git diff` tiene que quedar vacío y es criterio de aceptación.

    Estructura del archivo, en este orden:

    1. **Cabecera en español**, espejando el estilo, el ancho de las barras Unicode y el tono de
       `073_tenant_integrity_and_default_privs.sql` (contexto → qué hace → qué NO hace → qué queda
       como residuo → verificación posterior). Tiene que decir, sin adornos:
       - Que cierra **T-19-36 / WR-04** del `19-SECURITY.md` de la Phase 19.
       - Que la 074 **no se toca** porque ya está aplicada en producción, y que por eso **la
         corrección de alcance de la cabecera de la 074 vive acá**: las FK compuestas de la 073
         cubren la franja y el servicio de `time_block_services`; **no** cubrían el consultorio de
         `time_blocks`. Escribirlo como corrección explícita de una afirmación previa, no como
         novedad.
       - **Por qué la lista de columnas del `ON DELETE` es obligatoria**, con el número medido de
         H-3: sin ella, borrar un consultorio también pone `business_id` en NULL, y como esa columna
         es NULLABLE (H-2) **no hay error** — la franja se huerfaniza en silencio, sale de la RLS del
         dueño y queda comodín para siempre (RA-02). Con la lista, sólo se nulea `location_id`
         (caso 4 de H-4).
       - **El residuo `MATCH SIMPLE`**, dicho tal cual: una franja con `business_id` NULL y
         `location_id` seteado **no** es validada por esta FK. Es el mismo residuo que la 073 ya
         documentó para `time_blocks.business_id` nullable, y refuerza —no contradice— la decisión
         aceptada RA-02. No inventar un chequeo extra para taparlo.
       - **El runbook de producción** (esta tarea NO aplica nada a producción): (a) correr primero
         el pre-flight de H-5 y confirmar que devuelve **0**; (b) pegar y ejecutar el archivo
         **COMPLETO de una sola vez** en el SQL editor —nunca statement por statement— porque el
         `DROP`+`ADD` sin transacción deja la tabla sin FK si el `ADD` falla (H-7); (c) verificación
         posterior con `pg_get_constraintdef` sobre `tb_location_same_tenant` y
         `locations_id_business_uq`; (d) recién **después** de aplicarla, reflejarla
         quirúrgicamente en `supabase/schema.sql` (ver D-2 abajo) y actualizar la ficha de T-19-36.
       - Que el `NOTIFY pgrst` final cierra de paso el Paso 4 sin confirmar de **T-19-32** (H-8).

    2. **`BEGIN;`** (molde 069:115 / 070:218).

    3. **Guard de backfill que ABORTA**, no una consulta previa que se saltea: un bloque `DO $$` con
       una variable `bigint` que cuenta con la forma EXACTA de H-5 (`NOT EXISTS` sobre el par, sólo
       filas con las dos columnas no-nulas) y, si el count es mayor que cero, hace `RAISE EXCEPTION`
       con `ERRCODE = 'P0001'`, incluyendo el número en el mensaje y diciendo qué hacer (revisar esas
       franjas a mano antes de reintentar). Va **antes** del `DROP`. Razón a escribir en el
       comentario: esta migración se aplica a mano y una consulta previa "recordá correr esto" se
       saltea; además el mensaje de dominio es legible, mientras que dejar fallar al `ALTER` da un
       error crudo de Postgres sin el count.

    4. **`locations_id_business_uq`**: `UNIQUE (id, business_id)` sobre `public.locations`, con el
       molde de idempotencia de H-6 (guarda `IF NOT EXISTS` contra `pg_constraint`). Comentario: es
       redundante con la PK en cuanto a unicidad; su única razón de existir es habilitar la FK
       compuesta (Postgres exige un índice único sobre las columnas referenciadas) — misma frase que
       la 073 usó para `services_id_business_uq` / `time_blocks_id_business_uq`.

    5. **El swap de la FK**: `DROP CONSTRAINT IF EXISTS "time_blocks_location_id_fkey"` sobre
       `public.time_blocks`, y después el `ADD CONSTRAINT "tb_location_same_tenant"` con la forma
       medida de H-4 —`FOREIGN KEY (location_id, business_id)` → `locations (id, business_id)` con
       `ON DELETE SET NULL` seguido de la lista de columnas con `location_id`— dentro del guard
       `IF NOT EXISTS` de H-6. El nombre `tb_location_same_tenant` es deliberado: sigue la familia
       `tbs_block_same_tenant` / `tbs_service_same_tenant` de la 073.

    6. **`COMMIT;`** y, después del commit, `NOTIFY pgrst, 'reload schema';` (molde 069, tail).

    Validación local (PG17, `supabase_db_forjo-app` está levantado): `supabase db reset` y después
    los chequeos del bloque `<verify>` más el probe de comportamiento de H-4 corrido de nuevo contra
    la base ya migrada (los cuatro casos). El probe se arma en el scratchpad, se copia al contenedor
    con `docker cp` y se corre con `MSYS_NO_PATHCONV=1 docker exec ... psql -f //tmp/<archivo>` —
    sin `MSYS_NO_PATHCONV` Git Bash traduce la ruta y psql no encuentra el archivo. Correrlo dentro
    de `BEGIN; ... ROLLBACK;` para no ensuciar la base local, y con `-v ON_ERROR_STOP=1` **sacado**
    en el caso 2 (que tiene que fallar) o usando `SAVEPOINT`.

    Decisiones que este plan ya tomó y que NO hay que re-abrir:
    - **D-1 · El guard ABORTA.** Nada de "consulta previa recomendada".
    - **D-2 · `supabase/schema.sql` NO se toca en esta tarea.** Precedente exacto: el plan 19-06
      reflejó la 074 en `schema.sql` **como Task 2, después** de que Task 1 la aplicara a producción
      (19-06-SUMMARY). `schema.sql` es el espejo del estado REAL de producción: reflejar una
      migración que todavía no se aplicó lo convierte en mentira, y el próximo que lea el archivo va
      a creer que la FK compuesta ya existe allá. El reflejo queda como paso (d) del runbook de la
      cabecera, con las líneas destino ya localizadas: `schema.sql:1620` (bloque de constraints de
      `locations`, donde va el UNIQUE nuevo) y `schema.sql:2164` (la línea de
      `time_blocks_location_id_fkey`, que es la que se reemplaza).
    - **D-3 · La 075 NO lleva suite de Vitest.** Por H-10: en CI la suite corre contra staging, donde
      la 075 no va a estar aplicada, así que el test se pondría rojo por una razón ajena al código. Y
      un `skipIf(constraint ausente)` sería exactamente el falso-verde silencioso que este proyecto
      prohíbe. La garantía es DECLARATIVA (la constraint ES la aplicación) y su evidencia es el
      replay + el probe de los cuatro casos, transcrito crudo en el SUMMARY.
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && ls supabase/migrations/075_time_block_location_same_tenant.sql && supabase db reset && MSYS_NO_PATHCONV=1 docker exec supabase_db_forjo-app psql -U postgres -d postgres -tAc "select conname||' :: '||pg_get_constraintdef(oid) from pg_constraint where conname in ('tb_location_same_tenant','locations_id_business_uq','time_blocks_location_id_fkey') order by 1" && git diff --stat -- supabase/migrations/074_save_agenda_blocks.sql && git diff --stat -- supabase/schema.sql</automated>
  </verify>
  <done>
    - `supabase db reset` termina **sin errores** (si la 075 se saltea por un separador equivocado,
      la consulta siguiente no devuelve nada y esto se cae acá).
    - La consulta de `pg_constraint` devuelve **exactamente dos** filas:
      `locations_id_business_uq :: UNIQUE (id, business_id)` y
      `tb_location_same_tenant :: FOREIGN KEY (location_id, business_id) REFERENCES locations(id, business_id) ON DELETE SET NULL (location_id)`.
      La tercera, `time_blocks_location_id_fkey`, **no aparece**: se reemplazó.
    - `git diff --stat -- supabase/migrations/074_save_agenda_blocks.sql` no imprime **nada**.
    - `git diff --stat -- supabase/schema.sql` no imprime **nada** (D-2).
    - El probe de los cuatro casos de H-4 corrido de nuevo contra la base ya migrada reproduce los
      cuatro resultados: acepta mismo tenant, **rechaza** cross-tenant con
      `violates foreign key constraint "tb_location_same_tenant"`, acepta `location_id` nulo, y el
      `DELETE` del consultorio deja `location_id` nulo con `business_id` **no nulo**. Las salidas
      crudas van al SUMMARY, no un resumen de ellas.
    - Correr `supabase db reset` una segunda vez vuelve a terminar sin errores (idempotencia).
  </done>
</task>

<task type="auto">
  <name>Task 2: El guard fail-closed pasa de 1 a 5 counts (T-19-39 / WR-07)</name>
  <files>app/(dashboard)/settings/settings-client.tsx</files>
  <action>
    Antes de tocar nada, correr `./node_modules/.bin/eslint "app/(dashboard)/settings/settings-client.tsx"`
    y **anotar el número de hallazgos**. El archivo arrastra ~11 errores preexistentes fuera del
    rango que se edita; el gate no es "cero hallazgos", es **cero hallazgos NUEVOS**. `npm run lint`
    completo no puede dar exit 0 y se corta a los 2 minutos: no usarlo.

    En el `if` de `:1241-1242` (el guard del pre-check de borrado de servicio) agregar las cuatro
    condiciones que faltan, en la misma forma que la que ya está para `blocks`: que ninguno de los
    counts de `futDias`, `futHoy`, `abo` y `hist` sea nulo. Es **una condición más en el `if` que ya
    existe**, no una rama nueva: no agregar un `if` aparte, no cambiar el `console.error`, no tocar
    `bridgeIncompleto` (que ya cubre su caso), no tocar ninguno de los `?? 0` de abajo (`:1248`,
    `:1255`, `:1259`, `:1260`, `:1261`) — con el guard delante quedan inalcanzables con valor nulo,
    y sacarlos es un cambio de tipos que este plan no pide.

    **Se extiende a los CINCO, no sólo a `abo`.** La justificación va escrita en el comentario que ya
    existe arriba del guard (`:1233-1240`), extendiéndolo, no reemplazándolo:
    - `abo` es el que más pesa: alimenta `activeAbono` (`:1259`), que alimenta `delBlocked`
      (`:1271`). Un count nulo convierte un borrado **bloqueado** en uno **confirmable** — el
      fail-open exacto que P-08 / WR-02 quería evitar.
    - `futDias` alimenta `future` (`:1255`), que también alimenta `delBlocked`: mismo fail-open.
    - `futHoy` es peor de lo que parece: su count nulo no sólo subcuenta, **desactiva el
      fail-closed de paginación** de `:1252-1254` (`countDeHoy > filasDeHoy.length` nunca se cumple
      con `countDeHoy = 0`).
    - `hist` sólo alimenta copy, pero es la misma forma exacta (`count: 'exact'` + `head: true`) y
      cuesta cero.
    - La regla que queda escrita es **uniforme y sin excepciones**: en una respuesta que resolvió
      contra la tabla, `count` SIEMPRE es un número; un nulo sólo puede ser un fallo, y sobre un
      fallo este diálogo no ofrece la acción. Decirlo así, y decir por qué la regla uniforme es
      mejor que el razonamiento caso-por-caso: ese razonamiento **ya falló una vez** —se aplicó a
      1 de 5— y la uniformidad es lo que impide que vuelva a fallar cuando alguien agregue un sexto
      count.

    Escribir el `if` en varias líneas si hace falta para que se lea; el archivo ya lo hace.

    NO se agrega suite nueva para esto: la condición vive inline en un componente cliente de ~2000
    líneas y extraerla a un módulo puro sería un refactor más grande y más riesgoso que el arreglo,
    sobre un camino fail-closed que la fase acaba de tocar. El gate es el grep de las cinco
    condiciones + `tsc` + eslint sin hallazgos nuevos, que es exactamente el mismo gate con el que
    la Phase 19 cerró la condición original.
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && grep -cE '(futDias|futHoy|abo|hist|blocks)\.count === null' "app/(dashboard)/settings/settings-client.tsx" && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint "app/(dashboard)/settings/settings-client.tsx" ; echo "eslint exit=$?"</automated>
  </verify>
  <done>
    - El `grep -cE` devuelve **5**: las cinco condiciones están, y están escritas como comparación
      contra nulo (no como `!x.count`, que trataría un 0 legítimo como fallo y bloquearía el modal
      de todo servicio sin turnos).
    - `./node_modules/.bin/tsc --noEmit` sale **0** (nunca `npx tsc`: siempre sale 0, es falso verde).
    - `eslint` sobre el archivo reporta **el mismo número de hallazgos que antes del cambio**
      (~11 preexistentes). Un hallazgo más = no pasa.
    - `git diff --stat -- "app/(dashboard)/settings/settings-client.tsx"` toca **sólo** el bloque del
      guard y su comentario. Si el diff toca los `?? 0`, `bridgeIncompleto`, `delBlocked` o el JSX,
      revertir eso: está fuera del alcance.
    - `delBlocked` (`:1271`) sigue siendo la misma expresión.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: El contra-caso cross-tenant del 5º count, que MUERDE (T-19-14) + actualizar 19-SECURITY.md</name>
  <files>test/settings-delete-precheck-tenant.test.ts, .planning/workstreams/motor-reservas/phases/19-el-panel/19-SECURITY.md</files>
  <behavior>
    - Caso 1 (control positivo): como dueño A autenticado con anon-key, el count del pre-check sobre
      SU propio servicio mapeado devuelve **1**. Sin este control, un 0 en el caso 2 no prueba nada:
      podría venir de una query rota o de una tabla vacía.
    - Caso 2 (el de producción): como dueño A autenticado con anon-key, el mismo count con el
      `service_id` de B devuelve **0**.
    - Caso 3 (la mordida): con la RLS DESACTIVADA a propósito (service-role), el count con el filtro
      explícito por `business_id` devuelve **0**, y **sin** ese filtro devuelve **1**. Ese par es lo
      único que prueba que el filtro explícito muerde SOLO, sin la RLS atrás.
    - Caso 4: la 6ª query del mismo `Promise.all` (la que trae todas las filas de la puente del
      negocio, sin `service_id`) tampoco devuelve, como A, ninguna fila de B.
  </behavior>
  <action>
    Crear `test/settings-delete-precheck-tenant.test.ts`. **Obligatorio**: `import { hasSupabaseCreds }
    from './env'` — es el marcador que clasifica la suite en el proyecto vitest `db` (serializado).
    Sin él, `test/suite-split.test.ts` caso 4 falla nombrando el archivo, y la suite se colaría al
    carril paralelo saturando el pool de PostgREST.

    Molde a copiar, archivo por archivo: `test/agenda-save-blocks-rpc.test.ts`. Reusar su cabecera de
    disciplina (la trampa de Pitfall 12), su `describe.skipIf(!hasSupabaseCreds)`, sus dos GUARDs
    anti-falso-verde del `beforeAll` (que las dos sesiones anon tengan `access_token`, y que la anon
    key no sea la service-role key), y su `afterAll` con `teardown(seeded)`.

    Sembrado en `beforeAll`, todo con `seeded.admin` (service-role = setup, nunca aserción):
    `seedTwoTenants()`, un servicio activo por negocio, una franja (`time_blocks`) por negocio, y una
    fila de `time_block_services` por negocio mapeando su franja a su servicio. Ojo: las FK compuestas
    `tbs_block_same_tenant` / `tbs_service_same_tenant` de la 073 rechazan cualquier mezcla, así que
    cada fila de la puente tiene que llevar su propio trío coherente.

    Dos helpers, y que la diferencia entre ellos sea LA única variable del experimento:
    - uno que replica **exactamente** la 5ª query del pre-check de `settings-client.tsx:1211-1212`
      (`time_block_services`, `select` de `time_block_id` con `count: 'exact'` y `head: true`,
      `.eq` de `business_id` y `.eq` de `service_id`), parametrizado por cliente;
    - otro idéntico **menos** el `.eq` de `business_id`. Éste es el control negativo: existe para que
      la mordida sea observable sin editar el test.

    Los cuatro casos del bloque `<behavior>`. Reglas de escritura:
    - Los casos 1, 2 y 4 usan **sólo** el cliente anon-key autenticado como A. Nunca el admin.
    - El caso 3 usa `seeded.admin` **a propósito**, y su comentario tiene que decirlo con todas las
      letras, arriba del caso: *no es una aserción de aislamiento* (esas son las de los casos 1, 2 y
      4, con anon+sesión); es la verificación de la **segunda capa aislada** — se desactiva la RLS
      para comprobar que el filtro explícito por `business_id` sostiene la propiedad por sí solo.
      Sin este caso, quitarle el `.eq` de `business_id` a la query dejaría el test en **verde**
      (la RLS taparía el agujero) y el test no probaría nada de lo que dice probar.
    - Escribir, en la cabecera del archivo, el **límite honesto** de esta suite: prueba la propiedad
      a nivel de query (con las dos capas y con cada una aislada); **no** ata la línea de
      `settings-client.tsx`, porque esa query vive inline en un componente cliente. Si alguien borra
      el filtro allá, este test no se entera. Decirlo, no dejarlo implícito.

    **La prueba de mordida hay que EJECUTARLA, no asumirla.** Después de que la suite pase entera:
    quitarle temporalmente el `.eq` de `business_id` al helper principal, correr la suite y confirmar
    que se pone **ROJA** (deben caer los casos 1..3 o al menos el 3), restaurar, y volver a correr
    para confirmar verde. Las dos salidas —la roja y la verde— van transcritas al SUMMARY. Si la
    suite queda verde con el filtro quitado, el test **no sirve** y hay que rediseñarlo antes de
    seguir.

    Después de eso, actualizar `.planning/workstreams/motor-reservas/phases/19-el-panel/19-SECURITY.md`.
    Es el ÚNICO archivo de `phases/19-el-panel/` que se puede tocar: la UAT de la fase sigue abierta
    (2 de 3 tests dependen del deploy) y nada más de ese directorio entra en esta tarea.
    Regla de edición: **no reescribir la prosa del auditor**. Cada fila se deja como está y se le
    APENDE una línea marcada `**Actualización 2026-08-28 (quick 260828-pir):** …`. Qué actualizar:
    - Frontmatter: `threats_closed: 38`, `threats_open: 2`. `status` sigue en `open_threats`.
    - §1 (tabla resumen): cerradas 38/40, abiertas 2/40 → **T-19-32 y T-19-36**.
    - §4.3 (T-19-39): pasa a **CLOSED**, con el archivo:línea del guard nuevo y la nota de que se
      extendió a los cinco counts, no sólo a `abo`.
    - §4.1 (T-19-36): **sigue OPEN**, y hay que decir por qué: el fix está escrito y validado por
      replay en local, pero la propiedad no existe en producción hasta que se aplique la 075. Y —
      esto es lo importante— dejar registrado que **el SQL propuesto en esa misma sección está mal**:
      la forma sin lista de columnas huerfaniza la franja al borrar un consultorio (H-3, con el
      resultado medido), y el chequeo de backfill propuesto tiene los dos agujeros de H-5. Quien
      aplique la migración va a leer esta ficha: si el SQL equivocado queda ahí sin marca, alguien lo
      va a pegar en el SQL editor de producción.
    - §2, fila T-19-14: la evidencia deja de decir "SIN prueba de contra-caso" y pasa a apuntar al
      archivo de test nuevo y a los casos que lo cierran.
    - §6, deuda de verificación #1: marcada como saldada, apuntando al mismo archivo.
    - §7 (veredicto): renumerar las abiertas (quedan 2) y ajustar el punto 3 (T-19-39, hecho).
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && ./node_modules/.bin/vitest run test/settings-delete-precheck-tenant.test.ts && ./node_modules/.bin/tsc --noEmit && npm test && git diff --name-only -- .planning/workstreams/motor-reservas/phases/19-el-panel/ | grep -v "19-SECURITY.md" | wc -l</automated>
  </verify>
  <done>
    - `vitest run test/settings-delete-precheck-tenant.test.ts` pasa con **4 casos**, ninguno
      skipeado. Un `skipped` acá significa que faltan credenciales: no cuenta como verde.
    - **La mordida está EJECUTADA y transcrita en el SUMMARY**: con el filtro por `business_id`
      quitado del helper la suite se pone ROJA; restaurado, vuelve a verde. Sin las dos salidas
      crudas en el SUMMARY, esta tarea no está hecha.
    - `npm test` completo pasa, incluidos los 5 casos de `test/suite-split.test.ts` — el caso 1
      (exhaustividad) y el caso 4 (suites DB-backed sin marcador) confirman que el archivo nuevo
      quedó clasificado en el proyecto `db`.
    - `./node_modules/.bin/tsc --noEmit` sale 0.
    - El último comando devuelve **0**: dentro de `phases/19-el-panel/` no se tocó ningún archivo
      además de `19-SECURITY.md`. La UAT y la VERIFICATION de la fase quedan intactas.
    - `19-SECURITY.md`: el frontmatter dice `threats_closed: 38` / `threats_open: 2`; T-19-39 quedó
      CLOSED; T-19-36 sigue OPEN **con la advertencia de que el SQL de §4.1 está mal** y el puntero a
      la 075; T-19-14 y la deuda #1 de §6 apuntan al archivo de test nuevo. La prosa original del
      auditor sigue ahí: sólo se APENDIERON líneas de actualización fechadas.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dueño autenticado → PostgREST/RPC | Un dueño real, con sesión válida, puede forjar el payload desde la consola del navegador. Los ids de franjas y de servicios de **cualquier** negocio son públicos (`public read time_blocks` con `USING(true)`, `public_services`), así que el ataque cross-tenant es realizable, no teórico. |
| operador → SQL editor de producción | La 075 se aplica a mano. El contenido del archivo y el orden de ejecución son la superficie: un `DROP` committeado sin su `ADD` deja la tabla sin FK. |
| test suite → base (local o staging) | El service-role bypassa RLS. Usarlo en el lugar equivocado produce un verde que no prueba nada. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-Q28-01 | Tampering | `time_blocks.location_id` escrito por `save_agenda_blocks` (074:190/219/236) | mitigate | FK compuesta `tb_location_same_tenant` (Task 1). Declarativa en la base: ningún consumidor tiene que acordarse. Verificada por el caso 2 del probe de H-4 (`violates foreign key constraint`). |
| T-Q28-02 | Denial of Service (auto) | La 075 mal escrita: `ON DELETE SET NULL` sin lista de columnas | mitigate | Forma medida (H-3/H-4) + caso 4 del probe como criterio de aceptación: tras borrar el consultorio, `business_id` tiene que quedar **no nulo**. Sin esa lista, borrar un consultorio huerfaniza la franja **en silencio** (`business_id` es NULLABLE ⇒ no hay error). |
| T-Q28-03 | Tampering (datos preexistentes) | `ALTER TABLE ... ADD CONSTRAINT` sobre filas que ya violan la invariante | mitigate | Guard `DO $$` que **aborta** con `P0001` y el count exacto, antes del `DROP`, con la forma de H-5 (`NOT EXISTS` sobre el par). Local mide 0; producción se mide en el pre-flight del runbook. |
| T-Q28-04 | Repudiation / fail-open | `settings-client.tsx:1241-1242` — counts nulos leídos como 0 | mitigate | Regla uniforme: ningún count puede ser nulo en una respuesta que resolvió. Cinco condiciones en el `if` que ya existe (Task 2). Sin esto, `abo` o `futDias` nulos convierten un borrado **bloqueado** en **confirmable**. |
| T-Q28-05 | Info Disclosure (falso verde) | `test/settings-delete-precheck-tenant.test.ts` | mitigate | Las aserciones de aislamiento (casos 1, 2, 4) van con anon-key **autenticado**; el service-role aparece sólo en el caso 3, marcado como verificación de la segunda capa aislada. Dos GUARDs del `beforeAll` (sesión presente, anon key ≠ service-role key) copiados del molde. La mordida se **ejecuta**, no se asume. |
| T-Q28-06 | Tampering (artefacto ya desplegado) | `supabase/migrations/074_save_agenda_blocks.sql` | mitigate | Gate: `git diff --stat` sobre ese archivo tiene que estar vacío en las tres tareas. La corrección de alcance de su cabecera vive en la cabecera de la **075**. |
| T-Q28-07 | Tampering (estado declarado ≠ estado real) | `supabase/schema.sql` | mitigate | NO se toca hasta que la 075 esté aplicada en producción (D-2, precedente 19-06). Gate: `git diff --stat -- supabase/schema.sql` vacío. Reflejarla antes haría que el archivo afirme una propiedad que producción no tiene. |
| T-Q28-SC | Tampering (supply chain) | `package.json` / `package-lock.json` | mitigate | Cero dependencias nuevas. Gate: `git diff --name-only` no incluye ninguno de los dos. No hay tabla de Package Legitimacy Audit porque no hay ningún install. |
</threat_model>

<verification>
Al cerrar las tres tareas, contra el repo:

1. `./node_modules/.bin/tsc --noEmit` sale **0**. Nunca `npx tsc` (siempre sale 0: falso verde).
2. `npm test` verde de punta a punta, con la suite nueva en el proyecto `db` y los 5 casos de
   `suite-split.test.ts` pasando.
3. `supabase db reset` termina sin errores dos veces seguidas (la 075 es idempotente y el separador
   del nombre es un guion bajo).
4. `git diff --name-only` toca **exactamente**: la migración 075 (nueva), `settings-client.tsx`, el
   test nuevo, `19-SECURITY.md` y los artefactos de `.planning/quick/`. Ni `074_*.sql`, ni
   `schema.sql`, ni ningún otro archivo de `phases/19-el-panel/`, ni `package*.json`.
5. `./node_modules/.bin/eslint "app/(dashboard)/settings/settings-client.tsx"` reporta el mismo
   número de hallazgos que antes de la tarea.

Verificación humana (no automatizable desde el repo, va al SUMMARY como pendiente explícito):

<human-check>
La migración 075 **NO se aplica a producción en esta tarea**. Queda para el operador, con el runbook
en la cabecera del propio archivo: (a) pre-flight de backfill que tiene que devolver 0; (b) pegar y
correr el archivo COMPLETO de una sola vez en el SQL editor; (c) verificar con `pg_get_constraintdef`;
(d) recién ahí reflejarla en `supabase/schema.sql` y pasar T-19-36 a CLOSED. El `NOTIFY pgrst` del
final cierra de paso T-19-32.
</human-check>
</verification>

<success_criteria>
- La base rechaza una franja con el consultorio de otro negocio, y borrar un consultorio ya no
  huerfaniza la franja — las dos cosas medidas contra PG17 local, con la salida cruda en el SUMMARY.
- El pre-check de borrado de servicio no ofrece la acción destructiva ante ningún count no medido.
- Existe un test permanente que prueba la propiedad cross-tenant del 5º count y que se pone rojo si
  se le saca el filtro explícito — verificado ejecutando la mordida.
- `074_save_agenda_blocks.sql` y `supabase/schema.sql` sin una línea de diff.
- `19-SECURITY.md` refleja el estado real: 38/40 cerradas, T-19-32 y T-19-36 abiertas, y el SQL
  equivocado de §4.1 marcado como tal.
</success_criteria>

<output>
Crear `.planning/quick/260828-pir-cerrar-las-3-amenazas-abiertas-de-la-fas/260828-pir-SUMMARY.md` al
terminar, con las salidas CRUDAS (no resumidas) de: el probe de los cuatro casos de la FK, la corrida
roja y la verde de la prueba de mordida, y el conteo de eslint antes/después.
</output>
