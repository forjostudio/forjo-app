# Phase 18: El modelo y la disponibilidad — Pattern Map

**Mapeado:** 2026-08-24
**Milestone:** v0.28 La agenda por servicio · Workstream `motor-reservas`
**Requisitos:** AGENDA-01…04 (ver `18-CONTEXT.md`, D-01…D-06)

## File Classification

| Archivo nuevo/modificado | Rol | Data flow | Analog más cercano | Match |
|---|---|---|---|---|
| `supabase/migrations/071_*.sql` (tabla puente `time_block_services`) | migration | CRUD | `supabase/migrations/057_professional_services.sql` | role-match (con divergencia obligada, ver abajo) |
| `supabase/migrations/071_*.sql` (vista `public_time_block_services`) — puede ir en la misma migración o en una `072` separada, a discreción | migration/view | request-response | `supabase/migrations/059_public_professional_services.sql` | exacto |
| `lib/time-block-services.ts` (nombre a discreción) | utility (helper puro) | transform | `lib/staff-services.ts` | exacto |
| `test/time-block-services.test.ts` | test | — | `test/staff-services.test.ts` | exacto |
| `app/api/booking/availability/route.ts` (modificado) | route (GET) | request-response | el propio archivo, sección `time_blocks` (líneas 94-110) | ya es el archivo, se extiende |
| `lib/booking-core.ts` (modificado) | service | CRUD | el propio archivo, `createAppointmentCore` (línea 93 en adelante) | ya es el archivo, se extiende — **con trampa grande, ver D-04 abajo** |

## Pattern Assignments

### 1. `supabase/migrations/071_*.sql` — tabla puente `time_block_services`

**Analog:** `supabase/migrations/057_professional_services.sql` (íntegro, 47 líneas)

**Copiar tal cual:**
- Cabecera con el mismo formato: contexto → qué hace (enumerado) → qué NO hace (invariantes) → nota de aplicación a mano + `NOTIFY pgrst, 'reload schema'` + regenerar `schema.sql`.
- Tres FKs con `ON DELETE CASCADE`.
- PK compuesta sobre el par (aquí: `(time_block_id, service_id)`).
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` en la MISMA migración.
- **4 policies por operación**, predicado de tenant idéntico (`business_id IN (SELECT businesses.id FROM businesses WHERE businesses.owner_id = (SELECT auth.uid()))`):
  - select: `FOR SELECT USING (...)`
  - insert: `FOR INSERT WITH CHECK (...)`
  - update: `FOR UPDATE USING (...) WITH CHECK (...)` — **ambas cláusulas**, no solo una.
  - delete: `FOR DELETE USING (...)`
- `DROP POLICY IF EXISTS` antes de cada `CREATE POLICY` (idempotencia del baseline).
- Índice inverso (`time_block_services_by_service` sobre `(service_id, time_block_id)`), espejo del `professional_services_by_service` de 057 — necesario para "qué franjas cubren el servicio X" en Phase 19/20.
- `CREATE TABLE IF NOT EXISTS` (idempotente, igual que 057).

**⚠ Dónde se rompe el molde — `business_id` NULLABLE (verificado en local):**

```
time_blocks.business_id | uuid | Nullable: (sin "not null")
```

Confirmado contra el Postgres local (`\d public.time_blocks`): `business_id` es la ÚNICA columna
nullable de esa tabla, y su policy de tenant hoy es `business_id IN (SELECT ...)` — que con
`business_id IS NULL` simplemente no matchea ninguna fila (ni siquiera necesita un `IS NOT NULL`
explícito: `NULL IN (...)` evalúa a `NULL`, que `WHERE`/`USING` tratan como falso). En
`professional_services` esto no puede pasar: las tres FK son `NOT NULL`.

Implicaciones concretas para el plan, a decidir explícitamente (no hay default seguro a copiar):

1. **La FK a `time_blocks` en la puente nueva no puede exigir lo que `time_blocks` no garantiza.**
   La FK en sí (`time_block_id uuid NOT NULL REFERENCES time_blocks(id) ON DELETE CASCADE`) sigue
   siendo válida — apunta a la fila, no a su `business_id`. El problema es el **`business_id`
   desnormalizado en la fila de la puente**: si se copia literal de 057 (`business_id NOT NULL`),
   ¿de dónde sale ese valor cuando el `time_block` padre tiene `business_id NULL`? Dos caminos,
   ninguno gratis:
   - (a) la puente hereda `NULL` también (columna `business_id` NULLABLE en la nueva tabla) → la
     policy de tenant deja esas filas invisibles al dueño igual que hoy pasa con el bloque padre
     (consistente, pero rompe la premisa "match de rol" de 057 al pie de la letra — hay que
     documentarlo en la cabecera de la migración, no asumirlo en silencio).
   - (b) forzar que la puente solo pueda insertarse quirúrgicamente contra bloques con
     `business_id NOT NULL` (un `CHECK`/constraint adicional, o simplemente que la UI de Phase 19
     nunca ofrezca mapear un bloque sin negocio). Más cerca del espíritu de 057 pero es una
     invariante nueva, no una que ya exista.
   - **Preguntar/decidir en planning cuál — este mapa NO elige por vos**, porque cambia la forma de
     la migración (columna nullable sí/no) y de las 4 policies (agregar o no un `AND business_id IS
     NOT NULL` implícito en el predicado).
2. **Confirmar primero SI existen bloques con `business_id NULL` en prod/local antes de diseñar la
   policy** — si la respuesta es "nunca pasa en la práctica" (constraint de aplicación, no de DB), la
   solución (a) es inocua. Si SÍ pasa (o pasó históricamente), la migración debe declarar
   explícitamente qué hace con esas filas huérfanas.

### 2. Vista acotada `public_time_block_services`

**Analog:** `supabase/migrations/059_public_professional_services.sql` (íntegro)

**Copiar tal cual:**
- `CREATE OR REPLACE VIEW public.public_time_block_services AS SELECT` de las columnas de la puente sin JOIN (aquí: `time_block_id, service_id`, y `business_id` **solo si** la puente termina teniéndolo NOT NULL — ver punto 1 arriba; si quedó nullable, evaluar si conviene resolver el `business_id` vía join a `time_blocks` para que la vista sí tenga con qué filtrar en el RSC).
- `ALTER VIEW ... OWNER TO "postgres"` — owner DEFINER, **NUNCA** `security_invoker = true`.
- `GRANT ALL ON TABLE ... TO "anon"`, `"authenticated"`, `"service_role"` — los tres, igual que 059.

**⚠ Pitfall 5 (repetido palabra por palabra en 044 y 059):** con `security_invoker = true` la vista
hereda la RLS de la tabla base. `time_block_services` (molde 057) **no tiene policy anon** — igual
que `professional_services` — así que con invoker el anon leería la vista y obtendría **0 filas
siempre**, silenciosamente. El resultado observable sería "ninguna franja tiene servicios mapeados"
para TODO negocio, indistinguible del comodín — bug invisible en QA superficial. Usar owner
`postgres` (DEFINER), sin excepción.

**Descartado explícitamente (D-05 del CONTEXT):** replicar el patrón `public read time_blocks` con
`qual: true` para el rol `public` (confirmado en la policy real de `time_blocks` arriba). Ese patrón
abre la TABLA entera a `anon`; la vista acotada existe justamente para no repetirlo. No es analog a
seguir aunque exista en el repo.

### 3. `lib/time-block-services.ts` — el helper del comodín

**Analog:** `lib/staff-services.ts` (íntegro, ~85 líneas) — copiar el CONTRATO, no necesariamente
todas las funciones (acá no hace falta un espejo de las 4 funciones de staff-services, solo las que
la Phase 18 consume).

**Copiar:**
- Cabecera con el mismo formato: qué regla encierra, quién la necesita, por qué existe una fuente
  única.
- Funciones **puras** (sin React, sin Supabase), inputs = filas planas (`TimeBlock[]`,
  `Service[]`/`serviceId: string`, `TimeBlockService[]` — el array de filas de la puente), nunca un
  cliente Supabase. `export function servicesForBlock(blockId, services, bridge): Service[]` (o el
  nombre elegido), espejo de `servicesForProfessional` (`lib/staff-services.ts:26-33`): filtra
  `bridge` por `time_block_id`, si `rows.length === 0` retorna `[...services]` (comodín), si no,
  retorna solo los mapeados.
- Su inverso: `blocksForService(serviceId, blocks, bridge): TimeBlock[]` — espejo de
  `professionalsForService` (`lib/staff-services.ts:44-52`).
- **D-16 (el caller filtra ANTES de llamar):** ninguna de las funciones nuevas debe filtrar por
  `business_id` ni por `active`/vigencia — eso ya lo hizo el caller (RSC, route handler) antes de
  pasarle las filas. Es el mismo contrato de `staff-services.ts`.
- **No copiar** `bookableServices` ni su guarda de "modo sentinel sin staff nombrado" tal cual — esa
  guarda es específica de multi-staff (0 profesionales nombrados). Si Phase 18 necesita el
  equivalente de "servicio sin cobertura", el candidato es una función tipo `isBlockCoverage`/
  `isServiceScheduled` que replique SOLO la lógica de comodín (D-06: "sin franja que lo cubra" es
  legal y solo se computa, no se bloquea — el aviso es Phase 19/20).

**Analog de test:** `test/staff-services.test.ts` (íntegro). Estructura a copiar:
- `describe/it/expect` de Vitest, import `@/lib/...`, cero Supabase/creds.
- Factories mínimas al tope del archivo (`function block(...)`, `function svc(...)`, `function
  map(...)`) — solo los campos que las funciones puras leen, no el shape completo de la tabla.
- **Estándar del workstream — control negativo obligatorio:** cada caso feliz (comodín cubre todo)
  necesita su contraparte que FALLARÍA sin la regla puesta. Ejemplos exactos a espejar de
  `staff-services.test.ts`:
  - `'profesional con 0 filas hace TODOS los servicios (comodín)'` → análogo:
    *'franja con 0 filas sirve para TODOS los servicios (comodín)'*.
  - `'profesional con mapeo explícito hace SOLO los marcados'` → análogo con mapeo explícito.
  - `'el mapeo de OTRO profesional no afecta a este'` → análogo: el mapeo de OTRA franja no afecta
    a esta (evita el bug de filtrar `bridge` global sin filtrar por `time_block_id`/`service_id`,
    que pasaría el caso feliz pero fallaría este).
  - `'desmarcar al último que lo ofrecía → servicio sin cobertura'` → si se porta `isServiceCovered`,
    replicar exactamente este caso (falla sin la lógica de "ningún comodín entre las franjas
    activas").
  - Un caso que pasa CON y SIN la regla puesta (ej. "franja con mapeo y el servicio SÍ está
    mapeado") no cuenta como control negativo — hay que emparejarlo siempre con el caso que
    distingue comodín de mapeo explícito vacío.

### 4. `app/api/booking/availability/route.ts` (modificado)

**No hay analog externo — es el propio archivo el analog de sí mismo.** Ubicación exacta de lo que
cambia:

- Resolución de `serviceId` ya existe (línea 32: `const serviceIdParam = searchParams.get('serviceId')
  || ''`; línea 55 en adelante: resuelve el servicio por `business_id` — anti-tampering, `invalid_
  service` si no matchea).
- Lectura de `time_blocks` (líneas 94-110 aprox.): `.from('time_blocks').select(...).eq('business_id',
  ...).eq('day_of_week', dow)` — filtra por negocio + día de semana, sin filtrar aún por servicio.
- **Dónde entra el filtro nuevo:** después de leer los bloques del día y ANTES de generar la grilla de
  start-times, aplicar `servicesForBlock`/`blocksForService` (el helper de §3) para descartar los
  bloques que tienen mapeo explícito y no incluyen `serviceIdParam` — comodín (0 filas) sigue
  ofreciendo el slot igual que hoy.
- **Cómo leer la puente sin JOIN extra evitable:** seguir el patrón de la sección "Cualquiera"
  (líneas 112 en adelante) que ya lee `professional_services` con `createAdminClient()` y la filtra
  en JS con el helper puro (`professionalsForService`) — mismo lugar de import
  (`import { professionalsForService } from '@/lib/staff-services'`, línea 2 del archivo). El nuevo
  helper se importa igual: `import { blocksForService } from '@/lib/time-block-services'`.
- **Preferencia de Claude's Discretion del CONTEXT:** filtrar en JS sobre filas ya leídas, no en SQL
  — coherente con cómo `availability` ya trata `time_blocks` y con el contrato JS-puro de
  `staff-services`.
- Este endpoint corre con `createAdminClient()` (service role) — así que la vista acotada
  `public_time_block_services` **no hace falta acá** (ya bypassa RLS); la vista es para el consumidor
  del RSC público (`app/[slug]/page.tsx`), no para este route handler. Confirmar en planning si algún
  consumidor de esta fase SÍ necesita la vista o si queda reservada para Phase 20.

### 5. `lib/booking-core.ts` (modificado) — D-04, el backstop

**⚠ SIN ANALOG REAL dentro de este archivo — el CONTEXT afirma que existe uno en la línea 201 y NO
es así.** Verificado línea por línea: la línea 201 de `booking-core.ts` es un COMENTARIO explicando
que `time_blocks` "sigue definiendo el DÍA y la VENTANA" pero que `book_slot_atomic` dejó de
consultar su `capacity` — es prosa histórica sobre el cupo, **no hay código en `booking-core.ts` que
lea `time_blocks` ni que valide `day_of_week`/ventana horaria en absoluto** (`grep -n
"day_of_week|getDay|dow"` sobre el archivo: cero resultados; `grep -n "time_blocks"`: cero
resultados). El único lugar del repo que hoy consulta `time_blocks` para decidir algo en el camino
`create` es el ENDPOINT (`app/api/booking/create/route.ts`, anterior a llamar al core) — no confirmado
en esta lectura, a verificar en planning si ahí sí hay un chequeo previo que se pueda extender, o si
el backstop de D-04 es 100% código nuevo dentro de `createAppointmentCore`.

**Lo que SÍ hay que copiar — el contrato de flags existente en el propio archivo:**
- El patrón de flags opcionales con default seguro: `requireDeposit = false` y `autoAssign = false`
  (desestructurados en la firma de `createAppointmentCore`, líneas ~107-109), cada uno documentado
  en el `type CreateAppointmentInput` (líneas 32-58) con un comentario explicando qué caller lo usa y
  qué pasa cuando queda en su default. El backstop de D-04 debería seguir EXACTAMENTE este molde:
  un flag opcional (p. ej. `enforceServiceWindow?: boolean`, default a decidir) documentado igual.
- El patrón de rechazo temprano con status 400 (no 409): igual que el gate de
  `any_professional_unsupported` (líneas 145-149) — "no hay conflicto de horario, es una request no
  soportada" — mismo razonamiento aplica acá: si el servicio no está mapeado a ninguna franja que
  cubra el día/horario pedido, es 400, no `slot_taken` (409).
- Convención de código de error: **string corto snake_case**, nuevo miembro de la unión en la línea
  89 (`error: 'invalid_service' | 'invalid_professional' | ... `) — candidato: `'invalid_schedule'`
  o `'service_not_scheduled'` (a discreción, siguiendo el naming existente).

**⚠ La trampa más importante de toda la fase — `createAppointmentCore` es COMPARTIDO:**

Confirmado por grep: tanto `app/api/booking/create/route.ts:158` (camino PÚBLICO) como
`app/api/appointments/create/route.ts:82` (alta MANUAL del dueño) llaman a
`createAppointmentCore(...)`. El CONTEXT es explícito (D-04 + "La asimetría que esta fase tiene que
respetar"): la regla de D-04 es **solo para el camino público**, el alta manual **no valida
horario hoy y no debe empezar a hacerlo** (el dueño necesita poder cargar una excepción fuera de
franja). Si el backstop se escribe dentro de `createAppointmentCore` sin gatearlo, **se filtra
también al alta manual por construcción** — hay que replicar el patrón ya usado para diferenciar
callers dentro del mismo core: `requireDeposit` (el manual siempre pasa `false`) y `autoAssign` (solo
lo usa el público). El backstop necesita el mismo tipo de flag, con el público pasándolo en `true` y
`app/api/appointments/create/route.ts` sin pasarlo (default `false`/ausente) — exactamente como ya
hace con `requireDeposit`.

**Confirmado — fuera de alcance, con motivo, NO tocar:**
- `lib/abono-generation.ts` (cabecera, líneas 12-19): documenta su propio D-06′ — el motor de abonos
  deliberadamente NO gatea por `time_blocks` porque, si lo hiciera, sería MÁS restrictivo que el alta
  manual (que tampoco chequea horario) y el dueño no podría armar series fuera de horario. Agregarle
  la regla nueva de D-04 reintroduciría exactamente lo que ese comentario explica que se sacó. El
  único skip que conserva es `day_closed` (excepción con `closed=true`).
- `app/api/appointments/create/route.ts` — confirmado en su propia cabecera (líneas 12-15): "NO hay
  seña/pago... NO hay reCAPTCHA... Lo que SÍ reusamos: createAppointmentCore". No valida horario hoy
  y el CONTEXT es explícito en que no debe empezar a hacerlo vía este cambio — ver el flag de arriba.

## Shared Patterns

### RLS multi-tenant (owner por `business_id`)
**Fuente:** `supabase/migrations/057_professional_services.sql` líneas 27-45 (las 4 policies)
**Aplica a:** la tabla puente nueva — con la salvedad del `business_id` nullable (§1).

### Vista acotada para `anon`, sin `security_invoker`
**Fuente:** `supabase/migrations/059_public_professional_services.sql` completo + comentario Pitfall 5
**Aplica a:** la vista `public_time_block_services`.

### Helper puro + contrato D-16 (caller filtra antes)
**Fuente:** `lib/staff-services.ts` completo
**Aplica a:** `lib/time-block-services.ts` y a ambos consumidores (`availability/route.ts`,
`booking-core.ts`) — ninguno de los dos debe filtrar por tenant/`active` dentro del helper, eso ya
pasó antes de invocarlo.

### Flags opcionales para diferenciar callers de un core compartido
**Fuente:** `lib/booking-core.ts` — `requireDeposit`/`autoAssign` en `CreateAppointmentInput`
(líneas 32-58, defaults en 107-109)
**Aplica a:** el flag nuevo de D-04 en `createAppointmentCore` — es el mecanismo YA usado en este
mismo archivo para exactamente este problema (dos callers, un solo core, comportamiento distinto).

### Anti-tampering de tenant sobre toda entidad referenciada
**Fuente:** `lib/booking-core.ts` líneas 113-122 (`service` re-validado por `business_id` +
`active`), replicado en `professionalId` (líneas 160-166) y `locationId`.
**Aplica a:** cualquier lectura nueva de `time_block_services`/`time_blocks` dentro del core o del
endpoint de disponibilidad debe seguir filtrando por `business_id` re-validado, nunca confiar en un
`serviceId`/`blockId` que llega tal cual del cliente.

## No hay analog real (flag explícito)

| Punto | Detalle |
|---|---|
| **El backstop D-04 dentro de `createAppointmentCore`** | El CONTEXT lo describe como "ya probado en la línea 201" — verificado línea por línea: NO existe ningún chequeo de `day_of_week`/ventana en `booking-core.ts` hoy. Es código 100% nuevo. El único patrón reusable es el MECANISMO de flag (`requireDeposit`/`autoAssign`), no la lógica de ventana en sí. |
| **Aplicar la regla del comodín "dentro" de un cálculo de disponibilidad ya existente** | `availability/route.ts` no tiene hoy ningún punto donde cruce `time_blocks` contra un mapeo de servicios — es la primera vez que ese archivo filtra bloques por `serviceId` en vez de solo por negocio/día. El punto de inserción (entre la lectura de bloques y la generación de la grilla) es una decisión del plan, no un lugar que ya exista. |
| **Qué hace la puente con `time_blocks.business_id` NULLABLE** | Sin precedente en el repo: `professional_services`/`agenda_spaces` asumen FKs `NOT NULL`. Requiere decisión explícita documentada en la cabecera de la migración 071 (ver §1), no un copy-paste. |
| **Si algún consumidor de ESTA fase necesita `public_time_block_services`** | `availability/route.ts` usa service role (no lo necesita). El RSC público (`app/[slug]/page.tsx`) es Phase 20, fuera de esta fase — confirmar en planning si la vista se crea acá "adelantada y sin consumidor" (como sugiere D-05) o se difiere. |

## Metadata

**Scope de búsqueda:** `supabase/migrations/057*.sql`, `059*.sql`, `lib/staff-services.ts`,
`test/staff-services.test.ts`, `app/api/booking/availability/route.ts`, `lib/booking-core.ts`,
`app/api/appointments/create/route.ts`, `lib/abono-generation.ts`, esquema local de `time_blocks`
(Postgres local vía `docker exec supabase_db_forjo-app psql`).
**Archivos leídos íntegros:** 057, 059, `staff-services.ts`, `staff-services.test.ts`.
**Archivos leídos parcial (grep + rangos):** `booking-core.ts` (440 líneas, rangos 1-260, 330-365 +
greps dirigidos), `availability/route.ts` (grep dirigido), `appointments/create/route.ts` (1-40),
`abono-generation.ts` (1-40).
**Fecha:** 2026-08-24
