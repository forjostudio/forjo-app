---
phase: quick-261124-ubl
plan: "01"
subsystem: panel / app/api (resolución del negocio del dueño)
tags: [multi-tenant, negocioDelDueno, gates, mercadopago, owner_id]
status: complete
requires: [quick-261124-neg (lib/negocio-del-dueno.ts), quick-261124-obs (molde del callback de MP)]
provides:
  - 18 rutas de app/api + 3 server actions de /web con negocioDelDueno
  - disconnect de MP acotado por id + owner_id
  - gate A extendido a app/api (helper + single + lectura por owner_id) y gate B de mutaciones sobre businesses
  - prueba db de un dueño con dos negocios
affects: [app/api/**, app/(dashboard)/web/_landing-actions.ts, test/panel-negocio-gate.test.ts]
tech-stack:
  added: []
  patterns: ["negocioDelDueno en APIs (nunca negocioDelPanel)", "escáner de cadenas con paréntesis balanceados + stripper léxico de comentarios"]
key-files:
  created: [test/dueno-con-dos-negocios.test.ts]
  modified:
    - test/panel-negocio-gate.test.ts
    - test/oauth-return-routes.test.ts
    - app/api/mercadopago/disconnect/route.ts
    - app/api/{abonos/cancel,abonos/create,appointments/cleanup-expired,appointments/create,appointments/delete,clients/create,export/clients,export/finances,google/callback,google/disconnect,google/sync,import/clients/confirm,import/clients/preview,notify/cancel,subscription/cancel,subscription/create,subscription/status}/route.ts
    - app/(dashboard)/web/_landing-actions.ts
decisions:
  - "Gate B/A usan un stripper léxico de comentarios (sinComentariosLexico) en vez del sinComentarios por regex: éste perdía 4 de 12 cadenas de settings-client.tsx"
  - "Error de lectura: 500 read_failed en rutas { ok, error }; texto en castellano en subscription/*; server_error en /web; fail() en el callback de Google (DC-1..DC-4 tal cual)"
metrics:
  duration: ~16 min
  completed: 2026-11-24
actuals:
  tokens: 17815
  tasks: 3
  commits: 7
plan_head_before: 36d3ae9a8adf8a9d6d501bedd6ec9efd20799467
commits: 7
---

# Quick 261124-ubl: dueños con dos o más negocios — rutas del panel sobre el negocio que ve

Las 18 rutas de app/api y las 3 server actions de /web resuelven el negocio con `negocioDelDueno` (el más viejo, el mismo que muestra el panel). El UPDATE de `mp_user_id` del disconnect de MP pasó a `.eq('id', biz.id).eq('owner_id', user.id)`. Dos gates impiden volver atrás.

## En criollo

Antes, un dueño con dos negocios entraba al panel pero casi cualquier botón (crear cliente, turno, abono, exportar, conectar Google, suscripción, guardar la web) respondía "no encontrado". La causa: cada ruta buscaba "el negocio de este dueño" esperando exactamente uno. Además, "Desconectar MercadoPago" le desconectaba **los dos** negocios. Ahora todas las rutas eligen el mismo negocio que el panel muestra, y la desconexión toca sólo ese.

## Commits

| # | Hash | Tipo | Qué |
|---|------|------|-----|
| 1 | 718d59c | test (RED) | gate B + escáner + db con dos negocios (disconnect) |
| 2 | 91603ec | fix | disconnect de MP con helper + update por id |
| 3 | 2284cb6 | test (RED) | gate A extendido a app/api + chequeo de lectura; db clients/create; fake de Google sin single |
| 4 | 4fbc092 | fix | las 17 rutas al helper |
| 5 | f90cd27 | test (RED) | gate A sin la excepción de `_landing-actions.ts` |
| 6 | 801964e | fix | las 3 server actions de /web al helper |
| 7 | 26410f5 | test | sacar el `sinComentarios` por regex que quedó sin uso (warning de eslint) |

## ROJOS (antes de cada arreglo)

**Task 1, gate B** (`vitest run --project pure test/panel-negocio-gate.test.ts`), fixtures y anclas en verde. Sólo falla el barrido:
```
× mutación sobre businesses por owner_id sin id
+   "app/api/mercadopago/disconnect/route.ts",
Tests  1 failed | 30 passed (31)
```
**Task 1, db** (`vitest run --project db test/dueno-con-dos-negocios.test.ts`). Rojo de verdad, no skip:
```
× POST /api/mercadopago/disconnect desconecta sólo el más viejo
AssertionError: expected 404 to be 200
Tests  1 failed (1)
```
**Task 2, pure** (gate + oauth-return-routes): 10 fallas. Los tres chequeos del gate A (helper, single, lectura) nombran **exactamente las mismas 17 rutas**: 51 líneas, 17 rutas × 3. El callback de Google falla con `TypeError: supabase.from(...).select(...).eq(...).single is not a function` (4 casos viejos + 3 nuevos), porque el fake ya no expone `single`.
```
Tests  10 failed | 55 passed (65)
```
**Task 2, db**:
```
× POST /api/clients/create da de alta el cliente en el más viejo
AssertionError: expected 404 to be 200
Tests  1 failed | 1 passed (2)
```
**Task 3, gate**: los tres chequeos nombran sólo `app/(dashboard)/web/_landing-actions.ts`:
```
× el barrido ve los archivos esperados y cada uno usa el helper
× ningún archivo vuelve a `.eq(owner_id).single()`
× ninguna lectura propia por owner_id
+   "app/(dashboard)/web/_landing-actions.ts",   (×3)
Tests  3 failed | 30 passed (33)
```

## Respuestas por ruta

| Ruta | Sin negocio (igual que hoy) | Error de lectura (nuevo) |
|------|------------------------------|--------------------------|
| abonos/cancel, abonos/create, appointments/create, clients/create, export/clients, export/finances, import/clients/confirm, import/clients/preview | 404 `{ ok:false, error:'not_found' }` | 500 `{ ok:false, error:'read_failed' }` |
| appointments/delete | 403 `no_business` | 500 `read_failed` |
| appointments/cleanup-expired, notify/cancel | 403 `{ ok:false, error:'Sin negocio' }` | 500 `read_failed` |
| google/disconnect, mercadopago/disconnect | 404 `{ ok:false }` | 500 `{ ok:false, error:'read_failed' }` |
| google/sync | 400 `not_connected` | 500 `read_failed` |
| google/callback | `fail()` → `?google=error` | `fail()` |
| subscription/cancel, create, status | 404 `{ error:'Negocio no encontrado' }` | 500 `{ error:'No pudimos leer tu negocio. Probá de nuevo.' }` |
| _landing-actions (3 actions) | `{ ok:false, error:'no_business' }` | `{ ok:false, error:'server_error' }` |

Consumidores (DC-1): un grep sobre app/, components/ y lib/ no encontró ningún cliente que se ramifique por 404/403/400 ni por `not_found`/`no_business`/`Sin negocio`/`not_connected` de estas rutas. Los dos `reason === 'not_found'` que aparecen son de las rutas públicas por token (`/cancelar/[token]`, `/abono/cancelar/[token]`), que no se tocaron. `web-client.tsx` ya traduce `server_error` (`ACTION_ERROR_COPY.server_error`). No hubo que mantener ninguna respuesta vieja.

## Relevamiento D-02 / D-03 / D-04

- **D-02:** el gate B barre todas las cadenas `.from('businesses')` de app/, lib/, components/ y scripts/. Antes del arreglo encontró **una sola** mutación por owner_id sin id: la del disconnect, que coincide con el relevamiento del plan. Hoy encuentra cero.
- **D-03:** settings-client (y agenda/abonos/categorias) no resuelve el negocio. Sus 12 updates sobre businesses van por `.eq('id', business.id)` (ancla ≥10 del gate B). No se tocó.
- **D-04:** el diff `718d59c^..HEAD` está vacío sobre package.json, el lockfile, supabase/, next.config.ts, lib/negocio-del-dueno.ts, lib/onboarding-alta.ts, lib/overlay-history.ts, lib/dirty-history.ts, scripts/con-turno.mjs, app/(onboarding), app/api/payment, app/api/subscription/webhook, app/api/onboarding, app/[slug] y lib/booking-core.ts. cancel-link queda como la única excepción de lectura (DC-6). Su vigencia la controla un test que exige que siga teniendo la cadena con `order('created_at')` y `limit(2)`.

## Evidencia (D-07)

- `./node_modules/.bin/tsc --noEmit`: exit 0 en el baseline, después de Task 2, después de Task 3 y después del último commit.
- `npm test` (corrido a las 22:11 AR, dentro de la ventana de los canarios de reloj): exit 0. `Test Files 126 passed (126)`, `Tests 2527 passed | 4 expected fail | 1 skipped`. Con el reporter verbose: el carril db corrió 323 tests en 37 archivos. `dueno-con-dos-negocios` pasó sus 2 casos, sin skip. El único skip es `isolation.test.ts > upload-gate` (Storage local apagado, `RUN_STORAGE_TESTS`), que ya se saltaba antes.
- Suites db que importan las rutas migradas (abono-create, abono-cancel-routes, manual-booking, clients-import, manual-client + la nueva): 6 archivos, 75 tests verdes.
- eslint sobre los 21 archivos del baseline + el test nuevo: el baseline salió limpio y el final también, con 0 problemas. Hubo un warning intermedio (`sinComentarios` sin uso) que se arregló en 26410f5.
- `npm run build`: exit 0.

## Desvíos del plan

**1. [Rule 1 - Bug] El stripper de comentarios del gate hacía que el escáner viera de menos**
- **Dónde apareció:** Task 1, en el ancla "settings-client ≥10 mutaciones", que dio 8.
- **Problema:** el `sinComentarios` por regex (copiado de forms-no-get-leak) aplica primero la regex de bloque. El comentario de línea `// … /api/google/* …` de settings-client.tsx:2361 abría un "bloque" que se comía el código hasta el siguiente `*/`, y se perdían 4 de las 12 cadenas. Es la trampa de "verde midiendo de menos" que DC-7 quería evitar.
- **Arreglo:** `sinComentariosLexico`, que recorre el fuente una sola vez, sabe cuándo está dentro de un string y corta los strings de comilla simple o doble en el salto de línea. Se usa en el gate B, en el chequeo nuevo de lectura y también en el chequeo de single y en el de "usa el helper" del gate A. Tiene su fixture: un comentario de línea con `/*` antes de la cadena sigue dando positivo. La función vieja quedó sin uso y se sacó (26410f5). `test/forms-no-get-leak.test.ts` no se tocó y conserva su propia copia.
- **Commits:** 718d59c, 2284cb6, 26410f5.

**2. [Rule 1] El chequeo "usa el helper" cortaba en el primer faltante**
- Era un loop de `expect`, así que el rojo nombraba sólo abonos/cancel. Se cambió para juntar la lista completa, y así el rojo de la Task 2 nombró las 17 como pedía el plan. Commit 2284cb6.

## Riesgos aceptados / residuales

- **T-ubl-05 (DC-5):** si dos negocios del mismo dueño tuvieran el mismo `created_at`, el orden quedaría librado al plan de ejecución. El helper no desempata por id. Con DEFAULT now() la app no puede producir ese empate. Se acepta.
- **Límite de los gates:** una cadena armada en varias sentencias (`let q = …; q = q.eq(…)`) no se detecta. Está documentado en la cabecera del gate B.
- **Límite de `sinComentariosLexico`:** un apóstrofo suelto en texto JSX puede desordenar, como mucho, esa línea, porque el string se corta en el salto. No apareció ningún caso en el barrido actual.
- **Sin UAT visual:** nada de esto se probó en el navegador con un dueño real de dos negocios. La cobertura es la prueba db (disconnect + alta de cliente) más los gates estáticos para el resto de las rutas. Las otras 15 rutas no tienen una prueba db propia con dos negocios.
- No se pusheó.

## Threat Flags

Ninguno nuevo. No hay superficie fuera del threat_model: no se agregaron endpoints ni service role, y las respuestas de error usan códigos fijos.

## Self-Check: PASSED

- test/dueno-con-dos-negocios.test.ts: FOUND
- Commits 718d59c, 91603ec, 2284cb6, 4fbc092, f90cd27, 801964e, 26410f5: FOUND (`git log 36d3ae9..HEAD` = 7)
