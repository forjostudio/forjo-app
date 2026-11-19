---
phase: quick-261119-q8v
verified: 2026-11-19T22:56:00Z
status: human_needed
score: 8/8 must-haves verified (por código y tests); 0 fallidos
covered_files:
  - ".planning/workstreams/onboarding/quick/261119-q8v-onboarding-paso-5-opcional-de-integracio/261119-q8v-PLAN.md"
  - ".planning/workstreams/onboarding/quick/261119-q8v-onboarding-paso-5-opcional-de-integracio/261119-q8v-SUMMARY.md"
  - "app/(onboarding)/onboarding/integraciones/integraciones-client.tsx"
  - "app/(onboarding)/onboarding/integraciones/page.tsx"
  - "app/(onboarding)/onboarding/page.tsx"
  - "app/api/google/callback/route.ts"
  - "app/api/google/connect/route.ts"
  - "app/api/mercadopago/callback/route.ts"
  - "app/api/mercadopago/connect/route.ts"
  - "components/onboarding/onboarding-stepper.tsx"
  - "lib/oauth-return.ts"
  - "lib/onboarding-steps.ts"
covered_digest: "v1:sha256:6993c7952971c2d74a9579618adcbf688b3ad0de06505d8192df87e2a1cbf555"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "OAuth real de MercadoPago desde /onboarding/integraciones (éxito)"
    expected: "Vuelve a /onboarding/integraciones, toast 'MercadoPago conectado', tarjeta en 'Conectado', URL sin ?mp="
    why_human: "Requiere la cuenta real de MP y el redirect cross-site; los tests mockean el canje del code"
  - test: "OAuth de MercadoPago cancelado/denegado, y atrás del navegador desde la pantalla de MP"
    expected: "Vuelve con aviso inline + 'Reintentar'; con el atrás el botón no queda en 'Conectando…' (pageshow/bfcache)"
    why_human: "bfcache y el comportamiento del atrás sólo se ven en un navegador real, idealmente el teléfono"
  - test: "OAuth real de Google Calendar (éxito, error y reintento)"
    expected: "Igual que MP: vuelve acá, toast, 'Conectado' o error inline con 'Reintentar'"
    why_human: "Requiere consentimiento real de Google"
  - test: "Layout a 375px"
    expected: "Stepper de 5 nodos (4 en canchas) sin desborde; botones >=44px; las dos tarjetas legibles"
    why_human: "El ancho 308px vs 343px está calculado, no medido; no se abrió navegador"
  - test: "Flujo completo con cuenta nueva: Finalizar -> paso 5 -> atrás -> Ir al panel"
    expected: "Cae en /onboarding/integraciones con toast, pasos 1-4 tildados y 5 activo, sin 'Atrás'; el atrás del navegador no reabre el wizard; 'Ir al panel' lleva a /dashboard"
    why_human: "Navegación con router.replace e historial real; creación de negocio contra Supabase real"
  - test: "Contraste del error inline con la paleta real"
    expected: "text-destructive legible en los temas (themes.css pisa --destructive por tema)"
    why_human: "Juicio visual"
  - test: "Regresión del panel"
    expected: "Conectar MP desde el panel (sin from) vuelve a /negocio; Google desde la Agenda vuelve a /agenda; desde Negocio -> Integraciones vuelve a /negocio"
    why_human: "Cubierto por tests de rutas con mocks, pero el OAuth real sólo se prueba en vivo"
---

# Quick 261119-q8v: Verificación

**Objetivo:** paso 5 opcional de integraciones (MP y Google Calendar) tras crear el negocio: Finalizar crea el negocio y aterriza en `/onboarding/integraciones`, una tarjeta por integración (conectado / sin conectar, MP con aclaración de señas), CTA «Ir al panel», vuelta del OAuth a esa pantalla marcando conectado o mostrando error con reintento, destino por lista CERRADA.

**Veredicto:** el código cumple todos los must_haves. No encontré ningún truth fallido ni blocker. El estado queda `human_needed` porque OAuth real, bfcache y 375px no se pueden comprobar sin navegador/teléfono.

**Re-verificación:** No (verificación inicial). Rango: `dee9f5b..HEAD` (6 commits).

## Verdades observables

| # | Truth | Estado | Evidencia |
|---|-------|--------|-----------|
| 1 | Finalizar crea el negocio igual y va a `/onboarding/integraciones` por `router.replace`, toast, stepper 1-4 tildados + 5 activo (canchas 1-3 + 4), sin «Atrás» | VERIFICADO | `onboarding/page.tsx:595-598` (toast y `router.replace`); el resto de `handleFinish` sólo cambió en comentarios. `lib/onboarding-steps.ts` separa `wizardSteps` (navegación, termina en Horarios) de `stepperSteps` (+n=5); `integraciones-client.tsx` pinta `OnboardingStepper current={5}`, y `current > s.n` tilda los previos. La pantalla no tiene «Atrás» |
| 2 | Tarjetas MP (con aclaración de señas) y Google; «Conectado» o botón según estado real de la base por `owner_id`; «Ir al panel» siempre habilitado | VERIFICADO | `page.tsx`: `.eq('owner_id', user.id)`, `mpConnected = !!mp_user_id && status !== 'error'`, `googleConnected` de `getBusinessIntegrationStatus(business.id)` (presencia, descarta el secreto). Descripción de MP: "Cobrá las señas… si no pedís seña… saltear". «Ir al panel» es un `Link` a `/dashboard`, sin `disabled` |
| 3 | La vuelta vuelve acá con toast y «Conectado»; error inline con «Reintentar»; URL limpia; `?mp=connected` falso no muestra éxito | VERIFICADO (UI por código) | Callbacks usan `oauthReturnPath(resolveOAuthReturn(cookie, preset))` calculado antes de `fail()`, en error y éxito. Client: `replaceState` síncrono, toast diferido, éxito exige `mp === 'connected' && mpConnected`, error setea `mpError`/`googleError` y muestra `role="alert"` + «Reintentar». Comportamiento en navegador real: ver human_verification |
| 4 | Lista CERRADA: MP `negocio\|onboarding` (default negocio), Google `negocio\|agenda\|onboarding` (default agenda); basura -> default; panel y Agenda siguen igual | VERIFICADO | `lib/oauth-return.ts`: `switch` exhaustivo + `find` por igualdad textual (no indexa un objeto, `__proto__` no matchea). Las cookies guardan sólo el token. Los call sites del panel siguen sin `from` (MP -> `/negocio`), Google con `from=negocio`/`from=agenda` |
| 5 | `state` anti-CSRF y `redirect_uri` intactos; negocio por `owner_id`; al cliente sólo booleanos y rubro | VERIFICADO | El diff de las 4 rutas no toca la validación `state !== saved`, `buildMpAuthUrl`/`buildAuthUrl` ni los canjes; `lib/mercadopago.ts` y `lib/google-calendar.ts` sin cambios. Callbacks resuelven biz por `owner_id`. Props del client: `vertical` + 4 booleanos |
| 6 | Integración no configurada oculta su tarjeta; ninguna configurada -> `/dashboard` | VERIFICADO | `page.tsx`: `mpEnabled`/`googleEnabled` desde `mpConnectConfigured()`/`googleConfigured()`; `redirect('/dashboard')` si ambas son falsas; el client renderiza condicionalmente |
| 7 | A 375px el stepper de 5 nodos entra y los botones miden >=44px | VERIFICADO por código, medición pendiente | `onboarding-stepper.tsx`: conector `w-6` si hay >4 nodos (5·36+4·32=308px); botones `h-11` (44px). No medido en navegador -> human_verification |
| 8 | Verde local: suite pure, tsc, eslint, build; nada pusheado | VERIFICADO (lo que corrí yo) | Ver abajo. eslint y build no los re-corrí; se confía en SUMMARY con la salvedad de abajo. No hay migraciones ni dependencias nuevas en el diff |

**Puntaje:** 8/8 verdades verificadas por código (la 3 y la 7 con parte de su comportamiento en human_verification).

## Artefactos

| Artefacto | Estado | Detalle |
|-----------|--------|---------|
| `lib/oauth-return.ts` + test | VERIFICADO | existe, sustantivo, importado por las 4 rutas |
| `lib/onboarding-steps.ts` + test | VERIFICADO | usado por wizard y pantalla nueva |
| `components/onboarding/onboarding-stepper.tsx` | VERIFICADO | usado por wizard y pantalla nueva; reemplaza el stepper inline |
| `integraciones/page.tsx` | VERIFICADO | guard de sesión (`/login`) y negocio (`/onboarding`), estado real |
| `integraciones/integraciones-client.tsx` | VERIFICADO | tarjetas, efecto de vuelta, `pageshow`, CTA |
| `test/oauth-return-routes.test.ts` | VERIFICADO | cubre ida y vuelta de los 4 handlers |
| 4 route handlers | VERIFICADO | usan la lista cerrada, borran ambas cookies en éxito y error |

## Key links

| De | A | Estado |
|----|---|--------|
| connect MP/Google | `resolveOAuthReturn` + presets; cookie con token | CABLEADO |
| callback MP/Google | `oauthReturnPath(resolveOAuthReturn(cookie, preset))` antes de `fail()` | CABLEADO |
| `integraciones-client` | `/api/{mercadopago,google}/connect?from=onboarding` con `window.location.assign` y literal | CABLEADO |
| `handleFinish` | `/onboarding/integraciones` vía `router.replace` | CABLEADO |
| wizard + pantalla | `OnboardingStepper` + `lib/onboarding-steps.ts` | CABLEADO |

Ruteo del Edge: `/onboarding` ya es prefijo conocido (`KNOWN_PREFIXES`) y no está en `AUTH_ROUTE_PREFIXES`, así que un dueño con sesión no rebota a `/dashboard`. La page redirige a `/login` si no hay sesión.

## Flujo de datos (Nivel 4)

| Artefacto | Variable | Fuente | Datos reales | Estado |
|-----------|----------|--------|--------------|--------|
| `integraciones-client` | `mpConnected` | `businesses.mp_user_id`/`mp_connection_status` por `owner_id` | Sí | FLOWING |
| `integraciones-client` | `googleConnected` | `business_secrets.google_refresh_token` (presencia, service role) | Sí | FLOWING |
| `integraciones-client` | `mpError`/`googleError` | `?mp=error`/`?google=error` (sólo dispara aviso, no el estado conectado) | n/a por diseño | OK |

## Spot-checks de comportamiento

| Chequeo | Comando | Resultado | Estado |
|---------|---------|-----------|--------|
| Tests del quick + regresión MP | `./node_modules/.bin/vitest run --project pure lib/oauth-return.test.ts lib/onboarding-steps.test.ts test/oauth-return-routes.test.ts test/mp-cobro-callback.test.ts` | 4 archivos, 64 tests, todos verdes | PASS |
| Tipos | `./node_modules/.bin/tsc --noEmit` | exit 0 | PASS |

No corrí la suite `pure` completa ni `next build`/eslint; dependo de lo que reporta el SUMMARY para esos tres.

## Cobertura de requisitos

Quick task sin IDs en REQUIREMENTS.md; el requisito es la propia tarea (`quick-261119-q8v`): SATISFECHO a nivel de código. Sin requisitos huérfanos.

## Anti-patrones

| Archivo | Patrón | Severidad | Impacto |
|---------|--------|-----------|---------|
| (todos los tocados) | TBD/FIXME/XXX | - | Ninguno encontrado |
| `app/(onboarding)/onboarding/page.tsx` | `Badge` sin uso + `react-hooks/set-state-in-effect` (`setSlug`) | Info | Previos a este cambio según SUMMARY; fuera de alcance |

Sin stubs: los `useState(false)` se llenan desde la vuelta del OAuth y el estado real viene del server.

## Observaciones menores (no bloquean)

- La URL de la pantalla se limpia con `replaceState(null, '', '/onboarding/integraciones')` fijo: correcto para esta ruta.
- Una cookie `*_oauth_from` huérfana (el dueño abandona el OAuth) dura <=10 min y se pisa en el siguiente connect; no hay impacto.
- No hay link desde el panel a la ruta (D-04, opción A): cualquier dueño con negocio puede abrirla por URL; es un diseño aceptado y no expone nada ajeno (negocio por `owner_id`).

## Verificación humana requerida

Ver la lista `human_verification` del frontmatter (7 ítems). Guion detallado de 7 pasos en el SUMMARY («Guion de UAT»).

## Resumen de gaps

Ninguno. Todo lo observable por código y tests se cumple.

---

_Verificado: 2026-11-19_
_Verificador: Claude (gsd-verifier)_
