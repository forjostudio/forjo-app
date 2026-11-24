---
phase: quick-261124-obs
plan: "01"
type: execute
wave: 1
depends_on: []
quick_id: 261124-obs
files_modified:
  - supabase/migrations/082_businesses_mp_user_id_unique.sql
  - lib/oauth-return.ts
  - app/api/mercadopago/callback/route.ts
  - test/oauth-return-routes.test.ts
  - test/mp-cobro-callback.test.ts
  - supabase/schema.sql
  - test/mp-user-id-unique.test.ts
  - app/(dashboard)/settings/settings-client.tsx
  - app/(onboarding)/onboarding/integraciones/integraciones-client.tsx
  - lib/oauth-return.test.ts
  - test/panel-tabs.test.ts
autonomous: true
# Decisión de producto del dueño, sin requisito numerado. MPCONN-05 (la reconexión sana el flag) vive en el
# MISMO update del callback y NO puede regresionar: lo cuida el test del heal de test/mp-cobro-callback.test.ts.
# El SUMMARY lleva requirements-completed: [].
requirements: [quick-261124-obs]

estimate:
  tokens: 85000
  raw_tokens: 85000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Dos negocios no pueden tener el mismo mp_user_id no nulo: Postgres rechaza el segundo con 23505 aunque el cliente de sesión del segundo dueño NO vea el primer negocio por RLS; varios negocios con mp_user_id NULL conviven; un negocio que vuelve a escribir SU propio mp_user_id (reconexión de la misma cuenta) no choca"
    - "La migración 082 no toca datos: si ya hay duplicados, aborta con RAISE EXCEPTION cuyo mensaje empieza con '082:' y dice cuántas cuentas repetidas y cuántos negocios involucrados hay, sin imprimir valores ni tokens; sobre la base local aplica limpia (log de `supabase db reset` con 'Applying migration 082_businesses_mp_user_id_unique.sql')"
    - "Si el update de businesses del callback devuelve 23505, el dueño vuelve a <destino>?mp=error&motivo=cuenta-en-uso (destino = /negocio u /onboarding/integraciones según la lista cerrada de hoy), las dos cookies del OAuth se borran y NO se escribe nada en business_secrets: si el negocio tenía otra cuenta conectada, conserva su mp_user_id, su mp_connection_status y sus tres secretos"
    - "El callback resuelve el negocio con negocioDelDueno (el más viejo del dueño de la sesión) y el update queda filtrado por ese id Y por owner_id: un dueño con dos negocios actualiza UNO solo"
    - "Cualquier otro error sigue volviendo a ?mp=error sin motivo, como hoy; el chequeo anti-CSRF del state no cambia; motivo sólo puede valer un token de la lista cerrada MP_ERROR_REASONS"
    - "Negocio → Integraciones (toast) y /onboarding/integraciones (toast + aviso en la tarjeta) muestran «Esa cuenta de MercadoPago ya está conectada a otro negocio de Forjo. Conectá otra cuenta o desconectala del otro negocio primero.» para cuenta-en-uso; un motivo inventado cae al error genérico; al terminar, la URL ya no tiene mp, google ni motivo"
    - "El paso manual de prod queda escrito (cabecera de la 082 + SUMMARY): SELECT previo de duplicados, qué hacer si devuelve filas, aplicar DESPUÉS del deploy y la consulta de post-chequeo del índice"
  artifacts:
    - path: "supabase/migrations/082_businesses_mp_user_id_unique.sql"
      provides: "Guarda de duplicados con RAISE EXCEPTION + índice único parcial businesses_mp_user_id_key"
      contains: "businesses_mp_user_id_key"
    - path: "lib/oauth-return.ts"
      provides: "Lista cerrada de motivos (MpErrorReason, MP_ERROR_REASONS, resolveMpErrorReason), copy MP_CUENTA_EN_USO_TEXTO y oauthReturnNotice con el motivo"
      exports: ["MpErrorReason", "MP_ERROR_REASONS", "resolveMpErrorReason", "MP_CUENTA_EN_USO_TEXTO", "oauthReturnNotice"]
    - path: "app/api/mercadopago/callback/route.ts"
      provides: "23505 → ?mp=error&motivo=cuenta-en-uso sin escribir secretos; negocio por negocioDelDueno; update acotado al id"
      contains: "'23505'"
    - path: "test/mp-user-id-unique.test.ts"
      provides: "Carril db: el índice contra el Postgres local con sesiones reales (RLS) y service-role"
      contains: "hasSupabaseCreds"
    - path: "supabase/schema.sql"
      provides: "Espejo quirúrgico del índice de la 082"
      contains: "businesses_mp_user_id_key"
  key_links:
    - from: "app/api/mercadopago/callback/route.ts"
      to: "lib/negocio-del-dueno.ts"
      via: "negocioDelDueno(supabase, user.id, 'id')"
      pattern: "negocioDelDueno\\("
    - from: "app/api/mercadopago/callback/route.ts"
      to: "supabase/migrations/082_businesses_mp_user_id_unique.sql"
      via: "el 23505 del update de businesses sale del índice businesses_mp_user_id_key"
      pattern: "23505"
    - from: "app/api/mercadopago/callback/route.ts"
      to: "lib/oauth-return.ts"
      via: "el motivo del redirect está tipado como MpErrorReason"
      pattern: "MpErrorReason"
    - from: "app/(dashboard)/settings/settings-client.tsx"
      to: "lib/oauth-return.ts"
      via: "resolveMpErrorReason + MP_CUENTA_EN_USO_TEXTO en el efecto de la vuelta; drop con 'motivo'"
      pattern: "drop: \\['mp', 'google', 'motivo'\\]"
    - from: "app/(onboarding)/onboarding/integraciones/integraciones-client.tsx"
      to: "lib/oauth-return.ts"
      via: "oauthReturnNotice(mp, mpConnected, motivo)"
      pattern: "oauthReturnNotice\\(mp, mpConnected, motivo\\)"
---

<objective>
Una misma cuenta de MercadoPago no puede quedar conectada a dos negocios de Forjo (decisión de producto del
dueño, observada en la UAT del quick 261119-q8v). La base pasa a ser la fuente de verdad con un índice único
parcial (migración 082); el callback del OAuth traduce el choque (23505) a un motivo de una lista CERRADA sin
guardar secretos y sin romper la conexión anterior del negocio; las dos pantallas que reciben la vuelta
muestran un mensaje específico.

Purpose: evitar que la seña de un negocio se cobre con credenciales que otro negocio también usa, y que un
dueño con dos negocios escriba la misma cuenta en los dos.
Output: migración 082 + espejo en schema.sql, callback endurecido, copy en panel y onboarding, tests pure y
db, y el paso manual de prod escrito.
</objective>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/workstreams/mp-connect/STATE.md
@.claude/skills/mercadopago-connect/SKILL.md
@.claude/skills/supabase-multitenant-rls/SKILL.md
@.claude/skills/convenciones-forjo/SKILL.md
@supabase/migrations/README.md
@supabase/migrations/080_protect_billing_columns.sql
@supabase/migrations/081_clients_last_name.sql
@app/api/mercadopago/callback/route.ts
@lib/oauth-return.ts
@lib/negocio-del-dueno.ts

<interfaces>
<!-- Lo que el ejecutor necesita sin explorar. Extraído del código actual. -->

lib/negocio-del-dueno.ts (quick 261124-neg, NO se modifica):
  export type NegocioDelDueno<T> = { ok: true; business: T } | { ok: false; reason: 'sin-negocio' | 'error' }
  export async function negocioDelDueno<Q extends string>(supabase: SupabaseClient, ownerId: string, columnas: Q): Promise<NegocioDelDueno<FilaDe<Q>>>
  Cadena que emite: from('businesses').select(columnas).eq('owner_id', ownerId).order('created_at', { ascending: true }).limit(1).maybeSingle()

lib/oauth-return.ts (hoy):
  export type OAuthReturnToken = 'negocio' | 'agenda' | 'onboarding'
  export function oauthReturnPath(token: OAuthReturnToken): string
  export function resolveOAuthReturn(raw: string | null | undefined, policy: OAuthReturnPolicy): OAuthReturnToken   // match exacto con find (anti __proto__)
  export const MP_RETURN, GOOGLE_RETURN
  export type OAuthReturnNotice = 'success' | 'error' | 'unconfirmed' | null
  export function oauthReturnNotice(result: string | null, connected: boolean): OAuthReturnNotice

app/api/mercadopago/callback/route.ts (hoy): fail() redirige a `${base}${returnPath}?mp=error` y borra mp_oauth_state + mp_oauth_from;
  orden: state → getUser → exchangeMpCode → lee negocio (single de PostgREST) → update businesses { mp_user_id, mp_connection_status: 'connected' } filtrado SOLO por owner_id → upsert business_secrets → ?mp=connected.

lib/panel-tabs.ts: vueltaDeOAuthPendiente({ query }) = query.has('mp') || query.has('google')   (NO se modifica)
lib/panel-history.ts: applyPanelView({ ..., drop?: readonly string[] })   (NO se modifica; drop acepta cualquier nombre)

test/helpers/supabase-fixtures.ts: seedTwoTenants(): { admin, emailA, emailB, password, userA, userB, bizA, bizB, ... }; teardown(seeded)
test/env.ts: export const hasSupabaseCreds  (importarlo = marcador del carril db en test/suite-split)
</interfaces>
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): la base rechaza la cuenta repetida y el callback lo traduce a cuenta-en-uso sin tocar la conexión anterior</name>
  <files>supabase/migrations/082_businesses_mp_user_id_unique.sql, lib/oauth-return.ts, app/api/mercadopago/callback/route.ts, test/oauth-return-routes.test.ts, test/mp-cobro-callback.test.ts</files>
  <precondition>El Supabase local de forjo-app está arriba (docker ps lista supabase_db_forjo-app). Antes del reset se verifica que ninguna otra sesión esté corriendo vitest ni supabase (Get-CimInstance Win32_Process sobre node.exe filtrando la línea de comando por vitest o supabase, vía powershell -NoProfile); si hay alguna, NO se resetea y se usa el camino alternativo descripto en la acción.</precondition>
  <read_first>supabase/migrations/080_protect_billing_columns.sql (molde de cabecera y del índice único parcial businesses_mp_plan_id_active_key), supabase/migrations/081_clients_last_name.sql (molde de «Qué NO hace» y de la nota ⚠ de prod), app/api/mercadopago/callback/route.ts, lib/oauth-return.ts, lib/negocio-del-dueno.ts, test/oauth-return-routes.test.ts (fakeSupabase, expectOwnerScoped, dest, expectDeleted), test/mp-cobro-callback.test.ts (describe del heal)</read_first>
  <behavior>
    - Callback con update que devuelve error code '23505' y cookie mp_oauth_from=onboarding → Location /onboarding/integraciones?mp=error&motivo=cuenta-en-uso; sin la cookie de destino → /negocio?mp=error&motivo=cuenta-en-uso; en los dos casos cero upserts a business_secrets y las dos cookies del OAuth borradas
    - Callback con update que devuelve otro error (code '42501') → exactamente /negocio?mp=error, sin motivo, cero upserts
    - Callback sano → el negocio se lee con order created_at ascendente + limit 1 + maybeSingle (nunca el single de PostgREST) y el update queda filtrado por id = biz-1 Y owner_id = user-1; sigue escribiendo mp_connection_status 'connected' (MPCONN-05)
    - Lectura del negocio con error → /negocio?mp=error sin update ni upsert
    - El motivo de cualquier Location del callback, si existe, está en MP_ERROR_REASONS
  </behavior>
  <action>
Orden: primero la migración y la base local, después el código y los tests. Comentarios en español explicando el porqué.

1) Base local, solo lectura primero. Con docker exec sobre supabase_db_forjo-app y psql como postgres, correr la consulta de detección (la misma que va en la cabecera, punto 2-a) contra el Postgres local y anotar el resultado para el SUMMARY: si la UAT del quick 261119-q8v dejó dos negocios locales con la misma cuenta, eso es la medición real del problema.

2) Crear supabase/migrations/082_businesses_mp_user_id_unique.sql (separador con GUION BAJO: con guion el reset la saltea en silencio). Cabecera en el molde de la 080 y la 081:
   a. Contexto: el riesgo (la seña de un negocio cobrada con credenciales que otro también usa; re-autorizar podría invalidar los tokens del primero), observado en la UAT de 261119-q8v, y que el índice es la fuente de verdad porque el cliente de sesión no ve negocios ajenos por RLS y no se mete service role para chequear.
   b. Qué hace: (1) una guarda en un bloque DO que cuenta cuántos mp_user_id no nulos se repiten en public.businesses y cuántos negocios suman entre todos; si la cuenta es mayor que 0, RAISE EXCEPTION con un mensaje que empiece con '082:' y nombre las dos cantidades (nunca los valores ni ningún token), con un HINT que mande a la consulta de la cabecera; (2) CREATE UNIQUE INDEX IF NOT EXISTS "businesses_mp_user_id_key" ON "public"."businesses" ("mp_user_id") WHERE "mp_user_id" IS NOT NULL, mismo molde que businesses_mp_plan_id_active_key de la 080.
   c. Qué NO hace: no toca datos ni elige qué negocio se queda con la cuenta (eso lo decide el dueño); no lleva NOTIFY pgrst porque es sólo un índice y lo hace cumplir Postgres (regla de la 079); no agrega policies; no usa CONCURRENTLY (tabla chica, y CONCURRENTLY no corre dentro de la transacción del SQL Editor).
   d. ⚠ PROD A MANO, DESPUÉS DEL DEPLOY: el código nuevo funciona con y sin el índice (sin él sólo no se rechaza la cuenta repetida), por eso va después. Pasos: (a) consulta previa, escrita literal en la cabecera: seleccionar mp_user_id, count(*) AS negocios y array_agg(id ORDER BY created_at) AS business_ids de public.businesses donde mp_user_id no es nulo, agrupado por mp_user_id con HAVING count(*) > 1 — tiene que dar 0 filas; (b) si devuelve filas, PARAR: el dueño decide qué negocio se queda con la cuenta y el otro la suelta, desde su panel (Negocio → Integraciones → Desconectar) o, si es un dueño con dos negocios (el desconectar de hoy no llega al segundo), con las dos sentencias manuales escritas literal en la cabecera que ponen en NULL el mp_user_id de ESE negocio en businesses y sus tres secretos (mp_access_token, mp_refresh_token, mp_token_expires_at) en business_secrets, las dos filtradas por el id de ese negocio; repetir (a) hasta 0 filas; (c) correr la 082; (d) post-chequeo: pg_indexes con schemaname 'public' e indexname 'businesses_mp_user_id_key' devuelve 1 fila.

3) Validar la 082 en local. Si el precondition dio limpio: supabase db reset con la salida a un log del scratchpad de la sesión, y confirmar que el log dice 'Applying migration 082_businesses_mp_user_id_unique.sql' (no 'Skipping'). Si había otra corrida en curso o el reset no se puede correr sin riesgo: NO resetear; aplicar el archivo entero por stdin a docker exec -i supabase_db_forjo-app psql -U postgres -d postgres -v ON_ERROR_STOP=1 (es idempotente y sólo agrega un índice) y reportarlo en el SUMMARY. Nunca supabase stop, nunca tocar los contenedores de otro proyecto. Si la guarda dispara en local por los datos de la UAT (punto 1), eso es esperable con el camino alternativo: reportarlo y usar el reset.

4) lib/oauth-return.ts: sección nueva «Motivo del error de la vuelta (quick 261124-obs)» con el tipo MpErrorReason = 'cuenta-en-uso' y la lista cerrada MP_ERROR_REASONS (readonly, as const). Comentario: el callback sólo puede emitir un token de esta lista, nunca texto libre; quien lo lee lo normaliza contra la misma lista (eso lo agrega la Task 3). El módulo sigue puro (sin Next ni Supabase).

5) app/api/mercadopago/callback/route.ts:
   - fail pasa a recibir un motivo opcional tipado MpErrorReason: arma ?mp=error y, sólo si viene motivo, agrega &motivo=<token>. Borra las dos cookies del OAuth igual que hoy. NO tocar el chequeo del state, la cookie mp_oauth_state, returnPath ni resolveOAuthReturn (anti-CSRF y anti open-redirect quedan como están).
   - La lectura del negocio pasa a negocioDelDueno(supabase, user.id, 'id') de @/lib/negocio-del-dueno (encaja sin agrandar el scope); si no es ok (sin-negocio o error) → fail() genérico. Comentario citando el quick 261124-neg: con el single de PostgREST, un dueño con dos negocios no podía conectar.
   - El update de businesses (mismo payload de hoy: mp_user_id + mp_connection_status 'connected') queda filtrado por .eq('id', biz.id) Y .eq('owner_id', user.id). Comentario: con sólo owner_id un dueño con dos negocios escribiría la misma cuenta en los dos (y con la 082 eso mismo chocaría); owner_id se mantiene como defensa en profundidad.
   - Si bizErr?.code === '23505': console.error con prefijo [mp/callback] y SÓLO el código (sin el detail de PostgREST), y return fail('cuenta-en-uso') ANTES del upsert de business_secrets. Comentario con la decisión: el único único que este update puede pisar es el de la 082 (sólo escribe mp_user_id y mp_connection_status); el update es atómico, así que la fila conserva su mp_user_id y su estado anteriores, y como se vuelve antes de escribir business_secrets los tokens anteriores quedan intactos: si el negocio tenía otra cuenta conectada, la conserva. Los tokens recién canjeados de la cuenta rechazada se descartan sin persistirse.
   - Cualquier otro bizErr: el log y el fail() genérico de hoy.
   - Actualizar el comentario de cabecera del archivo para nombrar ?mp=error&motivo=cuenta-en-uso.

6) test/oauth-return-routes.test.ts (extender el fake, no reescribir el archivo): fakeSupabase recibe opciones (updateError configurable, lectura del negocio configurable). El eq del select de businesses devuelve un objeto con single (el callback de Google lo sigue usando) Y con order → limit → maybeSingle, registrando cada llamada de la cadena. El update devuelve un builder encadenable cuyo eq registra { op: 'update', args } y se devuelve a sí mismo, awaitable (then) con { error: updateError }. expectOwnerScoped: los eq del select siguen siendo todos ['owner_id', 'user-1'] y los del update deben incluir ['id', 'biz-1'] y ['owner_id', 'user-1'] (un callback que soltara owner_id sigue en rojo, T-q8v-03). Agregar en describe('MP callback') los casos de <behavior>, importando MP_ERROR_REASONS de la lista REAL (no se mockea @/lib/oauth-return).

7) test/mp-cobro-callback.test.ts: adaptar SÓLO el fake del describe del heal a la cadena nueva (select…order…limit…maybeSingle; update con eq encadenable y awaitable). La aserción de mp_user_id '12345' + mp_connection_status 'connected' no cambia.
  </action>
  <verify>
    <automated>npm test -- test/oauth-return-routes.test.ts test/mp-cobro-callback.test.ts lib/oauth-return.test.ts</automated>
    <automated>grep -c "Applying migration 082_businesses_mp_user_id_unique.sql" "$SCRATCHPAD/db-reset-082.log"  # ≥1 ($SCRATCHPAD = el scratchpad de la sesión del ejecutor; en el camino alternativo, el log de psql sin ERROR)</automated>
    <automated>docker exec supabase_db_forjo-app psql -U postgres -d postgres -tAc "select indexdef from pg_indexes where schemaname='public' and indexname='businesses_mp_user_id_key'"  # 1 línea con WHERE (mp_user_id IS NOT NULL)</automated>
    <automated>grep -v '^\s*//' app/api/mercadopago/callback/route.ts | grep -c '\.single()'  # 0</automated>
    <automated>grep -c "negocioDelDueno(" app/api/mercadopago/callback/route.ts  # 1</automated>
    <automated>grep -v '^\s*--' supabase/migrations/082_businesses_mp_user_id_unique.sql | grep -ciE 'delete|truncate'  # 0</automated>
    <automated>./node_modules/.bin/tsc --noEmit</automated>
  </verify>
  <done>La 082 existe con guarda + índice, aplicó en el Postgres local (log o psql) y el índice está en pg_indexes; el callback mapea 23505 a ?mp=error&motivo=cuenta-en-uso sin upsert de secretos, lee el negocio con negocioDelDueno y filtra el update por id + owner_id; los tests del callback (incluido el heal MPCONN-05) pasan; tsc sale 0.</done>
</task>

<task type="auto">
  <name>Task 2: el índice medido contra el Postgres real (sesiones con RLS) + espejo en schema.sql + la guarda probada en rollback</name>
  <files>test/mp-user-id-unique.test.ts, supabase/schema.sql</files>
  <read_first>test/helpers/supabase-fixtures.ts (seedTwoTenants / teardown), test/env.ts, test/service-categories-model.test.ts (molde de cabecera de una suite db: por qué pega a la base, service-role sólo para sembrar), test/agenda-save-blocks-rpc.test.ts (signInWithPassword con anon key), supabase/schema.sql líneas 1805-1850 (bloque de índices)</read_first>
  <action>
1) Crear test/mp-user-id-unique.test.ts en el carril db: importa hasSupabaseCreds de './env' (es el marcador de test/suite-split; sin él la suite corre en paralelo y contamina) y seedTwoTenants/teardown de './helpers/supabase-fixtures'. describe.skipIf(!hasSupabaseCreds). Cabecera en español: por qué este archivo pega contra la base (lo que se promete es que Postgres rechaza aunque RLS esconda el otro negocio; un fake no lo puede probar) y que el service-role se usa SÓLO para sembrar y para el chequeo independiente, nunca para la aserción de RLS. Valor de cuenta único por corrida (prefijo __test_mp_ + 8 caracteres de un randomUUID). Cada caso siembra lo suyo: un beforeEach que, con el admin, pone mp_user_id en NULL en bizA y bizB chequeando el error. Casos:
   a. NULLs múltiples: los dos negocios con NULL conviven y volver a escribir NULL en los dos no da error.
   b. Service-role: A toma la cuenta X sin error; B intenta X y el error.code es '23505' (el índice manda incluso para el service-role).
   c. Sesión real de B (anon key + signInWithPassword con emailB): leer el negocio de A por id devuelve 0 filas (RLS); antes, con el admin, B tiene su propia cuenta Y; el update de B (filtrado por id bizB) a la X de A da '23505'; y el admin confirma que B sigue con Y (conserva la cuenta anterior).
   d. Reconexión de la misma cuenta: la sesión de A vuelve a escribir X en su propio negocio sin error.
   e. Después de que A la suelta (admin pone NULL en A), la sesión de B toma X sin error (el «desconectala del otro negocio primero» del mensaje es cierto).
   afterAll con teardown(seeded) (ya usa cleanupAllOrThrow). Firmar las sesiones con persistSession false.

2) supabase/schema.sql: espejo QUIRÚRGICO (nunca db dump). Insertar, en el formato de pg_dump y con las mismas tres líneas en blanco de separación, después del bloque de "audit_log_created_at_idx" y antes de "conversations_business_idx", la línea: CREATE UNIQUE INDEX "businesses_mp_user_id_key" ON "public"."businesses" USING "btree" ("mp_user_id") WHERE ("mp_user_id" IS NOT NULL); — nada más del archivo se toca. (Observado al planear: el índice de la 080, businesses_mp_plan_id_active_key, no está espejado; queda fuera de este quick y se anota en el SUMMARY.)

3) La guarda de la 082, probada sin dejar rastro. Armar por pipe (no es un archivo del repo) un lote que se manda por stdin a docker exec -i supabase_db_forjo-app psql -U postgres -d postgres -v ON_ERROR_STOP=1: BEGIN; quitar el índice businesses_mp_user_id_key (IF EXISTS); insertar dos negocios descartables (slug '__guard_a' y '__guard_b', name '__guard') con el mismo mp_user_id '__guard_dup'; a continuación el contenido entero del archivo de la 082; ROLLBACK. Guardar la salida en un log del scratchpad. Esperado: psql sale distinto de 0 y el mensaje empieza con '082:' y dice 1 cuenta repetida y 2 negocios, sin el valor '__guard_dup'. Después confirmar con psql que el índice sigue en pg_indexes y que no quedó ningún negocio con slug '__guard_%' (el rollback deshizo todo).
  </action>
  <verify>
    <automated>npm test -- test/mp-user-id-unique.test.ts  # 5 passed, 0 skipped: si sale skipped, la base no estaba y NO cuenta como verde</automated>
    <automated>grep -c '"businesses_mp_user_id_key"' supabase/schema.sql  # 1</automated>
    <automated>grep -c "082:" "$SCRATCHPAD/guard-082.log"  # ≥1, y grep -c "__guard_dup" del mismo log da 0</automated>
    <automated>docker exec supabase_db_forjo-app psql -U postgres -d postgres -tAc "select count(*) from public.businesses where slug like '\_\_guard%'"  # 0</automated>
  </verify>
  <done>La suite db corre (no skipea) y prueba: NULLs múltiples, 23505 con service-role y con la sesión real de B aunque RLS le esconda A, B conserva su cuenta anterior, la misma cuenta se re-escribe sin choque y se libera al desconectar; schema.sql tiene la línea del índice; la guarda abortó con '082:' y las cantidades, sin valores, y la base local quedó como estaba.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: el mensaje de cuenta-en-uso en Negocio → Integraciones y en /onboarding/integraciones, con el motivo fuera de la URL</name>
  <files>lib/oauth-return.ts, app/(dashboard)/settings/settings-client.tsx, app/(onboarding)/onboarding/integraciones/integraciones-client.tsx, lib/oauth-return.test.ts, test/panel-tabs.test.ts</files>
  <read_first>lib/oauth-return.ts (bloque IN-02 de oauthReturnNotice), app/(dashboard)/settings/settings-client.tsx líneas 1098-1136 (efecto de la vuelta del OAuth) y su bloque de imports, app/(onboarding)/onboarding/integraciones/integraciones-client.tsx (efecto de la vuelta + IntegrationCard), lib/oauth-return.test.ts, test/panel-tabs.test.ts líneas 288-297 (espejo volverDelOAuth), 412-436 (lista G-04-8) y 744-771 (candado g)</read_first>
  <behavior>
    - resolveMpErrorReason('cuenta-en-uso') → 'cuenta-en-uso'; cada token de MP_ERROR_REASONS se resuelve a sí mismo
    - resolveMpErrorReason de null, undefined, '', 'Cuenta-En-Uso', ' cuenta-en-uso', 'cuenta-en-uso ', '__proto__', 'constructor', 'inventado', 'cuenta-en-uso&x=1' → null
    - oauthReturnNotice('error', false, 'cuenta-en-uso') → 'cuenta-en-uso'; oauthReturnNotice('error', true, 'cuenta-en-uso') → 'cuenta-en-uso'
    - oauthReturnNotice('error', false, 'inventado') → 'error'; oauthReturnNotice('error', true, 'inventado') → 'success' (como hoy)
    - oauthReturnNotice('connected', true, 'cuenta-en-uso') → 'success'; ('connected', false, 'cuenta-en-uso') → 'unconfirmed'; (null, x, 'cuenta-en-uso') → null; los casos de dos argumentos de hoy no cambian
    - MP_CUENTA_EN_USO_TEXTO no tiene '¿' ni '¡' y contiene 'otro negocio'
    - Espejo del panel: '/negocio?mp=error&motivo=cuenta-en-uso' → '/negocio?tab=integraciones', sin mp, google ni motivo, sin entradas nuevas ni retrocesos
  </behavior>
  <action>
1) lib/oauth-return.ts:
   - resolveMpErrorReason(raw: string | null | undefined): MpErrorReason | null, match exacto contra MP_ERROR_REASONS con find (misma razón que resolveOAuthReturn: con un objeto indexado '__proto__' resolvería a algo).
   - MP_CUENTA_EN_USO_TEXTO = «Esa cuenta de MercadoPago ya está conectada a otro negocio de Forjo. Conectá otra cuenta o desconectala del otro negocio primero.» (una sola fuente para las dos pantallas).
   - OAuthReturnNotice suma 'cuenta-en-uso'. oauthReturnNotice suma un tercer parámetro motivo (string | null, default null, así las llamadas de dos argumentos siguen igual): si result es 'error' y resolveMpErrorReason(motivo) es 'cuenta-en-uso' → 'cuenta-en-uso' sin importar connected; todo lo demás, exactamente como hoy. Ampliar el comentario IN-02 con la decisión: si el negocio ya tenía otra cuenta, la tarjeta sigue diciendo «Conectado» (con la anterior, que el callback no tocó) y el aviso explica por qué la nueva no entró; anunciar «MercadoPago conectado» escondería el rechazo. El motivo sólo cuenta con result 'error'.

2) app/(dashboard)/settings/settings-client.tsx, SÓLO el efecto de la vuelta del OAuth (entre el corte por isNegocio y el cierre con [isNegocio]) y el import de @/lib/oauth-return; nada más del archivo se reformatea:
   - leer motivo de params junto a mp y google;
   - en el setTimeout, con mp === 'error' el toast.error usa MP_CUENTA_EN_USO_TEXTO cuando resolveMpErrorReason(motivo) === 'cuenta-en-uso' y, si no, el texto de hoy 'No se pudo conectar con MercadoPago' (literal, lo exige el candado g); el resto de los toasts no cambia (el panel no adopta oauthReturnNotice: el pedido es que los demás errores sigan como hoy);
   - drop pasa a ['mp', 'google', 'motivo'] con un comentario: el motivo viaja sólo con mp=error y se limpia en la misma escritura. vueltaDeOAuthPendiente no cambia (motivo nunca llega sin mp).

3) app/(onboarding)/onboarding/integraciones/integraciones-client.tsx:
   - en el efecto, leer motivo de la query ANTES del replaceState (que ya limpia la query entera, motivo incluido) y llamar oauthReturnNotice(mp, mpConnected, motivo); Google sigue con dos argumentos;
   - toast: 'cuenta-en-uso' → toast.error(MP_CUENTA_EN_USO_TEXTO); success y error como hoy; el setMpNotice para todo lo que no es success, como hoy;
   - IntegrationCard: prop opcional inUseText y una rama nueva para notice 'cuenta-en-uso' (sólo se ve sin conexión, porque la rama connected va primero): párrafo role="alert" con las mismas clases que el error (text-sm text-destructive) mostrando inUseText (o errorText si no viene) y el Button outline h-11 w-full sm:w-auto con connectLabel, no «Reintentar» (repetir con la misma cuenta vuelve a fallar). Misma estructura y clases que las ramas hermanas. La tarjeta de MP pasa inUseText={MP_CUENTA_EN_USO_TEXTO}; la de Google no.

4) Tests (RED primero: correr los nuevos casos antes de implementar y ver que fallan):
   - lib/oauth-return.test.ts: describe nuevo para resolveMpErrorReason y casos nuevos de oauthReturnNotice con motivo, según <behavior>; los casos existentes no se tocan.
   - test/panel-tabs.test.ts: el espejo volverDelOAuth pasa a drop ['mp', 'google', 'motivo']; en el candado (g), las dos aserciones de drop pasan al texto nuevo y se suman toContain('resolveMpErrorReason(') y toContain('MP_CUENTA_EN_USO_TEXTO') sobre el efecto; en la lista G-04-8 se suma '/negocio?mp=error&motivo=cuenta-en-uso' y la aserción de presencia incluye q.has('motivo'). Las llamadas directas al helper (con drop de dos nombres, líneas ~403/440/449) no se tocan.

5) Evidencia final del quick (antes, comprobar con Get-CimInstance que no hay otro vitest ni otro next build corriendo; si hay, esperar):
   - ./node_modules/.bin/tsc --noEmit (nunca npx tsc);
   - npm test completo; anotar la hora AR: fuera de [01:00, 23:30] fallan a propósito los dos canarios de reloj y no es regresión;
   - ./node_modules/.bin/eslint sobre los archivos tocados, con tabla antes/después; el «antes» se anota corriendo eslint sobre cada archivo ANTES de editarlo (nunca git stash: hay cambios sin commitear de otra sesión en el árbol);
   - npm run build.
   - git add explícito sólo de los archivos de files_modified (nunca -A; nunca test/manual-booking.test.ts, components/dashboard/nuevo-turno-form.tsx, app/api/appointments/create/route.ts, .claude/settings.json ni nada de .planning/workstreams/panel-nav/, que son de otra sesión).
  </action>
  <verify>
    <automated>npm test -- lib/oauth-return.test.ts test/panel-tabs.test.ts test/oauth-return-routes.test.ts</automated>
    <automated>grep -c "drop: \['mp', 'google', 'motivo'\]" "app/(dashboard)/settings/settings-client.tsx"  # 1</automated>
    <automated>grep -c "oauthReturnNotice(mp, mpConnected, motivo)" "app/(onboarding)/onboarding/integraciones/integraciones-client.tsx"  # 1</automated>
    <automated>./node_modules/.bin/tsc --noEmit && npm test && npm run build</automated>
    <automated>./node_modules/.bin/eslint lib/oauth-return.ts lib/oauth-return.test.ts app/api/mercadopago/callback/route.ts "app/(dashboard)/settings/settings-client.tsx" "app/(onboarding)/onboarding/integraciones/integraciones-client.tsx" test/oauth-return-routes.test.ts test/mp-cobro-callback.test.ts test/mp-user-id-unique.test.ts test/panel-tabs.test.ts</automated>
    <human-check>UAT de fin de fase (cualquier prueba con navegador o dev server va por node scripts/con-turno.mjs; nunca matar un next dev ajeno): logueado en local, abrir /negocio?mp=error&motivo=cuenta-en-uso → toast con el texto de cuenta en uso y la URL termina en /negocio?tab=integraciones; /negocio?mp=error&motivo=inventado → «No se pudo conectar con MercadoPago»; /onboarding/integraciones?mp=error&motivo=cuenta-en-uso con MP sin conectar → toast + aviso en la tarjeta con «Conectar con MercadoPago» y URL limpia.</human-check>
  </verify>
  <done>Las dos pantallas muestran el texto de cuenta en uso sólo para el token de la lista cerrada, el resto de los errores sigue igual, el motivo sale de la URL junto con mp; tsc 0, npm test verde (canarios aparte), eslint sin problemas nuevos en los archivos tocados, build ok.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| MercadoPago → callback | code/state y los tokens canjeados llegan de afuera; la cuenta (user_id) la elige quien autoriza en MP |
| navegador → callback | cookies mp_oauth_state / mp_oauth_from editables por el usuario |
| URL de vuelta → UI | ?mp= y ?motivo= son texto que cualquiera puede pegar en un link |
| sesión del dueño → Postgres | cliente de sesión con RLS owner-only; no ve negocios ajenos |
| SQL Editor de prod → base | la 082 la corre el dueño a mano sobre datos reales |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-obs-01 | Spoofing/Tampering | callback MP + businesses.mp_user_id | high | mitigate | Índice único parcial businesses_mp_user_id_key (082); el callback mapea 23505 a cuenta-en-uso y vuelve ANTES de escribir business_secrets: la cuenta ajena nunca queda guardada en un segundo negocio |
| T-obs-02 | Tampering | update de businesses del callback | medium | mitigate | Filtro por id del negocio resuelto con negocioDelDueno + owner_id; un dueño con varios negocios toca uno solo (test de la cadena + test del update) |
| T-obs-03 | Elevation of Privilege | chequeo de duplicados | medium | mitigate | Sin service role en el callback: el rechazo lo hace Postgres sobre el cliente de sesión (RLS intacto); probado con sesión real en test/mp-user-id-unique.test.ts |
| T-obs-04 | Tampering | ?motivo= en la URL | low | mitigate | Lista cerrada MP_ERROR_REASONS con match exacto (find, no objeto indexado); un motivo inventado cae al genérico; el texto mostrado es una constante, nunca el valor de la URL |
| T-obs-05 | Integrity | conexión previa del negocio | medium | mitigate | El update es atómico y el return va antes del upsert: con 23505 el negocio conserva mp_user_id, mp_connection_status y sus tres secretos (test db caso c + test de cero upserts) |
| T-obs-06 | Denial of Service/Integrity | 082 en prod con duplicados | medium | mitigate | Guarda con RAISE EXCEPTION y sin modificar datos; SELECT previo y pasos manuales en la cabecera y en el SUMMARY; se aplica después del deploy porque el código anda con y sin índice |
| T-obs-07 | Information Disclosure | mensaje de la guarda y logs | low | mitigate | El mensaje de la 082 lleva sólo cantidades; el log del callback lleva sólo el código, sin el detail de PostgREST ni tokens |
| T-obs-08 | Information Disclosure | respuesta cuenta-en-uso | low | accept | Revela que esa cuenta de MP ya está en otro negocio de Forjo, pero sólo a quien acaba de autenticarse como dueño de esa cuenta en MP; no revela cuál negocio |
| T-obs-09 | Tampering | re-autorización en MP | low | accept | MP emite tokens nuevos de la cuenta antes de nuestro callback y eso podría rotar los del primer negocio; no se puede evitar desde Forjo (no sabemos la cuenta antes de autorizar). Si pasa, el resolver de v0.23 marca la conexión en error y el banner pide reconectar |
| T-obs-10 | Spoofing | state anti-CSRF | high | mitigate | No se toca: mismos tests de state inválido/ausente de test/oauth-return-routes.test.ts siguen verdes |

Sin instalaciones de paquetes en este quick (no aplica T-SC).
</threat_model>

<verification>
- Task 1: tests del callback verdes (23505 → motivo, cero upserts, update por id + owner_id, heal MPCONN-05), 082 aplicada en local con log o psql, tsc 0.
- Task 2: suite db de la 082 corre sin skipear (5 casos), schema.sql espejado, guarda probada en rollback sin rastro.
- Task 3: copy en las dos pantallas, motivo limpio de la URL, candados de panel-tabs actualizados; evidencia final tsc + npm test + eslint + build.
- Nada fuera de files_modified: git diff --stat de los commits del quick sólo lista esos 11 archivos; app/api/mercadopago/connect/route.ts, app/api/mercadopago/disconnect/route.ts, lib/negocio-del-dueno.ts, lib/overlay-history.ts, lib/dirty-history.ts, scripts/con-turno.mjs, next.config.ts y lib/onboarding-alta.ts sin cambios.
</verification>

<success_criteria>
- Una cuenta de MP no se puede conectar a un segundo negocio: la base lo rechaza y el dueño ve el mensaje específico en el panel y en el onboarding.
- El negocio que tenía otra cuenta conectada la conserva tras el rechazo.
- Un dueño con varios negocios conecta MP en uno solo (el que resuelve negocioDelDueno).
- La 082 aborta con un mensaje claro si hay duplicados y no toca datos; el paso manual de prod está escrito.
- Evidencia: tsc --noEmit 0, npm test verde, eslint sin problemas nuevos, npm run build ok.
</success_criteria>

## Cobertura del pedido

| Ítem del pedido | Dónde |
|-----------------|-------|
| 1. Migración 082: índice único parcial + RAISE EXCEPTION con cantidades, sin tocar datos | Task 1 (archivo + reset), Task 2 (guarda en rollback) |
| 1. Validar con supabase db reset local (o reportar si no se puede sin riesgo) | Task 1, punto 3 + precondition |
| 1. schema.sql espejado | Task 2, punto 2 |
| 1. Paso manual de prod + SELECT previo | Task 1, punto 2-d (cabecera) + `<output>` (SUMMARY) |
| 2. 23505 → ?mp=error&motivo=cuenta-en-uso, sin secretos, sin medio guardado, conserva la cuenta anterior | Task 1, punto 5 + Task 2 caso c |
| 2. Update acotado a biz.id | Task 1, punto 5 |
| 2. negocioDelDueno en vez del single | Task 1, punto 5 |
| 3. Mensaje en Negocio → Integraciones y /onboarding/integraciones; resto igual; motivo fuera de la URL | Task 3 |
| 4. Tests: 23505 con fake, sin secretos, lista cerrada, notice nuevo, carril db de la migración | Tasks 1, 2 y 3 |
| Evidencia: tsc, npm test, eslint, build | Task 3, punto 5 |

Fuera de scope, a propósito: app/api/mercadopago/disconnect/route.ts sigue con el single y el update por owner_id (con dos negocios devuelve 404). No se toca porque el pedido no lo nombra; se anota en el SUMMARY como follow-up, y el camino manual para soltar una cuenta en ese caso queda en la cabecera de la 082.

<output>
Crear `.planning/workstreams/mp-connect/quick/261124-obs-mp-una-cuenta-de-mercadopago-no-puede-qu/261124-obs-SUMMARY.md` con:
- requirements-completed: []
- el resultado de la consulta de duplicados en la base LOCAL (punto 1 de la Task 1) y cómo se validó la 082 (reset con log, o camino alternativo y por qué);
- sección «Paso manual en prod (después del deploy)» con la consulta previa literal, qué hacer si devuelve filas (desconectar desde el panel o las dos sentencias manuales por id del negocio que suelta la cuenta), correr la 082 y el post-chequeo en pg_indexes; aclarar que no hace falta NOTIFY pgrst y que la 082 NO está aplicada en prod;
- observaciones fuera de scope: el disconnect con single (404 con dos negocios) y el índice de la 080 sin espejo en schema.sql;
- evidencia: tsc, npm test (conteos y hora AR), tabla eslint antes/después, build.
</output>
