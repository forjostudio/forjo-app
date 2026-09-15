---
phase: 22-el-modelo-del-cat-logo
fixed_at: 2026-09-15T21:40:00Z
review_path: .planning/workstreams/motor-reservas/phases/22-el-modelo-del-cat-logo/22-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
migration_pending_prod: supabase/migrations/079_service_categories_name_normalized.sql
---

# Phase 22: Reporte de arreglos del code review

**Arreglado:** 2026-09-15T21:40:00Z
**Review de origen:** `22-REVIEW.md`
**Iteración:** 1
**Alcance:** `critical_warning` → los 7 WARNINGs (WR-01 a WR-07). Los 5 INFO quedaron sin tocar.

**Resumen:**

- Hallazgos en alcance: 7
- Arreglados: 7
- Salteados: 0

## ⚠ Lo que queda pendiente de una acción humana

1. **`supabase/migrations/079_service_categories_name_normalized.sql` NO está aplicada en
   producción.** Es nueva (WR-06) y espera aplicación manual, con su runbook escrito en la cabecera
   del archivo. La 078 no se tocó: está aplicada en prod y es inmutable.
2. **El espejo `supabase/schema.sql` refleja la 079 ANTES de que esté aplicada**, contra la
   convención del repo (espejar recién después de aplicar). Se hizo así porque venía pedido junto
   con el arreglo, y las dos líneas afectadas quedaron marcadas en el propio archivo con
   `(migr. 079 — PENDIENTE de aplicación a producción)`. **Al aplicar la 079 hay que borrar esas dos
   marcas.**
3. **WR-04 es el único arreglo cuyo test no muerde hoy** (ver su sección): conviene mirarlo de nuevo
   cuando aterrice el primer call site real, en la Phase 23.

## Verificación

Todo se midió **en el checkout principal**, no en un worktree: `workflow.use_worktrees` está en
`false` en la config del proyecto, así que se editó y commiteó directo sobre `main`. Las corridas
contra base de datos usaron el **Supabase local** (`supabase db reset` sobre PG17), que es donde vive
el baseline replayable.

| Gate | Resultado |
|------|-----------|
| `npx vitest run` | **92 archivos · 1209 passed · 4 expected fail · 1 skipped**, exit 0. La línea de base era 1198 passed: +11 tests, ninguno perdido. |
| `./node_modules/.bin/tsc --noEmit` | exit 0, cero `error TS`. (No se usó `npx tsc`: en este repo siempre sale 0 y no sirve de evidencia.) |
| `npx supabase db reset` | Replay completo del baseline 001→079 sin un solo `ERROR:`. Corrido dos veces, la última con el archivo ya commiteado. |
| `git diff -- package.json package-lock.json` | Vacío. No se instaló nada. |
| Árbol limpio | Sin cambios sin commitear (salvo un aviso de line-endings en un archivo de `.planning/`, sin diff de contenido). |

**Cada arreglo tiene un test que lo muerde, y se verificó que muerde** — no se asumió: para cada uno
se revirtió temporalmente el fix (o el estado de la base) y se confirmó que el test falla. Los
resultados de esas corridas están en cada sección. La única excepción declarada es WR-04.

## Arreglos aplicados

### WR-01: un precio nulo o vacío se ordenaba como si fuera gratis

**Archivos:** `lib/service-categories.ts`, `test/service-categories.test.ts`
**Commit:** `6ddd141`

Se agregó `precioDe(v)`, que manda `null`, `undefined`, `''` y los strings de sólo espacios a `NaN`
antes de que `porPrecio` los mire. El agujero era de coerción: `Number(null)` y `Number('   ')` dan
**0**, que es finito, así que el guard `Number.isFinite` los dejaba pasar como un precio real de cero
y el servicio roto saltaba al primer lugar de su grupo.

El test nuevo pone el roto **segundo** en la entrada a propósito, así que sólo pasa si el par queda
sin criterio. Medido contra el comparador viejo: `null`, `''` y `'   '` daban `roto,barato` (el roto
adelante); ahora los tres conservan la entrada. `undefined` ya lo atrapaba el guard original.

### WR-02: un `name` nulo tiraba adentro del comparador — 500 en la página pública

**Archivos:** `lib/service-categories.ts`, `test/service-categories.test.ts`
**Commit:** `f6102fc`

`porNombre` normaliza con `typeof a.name === 'string' ? a.name : ''` antes de `localeCompare`.

El detalle que hacía esto peor de lo que parecía está ahora escrito en el código: el crash era
**posicional**. Medido contra el comparador viejo, con el mismo par de filas: en una posición
devolvía `sano,roto` sin quejarse (porque `'Afeitado'.localeCompare(null)` coerciona al string
`"null"`), y en la otra tiraba `Cannot read properties of null`. O sea que la misma fila rota o
rompía la página o se mis-ordenaba en silencio según el orden de llegada.

El test nuevo cubre las **dos posiciones** en los dos ejes (servicio y categoría) y, además de
`.not.toThrow()`, asierta conservación: ninguna de las dos filas se pierde.

### WR-03: una categoría repetida emitía el mismo servicio en dos grupos

**Archivos:** `lib/service-categories.ts`, `test/service-categories.test.ts`
**Commit:** `7cbd429`

Se consume el bucket con `porCategoria.delete(c.id)` antes de armar el grupo, así que una segunda
visita al mismo id no encuentra nada y no produce grupo (la invariante "ningún grupo vacío" sigue en
pie por el mismo camino de siempre).

La aserción `new Set(salida).size === entrada.length` ya existía en Bloque C pero ningún caso le daba
ids repetidos. Se agregó ese caso a la tabla `casos` (ahora son 7, antes 6) y un `it` dedicado.
Medido: comentando el `delete`, **4 tests fallan** (los tres modos de la tabla más el dedicado); con
el `delete`, los 26 del archivo pasan.

La conservación se revisó en su dirección delicada: el fix **no puede descartar** un servicio, sólo
evita emitirlo dos veces. Gana la primera categoría en el orden del eje; la repetida no genera grupo.

### WR-04: el merge de modos no restauraba el default ante un `undefined` explícito

**Archivos:** `lib/service-categories.ts`, `test/service-categories.test.ts`
**Commit:** `9012ab8`

Se reemplazó `{ ...DEFAULT_SORT_MODES, ...modes }` por dos `??` campo por campo. El spread pisa el
default cuando la clave existe con valor `undefined`, y `lib/types.ts` declara las dos columnas como
opcionales, así que el call site natural de las Phases 23/24 manda exactamente eso.

> **⚠ ESTE ES EL ÚNICO ARREGLO CUYO TEST NO MUERDE HOY, Y ESTÁ DECLARADO ASÍ EN EL PROPIO ARCHIVO
> DE TEST.** Con la implementación vieja la salida igual coincidía con `'custom'`, porque los dos
> comparadores caen a `porOrden` al final de su cadena de `if`: "sin modo" y "modo custom" toman el
> mismo camino por casualidad. No hay forma de escribir un test que discrimine sin cambiar un default
> o la forma de los comparadores, que sería meterse con CAT-07. Lo que se agregó es un **candado de
> contrato** (5 casos: `modes` omitido, vacío, las dos claves en `undefined`, y una real + una
> `undefined` en cada eje), con un caso de referencia que verifica que el default realmente da el
> orden manual — para que el bloque no esté comparando dos salidas idénticas por la razón
> equivocada. El día que cambie un default o entre un `switch` exhaustivo, el candado muerde.
>
> **Recomendación:** revisar este punto con ojo humano cuando aterrice el primer call site real
> (Phase 23), que es justo lo que dice IN-05 del review.

### WR-05: el espejo omitía los grants de `service_categories`

**Archivos:** `supabase/schema.sql`
**Commit:** `8bb84a7`

**El fix que proponía el review estaba incompleto, y se corrigió midiendo en vez de aceptarlo.** El
review sugería `GRANT SELECT ... TO "anon"`. El ACL real, leído de `pg_class.relacl` en la base local
con la 078 aplicada, es `anon = rxtm` — o sea SELECT, REFERENCES, TRIGGER y MAINTAIN, no sólo SELECT.

Lo que se escribió en el espejo es lo que emite `pg_dump --schema-only`, copiado tal cual:

```
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."service_categories" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."service_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."service_categories" TO "service_role";
```

Va con un comentario que explica de dónde sale (los `ALTER DEFAULT PRIVILEGES` de la 073), por qué
esta tabla los hereda —se verificó que **ni la 074, ni la 075, ni la 076, ni la 077 crean tablas**, o
sea que `service_categories` es efectivamente la primera después de la 073— y que `MAINTAIN` existe
desde PG17, así que una base PG15/16 imprime el mismo ACL sin ese privilegio. El bloque se ubicó
entre `public_professionals` y `services`, espejando dónde la fase había insertado el `CREATE TABLE`.

**Sin test automatizado, y es deliberado:** el repo no tiene ningún carril que valide `schema.sql`
contra un dump, y inventar esa convención excede el alcance de un fix de review. La verificación fue
el `pg_dump` de arriba, que es la fuente de verdad.

### WR-06: el índice único no normalizaba espacios (migración 079 nueva)

**Archivos:** `supabase/migrations/079_service_categories_name_normalized.sql` (nuevo),
`supabase/schema.sql`, `lib/service-categories.ts`, `test/service-categories-model.test.ts`
**Commit:** `0864949`

**La 078 no se tocó.** Está aplicada en producción, así que el arreglo salió como migración nueva.
Es segura en prod porque `service_categories` está vacía en todos los negocios (D-08, y el propio
runbook de la 078 lo verifica con `count(*) = 0`): recrear un índice único sobre una tabla sin filas
no puede fallar por datos existentes. Eso está escrito en la cabecera de la 079, igual que el runbook
completo y el `(d)` que avisa de la excepción del espejo.

La 079 hace dos cosas:

1. Recrea `service_categories_name_uq` sobre `lower(btrim(name, <blancos>))`.
2. Agrega el CHECK `service_categories_name_not_blank`.

El CHECK se incluyó (el review lo daba por opcional) porque esta columna no es un `name` cualquiera:
es un **encabezado que se le pinta a un visitante anónimo**. Un nombre en blanco deja un título
fantasma arriba de un grupo de servicios. El costo —traducir el 23514 a un error de formulario— lo
paga la Phase 23, que es trabajo que hay que hacer igual.

**Un hueco que encontró el propio test, no el review:** escribí primero `btrim(name)` a secas, tal
como sugería el review, y el caso del tab falló. Medido en la base: `btrim(E'\t') = E'\t'` — `btrim`
sin segundo argumento recorta **sólo el caracter espacio**. Un nombre pegado desde una planilla podía
traer un tab de borde y reabrir el mismo agujero por otra puerta. La versión final usa
`btrim(name, E' \t\n\r')` en el índice **y** en el CHECK.

Verificado contra la base local (los cuatro casos dan el error esperado):

```
'Color' + 'Color '   → 23505  duplicate key ... Key (business_id, lower(btrim(name, ...)))=(...,color)
'Color' + E'Color\t' → 23505
'   '                → 23514  violates check constraint "service_categories_name_not_blank"
E'\t'                → 23514
```

Los dos tests nuevos viven en el carril `db` y muerden: revirtiendo la base al estado pre-079
(índice sobre `lower(name)`, CHECK dropeado) fallan los dos (`expected undefined to be '23505'` y
`'23514'`); con la 079 aplicada pasan. Cubren 5 variantes de espacio/capitalización y 3 de nombre en
blanco.

También se actualizó el JSDoc de `porNombre`, que citaba `lower(name)` como justificación de
`sensitivity: 'base'`.

### WR-07: el test DB-backed dependía del orden de ejecución

**Archivos:** `test/service-categories-model.test.ts`
**Commit:** `3f3231b`

Tres cambios:

- El guard anti-falso-verde (`anonKey === SUPABASE_SERVICE_ROLE_KEY`) pasó a ser la **primera**
  sentencia de `beforeAll`, antes de `seedOneTenant()` y de `createClient`: con el entorno mal
  configurado no hay que dejar fixtures escritos, hay que abortar.
- Se eliminó la variable `categoryId` de alcance de suite. Cada caso siembra lo suyo con los helpers
  nuevos `seedCategoria()` / `asignarCategoria()`, y un `afterEach` borra las categorías del negocio
  — el `ON DELETE SET NULL (category_id)` de la FK compuesta de la 078 devuelve solo los servicios a
  "sin categoría", así que ningún caso hereda una asignación que no hizo él.
- Las aserciones dejaron de mirar totales acumulados: el caso D-03 busca **su** grupo por
  `categoryId` y mide la conservación contra lo que devolvió la vista, no contra un `toHaveLength(2)`
  que se rompía si otro caso había sembrado un servicio.

Medido en las dos direcciones. Con el archivo **viejo**, correr sólo el tercer caso
(`vitest -t 'D-03'`) falla: `expected [ { categoryId: null, …(2) } ] to have a length of 2 but got 1`.
Con el archivo nuevo: los 5 casos pasan juntos, cada uno pasa **solo** con `-t`, y pasa
`--sequence.shuffle` tres corridas seguidas.

## Hallazgos salteados

Ninguno.

---

_Arreglado: 2026-09-15T21:40:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteración: 1_
