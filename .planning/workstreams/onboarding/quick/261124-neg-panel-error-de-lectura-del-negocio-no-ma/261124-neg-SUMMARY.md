---
phase: quick-261124-neg
plan: "01"
quick_id: 261124-neg
status: complete
subsystem: panel / resolución del negocio del dueño
tags: [panel, onboarding, supabase, maybeSingle, error-boundary, multi-tenant]
requires: []
provides:
  - "lib/negocio-del-dueno.ts: negocioDelDueno (discriminado), negocioDelPanel (wizard si 0 filas, lanza si falla), LecturaDelNegocioFallida, FilaDe<Q>"
  - "components/dashboard/panel-error-de-carga.tsx: aviso con «Reintentar»"
  - "app/(dashboard)/error.tsx: boundary del panel con unstable_retry"
affects:
  - "app/(dashboard)/layout.tsx, app/page.tsx y las 14 page.tsx del panel"
tech-stack:
  added: []
  patterns:
    - "order('created_at', asc).limit(1).maybeSingle() para el negocio del dueño"
    - "retorno anotado con un alias derivado por instantiation expression (FilaDe<Q>) para conservar el tipado de select"
key-files:
  created:
    - lib/negocio-del-dueno.ts
    - components/dashboard/panel-error-de-carga.tsx
    - app/(dashboard)/error.tsx
    - test/negocio-del-dueno.test.ts
    - test/panel-negocio-destinos.test.ts
    - test/panel-negocio-gate.test.ts
  modified:
    - app/(dashboard)/layout.tsx
    - app/page.tsx
    - app/(dashboard)/{abonos,agenda,appointments,clients,clinical-history,consultorios,dashboard,equipo,finances,mas,negocio,servicios,settings,web}/page.tsx
    - test/catalog-public.test.ts
    - test/panel-tabs.test.ts
decisions:
  - "Con 2+ negocios del mismo dueño, el panel usa siempre el más viejo por created_at (layout y pantallas ven el mismo)"
  - "Layout con error de lectura = aviso inline (no throw): el error.tsx del segmento no envuelve a su propio layout"
  - "/ con error de lectura va a /dashboard, nunca al wizard; no se agrega app/error.tsx raíz"
  - "negocioDelDueno/negocioDelPanel llevan retorno anotado con FilaDe<Q>: inferido, tsc incremental se queda sin memoria"
metrics:
  duration: ~25min
  completed: 2026-11-24
plan_head_before: ee32fdd366bf1f31b1a38f8db1911baaeec415ec
actuals:
  tokens: 13700
  tasks: 3
  commits: 7
---

# Quick 261124-neg: el panel no confunde «falló la lectura del negocio» con «no tiene negocio»

Un helper en `lib/negocio-del-dueno.ts` lee el negocio con `order(created_at).limit(1).maybeSingle()` y separa 0 filas (va al wizard) de error (aviso «Reintentar» del panel). Las 16 lecturas (`layout`, `/` y las 14 pantallas) pasan por él, y un gate impide volver a `.eq('owner_id', …).single()`.

## Qué cambió, en criollo

Antes, si Supabase tardaba o fallaba un segundo al leer tu negocio, el panel pensaba que no tenías negocio y te mandaba a crearlo de nuevo. Y si por un bug viejo tenías dos negocios, no entrabas nunca: el panel te mandaba al wizard, el wizard te devolvía al panel, y así.

Ahora:
- **Error de lectura en una pantalla** (por ejemplo `/finances`): se ve «No pudimos cargar esta pantalla» con «Reintentar», dentro del panel (sidebar y barra siguen ahí).
- **Error de lectura en el layout** (pasa en cualquier ruta del panel): se ve «No pudimos cargar tu panel» con «Reintentar», sin el resto del panel.
- **Error de lectura en `/`**: va a `/dashboard`, y el layout decide.
- **0 negocios de verdad**: wizard, como siempre.
- **2+ negocios**: entra, y ve siempre el más viejo (el original).

## Decisiones (DC-1..DC-6)

- **DC-1, el layout muestra el aviso en vez de lanzar.** La doc de Next 16 dice que el `error.tsx` de una carpeta no atrapa los errores del `layout.tsx` de esa misma carpeta. Si el layout lanzara, el dueño vería la pantalla genérica de Next en inglés. Ejemplo: corte de red al entrar a `/agenda` → el layout falla primero → aviso inline en castellano.
- **DC-2, `unstable_retry` en el boundary.** En la versión instalada es `router.refresh()` + `reset()` en una transición (lo verifiqué en `node_modules/next/dist/client/components/error-boundary.js`). `reset` solo no vuelve a pedir datos al server. En el layout, que no tiene boundary, el botón hace `router.refresh()`.
- **DC-3, `/` con error va a `/dashboard` y no se agrega `app/error.tsx` raíz.** Uno raíz cambiaría la pantalla de error de las reservas públicas, el landing, el CRM y el login. No hay loop porque `/dashboard` nunca manda a `/`.
- **DC-4, cada pantalla conserva su tipado.** `'*'` sigue siendo `any`, `'id'` sigue siendo `{ id: any }` y la lista larga de `/web` sigue tipando sus claves. Lo fijan `expectTypeOf` + `tsc`, y lo confirmé con una sonda aparte que da error donde tiene que darlo.
- **DC-5, excepción del gate.** `app/(dashboard)/web/_landing-actions.ts` sigue con el patrón viejo (3 server actions que devuelven `no_business`). Quedó como excepción explícita y el gate falla si deja de matchear.
- **DC-6, el más viejo por `created_at`.** Siempre da el mismo resultado, así que layout y pantallas muestran el mismo negocio. Un duplicado del loop viejo siempre es más nuevo.

## Prueba de mutación del gate (D-08): el rojo contra el código viejo

`./node_modules/.bin/vitest run --project pure test/panel-negocio-gate.test.ts` **antes** de migrar las pantallas (con `finances`, `layout` y `/` ya migrados), commit `197fab1`:

```
× el barrido ve los 16 archivos y cada uno usa el helper
  AssertionError: app/(dashboard)/abonos/page.tsx no resuelve el negocio con negocioDelDueno/negocioDelPanel
× ningún archivo vuelve a `.eq(owner_id).single()`
  + [
  +   "app/(dashboard)/abonos/page.tsx",
  +   "app/(dashboard)/agenda/page.tsx",
  +   "app/(dashboard)/appointments/page.tsx",
  +   "app/(dashboard)/clients/page.tsx",
  +   "app/(dashboard)/clinical-history/page.tsx",
  +   "app/(dashboard)/consultorios/page.tsx",
  +   "app/(dashboard)/dashboard/page.tsx",
  +   "app/(dashboard)/equipo/page.tsx",
  +   "app/(dashboard)/mas/page.tsx",
  +   "app/(dashboard)/negocio/page.tsx",
  +   "app/(dashboard)/servicios/page.tsx",
  +   "app/(dashboard)/settings/page.tsx",
  +   "app/(dashboard)/web/page.tsx",
  + ]
Tests  2 failed | 9 passed (11)
```

Son las 13 pantallas que faltaban, y ninguna otra. Los 8 fixtures y la vigencia de la excepción ya daban verde. Después de migrar, el gate quedó verde (11/11).

Los otros dos tests también nacieron en rojo con commit propio:
- `test/negocio-del-dueno.test.ts` (`e4e7fbf`): `Cannot find package '@/lib/negocio-del-dueno'`.
- `test/panel-negocio-destinos.test.ts` (`cd35f4f`): 2 fallaban. El layout con error daba `REDIRECT:/onboarding`, y `/` con error daba `'/onboarding'` cuando se esperaba `'/dashboard'`.

## Evidencia

| Chequeo | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` (baseline, antes de tocar nada) | 0 |
| `./node_modules/.bin/tsc --noEmit` (final) | 0, y también 0 con `--incremental false` |
| `vitest run --project pure` de los 3 tests nuevos | 3 archivos, 33/33 |
| `vitest run --project pure` completo | 90 archivos; 2139 passed, 3 expected fail, 0 fallos (17:22 AR, dentro de la ventana de los canarios de reloj) |
| `npm test` (pure + db, Supabase local arriba) | 124 archivos; 2447 passed, 4 expected fail, 1 skipped, 0 fallos. El carril `db` corrió de verdad |
| eslint de los 22 archivos del plan + los 2 tests tocados | baseline: 2 errores `react-hooks/purity` (`Date.now` en `dashboard/page.tsx` y `layout.tsx`). Final: los mismos 2 (se corrieron de línea a 38 y 76), 0 warnings, 0 problemas en los archivos nuevos |
| `npm run build` | 0 |
| `git diff` de `package.json`, lock, `supabase/`, `next.config.ts`, `lib/overlay-history.ts`, `lib/dirty-history.ts`, `scripts/con-turno.mjs`, `lib/onboarding-alta.ts`, `app/(onboarding)` desde `ee32fdd` | vacío. Sin dependencias ni migraciones nuevas |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tsc` incremental se quedaba sin memoria con el retorno inferido (DC-4)**
- **Found during:** Task 1
- **Issue:** sin anotación de retorno (como pedía DC-4), `./node_modules/.bin/tsc --noEmit` moría por falta de memoria (`FATAL ERROR: Ineffective mark-compacts near heap limit`) a los ~38 s, incluso con `--max-old-space-size=10000`. Con `--incremental false` daba 0. El modo incremental expande el tipo genérico entero de postgrest cuando guarda la firma del archivo en `.tsbuildinfo`.
- **Fix:** el retorno quedó anotado con un alias corto `FilaDe<Q> = NonNullable<Awaited<ReturnType<typeof consulta.select<Q>>>['data']>[number]`. Sale del mismo `select` del cliente, así que el tipo de cada pantalla no cambia (`'*'` → `any`, `'id'` → `{ id: any }`, sin claves extra). Lo fija `expectTypeOf` y una sonda aparte. El `declare const consulta` lleva un `eslint-disable-next-line` con su motivo (solo existe para el tipo). Se sacaron los `satisfies` porque con el retorno anotado ya no hacen falta.
- **Files modified:** `lib/negocio-del-dueno.ts`
- **Commits:** `bb26ac2`, `c18527e`

**2. [Rule 1 - Bug] Tres gates viejos dependían del patrón que este quick saca**
- **Found during:** Task 3, vitest `pure` completo (4 fallos)
- **Issue:**
  - `test/catalog-public.test.ts` buscaba el select de `/web` desde el primer `from('businesses')` hasta `.single()`. Ahora ese primero es el del upsell (`select('plan').eq('id', …)`).
  - `test/panel-tabs.test.ts` exigía el texto literal `.eq('owner_id', user.id)` en `finances/page.tsx`.
  - `test/panel-nav-chrome.test.ts` mide el primer `<main` del layout, y el aviso inline (que el plan escribía como `<main>`) quedaba primero.
- **Fix:**
  - catalog-public: el ancla ahora es `negocioDelPanel(` … `)`. Sigue exigiendo los dos `*_sort_mode` y nunca `select('*')`.
  - panel-tabs: ahora exige `negocioDelPanel(supabase, user.id, 'id')`, que sigue siendo «el negocio sale del dueño de la sesión».
  - panel-nav-chrome: no se tocó. El envoltorio del aviso inline pasó de `<main>` a `<div>`, con las mismas clases y el mismo aspecto, y quedó un comentario del porqué en el layout.
- **Files modified:** `test/catalog-public.test.ts`, `test/panel-tabs.test.ts`, `app/(dashboard)/layout.tsx`
- **Commits:** `cae2355`, `c18527e`

**3. [Rule 2 - lint] 2 warnings nuevos de `no-unused-vars`**
- `consulta` (solo se usa como tipo) quedó con un disable justificado. En el test, `tres` ahora también se usa como valor (`expectTypeOf(tres.vertical).toBeAny()`). Commit `c18527e`.

**4. Prefijo de commit.** El plan pedía `fix(...)` para la migración de las 13 pantallas. Usé `feat(quick-261124-neg):` porque el orquestador acotó los prefijos a `feat`/`test`.

## Fuera de scope (relevamiento D-06) y follow-up

Ninguno de estos manda a `/onboarding`. Con error o con 0 filas devuelven un error al cliente:
- **Route handlers con `.single()`** que responden 401/403/404 (`not_found`, `no_business`, `Sin negocio`, `Negocio no encontrado`, `not_connected`): `app/api/abonos/cancel`, `abonos/create`, `appointments/cleanup-expired`, `appointments/create`, `appointments/delete`, `clients/create`, `export/clients`, `export/finances`, `google/disconnect`, `google/sync`, `import/clients/confirm`, `import/clients/preview`, `mercadopago/disconnect`, `notify/cancel`, `subscription/cancel`, `subscription/create`, `subscription/status`.
- **Callbacks OAuth** (`api/google/callback`, `api/mercadopago/callback`): con error vuelven con `?google=error` / `?mp=error`.
- `api/abonos/cancel-link/[id]`: ya usa `.limit(2)` con manejo de error.
- `app/(dashboard)/web/_landing-actions.ts`: server actions que devuelven `no_business`. Es la excepción del gate.
- `onboarding/integraciones` (la referencia WR-03), `onboarding/page.tsx` + `lib/onboarding-alta.ts`: no se tocaron.
- El CRM resuelve el negocio por id con service role, no por `owner_id`.

**Follow-up (T-neg-05, aceptado):** un dueño con 2+ negocios ahora **entra** al panel y ve el más viejo, pero esos route handlers y server actions siguen con `.single()`. Cuando guarda algo (crear turno, cliente, abono, exportar, desconectar Google/MP, suscripción, guardar la web) le responden 404/`no_business`. No hay riesgo entre negocios porque fallan cerrado, pero el panel le queda a medias hasta migrarlos a `negocioDelDueno(...)` con el mismo criterio del más viejo. Cuando eso pase, sacar `_landing-actions.ts` de `EXCEPCIONES` en `test/panel-negocio-gate.test.ts`.

## Qué no se pudo comprobar

- **El aviso no se vio en un navegador.** Se verificó por estructura: los tests inspeccionan el árbol que devuelve el server component (`PanelErrorDeCarga` con su título y sin `children`) y la política de destinos. Que se vea bien y que «Reintentar» vuelva a cargar en el navegador real queda como **UAT sugerida**, por ejemplo cortando la red de Supabase con el dev server levantado y entrando a `/finances` y a `/agenda`.
- No se probó contra un dueño real con 2 negocios en la base: se cubrió con el fake del query builder (`order` + `limit(1)` + `maybeSingle`).

## Threat Flags

Ninguna superficie nueva fuera del `<threat_model>`. T-neg-01..04 quedaron mitigadas como pedía el plan: texto fijo sin `error.message`, mensaje genérico en `LecturaDelNegocioFallida`, log solo de `code ?? message`, cliente de sesión con `eq('owner_id', user.id)` y sin reintentos automáticos. T-neg-05 quedó aceptada (ver follow-up).

## Self-Check: PASSED

- Archivos creados presentes: `lib/negocio-del-dueno.ts`, `components/dashboard/panel-error-de-carga.tsx`, `app/(dashboard)/error.tsx`, `test/negocio-del-dueno.test.ts`, `test/panel-negocio-destinos.test.ts`, `test/panel-negocio-gate.test.ts`.
- Commits presentes: `e4e7fbf`, `bb26ac2`, `cd35f4f`, `6aeeec3`, `197fab1`, `cae2355`, `c18527e` (7 = `git rev-list --count ee32fdd..HEAD`).
