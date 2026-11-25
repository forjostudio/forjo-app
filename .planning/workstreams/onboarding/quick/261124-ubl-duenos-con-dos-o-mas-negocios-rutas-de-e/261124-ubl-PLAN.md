---
phase: quick-261124-ubl
plan: "01"
type: execute
wave: 1
depends_on: []
quick_id: 261124-ubl
files_modified:
  - test/panel-negocio-gate.test.ts
  - test/dueno-con-dos-negocios.test.ts
  - test/oauth-return-routes.test.ts
  - app/api/mercadopago/disconnect/route.ts
  - app/api/abonos/cancel/route.ts
  - app/api/abonos/create/route.ts
  - app/api/appointments/cleanup-expired/route.ts
  - app/api/appointments/create/route.ts
  - app/api/appointments/delete/route.ts
  - app/api/clients/create/route.ts
  - app/api/export/clients/route.ts
  - app/api/export/finances/route.ts
  - app/api/google/callback/route.ts
  - app/api/google/disconnect/route.ts
  - app/api/google/sync/route.ts
  - app/api/import/clients/confirm/route.ts
  - app/api/import/clients/preview/route.ts
  - app/api/notify/cancel/route.ts
  - app/api/subscription/cancel/route.ts
  - app/api/subscription/create/route.ts
  - app/api/subscription/status/route.ts
  - app/(dashboard)/web/_landing-actions.ts
autonomous: true
# Quick task sin IDs de REQUIREMENTS.md: el requisito es la tarea misma. Los 6 puntos del pedido + la
# evidencia se numeran D-01..D-07 (abajo, en <objective>) y las decisiones de discreción del planner
# DC-1..DC-8, para citarlas en cada tarea.
requirements: [quick-261124-ubl]

estimate:
  tokens: 120000
  raw_tokens: 120000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Un dueño con DOS negocios hace POST /api/mercadopago/disconnect y se desconecta SÓLO el más viejo (mp_user_id y los 3 secretos MP en null). El más nuevo conserva su mp_user_id y su token, y el negocio de otro dueño no cambia. Probado en el carril db contra el Supabase local; antes del arreglo, la misma prueba daba 404 (D-02, D-06)"
    - "Un dueño con DOS negocios hace POST /api/clients/create y el cliente queda en el más viejo. El más nuevo sigue con 0 clientes. Carril db; antes del arreglo daba 404 (D-01, D-06)"
    - "Las 18 rutas de app/api del inventario y las 3 server actions de app/(dashboard)/web/_landing-actions.ts resuelven el negocio con negocioDelDueno(<cliente de sesión>, user.id de auth.getUser(), <las mismas columnas que hoy>). Es el mismo negocio que muestra el panel: el más viejo por created_at. Nunca negocioDelPanel, nunca service role (D-01)"
    - "Con 0 filas, cada ruta responde exactamente lo mismo que hoy (status y cuerpo). Con error de lectura hay cuatro casos: (1) 500 { ok:false, error:'read_failed' } en las rutas que ya responden con { ok, error }; (2) 500 con texto en castellano en subscription/*, porque su UI muestra data.error tal cual; (3) { ok:false, error:'server_error' } en las server actions; (4) ?google=error en el callback de Google (D-01, DC-1, DC-2, DC-3, DC-4)"
    - "Ningún .update/.delete/.upsert sobre businesses en app/, lib/, components/ ni scripts/ filtra por owner_id sin filtrar también por id. El gate lo vigila y se lo vio en ROJO contra el disconnect viejo (D-02, D-05)"
    - "En app/api/**, app/(dashboard)/** y app/page.tsx no queda ningún .eq('owner_id', …)….single() ni ninguna lectura de businesses por owner_id sin id fuera del helper. Única excepción vigilada: abonos/cancel-link, que ya elige el más viejo. La excepción DC-5 de 261124-neg (_landing-actions.ts) desaparece. Se lo vio en ROJO contra el código viejo (D-05)"
    - "Sin cambios en webhooks (payment/webhook, subscription/webhook), onboarding/slug-available, app/[slug], lib/booking-core.ts, app/(onboarding)/**, lib/negocio-del-dueno.ts, lib/onboarding-alta.ts, lib/overlay-history.ts, lib/dirty-history.ts, scripts/con-turno.mjs, next.config.ts, package.json, el lockfile ni supabase/ (D-04)"
    - "Evidencia: ./node_modules/.bin/tsc --noEmit da 0. npm test queda verde y con el carril db corriendo de verdad (sin skip). eslint de los archivos tocados no muestra problemas nuevos frente al baseline. npm run build da 0 (D-07)"
  artifacts:
    - path: test/panel-negocio-gate.test.ts
      provides: "cadenasSobreBusinesses (escáner de cadenas con paréntesis balanceados) + gate A extendido a app/api/** + gate B de mutaciones sobre businesses en todo el fuente"
      contains: "cadenasSobreBusinesses"
    - path: test/dueno-con-dos-negocios.test.ts
      provides: "carril db: dueño con dos negocios (seedTwoTenants + un negocio más nuevo del dueño A); disconnect de MP y alta de cliente actúan sobre el más viejo"
      contains: "seedTwoTenants"
    - path: app/api/mercadopago/disconnect/route.ts
      provides: "negocioDelDueno + update acotado por id y owner_id"
      contains: "negocioDelDueno"
  key_links:
    - from: "app/api/**/route.ts (18 rutas) y app/(dashboard)/web/_landing-actions.ts"
      to: "lib/negocio-del-dueno.ts"
      via: "negocioDelDueno(supabase, user.id, '<columnas>')"
      pattern: "negocioDelDueno\\("
    - from: "app/api/mercadopago/disconnect/route.ts"
      to: "businesses (fila del negocio resuelto)"
      via: ".update({ mp_user_id: null }).eq('id', biz.id).eq('owner_id', user.id)"
      pattern: "eq\\('id', biz\\.id\\)"
    - from: "test/dueno-con-dos-negocios.test.ts"
      to: "app/api/mercadopago/disconnect/route.ts y app/api/clients/create/route.ts"
      via: "vi.mock('@/lib/supabase/server') devolviendo un cliente anon con sesión real del dueño A"
      pattern: "vi\\.mock\\('@/lib/supabase/server'"
    - from: "test/panel-negocio-gate.test.ts"
      to: "app/api/**, app/(dashboard)/**, app/page.tsx, lib/**, components/**, scripts/**"
      via: "walker fuentesDe + sinComentarios + cadenasSobreBusinesses"
      pattern: "cadenasSobreBusinesses"
---

<objective>
Un dueño con 2 o más negocios ya entra al panel desde 261124-neg y ve siempre el más viejo. Pero las rutas que leen o escriben por su cuenta siguen con `.eq('owner_id', user.id).single()`, y con 2+ filas eso da error ⇒ 404 / `no_business`. Además, `app/api/mercadopago/disconnect/route.ts` tiene un UPDATE filtrado SÓLO por `owner_id`, que desconecta TODOS los negocios del dueño. Este quick hace que todo el lado servidor del panel resuelva el MISMO negocio que el panel muestra, con el helper compartido `negocioDelDueno`, y deja gates que impiden volver atrás.

Pedidos (numerados para citarlos):
- **D-01 Resolución.** Reemplazar la lectura por `negocioDelDueno` (no `negocioDelPanel`: en las APIs no se redirige). Con 0 filas, la respuesta de hoy. Con error de lectura, decidir caso por caso sin romper a los consumidores (ver DC-1..DC-4).
- **D-02 Mutaciones por `owner_id`.** Todo `.update/.delete/.upsert` sobre `businesses` filtrado sólo por `owner_id` pasa a acotarse por el `id` resuelto, manteniendo `owner_id` como defensa (molde: `app/api/mercadopago/callback/route.ts`, 261124-obs). Relevamiento hecho al planificar, sobre todas las cadenas `.from('businesses')` de app/, lib/, components/ y scripts/: hay UNA sola, `app/api/mercadopago/disconnect/route.ts` (`.update({ mp_user_id: null }).eq('owner_id', user.id)`). Las demás ya van por `.eq('id', …)`: settings-client, agenda-client, abonos-client, categorias-manager, landing-actions, subscription/create, subscription/cancel, el webhook, lib/mp-connection, CRM y setup-landing. Ninguna otra tabla se filtra por `owner_id`.
- **D-03 Cliente de navegador.** Verificado al planificar: `settings-client.tsx` (y agenda/abonos/categorias) NO resuelve el negocio. Recibe `business` por props desde la page server, que ya usa `negocioDelPanel` (el más viejo), y todos sus updates van por `.eq('id', business.id)`. La línea con `owner_id` (≈1004) es un comentario. No hay nada que migrar. Queda congelado por el gate B, que también barre `app/` y `components/`.
- **D-04 Casos donde «más viejo» no es la regla.** Verificados al planificar, ninguno requiere decisión de producto (no hay checkpoint:decision):
  - `app/api/onboarding/slug-available`: chequea el espacio GLOBAL por slug con service role y nunca resuelve el negocio del dueño. No se toca. La pregunta de reusar el propio slug no cambia con este quick.
  - `app/[slug]/page.tsx`: lee la vista pública por slug. `owner_id` es sólo una columna del select. No se toca.
  - `lib/booking-core.ts`: sus `.single()` son sobre services/professionals/rpc por id (falsos positivos del grep). No se toca.
  - `subscription/create|status|cancel`: SÍ migran. Con el helper actúan sobre el más viejo, que es el negocio que muestra el panel (banner y modal de plan). El webhook resuelve por `mp_subscription_id`/`mp_plan_id_active` y escribe por id, así que queda consistente.
  - Webhooks (`payment/webhook/[slug]`, `subscription/webhook`): resuelven por slug o por ids de MP, no por sesión. No se tocan.
  - `app/(onboarding)/onboarding/page.tsx`: el alta lee TODOS los negocios del dueño para `lib/onboarding-alta.ts`. No se toca.
  - `app/(onboarding)/onboarding/integraciones/page.tsx`: `maybeSingle`; con 2+ filas va a `/dashboard` y nunca actúa sobre otro negocio (decisión WR-03 de q8v). Está fuera del panel y no se toca.
  - `app/api/abonos/cancel-link/[id]`: ya elige el más viejo (`order created_at` + `order id` + `limit(2)` + log del caso ambiguo). Queda como excepción justificada y vigilada del gate (DC-6).
- **D-05 Gates.** Hay dos. (A) El gate de 261124-neg se extiende a `app/api/**` + `app/(dashboard)/**` + `app/page.tsx`, sin la excepción DC-5 y con una sola excepción vigilada (cancel-link). (B) Un gate nuevo falla si algún `.update/.delete/.upsert` sobre `businesses` filtra por `owner_id` sin `id`. Los dos se ven en ROJO contra el código viejo antes de arreglarlo.
- **D-06 Tests.** Una prueba en el carril db (Supabase local, fixtures del proyecto, sin reset) con un dueño con DOS negocios: disconnect de MP y alta de cliente actúan sobre el más viejo y no tocan el otro. El fake de `test/oauth-return-routes.test.ts` se actualiza para el callback de Google.
- **D-07 Evidencia.** `./node_modules/.bin/tsc --noEmit` (NUNCA npx tsc), `npm test`, eslint de los archivos tocados antes y después, `npm run build`.

Decisiones de discreción del planner:
- **DC-1 Error de lectura = 500 `read_failed`** en las rutas con forma `{ ok, error }`. Motivo: «falló la lectura» no es «no tenés negocio» (la misma lección de 261124-neg), y el helper ya loguea el código. Revisé los consumidores al planificar: abonos-client, nuevo-abono-form, nuevo-turno-form, appointments-client, clients-client, finances-client, settings-client y agenda-client miran `res.ok`/`data.ok` o usan un mapa con fallback genérico. Ninguno se ramifica por 404/403/400 ni por `not_found`/`no_business`/`Sin negocio`/`not_connected` de estas rutas. Si al ejecutar aparece un consumidor que sí lo hace, se mantiene la respuesta de hoy para esa ruta y se anota en el SUMMARY.
- **DC-2 subscription/* conserva su forma `{ error: '<texto>' }`.** plan-modal y settings-client hacen `toast.error(data.error)`, así que un código snake se le mostraría al dueño tal cual. Con error de lectura responden 500 con el texto `No pudimos leer tu negocio. Probá de nuevo.`. plan-banner sólo mira `data.plan_status`, así que con un 500 sigue sondeando hasta su timeout, igual que hoy.
- **DC-3 Server actions de /web: error → `{ ok:false, error:'server_error' }`.** Es el código de infraestructura que ya usan y que `web-client.tsx` (`ACTION_ERROR_COPY.server_error`) ya traduce. No hace falta tocar la unión `Result` ni el copy. Sin negocio sigue siendo `no_business`.
- **DC-4 Callback de Google: 0 filas y error → `fail()`** (vuelve con `?google=error`), igual que el de MP ya migrado.
- **DC-5 El helper NO cambia.** `businesses.created_at` es nullable, pero tiene DEFAULT now(): dos negocios del mismo dueño creados desde la app no pueden empatar. Agregar `order('id')` al helper rompería los fakes de 4 suites y cambiaría un helper ya en prod sin un caso medido. Queda como riesgo aceptado (T-ubl-05).
- **DC-6 cancel-link: excepción del gate de lecturas, con motivo y vigencia.** Ya resuelve el mismo negocio con desempate por id y loguea el caso de 2+ negocios (WR-B1/B2). Migrarlo perdería ese log.
- **DC-7 Escáner del gate: paréntesis balanceados, no regex de una línea.** Los payloads de `.update({...String(x)...})` tienen paréntesis anidados, y una regex corta se trunca: termina en rojo con el código correcto, o en verde midiendo cero (trampa ya vista en este repo). Por eso el escáner lleva fixtures y anclas de conteo sobre archivos reales.
- **DC-8 disconnect conserva `owner_id`** en el update además de `id`, como defensa en profundidad (molde 261124-obs).

Purpose: que el dueño con 2+ negocios use el panel entero (crear turno, cliente, abono, exportar, conectar y desconectar integraciones, suscripción, guardar la web) sobre el negocio que ve, y que ninguna escritura toque el otro.
Output: 18 rutas + 3 server actions migradas, el UPDATE de disconnect acotado, gates A y B, prueba db con dos negocios y fake del callback de Google actualizado.
</objective>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@./AGENTS.md
@.claude/skills/supabase-multitenant-rls/SKILL.md
@.claude/skills/mercadopago-connect/SKILL.md
@.planning/workstreams/onboarding/quick/261124-neg-panel-error-de-lectura-del-negocio-no-ma/261124-neg-SUMMARY.md
@lib/negocio-del-dueno.ts
@app/api/mercadopago/callback/route.ts
@test/panel-negocio-gate.test.ts
@test/helpers/supabase-fixtures.ts
@test/helpers/cleanup.ts

<interfaces>
De lib/negocio-del-dueno.ts (NO se modifica, DC-5):
- `negocioDelDueno<Q extends string>(supabase: SupabaseClient, ownerId: string, columnas: Q): Promise<NegocioDelDueno<FilaDe<Q>>>`
- `type NegocioDelDueno<T> = { ok: true; business: T } | { ok: false; reason: 'sin-negocio' | 'error' }`
- La consulta: `.from('businesses').select(columnas).eq('owner_id', ownerId).order('created_at', { ascending: true }).limit(1).maybeSingle()`. Con error loguea `[negocio-del-dueno] leer negocio falló: <code>` y devuelve `reason: 'error'`.
- `FilaDe<Q>` conserva el tipado del select de antes: misma lista de columnas ⇒ mismo tipo en cada ruta.

Molde de uso (app/api/mercadopago/callback/route.ts, 261124-obs): `const negocio = await negocioDelDueno(supabase, user.id, 'id')`; `if (!negocio.ok) return fail()`; `const biz = negocio.business`. Después, el update va con `.eq('id', biz.id).eq('owner_id', user.id)`.

De test/helpers/supabase-fixtures.ts: `seedTwoTenants(): Promise<SeededTenants>` con `{ admin, emailA, emailB, password, userA, userB, bizA, bizB, apptB, apptBClientName }`, y `teardown(seeded)`. De test/helpers/cleanup.ts: `cleanupOrThrow(label, op)`. De test/env.ts: `hasSupabaseCreds`. Importar `./env` es lo que manda el archivo al carril db (test/suite-split.ts).

Patrón db de rutas con sesión real (test/abono-create.test.ts, test/manual-booking.test.ts): `const h = vi.hoisted(() => ({ session: { current: null as SupabaseClient | null } }))`; `vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.session.current }))`; después, importar el handler (`import { POST } from '@/app/api/...'`). Skip con `describe.skipIf(!hasSupabaseCreds)`.

Fake de test/oauth-return-routes.test.ts: `fakeSupabase({ bizRead?, updateError? })` registra `readChain` (`order`/`limit`/`maybeSingle`/`single`), `eqCalls` y `upserts`. El `select().eq()` hoy expone `single` (lo usaba el callback de Google) y la cadena `order → limit → maybeSingle`.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): disconnect de MP con dos negocios, de punta a punta: gate B + prueba db en rojo, arreglo en verde</name>
  <files>test/panel-negocio-gate.test.ts, test/dueno-con-dos-negocios.test.ts, app/api/mercadopago/disconnect/route.ts</files>
  <behavior>
    - Gate B (fixtures del escáner): da positivo para el disconnect viejo multilínea (update de businesses + filtro owner_id, sin id); para un payload con paréntesis anidados (`String(a)`, `f(g(1))`) seguido de un filtro owner_id y un select('id'); para delete por owner_id; para update con `.match({ owner_id })`; y con comillas dobles.
    - Gate B (fixtures): da negativo para el update del callback de MP (id + owner_id con `String(...)` adentro); para un update por id solo; para `.from('business_secrets').upsert(...)`; para una cadena de otra tabla filtrada por owner_id; para una lectura (select + owner_id + order + limit + maybeSingle, que no es mutación); y para la cadena vieja dentro de un comentario (después de sinComentarios).
    - Gate B (anclas contra el código real, para que el barrido no mida cero): el escáner encuentra ≥1 cadena de mutación en app/api/mercadopago/callback/route.ts (con id y owner_id), exactamente 3 en app/(dashboard)/web/_landing-actions.ts, ≥1 en app/api/subscription/create/route.ts, ≥10 en app/(dashboard)/settings/settings-client.tsx, y ≥1 lectura por owner_id en lib/negocio-del-dueno.ts.
    - Gate B (barrido): ninguna cadena de mutación sobre businesses en app/, lib/, components/ ni scripts/ filtra por owner_id sin id. En ROJO con el código de hoy y nombrando SÓLO app/api/mercadopago/disconnect/route.ts.
    - Carril db: un dueño A con dos negocios (bizA, el más viejo de seedTwoTenants, y bizA2, insertado después con created_at = created_at de bizA + 60 s), más el dueño B. Los tres tienen mp_user_id distintos y mp_access_token en business_secrets. Con la sesión de A, POST /api/mercadopago/disconnect → 200 { ok: true }. bizA queda con mp_user_id null y mp_access_token/mp_refresh_token/mp_token_expires_at null. bizA2 conserva mp_user_id y token. bizB no cambia. En ROJO con el código de hoy (404 por el single con 2 filas).
  </behavior>
  <action>
Antes de tocar nada:
- `git status`, para confirmar que no hay cambios ajenos en los archivos del plan. Otra sesión puede estar trabajando: nunca stagear `.claude/settings.json` ni `.planning/workstreams/panel-nav/.verification-ledger.json`.
- Baselines de D-07: `./node_modules/.bin/tsc --noEmit` (anotar el exit) y `./node_modules/.bin/eslint` sobre los 19 archivos de app/ del frontmatter más test/panel-negocio-gate.test.ts y test/oauth-return-routes.test.ts. Guardar la salida en el scratchpad para compararla al final.

RED, gate B (D-02, D-05, DC-7). En test/panel-negocio-gate.test.ts, sin tocar lo que ya existe en esta tarea:
- Agregar `cadenasSobreBusinesses(src): string[]`, que se aplica sobre el fuente ya pasado por `sinComentarios`. Busca cada `.from(` con un literal `businesses` (cualquier comilla) y `)`. Desde ahí avanza mientras, saltando espacios y saltos de línea, siga `.` + identificador + genérico opcional `<...>` + `(`. Cada argumento se consume con conteo de paréntesis balanceados, saltando los literales de string (`'`, `"`, backtick, con escapes `\`). Devuelve el texto de cada cadena completa. Prohibido resolverlo con una regex de una línea (DC-7).
- Agregar los predicados `filtraPorOwner(c)` (`.eq(` con primer argumento literal `owner_id`, o `.match({` que contenga `owner_id`), `filtraPorId(c)` (`.eq(` con primer argumento literal `id`) y `esMutacion(c)` (contiene `.update(`, `.delete(` o `.upsert(`).
- Sumar un walker que reuse `fuentesDe` sobre app/, lib/, components/ y scripts/ (sólo .ts/.tsx; fuentesDe ya excluye los tests) y un describe nuevo con los fixtures y las anclas de <behavior>, más el barrido «mutación sobre businesses por owner_id sin id».
- El mensaje de falla nombra cada archivo y explica en castellano el riesgo: un UPDATE sólo por owner_id toca TODOS los negocios del dueño. También dice el arreglo: `.eq('id', <negocio resuelto>.id)` y `owner_id` como defensa.
- Cabecera del bloque con comentario en español (quick 261124-ubl, por qué, límite conocido: una cadena armada en varias sentencias, `let q = …; q = q.eq(…)`, no se detecta).
- Correr `./node_modules/.bin/vitest run --project pure test/panel-negocio-gate.test.ts`. Tiene que dar ROJO sólo en el barrido, nombrando únicamente app/api/mercadopago/disconnect/route.ts. Fixtures y anclas en verde. Copiar la salida para el SUMMARY.

RED, carril db (D-06). Crear test/dueno-con-dos-negocios.test.ts con el patrón de <interfaces>:
- `import { hasSupabaseCreds } from './env'`, seedTwoTenants/teardown, cleanupOrThrow, createClient de @supabase/supabase-js, y `describe.skipIf(!hasSupabaseCreds)`.
- En beforeAll: seed. Leer con admin el created_at de bizA e insertar con admin bizA2 (owner_id = userA, slug y name con prefijo `__test_<uuid8>_a2`, created_at = el de bizA + 60 s). Se usa el reloj de la base y no el de Node, que en Docker puede diferir.
- También en beforeAll: setear con admin mp_user_id únicos en bizA, bizA2 y bizB (con el uuid de la corrida: el índice único parcial de la migración 082 no admite repetidos) y upsert de business_secrets con mp_access_token distinto para los tres. Abrir una sesión anon real de A con signInWithPassword.
- El caso del disconnect asierta respuesta y efectos según <behavior>. Las lecturas de verificación se hacen con admin: los fixtures lo permiten para el check independiente del efecto; la llamada a la ruta va SIEMPRE con la sesión de A.
- En afterAll: signOut, cleanupOrThrow del delete de bizA2 y después teardown(seed). Nunca `supabase db reset` ni `stop`.
- Comentario de cabecera en español (por qué existe, qué congela).
- Correr `./node_modules/.bin/vitest run --project db test/dueno-con-dos-negocios.test.ts`. Tiene que dar ROJO por 404, NO por skip: si sale skipped o no conecta, PARAR y reportar sin tocar Docker ni la base.
- Commit RED de los dos tests: `test(quick-261124-ubl): …`, con `git add` explícito de esos dos archivos.

GREEN (D-01, D-02, DC-1, DC-8). En app/api/mercadopago/disconnect/route.ts:
- Reemplazar la lectura por `negocioDelDueno(supabase, user.id, 'id')`.
- Con `sin-negocio`, devolver la respuesta de hoy (404 `{ ok: false }`). Con `error`, devolver 500 `{ ok: false, error: 'read_failed' }`.
- El UPDATE de mp_user_id pasa a `.eq('id', biz.id).eq('owner_id', user.id)`.
- Actualizar los comentarios en español: el más viejo, el mismo que el panel; por qué id + owner_id.
- El upsert de business_secrets ya va por biz.id: no se toca.
- Correr los dos tests: VERDE. Commit `fix(quick-261124-ubl): …`.
  </action>
  <verify>
    <automated>./node_modules/.bin/vitest run --project pure test/panel-negocio-gate.test.ts && ./node_modules/.bin/vitest run --project db test/dueno-con-dos-negocios.test.ts</automated>
  </verify>
  <done>Se vio el ROJO de los dos tests con el código viejo: el gate B nombra sólo el disconnect y el db da 404, no skip. Las dos salidas quedan copiadas para el SUMMARY. Después de arreglar el disconnect, los dos dan VERDE: el db corrió de verdad y bizA2/bizB quedaron intactos. Hay 2 commits (test RED + fix).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: las otras 17 rutas de app/api al helper (gate A extendido en rojo primero) + alta de cliente con dos negocios + fake del callback de Google</name>
  <files>test/panel-negocio-gate.test.ts, test/dueno-con-dos-negocios.test.ts, test/oauth-return-routes.test.ts, app/api/abonos/cancel/route.ts, app/api/abonos/create/route.ts, app/api/appointments/cleanup-expired/route.ts, app/api/appointments/create/route.ts, app/api/appointments/delete/route.ts, app/api/clients/create/route.ts, app/api/export/clients/route.ts, app/api/export/finances/route.ts, app/api/google/callback/route.ts, app/api/google/disconnect/route.ts, app/api/google/sync/route.ts, app/api/import/clients/confirm/route.ts, app/api/import/clients/preview/route.ts, app/api/notify/cancel/route.ts, app/api/subscription/cancel/route.ts, app/api/subscription/create/route.ts, app/api/subscription/status/route.ts</files>
  <behavior>
    - Gate A extendido: el barrido cubre app/(dashboard)/**, app/api/** y app/page.tsx. ESPERADOS suma las 19 rutas de app/api: las 17 de esta tarea + mercadopago/disconnect + mercadopago/callback. Cada una tiene que llamar a negocioDel(Dueno|Panel)(.
    - Gate A, chequeo `.eq(owner_id)….single()`: ningún archivo del barrido lo usa, salvo `_landing-actions.ts`, que sigue en EXCEPCIONES hasta la Task 3.
    - Gate A, chequeo nuevo de lectura: ninguna cadena sobre businesses del barrido que NO sea mutación filtra por owner_id sin id. Excepciones de lectura: cancel-link (permanente, DC-6, con vigencia: sigue teniendo una cadena por owner_id con order created_at y limit(2)) y `_landing-actions.ts` (temporal, se va en la Task 3).
    - ROJO esperado antes de migrar: «usa el helper» y los dos chequeos de patrón nombran exactamente las 17 rutas de esta tarea. Ni más ni menos.
    - Carril db: con la sesión de A (dos negocios), POST /api/clients/create con un nombre único y un teléfono → 200 { ok: true }. El cliente queda con business_id = bizA y bizA2 sigue con 0 clientes. ROJO con el código viejo (404).
    - oauth-return-routes: el callback de Google lee el negocio con order('created_at', asc) → limit(1) → maybeSingle, nunca single. Si la lectura falla (bizRead con error), vuelve con ?google=error y no hace ningún upsert. ROJO con el código viejo (readChain = single).
  </behavior>
  <action>
`git status` de nuevo antes de editar los tests compartidos.

RED (D-05).
- En test/panel-negocio-gate.test.ts, el barrido pasa a incluir app/api además de app/(dashboard) y app/page.tsx. Se suman a ESPERADOS las 19 rutas de app/api.
- Se agrega el chequeo de lectura sobre `cadenasSobreBusinesses` (cadena no mutación + filtraPorOwner + sin filtraPorId ⇒ reincidente), con un mapa EXCEPCIONES_LECTURA con motivo y vigencia (DC-6 para cancel-link; `_landing-actions.ts` temporal, con motivo «se migra en la Task 3 de 261124-ubl»).
- Actualizar el texto de PORQUE: en una API se usa `negocioDelDueno`, nunca `negocioDelPanel`. Actualizar también la cabecera del archivo (comentario en español, quick 261124-ubl).

En test/dueno-con-dos-negocios.test.ts, agregar el caso del alta de cliente según <behavior>. Leer app/api/clients/create/route.ts para los nombres exactos de los campos del body; validateClientBody exige name y phone o email.

En test/oauth-return-routes.test.ts:
- Sacar `single` del fake: una regresión a single tiene que tirar, no pasar.
- Actualizar el comentario de las líneas ≈45-46.
- Agregar los dos casos del callback de Google de <behavior>.

Correr:
- `./node_modules/.bin/vitest run --project pure test/panel-negocio-gate.test.ts test/oauth-return-routes.test.ts`
- `./node_modules/.bin/vitest run --project db test/dueno-con-dos-negocios.test.ts`

Los tres tienen que dar ROJO como dice <behavior>. Copiar las salidas. Commit `test(quick-261124-ubl): …` con git add explícito.

GREEN (D-01, DC-1, DC-2, DC-4). En cada ruta:
- Reemplazar sólo el bloque de lectura del negocio por `const negocio = await negocioDelDueno(<cliente de sesión de esa ruta: supabase o ssr>, user.id, '<las MISMAS columnas que hoy>')`.
- Después: `if (!negocio.ok)`, con la respuesta según `negocio.reason`, y el mismo nombre de variable de hoy (`business`, `biz`, `ownedBusiness`) asignado desde `negocio.business`.
- Import `negocioDelDueno` de `@/lib/negocio-del-dueno`.
- No cambiar el orden de chequeos, ni las columnas, ni nada fuera de ese bloque. Ajustar el comentario vecino en español: «el más viejo, el mismo que el panel (quick 261124-ubl)».

Respuestas por ruta («hoy» = sin negocio, sin cambios; «error» = nuevo):
- abonos/cancel, abonos/create, appointments/create, clients/create, export/clients, export/finances, import/clients/confirm, import/clients/preview: hoy 404 `{ ok:false, error:'not_found' }`; error 500 `{ ok:false, error:'read_failed' }`.
- appointments/delete: hoy 403 `no_business`; error 500 `read_failed`.
- appointments/cleanup-expired y notify/cancel: hoy 403 `{ ok:false, error:'Sin negocio' }`; error 500 `{ ok:false, error:'read_failed' }`.
- google/disconnect: hoy 404 `{ ok:false }`; error 500 `{ ok:false, error:'read_failed' }`.
- google/sync: hoy 400 `not_connected`; error 500 `read_failed`.
- google/callback: los dos casos van a `fail()` (DC-4).
- subscription/cancel, create y status: hoy 404 `{ error:'Negocio no encontrado' }`; error 500 `{ error:'No pudimos leer tu negocio. Probá de nuevo.' }` (DC-2).
- En subscription/create y subscription/cancel, los updates con service role ya van por `.eq('id', business.id)`: no se tocan.

Antes de fijar cada 500, grep del consumidor (los de DC-1). Si alguno se ramifica por el status o por el código de hoy, mantener la respuesta de hoy para esa ruta y anotarlo.

Correr de nuevo los tres comandos de arriba: VERDE. Además, las suites db que importan estas rutas, para confirmar que no se rompió nada con clientes reales:
- `./node_modules/.bin/vitest run --project db test/abono-create.test.ts test/abono-cancel-routes.test.ts test/manual-booking.test.ts test/clients-import.test.ts test/manual-client.test.ts`

Commit `fix(quick-261124-ubl): …` con git add explícito de las 17 rutas.
  </action>
  <verify>
    <automated>./node_modules/.bin/vitest run --project pure test/panel-negocio-gate.test.ts test/oauth-return-routes.test.ts && ./node_modules/.bin/vitest run --project db test/dueno-con-dos-negocios.test.ts test/abono-create.test.ts test/abono-cancel-routes.test.ts test/manual-booking.test.ts test/clients-import.test.ts test/manual-client.test.ts</automated>
  </verify>
  <done>Se vio el ROJO con el código viejo: el gate A nombra exactamente las 17 rutas, el db da 404 en el alta de cliente y oauth-return-routes registra single en el callback de Google. Las salidas quedan copiadas para el SUMMARY. Después de migrar todo da VERDE: las 17 rutas usan negocioDelDueno, con 0 filas responden lo de hoy y con error lo de DC-1/DC-2/DC-4. Las suites db existentes siguen en verde. Hay 2 commits (test RED + fix).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: server actions de /web al helper (fin de la excepción DC-5) + evidencia completa</name>
  <files>test/panel-negocio-gate.test.ts, app/(dashboard)/web/_landing-actions.ts</files>
  <behavior>
    - Gate A sin la excepción de `_landing-actions.ts`: se saca de EXCEPCIONES (single) y de EXCEPCIONES_LECTURA, y se suma a ESPERADOS. ROJO esperado con el código viejo: los tres chequeos (helper, single y lectura) nombran SÓLO app/(dashboard)/web/_landing-actions.ts.
    - Después del arreglo: saveLandingDraft, publishLanding y discardLandingDraft resuelven con negocioDelDueno y sus mismas columnas. Sin negocio devuelven `{ ok:false, error:'no_business' }` como hoy; con error de lectura, `{ ok:false, error:'server_error' }` (DC-3). Los 3 updates siguen por `.eq('id', business.id)`, y el ancla de gate B de exactamente 3 mutaciones en ese archivo sigue en verde.
    - EXCEPCIONES queda vacío. Su test de vigencia se mantiene, con un comentario de que está vacío a propósito desde 261124-ubl y que sumar una excepción es una decisión. EXCEPCIONES_LECTURA queda sólo con cancel-link.
  </behavior>
  <action>
`git status` antes de editar.

RED (D-05). En test/panel-negocio-gate.test.ts, aplicar los cambios de las excepciones de <behavior>. Correr `./node_modules/.bin/vitest run --project pure test/panel-negocio-gate.test.ts`: ROJO nombrando sólo `_landing-actions.ts`. Copiar la salida. Commit `test(quick-261124-ubl): …`.

GREEN (D-01, DC-3). En app/(dashboard)/web/_landing-actions.ts, en cada una de las 3 actions:
- Reemplazar sólo el bloque del paso 4 por `negocioDelDueno(supabase, user.id, '<mismas columnas: id, has_web_custom | id, has_web_custom, landing_draft | id, has_web_custom, landing_config>')`.
- Mapear: sin-negocio → no_business; error → server_error. Después, `const business = negocio.business`.
- Import del helper.
- Actualizar el comentario de cabecera (b) en español, que hoy describe la resolución con single: ahora es el helper, el más viejo, el mismo que el panel.
- No tocar el entitlement, el parse, los updates ni el try/catch.

Correr el gate: VERDE. También `./node_modules/.bin/vitest run --project pure test/landing-write.test.ts test/catalog-public.test.ts`, si existen y leen ese archivo, para confirmar que siguen verdes. Commit `fix(quick-261124-ubl): …`.

Evidencia final (D-07):
- `./node_modules/.bin/tsc --noEmit`: 0. Si se queda sin heap, reportarlo con la salida; no cambiar tsconfig.
- `npm test` completo. Antes, mirar la hora AR: hay 2 canarios de reloj que fallan a propósito fuera de [01:00, 23:30]. Confirmar que el carril db corrió (archivos y tests del proyecto db en la salida, sin skip de dueno-con-dos-negocios).
- `./node_modules/.bin/eslint` sobre los mismos archivos del baseline más test/dueno-con-dos-negocios.test.ts, comparando con el baseline: 0 problemas nuevos.
- `npm run build`: 0.
- `git diff --stat <primer commit de este quick>^ HEAD -- package.json package-lock.json supabase/ next.config.ts lib/negocio-del-dueno.ts lib/onboarding-alta.ts lib/overlay-history.ts lib/dirty-history.ts scripts/con-turno.mjs "app/(onboarding)" app/api/payment app/api/subscription/webhook app/api/onboarding "app/[slug]" lib/booking-core.ts`: vacío (D-04).

Ninguno de estos comandos levanta navegador ni servidor de pruebas, así que no pasan por con-turno.

En el SUMMARY:
- los ROJOS copiados de las 3 tareas;
- la tabla de respuestas por ruta;
- el relevamiento de D-02, D-03 y D-04, con lo verificado y lo que no se tocó;
- los riesgos aceptados.
  </action>
  <verify>
    <automated>./node_modules/.bin/vitest run --project pure test/panel-negocio-gate.test.ts && ./node_modules/.bin/tsc --noEmit && npm test && npm run build</automated>
  </verify>
  <done>Se vio el ROJO del gate con la excepción quitada, nombrando sólo `_landing-actions.ts`. Las 3 actions usan negocioDelDueno con el mapeo de DC-3, y el gate queda VERDE sin excepciones de single y con cancel-link como única excepción de lectura. tsc da 0, npm test queda verde con el carril db corriendo de verdad, eslint no muestra problemas nuevos y el build da 0. El diff de los archivos prohibidos está vacío. Hay 2 commits (test RED + fix).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| navegador del dueño → route handlers / server actions | la sesión (cookies) es lo único confiable; ningún business_id del body ni de la query |
| route handler → Supabase (cliente de sesión, RLS) | la resolución del negocio corre siempre con anon key + cookies; RLS `owner access` acota a los negocios del dueño |
| route handler → Supabase (service role) | sólo donde ya existía (getBusinessSecrets, admin de subscription/*, notify/cancel, appointments/delete, google/sync), siempre keyed por el id resuelto con la sesión |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ubl-01 | Tampering | app/api/mercadopago/disconnect (UPDATE sólo por owner_id) | medium | mitigate | `.eq('id', biz.id).eq('owner_id', user.id)` (Task 1) + gate B en todo el fuente + prueba db que verifica que bizA2 y bizB quedan intactos |
| T-ubl-02 | Elevation of Privilege | resolución del negocio en 18 rutas + 3 actions | high | mitigate | negocioDelDueno siempre con el cliente de sesión y `user.id` de `auth.getUser()`, nunca del body ni service role. RLS + `order/limit(1)` sólo eligen entre negocios del MISMO dueño. Gate A exige el helper en las rutas de ESPERADOS |
| T-ubl-03 | Information Disclosure | respuestas de error nuevas | low | mitigate | códigos fijos (`read_failed`, `server_error`, texto fijo en subscription/*), nunca `error.message`. El helper loguea sólo `code ?? message` |
| T-ubl-04 | Tampering | una ruta escribe en un negocio distinto del que muestra el panel | medium | mitigate | un solo helper para panel y APIs (mismo orden). Gate A de lectura impide una resolución propia por owner_id fuera del helper. cancel-link es una excepción vigilada que usa el mismo orden |
| T-ubl-05 | Tampering | empate de created_at (nullable) entre negocios del mismo dueño | low | accept | DEFAULT now(): la app no puede crear dos negocios del mismo dueño con el mismo timestamp. Cambiar el helper queda fuera de alcance (DC-5) |
| T-ubl-06 | Spoofing | webhooks de pago y de suscripción | low | accept | no se tocan: resuelven por slug o ids de MP con firma, no por sesión. El diff vacío lo verifica (Task 3) |
| T-ubl-07 | Tampering | fixtures db con service role | low | mitigate | service role sólo para sembrar, limpiar y hacer el check independiente del efecto. La llamada a la ruta va con la sesión real de A. Limpieza con cleanupOrThrow + teardown, sin reset de la base |
</threat_model>

<verification>
- Los 3 ROJOS quedaron copiados en el SUMMARY: gate B nombra sólo el disconnect; gate A nombra las 17 rutas y después sólo `_landing-actions.ts`; db da 404 en disconnect y en clients/create; oauth-return-routes registra single.
- `./node_modules/.bin/vitest run --project pure test/panel-negocio-gate.test.ts test/oauth-return-routes.test.ts`: verde.
- `./node_modules/.bin/vitest run --project db test/dueno-con-dos-negocios.test.ts`: verde y no skipped.
- `./node_modules/.bin/tsc --noEmit`: 0. `npm test`: verde, con el carril db corriendo. `npm run build`: 0. eslint sin problemas nuevos frente al baseline.
- Diff vacío en los archivos prohibidos y en los que D-04 deja fuera.
</verification>

<success_criteria>
- Un dueño con 2+ negocios crea turnos, clientes y abonos, exporta e importa, conecta y desconecta Google/MP, gestiona la suscripción y guarda/publica la web sobre el negocio que ve en el panel (el más viejo). Ninguna escritura toca el otro negocio.
- Ningún `.update/.delete/.upsert` sobre businesses filtra sólo por owner_id, y el gate lo impide a futuro.
- El lado servidor del panel no tiene resoluciones propias por owner_id fuera del helper, salvo cancel-link, que está justificada y vigilada.
- Sin dependencias nuevas ni migraciones.
</success_criteria>

<output>
Crear `.planning/workstreams/onboarding/quick/261124-ubl-duenos-con-dos-o-mas-negocios-rutas-de-e/261124-ubl-SUMMARY.md` al terminar
</output>
