---
phase: quick-261119-q8v
plan: "01"
quick_id: 261119-q8v
subsystem: onboarding + oauth (MercadoPago Connect, Google Calendar)
status: complete
tags: [onboarding, oauth, open-redirect, stepper, mobile]
requires: []
provides:
  - "lib/oauth-return.ts: lista cerrada del destino de vuelta de los dos OAuth"
  - "lib/onboarding-steps.ts: wizardSteps / stepperSteps"
  - "components/onboarding/onboarding-stepper.tsx: stepper compartido"
  - "/onboarding/integraciones: paso 5 opcional"
affects:
  - app/api/mercadopago/{connect,callback}/route.ts
  - app/api/google/{connect,callback}/route.ts
  - app/(onboarding)/onboarding/page.tsx
tech-stack:
  added: []
  patterns:
    - "token de origen en cookie httpOnly + switch exhaustivo token→path (anti open-redirect)"
    - "estado conectado leído del server; la query del OAuth sólo dispara el aviso y se limpia síncrono"
key-files:
  created:
    - lib/oauth-return.ts
    - lib/oauth-return.test.ts
    - test/oauth-return-routes.test.ts
    - app/(onboarding)/onboarding/integraciones/page.tsx
    - app/(onboarding)/onboarding/integraciones/integraciones-client.tsx
    - lib/onboarding-steps.ts
    - lib/onboarding-steps.test.ts
    - components/onboarding/onboarding-stepper.tsx
  modified:
    - app/api/mercadopago/connect/route.ts
    - app/api/mercadopago/callback/route.ts
    - app/api/google/connect/route.ts
    - app/api/google/callback/route.ts
    - app/(onboarding)/onboarding/page.tsx
decisions:
  - "MP acepta negocio|onboarding (default negocio); Google negocio|agenda|onboarding (default agenda)"
  - "«Sólo durante el onboarding» = la ruta existe y nadie la linkea desde el panel (sin migración)"
  - "Finalizar usa router.replace para que el atrás no reabra el wizard ya usado (riesgo de segundo negocio)"
metrics:
  duration: "~15 min"
  completed: 2026-11-19
actuals:
  tokens: 13900
  tasks: 3
  commits: 6
plan_head_before: dee9f5b
---

# Quick 261119-q8v: Onboarding, paso 5 opcional de integraciones

Al tocar «Finalizar», el wizard crea el negocio como siempre y después hace `router.replace` a `/onboarding/integraciones`. Esa pantalla muestra el stepper con el paso 5 activo, una tarjeta de MercadoPago y una de Google Calendar. Cada tarjeta lee de la base si la integración está conectada y usa el mismo OAuth que el panel. La vuelta del OAuth sale de una lista cerrada de tokens (`lib/oauth-return.ts`), y el `state` anti-CSRF y el `redirect_uri` no se tocaron.

## Commits

| # | Hash | Asunto |
|---|------|--------|
| 1 | 19b0053 | test(quick-261119-q8v): lista cerrada del destino de vuelta del OAuth (rojo) |
| 2 | 66490e6 | feat(quick-261119-q8v): MercadoPago vuelve a /onboarding/integraciones por lista cerrada |
| 3 | 84b88e1 | test(quick-261119-q8v): ida y vuelta de los cuatro route handlers (rojo) |
| 4 | cf71db2 | feat(quick-261119-q8v): Google Calendar vuelve a /onboarding/integraciones por lista cerrada |
| 5 | 5b061c2 | test(quick-261119-q8v): pasos del wizard vs pasos del stepper (rojo) |
| 6 | 16eff1b | feat(quick-261119-q8v): paso 5 Integraciones en el stepper y Finalizar lleva a la pantalla nueva |

Todo está en `main` y no se pusheó nada.

## Gates

| Gate | Resultado |
|------|-----------|
| Suite `pure`, línea base (Paso 0, 19:40 AR) | 77 archivos, 1888 pasan + 3 expected fail, 0 fallos |
| Suite `pure`, final (19:50 AR) | **80 archivos (+3), 1950 pasan (+62) + 3 expected fail, 0 fallos**. Los 62 nuevos: 28 de `oauth-return`, 20 de rutas y 14 de pasos. Las dos corridas cayeron dentro de la ventana de los canarios de reloj |
| Rojo de cada TDD | `oauth-return` y `onboarding-steps` fallaron porque el módulo no existía. `oauth-return-routes` dio 4 rojos (los casos de Google con `onboarding`) y 16 verdes |
| `test/mp-cobro-callback.test.ts` | verde (sigue mockeando `@/lib/mercadopago` entero) |
| `./node_modules/.bin/tsc --noEmit` | exit 0 |
| eslint de los 13 archivos | 12 limpios. `app/(onboarding)/onboarding/page.tsx` tiene 1 error y 1 warning **previos** (ver Desvíos) |
| Greps de los tres `<verify>` | todos OK |
| `npm run build` | exit 0. Lista `ƒ /onboarding/integraciones` |
| `git status` | sólo quedan sin trackear los ajenos (`.claude/settings.json`, `.planning/workstreams/onboarding/quick/`, `panel-nav/.verification-ledger.json`) |

## Decisiones: dónde quedó cada una

- **D-01** (paso 5 sin «Atrás»): `OnboardingStepper` con `current = INTEGRACIONES_STEP.n` en `integraciones-client.tsx`. La pantalla no tiene «Atrás» ni «Cerrar sesión». En canchas se ven 4 nodos.
- **D-02** («Ir al panel» siempre habilitado): es un `Link` a `/dashboard` con `buttonVariants` + `h-11`.
- **D-03** (ruta propia): `app/(onboarding)/onboarding/integraciones/page.tsx`. Sin sesión va a `/login` y sin negocio a `/onboarding`.
- **D-04** (sin migración y sin link desde el panel): opción A del research. El panel no se tocó y la nota de la pantalla remite a Negocio → Integraciones.
- **D-05** (la vuelta aterriza acá): el cliente llama a `?from=onboarding` y los dos callbacks resuelven el destino con `oauthReturnPath(resolveOAuthReturn(cookie, preset))`, tanto en error como en éxito. El cliente limpia la URL síncrono con `replaceState`, muestra el toast diferido y el error inline con «Reintentar».
- **D-06** (MP con la aclaración de señas): la descripción de la tarjeta de MP.
- **D-07** (lista cerrada): `lib/oauth-return.ts`, con un `switch` exhaustivo y los presets `MP_RETURN` y `GOOGLE_RETURN`. Las cookies `mp_oauth_from` y `g_oauth_from` guardan sólo el token.
- **D-08** (`state` intacto y negocio por `owner_id`): la validación de `state`, `buildMpAuthUrl`/`buildAuthUrl` y los canjes quedaron igual. La page resuelve el negocio con `.eq('owner_id', user.id)` y columnas explícitas.
- **A1**: MP no acepta `agenda`. Lo cubre el test (`agenda` → `negocio`).
- **A2**: una integración sin configurar no muestra su tarjeta. Si no hay ninguna configurada, la page redirige a `/dashboard`.
- **Discreción**: el toast de éxito exige además el booleano del server (`mp === 'connected' && mpConnected`), `handleFinish` usa `router.replace` y el botón final ahora dice «Finalizar».

## Desvíos y avisos

1. **eslint de `page.tsx` no queda limpio, pero no es por este cambio.** En `HEAD~6` ese archivo ya daba los mismos 2 problemas: `Badge` importado sin uso (warning) y `react-hooks/set-state-in-effect` en `setSlug(slugified)` (error, línea 204, que pasó a la 206 por los dos imports nuevos). Lo comprobé lintando la versión de `HEAD` por stdin. No los arreglé porque el plan dice «Nada más del wizard se toca» y quedan fuera de alcance. Los otros 12 archivos dan 0 problemas.
2. **Uno de los rojos esperados de la Tarea 2 ya pasaba.** El plan esperaba que «MP connect sin configuración con `?from=onboarding`» fallara contra el código de la Tarea 1, pero la Tarea 1 ya lo implementa, así que nació verde. Los otros 4 casos (Google) sí dieron rojo.
3. **El logo de Google Calendar se agregó en la Tarea 2 y no en la 1.** Si lo dejaba en la Tarea 1 sin usar, eslint tiraba un warning de variable sin uso. Por lo mismo, en la Tarea 1 el estado `googleError` quedó declarado sin leer (`[, setGoogleError]`) hasta que la Tarea 2 cableó la tarjeta.
4. **Cambié el texto introductorio.** No lo fijaba el plan. Puse «Dejá todo listo antes de entrar al panel. Si ahora no podés, lo hacés después.» y no «una, las dos o ninguna», porque con A2 puede aparecer una sola tarjeta.
5. **No se probó en un navegador.** El plan no lo pide: la UAT la hace el dueño en el teléfono después del push. Que el stepper entra a 375px está calculado (5·36 + 4·32 = 308px contra 343px útiles), no medido.
6. Para revisar en la UAT: la pantalla usa `text-destructive` para el error inline, como fija el plan. Según la memoria del proyecto, `themes.css` pisa `--destructive` por tema, así que conviene mirar el contraste del error con la paleta real.

No hubo migraciones, dependencias nuevas, cambios en el panel, `proxy.ts` ni `route-lists.ts`, y nada se pusheó.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del `<threat_model>`. Las mitigaciones con disposición `mitigate` quedaron así:

| Threat | Cómo quedó |
|--------|-----------|
| T-q8v-01 | `switch` y presets. Tests con `__proto__`, URLs, `//` y path crudo |
| T-q8v-02 | Test: con `state` inválido no se llama a `exchangeMpCode` ni a `exchangeCode` |
| T-q8v-03 | Negocio por `owner_id`; la page no lee `searchParams` |
| T-q8v-04 | Al cliente llegan sólo booleanos y la clave del rubro. Los greps confirman que no aparecen `getBusinessSecrets` ni `select('*')` |
| T-q8v-05 | El toast exige el booleano del server |
| T-q8v-06 | `router.replace` |
| T-q8v-07 | Guards de la page |
| T-q8v-08 | Los atributos de las cookies y su borrado están cubiertos por el test de rutas |

## Correcciones del review

El review (`261119-q8v-REVIEW.md`) dio 0 críticos, 3 warnings y 8 info. Se corrigieron los 3 warnings y 4 de los info, con el test en rojo primero cuando se podía testear. Todo está en `main` y no se pusheó nada.

| # | Hash | Asunto |
|---|------|--------|
| 7 | d1c1837 | test(quick-261119-q8v): Finalizar no suelta loading en el exito (rojo, WR-02) |
| 8 | 86d1135 | fix(quick-261119-q8v): Finalizar queda deshabilitado mientras navega al paso 5 (WR-02) |
| 9 | 307ce04 | test(quick-261119-q8v): la page del paso 5 no manda al wizard ante un error de lectura (rojo, WR-03) |
| 10 | 0f4583f | fix(quick-261119-q8v): un error al leer el negocio lleva al panel, no al wizard (WR-03) |
| 11 | e11886d | test(quick-261119-q8v): los callbacks del OAuth filtran por owner_id y cubren state ausente (IN-01) |
| 12 | 48327ea | fix(quick-261119-q8v): el stepper de 5 nodos entra en su contenedor desde sm (WR-01) |
| 13 | 885cc6c | test(quick-261119-q8v): el aviso de la vuelta del OAuth sale del estado del server (rojo, IN-02) |
| 14 | a993213 | fix(quick-261119-q8v): el aviso de la vuelta del OAuth sigue al estado real del server (IN-02) |
| 15 | 5a362f1 | fix(quick-261119-q8v): los botones de las tarjetas pasan a outline; Ir al panel queda como unico primario (IN-04) |
| 16 | 07c2841 | fix(quick-261119-q8v): el ultimo paso del wizard dice Crear mi negocio (IN-08) |

Base: `16eff1b`. `git rev-list --count 16eff1b..HEAD` da 10.

**WR-02 (doble alta con Finalizar).** `handleFinish` ya no tiene `finally`. `loading` se suelta sólo en el `catch` y en la salida temprana del WhatsApp inválido, que antes dependía del `finally` y ahora llama a `setLoading(false)` antes del `return`. En el éxito, el botón sigue deshabilitado hasta que el wizard se desmonta. Lo fija `test/onboarding-finish-loading.test.ts`, que lee el fuente igual que `forms-no-get-leak` y tiene una guarda del recorte para no medir cero. En rojo dio 2 fallas: el `finally` y el `return` del WhatsApp.

**WR-03 (error de lectura → wizard).** La page usa `.maybeSingle()`. Con 0 filas y sin error va a `/onboarding`. Con cualquier error, tanto de red o PostgREST como de 2 o más filas, que con `maybeSingle` también vuelve como error, loguea el código y va a `/dashboard`. **Por qué `/dashboard` y no la pantalla sin estado ni el error boundary:** el wizard no verifica si el usuario ya tiene negocio, así que el único destino prohibido es `/onboarding`. El panel es adonde lleva «Ir al panel» y el paso es opcional, así que saltearlo no pierde nada. Con la pantalla sin estado, las tarjetas dirían «Conectar» aunque la integración pudiera estar conectada, y el callback volvería a fallar en la misma lectura. Con el error boundary, el dueño quedaría frente a una página de error en medio del alta. Queda un residuo fuera de alcance: el `layout` del dashboard todavía usa `.single()` y rebota a `/onboarding` ante un error, pero eso es comportamiento previo del panel, que no se toca en este quick. Lo fija `test/onboarding-integraciones-page.test.ts`, con 4 casos y el `eq('owner_id', 'user-1')` verificado. En rojo fallaron los 2 casos de error, que caían en `/onboarding`.

**WR-01 (stepper desde `sm`).** El conector con 5 nodos pasa a `w-6 sm:w-10 md:w-14`. Con 4 nodos sigue `w-12 sm:w-20`, igual que antes. Lo medí por CDP bajo `con-turno` con la sonda nueva `.planning/debug/probes/q8v-stepper-ancho.mjs`. El esperado se escribió antes de correrla. La sonda usa `next dev` propio en el 3031, la guarda `/login 200`, el login sembrado y el vertical general (5 nodos), y mide el wizard (paso 1) y el paso 5:

| Ancho | Antes (`16eff1b`): contenido / útil · se sale por lado | Después: contenido / útil · aire por lado | scroll horizontal del documento después |
|------|------|------|------|
| 375 | 308 / 343 · −17,5 (cabe) | 308 / 343 · 17,5 | no (375/375) |
| 640 | 689 / 608 · **+40,4** (y el documento scrollea: 664/640) | 546 / 608 · 31,3 | no (640/640) |
| 720 | 689 / 672 · **+8,4** | 546 / 672 · 63,3 | no |
| 768 | 689 / 672 · **+8,4** | 610 / 672 · 31,3 | no |
| 1024 | 689 / 672 · **+8,4** | 610 / 672 · 31,3 | no |

En la variante de después, `scrollWidth ≤ clientWidth` del stepper se cumple en los 10 puntos, 5 anchos por 2 rutas. Las dos corridas dieron `COINCIDE con el esperado` y dejaron los puertos 3031 y 9335 libres. Las etiquetas miden 64+52+78+48+80 = 322 px. En la corrida de antes «Tu negocio» se partía en dos líneas por el apretón. `/onboarding/integraciones` sí renderiza en local, así que hay al menos una integración configurada. La sonda no cubre el caso de canchas (4 nodos), cuyas clases no cambiaron.

**IN-01 (tests de rutas).** El fake registra cada `eq` sobre `businesses` y cada `upsert` de `business_secrets`. En los caminos sanos se exige que todo `eq` sea `('owner_id', 'user-1')`, que haya al menos un select (y el update en MP) y que el upsert vaya a `biz-1`. Hay casos nuevos para MP y Google sin cookie de `state` (error sin canjear) y para `g_oauth_from=__proto__` (vuelve a `/agenda`). Probé una mutación: con `.eq('id', …)` en el callback de Google caen 4 tests. La revertí y verifiqué con `git status` que quedó limpia. **Sobre el caso que «mide cero»:** el archivo no tenía un `?from=agenda` en el connect de Google. Los casos de fallback a `agenda` (sin `from`, `//evil`, `__proto__`) son negativos legítimos, y los que distinguen, `from=onboarding` y `from=negocio`, ya estaban. No había nada que reemplazar.

**IN-02 (avisos coherentes).** Hay un helper puro nuevo, `oauthReturnNotice(result, connected)` en `lib/oauth-return.ts`, con 14 tests. Cuando la base dice conectado, el aviso es de éxito aunque la URL diga `error`. Si no está conectado y vuelve `error`, sale el toast de error y el error inline con «Reintentar». Si no está conectado y vuelve `connected`, no hay toast y se muestra un mensaje neutro inline (`role="status"`): «No pudimos confirmar la conexión con … Si ya la autorizaste, probá de nuevo.», con el botón de conectar. Un valor basura no muestra aviso. Funciona igual para Google.

**IN-04.** Los botones de las tarjetas («Conectar…» y «Reintentar») pasan a `variant="outline"`. «Ir al panel» queda como único primario.

**IN-08.** El último paso del wizard dice «Crear mi negocio». El texto de carga sigue en «Guardando...».

### Gates de las correcciones

| Gate | Resultado |
|------|-----------|
| Suite `pure` (20:15 AR, dentro de la ventana de los canarios) | **82 archivos (+2), 1976 pasan (+26) + 3 expected fail, 0 fallos** |
| `./node_modules/.bin/tsc --noEmit` | exit 0 |
| eslint de los 9 archivos tocados | 8 limpios. `onboarding/page.tsx` sigue con la deuda previa exacta: 1 error `set-state-in-effect` y 1 warning `Badge` |
| `npm run build` | exit 0 y lista `ƒ /onboarding/integraciones`. La primera corrida falló en `app/layout.tsx` porque Turbopack no pudo resolver la fuente de Google Orbitron (`next/font/google`), algo ajeno a este cambio. `fonts.googleapis.com` respondió 200 y la segunda corrida pasó |
| Sonda del stepper (antes / después) | las dos `COINCIDE con el esperado` (tabla de arriba) |

### Diferidos (fuera de alcance de esta corrección)

- **IN-03:** «Conectando…» queda trabado si se aborta la navegación (Esc, stop o sin red). Sólo se cubre bfcache.
- **IN-05:** el wizard anuncia «5 pasos» aunque el entorno no tenga ninguna integración configurada.
- **IN-06:** la ruta no aplica el bloqueo de `plan_status === 'suspended'`.
- **IN-07:** `preload` en los dos lockups contra `priority` en el wizard.
- **IN-02 (c):** `getBusinessIntegrationStatus` ignora el `error` de su consulta. Vive en `lib/business-secrets.ts` y el pedido no lo incluía.
- La deuda previa de eslint en `app/(onboarding)/onboarding/page.tsx` (`Badge` sin uso y `setSlug` dentro de un efecto).
- El residuo de WR-03 en el panel: el `layout` del dashboard con `.single()` rebota a `/onboarding` ante un error de lectura. No se toca en este quick.

## Guion de UAT (en el teléfono, después del push)

1. Con una cuenta nueva, completá el wizard y tocá «Crear mi negocio». El botón tiene que quedar en «Guardando...» y deshabilitado hasta que cambie la pantalla. Tenés que caer en `/onboarding/integraciones` con el toast «¡Negocio creado con éxito!», los pasos 1-4 tildados y el 5 activo (en canchas: 1-3 tildados y el 4 activo), y sin «Atrás».
2. A ≈375px el stepper no desborda, se ven las dos tarjetas y los botones se tocan cómodos. Los botones de las tarjetas son secundarios (outline) e «Ir al panel» es el único primario. Si tenés una tablet o la compu a mano, mirá también el stepper a 640-1024px: con las 5 etiquetas visibles, no tiene que cortarse ningún nodo.
3. Tocá «Conectar con MercadoPago» y autorizá. Tiene que volver a `/onboarding/integraciones` con el toast, la tarjeta en «Conectado» y la URL sin `?mp=`.
4. Repetí el paso 3, pero cancelá o denegá en MP. Si no estaba conectado, tiene que volver con el aviso en la tarjeta y el botón «Reintentar». Si ya estaba conectado, la tarjeta sigue en «Conectado» y no sale ningún error. Probá también el atrás del navegador desde la pantalla de MP: el botón no tiene que quedar en «Conectando…».
5. Hacé lo mismo con Google Calendar.
6. Desde la pantalla de integraciones, el atrás del navegador no tiene que volver al wizard ya completado.
7. Tocá «Ir al panel»: tiene que llevar a `/dashboard`. En Negocio → Integraciones se ve el mismo estado. Conectar MP desde el panel sigue volviendo a `/negocio`, y Google desde la Agenda sigue volviendo a `/agenda`.

## Self-Check: PASSED

- Los 8 archivos creados existen. Lo comprobé con `git show --stat` de cada commit y con el build.
- Los 6 commits existen (`git log --oneline -8`) y `git rev-list --count dee9f5b..HEAD` da 6.
