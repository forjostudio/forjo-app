---
phase: 07-cancelaci-n-del-abono-mail-panel
plan: 12
subsystem: testing
tags: [abonos, vitest, rutas, concurrencia, multi-tenant, next16-after, gate-de-tanda]

# Dependency graph
requires:
  - phase: 07-cancelaci-n-del-abono-mail-panel
    provides: "07-06: barrido de reparación + abonoDayLabel/toISODate en lib/abono-cancel.ts"
  - phase: 07-cancelaci-n-del-abono-mail-panel
    provides: "07-07: esc() y AbortSignal.timeout en lib/email.ts"
  - phase: 07-cancelaci-n-del-abono-mail-panel
    provides: "07-09: after() en la vía pública de baja"
  - phase: 07-cancelaci-n-del-abono-mail-panel
    provides: "07-10: endpoint cancel-link + agregados acotados del panel"
  - phase: 07-cancelaci-n-del-abono-mail-panel
    provides: "07-11: los 3 callers restantes consumiendo los contratos compartidos"
provides:
  - "WR-08 cerrado: test/abono-cancel-routes.test.ts, 16 casos a nivel RUTA de las dos vías de baja"
  - "El anti-avalancha (D-14 / T-07-15) verificado bajo CARRERA REAL contra la DB local, no por lectura de código"
  - "El aislamiento por tenant de la baja por panel verificado con dos tenants y conteos antes/después (D-24)"
  - "Patrón reusable: mock parcial de next/server que ejecuta after() y expone sus promesas para poder asertar sobre efectos diferidos"
affects: [secure-phase-07, cualquier plan futuro que testee un route handler con after()]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Test a nivel ruta con after(): mock PARCIAL de next/server (importOriginal) que corre el callback y guarda su promesa; el test la drena antes de asertar sobre los efectos diferidos"
    - "Mock de la FACTORY, no del comportamiento: createAdminClient devuelve un cliente Supabase REAL contra la DB local — una carrera no se puede probar contra un doble"
    - "Los templates de mail como CONTADOR: spies que no asiertan contenido, solo cuántas veces salió el mail"
    - "Guard anti-falso-verde: el cliente de aserción de una vía autenticada debe tener access_token de sesión anon; si quedara con service-role, el test aborta ruidosamente"

key-files:
  created:
    - test/abono-cancel-routes.test.ts
  modified: []

key-decisions:
  - "Ningún archivo de producción se tocó: el plan es cobertura, no cambio de comportamiento (git status --porcelain app/ lib/ supabase/ vacío)"
  - "Fechas fijas en 2031 (no relativas al reloj): las rutas NO aceptan un todayStr inyectable, así que el corte lo pone el reloj real y el test tiene que ser estable en cualquier fecha de ejecución"
  - "resetTenant() en beforeEach en vez de re-sembrar el tenant entero: la baja escribe, y cada caso necesita el abono en 'active' con sus 4 turnos futuros vivos"
  - "El bloque de la vía pública cuenta el aviso al dueño (D-13) y el del panel asierta que NO sale: el mismo spy prueba las dos mitades del contrato"

requirements-completed: [ABONO-04, ABONO-05]

# Metrics
duration: ~55min (incluye el stall del ejecutor original)
completed: 2026-07-22
status: complete
---

# Phase 7 Plan 12: Cobertura a nivel RUTA de las dos vías de baja + gate de la tanda Summary

**El invariante estrella de la fase deja de depender de la lectura del código: dos POST simultáneos sobre el mismo `cancel_token`, ejercitados contra Postgres de verdad, producen exactamente UN mail al cliente y UN aviso al dueño — y una baja del panel no toca ni una fila del otro negocio.**

## Performance

- **Duration:** ~55 min de reloj (el ejecutor original se colgó en el watchdog del harness al entrar a Task 3; ver Deviations)
- **Completed:** 2026-07-22
- **Tasks:** 3 (Tasks 1 y 2 escritas y commiteadas por el ejecutor original; Task 3 corrida por el orquestador sobre el estado ya commiteado)
- **Files created:** 1 (540 líneas)

## Accomplishments

- **WR-08 cerrado.** Existe `test/abono-cancel-routes.test.ts` con **16 casos** que importan los dos handlers reales (`app/api/abonos/cancel/[token]/route.ts` y `app/api/abonos/cancel/route.ts`) y los invocan contra el Supabase LOCAL. Hasta ahora la suite cubría el motor (`test/abono-cancel.test.ts`, `lib/abono-cancel.test.ts`) y los templates (`test/abono-cancel-email.test.ts`), pero **ningún** test tocaba las rutas.
- **La carrera es real, no simulada.** `Promise.all([POST(token), POST(token)])` sobre el MISMO token: exactamente una respuesta trae `ok: true` y la otra `reason: 'already_cancelled'`, `sendAbonoCancelledEmail` sale 1 vez y `sendAbonoCancelledAdminNotification` 1 vez, y en la base no queda ningún turno futuro de la serie vivo. Lo que serializa las dos requests es el gate atómico `.neq('status','cancelled')` del UPDATE — un doble del cliente Supabase no podría probar nada de eso.
- **El `after()` de Next 16 quedó testeable.** Después del Plan 07-09 los dos mails salen dentro de `after()`, que necesita un request scope que no existe al invocar el handler desde Vitest. El archivo mockea `next/server` **parcialmente** (`importOriginal`, todos los exports reales) y reemplaza sólo `after` por un ejecutor que corre el callback y guarda su promesa; `flushAfter()` las drena antes de asertar. Sin ese mock el handler tira al llegar a `after()` y el test no probaría nada.
- **D-22 verificado como indistinguibilidad, no como buena intención.** El token inexistente y el token con formato inválido devuelven el **mismo** status y el **mismo** cuerpo (el test compara las dos respuestas entre sí, no contra un literal), y ninguno es un 500. Lo mismo del lado del panel: `abonoId` ajeno y `abonoId` fantasma dan el mismo 404.
- **D-24 verificado con conteos antes/después.** El caso del `abonoId` de otro negocio no se conforma con el 404: mide los turnos vivos y el `status` del OTRO tenant antes de la llamada y vuelve a medirlos después, y exige `cancelledFutureCount(other) === 0`. Hay además un caso que hace una baja **válida** del propio tenant y comprueba que la serie del otro negocio siguió igual.
- **D-13 verificado en las dos direcciones.** El bloque público asierta que el aviso al dueño salió 1 vez; el bloque del panel asierta `not.toHaveBeenCalled()` sobre el mismo spy.
- **Guard anti-falso-verde.** Antes de correr las aserciones de la vía panel se exige que el cliente tenga `access_token` de sesión anon, y se aborta si `NEXT_PUBLIC_SUPABASE_ANON_KEY === SUPABASE_SERVICE_ROLE_KEY`. Un verde obtenido con service-role no probaría nada sobre autorización.
- **Suite completa verde: 723 passed / 1 skipped, 55 archivos.** Delta exacto contra el baseline de 07-11 (707 / 54): +1 archivo, +16 casos.

## Task Commits

1. **Tasks 1 y 2 — vía pública por token + vía panel autenticada** — `d2bb167` (`test(07-12): cobertura a nivel RUTA de las dos vias de baja del abono (WR-08)`)
2. **Task 3 — gate de la tanda** — sin commit de código: es verificación pura. Los resultados están abajo. Este SUMMARY es el entregable de la tarea.

## Files Created/Modified

- `test/abono-cancel-routes.test.ts` (**nuevo**, 540 líneas) — cabecera doctrinal que declara qué prueba y qué NO (y dónde vive lo que no prueba); mocks de `next/server` (parcial), `@/lib/supabase/admin` (factory con service-role real), `@/lib/supabase/server` (cliente intercambiable por caso), `@/lib/email` (spies) y `@/lib/business-secrets`; helpers de siembra (`seedClient`, `seedAbono`, `seedSeriesAppointments`) y de conteo (`liveFutureCount`, `cancelledFutureCount`, `statusOf`, `resetTenant`); dos bloques `describe.skipIf(!hasSupabaseCreds)`.

### Los 16 casos

**Bloque 1 — `POST /api/abonos/cancel/[token]`, vía pública (ABONO-04), 7 casos**

| # | Invariante | Decisión |
|---|---|---|
| 1 | Carrera: dos POST sobre el mismo token → 1 mail al cliente + 1 aviso al dueño, una sola respuesta `ok`, 0 turnos futuros vivos, serie en `cancelled` | D-14 / T-07-15 |
| 2 | El `cancelledCount` de la respuesta ganadora == turnos que realmente pasaron a `cancelled`; `lastDate` == última fecha de la serie | D-03 / D-11 |
| 3 | Reintento → `already_cancelled` y los dos spies siguen en 1 | D-05 |
| 4 | Serie ya cancelada ANTES de la request → `already_cancelled` sin ningún mail | D-05 / D-14 |
| 5 | Token uuid inexistente → 404 `not_found`, sin mails, sin tocar la serie viva | D-22 |
| 6 | Token con formato inválido → status y cuerpo IDÉNTICOS al del inexistente, y no es 500 | D-22 / T-07-13 |
| 7 | Token vacío → 400 `invalid`, sin tocar la base | — |

**Bloque 2 — `POST /api/abonos/cancel`, vía panel (ABONO-05), 9 casos**

| # | Invariante | Decisión |
|---|---|---|
| 1 | Sin sesión → 401 `unauthorized`, serie en `active` y turnos futuros intactos | D-23 |
| 2 | Body que no es JSON → 400 `bad_request` | — |
| 3 | Body sin `abonoId` → 400 `missing_fields` | — |
| 4 | `abonoId` de OTRO negocio → 404 `not_found` **y** el otro negocio exactamente como estaba (conteos antes/después + `cancelledFutureCount === 0`) | D-24 |
| 5 | `abonoId` inexistente → mismo status y mismo cuerpo que el ajeno | D-22 |
| 6 | Baja válida → 200, `alreadyCancelled: false`, conteo == efecto real en la base, 1 mail al cliente | D-03 / D-11 |
| 7 | La vía panel NO le manda el aviso al dueño | D-13 |
| 8 | Reintento → 200 `alreadyCancelled: true`, `cancelledCount: 0`, sin mail nuevo | D-05 |
| 9 | Una baja válida del propio tenant no alcanza los turnos del otro negocio | D-24 |

## Gate de la tanda (Task 3)

Corrido sobre el estado ya commiteado (`d2bb167`), con los **binarios locales** (`./node_modules/.bin/…`), nunca con `npx`:

| Verificación | Comando | Resultado |
|---|---|---|
| Tipos | `./node_modules/.bin/tsc --noEmit` | **exit 0** |
| Lint del archivo nuevo | `./node_modules/.bin/eslint test/abono-cancel-routes.test.ts` | **exit 0** |
| Suite completa | `./node_modules/.bin/vitest run --no-file-parallelism` | **exit 0 — 55 archivos, 723 passed \| 1 skipped (724)** |
| Archivo nuevo aislado | `./node_modules/.bin/vitest run test/abono-cancel-routes.test.ts --no-file-parallelism` | **exit 0 — 16 passed (16)**, ~72 s |
| Build | `npm run build` | **exit 0**, todas las rutas compiladas |
| Producción intacta | `git status --porcelain app/ lib/ supabase/` | vacío |
| Dependencias intactas (T-07-SC) | `git status --porcelain package.json package-lock.json` | vacío |

**Baseline de tests:**

| Métrica | Baseline 07-06 | 07-09 | 07-11 | **Después de 07-12** |
|---|---|---|---|---|
| Tests verdes | 694 / 1 skip | 707 / 1 skip | 707 / 1 skip | **723 / 1 skip** |
| Archivos de test | 53 | 54 | 54 | **55** |

Delta = +1 archivo y +16 casos: exactamente los del archivo nuevo, ni uno más. El criterio del plan (≥ 700) se cumple con holgura; el 683 de `deferred-items.md` era el baseline previo a toda la tanda.

**Las cuatro rutas de `app/api/abonos/` siguen separadas.** Verificado en disco: `cancel/route.ts`, `cancel/[token]/route.ts`, `create/route.ts` y `cancel-link/[id]/route.ts` son cuatro archivos distintos, y el segmento dinámico nuevo cuelga de `cancel-link/`, no de `abonos/` (decisión del Plan 07-10, tomada justamente para no volverse hermano dinámico de `cancel/` y `create/`). El build salió 0 con todas las rutas compiladas.

## Auditoría de cobertura — los 15 hallazgos del review

| ID | Hallazgo | Plan | Archivo del arreglo | Evidencia |
|---|---|---|---|---|
| **CR-01** | El fallo parcial deja turnos vivos y el reintento miente "éxito" | **07-06** | `lib/abono-cancel.ts` | Barrido de reparación idempotente en la rama `alreadyCancelled`; casos nuevos en `lib/abono-cancel.test.ts` y `test/abono-cancel.test.ts` (un reintento sobre una serie a medias deja 0 turnos futuros vivos). Commit del plan 07-06. |
| **WR-01** | La pantalla pública descarta el `cancelledCount` del servidor | **07-09** | `app/abono/cancelar/[token]/abono-cancel-client.tsx` | Estado `result` con la respuesta del servidor + `already_cancelled` fuerza conteo 0. Commit `10a08d8`. |
| **WR-02** | Inyección de HTML en los dos mails nuevos | **07-07** | `lib/email.ts`, `app/api/booking/create/route.ts` | `esc()` en todo valor dinámico de los templates de baja + `renderEmailHeader`; `clientName` acotado a 120 chars en la superficie anónima; casos nuevos en `test/abono-cancel-email.test.ts`. |
| **WR-03** | `abonos.cancel_token` sin índice único | **07-08** | `supabase/migrations/056_abonos_cancel_token_unique.sql`, `supabase/schema.sql` | Migración 056 con bloque `DO $$` de verificación previa de duplicados; validada dos veces contra el baseline replayable local. Commits `b5a3886`, `f20fd82`. |
| **WR-04** | `previewAbonoCancellation` se traga el error y devuelve 0 | **07-06** (motor) + **07-09** (UI) | `lib/abono-cancel.ts`, `app/abono/cancelar/[token]/{page,abono-cancel-client}.tsx` | Flag `AbonoCancelSummary.unknown` + consumo end-to-end: la pantalla DICE que no se pudo calcular en vez de ocultar el aviso previo. Commit `681730f`. |
| **WR-05** | Las dos vías justifican lo contrario sobre `after()`; la pública sin timeout | **07-07** (timeout) + **07-09** (`after()`) | `lib/email.ts`, `app/api/abonos/cancel/[token]/route.ts` | `AbortSignal.timeout(10_000)` en `resendSend`; los dos mails de la vía pública dentro de un solo `after()`. Commit `8c8cc02`. Y ahora, **verificado a nivel ruta**: los casos de este plan drenan `after()` y cuentan los envíos. |
| **WR-06** | El preview del panel sin filtro de fecha ni límite | **07-10** | `app/(dashboard)/abonos/page.tsx` | `count: 'exact'` + `limit(1)` por serie y preview acotado con `gte('date', cutoff)` en la base. Commit `2856984`. |
| **WR-07** | Todos los `cancel_token` viajan al browser en cada carga | **07-10** | `app/api/abonos/cancel-link/[id]/route.ts`, `app/(dashboard)/abonos/{page,abonos-client}.tsx` | Endpoint autenticado que devuelve la URL armada (no el token) on-demand; `cancel_token` fuera del select y del tipo `AbonoRow`. Commits `bbf783a`, `2856984`, `d17d1e0`. |
| **WR-08** | No hay ni un test a nivel de RUTA | **07-12 (este plan)** | `test/abono-cancel-routes.test.ts` | 16 casos, `16 passed` en aislado y `723 passed` en la suite completa. Carrera real con `Promise.all` + `toHaveBeenCalledTimes(1)` sobre los dos spies. Commit `d2bb167`. |
| **WR-09** | El Test 5 de los mails asegura una cobertura que no tiene | **07-07** | `test/abono-cancel-email.test.ts` | Helper `payloadAt(fetchMock, i)`: el caso `undefined` y el `null` se asiertan por índice, ya no sólo `calls[0]`. |
| **IN-01** | `DAY_LABELS` duplicado en 4 archivos con fallbacks divergentes | **07-06** (fuente) + **07-09** y **07-11** (adopción) | `lib/abono-cancel.ts`, las 4 superficies | `abonoDayLabel(dow)` exportado y consumido por los 4 callers; fallback único `'los días'`. Commits `8c8cc02`, `a83440f`. |
| **IN-02** | `fmtDate` / `toISODate` duplicados | **07-06** (fuente) + **07-11** (adopción) | `lib/abono-cancel.ts`, `app/api/abonos/create/route.ts`, `app/api/cron/cancel-expired/route.ts` | `grep -rlE "^function toISODate\(" app/ lib/` sin resultados. La copia de `fmtDate` del client component público queda a propósito y **documentada** (evitar el locale de date-fns en el bundle) — Plan 07-09. Commits `a83440f`, `2054864`. |
| **IN-03** | `console.log` con el email del destinatario (PII) | **07-07** | `lib/email.ts` | Los dos templates de baja loguean con prefijo `[abonos/cancel]` y sin dirección. **Parcial declarado:** los 8 `console.log(...${to})` de los templates VIEJOS quedan como deuda pre-existente fuera del alcance del review (decisión registrada en 07-07). |
| **IN-04** | La página pública de baja no declara `noindex` | **07-09** | `app/abono/cancelar/[token]/page.tsx` | `robots: { index: false, follow: false }` en la metadata. Commit `681730f`. **Parcial declarado:** la ruta hermana `/cancelar/[token]` sigue sin `robots` (ver Deuda). |
| **IN-05** | Texto blanco sobre el color primario del negocio | **07-09** | `lib/contrast.ts`, `app/abono/cancelar/[token]/abono-cancel-client.tsx` | `onAccentText(hex)` por luminancia WCAG + foco visible anclado a tokens del design system; `lib/contrast.test.ts`. Commit `681730f`. |

**15 filas, 15 con evidencia.** Ninguna queda cerrada por confianza. Los dos parciales (IN-03 e IN-04) están declarados como tales acá y en el SUMMARY del plan que los tocó: lo que el review pedía se cerró; lo que queda es superficie pre-existente que el review no señalaba.

## Deuda anotada por la tanda (sigue abierta)

1. **`/cancelar/[token]` (turno suelto) sin `noindex`** — mismo hueco que IN-04 en la ruta hermana, que está viva en producción y esta fase no modifica (D-10). Candidata a un fix propio. *(Plan 07-09)*
2. **Vista agregada para `/abonos`** — hoy el panel dispara una query por serie (T-07-49, disposición `accept`). Si algún negocio llegara a cientos de series, la evolución es una vista o RPC que devuelva `abono_id, count, max(date)` en un viaje. Ningún tenant está cerca de ese volumen. *(Plan 07-10)*
3. **`console.log` con PII en los 8 templates viejos de `lib/email.ts`** — deuda pre-existente; su HTML tampoco pasa por `esc()` (sólo el header compartido). Candidato a plan propio de endurecimiento del módulo de mails. *(Plan 07-07)*
4. **`onAccentText` sobre acentos de luminancia intermedia** no alcanza 4.5:1 con ninguno de los dos candidatos; la solución completa exige validar `primary_color` en el panel del dueño, otra superficie. *(Plan 07-09)*
5. **Verificación manual pendiente del Plan 07-10** (paso 4/5 de su `<verification>`: requiere `npm run dev` + sesión de prueba para el botón "Copiar link de baja").
6. **Deploy:** prod está en la migración **054**. Al deployar, a mano y en orden: `055_abono_window_bounds.sql` → `056_abonos_cancel_token_unique.sql` → `NOTIFY pgrst, 'reload schema'`. Pre-check hecho (2026-07-21): 0 `cancel_token` duplicados en prod.

## Deviations from Plan

### 1. [Entorno] El ejecutor original se colgó en el watchdog del harness al entrar a Task 3

- **Found during:** Task 3
- **Issue:** el agente que escribió Tasks 1 y 2 las commiteó (`d2bb167`) y después quedó 600 s sin progreso al arrancar el gate de la tanda. Fue un **stall de entorno**, no un defecto del código: el árbol quedó limpio y el commit íntegro.
- **Fix:** el orquestador corrió el gate completo de Task 3 **externamente, sobre el estado ya commiteado** (tipos, lint, suite completa, archivo aislado, build — todos exit 0, números arriba), y este agente de continuación escribió el cierre. **No se re-hizo ni se re-escribió ninguna implementación**, y no se volvió a correr la suite completa ni el build desde este agente para no reproducir el stall.
- **Verification:** `git log` muestra un solo commit de código para el plan; `git status --porcelain` vacío antes y después de las comprobaciones de este agente (que fueron sólo greps de lectura).
- **Committed in:** n/a

### 2. [Rule 3 - Blocking] `npx tsc` prohibido en este árbol (misma deviación que 07-09 y 07-11)

- **Found during:** Task 3
- **Issue:** los bloques `<automated>` del plan usan `npx tsc --noEmit`, `npx vitest` y `npx eslint`. `npx tsc` resuelve un paquete homónimo del registro que produce un FALSO VERDE.
- **Fix:** todo el gate se corrió con `./node_modules/.bin/tsc`, `./node_modules/.bin/vitest` y `./node_modules/.bin/eslint`.
- **Committed in:** n/a

---

**Total deviations:** 2, ambas de entorno de verificación. Ninguna cambia el alcance ni el comportamiento entregado.

## Criterios de aceptación — estado honesto

Verificados por grep sobre el archivo commiteado:

| Criterio | Exigido | Medido |
|---|---|---|
| Casos totales | ≥ 14 | **16** (`grep -c "it("`) |
| Casos del bloque público | ≥ 6 | **7** |
| Carrera real | `Promise.all([` ≥ 1 | **4** |
| Mock parcial de `after` | `importOriginal\|vi.importActual` ≥ 1 | **3** |
| Skip graceful | `describe.skipIf(!hasSupabaseCreds)` ≥ 1 | **3** |
| Teardown | `teardownOneTenant` ≥ 1 | **4** |
| Guard anti-falso-verde | `access_token` ≥ 1 | **2** |
| Dos tenants sembrados | `seedOneTenant(` ≥ 2 | **3** |
| Caso de tenant ajeno con conteos antes/después | existe | **sí** (bloque 2, caso 4: `liveAntes` / `statusAntes` vs. post-llamada + `cancelledFutureCount === 0`) |
| `not.toHaveBeenCalled()` sobre el aviso al dueño | existe | **sí** (bloque 2, casos 7 y 8) |
| Producción sin modificar | vacío | **vacío** |

**Criterio NO evidenciado — prueba de mutación.** El plan pedía comprobar que, comentando el gate `.neq('status','cancelled')` del UPDATE de `abonos` en `lib/abono-cancel.ts`, el caso de la carrera FALLA, y dejarlo anotado acá. El ejecutor original **no dejó registro** de haberla corrido (ni en el cuerpo del commit ni en ninguna nota), y este agente de continuación **no la corrió**: exige editar un archivo de producción y volver a correr la suite, que es exactamente lo que causó el stall. Se reporta como **pendiente**, no como cumplido. El razonamiento que la sostiene sigue en pie —sin el gate atómico las dos requests entrarían las dos a la rama ganadora y saldrían 2 mails— pero es razonamiento, no evidencia. Si `/gsd:secure-phase` quiere cerrar T-07-55 con prueba de mutación, ése es el paso que falta.

**Matiz sobre el lint.** El gate corrió `eslint` sobre el archivo nuevo (exit 0). Los demás archivos de la tanda (07-06..07-11) fueron linteados con exit 0 en sus propios planes, según sus SUMMARY; no se re-lintearon acá.

## Prohibiciones verificadas

- **Cero archivos de producción tocados:** `git status --porcelain app/ lib/ supabase/` vacío. Este plan es cobertura pura.
- **Ninguna aserción existente relajada:** `test/abono-cancel.test.ts` y `test/abono-cancel-email.test.ts` no aparecen en el diff de `d2bb167` (el commit crea un solo archivo).
- **Cero crons, cero migraciones, cero dependencias (T-07-SC):** `package.json`, `package-lock.json` y `vercel.json` intactos.
- **`07-01..07-05-PLAN.md` no se tocaron.**
- **Ningún archivo borrado:** `git diff --diff-filter=D` sin resultados en `d2bb167`.

## Threat Flags

Ninguna superficie de seguridad nueva: el plan sólo agrega un archivo de test. El registro del plan queda así:

| Threat | Estado |
|---|---|
| T-07-55 (anti-avalancha verificado sólo por lectura) | **mitigada parcialmente**: hay test de carrera real con 1+1 mails asertados. La prueba de mutación que el plan pedía como refuerzo NO se corrió (ver arriba) |
| T-07-56 (baja por panel alcanzando otro tenant) | mitigada: dos tenants sembrados, 404 + conteos antes/después + `cancelledFutureCount(other) === 0` |
| T-07-57 (el 404 revelando si la serie existe) | mitigada: los casos comparan las dos respuestas ENTRE SÍ, en las dos vías |
| T-07-58 (verde falso por service-role) | mitigada: guard de `access_token` + guard de anon-key ≠ service-role |
| T-07-59 (credenciales de Supabase en el entorno de test) | accept: `describe.skipIf(!hasSupabaseCreds)`, DB local, `teardownOneTenant` |
| T-07-60 (el mock de `after` ocultando un bug real) | accept: el mock reemplaza SÓLO `after`; el comportamiento en el runtime de Vercel lo cubre el checkpoint 07-05 y la verificación en staging |
| T-07-SC (dependencias) | mitigada: `package.json` / `package-lock.json` intactos |

## Issues Encountered

- El stall del ejecutor original (deviación 1). Ningún test falló por assertion. El worker intermitente de vitest que registró el Plan 07-11 no volvió a aparecer en esta corrida (`55 passed (55)` a la primera).

## User Setup Required

None — sin configuración externa, sin migración nueva y sin variable de entorno. (La deuda de deploy de las migraciones 055/056 viene de los planes 07-08 y previos, no de éste.)

## Next Phase Readiness

- **`/gsd:secure-phase 07`** puede cerrar T-07-55..T-07-58 con tests ejecutables, no con lectura de código. Lo único que le falta a T-07-55 es la prueba de mutación.
- **`/gsd:verify-work`** tiene la tabla de los 15 hallazgos con plan, archivo y evidencia para auditar el cierre del review de punta a punta.
- **Deploy:** bloqueado sólo por las migraciones 055 → 056 a mano, que ya estaban anotadas antes de este plan.
- Sin bloqueantes de código.

## Self-Check: PASSED

- Archivo verificado en disco: `test/abono-cancel-routes.test.ts` — presente, 540 líneas, 16 `it(`.
- Commit verificado en `git log`: `d2bb167` — presente.
- Las cuatro rutas de `app/api/abonos/` verificadas en disco como archivos separados.
- `git status --porcelain app/ lib/ supabase/ package.json package-lock.json` — vacío.

---
*Phase: 07-cancelaci-n-del-abono-mail-panel*
*Completed: 2026-07-22*
