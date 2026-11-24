---
phase: quick-261124-neg
plan: "01"
type: execute
wave: 1
depends_on: []
quick_id: 261124-neg
files_modified:
  - lib/negocio-del-dueno.ts
  - test/negocio-del-dueno.test.ts
  - test/panel-negocio-destinos.test.ts
  - test/panel-negocio-gate.test.ts
  - components/dashboard/panel-error-de-carga.tsx
  - app/(dashboard)/error.tsx
  - app/(dashboard)/layout.tsx
  - app/page.tsx
  - app/(dashboard)/abonos/page.tsx
  - app/(dashboard)/agenda/page.tsx
  - app/(dashboard)/appointments/page.tsx
  - app/(dashboard)/clients/page.tsx
  - app/(dashboard)/clinical-history/page.tsx
  - app/(dashboard)/consultorios/page.tsx
  - app/(dashboard)/dashboard/page.tsx
  - app/(dashboard)/equipo/page.tsx
  - app/(dashboard)/finances/page.tsx
  - app/(dashboard)/mas/page.tsx
  - app/(dashboard)/negocio/page.tsx
  - app/(dashboard)/servicios/page.tsx
  - app/(dashboard)/settings/page.tsx
  - app/(dashboard)/web/page.tsx
autonomous: true
# Quick task sin IDs de REQUIREMENTS.md: el requisito es la tarea misma. Los pedidos del dueño se numeran
# D-01..D-09 en <objective> y las decisiones de discreción del planner DC-1..DC-6, para citarlas en cada tarea.
requirements: [quick-261124-neg]

estimate:
  tokens: 95000
  raw_tokens: 95000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Con la lectura de `businesses` fallando (red o PostgREST), NINGUNA pantalla del panel ni `/` manda a `/onboarding`: las 14 pantallas lanzan `LecturaDelNegocioFallida` y `app/(dashboard)/error.tsx` muestra «No pudimos cargar esta pantalla» con el botón «Reintentar»; el layout del panel muestra «No pudimos cargar tu panel» con «Reintentar»; `/` va a `/dashboard` (D-03, D-05, DC-1, DC-3)"
    - "Con 0 filas (el dueño de verdad no tiene negocio), el layout, las 14 pantallas y `/` siguen yendo a `/onboarding`, igual que hoy (D-02)"
    - "Un dueño con 2+ negocios entra al panel: el layout y todas las pantallas resuelven EL MISMO negocio (el más viejo por `created_at`), sin el loop panel → wizard → integraciones → panel (D-01, DC-6)"
    - "La consulta es siempre `from('businesses').select(<columnas de la pantalla>).eq('owner_id', <id de la sesión>).order('created_at', { ascending: true }).limit(1).maybeSingle()`, nunca `.single()`, con el cliente de sesión (RLS activo, nunca service role): el aislamiento por tenant queda igual (D-01, T-neg-02)"
    - "Cada pantalla pide SUS columnas y conserva su tipado: `'*'` sigue siendo `any`, `'id'` sigue siendo `{ id: any }`, la lista explícita de /web sigue tipando sus claves — congelado con `expectTypeOf` y verificado por `tsc` (D-01, DC-4)"
    - "El orden de chequeos de cada archivo no cambia: el layout sigue en sesión → negocio → `suspended` → render; /equipo sigue redirigiendo canchas DESPUÉS de resolver el negocio (D-04)"
    - "Un gate (test que lee los archivos) da rojo si un archivo de `app/(dashboard)` (salvo la excepción documentada `web/_landing-actions.ts`) o `app/page.tsx` vuelve a usar `.eq('owner_id', …)` seguido de `.single()`; se lo vio en ROJO contra el código viejo antes de migrar (D-08)"
    - "Evidencia: `./node_modules/.bin/tsc --noEmit` 0, vitest (`--project pure` completo y `npm test`), eslint de los archivos tocados sin problemas nuevos (sólo los 2 `react-hooks/purity` previos), `npm run build` 0; sin dependencias ni migraciones nuevas (D-09)"
  artifacts:
    - path: lib/negocio-del-dueno.ts
      provides: "`NegocioDelDueno<T>`, `LecturaDelNegocioFallida`, `negocioDelDueno(supabase, ownerId, columnas)` (discriminado) y `negocioDelPanel(supabase, ownerId, columnas)` (wizard si 0 filas, lanza si falla)"
    - path: components/dashboard/panel-error-de-carga.tsx
      provides: "`PanelErrorDeCarga({ titulo, reintentar? })`: tarjeta de aviso con «Reintentar» (usa `reintentar` si viene; si no, `router.refresh()`), en `startTransition`"
    - path: app/(dashboard)/error.tsx
      provides: "boundary del route group: aviso «No pudimos cargar esta pantalla» con `reintentar={unstable_retry}`"
    - path: test/negocio-del-dueno.test.ts
      provides: "fake del query builder: 0 filas, 1 fila, error, forma exacta de la consulta, política de `negocioDelPanel`, tipado por `expectTypeOf`, y el tracer de /finances"
    - path: test/panel-negocio-destinos.test.ts
      provides: "destinos del layout (login, wizard, aviso inline, suspendido, render) y de `/` (dashboard, wizard, error → dashboard)"
    - path: test/panel-negocio-gate.test.ts
      provides: "gate anti-reincidencia de `.eq('owner_id', …).single()` con guarda de barrido vacío y excepción con chequeo de vigencia"
  key_links:
    - from: "las 14 `page.tsx` del panel"
      to: "`negocioDelPanel` (lib/negocio-del-dueno.ts)"
      via: "`const business = await negocioDelPanel(supabase, user.id, '<columnas de hoy>')` en lugar del select + `.single()` + `if (!business) redirect('/onboarding')`"
    - from: "`negocioDelPanel` (error)"
      to: "`app/(dashboard)/error.tsx`"
      via: "`throw new LecturaDelNegocioFallida()` → boundary del segmento → `PanelErrorDeCarga` con `reintentar={unstable_retry}`"
    - from: "`app/(dashboard)/layout.tsx`"
      to: "`PanelErrorDeCarga` inline"
      via: "`negocioDelDueno(...)`; con `reason: 'error'` devuelve el aviso sin `children` (el `error.tsx` del mismo segmento NO envuelve a su layout)"
    - from: "`app/page.tsx`"
      to: "`/dashboard`"
      via: "`negocioDelDueno(supabase, user.id, 'id')`: ok o error → `/dashboard`, sólo 0 filas → `/onboarding`"
---

<objective>
El panel deja de confundir «falló la lectura del negocio» con «no tiene negocio».

Hoy `app/(dashboard)/layout.tsx`, `app/page.tsx` y las 14 `page.tsx` del panel leen el negocio con
`.eq('owner_id', user.id).single()` y, si no vuelve `data`, mandan a `/onboarding`. `.single()` devuelve
error con 0 filas, con 2+ filas (`owner_id` no es unique) y con errores de red/PostgREST, y el código
sólo mira `data`. Resultado: un error transitorio manda al dueño a rehacer el wizard, y un dueño con 2
negocios no entra nunca (loop panel → wizard → `ya-existia` → integraciones → panel). El segundo negocio
YA lo impide `lib/onboarding-alta.ts` (rama `ya-existia`): ese archivo no se toca.

Pedidos del dueño (no negociables):
- D-01: un helper compartido en `lib/` que resuelva el negocio del dueño con `order('created_at', { ascending: true }).limit(1).maybeSingle()` y devuelva un discriminado `{ ok: true, business } | { ok: false, reason: 'sin-negocio' | 'error' }`; cada pantalla sigue pidiendo SUS columnas y conserva su tipado. Verificado en planificación: no existe ninguno parecido (`from('businesses')` en `lib/` sólo aparece en impersonation, mp-connection, plan-limits y recaptcha, y ninguno resuelve por `owner_id`).
- D-02: 0 filas → `redirect('/onboarding')` como hoy.
- D-03: error → NUNCA al wizard: se lanza un Error para que un `error.tsx` nuevo del route group (dashboard) muestre un aviso con «Reintentar», en español rioplatense, con el estilo del panel (tokens de `app/globals.css`, componentes de `@/components/ui`). Docs de Next 16 leídas para la firma de props.
- D-04: se mantiene el orden de chequeos de cada archivo; nada más de cada página cambia.
- D-05: `app/page.tsx` con error no va a `/onboarding` (decisión justificada en DC-3).
- D-06: relevamiento de lugares fuera de `app/(dashboard)`: entran SÓLO los que mandan a `/onboarding` o deciden «no tiene negocio» a partir de ese resultado; el resto queda listado fuera de scope (ver `<scope_audit>`).
- D-07: patrón de referencia: `app/(onboarding)/onboarding/integraciones/page.tsx` (`maybeSingle`, comentario WR-03).
- D-08: tests unitarios del helper con un fake del query builder (0 filas, 1 fila, error, que pide order created_at asc + limit 1 + filtra por owner_id) + un gate que lee los archivos y da rojo si `app/(dashboard)` o `app/page.tsx` vuelven a `.eq('owner_id', …)` + `.single()`, probado con el código viejo en rojo.
- D-09: evidencia: `./node_modules/.bin/tsc --noEmit` (NUNCA `npx tsc`, que en esta máquina sale 0 siempre), `npm test`, eslint de los archivos tocados, `npm run build`.

Decisiones de discreción del planner (con su porqué):
- DC-1 (layout = aviso inline, no throw): la doc de Next 16 (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`, línea 96) dice que `error.js` «does not wrap the layout.js … above it in the same segment». `app/(dashboard)/error.tsx` y `app/(dashboard)/layout.tsx` son el mismo segmento: un throw en el layout salta ese boundary y cae en el global-error por defecto de Next (inglés, «This page couldn't load»; no hay `app/error.tsx` ni `app/global-error.tsx`). Como el layout lee el negocio en TODAS las rutas del panel, es justamente donde cae el error transitorio. Por eso el layout, con `reason: 'error'`, devuelve el mismo aviso inline (sin `children`), y las páginas lanzan para que las atrape `error.tsx` dentro del chrome del panel.
- DC-2 (`unstable_retry` y no `reset` a mano): en Next 16.2.7 `unstable_retry` ES `startTransition(() => { router.refresh(); reset() })` (verificado en `node_modules/next/dist/client/components/error-boundary.js:43-47`), y la doc lo recomienda sobre `reset` (que sólo limpia el estado y no re-pide los Server Components). Es exactamente lo pedido en D-03, provisto por el framework. Para el aviso inline del layout (sin boundary) se usa `router.refresh()` dentro de `startTransition`.
- DC-3 (`app/page.tsx` → `/dashboard` con error, sin `app/error.tsx` raíz): un `error.tsx` raíz cambiaría la pantalla de error de TODAS las otras superficies (reservas públicas `/[slug]`, landing, CRM, auth), que nadie pidió tocar. Se sigue el patrón WR-03 de integraciones: ante error, al panel; el layout vuelve a leer y decide (sigue fallando → aviso con «Reintentar»; 0 filas reales → wizard). No hay loop: `/dashboard` nunca redirige a `/`.
- DC-4 (forma del helper): `negocioDelDueno<Q extends string>(supabase: SupabaseClient, ownerId, columnas: Q)` SIN anotación de tipo de retorno, para que TS infiera la fila desde el literal de columnas exactamente como hoy. Probado en planificación contra los tipos reales instalados (postgrest-js 2.106.2, TS 5.9.3): `'*'` → `any`, `'id'` → `{ id: any }`, `'id, vertical, type'` → `{ id: any; vertical: any; type: any }`, idéntico al `.single()` actual. La alternativa de recibir el builder ya armado con una interfaz estructural infería `unknown` y daba «Type instantiation is excessively deep»: descartada. Arriba de él, `negocioDelPanel` encapsula la política de las 14 pantallas (0 filas → wizard; error → lanza) para que cada página cambie una sola sentencia. El log del error vive en `negocioDelDueno` (un solo prefijo para todos los llamadores).
- DC-5 (excepción del gate): `app/(dashboard)/web/_landing-actions.ts` usa el patrón viejo 3 veces pero son server actions que devuelven `{ ok: false, error: 'no_business' }`: no mandan al wizard, quedan fuera de scope por D-06 y el gate las lista como excepción explícita (con chequeo de vigencia: si un día dejan de matchear, el gate pide sacarlas de la lista).
- DC-6 (el más viejo por `created_at`): es determinístico y el mismo en layout y páginas, así que todas las pantallas muestran el mismo negocio. El original es el más viejo; un duplicado armado por el loop viejo siempre es posterior.

Purpose: un dueño con una conexión momentáneamente mala ya no termina en el wizard (puerta a un segundo negocio), y un dueño con 2 negocios vuelve a poder entrar al panel.
Output: `lib/negocio-del-dueno.ts`, el aviso `PanelErrorDeCarga`, `app/(dashboard)/error.tsx`, las 16 lecturas migradas, 3 archivos de test (helper + tracer, destinos, gate).
</objective>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/workstreams/onboarding/STATE.md
@./CLAUDE.md
@./AGENTS.md
@./.claude/CLAUDE.md
@.claude/skills/convenciones-forjo/SKILL.md
@.claude/skills/supabase-multitenant-rls/SKILL.md
@app/(onboarding)/onboarding/integraciones/page.tsx
@test/onboarding-integraciones-page.test.ts
@test/forms-no-get-leak.test.ts
@app/(dashboard)/layout.tsx
@app/page.tsx
@app/(dashboard)/finances/page.tsx
@app/suspendido/page.tsx
@node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md

<interfaces>
Contrato que el executor implementa (firmas, no implementación):

```ts
// lib/negocio-del-dueno.ts  (server-only por uso; importa `redirect` de 'next/navigation')
import type { SupabaseClient } from '@supabase/supabase-js'   // dependencia directa; mismo import que lib/abono-cancel.ts

export type NegocioDelDueno<T> =
  | { ok: true; business: T }
  | { ok: false; reason: 'sin-negocio' | 'error' }

export class LecturaDelNegocioFallida extends Error   // name = 'LecturaDelNegocioFallida', mensaje genérico en español, SIN detalles del error de Supabase

// SIN anotación de retorno (DC-4). Cada `return` lleva `satisfies NegocioDelDueno<...>` para fijar los literales.
export async function negocioDelDueno<Q extends string>(supabase: SupabaseClient, ownerId: string, columnas: Q)
//  → supabase.from('businesses').select(columnas).eq('owner_id', ownerId)
//      .order('created_at', { ascending: true }).limit(1).maybeSingle()
//  error → console.error('[negocio-del-dueno] leer negocio falló:', error.code ?? error.message); { ok: false, reason: 'error' }
//  data null → { ok: false, reason: 'sin-negocio' }
//  data → { ok: true, business: data }

export async function negocioDelPanel<Q extends string>(supabase: SupabaseClient, ownerId: string, columnas: Q)
//  sin-negocio → redirect('/onboarding');  error → throw new LecturaDelNegocioFallida();  ok → return business
```

```ts
// components/dashboard/panel-error-de-carga.tsx  ('use client')
export function PanelErrorDeCarga(props: { titulo: string; reintentar?: () => void })

// app/(dashboard)/error.tsx  ('use client') — firma de Next 16.2 (doc error.md, sección Props)
export default function PanelError(props: { error: Error & { digest?: string }; unstable_retry: () => void })
```

Resultado de la sonda de tipos (scratchpad, contra los tipos instalados): con el cliente sin `Database`
genérico (`lib/supabase/server.ts`), hoy `select('*').single()` da `any`, `select('id')` da `{ id: any }`
y `select('id, vertical, type')` da `{ id: any; vertical: any; type: any }`; `negocioDelPanel(sb, id, X)`
devuelve exactamente lo mismo para cada X. `SupabaseClient` (defaults) acepta el cliente de `createServerClient`.

Regex de referencia del gate (sobre el fuente YA sin comentarios):
`/\.eq\(\s*(['"`])owner_id\1\s*,[^)]*\)(?:\s*\.\w+\([^()]*\))*\s*\.single\(\s*\)/`
— un `.eq` con primer argumento literal owner_id (cualquier comilla), cero o más llamadas encadenadas
sin paréntesis anidados en el medio (cruzando saltos de línea), y después `.single()`.

Baseline medido en planificación (2026-11-24): eslint sobre los 16 archivos a migrar = 2 errores
`react-hooks/purity` previos (`Date.now` en `app/(dashboard)/dashboard/page.tsx:43` y en
`app/(dashboard)/layout.tsx:64`), 0 warnings. NO se arreglan (D-04); al final tienen que seguir siendo
exactamente esos 2 (los números de línea pueden correrse).
</interfaces>

<scope_audit>
Relevamiento D-06 (hecho en planificación con grep de `eq('owner_id'` y de `'/onboarding'` en app/, lib/, components/, proxy.ts):

EN SCOPE (deciden ir al wizard con el resultado de `.single()`): `app/(dashboard)/layout.tsx`, `app/page.tsx`
y las 14 `page.tsx`: abonos, agenda, appointments, clients, clinical-history, consultorios, dashboard,
equipo, finances, mas, negocio, servicios, settings, web.

FUERA DE SCOPE (ninguno manda a `/onboarding`; con error o 0 filas fallan cerrado con un error al cliente):
- Route handlers con `.single()` que responden JSON 401/403/404 (`not_found`, `no_business`, `Sin negocio`,
  `Negocio no encontrado`, `not_connected`): `app/api/abonos/cancel`, `abonos/create`,
  `appointments/cleanup-expired`, `appointments/create`, `appointments/delete`, `clients/create`,
  `export/clients`, `export/finances`, `google/disconnect`, `google/sync`, `import/clients/confirm`,
  `import/clients/preview`, `mercadopago/disconnect`, `notify/cancel`, `subscription/cancel`,
  `subscription/create`, `subscription/status`.
- OAuth callbacks que con error redirigen a la superficie de origen con `?google=error` / `?mp=error`:
  `app/api/google/callback`, `app/api/mercadopago/callback`.
- `app/api/abonos/cancel-link/[id]`: ya usa `.limit(2)` con manejo de error (500).
- `app/(dashboard)/web/_landing-actions.ts`: server actions que devuelven `{ ok: false, error: 'no_business' }` (excepción explícita del gate, DC-5).
- `app/(onboarding)/onboarding/integraciones/page.tsx`: ya usa `maybeSingle` + WR-03 (es la referencia, no se toca).
- `app/(onboarding)/onboarding/page.tsx` + `lib/onboarding-alta.ts`: el alta idempotente (`ya-existia`), no se toca.
- CRM (`app/(crm)/admin/**`): resuelve por id con service role, no por `owner_id` de sesión.

Consecuencia a dejar anotada en el SUMMARY como follow-up (NO se arregla acá): un dueño con 2+ negocios
ahora entra al panel (lee el más viejo), pero esos route handlers y server actions siguen con `.single()`
y le responden 404/`no_business` en las escrituras. Fallan cerrado (sin riesgo de tenant), pero el panel
queda a medias para ese dueño hasta migrarlos.
</scope_audit>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): helper + aviso + error.tsx + /finances — un error de lectura en /finances muestra el aviso del panel, nunca el wizard</name>
  <files>lib/negocio-del-dueno.ts, test/negocio-del-dueno.test.ts, components/dashboard/panel-error-de-carga.tsx, app/(dashboard)/error.tsx, app/(dashboard)/finances/page.tsx</files>
  <behavior>
    test/negocio-del-dueno.test.ts (carril `pure`: no importa nada de `./env`):
    - `negocioDelDueno` con 1 fila → `{ ok: true, business: <la fila> }`.
    - con 0 filas (`data: null, error: null`) → `{ ok: false, reason: 'sin-negocio' }` y NO loguea.
    - con error (`{ message: 'fetch failed' }`, y otro con `{ code: 'PGRST301', message: 'x' }`) → `{ ok: false, reason: 'error' }`; `console.error` recibe el prefijo `[negocio-del-dueno]` y el `code ?? message`; el resultado no trae el mensaje del error.
    - forma exacta de la consulta: la secuencia de llamadas registradas es `from('businesses')`, `select(<columnas pasadas>)`, `eq('owner_id', 'user-1')`, `order('created_at', { ascending: true })`, `limit(1)`, `maybeSingle()` — en ese orden, y `single` nunca aparece (D-01, D-08).
    - `negocioDelPanel`: 0 filas → lanza `REDIRECT:/onboarding`; error → rechaza con instancia de `LecturaDelNegocioFallida` y el mock de `redirect` NO fue llamado (D-02, D-03); 1 fila → devuelve la fila.
    - tipado (verificado por `tsc`, no-op en runtime): con el fake casteado a `SupabaseClient`, `expectTypeOf(await negocioDelPanel(c, 'user-1', '*')).toBeAny()`; para `'id'`: `.not.toBeAny()`, `expectTypeOf<keyof typeof r>().toEqualTypeOf<'id'>()` y `expectTypeOf(r.id).toBeAny()`; para `'id, vertical, type'`: las claves son `'id' | 'vertical' | 'type'`. Sin escribir `any` literal en el test (la regla `no-explicit-any` de eslint lo marcaría) (DC-4).
    - tracer /finances: `FinancesPage()` con lectura en error → rechaza con `LecturaDelNegocioFallida` (nunca `REDIRECT:/onboarding`); con 0 filas → `REDIRECT:/onboarding`; con `{ id: 'biz-1' }` → el elemento devuelto lleva `FinancesClient` con `businessId: 'biz-1'`.
  </behavior>
  <action>
    Paso 0 — baseline (no cambia nada): correr `./node_modules/.bin/tsc --noEmit` y anotar el exit; la baseline de eslint ya está medida en `<interfaces>` (2 errores `react-hooks/purity` previos).

    Paso 1 — RED: escribir `test/negocio-del-dueno.test.ts` con el `<behavior>` de arriba, siguiendo el molde de `test/onboarding-integraciones-page.test.ts`: `vi.hoisted` con un `redirect` `vi.fn` que lanza `Error('REDIRECT:<url>')` y un `createClientMock`; `vi.mock('next/navigation')`, `vi.mock('@/lib/supabase/server')` y `vi.mock('@/app/(dashboard)/finances/finances-client', () => ({ FinancesClient: () => null }))`. Un fake del cliente que registra cada llamada en un array (`['from', tabla]`, `['select', cols]`, `['eq', col, val]`, `['order', col, opts]`, `['limit', n]`, `['maybeSingle']`, `['single']`): `from` devuelve un builder cuyos `select/eq/order/limit` devuelven el mismo builder, y `maybeSingle` y `single` resuelven la respuesta configurada (así una regresión a `.single()` se VE en el registro); `auth.getUser` resuelve `{ data: { user: { id: 'user-1' } } }`. `afterEach` con `vi.clearAllMocks()` + `vi.restoreAllMocks()`; silenciar `console.error` con `vi.spyOn` donde corresponda. Cabecera en español explicando QUÉ congela y POR QUÉ (el bug: `.single()` mezcla 0 filas, 2+ filas y errores; el wizard no verifica si ya hay negocio). Correr `./node_modules/.bin/vitest run --project pure test/negocio-del-dueno.test.ts` → tiene que dar rojo (el módulo no existe). Commit sólo del test: `test(quick-261124-neg): tests del negocio del dueño y del tracer de /finances (rojo)`.

    Paso 2 — GREEN, `lib/negocio-del-dueno.ts` según `<interfaces>` (D-01, DC-4, DC-6): cabecera en español con el porqué (los tres casos que `.single()` mezcla; `maybeSingle` + `limit(1)` separa «0 filas, sin error» de «falló la lectura»; el más viejo por `created_at` = el mismo negocio en layout y páginas; `owner_id` no es unique y el segundo negocio lo frena `lib/onboarding-alta.ts`; `ownerId` SIEMPRE de `supabase.auth.getUser()` de la sesión y el cliente SIEMPRE el de sesión con RLS, nunca el admin; citar WR-03 de integraciones como antecedente). Sin anotación de tipo de retorno en las dos funciones; cada `return` con `satisfies NegocioDelDueno<…>`. El log va sólo en la rama de error de `negocioDelDueno`, con `error.code ?? error.message` (nunca el objeto entero). `LecturaDelNegocioFallida` con mensaje genérico en español y `name` propio.

    Paso 3 — `components/dashboard/panel-error-de-carga.tsx` (`'use client'`, D-03): una tarjeta que espeja la de `app/suspendido/page.tsx` — `section` con `role="alert"`, clases `w-full max-w-md rounded-xl border border-border bg-card p-6 sm:p-8 text-center`; `h1` con el `titulo` en `text-xl font-semibold text-foreground`; párrafo `mt-3 text-sm leading-relaxed text-muted-foreground` con el texto exacto «Puede ser un problema de conexión momentáneo. Probá de nuevo en unos segundos.»; `Button` de `@/components/ui/button` (variante default) con `className="mt-6 h-11 w-full"` (44 px de toque, como los botones de suspendido). Con `useTransition`: el click hace `startTransition(...)` llamando a `reintentar()` si vino la prop, o a `router.refresh()` (de `useRouter` de `next/navigation`) si no vino; mientras `isPending` el botón queda `disabled` y dice «Reintentando…», si no dice «Reintentar». Comentario en español de por qué hay dos caminos (boundary con `unstable_retry` vs. el layout sin boundary, DC-1/DC-2). Sin `¿`/`¡`.

    Paso 4 — `app/(dashboard)/error.tsx` (`'use client'`, D-03, DC-2): default export `PanelError` (no `Error`, para no tapar el global) con la firma de `<interfaces>`. `useEffect` que loguea `console.error('[panel/error]', error.digest ?? error.message)`. Renderiza `PanelErrorDeCarga` con `titulo="No pudimos cargar esta pantalla"` y `reintentar={unstable_retry}` dentro de un `div` `flex justify-center py-10`. Nunca muestra `error.message` en pantalla (en producción Next lo reemplaza por un genérico + digest, y en dev filtraría detalles). Comentario en español: qué atrapa (los throws de las páginas del panel, que se renderizan DENTRO del chrome del layout), qué NO atrapa (el propio layout del segmento, por eso el layout usa el aviso inline) y por qué `unstable_retry` (es reset + refresh en transición, verificado en el runtime instalado).

    Paso 5 — `app/(dashboard)/finances/page.tsx` (tracer, D-04): reemplazar SÓLO el bloque `const { data: business } = await supabase.from('businesses').select('id')…single()` + el `if (!business) redirect('/onboarding')` por `const business = await negocioDelPanel(supabase, user.id, 'id')`, e importar `negocioDelPanel` de `@/lib/negocio-del-dueno`. El import de `redirect` se queda (lo usa `/login`). Nada más del archivo cambia (el comentario largo del Suspense queda igual).

    Paso 6 — correr el test (verde) y `tsc`. Commit con `git add` explícito de los 4 archivos de código (rutas con paréntesis entre comillas) y `git commit -m "…" -- <rutas>`: `feat(quick-261124-neg): negocio del dueño con maybeSingle y aviso del panel ante error de lectura`. Nunca `git add -A`, nunca `git checkout --`.
  </action>
  <verify>
    <automated>./node_modules/.bin/vitest run --project pure test/negocio-del-dueno.test.ts</automated>
    <automated>./node_modules/.bin/tsc --noEmit</automated>
  </verify>
  <done>El test nació rojo (commit propio) y quedó verde: 0/1 fila/error, la secuencia exacta de la consulta sin `single`, la política de `negocioDelPanel` (error nunca llama a `redirect`), el tipado por `expectTypeOf`, y el tracer /finances (error → `LecturaDelNegocioFallida`, 0 filas → wizard, ok → `businessId`). `tsc` sale 0. Existen `PanelErrorDeCarga` y `app/(dashboard)/error.tsx` con `unstable_retry`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: layout del panel con aviso inline y `/` que nunca manda al wizard por un error</name>
  <files>app/(dashboard)/layout.tsx, app/page.tsx, test/panel-negocio-destinos.test.ts</files>
  <behavior>
    test/panel-negocio-destinos.test.ts (carril `pure`):
    - Layout: sin user → `REDIRECT:/login`; 0 filas → `REDIRECT:/onboarding`; error de lectura → NO redirige ni lanza, devuelve un árbol que contiene `PanelErrorDeCarga` con `titulo: 'No pudimos cargar tu panel'` y NO contiene el `children` centinela (DC-1); negocio `plan_status: 'suspended'` → `REDIRECT:/suspendido` (el chequeo sigue DESPUÉS del negocio, D-04); negocio activo → devuelve el árbol con el `children` centinela adentro.
    - `/` (`Home` de `@/app/page`): 1 fila → `REDIRECT:/dashboard`; 0 filas → `REDIRECT:/onboarding`; error → `REDIRECT:/dashboard`, nunca `/onboarding` (DC-3); sin user → `REDIRECT:/login`.
  </behavior>
  <action>
    Paso 1 — RED: escribir `test/panel-negocio-destinos.test.ts` con el mismo molde de fake y de `redirect` del Task 1 (definido local en el archivo, el builder encadenable con `maybeSingle`). Para importar el layout en el environment `node`, mockear cada import de UI con un componente que no renderiza nada: `@/components/dashboard/sidebar` (`Sidebar`), `panel-bottom-nav` (`PanelBottomNav`), `panel-top-bar` (`PanelTopBar`), `plan-banner` (`PlanBanner`), `test-mode-banner` (`TestModeBanner`), `mp-connection-banner` (`MpConnectionBanner`), `unsaved-changes-guard` (`UnsavedChangesProvider`), `@/lib/use-terminology` (`VerticalProvider`), `@/components/palette-script` (`PaletteScript`), `@/components/theme-sync` (`ThemeSync`), `@/lib/verticals` (`resolveVertical: () => ({ key: 'general' })`) y `@/components/dashboard/panel-error-de-carga` (`PanelErrorDeCarga` = una función centinela identificable). El `children` centinela es un elemento creado una vez en el test y se busca por identidad. Un helper recursivo recorre `props.children` (arrays o nodo único) de los elementos devueltos para buscar un `type` o un nodo (los elementos no se renderizan: sólo se inspecciona el árbol). Cabecera en español: qué congela y por qué el layout NO lanza (DC-1). Correr → rojo (el layout y `/` todavía usan `.single()` y mandan al wizard con error). Commit del test solo: `test(quick-261124-neg): destinos del layout y de / ante error de lectura (rojo)`.

    Paso 2 — `app/(dashboard)/layout.tsx` (D-03, D-04, DC-1): reemplazar SÓLO el bloque del select + `.single()` + `if (!business) redirect('/onboarding')` por: `const negocio = await negocioDelDueno(supabase, user.id, '*')`; `if (!negocio.ok && negocio.reason === 'sin-negocio') redirect('/onboarding')`; si `!negocio.ok` devolver `<main className="min-h-dvh flex items-center justify-center bg-background px-4 py-12">` con `<PanelErrorDeCarga titulo="No pudimos cargar tu panel" />` adentro (sin `reintentar`: usa `router.refresh()`; `min-h-dvh` y no `min-h-screen`, por el mismo motivo que ya documenta el `<main>` del archivo); y `const business = negocio.business`. Comentario en español arriba del early return: por qué NO se lanza (la doc de error.js: el boundary no envuelve al layout de su mismo segmento; un throw acá terminaría en la pantalla genérica en inglés de Next) y que el `redirect` no va en try/catch (lanza NEXT_REDIRECT, ya lo advierte el archivo). Todo lo demás del layout queda intacto: `metadata`, `viewport`, el chequeo de `suspended` DESPUÉS, `daysLeft` (con su `Date.now` y su error de lint previo, que no se toca) y el JSX.

    Paso 3 — `app/page.tsx` (D-05, DC-3): `const negocio = await negocioDelDueno(supabase, user.id, 'id')`; si `negocio.ok` o `negocio.reason === 'error'` → `redirect('/dashboard')`; si no → `redirect('/onboarding')`. Comentario en español: por qué el error va al panel y no al wizard (WR-03), por qué NO se agrega un `app/error.tsx` raíz (cambiaría la pantalla de error de reservas públicas, landing, CRM y auth) y por qué no hay loop (el layout vuelve a leer y decide; `/dashboard` nunca manda a `/`).

    Paso 4 — correr el test (verde), el del Task 1 (sigue verde) y `tsc`. Commit con `git add` explícito y `git commit -m "…" -- <rutas>`: `feat(quick-261124-neg): el layout del panel y / no mandan al wizard ante un error de lectura`.
  </action>
  <verify>
    <automated>./node_modules/.bin/vitest run --project pure test/panel-negocio-destinos.test.ts test/negocio-del-dueno.test.ts</automated>
    <automated>./node_modules/.bin/tsc --noEmit</automated>
  </verify>
  <done>El test de destinos nació rojo y quedó verde: el layout con error devuelve el aviso «No pudimos cargar tu panel» sin `children` y sin redirigir, con 0 filas va al wizard, el `suspended` sigue después del negocio; `/` con error va a `/dashboard` y sólo con 0 filas al wizard. `tsc` 0.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: gate anti-reincidencia (visto en rojo con el código viejo), migración de las 13 pantallas restantes y evidencia final</name>
  <files>test/panel-negocio-gate.test.ts, app/(dashboard)/abonos/page.tsx, app/(dashboard)/agenda/page.tsx, app/(dashboard)/appointments/page.tsx, app/(dashboard)/clients/page.tsx, app/(dashboard)/clinical-history/page.tsx, app/(dashboard)/consultorios/page.tsx, app/(dashboard)/dashboard/page.tsx, app/(dashboard)/equipo/page.tsx, app/(dashboard)/mas/page.tsx, app/(dashboard)/negocio/page.tsx, app/(dashboard)/servicios/page.tsx, app/(dashboard)/settings/page.tsx, app/(dashboard)/web/page.tsx</files>
  <behavior>
    test/panel-negocio-gate.test.ts (carril `pure`, lee el fuente; molde `test/forms-no-get-leak.test.ts`):
    - Detector (`usaSingleTrasOwnerId`) probado contra fixtures en string: DA POSITIVO con la forma de una línea, con la forma multilínea (como abonos), con comillas dobles, y con un `.eq('active', true)` intermedio; DA NEGATIVO con `.maybeSingle()`, con la cadena nueva `order/limit/maybeSingle`, con `.eq('id', business.id).single()` (el caso real de `web/page.tsx`, que no es por `owner_id` y tiene que seguir permitido) y con el patrón dentro de un comentario (después de `sinComentarios`).
    - Barrido: todos los `.ts/.tsx` bajo `app/(dashboard)` (sin `*.test.*`) + `app/page.tsx`. Ninguno matchea, salvo la excepción `app/(dashboard)/web/_landing-actions.ts` (DC-5).
    - Vigencia de la excepción: el archivo exceptuado TIENE que seguir matcheando; si deja de hacerlo, el test falla pidiendo sacarlo de la lista.
    - Guarda de barrido vacío: los 16 archivos esperados (layout, `app/page.tsx` y las 14 pantallas) aparecen en el barrido y cada uno llama a `negocioDelDueno(` o `negocioDelPanel(` (fuente sin comentarios).
  </behavior>
  <action>
    Paso 1 — RED contra el código viejo (la prueba de mutación de D-08): escribir `test/panel-negocio-gate.test.ts`. Copiar `sinComentarios` y el walker de `test/forms-no-get-leak.test.ts` (citando el origen como hace ese archivo) y `rutaPosix` para comparar rutas con `/` en Windows. Implementar el detector con la regex de `<interfaces>` y sus fixtures del `<behavior>`. `ESPERADOS` = las 16 rutas exactas. `EXCEPCIONES` = un objeto `{ ruta: motivo }` con `_landing-actions.ts` y el motivo en español (server actions que devuelven `no_business`, no mandan al wizard; fuera de scope del quick 261124-neg, follow-up anotado). Mensaje de fallo con un `PORQUE` en español: qué rompía `.single()` (0 filas, 2+ filas y errores de red mezclados → wizard o loop), y el arreglo (usar `negocioDelPanel` en pantallas o `negocioDelDueno` donde haga falta otra política). Correr `./node_modules/.bin/vitest run --project pure test/panel-negocio-gate.test.ts` ANTES de migrar: tiene que dar ROJO nombrando exactamente las 13 pantallas que faltan (abonos, agenda, appointments, clients, clinical-history, consultorios, dashboard, equipo, mas, negocio, servicios, settings, web) y verde en fixtures, excepción y en los 3 ya migrados. Copiar la lista de archivos del rojo al SUMMARY como evidencia de la mutación. Commit sólo del test: `test(quick-261124-neg): gate de owner_id + single en el panel (rojo con el código viejo)`.

    Paso 2 — migrar las 13 pantallas (D-01, D-04), mismo cambio mecánico que /finances: reemplazar SÓLO el bloque `const { data: business } = await supabase.from('businesses').select(<X>).eq('owner_id', user.id).single()` + su `if (!business) redirect('/onboarding')` por `const business = await negocioDelPanel(supabase, user.id, <X>)` con `<X>` byte-idéntico al de hoy (`'*'` en 12; en `web/page.tsx` la lista explícita larga, que se pasa como literal inline en el tercer argumento para conservar el tipado), e importar `negocioDelPanel` de `@/lib/negocio-del-dueno`. El import de `redirect` se queda donde se siga usando (todos lo usan para `/login`; equipo además para canchas). No tocar nada más: los comentarios existentes (el bloque 3. de `web/page.tsx`, la cabecera de `mas/page.tsx`, el de `negocio/page.tsx` sobre `business.id`) siguen siendo ciertos y quedan igual; el orden de chequeos se mantiene (equipo: negocio → canchas → queries; agenda/negocio/settings: negocio → secrets); en `web/page.tsx` la lectura `select('plan').eq('id', business.id).single()` del upsell queda como está.

    Paso 3 — gate verde + evidencia final (D-09), en este orden:
    (a) `./node_modules/.bin/vitest run --project pure test/panel-negocio-gate.test.ts test/negocio-del-dueno.test.ts test/panel-negocio-destinos.test.ts` → verde.
    (b) `./node_modules/.bin/tsc --noEmit` → 0.
    (c) `./node_modules/.bin/eslint` sobre los 22 archivos de `files_modified` (rutas con paréntesis entre comillas) → sólo los 2 `react-hooks/purity` previos de la baseline; 0 en los archivos nuevos.
    (d) `./node_modules/.bin/vitest run --project pure` completo → 0 fallos (los 3 «expected fail» de siempre aparte). Si fallan tests de reloj, mirar la hora: hay 2 canarios que fallan a propósito fuera de [01:00, 23:30] AR; no culpar al cambio sin chequear eso.
    (e) `npm test` (pure + db). El carril `db` pega contra el Supabase local por Docker: si falla por entorno (conexión rechazada, Supabase apagado), decirlo tal cual en el SUMMARY y NO reportarlo como verde; este quick no toca la base.
    (f) `npm run build` → 0 (sin turno: no levanta navegador ni servidor de pruebas). No matar ningún `next dev` que esté corriendo.
    (g) `git diff --stat -- package.json package-lock.json supabase/ next.config.ts lib/overlay-history.ts lib/dirty-history.ts scripts/con-turno.mjs lib/onboarding-alta.ts "app/(onboarding)"` → vacío.
    Commit con `git add` explícito de las 13 pantallas y `git commit -m "…" -- <rutas>`: `fix(quick-261124-neg): las pantallas del panel no mandan al wizard ante un error de lectura del negocio`. Revisar con `git show --stat` que no arrastró archivos ajenos (otra sesión puede estar commiteando en main). No pushear.

    Paso 4 — SUMMARY: las decisiones DC-1..DC-6 en criollo con un ejemplo; la lista del rojo del gate; el `<scope_audit>` fuera de scope y el follow-up de los route handlers para dueños con 2+ negocios; y que el aviso NO se vio en un navegador (se verificó por estructura en los tests; queda como UAT sugerida).
  </action>
  <verify>
    <automated>./node_modules/.bin/vitest run --project pure test/panel-negocio-gate.test.ts test/negocio-del-dueno.test.ts test/panel-negocio-destinos.test.ts</automated>
    <automated>./node_modules/.bin/tsc --noEmit</automated>
    <automated>./node_modules/.bin/vitest run --project pure</automated>
    <automated>npm test</automated>
    <automated>npm run build</automated>
  </verify>
  <done>El gate se vio en ROJO con las 13 pantallas viejas (lista en el SUMMARY) y quedó verde tras migrarlas; fixtures, guarda de barrido vacío y vigencia de la excepción en verde. Las 16 lecturas usan `negocioDelDueno`/`negocioDelPanel`. `tsc` 0, vitest `pure` completo sin fallos, `npm test` verde o su carril `db` reportado como no corrido por entorno, eslint sólo con los 2 previos, `build` 0, sin diff en dependencias, migraciones ni archivos protegidos. SUMMARY escrito con decisiones, fuera de scope y lo que no se pudo comprobar.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| navegador → server de Next | la cookie de sesión identifica al dueño; ningún id de negocio viaja del cliente |
| server de Next → Supabase (PostgREST) | cliente de sesión con anon key: RLS `owner access` sobre `businesses` sigue activo |
| server → navegador (error boundary) | lo que cruza al cliente cuando una lectura falla |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-neg-01 | Information disclosure | `app/(dashboard)/error.tsx`, `PanelErrorDeCarga`, `LecturaDelNegocioFallida` | medium | mitigate | El aviso muestra texto fijo y nunca `error.message`; `LecturaDelNegocioFallida` lleva un mensaje genérico sin datos de Supabase; el server loguea sólo `error.code ?? error.message` con prefijo `[negocio-del-dueno]`; en producción Next además reemplaza el mensaje por un digest. Test: el resultado de error no contiene el mensaje original. |
| T-neg-02 | Elevation of privilege / Tampering | `negocioDelDueno` (aislamiento por tenant) | high | mitigate | Filtra por `owner_id` = `user.id` de `supabase.auth.getUser()` de la sesión (nunca un valor del cliente), con el cliente de sesión (RLS) y nunca `createAdminClient`; `order` + `limit(1)` sólo elige entre negocios del MISMO dueño. Test: la secuencia exacta incluye `eq('owner_id', 'user-1')`. |
| T-neg-03 | Tampering | ruteo al wizard → segundo negocio | high | mitigate | Un error de lectura ya no manda a `/onboarding` en ninguna de las 16 superficies (tests de `negocioDelPanel`, layout y `/`); el gate impide volver a `.single()`; la red de `lib/onboarding-alta.ts` (`ya-existia`) queda intacta. |
| T-neg-04 | Denial of service | loops de redirección / reintentos | low | mitigate | No hay reintento automático: «Reintentar» es un click y queda deshabilitado mientras corre; `/` con error va a `/dashboard`, que nunca redirige a `/` → sin loop. |
| T-neg-05 | Denial of service | escrituras por API para dueños con 2+ negocios | low | accept | Los route handlers y server actions fuera de scope siguen con `.single()` y responden 404/`no_business` a ese dueño: fallan cerrado, sin riesgo de tenant. Follow-up anotado en el SUMMARY. |
</threat_model>

<verification>
- `./node_modules/.bin/vitest run --project pure test/negocio-del-dueno.test.ts test/panel-negocio-destinos.test.ts test/panel-negocio-gate.test.ts` verde; el gate y los dos tests de comportamiento tienen su commit rojo previo.
- `./node_modules/.bin/tsc --noEmit` sale 0 (incluye los `expectTypeOf` del tipado).
- `./node_modules/.bin/vitest run --project pure` completo sin fallos y `npm test` (o el carril `db` reportado por entorno).
- eslint de los 22 archivos: sólo los 2 `react-hooks/purity` previos.
- `npm run build` sale 0.
- Sin diff en `package.json`, lock, `supabase/`, `next.config.ts`, `lib/overlay-history.ts`, `lib/dirty-history.ts`, `scripts/con-turno.mjs`, `lib/onboarding-alta.ts` ni `app/(onboarding)/`.
</verification>

<success_criteria>
- Ningún error de lectura del negocio lleva al wizard: pantallas → `error.tsx` con «Reintentar», layout → aviso inline con «Reintentar», `/` → `/dashboard`.
- 0 filas sigue yendo a `/onboarding` en las 16 superficies.
- Un dueño con 2+ negocios entra al panel y ve siempre el más viejo.
- Tipado de cada pantalla idéntico al de hoy (`tsc` + `expectTypeOf`).
- Gate anti-reincidencia visto en rojo con el código viejo y verde al final.
</success_criteria>

<output>
Crear `.planning/workstreams/onboarding/quick/261124-neg-panel-error-de-lectura-del-negocio-no-ma/261124-neg-SUMMARY.md` al terminar.
</output>
