# Quick 261119-q8v: Onboarding — paso 5 opcional de integraciones - Research

**Researched:** 2026-11-19
**Domain:** Next 16 App Router (ruta nueva en `(onboarding)`) + OAuth de MercadoPago Connect y Google Calendar (destino de vuelta con lista cerrada)
**Confidence:** HIGH (todo sale de código leído en esta sesión; los pocos `[ASSUMED]` están en el log)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Es el **paso 5 del stepper** (canchas: el 4 visible, porque no tiene Profesionales): los pasos anteriores aparecen
  tildados y **no hay «Atrás»**: el negocio ya existe; los datos se editan desde el panel.
- CTA principal «Ir al panel» (siempre habilitado: todo es opcional). Cada tarjeta tiene su botón de conectar.
- La pantalla tiene **ruta propia**: `/onboarding/integraciones`, accesible para el dueño con negocio ya creado.
- Se ofrece sólo durante el onboarding: no se linkea desde el panel; después de «Ir al panel» las integraciones
  viven en Negocio → Integraciones (como hoy). Sin columna ni tabla nueva en la base para esto (si hace falta
  distinguir «ya entró al panel», preferir algo sin migración; si la única forma correcta requiere migración, PARAR
  y consultar).
- La vuelta de los dos OAuth (`?mp=connected|error`, `?google=connected|error`) debe aterrizar en
  `/onboarding/integraciones` cuando el OAuth se inició desde ahí.
- MercadoPago: **siempre**, con una aclaración: sirve para cobrar señas al reservar; si no se piden, se puede saltear.
- Seguridad (no negociable): el destino de vuelta del OAuth sale de una **lista CERRADA** de tokens
  (`'negocio' | 'agenda' | 'onboarding'`), nunca de un path crudo del cliente (anti open-redirect T-05-02, ya aplicado
  en Google). MercadoPago hoy vuelve fijo a `/negocio`: sumarle el mismo mecanismo de lista cerrada (cookie con
  token, validada en el callback).
- El `state` anti-CSRF de cada OAuth queda como está. El negocio se resuelve por `owner_id` de la sesión, como hoy.

### Claude's Discretion
- Cómo saber en `/onboarding/integraciones` qué está conectado (leer el estado real del server, no fiarse del
  `?mp=connected` de la URL).
- La ruta exacta de redirección en `handleFinish` y cómo se arma el stepper del paso 5 reutilizando el componente.
- El texto final de las tarjetas y del error, respetando el tono del panel (español rioplatense, directo).

### Deferred Ideas (OUT OF SCOPE)
- (Ninguna listada en CONTEXT.md.)
</user_constraints>

## Summary

La ruta nueva **no necesita tocar el proxy**. `/onboarding` ya está en `KNOWN_PREFIXES` (match por segmento) y en
`DASHBOARD_ROUTE_PREFIXES` (match por prefijo pelado), así que `/onboarding/integraciones` hereda las dos cosas: pasa por
`updateSession` y sin sesión rebota a `/login` [VERIFIED: lib/auth/route-lists.ts:34-56, 74-86, 97-125]. Hoy nadie
redirige al dueño **con** negocio que entra a `/onboarding`: la página es un Client Component sin guard y `updateSession`
sólo rebota auth-routes (`['/login', '/register']`) [VERIFIED: lib/supabase/middleware.ts:33-43]. El guard «sin negocio →
/onboarding» vive en cada server page del panel y en `app/(dashboard)/layout.tsx:54`; la ruta nueva tiene que hacer el
inverso por su cuenta (server page: sin user → `/login`, sin negocio → `/onboarding`).

En los OAuth, Google ya tiene el patrón (token `from` → cookie `g_oauth_from` → callback mapea contra lista cerrada) pero
**binario** (`=== 'negocio' ? 'negocio' : 'agenda'`), y MercadoPago vuelve fijo a `/negocio` en **tres** lugares (connect
sin config, `fail()`, éxito). Lo correcto es un módulo puro chico (`lib/oauth-return.ts`) con el mapa token→path vía
`switch`, que usen los cuatro route handlers, con default por proveedor que preserva el comportamiento de hoy.

El estado «conectado» sale del server: MP = `!!business.mp_user_id && business.mp_connection_status !== 'error'` (la misma
regla que el panel), Google = `getBusinessIntegrationStatus(business.id).google` (booleano, no viaja ningún secreto). La
limpieza de la query **no** debe usar `applyPanelView` (es el escritor del historial del panel, con marcas propias);
en el onboarding alcanza `window.history.replaceState(null, '', pathname)`, que es el patrón documentado de Next 16 y
además es síncrono (resiste el doble efecto del modo estricto).

**Recomendación principal:** server page `app/(onboarding)/onboarding/integraciones/page.tsx` + client
`integraciones-client.tsx`; `lib/oauth-return.ts` puro con test; `handleFinish` → `router.replace('/onboarding/integraciones')`;
el «sólo durante el onboarding» se resuelve **sin migración ni cookie**: la ruta existe para cualquier dueño con negocio y
simplemente no se linkea desde el panel.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Guard de sesión de `/onboarding/integraciones` | Frontend Server (proxy Edge) | Server page | Ya cubierto por `DASHBOARD_ROUTE_PREFIXES`; la page re-chequea `getUser()` |
| Guard «tiene negocio» | Frontend Server (server page) | — | Mismo molde que `negocio/page.tsx:9-15` |
| Estado conectado MP/Google | Frontend Server (server page) | Database (RLS/`business_secrets`) | Se lee del dueño por `owner_id`; al cliente sólo booleanos |
| Destino de vuelta del OAuth | API (route handlers) | — | Token en cookie httpOnly + lista cerrada en el callback |
| Toast de vuelta + limpieza de `?mp=`/`?google=` | Browser | — | Sólo presentación; nunca decide qué está conectado |
| Stepper (pasos visibles por vertical) | Browser | lib puro | Regla de pasos testeable en `lib/` |

## Hallazgos

### 1. El onboarding hoy

- `steps` = `{n:1 'Tu negocio'} {n:2 'Servicios'} {n:3 'Profesionales'} {n:4 'Horarios'}`; `visibleSteps = vertical === 'canchas' ? steps.filter(s => s.n !== 3) : steps` [VERIFIED: app/(onboarding)/onboarding/page.tsx:605-618].
- La navegación usa **posición** en `visibleSteps`: `currentIndex`, `isLastStep = currentIndex === visibleSteps.length - 1` [VERIFIED: page.tsx:674-675]; en el último paso el botón es `handleFinish` con label `'Finalizar y entrar al dashboard'` [VERIFIED: page.tsx:1263-1265]. El subtítulo es `Configurá tu negocio en {visibleSteps.length} pasos` [VERIFIED: page.tsx:725].
- El stepper está **inline** en el render (no es componente): nodo `w-9 h-9 rounded-full`, `step > s.n` → `<Check>`, conector `h-px w-12 sm:w-20 mx-1 sm:mx-2 mb-4` [VERIFIED: page.tsx:731-756].
- `handleFinish`: insert de `businesses` (session client) → logo best-effort → `services` → `professionals` → RPC `save_agenda_blocks` → `linkLeadOnSignup` best-effort → `toast.success('¡Negocio creado con éxito!')` → `router.push('/dashboard')` [VERIFIED: page.tsx:421-600]. No usa `after()`: los best-effort son `try/catch` en el cliente. Los fallos parciales ya tiran su toast y **no** cortan el redirect (el alta no es re-entrante).
- `app/(onboarding)/layout.tsx` sólo cuelga `metadata = { robots: NOINDEX }` y devuelve `children` [VERIFIED: layout.tsx:10-14] → la ruta nueva hereda el noindex. `app/robots.ts:64` ya desautoriza `'/onboarding'` (prefijo, cubre el subpath).
- **No hay unique en `businesses.owner_id`** (sólo FK) [VERIFIED: supabase/schema.sql:983, 2116]: si el dueño vuelve con «Atrás» al wizard y lo completa con otro slug, crea un **segundo** negocio y todos los `.single()` por `owner_id` pasan a fallar. Hoy la red es `businesses_slug_key` (mismo slug → 23505). Por eso conviene `router.replace` (no `push`) al salir del wizard.

**Cómo sumar la ruta:** crear `app/(onboarding)/onboarding/integraciones/page.tsx`. No se toca `route-lists.ts` (y no hay que tocarlo: `test/proxy-auth-routes.test.ts:89` vigila `isDashboardRoute('/onboarding')`). El usuario sin sesión lo corta el Edge; el usuario sin negocio lo corta la page con `redirect('/onboarding')`.

### 2. Los OAuth: lista cerrada en los dos

Estado actual [VERIFIED: leídos completos]:
- `google/connect/route.ts:12-13`: `from = searchParams.get('from') === 'negocio' ? 'negocio' : 'agenda'`; `returnPath = from === 'negocio' ? '/negocio' : '/agenda'`; cookies `g_oauth_state` y `g_oauth_from` con `cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, maxAge: 600, path: '/' }` (línea 22). Si `!googleConfigured()` vuelve a `${returnPath}?google=error`.
- `google/callback/route.ts:15`: `returnPath = request.cookies.get('g_oauth_from')?.value === 'negocio' ? '/negocio' : '/agenda'`; `fail()` y éxito borran `g_oauth_state` y `g_oauth_from`.
- `mercadopago/connect/route.ts`: `if (!mpConnectConfigured()) return NextResponse.redirect(\`${base}/negocio?mp=error\`)` (línea 9); cookie `mp_oauth_state` con los **mismos** atributos (`httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/'`, líneas 17-23). No lee query.
- `mercadopago/callback/route.ts`: `/negocio?mp=error` en `fail()` (línea 17) y `/negocio?mp=connected` en éxito (línea 74); negocio por `.eq('owner_id', user.id)` (líneas 36-41, 47-53); secretos por upsert en `business_secrets`.

**Cambio recomendado** — módulo puro `lib/oauth-return.ts` (sin imports de Next/Supabase, testeable en el carril `pure`):

```ts
// Lista CERRADA de destinos de vuelta del OAuth (anti open-redirect T-05-02). La cookie guarda sólo el
// TOKEN; el path sale de acá. `switch` y no un objeto indexado: `'__proto__'`/`'constructor'` no matchean.
export type OAuthReturnToken = 'negocio' | 'agenda' | 'onboarding'

export function oauthReturnPath(token: OAuthReturnToken): string {
  switch (token) {
    case 'negocio': return '/negocio'
    case 'agenda': return '/agenda'
    case 'onboarding': return '/onboarding/integraciones'
  }
}

/** Normaliza un valor crudo (query o cookie) contra los tokens que ESE proveedor acepta. */
export function resolveOAuthReturn(
  raw: string | null | undefined,
  { allowed, fallback }: { allowed: readonly OAuthReturnToken[]; fallback: OAuthReturnToken },
): OAuthReturnToken {
  return (allowed as readonly string[]).includes(raw ?? '') ? (raw as OAuthReturnToken) : fallback
}
```

- **Google:** `allowed: ['negocio','agenda','onboarding'], fallback: 'agenda'` (preserva el default de hoy).
- **MercadoPago:** `allowed: ['negocio','onboarding'], fallback: 'negocio'`. No conviene aceptar `'agenda'` en MP: la Agenda sólo maneja `?google=` (`agenda-client.tsx:296-304`), así que un `?mp=` ahí queda sin toast y sin limpiar. Es lista cerrada igual; recortarla por proveedor es lo más estricto.
- `mercadopago/connect`: leer `new URL(request.url).searchParams.get('from')` (hoy el handler es `GET()` sin args → pasa a `GET(request: NextRequest)`), resolver token, usarlo también en la rama `!mpConnectConfigured()`, y setear `mp_oauth_from` con los mismos atributos de `mp_oauth_state`.
- `mercadopago/callback`: resolver `returnPath` desde `request.cookies.get('mp_oauth_from')?.value` **antes** de definir `fail()`; usarlo en `fail()` y en el éxito; borrar `mp_oauth_from` en ambos (como Google borra `g_oauth_from`).
- `sameSite: 'lax'` funciona porque la vuelta del proveedor al callback es navegación top-level GET (la cookie viaja). `state` intacto, `redirect_uri` intacto (no cambia la URL del callback; la skill `mercadopago-connect` exige que coincida exacto con la app de MP).
- El panel no cambia: `settings-client.tsx:3956,3963` llama `/api/mercadopago/connect` sin `from` → default `negocio`; `:4023` llama `/api/google/connect?from=negocio`.
- El onboarding llama `/api/mercadopago/connect?from=onboarding` y `/api/google/connect?from=onboarding`.

### 3. Estado «conectado» y vuelta del OAuth

- `negocio/page.tsx:9-22,43-45`: resuelve negocio por `owner_id`, lee `getBusinessSecrets(business.id)` (service role) y pasa `mpConnectEnabled={mpConnectConfigured()}`, `googleEnabled={googleConfigured()}`, `googleConnected={!!secrets.google_refresh_token}` [VERIFIED].
- `settings-client.tsx:2339`: `const mpConnected = !!business.mp_user_id && business.mp_connection_status !== 'error'` (y `:2341` el estado caído). El panel **oculta** la tarjeta de Google si `!googleEnabled` (`:3996`) y el botón de MP si `!mpConnectEnabled` (`:3937`) [VERIFIED].
- **Para la ruta nueva usar `getBusinessIntegrationStatus`**, no `getBusinessSecrets`: devuelve `{ mercadopago, email, recaptcha, google }` booleanos y descarta el valor [VERIFIED: lib/business-secrets.ts:53-79]. Ojo: su `mercadopago` es `mp_access_token != null` (incluye token pegado a mano), **no** la regla del panel. Para MP usar la del panel (`mp_user_id` + `mp_connection_status`), seleccionando esas columnas de `businesses`; para Google usar `.google`.
- Server page (molde):
  ```ts
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: business } = await supabase
    .from('businesses').select('id, vertical, type, mp_user_id, mp_connection_status')
    .eq('owner_id', user.id).single()
  if (!business) redirect('/onboarding')
  const status = await getBusinessIntegrationStatus(business.id)
  // al cliente: canchas (bool), mpEnabled, mpConnected, googleEnabled, googleConnected — nada más
  ```
  `resolveVertical(business)` acepta `{ vertical?, type? }` [VERIFIED: lib/verticals.ts:163] → `isCanchas = resolveVertical(business).key === 'canchas'`.
- **Toast + limpieza:** `applyPanelView` (`lib/panel-history.ts:1138-1205`) es el escritor del historial **del panel**: lee/escribe marcas propias, respeta la «regla 0» de otros dueños y una guarda de consumo en vuelo. No aplica fuera del panel. `vueltaDeOAuthPendiente` (`lib/panel-tabs.ts:180-182`, `query.has('mp') || query.has('google')`) sí es reutilizable tal cual (puro, por presencia).
- Copiar del panel **las dos lecciones medidas**, no el helper:
  1. El toast va en `setTimeout(..., 0)`: el `<Toaster>` está montado en `app/layout.tsx:92` **después** de las páginas, y en un documento nuevo (siempre el caso del retorno del OAuth) un toast pedido en el primer efecto se pierde sin error (`settings-client.tsx:1122-1134`, medido en el plan 04-02).
  2. Leer `window.location.search` en el efecto (no el render) y limpiar **síncrono**, para que la segunda corrida del modo estricto no vea la query y el toast salga una vez.
- Limpieza: `window.history.replaceState(null, '', '/onboarding/integraciones')`. Es el patrón documentado: «`pushState` and `replaceState` calls integrate into the Next.js Router, allowing you to sync with `usePathname` and `useSearchParams`», ejemplo con `replaceState(null, '', newPath)` [CITED: node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:341-412]. `router.replace` también sirve, pero es asíncrono (doble toast en strict mode sin un ref de guarda) y re-renderiza el RSC.
- El error con reintento tiene que ser **inline en la tarjeta** (estado local `mpError`/`googleError` seteado desde la query en el mismo efecto), no sólo toast: el toast dura 4-6 s y la query se borra al instante.

### 4. «Sólo hasta que entre al panel» sin migración

| Opción | Costo | Veredicto |
|--------|-------|-----------|
| **A. La ruta existe para cualquier dueño con negocio; no se linkea desde el panel** | Cero. Un dueño que tipee la URL después ve una pantalla inofensiva: mismos endpoints, mismos datos propios por `owner_id`, CTA al panel | **Recomendada** |
| B. Cookie de sesión `onb_integraciones` puesta en `handleFinish` y borrada en «Ir al panel»; sin cookie → `/dashboard` | Se pierde al cambiar de dispositivo/navegador o al cerrar el navegador, lo que contradice «volver más tarde»; cookie escrita desde el cliente (no httpOnly) o un endpoint nuevo; un estado más para testear | No |
| C. Derivar de datos (antigüedad del negocio, «ya tiene todo conectado») | Heurística frágil; no expresa «entró al panel» | No |

No hace falta migración. Con A, «Ir al panel» es una navegación normal y punto.

### 5. Riesgos / gotchas

- **Next 16 `searchParams` es Promise** en props de page: `searchParams: Promise<{ [key: string]: string | string[] | undefined }>`, se lee con `await` (server) o `use()` (client page) [CITED: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md:67-98]. Recomendación: **no** leerlo en la page (el estado sale de la base) y leer la query en el efecto del cliente.
- **`useSearchParams` + Suspense (G-04-6):** si el cliente usa `useSearchParams`, envolver en `<Suspense>` con un **nodo** de fallback (`<div ... aria-busy="true" />`), no `null` (`negocio/page.tsx:24-36`). Con el diseño recomendado (leer `window.location` en el efecto) no hace falta ni `useSearchParams` ni Suspense.
- **Stepper de 5 nodos desborda a 375px.** Hoy 4 nodos = 4·36 + 3·(48+8) = 312px. Con 5 y el mismo conector: 5·36 + 4·56 = **404px** contra ~343px útiles (`p-4`). Hay que achicar el conector en mobile cuando hay 5 (p. ej. `w-6 sm:w-20` → 5·36 + 4·32 = 308px) o hacerlo `flex-1`. Canchas (4) no cambia.
- **Wizard vs stepper:** si el n=5 se mete en `visibleSteps`, el `isLastStep` del wizard deja de caer en Horarios y el botón Finalizar desaparece. Separar: `wizardSteps` (n 1-4, con el filtro de canchas) para navegar y `stepperSteps = [...wizardSteps, { n: 5, label: 'Integraciones' }]` para pintar y para el subtítulo. Ponerlos en un módulo puro (`lib/onboarding-steps.ts`) y extraer el JSX del stepper a `components/onboarding/onboarding-stepper.tsx` (props `steps`, `current`) para usarlo en las dos pantallas. En integraciones, `current = 5` → los 1-4 salen con `<Check>` por `step > s.n`. Mantener las clases byte a byte.
- **`router.replace` en `handleFinish`** (no `push`): evita que el «Atrás» devuelva al wizard ya usado (ver el riesgo del segundo negocio en §1). Cambiar también el label `'Finalizar y entrar al dashboard'` y los comentarios que dicen «redirect al dashboard». El `toast.success` sobrevive: navegación client-side bajo el mismo root layout.
- **Loading del botón + bfcache:** al tocar «Conectar» se pone `loading` y `window.location.href = '/api/...?from=onboarding'`. Si el dueño vuelve con «Atrás» desde la pantalla de MP/Google, la página puede salir de la bfcache con el botón trabado en «Conectando…». Resetear en `pageshow` con `event.persisted`.
- **Integración no configurada:** si `!mpConnectConfigured()`/`!googleConfigured()` (dev local sin env), el connect devuelve `?…=error` enseguida. Recomendación: ocultar el botón (y la tarjeta de Google) como hace el panel; la tarjeta de MP queda con su aclaración. Ver A2.
- **Tests de fuente que tocan estos archivos:**
  - `test/mp-cobro-callback.test.ts:71-108` importa `GET` de `mercadopago/callback` y mockea `@/lib/mercadopago` con `{ exchangeMpCode, refreshMpToken }`. Si `lib/oauth-return.ts` es un módulo aparte no hace falta tocar el mock; **no** metas el helper dentro de `lib/mercadopago.ts` (el mock lo dejaría `undefined`).
  - `test/panel-tabs.test.ts:621-666` prohíbe `pushState|replaceState|history.back` **sólo** en `settings-client.tsx`, `finances-client.tsx` y `agenda-client.tsx`; el cliente del onboarding no entra. No toques esas tres pantallas.
  - `test/forms-no-get-leak.test.ts` barre **todos** los `.tsx` del repo buscando `<form>` sin `method="post"`. La pantalla nueva no necesita `<form>` (son botones); si se agrega uno, va con `method="post"`.
  - `panel-input-zoom-ios`, `panel-nav-chrome` y `panel-draft-guard-coverage` barren `app/(dashboard)`: no alcanzan a `(onboarding)`.
  - Ningún test lee `app/(onboarding)/onboarding/page.tsx` (grep sin resultados en `test/`).
- **Canarios de reloj:** 2 tests fallan a propósito fuera de [01:00, 23:30] hora AR (memoria del proyecto); mirá el reloj antes de culpar al cambio.
- **`npx tsc` siempre sale 0** en esta máquina (memoria del proyecto): correr `node node_modules/typescript/bin/tsc --noEmit`.

## Don't Hand-Roll

| Problema | No construir | Usar |
|----------|--------------|------|
| Estado conectado | Leer `?mp=connected` de la URL | `businesses.mp_user_id`/`mp_connection_status` + `getBusinessIntegrationStatus().google` |
| Destino de vuelta | Path crudo en query/cookie | Token + `switch` en `lib/oauth-return.ts` |
| Historial en onboarding | `applyPanelView` | `window.history.replaceState(null, '', path)` |
| Logos de MP/Google | SVG nuevos | `/mercadopago-isotipo.png`, `/google-calendar.png` (como `MpLogo`/`GoogleCalendarLogo`, `settings-client.tsx:977-985`, hoy privados del archivo: copiarlos o moverlos a un componente compartido) |

## Package Legitimacy Audit

No se instala ningún paquete. Todo sale del stack existente (Next 16.2.7, `@supabase/ssr`, `sonner`, `lucide-react`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Que MP no acepte el token `'agenda'` (lista cerrada recortada por proveedor) es aceptable para el dueño, que escribió la lista de tres | §2 | Bajo: sigue siendo cerrada; sumar `'agenda'` es una línea |
| A2 | Ocultar botón/tarjeta cuando la integración no está configurada por env no choca con «MP siempre» (la decisión habla de señas, no de env) | §5 | Bajo: en prod las dos están configuradas `[ASSUMED]` |
| A3 | El reset del loading por `pageshow`/bfcache hace falta en los navegadores del dueño | §5 | Bajo: si no hace falta, es código inerte |

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | Vitest 4 (`vitest.config.mts`, `environment: 'node'`, proyectos `pure`/`db`) |
| Quick run | `npx vitest run lib/oauth-return.test.ts test/mp-cobro-callback.test.ts` |
| Full suite | `npm test` (sin navegador → no pasa por `con-turno`) |
| Tipos | `node node_modules/typescript/bin/tsc --noEmit` |

| Comportamiento | Tipo | Archivo |
|----------------|------|---------|
| `resolveOAuthReturn`: tokens válidos, default por proveedor, `'__proto__'`, `'https://evil'`, `''`, `undefined` → fallback; `oauthReturnPath('onboarding') === '/onboarding/integraciones'` | unit | `lib/oauth-return.test.ts` ❌ nuevo |
| MP callback: cookie `mp_oauth_from=onboarding` → 307 a `/onboarding/integraciones?mp=connected`; sin cookie → `/negocio?mp=connected`; cookie basura → `/negocio`; state inválido → `<returnPath>?mp=error`; `mp_oauth_from` borrada | integración con mocks | extender `test/mp-cobro-callback.test.ts` (mismo molde de `fakeSupabase`) |
| MP connect: `?from=onboarding` setea `mp_oauth_from=onboarding` con httpOnly/lax/maxAge 600/path `/`; `?from=agenda` → `negocio` | integración con mocks | `test/oauth-return-routes.test.ts` ❌ nuevo |
| Google connect/callback: `from=onboarding` ida y vuelta; `from=negocio` y default `agenda` sin cambios | integración con mocks (`@/lib/google-calendar`) | mismo archivo nuevo |
| Pasos: `stepperSteps('canchas')` = 4 sin n=3; resto = 5; `wizardSteps` nunca incluye n=5 | unit | `lib/onboarding-steps.test.ts` ❌ nuevo |
| Pantalla a 375px, toast + error inline + reintento, «Ir al panel» | manual/UAT | — (requiere navegador → `node scripts/con-turno.mjs ...`) |

## Security Domain

| ASVS | Aplica | Control |
|------|--------|---------|
| V4 Access Control | sí | Negocio por `owner_id` de la sesión en page y callbacks; `getBusinessIntegrationStatus(business.id)` con id resuelto server-side |
| V5 Input Validation | sí | `from`/cookie normalizados contra lista cerrada (`switch`) |
| V3 Session | sí | `state` CSRF intacto en cookie httpOnly; cookie `*_oauth_from` httpOnly, lax, 600 s |
| V6 Crypto | no | — |

| Amenaza | STRIDE | Mitigación |
|---------|--------|------------|
| Open redirect vía `from` o cookie manipulada | Tampering/Spoofing | Token → path sólo por `switch`; fallback por proveedor |
| Fiarse de `?mp=connected` para mostrar «conectado» | Spoofing | Estado leído de la base en el server |
| Fuga de secretos a la pantalla nueva | Info disclosure | Sólo booleanos al cliente; `getBusinessIntegrationStatus` descarta valores |
| Segundo negocio por «Atrás» al wizard | Tampering (integridad) | `router.replace` en `handleFinish` (red final: `businesses_slug_key`) |

## Sources

- Código leído en esta sesión: `app/(onboarding)/{layout,onboarding/page}.tsx`, `proxy.ts`, `lib/supabase/middleware.ts`, `lib/auth/route-lists.ts`, `app/api/{mercadopago,google}/{connect,callback}/route.ts`, `app/(dashboard)/negocio/page.tsx`, `app/(dashboard)/settings/settings-client.tsx` (960-1144, 2330-2376, 3920-4030), `app/(dashboard)/agenda/agenda-client.tsx:285-304`, `lib/panel-tabs.ts:163-182`, `lib/panel-history.ts:1138-1205`, `lib/business-secrets.ts`, `lib/verticals.ts:163`, `app/page.tsx`, `app/(dashboard)/layout.tsx:42-54`, `supabase/schema.sql`, tests citados.
- Docs de Next instaladas: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, `.../01-getting-started/04-linking-and-navigating.md`.
- Skill `.claude/skills/mercadopago-connect/SKILL.md` (state CSRF, `redirect_uri` exacto).

**Válido hasta:** 2026-12-19 (código interno estable).
