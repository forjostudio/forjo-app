---
status: investigating
trigger: "Producción 2026-11-19 ~20:55 AR: cuenta nueva → onboarding → «Crear mi negocio» → el botón queda en «Guardando…» para siempre, sin toast de éxito; al recargar vuelve a /onboarding. Vercel: después del último GET /api/onboarding/slug-available (20:54:55) no hay ningún pedido más."
created: 2026-11-19T21:30:00-03:00
updated: 2026-11-24T13:30:00-03:00
goal: find_root_cause_only
---

## Current Focus

bug_class: Heisenbug/Mandelbug (depende del entorno de red/navegador del dueño; el camino determinista local no falla)
hypothesis: H1 — una request de Supabase Auth (refresh en línea o /auth/v1/user) no volvió nunca dentro del lock de auth-js; handleFinish queda en `await supabase.auth.getUser()` sin timeout. Mecanismo reproducido 1/1; disparador de prod sin medir.
test: mediciones de solo lectura en prod (ver Resolution.prod_measurements_proposed)
expecting: negocio inexistente + ausencia de /auth/v1/user y /rest/v1/businesses en los logs de API (o un /auth/v1/token sin respuesta) ⇒ H1 confirmado; negocio existente ⇒ el await trabado es posterior al insert
next_action: el orquestador/dueño corre las queries 1-3 y mira los logs 4-5 de Resolution.prod_measurements_proposed
candidate_causes:
  - "environment: request de auth que no vuelve (red móvil, WebKit/iOS con navigator.locks — bug upstream #936)"
  - "code: cadena de awaits de handleFinish sin timeout + cola en-proceso del lock de auth-js 2.106.2 sin timeout"
  - "code: server action linkLeadOnSignup encolada detrás de una acción del router (sólo si el negocio SÍ existe)"
and_gate: "sí: hace falta (a) una request que no vuelve Y (b) ausencia de timeout en auth-js/handleFinish; sin (b), (a) sería un error visible"

## Symptoms

expected: «Crear mi negocio» → `Guardando…` → toast «¡Negocio creado con éxito!» → `/onboarding/integraciones`.
actual: el botón queda en «Guardando…» indefinidamente; no aparece el toast; al recargar la URL es /onboarding.
errors: ninguno visible reportado (no hay captura de consola del navegador del dueño).
reproduction: cuenta nueva en prod (`/register` → `/login` → `GET /auth/callback 303` → `/dashboard 307` → `/onboarding 200`), completar el wizard, tocar «Crear mi negocio».
started: reportado 2026-11-19 ~20:55 AR con prod en `02c6a17` (quick 261119-q8v recién deployado).

## Esperado (escrito ANTES de medir)

- Si el cuelgue es H1 (promesa de auth pendiente): en local, con un usuario nuevo que entra por login, el
  click en «Crear mi negocio» NO debería colgarse (no hay otra pestaña ni lock retenido): request
  `/auth/v1/user` 200 → `POST /rest/v1/businesses` 201 → toast → `/onboarding/integraciones`. Para que H1
  reproduzca hay que provocar la condición (p. ej. una segunda pestaña/cliente reteniendo el lock
  `lock:sb-…-auth-token`, o un `_initialize` que no termina). Si en el camino normal sí se cuelga sin
  ningún request a Supabase, H1 queda muy fuerte (lock/initialize).
- Si es H2 (quick q8v): el camino normal local se cuelga o queda en «Guardando…» con algún request
  terminado (p. ej. el negocio se crea pero no navega) → debería verse el negocio en la base local y/o un
  error de consola; y con el código de `dee9f5b` NO debería pasar.
- Observación previa a medir: el proxy NO redirige /onboarding → /dashboard cuando el negocio existe
  (sólo `(dashboard)/layout.tsx` redirige /dashboard → /onboarding si NO hay negocio). Recargar estando en
  /onboarding se queda en /onboarding pase lo que pase: "al recargar volvió a /onboarding" NO prueba que el
  negocio no se creó. Para probarlo hay que ir a /dashboard o mirar la base.

## Eliminated

- hypothesis: H2 — algo del quick 261119-q8v (sacar el `finally`, el `return` del WhatsApp, el stepper, router.replace) produce el «Guardando…» sin toast.
  evidence: (a) por lectura: todo lo que corre antes de `toast.success` es idéntico a dee9f5b; sin el toast, la ejecución no pasó la línea 595, y ahí el `finally` viejo tampoco habría corrido (promesa pendiente) — una excepción va al catch con toast.error en los dos códigos; el `return` del WhatsApp muestra toast.error. (b) por medición: 4/4 corridas locales con el código del quick terminan en toast + /onboarding/integraciones.
  timestamp: 2026-11-24T13:25:00-03:00

- hypothesis: H1-pestañas — una segunda pestaña abierta (la del /login o /register) retiene el lock `lock:sb-…-auth-token` y getUser() espera para siempre.
  evidence: auth-js 2.106.2 usa `lockAcquireTimeout` 5000 ms y ROBA el lock al vencer (lib/locks.js), así que entre pestañas la espera máxima es ~5 s, no infinita. Medido: variante `oauth-ish` (segunda pestaña en /login abierta durante el wizard) → éxito, /auth/v1/user 200 en 1046 ms, toast a +1.5 s.
  timestamp: 2026-11-24T13:25:00-03:00

## Evidence

- timestamp: 2026-11-19T21:30:00-03:00
  checked: proxy.ts + lib/supabase/middleware.ts + lib/auth/route-lists.ts + app/(dashboard)/layout.tsx
  found: /onboarding está en DASHBOARD_ROUTE_PREFIXES (sólo exige sesión). Ningún guard manda /onboarding → /dashboard si el negocio existe. El único guard de negocio es `(dashboard)/layout.tsx:54` (`if (!business) redirect('/onboarding')`).
  implication: la recarga en /onboarding no discrimina "negocio creado" vs "no creado". Y los pedidos a Supabase (`/auth/v1/user`, `/rest/v1/businesses`, storage, rpc) NO aparecen en los logs de Vercel: la ausencia de pedidos en Vercel sólo dice que no se llegó a `linkLeadOnSignup` (POST de server action a /onboarding) ni a `router.replace('/onboarding/integraciones')`.

- timestamp: 2026-11-19T21:40:00-03:00
  checked: secuencia de prod `/register → /login → GET /auth/callback 303 → /dashboard 307 → /onboarding` contra app/auth/callback/route.ts + lib/auth/callback.ts
  found: el link de mail (`type=signup`) va directo a `/onboarding`; SÓLO la rama `?code=` (OAuth Google, `exchangeCodeForSession`) va a `/dashboard`. El 303 → /dashboard ⇒ el dueño entró con «Continuar con Google» (PKCE), no con mail+contraseña.
  implication: la sesión de prod es de Google OAuth (cookie posiblemente chunked, con provider_token). En local no hay provider Google: la sonda reproduce la entrada por `/auth/callback` con la rama de mail (verifyOtp server-side) y por login con contraseña.

- timestamp: 2026-11-19T21:45:00-03:00
  checked: `git diff dee9f5b HEAD -- "app/(onboarding)/onboarding/page.tsx"` dentro de handleFinish
  found: los ÚNICOS cambios en handleFinish son (1) `setLoading(false)` en la salida temprana del WhatsApp inválido (que además muestra toast.error), (2) se quitó `finally { setLoading(false) }`, (3) `router.push('/dashboard')` → `router.replace('/onboarding/integraciones')`. Todas las líneas que corren ANTES de `toast.success('¡Negocio creado con éxito!')` (getUser, insert, logo, services, professionals, rpc, linkLeadOnSignup) son idénticas byte a byte.
  implication: el síntoma "sin toast de éxito" significa que la ejecución nunca llegó a la línea 595. Con el código viejo, una promesa pendiente en cualquiera de esos awaits tampoco liberaba (`finally` no corre si la promesa no se resuelve) y una excepción iba al catch con toast.error en ambos códigos. El quick NO puede producir "Guardando… sin toast" — H2 queda refutada por lectura (a confirmar por la sonda: si el camino normal local termina en éxito, el código actual no se cuelga por sí mismo).

- timestamp: 2026-11-19T21:50:00-03:00
  checked: node_modules/@supabase/auth-js 2.106.2 (GoTrueClient.js, lib/locks.js) + supabase-js 2.106.2 + @supabase/ssr 0.10.3
  found: en el navegador el lock es `navigatorLock` (Web Locks) con `lockAcquireTimeout` default 5000 ms y ROBO del lock al vencer (no espera infinita entre pestañas). PERO `_acquireLock` tiene una cola en-proceso (`lockAcquired`/`pendingInLock`) SIN timeout: si una operación dentro del lock no termina (p. ej. un fetch de refresh `_callRefreshToken` / `_recoverAndRefresh` disparado por `visibilitychange` o el tick de auto-refresh), getUser() y getSession() (que usa `fetchWithAuth` del insert) esperan para siempre. Los fetch de auth-js NO tienen timeout. Además `linkLeadOnSignup` (server action) pasa por la cola de acciones del router de Next (`dispatchAction`): espera detrás de cualquier acción pendiente.
  implication: hay al menos tres puntos de cuelgue infinito plausibles (cola de lock de auth, fetch a Supabase sin timeout, cola de acciones del router). Ninguno cambió con el quick.

- timestamp: 2026-11-24T13:20:00-03:00
  checked: sonda `.planning/debug/probes/onb-crear-negocio-colgado.mjs` (next dev propio :3031, Chrome 157 headless por CDP, Supabase LOCAL, usuario NUEVO por corrida, código actual = 02c6a17 sin `finally`)
  found: 3 de 3 corridas del camino normal terminan en ÉXITO:
    - `mail` (registro real → mail de mailpit → `/auth/callback?token_hash&type=signup` 303 → /onboarding), desktop 1024: GET /auth/v1/user 200 (582 ms) → POST businesses 201 (87 ms) → services 201 → professionals 201 → rpc save_agenda_blocks 200 → server action POST /onboarding 200 (1181 ms) → toast «¡Negocio creado con éxito!» a +2.0 s → /onboarding/integraciones a +8.6 s (compilación de dev). Negocio en la base local: sí.
    - `password` (logout + login con contraseña → /dashboard → /onboarding): mismo encadenado, user 167 ms, toast a ~+1 s, integraciones a +4.5 s, negocio sí.
    - `mail mobile` (390×844, mobile:true): user 307 ms, toast a +1.0 s, integraciones a +14.7 s, negocio sí.
    - En las 3, `navigator.locks.query()` muestra `lock:sb-127-auth-token` held sólo en la primera muestra tras el click y libre 0.5-1 s después; 0 requests pendientes al cierre; 0 excepciones de consola.
  implication: con el código actual, en local, el alta NO se cuelga. H2 refutada también por medición (el código del quick completa el alta y navega). El cuelgue de prod necesita una condición del entorno que el camino normal local no tiene.
  nota de método: las corridas 1-5 fallaron por la sonda, no por la app (host 127.0.0.1 vs localhost en el 303 del callback; popup del Select; `scroll-behavior: smooth` corría el rect y el click caía fuera — en la corrida 5 el botón NUNCA pasó a «Guardando…», o sea que no fue un cuelgue). Se corrigió la sonda y se verifica el blanco del click con elementFromPoint.

- timestamp: 2026-11-24T13:26:00-03:00
  checked: variante `oauth-ish` (segunda pestaña en /login abierta durante el wizard) y control `refresh-ok` (en el paso 4 la sonda reescribe la cookie `sb-127-auth-token` con `expires_at` = ahora+30 s, adentro del margen de 90 s → getUser tiene que refrescar EN LÍNEA)
  found: `oauth-ish` → éxito (user 200 1046 ms, toast +1.5 s, negocio sí). `refresh-ok` → éxito y el orden de red lo confirma: POST /auth/v1/token 200 (127 ms) ANTES de GET /auth/v1/user 200 (82 ms) → businesses 201 → … → toast +1.1 s, negocio sí.
  implication: dos pestañas no traban (robo a los 5 s). El refresh en línea ocurre DENTRO de `getUser()` y del lock: si ese fetch no vuelve, todo lo que sigue espera detrás. Falta medir esa rama (variante `refresh-colgado`).

- timestamp: 2026-11-24T13:28:00-03:00
  checked: variante `refresh-colgado` (sesión adelantada a "vence en 30 s" + CDP `Fetch` retiene POST /auth/v1/token sin responder nunca — simula un fetch que no vuelve, p. ej. conexión móvil muerta)
  found: CLICK → «Guardando… [disabled]» durante los 40 s de observación; `lock:sb-127-auth-token` HELD; red desde el click: SÓLO `POST /auth/v1/token` PENDIENTE (+ su OPTIONS); 0 GET /auth/v1/user, 0 POST /rest/v1/businesses, 0 server action; 0 errores de consola; 0 toasts; negocio en la base local: ninguno. Veredicto = colgado (esperado colgado).
  implication: el síntoma de prod se reproduce EXACTO (botón trabado, sin toast, sin negocio, y sin NINGÚN pedido a Vercel) con una sola condición: una request de auth que no vuelve adentro del lock de auth-js. `getUser()` hace el refresh en línea dentro del lock y todo lo demás (getUser, y el `getSession()` que `fetchWithAuth` hace antes de CADA insert/rpc/storage) espera detrás, sin timeout en ninguna capa (ni auth-js, ni supabase-js, ni handleFinish). Es pre-existente: el bloque es idéntico en dee9f5b y el `finally` viejo no corre con una promesa pendiente.

- timestamp: 2026-11-24T18:48:00-03:00
  checked: Opción B (quick 261124-p44): `@supabase/supabase-js` 2.106.2 → 2.118.0 (auth-js sin el mutex de navigator.locks, PR #2392; `@supabase/ssr` 0.10.3 sin opción `lock` → camino por defecto sin lock). Misma sonda con un instrumento aditivo (muestras con `lock:sb-…` held + línea `veredicto getUser` = GET /auth/v1/user entre el click y la liberación del refresh retenido), esperado escrito antes de correr (commit 5932eba). Variantes `mail`, `password`, `oauth-ish`, `refresh-ok`, `refresh-colgado`, de a una por el turno de pantalla.
  found: 5/5 COINCIDE. `mail`, `password`, `oauth-ish`, `refresh-ok` → éxito (salida del wizard a +3.2…+5.4 s, 1 POST businesses, negocio en la base); en las cinco el lock `lock:sb-…` aparece en 0 muestras (antes, con 2.106.2, aparecía held en la primera muestra tras el click). `refresh-colgado` → `error-y-reintento-ok` (aviso + «Reintentar» a +20.7 s, «Atrás» bloqueado 41/41, 0 POST antes de liberar, reintento sin doble negocio) y `veredicto getUser = colgado-detras-del-refresh`: 0 GET /auth/v1/user mientras el POST /auth/v1/token estuvo retenido; el primero salió a +21.1 s, recién después de liberarlo — el mismo +21.1 s medido con 2.106.2. En el código instalado el refresh sigue siendo de una sola vuelta (`refreshingDeferred`) y el fetch de auth no tiene timeout ni AbortSignal.
  implication: en criollo: el bump saca el "candado" del navegador (navigator.locks), que es justo lo que se traba en iPhone/Safari (#936) y en la carrera al cambiar de pestaña; eso NO se puede reproducir en Chrome headless y se confirma sólo en prod. Lo que el bump NO arregla: si el pedido de renovar la sesión se queda sin respuesta (red móvil muerta), getUser sigue esperando detrás de ese pedido, con o sin candado. Por eso la red de 20 s de `lib/con-limite.ts` se queda: es la que suelta el botón y ofrece «Reintentar».

## Resolution

root_cause: |
  NO CONFIRMADO el disparador de prod (INCONCLUSIVE). Confirmado por medición: (1) no es el quick q8v (4/4 + control
  local terminan en éxito con su código; antes del toast el código es idéntico a dee9f5b); (2) el camino normal no se
  cuelga en local (5/5 éxito: mail, password, mobile, dos pestañas, refresh en línea OK); (3) el síntoma exacto se
  reproduce 1/1 cuando una request de Supabase Auth dentro del lock de auth-js 2.106.2 no vuelve nunca: handleFinish
  queda en `await supabase.auth.getUser()` para siempre, y como no hay timeout en ninguna capa el botón no se suelta.
  Candidato principal para prod: una request a Supabase (refresh de token o /auth/v1/user) que no volvió en el
  navegador del dueño (red móvil / WebKit — supabase-js tiene un bug conocido de cuelgue con navigator.locks en iOS
  Safari, #936, cuyo arreglo es la coordinación sin lock de auth-js >= 2.110, PR #2392). Falta medir en prod cuál await
  se trabó.
  Además: la inferencia "recargó y volvió a /onboarding ⇒ no se creó el negocio" NO vale: nada redirige /onboarding →
  /dashboard cuando el negocio existe (sólo `(dashboard)/layout.tsx` redirige al revés).
fix: (no aplica: goal find_root_cause_only)
verification: (no aplica)
files_changed: []
prod_measurements_proposed: |
  (solo lectura, NO ejecutadas)
  1. SQL prod: `select id, created_at, last_sign_in_at, raw_app_meta_data->>'provider' from auth.users where created_at >= '2026-11-19 23:00+00' and created_at < '2026-11-20 01:00+00';` → identificar al dueño.
  2. `select id, slug, created_at from public.businesses where owner_id = '<uid>';` → ¿se creó? Ninguno ⇒ se trabó en getUser/insert (o antes). Existe ⇒ contar services/professionals/time_blocks de ese business_id para ver en cuál await se trabó (si todo está ⇒ fue la server action linkLeadOnSignup / cola del router).
  3. `select created_at, payload->>'action' from auth.audit_log_entries where payload->>'actor_id' = '<uid>' order by created_at;` y `select created_at, updated_at, revoked from auth.refresh_tokens where user_id = '<uid>' order by id;` → hora del login de Google y si hubo token_refreshed ~20:55 AR.
  4. Supabase Dashboard → Logs → API/Edge 20:50-21:05 AR, filtrar por la IP del dueño: ¿llegaron /auth/v1/token, /auth/v1/user, /rest/v1/businesses, /storage/v1/object/logos? (presente = el navegador lo mandó; ausente = nunca salió).
  5. Vercel: User-Agent de los GET /api/onboarding/slug-available de 20:54 (¿iOS/WebKit? ¿Android Chrome? ¿webview in-app?).
  6. Preguntarle al dueño: dispositivo y navegador, si cambió de app entre pasos, si subió logo, cuánto esperó.
