---
phase: quick-260827-ion
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - vitest.config.mts
  - test/suite-split.ts
  - test/suite-split.test.ts
  - test/helpers/cleanup.ts
  - test/cleanup-helper.test.ts
  - test/helpers/booking-fixtures.ts
  - test/helpers/supabase-fixtures.ts
  - test/abono-create.test.ts
  - test/abono-cron.test.ts
  - test/abono-generation.test.ts
autonomous: true
requirements: ["ION-01", "ION-02"]

must_haves:
  truths:
    - "`npm test` (vitest run, sin flags) pasa en verde de forma repetida, con el Supabase local arriba."
    - "Los ~31 archivos de test que NO tocan la base siguen corriendo en paralelo (grupo propio, maxWorkers por defecto)."
    - "Los 27 archivos DB-backed corren de a uno, en su propio grupo, nunca contra el pool de PostgREST al mismo tiempo."
    - "Un archivo de test nuevo queda clasificado solo (pure o db) sin que nadie edite una lista a mano."
    - "Un archivo que toca la base pero se olvida del marcador de skip hace fallar un test guard, no reintroduce la interferencia en silencio."
    - "Un delete() de teardown que vuelve con error produce un Error que nombra qué limpieza falló y por qué, en vez de contaminar el test siguiente."
  artifacts:
    - path: "vitest.config.mts"
      provides: "dos proyectos vitest: pure (paralelo) y db (serializado con fileParallelism:false)"
      contains: "projects"
    - path: "test/suite-split.ts"
      provides: "clasificador pure/db anclado al import desde './env' + los dos detectores de agujeros del split"
      contains: "splitSuites"
    - path: "test/suite-split.test.ts"
      provides: "guard puro: split exhaustivo y disjunto, cero suites en subcarpetas, cero suites DB sin marcador"
      contains: "findUnmarkedDbSuites"
    - path: "test/helpers/cleanup.ts"
      provides: "cleanupOrThrow / cleanupAllOrThrow — el teardown falla fuerte y con nombre"
      contains: "cleanupOrThrow"
    - path: "test/cleanup-helper.test.ts"
      provides: "cobertura pura del helper: resuelve sin error, tira con label+motivo, corre TODAS las ops aunque una falle"
      contains: "cleanupAllOrThrow"
  key_links:
    - from: "vitest.config.mts"
      to: "test/suite-split.ts"
      via: "import { splitSuites } — el include de cada proyecto sale del clasificador, no de una lista escrita a mano"
      pattern: "splitSuites"
    - from: "test/suite-split.test.ts"
      to: "test/suite-split.ts"
      via: "el guard consume el MISMO clasificador que el config (una sola fuente de verdad de la regla)"
      pattern: "findUnmarkedDbSuites"
    - from: "test/helpers/booking-fixtures.ts"
      to: "test/helpers/cleanup.ts"
      via: "teardownOneTenant envuelve su delete de businesses con cleanupOrThrow"
      pattern: "cleanupOrThrow"
    - from: "test/abono-generation.test.ts"
      to: "test/helpers/cleanup.ts"
      via: "el afterEach de los 3 deletes pasa por cleanupAllOrThrow"
      pattern: "cleanupAllOrThrow"
---

<objective>
Cerrar la interferencia entre suites de test. Hoy vitest reparte 58 archivos entre ~11 workers y 27
de ellos pegan contra el MISMO Supabase local; el pool de PostgREST (10 conexiones, no configurable
desde el repo) satura, algún `delete()` de teardown se cae, nadie chequea su resultado, y el test
siguiente arranca con datos del anterior → asserts tipo `expected 5, got 10`. Está probado que es
100% inducido por paralelismo: `vitest run --fileParallelism=false` da 1052 passed y cero fallos.

Dos entregables independientes:

- **ION-01 — Separar los proyectos.** `vitest.config.ts` (que en este repo es `vitest.config.mts`)
  pasa a declarar dos `test.projects`: `pure` (paralelo, como hoy) y `db` (serializado). La
  clasificación NO se escribe a mano: se deriva del import desde `test/env.ts`, que ya es convención
  obligatoria del repo para todo test DB-backed. Un guard puro impide que un archivo DB-backed nuevo
  se cuele al carril paralelo.
- **ION-02 — El teardown falla fuerte.** Helper `cleanupOrThrow` / `cleanupAllOrThrow` que tira un
  Error nombrando la limpieza que falló, aplicado a los teardowns compartidos y a los 3 archivos que
  hoy rompen.

Purpose: que `npm test` sin flags sea confiable y siga siendo rápido en su mitad pura, y que una
limpieza caída se manifieste como "cleanup falló: X" en vez de como un assert numérico desconcertante
en otro archivo.
Output: `vitest.config.mts` con 2 proyectos, 2 módulos nuevos en `test/` (clasificador + helper de
cleanup), 2 tests puros nuevos que los cubren, y los teardowns de los 3 archivos rotos + los 2
helpers de fixtures pasados por el helper.

⚠ NO se toca código de producción (`app/`, `lib/`, `supabase/`). NO se agregan dependencias: Vitest
4.1.9 ya trae todo. NO se toca `.planning/workstreams/motor-reservas/phases/19-el-panel/`.
</objective>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/workstreams/motor-reservas/STATE.md
@vitest.config.mts
@vitest.setup.ts
@test/env.ts
@test/helpers/booking-fixtures.ts
@test/helpers/supabase-fixtures.ts

Convenciones del repo que aplican acá (`.claude/CLAUDE.md` + skill `convenciones-forjo`):
- Archivos en kebab-case, named exports, alias `@/*` para imports fuera de `test/`.
- Comentarios DENSOS y en ESPAÑOL explicando el *por qué* de lo no obvio (es el estilo de
  `test/env.ts`, `vitest.setup.ts` y `test/helpers/booking-fixtures.ts`; mantenerlo).
- Prefijo de contexto en mensajes de error/log: `[modulo/accion]`.
- Windows + PowerShell: no asumir sintaxis bash en comandos que queden documentados.
</context>

<hallazgo_previo_a_ejecutar>
**El listado de 29 archivos DB-backed del brief tiene 2 falsos positivos. El set real es 27.**

Verificado en el repo: `grep -l hasSupabaseCreds test/*.test.ts` devuelve 29, pero
`test/appointment-service.test.ts` y `test/appointment-time.test.ts` NO importan `test/env.ts` ni
tocan la base — nombran el token en un comentario en PROSA, justamente para explicar que no lo usan
("...así que estos tests NO van bajo `describe.skipIf(!hasSupabaseCreds)`"). Contar el token suelto
los arrastra al carril serializado sin motivo.

Anclado al import (`grep -lE "from '\./env'" test/*.test.ts`) el set da **27**, y el cruce inverso
también cierra: **cero** archivos importan `./helpers/booking-fixtures`, `./helpers/supabase-fixtures`
o `@supabase/supabase-js` sin importar además desde `'./env'`. O sea: el import desde `'./env'` es una
señal limpia y exhaustiva, y el token suelto NO lo es.

Consecuencia para el plan: la regla de clasificación se ancla al **import**, y el reparto esperado es
**27 db / 31 pure** sobre 58 archivos.
</hallazgo_previo_a_ejecutar>

<decisiones_de_diseño>
**D-01 — Clasificación derivada, no lista a mano.** El brief proponía (a) lista explícita de globs o
(b) convención de subcarpeta. Se elige una tercera que es (a) sin su costo: el config **calcula** las
dos listas leyendo `test/` al cargar. Motivo en una línea: el marcador de DB (`import ... from './env'`)
ya es convención obligatoria y load-bearing del repo — sin las 3 creds un test DB-backed TIENE que
skipear —, así que reusarla como criterio no agrega nada que mantener, mientras que una lista a mano
reintroduce el bug en silencio el día que alguien se olvide de sumar su archivo. Se descarta (b)
(mover 27 archivos a `test/db/`) porque mueve archivos que la fase 19 en vuelo todavía toca.

**D-02 — El guard va igual.** La derivación automática elimina el olvido de "sumar a la lista", pero
no el de "escribir un test DB-backed sin el marcador". Ese caso lo cubre un test puro
(`test/suite-split.test.ts`) que falla nombrando el archivo infractor.

**D-03 — Alcance del helper: SOLO teardown, no los ~60 `delete()` del repo.** Un `delete()` dentro
del cuerpo de un `it(...)` ya está cubierto por los asserts de ESE test: si falla, el test falla ahí,
en su archivo, con su propio mensaje. El de teardown es el único cuya falla es a la vez invisible Y
se filtra al test SIGUIENTE — que es exactamente la cadena causal del bug. Además, tocar los 60 infla
el diff y arrastra archivos vecinos a la fase 19 sin necesidad.

**D-04 — `cleanupAllOrThrow` además del singular.** Necesario para no empeorar el comportamiento
actual: `abono-generation` limpia 3 tablas en su `afterEach`; si cada una tirara al primer error, las
siguientes no correrían y la contaminación sería PEOR que hoy. El plural corre todas en orden, junta
las que fallaron y tira una sola vez nombrándolas.
</decisiones_de_diseño>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Separar los proyectos pure/db en vitest.config.mts, con clasificador derivado y guard (ION-01)</name>
  <files>test/suite-split.ts, test/suite-split.test.ts, vitest.config.mts</files>

  <behavior>
    Guard (`test/suite-split.test.ts`, puro, sin base):
    - `splitSuites()` es EXHAUSTIVO: `db.length + pure.length` == cantidad de `*.test.ts` en `test/`.
    - `splitSuites()` es DISJUNTO: ningún archivo aparece en las dos listas.
    - `findSubdirSuites()` devuelve lista vacía: un `*.test.ts` en una subcarpeta de `test/` sería
      invisible para el split y no correría en NINGÚN proyecto (falso verde silencioso).
    - `findUnmarkedDbSuites()` devuelve lista vacía: ningún archivo que importe los helpers de
      fixtures o `@supabase/supabase-js` puede quedar sin el import de `'./env'`.
    - Anclas de regresión de la trampa del token suelto: `isolation.test.ts` cae en `db`;
      `verticals.test.ts`, `appointment-service.test.ts` y `appointment-time.test.ts` caen en `pure`.
    - Todas las rutas devueltas usan separador POSIX (`test/x.test.ts`), nunca `\` de Windows.
  </behavior>

  <action>
Crear `test/suite-split.ts` — módulo suelto en `test/` (mismo lugar y molde que `test/env.ts`, que ya
es un módulo no-test conviviendo con las suites). Comentarios en español explicando el porqué, como el
resto de `test/`. Named exports:

- `splitSuites(testDir: string): { db: string[]; pure: string[] }` — lista con `readdirSync` NO
  recursivo los archivos que terminan en `.test.ts`, lee cada uno con `readFileSync` y lo manda a `db`
  si contiene un import estático desde `'./env'`; si no, a `pure`. Devuelve globs relativos armados
  por concatenación de strings (`` `test/${archivo}` ``) — NO usar `path.join`, que en Windows produce
  `test\x.test.ts` y picomatch no lo matchea.
- `findSubdirSuites(testDir: string): string[]` — recorre las subcarpetas de `test/` y devuelve los
  `*.test.ts` que encuentre. Hoy da vacío (los 58 archivos son de primer nivel) y esa es la premisa que
  el split necesita.
- `findUnmarkedDbSuites(testDir: string): string[]` — devuelve los archivos que importan
  `'./helpers/booking-fixtures'`, `'./helpers/supabase-fixtures'` o `'@supabase/supabase-js'` pero NO
  importan desde `'./env'`. Hoy da vacío; es la red que impide reintroducir la interferencia.

Anclar TODAS las reglas al **import**, nunca al token suelto: documentar en el módulo la trampa ya
verificada — buscar el nombre del flag a secas da 29 archivos, 2 de ellos falsos positivos que sólo lo
nombran en un comentario en prosa; el set real es 27 (ver `<hallazgo_previo_a_ejecutar>` de este plan).

Crear `test/suite-split.test.ts` con la cobertura del bloque `<behavior>`, importando el MISMO módulo
que usa el config (una sola fuente de verdad de la regla). Resolver el directorio con
`resolve(process.cwd(), 'test')`. Ubicarlo en el primer nivel de `test/`, no en una subcarpeta.

Modificar `vitest.config.mts`:
- Mantener intactos `plugins: [tsconfigPaths(), react()]` y el bloque `test` actual (`environment:
  'node'`, `setupFiles: ['./vitest.setup.ts']`) — y mantener sus comentarios existentes, que explican
  por qué está cada plugin.
- Importar `splitSuites` y calcular las dos listas al cargar el config.
- Agregar `test.projects` con dos entradas inline, ambas con `extends: true` para heredar plugins,
  environment y setupFiles de la raíz:
  - `{ extends: true, test: { name: 'pure', include: pure } }`
  - `{ extends: true, test: { name: 'db', include: db, fileParallelism: false } }`

Documentar en un comentario el mecanismo, ya verificado leyendo el runtime de Vitest 4.1.9 instalado
(no asumirlo de memoria): `fileParallelism: false` resuelve `maxWorkers: 1` para ESE proyecto, y el
agrupador de specs manda las specs de un proyecto con `maxWorkers === 1` + `isolate` en su default +
`sequence.groupOrder` en 0 a un grupo "sequential" propio que se encola AL FINAL; los grupos se
ejecutan uno después del otro. Resultado: primero corre `pure` en paralelo con todos los workers,
después `db` de a un archivo por vez.

Dos trampas a dejar escritas en el mismo comentario:
- NO declarar `isolate` ni `sequence.groupOrder` en los proyectos. Si el proyecto serializado cae en el
  mismo grupo que el paralelo con distinto `maxWorkers`, Vitest aborta con "Projects ... have different
  'maxWorkers' but same 'sequence.groupOrder'".
- `poolOptions` con `singleFork`/`singleThread` NO existe en Vitest 4 (verificado: no aparece ni en los
  tipos ni en el runtime instalado). El único mecanismo válido acá es `fileParallelism` / `maxWorkers`.

PRE-FLIGHT antes de verificar: el Supabase LOCAL tiene que estar arriba (`npx supabase status`; si está
caído, `npx supabase start`) y `.env.test.local` presente. Sin eso los 27 archivos DB SKIPEAN y el verde
no prueba absolutamente nada — por eso el `<verify>` exige "27 passed", no "27".
  </action>

  <verify>
    <automated>./node_modules/.bin/tsc --noEmit</automated>
    <automated>npx vitest run --project=pure test/suite-split.test.ts</automated>
    <automated>npx vitest run --project=db 2>&amp;1 | grep -qE "Test Files.*27 passed"</automated>
    <automated>npx vitest run --project=pure 2>&amp;1 | grep -qE "Test Files.*\(31\)"</automated>
  </verify>

  <done>
    `npx vitest run --project=db` reporta 27 archivos PASSED (no skipped) y los corre de a uno;
    `npx vitest run --project=pure` reporta 31 archivos y usa los workers por defecto; el guard
    `test/suite-split.test.ts` pasa con las 4 invariantes del `<behavior>` más las anclas de regresión;
    `tsc --noEmit` sale 0. `vitest.config.mts` no perdió ninguno de sus comentarios originales.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Helper cleanupOrThrow y aplicación a los teardowns (ION-02)</name>
  <files>test/helpers/cleanup.ts, test/cleanup-helper.test.ts, test/helpers/booking-fixtures.ts, test/helpers/supabase-fixtures.ts, test/abono-create.test.ts, test/abono-cron.test.ts, test/abono-generation.test.ts</files>

  <behavior>
    `test/cleanup-helper.test.ts` (puro, sin base, con thenables falsos):
    - `cleanupOrThrow('borrar turnos', op)` con `op` que resuelve `{ error: null }` → resuelve sin tirar.
    - Con `op` que resuelve `{ error: { message: 'boom', code: '42501' } }` → rechaza, y el mensaje
      contiene el label (`borrar turnos`), el motivo (`boom`) y el prefijo de módulo.
    - `cleanupAllOrThrow` con 3 ops donde la PRIMERA falla → las 3 se ejecutan igual (contador == 3) y
      tira UNA sola vez, nombrando la que falló.
    - `cleanupAllOrThrow` con 3 ops sanas → resuelve, las 3 ejecutadas, en orden de declaración.
  </behavior>

  <action>
Crear `test/helpers/cleanup.ts` (kebab-case, named exports, comentarios en español, mismo estilo que sus
vecinos en `test/helpers/`):

- Tipo local para la operación: un thenable que resuelve `{ error: PostgrestError | null }`
  (`import type { PostgrestError } from '@supabase/supabase-js'`). Esa forma cubre el builder de
  PostgREST tal cual (`admin.from(t).delete().eq(...)`), que es lazy: construirlo no dispara el request,
  se dispara al await — por eso se puede armar el mapa de operaciones primero y ejecutarlo después.
- `cleanupOrThrow(label: string, op: CleanupOp): Promise<void>` — await, y si volvió `error`, tirar un
  Error con prefijo de módulo al estilo del repo, el label y el motivo (mensaje + code cuando exista).
- `cleanupAllOrThrow(ops: Record<string, CleanupOp>): Promise<void>` — recorre las entradas EN ORDEN,
  ejecuta TODAS aunque alguna falle, acumula los labels+motivos fallidos y tira una sola vez al final
  con todos. Ver D-04 en `<decisiones_de_diseño>` para por qué no puede cortar en el primero.

Documentar en la cabecera que esto no inventa un patrón nuevo: es la MISMA regla que ya usan
`purgeAbonos` y todos los `seed*` de `test/helpers/booking-fixtures.ts` (`if (x.error) throw new
Error('...falló: ' + msg)`), extraída para poder aplicarla en una línea en los hooks de limpieza.

Crear `test/cleanup-helper.test.ts` con la cobertura del `<behavior>`. ⚠ Va en el PRIMER NIVEL de
`test/`, no dentro de `test/helpers/`: el clasificador de la Task 1 no mira subcarpetas, así que un test
ahí adentro no correría en ningún proyecto (y el guard de la Task 1 lo haría fallar, que es el punto).

Aplicar el helper — SOLO en hooks de teardown (`afterEach` / `afterAll`) y en los helpers de limpieza
compartidos. NO tocar ningún `.delete()` que esté dentro del cuerpo de un `it(...)` (D-03).

- `test/helpers/booking-fixtures.ts` → `teardownOneTenant`: envolver el `delete()` de `businesses` con
  `cleanupOrThrow`. Mantener el `try/finally` tal como está. NO envolver el
  `auth.admin.deleteUser` del `finally`, y dejar comentado el porqué: un throw dentro de un `finally`
  REEMPLAZA la excepción del `try` y taparía el motivo real de la falla.
- `test/helpers/supabase-fixtures.ts` → `teardown`: los dos `delete()` de `businesses` (A y B) pasan por
  UNA sola llamada a `cleanupAllOrThrow`, para que un fallo en A no se lleve puesta la limpieza de B.
  Mismo criterio con los dos `deleteUser` del `finally`: se dejan como están.
- `test/abono-generation.test.ts`: el `afterEach` (~líneas 99-105, los 3 deletes de `appointments` /
  `schedule_exceptions` de ambos tenants) pasa a una sola llamada a `cleanupAllOrThrow` con un label
  descriptivo por operación, respetando el orden y los filtros por `business_id` exactamente como están.
- `test/abono-create.test.ts` y `test/abono-cron.test.ts`: mismo tratamiento para los `delete()` que
  vivan en sus hooks de teardown. Las llamadas a `purgeAbonos` se dejan intactas: ese helper ya tira con
  mensaje propio en sus tres operaciones.

Labels: descriptivos y en español, que identifiquen tabla + tenant (p. ej. `'appointments del tenant
principal'`), porque el label es lo único que el desarrollador va a leer cuando esto falle.
  </action>

  <verify>
    <automated>./node_modules/.bin/tsc --noEmit</automated>
    <automated>npx vitest run --project=pure test/cleanup-helper.test.ts</automated>
    <automated>npx vitest run --project=db test/abono-create.test.ts test/abono-cron.test.ts test/abono-generation.test.ts 2>&amp;1 | grep -qE "Test Files.*3 passed"</automated>
    <automated>npx eslint vitest.config.mts test/suite-split.ts test/suite-split.test.ts test/helpers/cleanup.ts test/cleanup-helper.test.ts test/helpers/booking-fixtures.ts test/helpers/supabase-fixtures.ts test/abono-create.test.ts test/abono-cron.test.ts test/abono-generation.test.ts</automated>
  </verify>

  <done>
    `cleanupOrThrow` y `cleanupAllOrThrow` existen con named exports en `test/helpers/cleanup.ts` y su
    test puro pasa las 4 aserciones del `<behavior>`; los teardowns de los 2 helpers de fixtures y de los
    3 archivos que fallaban ya no descartan el resultado de sus `delete()`; los 3 archivos pasan; eslint
    acotado a los archivos tocados sale limpio; `tsc --noEmit` sale 0.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (ninguna nueva) | El cambio es 100% infraestructura de test (`test/` + `vitest.config.mts`). No toca `app/`, `lib/`, `supabase/` ni ninguna superficie que reciba input no confiable. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ion-01 | Tampering | `test/suite-split.ts` (lectura de `test/` en tiempo de carga del config) | accept | Sólo lee archivos del propio repo con `readdirSync`/`readFileSync`; no ejecuta nada de lo que lee ni acepta input externo. Riesgo equivalente al de cualquier archivo de config del repo. |
| T-ion-02 | Information Disclosure | `test/helpers/cleanup.ts` (mensajes de error) | mitigate | El mensaje incluye label + `error.message` + `code` de PostgREST. NO incluir jamás el service-role key ni el contenido de las filas: el label lo escribe el desarrollador y describe la tabla, no los datos. |
| T-ion-03 | Repudiation / cobertura de seguridad falsa | `test/isolation.test.ts` (el guard multi-tenant del repo) | mitigate | Ésta es la razón de seguridad REAL del cambio: hoy el flake por paralelismo puede enmascarar (o simular) una regresión de aislamiento RLS. Serializar las 27 suites DB y hacer que el teardown falle fuerte devuelve señal confiable a la única suite que prueba el core value del producto. |
| T-ion-SC | Tampering | instalación de paquetes | mitigate | No aplica: el plan prohíbe explícitamente dependencias nuevas; Vitest 4.1.9 ya trae todo. Si el ejecutor se ve tentado de instalar algo, es señal de que tomó el camino equivocado — parar y reportar. |
</threat_model>

<verification>
PRE-FLIGHT (sin esto, el verde no significa nada):
1. `npx supabase status` → el Supabase local tiene que estar arriba. Si no, `npx supabase start`.
2. `.env.test.local` presente (es el que apunta la suite al Supabase LOCAL en vez del remoto).

Verificación del conjunto:
3. `npm test` → **cero fallos**. Correrlo **3 veces seguidas**; las 3 en verde. Una sola corrida verde
   no distingue "arreglado" de "tuve suerte con el scheduler".
4. Registrar la línea `Duration` de las 3 corridas.
5. Baseline comparativo, UNA vez: `npx vitest run --fileParallelism=false` y registrar su `Duration`.
   El run nuevo tiene que ser MENOR que ese baseline (el grupo `pure` corre en paralelo antes del grupo
   `db`). Si NO lo es, reportarlo tal cual en el SUMMARY en vez de declarar la victoria.
6. Expectativa honesta a dejar escrita en el SUMMARY: los 27 archivos DB serializados dominan el wall
   time. La ganancia es la mitad pura del run, no un 10×. El objetivo primario es que `npm test` sea
   CONFIABLE en paralelo; la velocidad es secundaria.
7. `./node_modules/.bin/tsc --noEmit` → exit 0. ⚠ `npx tsc` es falso verde en este repo: siempre sale 0.
8. eslint SOLO sobre los archivos tocados (ver Task 2). `npm run lint` completo no puede dar exit 0
   (error `react-hooks/purity` preexistente) y se corta por timeout a los 2 min — no usarlo como gate.

Prueba negativa del helper (queda cubierta por `test/cleanup-helper.test.ts`, no hace falta romper nada
a mano): un teardown caído produce un Error que nombra la limpieza y el motivo.
</verification>

<success_criteria>
- `npm test`, sin flags y con el Supabase local arriba, pasa en verde 3 corridas seguidas.
- `npx vitest run --project=db` reporta 27 archivos PASSED y los corre serializados.
- `npx vitest run --project=pure` reporta 31 archivos y corre en paralelo.
- La duración del run nuevo es menor que la de `--fileParallelism=false` (o, si no lo es, está reportado
  con su número en el SUMMARY).
- Agregar una suite DB-backed nueva sin el import de `'./env'` hace fallar `test/suite-split.test.ts`
  nombrando el archivo.
- Un `delete()` de teardown que vuelve con error tira un Error con el label de la limpieza y el motivo.
- `tsc --noEmit` (binario local) sale 0 y eslint acotado sale limpio.
- Cero cambios en `app/`, `lib/`, `supabase/` y en `.planning/workstreams/motor-reservas/phases/19-el-panel/`.
- Cero dependencias nuevas en `package.json` / `package-lock.json`.
</success_criteria>

<output>
Crear `.planning/quick/260827-ion-separar-suites-de-test-paralelas-de-las-/260827-ion-SUMMARY.md` al terminar.

Incluir sí o sí en el SUMMARY:
- El reparto final (27 db / 31 pure) y la corrección al listado del brief (los 2 falsos positivos).
- Las 3 duraciones de `npm test` y la del baseline `--fileParallelism=false`.
- Si quedó algún teardown fallando con el nuevo Error: es señal REAL (ya no es flake de paralelismo),
  documentarlo.

Commits atómicos sugeridos: `test(260827-ion): separar los proyectos vitest pure/db` y
`test(260827-ion): hacer fallar fuerte los teardowns con cleanupOrThrow`.
</output>
